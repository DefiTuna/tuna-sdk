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
import { Address, IInstruction } from "@solana/kit";

import BaseCommand, { addressFlag, percentFlag } from "../base";
import { rpc, signer } from "../rpc";

export default class DecreaseSpotPosition extends BaseCommand {
  static override flags = {
    positionMint: addressFlag({
      description: "Position mint address",
    }),

    positionAddress: addressFlag({
      description: "Position address",
    }),

    withdrawPercent: percentFlag({
      description: "Withdraw percentage",
      min: 0,
      max: HUNDRED_PERCENT,
    }),

    maxSwapSlippage: percentFlag({
      description: "Maximum swap slippage",
      min: 0,
      max: HUNDRED_PERCENT,
    }),
  };
  static override description = "Decreases a tuna spot position and closes it if all liquidity is withdrawn";
  static override examples = ["<%= config.bin %> <%= command.id %> --positionAddress address"];

  public async run() {
    const { flags } = await this.parse(DecreaseSpotPosition);
    const instructions: IInstruction[] = [];

    if (!flags.positionMint && !flags.positionAddress)
      throw new Error("At least one argument: positionMint or positionAddress must be provided");

    console.log("Fetching tuna position...");
    let positionMint = flags.positionMint;
    let tunaPositionAddress: Address;
    if (positionMint) {
      tunaPositionAddress = (await getTunaSpotPositionAddress(positionMint))[0];
    } else {
      tunaPositionAddress = flags.positionAddress!;
    }

    const tunaPosition = await fetchTunaSpotPosition(rpc, tunaPositionAddress);
    positionMint = tunaPosition.data.positionMint;
    console.log("Tuna position:", tunaPosition);

    const marketAddress = (await getMarketAddress(tunaPosition.data.pool))[0];
    const market = await fetchMarket(rpc, marketAddress);

    const addressLookupTable = market.data.addressLookupTable;

    const maxSwapSlippage = flags.maxSwapSlippage ?? HUNDRED_PERCENT / 10;

    if (!flags.withdrawPercent || flags.withdrawPercent == HUNDRED_PERCENT) {
      const args = {
        maxSwapSlippage,
      };

      if (market.data.marketMaker == MarketMaker.Fusion) {
        const ixs = await closeActiveTunaSpotPositionFusionInstructions(rpc, signer, positionMint, args);
        instructions.push(...ixs);
      } else {
        const ixs = await closeActiveTunaSpotPositionOrcaInstructions(rpc, signer, positionMint, args);
        instructions.push(...ixs);
      }
    } else {
      const args = {
        maxSwapSlippage,
        withdrawPercent: flags.withdrawPercent,
      };

      if (market.data.marketMaker == MarketMaker.Fusion) {
        const ixs = await decreaseTunaSpotPositionFusionInstructions(rpc, signer, positionMint, args);
        instructions.push(...ixs);
      } else {
        const ixs = await decreaseTunaSpotPositionOrcaInstructions(rpc, signer, positionMint, args);
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
