"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/auth/session";
import {
  parseClientImportFile,
  validateClientImportRows,
  executeClientBulkImport,
  generateClientImportTemplateCsv,
  generateImportErrorReportCsv,
  MAX_FILE_SIZE_BYTES,
  MAX_IMPORT_ROWS,
  ParsedFileResult,
  ValidatedImportRow,
  BulkImportSummary,
} from "@/lib/server/import/client-import-service";

import { verifyMagicBytes } from "@/lib/server/s3";
import { rateLimiter, RATE_LIMIT_TIERS } from "@/lib/server/security/rate-limiter";

export type ActionResult<T = any> = {
  success: boolean;
  data?: T;
  error?: string;
};

/**
 * Server Action to parse uploaded CSV or Excel file buffer, extract headers,
 * auto-suggest column mappings, and return sample preview rows.
 */
export async function parseImportFileAction(formData: FormData): Promise<ActionResult<ParsedFileResult>> {
  try {
    const context = await requireTenant(); // Ensure user is authenticated

    // Rate limit import uploads (20 per min per user)
    const rateStatus = await rateLimiter.check(`user:import:${context.user.id}`, RATE_LIMIT_TIERS.AI_API);
    if (!rateStatus.allowed) {
      return { success: false, error: "Too many upload attempts. Please wait a moment and try again." };
    }

    const file = formData.get("file") as File | null;
    if (!file) {
      return { success: false, error: "No file was selected for upload." };
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return {
        success: false,
        error: `File size exceeds the maximum allowed limit of ${(MAX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(1)}MB.`,
      };
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Strictly enforce CSV-only file upload on server
    const fileNameLower = file.name.toLowerCase();
    if (!fileNameLower.endsWith(".csv")) {
      return {
        success: false,
        error: "Unsupported file format. Only standard CSV (.csv) files are permitted. Excel workbooks (.xlsx, .xls) are disabled for security.",
      };
    }

    if (!verifyMagicBytes(buffer, "text/csv")) {
      return {
        success: false,
        error: "Invalid CSV format: file contains illegal binary control codes or binary headers.",
      };
    }

    const parsed = parseClientImportFile(buffer, file.name);
    return { success: true, data: parsed };
  } catch (error: any) {
    console.error("[parseImportFileAction Error]", error);
    return {
      success: false,
      error: error?.message || "We could not process this CSV file. Please ensure the format is valid and try again.",
    };
  }
}

/**
 * Server Action to validate rows against schema rules, detect in-file duplicates,
 * and match existing records in the authenticated tenant's database.
 */
export async function validateImportRowsAction(
  rows: Record<string, any>[],
  mappings: Record<string, string>
): Promise<ActionResult<ValidatedImportRow[]>> {
  try {
    const context = await requireTenant();
    const tenantId = context.membership.tenantId;

    if (!Array.isArray(rows) || rows.length === 0) {
      return { success: false, error: "No rows provided for validation." };
    }
    if (rows.length > MAX_IMPORT_ROWS) {
      return { success: false, error: `Batch exceeds the maximum allowed limit of ${MAX_IMPORT_ROWS} rows.` };
    }

    const validated = await validateClientImportRows(rows, mappings, tenantId);
    return { success: true, data: validated };
  } catch (error: any) {
    console.error("[validateImportRowsAction Error]", error);
    return {
      success: false,
      error: error?.message || "Validation failed for the uploaded rows. Please check your column mappings.",
    };
  }
}

/**
 * Server Action to execute the bulk import transactionally into the practice database.
 */
export async function executeBulkImportAction(
  validatedRows: ValidatedImportRow[],
  duplicateMode: "SKIP" | "UPDATE" = "SKIP"
): Promise<ActionResult<BulkImportSummary>> {
  try {
    if (!Array.isArray(validatedRows) || validatedRows.length === 0) {
      return { success: false, error: "No validated rows provided for import." };
    }
    if (validatedRows.length > MAX_IMPORT_ROWS) {
      return { success: false, error: `Import batch exceeds the maximum allowed limit of ${MAX_IMPORT_ROWS} rows.` };
    }

    const summary = await executeClientBulkImport(validatedRows, duplicateMode);

    // Invalidate affected paths so UI and dependent modules reflect updated counts immediately
    revalidatePath("/clients");
    revalidatePath("/dashboard");
    revalidatePath("/gst");

    return { success: true, data: summary };
  } catch (error: any) {
    console.error("[executeBulkImportAction Error]", error);
    return {
      success: false,
      error:
        error?.message ||
        "The bulk import could not be completed. Your existing practice data remains unchanged. Please try again.",
    };
  }
}

/**
 * Server Action returning the standard downloadable CSV template.
 */
export async function getClientImportTemplateCsvAction(): Promise<ActionResult<string>> {
  try {
    const csvContent = generateClientImportTemplateCsv();
    return { success: true, data: csvContent };
  } catch (error: any) {
    return {
      success: false,
      error: "Failed to generate CSV template.",
    };
  }
}
