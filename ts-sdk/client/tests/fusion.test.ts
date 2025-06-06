import { openLimitOrderInstructions } from "@crypticdot/fusionamm-sdk";
import { generateKeyPairSigner } from "@solana/kit";
import { beforeEach, describe, it } from "vitest";

import { DEFAULT_ADDRESS, HUNDRED_PERCENT, LEVERAGE_ONE, MarketMaker } from "../src";

import { addLiquidity, assertAddLiquidity } from "./helpers/addLiquidity.ts";
import { fetchPool } from "./helpers/fetch.ts";
import { rpc, sendTransaction, signer } from "./helpers/mockRpc.ts";
import { openPosition } from "./helpers/openPosition.ts";
import { setupTestMarket, TestMarket } from "./helpers/setup.ts";

describe("Tuna Position", () => {
  let testMarket: TestMarket;

  beforeEach(async () => {
    testMarket = await setupTestMarket({
      marketMaker: MarketMaker.Fusion,
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
    });
  });

  it(`Adds liquidity with leverage to a two-sided position, providing only token A`, async () => {
    /*    const positionMintKeypair = await generateKeyPairSigner();
    const pool = await fetchPool(rpc, testMarket.pool, testMarket.marketMaker);
    const actualTickIndex = pool.data.tickCurrentIndex - (pool.data.tickCurrentIndex % pool.data.tickSpacing);

    const openOrderInstructions = await openLimitOrderInstructions(
      rpc,
      pool.address,
      30_000_000_000n,
      { tickIndex: actualTickIndex - pool.data.tickSpacing },
      false,
      signer,
    );
    await sendTransaction(openOrderInstructions.instructions);

    await openPosition({
      signer,
      positionMint: positionMintKeypair,
      pool: pool.address,
      tickLowerIndex: actualTickIndex - pool.data.tickSpacing * 5,
      tickUpperIndex: actualTickIndex + pool.data.tickSpacing * 5,
    });

    console.log("actualTickIndex", actualTickIndex);
    console.log("TICK BEFORE", pool.data.tickCurrentIndex);

    assertAddLiquidity(
      await addLiquidity({
        rpc,
        positionMint: positionMintKeypair.address,
        pool: pool.address,
        collateralA: 30_000_000_000n,
        collateralB: 0n,
        borrowA: 30_000_000_000n,
        borrowB: 0n,
      }),
      {
        userBalanceDeltaA: -30000000000n,
        userBalanceDeltaB: 0n,
        vaultBalanceDeltaA: -30000000000n,
        vaultBalanceDeltaB: 0n,
        poolBalanceDeltaA: 59939997923n,
        poolBalanceDeltaB: 0n,
        leftoversA: 2077n,
        leftoversB: 0n,
      },
    );

    const poolAfter = await fetchPool(rpc, testMarket.pool, testMarket.marketMaker);
    console.log("TICK AFTER", poolAfter.data.tickCurrentIndex);*/
  });
});
