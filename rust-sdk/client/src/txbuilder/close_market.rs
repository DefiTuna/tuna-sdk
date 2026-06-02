use crate::accounts::fetch_market;
use crate::instructions::CloseMarket;
use crate::{get_market_address, get_tuna_config_address};
use anyhow::Result;
use solana_client::rpc_client::RpcClient;
use solana_instruction::Instruction;
use solana_pubkey::Pubkey;
use spl_token::solana_program::address_lookup_table::instruction::deactivate_lookup_table;

pub fn close_market_instruction(
    rpc: &RpcClient,
    authority: &Pubkey,
    pool: &Pubkey,
    deactivate_address_lookup_table: bool,
) -> Result<Vec<Instruction>> {
    let tuna_config_address = get_tuna_config_address().0;
    let market_address = get_market_address(pool).0;
    let market = fetch_market(&rpc, &market_address)?;

    let mut instructions = vec![];

    if deactivate_address_lookup_table {
        instructions.push(deactivate_lookup_table(market.data.address_lookup_table, *authority));
    }

    let ix_builder = CloseMarket {
        authority: *authority,
        tuna_config: tuna_config_address,
        market: market_address,
        vault_a: market.data.vault_a,
        vault_b: market.data.vault_b,
    };

    instructions.push(ix_builder.instruction());

    Ok(instructions)
}
