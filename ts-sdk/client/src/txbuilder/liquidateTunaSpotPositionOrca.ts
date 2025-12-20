import { getOracleAddress, Whirlpool, WHIRLPOOL_PROGRAM_ADDRESS } from "@orca-so/whirlpools-client";
import { type Account, AccountRole, IAccountMeta, IInstruction, TransactionSigner } from "@solana/kit";
import { MEMO_PROGRAM_ADDRESS } from "@solana-program/memo";
import { findAssociatedTokenPda, Mint } from "@solana-program/token-2022";

import {
  AccountsType,
  getCreateAtaInstructions,
  getLiquidateTunaSpotPositionOrcaInstruction,
  getMarketAddress,
  HUNDRED_PERCENT,
  NATIVE_MINT,
  OrcaUtils,
  PoolToken,
  TunaConfig,
  TunaSpotPosition,
  Vault,
} from "../index.ts";

export async function liquidateTunaSpotPositionOrcaInstructions(
  authority: TransactionSigner,
  tunaPosition: Account<TunaSpotPosition>,
  tunaConfig: Account<TunaConfig>,
  mintA: Account<Mint>,
  mintB: Account<Mint>,
  vaultA: Account<Vault>,
  vaultB: Account<Vault>,
  whirlpool: Account<Whirlpool>,
  decreasePercent: number,
): Promise<IInstruction[]> {
  const instructions: IInstruction[] = [];

  //
  // Add create position owner token account instructions.
  //

  const collateralTokenMint = tunaPosition.data.collateralToken == PoolToken.A ? mintA : mintB;

  // Native SOL is used when the position is totally liquidated.
  const useNativeSol = collateralTokenMint.address == NATIVE_MINT && decreasePercent == HUNDRED_PERCENT;

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

  const ix = await liquidateTunaSpotPositionOrcaInstruction(
    authority,
    tunaPosition,
    tunaConfig,
    mintA,
    mintB,
    vaultA,
    vaultB,
    whirlpool,
    decreasePercent,
  );
  instructions.push(ix);

  return instructions;
}

export async function liquidateTunaSpotPositionOrcaInstruction(
  authority: TransactionSigner,
  tunaPosition: Account<TunaSpotPosition>,
  tunaConfig: Account<TunaConfig>,
  mintA: Account<Mint>,
  mintB: Account<Mint>,
  vaultA: Account<Vault>,
  vaultB: Account<Vault>,
  whirlpool: Account<Whirlpool>,
  decreasePercent: number,
): Promise<IInstruction> {
  const marketAddress = (await getMarketAddress(whirlpool.address))[0];
  const orcaOracleAddress = (await getOracleAddress(whirlpool.address))[0];

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

  const swapTickArrays = await OrcaUtils.getSwapTickArrayAddresses(whirlpool);

  const remainingAccounts: IAccountMeta[] = [
    { address: swapTickArrays[0], role: AccountRole.WRITABLE },
    { address: swapTickArrays[1], role: AccountRole.WRITABLE },
    { address: swapTickArrays[2], role: AccountRole.WRITABLE },
    { address: swapTickArrays[3], role: AccountRole.WRITABLE },
    { address: swapTickArrays[4], role: AccountRole.WRITABLE },
    { address: whirlpool.data.tokenVaultA, role: AccountRole.WRITABLE },
    { address: whirlpool.data.tokenVaultB, role: AccountRole.WRITABLE },
    { address: orcaOracleAddress, role: AccountRole.WRITABLE },
  ];

  const remainingAccountsInfo = {
    slices: [
      { accountsType: AccountsType.SwapTickArrays, length: 5 },
      { accountsType: AccountsType.PoolVaultTokenA, length: 1 },
      { accountsType: AccountsType.PoolVaultTokenB, length: 1 },
      { accountsType: AccountsType.WhirlpoolOracle, length: 1 },
    ],
  };

  const ix = getLiquidateTunaSpotPositionOrcaInstruction({
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
    whirlpool: whirlpool.address,
    whirlpoolProgram: WHIRLPOOL_PROGRAM_ADDRESS,
    memoProgram: MEMO_PROGRAM_ADDRESS,
    decreasePercent,
    remainingAccountsInfo,
  });

  // @ts-expect-error don't worry about the error
  ix.accounts.push(...remainingAccounts);

  return ix;
}
