import crypto from "crypto";
import fs from "fs";
import path from "path";
import {
  Keyring,
  KeyUnavailableException,
  InvalidKeyLengthException,
} from "../src/lib/server/security/keyring";
import {
  encryptRecoverableSecret,
  decryptRecoverableSecret,
  generateBearerToken,
  computeBearerTokenDigest,
  verifyBearerToken,
  classifyCredentialFormat,
  constantTimeCompareBuffers,
  DecryptionFailedException,
  MalformedEnvelopeException,
  VaultException,
} from "../src/lib/server/security/credential-vault";

// ============================================================================
// TEST HARNESS & IN-MEMORY FIXTURES (ZERO DATABASE / NETWORK CALLS)
// ============================================================================

const TEST_KEY_32BYTES_1 = crypto.randomBytes(32);
const TEST_KEY_32BYTES_2 = crypto.randomBytes(32);
const TEST_PEPPER_32BYTES_1 = crypto.randomBytes(32);
const TEST_PEPPER_32BYTES_2 = crypto.randomBytes(32);

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

function expectThrows(fn: () => void, expectedErrorName: string, testName: string) {
  try {
    fn();
    console.error(`\x1b[31m✖ FAIL\x1b[0m: ${testName} (Expected ${expectedErrorName} but no exception was thrown)`);
    failed++;
  } catch (err: any) {
    if (err.name === expectedErrorName || err.constructor.name === expectedErrorName) {
      console.log(`\x1b[32m✔ PASS\x1b[0m: ${testName}`);
      passed++;
    } else {
      console.error(
        `\x1b[31m✖ FAIL\x1b[0m: ${testName} (Expected ${expectedErrorName}, received ${err.name}: ${err.message})`
      );
      failed++;
    }
  }
}

