import { Account, Address, IInstruction, TransactionSigner } from "@solana/kit";
import { findAssociatedTokenPda, Mint } from "@solana-program/token-2022";

import {
  CreateVaultPermissionlessInstructionDataArgs,
  getCreateAtaInstruction,
  getCreateVaultPermissionlessInstruction,
  getTunaConfigAddress,
} from "../index.ts";

export async function createVaultPermissionlessInstructions(
  authority: TransactionSigner,
  vault: Address,
  mint: Account<Mint>,
  args: CreateVaultPermissionlessInstructionDataArgs,
): Promise<IInstruction[]> {
  const tunaConfig = (await getTunaConfigAddress())[0];

  const vaultAta = (
    await findAssociatedTokenPda({
      owner: vault,
      mint: mint.address,
      tokenProgram: mint.programAddress,
    })
  )[0];

  return [
    await getCreateAtaInstruction(mint.address, vault, authority, mint.programAddress),
    getCreateVaultPermissionlessInstruction({
      authority,
      mint: mint.address,
      vault,
      tunaConfig,
      vaultAta,
      tokenProgram: mint.programAddress,
      ...args,
    }),
  ];
}
