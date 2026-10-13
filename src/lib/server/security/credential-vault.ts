import crypto from "crypto";
import {
  Keyring,
  getDefaultKeyring,
  KeyUnavailableException,
  InvalidKeyLengthException,
} from "./keyring";

export { KeyUnavailableException, InvalidKeyLengthException };

export class VaultException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VaultException";
  }
}

export class DecryptionFailedException extends VaultException {
  constructor(message: string = "Decryption failed: Authentication tag verification or ciphertext integrity check failed.") {
    super(message);
    this.name = "DecryptionFailedException";
  }
}

export class MalformedEnvelopeException extends VaultException {
  constructor(message: string = "Malformed credential envelope format.") {
    super(message);
    this.name = "MalformedEnvelopeException";
  }
}

export type CredentialFormat =
  | "V1_ENCRYPTED"
  | "V1_DIGEST"
  | "LEGACY_PLAINTEXT"
  | "MALFORMED"
  | "EMPTY";

export interface EncryptSecretParams {
  plaintext: string;
  tenantId: string;
  provider: string;
  integrationId: string;
  keyVersion?: number;
  keyring?: Keyring;
}

export interface EncryptedSecretResult {
  encryptedCredentials: string; // v1:enc:k<version>:<hex_ciphertext>
  iv: string;                   // 24 hex characters (12 bytes)
  authTag: string;              // 32 hex characters (16 bytes)
  keyVersion: number;
}

export interface DecryptSecretParams {
  encryptedCredentials: string;
  iv: string;
  authTag: string;
  tenantId: string;
  provider: string;
  integrationId: string;
  keyring?: Keyring;
}

export interface GenerateBearerTokenParams {
  prefix?: string;
  pepperVersion?: number;
  keyring?: Keyring;
}

export interface GeneratedBearerTokenResult {
  plaintextToken: string;       // Shown once to client/operator
  digestEnvelope: string;       // v1:digest:p<version>:<64_hex_digest>
  pepperVersion: number;
}

export interface ComputeBearerDigestParams {
  token: string;
  pepperVersion?: number;
  keyring?: Keyring;
}

export interface VerifyBearerParams {
  providedToken: string;
  storedDigestEnvelope: string;
  keyring?: Keyring;
}

const ENC_ENVELOPE_REGEX = /^v1:enc:k([1-9][0-9]*):([0-9a-f]+)$/i;
const DIGEST_ENVELOPE_REGEX = /^v1:digest:p([1-9][0-9]*):([0-9a-f]{64})$/i;
const HEX_IV_REGEX = /^[0-9a-f]{24}$/i;
const HEX_TAG_REGEX = /^[0-9a-f]{32}$/i;

/**
 * Validates and compares two equal-length buffers in constant time.
 * If buffers differ in length, returns false safely without throwing RangeError.
 */
export function constantTimeCompareBuffers(a: Buffer, b: Buffer): boolean {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    return false;
  }
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

/**
 * Builds the Additional Authenticated Data (AAD) buffer.
 * Cryptographically binds the ciphertext to the exact tenantId, provider, and integrationId.
 */
function buildAADBuffer(tenantId: string, provider: string, integrationId: string): Buffer {
  if (!tenantId || !tenantId.trim()) {
    throw new VaultException("tenantId is required for AAD binding.");
  }
  if (!provider || !provider.trim()) {
    throw new VaultException("provider is required for AAD binding.");
  }
  if (!integrationId || !integrationId.trim()) {
    throw new VaultException("integrationId is required for AAD binding.");
  }

  const aadString = `${tenantId.trim()}:${provider.trim()}:${integrationId.trim()}`;
  return Buffer.from(aadString, "utf8");
}

// ============================================================================
// CONTRACT A: RECOVERABLE SECRETS (AES-256-GCM)
// ============================================================================

/**
 * Encrypts a recoverable secret using AES-256-GCM with a unique 12-byte IV,
 * 16-byte authentication tag, and tenant/provider/integrationId AAD binding.
 */
