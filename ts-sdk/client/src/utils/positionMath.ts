import {
  positionRatioX64,
  tickIndexToSqrtPrice,
  tryApplySwapFee,
  tryGetLiquidityFromA,
  tryGetLiquidityFromB,
  tryGetTokenAFromLiquidity,
  tryGetTokenBFromLiquidity,
} from "@crypticdot/fusionamm-core";

import { COMPUTED_AMOUNT, HUNDRED_PERCENT } from "../consts.ts";

/** The default amount slippage is set to 50% to avoid transactions failures. */
export const DEFAULT_MAX_AMOUNT_SLIPPAGE = HUNDRED_PERCENT / 2;

export type IncreaseLiquidityQuoteArgs = {
  /** Collateral in token A or COMPUTED_AMOUNT. */
  collateralA: bigint;
  /** Collateral in token B or COMPUTED_AMOUNT. */
  collateralB: bigint;
  /** Amount to borrow in token A. Must be set to COMPUTED_AMOUNT if collateralA is COMPUTED_AMOUNT. */
  borrowA: bigint;
  /** Amount to borrow in token B. Must be set to COMPUTED_AMOUNT if collateralB is COMPUTED_AMOUNT. */
  borrowB: bigint;
  /** Protocol fee rate from a market account represented as hundredths of a basis point. */
  protocolFeeRate: number;
  /** Protocol fee rate from a market account represented as hundredths of a basis point. */
  protocolFeeRateOnCollateral: number;
  /** The swap fee rate of a pool. */
  swapFeeRate: number;
  /** Current sqrt price. */
  sqrtPrice: bigint;
  /** Position lower tick index. */
  tickLowerIndex: number;
  /** Position upper tick index. */
  tickUpperIndex: number;
  /** Maximum slippage of the position total amount represented as hundredths of a basis point.
   * (0.01% = 100, 100% = HUNDRED_PERCENT).
   **/
  maxAmountSlippage: number;
};

export type IncreaseLiquidityQuoteResult = {
  collateralA: bigint;
  collateralB: bigint;
  maxCollateralA: bigint;
  maxCollateralB: bigint;
  borrowA: bigint;
  borrowB: bigint;
  totalA: bigint;
  totalB: bigint;
  minTotalA: bigint;
  minTotalB: bigint;
  swapInput: bigint;
  swapOutput: bigint;
  swapAToB: boolean;
  protocolFeeA: bigint;
  protocolFeeB: bigint;
};

