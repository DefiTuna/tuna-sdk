import { priceToSqrtPrice } from "@crypticdot/fusionamm-core";
import { findAssociatedTokenPda, getTransferInstruction } from "@solana-program/token-2022";
import assert from "assert";
import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_ADDRESS,
  fetchTunaSpotPosition,
  getTunaSpotPositionAddress,
  HUNDRED_PERCENT,
  LEVERAGE_ONE,
  MarketMaker,
  MAX_SQRT_PRICE,
  MIN_SQRT_PRICE,
  PoolToken,
  resetTunaSpotPositionInstruction,
  setTunaSpotPositionLimitOrdersInstruction,
  TUNA_ERROR__AMOUNT_SLIPPAGE_EXCEEDED,
  TUNA_ERROR__POSITION_NOT_EMPTY,
  TUNA_ERROR__POSITION_SIZE_LIMIT_EXCEEDED,
} from "../src";

import { LIQUIDATOR_KEYPAIR } from "./helpers/addresses.ts";
import {
  assertCloseActiveTunaSpotPosition,
  closeActiveTunaSpotPosition,
} from "./helpers/closeActiveTunaSpotPosition.ts";
import { closeTunaSpotPosition } from "./helpers/closeTunaSpotPosition.ts";
import { assertDecreaseTunaSpotPosition, decreaseTunaSpotPosition } from "./helpers/decreaseTunaSpotPosition.ts";
import { fetchPool } from "./helpers/fetch.ts";
import { assertIncreaseTunaSpotPosition, increaseTunaSpotPosition } from "./helpers/increaseTunaSpotPosition.ts";
import { assertLiquidateTunaSpotPosition, liquidateTunaSpotPosition } from "./helpers/liquidateTunaSpotPosition.ts";
import { rpc, sendTransaction, signer } from "./helpers/mockRpc.ts";
import {
  assertOpenAndIncreaseSpotPosition,
  openAndIncreaseTunaSpotPosition,
} from "./helpers/openAndIncreaseTunaSpotPosition.ts";
import { openTunaSpotPosition } from "./helpers/openTunaSpotPosition.ts";
import { setupTestMarket, TestMarket } from "./helpers/setup.ts";
import { swapExactInput } from "./helpers/swap.ts";

