import { Account, Address, IInstruction, TransactionSigner } from "@solana/kit";
import { findAssociatedTokenPda, Mint } from "@solana-program/token-2022";

import {
  CreateVaultV2InstructionDataArgs,
  getCreateAtaInstruction,
  getCreateVaultV2Instruction,
  getTunaConfigAddress,
} from "../index.ts";

export async function createVaultV2Instructions(
  authority: TransactionSigner,
  vault: Address,
  mint: Account<Mint>,
  args: CreateVaultV2InstructionDataArgs,
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
    getCreateVaultV2Instruction({
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
