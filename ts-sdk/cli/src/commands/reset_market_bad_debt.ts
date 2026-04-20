import {
  fetchMarket,
  getMarketAddress,
  getResetMarketBadDebtInstruction,
  getTunaConfigAddress,
} from "@crypticdot/defituna-client";
import { sendTransaction } from "@crypticdot/fusionamm-tx-sender";

import BaseCommand, { addressArg } from "../base";
import { rpc, signer } from "../rpc";

export default class UpdateMarket extends BaseCommand {
  static override args = {
    pool: addressArg({
      description: "Pool address",
      required: true,
    }),
  };
  static override description = "Resets a bad debt for the tuna market";
  static override examples = ["<%= config.bin %> <%= command.id %> Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE"];

  public async run() {
    const { args } = await this.parse(UpdateMarket);

    const marketAddress = (await getMarketAddress(args.pool))[0];
    console.log("Fetching market:", marketAddress);
    const market = await fetchMarket(rpc, marketAddress);

    if (market.data.badDebtA == 0n && market.data.badDebtB == 0n) {
      console.log("No bad debt for this market.");
      return;
    }

    const tunaConfigAddress = (await getTunaConfigAddress())[0];

    const ix = getResetMarketBadDebtInstruction({
      authority: signer,
      market: marketAddress,
      tunaConfig: tunaConfigAddress,
      vaultA: market.data.vaultA,
      vaultB: market.data.vaultB,
    });

    console.log("Sending a transaction...");
    const signature = await sendTransaction(rpc, [ix], signer);
    console.log("Transaction landed:", signature);
  }
}
