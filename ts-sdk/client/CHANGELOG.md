# @defituna/client

## 3.0.2

### Patch Changes

- 2aaee6f: Renamed t/p and s/l constants

## 3.0.1

### Patch Changes

- 0741685: Renamed take profit/stop loss to lower/upper orders

## 3.0.0

### Major Changes

- 5f51b19: DefiTuna 3.0

## 2.0.17

### Patch Changes

- fdf18d1: bugfix: incorrect protocol fee calculation in getLiquidityIncreaseQuote

## 2.0.16

### Patch Changes

- 961ae7e: bugfix: incorrect liquidation instruction builder

## 2.0.15

### Patch Changes

- 207d79e: Changed liquidation fees recipient

## 2.0.14

### Patch Changes

- adce08b: Accounts initialization cost calculation for the position opening and rebalancing

## 2.0.13

### Patch Changes

- 158f45e: Updated the fee model of auto-rebalanceable positions and removed raydium related code

## 2.0.12

### Patch Changes

- 1da0fca: Updated FusionAMM packages

## 2.0.11

### Patch Changes

- a5eddd1: Tuna program 2.0.7 (updated Whirlpool program to 0.5.0)

## 2.0.10

### Patch Changes

- 5c5924c: Bugfix in sol wrapping code

## 2.0.9

### Patch Changes

- 5571191: Updated fusionamm and orca dependencies

## 2.0.8

### Patch Changes

- de2c913: Change the order of entries in AccountsType structure

## 2.0.7

### Patch Changes

- bab18f4: - Added rust instruction builders for fusion pools
  - Added tuna position re-balance instruction

## 2.0.6

### Patch Changes

- 5b3552e: Fixed liquidity getLiquidityIncreaseQuote overflow issue (updated fusionamm packages)

## 2.0.5

### Patch Changes

- 5857597: Bugfix: Incorrect results returned by getLiquidityIncreaseQuote

## 2.0.4

### Patch Changes

- 421e559: Chnaged the scope of packages to @crypticdot

## 2.0.3

### Patch Changes

- 3c8aab0: Bugfix: openAndIncreaseTunaLpPositionFusionInstructions/openAndIncreaseTunaLpPositionOrcaInstructions incorrect amount slippage calculation

## 2.0.2

### Patch Changes

- 3bbd108: Bugfix: getLiquidityIncreaseQuote returns incorrect results for auto position ratio

## 2.0.1

### Patch Changes

- 64a4415: Changed input arguments of addLiquidity and openAndIncreaseTunaLpPosition instructions.
  Added getLiquidityIncreaseQuote function.

## 2.0.0

### Major Changes

- 224d33a: Added support for FusionAMM pools

## 1.0.30

### Patch Changes

- 11fe02d: Token accounts creation in repayDebt tx builder

## 1.0.29

### Patch Changes

- 99212bb: Added repayDebt instruction builder

## 1.0.28

### Patch Changes

- 287077d: Updated whirlpools packages to 2.0.0

## 1.0.27

### Patch Changes

- 388ee7d: Added closeActiveTunaLpPositionOrca transaction helper

## 1.0.26

### Patch Changes

- 4e5f35a: Tuna program 1.0.67

## 1.0.25

### Patch Changes

- 6c7ad44: Tuna program update to 1.0.66

## 1.0.24

### Patch Changes

- 7046a0b: Tuna program 1.0.65

## 1.0.23

### Patch Changes

- 78dc7dc: Added instruction builders to rust client

## 1.0.22

### Patch Changes

- 304b61e: Updated ts examples

## 1.0.21

### Patch Changes

- 445a4bd: Tuna program 1.0.64

## 1.0.20

### Patch Changes

- 4505283: Improved the transaction builder

## 1.0.19

### Patch Changes

- d3a8972: Renamed createLendingPosition to openLendingPosition; Added openLendingPositionAndDeposit instruction helper

## 1.0.18

### Patch Changes

- e8b6496: Added setLimitOrders instruction helper

## 1.0.17

### Patch Changes

- edfc1b8: Bugfix in openAndIncreaseTunaLpPosition instruction

## 1.0.16

### Patch Changes

- f86e213: Fixed the broken build
- 089c5a5: Added openAndIncreaseTunaLpPosition instruction. Updated tuna to 1.0.63.

## 1.0.15

### Patch Changes

- aae6898: Changed increaseTunaLpPositionOrca instruction helper

## 1.0.14

### Patch Changes

- 5094087: Fixed collectFeesOrca instruction helper

## 1.0.13

### Patch Changes

- 29b682c: Added WSOL mint support in instruction helpers

## 1.0.12

### Patch Changes

- a04a33a: Improved instruction helpers

## 1.0.11

### Patch Changes

- 6f3611f: Added simplified tuna instructions

## 1.0.10

### Patch Changes

- 03c74d1: Added lending position filters

## 1.0.9

### Patch Changes

- 73ad25a: Moved codama script inside packages

## 1.0.8

### Patch Changes

- f766847: Added tuna position fetch filters

## 1.0.7

### Patch Changes

- 0e0e455: Updated tuna constants

## 1.0.6

### Patch Changes

- 293db82: Updated codama version

## 1.0.5

### Patch Changes

- f1be18d: Removed Orca accounts and types

## 1.0.4

### Patch Changes

- f4fd7fc: Updated IDL to 1.0.58

## 1.0.3

### Patch Changes

- 81664a2: Updated tuna program to 1.0.55

## 1.0.2

### Patch Changes

- Remove post-install script

## 1.0.1

### Patch Changes

- 753a1e5: Updated IDL to 1.0.54

## 1.0.0

### Major Changes

- cd10597: Public version
