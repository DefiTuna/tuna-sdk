import {
  CreateVaultInstructionDataArgs,
  createVaultInstructions,
  CreateVaultV2InstructionDataArgs,
  createVaultV2Instructions,
  fetchMaybeVault,
  getLendingVaultAddress,
  getLendingVaultV2Address,
  getPythPriceUpdateAccountAddress,
  HUNDRED_PERCENT,
} from "@crypticdot/defituna-client";
import { sendTransaction } from "@crypticdot/fusionamm-tx-sender";
import { Flags } from "@oclif/core";
import { Address, address, getBase58Codec, IInstruction, ReadonlyUint8Array } from "@solana/kit";
import { fetchMint } from "@solana-program/token-2022";

import BaseCommand, { addressArg, bigintFlag, percentFlag, pythFeedIdFlag } from "../base";
import { rpc, signer } from "../rpc";

export default class CreateVault extends BaseCommand {
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
    priceFeedId: pythFeedIdFlag({
      description: "Pyth oracle price feed id",
      default: address("11111111111111111111111111111111"),
    }),
    allowUnsafeTokenExtensions: Flags.boolean({
      description: "Allow unsafe token extensions",
    }),
    id: Flags.integer({
      description: "Isolated vault id. Must be greater than 0 if set.",
    }),
  };
  static override description = "Create a lending vault";
  static override examples = [
    "<%= config.bin %> <%= command.id %> So11111111111111111111111111111111111111112 --interestRate=30% --supplyLimit 100000000000 --priceFeedId=0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  ];

  private uint8ArrayToHex(array: ReadonlyUint8Array): string {
    return Array.from(array)
      .map(byte => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  public async run() {
    const { args, flags } = await this.parse(CreateVault);

    const vaultAddress = (await getLendingVaultAddress(args.mint))[0];
    console.log("Fetching vault:", vaultAddress);
    const vault = await fetchMaybeVault(rpc, vaultAddress);
    if (vault.exists) {
      console.log("Vault:", vault);
      throw new Error(`The vault for mint ${args.mint} already exists`);
    } else {
      console.log("Vault not found. Creating a new one.");
    }

    let pythOraclePriceUpdateAddress: Address = address("11111111111111111111111111111111");
    if (flags.priceFeedId) {
      const priceFeedId = Buffer.from(this.uint8ArrayToHex(getBase58Codec().encode(flags.priceFeedId)), "hex");
      pythOraclePriceUpdateAddress = (await getPythPriceUpdateAccountAddress(0, priceFeedId))[0];
      console.log("Pyth price update account:", pythOraclePriceUpdateAddress);
    }

    const INTEREST_RATE_100_PERCENT = (1n << 60n) / 31536000n; // 100% annually

    const mint = await fetchMint(rpc, args.mint);

    let instructions: IInstruction[];
    if (flags.id) {
      const ixArgs: CreateVaultV2InstructionDataArgs = {
        interestRate: (INTEREST_RATE_100_PERCENT * BigInt(flags.interestRate)) / BigInt(HUNDRED_PERCENT),
        supplyLimit: flags.supplyLimit,
        pythOraclePriceUpdate: pythOraclePriceUpdateAddress,
        pythOracleFeedId: flags.priceFeedId,
        allowUnsafeTokenExtensions: flags.allowUnsafeTokenExtensions,
        id: flags.id,
      };

      const vaultAddress = (await getLendingVaultV2Address(mint.address, flags.id))[0];
      instructions = await createVaultV2Instructions(signer, vaultAddress, mint, ixArgs);
    } else {
      const ixArgs: CreateVaultInstructionDataArgs = {
        interestRate: (INTEREST_RATE_100_PERCENT * BigInt(flags.interestRate)) / BigInt(HUNDRED_PERCENT),
        supplyLimit: flags.supplyLimit,
        pythOraclePriceUpdate: pythOraclePriceUpdateAddress,
        pythOracleFeedId: flags.priceFeedId,
        allowUnsafeTokenExtensions: flags.allowUnsafeTokenExtensions,
      };

      instructions = await createVaultInstructions(signer, mint, ixArgs);
    }

    console.log("");
    console.log("Sending a transaction...");
    const signature = await sendTransaction(rpc, instructions, signer);
    console.log("Transaction landed:", signature);
  }
}
