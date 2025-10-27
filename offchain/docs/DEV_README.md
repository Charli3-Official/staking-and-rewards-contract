# Off chain Code for IAGON Contract


## Setup

### 1. Environment Configuration

Example environment file and configure your settings:
```bash
# Blockfrost Configuration
BLOCKFROST_API_KEY=<your_blockfrost_api_key>
CARDANO_NETWORK=Preprod

# Provider Wallet
PROVIDER_MNEMONIC=<your_24_word_mnemonic>

# Token Configuration
TOKEN_POLICY_ID=<token_policy_id>
TOKEN_ASSET_NAME=<token_asset_name>

# Certificate Issuer API
CERTIFICATE_ISSUER_API_URL=<certificate_issuer_api_url>

# Contract Addresses
STAKING_CONTRACT_ADDRESS=<staking_contract_address>
OPERATOR_ADDRESS=<operator_address>

# Optional: Operator Keys (only needed for reference script creation)
OPERATOR_VKEY=<operator_verification_key>
OPERATOR_SKEY=<operator_signing_key>
```

## Usage

### Generate Operator Keys
Creates a fresh operator address, verification key, and signing key. Outputs the values and stores them in `operator_keys/operator.vkey.bech32`, `operator_keys/operator.skey.bech32`, and `operator_keys/operator.enterprise.addr`.
```bash
npm start create-operator-key [output-directory]
```
If `output-directory` is omitted, the keys are placed in `./operator_keys`.
The command prints Bech32 strings you can copy into your `.env` as `OPERATOR_ADDRESS`, `OPERATOR_VKEY`, and `OPERATOR_SKEY`.

### Create Reference Script (Required First Time)
Before using staking operations, create a reference script UTXO:
```bash
npm start create-ref-script
```
This must be done once by an operator before providers can use staking transactions.
Requires `OPERATOR_VKEY` and `OPERATOR_SKEY` in .env.


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


### Testing CBOR
```bash
npm start test-staking-cbor
```

Will check if cbor is correct for datum, certificate & Redeemer
