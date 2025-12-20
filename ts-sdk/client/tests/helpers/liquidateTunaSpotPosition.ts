import { FusionPool } from "@crypticdot/fusionamm-client";
import { Whirlpool } from "@orca-so/whirlpools-client";
import { Account, Address, Rpc, SolanaRpcApi, TransactionSigner } from "@solana/kit";
import { getSetComputeUnitLimitInstruction } from "@solana-program/compute-budget";
import { fetchMaybeToken, fetchMint, fetchToken, findAssociatedTokenPda } from "@solana-program/token-2022";
import { assert, expect } from "vitest";

import {
  fetchMarket,
  fetchMaybeTunaSpotPosition,
  fetchTunaConfig,
  fetchTunaSpotPosition,
  fetchVault,
  getLendingVaultAddress,
  getMarketAddress,
  getTunaConfigAddress,
  HUNDRED_PERCENT,
  liquidateTunaSpotPositionFusionInstructions,
  liquidateTunaSpotPositionOrcaInstructions,
  MarketMaker,
  PoolToken,
} from "../../src";

import { FUNDER } from "./addresses.ts";
import { fetchPool } from "./fetch.ts";
import { sendTransaction } from "./mockRpc.ts";

export type LiquidateTunaSpotPositionTestArgs = {
  rpc: Rpc<SolanaRpcApi>;
  signer?: TransactionSigner;
  tunaPositionAddress: Address;
  decreasePercent?: number;
  maxSwapSlippage?: number;
};

export type LiquidateTunaSpotPositionTestResults = {
  userNativeBalanceDelta: bigint;
  userBalanceDeltaA: bigint;
  userBalanceDeltaB: bigint;
  vaultBalanceDeltaA: bigint;
  vaultBalanceDeltaB: bigint;
  badDebtDeltaA: bigint;
  badDebtDeltaB: bigint;
  feeRecipientBalanceDelta: bigint;
};

export type LiquidateTunaSpotPositionTestExpectations = {
  userNativeBalanceDelta?: bigint;
  userBalanceDeltaA?: bigint;
  userBalanceDeltaB?: bigint;
  vaultBalanceDeltaA?: bigint;
  vaultBalanceDeltaB?: bigint;
  badDebtDeltaA?: bigint;
  badDebtDeltaB?: bigint;
  feeRecipientBalanceDelta?: bigint;
};

export function assertLiquidateTunaSpotPosition(
  results: LiquidateTunaSpotPositionTestResults,
  expectations: LiquidateTunaSpotPositionTestExpectations,
) {
  if (expectations.userNativeBalanceDelta !== undefined)
    expect(results.userNativeBalanceDelta).toEqual(expectations.userNativeBalanceDelta);
  if (expectations.userBalanceDeltaA !== undefined)
    expect(results.userBalanceDeltaA).toEqual(expectations.userBalanceDeltaA);
  if (expectations.userBalanceDeltaB !== undefined)
    expect(results.userBalanceDeltaB).toEqual(expectations.userBalanceDeltaB);
  if (expectations.vaultBalanceDeltaA !== undefined)
    expect(results.vaultBalanceDeltaA).toEqual(expectations.vaultBalanceDeltaA);
  if (expectations.vaultBalanceDeltaB !== undefined)
    expect(results.vaultBalanceDeltaB).toEqual(expectations.vaultBalanceDeltaB);
  if (expectations.badDebtDeltaA !== undefined) expect(results.badDebtDeltaA).toEqual(expectations.badDebtDeltaA);
  if (expectations.badDebtDeltaB !== undefined) expect(results.badDebtDeltaB).toEqual(expectations.badDebtDeltaB);
  if (expectations.feeRecipientBalanceDelta !== undefined)
    expect(results.feeRecipientBalanceDelta).toEqual(expectations.feeRecipientBalanceDelta);
}

