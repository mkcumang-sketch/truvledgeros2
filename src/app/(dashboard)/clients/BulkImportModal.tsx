"use client";

import React, { useState, useRef } from "react";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Download,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  FileText,
  AlertCircle,
  HelpCircle,
  Copy,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  SUPPORTED_IMPORT_FIELDS,
  ImportFieldKey,
  ParsedFileResult,
  ValidatedImportRow,
  BulkImportSummary,
} from "@/lib/constants/import-definitions";
import {
  parseImportFileAction,
  validateImportRowsAction,
  executeBulkImportAction,
  getClientImportTemplateCsvAction,
} from "@/lib/server/actions/import-actions";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

type Step = "UPLOAD" | "MAPPING" | "PREVIEW" | "CONFIG" | "PROCESSING" | "REPORT";

export function BulkImportModal({ isOpen, onClose, onImportComplete }: Props) {
  const [currentStep, setCurrentStep] = useState<Step>("UPLOAD");
  const [file, setFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);

  // Parsed result from Step 1
  const [parsedData, setParsedData] = useState<ParsedFileResult | null>(null);

  // Column Mappings from Step 2: spreadsheet header -> field key
  const [columnMappings, setColumnMappings] = useState<Record<string, string>>({});

  // Validated rows from Step 3
  const [isValidating, setIsValidating] = useState(false);
  const [validatedRows, setValidatedRows] = useState<ValidatedImportRow[]>([]);
  const [previewFilter, setPreviewFilter] = useState<"ALL" | "VALID" | "MATCH" | "DUP" | "INVALID">("ALL");

  // Configuration from Step 4
  const [duplicateMode, setDuplicateMode] = useState<"SKIP" | "UPDATE">("SKIP");

  // Execution from Step 5
  const [isExecuting, setIsExecuting] = useState(false);
  const [importSummary, setImportSummary] = useState<BulkImportSummary | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  function resetState() {
    setCurrentStep("UPLOAD");
    setFile(null);
    setUploadError(null);
    setIsParsing(false);
    setParsedData(null);
    setColumnMappings({});
    setIsValidating(false);
    setValidatedRows([]);
    setPreviewFilter("ALL");
    setDuplicateMode("SKIP");
    setIsExecuting(false);
    setImportSummary(null);
  }

  function handleClose() {
    if (isExecuting) return; // Prevent closing mid-transaction
    resetState();
    onClose();
  }

  // Download Sample Template
  async function handleDownloadTemplate() {
    const res = await getClientImportTemplateCsvAction();
    if (res.success && res.data) {
      const blob = new Blob([res.data], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "truv_clients_import_template.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }

  // Handle File Selection
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setUploadError(null);
    const selected = e.target.files?.[0];
    if (!selected) return;

    const ext = selected.name.toLowerCase().split(".").pop();
    if (!ext || ext !== "csv") {
      setUploadError("Only standard CSV (.csv) files are supported. Excel workbooks (.xlsx, .xls) are disabled for security.");
      return;
    }

    if (selected.size > 5 * 1024 * 1024) {
      setUploadError("File size exceeds 5MB limit. Please upload a smaller CSV file.");
      return;
    }

    setFile(selected);
  }

  // Step 1 -> Step 2: Upload & Parse
  async function handleParseFile() {
    if (!file) {
      setUploadError("Please select a CSV file first.");
      return;
    }

    setIsParsing(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await parseImportFileAction(formData);
      if (!res.success || !res.data) {
        setUploadError(res.error || "Failed to parse spreadsheet.");
        setIsParsing(false);
        return;
      }

      setParsedData(res.data);
      setColumnMappings(res.data.suggestedMappings);
      setCurrentStep("MAPPING");
    } catch (err: any) {
      setUploadError(err.message || "An unexpected error occurred while parsing the file.");
    } finally {
      setIsParsing(false);
    }
  }

  // Step 2 -> Step 3: Validate Rows
  async function handleValidateMappings() {
    if (!parsedData) return;

    // Check that required fields are mapped
    const mappedValues = Object.values(columnMappings);
    const missingRequired: string[] = [];
    if (!mappedValues.includes("name")) missingRequired.push("Legal / Entity Name");
    if (!mappedValues.includes("email")) missingRequired.push("Primary Email Address");
    if (!mappedValues.includes("phone")) missingRequired.push("Contact Phone Number");

    if (missingRequired.length > 0) {
      setUploadError(`Please map all required fields: ${missingRequired.join(", ")}`);
      return;
    }

    setIsValidating(true);
    setUploadError(null);

    try {
      const res = await validateImportRowsAction(parsedData.allRows, columnMappings);
      if (!res.success || !res.data) {
        setUploadError(res.error || "Failed to validate spreadsheet rows.");
        setIsValidating(false);
        return;
      }

      setValidatedRows(res.data);
      setCurrentStep("PREVIEW");
    } catch (err: any) {
      setUploadError(err.message || "An unexpected error occurred during row validation.");
    } finally {
      setIsValidating(false);
    }
  }

  // Step 3 -> Step 4: Configure Duplicate Strategy
  function handleProceedToConfig() {
    setCurrentStep("CONFIG");
  }

  // Step 4 -> Step 5 & 6: Execute Import
  async function handleExecuteImport() {
    if (validatedRows.length === 0) return;

    setIsExecuting(true);
    setCurrentStep("PROCESSING");
    setUploadError(null);

    try {
      const res = await executeBulkImportAction(validatedRows, duplicateMode);
      if (!res.success || !res.data) {
        setUploadError(res.error || "Failed to persist imported clients.");
        setCurrentStep("CONFIG");
        setIsExecuting(false);
        return;
      }

      setImportSummary(res.data);
      setCurrentStep("REPORT");
      onImportComplete(); // Refresh parent directory
    } catch (err: any) {
      setUploadError(err.message || "An error occurred while persisting records to the database.");
      setCurrentStep("CONFIG");
    } finally {
      setIsExecuting(false);
    }
  }

  // Download Audit / Error Report
  function handleDownloadReport() {
    if (!importSummary) return;

    // Generate CSV content with formula injection protection
    const headers = ["Row #", "Client Name", "Status", "Resolution Details", "Client ID"];
    const rows = importSummary.results.map((r) => {
      const cleanRow = String(r.rowIndex);
      let cleanName = String(r.clientName || "").replace(/"/g, '""');
      if (/^[=+\-@\t\r]/.test(cleanName)) cleanName = `'${cleanName}`;

      const cleanStatus = r.status;
      let cleanMsg = String(r.message || "").replace(/"/g, '""');
      if (/^[=+\-@\t\r]/.test(cleanMsg)) cleanMsg = `'${cleanMsg}`;

      const cleanId = r.clientId || "";
      return `"${cleanRow}","${cleanName}","${cleanStatus}","${cleanMsg}","${cleanId}"`;
    });

    const csvContent = [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `truv_import_audit_report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Filter preview rows
  const filteredPreviewRows = validatedRows.filter((r) => {
    if (previewFilter === "VALID") return r.status === "VALID_NEW";
    if (previewFilter === "MATCH") return r.status === "EXISTING_MATCH";
    if (previewFilter === "DUP") return r.status === "IN_FILE_DUPLICATE";
    if (previewFilter === "INVALID") return r.status === "INVALID";
    return true;
  });

  const validNewCount = validatedRows.filter((r) => r.status === "VALID_NEW").length;
  const existingMatchCount = validatedRows.filter((r) => r.status === "EXISTING_MATCH").length;
  const inFileDupCount = validatedRows.filter((r) => r.status === "IN_FILE_DUPLICATE").length;
  const invalidCount = validatedRows.filter((r) => r.status === "INVALID").length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-graphite-950/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-xl border border-[#E2E0D8] flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E2E0D8] bg-[#FAF9F5] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shadow-2xs font-semibold">
              <FileSpreadsheet className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <h2 className="text-base font-bold text-graphite-900 tracking-tight">
                Bulk Client Master Import
              </h2>
              <p className="text-xs text-graphite-500">
                Batch onboarding for existing Indian CA practice clients from Excel or CSV
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={isExecuting}
            className="text-graphite-400 hover:text-graphite-700 p-1.5 rounded-lg hover:bg-neutral-100 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Step Indicator */}
        <div className="px-6 py-2.5 bg-white border-b border-[#E2E0D8] flex items-center justify-between text-xs font-medium text-graphite-500 overflow-x-auto gap-2">
          <div className={`flex items-center gap-1.5 ${currentStep === "UPLOAD" ? "text-emerald-700 font-bold" : ""}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${currentStep === "UPLOAD" ? "bg-emerald-600 text-white" : "bg-neutral-100"}`}>1</span>
            <span>Upload File</span>
          </div>
          <span className="text-neutral-300">→</span>
          <div className={`flex items-center gap-1.5 ${currentStep === "MAPPING" ? "text-emerald-700 font-bold" : ""}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${currentStep === "MAPPING" ? "bg-emerald-600 text-white" : "bg-neutral-100"}`}>2</span>
            <span>Map Columns</span>
          </div>
          <span className="text-neutral-300">→</span>
          <div className={`flex items-center gap-1.5 ${currentStep === "PREVIEW" ? "text-emerald-700 font-bold" : ""}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${currentStep === "PREVIEW" ? "bg-emerald-600 text-white" : "bg-neutral-100"}`}>3</span>
            <span>Validation Preview</span>
          </div>
          <span className="text-neutral-300">→</span>
          <div className={`flex items-center gap-1.5 ${currentStep === "CONFIG" ? "text-emerald-700 font-bold" : ""}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${currentStep === "CONFIG" ? "bg-emerald-600 text-white" : "bg-neutral-100"}`}>4</span>
            <span>Settings</span>
          </div>
          <span className="text-neutral-300">→</span>
          <div className={`flex items-center gap-1.5 ${currentStep === "REPORT" ? "text-emerald-700 font-bold" : ""}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${currentStep === "REPORT" ? "bg-emerald-600 text-white" : "bg-neutral-100"}`}>5</span>
            <span>Final Report</span>
          </div>
        </div>

        {/* Global Error Banner */}
        {uploadError && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span className="flex-1">{uploadError}</span>
            <button onClick={() => setUploadError(null)} className="text-rose-600 hover:text-rose-900 font-bold">
              ✕
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* STEP 1: UPLOAD */}
          {currentStep === "UPLOAD" && (
            <div className="space-y-6">
              {/* Guidance Box */}
              <div className="p-4 rounded-xl bg-[#FAF9F5] border border-[#E2E0D8] text-xs text-graphite-700 space-y-2">
                <div className="font-semibold text-graphite-900 flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-emerald-600" />
                  <span>Spreadsheet Requirements & Guidelines</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-graphite-600 pl-1">
                  <li>Accepted file format: <strong>.csv</strong> only (up to 5MB, max 500 rows per batch). Excel workbooks (.xlsx/.xls) are disabled for security.</li>
                  <li>Required columns: <strong>Legal Name</strong>, <strong>Primary Email</strong>, and <strong>Phone Number</strong>.</li>
                  <li>Optional practice fields: Trade Name, Entity Type, PAN, GSTIN, Address, City, State, PIN Code, and Monthly Retainer Fee.</li>
                  <li>All tax identifiers (PAN/GSTIN) undergo local format validation before saving.</li>
                </ul>
                <div className="pt-2">
                  <Button variant="ghost" size="sm" onClick={handleDownloadTemplate} className="text-emerald-700 hover:bg-emerald-50">
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    Download Sample CSV Template
                  </Button>
                </div>
              </div>

              {/* Drag & Drop Area */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-[#E2E0D8] hover:border-emerald-500 rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-colors bg-[#FAF9F5]/50 hover:bg-emerald-50/20 group"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".csv,text/csv"
                  className="hidden"
                />
                <div className="w-12 h-12 mx-auto rounded-2xl bg-white border border-[#E2E0D8] group-hover:border-emerald-300 text-emerald-600 flex items-center justify-center shadow-xs transition-transform group-hover:scale-105">
                  <Upload className="w-6 h-6" />
                </div>
                <div className="mt-4">
                  <span className="text-sm font-semibold text-graphite-900 group-hover:text-emerald-700">
                    {file ? file.name : "Click to select or drag CSV file here"}
                  </span>
                  <p className="text-xs text-graphite-500 mt-1">
                    {file ? `${(file.size / 1024).toFixed(1)} KB — Ready to parse` : "Strictly CSV (.csv) format only"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: COLUMN MAPPING */}
          {currentStep === "MAPPING" && parsedData && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-graphite-900">Map Spreadsheet Columns to LedgerOS Fields</h3>
                  <p className="text-xs text-graphite-500">
                    Verify auto-suggested column matches. Adjust dropdowns for any custom column names.
                  </p>
                </div>
                <Badge variant="neutral" size="sm">
                  {parsedData.rowCount} Rows Detected
                </Badge>
              </div>

              <div className="border border-[#E2E0D8] rounded-xl overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-[#FAF9F5] text-[11px] font-semibold text-graphite-600 border-b border-[#E2E0D8] uppercase">
                    <tr>
                      <th className="py-2.5 px-4">Spreadsheet Column Header</th>
                      <th className="py-2.5 px-4">Sample Value (Row 1)</th>
                      <th className="py-2.5 px-4">Target LedgerOS Field</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E0D8]">
                    {parsedData.headers.map((header) => {
                      const sampleVal = parsedData.sampleRows[0]?.[header] || "—";
                      const currentMappedField = columnMappings[header] || "";
                      const isRequired = SUPPORTED_IMPORT_FIELDS.find((f) => f.key === currentMappedField)?.required;

                      return (
                        <tr key={header} className="hover:bg-[#FAF9F5]/60 transition-colors">
                          <td className="py-2.5 px-4 font-semibold text-graphite-900">
                            {header}
                          </td>
                          <td className="py-2.5 px-4 text-graphite-500 truncate max-w-[200px]">
                            {String(sampleVal)}
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="flex items-center gap-2">
                              <select
                                value={currentMappedField}
                                onChange={(e) => {
                                  setColumnMappings({
                                    ...columnMappings,
                                    [header]: e.target.value,
                                  });
                                }}
                                className="h-8 px-2.5 bg-white border border-[#E2E0D8] rounded-lg text-xs font-medium text-graphite-800 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                              >
                                <option value="">— Ignore this column —</option>
                                {SUPPORTED_IMPORT_FIELDS.map((field) => (
                                  <option key={field.key} value={field.key}>
                                    {field.label} {field.required ? "(Required)" : ""}
                                  </option>
                                ))}
                              </select>
                              {isRequired && (
                                <Badge variant="success" size="sm">Required</Badge>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* STEP 3: VALIDATION PREVIEW */}
          {currentStep === "PREVIEW" && (
            <div className="space-y-4">
              {/* Summary Metric Pills */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <button
                  type="button"
                  onClick={() => setPreviewFilter("ALL")}
                  className={`p-3 rounded-xl border text-left transition-all ${previewFilter === "ALL" ? "border-graphite-900 bg-neutral-50 ring-1 ring-graphite-900" : "border-[#E2E0D8] bg-white hover:bg-neutral-50"}`}
                >
                  <div className="text-[11px] text-graphite-500 font-medium">All Rows</div>
                  <div className="text-lg font-bold text-graphite-900">{validatedRows.length}</div>
                </button>

                <button
                  type="button"
                  onClick={() => setPreviewFilter("VALID")}
                  className={`p-3 rounded-xl border text-left transition-all ${previewFilter === "VALID" ? "border-emerald-600 bg-emerald-50/50 ring-1 ring-emerald-600" : "border-[#E2E0D8] bg-white hover:bg-neutral-50"}`}
                >
                  <div className="text-[11px] text-emerald-700 font-medium">Valid New Clients</div>
                  <div className="text-lg font-bold text-emerald-800">{validNewCount}</div>
                </button>

                <button
                  type="button"
                  onClick={() => setPreviewFilter("MATCH")}
                  className={`p-3 rounded-xl border text-left transition-all ${previewFilter === "MATCH" ? "border-amber-500 bg-amber-50/50 ring-1 ring-amber-500" : "border-[#E2E0D8] bg-white hover:bg-neutral-50"}`}
                >
                  <div className="text-[11px] text-amber-700 font-medium">Existing Firm Matches</div>
                  <div className="text-lg font-bold text-amber-800">{existingMatchCount}</div>
                </button>

                <button
                  type="button"
                  onClick={() => setPreviewFilter("INVALID")}
                  className={`p-3 rounded-xl border text-left transition-all ${previewFilter === "INVALID" ? "border-rose-500 bg-rose-50/50 ring-1 ring-rose-500" : "border-[#E2E0D8] bg-white hover:bg-neutral-50"}`}
                >
                  <div className="text-[11px] text-rose-700 font-medium">Invalid / Conflicts</div>
                  <div className="text-lg font-bold text-rose-800">{invalidCount + inFileDupCount}</div>
                </button>
              </div>

              {/* Data Table */}
              <div className="border border-[#E2E0D8] rounded-xl overflow-hidden text-xs max-h-[380px] overflow-y-auto">
                <table className="w-full text-left">
                  <thead className="bg-[#FAF9F5] text-[10px] font-semibold text-graphite-600 border-b border-[#E2E0D8] uppercase sticky top-0 z-10">
                    <tr>
                      <th className="py-2 px-3">Row #</th>
                      <th className="py-2 px-3">Legal Name</th>
                      <th className="py-2 px-3">Tax Identifiers</th>
                      <th className="py-2 px-3">Contact</th>
                      <th className="py-2 px-3">Validation Status</th>
                      <th className="py-2 px-3">Action Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E0D8]">
                    {filteredPreviewRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-graphite-500">
                          No rows match this filter tab.
                        </td>
                      </tr>
                    ) : (
                      filteredPreviewRows.map((r) => {
                        return (
                          <tr key={r.rowIndex} className="hover:bg-[#FAF9F5]/40 transition-colors">
                            <td className="py-2 px-3 text-graphite-400 font-mono text-[11px]">
                              {r.rowIndex}
                            </td>
                            <td className="py-2 px-3 font-semibold text-graphite-900">
                              <div>{r.normalizedData.name || "—"}</div>
                              {r.normalizedData.businessName && (
                                <div className="text-[10px] text-graphite-500 font-normal">
                                  {r.normalizedData.businessName}
                                </div>
                              )}
                            </td>
                            <td className="py-2 px-3">
                              <div className="space-y-0.5">
                                {r.normalizedData.pan && (
                                  <span className="inline-block px-1.5 py-0.5 bg-neutral-100 rounded text-[10px] font-mono font-medium text-graphite-700">
                                    PAN: {r.normalizedData.pan}
                                  </span>
                                )}
                                {r.normalizedData.gstin && (
                                  <span className="block px-1.5 py-0.5 bg-neutral-100 rounded text-[10px] font-mono font-medium text-graphite-700">
                                    GST: {r.normalizedData.gstin}
                                  </span>
                                )}
                                {!r.normalizedData.pan && !r.normalizedData.gstin && (
                                  <span className="text-graphite-400 text-[10px]">—</span>
                                )}
                              </div>
                            </td>
                            <td className="py-2 px-3 text-graphite-600">
                              <div>{r.normalizedData.email}</div>
                              <div className="text-[10px] text-graphite-400">{r.normalizedData.phone}</div>
                            </td>
                            <td className="py-2 px-3">
                              {r.status === "VALID_NEW" && (
                                <Badge variant="success" size="sm">Valid New</Badge>
                              )}
                              {r.status === "EXISTING_MATCH" && (
                                <Badge variant="warning" size="sm">Existing Match</Badge>
                              )}
                              {r.status === "IN_FILE_DUPLICATE" && (
                                <Badge variant="warning" size="sm">In-File Duplicate</Badge>
                              )}
                              {r.status === "INVALID" && (
                                <Badge variant="danger" size="sm">Invalid</Badge>
                              )}
                            </td>
                            <td className="py-2 px-3 text-[11px]">
                              {r.status === "VALID_NEW" && (
                                <span className="text-emerald-700">Ready to import as new client</span>
                              )}
                              {r.status === "EXISTING_MATCH" && (
                                <span className="text-amber-700">
                                  Matches &quot;{r.existingMatch?.name}&quot; ({r.existingMatch?.matchedBy})
                                </span>
                              )}
                              {r.status === "IN_FILE_DUPLICATE" && (
                                <span className="text-orange-700">{r.errors[0]}</span>
                              )}
                              {r.status === "INVALID" && (
                                <span className="text-rose-700 font-medium">{r.errors.join("; ")}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* STEP 4: CONFIGURATION */}
          {currentStep === "CONFIG" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-graphite-900">Import Configuration & Duplicate Handling</h3>
                <p className="text-xs text-graphite-500 mt-0.5">
                  Choose how existing client records matched in your practice database should be handled.
                </p>
              </div>

              {/* Radio Group */}
              <div className="space-y-3">
                <label className={`block p-4 rounded-xl border cursor-pointer transition-all ${duplicateMode === "SKIP" ? "border-emerald-600 bg-emerald-50/40 ring-1 ring-emerald-600" : "border-[#E2E0D8] bg-white hover:bg-[#FAF9F5]"}`}>
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="dupMode"
                      value="SKIP"
                      checked={duplicateMode === "SKIP"}
                      onChange={() => setDuplicateMode("SKIP")}
                      className="mt-1 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-graphite-900 flex items-center gap-2">
                        <span>Skip Existing Records (Recommended)</span>
                        <Badge variant="success" size="sm">Safe Default</Badge>
                      </div>
                      <p className="text-xs text-graphite-600 mt-1">
                        Only import valid new clients. Any spreadsheet rows matching existing firm clients by PAN, GSTIN, Email, or Legal Name will be safely skipped. Existing practice records will not be altered.
                      </p>
                    </div>
                  </div>
                </label>

                <label className={`block p-4 rounded-xl border cursor-pointer transition-all ${duplicateMode === "UPDATE" ? "border-amber-600 bg-amber-50/40 ring-1 ring-amber-600" : "border-[#E2E0D8] bg-white hover:bg-[#FAF9F5]"}`}>
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="dupMode"
                      value="UPDATE"
                      checked={duplicateMode === "UPDATE"}
                      onChange={() => setDuplicateMode("UPDATE")}
                      className="mt-1 text-amber-600 focus:ring-amber-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-graphite-900 flex items-center gap-2">
                        <span>Update Existing Clients with Spreadsheet Data</span>
                        <Badge variant="warning" size="sm">Requires Caution</Badge>
                      </div>
                      <p className="text-xs text-graphite-600 mt-1">
                        Updates matched existing client records with trade names, phone numbers, addresses, and retainers from the spreadsheet. Historical invoices, payments, and compliance history are strictly preserved.
                      </p>
                    </div>
                  </div>
                </label>
              </div>

              {/* Confirmation Box */}
              <div className="p-4 rounded-xl bg-[#FAF9F5] border border-[#E2E0D8] text-xs space-y-2">
                <div className="font-semibold text-graphite-900">Execution Summary:</div>
                <div className="text-graphite-700 flex flex-wrap gap-x-6 gap-y-1">
                  <div>• <strong>{validNewCount}</strong> new clients will be inserted into the database.</div>
                  {duplicateMode === "SKIP" ? (
                    <div>• <strong>{existingMatchCount + inFileDupCount}</strong> duplicate rows will be skipped.</div>
                  ) : (
                    <div>• <strong>{existingMatchCount}</strong> existing clients will have profile information refreshed.</div>
                  )}
                  {invalidCount > 0 && (
                    <div className="text-rose-700">• <strong>{invalidCount}</strong> invalid rows will be rejected.</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: PROCESSING */}
          {currentStep === "PROCESSING" && (
            <div className="py-16 text-center space-y-4">
              <div className="w-12 h-12 mx-auto rounded-full border-3 border-emerald-600 border-t-transparent animate-spin" />
              <div>
                <h3 className="text-base font-bold text-graphite-900">Persisting Client Records...</h3>
                <p className="text-xs text-graphite-500 mt-1">
                  Enforcing tenant isolation and database transactions. Please do not close this window.
                </p>
              </div>
            </div>
          )}

          {/* STEP 6: FINAL REPORT */}
          {currentStep === "REPORT" && importSummary && (
            <div className="space-y-6">
              {/* Success Banner */}
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
                <div>
                  <h3 className="text-sm font-bold">Client Master Import Completed</h3>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    Your practice directory and dashboard analytics have been synchronized with the canonical database.
                  </p>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-[#FAF9F5] border border-[#E2E0D8]">
                  <div className="text-[11px] text-graphite-500 font-medium">Successfully Imported</div>
                  <div className="text-xl font-bold text-emerald-700 mt-0.5">{importSummary.importedCount}</div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#FAF9F5] border border-[#E2E0D8]">
                  <div className="text-[11px] text-graphite-500 font-medium">Updated Records</div>
                  <div className="text-xl font-bold text-amber-700 mt-0.5">{importSummary.updatedCount}</div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#FAF9F5] border border-[#E2E0D8]">
                  <div className="text-[11px] text-graphite-500 font-medium">Skipped Duplicates</div>
                  <div className="text-xl font-bold text-graphite-700 mt-0.5">{importSummary.skippedCount}</div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#FAF9F5] border border-[#E2E0D8]">
                  <div className="text-[11px] text-graphite-500 font-medium">Rejected / Failed</div>
                  <div className="text-xl font-bold text-rose-700 mt-0.5">{importSummary.invalidCount + importSummary.failedCount}</div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2">
                <Button variant="secondary" size="sm" onClick={handleDownloadReport}>
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Download Audit & Error Report (.CSV)
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="px-6 py-3.5 border-t border-[#E2E0D8] bg-[#FAF9F5] flex items-center justify-between flex-shrink-0">
          <div>
            {currentStep === "MAPPING" && (
              <Button variant="ghost" size="sm" onClick={() => setCurrentStep("UPLOAD")}>
                <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
                Back to Upload
              </Button>
            )}
            {currentStep === "PREVIEW" && (
              <Button variant="ghost" size="sm" onClick={() => setCurrentStep("MAPPING")}>
                <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
                Back to Mapping
              </Button>
            )}
            {currentStep === "CONFIG" && (
              <Button variant="ghost" size="sm" onClick={() => setCurrentStep("PREVIEW")}>
                <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
                Back to Preview
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {currentStep === "UPLOAD" && (
              <>
                <Button variant="ghost" size="sm" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleParseFile}
                  disabled={!file || isParsing}
                >
                  {isParsing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Parsing Workbook...
                    </>
                  ) : (
                    <>
                      Upload & Parse Spreadsheet
                      <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                    </>
                  )}
                </Button>
              </>
            )}

            {currentStep === "MAPPING" && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleValidateMappings}
                disabled={isValidating}
              >
                {isValidating ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Validating Rows...
                  </>
                ) : (
                  <>
                    Validate Rows
                    <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                  </>
                )}
              </Button>
            )}

            {currentStep === "PREVIEW" && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleProceedToConfig}
                disabled={validNewCount === 0 && existingMatchCount === 0}
              >
                Proceed to Settings
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            )}

            {currentStep === "CONFIG" && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleExecuteImport}
                disabled={isExecuting}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                Confirm & Import Records
              </Button>
            )}

            {currentStep === "REPORT" && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleClose}
              >
                Done / View Directory
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
