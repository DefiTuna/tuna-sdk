import {
  fetchTunaConfig,
  getSetDefaultOraclePriceDeviationThresholdInstruction,
  getTunaConfigAddress,
} from "@crypticdot/defituna-client";
import { sendTransaction } from "@crypticdot/fusionamm-tx-sender";

import BaseCommand, { percentArg } from "../base";
import { rpc, signer } from "../rpc";

export default class SetDefaultOraclePriceDeviationThreshold extends BaseCommand {
  static override args = {
    value: percentArg({
      description: "Default oracle price deviation threshold (hundredths of a basis point or %)",
      required: true,
    }),
  };
  static override description = "Sets the default oracle price deviation threshold";
  static override examples = ["<%= config.bin %> <%= command.id %> 3.0%"];

  public async run() {
    const { args } = await this.parse(SetDefaultOraclePriceDeviationThreshold);

    const tunaConfigAddress = (await getTunaConfigAddress())[0];
    const tunaConfig = await fetchTunaConfig(rpc, tunaConfigAddress);

    console.log(
      `Current default oracle price deviation threshold:`,
      this.percentageValueToString(tunaConfig.data.oraclePriceDeviationThreshold),
    );

    if (tunaConfig.data.oraclePriceDeviationThreshold != args.value) {
      console.log(`Setting value to:`, this.percentageValueToString(args.value));

      const ix = getSetDefaultOraclePriceDeviationThresholdInstruction({
        authority: signer,
        tunaConfig: tunaConfigAddress,
        oraclePriceDeviationThreshold: args.value,
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
