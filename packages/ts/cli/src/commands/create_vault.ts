import BaseCommand, { addressArg, addressFlag, bigintFlag, percentFlag, pythFeedIdFlag } from "../base.ts";
import { sendTransaction, signer } from "../rpc.ts";
import { createVaultInstructions, CreateVaultInstructionDataArgs } from "@defituna/client";
import { address } from "@solana/kit";

export default class UpdateVault extends BaseCommand {
  static override args = {
    mint: addressArg({
      description: "Token mint address",
      required: true,
    }),
  };
  static override flags = {
    interestRate: percentFlag({
      description: "Annual interest rate in percents",
      default: 40,
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
    "<%= config.bin %> <%= command.id %> So11111111111111111111111111111111111111112 --interestRate=30.0 --supplyLimit 100000000000 --pythOracleFeedId=0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d --pythOraclePriceUpdate=7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE",
  ];

  public async run() {
    const { args, flags } = await this.parse(UpdateVault);

    const INTEREST_RATE_100_PERCENT = (1n << 60n) / 31536000n; // 100% annually

    const ixArgs: CreateVaultInstructionDataArgs = {
      interestRate: (INTEREST_RATE_100_PERCENT * BigInt(Math.floor(flags.interestRate * 10000))) / 1000000n,
      supplyLimit: flags.supplyLimit,
      pythOraclePriceUpdate: flags.pythOraclePriceUpdate,
      pythOracleFeedId: flags.pythOracleFeedId,
    };

    const instructions = await createVaultInstructions(signer, args.mint, ixArgs);

    console.log("");
    console.log("Sending a transaction...");
    const signature = await sendTransaction(instructions);
    console.log("Transaction landed:", signature);
  }
}
