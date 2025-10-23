/**
 * RapidX Validator Node
 * Professional TSS-based cross-chain validator
 */

import express from 'express';
import { WebSocketServer } from 'ws';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import { logger } from './utils/logger';
import { setupMetrics } from './monitoring/metrics';
import { loadDeployments } from './utils/loadDeployments';
import { ValidatorNode } from './core/ValidatorNode';
import { ChainMonitorService } from './services/ChainMonitorService';
import { TSSService } from './services/TSSService';
import { RevenueTracker } from './services/RevenueTracker';
import { HealthCheckService } from './services/HealthCheckService';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Metrics endpoint for Prometheus
setupMetrics(app);

// Initialize services
let validatorNode: ValidatorNode;
let chainMonitor: ChainMonitorService;
let tssService: TSSService;
let revenueTracker: RevenueTracker;
let healthCheck: HealthCheckService;

async function initializeServices() {
  try {
    logger.info('🚀 Starting RapidX Validator Node...');
    logger.info(`Validator ID: ${process.env.VALIDATOR_ID || 'validator-1'}`);

    // Load deployments automatically
    logger.info('📁 Loading contract deployments...');
    const deployments = loadDeployments();

    if (deployments.length === 0) {
      logger.error('❌ No deployments found! Please deploy contracts first.');
      logger.error('Run: npx hardhat run scripts/deploy.ts --network sepolia');
      process.exit(1);
    }

    logger.info(`✅ Loaded ${deployments.length} chain deployment(s)`);
    deployments.forEach(d => {
      logger.info(`   - ${d.chainName}: Signal=${d.signal.slice(0, 10)}...`);
    });

    // Initialize TSS Service
    tssService = new TSSService({
      partyId: parseInt(process.env.TSS_PARTY_ID || '1'),
      threshold: parseInt(process.env.TSS_THRESHOLD || '3'),
      totalParties: parseInt(process.env.TSS_TOTAL_PARTIES || '5'),
    });
    await tssService.initialize();
    logger.info('✅ TSS Service initialized');

    // Initialize Chain Monitor with auto-loaded deployments
    chainMonitor = new ChainMonitorService({
      deployments, // Pass deployments directly!
    });
    await chainMonitor.startMonitoring();
    logger.info('✅ Chain Monitor started - monitoring deployed chains');

    // Initialize Revenue Tracker (optional - skip if no database)
    const useDatabase = process.env.DATABASE_URL && process.env.DATABASE_URL.length > 0;

    if (useDatabase) {
      revenueTracker = new RevenueTracker({
        validatorId: process.env.VALIDATOR_ID || 'validator-1',
        walletAddress: process.env.REVENUE_WALLET_ADDRESS || '',
        minPayoutAmount: parseFloat(process.env.MIN_PAYOUT_AMOUNT || '100'),
      });
      await revenueTracker.initialize();
      logger.info('✅ Revenue Tracker initialized');
    } else {
      logger.warn('⚠️  Revenue Tracker disabled (no DATABASE_URL configured)');
      // Create a dummy revenue tracker that does nothing
      revenueTracker = {
        recordSignatureRequest: async () => {},
        getTotalSignatures: () => 0,
        getTotalRevenue: () => '0',
        getRevenueStats: async () => ({}),
        getSignatureHistory: async () => [],
      } as any;
    }

    // Initialize Validator Node (WITHOUT orchestrator for now)
    const useOrchestrator = process.env.ORCHESTRATOR_WS && process.env.ORCHESTRATOR_WS.length > 0;

    validatorNode = new ValidatorNode({
      validatorId: process.env.VALIDATOR_ID || 'validator-1',
      validatorName: process.env.VALIDATOR_NAME || 'RapidX Validator',
      orchestratorUrl: process.env.ORCHESTRATOR_URL || '',
      orchestratorWs: process.env.ORCHESTRATOR_WS || '',
      tssService,
      chainMonitor,
      revenueTracker,
    });
    await validatorNode.start();
    logger.info('✅ Validator Node started');

    if (!useOrchestrator) {
      logger.warn('⚠️  Running in STANDALONE mode (no orchestrator)');
      logger.warn('   Each validator will generate partial signatures independently');
      logger.warn('   To enable full TSS aggregation, set ORCHESTRATOR_WS in .env');
    }

    // Initialize Health Check
    healthCheck = new HealthCheckService({
      validatorNode,
      chainMonitor,
      tssService,
      revenueTracker,
    });
    healthCheck.start();
    logger.info('✅ Health Check Service started');

    logger.info(`
    ╔═══════════════════════════════════════════════════════════╗
    ║                                                           ║
    ║          🎯 RapidX Validator Node Running 🎯             ║
    ║                                                           ║
    ║  Validator: ${(process.env.VALIDATOR_NAME || 'RapidX Validator').padEnd(42)}║
    ║  TSS Party: ${(process.env.TSS_PARTY_ID || '1').padEnd(42)}║
    ║  Port:      ${PORT.toString().padEnd(42)}║
    ║  Mode:      ${(useOrchestrator ? 'NETWORKED' : 'STANDALONE').padEnd(42)}║
    ║  Chains:    ${deployments.length.toString().padEnd(42)}║
    ║  Status:    ACTIVE                                        ║
    ║                                                           ║
    ╚═══════════════════════════════════════════════════════════╝
    `);

  } catch (error) {
    logger.error('❌ Failed to initialize validator node:', error);
    process.exit(1);
  }
}

