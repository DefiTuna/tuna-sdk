import { Address, TransactionSigner } from "@solana/kit";
import { FUNDER } from "./addresses.ts";
import { rpc, sendTransaction } from "./mockRpc.ts";
import {
  getMarketAddress,
  NO_STOP_LOSS,
  NO_TAKE_PROFIT,
  openPositionFusionInstruction,
  openPositionOrcaInstruction,
  fetchMarket,
  MarketMaker,
  getTunaPositionAddress,
  fetchTunaPosition,
} from "../../src";
import { expect } from "vitest";

export type OpenPositionTestArgs = {
  signer?: TransactionSigner;
  positionMint: TransactionSigner;
  pool: Address;
  tickLowerIndex: number;
  tickUpperIndex: number;
  tickStopLossIndex?: number;
  tickTakeProfitIndex?: number;
  flags?: number;
};

export async function openPosition({
  positionMint,
  pool,
  tickLowerIndex,
  tickUpperIndex,
  tickStopLossIndex,
  tickTakeProfitIndex,
  flags,
  signer = FUNDER,
}: OpenPositionTestArgs) {
  const marketAddress = (await getMarketAddress(pool))[0];
  const market = await fetchMarket(rpc, marketAddress);
  const tunaPositionAddress = (await getTunaPositionAddress(positionMint.address))[0];

  const openPositionArgs = {
    tickLowerIndex,
    tickUpperIndex,
    tickStopLossIndex: tickStopLossIndex ?? NO_STOP_LOSS,
    tickTakeProfitIndex: tickTakeProfitIndex ?? NO_TAKE_PROFIT,
    flags: flags ?? 0,
  };

  await sendTransaction([
    market.data.marketMaker == MarketMaker.Orca
      ? await openPositionOrcaInstruction(rpc, signer, positionMint, pool, openPositionArgs)
      : await openPositionFusionInstruction(rpc, signer, positionMint, pool, openPositionArgs),
  ]);

  const tunaPosition = await fetchTunaPosition(rpc, tunaPositionAddress);
  expect(tunaPosition.data.marketMaker).toEqual(market.data.marketMaker);
}
