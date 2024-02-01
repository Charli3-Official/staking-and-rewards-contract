use aiken/builtin
use aiken/bytearray
use aiken/cbor
use aiken/transaction.{OutputReference, ScriptContext, TransactionId} as tx
use aiken/transaction/credential.{Address, VerificationKey}
use aiken/transaction/value
use iagon/staking/staking_validator.{
  Active, Resize, Retire, Retiring, StakeDatum, StakingCertificate,
  StakingRedeemer, Withdraw,
} as stk_validator

/// Staking Validator is parameterized by 
/// 1. operator VerificationKey 
/// 2. penalty address
/// 
/// Operator Verification key is used to verify certificate & Penalty address is address where
/// Remaining funds are sent which was charged from provider just in case some adversary activities 
/// is done by storage provider.
/// Storage provider information is  only available offchain. when performing actions one of our 
/// Backend system signs and generate certificate calculating valid amount
///
/// Redeemer Actions.
/// 1. Retire
/// 2. Withdraw
/// 3. Resize
///
/// 1. Retire
/// Withdrawing from smart contract is two step process. first step is to request withdraw which will retire 
/// provider node. Fund will be further locked up for time defined in certificate. This is needed to make sure
/// every data is backed up from provider node. If node is shutdown before this timeframe penalty is charged 
/// from staking funds.
/// 
/// 2. Withdraw
/// After staking is retired & lockup period is over storage provider can withdraw funds from contract.
/// Any penalty funds goes to penalty address defined in contract parameters
///
/// 3. Resize
/// Provider can always increase storage. When doing so he will also want to increase staking.
/// Provider are allowed to increase stake if value is more then previous & current stake state is
/// in Active mode.
///
/// Note: For all of this action certificate needs to be signed
/// from operator.
validator(operator_vkey: VerificationKey, penalty_addr: Address) {
  fn stake(datum: StakeDatum, redeemer: StakingRedeemer, ctx: ScriptContext) {
    stk_validator.validate_staking(
      operator_vkey,
      penalty_addr,
      datum,
      redeemer,
      ctx,
    )
  }
}

test check_datum_cbor_without_cert() {
  let pub_key = #"e14edd775467a4e7bac7e98ce2fbb89157ab1dce924f30bea752cce3"
  let datum_without_cert =
    StakeDatum {
      provider_key: pub_key,
      locked_until: 123456,
      token: (#"", #""),
      state: Active,
      cert: None,
    }

  let dtm = datum_without_cert |> cbor.serialise()
  bytearray.to_hex(dtm) == @"d8799f581ce14edd775467a4e7bac7e98ce2fbb89157ab1dce924f30bea752cce39f4040ff1a0001e240d87980d87a80ff"
}

test check_staking_cbor_certificate_datum() {
  let cert =
    StakingCertificate {
      cert_utxo: OutputReference {
        transaction_id: TransactionId {
          hash: #"768f32a1a557789b745688f3adb7ee33b4db47e6a4977ca3b070edea15f7b4b5",
        },
        output_index: 0,
      },
      expires_in: 1697082696292,
      stk_utxo_lock_until: Some(1697082696292),
      value: value.from_lovelace(1000000),
    }

  let dtm = cbor.serialise(cert)
  bytearray.to_hex(dtm) == @"d8799fd8799fd8799f5820768f32a1a557789b745688f3adb7ee33b4db47e6a4977ca3b070edea15f7b4b5ff00ff1b0000018b2202e264d8799f1b0000018b2202e264ffa140a1401a000f4240ff"
}

// Testing Serialization of CBOR for datum and Redeemer
test check_stake_datum_with_cert() {
  let cert =
    StakingCertificate {
      cert_utxo: OutputReference {
        transaction_id: TransactionId {
          hash: #"768f32a1a557789b745688f3adb7ee33b4db47e6a4977ca3b070edea15f7b4b5",
        },
        output_index: 0,
      },
      expires_in: 1697082696292,
      stk_utxo_lock_until: Some(1697082696292),
      value: value.from_lovelace(1000000),
    }

  let datum_with_cert =
    StakeDatum {
      provider_key: #"e14edd775467a4e7bac7e98ce2fbb89157ab1dce924f30bea752cce3",
      locked_until: 123456,
      token: (#"", #""),
      state: Retiring,
      cert: Some(cert),
    }

  let dtm = cbor.serialise(datum_with_cert)
  bytearray.to_hex(dtm) == @"d8799f581ce14edd775467a4e7bac7e98ce2fbb89157ab1dce924f30bea752cce39f4040ff1a0001e240d87a80d8799fd8799fd8799fd8799f5820768f32a1a557789b745688f3adb7ee33b4db47e6a4977ca3b070edea15f7b4b5ff00ff1b0000018b2202e264d8799f1b0000018b2202e264ffa140a1401a000f4240ffffff"
}

test check_redeemer_cbor() {
  let msg = bytearray.from_string(@"msg")
  let sig = bytearray.from_string(@"sig")
  let retire = cbor.serialise(Retire(msg, sig))
  let withdraw = cbor.serialise(Withdraw(msg, sig))
  let resize = cbor.serialise(Resize(msg, sig))

  bytearray.to_hex(retire) == @"d8799f436d736743736967ff" && bytearray.to_hex(
    withdraw,
  ) == @"d87a9f436d736743736967ff" && bytearray.to_hex(resize) == @"d87b9f436d736743736967ff"
}

test check_signature() {
  let msg = #"6d736731"
  let sig =
    #"6c4aff67b24ce95e40fee9071b66dc9cc296c13524687e23ffa98f6d5ec0d76d8faf0b53015ce2d04a0b44cd58007879847ed0b8a661be4faceff59e24d94b0d"
  let v_key =
    #"5ed4e781bef7635ac63e9672a779f80245f9c98d7f68fcdebcfec207442cb140"

  builtin.verify_ed25519_signature(v_key, msg, sig)
}
