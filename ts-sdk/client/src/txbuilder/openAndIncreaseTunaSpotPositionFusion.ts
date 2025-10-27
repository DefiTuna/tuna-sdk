import { fetchMaybeFusionPool, FUSIONAMM_PROGRAM_ADDRESS, FusionPool } from "@crypticdot/fusionamm-client";
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
} from "@solana-program/token-2022";
import assert from "assert";

import {
  AccountsType,
  fetchAllVault,
  fetchTunaConfig,
  FusionUtils,
  getCreateAtaInstructions,
  getLendingVaultAddress,
  getMarketAddress,
  getOpenAndIncreaseTunaSpotPositionFusionInstruction,
  getTunaConfigAddress,
  getTunaSpotPositionAddress,
  OpenAndIncreaseTunaSpotPositionFusionInstructionDataArgs,
  PoolToken,
  TunaConfig,
  Vault,
} from "../index.ts";

export type OpenAndIncreaseTunaSpotPositionFusionInstructionsArgs = Omit<
  OpenAndIncreaseTunaSpotPositionFusionInstructionDataArgs,
  "remainingAccountsInfo"
>;

export async function openAndIncreaseTunaSpotPositionFusionInstructions(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  authority: TransactionSigner,
  fusionPoolAddress: Address,
  args: OpenAndIncreaseTunaSpotPositionFusionInstructionsArgs,
  createInstructions?: IInstruction[],
  cleanupInstructions?: IInstruction[],
): Promise<IInstruction[]> {
  const instructions: IInstruction[] = [];
  if (!createInstructions) createInstructions = instructions;
  if (!cleanupInstructions) cleanupInstructions = instructions;

  const tunaConfig = await fetchTunaConfig(rpc, (await getTunaConfigAddress())[0]);

  const fusionPool = await fetchMaybeFusionPool(rpc, fusionPoolAddress);
  if (!fusionPool.exists) throw new Error("FusionPool account not found");

  const [mintA, mintB] = await fetchAllMaybeMint(rpc, [fusionPool.data.tokenMintA, fusionPool.data.tokenMintB]);
  assert(mintA.exists, "Token A account not found");
  assert(mintB.exists, "Token B account not found");

  const [vaultA, vaultB] = await fetchAllVault(rpc, [
    (await getLendingVaultAddress(fusionPool.data.tokenMintA))[0],
    (await getLendingVaultAddress(fusionPool.data.tokenMintB))[0],
  ]);

  //
  // Add create user's token account instructions if needed.
  //

  const collateralTokenMint = args.collateralToken == PoolToken.A ? mintA : mintB;
  const createUserAtaInstructions = await getCreateAtaInstructions(
    rpc,
    authority,
    collateralTokenMint.address,
    authority.address,
    collateralTokenMint.programAddress,
    args.collateralAmount,
  );
  createInstructions.push(...createUserAtaInstructions.init);

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
  // Finally add liquidity increase instruction.
  //

  const ix = await openAndIncreaseTunaSpotPositionFusionInstruction(
    authority,
    tunaConfig,
    mintA,
    mintB,
    vaultA,
    vaultB,
    fusionPool,
    { ...args },
  );
  instructions.push(ix);

  //
  // Close WSOL accounts if needed.
  //

  cleanupInstructions.push(...createUserAtaInstructions.cleanup);

  return instructions;
}

export async function openAndIncreaseTunaSpotPositionFusionInstruction(
  authority: TransactionSigner,
  tunaConfig: Account<TunaConfig>,
  mintA: Account<Mint>,
  mintB: Account<Mint>,
  vaultA: Account<Vault>,
  vaultB: Account<Vault>,
  fusionPool: Account<FusionPool>,
  args: Omit<OpenAndIncreaseTunaSpotPositionFusionInstructionDataArgs, "remainingAccountsInfo">,
): Promise<IInstruction> {
  const tunaPositionAddress = (await getTunaSpotPositionAddress(authority.address, fusionPool.address))[0];
  const marketAddress = (await getMarketAddress(fusionPool.address))[0];

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

  const ix = getOpenAndIncreaseTunaSpotPositionFusionInstruction({
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
    tunaPosition: tunaPositionAddress,
    tunaPositionAtaA,
    tunaPositionAtaB,
    tunaPositionOwnerAtaA: args.collateralToken == PoolToken.A ? tunaPositionOwnerAtaA : undefined,
    tunaPositionOwnerAtaB: args.collateralToken == PoolToken.B ? tunaPositionOwnerAtaB : undefined,
    feeRecipientAtaA,
    feeRecipientAtaB,
    fusionPool: fusionPool.address,
    fusionammProgram: FUSIONAMM_PROGRAM_ADDRESS,
    memoProgram: MEMO_PROGRAM_ADDRESS,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    ...args,
    remainingAccountsInfo,
  });

  // @ts-expect-error don't worry about the error
  ix.accounts.push(...remainingAccounts);

  return ix;
}
