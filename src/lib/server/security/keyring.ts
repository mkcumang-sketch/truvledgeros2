import crypto from "crypto";

export interface KeyringOptions {
  primaryEncryptionKeyVersion?: number;
  encryptionKeys?: Record<number, string | Buffer>;
  primaryPepperVersion?: number;
  tokenPeppers?: Record<number, string | Buffer>;
}

export class KeyUnavailableException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeyUnavailableException";
  }
}

export class InvalidKeyLengthException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidKeyLengthException";
  }
}

/**
 * Isolated Keyring for M2M encryption keys and bearer token peppers.
 * Strictly in-memory; zero database imports or network calls.
 * Enforces exact 32-byte (256-bit) key lengths for AES-256-GCM.
 */
export class Keyring {
  private primaryEncryptionKeyVersion: number;
  private encryptionKeys: Map<number, Buffer> = new Map();

  private primaryPepperVersion: number;
  private tokenPeppers: Map<number, Buffer> = new Map();

  constructor(options: KeyringOptions = {}) {
    this.primaryEncryptionKeyVersion = options.primaryEncryptionKeyVersion ?? 1;
    this.primaryPepperVersion = options.primaryPepperVersion ?? 1;

    if (options.encryptionKeys) {
      for (const [v, k] of Object.entries(options.encryptionKeys)) {
        this.registerEncryptionKey(parseInt(v, 10), k);
      }
    }

    if (options.tokenPeppers) {
      for (const [v, p] of Object.entries(options.tokenPeppers)) {
        this.registerPepper(parseInt(v, 10), p);
      }
    }
  }

  /**
   * Registers a 32-byte master encryption key for AES-256-GCM.
   */
  public registerEncryptionKey(version: number, key: string | Buffer): void {
    if (!Number.isInteger(version) || version <= 0) {
      throw new KeyUnavailableException(`Encryption key version must be a positive integer. Received: ${version}`);
    }

    const keyBuffer = typeof key === "string" ? Buffer.from(key, "hex") : key;

    if (keyBuffer.length !== 32) {
      throw new InvalidKeyLengthException(
        `AES-256-GCM encryption key must be exactly 32 bytes (256 bits). Received ${keyBuffer.length} bytes.`
      );
    }

    this.encryptionKeys.set(version, Buffer.from(keyBuffer));
  }

  /**
   * Registers a token pepper (minimum 32 bytes) for HMAC-SHA256 digests.
   */
  public registerPepper(version: number, pepper: string | Buffer): void {
    if (!Number.isInteger(version) || version <= 0) {
      throw new KeyUnavailableException(`Token pepper version must be a positive integer. Received: ${version}`);
    }

    const pepperBuffer = typeof pepper === "string" ? Buffer.from(pepper, "hex") : pepper;

    if (pepperBuffer.length < 32) {
      throw new InvalidKeyLengthException(
        `Token pepper must be at least 32 bytes (256 bits). Received ${pepperBuffer.length} bytes.`
      );
    }

    this.tokenPeppers.set(version, Buffer.from(pepperBuffer));
  }

  public setPrimaryEncryptionKeyVersion(version: number): void {
    if (!this.encryptionKeys.has(version)) {
      throw new KeyUnavailableException(`Cannot set primary key version ${version}: key is not registered.`);
    }
    this.primaryEncryptionKeyVersion = version;
  }

  public setPrimaryPepperVersion(version: number): void {
    if (!this.tokenPeppers.has(version)) {
      throw new KeyUnavailableException(`Cannot set primary pepper version ${version}: pepper is not registered.`);
    }
    this.primaryPepperVersion = version;
  }

  public getEncryptionKey(version?: number): { version: number; key: Buffer } {
    const targetVersion = version ?? this.primaryEncryptionKeyVersion;
    const key = this.encryptionKeys.get(targetVersion);

    if (!key) {
      throw new KeyUnavailableException(
        `Encryption key version ${targetVersion} is not available in the active keyring.`
      );
    }

    return { version: targetVersion, key };
  }

  public getPepper(version?: number): { version: number; pepper: Buffer } {
    const targetVersion = version ?? this.primaryPepperVersion;
    const pepper = this.tokenPeppers.get(targetVersion);

    if (!pepper) {
      throw new KeyUnavailableException(
        `Token pepper version ${targetVersion} is not available in the active keyring.`
      );
    }

    return { version: targetVersion, pepper };
  }

  public hasEncryptionKey(version: number): boolean {
    return this.encryptionKeys.has(version);
  }

  public hasPepper(version: number): boolean {
    return this.tokenPeppers.has(version);
  }

  public clear(): void {
    this.encryptionKeys.clear();
    this.tokenPeppers.clear();
  }
}

/**
 * Singleton default keyring instance.
 * Lazily loads from process.env if available, or can be populated explicitly.
 */
let defaultKeyringInstance: Keyring | null = null;

export function getDefaultKeyring(): Keyring {
  if (!defaultKeyringInstance) {
    defaultKeyringInstance = new Keyring();

    // Check environment for primary encryption key
    const primaryEncVersion = parseInt(process.env.ENCRYPTION_KEY_M2M_PRIMARY_VERSION || "1", 10);
    const primaryEncKey = process.env.ENCRYPTION_KEY_M2M || process.env[`ENCRYPTION_KEY_M2M_K${primaryEncVersion}`];

    if (primaryEncKey && primaryEncKey.trim().length === 64) {
      try {
        defaultKeyringInstance.registerEncryptionKey(primaryEncVersion, primaryEncKey.trim());
        defaultKeyringInstance.setPrimaryEncryptionKeyVersion(primaryEncVersion);
      } catch {
        // Silently skip if invalid format in environment; explicit calls will fail closed
      }
    }

    // Check environment for primary pepper
    const primaryPepperVersion = parseInt(process.env.TOKEN_PEPPER_PRIMARY_VERSION || "1", 10);
    const primaryPepper = process.env.TOKEN_PEPPER || process.env[`TOKEN_PEPPER_P${primaryPepperVersion}`];

    if (primaryPepper && primaryPepper.trim().length >= 64) {
      try {
        defaultKeyringInstance.registerPepper(primaryPepperVersion, primaryPepper.trim());
        defaultKeyringInstance.setPrimaryPepperVersion(primaryPepperVersion);
      } catch {
        // Silently skip if invalid format in environment; explicit calls will fail closed
      }
    }
  }

  return defaultKeyringInstance;
}

export function resetDefaultKeyring(): void {
  defaultKeyringInstance = null;
}
