use crate::constants::SOL_USDC_WHIRLPOOL;
use crate::types::Amounts;
use crate::utils::fetch_address_lookup_table;
use anyhow::Result;
use defituna_client::accounts::fetch_market;
use defituna_client::{get_market_address, open_and_increase_tuna_lp_position_orca_instructions, TUNA_ID};
use defituna_client::{OpenAndIncreaseTunaLpPositionArgs, TUNA_POSITION_FLAGS_LOWER_LIMIT_ORDER_SWAP_TO_TOKEN_B};
use fusionamm_tx_sender::{send_smart_transaction, PriorityFeeLevel, SmartTxConfig, SmartTxPriorityFeeConfig};
use orca_whirlpools_client::{self, fetch_whirlpool};
use orca_whirlpools_core::{sqrt_price_to_price, MAX_SQRT_PRICE, MIN_SQRT_PRICE};
use solana_keypair::Keypair;
use solana_program_pack::Pack;
use solana_rpc_client::rpc_client::RpcClient;
use solana_signer::Signer;
use spl_token_2022::state::Mint;
use std::sync::Arc;
use std::time::Duration;

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
pub async fn open_position_with_liquidity_orca(rpc: RpcClient, authority: &Keypair) -> Result<()> {
  println!("Opening a position with liquidity...");

  // The Program Derived Address of the pool from Orca's Whirlpools to create the position in.
  // For this example we use the SOL/USDC Pool.
  let whirlpool_address = SOL_USDC_WHIRLPOOL;

  // The Whirlpool Account containing deserialized data, fetched using Orca's Whirlpool Client
  let whirlpool = fetch_whirlpool(&rpc, &whirlpool_address)?;

  // The nominal amounts of Token A (SOL in this example) and Token B (USDC in this example) to deposit for liquidity,
  // as a flat value (e.g., 1 SOL) excluding decimals.
  let nominal_collateral = Amounts { a: 0.001, b: 0.0 };
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
  // Minimum added amounts for Tokens A and B to be respected by the AddLiquidity instruction, acting as slippage limits.
  let min_added_amount = Amounts { a: 0, b: 0 };
  // The total amount of slippage allowed on the Whirlpool's price, in case of inner swaps due to rebalancing of deposit ratio.
  let max_swap_slippage = 0;

  // The Tuna Position option controlling token swaps on stop-loss, represented in bits 0-1.
  // - `00` (0) - No swap
  // - `01` (1) - Swaps to Token A (use TUNA_POSITION_FLAGS_LOWER_LIMIT_ORDER_SWAP_TO_TOKEN_A)
  // - `10` (2) - Swaps to Token B (use TUNA_POSITION_FLAGS_LOWER_LIMIT_ORDER_SWAP_TO_TOKEN_B)
  let stop_loss_swap_to_token = TUNA_POSITION_FLAGS_LOWER_LIMIT_ORDER_SWAP_TO_TOKEN_B;
  // The Tuna Position option controlling token swaps on take-profit, represented in bits 2-3.
  // - `00` (0) - No swap
  // - `01` (4) - Swaps to Token A (use TUNA_POSITION_FLAGS_UPPER_LIMIT_ORDER_SWAP_TO_TOKEN_A)
  // - `10` (8) - Swaps to Token B (use TUNA_POSITION_FLAGS_UPPER_LIMIT_ORDER_SWAP_TO_TOKEN_B)
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

  let args = OpenAndIncreaseTunaLpPositionArgs {
    tick_lower_index,
    tick_upper_index,
    lower_limit_order_sqrt_price: MIN_SQRT_PRICE,
    upper_limit_order_sqrt_price: MAX_SQRT_PRICE,
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

  // The OpenAndIncreaseTunaLpPositionOrca instruction created via the Tuna Client, handling:
  // - Creation of the Tuna Position account with its settings in the Tuna smart contract.
  // - Creation of the Orca Position account with its settings via CPI to the Whirlpools smart contract.
  // - Minting of the Position Mint NFT.
  // - Potential borrowing of funds from Tuna Lending Vaults ATAs.
  // - Potential swap of tokens if deposit ratio is different from the Position's range-to-price ratio.
  // - Depositing tokens to the Whirlpools vaults to increase the Position's liquidity.
  let ix = open_and_increase_tuna_lp_position_orca_instructions(&rpc, &authority.pubkey(), &whirlpool_address, args)?;
  println!("Position mint: {}", ix.position_mint);

  // Almost all tuna transactions require the address lookup table to make the tx size smaller.
  // The LUT address is stored in the market account.
  let market_address = get_market_address(&whirlpool_address).0;
  let market = fetch_market(&rpc, &market_address)?;
  let market_lut = fetch_address_lookup_table(&rpc, &market.data.address_lookup_table)?;

  // Signing and sending the transaction with all the instructions to the Solana network.
  let mut signers = vec![];
  signers.push(Arc::new(authority.insecure_clone()));
  for s in ix.additional_signers {
    signers.push(Arc::new(s.insecure_clone()))
  }

  // 'send_smart_transaction' requires a non-blocking rpc client, so we create it here.
  // However, it's not recommended to create the client each time—initialize it once and reuse it.
  let nonblocking_rpc = solana_rpc_client::nonblocking::rpc_client::RpcClient::new(rpc.url());

  println!("Sending a transaction...");

  // Configure the transaction to use a priority fee.
  let tx_config = SmartTxConfig {
    priority_fee: Some(SmartTxPriorityFeeConfig {
      additional_addresses: vec![TUNA_ID],
      fee_level: PriorityFeeLevel::Low,
      fee_min: 1000,
      fee_max: 100000000, // 0.001 SOL
    }),
    jito: None,
    default_compute_unit_limit: 800_000,
    compute_unit_margin_multiplier: 1.15,
    ingore_simulation_error: false,
    sig_verify_on_simulation: false,
    transaction_timeout: Some(Duration::from_secs(60)),
  };

  // Finally send the transaction.
  let result = send_smart_transaction(
    &nonblocking_rpc,
    signers,
    &authority.pubkey(),
    ix.instructions,
    vec![market_lut],
    tx_config,
  )
  .await?;

  println!("Transaction signature: {}", result.signature);
  println!(
    "Transaction priority fee: {} micro-lamports per cu",
    result.priority_fee
  );
  Ok(())
}
