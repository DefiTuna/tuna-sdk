import { Address, IInstruction, TransactionSigner } from "@solana/kit";

import {
  getSetTunaLpPositionLimitOrdersInstruction,
  getTunaLpPositionAddress,
  SetTunaLpPositionLimitOrdersInstructionDataArgs,
} from "../index.ts";

export async function setTunaLpPositionLimitOrdersInstruction(
  authority: TransactionSigner,
  args: SetTunaLpPositionLimitOrdersInstructionDataArgs,
  positionMint?: Address,
  tunaPositionAddress?: Address,
): Promise<IInstruction> {
  if (tunaPositionAddress === undefined) {
    if (positionMint === undefined) {
      throw new Error("At least one of 'positionMint' or 'tunaPositionAddress' must be provided.");
    }
    tunaPositionAddress = (await getTunaLpPositionAddress(positionMint))[0];
  }

  return getSetTunaLpPositionLimitOrdersInstruction({
    ...args,
    authority,
    tunaPosition: tunaPositionAddress,
  });
}
