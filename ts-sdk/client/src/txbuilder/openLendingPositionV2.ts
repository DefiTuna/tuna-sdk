import { Address, IInstruction, TransactionSigner } from "@solana/kit";

import { getLendingPositionAddress, getOpenLendingPositionV2Instruction } from "../index.ts";

export async function openLendingPositionV2Instruction(
  authority: TransactionSigner,
  mint: Address,
  vault: Address,
): Promise<IInstruction> {
  const lendingPosition = (await getLendingPositionAddress(authority.address, vault))[0];

  return getOpenLendingPositionV2Instruction({
    authority,
    lendingPosition,
    mint,
    vault,
  });
}
