import {
  getLendingVaultAddress,
  getTunaConfigAddress,
  getUpdateVaultInstruction,
  UpdateVaultInstructionDataArgs,
} from "../index.ts";
import { Address, IInstruction, TransactionSigner } from "@solana/kit";

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
