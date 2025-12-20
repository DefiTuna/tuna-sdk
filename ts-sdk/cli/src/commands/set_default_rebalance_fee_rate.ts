import {
  fetchTunaConfig,
  getSetDefaultRebalanceFeeRateInstruction,
  getTunaConfigAddress,
} from "@crypticdot/defituna-client";
import { sendTransaction } from "@crypticdot/fusionamm-tx-sender";

import BaseCommand, { percentArg } from "../base";
import { rpc, signer } from "../rpc";

export default class SetDefaultRebalanceFeeRate extends BaseCommand {
  static override args = {
    value: percentArg({
      description: "Default rebalance fee rate (hundredths of a basis point or %)",
      required: true,
    }),
  };
  static override description = "Sets the default rebalance fee rate";
  static override examples = ["<%= config.bin %> <%= command.id %> 10%"];

  public async run() {
    const { args } = await this.parse(SetDefaultRebalanceFeeRate);

    const tunaConfigAddress = (await getTunaConfigAddress())[0];
    const tunaConfig = await fetchTunaConfig(rpc, tunaConfigAddress);

    console.log(
      `Current default rebalance fee rate:`,
      this.percentageValueToString(tunaConfig.data.defaultRebalanceFeeRate),
    );

    if (tunaConfig.data.defaultRebalanceFeeRate != args.value) {
      console.log(`Setting value to:`, this.percentageValueToString(args.value));

      const ix = getSetDefaultRebalanceFeeRateInstruction({
        authority: signer,
        tunaConfig: tunaConfigAddress,
        defaultRebalanceFeeRate: args.value,
      });

      console.log("");
      console.log("Sending a transaction...");
      const signature = await sendTransaction(rpc, [ix], signer);
      console.log("Transaction landed:", signature);
    } else {
      console.log("Nothing changed!");
    }
  }
}
