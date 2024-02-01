import { Data, fromText } from 'lucid-cardano';
import { to_stake_datum, Reedemer, Certificate } from './src/staking/validator';
import { tokenDatum, valueDatum, utxoDatum } from './data_helper'
import { StakingState } from './src/staking/validator'
import { RewardReedemer, to_reward_certificate_datum } from './src/rewards/validator'

const utxoRef = {
    txId: "768f32a1a557789b745688f3adb7ee33b4db47e6a4977ca3b070edea15f7b4b5",
    index: 0
}

const certDatum = {
    cert_utxo: utxoDatum(utxoRef.txId, utxoRef.index),
    expires_in: BigInt(1697082696292),
    stk_utxo_lock_until: BigInt(1697082696292),
    value: new Map([valueDatum("lovelace", 1000000)])
}

const stakeDatumWithoutCert = {
    provider_key: "e14edd775467a4e7bac7e98ce2fbb89157ab1dce924f30bea752cce3",
    token: tokenDatum("", ""),
    locked_until: BigInt(123456),
    state: StakingState.active,
    cert: null
}

const stakeDatumWithCert = {
    provider_key: "e14edd775467a4e7bac7e98ce2fbb89157ab1dce924f30bea752cce3",
    token: tokenDatum("", ""),
    locked_until: BigInt(123456),
    state: StakingState.retiring,
    cert: certDatum
}

export function checkStakingRedeemerCbor() {
    const expectedRetireRedeemerHex = "d8799f436d736743736967ff"
    const parsedRetireRedeemerHex = Data.to(Reedemer.retire(fromText("msg"), fromText("sig")))

    const expectedWithdrawRedeemerHex = "d87a9f436d736743736967ff"
    const parsedWithdrawRedeemerHex = Data.to(Reedemer.withdraw(fromText("msg"), fromText("sig")))

    const expectedResizeRedeemerHex = "d87b9f436d736743736967ff"
    const parsedResizeRedeemerHex = Data.to(Reedemer.resize(fromText("msg"), fromText("sig")))

    if (parsedRetireRedeemerHex != expectedRetireRedeemerHex) {
        throw `Invalid Retire Redeemer \n Expected:  ${expectedRetireRedeemerHex} \n Got ${parsedRetireRedeemerHex}`
    }

    if (parsedWithdrawRedeemerHex != expectedWithdrawRedeemerHex) {
        throw `Invalid Withdraw Redeemer \n Expected:  ${expectedWithdrawRedeemerHex} \n Got ${parsedWithdrawRedeemerHex}`
    }


    if (parsedResizeRedeemerHex != expectedResizeRedeemerHex) {
        throw `Invalid Retire Redeemer \n Expected:  ${expectedResizeRedeemerHex} \n Got ${parsedResizeRedeemerHex}`
    }

    return "Staking Redeemer CBOR : OK"
}

export async function checkStakingCertCbor() {
    const expectedHex = "d8799fd8799fd8799f5820768f32a1a557789b745688f3adb7ee33b4db47e6a4977ca3b070edea15f7b4b5ff00ff1b0000018b2202e264d8799f1b0000018b2202e264ffa140a1401a000f4240ff"
    const parsedDatum = Data.to(certDatum, Certificate);
    if (parsedDatum == expectedHex) {
        return "Staking Certificate Datum:  OK"
    } else {
        throw `Invalid Staking Certificate Datum \n Expected:  ${expectedHex} \n Got: ${parsedDatum}`
    }
}

export async function checkStakingDatumCborWithoutCert() {
    const expectedHex = "d8799f581ce14edd775467a4e7bac7e98ce2fbb89157ab1dce924f30bea752cce39f4040ff1a0001e240d87980d87a80ff"
    const parsedDatum = await to_stake_datum(stakeDatumWithoutCert)
    if (parsedDatum == expectedHex) {
        return "Staking Datum without Cert:  OK"
    } else {
        throw `Invalid Staking Datum without Certificate \n Expected:  ${expectedHex} \n Got: ${parsedDatum}`
    }
}

export async function checkStakingDatumCborWithCert() {
    const expectedHex = "d8799f581ce14edd775467a4e7bac7e98ce2fbb89157ab1dce924f30bea752cce39f4040ff1a0001e240d87a80d8799fd8799fd8799fd8799f5820768f32a1a557789b745688f3adb7ee33b4db47e6a4977ca3b070edea15f7b4b5ff00ff1b0000018b2202e264d8799f1b0000018b2202e264ffa140a1401a000f4240ffffff"
    const parsedDatum = await to_stake_datum(stakeDatumWithCert)
    if (parsedDatum == expectedHex) {
        return "Staking Datum With Certificate:  OK"
    } else {
        throw `Invalid Staking Datum with Certificate \n Expected:  ${expectedHex} \n Got: ${parsedDatum}`
    }
}

export async function checkRewardCertificateDatumCbor() {
    const rewardCert = {
        cert_utxo: utxoDatum(utxoRef.txId, utxoRef.index),
        expires_in: BigInt(1697082696292),
        provider_key: "e14edd775467a4e7bac7e98ce2fbb89157ab1dce924f30bea752cce3",
        value: new Map([valueDatum("lovelace", BigInt(1000000))])
    }

    const expectedHex = "d8799fd8799fd8799f5820768f32a1a557789b745688f3adb7ee33b4db47e6a4977ca3b070edea15f7b4b5ff00ff1b0000018b2202e264581ce14edd775467a4e7bac7e98ce2fbb89157ab1dce924f30bea752cce3a140a1401a000f4240ff"
    const parsedRewardCert = to_reward_certificate_datum(rewardCert)

    if (parsedRewardCert == expectedHex) {
        return "Reward Certificate:  OK"
    } else {
        throw `Invalid Reward Certificate \n Expected:  ${expectedHex} \n Got: ${parsedRewardCert}`
    }

}

export function checkRewardReedemerCbor() {
    const parsedSignedRewardRedeemerHex = Data.to(RewardReedemer.Signed(fromText("msg"), fromText("sig")))
    const expectedRewardRedeemerSignedHex = "d8799f9f436d736743736967ffff"
    if (expectedRewardRedeemerSignedHex !== parsedSignedRewardRedeemerHex) {
        throw `Invalid Signed Reward Redeemer \n Expected:  ${expectedRewardRedeemerSignedHex} \n Got: ${parsedSignedRewardRedeemerHex}`
    }

    const parsedNullRewardRedeemerHex = Data.to(RewardReedemer.Null())
    const expectedNullRewardRedeemerHex = "d87a80"

    if (expectedRewardRedeemerSignedHex !== parsedSignedRewardRedeemerHex) {
        throw `Invalid Null Reward Redeemer \n Expected:  ${expectedNullRewardRedeemerHex} \n Got: ${parsedNullRewardRedeemerHex}`
    }

    return "Reward Redeemer: OK"
}