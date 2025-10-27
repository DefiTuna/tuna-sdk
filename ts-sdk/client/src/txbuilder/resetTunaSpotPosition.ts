import { Address, GetAccountInfoApi, GetMultipleAccountsApi, IInstruction, Rpc, TransactionSigner } from "@solana/kit";
import { fetchAllMaybeMint, findAssociatedTokenPda } from "@solana-program/token-2022";
import assert from "assert";

import {
  fetchTunaSpotPosition,
  getResetTunaSpotPositionInstruction,
  getTunaSpotPositionAddress,
  ResetTunaSpotPositionInstructionDataArgs,
} from "../index.ts";

export async function resetTunaSpotPositionInstruction(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  authority: TransactionSigner,
  poolAddress: Address,
  args: ResetTunaSpotPositionInstructionDataArgs,
): Promise<IInstruction> {
  const tunaPositionAddress = (await getTunaSpotPositionAddress(authority.address, poolAddress))[0];
  const tunaPosition = await fetchTunaSpotPosition(rpc, tunaPositionAddress);

  const [mintA, mintB] = await fetchAllMaybeMint(rpc, [tunaPosition.data.mintA, tunaPosition.data.mintB]);
  assert(mintA.exists, "Token A not found");
  assert(mintB.exists, "Token B not found");

  const tunaPositionAtaA = (
    await findAssociatedTokenPda({
      owner: tunaPositionAddress,
      mint: mintA.address,
      tokenProgram: mintA.programAddress,
    })
  )[0];

  const tunaPositionAtaB = (
    await findAssociatedTokenPda({
      owner: tunaPositionAddress,
      mint: mintB.address,
      tokenProgram: mintB.programAddress,
    })
  )[0];

  return getResetTunaSpotPositionInstruction({
    ...args,
    authority,
    mintA: tunaPosition.data.mintA,
    mintB: tunaPosition.data.mintB,
    tunaPositionAtaA,
    tunaPositionAtaB,
    tunaPosition: tunaPositionAddress,
  });
}
