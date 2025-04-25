import { type Account, Address, IInstruction, TransactionSigner } from "@solana/kit";
import { findAssociatedTokenPda, TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import { getPositionAddress, WHIRLPOOL_PROGRAM_ADDRESS } from "@orca-so/whirlpools-client";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { getClosePositionOrcaInstruction, getTunaPositionAddress, TunaPosition } from "../index.ts";

export async function closePositionOrcaInstruction(
  authority: TransactionSigner,
  tunaPosition: Account<TunaPosition, Address>,
): Promise<IInstruction> {
  const positionMint = tunaPosition.data.positionMint;
  const mintA = tunaPosition.data.mintA;
  const mintB = tunaPosition.data.mintB;

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
      mint: mintA,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
  )[0];

  const tunaPositionAtaB = (
    await findAssociatedTokenPda({
      owner: tunaPositionAddress,
      mint: mintB,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
  )[0];

  return getClosePositionOrcaInstruction({
    authority,
    tunaPositionMint: positionMint,
    tunaPositionAta,
    tunaPositionAtaA,
    tunaPositionAtaB,
    orcaPosition: orcaPositionAddress,
    tunaPosition: tunaPositionAddress,
    whirlpoolProgram: WHIRLPOOL_PROGRAM_ADDRESS,
    token2022Program: TOKEN_2022_PROGRAM_ADDRESS,
  });
}
