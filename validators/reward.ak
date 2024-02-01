use aiken/builtin
use aiken/bytearray
use aiken/cbor
use aiken/dict.{Dict}
use aiken/hash.{Blake2b_256, Hash}
use aiken/transaction.{
  DatumHash, Input, NoDatum, Output, OutputReference, ScriptContext, Spend,
  TransactionId,
} as tx
use aiken/transaction/credential.{Signature, VerificationKey}
use aiken/transaction/value.{Value}
use iagon/helpers
use iagon/test_utils as t_utils
use iagon/types.{POSIXTime, PubKeyHash}

type RewardCertificate {
  // UTXO to include in input to prevent reply attack
  cert_utxo: OutputReference,
  // Certificate Expiry date
  expires_in: POSIXTime,
  // Provider PubKey 
  provider_key: PubKeyHash,
  // Value being Rewarded to Provider
  value: Value,
}

type Redeemer =
  (ByteArray, Signature)

/// Reward Validator is parameterized by 
/// 1. operator_vkey     (Verification Key of operator which generates certificate)
/// 2. owner_pubkey_hash (Owner who will fund value to Reward contract)
///
///
/// Storage Providers at Iagon will receive reward based on their performance, speed & 
/// amount of Storage allocated. All of this information is available offchain.
/// When any provider wants to withdraw some reward from contract he will first request certificate
/// from operator signing server.
/// Then he will use that certificate signed by operator to claim reward from contract
///
/// Owner of reward contract can also claim without having to sign by operator. 
/// This is needed because
/// 1. We might put wrong value in operator_vkey and funds are locked forever. 
/// 2. By many Claims from provider we might endup with dust utxos. 
///    Therefore we might want to adjust Reward Utxos as we need them
/// 
validator(operator_vkey: VerificationKey, owner_pubkey_hash: PubKeyHash) {
  fn reward(_datum, redeemer: Option<Redeemer>, ctx: ScriptContext) {
    when redeemer is {
      // Provider is trying to claim Reward
      Some((msg, sig)) ->
        validate_reward_for_provider(operator_vkey, msg, sig, ctx)

      // Owner is trying to reclaim reward from contract
      None -> helpers.must_be_signed_by(ctx.transaction, owner_pubkey_hash)
    }
  }
}

fn find_output_reward_datum(
  outputs: List<Output>,
  datums: Dict<Hash<Blake2b_256, Data>, Data>,
  dtm_hash: ByteArray,
) -> RewardCertificate {
  expect Some(data) = tx.find_datum(outputs, datums, dtm_hash)
  expect reward_cert: RewardCertificate = data
  reward_cert
}

fn validate_reward_for_provider(
  operator_vkey: VerificationKey,
  msg: ByteArray,
  sig: Signature,
  ctx: ScriptContext,
) -> Bool {
  expect Some(o_input) = helpers.get_own_input(ctx)
  // There must be one input to cover total reward. 
  // TODO: Maybe we can allow multiple input from same contract address
  expect [own_input] = helpers.list_own_inputs(ctx, o_input.output.address)

  // There must be atleast one output to same contract address. 
  // any leftover value left after giving to provider will go back to contract
  expect [own_output] = helpers.list_continuing_outputs(ctx, own_input)

  expect builtin.verify_ed25519_signature(operator_vkey, msg, sig)
  let cert = find_output_reward_datum([own_output], ctx.transaction.datums, msg)

  expect Some(_) = tx.find_input(ctx.transaction.inputs, cert.cert_utxo)

  // Value which is only being rewarded to provider
  let total_value_claimed =
    own_output.value
      |> value.negate()
      |> value.merge(own_input.output.value)

  // Value left after rewarding to provider
  let is_valid_output_value = total_value_claimed == cert.value

  helpers.is_tx_before(ctx.transaction.validity_range, cert.expires_in) && helpers.must_be_signed_by(
    ctx.transaction,
    cert.provider_key,
  ) && is_valid_output_value
}

