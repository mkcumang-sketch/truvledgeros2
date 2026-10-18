import type { Metadata } from "next";
import { LandingPage } from "./landing-page";

export const metadata: Metadata = {
  title: "TRUVCA LedgerOS — Practice Management System for Chartered Accountants",
  description:
    "Authoritative practice operating system for Indian Chartered Accountant firms. Orchestrate multi-client statutory filings, GST compliance deadlines, two-tier review hierarchies, client document vaults, and billing recovery.",
};

export default function HomePage() {
  return <LandingPage />;
}
