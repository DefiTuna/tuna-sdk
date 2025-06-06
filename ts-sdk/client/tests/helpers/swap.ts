import {
  type Address,
  GetAccountInfoApi,
  GetEpochInfoApi,
  GetMinimumBalanceForRentExemptionApi,
  GetMultipleAccountsApi,
  Rpc,
  TransactionSigner,
} from "@solana/kit";
import { fetchWhirlpool } from "@orca-so/whirlpools-client";
import { swapExactInputOrca } from "./orca.ts";
import { swapExactInputFusion } from "./fusion.ts";

export async function swapExactInput(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi & GetMinimumBalanceForRentExemptionApi & GetEpochInfoApi>,
  signer: TransactionSigner,
  pool: Address,
  inputAmount: bigint,
  mint: Address,
  slippageToleranceBps?: number | undefined,
) {
  try {
    await fetchWhirlpool(rpc, pool); // Will fail if it's a fusion pool
    return await swapExactInputOrca(rpc, signer, pool, inputAmount, mint, slippageToleranceBps);
  } catch {
    return await swapExactInputFusion(rpc, signer, pool, inputAmount, mint, slippageToleranceBps);
  }
}
