import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import { TunaApiClient } from "./client";
import * as testUtils from "./testUtils";

const client = new TunaApiClient(process.env.API_BASE_URL!);

describe("Mints", async () => {
  const rpcVaults = await testUtils.getVaults();
  const mints = await client.getMints();

  it("Length matches rpc", () => {
    expect(mints.length).toBe(rpcVaults.length);
  });
  it("Match RPC vaults mints", () => {
    expect(rpcVaults.map(rpcVault => rpcVault.data.mint).sort()).toEqual(mints.map(mint => mint.mint).sort());
  });
  it("Have valid decimals", () => {
    expect(mints.every(mint => mint.decimals > 0)).toBe(true);
  });
});

describe("Single Mint", async () => {
  const rpcVaults = await testUtils.getVaults();
  const sampleMintAddress = rpcVaults[0].data.mint;
  const unsavedMintAddress = "FeR8VBqNRSUD5NtXAj2n3j1dAHkZHfyDktKuLXD4pump";
  const mint = await client.getMint(sampleMintAddress);

  it("Returns mint data", () => {
    expect(mint.mint).toBe(sampleMintAddress);
    expect(mint.decimals).toBeGreaterThan(0);
  });

  it("Returns 404 for unsaved mint", async () => {
    await expect(() => client.getMint(unsavedMintAddress)).rejects.toThrowError(
      expect.objectContaining({
        code: 40401,
      }),
    );
  });
  it("Returns 400 for invalid mint", async () => {
    await expect(() => client.getMint("123")).rejects.toThrowError(
      expect.objectContaining({
        code: 40001,
      }),
    );
  });
});

describe("Markets", async () => {
  const rpcMarkets = await testUtils.getMarkets();
  const markets = await client.getMarkets();

  it("Length matches rpc", () => {
    expect(markets.length).toBe(rpcMarkets.length);
  });
  it("Match RPC markets addresses", () => {
    expect(rpcMarkets.map(rpcMarket => rpcMarket.address).sort()).toEqual(markets.map(market => market.address).sort());
  });
  it("Match RPC markets pool addresses", () => {
    expect(rpcMarkets.map(rpcMarket => rpcMarket.data.pool).sort()).toEqual(
      markets.map(market => market.poolAddress).sort(),
    );
  });
  it("Have valid fee rate", () => {
    expect(markets.every(market => market.feeRate > 0)).toBe(true);
  });
});

describe("Single Market", async () => {
  const rpcMarkets = await testUtils.getMarkets();
  const sampleMarketAddress = rpcMarkets[0].address;
  const unsavedMarketAddress = "FeR8VBqNRSUD5NtXAj2n3j1dAHkZHfyDktKuLXD4pump";
  const market = await client.getMarket(sampleMarketAddress);

  it("Returns market data", () => {
    expect(market.address).toBe(sampleMarketAddress);
    expect(market.feeRate).toBeGreaterThan(0);
  });

  it("Returns 404 for unsaved market", async () => {
    await expect(() => client.getMarket(unsavedMarketAddress)).rejects.toThrowError(
      expect.objectContaining({
        code: 40401,
      }),
    );
  });
  it("Returns 400 for invalid market", async () => {
    await expect(() => client.getMarket("123")).rejects.toThrowError(
      expect.objectContaining({
        code: 40001,
      }),
    );
  });
});

