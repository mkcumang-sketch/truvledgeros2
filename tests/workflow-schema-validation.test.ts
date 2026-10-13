import fs from "fs";
import path from "path";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`\x1b[32m✔ PASS\x1b[0m: ${testName}`);
    passed++;
  } else {
    console.error(`\x1b[31m✖ FAIL\x1b[0m: ${testName}`);
    failed++;
  }
}

async function runTests() {
  console.log("==========================================================");
  console.log("TRUV LedgerOS — n8n Workflow Schema & Node Validation Tests");
  console.log("==========================================================\n");

  const workflowsDir = path.join(__dirname, "../n8n/workflows");
  const files = [
    "workflow-a-client-onboarding.json",
    "workflow-b-gst-compliance-reminders.json",
    "workflow-c-document-collection.json",
    "workflow-d-task-assignment-approvals.json",
    "workflow-e-invoice-payment-reminders.json",
    "workflow-f-automation-failure-alerts.json",
  ];

  for (const filename of files) {
    const fullPath = path.join(workflowsDir, filename);
    const exists = fs.existsSync(fullPath);
    assert(exists, `Workflow file exists: ${filename}`);

    if (!exists) continue;

    const raw = fs.readFileSync(fullPath, "utf-8");
    let json: any = null;
    try {
      json = JSON.parse(raw);
      assert(true, `${filename}: Valid JSON format`);
    } catch (e: any) {
      assert(false, `${filename}: Malformed JSON syntax: ${e.message}`);
      continue;
    }

    // 1. Validate top-level schema
    assert(typeof json.name === "string" && json.name.length > 5, `${filename}: Has descriptive name`);
    assert(Array.isArray(json.nodes) && json.nodes.length >= 3, `${filename}: Contains minimum 3 nodes`);
    assert(typeof json.connections === "object" && json.connections !== null, `${filename}: Has valid connections map`);

    // 2. Validate nodes
    const nodeNames = new Set(json.nodes.map((n: any) => n.name));
    let hasTriggerNode = false;
    let hasHttpOutbound = false;
    let hasCodeNode = false;

    for (const node of json.nodes) {
      assert(Boolean(node.id && node.name && node.type), `${filename}: Node '${node.name}' has valid schema`);

      if (
        node.type === "n8n-nodes-base.webhook" ||
        node.type === "n8n-nodes-base.scheduleTrigger" ||
        node.type === "n8n-nodes-base.errorTrigger"
      ) {
        hasTriggerNode = true;
      }

      if (node.type === "n8n-nodes-base.httpRequest") {
        hasHttpOutbound = true;
        const urlStr = String(node.parameters?.url || "");
        if (urlStr.includes("/api/webhooks/n8n")) {
          const headers = node.parameters?.headerParameters?.parameters || [];
          const headerNames = headers.map((h: any) => h.name);
          const hasSig = headerNames.includes("x-truv-signature");
          const hasTime = headerNames.includes("x-truv-timestamp");
          assert(hasSig && hasTime, `${filename}: Inbound callback HTTP node '${node.name}' sends x-truv-signature and x-truv-timestamp`);
        }
      }

      if (node.type === "n8n-nodes-base.code") {
        hasCodeNode = true;
        const code = node.parameters?.jsCode || "";
        assert(code.includes("crypto") && code.includes("sha256"), `${filename}: Code node computes HMAC-SHA256 signature`);
      }
    }

    assert(hasTriggerNode, `${filename}: Has authorized trigger node`);
    assert(hasHttpOutbound, `${filename}: Has outbound HTTP request node`);
    assert(hasCodeNode, `${filename}: Has HMAC transformation code node`);

    // 3. Validate connection topology
    for (const sourceNodeName of Object.keys(json.connections)) {
      assert(nodeNames.has(sourceNodeName), `${filename}: Connection source '${sourceNodeName}' exists in nodes`);
      const outputs = json.connections[sourceNodeName]?.main || [];
      for (const outputGroup of outputs) {
        for (const conn of outputGroup) {
          assert(nodeNames.has(conn.node), `${filename}: Target node '${conn.node}' exists in nodes`);
        }
      }
    }
  }

  console.log("\n----------------------------------------------------------");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("----------------------------------------------------------\n");

  if (failed > 0) process.exit(1);
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
