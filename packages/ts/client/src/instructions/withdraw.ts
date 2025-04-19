import { Address, IInstruction, TransactionSigner } from "@solana/kit";
import {
  getLendingPositionAddress,
  getLendingVaultAddress,
  getTunaConfigAddress,
  getWithdrawInstruction,
} from "../index.ts";
import { ASSOCIATED_TOKEN_PROGRAM_ADDRESS, findAssociatedTokenPda } from "@solana-program/token-2022";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";

export async function withdrawInstruction(
  authority: TransactionSigner,
  mint: Address,
  funds: bigint,
  shares: bigint,
): Promise<IInstruction> {
  const tunaConfig = (await getTunaConfigAddress())[0];
  const lendingPosition = (await getLendingPositionAddress(authority.address, mint))[0];

  const vault = (await getLendingVaultAddress(mint))[0];
  const vaultAta = (
    await findAssociatedTokenPda({
      owner: vault,
      mint: mint,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
  )[0];

  const authorityAta = (
    await findAssociatedTokenPda({
      owner: authority.address,
      mint: mint,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
  )[0];

  return getWithdrawInstruction({
    authority,
    authorityAta,
    lendingPosition,
    mint,
    tunaConfig,
    vault,
    vaultAta,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    funds,
    shares,
  });
}
