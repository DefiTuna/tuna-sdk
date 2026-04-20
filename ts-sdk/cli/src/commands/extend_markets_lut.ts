import {
  DEFAULT_ADDRESS,
  fetchAllMarketWithFilter,
  getAddressesForMarketLookupTable,
} from "@crypticdot/defituna-client";
import { sendTransaction } from "@crypticdot/fusionamm-tx-sender";
import { fetchAddressLookupTable, getExtendLookupTableInstruction } from "@solana-program/address-lookup-table";

import BaseCommand from "../base";
import { rpc, signer } from "../rpc";

export default class CreateMarket extends BaseCommand {
  static override description = "Create a tuna market";
  static override examples = ["<%= config.bin %> <%= command.id %> Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE"];

  public async run() {
    console.log("Fetching markets...");
    const markets = await fetchAllMarketWithFilter(rpc);

    for (const market of markets) {
      console.log(`Updating the address lookup table of market / pool: ${market.address}/${market.data.pool}`);

      const lut = await fetchAddressLookupTable(rpc, market.data.addressLookupTable);
      const oldAddresses = lut.data.addresses;

      const newAddresses = await getAddressesForMarketLookupTable(
        rpc,
        market.data.pool,
        market.data.marketMaker,
        market.data.authority != DEFAULT_ADDRESS,
      );

      const addresses = newAddresses.filter(a => !oldAddresses.includes(a));

      if (addresses.length > 0) {
        console.log(`Extending the lookup table with ${addresses.length} addresses:`);
        for (const a of addresses) {
          console.log("  ", a);
        }

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
}
