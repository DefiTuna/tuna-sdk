import { Address, IInstruction, TransactionSigner } from "@solana/kit";

import { getTunaConfigAddress, getUpdateVaultInstruction, UpdateVaultInstructionDataArgs } from "../index.ts";

export async function updateVaultInstruction(
  authority: TransactionSigner,
  vault: Address,
  args: UpdateVaultInstructionDataArgs,
): Promise<IInstruction> {
  const tunaConfig = (await getTunaConfigAddress())[0];

  return getUpdateVaultInstruction({
    authority,
    tunaConfig,
    vault,
    ...args,
  });
}
