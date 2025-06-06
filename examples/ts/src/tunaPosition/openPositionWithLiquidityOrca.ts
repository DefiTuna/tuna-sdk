import {
  fetchMarket,
  getMarketAddress,
  NO_TAKE_PROFIT,
  OpenPositionWithLiquidityOrcaInstructionArgs,
  openPositionWithLiquidityOrcaInstructions,
  TUNA_POSITION_FLAGS_STOP_LOSS_SWAP_TO_TOKEN_B,
} from "@crypticdot/defituna-client";
import { fetchMaybeWhirlpool } from "@orca-so/whirlpools-client";
import { sqrtPriceToPrice } from "@orca-so/whirlpools-core";
import { generateKeyPairSigner } from "@solana/kit";
import { fetchAllMint } from "@solana-program/token-2022";
import { SOL_USDC_WHIRLPOOL } from "src/constants";
import { loadKeypair } from "src/utils/common";
import { createAndSendTransaction, rpc } from "src/utils/rpc";

/**
 * Opens a position in an Orca *Liquidity Pool* and adds liquidity using borrowed funds from Tuna *Lending Pools*.
 * Uses the SOL/USDC *Whirlpool* with preset amounts and leverage for this example; these can be adjusted or passed through the function’s input.
 * Note: Combines opening and adding liquidity, though these actions can be performed separately and liquidity can be added multiple times later.
 * @returns {Promise<void>} A promise that resolves when the transaction is confirmed.
 * @throws {Error} If the transaction fails to send or confirm.
 */
