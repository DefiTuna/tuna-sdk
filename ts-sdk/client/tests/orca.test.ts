import { generateKeyPairSigner } from "@solana/kit";
import { beforeEach, describe, it } from "vitest";

import { DEFAULT_ADDRESS, HUNDRED_PERCENT, LEVERAGE_ONE, MarketMaker } from "../src";

import { increaseTunaLpPosition, assertIncreaseTunaLpPosition } from "./helpers/increaseTunaLpPosition.ts";
import { fetchPool } from "./helpers/fetch.ts";
import { rpc, signer } from "./helpers/mockRpc.ts";
import { openTunaLpPosition } from "./helpers/openTunaLpPosition.ts";
import { assertDecreaseTunaLpPositionLiquidity, decreaseTunaLpPosition } from "./helpers/decreaseTunaLpPosition.ts";
import { setupTestMarket, TestMarket } from "./helpers/setup.ts";
import { swapExactInput } from "./helpers/swap.ts";

describe("Tuna Position on Orca", () => {
  let testMarket: TestMarket;

  beforeEach(async () => {
    testMarket = await setupTestMarket(
      {
        marketMaker: MarketMaker.Orca,
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
      },
      false,
      false,
      true,
    );
  });

  it(`Adds liquidity with leverage to a two-sided position, providing only token A`, async () => {
    const positionMintKeypair = await generateKeyPairSigner();
    const pool = await fetchPool(rpc, testMarket.pool, testMarket.marketMaker);
    const actualTickIndex = pool.data.tickCurrentIndex - (pool.data.tickCurrentIndex % pool.data.tickSpacing);

    await openTunaLpPosition({
      signer,
      positionMint: positionMintKeypair,
      pool: pool.address,
      tickLowerIndex: actualTickIndex - pool.data.tickSpacing * 5,
      tickUpperIndex: actualTickIndex + pool.data.tickSpacing * 5,
    });

    //console.log("actualTickIndex", actualTickIndex);
    //console.log("TICK BEFORE", pool.data.tickCurrentIndex);

    assertIncreaseTunaLpPosition(
      await increaseTunaLpPosition({
        rpc,
        positionMint: positionMintKeypair.address,
        pool: pool.address,
        collateralA: 30_000_000_000n,
        collateralB: 0n,
        borrowA: 30_000_000_000n,
        borrowB: 0n,
        maxAmountSlippage: HUNDRED_PERCENT,
      }),
      {
        userBalanceDeltaA: -30000000000n,
        userBalanceDeltaB: 0n,
        vaultBalanceDeltaA: -30000000000n,
        vaultBalanceDeltaB: 0n,
        poolBalanceDeltaA: 59940000000n,
        poolBalanceDeltaB: -311n,
        leftoversA: 0n,
        leftoversB: 311n,
      },
    );

    //const poolAfter = await fetchPool(rpc, testMarket.pool, testMarket.marketMaker);
    //console.log("TICK AFTER", poolAfter.data.tickCurrentIndex);

    // Move the price.
    await swapExactInput(rpc, signer, pool.address, 10_000_000_000n, pool.data.tokenMintB);

    assertDecreaseTunaLpPositionLiquidity(
      await decreaseTunaLpPosition({
        rpc,
        signer,
        positionMint: positionMintKeypair.address,
        pool: pool.address,
        closeTunaLpPosition: true,
      }),
      {
        userBalanceDeltaA: 0n,
        userBalanceDeltaB: 5940599853n,
        vaultBalanceDeltaA: 30000000000n,
        vaultBalanceDeltaB: 0n,
        poolBalanceDeltaA: -30000000000n,
        poolBalanceDeltaB: -5940599542n,
      },
    );
  });

  it(`Adds liquidity with leverage to a two-sided position, providing only token B`, async () => {
    const positionMintKeypair = await generateKeyPairSigner();
    const pool = await fetchPool(rpc, testMarket.pool, testMarket.marketMaker);
    const actualTickIndex = pool.data.tickCurrentIndex - (pool.data.tickCurrentIndex % pool.data.tickSpacing);

    await openTunaLpPosition({
      signer,
      positionMint: positionMintKeypair,
      pool: pool.address,
      tickLowerIndex: actualTickIndex - pool.data.tickSpacing * 5,
      tickUpperIndex: actualTickIndex + pool.data.tickSpacing * 5,
    });

    assertIncreaseTunaLpPosition(
      await increaseTunaLpPosition({
        rpc,
        positionMint: positionMintKeypair.address,
        pool: pool.address,
        collateralA: 0n,
        collateralB: 30_000_000_000n,
        borrowA: 0n,
        borrowB: 30_000_000_000n,
        maxAmountSlippage: HUNDRED_PERCENT,
      }),
      {
        userBalanceDeltaA: 0n,
        userBalanceDeltaB: -30000000000n,
        vaultBalanceDeltaA: 0n,
        vaultBalanceDeltaB: -30000000000n,
        poolBalanceDeltaA: -11770n,
        poolBalanceDeltaB: 59940000000n,
        leftoversA: 11770n,
        leftoversB: 0n,
      },
    );

    // Move the price.
    await swapExactInput(rpc, signer, pool.address, 200_000_000_000n, pool.data.tokenMintA);

    assertDecreaseTunaLpPositionLiquidity(
      await decreaseTunaLpPosition({
        rpc,
        signer,
        positionMint: positionMintKeypair.address,
        pool: pool.address,
        closeTunaLpPosition: true,
      }),
      {
        userBalanceDeltaA: 146419960983n,
        userBalanceDeltaB: 0n,
        vaultBalanceDeltaA: 0n,
        vaultBalanceDeltaB: 30000000000n,
        poolBalanceDeltaA: -146419949213n,
        poolBalanceDeltaB: -30000000000n,
      },
    );
  });
});
