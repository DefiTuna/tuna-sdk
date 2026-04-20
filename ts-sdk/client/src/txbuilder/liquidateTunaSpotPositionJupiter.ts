import { JUPITER_PROGRAM_ADDRESS } from "@crypticdot/jupiter-solana-client";
import { type Account, Address, IAccountMeta, IInstruction, TransactionSigner } from "@solana/kit";
import { MEMO_PROGRAM_ADDRESS } from "@solana-program/memo";
import { findAssociatedTokenPda, Mint } from "@solana-program/token-2022";

import {
  AccountsType,
  getCreateAtaInstructions,
  getLiquidateTunaSpotPositionJupiterInstruction,
  getMarketAddress,
  LiquidateTunaSpotPositionJupiterInstructionDataArgs,
  TunaConfig,
  TunaSpotPosition,
  Vault,
} from "../index.ts";

export type LiquidateTunaSpotPositionJupiterInstructionsArgs = Omit<
  LiquidateTunaSpotPositionJupiterInstructionDataArgs,
  "remainingAccountsInfo"
>;

export async function liquidateTunaSpotPositionJupiterInstructions(
  authority: TransactionSigner,
  tunaPosition: Account<TunaSpotPosition>,
  tunaConfig: Account<TunaConfig>,
  mintA: Account<Mint>,
  mintB: Account<Mint>,
  vaultA: Account<Vault>,
  vaultB: Account<Vault>,
  poolAddress: Address,
  jupiterRouteAccounts: IAccountMeta[],
  intermediateTokenAccountsAndPrograms: IAccountMeta[],
  args: LiquidateTunaSpotPositionJupiterInstructionsArgs,
): Promise<IInstruction[]> {
  const instructions: IInstruction[] = [];

  /*
  // Native SOL is used when the position is totally liquidated.
  const useNativeSol = collateralTokenMint.address == NATIVE_MINT && args.decreasePercent == HUNDRED_PERCENT;

  if (!useNativeSol) {
    const createPositionOwnerAtaInstructions = await getCreateAtaInstructions(
      undefined,
      authority,
      collateralTokenMint.address,
      tunaPosition.data.authority,
      collateralTokenMint.programAddress,
    );
    instructions.push(...createPositionOwnerAtaInstructions.init);
  }
*/

  //
  // Add create position owner token account instructions.
  //

  const createPositionOwnerAtaAInstructions = await getCreateAtaInstructions(
    undefined,
    authority,
    mintA.address,
    tunaPosition.data.authority,
    mintA.programAddress,
  );
  instructions.push(...createPositionOwnerAtaAInstructions.init);

  const createPositionOwnerAtaBInstructions = await getCreateAtaInstructions(
    undefined,
    authority,
    mintB.address,
    tunaPosition.data.authority,
    mintB.programAddress,
  );
  instructions.push(...createPositionOwnerAtaBInstructions.init);

  //
  // Add create fee recipient's token account instructions.
  //
  const createFeeRecipientAtaAInstructions = await getCreateAtaInstructions(
    undefined,
    authority,
    mintA.address,
    tunaConfig.data.feeRecipient,
    mintA.programAddress,
  );
  instructions.push(...createFeeRecipientAtaAInstructions.init);

  const createFeeRecipientAtaBInstructions = await getCreateAtaInstructions(
    undefined,
    authority,
    mintB.address,
    tunaConfig.data.feeRecipient,
    mintB.programAddress,
  );
  instructions.push(...createFeeRecipientAtaBInstructions.init);

  //
  // Finally add liquidity liquidate instruction.
  //

  const ix = await liquidateTunaSpotPositionJupiterInstruction(
    authority,
    tunaPosition,
    tunaConfig,
    mintA,
    mintB,
    vaultA,
    vaultB,
    poolAddress,
    jupiterRouteAccounts,
    intermediateTokenAccountsAndPrograms,
    args,
  );
  instructions.push(ix);

  return instructions;
}

export async function liquidateTunaSpotPositionJupiterInstruction(
  authority: TransactionSigner,
  tunaPosition: Account<TunaSpotPosition>,
  tunaConfig: Account<TunaConfig>,
  mintA: Account<Mint>,
  mintB: Account<Mint>,
  vaultA: Account<Vault>,
  vaultB: Account<Vault>,
  poolAddress: Address,
  jupiterRouteAccounts: IAccountMeta[],
  intermediateTokenAccountsAndPrograms: IAccountMeta[],
  args: LiquidateTunaSpotPositionJupiterInstructionsArgs,
): Promise<IInstruction> {
  const marketAddress = (await getMarketAddress(poolAddress))[0];

  const tunaPositionOwnerAtaA = (
    await findAssociatedTokenPda({
      owner: tunaPosition.data.authority,
      mint: mintA.address,
      tokenProgram: mintA.programAddress,
    })
  )[0];

  const tunaPositionOwnerAtaB = (
    await findAssociatedTokenPda({
      owner: tunaPosition.data.authority,
      mint: mintB.address,
      tokenProgram: mintB.programAddress,
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

  const feeRecipientAtaA = (
    await findAssociatedTokenPda({
      owner: tunaConfig.data.feeRecipient,
      mint: mintA.address,
      tokenProgram: mintA.programAddress,
    })
  )[0];

  const feeRecipientAtaB = (
    await findAssociatedTokenPda({
      owner: tunaConfig.data.feeRecipient,
      mint: mintB.address,
      tokenProgram: mintB.programAddress,
    })
  )[0];

  const vaultAAta = (
    await findAssociatedTokenPda({
      owner: vaultA.address,
      mint: mintA.address,
      tokenProgram: mintA.programAddress,
    })
  )[0];

  const vaultBAta = (
    await findAssociatedTokenPda({
      owner: vaultB.address,
      mint: mintB.address,
      tokenProgram: mintB.programAddress,
    })
  )[0];

  const remainingAccountsInfo = {
    slices: [{ accountsType: AccountsType.JupiterRoute, length: jupiterRouteAccounts.length }],
  };

  if (intermediateTokenAccountsAndPrograms.length > 0) {
    remainingAccountsInfo.slices.push({
      accountsType: AccountsType.JupiterIntermediateTokenAccounts,
      length: intermediateTokenAccountsAndPrograms.length,
    });
  }

  const remainingAccounts: IAccountMeta[] = [...jupiterRouteAccounts, ...intermediateTokenAccountsAndPrograms];

  const ix = getLiquidateTunaSpotPositionJupiterInstruction({
    authority,
    tunaConfig: tunaConfig.address,
    mintA: mintA.address,
    mintB: mintB.address,
    tokenProgramA: mintA.programAddress,
    tokenProgramB: mintB.programAddress,
    market: marketAddress,
    oraclePriceUpdateA: vaultA.data.oraclePriceUpdate,
    oraclePriceUpdateB: vaultB.data.oraclePriceUpdate,
    vaultA: vaultA.address,
    vaultAAta,
    vaultB: vaultB.address,
    vaultBAta,
    tunaPosition: tunaPosition.address,
    tunaPositionAtaA,
    tunaPositionAtaB,
    tunaPositionOwner: tunaPosition.data.authority,
    tunaPositionOwnerAtaA,
    tunaPositionOwnerAtaB,
    feeRecipientAtaA,
    feeRecipientAtaB,
    pool: poolAddress,
    jupiterProgram: JUPITER_PROGRAM_ADDRESS,
    memoProgram: MEMO_PROGRAM_ADDRESS,
    ...args,
    remainingAccountsInfo,
  });

  // @ts-expect-error don't worry about the error
  ix.accounts.push(...remainingAccounts);

  return ix;
}
