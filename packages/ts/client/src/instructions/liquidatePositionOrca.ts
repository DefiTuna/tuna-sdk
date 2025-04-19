import { getLiquidatePositionOrcaInstruction, getMarketAddress, TunaConfig, TunaPosition, Vault } from "../index.ts";
import { type Account, Address, IInstruction, TransactionSigner } from "@solana/kit";
import { findAssociatedTokenPda, TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import { getPositionAddress, Whirlpool, WHIRLPOOL_PROGRAM_ADDRESS } from "@orca-so/whirlpools-client";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";

export async function liquidatePositionOrcaInstruction(
  authority: TransactionSigner,
  tunaConfig: Account<TunaConfig, Address>,
  tunaPosition: Account<TunaPosition, Address>,
  vaultA: Account<Vault, Address>,
  vaultB: Account<Vault, Address>,
  whirlpool: Account<Whirlpool, Address>,
  withdrawPercent: number,
): Promise<IInstruction> {
  const mintA = whirlpool.data.tokenMintA;
  const mintB = whirlpool.data.tokenMintB;
  const positionMint = tunaPosition.data.positionMint;

  const marketAddress = (await getMarketAddress(whirlpool.address))[0];
  const orcaPositionAddress = (await getPositionAddress(positionMint))[0];

  const tunaPositionAta = (
    await findAssociatedTokenPda({
      owner: tunaPosition.address,
      mint: positionMint,
      tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    })
  )[0];

  const tunaPositionAtaA = (
    await findAssociatedTokenPda({
      owner: tunaPosition.address,
      mint: mintA,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
  )[0];

  const tunaPositionAtaB = (
    await findAssociatedTokenPda({
      owner: tunaPosition.address,
      mint: mintB,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
  )[0];

  const vaultAAta = (
    await findAssociatedTokenPda({
      owner: vaultA.address,
      mint: mintA,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
  )[0];

  const vaultBAta = (
    await findAssociatedTokenPda({
      owner: vaultB.address,
      mint: mintB,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
  )[0];

  const liquidationFeeRecipientAtaA = (
    await findAssociatedTokenPda({
      owner: tunaConfig.data.liquidatorAuthority,
      mint: mintA,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
  )[0];

  const liquidationFeeRecipientAtaB = (
    await findAssociatedTokenPda({
      owner: tunaConfig.data.liquidatorAuthority,
      mint: mintB,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
  )[0];

  return getLiquidatePositionOrcaInstruction({
    market: marketAddress,
    mintA,
    mintB,
    pythOraclePriceFeedA: vaultA.data.pythOraclePriceUpdate,
    pythOraclePriceFeedB: vaultB.data.pythOraclePriceUpdate,
    vaultA: vaultA.address,
    vaultAAta,
    vaultB: vaultB.address,
    vaultBAta,
    authority,
    tunaConfig: tunaConfig.address,
    tunaPositionAta,
    tunaPositionAtaA,
    tunaPositionAtaB,
    orcaPosition: orcaPositionAddress,
    tunaPosition: tunaPosition.address,
    liquidationFeeRecipientAtaA,
    liquidationFeeRecipientAtaB,
    whirlpool: whirlpool.address,
    whirlpoolProgram: WHIRLPOOL_PROGRAM_ADDRESS,
    withdrawPercent,
  });
}
