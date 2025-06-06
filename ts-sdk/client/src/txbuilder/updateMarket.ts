import { Address, IInstruction, TransactionSigner } from "@solana/kit";

import {
  getMarketAddress,
  getTunaConfigAddress,
  getUpdateMarketInstruction,
  UpdateMarketInstructionDataArgs,
} from "../index.ts";

export async function updateMarketInstruction(
  authority: TransactionSigner,
  pool: Address,
  args: UpdateMarketInstructionDataArgs,
): Promise<IInstruction> {
  const tunaConfig = (await getTunaConfigAddress())[0];
  const marketAddress = (await getMarketAddress(pool))[0];

  return getUpdateMarketInstruction({
    authority,
    tunaConfig,
    market: marketAddress,
    ...args,
  });
}