test cannot_claim_more_value_than_defined_in_certificate() {
  let (msg, sig, v_key, addr) = t_utils.msg_sig_vkey_penalty_addr()
  let pub_key = #"e14edd775467a4e7bac7e98ce2fbb89157ab1dce924f30bea752cce3"

  let cert_utxo_ref =
    OutputReference {
      transaction_id: TransactionId {
        hash: #"36e232a1a557789b745688f3adb7ee33b4db47e6a4977ca3b070edea15f7b4b5",
      },
      output_index: 50,
    }

  let cert =
    RewardCertificate {
      cert_utxo: cert_utxo_ref,
      expires_in: 24,
      provider_key: pub_key,
      value: value.from_lovelace(3000000),
    }

  let input_ref =
    OutputReference {
      transaction_id: TransactionId {
        hash: #"9b4b7f51aede070b3ac7794a6e74bd4b33ee7bda3f886547b987755a1a23f867",
      },
      output_index: 6,
    }

  let reward_input_utxo =
    Input {
      output_reference: input_ref,
      output: Output {
        address: credential.from_script(#""),
        value: value.from_lovelace(20000000),
        datum: NoDatum,
        reference_script: None,
      },
    }

  let cert_utxo =
    Input {
      output_reference: cert_utxo_ref,
      output: Output {
        address: addr,
        value: value.from_lovelace(100),
        datum: NoDatum,
        reference_script: None,
      },
    }

  // trying to claim 5 ADA from Reward 
  // though certificate only allowing 3 ADA 
  let reward_output =
    Output {
      address: credential.from_script(#""),
      value: value.from_lovelace(15000000),
      datum: DatumHash(msg),
      reference_script: None,
    }

  let provider_output =
    Output {
      address: addr,
      value: value.from_lovelace(5000000),
      datum: NoDatum,
      reference_script: None,
    }

  let tx =
    t_utils.init_tx()
      |> t_utils.put_inputs([reward_input_utxo, cert_utxo])
      |> t_utils.put_outputs([reward_output, provider_output])
      |> t_utils.add_witness(pub_key)
      |> t_utils.tx_valid_until(20)
      |> t_utils.push_datums(msg, cert)

  let ctx =
    t_utils.init_ctx()
      |> t_utils.put_purpose(Spend(input_ref))
      |> t_utils.put_tx(tx)

  validate_reward_for_provider(v_key, msg, sig, ctx) == False
}

test cannot_claim_reward_if_certificate_is_expired() {
  let (msg, sig, v_key, addr) = t_utils.msg_sig_vkey_penalty_addr()
  let pub_key = #"e14edd775467a4e7bac7e98ce2fbb89157ab1dce924f30bea752cce3"

  let cert_utxo_ref =
    OutputReference {
      transaction_id: TransactionId {
        hash: #"36e232a1a557789b745688f3adb7ee33b4db47e6a4977ca3b070edea15f7b4b5",
      },
      output_index: 50,
    }

  let cert =
    RewardCertificate {
      cert_utxo: cert_utxo_ref,
      expires_in: 24,
      provider_key: pub_key,
      value: value.from_lovelace(3000000),
    }

  let input_ref =
    OutputReference {
      transaction_id: TransactionId {
        hash: #"9b4b7f51aede070b3ac7794a6e74bd4b33ee7bda3f886547b987755a1a23f867",
      },
      output_index: 6,
    }

  let reward_input_utxo =
    Input {
      output_reference: input_ref,
      output: Output {
        address: credential.from_script(#""),
        value: value.from_lovelace(20000000),
        datum: NoDatum,
        reference_script: None,
      },
    }

  let cert_utxo =
    Input {
      output_reference: cert_utxo_ref,
      output: Output {
        address: addr,
        value: value.from_lovelace(100),
        datum: NoDatum,
        reference_script: None,
      },
    }

  // Claiming 3 ADA 
  let reward_output =
    Output {
      address: credential.from_script(#""),
      value: value.from_lovelace(17000000),
      datum: DatumHash(msg),
      reference_script: None,
    }

  let provider_output =
    Output {
      address: addr,
      value: value.from_lovelace(3000000),
      datum: NoDatum,
      reference_script: None,
    }

  let tx =
    t_utils.init_tx()
      |> t_utils.put_inputs([reward_input_utxo, cert_utxo])
      |> t_utils.put_outputs([reward_output, provider_output])
      |> t_utils.add_witness(pub_key)
      |> t_utils.tx_valid_until(25) // tx after cert is expired
      |> t_utils.push_datums(msg, cert)

  let ctx =
    t_utils.init_ctx()
      |> t_utils.put_purpose(Spend(input_ref))
      |> t_utils.put_tx(tx)

  validate_reward_for_provider(v_key, msg, sig, ctx) == False
}

test cannot_claim_if_not_signed_by_provider() {
  let (msg, sig, v_key, addr) = t_utils.msg_sig_vkey_penalty_addr()
  let pub_key = #"e14edd775467a4e7bac7e98ce2fbb89157ab1dce924f30bea752cce3"

  let cert_utxo_ref =
    OutputReference {
      transaction_id: TransactionId {
        hash: #"36e232a1a557789b745688f3adb7ee33b4db47e6a4977ca3b070edea15f7b4b5",
      },
      output_index: 50,
    }

  let cert =
    RewardCertificate {
      cert_utxo: cert_utxo_ref,
      expires_in: 24,
      provider_key: pub_key,
      value: value.from_lovelace(3000000),
    }

  let input_ref =
    OutputReference {
      transaction_id: TransactionId {
        hash: #"9b4b7f51aede070b3ac7794a6e74bd4b33ee7bda3f886547b987755a1a23f867",
      },
      output_index: 6,
    }

  let reward_input_utxo =
    Input {
      output_reference: input_ref,
      output: Output {
        address: credential.from_script(#""),
        value: value.from_lovelace(20000000),
        datum: NoDatum,
        reference_script: None,
      },
    }

  let cert_utxo =
    Input {
      output_reference: cert_utxo_ref,
      output: Output {
        address: addr,
        value: value.from_lovelace(100),
        datum: NoDatum,
        reference_script: None,
      },
    }

  // Claiming 3 ADA 
  let reward_output =
    Output {
      address: credential.from_script(#""),
      value: value.from_lovelace(17000000),
      datum: DatumHash(msg),
      reference_script: None,
    }

  let provider_output =
    Output {
      address: addr,
      value: value.from_lovelace(3000000),
      datum: NoDatum,
      reference_script: None,
    }

  let tx =
    t_utils.init_tx()
      |> t_utils.put_inputs([reward_input_utxo, cert_utxo])
      |> t_utils.put_outputs([reward_output, provider_output])
      |> t_utils.tx_valid_until(20)
      |> t_utils.push_datums(msg, cert)

  let ctx =
    t_utils.init_ctx()
      |> t_utils.put_purpose(Spend(input_ref))
      |> t_utils.put_tx(tx)

  validate_reward_for_provider(v_key, msg, sig, ctx) == False
}

test provider_can_claim_with_correct_value_and_certificate() {
  let (msg, sig, v_key, addr) = t_utils.msg_sig_vkey_penalty_addr()
  let pub_key = #"e14edd775467a4e7bac7e98ce2fbb89157ab1dce924f30bea752cce3"

  let cert_utxo_ref =
    OutputReference {
      transaction_id: TransactionId {
        hash: #"36e232a1a557789b745688f3adb7ee33b4db47e6a4977ca3b070edea15f7b4b5",
      },
      output_index: 50,
    }

  let cert =
    RewardCertificate {
      cert_utxo: cert_utxo_ref,
      expires_in: 24,
      provider_key: pub_key,
      value: value.from_lovelace(3000000),
    }

  let input_ref =
    OutputReference {
      transaction_id: TransactionId {
        hash: #"9b4b7f51aede070b3ac7794a6e74bd4b33ee7bda3f886547b987755a1a23f867",
      },
      output_index: 6,
    }

  let reward_input_utxo =
    Input {
      output_reference: input_ref,
      output: Output {
        address: credential.from_script(#""),
        value: value.from_lovelace(20000000),
        datum: NoDatum,
        reference_script: None,
      },
    }

  let cert_utxo =
    Input {
      output_reference: cert_utxo_ref,
      output: Output {
        address: addr,
        value: value.from_lovelace(100),
        datum: NoDatum,
        reference_script: None,
      },
    }

  // Claiming 3 ADA 
  let reward_output =
    Output {
      address: credential.from_script(#""),
      value: value.from_lovelace(17000000),
      datum: DatumHash(msg),
      reference_script: None,
    }

  let provider_output =
    Output {
      address: addr,
      value: value.from_lovelace(3000000),
      datum: NoDatum,
      reference_script: None,
    }

  let tx =
    t_utils.init_tx()
      |> t_utils.put_inputs([reward_input_utxo, cert_utxo])
      |> t_utils.put_outputs([reward_output, provider_output])
      |> t_utils.add_witness(pub_key)
      |> t_utils.tx_valid_until(20)
      |> t_utils.push_datums(msg, cert)

  let ctx =
    t_utils.init_ctx()
      |> t_utils.put_purpose(Spend(input_ref))
      |> t_utils.put_tx(tx)

  validate_reward_for_provider(v_key, msg, sig, ctx) == True
}

// Parsing datum test

test reward_certificate_datum_test() {
  let pub_key = #"e14edd775467a4e7bac7e98ce2fbb89157ab1dce924f30bea752cce3"
  let reward_cert =
    RewardCertificate {
      cert_utxo: OutputReference {
        transaction_id: tx.TransactionId {
          hash: #"768f32a1a557789b745688f3adb7ee33b4db47e6a4977ca3b070edea15f7b4b5",
        },
        output_index: 0,
      },
      expires_in: 1697082696292,
      value: value.from_lovelace(1000000),
      provider_key: pub_key,
    }
  let dtm = cbor.serialise(reward_cert)
  bytearray.to_hex(dtm) == @"d8799fd8799fd8799f5820768f32a1a557789b745688f3adb7ee33b4db47e6a4977ca3b070edea15f7b4b5ff00ff1b0000018b2202e264581ce14edd775467a4e7bac7e98ce2fbb89157ab1dce924f30bea752cce3a140a1401a000f4240ff"
}

test reward_redeemer_datum_test() {
  let msg = bytearray.from_string(@"msg")
  let sig = bytearray.from_string(@"sig")
  let redeemer = cbor.serialise(Some((msg, sig)))
  let none_redeemer = cbor.serialise(None)

  bytearray.to_hex(redeemer) == @"d8799f9f436d736743736967ffff" && bytearray.to_hex(
    none_redeemer,
  ) == @"d87a80"
}
