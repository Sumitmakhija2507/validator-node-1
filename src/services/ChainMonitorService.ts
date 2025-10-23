/**
 * Multi-Chain RPC Monitor Service
 * Listens to all RapidX supported chains for bridge events
 */

import { ethers } from 'ethers';
import { Connection as SolanaConnection } from '@solana/web3.js';
import { StargateClient } from '@cosmjs/stargate';
import { TonClient } from 'ton';
import { logger } from '../utils/logger';
import EventEmitter from 'events';

export interface DeploymentInfo {
  chainId: number;
  chainName: string;
  signal: string;
  verifier: string;
  messenger: string;
  rpcUrl: string;
}

export interface ChainConfig {
  deployments?: DeploymentInfo[];
  // Legacy config (kept for backward compatibility)
  ethereumRpc?: string;
  bscRpc?: string;
  polygonRpc?: string;
  arbitrumRpc?: string;
  optimismRpc?: string;
  avalancheRpc?: string;
  fantomRpc?: string;
  baseRpc?: string;
  solanaRpc?: string;
  cosmosRpc?: string;
  tonRpc?: string;
}

export interface BridgeEvent {
  chainId: string;
  chainName: string;
  eventType: 'LOCK' | 'UNLOCK' | 'BURN' | 'MINT';
  txHash: string;
  fromAddress: string;
  toAddress: string;
  amount: string;
  token: string;
  destinationChain: string;
  timestamp: number;
  blockNumber: number;
}

export class ChainMonitorService extends EventEmitter {
  private evmProviders: Map<string, ethers.JsonRpcProvider> = new Map();
  private solanaConnection?: SolanaConnection;
  private cosmosClient?: StargateClient;
  private tonClient?: TonClient;
  private isMonitoring: boolean = false;
  private monitoringIntervals: NodeJS.Timeout[] = [];

  constructor(private config: ChainConfig) {
    super();
  }

  /**
   * Initialize all RPC connections
   */
  async startMonitoring(): Promise<void> {
    logger.info('🔍 Initializing multi-chain monitoring...');

    // Use auto-loaded deployments if available
    if (this.config.deployments && this.config.deployments.length > 0) {
      await this.initializeFromDeployments();
    } else {
      // Fallback to legacy configuration
      await this.initializeEVMChains();

      // Initialize Solana
      if (this.config.solanaRpc) {
        await this.initializeSolana();
      }

      // Initialize Cosmos
      if (this.config.cosmosRpc) {
        await this.initializeCosmos();
      }

      // Initialize TON
      if (this.config.tonRpc) {
        await this.initializeTON();
      }
    }

    this.isMonitoring = true;
    logger.info('✅ Multi-chain monitoring active');
  }

  /**
   * Initialize monitoring from auto-loaded deployments
   */
  private async initializeFromDeployments(): Promise<void> {
    for (const deployment of this.config.deployments!) {
      try {
        const provider = new ethers.JsonRpcProvider(deployment.rpcUrl);

        console.log(deployment.rpcUrl)
        await provider.getNetwork(); // Test connection

        this.evmProviders.set(deployment.chainId.toString(), provider);

        // Start listening for Signal events
        this.listenSignalEvents(
          deployment.chainId.toString(),
          deployment.chainName,
          provider,
          deployment.signal
        );

        logger.info(`✅ ${deployment.chainName} monitoring active (Chain ID: ${deployment.chainId})`);
        logger.info(`   Signal: ${deployment.signal}`);
      } catch (error) {
        logger.error(`❌ Failed to connect to ${deployment.chainName}:`, error);
      }
    }
  }

  /**
   * Initialize all EVM-compatible chains
   */
  private async initializeEVMChains(): Promise<void> {
    const evmChains = [
      { name: 'Ethereum', rpc: this.config.ethereumRpc, chainId: '1' },
      { name: 'BSC', rpc: this.config.bscRpc, chainId: '56' },
      { name: 'Polygon', rpc: this.config.polygonRpc, chainId: '137' },
      { name: 'Arbitrum', rpc: this.config.arbitrumRpc, chainId: '42161' },
      { name: 'Optimism', rpc: this.config.optimismRpc, chainId: '10' },
      { name: 'Avalanche', rpc: this.config.avalancheRpc, chainId: '43114' },
      { name: 'Fantom', rpc: this.config.fantomRpc, chainId: '250' },
      { name: 'Base', rpc: this.config.baseRpc, chainId: '8453' },
    ];

    for (const chain of evmChains) {
      if (chain.rpc) {
        try {
          const provider = new ethers.JsonRpcProvider(chain.rpc);
          await provider.getNetwork(); // Test connection
          this.evmProviders.set(chain.chainId, provider);

          // Start listening for events
          this.listenEVMEvents(chain.chainId, chain.name, provider);

          logger.info(`✅ ${chain.name} RPC connected (Chain ID: ${chain.chainId})`);
        } catch (error) {
          logger.error(`❌ Failed to connect to ${chain.name}:`, error);
        }
      }
    }
  }

