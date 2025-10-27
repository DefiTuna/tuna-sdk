import {
  FusionPoolFacade,
  sqrtPriceToPrice,
  swapQuoteByInputToken,
  swapQuoteByOutputToken,
  TickArrayFacade,
} from "@crypticdot/fusionamm-core";

import { HUNDRED_PERCENT } from "../consts.ts";
import { PoolToken } from "../generated";

import { mulDiv } from "./math.ts";

export type IncreaseSpotPositionQuoteArgs = {
  /** Position total size in the collateralToken. */
  increaseAmount: bigint;
  /** Collateral token. */
  collateralToken: PoolToken;
  /** Token of the position. */
  positionToken: PoolToken;
  /** Leverage: [1.0 .. 100.0] */
  leverage: number;
  /** Protocol fee rate from a market account represented as hundredths of a basis point (0.01% = 100). */
  protocolFeeRate: number;
  /** Protocol fee rate from a market account represented as hundredths of a basis point (0.01% = 100). */
  protocolFeeRateOnCollateral: number;
  /** Fusion pool */
  fusionPool: FusionPoolFacade;
  /** Five tick arrays around the current pool price.*/
  tickArrays: TickArrayFacade[];
};

export type IncreaseSpotPositionQuoteResult = {
  /** Required collateral amount */
  collateral: bigint;
  /** Required amount to borrow */
  borrow: bigint;
  /** Estimated position size in the position token. */
  estimatedAmount: bigint;
  /** Swap input amount. */
  swapInputAmount: bigint;
  /** Protocol fee in token A */
  protocolFeeA: bigint;
  /** Protocol fee in token B */
  protocolFeeB: bigint;
  /** Price impact in percents */
  priceImpact: number;
};

export function getIncreaseSpotPositionQuote(args: IncreaseSpotPositionQuoteArgs): IncreaseSpotPositionQuoteResult {
  const {
    fusionPool,
    tickArrays,
    leverage,
    protocolFeeRate,
    protocolFeeRateOnCollateral,
    increaseAmount,
    collateralToken,
    positionToken,
  } = args;

  if (leverage < 1.0) {
    throw new Error("leverage must be greater or equal than 1.0");
  }
  if (protocolFeeRate < 0 || protocolFeeRate >= HUNDRED_PERCENT) {
    throw new Error("protocolFeeRate must be greater or equal than zero and less than HUNDRED_PERCENT");
  }
  if (protocolFeeRateOnCollateral < 0 || protocolFeeRateOnCollateral >= HUNDRED_PERCENT) {
    throw new Error("protocolFeeRate must be greater or equal than zero and less than HUNDRED_PERCENT");
  }
  if (increaseAmount <= 0) {
    throw new Error("increaseAmount must be greater than zero");
  }

  let borrow: bigint;
  let collateral: bigint;
  let estimatedAmount: bigint;
  let swapInputAmount: bigint;
  let nextSqrtPrice = fusionPool.sqrtPrice;

  if (positionToken != collateralToken) {
    const price = sqrtPriceToPrice(fusionPool.sqrtPrice, 1, 1);

    borrow = BigInt(Math.ceil((Number(increaseAmount) * (leverage - 1)) / leverage));
    collateral = increaseAmount - applySwapFee(applyTunaProtocolFee(borrow, protocolFeeRate), fusionPool.feeRate);
    collateral = reverseApplySwapFee(collateral, fusionPool.feeRate, false);
    collateral = reverseApplyTunaProtocolFee(collateral, protocolFeeRateOnCollateral, false);

    swapInputAmount = increaseAmount;
    estimatedAmount = BigInt(
      Math.round(collateralToken == PoolToken.A ? Number(increaseAmount) * price : Number(increaseAmount) / price),
    );
  } else {
    const price = sqrtPriceToPrice(fusionPool.sqrtPrice, 1, 1);
    const positionToBorrowedTokenPrice = collateralToken == PoolToken.A ? price : 1.0 / price;

    const borrowInPositionToken = Math.ceil((Number(increaseAmount) * (leverage - 1)) / leverage);

    borrow = BigInt(Math.ceil(borrowInPositionToken * positionToBorrowedTokenPrice));

    const borrowInPositionTokenWithFeesApplied = applySwapFee(
      applyTunaProtocolFee(BigInt(borrowInPositionToken), protocolFeeRate),
      fusionPool.feeRate,
    );

    collateral = increaseAmount - borrowInPositionTokenWithFeesApplied;
    collateral = reverseApplyTunaProtocolFee(collateral, protocolFeeRateOnCollateral, false);

    swapInputAmount = applyTunaProtocolFee(borrow, protocolFeeRate);
    estimatedAmount = increaseAmount;
  }

  if (swapInputAmount > 0) {
    const is_token_a = positionToken == PoolToken.B;
    nextSqrtPrice = swapQuoteByInputToken(swapInputAmount, is_token_a, 0, fusionPool, tickArrays).nextSqrtPrice;
  }

  const protocolFeeA =
    (collateralToken == PoolToken.A ? collateral - applyTunaProtocolFee(collateral, protocolFeeRateOnCollateral) : 0n) +
    (positionToken == PoolToken.B ? borrow - applyTunaProtocolFee(borrow, protocolFeeRate) : 0n);

  const protocolFeeB =
    (collateralToken == PoolToken.B ? collateral - applyTunaProtocolFee(collateral, protocolFeeRateOnCollateral) : 0n) +
    (positionToken == PoolToken.A ? borrow - applyTunaProtocolFee(borrow, protocolFeeRate) : 0n);

  const oldPrice = sqrtPriceToPrice(fusionPool.sqrtPrice, 1, 1);
  const newPrice = sqrtPriceToPrice(nextSqrtPrice, 1, 1);
  const priceImpact = Math.abs(newPrice / oldPrice - 1.0) * 100;

  return {
    collateral,
    borrow,
    swapInputAmount,
    estimatedAmount,
    protocolFeeA,
    protocolFeeB,
    priceImpact,
  };
}

