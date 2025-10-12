import { Constr, toHex } from 'lucid-cardano'
const ADA_POLICY_ID = ""
const ADA_ASSET_NAME = ""

export function addressDatum(pubKeyHash) {
    return new Constr(0, [new Constr(0, [pubKeyHash]), new Constr(1, [])])
}

export function tokenDatum(policy_id, asset_name) {
    return [policy_id, asset_name]
}

export function valueDatum(asset, amount) {
    const amt = (typeof amount === "bigint") ? amount : BigInt(amount)
    if (asset == "lovelace") {
        return [ADA_POLICY_ID, new Map([[ADA_ASSET_NAME, amt]])];
    }
    const policy_id = asset.slice(0, 56);
    const asset_name = asset.slice(56);
    return [policy_id, new Map([[asset_name, amt]])]
}

export function utxoDatum(txId, index) {
    return new Constr(0, [new Constr(0, [txId]), BigInt(index)]);
}