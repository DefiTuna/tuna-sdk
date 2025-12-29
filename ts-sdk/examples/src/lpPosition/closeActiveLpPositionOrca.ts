import {
  CloseActiveTunaLpPositionInstructionArgs,
  closeActiveTunaLpPositionOrcaInstructions,
  fetchMarket,
  getMarketAddress,
  HUNDRED_PERCENT,
} from "@crypticdot/defituna-client";
import { DEFAULT_TRANSACTION_CONFIG, sendTransaction } from "@crypticdot/fusionamm-tx-sender";
import { Address, address, IInstruction } from "@solana/kit";

import { loadKeypair, rpc } from "../utils/common";
import { SOL_USDC_WHIRLPOOL } from "../utils/consts";

/**
 * Removes liquidity from a position in an Orca *Liquidity Pool* and closes it, managing funds via Tuna's smart contract.
 * Uses the SOL/USDC *Whirlpool* with preset withdrawal amounts and swap options for this example; these can be adjusted or passed through the function’s input.
 * Note: Combines opening and removing liquidity, though these actions can be performed separately, and liquidity can be removed multiple times
 * based on the available liquidity in the *Orca Position*.
 * @param {Address} tunaPositionMint - The {@link Address address} of the *Tuna Position Mint* identifying the position to manage.
 * @returns {Promise<void>} A promise that resolves when the transaction is confirmed.
 * @throws {Error} If the transaction fails to send or confirm.
 */
export async function closeActiveTunaLpPositionOrca(tunaPositionMint: Address): Promise<void> {
  /**
   * Defining input variables.
   */
  const whirlpoolAddress = SOL_USDC_WHIRLPOOL;
  /**
   * The total amount of slippage allowed on the {@link Whirlpool Whirlpool}'s `price` during potential inner swaps due to deposit ratio rebalancing.
   */
  const maxSwapSlippage = HUNDRED_PERCENT / 10;
  /**
   * The option for whether to swap and which *token* to swap to during *RemoveLiquidity*.
   * - 0 - No swap
   * - 1 - Swaps to *Token A*
   * - 2 - Swaps to *Token B*
   */
  const swapToToken = 1;

  //
  // Creation of instructions for removing liquidity and closing the position.
  //

  const signer = await loadKeypair();
  const market = await fetchMarket(rpc, (await getMarketAddress(whirlpoolAddress))[0]);

  const instructions: IInstruction[] = [];

  const args: CloseActiveTunaLpPositionInstructionArgs = {
    swapToToken,
    minRemovedAmountA: 0n,
    minRemovedAmountB: 0n,
    maxSwapSlippage,
  };

  instructions.push(...(await closeActiveTunaLpPositionOrcaInstructions(rpc, signer, tunaPositionMint, args)));

  /**
   * Signing and sending the transaction with all the instructions to the Solana network.
   */
  await sendTransaction(rpc, instructions, signer, DEFAULT_TRANSACTION_CONFIG, [market.data.addressLookupTable]);
}

const tunaPositionMint = process.argv[2];
if (!tunaPositionMint) {
  console.error("Please provide the address for the tunaPositionMint as an argument.");
  process.exit(1);
}

closeActiveTunaLpPositionOrca(address(tunaPositionMint)).catch(console.error);
