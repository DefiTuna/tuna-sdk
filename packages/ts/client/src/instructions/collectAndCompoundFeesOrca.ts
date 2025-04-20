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
import { getOracleAddress, getPositionAddress, Whirlpool, WHIRLPOOL_PROGRAM_ADDRESS } from "@orca-so/whirlpools-client";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  getCollectAndCompoundFeesOrcaInstruction,
  getCreateMaybeAtaInstructions,
  getMarketAddress,
  getSwapTickArrayAddresses,
  getTickArrayAddressFromTickIndex,
  TunaConfig,
  TunaPosition,
  Vault,
} from "../index.ts";

export async function collectAndCompoundFeesOrcaInstructions(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  authority: TransactionSigner,
  tunaConfig: Account<TunaConfig, Address>,
  tunaPosition: Account<TunaPosition, Address>,
  vaultA: Account<Vault, Address>,
  vaultB: Account<Vault, Address>,
  whirlpool: Account<Whirlpool, Address>,
  useLeverage: boolean,
): Promise<IInstruction[]> {
  const mintA = whirlpool.data.tokenMintA;
  const mintB = whirlpool.data.tokenMintB;
  const instructions: IInstruction[] = [];

  //
  // Add create fee recipient's token account instructions if needed.
  //

  const createFeeRecipientAtaAInstructions = await getCreateMaybeAtaInstructions(
    rpc,
    authority,
    mintA,
    tunaConfig.data.feeRecipient,
    TOKEN_PROGRAM_ADDRESS,
  );
  instructions.push(...createFeeRecipientAtaAInstructions.init);

  const createFeeRecipientAtaBInstructions = await getCreateMaybeAtaInstructions(
    rpc,
    authority,
    mintB,
    tunaConfig.data.feeRecipient,
    TOKEN_PROGRAM_ADDRESS,
  );
  instructions.push(...createFeeRecipientAtaBInstructions.init);

  //
  // Finally add collect and compound fees instruction.
  //

  const ix = await collectAndCompoundFeesOrcaInstruction(
    authority,
    tunaConfig,
    tunaPosition,
    vaultA,
    vaultB,
    whirlpool,
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

export async function collectAndCompoundFeesOrcaInstruction(
  authority: TransactionSigner,
  tunaConfig: Account<TunaConfig, Address>,
  tunaPosition: Account<TunaPosition, Address>,
  vaultA: Account<Vault, Address>,
  vaultB: Account<Vault, Address>,
  whirlpool: Account<Whirlpool, Address>,
  useLeverage: boolean,
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

  const ix = getCollectAndCompoundFeesOrcaInstruction({
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
    feeRecipientAtaA,
    feeRecipientAtaB,
    orcaPosition: orcaPositionAddress,
    tunaPosition: tunaPosition.address,
    whirlpool: whirlpool.address,
    whirlpoolProgram: WHIRLPOOL_PROGRAM_ADDRESS,
    useLeverage,
  });

  // @ts-expect-error don't worry about the error
  ix.accounts.push(...remainingAccounts);

  return ix;
}
