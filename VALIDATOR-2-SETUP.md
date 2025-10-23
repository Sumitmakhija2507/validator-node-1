# Validator 2 Setup Guide - Laptop Installation

## Prerequisites

### System Requirements
- Operating System: Windows 10/11, macOS, or Linux
- Node.js: v18.0.0 or higher
- npm: v9.0.0 or higher
- RAM: Minimum 8GB (16GB recommended)
- Disk Space: Minimum 50GB free
- Network: Stable internet connection (100 Mbps+ recommended)

### Required Software
```bash
# Check Node.js version
node --version  # Should be >= 18.0.0

# Check npm version
npm --version   # Should be >= 9.0.0
```

## Step 1: Clone/Copy Validator Files

If setting up on a new laptop, copy the entire validator-node directory:

```bash
# Option A: From USB/external drive
cp -r /path/to/validator-node D:\Blockchain\validator-2

# Option B: From git repository
git clone <your-repo> D:\Blockchain\validator-2
cd D:\Blockchain\validator-2
```

## Step 2: Install Dependencies

```bash
cd D:\Blockchain\validator-2
npm install
```

## Step 3: Configure Validator 2

### Create .env file for Validator 2

Copy the example environment file:
```bash
cp .env.example .env
```

Edit `.env` with Validator 2 specific settings:

```bash
# CRITICAL: Change these for Validator 2
VALIDATOR_ID=validator-2
VALIDATOR_NAME="RapidX Validator #2"
TSS_PARTY_ID=2                    # MUST be 2 (different from validator-1)
PORT=8081                         # MUST be different from validator-1 if on same network

# TSS Configuration (same across all validators)
TSS_THRESHOLD=3
TSS_TOTAL_PARTIES=5

# Network Configuration
NODE_ENV=production
HOST=0.0.0.0

# RPC Endpoints (same as validator-1)
ETHEREUM_RPC=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY
BSC_RPC=https://bsc-dataseed1.binance.org
POLYGON_RPC=https://polygon-rpc.com
# ... (copy all RPC endpoints from validator-1)

# Signal Contract Addresses (MUST be same as validator-1)
ETHEREUM_SIGNAL_ADDRESS=0x...
BSC_SIGNAL_ADDRESS=0x...
# ... (copy all signal addresses from validator-1)

# Database (recommended: separate database or different schema)
DATABASE_URL=postgresql://validator:password@localhost:5432/rapidx_validator_2
REDIS_URL=redis://localhost:6380  # Different port if on same machine

# Orchestrator Connection (MUST be same as validator-1)
ORCHESTRATOR_URL=https://orchestrator.rapidx.io
ORCHESTRATOR_WS=wss://orchestrator.rapidx.io/ws
ORCHESTRATOR_API_KEY=your_api_key_here

# Revenue Wallet (UNIQUE to validator-2)
REVENUE_WALLET_ADDRESS=0x... # Your validator-2 wallet address
MIN_PAYOUT_AMOUNT=100

# Monitoring
PROMETHEUS_PORT=9091  # Different from validator-1 if on same network
ENABLE_METRICS=true
LOG_LEVEL=info

# Security
JWT_SECRET=your_secret_key_here_v2  # Should be different from validator-1
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Cloud Provider
CLOUD_PROVIDER=private  # or aws, gcp depending on your setup
REGION=local

# Health Check
HEALTH_CHECK_INTERVAL=30000
MAX_MISSED_HEARTBEATS=3

# Slashing Protection
ENABLE_SLASHING_PROTECTION=true
MAX_SIGNING_TIMEOUT=60000
```

### Important Configuration Notes

1. **VALIDATOR_ID**: Must be unique (`validator-2`)
2. **TSS_PARTY_ID**: Must be `2` (this is your position in the TSS ceremony)
3. **PORT**: Must be different from other validators on same network
4. **REVENUE_WALLET_ADDRESS**: Your unique wallet for receiving validator rewards
5. **Signal Addresses**: MUST match validator-1 (these are the smart contracts)
6. **Orchestrator Settings**: MUST match validator-1 (for coordination)

