import { Data, toHex } from 'lucid-cardano';
import { StakingState, to_stake_datum, StakeDatum, Reedemer, Certificate } from './validator';
import { walletWithProvider } from '../wallet';
import { requestCertificate, createSignaturePayload } from '../certificate';
import { tokenDatum } from '../../data_helper';
import { blockfrostProvider } from '../provider'
import { findReferenceScriptUtxo } from '../utxo_helper';
import { confirmOperation } from '../utils.js';

import { CONFIG } from '../config';


export async function sendStake({ value, provider_address, locked_until }) {
    const lucid = await walletWithProvider(blockfrostProvider());
    const validatorAddress = CONFIG.STAKING_CONTRACT_ADDRESS;
    const providerPubKeyHash = lucid.utils.getAddressDetails(provider_address).paymentCredential.hash;

    console.log(`\n=== PLACE STAKE ===`);
    console.log(`Provider Address: ${provider_address}`);
    console.log(`Validator Address: ${validatorAddress}`);

    const stakeDatum = {
        provider_key: providerPubKeyHash,
        token: tokenDatum(CONFIG.TOKEN_POLICY_ID, CONFIG.TOKEN_ASSET_NAME),
        locked_until: locked_until,
        state: StakingState.active,
        cert: null
    };

    const parsedDatum = await to_stake_datum(stakeDatum);

    const tx = await lucid.newTx()
        .payToContract(validatorAddress, parsedDatum, value)
        .complete();

    const confirmed = await confirmOperation('Submit Place Stake Transaction', {
        'Transaction Type': 'Place Stake',
        'Amount': Object.entries(value).map(([k, v]) => `${v} ${k}`).join(', '),
        'Provider': provider_address,
        'Validator': validatorAddress,
        'Note': 'This will lock the tokens in the staking contract',
    });
    if (!confirmed) {
        console.log('Transaction cancelled.');
        return null;
    }

    const signedTx = await tx.sign().complete();
    const txHash = await signedTx.submit();

    console.log(`Transaction Submitted: ${txHash}\n`);
    return txHash;
}


