import { stakingValidator } from './validator.js';
import { mkBlockfrost, blockfrostProvider } from '../provider.js';
import { findReferenceScriptUtxo } from '../utxo_helper.js';
import { Lucid, Data, C } from 'lucid-cardano';

export async function createReferenceScript() {
    console.log('\n=== CREATE REFERENCE SCRIPT ===');

    const operatorAddress = process.env.OPERATOR_ADDRESS;
    const operatorVkey = process.env.OPERATOR_VKEY;
    const operatorSkey = process.env.OPERATOR_SKEY;

    if (!operatorAddress || !operatorVkey || !operatorSkey) {
        throw new Error('OPERATOR_ADDRESS, OPERATOR_VKEY, and OPERATOR_SKEY must be set in .env file');
    }

    const { api_key, network } = blockfrostProvider();
    const lucid = (await Lucid.new(mkBlockfrost(network, api_key), network)).selectWalletFromPrivateKey(operatorSkey);
    const operatorPubKeyHash = lucid.utils.getAddressDetails(operatorAddress).paymentCredential.hash;

    const penaltyAddr = lucid.utils.credentialToAddress({ type: "Key", hash: operatorPubKeyHash });
    console.log(`Operator penalty address: ${penaltyAddr}`);
    const vkeyBytes = C.PrivateKey.from_bech32(operatorSkey).to_public().as_bytes();
    const stakingScript = stakingValidator(vkeyBytes, operatorPubKeyHash);

    const validatorAddress = lucid.utils.validatorToAddress(stakingScript);
    const scriptHash = lucid.utils.validatorToScriptHash(stakingScript);

    console.log(`Validator Address: ${validatorAddress}`);
    console.log(`Script Hash: ${scriptHash}`);

    const existingRefScript = await findReferenceScriptUtxo(lucid, validatorAddress);

    if (existingRefScript) {
        console.log('\n✅ Reference script already exists!');
        console.log(`UTXO: ${existingRefScript.txHash}#${existingRefScript.outputIndex}`);
        return existingRefScript.txHash;
    }

    console.log('\nNo reference script found. Creating new one...');

    const tx = await lucid.newTx()
        .payToContract(validatorAddress, { scriptRef: stakingScript, inline: Data.void() }, {})
        .complete();

    const signedTx = await tx.sign().complete();
    const txHash = await signedTx.submit();

    console.log(`\n✅ Reference script created successfully!`);
    console.log(`Transaction: ${txHash}`);
    console.log(`\nWait for confirmation before using staking operations.\n`);

    return txHash;
}

