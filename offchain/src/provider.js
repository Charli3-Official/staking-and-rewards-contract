import { Blockfrost } from "lucid-cardano";

export function blockfrostProvider() {
  const blockfrostKey = process.env.BLOCKFROST_API_KEY;
  const network = process.env.CARDANO_NETWORK || "Preprod";
  return {
    name: "blockfrost",
    api_key: blockfrostKey,
    network: network,
  };
}

export function mkBlockfrost(network, api_key) {
  const url = `https://cardano-${network}.blockfrost.io/api/v0`.toLowerCase();
  return new Blockfrost(url, api_key);
}
