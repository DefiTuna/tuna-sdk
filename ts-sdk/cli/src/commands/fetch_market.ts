import { fetchMarket, getMarketAddress } from "@crypticdot/defituna-client";

import BaseCommand, { addressArg } from "../base";
import { rpc } from "../rpc";

export default class FetchMarket extends BaseCommand {
  static override args = {
    pool: addressArg({
      description: "Fusion or Orca pool address",
      required: true,
    }),
  };

  static override description = "Fetch a tuna market by a provided pool address";
  static override examples = ["<%= config.bin %> <%= command.id %> HsQGWEh3ib6w59rBh5n1jXmi8VXFBqKEjxozL6PGfcgb"];

  public async run() {
    const { args } = await this.parse(FetchMarket);

    console.log("Fetching the Tuna market...");
    const marketAddress = (await getMarketAddress(args.pool))[0];
    console.log("Fetching market:", marketAddress);
    const market = await fetchMarket(rpc, marketAddress);
    console.log("Market:", market);
  }
}
