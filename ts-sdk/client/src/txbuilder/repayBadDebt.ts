import { Address, GetAccountInfoApi, GetMultipleAccountsApi, IInstruction, Rpc, TransactionSigner } from "@solana/kit";
import { MEMO_PROGRAM_ADDRESS } from "@solana-program/memo";
import { fetchMaybeMint, findAssociatedTokenPda } from "@solana-program/token-2022";

import { fetchMaybeVault, getRepayBadDebtInstruction } from "../index.ts";

export async function repayBadDebtInstruction(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  authority: TransactionSigner,
  vaultAddress: Address,
  funds: bigint,
  shares: bigint,
): Promise<IInstruction> {
  const vault = await fetchMaybeVault(rpc, vaultAddress);
  if (!vault.exists) throw new Error("Vault account not found");

  const mint = await fetchMaybeMint(rpc, vault.data.mint);
  if (!mint.exists) throw new Error("Mint account not found");

  const vaultAta = (
    await findAssociatedTokenPda({
      owner: vault.address,
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
    vault: vault.address,
    tokenProgram: mint.programAddress,
    memoProgram: MEMO_PROGRAM_ADDRESS,
    funds,
    shares,
  });
}
