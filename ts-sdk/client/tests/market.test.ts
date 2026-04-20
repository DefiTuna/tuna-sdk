import { priceToSqrtPrice } from "@orca-so/whirlpools-core";
import { Account, Address, generateKeyPairSigner } from "@solana/kit";
import { fetchMint, Mint } from "@solana-program/token-2022";
import assert from "assert";
import { beforeAll, describe, expect, it } from "vitest";

import {
  createMarketPermissionlessInstruction,
  DEFAULT_ADDRESS,
  fetchMarket,
  fetchTunaConfig,
  getCreateMarketInstruction,
  getCreateMarketPermissionlessInstruction,
  getLendingVaultAddress,
  getMarketAddress,
  getTunaConfigAddress,
  getUpdateMarketInstruction,
  LEVERAGE_ONE,
  MarketMaker,
  MAX_LIQUIDATION_THRESHOLD,
  MAX_PROTOCOL_FEE,
  updateMarketInstruction,
} from "../src";

import { TUNA_ADMIN_KEYPAIR } from "./helpers/addresses.ts";
import { setupFusionPool } from "./helpers/fusion.ts";
import { rpc, sendTransaction, signer } from "./helpers/mockRpc.ts";
import { setupVault, setupVaultPermissionless } from "./helpers/setup.ts";
import { setupMint } from "./helpers/token.ts";
import { setupMintTE } from "./helpers/token2022.ts";

