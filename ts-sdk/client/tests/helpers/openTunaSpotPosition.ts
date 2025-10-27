import { Address, Rpc, SolanaRpcApi, TransactionSigner } from "@solana/kit";

import {
  fetchMarket,
  getMarketAddress,
  MarketMaker,
  openTunaSpotPositionFusionInstructions,
  openTunaSpotPositionOrcaInstructions,
  PoolToken,
} from "../../src";

import { FUNDER } from "./addresses.ts";
import { sendTransaction } from "./mockRpc.ts";

export type OpenTunaSpotPositionTestArgs = {
  rpc: Rpc<SolanaRpcApi>;
  signer?: TransactionSigner;
  pool: Address;
  positionToken: PoolToken;
  collateralToken: PoolToken;
};

export async function openTunaSpotPosition({
  rpc,
  pool: poolAddress,
  positionToken,
  collateralToken,
  signer = FUNDER,
}: OpenTunaSpotPositionTestArgs) {
  const marketAddress = (await getMarketAddress(poolAddress))[0];
  const market = await fetchMarket(rpc, marketAddress);

  const openTunaLpPositionArgs = {
    positionToken,
    collateralToken,
  };
  const instructions =
    market.data.marketMaker == MarketMaker.Orca
      ? await openTunaSpotPositionOrcaInstructions(rpc, signer, poolAddress, openTunaLpPositionArgs)
      : await openTunaSpotPositionFusionInstructions(rpc, signer, poolAddress, openTunaLpPositionArgs);

  await sendTransaction(instructions);
}
