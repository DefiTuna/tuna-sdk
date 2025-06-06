use crate::utils::rpc::create_and_send_transaction;
use anyhow::Result;
use defituna_client::withdraw_instructions;
use solana_client::rpc_client::RpcClient;
use solana_sdk::program_pack::Pack;
use solana_sdk::signer::Signer;
use spl_token::state::Mint;
use std::ops::Mul;

pub fn withdraw(rpc: RpcClient, authority: Box<dyn Signer>) -> Result<()> {
  // The address of the token mint to deposit/withdraw, identifying the target Tuna Lending Vault.
  // Set to the USDC token address in our examples;
  // There are methods in our sdk to fetch all available lending vaults and their respective mint addresses.
  let token_mint_address = spl_token::native_mint::ID;
  // Token Mint
  let token_mint_account = rpc.get_account(&token_mint_address)?;
  let token_mint = Mint::unpack(&token_mint_account.data)?;

  // The nominal amount to deposit, excluding Token decimals (e.g., 1 SOL as a flat value, or 0.5 SOL).
  let nominal_amount: f64 = 1.0;
  // The amount in lamports to deposit, including Token decimals (e.g. 1_000_000_000 SOL as a flat value for a whole unit of SOL)
  let amount = nominal_amount.mul(10_u64.pow(token_mint.decimals as u32) as f64) as u64;

  // The withdraw instruction interacts with the Tuna program to withdraw the funds into the lending position.
  // Here we have a choice to pass either funds or shares. For simplicity reasons we will use funds.
  let mut instructions = withdraw_instructions(&rpc, &authority.pubkey(), &token_mint_address, amount, 0)?;

  // We sign and send the transaction to the network, which will withdraw from the Lending Position.
  create_and_send_transaction(&rpc, &authority, &mut instructions, None, None, None)
}
