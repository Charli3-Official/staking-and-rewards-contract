use aiken/bytearray
use aiken/dict
use aiken/hash.{Blake2b_224, Blake2b_256, Hash}
use aiken/interval.{Finite, Interval, IntervalBound, PositiveInfinity}
use aiken/list
use aiken/time.{PosixTime}
use aiken/transaction.{
  Input, Output, OutputReference, ScriptContext, ScriptPurpose, Spend,
  Transaction, TransactionId,
}
use aiken/transaction/credential.{Address, VerificationKey}
use aiken/transaction/value

pub fn msg_sig_vkey_penalty_addr() -> (ByteArray, ByteArray, ByteArray, Address) {
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

pub fn init_ctx() -> ScriptContext {
  let sample_ref =
    OutputReference {
      transaction_id: TransactionId {
        hash: #"768f32a1a557789b745688f3adb7ee33b4db47e6a4977ca3b070edea15f7b4b5",
      },
      output_index: 0,
    }

  ScriptContext { transaction: init_tx(), purpose: Spend(sample_ref) }
}

pub fn put_tx(ctx: ScriptContext, tx: Transaction) -> ScriptContext {
  ScriptContext { ..ctx, transaction: tx }
}

pub fn put_purpose(ctx: ScriptContext, purpose: ScriptPurpose) -> ScriptContext {
  ScriptContext { ..ctx, purpose: purpose }
}

// Transaction related functions
pub fn init_tx() -> Transaction {
  let v_range: Interval<PosixTime> =
    Interval {
      lower_bound: IntervalBound { bound_type: Finite(1), is_inclusive: False },
      upper_bound: IntervalBound {
        bound_type: PositiveInfinity,
        is_inclusive: False,
      },
    }

  Transaction {
    inputs: [],
    reference_inputs: [],
    outputs: [],
    fee: value.from_lovelace(1000000),
    mint: value.zero() |> value.to_minted_value(),
    certificates: [],
    withdrawals: dict.new(),
    validity_range: v_range,
    extra_signatories: [],
    redeemers: dict.new(),
    datums: dict.new(),
    id: TransactionId {
      hash: #"868f32a1a557789b745688f3adb7ee33b4db47e6a4977ca3b070edea15f7b4b5",
    },
  }
}

pub fn tx_valid_from(tx: Transaction, time: PosixTime) -> Transaction {
  let new_validity_range =
    Interval {
      ..tx.validity_range,
      lower_bound: IntervalBound {
        bound_type: Finite(time),
        is_inclusive: False,
      },
    }

  Transaction { ..tx, validity_range: new_validity_range }
}

pub fn tx_valid_until(tx: Transaction, time: PosixTime) -> Transaction {
  let new_validity_range =
    Interval {
      ..tx.validity_range,
      upper_bound: IntervalBound {
        bound_type: Finite(time),
        is_inclusive: False,
      },
    }

  Transaction { ..tx, validity_range: new_validity_range }
}

pub fn push_datums(
  tx: Transaction,
  key: Hash<Blake2b_256, Data>,
  value: Data,
) -> Transaction {
  Transaction {
    ..tx,
    datums: dict.insert(tx.datums, key, value, compare: bytearray.compare),
  }
}

pub fn put_inputs(tx: Transaction, inputs: List<Input>) -> Transaction {
  Transaction { ..tx, inputs: inputs }
}

pub fn put_outputs(tx: Transaction, outputs: List<Output>) -> Transaction {
  Transaction { ..tx, outputs: outputs }
}

pub fn add_witness(
  tx: Transaction,
  witness: Hash<Blake2b_224, VerificationKey>,
) -> Transaction {
  let new_witness = tx.extra_signatories |> list.push(witness)

  Transaction { ..tx, extra_signatories: new_witness }
}
