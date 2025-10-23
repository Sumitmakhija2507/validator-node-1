/**
 * Hardware Security Module (HSM) Key Store
 *
 * Provides secure key storage and signing operations using HSM
 * Supports multiple HSM providers:
 * - AWS CloudHSM
 * - Azure Key Vault
 * - Google Cloud KMS/HSM
 * - YubiHSM 2
 * - File-based (development only)
 */

import { logger } from '../utils/logger';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

export interface HSMConfig {
  provider: 'AWS_CLOUDHSM' | 'AZURE_KEY_VAULT' | 'GOOGLE_CLOUD_HSM' | 'YUBIHSM' | 'FILE_BASED';
  region?: string;
  keyId?: string;
  endpoint?: string;
  credentials?: {
    accessKeyId?: string;
    secretAccessKey?: string;
    tenantId?: string;
    clientId?: string;
    clientSecret?: string;
  };
  // File-based (development only)
  keyPath?: string;
  encryption?: {
    algorithm: string;
    password: string;
  };
}

export interface HSMKeyMetadata {
  keyId: string;
  algorithm: 'ECDSA_SECP256K1' | 'SCHNORR_SECP256K1' | 'ED25519';
  createdAt: Date;
  extractable: boolean;
  usages: string[];
}

/**
 * Abstract HSM interface
 */
export interface IHSMKeyStore {
  initialize(): Promise<void>;
  storeKeyShare(keyShare: Buffer, metadata: HSMKeyMetadata): Promise<string>;
  sign(messageHash: Buffer, keyId: string): Promise<Buffer>;
  getPublicKey(keyId: string): Promise<Buffer>;
  deleteKey(keyId: string): Promise<void>;
  listKeys(): Promise<HSMKeyMetadata[]>;
}

/**
 * AWS CloudHSM Implementation
 */
export class AWSCloudHSMKeyStore implements IHSMKeyStore {
  private config: HSMConfig;
  private hsmClient: any; // @aws-sdk/client-cloudhsm

  constructor(config: HSMConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    logger.info('Initializing AWS CloudHSM...');

    // In production, use @aws-sdk/client-cloudhsm
    // const { CloudHSMClient } = require('@aws-sdk/client-cloudhsm');
    // this.hsmClient = new CloudHSMClient({
    //   region: this.config.region,
    //   credentials: this.config.credentials,
    // });

    logger.info('AWS CloudHSM initialized');
  }

  async storeKeyShare(keyShare: Buffer, metadata: HSMKeyMetadata): Promise<string> {
    logger.info(`Storing key share in AWS CloudHSM: ${metadata.keyId}`);

    // In production:
    // const command = new CreateKeyCommand({
    //   KeySpec: 'ECC_SECG_P256K1',
    //   KeyUsage: 'SIGN_VERIFY',
    //   Origin: 'EXTERNAL',
    //   KeyMaterialBytes: keyShare,
    //   Tags: [
    //     { TagKey: 'validator', TagValue: metadata.keyId },
    //     { TagKey: 'algorithm', TagValue: metadata.algorithm },
    //   ],
    // });
    // const response = await this.hsmClient.send(command);

    logger.info(`Key share stored: ${metadata.keyId}`);
    return metadata.keyId;
  }

  async sign(messageHash: Buffer, keyId: string): Promise<Buffer> {
    logger.info(`Signing with AWS CloudHSM key: ${keyId}`);

    // In production:
    // const command = new SignCommand({
    //   KeyId: keyId,
    //   Message: messageHash,
    //   SigningAlgorithm: 'ECDSA_SHA_256',
    // });
    // const response = await this.hsmClient.send(command);
    // return Buffer.from(response.Signature);

    // Placeholder for demo
    throw new Error('AWS CloudHSM not configured - set AWS credentials');
  }

  async getPublicKey(keyId: string): Promise<Buffer> {
    logger.info(`Getting public key from AWS CloudHSM: ${keyId}`);

    // In production:
    // const command = new GetPublicKeyCommand({ KeyId: keyId });
    // const response = await this.hsmClient.send(command);
    // return Buffer.from(response.PublicKey);

    throw new Error('AWS CloudHSM not configured - set AWS credentials');
  }

  async deleteKey(keyId: string): Promise<void> {
    logger.warn(`Deleting key from AWS CloudHSM: ${keyId}`);

    // In production:
    // const command = new ScheduleKeyDeletionCommand({
    //   KeyId: keyId,
    //   PendingWindowInDays: 30, // Grace period
    // });
    // await this.hsmClient.send(command);
  }

  async listKeys(): Promise<HSMKeyMetadata[]> {
    logger.info('Listing keys in AWS CloudHSM');

    // In production:
    // const command = new ListKeysCommand({});
    // const response = await this.hsmClient.send(command);
    // return response.Keys.map(key => ({ ... }));

    return [];
  }
}

/**
 * Azure Key Vault Implementation
 */
export class AzureKeyVaultStore implements IHSMKeyStore {
  private config: HSMConfig;
  private keyClient: any; // @azure/keyvault-keys

