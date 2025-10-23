/**
 * Revenue Tracker Service
 * Tracks validator earnings from bridge transactions
 * Fee Model: 0.1% per transaction, split among 5 validators
 */

import * as mssql from 'mssql';
import { logger } from '../utils/logger';

export interface RevenueConfig {
  validatorId: string;
  walletAddress: string;
  minPayoutAmount: number;
}

export interface SignatureRecord {
  id: string;
  txHash: string;
  chainId: string;
  signedAt: Date;
  amount: string;
  feeEarned: string;
  validatorShare: string;
}

export interface RevenueStats {
  totalSignatures: number;
  totalRevenue: string;
  pendingPayout: string;
  lastPayoutAt: Date | null;
  totalPaidOut: string;
  currentEarningsRate: string;
}

export class RevenueTracker {
  private db: mssql.ConnectionPool;
  private validatorId: string;
  private walletAddress: string;
  private minPayoutAmount: number;

  // Fee configuration
  private readonly TRANSACTION_FEE_PERCENTAGE = 0.001; // 0.1%
  private readonly VALIDATOR_COUNT = 5;
  private readonly VALIDATOR_SHARE = 1 / this.VALIDATOR_COUNT; // 20% each

  constructor(config: RevenueConfig) {
    this.validatorId = config.validatorId;
    this.walletAddress = config.walletAddress;
    this.minPayoutAmount = config.minPayoutAmount;

    // Initialize MS SQL Server connection
    this.db = new mssql.ConnectionPool(process.env.DATABASE_URL || '');
  }

  /**
   * Initialize database tables
   */
  async initialize(): Promise<void> {
    try {
      await this.db.connect();
      logger.info('✅ Connected to MS SQL Server');
      await this.createTables();
      logger.info('✅ Revenue tracker database initialized');
    } catch (error) {
      logger.error('Failed to initialize revenue tracker:', error);
      throw error;
    }
  }