export async function retireStake({ inUtxo, provider_addr }) {
    const lucid = await walletWithProvider(blockfrostProvider());
    const providerPubKeyHash = lucid.utils.getAddressDetails(provider_addr).paymentCredential.hash;
    const validatorAddress = CONFIG.STAKING_CONTRACT_ADDRESS;
    const currentTime = lucid.utils.slotToUnixTime(lucid.currentSlot());

    console.log(`\n=== RETIRE STAKE ===`);
    console.log(`Provider Address: ${provider_addr}`);
    console.log(`Validator Address: ${validatorAddress}`);

    const stakingUtxoWithDatum = await (inUtxo ?
        parseStakingUtxo(inUtxo, lucid) :
        findActiveStakingUtxo(validatorAddress, lucid, providerPubKeyHash, currentTime));

    if (!stakingUtxoWithDatum) {
        console.error('\nNo eligible staking UTXO found for retirement.');
        console.error('Please ensure:');
        console.error('  - The UTXO exists at the staking contract address');
        console.error('  - The UTXO belongs to your provider address');
        console.error('  - The UTXO is in Active state');
        console.error('  - The lock period has expired\n');
        return null;
    }

    const { utxo: stakingUtxo, datum: stakingDatum } = stakingUtxoWithDatum;
    console.log(`Staking UTXO: ${stakingUtxo.txHash}#${stakingUtxo.outputIndex}`);


    const providerUtxos = await lucid.utxosAt(provider_addr);
    if (!providerUtxos.length) {
        console.error(`\nNo UTXOs found at provider address: ${provider_addr}\n`);
        return null;
    }
    const providerUtxo = providerUtxos[0];
    console.log(`Provider UTXO: ${providerUtxo.txHash}#${providerUtxo.outputIndex}`);

    const certificate = await requestCertificateFromIssuer(
        'retire',
        stakingUtxo,
        providerUtxo,
        stakingDatum.provider_key,
        providerPubKeyHash,
        lucid,
        currentTime
    );

    const certificateDatum = Data.from(certificate.certData, Certificate);

    const outputDatum = {
        provider_key: stakingDatum.provider_key,
        token: tokenDatum(CONFIG.TOKEN_POLICY_ID, CONFIG.TOKEN_ASSET_NAME),
        locked_until: certificateDatum.stk_utxo_lock_until,
        state: StakingState.retiring,
        cert: certificateDatum
    };

    const parsedOutputDatum = Data.to(outputDatum, StakeDatum);
    const outputDatumHash = lucid.utils.datumToHash(parsedOutputDatum);

    const redeemer = Reedemer.retire(outputDatumHash, certificate.signature);

    const refScriptUtxo = await findReferenceScriptUtxo(lucid, validatorAddress);
    const certificateExpiry = Number(certificate.expiresAt);
    const validFromTime = currentTime - 2 * 60 * 1000;

    console.log(`Certificate Expiry: ${new Date(certificateExpiry).toISOString()}`);
    console.log(`Valid From: ${new Date(validFromTime).toISOString()}`);

    const tx = await lucid.newTx()
        .readFrom([refScriptUtxo])
        .collectFrom([stakingUtxo], Data.to(redeemer))
        .collectFrom([providerUtxo])
        .addSignerKey(stakingDatum.provider_key)
        .payToContract(validatorAddress, parsedOutputDatum, stakingUtxo.assets)
        .validFrom(validFromTime)
        .validTo(certificateExpiry)
        .complete();

    const confirmed = await confirmOperation('Submit Retire Stake Transaction', {
        'Transaction Type': 'Retire Stake',
        'Staking UTXO': stakingUtxo.txHash + '#' + stakingUtxo.outputIndex,
        'Amount': Object.entries(stakingUtxo.assets).map(([k, v]) => `${v} ${k}`).join(', '),
        'Provider': provider_addr,
        'Validator': validatorAddress,
        'New State': 'Retiring',
        'Certificate Expiry': new Date(certificateExpiry).toISOString(),
        'Note': 'This will initiate the retirement process',
    });
    if (!confirmed) {
        console.log('Transaction cancelled.');
        return null;
    }

    const signedTx = await tx.sign().complete();
    const txHash = await signedTx.submit();

    console.log(`Transaction Submitted: ${txHash}\n`);
    return txHash;
}

