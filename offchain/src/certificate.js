import { C, fromHex, toHex } from "lucid-cardano";

export const OPERATOR_KEYS = {
    vkey: "ed25519_pk1tm2w0qd77a344337jee2w70cqfzlnjvd0a50eh4ulmpqw3pvk9qq92xhvr",
    sKey: "ed25519_sk1t6a9trrju5qd30yjul5atvn02vkfwvw97zzekqkvcyrsndmtuynsfj49dz",
    address: "addr_test1vpxssvd88399v96f3pwsd8mq9grsq80pc238nx4d2zfch4qq89u45"
}

export function vkey_as_bytes() {
    return C.PrivateKey.from_bech32(OPERATOR_KEYS.sKey).to_public().as_bytes();
}

export function getSignature(msg) {
    return C.PrivateKey.from_bech32(OPERATOR_KEYS.sKey).sign(fromHex(msg)).to_hex();
}