export function encryptRecoverableSecret(params: EncryptSecretParams): EncryptedSecretResult {
  const { plaintext, tenantId, provider, integrationId, keyVersion, keyring } = params;

  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new VaultException("Plaintext secret cannot be empty.");
  }

  const activeKeyring = keyring ?? getDefaultKeyring();
  const { version, key } = activeKeyring.getEncryptionKey(keyVersion);

  if (key.length !== 32) {
    throw new InvalidKeyLengthException(`Encryption key must be exactly 32 bytes (got ${key.length}).`);
  }

  // Unique 12-byte CSPRNG IV per encryption. Never reused.
  const ivBuffer = crypto.randomBytes(12);
  const aadBuffer = buildAADBuffer(tenantId, provider, integrationId);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, ivBuffer);
  cipher.setAAD(aadBuffer);

  const ciphertextBuffer = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTagBuffer = cipher.getAuthTag();

  if (authTagBuffer.length !== 16) {
    throw new VaultException("Generated authentication tag must be 16 bytes.");
  }

  return {
    encryptedCredentials: `v1:enc:k${version}:${ciphertextBuffer.toString("hex")}`,
    iv: ivBuffer.toString("hex"),
    authTag: authTagBuffer.toString("hex"),
    keyVersion: version,
  };
}

/**
 * Decrypts a recoverable secret from an AES-256-GCM envelope.
 * Strictly verifies key, IV, authentication tag, envelope version, and AAD.
 * Fails closed on any corruption, tampering, or context mismatch.
 */
export function decryptRecoverableSecret(params: DecryptSecretParams): string {
  const { encryptedCredentials, iv, authTag, tenantId, provider, integrationId, keyring } = params;

  if (!encryptedCredentials || typeof encryptedCredentials !== "string") {
    throw new MalformedEnvelopeException("Encrypted credentials string is missing or empty.");
  }

  const envelopeMatch = encryptedCredentials.trim().match(ENC_ENVELOPE_REGEX);
  if (!envelopeMatch) {
    throw new MalformedEnvelopeException("Encrypted credentials do not match format 'v1:enc:k<version>:<hex>'.");
  }

  const keyVersion = parseInt(envelopeMatch[1], 10);
  const ciphertextHex = envelopeMatch[2];

  if (!iv || !HEX_IV_REGEX.test(iv.trim())) {
    throw new MalformedEnvelopeException("IV must be a 24-character hexadecimal string (12 bytes).");
  }

  if (!authTag || !HEX_TAG_REGEX.test(authTag.trim())) {
    throw new MalformedEnvelopeException("Authentication tag must be a 32-character hexadecimal string (16 bytes).");
  }

  const activeKeyring = keyring ?? getDefaultKeyring();
  const { key } = activeKeyring.getEncryptionKey(keyVersion);

  const ivBuffer = Buffer.from(iv.trim(), "hex");
  const authTagBuffer = Buffer.from(authTag.trim(), "hex");
  const ciphertextBuffer = Buffer.from(ciphertextHex, "hex");
  const aadBuffer = buildAADBuffer(tenantId, provider, integrationId);

  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, ivBuffer);
    decipher.setAuthTag(authTagBuffer);
    decipher.setAAD(aadBuffer);

    const decryptedBuffer = Buffer.concat([
      decipher.update(ciphertextBuffer),
      decipher.final(),
    ]);

    return decryptedBuffer.toString("utf8");
  } catch (err: any) {
    // Fail closed. Never log or return ciphertext or key details.
    throw new DecryptionFailedException();
  }
}

// ============================================================================
// CONTRACT B: MACHINE BEARER TOKENS (BLINDED HMAC-SHA256 DIGEST)
// ============================================================================

/**
 * Generates a high-entropy bearer token (~73 characters) with a blinded digest envelope.
 * Plaintext token is returned once for operator/client enrollment.
 * It is NEVER stored in the vault or database.
 */
export function generateBearerToken(params: GenerateBearerTokenParams = {}): GeneratedBearerTokenResult {
  const { prefix = "truv_m2m_", pepperVersion, keyring } = params;
  const activeKeyring = keyring ?? getDefaultKeyring();

  const { version: activePepperVersion, pepper } = activeKeyring.getPepper(pepperVersion);

  // 32 bytes of CSPRNG randomness = 256 bits of entropy
  const randomTokenBody = crypto.randomBytes(32).toString("hex");
  const plaintextToken = `${prefix}${randomTokenBody}`;

  const hmac = crypto.createHmac("sha256", pepper);
  hmac.update(plaintextToken, "utf8");
  const digestHex = hmac.digest("hex");

  return {
    plaintextToken,
    digestEnvelope: `v1:digest:p${activePepperVersion}:${digestHex}`,
    pepperVersion: activePepperVersion,
  };
}

/**
 * Computes an HMAC-SHA256 blinded digest envelope for an existing bearer token string.
 */
