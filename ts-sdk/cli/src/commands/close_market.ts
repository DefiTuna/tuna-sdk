import { closeMarketInstructions, fetchMarket, getMarketAddress } from "@crypticdot/defituna-client";
import { sendTransaction } from "@crypticdot/fusionamm-tx-sender";
import { Flags } from "@oclif/core";

import BaseCommand, { addressArg } from "../base";
import { rpc, signer } from "../rpc";

export default class CreateMarket extends BaseCommand {
  static override args = {
    pool: addressArg({
      description: "Pool address",
      required: true,
    }),
  };
  static override flags = {
    skipLookupTableDeactivation: Flags.boolean({
      description: "Set if lookup table should not be closed",
      default: false,
    }),
  };
  static override description = "Close a tuna market";
  static override examples = ["<%= config.bin %> <%= command.id %> Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE"];

  public async run() {
    const { args, flags } = await this.parse(CreateMarket);

    const marketAddress = (await getMarketAddress(args.pool))[0];
    const market = await fetchMarket(rpc, marketAddress);
    const addressLookupTable = market.data.addressLookupTable;

    if (!flags.skipLookupTableDeactivation) {
      console.log(`Closing market ${marketAddress} and deactivating lookup table ${addressLookupTable}`);
    } else {
      console.log("Closing market:", marketAddress);
    }
    const instructions = await closeMarketInstructions(rpc, signer, args.pool, !flags.skipLookupTableDeactivation);

    console.log("");
    console.log("Sending a transaction...");
    const signature = await sendTransaction(rpc, instructions, signer);
    console.log("Transaction landed:", signature);

    if (!flags.skipLookupTableDeactivation) {
      console.log(
        "Don't forget to close the lookup table of the market later to claim the rent! Lookup table address is",
        addressLookupTable,
      );
    }
  }
}
