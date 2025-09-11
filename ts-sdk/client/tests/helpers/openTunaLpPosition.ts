import { Address, TransactionSigner } from "@solana/kit";
import { expect } from "vitest";

import {
  fetchMarket,
  fetchTunaLpPosition,
  getMarketAddress,
  getTunaLpPositionAddress,
  MarketMaker,
  MAX_SQRT_PRICE,
  MIN_SQRT_PRICE,
  openTunaLpPositionFusionInstruction,
  openTunaLpPositionOrcaInstruction,
} from "../../src";

import { FUNDER } from "./addresses.ts";
import { rpc, sendTransaction } from "./mockRpc.ts";

export type OpenTunaLpPositionTestArgs = {
  signer?: TransactionSigner;
  positionMint: TransactionSigner;
  pool: Address;
  tickLowerIndex: number;
  tickUpperIndex: number;
  lowerLimitOrderSqrtPrice?: bigint;
  upperLimitOrderSqrtPrice?: bigint;
  flags?: number;
};

export async function openTunaLpPosition({
  positionMint,
  pool,
  tickLowerIndex,
  tickUpperIndex,
  lowerLimitOrderSqrtPrice,
  upperLimitOrderSqrtPrice,
  flags,
  signer = FUNDER,
}: OpenTunaLpPositionTestArgs) {
  const marketAddress = (await getMarketAddress(pool))[0];
  const market = await fetchMarket(rpc, marketAddress);
  const tunaPositionAddress = (await getTunaLpPositionAddress(positionMint.address))[0];

  const openTunaLpPositionArgs = {
    tickLowerIndex,
    tickUpperIndex,
    lowerLimitOrderSqrtPrice: lowerLimitOrderSqrtPrice ?? MIN_SQRT_PRICE,
    upperLimitOrderSqrtPrice: upperLimitOrderSqrtPrice ?? MAX_SQRT_PRICE,
    flags: flags ?? 0,
  };

  await sendTransaction([
    market.data.marketMaker == MarketMaker.Orca
      ? await openTunaLpPositionOrcaInstruction(rpc, signer, positionMint, pool, openTunaLpPositionArgs)
      : await openTunaLpPositionFusionInstruction(rpc, signer, positionMint, pool, openTunaLpPositionArgs),
  ]);

  const tunaPosition = await fetchTunaLpPosition(rpc, tunaPositionAddress);
  expect(tunaPosition.data.marketMaker).toEqual(market.data.marketMaker);
}
