/**
 * Load deployment addresses automatically from deployment files
 * No manual configuration needed!
 */

import fs from 'fs';
import path from 'path';
import { logger } from './logger';

export interface DeploymentInfo {
  chainId: number;
  chainName: string;
  signal: string;
  verifier: string;
  messenger: string;
  rpcUrl: string;
}

/**
 * Load all deployments from the deployments directory
 */
export function loadDeployments(): DeploymentInfo[] {
  const deployments: DeploymentInfo[] = [];

  // Path to deployments directory (3 levels up from this file)
  const deploymentsDir = path.join(__dirname, '..', '..', '..', '..', '..', 'deployments');

  logger.info(`Loading deployments from: ${deploymentsDir}`);

  if (!fs.existsSync(deploymentsDir)) {
    logger.warn('Deployments directory not found. Please deploy contracts first.');
    return deployments;
  }

  // Read all deployment files
  const files = fs.readdirSync(deploymentsDir).filter(f => f.endsWith('-deployment.json'));

  for (const file of files) {
    try {
      const filePath = path.join(deploymentsDir, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      // Map chain ID to RPC URL
      const rpcUrl = getRpcUrl(data.chainId);

      if (rpcUrl) {
        deployments.push({
          chainId: data.chainId,
          chainName: data.network,
          signal: data.contracts.signal,
          verifier: data.contracts.signalVerifier,
          messenger: data.contracts.secureMessenger,
          rpcUrl,
        });

        logger.info(`✅ Loaded deployment for ${data.network} (Chain ID: ${data.chainId})`);
      } else {
        logger.warn(`⚠️  No RPC URL configured for chain ${data.chainId} (${data.network})`);
      }
    } catch (error) {
      logger.error(`Error loading ${file}:`, error);
    }
  }

  return deployments;
}

/**
 * Get RPC URL for a chain ID from environment or use public RPCs
 */
function getRpcUrl(chainId: number): string | null {
  // Check environment variables first
  const envMap: Record<number, string> = {
    1: process.env.ETHEREUM_RPC || '',
    56: process.env.BSC_RPC || 'https://bsc-dataseed1.binance.org',
    137: process.env.POLYGON_RPC || 'https://polygon-rpc.com',
    42161: process.env.ARBITRUM_RPC || 'https://arb1.arbitrum.io/rpc',
    10: process.env.OPTIMISM_RPC || 'https://mainnet.optimism.io',
    43114: process.env.AVALANCHE_RPC || 'https://api.avax.network/ext/bc/C/rpc',
    250: process.env.FANTOM_RPC || 'https://rpc.ftm.tools',
    8453: process.env.BASE_RPC || 'https://mainnet.base.org',

    // Testnets
    11155111: process.env.SEPOLIA_RPC || 'https://sepolia.infura.io/v3/187e3c93df364840824e3274e58e402c',
    97: process.env.BSC_TESTNET_RPC || 'https://bsc-testnet.infura.io/v3/187e3c93df364840824e3274e58e402c',
    80001: process.env.MUMBAI_RPC || 'https://rpc-mumbai.maticvigil.com',
    421614: process.env.ARBITRUM_SEPOLIA_RPC || 'https://sepolia-rollup.arbitrum.io/rpc',
    11155420: process.env.OPTIMISM_SEPOLIA_RPC || 'https://sepolia.optimism.io',
  };

  const rpcUrl = envMap[chainId];
  return rpcUrl || null;
}
