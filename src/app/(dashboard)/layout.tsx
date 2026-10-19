import React from "react";

export const dynamic = "force-dynamic";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 flex flex-col min-w-0 w-full max-w-full overflow-x-hidden">
      {children}
    </div>
  );
}