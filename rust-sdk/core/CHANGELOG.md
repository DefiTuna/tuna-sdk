# @crypticdot/defituna-rust-core

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
