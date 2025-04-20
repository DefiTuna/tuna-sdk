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
import { findAssociatedTokenPda, TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
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
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  AddLiquidityOrcaInstructionDataArgs,
  getAddLiquidityOrcaInstruction,
  getMarketAddress,
  getSwapTickArrayAddresses,
  getTickArrayAddressFromTickIndex,
  TunaConfig,
  TunaPosition,
  Vault,
  getCreateAtaInstructions,
} from "../index.ts";

export async function addLiquidityOrcaInstructions(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  authority: TransactionSigner,
  tunaConfig: Account<TunaConfig, Address>,
  tunaPosition: Account<TunaPosition, Address>,
  vaultA: Account<Vault, Address>,
  vaultB: Account<Vault, Address>,
  whirlpool: Account<Whirlpool, Address>,
  args: AddLiquidityOrcaInstructionDataArgs,
  setupInstructions?: IInstruction[],
  cleanupInstructions?: IInstruction[],
): Promise<IInstruction[]> {
  const mintA = whirlpool.data.tokenMintA;
  const mintB = whirlpool.data.tokenMintB;
  const instructions: IInstruction[] = [];

  if (!setupInstructions) setupInstructions = instructions;
  if (!cleanupInstructions) cleanupInstructions = instructions;

  //
  // Add create user's token account instructions if needed.
  //

  const createUserAtaAInstructions = await getCreateAtaInstructions(
    authority,
    mintA,
    authority.address,
    TOKEN_PROGRAM_ADDRESS,
    args.collateralA,
  );
  setupInstructions.push(...createUserAtaAInstructions.init);

  const createUserAtaBInstructions = await getCreateAtaInstructions(
    authority,
    mintB,
    authority.address,
    TOKEN_PROGRAM_ADDRESS,
    args.collateralB,
  );
  setupInstructions.push(...createUserAtaBInstructions.init);

  //
  // Add create fee recipient's token account instructions if needed.
  //

  const createFeeRecipientAtaAInstructions = await getCreateAtaInstructions(
    authority,
    mintA,
    tunaConfig.data.feeRecipient,
    TOKEN_PROGRAM_ADDRESS,
  );
  setupInstructions.push(...createFeeRecipientAtaAInstructions.init);

  const createFeeRecipientAtaBInstructions = await getCreateAtaInstructions(
    authority,
    mintB,
    tunaConfig.data.feeRecipient,
    TOKEN_PROGRAM_ADDRESS,
  );
  setupInstructions.push(...createFeeRecipientAtaBInstructions.init);

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

  const ix = await addLiquidityOrcaInstruction(authority, tunaConfig, tunaPosition, vaultA, vaultB, whirlpool, args);
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
  tunaConfig: Account<TunaConfig, Address>,
  tunaPosition: Account<TunaPosition, Address>,
  vaultA: Account<Vault, Address>,
  vaultB: Account<Vault, Address>,
  whirlpool: Account<Whirlpool, Address>,
  args: AddLiquidityOrcaInstructionDataArgs,
): Promise<IInstruction> {
  const mintA = whirlpool.data.tokenMintA;
  const mintB = whirlpool.data.tokenMintB;
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

  const tunaPositionOwnerAtaA = (
    await findAssociatedTokenPda({
      owner: authority.address,
      mint: mintA,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
  )[0];

  const tunaPositionOwnerAtaB = (
    await findAssociatedTokenPda({
      owner: authority.address,
      mint: mintB,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
  )[0];

  const tunaPositionAtaA = (
    await findAssociatedTokenPda({
      owner: tunaPosition.address,
      mint: mintA,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
  )[0];

  const tunaPositionAtaB = (
    await findAssociatedTokenPda({
      owner: tunaPosition.address,
      mint: mintB,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
  )[0];

  const vaultAAta = (
    await findAssociatedTokenPda({
      owner: vaultA.address,
      mint: mintA,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
  )[0];

  const vaultBAta = (
    await findAssociatedTokenPda({
      owner: vaultB.address,
      mint: mintB,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
  )[0];

  const feeRecipientAtaA = (
    await findAssociatedTokenPda({
      owner: tunaConfig.data.feeRecipient,
      mint: mintA,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
  )[0];

  const feeRecipientAtaB = (
    await findAssociatedTokenPda({
      owner: tunaConfig.data.feeRecipient,
      mint: mintB,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
  )[0];

  const aToBTickArrays = await getSwapTickArrayAddresses(whirlpool, true);
  const bToATickArrays = await getSwapTickArrayAddresses(whirlpool, false);
  const lowerTickArrayAddress = await getTickArrayAddressFromTickIndex(whirlpool, tunaPosition.data.tickLowerIndex);
  const upperTickArrayAddress = await getTickArrayAddressFromTickIndex(whirlpool, tunaPosition.data.tickUpperIndex);

  const remainingAccounts: IAccountMeta[] = [
    { address: aToBTickArrays[0], role: AccountRole.WRITABLE },
    { address: aToBTickArrays[1], role: AccountRole.WRITABLE },
    { address: aToBTickArrays[2], role: AccountRole.WRITABLE },
    { address: bToATickArrays[0], role: AccountRole.WRITABLE },
    { address: bToATickArrays[1], role: AccountRole.WRITABLE },
    { address: bToATickArrays[2], role: AccountRole.WRITABLE },
    { address: lowerTickArrayAddress, role: AccountRole.WRITABLE },
    { address: upperTickArrayAddress, role: AccountRole.WRITABLE },
    { address: whirlpool.data.tokenVaultA, role: AccountRole.WRITABLE },
    { address: whirlpool.data.tokenVaultB, role: AccountRole.WRITABLE },
    { address: orcaOracleAddress, role: AccountRole.WRITABLE },
  ];

  const ix = getAddLiquidityOrcaInstruction({
    ...args,
    market: marketAddress,
    mintA,
    mintB,
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
    tunaPosition: tunaPosition.address,
    feeRecipientAtaA,
    feeRecipientAtaB,
    whirlpool: whirlpool.address,
    whirlpoolProgram: WHIRLPOOL_PROGRAM_ADDRESS,
  });

  // @ts-expect-error don't worry about the error
  ix.accounts.push(...remainingAccounts);

  return ix;
}
