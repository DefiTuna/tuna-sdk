import { fetchMaybeFusionPool, FUSIONAMM_PROGRAM_ADDRESS, getPositionAddress } from "@crypticdot/fusionamm-client";
import { FP_NFT_UPDATE_AUTH } from "@crypticdot/fusionamm-client";
import { Address, GetAccountInfoApi, GetMultipleAccountsApi, IInstruction, Rpc, TransactionSigner } from "@solana/kit";
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  fetchAllMaybeMint,
  findAssociatedTokenPda,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";
import assert from "assert";

import {
  getMarketAddress,
  getOpenPositionFusionInstruction,
  getTunaPositionAddress,
  OpenPositionFusionInstructionDataArgs,
} from "../index.ts";

export async function openPositionFusionInstruction(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  authority: TransactionSigner,
  positionMint: TransactionSigner,
  fusionPoolAddress: Address,
  args: OpenPositionFusionInstructionDataArgs,
): Promise<IInstruction> {
  const fusionPool = await fetchMaybeFusionPool(rpc, fusionPoolAddress);
  if (!fusionPool.exists) throw new Error("Whirlpool account not found");

  const [mintA, mintB] = await fetchAllMaybeMint(rpc, [fusionPool.data.tokenMintA, fusionPool.data.tokenMintB]);
  assert(mintA.exists, "Token A account not found");
  assert(mintB.exists, "Token B account not found");

  const marketAddress = (await getMarketAddress(fusionPool.address))[0];
  const fusionPositionAddress = (await getPositionAddress(positionMint.address))[0];
  const tunaPositionAddress = (await getTunaPositionAddress(positionMint.address))[0];

  const tunaPositionAta = (
    await findAssociatedTokenPda({
      owner: tunaPositionAddress,
      mint: positionMint.address,
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

  return getOpenPositionFusionInstruction({
    authority,
    market: marketAddress,
    mintA: mintA.address,
    mintB: mintB.address,
    fusionPosition: fusionPositionAddress,
    tunaPosition: tunaPositionAddress,
    tunaPositionMint: positionMint,
    tunaPositionAta,
    tunaPositionAtaA,
    tunaPositionAtaB,
    fusionammProgram: FUSIONAMM_PROGRAM_ADDRESS,
    fusionPool: fusionPool.address,
    metadataUpdateAuth: FP_NFT_UPDATE_AUTH,
    tokenProgramA: mintA.programAddress,
    tokenProgramB: mintB.programAddress,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    token2022Program: TOKEN_2022_PROGRAM_ADDRESS,
    ...args,
  });
}
