import BaseCommand, { percentArg } from "../base.ts";
import { rpc, sendTransaction, signer } from "../rpc.ts";
import { fetchTunaConfig, getSetDefaultOraclePriceDeviationThresholdInstruction, getTunaConfigAddress, HUNDRED_PERCENT } from "@defituna/client";

export default class SetDefaultOraclePriceDeviationThreshold extends BaseCommand {
  static override args = {
    value: percentArg({
      description: "Default oracle price deviation threshold (%)",
      required: true,
    }),
  };
  static override description = "Sets the default oracle price deviation threshold";
  static override examples = ["<%= config.bin %> <%= command.id %> 3.0"];

  public async run() {
    const { args } = await this.parse(SetDefaultOraclePriceDeviationThreshold);

    const tunaConfigAddress = (await getTunaConfigAddress())[0];
    const tunaConfig = await fetchTunaConfig(rpc, tunaConfigAddress);

    const currentValue = (tunaConfig.data.oraclePriceDeviationThreshold / HUNDRED_PERCENT) * 100;
    console.log(`Current default oracle price deviation threshold: ${currentValue}%`);

    const newValue = Math.floor((HUNDRED_PERCENT * args.value) / 100);

    if (tunaConfig.data.oraclePriceDeviationThreshold != newValue) {
      console.log(`Setting value to: ${args.value}%`);

      const ix = getSetDefaultOraclePriceDeviationThresholdInstruction({
        authority: signer,
        tunaConfig: tunaConfigAddress,
        oraclePriceDeviationThreshold: newValue,
      });

      console.log("");
      console.log("Sending a transaction...");
      const signature = await sendTransaction([ix]);
      console.log("Transaction landed:", signature);
    } else {
      console.log("Nothing changed!");
    }
  }
}
