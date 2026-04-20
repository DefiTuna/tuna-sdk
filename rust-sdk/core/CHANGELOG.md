# @crypticdot/defituna-rust-core

## 3.6.19

### Patch Changes

- 96fd8fd: Removed leverage from get_decrease_spot_position_quote

## 3.6.18

## 3.6.17

### Patch Changes

- 439d1ab: Updated spot quote functions

## 3.6.16

### Patch Changes

- 870ab89: Adjusted price_impact calculation in quote functions

## 3.6.15

### Patch Changes

- 0f05e99: Added swap_output_amount to IncreaseSpotPositionQuoteResult

## 3.6.14

## 3.6.13

## 3.6.12

### Patch Changes

- 9a51033: Added open_and_increase_tuna_spot_position_jupiter ix, updated spot position increase/decrease quote functions

## 3.6.11

## 3.6.10

## 3.6.9

## 3.6.8

## 3.6.7

## 3.6.6

## 3.6.5

## 3.6.4

## 3.6.3

## 3.6.2

## 3.6.1

## 3.6.0

### Minor Changes

- 810637d: Permissionless markets

## 3.5.13

### Patch Changes

- 43accb6: Permissionless markets

## 3.5.12

### Patch Changes

- 574caaa: Fixed Market account structure

## 3.5.11

## 3.5.10

## 3.5.9

## 3.5.8

## 3.5.7

### Patch Changes

- 933e387: bugfix: get_increase_lp_position_quote() overflows for full range positions

## 3.5.6

## 3.5.5

## 3.5.4

## 3.5.3

## 3.5.2

## 3.5.1

### Patch Changes

- 7931cec: bugfix: math overflow in get_increase_lp_position_quote

## 3.5.0

### Minor Changes

- 286065b: Updated tuna program error codes, changed SOL wrapping strategy, simplified amount slippage

## 3.4.8

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

### Patch Changes

- c78d701: Updated get_spot_position_liquidation_price

## 3.4.3

### Patch Changes

- 4ecb1d5: Added liquidation prices to get_increase_lp_position_quote

## 3.4.2

### Patch Changes

- b338af5: Moved getIncreaseLpPositionQuote to the core crate

## 3.4.1

### Patch Changes

- abb64db: Updated get_lp_position_liquidation_prices
- 28de88e: Updated fusionamm version

## 3.4.0

### Minor Changes

- ac53634: Isolated lending vaults and permissionless markets

## 3.3.6

## 3.3.5

### Patch Changes

- 22b4b20: Improved getDecreaseSpotPositionQuote

## 3.3.4

## 3.3.3

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

### Patch Changes

- b86d8b5: Chaged protocol_fee_rate and protocol_fee_rate_on_collateral type to u16 in quote functions

## 3.2.4

### Patch Changes

- 5f94437: Updated get_decrease_spot_position_quote()

## 3.2.3

## 3.2.2

### Patch Changes

- 3b03f9c: Updated get_decrease_spot_position_quote

## 3.2.1

### Patch Changes

- 1139440: Updated quote functions, moved tests to the core crate

## 3.2.0

### Minor Changes

- e917743: Added defituna core library and moved some math to it
