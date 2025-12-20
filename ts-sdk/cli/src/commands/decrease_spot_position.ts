import {
  closeTunaSpotPositionInstructions,
  fetchMarket,
  fetchTunaSpotPosition,
  getMarketAddress,
  getTunaSpotPositionAddress,
  HUNDRED_PERCENT,
  MarketMaker,
  modifyTunaSpotPositionFusionInstructions,
  modifyTunaSpotPositionOrcaInstructions,
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

    decreasePercent: percentFlag({
      description: "Decrease percentage",
      min: 0,
      max: HUNDRED_PERCENT,
    }),
  };
  static override description = "Decreases a tuna spot position and closes it if all liquidity is withdrawn";
  static override examples = [
    "<%= config.bin %> <%= command.id %> --pool 7VuKeevbvbQQcxz6N4SNLmuq6PYy4AcGQRDssoqo4t65 --decreasePercent 100%",
  ];

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

    const args = {
      decreasePercent: flags.decreasePercent ? flags.decreasePercent : HUNDRED_PERCENT,
      collateralAmount: 0,
      borrowAmount: 0,
      requiredSwapAmount: 0n,
    };

    if (market.data.marketMaker == MarketMaker.Fusion) {
      const ixs = await modifyTunaSpotPositionFusionInstructions(
        rpc,
        signer,
        tunaPosition.data.pool,
        tunaPosition.data.collateralToken,
        args,
      );
      instructions.push(...ixs);
    } else {
      const ixs = await modifyTunaSpotPositionOrcaInstructions(
        rpc,
        signer,
        tunaPosition.data.pool,
        tunaPosition.data.collateralToken,
        args,
      );
      instructions.push(...ixs);
    }

    if (args.decreasePercent == HUNDRED_PERCENT) {
      const ixs = await closeTunaSpotPositionInstructions(rpc, signer, tunaPosition.data.pool);
      instructions.push(...ixs);
    }

    console.log("Sending a transaction...");
    const signature = await sendTransaction(rpc, instructions, signer, DEFAULT_TRANSACTION_CONFIG, [
      addressLookupTable,
    ]);
    console.log("Transaction landed:", signature);
  }
}
