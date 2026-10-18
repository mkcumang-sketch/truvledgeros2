"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  FileText,
  CreditCard,
  Landmark,
  FolderDown,
  ListTodo,
  MessagesSquare,
  Cpu,
  Bot,
  BarChart3,
  Users,
  Settings,
  ShieldAlert,
  CreditCard as SubscriptionIcon,
  ChevronRight,
  X,
  Briefcase,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TruvLogo } from "@/components/brand/truv-logo";
import { TruvMonogram } from "@/components/brand/truv-monogram";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
  badgeVariant?: "emerald" | "amber" | "rose" | "teal" | "blue" | "gold" | "admin";
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    title: "Practice Management",
    items: [
      { label: "Clients 360°", href: "/clients", icon: Building2 },
      { label: "Invoices", href: "/invoices", icon: FileText, badge: "Active", badgeVariant: "amber" },
      { label: "Payments & Recovery", href: "/payments", icon: CreditCard, badge: "Live", badgeVariant: "rose" },
      { label: "GST Compliance", href: "/gst", icon: Landmark, badge: "GSTR", badgeVariant: "teal" },
      { label: "Documents", href: "/documents", icon: FolderDown, badge: "Vault", badgeVariant: "blue" },
      { label: "Tasks & Approvals", href: "/tasks", icon: ListTodo, badge: "Review", badgeVariant: "gold" },
    ],
  },
  {
    title: "Intelligence & Automations",
    items: [
      { label: "AI Practice Bot", href: "/support", icon: Bot },
      { label: "Outreach & Comms", href: "/communications", icon: MessagesSquare },
      { label: "6-Suite Automations", href: "/automations", icon: Cpu, badge: "Auto", badgeVariant: "emerald" },
      { label: "Reports & Analytics", href: "/reports", icon: BarChart3 },
    ],
  },
  {
    title: "Administration",
    items: [
      { label: "Practice Team", href: "/team", icon: Users },
      { label: "Firm Settings", href: "/settings", icon: Settings },
      { label: "Subscription", href: "/subscription", icon: SubscriptionIcon },
      { label: "TRUV Godmode", href: "/godmode", icon: ShieldAlert, badge: "Admin", badgeVariant: "admin" },
      { label: "TRUV Service", href: "/service", icon: Briefcase, badge: "Ops", badgeVariant: "teal" },
    ],
  },
];

const badgeStyles = {
  emerald: "bg-emerald-50 text-emerald-800 border-emerald-200",
  amber: "bg-amber-50 text-amber-800 border-amber-200",
  rose: "bg-rose-50 text-rose-800 border-rose-200",
  teal: "bg-teal-50 text-teal-800 border-teal-200",
  blue: "bg-sky-50 text-sky-800 border-sky-200",
  gold: "bg-gold-50 text-gold-900 border-gold-200",
  admin: "bg-graphite-900 text-white border-graphite-700",
};

const badgeDotStyles = {
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  teal: "bg-teal-500",
  blue: "bg-sky-500",
  gold: "bg-amber-500",
  admin: "bg-graphite-900",
};

