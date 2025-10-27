import { fetchMaybeFusionPool } from "@crypticdot/fusionamm-client";
import {
  type Account,
  Address,
  GetAccountInfoApi,
  GetMultipleAccountsApi,
  IInstruction,
  Rpc,
  TransactionSigner,
} from "@solana/kit";
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  fetchAllMaybeMint,
  findAssociatedTokenPda,
  Mint,
} from "@solana-program/token-2022";
import assert from "assert";

import {
  getOpenTunaSpotPositionFusionInstruction,
  getTunaSpotPositionAddress,
  OpenTunaSpotPositionFusionInstructionDataArgs,
} from "../index.ts";

export async function openTunaSpotPositionFusionInstructions(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  authority: TransactionSigner,
  fusionPoolAddress: Address,
  args: OpenTunaSpotPositionFusionInstructionDataArgs,
): Promise<IInstruction[]> {
  const fusionPool = await fetchMaybeFusionPool(rpc, fusionPoolAddress);
  if (!fusionPool.exists) throw new Error("FusionPool account not found");

  const [mintA, mintB] = await fetchAllMaybeMint(rpc, [fusionPool.data.tokenMintA, fusionPool.data.tokenMintB]);
  assert(mintA.exists, "Token A account not found");
  assert(mintB.exists, "Token B account not found");

  const ix = await openTunaSpotPositionFusionInstruction(authority, mintA, mintB, fusionPoolAddress, args);
  return [ix];
}

export async function openTunaSpotPositionFusionInstruction(
  authority: TransactionSigner,
  mintA: Account<Mint>,
  mintB: Account<Mint>,
  fusionPoolAddress: Address,
  args: OpenTunaSpotPositionFusionInstructionDataArgs,
): Promise<IInstruction> {
  const tunaPositionAddress = (await getTunaSpotPositionAddress(authority.address, fusionPoolAddress))[0];

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

  return getOpenTunaSpotPositionFusionInstruction({
    authority,
    mintA: mintA.address,
    mintB: mintB.address,
    tokenProgramA: mintA.programAddress,
    tokenProgramB: mintB.programAddress,
    tunaPosition: tunaPositionAddress,
    tunaPositionAtaA,
    tunaPositionAtaB,
    fusionPool: fusionPoolAddress,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    ...args,
  });
}
