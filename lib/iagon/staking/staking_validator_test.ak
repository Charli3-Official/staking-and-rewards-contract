use aiken/cbor
use aiken/transaction.{
  DatumHash, Input, NoDatum, Output, OutputReference, ScriptContext, Spend,
  TransactionId,
} as tx
use aiken/transaction/credential.{Address}
use aiken/transaction/value
use iagon/staking/staking_validator.{
  Active, Resize, Retire, Retiring, StakeDatum, StakingCertificate, StakingState,
  Withdraw,
}
use iagon/test_utils as t_utils
use iagon/types.{POSIXTime, PubKeyHash}

type StakingTestInfo {
  in_dtm: StakeDatum,
  in_dtm_data: Data,
  out_dtm: StakeDatum,
  out_dtm_data: Data,
  pub_key: PubKeyHash,
}

// returns precomputed msg, signature ,  VerificationKey & Penalty Address
fn get_msg_sig_vkey_and_penalty_addr() -> (
  ByteArray,
  ByteArray,
  ByteArray,
  Address,
) {
  let msg = #"6d736731"
  let sig =
    #"6c4aff67b24ce95e40fee9071b66dc9cc296c13524687e23ffa98f6d5ec0d76d8faf0b53015ce2d04a0b44cd58007879847ed0b8a661be4faceff59e24d94b0d"

  let v_key =
    #"5ed4e781bef7635ac63e9672a779f80245f9c98d7f68fcdebcfec207442cb140"

  let penalty_addr =
    credential.from_verification_key(
      #"8ec43781bef7635ac63e9672a779f80245f9c98d7f68fcdebcfec207442cb140",
    )

  (msg, sig, v_key, penalty_addr)
}

