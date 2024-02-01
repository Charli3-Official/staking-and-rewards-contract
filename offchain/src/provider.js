export function blockfrostProvider() {
    const blockfrostKey = process.env.BLOCKFROST_API_KEY
    const network = process.env.CARDANO_NETWORK || "Preprod"
    return {
        name: "blockfrost",
        api_key: blockfrostKey,
        network: network

    };
}