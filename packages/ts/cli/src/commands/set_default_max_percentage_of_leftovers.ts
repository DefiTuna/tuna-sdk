import BaseCommand, { percentArg } from "../base.ts";
import { rpc, sendTransaction, signer } from "../rpc.ts";
import { fetchTunaConfig, getSetDefaultMaxPercentageOfLeftoversInstruction, getTunaConfigAddress, HUNDRED_PERCENT } from "@defituna/client";

export default class SetDefaultMaxPercentageOfLeftovers extends BaseCommand {
  static override args = {
    value: percentArg({
      description: "Default max percentage of leftovers (%)",
      required: true,
    }),
  };
  static override description = "Sets the default max percentage of leftovers";
  static override examples = ["<%= config.bin %> <%= command.id %> 1.0"];

  public async run() {
    const { args } = await this.parse(SetDefaultMaxPercentageOfLeftovers);

    const tunaConfigAddress = (await getTunaConfigAddress())[0];
    const tunaConfig = await fetchTunaConfig(rpc, tunaConfigAddress);

    const currentValue = (tunaConfig.data.maxPercentageOfLeftovers / HUNDRED_PERCENT) * 100;
    console.log(`Current default max percentage of leftovers: ${currentValue}%`);

    const newValue = Math.floor((HUNDRED_PERCENT * args.value) / 100);

    if (tunaConfig.data.maxPercentageOfLeftovers != newValue) {
      console.log(`Setting value to: ${args.value}%`);

      const ix = getSetDefaultMaxPercentageOfLeftoversInstruction({
        authority: signer,
        tunaConfig: tunaConfigAddress,
        maxPercentageOfLeftovers: newValue,
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
