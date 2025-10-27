import { fetchFusionPool, fetchPosition as fetchFusionPosition } from "@crypticdot/fusionamm-client";
import { fetchPosition as fetchOrcaPosition, fetchWhirlpool } from "@orca-so/whirlpools-client";
import { Address, IInstruction, Rpc, SolanaRpcApi, TransactionSigner } from "@solana/kit";
import { getSetComputeUnitLimitInstruction } from "@solana-program/compute-budget";
import { fetchMaybeToken, fetchMint, fetchToken, findAssociatedTokenPda } from "@solana-program/token-2022";
import { expect } from "vitest";

import {
  COMPUTED_AMOUNT,
  fetchMarket,
  fetchTunaConfig,
  fetchTunaLpPosition,
  fetchVault,
  getLendingVaultAddress,
  getMarketAddress,
  getTunaConfigAddress,
  getTunaLpPositionAddress,
  HUNDRED_PERCENT,
  increaseTunaLpPositionFusionInstructions,
  increaseTunaLpPositionOrcaInstructions,
  MarketMaker,
  PoolToken,
} from "../../src";

import { FUNDER } from "./addresses.ts";
import { getPositionAddress } from "./fetch.ts";
import { sendTransaction } from "./mockRpc.ts";

export type IncreaseTunaLpPositionTestArgs = {
  rpc: Rpc<SolanaRpcApi>;
  positionMint: Address;
  pool: Address;
  signer?: TransactionSigner;
  collateralA: bigint;
  collateralB: bigint;
  borrowA: bigint;
  borrowB: bigint;
  maxAmountSlippage?: number;
  maxSwapSlippage?: number;
};

export type IncreaseTunaLpPositionTestResults = {
  userBalanceDeltaA: bigint;
  userBalanceDeltaB: bigint;
  vaultBalanceDeltaA: bigint;
  vaultBalanceDeltaB: bigint;
  poolBalanceDeltaA: bigint;
  poolBalanceDeltaB: bigint;
  leftoversA: bigint;
  leftoversB: bigint;
};

export type IncreaseTunaLpPositionTestExpectations = {
  userBalanceDeltaA?: bigint;
  userBalanceDeltaB?: bigint;
  vaultBalanceDeltaA?: bigint;
  vaultBalanceDeltaB?: bigint;
  poolBalanceDeltaA?: bigint;
  poolBalanceDeltaB?: bigint;
  leftoversA?: bigint;
  leftoversB?: bigint;
};

export function assertIncreaseTunaLpPosition(
  results: IncreaseTunaLpPositionTestResults,
  expectations: IncreaseTunaLpPositionTestExpectations,
) {
  if (expectations.userBalanceDeltaA !== undefined)
    expect(results.userBalanceDeltaA).toEqual(expectations.userBalanceDeltaA);
  if (expectations.userBalanceDeltaB !== undefined)
    expect(results.userBalanceDeltaB).toEqual(expectations.userBalanceDeltaB);
  if (expectations.vaultBalanceDeltaA !== undefined)
    expect(results.vaultBalanceDeltaA).toEqual(expectations.vaultBalanceDeltaA);
  if (expectations.vaultBalanceDeltaB !== undefined)
    expect(results.vaultBalanceDeltaB).toEqual(expectations.vaultBalanceDeltaB);
  if (expectations.poolBalanceDeltaA !== undefined)
    expect(results.poolBalanceDeltaA).toEqual(expectations.poolBalanceDeltaA);
  if (expectations.poolBalanceDeltaB !== undefined)
    expect(results.poolBalanceDeltaB).toEqual(expectations.poolBalanceDeltaB);
  if (expectations.leftoversA !== undefined) expect(results.leftoversA).toEqual(expectations.leftoversA);
  if (expectations.leftoversB !== undefined) expect(results.leftoversB).toEqual(expectations.leftoversB);
}