export function computeBearerTokenDigest(params: ComputeBearerDigestParams): {
  digestEnvelope: string;
  pepperVersion: number;
} {
  const { token, pepperVersion, keyring } = params;

  if (typeof token !== "string" || token.trim().length === 0) {
    throw new VaultException("Token string cannot be empty.");
  }

  const activeKeyring = keyring ?? getDefaultKeyring();
  const { version: activePepperVersion, pepper } = activeKeyring.getPepper(pepperVersion);

  const hmac = crypto.createHmac("sha256", pepper);
  hmac.update(token.trim(), "utf8");
  const digestHex = hmac.digest("hex");

  return {
    digestEnvelope: `v1:digest:p${activePepperVersion}:${digestHex}`,
    pepperVersion: activePepperVersion,
  };
}

/**
 * Verifies an incoming bearer token against a stored blinded digest envelope in constant time.
 * Fails closed on any envelope format mismatch, missing pepper, or invalid token.
 * Note: There is NO API to recover the original token from a stored digest.
 */
export function verifyBearerToken(params: VerifyBearerParams): boolean {
  const { providedToken, storedDigestEnvelope, keyring } = params;

  if (typeof providedToken !== "string" || providedToken.trim().length === 0) {
    return false;
  }

  if (typeof storedDigestEnvelope !== "string" || storedDigestEnvelope.trim().length === 0) {
    return false;
  }

  const envelopeMatch = storedDigestEnvelope.trim().match(DIGEST_ENVELOPE_REGEX);
  if (!envelopeMatch) {
    return false;
  }

  const pepperVersion = parseInt(envelopeMatch[1], 10);
  const storedDigestHex = envelopeMatch[2];

  const activeKeyring = keyring ?? getDefaultKeyring();

  let pepper: Buffer;
  try {
    const pepperObj = activeKeyring.getPepper(pepperVersion);
    pepper = pepperObj.pepper;
  } catch {
    // Pepper version unavailable -> fail closed
    return false;
  }

  const hmac = crypto.createHmac("sha256", pepper);
  hmac.update(providedToken.trim(), "utf8");
  const expectedDigestHex = hmac.digest("hex");

  const expectedBuffer = Buffer.from(expectedDigestHex, "hex");
  const storedBuffer = Buffer.from(storedDigestHex, "hex");

  return constantTimeCompareBuffers(expectedBuffer, storedBuffer);
}

// ============================================================================
// FORMAT CLASSIFICATION & MIGRATION AUDIT (READ-ONLY)
// ============================================================================

/**
 * Inspects an Integration record's fields and safely classifies its storage format.
 * Never interprets an unknown or malformed envelope as plaintext.
 * Does NOT decrypt, hash, or modify data.
 */
export function classifyCredentialFormat(record: {
  encryptedCredentials?: string | null;
  iv?: string | null;
  authTag?: string | null;
}): CredentialFormat {
  const creds = record?.encryptedCredentials?.trim();
  const iv = record?.iv?.trim();
  const tag = record?.authTag?.trim();

  if (!creds || creds.length === 0) {
    return "EMPTY";
  }

  // Check Version 1 AES-256-GCM Envelope
  if (creds.startsWith("v1:enc:")) {
    const isCredsValid = ENC_ENVELOPE_REGEX.test(creds);
    const isIvValid = iv ? HEX_IV_REGEX.test(iv) : false;
    const isTagValid = tag ? HEX_TAG_REGEX.test(tag) : false;

    if (isCredsValid && isIvValid && isTagValid) {
      return "V1_ENCRYPTED";
    }
    return "MALFORMED";
  }

  // Check Version 1 Blinded Digest Envelope
  if (creds.startsWith("v1:digest:")) {
    const isCredsValid = DIGEST_ENVELOPE_REGEX.test(creds);
    if (isCredsValid) {
      return "V1_DIGEST";
    }
    return "MALFORMED";
  }

  // Disallow any unknown version prefix (e.g. v2:*, v3:*) from being classified as legacy plaintext
  if (creds.startsWith("v")) {
    return "MALFORMED";
  }

  // Legacy Plaintext check: No v-prefix, and iv/tag are empty or "none"
  const isIvEmptyOrNone = !iv || iv === "" || iv.toLowerCase() === "none";
  const isTagEmptyOrNone = !tag || tag === "" || tag.toLowerCase() === "none";

  if (isIvEmptyOrNone && isTagEmptyOrNone) {
    return "LEGACY_PLAINTEXT";
  }

  return "MALFORMED";
}
