import { z } from "zod";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/auth/session";
import { hasPermission } from "@/lib/server/rbac/permissions";
import { logSecurityEvent } from "@/lib/server/audit";
import { publishDomainEvent } from "@/lib/server/domain-events";
import {
  CLIENT_TYPES,
  ClientType,
  PAN_REGEX,
  GSTIN_REGEX,
} from "@/lib/constants/clients";

import {
  MAX_FILE_SIZE_BYTES,
  MAX_IMPORT_ROWS,
  SUPPORTED_IMPORT_FIELDS,
  ImportFieldKey,
  RowValidationStatus,
  ParsedFileResult,
  ValidatedImportRow,
  BulkImportSummary,
} from "@/lib/constants/import-definitions";

export {
  MAX_FILE_SIZE_BYTES,
  MAX_IMPORT_ROWS,
  SUPPORTED_IMPORT_FIELDS,
};
export type {
  ImportFieldKey,
  RowValidationStatus,
  ParsedFileResult,
  ValidatedImportRow,
  BulkImportSummary,
};

export const MAX_IMPORT_COLS = 50;
export const MAX_FIELD_LENGTH = 1000;

/**
 * Sanitizes incoming cell values to neutralize spreadsheet formula injection (CWE-1236).
 * Any value starting with '=', '+', '-', '@', '\t', or '\r' is prefixed with an apostrophe.
 */
export function sanitizeImportCell(value: any): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/^[\t\r]/.test(str)) {
    return `'${str}`;
  }
  const trimmed = str.trim();
  if (/^[=+\-@]/.test(trimmed)) {
    return `'${trimmed}`;
  }
  return trimmed;
}

/**
 * Sanitizes values for CSV export to prevent formula injection attacks (CSV Injection / CWE-1236).
 * Any value starting with '=', '+', '-', '@', '\t', or '\r' is prefixed with an apostrophe.
 */