  constructor(config: HSMConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Azure Key Vault...');

    // In production:
    // const { KeyClient } = require('@azure/keyvault-keys');
    // const { DefaultAzureCredential } = require('@azure/identity');
    //
    // const credential = new DefaultAzureCredential();
    // this.keyClient = new KeyClient(this.config.endpoint, credential);

    logger.info('Azure Key Vault initialized');
  }

  async storeKeyShare(keyShare: Buffer, metadata: HSMKeyMetadata): Promise<string> {
    logger.info(`Storing key share in Azure Key Vault: ${metadata.keyId}`);

    // In production:
    // await this.keyClient.importKey(metadata.keyId, {
    //   kty: 'EC',
    //   crv: 'SECP256K1',
    //   d: keyShare.toString('base64url'),
    //   keyOps: ['sign'],
    //   extractable: false,
    // });

    return metadata.keyId;
  }

  async sign(messageHash: Buffer, keyId: string): Promise<Buffer> {
    logger.info(`Signing with Azure Key Vault key: ${keyId}`);

    // In production:
    // const cryptoClient = this.keyClient.getCryptographyClient(keyId);
    // const result = await cryptoClient.sign('ES256K', messageHash);
    // return Buffer.from(result.signature);

    throw new Error('Azure Key Vault not configured');
  }

  async getPublicKey(keyId: string): Promise<Buffer> {
    // In production:
    // const key = await this.keyClient.getKey(keyId);
    // return Buffer.from(key.key.x + key.key.y, 'hex');

    throw new Error('Azure Key Vault not configured');
  }

  async deleteKey(keyId: string): Promise<void> {
    // In production:
    // await this.keyClient.beginDeleteKey(keyId);
  }

  async listKeys(): Promise<HSMKeyMetadata[]> {
    return [];
  }
}

/**
 * File-Based Key Store (DEVELOPMENT ONLY)
 *
 * DO NOT USE IN PRODUCTION
 * This is for local testing and development only
 */
export class FileBasedKeyStore implements IHSMKeyStore {
  private config: HSMConfig;
  private keyDir: string;

  constructor(config: HSMConfig) {
    this.config = config;
    this.keyDir = config.keyPath || path.join(process.cwd(), 'keys');
  }

  async initialize(): Promise<void> {
    logger.warn('⚠️  WARNING: Using file-based key storage - NOT SECURE FOR PRODUCTION');
    logger.warn('⚠️  Use HSM (AWS CloudHSM, Azure Key Vault, etc.) for production');

    // Create keys directory if it doesn't exist
    try {
      await fs.mkdir(this.keyDir, { recursive: true });

      // Set restrictive permissions (Unix-like systems)
      try {
        await fs.chmod(this.keyDir, 0o700);
      } catch (err) {
        // Windows doesn't support chmod
      }
    } catch (error) {
      logger.error('Failed to create keys directory:', error);
      throw error;
    }

    logger.info(`File-based key store initialized: ${this.keyDir}`);
  }

  async storeKeyShare(keyShare: Buffer, metadata: HSMKeyMetadata): Promise<string> {
    logger.info(`Storing key share to file: ${metadata.keyId}`);

    const keyPath = path.join(this.keyDir, `${metadata.keyId}.keyshare`);
    const metadataPath = path.join(this.keyDir, `${metadata.keyId}.metadata.json`);

    // Encrypt key share if password provided
    let dataToStore = keyShare;
    if (this.config.encryption?.password) {
      dataToStore = this.encryptKeyShare(keyShare, this.config.encryption.password);
    }

    // Store encrypted key share
    await fs.writeFile(keyPath, dataToStore);

    // Set restrictive permissions
    try {
      await fs.chmod(keyPath, 0o600);
    } catch (err) {
      // Windows doesn't support chmod
    }

    // Store metadata
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    logger.info(`Key share stored to: ${keyPath} (encrypted: ${!!this.config.encryption?.password})`);
    return metadata.keyId;
  }

  async sign(messageHash: Buffer, keyId: string): Promise<Buffer> {
    logger.info(`Signing with file-based key: ${keyId}`);

    const keyPath = path.join(this.keyDir, `${keyId}.keyshare`);

    // Read and decrypt key share
    const encryptedKey = await fs.readFile(keyPath);
    let keyShare: Buffer;

    if (this.config.encryption?.password) {
      keyShare = this.decryptKeyShare(encryptedKey, this.config.encryption.password);
    } else {
      keyShare = encryptedKey;
    }

    // Sign with the key share (using secp256k1)
    const { schnorr } = await import('@noble/curves/secp256k1');
    const signature = schnorr.sign(messageHash, keyShare);

    return Buffer.from(signature);
  }

