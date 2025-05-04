import { Account, IInstruction, TransactionSigner } from "@solana/kit";
import { findAssociatedTokenPda, Mint } from "@solana-program/token-2022";
import {
  getCreateAtaInstruction,
  CreateVaultInstructionDataArgs,
  getCreateVaultInstruction,
  getLendingVaultAddress,
  getTunaConfigAddress,
} from "../index.ts";

export async function createVaultInstructions(
  authority: TransactionSigner,
  mint: Account<Mint>,
  args: CreateVaultInstructionDataArgs,
): Promise<IInstruction[]> {
  const tunaConfig = (await getTunaConfigAddress())[0];

  const vault = (await getLendingVaultAddress(mint.address))[0];
  const vaultAta = (
    await findAssociatedTokenPda({
      owner: vault,
      mint: mint.address,
      tokenProgram: mint.programAddress,
    })
  )[0];

  return [
    await getCreateAtaInstruction(mint.address, vault, authority, mint.programAddress),
    getCreateVaultInstruction({
      authority,
      mint: mint.address,
      tunaConfig,
      vault,
      vaultAta,
      tokenProgram: mint.programAddress,
      ...args,
    }),
  ];
}