export function sanitizeCsvCell(value: any): string {
  if (value === null || value === undefined) return "";
  let str = String(value).trim();
  // Check for dangerous leading characters
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  // Escape quotes
  if (str.includes('"') || str.includes(",") || str.includes("\n") || str.includes("\r")) {
    str = `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * RFC 4180 compliant CSV parser with explicit security constraints:
 * - Handles quotes, commas, newlines in quoted fields, escaped quotes ("")
 * - Enforces maximum column count and maximum field length
 * - Enforces maximum row limit
 * - Rejects malformed quotes / unclosed quoted fields
 */
export function parseCsvText(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let insideQuotes = false;
  let i = 0;
  const len = csvText.length;

  while (i < len) {
    const char = csvText[i];

    if (insideQuotes) {
      if (char === '"') {
        if (i + 1 < len && csvText[i + 1] === '"') {
          // Escaped double quote ("") inside quoted field
          currentField += '"';
          i += 2;
          continue;
        } else {
          // Closing quote
          insideQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        if (currentField.trim().length === 0) {
          insideQuotes = true;
          currentField = "";
          i++;
          continue;
        } else {
          currentField += char;
          i++;
          continue;
        }
      } else if (char === ',') {
        if (currentField.length > MAX_FIELD_LENGTH) {
          throw new Error(`CSV field exceeds maximum character length of ${MAX_FIELD_LENGTH}.`);
        }
        currentRow.push(currentField);
        currentField = "";
        i++;
        continue;
      } else if (char === '\r') {
        if (i + 1 < len && csvText[i + 1] === '\n') {
          i++; // Skip \r in \r\n sequence
        }
        if (currentField.length > MAX_FIELD_LENGTH) {
          throw new Error(`CSV field exceeds maximum character length of ${MAX_FIELD_LENGTH}.`);
        }
        currentRow.push(currentField);
        currentField = "";
        if (currentRow.some((c) => c.trim().length > 0)) {
          rows.push(currentRow);
          if (rows.length > MAX_IMPORT_ROWS + 1) {
            throw new Error(`The file exceeds the maximum limit of ${MAX_IMPORT_ROWS} rows per import batch.`);
          }
        }
        currentRow = [];
        i++;
        continue;
      } else if (char === '\n') {
        if (currentField.length > MAX_FIELD_LENGTH) {
          throw new Error(`CSV field exceeds maximum character length of ${MAX_FIELD_LENGTH}.`);
        }
        currentRow.push(currentField);
        currentField = "";
        if (currentRow.some((c) => c.trim().length > 0)) {
          rows.push(currentRow);
          if (rows.length > MAX_IMPORT_ROWS + 1) {
            throw new Error(`The file exceeds the maximum limit of ${MAX_IMPORT_ROWS} rows per import batch.`);
          }
        }
        currentRow = [];
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  if (insideQuotes) {
    throw new Error("Malformed CSV: unclosed quoted field detected.");
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some((c) => c.trim().length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Parses an uploaded CSV file buffer into headers and normalized row records.
 * Strictly enforces server-side CSV-only imports:
 * - Rejects .xlsx, .xls, and all non-.csv extensions
 * - Inspects magic bytes and rejects ZIP/OpenXML and OLE2 compound files
 * - Rejects binary files containing null bytes
 * - Neutralizes formula injection on all incoming cells
 */
export function parseClientImportFile(
  fileBuffer: Buffer,
  fileName: string
): ParsedFileResult {
  if (fileBuffer.length > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `File size (${(fileBuffer.length / (1024 * 1024)).toFixed(1)}MB) exceeds the maximum allowed limit of 5MB.`
    );
  }

  const extension = fileName.toLowerCase().split(".").pop();
  if (extension !== "csv") {
    throw new Error(
      "Unsupported file format. Only standard CSV (.csv) files are permitted. Excel workbooks (.xlsx, .xls) are disabled for security."
    );
  }

  // 1. Magic bytes rejection: OpenXML ZIP container (PK\x03\x04 - .xlsx)
  if (
    fileBuffer.length >= 4 &&
    fileBuffer[0] === 0x50 &&
    fileBuffer[1] === 0x4b &&
    fileBuffer[2] === 0x03 &&
    fileBuffer[3] === 0x04
  ) {
    throw new Error(
      "Excel OpenXML workbooks (.xlsx) are disabled for security. Please upload a standard plaintext CSV (.csv) file."
    );
  }

  // 2. Magic bytes rejection: OLE2 Compound Document container (\xD0\xCF\x11\xE0 - .xls)
  if (
    fileBuffer.length >= 4 &&
    fileBuffer[0] === 0xd0 &&
    fileBuffer[1] === 0xcf &&
    fileBuffer[2] === 0x11 &&
    fileBuffer[3] === 0xe0
  ) {
    throw new Error(
      "Excel binary workbooks (.xls) are disabled for security. Please upload a standard plaintext CSV (.csv) file."
    );
  }

  // 3. Reject binary files / null bytes in first 4096 bytes
  for (let b = 0; b < Math.min(fileBuffer.length, 4096); b++) {
    if (fileBuffer[b] === 0x00) {
      throw new Error("Invalid CSV format: file contains illegal binary control codes.");
    }
  }

  // 4. Decode UTF-8 string, stripping UTF-8 BOM if present
  let csvText = fileBuffer.toString("utf-8");
  if (csvText.charCodeAt(0) === 0xfeff) {
    csvText = csvText.slice(1);
  }

  // 5. Parse CSV rows
  const rawData = parseCsvText(csvText);

  if (!rawData || rawData.length === 0) {
    throw new Error("The uploaded file contains no data rows.");
  }

  // Find first non-empty row as header
  let headerIndex = -1;
  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i];
    if (row && row.some((cell) => cell && String(cell).trim().length > 0)) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    throw new Error("No column headers found in the uploaded file.");
  }

  const rawHeaders = rawData[headerIndex].map((h: any) => String(h || "").trim());
  const headers = rawHeaders.filter((h) => h.length > 0);

  if (headers.length === 0) {
    throw new Error("No valid column headers were detected in the CSV file.");
  }

  if (headers.length > MAX_IMPORT_COLS) {
    throw new Error(
      `CSV file contains ${headers.length} columns, which exceeds the maximum limit of ${MAX_IMPORT_COLS} columns.`
    );
  }

  // Convert remaining rows into object records with formula injection sanitization
  const dataRows: Record<string, any>[] = [];
  for (let i = headerIndex + 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || !row.some((cell) => cell && String(cell).trim().length > 0)) {
      continue; // skip blank rows
    }
    const rowObj: Record<string, any> = {};
    headers.forEach((h, colIdx) => {
      const rawVal = row[colIdx] !== undefined ? String(row[colIdx]) : "";
      rowObj[h] = sanitizeImportCell(rawVal);
    });
    dataRows.push(rowObj);
  }

  if (dataRows.length === 0) {
    throw new Error("The CSV file contains headers but no data rows to import.");
  }

  if (dataRows.length > MAX_IMPORT_ROWS) {
    throw new Error(
      `The file contains ${dataRows.length} rows, which exceeds the maximum limit of ${MAX_IMPORT_ROWS} rows per import batch. Please split the file into smaller batches.`
    );
  }

  // Generate suggested column mappings
  const suggestedMappings: Record<string, ImportFieldKey | ""> = {};
  headers.forEach((header) => {
    const normalizedHeader = header.toLowerCase().replace(/[^a-z0-9]/g, " ").trim();
    let matchedField: ImportFieldKey | "" = "";

    // Pass 1: Exact matches (key or exact alias)
    for (const field of SUPPORTED_IMPORT_FIELDS) {
      if (
        normalizedHeader === field.key.toLowerCase() ||
        (field.aliases as readonly string[]).includes(normalizedHeader)
      ) {
        matchedField = field.key;
        break;
      }
    }

    // Pass 2: Word boundary / phrase matching if no exact match found
    if (!matchedField) {
      for (const field of SUPPORTED_IMPORT_FIELDS) {
        if (
          field.aliases.some((alias) => {
            const regex = new RegExp(`(^|\\s)${alias.replace(/\s+/g, "\\s+")}(\\s|$)`, "i");
            return regex.test(normalizedHeader);
          })
        ) {
          matchedField = field.key;
          break;
        }
      }
    }

    suggestedMappings[header] = matchedField;
  });

  return {
    headers,
    suggestedMappings,
    rowCount: dataRows.length,
    sampleRows: dataRows.slice(0, 5),
    allRows: dataRows,
    fileName,
  };
}

/**
 * Normalizes entity type string to standard Indian practice entity types.
 */
function normalizeEntityType(rawType: string | null | undefined): string {
  if (!rawType) return "Pvt Ltd";
  const cleaned = rawType.toLowerCase().trim();
  if (cleaned.includes("pvt") || cleaned.includes("private") || cleaned.includes("ltd")) {
    return "Pvt Ltd";
  }
  if (cleaned.includes("llp") || cleaned.includes("limited liability")) {
    return "LLP";
  }
  if (cleaned.includes("prop") || cleaned.includes("sole")) {
    return "Proprietorship";
  }
  if (cleaned.includes("partn")) {
    return "Partnership";
  }
  if (cleaned.includes("trust") || cleaned.includes("society") || cleaned.includes("ngo")) {
    return "Trust/Society";
  }
  if (cleaned.includes("indiv") || cleaned.includes("huf")) {
    return "Individual";
  }
  return "Pvt Ltd";
}

/**
 * Validates, normalizes, and matches spreadsheet rows against in-file duplicates
 * and authoritative database records within the tenant.
 */
export async function validateClientImportRows(
  rows: Record<string, any>[],
  mappings: Record<string, string>,
  tenantId: string
): Promise<ValidatedImportRow[]> {
  // Invert mappings: key -> spreadsheet header name
  const fieldToHeader: Partial<Record<ImportFieldKey, string>> = {};
  Object.entries(mappings).forEach(([header, fieldKey]) => {
    if (fieldKey) {
      fieldToHeader[fieldKey as ImportFieldKey] = header;
    }
  });

  // Verify essential required mappings
  if (!fieldToHeader.name) {
    throw new Error("Missing column mapping: 'Legal / Entity Name' is a required field.");
  }
  if (!fieldToHeader.email) {
    throw new Error("Missing column mapping: 'Primary Email Address' is a required field.");
  }
  if (!fieldToHeader.phone) {
    throw new Error("Missing column mapping: 'Contact Phone Number' is a required field.");
  }

  // Pre-fetch all existing clients in this tenant to perform batch in-memory matching
  const existingClients = await db.client.findMany({
    where: { tenantId },
    select: {
      id: true,
      name: true,
      pan: true,
      gstin: true,
      email: true,
      active: true,
    },
  });

  const existingByPan = new Map<string, { id: string; name: string }>();
  const existingByGstin = new Map<string, { id: string; name: string }>();
  const existingByEmail = new Map<string, { id: string; name: string }>();
  const existingByName = new Map<string, { id: string; name: string }>();

  existingClients.forEach((c) => {
    if (c.pan) existingByPan.set(c.pan.toUpperCase().trim(), { id: c.id, name: c.name });
    if (c.gstin) existingByGstin.set(c.gstin.toUpperCase().trim(), { id: c.id, name: c.name });
    if (c.email) existingByEmail.set(c.email.toLowerCase().trim(), { id: c.id, name: c.name });
    existingByName.set(c.name.toLowerCase().trim(), { id: c.id, name: c.name });
  });

  // In-file tracking to detect internal duplicates
  const seenPansInFile = new Map<string, number>();
  const seenGstinsInFile = new Map<string, number>();
  const seenEmailsInFile = new Map<string, number>();
  const seenNamesInFile = new Map<string, number>();

  const validatedRows: ValidatedImportRow[] = [];

  for (let idx = 0; idx < rows.length; idx++) {
    const raw = rows[idx];
    const rowIndex = idx + 2; // Spreadsheet row index (1-based, accounts for header)
    const errors: string[] = [];

    // Extract values based on mapping
    const rawName = fieldToHeader.name ? String(raw[fieldToHeader.name] || "").trim() : "";
    const rawBusinessName = fieldToHeader.businessName ? String(raw[fieldToHeader.businessName] || "").trim() : "";
    const rawClientType = fieldToHeader.clientType ? String(raw[fieldToHeader.clientType] || "").trim() : "";
    const rawPan = fieldToHeader.pan ? String(raw[fieldToHeader.pan] || "").trim().toUpperCase() : "";
    const rawGstin = fieldToHeader.gstin ? String(raw[fieldToHeader.gstin] || "").trim().toUpperCase() : "";
    const rawEmail = fieldToHeader.email ? String(raw[fieldToHeader.email] || "").trim().toLowerCase() : "";
    const rawPhone = fieldToHeader.phone ? String(raw[fieldToHeader.phone] || "").trim().replace(/[^0-9]/g, "") : "";
    const rawAddress = fieldToHeader.address ? String(raw[fieldToHeader.address] || "").trim() : "";
    const rawCity = fieldToHeader.city ? String(raw[fieldToHeader.city] || "").trim() : "";
    const rawState = fieldToHeader.state ? String(raw[fieldToHeader.state] || "").trim() : "";
    const rawPincode = fieldToHeader.pincode ? String(raw[fieldToHeader.pincode] || "").trim() : "";
    const rawMonthlyFee = fieldToHeader.monthlyFee ? String(raw[fieldToHeader.monthlyFee] || "").trim().replace(/[^0-9.]/g, "") : "0";
    const rawNotes = fieldToHeader.notes ? String(raw[fieldToHeader.notes] || "").trim() : "";

    // 1. Validate Legal Name
    if (!rawName || rawName.length < 2) {
      errors.push("Legal Name is required and must be at least 2 characters.");
    }

    // 2. Validate Email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!rawEmail || !emailRegex.test(rawEmail)) {
      errors.push("A valid email address is required (e.g. accounts@company.com).");
    }

    // 3. Validate Phone Number
    if (!rawPhone || rawPhone.length < 10) {
      errors.push("A valid 10-digit phone number is required.");
    }

    // 4. Validate PAN if present
    let panNormalized: string | null = null;
    if (rawPan) {
      if (!PAN_REGEX.test(rawPan)) {
        errors.push(`Invalid PAN format: "${rawPan}". Must be 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F).`);
      } else {
        panNormalized = rawPan;
      }
    }

    // 5. Validate GSTIN if present
    let gstinNormalized: string | null = null;
    if (rawGstin) {
      if (!GSTIN_REGEX.test(rawGstin)) {
        errors.push(`Invalid GSTIN format: "${rawGstin}". Must be 15 characters (e.g. 27ABCDE1234F1Z5).`);
      } else {
        gstinNormalized = rawGstin;
      }
    }

    // Parse Fee
    const parsedFee = parseFloat(rawMonthlyFee);
    const monthlyFee = isNaN(parsedFee) || parsedFee < 0 ? 0 : parsedFee;

    const normalizedData = {
      name: rawName,
      businessName: rawBusinessName || null,
      clientType: normalizeEntityType(rawClientType),
      pan: panNormalized,
      gstin: gstinNormalized,
      email: rawEmail,
      phone: rawPhone,
      address: rawAddress || null,
      city: rawCity || null,
      state: rawState || null,
      pincode: rawPincode || null,
      monthlyFee,
      notes: rawNotes || null,
    };

    // Determine Status
    let status: RowValidationStatus = "VALID_NEW";
    let existingMatch: ValidatedImportRow["existingMatch"] | undefined = undefined;

    if (errors.length > 0) {
      status = "INVALID";
    } else {
      // Check In-File Duplicates
      let inFileDup = false;
      if (panNormalized && seenPansInFile.has(panNormalized)) {
        errors.push(`Duplicate PAN in file: "${panNormalized}" also appears in row ${seenPansInFile.get(panNormalized)}.`);
        inFileDup = true;
      }
      if (gstinNormalized && seenGstinsInFile.has(gstinNormalized)) {
        errors.push(`Duplicate GSTIN in file: "${gstinNormalized}" also appears in row ${seenGstinsInFile.get(gstinNormalized)}.`);
        inFileDup = true;
      }
      if (rawEmail && seenEmailsInFile.has(rawEmail)) {
        errors.push(`Duplicate Email in file: "${rawEmail}" also appears in row ${seenEmailsInFile.get(rawEmail)}.`);
        inFileDup = true;
      }
      if (rawName && seenNamesInFile.has(rawName.toLowerCase())) {
        errors.push(`Duplicate Legal Name in file: "${rawName}" also appears in row ${seenNamesInFile.get(rawName.toLowerCase())}.`);
        inFileDup = true;
      }

      if (inFileDup) {
        status = "IN_FILE_DUPLICATE";
      } else {
        // Track for subsequent row checks
        if (panNormalized) seenPansInFile.set(panNormalized, rowIndex);
        if (gstinNormalized) seenGstinsInFile.set(gstinNormalized, rowIndex);
        if (rawEmail) seenEmailsInFile.set(rawEmail, rowIndex);
        if (rawName) seenNamesInFile.set(rawName.toLowerCase(), rowIndex);

        // Check Existing Match in Practice Database
        if (panNormalized && existingByPan.has(panNormalized)) {
          const match = existingByPan.get(panNormalized)!;
          status = "EXISTING_MATCH";
          existingMatch = {
            id: match.id,
            name: match.name,
            pan: panNormalized,
            matchedBy: "PAN",
          };
        } else if (gstinNormalized && existingByGstin.has(gstinNormalized)) {
          const match = existingByGstin.get(gstinNormalized)!;
          status = "EXISTING_MATCH";
          existingMatch = {
            id: match.id,
            name: match.name,
            gstin: gstinNormalized,
            matchedBy: "GSTIN",
          };
        } else if (rawEmail && existingByEmail.has(rawEmail)) {
          const match = existingByEmail.get(rawEmail)!;
          status = "EXISTING_MATCH";
          existingMatch = {
            id: match.id,
            name: match.name,
            matchedBy: "EMAIL",
          };
        } else if (rawName && existingByName.has(rawName.toLowerCase())) {
          const match = existingByName.get(rawName.toLowerCase())!;
          status = "EXISTING_MATCH";
          existingMatch = {
            id: match.id,
            name: match.name,
            matchedBy: "NAME",
          };
        }
      }
    }

    validatedRows.push({
      rowIndex,
      rawRow: raw,
      normalizedData,
      status,
      errors,
      existingMatch,
    });
  }

  return validatedRows;
}

/**
 * Executes the bulk import transactionally for the authenticated tenant.
 */
export async function executeClientBulkImport(
  validatedRows: ValidatedImportRow[],
  duplicateMode: "SKIP" | "UPDATE" = "SKIP"
): Promise<BulkImportSummary> {
  const context = await requireTenant();
  const tenantId = context.membership.tenantId;

  // Authorization check: Only authorized practice members with clients:create
  const allowed = hasPermission(context.membership.role, "clients", "create");
  if (!allowed && !context.user.isSuperAdmin) {
    throw new Error("You do not have permission to perform bulk client imports for this practice firm.");
  }

  const summary: BulkImportSummary = {
    totalRows: validatedRows.length,
    importedCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    invalidCount: 0,
    results: [],
  };

  // Group rows for execution
  for (const item of validatedRows) {
    if (item.status === "INVALID") {
      summary.invalidCount++;
      summary.results.push({
        rowIndex: item.rowIndex,
        clientName: item.normalizedData.name || "Unknown",
        status: "INVALID",
        message: item.errors.join("; "),
      });
      continue;
    }

    if (item.status === "IN_FILE_DUPLICATE") {
      summary.skippedCount++;
      summary.results.push({
        rowIndex: item.rowIndex,
        clientName: item.normalizedData.name,
        status: "SKIPPED",
        message: item.errors.join("; ") || "Skipped as duplicate row in same upload file.",
      });
      continue;
    }

    if (item.status === "EXISTING_MATCH") {
      if (duplicateMode === "SKIP") {
        summary.skippedCount++;
        summary.results.push({
          rowIndex: item.rowIndex,
          clientName: item.normalizedData.name,
          status: "SKIPPED",
          message: `Already exists in firm directory as "${item.existingMatch?.name}" (matched by ${item.existingMatch?.matchedBy}). Skipped per import settings.`,
          clientId: item.existingMatch?.id,
        });
        continue;
      }

      // If duplicateMode === "UPDATE"
      try {
        const existingId = item.existingMatch?.id;
        if (!existingId) {
          throw new Error("Missing existing client identifier for update operation.");
        }

        await db.$transaction(async (tx) => {
          await tx.client.update({
            where: { id: existingId, tenantId },
            data: {
              businessName: item.normalizedData.businessName || undefined,
              planName: item.normalizedData.clientType,
              pan: item.normalizedData.pan || undefined,
              gstin: item.normalizedData.gstin || undefined,
              phone: item.normalizedData.phone,
              city: item.normalizedData.city || undefined,
              state: item.normalizedData.state || undefined,
              pincode: item.normalizedData.pincode || undefined,
              monthlyFee: item.normalizedData.monthlyFee,
              notes: item.normalizedData.notes || undefined,
            },
          });

          // If GSTIN provided and GstProfile does not exist, create it
          if (item.normalizedData.gstin) {
            const profile = await tx.gstProfile.findUnique({
              where: { clientId: existingId },
            });
            if (!profile) {
              await tx.gstProfile.create({
                data: {
                  tenantId,
                  clientId: existingId,
                  gstin: item.normalizedData.gstin,
                  legalName: item.normalizedData.name,
                  tradeName: item.normalizedData.businessName,
                  filingFrequency: "MONTHLY",
                },
              });
            }
          }
        }, {
          maxWait: 10000, // 10s
          timeout: 20000, // 20s
        });

        summary.updatedCount++;
        summary.results.push({
          rowIndex: item.rowIndex,
          clientName: item.normalizedData.name,
          status: "UPDATED",
          message: `Updated existing practice record "${item.existingMatch?.name}".`,
          clientId: existingId,
        });
      } catch (err: any) {
        summary.failedCount++;
        summary.results.push({
          rowIndex: item.rowIndex,
          clientName: item.normalizedData.name,
          status: "FAILED",
          message: `Database error updating existing client: ${err?.message || "Unknown error"}`,
        });
      }
      continue;
    }

    // item.status === "VALID_NEW"
    try {
      const created = await db.$transaction(async (tx) => {
        const client = await tx.client.create({
          data: {
            tenantId,
            name: item.normalizedData.name,
            businessName: item.normalizedData.businessName,
            planName: item.normalizedData.clientType,
            pan: item.normalizedData.pan,
            gstin: item.normalizedData.gstin,
            email: item.normalizedData.email,
            phone: item.normalizedData.phone,
            city: item.normalizedData.city,
            state: item.normalizedData.state,
            pincode: item.normalizedData.pincode,
            monthlyFee: item.normalizedData.monthlyFee,
            notes: item.normalizedData.notes,
            active: true,
          },
        });

        // Create primary contact
        await tx.contact.create({
          data: {
            tenantId,
            clientId: client.id,
            name: item.normalizedData.name,
            designation: "Primary Contact",
            email: item.normalizedData.email,
            phone: item.normalizedData.phone,
            isPrimary: true,
          },
        });

        // Create GST profile if GSTIN provided
        if (item.normalizedData.gstin) {
          await tx.gstProfile.create({
            data: {
              tenantId,
              clientId: client.id,
              gstin: item.normalizedData.gstin,
              legalName: item.normalizedData.name,
              tradeName: item.normalizedData.businessName,
              filingFrequency: "MONTHLY",
            },
          });
        }

        return client;
      }, {
        maxWait: 10000, // 10s
        timeout: 20000, // 20s
      });

      summary.importedCount++;
      summary.results.push({
        rowIndex: item.rowIndex,
        clientName: item.normalizedData.name,
        status: "IMPORTED",
        message: "Successfully onboarded as canonical practice client.",
        clientId: created.id,
      });
    } catch (err: any) {
      summary.failedCount++;
      summary.results.push({
        rowIndex: item.rowIndex,
        clientName: item.normalizedData.name,
        status: "FAILED",
        message: `Database persistence failure: ${err?.message || "Unknown write error"}`,
      });
    }
  }

  // Audit Logging
  await logSecurityEvent({
    tenantId,
    userId: context.user.id,
    action: "CLIENT_BULK_IMPORTED" as any,
    entityType: "CLIENT",
    entityId: "BULK",
    newValue: {
      totalRows: summary.totalRows,
      imported: summary.importedCount,
      updated: summary.updatedCount,
      skipped: summary.skippedCount,
      failed: summary.failedCount,
      mode: duplicateMode,
    },
  });

  await publishDomainEvent({
    tenantId,
    eventType: "clients.bulk_imported",
    entityType: "CLIENT",
    entityId: "BULK",
    payload: {
      importedCount: summary.importedCount,
      updatedCount: summary.updatedCount,
    },
  });

  return summary;
}

/**
 * Generates standard CSV template content for client onboarding with example rows.
 */
export function generateClientImportTemplateCsv(): string {
  const headers = [
    "Legal Name",
    "Trade Name",
    "Entity Type",
    "PAN",
    "GSTIN",
    "Primary Email",
    "Phone",
    "Registered Address",
    "City",
    "State",
    "PIN Code",
    "Monthly Retainer",
    "Notes",
  ];

  const sampleRows = [
    [
      "Zenith Retailers LLP",
      "Zenith Mart",
      "LLP",
      "AABFZ1234A",
      "27AABFZ1234A1Z5",
      "accounts@zenithretail.in",
      "9820012345",
      "Shop 4, Linking Road, Bandra West",
      "Mumbai",
      "Maharashtra",
      "400050",
      "35000",
      "Quarterly review client",
    ],
    [
      "Apex Infotech Solutions Pvt Ltd",
      "Apex Cloud",
      "Pvt Ltd",
      "AAACA5678B",
      "29AAACA5678B1Z2",
      "finance@apexinfo.co.in",
      "9845012345",
      "Tower B, Tech Park, Whitefield",
      "Bengaluru",
      "Karnataka",
      "560066",
      "60000",
      "Monthly statutory retainer",
    ],
    [
      "Rajesh Kumar & Sons",
      "Rajesh Agro",
      "Partnership",
      "AAAFR9012C",
      "",
      "rajesh@rajeshagro.in",
      "9811012345",
      "Grain Market, GT Road",
      "Karnal",
      "Haryana",
      "132001",
      "15000",
      "Composition dealer",
    ],
  ];

  const csvRows = [
    headers.map(sanitizeCsvCell).join(","),
    ...sampleRows.map((row) => row.map(sanitizeCsvCell).join(",")),
  ];

  return csvRows.join("\r\n");
}

/**
 * Generates a downloadable CSV audit and error report for an import execution.
 */
export function generateImportErrorReportCsv(summary: BulkImportSummary): string {
  const headers = ["Row #", "Client Name", "Status", "Details / Resolution", "Client ID"];

  const rows = summary.results.map((r) => [
    sanitizeCsvCell(r.rowIndex),
    sanitizeCsvCell(r.clientName),
    sanitizeCsvCell(r.status),
    sanitizeCsvCell(r.message),
    sanitizeCsvCell(r.clientId || ""),
  ]);

  return [headers.join(","), ...rows.map((row) => row.join(","))].join("\r\n");
}
