use crate::constants::SOL_USDC_WHIRLPOOL;
use crate::types::Amounts;
use crate::utils::rpc::create_and_send_transaction;
use anyhow::Result;
use defituna_client::accounts::fetch_market;
use defituna_client::{
  get_market_address, OpenPositionWithLiquidityOrcaArgs, TUNA_POSITION_FLAGS_STOP_LOSS_SWAP_TO_TOKEN_B,
};
use defituna_client::{open_position_with_liquidity_orca_instructions, NO_TAKE_PROFIT};
use orca_whirlpools_client::{self, fetch_whirlpool};
use orca_whirlpools_core::sqrt_price_to_price;
use solana_client::rpc_client::RpcClient;
use solana_sdk::program_pack::Pack;
use solana_sdk::{signature::Keypair, signer::Signer};
use spl_token_2022::state::Mint;

/// Opens a position in an Orca Liquidity Pool and adds liquidity using borrowed funds from Tuna Lending Pools.
/// Uses the SOL/USDC Whirlpool with preset amounts and leverage for this example; these can be adjusted or passed through the function’s input.
/// Note: Combines opening and adding liquidity, though these actions can be performed separately and liquidity can be added multiple times later.
///
/// # Parameters
/// - `rpc`: The `RpcClient` for interacting with the Solana blockchain.
/// - `authority`: The authority `Box<dyn Signer>` who owns the position.
/// - `tuna_position_mint`: The `Pubkey` of the Tuna Position Mint identifying the position from which to collect and compound fees.
///
/// # Returns
/// - `Result<()>`: Returns `Ok(())` if the transaction is successful, or an error if it fails.
pub fn open_position_with_liquidity_orca(rpc: RpcClient, authority: Box<dyn Signer>) -> Result<()> {
  // The Program Derived Address of the pool from Orca's Whirlpools to create the position in.
  // For this example we use the SOL/USDC Pool.
  let whirlpool_address = SOL_USDC_WHIRLPOOL;

  // The Whirlpool Account containing deserialized data, fetched using Orca's Whirlpool Client
  let whirlpool = fetch_whirlpool(&rpc, &whirlpool_address)?;

  // The Market Account containing deserialized data, fetched using Tuna's Client.
  let market = fetch_market(&rpc, &get_market_address(&whirlpool_address).0)?;

  // A newly generated Keypair for the new Position Mint, which will be created with the position and it's used to identify it.
  let new_position_mint_keypair = Keypair::new();

  // The nominal amounts of Token A (SOL in this example) and Token B (USDC in this example) to deposit for liquidity,
  // as a flat value (e.g., 1 SOL) excluding decimals.
  let nominal_collateral = Amounts { a: 0.01, b: 0.1 };
  // Multiplier for borrowed funds applied to the total provided amount (min 1, max 5; e.g., 2 doubles the borrowed amount).
  let leverage = 2.0;
  // Ratio for borrowing funds, freely chosen by the user, unbound by the Position’s liquidity range.
  let borrow_ratio = Amounts { a: 0.6, b: 0.4 };

  // Token Mint A
  let token_mint_a_account = rpc.get_account(&whirlpool.data.token_mint_a)?;
  let token_mint_a = Mint::unpack(&token_mint_a_account.data)?;
  // Token Mint B
  let token_mint_b_account = rpc.get_account(&whirlpool.data.token_mint_b)?;
  let token_mint_b = Mint::unpack(&token_mint_b_account.data)?;

  // The collateral amounts of tokens A and B (adjusted for decimals) provided by the user to use for increasing liquidity.
  let collateral = Amounts {
    a: (nominal_collateral.a * 10_f64.powf(token_mint_a.decimals as f64)) as u64,
    b: (nominal_collateral.b * 10_f64.powf(token_mint_b.decimals as f64)) as u64,
  };

  // The current Whirlpool price, derived from the sqrtPrice using Orca's Whirlpool Client.
  let price = sqrt_price_to_price(whirlpool.data.sqrt_price, token_mint_a.decimals, token_mint_b.decimals);

  // The total nominal collateral amount (excluding decimals) represented in Token B units.
  let total_nominal_collateral_amount = nominal_collateral.a * price + nominal_collateral.b;
  // Safety checks
  assert!(
    borrow_ratio.a >= 0.0 && borrow_ratio.b >= 0.0,
    "Borrow ratios must be greater than or equal to 0"
  );
  assert_eq!(
    borrow_ratio.a + borrow_ratio.b,
    1.0,
    "Borrow ratios must be balanced (sum equal to 1)"
  );
  assert!(leverage >= 1.0, "Leverage must be greater than or equal to 1");
  // The nominal amounts of Tokens A and B to borrow from Tuna's Lending Pools,
  // as a flat value (e.g., 1 SOL) excluding decimals.
  let nominal_borrow = Amounts {
    a: total_nominal_collateral_amount * (leverage - 1.0) * (borrow_ratio.a) / (price),
    b: total_nominal_collateral_amount * (leverage - 1.0) * (borrow_ratio.b),
  };
  // The amounts of tokens A and B (adjusted for decimals) borrowed from Tuna's Lending Pools to use for increasing liquidity.
  let borrow = Amounts {
    a: (nominal_borrow.a * 10_f64.powf(token_mint_a.decimals as f64)) as u64,
    b: (nominal_borrow.b * 10_f64.powf(token_mint_b.decimals as f64)) as u64,
  };

  // Defining additional input variables;

  // The upper Tick index for the Orca Position's range, identifying the highest Tick at which the Position is active in the Whirlpool.
  // Note: Must be divisible by the Whirlpool's tickSpacing.
  let tick_lower_index = -22784;
  // The upper Tick index for the Orca Position's range, identifying the highest Tick at which the Position is active in the Whirlpool.
  // Note: Must be divisible by the Whirlpool's tickSpacing.
  let tick_upper_index = 21504;
  // The Tick index for an optional Stop-Loss limit order below the Orca Position’s range in the Whirlpool.
  // Use NO_STOP_LOSS (lowest viable index) to disable Stop-Loss.
  // Note: Must be divisible by the Whirlpool's tickSpacing.
  let tick_stop_loss_index = -22784;
  // The Tick index for an optional Take-Profit limit order above the Orca Position’s range in the Whirlpool.
  // Use NO_TAKE_PROFIT (highest viable index) to disable Take-Profit.
  // Note: Must be divisible by the Whirlpool's tickSpacing.
  let tick_take_profit_index = NO_TAKE_PROFIT;
  // Minimum added amounts for Tokens A and B to be respected by the AddLiquidity instruction, acting as slippage limits.
  let min_added_amount = Amounts { a: 0, b: 0 };
  // The total amount of slippage allowed on the Whirlpool's price, in case of inner swaps due to rebalancing of deposit ratio.
  let max_swap_slippage = 0;

  // The Tuna Position option controlling token swaps on stop-loss, represented in bits 0-1.
  // - `00` (0) - No swap
  // - `01` (1) - Swaps to Token A (use TUNA_POSITION_FLAGS_STOP_LOSS_SWAP_TO_TOKEN_A)
  // - `10` (2) - Swaps to Token B (use TUNA_POSITION_FLAGS_STOP_LOSS_SWAP_TO_TOKEN_B)
  let stop_loss_swap_to_token = TUNA_POSITION_FLAGS_STOP_LOSS_SWAP_TO_TOKEN_B;
  // The Tuna Position option controlling token swaps on take-profit, represented in bits 2-3.
  // - `00` (0) - No swap
  // - `01` (4) - Swaps to Token A (use TUNA_POSITION_FLAGS_TAKE_PROFIT_SWAP_TO_TOKEN_A)
  // - `10` (8) - Swaps to Token B (use TUNA_POSITION_FLAGS_TAKE_PROFIT_SWAP_TO_TOKEN_B)
  let take_profit_swap_to_token = 0;
  // The Tuna Position option controlling auto-compounding behavior, represented in bits 4-5.
  // - `00` (0) - No auto compounding
  // - `01` (16) - Auto-compounds yield (use TUNA_POSITION_FLAGS_AUTO_COMPOUND_YIELD)
  // - `10` (32) - Auto-compounds yield with leverage (use TUNA_POSITION_FLAGS_AUTO_COMPOUND_YIELD_WITH_LEVERAGE)
  let auto_compound_yield = 0;

  // The 6-bit mapping of the Tuna Position options, combining stop-loss swap, take-profit swap, and auto-compounding settings.
  // In this, selecting only "Swaps to Token B on Stop-Loss" results in 0b000010 (decimal 2).
  // For no options selected, set each to `0` or use `flags = 0`.
  // Bit positions (each field supports one value: `00`, `01`, or `10`):
  // Bits 0..1: Stop-loss swap (e.g., 0, 1, 2)
  // Bits 2..3: Take-profit swap (e.g., 0, 4, 8)
  // Bits 4..5: Auto-compounding (e.g., 0, 16, 32)
  // Computed by bitwise OR-ing the options: `stopLossSwapToToken | takeProfitSwapToToken | autoCompoundYield`.
  let flags = stop_loss_swap_to_token | take_profit_swap_to_token | auto_compound_yield;

  let args = OpenPositionWithLiquidityOrcaArgs {
    tick_lower_index,
    tick_upper_index,
    tick_stop_loss_index,
    tick_take_profit_index,
    flags,
    collateral_a: collateral.a,
    collateral_b: collateral.b,
    borrow_a: borrow.a,
    borrow_b: borrow.b,
    min_added_amount_a: min_added_amount.a,
    min_added_amount_b: min_added_amount.b,
    max_swap_slippage,
  };

  // Creation of instructions for opening the position and adding liquidity;

  // The OpenPositionWithLiquidityOrca instruction created via the Tuna Client, handling:
  // - Creation of the Tuna Position account with its settings in the Tuna smart contract.
  // - Creation of the Orca Position account with its settings via CPI to the Whirlpools smart contract.
  // - Minting of the Position Mint NFT.
  // - Potential borrowing of funds from Tuna Lending Vaults ATAs.
  // - Potential swap of tokens if deposit ratio is different from the Position's range-to-price ratio.
  // - Depositing tokens to the Whirlpools vaults to increase the Position's liquidity.
  let mut instructions = open_position_with_liquidity_orca_instructions(
    &rpc,
    &authority.pubkey(),
    &new_position_mint_keypair.pubkey(),
    &whirlpool_address,
    args,
  )?;

  // Signing and sending the transaction with all the instructions to the Solana network.
  create_and_send_transaction(
    &rpc,
    &authority,
    &mut instructions,
    Some(vec![new_position_mint_keypair]),
    Some(market.data.address_lookup_table),
    None,
  )
}
