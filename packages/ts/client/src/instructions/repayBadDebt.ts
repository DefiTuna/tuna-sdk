import { getLendingVaultAddress, getRepayBadDebtInstruction, getTunaConfigAddress } from "../index.ts";
import { Address, IInstruction, TransactionSigner } from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token-2022";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";

export async function repayBadDebtInstruction(
  authority: TransactionSigner,
  mint: Address,
  funds: bigint,
  shares: bigint,
): Promise<IInstruction> {
  const tunaConfig = (await getTunaConfigAddress())[0];
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

  return getRepayBadDebtInstruction({
    authorityAta,
    vaultAta,
    authority,
    tunaConfig,
    vault,
    funds,
    shares,
  });
}
