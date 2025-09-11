import { fetchAllMarketWithFilter } from "@crypticdot/defituna-client";
import { sendTransaction } from "@crypticdot/fusionamm-tx-sender";
import { Address } from "@solana/kit";
import { getExtendLookupTableInstruction } from "@solana-program/address-lookup-table";

import BaseCommand, { addressArg } from "../base";
import { rpc, signer } from "../rpc";

export default class CreateMarket extends BaseCommand {
  static override args = {
    address0: addressArg({
      description: "Address #1 to add to the lookup table",
      required: true,
    }),
    address1: addressArg({
      description: "Address #2 to add to the lookup table",
    }),
    address2: addressArg({
      description: "Address #3 to add to the lookup table",
    }),
    address3: addressArg({
      description: "Address #4 to add to the lookup table",
    }),
  };

  static override description = "Create a tuna market";
  static override examples = ["<%= config.bin %> <%= command.id %> Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE"];

  public async run() {
    const { args } = await this.parse(CreateMarket);

    const addresses: Address[] = [];
    addresses.push(args.address0);
    if (args.address1) addresses.push(args.address1);
    if (args.address2) addresses.push(args.address2);
    if (args.address3) addresses.push(args.address3);

    console.log("Fetching markets...");
    const markets = await fetchAllMarketWithFilter(rpc);

    for (const market of markets) {
      console.log(`Updating the address lookup table of market / pool: ${market.address}/${market.data.pool}`);

      const ix = getExtendLookupTableInstruction({
        address: market.data.addressLookupTable,
        addresses,
        authority: signer,
        payer: signer,
      });

      const signature = await sendTransaction(rpc, [ix], signer);
      console.log("Transaction landed:", signature);
    }
  }
}