fn prepare_test_info(
  in_locked_until: POSIXTime,
  out_locked_until: POSIXTime,
  in_stk_state: StakingState,
  out_stk_state: StakingState,
  cert: Option<StakingCertificate>,
) -> StakingTestInfo {
  let pub_key = #"e14edd775467a4e7bac7e98ce2fbb89157ab1dce924f30bea752cce3"
  let in_dtm =
    StakeDatum {
      provider_key: pub_key,
      locked_until: in_locked_until,
      token: (#"", #""),
      state: in_stk_state,
      cert: None,
    }

  let out_dtm =
    StakeDatum {
      provider_key: pub_key,
      locked_until: out_locked_until,
      token: (#"", #""),
      state: out_stk_state,
      cert,
    }

  StakingTestInfo {
    in_dtm,
    in_dtm_data: cbor.serialise(in_dtm),
    // We already know signature for this, so using this hash as datum hash in tx
    out_dtm_data: cbor.serialise(out_dtm),
    out_dtm,
    pub_key,
  }
}

fn get_test_info_with_context(
  in_stk_state: StakingState,
  out_stk_state: StakingState,
) -> (ScriptContext, StakingTestInfo) {
  let (msg, _, _, _) = get_msg_sig_vkey_and_penalty_addr()
  let cert_utxo_ref =
    OutputReference {
      transaction_id: TransactionId { hash: #"" },
      output_index: 50,
    }

  let cert =
    StakingCertificate {
      cert_utxo: cert_utxo_ref,
      expires_in: 25,
      stk_utxo_lock_until: Some(30),
      value: value.from_lovelace(5000000),
    }

  let stk_test_info: StakingTestInfo =
    prepare_test_info(10, 30, in_stk_state, out_stk_state, Some(cert))

  let input_op_ref =
    OutputReference {
      transaction_id: TransactionId { hash: #"" },
      output_index: 0,
    }

  let input =
    Input {
      output_reference: input_op_ref,
      output: Output {
        address: credential.from_script(#""),
        value: value.from_lovelace(5000000),
        datum: DatumHash(#""),
        reference_script: None,
      },
    }

  let cert_utxo_input =
    Input {
      output_reference: cert_utxo_ref,
      output: Output {
        address: credential.from_verification_key(
          #"eed7e781bef7635ac63e9672a779f80245f9c98d7f68fcdebcfec207442cb180",
        ),
        value: value.from_lovelace(100),
        datum: NoDatum,
        reference_script: None,
      },
    }

  let output =
    Output {
      address: credential.from_script(#""),
      value: value.from_lovelace(5000000),
      datum: DatumHash(msg),
      reference_script: None,
    }

  let valid_tx =
    t_utils.init_tx()
      |> t_utils.put_inputs([input, cert_utxo_input])
      |> t_utils.put_outputs([output])
      |> t_utils.push_datums(#"", stk_test_info.in_dtm)
      |> t_utils.push_datums(msg, stk_test_info.out_dtm)
      |> t_utils.tx_valid_from(11)
      |> t_utils.tx_valid_until(24)
      |> t_utils.add_witness(stk_test_info.pub_key)

  let ctx =
    t_utils.init_ctx()
      |> t_utils.put_purpose(Spend(input_op_ref))
      |> t_utils.put_tx(valid_tx)

  (ctx, stk_test_info)
}

// Retiring State Tests

test check_retire_before_staking_is_locked() {
  let (msg, sig, v_key, penalty_addr) = get_msg_sig_vkey_and_penalty_addr()
  let (ctx, stk_test_info) = get_test_info_with_context(Active, Retiring)
  let tx_before_locked_until = t_utils.tx_valid_from(ctx.transaction, 9)

  staking_validator.validate_staking(
    v_key,
    penalty_addr,
    stk_test_info.in_dtm,
    Retire(msg, sig),
    t_utils.put_tx(ctx, tx_before_locked_until),
  ) == False
}

test check_retire_after_certificate_is_expired() {
  let (msg, sig, v_key, penalty_addr) = get_msg_sig_vkey_and_penalty_addr()
  let (ctx, stk_test_info) = get_test_info_with_context(Active, Retiring)
  let tx_before_locked_until = t_utils.tx_valid_until(ctx.transaction, 30)

  staking_validator.validate_staking(
    v_key,
    penalty_addr,
    stk_test_info.in_dtm,
    Retire(msg, sig),
    t_utils.put_tx(ctx, tx_before_locked_until),
  ) == False
}

test when_retiring_output_value_must_be_same_as_certificate() {
  let (msg, sig, v_key, penalty_addr) = get_msg_sig_vkey_and_penalty_addr()
  let (ctx, stk_test_info) = get_test_info_with_context(Active, Retiring)
  expect [output] = ctx.transaction.outputs
  let new_output_with_less_value =
    Output { ..output, value: value.from_lovelace(2000000) }

  // Certificate is signed with 5 ADA output value
  let new_tx_with_2_ada_output =
    t_utils.put_outputs(ctx.transaction, [new_output_with_less_value])

  staking_validator.validate_staking(
    v_key,
    penalty_addr,
    stk_test_info.in_dtm,
    Retire(msg, sig),
    t_utils.put_tx(ctx, new_tx_with_2_ada_output),
  ) == False
}

test retiring_is_only_posible_for_staking_with_active_state() {
  let (msg, sig, v_key, penalty_addr) = get_msg_sig_vkey_and_penalty_addr()
  let (ctx, stk_test_info) = get_test_info_with_context(Retiring, Retiring)

  staking_validator.validate_staking(
    v_key,
    penalty_addr,
    stk_test_info.in_dtm,
    Retire(msg, sig),
    ctx,
  ) == False
}

test while_retiring_output_staking_state_must_be_with_retiring_state() {
  let (msg, sig, v_key, penalty_addr) = get_msg_sig_vkey_and_penalty_addr()
  let (ctx, stk_test_info) = get_test_info_with_context(Active, Active)

  staking_validator.validate_staking(
    v_key,
    penalty_addr,
    stk_test_info.in_dtm,
    Retire(msg, sig),
    ctx,
  ) == False
}

test can_retire_with_valid_certificate_and_staking_state() {
  let (msg, sig, v_key, penalty_addr) = get_msg_sig_vkey_and_penalty_addr()
  let (ctx, stk_test_info) = get_test_info_with_context(Active, Retiring)

  staking_validator.validate_staking(
    v_key,
    penalty_addr,
    stk_test_info.in_dtm,
    Retire(msg, sig),
    ctx,
  ) == True
}

test retiring_must_output_same_token_as_its_own_input() {
  let (msg, sig, v_key, penalty_addr) = get_msg_sig_vkey_and_penalty_addr()
  let (ctx, stk_test_info) = get_test_info_with_context(Active, Retiring)

  let dtm =
    StakeDatum {
      ..stk_test_info.out_dtm,
      token: (
        #"43a60f558aa4425f587d43217e0965a9",
        #"283774b0c585126117e981c671f199e0",
      ),
    }

  let new_tx =
    ctx.transaction
      |> t_utils.push_datums(msg, dtm)

  staking_validator.validate_staking(
    v_key,
    penalty_addr,
    stk_test_info.in_dtm,
    Retire(msg, sig),
    t_utils.put_tx(ctx, new_tx),
  ) == False
}

//**************************************************************************************************
//                                       Withdraw Staking Test 
//**************************************************************************************************
//
//
test cannot_withdraw_before_locking_period() {
  let (msg, sig, v_key, penalty_addr) = get_msg_sig_vkey_and_penalty_addr()
  let (ctx, stk_test_info) = get_test_info_with_context(Retiring, Retiring)

  let tx_before_locked_until = t_utils.tx_valid_from(ctx.transaction, 9)

  staking_validator.validate_staking(
    v_key,
    penalty_addr,
    stk_test_info.in_dtm,
    Withdraw(msg, sig),
    t_utils.put_tx(ctx, tx_before_locked_until),
  ) == False
}

test cannot_withdraw_active_staking() {
  let (msg, sig, v_key, penalty_addr) = get_msg_sig_vkey_and_penalty_addr()
  let (ctx, stk_test_info) = get_test_info_with_context(Active, Retiring)
  staking_validator.validate_staking(
    v_key,
    penalty_addr,
    stk_test_info.in_dtm,
    Withdraw(msg, sig),
    ctx,
  ) == False
}

test cannot_withdraw_if_penalty_amount_is_not_paid() fail {
  let (msg, sig, v_key, penalty_addr) = get_msg_sig_vkey_and_penalty_addr()
  let (ctx, stk_test_info) = get_test_info_with_context(Retiring, Retiring)

  expect [output] = ctx.transaction.outputs
  let new_output = Output { ..output, value: value.from_lovelace(8000000) }

  expect [own_input, cert_utxo_input] = ctx.transaction.inputs
  let own_input_op_value =
    Output { ..own_input.output, value: value.from_lovelace(8000000) }
  let updated_own_input = Input { ..own_input, output: own_input_op_value }

  // Certificate is signed with 5 ADA output value
  let new_tx =
    ctx.transaction
      |> t_utils.put_outputs([new_output])
      |> t_utils.put_inputs([updated_own_input, cert_utxo_input])

  staking_validator.validate_staking(
    v_key,
    penalty_addr,
    stk_test_info.in_dtm,
    Withdraw(msg, sig),
    t_utils.put_tx(ctx, new_tx),
  ) == False
}

// Input Value = 5 ADA
// Certificate Value = 5 ADA
test can_withdraw_without_penalty_amount_if_input_amount_is_same_as_cert() {
  let (msg, sig, v_key, penalty_addr) = get_msg_sig_vkey_and_penalty_addr()
  let (ctx, stk_test_info) = get_test_info_with_context(Retiring, Retiring)

  staking_validator.validate_staking(
    v_key,
    penalty_addr,
    stk_test_info.in_dtm,
    Withdraw(msg, sig),
    ctx,
  )
}

// Input Value = 8 ADA
// Certificate Value = 5 ADA
// Penalty Value = 3 ADA
test can_withdraw_if_penalty_is_paid_to_penalty_address() {
  let (msg, sig, v_key, penalty_addr) = get_msg_sig_vkey_and_penalty_addr()
  let (ctx, stk_test_info) = get_test_info_with_context(Retiring, Retiring)

  // 
  expect [output] = ctx.transaction.outputs
  let new_output = Output { ..output, value: value.from_lovelace(5000000) }

  expect [own_input, cert_utxo_input] = ctx.transaction.inputs
  let own_input_op_value =
    Output { ..own_input.output, value: value.from_lovelace(8000000) }
  let updated_own_input = Input { ..own_input, output: own_input_op_value }

  let penalty_output =
    Output {
      address: penalty_addr,
      value: value.from_lovelace(3000000),
      datum: NoDatum,
      reference_script: None,
    }

  let new_tx =
    ctx.transaction
      |> t_utils.put_outputs([new_output, penalty_output])
      |> t_utils.put_inputs([updated_own_input, cert_utxo_input])

  staking_validator.validate_staking(
    v_key,
    penalty_addr,
    stk_test_info.in_dtm,
    Withdraw(msg, sig),
    t_utils.put_tx(ctx, new_tx),
  )
}

//
//**************************************************************************************************
//                                       Resize Staking Test
//**************************************************************************************************
test cannot_resize_for_already_retiring_state() {
  let (msg, sig, v_key, penalty_addr) = get_msg_sig_vkey_and_penalty_addr()
  let (ctx, stk_test_info) = get_test_info_with_context(Retiring, Active)

  staking_validator.validate_staking(
    v_key,
    penalty_addr,
    stk_test_info.in_dtm,
    Resize(msg, sig),
    ctx,
  ) == False
}

test cannot_resize_if_output_is_not_in_active_state() {
  let (msg, sig, v_key, penalty_addr) = get_msg_sig_vkey_and_penalty_addr()
  let (ctx, stk_test_info) = get_test_info_with_context(Retiring, Active)

  staking_validator.validate_staking(
    v_key,
    penalty_addr,
    stk_test_info.in_dtm,
    Resize(msg, sig),
    ctx,
  ) == False
}

// Input Value = 5 ADA
// Certificate Value = 5 ADA
test cannot_resize_with_less_value_than_input() {
  let (msg, sig, v_key, penalty_addr) = get_msg_sig_vkey_and_penalty_addr()
  let (ctx, stk_test_info) = get_test_info_with_context(Active, Active)

  // Try Resizing Stake by decreasing 2 ADA 
  expect [output] = ctx.transaction.outputs
  let new_output = Output { ..output, value: value.from_lovelace(3000000) }
  expect Some(cert) = stk_test_info.out_dtm.cert

  let new_cert =
    StakingCertificate { ..cert, value: value.from_lovelace(3000000) }
  let dtm = StakeDatum { ..stk_test_info.out_dtm, cert: Some(new_cert) }

  let new_tx =
    ctx.transaction
      |> t_utils.put_outputs([new_output])
      |> t_utils.push_datums(msg, dtm)

  staking_validator.validate_staking(
    v_key,
    penalty_addr,
    stk_test_info.in_dtm,
    Resize(msg, sig),
    t_utils.put_tx(ctx, new_tx),
  ) == False
}

test cannot_resize_with_different_token_output() {
  let (msg, sig, v_key, penalty_addr) = get_msg_sig_vkey_and_penalty_addr()
  let (ctx, stk_test_info) = get_test_info_with_context(Active, Active)

  // Try Resizing Stake by increasing  5 ADA 
  expect [output] = ctx.transaction.outputs
  let new_output = Output { ..output, value: value.from_lovelace(10000000) }
  expect Some(cert) = stk_test_info.out_dtm.cert

  let new_cert =
    StakingCertificate { ..cert, value: value.from_lovelace(10000000) }

  let dtm =
    StakeDatum {
      ..stk_test_info.out_dtm,
      cert: Some(new_cert),
      token: (
        #"43a60f558aa4425f587d43217e0965a9",
        #"283774b0c585126117e981c671f199e0",
      ),
    }

  let new_tx =
    ctx.transaction
      |> t_utils.put_outputs([new_output])
      |> t_utils.push_datums(msg, dtm)

  staking_validator.validate_staking(
    v_key,
    penalty_addr,
    stk_test_info.in_dtm,
    Resize(msg, sig),
    t_utils.put_tx(ctx, new_tx),
  ) == False
}

test can_resize_with_valid_value_and_staking_state() {
  let (msg, sig, v_key, penalty_addr) = get_msg_sig_vkey_and_penalty_addr()
  let (ctx, stk_test_info) = get_test_info_with_context(Active, Active)

  // Try Resizing Stake by increasing  5 ADA 
  expect [output] = ctx.transaction.outputs
  let new_output = Output { ..output, value: value.from_lovelace(10000000) }
  expect Some(cert) = stk_test_info.out_dtm.cert

  let new_cert =
    StakingCertificate { ..cert, value: value.from_lovelace(10000000) }

  let dtm = StakeDatum { ..stk_test_info.out_dtm, cert: Some(new_cert) }

  let new_tx =
    ctx.transaction
      |> t_utils.put_outputs([new_output])
      |> t_utils.push_datums(msg, dtm)

  staking_validator.validate_staking(
    v_key,
    penalty_addr,
    stk_test_info.in_dtm,
    Resize(msg, sig),
    t_utils.put_tx(ctx, new_tx),
  )
}
