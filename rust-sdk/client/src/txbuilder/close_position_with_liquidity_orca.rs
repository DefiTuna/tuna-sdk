use crate::accounts::{fetch_all_vault, fetch_tuna_position};
use crate::utils::get_create_ata_instructions;
use crate::{close_position_orca_instruction, get_tuna_position_address, get_vault_address, remove_liquidity_orca_instruction, RemoveLiquidityOrcaArgs, HUNDRED_PERCENT};
use anyhow::anyhow;
use orca_whirlpools_client::fetch_whirlpool;
use solana_client::rpc_client::RpcClient;
use solana_program::instruction::Instruction;
use solana_program::pubkey::Pubkey;

pub struct ClosePositionWithLiquidityOrcaArgs {
    pub swap_to_token: u8,
    pub min_removed_amount_a: u64,
    pub min_removed_amount_b: u64,
    pub max_swap_slippage: u32,
}

// TODO: rewards support
pub fn close_position_with_liquidity_orca_instructions(
    rpc: &RpcClient,
    authority: &Pubkey,
    position_mint: &Pubkey,
    args: ClosePositionWithLiquidityOrcaArgs,
) -> anyhow::Result<Vec<Instruction>> {
    let tuna_position = fetch_tuna_position(&rpc, &get_tuna_position_address(&position_mint).0)?;

    let whirlpool = fetch_whirlpool(rpc, &tuna_position.data.pool)?;
    let mint_a_address = whirlpool.data.token_mint_a;
    let mint_b_address = whirlpool.data.token_mint_b;

    let vaults = fetch_all_vault(&rpc, &[get_vault_address(&mint_a_address).0, get_vault_address(&mint_b_address).0])?;
    let (vault_a, vault_b) = (&vaults[0], &vaults[1]);

    let mut all_mint_addresses = vec![mint_a_address, mint_b_address];
    for reward_info in &whirlpool.data.reward_infos {
        if reward_info.mint != Pubkey::default() {
            all_mint_addresses.push(reward_info.mint);
        }
    }

    let mint_accounts = rpc.get_multiple_accounts(all_mint_addresses[0..all_mint_addresses.len()].into())?;
    let mint_a_account = mint_accounts[0].as_ref().ok_or(anyhow!("Token A mint account not found"))?;
    let mint_b_account = mint_accounts[1].as_ref().ok_or(anyhow!("Token B mint account not found"))?;

    let authority_ata_a_instructions = get_create_ata_instructions(&mint_a_address, authority, authority, &mint_a_account.owner, 0);
    let authority_ata_b_instructions = get_create_ata_instructions(&mint_b_address, authority, authority, &mint_b_account.owner, 0);

    let mut instructions = vec![];
    instructions.extend(authority_ata_a_instructions.create);
    instructions.extend(authority_ata_b_instructions.create);

    instructions.push(remove_liquidity_orca_instruction(
        authority,
        &tuna_position.data,
        &vault_a.data,
        &vault_b.data,
        &whirlpool.data,
        &mint_a_account.owner,
        &mint_b_account.owner,
        RemoveLiquidityOrcaArgs {
            withdraw_percent: HUNDRED_PERCENT,
            swap_to_token: args.swap_to_token,
            min_removed_amount_a: args.min_removed_amount_a,
            min_removed_amount_b: args.min_removed_amount_b,
            max_swap_slippage: args.max_swap_slippage,
        },
    ));

    instructions.extend(authority_ata_a_instructions.cleanup);
    instructions.extend(authority_ata_b_instructions.cleanup);

    instructions.push(close_position_orca_instruction(&authority, &tuna_position.data, &mint_a_account.owner, &mint_b_account.owner));

    Ok(instructions)
}
