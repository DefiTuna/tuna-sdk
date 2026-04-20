// Jupiter instruction discriminators
import {
  createJupiterApiClient,
  Instruction,
  QuoteResponse,
  SwapInstructionsPostRequest,
  SwapInstructionsResponse,
} from "@jup-ag/api";
import { Account, AccountRole, Address, IAccountMeta, ReadonlyUint8Array } from "@solana/kit";
import { findAssociatedTokenPda, Mint } from "@solana-program/token-2022";

//const JUPITER_CREATE_TOKEN_ACCOUNT_DISCRIMINATOR = new Uint8Array([147, 241, 123, 100, 244, 132, 174, 118]);
const JUPITER_ROUTE_DISCRIMINATOR = new Uint8Array([229, 23, 203, 151, 122, 227, 173, 42]);
const JUPITER_ROUTE_V2_DISCRIMINATOR = new Uint8Array([187, 100, 250, 204, 49, 196, 175, 20]);
//const JUPITER_ROUTE_WITH_TOKEN_LEDGER_DISCRIMINATOR = new Uint8Array([150, 86, 71, 116, 167, 93, 14, 104]);
const JUPITER_EXACT_OUT_ROUTE_DISCRIMINATOR = new Uint8Array([208, 51, 239, 151, 123, 43, 237, 92]);
const JUPITER_EXACT_OUT_ROUTE_V2_DISCRIMINATOR = new Uint8Array([157, 138, 184, 82, 21, 244, 243, 36]);
const JUPITER_SHARED_ACCOUNTS_ROUTE_DISCRIMINATOR = new Uint8Array([193, 32, 155, 51, 65, 214, 156, 129]);
const JUPITER_SHARED_ACCOUNTS_ROUTE_V2_DISCRIMINATOR = new Uint8Array([209, 152, 83, 147, 124, 254, 216, 233]);
//const JUPITER_SHARED_ACCOUNTS_ROUTE_WITH_TOKEN_LEDGER_DISCRIMINATOR = new Uint8Array([
//  230, 121, 143, 80, 119, 159, 106, 170,
//]);
const JUPITER_SHARED_ACCOUNTS_EXACT_OUT_ROUTE_DISCRIMINATOR = new Uint8Array([176, 209, 105, 168, 154, 125, 69, 62]);
const JUPITER_SHARED_ACCOUNTS_EXACT_OUT_ROUTE_V2_DISCRIMINATOR = new Uint8Array([53, 96, 229, 202, 216, 187, 250, 24]);

/*
function isJupiterCreateTokenAccountInstruction(ix: Instruction): boolean {
  if (!ix.data || ix.data.length < 8) {
    return false;
  }

  return ix.data.slice(0, 8) == JUPITER_CREATE_TOKEN_ACCOUNT_DISCRIMINATOR;
}
*/

function getUserSourceTokenAccountAddress(ix: Instruction): String | null {
  const data = ix.data ? Uint8Array.from(Buffer.from(ix.data, "base64")) : undefined;

  if (!data || data.length < 8 || !ix.accounts) {
    return null;
  }

  const ix_discriminator = data.slice(0, 8);

  if (
    ix_discriminator == JUPITER_ROUTE_V2_DISCRIMINATOR ||
    ix_discriminator == JUPITER_EXACT_OUT_ROUTE_V2_DISCRIMINATOR
  ) {
    return ix.accounts.length > 1 ? ix.accounts[1].pubkey : null;
  } else if (
    ix_discriminator == JUPITER_ROUTE_DISCRIMINATOR ||
    ix_discriminator == JUPITER_EXACT_OUT_ROUTE_DISCRIMINATOR ||
    ix_discriminator == JUPITER_SHARED_ACCOUNTS_ROUTE_V2_DISCRIMINATOR ||
    ix_discriminator == JUPITER_SHARED_ACCOUNTS_EXACT_OUT_ROUTE_V2_DISCRIMINATOR
  ) {
    return ix.accounts.length > 2 ? ix.accounts[2].pubkey : null;
  } else if (
    ix_discriminator == JUPITER_SHARED_ACCOUNTS_ROUTE_DISCRIMINATOR ||
    ix_discriminator == JUPITER_SHARED_ACCOUNTS_EXACT_OUT_ROUTE_DISCRIMINATOR
  ) {
    return ix.accounts.length > 3 ? ix.accounts[3].pubkey : null;
  } else {
    return null;
  }
}

