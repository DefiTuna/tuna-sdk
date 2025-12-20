use crate::accounts::{TunaConfig, TunaSpotPosition, Vault};
use crate::instructions::{LiquidateTunaSpotPositionJupiter, LiquidateTunaSpotPositionJupiterInstructionArgs};
use crate::{
    get_market_address, get_tuna_config_address, get_tuna_spot_position_address, get_vault_address, HUNDRED_PERCENT, JUPITER_EVENT_AUTHORITY,
    JUPITER_PROGRAM_AUTHORITY, JUPITER_PROGRAM_ID,
};
use solana_instruction::{AccountMeta, Instruction};
use solana_pubkey::Pubkey;
use solana_sdk_ids::system_program;
use spl_associated_token_account::get_associated_token_address_with_program_id;
use spl_associated_token_account::instruction::create_associated_token_account_idempotent;

pub fn liquidate_tuna_spot_position_jupiter_instructions(
    authority: &Pubkey,
    tuna_position: &TunaSpotPosition,
    tuna_config: &TunaConfig,
    vault_a: &Vault,
    vault_b: &Vault,
    token_program_a: &Pubkey,
    token_program_b: &Pubkey,
    args: LiquidateTunaSpotPositionJupiterInstructionArgs,
    remaining_accounts: &[AccountMeta],
) -> Vec<Instruction> {
    let mut instructions = vec![];

    instructions.push(create_associated_token_account_idempotent(authority, &tuna_config.fee_recipient, &vault_a.mint, token_program_a));
    instructions.push(create_associated_token_account_idempotent(authority, &tuna_config.fee_recipient, &vault_b.mint, token_program_b));

    // Native SOL is used when the position is totally liquidated and ATA is not required.
    if tuna_position.mint_a != spl_token::native_mint::ID || args.decrease_percent < HUNDRED_PERCENT {
        instructions.push(create_associated_token_account_idempotent(authority, &tuna_position.authority, &tuna_position.mint_a, token_program_a));
    }

    if tuna_position.mint_b != spl_token::native_mint::ID || args.decrease_percent < HUNDRED_PERCENT {
        instructions.push(create_associated_token_account_idempotent(authority, &tuna_position.authority, &tuna_position.mint_b, token_program_b));
    }

    instructions.push(liquidate_tuna_spot_position_jupiter_instruction(
        authority,
        tuna_position,
        tuna_config,
        vault_a,
        vault_b,
        token_program_a,
        token_program_b,
        args,
        remaining_accounts,
    ));

    instructions
}

pub fn liquidate_tuna_spot_position_jupiter_instruction(
    authority: &Pubkey,
    tuna_position: &TunaSpotPosition,
    tuna_config: &TunaConfig,
    vault_a: &Vault,
    vault_b: &Vault,
    token_program_a: &Pubkey,
    token_program_b: &Pubkey,
    args: LiquidateTunaSpotPositionJupiterInstructionArgs,
    remaining_accounts: &[AccountMeta],
) -> Instruction {
    let mint_a = vault_a.mint;
    let mint_b = vault_b.mint;

    let tuna_config_address = get_tuna_config_address().0;
    let market_address = get_market_address(&tuna_position.pool).0;
    let tuna_position_address = get_tuna_spot_position_address(&tuna_position.authority, &tuna_position.pool).0;
    let tuna_position_owner_ata_a = get_associated_token_address_with_program_id(&tuna_position.authority, &mint_a, token_program_a);
    let tuna_position_owner_ata_b = get_associated_token_address_with_program_id(&tuna_position.authority, &mint_b, token_program_b);
    let vault_a_address = get_vault_address(&mint_a).0;
    let vault_b_address = get_vault_address(&mint_b).0;

    let ix_builder = LiquidateTunaSpotPositionJupiter {
        authority: *authority,
        tuna_config: tuna_config_address,
        mint_a,
        mint_b,
        market: market_address,
        vault_a: vault_a_address,
        vault_b: vault_b_address,
        vault_a_ata: get_associated_token_address_with_program_id(&vault_a_address, &mint_a, token_program_a),
        vault_b_ata: get_associated_token_address_with_program_id(&vault_b_address, &mint_b, token_program_b),
        tuna_position: tuna_position_address,
        tuna_position_ata_a: get_associated_token_address_with_program_id(&tuna_position_address, &mint_a, token_program_a),
        tuna_position_ata_b: get_associated_token_address_with_program_id(&tuna_position_address, &mint_b, token_program_b),
        tuna_position_owner: tuna_position.authority,
        tuna_position_owner_ata_a,
        tuna_position_owner_ata_b,
        fee_recipient_ata_a: get_associated_token_address_with_program_id(&tuna_config.fee_recipient, &mint_a, token_program_a),
        fee_recipient_ata_b: get_associated_token_address_with_program_id(&tuna_config.fee_recipient, &mint_b, token_program_b),
        pyth_oracle_price_feed_a: vault_a.pyth_oracle_price_update,
        pyth_oracle_price_feed_b: vault_b.pyth_oracle_price_update,
        pool: tuna_position.pool,
        jupiter_program: JUPITER_PROGRAM_ID,
        jupiter_event_authority: JUPITER_EVENT_AUTHORITY,
        jupiter_program_authority: JUPITER_PROGRAM_AUTHORITY,
        token_program_a: *token_program_a,
        token_program_b: *token_program_b,
        memo_program: spl_memo::ID,
        system_program: system_program::ID,
        token_program: spl_token::ID,
    };

    ix_builder.instruction_with_remaining_accounts(args, remaining_accounts)
}
