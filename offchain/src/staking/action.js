import { Data } from 'lucid-cardano';
import { StakingState, to_stake_datum, StakeDatum, Reedemer } from './validator';
import { walletWithProvider } from '../wallet';
import { getSignature } from '../certificate';
import { tokenDatum, valueDatum, utxoDatum } from '../../data_helper';
import { blockfrostProvider } from '../provider'
import { fetchUtxoWithDatum } from '../utxo_helper';
import { CONFIG } from '../config';

export async function sendStake({ value, provider_address, locked_until }, validator) {
    const lucid = await walletWithProvider(blockfrostProvider());
    const token = tokenDatum(CONFIG.TOKEN_POLICY_ID, CONFIG.TOKEN_ASSET_NAME);
    const validatorAddress = lucid.utils.validatorToAddress(validator);
    const providerPubKeyHash = lucid.utils.getAddressDetails(provider_address).paymentCredential.hash

    console.log(`Fetching UTXO for address: ${provider_address}`);
    const utxos = await lucid.utxosAt(provider_address);
    console.log(`Found ${utxos.length} UTXOS`);
    console.log('Creating Datum ...');



    const jsonDatum = {
        provider_key: providerPubKeyHash,
        token: token,
        locked_until: locked_until,
        state: StakingState.active,
        cert: null
    };

    console.log("Place Stake Params")
    console.log(jsonDatum)

    const parsedDatum = await to_stake_datum(jsonDatum);
    console.log("Parsed Datum")
    console.log(parsedDatum)

    console.log("Datum Hash")
    console.log(lucid.utils.datumToHash(parsedDatum))

    const tx = await lucid.newTx().payToContract(validatorAddress, parsedDatum, value).complete();
    const signedTx = await tx.sign().complete();
    console.log("submiting Tx ....");
    return (await signedTx.submit());
}

export async function retireStake({ inUtxo, provider_addr }, validator) {
    const lucid = await walletWithProvider(blockfrostProvider())
    const providerPubKeyHash = lucid.utils.getAddressDetails(provider_addr).paymentCredential.hash
    const validatorAddress = lucid.utils.validatorToAddress(validator);
    const currentTime = new Date().getTime()
    const token = `${CONFIG.TOKEN_POLICY_ID}${CONFIG.TOKEN_ASSET_NAME}`

    console.log("Fetching UTXO At Staking Contract: ", validatorAddress);
    const utxoWithDatum = (await fetchUtxoWithDatum(lucid, { in_utxos: inUtxo, address: validatorAddress }, StakeDatum)).filter(({ datum }) => {
        const { provider_key, locked_until, state } = datum;
        return (providerPubKeyHash == provider_key && locked_until <= BigInt(currentTime) && JSON.stringify(state) == JSON.stringify(StakingState.active))
    })

    if (!utxoWithDatum) {
        console.log("NO UTXO Found to Retire in Staking Contract ....");
        return;
    }

    const { utxo, datum } = utxoWithDatum[utxoWithDatum.length - 1];

    console.log(`\n Using ${utxo.txHash}#${utxo.outputIndex} utxo of staking contract`)

    console.log("Fetching provider utxo to add in datum");
    const providerUtxo = (await lucid.utxosAt(provider_addr))[0];
    if (!providerUtxo) {
        console.log(`NO UTXO Found in provider address: ${provider_addr}`);
        return;
    }

    const timeToLockForWithdraw = new Date(currentTime + 3 * 60 * 1000).getTime()
    const certificateExpiry = new Date(currentTime + 10 * 60 * 1000).getTime()

    const certDtm = {
        cert_utxo: utxoDatum(providerUtxo.txHash, providerUtxo.outputIndex),
        expires_in: BigInt(certificateExpiry),
        stk_utxo_lock_until: BigInt(timeToLockForWithdraw), // Can withdraw after 10 min
        value: new Map([valueDatum(token, utxo.assets[token])])
    }

    const newJsonDtm = {
        provider_key: datum.provider_key,
        token: tokenDatum(CONFIG.TOKEN_POLICY_ID, CONFIG.TOKEN_ASSET_NAME),
        locked_until: BigInt(timeToLockForWithdraw),
        state: StakingState.retiring,
        cert: certDtm
    };

    const parsedDatum = Data.to(newJsonDtm, StakeDatum);
    const datumHash = lucid.utils.datumToHash(parsedDatum);
    const certSig = getSignature(datumHash);
    const redeemer = Reedemer.retire(datumHash, certSig);


    console.log("\n Signature")
    console.log(certSig)

    console.log("\n Redeemer .....")
    console.log(Data.to(redeemer));

    console.log("\n Datum CBOR ......")
    console.log(parsedDatum)

    console.log("\n Datum Hash")
    console.log(datumHash)

    console.log("\n Datum Raw")
    console.log(newJsonDtm)

    console.log("\n Building TX ....")

    let tx = await
        lucid.newTx()
            .collectFrom([providerUtxo])
            .collectFrom([utxo], Data.to(redeemer))
            .addSignerKey(datum.provider_key)
            .attachSpendingValidator(validator)
            .payToContract(validatorAddress, parsedDatum, utxo.assets)
            .validFrom(currentTime - 2 * 60 * 1000)
            .validTo(certificateExpiry)
            .complete()

    console.log("\n TX Built with CBOR: \n ")
    console.log(tx.toString())

    console.log("\n Signing Tx ....")
    let signedTx = await tx.sign().complete();

    console.log("Submiting TX ...")
    let txId = await signedTx.submit();
    console.log("\n TX Submited with TxID: ", txId)
}

