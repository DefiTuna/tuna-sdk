import { type Account, AccountRole, IAccountMeta, IInstruction, TransactionSigner } from "@solana/kit";
import { findAssociatedTokenPda, Mint, TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import { getOracleAddress, getPositionAddress, Whirlpool, WHIRLPOOL_PROGRAM_ADDRESS } from "@orca-so/whirlpools-client";
import {
  getCreateAtaInstructions,
  getMarketAddress,
  getRemoveLiquidityOrcaInstruction,
  getSwapTickArrayAddresses,
  getTickArrayAddressFromTickIndex,
  getTunaConfigAddress,
  RemoveLiquidityOrcaInstructionDataArgs,
  TunaPosition,
  Vault,
} from "../index.ts";
import { MEMO_PROGRAM_ADDRESS } from "@solana-program/memo";

export async function removeLiquidityOrcaInstructions(
  authority: TransactionSigner,
  tunaPosition: Account<TunaPosition>,
  mintA: Account<Mint>,
  mintB: Account<Mint>,
  vaultA: Account<Vault>,
  vaultB: Account<Vault>,
  whirlpool: Account<Whirlpool>,
  args: RemoveLiquidityOrcaInstructionDataArgs,
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
  );
  createInstructions.push(...createUserAtaAInstructions.init);

  const createUserAtaBInstructions = await getCreateAtaInstructions(
    authority,
    mintB.address,
    authority.address,
    mintB.programAddress,
  );
  createInstructions.push(...createUserAtaBInstructions.init);

  //
  // Finally add liquidity decrease instruction.
  //

  const ix = await removeLiquidityOrcaInstruction(
    authority,
    tunaPosition,
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

  return instructions;
}

export async function removeLiquidityOrcaInstruction(
  authority: TransactionSigner,
  tunaPosition: Account<TunaPosition>,
  mintA: Account<Mint>,
  mintB: Account<Mint>,
  vaultA: Account<Vault>,
  vaultB: Account<Vault>,
  whirlpool: Account<Whirlpool>,
  args: RemoveLiquidityOrcaInstructionDataArgs,
): Promise<IInstruction> {
  const positionMint = tunaPosition.data.positionMint;

  const tunaConfig = (await getTunaConfigAddress())[0];
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

  const ix = getRemoveLiquidityOrcaInstruction({
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
    tunaConfig,
    tunaPositionAta,
    tunaPositionAtaA,
    tunaPositionAtaB,
    tunaPositionOwnerAtaA,
    tunaPositionOwnerAtaB,
    orcaPosition: orcaPositionAddress,
    tunaPosition: tunaPosition.address,
    whirlpool: whirlpool.address,
    whirlpoolProgram: WHIRLPOOL_PROGRAM_ADDRESS,
    tokenProgramA: mintA.programAddress,
    tokenProgramB: mintB.programAddress,
    memoProgram: MEMO_PROGRAM_ADDRESS,
  });

  // @ts-expect-error don't worry about the error
  ix.accounts.push(...remainingAccounts);

  return ix;
}