describe("Markets", () => {
  let poolAddress: Address;
  let poolPermissionlessAddress: Address;
  let tunaConfigAddress: Address;
  let marketAddress: Address;
  let marketPermissionlessAddress: Address;
  let mintA: Account<Mint>;
  let mintB: Account<Mint>;

  beforeAll(async () => {
    const mintAAddress = await setupMint({ decimals: 9 });
    const mintBAddress = await setupMintTE({ decimals: 6 });
    mintA = await fetchMint(rpc, mintAAddress);
    mintB = await fetchMint(rpc, mintBAddress);
    poolAddress = await setupFusionPool(mintA.address, mintB.address, 64, {
      initialSqrtPrice: priceToSqrtPrice(200.0, 9, 6),
    });

    poolPermissionlessAddress = await setupFusionPool(mintA.address, mintB.address, 32, {
      initialSqrtPrice: priceToSqrtPrice(200.0, 9, 6),
    });

    tunaConfigAddress = (await getTunaConfigAddress())[0];
    marketAddress = (await getMarketAddress(poolAddress))[0];
    marketPermissionlessAddress = (await getMarketAddress(poolPermissionlessAddress))[0];
  });

  it("Create market", async () => {
    const addressLookupTable = (await generateKeyPairSigner()).address;

    const vaultA = await setupVault(mintA, {
      pythOracleFeedId: DEFAULT_ADDRESS,
      oraclePriceUpdate: DEFAULT_ADDRESS,
      interestRate: 3655890108n,
      supplyLimit: 0n,
      allowUnsafeTokenExtensions: true,
    });

    const vaultB = await setupVault(mintB, {
      pythOracleFeedId: DEFAULT_ADDRESS,
      oraclePriceUpdate: DEFAULT_ADDRESS,
      interestRate: 3655890108n,
      supplyLimit: 0n,
      allowUnsafeTokenExtensions: true,
    });

    const ix = getCreateMarketInstruction({
      authority: TUNA_ADMIN_KEYPAIR,
      tunaConfig: tunaConfigAddress,
      market: marketAddress,
      pool: poolAddress,
      vaultA: vaultA.address,
      vaultB: vaultB.address,
      addressLookupTable: addressLookupTable,
      disabled: true,
      maxLeverage: LEVERAGE_ONE * 3,
      protocolFee: MAX_PROTOCOL_FEE,
      protocolFeeOnCollateral: 100,
      liquidationFee: 8000,
      liquidationThreshold: MAX_LIQUIDATION_THRESHOLD - 100,
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
    expect(market.data.oraclePriceDeviationThreshold).toEqual(20000);
    expect(market.data.borrowLimitA).toEqual(3433233243421n);
    expect(market.data.borrowLimitB).toEqual(87855563453n);
    expect(market.data.maxSwapSlippage).toEqual(400);
    expect(market.data.rebalanceProtocolFee).toEqual(10000);
    expect(market.data.spotPositionSizeLimitA).toEqual(34343224218n);
    expect(market.data.spotPositionSizeLimitB).toEqual(17219873092n);
    expect(market.data.vaultA).toEqual(vaultA.address);
    expect(market.data.vaultB).toEqual(vaultB.address);
  });

  it("Update market", async () => {
    const addressLookupTable = (await generateKeyPairSigner()).address;

    const ix = getUpdateMarketInstruction({
      authority: TUNA_ADMIN_KEYPAIR,
      tunaConfig: tunaConfigAddress,
      market: marketAddress,
      addressLookupTable: addressLookupTable,
      disabled: false,
      maxLeverage: LEVERAGE_ONE * 2,
      protocolFee: MAX_PROTOCOL_FEE - 1,
      protocolFeeOnCollateral: 101,
      liquidationFee: 8001,
      liquidationThreshold: MAX_LIQUIDATION_THRESHOLD,
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
      oraclePriceDeviationThreshold: 20001,
      borrowLimitA: 6783446n,
      borrowLimitB: 234576732n,
      maxSwapSlippage: 401,
      rebalanceProtocolFee: 10000,
      spotPositionSizeLimitA: 4343224218n,
      spotPositionSizeLimitB: 7219873092n,
    });

    await assert.rejects(sendTransaction([ix]), err => {
      expect((err as Error).toString()).contain("custom program error: 0x7dc");
      return true;
    });
  });

  it("Fails to create permissionless market with default vaults", async () => {
    const addressLookupTable = (await generateKeyPairSigner()).address;

    const vaultAAddress = (await getLendingVaultAddress(mintA.address))[0];
    const vaultBAddress = (await getLendingVaultAddress(mintB.address))[0];

    const ix = getCreateMarketPermissionlessInstruction({
      authority: TUNA_ADMIN_KEYPAIR,
      tunaConfig: tunaConfigAddress,
      market: marketPermissionlessAddress,
      pool: poolPermissionlessAddress,
      vaultA: vaultAAddress,
      vaultB: vaultBAddress,
      addressLookupTable: addressLookupTable,
    });

    await assert.rejects(sendTransaction([ix]), err => {
      expect((err as Error).toString()).contain(`custom program error: 0x7d1`);
      return true;
    });
  });

  it("Create permissionless market", async () => {
    const addressLookupTable = (await generateKeyPairSigner()).address;
    const marketAddress = (await getMarketAddress(poolPermissionlessAddress))[0];

    const vaultA = await setupVaultPermissionless(mintA, {
      interestRate: 3655890108n,
      market: marketAddress,
    });

    const vaultB = await setupVaultPermissionless(mintB, {
      interestRate: 3655890108n,
      market: marketAddress,
    });

    const ix = await createMarketPermissionlessInstruction(
      TUNA_ADMIN_KEYPAIR,
      poolPermissionlessAddress,
      vaultA.address,
      vaultB.address,
      {
        addressLookupTable,
      },
    );

    await sendTransaction([ix]);

    const tunaConfig = await fetchTunaConfig(rpc, tunaConfigAddress);

    const market = await fetchMarket(rpc, marketPermissionlessAddress);
    expect(market.data.version).toEqual(1);
    expect(market.data.addressLookupTable).toEqual(addressLookupTable);
    expect(market.data.pool).toEqual(poolPermissionlessAddress);
    expect(market.data.marketMaker).toEqual(MarketMaker.Fusion);
    expect(market.data.disabled).toEqual(false);
    expect(market.data.protocolFee).toEqual(tunaConfig.data.defaultProtocolFeeRate);
    expect(market.data.rebalanceProtocolFee).toEqual(tunaConfig.data.defaultRebalanceFeeRate);
    expect(market.data.liquidationFee).toEqual(tunaConfig.data.defaultLiquidationFeeRate);
    expect(market.data.maxSwapSlippage).toEqual(0);
    expect(market.data.vaultA).toEqual(vaultA.address);
    expect(market.data.vaultB).toEqual(vaultB.address);
  });
}, 20000);
