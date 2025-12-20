import { Address, IInstruction, TransactionSigner } from "@solana/kit";

import {
  CreateMarketV2InstructionDataArgs,
  getCreateMarketV2Instruction,
  getMarketAddress,
  getTunaConfigAddress,
} from "../index.ts";

export async function createMarketV2Instruction(
  authority: TransactionSigner,
  pool: Address,
  vaultA: Address,
  vaultB: Address,
  args: CreateMarketV2InstructionDataArgs,
): Promise<IInstruction> {
  const tunaConfig = (await getTunaConfigAddress())[0];
  const marketAddress = (await getMarketAddress(pool))[0];

  return getCreateMarketV2Instruction({
    authority,
    tunaConfig,
    market: marketAddress,
    pool,
    vaultA,
    vaultB,
    ...args,
  });
}
