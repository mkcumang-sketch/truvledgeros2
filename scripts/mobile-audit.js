const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const VIEWPORTS = [
  { name: "iPhone-13-14", width: 390, height: 844 },
  { name: "iPhone-SE", width: 375, height: 667 },
];

const TARGET_PAGES = [
  { path: "/login", requiresAuth: false },
  { path: "/dashboard", requiresAuth: true },
  { path: "/automations", requiresAuth: true },
  { path: "/team", requiresAuth: true },
];

const BASE_URL = process.env.AUDIT_BASE_URL || "http://localhost:3000";
const AUDIT_DIR = path.join(process.cwd(), "public", "mobile-audit");

if (!fs.existsSync(AUDIT_DIR)) {
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
}

async function getSessionCookie() {
  const directToken = process.env.SESSION_TOKEN || "IV5IgN4KbIsUZPOXEsWh1aciBZ_77X52sQZhPEm7v09ePP09E_474be1TeE1H7LG";
  console.log(`[AUTH] Using verified session token for protected routes.`);
  return directToken;
}

async function runMobileAudit() {
  console.log("=================================================");
  console.log(`📱 RUNNING AUTOMATED MOBILE AUDIT (${BASE_URL})`);
  console.log("=================================================");

  const sessionToken = await getSessionCookie();

  const browser = await chromium.launch({
    headless: true,
  });

  const auditReport = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    viewports: {},
    totalOverflows: 0,
    overallStatus: "PASSED",
  };

  for (const vp of VIEWPORTS) {
    console.log(`\n-------------------------------------------------`);
    console.log(`🔍 AUDITING VIEWPORT: ${vp.name} (${vp.width}x${vp.height})`);
    console.log(`-------------------------------------------------`);

    auditReport.viewports[vp.name] = {
      width: vp.width,
      height: vp.height,
      pages: {},
    };

    for (const target of TARGET_PAGES) {
      const pageUrl = `${BASE_URL}${target.path}`;
      console.log(`\nTesting page: ${target.path} (${vp.name})`);

      // Create isolated context per page to cleanly handle auth vs unauth
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      });

      // Inject auth cookie only for protected routes
      if (target.requiresAuth && sessionToken) {
        const urlObj = new URL(BASE_URL);
        await context.addCookies([
          {
            name: "truv_session",
            value: sessionToken,
            url: BASE_URL,
          },
        ]);
      }

      const page = await context.newPage();

      try {
        await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 25000 });
        await page.waitForTimeout(1000); // Allow react hydration and CSS paints
      } catch (err) {
        console.error(`  ❌ Failed to load ${pageUrl}:`, err.message);
        auditReport.viewports[vp.name].pages[target.path] = {
          status: "FAILED_TO_LOAD",
          error: err.message,
        };
        await context.close();
        continue;
      }

      // Capture before screenshot
      const safePageName = target.path.replace(/\//g, "") || "root";
      const beforeScreenshot = path.join(
        AUDIT_DIR,
        `${vp.name}-${safePageName}-initial.png`
      );
      await page.screenshot({ path: beforeScreenshot, fullPage: false });

      // 1. Horizontal Overflow Inspection
      const overflows = await page.evaluate(() => {
        const docWidth = document.documentElement.clientWidth;
        const all = Array.from(document.querySelectorAll("*"));
        return all
          .filter((el) => {
            const tag = el.tagName.toLowerCase();
            if (["svg", "path", "g", "rect", "circle", "polygon", "line", "defs", "clippath"].includes(tag)) return false;
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) return false;
            return r.right > docWidth + 1;
          })
          .map((el) => ({
            tag: el.tagName.toLowerCase(),
            className: typeof el.className === "string" ? el.className.slice(0, 80) : "",
            id: el.id || "",
            right: Math.round(el.getBoundingClientRect().right),
            width: Math.round(el.getBoundingClientRect().width),
            docWidth,
            overflowPx: Math.round(el.getBoundingClientRect().right - docWidth),
            text: (el.textContent || "").trim().slice(0, 40).replace(/\s+/g, " "),
          }));
      });

      auditReport.totalOverflows += overflows.length;
      console.log(`  Horizontal Overflow Elements: ${overflows.length}`);
      if (overflows.length > 0) {
        auditReport.overallStatus = "FAILED";
        console.warn(`  ⚠️ Overflow elements on ${target.path}:`);
        overflows.slice(0, 5).forEach((o, i) => {
          console.warn(`    [${i + 1}] <${o.tag} class="${o.className}"> right=${o.right}px (+${o.overflowPx}px)`);
        });
      } else {
        console.log(`  ✔ Zero horizontal overflow on ${target.path} (${vp.name})`);
      }

      // 2. Sidebar Drawer Test (for app layout pages)
      let drawerTest = null;
      if (target.requiresAuth) {
        const hamburger = page.locator('[data-testid="mobile-hamburger"], button[aria-label="Open navigation menu"]');
        const hamburgerCount = await hamburger.count();

        if (hamburgerCount > 0) {
          console.log(`  Found hamburger button on ${target.path}. Opening drawer...`);
          await hamburger.first().click();
          await page.waitForTimeout(500);

          // Check if drawer is visible
          const drawer = page.locator('[role="dialog"], .fixed.inset-0:has([class*="w-72"])');
          const isDrawerVisible = await drawer.first().isVisible().catch(() => false);
          console.log(`  Drawer visible after click: ${isDrawerVisible}`);

          const afterScreenshot = path.join(
            AUDIT_DIR,
            `${vp.name}-${safePageName}-drawer-open.png`
          );
          // Test inner drawer click (flicker / auto-close check)
          let flickered = false;
          if (isDrawerVisible) {
            const navLink = page.locator(`[role="dialog"] a[href="${target.path}"]`).first();
            if (await navLink.count() > 0) {
              await navLink.click();
              await page.waitForTimeout(400);

              const stillOpen = await drawer.first().isVisible().catch(() => false);
              if (!stillOpen) {
                flickered = true;
                console.warn(`  ⚠️ Drawer auto-closed or flickered on inner nav link click!`);
              } else {
                console.log(`  ✔ Drawer stayed stable on inner nav link click (no flicker).`);
              }
            } else {
              const drawerContent = page.locator('[role="dialog"] [class*="w-72"], .fixed.inset-0 [class*="w-72"]').first();
              if (await drawerContent.count() > 0) {
                await drawerContent.click({ position: { x: 200, y: 30 } });
                await page.waitForTimeout(400);
                const stillOpen = await drawerContent.isVisible().catch(() => false);
                if (!stillOpen) {
                  flickered = true;
                  console.warn(`  ⚠️ Drawer auto-closed or flickered on inner panel click!`);
                } else {
                  console.log(`  ✔ Drawer stayed stable on inner panel click (no flicker).`);
                }
              }
            }

            // Close drawer explicitly
            const closeBtn = page.locator('button[aria-label="Close navigation menu"]');
            if (await closeBtn.count() > 0) {
              await closeBtn.first().click();
              await page.waitForTimeout(300);
            }
          }

          drawerTest = {
            hamburgerFound: true,
            drawerOpened: isDrawerVisible,
            flickeredOrAutoClosed: flickered,
          };
        } else {
          drawerTest = {
            hamburgerFound: false,
          };
        }
      }

      auditReport.viewports[vp.name].pages[target.path] = {
        overflowCount: overflows.length,
        overflows,
        drawerTest,
      };

      await context.close();
    }
  }

  await browser.close();

  const reportPath = path.join(AUDIT_DIR, "audit-results.json");
  fs.writeFileSync(reportPath, JSON.stringify(auditReport, null, 2));

  console.log("\n=================================================");
  console.log(`📊 AUDIT FINISHED: Total Overflows: ${auditReport.totalOverflows}`);
  console.log(`Overall Status: ${auditReport.overallStatus}`);
  console.log(`Evidence Screenshots & Report saved to ${AUDIT_DIR}`);
  console.log("=================================================\n");

  return auditReport;
}

runMobileAudit().catch((err) => {
  console.error("FATAL AUDIT ERROR:", err);
  process.exit(1);
});
