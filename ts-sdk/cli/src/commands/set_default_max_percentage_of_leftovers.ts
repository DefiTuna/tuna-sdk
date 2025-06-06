import {
  fetchTunaConfig,
  getSetDefaultMaxPercentageOfLeftoversInstruction,
  getTunaConfigAddress,
} from "@crypticdot/defituna-client";
import { sendTransaction } from "@crypticdot/fusionamm-tx-sender";

import BaseCommand, { percentArg } from "../base";
import { rpc, signer } from "../rpc";

export default class SetDefaultMaxPercentageOfLeftovers extends BaseCommand {
  static override args = {
    value: percentArg({
      description: "Default max percentage of leftovers (hundredths of a basis point or %)",
      required: true,
    }),
  };
  static override description = "Sets the default max percentage of leftovers";
  static override examples = ["<%= config.bin %> <%= command.id %> 1.0%"];

  public async run() {
    const { args } = await this.parse(SetDefaultMaxPercentageOfLeftovers);

    const tunaConfigAddress = (await getTunaConfigAddress())[0];
    const tunaConfig = await fetchTunaConfig(rpc, tunaConfigAddress);

    console.log(
      `Current default max percentage of leftovers:`,
      this.percentageValueToString(tunaConfig.data.maxPercentageOfLeftovers),
    );

    if (tunaConfig.data.maxPercentageOfLeftovers != args.value) {
      console.log(`Setting value to:`, this.percentageValueToString(args.value));

      const ix = getSetDefaultMaxPercentageOfLeftoversInstruction({
        authority: signer,
        tunaConfig: tunaConfigAddress,
        maxPercentageOfLeftovers: args.value,
      });

      console.log("");
      console.log("Sending a transaction...");
      const signature = await sendTransaction(rpc, [ix], signer);
      console.log("Transaction landed:", signature);
    } else {
      console.log("Nothing changed!");
    }
  }

  public async;
}
