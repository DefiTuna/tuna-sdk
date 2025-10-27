import { fetchMaybeWhirlpool } from "@orca-so/whirlpools-client";
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
  getOpenTunaSpotPositionOrcaInstruction,
  getTunaSpotPositionAddress,
  OpenTunaSpotPositionFusionInstructionDataArgs,
  OpenTunaSpotPositionOrcaInstructionDataArgs,
} from "../index.ts";

export async function openTunaSpotPositionOrcaInstructions(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  authority: TransactionSigner,
  whirlpoolAddress: Address,
  args: OpenTunaSpotPositionFusionInstructionDataArgs,
): Promise<IInstruction[]> {
  const whirlpool = await fetchMaybeWhirlpool(rpc, whirlpoolAddress);
  if (!whirlpool.exists) throw new Error("Whirlpool account not found");

  const [mintA, mintB] = await fetchAllMaybeMint(rpc, [whirlpool.data.tokenMintA, whirlpool.data.tokenMintB]);
  assert(mintA.exists, "Token A account not found");
  assert(mintB.exists, "Token B account not found");

  const ix = await openTunaSpotPositionOrcaInstruction(authority, mintA, mintB, whirlpoolAddress, args);
  return [ix];
}

export async function openTunaSpotPositionOrcaInstruction(
  authority: TransactionSigner,
  mintA: Account<Mint>,
  mintB: Account<Mint>,
  whirlpoolAddress: Address,
  args: OpenTunaSpotPositionOrcaInstructionDataArgs,
): Promise<IInstruction> {
  const tunaPositionAddress = (await getTunaSpotPositionAddress(authority.address, whirlpoolAddress))[0];

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

  return getOpenTunaSpotPositionOrcaInstruction({
    authority,
    mintA: mintA.address,
    mintB: mintB.address,
    tokenProgramA: mintA.programAddress,
    tokenProgramB: mintB.programAddress,
    tunaPosition: tunaPositionAddress,
    tunaPositionAtaA,
    tunaPositionAtaB,
    whirlpool: whirlpoolAddress,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    ...args,
  });
}
