/**
 * Health Check Service
 * Monitors the health of all validator components
 */

import { logger } from '../utils/logger';
import type { ValidatorNode } from '../core/ValidatorNode';
import type { ChainMonitorService } from './ChainMonitorService';
import type { TSSService } from './TSSService';
import type { RevenueTracker } from './RevenueTracker';

export interface HealthCheckConfig {
  validatorNode: ValidatorNode;
  chainMonitor: ChainMonitorService;
  tssService: TSSService;
  revenueTracker: RevenueTracker;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  uptime: number;
  components: {
    validatorNode: boolean;
    chainMonitor: boolean;
    tssService: boolean;
    revenueTracker: boolean;
  };
  chains: { chain: string; healthy: boolean; latency: number }[];
  pendingSignings: number;
}

export class HealthCheckService {
  private config: HealthCheckConfig;
  private healthCheckInterval?: NodeJS.Timeout;
  private readonly CHECK_INTERVAL = 30000; // 30 seconds

  constructor(config: HealthCheckConfig) {
    this.config = config;
  }

  /**
   * Start periodic health checks
   */
  start(): void {
    logger.info('Starting health check service...');

    // Run immediately
    this.performHealthCheck();

    // Then run periodically
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.CHECK_INTERVAL);
  }

  /**
   * Perform health check on all components
   */
  private async performHealthCheck(): Promise<void> {
    try {
      const status = await this.getStatus();

      if (status.status === 'unhealthy') {
        logger.warn('⚠️  Health check: UNHEALTHY', status);
      } else if (status.status === 'degraded') {
        logger.warn('⚠️  Health check: DEGRADED', status);
      } else {
        logger.debug('✅ Health check: HEALTHY');
      }
    } catch (error) {
      logger.error('Error performing health check:', error);
    }
  }

  /**
   * Get current health status
   */
  async getStatus(): Promise<HealthStatus> {
    const nodeStatus = this.config.validatorNode.getStatus();
    const chains = await this.config.chainMonitor.checkHealth();

    const components = {
      validatorNode: nodeStatus.isRunning && nodeStatus.connected,
      chainMonitor: chains.some(c => c.healthy),
      tssService: nodeStatus.hasKeyShare,
      revenueTracker: true, // Assume healthy if no error
    };

    // Determine overall health
    let status: 'healthy' | 'degraded' | 'unhealthy';
    const healthyCount = Object.values(components).filter(v => v).length;

    if (healthyCount === 4) {
      status = 'healthy';
    } else if (healthyCount >= 2) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    return {
      status,
      timestamp: Date.now(),
      uptime: process.uptime(),
      components,
      chains,
      pendingSignings: nodeStatus.pendingSignings.length,
    };
  }

  /**
   * Stop health check service
   */
  async stop(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    logger.info('Health check service stopped');
  }
}
