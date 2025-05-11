import {
  fetchAllTickArray,
  fetchMaybeWhirlpool,
  fetchPosition,
  getPositionAddress,
  getTickArrayAddress,
  WHIRLPOOL_PROGRAM_ADDRESS,
} from "@orca-so/whirlpools-client";
import { collectRewardsQuote, getTickArrayStartTickIndex, getTickIndexInArray } from "@orca-so/whirlpools-core";
import {
  Address,
  assertAccountsExist,
  GetAccountInfoApi,
  GetMultipleAccountsApi,
  IInstruction,
  Rpc,
  TransactionSigner,
} from "@solana/kit";
import { fetchAllMaybeMint, findAssociatedTokenPda, TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import assert from "assert";

import {
  DEFAULT_ADDRESS,
  fetchAllVault,
  fetchMaybeTunaPosition,
  getClosePositionOrcaInstruction,
  getCreateAtaInstructions,
  getLendingVaultAddress,
  getTunaPositionAddress,
  HUNDRED_PERCENT,
  removeLiquidityOrcaInstruction,
} from "../index.ts";

export type ClosePositionWithLiquidityOrcaInstructionArgs = {
  swapToToken: number;
  minRemovedAmountA: number | bigint;
  minRemovedAmountB: number | bigint;
  maxSwapSlippage: number;
};

export async function closePositionWithLiquidityOrcaInstructions(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  authority: TransactionSigner,
  positionMint: Address,
  args: ClosePositionWithLiquidityOrcaInstructionArgs,
): Promise<IInstruction[]> {
  const tunaPosition = await fetchMaybeTunaPosition(rpc, (await getTunaPositionAddress(positionMint))[0]);
  if (!tunaPosition.exists) throw new Error("Tuna position account not found");

  const orcaPosition = await fetchPosition(rpc, (await getPositionAddress(positionMint))[0]);

  const whirlpool = await fetchMaybeWhirlpool(rpc, tunaPosition.data.pool);
  if (!whirlpool.exists) throw new Error("Whirlpool account not found");

  const [vaultA, vaultB] = await fetchAllVault(rpc, [
    (await getLendingVaultAddress(whirlpool.data.tokenMintA))[0],
    (await getLendingVaultAddress(whirlpool.data.tokenMintB))[0],
  ]);

  const [mintA, mintB, ...rewardMints] = await fetchAllMaybeMint(rpc, [
    whirlpool.data.tokenMintA,
    whirlpool.data.tokenMintB,
    ...whirlpool.data.rewardInfos.map(x => x.mint).filter(x => x !== DEFAULT_ADDRESS),
  ]);
  const allMints = [mintA, mintB, ...rewardMints];

  assert(mintA.exists, "Token A account not found");
  assert(mintB.exists, "Token B account not found");
  assertAccountsExist(rewardMints);

  const lowerTickArrayStartIndex = getTickArrayStartTickIndex(
    tunaPosition.data.tickLowerIndex,
    whirlpool.data.tickSpacing,
  );
  const [lowerTickArrayAddress] = await getTickArrayAddress(whirlpool.address, lowerTickArrayStartIndex);

  const upperTickArrayStartIndex = getTickArrayStartTickIndex(
    tunaPosition.data.tickUpperIndex,
    whirlpool.data.tickSpacing,
  );
  const [upperTickArrayAddress] = await getTickArrayAddress(whirlpool.address, upperTickArrayStartIndex);

  const [lowerTickArray, upperTickArray] = await fetchAllTickArray(rpc, [lowerTickArrayAddress, upperTickArrayAddress]);

  const lowerTick =
    lowerTickArray.data.ticks[
      getTickIndexInArray(tunaPosition.data.tickLowerIndex, lowerTickArrayStartIndex, whirlpool.data.tickSpacing)
    ];
  const upperTick =
    upperTickArray.data.ticks[
      getTickIndexInArray(tunaPosition.data.tickUpperIndex, upperTickArrayStartIndex, whirlpool.data.tickSpacing)
    ];

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

  //
  // Collect the list of instructions.
  //

  const instructions: IInstruction[] = [];
  const cleanupInstructions: IInstruction[] = [];

  //
  // Add token account creation instructions for every mint if needed.
  //

  const rewardsToClaim: number[] = [];
  const requiredMints: Address[] = [];
  requiredMints.push(whirlpool.data.tokenMintA);
  requiredMints.push(whirlpool.data.tokenMintB);

  let currentUnixTimestamp = BigInt(Math.floor(Date.now() / 1000));
  // It may happen in tests or in case of a wrong date.
  if (currentUnixTimestamp < whirlpool.data.rewardLastUpdatedTimestamp)
    currentUnixTimestamp = whirlpool.data.rewardLastUpdatedTimestamp;

  const rewardsQuote = collectRewardsQuote(
    whirlpool.data,
    orcaPosition.data,
    lowerTick,
    upperTick,
    currentUnixTimestamp,
  );

  for (let i = 0; i < rewardsQuote.rewards.length; i++) {
    if (rewardsQuote.rewards[i].rewardsOwed > 0n) {
      requiredMints.push(whirlpool.data.rewardInfos[i].mint);
      rewardsToClaim.push(i);
    }
  }

  for (const mintAddress of requiredMints) {
    const mint = allMints.find(mint => mint.address == mintAddress);
    assert(mint && mint.exists);

    const ixs = await getCreateAtaInstructions(authority, mint.address, authority.address, mint.programAddress);

    instructions.push(...ixs.init);
    cleanupInstructions.push(...ixs.cleanup);
  }

  // Add liquidity decrease instruction.
  instructions.push(
    await removeLiquidityOrcaInstruction(
      authority,
      tunaPosition,
      mintA,
      mintB,
      vaultA,
      vaultB,
      whirlpool,
      rewardsToClaim,
      rewardMints,
      {
        ...args,
        withdrawPercent: HUNDRED_PERCENT,
      },
    ),
  );

  // Close WSOL accounts if needed.
  instructions.push(...cleanupInstructions);

  // Add close position instruction.
  instructions.push(
    getClosePositionOrcaInstruction({
      mintA: mintA.address,
      mintB: mintB.address,
      authority,
      tunaPositionMint: positionMint,
      tunaPositionAta,
      tunaPositionAtaA,
      tunaPositionAtaB,
      orcaPosition: orcaPosition.address,
      tunaPosition: tunaPosition.address,
      whirlpoolProgram: WHIRLPOOL_PROGRAM_ADDRESS,
      tokenProgramA: mintA.programAddress,
      tokenProgramB: mintB.programAddress,
      token2022Program: TOKEN_2022_PROGRAM_ADDRESS,
    }),
  );

  return instructions;
}
