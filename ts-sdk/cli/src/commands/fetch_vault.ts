import { fetchVault, getLendingVaultAddress, getLendingVaultV2Address } from "@crypticdot/defituna-client";
import { Flags } from "@oclif/core";
import { Address } from "@solana/kit";

import BaseCommand, { addressArg } from "../base";
import { rpc } from "../rpc";

export default class FetchVault extends BaseCommand {
  static override args = {
    mint: addressArg({
      description: "Token mint address",
      required: true,
    }),
  };

  static override flags = {
    id: Flags.integer({
      description: "Isolated vault id. Must be greater than 0 if set.",
    }),
  };

  static override description = "Fetch a tuna lending vault by a token mint address";
  static override examples = ["<%= config.bin %> <%= command.id %> HsQGWEh3ib6w59rBh5n1jXmi8VXFBqKEjxozL6PGfcgb"];

  public async run() {
    const { args, flags } = await this.parse(FetchVault);

    let vaultAddress: Address;

    if (flags.id) {
      vaultAddress = (await getLendingVaultV2Address(args.mint, flags.id))[0];
    } else {
      vaultAddress = (await getLendingVaultAddress(args.mint))[0];
    }

    console.log("Fetching vault:", vaultAddress);
    const vault = await fetchVault(rpc, vaultAddress);
    console.log("Vault:", vault);
  }
}
