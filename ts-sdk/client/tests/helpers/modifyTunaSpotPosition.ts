import { Address, IInstruction, Rpc, SolanaRpcApi, TransactionSigner } from "@solana/kit";
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
  MarketMaker,
  modifyTunaSpotPositionFusionInstructions,
  modifyTunaSpotPositionOrcaInstructions,
  PoolToken,
} from "../../src";

import { FUNDER } from "./addresses.ts";
import { fetchPool } from "./fetch.ts";
import { sendTransaction } from "./mockRpc.ts";

export type ModifyTunaSpotPositionTestArgs = {
  rpc: Rpc<SolanaRpcApi>;
  signer?: TransactionSigner;
  pool: Address;
  decreasePercent?: number;
  collateralAmount?: bigint;
  borrowAmount?: bigint;
  requiredSwapAmount?: bigint;
};

export type ModifyTunaSpotPositionTestResults = {
  amountA: bigint;
  amountB: bigint;
  userBalanceDeltaA: bigint;
  userBalanceDeltaB: bigint;
  vaultBalanceDeltaA: bigint;
  vaultBalanceDeltaB: bigint;
};

export type ModifyTunaSpotPositionTestExpectations = {
  amountA?: bigint;
  amountB?: bigint;
  userBalanceDeltaA?: bigint;
  userBalanceDeltaB?: bigint;
  vaultBalanceDeltaA?: bigint;
  vaultBalanceDeltaB?: bigint;
};

export function assertModifyTunaSpotPosition(
  results: ModifyTunaSpotPositionTestResults,
  expectations: ModifyTunaSpotPositionTestExpectations,
) {
  if (expectations.amountA !== undefined) expect(results.amountA).toEqual(expectations.amountA);
  if (expectations.amountB !== undefined) expect(results.amountB).toEqual(expectations.amountB);
  if (expectations.userBalanceDeltaA !== undefined)
    expect(results.userBalanceDeltaA).toEqual(expectations.userBalanceDeltaA);
  if (expectations.userBalanceDeltaB !== undefined)
    expect(results.userBalanceDeltaB).toEqual(expectations.userBalanceDeltaB);
  if (expectations.vaultBalanceDeltaA !== undefined)
    expect(results.vaultBalanceDeltaA).toEqual(expectations.vaultBalanceDeltaA);
  if (expectations.vaultBalanceDeltaB !== undefined)
    expect(results.vaultBalanceDeltaB).toEqual(expectations.vaultBalanceDeltaB);
}

