import { AccountRole, generateKeyPairSigner, IAccountMeta } from "@solana/kit";
import assert from "assert";
import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_ADDRESS,
  getTunaConfigAddress,
  getTunaPriceUpdateAddress,
  getUpdateOraclePriceInstruction,
  HUNDRED_PERCENT,
  LEVERAGE_ONE,
  MarketMaker,
  TUNA_ERROR__ORACLE_STALE_PRICE,
} from "../src";

import { TUNA_ORACLE_PRICE_UPDATE_KEYPAIR } from "./helpers/addresses.ts";
import { decreaseTunaLpPosition } from "./helpers/decreaseTunaLpPosition.ts";
import { fetchPool } from "./helpers/fetch.ts";
import { increaseTunaLpPosition } from "./helpers/increaseTunaLpPosition.ts";
import { rpc, sendTransaction, signer } from "./helpers/mockRpc.ts";
import { openTunaLpPosition } from "./helpers/openTunaLpPosition.ts";
import { setupTestMarket, TestMarket } from "./helpers/setup.ts";

describe("Tuna Oracle", () => {
  let market: TestMarket;

  beforeEach(async () => {
    const marketArgs = {
      addressLookupTable: DEFAULT_ADDRESS,
      borrowLimitA: 0n,
      borrowLimitB: 0n,
      disabled: false,
      liquidationFee: 10000, // 1%
      liquidationThreshold: 920000, // 92%
      maxLeverage: (LEVERAGE_ONE * 1020) / 100,
      maxSwapSlippage: 0,
      oraclePriceDeviationThreshold: HUNDRED_PERCENT, // Allow large deviation for tests
      protocolFee: 1000, // 0.1%
      protocolFeeOnCollateral: 1000, // 0.1%
      rebalanceProtocolFee: HUNDRED_PERCENT / 10,
      spotPositionSizeLimitA: 1000_000_000_000,
      spotPositionSizeLimitB: 100000_000_000,
    };
    market = await setupTestMarket({ ...marketArgs }, MarketMaker.Fusion, { enableTunaOracle: true });
  });

  it(`Fails to open and increase leveraged position due to stale oracle price`, async () => {
    const positionMintKeypair = await generateKeyPairSigner();
    const pool = await fetchPool(rpc, market.pool, market.marketMaker);
    const actualTickIndex = pool.data.tickCurrentIndex - (pool.data.tickCurrentIndex % pool.data.tickSpacing);

    await openTunaLpPosition({
      signer,
      positionMint: positionMintKeypair,
      pool: pool.address,
      tickLowerIndex: actualTickIndex + pool.data.tickSpacing,
      tickUpperIndex: actualTickIndex + pool.data.tickSpacing * 5,
    });

    await assert.rejects(
      increaseTunaLpPosition({
        rpc,
        positionMint: positionMintKeypair.address,
        pool: pool.address,
        collateralA: 1_000_000_000n,
        collateralB: 0n,
        borrowA: 1_000_000_000n,
        borrowB: 0n,
      }),
      err => {
        expect((err as Error).toString()).contain(
          `custom program error: ${"0x" + TUNA_ERROR__ORACLE_STALE_PRICE.toString(16)}`,
        );
        return true;
      },
    );
  });

  it(`Update oracle price and open and increase leveraged position`, async () => {
    const positionMintKeypair = await generateKeyPairSigner();
    const pool = await fetchPool(rpc, market.pool, market.marketMaker);
    const actualTickIndex = pool.data.tickCurrentIndex - (pool.data.tickCurrentIndex % pool.data.tickSpacing);

    await openTunaLpPosition({
      signer,
      positionMint: positionMintKeypair,
      pool: pool.address,
      tickLowerIndex: actualTickIndex + pool.data.tickSpacing,
      tickUpperIndex: actualTickIndex + pool.data.tickSpacing * 5,
    });

    const tunaConfig = (await getTunaConfigAddress())[0];

    const priceUpdateAddressA = (await getTunaPriceUpdateAddress(market.mintA.address))[0];
    const priceUpdateAddressB = (await getTunaPriceUpdateAddress(market.mintB.address))[0];

    const remainingAccounts: IAccountMeta[] = [
      { address: priceUpdateAddressA, role: AccountRole.WRITABLE },
      { address: priceUpdateAddressB, role: AccountRole.WRITABLE },
    ];

    const ix = getUpdateOraclePriceInstruction({
      authority: TUNA_ORACLE_PRICE_UPDATE_KEYPAIR,
      tunaConfig,
      priceUpdates: [
        {
          price: 200,
          exponent: 0,
        },
        {
          price: 100,
          exponent: -2,
        },
      ],
    });

    // @ts-expect-error don't worry about the error
    ix.accounts.push(...remainingAccounts);
    await sendTransaction([ix]);

    // The oracle prices are up-to-date and the increase should pass.
    await increaseTunaLpPosition({
      rpc,
      positionMint: positionMintKeypair.address,
      pool: pool.address,
      collateralA: 1_000n,
      collateralB: 0n,
      borrowA: 1_000n,
      borrowB: 0n,
    });

    await decreaseTunaLpPosition({
      rpc,
      signer,
      positionMint: positionMintKeypair.address,
      pool: pool.address,
      closeTunaLpPosition: true,
    });
  });
}, 20000);
