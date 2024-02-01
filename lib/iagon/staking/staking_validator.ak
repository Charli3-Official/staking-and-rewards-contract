use aiken/builtin
use aiken/dict.{Dict}
use aiken/hash.{Blake2b_256, Hash}
use aiken/list
use aiken/transaction.{DatumHash, Output, OutputReference, ScriptContext} as tx
use aiken/transaction/credential.{Address, Signature, VerificationKey}
use aiken/transaction/value.{AssetName, PolicyId, Value}
use iagon/helpers
use iagon/types.{POSIXTime, PubKeyHash}

pub type StakingCertificate {
  // UTXO to include in input to prevent reply attack
  cert_utxo: OutputReference,
  // Certificate Expiry date
  expires_in: POSIXTime,
  // Output Staking Must lock until Needed for Retire & Resize
  stk_utxo_lock_until: Option<POSIXTime>,
  // Value to updated staking contract
  value: Value,
}

pub type Msg =
  ByteArray

pub type StakeDatum {
  // pubkey hash of storage provider
  provider_key: PubKeyHash,
  // Token that is being staked
  token: (PolicyId, AssetName),
  // Time until when token is locked in contract
  locked_until: POSIXTime,
  // State of contract
  state: StakingState,
  // Certificate signed by Operator
  cert: Option<StakingCertificate>,
}

pub type StakingState {
  //Active mode which can be Retired 
  Active
  // Retiring mode which can be withdrawn
  Retiring
}

pub type StakingRedeemer {
  // Request to withdraw funds
  Retire(Msg, Signature)
  // Withdraw fund from contract
  Withdraw(Msg, Signature)
  // 
  Resize(Msg, Signature)
}

pub fn validate_staking(
  operator_vkey: VerificationKey,
  penalty_addr: Address,
  datum: StakeDatum,
  redeemer: StakingRedeemer,
  ctx: ScriptContext,
) -> Bool {
  let (tkn_policy_id, tkn_asset_name) = datum.token
  // Transaction must be signed by provider
  expect helpers.must_be_signed_by(ctx.transaction, datum.provider_key)
  expect Some(o_input) = helpers.get_own_input(ctx)
  // checks if there is only one input utxo being passed at Staking Script
  expect [own_input] = helpers.list_own_inputs(ctx, o_input.output.address)
  // Find exact token in passed in input
  let input_tkn_qty =
    value.quantity_of(own_input.output.value, tkn_policy_id, tkn_asset_name)

  // list of output utxo to same contract address
  let own_outputs = helpers.list_continuing_outputs(ctx, o_input)
  // message & signature to verify
  let (msg, sig) = msg_and_signature(redeemer)
  expect builtin.verify_ed25519_signature(operator_vkey, msg, sig)
  // output datum  which matches with certificate
  let output_stake_datum =
    find_stake_datum(ctx.transaction.outputs, ctx.transaction.datums, msg)
  expect Some(certificate) = output_stake_datum.cert

  verify_certificate(certificate, ctx) && when redeemer is {
    Retire(_, _) -> {
      expect [own_output] = own_outputs
      let valid_token_qty =
        value.quantity_of(own_output.value, tkn_policy_id, tkn_asset_name) == input_tkn_qty

      let is_retiring_after_staking_unlock =
        helpers.is_tx_after(ctx.transaction.validity_range, datum.locked_until)

      let signed_datum_belongs_to_own_output =
        valid_output_datum(own_output, msg)

      is_retiring_after_staking_unlock && valid_token_qty && signed_datum_belongs_to_own_output && validate_stake_locked_until_with_certificate(
        certificate.stk_utxo_lock_until,
        output_stake_datum.locked_until,
      ) && validate_retire_datum_transition(datum, output_stake_datum)
    }

    Withdraw(_, _) -> {
      let cert_tkn_qty =
        value.quantity_of(certificate.value, tkn_policy_id, tkn_asset_name)

      let withdrawing_after_retired =
        helpers.is_tx_after(ctx.transaction.validity_range, datum.locked_until)

      withdrawing_after_retired && datum.state == Retiring && check_penalty_amount(
        ctx.transaction.outputs,
        input_tkn_qty,
        cert_tkn_qty,
        tkn_policy_id,
        tkn_asset_name,
        penalty_addr,
      )
    }

    Resize(_, _) -> {
      expect [own_output] = own_outputs
      let cert_tkn_qty =
        value.quantity_of(certificate.value, tkn_policy_id, tkn_asset_name)
      let op_qty =
        value.quantity_of(own_output.value, tkn_policy_id, tkn_asset_name)

      let is_resize_to_bigger_stake = op_qty > input_tkn_qty
      let resize_value_must_be_same_as_cert = op_qty == cert_tkn_qty

      resize_value_must_be_same_as_cert && is_resize_to_bigger_stake && valid_output_datum(
        own_output,
        msg,
      ) && validate_resize_datum_transition(datum, output_stake_datum) && validate_stake_locked_until_with_certificate(
        certificate.stk_utxo_lock_until,
        output_stake_datum.locked_until,
      )
    }
  }
}

fn validate_retire_datum_transition(
  in_datum: StakeDatum,
  out_datum: StakeDatum,
) -> Bool {
  in_datum.provider_key == out_datum.provider_key && in_datum.token == out_datum.token && in_datum.state == Active && out_datum.state == Retiring
}

fn validate_resize_datum_transition(
  in_datum: StakeDatum,
  out_datum: StakeDatum,
) -> Bool {
  in_datum.provider_key == out_datum.provider_key && out_datum.token == in_datum.token && in_datum.state == Active && out_datum.state == Active
}

fn validate_stake_locked_until_with_certificate(
  cert_locked_until: Option<POSIXTime>,
  out_datum_locked_until: POSIXTime,
) -> Bool {
  cert_locked_until == Some(out_datum_locked_until)
}

fn check_penalty_amount(
  outputs: List<Output>,
  input_amount: Int,
  cert_amount: Int,
  policy_id: PolicyId,
  asset_name: AssetName,
  penalty_addr: Address,
) -> Bool {
  if input_amount == cert_amount {
    True
  } else {
    expect Some(pentalty_output) =
      list.find(outputs, fn(o) { o.address == penalty_addr })

    let penalty_op_qty =
      value.quantity_of(pentalty_output.value, policy_id, asset_name)

    penalty_op_qty > 0 && penalty_op_qty >= input_amount - cert_amount
  }
}

fn find_stake_datum(
  outputs: List<Output>,
  datums: Dict<Hash<Blake2b_256, Data>, Data>,
  dtm_hash: ByteArray,
) -> StakeDatum {
  expect Some(dta) = tx.find_datum(outputs, datums, dtm_hash)
  expect stk_datum: StakeDatum = dta
  stk_datum
}

fn msg_and_signature(redeemer: StakingRedeemer) -> (Msg, Signature) {
  when redeemer is {
    Retire(m, s) -> (m, s)
    Withdraw(m, s) -> (m, s)
    Resize(m, s) -> (m, s)
  }
}

fn valid_output_datum(output: Output, dtm_hash: ByteArray) -> Bool {
  when output.datum is {
    DatumHash(hash) -> hash == dtm_hash
    _ -> False
  }
}

fn verify_certificate(cert: StakingCertificate, ctx: ScriptContext) -> Bool {
  expect Some(_) = tx.find_input(ctx.transaction.inputs, cert.cert_utxo)
  helpers.is_tx_before(ctx.transaction.validity_range, cert.expires_in)
}
