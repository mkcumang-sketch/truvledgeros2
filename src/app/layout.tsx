import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthAwareShell } from "@/components/layout/auth-aware-shell";
import { Toaster } from "sonner";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  colorScheme: "light",
  themeColor: "#FAF9F5",
};

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
    <html lang="en" className="overflow-x-hidden">
      <body className="bg-ivory text-graphite min-h-screen antialiased selection:bg-orange-100 selection:text-orange-950 overflow-x-hidden">
        <AuthAwareShell>{children}</AuthAwareShell>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
