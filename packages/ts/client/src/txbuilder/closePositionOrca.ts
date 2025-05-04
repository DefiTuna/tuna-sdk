import { type Account, IInstruction, TransactionSigner } from "@solana/kit";
import { findAssociatedTokenPda, Mint, TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import { getPositionAddress, WHIRLPOOL_PROGRAM_ADDRESS } from "@orca-so/whirlpools-client";
import { getClosePositionOrcaInstruction, getTunaPositionAddress, TunaPosition } from "../index.ts";

export async function closePositionOrcaInstruction(
  authority: TransactionSigner,
  tunaPosition: Account<TunaPosition>,
  mintA: Account<Mint>,
  mintB: Account<Mint>,
): Promise<IInstruction> {
  const positionMint = tunaPosition.data.positionMint;

  const orcaPositionAddress = (await getPositionAddress(positionMint))[0];

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

  return getClosePositionOrcaInstruction({
    mintA: mintA.address,
    mintB: mintB.address,
    authority,
    tunaPositionMint: positionMint,
    tunaPositionAta,
    tunaPositionAtaA,
    tunaPositionAtaB,
    orcaPosition: orcaPositionAddress,
    tunaPosition: tunaPositionAddress,
    whirlpoolProgram: WHIRLPOOL_PROGRAM_ADDRESS,
    tokenProgramA: mintA.programAddress,
    tokenProgramB: mintB.programAddress,
    token2022Program: TOKEN_2022_PROGRAM_ADDRESS,
  });
}
