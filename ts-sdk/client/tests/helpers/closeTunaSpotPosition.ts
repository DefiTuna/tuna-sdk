import { Address, Rpc, SolanaRpcApi, TransactionSigner } from "@solana/kit";
import { expect } from "vitest";

import { closeTunaSpotPositionInstructions, fetchMaybeTunaSpotPosition, getTunaSpotPositionAddress } from "../../src";

import { FUNDER } from "./addresses.ts";
import { sendTransaction } from "./mockRpc.ts";

export type CloseTunaSpotPositionTestArgs = {
  rpc: Rpc<SolanaRpcApi>;
  signer?: TransactionSigner;
  pool: Address;
  swapToToken?: number;
  maxSwapSlippage?: number;
};

export async function closeTunaSpotPosition({ rpc, pool, signer = FUNDER }: CloseTunaSpotPositionTestArgs) {
  const instructions = await closeTunaSpotPositionInstructions(rpc, signer, pool);
  await sendTransaction(instructions);

  const tunaPositionAddress = (await getTunaSpotPositionAddress(signer.address, pool))[0];
  const tunaPosition = await fetchMaybeTunaSpotPosition(rpc, tunaPositionAddress);
  expect(tunaPosition.exists).toBeFalsy();
}