function getUserDestinationTokenAccountAddress(ix: Instruction): String | null {
  const data = ix.data ? Uint8Array.from(Buffer.from(ix.data, "base64")) : undefined;

  if (!data || data.length < 8 || !ix.accounts) {
    return null;
  }

  const ix_discriminator = data.slice(0, 8);

  if (
    ix_discriminator == JUPITER_ROUTE_V2_DISCRIMINATOR ||
    ix_discriminator == JUPITER_EXACT_OUT_ROUTE_V2_DISCRIMINATOR
  ) {
    return ix.accounts.length > 2 ? ix.accounts[2].pubkey : null;
  } else if (
    ix_discriminator == JUPITER_ROUTE_DISCRIMINATOR ||
    ix_discriminator == JUPITER_EXACT_OUT_ROUTE_DISCRIMINATOR
  ) {
    return ix.accounts.length > 3 ? ix.accounts[3].pubkey : null;
  } else {
    return null;
  }
}

async function updateJupiterRouteAccountsAndInstructions(
  response: SwapInstructionsResponse,
  tunaPositionAddress: Address,
  inputMint: Account<Mint>,
  outputMint: Account<Mint>,
) {
  // The source and destination token accounts are not ATAs in the route returned by Jupiter. We have to replace them with the ATAs of the tuna position.
  const userSourceTokenAccount = getUserSourceTokenAccountAddress(response.swapInstruction);
  const userDestinationTokenAccount = getUserDestinationTokenAccountAddress(response.swapInstruction);

  const tunaPositionSourceTokenAccount = (
    await findAssociatedTokenPda({
      owner: tunaPositionAddress,
      mint: inputMint.address,
      tokenProgram: inputMint.programAddress,
    })
  )[0];

  const tunaPositionDestinationTokenAccount = (
    await findAssociatedTokenPda({
      owner: tunaPositionAddress,
      mint: outputMint.address,
      tokenProgram: outputMint.programAddress,
    })
  )[0];

  for (const account of response.swapInstruction.accounts) {
    if (userSourceTokenAccount) {
      if (account.pubkey == userSourceTokenAccount) {
        account.pubkey = tunaPositionSourceTokenAccount;
      }
    }

    if (userDestinationTokenAccount) {
      if (account.pubkey == userDestinationTokenAccount) {
        account.pubkey = tunaPositionDestinationTokenAccount;
      }
    }

    // Also remove all signers
    account.isSigner = false;
  }
}

export type JupiterSwapQuoteRequest = {
  tunaPositionAddress: Address;
  inputMint: Account<Mint>;
  outputMint: Account<Mint>;
  inputAmount: number;
  slippageBps?: number;
};

export type JupiterSwapQuoteResponse = {
  swapInstructionAccounts: IAccountMeta[];
  swapInstructionData: ReadonlyUint8Array;
  addressLookupTableAddresses: Address[];
  priceImpactPct: string;
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  /// Calculated minimum output amount after accounting for `slippageBps` on the `outAmount` value
  otherAmountThreshold: string;
};

export async function jupiterSwapQuote(args: JupiterSwapQuoteRequest): Promise<JupiterSwapQuoteResponse> {
  const quote = await jupiterSwapQuoteInternal(args);
  return await jupiterSwapInstructionsInternal(args, quote);
}

export type JupiterSwapQuoteByOutputAmountRequest = {
  tunaPositionAddress: Address;
  inputMint: Account<Mint>;
  outputMint: Account<Mint>;
  estimatedInputAmount: number;
  minOutputAmount: number;
  slippageBps?: number;
  toleranceBps?: number;
};

