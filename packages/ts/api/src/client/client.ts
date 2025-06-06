import camelcaseKeys from "camelcase-keys";
import { z } from "zod";

import * as schemas from "./schemas";
import { NotificationAction, NotificationEntity, PoolProvider, TunaPositionState } from "./schemas";

/* Export schemas for raw data handling */
export { schemas };

/* Enums */
export { PoolProvider, TunaPositionState, NotificationAction, NotificationEntity };
export type PoolProviderType = z.infer<typeof schemas.PoolProviderSchema>;
export type TunaPositionStateType = z.infer<typeof schemas.TunaPositionStateSchema>;
export type LimitOrderStateType = z.infer<typeof schemas.LimitOrderStateSchema>;

/* Entity types */
export type Mint = z.infer<typeof schemas.Mint>;
export type Market = z.infer<typeof schemas.Market>;
export type TokenOraclePrice = z.infer<typeof schemas.TokenOraclePrice>;
export type Vault = z.infer<typeof schemas.Vault>;
export type Pool = z.infer<typeof schemas.Pool>;
export type Tick = z.infer<typeof schemas.Tick>;
export type PoolTicks = z.infer<typeof schemas.PoolTicks>;
export type PoolSwap = z.infer<typeof schemas.PoolSwap>;
export type OrderBookEntry = z.infer<typeof schemas.OrderBookEntry>;
export type OrderBook = z.infer<typeof schemas.OrderBook>;
export type LendingPosition = z.infer<typeof schemas.LendingPosition>;
export type TunaPosition = z.infer<typeof schemas.TunaPosition>;
export type LimitOrder = z.infer<typeof schemas.LimitOrder>;
export type PoolPriceCandle = z.infer<typeof schemas.PoolPriceCandle>;
export type PoolPriceUpdate = z.infer<typeof schemas.PoolPriceUpdate>;

/* Client configuration */
export type DurationInMs = number;

const DEFAULT_TIMEOUT: DurationInMs = 5000;
const DEFAULT_HTTP_RETRIES = 3;

export enum ProviderFilter {
  ORCA = "orca",
  FUSION = "fusion",
  ALL = "all",
}

export type GetPoolPriceCandlesOptions = {
  from: Date;
  to: Date;
  candles: number;
  /* Interval string like 5s, 5m, 1d */
  interval: string;
};

export type TunaApiClientConfig = {
  /** Backend API URL */
  baseURL: string;
  /** Timeout of each request (for all of retries). Default: 5000ms */
  timeout?: DurationInMs;
  /**
   * Number of times a HTTP request will be retried before the API returns a failure. Default: 3.
   *
   * The connection uses exponential back-off for the delay between retries. However,
   * it will timeout regardless of the retries at the configured `timeout` time.
   */
  httpRetries?: number;
  /**
   * Optional headers to be included in every request.
   */
  headers?: HeadersInit;
};

/* API Client */
export class TunaApiClient {
  private _baseURL: string;
  get baseURL(): string {
    return this._baseURL;
  }

  private _timeout: DurationInMs;
  get timeout(): DurationInMs {
    return this._timeout;
  }

  private _httpRetries: number;
  get httpRetries(): number {
    return this._httpRetries;
  }

  private _headers: HeadersInit;
  get headers(): HeadersInit {
    return this._headers;
  }

  constructor(baseURL: string, config?: Partial<Omit<TunaApiClientConfig, "baseURL">>) {
    this._baseURL = baseURL;
    this._timeout = config?.timeout ?? DEFAULT_TIMEOUT;
    this._httpRetries = config?.httpRetries ?? DEFAULT_HTTP_RETRIES;
    this._headers = config?.headers ?? {};
  }

  setConfig(config: Partial<TunaApiClientConfig>) {
    if (config.baseURL) {
      this._baseURL = config.baseURL;
    }

    this._timeout = config?.timeout ?? DEFAULT_TIMEOUT;
    this._httpRetries = config?.httpRetries ?? DEFAULT_HTTP_RETRIES;
    this._headers = config?.headers ?? {};
  }

