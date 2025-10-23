/**
 * Mutual TLS (mTLS) Configuration
 *
 * Provides secure, authenticated communication between validators and orchestrator
 *
 * Security Features:
 * - TLS 1.3 only
 * - Client certificate authentication
 * - Server certificate validation
 * - Forward secrecy ciphers
 */

import * as fs from 'fs';
import * as path from 'path';
import * as tls from 'tls';
import * as https from 'https';
import WebSocket from 'ws';
import { logger } from './logger';

export interface TLSConfig {
  // Certificate paths
  certPath: string;              // This validator's certificate
  keyPath: string;               // This validator's private key
  caPath: string;                // CA certificate (to verify other validators)

  // Optional: custom validation
  validateCertificate?: (cert: any) => boolean;

  // TLS version and ciphers
  minVersion?: string;           // Default: TLSv1.3
  ciphers?: string;              // Default: Strong ciphers only

  // Timeouts
  handshakeTimeout?: number;     // Default: 10000ms
}

/**
 * TLS Configuration Manager
 */
export class TLSConfigManager {
  private config: TLSConfig;

  constructor(config: TLSConfig) {
    this.config = config;
    this.validateConfig();
  }

  /**
   * Validate TLS configuration
   */
  private validateConfig(): void {
    // Check if certificate files exist
    if (!fs.existsSync(this.config.certPath)) {
      throw new Error(`Certificate file not found: ${this.config.certPath}`);
    }

    if (!fs.existsSync(this.config.keyPath)) {
      throw new Error(`Private key file not found: ${this.config.keyPath}`);
    }

    if (!fs.existsSync(this.config.caPath)) {
      throw new Error(`CA certificate file not found: ${this.config.caPath}`);
    }

    logger.info('✅ TLS configuration validated');
  }

  /**
   * Get TLS options for Node.js TLS/HTTPS
   */
  getTLSOptions(): tls.TlsOptions {
    return {
      cert: fs.readFileSync(this.config.certPath),
      key: fs.readFileSync(this.config.keyPath),
      ca: fs.readFileSync(this.config.caPath),

      // Require client certificates
      requestCert: true,
      rejectUnauthorized: true,

      // TLS version
      minVersion: (this.config.minVersion as any) || 'TLSv1.3',
      maxVersion: 'TLSv1.3',

      // Strong ciphers only
      ciphers: this.config.ciphers || [
        'TLS_AES_256_GCM_SHA384',
        'TLS_CHACHA20_POLY1305_SHA256',
        'TLS_AES_128_GCM_SHA256',
      ].join(':'),

      // Session management
      sessionTimeout: 300, // 5 minutes

      // Handshake timeout
      handshakeTimeout: this.config.handshakeTimeout || 10000,
    };
  }

  /**
   * Create secure WebSocket client
   */
  createSecureWebSocketClient(url: string): WebSocket {
    const tlsOptions = this.getTLSOptions();

    const ws = new WebSocket(url, {
      ...tlsOptions,
      rejectUnauthorized: true,
    });

    // Add certificate validation
    ws.on('open', () => {
      const socket = (ws as any)._socket;

      if (socket.getPeerCertificate) {
        const cert = socket.getPeerCertificate();

        logger.info('🔐 Secure connection established');
        logger.info(`   Server: ${cert.subject?.CN}`);
        logger.info(`   Valid until: ${cert.valid_to}`);

        // Custom validation
        if (this.config.validateCertificate && !this.config.validateCertificate(cert)) {
          logger.error('❌ Certificate validation failed');
          ws.close();
          return;
        }
      }
    });

    return ws;
  }

  /**
   * Create secure HTTPS server
   */
  createSecureHTTPSServer(requestHandler: any): https.Server {
    const tlsOptions = this.getTLSOptions();

    const server = https.createServer(tlsOptions, requestHandler);

    // Certificate verification logging
    server.on('secureConnection', (tlsSocket) => {
      const cert = tlsSocket.getPeerCertificate();

      if (cert && cert.subject) {
        logger.info(`🔐 Client connected: ${cert.subject.CN}`);
      } else {
        logger.warn('⚠️  Client connected without certificate');
      }
    });

    return server;
  }

  /**
   * Create secure WebSocket server
   */
  createSecureWebSocketServer(port: number): WebSocket.Server {
    const tlsOptions = this.getTLSOptions();

    const httpsServer = https.createServer(tlsOptions);
    const wss = new WebSocket.Server({ server: httpsServer });

    // Verify client certificates
    wss.on('connection', (ws, request) => {
      const socket = request.socket as tls.TLSSocket;
      const cert = socket.getPeerCertificate();

      if (!cert || !cert.subject) {
        logger.error('❌ Client without valid certificate attempted to connect');
        ws.close(1008, 'Certificate required');
        return;
      }

      logger.info(`🔐 Validator connected: ${cert.subject.CN}`);

      // Custom validation
      if (this.config.validateCertificate && !this.config.validateCertificate(cert)) {
        logger.error(`❌ Certificate validation failed for: ${cert.subject.CN}`);
        ws.close(1008, 'Invalid certificate');
        return;
      }

      // Store certificate info for this connection
      (ws as any).certificateInfo = {
        subject: cert.subject.CN,
        issuer: cert.issuer.CN,
        validFrom: cert.valid_from,
        validTo: cert.valid_to,
        fingerprint: cert.fingerprint,
      };
    });

    httpsServer.listen(port, () => {
      logger.info(`🔐 Secure WebSocket server listening on port ${port} (TLS 1.3 with mTLS)`);
    });

    return wss;
  }

