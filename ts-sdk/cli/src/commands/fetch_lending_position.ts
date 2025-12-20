import {
  fetchAllLendingPositionWithFilter,
  fetchMaybeLendingPosition,
  getLendingVaultV2Address,
  LendingPosition,
  lendingPositionAuthorityFilter,
  lendingPositionMintFilter,
  lendingPositionVaultFilter,
} from "@crypticdot/defituna-client";
import { Flags } from "@oclif/core";
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
    vault: addressFlag({
      description: "Lending vault address",
    }),
    owner: addressFlag({
      description: "Lending position owner address",
    }),
    id: Flags.integer({
      description: "Isolated vault id. Must be greater than 0 if set.",
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

      if (flags.vault && (flags.mint || flags.id)) {
        throw new Error(`Mint and id shouldn't be set if the vault address is provided`);
      }

      const vaultAddress =
        flags.vault ?? (flags.mint && flags.id ? (await getLendingVaultV2Address(flags.mint, flags.id))[0] : undefined);

      if (flags.mint && flags.owner) {
        const positions = await fetchAllLendingPositionWithFilter(
          rpc,
          lendingPositionMintFilter(flags.mint),
          lendingPositionAuthorityFilter(flags.owner),
          ...(vaultAddress ? [lendingPositionVaultFilter(vaultAddress)] : []),
        );
        for (const position of positions) this.logPosition(position);
      } else if (flags.mint) {
        const positions = await fetchAllLendingPositionWithFilter(
          rpc,
          lendingPositionMintFilter(flags.mint),
          ...(vaultAddress ? [lendingPositionVaultFilter(vaultAddress)] : []),
        );
        this.sortByAmount(positions);
        for (const position of positions) this.logPosition(position);
      } else if (vaultAddress) {
        const positions = await fetchAllLendingPositionWithFilter(rpc, lendingPositionVaultFilter(vaultAddress));
        this.sortByAmount(positions);
        for (const position of positions) this.logPosition(position);
      } else if (flags.owner) {
        const positions = await fetchAllLendingPositionWithFilter(
          rpc,
          lendingPositionAuthorityFilter(flags.owner),
          ...(vaultAddress ? [lendingPositionVaultFilter(vaultAddress)] : []),
        );
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
