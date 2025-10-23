/**
 * Prometheus metrics setup for validator node monitoring
 */

import { Express } from 'express';
import client from 'prom-client';

// Create a Registry to register metrics
const register = new client.Registry();

// Add default metrics (CPU, memory, etc.)
client.collectDefaultMetrics({ register });

// Custom metrics
export const signaturesProcessed = new client.Counter({
  name: 'validator_signatures_processed_total',
  help: 'Total number of signatures processed by this validator',
  labelNames: ['chain', 'status'],
  registers: [register],
});

export const signingDuration = new client.Histogram({
  name: 'validator_signing_duration_seconds',
  help: 'Duration of TSS signing ceremonies',
  labelNames: ['chain'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

export const activeSigningRequests = new client.Gauge({
  name: 'validator_active_signing_requests',
  help: 'Number of currently active signing requests',
  registers: [register],
});

export const revenueEarned = new client.Gauge({
  name: 'validator_revenue_earned_total',
  help: 'Total revenue earned by this validator',
  registers: [register],
});

export const chainHealthStatus = new client.Gauge({
  name: 'validator_chain_health_status',
  help: 'Health status of monitored chains (1 = healthy, 0 = unhealthy)',
  labelNames: ['chain'],
  registers: [register],
});

/**
 * Setup metrics endpoint for Prometheus scraping
 */
export function setupMetrics(app: Express): void {
  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });
}
