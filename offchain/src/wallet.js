import { Lucid, Emulator } from 'lucid-cardano';
import { mkBlockfrost } from './provider.js';
import 'dotenv/config';

const mnemonic = process.env.PROVIDER_MNEMONIC;
const network = process.env.CARDANO_NETWORK || "Preprod";

if (!mnemonic) {
	throw new Error('PROVIDER_MNEMONIC not set in .env');
}

if (!network) {
	throw new Error('CARDANO_NETWORK not set in .env');
}


export async function walletWithProvider(provider) {
	switch (provider.name) {
		case ("blockfrost"):
			return (await Lucid.new(mkBlockfrost(provider.network, provider.api_key), provider.network)).selectWalletFromSeed(mnemonic);
		case ("emulator"):
			return (await Lucid.new(new Emulator(provider.initial_wallets), provider.network)).selectWalletFromSeed(mnemonic);
		default:
			return (await Lucid.new(undefined, network)).selectWalletFromSeed(mnemonic);
	}
}