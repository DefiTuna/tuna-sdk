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
  DecreaseTunaSpotPositionOrcaInstructionDataArgs,
  fetchAllVault,
  fetchMaybeTunaSpotPosition,
  fetchTunaConfig,
  getCreateAtaInstructions,
  getDecreaseTunaSpotPositionOrcaInstruction,
  getLendingVaultAddress,
  getMarketAddress,
  getTunaConfigAddress,
  getTunaSpotPositionAddress,
  OrcaUtils,
  PoolToken,
  TunaConfig,
  TunaSpotPosition,
  Vault,
} from "../index.ts";

export type DecreaseTunaSpotPositionOrcaInstructionsArgs = Omit<
  DecreaseTunaSpotPositionOrcaInstructionDataArgs,
  "remainingAccountsInfo"
>;

export async function decreaseTunaSpotPositionOrcaInstructions(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  authority: TransactionSigner,
  whirlpoolAddress: Address,
  args: DecreaseTunaSpotPositionOrcaInstructionsArgs,
  createInstructions?: IInstruction[],
  cleanupInstructions?: IInstruction[],
): Promise<IInstruction[]> {
  const instructions: IInstruction[] = [];
  if (!createInstructions) createInstructions = instructions;
  if (!cleanupInstructions) cleanupInstructions = instructions;

  const tunaPositionAddress = (await getTunaSpotPositionAddress(authority.address, whirlpoolAddress))[0];
  const tunaPosition = await fetchMaybeTunaSpotPosition(rpc, tunaPositionAddress);
  if (!tunaPosition.exists) throw new Error("Tuna position account not found");

  const tunaConfig = await fetchTunaConfig(rpc, (await getTunaConfigAddress())[0]);
  const whirlpool = await fetchWhirlpool(rpc, tunaPosition.data.pool);

  const [mintA, mintB] = await fetchAllMaybeMint(rpc, [whirlpool.data.tokenMintA, whirlpool.data.tokenMintB]);
  assert(mintA.exists, "Token A account not found");
  assert(mintB.exists, "Token B account not found");

  const [vaultA, vaultB] = await fetchAllVault(rpc, [
    (await getLendingVaultAddress(whirlpool.data.tokenMintA))[0],
    (await getLendingVaultAddress(whirlpool.data.tokenMintB))[0],
  ]);

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
  // Finally, add liquidity decrease instruction.
  //

  const ix = await decreaseTunaSpotPositionOrcaInstruction(
    authority,
    tunaPosition,
    tunaConfig,
    mintA,
    mintB,
    vaultA,
    vaultB,
    whirlpool,
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

export async function decreaseTunaSpotPositionOrcaInstruction(
  authority: TransactionSigner,
  tunaPosition: Account<TunaSpotPosition>,
  tunaConfig: Account<TunaConfig>,
  mintA: Account<Mint>,
  mintB: Account<Mint>,
  vaultA: Account<Vault>,
  vaultB: Account<Vault>,
  whirlpool: Account<Whirlpool>,
  setTunaPositionOwnerAtaA: boolean,
  setTunaPositionOwnerAtaB: boolean,
  args: DecreaseTunaSpotPositionOrcaInstructionsArgs,
): Promise<IInstruction> {
  const marketAddress = (await getMarketAddress(whirlpool.address))[0];
  const orcaOracleAddress = (await getOracleAddress(whirlpool.address))[0];

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

  const ix = getDecreaseTunaSpotPositionOrcaInstruction({
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
    ...(setTunaPositionOwnerAtaA && { tunaPositionOwnerAtaA }),
    ...(setTunaPositionOwnerAtaB && { tunaPositionOwnerAtaB }),
    whirlpool: whirlpool.address,
    whirlpoolProgram: WHIRLPOOL_PROGRAM_ADDRESS,
    memoProgram: MEMO_PROGRAM_ADDRESS,
    ...args,
    remainingAccountsInfo,
  });

  // @ts-expect-error don't worry about the error
  ix.accounts.push(...remainingAccounts);

  return ix;
}
