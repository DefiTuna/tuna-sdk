import { getDecreaseSpotPositionQuote, getIncreaseSpotPositionQuote, Pubkey } from "@crypticdot/defituna-core";
import { fetchFusionPool } from "@crypticdot/fusionamm-client";
import { sqrtPriceToPrice } from "@crypticdot/fusionamm-core";
import { fetchTickArrayOrDefault } from "@crypticdot/fusionamm-sdk";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_ADDRESS,
  fetchMarket,
  fetchTunaSpotPosition,
  getMarketAddress,
  getTunaSpotPositionAddress,
  HUNDRED_PERCENT,
  LEVERAGE_ONE,
  MarketMaker,
  NATIVE_MINT,
  PoolToken,
} from "../src";

import { rpc, signer } from "./helpers/mockRpc.ts";
import { assertModifyTunaSpotPosition, modifyTunaSpotPosition } from "./helpers/modifyTunaSpotPosition.ts";
import { openTunaSpotPosition } from "./helpers/openTunaSpotPosition.ts";
import { setupTestMarket } from "./helpers/setup.ts";

describe("Spot Position Math", () => {
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
    rebalanceProtocolFee: HUNDRED_PERCENT / 10,
    spotPositionSizeLimitA: 1000_000_000_000,
    spotPositionSizeLimitB: 100000_000_000,
  };

  it(`Increase a LONG position providing token A as collateral`, async () => {
    const testFusionMarket = await setupTestMarket({ ...marketArgs }, MarketMaker.Fusion);

    const fusionPool = await fetchFusionPool(rpc, testFusionMarket.pool);
    const tickArrays = await fetchTickArrayOrDefault(rpc, fusionPool);
    const marketAddress = (await getMarketAddress(testFusionMarket.pool))[0];
    const market = await fetchMarket(rpc, marketAddress);

    await openTunaSpotPosition({
      rpc,
      positionToken: PoolToken.A,
      collateralToken: PoolToken.A,
      pool: testFusionMarket.pool,
    });

    const quote = await getIncreaseSpotPositionQuote(
      200_000_000n,
      PoolToken.A,
      PoolToken.A,
      5.0,
      0,
      market.data.protocolFee,
      market.data.protocolFeeOnCollateral,
      new Pubkey(NATIVE_MINT),
      new Pubkey(NATIVE_MINT),
      fusionPool.data,
      tickArrays.map(account => account.data),
    );

    expect(quote.estimatedAmount).toEqual(199988578n);

    assertModifyTunaSpotPosition(
      await modifyTunaSpotPosition({
        rpc,
        pool: testFusionMarket.pool,
        collateralAmount: quote.collateral,
        borrowAmount: quote.borrow,
      }),
      { amountA: quote.estimatedAmount, amountB: 0n },
    );

    // Compare the quoted and actual price impact
    const fusionPoolAfter = await fetchFusionPool(rpc, testFusionMarket.pool);
    const price = sqrtPriceToPrice(fusionPool.data.sqrtPrice, 1, 1);
    const newPrice = sqrtPriceToPrice(fusionPoolAfter.data.sqrtPrice, 1, 1);
    const priceImpact = Math.abs(newPrice / price - 1.0);
    expect(quote.priceImpact).toBeCloseTo(priceImpact, 9);
  });

  it(`Increase a SHORT position providing token A as collateral`, async () => {
    const testFusionMarket = await setupTestMarket({ ...marketArgs }, MarketMaker.Fusion);

    const fusionPool = await fetchFusionPool(rpc, testFusionMarket.pool);
    const tickArrays = await fetchTickArrayOrDefault(rpc, fusionPool);
    const marketAddress = (await getMarketAddress(testFusionMarket.pool))[0];
    const market = await fetchMarket(rpc, marketAddress);

    await openTunaSpotPosition({
      rpc,
      positionToken: PoolToken.B,
      collateralToken: PoolToken.A,
      pool: testFusionMarket.pool,
    });

    const quote = await getIncreaseSpotPositionQuote(
      1_000_000_000n,
      PoolToken.A,
      PoolToken.B,
      3.0,
      0,
      market.data.protocolFee,
      market.data.protocolFeeOnCollateral,
      new Pubkey(NATIVE_MINT),
      new Pubkey(NATIVE_MINT),
      fusionPool.data,
      tickArrays.map(account => account.data),
    );

    assertModifyTunaSpotPosition(
      await modifyTunaSpotPosition({
        rpc,
        pool: testFusionMarket.pool,
        collateralAmount: quote.collateral,
        borrowAmount: quote.borrow,
      }),
      { amountA: 0n, amountB: quote.estimatedAmount },
    );

    const fusionPoolAfter = await fetchFusionPool(rpc, testFusionMarket.pool);
    const price = sqrtPriceToPrice(fusionPool.data.sqrtPrice, 1, 1);
    const newPrice = sqrtPriceToPrice(fusionPoolAfter.data.sqrtPrice, 1, 1);
    const priceImpact = Math.abs(newPrice / price - 1.0);
    expect(quote.priceImpact).toEqual(priceImpact);
  });

  it(`Decrease a LONG position in token A (collateral in B)`, async () => {
    const testFusionMarket = await setupTestMarket({ ...marketArgs }, MarketMaker.Fusion);
    const marketAddress = (await getMarketAddress(testFusionMarket.pool))[0];
    const market = await fetchMarket(rpc, marketAddress);
    const positionAddress = (await getTunaSpotPositionAddress(signer.address, market.data.pool))[0];

    await openTunaSpotPosition({
      rpc,
      positionToken: PoolToken.A,
      collateralToken: PoolToken.B,
      pool: testFusionMarket.pool,
    });

    assertModifyTunaSpotPosition(
      await modifyTunaSpotPosition({
        rpc,
        pool: testFusionMarket.pool,
        collateralAmount: 202000000n,
        borrowAmount: 801_545_400n,
      }),
      { amountA: 5_000_000_063n, amountB: 0n },
    );

    const fusionPool = await fetchFusionPool(rpc, testFusionMarket.pool);
    const tickArrays = await fetchTickArrayOrDefault(rpc, fusionPool);
    const tunaPosition = await fetchTunaSpotPosition(rpc, positionAddress);

    const quote = await getDecreaseSpotPositionQuote(
      200_000_000n,
      tunaPosition.data.collateralToken,
      5.0,
      0,
      tunaPosition.data.positionToken,
      tunaPosition.data.amount,
      tunaPosition.data.loanShares,
      new Pubkey(NATIVE_MINT),
      new Pubkey(NATIVE_MINT),
      fusionPool.data,
      tickArrays.map(account => account.data),
    );

    assertModifyTunaSpotPosition(
      await modifyTunaSpotPosition({
        rpc,
        pool: testFusionMarket.pool,
        decreasePercent: quote.decreasePercent,
      }),
      {
        amountA: quote.estimatedAmount,
        amountB: 0n,
        vaultBalanceDeltaA: 0n,
        vaultBalanceDeltaB: quote.estimatedPayableDebt,
        userBalanceDeltaA: 0n,
        userBalanceDeltaB: quote.estimatedCollateralToBeWithdrawn,
      },
    );

    const fusionPoolAfter = await fetchFusionPool(rpc, testFusionMarket.pool);
    const price = sqrtPriceToPrice(fusionPool.data.sqrtPrice, 1, 1);
    const newPrice = sqrtPriceToPrice(fusionPoolAfter.data.sqrtPrice, 1, 1);
    const priceImpact = Math.abs(newPrice / price - 1.0);
    expect(quote.priceImpact).toEqual(priceImpact);
  });

  it(`Decrease a LONG position in token A (collateral in A)`, async () => {
    const testFusionMarket = await setupTestMarket({ ...marketArgs }, MarketMaker.Fusion);
    const marketAddress = (await getMarketAddress(testFusionMarket.pool))[0];
    const market = await fetchMarket(rpc, marketAddress);
    const positionAddress = (await getTunaSpotPositionAddress(signer.address, market.data.pool))[0];

    await openTunaSpotPosition({
      rpc,
      positionToken: PoolToken.A,
      collateralToken: PoolToken.A,
      pool: testFusionMarket.pool,
    });

    assertModifyTunaSpotPosition(
      await modifyTunaSpotPosition({
        rpc,
        pool: testFusionMarket.pool,
        collateralAmount: 1_010_000_002n,
        borrowAmount: 800669835n,
      }),
      { amountA: 5_000_000_000n, amountB: 0n },
    );

    const fusionPool = await fetchFusionPool(rpc, testFusionMarket.pool);
    const tickArrays = await fetchTickArrayOrDefault(rpc, fusionPool);
    const tunaPosition = await fetchTunaSpotPosition(rpc, positionAddress);

    const quote = await getDecreaseSpotPositionQuote(
      2_000_000_000n,
      tunaPosition.data.collateralToken,
      5.0,
      0,
      tunaPosition.data.positionToken,
      tunaPosition.data.amount,
      tunaPosition.data.loanShares,
      new Pubkey(NATIVE_MINT),
      new Pubkey(NATIVE_MINT),
      fusionPool.data,
      tickArrays.map(account => account.data),
    );

    assertModifyTunaSpotPosition(
      await modifyTunaSpotPosition({
        rpc,
        pool: testFusionMarket.pool,
        decreasePercent: quote.decreasePercent,
      }),
      {
        amountA: quote.estimatedAmount,
        amountB: 0n,
        vaultBalanceDeltaA: 0n,
        vaultBalanceDeltaB: quote.estimatedPayableDebt,
        userBalanceDeltaA: quote.estimatedCollateralToBeWithdrawn,
        userBalanceDeltaB: 0n,
      },
    );

    // Compare the quoted and actual price impact
    const fusionPoolAfter = await fetchFusionPool(rpc, testFusionMarket.pool);
    const price = sqrtPriceToPrice(fusionPool.data.sqrtPrice, 1, 1);
    const newPrice = sqrtPriceToPrice(fusionPoolAfter.data.sqrtPrice, 1, 1);
    const priceImpact = Math.abs(newPrice / price - 1.0);
    expect(quote.priceImpact).toEqual(priceImpact);
  });
}, 20000);
