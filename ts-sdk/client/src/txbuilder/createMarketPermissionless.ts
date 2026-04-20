import { Address, IInstruction, TransactionSigner } from "@solana/kit";

import {
  CreateMarketPermissionlessInstructionDataArgs,
  getCreateMarketPermissionlessInstruction,
  getMarketAddress,
  getTunaConfigAddress,
} from "../index.ts";

export async function createMarketPermissionlessInstruction(
  authority: TransactionSigner,
  pool: Address,
  vaultA: Address,
  vaultB: Address,
  args: CreateMarketPermissionlessInstructionDataArgs,
): Promise<IInstruction> {
  const tunaConfig = (await getTunaConfigAddress())[0];
  const marketAddress = (await getMarketAddress(pool))[0];

  return getCreateMarketPermissionlessInstruction({
    authority,
    tunaConfig,
    market: marketAddress,
    pool,
    vaultA,
    vaultB,
    ...args,
  });
}
