import { Address, IInstruction, TransactionSigner } from "@solana/kit";
import { ASSOCIATED_TOKEN_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import {
  getOpenLendingPositionInstruction,
  getLendingPositionAddress,
  getLendingVaultAddress,
  getTunaConfigAddress,
} from "../index.ts";

export async function openLendingPositionInstruction(
  authority: TransactionSigner,
  mint: Address,
): Promise<IInstruction> {
  const tunaConfig = (await getTunaConfigAddress())[0];
  const vault = (await getLendingVaultAddress(mint))[0];
  const lendingPosition = (await getLendingPositionAddress(authority.address, mint))[0];

  return getOpenLendingPositionInstruction({
    lendingPosition,
    poolMint: mint,
    vault,
    authority,
    tunaConfig,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  });
}
