import { Blockfrost, Lucid, Emulator } from 'lucid-cardano';

export const PROVIDER_1 = {
	address: "addr_test1vrs5ahth23n6fea6cl5cechmhzg402cae6fy7v975afvecc4vggvj",
	signingKey: "ed25519_sk1mgma80d4x205zqx4cv099hafvs6w8uvfamcj2laqdk42nuvzxevqmp5qqv",
	pubKeyHash: "e14edd775467a4e7bac7e98ce2fbb89157ab1dce924f30bea752cce3"
}

export const PROVIDER_2 = {
	address: "addr_test1vpcka94f448smt6t9u40jlkx9d3ehz5pt9htwwj8j4agvns93zr96",
	signingKey: "ed25519_sk1na6y2jtnqkys3n9dl9ytnkv7yhq2agfvaulzawjym4enehmpqsvsl66hcc",
	pubKeyHash: "716e96a9ad4f0daf4b2f2af97ec62b639b8a81596eb73a47957a864e"
}

export const PROVIDER_3 = {
	address: "addr_test1vp7dxufcs67kzwzcrfypg7ew565ccwtkswh2v8ppkjfxg8sak3tqj",
	signingKey: "ed25519_sk1lk4maqlv4hzmfj3d0r3j8lt5nhklp2edg9zq8uxkq5yu64l3xx0stq49qu",
	pubKeyHash: "7cd3713886bd6138581a48147b2ea6a98c397683aea61c21b492641e"
}

function mkBlockfrost(network, api_key) {
	const url = `https://cardano-${network}.blockfrost.io/api/v0`.toLowerCase()
	return new Blockfrost(url, api_key);
}

export async function walletWithProvider(provider, sKey) {
	switch (provider.name) {
		case ("blockfrost"):
			return (await Lucid.new(mkBlockfrost(provider.network, provider.api_key), provider.network)).selectWalletFromPrivateKey(sKey);

		case ("emulator"):
			return (await Lucid.new(new Emulator(provider.initial_wallets)))

		default:
			return (await Lucid.new(undefined, provider.network)).selectWalletFromPrivateKey(sKey);
	}
}