export type DecreaseSpotPositionQuoteArgs = {
  /** Position decrease amount in the collateralToken. */
  decreaseAmount: bigint;
  /** Collateral token. */
  collateralToken: PoolToken;
  /** Token of the position. */
  positionToken: PoolToken;
  /** Leverage: [1.0 .. 100.0] */
  leverage: number;
  /** Existing position amount in the positionToken. */
  positionAmount: bigint;
  /** Existing position debt in the token opposite to the positionToken. */
  positionDebt: bigint;
  /** Only allow reducing the existing position. */
  reduceOnly: boolean;
  /** Protocol fee rate from a market account represented as hundredths of a basis point (0.01% = 100). */
  protocolFeeRate: number;
  /** Protocol fee rate from a market account represented as hundredths of a basis point (0.01% = 100). */
  protocolFeeRateOnCollateral: number;
  /** Fusion pool */
  fusionPool: FusionPoolFacade;
  /** Five tick arrays around the current pool price.*/
  tickArrays: TickArrayFacade[];
};

export type DecreaseSpotPositionQuoteResult = {
  /** Position decrease percentage */
  decreasePercent: number;
  /** Collateral token of the new position */
  collateralToken: PoolToken;
  /** Token of the new position */
  positionToken: PoolToken;
  /** Required additional collateral amount */
  collateral: bigint;
  /** Required amount to borrow */
  borrow: bigint;
  /** Swap input amount. */
  swapInputAmount: bigint;
  /** Estimated total amount of the new position */
  estimatedAmount: bigint;
  /** Protocol fee in token A */
  protocolFeeA: bigint;
  /** Protocol fee in token B */
  protocolFeeB: bigint;
  /** Price impact in percents */
  priceImpact: number;
};

