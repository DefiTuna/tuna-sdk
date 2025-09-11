import {
  fetchAllTunaLpPositionWithFilter,
  fetchMaybeTunaLpPosition,
  tunaLpPositionAuthorityFilter,
  tunaLpPositionPoolFilter,
} from "@crypticdot/defituna-client";

import BaseCommand, { addressArg, addressFlag } from "../base";
import { rpc } from "../rpc";

export default class FetchLpPosition extends BaseCommand {
  static override args = {
    position: addressArg({
      description: "Tuna liquidity position address",
    }),
  };
  static override flags = {
    pool: addressFlag({
      description: "Pool address",
    }),
    owner: addressFlag({
      description: "Position owner address",
    }),
  };
  static override description = "Fetch a tuna liquidity position or the list of all positions";
  static override examples = ["<%= config.bin %> <%= command.id %> 3qx1xPHwQopPXQPPjZDNZ4PnKpQvYeC3s8tPHcC5Ux1V"];

  public async run() {
    const { args, flags } = await this.parse(FetchLpPosition);

    const positionAddress = args.position;

    if (positionAddress) {
      console.log(`Fetching position at address ${positionAddress}...`);
      const position = await fetchMaybeTunaLpPosition(rpc, positionAddress);
      if (position.exists) {
        console.log("Position:", position);
      } else {
        throw new Error(`Tuna position is not found at address ${positionAddress}`);
      }
    } else {
      console.log("Fetching positions...");
      if (flags.pool && flags.owner) {
        const positions = await fetchAllTunaLpPositionWithFilter(
          rpc,
          tunaLpPositionPoolFilter(flags.pool),
          tunaLpPositionAuthorityFilter(flags.owner),
        );
        for (const position of positions) {
          console.log(position.address);
        }
      } else if (flags.pool) {
        const positions = await fetchAllTunaLpPositionWithFilter(rpc, tunaLpPositionPoolFilter(flags.pool));
        for (const position of positions) {
          console.log(position.address);
        }
      } else if (flags.owner) {
        const positions = await fetchAllTunaLpPositionWithFilter(rpc, tunaLpPositionAuthorityFilter(flags.owner));
        for (const position of positions) console.log(position.address);
      } else {
        const positions = await fetchAllTunaLpPositionWithFilter(rpc);
        for (const position of positions) console.log(position.address);
      }
    }
  }
}
