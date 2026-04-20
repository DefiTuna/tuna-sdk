import { IInstruction, TransactionSigner } from "@solana/kit";

import { getCreateReferralInstruction, getReferralAddress } from "../index.ts";

export async function createReferralInstruction(
  authority: TransactionSigner,
  referralId: number,
): Promise<IInstruction> {
  const referral = (await getReferralAddress(authority.address))[0];

  return getCreateReferralInstruction({
    authority,
    referral,
    referralId,
  });
}
