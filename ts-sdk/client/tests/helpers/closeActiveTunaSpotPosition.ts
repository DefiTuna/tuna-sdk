import { Address, IInstruction, Rpc, SolanaRpcApi, TransactionSigner } from "@solana/kit";
import { getSetComputeUnitLimitInstruction } from "@solana-program/compute-budget";
import { fetchMaybeToken, fetchMint, fetchToken, findAssociatedTokenPda } from "@solana-program/token-2022";
import { expect } from "vitest";

import {
  closeActiveTunaSpotPositionFusionInstructions,
  closeActiveTunaSpotPositionOrcaInstructions,
  fetchMarket,
  fetchTunaSpotPosition,
  getLendingVaultAddress,
  getMarketAddress,
  getTunaSpotPositionAddress,
  HUNDRED_PERCENT,
  MarketMaker,
  PoolToken,
} from "../../src";

import { FUNDER } from "./addresses.ts";
import { fetchPool } from "./fetch.ts";
import { IncreaseTunaLpPositionTestArgs } from "./increaseTunaLpPosition.ts";
import { sendTransaction } from "./mockRpc.ts";

export type CloseActiveTunaSpotPositionTestArgs = {
  rpc: Rpc<SolanaRpcApi>;
  signer?: TransactionSigner;
  positionMint: Address;
  swapToToken?: number;
  maxSwapSlippage?: number;
};

export type CloseActiveTunaSpotPositionTestResults = {
  userBalanceDeltaA: bigint;
  userBalanceDeltaB: bigint;
  vaultBalanceDeltaA: bigint;
  vaultBalanceDeltaB: bigint;
};

export type CloseActiveTunaSpotPositionTestExpectations = {
  userBalanceDeltaA?: bigint;
  userBalanceDeltaB?: bigint;
  vaultBalanceDeltaA?: bigint;
  vaultBalanceDeltaB?: bigint;
};

export function assertCloseActiveTunaSpotPosition(
  results: CloseActiveTunaSpotPositionTestResults,
  expectations: CloseActiveTunaSpotPositionTestExpectations,
) {
  if (expectations.userBalanceDeltaA !== undefined)
    expect(results.userBalanceDeltaA).toEqual(expectations.userBalanceDeltaA);
  if (expectations.userBalanceDeltaB !== undefined)
    expect(results.userBalanceDeltaB).toEqual(expectations.userBalanceDeltaB);
  if (expectations.vaultBalanceDeltaA !== undefined)
    expect(results.vaultBalanceDeltaA).toEqual(expectations.vaultBalanceDeltaA);
  if (expectations.vaultBalanceDeltaB !== undefined)
    expect(results.vaultBalanceDeltaB).toEqual(expectations.vaultBalanceDeltaB);
}

export async function closeActiveTunaSpotPosition({
  rpc,
  positionMint,
  maxSwapSlippage,
  signer = FUNDER,
}: CloseActiveTunaSpotPositionTestArgs): Promise<CloseActiveTunaSpotPositionTestResults> {
  const tunaPositionAddress = (await getTunaSpotPositionAddress(positionMint))[0];
  const tunaPosition = await fetchTunaSpotPosition(rpc, tunaPositionAddress);
  const marketAddress = (await getMarketAddress(tunaPosition.data.pool))[0];
  const market = await fetchMarket(rpc, marketAddress);
  const pool = await fetchPool(rpc, tunaPosition.data.pool, market.data.marketMaker);
  const mintA = await fetchMint(rpc, pool.data.tokenMintA);
  const mintB = await fetchMint(rpc, pool.data.tokenMintB);

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

  const createInstructions: IInstruction[] = [];
  const cleanupInstructions: IInstruction[] = [];

  const closeTunaLpPositionArgs = {
    maxSwapSlippage: maxSwapSlippage ?? HUNDRED_PERCENT / 10,
  };

  const instructions =
    market.data.marketMaker == MarketMaker.Orca
      ? await closeActiveTunaSpotPositionOrcaInstructions(
          rpc,
          signer,
          positionMint,
          closeTunaLpPositionArgs,
          createInstructions,
          cleanupInstructions,
        )
      : await closeActiveTunaSpotPositionFusionInstructions(
          rpc,
          signer,
          positionMint,
          closeTunaLpPositionArgs,
          createInstructions,
          cleanupInstructions,
        );

  instructions.unshift(getSetComputeUnitLimitInstruction({ units: 1_400_000 }));

  // Setup instructions create ATAs and WSOL account if needed.
  await sendTransaction(createInstructions);

  const userTokenABefore = await fetchMaybeToken(rpc, tunaPositionOwnerAtaA);
  const userBalanceABefore = userTokenABefore.exists ? userTokenABefore.data.amount : 0n;
  const userTokenBBefore = await fetchMaybeToken(rpc, tunaPositionOwnerAtaB);
  const userBalanceBBefore = userTokenBBefore.exists ? userTokenBBefore.data.amount : 0n;

  const vaultABalanceBefore = (await fetchToken(rpc, vaultAAta)).data.amount;
  const vaultBBalanceBefore = (await fetchToken(rpc, vaultBAta)).data.amount;

  // Add liquidity!
  await sendTransaction(instructions);

  const marketAfter = await fetchMarket(rpc, marketAddress);
  if (tunaPosition.data.positionToken == PoolToken.B) {
    expect(market.data.borrowedSharesA - marketAfter.data.borrowedSharesA).toEqual(tunaPosition.data.loanShares);
  } else {
    expect(market.data.borrowedSharesB - marketAfter.data.borrowedSharesB).toEqual(tunaPosition.data.loanShares);
  }

  const userTokenAAfter = await fetchMaybeToken(rpc, tunaPositionOwnerAtaA);
  const userBalanceAAfter = userTokenAAfter.exists ? userTokenAAfter.data.amount : 0n;
  const userTokenBAfter = await fetchMaybeToken(rpc, tunaPositionOwnerAtaB);
  const userBalanceBAfter = userTokenBAfter.exists ? userTokenBAfter.data.amount : 0n;

  const vaultABalanceAfter = (await fetchToken(rpc, vaultAAta)).data.amount;
  const vaultBBalanceAfter = (await fetchToken(rpc, vaultBAta)).data.amount;

  // Cleanup instructions close WSOL accounts.
  await sendTransaction(cleanupInstructions);

  return {
    userBalanceDeltaA: userBalanceAAfter - userBalanceABefore,
    userBalanceDeltaB: userBalanceBAfter - userBalanceBBefore,
    vaultBalanceDeltaA: vaultABalanceAfter - vaultABalanceBefore,
    vaultBalanceDeltaB: vaultBBalanceAfter - vaultBBalanceBefore,
  };
}
