import {
  fetchVault,
  getLendingVaultAddress,
  getPythPriceUpdateAccountAddress,
  HUNDRED_PERCENT,
  updateVaultInstruction,
} from "@crypticdot/defituna-client";
import { sendTransaction } from "@crypticdot/fusionamm-tx-sender";
import { getBase58Codec, ReadonlyUint8Array } from "@solana/kit";
import _ from "lodash";

import BaseCommand, { addressArg, bigintFlag, percentFlag, pythFeedIdFlag } from "../base";
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
      description: "Annual interest rate (%)",
    }),
    supplyLimit: bigintFlag({ description: "Supply limit" }),
    priceFeedId: pythFeedIdFlag({
      description: "Pyth oracle feed id",
    }),
  };
  static override description = "Update a lending vault";
  static override examples = [
    "<%= config.bin %> <%= command.id %> So11111111111111111111111111111111111111112 --interestRate=30% --supplyLimit 100000000000 --priceFeedId=0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
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

    if (flags.priceFeedId !== undefined) {
      newData.pythOracleFeedId = flags.priceFeedId;
    }

    if (flags.priceFeedId) {
      const priceFeedId = Buffer.from(this.uint8ArrayToHex(getBase58Codec().encode(flags.priceFeedId)), "hex");
      newData.pythOraclePriceUpdate = (await getPythPriceUpdateAccountAddress(0, priceFeedId))[0];
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
