import {
  closeActiveTunaSpotPositionFusionInstructions,
  closeActiveTunaSpotPositionOrcaInstructions,
  decreaseTunaSpotPositionFusionInstructions,
  decreaseTunaSpotPositionOrcaInstructions,
  fetchMarket,
  fetchTunaSpotPosition,
  getMarketAddress,
  getTunaSpotPositionAddress,
  HUNDRED_PERCENT,
  MarketMaker,
} from "@crypticdot/defituna-client";
import { DEFAULT_TRANSACTION_CONFIG, sendTransaction } from "@crypticdot/fusionamm-tx-sender";
import { IInstruction } from "@solana/kit";

import BaseCommand, { addressFlag, percentFlag } from "../base";
import { rpc, signer } from "../rpc";

export default class DecreaseSpotPosition extends BaseCommand {
  static override flags = {
    pool: addressFlag({
      description: "Pool address",
      required: true,
    }),

    withdrawPercent: percentFlag({
      description: "Withdraw percentage",
      min: 0,
      max: HUNDRED_PERCENT,
    }),

    maxSwapAmountIn: percentFlag({
      description: "Maximum swap amount input",
    }),
  };
  static override description = "Decreases a tuna spot position and closes it if all liquidity is withdrawn";
  static override examples = ["<%= config.bin %> <%= command.id %> --positionAddress address"];

  public async run() {
    const { flags } = await this.parse(DecreaseSpotPosition);
    const instructions: IInstruction[] = [];

    const tunaPositionAddress = (await getTunaSpotPositionAddress(signer.address, flags.pool))[0];
    console.log("Position address:", tunaPositionAddress);

    console.log("Fetching tuna position...");
    const tunaPosition = await fetchTunaSpotPosition(rpc, tunaPositionAddress);
    console.log("Tuna position:", tunaPosition);

    const marketAddress = (await getMarketAddress(tunaPosition.data.pool))[0];
    const market = await fetchMarket(rpc, marketAddress);

    const addressLookupTable = market.data.addressLookupTable;

    if (!flags.withdrawPercent || flags.withdrawPercent == HUNDRED_PERCENT) {
      const args = {
        maxSwapAmountIn: flags.maxSwapAmountIn ?? 0n,
      };

      if (market.data.marketMaker == MarketMaker.Fusion) {
        const ixs = await closeActiveTunaSpotPositionFusionInstructions(rpc, signer, tunaPosition.data.pool, args);
        instructions.push(...ixs);
      } else {
        const ixs = await closeActiveTunaSpotPositionOrcaInstructions(rpc, signer, tunaPosition.data.pool, args);
        instructions.push(...ixs);
      }
    } else {
      const args = {
        maxSwapAmountIn: flags.maxSwapAmountIn ?? 0n,
        withdrawPercent: flags.withdrawPercent,
      };

      if (market.data.marketMaker == MarketMaker.Fusion) {
        const ixs = await decreaseTunaSpotPositionFusionInstructions(rpc, signer, tunaPosition.data.pool, args);
        instructions.push(...ixs);
      } else {
        const ixs = await decreaseTunaSpotPositionOrcaInstructions(rpc, signer, tunaPosition.data.pool, args);
        instructions.push(...ixs);
      }
    }

    console.log("Sending a transaction...");
    const signature = await sendTransaction(rpc, instructions, signer, DEFAULT_TRANSACTION_CONFIG, [
      addressLookupTable,
    ]);
    console.log("Transaction landed:", signature);
  }
}
