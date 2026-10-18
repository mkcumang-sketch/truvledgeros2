"use server";

import { z } from "zod";
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
import { ActionResult } from "@/lib/types/action-result";
import { serializeForClient } from "@/lib/serialization";
import { validateEntityId } from "@/lib/security/sanitize";

export type { ActionResult };

/**
 * Creates a client record and triggers cache revalidation.
 */
export async function createClientAction(
  data: z.infer<typeof CreateClientSchema>
): Promise<ActionResult<any>> {
  try {
    const validated = CreateClientSchema.parse(data);
    const client = await createClient(validated);
    revalidatePath("/clients");
    revalidatePath("/dashboard");
    return { success: true, data: serializeForClient(client) };
  } catch (error: any) {
    console.error("[createClientAction Error]", error);
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues?.[0]?.message || error.errors?.[0]?.message || "Validation failed.",
      };
    }
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
): Promise<ActionResult<any>> {
  try {
    const validId = validateEntityId(clientId);
    const validated = UpdateClientSchema.parse(data);
    const updated = await updateClient(validId, validated);
    revalidatePath("/clients");
    revalidatePath(`/clients/${validId}`);
    revalidatePath("/dashboard");
    return { success: true, data: serializeForClient(updated) };
  } catch (error: any) {
    console.error("[updateClientAction Error]", error);
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues?.[0]?.message || error.errors?.[0]?.message || "Validation failed.",
      };
    }
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
export async function archiveClientAction(clientId: string): Promise<ActionResult<any>> {
  try {
    const validId = validateEntityId(clientId);
    const archived = await archiveClient(validId);
    revalidatePath("/clients");
    revalidatePath(`/clients/${validId}`);
    revalidatePath("/dashboard");
    return { success: true, data: serializeForClient(archived) };
  } catch (error: any) {
    console.error("[archiveClientAction Error]", error);
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues?.[0]?.message || error.errors?.[0]?.message || "Validation failed.",
      };
    }
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
export async function restoreClientAction(clientId: string): Promise<ActionResult<any>> {
  try {
    const validId = validateEntityId(clientId);
    const restored = await restoreClient(validId);
    revalidatePath("/clients");
    revalidatePath(`/clients/${validId}`);
    revalidatePath("/dashboard");
    return { success: true, data: serializeForClient(restored) };
  } catch (error: any) {
    console.error("[restoreClientAction Error]", error);
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues?.[0]?.message || error.errors?.[0]?.message || "Validation failed.",
      };
    }
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
): Promise<ActionResult<any>> {
  try {
    const validId = validateEntityId(clientId);
    const validated = ContactSchema.parse(data);
    const contact = await addClientContact(validId, validated);
    revalidatePath(`/clients/${validId}`);
    return { success: true, data: serializeForClient(contact) };
  } catch (error: any) {
    console.error("[addClientContactAction Error]", error);
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues?.[0]?.message || error.errors?.[0]?.message || "Validation failed.",
      };
    }
    return {
      success: false,
      error:
        error?.message ||
        "We couldn't add this contact. Please verify the details and try again.",
    };
  }
}