export async function liquidateTunaSpotPosition({
  rpc,
  tunaPositionAddress,
  decreasePercent,
  signer = FUNDER,
}: LiquidateTunaSpotPositionTestArgs): Promise<LiquidateTunaSpotPositionTestResults> {
  const tunaConfigAddress = (await getTunaConfigAddress())[0];
  const tunaConfig = await fetchTunaConfig(rpc, tunaConfigAddress);
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

  const tunaPositionOwnerAtaA = (
    await findAssociatedTokenPda({
      owner: tunaPosition.data.authority,
      mint: mintA.address,
      tokenProgram: mintA.programAddress,
    })
  )[0];

  const tunaPositionOwnerAtaB = (
    await findAssociatedTokenPda({
      owner: tunaPosition.data.authority,
      mint: mintB.address,
      tokenProgram: mintB.programAddress,
    })
  )[0];

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
          decreasePercent ?? HUNDRED_PERCENT,
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
          decreasePercent ?? HUNDRED_PERCENT,
        );

  instructions.unshift(getSetComputeUnitLimitInstruction({ units: 1_400_000 }));

  const userTokenABefore = await fetchMaybeToken(rpc, tunaPositionOwnerAtaA);
  const userBalanceABefore = userTokenABefore.exists ? userTokenABefore.data.amount : 0n;
  const userNativeBalanceBefore = (await rpc.getBalance(tunaPosition.data.authority).send()).value;

  const userTokenBBefore = await fetchMaybeToken(rpc, tunaPositionOwnerAtaB);
  const userBalanceBBefore = userTokenBBefore.exists ? userTokenBBefore.data.amount : 0n;

  const feeRecipientTokenABefore = await fetchMaybeToken(rpc, feeRecipientAAta);
  const feeRecipientBalanceABefore = feeRecipientTokenABefore.exists ? feeRecipientTokenABefore.data.amount : 0n;
  const feeRecipientTokenBBefore = await fetchMaybeToken(rpc, feeRecipientBAta);
  const feeRecipientBalanceBBefore = feeRecipientTokenBBefore.exists ? feeRecipientTokenBBefore.data.amount : 0n;

  const vaultABalanceBefore = (await fetchToken(rpc, vaultAAta)).data.amount;
  const vaultBBalanceBefore = (await fetchToken(rpc, vaultBAta)).data.amount;

  const tunaPositionBefore = await fetchTunaSpotPosition(rpc, tunaPositionAddress);
  const tunaPositionBalanceABefore = (await fetchToken(rpc, tunaPositionAtaA)).data.amount;
  const tunaPositionBalanceBBefore = (await fetchToken(rpc, tunaPositionAtaB)).data.amount;

  const directlyTransferredAmountA =
    tunaPosition.data.positionToken == PoolToken.A
      ? tunaPositionBalanceABefore - tunaPositionBefore.data.amount
      : tunaPositionBalanceABefore;
  const directlyTransferredAmountB =
    tunaPosition.data.positionToken == PoolToken.B
      ? tunaPositionBalanceBBefore - tunaPositionBefore.data.amount
      : tunaPositionBalanceBBefore;

  // Liquidate the position
  await sendTransaction(instructions);

  const tunaPositionAfter = await fetchMaybeTunaSpotPosition(rpc, tunaPositionAddress);

  let tunaPositionBalanceAAfter = 0n;
  let tunaPositionBalanceBAfter = 0n;

  if (decreasePercent == undefined || decreasePercent == HUNDRED_PERCENT) {
    expect((await fetchMaybeToken(rpc, tunaPositionAtaA)).exists).toBeFalsy();
    expect((await fetchMaybeToken(rpc, tunaPositionAtaB)).exists).toBeFalsy();
    assert(!tunaPositionAfter.exists);
  } else {
    assert(tunaPositionAfter.exists);
    tunaPositionBalanceAAfter = (await fetchToken(rpc, tunaPositionAtaA)).data.amount;
    tunaPositionBalanceBAfter = (await fetchToken(rpc, tunaPositionAtaB)).data.amount;

    const newAmount =
      (tunaPositionBefore.data.amount * BigInt(HUNDRED_PERCENT - (decreasePercent ?? HUNDRED_PERCENT))) /
      BigInt(HUNDRED_PERCENT);

    expect(tunaPositionAfter.data.amount).toEqual(newAmount);
    if (tunaPosition.data.positionToken == PoolToken.A) {
      expect(tunaPositionBalanceAAfter).toEqual(newAmount);
      expect(tunaPositionBalanceBAfter).toEqual(0n);
    } else {
      expect(tunaPositionBalanceAAfter).toEqual(0n);
      expect(tunaPositionBalanceBAfter).toEqual(newAmount);
    }
  }

  const userTokenAAfter = await fetchMaybeToken(rpc, tunaPositionOwnerAtaA);
  const userBalanceAAfter = userTokenAAfter.exists ? userTokenAAfter.data.amount : 0n;

  const userNativeBalanceAfter = (await rpc.getBalance(tunaPosition.data.authority).send()).value;

  const userTokenBAfter = await fetchMaybeToken(rpc, tunaPositionOwnerAtaB);
  const userBalanceBAfter = userTokenBAfter.exists ? userTokenBAfter.data.amount : 0n;

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
    expect(feeRecipientBalanceDeltaB).toEqual(directlyTransferredAmountB);
  } else {
    expect(feeRecipientBalanceDeltaA).toEqual(directlyTransferredAmountA);
  }

  return {
    userNativeBalanceDelta: userNativeBalanceAfter - userNativeBalanceBefore,
    userBalanceDeltaA: userBalanceAAfter - userBalanceABefore,
    userBalanceDeltaB: userBalanceBAfter - userBalanceBBefore,
    vaultBalanceDeltaA: vaultABalanceAfter - vaultABalanceBefore,
    vaultBalanceDeltaB: vaultBBalanceAfter - vaultBBalanceBefore,
    badDebtDeltaA: vaultAAfter.data.unpaidDebtShares - vaultA.data.unpaidDebtShares,
    badDebtDeltaB: vaultBAfter.data.unpaidDebtShares - vaultB.data.unpaidDebtShares,
    feeRecipientBalanceDelta:
      tunaPosition.data.positionToken == PoolToken.A ? feeRecipientBalanceDeltaA : feeRecipientBalanceDeltaB,
  };
}