// Health check endpoint
app.get('/health', async (req, res) => {
  const health = await (healthCheck?.getStatus() || Promise.resolve({ status: 'initializing' }));
  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

// Status endpoint
app.get('/status', (req, res) => {
  res.json({
    validatorId: process.env.VALIDATOR_ID,
    validatorName: process.env.VALIDATOR_NAME,
    cloudProvider: process.env.CLOUD_PROVIDER,
    uptime: process.uptime(),
    version: require('../package.json').version,
    activeChains: chainMonitor?.getActiveChains() || [],
    totalSignatures: revenueTracker?.getTotalSignatures() || 0,
    totalRevenue: revenueTracker?.getTotalRevenue() || '0',
  });
});

// Revenue endpoint
app.get('/revenue', async (req, res) => {
  try {
    const revenueData = await revenueTracker?.getRevenueStats();
    res.json(revenueData);
  } catch (error) {
    logger.error('Error fetching revenue data:', error);
    res.status(500).json({ error: 'Failed to fetch revenue data' });
  }
});

// Signatures endpoint
app.get('/signatures', async (req, res) => {
  try {
    const signatures = await revenueTracker?.getSignatureHistory(100);
    res.json(signatures);
  } catch (error) {
    logger.error('Error fetching signature history:', error);
    res.status(500).json({ error: 'Failed to fetch signature history' });
  }
});

// DKG Ceremony endpoint
app.post('/api/dkg/start', async (req, res) => {
  try {
    logger.info('🔐 DKG ceremony start requested');

    if (!validatorNode) {
      return res.status(503).json({ error: 'Validator node not initialized' });
    }

    // Trigger DKG ceremony through validator node
    const result = await (validatorNode as any).startDKGCeremony();

    res.json({
      success: true,
      message: 'DKG ceremony initiated',
      result: {
        publicKeyShare: result.publicKeyShare?.toString('hex'),
        aggregatedPublicKey: result.aggregatedPublicKey?.toString('hex'),
      },
    });

  } catch (error: any) {
    logger.error('Error starting DKG ceremony:', error);
    res.status(500).json({
      error: 'Failed to start DKG ceremony',
      message: error.message,
    });
  }
});

// Start server
app.listen(PORT, () => {
  logger.info(`🌐 HTTP Server listening on port ${PORT}`);
  initializeServices();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  await validatorNode?.stop();
  await chainMonitor?.stop();
  await healthCheck?.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT signal received: closing HTTP server');
  await validatorNode?.stop();
  await chainMonitor?.stop();
  await healthCheck?.stop();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