export async function increaseTunaLpPosition({
  rpc,
  positionMint,
  pool: poolAddress,
  collateralA,
  collateralB,
  borrowA,
  borrowB,
  maxSwapSlippage,
  maxAmountSlippage,
  signer = FUNDER,
}: IncreaseTunaLpPositionTestArgs): Promise<IncreaseTunaLpPositionTestResults> {
  const tunaConfigAddress = (await getTunaConfigAddress())[0];
  const tunaConfig = await fetchTunaConfig(rpc, tunaConfigAddress);
  const marketAddress = (await getMarketAddress(poolAddress))[0];
  const market = await fetchMarket(rpc, marketAddress);
  const isOrcaMarket = market.data.marketMaker == MarketMaker.Orca;
  const pool = isOrcaMarket ? await fetchWhirlpool(rpc, poolAddress) : await fetchFusionPool(rpc, poolAddress);

  const mintA = await fetchMint(rpc, pool.data.tokenMintA);
  const mintB = await fetchMint(rpc, pool.data.tokenMintB);

  const positionAddress = (await getPositionAddress(positionMint, market.data.marketMaker))[0];

  const tunaPositionAddress = (await getTunaLpPositionAddress(positionMint))[0];
  const tunaPosition = await fetchTunaLpPosition(rpc, tunaPositionAddress);

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

  const createInstructions: IInstruction[] = [];
  const cleanupInstructions: IInstruction[] = [];

  // Add liquidity!
  const instructions: IInstruction[] = [];
  instructions.push(getSetComputeUnitLimitInstruction({ units: 1_400_000 }));

  const addLiquidityArgs = {
    borrowA,
    borrowB,
    collateralA,
    collateralB,
    maxSwapSlippage: maxSwapSlippage ?? HUNDRED_PERCENT / 10,
    maxAmountSlippage: maxAmountSlippage ?? HUNDRED_PERCENT / 4,
  };

  if (isOrcaMarket) {
    instructions.push(
      ...(await increaseTunaLpPositionOrcaInstructions(
        rpc,
        signer,
        positionMint,
        addLiquidityArgs,
        createInstructions,
        cleanupInstructions,
      )),
    );
  } else {
    instructions.push(
      ...(await increaseTunaLpPositionFusionInstructions(
        rpc,
        signer,
        positionMint,
        addLiquidityArgs,
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
  const feeRecipientTokenABefore = await fetchMaybeToken(rpc, feeRecipientAtaA);
  const feeRecipientBalanceABefore = feeRecipientTokenABefore.exists ? feeRecipientTokenABefore.data.amount : 0n;
  const feeRecipientTokenBBefore = await fetchMaybeToken(rpc, feeRecipientAtaB);
  const feeRecipientBalanceBBefore = feeRecipientTokenBBefore.exists ? feeRecipientTokenBBefore.data.amount : 0n;
  const vaultABalanceBefore = (await fetchToken(rpc, vaultAAta)).data.amount;
  const vaultBBalanceBefore = (await fetchToken(rpc, vaultBAta)).data.amount;
  const poolBalanceABefore = (await fetchToken(rpc, pool.data.tokenVaultA)).data.amount;
  const poolBalanceBBefore = (await fetchToken(rpc, pool.data.tokenVaultB)).data.amount;
  const tunaPositionBalanceABefore = (await fetchToken(rpc, tunaPositionAtaA)).data.amount;
  const tunaPositionBalanceBBefore = (await fetchToken(rpc, tunaPositionAtaB)).data.amount;

  const directlyTranseferredAmountA = tunaPositionBalanceABefore - tunaPosition.data.leftoversA;
  const directlyTranseferredAmountB = tunaPositionBalanceBBefore - tunaPosition.data.leftoversB;

  // Add liquidity!!!
  await sendTransaction(instructions);

  const tunaPositionAfter = await fetchTunaLpPosition(rpc, tunaPositionAddress);

  const positionAfter = isOrcaMarket
    ? await fetchOrcaPosition(rpc, positionAddress)
    : await fetchFusionPosition(rpc, positionAddress);
  expect(positionAfter.data.liquidity).toEqual(tunaPositionAfter.data.liquidity);

  const tunaPositionBalanceAAfter = (await fetchToken(rpc, tunaPositionAtaA)).data.amount;
  const tunaPositionBalanceBAfter = (await fetchToken(rpc, tunaPositionAtaB)).data.amount;
  expect(tunaPositionAfter.data.leftoversA).toEqual(tunaPositionBalanceAAfter);
  expect(tunaPositionAfter.data.leftoversB).toEqual(tunaPositionBalanceBAfter);

  const marketAfter = await fetchMarket(rpc, marketAddress);
  if (borrowA != COMPUTED_AMOUNT)
    expect(marketAfter.data.borrowedSharesA - market.data.borrowedSharesA).toEqual(borrowA);
  if (borrowB != COMPUTED_AMOUNT)
    expect(marketAfter.data.borrowedSharesB - market.data.borrowedSharesB).toEqual(borrowB);

  const vaultAAfter = await fetchVault(rpc, vaultAAddress);
  const vaultBAfter = await fetchVault(rpc, vaultBAddress);
  if (borrowA != COMPUTED_AMOUNT) expect(vaultAAfter.data.borrowedShares - vaultA.data.borrowedShares).toEqual(borrowA);
  if (borrowB != COMPUTED_AMOUNT) expect(vaultBAfter.data.borrowedShares - vaultB.data.borrowedShares).toEqual(borrowB);

  const userTokenAAfter = await fetchMaybeToken(rpc, tunaPositionOwnerAtaA);
  const userBalanceAAfter = userTokenAAfter.exists ? userTokenAAfter.data.amount : 0n;
  const userTokenBAfter = await fetchMaybeToken(rpc, tunaPositionOwnerAtaB);
  const userBalanceBAfter = userTokenBAfter.exists ? userTokenBAfter.data.amount : 0n;

  const feeRecipientTokenAAfter = await fetchMaybeToken(rpc, feeRecipientAtaA);
  const feeRecipientBalanceAAfter = feeRecipientTokenAAfter.exists ? feeRecipientTokenAAfter.data.amount : 0n;
  const feeRecipientTokenBAfter = await fetchMaybeToken(rpc, feeRecipientAtaB);
  const feeRecipientBalanceBAfter = feeRecipientTokenBAfter.exists ? feeRecipientTokenBAfter.data.amount : 0n;

  const vaultABalanceAfter = (await fetchToken(rpc, vaultAAta)).data.amount;
  const vaultBBalanceAfter = (await fetchToken(rpc, vaultBAta)).data.amount;
  const poolBalanceAAfter = (await fetchToken(rpc, pool.data.tokenVaultA)).data.amount;
  const poolBalanceBAfter = (await fetchToken(rpc, pool.data.tokenVaultB)).data.amount;

  const feeA =
    ((collateralA + directlyTranseferredAmountA) * BigInt(market.data.protocolFeeOnCollateral) +
      borrowA * BigInt(market.data.protocolFee)) /
    BigInt(HUNDRED_PERCENT);
  const feeB =
    ((collateralB + directlyTranseferredAmountB) * BigInt(market.data.protocolFeeOnCollateral) +
      borrowB * BigInt(market.data.protocolFee)) /
    BigInt(HUNDRED_PERCENT);
  if (borrowA != COMPUTED_AMOUNT) expect(feeRecipientBalanceAAfter - feeRecipientBalanceABefore).toEqual(feeA);
  if (borrowB != COMPUTED_AMOUNT) expect(feeRecipientBalanceBAfter - feeRecipientBalanceBBefore).toEqual(feeB);

  // Cleanup instructions close WSOL accounts.
  await sendTransaction(cleanupInstructions);

  return {
    leftoversA: tunaPositionAfter.data.leftoversA,
    leftoversB: tunaPositionAfter.data.leftoversB,
    poolBalanceDeltaA: poolBalanceAAfter - poolBalanceABefore,
    poolBalanceDeltaB: poolBalanceBAfter - poolBalanceBBefore,
    userBalanceDeltaA: userBalanceAAfter - userBalanceABefore,
    userBalanceDeltaB: userBalanceBAfter - userBalanceBBefore,
    vaultBalanceDeltaA: vaultABalanceAfter - vaultABalanceBefore,
    vaultBalanceDeltaB: vaultBBalanceAfter - vaultBBalanceBefore,
  };
}
