import { Address, IInstruction, Rpc, SolanaRpcApi, TransactionSigner } from "@solana/kit";
import { fetchMaybeToken, fetchMint, fetchToken, findAssociatedTokenPda } from "@solana-program/token-2022";
import { expect } from "vitest";

import {
  collectFeesFusionInstructions,
  collectFeesOrcaInstructions,
  fetchMarket,
  fetchTunaPosition,
  getMarketAddress,
  getTunaPositionAddress,
  MarketMaker,
} from "../../src";

import { fetchPool, fetchPosition, getPositionAddress } from "./fetch.ts";
import { sendTransaction } from "./mockRpc.ts";

export type CollectFeesTestArgs = {
  rpc: Rpc<SolanaRpcApi>;
  signer: TransactionSigner;
  positionMint: Address;
  pool: Address;
};

export type CollectFeesTestResults = {
  userBalanceDeltaA: bigint;
  userBalanceDeltaB: bigint;
  poolBalanceDeltaA: bigint;
  poolBalanceDeltaB: bigint;
};
export type CollectFeesTestExpectations = {
  userBalanceDeltaA?: bigint;
  userBalanceDeltaB?: bigint;
  poolBalanceDeltaA?: bigint;
  poolBalanceDeltaB?: bigint;
};

export function assertCollectFees(results: CollectFeesTestResults, expectations: CollectFeesTestExpectations) {
  if (expectations.userBalanceDeltaA !== undefined)
    expect(results.userBalanceDeltaA).toEqual(expectations.userBalanceDeltaA);
  if (expectations.userBalanceDeltaB !== undefined)
    expect(results.userBalanceDeltaB).toEqual(expectations.userBalanceDeltaB);
  if (expectations.poolBalanceDeltaA !== undefined)
    expect(results.poolBalanceDeltaA).toEqual(expectations.poolBalanceDeltaA);
  if (expectations.poolBalanceDeltaB !== undefined)
    expect(results.poolBalanceDeltaB).toEqual(expectations.poolBalanceDeltaB);
}

export async function collectFees({
  rpc,
  signer,
  positionMint,
  pool: poolAddress,
}: CollectFeesTestArgs): Promise<CollectFeesTestResults> {
  const marketAddress = (await getMarketAddress(poolAddress))[0];
  const market = await fetchMarket(rpc, marketAddress);

  const pool = await fetchPool(rpc, poolAddress, market.data.marketMaker);
  const mintA = await fetchMint(rpc, pool.data.tokenMintA);
  const mintB = await fetchMint(rpc, pool.data.tokenMintB);

  const positionAddress = (await getPositionAddress(positionMint, market.data.marketMaker))[0];
  const tunaPositionAddress = (await getTunaPositionAddress(positionMint))[0];

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

  const createInstructions: IInstruction[] = [];
  const cleanupInstructions: IInstruction[] = [];

  // Collect fees!
  const instructions: IInstruction[] = [];
  if (market.data.marketMaker == MarketMaker.Orca) {
    instructions.push(
      ...(await collectFeesOrcaInstructions(rpc, signer, positionMint, createInstructions, cleanupInstructions)),
    );
  } else {
    instructions.push(
      ...(await collectFeesFusionInstructions(rpc, signer, positionMint, createInstructions, cleanupInstructions)),
    );
  }

  // Setup instructions create ATAs and WSOL account if needed.
  await sendTransaction(createInstructions);

  const userTokenABefore = await fetchMaybeToken(rpc, tunaPositionOwnerAtaA);
  const userBalanceABefore = userTokenABefore.exists ? userTokenABefore.data.amount : 0n;
  const userTokenBBefore = await fetchMaybeToken(rpc, tunaPositionOwnerAtaB);
  const userBalanceBBefore = userTokenBBefore.exists ? userTokenBBefore.data.amount : 0n;
  const poolBalanceABefore = (await fetchToken(rpc, pool.data.tokenVaultA)).data.amount;
  const poolBalanceBBefore = (await fetchToken(rpc, pool.data.tokenVaultB)).data.amount;

  // Remove liquidity!
  await sendTransaction(instructions);

  const positionAfter = await fetchPosition(rpc, positionAddress, market.data.marketMaker);
  const tunaPositionAfter = await fetchTunaPosition(rpc, tunaPositionAddress);
  expect(positionAfter.data.liquidity).toEqual(tunaPositionAfter.data.liquidity);

  const tunaPositionBalanceAAfter = (await fetchToken(rpc, tunaPositionAtaA)).data.amount;
  const tunaPositionBalanceBAfter = (await fetchToken(rpc, tunaPositionAtaB)).data.amount;
  expect(tunaPositionAfter.data.leftoversA).toEqual(tunaPositionBalanceAAfter);
  expect(tunaPositionAfter.data.leftoversB).toEqual(tunaPositionBalanceBAfter);

  const userTokenAAfter = await fetchMaybeToken(rpc, tunaPositionOwnerAtaA);
  const userBalanceAAfter = userTokenAAfter.exists ? userTokenAAfter.data.amount : 0n;
  const userTokenBAfter = await fetchMaybeToken(rpc, tunaPositionOwnerAtaB);
  const userBalanceBAfter = userTokenBAfter.exists ? userTokenBAfter.data.amount : 0n;
  const poolBalanceAAfter = (await fetchToken(rpc, pool.data.tokenVaultA)).data.amount;
  const poolBalanceBAfter = (await fetchToken(rpc, pool.data.tokenVaultB)).data.amount;

  // Cleanup instructions close WSOL accounts.
  await sendTransaction(cleanupInstructions);

  return {
    poolBalanceDeltaA: poolBalanceAAfter - poolBalanceABefore,
    poolBalanceDeltaB: poolBalanceBAfter - poolBalanceBBefore,
    userBalanceDeltaA: userBalanceAAfter - userBalanceABefore,
    userBalanceDeltaB: userBalanceBAfter - userBalanceBBefore,
  };
}