describe("Oracle Prices", async () => {
  const rpcVaults = await testUtils.getVaults();
  const oraclePrices = await client.getOraclePrices();

  it("Length matches RPC vaults", () => {
    expect(oraclePrices.length).toBe(rpcVaults.length);
  });
  it("Match RPC vaults mints", () => {
    expect(rpcVaults.map(rpcVault => rpcVault.data.mint).sort()).toEqual(oraclePrices.map(price => price.mint).sort());
  });
  it("Returns recent prices", () => {
    const price = oraclePrices[0];

    expect(price).toBeDefined();

    const priceTimestampSeconds = price.time.getTime() / 1000;
    const nowTimestampSeconds = Date.now() / 1000;

    // Not older that 10 seconds
    expect(priceTimestampSeconds).closeTo(nowTimestampSeconds, 10);
  });
  it("Returns correct price for USDT", () => {
    const price = oraclePrices.find(price => price.mint === "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB");

    expect(price).toBeDefined();

    const value = new Decimal(price!.price.toString()).div(10 ** price!.decimals).toNumber();

    expect(value).closeTo(1, 0.05);
  });
  it("Returns correct price for USDC", () => {
    const price = oraclePrices.find(price => price.mint === "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

    expect(price).toBeDefined();

    const value = new Decimal(price!.price.toString()).div(10 ** price!.decimals).toNumber();

    expect(value).closeTo(1, 0.05);
  });
});

describe("Single Oracle Price", async () => {
  const rpcVaults = await testUtils.getVaults();
  const sampleMintAddress = rpcVaults[0].data.mint;
  const unsavedMintAddress = "FeR8VBqNRSUD5NtXAj2n3j1dAHkZHfyDktKuLXD4pump";
  const oraclePrice = await client.getOraclePrice(sampleMintAddress);

  it("Returns oracle price", () => {
    expect(oraclePrice.mint).toBe(sampleMintAddress);
    expect(oraclePrice.price).toBeGreaterThan(0);
  });
  it("Returns recent price", () => {
    const priceTimestampSeconds = oraclePrice.time.getTime() / 1000;
    const nowTimestampSeconds = Date.now() / 1000;

    // Not older that 10 seconds
    expect(priceTimestampSeconds).closeTo(nowTimestampSeconds, 10);
  });
  it("Returns 404 for unsaved mint", async () => {
    await expect(() => client.getOraclePrice(unsavedMintAddress)).rejects.toThrowError(
      expect.objectContaining({
        code: 40401,
      }),
    );
  });
  it("Returns 400 for invalid mint", async () => {
    await expect(() => client.getOraclePrice("123")).rejects.toThrowError(
      expect.objectContaining({
        code: 40001,
      }),
    );
  });
});

describe("Vaults", async () => {
  const rpcVaults = await testUtils.getVaults();
  const vaults = await client.getVaults();

  it("Length matches rpc", () => {
    expect(rpcVaults.length).toBe(vaults.length);
  });
  it("Match RPC vaults addresses", () => {
    expect(rpcVaults.map(rpcVault => rpcVault.address).sort()).toEqual(vaults.map(vault => vault.address).sort());
  });
  it("Match RPC vaults supply limits", () => {
    expect(
      rpcVaults
        .map(rpcVault => [rpcVault.address, rpcVault.data.supplyLimit])
        .sort(([a], [b]) => a.toString().localeCompare(b.toString())),
    ).toEqual(
      vaults
        .map(vault => [vault.address, vault.supplyLimit])
        .sort(([a], [b]) => a.toString().localeCompare(b.toString())),
    );
  });
});

describe("Single Vault", async () => {
  const rpcVaults = await testUtils.getVaults();
  const sampleVault = rpcVaults[0];
  const unsavedVaultAddress = "FeR8VBqNRSUD5NtXAj2n3j1dAHkZHfyDktKuLXD4pump";
  const vault = await client.getVault(sampleVault.address);

  it("Returns vault data", () => {
    expect(vault.address).toBe(sampleVault.address);
    expect(vault.mint).toBe(sampleVault.data.mint);
  });

  it("Returns 404 for unsaved vault", async () => {
    await expect(() => client.getMarket(unsavedVaultAddress)).rejects.toThrowError(
      expect.objectContaining({
        code: 40401,
      }),
    );
  });
  it("Returns 400 for invalid vault", async () => {
    await expect(() => client.getMarket("123")).rejects.toThrowError(
      expect.objectContaining({
        code: 40001,
      }),
    );
  });
});

describe("Pools", async () => {
  const rpcMarkets = await testUtils.getMarkets();
  const pools = await client.getPools();

  it("Length matches RPC markets", () => {
    expect(rpcMarkets.length).toBe(pools.length);
  });
  it("Match RPC markets pools addresses", () => {
    expect(rpcMarkets.map(rpcMarket => rpcMarket.data.pool).sort()).toEqual(pools.map(pool => pool.address).sort());
  });
  it("Have tvl stats", () => {
    expect(pools.every(pool => pool.tvlUsdc > 0)).toBe(true);
  });
  it("Have monthly stats", () => {
    expect(pools.every(pool => !!pool.stats["30D"])).toBe(true);
  });
});

describe("Single Pool", async () => {
  const rpcMarkets = await testUtils.getMarkets();
  const samplePoolAddress = rpcMarkets[0].data.pool;
  const unsavedPoolAddress = "FeR8VBqNRSUD5NtXAj2n3j1dAHkZHfyDktKuLXD4pump";
  const pool = await client.getPool(samplePoolAddress);

  it("Returns pool data", () => {
    expect(pool.address).toBe(samplePoolAddress);
    expect(pool.feeRate).toBeGreaterThan(0);
  });

  it("Returns 404 for unsaved pool", async () => {
    await expect(() => client.getMarket(unsavedPoolAddress)).rejects.toThrowError(
      expect.objectContaining({
        code: 40401,
      }),
    );
  });
  it("Returns 400 for invalid pool", async () => {
    await expect(() => client.getMarket("123")).rejects.toThrowError(
      expect.objectContaining({
        code: 40001,
      }),
    );
  });
});

describe("Pool Ticks", async () => {
  const poolTicks = await client.getPoolTicks("FwewVm8u6tFPGewAyHmWAqad9hmF7mvqxK4mJ7iNqqGC");

  it("Have tick spacing", () => {
    expect(poolTicks.tickSpacing > 0).toBe(true);
  });
  it("Have empty first tick", () => {
    expect(poolTicks.ticks[0].liquidity).toBe(0n);
  });
  it("Have empty last tick", () => {
    expect(poolTicks.ticks[poolTicks.ticks.length - 1].liquidity).toBe(0n);
  });
  it("Have non-empty middle tick", () => {
    expect(poolTicks.ticks[Math.round(poolTicks.ticks.length / 2)].liquidity).not.toBe(0n);
  });
});
