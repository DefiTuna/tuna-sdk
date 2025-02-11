import { z } from "zod";

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
  depositedFunds: z.coerce.bigint(),
  borrowedFunds: z.coerce.bigint(),
  interestRate: z.coerce.bigint(),
  supplyLimit: z.coerce.bigint(),
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
