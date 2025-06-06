import { Address, Rpc, SolanaRpcApi, TransactionSigner } from "@solana/kit";
import { fetchMaybeToken, fetchMint, fetchToken, findAssociatedTokenPda } from "@solana-program/token-2022";
import { expect } from "vitest";

import {
  collectAndCompoundFeesFusionInstructions,
  collectAndCompoundFeesOrcaInstructions,
  fetchMarket,
  fetchTunaPosition,
  getLendingVaultAddress,
  getMarketAddress,
  getTunaPositionAddress,
  MarketMaker,
} from "../../src";

import { fetchPool, fetchPosition, getPositionAddress } from "./fetch.ts";
import { sendTransaction } from "./mockRpc.ts";

export type CollectAndCompoundFeesTestArgs = {
  rpc: Rpc<SolanaRpcApi>;
  signer: TransactionSigner;
  positionMint: Address;
  pool: Address;
  useLeverage: boolean;
};
export type CollectAndCompoundFeesTestResults = {
  vaultBalanceDeltaA: bigint;
  vaultBalanceDeltaB: bigint;
  poolBalanceDeltaA: bigint;
  poolBalanceDeltaB: bigint;
};
export type CollectAndCompoundFeesTestExpectations = {
  vaultBalanceDeltaA?: bigint;
  vaultBalanceDeltaB?: bigint;
  poolBalanceDeltaA?: bigint;
  poolBalanceDeltaB?: bigint;
};

export function assertCollectAndCompoundFees(
  results: CollectAndCompoundFeesTestResults,
  expectations: CollectAndCompoundFeesTestExpectations,
) {
  if (expectations.vaultBalanceDeltaA !== undefined)
    expect(results.vaultBalanceDeltaA).toEqual(expectations.vaultBalanceDeltaA);
  if (expectations.vaultBalanceDeltaB !== undefined)
    expect(results.vaultBalanceDeltaB).toEqual(expectations.vaultBalanceDeltaB);
  if (expectations.poolBalanceDeltaA !== undefined)
    expect(results.poolBalanceDeltaA).toEqual(expectations.poolBalanceDeltaA);
  if (expectations.poolBalanceDeltaB !== undefined)
    expect(results.poolBalanceDeltaB).toEqual(expectations.poolBalanceDeltaB);
}

export async function collectAndCompoundFees({
  rpc,
  signer,
  positionMint,
  pool: poolAddress,
  useLeverage,
}: CollectAndCompoundFeesTestArgs): Promise<CollectAndCompoundFeesTestResults> {
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

  const vaultAAddress = (await getLendingVaultAddress(mintA.address))[0];
  const vaultAAta = (
    await findAssociatedTokenPda({
      owner: vaultAAddress,
      mint: mintA.address,
      tokenProgram: mintA.programAddress,
    })
  )[0];
  //const vaultA = await fetchVault(rpc, vaultAAddress);

  const vaultBAddress = (await getLendingVaultAddress(mintB.address))[0];
  const vaultBAta = (
    await findAssociatedTokenPda({
      owner: vaultBAddress,
      mint: mintB.address,
      tokenProgram: mintB.programAddress,
    })
  )[0];
  //const vaultB = await fetchVault(rpc, vaultBAddress);

  const userTokenABefore = await fetchMaybeToken(rpc, tunaPositionOwnerAtaA);
  const userBalanceABefore = userTokenABefore.exists ? userTokenABefore.data.amount : 0n;
  const userTokenBBefore = await fetchMaybeToken(rpc, tunaPositionOwnerAtaB);
  const userBalanceBBefore = userTokenBBefore.exists ? userTokenBBefore.data.amount : 0n;
  const vaultABalanceBefore = (await fetchToken(rpc, vaultAAta)).data.amount;
  const vaultBBalanceBefore = (await fetchToken(rpc, vaultBAta)).data.amount;
  const poolBalanceABefore = (await fetchToken(rpc, pool.data.tokenVaultA)).data.amount;
  const poolBalanceBBefore = (await fetchToken(rpc, pool.data.tokenVaultB)).data.amount;

  // Collect fees!
  await sendTransaction(
    market.data.marketMaker == MarketMaker.Orca
      ? await collectAndCompoundFeesOrcaInstructions(rpc, signer, positionMint, useLeverage)
      : await collectAndCompoundFeesFusionInstructions(rpc, signer, positionMint, useLeverage),
  );

  const poolPositionAfter = await fetchPosition(rpc, positionAddress, market.data.marketMaker);
  const tunaPositionAfter = await fetchTunaPosition(rpc, tunaPositionAddress);
  expect(poolPositionAfter.data.liquidity).toEqual(tunaPositionAfter.data.liquidity);

  const tunaPositionBalanceAAfter = (await fetchToken(rpc, tunaPositionAtaA)).data.amount;
  const tunaPositionBalanceBAfter = (await fetchToken(rpc, tunaPositionAtaB)).data.amount;
  expect(tunaPositionAfter.data.leftoversA).toEqual(tunaPositionBalanceAAfter);
  expect(tunaPositionAfter.data.leftoversB).toEqual(tunaPositionBalanceBAfter);

  const userTokenAAfter = await fetchMaybeToken(rpc, tunaPositionOwnerAtaA);
  const userBalanceAAfter = userTokenAAfter.exists ? userTokenAAfter.data.amount : 0n;
  const userTokenBAfter = await fetchMaybeToken(rpc, tunaPositionOwnerAtaB);
  const userBalanceBAfter = userTokenBAfter.exists ? userTokenBAfter.data.amount : 0n;
  const vaultABalanceAfter = (await fetchToken(rpc, vaultAAta)).data.amount;
  const vaultBBalanceAfter = (await fetchToken(rpc, vaultBAta)).data.amount;
  const poolBalanceAAfter = (await fetchToken(rpc, pool.data.tokenVaultA)).data.amount;
  const poolBalanceBAfter = (await fetchToken(rpc, pool.data.tokenVaultB)).data.amount;

  expect(userBalanceAAfter - userBalanceABefore).toEqual(0n);
  expect(userBalanceBAfter - userBalanceBBefore).toEqual(0n);

  return {
    vaultBalanceDeltaA: vaultABalanceAfter - vaultABalanceBefore,
    vaultBalanceDeltaB: vaultBBalanceAfter - vaultBBalanceBefore,
    poolBalanceDeltaA: poolBalanceAAfter - poolBalanceABefore,
    poolBalanceDeltaB: poolBalanceBAfter - poolBalanceBBefore,
  };
}