export function getDecreaseSpotPositionQuote(args: DecreaseSpotPositionQuoteArgs): DecreaseSpotPositionQuoteResult {
  const {
    fusionPool,
    tickArrays,
    leverage,
    protocolFeeRate,
    protocolFeeRateOnCollateral,
    decreaseAmount,
    collateralToken,
    positionToken,
    positionAmount,
    positionDebt,
    reduceOnly,
  } = args;

  if (leverage < 1.0) {
    throw new Error("leverage must be greater or equal than 1.0");
  }
  if (protocolFeeRate < 0 || protocolFeeRate >= HUNDRED_PERCENT) {
    throw new Error("protocolFeeRate must be greater or equal than zero and less than HUNDRED_PERCENT");
  }
  if (protocolFeeRateOnCollateral < 0 || protocolFeeRateOnCollateral >= HUNDRED_PERCENT) {
    throw new Error("protocolFeeRate must be greater or equal than zero and less than HUNDRED_PERCENT");
  }
  if (decreaseAmount <= 0) {
    throw new Error("decreaseAmount must be greater than zero");
  }

  let collateral = 0n;
  let borrow = 0n;
  let swapInputAmount = 0n;
  let estimatedAmount = 0n;
  let nextSqrtPrice = fusionPool.sqrtPrice;
  let newPositionToken = positionToken;
  let decreasePercent: number;

  // Current pool price
  const price = sqrtPriceToPrice(fusionPool.sqrtPrice, 1, 1);
  const positionToOppositeTokenPrice = positionToken == PoolToken.A ? price : 1.0 / price;

  let decreaseAmountInPositionToken =
    collateralToken == positionToken
      ? decreaseAmount
      : BigInt(Math.round(Number(decreaseAmount) / positionToOppositeTokenPrice));

  if (reduceOnly && decreaseAmountInPositionToken > positionAmount) {
    decreaseAmountInPositionToken = positionAmount;
  }

  if (decreaseAmountInPositionToken <= positionAmount) {
    decreasePercent = Math.min(
      Math.floor((Number(decreaseAmountInPositionToken) * HUNDRED_PERCENT) / Number(positionAmount)),
      HUNDRED_PERCENT,
    );

    estimatedAmount = positionAmount - decreaseAmountInPositionToken;

    if (collateralToken == positionToken) {
      if (positionDebt > 0) {
        const swapOut = BigInt(Math.floor((Number(positionDebt) * decreasePercent) / HUNDRED_PERCENT));
        const swapQuote = swapQuoteByOutputToken(swapOut, positionToken == PoolToken.B, 0, fusionPool, tickArrays);
        nextSqrtPrice = swapQuote.nextSqrtPrice;
        swapInputAmount = swapQuote.tokenEstIn;
      }
    } else {
      swapInputAmount =
        positionAmount -
        BigInt(Math.floor((Number(positionAmount) * (HUNDRED_PERCENT - decreasePercent)) / HUNDRED_PERCENT));
      const swapQuote = swapQuoteByInputToken(swapInputAmount, positionToken == PoolToken.A, 0, fusionPool, tickArrays);
      nextSqrtPrice = swapQuote.nextSqrtPrice;
    }
  } else {
    decreasePercent = HUNDRED_PERCENT;
    newPositionToken = positionToken == PoolToken.A ? PoolToken.B : PoolToken.A;
    const increaseAmount = decreaseAmountInPositionToken - positionAmount;

    if (positionToken == collateralToken) {
      // Example:
      // collateralToken: A
      // positionToken: A
      // positionDebt: B
      // newPositionToken: B
      // newBorrowedToken: A

      // B
      estimatedAmount = BigInt(Math.round(Number(increaseAmount) * positionToOppositeTokenPrice));

      // A
      borrow = BigInt(Math.round((Number(increaseAmount) * (leverage - 1)) / leverage));
      const borrowWithFeesApplied = applySwapFee(applyTunaProtocolFee(borrow, protocolFeeRate), fusionPool.feeRate);

      collateral = increaseAmount - borrowWithFeesApplied;

      // B->A
      if (positionDebt > 0) {
        const swapQuote = swapQuoteByOutputToken(positionDebt, positionToken != PoolToken.A, 0, fusionPool, tickArrays);
        swapInputAmount = swapQuote.tokenEstIn;
      }

      swapInputAmount += collateral + applyTunaProtocolFee(borrow, protocolFeeRate);
      const swapQuote = swapQuoteByInputToken(swapInputAmount, positionToken == PoolToken.A, 0, fusionPool, tickArrays);
      nextSqrtPrice = swapQuote.nextSqrtPrice;

      collateral = reverseApplyTunaProtocolFee(collateral, protocolFeeRateOnCollateral, false);
    } else {
      // Example:
      // collateralToken: B
      // positionToken: A
      // newPositionToken: B
      // newBorrowedToken: A

      // B
      estimatedAmount = BigInt(Math.round(Number(increaseAmount) * positionToOppositeTokenPrice));

      borrow = BigInt(Math.round((Number(increaseAmount) * (leverage - 1)) / leverage));
      const borrowWithFeesApplied = applySwapFee(applyTunaProtocolFee(borrow, protocolFeeRate), fusionPool.feeRate);

      collateral = increaseAmount - borrowWithFeesApplied;
      collateral = BigInt(Math.round(Number(collateral) * positionToOppositeTokenPrice));
      collateral = reverseApplyTunaProtocolFee(collateral, protocolFeeRateOnCollateral, false);

      // A->B
      swapInputAmount = positionAmount + applyTunaProtocolFee(borrow, protocolFeeRate);
      const swapQuote = swapQuoteByInputToken(swapInputAmount, positionToken == PoolToken.A, 0, fusionPool, tickArrays);
      nextSqrtPrice = swapQuote.nextSqrtPrice;
    }
  }

  const protocolFeeA =
    (collateralToken == PoolToken.A ? collateral - applyTunaProtocolFee(collateral, protocolFeeRateOnCollateral) : 0n) +
    (positionToken == PoolToken.B ? borrow - applyTunaProtocolFee(borrow, protocolFeeRate) : 0n);

  const protocolFeeB =
    (collateralToken == PoolToken.B ? collateral - applyTunaProtocolFee(collateral, protocolFeeRateOnCollateral) : 0n) +
    (positionToken == PoolToken.A ? borrow - applyTunaProtocolFee(borrow, protocolFeeRate) : 0n);

  const newPrice = sqrtPriceToPrice(nextSqrtPrice, 1, 1);
  const priceImpact = Math.abs(newPrice / price - 1.0) * 100;

  return {
    decreasePercent,
    collateralToken,
    positionToken: newPositionToken,
    collateral,
    borrow,
    swapInputAmount,
    estimatedAmount,
    protocolFeeA,
    protocolFeeB,
    priceImpact,
  };
}

