export async function fetchUtxoWithDatum(lucid, { in_utxos, address }, dataParser) {
    const utxos = (exactUtxos(in_utxos).length > 0) ?
        in_utxos :
        (await lucid.utxosAt(address));

    console.log(utxos);

    return (await Promise.all(utxos.map(async (u) => await getDatum(u, lucid, dataParser))))

}

function exactUtxos(utxos) {
    if (!utxos) return [];
    if (utxos == []) return [];
    if (Array.isArray(utxos)) return utxos;
    return [utxos];

}

export async function getDatum(utxo, lucid, dataParser) {
    const datum = await lucid.datumOf(utxo, dataParser);
    return { utxo, datum: datum }
}

export function mergeUtxoValue(utxoLeft, utxoRight) {
    const mergedValue = Object.entries(utxoLeft.assets).map(([k, v]) => {
        const rightVal = utxoRight.assets[k] || BigInt(0)
        return [k, (v + rightVal)]
    });

    console.log(mergedValue);

    return Object.fromEntries(mergedValue);
}