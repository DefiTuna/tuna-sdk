use std::ops::Mul;

use anyhow::Result;
use defituna_client::open_lending_position_and_deposit_instructions;
use solana_client::rpc_client::RpcClient;
use solana_sdk::signer::Signer;

use crate::utils::{common::get_mint_decimals, rpc::create_and_send_transaction};

pub fn deposit_and_create(rpc: RpcClient, authority: Box<dyn Signer>) -> Result<()> {
  // The address of the token mint to deposit/withdraw, identifying the target Tuna Lending Vault.
  // Set to the USDC token address in our examples;
  // There are methods in our sdk to fetch all available lending vaults and their respective mint addresses.
  let token_mint_address = spl_token::native_mint::ID;
  // The nominal amount to deposit, excluding Token decimals (e.g., 1 SOL as a flat value, or 0.5 SOL).
  let nominal_amount: f64 = 1.0;
  // Fetches token decimals for the Token, using Whirlpool Client.
  let decimals = get_mint_decimals(&rpc, &token_mint_address)?;
  // The amount in lamports to deposit, including Token decimals (e.g. 1_000_000_000 SOL as a flat value for a whole unit of SOL)
  let amount = nominal_amount
    .mul(f64::try_from(10_u32.pow(decimals as u32))?)
    .round()
    .abs() as u64;

  // The deposit instruction interacts with the Tuna program to deposit the funds into the Lending Position.
  // If the Lending Position doesn't exist, we need to create it. We rely on the create instruction from the Tuna program.
  let mut instructions =
    open_lending_position_and_deposit_instructions(&rpc, &authority.pubkey(), &token_mint_address, amount);

  // We sign and send the transaction to the network, which will create (if necessary) and deposit into the Lending Position.
  create_and_send_transaction(&rpc, &authority, &mut instructions, None, None, None)
}