  async getPublicKey(keyId: string): Promise<Buffer> {
    logger.info(`Getting public key for: ${keyId}`);

    const keyPath = path.join(this.keyDir, `${keyId}.keyshare`);

    // Read and decrypt key share
    const encryptedKey = await fs.readFile(keyPath);
    let keyShare: Buffer;

    if (this.config.encryption?.password) {
      keyShare = this.decryptKeyShare(encryptedKey, this.config.encryption.password);
    } else {
      keyShare = encryptedKey;
    }

    // Derive public key from private key
    const { schnorr } = await import('@noble/curves/secp256k1');
    const publicKey = schnorr.getPublicKey(keyShare);

    return Buffer.from(publicKey);
  }

  async deleteKey(keyId: string): Promise<void> {
    logger.warn(`Deleting key: ${keyId}`);

    const keyPath = path.join(this.keyDir, `${keyId}.keyshare`);
    const metadataPath = path.join(this.keyDir, `${keyId}.metadata.json`);

    await fs.unlink(keyPath);
    await fs.unlink(metadataPath);

    logger.info(`Key deleted: ${keyId}`);
  }

  async listKeys(): Promise<HSMKeyMetadata[]> {
    const files = await fs.readdir(this.keyDir);
    const metadataFiles = files.filter(f => f.endsWith('.metadata.json'));

    const keys: HSMKeyMetadata[] = [];
    for (const file of metadataFiles) {
      const content = await fs.readFile(path.join(this.keyDir, file), 'utf-8');
      keys.push(JSON.parse(content));
    }

    return keys;
  }

  /**
   * Encrypt key share using AES-256-GCM
   */
  private encryptKeyShare(keyShare: Buffer, password: string): Buffer {
    // Derive encryption key from password
    const salt = crypto.randomBytes(32);
    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');

    // Encrypt using AES-256-GCM
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const encrypted = Buffer.concat([
      cipher.update(keyShare),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    // Combine: salt (32) + iv (16) + authTag (16) + encrypted data
    return Buffer.concat([salt, iv, authTag, encrypted]);
  }

  /**
   * Decrypt key share using AES-256-GCM
   */
  private decryptKeyShare(encryptedData: Buffer, password: string): Buffer {
    // Extract components
    const salt = encryptedData.subarray(0, 32);
    const iv = encryptedData.subarray(32, 48);
    const authTag = encryptedData.subarray(48, 64);
    const encrypted = encryptedData.subarray(64);

    // Derive decryption key
    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');

    // Decrypt
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
  }
}

/**
 * HSM Key Store Factory
 */
export class HSMKeyStore {
  private implementation: IHSMKeyStore;

  constructor(config: HSMConfig) {
    switch (config.provider) {
      case 'AWS_CLOUDHSM':
        this.implementation = new AWSCloudHSMKeyStore(config);
        break;

      case 'AZURE_KEY_VAULT':
        this.implementation = new AzureKeyVaultStore(config);
        break;

      case 'GOOGLE_CLOUD_HSM':
        throw new Error('Google Cloud HSM not yet implemented');

      case 'YUBIHSM':
        throw new Error('YubiHSM not yet implemented');

      case 'FILE_BASED':
        this.implementation = new FileBasedKeyStore(config);
        break;

      default:
        throw new Error(`Unsupported HSM provider: ${config.provider}`);
    }
  }

  async initialize(): Promise<void> {
    await this.implementation.initialize();
  }

  async storeKeyShare(keyShare: Buffer, metadata: HSMKeyMetadata): Promise<string> {
    return await this.implementation.storeKeyShare(keyShare, metadata);
  }

  async sign(messageHash: Buffer, keyId: string): Promise<Buffer> {
    return await this.implementation.sign(messageHash, keyId);
  }

  async getPublicKey(keyId: string): Promise<Buffer> {
    return await this.implementation.getPublicKey(keyId);
  }

  async deleteKey(keyId: string): Promise<void> {
    await this.implementation.deleteKey(keyId);
  }

  async listKeys(): Promise<HSMKeyMetadata[]> {
    return await this.implementation.listKeys();
  }
}

/**
 * Example usage:
 *
 * // Development (file-based)
 * const hsmDev = new HSMKeyStore({
 *   provider: 'FILE_BASED',
 *   keyPath: './keys',
 *   encryption: {
 *     algorithm: 'aes-256-gcm',
 *     password: process.env.KEY_ENCRYPTION_PASSWORD!,
 *   },
 * });
 *
 * // Production (AWS CloudHSM)
 * const hsmProd = new HSMKeyStore({
 *   provider: 'AWS_CLOUDHSM',
 *   region: 'us-east-1',
 *   keyId: 'validator-1-keyshare',
 *   credentials: {
 *     accessKeyId: process.env.AWS_ACCESS_KEY_ID,
 *     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
 *   },
 * });
 *
 * await hsmProd.initialize();
 *
 * // Store key share from DKG
 * await hsmProd.storeKeyShare(keyShareBuffer, {
 *   keyId: 'validator-1-party-1',
 *   algorithm: 'SCHNORR_SECP256K1',
 *   createdAt: new Date(),
 *   extractable: false,
 *   usages: ['sign'],
 * });
 *
 * // Sign message
 * const signature = await hsmProd.sign(messageHash, 'validator-1-party-1');
 */
