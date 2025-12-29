import {
  type Account,
  Address,
  GetAccountInfoApi,
  GetMultipleAccountsApi,
  IInstruction,
  Rpc,
  TransactionSigner,
} from "@solana/kit";
import { MEMO_PROGRAM_ADDRESS } from "@solana-program/memo";
import { fetchAllMaybeMint, findAssociatedTokenPda, Mint } from "@solana-program/token-2022";
import assert from "assert";

import { fetchTunaLpPosition, getRepayTunaLpPositionDebtInstruction } from "../generated";
import { getLendingVaultAddress, getMarketAddress, getTunaLpPositionAddress } from "../pda.ts";
import { getCreateAtaInstructions } from "../utils";

export async function repayTunaLpPositionDebtInstructions(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  authority: TransactionSigner,
  positionMint: Address,
  collateralA: bigint,
  collateralB: bigint,
  createInstructions?: IInstruction[],
  cleanupInstructions?: IInstruction[],
): Promise<IInstruction[]> {
  const instructions: IInstruction[] = [];
  if (!createInstructions) createInstructions = instructions;
  if (!cleanupInstructions) cleanupInstructions = instructions;

  const tunaPosition = await fetchTunaLpPosition(rpc, (await getTunaLpPositionAddress(positionMint))[0]);

  const [mintA, mintB] = await fetchAllMaybeMint(rpc, [tunaPosition.data.mintA, tunaPosition.data.mintB]);
  assert(mintA.exists, "Token A not found");
  assert(mintB.exists, "Token B not found");

  const marketAddress = (await getMarketAddress(tunaPosition.data.pool))[0];

  //
  // Add create user's token account instructions if needed.
  //

  const createUserAtaAInstructions = await getCreateAtaInstructions(
    rpc,
    authority,
    mintA.address,
    authority.address,
    mintA.programAddress,
  );
  createInstructions.push(...createUserAtaAInstructions.init);

  const createUserAtaBInstructions = await getCreateAtaInstructions(
    rpc,
    authority,
    mintB.address,
    authority.address,
    mintB.programAddress,
  );
  createInstructions.push(...createUserAtaBInstructions.init);

  const ix = await repayTunaLpPositionDebtInstruction(
    authority,
    positionMint,
    mintA,
    mintB,
    marketAddress,
    collateralA,
    collateralB,
  );
  instructions.push(ix);

  //
  // Close WSOL accounts if needed.
  //

  cleanupInstructions.push(...createUserAtaAInstructions.cleanup);
  cleanupInstructions.push(...createUserAtaBInstructions.cleanup);

  return instructions;
}

export async function repayTunaLpPositionDebtInstruction(
  authority: TransactionSigner,
  positionMint: Address,
  mintA: Account<Mint>,
  mintB: Account<Mint>,
  marketAddress: Address,
  collateralA: bigint,
  collateralB: bigint,
): Promise<IInstruction> {
  const tunaPositionAddress = (await getTunaLpPositionAddress(positionMint))[0];

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

  const vaultAAddress = (await getLendingVaultAddress(mintA.address))[0];
  const vaultAAta = (
    await findAssociatedTokenPda({
      owner: vaultAAddress,
      mint: mintA.address,
      tokenProgram: mintA.programAddress,
    })
  )[0];

  const vaultBAddress = (await getLendingVaultAddress(mintB.address))[0];
  const vaultBAta = (
    await findAssociatedTokenPda({
      owner: vaultBAddress,
      mint: mintB.address,
      tokenProgram: mintB.programAddress,
    })
  )[0];

  return getRepayTunaLpPositionDebtInstruction({
    authority,
    market: marketAddress,
    memoProgram: MEMO_PROGRAM_ADDRESS,
    mintA: mintA.address,
    mintB: mintB.address,
    tokenProgramA: mintA.programAddress,
    tokenProgramB: mintB.programAddress,
    tunaPosition: tunaPositionAddress,
    tunaPositionAtaA,
    tunaPositionAtaB,
    tunaPositionOwnerAtaA,
    tunaPositionOwnerAtaB,
    vaultA: vaultAAddress,
    vaultAAta,
    vaultB: vaultBAddress,
    vaultBAta,
    collateralFundsA: collateralA,
    collateralFundsB: collateralB,
  });
}
