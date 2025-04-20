import { Address, IInstruction, TransactionSigner } from "@solana/kit";
import { ASSOCIATED_TOKEN_PROGRAM_ADDRESS, findAssociatedTokenPda } from "@solana-program/token-2022";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  getCreateAtaInstruction,
  CreateVaultInstructionDataArgs,
  getCreateVaultInstruction,
  getLendingVaultAddress,
  getTunaConfigAddress,
} from "../index.ts";

export async function createVaultInstructions(
  authority: TransactionSigner,
  mint: Address,
  args: CreateVaultInstructionDataArgs,
): Promise<IInstruction[]> {
  const tunaConfig = (await getTunaConfigAddress())[0];

  const vault = (await getLendingVaultAddress(mint))[0];
  const vaultAta = (
    await findAssociatedTokenPda({
      owner: vault,
      mint: mint,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
  )[0];

  return [
    await getCreateAtaInstruction(mint, vault, authority, TOKEN_PROGRAM_ADDRESS),
    getCreateVaultInstruction({
      authority,
      mint,
      tunaConfig,
      vault,
      vaultAta,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
      ...args,
    }),
  ];
}
