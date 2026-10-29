import React from "react";
import { getPaymentRecoveryList } from "@/lib/server/financial-analytics";
import { serializeForClient } from "@/lib/serialization";
import { PaymentRecoveryClient } from "./PaymentRecoveryClient";

export const metadata = {
  title: "Payment Recovery Operations • TRUV LedgerOS",
  description: "AI Payment Recovery Drafter and Outbound Voice Collection System.",
};

export default async function PaymentRecoveryPage() {
  const recoveryItems = await getPaymentRecoveryList();

  return (
    <PaymentRecoveryClient
      recoveryItems={serializeForClient(recoveryItems) as any}
    />
  );
}
