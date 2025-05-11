import { collectFeesOrcaInstructions, fetchTunaPosition, getTunaPositionAddress } from "@defituna/client";
import { fetchMaybeWhirlpool } from "@orca-so/whirlpools-client";
import { Address, address } from "@solana/kit";
import { fetchAllMint } from "@solana-program/token-2022";
import { SOL_USDC_WHIRLPOOL } from "src/constants";
import { loadKeypair } from "src/utils/common";
import { createAndSendTransaction, rpc } from "src/utils/rpc";

/**
 * Collects fees from an *Orca Position*, managed via Orca's Whirlpools smart contract.
 * Uses the SOL/USDC *Whirlpool* for this example; this can be adjusted or passed through the function’s input.
 * @param tunaPositionMint - The {@link Address address} of the *Tuna Position Mint* identifying the position from which to collect fees.
 * @returns {Promise<void>} A promise that resolves when the transaction is confirmed.
 * @throws {Error} If the transaction fails to send or confirm.
 */
export async function collectFees(tunaPositionMint: Address): Promise<void> {
  const whirlpoolAddress = SOL_USDC_WHIRLPOOL;

  const authority = await loadKeypair();

  const whirlpool = await fetchMaybeWhirlpool(rpc, whirlpoolAddress);
  if (!whirlpool.exists) throw new Error("Whirlpool Account does not exist.");

  const [mintA, mintB] = await fetchAllMint(rpc, [whirlpool.data.tokenMintA, whirlpool.data.tokenMintB]);

  const tunaPositionAddress = (await getTunaPositionAddress(tunaPositionMint))[0];
  const tunaPosition = await fetchTunaPosition(rpc, tunaPositionAddress);

  // Creation of instructions for collecting fees.
  const collectFeesInstructions = await collectFeesOrcaInstructions(authority, tunaPosition, mintA, mintB, whirlpool);

  // Signing and sending the transaction with all the instructions to the Solana network.
  await createAndSendTransaction(authority, collectFeesInstructions);
}

const tunaPositionMint = process.argv[2];
if (!tunaPositionMint) {
  console.error("Please provide the address for the tunaPositionMint as an argument.");
  process.exit(1);
}

collectFees(address(tunaPositionMint)).catch(console.error);
