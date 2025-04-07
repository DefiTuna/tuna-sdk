pub const WSOL_MINT: &str = "So11111111111111111111111111111111111111112";
pub const SOL_USDC_WHIRLPOOL: &str = "Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE";
pub const MAX_CU_LIMIT: u32 = 1_400_000;
pub const MIN_COMPUTE_UNIT_PRICE: u64 = 50_000;
pub const VALID_METHODS: &[&str] = &[
  "deposit_and_create",
  "withdraw",
  "collect_and_compound_fees_orca",
  "collect_fees_orca",
  "open_and_add_liquidity_orca",
  "remove_liquidity_and_close_orca",
  "retrieve_lending_positions",
  "retrieve_tuna_positions",
];
