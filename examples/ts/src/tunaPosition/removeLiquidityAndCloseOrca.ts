import {
  closePositionOrcaInstruction,
  fetchMarket,
  fetchTunaPosition,
  fetchVault,
  getLendingVaultAddress,
  getMarketAddress,
  getTunaPositionAddress,
  RemoveLiquidityOrcaInstructionArgs,
  removeLiquidityOrcaInstructions,
} from "@defituna/client";
import { fetchMaybeWhirlpool } from "@orca-so/whirlpools-client";
import { Address, address, IInstruction } from "@solana/kit";
import { fetchAllMint } from "@solana-program/token-2022";
import { SOL_USDC_WHIRLPOOL } from "src/constants";
import { loadKeypair } from "src/utils/common";
import { createAndSendTransaction, rpc } from "src/utils/rpc";

/**
 * Removes liquidity from a position in an Orca *Liquidity Pool* and closes it, managing funds via Tuna's smart contract.
 * Uses the SOL/USDC *Whirlpool* with preset withdrawal amounts and swap options for this example; these can be adjusted or passed through the function’s input.
 * Note: Combines opening and removing liquidity, though these actions can be performed separately, and liquidity can be removed multiple times
 * based on the available liquidity in the *Orca Position*.
 * @param {Address} tunaPositionMint - The {@link Address address} of the *Tuna Position Mint* identifying the position to manage.
 * @returns {Promise<void>} A promise that resolves when the transaction is confirmed.
 * @throws {Error} If the transaction fails to send or confirm.
 */
export async function removeLiquidityAndClose(tunaPositionMint: Address): Promise<void> {
  /**
   * Defining input variables.
   */
  const whirlpoolAddress = SOL_USDC_WHIRLPOOL;
  /**
   * Minimum removed amounts for Tokens A and B to be respected by the *RemoveLiquidity* instruction, acting as slippage limits.
   */
  const minRemovedAmount = { a: 0n, b: 0n };
  /**
   * The total amount of slippage allowed on the {@link Whirlpool Whirlpool}'s `price` during potential inner swaps due to deposit ratio rebalancing.
   */
  const maxSwapSlippage = 0;
  /**
   * The option for whether to swap and which *token* to swap to during *RemoveLiquidity*.
   * - 0 - No swap
   * - 1 - Swaps to *Token A*
   * - 2 - Swaps to *Token B*
   */
  const swapToToken = 1;
  /**
   * The percentage of *liquidity* in the *Orca Position* to remove via the *RemoveLiquidity* instruction.
   * Ranges from 0 (0%) to 1000000 (100%), where each increment of 1 equals 0.0001% (e.g., 250000 = 25%, 5000 = 0.5%, 100000 = 10%).
   * For this example since closing the Position after, set to 1000000 (100%) to remove all *liquidity*.
   */
  const withdrawPercent = 1000000;

  /**
   * Creation of instructions for removing liquidity and closing positions.
   */

  const authority = await loadKeypair();

  const whirlpool = await fetchMaybeWhirlpool(rpc, whirlpoolAddress);
  if (!whirlpool.exists) throw new Error("Whirlpool Account does not exist.");

  const marketAddress = (await getMarketAddress(whirlpoolAddress))[0];
  const tunaPositionAddress = (await getTunaPositionAddress(tunaPositionMint))[0];
  const lendingVaultAAddress = (await getLendingVaultAddress(whirlpool.data.tokenMintA))[0];
  const lendingVaultBAddress = (await getLendingVaultAddress(whirlpool.data.tokenMintB))[0];

  const [mintA, mintB] = await fetchAllMint(rpc, [whirlpool.data.tokenMintA, whirlpool.data.tokenMintB]);
  const tunaPosition = await fetchTunaPosition(rpc, tunaPositionAddress);
  const vaultA = await fetchVault(rpc, lendingVaultAAddress);
  const vaultB = await fetchVault(rpc, lendingVaultBAddress);
  const market = await fetchMarket(rpc, marketAddress);

  const instructions: IInstruction[] = [];

  const args: RemoveLiquidityOrcaInstructionArgs = {
    withdrawPercent,
    swapToToken,
    minRemovedAmountA: minRemovedAmount.a,
    minRemovedAmountB: minRemovedAmount.b,
    maxSwapSlippage,
  };

  instructions.push(
    ...(await removeLiquidityOrcaInstructions(rpc, authority, tunaPosition, vaultA, vaultB, whirlpool, args)),
  );

  instructions.push(await closePositionOrcaInstruction(authority, tunaPosition, mintA, mintB));

  /**
   * Signing and sending the transaction with all the instructions to the Solana network.
   */
  await createAndSendTransaction(authority, instructions, market.data.addressLookupTable);
}

const tunaPositionMint = process.argv[2];
if (!tunaPositionMint) {
  console.error("Please provide the address for the tunaPositionMint as an argument.");
  process.exit(1);
}

removeLiquidityAndClose(address(tunaPositionMint)).catch(console.error);
