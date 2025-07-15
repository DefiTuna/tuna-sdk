import { fetchTunaConfig, getSetFeeRecipientInstruction, getTunaConfigAddress } from "@crypticdot/defituna-client";
import { sendTransaction } from "@crypticdot/fusionamm-tx-sender";

import BaseCommand, { addressArg } from "../base";
import { rpc, signer } from "../rpc";

export default class SetFeeRecipient extends BaseCommand {
  static override args = {
    value: addressArg({
      description: "Fee Recipient authority",
      required: true,
    }),
  };
  static override description = "Sets the fee recipient authority";
  static override examples = ["<%= config.bin %> <%= command.id %> ADDRESS"];

  public async run() {
    const { args } = await this.parse(SetFeeRecipient);

    const tunaConfigAddress = (await getTunaConfigAddress())[0];
    const tunaConfig = await fetchTunaConfig(rpc, tunaConfigAddress);

    console.log(`Current fee recipient authority:`, tunaConfig.data.feeRecipient);

    if (tunaConfig.data.feeRecipient != args.value) {
      console.log(`Setting value to:`, args.value);

      const ix = getSetFeeRecipientInstruction({
        authority: signer,
        tunaConfig: tunaConfigAddress,
        feeRecipient: args.value,
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
