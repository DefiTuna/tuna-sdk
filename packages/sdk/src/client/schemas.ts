import { z } from "zod";

const amountWithUsd = z.object({
  amount: z.coerce.bigint(),
  usd: z.number(),
});

export const PoolProvider = {
  ORCA: "orca",
} as const;
export const TunaPositionState = {
  OPEN: "open",
  LIQUIDATED: "liquidated",
  CLOSED_BY_LIMIT_ORDER: "closed_by_limit_order",
  CLOSED: "closed",
} as const;

export const PoolProviderSchema = z.enum([PoolProvider.ORCA, ...Object.values(PoolProvider)]);
export const TunaPositionStateSchema = z.enum([TunaPositionState.OPEN, ...Object.values(TunaPositionState)]);

export const Mint = z.object({
  symbol: z.string(),
  mint: z.string(),
  logo: z.string(),
  decimals: z.number(),
});

export const Market = z.object({
  address: z.string(),
  addressLookupTable: z.string(),
  poolAddress: z.string(),
  poolFeeRate: z.number(),
  provider: PoolProviderSchema,
  maxLeverage: z.number(),
  protocolFee: z.number(),
  liquidationFee: z.number(),
  liquidationThreshold: z.number(),
  limitOrderExecutionFee: z.number(),
  disabled: z.boolean(),
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
  borrowedShares: z.coerce.bigint(),
  supplyApy: z.number(),
  borrowApy: z.number(),
  utilization: z.number(),
  pythOracleFeedId: z.string(),
});

export const Pool = z.object({
  address: z.string(),
  provider: PoolProviderSchema,
  tokenAMint: z.string(),
  tokenBMint: z.string(),
  tokenAVault: z.string(),
  tokenBVault: z.string(),
  tvlUsdc: z.coerce.number(),
  tickSpacing: z.number(),
  feeRate: z.number(),
  protocolFeeRate: z.number(),
  liquidity: z.coerce.bigint(),
  sqrtPrice: z.coerce.bigint(),
  tickCurrentIndex: z.number(),
  stats: z.object({
    "24h": z.object({
      volume: z.coerce.number(),
      fees: z.coerce.number(),
    }),
    "7d": z.object({
      volume: z.coerce.number(),
      fees: z.coerce.number(),
    }),
    "30d": z.object({
      volume: z.coerce.number(),
      fees: z.coerce.number(),
    }),
  }),
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
  version: z.number(),
  state: TunaPositionStateSchema,
  positionMint: z.string(),
  liquidity: z.coerce.bigint(),
  tickLowerIndex: z.number(),
  tickUpperIndex: z.number(),
  tickEntryIndex: z.number(),
  tickStopLossIndex: z.number(),
  tickTakeProfitIndex: z.number(),
  swapToTokenOnLimitOrder: z.number(),
  flags: z.number(),
  pool: z.string(),
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
  pnl: z.object({
    usd: z.number(),
    bps: z.number(),
  }),
});