export interface SidebarProps {
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

const MIN_WIDTH = 200;
const MAX_WIDTH = 420;
const DEFAULT_WIDTH = 260;
const COLLAPSED_WIDTH = 68;

export function Sidebar({ isMobileOpen = false, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();
  const [width, setWidth] = useState<number>(DEFAULT_WIDTH);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Keep ref of values for event listeners
  const isDraggingRef = useRef(false);
  const widthRef = useRef(width);
  const isCollapsedRef = useRef(isCollapsed);

  widthRef.current = width;
  isCollapsedRef.current = isCollapsed;

  const [sessionData, setSessionData] = useState<{
    firmName: string;
    plan: string;
    isSuperAdmin?: boolean;
    role?: string;
  }>({
    firmName: "TRUV Demo CA",
    plan: "Professional Plan • Active",
    isSuperAdmin: false,
    role: undefined,
  });

  // Restore persisted preferences on mount
  useEffect(() => {
    try {
      const savedWidth = localStorage.getItem("truv_sidebar_width");
      const savedCollapsed = localStorage.getItem("truv_sidebar_collapsed");

      if (savedWidth) {
        const num = Number(savedWidth);
        if (!isNaN(num) && num >= MIN_WIDTH && num <= MAX_WIDTH) {
          setWidth(num);
        }
      }
      if (savedCollapsed !== null) {
        setIsCollapsed(savedCollapsed === "true");
      }
    } catch {}
  }, []);

  // Fetch session data
  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.authenticated) {
          setSessionData({
            firmName: data.tenant?.name || "TRUV Demo CA",
            plan: "Professional Plan • Active",
            isSuperAdmin: Boolean(data.user?.isSuperAdmin),
            role: data.membership?.role,
          });
        }
      })
      .catch(() => null);
  }, []);

  // Close mobile sidebar on route change
  useEffect(() => {
    if (isMobileOpen && onCloseMobile) {
      onCloseMobile();
    }
  }, [pathname, isMobileOpen, onCloseMobile]);

  // Toggle Collapse Mode
  const toggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("truv_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  }, []);

  // Keyboard shortcut Ctrl+[ to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "[" || e.key === "b")) {
        e.preventDefault();
        toggleCollapse();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleCollapse]);

  // Drag to Resize Handling
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    isDraggingRef.current = true;

    const startX = e.clientX;
    const startWidth = isCollapsedRef.current ? COLLAPSED_WIDTH : widthRef.current;

    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const deltaX = moveEvent.clientX - startX;
      let newWidth = startWidth + deltaX;

      if (newWidth < 140) {
        // Dragging narrow auto-collapses
        if (!isCollapsedRef.current) {
          setIsCollapsed(true);
          try {
            localStorage.setItem("truv_sidebar_collapsed", "true");
          } catch {}
        }
      } else {
        if (isCollapsedRef.current) {
          setIsCollapsed(false);
          try {
            localStorage.setItem("truv_sidebar_collapsed", "false");
          } catch {}
        }
        newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth));
        setWidth(newWidth);
        try {
          localStorage.setItem("truv_sidebar_width", String(newWidth));
        } catch {}
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      isDraggingRef.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, []);

  // Render Inner Sidebar Content
  const renderSidebarContent = (collapsed: boolean, isMobile = false) => (
    <div className="flex flex-col h-full bg-white select-none">
      {/* Brand Header */}
      <div
        className={cn(
          "h-16 border-b border-[#E5E7EB] flex items-center flex-shrink-0 transition-all",
          collapsed ? "px-2 justify-between" : "px-3.5 justify-between gap-2"
        )}
      >
        {collapsed ? (
          <>
            <Link
              href="/dashboard"
              title="TRUV LedgerOS — Practice OS"
              className="p-1.5 rounded-lg hover:bg-orange-50 transition-colors mx-auto"
            >
              <TruvMonogram className="w-7 h-7" />
            </Link>
            <button
              onClick={toggleCollapse}
              className="p-1 rounded-md text-slate-400 hover:text-orange-600 hover:bg-orange-50 transition-colors cursor-pointer"
              title="Expand sidebar"
              aria-label="Expand sidebar"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          </>
        ) : (
          <>
            <TruvLogo size="sm" subtext="Accounting Practice OS" href="/dashboard" />

            <div className="flex items-center gap-1">
              {!isMobile && (
                <button
                  onClick={toggleCollapse}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-orange-600 hover:bg-orange-50 transition-colors cursor-pointer"
                  title="Collapse sidebar (Ctrl+[)"
                  aria-label="Collapse sidebar"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              )}

              {/* Mobile Close Button */}
              {isMobile && onCloseMobile && (
                <button
                  onClick={onCloseMobile}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-[#F8FAFC]"
                  aria-label="Close navigation menu"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Navigation Sections */}
      <div
        className={cn(
          "flex-1 overflow-y-auto overflow-x-hidden space-y-5",
          collapsed ? "px-2 py-3" : "px-3 py-4"
        )}
      >
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="space-y-1">
            {!collapsed && (
              <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {section.title}
              </div>
            )}
            <div className="space-y-0.5 pt-0.5">
              {section.items
                .filter((item) => {
                  if (item.href === "/godmode" || item.href === "/service") {
                    return Boolean(sessionData.isSuperAdmin || sessionData.role === "GODMODE_ADMIN");
                  }
                  return true;
                })
                .map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/" && pathname.startsWith(item.href));
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "relative flex items-center rounded-lg text-[13px] font-medium transition-colors group",
                        collapsed ? "justify-center p-2.5" : "gap-2.5 px-3 py-2",
                        isActive
                          ? "bg-[#FFF4EE] text-[#D95524] font-semibold border border-[#F26B38]/30 shadow-2xs"
                          : "text-[#475569] hover:bg-[#F8FAFC] hover:text-[#263238]"
                      )}
                    >
                      <Icon
                        className={cn(
                          "w-4 h-4 flex-shrink-0 transition-colors",
                          isActive
                            ? "text-[#F26B38]"
                            : "text-slate-400 group-hover:text-slate-600"
                        )}
                      />
                      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                      {item.badge && !collapsed && (
                        <span
                          className={cn(
                            "text-[9px] font-bold px-1.5 py-0.5 rounded-md border",
                            badgeStyles[item.badgeVariant || "emerald"]
                          )}
                        >
                          {item.badge}
                        </span>
                      )}
                      {item.badge && collapsed && (
                        <span
                          className={cn(
                            "absolute top-1.5 right-1.5 w-2 h-2 rounded-full ring-2 ring-white",
                            badgeDotStyles[item.badgeVariant || "emerald"]
                          )}
                          title={`${item.label}: ${item.badge}`}
                        />
                      )}
                    </Link>
                  );
                })}
            </div>
          </div>
        ))}
      </div>

      {/* Firm Tenant Context Pill */}
      <div
        className={cn(
          "border-t border-[#E5E7EB] bg-[#F8FAFC] flex-shrink-0",
          collapsed ? "p-2 flex justify-center" : "p-3"
        )}
      >
        {collapsed ? (
          <Link
            href="/settings"
            title={`${sessionData.firmName} • ${sessionData.plan}`}
            className="w-10 h-10 rounded-lg border border-[#E5E7EB] bg-white hover:bg-orange-50 transition-colors flex items-center justify-center shadow-2xs group"
          >
            <div className="w-7 h-7 rounded-md bg-[#F26B38] text-white font-bold text-[11px] flex items-center justify-center">
              {sessionData.firmName.substring(0, 2).toUpperCase()}
            </div>
          </Link>
        ) : (
          <Link
            href="/settings"
            className="p-2.5 rounded-lg border border-[#E5E7EB] bg-white hover:bg-[#F8FAFC] transition-colors flex items-center gap-2.5 shadow-2xs group"
          >
            <div className="w-8 h-8 rounded-md bg-[#F26B38] text-white font-bold text-xs flex items-center justify-center flex-shrink-0">
              {sessionData.firmName.substring(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-[#263238] truncate group-hover:text-[#F26B38] transition-colors">
                {sessionData.firmName}
              </div>
              <div className="text-[10px] text-[#64748B] font-medium truncate">
                {sessionData.plan}
              </div>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700" />
          </Link>
        )}
      </div>
    </div>
  );

  const desktopWidth = isCollapsed ? COLLAPSED_WIDTH : width;

  return (
    <>
      {/* Desktop Persistent Resizable Sidebar */}
      <aside
        style={{ width: `${desktopWidth}px` }}
        className={cn(
          "hidden lg:flex relative border-r border-[#E2E0D8] h-screen flex-shrink-0 select-none z-20",
          !isDragging && "transition-[width] duration-200 ease-in-out"
        )}
      >
        <div className="w-full h-full overflow-hidden flex flex-col">
          {renderSidebarContent(isCollapsed, false)}
        </div>

        {/* Drag Handle on right border */}
        <div
          onMouseDown={handleMouseDown}
          onDoubleClick={() => {
            setWidth(DEFAULT_WIDTH);
            setIsCollapsed(false);
            try {
              localStorage.setItem("truv_sidebar_width", String(DEFAULT_WIDTH));
              localStorage.setItem("truv_sidebar_collapsed", "false");
            } catch {}
          }}
          className={cn(
            "absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-orange-500/50 transition-colors z-30 group",
            isDragging && "bg-orange-500 w-1"
          )}
          title="Drag to resize sidebar (double-click to reset)"
        />
      </aside>

      {/* Mobile Drawer (Always Full Width) */}
      {isMobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-graphite-900/50 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
            aria-hidden="true"
          />

          {/* Drawer Panel */}
          <div className="relative w-72 max-w-[85vw] h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-200">
            {renderSidebarContent(false, true)}
          </div>
        </div>
      )}
    </>
  );
}
