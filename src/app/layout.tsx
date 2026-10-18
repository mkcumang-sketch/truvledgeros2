import type { Metadata } from "next";
import "./globals.css";
import { AuthAwareShell } from "@/components/layout/auth-aware-shell";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "TRUV LedgerOS — Accounting Practice Management System",
  description: "Enterprise practice operating system for Indian Chartered Accountants, tax firms, and compliance teams.",
  icons: {
    icon: "/images/truv-icon.svg",
    apple: "/images/truv-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-ivory text-graphite min-h-screen antialiased selection:bg-orange-100 selection:text-orange-950">
        <AuthAwareShell>{children}</AuthAwareShell>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}