import { redirect } from "next/navigation";

/**
 * Public self-registration is permanently disabled.
 * Access to TRUV LedgerOS is strictly restricted to administrator invitations.
 * Direct visits to /register redirect immediately to /login.
 */
export default function RegisterPage() {
  redirect("/login");
}