## Step 4: Build the Project

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` directory.

## Step 5: Start Validator 2

### Development Mode (with auto-reload)
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

## Step 6: Verify Validator 2 is Running

### Check Health Endpoint
```bash
curl http://localhost:8081/health
```

Expected response:
```json
{
  "status": "healthy",
  "validator": "validator-2",
  "tssPartyId": 2,
  "uptime": 123,
  "activeChains": 1,
  "hasKeyShare": true
}
```

### Check Status Endpoint
```bash
curl http://localhost:8081/status
```

### Check Logs
The validator will log startup information:
```
🚀 Starting RapidX Validator Node...
Validator ID: validator-2
✅ TSS Service initialized
✅ Chain Monitor started
✅ Validator Node started
```

## Step 7: Networking Considerations

### If Validator 1 and 2 are on Same Local Network

Both validators can run on the same machine or different machines on same network:

**Same Machine:**
- Use different ports (8080 vs 8081)
- Use different database names
- Use different Redis ports if using Redis

**Different Machines (Recommended):**
- Can use same ports on each machine
- Ensure firewall allows orchestrator connection
- Ensure machines can reach the same orchestrator

### If Validator 2 is on Different Network

- Ensure port forwarding is configured
- Firewall must allow:
  - Outbound HTTPS to orchestrator
  - Outbound WSS (WebSocket) to orchestrator
  - Outbound HTTPS to blockchain RPC endpoints

## Step 8: Connect to Orchestrator

The validator will automatically connect to the orchestrator using settings from `.env`:

```
ORCHESTRATOR_WS=wss://orchestrator.rapidx.io/ws
```

Watch the logs for:
```
✅ Connected to orchestrator
```

## Step 9: Monitoring

### View Real-time Logs
```bash
npm run dev
```

### Check Metrics (if Prometheus enabled)
```
http://localhost:9091/metrics
```

### Monitor Signature Activity
```bash
curl http://localhost:8081/signatures
```

## Troubleshooting

### Issue: "Port already in use"
**Solution**: Change PORT in .env to unused port (e.g., 8082)

### Issue: "Cannot connect to orchestrator"
**Solution**:
1. Check ORCHESTRATOR_WS is correct
2. Verify network connectivity
3. Check firewall settings

### Issue: "No deployments found"
**Solution**: Ensure signal contract addresses are configured in .env

### Issue: "Duplicate party ID"
**Solution**: Verify TSS_PARTY_ID is unique (validator-1=1, validator-2=2, etc.)

### Issue: "Database connection failed"
**Solution**:
1. Verify PostgreSQL is running
2. Check DATABASE_URL is correct
3. Create database if doesn't exist:
   ```bash
   createdb rapidx_validator_2
   ```

## Security Checklist

- [ ] Generated unique JWT_SECRET
- [ ] Set unique REVENUE_WALLET_ADDRESS
- [ ] Configured firewall to block unauthorized access
- [ ] Enabled ENABLE_SLASHING_PROTECTION
- [ ] Secured .env file (not shared publicly)
- [ ] Used HTTPS/WSS for all connections
- [ ] Configured rate limiting
- [ ] Set up monitoring/alerting

## Next Steps

1. **Run DKG Ceremony**: Generate TSS key shares (see TSS-GUIDE.md)
2. **Test Signing**: Verify validator can participate in signatures
3. **Monitor Performance**: Watch logs and metrics
4. **Set Up Alerting**: Configure alerts for downtime
5. **Backup Configuration**: Securely backup .env and key materials

## Running Multiple Validators

If you plan to run validators 3, 4, 5, repeat this process with:
- VALIDATOR_ID=validator-3, validator-4, validator-5
- TSS_PARTY_ID=3, 4, 5
- Unique PORT for each
- Unique REVENUE_WALLET_ADDRESS for each