  /**
   * Create necessary database tables
   */
  private async createTables(): Promise<void> {
    try {
      // Create validator_signatures table
      await this.db.request().query(`
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='validator_signatures' AND xtype='U')
        CREATE TABLE validator_signatures (
          id BIGINT IDENTITY(1,1) PRIMARY KEY,
          validator_id VARCHAR(50) NOT NULL,
          tx_hash VARCHAR(100) NOT NULL,
          chain_id VARCHAR(20) NOT NULL,
          signed_at DATETIME2 DEFAULT GETDATE(),
          transaction_amount DECIMAL(36, 18) NOT NULL,
          fee_earned DECIMAL(36, 18) NOT NULL,
          validator_share DECIMAL(36, 18) NOT NULL,
          is_paid_out BIT DEFAULT 0,
          paid_out_at DATETIME2 NULL,
          CONSTRAINT UQ_validator_tx UNIQUE(validator_id, tx_hash)
        )
      `);

      // Create indexes for validator_signatures
      await this.db.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_validator_signatures' AND object_id = OBJECT_ID('validator_signatures'))
        CREATE INDEX idx_validator_signatures ON validator_signatures(validator_id, signed_at)
      `);

      await this.db.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_pending_payouts' AND object_id = OBJECT_ID('validator_signatures'))
        CREATE INDEX idx_pending_payouts ON validator_signatures(validator_id, is_paid_out) WHERE is_paid_out = 0
      `);

      // Create validator_payouts table
      await this.db.request().query(`
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='validator_payouts' AND xtype='U')
        CREATE TABLE validator_payouts (
          id BIGINT IDENTITY(1,1) PRIMARY KEY,
          validator_id VARCHAR(50) NOT NULL,
          amount DECIMAL(36, 18) NOT NULL,
          tx_hash VARCHAR(100),
          paid_at DATETIME2 DEFAULT GETDATE(),
          status VARCHAR(20) DEFAULT 'pending'
        )
      `);

      // Create index for validator_payouts
      await this.db.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_validator_payouts' AND object_id = OBJECT_ID('validator_payouts'))
        CREATE INDEX idx_validator_payouts ON validator_payouts(validator_id, paid_at)
      `);
    } catch (error) {
      logger.error('Error creating tables:', error);
      throw error;
    }
  }

  /**
   * Record a signature request (when signal is detected)
   * This is called when a SignalSent event is detected
   */
  async recordSignatureRequest(
    signalId: string,
    srcChainId: string,
    dstChainId: string,
    txHash: string
  ): Promise<void> {
    try {
      logger.info(`📝 Recording signature request for signal ${signalId.slice(0, 10)}...`);

      // For now, we record with a default amount (0.0)
      // In production, this would be extracted from the signal payload
      const defaultAmount = '0.0';

      await this.recordSignature(txHash, srcChainId, defaultAmount);

      logger.info(`✅ Signature request recorded for tx ${txHash.slice(0, 10)}...`);
    } catch (error) {
      logger.error('Error recording signature request:', error);
      // Don't throw - we don't want to stop TSS signing if revenue tracking fails
    }
  }

  /**
   * Record a new signature and calculate revenue
   */
  async recordSignature(
    txHash: string,
    chainId: string,
    transactionAmount: string
  ): Promise<SignatureRecord> {
    const amount = parseFloat(transactionAmount);
    const feeEarned = amount * this.TRANSACTION_FEE_PERCENTAGE;
    const validatorShare = feeEarned * this.VALIDATOR_SHARE;

    try {
      // First check if record exists
      const checkResult = await this.db.request()
        .input('validatorId', mssql.VarChar, this.validatorId)
        .input('txHash', mssql.VarChar, txHash)
        .query(`SELECT id FROM validator_signatures WHERE validator_id = @validatorId AND tx_hash = @txHash`);

      if (checkResult.recordset.length > 0) {
        // Record already exists, return it
        return {
          id: checkResult.recordset[0].id.toString(),
          txHash,
          chainId,
          signedAt: new Date(),
          amount: transactionAmount,
          feeEarned: feeEarned.toString(),
          validatorShare: validatorShare.toString(),
        };
      }

      // Insert new record
      const result = await this.db.request()
        .input('validatorId', mssql.VarChar, this.validatorId)
        .input('txHash', mssql.VarChar, txHash)
        .input('chainId', mssql.VarChar, chainId)
        .input('transactionAmount', mssql.Decimal(36, 18), transactionAmount)
        .input('feeEarned', mssql.Decimal(36, 18), feeEarned.toString())
        .input('validatorShare', mssql.Decimal(36, 18), validatorShare.toString())
        .query(`
          INSERT INTO validator_signatures
          (validator_id, tx_hash, chain_id, transaction_amount, fee_earned, validator_share)
          OUTPUT INSERTED.*
          VALUES (@validatorId, @txHash, @chainId, @transactionAmount, @feeEarned, @validatorShare)
        `);

      if (result.recordset.length > 0) {
        logger.info(`💰 Signature recorded:`, {
          txHash,
          amount: transactionAmount,
          earned: validatorShare.toFixed(6),
        });

        // Check if payout threshold reached
        await this.checkPayoutThreshold();

        return {
          id: result.recordset[0].id.toString(),
          txHash,
          chainId,
          signedAt: result.recordset[0].signed_at,
          amount: transactionAmount,
          feeEarned: feeEarned.toString(),
          validatorShare: validatorShare.toString(),
        };
      }

      throw new Error('Failed to record signature');
    } catch (error) {
      logger.error('Error recording signature:', error);
      throw error;
    }
  }

  /**
   * Get total revenue statistics
   */
  async getRevenueStats(): Promise<RevenueStats> {
    try {
      const statsQuery = await this.db.request()
        .input('validatorId', mssql.VarChar, this.validatorId)
        .query(`
          SELECT
            COUNT(*) as total_signatures,
            COALESCE(SUM(validator_share), 0) as total_revenue,
            COALESCE(SUM(CASE WHEN is_paid_out = 0 THEN validator_share ELSE 0 END), 0) as pending_payout
          FROM validator_signatures
          WHERE validator_id = @validatorId
        `);

      const payoutQuery = await this.db.request()
        .input('validatorId', mssql.VarChar, this.validatorId)
        .query(`
          SELECT
            COALESCE(SUM(amount), 0) as total_paid_out,
            MAX(paid_at) as last_payout_at
          FROM validator_payouts
          WHERE validator_id = @validatorId AND status = 'completed'
        `);

      // Calculate earnings rate (last 24 hours)
      const earningsRateQuery = await this.db.request()
        .input('validatorId', mssql.VarChar, this.validatorId)
        .query(`
          SELECT COALESCE(SUM(validator_share), 0) as daily_earnings
          FROM validator_signatures
          WHERE validator_id = @validatorId
          AND signed_at >= DATEADD(hour, -24, GETDATE())
        `);

      return {
        totalSignatures: parseInt(statsQuery.recordset[0].total_signatures),
        totalRevenue: statsQuery.recordset[0].total_revenue.toString(),
        pendingPayout: statsQuery.recordset[0].pending_payout.toString(),
        lastPayoutAt: payoutQuery.recordset[0].last_payout_at,
        totalPaidOut: payoutQuery.recordset[0].total_paid_out.toString(),
        currentEarningsRate: earningsRateQuery.recordset[0].daily_earnings.toString(),
      };
    } catch (error) {
      logger.error('Error fetching revenue stats:', error);
      throw error;
    }
  }

  /**
   * Get signature history
   */
  async getSignatureHistory(limit: number = 100): Promise<SignatureRecord[]> {
    try {
      const result = await this.db.request()
        .input('validatorId', mssql.VarChar, this.validatorId)
        .input('limit', mssql.Int, limit)
        .query(`
          SELECT TOP (@limit) * FROM validator_signatures
          WHERE validator_id = @validatorId
          ORDER BY signed_at DESC
        `);

      return result.recordset.map(row => ({
        id: row.id.toString(),
        txHash: row.tx_hash,
        chainId: row.chain_id,
        signedAt: row.signed_at,
        amount: row.transaction_amount.toString(),
        feeEarned: row.fee_earned.toString(),
        validatorShare: row.validator_share.toString(),
      }));
    } catch (error) {
      logger.error('Error fetching signature history:', error);
      throw error;
    }
  }

  /**
   * Check if payout threshold is reached and trigger payout
   */
  private async checkPayoutThreshold(): Promise<void> {
    try {
      const stats = await this.getRevenueStats();
      const pendingAmount = parseFloat(stats.pendingPayout);

      if (pendingAmount >= this.minPayoutAmount) {
        logger.info(`💸 Payout threshold reached: ${pendingAmount.toFixed(6)} tokens`);
        await this.initiatePayout(pendingAmount);
      }
    } catch (error) {
      logger.error('Error checking payout threshold:', error);
    }
  }

  /**
   * Initiate payout to validator wallet
   */
  private async initiatePayout(amount: number): Promise<void> {
    try {
      // Create payout record
      const payoutResult = await this.db.request()
        .input('validatorId', mssql.VarChar, this.validatorId)
        .input('amount', mssql.Decimal(36, 18), amount.toString())
        .query(`
          INSERT INTO validator_payouts (validator_id, amount, status)
          OUTPUT INSERTED.id
          VALUES (@validatorId, @amount, 'pending')
        `);

      const payoutId = payoutResult.recordset[0].id;

      // TODO: Implement actual on-chain payout transaction
      // This would call the ValidatorRegistry contract's distributeFees function

      logger.info(`💳 Payout initiated:`, {
        payoutId,
        amount: amount.toFixed(6),
        wallet: this.walletAddress,
      });

      // For now, just log the payout
      // In production, this would trigger an on-chain transaction
      await this.completePayout(payoutId, 'mock-tx-hash');

    } catch (error) {
      logger.error('Error initiating payout:', error);
      throw error;
    }
  }

  /**
   * Mark payout as completed
   */
  private async completePayout(payoutId: number, txHash: string): Promise<void> {
    try {
      // Update payout record
      await this.db.request()
        .input('txHash', mssql.VarChar, txHash)
        .input('payoutId', mssql.BigInt, payoutId)
        .query(`
          UPDATE validator_payouts
          SET status = 'completed', tx_hash = @txHash
          WHERE id = @payoutId
        `);

      // Mark signatures as paid out
      await this.db.request()
        .input('validatorId', mssql.VarChar, this.validatorId)
        .query(`
          UPDATE validator_signatures
          SET is_paid_out = 1, paid_out_at = GETDATE()
          WHERE validator_id = @validatorId AND is_paid_out = 0
        `);

      logger.info(`✅ Payout completed: ${txHash}`);
    } catch (error) {
      logger.error('Error completing payout:', error);
      throw error;
    }
  }

  /**
   * Get total signatures count
   */
  getTotalSignatures(): number {
    // This is a cached value updated periodically
    return 0; // Will be implemented with caching
  }

  /**
   * Get total revenue
   */
  getTotalRevenue(): string {
    // This is a cached value updated periodically
    return '0'; // Will be implemented with caching
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    await this.db.close();
  }
}