export async function withdrawStake({ inUtxo, penalty_addr, provider_addr }) {
    const lucid = await walletWithProvider(blockfrostProvider());
    const providerPubKeyHash = lucid.utils.getAddressDetails(provider_addr).paymentCredential.hash;
    const validatorAddress = CONFIG.STAKING_CONTRACT_ADDRESS;
    const currentTime = lucid.utils.slotToUnixTime(lucid.currentSlot());

    console.log(`\n=== WITHDRAW STAKE ===`);
    console.log(`Provider Address: ${provider_addr}`);
    console.log(`Penalty Address: ${penalty_addr}`);

    const stakingUtxoWithDatum = await (inUtxo
        ? parseStakingUtxo(inUtxo, lucid)
        : findRetiringStakingUtxo(validatorAddress, lucid, providerPubKeyHash, currentTime));

    if (!stakingUtxoWithDatum) {
        console.error('No eligible staking UTXO found for withdrawal.');
        return null;
    }

    const { utxo: stakingUtxo, datum: stakingDatum } = stakingUtxoWithDatum;
    console.log(`Staking UTXO: ${stakingUtxo.txHash}#${stakingUtxo.outputIndex}`);

    const [datumPolicyId, datumAssetName] = stakingDatum.token;
    const isAda = datumPolicyId === '' && datumAssetName === '';
    const tokenUnit = isAda ? 'lovelace' : datumPolicyId + datumAssetName;

    const currentStakeAmount = BigInt(stakingUtxo.assets?.[tokenUnit] ?? 0n);
    console.log(`Current Stake Amount: ${currentStakeAmount}`);

    const providerUtxos = await lucid.utxosAt(provider_addr);
    if (!providerUtxos.length) {
        console.error(`No UTXOs found at provider address: ${provider_addr}`);
        return null;
    }
    const providerUtxo = providerUtxos[0];
    console.log(`Provider UTXO: ${providerUtxo.txHash}#${providerUtxo.outputIndex}`);

    const certificate = await requestCertificateFromIssuer(
        'withdraw',
        stakingUtxo,
        providerUtxo,
        stakingDatum.provider_key,
        providerPubKeyHash,
        lucid,
        currentTime
    );

    const certificateDatum = Data.from(certificate.certData, Certificate);

    const certValue = certificateDatum.value;
    const certAssets = valueMapToAssets(certValue);
    const amountApproved = certAssets[tokenUnit] ?? 0n;
    const penaltyFee = currentStakeAmount - amountApproved;

    console.log(`Certificate Approved: ${amountApproved}`);
    console.log(`Penalty Fee: ${penaltyFee}`);

    const outputDatum = {
        provider_key: stakingDatum.provider_key,
        token: stakingDatum.token,
        locked_until: stakingDatum.locked_until,
        state: StakingState.retiring,
        cert: certificateDatum
    };

    const parsedOutputDatum = Data.to(outputDatum, StakeDatum);
    const outputDatumHash = lucid.utils.datumToHash(parsedOutputDatum);

    const redeemer = Reedemer.withdraw(outputDatumHash, certificate.signature);

    const refScriptUtxo = await findReferenceScriptUtxo(lucid, validatorAddress);
    const certificateExpiry = Number(certificate.expiresAt);
    const validFromTime = currentTime - 2 * 60 * 1000;

    console.log(`Certificate Expiry: ${new Date(certificateExpiry).toISOString()}`);
    console.log(`Valid From: ${new Date(validFromTime).toISOString()}`);

    let tx = lucid.newTx()
        .collectFrom([providerUtxo])
        .readFrom([refScriptUtxo])
        .collectFrom([stakingUtxo], Data.to(redeemer))
        .addSignerKey(stakingDatum.provider_key)
        .validFrom(validFromTime)
        .validTo(certificateExpiry);

    const contractAssets = { lovelace: stakingUtxo.assets.lovelace };

    if (penaltyFee > 0n) {
        const penaltyAssets = { [tokenUnit]: penaltyFee };
        if (!isAda) {
            penaltyAssets.lovelace = 2000000n;
        }
        tx = tx.payToAddress(penalty_addr, penaltyAssets);
    }

    tx = tx.payToContract(
        validatorAddress,
        { asHash: parsedOutputDatum },
        contractAssets
    );

    const txComplete = await tx.complete();

    const penaltyDetails = penaltyFee > 0n ? `Penalty: ${penaltyFee} ${tokenUnit} to ${penalty_addr}` : 'No penalty';
    const confirmed = await confirmOperation('Submit Withdraw Stake Transaction', {
        'Transaction Type': 'Withdraw Stake',
        'Staking UTXO': stakingUtxo.txHash + '#' + stakingUtxo.outputIndex,
        'Staked Amount': `${currentStakeAmount} ${tokenUnit}`,
        'Approved Amount': `${amountApproved} ${tokenUnit}`,
        'Penalty': penaltyDetails,
        'Provider': provider_addr,
        'Validator': validatorAddress,
        'Certificate Expiry': new Date(certificateExpiry).toISOString(),
        'Note': 'This will withdraw the approved amount and apply any penalties',
    });
    if (!confirmed) {
        console.log('Transaction cancelled.');
        return null;
    }

    const signedTx = await txComplete.sign().complete();
    const txHash = await signedTx.submit();

    console.log(`Transaction Submitted: ${txHash}\n`);
    return txHash;
}


