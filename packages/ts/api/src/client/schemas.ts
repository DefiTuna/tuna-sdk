import { z } from "zod";

const amountWithoutUsd = z.object({
  amount: z.coerce.bigint(),
});

const amountWithUsd = z.object({
  amount: z.coerce.bigint(),
  usd: z.number(),
});

const tokensPnl = z.object({
  amount: z.coerce.bigint(),
  bps: z.number(),
});

const usdPnl = z.object({
  amount: z.number(),
  bps: z.number(),
});

export const NotificationEntity = {
  POOL_SWAP: "pool_swap",
  POOL_PRICE: "pool_price",
  ORDER_BOOK: "order_book",
} as const;
export const NotificationAction = {
  CREATE: "create",
  UPDATE: "update",
} as const;
export const PoolProvider = {
  ORCA: "orca",
  FUSION: "fusion",
} as const;
export const TunaPositionState = {
  OPEN: "open",
  LIQUIDATED: "liquidated",
  CLOSED_BY_LIMIT_ORDER: "closed_by_limit_order",
  CLOSED: "closed",
} as const;
export const LimitOrderState = {
  OPEN: "open",
  PARTIALLY_FILLED: "partially_filled",
  FILLED: "filled",
  COMPLETE: "complete",
  CANCELLED: "cancelled",
} as const;

export const NotificationEntitySchema = z.enum([NotificationEntity.POOL_SWAP, ...Object.values(NotificationEntity)]);
export const NotificationActionSchema = z.enum([NotificationAction.CREATE, ...Object.values(NotificationAction)]);
export const PoolProviderSchema = z.enum([PoolProvider.ORCA, ...Object.values(PoolProvider)]);
export const TunaPositionStateSchema = z.enum([TunaPositionState.OPEN, ...Object.values(TunaPositionState)]);
export const LimitOrderStateSchema = z.enum([LimitOrderState.OPEN, ...Object.values(LimitOrderState)]);

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
  protocolFeeOnCollateral: z.number(),
  liquidationFee: z.number(),
  liquidationThreshold: z.number(),
  limitOrderExecutionFee: z.number(),
  borrowedFundsA: amountWithUsd,
  borrowedFundsB: amountWithUsd,
  availableBorrowA: amountWithUsd,
  availableBorrowB: amountWithUsd,
  borrowLimitA: amountWithUsd,
  borrowLimitB: amountWithUsd,
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
  depositedShares: z.coerce.bigint(),
  supplyApy: z.number(),
  borrowApy: z.number(),
  utilization: z.number(),
  pythOracleFeedId: z.string(),
  pythOraclePriceUpdate: z.string(),
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
      rewards: z.coerce.number(),
      yieldOverTvl: z.coerce.number(),
    }),
    "7d": z.object({
      volume: z.coerce.number(),
      fees: z.coerce.number(),
      rewards: z.coerce.number(),
      yieldOverTvl: z.coerce.number(),
    }),
    "30d": z.object({
      volume: z.coerce.number(),
      fees: z.coerce.number(),
      rewards: z.coerce.number(),
      yieldOverTvl: z.coerce.number(),
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
  shares: z.coerce.bigint(),
  funds: amountWithUsd,
  earned: amountWithUsd,
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
  depositedCollateralA: amountWithoutUsd,
  depositedCollateralB: amountWithoutUsd,
  depositedCollateralUsd: z.object({
    amount: z.number(),
  }),
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
  pnlA: tokensPnl,
  pnlB: tokensPnl,
  pnlUsd: usdPnl,
  openedAt: z.coerce.date(),
  updatedAtSlot: z.coerce.bigint(),
});

export const PoolSwap = z.object({
  id: z.string(),
  amountIn: z.coerce.bigint(),
  amountOut: z.coerce.bigint(),
  aToB: z.boolean(),
  pool: z.string(),
  time: z.coerce.date(),
});

export const OrderBookEntry = z.object({
  concentratedAmount: z.coerce.bigint(),
  concentratedAmountQuote: z.coerce.bigint(),
  concentratedTotal: z.coerce.bigint(),
  concentratedTotalQuote: z.coerce.bigint(),
  limitAmount: z.coerce.bigint(),
  limitAmountQuote: z.coerce.bigint(),
  limitTotal: z.coerce.bigint(),
  limitTotalQuote: z.coerce.bigint(),
  price: z.number(),
  askSide: z.boolean(),
});

export const PoolPriceUpdate = z.object({
  pool: z.string(),
  price: z.number(),
  sqrtPrice: z.coerce.bigint(),
  time: z.coerce.date(),
});

export const OrderBook = z.object({
  entries: OrderBookEntry.array(),
  poolPrice: z.number(),
});

export const LimitOrder = z.object({
  address: z.string(),
  mint: z.string(),
  pool: z.string(),
  state: LimitOrderStateSchema,
  aToB: z.boolean(),
  tickIndex: z.number(),
  fillRatio: z.number(),
  openTxSignature: z.string(),
  closeTxSignature: z.string().nullable(),
  amount: amountWithUsd,
  openedAt: z.coerce.date(),
  closedAt: z.coerce.date().nullable(),
});

export const PoolPriceCandle = z.object({
  time: z.number(),
  open: z.number(),
  close: z.number(),
  high: z.number(),
  low: z.number(),
});

const createNotificationSchema = <DataType extends z.ZodTypeAny, MetaType extends z.ZodTypeAny>(
  dataSchema: DataType,
  metaSchema?: MetaType,
) =>
  z.object({
    entity: NotificationEntitySchema,
    action: NotificationActionSchema,
    data: dataSchema,
    id: z.string(),
    authority: z.nullable(z.string()),
    ...(metaSchema ? { meta: metaSchema } : { meta: z.undefined().nullable() }),
  });

export const OrderBookNotificationMeta = z.object({
  pool: z.string(),
  priceStep: z.number(),
  inverted: z.boolean(),
});
export const PoolSwapNotification = createNotificationSchema(PoolSwap);
export const PoolPriceUpdateNotification = createNotificationSchema(PoolPriceUpdate);
export const OrderBookNotification = createNotificationSchema(OrderBook, OrderBookNotificationMeta);
