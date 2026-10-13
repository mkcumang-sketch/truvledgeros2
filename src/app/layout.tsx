import type { Metadata } from "next";
import "./globals.css";
import { AuthAwareShell } from "@/components/layout/auth-aware-shell";

export const metadata: Metadata = {
  title: "TRUV LedgerOS — Accounting Practice Management System",
  description: "Enterprise practice operating system for Indian Chartered Accountants, tax firms, and compliance teams.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-ivory text-graphite min-h-screen antialiased selection:bg-emerald-100 selection:text-emerald-900">
        <AuthAwareShell>{children}</AuthAwareShell>
      </body>
    </html>
  );
}