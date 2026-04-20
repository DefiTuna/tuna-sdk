import { Address, IInstruction, TransactionSigner } from "@solana/kit";

import { getCreateTunaConfigInstruction, getTunaConfigAddress } from "../index.ts";

export async function createTunaConfigInstruction(
  authority: TransactionSigner,
  ownerAuthority: Address,
  adminAuthority: Address,
  liquidatorAuthority: Address,
  oraclePriceUpdateAuthority: Address,
  feeRecipient: Address,
): Promise<IInstruction> {
  const tunaConfigAddress = await getTunaConfigAddress();

  return getCreateTunaConfigInstruction({
    adminAuthority,
    authority,
    feeRecipient,
    liquidatorAuthority,
    oraclePriceUpdateAuthority,
    ownerAuthority,
    tunaConfig: tunaConfigAddress[0],
  });
}
