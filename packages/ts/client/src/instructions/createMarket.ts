import { Address, IInstruction, TransactionSigner } from "@solana/kit";
import {
  CreateMarketInstructionDataArgs,
  getCreateMarketInstruction,
  getMarketAddress,
  getTunaConfigAddress,
} from "../index.ts";

export async function createMarketInstruction(
  authority: TransactionSigner,
  pool: Address,
  args: CreateMarketInstructionDataArgs,
): Promise<IInstruction> {
  const tunaConfig = (await getTunaConfigAddress())[0];
  const marketAddress = (await getMarketAddress(pool))[0];

  return getCreateMarketInstruction({
    authority,
    tunaConfig,
    market: marketAddress,
    pool,
    ...args,
  });
}
