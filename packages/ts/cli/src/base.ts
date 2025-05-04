import { Args, Command, Flags } from "@oclif/core";
import { address, Address, getBase58Codec, SolanaError } from "@solana/kit";

export const bigintArg = Args.custom<bigint>({
  parse: async (input) => BigInt(input),
});

export const bigintFlag = Flags.custom<bigint>({
  parse: async (input) => BigInt(input),
});

export const percentArg = Args.custom<number>({
  parse: async (input) => {
    const percent = Number(input);
    if (percent > 100) throw "Percent value must be less or equal than 100";
    if (percent < 0) throw "Percent value can't be negative";
    return percent;
  },
});

export const percentFlag = Flags.custom<number>({
  parse: async (input) => {
    const percent = Number(input);
    if (percent > 100) throw "Percent value must be less or equal than 100";
    if (percent < 0) throw "Percent value can't be negative";
    return percent;
  },
});

export const addressArg = Args.custom<Address>({
  parse: async (input) => {
    try {
      return address(input);
    } catch {
      throw new Error("Failed to parse the solana address");
    }
  },
});

export const addressFlag = Flags.custom<Address>({
  parse: async (input) => {
    try {
      return address(input);
    } catch {
      throw new Error("Failed to parse the solana address");
    }
  },
});

export const pythFeedIdFlag = Flags.custom<Address>({
  parse: async (input) => {
    try {
      if (input.startsWith("0x")) input = input.slice(2);
      return address(getBase58Codec().decode(Buffer.from(input, "hex")));
    } catch {
      throw new Error("Failed to parse the pyth feed id");
    }
  },
});

export const priceArg = Args.custom<number>({
  parse: async (input) => {
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
  parse: async (input) => {
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
    }
  }
}
