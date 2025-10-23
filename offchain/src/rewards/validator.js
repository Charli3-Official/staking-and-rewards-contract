import { Constr, Data, applyParamsToScript, toHex } from "lucid-cardano";
import { PLUTUS_BLUEPRINT } from "../../blueprint.js";
import { blockfrostProvider } from "../provider.js";
import { walletWithProvider } from "../wallet.js";
import { mergeUtxoValue } from "../utxo_helper.js";
import { utxoDatum, valueDatum } from "../../data_helper.js";

export function rewardValidator(operator_vkey, owner_pubkey_hash) {
  const validator = PLUTUS_BLUEPRINT.validators.find(
    ({ title }) => title == "reward.reward",
  );
  return {
    type: "PlutusV2",
    script: applyParamsToScript(validator.compiledCode, [
      toHex(operator_vkey),
      owner_pubkey_hash,
    ]),
  };
}

export const RewardCertificate = Data.Object({
  cert_utxo: Data.Any(),
  expires_in: Data.Integer(),
  provider_key: Data.Bytes(),
  value: Data.Map(Data.Bytes(), Data.Map(Data.Bytes(), Data.Integer())),
});

export function to_reward_certificate_datum(json_data) {
  return Data.to(json_data, RewardCertificate);
}

export const RewardReedemer = {
  Null: function () {
    return new Constr(1, []);
  },
  Signed: function (msg, sig) {
    return new Constr(0, [[msg, sig]]);
  },
};

// Place reward to reward contract
export async function placeReward({ value, owner_addr }, validator) {
  const lucid = await walletWithProvider(blockfrostProvider());
  const validatorAddr = lucid.utils.validatorToAddress(validator);

  console.log(`Fetching UTXO for address: ${owner_addr}`);
  const utxos = await lucid.utxosAt(owner_addr);
  console.log(`Found ${utxos.length}  UTXOS`);

  console.log("Building TX ....");
  const tx = await lucid
    .newTx()
    .payToContract(validatorAddr, Data.void(), value)
    .complete();

  console.log("Signing TX ....");
  const signedTx = await tx.sign().complete();

  console.log("Submiting TX ....");
  return await signedTx.submit();
}

// Reward to claim by provider
export async function claimReward({ provider_addr }, validator) {
  const lucid = await walletWithProvider(blockfrostProvider());
  const validatorAddr = await lucid.utils.validatorToAddress(validator);

  console.log(`Fetching UTXO for Provider address: ${provider_addr}`);
  const providerUtxo = (await lucid.utxosAt(provider_addr))[0];

  if (!providerUtxo) throw `No UTXO found for Provider`;

  const providerPubKeyHash =
    lucid.utils.getAddressDetails(provider_addr).paymentCredential.hash;

  console.log(`Fetching UTXO At Reward Contract: ${validatorAddr}`);
  const rewardUtxoWithDatum = await lucid.utxosAt(validatorAddr);
  // lets try to get 2 ADA from reward contract
  const inputRewardUtxo = rewardUtxoWithDatum.filter(
    (u) => u.assets.lovelace >= BigInt(2000000),
  )[0];
  if (inputRewardUtxo === []) throw `No UTXO Found at Reward Contract`;

  const currentTime = new Date().getTime();
  const certificateExpiry = new Date(currentTime + 10 * 60 * 1000).getTime();

  const datum = {
    cert_utxo: utxoDatum(providerUtxo.txHash, providerUtxo.outputIndex),
    expires_in: BigInt(certificateExpiry),
    provider_key: providerPubKeyHash,
    value: new Map([valueDatum("lovelace", 2000000n)]),
  };
  let totLovelaceRewardUtxo = inputRewardUtxo.assets.lovelace;

  let outRewardUtxoAsset = {
    ...inputRewardUtxo.assets,
    lovelace: totLovelaceRewardUtxo - 2000000n,
  };

  const parsedDatum = Data.to(datum, RewardCertificate);
  const dtmHash = lucid.utils.datumToHash(parsedDatum);
  certSig = null;
  const redeemer = RewardReedemer.Signed(dtmHash, certSig);

  console.log("Building TX ...");
  const tx = await lucid
    .newTx()
    .collectFrom([providerUtxo])
    .collectFrom([inputRewardUtxo], Data.to(redeemer))
    .addSignerKey(providerPubKeyHash)
    .attachSpendingValidator(validator)
    .payToContract(validatorAddr, parsedDatum, outRewardUtxoAsset)
    .validTo(certificateExpiry)
    .complete();

  console.log("Signing TX ...");
  const signedTx = await tx.sign().complete();

  console.log("Submiting TX ...");
  return await signedTx.submit();
}

// Reclaim many utxo by owner
export async function reclaimReward({ owner_addr }, validator) {
  const lucid = await walletWithProvider(blockfrostProvider());
  const validatorAddr = lucid.utils.validatorToAddress(validator);
  let ownerPubKeyHash =
    lucid.utils.getAddressDetails(owner_addr).paymentCredential.hash;

  console.log(`Fetching UTXO At Reward Contract: ${validatorAddr}`);
  const rewardUtxos = await lucid.utxosAt(validatorAddr);
  if (rewardUtxos === []) throw `No UTXO Found at Reward Contract`;

  const utxoWithTotalValue = rewardUtxos.reduce((prevUtxo, currentUtxo) => {
    return { ...currentUtxo, assets: mergeUtxoValue(prevUtxo, currentUtxo) };
  });

  const redeemer = RewardReedemer.Null();

  console.log("Building TX ...");
  const tx = await lucid
    .newTx()
    .collectFrom(rewardUtxos, Data.to(redeemer))
    .attachSpendingValidator(validator)
    .addSignerKey(ownerPubKeyHash)
    .payToContract(validatorAddr, Data.void(), utxoWithTotalValue.assets)
    .complete();

  console.log("Signing TX ...");
  const signedTx = await tx.sign().complete();

  console.log("Submiting TX ...");
  return await signedTx.submit();
}
