import { fetchVault, getLendingVaultAddress } from "@crypticdot/defituna-client";

import BaseCommand, { addressArg, addressFlag } from "../base";
import { rpc } from "../rpc";

export default class FetchVault extends BaseCommand {
  static override args = {
    mint: addressArg({
      description: "Token mint address",
      required: true,
    }),
  };

  static override flags = {
    market: addressFlag({
      description: "Isolated vault market",
    }),
  };

  static override description = "Fetch a tuna lending vault by a token mint address";
  static override examples = ["<%= config.bin %> <%= command.id %> HsQGWEh3ib6w59rBh5n1jXmi8VXFBqKEjxozL6PGfcgb"];

  public async run() {
    const { args, flags } = await this.parse(FetchVault);

    const vaultAddress = (await getLendingVaultAddress(args.mint, flags.market))[0];

    console.log("Fetching vault:", vaultAddress);
    const vault = await fetchVault(rpc, vaultAddress);
    console.log("Vault:", vault);
  }
}
