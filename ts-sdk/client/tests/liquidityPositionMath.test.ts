import { priceToSqrtPrice, priceToTickIndex } from "@crypticdot/fusionamm-core";
import { describe, expect, it } from "vitest";

import { COMPUTED_AMOUNT, getLiquidityIncreaseQuote, HUNDRED_PERCENT } from "../src";

describe("Liquidity Position Math", () => {
  it("Liquidity increase quote", async () => {
    const quote = getLiquidityIncreaseQuote({
      collateralA: 1000000n,
      collateralB: 1000000n,
      borrowA: 2000000n,
      borrowB: 2000000n,
      tickLowerIndex: priceToTickIndex(1.0, 1, 1),
      sqrtPrice: priceToSqrtPrice(2.0, 1, 1),
      tickUpperIndex: priceToTickIndex(4.0, 1, 1),
      swapFeeRate: 10000, // 1%
      maxAmountSlippage: HUNDRED_PERCENT / 10,
      protocolFeeRate: HUNDRED_PERCENT / 100,
      protocolFeeRateOnCollateral: HUNDRED_PERCENT / 100,
    });

    expect(quote.collateralA).toEqual(1000000n);
    expect(quote.collateralB).toEqual(1000000n);
    expect(quote.borrowA).toEqual(2000000n);
    expect(quote.borrowB).toEqual(2000000n);
    expect(quote.totalA).toEqual(2223701n);
    expect(quote.totalB).toEqual(4447744n);
    expect(quote.minTotalA).toEqual(2001331n);
    expect(quote.minTotalB).toEqual(4002970n);
    expect(quote.maxCollateralA).toEqual(1000000n);
    expect(quote.maxCollateralB).toEqual(1000000n);
    expect(quote.swapAToB).toEqual(true);
    expect(quote.swapInput).toEqual(742586n);
    expect(quote.swapOutput).toEqual(1470320n);
  });

  it("Liquidity increase quote (A is provided)", async () => {
    const quote = getLiquidityIncreaseQuote({
      collateralA: 10000000n,
      collateralB: 0n,
      borrowA: 0n,
      borrowB: 0n,
      tickLowerIndex: priceToTickIndex(0.25, 6, 9),
      sqrtPrice: priceToSqrtPrice(0.5, 6, 9),
      tickUpperIndex: priceToTickIndex(1.0, 6, 9),
      swapFeeRate: 10000, // 1%
      maxAmountSlippage: HUNDRED_PERCENT / 10,
      protocolFeeRate: HUNDRED_PERCENT / 100,
      protocolFeeRateOnCollateral: HUNDRED_PERCENT / 100,
    });

    expect(quote.collateralA).toEqual(10000000n);
    expect(quote.collateralB).toEqual(0n);
    expect(quote.borrowA).toEqual(0n);
    expect(quote.borrowB).toEqual(0n);
    expect(quote.totalA).toEqual(4925137n); // ~5000000
    expect(quote.totalB).toEqual(2462680451n); // ~2500000000
    expect(quote.minTotalA).toEqual(4432624n);
    expect(quote.minTotalB).toEqual(2216412406n);
    expect(quote.maxCollateralA).toEqual(10000000n);
    expect(quote.maxCollateralB).toEqual(0n);
    expect(quote.swapAToB).toEqual(true);
    expect(quote.swapInput).toEqual(4950113n);
    expect(quote.swapOutput).toEqual(2450305500n);
  });

  it("Liquidity increase quote with auto deposit ratio (A is provided)", async () => {
    const quote = getLiquidityIncreaseQuote({
      collateralA: 1000000n,
      collateralB: COMPUTED_AMOUNT,
      borrowA: 2000000n,
      borrowB: COMPUTED_AMOUNT,
      tickLowerIndex: priceToTickIndex(1.0, 1, 1),
      sqrtPrice: priceToSqrtPrice(3.0, 1, 1),
      tickUpperIndex: priceToTickIndex(4.0, 1, 1),
      maxAmountSlippage: HUNDRED_PERCENT / 10,
      swapFeeRate: 0,
      protocolFeeRate: 0,
      protocolFeeRateOnCollateral: 0,
    });

    expect(quote.collateralA).toEqual(1000000n);
    expect(quote.collateralB).toEqual(9466049n);
    expect(quote.borrowA).toEqual(2000000n);
    expect(quote.borrowB).toEqual(18932099n);
    expect(quote.totalA).toEqual(3000000n);
    expect(quote.totalB).toEqual(28398148n);
    expect(quote.minTotalA).toEqual(2700000n);
    expect(quote.minTotalB).toEqual(25558334n);
    expect(quote.maxCollateralA).toEqual(1000000n);
    expect(quote.maxCollateralB).toEqual(10412653n);
    expect(quote.swapInput).toEqual(0n);
    expect(quote.swapOutput).toEqual(0n);
  });

  it("Liquidity increase quote with auto deposit ratio (B is provided)", async () => {
    const quote = getLiquidityIncreaseQuote({
      collateralA: COMPUTED_AMOUNT,
      collateralB: 1000000n,
      borrowA: COMPUTED_AMOUNT,
      borrowB: 2000000n,
      tickLowerIndex: priceToTickIndex(1.0, 1, 1),
      sqrtPrice: priceToSqrtPrice(3.0, 1, 1),
      tickUpperIndex: priceToTickIndex(4.0, 1, 1),
      maxAmountSlippage: HUNDRED_PERCENT / 10,
      swapFeeRate: 0,
      protocolFeeRate: 0,
      protocolFeeRateOnCollateral: 0,
    });

    expect(quote.collateralA).toEqual(105640n);
    expect(quote.collateralB).toEqual(1000000n);
    expect(quote.borrowA).toEqual(211282n);
    expect(quote.borrowB).toEqual(2000000n);
    expect(quote.totalA).toEqual(316922n);
    expect(quote.totalB).toEqual(3000000n);
    expect(quote.minTotalA).toEqual(285230n);
    expect(quote.minTotalB).toEqual(2700000n);
    expect(quote.maxCollateralA).toEqual(116204n);
    expect(quote.maxCollateralB).toEqual(1000000n);
    expect(quote.swapInput).toEqual(0n);
    expect(quote.swapOutput).toEqual(0n);
  });

  it("Liquidity increase quote with auto deposit ratio, one-sided, token A", async () => {
    const quote = getLiquidityIncreaseQuote({
      collateralA: 1000000n,
      collateralB: COMPUTED_AMOUNT,
      borrowA: 2000000n,
      borrowB: COMPUTED_AMOUNT,
      tickLowerIndex: priceToTickIndex(1.0, 1, 1),
      sqrtPrice: priceToSqrtPrice(0.5, 1, 1),
      tickUpperIndex: priceToTickIndex(4.0, 1, 1),
      maxAmountSlippage: HUNDRED_PERCENT / 10,
      swapFeeRate: 0,
      protocolFeeRate: 0,
      protocolFeeRateOnCollateral: 0,
    });

    expect(quote.collateralA).toEqual(1000000n);
    expect(quote.collateralB).toEqual(0n);
    expect(quote.borrowA).toEqual(2000000n);
    expect(quote.borrowB).toEqual(0n);
    expect(quote.totalA).toEqual(3000000n);
    expect(quote.totalB).toEqual(0n);
    expect(quote.minTotalA).toEqual(2700000n);
    expect(quote.minTotalB).toEqual(0n);
    expect(quote.maxCollateralA).toEqual(1000000n);
    expect(quote.maxCollateralB).toEqual(0n);
    expect(quote.swapInput).toEqual(0n);
    expect(quote.swapOutput).toEqual(0n);
  });

  it("Liquidity increase quote with auto deposit ratio, one-sided, token B", async () => {
    const quote = getLiquidityIncreaseQuote({
      collateralA: COMPUTED_AMOUNT,
      collateralB: 1000000n,
      borrowA: COMPUTED_AMOUNT,
      borrowB: 2000000n,
      tickLowerIndex: priceToTickIndex(1.0, 1, 1),
      sqrtPrice: priceToSqrtPrice(5.0, 1, 1),
      tickUpperIndex: priceToTickIndex(4.0, 1, 1),
      maxAmountSlippage: HUNDRED_PERCENT / 10,
      swapFeeRate: 0,
      protocolFeeRate: 0,
      protocolFeeRateOnCollateral: 0,
    });

    expect(quote.collateralA).toEqual(0n);
    expect(quote.collateralB).toEqual(1000000n);
    expect(quote.borrowA).toEqual(0n);
    expect(quote.borrowB).toEqual(2000000n);
    expect(quote.totalA).toEqual(0n);
    expect(quote.totalB).toEqual(3000000n);
    expect(quote.minTotalA).toEqual(0n);
    expect(quote.minTotalB).toEqual(2700000n);
    expect(quote.maxCollateralA).toEqual(0n);
    expect(quote.maxCollateralB).toEqual(1000000n);
    expect(quote.swapInput).toEqual(0n);
    expect(quote.swapOutput).toEqual(0n);
  });
});
