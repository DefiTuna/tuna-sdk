import { Address, Rpc, SolanaRpcApi, TransactionSigner } from "@solana/kit";

import {
  closeTunaLpPositionFusionInstruction,
  closeTunaLpPositionOrcaInstruction,
  fetchMarket,
  fetchTunaLpPosition,
  getMarketAddress,
  getTunaLpPositionAddress,
  MarketMaker,
} from "../../src";

import { FUNDER } from "./addresses.ts";
import { sendTransaction } from "./mockRpc.ts";

export type CloseTunaLpPositionTestArgs = {
  rpc: Rpc<SolanaRpcApi>;
  signer?: TransactionSigner;
  positionMint: Address;
};

export async function closeTunaLpPosition({ rpc, positionMint, signer = FUNDER }: CloseTunaLpPositionTestArgs) {
  const tunaPositionAddress = (await getTunaLpPositionAddress(positionMint))[0];
  const tunaPosition = await fetchTunaLpPosition(rpc, tunaPositionAddress);

  const marketAddress = (await getMarketAddress(tunaPosition.data.pool))[0];
  const market = await fetchMarket(rpc, marketAddress);

  const instruction =
    market.data.marketMaker == MarketMaker.Orca
      ? await closeTunaLpPositionOrcaInstruction(rpc, signer, positionMint)
      : await closeTunaLpPositionFusionInstruction(rpc, signer, positionMint);

  await sendTransaction([instruction]);
}
