#[cfg(test)]
mod tests {
    use crate::accounts::{fetch_all_vault, fetch_tuna_config, fetch_tuna_position, TunaConfig};
    use crate::instructions::{CreateMarketInstructionArgs, OpenPositionFusionInstructionArgs};
    use crate::tests::fusion::swap_exact_in;
    use crate::tests::*;
    use crate::types::MarketMaker;
    use crate::{
        add_liquidity_fusion_instructions, close_position_fusion_instruction, close_position_with_liquidity_fusion_instructions,
        get_tuna_config_address, get_tuna_position_address, get_vault_address, liquidate_position_fusion_instructions,
        open_position_fusion_instruction, open_position_with_liquidity_fusion_instructions, rebalance_position_fusion_instructions,
        remove_liquidity_fusion_instructions, AddLiquidityArgs, ClosePositionWithLiquidityArgs, OpenPositionWithLiquidityArgs, RemoveLiquidityArgs,
        HUNDRED_PERCENT, LEVERAGE_ONE, TUNA_POSITION_FLAGS_ALLOW_REBALANCING,
    };
    use fusionamm_client::fetch_fusion_pool;
    use serial_test::serial;
    use solana_keypair::Keypair;
    use solana_program_test::tokio;
    use solana_signer::Signer;

    fn test_market_args() -> CreateMarketInstructionArgs {
        CreateMarketInstructionArgs {
            market_maker: MarketMaker::Fusion,
            address_lookup_table: Default::default(),
            max_leverage: (LEVERAGE_ONE * 1020) / 100,
            protocol_fee: 1000,                                    // 0.1%
            protocol_fee_on_collateral: 1000,                      // 0.1%
            limit_order_execution_fee: 1000,                       // 0.1%
            liquidation_fee: 10000,                                // 1%
            liquidation_threshold: 920000,                         // 92%
            oracle_price_deviation_threshold: HUNDRED_PERCENT / 2, // Allow large deviation for tests
            disabled: false,
            borrow_limit_a: 0,
            borrow_limit_b: 0,
            max_swap_slippage: 0,
            rebalance_protocol_fee: 0,
        }
    }

    #[test]
    #[serial]
    fn test_open_close_position() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let signer = Keypair::new();
            let ctx = RpcContext::new(&signer, fusion::get_fusion_pool_config_accounts(&signer.pubkey())).await;
            let test_market = setup_test_market(&ctx, test_market_args(), false, false, false).await.unwrap();

            let pool = fetch_fusion_pool(&ctx.rpc, &test_market.pool).unwrap();

            let position_mint = Keypair::new();
            let actual_tick_index = pool.data.tick_current_index - (pool.data.tick_current_index % pool.data.tick_spacing as i32);

            ctx.send_transaction_with_signers(
                vec![open_position_fusion_instruction(
                    &ctx.rpc,
                    &ctx.signer.pubkey(),
                    &position_mint.pubkey(),
                    &test_market.pool,
                    OpenPositionFusionInstructionArgs {
                        tick_lower_index: actual_tick_index - pool.data.tick_spacing as i32 * 5,
                        tick_upper_index: actual_tick_index + pool.data.tick_spacing as i32 * 5,
                        tick_stop_loss_index: 0,
                        tick_take_profit_index: 0,
                        flags: 0,
                    },
                )
                .unwrap()],
                vec![&position_mint],
            )
            .unwrap();

            ctx.send_transaction(
                add_liquidity_fusion_instructions(
                    &ctx.rpc,
                    &ctx.signer.pubkey(),
                    &position_mint.pubkey(),
                    AddLiquidityArgs {
                        collateral_a: 1_000_000_000,
                        collateral_b: 100_000_000,
                        borrow_a: 1_000_000_000,
                        borrow_b: 100_000_000,
                        min_added_amount_a: 0,
                        min_added_amount_b: 0,
                        max_swap_slippage: 0,
                    },
                )
                .unwrap(),
            )
            .unwrap();

            ctx.send_transaction(
                remove_liquidity_fusion_instructions(
                    &ctx.rpc,
                    &ctx.signer.pubkey(),
                    &position_mint.pubkey(),
                    RemoveLiquidityArgs {
                        withdraw_percent: HUNDRED_PERCENT,
                        swap_to_token: 0,
                        min_removed_amount_a: 0,
                        min_removed_amount_b: 0,
                        max_swap_slippage: 0,
                    },
                )
                .unwrap(),
            )
            .unwrap();

            let tuna_position_address = get_tuna_position_address(&position_mint.pubkey()).0;
            let tuna_position = fetch_tuna_position(&ctx.rpc, &tuna_position_address).unwrap();

            ctx.send_transaction(vec![close_position_fusion_instruction(
                &ctx.signer.pubkey(),
                &tuna_position.data,
                &test_market.token_program_a,
                &test_market.token_program_b,
            )])
            .unwrap();

