import { Address, Rpc, SolanaRpcApi, TransactionSigner } from "@solana/kit";
import { getSetComputeUnitLimitInstruction } from "@solana-program/compute-budget";
import { expect } from "vitest";

import {
  closeActiveTunaLpPositionFusionInstructions,
  closeActiveTunaLpPositionOrcaInstructions,
  fetchMarket,
  fetchTunaLpPosition,
  getMarketAddress,
  getTunaLpPositionAddress,
  HUNDRED_PERCENT,
  MarketMaker,
} from "../../src";

import { FUNDER } from "./addresses.ts";
import { sendTransaction } from "./mockRpc.ts";

export type CloseActiveTunaLpPositionTestArgs = {
  rpc: Rpc<SolanaRpcApi>;
  signer?: TransactionSigner;
  positionMint: Address;
  swapToToken?: number;
};

export async function closeActiveTunaLpPosition({
  rpc,
  positionMint,
  swapToToken,
  signer = FUNDER,
}: CloseActiveTunaLpPositionTestArgs) {
  const tunaPositionAddress = (await getTunaLpPositionAddress(positionMint))[0];
  const tunaPosition = await fetchTunaLpPosition(rpc, tunaPositionAddress);

  const marketAddress = (await getMarketAddress(tunaPosition.data.pool))[0];
  const market = await fetchMarket(rpc, marketAddress);

  const args = {
    minRemovedAmountA: 0n,
    minRemovedAmountB: 0n,
    swapToToken: swapToToken ?? 0,
  };

  const instructions =
    market.data.marketMaker == MarketMaker.Orca
      ? await closeActiveTunaLpPositionOrcaInstructions(rpc, signer, positionMint, args)
      : await closeActiveTunaLpPositionFusionInstructions(rpc, signer, positionMint, args);

  instructions.unshift(getSetComputeUnitLimitInstruction({ units: 1_400_000 }));

  await sendTransaction(instructions);

  const marketAfter = await fetchMarket(rpc, marketAddress);

  expect(marketAfter.data.numPositions).toEqual(market.data.numPositions - 1);
}
