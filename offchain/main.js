import { sendStake, retireStake, withdrawStake, resizeStake } from './src/staking/action';
import { createReferenceScript } from './src/staking/referenceScript.js'
import { checkStakingDatumCborWithoutCert, checkStakingCertCbor, checkStakingDatumCborWithCert, checkStakingRedeemerCbor } from './test'
import { walletWithProvider } from './src/wallet'

import { CONFIG } from './src/config.js'

const lucid = await walletWithProvider({});

let penaltyAddress = CONFIG.PENALTY_ADDRESS;

/// 
// owner = Provider
// Node provider = Provider
let providerAddress = await lucid.wallet.address();


const args = process.argv.slice(2);
if (!args[0]) {
    console.log("Missing Commands");
    console.log("Available commands: place-staking, retire-staking, withdraw-staking, resize-staking, create-ref-script, test-staking-cbor, help");
    process.exit(1);
}

console.log("........................................................")
console.log("IAGON STAKING CLI ")
console.log(".........................................................")

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error.message);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

switch (args[0].toLowerCase()) {
    case "place-staking":
        // handle place
        try {
            await placeStake(args.splice(1));
        } catch (error) {
            console.error("Error placing stake:", error.message);
            process.exit(1);
        }
        break;

    case "retire-staking":
        // Handle retire
        try {
            await doRetireStake(args.splice(1));
        } catch (error) {
            console.error("Error retiring stake:", error.message);
            process.exit(1);
        }
        break;

    case "withdraw-staking":
        try {
            await doStakeWithdraw(args.splice(1));
        } catch (error) {
            console.error("Error withdrawing stake:", error.message);
            process.exit(1);
        }
        break;

    case "resize-staking":
        try {
            await doResizeStake(args.splice(1));
        } catch (error) {
            console.error("Error resizing stake:", error.message);
            process.exit(1);
        }
        break;

    case "create-ref-script":
        try {
            await doCreateRefScript(args.slice(1));
        } catch (error) {
            console.error("Error creating reference script:", error.message);
            process.exit(1);
        }
        break;

    case "help":
        console.log("here will be help text");
        break;

    case "test-staking-cbor":
        try {
            await doTestCbor(args.splice(1));
        } catch (error) {
            console.error("Error testing CBOR:", error.message);
            process.exit(1);
        }
        break;

    default:
        console.log("Invalid Action: ", args[0]);
        console.log("Available commands: place-staking, retire-staking, withdraw-staking, resize-staking, create-ref-script, test-staking-cbor, help");
        process.exit(1);
}

async function doResizeStake(args) {
    let amount = args[0];
    if (!amount) {
        console.log("Error: Please provide amount to add. Usage: npm start resize-staking <amount>");
        return;
    }

    let params = {
        provider_addr: providerAddress,
        additional_value: BigInt(amount)
    };
    await resizeStake(params);
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
}

async function placeStake(args) {
    let amount = args[0];
    let token = `${CONFIG.TOKEN_POLICY_ID}${CONFIG.TOKEN_ASSET_NAME}`
    let locked_until = new Date().getTime()
    let params = {
        value: { [token]: BigInt(amount) },
        provider_address: providerAddress,
        locked_until: BigInt(locked_until)
    };

    const tx = await sendStake(params);
    console.log("Submited TX: ", tx);
}

async function doStakeWithdraw(_args) {
    let params = {
        provider_addr: providerAddress,
        penalty_addr: penaltyAddress
    }
    return await withdrawStake(params)
}

async function doRetireStake(args) {
    let utxo = args[0]
    let params = {
        inUtxo: utxo,
        provider_addr: providerAddress
    }
    await retireStake(params);
}

async function doCreateRefScript(_args) {
    try {
        await createReferenceScript();
    } catch (error) {
        console.error('Failed to create reference script:', error.message);
    }
}