  /**
   * Listen to EVM chain events
   */
  private listenEVMEvents(chainId: string, chainName: string, provider: ethers.JsonRpcProvider): void {
    // Signal contract address (primary - for cross-chain messaging)
    const signalAddress = process.env[`${chainName.toUpperCase()}_SIGNAL_ADDRESS`];

    // Bridge contract address (secondary - for token bridging)
    const bridgeAddress = process.env[`${chainName.toUpperCase()}_BRIDGE_ADDRESS`];

    // Listen to Signal contract events
    if (signalAddress) {
      this.listenSignalEvents(chainId, chainName, provider, signalAddress);
    } else {
      logger.warn(`No Signal contract address configured for ${chainName}`);
    }

    // Listen to Bridge contract events
    if (bridgeAddress) {
      this.listenBridgeEvents(chainId, chainName, provider, bridgeAddress);
    } else {
      logger.warn(`No bridge address configured for ${chainName}`);
    }
  }

  /**
   * Listen to Signal contract events (SignalSent)
   */
  private listenSignalEvents(chainId: string, chainName: string, provider: ethers.JsonRpcProvider, signalAddress: string): void {
    // Signal contract ABI
    const signalABI = [
      'event SignalSent(bytes32 indexed signalId, uint32 indexed srcChainId, uint32 indexed dstChainId, address srcAddress, address dstAddress, uint32 nonce, bytes payload, uint256 timestamp)',
      'event SignalReceived(bytes32 indexed signalId, uint32 indexed srcChainId, address indexed dstAddress, bytes payload, uint256 timestamp)',
    ];

    const signalContract = new ethers.Contract(signalAddress, signalABI, provider);

    // Listen to SignalSent event - THIS IS THE KEY EVENT FOR TSS SIGNING
    signalContract.on('SignalSent', async (signalId, srcChainId, dstChainId, srcAddress, dstAddress, nonce, payload, timestamp, event) => {
      logger.info(`📡 SignalSent event detected on ${chainName}:`, {
        signalId: signalId.slice(0, 10) + '...',
        srcChain: srcChainId.toString(),
        dstChain: dstChainId.toString(),
        txHash: event.log.transactionHash,
      });

      // Emit signal event for validator processing
      this.emit('signalEvent', {
        signalId,
        srcChainId: srcChainId.toString(),
        dstChainId: dstChainId.toString(),
        srcAddress,
        dstAddress,
        nonce: nonce.toString(),
        payload: payload,
        timestamp: timestamp.toString(),
        txHash: event.log.transactionHash,
        blockNumber: event.log.blockNumber,
        chainName,
      });
    });

    // Listen to SignalReceived event (for monitoring)
    signalContract.on('SignalReceived', async (signalId, srcChainId, dstAddress, payload, timestamp, event) => {
      logger.info(`📨 SignalReceived event detected on ${chainName}:`, {
        signalId: signalId.slice(0, 10) + '...',
        srcChain: srcChainId.toString(),
        txHash: event.log.transactionHash,
      });
    });

    logger.info(`👂 Listening for Signal events on ${chainName} (${signalAddress})`);
  }

  /**
   * Listen to Bridge contract events (for token bridging)
   */
  private listenBridgeEvents(chainId: string, chainName: string, provider: ethers.JsonRpcProvider, bridgeAddress: string): void {
    // Bridge contract ABI (simplified - should match your contract)
    const bridgeABI = [
      'event TokensLocked(address indexed from, uint256 amount, string destinationChain, address token, bytes32 indexed requestId)',
      'event TokensUnlocked(address indexed to, uint256 amount, bytes32 indexed requestId)',
    ];

    const bridgeContract = new ethers.Contract(bridgeAddress, bridgeABI, provider);

    // Listen to TokensLocked event
    bridgeContract.on('TokensLocked', async (from, amount, destinationChain, token, requestId, event) => {
      const bridgeEvent: BridgeEvent = {
        chainId,
        chainName,
        eventType: 'LOCK',
        txHash: event.log.transactionHash,
        fromAddress: from,
        toAddress: '', // Will be determined by orchestrator
        amount: amount.toString(),
        token,
        destinationChain,
        timestamp: Date.now(),
        blockNumber: event.log.blockNumber,
      };

      logger.info(`🔒 Lock event detected on ${chainName}:`, {
        txHash: bridgeEvent.txHash,
        amount: ethers.formatUnits(amount, 18),
        destination: destinationChain,
      });

      this.emit('bridgeEvent', bridgeEvent);
    });

    // Listen to TokensUnlocked event
    bridgeContract.on('TokensUnlocked', async (to, amount, requestId, event) => {
      const bridgeEvent: BridgeEvent = {
        chainId,
        chainName,
        eventType: 'UNLOCK',
        txHash: event.log.transactionHash,
        fromAddress: '',
        toAddress: to,
        amount: amount.toString(),
        token: '', // Get from request data
        destinationChain: chainName,
        timestamp: Date.now(),
        blockNumber: event.log.blockNumber,
      };

      logger.info(`🔓 Unlock event detected on ${chainName}:`, {
        txHash: bridgeEvent.txHash,
        amount: ethers.formatUnits(amount, 18),
        to,
      });

      this.emit('bridgeEvent', bridgeEvent);
    });

    logger.info(`👂 Listening for bridge events on ${chainName} (${bridgeAddress})`);
  }

