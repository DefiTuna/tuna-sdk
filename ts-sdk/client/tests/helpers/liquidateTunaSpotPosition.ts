import { FusionPool } from "@crypticdot/fusionamm-client";
import { Whirlpool } from "@orca-so/whirlpools-client";
import { Account, Address, Rpc, SolanaRpcApi, TransactionSigner } from "@solana/kit";
import { getSetComputeUnitLimitInstruction } from "@solana-program/compute-budget";
import { fetchMaybeToken, fetchMint, fetchToken, findAssociatedTokenPda } from "@solana-program/token-2022";
import { expect } from "vitest";

import {
  fetchMarket,
  fetchTunaConfig,
  fetchTunaSpotPosition,
  fetchVault,
  getLendingVaultAddress,
  getMarketAddress,
  getTunaConfigAddress,
  getTunaSpotPositionAddress,
  HUNDRED_PERCENT,
  liquidateTunaSpotPositionFusionInstructions,
  liquidateTunaSpotPositionOrcaInstructions,
  MarketMaker,
  PoolToken,
  TunaPositionState,
} from "../../src";

import { FUNDER } from "./addresses.ts";
import { fetchPool } from "./fetch.ts";
import { sendTransaction } from "./mockRpc.ts";

export type LiquidateTunaSpotPositionTestArgs = {
  rpc: Rpc<SolanaRpcApi>;
  signer?: TransactionSigner;
  positionMint: Address;
  withdrawPercent?: number;
  maxSwapSlippage?: number;
};

export type LiquidateTunaSpotPositionTestResults = {
  amountA: bigint;
  amountB: bigint;
  vaultBalanceDeltaA: bigint;
  vaultBalanceDeltaB: bigint;
  badDebtDeltaA: bigint;
  badDebtDeltaB: bigint;
  feeRecipientBalanceDelta: bigint;
  tunaPositionState?: TunaPositionState;
};

export type LiquidateTunaSpotPositionTestExpectations = {
  amountA?: bigint;
  amountB?: bigint;
  vaultBalanceDeltaA?: bigint;
  vaultBalanceDeltaB?: bigint;
  badDebtDeltaA?: bigint;
  badDebtDeltaB?: bigint;
  feeRecipientBalanceDelta?: bigint;
  tunaPositionState?: TunaPositionState;
};

export function assertLiquidateTunaSpotPosition(
  results: LiquidateTunaSpotPositionTestResults,
  expectations: LiquidateTunaSpotPositionTestExpectations,
) {
  if (expectations.amountA !== undefined) expect(results.amountA).toEqual(expectations.amountA);
  if (expectations.amountB !== undefined) expect(results.amountB).toEqual(expectations.amountB);
  if (expectations.vaultBalanceDeltaA !== undefined)
    expect(results.vaultBalanceDeltaA).toEqual(expectations.vaultBalanceDeltaA);
  if (expectations.vaultBalanceDeltaB !== undefined)
    expect(results.vaultBalanceDeltaB).toEqual(expectations.vaultBalanceDeltaB);
  if (expectations.badDebtDeltaA !== undefined) expect(results.badDebtDeltaA).toEqual(expectations.badDebtDeltaA);
  if (expectations.badDebtDeltaB !== undefined) expect(results.badDebtDeltaB).toEqual(expectations.badDebtDeltaB);
  if (expectations.feeRecipientBalanceDelta !== undefined)
    expect(results.feeRecipientBalanceDelta).toEqual(expectations.feeRecipientBalanceDelta);
  if (expectations.tunaPositionState !== undefined)
    expect(results.tunaPositionState).toEqual(expectations.tunaPositionState);
}

