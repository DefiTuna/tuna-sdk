import {
  fetchTunaConfig,
  getSetLiquidatorAuthorityInstruction,
  getTunaConfigAddress,
} from "@crypticdot/defituna-client";
import { sendTransaction } from "@crypticdot/fusionamm-tx-sender";

import BaseCommand, { addressArg } from "../base";
import { rpc, signer } from "../rpc";

export default class SetLiquidatorAuthority extends BaseCommand {
  static override args = {
    value: addressArg({
      description: "Liquidator authority",
      required: true,
    }),
  };
  static override description = "Immediately sets the liquidator authority with current owner authorization";
  static override examples = ["<%= config.bin %> <%= command.id %> ADDRESS"];

  public async run() {
    const { args } = await this.parse(SetLiquidatorAuthority);

    const tunaConfigAddress = (await getTunaConfigAddress())[0];
    const tunaConfig = await fetchTunaConfig(rpc, tunaConfigAddress);

    console.log(`Current liquidator authority:`, tunaConfig.data.liquidatorAuthority);

    if (tunaConfig.data.liquidatorAuthority != args.value) {
      if (signer.address !== tunaConfig.data.ownerAuthority) {
        throw new Error(
          `Signer ${signer.address} does not match the current owner authority ${tunaConfig.data.ownerAuthority}. ` +
            "For multisig owners, submit the existing set_liquidator_authority instruction through your external " +
            "multisig; this CLI cannot sign for a multisig PDA.",
        );
      }

      console.log(`Immediately setting value to:`, args.value);

      const ix = getSetLiquidatorAuthorityInstruction({
        authority: signer,
        tunaConfig: tunaConfigAddress,
        liquidatorAuthority: args.value,
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
