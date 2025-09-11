import { Address, generateKeyPairSigner, Rpc, SolanaRpcApi, TransactionSigner } from "@solana/kit";

import {
  fetchMarket,
  getMarketAddress,
  MarketMaker,
  MAX_SQRT_PRICE,
  MIN_SQRT_PRICE,
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
  lowerLimitOrderSqrtPrice?: bigint;
  upperLimitOrderSqrtPrice?: bigint;
  flags?: number;
};

export async function openTunaSpotPosition({
  rpc,
  pool: poolAddress,
  positionToken,
  collateralToken,
  lowerLimitOrderSqrtPrice,
  upperLimitOrderSqrtPrice,
  flags,
  signer = FUNDER,
}: OpenTunaSpotPositionTestArgs): Promise<Address> {
  const marketAddress = (await getMarketAddress(poolAddress))[0];
  const market = await fetchMarket(rpc, marketAddress);
  const positionMint = await generateKeyPairSigner();

  const openTunaLpPositionArgs = {
    positionToken,
    collateralToken,
    lowerLimitOrderSqrtPrice: lowerLimitOrderSqrtPrice ?? MIN_SQRT_PRICE,
    upperLimitOrderSqrtPrice: upperLimitOrderSqrtPrice ?? MAX_SQRT_PRICE,
    flags: flags ?? 0,
  };
  const instructions =
    market.data.marketMaker == MarketMaker.Orca
      ? await openTunaSpotPositionOrcaInstructions(rpc, signer, positionMint, poolAddress, openTunaLpPositionArgs)
      : await openTunaSpotPositionFusionInstructions(rpc, signer, positionMint, poolAddress, openTunaLpPositionArgs);

  await sendTransaction(instructions);

  return positionMint.address;
}
