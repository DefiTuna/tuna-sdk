import { fetchFusionPool, fetchPosition as fetchFusionPosition } from "@crypticdot/fusionamm-client";
import { fetchPosition as fetchOrcaPosition, fetchWhirlpool } from "@orca-so/whirlpools-client";
import { Address, IInstruction, Rpc, SolanaRpcApi, TransactionSigner } from "@solana/kit";
import { getSetComputeUnitLimitInstruction } from "@solana-program/compute-budget";
import { fetchMint, fetchToken, findAssociatedTokenPda } from "@solana-program/token-2022";
import { assert, expect } from "vitest";

import {
  fetchMarket,
  fetchTunaPosition,
  getMarketAddress,
  getTunaPositionAddress,
  MarketMaker,
  rebalancePositionFusionInstructions,
  rebalancePositionOrcaInstructions,
} from "../../src";

import { getPositionAddress } from "./fetch.ts";
import { sendTransaction } from "./mockRpc.ts";

export type RebalancePositionTestArgs = {
  rpc: Rpc<SolanaRpcApi>;
  signer: TransactionSigner;
  positionMint: Address;
  pool: Address;
};

export type RebalancePositionTestResults = {
  newTickLowerIndex: number;
  newTickUpperIndex: number;
};

export type RebalancePositionTestExpectations = {
  newTickLowerIndex?: number;
  newTickUpperIndex?: number;
};

export function assertRebalancePosition(
  results: RebalancePositionTestResults,
  expectations: RebalancePositionTestExpectations,
) {
  if (expectations.newTickLowerIndex !== undefined)
    expect(results.newTickLowerIndex).toEqual(expectations.newTickLowerIndex);
  if (expectations.newTickUpperIndex !== undefined)
    expect(results.newTickUpperIndex).toEqual(expectations.newTickUpperIndex);
}

export async function rebalancePosition({
  rpc,
  signer,
  positionMint,
  pool: poolAddress,
}: RebalancePositionTestArgs): Promise<RebalancePositionTestResults> {
  const marketAddress = (await getMarketAddress(poolAddress))[0];
  const market = await fetchMarket(rpc, marketAddress);
  const isOrcaMarket = market.data.marketMaker == MarketMaker.Orca;
  const pool = isOrcaMarket ? await fetchWhirlpool(rpc, poolAddress) : await fetchFusionPool(rpc, poolAddress);

  const mintA = await fetchMint(rpc, pool.data.tokenMintA);
  const mintB = await fetchMint(rpc, pool.data.tokenMintB);

  const positionAddress = (await getPositionAddress(positionMint, market.data.marketMaker))[0];

  const tunaPositionAddress = (await getTunaPositionAddress(positionMint))[0];
  const tunaPosition = await fetchTunaPosition(rpc, tunaPositionAddress);

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

  // Prepare remove liquidity instructions
  const instructions: IInstruction[] = [];
  instructions.push(getSetComputeUnitLimitInstruction({ units: 1_400_000 }));

  if (isOrcaMarket) {
    instructions.push(
      ...(await rebalancePositionOrcaInstructions(rpc, signer, positionMint, createInstructions, cleanupInstructions)),
    );
  } else {
    instructions.push(
      ...(await rebalancePositionFusionInstructions(
        rpc,
        signer,
        positionMint,
        createInstructions,
        cleanupInstructions,
      )),
    );
  }

  // Setup instructions create ATAs and WSOL account if needed.
  await sendTransaction(createInstructions);

  // Rebalance
  await sendTransaction(instructions);

  const positionAfter = isOrcaMarket
    ? await fetchOrcaPosition(rpc, positionAddress)
    : await fetchFusionPosition(rpc, positionAddress);

  const tunaPositionAfter = await fetchTunaPosition(rpc, tunaPositionAddress);

  assert(positionAfter.data.liquidity == tunaPositionAfter.data.liquidity, "Incorrect liquidity in tuna position");

  const tunaPositionBalanceAAfter = (await fetchToken(rpc, tunaPositionAtaA)).data.amount;
  const tunaPositionBalanceBAfter = (await fetchToken(rpc, tunaPositionAtaB)).data.amount;
  assert(tunaPositionAfter.data.leftoversA == tunaPositionBalanceAAfter, "Incorrect leftovers of token A");
  assert(tunaPositionAfter.data.leftoversB == tunaPositionBalanceBAfter, "Incorrect leftovers of token B");

  assert(
    tunaPosition.data.tickUpperIndex - tunaPosition.data.tickLowerIndex ==
      tunaPositionAfter.data.tickUpperIndex - tunaPositionAfter.data.tickLowerIndex,
    "Range changed during re-balancing",
  );

  // Cleanup instructions close WSOL accounts.
  await sendTransaction(cleanupInstructions);

  return {
    newTickLowerIndex: tunaPositionAfter.data.tickLowerIndex,
    newTickUpperIndex: tunaPositionAfter.data.tickUpperIndex,
  };
}
