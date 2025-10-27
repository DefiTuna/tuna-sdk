import { priceToSqrtPrice } from "@orca-so/whirlpools-core";
import { Address, generateKeyPairSigner } from "@solana/kit";
import { fetchMint } from "@solana-program/token-2022";
import assert from "assert";
import { beforeAll, describe, expect, it } from "vitest";

import {
  fetchMarket,
  getCreateMarketInstruction,
  getMarketAddress,
  getTunaConfigAddress,
  getUpdateMarketInstruction,
  LEVERAGE_ONE,
  MAX_LIQUIDATION_THRESHOLD,
  MAX_PROTOCOL_FEE,
  updateMarketInstruction,
} from "../src";

import { TUNA_ADMIN_KEYPAIR } from "./helpers/addresses.ts";
import { setupFusionPool } from "./helpers/fusion.ts";
import { rpc, sendTransaction, signer } from "./helpers/mockRpc.ts";
import { setupMint } from "./helpers/token.ts";
import { setupMintTE } from "./helpers/token2022.ts";

describe("Markets", () => {
  let poolAddress: Address;
  let tunaConfig: Address;
  let marketAddress: Address;

  beforeAll(async () => {
    const mintAAddress = await setupMint({ decimals: 9 });
    const mintBAddress = await setupMintTE({ decimals: 6 });
    const mintA = await fetchMint(rpc, mintAAddress);
    const mintB = await fetchMint(rpc, mintBAddress);
    poolAddress = await setupFusionPool(mintA.address, mintB.address, 64, {
      initialSqrtPrice: priceToSqrtPrice(200.0, 9, 6),
    });

    tunaConfig = (await getTunaConfigAddress())[0];
    marketAddress = (await getMarketAddress(poolAddress))[0];
  });

  it("Create market", async () => {
    const addressLookupTable = (await generateKeyPairSigner()).address;

    const ix = getCreateMarketInstruction({
      authority: TUNA_ADMIN_KEYPAIR,
      tunaConfig,
      market: marketAddress,
      pool: poolAddress,
      addressLookupTable: addressLookupTable,
      marketMaker: 1,
      disabled: true,
      maxLeverage: LEVERAGE_ONE * 3,
      protocolFee: MAX_PROTOCOL_FEE,
      protocolFeeOnCollateral: 100,
      liquidationFee: 8000,
      liquidationThreshold: MAX_LIQUIDATION_THRESHOLD - 100,
      limitOrderExecutionFee: 6000,
      oraclePriceDeviationThreshold: 20000,
      borrowLimitA: 3433233243421n,
      borrowLimitB: 87855563453n,
      maxSwapSlippage: 400,
      rebalanceProtocolFee: 10000,
      spotPositionSizeLimitA: 34343224218n,
      spotPositionSizeLimitB: 17219873092n,
    });
    await sendTransaction([ix]);

    const market = await fetchMarket(rpc, marketAddress);
    expect(market.data.version).toEqual(1);
    expect(market.data.addressLookupTable).toEqual(addressLookupTable);
    expect(market.data.pool).toEqual(poolAddress);
    expect(market.data.marketMaker).toEqual(1);
    expect(market.data.disabled).toEqual(true);
    expect(market.data.maxLeverage).toEqual(LEVERAGE_ONE * 3);
    expect(market.data.protocolFee).toEqual(MAX_PROTOCOL_FEE);
    expect(market.data.protocolFeeOnCollateral).toEqual(100);
    expect(market.data.liquidationFee).toEqual(8000);
    expect(market.data.liquidationThreshold).toEqual(MAX_LIQUIDATION_THRESHOLD - 100);
    expect(market.data.limitOrderExecutionFee).toEqual(6000);
    expect(market.data.oraclePriceDeviationThreshold).toEqual(20000);
    expect(market.data.borrowLimitA).toEqual(3433233243421n);
    expect(market.data.borrowLimitB).toEqual(87855563453n);
    expect(market.data.maxSwapSlippage).toEqual(400);
    expect(market.data.rebalanceProtocolFee).toEqual(10000);
    expect(market.data.spotPositionSizeLimitA).toEqual(34343224218n);
    expect(market.data.spotPositionSizeLimitB).toEqual(17219873092n);
  });

  it("Update market", async () => {
    const addressLookupTable = (await generateKeyPairSigner()).address;

    const ix = getUpdateMarketInstruction({
      authority: TUNA_ADMIN_KEYPAIR,
      tunaConfig,
      market: marketAddress,
      addressLookupTable: addressLookupTable,
      disabled: false,
      maxLeverage: LEVERAGE_ONE * 2,
      protocolFee: MAX_PROTOCOL_FEE - 1,
      protocolFeeOnCollateral: 101,
      liquidationFee: 8001,
      liquidationThreshold: MAX_LIQUIDATION_THRESHOLD,
      limitOrderExecutionFee: 6001,
      oraclePriceDeviationThreshold: 20001,
      borrowLimitA: 6783446n,
      borrowLimitB: 234576732n,
      maxSwapSlippage: 401,
      rebalanceProtocolFee: 10001,
      spotPositionSizeLimitA: 4343224218n,
      spotPositionSizeLimitB: 7219873092n,
    });
    await sendTransaction([ix]);

    const market = await fetchMarket(rpc, marketAddress);
    expect(market.data.addressLookupTable).toEqual(addressLookupTable);
    expect(market.data.pool).toEqual(poolAddress);
    expect(market.data.marketMaker).toEqual(1);
    expect(market.data.disabled).toEqual(false);
    expect(market.data.maxLeverage).toEqual(LEVERAGE_ONE * 2);
    expect(market.data.protocolFee).toEqual(MAX_PROTOCOL_FEE - 1);
    expect(market.data.protocolFeeOnCollateral).toEqual(101);
    expect(market.data.liquidationFee).toEqual(8001);
    expect(market.data.liquidationThreshold).toEqual(MAX_LIQUIDATION_THRESHOLD);
    expect(market.data.limitOrderExecutionFee).toEqual(6001);
    expect(market.data.oraclePriceDeviationThreshold).toEqual(20001);
    expect(market.data.borrowLimitA).toEqual(6783446n);
    expect(market.data.borrowLimitB).toEqual(234576732n);
    expect(market.data.maxSwapSlippage).toEqual(401);
    expect(market.data.rebalanceProtocolFee).toEqual(10001);
    expect(market.data.spotPositionSizeLimitA).toEqual(4343224218n);
    expect(market.data.spotPositionSizeLimitB).toEqual(7219873092n);
  });

  it("Cannot update market if not admin authority", async () => {
    const ix = await updateMarketInstruction(signer, poolAddress, {
      addressLookupTable: (await generateKeyPairSigner()).address,
      disabled: false,
      maxLeverage: LEVERAGE_ONE * 2,
      protocolFee: MAX_PROTOCOL_FEE - 1,
      protocolFeeOnCollateral: 101,
      liquidationFee: 8001,
      liquidationThreshold: MAX_LIQUIDATION_THRESHOLD,
      limitOrderExecutionFee: 6001,
      oraclePriceDeviationThreshold: 20001,
      borrowLimitA: 6783446n,
      borrowLimitB: 234576732n,
      maxSwapSlippage: 401,
      rebalanceProtocolFee: 10000,
      spotPositionSizeLimitA: 4343224218n,
      spotPositionSizeLimitB: 7219873092n,
    });

    await assert.rejects(sendTransaction([ix]), err => {
      expect((err as Error).toString()).contain("custom program error: 0x7d3");
      return true;
    });
  });
}, 20000);
