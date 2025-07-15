import {
  fetchAllMaybeTickArray,
  fetchMaybeWhirlpool,
  getDynamicTickArrayMinSize,
  getInitializeDynamicTickArrayInstruction,
  getOracleAddress,
  getPositionAddress,
  Whirlpool,
  WHIRLPOOL_PROGRAM_ADDRESS,
} from "@orca-so/whirlpools-client";
import {
  type Account,
  AccountRole,
  Address,
  GetAccountInfoApi,
  GetMultipleAccountsApi,
  IAccountMeta,
  IInstruction,
  Lamports,
  lamports,
  Rpc,
  TransactionSigner,
} from "@solana/kit";
import { fetchSysvarRent } from "@solana/sysvars";
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
  getRebalancePositionOrcaInstruction,
  TunaConfig,
  TunaPosition,
  Vault,
} from "../generated";
import { getLendingVaultAddress, getMarketAddress, getTunaConfigAddress, getTunaPositionAddress } from "../pda.ts";
import { getCreateAtaInstructions, OrcaUtils } from "../utils";
import { calculateMinimumBalanceForRentExemption } from "../utils/sysvar";

export type RebalancePositionOrca = {
  /** List of Solana transaction instructions to execute. */
  instructions: IInstruction[];

  /** The initialization cost for opening the position in lamports. */
  initializationCost: Lamports;
};

export async function rebalancePositionOrcaInstructions(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  authority: TransactionSigner,
  positionMint: Address,
  createInstructions?: IInstruction[],
  cleanupInstructions?: IInstruction[],
): Promise<RebalancePositionOrca> {
  const rent = await fetchSysvarRent(rpc);
  let nonRefundableRent: bigint = 0n;

  const tunaConfig = await fetchTunaConfig(rpc, (await getTunaConfigAddress())[0]);

  const tunaPosition = await fetchMaybeTunaPosition(rpc, (await getTunaPositionAddress(positionMint))[0]);
  if (!tunaPosition.exists) throw new Error("Tuna position account not found");

  const whirlpool = await fetchMaybeWhirlpool(rpc, tunaPosition.data.pool);
  if (!whirlpool.exists) throw new Error("Whirlpool account not found");

  const [vaultA, vaultB] = await fetchAllVault(rpc, [
    (await getLendingVaultAddress(whirlpool.data.tokenMintA))[0],
    (await getLendingVaultAddress(whirlpool.data.tokenMintB))[0],
  ]);

  const [mintA, mintB] = await fetchAllMaybeMint(rpc, [whirlpool.data.tokenMintA, whirlpool.data.tokenMintB]);
  assert(mintA.exists, "Token A account not found");
  assert(mintB.exists, "Token B account not found");

  //
  // Collect the list of instructions.
  //

  const instructions: IInstruction[] = [];
  if (!createInstructions) createInstructions = instructions;
  if (!cleanupInstructions) cleanupInstructions = instructions;
  const internalCleanupInstructions: IInstruction[] = [];

  //
  // Add create tick arrays instructions if needed.
  //

  const secondaryTickArrays = await OrcaUtils.getTickArraysForRebalancedPosition(whirlpool, tunaPosition);

  const [lowerTickArray, upperTickArray] = await fetchAllMaybeTickArray(rpc, [
    secondaryTickArrays.lowerTickArrayAddress,
    secondaryTickArrays.upperTickArrayAddress,
  ]);

  // Create a tick array it doesn't exist.
  if (!lowerTickArray.exists) {
    instructions.push(
      getInitializeDynamicTickArrayInstruction({
        whirlpool: whirlpool.address,
        funder: authority,
        tickArray: secondaryTickArrays.lowerTickArrayAddress,
        startTickIndex: secondaryTickArrays.lowerTickArrayStartIndex,
        idempotent: false,
      }),
    );
    nonRefundableRent += calculateMinimumBalanceForRentExemption(rent, getDynamicTickArrayMinSize());
  }

  // Create a tick array it doesn't exist.
  if (
    !upperTickArray.exists &&
    secondaryTickArrays.lowerTickArrayStartIndex !== secondaryTickArrays.upperTickArrayStartIndex
  ) {
    instructions.push(
      getInitializeDynamicTickArrayInstruction({
        whirlpool: whirlpool.address,
        funder: authority,
        tickArray: secondaryTickArrays.upperTickArrayAddress,
        startTickIndex: secondaryTickArrays.upperTickArrayStartIndex,
        idempotent: false,
      }),
    );
    nonRefundableRent += calculateMinimumBalanceForRentExemption(rent, getDynamicTickArrayMinSize());
  }

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
  // Finally add liquidity decrease instruction.
  //

  const ix = await rebalancePositionOrcaInstruction(
    authority,
    tunaPosition,
    tunaConfig,
    mintA,
    mintB,
    vaultA,
    vaultB,
    whirlpool,
  );
  instructions.push(ix);

  //
  // Close WSOL accounts if needed.
  //

  cleanupInstructions.push(...internalCleanupInstructions);
  cleanupInstructions.push(...createFeeRecipientAtaAInstructions.cleanup);
  cleanupInstructions.push(...createFeeRecipientAtaBInstructions.cleanup);

  return {
    instructions,
    initializationCost: lamports(nonRefundableRent),
  };
}