export async function modifyTunaSpotPosition({
  rpc,
  pool: poolAddress,
  decreasePercent,
  collateralAmount,
  borrowAmount,
  requiredSwapAmount,
  signer = FUNDER,
}: ModifyTunaSpotPositionTestArgs): Promise<ModifyTunaSpotPositionTestResults> {
  const tunaConfigAddress = (await getTunaConfigAddress())[0];
  const tunaConfig = await fetchTunaConfig(rpc, tunaConfigAddress);
  const tunaPositionAddress = (await getTunaSpotPositionAddress(signer.address, poolAddress))[0];
  const tunaPosition = await fetchTunaSpotPosition(rpc, tunaPositionAddress);
  const marketAddress = (await getMarketAddress(tunaPosition.data.pool))[0];
  const market = await fetchMarket(rpc, marketAddress);
  const pool = await fetchPool(rpc, tunaPosition.data.pool, market.data.marketMaker);
  const mintA = await fetchMint(rpc, pool.data.tokenMintA);
  const mintB = await fetchMint(rpc, pool.data.tokenMintB);

  const reverse = decreasePercent == HUNDRED_PERCENT && (collateralAmount || borrowAmount);

  let borrowAmountA = tunaPosition.data.positionToken == PoolToken.B ? (borrowAmount ?? 0n) : 0n;
  let borrowAmountB = tunaPosition.data.positionToken == PoolToken.A ? (borrowAmount ?? 0n) : 0n;
  if (reverse) {
    [borrowAmountA, borrowAmountB] = [borrowAmountB, borrowAmountA];
  }

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

  const createInstructions: IInstruction[] = [];
  const cleanupInstructions: IInstruction[] = [];

  const modifyPositionArgs = {
    decreasePercent: decreasePercent ?? 0,
    borrowAmount: borrowAmount ?? 0n,
    collateralAmount: collateralAmount ?? 0n,
    requiredSwapAmount: requiredSwapAmount ?? 0n,
  };
  const instructions =
    market.data.marketMaker == MarketMaker.Orca
      ? await modifyTunaSpotPositionOrcaInstructions(
          rpc,
          signer,
          poolAddress,
          undefined,
          modifyPositionArgs,
          createInstructions,
          cleanupInstructions,
        )
      : await modifyTunaSpotPositionFusionInstructions(
          rpc,
          signer,
          poolAddress,
          undefined,
          modifyPositionArgs,
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

  const feeRecipientTokenABefore = await fetchMaybeToken(rpc, feeRecipientAtaA);
  const feeRecipientBalanceABefore = feeRecipientTokenABefore.exists ? feeRecipientTokenABefore.data.amount : 0n;
  const feeRecipientTokenBBefore = await fetchMaybeToken(rpc, feeRecipientAtaB);
  const feeRecipientBalanceBBefore = feeRecipientTokenBBefore.exists ? feeRecipientTokenBBefore.data.amount : 0n;

  const vaultABefore = await fetchVault(rpc, vaultAAddress);
  const vaultBBefore = await fetchVault(rpc, vaultBAddress);
  const vaultABalanceBefore = (await fetchToken(rpc, vaultAAta)).data.amount;
  const vaultBBalanceBefore = (await fetchToken(rpc, vaultBAta)).data.amount;

  const tunaPositionBalanceABefore = (await fetchToken(rpc, tunaPositionAtaA)).data.amount;
  const tunaPositionBalanceBBefore = (await fetchToken(rpc, tunaPositionAtaB)).data.amount;

  const directlyTransferredAmountA =
    tunaPosition.data.positionToken == PoolToken.A
      ? tunaPositionBalanceABefore - tunaPosition.data.amount
      : tunaPositionBalanceABefore;
  const directlyTransferredAmountB =
    tunaPosition.data.positionToken == PoolToken.B
      ? tunaPositionBalanceBBefore - tunaPosition.data.amount
      : tunaPositionBalanceBBefore;

  // Modify the position!
  await sendTransaction(instructions);

  const tunaPositionAfter = await fetchTunaSpotPosition(rpc, tunaPositionAddress);

  if (reverse) {
    expect(tunaPositionAfter.data.positionToken).not.toEqual(tunaPosition.data.positionToken);
  }

  const tunaPositionBalanceAAfter = (await fetchToken(rpc, tunaPositionAtaA)).data.amount;
  const tunaPositionBalanceBAfter = (await fetchToken(rpc, tunaPositionAtaB)).data.amount;
  if (tunaPositionAfter.data.positionToken == PoolToken.A) {
    expect(tunaPositionAfter.data.amount).toEqual(tunaPositionBalanceAAfter);
  } else {
    expect(tunaPositionAfter.data.amount).toEqual(tunaPositionBalanceBAfter);
  }

  const marketAfter = await fetchMarket(rpc, marketAddress);

  if (decreasePercent == 0) {
    expect(marketAfter.data.borrowedSharesA - market.data.borrowedSharesA).toEqual(borrowAmountA);
    expect(marketAfter.data.borrowedSharesB - market.data.borrowedSharesB).toEqual(borrowAmountB);
  }

  const userTokenAAfter = await fetchMaybeToken(rpc, tunaPositionOwnerAtaA);
  const userBalanceAAfter = userTokenAAfter.exists ? userTokenAAfter.data.amount : 0n;
  const userTokenBAfter = await fetchMaybeToken(rpc, tunaPositionOwnerAtaB);
  const userBalanceBAfter = userTokenBAfter.exists ? userTokenBAfter.data.amount : 0n;

  if (decreasePercent == 0) {
    expect(userBalanceABefore - userBalanceAAfter).toEqual(
      tunaPosition.data.collateralToken == PoolToken.A ? collateralAmount : 0n,
    );
    expect(userBalanceBBefore - userBalanceBAfter).toEqual(
      tunaPosition.data.collateralToken == PoolToken.B ? collateralAmount : 0n,
    );
  }

  const feeRecipientTokenAAfter = await fetchMaybeToken(rpc, feeRecipientAtaA);
  const feeRecipientBalanceAAfter = feeRecipientTokenAAfter.exists ? feeRecipientTokenAAfter.data.amount : 0n;
  const feeRecipientTokenBAfter = await fetchMaybeToken(rpc, feeRecipientAtaB);
  const feeRecipientBalanceBAfter = feeRecipientTokenBAfter.exists ? feeRecipientTokenBAfter.data.amount : 0n;

  const vaultAAfter = await fetchVault(rpc, vaultAAddress);
  const vaultBAfter = await fetchVault(rpc, vaultBAddress);

  if (decreasePercent == 0) {
    expect(vaultAAfter.data.borrowedShares - vaultABefore.data.borrowedShares).toEqual(borrowAmountA);
    expect(vaultBAfter.data.borrowedShares - vaultBBefore.data.borrowedShares).toEqual(borrowAmountB);
  }

  const vaultABalanceAfter = (await fetchToken(rpc, vaultAAta)).data.amount;
  const vaultBBalanceAfter = (await fetchToken(rpc, vaultBAta)).data.amount;

  if (decreasePercent == 0) {
    expect(vaultABalanceBefore - vaultABalanceAfter).toEqual(borrowAmountA);
    expect(vaultBBalanceBefore - vaultBBalanceAfter).toEqual(borrowAmountB);
  }

  const feeA =
    (((tunaPosition.data.collateralToken == PoolToken.A ? (collateralAmount ?? 0n) : 0n) + directlyTransferredAmountA) *
      BigInt(market.data.protocolFeeOnCollateral) +
      borrowAmountA * BigInt(market.data.protocolFee)) /
    BigInt(HUNDRED_PERCENT);
  expect(feeRecipientBalanceAAfter - feeRecipientBalanceABefore).toEqual(feeA);

  const feeB =
    (((tunaPosition.data.collateralToken == PoolToken.B ? (collateralAmount ?? 0n) : 0n) + directlyTransferredAmountB) *
      BigInt(market.data.protocolFeeOnCollateral) +
      borrowAmountB * BigInt(market.data.protocolFee)) /
    BigInt(HUNDRED_PERCENT);
  expect(feeRecipientBalanceBAfter - feeRecipientBalanceBBefore).toEqual(feeB);

  // Cleanup instructions close WSOL accounts.
  await sendTransaction(cleanupInstructions);

  return {
    amountA: tunaPositionBalanceAAfter,
    amountB: tunaPositionBalanceBAfter,
    userBalanceDeltaA: userBalanceAAfter - userBalanceABefore,
    userBalanceDeltaB: userBalanceBAfter - userBalanceBBefore,
    vaultBalanceDeltaA: vaultABalanceAfter - vaultABalanceBefore,
    vaultBalanceDeltaB: vaultBBalanceAfter - vaultBBalanceBefore,
  };
}
