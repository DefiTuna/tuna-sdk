//
// Copyright (c) Cryptic Dot
//
// Modification based on Orca Whirlpools (https://github.com/orca-so/whirlpools),
// originally licensed under the Apache License, Version 2.0, prior to February 26, 2025.
//
// Modifications licensed under DefiTuna SDK Source-Available License v1.0
// See the LICENSE file in the project root for license information.
//

use crate::tests::helpers::rpc::RpcContext;
use solana_sdk::{pubkey::Pubkey, signer::Signer, system_instruction};
use spl_associated_token_account::{get_associated_token_address_with_program_id, instruction::create_associated_token_account_idempotent};
use spl_token_2022::{
    extension::{
        transfer_fee::instruction::{initialize_transfer_fee_config, set_transfer_fee},
        ExtensionType,
    },
    instruction::{initialize_mint2, mint_to},
    solana_program::program_pack::Pack,
    state::Mint,
    ID as TOKEN_2022_PROGRAM_ID,
};
use std::error::Error;

#[derive(Default)]
pub struct SetupAtaConfig {
    pub amount: Option<u64>,
}

pub async fn setup_mint_te(ctx: &RpcContext, decimals: u8, extensions: &[ExtensionType]) -> Result<Pubkey, Box<dyn Error>> {
    let mint = ctx.get_next_keypair();
    let mut instructions = vec![];

    // 1. Create account instruction
    let space = ExtensionType::try_calculate_account_len::<Mint>(extensions)?;
    let rent = ctx.rpc.get_minimum_balance_for_rent_exemption(space)?;

    instructions.push(system_instruction::create_account(&ctx.signer.pubkey(), &mint.pubkey(), rent, space as u64, &TOKEN_2022_PROGRAM_ID));

    // 2. Initialize extensions first
    for extension in extensions {
        if extension == &ExtensionType::TransferFeeConfig {
            instructions.push(initialize_transfer_fee_config(
                &TOKEN_2022_PROGRAM_ID,
                &mint.pubkey(),
                Some(&ctx.signer.pubkey()),
                Some(&ctx.signer.pubkey()),
                100,           // 1% (matching program)
                1_000_000_000, // 1 token (matching program)
            )?);
        }
    }

    // 3. Initialize mint
    instructions.push(initialize_mint2(
        &TOKEN_2022_PROGRAM_ID,
        &mint.pubkey(),
        &ctx.signer.pubkey(),
        None,     // freeze_authority
        decimals, // decimals
    )?);

    // 4. Set extension configurations
    for extension in extensions {
        if extension == &ExtensionType::TransferFeeConfig {
            instructions.push(set_transfer_fee(
                &TOKEN_2022_PROGRAM_ID,
                &mint.pubkey(),
                &ctx.signer.pubkey(),
                &[],
                150,           // 1.5% (matching program)
                1_000_000_000, // 1 token
            )?);
        }
    }

    ctx.send_transaction_with_signers(instructions, vec![&mint])?;
    Ok(mint.pubkey())
}

pub async fn setup_mint_te_fee(ctx: &RpcContext, decimals: u8) -> Result<Pubkey, Box<dyn Error>> {
    setup_mint_te(ctx, decimals, &[ExtensionType::TransferFeeConfig]).await
}

pub async fn setup_ata_te(ctx: &RpcContext, mint: &Pubkey, config: Option<SetupAtaConfig>) -> Result<Pubkey, Box<dyn Error>> {
    let config = config.unwrap_or_default();
    let ata = get_associated_token_address_with_program_id(&ctx.signer.pubkey(), mint, &TOKEN_2022_PROGRAM_ID);

    let mut instructions = vec![create_associated_token_account_idempotent(
        &ctx.signer.pubkey(),
        &ctx.signer.pubkey(),
        mint,
        &TOKEN_2022_PROGRAM_ID,
    )];

    if let Some(amount) = config.amount {
        instructions.push(mint_to(&TOKEN_2022_PROGRAM_ID, mint, &ata, &ctx.signer.pubkey(), &[], amount)?);
    }

    ctx.send_transaction(instructions)?;
    Ok(ata)
}

pub async fn fetch_mint(ctx: &RpcContext, mint: &Pubkey) -> Result<Mint, Box<dyn Error>> {
    let token_mint_account = ctx.rpc.get_account(&mint)?;
    let token_mint = Mint::unpack(&token_mint_account.data)?;
    Ok(token_mint)
}
