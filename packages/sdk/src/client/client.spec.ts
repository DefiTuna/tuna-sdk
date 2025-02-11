import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import { TunaApiClient } from "./client";
import * as testUtils from "./test_utils";

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