export async function resizeStake({ inUtxo, provider_addr, additional_value }) {
    const lucid = await walletWithProvider(blockfrostProvider());
    const providerPubKeyHash = lucid.utils.getAddressDetails(provider_addr).paymentCredential.hash;
    const validatorAddress = CONFIG.STAKING_CONTRACT_ADDRESS;
    const currentTime = lucid.utils.slotToUnixTime(lucid.currentSlot());
    const tokenId = `${CONFIG.TOKEN_POLICY_ID}${CONFIG.TOKEN_ASSET_NAME}`;

    console.log(`\n=== RESIZE STAKE ===`);
    console.log(`Provider Address: ${provider_addr}`);
    console.log(`Additional Amount: ${additional_value}`);

    const stakingUtxoWithDatum = await (inUtxo ?
        parseStakingUtxo(inUtxo, lucid) :
        findUtxoByState(validatorAddress, lucid, providerPubKeyHash, StakingState.active));

    if (!stakingUtxoWithDatum) {
        console.error('\nNo eligible active staking UTXO found for resizing.');
        console.error('Please ensure:');
        console.error('  - The UTXO exists at the staking contract address');
        console.error('  - The UTXO belongs to your provider address');
        console.error('  - The UTXO is in Active state\n');
        return null;
    }

    const { utxo: stakingUtxo, datum: stakingDatum } = stakingUtxoWithDatum;
    console.log(`Staking UTXO: ${stakingUtxo.txHash}#${stakingUtxo.outputIndex}`);

    const currentStakeAmount = stakingUtxo.assets[tokenId];
    const newStakeAmount = currentStakeAmount + additional_value;

    const providerUtxos = await lucid.utxosAt(provider_addr);
    if (!providerUtxos.length) {
        console.error(`\nNo UTXOs found at provider address: ${provider_addr}\n`);
        return null;
    }
    const providerUtxo = providerUtxos[0];
    console.log(`Provider UTXO: ${providerUtxo.txHash}#${providerUtxo.outputIndex}`);

    const certificate = await requestCertificateFromIssuer(
        'resize',
        stakingUtxo,
        providerUtxo,
        stakingDatum.provider_key,
        providerPubKeyHash,
        lucid,
        currentTime,
        newStakeAmount
    );

    const certificateDatum = Data.from(certificate.certData, Certificate);

    const outputDatum = {
        provider_key: stakingDatum.provider_key,
        token: stakingDatum.token,
        locked_until: certificateDatum.stk_utxo_lock_until,
        state: stakingDatum.state,
        cert: certificateDatum
    };

    const parsedOutputDatum = Data.to(outputDatum, StakeDatum);
    const outputDatumHash = lucid.utils.datumToHash(parsedOutputDatum);

    const redeemer = Reedemer.resize(outputDatumHash, certificate.signature);

    const refScriptUtxo = await findReferenceScriptUtxo(lucid, validatorAddress);
    const certificateExpiry = Number(certificate.expiresAt);
    const validFromTime = currentTime - 2 * 60 * 1000;

    const outputAssets = { ...stakingUtxo.assets, [tokenId]: newStakeAmount };

    const tx = await lucid.newTx()
        .collectFrom([providerUtxo])
        .readFrom([refScriptUtxo])
        .collectFrom([stakingUtxo], Data.to(redeemer))
        .addSignerKey(stakingDatum.provider_key)
        .payToContract(validatorAddress, parsedOutputDatum, outputAssets)
        .validFrom(validFromTime)
        .validTo(certificateExpiry)
        .complete();

    const confirmed = await confirmOperation('Submit Resize Stake Transaction', {
        'Transaction Type': 'Resize Stake',
        'Staking UTXO': stakingUtxo.txHash + '#' + stakingUtxo.outputIndex,
        'Current Amount': `${currentAmount} ${tokenId}`,
        'Additional Amount': `${additional_value} ${tokenId}`,
        'New Total': `${currentAmount + additional_value} ${tokenId}`,
        'Provider': provider_addr,
        'Validator': validatorAddress,
        'Certificate Expiry': new Date(certificateExpiry).toISOString(),
        'Note': 'This will increase the staked amount',
    });
    if (!confirmed) {
        console.log('Transaction cancelled.');
        return null;
    }

    const signedTx = await tx.sign().complete();
    const txHash = await signedTx.submit();

    console.log(`Transaction Submitted: ${txHash}\n`);
    return txHash;
}