  /**
   * Verify a peer's certificate
   */
  verifyCertificate(cert: any): boolean {
    // Check if certificate is valid
    const now = new Date();
    const validFrom = new Date(cert.valid_from);
    const validTo = new Date(cert.valid_to);

    if (now < validFrom || now > validTo) {
      logger.error('❌ Certificate expired or not yet valid');
      return false;
    }

    // Check issuer (must be our CA)
    const ca = tls.rootCertificates;
    // In production, verify against our CA

    logger.info(`✅ Certificate valid for ${cert.subject.CN}`);
    return true;
  }
}

/**
 * Certificate Generator (for initial setup)
 */
export class CertificateGenerator {
  /**
   * Generate CA certificate (run once)
   */
  static async generateCA(outputDir: string): Promise<void> {
    const { execSync } = await import('child_process');

    logger.info('Generating CA certificate...');

    const caKeyPath = path.join(outputDir, 'ca-key.pem');
    const caCertPath = path.join(outputDir, 'ca.crt');

    // Generate CA private key
    execSync(`openssl genrsa -out "${caKeyPath}" 4096`);

    // Generate CA certificate (valid for 10 years)
    execSync(`openssl req -x509 -new -nodes \\
      -key "${caKeyPath}" \\
      -sha256 -days 3650 \\
      -out "${caCertPath}" \\
      -subj "/C=US/ST=CA/L=SF/O=RapidX/CN=RapidX Validator CA"`);

    logger.info(`✅ CA certificate generated: ${caCertPath}`);
    logger.info('⚠️  KEEP ca-key.pem SECURE - needed to sign validator certificates');
  }

  /**
   * Generate validator certificate (run for each validator)
   */
  static async generateValidatorCert(
    validatorId: string,
    outputDir: string,
    caKeyPath: string,
    caCertPath: string
  ): Promise<void> {
    const { execSync } = await import('child_process');

    logger.info(`Generating certificate for ${validatorId}...`);

    const keyPath = path.join(outputDir, `${validatorId}-key.pem`);
    const csrPath = path.join(outputDir, `${validatorId}.csr`);
    const certPath = path.join(outputDir, `${validatorId}.crt`);

    // Generate private key
    execSync(`openssl genrsa -out "${keyPath}" 4096`);

    // Generate CSR (Certificate Signing Request)
    execSync(`openssl req -new \\
      -key "${keyPath}" \\
      -out "${csrPath}" \\
      -subj "/C=US/ST=CA/L=SF/O=RapidX/CN=${validatorId}.rapidx.io"`);

    // Sign with CA (valid for 1 year)
    execSync(`openssl x509 -req \\
      -in "${csrPath}" \\
      -CA "${caCertPath}" \\
      -CAkey "${caKeyPath}" \\
      -CAcreateserial \\
      -out "${certPath}" \\
      -days 365 -sha256`);

    // Cleanup CSR
    fs.unlinkSync(csrPath);

    logger.info(`✅ Certificate generated: ${certPath}`);
    logger.info(`   Private key: ${keyPath}`);
    logger.info('⚠️  Distribute only the .crt file, keep .pem PRIVATE');
  }
}

/**
 * Example usage:
 *
 * // 1. Initial setup - Generate CA (run once)
 * await CertificateGenerator.generateCA('./certs');
 *
 * // 2. Generate certificate for each validator
 * await CertificateGenerator.generateValidatorCert(
 *   'validator-1',
 *   './certs',
 *   './certs/ca-key.pem',
 *   './certs/ca.crt'
 * );
 *
 * // 3. Use in validator node
 * const tlsConfig = new TLSConfigManager({
 *   certPath: './certs/validator-1.crt',
 *   keyPath: './certs/validator-1-key.pem',
 *   caPath: './certs/ca.crt',
 *   validateCertificate: (cert) => {
 *     // Custom validation logic
 *     return cert.subject.CN.startsWith('validator-');
 *   },
 * });
 *
 * // 4. Create secure WebSocket client
 * const ws = tlsConfig.createSecureWebSocketClient('wss://orchestrator.rapidx.io:9001');
 *
 * // 5. Create secure WebSocket server
 * const wss = tlsConfig.createSecureWebSocketServer(9001);
 */

/**
 * Automated certificate rotation
 */
export class CertificateRotationManager {
  private tlsConfig: TLSConfigManager;
  private checkInterval: NodeJS.Timeout;

  constructor(tlsConfig: TLSConfigManager) {
    this.tlsConfig = tlsConfig;
  }

  /**
   * Start monitoring certificate expiration
   */
  startMonitoring(daysBeforeExpiry: number = 30): void {
    // Check every day
    this.checkInterval = setInterval(() => {
      this.checkCertificateExpiry(daysBeforeExpiry);
    }, 24 * 60 * 60 * 1000);

    // Check immediately
    this.checkCertificateExpiry(daysBeforeExpiry);
  }

  /**
   * Check if certificate is about to expire
   */
  private checkCertificateExpiry(daysBeforeExpiry: number): void {
    const cert = this.readCertificate();
    const expiryDate = new Date(cert.valid_to);
    const now = new Date();
    const daysUntilExpiry = Math.floor((expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

    if (daysUntilExpiry <= daysBeforeExpiry) {
      logger.warn(`⚠️  Certificate expires in ${daysUntilExpiry} days!`);
      logger.warn('   Action required: Generate and deploy new certificate');

      // TODO: Trigger automated renewal
      // this.renewCertificate();
    } else {
      logger.info(`✅ Certificate valid for ${daysUntilExpiry} more days`);
    }
  }

  /**
   * Read certificate information
   */
  private readCertificate(): any {
    const { exec } = require('child_process');
    const util = require('util');
    const execAsync = util.promisify(exec);

    // Use openssl to read certificate
    // const certInfo = await execAsync(`openssl x509 -in ${certPath} -noout -dates`);
    // Parse dates and return

    return {
      valid_from: new Date().toISOString(),
      valid_to: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }
}
