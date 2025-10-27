import { fetchFusionPool } from "@crypticdot/fusionamm-client";
import {
  _TICK_ARRAY_SIZE,
  FusionPoolFacade,
  getTickArrayStartTickIndex,
  priceToSqrtPrice,
  sqrtPriceToPrice,
  sqrtPriceToTickIndex,
  TickArrayFacade,
  TickFacade,
} from "@crypticdot/fusionamm-core";
import { fetchTickArrayOrDefault } from "@crypticdot/fusionamm-sdk";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_ADDRESS,
  fetchMarket,
  fetchTunaSpotPosition,
  getDecreaseSpotPositionQuote,
  getIncreaseSpotPositionQuote,
  getLiquidationPrice,
  getMarketAddress,
  getTradableAmount,
  getTunaSpotPositionAddress,
  HUNDRED_PERCENT,
  LEVERAGE_ONE,
  MarketMaker,
  MAX_SQRT_PRICE,
  MIN_SQRT_PRICE,
  PoolToken,
  resetTunaSpotPositionInstruction,
} from "../src";

import { assertDecreaseTunaSpotPosition, decreaseTunaSpotPosition } from "./helpers/decreaseTunaSpotPosition.ts";
import { assertIncreaseTunaSpotPosition, increaseTunaSpotPosition } from "./helpers/increaseTunaSpotPosition.ts";
import { rpc, sendTransaction, signer } from "./helpers/mockRpc.ts";
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
    limitOrderExecutionFee: 1000, // 0.1%
    rebalanceProtocolFee: HUNDRED_PERCENT / 10,
    spotPositionSizeLimitA: 1000_000_000_000,
    spotPositionSizeLimitB: 100000_000_000,
  };

  function testFusionPool(sqrtPrice: bigint): FusionPoolFacade {
    const tickCurrentIndex = sqrtPriceToTickIndex(sqrtPrice);
    return {
      feeGrowthGlobalA: 0n,
      feeGrowthGlobalB: 0n,
      feeRate: 3000,
      liquidity: 10000000000000n,
      olpFeeOwedA: 0n,
      olpFeeOwedB: 0n,
      ordersFilledAmountA: 0n,
      ordersFilledAmountB: 0n,
      ordersTotalAmountA: 0n,
      ordersTotalAmountB: 0n,
      protocolFeeRate: 0,
      sqrtPrice,
      tickCurrentIndex,
      tickSpacing: 2,
    };
  }

  function testTick(liquidityNet: bigint): TickFacade {
    return {
      initialized: true,
      liquidityNet,
      age: 0n,
      feeGrowthOutsideA: 0n,
      feeGrowthOutsideB: 0n,
      fulfilledAToBOrdersInput: 0n,
      fulfilledBToAOrdersInput: 0n,
      liquidityGross: 0n,
      openOrdersInput: 0n,
      partFilledOrdersInput: 0n,
      partFilledOrdersRemainingInput: 0n,
    };
  }

  function testTickArray(startTickIndex: number): TickArrayFacade {
    const ticks: TickFacade[] = [];
    for (let i = 0; i < _TICK_ARRAY_SIZE(); i++) {
      ticks.push(testTick(0n));
    }
    return {
      startTickIndex,
      ticks,
    };
  }

  function testTickArrays(fusionPool: FusionPoolFacade): TickArrayFacade[] {
    const tickSpacing = fusionPool.tickSpacing;
    const tickCurrentIndex = sqrtPriceToTickIndex(fusionPool.sqrtPrice);
    const tickArrayStartIndex = getTickArrayStartTickIndex(tickCurrentIndex, tickSpacing);

    return [
      testTickArray(tickArrayStartIndex),
      testTickArray(tickArrayStartIndex + _TICK_ARRAY_SIZE() * tickSpacing),
      testTickArray(tickArrayStartIndex + _TICK_ARRAY_SIZE() * tickSpacing * 2),
      testTickArray(tickArrayStartIndex - _TICK_ARRAY_SIZE() * tickSpacing),
      testTickArray(tickArrayStartIndex - _TICK_ARRAY_SIZE() * tickSpacing * 2),
    ];
  }

  it("QUOTE: Increase a LONG position in token A using collateral in token B", async () => {
    const sqrtPrice = priceToSqrtPrice(200.0, 9, 6);
    const fusionPool = testFusionPool(sqrtPrice);

    const quoteParams = {
      increaseAmount: 5000_000_000n,
      collateralToken: PoolToken.B,
      positionToken: PoolToken.A,
      leverage: 5.0,
      fusionPool,
      tickArrays: testTickArrays(fusionPool),
    };

    let quote = getIncreaseSpotPositionQuote({
      ...quoteParams,
      protocolFeeRate: 0,
      protocolFeeRateOnCollateral: 0,
    });

    expect(quote.collateral).toEqual(1015045135n);
    expect(quote.borrow).toEqual(4000000000n);
    expect(quote.estimatedAmount).toEqual(25_000_000_000n);
    expect(quote.protocolFeeA).toEqual(0n);
    expect(quote.protocolFeeB).toEqual(0n);
    expect(quote.priceImpact).toEqual(0.22306022789755353);
    expect(Number(quote.estimatedAmount) / Number(quote.estimatedAmount - (quote.borrow * 1000n) / 200n)).toEqual(5);

    quote = getIncreaseSpotPositionQuote({
      ...quoteParams,
      protocolFeeRate: HUNDRED_PERCENT / 100,
      protocolFeeRateOnCollateral: HUNDRED_PERCENT / 100,
    });

    expect(quote.collateral).toEqual(1065702156n);
    expect(quote.borrow).toEqual(4000000000n);
    expect(quote.estimatedAmount).toEqual(25_000_000_000n);
    expect(quote.protocolFeeA).toEqual(0n);
    expect(quote.protocolFeeB).toEqual(50657022n);
    expect(quote.priceImpact).toEqual(0.22306022789755353);
    expect(Number(quote.estimatedAmount) / Number(quote.estimatedAmount - (quote.borrow * 1000n) / 200n)).toEqual(5);
  });

  it("QUOTE: Increase a SHORT position in token B using collateral in token A", async () => {
    const sqrtPrice = priceToSqrtPrice(200.0, 9, 6);
    const fusionPool = testFusionPool(sqrtPrice);

    const quote = getIncreaseSpotPositionQuote({
      increaseAmount: 5_000_000_000n,
      collateralToken: PoolToken.A,
      positionToken: PoolToken.B,
      leverage: 5.0,
      fusionPool,
      tickArrays: testTickArrays(fusionPool),
      protocolFeeRate: HUNDRED_PERCENT / 100,
      protocolFeeRateOnCollateral: HUNDRED_PERCENT / 100,
    });

    expect(quote.collateral).toEqual(1065702156n);
    expect(quote.borrow).toEqual(4000000000n);
    expect(quote.estimatedAmount).toEqual(1_000_000_000n);
    expect(quote.protocolFeeA).toEqual(50657022n);
    expect(quote.protocolFeeB).toEqual(0n);
    expect(quote.priceImpact).toEqual(0.04457228974642513);
    expect(Number(quote.estimatedAmount) / Number(quote.estimatedAmount - (quote.borrow / 1000n) * 200n)).toEqual(5);
  });

  it("QUOTE: Increase a LONG position providing token A as collateral", async () => {
    const sqrtPrice = priceToSqrtPrice(200.0, 9, 6);
    const fusionPool = testFusionPool(sqrtPrice);

    const quoteParams = {
      increaseAmount: 5_000_000_000n,
      collateralToken: PoolToken.A,
      positionToken: PoolToken.A,
      leverage: 5.0,
      fusionPool,
      tickArrays: testTickArrays(fusionPool),
    };

    let quote = getIncreaseSpotPositionQuote({
      ...quoteParams,
      protocolFeeRate: 0,
      protocolFeeRateOnCollateral: 0,
    });

    expect(quote.collateral).toEqual(1012000000n);
    expect(quote.borrow).toEqual(800000000n);
    expect(quote.estimatedAmount).toEqual(5_000_000_000n);
    expect(quote.protocolFeeA).toEqual(0n);
    expect(quote.protocolFeeB).toEqual(0n);

    quote = getIncreaseSpotPositionQuote({
      ...quoteParams,
      protocolFeeRate: HUNDRED_PERCENT / 100,
      protocolFeeRateOnCollateral: HUNDRED_PERCENT / 100,
    });

    expect(quote.collateral).toEqual(1062505050n);
    expect(quote.borrow).toEqual(800000000n);
    expect(quote.estimatedAmount).toEqual(5_000_000_000n);
    expect(quote.protocolFeeA).toEqual(10625051n);
    expect(quote.protocolFeeB).toEqual(8000000n);
  });

  it(`SIMULATE: Increase a LONG position providing token A as collateral`, async () => {
    const testFusionMarket = await setupTestMarket({ marketMaker: MarketMaker.Fusion, ...marketArgs });

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
    const quote = getIncreaseSpotPositionQuote({
      increaseAmount: 200_000_000n,
      collateralToken: PoolToken.A,
      positionToken: PoolToken.A,
      leverage: 5.0,
      fusionPool: fusionPool.data,
      tickArrays: tickArrays.map(account => account.data),
      protocolFeeRate: market.data.protocolFee,
      protocolFeeRateOnCollateral: market.data.protocolFeeOnCollateral,
    });

    assertIncreaseTunaSpotPosition(
      await increaseTunaSpotPosition({
        rpc,
        pool: testFusionMarket.pool,
        collateralAmount: quote.collateral,
        borrowAmount: quote.borrow,
      }),
      { amountA: 199988578n, amountB: 0n },
    );

    // Compare the quoted and actual price impact
    const fusionPoolAfter = await fetchFusionPool(rpc, testFusionMarket.pool);
    const price = sqrtPriceToPrice(fusionPool.data.sqrtPrice, 1, 1);
    const newPrice = sqrtPriceToPrice(fusionPoolAfter.data.sqrtPrice, 1, 1);
    const priceImpact = Math.abs(newPrice / price - 1.0) * 100;
    expect(priceImpact).toBeCloseTo(quote.priceImpact, 9);
  });

  it("QUOTE: Increase a SHORT position providing token B as collateral", async () => {
    const sqrtPrice = priceToSqrtPrice(200.0, 9, 6);
    const fusionPool = testFusionPool(sqrtPrice);

    const quoteParams = {
      increaseAmount: 5000_000_000n,
      collateralToken: PoolToken.B,
      positionToken: PoolToken.B,
      leverage: 5.0,
      fusionPool,
      tickArrays: testTickArrays(fusionPool),
    };

    let quote = getIncreaseSpotPositionQuote({
      ...quoteParams,
      protocolFeeRate: 0,
      protocolFeeRateOnCollateral: 0,
    });

    expect(quote.collateral).toEqual(1012000000n);
    expect(quote.borrow).toEqual(20000000000n);
    expect(quote.estimatedAmount).toEqual(5000_000_000n);
    expect(quote.protocolFeeA).toEqual(0n);
    expect(quote.protocolFeeB).toEqual(0n);

    quote = getIncreaseSpotPositionQuote({
      ...quoteParams,
      protocolFeeRate: HUNDRED_PERCENT / 100,
      protocolFeeRateOnCollateral: HUNDRED_PERCENT / 100,
    });

    expect(quote.collateral).toEqual(1062505050n);
    expect(quote.borrow).toEqual(20000000000n);
    expect(quote.protocolFeeA).toEqual(200000000n);
    expect(quote.protocolFeeB).toEqual(10625051n);
  });

  it(`SIMULATE: Increase a SHORT position providing token A as collateral`, async () => {
    const testFusionMarket = await setupTestMarket({ marketMaker: MarketMaker.Fusion, ...marketArgs });

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

    const increaseQuote = getIncreaseSpotPositionQuote({
      increaseAmount: 1_000_000_000n,
      collateralToken: PoolToken.A,
      positionToken: PoolToken.B,
      leverage: 3.0,
      fusionPool: fusionPool.data,
      tickArrays: tickArrays.map(account => account.data),
      protocolFeeRate: market.data.protocolFee,
      protocolFeeRateOnCollateral: market.data.protocolFeeOnCollateral,
    });

    assertIncreaseTunaSpotPosition(
      await increaseTunaSpotPosition({
        rpc,
        pool: testFusionMarket.pool,
        collateralAmount: increaseQuote.collateral,
        borrowAmount: increaseQuote.borrow,
      }),
      { amountA: 0n, amountB: 199_910_597n }, // 200 tokens B = 1 token A
    );

    const fusionPoolAfter = await fetchFusionPool(rpc, testFusionMarket.pool);
    const price = sqrtPriceToPrice(fusionPool.data.sqrtPrice, 1, 1);
    const newPrice = sqrtPriceToPrice(fusionPoolAfter.data.sqrtPrice, 1, 1);
    const priceImpact = Math.abs(newPrice / price - 1.0) * 100;
    // TODO: fix the poor estimation
    expect(priceImpact).toBeCloseTo(increaseQuote.priceImpact, 4);
  });

  it("QUOTE: Decrease a non-leveraged LONG position in token A (collateral in B, reduce only)", async () => {
    const sqrtPrice = priceToSqrtPrice(200.0, 9, 6);
    const fusionPool = testFusionPool(sqrtPrice);

    const quote = getDecreaseSpotPositionQuote({
      decreaseAmount: 200_000_000n, // B
      collateralToken: PoolToken.B,
      positionToken: PoolToken.A,
      leverage: 1.0,
      positionAmount: 5_000_000_000n, // A
      positionDebt: 0n, // B
      reduceOnly: true,
      fusionPool,
      tickArrays: testTickArrays(fusionPool),
      protocolFeeRate: 0,
      protocolFeeRateOnCollateral: 0,
    });

    expect(quote.decreasePercent).toEqual(200000);
    expect(quote.collateralToken).toEqual(PoolToken.B);
    expect(quote.positionToken).toEqual(PoolToken.A);
    expect(quote.collateral).toEqual(0n);
    expect(quote.borrow).toEqual(0n);
    expect(quote.estimatedAmount).toEqual(4_000_000_000n);
    expect(quote.priceImpact).toEqual(0.008916842709072448);
  });

  it("QUOTE: Decrease a non-leveraged LONG position in token A (collateral in A, reduce only)", async () => {
    const sqrtPrice = priceToSqrtPrice(200.0, 9, 6);
    const fusionPool = testFusionPool(sqrtPrice);

    const quote = getDecreaseSpotPositionQuote({
      decreaseAmount: 1_000_000_000n, // A
      collateralToken: PoolToken.A,
      positionToken: PoolToken.A,
      leverage: 1.0,
      positionAmount: 5_000_000_000n, // A
      positionDebt: 0n, // B
      reduceOnly: true,
      fusionPool,
      tickArrays: testTickArrays(fusionPool),
      protocolFeeRate: 0,
      protocolFeeRateOnCollateral: 0,
    });

    expect(quote.decreasePercent).toEqual(200000);
    expect(quote.collateralToken).toEqual(PoolToken.A);
    expect(quote.positionToken).toEqual(PoolToken.A);
    expect(quote.collateral).toEqual(0n);
    expect(quote.borrow).toEqual(0n);
    expect(quote.estimatedAmount).toEqual(4_000_000_000n);
    expect(quote.priceImpact).toEqual(0);
  });

  it("QUOTE: Decrease a LONG position in token A (collateral in B, reduce only)", async () => {
    const sqrtPrice = priceToSqrtPrice(200.0, 9, 6);
    const fusionPool = testFusionPool(sqrtPrice);

    let quote = getDecreaseSpotPositionQuote({
      decreaseAmount: 200_000_000n, // B
      collateralToken: PoolToken.B,
      positionToken: PoolToken.A,
      leverage: 5.0,
      positionAmount: 5_000_000_000n, // A
      positionDebt: 800_000_000n, // B
      reduceOnly: true,
      fusionPool,
      tickArrays: testTickArrays(fusionPool),
      protocolFeeRate: 0,
      protocolFeeRateOnCollateral: 0,
    });

    expect(quote.decreasePercent).toEqual(200000);
    expect(quote.collateralToken).toEqual(PoolToken.B);
    expect(quote.positionToken).toEqual(PoolToken.A);
    expect(quote.collateral).toEqual(0n);
    expect(quote.borrow).toEqual(0n);
    expect(quote.estimatedAmount).toEqual(4_000_000_000n);
    expect(quote.priceImpact).toEqual(0.008916842709072448);

    quote = getDecreaseSpotPositionQuote({
      decreaseAmount: 1200_000_000n,
      collateralToken: PoolToken.B,
      positionToken: PoolToken.A,
      leverage: 5.0,
      positionAmount: 5_000_000_000n,
      positionDebt: 800_000_000n,
      reduceOnly: true,
      fusionPool,
      tickArrays: testTickArrays(fusionPool),
      protocolFeeRate: 0,
      protocolFeeRateOnCollateral: 0,
    });

    expect(quote.decreasePercent).toEqual(HUNDRED_PERCENT);
    expect(quote.collateralToken).toEqual(PoolToken.B);
    expect(quote.positionToken).toEqual(PoolToken.A);
    expect(quote.estimatedAmount).toEqual(0n);
    expect(quote.collateral).toEqual(0n);
    expect(quote.borrow).toEqual(0n);
    expect(quote.priceImpact).toEqual(0.04457228974642513);
  });

  it(`SIMULATE: Decrease a LONG position in token A (collateral in B, reduce only)`, async () => {
    const testFusionMarket = await setupTestMarket({ marketMaker: MarketMaker.Fusion, ...marketArgs });
    const marketAddress = (await getMarketAddress(testFusionMarket.pool))[0];
    const market = await fetchMarket(rpc, marketAddress);
    const positionAddress = (await getTunaSpotPositionAddress(signer.address, market.data.pool))[0];

    await openTunaSpotPosition({
      rpc,
      positionToken: PoolToken.A,
      collateralToken: PoolToken.B,
      pool: testFusionMarket.pool,
    });

    assertIncreaseTunaSpotPosition(
      await increaseTunaSpotPosition({
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

    const quote = getDecreaseSpotPositionQuote({
      decreaseAmount: 200_000_000n,
      leverage: 5.0,
      collateralToken: tunaPosition.data.collateralToken,
      positionToken: tunaPosition.data.positionToken,
      positionAmount: tunaPosition.data.amount,
      positionDebt: tunaPosition.data.loanShares,
      reduceOnly: false,
      fusionPool: fusionPool.data,
      tickArrays: tickArrays.map(account => account.data),
      protocolFeeRate: market.data.protocolFee,
      protocolFeeRateOnCollateral: market.data.protocolFeeOnCollateral,
    });

    expect(quote.estimatedAmount).toEqual(4_004_467_199n);

    assertDecreaseTunaSpotPosition(
      await decreaseTunaSpotPosition({
        rpc,
        pool: testFusionMarket.pool,
        withdrawPercent: quote.decreasePercent,
      }),
      {
        amountA: 4_004_470_050n,
        amountB: 0n,
      },
    );

    const fusionPoolAfter = await fetchFusionPool(rpc, testFusionMarket.pool);
    const price = sqrtPriceToPrice(fusionPool.data.sqrtPrice, 1, 1);
    const newPrice = sqrtPriceToPrice(fusionPoolAfter.data.sqrtPrice, 1, 1);
    const priceImpact = Math.abs(newPrice / price - 1.0) * 100;
    expect(priceImpact).toEqual(quote.priceImpact);
  });

  it("QUOTE: Decrease a LONG position in token A (collateral in A, reduce only)", async () => {
    const sqrtPrice = priceToSqrtPrice(200.0, 9, 6);
    const fusionPool = testFusionPool(sqrtPrice);

    let quote = getDecreaseSpotPositionQuote({
      decreaseAmount: 1_000_000_000n, // A
      collateralToken: PoolToken.A,
      positionToken: PoolToken.A,
      leverage: 5.0,
      positionAmount: 5_000_000_000n, // A
      positionDebt: 800_000_000n, // B
      reduceOnly: true,
      fusionPool,
      tickArrays: testTickArrays(fusionPool),
      protocolFeeRate: 0,
      protocolFeeRateOnCollateral: 0,
    });

    expect(quote.decreasePercent).toEqual(200000);
    expect(quote.collateralToken).toEqual(PoolToken.A);
    expect(quote.positionToken).toEqual(PoolToken.A);
    expect(quote.collateral).toEqual(0n);
    expect(quote.borrow).toEqual(0n);
    expect(quote.estimatedAmount).toEqual(4_000_000_000n);
    expect(quote.priceImpact).toEqual(0.007155289528004705);

    quote = getDecreaseSpotPositionQuote({
      decreaseAmount: 6_000_000_000n,
      collateralToken: PoolToken.A,
      positionToken: PoolToken.A,
      leverage: 5.0,
      positionAmount: 5_000_000_000n,
      positionDebt: 800_000_000n,
      reduceOnly: true,
      fusionPool,
      tickArrays: testTickArrays(fusionPool),
      protocolFeeRate: 0,
      protocolFeeRateOnCollateral: 0,
    });

    expect(quote.decreasePercent).toEqual(HUNDRED_PERCENT);
    expect(quote.collateralToken).toEqual(PoolToken.A);
    expect(quote.positionToken).toEqual(PoolToken.A);
    expect(quote.estimatedAmount).toEqual(0n);
    expect(quote.collateral).toEqual(0n);
    expect(quote.borrow).toEqual(0n);
    expect(quote.priceImpact).toEqual(0.03577388770285017);
  });

  it(`SIMULATE: Decrease a LONG position in token A (collateral in A, reduce only)`, async () => {
    const testFusionMarket = await setupTestMarket({ marketMaker: MarketMaker.Fusion, ...marketArgs });
    const marketAddress = (await getMarketAddress(testFusionMarket.pool))[0];
    const market = await fetchMarket(rpc, marketAddress);
    const positionAddress = (await getTunaSpotPositionAddress(signer.address, market.data.pool))[0];

    await openTunaSpotPosition({
      rpc,
      positionToken: PoolToken.A,
      collateralToken: PoolToken.A,
      pool: testFusionMarket.pool,
    });

    assertIncreaseTunaSpotPosition(
      await increaseTunaSpotPosition({
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

    const quote = getDecreaseSpotPositionQuote({
      decreaseAmount: 2_000_000_000n,
      collateralToken: PoolToken.A,
      positionToken: PoolToken.A,
      leverage: 5.0,
      positionAmount: tunaPosition.data.amount,
      positionDebt: tunaPosition.data.loanShares,
      reduceOnly: false,
      fusionPool: fusionPool.data,
      tickArrays: tickArrays.map(account => account.data),
      protocolFeeRate: market.data.protocolFee,
      protocolFeeRateOnCollateral: market.data.protocolFeeOnCollateral,
    });

    expect(quote.estimatedAmount).toEqual(3_000_000_000n);

    assertDecreaseTunaSpotPosition(
      await decreaseTunaSpotPosition({
        rpc,
        pool: testFusionMarket.pool,
        withdrawPercent: quote.decreasePercent,
      }),
      {
        amountA: 3_000_000_000n,
        amountB: 0n,
      },
    );

    // Compare the quoted and actual price impact
    const fusionPoolAfter = await fetchFusionPool(rpc, testFusionMarket.pool);
    const price = sqrtPriceToPrice(fusionPool.data.sqrtPrice, 1, 1);
    const newPrice = sqrtPriceToPrice(fusionPoolAfter.data.sqrtPrice, 1, 1);
    const priceImpact = Math.abs(newPrice / price - 1.0) * 100;
    expect(priceImpact).toEqual(quote.priceImpact);
  });

  it("QUOTE: Decrease a LONG position in token A and open a SHORT (collateral in B)", async () => {
    const sqrtPrice = priceToSqrtPrice(200.0, 9, 6);
    const fusionPool = testFusionPool(sqrtPrice);

    const quote = getDecreaseSpotPositionQuote({
      decreaseAmount: 1_200_000_000n, // B
      collateralToken: PoolToken.B,
      positionToken: PoolToken.A,
      leverage: 5.0,
      positionAmount: 5_000_000_000n, // A
      positionDebt: 800_000_000n, // B
      reduceOnly: false,
      fusionPool,
      tickArrays: testTickArrays(fusionPool),
      protocolFeeRate: 0,
      protocolFeeRateOnCollateral: 0,
    });

    expect(quote.decreasePercent).toEqual(HUNDRED_PERCENT);
    expect(quote.collateralToken).toEqual(PoolToken.B);
    expect(quote.positionToken).toEqual(PoolToken.B);
    expect(quote.collateral).toEqual(40480000n); // B
    expect(quote.borrow).toEqual(800_000_000n); // A
    expect(quote.estimatedAmount).toEqual(200000000n); // B
    expect(quote.priceImpact).toEqual(0.051701090557965124);
  });

  it(`SIMULATE: Decrease a LONG position in token A and open a SHORT (collateral in B)`, async () => {
    const testFusionMarket = await setupTestMarket({ marketMaker: MarketMaker.Fusion, ...marketArgs });
    const marketAddress = (await getMarketAddress(testFusionMarket.pool))[0];
    const market = await fetchMarket(rpc, marketAddress);
    const positionAddress = (await getTunaSpotPositionAddress(signer.address, market.data.pool))[0];

    await openTunaSpotPosition({
      rpc,
      positionToken: PoolToken.A,
      collateralToken: PoolToken.B,
      pool: testFusionMarket.pool,
    });

    assertIncreaseTunaSpotPosition(
      await increaseTunaSpotPosition({
        rpc,
        pool: testFusionMarket.pool,
        collateralAmount: 200000n,
        borrowAmount: 801_305n,
      }),
      { amountA: 5_000_003n, amountB: 0n },
    );

    const fusionPool = await fetchFusionPool(rpc, testFusionMarket.pool);
    const tickArrays = await fetchTickArrayOrDefault(rpc, fusionPool);
    const tunaPosition = await fetchTunaSpotPosition(rpc, positionAddress);

    const quote = getDecreaseSpotPositionQuote({
      decreaseAmount: BigInt(Math.floor(6_000_000 * sqrtPriceToPrice(fusionPool.data.sqrtPrice, 1, 1))),
      leverage: 5.0,
      collateralToken: tunaPosition.data.collateralToken,
      positionToken: tunaPosition.data.positionToken,
      positionAmount: tunaPosition.data.amount,
      positionDebt: tunaPosition.data.loanShares,
      reduceOnly: false,
      fusionPool: fusionPool.data,
      tickArrays: tickArrays.map(account => account.data),
      protocolFeeRate: market.data.protocolFee,
      protocolFeeRateOnCollateral: market.data.protocolFeeOnCollateral,
    });

    expect(quote.collateral).toEqual(40248n);
    expect(quote.borrow).toEqual(799996n);
    expect(quote.estimatedAmount).toEqual(200000n); // B

    await decreaseTunaSpotPosition({
      rpc,
      pool: testFusionMarket.pool,
      withdrawPercent: HUNDRED_PERCENT,
    });

    await sendTransaction([
      await resetTunaSpotPositionInstruction(rpc, signer, fusionPool.address, {
        collateralToken: quote.collateralToken,
        positionToken: quote.positionToken,
      }),
    ]);

    assertIncreaseTunaSpotPosition(
      await increaseTunaSpotPosition({
        rpc,
        pool: fusionPool.address,
        collateralAmount: quote.collateral,
        borrowAmount: quote.borrow,
      }),
      { amountA: 0n, amountB: 199999n },
    );

    // Compare the quoted and actual price impact
    const fusionPoolAfter = await fetchFusionPool(rpc, testFusionMarket.pool);
    const price = sqrtPriceToPrice(fusionPool.data.sqrtPrice, 1, 1);
    const newPrice = sqrtPriceToPrice(fusionPoolAfter.data.sqrtPrice, 1, 1);
    const priceImpact = Math.abs(newPrice / price - 1.0) * 100;
    expect(priceImpact).toBeCloseTo(quote.priceImpact, 9);
  });

  it("QUOTE: Decrease a LONG position in token A and open a SHORT without leverage (collateral in A)", async () => {
    const sqrtPrice = priceToSqrtPrice(200.0, 9, 6);
    const fusionPool = testFusionPool(sqrtPrice);

    const quote = getDecreaseSpotPositionQuote({
      decreaseAmount: 6_000_000_000n,
      collateralToken: PoolToken.A,
      positionToken: PoolToken.A,
      leverage: 1.0,
      positionAmount: 5_000_000_000n,
      positionDebt: 800_000_000n,
      reduceOnly: false,
      fusionPool,
      tickArrays: testTickArrays(fusionPool),
      protocolFeeRate: 0,
      protocolFeeRateOnCollateral: 0,
    });

    expect(quote.decreasePercent).toEqual(HUNDRED_PERCENT);
    expect(quote.collateralToken).toEqual(PoolToken.A);
    expect(quote.positionToken).toEqual(PoolToken.B);
    expect(quote.collateral).toEqual(1_000_000_000n); // A
    expect(quote.borrow).toEqual(0n); // A
    expect(quote.estimatedAmount).toEqual(200_000_000n); // B
    expect(quote.priceImpact).toEqual(0.044685946117650754);
  });

  it("QUOTE: Decrease a LONG position in token A and open a SHORT (collateral in A)", async () => {
    const sqrtPrice = priceToSqrtPrice(200.0, 9, 6);
    const fusionPool = testFusionPool(sqrtPrice);

    const quote = getDecreaseSpotPositionQuote({
      decreaseAmount: 6_000_000_000n,
      collateralToken: PoolToken.A,
      positionToken: PoolToken.A,
      leverage: 5.0,
      positionAmount: 5_000_000_000n,
      positionDebt: 800_000_000n,
      reduceOnly: false,
      fusionPool,
      tickArrays: testTickArrays(fusionPool),
      protocolFeeRate: 0,
      protocolFeeRateOnCollateral: 0,
    });

    expect(quote.decreasePercent).toEqual(HUNDRED_PERCENT);
    expect(quote.collateralToken).toEqual(PoolToken.A);
    expect(quote.positionToken).toEqual(PoolToken.B);
    expect(quote.collateral).toEqual(202400000n); // A
    expect(quote.borrow).toEqual(800_000_000n); // A
    expect(quote.estimatedAmount).toEqual(200_000_000n); // B
    expect(quote.priceImpact).toEqual(0.04470733362421653);
  });

  it(`SIMULATE: Decrease a LONG position in token A and open a SHORT (collateral in A)`, async () => {
    const testFusionMarket = await setupTestMarket({ marketMaker: MarketMaker.Fusion, ...marketArgs });
    const marketAddress = (await getMarketAddress(testFusionMarket.pool))[0];
    const market = await fetchMarket(rpc, marketAddress);
    const positionAddress = (await getTunaSpotPositionAddress(signer.address, market.data.pool))[0];

    await openTunaSpotPosition({
      rpc,
      positionToken: PoolToken.A,
      collateralToken: PoolToken.A,
      pool: testFusionMarket.pool,
    });

    assertIncreaseTunaSpotPosition(
      await increaseTunaSpotPosition({
        rpc,
        pool: testFusionMarket.pool,
        collateralAmount: 999_997n,
        borrowAmount: 801_244n,
      }),
      { amountA: 5_000_000n, amountB: 0n },
    );

    const fusionPool = await fetchFusionPool(rpc, testFusionMarket.pool);
    const tickArrays = await fetchTickArrayOrDefault(rpc, fusionPool);
    const tunaPosition = await fetchTunaSpotPosition(rpc, positionAddress);

    const quote = getDecreaseSpotPositionQuote({
      decreaseAmount: 6_000_000n,
      leverage: 5.0,
      collateralToken: tunaPosition.data.collateralToken,
      positionToken: tunaPosition.data.positionToken,
      positionAmount: tunaPosition.data.amount,
      positionDebt: tunaPosition.data.loanShares,
      reduceOnly: false,
      fusionPool: fusionPool.data,
      tickArrays: tickArrays.map(account => account.data),
      protocolFeeRate: market.data.protocolFee,
      protocolFeeRateOnCollateral: market.data.protocolFeeOnCollateral,
    });

    expect(quote.collateral).toEqual(201241n); // A
    expect(quote.borrow).toEqual(800000n); // A
    expect(quote.estimatedAmount).toEqual(200_001n); // B

    await decreaseTunaSpotPosition({
      rpc,
      pool: testFusionMarket.pool,
      withdrawPercent: HUNDRED_PERCENT,
    });

    await sendTransaction([
      await resetTunaSpotPositionInstruction(rpc, signer, fusionPool.address, {
        collateralToken: quote.collateralToken,
        positionToken: quote.positionToken,
      }),
    ]);

    assertIncreaseTunaSpotPosition(
      await increaseTunaSpotPosition({
        rpc,
        pool: fusionPool.address,
        collateralAmount: quote.collateral,
        borrowAmount: quote.borrow,
      }),
      { amountA: 0n, amountB: 199_987n },
    );

    const fusionPoolAfter = await fetchFusionPool(rpc, testFusionMarket.pool);
    const price = sqrtPriceToPrice(fusionPool.data.sqrtPrice, 1, 1);
    const newPrice = sqrtPriceToPrice(fusionPoolAfter.data.sqrtPrice, 1, 1);
    const priceImpact = Math.abs(newPrice / price - 1.0) * 100;
    // Small difference in price impact is expected due to rounding errors.
    expect(priceImpact).toBeCloseTo(quote.priceImpact, 9);
  });

  it("QUOTE: Decrease a SHORT position in token B and open a LONG (collateral in A)", async () => {
    const sqrtPrice = priceToSqrtPrice(200.0, 9, 6);
    const fusionPool = testFusionPool(sqrtPrice);

    const quote = getDecreaseSpotPositionQuote({
      decreaseAmount: 6_000_000_000n, // A
      collateralToken: PoolToken.A,
      positionToken: PoolToken.B,
      leverage: 5.0,
      positionAmount: 1000_000_000n, // B
      positionDebt: 4_000_000_000n, // A
      reduceOnly: false,
      fusionPool,
      tickArrays: testTickArrays(fusionPool),
      protocolFeeRate: 0,
      protocolFeeRateOnCollateral: 0,
    });

    expect(quote.decreasePercent).toEqual(HUNDRED_PERCENT);
    expect(quote.collateralToken).toEqual(PoolToken.A);
    expect(quote.positionToken).toEqual(PoolToken.A);
    expect(quote.collateral).toEqual(202_400_000n); // A
    expect(quote.borrow).toEqual(160_000_000n); // B
    expect(quote.estimatedAmount).toEqual(1_000_000_000n); // A
    expect(quote.priceImpact).toEqual(0.05172783435274386);
  });

  it("QUOTE: Decrease a SHORT position without leverage in token B and open a LONG (collateral in A)", async () => {
    const sqrtPrice = priceToSqrtPrice(200.0, 9, 6);
    const fusionPool = testFusionPool(sqrtPrice);

    const quote = getDecreaseSpotPositionQuote({
      decreaseAmount: 6_000_000_000n, // A
      collateralToken: PoolToken.A,
      positionToken: PoolToken.B,
      leverage: 1.0,
      positionAmount: 1000_000_000n, // B
      positionDebt: 0n, // A
      reduceOnly: false,
      fusionPool,
      tickArrays: testTickArrays(fusionPool),
      protocolFeeRate: 0,
      protocolFeeRateOnCollateral: 0,
    });

    expect(quote.decreasePercent).toEqual(HUNDRED_PERCENT);
    expect(quote.collateralToken).toEqual(PoolToken.A);
    expect(quote.positionToken).toEqual(PoolToken.A);
    expect(quote.collateral).toEqual(1_000_000_000n); // A
    expect(quote.borrow).toEqual(0n); // B
    expect(quote.estimatedAmount).toEqual(1_000_000_000n); // A
    expect(quote.priceImpact).toEqual(0.044592165429757635);
  });

  it("Liquidation price for position in token A", async () => {
    expect(getLiquidationPrice(PoolToken.A, 5.0, 0.0, 0.85)).toEqual(0);
    expect(getLiquidationPrice(PoolToken.A, 0.0, 5.0, 0.85)).toEqual(0);
    expect(getLiquidationPrice(PoolToken.A, 5.0, 800.0, 0.85)).toEqual(188.23529411764707);
    expect(getLiquidationPrice(PoolToken.B, 1000.0, 4.0, 0.85)).toEqual(212.5);
  });

  it("Tradable amount for a new 1x LONG position (collateral in token B)", async () => {
    const sqrtPrice = priceToSqrtPrice(200.0, 9, 6);
    const fusionPool = testFusionPool(sqrtPrice);

    const args = {
      collateralToken: PoolToken.B,
      positionToken: PoolToken.A,
      leverage: 1.0,
      fusionPool,
      tickArrays: testTickArrays(fusionPool),
      protocolFeeRateOnCollateral: 0,
      protocolFeeRate: 0,
    };

    const availableBalance = 200_000_000n;

    const tradableAmount = getTradableAmount({
      availableBalance: 200_000_000n,
      newPositionToken: args.positionToken,
      positionAmount: 0n,
      positionDebt: 0n,
      reduceOnly: false,
      ...args,
    });
    expect(tradableAmount).toEqual(199400000n);

    const quote = getIncreaseSpotPositionQuote({
      increaseAmount: tradableAmount,
      ...args,
    });
    expect(quote.collateral).toEqual(availableBalance);
    expect(quote.borrow).toEqual(0n);
  });

  it("Tradable amount for a new 3x LONG position (collateral in token B)", async () => {
    const sqrtPrice = priceToSqrtPrice(200.0, 9, 6);
    const fusionPool = testFusionPool(sqrtPrice);

    const args = {
      collateralToken: PoolToken.B,
      positionToken: PoolToken.A,
      leverage: 3.0,
      fusionPool,
      tickArrays: testTickArrays(fusionPool),
      protocolFeeRateOnCollateral: 0,
      protocolFeeRate: 0,
    };

    const tradableAmount = getTradableAmount({
      availableBalance: 10_000_000n,
      newPositionToken: args.positionToken,
      positionAmount: 0n,
      positionDebt: 0n,
      reduceOnly: false,
      ...args,
    });
    expect(tradableAmount).toEqual(29731610n);

    const quote = getIncreaseSpotPositionQuote({
      increaseAmount: tradableAmount,
      ...args,
    });
    expect(quote.collateral).toEqual(10000000n);
    expect(quote.borrow).toEqual(19821074n);
  });

  it("Tradable amount for a new 5x LONG position (collateral in token A)", async () => {
    const sqrtPrice = priceToSqrtPrice(200.0, 9, 6);
    const fusionPool = testFusionPool(sqrtPrice);

    const args = {
      collateralToken: PoolToken.A,
      positionToken: PoolToken.A,
      leverage: 5.0,
      fusionPool,
      tickArrays: testTickArrays(fusionPool),
      protocolFeeRateOnCollateral: HUNDRED_PERCENT / 200,
      protocolFeeRate: HUNDRED_PERCENT / 100,
    };

    const tradableAmount = getTradableAmount({
      availableBalance: 1_000_000_000n,
      newPositionToken: args.positionToken,
      positionAmount: 0n,
      positionDebt: 0n,
      reduceOnly: false,
      ...args,
    });
    expect(tradableAmount).toEqual(4729626953n);

    const quote = getIncreaseSpotPositionQuote({
      increaseAmount: tradableAmount,
      ...args,
    });
    expect(quote.collateral).toEqual(1_000_000_000n);
    expect(quote.borrow).toEqual(756740313n);
    expect(quote.estimatedAmount).toEqual(tradableAmount);
  });

  it("Tradable amount for a new 5x SHORT position (collateral in token B)", async () => {
    const sqrtPrice = priceToSqrtPrice(200.0, 9, 6);
    const fusionPool = testFusionPool(sqrtPrice);

    const args = {
      collateralToken: PoolToken.B,
      positionToken: PoolToken.B,
      leverage: 5.0,
      fusionPool,
      tickArrays: testTickArrays(fusionPool),
      protocolFeeRateOnCollateral: HUNDRED_PERCENT / 200,
      protocolFeeRate: HUNDRED_PERCENT / 100,
    };

    const tradableAmount = getTradableAmount({
      availableBalance: 200_000_000n,
      newPositionToken: args.positionToken,
      positionAmount: 0n,
      positionDebt: 0n,
      reduceOnly: false,
      ...args,
    });
    expect(tradableAmount).toEqual(945925390n);

    const quote = getIncreaseSpotPositionQuote({
      increaseAmount: tradableAmount,
      ...args,
    });
    expect(quote.collateral).toEqual(200_000_001n);
    expect(quote.borrow).toEqual(3783701560n);
    expect(quote.estimatedAmount).toEqual(tradableAmount);
  });

  it("Tradable amount when reducing the existing position", async () => {
    const sqrtPrice = priceToSqrtPrice(200.0, 9, 6);
    const fusionPool = testFusionPool(sqrtPrice);

    let args = {
      leverage: 5.0,
      collateralToken: PoolToken.A,
      positionToken: PoolToken.A,
      newPositionToken: PoolToken.B,
      positionAmount: 5_000_000_000n,
      positionDebt: 800_000_000n,
      reduceOnly: true,
      fusionPool,
      tickArrays: testTickArrays(fusionPool),
      protocolFeeRateOnCollateral: 0,
      protocolFeeRate: 0,
    };

    let tradableAmount = getTradableAmount({
      availableBalance: 50_000_000_000n,
      ...args,
    });
    expect(tradableAmount).toEqual(5_000_000_000n);

    let quote = getDecreaseSpotPositionQuote({
      decreaseAmount: tradableAmount,
      ...args,
    });
    expect(quote.decreasePercent).toEqual(HUNDRED_PERCENT);

    args = {
      leverage: 5.0,
      collateralToken: PoolToken.B,
      positionToken: PoolToken.A,
      newPositionToken: PoolToken.B,
      positionAmount: 5_000_000_000n,
      positionDebt: 800_000_000n,
      reduceOnly: true,
      fusionPool,
      tickArrays: testTickArrays(fusionPool),
      protocolFeeRateOnCollateral: 0,
      protocolFeeRate: 0,
    };

    tradableAmount = getTradableAmount({
      availableBalance: 50_000_000_000n,
      ...args,
    });
    expect(tradableAmount).toEqual(1_000_000_000n);

    quote = getDecreaseSpotPositionQuote({
      decreaseAmount: tradableAmount,
      ...args,
    });
    expect(quote.decreasePercent).toEqual(HUNDRED_PERCENT);
  });

  it("Tradable amount when inverting the existing position (collateral in A)", async () => {
    const sqrtPrice = priceToSqrtPrice(200.0, 9, 6);
    const fusionPool = testFusionPool(sqrtPrice);

    const args = {
      leverage: 5.0,
      collateralToken: PoolToken.A,
      positionToken: PoolToken.A,
      newPositionToken: PoolToken.B,
      positionAmount: 5_000_000_000n,
      positionDebt: 800_000_000n,
      reduceOnly: false,
      fusionPool,
      tickArrays: testTickArrays(fusionPool),
      protocolFeeRateOnCollateral: HUNDRED_PERCENT / 200,
      protocolFeeRate: HUNDRED_PERCENT / 100,
    };

    const tradableAmount = getTradableAmount({
      availableBalance: 2_000_000_000n,
      ...args,
    });
    expect(tradableAmount).toEqual(19_086_173_788n);

    const quote = getDecreaseSpotPositionQuote({
      decreaseAmount: tradableAmount,
      ...args,
    });
    expect(quote.decreasePercent).toEqual(HUNDRED_PERCENT);
    expect(quote.collateral).toEqual(2_978_284_319n);
  });

  it("SIMULATE: Tradable amount when inverting the existing position (collateral in A)", async () => {
    const testFusionMarket = await setupTestMarket({ marketMaker: MarketMaker.Fusion, ...marketArgs });
    const marketAddress = (await getMarketAddress(testFusionMarket.pool))[0];
    const market = await fetchMarket(rpc, marketAddress);
    const positionAddress = (await getTunaSpotPositionAddress(signer.address, market.data.pool))[0];

    await openTunaSpotPosition({
      rpc,
      positionToken: PoolToken.A,
      collateralToken: PoolToken.A,
      pool: testFusionMarket.pool,
    });

    assertIncreaseTunaSpotPosition(
      await increaseTunaSpotPosition({
        rpc,
        pool: testFusionMarket.pool,
        collateralAmount: 1_000_000_000n,
        borrowAmount: 802677606n,
      }),
      { amountA: 5_000_000_001n, amountB: 0n },
    );

    const fusionPool = await fetchFusionPool(rpc, testFusionMarket.pool);
    const tickArrays = await fetchTickArrayOrDefault(rpc, fusionPool);
    const tunaPosition = await fetchTunaSpotPosition(rpc, positionAddress);

    const args = {
      leverage: 5.0,
      collateralToken: tunaPosition.data.collateralToken,
      positionToken: tunaPosition.data.positionToken,
      newPositionToken: tunaPosition.data.positionToken == PoolToken.A ? PoolToken.B : PoolToken.A,
      positionAmount: tunaPosition.data.amount,
      positionDebt: tunaPosition.data.loanShares,
      reduceOnly: false,
      fusionPool: fusionPool.data,
      tickArrays: tickArrays.map(account => account.data),
      protocolFeeRateOnCollateral: market.data.protocolFeeOnCollateral,
      protocolFeeRate: market.data.protocolFee,
    };

    const tradableAmount = getTradableAmount({
      availableBalance: 2_000_000_000n,
      ...args,
    });
    expect(tradableAmount).toEqual(19866174244n);

    const quote = getDecreaseSpotPositionQuote({
      decreaseAmount: tradableAmount,
      ...args,
    });
    expect(quote.decreasePercent).toEqual(HUNDRED_PERCENT);
    expect(quote.collateral).toEqual(2_991_683_786n);

    assertDecreaseTunaSpotPosition(
      await decreaseTunaSpotPosition({
        rpc,
        pool: testFusionMarket.pool,
        withdrawPercent: quote.decreasePercent,
      }),
      {
        userBalanceDeltaA: 992_581_561n,
        userBalanceDeltaB: 0n,
      },
    );

    await sendTransaction([
      await resetTunaSpotPositionInstruction(rpc, signer, fusionPool.address, {
        collateralToken: quote.collateralToken,
        positionToken: quote.positionToken,
      }),
    ]);

    assertIncreaseTunaSpotPosition(
      await increaseTunaSpotPosition({
        rpc,
        pool: fusionPool.address,
        collateralAmount: quote.collateral,
        borrowAmount: quote.borrow,
      }),
      { amountA: 0n, amountB: 2_953_407_583n },
    );

    const fusionPoolAfter = await fetchFusionPool(rpc, testFusionMarket.pool);
    const price = sqrtPriceToPrice(fusionPool.data.sqrtPrice, 1, 1);
    const newPrice = sqrtPriceToPrice(fusionPoolAfter.data.sqrtPrice, 1, 1);
    const priceImpact = Math.abs(newPrice / price - 1.0) * 100;
    // Small difference in price impact is expected due to rounding errors.
    expect(priceImpact).toBeCloseTo(quote.priceImpact, 9);
  });

  it("Tradable amount when inverting the existing position (collateral in B)", async () => {
    const sqrtPrice = priceToSqrtPrice(200.0, 9, 6);
    const fusionPool = testFusionPool(sqrtPrice);

    const args = {
      leverage: 5.0,
      collateralToken: PoolToken.B,
      positionToken: PoolToken.A,
      newPositionToken: PoolToken.B,
      positionAmount: 5_000_000_000n,
      positionDebt: 800_000_000n,
      reduceOnly: false,
      fusionPool,
      tickArrays: testTickArrays(fusionPool),
      protocolFeeRateOnCollateral: HUNDRED_PERCENT / 200,
      protocolFeeRate: HUNDRED_PERCENT / 100,
    };

    const tradableAmount = getTradableAmount({
      availableBalance: 500_000_000n,
      ...args,
    });
    expect(tradableAmount).toEqual(4_295_498_968n);

    const quote = getDecreaseSpotPositionQuote({
      decreaseAmount: tradableAmount,
      ...args,
    });
    expect(quote.decreasePercent).toEqual(HUNDRED_PERCENT);
    expect(quote.collateral).toEqual(696_777_779n);
  });
});
