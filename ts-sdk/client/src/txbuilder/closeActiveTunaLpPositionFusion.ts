import {
  fetchMaybeFusionPool,
  fetchPosition,
  FUSIONAMM_PROGRAM_ADDRESS,
  getPositionAddress,
} from "@crypticdot/fusionamm-client";
import {
  Address,
  GetAccountInfoApi,
  GetMultipleAccountsApi,
  IInstruction,
  type OptionOrNullable,
  Rpc,
  TransactionSigner,
} from "@solana/kit";
import { fetchAllMaybeMint, findAssociatedTokenPda, TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import assert from "assert";

import {
  decreaseTunaLpPositionFusionInstruction,
  fetchAllVault,
  fetchMaybeTunaLpPosition,
  getCloseTunaLpPositionFusionInstruction,
  getCreateAtaInstructions,
  getLendingVaultAddress,
  getTunaLpPositionAddress,
  HUNDRED_PERCENT,
  PoolToken,
} from "../index.ts";

export type CloseActiveTunaLpPositionInstructionArgs = {
  swapToToken: OptionOrNullable<PoolToken>;
  maxAmountSlippage: number;
  maxSwapSlippage: number;
};

export async function closeActiveTunaLpPositionFusionInstructions(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  authority: TransactionSigner,
  positionMint: Address,
  args: CloseActiveTunaLpPositionInstructionArgs,
): Promise<IInstruction[]> {
  const tunaPosition = await fetchMaybeTunaLpPosition(rpc, (await getTunaLpPositionAddress(positionMint))[0]);
  if (!tunaPosition.exists) throw new Error("Tuna position account not found");

  const fusionPosition = await fetchPosition(rpc, (await getPositionAddress(positionMint))[0]);

  const fusionPool = await fetchMaybeFusionPool(rpc, tunaPosition.data.pool);
  if (!fusionPool.exists) throw new Error("Whirlpool account not found");

  const [vaultA, vaultB] = await fetchAllVault(rpc, [
    (await getLendingVaultAddress(fusionPool.data.tokenMintA))[0],
    (await getLendingVaultAddress(fusionPool.data.tokenMintB))[0],
  ]);

  const [mintA, mintB] = await fetchAllMaybeMint(rpc, [fusionPool.data.tokenMintA, fusionPool.data.tokenMintB]);
  const allMints = [mintA, mintB];

  assert(mintA.exists, "Token A account not found");
  assert(mintB.exists, "Token B account not found");

  const tunaPositionAta = (
    await findAssociatedTokenPda({
      owner: tunaPosition.address,
      mint: positionMint,
      tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    })
  )[0];

  const tunaPositionAtaA = (
    await findAssociatedTokenPda({
      owner: tunaPosition.address,
      mint: mintA.address,
      tokenProgram: mintA.programAddress,
    })
  )[0];

  const tunaPositionAtaB = (
    await findAssociatedTokenPda({
      owner: tunaPosition.address,
      mint: mintB.address,
      tokenProgram: mintB.programAddress,
    })
  )[0];

  //
  // Collect the list of instructions.
  //

  const instructions: IInstruction[] = [];
  const cleanupInstructions: IInstruction[] = [];

  //
  // Add token account creation instructions for every mint if needed.
  //

  for (const mint of allMints) {
    assert(mint.exists);
    const ixs = await getCreateAtaInstructions(rpc, authority, mint.address, authority.address, mint.programAddress);
    instructions.push(...ixs.init);
    cleanupInstructions.push(...ixs.cleanup);
  }

  // Add liquidity decrease instruction.
  instructions.push(
    await decreaseTunaLpPositionFusionInstruction(
      authority,
      tunaPosition,
      mintA,
      mintB,
      vaultA,
      vaultB,
      fusionPool,
      // TODO: Compute minRemovedAmounts according to slippage
      {
        ...args,
        minRemovedAmountA: 0,
        minRemovedAmountB: 0,
        decreasePercent: HUNDRED_PERCENT,
      },
    ),
  );

  // Close WSOL accounts if needed.
  instructions.push(...cleanupInstructions);

  // Add close position instruction.
  instructions.push(
    getCloseTunaLpPositionFusionInstruction({
      mintA: mintA.address,
      mintB: mintB.address,
      authority,
      tunaPositionMint: positionMint,
      tunaPositionAta,
      tunaPositionAtaA,
      tunaPositionAtaB,
      fusionPosition: fusionPosition.address,
      tunaPosition: tunaPosition.address,
      fusionammProgram: FUSIONAMM_PROGRAM_ADDRESS,
      tokenProgramA: mintA.programAddress,
      tokenProgramB: mintB.programAddress,
      token2022Program: TOKEN_2022_PROGRAM_ADDRESS,
    }),
  );

  return instructions;
}
