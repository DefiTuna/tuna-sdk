import { Address, IInstruction, TransactionSigner } from "@solana/kit";

import {
  getSetTunaSpotPositionLimitOrdersInstruction,
  getTunaSpotPositionAddress,
  SetTunaSpotPositionLimitOrdersInstructionDataArgs,
} from "../index.ts";

export async function setTunaSpotPositionLimitOrdersInstruction(
  authority: TransactionSigner,
  poolAddress: Address,
  args: SetTunaSpotPositionLimitOrdersInstructionDataArgs,
): Promise<IInstruction> {
  const tunaPositionAddress = (await getTunaSpotPositionAddress(authority.address, poolAddress))[0];

  return getSetTunaSpotPositionLimitOrdersInstruction({
    ...args,
    authority,
    tunaPosition: tunaPositionAddress,
  });
}