async function filterUtxo(validatorAddr, lucid, fn) {
    const utxos = await lucid.utxosAt(validatorAddr);
    return (await Promise.all(utxos.map((u) => stakingDatumFromUtxo(u, lucid)))).filter((utxoWithDatum) => fn(utxoWithDatum))[0]
}

async function stakingDatumFromUtxo(utxo, lucid) {
    const datum = await lucid.datumOf(utxo, StakeDatum);
    return { utxo, datum: datum }
}

export async function withdrawStake({ inUtxo, penalty_addr, provider_addr, penalty_amount }, validator) {
    const lucid = await walletWithProvider(blockfrostProvider())
    const providerPubKeyHash = lucid.utils.getAddressDetails(provider_addr).paymentCredential.hash
    const validatorAddress = lucid.utils.validatorToAddress(validator);
    const currentTime = new Date().getTime()
    const token = `${CONFIG.TOKEN_POLICY_ID}${CONFIG.TOKEN_ASSET_NAME}`

    console.log("Fetching UTXO At Staking Contract: ", validatorAddress);
    const utxoWithDatum = await (inUtxo ?
        stakingDatumFromUtxo(inUtxo, lucid) :
        filterUtxo(validatorAddress, lucid, ({ datum }) => {
            const { provider_key, locked_until, state } = datum;
            return (providerPubKeyHash == provider_key && locked_until <= BigInt(currentTime) && JSON.stringify(state) == JSON.stringify(StakingState.retiring))
        }));
    // 

    if (!utxoWithDatum) {
        console.log("NO UTXO Found to Retire in Staking Contract ....");
        return;
    }

    const { utxo, datum } = utxoWithDatum;

    console.log(`\n Using ${utxo.txHash}#${utxo.outputIndex} utxo of staking contract`)

    console.log("Fetching provider utxo to add in datum");
    const providerUtxo = (await lucid.utxosAt(provider_addr))[0];
    if (!providerUtxo) {
        console.log(`NO UTXO Found in provider address: ${provider_addr}`);
        return;
    }

    const timeToLockForWithdraw = new Date(currentTime + 3 * 60 * 1000).getTime()
    const certificateExpiry = new Date(currentTime + 10 * 60 * 1000).getTime()
    //
    const certDtm = {
        cert_utxo: utxoDatum(providerUtxo.txHash, providerUtxo.outputIndex),
        expires_in: BigInt(certificateExpiry),
        stk_utxo_lock_until: null,
        value: new Map([valueDatum(token, utxo.assets[token])])
    }

    const newJsonDtm = {
        provider_key: datum.provider_key,
        token: tokenDatum(CONFIG.TOKEN_POLICY_ID, CONFIG.TOKEN_ASSET_NAME),
        locked_until: BigInt(timeToLockForWithdraw),
        state: StakingState.retiring,
        cert: certDtm
    };
    // 
    const sedDatum = Data.to(newJsonDtm, StakeDatum);
    const datumHash = lucid.utils.datumToHash(sedDatum);
    const certSig = getSignature(datumHash);
    const redeemer = Reedemer.withdraw(datumHash, certSig);


    console.log("\n Signature")
    console.log(certSig)

    console.log("\n Redeemer .....")
    console.log(Data.to(redeemer));

    console.log("\n Datum CBOR ......")
    console.log(sedDatum)

    console.log("\n Datum Hash")
    console.log(datumHash)

    console.log("\n Datum Raw")
    console.log(newJsonDtm)

    console.log("\n Building TX ....")

    let tx = await
        lucid.newTx()
            .collectFrom([providerUtxo])
            .collectFrom([utxo], Data.to(redeemer))
            .addSignerKey(datum.provider_key)
            .payToAddressWithData(penalty_addr, sedDatum, { lovelace: penalty_amount })
            .attachSpendingValidator(validator)
            .validFrom(currentTime - 2 * 60 * 1000)
            .validTo(certificateExpiry)
            .complete()

    console.log("\n TX Built with CBOR: \n ")
    console.log(tx.toString())

    console.log("\n Signing Tx ....")
    let signedTx = await tx.sign().complete();

    console.log("Submiting TX ...")
    let txId = await signedTx.submit();
    console.log("\n TX Submited with TxID: ", txId)
}

