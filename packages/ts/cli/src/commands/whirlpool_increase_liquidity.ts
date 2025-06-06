import { Flags } from "@oclif/core";
import {
  DEFAULT_ADDRESS,
  increaseLiquidityInstructions,
  IncreaseLiquidityQuoteParam,
  openPositionInstructions,
} from "@orca-so/whirlpools";
import { fetchMaybeWhirlpool, fetchPosition, getPositionAddress } from "@orca-so/whirlpools-client";
import { sqrtPriceToPrice, tickIndexToPrice } from "@orca-so/whirlpools-core";
import { IInstruction } from "@solana/kit";
import { fetchMint } from "@solana-program/token-2022";

import BaseCommand, { addressArg, addressFlag, bigintFlag, priceFlag } from "../base.ts";
import { rpc, sendTransaction, signer } from "../rpc.ts";

export default class WhirlpoolIncreaseLiquidity extends BaseCommand {
  static override args = {
    whirlpool: addressArg({
      description: "Whirlpool address",
      required: true,
    }),
  };
  static override flags = {
    positionMint: addressFlag({
      description: "Position mint address. Required for an existing position.",
    }),

    lowerPrice: priceFlag({
      description: "Lower price. Only required for a new position",
    }),

    upperPrice: priceFlag({
      description: "Upper price. Only required for a new position",
    }),

    slippageToleranceBps: Flags.integer({
      description: "Slippage Tolerance Bps",
      min: 0,
      max: 65535,
    }),

    amountA: bigintFlag({
      description: "Provided amount of token A",
    }),

    amountB: bigintFlag({
      description: "Provided amount of token B",
    }),

    liquidity: bigintFlag({
      description: "Provided liquidity",
    }),
  };
  static override description =
    "Add liquidity to the position. Opens a new position if a position mint account is not provided.";
  static override examples = [
    "<%= config.bin %> <%= command.id %> POOLADDRESS --lowerPrice=5.0 --upperPrice=300.0 --amountA 1000000",
  ];

  public async run() {
    const { args, flags } = await this.parse(WhirlpoolIncreaseLiquidity);

    console.log("Fetching accounts...");

    const whirlpool = await fetchMaybeWhirlpool(rpc, args.whirlpool);
    if (!whirlpool.exists) {
      throw new Error(`Orca pool doesn't exist at address ${args.whirlpool}`);
    }

    const mintA = await fetchMint(rpc, whirlpool.data.tokenMintA);
    const mintB = await fetchMint(rpc, whirlpool.data.tokenMintB);

    console.log("Whirlpool:", whirlpool);
    for (let i = 0; i < whirlpool.data.rewardInfos.length; i++) {
      if (whirlpool.data.rewardInfos[i].mint !== DEFAULT_ADDRESS) {
        console.log("Whirlpool reward:", whirlpool.data.rewardInfos[i]);
      }
    }
    console.log(
      "Current pool price:",
      sqrtPriceToPrice(whirlpool.data.sqrtPrice, mintA.data.decimals, mintB.data.decimals),
    );
    console.log("Current tick index:", whirlpool.data.tickCurrentIndex);

    let positionMint = flags.positionMint;

    if (positionMint) {
      const positionAddress = await getPositionAddress(positionMint);
      const position = await fetchPosition(rpc, positionAddress[0]);
      console.log("");
      console.log("Position:", position);
      console.log(
        "Lower price:",
        tickIndexToPrice(position.data.tickLowerIndex, mintA.data.decimals, mintB.data.decimals),
      );
      console.log(
        "Upper price:",
        tickIndexToPrice(position.data.tickUpperIndex, mintA.data.decimals, mintB.data.decimals),
      );
    }

    if ([flags.liquidity, flags.amountA, flags.amountB].filter(v => v !== undefined).length !== 1) {
      throw new Error("Exactly one of the following parameters must be provided: liquidity, amountA, or amountB");
    }

    const increaseParam: IncreaseLiquidityQuoteParam = flags.liquidity
      ? {
          liquidity: flags.liquidity,
        }
      : flags.amountA
        ? { tokenA: flags.amountA }
        : { tokenB: flags.amountB! };

    const instructions: IInstruction[] = [];

    if (positionMint === undefined) {
      if (!flags.lowerPrice) {
        throw new Error(`lowerPrice must be specified`);
      }

      if (!flags.upperPrice) {
        throw new Error(`upperPrice must be specified`);
      }

      const openInstructions = await openPositionInstructions(
        rpc,
        whirlpool.address,
        increaseParam,
        flags.lowerPrice,
        flags.upperPrice,
        flags.slippageToleranceBps,
        signer,
      );
      instructions.push(...openInstructions.instructions);

      positionMint = openInstructions.positionMint;
      console.log("Opening a new position with mint address:", positionMint);
      console.log("Increase quote:", openInstructions.quote);
    } else {
      if (flags.lowerPrice !== undefined || flags.upperPrice !== undefined) {
        throw new Error(`lowerPrice and upperPrice can't be specified if the position mint address is set`);
      }

      console.log("Increasing liquidity of the position at address:", positionMint);

      const increaseInstructions = await increaseLiquidityInstructions(
        rpc,
        positionMint,
        increaseParam,
        flags.slippageToleranceBps,
        signer,
      );
      instructions.push(...increaseInstructions.instructions);

      console.log("Increase quote:", increaseInstructions.quote);
    }

    console.log("Sending a transaction...");
    const signature = await sendTransaction(instructions);
    console.log("Transaction landed:", signature);
  }
}
