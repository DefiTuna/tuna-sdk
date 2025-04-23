import { Address, IInstruction, TransactionSigner } from "@solana/kit";
import { getSetLimitOrdersInstruction, getTunaPositionAddress, SetLimitOrdersInstructionDataArgs } from "../index.ts";

export async function setLimitOrdersOrcaInstruction(
  authority: TransactionSigner,
  args: SetLimitOrdersInstructionDataArgs,
  positionMint?: Address,
  tunaPositionAddress?: Address,
): Promise<IInstruction> {
  if (tunaPositionAddress === undefined) {
    if (positionMint === undefined) {
      throw new Error("At least one of 'positionMint' or 'tunaPositionAddress' must be provided.");
    }
    tunaPositionAddress = (await getTunaPositionAddress(positionMint))[0];
  }

  return getSetLimitOrdersInstruction({
    ...args,
    authority,
    tunaPosition: tunaPositionAddress,
  });
}
