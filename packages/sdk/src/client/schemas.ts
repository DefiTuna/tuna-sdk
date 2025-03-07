import { z } from "zod";

const amountWithUsd = z.object({
  amount: z.coerce.bigint(),
  usd: z.number(),
});

export const PoolProvider = z.enum(["orca"]);

export const Mint = z.object({
  symbol: z.string(),
  mint: z.string(),
  logo: z.string(),
  decimals: z.number(),
});

export const Market = z.object({
  address: z.string(),
  poolAddress: z.string(),
  feeRate: z.number(),
  provider: PoolProvider,
  maxLeverage: z.coerce.bigint(),
  protocolFee: z.coerce.bigint(),
  liquidationFee: z.coerce.bigint(),
  liquidationThreshold: z.coerce.bigint(),
  limitOrderExecutionFee: z.coerce.bigint(),
});

export const TokenOraclePrice = z.object({
  mint: z.string(),
  price: z.coerce.bigint(),
  decimals: z.number(),
  time: z.coerce.date(),
});

export const Vault = z.object({
  address: z.string(),
  mint: z.string(),
  depositedFunds: amountWithUsd,
  borrowedFunds: amountWithUsd,
  supplyLimit: amountWithUsd,
  supplyApy: z.number(),
  borrowApy: z.number(),
});

export const Pool = z.object({
  address: z.string(),
  provider: PoolProvider,
  tokenAMint: z.string(),
  tokenBMint: z.string(),
  tvlUsdc: z.coerce.number(),
  tickSpacing: z.number(),
  feeRate: z.number(),
  protocolFeeRate: z.number(),
  liquidity: z.coerce.bigint(),
  sqrtPrice: z.coerce.bigint(),
  tickCurrentIndex: z.number(),
  stats: z.record(
    z.object({
      volume: z.coerce.number(),
      fees: z.coerce.number(),
    }),
  ),
});

export const Tick = z.object({
  index: z.number(),
  liquidity: z.coerce.bigint(),
});

export const PoolTicks = z.object({
  tickSpacing: z.number(),
  ticks: Tick.array(),
});

export const LendingPosition = z.object({
  address: z.string(),
  authority: z.string(),
  mint: z.string(),
  vault: z.string(),
  totalFunds: amountWithUsd,
  earnedFunds: amountWithUsd,
});

export const TunaPosition = z.object({
  address: z.string(),
  authority: z.string(),
  pool: z.string(),
  version: z.number(),
  state: z.string(),
  positionMint: z.string(),
  liquidity: z.coerce.bigint(),
  tickLowerIndex: z.number(),
  tickUpperIndex: z.number(),
  tickEntryIndex: z.number(),
  tickStopLossIndex: z.number(),
  tickTakeProfitIndex: z.number(),
  autoCompound: z.boolean(),
  swapToTokenOnLimitOrder: z.number(),
  poolSqrtPrice: z.coerce.bigint(),
  loanFundsA: amountWithUsd,
  loanFundsB: amountWithUsd,
  currentLoanA: amountWithUsd,
  currentLoanB: amountWithUsd,
  leftoversA: amountWithUsd,
  leftoversB: amountWithUsd,
  yieldA: amountWithUsd,
  yieldB: amountWithUsd,
  compoundedYieldA: amountWithUsd,
  compoundedYieldB: amountWithUsd,
  totalA: amountWithUsd,
  totalB: amountWithUsd,
  pnlUsd: z.number(),
});
