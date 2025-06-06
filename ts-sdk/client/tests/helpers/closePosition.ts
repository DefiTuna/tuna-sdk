import { Address, Rpc, SolanaRpcApi, TransactionSigner } from "@solana/kit";

import {
  closePositionFusionInstruction,
  closePositionOrcaInstruction,
  fetchMarket,
  fetchTunaPosition,
  getMarketAddress,
  getTunaPositionAddress,
  MarketMaker,
} from "../../src";

import { FUNDER } from "./addresses.ts";
import { sendTransaction } from "./mockRpc.ts";

export type ClosePositionTestArgs = {
  rpc: Rpc<SolanaRpcApi>;
  signer?: TransactionSigner;
  positionMint: Address;
};

export async function closePosition({ rpc, positionMint, signer = FUNDER }: ClosePositionTestArgs) {
  const tunaPositionAddress = (await getTunaPositionAddress(positionMint))[0];
  const tunaPosition = await fetchTunaPosition(rpc, tunaPositionAddress);

  const marketAddress = (await getMarketAddress(tunaPosition.data.pool))[0];
  const market = await fetchMarket(rpc, marketAddress);

  const instruction =
    market.data.marketMaker == MarketMaker.Orca
      ? await closePositionOrcaInstruction(rpc, signer, positionMint)
      : await closePositionFusionInstruction(rpc, signer, positionMint);

  await sendTransaction([instruction]);
}
