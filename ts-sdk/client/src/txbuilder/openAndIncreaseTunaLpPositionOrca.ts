import {
  fetchAllMaybeTickArray,
  fetchMaybeWhirlpool,
  getDynamicTickArrayMinSize,
  getInitializeDynamicTickArrayInstruction,
  getOracleAddress,
  getPositionAddress,
  getTickArrayAddress,
  Whirlpool,
  WHIRLPOOL_PROGRAM_ADDRESS,
} from "@orca-so/whirlpools-client";
import { getTickArrayStartTickIndex } from "@orca-so/whirlpools-core";
import {
  type Account,
  AccountRole,
  Address,
  generateKeyPairSigner,
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
  getCreateAtaInstructions,
  getLendingVaultAddress,
  getMarketAddress,
  getOpenAndIncreaseTunaLpPositionOrcaInstruction,
  getTunaConfigAddress,
  getTunaLpPositionAddress,
  OpenAndIncreaseTunaLpPositionOrcaInstructionDataArgs,
  OrcaUtils,
  TunaConfig,
  Vault,
  WP_NFT_UPDATE_AUTH,
} from "../index.ts";
import { getIncreaseLpPositionQuote } from "../utils";
import { calculateMinimumBalanceForRentExemption } from "../utils/sysvar";

export type OpenAndIncreaseTunaLpPositionOrca = {
  /** The mint address of the position NFT. */
  positionMint: Address;

  /** List of Solana transaction instructions to execute. */
  instructions: IInstruction[];

  /** The initialization cost for opening the position in lamports. */
  initializationCost: Lamports;
};

export type OpenAndIncreaseTunaLpPositionOrcaInstructionsArgs = Omit<
  OpenAndIncreaseTunaLpPositionOrcaInstructionDataArgs,
  "remainingAccountsInfo" | "minAddedAmountA" | "minAddedAmountB"
> & { maxAmountSlippage: number };

