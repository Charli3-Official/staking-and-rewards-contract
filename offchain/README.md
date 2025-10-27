# Offchain Code for Charli3 Node Operators

## Setup

### 1. Environment Configuration

Example environment file and configure your settings:

```bash
# Blockfrost Configuration
BLOCKFROST_API_KEY=<your_blockfrost_api_key>
CARDANO_NETWORK=Mainnet

# Provider Wallet
PROVIDER_MNEMONIC=<your_24_word_mnemonic>

# Token Configuration
TOKEN_POLICY_ID=<token_policy_id>
TOKEN_ASSET_NAME=<token_asset_name>

# Certificate Issuer API
CERTIFICATE_ISSUER_API_URL=<certificate_issuer_api_url>

# Contract Addresses
STAKING_CONTRACT_ADDRESS=<staking_contract_address>
PENALTY_ADDRESS=<penalty_address>
```

## Usage

### Placing Staking

```bash
npm start place-staking <amount>
```

This will place staking using your provider wallet

### Retire Staking

```bash
npm start retire-staking
```

This will request Staking to retire

### Resize Staking

```bash
npm start resize-staking <additional_amount>
```

Will Resize previous stake by adding the specified amount to the existing active stake.

### Withdraw Staking

```bash
npm start withdraw-staking
```

Will withdraw staking from the contract
