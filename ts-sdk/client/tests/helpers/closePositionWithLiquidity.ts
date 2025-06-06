import { Address, Rpc, SolanaRpcApi, TransactionSigner } from "@solana/kit";
import { getSetComputeUnitLimitInstruction } from "@solana-program/compute-budget";

import {
  closePositionWithLiquidityFusionInstructions,
  closePositionWithLiquidityOrcaInstructions,
  fetchMarket,
  fetchTunaPosition,
  getMarketAddress,
  getTunaPositionAddress,
  HUNDRED_PERCENT,
  MarketMaker,
} from "../../src";

import { FUNDER } from "./addresses.ts";
import { sendTransaction } from "./mockRpc.ts";

export type ClosePositionWithLiquidityTestArgs = {
  rpc: Rpc<SolanaRpcApi>;
  signer?: TransactionSigner;
  positionMint: Address;
  maxAmountSlippage?: number;
  maxSwapSlippage?: number;
  swapToToken?: number;
};

export async function closePositionWithLiquidity({
  rpc,
  positionMint,
  maxAmountSlippage,
  maxSwapSlippage,
  swapToToken,
  signer = FUNDER,
}: ClosePositionWithLiquidityTestArgs) {
  const tunaPositionAddress = (await getTunaPositionAddress(positionMint))[0];
  const tunaPosition = await fetchTunaPosition(rpc, tunaPositionAddress);

  const marketAddress = (await getMarketAddress(tunaPosition.data.pool))[0];
  const market = await fetchMarket(rpc, marketAddress);

  const args = {
    maxSwapSlippage: maxSwapSlippage ?? HUNDRED_PERCENT,
    maxAmountSlippage: maxAmountSlippage ?? HUNDRED_PERCENT,
    swapToToken: swapToToken ?? 0,
  };

  const instructions =
    market.data.marketMaker == MarketMaker.Orca
      ? await closePositionWithLiquidityOrcaInstructions(rpc, signer, positionMint, args)
      : await closePositionWithLiquidityFusionInstructions(rpc, signer, positionMint, args);

  instructions.unshift(getSetComputeUnitLimitInstruction({ units: 1_400_000 }));

  await sendTransaction(instructions);
}
