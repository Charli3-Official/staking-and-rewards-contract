# Off chain Code for IAGON Contract

## Setup blockfrost 
`export BLOCKFROST_API_KEY=<blockfrost api key>`

## Setup Provider wallet
By default we have used provider wallet hardcoded. We can allow setting up own provider key in future with Env Variable 

## Usage

### Placing Staking
`npm start place-staking `

this will place staking using one of provider keys

### Retire Staking
`npm start retire-staking`

This will request Stating to retire

### Resize Staking
`npm start resize-staking `

Will Resize previous staking by adding 1 more ADA

### Withdraw Staking
`npm start withdraw-staking`

Will withdraw staking from contract sending 2 ADA as penalty to penalty Address



### Place Reward
`npm start place-reward`
place 10 ADA as reward To reward contract. 

### Claim Reward
`npm start claim-reward`
Claims 2 ADA from Reward contract 

### ReClaim Reward
`npm start reclaim-reward`
Merge multiple UTXO in reward contract into single UTXO


### Testing CBOR
`npm start test-staking-cbor`

Will check if cbor is correct for datum, certificate & Reedemer