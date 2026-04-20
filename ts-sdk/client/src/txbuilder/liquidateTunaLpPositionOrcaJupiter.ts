import { JUPITER_PROGRAM_ADDRESS } from "@crypticdot/jupiter-solana-client";
import { getPositionAddress, Whirlpool, WHIRLPOOL_PROGRAM_ADDRESS } from "@orca-so/whirlpools-client";
import { type Account, AccountRole, IAccountMeta, IInstruction, TransactionSigner } from "@solana/kit";
import { MEMO_PROGRAM_ADDRESS } from "@solana-program/memo";
import { findAssociatedTokenPda, Mint, TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";

import {
  AccountsType,
  getCreateAtaInstructions,
  getLiquidateTunaLpPositionOrcaJupiterInstruction,
  getMarketAddress,
  LiquidateTunaLpPositionOrcaJupiterInstructionDataArgs,
  OrcaUtils,
  TunaConfig,
  TunaLpPosition,
  Vault,
} from "../index.ts";

export type LiquidateTunaLpPositionOrcaJupiterInstructionsArgs = Omit<
  LiquidateTunaLpPositionOrcaJupiterInstructionDataArgs,
  "remainingAccountsInfo"
>;

export async function liquidateTunaLpPositionOrcaJupiterInstructions(
  authority: TransactionSigner,
  tunaPosition: Account<TunaLpPosition>,
  tunaConfig: Account<TunaConfig>,
  mintA: Account<Mint>,
  mintB: Account<Mint>,
  vaultA: Account<Vault>,
  vaultB: Account<Vault>,
  whirlpool: Account<Whirlpool>,
  jupiterRouteAccounts: IAccountMeta[],
  intermediateTokenAccountsAndPrograms: IAccountMeta[],
  args: LiquidateTunaLpPositionOrcaJupiterInstructionsArgs,
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

  const ix = await liquidateTunaLpPositionOrcaJupiterInstruction(
    authority,
    tunaPosition,
    tunaConfig,
    mintA,
    mintB,
    vaultA,
    vaultB,
    whirlpool,
    jupiterRouteAccounts,
    intermediateTokenAccountsAndPrograms,
    args,
  );
  instructions.push(ix);

  //
  // Close WSOL accounts if needed.
  //

  instructions.push(...createFeeRecipientAtaAInstructions.cleanup);
  instructions.push(...createFeeRecipientAtaBInstructions.cleanup);

  return instructions;
}

export async function liquidateTunaLpPositionOrcaJupiterInstruction(
  authority: TransactionSigner,
  tunaPosition: Account<TunaLpPosition>,
  tunaConfig: Account<TunaConfig>,
  mintA: Account<Mint>,
  mintB: Account<Mint>,
  vaultA: Account<Vault>,
  vaultB: Account<Vault>,
  whirlpool: Account<Whirlpool>,
  jupiterRouteAccounts: IAccountMeta[],
  intermediateTokenAccountsAndPrograms: IAccountMeta[],
  args: LiquidateTunaLpPositionOrcaJupiterInstructionsArgs,
): Promise<IInstruction> {
  const positionMint = tunaPosition.data.positionMint;

  const marketAddress = (await getMarketAddress(whirlpool.address))[0];
  const orcaPositionAddress = (await getPositionAddress(positionMint))[0];

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

  const lowerTickArrayAddress = await OrcaUtils.getTickArrayAddressFromTickIndex(
    whirlpool,
    tunaPosition.data.tickLowerIndex,
  );
  const upperTickArrayAddress = await OrcaUtils.getTickArrayAddressFromTickIndex(
    whirlpool,
    tunaPosition.data.tickUpperIndex,
  );

  const remainingAccountsInfo = {
    slices: [
      { accountsType: AccountsType.TickArrayLower, length: 1 },
      { accountsType: AccountsType.TickArrayUpper, length: 1 },
      { accountsType: AccountsType.PoolVaultTokenA, length: 1 },
      { accountsType: AccountsType.PoolVaultTokenB, length: 1 },
      { accountsType: AccountsType.JupiterRoute, length: jupiterRouteAccounts.length },
    ],
  };

  if (intermediateTokenAccountsAndPrograms.length > 0) {
    remainingAccountsInfo.slices.push({
      accountsType: AccountsType.JupiterIntermediateTokenAccounts,
      length: intermediateTokenAccountsAndPrograms.length,
    });
  }

  const remainingAccounts: IAccountMeta[] = [
    { address: lowerTickArrayAddress, role: AccountRole.WRITABLE },
    { address: upperTickArrayAddress, role: AccountRole.WRITABLE },
    { address: whirlpool.data.tokenVaultA, role: AccountRole.WRITABLE },
    { address: whirlpool.data.tokenVaultB, role: AccountRole.WRITABLE },
    ...jupiterRouteAccounts,
    ...intermediateTokenAccountsAndPrograms,
  ];

  const ix = getLiquidateTunaLpPositionOrcaJupiterInstruction({
    market: marketAddress,
    mintA: mintA.address,
    mintB: mintB.address,
    oraclePriceUpdateA: vaultA.data.oraclePriceUpdate,
    oraclePriceUpdateB: vaultB.data.oraclePriceUpdate,
    vaultA: vaultA.address,
    vaultAAta,
    vaultB: vaultB.address,
    vaultBAta,
    authority,
    tunaConfig: tunaConfig.address,
    tunaPositionAta,
    tunaPositionAtaA,
    tunaPositionAtaB,
    orcaPosition: orcaPositionAddress,
    tunaPosition: tunaPosition.address,
    feeRecipientAtaA,
    feeRecipientAtaB,
    whirlpool: whirlpool.address,
    whirlpoolProgram: WHIRLPOOL_PROGRAM_ADDRESS,
    tokenProgramA: mintA.programAddress,
    tokenProgramB: mintB.programAddress,
    jupiterProgram: JUPITER_PROGRAM_ADDRESS,
    memoProgram: MEMO_PROGRAM_ADDRESS,
    ...args,
    remainingAccountsInfo,
  });

  // @ts-expect-error don't worry about the error
  ix.accounts.push(...remainingAccounts);

  return ix;
}
