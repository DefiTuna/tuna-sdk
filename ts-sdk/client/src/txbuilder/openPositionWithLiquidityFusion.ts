import {
  fetchAllMaybeTickArray,
  fetchMaybeFusionPool,
  FP_NFT_UPDATE_AUTH,
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
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  fetchAllMaybeMint,
  findAssociatedTokenPda,
  Mint,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";
import assert from "assert";

import {
  AccountsType,
  fetchAllVault,
  fetchMarket,
  fetchTunaConfig,
  FusionUtils,
  getCreateAtaInstructions,
  getLendingVaultAddress,
  getMarketAddress,
  getOpenPositionWithLiquidityFusionInstruction,
  getTunaConfigAddress,
  getTunaPositionAddress,
  OpenPositionWithLiquidityFusionInstructionDataArgs,
  TunaConfig,
  Vault,
} from "../index.ts";
import { getLiquidityIncreaseQuote } from "../utils";

export type OpenPositionWithLiquidityFusionInstructionsArgs = Omit<
  OpenPositionWithLiquidityFusionInstructionDataArgs,
  "remainingAccountsInfo" | "minAddedAmountA" | "minAddedAmountB"
> & { maxAmountSlippage: number };

export async function openPositionWithLiquidityFusionInstructions(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  authority: TransactionSigner,
  positionMint: TransactionSigner,
  fusionPoolAddress: Address,
  args: OpenPositionWithLiquidityFusionInstructionsArgs,
  createInstructions?: IInstruction[],
  cleanupInstructions?: IInstruction[],
): Promise<IInstruction[]> {
  const instructions: IInstruction[] = [];

  if (!createInstructions) createInstructions = instructions;
  if (!cleanupInstructions) cleanupInstructions = instructions;

  const tunaConfig = await fetchTunaConfig(rpc, (await getTunaConfigAddress())[0]);

  const fusionPool = await fetchMaybeFusionPool(rpc, fusionPoolAddress);
  if (!fusionPool.exists) throw new Error("FusionPool account not found");

  const marketAddress = (await getMarketAddress(fusionPoolAddress))[0];
  const market = await fetchMarket(rpc, marketAddress);

  const [mintA, mintB] = await fetchAllMaybeMint(rpc, [fusionPool.data.tokenMintA, fusionPool.data.tokenMintB]);
  assert(mintA.exists, "Token A account not found");
  assert(mintB.exists, "Token B account not found");

  const [vaultA, vaultB] = await fetchAllVault(rpc, [
    (await getLendingVaultAddress(fusionPool.data.tokenMintA))[0],
    (await getLendingVaultAddress(fusionPool.data.tokenMintB))[0],
  ]);

  const increaseAmounts = getLiquidityIncreaseQuote({
    collateralA: BigInt(args.collateralA),
    collateralB: BigInt(args.collateralB),
    borrowA: BigInt(args.borrowA),
    borrowB: BigInt(args.borrowB),
    maxAmountSlippage: args.maxAmountSlippage,
    sqrtPrice: fusionPool.data.sqrtPrice,
    tickLowerIndex: args.tickLowerIndex,
    tickUpperIndex: args.tickUpperIndex,
    protocolFeeRate: market.data.protocolFee,
    protocolFeeRateOnCollateral: market.data.protocolFeeOnCollateral,
    swapFeeRate: fusionPool.data.feeRate,
  });

  //
  // Add create user's token account instructions if needed.
  //

  const createUserAtaAInstructions = await getCreateAtaInstructions(
    rpc,
    authority,
    mintA.address,
    authority.address,
    mintA.programAddress,
    increaseAmounts.maxCollateralA,
  );
  createInstructions.push(...createUserAtaAInstructions.init);

  const createUserAtaBInstructions = await getCreateAtaInstructions(
    rpc,
    authority,
    mintB.address,
    authority.address,
    mintB.programAddress,
    increaseAmounts.maxCollateralB,
  );
  createInstructions.push(...createUserAtaBInstructions.init);

  //
  // Add create fee recipient's token account instructions if needed.
  //

  const createFeeRecipientAtaAInstructions = await getCreateAtaInstructions(
    rpc,
    authority,
    mintA.address,
    tunaConfig.data.feeRecipient,
    mintA.programAddress,
  );
  createInstructions.push(...createFeeRecipientAtaAInstructions.init);

  const createFeeRecipientAtaBInstructions = await getCreateAtaInstructions(
    rpc,
    authority,
    mintB.address,
    tunaConfig.data.feeRecipient,
    mintB.programAddress,
  );
  createInstructions.push(...createFeeRecipientAtaBInstructions.init);

  //
  // Add create tick arrays instructions if needed.
  //
  const lowerTickArrayIndex = getTickArrayStartTickIndex(args.tickLowerIndex, fusionPool.data.tickSpacing);
  const [lowerTickArrayAddress] = await getTickArrayAddress(fusionPool.address, lowerTickArrayIndex);

  const upperTickArrayIndex = getTickArrayStartTickIndex(args.tickUpperIndex, fusionPool.data.tickSpacing);
  const [upperTickArrayAddress] = await getTickArrayAddress(fusionPool.address, upperTickArrayIndex);

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
        startTickIndex: lowerTickArrayIndex,
      }),
    );
  }

  // Create a tick array it doesn't exist.
  if (!upperTickArray.exists && lowerTickArrayIndex !== upperTickArrayIndex) {
    instructions.push(
      getInitializeTickArrayInstruction({
        fusionPool: fusionPool.address,
        funder: authority,
        tickArray: upperTickArrayAddress,
        startTickIndex: upperTickArrayIndex,
      }),
    );
  }

  //
  // Finally add liquidity increase instruction.
  //

  const ix = await openPositionWithLiquidityFusionInstruction(
    authority,
    positionMint,
    tunaConfig,
    mintA,
    mintB,
    vaultA,
    vaultB,
    fusionPool,
    { ...args, minAddedAmountA: increaseAmounts.minTotalA, minAddedAmountB: increaseAmounts.minTotalB },
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

export async function openPositionWithLiquidityFusionInstruction(
  authority: TransactionSigner,
  positionMint: TransactionSigner,
  tunaConfig: Account<TunaConfig>,
  mintA: Account<Mint>,
  mintB: Account<Mint>,
  vaultA: Account<Vault>,
  vaultB: Account<Vault>,
  fusionPool: Account<FusionPool>,
  args: Omit<OpenPositionWithLiquidityFusionInstructionDataArgs, "remainingAccountsInfo">,
): Promise<IInstruction> {
  const tunaPositionAddress = (await getTunaPositionAddress(positionMint.address))[0];

  const marketAddress = (await getMarketAddress(fusionPool.address))[0];
  const fusionPositionAddress = (await getPositionAddress(positionMint.address))[0];

  const tunaPositionAta = (
    await findAssociatedTokenPda({
      owner: tunaPositionAddress,
      mint: positionMint.address,
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
  const lowerTickArrayAddress = await FusionUtils.getTickArrayAddressFromTickIndex(fusionPool, args.tickLowerIndex);
  const upperTickArrayAddress = await FusionUtils.getTickArrayAddressFromTickIndex(fusionPool, args.tickUpperIndex);

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

  const ix = getOpenPositionWithLiquidityFusionInstruction({
    authority,
    tunaConfig: tunaConfig.address,
    mintA: mintA.address,
    mintB: mintB.address,
    market: marketAddress,
    pythOraclePriceFeedA: vaultA.data.pythOraclePriceUpdate,
    pythOraclePriceFeedB: vaultB.data.pythOraclePriceUpdate,
    vaultA: vaultA.address,
    vaultAAta,
    vaultB: vaultB.address,
    vaultBAta,
    tunaPosition: tunaPositionAddress,
    tunaPositionMint: positionMint,
    tunaPositionAta,
    tunaPositionAtaA,
    tunaPositionAtaB,
    tunaPositionOwnerAtaA,
    tunaPositionOwnerAtaB,
    feeRecipientAtaA,
    feeRecipientAtaB,
    fusionPool: fusionPool.address,
    fusionammProgram: FUSIONAMM_PROGRAM_ADDRESS,
    fusionPosition: fusionPositionAddress,
    tokenProgramA: mintA.programAddress,
    tokenProgramB: mintB.programAddress,
    memoProgram: MEMO_PROGRAM_ADDRESS,
    metadataUpdateAuth: FP_NFT_UPDATE_AUTH,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    token2022Program: TOKEN_2022_PROGRAM_ADDRESS,
    ...args,
    remainingAccountsInfo,
  });

  // @ts-expect-error don't worry about the error
  ix.accounts.push(...remainingAccounts);

  return ix;
}
