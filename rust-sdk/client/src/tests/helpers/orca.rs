use crate::tests::RpcContext;
use orca_whirlpools::{swap_instructions, SwapType, SPLASH_POOL_TICK_SPACING, WHIRLPOOLS_CONFIG_ADDRESS};
use orca_whirlpools_client::{
    get_fee_tier_address, get_oracle_address, get_token_badge_address, get_whirlpool_address, InitializePoolV2, InitializePoolV2InstructionArgs,
    InitializePoolWithAdaptiveFee, InitializePoolWithAdaptiveFeeInstructionArgs, ADAPTIVE_FEE_TIER_DISCRIMINATOR, FEE_TIER_DISCRIMINATOR,
    WHIRLPOOLS_CONFIG_DISCRIMINATOR, WHIRLPOOL_ID,
};
use solana_program::{system_program, sysvar};
use solana_sdk::account::Account;
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::{Signature, Signer};
use std::error::Error;

pub fn get_whirlpool_config_accounts(signer: &Pubkey) -> Vec<(Pubkey, Account)> {
    let mut accounts = vec![];

    let config = *WHIRLPOOLS_CONFIG_ADDRESS.lock().unwrap();
    accounts.push((
        config,
        Account {
            lamports: 100_000_000_000,
            data: [
                WHIRLPOOLS_CONFIG_DISCRIMINATOR,
                &signer.to_bytes(),
                &signer.to_bytes(),
                &signer.to_bytes(),
                &100u16.to_le_bytes(),
            ]
            .concat(),
            owner: WHIRLPOOL_ID,
            executable: false,
            rent_epoch: 0,
        },
    ));

    let default_fee_tier = get_fee_tier_address(&config, 128).unwrap().0;
    accounts.push((
        default_fee_tier,
        Account {
            lamports: 100_000_000_000,
            data: [FEE_TIER_DISCRIMINATOR, &config.to_bytes(), &128u16.to_le_bytes(), &1000u16.to_le_bytes()].concat(),
            owner: WHIRLPOOL_ID,
            executable: false,
            rent_epoch: 0,
        },
    ));

    let concentrated_fee_tier = get_fee_tier_address(&config, 64).unwrap().0;
    accounts.push((
        concentrated_fee_tier,
        Account {
            lamports: 100_000_000_000,
            data: [FEE_TIER_DISCRIMINATOR, &config.to_bytes(), &64u16.to_le_bytes(), &300u16.to_le_bytes()].concat(),
            owner: WHIRLPOOL_ID,
            executable: false,
            rent_epoch: 0,
        },
    ));

    let splash_fee_tier = get_fee_tier_address(&config, SPLASH_POOL_TICK_SPACING).unwrap().0;
    accounts.push((
        splash_fee_tier,
        Account {
            lamports: 100_000_000_000,
            data: [
                FEE_TIER_DISCRIMINATOR,
                &config.to_bytes(),
                &SPLASH_POOL_TICK_SPACING.to_le_bytes(),
                &1000u16.to_le_bytes(),
            ]
            .concat(),
            owner: WHIRLPOOL_ID,
            executable: false,
            rent_epoch: 0,
        },
    ));

    let tick_spacing = 64;
    let adaptive_fee_tier = get_fee_tier_address(&config, 1024 + tick_spacing).unwrap().0;
    accounts.push((
        adaptive_fee_tier,
        Account {
            lamports: 100_000_000_000,
            data: [
                ADAPTIVE_FEE_TIER_DISCRIMINATOR,
                &config.to_bytes(),
                &(1024_u16 + tick_spacing).to_le_bytes(), // fee_tier_index
                &tick_spacing.to_le_bytes(),              // tick_spacing
                &signer.to_bytes(),                       // initialize_pool_authority
                &signer.to_bytes(),                       // delegated_fee_authority
                &3000u16.to_le_bytes(),                   // default_base_fee_rate
                &30u16.to_le_bytes(),                     // filter_period
                &600u16.to_le_bytes(),                    // decay_period
                &500u16.to_le_bytes(),                    // reduction_factor
                &4000u32.to_le_bytes(),                   // adaptive_fee_control_factor
                &350000u32.to_le_bytes(),                 // max_volatility_accumulator
                &(tick_spacing / 2).to_le_bytes(),        // tick_group_size
                &(tick_spacing / 2).to_le_bytes(),        // major_swap_threshold_ticks
                &[0_u8; 128],
            ]
            .concat(),
            owner: WHIRLPOOL_ID,
            executable: false,
            rent_epoch: 0,
        },
    ));

    accounts
}

