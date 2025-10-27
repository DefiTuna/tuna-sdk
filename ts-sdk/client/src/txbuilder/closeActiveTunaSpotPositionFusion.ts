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
import { fetchAllMaybeMint, fetchAllToken, findAssociatedTokenPda, Mint } from "@solana-program/token-2022";
import assert from "assert";

import {
  AccountsType,
  CloseActiveTunaSpotPositionFusionInstructionDataArgs,
  fetchAllVault,
  fetchMaybeTunaSpotPosition,
  FusionUtils,
  getCloseActiveTunaSpotPositionFusionInstruction,
  getCreateAtaInstructions,
  getLendingVaultAddress,
  getMarketAddress,
  getTunaConfigAddress,
  getTunaSpotPositionAddress,
  PoolToken,
  TunaSpotPosition,
  Vault,
} from "../index.ts";

export type CloseActiveTunaSpotPositionFusionInstructionsArgs = Omit<
  CloseActiveTunaSpotPositionFusionInstructionDataArgs,
  "remainingAccountsInfo"
>;

export async function closeActiveTunaSpotPositionFusionInstructions(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  authority: TransactionSigner,
  fusionPoolAddress: Address,
  args: CloseActiveTunaSpotPositionFusionInstructionsArgs,
  createInstructions?: IInstruction[],
  cleanupInstructions?: IInstruction[],
): Promise<IInstruction[]> {
  const tunaPositionAddress = (await getTunaSpotPositionAddress(authority.address, fusionPoolAddress))[0];
  const tunaPosition = await fetchMaybeTunaSpotPosition(rpc, tunaPositionAddress);
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
  // Collect the list of instructions.
  //

  const instructions: IInstruction[] = [];
  if (!createInstructions) createInstructions = instructions;
  if (!cleanupInstructions) cleanupInstructions = instructions;

  //
  // Add user's token account creation instructions if needed.
  //

  const tunaPositionAtaAAddress = (
    await findAssociatedTokenPda({
      owner: tunaPosition.address,
      mint: mintA.address,
      tokenProgram: mintA.programAddress,
    })
  )[0];

  const tunaPositionAtaBAddress = (
    await findAssociatedTokenPda({
      owner: tunaPosition.address,
      mint: mintB.address,
      tokenProgram: mintB.programAddress,
    })
  )[0];

  const [tunaPositionAtaA, tunaPositionAtaB] = await fetchAllToken(rpc, [
    tunaPositionAtaAAddress,
    tunaPositionAtaBAddress,
  ]);

  const createUserAtaAInstructions =
    tunaPosition.data.collateralToken == PoolToken.A ||
    tunaPositionAtaA.data.amount > (tunaPosition.data.positionToken == PoolToken.A ? tunaPosition.data.amount : 0n)
      ? await getCreateAtaInstructions(rpc, authority, mintA.address, authority.address, mintA.programAddress)
      : undefined;
  if (createUserAtaAInstructions) createInstructions.push(...createUserAtaAInstructions.init);

  const createUserAtaBInstructions =
    tunaPosition.data.collateralToken == PoolToken.B ||
    tunaPositionAtaB.data.amount > (tunaPosition.data.positionToken == PoolToken.B ? tunaPosition.data.amount : 0n)
      ? await getCreateAtaInstructions(rpc, authority, mintB.address, authority.address, mintB.programAddress)
      : undefined;
  if (createUserAtaBInstructions) createInstructions.push(...createUserAtaBInstructions.init);

  //
  // Finally, add the position close instruction.
  //

  const ix = await closeActiveTunaSpotPositionFusionInstruction(
    authority,
    tunaPosition,
    mintA,
    mintB,
    vaultA,
    vaultB,
    fusionPool,
    createUserAtaAInstructions != undefined,
    createUserAtaBInstructions != undefined,
    { ...args },
  );
  instructions.push(ix);

  //
  // Close WSOL accounts if needed.
  //

  if (createUserAtaAInstructions) cleanupInstructions.push(...createUserAtaAInstructions.cleanup);
  if (createUserAtaBInstructions) cleanupInstructions.push(...createUserAtaBInstructions.cleanup);

  return instructions;
}

export async function closeActiveTunaSpotPositionFusionInstruction(
  authority: TransactionSigner,
  tunaPosition: Account<TunaSpotPosition>,
  mintA: Account<Mint>,
  mintB: Account<Mint>,
  vaultA: Account<Vault>,
  vaultB: Account<Vault>,
  fusionPool: Account<FusionPool>,
  setTunaPositionOwnerAtaA: boolean,
  setTunaPositionOwnerAtaB: boolean,
  args: CloseActiveTunaSpotPositionFusionInstructionsArgs,
): Promise<IInstruction> {
  const tunaConfig = (await getTunaConfigAddress())[0];
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

  const ix = getCloseActiveTunaSpotPositionFusionInstruction({
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
    tunaConfig,
    tunaPositionAtaA,
    tunaPositionAtaB,
    ...(setTunaPositionOwnerAtaA && { tunaPositionOwnerAtaA }),
    ...(setTunaPositionOwnerAtaB && { tunaPositionOwnerAtaB }),
    tunaPosition: tunaPosition.address,
    fusionPool: fusionPool.address,
    fusionammProgram: FUSIONAMM_PROGRAM_ADDRESS,
    tokenProgramA: mintA.programAddress,
    tokenProgramB: mintB.programAddress,
    memoProgram: MEMO_PROGRAM_ADDRESS,
    ...args,
    remainingAccountsInfo,
  });

  // @ts-expect-error don't worry about the error
  ix.accounts.push(...remainingAccounts);

  return ix;
}
