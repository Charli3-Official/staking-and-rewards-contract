function policyIdAndAssetName(asset) {
    if (asset == "lovelace") return ["", ""];
    return asset.split("#");
}
//
// Converts assets to plutus Data which is supported by aiken
export async function valueToMap(assets) {
    //m = new Map();

    // let parsedVal = Object.entries(assets).map()

}