export async function liquidateTunaSpotPosition({
  rpc,
  positionMint,
  withdrawPercent,
  signer = FUNDER,
}: LiquidateTunaSpotPositionTestArgs): Promise<LiquidateTunaSpotPositionTestResults> {
  const tunaConfigAddress = (await getTunaConfigAddress())[0];
  const tunaConfig = await fetchTunaConfig(rpc, tunaConfigAddress);
  const tunaPositionAddress = (await getTunaSpotPositionAddress(positionMint))[0];
  const tunaPosition = await fetchTunaSpotPosition(rpc, tunaPositionAddress);
  const marketAddress = (await getMarketAddress(tunaPosition.data.pool))[0];
  const market = await fetchMarket(rpc, marketAddress);
  const pool = await fetchPool(rpc, tunaPosition.data.pool, market.data.marketMaker);
  const mintA = await fetchMint(rpc, pool.data.tokenMintA);
  const mintB = await fetchMint(rpc, pool.data.tokenMintB);

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
  const vaultA = await fetchVault(rpc, vaultAAddress);

  const vaultBAddress = (await getLendingVaultAddress(mintB.address))[0];
  const vaultBAta = (
    await findAssociatedTokenPda({
      owner: vaultBAddress,
      mint: mintB.address,
      tokenProgram: mintB.programAddress,
    })
  )[0];
  const vaultB = await fetchVault(rpc, vaultBAddress);

  const feeRecipientAAta = (
    await findAssociatedTokenPda({
      owner: tunaConfig.data.feeRecipient,
      mint: mintA.address,
      tokenProgram: mintA.programAddress,
    })
  )[0];

  const feeRecipientBAta = (
    await findAssociatedTokenPda({
      owner: tunaConfig.data.feeRecipient,
      mint: mintB.address,
      tokenProgram: mintB.programAddress,
    })
  )[0];

  const instructions =
    market.data.marketMaker == MarketMaker.Orca
      ? await liquidateTunaSpotPositionOrcaInstructions(
          signer,
          tunaPosition,
          tunaConfig,
          mintA,
          mintB,
          vaultA,
          vaultB,
          pool as Account<Whirlpool, Address>,
          withdrawPercent ?? HUNDRED_PERCENT,
        )
      : await liquidateTunaSpotPositionFusionInstructions(
          signer,
          tunaPosition,
          tunaConfig,
          mintA,
          mintB,
          vaultA,
          vaultB,
          pool as Account<FusionPool, Address>,
          withdrawPercent ?? HUNDRED_PERCENT,
        );

  instructions.unshift(getSetComputeUnitLimitInstruction({ units: 1_400_000 }));

  const feeRecipientTokenABefore = await fetchMaybeToken(rpc, feeRecipientAAta);
  const feeRecipientBalanceABefore = feeRecipientTokenABefore.exists ? feeRecipientTokenABefore.data.amount : 0n;
  const feeRecipientTokenBBefore = await fetchMaybeToken(rpc, feeRecipientBAta);
  const feeRecipientBalanceBBefore = feeRecipientTokenBBefore.exists ? feeRecipientTokenBBefore.data.amount : 0n;

  const vaultABalanceBefore = (await fetchToken(rpc, vaultAAta)).data.amount;
  const vaultBBalanceBefore = (await fetchToken(rpc, vaultBAta)).data.amount;

  const tunaPositionBefore = await fetchTunaSpotPosition(rpc, tunaPositionAddress);
  const tunaPositionBalanceABefore = (await fetchToken(rpc, tunaPositionAtaA)).data.amount;
  const tunaPositionBalanceBBefore = (await fetchToken(rpc, tunaPositionAtaB)).data.amount;

  const directlyTranseferredAmountA =
    tunaPosition.data.positionToken == PoolToken.A
      ? tunaPositionBalanceABefore - tunaPositionBefore.data.amount
      : tunaPositionBalanceABefore;
  const directlyTranseferredAmountB =
    tunaPosition.data.positionToken == PoolToken.B
      ? tunaPositionBalanceBBefore - tunaPositionBefore.data.amount
      : tunaPositionBalanceBBefore;

  // Liquidate the position
  await sendTransaction(instructions);

  const tunaPositionAfter = await fetchTunaSpotPosition(rpc, tunaPositionAddress);

  const tunaPositionBalanceAAfter = (await fetchToken(rpc, tunaPositionAtaA)).data.amount;
  const tunaPositionBalanceBAfter = (await fetchToken(rpc, tunaPositionAtaB)).data.amount;

  const newAmount =
    (tunaPositionAfter.data.amount * BigInt(HUNDRED_PERCENT - (withdrawPercent ?? HUNDRED_PERCENT))) /
    BigInt(HUNDRED_PERCENT);
  expect(tunaPositionAfter.data.amount).toEqual(newAmount);

  const feeRecipientTokenAAfter = await fetchMaybeToken(rpc, feeRecipientAAta);
  const feeRecipientBalanceAAfter = feeRecipientTokenAAfter.exists ? feeRecipientTokenAAfter.data.amount : 0n;
  const feeRecipientTokenBAfter = await fetchMaybeToken(rpc, feeRecipientBAta);
  const feeRecipientBalanceBAfter = feeRecipientTokenBAfter.exists ? feeRecipientTokenBAfter.data.amount : 0n;

  const vaultAAfter = await fetchVault(rpc, vaultAAddress);
  const vaultBAfter = await fetchVault(rpc, vaultBAddress);
  const vaultABalanceAfter = (await fetchToken(rpc, vaultAAta)).data.amount;
  const vaultBBalanceAfter = (await fetchToken(rpc, vaultBAta)).data.amount;

  const feeRecipientBalanceDeltaA = feeRecipientBalanceAAfter - feeRecipientBalanceABefore;
  const feeRecipientBalanceDeltaB = feeRecipientBalanceBAfter - feeRecipientBalanceBBefore;

  if (tunaPosition.data.positionToken == PoolToken.A) {
    expect(feeRecipientBalanceDeltaB).toEqual(directlyTranseferredAmountB);
  } else {
    expect(feeRecipientBalanceDeltaA).toEqual(directlyTranseferredAmountA);
  }

  return {
    amountA: tunaPositionBalanceAAfter,
    amountB: tunaPositionBalanceBAfter,
    vaultBalanceDeltaA: vaultABalanceAfter - vaultABalanceBefore,
    vaultBalanceDeltaB: vaultBBalanceAfter - vaultBBalanceBefore,
    badDebtDeltaA: vaultAAfter.data.unpaidDebtShares - vaultA.data.unpaidDebtShares,
    badDebtDeltaB: vaultBAfter.data.unpaidDebtShares - vaultB.data.unpaidDebtShares,
    feeRecipientBalanceDelta:
      tunaPosition.data.positionToken == PoolToken.A ? feeRecipientBalanceDeltaA : feeRecipientBalanceDeltaB,
    tunaPositionState: tunaPositionAfter.data.state,
  };
}
