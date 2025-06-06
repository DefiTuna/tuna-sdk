import { Args } from "@oclif/core";
import {
  fetchMaybeFeeTier,
  fetchMaybeWhirlpool,
  getFeeTierAddress,
  getInitializePoolV2Instruction,
  getTokenBadgeAddress,
  getWhirlpoolAddress,
} from "@orca-so/whirlpools-client";
import { priceToSqrtPrice, sqrtPriceToPrice } from "@orca-so/whirlpools-core";
import { generateKeyPairSigner } from "@solana/kit";
import { fetchMaybeMint } from "@solana-program/token-2022";

import BaseCommand, { addressArg, priceArg } from "../base.ts";
import { rpc, sendTransaction, signer } from "../rpc.ts";

export default class WhirlpoolCreatePool extends BaseCommand {
  static override args = {
    whirlpoolsConfig: addressArg({
      description: "Whirlpools config address",
      required: true,
    }),
    tickSpacing: Args.integer({
      description: "Tick spacing",
      required: true,
      min: 1,
      max: 32768,
    }),
    tokenMintA: addressArg({
      description: "Token A mint address",
      required: true,
    }),
    tokenMintB: addressArg({
      description: "Token B mint address",
      required: true,
    }),
    initialPrice: priceArg({
      description: "Initial price",
      required: true,
    }),
  };
  static override description = "Create an Orca pool";
  static override examples = [
    "<%= config.bin %> <%= command.id %> FcrweFY1G9HJAHG5inkGB6pKg1HZ6x9UC2WioAfWrGkR 4 So11111111111111111111111111111111111111112 BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k 50.0",
  ];

  public async run() {
    const { args } = await this.parse(WhirlpoolCreatePool);

    const whirlpoolsConfigAddress = args.whirlpoolsConfig;
    const mintAAddress = args.tokenMintA;
    const mintBAddress = args.tokenMintB;
    const tickSpacing = args.tickSpacing;

    const whirlpoolsConfig = await fetchMaybeFeeTier(rpc, whirlpoolsConfigAddress);
    if (!whirlpoolsConfig.exists) {
      throw new Error("WhirlpoolsConfig account doesn't exist");
    }

    const feeTierAddress = (await getFeeTierAddress(whirlpoolsConfigAddress, tickSpacing))[0];

    const feeTier = await fetchMaybeFeeTier(rpc, feeTierAddress);
    if (!feeTier.exists) {
      throw new Error("FeeTier account doesn't exist");
    }

    const mintA = await fetchMaybeMint(rpc, mintAAddress);
    if (!mintA.exists) {
      throw new Error("Token A mint account doesn't exist");
    }

    const mintB = await fetchMaybeMint(rpc, mintBAddress);
    if (!mintB.exists) {
      throw new Error("Token B mint account doesn't exist");
    }

    const whirlpoolAddress = (
      await getWhirlpoolAddress(whirlpoolsConfigAddress, mintA.address, mintB.address, tickSpacing)
    )[0];

    const tokenBadgeAAddress = (await getTokenBadgeAddress(whirlpoolsConfigAddress, mintA.address))[0];

    const tokenBadgeBAddress = (await getTokenBadgeAddress(whirlpoolsConfigAddress, mintB.address))[0];

    const initialSqrtPrice = priceToSqrtPrice(args.initialPrice, mintA.data.decimals, mintB.data.decimals);

    const whirlpool = await fetchMaybeWhirlpool(rpc, whirlpoolAddress);
    if (whirlpool.exists) {
      console.log("Whirlpool:", whirlpool);
      console.log(
        "Current pool price:",
        sqrtPriceToPrice(whirlpool.data.sqrtPrice, mintA.data.decimals, mintB.data.decimals),
      );
      throw new Error(`Whirlpool already exists at address ${whirlpoolAddress}`);
    }

    console.log(`Creating whirlpool with tick spacing ${tickSpacing} at address ${whirlpoolAddress}`);

    const ix = getInitializePoolV2Instruction({
      funder: signer,
      whirlpoolsConfig: whirlpoolsConfigAddress,
      feeTier: feeTierAddress,
      initialSqrtPrice,
      tokenBadgeA: tokenBadgeAAddress,
      tokenBadgeB: tokenBadgeBAddress,
      tokenMintA: mintA.address,
      tokenMintB: mintB.address,
      tokenProgramA: mintA.programAddress,
      tokenProgramB: mintB.programAddress,
      tokenVaultA: await generateKeyPairSigner(),
      tokenVaultB: await generateKeyPairSigner(),
      whirlpool: whirlpoolAddress,
      tickSpacing,
    });

    console.log("Sending a transaction...");
    const signature = await sendTransaction([ix]);
    console.log("Transaction landed:", signature);
  }
}
