import {
  CreateVaultInstructionDataArgs,
  createVaultInstructions,
  fetchMaybeVault,
  getLendingVaultAddress,
  HUNDRED_PERCENT,
} from "@crypticdot/defituna-client";
import { sendTransaction } from "@crypticdot/fusionamm-tx-sender";
import { address } from "@solana/kit";
import { fetchMint } from "@solana-program/token-2022";

import BaseCommand, { addressArg, addressFlag, bigintFlag, percentFlag, pythFeedIdFlag } from "../base";
import { rpc, signer } from "../rpc";

export default class UpdateVault extends BaseCommand {
  static override args = {
    mint: addressArg({
      description: "Token mint address",
      required: true,
    }),
  };
  static override flags = {
    interestRate: percentFlag({
      description: "Annual interest rate in (hundredths of a basis point or %)",
      default: 400000,
    }),
    supplyLimit: bigintFlag({ description: "Supply limit", default: 0n }),
    pythOracleFeedId: pythFeedIdFlag({
      description: "Pyth oracle feed id",
      default: address("11111111111111111111111111111111"),
    }),
    pythOraclePriceUpdate: addressFlag({
      description: "Pyth oracle price update account",
      default: address("11111111111111111111111111111111"),
    }),
  };
  static override description = "Create a lending vault";
  static override examples = [
    "<%= config.bin %> <%= command.id %> So11111111111111111111111111111111111111112 --interestRate=30% --supplyLimit 100000000000 --pythOracleFeedId=0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d --pythOraclePriceUpdate=7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE",
  ];

  public async run() {
    const { args, flags } = await this.parse(UpdateVault);

    const vaultAddress = (await getLendingVaultAddress(args.mint))[0];
    console.log("Fetching vault:", vaultAddress);
    const vault = await fetchMaybeVault(rpc, vaultAddress);
    if (vault.exists) {
      console.log("Vault:", vault);
      throw new Error(`The vault for mint ${args.mint} already exists`);
    } else {
      console.log("Vault not found. Creating a new one.");
    }

    const INTEREST_RATE_100_PERCENT = (1n << 60n) / 31536000n; // 100% annually

    const ixArgs: CreateVaultInstructionDataArgs = {
      interestRate: (INTEREST_RATE_100_PERCENT * BigInt(flags.interestRate)) / BigInt(HUNDRED_PERCENT),
      supplyLimit: flags.supplyLimit,
      pythOraclePriceUpdate: flags.pythOraclePriceUpdate,
      pythOracleFeedId: flags.pythOracleFeedId,
    };

    const mint = await fetchMint(rpc, args.mint);
    const instructions = await createVaultInstructions(signer, mint, ixArgs);

    console.log("");
    console.log("Sending a transaction...");
    const signature = await sendTransaction(rpc, instructions, signer);
    console.log("Transaction landed:", signature);
  }
}
