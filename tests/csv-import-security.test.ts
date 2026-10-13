import {
  parseClientImportFile,
  parseCsvText,
  sanitizeImportCell,
  MAX_FILE_SIZE_BYTES,
  MAX_IMPORT_ROWS,
} from "../src/lib/server/import/client-import-service";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`\x1b[32m✔ PASS\x1b[0m: ${testName}`);
    passed++;
  } else {
    console.error(`\x1b[31m✖ FAIL\x1b[0m: ${testName} ${detail ? `(${detail})` : ""}`);
    failed++;
  }
}

async function runCsvSecuritySuite() {
  console.log("=================================================================");
  console.log("TRUV LedgerOS — Task 1: CSV-Only Import Security Verification");
  console.log("=================================================================\n");

  // TEST 1: Valid RFC 4180 CSV with quotes, commas, and multiline values
  console.log(">>> [Test 1] Valid RFC 4180 CSV Parsing <<<");
  const validCsv = `Legal Name,Primary Email,Contact Phone,Address,Monthly Retainer
"Tata Sons Private Limited",accounts@tata.com,9820011111,"Bombay House, 24 Homi Mody Street,
Fort, Mumbai",150000
"Reliance Industries, Ltd.",corp@ril.com,9820022222,"Maker Chambers IV, Nariman Point",200000`;

  const parsed = parseClientImportFile(Buffer.from(validCsv, "utf-8"), "test.csv");
  assert(parsed.rowCount === 2, "1.1 Valid CSV parsed exactly 2 rows");
  assert(parsed.headers.length === 5, "1.2 Headers parsed correctly");
  assert(parsed.sampleRows[0]["Legal Name"] === "Tata Sons Private Limited", "1.3 Quoted legal name parsed cleanly");
  assert(parsed.sampleRows[0]["Address"].includes("Bombay House"), "1.4 Multiline quoted field preserved");
  assert(parsed.sampleRows[1]["Legal Name"] === "Reliance Industries, Ltd.", "1.5 Embedded comma within quotes preserved");

  // TEST 2: Rejection of .xlsx and .xls extensions
  console.log("\n>>> [Test 2] Rejection of Workbook Extensions <<<");
  let xlsxExtRejected = false;
  try {
    parseClientImportFile(Buffer.from("Col1,Col2\nVal1,Val2"), "data.xlsx");
  } catch (err: any) {
    xlsxExtRejected = err.message.includes("Only standard CSV") || err.message.includes(".xlsx");
  }
  assert(xlsxExtRejected, "2.1 Rejection of .xlsx extension");

  let xlsExtRejected = false;
  try {
    parseClientImportFile(Buffer.from("Col1,Col2\nVal1,Val2"), "data.xls");
  } catch (err: any) {
    xlsExtRejected = err.message.includes("Only standard CSV") || err.message.includes(".xls");
  }
  assert(xlsExtRejected, "2.2 Rejection of .xls extension");

  // TEST 3: Rejection of Renamed Workbook Files (Magic Byte Inspection)
  console.log("\n>>> [Test 3] Rejection of Renamed Workbook Files <<<");
  // ZIP / OpenXML (.xlsx disguised as .csv)
  const fakeZipXlsx = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);
  let renamedXlsxRejected = false;
  try {
    parseClientImportFile(fakeZipXlsx, "disguised_spreadsheet.csv");
  } catch (err: any) {
    renamedXlsxRejected = err.message.includes("OpenXML workbooks (.xlsx) are disabled");
  }
  assert(renamedXlsxRejected, "3.1 Renamed .xlsx file disguised as .csv rejected via magic bytes (PK\\x03\\x04)");

  // OLE2 Compound Document (.xls disguised as .csv)
  const fakeOle2Xls = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  let renamedXlsRejected = false;
  try {
    parseClientImportFile(fakeOle2Xls, "legacy_sheet.csv");
  } catch (err: any) {
    renamedXlsRejected = err.message.includes("binary workbooks (.xls) are disabled");
  }
  assert(renamedXlsRejected, "3.2 Renamed .xls file disguised as .csv rejected via magic bytes (\\xD0\\xCF\\x11\\xE0)");

  // TEST 4: Rejection of Binary Files & Null Bytes
  console.log("\n>>> [Test 4] Rejection of Binary Files & Control Codes <<<");
  const binaryPayload = Buffer.from("Legal Name,Email\x00,Phone\nCompany,corp@com,99999", "utf-8");
  let nullByteRejected = false;
  try {
    parseClientImportFile(binaryPayload, "nullbyte.csv");
  } catch (err: any) {
    nullByteRejected = err.message.includes("illegal binary control codes");
  }
  assert(nullByteRejected, "4.1 CSV containing binary null byte rejected");

  // TEST 5: Oversized File Protection (>5MB)
  console.log("\n>>> [Test 5] Oversized File Protection <<<");
  const oversizedBuffer = Buffer.alloc(MAX_FILE_SIZE_BYTES + 1024, "A");
  let oversizedRejected = false;
  try {
    parseClientImportFile(oversizedBuffer, "huge.csv");
  } catch (err: any) {
    oversizedRejected = err.message.includes("exceeds the maximum allowed limit of 5MB");
  }
  assert(oversizedRejected, "5.1 File exceeding 5MB rejected before parsing");

  // TEST 6: Row Limit Protection (>500 rows)
  console.log("\n>>> [Test 6] Row Limit Protection <<<");
  let longCsv = "Legal Name,Primary Email,Contact Phone\n";
  for (let r = 1; r <= 505; r++) {
    longCsv += `Client ${r},client${r}@domain.com,9820000000\n`;
  }
  let rowLimitExceeded = false;
  try {
    parseClientImportFile(Buffer.from(longCsv, "utf-8"), "large_batch.csv");
  } catch (err: any) {
    rowLimitExceeded = err.message.includes("exceeds the maximum limit of 500 rows");
  }
  assert(rowLimitExceeded, "6.1 CSV exceeding 500 rows rejected");

  // TEST 7: Malformed CSV (Unclosed Quotes)
  console.log("\n>>> [Test 7] Malformed CSV Detection <<<");
  const unclosedCsv = `Legal Name,Primary Email,Phone\n"Unclosed Quote Company,billing@unclosed.com,9820011111\nNext Row,email,phone`;
  let malformedRejected = false;
  try {
    parseClientImportFile(Buffer.from(unclosedCsv, "utf-8"), "broken.csv");
  } catch (err: any) {
    malformedRejected = err.message.includes("Malformed CSV: unclosed quoted field detected");
  }
  assert(malformedRejected, "7.1 Malformed CSV with unclosed quotes fails closed with explicit error");

  // TEST 8: Spreadsheet Formula Injection Neutralization (CWE-1236)
  console.log("\n>>> [Test 8] Formula Injection Sanitization <<<");
  const formulaCsv = `Legal Name,Primary Email,Contact Phone,Monthly Retainer
=cmd|' /C calc'!A0,attacker@calc.com,9999999999,50000
+12345678,plus@domain.com,9999999999,30000
-5000,minus@domain.com,9999999999,20000
@SUM(A1:A10),sum@domain.com,9999999999,10000
\tmalicious_tab,tab@domain.com,9999999999,15000`;

  const sanitizedParsed = parseClientImportFile(Buffer.from(formulaCsv, "utf-8"), "formula.csv");
  assert(sanitizedParsed.sampleRows[0]["Legal Name"] === "'=cmd|' /C calc'!A0", "8.1 Leading '=' prefixed with single quote");
  assert(sanitizedParsed.sampleRows[1]["Legal Name"] === "'+12345678", "8.2 Leading '+' prefixed with single quote");
  assert(sanitizedParsed.sampleRows[2]["Legal Name"] === "'-5000", "8.3 Leading '-' prefixed with single quote");
  assert(sanitizedParsed.sampleRows[3]["Legal Name"] === "'@SUM(A1:A10)", "8.4 Leading '@' prefixed with single quote");
  assert(sanitizedParsed.sampleRows[4]["Legal Name"] === "'\tmalicious_tab", "8.5 Leading tab character prefixed with single quote");

  // TEST 9: UTF-8 BOM Handling
  console.log("\n>>> [Test 9] UTF-8 BOM Compatibility <<<");
  const bomCsv = "\uFEFFLegal Name,Primary Email,Contact Phone\nAcme Corp,acme@corp.com,9820055555";
  const parsedBom = parseClientImportFile(Buffer.from(bomCsv, "utf-8"), "bom.csv");
  assert(parsedBom.headers[0] === "Legal Name", "9.1 UTF-8 BOM stripped cleanly from first column header");
  assert(parsedBom.rowCount === 1, "9.2 Data row parsed cleanly");

  console.log("\n=================================================================");
  console.log(`Task 1 CSV Security Suite: ${passed} PASSED, ${failed} FAILED`);
  console.log("=================================================================");

  if (failed > 0) process.exit(1);
}

runCsvSecuritySuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
