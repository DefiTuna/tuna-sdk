use crate::accounts::{TunaConfig, TunaSpotPosition, Vault};
use crate::instructions::{LiquidateTunaSpotPositionJupiter, LiquidateTunaSpotPositionJupiterInstructionArgs};
use crate::types::{AccountsType, RemainingAccountsInfo, RemainingAccountsSlice};
use crate::{get_market_address, get_tuna_config_address, get_tuna_spot_position_address, JUPITER_PROGRAM_ID};
use solana_instruction::{AccountMeta, Instruction};
use solana_pubkey::Pubkey;
use solana_sdk_ids::system_program;
use spl_associated_token_account::get_associated_token_address_with_program_id;
use spl_associated_token_account::instruction::create_associated_token_account_idempotent;

pub struct LiquidateTunaSpotPositionJupiterArgs {
    pub decrease_percent: u32,
    pub jupiter_route_data: Vec<u8>,
}

pub fn liquidate_tuna_spot_position_jupiter_instructions(
    authority: &Pubkey,
    tuna_position: &TunaSpotPosition,
    tuna_config: &TunaConfig,
    vault_a_address: &Pubkey,
    vault_a: &Vault,
    vault_b_address: &Pubkey,
    vault_b: &Vault,
    token_program_a: &Pubkey,
    token_program_b: &Pubkey,
    jupiter_route_accounts: Vec<AccountMeta>,
    jupiter_intermediate_token_accounts_and_programs: Vec<AccountMeta>,
    args: LiquidateTunaSpotPositionJupiterArgs,
) -> Vec<Instruction> {
    let mut instructions = vec![];

    instructions.push(create_associated_token_account_idempotent(authority, &tuna_config.fee_recipient, &vault_a.mint, token_program_a));
    instructions.push(create_associated_token_account_idempotent(authority, &tuna_config.fee_recipient, &vault_b.mint, token_program_b));
    instructions.push(create_associated_token_account_idempotent(authority, &tuna_position.authority, &tuna_position.mint_a, token_program_a));
    instructions.push(create_associated_token_account_idempotent(authority, &tuna_position.authority, &tuna_position.mint_b, token_program_b));

    /*
    // Native SOL is used when the position is totally liquidated and ATA is not required.
    if tuna_position.mint_a != spl_token::native_mint::ID || args.decrease_percent < HUNDRED_PERCENT {
        instructions.push(create_associated_token_account_idempotent(authority, &tuna_position.authority, &tuna_position.mint_a, token_program_a));
    }

    if tuna_position.mint_b != spl_token::native_mint::ID || args.decrease_percent < HUNDRED_PERCENT {
        instructions.push(create_associated_token_account_idempotent(authority, &tuna_position.authority, &tuna_position.mint_b, token_program_b));
    }
    */

    instructions.push(liquidate_tuna_spot_position_jupiter_instruction(
        authority,
        tuna_position,
        tuna_config,
        vault_a_address,
        vault_a,
        vault_b_address,
        vault_b,
        token_program_a,
        token_program_b,
        jupiter_route_accounts,
        jupiter_intermediate_token_accounts_and_programs,
        args,
    ));

    instructions
}

pub fn liquidate_tuna_spot_position_jupiter_instruction(
    authority: &Pubkey,
    tuna_position: &TunaSpotPosition,
    tuna_config: &TunaConfig,
    vault_a_address: &Pubkey,
    vault_a: &Vault,
    vault_b_address: &Pubkey,
    vault_b: &Vault,
    token_program_a: &Pubkey,
    token_program_b: &Pubkey,
    jupiter_route_accounts: Vec<AccountMeta>,
    jupiter_intermediate_token_accounts_and_programs: Vec<AccountMeta>,
    args: LiquidateTunaSpotPositionJupiterArgs,
) -> Instruction {
    let mint_a = vault_a.mint;
    let mint_b = vault_b.mint;

    let tuna_config_address = get_tuna_config_address().0;
    let market_address = get_market_address(&tuna_position.pool).0;
    let tuna_position_address = get_tuna_spot_position_address(&tuna_position.authority, &tuna_position.pool).0;
    let tuna_position_owner_ata_a = get_associated_token_address_with_program_id(&tuna_position.authority, &mint_a, token_program_a);
    let tuna_position_owner_ata_b = get_associated_token_address_with_program_id(&tuna_position.authority, &mint_b, token_program_b);

    let ix_builder = LiquidateTunaSpotPositionJupiter {
        authority: *authority,
        tuna_config: tuna_config_address,
        mint_a,
        mint_b,
        market: market_address,
        vault_a: *vault_a_address,
        vault_b: *vault_b_address,
        vault_a_ata: get_associated_token_address_with_program_id(vault_a_address, &mint_a, token_program_a),
        vault_b_ata: get_associated_token_address_with_program_id(vault_b_address, &mint_b, token_program_b),
        tuna_position: tuna_position_address,
        tuna_position_ata_a: get_associated_token_address_with_program_id(&tuna_position_address, &mint_a, token_program_a),
        tuna_position_ata_b: get_associated_token_address_with_program_id(&tuna_position_address, &mint_b, token_program_b),
        tuna_position_owner: tuna_position.authority,
        tuna_position_owner_ata_a,
        tuna_position_owner_ata_b,
        fee_recipient_ata_a: get_associated_token_address_with_program_id(&tuna_config.fee_recipient, &mint_a, token_program_a),
        fee_recipient_ata_b: get_associated_token_address_with_program_id(&tuna_config.fee_recipient, &mint_b, token_program_b),
        oracle_price_update_a: vault_a.oracle_price_update,
        oracle_price_update_b: vault_b.oracle_price_update,
        pool: tuna_position.pool,
        jupiter_program: JUPITER_PROGRAM_ID,
        token_program_a: *token_program_a,
        token_program_b: *token_program_b,
        memo_program: spl_memo::ID,
        system_program: system_program::ID,
    };

    let mut remaining_accounts_slices = vec![];
    let mut remaining_accounts = vec![];

    remaining_accounts_slices.push(RemainingAccountsSlice {
        accounts_type: AccountsType::JupiterRoute,
        length: jupiter_route_accounts.len() as u8,
    });

    if !jupiter_intermediate_token_accounts_and_programs.is_empty() {
        remaining_accounts_slices.push(RemainingAccountsSlice {
            accounts_type: AccountsType::JupiterIntermediateTokenAccounts,
            length: jupiter_intermediate_token_accounts_and_programs.len() as u8,
        });
    }

    for account in jupiter_route_accounts {
        remaining_accounts.push(account);
    }

    for account in jupiter_intermediate_token_accounts_and_programs {
        remaining_accounts.push(account);
    }

    ix_builder.instruction_with_remaining_accounts(
        LiquidateTunaSpotPositionJupiterInstructionArgs {
            decrease_percent: args.decrease_percent,
            jupiter_route_data: args.jupiter_route_data,
            remaining_accounts_info: RemainingAccountsInfo {
                slices: remaining_accounts_slices,
            },
        },
        &remaining_accounts,
    )
}
