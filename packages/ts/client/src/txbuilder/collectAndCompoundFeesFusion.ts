import {
  fetchMaybeFusionPool,
  FUSIONAMM_PROGRAM_ADDRESS,
  FusionPool,
  getPositionAddress,
} from "@crypticdot/fusionamm-client";
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
  fetchAllVault,
  fetchMaybeTunaPosition,
  fetchTunaConfig,
  FusionUtils,
  getCollectAndCompoundFeesFusionInstruction,
  getCreateAtaInstructions,
  getLendingVaultAddress,
  getMarketAddress,
  getTunaConfigAddress,
  getTunaPositionAddress,
  TunaConfig,
  TunaPosition,
  Vault,
} from "../index.ts";

export async function collectAndCompoundFeesFusionInstructions(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  authority: TransactionSigner,
  positionMint: Address,
  useLeverage: boolean,
): Promise<IInstruction[]> {
  const instructions: IInstruction[] = [];

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
  assert(mintA.exists, "Token A account not found");
  assert(mintB.exists, "Token B account not found");

  //
  // Add create fee recipient's token account instructions if needed.
  //

  const createFeeRecipientAtaAInstructions = await getCreateAtaInstructions(
    authority,
    mintA.address,
    tunaConfig.data.feeRecipient,
    mintA.programAddress,
  );
  instructions.push(...createFeeRecipientAtaAInstructions.init);

  const createFeeRecipientAtaBInstructions = await getCreateAtaInstructions(
    authority,
    mintB.address,
    tunaConfig.data.feeRecipient,
    mintB.programAddress,
  );
  instructions.push(...createFeeRecipientAtaBInstructions.init);

  //
  // Finally add collect and compound fees instruction.
  //

  const ix = await collectAndCompoundFeesFusionInstruction(
    authority,
    tunaConfig,
    tunaPosition,
    mintA,
    mintB,
    vaultA,
    vaultB,
    fusionPool,
    useLeverage,
  );
  instructions.push(ix);

  //
  // Close WSOL accounts if needed.
  //

  instructions.push(...createFeeRecipientAtaAInstructions.cleanup);
  instructions.push(...createFeeRecipientAtaBInstructions.cleanup);

  return instructions;
}

export async function collectAndCompoundFeesFusionInstruction(
  authority: TransactionSigner,
  tunaConfig: Account<TunaConfig>,
  tunaPosition: Account<TunaPosition>,
  mintA: Account<Mint>,
  mintB: Account<Mint>,
  vaultA: Account<Vault>,
  vaultB: Account<Vault>,
  fusionPool: Account<FusionPool>,
  useLeverage: boolean,
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

  const ix = getCollectAndCompoundFeesFusionInstruction({
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
    feeRecipientAtaA,
    feeRecipientAtaB,
    fusionPosition: fusionPositionAddress,
    tunaPosition: tunaPosition.address,
    fusionPool: fusionPool.address,
    fusionammProgram: FUSIONAMM_PROGRAM_ADDRESS,
    tokenProgramA: mintA.programAddress,
    tokenProgramB: mintB.programAddress,
    memoProgram: MEMO_PROGRAM_ADDRESS,
    useLeverage,
    remainingAccountsInfo,
  });

  // @ts-expect-error don't worry about the error
  ix.accounts.push(...remainingAccounts);

  return ix;
}
