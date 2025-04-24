import { Address, IInstruction, TransactionSigner } from "@solana/kit";
import { getCreateTunaConfigInstruction, getTunaConfigAddress } from "../index.ts";

export async function createTunaConfigInstruction(
  authority: TransactionSigner,
  adminAuthority: Address,
  feeRecipient: Address,
  liquidatorAuthority: Address,
  ownerAuthority: Address,
): Promise<IInstruction> {
  const tunaConfigAddress = await getTunaConfigAddress();

  return getCreateTunaConfigInstruction({
    adminAuthority,
    authority,
    feeRecipient,
    liquidatorAuthority,
    ownerAuthority,
    tunaConfig: tunaConfigAddress[0],
  });
}
