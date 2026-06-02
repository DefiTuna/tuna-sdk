import {
  type Account,
  Address,
  GetAccountInfoApi,
  GetMultipleAccountsApi,
  IInstruction,
  Rpc,
  TransactionSigner,
} from "@solana/kit";
import { fetchAllMaybeMint, findAssociatedTokenPda, Mint } from "@solana-program/token-2022";
import assert from "assert";

import { fetchMaybeTunaSpotPosition, getCloseTunaSpotPositionInstruction } from "../generated";
import { getMarketAddress, getTunaSpotPositionAddress } from "../pda.ts";

export async function closeTunaSpotPositionInstructions(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  authority: TransactionSigner,
  pool: Address,
): Promise<IInstruction[]> {
  const tunaPositionAddress = (await getTunaSpotPositionAddress(authority.address, pool))[0];
  const tunaPosition = await fetchMaybeTunaSpotPosition(rpc, tunaPositionAddress);
  if (!tunaPosition.exists) throw new Error("Tuna position account not found");

  const [mintA, mintB] = await fetchAllMaybeMint(rpc, [tunaPosition.data.mintA, tunaPosition.data.mintB]);
  assert(mintA.exists, "Token A account not found");
  assert(mintB.exists, "Token B account not found");

  const ix = await closeTunaSpotPositionInstruction(authority, pool, mintA, mintB);
  return [ix];
}

export async function closeTunaSpotPositionInstruction(
  authority: TransactionSigner,
  pool: Address,
  mintA: Account<Mint>,
  mintB: Account<Mint>,
): Promise<IInstruction> {
  const tunaPositionAddress = (await getTunaSpotPositionAddress(authority.address, pool))[0];
  const marketAddress = (await getMarketAddress(pool))[0];

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

  return getCloseTunaSpotPositionInstruction({
    mintA: mintA.address,
    mintB: mintB.address,
    tokenProgramA: mintA.programAddress,
    tokenProgramB: mintB.programAddress,
    market: marketAddress,
    tunaPositionAtaA,
    tunaPositionAtaB,
    authority,
    tunaPosition: tunaPositionAddress,
  });
}