  private async httpRequest<ResponseData>(
    url: string,
    schema: z.ZodSchema<ResponseData>,
    options?: RequestInit,
    retries = this.httpRetries,
    backoff = 100 + Math.floor(Math.random() * 100), // Adding randomness to the initial backoff to avoid "thundering herd" scenario where a lot of clients that get kicked off all at the same time (say some script or something) and fail to connect all retry at exactly the same time too
  ): Promise<ResponseData> {
    try {
      const controller = new AbortController();

      const abort = setTimeout(() => {
        controller.abort();
      }, this.timeout);
      const signal: AbortSignal = options?.signal || controller.signal;

      const response = await fetch(url, {
        ...options,
        signal,
        headers: { ...this.headers, ...options?.headers },
      });
      clearTimeout(abort);
      if (!response.ok) {
        const errorBody = await response.json();
        throw errorBody;
      }
      const data = await response.json();
      const transformed = camelcaseKeys(data, { deep: true, exclude: ["24h", "7d", "30d"] });
      return schema.parse(transformed.data);
    } catch (error) {
      if (retries > 0 && !(error instanceof Error && error.name === "AbortError")) {
        // Wait for a backoff period before retrying
        await new Promise(resolve => setTimeout(resolve, backoff));
        return this.httpRequest(url, schema, options, retries - 1, backoff * 2); // Exponential backoff
      }
      throw error;
    }
  }

  /* Endpoints */
  async getMints(): Promise<Mint[]> {
    const url = this.buildURL("mints");
    return await this.httpRequest(url.toString(), schemas.Mint.array());
  }

  async getMint(mintAddress: string): Promise<Mint> {
    const url = this.buildURL(`mints/${mintAddress}`);
    return await this.httpRequest(url.toString(), schemas.Mint);
  }

  async getMarkets(): Promise<Market[]> {
    const url = this.buildURL("markets");
    return await this.httpRequest(url.toString(), schemas.Market.array());
  }

  async getMarket(marketAddress: string): Promise<Market> {
    const url = this.buildURL(`markets/${marketAddress}`);
    return await this.httpRequest(url.toString(), schemas.Market);
  }

  async getOraclePrices(): Promise<TokenOraclePrice[]> {
    const url = this.buildURL("oracle-prices");
    return await this.httpRequest(url.toString(), schemas.TokenOraclePrice.array());
  }

  async getOraclePrice(mintAddress: string): Promise<TokenOraclePrice> {
    const url = this.buildURL(`oracle-prices/${mintAddress}`);
    return await this.httpRequest(url.toString(), schemas.TokenOraclePrice);
  }

  async getVaults(): Promise<Vault[]> {
    const url = this.buildURL("vaults");
    return await this.httpRequest(url.toString(), schemas.Vault.array());
  }

  async getVault(vaultAddress): Promise<Vault> {
    const url = this.buildURL(`vaults/${vaultAddress}`);
    return await this.httpRequest(url.toString(), schemas.Vault);
  }

  async getPools(providerFilter?: ProviderFilter): Promise<Pool[]> {
    const url = this.buildURL("pools");
    if (providerFilter && providerFilter !== ProviderFilter.ALL) {
      this.appendUrlSearchParams(url, { provider: providerFilter });
    }

    return await this.httpRequest(url.toString(), schemas.Pool.array());
  }

  async getPool(address: string): Promise<Pool> {
    const url = this.buildURL(`pools/${address}`);
    return await this.httpRequest(url.toString(), schemas.Pool);
  }

  async getPoolTicks(poolAddress: string): Promise<PoolTicks> {
    const url = this.buildURL(`pools/${poolAddress}/ticks`);
    return await this.httpRequest(url.toString(), schemas.PoolTicks);
  }

