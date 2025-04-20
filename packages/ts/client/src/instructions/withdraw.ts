import { Address, IInstruction, TransactionSigner } from "@solana/kit";
import { ASSOCIATED_TOKEN_PROGRAM_ADDRESS, findAssociatedTokenPda } from "@solana-program/token-2022";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  getCreateAtaInstructions,
  getLendingPositionAddress,
  getLendingVaultAddress,
  getTunaConfigAddress,
  getWithdrawInstruction,
} from "../index.ts";

export async function withdrawInstructions(
  authority: TransactionSigner,
  mint: Address,
  funds: bigint,
  shares: bigint,
): Promise<IInstruction[]> {
  const instructions: IInstruction[] = [];

  // Add create user's token account instruction if needed.
  const createUserAtaInstructions = await getCreateAtaInstructions(
    authority,
    mint,
    authority.address,
    TOKEN_PROGRAM_ADDRESS,
  );
  instructions.push(...createUserAtaInstructions.init);

  // Add withdraw instruction
  const ix = await withdrawInstruction(authority, mint, funds, shares);
  instructions.push(ix);

  // Close WSOL accounts if needed.
  instructions.push(...createUserAtaInstructions.cleanup);

  return instructions;
}

export async function withdrawInstruction(
  authority: TransactionSigner,
  mint: Address,
  funds: bigint,
  shares: bigint,
): Promise<IInstruction> {
  const tunaConfig = (await getTunaConfigAddress())[0];
  const lendingPosition = (await getLendingPositionAddress(authority.address, mint))[0];

  const vault = (await getLendingVaultAddress(mint))[0];
  const vaultAta = (
    await findAssociatedTokenPda({
      owner: vault,
      mint: mint,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
  )[0];

  const authorityAta = (
    await findAssociatedTokenPda({
      owner: authority.address,
      mint: mint,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
  )[0];

  return getWithdrawInstruction({
    authority,
    authorityAta,
    lendingPosition,
    mint,
    tunaConfig,
    vault,
    vaultAta,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    funds,
    shares,
  });
}
