import { Address, Rpc, SolanaRpcApi, TransactionSigner } from "@solana/kit";

import { closeTunaSpotPositionInstructions } from "../../src";

import { FUNDER } from "./addresses.ts";
import { sendTransaction } from "./mockRpc.ts";

export type CloseTunaSpotPositionTestArgs = {
  rpc: Rpc<SolanaRpcApi>;
  signer?: TransactionSigner;
  positionMint: Address;
  swapToToken?: number;
  maxSwapSlippage?: number;
};

export async function closeTunaSpotPosition({ rpc, positionMint, signer = FUNDER }: CloseTunaSpotPositionTestArgs) {
  const instructions = await closeTunaSpotPositionInstructions(rpc, signer, positionMint);
  await sendTransaction(instructions);
}
