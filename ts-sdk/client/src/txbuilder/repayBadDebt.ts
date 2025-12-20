import { Address, GetAccountInfoApi, GetMultipleAccountsApi, IInstruction, Rpc, TransactionSigner } from "@solana/kit";
import { MEMO_PROGRAM_ADDRESS } from "@solana-program/memo";
import { fetchMaybeMint, findAssociatedTokenPda } from "@solana-program/token-2022";

import { getLendingVaultAddress, getRepayBadDebtInstruction } from "../index.ts";

export async function repayBadDebtInstruction(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  authority: TransactionSigner,
  mintAddress: Address,
  funds: bigint,
  shares: bigint,
): Promise<IInstruction> {
  const mint = await fetchMaybeMint(rpc, mintAddress);
  if (!mint.exists) throw new Error("Mint account not found");

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
    vault,
    tokenProgram: mint.programAddress,
    memoProgram: MEMO_PROGRAM_ADDRESS,
    funds,
    shares,
  });
}
