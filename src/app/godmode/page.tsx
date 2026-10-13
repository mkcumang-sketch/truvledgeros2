import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { Role } from "@prisma/client";
import { GodmodeClient } from "./GodmodeClient";

export const metadata: Metadata = {
  title: "System Godmode // TRUV LedgerOS",
  description: "Global tenant orchestration and super-admin controls",
};

export const dynamic = "force-dynamic";

export default async function GodmodePage() {
  const context = await getSessionContext();

  if (!context) {
    redirect("/login");
  }

  const isSuperAdmin = Boolean(context.user.isSuperAdmin);
  const isGodmodeAdmin = context.membership?.role === Role.GODMODE_ADMIN;

  if (!isSuperAdmin && !isGodmodeAdmin) {
    redirect("/dashboard");
  }

  return <GodmodeClient />;
}