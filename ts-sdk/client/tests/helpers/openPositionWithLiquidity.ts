import { Address, Rpc, SolanaRpcApi, TransactionSigner } from "@solana/kit";
import { getSetComputeUnitLimitInstruction } from "@solana-program/compute-budget";
import { fetchMaybeToken, fetchMint, findAssociatedTokenPda } from "@solana-program/token-2022";
import { expect } from "vitest";

import {
  fetchMarket,
  fetchTunaConfig,
  fetchVault,
  getLendingVaultAddress,
  getMarketAddress,
  getTunaConfigAddress,
  HUNDRED_PERCENT,
  MarketMaker,
  NO_STOP_LOSS,
  NO_TAKE_PROFIT,
  openPositionWithLiquidityFusionInstructions,
  openPositionWithLiquidityOrcaInstructions,
} from "../../src";

import { FUNDER } from "./addresses.ts";
import { fetchPool } from "./fetch.ts";
import { sendTransaction } from "./mockRpc.ts";

export type OpenPositionWithLiquidityTestArgs = {
  rpc: Rpc<SolanaRpcApi>;
  signer?: TransactionSigner;
  pool: Address;
  tickLowerIndex: number;
  tickUpperIndex: number;
  tickStopLossIndex?: number;
  tickTakeProfitIndex?: number;
  flags?: number;
  collateralA: bigint;
  collateralB: bigint;
  borrowA: bigint;
  borrowB: bigint;
  maxSwapSlippage?: number;
  maxAmountSlippage?: number;
};

export async function openPositionWithLiquidity({
  rpc,
  pool: poolAddress,
  collateralA,
  collateralB,
  borrowA,
  borrowB,
  maxAmountSlippage,
  maxSwapSlippage,
  tickLowerIndex,
  tickUpperIndex,
  tickStopLossIndex,
  tickTakeProfitIndex,
  flags,
  signer = FUNDER,
}: OpenPositionWithLiquidityTestArgs) {
  const tunaConfigAddress = (await getTunaConfigAddress())[0];
  const tunaConfig = await fetchTunaConfig(rpc, tunaConfigAddress);
  const marketAddress = (await getMarketAddress(poolAddress))[0];
  const market = await fetchMarket(rpc, marketAddress);
  const pool = await fetchPool(rpc, poolAddress, market.data.marketMaker);
  const mintA = await fetchMint(rpc, pool.data.tokenMintA);
  const mintB = await fetchMint(rpc, pool.data.tokenMintB);

  const vaultAAddress = (await getLendingVaultAddress(mintA.address))[0];
  const vaultA = await fetchVault(rpc, vaultAAddress);
  const vaultBAddress = (await getLendingVaultAddress(mintB.address))[0];
  const vaultB = await fetchVault(rpc, vaultBAddress);

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

  const liquidateArgs = {
    tickLowerIndex,
    tickUpperIndex,
    tickStopLossIndex: tickStopLossIndex !== undefined ? tickStopLossIndex : NO_STOP_LOSS,
    tickTakeProfitIndex: tickTakeProfitIndex !== undefined ? tickTakeProfitIndex : NO_TAKE_PROFIT,
    flags: flags ?? 0,
    borrowA,
    borrowB,
    collateralA,
    collateralB,
    maxSwapSlippage: maxSwapSlippage ?? HUNDRED_PERCENT / 10,
    maxAmountSlippage: maxAmountSlippage ?? HUNDRED_PERCENT / 4,
  };
  const ix =
    market.data.marketMaker == MarketMaker.Orca
      ? await openPositionWithLiquidityOrcaInstructions(rpc, signer, poolAddress, liquidateArgs)
      : await openPositionWithLiquidityFusionInstructions(rpc, signer, poolAddress, liquidateArgs);

  ix.instructions.unshift(getSetComputeUnitLimitInstruction({ units: 1_400_000 }));

  const feeRecipientTokenABefore = await fetchMaybeToken(rpc, feeRecipientAtaA);
  const feeRecipientBalanceABefore = feeRecipientTokenABefore.exists ? feeRecipientTokenABefore.data.amount : 0n;
  const feeRecipientTokenBBefore = await fetchMaybeToken(rpc, feeRecipientAtaB);
  const feeRecipientBalanceBBefore = feeRecipientTokenBBefore.exists ? feeRecipientTokenBBefore.data.amount : 0n;

  await sendTransaction(ix.instructions);

  const marketAfter = await fetchMarket(rpc, marketAddress);
  expect(marketAfter.data.borrowedSharesA - market.data.borrowedSharesA).toEqual(borrowA);
  expect(marketAfter.data.borrowedSharesB - market.data.borrowedSharesB).toEqual(borrowB);

  const feeRecipientTokenAAfter = await fetchMaybeToken(rpc, feeRecipientAtaA);
  const feeRecipientBalanceAAfter = feeRecipientTokenAAfter.exists ? feeRecipientTokenAAfter.data.amount : 0n;
  const feeRecipientTokenBAfter = await fetchMaybeToken(rpc, feeRecipientAtaB);
  const feeRecipientBalanceBAfter = feeRecipientTokenBAfter.exists ? feeRecipientTokenBAfter.data.amount : 0n;

  const vaultAAfter = await fetchVault(rpc, vaultAAddress);
  const vaultBAfter = await fetchVault(rpc, vaultBAddress);
  expect(vaultAAfter.data.borrowedShares - vaultA.data.borrowedShares).toEqual(borrowA);
  expect(vaultBAfter.data.borrowedShares - vaultB.data.borrowedShares).toEqual(borrowB);

  const feeA =
    (collateralA * BigInt(market.data.protocolFeeOnCollateral)) / BigInt(HUNDRED_PERCENT) +
    (borrowA * BigInt(market.data.protocolFee)) / BigInt(HUNDRED_PERCENT);
  const feeB =
    (collateralB * BigInt(market.data.protocolFeeOnCollateral)) / BigInt(HUNDRED_PERCENT) +
    (borrowB * BigInt(market.data.protocolFee)) / BigInt(HUNDRED_PERCENT);
  expect(feeRecipientBalanceAAfter - feeRecipientBalanceABefore).toEqual(feeA);
  expect(feeRecipientBalanceBAfter - feeRecipientBalanceBBefore).toEqual(feeB);

  return ix.positionMint;
}
