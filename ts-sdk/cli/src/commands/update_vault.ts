import {
  fetchVault,
  getLendingVaultAddress,
  HUNDRED_PERCENT,
  updateVaultInstruction,
} from "@crypticdot/defituna-client";
import { sendTransaction } from "@crypticdot/fusionamm-tx-sender";
import { getBase58Codec, ReadonlyUint8Array } from "@solana/kit";
import _ from "lodash";

import BaseCommand, { addressArg, addressFlag, bigintFlag, percentFlag, pythFeedIdFlag } from "../base";
import { rpc, signer } from "../rpc";

// Some devnet Mints
// DFT5_MINT = DFT5QXLcpH3S9J2cpkaUorP7uPJCqdS5tYvyY1skq6TK

// Some mainnet mints
//export const W_SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
//export const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
//export const USDT_MINT = new PublicKey("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB");
//export const JUP_MINT = new PublicKey("JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN");
//export const JLP_MINT = new PublicKey("27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4");

export default class UpdateVault extends BaseCommand {
  static override args = {
    mint: addressArg({
      description: "Token mint address",
      required: true,
    }),
  };
  static override flags = {
    interestRate: percentFlag({
      description: "Annual interest rate (%)",
    }),
    supplyLimit: bigintFlag({ description: "Supply limit" }),
    pythOracleFeedId: pythFeedIdFlag({
      description: "Pyth oracle feed id",
    }),
    pythOraclePriceUpdate: addressFlag({
      description: "Pyth oracle price update account",
    }),
  };
  static override description = "Update a lending vault";
  static override examples = [
    "<%= config.bin %> <%= command.id %> So11111111111111111111111111111111111111112 --interestRate=30% --supplyLimit 100000000000 --pythOracleFeedId=0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d --pythOraclePriceUpdate=7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE",
  ];

  private uint8ArrayToHex(array: ReadonlyUint8Array): string {
    return Array.from(array)
      .map(byte => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  public async run() {
    const { args, flags } = await this.parse(UpdateVault);

    const INTEREST_RATE_100_PERCENT = (1n << 60n) / 31536000n; // 100% annually

    const vaultAddress = (await getLendingVaultAddress(args.mint))[0];
    console.log("Fetching vault:", vaultAddress);
    const vault = await fetchVault(rpc, vaultAddress);
    console.log("Vault:", vault);
    console.log("interestRate:", (Number(vault.data.interestRate) / Number(INTEREST_RATE_100_PERCENT)) * 100);
    console.log("pythOracleFeedId:", this.uint8ArrayToHex(getBase58Codec().encode(vault.data.pythOracleFeedId)));

    const newData = _.clone(vault.data);

    if (flags.interestRate !== undefined) {
      newData.interestRate = (INTEREST_RATE_100_PERCENT * BigInt(flags.interestRate)) / BigInt(HUNDRED_PERCENT);
    }

    if (flags.supplyLimit !== undefined) {
      newData.supplyLimit = flags.supplyLimit;
    }

    if (flags.pythOracleFeedId !== undefined) {
      newData.pythOracleFeedId = flags.pythOracleFeedId;
    }

    if (flags.pythOraclePriceUpdate !== undefined) {
      newData.pythOraclePriceUpdate = flags.pythOraclePriceUpdate;
    }

    const ix = await updateVaultInstruction(signer, args.mint, {
      interestRate: newData.interestRate,
      supplyLimit: newData.supplyLimit,
      pythOracleFeedId: newData.pythOracleFeedId,
      pythOraclePriceUpdate: newData.pythOraclePriceUpdate,
    });

    console.log("");
    if (!_.isEqual(newData, vault.data)) {
      console.log("Sending a transaction...");
      const signature = await sendTransaction(rpc, [ix], signer);
      console.log("Transaction landed:", signature);
    } else {
      console.log("Nothing to update!");
    }
  }
}
