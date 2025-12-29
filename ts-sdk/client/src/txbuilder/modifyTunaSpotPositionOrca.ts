import { fetchWhirlpool, getOracleAddress, Whirlpool, WHIRLPOOL_PROGRAM_ADDRESS } from "@orca-so/whirlpools-client";
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
  fetchAllVault,
  fetchMaybeTunaSpotPosition,
  fetchTunaConfig,
  getCreateAtaInstructions,
  getLendingVaultAddress,
  getMarketAddress,
  getModifyTunaSpotPositionOrcaInstruction,
  getTunaConfigAddress,
  getTunaSpotPositionAddress,
  ModifyTunaSpotPositionOrcaInstructionDataArgs,
  OrcaUtils,
  PoolToken,
  TunaConfig,
  Vault,
} from "../index.ts";

export type ModifyTunaSpotPositionOrcaInstructionsArgs = Omit<
  ModifyTunaSpotPositionOrcaInstructionDataArgs,
  "remainingAccountsInfo"
>;

export async function modifyTunaSpotPositionOrcaInstructions(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  authority: TransactionSigner,
  poolAddress: Address,
  collateralToken: PoolToken | undefined,
  args: ModifyTunaSpotPositionOrcaInstructionsArgs,
  createInstructions?: IInstruction[],
  cleanupInstructions?: IInstruction[],
): Promise<IInstruction[]> {
  const instructions: IInstruction[] = [];
  if (!createInstructions) createInstructions = instructions;
  if (!cleanupInstructions) cleanupInstructions = instructions;

  const tunaPositionAddress = (await getTunaSpotPositionAddress(authority.address, poolAddress))[0];
  const tunaPosition = await fetchMaybeTunaSpotPosition(rpc, tunaPositionAddress);

  if (collateralToken == undefined) {
    if (!tunaPosition.exists)
      throw new Error("Tuna position account doesn't exist. Collateral token must be provided!");
    collateralToken = tunaPosition.data.collateralToken;
  }

  const tunaConfig = await fetchTunaConfig(rpc, (await getTunaConfigAddress())[0]);
  const pool = await fetchWhirlpool(rpc, poolAddress);

  const [mintA, mintB] = await fetchAllMaybeMint(rpc, [pool.data.tokenMintA, pool.data.tokenMintB]);
  assert(mintA.exists, "Token A account not found");
  assert(mintB.exists, "Token B account not found");

  const [vaultA, vaultB] = await fetchAllVault(rpc, [
    (await getLendingVaultAddress(pool.data.tokenMintA))[0],
    (await getLendingVaultAddress(pool.data.tokenMintB))[0],
  ]);

  //
  // Add create user's token account instructions if needed.
  //
  let hasDirectlyTransferredTokensA = false;
  let hasDirectlyTransferredTokensB = false;

  if (tunaPosition.exists) {
    const tunaPositionAtaAAddress = (
      await findAssociatedTokenPda({
        owner: tunaPositionAddress,
        mint: mintA.address,
        tokenProgram: mintA.programAddress,
      })
    )[0];

    const tunaPositionAtaBAddress = (
      await findAssociatedTokenPda({
        owner: tunaPositionAddress,
        mint: mintB.address,
        tokenProgram: mintB.programAddress,
      })
    )[0];

    const [tunaPositionAtaA, tunaPositionAtaB] = await fetchAllToken(rpc, [
      tunaPositionAtaAAddress,
      tunaPositionAtaBAddress,
    ]);

    hasDirectlyTransferredTokensA =
      tunaPositionAtaA.data.amount > (tunaPosition.data.positionToken == PoolToken.A ? tunaPosition.data.amount : 0n);
    hasDirectlyTransferredTokensB =
      tunaPositionAtaB.data.amount > (tunaPosition.data.positionToken == PoolToken.B ? tunaPosition.data.amount : 0n);
  }

  const createUserAtaAInstructions =
    collateralToken == PoolToken.A || hasDirectlyTransferredTokensA
      ? await getCreateAtaInstructions(rpc, authority, mintA.address, authority.address, mintA.programAddress)
      : undefined;
  if (createUserAtaAInstructions) createInstructions.push(...createUserAtaAInstructions.init);

  const createUserAtaBInstructions =
    collateralToken == PoolToken.B || hasDirectlyTransferredTokensB
      ? await getCreateAtaInstructions(rpc, authority, mintB.address, authority.address, mintB.programAddress)
      : undefined;
  if (createUserAtaBInstructions) createInstructions.push(...createUserAtaBInstructions.init);

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
  // Finally, add the modify instruction.
  //

  const ix = await modifyTunaSpotPositionOrcaInstruction(
    authority,
    tunaConfig,
    mintA,
    mintB,
    vaultA,
    vaultB,
    pool,
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

export async function modifyTunaSpotPositionOrcaInstruction(
  authority: TransactionSigner,
  tunaConfig: Account<TunaConfig>,
  mintA: Account<Mint>,
  mintB: Account<Mint>,
  vaultA: Account<Vault>,
  vaultB: Account<Vault>,
  pool: Account<Whirlpool>,
  setTunaPositionOwnerAtaA: boolean,
  setTunaPositionOwnerAtaB: boolean,
  args: ModifyTunaSpotPositionOrcaInstructionsArgs,
): Promise<IInstruction> {
  const marketAddress = (await getMarketAddress(pool.address))[0];
  const orcaOracleAddress = (await getOracleAddress(pool.address))[0];
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

  const swapTickArrays = await OrcaUtils.getSwapTickArrayAddresses(pool);

  const remainingAccounts: IAccountMeta[] = [
    { address: swapTickArrays[0], role: AccountRole.WRITABLE },
    { address: swapTickArrays[1], role: AccountRole.WRITABLE },
    { address: swapTickArrays[2], role: AccountRole.WRITABLE },
    { address: swapTickArrays[3], role: AccountRole.WRITABLE },
    { address: swapTickArrays[4], role: AccountRole.WRITABLE },
    { address: pool.data.tokenVaultA, role: AccountRole.WRITABLE },
    { address: pool.data.tokenVaultB, role: AccountRole.WRITABLE },
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

  const ix = getModifyTunaSpotPositionOrcaInstruction({
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
    ...(setTunaPositionOwnerAtaA && { tunaPositionOwnerAtaA }),
    ...(setTunaPositionOwnerAtaB && { tunaPositionOwnerAtaB }),
    feeRecipientAtaA,
    feeRecipientAtaB,
    whirlpool: pool.address,
    whirlpoolProgram: WHIRLPOOL_PROGRAM_ADDRESS,
    memoProgram: MEMO_PROGRAM_ADDRESS,
    ...args,
    remainingAccountsInfo,
  });

  // @ts-expect-error don't worry about the error
  ix.accounts.push(...remainingAccounts);

  return ix;
}
