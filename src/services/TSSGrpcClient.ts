/**
 * gRPC Client for TSS Service
 * Connects to the Go-based TSS service that uses bnb-chain/tss-lib
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { logger } from '../utils/logger';
import * as path from 'path';

const PROTO_PATH = path.join(__dirname, '../../proto/tss_service.proto');

interface DKGConfig {
  partyId: number;
  threshold: number;
  totalParties: number;
  peerEndpoints: string[];
  timeoutSeconds: number;
}

interface DKGResult {
  keyShare: Buffer;
  publicKeyShare: Buffer;
  aggregatedPublicKey: Buffer;
  participants: number[];
}

interface SigningRequest {
  requestId: string;
  message: Buffer;
  partyId: number;
  participants: number[];
  timeoutSeconds: number;
}

interface PartialSignatureResult {
  signature: Buffer;
  publicKeyShare: Buffer;
}

interface PartialSignatureInput {
  partyId: number;
  signature: Buffer;
  publicKeyShare: Buffer;
}

interface AggregatedSignatureResult {
  signature: Buffer;
  participants: number[];
}

/**
 * TypeScript client for the Go-based TSS gRPC service
 */
export class TSSGrpcClient {
  private client: any;
  private connected: boolean = false;

  constructor(serverAddress: string = 'localhost:50051') {
    try {
      // Load proto file
      const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      });

      // Load the package definition
      const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
      const tssProto = protoDescriptor.rapidx.tss;

      // Create gRPC client
      this.client = new tssProto.TSSService(
        serverAddress,
        grpc.credentials.createInsecure()
      );

      this.connected = true;
      logger.info(`TSS gRPC client connected to ${serverAddress}`);
    } catch (error) {
      logger.error('Failed to initialize TSS gRPC client:', error);
      throw error;
    }
  }

  /**
   * Check if client is connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Run DKG (Distributed Key Generation) ceremony
   * @param config DKG configuration
   * @returns Key share and public keys
   */
  async runDKG(config: DKGConfig): Promise<DKGResult> {
    logger.info(`Running DKG for Party ${config.partyId}`);

    return new Promise((resolve, reject) => {
      this.client.RunDKG(
        {
          party_id: config.partyId,
          threshold: config.threshold,
          total_parties: config.totalParties,
          peer_endpoints: config.peerEndpoints,
          timeout_seconds: config.timeoutSeconds,
        },
        (error: Error | null, response: any) => {
          if (error) {
            logger.error('DKG error:', error);
            reject(error);
            return;
          }

          if (!response.success) {
            const errorMsg = response.error_message || 'Unknown DKG error';
            logger.error(`DKG failed: ${errorMsg}`);
            reject(new Error(errorMsg));
            return;
          }

          logger.info(`DKG successful for Party ${config.partyId}`);
          logger.info(`Participants: ${response.participants.join(', ')}`);

          resolve({
            keyShare: Buffer.from(response.key_share),
            publicKeyShare: Buffer.from(response.public_key_share),
            aggregatedPublicKey: Buffer.from(response.aggregated_public_key),
            participants: response.participants,
          });
        }
      );
    });
  }

  /**
   * Generate partial signature using TSS
   * @param request Signing request
   * @returns Partial signature
   */
  async generatePartialSignature(request: SigningRequest): Promise<PartialSignatureResult> {
    logger.info(`Generating partial signature for request ${request.requestId}`);

    return new Promise((resolve, reject) => {
      this.client.GeneratePartialSignature(
        {
          request_id: request.requestId,
          message: request.message,
          party_id: request.partyId,
          participants: request.participants,
          timeout_seconds: request.timeoutSeconds,
        },
        (error: Error | null, response: any) => {
          if (error) {
            logger.error('Partial signature error:', error);
            reject(error);
            return;
          }

          if (!response.success) {
            const errorMsg = response.error_message || 'Unknown signing error';
            logger.error(`Partial signature failed: ${errorMsg}`);
            reject(new Error(errorMsg));
            return;
          }

          logger.info(`Partial signature generated successfully`);

          resolve({
            signature: Buffer.from(response.signature),
            publicKeyShare: Buffer.from(response.public_key_share),
          });
        }
      );
    });
  }

  /**
   * Aggregate partial signatures into final signature
   * @param partialSignatures Array of partial signatures
   * @param threshold Minimum number of signatures required
   * @returns Aggregated signature
   */
  async aggregateSignatures(
    partialSignatures: PartialSignatureInput[],
    threshold: number = 3
  ): Promise<AggregatedSignatureResult> {
    logger.info(`Aggregating ${partialSignatures.length} partial signatures`);

    return new Promise((resolve, reject) => {
      this.client.AggregateSignatures(
        {
          partial_signatures: partialSignatures.map((ps) => ({
            party_id: ps.partyId,
            signature: ps.signature,
            public_key_share: ps.publicKeyShare,
          })),
          threshold: threshold,
        },
        (error: Error | null, response: any) => {
          if (error) {
            logger.error('Aggregation error:', error);
            reject(error);
            return;
          }

          if (!response.success) {
            const errorMsg = response.error_message || 'Unknown aggregation error';
            logger.error(`Aggregation failed: ${errorMsg}`);
            reject(new Error(errorMsg));
            return;
          }

          logger.info(`Signature aggregation successful`);
          logger.info(`Participants: ${response.participants.join(', ')}`);

          resolve({
            signature: Buffer.from(response.signature),
            participants: response.participants,
          });
        }
      );
    });
  }

  /**
   * Close the gRPC connection
   */
  close(): void {
    if (this.client) {
      grpc.closeClient(this.client);
      this.connected = false;
      logger.info('TSS gRPC client disconnected');
    }
  }
}
