import BaseCommand, { percentArg } from "../base.ts";
import { rpc, sendTransaction, signer } from "../rpc.ts";
import { fetchTunaConfig, getSetDefaultMaxSwapSlippageInstruction, getTunaConfigAddress, HUNDRED_PERCENT } from "@defituna/client";

export default class SetDefaultMaxSwapSlippage extends BaseCommand {
  static override args = {
    value: percentArg({
      description: "Default max swap slippage (%)",
      required: true,
    }),
  };
  static override description = "Sets the default max swap slippage";
  static override examples = ["<%= config.bin %> <%= command.id %> 8.0"];

  public async run() {
    const { args } = await this.parse(SetDefaultMaxSwapSlippage);

    const tunaConfigAddress = (await getTunaConfigAddress())[0];
    const tunaConfig = await fetchTunaConfig(rpc, tunaConfigAddress);

    const currentValue = (tunaConfig.data.maxSwapSlippage / HUNDRED_PERCENT) * 100;
    console.log(`Current default max swap slippage: ${currentValue}%`);

    const newValue = Math.floor((HUNDRED_PERCENT * args.value) / 100);

    if (tunaConfig.data.maxSwapSlippage != newValue) {
      console.log(`Setting value to: ${args.value}%`);

      const ix = getSetDefaultMaxSwapSlippageInstruction({
        authority: signer,
        tunaConfig: tunaConfigAddress,
        maxSwapSlippage: newValue,
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
