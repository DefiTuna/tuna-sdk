import {
  Address,
  IAccountMeta,
  IInstruction,
  type ReadonlyUint8Array,
  Rpc,
  SolanaRpcApi,
  TransactionSigner,
} from "@solana/kit";
import { getSetComputeUnitLimitInstruction } from "@solana-program/compute-budget";
import { fetchMaybeToken, fetchMint, fetchToken, findAssociatedTokenPda } from "@solana-program/token-2022";
import { expect } from "vitest";

import {
  fetchMarket,
  fetchTunaConfig,
  fetchTunaSpotPosition,
  fetchVault,
  getMarketAddress,
  getTunaConfigAddress,
  getTunaSpotPositionAddress,
  HUNDRED_PERCENT,
  openAndIncreaseTunaSpotPositionJupiterInstructions,
  OpenAndIncreaseTunaSpotPositionJupiterInstructionsArgs,
  PoolToken,
} from "../../src";

import { FUNDER } from "./addresses.ts";
import { fetchPool } from "./fetch.ts";
import { sendTransaction } from "./mockRpc.ts";
import { ModifyTunaSpotPositionTestResults } from "./modifyTunaSpotPosition.ts";

export type OpenAndIncreaseTunaSpotPositionJupiterTestArgs = {
  rpc: Rpc<SolanaRpcApi>;
  signer?: TransactionSigner;
  pool: Address;
  positionToken: PoolToken;
  collateralToken: PoolToken;
  collateralAmount: bigint;
  borrowAmount: bigint;
  routeAccounts: IAccountMeta[];
  routeData: ReadonlyUint8Array;
};

export async function openAndIncreaseTunaSpotPositionJupiter({
  rpc,
  pool: poolAddress,
  positionToken,
  collateralToken,
  collateralAmount,
  borrowAmount,
  routeAccounts,
  routeData,
  signer = FUNDER,
}: OpenAndIncreaseTunaSpotPositionJupiterTestArgs): Promise<ModifyTunaSpotPositionTestResults> {
  const tunaConfigAddress = (await getTunaConfigAddress())[0];
  const tunaConfig = await fetchTunaConfig(rpc, tunaConfigAddress);
  const tunaPositionAddress = (await getTunaSpotPositionAddress(signer.address, poolAddress))[0];
  const marketAddress = (await getMarketAddress(poolAddress))[0];
  const market = await fetchMarket(rpc, marketAddress);
  const pool = await fetchPool(rpc, poolAddress, market.data.marketMaker);
  const mintA = await fetchMint(rpc, pool.data.tokenMintA);
  const mintB = await fetchMint(rpc, pool.data.tokenMintB);

  const borrowAmountA = positionToken == PoolToken.B ? borrowAmount : 0n;
  const borrowAmountB = positionToken == PoolToken.A ? borrowAmount : 0n;

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

  const vaultAAddress = market.data.vaultA;
  const vaultAAta = (
    await findAssociatedTokenPda({
      owner: vaultAAddress,
      mint: mintA.address,
      tokenProgram: mintA.programAddress,
    })
  )[0];

  const vaultBAddress = market.data.vaultB;
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

  const modifyArgs: OpenAndIncreaseTunaSpotPositionJupiterInstructionsArgs = {
    collateralToken,
    positionToken,
    borrowAmount,
    collateralAmount,
    jupiterRouteData: routeData,
  };

  const instructions = await openAndIncreaseTunaSpotPositionJupiterInstructions(
    rpc,
    signer,
    poolAddress,
    routeAccounts,
    [],
    modifyArgs,
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

  // Modify the position
  await sendTransaction(instructions);

  const tunaPositionAfter = await fetchTunaSpotPosition(rpc, tunaPositionAddress);

  const tunaPositionBalanceAAfter = (await fetchToken(rpc, tunaPositionAtaA)).data.amount;
  const tunaPositionBalanceBAfter = (await fetchToken(rpc, tunaPositionAtaB)).data.amount;
  if (positionToken == PoolToken.A) {
    expect(tunaPositionAfter.data.amount).toEqual(tunaPositionBalanceAAfter);
  } else {
    expect(tunaPositionAfter.data.amount).toEqual(tunaPositionBalanceBAfter);
  }

  const marketAfter = await fetchMarket(rpc, marketAddress);
  expect(marketAfter.data.borrowedSharesA - market.data.borrowedSharesA).toEqual(borrowAmountA);
  expect(marketAfter.data.borrowedSharesB - market.data.borrowedSharesB).toEqual(borrowAmountB);

  const userTokenAAfter = await fetchMaybeToken(rpc, tunaPositionOwnerAtaA);
  const userBalanceAAfter = userTokenAAfter.exists ? userTokenAAfter.data.amount : 0n;
  const userTokenBAfter = await fetchMaybeToken(rpc, tunaPositionOwnerAtaB);
  const userBalanceBAfter = userTokenBAfter.exists ? userTokenBAfter.data.amount : 0n;

  expect(userBalanceABefore - userBalanceAAfter).toEqual(collateralToken == PoolToken.A ? collateralAmount : 0n);
  expect(userBalanceBBefore - userBalanceBAfter).toEqual(collateralToken == PoolToken.B ? collateralAmount : 0n);

  const feeRecipientTokenAAfter = await fetchMaybeToken(rpc, feeRecipientAtaA);
  const feeRecipientBalanceAAfter = feeRecipientTokenAAfter.exists ? feeRecipientTokenAAfter.data.amount : 0n;
  const feeRecipientTokenBAfter = await fetchMaybeToken(rpc, feeRecipientAtaB);
  const feeRecipientBalanceBAfter = feeRecipientTokenBAfter.exists ? feeRecipientTokenBAfter.data.amount : 0n;

  const vaultAAfter = await fetchVault(rpc, vaultAAddress);
  const vaultBAfter = await fetchVault(rpc, vaultBAddress);

  expect(vaultAAfter.data.borrowedShares - vaultABefore.data.borrowedShares).toEqual(borrowAmountA);
  expect(vaultBAfter.data.borrowedShares - vaultBBefore.data.borrowedShares).toEqual(borrowAmountB);

  const vaultABalanceAfter = (await fetchToken(rpc, vaultAAta)).data.amount;
  const vaultBBalanceAfter = (await fetchToken(rpc, vaultBAta)).data.amount;

  expect(vaultABalanceBefore - vaultABalanceAfter).toEqual(borrowAmountA);
  expect(vaultBBalanceBefore - vaultBBalanceAfter).toEqual(borrowAmountB);

  const feeA =
    ((collateralToken == PoolToken.A ? collateralAmount : 0n) * BigInt(market.data.protocolFeeOnCollateral) +
      borrowAmountA * BigInt(market.data.protocolFee)) /
    BigInt(HUNDRED_PERCENT);
  expect(feeRecipientBalanceAAfter - feeRecipientBalanceABefore).toEqual(feeA);

  const feeB =
    ((collateralToken == PoolToken.B ? collateralAmount : 0n) * BigInt(market.data.protocolFeeOnCollateral) +
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
