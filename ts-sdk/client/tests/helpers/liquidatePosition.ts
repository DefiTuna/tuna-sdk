import { sendTransaction } from "./mockRpc.ts";
import {
  fetchMarket,
  fetchTunaPosition,
  fetchVault,
  getLendingVaultAddress,
  getMarketAddress,
  getTunaPositionAddress,
  HUNDRED_PERCENT,
  liquidatePositionOrcaInstructions,
  TunaPositionState,
  liquidatePositionFusionInstructions,
  MarketMaker,
} from "../../src";
import { Whirlpool } from "@orca-so/whirlpools-client";
import { assert, expect } from "vitest";
import { fetchMint, fetchToken, findAssociatedTokenPda } from "@solana-program/token-2022";
import { Account, Address, IInstruction, Rpc, SolanaRpcApi, TransactionSigner } from "@solana/kit";
import { fetchPool, fetchPosition, getPositionAddress } from "./fetch.ts";
import { FusionPool } from "@crypticdot/fusionamm-client";

export type LiquidatePositionTestArgs = {
  rpc: Rpc<SolanaRpcApi>;
  signer: TransactionSigner;
  positionMint: Address;
  withdrawPercent?: number;
};
export type LiquidatePositionTestResults = {
  vaultBalanceDeltaA: bigint;
  vaultBalanceDeltaB: bigint;
  poolBalanceDeltaA: bigint;
  poolBalanceDeltaB: bigint;
  badDebtDeltaA: bigint;
  badDebtDeltaB: bigint;
  tunaPositionState: TunaPositionState;
};
export type LiquidatePositionTestExpectations = {
  vaultBalanceDeltaA?: bigint;
  vaultBalanceDeltaB?: bigint;
  poolBalanceDeltaA?: bigint;
  poolBalanceDeltaB?: bigint;
  badDebtDeltaA?: bigint;
  badDebtDeltaB?: bigint;
  tunaPositionState?: TunaPositionState;
};

export function assertLiquidatePosition(
  results: LiquidatePositionTestResults,
  expectations: LiquidatePositionTestExpectations,
) {
  if (expectations.vaultBalanceDeltaA !== undefined)
    expect(results.vaultBalanceDeltaA).toEqual(expectations.vaultBalanceDeltaA);
  if (expectations.vaultBalanceDeltaB !== undefined)
    expect(results.vaultBalanceDeltaB).toEqual(expectations.vaultBalanceDeltaB);
  if (expectations.poolBalanceDeltaA !== undefined)
    expect(results.poolBalanceDeltaA).toEqual(expectations.poolBalanceDeltaA);
  if (expectations.poolBalanceDeltaB !== undefined)
    expect(results.poolBalanceDeltaB).toEqual(expectations.poolBalanceDeltaB);
  if (expectations.badDebtDeltaA !== undefined) expect(results.badDebtDeltaA).toEqual(expectations.badDebtDeltaA);
  if (expectations.badDebtDeltaB !== undefined) expect(results.badDebtDeltaB).toEqual(expectations.badDebtDeltaB);
  if (expectations.tunaPositionState !== undefined)
    expect(results.tunaPositionState).toEqual(expectations.tunaPositionState);
}

export async function liquidatePosition({
  rpc,
  signer,
  positionMint,
  withdrawPercent,
}: LiquidatePositionTestArgs): Promise<LiquidatePositionTestResults> {
  const tunaPositionAddress = (await getTunaPositionAddress(positionMint))[0];
  const tunaPosition = await fetchTunaPosition(rpc, tunaPositionAddress);

  const marketAddress = (await getMarketAddress(tunaPosition.data.pool))[0];
  const market = await fetchMarket(rpc, marketAddress);
  const pool = await fetchPool(rpc, tunaPosition.data.pool, market.data.marketMaker);

  const mintA = await fetchMint(rpc, pool.data.tokenMintA);
  const mintB = await fetchMint(rpc, pool.data.tokenMintB);

  const positionAddress = (await getPositionAddress(positionMint, market.data.marketMaker))[0];

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

  let instructions: IInstruction[];
  if (market.data.marketMaker == MarketMaker.Orca) {
    instructions = await liquidatePositionOrcaInstructions(
      signer,
      tunaPosition,
      mintA,
      mintB,
      vaultA,
      vaultB,
      pool as Account<Whirlpool, Address>,
      withdrawPercent ?? HUNDRED_PERCENT,
    );
  } else {
    instructions = await liquidatePositionFusionInstructions(
      signer,
      tunaPosition,
      mintA,
      mintB,
      vaultA,
      vaultB,
      pool as Account<FusionPool, Address>,
      withdrawPercent ?? HUNDRED_PERCENT,
    );
  }

  const vaultABalanceBefore = (await fetchToken(rpc, vaultAAta)).data.amount;
  const vaultBBalanceBefore = (await fetchToken(rpc, vaultBAta)).data.amount;
  const poolBalanceABefore = (await fetchToken(rpc, pool.data.tokenVaultA)).data.amount;
  const poolBalanceBBefore = (await fetchToken(rpc, pool.data.tokenVaultB)).data.amount;

  // Liquidate the position!
  await sendTransaction(instructions);

  const positionAfter = await fetchPosition(rpc, positionAddress, market.data.marketMaker);
  const tunaPositionAfter = await fetchTunaPosition(rpc, tunaPositionAddress);

  assert(positionAfter.data.liquidity == tunaPositionAfter.data.liquidity, "Incorrect liquidity in tuna position");

  const tunaPositionBalanceAAfter = (await fetchToken(rpc, tunaPositionAtaA)).data.amount;
  const tunaPositionBalanceBAfter = (await fetchToken(rpc, tunaPositionAtaB)).data.amount;
  assert(tunaPositionAfter.data.leftoversA == tunaPositionBalanceAAfter, "Incorrect leftovers of token A");
  assert(tunaPositionAfter.data.leftoversB == tunaPositionBalanceBAfter, "Incorrect leftovers of token B");

  const vaultABalanceAfter = (await fetchToken(rpc, vaultAAta)).data.amount;
  const vaultBBalanceAfter = (await fetchToken(rpc, vaultBAta)).data.amount;
  const poolBalanceAAfter = (await fetchToken(rpc, pool.data.tokenVaultA)).data.amount;
  const poolBalanceBAfter = (await fetchToken(rpc, pool.data.tokenVaultB)).data.amount;

  const vaultAAfter = await fetchVault(rpc, vaultAAddress);
  const vaultBAfter = await fetchVault(rpc, vaultBAddress);

  return {
    poolBalanceDeltaA: poolBalanceAAfter - poolBalanceABefore,
    poolBalanceDeltaB: poolBalanceBAfter - poolBalanceBBefore,
    vaultBalanceDeltaA: vaultABalanceAfter - vaultABalanceBefore,
    vaultBalanceDeltaB: vaultBBalanceAfter - vaultBBalanceBefore,
    badDebtDeltaA: vaultAAfter.data.unpaidDebtShares - vaultA.data.unpaidDebtShares,
    badDebtDeltaB: vaultBAfter.data.unpaidDebtShares - vaultB.data.unpaidDebtShares,
    tunaPositionState: tunaPositionAfter.data.state,
  };
}