export async function resizeStake({ inUtxo, provider_addr }, validator) {

    const lucid = await walletWithProvider(blockfrostProvider())
    const providerPubKeyHash = lucid.utils.getAddressDetails(provider_addr).paymentCredential.hash
    const validatorAddress = lucid.utils.validatorToAddress(validator);
    const currentTime = new Date().getTime()
    const token = `${CONFIG.TOKEN_POLICY_ID}${CONFIG.TOKEN_ASSET_NAME}`

    console.log("Fetching UTXO At Staking Contract: ", validatorAddress);
    const utxoWithDatum = await (inUtxo ?
        stakingDatumFromUtxo(inUtxo, lucid) :
        filterUtxo(validatorAddress, lucid, ({ datum }) => {
            const { provider_key, state } = datum;
            return (providerPubKeyHash == provider_key && JSON.stringify(state) == JSON.stringify(StakingState.active))
        }));
    // 

    if (!utxoWithDatum) {
        console.log("NO UTXO Found to Retire in Staking Contract ....");
        return;
    }

    const { utxo, datum } = utxoWithDatum;

    console.log(`\n Using ${utxo.txHash}#${utxo.outputIndex} utxo of staking contract`)

    console.log("Fetching provider utxo to add in datum");
    const providerUtxo = (await lucid.utxosAt(provider_addr))[0];
    if (!providerUtxo) {
        console.log(`NO UTXO Found in provider address: ${provider_addr}`);
        return;
    }

    const timeToLockForWithdraw = new Date(currentTime + 3 * 60 * 1000).getTime()
    const certificateExpiry = new Date(currentTime + 10 * 60 * 1000).getTime()
    const newValue = utxo.assets.lovelace + BigInt(1000000) // Resize old stake with additional 1 ADA
    // 
    const certDtm = {
        cert_utxo: utxoDatum(providerUtxo.txHash, providerUtxo.outputIndex),
        expires_in: BigInt(certificateExpiry),
        stk_utxo_lock_until: BigInt(timeToLockForWithdraw), // Can withdraw after 10 min
        value: new Map([valueDatum(token, utxo.assets[token])])
    }

    const newJsonDtm = {
        provider_key: datum.provider_key,
        token: tokenDatum(CONFIG.TOKEN_POLICY_ID, CONFIG.TOKEN_ASSET_NAME),
        locked_until: BigInt(timeToLockForWithdraw),
        state: StakingState.active,
        cert: certDtm
    };

    const parsedDatum = Data.to(newJsonDtm, StakeDatum);
    const datumHash = lucid.utils.datumToHash(parsedDatum);
    const certSig = getSignature(datumHash);
    const redeemer = Reedemer.resize(datumHash, certSig);


    console.log("\n Signature")
    console.log(certSig)

    console.log("\n Redeemer .....")
    console.log(Data.to(redeemer));

    console.log("\n Datum CBOR ......")
    console.log(parsedDatum)

    console.log("\n Datum Hash")
    console.log(datumHash)

    console.log("\n Datum Raw")
    console.log(newJsonDtm)

    console.log("\n Building TX ....")

    let tx = await
        lucid.newTx()
            .collectFrom([providerUtxo])
            .collectFrom([utxo], Data.to(redeemer))
            .addSignerKey(datum.provider_key)
            .attachSpendingValidator(validator)
            .payToContract(validatorAddress, parsedDatum, { lovelace: newValue, [token]: utxo.assets[token] })
            .validFrom(currentTime - 2 * 60 * 1000)
            .validTo(certificateExpiry)
            .complete()

    console.log("\n TX Built with CBOR: \n ")
    console.log(tx.toString())

    console.log("\n Signing Tx ....")
    let signedTx = await tx.sign().complete();

    console.log("Submiting TX ...")
    let txId = await signedTx.submit();
    console.log("\n TX Submited with TxID: ", txId)
}

