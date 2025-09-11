import { collectFeesOrcaInstructions } from "@crypticdot/defituna-client";
import { sendTransaction } from "@crypticdot/fusionamm-tx-sender";
import { fetchMaybeWhirlpool } from "@orca-so/whirlpools-client";
import { Address, address } from "@solana/kit";

import { loadKeypair, rpc } from "../utils/common";
import { SOL_USDC_WHIRLPOOL } from "../utils/consts";

/**
 * Collects fees from an *Orca Position*, managed via Orca's Whirlpools smart contract.
 * Uses the SOL/USDC *Whirlpool* for this example; this can be adjusted or passed through the function’s input.
 * @param tunaPositionMint - The {@link Address address} of the *Tuna Position Mint* identifying the position from which to collect fees.
 * @returns {Promise<void>} A promise that resolves when the transaction is confirmed.
 * @throws {Error} If the transaction fails to send or confirm.
 */
export async function collectFees(tunaPositionMint: Address): Promise<void> {
  const whirlpoolAddress = SOL_USDC_WHIRLPOOL;

  const signer = await loadKeypair();

  const whirlpool = await fetchMaybeWhirlpool(rpc, whirlpoolAddress);
  if (!whirlpool.exists) throw new Error("Whirlpool Account does not exist.");

  // Creation of instructions for collecting fees.
  const instructions = await collectFeesOrcaInstructions(rpc, signer, tunaPositionMint);

  // Signing and sending the transaction with all the instructions to the Solana network.
  await sendTransaction(rpc, instructions, signer);
}

const tunaPositionMint = process.argv[2];
if (!tunaPositionMint) {
  console.error("Please provide the address for the tunaPositionMint as an argument.");
  process.exit(1);
}

collectFees(address(tunaPositionMint)).catch(console.error);