            assert_eq!(test_market.mint_a.decimals, 9);
            assert_eq!(test_market.mint_b.decimals, 6);
        });
    }

    #[test]
    #[serial]
    fn test_open_position_with_liquidity_and_close_with_liquidity() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let signer = Keypair::new();
            let ctx = RpcContext::new(&signer, fusion::get_fusion_pool_config_accounts(&signer.pubkey())).await;
            let test_market = setup_test_market(&ctx, test_market_args(), false, false, false).await.unwrap();

            let pool = fetch_fusion_pool(&ctx.rpc, &test_market.pool).unwrap();

            let actual_tick_index = pool.data.tick_current_index - (pool.data.tick_current_index % pool.data.tick_spacing as i32);

            let ix = open_position_with_liquidity_fusion_instructions(
                &ctx.rpc,
                &ctx.signer.pubkey(),
                &test_market.pool,
                OpenPositionWithLiquidityArgs {
                    tick_lower_index: actual_tick_index - pool.data.tick_spacing as i32 * 5,
                    tick_upper_index: actual_tick_index + pool.data.tick_spacing as i32 * 5,
                    tick_stop_loss_index: 0,
                    tick_take_profit_index: 0,
                    flags: 0,
                    collateral_a: 1_000_000_000,
                    collateral_b: 100_000_000,
                    borrow_a: 1_000_000_000,
                    borrow_b: 100_000_000,
                    min_added_amount_a: 0,
                    min_added_amount_b: 0,
                    max_swap_slippage: 0,
                },
            )
            .unwrap();

            ctx.send_transaction_with_signers(ix.instructions, ix.additional_signers.iter().collect())
                .unwrap();

            ctx.send_transaction(
                close_position_with_liquidity_fusion_instructions(
                    &ctx.rpc,
                    &ctx.signer.pubkey(),
                    &ix.position_mint,
                    ClosePositionWithLiquidityArgs::default(),
                )
                .unwrap(),
            )
            .unwrap();
        });
    }

    #[test]
    #[serial]
    fn test_rebalance_position() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let signer = Keypair::new();
            let ctx = RpcContext::new(&signer, fusion::get_fusion_pool_config_accounts(&signer.pubkey())).await;
            let test_market = setup_test_market(&ctx, test_market_args(), false, false, false).await.unwrap();

            let pool = fetch_fusion_pool(&ctx.rpc, &test_market.pool).unwrap();

            let actual_tick_index = pool.data.tick_current_index - (pool.data.tick_current_index % pool.data.tick_spacing as i32);

            let ix = open_position_with_liquidity_fusion_instructions(
                &ctx.rpc,
                &ctx.signer.pubkey(),
                &test_market.pool,
                OpenPositionWithLiquidityArgs {
                    tick_lower_index: actual_tick_index - pool.data.tick_spacing as i32 * 5,
                    tick_upper_index: actual_tick_index + pool.data.tick_spacing as i32 * 5,
                    tick_stop_loss_index: 0,
                    tick_take_profit_index: 0,
                    flags: TUNA_POSITION_FLAGS_ALLOW_REBALANCING,
                    collateral_a: 1_000_000_000,
                    collateral_b: 1_000_000,
                    borrow_a: 2_000_000_000,
                    borrow_b: 2_000_000,
                    min_added_amount_a: 0,
                    min_added_amount_b: 0,
                    max_swap_slippage: 0,
                },
            )
            .unwrap();

            ctx.send_transaction_with_signers(ix.instructions, ix.additional_signers.iter().collect())
                .unwrap();

            swap_exact_in(&ctx, &pool.address, 100_000_000_000, &pool.data.token_mint_a, None)
                .await
                .unwrap();

            ctx.send_transaction(
                rebalance_position_fusion_instructions(&ctx.rpc, &ctx.signer.pubkey(), &ix.position_mint)
                    .unwrap()
                    .instructions,
            )
            .unwrap();
        });
    }

    #[test]
    #[serial]
    fn test_liquidate_position() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let signer = Keypair::new();
            let ctx = RpcContext::new(&signer, fusion::get_fusion_pool_config_accounts(&signer.pubkey())).await;
            let test_market = setup_test_market(&ctx, test_market_args(), false, false, false).await.unwrap();

            let pool = fetch_fusion_pool(&ctx.rpc, &test_market.pool).unwrap();
            let tuna_config = fetch_tuna_config(&ctx.rpc, &get_tuna_config_address().0).unwrap();

            let actual_tick_index = pool.data.tick_current_index - (pool.data.tick_current_index % pool.data.tick_spacing as i32);

            let ix = open_position_with_liquidity_fusion_instructions(
                &ctx.rpc,
                &ctx.signer.pubkey(),
                &test_market.pool,
                OpenPositionWithLiquidityArgs {
                    tick_lower_index: actual_tick_index - pool.data.tick_spacing as i32 * 3,
                    tick_upper_index: actual_tick_index + pool.data.tick_spacing as i32 * 3,
                    tick_stop_loss_index: 0,
                    tick_take_profit_index: 0,
                    flags: 0,
                    collateral_a: 1_000_000_000,
                    collateral_b: 0,
                    borrow_a: 4_000_000_000,
                    borrow_b: 0,
                    min_added_amount_a: 0,
                    min_added_amount_b: 0,
                    max_swap_slippage: 0,
                },
            )
            .unwrap();

            ctx.send_transaction_with_signers(ix.instructions, ix.additional_signers.iter().collect())
                .unwrap();

            swap_exact_in(&ctx, &pool.address, 50000000000, &pool.data.token_mint_b, None)
                .await
                .unwrap();

            let tuna_position = fetch_tuna_position(&ctx.rpc, &get_tuna_position_address(&ix.position_mint).0).unwrap();
            let vaults = fetch_all_vault(
                &ctx.rpc,
                &[
                    get_vault_address(&test_market.mint_a_address).0,
                    get_vault_address(&test_market.mint_b_address).0,
                ],
            )
            .unwrap();

            ctx.send_transaction(liquidate_position_fusion_instructions(
                &ctx.signer.pubkey(),
                &tuna_position.data,
                &tuna_config.data,
                &vaults[0].data,
                &vaults[1].data,
                &pool.data,
                &test_market.token_program_a,
                &test_market.token_program_b,
                HUNDRED_PERCENT,
            ))
            .unwrap();
        });
    }
}