export async function jupiterSwapQuoteByOutputAmount(
  args: JupiterSwapQuoteByOutputAmountRequest,
): Promise<JupiterSwapQuoteResponse> {
  const quoteArgs: JupiterSwapQuoteRequest = {
    inputAmount: args.estimatedInputAmount,
    inputMint: args.inputMint,
    outputMint: args.outputMint,
    slippageBps: args.slippageBps,
    tunaPositionAddress: args.tunaPositionAddress,
  };

  const { minOutputAmount } = args;
  let { toleranceBps } = args;

  if (toleranceBps == undefined) {
    toleranceBps = 50; // 0.5%
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const quote = await jupiterSwapQuoteInternal(quoteArgs);
    const outAmount = Number(quote.outAmount);

    const deltaAmount = Math.abs(outAmount - minOutputAmount);
    const deltaBps = (deltaAmount * 10000) / minOutputAmount;

    if (outAmount >= minOutputAmount) {
      if (deltaBps < toleranceBps) {
        return await jupiterSwapInstructionsInternal(quoteArgs, quote);
      } else {
        quoteArgs.inputAmount -= Math.max(1, Math.ceil(quoteArgs.inputAmount * (deltaAmount / outAmount)));
      }
    } else {
      quoteArgs.inputAmount += Math.max(1, Math.ceil(quoteArgs.inputAmount * (deltaAmount / outAmount)));
    }
  }
}

async function jupiterSwapQuoteInternal(args: JupiterSwapQuoteRequest): Promise<QuoteResponse> {
  const jupiterQuoteApi = createJupiterApiClient();

  return await jupiterQuoteApi.quoteGet({
    inputMint: args.inputMint.address,
    outputMint: args.outputMint.address,
    amount: args.inputAmount,
    instructionVersion: "V2",
    //dexes: ["DefiTuna"],
    excludeDexes: ["Pump.fun Amm", "Pump.fun"],
    maxAccounts: 45,
    slippageBps: args.slippageBps,
  });
}

async function jupiterSwapInstructionsInternal(
  args: JupiterSwapQuoteRequest,
  quote: QuoteResponse,
): Promise<JupiterSwapQuoteResponse> {
  const tunaPositionDestinationAta = (
    await findAssociatedTokenPda({
      owner: args.tunaPositionAddress,
      mint: args.outputMint.address,
      tokenProgram: args.outputMint.programAddress,
    })
  )[0];

  const swapInstructionsRequest: SwapInstructionsPostRequest = {
    swapRequest: {
      userPublicKey: args.tunaPositionAddress,
      destinationTokenAccount: tunaPositionDestinationAta,
      quoteResponse: quote,
      useSharedAccounts: true,
    },
  };

  const jupiterQuoteApi = createJupiterApiClient();
  const swapInstructionsResponse = await jupiterQuoteApi.swapInstructionsPost(swapInstructionsRequest);

  await updateJupiterRouteAccountsAndInstructions(
    swapInstructionsResponse,
    args.tunaPositionAddress,
    args.inputMint,
    args.outputMint,
  );

  const swapInstructionAccounts = swapInstructionsResponse.swapInstruction.accounts.map(a => ({
    address: a.pubkey as Address,
    role: a.isWritable ? AccountRole.WRITABLE : AccountRole.READONLY,
  }));

  const swapInstructionData = Uint8Array.from(Buffer.from(swapInstructionsResponse.swapInstruction.data, "base64"));

  const addressLookupTableAddresses = swapInstructionsResponse.addressLookupTableAddresses.map(a => a as Address);

  return {
    inputMint: quote.inputMint,
    outputMint: quote.outputMint,
    inAmount: quote.inAmount,
    outAmount: quote.outAmount,
    otherAmountThreshold: quote.otherAmountThreshold,
    priceImpactPct: quote.priceImpactPct,
    addressLookupTableAddresses,
    swapInstructionAccounts,
    swapInstructionData,
  };
}