pub async fn setup_whirlpool(
    ctx: &RpcContext,
    token_a: &Pubkey,
    token_b: &Pubkey,
    tick_spacing: u16,
    initial_sqrt_price: u128,
    adaptive_fee: bool,
) -> Result<Pubkey, Box<dyn Error>> {
    let account_infos = ctx.rpc.get_multiple_accounts(&[*token_a, *token_b])?;
    let mint_a_info = account_infos[0].as_ref().ok_or(format!("Mint {} not found", token_a))?;
    let token_program_a = mint_a_info.owner;
    let mint_b_info = account_infos[1].as_ref().ok_or(format!("Mint {} not found", token_b))?;
    let token_program_b = mint_b_info.owner;

    let pool_address = get_whirlpool_address(&*WHIRLPOOLS_CONFIG_ADDRESS.try_lock()?, &token_a, &token_b, tick_spacing)?.0;
    let fee_tier_index = if adaptive_fee { 1024 + tick_spacing } else { tick_spacing };
    let fee_tier = get_fee_tier_address(&*WHIRLPOOLS_CONFIG_ADDRESS.try_lock()?, fee_tier_index)?.0;
    let token_badge_a = get_token_badge_address(&*WHIRLPOOLS_CONFIG_ADDRESS.try_lock()?, &token_a)?.0;
    let token_badge_b = get_token_badge_address(&*WHIRLPOOLS_CONFIG_ADDRESS.try_lock()?, &token_b)?.0;
    let oracle = get_oracle_address(&pool_address)?.0;

    let token_vault_a = ctx.get_next_keypair();
    let token_vault_b = ctx.get_next_keypair();

    let mut instructions = vec![];

    if adaptive_fee {
        instructions.push(
            InitializePoolWithAdaptiveFee {
                whirlpools_config: *WHIRLPOOLS_CONFIG_ADDRESS.try_lock()?,
                token_mint_a: *token_a,
                token_mint_b: *token_b,
                token_badge_a,
                token_badge_b,
                funder: ctx.signer.pubkey(),
                initialize_pool_authority: ctx.signer.pubkey(),
                whirlpool: pool_address,
                adaptive_fee_tier: fee_tier,
                oracle,
                token_vault_a: token_vault_a.pubkey(),
                token_vault_b: token_vault_b.pubkey(),
                token_program_a,
                token_program_b,
                system_program: system_program::id(),
                rent: sysvar::rent::ID,
            }
            .instruction(InitializePoolWithAdaptiveFeeInstructionArgs {
                initial_sqrt_price,
                trade_enable_timestamp: None,
            }),
        );
    } else {
        instructions.push(
            InitializePoolV2 {
                whirlpools_config: *WHIRLPOOLS_CONFIG_ADDRESS.try_lock()?,
                token_mint_a: *token_a,
                token_mint_b: *token_b,
                token_badge_a,
                token_badge_b,
                funder: ctx.signer.pubkey(),
                whirlpool: pool_address,
                token_vault_a: token_vault_a.pubkey(),
                token_vault_b: token_vault_b.pubkey(),
                fee_tier,
                token_program_a,
                token_program_b,
                system_program: system_program::id(),
                rent: sysvar::rent::ID,
            }
            .instruction(InitializePoolV2InstructionArgs {
                initial_sqrt_price,
                tick_spacing,
            }),
        );
    }

    ctx.send_transaction_with_signers(instructions, vec![&token_vault_a, &token_vault_b])?;

    Ok(pool_address)
}

pub async fn swap_exact_in(
    ctx: &RpcContext,
    whirlpool_address: &Pubkey,
    input_amount: u64,
    mint_address: &Pubkey,
    slippage_tolerance_bps: Option<u16>,
) -> Result<Signature, Box<dyn Error>> {
    ctx.send_transaction(
        swap_instructions(
            ctx.rpc.get_inner_client(),
            *whirlpool_address,
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
