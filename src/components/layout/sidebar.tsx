"use client";

import React, { useEffect, useState } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TruvLogo } from "@/components/brand/truv-logo";

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

export interface SidebarProps {
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function Sidebar({ isMobileOpen = false, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();
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

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white select-none">
      {/* Brand Header */}
      <div className="h-16 px-4 border-b border-[#E5E7EB] flex items-center justify-between gap-3 flex-shrink-0">
        <TruvLogo size="sm" subtext="Accounting Practice OS" href="/dashboard" />

        {/* Mobile Close Button */}
        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-[#F8FAFC]"
            aria-label="Close navigation menu"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="space-y-1">
            <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {section.title}
            </div>
            <div className="space-y-0.5 pt-1">
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
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors group",
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
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge && (
                      <span
                        className={cn(
                          "text-[9px] font-bold px-1.5 py-0.5 rounded-md border",
                          badgeStyles[item.badgeVariant || "emerald"]
                        )}
                      >
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Firm Tenant Context Pill */}
      <div className="p-3 border-t border-[#E5E7EB] bg-[#F8FAFC] flex-shrink-0">
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
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden lg:flex w-64 border-r border-[#E2E0D8] h-screen flex-shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
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
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
