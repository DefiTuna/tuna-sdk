import {
  fetchAllLendingPositionWithFilter,
  fetchMaybeLendingPosition,
  LendingPosition,
  lendingPositionAuthorityFilter,
  lendingPositionMintFilter,
} from "@crypticdot/defituna-client";
import { Account } from "@solana/kit";

import BaseCommand, { addressArg, addressFlag } from "../base";
import { rpc } from "../rpc";

export default class FetchLendingPosition extends BaseCommand {
  static override args = {
    position: addressArg({
      description: "Tuna lending position address",
    }),
  };
  static override flags = {
    mint: addressFlag({
      description: "Token mint address",
    }),
    owner: addressFlag({
      description: "Lending position owner address",
    }),
  };
  static override description = "Fetch a tuna lending position or the list of all positions";
  static override examples = ["<%= config.bin %> <%= command.id %> So11111111111111111111111111111111111111112"];

  logPosition(position: Account<LendingPosition>) {
    console.log(`${position.address} (amount: ${position.data.depositedFunds}; authority: ${position.data.authority})`);
  }

  sortByAmount(positions: Array<Account<LendingPosition>>) {
    positions.sort((a, b) => Number(b.data.depositedFunds - a.data.depositedFunds));
  }

  public async run() {
    const { args, flags } = await this.parse(FetchLendingPosition);

    const positionAddress = args.position;

    if (positionAddress) {
      console.log(`Fetching position at address ${positionAddress}...`);
      const position = await fetchMaybeLendingPosition(rpc, positionAddress);
      if (position.exists) {
        console.log("Position:", position);
      } else {
        throw new Error(`Lending position is not found at address ${positionAddress}`);
      }
    } else {
      console.log("Fetching lending positions...");
      if (flags.mint && flags.owner) {
        const positions = await fetchAllLendingPositionWithFilter(
          rpc,
          lendingPositionMintFilter(flags.mint),
          lendingPositionAuthorityFilter(flags.owner),
        );
        for (const position of positions) this.logPosition(position);
      } else if (flags.mint) {
        const positions = await fetchAllLendingPositionWithFilter(rpc, lendingPositionMintFilter(flags.mint));
        this.sortByAmount(positions);
        for (const position of positions) this.logPosition(position);
      } else if (flags.owner) {
        const positions = await fetchAllLendingPositionWithFilter(rpc, lendingPositionAuthorityFilter(flags.owner));
        this.sortByAmount(positions);
        for (const position of positions) this.logPosition(position);
      } else {
        const positions = await fetchAllLendingPositionWithFilter(rpc);
        this.sortByAmount(positions);
        for (const position of positions) this.logPosition(position);
      }
    }
  }
}
