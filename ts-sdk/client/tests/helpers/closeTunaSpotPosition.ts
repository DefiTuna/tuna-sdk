import { Address, Rpc, SolanaRpcApi, TransactionSigner } from "@solana/kit";
import { expect } from "vitest";

import {
  closeTunaSpotPositionInstructions,
  fetchMarket,
  fetchMaybeTunaSpotPosition,
  getMarketAddress,
  getTunaSpotPositionAddress,
} from "../../src";

import { FUNDER } from "./addresses.ts";
import { sendTransaction } from "./mockRpc.ts";

export type CloseTunaSpotPositionTestArgs = {
  rpc: Rpc<SolanaRpcApi>;
  signer?: TransactionSigner;
  pool: Address;
  swapToToken?: number;
};

export async function closeTunaSpotPosition({ rpc, pool, signer = FUNDER }: CloseTunaSpotPositionTestArgs) {
  const marketAddress = (await getMarketAddress(pool))[0];
  const market = await fetchMarket(rpc, marketAddress);

  const instructions = await closeTunaSpotPositionInstructions(rpc, signer, pool);
  await sendTransaction(instructions);

  const marketAfter = await fetchMarket(rpc, marketAddress);

  const tunaPositionAddress = (await getTunaSpotPositionAddress(signer.address, pool))[0];
  const tunaPosition = await fetchMaybeTunaSpotPosition(rpc, tunaPositionAddress);
  expect(tunaPosition.exists).toBeFalsy();

  expect(marketAfter.data.numPositions).toEqual(market.data.numPositions - 1);
}
