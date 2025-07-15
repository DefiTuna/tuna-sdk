import { fetchWhirlpool, getPositionAddress } from "@orca-so/whirlpools-client";
import { generateKeyPairSigner } from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token-2022";
import assert from "assert";
import { Clock } from "solana-bankrun";
import { beforeEach, describe, expect, it } from "vitest";

import {
  closePositionOrcaInstruction,
  COMPUTED_AMOUNT,
  DEFAULT_ADDRESS,
  fetchTunaPosition,
  getSetTunaPositionFlagsInstruction,
  getTunaPositionAddress,
  HUNDRED_PERCENT,
  LEVERAGE_ONE,
  MarketMaker,
  NO_STOP_LOSS,
  NO_TAKE_PROFIT,
  openPositionOrcaInstruction,
  TUNA_ERROR__POSITION_IS_HEALTHY,
  TUNA_ERROR__POSITION_IS_UNHEALTHY,
  TUNA_ERROR__POSITION_NOT_EMPTY,
  TUNA_ERROR__REBALANCE_CONDITIONS_NOT_MET,
  TUNA_POSITION_FLAGS_ALLOW_REBALANCING,
  TUNA_POSITION_FLAGS_STOP_LOSS_SWAP_TO_TOKEN_B,
  TUNA_POSITION_FLAGS_TAKE_PROFIT_SWAP_TO_TOKEN_A,
  TunaPositionState,
} from "../src";

import { addLiquidity, assertAddLiquidity } from "./helpers/addLiquidity.ts";
import { ALICE_KEYPAIR, LIQUIDATOR_KEYPAIR } from "./helpers/addresses.ts";
import { closePosition } from "./helpers/closePosition.ts";
import { closePositionWithLiquidity } from "./helpers/closePositionWithLiquidity.ts";
import { assertCollectAndCompoundFees, collectAndCompoundFees } from "./helpers/collectAndCompoundFees.ts";
import { assertCollectFees, collectFees } from "./helpers/collectFees.ts";
import { fetchPool } from "./helpers/fetch.ts";
import { assertLiquidatePosition, liquidatePosition } from "./helpers/liquidatePosition.ts";
import { getTestContext, rpc, sendTransaction, signer } from "./helpers/mockRpc.ts";
import { openPosition } from "./helpers/openPosition.ts";
import { openPositionWithLiquidity } from "./helpers/openPositionWithLiquidity.ts";
import { updateFeesAndRewards } from "./helpers/orca.ts";
import { assertRebalancePosition, rebalancePosition } from "./helpers/rebalancePosition.ts";
import { assertRemoveLiquidity, removeLiquidity } from "./helpers/removeLiquidity.ts";
import { repayDebt } from "./helpers/repayDebt.ts";
import { setupTestMarket, TestMarket } from "./helpers/setup.ts";
import { accountExists } from "./helpers/solana.ts";
import { swapExactInput } from "./helpers/swap.ts";