  async getPoolSwaps(poolAddress: string): Promise<PoolSwap[]> {
    const url = this.buildURL(`pools/${poolAddress}/swaps`);
    return await this.httpRequest(url.toString(), schemas.PoolSwap.array());
  }

  async getPoolOrderBook(poolAddress: string, priceStep: number, inverted: boolean): Promise<OrderBook> {
    const url = this.buildURL(`pools/${poolAddress}/order-book`);
    this.appendUrlSearchParams(url, { price_step: priceStep.toString() });
    if (inverted) {
      this.appendUrlSearchParams(url, { inverted: inverted.toString() });
    }
    return await this.httpRequest(url.toString(), schemas.OrderBook);
  }

  async getPoolPriceCandles(poolAddress: string, options: GetPoolPriceCandlesOptions): Promise<PoolPriceCandle[]> {
    const { from, to, interval, candles } = options;
    const url = this.buildURL(`pools/${poolAddress}/candles`);

    this.appendUrlSearchParams(url, {
      from: from.toISOString(),
      to: to.toISOString(),
      candles: candles.toString(),
      interval,
    });
    return await this.httpRequest(url.toString(), schemas.PoolPriceCandle.array());
  }

  async getUserLendingPositions(userAddress: string): Promise<LendingPosition[]> {
    const url = this.buildURL(`users/${userAddress}/lending-positions`);
    return await this.httpRequest(url.toString(), schemas.LendingPosition.array());
  }

  async getUserLendingPositionByAddress(userAddress: string, lendingPositionAddress: string): Promise<LendingPosition> {
    const url = this.buildURL(`users/${userAddress}/lending-positions/${lendingPositionAddress}`);
    return await this.httpRequest(url.toString(), schemas.LendingPosition);
  }

  async getUserTunaPositions(userAddress: string): Promise<TunaPosition[]> {
    const url = this.buildURL(`users/${userAddress}/tuna-positions`);
    return await this.httpRequest(url.toString(), schemas.TunaPosition.array());
  }

  async getUserTunaPositionByAddress(userAddress: string, tunaPositionAddress: string): Promise<TunaPosition> {
    const url = this.buildURL(`users/${userAddress}/tuna-positions/${tunaPositionAddress}`);
    return await this.httpRequest(url.toString(), schemas.TunaPosition);
  }

  async getUserLimitOrders(userAddress: string, poolFilter?: string): Promise<LimitOrder[]> {
    const url = this.buildURL(`users/${userAddress}/limit-orders`);
    if (poolFilter) {
      this.appendUrlSearchParams(url, { pool: poolFilter });
    }
    return await this.httpRequest(url.toString(), schemas.LimitOrder.array());
  }

  async getUserLimitOrderByAddress(userAddress: string, limitOrderAddress: string): Promise<LimitOrder> {
    const url = this.buildURL(`users/${userAddress}/limit-orders/${limitOrderAddress}`);
    return await this.httpRequest(url.toString(), schemas.LimitOrder);
  }

  async getPoolUpdatesStream(poolAddress: string, priceStep?: number, inverted?: boolean): Promise<EventSource> {
    const url = this.buildURL(`stream`);
    this.appendUrlSearchParams(url, { pool: poolAddress });
    if (priceStep) {
      this.appendUrlSearchParams(url, { price_step: priceStep.toString() });
    }
    if (inverted) {
      this.appendUrlSearchParams(url, { inverted: inverted.toString() });
    }

    return new EventSource(url.toString());
  }

  /* Utility functions */
  private buildURL(endpoint: string) {
    return new URL(
      `./v1/${endpoint}`,
      // We ensure the `baseURL` ends with a `/` so that URL doesn't resolve the
      // path relative to the parent.
      `${this.baseURL}${this.baseURL.endsWith("/") ? "" : "/"}`,
    );
  }

  private appendUrlSearchParams(url: URL, params: Record<string, string | boolean>) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.append(key, String(value));
      }
    });
  }
}
