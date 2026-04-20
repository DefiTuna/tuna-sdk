use crate::instructions::{
    CreateMarketInstructionArgs, CreateMarketPermissionlessInstructionArgs, CreateVaultInstructionArgs, CreateVaultPermissionlessInstructionArgs,
    UpdateMarketInstructionArgs,
};
use crate::open_lending_position_v2::open_lending_position_v2_instruction;
use crate::tests::fusion::setup_fusion_pool;
use crate::tests::orca::setup_whirlpool;
use crate::tests::*;
use crate::types::MarketMaker;
use crate::{
    create_market_instruction, create_market_permissionless_instruction, create_tuna_config_instruction, create_vault_instructions,
    create_vault_permissionless_instructions, deposit_instruction, get_lending_position_address, get_market_address, get_vault_address,
    open_lending_position_instruction, update_market_instruction,
};
use fusionamm_sdk::PriceOrTickIndex;
use orca_whirlpools_core::price_to_sqrt_price;
use solana_pubkey::Pubkey;
use solana_signer::Signer;
use spl_token_2022::state::Mint;
use std::error::Error;

pub struct TestMarket {
    pub market_maker: MarketMaker,
    pub mint_a: Mint,
    pub mint_b: Mint,
    pub mint_a_address: Pubkey,
    pub mint_b_address: Pubkey,
    pub token_program_a: Pubkey,
    pub token_program_b: Pubkey,
    pub reward_mint0: Option<Pubkey>,
    pub reward_mint1: Option<Pubkey>,
    pub ata_a: Pubkey,
    pub ata_b: Pubkey,
    pub pool: Pubkey,
    pub vault_a: Pubkey,
    pub vault_b: Pubkey,
    pub vault_a_ata: Pubkey,
    pub vault_b_ata: Pubkey,
    pub lending_position_a: Pubkey,
    pub lending_position_b: Pubkey,
    pub market: Pubkey,
}

#[derive(Default)]
pub struct TestMarketArgs {
    pub mint_a_is_native: bool,
    pub initialize_rewards: bool,
    pub adaptive_fee: bool,
    pub permissionless: bool,
}