export async function openPositionWithLiquidityOrca(): Promise<void> {
  const whirlpoolAddress = SOL_USDC_WHIRLPOOL;

  const authority = await loadKeypair();

  const whirlpool = await fetchMaybeWhirlpool(rpc, whirlpoolAddress);
  if (!whirlpool.exists) throw new Error("Whirlpool Account does not exist.");

  const [mintA, mintB] = await fetchAllMint(rpc, [whirlpool.data.tokenMintA, whirlpool.data.tokenMintB]);

  const market = await fetchMarket(rpc, (await getMarketAddress(whirlpoolAddress))[0]);

  /** Defining variables required to open an Orca *Position* and add liquidity with borrowed funds from Tuna's *Lending Pools*. */
  /**
   * The nominal amounts of *Token A* (SOL in this example) and *Token B* (USDC in this example) to deposit for liquidity,
   * as a flat value (e.g., 1 SOL) excluding decimals.
   */
  const nominalCollateral = { a: 0.01, b: 0.1 };
  /**
   * Multiplier for borrowed funds applied to the total provided amount (min 1, max 5; e.g., 2 doubles the borrowed amount).
   */
  const leverage = 2;
  /**
   * Ratio for borrowing funds, freely chosen by the user, unbound by the *position*’s liquidity range.
   */
  const borrowRatio = { a: 0.6, b: 0.4 };

  /**
   * A newly generated {@link KeyPairSigner Keypair} for the new *Position Mint*, which will be
   * created with the position and it's used to identify it.
   */
  const newPositionMintKeypair = await generateKeyPairSigner();

  /**
   * Deriving collateral and borrow amounts for adding liquidity
   */
  /**
   * Fetches token decimals for Tokens A and B, using {@link https://github.com/orca-so/whirlpools/tree/main/ts-sdk/client Orca's Whirlpool Client}.
   */
  const decimals = {
    a: mintA.data.decimals,
    b: mintB.data.decimals,
  };
  /**
   * The decimal scale to adjust nominal amounts for Tokens A and B based on their decimals.
   */
  const decimalsScale = {
    a: Math.pow(10, decimals.a),
    b: Math.pow(10, decimals.b),
  };
  /**
   * The collateral amounts of tokens A and B (adjusted for decimals) provided by the user to use for increasing liquidity.
   */
  const collateral = {
    a: Math.floor(nominalCollateral.a * decimalsScale.a),
    b: Math.floor(nominalCollateral.b * decimalsScale.b),
  };

  /**
   * The current *Whirlpool* price, derived from the sqrtPrice using {@link https://github.com/orca-so/whirlpools/tree/main/ts-sdk/client Orca's Whirlpool Client}.
   */
  const currentPrice = sqrtPriceToPrice(whirlpool.data.sqrtPrice, decimals.a, decimals.b);
  /**
   * The total nominal collateral amount (excluding decimals) represented in *Token B* units.
   */
  const totalNominalCollateralAmount = nominalCollateral.a * currentPrice + nominalCollateral.b;
  /**
   * Safety checks
   */
  if (borrowRatio.a < 0 || borrowRatio.b < 0) throw new Error("Borrow ratios must be greater than or equal to 0");
  if (borrowRatio.a + borrowRatio.b !== 1) throw new Error("Borrow ratios must be balanced (sum equal to 1)");
  if (leverage < 1) throw new Error("Leverage must be greater than or equal to 1");

  /**
   * The nominal amounts of Tokens A and B to borrow from Tuna's *Lending Pools*,
   * as a flat value (e.g., 1 SOL) excluding decimals.
   */
  const nominalBorrow = {
    a: (totalNominalCollateralAmount * (leverage - 1) * borrowRatio.a) / currentPrice,
    b: totalNominalCollateralAmount * (leverage - 1) * borrowRatio.b,
  };
  /**
   * The amounts of tokens A and B (adjusted for decimals) borrowed from Tuna's *Lending Pools* to use for increasing liquidity.
   */
  const borrow = {
    a: Math.floor(nominalBorrow.a * decimalsScale.a),
    b: Math.floor(nominalBorrow.b * decimalsScale.b),
  };
  /**
   * Defining input variables for account configuration.
   */
  /**
   * The lower {@link _Tick Tick} index for the {@link _OrcaPosition Orca Position}’s range, identifying the lowest Tick at which the Position is active in the {@link Whirlpool Whirlpool}.
   * Note: Must be divisible by the {@link Whirlpool Whirlpool}'s `tickSpacing`.
   */
  const tickLowerIndex = -22784;
  /**
   * The upper {@link _Tick Tick} index for the {@link _OrcaPosition Orca Position}'s range, identifying the highest Tick at which the Position is active in the {@link Whirlpool Whirlpool}.
   * Note: Must be divisible by the {@link Whirlpool Whirlpool}'s `tickSpacing`.
   */
  const tickUpperIndex = 21504;

  /**
   * The {@link _Tick Tick} index for an optional *Stop-Loss* limit order below the {@link _OrcaPosition Orca Position}’s range in the {@link Whirlpool Whirlpool}.
   * Use {@link _NO_STOP_LOSS NO_STOP_LOSS} (lowest viable index) to disable *Stop-Loss*.
   * Note: Must be divisible by the {@link Whirlpool Whirlpool}'s `tickSpacing`.
   */
  const tickStopLossIndex = -22784;
  /**
   * The {@link _Tick Tick} index for an optional *Take-Profit* limit order above the {@link _OrcaPosition Orca Position}’s range in the {@link Whirlpool Whirlpool}.
   * Use {@link NO_TAKE_PROFIT NO_TAKE_PROFIT} (highest viable index) to disable *Take-Profit*.
   * Note: Must be divisible by the {@link Whirlpool Whirlpool}'s `tickSpacing`.
   */
  const tickTakeProfitIndex = NO_TAKE_PROFIT;

  /**
   * Minimum added amounts for Tokens A and B to be respected by the *AddLiquidity* instruction, acting as slippage limits.
   */
  const minAddedAmount = { a: 0n, b: 0n };
  /**
   * The total amount of slippage allowed on the {@link Whirlpool Whirlpool}'s `price`, in case of inner swaps due to rebalancing of deposit ratio.
   */
  const maxSwapSlippage = 0;

  /**
   * The {@link _TunaPosition Tuna Position} option controlling token swaps on stop-loss, represented in bits 0-1.
   * - `00` (0) - No swap
   * - `01` (1) - Swaps to *Token A* (use {@link _TUNA_POSITION_FLAGS_STOP_LOSS_SWAP_TO_TOKEN_A TUNA_POSITION_FLAGS_STOP_LOSS_SWAP_TO_TOKEN_A})
   * - `10` (2) - Swaps to *Token B* (use {@link TUNA_POSITION_FLAGS_STOP_LOSS_SWAP_TO_TOKEN_B TUNA_POSITION_FLAGS_STOP_LOSS_SWAP_TO_TOKEN_B})
   */
  const stopLossSwapToToken = TUNA_POSITION_FLAGS_STOP_LOSS_SWAP_TO_TOKEN_B;
  /**
   * The {@link _TunaPosition Tuna Position} option controlling token swaps on take-profit, represented in bits 2-3.
   * - `00` (0) - No swap
   * - `01` (4) - Swaps to *Token A* (use {@link _TUNA_POSITION_FLAGS_TAKE_PROFIT_SWAP_TO_TOKEN_A TUNA_POSITION_FLAGS_TAKE_PROFIT_SWAP_TO_TOKEN_A})
   * - `10` (8) - Swaps to *Token B* (use {@link _TUNA_POSITION_FLAGS_TAKE_PROFIT_SWAP_TO_TOKEN_B TUNA_POSITION_FLAGS_TAKE_PROFIT_SWAP_TO_TOKEN_B})
   */
  const takeProfitSwapToToken = 0;
  /**
   * The {@link _TunaPosition Tuna Position} option controlling auto-compounding behavior, represented in bits 4-5.
   * - `00` (0) - No auto compounding
   * - `01` (16) - Auto-compounds yield (use {@link _TUNA_POSITION_FLAGS_AUTO_COMPOUND_YIELD TUNA_POSITION_FLAGS_AUTO_COMPOUND_YIELD})
   * - `10` (32) - Auto-compounds yield with leverage (use {@link _TUNA_POSITION_FLAGS_AUTO_COMPOUND_YIELD_WITH_LEVERAGE TUNA_POSITION_FLAGS_AUTO_COMPOUND_YIELD_WITH_LEVERAGE})
   */
  const autoCompoundYield = 0;

  /**
   * The 6-bit mapping of the {@link _TunaPosition Tuna Position} options, combining stop-loss swap, take-profit swap, and auto-compounding settings.
   * In this, selecting only "Swaps to Token B on Stop-Loss" results in 0b000010 (decimal 2).
   * For no options selected, set each to `0` or use `flags = 0`.
   * Bit positions (each field supports one value: `00`, `01`, or `10`):
   * Bits 0..1: Stop-loss swap (e.g., 0, 1, 2)
   * Bits 2..3: Take-profit swap (e.g., 0, 4, 8)
   * Bits 4..5: Auto-compounding (e.g., 0, 16, 32)
   * Computed by bitwise OR-ing the options: `stopLossSwapToToken | takeProfitSwapToToken | autoCompoundYield`.
   */
  const flags = stopLossSwapToToken | takeProfitSwapToToken | autoCompoundYield;

  const args: OpenPositionWithLiquidityOrcaInstructionArgs = {
    tickLowerIndex,
    tickUpperIndex,
    tickStopLossIndex,
    tickTakeProfitIndex,
    flags,
    collateralA: collateral.a,
    collateralB: collateral.b,
    borrowA: borrow.a,
    borrowB: borrow.b,
    minAddedAmountA: minAddedAmount.a,
    minAddedAmountB: minAddedAmount.b,
    maxSwapSlippage,
  };

  /**
   * Creation of instructions for Position Accounts creation and adding liquidity.
   */
  const instructions = await openPositionWithLiquidityOrcaInstructions(
    rpc,
    authority,
    newPositionMintKeypair,
    whirlpoolAddress,
    args,
  );

  /**
   * Signing and sending the transaction with all the instructions to the Solana network.
   */
  await createAndSendTransaction(authority, instructions, market.data.addressLookupTable);
}

openPositionWithLiquidityOrca().catch(console.error);
