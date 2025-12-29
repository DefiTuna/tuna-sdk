# @defituna/rust-client

## 3.5.0

### Minor Changes

- 286065b: Updated tuna program error codes, changed SOL wrapping strategy, simplified amount slippage

## 3.4.8

### Patch Changes

- 161d574: Removed mut in get_utilization

## 3.4.7

### Patch Changes

- c6dba78: Updated fusion amm

## 3.4.6

### Patch Changes

- 064cb5a: Updated fusion amm SDK

## 3.4.5

### Patch Changes

- 3c37454: Moved math from client to core, added test_repay_debt_quote

## 3.4.4

## 3.4.3

## 3.4.2

## 3.4.1

### Patch Changes

- 28de88e: Updated fusionamm version

## 3.4.0

### Minor Changes

- ac53634: Isolated lending vaults and permissionless markets

## 3.3.6

### Patch Changes

- c871aab: Ability to set arbitrary lending vaults when creating a market

## 3.3.5

### Patch Changes

- 22b4b20: Improved getDecreaseSpotPositionQuote

## 3.3.4

## 3.3.3

### Patch Changes

- da4f791: Fixed liquidation instruction issues

## 3.3.2

## 3.3.1

### Patch Changes

- 48b5790: Got rid of position reversing

## 3.3.0

### Minor Changes

- b838600: Replaced increase/decrease spot instructions with the single modify ix

## 3.2.7

### Patch Changes

- 0103e9b: Replaced open_tuna_spot_position_orca/fusion instructions with the single one

## 3.2.6

### Patch Changes

- b755617: Spot position increase/decrease via jupiter

## 3.2.5

## 3.2.4

## 3.2.3

## 3.2.2

## 3.2.1

## 3.2.0

### Minor Changes

- e917743: Added defituna core library and moved some math to it

## 3.1.6

### Patch Changes

- 7db3a70: Updated spot instructions: added min/max swap amounts, removed flags and limit order prices at position opening

## 3.1.5

### Patch Changes

- c72a986: Updated Anchor to 0.32.1

## 3.1.4

### Patch Changes

- a8cd97a: Updated fusionamm sdk

## 3.1.3

### Patch Changes

- d6c65bf: Added spot position limit, added getIncreaseSpotPositionQuote()

## 3.1.2

### Patch Changes

- ce3cc97: Fixed incorrect TunaSpotPosition account length

## 3.1.1

### Patch Changes

- b1555dc: Transfer tokens directly to the spot position owner on liquidation/closing by an order

## 3.1.0

### Minor Changes

- 7e965d3: Single spot position per pool

## 3.0.10

### Patch Changes

- 3f4fdc0: Added pyth price feed account derivation

## 3.0.9

### Patch Changes

- 4cb4302: Added reset_tuna_spot_position ix

## 3.0.8

### Patch Changes

- 99a5d95: Renamed liquidate instructions

## 3.0.7

### Patch Changes

- 27b2474: Updated TunaPosition trait

## 3.0.6

### Patch Changes

- ef07f3f: Added useful getters to tuna_position trait

## 3.0.5

### Patch Changes

- 67e390f: Added Any to TunaPosition trait

## 3.0.4

### Patch Changes

- df53514: Updated rebalance ix builder name

## 3.0.3

### Patch Changes

- 113f2ec: bugfix: renamed rebalance ix builder

## 3.0.2

### Patch Changes

- 2aaee6f: Renamed t/p and s/l constants

## 3.0.1

### Patch Changes

- 0741685: Renamed take profit/stop loss to lower/upper orders

## 3.0.0

### Major Changes

- 5f51b19: DefiTuna 3.0

## 2.0.16

### Patch Changes

- 961ae7e: bugfix: incorrect liquidation instruction builder

## 2.0.15

### Patch Changes

- 207d79e: Changed liquidation fees recipient

## 2.0.14

### Patch Changes

- 92ae866: Updated instruction builders

## 2.0.13

### Patch Changes

- 3ad885c: Updated dependencies in the rust client and fixed rust examples

## 2.0.12

### Patch Changes

- adce08b: Accounts initialization cost calculation for the position opening and rebalancing

## 2.0.11

### Patch Changes

- 158f45e: Updated the fee model of auto-rebalanceable positions and removed raydium related code

## 2.0.10

### Patch Changes

- 1da0fca: Updated FusionAMM packages

## 2.0.9

### Patch Changes

- a5eddd1: Tuna program 2.0.7 (updated Whirlpool program to 0.5.0)

## 2.0.8

### Patch Changes

- 2eb5647: Updated orca whirlpools client to 4.0.0-beta.1

## 2.0.7

### Patch Changes

- 66926b6: Use of granular solana crates instead of solana-sdk

## 2.0.6

### Patch Changes

- 5571191: Updated fusionamm and orca dependencies

## 2.0.5

### Patch Changes

- d0bbf95: Added vault and market account filters

## 2.0.4

### Patch Changes

- 9210db3: Added account discriminators

## 2.0.3

### Patch Changes

- de2c913: Change the order of entries in AccountsType structure

## 2.0.2

### Patch Changes

- bab18f4: - Added rust instruction builders for fusion pools
  - Added tuna position re-balance instruction

## 2.0.1

### Patch Changes

- 421e559: Chnaged the scope of packages to @crypticdot

## 2.0.0

### Major Changes

- 224d33a: Added support for FusionAMM pools

## 1.0.18

### Patch Changes

- 39517ec: Updated collect_and_compund_fees_orca instructions builder

## 1.0.17

### Patch Changes

- 9477f09: Rust client refactoring

## 1.0.16

### Patch Changes

- 4e5f35a: Tuna program 1.0.67

## 1.0.15

### Patch Changes

- b6eb1d2: Tuna program 1.0.66

## 1.0.14

### Patch Changes

- 6c7ad44: Tuna program update to 1.0.66

## 1.0.13

### Patch Changes

- 7046a0b: Tuna program 1.0.65

## 1.0.12

### Patch Changes

- f208a6a: Replace Memcmp filter method

## 1.0.11

### Patch Changes

- 357661d: Replaced nonblocking rpc client with a blocking one

## 1.0.10

### Patch Changes

- 78dc7dc: Added instruction builders to rust client

## 1.0.9

### Patch Changes

- 445a4bd: Tuna program 1.0.64

## 1.0.8

### Patch Changes

- dcb2645: Added liquidate_position_orca and collect_and_compound_fees_orca instruction helpers

## 1.0.7

### Patch Changes

- 03c74d1: Added lending position filters

## 1.0.6

### Patch Changes

- 73ad25a: Moved codama script inside packages

## 1.0.5

### Patch Changes

- 1f106e5: Added tuna position filters to rust client

## 1.0.4

### Patch Changes

- e1ceecc: Add README.md

## 1.0.3

### Patch Changes

- 52f2b37: Add metadata fields to Cargo.toml

## 1.0.2

### Patch Changes

- 4609404: Publish fix

## 1.0.1

### Patch Changes

- 8ca13ba: Initial release