async function runCredentialVaultSuite() {
  console.log("=================================================================");
  console.log("TRUV LedgerOS — Phase 2K.8 Isolated Credential Vault Unit Tests");
  console.log("=================================================================\n");

  const testKeyring = new Keyring({
    primaryEncryptionKeyVersion: 1,
    encryptionKeys: {
      1: TEST_KEY_32BYTES_1,
      2: TEST_KEY_32BYTES_2,
    },
    primaryPepperVersion: 1,
    tokenPeppers: {
      1: TEST_PEPPER_32BYTES_1,
      2: TEST_PEPPER_32BYTES_2,
    },
  });

  const tenantId = "tenant_alpha_123";
  const provider = "N8N_M2M";
  const integrationId = "integ_rec_789";

  // --------------------------------------------------------------------------
  // TEST 1: AES-GCM round trip
  // --------------------------------------------------------------------------
  console.log(">>> [Test 1] AES-GCM Encryption / Decryption Round Trip <<<");
  const secretPayload = "truv_super_secret_webhook_signing_key_32bytes_value";
  const encResult = encryptRecoverableSecret({
    plaintext: secretPayload,
    tenantId,
    provider,
    integrationId,
    keyring: testKeyring,
  });

  assert(
    encResult.encryptedCredentials.startsWith("v1:enc:k1:") &&
      encResult.iv.length === 24 &&
      encResult.authTag.length === 32,
    "1.1 Encrypted result matches Contract A versioned format"
  );

  const decrypted = decryptRecoverableSecret({
    encryptedCredentials: encResult.encryptedCredentials,
    iv: encResult.iv,
    authTag: encResult.authTag,
    tenantId,
    provider,
    integrationId,
    keyring: testKeyring,
  });

  assert(decrypted === secretPayload, "1.2 Decrypted payload matches original plaintext exactly");

  // --------------------------------------------------------------------------
  // TEST 2: Unique IVs across repeated encryptions
  // --------------------------------------------------------------------------
  console.log("\n>>> [Test 2] Unique IVs Across Repeated Encryptions <<<");
  const enc1 = encryptRecoverableSecret({
    plaintext: secretPayload,
    tenantId,
    provider,
    integrationId,
    keyring: testKeyring,
  });
  const enc2 = encryptRecoverableSecret({
    plaintext: secretPayload,
    tenantId,
    provider,
    integrationId,
    keyring: testKeyring,
  });
  const enc3 = encryptRecoverableSecret({
    plaintext: secretPayload,
    tenantId,
    provider,
    integrationId,
    keyring: testKeyring,
  });

  assert(
    enc1.iv !== enc2.iv && enc2.iv !== enc3.iv && enc1.iv !== enc3.iv,
    "2.1 Unique random 12-byte IV generated on every encryption (zero IV reuse)"
  );
  assert(
    enc1.encryptedCredentials !== enc2.encryptedCredentials,
    "2.2 Ciphertexts differ across repeated encryptions due to unique IVs"
  );

  // --------------------------------------------------------------------------
  // TEST 3: Ciphertext tampering rejection
  // --------------------------------------------------------------------------
  console.log("\n>>> [Test 3] Ciphertext Tampering Rejection <<<");
  const parts = encResult.encryptedCredentials.split(":");
  const rawCiphertextHex = parts[3];
  // Flip the first two hex characters
  const tamperedHex = (rawCiphertextHex.startsWith("aa") ? "bb" : "aa") + rawCiphertextHex.slice(2);
  const tamperedEnvelope = `${parts[0]}:${parts[1]}:${parts[2]}:${tamperedHex}`;

  expectThrows(
    () =>
      decryptRecoverableSecret({
        encryptedCredentials: tamperedEnvelope,
        iv: encResult.iv,
        authTag: encResult.authTag,
        tenantId,
        provider,
        integrationId,
        keyring: testKeyring,
      }),
    "DecryptionFailedException",
    "3.1 Tampered ciphertext rejected with DecryptionFailedException (fails closed)"
  );

  // --------------------------------------------------------------------------
  // TEST 4: IV and authentication-tag tampering rejection
  // --------------------------------------------------------------------------
  console.log("\n>>> [Test 4] IV and Authentication-Tag Tampering Rejection <<<");
  // Tamper IV (flip first character)
  const tamperedIv = (encResult.iv.startsWith("f") ? "0" : "f") + encResult.iv.slice(1);
  expectThrows(
    () =>
      decryptRecoverableSecret({
        encryptedCredentials: encResult.encryptedCredentials,
        iv: tamperedIv,
        authTag: encResult.authTag,
        tenantId,
        provider,
        integrationId,
        keyring: testKeyring,
      }),
    "DecryptionFailedException",
    "4.1 Tampered IV rejected with DecryptionFailedException"
  );

  // Tamper Auth Tag (flip first character)
  const tamperedTag = (encResult.authTag.startsWith("f") ? "0" : "f") + encResult.authTag.slice(1);
  expectThrows(
    () =>
      decryptRecoverableSecret({
        encryptedCredentials: encResult.encryptedCredentials,
        iv: encResult.iv,
        authTag: tamperedTag,
        tenantId,
        provider,
        integrationId,
        keyring: testKeyring,
      }),
    "DecryptionFailedException",
    "4.2 Tampered authentication tag rejected with DecryptionFailedException"
  );

  // --------------------------------------------------------------------------
  // TEST 5: Tenant, provider, and Integration ID AAD mismatch rejection
  // --------------------------------------------------------------------------
  console.log("\n>>> [Test 5] AAD Context Mismatch Rejection (Tenant Isolation) <<<");
  // 5.1 Different Tenant ID
  expectThrows(
    () =>
      decryptRecoverableSecret({
        encryptedCredentials: encResult.encryptedCredentials,
        iv: encResult.iv,
        authTag: encResult.authTag,
        tenantId: "victim_tenant_beta", // Mismatched tenant
        provider,
        integrationId,
        keyring: testKeyring,
      }),
    "DecryptionFailedException",
    "5.1 Ciphertext transplanted to Tenant B fails decryption due to AAD tenant mismatch"
  );

  // 5.2 Different Provider
  expectThrows(
    () =>
      decryptRecoverableSecret({
        encryptedCredentials: encResult.encryptedCredentials,
        iv: encResult.iv,
        authTag: encResult.authTag,
        tenantId,
        provider: "ZOHO_BOOKS", // Mismatched provider
        integrationId,
        keyring: testKeyring,
      }),
    "DecryptionFailedException",
    "5.2 Ciphertext transplanted to another provider fails decryption due to AAD provider mismatch"
  );

  // 5.3 Different Integration ID
  expectThrows(
    () =>
      decryptRecoverableSecret({
        encryptedCredentials: encResult.encryptedCredentials,
        iv: encResult.iv,
        authTag: encResult.authTag,
        tenantId,
        provider,
        integrationId: "integ_different_999", // Mismatched integrationId
        keyring: testKeyring,
      }),
    "DecryptionFailedException",
    "5.3 Ciphertext transplanted to another integration record fails decryption due to AAD ID mismatch"
  );

  // --------------------------------------------------------------------------
  // TEST 6: Missing key and unknown key-version rejection
  // --------------------------------------------------------------------------
  console.log("\n>>> [Test 6] Missing Key & Unknown Key-Version Rejection <<<");
  const unconfiguredKeyEnvelope = `v1:enc:k999:${encResult.encryptedCredentials.split(":")[3]}`;
  expectThrows(
    () =>
      decryptRecoverableSecret({
        encryptedCredentials: unconfiguredKeyEnvelope,
        iv: encResult.iv,
        authTag: encResult.authTag,
        tenantId,
        provider,
        integrationId,
        keyring: testKeyring,
      }),
    "KeyUnavailableException",
    "6.1 Decryption with unknown key version (k999) fails closed with KeyUnavailableException"
  );

  // Empty keyring
  const emptyKeyring = new Keyring();
  expectThrows(
    () =>
      encryptRecoverableSecret({
        plaintext: "some_secret",
        tenantId,
        provider,
        integrationId,
        keyring: emptyKeyring,
      }),
    "KeyUnavailableException",
    "6.2 Encryption with unconfigured keyring fails closed with KeyUnavailableException"
  );

  // --------------------------------------------------------------------------
  // TEST 7: Invalid key length and malformed envelope rejection
  // --------------------------------------------------------------------------
  console.log("\n>>> [Test 7] Invalid Key Length & Malformed Envelope Rejection <<<");
  const shortKeyKeyring = new Keyring();
  expectThrows(
    () => shortKeyKeyring.registerEncryptionKey(1, Buffer.from("short_16_byte_key")),
    "InvalidKeyLengthException",
    "7.1 Keyring rejects non-32-byte encryption key with InvalidKeyLengthException"
  );

  // Malformed envelope prefixes
  expectThrows(
    () =>
      decryptRecoverableSecret({
        encryptedCredentials: "malformed_string_without_prefix",
        iv: encResult.iv,
        authTag: encResult.authTag,
        tenantId,
        provider,
        integrationId,
        keyring: testKeyring,
      }),
    "MalformedEnvelopeException",
    "7.2 Missing v1:enc: prefix rejected with MalformedEnvelopeException"
  );

  expectThrows(
    () =>
      decryptRecoverableSecret({
        encryptedCredentials: encResult.encryptedCredentials,
        iv: "invalid_short_iv",
        authTag: encResult.authTag,
        tenantId,
        provider,
        integrationId,
        keyring: testKeyring,
      }),
    "MalformedEnvelopeException",
    "7.3 Non-24-hex IV rejected with MalformedEnvelopeException"
  );

  expectThrows(
    () =>
      decryptRecoverableSecret({
        encryptedCredentials: encResult.encryptedCredentials,
        iv: encResult.iv,
        authTag: "invalid_short_tag",
        tenantId,
        provider,
        integrationId,
        keyring: testKeyring,
      }),
    "MalformedEnvelopeException",
    "7.4 Non-32-hex Auth Tag rejected with MalformedEnvelopeException"
  );

  // --------------------------------------------------------------------------
  // TEST 8: Bearer-token digest verification and invalid-token rejection
  // --------------------------------------------------------------------------
  console.log("\n>>> [Test 8] Bearer-Token Digest Verification <<<");
  const tokenGen = generateBearerToken({ keyring: testKeyring });
  assert(
    tokenGen.plaintextToken.startsWith("truv_m2m_") && tokenGen.plaintextToken.length >= 70,
    "8.1 High-entropy bearer token generated with expected prefix (~73 chars, 256-bit CSPRNG)"
  );
  assert(
    tokenGen.digestEnvelope.startsWith("v1:digest:p1:") && tokenGen.digestEnvelope.length === 77,
    "8.2 Blinded digest envelope matches Contract B format (13-char prefix + 64-char hex digest)"
  );

  const isTokenValid = verifyBearerToken({
    providedToken: tokenGen.plaintextToken,
    storedDigestEnvelope: tokenGen.digestEnvelope,
    keyring: testKeyring,
  });
  assert(isTokenValid === true, "8.3 Valid bearer token matches blinded digest envelope");

  const isWrongTokenValid = verifyBearerToken({
    providedToken: "truv_m2m_completely_wrong_attacker_token",
    storedDigestEnvelope: tokenGen.digestEnvelope,
    keyring: testKeyring,
  });
  assert(isWrongTokenValid === false, "8.4 Invalid bearer token rejected (returns false)");

  // --------------------------------------------------------------------------
  // TEST 9: Wrong pepper and unknown pepper-version rejection
  // --------------------------------------------------------------------------
  console.log("\n>>> [Test 9] Wrong Pepper & Unknown Pepper-Version Rejection <<<");
  // Verify with a different pepper (Pepper version 2)
  const tokenGenV2 = generateBearerToken({ pepperVersion: 2, keyring: testKeyring });
  assert(
    tokenGenV2.digestEnvelope.startsWith("v1:digest:p2:"),
    "9.1 Token generated with Pepper version 2 envelope"
  );

  // Keyring lacking pepper v2
  const singlePepperKeyring = new Keyring({
    tokenPeppers: { 1: TEST_PEPPER_32BYTES_1 },
  });
  const isMissingPepperValid = verifyBearerToken({
    providedToken: tokenGenV2.plaintextToken,
    storedDigestEnvelope: tokenGenV2.digestEnvelope,
    keyring: singlePepperKeyring,
  });
  assert(isMissingPepperValid === false, "9.2 Verification fails closed when pepper version is unconfigured");

  // Unknown pepper version in envelope (p999)
  const unconfiguredPepperEnvelope = `v1:digest:p999:${tokenGen.digestEnvelope.split(":")[3]}`;
  const isUnknownPepperValid = verifyBearerToken({
    providedToken: tokenGen.plaintextToken,
    storedDigestEnvelope: unconfiguredPepperEnvelope,
    keyring: testKeyring,
  });
  assert(isUnknownPepperValid === false, "9.3 Verification with unknown pepper version (p999) fails closed");

  // --------------------------------------------------------------------------
  // TEST 10: Equal-length constant-time comparison helper behavior
  // --------------------------------------------------------------------------
  console.log("\n>>> [Test 10] Equal-Length Constant-Time Comparison Helper <<<");
  const bufA = Buffer.from("abcdef1234567890abcdef1234567890", "hex");
  const bufB = Buffer.from("abcdef1234567890abcdef1234567890", "hex");
  const bufDiff = Buffer.from("ffcdef1234567890abcdef1234567890", "hex");
  const bufShort = Buffer.from("abcdef123456", "hex");

  assert(constantTimeCompareBuffers(bufA, bufB) === true, "10.1 Identical buffers return true");
  assert(constantTimeCompareBuffers(bufA, bufDiff) === false, "10.2 Differing buffers return false");
  assert(
    constantTimeCompareBuffers(bufA, bufShort) === false,
    "10.3 Unequal length buffers return false safely without throwing RangeError"
  );
  assert(
    (constantTimeCompareBuffers as any)("not_a_buffer", bufA) === false,
    "10.4 Non-buffer inputs fail safely"
  );
  // Note documented limitation: In-process timing tests on modern CPUs with branch prediction and jitter
  // cannot empirically prove mathematical constant-time behavior across hardware architectures; this test
  // verifies correct invocation and contract enforcement of Node's native crypto.timingSafeEqual primitive.

  // --------------------------------------------------------------------------
  // TEST 11: Safe classification of legacy, encrypted, digest, and malformed records
  // --------------------------------------------------------------------------
  console.log("\n>>> [Test 11] Safe Classification of Storage Formats <<<");
  assert(
    classifyCredentialFormat({
      encryptedCredentials: encResult.encryptedCredentials,
      iv: encResult.iv,
      authTag: encResult.authTag,
    }) === "V1_ENCRYPTED",
    "11.1 Valid AES-256-GCM envelope classified as V1_ENCRYPTED"
  );

  assert(
    classifyCredentialFormat({
      encryptedCredentials: tokenGen.digestEnvelope,
      iv: "none",
      authTag: "none",
    }) === "V1_DIGEST",
    "11.2 Valid Blinded Digest envelope classified as V1_DIGEST"
  );

  assert(
    classifyCredentialFormat({
      encryptedCredentials: "plain_legacy_secret_string",
      iv: "",
      authTag: "",
    }) === "LEGACY_PLAINTEXT",
    "11.3 Legacy unmigrated record with empty IV/Tag classified as LEGACY_PLAINTEXT"
  );

  assert(
    classifyCredentialFormat({
      encryptedCredentials: "plain_legacy_secret_string",
      iv: "unexpected_iv",
      authTag: "",
    }) === "MALFORMED",
    "11.4 Unencrypted string with unexpected IV classified as MALFORMED (never treated as plaintext)"
  );

  assert(
    classifyCredentialFormat({
      encryptedCredentials: "v1:enc:k1:broken_ciphertext",
      iv: "short_iv",
      authTag: "short_tag",
    }) === "MALFORMED",
    "11.5 Corrupted v1:enc envelope classified as MALFORMED"
  );

  assert(
    classifyCredentialFormat({
      encryptedCredentials: "v2:unknown_envelope:value",
      iv: "",
      authTag: "",
    }) === "MALFORMED",
    "11.6 Unknown envelope version (v2) classified as MALFORMED (never treated as plaintext)"
  );

  assert(
    classifyCredentialFormat({
      encryptedCredentials: "",
      iv: "",
      authTag: "",
    }) === "EMPTY",
    "11.7 Empty credential classified as EMPTY"
  );

  // --------------------------------------------------------------------------
  // TEST 12: No database imports or connections in vault or test suite
  // --------------------------------------------------------------------------
  console.log("\n>>> [Test 12] Zero Database Imports Verification <<<");
  const vaultPath = path.resolve(__dirname, "../src/lib/server/security/credential-vault.ts");
  const keyringPath = path.resolve(__dirname, "../src/lib/server/security/keyring.ts");

  const vaultSource = fs.readFileSync(vaultPath, "utf8");
  const keyringSource = fs.readFileSync(keyringPath, "utf8");

  // Verify that vaultSource and keyringSource do not import or reference any database or Prisma client
  const dbPatterns = [
    /from\s+["'].*prisma.*["']/i,
    /from\s+["'].*\/db["']/i,
    /from\s+["']pg["']/i,
    /PrismaClient/i,
  ];

  let dbImportFound = false;
  for (const pattern of dbPatterns) {
    if (pattern.test(vaultSource) || pattern.test(keyringSource)) {
      dbImportFound = true;
      console.error(`Forbidden database import pattern matched: ${pattern}`);
    }
  }

  assert(
    !dbImportFound,
    "12.1 Zero database client imports (Prisma, db, pg) verified in vault and keyring source files"
  );

  // ==========================================================================
  // FINAL RESULTS
  // ==========================================================================
  console.log("\n=================================================================");
  console.log(`Phase 2K.8 Credential Vault Suite: ${passed} PASSED, ${failed} FAILED`);
  console.log("=================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runCredentialVaultSuite().catch((err) => {
  console.error("Fatal test suite error:", err);
  process.exit(1);
});
