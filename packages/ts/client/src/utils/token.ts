import { address, Address, IInstruction, TransactionSigner } from "@solana/kit";
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  getCloseAccountInstruction,
  getCreateAssociatedTokenIdempotentInstruction,
  getSyncNativeInstruction,
} from "@solana-program/token-2022";
import { getTransferSolInstruction } from "@solana-program/system";

export const NATIVE_MINT = address("So11111111111111111111111111111111111111112");

export async function getCreateAtaInstruction(
  mint: Address,
  owner: Address,
  payer: TransactionSigner,
  tokenProgram: Address = TOKEN_PROGRAM_ADDRESS,
): Promise<IInstruction> {
  const ata = (
    await findAssociatedTokenPda({
      mint,
      owner,
      tokenProgram,
    })
  )[0];

  return getCreateAssociatedTokenIdempotentInstruction({
    mint,
    owner,
    ata,
    payer,
    tokenProgram,
  });
}

export async function getCreateAtaInstructions(
  payer: TransactionSigner,
  mint: Address,
  owner: Address,
  tokenProgram: Address = TOKEN_PROGRAM_ADDRESS,
  amount?: bigint | number,
): Promise<{ init: IInstruction[]; cleanup: IInstruction[] }> {
  const init: IInstruction[] = [];
  const cleanup: IInstruction[] = [];

  const ata = (await findAssociatedTokenPda({ mint, owner, tokenProgram }))[0];
  init.push(getCreateAssociatedTokenIdempotentInstruction({ payer, ata, mint, owner, tokenProgram }));

  if (mint == NATIVE_MINT) {
    if (amount && amount > 0) {
      init.push(getTransferSolInstruction({ source: payer, destination: ata, amount }));
      init.push(getSyncNativeInstruction({ account: ata }, { programAddress: tokenProgram }));
    }

    if (owner == payer.address) {
      cleanup.push(
        getCloseAccountInstruction(
          { account: ata, destination: payer.address, owner },
          { programAddress: tokenProgram },
        ),
      );
    }
  }

  return { init, cleanup };
}
