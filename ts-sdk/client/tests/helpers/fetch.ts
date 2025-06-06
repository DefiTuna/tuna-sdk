import {
  fetchFusionPool,
  fetchPosition as fetchFusionPosition,
  getPositionAddress as getFusionPositionAddress,
} from "@crypticdot/fusionamm-client";
import {
  fetchPosition as fetchOrcaPosition,
  fetchWhirlpool,
  getPositionAddress as getOrcaPositionAddress,
} from "@orca-so/whirlpools-client";
import { Address, Rpc, SolanaRpcApi } from "@solana/kit";

import { MarketMaker } from "../../src";

export async function fetchPool(rpc: Rpc<SolanaRpcApi>, poolAddress: Address, amm: number) {
  return amm == MarketMaker.Orca ? await fetchWhirlpool(rpc, poolAddress) : await fetchFusionPool(rpc, poolAddress);
}

export async function fetchPosition(rpc: Rpc<SolanaRpcApi>, positionAddress: Address, amm: number) {
  return amm == MarketMaker.Orca
    ? await fetchOrcaPosition(rpc, positionAddress)
    : await fetchFusionPosition(rpc, positionAddress);
}

export async function getPositionAddress(positionMint: Address, amm: number) {
  return amm == MarketMaker.Orca
    ? await getOrcaPositionAddress(positionMint)
    : await getFusionPositionAddress(positionMint);
}
