import { FUSIONAMM_PROGRAM_ADDRESS, FusionPool } from "@crypticdot/fusionamm-client";
import { type Account, AccountRole, IAccountMeta, IInstruction, TransactionSigner } from "@solana/kit";
import { MEMO_PROGRAM_ADDRESS } from "@solana-program/memo";
import { findAssociatedTokenPda, Mint } from "@solana-program/token-2022";

import {
  AccountsType,
  FusionUtils,
  getCreateAtaInstructions,
  getLiquidateTunaSpotPositionFusionInstruction,
  getMarketAddress,
  NATIVE_MINT,
  PoolToken,
  TunaConfig,
  TunaSpotPosition,
  Vault,
} from "../index.ts";

export async function liquidateTunaSpotPositionFusionInstructions(
  authority: TransactionSigner,
  tunaPosition: Account<TunaSpotPosition>,
  tunaConfig: Account<TunaConfig>,
  mintA: Account<Mint>,
  mintB: Account<Mint>,
  vaultA: Account<Vault>,
  vaultB: Account<Vault>,
  fusionPool: Account<FusionPool>,
  createTunaPositionOwnerAta: boolean,
  withdrawPercent: number,
): Promise<IInstruction[]> {
  const instructions: IInstruction[] = [];

  //
  // Add create position owner token account instructions.
  // This is optional because it might be used by an attacker to drain the liquidator's wallet.
  //

  if (createTunaPositionOwnerAta) {
    const collateralTokenMint = tunaPosition.data.collateralToken == PoolToken.A ? mintA : mintB;
    if (collateralTokenMint.address != NATIVE_MINT) {
      const createPositionOwnerAtaInstructions = await getCreateAtaInstructions(
        undefined,
        authority,
        collateralTokenMint.address,
        tunaPosition.data.authority,
        collateralTokenMint.programAddress,
      );
      instructions.push(...createPositionOwnerAtaInstructions.init);
    }
  }

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

  const ix = await liquidateTunaSpotPositionFusionInstruction(
    authority,
    tunaPosition,
    tunaConfig,
    mintA,
    mintB,
    vaultA,
    vaultB,
    fusionPool,
    withdrawPercent,
  );
  instructions.push(ix);

  return instructions;
}

export async function liquidateTunaSpotPositionFusionInstruction(
  authority: TransactionSigner,
  tunaPosition: Account<TunaSpotPosition>,
  tunaConfig: Account<TunaConfig>,
  mintA: Account<Mint>,
  mintB: Account<Mint>,
  vaultA: Account<Vault>,
  vaultB: Account<Vault>,
  fusionPool: Account<FusionPool>,
  withdrawPercent: number,
): Promise<IInstruction> {
  const marketAddress = (await getMarketAddress(fusionPool.address))[0];

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

  const swapTickArrays = await FusionUtils.getSwapTickArrayAddresses(fusionPool);

  const remainingAccounts: IAccountMeta[] = [
    { address: swapTickArrays[0], role: AccountRole.WRITABLE },
    { address: swapTickArrays[1], role: AccountRole.WRITABLE },
    { address: swapTickArrays[2], role: AccountRole.WRITABLE },
    { address: swapTickArrays[3], role: AccountRole.WRITABLE },
    { address: swapTickArrays[4], role: AccountRole.WRITABLE },
    { address: fusionPool.data.tokenVaultA, role: AccountRole.WRITABLE },
    { address: fusionPool.data.tokenVaultB, role: AccountRole.WRITABLE },
  ];

  const remainingAccountsInfo = {
    slices: [
      { accountsType: AccountsType.SwapTickArrays, length: 5 },
      { accountsType: AccountsType.PoolVaultTokenA, length: 1 },
      { accountsType: AccountsType.PoolVaultTokenB, length: 1 },
    ],
  };

  const ix = getLiquidateTunaSpotPositionFusionInstruction({
    authority,
    tunaConfig: tunaConfig.address,
    mintA: mintA.address,
    mintB: mintB.address,
    tokenProgramA: mintA.programAddress,
    tokenProgramB: mintB.programAddress,
    market: marketAddress,
    pythOraclePriceFeedA: vaultA.data.pythOraclePriceUpdate,
    pythOraclePriceFeedB: vaultB.data.pythOraclePriceUpdate,
    vaultA: vaultA.address,
    vaultAAta,
    vaultB: vaultB.address,
    vaultBAta,
    tunaPosition: tunaPosition.address,
    tunaPositionAtaA,
    tunaPositionAtaB,
    tunaPositionOwner: tunaPosition.data.authority,
    tunaPositionOwnerAtaA:
      tunaPosition.data.collateralToken == PoolToken.A && mintA.address != NATIVE_MINT
        ? tunaPositionOwnerAtaA
        : undefined,
    tunaPositionOwnerAtaB:
      tunaPosition.data.collateralToken == PoolToken.B && mintB.address != NATIVE_MINT
        ? tunaPositionOwnerAtaB
        : undefined,
    feeRecipientAtaA,
    feeRecipientAtaB,
    fusionPool: fusionPool.address,
    fusionammProgram: FUSIONAMM_PROGRAM_ADDRESS,
    memoProgram: MEMO_PROGRAM_ADDRESS,
    withdrawPercent,
    remainingAccountsInfo,
  });

  // @ts-expect-error don't worry about the error
  ix.accounts.push(...remainingAccounts);

  return ix;
}
