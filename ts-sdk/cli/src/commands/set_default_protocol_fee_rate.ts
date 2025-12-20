import {
  fetchTunaConfig,
  getSetDefaultProtocolFeeRateInstruction,
  getTunaConfigAddress,
} from "@crypticdot/defituna-client";
import { sendTransaction } from "@crypticdot/fusionamm-tx-sender";

import BaseCommand, { percentArg } from "../base";
import { rpc, signer } from "../rpc";

export default class SetDefaultProtocolFeeRate extends BaseCommand {
  static override args = {
    value: percentArg({
      description: "Default protocol fee rate (hundredths of a basis point or %)",
      required: true,
    }),
  };
  static override description = "Sets the default protocol fee rate";
  static override examples = ["<%= config.bin %> <%= command.id %> 0.1%"];

  public async run() {
    const { args } = await this.parse(SetDefaultProtocolFeeRate);

    const tunaConfigAddress = (await getTunaConfigAddress())[0];
    const tunaConfig = await fetchTunaConfig(rpc, tunaConfigAddress);

    console.log(
      `Current default protocol fee rate:`,
      this.percentageValueToString(tunaConfig.data.defaultProtocolFeeRate),
    );

    if (tunaConfig.data.defaultProtocolFeeRate != args.value) {
      console.log(`Setting value to:`, this.percentageValueToString(args.value));

      const ix = getSetDefaultProtocolFeeRateInstruction({
        authority: signer,
        tunaConfig: tunaConfigAddress,
        defaultProtocolFeeRate: args.value,
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
