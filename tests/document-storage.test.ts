import assert from "assert";
import { verifyMagicBytes } from "../src/lib/server/s3";

const cases: Array<{ name: string; buffer: Buffer; mime: string; expected: boolean }> = [
  { name: "accepts a PDF signature", buffer: Buffer.from("%PDF-1.7"), mime: "application/pdf", expected: true },
  { name: "rejects a spoofed PDF", buffer: Buffer.from("not a pdf"), mime: "application/pdf", expected: false },
  { name: "accepts a PNG signature", buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), mime: "image/png", expected: true },
  { name: "accepts a JPEG signature", buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]), mime: "image/jpeg", expected: true },
  { name: "accepts an XLSX ZIP signature", buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04]), mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", expected: true },
  { name: "accepts a legacy XLS OLE signature", buffer: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), mime: "application/vnd.ms-excel", expected: true },
  { name: "accepts a text CSV", buffer: Buffer.from("date,amount\n2026-01-01,100"), mime: "text/csv", expected: true },
  { name: "rejects a binary payload declared as CSV", buffer: Buffer.from([0x61, 0x00, 0x62, 0x63]), mime: "text/csv", expected: false },
  { name: "rejects unsupported MIME types", buffer: Buffer.from("%PDF-1.7"), mime: "application/octet-stream", expected: false },
];

for (const test of cases) {
  assert.strictEqual(verifyMagicBytes(test.buffer, test.mime), test.expected, test.name);
  console.log(`✔ ${test.name}`);
}

console.log(`\nDocument storage validation: ${cases.length} checks passed.`);
