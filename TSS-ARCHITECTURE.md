# TSS Architecture: Party IDs, Wallet Addresses, and Signature Mechanism

## Table of Contents
1. [Overview](#overview)
2. [Party ID vs Wallet Address](#party-id-vs-wallet-address)
3. [How TSS Signatures Work](#how-tss-signatures-work)
4. [Validator Lifecycle](#validator-lifecycle)
5. [Production Recommendations](#production-recommendations)

---

## Overview

RapidX uses **Threshold Signature Scheme (TSS)** based on Schnorr/ECDSA signatures to enable secure, decentralized control of cross-chain bridge wallets without any single party holding the complete private key.

### Key Concepts

- **Party ID**: Numeric identifier (1-5) representing a validator's position in TSS protocol
- **Wallet Address**: Blockchain address where validator receives revenue/rewards
- **Key Share**: Validator's piece of the distributed private key (from DKG)
- **Threshold**: Minimum signatures needed (3-of-5 in RapidX)
- **Aggregated Signature**: Final signature created from partial signatures

---

## Party ID vs Wallet Address

### What is a Party ID?

**Party ID** is a **cryptographic position identifier** used in the TSS protocol:

```typescript
interface TSSConfig {
  partyId: number;           // 1, 2, 3, 4, or 5
  threshold: number;         // 3 (minimum required)
  totalParties: number;      // 5 (total validators)
}
```

**Purpose of Party ID:**
- Identifies validator's position in DKG (Distributed Key Generation)
- Determines which key share validator receives
- Used in multi-party signing protocol
- Required for signature aggregation

**Party ID is NOT:**
- ❌ A blockchain address
- ❌ Used for revenue distribution
- ❌ Visible on-chain
- ❌ Tied to a specific operator's identity

### What is a Wallet Address?

**Wallet Address** is a **blockchain account** for receiving validator rewards:

```bash
REVENUE_WALLET_ADDRESS=0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb  # Validator's payout address
```

**Purpose of Wallet Address:**
- Receives validator revenue (fees from signatures)
- Operator's identity for payouts
- Can be changed by validator operator
- Visible on-chain for transparency

---

## Party ID vs Wallet Address: Critical Difference

### ✅ Recommended Architecture (Current Design)

**Separate Party ID from Wallet Address:**

```
┌─────────────┬──────────┬─────────────────────────────┬────────────────┐
│ Validator   │ Party ID │ Wallet Address              │ Can Change?    │
├─────────────┼──────────┼─────────────────────────────┼────────────────┤
│ Validator 1 │    1     │ 0x742d...0bEb (Alice)       │ ✅ Yes         │
│ Validator 2 │    2     │ 0x8Ba1...2dC3 (Bob)         │ ✅ Yes         │
│ Validator 3 │    3     │ 0x1f9A...7eF1 (Charlie)     │ ✅ Yes         │
│ Validator 4 │    4     │ 0x3cD8...9aB2 (Diana)       │ ✅ Yes         │
│ Validator 5 │    5     │ 0x5eF2...4cD9 (Eve)         │ ✅ Yes         │
└─────────────┴──────────┴─────────────────────────────┴────────────────┘
```

**Advantages:**
1. ✅ **Operator Flexibility**: Alice can transfer her validator business to Frank by:
   - Giving Frank the Party 1 key share
   - Frank changes `REVENUE_WALLET_ADDRESS` to his address
   - Party ID stays 1 (no DKG resharing needed)

2. ✅ **Revenue Distribution**: Each validator receives rewards to their chosen address
3. ✅ **Privacy**: Wallet address not tied to cryptographic protocol
4. ✅ **Validator Marketplace**: Validators can be sold/transferred easily

### ❌ Not Recommended: Using Wallet Address as Party ID

**If you used wallet addresses as party IDs:**

```typescript
// BAD DESIGN - Don't do this
interface TSSConfig {
  partyId: string;  // "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
  threshold: number;
  totalParties: number;
}
```

**Problems:**
1. ❌ **Resharing Required**: Every time a validator changes wallet, you need full DKG resharing
2. ❌ **Complexity**: TSS protocol expects numeric IDs (1-5), not addresses
3. ❌ **Performance**: Address-based lookups slower than numeric IDs
4. ❌ **Compatibility**: Most TSS libraries (bnb-chain/tss-lib, taurus-group) use numeric IDs

---

## How TSS Signatures Work

### Phase 1: Distributed Key Generation (DKG)

**One-time setup when validators join:**

```
Step 1: All 5 validators participate in DKG ceremony
        ┌─────────────────────────────────────┐
        │  Validators: 1, 2, 3, 4, 5          │
        │  Threshold: 3                       │
        └─────────────────────────────────────┘
                         ↓
Step 2: Each validator receives a key share
        ┌──────────┬──────────────────┐
        │ Party ID │ Key Share        │
        ├──────────┼──────────────────┤
        │    1     │ share_1 (secret) │
        │    2     │ share_2 (secret) │
        │    3     │ share_3 (secret) │
        │    4     │ share_4 (secret) │
        │    5     │ share_5 (secret) │
        └──────────┴──────────────────┘
                         ↓
Step 3: Generate aggregated public key (bridge wallet)
        Public Key: 0x9fB1...3dC4 (on-chain bridge wallet)

        ⚠️ CRITICAL: No single validator knows the full private key!
```

**Key Properties:**
- Each validator gets a **unique key share**
- Key shares are **position-dependent** (tied to party ID 1-5)
- **Aggregated public key** is deterministic from all shares
- Bridge wallet is controlled by this public key
- Need **3 out of 5** validators to create a valid signature

### Phase 2: Signature Generation

**Every time a cross-chain transaction needs signing:**

```
Step 1: Signal event detected on source chain
        ┌─────────────────────────────────────┐
        │ User bridges 100 USDT               │
        │ Ethereum → BSC                      │
        │ SignalID: 0xabc123...               │
        └─────────────────────────────────────┘
                         ↓
Step 2: Orchestrator selects 3 validators (threshold)
        Selected: Party IDs [1, 2, 3]
        Message: hash(signalId, srcChain, dstChain, amount, recipient)
                         ↓
Step 3: Each selected validator generates partial signature

        Validator 1:
        ┌──────────────────────────────────────┐
        │ Input: message + key_share_1         │
        │ Output: partial_signature_1          │
        └──────────────────────────────────────┘

        Validator 2:
        ┌──────────────────────────────────────┐
        │ Input: message + key_share_2         │
        │ Output: partial_signature_2          │
        └──────────────────────────────────────┘

        Validator 3:
        ┌──────────────────────────────────────┐
        │ Input: message + key_share_3         │
        │ Output: partial_signature_3          │
        └──────────────────────────────────────┘
                         ↓
Step 4: Orchestrator aggregates partial signatures
        ┌──────────────────────────────────────┐
        │ Inputs: [partial_sig_1,              │
        │          partial_sig_2,              │
        │          partial_sig_3]              │
        │                                      │
        │ Output: aggregated_signature         │
        │         (valid for bridge pubkey)    │
        └──────────────────────────────────────┘
                         ↓
Step 5: Submit to destination chain
        ┌──────────────────────────────────────┐
        │ BSC Bridge Contract verifies:        │
        │ - Signature matches bridge pubkey    │
        │ - Message hash is correct            │
        │ - Signal not already processed       │
        │                                      │
        │ ✅ Mint 100 USDT to recipient        │
        └──────────────────────────────────────┘
```

### Signature Verification On-Chain

**Smart contract verification:**

```solidity
// Pseudo-code for on-chain verification
function executeSignal(
    bytes32 signalId,
    uint256 srcChainId,
    uint256 dstChainId,
    uint256 amount,
    address recipient,
    bytes memory signature
) external {
    // 1. Reconstruct message
    bytes32 message = keccak256(abi.encodePacked(
        signalId,
        srcChainId,
        dstChainId,
        amount,
        recipient
    ));

    // 2. Verify signature against bridge public key
    require(
        ECDSA.recover(message, signature) == BRIDGE_PUBLIC_KEY,
        "Invalid signature"
    );

    // 3. Execute transaction
    _mint(recipient, amount);
}
```

**Why this works:**
- Aggregated signature is valid for the **bridge public key**
- Bridge public key is derived from **all 5 key shares**
- But signature only needed **3 key shares** (threshold)
- Contract doesn't know which validators signed
- Contract only verifies signature matches bridge key

---

## Validator Lifecycle

### Scenario 1: Validator Stays, Changes Wallet

**Problem**: Alice (Party 1) wants to change her revenue wallet.

**Solution**: ✅ Simple (with current architecture)

```bash
# Alice's validator-1 .env
VALIDATOR_ID=validator-1
TSS_PARTY_ID=1                              # ← Stays the same
REVENUE_WALLET_ADDRESS=0x742d...0bEb        # ← Old wallet

# Alice updates to new wallet
REVENUE_WALLET_ADDRESS=0x9fB1...3dC4        # ← New wallet
```

**Result:**
- ✅ No DKG resharing needed
- ✅ Party ID stays 1
- ✅ Key share stays the same
- ✅ Future rewards go to new wallet
- ⚡ Change takes effect immediately

### Scenario 2: Validator Leaves, New Operator Joins

**Problem**: Alice (Party 1) sells her validator to Frank.

**Solution**: ✅ Transfer key share + update config

```bash
# Step 1: Alice securely transfers key_share_1 to Frank
# (encrypted file, HSM transfer, or secure ceremony)

# Step 2: Frank updates validator-1 config
VALIDATOR_ID=validator-1
TSS_PARTY_ID=1                              # ← Same party ID
REVENUE_WALLET_ADDRESS=0xFrank...Address    # ← Frank's wallet
VALIDATOR_NAME="Frank's Validator"          # ← New name
```

**Result:**
- ✅ No DKG resharing needed
- ✅ Party 1 now operated by Frank
- ✅ Future rewards go to Frank's wallet
- ⚡ Minimal downtime

### Scenario 3: Validator Set Expansion (5 → 7 validators)

**Problem**: RapidX grows, needs to expand from 5 to 7 validators.

**Solution**: ⚠️ Requires full DKG resharing

```
Old Set: [1, 2, 3, 4, 5]  (3-of-5 threshold)
New Set: [1, 2, 3, 4, 5, 6, 7]  (4-of-7 threshold)

Step 1: Run DKG resharing ceremony with all 7 validators
Step 2: Generate new key shares for positions 1-7
Step 3: Bridge public key STAYS THE SAME (critical!)
Step 4: Old shares destroyed, new shares distributed
```

**Result:**
- ⚠️ Complex operation (requires all validators)
- ✅ Bridge wallet stays the same (no on-chain migration)
- ✅ More decentralization

---

## Production Recommendations

### ✅ Recommended: Dual-Identifier System

**Configuration:**

```typescript
// .env
VALIDATOR_ID=validator-1            // Human-readable ID
TSS_PARTY_ID=1                      // Cryptographic position (1-5)
REVENUE_WALLET_ADDRESS=0x742d...    // Payout address
OPERATOR_NAME="Alice Validator LLC" // Business name
```

**On-Chain Registry (Smart Contract):**

```solidity
struct ValidatorInfo {
    uint8 partyId;              // 1-5 (immutable after DKG)
    address revenueWallet;      // Can be updated by operator
    string operatorName;        // Can be updated
    uint256 totalSignatures;    // Performance tracking
    uint256 totalRevenue;       // Earnings tracking
    bool isActive;              // Slashing/removal flag
}

mapping(uint8 => ValidatorInfo) public validators;

// Update revenue wallet (only by authorized operator)
function updateRevenueWallet(uint8 partyId, address newWallet) external {
    require(msg.sender == validatorOperators[partyId], "Not authorized");
    validators[partyId].revenueWallet = newWallet;
    emit RevenueWalletUpdated(partyId, newWallet);
}
```

**Benefits:**
1. ✅ Party ID is **immutable** (tied to cryptography)
2. ✅ Wallet address is **mutable** (operator flexibility)
3. ✅ On-chain transparency
4. ✅ Easy validator transfers
5. ✅ Performance tracking per party

### 🔐 Security Best Practices

**Key Share Protection:**
```bash
# Store key shares in encrypted vault
KEY_SHARE_PATH=/secure/vault/party_1_keyshare.enc
KEY_SHARE_PASSWORD=<strong-password>

# Or use HSM (Hardware Security Module)
HSM_ENABLED=true
HSM_SLOT_ID=1
```

**Operator Authentication:**
```bash
# Require signature to update validator config
OPERATOR_PRIVATE_KEY=<secure-key>  # Never commit to git!

# Or use multi-sig
OPERATOR_MULTISIG_ADDRESS=0x...
REQUIRED_SIGNATURES=2
```

### 📊 Revenue Distribution

**Smart Contract Distribution:**

```solidity
// Distribute signature fees to validators
function distributeRevenue(uint8[] memory participantIds) internal {
    uint256 feePerValidator = signatureFee / participantIds.length;

    for (uint i = 0; i < participantIds.length; i++) {
        uint8 partyId = participantIds[i];
        address wallet = validators[partyId].revenueWallet;

        // Transfer to validator's revenue wallet
        payable(wallet).transfer(feePerValidator);

        validators[partyId].totalRevenue += feePerValidator;
        validators[partyId].totalSignatures += 1;
    }
}
```

**Result:**
- Validators 1, 2, 3 who participated in signing get paid
- Payment goes to their configured REVENUE_WALLET_ADDRESS
- Validators 4, 5 who didn't participate get nothing for that signature
- Transparent, automated, fair

---

## Summary

### Key Takeaways

1. **Party ID = Cryptographic Position**
   - Immutable after DKG
   - Numeric (1-5)
   - Used in TSS protocol
   - NOT visible to end users

2. **Wallet Address = Payout Identity**
   - Mutable (can be changed)
   - Blockchain address
   - Receives validator revenue
   - Publicly visible on-chain

3. **Signatures Work via TSS**
   - 3-of-5 threshold (configurable)
   - Each validator has a key share
   - Partial signatures are aggregated
   - Final signature valid for bridge public key
   - No single validator can sign alone

4. **Validator Changes**
   - ✅ Easy: Change wallet address (no DKG)
   - ✅ Medium: Transfer validator (share key share)
   - ⚠️ Hard: Change validator set size (full DKG resharing)

### Final Recommendation

**✅ Keep the current architecture:**
- Party ID (1-5) for TSS protocol
- Wallet Address for revenue
- On-chain registry linking them
- Operators can update wallet address
- Party ID stays immutable

This gives you:
- Maximum flexibility for validators
- Minimal DKG resharing operations
- Industry-standard TSS implementation
- Easy integration with bnb-chain/tss-lib
- Professional, production-ready design
