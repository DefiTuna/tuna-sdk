import { HUNDRED_PERCENT } from "@crypticdot/defituna-client";
import { Args, Command, Flags } from "@oclif/core";
import { Address, address, getBase58Codec, SolanaError } from "@solana/kit";

export const bigintArg = Args.custom<bigint>({
  parse: async input => BigInt(input),
});

export const bigintFlag = Flags.custom<bigint>({
  parse: async input => BigInt(input),
});

export const percentArg = Args.custom<number>({
  parse: async (input, context, opts) => {
    let parsedInput: number;
    if (input.endsWith("%")) {
      const percent = Number(input.slice(0, -1));
      parsedInput = Math.floor((HUNDRED_PERCENT * percent) / 100);
    } else {
      parsedInput = Math.floor(Number(input));
    }

    if (opts.min !== undefined && opts.min !== null && parsedInput < Number(opts.min)) {
      throw new Error(`${context.token.arg} must be greater or equal to ${opts.min}`);
    }

    if (opts.max !== undefined && opts.max !== null && parsedInput > Number(opts.max)) {
      throw new Error(`${context.token.arg} must be less or equal to ${opts.max}`);
    }

    return parsedInput;
  },
});

export const percentFlag = Flags.custom<number>({
  parse: async (input, context, opts) => {
    let parsedInput: number;
    if (input.endsWith("%")) {
      const percent = Number(input.slice(0, -1));
      parsedInput = Math.floor((HUNDRED_PERCENT * percent) / 100);
    } else {
      parsedInput = Math.floor(Number(input));
    }

    if (opts.min !== undefined && opts.min !== null && parsedInput < Number(opts.min)) {
      throw new Error(`${context.token.flag} must be greater or equal to ${opts.min}`);
    }

    if (opts.max !== undefined && opts.max !== null && parsedInput > Number(opts.max)) {
      throw new Error(`${context.token.flag} must be less or equal to ${opts.max}`);
    }

    return parsedInput;
  },
});

export const addressArg = Args.custom<Address>({
  parse: async input => {
    try {
      return address(input);
    } catch {
      throw new Error("Failed to parse the solana address");
    }
  },
});

export const addressFlag = Flags.custom<Address>({
  parse: async input => {
    try {
      return address(input);
    } catch {
      throw new Error("Failed to parse the solana address");
    }
  },
});

export const pythFeedIdFlag = Flags.custom<Address>({
  parse: async input => {
    try {
      if (input.startsWith("0x")) input = input.slice(2);
      return address(getBase58Codec().decode(Buffer.from(input, "hex")));
    } catch {
      throw new Error("Failed to parse the pyth feed id");
    }
  },
});

export const priceArg = Args.custom<number>({
  parse: async input => {
    let price = 0;
    try {
      price = Number(input);
    } catch {
      throw new Error("Failed to parse the the price");
    }
    if (price <= 0) {
      throw new Error("The price is equal or less than zero.");
    }
    return price;
  },
});

export const priceFlag = Flags.custom<number>({
  parse: async input => {
    let price = 0;
    try {
      price = Number(input);
    } catch {
      throw new Error("Failed to parse the the price");
    }
    if (price <= 0) {
      throw new Error("The price is equal or less than zero.");
    }
    return price;
  },
});

export default abstract class BaseCommand extends Command {
  async catch(err: Error & { exitCode?: number }) {
    console.log("");
    if (err.name == "SolanaError") {
      const solanaError = err as SolanaError;
      console.log(solanaError.message);
      console.log("\nError context:");
      console.log(solanaError.context);
    } else {
      console.log(err.message);
      if (err.cause) {
        console.log(err.cause);
      }
    }
  }

  percentageValueToString(value: number) {
    return value.toString() + " (" + ((value / HUNDRED_PERCENT) * 100).toString() + "%)";
  }
}
