import { fetchMaybeFusionPool, FUSIONAMM_PROGRAM_ADDRESS, getPositionAddress } from "@crypticdot/fusionamm-client";
import { Address, GetAccountInfoApi, GetMultipleAccountsApi, IInstruction, Rpc, TransactionSigner } from "@solana/kit";
import { fetchAllMaybeMint, findAssociatedTokenPda, TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import assert from "assert";

import { fetchMaybeTunaPosition, getClosePositionFusionInstruction, getTunaPositionAddress } from "../index.ts";

export async function closePositionFusionInstruction(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  authority: TransactionSigner,
  positionMint: Address,
): Promise<IInstruction> {
  const fusionPositionAddress = (await getPositionAddress(positionMint))[0];

  const tunaPosition = await fetchMaybeTunaPosition(rpc, (await getTunaPositionAddress(positionMint))[0]);
  if (!tunaPosition.exists) throw new Error("Tuna position account not found");

  const fusionPool = await fetchMaybeFusionPool(rpc, tunaPosition.data.pool);
  if (!fusionPool.exists) throw new Error("FusionPool account not found");

  const [mintA, mintB] = await fetchAllMaybeMint(rpc, [fusionPool.data.tokenMintA, fusionPool.data.tokenMintB]);
  assert(mintA.exists, "Token A account not found");
  assert(mintB.exists, "Token B account not found");

  const tunaPositionAddress = (await getTunaPositionAddress(positionMint))[0];
  const tunaPositionAta = (
    await findAssociatedTokenPda({
      owner: tunaPositionAddress,
      mint: positionMint,
      tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    })
  )[0];

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

  return getClosePositionFusionInstruction({
    mintA: mintA.address,
    mintB: mintB.address,
    authority,
    tunaPositionMint: positionMint,
    tunaPositionAta,
    tunaPositionAtaA,
    tunaPositionAtaB,
    fusionPosition: fusionPositionAddress,
    tunaPosition: tunaPositionAddress,
    fusionammProgram: FUSIONAMM_PROGRAM_ADDRESS,
    tokenProgramA: mintA.programAddress,
    tokenProgramB: mintB.programAddress,
    token2022Program: TOKEN_2022_PROGRAM_ADDRESS,
  });
}
