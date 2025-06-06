import { fetchFusionPool, fetchPosition as fetchFusionPosition } from "@crypticdot/fusionamm-client";
import { DEFAULT_ADDRESS } from "@orca-so/whirlpools";
import { fetchPosition as fetchOrcaPosition, fetchWhirlpool, Whirlpool } from "@orca-so/whirlpools-client";
import { Account, Address, IInstruction, Rpc, SolanaRpcApi, TransactionSigner } from "@solana/kit";
import { getSetComputeUnitLimitInstruction } from "@solana-program/compute-budget";
import { fetchMaybeToken, fetchMint, fetchToken, findAssociatedTokenPda } from "@solana-program/token-2022";
import { assert, expect } from "vitest";

import {
  closePositionFusionInstruction,
  closePositionOrcaInstruction,
  fetchMarket,
  fetchTunaPosition,
  getLendingVaultAddress,
  getMarketAddress,
  getTunaPositionAddress,
  HUNDRED_PERCENT,
  MarketMaker,
  removeLiquidityFusionInstructions,
  removeLiquidityOrcaInstructions,
} from "../../src";

import { getPositionAddress } from "./fetch.ts";
import { sendTransaction } from "./mockRpc.ts";

export type RemoveLiquidityTestArgs = {
  rpc: Rpc<SolanaRpcApi>;
  signer: TransactionSigner;
  positionMint: Address;
  pool: Address;
  withdrawPercent?: number;
  maxAmountSlippage?: number;
  maxSwapSlippage?: number;
  swapToToken?: number;
  closePosition?: boolean;
};
export type RemoveLiquidityTestResults = {
  userBalanceDeltaA: bigint;
  userBalanceDeltaB: bigint;
  userRewardBalanceDelta: bigint;
  vaultBalanceDeltaA: bigint;
  vaultBalanceDeltaB: bigint;
  poolBalanceDeltaA: bigint;
  poolBalanceDeltaB: bigint;
};
export type RemoveLiquidityTestExpectations = {
  userBalanceDeltaA?: bigint;
  userBalanceDeltaB?: bigint;
  userRewardBalanceDelta?: bigint;
  vaultBalanceDeltaA?: bigint;
  vaultBalanceDeltaB?: bigint;
  poolBalanceDeltaA?: bigint;
  poolBalanceDeltaB?: bigint;
};

export function assertRemoveLiquidity(
  results: RemoveLiquidityTestResults,
  expectations: RemoveLiquidityTestExpectations,
) {
  if (expectations.userBalanceDeltaA !== undefined)
    expect(results.userBalanceDeltaA).toEqual(expectations.userBalanceDeltaA);
  if (expectations.userBalanceDeltaB !== undefined)
    expect(results.userBalanceDeltaB).toEqual(expectations.userBalanceDeltaB);
  if (expectations.userRewardBalanceDelta !== undefined)
    expect(results.userRewardBalanceDelta).toEqual(expectations.userRewardBalanceDelta);
  if (expectations.vaultBalanceDeltaA !== undefined)
    expect(results.vaultBalanceDeltaA).toEqual(expectations.vaultBalanceDeltaA);
  if (expectations.vaultBalanceDeltaB !== undefined)
    expect(results.vaultBalanceDeltaB).toEqual(expectations.vaultBalanceDeltaB);
  if (expectations.poolBalanceDeltaA !== undefined)
    expect(results.poolBalanceDeltaA).toEqual(expectations.poolBalanceDeltaA);
  if (expectations.poolBalanceDeltaB !== undefined)
    expect(results.poolBalanceDeltaB).toEqual(expectations.poolBalanceDeltaB);
}

