import { FUSIONAMM_PROGRAM_ADDRESS, FusionPool, getPositionAddress } from "@crypticdot/fusionamm-client";
import { type Account, AccountRole, IAccountMeta, IInstruction, TransactionSigner } from "@solana/kit";
import { MEMO_PROGRAM_ADDRESS } from "@solana-program/memo";
import { findAssociatedTokenPda, Mint, TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";

import {
  AccountsType,
  FusionUtils,
  getCreateAtaInstructions,
  getLiquidatePositionFusionInstruction,
  getMarketAddress,
  TunaConfig,
  TunaPosition,
  Vault,
} from "../index.ts";

export async function liquidatePositionFusionInstructions(
  authority: TransactionSigner,
  tunaPosition: Account<TunaPosition>,
  tunaConfig: Account<TunaConfig>,
  mintA: Account<Mint>,
  mintB: Account<Mint>,
  vaultA: Account<Vault>,
  vaultB: Account<Vault>,
  whirlpool: Account<FusionPool>,
  withdrawPercent: number,
): Promise<IInstruction[]> {
  const instructions: IInstruction[] = [];

  //
  // Add create fee recipient's token account instructions if needed.
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
  // Finally add liquidity decrease instruction.
  //

  const ix = await liquidatePositionFusionInstruction(
    authority,
    tunaPosition,
    tunaConfig,
    mintA,
    mintB,
    vaultA,
    vaultB,
    whirlpool,
    withdrawPercent,
  );
  instructions.push(ix);

  //
  // Close WSOL accounts if needed.
  //

  instructions.push(...createFeeRecipientAtaAInstructions.cleanup);
  instructions.push(...createFeeRecipientAtaBInstructions.cleanup);

  return instructions;
}

export async function liquidatePositionFusionInstruction(
  authority: TransactionSigner,
  tunaPosition: Account<TunaPosition>,
  tunaConfig: Account<TunaConfig>,
  mintA: Account<Mint>,
  mintB: Account<Mint>,
  vaultA: Account<Vault>,
  vaultB: Account<Vault>,
  fusionPool: Account<FusionPool>,
  withdrawPercent: number,
): Promise<IInstruction> {
  const positionMint = tunaPosition.data.positionMint;

  const marketAddress = (await getMarketAddress(fusionPool.address))[0];
  const fusionPositionAddress = (await getPositionAddress(positionMint))[0];

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

  const swapTickArrays = await FusionUtils.getSwapTickArrayAddresses(fusionPool);

  const lowerTickArrayAddress = await FusionUtils.getTickArrayAddressFromTickIndex(
    fusionPool,
    tunaPosition.data.tickLowerIndex,
  );
  const upperTickArrayAddress = await FusionUtils.getTickArrayAddressFromTickIndex(
    fusionPool,
    tunaPosition.data.tickUpperIndex,
  );

  const remainingAccounts: IAccountMeta[] = [
    { address: swapTickArrays[0], role: AccountRole.WRITABLE },
    { address: swapTickArrays[1], role: AccountRole.WRITABLE },
    { address: swapTickArrays[2], role: AccountRole.WRITABLE },
    { address: swapTickArrays[3], role: AccountRole.WRITABLE },
    { address: swapTickArrays[4], role: AccountRole.WRITABLE },
    { address: lowerTickArrayAddress, role: AccountRole.WRITABLE },
    { address: upperTickArrayAddress, role: AccountRole.WRITABLE },
    { address: fusionPool.data.tokenVaultA, role: AccountRole.WRITABLE },
    { address: fusionPool.data.tokenVaultB, role: AccountRole.WRITABLE },
  ];

  const remainingAccountsInfo = {
    slices: [
      { accountsType: AccountsType.SwapTickArrays, length: 5 },
      { accountsType: AccountsType.TickArrayLower, length: 1 },
      { accountsType: AccountsType.TickArrayUpper, length: 1 },
      { accountsType: AccountsType.PoolVaultTokenA, length: 1 },
      { accountsType: AccountsType.PoolVaultTokenB, length: 1 },
    ],
  };

  const ix = getLiquidatePositionFusionInstruction({
    market: marketAddress,
    mintA: mintA.address,
    mintB: mintB.address,
    pythOraclePriceFeedA: vaultA.data.pythOraclePriceUpdate,
    pythOraclePriceFeedB: vaultB.data.pythOraclePriceUpdate,
    vaultA: vaultA.address,
    vaultAAta,
    vaultB: vaultB.address,
    vaultBAta,
    authority,
    tunaConfig: tunaConfig.address,
    tunaPositionAta,
    tunaPositionAtaA,
    tunaPositionAtaB,
    fusionPosition: fusionPositionAddress,
    tunaPosition: tunaPosition.address,
    feeRecipientAtaA,
    feeRecipientAtaB,
    fusionPool: fusionPool.address,
    fusionammProgram: FUSIONAMM_PROGRAM_ADDRESS,
    tokenProgramA: mintA.programAddress,
    tokenProgramB: mintB.programAddress,
    memoProgram: MEMO_PROGRAM_ADDRESS,
    withdrawPercent,
    remainingAccountsInfo,
  });

  // @ts-expect-error don't worry about the error
  ix.accounts.push(...remainingAccounts);

  return ix;
}
