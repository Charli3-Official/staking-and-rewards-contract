import { Constr, toHex, Data, applyParamsToScript } from "lucid-cardano";
import { PLUTUS_BLUEPRINT } from "../../blueprint.js";
import { addressDatum } from "../../data_helper.js";

export function stakingValidator(operator_vkey, addr) {
  const validator = PLUTUS_BLUEPRINT.validators.find(
    ({ title }) => title == "staking.stake",
  );
  return {
    type: "PlutusV2",
    script: applyParamsToScript(validator.compiledCode, [
      toHex(operator_vkey),
      addressDatum(addr),
    ]),
  };
}

export const StakingState = {
  active: new Constr(0, []),
  retiring: new Constr(1, []),
};

export const Certificate = Data.Object({
  cert_utxo: Data.Any(),
  expires_in: Data.Integer(),
  stk_utxo_lock_until: Data.Nullable(Data.Integer()),
  value: Data.Map(Data.Bytes(), Data.Map(Data.Bytes(), Data.Integer())),
});

export const StakeDatum = Data.Object({
  provider_key: Data.Bytes(),
  token: Data.Any(),
  locked_until: Data.Integer(),
  state: Data.Any(),
  cert: Data.Nullable(Certificate),
});

export const Reedemer = {
  retire: function (msg, sig) {
    return new Constr(0, [msg, sig]);
  },
  withdraw: function (msg, sig) {
    return new Constr(1, [msg, sig]);
  },
  resize: function (msg, sig) {
    return new Constr(2, [msg, sig]);
  },
};

export async function to_stake_datum(json_data) {
  return Data.to(json_data, StakeDatum);
}