export async function openAndIncreaseTunaLpPositionOrcaInstructions(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  authority: TransactionSigner,
  whirlpoolAddress: Address,
  args: OpenAndIncreaseTunaLpPositionOrcaInstructionsArgs,
  createInstructions?: IInstruction[],
  cleanupInstructions?: IInstruction[],
): Promise<OpenAndIncreaseTunaLpPositionOrca> {
  const instructions: IInstruction[] = [];
  if (!createInstructions) createInstructions = instructions;
  if (!cleanupInstructions) cleanupInstructions = instructions;

  const rent = await fetchSysvarRent(rpc);
  let nonRefundableRent: bigint = 0n;

  const positionMint = await generateKeyPairSigner();

  const tunaConfig = await fetchTunaConfig(rpc, (await getTunaConfigAddress())[0]);

  const whirlpool = await fetchMaybeWhirlpool(rpc, whirlpoolAddress);
  if (!whirlpool.exists) throw new Error("Whirlpool account not found");

  const marketAddress = (await getMarketAddress(whirlpoolAddress))[0];
  const market = await fetchMarket(rpc, marketAddress);

  const [mintA, mintB] = await fetchAllMaybeMint(rpc, [whirlpool.data.tokenMintA, whirlpool.data.tokenMintB]);
  assert(mintA.exists, "Token A account not found");
  assert(mintB.exists, "Token B account not found");

  const [vaultA, vaultB] = await fetchAllVault(rpc, [
    (await getLendingVaultAddress(whirlpool.data.tokenMintA))[0],
    (await getLendingVaultAddress(whirlpool.data.tokenMintB))[0],
  ]);

  const increaseAmounts = getIncreaseLpPositionQuote({
    collateralA: BigInt(args.collateralA),
    collateralB: BigInt(args.collateralB),
    borrowA: BigInt(args.borrowA),
    borrowB: BigInt(args.borrowB),
    maxAmountSlippage: args.maxAmountSlippage,
    sqrtPrice: whirlpool.data.sqrtPrice,
    tickLowerIndex: args.tickLowerIndex,
    tickUpperIndex: args.tickUpperIndex,
    protocolFeeRate: market.data.protocolFee,
    protocolFeeRateOnCollateral: market.data.protocolFeeOnCollateral,
    swapFeeRate: whirlpool.data.feeRate,
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
  const lowerTickArrayIndex = getTickArrayStartTickIndex(args.tickLowerIndex, whirlpool.data.tickSpacing);
  const [lowerTickArrayAddress] = await getTickArrayAddress(whirlpool.address, lowerTickArrayIndex);

  const upperTickArrayIndex = getTickArrayStartTickIndex(args.tickUpperIndex, whirlpool.data.tickSpacing);
  const [upperTickArrayAddress] = await getTickArrayAddress(whirlpool.address, upperTickArrayIndex);

  const [lowerTickArray, upperTickArray] = await fetchAllMaybeTickArray(rpc, [
    lowerTickArrayAddress,
    upperTickArrayAddress,
  ]);

  // Create a tick array it doesn't exist.
  if (!lowerTickArray.exists) {
    instructions.push(
      getInitializeDynamicTickArrayInstruction({
        whirlpool: whirlpool.address,
        funder: authority,
        tickArray: lowerTickArrayAddress,
        startTickIndex: lowerTickArrayIndex,
        idempotent: false,
      }),
    );
    nonRefundableRent += calculateMinimumBalanceForRentExemption(rent, getDynamicTickArrayMinSize());
  }

  // Create a tick array it doesn't exist.
  if (!upperTickArray.exists && lowerTickArrayIndex !== upperTickArrayIndex) {
    instructions.push(
      getInitializeDynamicTickArrayInstruction({
        whirlpool: whirlpool.address,
        funder: authority,
        tickArray: upperTickArrayAddress,
        startTickIndex: upperTickArrayIndex,
        idempotent: false,
      }),
    );
    nonRefundableRent += calculateMinimumBalanceForRentExemption(rent, getDynamicTickArrayMinSize());
  }

  //
  // Finally add liquidity increase instruction.
  //

  const ix = await openAndIncreaseTunaLpPositionOrcaInstruction(
    authority,
    positionMint,
    tunaConfig,
    mintA,
    mintB,
    vaultA,
    vaultB,
    whirlpool,
    { ...args, minAddedAmountA: increaseAmounts.minTotalA, minAddedAmountB: increaseAmounts.minTotalB },
  );
  instructions.push(ix);

  //
  // Close WSOL accounts if needed.
  //

  cleanupInstructions.push(...createUserAtaAInstructions.cleanup);
  cleanupInstructions.push(...createUserAtaBInstructions.cleanup);

  return {
    instructions,
    positionMint: positionMint.address,
    initializationCost: lamports(nonRefundableRent),
  };
}

export async function openAndIncreaseTunaLpPositionOrcaInstruction(
  authority: TransactionSigner,
  positionMint: TransactionSigner,
  tunaConfig: Account<TunaConfig>,
  mintA: Account<Mint>,
  mintB: Account<Mint>,
  vaultA: Account<Vault>,
  vaultB: Account<Vault>,
  whirlpool: Account<Whirlpool>,
  args: Omit<OpenAndIncreaseTunaLpPositionOrcaInstructionDataArgs, "remainingAccountsInfo">,
): Promise<IInstruction> {
  const tunaPositionAddress = (await getTunaLpPositionAddress(positionMint.address))[0];

  const marketAddress = (await getMarketAddress(whirlpool.address))[0];
  const orcaPositionAddress = (await getPositionAddress(positionMint.address))[0];
  const orcaOracleAddress = (await getOracleAddress(whirlpool.address))[0];

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

  const swapTickArrays = await OrcaUtils.getSwapTickArrayAddresses(whirlpool);
  const lowerTickArrayAddress = await OrcaUtils.getTickArrayAddressFromTickIndex(whirlpool, args.tickLowerIndex);
  const upperTickArrayAddress = await OrcaUtils.getTickArrayAddressFromTickIndex(whirlpool, args.tickUpperIndex);

  const remainingAccounts: IAccountMeta[] = [
    { address: swapTickArrays[0], role: AccountRole.WRITABLE },
    { address: swapTickArrays[1], role: AccountRole.WRITABLE },
    { address: swapTickArrays[2], role: AccountRole.WRITABLE },
    { address: swapTickArrays[3], role: AccountRole.WRITABLE },
    { address: swapTickArrays[4], role: AccountRole.WRITABLE },
    { address: lowerTickArrayAddress, role: AccountRole.WRITABLE },
    { address: upperTickArrayAddress, role: AccountRole.WRITABLE },
    { address: whirlpool.data.tokenVaultA, role: AccountRole.WRITABLE },
    { address: whirlpool.data.tokenVaultB, role: AccountRole.WRITABLE },
    { address: orcaOracleAddress, role: AccountRole.WRITABLE },
  ];

  const remainingAccountsInfo = {
    slices: [
      { accountsType: AccountsType.SwapTickArrays, length: 5 },
      { accountsType: AccountsType.TickArrayLower, length: 1 },
      { accountsType: AccountsType.TickArrayUpper, length: 1 },
      { accountsType: AccountsType.PoolVaultTokenA, length: 1 },
      { accountsType: AccountsType.PoolVaultTokenB, length: 1 },
      { accountsType: AccountsType.WhirlpoolOracle, length: 1 },
    ],
  };

  const ix = getOpenAndIncreaseTunaLpPositionOrcaInstruction({
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
    whirlpool: whirlpool.address,
    whirlpoolProgram: WHIRLPOOL_PROGRAM_ADDRESS,
    orcaPosition: orcaPositionAddress,
    tokenProgramA: mintA.programAddress,
    tokenProgramB: mintB.programAddress,
    memoProgram: MEMO_PROGRAM_ADDRESS,
    metadataUpdateAuth: WP_NFT_UPDATE_AUTH,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    token2022Program: TOKEN_2022_PROGRAM_ADDRESS,
    ...args,
    remainingAccountsInfo,
  });

  // @ts-expect-error don't worry about the error
  ix.accounts.push(...remainingAccounts);

  return ix;
}
