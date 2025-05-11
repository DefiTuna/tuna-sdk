import {
  fetchMaybeWhirlpool,
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
  getCollectAndCompoundFeesOrcaInstruction,
  getCreateAtaInstructions,
  getLendingVaultAddress,
  getMarketAddress,
  getSwapTickArrayAddresses,
  getTickArrayAddressFromTickIndex,
  getTunaConfigAddress,
  getTunaPositionAddress,
  TunaConfig,
  TunaPosition,
  Vault,
} from "../index.ts";

export async function collectAndCompoundFeesOrcaInstructions(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  authority: TransactionSigner,
  positionMint: Address,
  useLeverage: boolean,
): Promise<IInstruction[]> {
  const instructions: IInstruction[] = [];

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

  const ix = await collectAndCompoundFeesOrcaInstruction(
    authority,
    tunaConfig,
    tunaPosition,
    mintA,
    mintB,
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
  tunaConfig: Account<TunaConfig>,
  tunaPosition: Account<TunaPosition>,
  mintA: Account<Mint>,
  mintB: Account<Mint>,
  vaultA: Account<Vault>,
  vaultB: Account<Vault>,
  whirlpool: Account<Whirlpool>,
  useLeverage: boolean,
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

  const ix = getCollectAndCompoundFeesOrcaInstruction({
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
    orcaPosition: orcaPositionAddress,
    tunaPosition: tunaPosition.address,
    whirlpool: whirlpool.address,
    whirlpoolProgram: WHIRLPOOL_PROGRAM_ADDRESS,
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
