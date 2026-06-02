import { Address, Rpc, SolanaRpcApi, TransactionSigner } from "@solana/kit";
import { expect } from "vitest";

import { fetchMarket, getMarketAddress, openTunaSpotPositionInstructions, PoolToken } from "../../src";

import { FUNDER } from "./addresses.ts";
import { rpc, sendTransaction } from "./mockRpc.ts";

export type OpenTunaSpotPositionTestArgs = {
  rpc: Rpc<SolanaRpcApi>;
  signer?: TransactionSigner;
  pool: Address;
  positionToken: PoolToken;
  collateralToken: PoolToken;
};

export async function openTunaSpotPosition({
  rpc,
  pool,
  positionToken,
  collateralToken,
  signer = FUNDER,
}: OpenTunaSpotPositionTestArgs) {
  const marketAddress = (await getMarketAddress(pool))[0];
  const market = await fetchMarket(rpc, marketAddress);

  const instructions = await openTunaSpotPositionInstructions(rpc, signer, pool, {
    positionToken,
    collateralToken,
  });

  await sendTransaction(instructions);

  const marketAfter = await fetchMarket(rpc, marketAddress);

  expect(marketAfter.data.numPositions).toEqual(market.data.numPositions + 1);
}
