"use server";

import { revalidatePath } from "next/cache";
import {
  createClient,
  updateClient,
  archiveClient,
  restoreClient,
  addClientContact,
  CreateClientSchema,
  UpdateClientSchema,
  ContactSchema,
} from "@/lib/server/client-service";
import { z } from "zod";

export type ActionResult<T = any> = {
  success: boolean;
  data?: T;
  error?: string;
};

/**
 * Creates a client record and triggers cache revalidation.
 */
export async function createClientAction(
  data: z.infer<typeof CreateClientSchema>
): Promise<ActionResult> {
  try {
    const client = await createClient(data);
    revalidatePath("/clients");
    revalidatePath("/dashboard");
    return { success: true, data: client };
  } catch (error: any) {
    console.error("[createClientAction Error]", error);
    return {
      success: false,
      error:
        error?.message ||
        "We couldn't save this client. Your changes haven't been confirmed. Please try again.",
    };
  }
}

/**
 * Updates a client record and invalidates dependent paths.
 */
export async function updateClientAction(
  clientId: string,
  data: z.infer<typeof UpdateClientSchema>
): Promise<ActionResult> {
  try {
    const updated = await updateClient(clientId, data);
    revalidatePath("/clients");
    revalidatePath(`/clients/${clientId}`);
    revalidatePath("/dashboard");
    return { success: true, data: updated };
  } catch (error: any) {
    console.error("[updateClientAction Error]", error);
    return {
      success: false,
      error:
        error?.message ||
        "We couldn't update this client. Please verify the information and try again.",
    };
  }
}

/**
 * Archives a client record preserving historical records.
 */
export async function archiveClientAction(clientId: string): Promise<ActionResult> {
  try {
    const archived = await archiveClient(clientId);
    revalidatePath("/clients");
    revalidatePath(`/clients/${clientId}`);
    revalidatePath("/dashboard");
    return { success: true, data: archived };
  } catch (error: any) {
    console.error("[archiveClientAction Error]", error);
    return {
      success: false,
      error:
        error?.message ||
        "We couldn't archive this client. Please check your permissions and try again.",
    };
  }
}

/**
 * Restores an archived client to active practice tracking.
 */
export async function restoreClientAction(clientId: string): Promise<ActionResult> {
  try {
    const restored = await restoreClient(clientId);
    revalidatePath("/clients");
    revalidatePath(`/clients/${clientId}`);
    revalidatePath("/dashboard");
    return { success: true, data: restored };
  } catch (error: any) {
    console.error("[restoreClientAction Error]", error);
    return {
      success: false,
      error:
        error?.message ||
        "We couldn't restore this client. Please try again.",
    };
  }
}

/**
 * Adds an authorized contact for a client.
 */
export async function addClientContactAction(
  clientId: string,
  data: z.infer<typeof ContactSchema>
): Promise<ActionResult> {
  try {
    const contact = await addClientContact(clientId, data);
    revalidatePath(`/clients/${clientId}`);
    return { success: true, data: contact };
  } catch (error: any) {
    console.error("[addClientContactAction Error]", error);
    return {
      success: false,
      error:
        error?.message ||
        "We couldn't add this contact. Please verify the details and try again.",
    };
  }
}
