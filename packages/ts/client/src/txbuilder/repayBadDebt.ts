import { Account, IInstruction, TransactionSigner } from "@solana/kit";
import { MEMO_PROGRAM_ADDRESS } from "@solana-program/memo";
import { findAssociatedTokenPda, Mint } from "@solana-program/token-2022";

import { getLendingVaultAddress, getRepayBadDebtInstruction, getTunaConfigAddress } from "../index.ts";

export async function repayBadDebtInstruction(
  authority: TransactionSigner,
  mint: Account<Mint>,
  funds: bigint,
  shares: bigint,
): Promise<IInstruction> {
  const tunaConfig = (await getTunaConfigAddress())[0];
  const vault = (await getLendingVaultAddress(mint.address))[0];
  const vaultAta = (
    await findAssociatedTokenPda({
      owner: vault,
      mint: mint.address,
      tokenProgram: mint.programAddress,
    })
  )[0];
  const authorityAta = (
    await findAssociatedTokenPda({
      owner: authority.address,
      mint: mint.address,
      tokenProgram: mint.programAddress,
    })
  )[0];

  return getRepayBadDebtInstruction({
    authorityAta,
    mint: mint.address,
    vaultAta,
    authority,
    tunaConfig,
    vault,
    tokenProgram: mint.programAddress,
    memoProgram: MEMO_PROGRAM_ADDRESS,
    funds,
    shares,
  });
}