describe("Tuna Position", () => {
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
      oraclePriceDeviationThreshold: HUNDRED_PERCENT / 2, // Allow large deviation for tests
      protocolFee: 1000, // 0.1%
      protocolFeeOnCollateral: 1000, // 0.1%
      limitOrderExecutionFee: 1000, // 0.1%
      rebalanceProtocolFee: HUNDRED_PERCENT / 10,
    };
    testOrcaMarket = await setupTestMarket({ marketMaker: MarketMaker.Orca, ...marketArgs });
    testFusionMarket = await setupTestMarket({ marketMaker: MarketMaker.Fusion, ...marketArgs });
    markets = [testOrcaMarket, testFusionMarket];
  });

  it("Open and close a position ensuring that all token accounts are closed", async () => {
    const positionMintKeypair = await generateKeyPairSigner();
    const tunaPositionAddress = (await getTunaPositionAddress(positionMintKeypair.address))[0];

    const tunaPositionAtaA = (
      await findAssociatedTokenPda({
        owner: tunaPositionAddress,
        mint: testOrcaMarket.mintA.address,
        tokenProgram: testOrcaMarket.mintA.programAddress,
      })
    )[0];

    const tunaPositionAtaB = (
      await findAssociatedTokenPda({
        owner: tunaPositionAddress,
        mint: testOrcaMarket.mintB.address,
        tokenProgram: testOrcaMarket.mintB.programAddress,
      })
    )[0];

    const whirlpool = await fetchWhirlpool(rpc, testOrcaMarket.pool);
    const actualTickIndex =
      whirlpool.data.tickCurrentIndex - (whirlpool.data.tickCurrentIndex % whirlpool.data.tickSpacing);

    await openPosition({
      signer,
      positionMint: positionMintKeypair,
      pool: whirlpool.address,
      tickLowerIndex: actualTickIndex - whirlpool.data.tickSpacing,
      tickUpperIndex: actualTickIndex + whirlpool.data.tickSpacing,
    });

    expect(await accountExists(rpc, tunaPositionAddress)).toBeTruthy();
    expect(await accountExists(rpc, positionMintKeypair.address)).toBeTruthy();
    expect(await accountExists(rpc, tunaPositionAtaA)).toBeTruthy();
    expect(await accountExists(rpc, tunaPositionAtaB)).toBeTruthy();

    await sendTransaction([await closePositionOrcaInstruction(rpc, signer, positionMintKeypair.address)]);

    expect(await accountExists(rpc, tunaPositionAddress)).toBeFalsy();
    expect(await accountExists(rpc, positionMintKeypair.address)).toBeFalsy();
    expect(await accountExists(rpc, tunaPositionAtaA)).toBeFalsy();
    expect(await accountExists(rpc, tunaPositionAtaB)).toBeFalsy();
  });

  it("Set tuna position flags", async () => {
    const positionMintKeypair = await generateKeyPairSigner();

    const whirlpool = await fetchWhirlpool(rpc, testOrcaMarket.pool);

    const actualTickIndex =
      whirlpool.data.tickCurrentIndex - (whirlpool.data.tickCurrentIndex % whirlpool.data.tickSpacing);

    await sendTransaction([
      await openPositionOrcaInstruction(rpc, signer, positionMintKeypair, whirlpool.address, {
        tickLowerIndex: actualTickIndex - whirlpool.data.tickSpacing,
        tickUpperIndex: actualTickIndex + whirlpool.data.tickSpacing,
        tickStopLossIndex: NO_STOP_LOSS,
        tickTakeProfitIndex: NO_TAKE_PROFIT,
        flags: 0,
      }),
    ]);

    const tunaPositionAddress = (await getTunaPositionAddress(positionMintKeypair.address))[0];
    let tunaPosition = await fetchTunaPosition(rpc, tunaPositionAddress);
    expect(tunaPosition.data.flags).toEqual(0);

    // Set flags
    const flags = (1 << 6) - 1; // 111111
    await sendTransaction([
      getSetTunaPositionFlagsInstruction({ authority: signer, flags, tunaPosition: tunaPositionAddress }),
    ]);

    tunaPosition = await fetchTunaPosition(rpc, tunaPositionAddress);
    expect(tunaPosition.data.flags).toEqual(flags);
  });

  for (const marketMaker of marketMakers) {
    it(`One-sided long position without swap (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const positionMintKeypair = await generateKeyPairSigner();
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const actualTickIndex = pool.data.tickCurrentIndex - (pool.data.tickCurrentIndex % pool.data.tickSpacing);

      await openPosition({
        signer,
        positionMint: positionMintKeypair,
        pool: pool.address,
        tickLowerIndex: actualTickIndex + pool.data.tickSpacing,
        tickUpperIndex: actualTickIndex + pool.data.tickSpacing * 5,
      });

      assertAddLiquidity(
        await addLiquidity({
          rpc,
          positionMint: positionMintKeypair.address,
          pool: pool.address,
          collateralA: 2_000_000_000n,
          collateralB: 0n,
          borrowA: 0n,
          borrowB: 0n,
        }),
        {
          userBalanceDeltaA: -2000000000n,
          userBalanceDeltaB: 0n,
          vaultBalanceDeltaA: 0n,
          vaultBalanceDeltaB: 0n,
          poolBalanceDeltaA: 1998000000n,
          poolBalanceDeltaB: 0n,
          leftoversA: 0n,
          leftoversB: 0n,
        },
      );

      assertRemoveLiquidity(
        await removeLiquidity({
          rpc,
          signer,
          positionMint: positionMintKeypair.address,
          pool: pool.address,
          closePosition: true,
        }),
        {
          userBalanceDeltaA: 1997999999n,
          userBalanceDeltaB: 0n,
          vaultBalanceDeltaA: 0n,
          vaultBalanceDeltaB: 0n,
          poolBalanceDeltaA: -1997999999n,
          poolBalanceDeltaB: 0n,
        },
      );
    });
  }

  it("One-sided long position (wsol) without swap", async () => {
    // Override the test market using WSOL for MintA
    testOrcaMarket = await setupTestMarket(
      {
        addressLookupTable: DEFAULT_ADDRESS,
        borrowLimitA: 0n,
        borrowLimitB: 0n,
        disabled: false,
        liquidationFee: 10000, // 1%
        liquidationThreshold: 820000, // 82%
        marketMaker: 0,
        maxLeverage: (LEVERAGE_ONE * 509) / 100,
        maxSwapSlippage: 0,
        oraclePriceDeviationThreshold: HUNDRED_PERCENT / 2, // Allow large deviation for tests
        protocolFee: 1000, // 0.1%
        protocolFeeOnCollateral: 1000, // 0.1%
        limitOrderExecutionFee: 1000, // 0.1%
        rebalanceProtocolFee: HUNDRED_PERCENT / 10,
      },
      true,
    );

    const positionMintKeypair = await generateKeyPairSigner();
    const whirlpool = await fetchWhirlpool(rpc, testOrcaMarket.pool);
    const actualTickIndex =
      whirlpool.data.tickCurrentIndex - (whirlpool.data.tickCurrentIndex % whirlpool.data.tickSpacing);

    await openPosition({
      signer,
      positionMint: positionMintKeypair,
      pool: whirlpool.address,
      tickLowerIndex: actualTickIndex + whirlpool.data.tickSpacing,
      tickUpperIndex: actualTickIndex + whirlpool.data.tickSpacing * 5,
    });

    assertAddLiquidity(
      await addLiquidity({
        rpc,
        positionMint: positionMintKeypair.address,
        pool: testOrcaMarket.pool,
        collateralA: 2_000_000_000n,
        collateralB: 0n,
        borrowA: 0n,
        borrowB: 0n,
      }),
      {
        userBalanceDeltaA: -2000000000n,
        userBalanceDeltaB: 0n,
        vaultBalanceDeltaA: 0n,
        vaultBalanceDeltaB: 0n,
        poolBalanceDeltaA: 1998000000n,
        poolBalanceDeltaB: 0n,
        leftoversA: 0n,
        leftoversB: 0n,
      },
    );

    assertRemoveLiquidity(
      await removeLiquidity({
        rpc,
        signer,
        positionMint: positionMintKeypair.address,
        pool: testOrcaMarket.pool,
        closePosition: true,
      }),
      {
        userBalanceDeltaA: 1997999999n,
        userBalanceDeltaB: 0n,
        vaultBalanceDeltaA: 0n,
        vaultBalanceDeltaB: 0n,
        poolBalanceDeltaA: -1997999999n,
        poolBalanceDeltaB: 0n,
      },
    );
  });

  for (const marketMaker of marketMakers) {
    it(`One-sided short position without swap (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const positionMintKeypair = await generateKeyPairSigner();
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const actualTickIndex = pool.data.tickCurrentIndex - (pool.data.tickCurrentIndex % pool.data.tickSpacing);

      await openPosition({
        signer,
        positionMint: positionMintKeypair,
        pool: pool.address,
        tickLowerIndex: actualTickIndex - pool.data.tickSpacing * 5,
        tickUpperIndex: actualTickIndex - pool.data.tickSpacing,
      });

      assertAddLiquidity(
        await addLiquidity({
          rpc,
          positionMint: positionMintKeypair.address,
          pool: pool.address,
          collateralA: 0n,
          collateralB: 2_000_000_000n,
          borrowA: 0n,
          borrowB: 0n,
        }),
        {
          userBalanceDeltaA: 0n,
          userBalanceDeltaB: -2000000000n,
          vaultBalanceDeltaA: 0n,
          vaultBalanceDeltaB: 0n,
          poolBalanceDeltaA: 0n,
          poolBalanceDeltaB: 1998000000n,
          leftoversA: 0n,
          leftoversB: 0n,
        },
      );

      assertRemoveLiquidity(
        await removeLiquidity({
          rpc,
          signer,
          positionMint: positionMintKeypair.address,
          pool: pool.address,
          closePosition: true,
        }),
        {
          userBalanceDeltaA: 0n,
          userBalanceDeltaB: 1997999999n,
          vaultBalanceDeltaA: 0n,
          vaultBalanceDeltaB: 0n,
          poolBalanceDeltaA: 0n,
          poolBalanceDeltaB: -1997999999n,
        },
      );
    });
  }

  for (const marketMaker of marketMakers) {
    it(`One-sided long position without swap with leverage (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const positionMintKeypair = await generateKeyPairSigner();
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const actualTickIndex = pool.data.tickCurrentIndex - (pool.data.tickCurrentIndex % pool.data.tickSpacing);

      await openPosition({
        signer,
        positionMint: positionMintKeypair,
        pool: pool.address,
        tickLowerIndex: actualTickIndex + pool.data.tickSpacing,
        tickUpperIndex: actualTickIndex + pool.data.tickSpacing * 5,
      });

      assertAddLiquidity(
        await addLiquidity({
          rpc,
          positionMint: positionMintKeypair.address,
          pool: pool.address,
          collateralA: 1_000_000_000n,
          collateralB: 0n,
          borrowA: 1_000_000_000n,
          borrowB: 0n,
        }),
        {
          userBalanceDeltaA: -1000000000n,
          userBalanceDeltaB: 0n,
          vaultBalanceDeltaA: -1000000000n,
          vaultBalanceDeltaB: 0n,
          poolBalanceDeltaA: 1998000000n,
          poolBalanceDeltaB: 0n,
          leftoversA: 0n,
          leftoversB: 0n,
        },
      );

      assertRemoveLiquidity(
        await removeLiquidity({
          rpc,
          signer,
          positionMint: positionMintKeypair.address,
          pool: pool.address,
          closePosition: true,
        }),
        {
          userBalanceDeltaA: 997999999n,
          userBalanceDeltaB: 0n,
          vaultBalanceDeltaA: 1000000000n,
          vaultBalanceDeltaB: 0n,
          poolBalanceDeltaA: -1997999999n,
          poolBalanceDeltaB: 0n,
        },
      );
    });
  }

  for (const marketMaker of marketMakers) {
    it(`One-sided short position without swap with leverage (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const positionMintKeypair = await generateKeyPairSigner();
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const actualTickIndex = pool.data.tickCurrentIndex - (pool.data.tickCurrentIndex % pool.data.tickSpacing);

      await openPosition({
        signer,
        positionMint: positionMintKeypair,
        pool: pool.address,
        tickLowerIndex: actualTickIndex - pool.data.tickSpacing * 5,
        tickUpperIndex: actualTickIndex - pool.data.tickSpacing,
      });

      assertAddLiquidity(
        await addLiquidity({
          rpc,
          positionMint: positionMintKeypair.address,
          pool: pool.address,
          collateralA: 0n,
          collateralB: 1_000_000_000n,
          borrowA: 0n,
          borrowB: 1_000_000_000n,
        }),
        {
          userBalanceDeltaA: 0n,
          userBalanceDeltaB: -1000000000n,
          vaultBalanceDeltaA: 0n,
          vaultBalanceDeltaB: -1000000000n,
          poolBalanceDeltaA: 0n,
          poolBalanceDeltaB: 1998000000n,
          leftoversA: 0n,
          leftoversB: 0n,
        },
      );

      assertRemoveLiquidity(
        await removeLiquidity({
          rpc,
          signer,
          positionMint: positionMintKeypair.address,
          pool: pool.address,
          closePosition: true,
        }),
        {
          userBalanceDeltaA: 0n,
          userBalanceDeltaB: 997999999n,
          vaultBalanceDeltaA: 0n,
          vaultBalanceDeltaB: 1000000000n,
          poolBalanceDeltaA: 0n,
          poolBalanceDeltaB: -1997999999n,
        },
      );
    });
  }

  for (const marketMaker of marketMakers) {
    it(`One-sided long position with B->A swap with leverage (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const positionMintKeypair = await generateKeyPairSigner();
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const actualTickIndex = pool.data.tickCurrentIndex - (pool.data.tickCurrentIndex % pool.data.tickSpacing);

      await openPosition({
        signer,
        positionMint: positionMintKeypair,
        pool: pool.address,
        tickLowerIndex: actualTickIndex + pool.data.tickSpacing,
        tickUpperIndex: actualTickIndex + pool.data.tickSpacing * 5,
      });

      assertAddLiquidity(
        await addLiquidity({
          rpc,
          positionMint: positionMintKeypair.address,
          pool: pool.address,
          collateralA: 0n,
          collateralB: 1_000_000_000n,
          borrowA: 0n,
          borrowB: 1_000_000_000n,
        }),
        {
          userBalanceDeltaA: 0n,
          userBalanceDeltaB: -1000000000n,
          vaultBalanceDeltaA: 0n,
          vaultBalanceDeltaB: -1000000000n,
          poolBalanceDeltaA: 0n,
          poolBalanceDeltaB: 1998000000n,
          leftoversA: 0n,
          leftoversB: 0n,
        },
      );

      assertRemoveLiquidity(
        await removeLiquidity({
          rpc,
          signer,
          positionMint: positionMintKeypair.address,
          pool: pool.address,
          closePosition: true,
        }),
        {
          userBalanceDeltaA: 4974415002n,
          userBalanceDeltaB: 0n,
          vaultBalanceDeltaA: 0n,
          vaultBalanceDeltaB: 1000000000n,
          poolBalanceDeltaA: -4974415002n,
          poolBalanceDeltaB: -1000000000n,
        },
      );
    });
  }

  for (const marketMaker of marketMakers) {
    it(`One-sided short position with A->B swap with leverage (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const positionMintKeypair = await generateKeyPairSigner();
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const actualTickIndex = pool.data.tickCurrentIndex - (pool.data.tickCurrentIndex % pool.data.tickSpacing);

      await openPosition({
        signer,
        positionMint: positionMintKeypair,
        pool: pool.address,
        tickLowerIndex: actualTickIndex - pool.data.tickSpacing * 5,
        tickUpperIndex: actualTickIndex - pool.data.tickSpacing,
      });

      assertAddLiquidity(
        await addLiquidity({
          rpc,
          positionMint: positionMintKeypair.address,
          pool: pool.address,
          collateralA: 1_000_000_000n,
          collateralB: 0n,
          borrowA: 1_000_000_000n,
          borrowB: 0n,
        }),
        {
          userBalanceDeltaA: -1000000000n,
          userBalanceDeltaB: 0n,
          vaultBalanceDeltaA: -1000000000n,
          vaultBalanceDeltaB: 0n,
          poolBalanceDeltaA: 1998000000n,
          poolBalanceDeltaB: 0n,
          leftoversA: 0n,
          leftoversB: 0n,
        },
      );

      assertRemoveLiquidity(
        await removeLiquidity({
          rpc,
          signer,
          positionMint: positionMintKeypair.address,
          pool: pool.address,
          closePosition: true,
        }),
        {
          userBalanceDeltaA: 0n,
          userBalanceDeltaB: 199331241n,
          vaultBalanceDeltaA: 1000000000n,
          vaultBalanceDeltaB: 0n,
          poolBalanceDeltaA: -1000000000n,
          poolBalanceDeltaB: -199331241n,
        },
      );
    });
  }

  for (const marketMaker of marketMakers) {
    it(`Adds liquidity with leverage to a two-sided position, providing only token A (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const positionMintKeypair = await generateKeyPairSigner();
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const actualTickIndex = pool.data.tickCurrentIndex - (pool.data.tickCurrentIndex % pool.data.tickSpacing);

      await openPosition({
        signer,
        positionMint: positionMintKeypair,
        pool: pool.address,
        tickLowerIndex: actualTickIndex - pool.data.tickSpacing * 5,
        tickUpperIndex: actualTickIndex + pool.data.tickSpacing * 5,
      });

      assertAddLiquidity(
        await addLiquidity({
          rpc,
          positionMint: positionMintKeypair.address,
          pool: pool.address,
          collateralA: 1_000_000_000n,
          collateralB: 0n,
          borrowA: 1_000_000_000n,
          borrowB: 0n,
        }),
        {
          userBalanceDeltaA: -1000000000n,
          userBalanceDeltaB: 0n,
          vaultBalanceDeltaA: -1000000000n,
          vaultBalanceDeltaB: 0n,
          poolBalanceDeltaA: 1998000000n,
          poolBalanceDeltaB: -11n,
          leftoversA: 0n,
          leftoversB: 11n,
        },
      );

      assertRemoveLiquidity(
        await removeLiquidity({
          rpc,
          signer,
          positionMint: positionMintKeypair.address,
          pool: pool.address,
          closePosition: true,
        }),
        {
          userBalanceDeltaA: 119946468n,
          userBalanceDeltaB: 175489131n,
          vaultBalanceDeltaA: 1000000000n,
          vaultBalanceDeltaB: 0n,
          poolBalanceDeltaA: -1119946468n,
          poolBalanceDeltaB: -175489120n,
        },
      );
    });
  }

  for (const marketMaker of marketMakers) {
    it(`Adds liquidity with leverage to a two-sided position, providing only token B (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const positionMintKeypair = await generateKeyPairSigner();
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const actualTickIndex = pool.data.tickCurrentIndex - (pool.data.tickCurrentIndex % pool.data.tickSpacing);

      await openPosition({
        signer,
        positionMint: positionMintKeypair,
        pool: pool.address,
        tickLowerIndex: actualTickIndex - pool.data.tickSpacing * 5,
        tickUpperIndex: actualTickIndex + pool.data.tickSpacing * 5,
      });

      assertAddLiquidity(
        await addLiquidity({
          rpc,
          positionMint: positionMintKeypair.address,
          pool: pool.address,
          collateralA: 0n,
          collateralB: 1_000_000_000n,
          borrowA: 0n,
          borrowB: 1_000_000_000n,
        }),
        {
          userBalanceDeltaA: 0n,
          userBalanceDeltaB: -1000000000n,
          vaultBalanceDeltaA: 0n,
          vaultBalanceDeltaB: -1000000000n,
          poolBalanceDeltaA: -405n,
          poolBalanceDeltaB: 1998000000n,
          leftoversA: 405n,
          leftoversB: 0n,
        },
      );

      assertRemoveLiquidity(
        await removeLiquidity({
          rpc,
          signer,
          positionMint: positionMintKeypair.address,
          pool: pool.address,
          closePosition: true,
        }),
        {
          userBalanceDeltaA: 4796455542n,
          userBalanceDeltaB: 36358256n,
          vaultBalanceDeltaA: 0n,
          vaultBalanceDeltaB: 1000000000n,
          poolBalanceDeltaA: -4796455137n,
          poolBalanceDeltaB: -1036358256n,
        },
      );
    });
  }

  for (const marketMaker of marketMakers) {
    it(`Add liquidity twice to a one-sided long position without swap with leverage (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const positionMintKeypair = await generateKeyPairSigner();
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const actualTickIndex = pool.data.tickCurrentIndex - (pool.data.tickCurrentIndex % pool.data.tickSpacing);

      await openPosition({
        signer,
        positionMint: positionMintKeypair,
        pool: pool.address,
        tickLowerIndex: actualTickIndex + pool.data.tickSpacing,
        tickUpperIndex: actualTickIndex + pool.data.tickSpacing * 5,
      });

      for (let i = 0; i < 2; i++) {
        assertAddLiquidity(
          await addLiquidity({
            rpc,
            positionMint: positionMintKeypair.address,
            pool: pool.address,
            collateralA: 1_000_000_000n,
            collateralB: 0n,
            borrowA: 1_000_000_000n,
            borrowB: 0n,
          }),
          {
            userBalanceDeltaA: -1000000000n,
            userBalanceDeltaB: 0n,
            vaultBalanceDeltaA: -1000000000n,
            vaultBalanceDeltaB: 0n,
            poolBalanceDeltaA: 1998000000n,
            poolBalanceDeltaB: 0n,
            leftoversA: 0n,
            leftoversB: 0n,
          },
        );
      }

      assertRemoveLiquidity(
        await removeLiquidity({
          rpc,
          signer,
          positionMint: positionMintKeypair.address,
          pool: pool.address,
          closePosition: true,
        }),
        {
          userBalanceDeltaA: 1995999999n,
          userBalanceDeltaB: 0n,
          vaultBalanceDeltaA: 2000000000n,
          vaultBalanceDeltaB: 0n,
          poolBalanceDeltaA: -3995999999n,
          poolBalanceDeltaB: 0n,
        },
      );
    });
  }

  for (const marketMaker of marketMakers) {
    it(`Remove liquidity partially form a one-sided long position with leverage (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const positionMintKeypair = await generateKeyPairSigner();
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const actualTickIndex = pool.data.tickCurrentIndex - (pool.data.tickCurrentIndex % pool.data.tickSpacing);

      await openPosition({
        signer,
        positionMint: positionMintKeypair,
        pool: pool.address,
        tickLowerIndex: actualTickIndex + pool.data.tickSpacing,
        tickUpperIndex: actualTickIndex + pool.data.tickSpacing * 5,
      });

      assertAddLiquidity(
        await addLiquidity({
          rpc,
          positionMint: positionMintKeypair.address,
          pool: pool.address,
          collateralA: 2_000_000_000n,
          collateralB: 0n,
          borrowA: 2_000_000_000n,
          borrowB: 0n,
        }),
        {
          userBalanceDeltaA: -2000000000n,
          userBalanceDeltaB: 0n,
          vaultBalanceDeltaA: -2000000000n,
          vaultBalanceDeltaB: 0n,
          poolBalanceDeltaA: 3996000000n,
          poolBalanceDeltaB: 0n,
          leftoversA: 0n,
          leftoversB: 0n,
        },
      );

      assertRemoveLiquidity(
        await removeLiquidity({
          rpc,
          signer,
          positionMint: positionMintKeypair.address,
          pool: pool.address,
          withdrawPercent: HUNDRED_PERCENT / 2,
        }),
        {
          userBalanceDeltaA: 997999999n,
          userBalanceDeltaB: 0n,
          vaultBalanceDeltaA: 1000000000n,
          vaultBalanceDeltaB: 0n,
          poolBalanceDeltaA: -1997999999n,
          poolBalanceDeltaB: 0n,
        },
      );

      assertRemoveLiquidity(
        await removeLiquidity({
          rpc,
          signer,
          positionMint: positionMintKeypair.address,
          pool: pool.address,
          withdrawPercent: HUNDRED_PERCENT,
          closePosition: true,
        }),
        {
          userBalanceDeltaA: 998000000n,
          userBalanceDeltaB: 0n,
          vaultBalanceDeltaA: 1000000000n,
          vaultBalanceDeltaB: 0n,
          poolBalanceDeltaA: -1998000000n,
          poolBalanceDeltaB: 0n,
        },
      );
    });
  }

  for (const marketMaker of marketMakers) {
    it(`Fails to remove more than 100% of liquidity (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const positionMintKeypair = await generateKeyPairSigner();
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const actualTickIndex = pool.data.tickCurrentIndex - (pool.data.tickCurrentIndex % pool.data.tickSpacing);

      await openPosition({
        signer,
        positionMint: positionMintKeypair,
        pool: pool.address,
        tickLowerIndex: actualTickIndex + pool.data.tickSpacing,
        tickUpperIndex: actualTickIndex + pool.data.tickSpacing * 5,
      });

      await addLiquidity({
        rpc,
        positionMint: positionMintKeypair.address,
        pool: pool.address,
        collateralA: 2_000_000_000n,
        collateralB: 0n,
        borrowA: 2_000_000_000n,
        borrowB: 0n,
      });

      await assert.rejects(
        removeLiquidity({
          rpc,
          signer,
          positionMint: positionMintKeypair.address,
          pool: pool.address,
          withdrawPercent: HUNDRED_PERCENT + 1,
          closePosition: true,
        }),
      );
    });
  }

  for (const marketMaker of marketMakers) {
    it(`Two-sided position with leverage and disabled swap: A provided, B calculated (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const positionMintKeypair = await generateKeyPairSigner();
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const actualTickIndex = pool.data.tickCurrentIndex - (pool.data.tickCurrentIndex % pool.data.tickSpacing);

      await openPosition({
        signer,
        positionMint: positionMintKeypair,
        pool: pool.address,
        tickLowerIndex: actualTickIndex - pool.data.tickSpacing * 5,
        tickUpperIndex: actualTickIndex + pool.data.tickSpacing * 5,
      });

      assertAddLiquidity(
        await addLiquidity({
          rpc,
          positionMint: positionMintKeypair.address,
          pool: pool.address,
          collateralA: 1_000_000_000n,
          collateralB: COMPUTED_AMOUNT,
          borrowA: 1_000_000_000n,
          borrowB: COMPUTED_AMOUNT,
        }),
        {
          userBalanceDeltaA: -1000000000n,
          userBalanceDeltaB: -164737435n,
          vaultBalanceDeltaA: -1000000000n,
          vaultBalanceDeltaB: -164737435n,
          poolBalanceDeltaA: 1998000000n,
          poolBalanceDeltaB: 329145395n,
          leftoversA: 0n,
          leftoversB: 1n,
        },
      );

      await removeLiquidity({
        rpc,
        signer,
        positionMint: positionMintKeypair.address,
        pool: pool.address,
        closePosition: true,
      });
    });
  }

  for (const marketMaker of marketMakers) {
    it(`Two-sided position with leverage and disabled swap: B provided, A calculated (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const positionMintKeypair = await generateKeyPairSigner();
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const actualTickIndex = pool.data.tickCurrentIndex - (pool.data.tickCurrentIndex % pool.data.tickSpacing);

      await openPosition({
        signer,
        positionMint: positionMintKeypair,
        pool: pool.address,
        tickLowerIndex: actualTickIndex - pool.data.tickSpacing * 5,
        tickUpperIndex: actualTickIndex + pool.data.tickSpacing * 5,
      });

      assertAddLiquidity(
        await addLiquidity({
          rpc,
          positionMint: positionMintKeypair.address,
          pool: pool.address,
          collateralA: COMPUTED_AMOUNT,
          collateralB: 1_000_000_000n,
          borrowA: COMPUTED_AMOUNT,
          borrowB: 1_000_000_000n,
        }),
        {
          userBalanceDeltaA: -6070265710n,
          userBalanceDeltaB: -1000000000n,
          vaultBalanceDeltaA: -6070265710n,
          vaultBalanceDeltaB: -1000000000n,
          poolBalanceDeltaA: 12128390889n,
          poolBalanceDeltaB: 1998000000n,
          leftoversA: 1n,
          leftoversB: 0n,
        },
      );

      await removeLiquidity({
        rpc,
        signer,
        positionMint: positionMintKeypair.address,
        pool: pool.address,
        closePosition: true,
      });
    });
  }

  for (const marketMaker of marketMakers) {
    it(`One-sided long position with leverage and disabled swap (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const positionMintKeypair = await generateKeyPairSigner();
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const actualTickIndex = pool.data.tickCurrentIndex - (pool.data.tickCurrentIndex % pool.data.tickSpacing);

      await openPosition({
        signer,
        positionMint: positionMintKeypair,
        pool: pool.address,
        tickLowerIndex: actualTickIndex + pool.data.tickSpacing,
        tickUpperIndex: actualTickIndex + pool.data.tickSpacing * 5,
      });

      // Fails to add liquidity with incorrect arguments
      await assert.rejects(
        addLiquidity({
          rpc,
          positionMint: positionMintKeypair.address,
          pool: pool.address,
          collateralA: COMPUTED_AMOUNT,
          collateralB: 1_000_000_000n,
          borrowA: COMPUTED_AMOUNT,
          borrowB: 1_000_000_000n,
        }),
      );

      assertAddLiquidity(
        await addLiquidity({
          rpc,
          positionMint: positionMintKeypair.address,
          pool: pool.address,
          collateralA: 1_000_000_000n,
          collateralB: COMPUTED_AMOUNT,
          borrowA: 1_000_000_000n,
          borrowB: COMPUTED_AMOUNT,
        }),
        {
          userBalanceDeltaA: -1000000000n,
          userBalanceDeltaB: 0n,
          vaultBalanceDeltaA: -1000000000n,
          vaultBalanceDeltaB: 0n,
          poolBalanceDeltaA: 1998000000n,
          poolBalanceDeltaB: 0n,
          leftoversA: 0n,
          leftoversB: 0n,
        },
      );

      await removeLiquidity({
        rpc,
        signer,
        positionMint: positionMintKeypair.address,
        pool: pool.address,
        closePosition: true,
      });
    });
  }

  for (const marketMaker of marketMakers) {
    it(`One-sided short position with leverage and disabled swap (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const positionMintKeypair = await generateKeyPairSigner();
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const actualTickIndex = pool.data.tickCurrentIndex - (pool.data.tickCurrentIndex % pool.data.tickSpacing);

      await openPosition({
        signer,
        positionMint: positionMintKeypair,
        pool: pool.address,
        tickLowerIndex: actualTickIndex - pool.data.tickSpacing * 5,
        tickUpperIndex: actualTickIndex - pool.data.tickSpacing,
      });

      // Fails to add liquidity with incorrect arguments
      await assert.rejects(
        addLiquidity({
          rpc,
          positionMint: positionMintKeypair.address,
          pool: pool.address,
          collateralA: 1_000_000_000n,
          collateralB: COMPUTED_AMOUNT,
          borrowA: 1_000_000_000n,
          borrowB: COMPUTED_AMOUNT,
        }),
      );

      assertAddLiquidity(
        await addLiquidity({
          rpc,
          positionMint: positionMintKeypair.address,
          pool: pool.address,
          collateralA: COMPUTED_AMOUNT,
          collateralB: 1_000_000_000n,
          borrowA: COMPUTED_AMOUNT,
          borrowB: 1_000_000_000n,
        }),
        {
          userBalanceDeltaA: 0n,
          userBalanceDeltaB: -1000000000n,
          vaultBalanceDeltaA: 0n,
          vaultBalanceDeltaB: -1000000000n,
          poolBalanceDeltaA: 0n,
          poolBalanceDeltaB: 1998000000n,
          leftoversA: 0n,
          leftoversB: 0n,
        },
      );

      await removeLiquidity({
        rpc,
        signer,
        positionMint: positionMintKeypair.address,
        pool: pool.address,
        closePosition: true,
      });
    });
  }

  for (const marketMaker of marketMakers) {
    it(`Collect position fees (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const positionMintKeypair = await generateKeyPairSigner();
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const actualTickIndex = pool.data.tickCurrentIndex - (pool.data.tickCurrentIndex % pool.data.tickSpacing);

      await openPosition({
        signer,
        positionMint: positionMintKeypair,
        pool: pool.address,
        tickLowerIndex: actualTickIndex - pool.data.tickSpacing * 20,
        tickUpperIndex: actualTickIndex + pool.data.tickSpacing * 20,
      });

      await addLiquidity({
        rpc,
        positionMint: positionMintKeypair.address,
        pool: pool.address,
        collateralA: 2_000_000_000n,
        collateralB: 0n,
        borrowA: 2_000_000_000n,
        borrowB: 0n,
      });

      await swapExactInput(rpc, signer, pool.address, 1_000_000_000n, market.mintA.address);

      assertCollectFees(
        await collectFees({
          rpc,
          signer,
          positionMint: positionMintKeypair.address,
          pool: pool.address,
        }),
        {
          userBalanceDeltaA: 4217n,
          userBalanceDeltaB: 0n,
          poolBalanceDeltaA: -4217n,
          poolBalanceDeltaB: 0n,
        },
      );

      await swapExactInput(rpc, signer, pool.address, 1_000_000_000n, market.mintB.address);

      assertCollectFees(
        await collectFees({
          rpc,
          signer,
          positionMint: positionMintKeypair.address,
          pool: pool.address,
        }),
        {
          userBalanceDeltaA: 0n,
          userBalanceDeltaB: 4217n,
          poolBalanceDeltaA: 0n,
          poolBalanceDeltaB: -4217n,
        },
      );

      // Nothing to collect
      assertCollectFees(
        await collectFees({
          rpc,
          signer,
          positionMint: positionMintKeypair.address,
          pool: pool.address,
        }),
        {
          userBalanceDeltaA: 0n,
          userBalanceDeltaB: 0n,
          poolBalanceDeltaA: 0n,
          poolBalanceDeltaB: 0n,
        },
      );

      await removeLiquidity({
        rpc,
        signer,
        positionMint: positionMintKeypair.address,
        pool: pool.address,
        withdrawPercent: HUNDRED_PERCENT,
        closePosition: true,
      });
    });
  }

  for (const marketMaker of marketMakers) {
    it(`Fails to increase, decrease, collect fees and close a position with non-authority wallet (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const positionMintKeypair = await generateKeyPairSigner();
      const positionMint = positionMintKeypair.address;
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const actualTickIndex = pool.data.tickCurrentIndex - (pool.data.tickCurrentIndex % pool.data.tickSpacing);

      await openPosition({
        signer,
        positionMint: positionMintKeypair,
        pool: pool.address,
        tickLowerIndex: actualTickIndex + pool.data.tickSpacing,
        tickUpperIndex: actualTickIndex + pool.data.tickSpacing * 5,
      });

      await addLiquidity({
        rpc,
        positionMint,
        pool: pool.address,
        collateralA: 2_000_000_000n,
        collateralB: 0n,
        borrowA: 2_000_000_000n,
        borrowB: 0n,
      });

      await assert.rejects(
        addLiquidity({
          rpc,
          signer: ALICE_KEYPAIR,
          positionMint,
          pool: pool.address,
          collateralA: 2_000_000_000n,
          collateralB: 0n,
          borrowA: 2_000_000_000n,
          borrowB: 0n,
        }),
      );

      await swapExactInput(rpc, signer, pool.address, 100_000_000n, market.mintA.address);

      await assert.rejects(
        collectFees({
          rpc,
          signer: ALICE_KEYPAIR,
          positionMint: positionMintKeypair.address,
          pool: pool.address,
        }),
      );

      await collectFees({
        rpc,
        signer,
        positionMint: positionMintKeypair.address,
        pool: pool.address,
      });

      await assert.rejects(
        removeLiquidity({
          rpc,
          signer: ALICE_KEYPAIR,
          positionMint: positionMintKeypair.address,
          pool: pool.address,
          withdrawPercent: HUNDRED_PERCENT,
        }),
      );

      await removeLiquidity({
        rpc,
        signer,
        positionMint: positionMintKeypair.address,
        pool: pool.address,
        withdrawPercent: HUNDRED_PERCENT,
      });

      await assert.rejects(closePosition({ rpc, signer: ALICE_KEYPAIR, positionMint }));
      await closePosition({ rpc, signer, positionMint });
    });
  }

  it("Fails to add liquidity because of the borrow limit", async () => {
    // Override the test market with opened interest
    testOrcaMarket = await setupTestMarket({
      addressLookupTable: DEFAULT_ADDRESS,
      borrowLimitA: 2_000_000_000n,
      borrowLimitB: 0n,
      disabled: false,
      liquidationFee: 10000, // 1%
      liquidationThreshold: 820000, // 82%
      marketMaker: 0,
      maxLeverage: (LEVERAGE_ONE * 509) / 100,
      maxSwapSlippage: 0,
      oraclePriceDeviationThreshold: HUNDRED_PERCENT / 2, // Allow large deviation for tests
      protocolFee: 1000, // 0.1%
      protocolFeeOnCollateral: 1000, // 0.1%
      limitOrderExecutionFee: 1000, // 0.1%
      rebalanceProtocolFee: HUNDRED_PERCENT / 10,
    });

    const positionMintKeypair = await generateKeyPairSigner();
    const whirlpool = await fetchWhirlpool(rpc, testOrcaMarket.pool);
    const actualTickIndex =
      whirlpool.data.tickCurrentIndex - (whirlpool.data.tickCurrentIndex % whirlpool.data.tickSpacing);

    await openPosition({
      signer,
      positionMint: positionMintKeypair,
      pool: whirlpool.address,
      tickLowerIndex: actualTickIndex + whirlpool.data.tickSpacing,
      tickUpperIndex: actualTickIndex + whirlpool.data.tickSpacing * 5,
    });

    // Borrow less than the limit
    await addLiquidity({
      rpc,
      signer,
      positionMint: positionMintKeypair.address,
      pool: testOrcaMarket.pool,
      collateralA: 1_000_000_000n,
      collateralB: 0n,
      borrowA: 1_000_000_000n,
      borrowB: 0n,
    });

    await assert.rejects(
      addLiquidity({
        rpc,
        signer,
        positionMint: positionMintKeypair.address,
        pool: testOrcaMarket.pool,
        collateralA: 1_000_000_000n,
        collateralB: 0n,
        borrowA: 1_000_000_001n, // Borrow more than allowed
        borrowB: 0n,
      }),
    );
  });

  for (const marketMaker of marketMakers) {
    it(`Fails to borrow more from due to leverage greater than the maximum allowed (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const positionMintKeypair = await generateKeyPairSigner();
      const positionMint = positionMintKeypair.address;
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const actualTickIndex = pool.data.tickCurrentIndex - (pool.data.tickCurrentIndex % pool.data.tickSpacing);

      await openPosition({
        signer,
        positionMint: positionMintKeypair,
        pool: pool.address,
        tickLowerIndex: actualTickIndex + pool.data.tickSpacing,
        tickUpperIndex: actualTickIndex + pool.data.tickSpacing * 5,
      });

      // Borrow less than the limit
      await addLiquidity({
        rpc,
        signer,
        positionMint,
        pool: pool.address,
        collateralA: 1_000_000_000n,
        collateralB: 0n,
        borrowA: 1_000_000_000n,
        borrowB: 0n,
      });

      await assert.rejects(
        addLiquidity({
          rpc,
          signer,
          positionMint,
          pool: pool.address,
          collateralA: 100_000_000n,
          collateralB: 0n,
          borrowA: 10_000_000_000n, // Borrow more than allowed
          borrowB: 0n,
        }),
      );
    });
  }

  for (const marketMaker of marketMakers) {
    it(`Fails to liquidate the position due to: a) unauthorized b) position being healthy (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const positionMintKeypair = await generateKeyPairSigner();
      const positionMint = positionMintKeypair.address;
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const actualTickIndex = pool.data.tickCurrentIndex - (pool.data.tickCurrentIndex % pool.data.tickSpacing);

      await openPosition({
        signer,
        positionMint: positionMintKeypair,
        pool: pool.address,
        tickLowerIndex: actualTickIndex + pool.data.tickSpacing,
        tickUpperIndex: actualTickIndex + pool.data.tickSpacing * 5,
      });

      await addLiquidity({
        rpc,
        signer,
        positionMint,
        pool: pool.address,
        collateralA: 1_000_000_000n,
        collateralB: 0n,
        borrowA: 1_000_000_000n,
        borrowB: 0n,
      });

      await assert.rejects(liquidatePosition({ rpc, signer, positionMint }), err => {
        // AnchorError caused by account: authority. Error Code: ConstraintRaw. Error Number: 2003. Error Message: A raw constraint was violated.
        expect((err as Error).toString()).contain("custom program error: 0x7d3");
        return true;
      });

      await assert.rejects(liquidatePosition({ rpc, signer: LIQUIDATOR_KEYPAIR, positionMint }), err => {
        expect((err as Error).toString()).contain(
          `custom program error: ${"0x" + TUNA_ERROR__POSITION_IS_HEALTHY.toString(16)}`,
        );
        return true;
      });
    });
  }

  for (const marketMaker of marketMakers) {
    it(`Liquidates a position due to an unhealthy state (no bad debt) (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const actualTickIndex = pool.data.tickCurrentIndex - (pool.data.tickCurrentIndex % pool.data.tickSpacing);

      const positionMint = await openPositionWithLiquidity({
        rpc,
        tickLowerIndex: actualTickIndex - pool.data.tickSpacing * 3,
        tickUpperIndex: actualTickIndex + pool.data.tickSpacing * 3,
        pool: pool.address,
        collateralA: 1_000_000_000n,
        collateralB: 0n,
        borrowA: 4_000_000_000n,
        borrowB: 0n,
      });

      //const whirlpoolBefore = await fetchWhirlpool(rpc, testMarket.pool);

      // Significantly move the price.
      await swapExactInput(rpc, signer, pool.address, 50_000_000_000n, market.mintB.address);

      //const whirlpoolAfter = await fetchWhirlpool(rpc, testMarket.pool);
      //console.log(
      //  `Price moved from ${sqrtPriceToPrice(whirlpoolBefore.data.sqrtPrice, 9, 6)} to ${sqrtPriceToPrice(whirlpoolAfter.data.sqrtPrice, 9, 6)}`,
      //);

      assertLiquidatePosition(await liquidatePosition({ rpc, signer: LIQUIDATOR_KEYPAIR, positionMint }), {
        vaultBalanceDeltaA: 4000000000n,
        vaultBalanceDeltaB: 0n,
        poolBalanceDeltaA: -4000000000n,
        poolBalanceDeltaB: -18144803n,
        badDebtDeltaA: 0n,
        badDebtDeltaB: 0n,
        tunaPositionState: TunaPositionState.Liquidated,
      });

      // Fails to close the position because it's not empty.
      await assert.rejects(closePosition({ rpc, signer, positionMint }), err => {
        expect((err as Error).toString()).contain(
          `custom program error: ${"0x" + TUNA_ERROR__POSITION_NOT_EMPTY.toString(16)}`,
        );
        return true;
      });

      assertRemoveLiquidity(
        await removeLiquidity({
          rpc,
          signer,
          positionMint,
          pool: pool.address,
          withdrawPercent: HUNDRED_PERCENT,
        }),
        {
          userBalanceDeltaA: 0n,
          userBalanceDeltaB: 8092506n,
          vaultBalanceDeltaA: 0n,
          vaultBalanceDeltaB: 0n,
          poolBalanceDeltaA: 0n,
          poolBalanceDeltaB: 0n,
        },
      );
    });
  }

  for (const marketMaker of marketMakers) {
    it(`Liquidates a position due to an unhealthy state (bad debt A) (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const positionMintKeypair = await generateKeyPairSigner();
      const positionMint = positionMintKeypair.address;
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const actualTickIndex = pool.data.tickCurrentIndex - (pool.data.tickCurrentIndex % pool.data.tickSpacing);

      await openPosition({
        signer,
        positionMint: positionMintKeypair,
        pool: pool.address,
        tickLowerIndex: actualTickIndex - pool.data.tickSpacing * 3,
        tickUpperIndex: actualTickIndex + pool.data.tickSpacing * 3,
      });

      await addLiquidity({
        rpc,
        signer,
        positionMint,
        pool: pool.address,
        collateralA: 1_000_000_000n,
        collateralB: 0n,
        borrowA: 9_000_000_000n,
        borrowB: 0n,
      });

      //const whirlpoolBefore = await fetchWhirlpool(rpc, testMarket.pool);

      // Significantly move the price.
      await swapExactInput(rpc, signer, pool.address, 50_000_000_000n, pool.data.tokenMintB);

      //const whirlpoolAfter = await fetchWhirlpool(rpc, testMarket.pool);
      //console.log(
      //`Price moved from ${sqrtPriceToPrice(whirlpoolBefore.data.sqrtPrice, 9, 6)} to ${sqrtPriceToPrice(whirlpoolAfter.data.sqrtPrice, 9, 6)}`,
      //);

      assertLiquidatePosition(await liquidatePosition({ rpc, signer: LIQUIDATOR_KEYPAIR, positionMint }), {
        vaultBalanceDeltaA: 8161132905n,
        vaultBalanceDeltaB: 0n,
        poolBalanceDeltaA: -8161132905n,
        poolBalanceDeltaB: 31n,
        badDebtDeltaA: 838867095n,
        badDebtDeltaB: 0n,
        tunaPositionState: TunaPositionState.Liquidated,
      });

      assertRemoveLiquidity(
        await removeLiquidity({
          rpc,
          signer,
          positionMint,
          pool: pool.address,
          withdrawPercent: HUNDRED_PERCENT,
        }),
        {
          userBalanceDeltaA: 0n,
          userBalanceDeltaB: 0n,
          vaultBalanceDeltaA: 0n,
          vaultBalanceDeltaB: 0n,
          poolBalanceDeltaA: 0n,
          poolBalanceDeltaB: 0n,
        },
      );
    });
  }

  for (const marketMaker of marketMakers) {
    it(`Liquidates a position due to an unhealthy state (bad debt B) (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const positionMintKeypair = await generateKeyPairSigner();
      const positionMint = positionMintKeypair.address;
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const actualTickIndex = pool.data.tickCurrentIndex - (pool.data.tickCurrentIndex % pool.data.tickSpacing);

      await openPosition({
        signer,
        positionMint: positionMintKeypair,
        pool: pool.address,
        tickLowerIndex: actualTickIndex - pool.data.tickSpacing * 3,
        tickUpperIndex: actualTickIndex + pool.data.tickSpacing * 3,
      });

      await addLiquidity({
        rpc,
        signer,
        positionMint,
        pool: pool.address,
        collateralA: 0n,
        collateralB: 1_000_000n,
        borrowA: 0n,
        borrowB: 9_000_000n,
      });

      //const whirlpoolBefore = await fetchWhirlpool(rpc, testMarket.pool);

      // Significantly move the price.
      await swapExactInput(rpc, signer, pool.address, 1000_000_000_000n, pool.data.tokenMintA);

      //const whirlpoolAfter = await fetchWhirlpool(rpc, testMarket.pool);
      //console.log(
      //  `Price moved from ${sqrtPriceToPrice(whirlpoolBefore.data.sqrtPrice, 9, 6)} to ${sqrtPriceToPrice(whirlpoolAfter.data.sqrtPrice, 9, 6)}`,
      //);

      assertLiquidatePosition(await liquidatePosition({ rpc, signer: LIQUIDATOR_KEYPAIR, positionMint }), {
        vaultBalanceDeltaA: 0n,
        vaultBalanceDeltaB: 4785196n,
        poolBalanceDeltaA: 6n,
        poolBalanceDeltaB: -4785196n,
        badDebtDeltaA: 0n,
        badDebtDeltaB: 4214804n,
        tunaPositionState: TunaPositionState.Liquidated,
      });

      assertRemoveLiquidity(
        await removeLiquidity({
          rpc,
          signer,
          positionMint,
          pool: pool.address,
          withdrawPercent: HUNDRED_PERCENT,
        }),
        {
          userBalanceDeltaA: 0n,
          userBalanceDeltaB: 0n,
          vaultBalanceDeltaA: 0n,
          vaultBalanceDeltaB: 0n,
          poolBalanceDeltaA: 0n,
          poolBalanceDeltaB: 0n,
        },
      );
    });
  }

  for (const marketMaker of marketMakers) {
    it(`Fails to remove liquidity from an unhealthy position (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const actualTickIndex = pool.data.tickCurrentIndex - (pool.data.tickCurrentIndex % pool.data.tickSpacing);

      const positionMint = await openPositionWithLiquidity({
        rpc,
        tickLowerIndex: actualTickIndex - pool.data.tickSpacing * 3,
        tickUpperIndex: actualTickIndex + pool.data.tickSpacing * 3,
        pool: pool.address,
        collateralA: 1_000_000_000n,
        collateralB: 0n,
        borrowA: 4_000_000_000n,
        borrowB: 0n,
      });

      // Significantly move the price.
      await swapExactInput(rpc, signer, pool.address, 50_000_000_000n, pool.data.tokenMintB);

      // Fails to partially remove liquidity from an unhealthy position
      await assert.rejects(
        removeLiquidity({
          rpc,
          signer,
          positionMint,
          pool: pool.address,
          withdrawPercent: HUNDRED_PERCENT / 100,
        }),
        err => {
          expect((err as Error).toString()).contain(
            `custom program error: ${"0x" + TUNA_ERROR__POSITION_IS_UNHEALTHY.toString(16)}`,
          );
          return true;
        },
      );

      // Fails to totally remove liquidity from an unhealthy position
      await assert.rejects(
        removeLiquidity({
          rpc,
          signer,
          positionMint,
          pool: pool.address,
          withdrawPercent: HUNDRED_PERCENT,
        }),
        err => {
          expect((err as Error).toString()).contain(
            `custom program error: ${"0x" + TUNA_ERROR__POSITION_IS_UNHEALTHY.toString(16)}`,
          );
          return true;
        },
      );
    });
  }

  for (const marketMaker of marketMakers) {
    it(`Can execute openPositionWithLiquidity instruction (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const actualTickIndex = pool.data.tickCurrentIndex - (pool.data.tickCurrentIndex % pool.data.tickSpacing);

      await openPositionWithLiquidity({
        rpc,
        tickLowerIndex: actualTickIndex + pool.data.tickSpacing,
        tickUpperIndex: actualTickIndex + pool.data.tickSpacing * 5,
        pool: pool.address,
        collateralA: 2_000_000_000n,
        collateralB: 0n,
        borrowA: 2_000_000_000n,
        borrowB: 0n,
      });
    });
  }

  for (const marketMaker of marketMakers) {
    it(`Adds liquidity to a two-sided position and withdraw the entire amount in token A (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const actualTickIndex = pool.data.tickCurrentIndex - (pool.data.tickCurrentIndex % pool.data.tickSpacing);

      const positionMint = await openPositionWithLiquidity({
        rpc,
        tickLowerIndex: actualTickIndex - pool.data.tickSpacing * 5,
        tickUpperIndex: actualTickIndex + pool.data.tickSpacing * 5,
        pool: pool.address,
        collateralA: 1_000_000_000n,
        collateralB: 100_000_000n,
        borrowA: 2_000_000_000n,
        borrowB: 200_000_000n,
      });

      assertRemoveLiquidity(
        await removeLiquidity({
          rpc,
          signer,
          positionMint,
          pool: pool.address,
          swapToToken: 1,
          closePosition: true,
        }),
        {
          userBalanceDeltaA: 1494939298n,
          userBalanceDeltaB: 0n,
          vaultBalanceDeltaA: 2_000_000_000n,
          vaultBalanceDeltaB: 200_000_000n,
          poolBalanceDeltaA: -3494939298n,
          poolBalanceDeltaB: -199999994n,
        },
      );
    });
  }

  for (const marketMaker of marketMakers) {
    it(`Adds liquidity to a two-sided position and withdraw the entire amount in token B (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const actualTickIndex = pool.data.tickCurrentIndex - (pool.data.tickCurrentIndex % pool.data.tickSpacing);

      const positionMint = await openPositionWithLiquidity({
        rpc,
        tickLowerIndex: actualTickIndex - pool.data.tickSpacing * 5,
        tickUpperIndex: actualTickIndex + pool.data.tickSpacing * 5,
        pool: pool.address,
        collateralA: 1_000_000_000n,
        collateralB: 100_000_000n,
        borrowA: 2_000_000_000n,
        borrowB: 200_000_000n,
      });

      assertRemoveLiquidity(
        await removeLiquidity({
          rpc,
          signer,
          positionMint,
          pool: pool.address,
          swapToToken: 2,
          closePosition: true,
        }),
        {
          userBalanceDeltaA: 0n,
          userBalanceDeltaB: 298951363n,
          vaultBalanceDeltaA: 2_000_000_000n,
          vaultBalanceDeltaB: 200_000_000n,
          poolBalanceDeltaA: -2000000000n,
          poolBalanceDeltaB: -498951357n,
        },
      );
    });
  }

  for (const marketMaker of marketMakers) {
    it(`S/L limit order (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const actualTickIndex = pool.data.tickCurrentIndex - (pool.data.tickCurrentIndex % pool.data.tickSpacing);

      const positionMint = await openPositionWithLiquidity({
        rpc,
        tickLowerIndex: actualTickIndex - pool.data.tickSpacing,
        tickUpperIndex: actualTickIndex + pool.data.tickSpacing,
        tickStopLossIndex: actualTickIndex - pool.data.tickSpacing * 2,
        pool: pool.address,
        collateralA: 1_000_000_000n,
        collateralB: 100_000_000n,
        borrowA: 2_000_000_000n,
        borrowB: 200_000_000n,
      });

      // Move the price.
      await swapExactInput(rpc, signer, pool.address, 100_000_000_000n, pool.data.tokenMintA);

      assertLiquidatePosition(await liquidatePosition({ rpc, signer: LIQUIDATOR_KEYPAIR, positionMint }), {
        tunaPositionState: TunaPositionState.ClosedByLimitOrder,
        liquidatorRewardA: 4497643n,
        liquidatorRewardB: 0n,
      });
    });
  }

  for (const marketMaker of marketMakers) {
    it(`S/L limit order, swap to token B (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const actualTickIndex = pool.data.tickCurrentIndex - (pool.data.tickCurrentIndex % pool.data.tickSpacing);

      const positionMint = await openPositionWithLiquidity({
        rpc,
        tickLowerIndex: actualTickIndex - pool.data.tickSpacing,
        tickUpperIndex: actualTickIndex + pool.data.tickSpacing,
        tickStopLossIndex: actualTickIndex - pool.data.tickSpacing * 2,
        pool: pool.address,
        collateralA: 1_000_000_000n,
        collateralB: 100_000_000n,
        borrowA: 2_000_000_000n,
        borrowB: 200_000_000n,
        flags: TUNA_POSITION_FLAGS_STOP_LOSS_SWAP_TO_TOKEN_B,
      });

      // Move the price.
      await swapExactInput(rpc, signer, pool.address, 100_000_000_000n, pool.data.tokenMintA);

      assertLiquidatePosition(await liquidatePosition({ rpc, signer: LIQUIDATOR_KEYPAIR, positionMint }), {
        tunaPositionState: TunaPositionState.ClosedByLimitOrder,
        liquidatorRewardA: 4497643n,
        liquidatorRewardB: 0n,
      });
    });
  }

  for (const marketMaker of marketMakers) {
    it(`T/P limit order (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const actualTickIndex = pool.data.tickCurrentIndex - (pool.data.tickCurrentIndex % pool.data.tickSpacing);

      const positionMint = await openPositionWithLiquidity({
        rpc,
        tickLowerIndex: actualTickIndex - pool.data.tickSpacing,
        tickUpperIndex: actualTickIndex + pool.data.tickSpacing,
        tickTakeProfitIndex: actualTickIndex + pool.data.tickSpacing * 2,
        pool: pool.address,
        collateralA: 1_000_000_000n,
        collateralB: 100_000_000n,
        borrowA: 2_000_000_000n,
        borrowB: 200_000_000n,
      });

      // Move the price.
      await swapExactInput(rpc, signer, pool.address, 10_000_000_000n, pool.data.tokenMintB);

      assertLiquidatePosition(await liquidatePosition({ rpc, signer: LIQUIDATOR_KEYPAIR, positionMint }), {
        tunaPositionState: TunaPositionState.ClosedByLimitOrder,
        liquidatorRewardA: 0n,
        liquidatorRewardB: 902458n,
      });
    });
  }

  for (const marketMaker of marketMakers) {
    it(`T/P limit order, swap to token A (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const actualTickIndex = pool.data.tickCurrentIndex - (pool.data.tickCurrentIndex % pool.data.tickSpacing);

      const positionMint = await openPositionWithLiquidity({
        rpc,
        tickLowerIndex: actualTickIndex - pool.data.tickSpacing,
        tickUpperIndex: actualTickIndex + pool.data.tickSpacing,
        tickTakeProfitIndex: actualTickIndex + pool.data.tickSpacing * 2,
        pool: pool.address,
        collateralA: 1_000_000_000n,
        collateralB: 100_000_000n,
        borrowA: 2_000_000_000n,
        borrowB: 200_000_000n,
        flags: TUNA_POSITION_FLAGS_TAKE_PROFIT_SWAP_TO_TOKEN_A,
      });

      // Move the price.
      await swapExactInput(rpc, signer, pool.address, 10_000_000_000n, pool.data.tokenMintB);

      assertLiquidatePosition(await liquidatePosition({ rpc, signer: LIQUIDATOR_KEYPAIR, positionMint }), {
        tunaPositionState: TunaPositionState.ClosedByLimitOrder,
        liquidatorRewardA: 0n,
        liquidatorRewardB: 902458n,
      });
    });
  }

  for (const marketMaker of marketMakers) {
    it(`Collect and compound position fees (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const positionMintKeypair = await generateKeyPairSigner();
      const positionMint = positionMintKeypair.address;
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const actualTickIndex = pool.data.tickCurrentIndex - (pool.data.tickCurrentIndex % pool.data.tickSpacing);

      await openPosition({
        signer,
        positionMint: positionMintKeypair,
        pool: pool.address,
        tickLowerIndex: actualTickIndex - pool.data.tickSpacing * 20,
        tickUpperIndex: actualTickIndex + pool.data.tickSpacing * 20,
      });

      await addLiquidity({
        rpc,
        positionMint,
        pool: pool.address,
        collateralA: 1_000_000_000n,
        collateralB: 0n,
        borrowA: 1_000_000_000n,
        borrowB: 0n,
      });

      // Swap to generate fees
      await swapExactInput(rpc, signer, pool.address, 10_000_000_000n, pool.data.tokenMintA);

      // Without leverage
      assertCollectAndCompoundFees(
        await collectAndCompoundFees({
          rpc,
          signer,
          positionMint,
          pool: pool.address,
          useLeverage: false,
        }),
        {
          vaultBalanceDeltaA: 0n,
          vaultBalanceDeltaB: 0n,
          poolBalanceDeltaA: -21n,
          poolBalanceDeltaB: 15n,
        },
      );

      // Swap to generate fees
      await swapExactInput(rpc, signer, pool.address, 10_000_000_000n, pool.data.tokenMintA);

      // With leverage
      assertCollectAndCompoundFees(
        await collectAndCompoundFees({
          rpc,
          signer,
          positionMint,
          pool: pool.address,
          useLeverage: true,
        }),
        {
          vaultBalanceDeltaA: -20947n,
          vaultBalanceDeltaB: 0n,
          poolBalanceDeltaA: 20902n,
          poolBalanceDeltaB: 0n,
        },
      );

      await removeLiquidity({
        rpc,
        signer,
        positionMint,
        pool: pool.address,
        withdrawPercent: HUNDRED_PERCENT,
        closePosition: true,
      });
    });
  }

  it("Add and remove liquidity to a pool with double rewards", async () => {
    // Override the test market using WSOL for MintA
    testOrcaMarket = await setupTestMarket(
      {
        addressLookupTable: DEFAULT_ADDRESS,
        borrowLimitA: 0n,
        borrowLimitB: 0n,
        disabled: false,
        liquidationFee: 10000, // 1%
        liquidationThreshold: 820000, // 82%
        marketMaker: 0,
        maxLeverage: (LEVERAGE_ONE * 509) / 100,
        maxSwapSlippage: 0,
        oraclePriceDeviationThreshold: HUNDRED_PERCENT / 2, // Allow large deviation for tests
        protocolFee: 1000, // 0.1%
        protocolFeeOnCollateral: 1000, // 0.1%
        limitOrderExecutionFee: 1000, // 0.1%
        rebalanceProtocolFee: HUNDRED_PERCENT / 10,
      },
      false,
      true,
    );

    const whirlpool = await fetchWhirlpool(rpc, testOrcaMarket.pool);
    const actualTickIndex =
      whirlpool.data.tickCurrentIndex - (whirlpool.data.tickCurrentIndex % whirlpool.data.tickSpacing);

    const positionMint = await openPositionWithLiquidity({
      rpc,
      tickLowerIndex: actualTickIndex - whirlpool.data.tickSpacing * 5,
      tickUpperIndex: actualTickIndex + whirlpool.data.tickSpacing * 5,
      pool: testOrcaMarket.pool,
      collateralA: 1_000_000_000n,
      collateralB: 1_000_000_000n,
      borrowA: 0n,
      borrowB: 0n,
    });

    // Move time forward
    const testContext = await getTestContext();
    const currentClock = await testContext.banksClient.getClock();
    testContext.setClock(
      new Clock(
        currentClock.slot,
        currentClock.epochStartTimestamp,
        currentClock.epoch,
        currentClock.leaderScheduleEpoch,
        currentClock.unixTimestamp + 3600n,
      ),
    );

    const orcaPositionAddress = (await getPositionAddress(positionMint))[0];
    await updateFeesAndRewards(orcaPositionAddress);

    assertRemoveLiquidity(
      await removeLiquidity({
        rpc,
        signer,
        positionMint,
        pool: testOrcaMarket.pool,
        closePosition: true,
      }),
      {
        userRewardBalanceDelta: 28022n,
      },
    );

    // Restore the clock
    testContext.setClock(currentClock);
  });

  for (const marketMaker of marketMakers) {
    it(`Can run openPositionWithLiquidity and closePositionWithLiquidity (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const actualTickIndex = pool.data.tickCurrentIndex - (pool.data.tickCurrentIndex % pool.data.tickSpacing);

      const positionMint = await openPositionWithLiquidity({
        rpc,
        tickLowerIndex: actualTickIndex - pool.data.tickSpacing * 3,
        tickUpperIndex: actualTickIndex + pool.data.tickSpacing * 3,
        pool: pool.address,
        collateralA: 1_000_000_000n,
        collateralB: 0n,
        borrowA: 4_000_000_000n,
        borrowB: 0n,
      });

      await closePositionWithLiquidity({ rpc, positionMint });
    });
  }

  it("Repay debt", async () => {
    const whirlpool = await fetchWhirlpool(rpc, testOrcaMarket.pool);
    const actualTickIndex =
      whirlpool.data.tickCurrentIndex - (whirlpool.data.tickCurrentIndex % whirlpool.data.tickSpacing);

    const positionMint = await openPositionWithLiquidity({
      rpc,
      tickLowerIndex: actualTickIndex - whirlpool.data.tickSpacing * 3,
      tickUpperIndex: actualTickIndex + whirlpool.data.tickSpacing * 3,
      pool: testOrcaMarket.pool,
      collateralA: 1_000_000_000n,
      collateralB: 0n,
      borrowA: 1_000_000_000n,
      borrowB: 1_000_000_000n,
    });

    await repayDebt({ rpc, positionMint, collateralA: 10000n, collateralB: 20000n });
  });

  for (const marketMaker of marketMakers) {
    it(`Re-balance a two-sided position (${MarketMaker[marketMaker]})`, async () => {
      const market = markets.find(m => m.marketMaker == marketMaker)!;
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const actualTickIndex = pool.data.tickCurrentIndex - (pool.data.tickCurrentIndex % pool.data.tickSpacing);

      const positionMint = await openPositionWithLiquidity({
        rpc,
        tickLowerIndex: actualTickIndex - pool.data.tickSpacing * 5,
        tickUpperIndex: actualTickIndex + pool.data.tickSpacing * 5,
        pool: pool.address,
        collateralA: 1_000_000_000n,
        collateralB: 1_000_000n,
        borrowA: 2_000_000_000n,
        borrowB: 2_000_000n,
        flags: TUNA_POSITION_FLAGS_ALLOW_REBALANCING,
      });

      // Fails to re-balance the position because re-balance conditions are not met
      await assert.rejects(
        rebalancePosition({
          rpc,
          signer,
          positionMint,
          pool: pool.address,
        }),
        err => {
          expect((err as Error).toString()).contain(
            `custom program error: ${"0x" + TUNA_ERROR__REBALANCE_CONDITIONS_NOT_MET.toString(16)}`,
          );
          return true;
        },
      );

      // Swap and move the price to allow re-balancing.
      await swapExactInput(rpc, signer, pool.address, 100_000_000_000n, market.mintA.address);

      assertRebalancePosition(
        await rebalancePosition({
          rpc,
          signer,
          positionMint,
          pool: pool.address,
        }),
        {
          newTickLowerIndex: -17344,
          newTickUpperIndex: -16704,
        },
      );
    });
  }
});
