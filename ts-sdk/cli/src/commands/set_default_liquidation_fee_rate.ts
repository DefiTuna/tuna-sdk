import {
  fetchTunaConfig,
  getSetDefaultLiquidationFeeRateInstruction,
  getTunaConfigAddress,
} from "@crypticdot/defituna-client";
import { sendTransaction } from "@crypticdot/fusionamm-tx-sender";

import BaseCommand, { percentArg } from "../base";
import { rpc, signer } from "../rpc";

export default class SetDefaultLiquidationFeeRate extends BaseCommand {
  static override args = {
    value: percentArg({
      description: "Default liquidation fee rate (hundredths of a basis point or %)",
      required: true,
    }),
  };
  static override description = "Sets the default liquidation fee rate";
  static override examples = ["<%= config.bin %> <%= command.id %> 10%"];

  public async run() {
    const { args } = await this.parse(SetDefaultLiquidationFeeRate);

    const tunaConfigAddress = (await getTunaConfigAddress())[0];
    const tunaConfig = await fetchTunaConfig(rpc, tunaConfigAddress);

    console.log(
      `Current default liquidation fee rate:`,
      this.percentageValueToString(tunaConfig.data.defaultLiquidationFeeRate),
    );

    if (tunaConfig.data.defaultLiquidationFeeRate != args.value) {
      console.log(`Setting value to:`, this.percentageValueToString(args.value));

      const ix = getSetDefaultLiquidationFeeRateInstruction({
        authority: signer,
        tunaConfig: tunaConfigAddress,
        defaultLiquidationFeeRate: args.value,
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
