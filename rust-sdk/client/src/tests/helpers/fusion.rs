use crate::tests::RpcContext;
use fusionamm_client::{
    get_fusion_pool_address, get_fusion_pools_config_address, get_token_badge_address, InitializePool, InitializePoolInstructionArgs, FUSIONAMM_ID,
    FUSION_POOLS_CONFIG_DISCRIMINATOR,
};
use fusionamm_sdk::{swap_instructions, SwapType};
use solana_account::Account;
use solana_pubkey::Pubkey;
use solana_sdk_ids::{system_program, sysvar};
use solana_signature::Signature;
use solana_signer::Signer;
use std::error::Error;

pub fn get_fusion_pool_config_accounts(signer: &Pubkey) -> Vec<(Pubkey, Account)> {
    let mut accounts = vec![];

    let config_address = get_fusion_pools_config_address().unwrap().0;
    accounts.push((
        config_address,
        Account {
            lamports: 100_000_000_000,
            data: [
                FUSION_POOLS_CONFIG_DISCRIMINATOR.into(),
                0u16.to_le_bytes().into(),
                signer.to_bytes().into(),
                signer.to_bytes().into(),
                signer.to_bytes().into(),
                100u16.to_le_bytes().into(),
                0u16.to_le_bytes().into(),
                100u16.to_le_bytes().into(),
                vec![0_u8; 170],
            ]
            .concat(),
            owner: FUSIONAMM_ID,
            executable: false,
            rent_epoch: 0,
        },
    ));

    accounts
}

pub async fn setup_fusion_pool(
    ctx: &RpcContext,
    token_a: &Pubkey,
    token_b: &Pubkey,
    tick_spacing: u16,
    initial_sqrt_price: u128,
) -> Result<Pubkey, Box<dyn Error>> {
    let config_address = get_fusion_pools_config_address()?.0;
    let account_infos = ctx.rpc.get_multiple_accounts(&[*token_a, *token_b])?;
    let mint_a_info = account_infos[0].as_ref().ok_or(format!("Mint {} not found", token_a))?;
    let token_program_a = mint_a_info.owner;
    let mint_b_info = account_infos[1].as_ref().ok_or(format!("Mint {} not found", token_b))?;
    let token_program_b = mint_b_info.owner;

    let pool_address = get_fusion_pool_address(&token_a, &token_b, tick_spacing)?.0;
    let token_badge_a = get_token_badge_address(&token_a)?.0;
    let token_badge_b = get_token_badge_address(&token_b)?.0;

    let token_vault_a = ctx.get_next_keypair();
    let token_vault_b = ctx.get_next_keypair();

    let mut instructions = vec![];

    instructions.push(
        InitializePool {
            fusion_pools_config: config_address,
            token_mint_a: *token_a,
            token_mint_b: *token_b,
            token_badge_a,
            token_badge_b,
            funder: ctx.signer.pubkey(),
            fusion_pool: pool_address,
            token_vault_a: token_vault_a.pubkey(),
            token_vault_b: token_vault_b.pubkey(),
            token_program_a,
            token_program_b,
            system_program: system_program::id(),
            rent: sysvar::rent::ID,
        }
        .instruction(InitializePoolInstructionArgs {
            initial_sqrt_price,
            tick_spacing,
            fee_rate: 300,
        }),
    );

    ctx.send_transaction_with_signers(instructions, vec![&token_vault_a, &token_vault_b])?;

    Ok(pool_address)
}

pub async fn swap_exact_in(
    ctx: &RpcContext,
    fusion_pool_address: &Pubkey,
    input_amount: u64,
    mint_address: &Pubkey,
    slippage_tolerance_bps: Option<u16>,
) -> Result<Signature, Box<dyn Error>> {
    ctx.send_transaction(
        swap_instructions(
            ctx.rpc.get_inner_client(),
            *fusion_pool_address,
            input_amount,
            *mint_address,
            SwapType::ExactIn,
            slippage_tolerance_bps,
            Some(ctx.signer.pubkey()),
        )
        .await
        .unwrap()
        .instructions,
    )
}