pub async fn setup_test_market(
    ctx: &RpcContext,
    args: CreateMarketInstructionArgs,
    market_maker: MarketMaker,
    setup_args: TestMarketArgs,
) -> Result<TestMarket, Box<dyn Error>> {
    //let lending_position_a_amount = 1000_000_000_000;
    //let lending_position_b_amount = 100000_000_000;

    let mint_a_address = if setup_args.mint_a_is_native {
        spl_token::native_mint::ID
    } else {
        setup_mint(ctx, 9).await?
    };
    let mint_b_address = setup_mint_te(ctx, 6, &[]).await?;

    let all_mints = [mint_a_address, mint_b_address];
    let all_token_programs = [spl_token::ID, spl_token_2022::ID];

    let mint_a = fetch_mint(ctx, &mint_a_address).await?;
    let mint_b = fetch_mint(ctx, &mint_b_address).await?;

    let ata_a = setup_ata(ctx, &mint_a_address, 10000_000_000_000).await?;
    let ata_b = setup_ata_te(
        ctx,
        &mint_b_address,
        Some(SetupAtaConfig {
            amount: Some(1000000_000_000),
        }),
    )
    .await?;

    ctx.send_transaction(vec![create_tuna_config_instruction(
        &ctx.signer.pubkey(),
        &ctx.signer.pubkey(),
        &ctx.signer.pubkey(),
        &ctx.signer.pubkey(),
        &ctx.signer.pubkey(),
        &ctx.signer.pubkey(),
    )])?;

    let initial_sqrt_price = price_to_sqrt_price(200.0, 9, 6);
    let pool: Pubkey;

    if market_maker == MarketMaker::Orca {
        assert!(!setup_args.initialize_rewards, "Rewards initialization is not yet implemented in tuna tests");

        pool = setup_whirlpool(ctx, &mint_a_address, &mint_b_address, 64, initial_sqrt_price, setup_args.adaptive_fee).await?;

        let open_position_result = orca_whirlpools::open_position_instructions(
            &ctx.rpc.get_inner_client(),
            pool,
            20.0,
            2000.0,
            orca_whirlpools::IncreaseLiquidityParam::Liquidity(1_000_000_000_000),
            None,
            Some(ctx.signer.pubkey()),
        )
        .await?;
        ctx.send_transaction_with_signers(open_position_result.instructions, open_position_result.additional_signers.iter().collect())?;
    } else {
        assert!(!setup_args.initialize_rewards, "Rewards are not supported by Fusion pools");
        assert!(!setup_args.adaptive_fee, "Adaptive fee is not supported by Fusion pools");

        pool = setup_fusion_pool(ctx, &mint_a_address, &mint_b_address, 64, initial_sqrt_price).await?;

        let open_position_result = fusionamm_sdk::open_position_instructions(
            &ctx.rpc.get_inner_client(),
            pool,
            PriceOrTickIndex::Price(20.0),
            PriceOrTickIndex::Price(2000.0),
            fusionamm_sdk::IncreaseLiquidityParam::Liquidity(1_000_000_000_000),
            None,
            Some(ctx.signer.pubkey()),
        )
        .await?;
        ctx.send_transaction_with_signers(open_position_result.instructions, open_position_result.additional_signers.iter().collect())?;
    }

    let market_address = get_market_address(&pool).0;

    let all_deposits = [1000000000000_u64, 100000000000_u64];

    for ((mint_address, token_program), deposit_amount) in all_mints.iter().zip(all_token_programs.iter()).zip(all_deposits.iter()) {
        let instructions = if setup_args.permissionless {
            let vault_address = get_vault_address(&mint_address, Some(&market_address)).0;
            let mut instructions = create_vault_permissionless_instructions(
                &ctx.signer.pubkey(),
                &mint_address,
                &token_program,
                &market_address,
                CreateVaultPermissionlessInstructionArgs {
                    market: market_address,
                    interest_rate: 3655890108,
                },
            );
            instructions.push(open_lending_position_v2_instruction(&ctx.signer.pubkey(), &mint_address, &vault_address));
            instructions.push(deposit_instruction(&ctx.signer.pubkey(), &mint_address, &token_program, Some(&vault_address), *deposit_amount));
            instructions
        } else {
            let mut instructions = create_vault_instructions(
                &ctx.signer.pubkey(),
                &mint_address,
                &token_program,
                CreateVaultInstructionArgs {
                    interest_rate: 3655890108,
                    supply_limit: u64::MAX,
                    oracle_price_update: Default::default(),
                    pyth_oracle_feed_id: Default::default(),
                    allow_unsafe_token_extensions: true,
                },
            );
            instructions.push(open_lending_position_instruction(&ctx.signer.pubkey(), &mint_address));
            instructions.push(deposit_instruction(&ctx.signer.pubkey(), &mint_address, &token_program, None, *deposit_amount));
            instructions
        };

        ctx.send_transaction(instructions)?;
    }

    let vault_a_address = get_vault_address(&mint_a_address, if setup_args.permissionless { Some(&market_address) } else { None }).0;
    let vault_b_address = get_vault_address(&mint_b_address, if setup_args.permissionless { Some(&market_address) } else { None }).0;

    let instructions = if setup_args.permissionless {
        vec![
            create_market_permissionless_instruction(
                &ctx.signer.pubkey(),
                &pool,
                &vault_a_address,
                &vault_b_address,
                CreateMarketPermissionlessInstructionArgs {
                    address_lookup_table: args.address_lookup_table,
                },
            ),
            update_market_instruction(
                &ctx.signer.pubkey(),
                &pool,
                UpdateMarketInstructionArgs {
                    address_lookup_table: args.address_lookup_table,
                    max_leverage: args.max_leverage,
                    protocol_fee: args.protocol_fee,
                    protocol_fee_on_collateral: args.protocol_fee_on_collateral,
                    liquidation_fee: args.liquidation_fee,
                    liquidation_threshold: args.liquidation_threshold,
                    oracle_price_deviation_threshold: args.oracle_price_deviation_threshold,
                    disabled: args.disabled,
                    borrow_limit_a: args.borrow_limit_a,
                    borrow_limit_b: args.borrow_limit_b,
                    max_swap_slippage: args.max_swap_slippage,
                    rebalance_protocol_fee: args.rebalance_protocol_fee,
                    spot_position_size_limit_a: args.spot_position_size_limit_a,
                    spot_position_size_limit_b: args.spot_position_size_limit_b,
                },
            ),
        ]
    } else {
        vec![create_market_instruction(
            &ctx.signer.pubkey(),
            &pool,
            &vault_a_address,
            &vault_b_address,
            args.clone(),
        )]
    };

    ctx.send_transaction(instructions)?;

    let lending_position_a = get_lending_position_address(&ctx.signer.pubkey(), &mint_a_address).0;
    let lending_position_b = get_lending_position_address(&ctx.signer.pubkey(), &mint_b_address).0;

    Ok(TestMarket {
        market_maker,
        mint_a,
        mint_b,
        mint_a_address,
        mint_b_address,
        token_program_a: all_token_programs[0],
        token_program_b: all_token_programs[1],
        reward_mint0: None,
        reward_mint1: None,
        ata_a,
        ata_b,
        pool,
        vault_a: vault_a_address,
        vault_b: vault_b_address,
        vault_a_ata: Default::default(),
        vault_b_ata: Default::default(),
        lending_position_a,
        lending_position_b,
        market: market_address,
    })
}
