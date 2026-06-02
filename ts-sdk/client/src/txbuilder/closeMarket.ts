import { Address, GetAccountInfoApi, GetMultipleAccountsApi, IInstruction, Rpc, TransactionSigner } from "@solana/kit";
import { getDeactivateLookupTableInstruction } from "@solana-program/address-lookup-table";

import { fetchMarket, getCloseMarketInstruction, getMarketAddress, getTunaConfigAddress } from "../index.ts";

export async function closeMarketInstructions(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  authority: TransactionSigner,
  poolAddress: Address,
  deactivateLookupTable: boolean,
): Promise<IInstruction[]> {
  const tunaConfig = (await getTunaConfigAddress())[0];
  const marketAddress = (await getMarketAddress(poolAddress))[0];
  const market = await fetchMarket(rpc, marketAddress);

  const instructions: IInstruction[] = [];

  if (deactivateLookupTable) {
    instructions.push(
      getDeactivateLookupTableInstruction({
        authority,
        address: market.data.addressLookupTable,
      }),
    );
  }

  instructions.push(
    getCloseMarketInstruction({
      authority,
      tunaConfig,
      market: marketAddress,
      vaultA: market.data.vaultA,
      vaultB: market.data.vaultB,
    }),
  );

  return instructions;
}