export type TradableAmountArgs = {
  /** Collateral token. */
  collateralToken: PoolToken;
  /** Token of the new position. */
  newPositionToken: PoolToken;
  /** Token of the existing position. Should be set to newPositionToken if positionAmount is zero. */
  positionToken: PoolToken;
  /** Existing position amount in the positionToken. */
  positionAmount: bigint;
  /** Existing position debt in the token opposite to the positionToken. */
  positionDebt: bigint;
  /** Only allow reducing the existing position. */
  reduceOnly: boolean;
  /** Leverage: [1.0 .. 100.0] */
  leverage: number;
  /** Available wallet balance in the collateralToken. */
  availableBalance: bigint;
  /** Protocol fee rate from a market account represented as hundredths of a basis point (0.01% = 100). */
  protocolFeeRate: number;
  /** Protocol fee rate from a market account represented as hundredths of a basis point (0.01% = 100). */
  protocolFeeRateOnCollateral: number;
  /** Fusion pool */
  fusionPool: FusionPoolFacade;
  /** Five tick arrays around the current pool price.*/
  tickArrays: TickArrayFacade[];
};

/**
 * Returns the maximum allowed tradable amount in the collateralToken.
 */
export function getTradableAmount(args: TradableAmountArgs) {
  const {
    collateralToken,
    newPositionToken,
    positionToken,
    positionAmount,
    positionDebt,
    reduceOnly,
    fusionPool,
    tickArrays,
    leverage,
    availableBalance,
    protocolFeeRate,
    protocolFeeRateOnCollateral,
  } = args;

  if (leverage < 1.0) {
    throw new Error("leverage must be greater or equal than 1.0");
  }

  if (protocolFeeRateOnCollateral < 0 || protocolFeeRateOnCollateral >= HUNDRED_PERCENT) {
    throw new Error("protocolFeeRate must be greater or equal than zero and less than HUNDRED_PERCENT");
  }

  if (protocolFeeRate < 0 || protocolFeeRate >= HUNDRED_PERCENT) {
    throw new Error("protocolFeeRate must be greater or equal than zero and less than HUNDRED_PERCENT");
  }

  if (positionAmount == 0n && newPositionToken != positionToken) {
    throw new Error("positionToken must be set to newPositionToken if positionAmount is zero");
  }

  let availableToTrade = 0n;

  // T = C⋅Fc⋅Fs + B⋅Fb⋅Fs, where: Fc/Fb/Fs - collateral/borrow/swap fee multiplier
  // B = T⋅(L - 1) / L
  // => T = C⋅Fc⋅Fs / (1 - Fb⋅Fs⋅(L - 1) / L)
  const addLeverage = (collateral: bigint): bigint => {
    collateral = applyTunaProtocolFee(collateral, protocolFeeRateOnCollateral);
    if (collateralToken != newPositionToken) {
      collateral = applySwapFee(collateral, fusionPool.feeRate);
    }

    const feeMultiplier = (1 - protocolFeeRate / HUNDRED_PERCENT) * (1 - fusionPool.feeRate / 1_000_000);
    const total = Math.floor(Number(collateral) / (1 - (feeMultiplier * (leverage - 1)) / leverage));

    return BigInt(total);
  };

  if (newPositionToken == positionToken) {
    availableToTrade = addLeverage(availableBalance);
  } else {
    const price = sqrtPriceToPrice(fusionPool.sqrtPrice, 1, 1);
    const positionToOppositeTokenPrice = positionToken == PoolToken.A ? price : 1.0 / price;

    if (reduceOnly) {
      if (collateralToken == positionToken) {
        availableToTrade = positionAmount;
      } else {
        availableToTrade = BigInt(Math.round(Number(positionAmount) * positionToOppositeTokenPrice));
      }
    } else {
      const positionAmountInCollateralToken =
        collateralToken == positionToken
          ? positionAmount
          : BigInt(Math.round(Number(positionAmount) * positionToOppositeTokenPrice));

      let positionCollateral =
        collateralToken == positionToken
          ? positionAmount -
            (positionDebt > 0n
              ? swapQuoteByOutputToken(positionDebt, positionToken == PoolToken.B, 0, fusionPool, tickArrays).tokenEstIn
              : 0n)
          : positionAmount > 0n
            ? swapQuoteByInputToken(positionAmount, positionToken == PoolToken.A, 0, fusionPool, tickArrays)
                .tokenEstOut - positionDebt
            : 0n;
      if (positionCollateral < 0n) positionCollateral = 0n;

      // Add the refunded collateral to the available balance
      availableToTrade = positionAmountInCollateralToken + addLeverage(availableBalance + positionCollateral);
    }
  }

  return availableToTrade;
}

