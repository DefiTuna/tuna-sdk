import { Address, IInstruction, TransactionSigner } from "@solana/kit";

import {
  getLendingPositionAddress,
  getLendingVaultAddress,
  getOpenLendingPositionInstruction,
  getTunaConfigAddress,
} from "../index.ts";

export async function openLendingPositionInstruction(
  authority: TransactionSigner,
  mintAddress: Address,
): Promise<IInstruction> {
  const tunaConfig = (await getTunaConfigAddress())[0];
  const vault = (await getLendingVaultAddress(mintAddress))[0];
  const lendingPosition = (await getLendingPositionAddress(authority.address, mintAddress))[0];

  return getOpenLendingPositionInstruction({
    lendingPosition,
    poolMint: mintAddress,
    vault,
    authority,
    tunaConfig,
  });
}