export async function removeLiquidity({
  rpc,
  signer,
  positionMint,
  pool: poolAddress,
  withdrawPercent,
  maxAmountSlippage,
  maxSwapSlippage,
  swapToToken,
  closePosition,
}: RemoveLiquidityTestArgs): Promise<RemoveLiquidityTestResults> {
  const marketAddress = (await getMarketAddress(poolAddress))[0];
  const market = await fetchMarket(rpc, marketAddress);
  const isOrcaMarket = market.data.marketMaker == MarketMaker.Orca;
  const pool = isOrcaMarket ? await fetchWhirlpool(rpc, poolAddress) : await fetchFusionPool(rpc, poolAddress);
  const whirlpool = pool as Account<Whirlpool, Address>;

  const mintA = await fetchMint(rpc, pool.data.tokenMintA);
  const mintB = await fetchMint(rpc, pool.data.tokenMintB);

  const rewardMint =
    isOrcaMarket && whirlpool.data.rewardInfos[0].mint != DEFAULT_ADDRESS
      ? await fetchMint(rpc, whirlpool.data.rewardInfos[0].mint)
      : undefined;

  const positionAddress = (await getPositionAddress(positionMint, market.data.marketMaker))[0];

  const tunaPositionAddress = (await getTunaPositionAddress(positionMint))[0];
  //const tunaPosition = await fetchTunaPosition(rpc, tunaPositionAddress);

  const tunaPositionOwnerAtaA = (
    await findAssociatedTokenPda({
      owner: signer.address,
      mint: mintA.address,
      tokenProgram: mintA.programAddress,
    })
  )[0];

  const tunaPositionOwnerAtaB = (
    await findAssociatedTokenPda({
      owner: signer.address,
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

  const createInstructions: IInstruction[] = [];
  const cleanupInstructions: IInstruction[] = [];

  // Prepare remove liquidity instructions
  const instructions: IInstruction[] = [];
  instructions.push(getSetComputeUnitLimitInstruction({ units: 1_400_000 }));

  const removeLiquidityArgs = {
    withdrawPercent: withdrawPercent ?? HUNDRED_PERCENT,
    maxSwapSlippage: maxSwapSlippage ?? HUNDRED_PERCENT,
    maxAmountSlippage: maxAmountSlippage ?? HUNDRED_PERCENT,
    swapToToken: swapToToken ?? 0,
  };

  if (isOrcaMarket) {
    instructions.push(
      ...(await removeLiquidityOrcaInstructions(
        rpc,
        signer,
        positionMint,
        removeLiquidityArgs,
        createInstructions,
        cleanupInstructions,
      )),
    );
  } else {
    instructions.push(
      ...(await removeLiquidityFusionInstructions(
        rpc,
        signer,
        positionMint,
        removeLiquidityArgs,
        createInstructions,
        cleanupInstructions,
      )),
    );
  }

  // Setup instructions create ATAs and WSOL account if needed.
  await sendTransaction(createInstructions);

  const userTokenABefore = await fetchMaybeToken(rpc, tunaPositionOwnerAtaA);
  const userBalanceABefore = userTokenABefore.exists ? userTokenABefore.data.amount : 0n;
  const userTokenBBefore = await fetchMaybeToken(rpc, tunaPositionOwnerAtaB);
  const userBalanceBBefore = userTokenBBefore.exists ? userTokenBBefore.data.amount : 0n;
  const vaultABalanceBefore = (await fetchToken(rpc, vaultAAta)).data.amount;
  const vaultBBalanceBefore = (await fetchToken(rpc, vaultBAta)).data.amount;
  const poolBalanceABefore = (await fetchToken(rpc, pool.data.tokenVaultA)).data.amount;
  const poolBalanceBBefore = (await fetchToken(rpc, pool.data.tokenVaultB)).data.amount;

  let userRewardBalanceBefore = 0n;
  let userRewardAta: Address = DEFAULT_ADDRESS;
  if (rewardMint) {
    userRewardAta = (
      await findAssociatedTokenPda({
        owner: signer.address,
        mint: rewardMint.address,
        tokenProgram: rewardMint.programAddress,
      })
    )[0];
    const token = await fetchMaybeToken(rpc, userRewardAta);
    if (token.exists) {
      userRewardBalanceBefore = token.data.amount;
    }
  }

  // Remove liquidity!
  await sendTransaction(instructions);

  const positionAfter = isOrcaMarket
    ? await fetchOrcaPosition(rpc, positionAddress)
    : await fetchFusionPosition(rpc, positionAddress);

  const tunaPositionAfter = await fetchTunaPosition(rpc, tunaPositionAddress);

  assert(positionAfter.data.liquidity == tunaPositionAfter.data.liquidity, "Incorrect liquidity in tuna position");

  const tunaPositionBalanceAAfter = (await fetchToken(rpc, tunaPositionAtaA)).data.amount;
  const tunaPositionBalanceBAfter = (await fetchToken(rpc, tunaPositionAtaB)).data.amount;
  assert(tunaPositionAfter.data.leftoversA == tunaPositionBalanceAAfter, "Incorrect leftovers of token A");
  assert(tunaPositionAfter.data.leftoversB == tunaPositionBalanceBAfter, "Incorrect leftovers of token B");

  const userTokenAAfter = await fetchMaybeToken(rpc, tunaPositionOwnerAtaA);
  const userBalanceAAfter = userTokenAAfter.exists ? userTokenAAfter.data.amount : 0n;
  const userTokenBAfter = await fetchMaybeToken(rpc, tunaPositionOwnerAtaB);
  const userBalanceBAfter = userTokenBAfter.exists ? userTokenBAfter.data.amount : 0n;
  const vaultABalanceAfter = (await fetchToken(rpc, vaultAAta)).data.amount;
  const vaultBBalanceAfter = (await fetchToken(rpc, vaultBAta)).data.amount;
  const poolBalanceAAfter = (await fetchToken(rpc, pool.data.tokenVaultA)).data.amount;
  const poolBalanceBAfter = (await fetchToken(rpc, pool.data.tokenVaultB)).data.amount;

  let userRewardBalanceAfter = 0n;
  if (rewardMint) {
    const token = await fetchMaybeToken(rpc, userRewardAta);
    if (token.exists) {
      userRewardBalanceAfter = token.data.amount;
    }
  }

  if (closePosition) {
    await sendTransaction([
      isOrcaMarket
        ? await closePositionOrcaInstruction(rpc, signer, positionMint)
        : await closePositionFusionInstruction(rpc, signer, positionMint),
    ]);
  }

  // Cleanup instructions close WSOL accounts.
  await sendTransaction(cleanupInstructions);

  return {
    poolBalanceDeltaA: poolBalanceAAfter - poolBalanceABefore,
    poolBalanceDeltaB: poolBalanceBAfter - poolBalanceBBefore,
    userBalanceDeltaA: userBalanceAAfter - userBalanceABefore,
    userBalanceDeltaB: userBalanceBAfter - userBalanceBBefore,
    userRewardBalanceDelta: userRewardBalanceAfter - userRewardBalanceBefore,
    vaultBalanceDeltaA: vaultABalanceAfter - vaultABalanceBefore,
    vaultBalanceDeltaB: vaultBBalanceAfter - vaultBBalanceBefore,
  };
}
