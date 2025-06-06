import { collectAndCompoundFeesOrcaInstructions, fetchMarket, getMarketAddress } from "@crypticdot/defituna-client";
import { fetchMaybeWhirlpool } from "@orca-so/whirlpools-client";
import { Address, address } from "@solana/kit";
import { SOL_USDC_WHIRLPOOL } from "src/constants";
import { loadKeypair } from "src/utils/common";
import { createAndSendTransaction, rpc } from "src/utils/rpc";

/**
 * Collects fees from an *Orca Position* and compounds them back into the position via Tuna's smart contract.
 * Uses the SOL/USDC *Whirlpool* with preset compounding settings for this example; these can be adjusted or passed through the function’s input.
 * @param tunaPositionMint - The {@link Address address} of the *Tuna Position Mint* identifying the position from which to collect and compound fees.
 * @returns {Promise<void>} A promise that resolves when the transaction is confirmed.
 * @throws {Error} If the transaction fails to send or confirm.
 */
export async function collectAndCompoundFees(tunaPositionMint: Address): Promise<void> {
  const whirlpoolAddress = SOL_USDC_WHIRLPOOL;

  const authority = await loadKeypair();

  const whirlpool = await fetchMaybeWhirlpool(rpc, whirlpoolAddress);
  if (!whirlpool.exists) throw new Error("Whirlpool Account does not exist.");

  const marketAddress = (await getMarketAddress(whirlpoolAddress))[0];
  const market = await fetchMarket(rpc, marketAddress);

  // Wheter to maintain the *leverage multiplier* by borrowing additional *tokens* from Tuna *Lending Vaults* to match the compounded fees.
  // For example, with fees of 0.005 *Token A* and 2.5 *Token B* and a leverage of 2, an equal amount is borrowed to keep the leverage consistent.
  // `true` for opting into keeping the *leverage multiplier* the same, and `false` otherwise.
  const useLeverage = true;

  // Creation of instructions for collecting and compounding fees
  const collectAndCompoundFeesInstructions = await collectAndCompoundFeesOrcaInstructions(
    rpc,
    authority,
    tunaPositionMint,
    useLeverage,
  );

  // Signing and sending the transaction with all the instructions to the Solana network.
  await createAndSendTransaction(authority, collectAndCompoundFeesInstructions, market.data.addressLookupTable);
}

const tunaPositionMint = process.argv[2];
if (!tunaPositionMint) {
  console.error("Please provide the address for the tunaPositionMint as an argument.");
  process.exit(1);
}

collectAndCompoundFees(address(tunaPositionMint)).catch(console.error);
