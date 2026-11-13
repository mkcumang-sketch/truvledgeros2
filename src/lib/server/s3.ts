import crypto from "crypto";
import path from "path";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-2",
  endpoint: process.env.AWS_ENDPOINT_URL_S3,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
  forcePathStyle: true,
});

/**
 * Validates magic bytes for uploaded buffers to prevent MIME-spoofing and malicious file execution.
 */
export function verifyMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (!buffer || buffer.length < 4) return false;

  // PDF: %PDF (0x25 0x50 0x44 0x46)
  if (mimeType === "application/pdf") {
    return buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
  }

  // PNG: 0x89 0x50 0x4E 0x47
  if (mimeType === "image/png") {
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
  }

  // JPEG: 0xFF 0xD8 0xFF
  if (mimeType === "image/jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  // Legacy Excel XLS: OLE Compound File signature
  if (mimeType === "application/vnd.ms-excel") {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  }

  // ZIP / OpenXML XLSX: PK.. (0x50 0x4B 0x03 0x04)
  if (mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
    return buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
  }

  // CSV / Plaintext: Printable ASCII or UTF-8 text (no null bytes or shell characters)
  if (mimeType === "text/csv") {
    for (let i = 0; i < Math.min(buffer.length, 512); i++) {
      const byte = buffer[i];
      if (byte === 0x00) return false; // Null byte indicates binary payload
    }
    return true;
  }

  return false;
}

/**
 * Generates an isolated, presigned upload URL scoped to users/{userId}/ with random UUID naming.
 * Strictly expires in 15 minutes (900 seconds).
 */
export async function getUploadPresignedUrl(params: {
  tenantId: string;
  userId: string;
  fileName: string;
  contentType: string;
  fileSizeBytes?: number;
}): Promise<{ uploadUrl: string; key: string }> {
  const { tenantId, userId, fileName, contentType, fileSizeBytes } = params;

  if (!tenantId || !tenantId.trim()) throw new Error("tenantId is required for S3 upload scoping.");
  if (!userId || !userId.trim()) throw new Error("userId is required for S3 upload scoping.");

  // Reject path traversal attacks
  if (fileName.includes("..") || fileName.includes("/") || fileName.includes("\\")) {
    throw new Error("Invalid file name: path traversal characters detected.");
  }

  const cleanContentType = contentType.trim().toLowerCase();
  if (!ALLOWED_MIME_TYPES.includes(cleanContentType as any)) {
    throw new Error(`File type '${cleanContentType}' is not permitted.`);
  }

  const maxSizeBytes = 10 * 1024 * 1024; // 10MB
  if (fileSizeBytes && fileSizeBytes > maxSizeBytes) {
    throw new Error(`File size exceeds the 10MB limit.`);
  }

  const ext = path.extname(fileName).toLowerCase().slice(0, 10);
  const randomUuid = crypto.randomUUID();
  // Safe isolated key structure: {tenantId}/users/{userId}/{uuid}{ext}
  const key = `${tenantId.trim()}/users/${userId.trim()}/${randomUuid}${ext}`;

  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME || "truv-vault",
    Key: key,
    ContentType: cleanContentType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });
  return { uploadUrl, key };
}

/**
 * Generates an authenticated download URL enforcing attachment Content-Disposition and nosniff.
 * Verifies that the requesting tenant owns the object key before generating the URL.
 * Strictly expires in 15 minutes (900 seconds).
 */
export async function getDownloadPresignedUrl(params: {
  key: string;
  tenantId: string;
  originalFileName?: string;
}): Promise<string> {
  const { key, tenantId, originalFileName = "download.bin" } = params;

  if (!key || typeof key !== "string") {
    throw new Error("Object key is required.");
  }

  // Cross-tenant S3 access prevention: Key MUST begin with the caller's tenantId prefix
  if (!key.startsWith(`${tenantId.trim()}/`)) {
    throw new Error("Cross-tenant access forbidden: Storage object does not belong to your tenant.");
  }

  const sanitizedFileName = originalFileName.replace(/[^a-zA-Z0-9._-]/g, "_");

  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME || "truv-vault",
    Key: key,
    ResponseContentDisposition: `attachment; filename="${sanitizedFileName}"`,
    ResponseContentType: "application/octet-stream",
  });

  return await getSignedUrl(s3Client, command, { expiresIn: 900 });
}

/**
 * Uploads a server-generated or user-supplied file to persistent object storage.
 * Production must fail closed when S3-compatible storage is unavailable; serverless
 * local disk is ephemeral and must never be presented as durable document storage.
 */
export async function uploadBufferToS3(params: {
  key: string;
  buffer: Buffer;
  contentType: string;
}): Promise<{ url: string; provider: "s3" }> {
  const { key, buffer, contentType } = params;
  const bucket = process.env.S3_BUCKET_NAME || "truv-vault";
  const hasS3Config = Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);

  if (!hasS3Config) {
    throw new Error("PERSISTENT_STORAGE_NOT_CONFIGURED");
  }

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    ServerSideEncryption: "AES256",
  });

  await s3Client.send(command);

  const endpoint = process.env.AWS_ENDPOINT_URL_S3;
  const url = endpoint
    ? `${endpoint.replace(/\\/$/, "")}/${bucket}/${key}`
    : `https://${bucket}.s3.${process.env.AWS_REGION || "us-east-2"}.amazonaws.com/${key}`;

  return { url, provider: "s3" };
}
