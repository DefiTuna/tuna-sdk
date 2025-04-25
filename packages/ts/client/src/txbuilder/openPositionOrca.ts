import { type Account, Address, IInstruction, TransactionSigner } from "@solana/kit";
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";
import { getPositionAddress, Whirlpool, WHIRLPOOL_PROGRAM_ADDRESS } from "@orca-so/whirlpools-client";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  getMarketAddress,
  getOpenPositionOrcaInstruction,
  getTunaPositionAddress,
  OpenPositionOrcaInstructionData,
  WP_NFT_UPDATE_AUTH,
} from "../index.ts";

export async function openPositionOrcaInstruction(
  authority: TransactionSigner,
  positionMint: TransactionSigner,
  whirlpool: Account<Whirlpool, Address>,
  args: Omit<OpenPositionOrcaInstructionData, "discriminator">,
): Promise<IInstruction> {
  const mintA = whirlpool.data.tokenMintA;
  const mintB = whirlpool.data.tokenMintB;

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

  return getOpenPositionOrcaInstruction({
    authority,
    market: marketAddress,
    mintA,
    mintB,
    orcaPosition: orcaPositionAddress,
    tunaPosition: tunaPositionAddress,
    tunaPositionMint: positionMint,
    tunaPositionAta,
    tunaPositionAtaA,
    tunaPositionAtaB,
    whirlpoolProgram: WHIRLPOOL_PROGRAM_ADDRESS,
    whirlpool: whirlpool.address,
    metadataUpdateAuth: WP_NFT_UPDATE_AUTH,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    token2022Program: TOKEN_2022_PROGRAM_ADDRESS,
    ...args,
  });
}
