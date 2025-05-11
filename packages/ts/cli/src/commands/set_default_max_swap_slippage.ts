import BaseCommand, { percentArg } from "../base.ts";
import { rpc, sendTransaction, signer } from "../rpc.ts";
import { fetchTunaConfig, getSetDefaultMaxSwapSlippageInstruction, getTunaConfigAddress } from "@defituna/client";

export default class SetDefaultMaxSwapSlippage extends BaseCommand {
  static override args = {
    value: percentArg({
      description: "Default max swap slippage (hundredths of a basis point or %)",
      required: true,
    }),
  };
  static override description = "Sets the default max swap slippage";
  static override examples = ["<%= config.bin %> <%= command.id %> 8.0%"];

  public async run() {
    const { args } = await this.parse(SetDefaultMaxSwapSlippage);

    const tunaConfigAddress = (await getTunaConfigAddress())[0];
    const tunaConfig = await fetchTunaConfig(rpc, tunaConfigAddress);

    console.log(`Current default max swap slippage:`, this.percentageValueToString(tunaConfig.data.maxSwapSlippage));

    if (tunaConfig.data.maxSwapSlippage != args.value) {
      console.log(`Setting value to:`, this.percentageValueToString(args.value));

      const ix = getSetDefaultMaxSwapSlippageInstruction({
        authority: signer,
        tunaConfig: tunaConfigAddress,
        maxSwapSlippage: args.value,
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
