import { sendStake, retireStake, withdrawStake, resizeStake } from './src/staking/action';
import { vkey_as_bytes, OPERATOR_KEYS } from './src/certificate';
import { stakingValidator } from './src/staking/validator.js'
import { addressDatum } from './data_helper'
import { checkStakingDatumCborWithoutCert, checkStakingCertCbor, checkStakingDatumCborWithCert, checkStakingRedeemerCbor, checkRewardCertificateDatumCbor, checkRewardReedemerCbor } from './test'
import { walletWithProvider } from './src/wallet'
import { rewardValidator, placeReward, claimReward, reclaimReward } from './src/rewards/validator';

const lucid = await walletWithProvider({});

let operatorAddr = lucid.utils.getAddressDetails(OPERATOR_KEYS.address).paymentCredential.hash
let stValidator = stakingValidator(vkey_as_bytes(), addressDatum(operatorAddr));

/// 
// owner = Provider
// Node provider = Provider
let providerAddress = await lucid.wallet.address();
let providerPubKeyHash = lucid.utils.getAddressDetails(providerAddress).paymentCredential.hash
let rwdValidator = rewardValidator(vkey_as_bytes(), providerPubKeyHash);


const args = process.argv.slice(2);
if (!args[0]) {
    console.log("Missing Commands");
}

console.log("........................................................")
console.log("IAGON STAKING CLI ")
console.log(".........................................................")

switch (args[0].toLowerCase()) {
    case "place-staking":
        // handle place
        placeStake(args.splice(1));
        break;

    case "retire-staking":
        // Handle retire
        doRetireStake(args.splice(1));
        break;

    case "withdraw-staking":
        doStakeWithdraw(args.splice(1));
        break;

    case "resize-staking":
        doResizeStake(args.splice(1));
        break;

    case "place-reward":
        doPlaceReward();
        break;

    case "claim-reward":
        doClaimReward();
        break;

    case "reclaim-reward":
        doReclaimReward();
        break;

    case "help":
        console.log("here will be help text");
        break;

    case "test-cbor":
        doTestCbor(args.splice(1));
        break;

    default:
        console.log("Invalid Action: ", args[0]);
}

async function doPlaceReward(_args) {
    // Placing 10 ADA to Reward Contract
    const rewardTxId = await placeReward({
        value: { lovelace: 10000000n },
        owner_addr: providerAddress
    }, rwdValidator);
    console.log(`Placed reward with TX:  ${rewardTxId}`);
}

async function doClaimReward(_args) {
    const txId = await claimReward({ provider_addr: providerAddress }, rwdValidator)
    console.log(`Cliamed Reward with TX: ${txId}`);
}

async function doReclaimReward(_args) {
    const txId = await reclaimReward({ owner_addr: providerAddress }, rwdValidator);
    console.log(`Reclaim Reward with TX:  ${txId}`);
}

async function doResizeStake(_args) {
    let params = {
        provider_addr: providerAddress
    };
    resizeStake(params, stValidator)
}

async function doTestCbor(_args) {
    console.log("\nStaking Cbor Test")
    const stakingWithoutCertCheck = await checkStakingDatumCborWithoutCert()
    console.log(stakingWithoutCertCheck)
    const stakingCertificateCheck = await checkStakingCertCbor()
    console.log(stakingCertificateCheck)
    const stakingDatumWithCertCheck = await checkStakingDatumCborWithCert()
    console.log(stakingDatumWithCertCheck)
    const stakingRedeemerDatumCheck = checkStakingRedeemerCbor()
    console.log(stakingRedeemerDatumCheck)

    console.log("\nReward Cbor Test")

    const rwdCertDtmCborCheck = await checkRewardCertificateDatumCbor()
    console.log(rwdCertDtmCborCheck)
    const rwdRedeemerCborCheck = checkRewardReedemerCbor()
    console.log(rwdRedeemerCborCheck)
}

async function placeStake(args) {
    let locked_until = args[0] || new Date().getTime()
    let params = {
        value: { lovelace: 5000000n },
        provider_address: providerAddress,
        locked_until: BigInt(locked_until)
    };

    const tx = await sendStake(params, stValidator);
    console.log("Submited TX: ", tx);
}

async function doStakeWithdraw(_args) {
    let params = {
        provider_addr: providerAddress,
        penalty_addr: OPERATOR_KEYS.address,
        penalty_amount: BigInt(2000000)
    }

    return await withdrawStake(params, stValidator)
}

async function doRetireStake(args) {
    let utxo = args[0]
    let params = {
        utxo: utxo,
        provider_addr: providerAddress
    }

    await retireStake(params, stValidator);
}