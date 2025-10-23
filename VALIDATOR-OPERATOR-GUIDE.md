# RapidX Validator Operator Guide

## Professional Documentation for Validator Node Operators

---

## Table of Contents
1. [Introduction](#introduction)
2. [Validator Requirements](#validator-requirements)
3. [Economic Model](#economic-model)
4. [Setup Process](#setup-process)
5. [Operations & Maintenance](#operations--maintenance)
6. [Monitoring & Performance](#monitoring--performance)
7. [Troubleshooting](#troubleshooting)
8. [Security Best Practices](#security-best-practices)
9. [FAQ](#faq)

---

## Introduction

### What is a RapidX Validator?

RapidX validators are professional node operators that secure the RapidX cross-chain bridge by participating in a **Threshold Signature Scheme (TSS)** protocol. Validators collectively control bridge wallets across multiple blockchains without any single party holding complete control.

### Key Responsibilities

As a RapidX validator operator, you will:

- ✅ **Run validator software** 24/7 with high uptime (>99.9% recommended)
- ✅ **Participate in TSS signing** ceremonies for cross-chain transactions
- ✅ **Monitor blockchain events** on multiple chains (Ethereum, BSC, Polygon, etc.)
- ✅ **Maintain security** of your key share and infrastructure
- ✅ **Coordinate with other validators** through the orchestrator
- ✅ **Track and claim revenue** from signature fees

### Revenue Model

Validators earn revenue by:
- **Signature fees**: Earn a share of fees from each cross-chain transaction you sign
- **Performance incentives**: Higher uptime and participation = more signatures = more revenue
- **No staking required**: Revenue based on actual work performed (signatures)

**Example Revenue:**
- Transaction fee: $2 per cross-chain bridge
- Validators participating: 3 out of 5
- Your share: $2 ÷ 3 = **$0.67 per signature**
- Daily volume: 1,000 transactions
- Your daily revenue (if participating in all): **$667/day** ≈ **$20,000/month**

*Note: Actual revenue depends on transaction volume, fee structure, and your validator uptime.*

---

## Validator Requirements

### Technical Requirements

#### Minimum Hardware
```
CPU: 4 cores (2.5 GHz+)
RAM: 8 GB
Storage: 100 GB SSD
Network: 100 Mbps (stable connection)
Operating System: Linux (Ubuntu 20.04+), macOS, Windows Server
```

#### Recommended Hardware (Production)
```
CPU: 8 cores (3.0 GHz+)
RAM: 16 GB
Storage: 500 GB NVMe SSD
Network: 1 Gbps with redundancy
Operating System: Ubuntu 22.04 LTS
Backup: Secondary server for failover
```

#### Cloud Provider Options

**AWS (Recommended)**
- Instance Type: `t3.large` or `t3.xlarge`
- Region: `us-east-1`, `eu-west-1`, `ap-southeast-1`
- Estimated Cost: $50-100/month

**Google Cloud Platform**
- Instance Type: `n2-standard-4`
- Region: `us-central1`, `europe-west1`
- Estimated Cost: $60-120/month

**Self-Hosted**
- Dedicated server in data center
- UPS backup power
- Redundant internet connection
- Estimated Cost: $200-500/month

### Software Requirements

```bash
# Required Software
Node.js: v18.0.0 or higher
npm: v9.0.0 or higher
PostgreSQL: v14+ (for revenue tracking)
Redis: v6+ (for caching, optional)

# Optional but Recommended
Docker: v20+ (for containerization)
Docker Compose: v2+ (for orchestration)
Prometheus: For metrics collection
Grafana: For visualization
```

### Network Requirements

- **Stable Internet**: 99.9%+ uptime required
- **Low Latency**: <100ms to major blockchain RPC endpoints
- **Firewall Configuration**:
  - Outbound HTTPS (443) - for RPC calls
  - Outbound WSS (443) - for orchestrator connection
  - Inbound HTTP (8080) - for health checks
  - Inbound HTTP (9090) - for Prometheus metrics (optional)

### Blockchain Access

You'll need RPC endpoints for supported chains:

```bash
# Free Tier (for testing)
- Ethereum: Infura, Alchemy free tier
- BSC: Public RPC (bsc-dataseed1.binance.org)
- Polygon: Public RPC (polygon-rpc.com)

# Paid Tier (recommended for production)
- Ethereum: Alchemy Growth ($49/mo) or QuickNode
- BSC: NodeReal, Ankr
- Multi-chain: QuickNode, Chainstack
```

**Estimated RPC Costs**: $50-200/month depending on volume

---

## Economic Model

### Revenue Breakdown

#### Revenue Sources

1. **Signature Fees** (Primary)
   - Earned per transaction signed
   - Shared among participating validators (3 out of 5)
   - Paid immediately after signature completion

2. **Performance Bonuses** (Future)
   - Extra rewards for consistent uptime
   - Incentives for quick signature response times

#### Cost Structure

**Monthly Operating Costs:**
```
Server/Cloud Hosting:        $50-150
RPC Endpoint Access:         $50-200
Database (PostgreSQL):       $10-50
Monitoring/Alerting:         $0-30
Electricity (self-hosted):   $20-100
Backup/Redundancy:           $20-100
──────────────────────────────────
Total Monthly Costs:         $150-630
```

**Initial Setup Costs:**
```
Hardware (if self-hosted):   $1,000-3,000 (one-time)
Time Investment:             4-8 hours setup
Security Hardening:          2-4 hours
Testing & Monitoring Setup:  2-3 hours
```

#### Profitability Analysis

**Conservative Scenario** (100 tx/day, $2 fee, 60% participation)
```
Daily Revenue: 100 × $2 × 60% × 1/3 = $40/day
Monthly Revenue: $40 × 30 = $1,200/month
Monthly Costs: $400/month
Net Profit: $800/month
```

**Moderate Scenario** (500 tx/day, $2 fee, 80% participation)
```
Daily Revenue: 500 × $2 × 80% × 1/3 = $267/day
Monthly Revenue: $267 × 30 = $8,000/month
Monthly Costs: $500/month
Net Profit: $7,500/month
```

**Optimistic Scenario** (2,000 tx/day, $3 fee, 95% participation)
```
Daily Revenue: 2,000 × $3 × 95% × 1/3 = $1,900/day
Monthly Revenue: $1,900 × 30 = $57,000/month
Monthly Costs: $600/month
Net Profit: $56,400/month
```

### Revenue Payout

**Automatic On-Chain Distribution:**
- Revenue is tracked in your validator node database
- Payouts sent to your `REVENUE_WALLET_ADDRESS`
- Minimum payout threshold: Configurable (default $100)
- Payout frequency: Real-time or batch (depending on configuration)

**Claiming Revenue:**
```bash
# Check your earnings
curl http://localhost:8080/revenue

# View signature history
curl http://localhost:8080/signatures
```

---

## Setup Process

### Step 1: Prepare Infrastructure

#### Option A: Cloud Setup (AWS Example)

```bash
# 1. Launch EC2 instance
Instance Type: t3.large
OS: Ubuntu 22.04 LTS
Storage: 100 GB gp3
Security Group:
  - Inbound: SSH (22) from your IP
  - Inbound: HTTP (8080) for health checks
  - Outbound: All traffic

# 2. Connect to instance
ssh -i your-key.pem ubuntu@<instance-ip>

# 3. Update system
sudo apt update && sudo apt upgrade -y
```

#### Option B: Self-Hosted Setup

```bash
# Install Ubuntu 22.04 LTS on your server
# Configure network, firewall, and SSH access
# Ensure UPS and redundant internet connection
```

### Step 2: Install Dependencies

```bash
# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should be v18.x or higher
npm --version   # Should be v9.x or higher

# Install PostgreSQL (for revenue tracking)
sudo apt install -y postgresql postgresql-contrib

# Create database
sudo -u postgres createdb rapidx_validator

# Install Redis (optional, for caching)
sudo apt install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server

# Install PM2 (process manager)
sudo npm install -g pm2
```

### Step 3: Download Validator Software

```bash
# Clone repository (or download from official source)
git clone https://github.com/rapidx/validator-node.git
cd validator-node

# Install dependencies
npm install

# Build project
npm run build
```

### Step 4: Configure Validator

```bash
# Copy environment template
cp .env.example .env

# Edit configuration
nano .env
```

**Critical Configuration Parameters:**

```bash
# ===== VALIDATOR IDENTITY =====
VALIDATOR_ID=validator-1           # Unique ID (validator-1, validator-2, etc.)
VALIDATOR_NAME="My Validator"      # Your validator name
TSS_PARTY_ID=1                     # Your assigned party ID (1-5)

# ===== NETWORK =====
PORT=8080
HOST=0.0.0.0

# ===== TSS CONFIGURATION =====
TSS_THRESHOLD=3                    # Required signatures (don't change)
TSS_TOTAL_PARTIES=5                # Total validators (don't change)

# ===== REVENUE WALLET =====
REVENUE_WALLET_ADDRESS=0xYourWalletAddress  # ⚠️ IMPORTANT: Your payout address

# ===== RPC ENDPOINTS =====
ETHEREUM_RPC=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY
BSC_RPC=https://bsc-dataseed1.binance.org
POLYGON_RPC=https://polygon-rpc.com
# ... (configure all supported chains)

# ===== SIGNAL CONTRACTS =====
# ⚠️ CRITICAL: These must match other validators
ETHEREUM_SIGNAL_ADDRESS=0x...  # Provided by RapidX team
BSC_SIGNAL_ADDRESS=0x...
POLYGON_SIGNAL_ADDRESS=0x...
# ... (configure all signal contracts)

# ===== ORCHESTRATOR =====
ORCHESTRATOR_URL=https://orchestrator.rapidx.io
ORCHESTRATOR_WS=wss://orchestrator.rapidx.io/ws
ORCHESTRATOR_API_KEY=your_api_key  # Provided by RapidX team

# ===== DATABASE =====
DATABASE_URL=postgresql://postgres:password@localhost:5432/rapidx_validator
REDIS_URL=redis://localhost:6379

# ===== MONITORING =====
PROMETHEUS_PORT=9090
ENABLE_METRICS=true
LOG_LEVEL=info
```

### Step 5: Run Validator

#### Development Mode (Testing)
```bash
npm run dev
```

#### Production Mode (Recommended)
```bash
# Start with PM2
pm2 start npm --name "rapidx-validator" -- start

# Enable auto-restart on reboot
pm2 startup
pm2 save

# View logs
pm2 logs rapidx-validator
```

#### Docker Mode (Advanced)
```bash
# Build Docker image
docker build -t rapidx-validator .

# Run container
docker run -d \
  --name rapidx-validator \
  --restart unless-stopped \
  -p 8080:8080 \
  -v $(pwd)/.env:/app/.env \
  rapidx-validator
```

### Step 6: Verify Setup

```bash
# Check health endpoint
curl http://localhost:8080/health

# Expected response:
{
  "status": "healthy",
  "validator": "validator-1",
  "tssPartyId": 1,
  "uptime": 123,
  "activeChains": 3,
  "hasKeyShare": true
}

# Check status endpoint
curl http://localhost:8080/status

# View logs
pm2 logs rapidx-validator
# Or with Docker:
docker logs -f rapidx-validator
```

### Step 7: Participate in DKG Ceremony

**Distributed Key Generation (one-time setup):**

The DKG ceremony is when all 5 validators collectively generate the bridge wallet key shares.

```bash
# Coordinate with RapidX team and other validators
# DKG ceremony requires all 5 validators online simultaneously

# Run DKG ceremony (orchestrator will coordinate)
# This generates your key share securely
```

**After DKG:**
- ✅ You receive a key share (stored securely in validator node)
- ✅ Aggregated public key becomes the bridge wallet
- ✅ You can now participate in signing ceremonies
- ⚠️ NEVER share your key share with anyone

---

## Operations & Maintenance

### Daily Operations

#### Monitor Validator Health
```bash
# Check if validator is running
pm2 status

# Check health
curl http://localhost:8080/health

# View real-time logs
pm2 logs rapidx-validator --lines 100
```

#### Check Revenue
```bash
# View total revenue
curl http://localhost:8080/revenue

# View recent signatures
curl http://localhost:8080/signatures
```

### Weekly Maintenance

1. **Review Logs**: Check for any errors or warnings
   ```bash
   pm2 logs --lines 1000 | grep -i error
   ```

2. **Check Disk Space**: Ensure sufficient storage
   ```bash
   df -h
   ```

3. **Update Dependencies** (if needed):
   ```bash
   cd validator-node
   npm audit
   npm update
   ```

4. **Backup Configuration**:
   ```bash
   # Backup .env file (encrypted!)
   tar -czf validator-backup-$(date +%F).tar.gz .env
   # Store securely offline
   ```

### Monthly Maintenance

1. **Security Updates**:
   ```bash
   sudo apt update
   sudo apt upgrade -y
   sudo reboot  # If kernel updated
   ```

2. **Performance Review**:
   - Check uptime percentage
   - Review signature participation rate
   - Analyze revenue trends

3. **Revenue Reconciliation**:
   - Verify revenue matches expected signatures
   - Check for any missing payouts

### Updating Validator Software

```bash
# 1. Pull latest code
cd validator-node
git pull origin main

# 2. Install dependencies
npm install

# 3. Rebuild
npm run build

# 4. Restart validator
pm2 restart rapidx-validator

# 5. Verify health
curl http://localhost:8080/health
```

---

## Monitoring & Performance

### Key Metrics to Track

#### Uptime
- **Target**: >99.9% (less than 44 minutes downtime per month)
- **Tool**: PM2, UptimeRobot, or custom monitoring

#### Signature Participation Rate
- **Target**: >95% of all signing requests
- **Metric**: `signatures_completed / signatures_requested`

#### Response Time
- **Target**: <5 seconds from signal detection to partial signature
- **Tool**: Prometheus metrics

#### Revenue
- **Track**: Daily/weekly/monthly revenue trends
- **Endpoint**: `GET /revenue`

### Setting Up Monitoring

#### Prometheus + Grafana (Recommended)

```bash
# Install Prometheus
# (Add Prometheus installation instructions)

# Install Grafana
# (Add Grafana installation instructions)

# Access metrics
curl http://localhost:9090/metrics
```

**Key Metrics Exposed:**
- `validator_uptime_seconds`
- `validator_signatures_total`
- `validator_signatures_success_total`
- `validator_signatures_failed_total`
- `validator_revenue_total`
- `validator_chains_monitored`

#### UptimeRobot (Simple Uptime Monitoring)

```
1. Create free account at uptimerobot.com
2. Add HTTP monitor: http://your-validator-ip:8080/health
3. Set check interval: 5 minutes
4. Configure alerts (email/SMS)
```

#### Log Monitoring

```bash
# Set up log rotation
sudo nano /etc/logrotate.d/rapidx-validator

# Add:
/home/ubuntu/validator-node/logs/*.log {
    daily
    rotate 7
    compress
    missingok
    notifempty
}
```

---

## Troubleshooting

### Common Issues

#### Issue 1: Validator Won't Start

**Symptoms:**
```
Error: Cannot find module 'ethers'
```

**Solution:**
```bash
cd validator-node
rm -rf node_modules
npm install
npm run build
pm2 restart rapidx-validator
```

#### Issue 2: Cannot Connect to Orchestrator

**Symptoms:**
```
⚠️ Disconnected from orchestrator
Error: ECONNREFUSED
```

**Solution:**
1. Check orchestrator URL in `.env`
2. Verify network connectivity:
   ```bash
   ping orchestrator.rapidx.io
   ```
3. Check firewall allows outbound WSS connections
4. Contact RapidX support if issue persists

#### Issue 3: No Revenue Being Earned

**Symptoms:**
```
curl http://localhost:8080/revenue
# Shows: { totalRevenue: "0" }
```

**Possible Causes & Solutions:**

1. **Not Participating in Signatures**
   - Check: `curl http://localhost:8080/status`
   - Verify: `hasKeyShare: true`
   - Solution: Ensure you completed DKG ceremony

2. **Incorrect Revenue Wallet**
   - Check `.env`: `REVENUE_WALLET_ADDRESS`
   - Solution: Update to correct address, restart validator

3. **Low Transaction Volume**
   - Check bridge usage on RapidX dashboard
   - Solution: Wait for more volume, or check if other validators are earning

#### Issue 4: High CPU/Memory Usage

**Symptoms:**
```
CPU > 80%, Memory > 90%
```

**Solutions:**
1. Check for memory leaks:
   ```bash
   pm2 monit
   ```

2. Restart validator:
   ```bash
   pm2 restart rapidx-validator
   ```

3. Upgrade server if consistently high

#### Issue 5: Missing Signatures

**Symptoms:**
- Other validators signing, but yours is not
- Low participation rate

**Solutions:**

1. Check validator is selected for signing:
   ```bash
   # View logs
   pm2 logs | grep "Initiating TSS signing"
   ```

2. Verify TSS_PARTY_ID is correct:
   ```bash
   grep TSS_PARTY_ID .env
   ```

3. Check orchestrator connection:
   ```bash
   curl http://localhost:8080/status | grep connected
   ```

---

## Security Best Practices

### Infrastructure Security

#### Firewall Configuration
```bash
# Configure UFW (Ubuntu)
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 8080/tcp   # Health endpoint
sudo ufw allow 9090/tcp   # Metrics (optional, can restrict to monitoring IP)
sudo ufw enable
```

#### SSH Hardening
```bash
# Disable password authentication
sudo nano /etc/ssh/sshd_config
# Set: PasswordAuthentication no
# Set: PermitRootLogin no
sudo systemctl restart sshd

# Use SSH keys only
# Add your public key to ~/.ssh/authorized_keys
```

### Application Security

#### Secure .env File
```bash
# Set restrictive permissions
chmod 600 .env

# Never commit to git
echo ".env" >> .gitignore
```

#### Key Share Protection

**Critical Security:**
- ⚠️ Your key share is your most valuable asset
- ⚠️ If lost, you cannot participate in signing
- ⚠️ If stolen, attacker could participate as you

**Best Practices:**

1. **Encrypted Storage**:
   ```bash
   # Encrypt key share
   gpg --symmetric --cipher-algo AES256 keyshare.dat
   ```

2. **Secure Backup**:
   - Store encrypted backup offline (USB drive in safe)
   - Consider hardware security module (HSM) for production

3. **Access Control**:
   ```bash
   # Restrict key share file permissions
   chmod 400 /path/to/keyshare.dat
   chown validator-user:validator-user /path/to/keyshare.dat
   ```

### Revenue Wallet Security

#### Use Hardware Wallet
- Recommended: Ledger, Trezor
- Set `REVENUE_WALLET_ADDRESS` to hardware wallet address
- Regularly transfer revenue to cold storage

#### Monitor Wallet Activity
- Set up alerts for incoming transactions
- Verify payouts match expected revenue
- Watch for unauthorized access attempts

### Operational Security

#### Regular Security Audits
- [ ] Weekly: Review access logs
- [ ] Monthly: Update all software
- [ ] Quarterly: Security assessment
- [ ] Annually: Penetration testing (optional)

#### Incident Response Plan

1. **Detected Compromise**:
   - Immediately shut down validator
   - Contact RapidX team
   - Analyze breach vector
   - Rotate all credentials

2. **Lost Key Share**:
   - Restore from encrypted backup
   - If irrecoverable, notify RapidX for resharing

3. **Revenue Wallet Compromise**:
   - Transfer funds to new wallet
   - Update `REVENUE_WALLET_ADDRESS` in .env
   - Restart validator

---

## FAQ

### General Questions

**Q: How many validators can the RapidX network support?**
A: Currently configured for 5 validators with 3-of-5 threshold. This can be expanded through DKG resharing.

**Q: Can I run multiple validators?**
A: Technically yes, but you'd need:
- Separate party IDs (e.g., party 1 and party 2)
- Separate servers/infrastructure
- Approval from RapidX governance (to prevent centralization)

**Q: What happens if my validator goes offline?**
A:
- **Short downtime (<5 min)**: Minimal impact, other validators cover
- **Extended downtime**: You miss signature opportunities = lost revenue
- **Excessive downtime**: May be removed from validator set (governance decision)

### Technical Questions

**Q: What is a party ID?**
A: Your cryptographic position (1-5) in the TSS protocol. See [TSS-ARCHITECTURE.md](./TSS-ARCHITECTURE.md) for details.

**Q: Can I change my party ID?**
A: No, it's assigned during DKG and tied to your key share. You can transfer your validator (including party ID) to someone else.

**Q: Can I change my revenue wallet address?**
A: Yes! Simply update `REVENUE_WALLET_ADDRESS` in .env and restart. No DKG resharing needed.

**Q: How do I backup my validator?**
A:
1. Backup `.env` file (encrypted)
2. Backup key share (encrypted, offline storage)
3. Document your infrastructure setup

**Q: What happens during a DKG ceremony?**
A: All validators participate in multi-party computation to generate:
- A shared bridge wallet public key (on-chain)
- Individual key shares (1 per validator, kept secret)
- No single party learns the full private key

### Economic Questions

**Q: When do I get paid?**
A: Revenue is distributed after each signature, sent to your `REVENUE_WALLET_ADDRESS`.

**Q: What if a transaction fails?**
A: You only earn revenue for successful signatures. Failed/rejected transactions don't generate revenue.

**Q: How is revenue split among validators?**
A: Equally among validators who participated in that signature (typically 3 validators split the fee).

**Q: Are there any upfront costs?**
A:
- Server hosting: $50-150/month
- RPC access: $50-200/month
- No staking or deposits required

**Q: Is running a validator profitable?**
A: Depends on bridge transaction volume. See [Economic Model](#economic-model) for scenarios.

### Operational Questions

**Q: How much time does running a validator require?**
A:
- Initial setup: 4-8 hours
- Daily monitoring: 5-10 minutes
- Weekly maintenance: 30 minutes
- Monthly updates: 1-2 hours

**Q: Can I automate validator operations?**
A: Yes! Set up:
- PM2 for auto-restart
- UptimeRobot for monitoring
- Automated security updates
- Alert systems for issues

**Q: What if I need to take my validator offline?**
A:
1. Notify other validators (if planned)
2. Stop validator gracefully: `pm2 stop rapidx-validator`
3. Bring back online ASAP to avoid missing signatures
4. Extended downtime may require coordination with RapidX team

---

## Support & Community

### Getting Help

**Technical Support:**
- Email: validators@rapidx.io
- Discord: discord.gg/rapidx (validator channel)
- Documentation: docs.rapidx.io

**Emergency Contact:**
- Critical issues: emergency@rapidx.io
- Response time: <1 hour for critical, <24h for non-critical

### Validator Community

- Monthly validator calls
- Shared knowledge base
- Best practices forum
- Performance benchmarking

---

## Conclusion

Running a RapidX validator is a professional operation that requires:
- ✅ Technical expertise
- ✅ Reliable infrastructure
- ✅ Commitment to uptime
- ✅ Security-first mindset

**In return, you receive:**
- 💰 Revenue from signature fees
- 🎯 Participation in cutting-edge cross-chain technology
- 🤝 Contribution to decentralized infrastructure
- 📈 Growth potential as bridge volume increases

**Next Steps:**
1. Review [VALIDATOR-2-SETUP.md](./VALIDATOR-2-SETUP.md) for detailed setup
2. Study [TSS-ARCHITECTURE.md](./TSS-ARCHITECTURE.md) for technical deep-dive
3. Contact RapidX team to register as validator operator
4. Join validator community on Discord
5. Complete setup and start earning!

---

**Document Version**: 1.0
**Last Updated**: 2024-01-19
**Maintained by**: RapidX Team

For updates to this guide, check: https://docs.rapidx.io/validator-guide
