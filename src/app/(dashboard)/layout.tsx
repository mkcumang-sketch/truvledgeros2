import React from "react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="flex-1 flex flex-col min-w-0">{children}</div>;
}