describe("Tuna Spot Position", () => {
  let testOrcaMarket: TestMarket;
  let testFusionMarket: TestMarket;
  let markets: TestMarket[];
  const marketMakers = [MarketMaker.Orca, MarketMaker.Fusion];

  beforeEach(async () => {
    const marketArgs = {
      addressLookupTable: DEFAULT_ADDRESS,
      borrowLimitA: 0n,
      borrowLimitB: 0n,
      disabled: false,
      liquidationFee: 10000, // 1%
      liquidationThreshold: 920000, // 92%
      maxLeverage: (LEVERAGE_ONE * 1020) / 100,
      maxSwapSlippage: 0,
      oraclePriceDeviationThreshold: HUNDRED_PERCENT, // Allow large deviation for tests
      protocolFee: 1000, // 0.1%
      protocolFeeOnCollateral: 1000, // 0.1%
      limitOrderExecutionFee: 1000, // 0.1%
      rebalanceProtocolFee: HUNDRED_PERCENT / 10,
      spotPositionSizeLimitA: 1000_000_000_000,
      spotPositionSizeLimitB: 100000_000_000,
    };
    testOrcaMarket = await setupTestMarket({ marketMaker: MarketMaker.Orca, ...marketArgs });
    testFusionMarket = await setupTestMarket({ marketMaker: MarketMaker.Fusion, ...marketArgs });
    markets = [testOrcaMarket, testFusionMarket];
  });

  for (const marketMaker of marketMakers) {
    it(`Open an empty position and close it (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;

      await openTunaSpotPosition({
        rpc,
        positionToken: PoolToken.A,
        collateralToken: PoolToken.A,
        pool: market.pool,
      });

      await closeTunaSpotPosition({ rpc, pool: market.pool });
    });
  }

  for (const marketMaker of marketMakers) {
    it(`Fails to close a non-empty position (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;

      await openAndIncreaseTunaSpotPosition({
        rpc,
        pool: market.pool,
        positionToken: PoolToken.A,
        collateralToken: PoolToken.A,
        collateralAmount: 1_000_000_000n,
        borrowAmount: 400_000_000n,
      });

      await assert.rejects(closeTunaSpotPosition({ rpc, pool: market.pool }), err => {
        expect((err as Error).toString()).contain(
          `custom program error: ${"0x" + TUNA_ERROR__POSITION_NOT_EMPTY.toString(16)}`,
        );
        return true;
      });
    });
  }

  for (const marketMaker of marketMakers) {
    it(`Open a LONG position providing token A as collateral, increase, decrease and close it (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;

      await openTunaSpotPosition({
        rpc,
        positionToken: PoolToken.A,
        collateralToken: PoolToken.A,
        pool: market.pool,
      });

      assertIncreaseTunaSpotPosition(
        await increaseTunaSpotPosition({
          rpc,
          pool: market.pool,
          collateralAmount: 1_000_000_000n,
          borrowAmount: 400_000_000n,
        }),
        { amountA: 2994617984n, amountB: 0n },
      );

      assertIncreaseTunaSpotPosition(
        await increaseTunaSpotPosition({
          rpc,
          pool: market.pool,
          collateralAmount: 1_000_000_000n,
          borrowAmount: 400_000_000n,
        }),
        { amountA: 5985677096n, amountB: 0n },
      );

      assertDecreaseTunaSpotPosition(
        await decreaseTunaSpotPosition({
          rpc,
          pool: market.pool,
          withdrawPercent: HUNDRED_PERCENT / 2,
        }),
        {
          amountA: 2992838548n,
          amountB: 0n,
          userBalanceDeltaA: 997586093n,
          userBalanceDeltaB: 0n,
          vaultBalanceDeltaA: 0n,
          vaultBalanceDeltaB: 400_000_000n,
        },
      );

      assertDecreaseTunaSpotPosition(
        await decreaseTunaSpotPosition({
          rpc,
          pool: market.pool,
          withdrawPercent: HUNDRED_PERCENT,
        }),
        {
          amountA: 0n,
          amountB: 0n,
          userBalanceDeltaA: 994016869n,
          userBalanceDeltaB: 0n,
          vaultBalanceDeltaA: 0n,
          vaultBalanceDeltaB: 400_000_000n,
        },
      );
    });
  }

  for (const marketMaker of marketMakers) {
    it(`Open a LONG position providing token B as collateral, increase, decrease and close it (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;

      await openTunaSpotPosition({
        rpc,
        positionToken: PoolToken.A,
        collateralToken: PoolToken.B,
        pool: market.pool,
      });

      assertIncreaseTunaSpotPosition(
        await increaseTunaSpotPosition({
          rpc,
          pool: market.pool,
          collateralAmount: 200_000_000n,
          borrowAmount: 400_000_000n,
        }),
        { amountA: 2992091804n, amountB: 0n },
      );

      assertIncreaseTunaSpotPosition(
        await increaseTunaSpotPosition({
          rpc,
          pool: market.pool,
          collateralAmount: 200_000_000n,
          borrowAmount: 400_000_000n,
        }),
        { amountA: 5976186848n, amountB: 0n },
      );

      assertDecreaseTunaSpotPosition(
        await decreaseTunaSpotPosition({
          rpc,
          pool: market.pool,
          withdrawPercent: HUNDRED_PERCENT / 2,
        }),
        {
          amountA: 2988093424n,
          amountB: 0n,
          userBalanceDeltaA: 0n,
          userBalanceDeltaB: 199842232n,
          vaultBalanceDeltaA: 0n,
          vaultBalanceDeltaB: 400_000_000n,
        },
      );

      assertDecreaseTunaSpotPosition(
        await decreaseTunaSpotPosition({
          rpc,
          pool: market.pool,
          withdrawPercent: HUNDRED_PERCENT,
        }),
        {
          amountA: 0n,
          amountB: 0n,
          userBalanceDeltaA: 0n,
          userBalanceDeltaB: 198239554n,
          vaultBalanceDeltaA: 0n,
          vaultBalanceDeltaB: 400_000_000n,
        },
      );

      await closeTunaSpotPosition({ rpc, pool: market.pool });
    });
  }

  for (const marketMaker of marketMakers) {
    it(`Open a SHORT position providing token A as collateral, increase, decrease and close it (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;

      await openTunaSpotPosition({
        rpc,
        positionToken: PoolToken.B,
        collateralToken: PoolToken.A,
        pool: market.pool,
      });

      assertIncreaseTunaSpotPosition(
        await increaseTunaSpotPosition({
          rpc,
          pool: market.pool,
          collateralAmount: 1_000_000_000n,
          borrowAmount: 2_000_000_000n,
        }),
        { amountA: 0n, amountB: 598418360n },
      );

      assertIncreaseTunaSpotPosition(
        await increaseTunaSpotPosition({
          rpc,
          pool: market.pool,
          collateralAmount: 1_000_000_000n,
          borrowAmount: 2_000_000_000n,
        }),
        { amountA: 0n, amountB: 1195237368n },
      );

      assertDecreaseTunaSpotPosition(
        await decreaseTunaSpotPosition({
          rpc,
          pool: market.pool,
          withdrawPercent: HUNDRED_PERCENT / 2,
        }),
        {
          amountA: 0n,
          amountB: 597618684n,
          userBalanceDeltaA: 999211159n,
          userBalanceDeltaB: 0n,
          vaultBalanceDeltaA: 2_000_000_000n,
          vaultBalanceDeltaB: 0n,
        },
      );

      assertDecreaseTunaSpotPosition(
        await decreaseTunaSpotPosition({
          rpc,
          pool: market.pool,
          withdrawPercent: HUNDRED_PERCENT,
        }),
        {
          amountA: 0n,
          amountB: 0n,
          userBalanceDeltaA: 991197769n,
          userBalanceDeltaB: 0n,
          vaultBalanceDeltaA: 2_000_000_000n,
          vaultBalanceDeltaB: 0n,
        },
      );

      await closeTunaSpotPosition({ rpc, pool: market.pool });
    });
  }

  for (const marketMaker of marketMakers) {
    it(`Open a SHORT position providing token B as collateral, increase, decrease and close it (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;

      await openTunaSpotPosition({
        rpc,
        positionToken: PoolToken.B,
        collateralToken: PoolToken.B,
        pool: market.pool,
      });

      assertIncreaseTunaSpotPosition(
        await increaseTunaSpotPosition({
          rpc,
          pool: market.pool,
          collateralAmount: 2_000_000_000n,
          borrowAmount: 10_100_000_000n,
        }),
        { amountA: 0n, amountB: 4006315123n },
      );

      assertIncreaseTunaSpotPosition(
        await increaseTunaSpotPosition({
          rpc,
          pool: market.pool,
          collateralAmount: 2_000_000_000n,
          borrowAmount: 10_100_000_000n,
        }),
        { amountA: 0n, amountB: 7994673287n },
      );

      assertDecreaseTunaSpotPosition(
        await decreaseTunaSpotPosition({
          rpc,
          pool: market.pool,
          withdrawPercent: HUNDRED_PERCENT / 2,
        }),
        {
          amountA: 0n,
          amountB: 3997336643n,
          userBalanceDeltaA: 0n,
          userBalanceDeltaB: 2003778529n,
          vaultBalanceDeltaA: 10_100_000_000n,
          vaultBalanceDeltaB: 0n,
        },
      );

      assertDecreaseTunaSpotPosition(
        await decreaseTunaSpotPosition({
          rpc,
          pool: market.pool,
          withdrawPercent: HUNDRED_PERCENT,
        }),
        {
          amountA: 0n,
          amountB: 0n,
          userBalanceDeltaA: 0n,
          userBalanceDeltaB: 1985769081n,
          vaultBalanceDeltaA: 10_100_000_000n,
          vaultBalanceDeltaB: 0n,
        },
      );

      await closeTunaSpotPosition({ rpc, pool: market.pool });
    });
  }

  for (const marketMaker of marketMakers) {
    it(`Open a non-leveraged position and close it (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;

      assertOpenAndIncreaseSpotPosition(
        await openAndIncreaseTunaSpotPosition({
          rpc,
          pool: market.pool,
          positionToken: PoolToken.B,
          collateralToken: PoolToken.A,
          collateralAmount: 1_000_000_000n,
          borrowAmount: 0n,
        }),
        { amountA: 0n, amountB: 199650889n },
      );

      assertCloseActiveTunaSpotPosition(await closeActiveTunaSpotPosition({ rpc, pool: market.pool }), {
        userBalanceDeltaA: 998400817n,
        userBalanceDeltaB: 0n,
        vaultBalanceDeltaA: 0n,
        vaultBalanceDeltaB: 0n,
      });
    });
  }

  for (const marketMaker of marketMakers) {
    it(`Open a LONG position with liquidity providing token A and close it (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;

      assertOpenAndIncreaseSpotPosition(
        await openAndIncreaseTunaSpotPosition({
          rpc,
          pool: market.pool,
          positionToken: PoolToken.A,
          collateralToken: PoolToken.A,
          collateralAmount: 1_000_000_000n,
          borrowAmount: 400_000_000n,
        }),
        { amountA: 2994617984n, amountB: 0n },
      );

      assertCloseActiveTunaSpotPosition(await closeActiveTunaSpotPosition({ rpc, pool: market.pool }), {
        userBalanceDeltaA: 995800950n,
        userBalanceDeltaB: 0n,
        vaultBalanceDeltaA: 0n,
        vaultBalanceDeltaB: 400000000n,
      });
    });
  }

  for (const marketMaker of marketMakers) {
    it(`Open a LONG position with liquidity providing token B and close it (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);

      assertOpenAndIncreaseSpotPosition(
        await openAndIncreaseTunaSpotPosition({
          rpc,
          pool: pool.address,
          positionToken: PoolToken.A,
          collateralToken: PoolToken.B,
          collateralAmount: 200_000_000n,
          borrowAmount: 400_000_000n,
        }),
        { amountA: 2992091804n, amountB: 0n },
      );

      assertCloseActiveTunaSpotPosition(await closeActiveTunaSpotPosition({ rpc, pool: market.pool }), {
        userBalanceDeltaA: 0n,
        userBalanceDeltaB: 199040654n,
        vaultBalanceDeltaA: 0n,
        vaultBalanceDeltaB: 400000000n,
      });
    });
  }

  for (const marketMaker of marketMakers) {
    it(`Open a SHORT position with liquidity providing token A and close it (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;

      assertOpenAndIncreaseSpotPosition(
        await openAndIncreaseTunaSpotPosition({
          rpc,
          pool: market.pool,
          positionToken: PoolToken.B,
          collateralToken: PoolToken.A,
          collateralAmount: 1_000_000_000n,
          borrowAmount: 4_000_000_000n,
        }),
        { amountA: 0n, amountB: 996475010n },
      );

      assertCloseActiveTunaSpotPosition(await closeActiveTunaSpotPosition({ rpc, pool: market.pool }), {
        userBalanceDeltaA: 992006783n,
        userBalanceDeltaB: 0n,
        vaultBalanceDeltaA: 4000000000n,
        vaultBalanceDeltaB: 0n,
      });
    });
  }

  for (const marketMaker of marketMakers) {
    it(`Open a SHORT position with liquidity providing token B and close it (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;

      assertOpenAndIncreaseSpotPosition(
        await openAndIncreaseTunaSpotPosition({
          rpc,
          pool: market.pool,
          positionToken: PoolToken.B,
          collateralToken: PoolToken.B,
          collateralAmount: 200_000_000n,
          borrowAmount: 4_000_000_000n,
        }),
        { amountA: 0n, amountB: 997335419n },
      );

      assertCloseActiveTunaSpotPosition(await closeActiveTunaSpotPosition({ rpc, pool: market.pool }), {
        userBalanceDeltaA: 0n,
        userBalanceDeltaB: 198520592n,
        vaultBalanceDeltaA: 4000000000n,
        vaultBalanceDeltaB: 0n,
      });
    });
  }

  for (const marketMaker of marketMakers) {
    it(`Liquidates a LONG position due to an unhealthy state (no bad debt) (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const tunaPositionAddress = (await getTunaSpotPositionAddress(signer.address, pool.address))[0];

      await openAndIncreaseTunaSpotPosition({
        rpc,
        pool: market.pool,
        positionToken: PoolToken.A,
        collateralToken: PoolToken.B,
        collateralAmount: 200_000_000n,
        borrowAmount: 1700_000_000n,
      });

      // Significantly move the price.
      // the limit amount when the position becomes unhealthy is 28161_524_235n
      await swapExactInput(rpc, signer, pool.address, 35000_000_000n, pool.data.tokenMintA);

      assertLiquidateTunaSpotPosition(
        await liquidateTunaSpotPosition({ rpc, signer: LIQUIDATOR_KEYPAIR, tunaPositionAddress }),
        {
          vaultBalanceDeltaA: 0n,
          vaultBalanceDeltaB: 1700000000n,
          badDebtDeltaA: 0n,
          badDebtDeltaB: 0n,
          userBalanceDeltaA: 0n,
          userBalanceDeltaB: 120529141n,
          feeRecipientBalanceDelta: 94475667n,
        },
      );
    });
  }

  for (const marketMaker of marketMakers) {
    it(`Liquidates a SHORT position due to an unhealthy state (no bad debt) (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const tunaPositionAddress = (await getTunaSpotPositionAddress(signer.address, pool.address))[0];

      await openAndIncreaseTunaSpotPosition({
        rpc,
        pool: pool.address,
        positionToken: PoolToken.B,
        collateralToken: PoolToken.B,
        collateralAmount: 200_000_000n,
        borrowAmount: 6_000_000_000n,
      });

      // Significantly move the price.
      await swapExactInput(rpc, signer, pool.address, 30_000_000_000n, pool.data.tokenMintB);

      assertLiquidateTunaSpotPosition(
        await liquidateTunaSpotPosition({ rpc, signer: LIQUIDATOR_KEYPAIR, tunaPositionAddress }),
        {
          vaultBalanceDeltaA: 6_000_000_000n,
          vaultBalanceDeltaB: 0n,
          badDebtDeltaA: 0n,
          badDebtDeltaB: 0n,
          userBalanceDeltaA: 0n,
          userBalanceDeltaB: 17274441n,
          feeRecipientBalanceDelta: 13950373n,
        },
      );
    });
  }

  for (const marketMaker of marketMakers) {
    it(`Liquidates a LONG position due to an unhealthy state (NATIVE mint, ${MarketMaker[marketMaker]})`, async () => {
      // Override the test market using WSOL for MintA
      const market = await setupTestMarket(
        {
          marketMaker,
          addressLookupTable: DEFAULT_ADDRESS,
          borrowLimitA: 0n,
          borrowLimitB: 0n,
          disabled: false,
          liquidationFee: 10000, // 1%
          liquidationThreshold: 920000, // 92%
          maxLeverage: (LEVERAGE_ONE * 1020) / 100,
          maxSwapSlippage: 0,
          oraclePriceDeviationThreshold: HUNDRED_PERCENT, // Allow large deviation for tests
          protocolFee: 1000, // 0.1%
          protocolFeeOnCollateral: 1000, // 0.1%
          limitOrderExecutionFee: 1000, // 0.1%
          rebalanceProtocolFee: HUNDRED_PERCENT / 10,
          spotPositionSizeLimitA: 1000_000_000_000,
          spotPositionSizeLimitB: 100000_000_000,
        },
        true, // use NATIVE mint
        false,
      );

      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const tunaPositionAddress = (await getTunaSpotPositionAddress(signer.address, pool.address))[0];

      await openAndIncreaseTunaSpotPosition({
        rpc,
        pool: market.pool,
        positionToken: PoolToken.A,
        collateralToken: PoolToken.A,
        collateralAmount: 1000_000_000n,
        borrowAmount: 1700_000_000n,
      });

      // Significantly move the price.
      // the limit amount when the position becomes unhealthy is 28161_524_235n
      await swapExactInput(rpc, signer, pool.address, 35000_000_000n, pool.data.tokenMintA);

      assertLiquidateTunaSpotPosition(
        await liquidateTunaSpotPosition({ rpc, signer: LIQUIDATOR_KEYPAIR, tunaPositionAddress }),
        {
          vaultBalanceDeltaA: 0n,
          vaultBalanceDeltaB: 1700000000n,
          badDebtDeltaA: 0n,
          badDebtDeltaB: 0n,
          userNativeBalanceDelta: 626251260n, // includes the rent of closed ATA accounts
          userBalanceDeltaA: 0n,
          userBalanceDeltaB: 0n,
          feeRecipientBalanceDelta: 94558471n,
        },
      );
    });
  }

  for (const marketMaker of marketMakers) {
    it(`Partially liquidates a LONG position due to an unhealthy state (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const tunaPositionAddress = (await getTunaSpotPositionAddress(signer.address, pool.address))[0];

      await openAndIncreaseTunaSpotPosition({
        rpc,
        pool: market.pool,
        positionToken: PoolToken.A,
        collateralToken: PoolToken.B,
        collateralAmount: 200_000_000n,
        borrowAmount: 1700_000_000n,
      });

      // Significantly move the price.
      // the limit amount when the position becomes unhealthy is 28161_524_235n
      await swapExactInput(rpc, signer, pool.address, 35000_000_000n, pool.data.tokenMintA);

      assertLiquidateTunaSpotPosition(
        await liquidateTunaSpotPosition({
          rpc,
          signer: LIQUIDATOR_KEYPAIR,
          tunaPositionAddress,
          withdrawPercent: HUNDRED_PERCENT / 2,
        }),
        {
          vaultBalanceDeltaA: 0n,
          vaultBalanceDeltaB: 850000000n,
          badDebtDeltaA: 0n,
          badDebtDeltaB: 0n,
          userBalanceDeltaA: 0n,
          userBalanceDeltaB: 0n,
          feeRecipientBalanceDelta: 47237833n,
        },
      );

      assertLiquidateTunaSpotPosition(
        await liquidateTunaSpotPosition({
          rpc,
          signer: LIQUIDATOR_KEYPAIR,
          tunaPositionAddress,
          withdrawPercent: HUNDRED_PERCENT,
        }),
        {
          vaultBalanceDeltaA: 0n,
          vaultBalanceDeltaB: 850000000n,
          badDebtDeltaA: 0n,
          badDebtDeltaB: 0n,
          userBalanceDeltaA: 0n,
          userBalanceDeltaB: 58386776n,
          feeRecipientBalanceDelta: 47237833n,
        },
      );
    });
  }

  for (const marketMaker of marketMakers) {
    it(`Liquidates a LONG position due to an unhealthy state (bad debt B) (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const tunaPositionAddress = (await getTunaSpotPositionAddress(signer.address, pool.address))[0];

      await openAndIncreaseTunaSpotPosition({
        rpc,
        pool: pool.address,
        positionToken: PoolToken.A,
        collateralToken: PoolToken.B,
        collateralAmount: 200_000_000n,
        borrowAmount: 1700_000_000n,
      });

      // Significantly move the price.
      // the limit amount when the position becomes unhealthy is 28161_524_235n
      await swapExactInput(rpc, signer, pool.address, 1000000_000_000n, pool.data.tokenMintA);

      assertLiquidateTunaSpotPosition(
        await liquidateTunaSpotPosition({ rpc, signer: LIQUIDATOR_KEYPAIR, tunaPositionAddress }),
        {
          vaultBalanceDeltaA: 0n,
          vaultBalanceDeltaB: 904701214n,
          badDebtDeltaA: 0n,
          badDebtDeltaB: 795298786n,
          userBalanceDeltaA: 0n,
          userBalanceDeltaB: 0n,
          feeRecipientBalanceDelta: 0n,
        },
      );
    });
  }

  for (const marketMaker of marketMakers) {
    it(`Liquidates a SHORT position due to an unhealthy state (bad debt A) (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const tunaPositionAddress = (await getTunaSpotPositionAddress(signer.address, pool.address))[0];

      await openAndIncreaseTunaSpotPosition({
        rpc,
        pool: pool.address,
        positionToken: PoolToken.B,
        collateralToken: PoolToken.B,
        collateralAmount: 200_000_000n,
        borrowAmount: 6_000_000_000n,
      });

      // Significantly move the price.
      await swapExactInput(rpc, signer, pool.address, 50_000_000_000n, pool.data.tokenMintB);

      assertLiquidateTunaSpotPosition(
        await liquidateTunaSpotPosition({ rpc, signer: LIQUIDATOR_KEYPAIR, tunaPositionAddress }),
        {
          vaultBalanceDeltaA: 5652842713n,
          vaultBalanceDeltaB: 0n,
          badDebtDeltaA: 347157287n,
          badDebtDeltaB: 0n,
          userBalanceDeltaA: 0n,
          userBalanceDeltaB: 0n,
          feeRecipientBalanceDelta: 0n,
        },
      );
    });
  }

  for (const marketMaker of marketMakers) {
    it(`Liquidates a position with directly transferred tokens (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const tunaPositionAddress = (await getTunaSpotPositionAddress(signer.address, pool.address))[0];

      const signerAtaA = (
        await findAssociatedTokenPda({
          mint: market.mintA.address,
          owner: signer.address,
          tokenProgram: market.mintA.programAddress,
        })
      )[0];

      const signerAtaB = (
        await findAssociatedTokenPda({
          mint: market.mintB.address,
          owner: signer.address,
          tokenProgram: market.mintB.programAddress,
        })
      )[0];

      await openAndIncreaseTunaSpotPosition({
        rpc,
        pool: pool.address,
        positionToken: PoolToken.A,
        collateralToken: PoolToken.B,
        collateralAmount: 200_000_000n,
        borrowAmount: 1700_000_000n,
      });

      const tunaPositionAtaA = (
        await findAssociatedTokenPda({
          owner: tunaPositionAddress,
          mint: market.mintA.address,
          tokenProgram: market.mintA.programAddress,
        })
      )[0];

      const tunaPositionAtaB = (
        await findAssociatedTokenPda({
          owner: tunaPositionAddress,
          mint: market.mintB.address,
          tokenProgram: market.mintB.programAddress,
        })
      )[0];

      // Significantly move the price.
      // the limit amount when the position becomes unhealthy is 28161_524_235n
      await swapExactInput(rpc, signer, pool.address, 35000_000_000n, pool.data.tokenMintA);

      await sendTransaction([
        getTransferInstruction(
          {
            authority: signer,
            source: signerAtaA,
            destination: tunaPositionAtaA,
            amount: 1_000_000_000n,
          },
          { programAddress: market.mintA.programAddress },
        ),
        getTransferInstruction(
          {
            authority: signer,
            source: signerAtaB,
            destination: tunaPositionAtaB,
            amount: 200_000_000n,
          },
          { programAddress: market.mintB.programAddress },
        ),
      ]);

      assertLiquidateTunaSpotPosition(
        await liquidateTunaSpotPosition({ rpc, signer: LIQUIDATOR_KEYPAIR, tunaPositionAddress }),
        {
          vaultBalanceDeltaA: 0n,
          vaultBalanceDeltaB: 1700_000_000n,
          badDebtDeltaA: 0n,
          badDebtDeltaB: 0n,
          userBalanceDeltaA: 0n,
          userBalanceDeltaB: 120529141n,
          feeRecipientBalanceDelta: 1094475667n,
        },
      );
    });
  }

  for (const marketMaker of marketMakers) {
    it(`T/P limit order (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const tunaPositionAddress = (await getTunaSpotPositionAddress(signer.address, pool.address))[0];

      await openAndIncreaseTunaSpotPosition({
        rpc,
        pool: pool.address,
        positionToken: PoolToken.A,
        collateralToken: PoolToken.B,
        collateralAmount: 200_000_000n,
        borrowAmount: 1700_000_000n,
      });

      await sendTransaction([
        await setTunaSpotPositionLimitOrdersInstruction(signer, pool.address, {
          lowerLimitOrderSqrtPrice: priceToSqrtPrice(198.5, 9, 6),
          upperLimitOrderSqrtPrice: MAX_SQRT_PRICE,
        }),
      ]);

      // Significantly move the price.
      // the limit amount when the position becomes unhealthy is 28161_524_235n
      await swapExactInput(rpc, signer, pool.address, 20000_000_000n, pool.data.tokenMintA);

      assertLiquidateTunaSpotPosition(
        await liquidateTunaSpotPosition({ rpc, signer: LIQUIDATOR_KEYPAIR, tunaPositionAddress }),
        {
          vaultBalanceDeltaA: 0n,
          vaultBalanceDeltaB: 1700_000_000n,
          badDebtDeltaA: 0n,
          badDebtDeltaB: 0n,
          userBalanceDeltaA: 0n,
          userBalanceDeltaB: 161563893n,
          feeRecipientBalanceDelta: 9447566n,
        },
      );
    });
  }

  for (const marketMaker of marketMakers) {
    it(`S/L limit order (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const tunaPositionAddress = (await getTunaSpotPositionAddress(signer.address, pool.address))[0];

      await openAndIncreaseTunaSpotPosition({
        rpc,
        pool: pool.address,
        positionToken: PoolToken.B,
        collateralToken: PoolToken.B,
        collateralAmount: 200_000_000n,
        borrowAmount: 6_000_000_000n,
      });

      await sendTransaction([
        await setTunaSpotPositionLimitOrdersInstruction(signer, pool.address, {
          lowerLimitOrderSqrtPrice: MIN_SQRT_PRICE,
          upperLimitOrderSqrtPrice: priceToSqrtPrice(203.0, 9, 6),
        }),
      ]);

      // Move the price.
      await swapExactInput(rpc, signer, pool.address, 5_000_000_000n, pool.data.tokenMintB);

      assertLiquidateTunaSpotPosition(
        await liquidateTunaSpotPosition({ rpc, signer: LIQUIDATOR_KEYPAIR, tunaPositionAddress }),
        {
          vaultBalanceDeltaA: 6000000000n,
          vaultBalanceDeltaB: 0n,
          badDebtDeltaA: 0n,
          badDebtDeltaB: 0n,
          userBalanceDeltaA: 0n,
          userBalanceDeltaB: 169466090n,
          feeRecipientBalanceDelta: 1395037n,
        },
      );
    });
  }

  for (const marketMaker of marketMakers) {
    it(`Entry price change on the position increase (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const tunaPositionAddress = (await getTunaSpotPositionAddress(signer.address, market.pool))[0];

      await openTunaSpotPosition({
        rpc,
        positionToken: PoolToken.A,
        collateralToken: PoolToken.B,
        pool: pool.address,
      });

      await increaseTunaSpotPosition({
        rpc,
        pool: market.pool,
        collateralAmount: 2_000_000n,
        borrowAmount: 4_000_000n,
      });

      const position = await fetchTunaSpotPosition(rpc, tunaPositionAddress);

      // Move the price a little
      await swapExactInput(rpc, signer, pool.address, 10000_000_000n, pool.data.tokenMintA);

      await increaseTunaSpotPosition({
        rpc,
        pool: market.pool,
        collateralAmount: 2_000_000n,
        borrowAmount: 4_000_000n,
      });

      const positionAfter = await fetchTunaSpotPosition(rpc, tunaPositionAddress);
      const poolAfter = await fetchPool(rpc, market.pool, market.marketMaker);

      expect(position.data.entrySqrtPrice).toEqual(pool.data.sqrtPrice);
      expect(position.data.entrySqrtPrice).toEqual(8249634742471189504n);
      expect(positionAfter.data.entrySqrtPrice).toEqual(8231248982356507534n);
      expect(poolAfter.data.sqrtPrice).toEqual(8213136573565815533n);

      await closeActiveTunaSpotPosition({ rpc, pool: market.pool });
    });
  }

  for (const marketMaker of marketMakers) {
    it(`Increase and decrease position accounting for direct token transfers (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const tunaPositionAddress = (await getTunaSpotPositionAddress(signer.address, market.pool))[0];

      const signerAtaA = (
        await findAssociatedTokenPda({
          mint: market.mintA.address,
          owner: signer.address,
          tokenProgram: market.mintA.programAddress,
        })
      )[0];

      const signerAtaB = (
        await findAssociatedTokenPda({
          mint: market.mintB.address,
          owner: signer.address,
          tokenProgram: market.mintB.programAddress,
        })
      )[0];

      await openTunaSpotPosition({
        rpc,
        positionToken: PoolToken.A,
        collateralToken: PoolToken.A,
        pool: market.pool,
      });

      const tunaPositionAtaA = (
        await findAssociatedTokenPda({
          owner: tunaPositionAddress,
          mint: market.mintA.address,
          tokenProgram: market.mintA.programAddress,
        })
      )[0];

      const tunaPositionAtaB = (
        await findAssociatedTokenPda({
          owner: tunaPositionAddress,
          mint: market.mintB.address,
          tokenProgram: market.mintB.programAddress,
        })
      )[0];

      const transferTokensToThePosition = async () => {
        await sendTransaction([
          getTransferInstruction(
            {
              authority: signer,
              source: signerAtaA,
              destination: tunaPositionAtaA,
              amount: 1_000_000_000n,
            },
            { programAddress: market.mintA.programAddress },
          ),
          getTransferInstruction(
            {
              authority: signer,
              source: signerAtaB,
              destination: tunaPositionAtaB,
              amount: 402_000_000n,
            },
            { programAddress: market.mintB.programAddress },
          ),
        ]);
      };

      // Transfer tokens directly to the position.
      await transferTokensToThePosition();

      assertIncreaseTunaSpotPosition(
        await increaseTunaSpotPosition({
          rpc,
          pool: market.pool,
          collateralAmount: 1_000_000_000n,
          borrowAmount: 402_000_000n,
        }),
        { amountA: 6005579747n, amountB: 0n },
      );

      // Transfer tokens directly to the position.
      await transferTokensToThePosition();

      assertDecreaseTunaSpotPosition(
        await decreaseTunaSpotPosition({
          rpc,
          pool: market.pool,
          withdrawPercent: HUNDRED_PERCENT,
        }),
        {
          amountA: 0n,
          amountB: 0n,
          userBalanceDeltaA: 5000377846n,
          userBalanceDeltaB: 402000000n,
          vaultBalanceDeltaA: 0n,
          vaultBalanceDeltaB: 402000000n,
        },
      );

      await closeTunaSpotPosition({ rpc, pool: market.pool });
    });
  }

  for (const marketMaker of marketMakers) {
    it(`Open a LONG position, decrease and reset it to a SHORT (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const tunaPositionAddress = (await getTunaSpotPositionAddress(signer.address, market.pool))[0];

      await openTunaSpotPosition({
        rpc,
        positionToken: PoolToken.A,
        collateralToken: PoolToken.A,
        pool: market.pool,
      });

      await increaseTunaSpotPosition({
        rpc,
        pool: market.pool,
        collateralAmount: 1_000_000_000n,
        borrowAmount: 400_000_000n,
      });

      const resetTx = async () =>
        sendTransaction([
          await resetTunaSpotPositionInstruction(rpc, signer, market.pool, {
            collateralToken: PoolToken.B,
            positionToken: PoolToken.B,
          }),
        ]);

      await assert.rejects(resetTx, err => {
        expect((err as Error).toString()).contain(
          `custom program error: ${"0x" + TUNA_ERROR__POSITION_NOT_EMPTY.toString(16)}`,
        );
        return true;
      });

      await decreaseTunaSpotPosition({
        rpc,
        pool: market.pool,
        withdrawPercent: HUNDRED_PERCENT,
      });

      await resetTx();

      const tunaPosition = await fetchTunaSpotPosition(rpc, tunaPositionAddress);

      expect(tunaPosition.data.positionToken).toEqual(PoolToken.B);
      expect(tunaPosition.data.collateralToken).toEqual(PoolToken.B);

      await closeTunaSpotPosition({ rpc, pool: market.pool });
    });
  }

  for (const marketMaker of marketMakers) {
    it(`Fails to increase a position if it exceeds the allowed limit (${MarketMaker[marketMaker]})`, async () => {
      // Override the test market setting the position size limit
      const market = await setupTestMarket(
        {
          marketMaker,
          addressLookupTable: DEFAULT_ADDRESS,
          borrowLimitA: 0n,
          borrowLimitB: 0n,
          disabled: false,
          liquidationFee: 10000, // 1%
          liquidationThreshold: 920000, // 92%
          maxLeverage: (LEVERAGE_ONE * 1020) / 100,
          maxSwapSlippage: 0,
          oraclePriceDeviationThreshold: HUNDRED_PERCENT, // Allow large deviation for tests
          protocolFee: 1000, // 0.1%
          protocolFeeOnCollateral: 1000, // 0.1%
          limitOrderExecutionFee: 1000, // 0.1%
          rebalanceProtocolFee: HUNDRED_PERCENT / 10,
          spotPositionSizeLimitA: 0n,
          spotPositionSizeLimitB: 0n,
        },
        false,
        false,
      );

      await openTunaSpotPosition({
        rpc,
        positionToken: PoolToken.A,
        collateralToken: PoolToken.A,
        pool: market.pool,
      });

      await assert.rejects(
        increaseTunaSpotPosition({
          rpc,
          pool: market.pool,
          collateralAmount: 100_000_000n, // token A
          borrowAmount: 10_000_000n, // token B
        }),
        err => {
          expect((err as Error).toString()).contain(
            `custom program error: ${"0x" + TUNA_ERROR__POSITION_SIZE_LIMIT_EXCEEDED.toString(16)}`,
          );
          return true;
        },
      );
    });
  }

  for (const marketMaker of marketMakers) {
    it(`Fails to open a position due to amount slippage (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;

      await assert.rejects(
        openAndIncreaseTunaSpotPosition({
          rpc,
          pool: market.pool,
          positionToken: PoolToken.A,
          collateralToken: PoolToken.A,
          collateralAmount: 10_000_000_000n,
          borrowAmount: 4000_000_000n,
          minSwapAmountOut: 19_900_000_000n,
        }),
        err => {
          expect((err as Error).toString()).contain(
            `custom program error: ${"0x" + TUNA_ERROR__AMOUNT_SLIPPAGE_EXCEEDED.toString(16)}`,
          );
          return true;
        },
      );

      await assert.rejects(
        openAndIncreaseTunaSpotPosition({
          rpc,
          pool: market.pool,
          positionToken: PoolToken.A,
          collateralToken: PoolToken.B,
          collateralAmount: 2000_000_000n,
          borrowAmount: 4000_000_000n,
          minSwapAmountOut: 29_900_000_000n,
        }),
        err => {
          expect((err as Error).toString()).contain(
            `custom program error: ${"0x" + TUNA_ERROR__AMOUNT_SLIPPAGE_EXCEEDED.toString(16)}`,
          );
          return true;
        },
      );
    });
  }

  for (const marketMaker of marketMakers) {
    it(`Fails to close a position due to amount slippage (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;

      await openAndIncreaseTunaSpotPosition({
        rpc,
        pool: market.pool,
        positionToken: PoolToken.A,
        collateralToken: PoolToken.A,
        collateralAmount: 10_000_000_000n,
        borrowAmount: 4000_000_000n,
      });

      await assert.rejects(
        closeActiveTunaSpotPosition({ rpc, pool: market.pool, maxSwapAmountIn: 19_000_000_000n }),
        err => {
          expect((err as Error).toString()).contain(
            `custom program error: ${"0x" + TUNA_ERROR__AMOUNT_SLIPPAGE_EXCEEDED.toString(16)}`,
          );
          return true;
        },
      );

      await closeActiveTunaSpotPosition({ rpc, pool: market.pool });

      await openAndIncreaseTunaSpotPosition({
        rpc,
        pool: market.pool,
        positionToken: PoolToken.A,
        collateralToken: PoolToken.B,
        collateralAmount: 2000_000_000n,
        borrowAmount: 4000_000_000n,
      });

      await assert.rejects(
        closeActiveTunaSpotPosition({ rpc, pool: market.pool, maxSwapAmountIn: 29_000_000_000n }),
        err => {
          expect((err as Error).toString()).contain(
            `custom program error: ${"0x" + TUNA_ERROR__AMOUNT_SLIPPAGE_EXCEEDED.toString(16)}`,
          );
          return true;
        },
      );

      await closeActiveTunaSpotPosition({ rpc, pool: market.pool });
    });
  }
});
