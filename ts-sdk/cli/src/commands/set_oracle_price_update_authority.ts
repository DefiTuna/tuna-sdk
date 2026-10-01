import {
  fetchTunaConfig,
  getSetOraclePriceUpdateAuthorityInstruction,
  getTunaConfigAddress,
} from "@crypticdot/defituna-client";
import { sendTransaction } from "@crypticdot/fusionamm-tx-sender";

import BaseCommand, { addressArg } from "../base";
import { rpc, signer } from "../rpc";

export default class SetOraclePriceUpdateAuthority extends BaseCommand {
  static override args = {
    value: addressArg({
      description: "Oracle price update authority",
      required: true,
    }),
  };
  static override description = "Immediately sets the oracle price update authority with current owner authorization";
  static override examples = ["<%= config.bin %> <%= command.id %> ADDRESS"];

  public async run() {
    const { args } = await this.parse(SetOraclePriceUpdateAuthority);

    const tunaConfigAddress = (await getTunaConfigAddress())[0];
    const tunaConfig = await fetchTunaConfig(rpc, tunaConfigAddress);

    console.log(`Current oracle price update authority:`, tunaConfig.data.oraclePriceUpdateAuthority);

    if (tunaConfig.data.oraclePriceUpdateAuthority != args.value) {
      if (signer.address !== tunaConfig.data.ownerAuthority) {
        throw new Error(
          `Signer ${signer.address} does not match the current owner authority ${tunaConfig.data.ownerAuthority}. ` +
            "For multisig owners, submit the existing set_oracle_price_update_authority instruction through your " +
            "external multisig; this CLI cannot sign for a multisig PDA.",
        );
      }

      console.log(`Immediately setting value to:`, args.value);

      const ix = getSetOraclePriceUpdateAuthorityInstruction({
        authority: signer,
        tunaConfig: tunaConfigAddress,
        oraclePriceUpdateAuthority: args.value,
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
