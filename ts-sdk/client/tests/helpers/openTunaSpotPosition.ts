import { Address, Rpc, SolanaRpcApi, TransactionSigner } from "@solana/kit";

import { openTunaSpotPositionInstructions, PoolToken } from "../../src";

import { FUNDER } from "./addresses.ts";
import { sendTransaction } from "./mockRpc.ts";

export type OpenTunaSpotPositionTestArgs = {
  rpc: Rpc<SolanaRpcApi>;
  signer?: TransactionSigner;
  pool: Address;
  positionToken: PoolToken;
  collateralToken: PoolToken;
};

export async function openTunaSpotPosition({
  rpc,
  pool: poolAddress,
  positionToken,
  collateralToken,
  signer = FUNDER,
}: OpenTunaSpotPositionTestArgs) {
  const instructions = await openTunaSpotPositionInstructions(rpc, signer, poolAddress, {
    positionToken,
    collateralToken,
  });

  await sendTransaction(instructions);
}