export function getLiquidationPrice(
  positionToken: PoolToken,
  amount: number,
  debt: number,
  liquidationThreshold: number,
): Number {
  if (debt < 0) {
    throw new Error("debt must be greater or equal than zero");
  }

  if (amount < 0) {
    throw new Error("position amount must be greater or equal than zero");
  }

  if (liquidationThreshold <= 0 || liquidationThreshold >= 1.0) {
    throw new Error("liquidationThreshold must be greater than zero and less than one");
  }

  if (debt == 0 || amount == 0) return 0;

  if (positionToken == PoolToken.A) {
    return debt / (amount * liquidationThreshold);
  } else {
    return (amount * liquidationThreshold) / debt;
  }
}

function applyTunaProtocolFee(amount: bigint, protocolFeeRate: number, roundUp = false): bigint {
  return mulDiv(amount, BigInt(HUNDRED_PERCENT - protocolFeeRate), BigInt(HUNDRED_PERCENT), roundUp);
}

function reverseApplyTunaProtocolFee(amount: bigint, protocolFeeRate: number, roundUp = true): bigint {
  return mulDiv(amount, BigInt(HUNDRED_PERCENT), BigInt(HUNDRED_PERCENT - protocolFeeRate), roundUp);
}

function applySwapFee(amount: bigint, feeRate: number, roundUp = false): bigint {
  return mulDiv(amount, BigInt(1_000_000 - feeRate), 1_000_000n, roundUp);
}

function reverseApplySwapFee(amount: bigint, feeRate: number, roundUp = true): bigint {
  return mulDiv(amount, 1_000_000n, BigInt(1_000_000 - feeRate), roundUp);
}
