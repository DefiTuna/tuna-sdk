import { getPositionAddress, Whirlpool, WHIRLPOOL_PROGRAM_ADDRESS } from "@orca-so/whirlpools-client";
import { type Account, IInstruction, TransactionSigner } from "@solana/kit";
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  Mint,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";

import {
  getMarketAddress,
  getOpenPositionOrcaInstruction,
  getTunaPositionAddress,
  OpenPositionOrcaInstructionDataArgs,
  WP_NFT_UPDATE_AUTH,
} from "../index.ts";

export async function openPositionOrcaInstruction(
  authority: TransactionSigner,
  positionMint: TransactionSigner,
  mintA: Account<Mint>,
  mintB: Account<Mint>,
  whirlpool: Account<Whirlpool>,
  args: OpenPositionOrcaInstructionDataArgs,
): Promise<IInstruction> {
  const marketAddress = (await getMarketAddress(whirlpool.address))[0];
  const orcaPositionAddress = (await getPositionAddress(positionMint.address))[0];
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

  return getOpenPositionOrcaInstruction({
    authority,
    market: marketAddress,
    mintA: mintA.address,
    mintB: mintB.address,
    orcaPosition: orcaPositionAddress,
    tunaPosition: tunaPositionAddress,
    tunaPositionMint: positionMint,
    tunaPositionAta,
    tunaPositionAtaA,
    tunaPositionAtaB,
    whirlpoolProgram: WHIRLPOOL_PROGRAM_ADDRESS,
    whirlpool: whirlpool.address,
    metadataUpdateAuth: WP_NFT_UPDATE_AUTH,
    tokenProgramA: mintA.programAddress,
    tokenProgramB: mintB.programAddress,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    token2022Program: TOKEN_2022_PROGRAM_ADDRESS,
    ...args,
  });
}
