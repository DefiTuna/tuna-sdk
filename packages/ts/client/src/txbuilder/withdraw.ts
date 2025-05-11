import { Account, IInstruction, TransactionSigner } from "@solana/kit";
import { MEMO_PROGRAM_ADDRESS } from "@solana-program/memo";
import { findAssociatedTokenPda, Mint } from "@solana-program/token-2022";

import {
  getCreateAtaInstructions,
  getLendingPositionAddress,
  getLendingVaultAddress,
  getTunaConfigAddress,
  getWithdrawInstruction,
} from "../index.ts";

export async function withdrawInstructions(
  authority: TransactionSigner,
  mint: Account<Mint>,
  funds: bigint,
  shares: bigint,
): Promise<IInstruction[]> {
  const instructions: IInstruction[] = [];

  // Add create user's token account instruction if needed.
  const createUserAtaInstructions = await getCreateAtaInstructions(
    authority,
    mint.address,
    authority.address,
    mint.programAddress,
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
  mint: Account<Mint>,
  funds: bigint,
  shares: bigint,
): Promise<IInstruction> {
  const tunaConfig = (await getTunaConfigAddress())[0];
  const lendingPosition = (await getLendingPositionAddress(authority.address, mint.address))[0];

  const vault = (await getLendingVaultAddress(mint.address))[0];
  const vaultAta = (
    await findAssociatedTokenPda({
      owner: vault,
      mint: mint.address,
      tokenProgram: mint.programAddress,
    })
  )[0];

  const authorityAta = (
    await findAssociatedTokenPda({
      owner: authority.address,
      mint: mint.address,
      tokenProgram: mint.programAddress,
    })
  )[0];

  return getWithdrawInstruction({
    authority,
    authorityAta,
    lendingPosition,
    mint: mint.address,
    tunaConfig,
    vault,
    vaultAta,
    tokenProgram: mint.programAddress,
    memoProgram: MEMO_PROGRAM_ADDRESS,
    funds,
    shares,
  });
}
