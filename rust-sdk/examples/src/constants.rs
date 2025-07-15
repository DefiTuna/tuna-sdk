use solana_pubkey::{pubkey, Pubkey};

pub const SOL_USDC_WHIRLPOOL: Pubkey = pubkey!("Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE");
//pub const SOL_USDC_WHIRLPOOL: Pubkey = pubkey!("FKH7TTE7PgPPSb9SaaMRKVTGA7xTbiJjeTujXY2xTdxp");

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
