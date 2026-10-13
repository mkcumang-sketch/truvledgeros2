// Maximum upload limits
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_IMPORT_ROWS = 500; // Sensible batch limit for practice safety

// Supported field definitions for client import
export const SUPPORTED_IMPORT_FIELDS = [
  { key: "name", label: "Legal / Entity Name", required: true, aliases: ["legal name", "company name", "entity name", "client name", "name", "business"] },
  { key: "businessName", label: "Trade Name / Alias", required: false, aliases: ["trade name", "brand name", "dba", "alias", "business name"] },
  { key: "clientType", label: "Entity Constitution", required: false, aliases: ["entity type", "constitution", "type", "structure"] },
  { key: "pan", label: "Permanent Account Number (PAN)", required: false, aliases: ["pan", "pan number", "it pan", "pan no"] },
  { key: "gstin", label: "GST Identification Number (GSTIN)", required: false, aliases: ["gstin", "gst no", "gst number", "gst in"] },
  { key: "email", label: "Primary Email Address", required: true, aliases: ["email", "primary email", "contact email", "e-mail"] },
  { key: "phone", label: "Contact Phone Number", required: true, aliases: ["phone", "mobile", "contact number", "phone number", "telephone", "mobile no"] },
  { key: "address", label: "Registered Address", required: false, aliases: ["address", "registered address", "street", "location"] },
  { key: "city", label: "City", required: false, aliases: ["city", "town", "district"] },
  { key: "state", label: "State / UT", required: false, aliases: ["state", "province", "state/ut", "state ut"] },
  { key: "pincode", label: "PIN Code", required: false, aliases: ["pincode", "pin code", "pin", "postal code", "zip"] },
  { key: "monthlyFee", label: "Monthly Retainer Fee (INR)", required: false, aliases: ["monthly fee", "retainer fee", "monthly retainer", "retainer", "fee"] },
  { key: "notes", label: "Internal Notes / Remarks", required: false, aliases: ["notes", "remarks", "comments", "internal notes"] },
] as const;

export type ImportFieldKey = typeof SUPPORTED_IMPORT_FIELDS[number]["key"];

export type RowValidationStatus =
  | "VALID_NEW"
  | "EXISTING_MATCH"
  | "IN_FILE_DUPLICATE"
  | "INVALID";

export interface ParsedFileResult {
  headers: string[];
  suggestedMappings: Record<string, ImportFieldKey | "">;
  rowCount: number;
  sampleRows: Record<string, any>[];
  allRows: Record<string, any>[];
  fileName: string;
}

export interface ValidatedImportRow {
  rowIndex: number; // 1-based (spreadsheet row)
  rawRow: Record<string, any>;
  normalizedData: {
    name: string;
    businessName: string | null;
    clientType: string;
    pan: string | null;
    gstin: string | null;
    email: string;
    phone: string;
    address: string | null;
    city: string | null;
    state: string | null;
    pincode: string | null;
    monthlyFee: number;
    notes: string | null;
  };
  status: RowValidationStatus;
  errors: string[];
  existingMatch?: {
    id: string;
    name: string;
    pan?: string | null;
    gstin?: string | null;
    matchedBy: "PAN" | "GSTIN" | "EMAIL" | "NAME";
  };
}

export interface BulkImportSummary {
  totalRows: number;
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  invalidCount: number;
  results: Array<{
    rowIndex: number;
    clientName: string;
    status: "IMPORTED" | "UPDATED" | "SKIPPED" | "FAILED" | "INVALID";
    message: string;
    clientId?: string;
  }>;
}
