import { Address, IInstruction, TransactionSigner } from "@solana/kit";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";

export async function createAtaInstruction(
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
