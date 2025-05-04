import {
  type Account,
  AccountRole,
  GetAccountInfoApi,
  GetMultipleAccountsApi,
  IAccountMeta,
  IInstruction,
  Rpc,
  TransactionSigner,
} from "@solana/kit";
import { findAssociatedTokenPda, Mint, TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import { getTickArrayStartTickIndex } from "@orca-so/whirlpools-core";
import {
  fetchAllMaybeTickArray,
  getInitializeTickArrayInstruction,
  getOracleAddress,
  getPositionAddress,
  getTickArrayAddress,
  Whirlpool,
  WHIRLPOOL_PROGRAM_ADDRESS,
} from "@orca-so/whirlpools-client";
import {
  AddLiquidityOrcaInstructionDataArgs,
  getAddLiquidityOrcaInstruction,
  getMarketAddress,
  getSwapTickArrayAddresses,
  getTickArrayAddressFromTickIndex,
  TunaConfig,
  Vault,
  getCreateAtaInstructions,
  getTunaPositionAddress,
  TunaPosition,
} from "../index.ts";
import { MEMO_PROGRAM_ADDRESS } from "@solana-program/memo";

export async function addLiquidityOrcaInstructions(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  authority: TransactionSigner,
  tunaPosition: Account<TunaPosition>,
  tunaConfig: Account<TunaConfig>,
  mintA: Account<Mint>,
  mintB: Account<Mint>,
  vaultA: Account<Vault>,
  vaultB: Account<Vault>,
  whirlpool: Account<Whirlpool>,
  args: AddLiquidityOrcaInstructionDataArgs,
  createInstructions?: IInstruction[],
  cleanupInstructions?: IInstruction[],
): Promise<IInstruction[]> {
  const instructions: IInstruction[] = [];

  if (!createInstructions) createInstructions = instructions;
  if (!cleanupInstructions) cleanupInstructions = instructions;

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
  const lowerTickArrayIndex = getTickArrayStartTickIndex(tunaPosition.data.tickLowerIndex, whirlpool.data.tickSpacing);
  const [lowerTickArrayAddress] = await getTickArrayAddress(whirlpool.address, lowerTickArrayIndex);

  const upperTickArrayIndex = getTickArrayStartTickIndex(tunaPosition.data.tickUpperIndex, whirlpool.data.tickSpacing);
  const [upperTickArrayAddress] = await getTickArrayAddress(whirlpool.address, upperTickArrayIndex);

  const [lowerTickArray, upperTickArray] = await fetchAllMaybeTickArray(rpc, [
    lowerTickArrayAddress,
    upperTickArrayAddress,
  ]);

  // Create a tick array it doesn't exist.
  if (!lowerTickArray.exists) {
    instructions.push(
      getInitializeTickArrayInstruction({
        whirlpool: whirlpool.address,
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
        whirlpool: whirlpool.address,
        funder: authority,
        tickArray: upperTickArrayAddress,
        startTickIndex: upperTickArrayIndex,
      }),
    );
  }

  //
  // Finally add liquidity increase instruction.
  //

  const ix = await addLiquidityOrcaInstruction(
    authority,
    tunaPosition,
    tunaConfig,
    mintA,
    mintB,
    vaultA,
    vaultB,
    whirlpool,
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

export async function addLiquidityOrcaInstruction(
  authority: TransactionSigner,
  tunaPosition: Account<TunaPosition>,
  tunaConfig: Account<TunaConfig>,
  mintA: Account<Mint>,
  mintB: Account<Mint>,
  vaultA: Account<Vault>,
  vaultB: Account<Vault>,
  whirlpool: Account<Whirlpool>,
  args: AddLiquidityOrcaInstructionDataArgs,
): Promise<IInstruction> {
  const positionMint = tunaPosition.data.positionMint;
  const tunaPositionAddress = (await getTunaPositionAddress(positionMint))[0];

  const marketAddress = (await getMarketAddress(whirlpool.address))[0];
  const orcaPositionAddress = (await getPositionAddress(positionMint))[0];
  const orcaOracleAddress = (await getOracleAddress(whirlpool.address))[0];

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

  const swapTickArrays = await getSwapTickArrayAddresses(whirlpool);
  const lowerTickArrayAddress = await getTickArrayAddressFromTickIndex(whirlpool, tunaPosition.data.tickLowerIndex);
  const upperTickArrayAddress = await getTickArrayAddressFromTickIndex(whirlpool, tunaPosition.data.tickUpperIndex);

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

  const ix = getAddLiquidityOrcaInstruction({
    ...args,
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
    orcaPosition: orcaPositionAddress,
    tunaPosition: tunaPositionAddress,
    feeRecipientAtaA,
    feeRecipientAtaB,
    whirlpool: whirlpool.address,
    tokenProgramA: mintA.programAddress,
    tokenProgramB: mintB.programAddress,
    memoProgram: MEMO_PROGRAM_ADDRESS,
    whirlpoolProgram: WHIRLPOOL_PROGRAM_ADDRESS,
  });

  // @ts-expect-error don't worry about the error
  ix.accounts.push(...remainingAccounts);

  return ix;
}