  /**
   * Initialize Solana connection and monitoring
   */
  private async initializeSolana(): Promise<void> {
    try {
      this.solanaConnection = new SolanaConnection(this.config.solanaRpc!, 'confirmed');

      // Test connection
      const version = await this.solanaConnection.getVersion();
      logger.info(`✅ Solana RPC connected (Version: ${version['solana-core']})`);

      // Start monitoring Solana events
      this.listenSolanaEvents();
    } catch (error) {
      logger.error('❌ Failed to connect to Solana:', error);
    }
  }

  /**
   * Listen to Solana program events
   */
  private listenSolanaEvents(): void {
    if (!this.solanaConnection) return;

    const programId = process.env.SOLANA_BRIDGE_PROGRAM_ID;
    if (!programId) {
      logger.warn('No Solana bridge program ID configured');
      return;
    }

    // Poll for program account changes
    const interval = setInterval(async () => {
      try {
        // Implementation depends on your Solana program structure
        // This is a placeholder for actual Solana event listening
        logger.debug('Checking Solana bridge program...');
      } catch (error) {
        logger.error('Error monitoring Solana:', error);
      }
    }, 5000);

    this.monitoringIntervals.push(interval);
    logger.info('👂 Listening for bridge events on Solana');
  }

  /**
   * Initialize Cosmos connection
   */
  private async initializeCosmos(): Promise<void> {
    try {
      this.cosmosClient = await StargateClient.connect(this.config.cosmosRpc!);

      const chainId = await this.cosmosClient.getChainId();
      logger.info(`✅ Cosmos RPC connected (Chain ID: ${chainId})`);

      this.listenCosmosEvents();
    } catch (error) {
      logger.error('❌ Failed to connect to Cosmos:', error);
    }
  }

  /**
   * Listen to Cosmos events
   */
  private listenCosmosEvents(): void {
    // Cosmos event listening implementation
    logger.info('👂 Listening for bridge events on Cosmos');
  }

  /**
   * Initialize TON connection
   */
  private async initializeTON(): Promise<void> {
    try {
      this.tonClient = new TonClient({ endpoint: this.config.tonRpc! });
      logger.info('✅ TON RPC connected');

      this.listenTONEvents();
    } catch (error) {
      logger.error('❌ Failed to connect to TON:', error);
    }
  }

  /**
   * Listen to TON events
   */
  private listenTONEvents(): void {
    // TON event listening implementation
    logger.info('👂 Listening for bridge events on TON');
  }

  /**
   * Get list of active chains being monitored
   */
  getActiveChains(): string[] {
    const chains: string[] = [];

    this.evmProviders.forEach((_, chainId) => {
      chains.push(`EVM-${chainId}`);
    });

    if (this.solanaConnection) chains.push('Solana');
    if (this.cosmosClient) chains.push('Cosmos');
    if (this.tonClient) chains.push('TON');

    return chains;
  }

  /**
   * Check health of all RPC connections
   */
  async checkHealth(): Promise<{ chain: string; healthy: boolean; latency: number }[]> {
    const healthChecks: { chain: string; healthy: boolean; latency: number }[] = [];

    // Check EVM chains
    for (const [chainId, provider] of this.evmProviders) {
      const start = Date.now();
      try {
        await provider.getBlockNumber();
        healthChecks.push({
          chain: `EVM-${chainId}`,
          healthy: true,
          latency: Date.now() - start,
        });
      } catch (error) {
        healthChecks.push({
          chain: `EVM-${chainId}`,
          healthy: false,
          latency: Date.now() - start,
        });
      }
    }

    // Check Solana
    if (this.solanaConnection) {
      const start = Date.now();
      try {
        await this.solanaConnection.getSlot();
        healthChecks.push({
          chain: 'Solana',
          healthy: true,
          latency: Date.now() - start,
        });
      } catch (error) {
        healthChecks.push({
          chain: 'Solana',
          healthy: false,
          latency: Date.now() - start,
        });
      }
    }

    return healthChecks;
  }

  /**
   * Stop monitoring all chains
   */
  async stop(): Promise<void> {
    this.isMonitoring = false;

    // Clear all intervals
    this.monitoringIntervals.forEach(interval => clearInterval(interval));
    this.monitoringIntervals = [];

    // Remove all EVM listeners
    for (const provider of this.evmProviders.values()) {
      provider.removeAllListeners();
    }

    logger.info('⏹️  Chain monitoring stopped');
  }
}