export function getLiquidityIncreaseQuote(args: IncreaseLiquidityQuoteArgs): IncreaseLiquidityQuoteResult {
  const { protocolFeeRate, protocolFeeRateOnCollateral, swapFeeRate, sqrtPrice, tickLowerIndex, tickUpperIndex } = args;
  let { collateralA, collateralB, borrowA, borrowB } = args;

  if (tickLowerIndex > tickUpperIndex) {
    throw new Error("Incorrect position tick index order: the lower tick must be less or equal the upper tick.");
  }

  if (args.maxAmountSlippage < 0 || args.maxAmountSlippage > HUNDRED_PERCENT) {
    throw new Error("maxAmountSlippage must be in range [0; HUNDRED_PERCENT]");
  }

  if (args.collateralA == COMPUTED_AMOUNT && args.collateralB == COMPUTED_AMOUNT) {
    throw new Error("Both collateral amounts can't be set to COMPUTED_AMOUNT");
  }

  const maxAmountSlippage =
    args.maxAmountSlippage > 0 ? BigInt(args.maxAmountSlippage) : BigInt(DEFAULT_MAX_AMOUNT_SLIPPAGE);

  let maxCollateralA = BigInt(collateralA);
  let maxCollateralB = BigInt(collateralB);

  const lowerSqrtPrice = tickIndexToSqrtPrice(tickLowerIndex);
  const upperSqrtPrice = tickIndexToSqrtPrice(tickUpperIndex);

  if (collateralA == COMPUTED_AMOUNT) {
    if (sqrtPrice <= lowerSqrtPrice) {
      throw new Error("sqrtPrice must be greater than lowerSqrtPrice if collateral A is computed.");
    } else if (sqrtPrice < upperSqrtPrice) {
      const liquidity = tryGetLiquidityFromB(collateralB + borrowB, lowerSqrtPrice, sqrtPrice);
      const amountA = tryGetTokenAFromLiquidity(liquidity, sqrtPrice, upperSqrtPrice, false);
      collateralA = (amountA * collateralB) / (collateralB + borrowB);
      borrowA = amountA - collateralA;
      maxCollateralA = collateralA + (collateralA * maxAmountSlippage) / BigInt(HUNDRED_PERCENT);
    } else {
      collateralA = 0n;
      maxCollateralA = 0n;
      borrowA = 0n;
    }
  } else if (collateralB == COMPUTED_AMOUNT) {
    if (sqrtPrice <= lowerSqrtPrice) {
      collateralB = 0n;
      maxCollateralB = 0n;
      borrowB = 0n;
    } else if (sqrtPrice < upperSqrtPrice) {
      const liquidity = tryGetLiquidityFromA(collateralA + borrowA, sqrtPrice, upperSqrtPrice);
      const amountB = tryGetTokenBFromLiquidity(liquidity, lowerSqrtPrice, sqrtPrice, false);
      collateralB = (amountB * collateralA) / (collateralA + borrowA);
      borrowB = amountB - collateralB;
      maxCollateralB = collateralB + (collateralB * maxAmountSlippage) / BigInt(HUNDRED_PERCENT);
    } else {
      throw new Error("sqrtPrice must be less than upperSqrtPrice if collateral B is computed.");
    }
  }

  const protocolFeeA = calculateProtocolFee(collateralA, borrowA, protocolFeeRate, protocolFeeRateOnCollateral);
  const providedA = collateralA + borrowA - protocolFeeA;

  const protocolFeeB = calculateProtocolFee(collateralB, borrowB, protocolFeeRate, protocolFeeRateOnCollateral);
  const providedB = collateralB + borrowB - protocolFeeB;

  let swapInput = 0n;
  let swapOutput = 0n;
  let swapAToB = false;
  let totalA = providedA;
  let totalB = providedB;

  if (args.collateralA != COMPUTED_AMOUNT && args.collateralB != COMPUTED_AMOUNT) {
    const positionRatio = positionRatioX64(sqrtPrice, tickLowerIndex, tickUpperIndex);

    // Estimated total position size.
    let total = ((providedA * sqrtPrice * sqrtPrice) >> 128n) + providedB;
    totalA = ((total * BigInt(positionRatio.ratioA)) << 64n) / (sqrtPrice * sqrtPrice);
    totalB = (total * BigInt(positionRatio.ratioB)) >> 64n;

    let feeA = 0n;
    let feeB = 0n;

    if (totalA < providedA) {
      swapInput = providedA - totalA;
      feeA = swapInput - tryApplySwapFee(swapInput, swapFeeRate);
      swapOutput = ((swapInput - feeA) * sqrtPrice * sqrtPrice) >> 128n;
      swapAToB = true;
    } else if (totalB < providedB) {
      swapInput = providedB - totalB;
      feeB = swapInput - tryApplySwapFee(swapInput, swapFeeRate);
      swapOutput = ((swapInput - feeB) << 128n) / (sqrtPrice * sqrtPrice);
      swapAToB = false;
    }

    // Recompute totals with applied swap fee.
    total = (((providedA - feeA) * sqrtPrice * sqrtPrice) >> 128n) + providedB - feeB;
    totalA = ((total * BigInt(positionRatio.ratioA)) << 64n) / (sqrtPrice * sqrtPrice);
    totalB = (total * BigInt(positionRatio.ratioB)) >> 64n;
  }

  const minTotalA = totalA - (totalA * maxAmountSlippage) / BigInt(HUNDRED_PERCENT);
  const minTotalB = totalB - (totalB * maxAmountSlippage) / BigInt(HUNDRED_PERCENT);

  return {
    collateralA,
    collateralB,
    totalA,
    totalB,
    borrowA,
    borrowB,
    minTotalA,
    minTotalB,
    swapInput,
    swapOutput,
    swapAToB,
    maxCollateralA,
    maxCollateralB,
    protocolFeeA,
    protocolFeeB,
  };
}

/**
 * Calculates the protocol fee for collateral and borrowed amounts based on market's protocol fee rate.
 *
 * @param {bigint} collateralAmount - The amount of tokens provided by the user.
 * @param {bigint} borrowAmount - The amount of tokens borrowed.
 * @param {bigint} protocolFeeRateOnCollateral - The protocol fee rate of a market applied to a collateral amount.
 * @param {bigint} protocolFeeRate - The protocol fee rate of a market applied to a borrowed amount.
 * @returns {bigint} Protocol fee amount.
 */
export function calculateProtocolFee(
  collateralAmount: bigint,
  borrowAmount: bigint,
  protocolFeeRateOnCollateral: number,
  protocolFeeRate: number,
): bigint {
  if (protocolFeeRateOnCollateral > HUNDRED_PERCENT || protocolFeeRate > HUNDRED_PERCENT)
    throw new Error("Protocol fee rate must be between 0 and HUNDRED_PERCENT");

  return (
    (collateralAmount * BigInt(protocolFeeRateOnCollateral)) / BigInt(HUNDRED_PERCENT) +
    (borrowAmount * BigInt(protocolFeeRate)) / BigInt(HUNDRED_PERCENT)
  );
}
