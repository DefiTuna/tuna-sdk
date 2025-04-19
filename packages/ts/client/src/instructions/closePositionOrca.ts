import { getClosePositionOrcaInstruction, getTunaConfigAddress, getTunaPositionAddress } from "../index.ts";
import { type Account, Address, IInstruction, TransactionSigner } from "@solana/kit";
import { findAssociatedTokenPda, TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import { getPositionAddress, Whirlpool, WHIRLPOOL_PROGRAM_ADDRESS } from "@orca-so/whirlpools-client";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";

export async function closePositionOrcaInstruction(
  authority: TransactionSigner,
  positionMint: Address,
  whirlpool: Account<Whirlpool, Address>,
): Promise<IInstruction> {
  const mintA = whirlpool.data.tokenMintA;
  const mintB = whirlpool.data.tokenMintB;

  const tunaConfig = (await getTunaConfigAddress())[0];

  const orcaPositionAddress = (await getPositionAddress(positionMint))[0];

  const tunaPositionAddress = (await getTunaPositionAddress(positionMint))[0];
  const tunaPositionAta = (
    await findAssociatedTokenPda({
      owner: tunaPositionAddress,
      mint: positionMint,
      tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    })
  )[0];

  const tunaPositionOwnerAtaA = (
    await findAssociatedTokenPda({
      owner: authority.address,
      mint: mintA,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
  )[0];

  const tunaPositionOwnerAtaB = (
    await findAssociatedTokenPda({
      owner: authority.address,
      mint: mintB,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
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
    tunaConfig,
    tunaPositionMint: positionMint,
    tunaPositionAta,
    tunaPositionAtaA,
    tunaPositionAtaB,
    tunaPositionOwnerAtaA,
    tunaPositionOwnerAtaB,
    orcaPosition: orcaPositionAddress,
    tunaPosition: tunaPositionAddress,
    whirlpool: whirlpool.address,
    whirlpoolProgram: WHIRLPOOL_PROGRAM_ADDRESS,
    token2022Program: TOKEN_2022_PROGRAM_ADDRESS,
  });
}
