import {
  fetchAllMaybeTickArray,
  fetchMaybeFusionPool,
  FUSIONAMM_PROGRAM_ADDRESS,
  FusionPool,
  getInitializeTickArrayInstruction,
  getPositionAddress,
  getTickArrayAddress,
} from "@crypticdot/fusionamm-client";
import { getTickArrayStartTickIndex } from "@crypticdot/fusionamm-core";
import {
  type Account,
  AccountRole,
  Address,
  GetAccountInfoApi,
  GetMultipleAccountsApi,
  IAccountMeta,
  IInstruction,
  Rpc,
  TransactionSigner,
} from "@solana/kit";
import { MEMO_PROGRAM_ADDRESS } from "@solana-program/memo";
import {
  fetchAllMaybeMint,
  findAssociatedTokenPda,
  Mint,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";
import assert from "assert";

import {
  AccountsType,
  AddLiquidityFusionInstructionDataArgs,
  fetchAllVault,
  fetchMaybeTunaPosition,
  fetchTunaConfig,
  FusionUtils,
  getAddLiquidityFusionInstruction,
  getCreateAtaInstructions,
  getLendingVaultAddress,
  getMarketAddress,
  getTunaConfigAddress,
  getTunaPositionAddress,
  TunaConfig,
  TunaPosition,
  Vault,
} from "../index.ts";

export type AddLiquidityFusionInstructionArgs = Omit<AddLiquidityFusionInstructionDataArgs, "remainingAccountsInfo">;

export async function addLiquidityFusionInstructions(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  authority: TransactionSigner,
  positionMint: Address,
  args: AddLiquidityFusionInstructionArgs,
  createInstructions?: IInstruction[],
  cleanupInstructions?: IInstruction[],
): Promise<IInstruction[]> {
  const instructions: IInstruction[] = [];
  if (!createInstructions) createInstructions = instructions;
  if (!cleanupInstructions) cleanupInstructions = instructions;

  const tunaConfig = await fetchTunaConfig(rpc, (await getTunaConfigAddress())[0]);

  const tunaPosition = await fetchMaybeTunaPosition(rpc, (await getTunaPositionAddress(positionMint))[0]);
  if (!tunaPosition.exists) throw new Error("Tuna position account not found");

  const fusionPool = await fetchMaybeFusionPool(rpc, tunaPosition.data.pool);
  if (!fusionPool.exists) throw new Error("FusionPool account not found");

  const [vaultA, vaultB] = await fetchAllVault(rpc, [
    (await getLendingVaultAddress(fusionPool.data.tokenMintA))[0],
    (await getLendingVaultAddress(fusionPool.data.tokenMintB))[0],
  ]);

  const [mintA, mintB] = await fetchAllMaybeMint(rpc, [fusionPool.data.tokenMintA, fusionPool.data.tokenMintB]);
  assert(mintA.exists, "Token A not found");
  assert(mintB.exists, "Token B not found");

  //
  // Add create user's token account instructions if needed.
  //

  const createUserAtaAInstructions = await getCreateAtaInstructions(
    authority,
    mintA.address,
    authority.address,
    mintA.programAddress,
    args.collateralA,
  );
  createInstructions.push(...createUserAtaAInstructions.init);

  const createUserAtaBInstructions = await getCreateAtaInstructions(
    authority,
    mintB.address,
    authority.address,
    mintB.programAddress,
    args.collateralB,
  );
  createInstructions.push(...createUserAtaBInstructions.init);

  //
  // Add create fee recipient's token account instructions if needed.
  //

  const createFeeRecipientAtaAInstructions = await getCreateAtaInstructions(
    authority,
    mintA.address,
    tunaConfig.data.feeRecipient,
    mintA.programAddress,
  );
  createInstructions.push(...createFeeRecipientAtaAInstructions.init);

  const createFeeRecipientAtaBInstructions = await getCreateAtaInstructions(
    authority,
    mintB.address,
    tunaConfig.data.feeRecipient,
    mintB.programAddress,
  );
  createInstructions.push(...createFeeRecipientAtaBInstructions.init);

  //
  // Add create tick arrays instructions if needed.
  //
  const lowerTickArrayStartIndex = getTickArrayStartTickIndex(
    tunaPosition.data.tickLowerIndex,
    fusionPool.data.tickSpacing,
  );
  const [lowerTickArrayAddress] = await getTickArrayAddress(fusionPool.address, lowerTickArrayStartIndex);

  const upperTickArrayStartIndex = getTickArrayStartTickIndex(
    tunaPosition.data.tickUpperIndex,
    fusionPool.data.tickSpacing,
  );
  const [upperTickArrayAddress] = await getTickArrayAddress(fusionPool.address, upperTickArrayStartIndex);

  const [lowerTickArray, upperTickArray] = await fetchAllMaybeTickArray(rpc, [
    lowerTickArrayAddress,
    upperTickArrayAddress,
  ]);

  // Create a tick array it doesn't exist.
  if (!lowerTickArray.exists) {
    instructions.push(
      getInitializeTickArrayInstruction({
        fusionPool: fusionPool.address,
        funder: authority,
        tickArray: lowerTickArrayAddress,
        startTickIndex: lowerTickArrayStartIndex,
      }),
    );
  }

  // Create a tick array it doesn't exist.
  if (!upperTickArray.exists && lowerTickArrayStartIndex !== upperTickArrayStartIndex) {
    instructions.push(
      getInitializeTickArrayInstruction({
        fusionPool: fusionPool.address,
        funder: authority,
        tickArray: upperTickArrayAddress,
        startTickIndex: upperTickArrayStartIndex,
      }),
    );
  }

  //
  // Finally add liquidity increase instruction.
  //

  const ix = await addLiquidityFusionInstruction(
    authority,
    tunaPosition,
    tunaConfig,
    mintA,
    mintB,
    vaultA,
    vaultB,
    fusionPool,
    args,
  );
  instructions.push(ix);

  //
  // Close WSOL accounts if needed.
  //

  cleanupInstructions.push(...createUserAtaAInstructions.cleanup);
  cleanupInstructions.push(...createUserAtaBInstructions.cleanup);
  cleanupInstructions.push(...createFeeRecipientAtaAInstructions.cleanup);
  cleanupInstructions.push(...createFeeRecipientAtaBInstructions.cleanup);

  return instructions;
}

export async function addLiquidityFusionInstruction(
  authority: TransactionSigner,
  tunaPosition: Account<TunaPosition>,
  tunaConfig: Account<TunaConfig>,
  mintA: Account<Mint>,
  mintB: Account<Mint>,
  vaultA: Account<Vault>,
  vaultB: Account<Vault>,
  fusionPool: Account<FusionPool>,
  args: AddLiquidityFusionInstructionArgs,
): Promise<IInstruction> {
  const positionMint = tunaPosition.data.positionMint;
  const tunaPositionAddress = (await getTunaPositionAddress(positionMint))[0];

  const marketAddress = (await getMarketAddress(fusionPool.address))[0];
  const fusionPositionAddress = (await getPositionAddress(positionMint))[0];

  const tunaPositionAta = (
    await findAssociatedTokenPda({
      owner: tunaPositionAddress,
      mint: positionMint,
      tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    })
  )[0];

  const tunaPositionOwnerAtaA = (
    await findAssociatedTokenPda({
      owner: authority.address,
      mint: mintA.address,
      tokenProgram: mintA.programAddress,
    })
  )[0];

  const tunaPositionOwnerAtaB = (
    await findAssociatedTokenPda({
      owner: authority.address,
      mint: mintB.address,
      tokenProgram: mintB.programAddress,
    })
  )[0];

  const tunaPositionAtaA = (
    await findAssociatedTokenPda({
      owner: tunaPositionAddress,
      mint: mintA.address,
      tokenProgram: mintA.programAddress,
    })
  )[0];

  const tunaPositionAtaB = (
    await findAssociatedTokenPda({
      owner: tunaPositionAddress,
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

  const ix = getAddLiquidityFusionInstruction({
    ...args,
    remainingAccountsInfo,
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
    tunaPositionOwnerAtaA,
    tunaPositionOwnerAtaB,
    fusionPosition: fusionPositionAddress,
    tunaPosition: tunaPositionAddress,
    feeRecipientAtaA,
    feeRecipientAtaB,
    fusionPool: fusionPool.address,
    tokenProgramA: mintA.programAddress,
    tokenProgramB: mintB.programAddress,
    memoProgram: MEMO_PROGRAM_ADDRESS,
    fusionammProgram: FUSIONAMM_PROGRAM_ADDRESS,
  });

  // @ts-expect-error don't worry about the error
  ix.accounts.push(...remainingAccounts);

  return ix;
}
