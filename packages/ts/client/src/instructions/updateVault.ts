import { Address, IInstruction, TransactionSigner } from "@solana/kit";
import {
  getLendingVaultAddress,
  getTunaConfigAddress,
  getUpdateVaultInstruction,
  UpdateVaultInstructionDataArgs,
} from "../index.ts";

export async function updateVaultInstruction(
  authority: TransactionSigner,
  mint: Address,
  args: UpdateVaultInstructionDataArgs,
): Promise<IInstruction> {
  const tunaConfig = (await getTunaConfigAddress())[0];
  const vault = (await getLendingVaultAddress(mint))[0];

  return getUpdateVaultInstruction({
    authority,
    tunaConfig,
    vault,
    ...args,
  });
}
