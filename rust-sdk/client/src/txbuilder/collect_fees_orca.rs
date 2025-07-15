use crate::accounts::{fetch_tuna_position, TunaPosition};
use crate::instructions::{CollectFeesOrca, CollectFeesOrcaInstructionArgs};
use crate::types::{AccountsType, RemainingAccountsInfo, RemainingAccountsSlice};
use crate::utils::get_create_ata_instructions;
use crate::{get_tuna_config_address, get_tuna_position_address};
use anyhow::{anyhow, Result};
use orca_whirlpools_client::{fetch_whirlpool, get_position_address, get_tick_array_address, Whirlpool};
use orca_whirlpools_core::get_tick_array_start_tick_index;
use solana_client::rpc_client::RpcClient;
use solana_instruction::{AccountMeta, Instruction};
use solana_pubkey::Pubkey;
use spl_associated_token_account::get_associated_token_address_with_program_id;

pub fn collect_fees_orca_instructions(rpc: &RpcClient, authority: &Pubkey, position_mint: &Pubkey) -> Result<Vec<Instruction>> {
    let tuna_position = fetch_tuna_position(&rpc, &get_tuna_position_address(&position_mint).0)?;

    let whirlpool = fetch_whirlpool(rpc, &tuna_position.data.pool)?;
    let mint_a_address = whirlpool.data.token_mint_a;
    let mint_b_address = whirlpool.data.token_mint_b;

    let mint_accounts = rpc.get_multiple_accounts(&[mint_a_address.into(), mint_b_address.into()])?;
    let mint_a_account = mint_accounts[0].as_ref().ok_or(anyhow!("Token A mint account not found"))?;
    let mint_b_account = mint_accounts[1].as_ref().ok_or(anyhow!("Token B mint account not found"))?;

    let authority_ata_a_instructions = get_create_ata_instructions(&mint_a_address, authority, authority, &mint_a_account.owner, 0);
    let authority_ata_b_instructions = get_create_ata_instructions(&mint_b_address, authority, authority, &mint_b_account.owner, 0);

    let mut instructions = vec![];
    instructions.extend(authority_ata_a_instructions.create);
    instructions.extend(authority_ata_b_instructions.create);

    instructions.push(collect_fees_orca_instruction(
        authority,
        &tuna_position.data,
        &whirlpool.data,
        &mint_a_account.owner,
        &mint_b_account.owner,
    ));

    instructions.extend(authority_ata_a_instructions.cleanup);
    instructions.extend(authority_ata_b_instructions.cleanup);

    Ok(instructions)
}

pub fn collect_fees_orca_instruction(
    authority: &Pubkey,
    tuna_position: &TunaPosition,
    whirlpool: &Whirlpool,
    token_program_a: &Pubkey,
    token_program_b: &Pubkey,
) -> Instruction {
    let mint_a = whirlpool.token_mint_a;
    let mint_b = whirlpool.token_mint_b;
    let whirlpool_address = tuna_position.pool;

    assert_eq!(tuna_position.mint_a, mint_a);
    assert_eq!(tuna_position.mint_b, mint_b);

    let tuna_config_address = get_tuna_config_address().0;
    let tuna_position_address = get_tuna_position_address(&tuna_position.position_mint).0;
    let tuna_position_owner_ata_a = get_associated_token_address_with_program_id(&authority, &mint_a, token_program_a);
    let tuna_position_owner_ata_b = get_associated_token_address_with_program_id(&authority, &mint_b, token_program_b);

    let tick_array_lower_start_tick_index = get_tick_array_start_tick_index(tuna_position.tick_lower_index, whirlpool.tick_spacing);
    let tick_array_lower_address = get_tick_array_address(&whirlpool_address, tick_array_lower_start_tick_index).unwrap().0;

    let tick_array_upper_start_tick_index = get_tick_array_start_tick_index(tuna_position.tick_upper_index, whirlpool.tick_spacing);
    let tick_array_upper_address = get_tick_array_address(&whirlpool_address, tick_array_upper_start_tick_index).unwrap().0;

    let ix_builder = CollectFeesOrca {
        authority: *authority,
        tuna_config: tuna_config_address,
        mint_a,
        mint_b,
        tuna_position: tuna_position_address,
        tuna_position_ata: get_associated_token_address_with_program_id(&tuna_position_address, &tuna_position.position_mint, &spl_token_2022::ID),
        tuna_position_ata_a: get_associated_token_address_with_program_id(&tuna_position_address, &tuna_position.mint_a, token_program_a),
        tuna_position_ata_b: get_associated_token_address_with_program_id(&tuna_position_address, &tuna_position.mint_b, token_program_b),
        tuna_position_owner_ata_a,
        tuna_position_owner_ata_b,
        whirlpool_program: orca_whirlpools_client::ID,
        whirlpool: whirlpool_address,
        orca_position: get_position_address(&tuna_position.position_mint).unwrap().0,
        token_program_a: *token_program_a,
        token_program_b: *token_program_b,
        memo_program: spl_memo::ID,
    };

    ix_builder.instruction_with_remaining_accounts(
        CollectFeesOrcaInstructionArgs {
            remaining_accounts_info: RemainingAccountsInfo {
                slices: vec![
                    RemainingAccountsSlice {
                        accounts_type: AccountsType::TickArrayLower,
                        length: 1,
                    },
                    RemainingAccountsSlice {
                        accounts_type: AccountsType::TickArrayUpper,
                        length: 1,
                    },
                    RemainingAccountsSlice {
                        accounts_type: AccountsType::PoolVaultTokenA,
                        length: 1,
                    },
                    RemainingAccountsSlice {
                        accounts_type: AccountsType::PoolVaultTokenB,
                        length: 1,
                    },
                ],
            },
        },
        &[
            AccountMeta::new(tick_array_lower_address, false),
            AccountMeta::new(tick_array_upper_address, false),
            AccountMeta::new(whirlpool.token_vault_a, false),
            AccountMeta::new(whirlpool.token_vault_b, false),
        ],
    )
}
