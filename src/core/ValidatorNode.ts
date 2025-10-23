/**
 * Core Validator Node
 * Orchestrates all validator operations including TSS signing
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { ethers } from 'ethers';
import { logger } from '../utils/logger';
import { TSSService, SigningRequest } from '../services/TSSService';
import { DKGService, DKGConfig, DKGResult } from '../services/DKGService';
import type { ChainMonitorService, BridgeEvent } from '../services/ChainMonitorService';
import type { RevenueTracker } from '../services/RevenueTracker';

export interface ValidatorConfig {
  validatorId: string;
  validatorName: string;
  orchestratorUrl: string;
  orchestratorWs: string;
  tssService: TSSService;
  chainMonitor: ChainMonitorService;
  revenueTracker: RevenueTracker;
}

export class ValidatorNode extends EventEmitter {
  private config: ValidatorConfig;
  private wsConnection?: WebSocket;
  private isRunning: boolean = false;
  private reconnectTimer?: NodeJS.Timeout;
  private dkgService?: DKGService;

  constructor(config: ValidatorConfig) {
    super();
    this.config = config;
  }

  /**
   * Start the validator node
   */
  async start(): Promise<void> {
    logger.info(`Starting Validator Node: ${this.config.validatorId}`);

    this.isRunning = true;

    // Connect to orchestrator
    await this.connectToOrchestrator();

    // Setup TSS event listeners
    this.setupTSSListeners();

    // Setup chain monitor listeners
    this.setupChainListeners();

    logger.info('✅ Validator Node started successfully');
  }

  /**
   * Connect to orchestrator via WebSocket
   */
  private async connectToOrchestrator(): Promise<void> {
    // Skip if no orchestrator configured
    if (!this.config.orchestratorWs || this.config.orchestratorWs.length === 0) {
      logger.info('⚠️  No orchestrator configured - running in standalone mode');
      return;
    }

    logger.info(`Connecting to orchestrator: ${this.config.orchestratorWs}`);

    this.wsConnection = new WebSocket(this.config.orchestratorWs);

    this.wsConnection.on('open', () => {
      logger.info('✅ Connected to orchestrator');

      // Send registration
      this.wsConnection?.send(JSON.stringify({
        type: 'VALIDATOR_REGISTER',
        validatorId: this.config.validatorId,
        validatorName: this.config.validatorName,
        timestamp: Date.now(),
      }));
    });

    this.wsConnection.on('message', (data: Buffer) => {
      this.handleOrchestratorMessage(data);
    });

    this.wsConnection.on('close', () => {
      logger.warn('Disconnected from orchestrator');
      this.scheduleReconnect();
    });

    this.wsConnection.on('error', (error) => {
      logger.error('Orchestrator connection error:', error);
    });
  }

  /**
   * Handle messages from orchestrator
   */
  private handleOrchestratorMessage(data: Buffer): void {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'SIGNING_REQUEST':
          this.handleSigningRequest(message.data);
          break;

        case 'PARTIAL_SIGNATURE':
          this.handlePartialSignature(message.data);
          break;

        case 'HEARTBEAT':
          this.sendHeartbeat();
          break;

        // DKG Ceremony Messages
        case 'DKG_START':
          this.handleDKGStart(message.data);
          break;

        case 'DKG_COMMITMENT':
        case 'DKG_SHARE':
        case 'DKG_PUBLIC_KEY_SHARE':
          this.handleDKGMessage(message);
          break;

        default:
          logger.debug(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      logger.error('Error handling orchestrator message:', error);
    }
  }

  /**
   * Handle signing request from orchestrator
   */
  private async handleSigningRequest(data: any): Promise<void> {
    logger.info(`📝 Received signing request: ${data.requestId}`);

    const signingRequest: SigningRequest = {
      requestId: data.requestId,
      txHash: data.txHash,
      sourceChain: data.sourceChain,
      destinationChain: data.destinationChain,
      message: Buffer.from(data.message, 'hex'),
      participants: data.participants || [1, 2, 3], // Default to first 3 validators
    };

    // Initiate TSS signing
    await this.config.tssService.initiateSigning(signingRequest);
  }

  /**
   * Handle partial signature from another validator
   */
  private async handlePartialSignature(data: any): Promise<void> {
    logger.info(`Received partial signature from Party ${data.partyId}`);

    await this.config.tssService.receivePartialSignature(data.requestId, {
      partyId: data.partyId,
      signature: Buffer.from(data.signature, 'hex'),
      publicKeyShare: Buffer.from(data.publicKeyShare, 'hex'),
    });
  }

  /**
   * Setup TSS service event listeners
   */
  private setupTSSListeners(): void {
    // When we generate a partial signature, send to orchestrator
    this.config.tssService.on('partialSignatureGenerated', (data) => {
      this.wsConnection?.send(JSON.stringify({
        type: 'PARTIAL_SIGNATURE',
        validatorId: this.config.validatorId,
        data: {
          requestId: data.requestId,
          partyId: data.partyId,
          signature: data.signature.signature.toString('hex'),
          publicKeyShare: data.signature.publicKeyShare.toString('hex'),
        },
      }));

      logger.info(`Sent partial signature to orchestrator`);
    });

    // When signature is complete, emit event for recording on-chain
    this.config.tssService.on('signatureComplete', async (data) => {
      logger.info(`🎉 Signature complete for ${data.txHash}`);

      // Notify orchestrator
      this.wsConnection?.send(JSON.stringify({
        type: 'SIGNATURE_COMPLETE',
        validatorId: this.config.validatorId,
        data: {
          requestId: data.requestId,
          txHash: data.txHash,
          sourceChain: data.sourceChain,
          destinationChain: data.destinationChain,
          signature: data.signature,
          participants: data.participants,
        },
      }));

      // This event will trigger on-chain recording
      this.emit('signatureComplete', {
        txHash: data.txHash,
        sourceChain: data.sourceChain,
        destinationChain: data.destinationChain,
        signature: data.signature,
        validator: this.config.validatorId,
      });
    });
  }

  /**
   * Setup chain monitor event listeners
   */
  private setupChainListeners(): void {
    // Listen for SignalSent events - PRIMARY event for TSS signing
    this.config.chainMonitor.on('signalEvent', async (event: any) => {
      logger.info(`📡 Signal event detected on ${event.chainName}`);
      logger.info(`Signal ID: ${event.signalId.slice(0, 10)}...`);
      logger.info(`Route: Chain ${event.srcChainId} -> Chain ${event.dstChainId}`);

      // Initiate TSS signing process immediately
      await this.handleSignalEvent(event);
    });

    // Listen for bridge events (token bridging)
    this.config.chainMonitor.on('bridgeEvent', async (event: BridgeEvent) => {
      logger.info(`Bridge event detected on ${event.chainName}: ${event.eventType}`);

      // Forward to orchestrator for signing coordination
      this.wsConnection?.send(JSON.stringify({
        type: 'BRIDGE_EVENT',
        validatorId: this.config.validatorId,
        event,
      }));
    });
  }

  /**
   * Handle signal event and initiate TSS signing
   */
  private async handleSignalEvent(event: any): Promise<void> {
    try {
      // Generate unique request ID for this signing ceremony
      const requestId = `${event.signalId}-${event.txHash.slice(0, 10)}`;

      logger.info(`🔐 Initiating TSS signing for signal ${event.signalId.slice(0, 10)}...`);

      // Create signing request
      const signingRequest = {
        requestId,
        txHash: event.txHash,
        sourceChain: event.srcChainId,
        destinationChain: event.dstChainId,
        message: Buffer.from(event.signalId.slice(2), 'hex'), // Remove '0x' prefix
        participants: [1, 2, 3], // Default: first 3 validators (3-of-5 threshold)
      };

      // Record revenue for this signature request
      await this.config.revenueTracker.recordSignatureRequest(
        event.signalId,
        event.srcChainId,
        event.dstChainId,
        event.txHash
      );

      // Initiate TSS signing
      await this.config.tssService.initiateSigning(signingRequest);

      // Notify orchestrator about the new signal (if connected)
      if (this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
        this.wsConnection.send(JSON.stringify({
          type: 'SIGNAL_EVENT',
          validatorId: this.config.validatorId,
          data: {
            signalId: event.signalId,
            srcChainId: event.srcChainId,
            dstChainId: event.dstChainId,
            txHash: event.txHash,
            requestId,
          },
        }));
      }

      logger.info(`✅ TSS signing initiated for signal ${event.signalId.slice(0, 10)}...`);
    } catch (error) {
      logger.error('Error handling signal event:', error);
    }
  }

  /**
   * Send heartbeat to orchestrator
   */
  private sendHeartbeat(): void {
    const healthData = {
      validatorId: this.config.validatorId,
      uptime: process.uptime(),
      activeChains: this.config.chainMonitor.getActiveChains(),
      pendingSignings: this.config.tssService.getPendingRequests().length,
      hasKeyShare: this.config.tssService.hasKeyShare(),
      timestamp: Date.now(),
    };

    this.wsConnection?.send(JSON.stringify({
      type: 'HEARTBEAT',
      data: healthData,
    }));
  }

  /**
   * Schedule reconnection to orchestrator
   */
  private scheduleReconnect(): void {
    if (!this.isRunning) return;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(async () => {
      logger.info('Attempting to reconnect to orchestrator...');
      await this.connectToOrchestrator();
    }, 5000); // Retry after 5 seconds
  }

  /**
   * Stop the validator node
   */
  async stop(): Promise<void> {
    logger.info('Stopping Validator Node...');

    this.isRunning = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.wsConnection) {
      this.wsConnection.close();
    }

    logger.info('Validator Node stopped');
  }

  /**
   * Get node status
   */
  getStatus() {
    return {
      validatorId: this.config.validatorId,
      validatorName: this.config.validatorName,
      isRunning: this.isRunning,
      connected: this.wsConnection?.readyState === WebSocket.OPEN,
      uptime: process.uptime(),
      activeChains: this.config.chainMonitor.getActiveChains(),
      pendingSignings: this.config.tssService.getPendingRequests(),
      hasKeyShare: this.config.tssService.hasKeyShare(),
    };
  }

  /**
   * Start DKG ceremony
   * This should be called on ONE validator to initiate the ceremony
   */
  async startDKGCeremony(): Promise<DKGResult> {
    logger.info('🔐 Starting DKG ceremony...');

    if (!this.wsConnection || this.wsConnection.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to orchestrator. DKG requires orchestrator connection.');
    }

    // Extract party ID from validator ID (e.g., "validator-1" -> 1)
    const partyIdMatch = this.config.validatorId.match(/(\d+)$/);
    if (!partyIdMatch) {
      throw new Error('Invalid validator ID format. Expected format: validator-{number}');
    }
    const partyId = parseInt(partyIdMatch[1]);

    // Initialize DKG service with orchestrator WebSocket
    this.dkgService = new DKGService({
      partyId: partyId,
      threshold: 3, // 3-of-5 threshold
      totalParties: 5,
      peers: [], // Not used - we use orchestrator
      timeout: 60000, // 60 seconds per round
    });

    // Connect DKG service to orchestrator WebSocket
    (this.dkgService as any).wsConnection = this.wsConnection;

    // Setup DKG event forwarding to orchestrator
    this.setupDKGEventForwarding();

    // Notify orchestrator that we're starting DKG
    this.wsConnection.send(JSON.stringify({
      type: 'DKG_START',
      validatorId: this.config.validatorId,
      timestamp: Date.now(),
    }));

    // Run the DKG ceremony
    const result = await this.dkgService.runDKGCeremony();

    logger.info('✅ DKG ceremony completed');

    return result;
  }

  /**
   * Setup event forwarding from DKG service to orchestrator
   */
  private setupDKGEventForwarding(): void {
    if (!this.dkgService) return;

    // Forward DKG messages to orchestrator
    this.dkgService.on('dkgMessage', (message: any) => {
      this.wsConnection?.send(JSON.stringify({
        type: message.type,
        validatorId: this.config.validatorId,
        data: message.data,
      }));
    });
  }

  /**
   * Handle DKG start message from orchestrator
   */
  private async handleDKGStart(data: any): Promise<void> {
    logger.info('📡 DKG ceremony started by orchestrator');
    // If we didn't initiate, the DKG service will be created when we receive messages
  }

  /**
   * Handle DKG messages from orchestrator
   */
  private handleDKGMessage(message: any): void {
    if (!this.dkgService) {
      logger.warn('Received DKG message but DKG service not initialized');
      return;
    }

    // Forward message to DKG service
    (this.dkgService as any).handleOrchestratorMessage(message);
  }
}
