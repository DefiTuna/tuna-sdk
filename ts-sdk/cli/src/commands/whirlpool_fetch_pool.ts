import { fetchAllWhirlpoolWithFilter, fetchMaybeWhirlpool } from "@orca-so/whirlpools-client";
import { sqrtPriceToPrice } from "@orca-so/whirlpools-core";
import { fetchAllMint } from "@solana-program/token-2022";

import BaseCommand, { addressArg } from "../base";
import { rpc } from "../rpc";

export default class FetchPool extends BaseCommand {
  static override args = {
    pool: addressArg({
      description: "Whirlpool address",
    }),
  };
  static override description = "Fetch a whirlpool or the list of all pools";
  static override examples = ["<%= config.bin %> <%= command.id %> 3qx1xPHwQopPXQPPjZDNZ4PnKpQvYeC3s8tPHcC5Ux1V"];

  public async run() {
    const { args } = await this.parse(FetchPool);

    const whirlpoolAddress = args.pool;

    if (whirlpoolAddress) {
      console.log(`Fetching whirlpool at address ${whirlpoolAddress}...`);
      const whirlpool = await fetchMaybeWhirlpool(rpc, whirlpoolAddress);
      if (whirlpool.exists) {
        console.log("Whirlpool:", whirlpool);
        console.log("RewardInfos[0]:", whirlpool.data.rewardInfos[0]);
        console.log("RewardInfos[1]:", whirlpool.data.rewardInfos[1]);
        console.log("RewardInfos[2]:", whirlpool.data.rewardInfos[2]);

        const [mintA, mintB] = await fetchAllMint(rpc, [whirlpool.data.tokenMintA, whirlpool.data.tokenMintB]);
        console.log(
          "Current pool price:",
          sqrtPriceToPrice(whirlpool.data.sqrtPrice, mintA.data.decimals, mintB.data.decimals),
        );
      } else {
        throw new Error(`Whirlpool is not found at address ${whirlpoolAddress}`);
      }
    } else {
      console.log("Fetching whirlpools...");
      const pools = await fetchAllWhirlpoolWithFilter(rpc);
      for (const pool of pools) {
        console.log(pool.address);
      }
    }
  }
}