export async function rebalancePositionOrcaInstruction(
  authority: TransactionSigner,
  tunaPosition: Account<TunaPosition>,
  tunaConfig: Account<TunaConfig>,
  mintA: Account<Mint>,
  mintB: Account<Mint>,
  vaultA: Account<Vault>,
  vaultB: Account<Vault>,
  whirlpool: Account<Whirlpool>,
): Promise<IInstruction> {
  const positionMint = tunaPosition.data.positionMint;

  const marketAddress = (await getMarketAddress(whirlpool.address))[0];
  const orcaPositionAddress = (await getPositionAddress(positionMint))[0];
  const orcaOracleAddress = (await getOracleAddress(whirlpool.address))[0];

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

  const swapTickArrays = await OrcaUtils.getSwapTickArrayAddresses(whirlpool);
  const lowerTickArrayAddress = await OrcaUtils.getTickArrayAddressFromTickIndex(
    whirlpool,
    tunaPosition.data.tickLowerIndex,
  );
  const upperTickArrayAddress = await OrcaUtils.getTickArrayAddressFromTickIndex(
    whirlpool,
    tunaPosition.data.tickUpperIndex,
  );

  const secondaryTickArrays = await OrcaUtils.getTickArraysForRebalancedPosition(whirlpool, tunaPosition);

  const remainingAccounts: IAccountMeta[] = [
    { address: swapTickArrays[0], role: AccountRole.WRITABLE },
    { address: swapTickArrays[1], role: AccountRole.WRITABLE },
    { address: swapTickArrays[2], role: AccountRole.WRITABLE },
    { address: swapTickArrays[3], role: AccountRole.WRITABLE },
    { address: swapTickArrays[4], role: AccountRole.WRITABLE },
    { address: lowerTickArrayAddress, role: AccountRole.WRITABLE },
    { address: upperTickArrayAddress, role: AccountRole.WRITABLE },
    { address: secondaryTickArrays.lowerTickArrayAddress, role: AccountRole.WRITABLE },
    { address: secondaryTickArrays.upperTickArrayAddress, role: AccountRole.WRITABLE },
    { address: whirlpool.data.tokenVaultA, role: AccountRole.WRITABLE },
    { address: whirlpool.data.tokenVaultB, role: AccountRole.WRITABLE },
    { address: orcaOracleAddress, role: AccountRole.WRITABLE },
  ];

  const remainingAccountsInfo = {
    slices: [
      { accountsType: AccountsType.SwapTickArrays, length: 5 },
      { accountsType: AccountsType.TickArrayLower, length: 1 },
      { accountsType: AccountsType.TickArrayUpper, length: 1 },
      { accountsType: AccountsType.SecondaryTickArrayLower, length: 1 },
      { accountsType: AccountsType.SecondaryTickArrayUpper, length: 1 },
      { accountsType: AccountsType.PoolVaultTokenA, length: 1 },
      { accountsType: AccountsType.PoolVaultTokenB, length: 1 },
      { accountsType: AccountsType.WhirlpoolOracle, length: 1 },
    ],
  };

  const ix = getRebalancePositionOrcaInstruction({
    market: marketAddress,
    mintA: mintA.address,
    mintB: mintB.address,
    pythOraclePriceFeedA: vaultA.data.pythOraclePriceUpdate,
    pythOraclePriceFeedB: vaultB.data.pythOraclePriceUpdate,
    vaultA: vaultA.address,
    vaultB: vaultB.address,
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
    memoProgram: MEMO_PROGRAM_ADDRESS,
    remainingAccountsInfo,
  });

  // @ts-expect-error don't worry about the error
  ix.accounts.push(...remainingAccounts);

  return ix;
}
