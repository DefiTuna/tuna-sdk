import { fetchFusionPool, FUSIONAMM_PROGRAM_ADDRESS, FusionPool } from "@crypticdot/fusionamm-client";
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
import { fetchAllMaybeMint, findAssociatedTokenPda, Mint } from "@solana-program/token-2022";
import assert from "assert";

import {
  AccountsType,
  fetchAllVault,
  fetchMarket,
  fetchMaybeTunaSpotPosition,
  fetchTunaConfig,
  FusionUtils,
  getMarketAddress,
  getModifyTunaSpotPositionFusionInstruction,
  getTunaConfigAddress,
  getTunaSpotPositionAddress,
  ModifyTunaSpotPositionFusionInstructionDataArgs,
  PoolToken,
  TunaConfig,
  Vault,
} from "../index.ts";
import { getTunaSpotPositionCreateAtaInstructions } from "../utils/tuna.ts";

export type ModifyTunaSpotPositionFusionInstructionsArgs = Omit<
  ModifyTunaSpotPositionFusionInstructionDataArgs,
  "remainingAccountsInfo"
>;

export async function modifyTunaSpotPositionFusionInstructions(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  authority: TransactionSigner,
  poolAddress: Address,
  collateralToken: PoolToken | undefined,
  args: ModifyTunaSpotPositionFusionInstructionsArgs,
  createInstructions?: IInstruction[],
  cleanupInstructions?: IInstruction[],
): Promise<IInstruction[]> {
  const tunaPositionAddress = (await getTunaSpotPositionAddress(authority.address, poolAddress))[0];
  const tunaPosition = await fetchMaybeTunaSpotPosition(rpc, tunaPositionAddress);

  if (collateralToken == undefined) {
    if (!tunaPosition.exists)
      throw new Error("Tuna position account doesn't exist. Collateral token must be provided!");
    collateralToken = tunaPosition.data.collateralToken;
  }

  const tunaConfig = await fetchTunaConfig(rpc, (await getTunaConfigAddress())[0]);
  const pool = await fetchFusionPool(rpc, poolAddress);

  const [mintA, mintB] = await fetchAllMaybeMint(rpc, [pool.data.tokenMintA, pool.data.tokenMintB]);
  assert(mintA.exists, "Token A account not found");
  assert(mintB.exists, "Token B account not found");

  const marketAddress = (await getMarketAddress(poolAddress))[0];
  const market = await fetchMarket(rpc, marketAddress);

  const [vaultA, vaultB] = await fetchAllVault(rpc, [market.data.vaultA, market.data.vaultB]);

  const { init, cleanup, requireTunaPositionOwnerAtaA, requireTunaPositionOwnerAtaB } =
    await getTunaSpotPositionCreateAtaInstructions(
      rpc,
      authority,
      tunaConfig,
      tunaPosition,
      mintA,
      mintB,
      collateralToken,
      false,
    );

  //
  // Create the list of instructions
  //
  const instructions: IInstruction[] = [];

  if (createInstructions) {
    createInstructions.push(...init);
  } else {
    instructions.push(...init);
  }

  //
  // Finally, add the position modify instruction.
  //

  const ix = await modifyTunaSpotPositionFusionInstruction(
    authority,
    tunaConfig,
    mintA,
    mintB,
    vaultA,
    vaultB,
    pool,
    requireTunaPositionOwnerAtaA,
    requireTunaPositionOwnerAtaB,
    { ...args },
  );
  instructions.push(ix);

  //
  // Close WSOL accounts if needed.
  //

  if (cleanupInstructions) {
    cleanupInstructions.push(...cleanup);
  } else {
    instructions.push(...cleanup);
  }

  return instructions;
}

export async function modifyTunaSpotPositionFusionInstruction(
  authority: TransactionSigner,
  tunaConfig: Account<TunaConfig>,
  mintA: Account<Mint>,
  mintB: Account<Mint>,
  vaultA: Account<Vault>,
  vaultB: Account<Vault>,
  pool: Account<FusionPool>,
  requireTunaPositionOwnerAtaA: boolean,
  requireTunaPositionOwnerAtaB: boolean,
  args: ModifyTunaSpotPositionFusionInstructionsArgs,
): Promise<IInstruction> {
  const marketAddress = (await getMarketAddress(pool.address))[0];
  const tunaPositionAddress = (await getTunaSpotPositionAddress(authority.address, pool.address))[0];

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

  const swapTickArrays = await FusionUtils.getSwapTickArrayAddresses(pool);

  const remainingAccounts: IAccountMeta[] = [
    { address: swapTickArrays[0], role: AccountRole.WRITABLE },
    { address: swapTickArrays[1], role: AccountRole.WRITABLE },
    { address: swapTickArrays[2], role: AccountRole.WRITABLE },
    { address: swapTickArrays[3], role: AccountRole.WRITABLE },
    { address: swapTickArrays[4], role: AccountRole.WRITABLE },
    { address: pool.data.tokenVaultA, role: AccountRole.WRITABLE },
    { address: pool.data.tokenVaultB, role: AccountRole.WRITABLE },
  ];

  const remainingAccountsInfo = {
    slices: [
      { accountsType: AccountsType.SwapTickArrays, length: 5 },
      { accountsType: AccountsType.PoolVaultTokenA, length: 1 },
      { accountsType: AccountsType.PoolVaultTokenB, length: 1 },
    ],
  };

  const ix = getModifyTunaSpotPositionFusionInstruction({
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
    tunaPosition: tunaPositionAddress,
    tunaPositionAtaA,
    tunaPositionAtaB,
    ...(requireTunaPositionOwnerAtaA && { tunaPositionOwnerAtaA }),
    ...(requireTunaPositionOwnerAtaB && { tunaPositionOwnerAtaB }),
    feeRecipientAtaA,
    feeRecipientAtaB,
    fusionPool: pool.address,
    fusionammProgram: FUSIONAMM_PROGRAM_ADDRESS,
    memoProgram: MEMO_PROGRAM_ADDRESS,
    ...args,
    remainingAccountsInfo,
  });

  // @ts-expect-error don't worry about the error
  ix.accounts.push(...remainingAccounts);

  return ix;
}