async function parseStakingUtxo(utxo, lucid) {
    try {
        const datum = await lucid.datumOf(utxo, StakeDatum);
        return { utxo, datum };
    } catch (error) {
        return null;
    }
}

async function findStakingUtxo(validatorAddress, lucid, filterPredicate) {
    const utxos = await lucid.utxosAt(validatorAddress);

    if (utxos.length === 0) {
        console.log(`No UTXOs found at validator address: ${validatorAddress}`);
        return null;
    }

    const parsedUtxos = await Promise.all(
        utxos.map(utxo => parseStakingUtxo(utxo, lucid))
    );

    const validUtxos = parsedUtxos.filter(result => result !== null);

    const matchingUtxo = validUtxos.find(filterPredicate);

    if (!matchingUtxo) {
        console.log('No UTXO matched the filter criteria');
    }

    return matchingUtxo;
}

async function findActiveStakingUtxo(validatorAddress, lucid, providerPubKeyHash, currentTime) {
    return findStakingUtxo(validatorAddress, lucid, ({ datum }) => {
        return datum.provider_key === providerPubKeyHash &&
            datum.locked_until <= BigInt(currentTime) &&
            JSON.stringify(datum.state) === JSON.stringify(StakingState.active);
    });
}

async function findRetiringStakingUtxo(validatorAddress, lucid, providerPubKeyHash, currentTime) {
    return findStakingUtxo(validatorAddress, lucid, ({ utxo, datum }) => {
        const [policyId, assetName] = datum.token;
        const tokenUnit = policyId === '' && assetName === '' ? 'lovelace' : policyId + assetName;
        const hasTokens = utxo.assets[tokenUnit] && BigInt(utxo.assets[tokenUnit]) > 0n;
        return datum.provider_key === providerPubKeyHash &&
            datum.locked_until <= BigInt(currentTime) &&
            JSON.stringify(datum.state) === JSON.stringify(StakingState.retiring) &&
            hasTokens;
    });
}

async function findUtxoByState(validatorAddress, lucid, providerPubKeyHash, state) {
    return findStakingUtxo(validatorAddress, lucid, ({ datum }) => {
        return datum.provider_key === providerPubKeyHash &&
            JSON.stringify(datum.state) === JSON.stringify(state);
    });
}

function valueMapToAssets(valueMap) {
    const assets = {};

    if (!valueMap) {
        return assets;
    }

    for (const [policyId, assetMap] of valueMap.entries()) {
        for (const [assetName, quantity] of assetMap.entries()) {
            const unit = policyId === '' && assetName === ''
                ? 'lovelace'
                : `${policyId}${assetName}`;

            assets[unit] = BigInt(quantity);
        }
    }

    return assets;
}

async function requestCertificateFromIssuer(
    operationType,
    stakingUtxo,
    providerUtxo,
    providerKey,
    providerPubKeyHash,
    lucid,
    timestamp,
    newValue = null
) {
    const stakingUtxoRef = `${stakingUtxo.txHash}#${stakingUtxo.outputIndex}`;
    const providerUtxoRef = `${providerUtxo.txHash}#${providerUtxo.outputIndex}`;

    const signerAddress = lucid.utils.credentialToAddress({
        type: "Key",
        hash: providerPubKeyHash
    });

    const signaturePayload = createSignaturePayload(
        operationType,
        stakingUtxoRef,
        providerUtxoRef,
        timestamp
    );

    const messageHex = toHex(new TextEncoder().encode(signaturePayload));
    const signature = await lucid.wallet.signMessage(signerAddress, messageHex);

    console.log(`Requesting ${operationType} certificate from issuer...`);

    const certificate = await requestCertificate(
        operationType,
        stakingUtxoRef,
        providerUtxoRef,
        providerKey,
        signature,
        timestamp,
        newValue
    );

    console.log(`Certificate received (expires: ${new Date(Number(certificate.expiresAt)).toISOString()})`);

    return certificate;
}