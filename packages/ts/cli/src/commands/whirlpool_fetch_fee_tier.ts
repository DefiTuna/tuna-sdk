import { fetchAllFeeTierWithFilter, fetchMaybeFeeTier } from "@orca-so/whirlpools-client";
import BaseCommand, { addressArg } from "../base.ts";
import { rpc } from "../rpc.ts";

export default class FetchFeeTier extends BaseCommand {
  static override args = {
    feeTier: addressArg({
      description: "Fee tier address",
    }),
  };
  static override description = "Fetch a fee tier or the list of all fee tiers";
  static override examples = ["<%= config.bin %> <%= command.id %> 3qx1xPHwQopPXQPPjZDNZ4PnKpQvYeC3s8tPHcC5Ux1V"];

  public async run() {
    const { args } = await this.parse(FetchFeeTier);

    const feeTierAddress = args.feeTier;

    if (feeTierAddress) {
      console.log(`Fetching fee tier at address ${feeTierAddress}...`);
      const feeTier = await fetchMaybeFeeTier(rpc, feeTierAddress);
      if (feeTier.exists) {
        console.log("Fee tier:", feeTier);
      } else {
        throw new Error(`Fee tier is not found at address ${feeTierAddress}`);
      }
    } else {
      console.log("Fetching fee tiers...");
      const feeTiers = await fetchAllFeeTierWithFilter(rpc);
      for (let feeTier of feeTiers) {
        console.log(
          `${feeTier.address}, config: ${feeTier.data.whirlpoolsConfig}, tickSpacing: ${feeTier.data.tickSpacing}, feeRate: ${feeTier.data.defaultFeeRate}`,
        );
      }
    }
  }
}
