use aiken/interval.{Finite}
use aiken/list
use aiken/transaction.{
  Input, Output, ScriptContext, Spend, Transaction, ValidityRange,
}
use aiken/transaction/credential.{Address}
use aiken/transaction/value.{Value}
use iagon/types.{POSIXTime, PubKeyHash}

pub fn get_own_input(ctx: ScriptContext) -> Option<Input> {
  when ctx.purpose is {
    Spend(op_ref) -> transaction.find_input(ctx.transaction.inputs, op_ref)
    _ -> None
  }
}

pub fn list_own_inputs(ctx: ScriptContext, own_addr: Address) -> List<Input> {
  list.filter(ctx.transaction.inputs, fn(i) { i.output.address == own_addr })
}

pub fn list_continuing_outputs(
  ctx: ScriptContext,
  own_input: Input,
) -> List<Output> {
  list.filter(
    ctx.transaction.outputs,
    fn(o) { o.address == own_input.output.address },
  )
}

pub fn get_own_address(ctx: ScriptContext) -> Option<Address> {
  when get_own_input(ctx) is {
    Some(input) -> Some(input.output.address)
    _ -> None
  }
}

pub fn must_be_signed_by(tx: Transaction, key: PubKeyHash) -> Bool {
  list.any(tx.extra_signatories, fn(s) { s == key })
}

pub fn is_tx_before(range: ValidityRange, time: POSIXTime) -> Bool {
  when range.upper_bound.bound_type is {
    Finite(tx_final_time) -> tx_final_time <= time
    _ -> False
  }
}

pub fn is_tx_after(range: ValidityRange, time: POSIXTime) -> Bool {
  when range.lower_bound.bound_type is {
    Finite(tx_earliest_time) -> time <= tx_earliest_time
    _ -> False
  }
}

// returns value which is only present in left
pub fn intersecting_value(left: Value, right: Value) -> Value {
  let flaten_value =
    value.flatten_with(
      left,
      fn(pid, asset, _qty) {
        let rht_qty = value.quantity_of(right, pid, asset)
        if rht_qty > 0 {
          Some(value.from_asset(pid, asset, rht_qty))
        } else {
          None
        }
      },
    )

  list.foldl(flaten_value, value.zero(), fn(v, vs) { value.merge(vs, v) })
}

test intersecting_value_returns_only_value_with_asset_in_left() {
  let left_value =
    value.zero()
      |> value.merge(value.from_asset(#"00", #"", 10))
      |> value.merge(value.from_asset(#"01", #"", 5))
      |> value.merge(value.from_asset(#"02", #"", 10))

  let right_value =
    value.zero()
      |> value.merge(value.from_asset(#"00", #"", 1))
      |> value.merge(value.from_asset(#"02", #"", 1))
      |> value.merge(value.from_asset(#"06", #"", 1))

  let expected_value =
    value.zero()
      |> value.merge(value.from_asset(#"00", #"", 1))
      |> value.merge(value.from_asset(#"02", #"", 1))

  intersecting_value(left_value, right_value) == expected_value
}

// Check if all value is positive
pub fn is_positive_value(v: Value) -> Bool {
  value.flatten(v)
    |> list.all(
         fn(asset_with_qty) {
           let (_, _, qty) = asset_with_qty
           qty >= 0
         },
       )
}
