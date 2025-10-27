import {
  fetchAllTunaSpotPositionWithFilter,
  fetchMaybeTunaSpotPosition,
  tunaSpotPositionAuthorityFilter,
  tunaSpotPositionPoolFilter,
} from "@crypticdot/defituna-client";

import BaseCommand, { addressArg, addressFlag } from "../base";
import { rpc } from "../rpc";

export default class FetchSpotPosition extends BaseCommand {
  static override args = {
    position: addressArg({
      description: "Tuna spot position address",
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
  static override description = "Fetch a tuna spot position or the list of all positions";
  static override examples = ["<%= config.bin %> <%= command.id %> 3qx1xPHwQopPXQPPjZDNZ4PnKpQvYeC3s8tPHcC5Ux1V"];

  public async run() {
    const { args, flags } = await this.parse(FetchSpotPosition);

    const positionAddress = args.position;

    if (positionAddress) {
      console.log(`Fetching position at address ${positionAddress}...`);
      const position = await fetchMaybeTunaSpotPosition(rpc, positionAddress);
      if (position.exists) {
        console.log("Position:", position);
      } else {
        throw new Error(`Tuna position is not found at address ${positionAddress}`);
      }
    } else {
      console.log("Fetching spot positions...");
      if (flags.pool && flags.owner) {
        const positions = await fetchAllTunaSpotPositionWithFilter(
          rpc,
          tunaSpotPositionPoolFilter(flags.pool),
          tunaSpotPositionAuthorityFilter(flags.owner),
        );
        for (const position of positions) {
          console.log(position.address);
        }
      } else if (flags.pool) {
        const positions = await fetchAllTunaSpotPositionWithFilter(rpc, tunaSpotPositionPoolFilter(flags.pool));
        for (const position of positions) {
          console.log(position.address);
        }
      } else if (flags.owner) {
        const positions = await fetchAllTunaSpotPositionWithFilter(rpc, tunaSpotPositionAuthorityFilter(flags.owner));
        for (const position of positions) console.log(position.address);
      } else {
        const positions = await fetchAllTunaSpotPositionWithFilter(rpc);
        for (const position of positions) console.log(position.address);
      }
    }
  }
}
