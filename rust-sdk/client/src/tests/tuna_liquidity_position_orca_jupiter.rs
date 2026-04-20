#[cfg(test)]
mod tests {
    use crate::accounts::{fetch_all_vault, fetch_tuna_config, fetch_tuna_lp_position};
    use crate::instructions::CreateMarketInstructionArgs;
    use crate::tests::orca::swap_exact_in;
    use crate::tests::*;
    use crate::types::MarketMaker;
    use crate::utils::orca::get_swap_tick_arrays;
    use crate::{
        get_tuna_config_address, get_tuna_liquidity_position_address, liquidate_tuna_lp_position_orca_jupiter_instructions,
        open_and_increase_tuna_lp_position_orca_instructions, LiquidateTunaLpPositionJupiterArgs, OpenAndIncreaseTunaLpPositionArgs, HUNDRED_PERCENT,
        JUPITER_EVENT_AUTHORITY, JUPITER_PROGRAM_ID, LEVERAGE_ONE,
    };
    use jupiter_solana_client::instructions::{RouteV2, RouteV2InstructionArgs};
    use jupiter_solana_client::types::{AccountsType, RemainingAccountsInfo, RemainingAccountsSlice, RoutePlanStepV2, Swap};
    use orca_whirlpools_client::{fetch_whirlpool, get_oracle_address, Whirlpool};
    use serial_test::serial;
    use solana_instruction::AccountMeta;
    use solana_keypair::Keypair;
    use solana_program_test::tokio;
    use solana_pubkey::Pubkey;
    use solana_signer::Signer;
    use spl_associated_token_account::get_associated_token_address_with_program_id;

    fn test_market_args() -> CreateMarketInstructionArgs {
        CreateMarketInstructionArgs {
            address_lookup_table: Default::default(),
            max_leverage: (LEVERAGE_ONE * 1020) / 100,
            protocol_fee: 1000,                                    // 0.1%
            protocol_fee_on_collateral: 1000,                      // 0.1%
            liquidation_fee: 10000,                                // 1%
            liquidation_threshold: 920000,                         // 92%
            oracle_price_deviation_threshold: HUNDRED_PERCENT / 2, // Allow large deviation for tests
            disabled: false,
            borrow_limit_a: 0,
            borrow_limit_b: 0,
            max_swap_slippage: 0,
            rebalance_protocol_fee: 0,
            spot_position_size_limit_a: 1000_000_000_000,
            spot_position_size_limit_b: 100000_000_000,
        }
    }

    fn get_route_accounts(
        market: &TestMarket,
        whirlpool: &Whirlpool,
        whirlpool_address: &Pubkey,
        tuna_position_address: &Pubkey,
    ) -> [AccountMeta; 18] {
        let oracle_address = get_oracle_address(&whirlpool_address).unwrap().0;
        let swap_ticks_arrays = get_swap_tick_arrays(whirlpool.tick_current_index, whirlpool.tick_spacing, &whirlpool_address);

        let tuna_position_ata_a =
            get_associated_token_address_with_program_id(tuna_position_address, &market.mint_a_address, &market.token_program_a);
        let tuna_position_ata_b =
            get_associated_token_address_with_program_id(tuna_position_address, &market.mint_b_address, &market.token_program_b);

        [
            AccountMeta::new(orca_whirlpools_client::ID, false),
            AccountMeta::new(market.token_program_a, false),
            AccountMeta::new(market.token_program_b, false),
            AccountMeta::new(spl_memo::ID, false),
            AccountMeta::new(*tuna_position_address, false),
            AccountMeta::new(*whirlpool_address, false),
            AccountMeta::new(market.mint_a_address, false),
            AccountMeta::new(market.mint_b_address, false),
            AccountMeta::new(tuna_position_ata_a, false),
            AccountMeta::new(whirlpool.token_vault_a, false),
            AccountMeta::new(tuna_position_ata_b, false),
            AccountMeta::new(whirlpool.token_vault_b, false),
            AccountMeta::new(swap_ticks_arrays[0], false),
            AccountMeta::new(swap_ticks_arrays[1], false),
            AccountMeta::new(swap_ticks_arrays[2], false),
            AccountMeta::new(oracle_address, false),
            AccountMeta::new(swap_ticks_arrays[3], false),
            AccountMeta::new(swap_ticks_arrays[4], false),
        ]
    }

    #[test]
    #[serial]
    fn test_liquidate_position() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let signer = Keypair::new();
            let ctx = RpcContext::new(&signer, orca::get_whirlpool_config_accounts(&signer.pubkey())).await;
            let test_market = setup_test_market(
                &ctx,
                test_market_args(),
                MarketMaker::Orca,
                TestMarketArgs {
                    permissionless: false,
                    ..TestMarketArgs::default()
                },
            )
            .await
            .unwrap();

            let pool = fetch_whirlpool(&ctx.rpc, &test_market.pool).unwrap();
            let tuna_config = fetch_tuna_config(&ctx.rpc, &get_tuna_config_address().0).unwrap();

            let actual_tick_index = pool.data.tick_current_index - (pool.data.tick_current_index % pool.data.tick_spacing as i32);

            let ix = open_and_increase_tuna_lp_position_orca_instructions(
                &ctx.rpc,
                &ctx.signer.pubkey(),
                &test_market.pool,
                OpenAndIncreaseTunaLpPositionArgs {
                    tick_lower_index: actual_tick_index - pool.data.tick_spacing as i32 * 3,
                    tick_upper_index: actual_tick_index + pool.data.tick_spacing as i32 * 3,
                    lower_limit_order_sqrt_price: 0,
                    upper_limit_order_sqrt_price: 0,
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

            let tuna_position = fetch_tuna_lp_position(&ctx.rpc, &get_tuna_liquidity_position_address(&ix.position_mint).0).unwrap();
            let vaults = fetch_all_vault(&ctx.rpc, &[test_market.vault_a, test_market.vault_b]).unwrap();

            let tuna_position_ata_a =
                get_associated_token_address_with_program_id(&tuna_position.address, &test_market.mint_a_address, &test_market.token_program_a);
            let tuna_position_ata_b =
                get_associated_token_address_with_program_id(&tuna_position.address, &test_market.mint_b_address, &test_market.token_program_b);

            let route_accounts = get_route_accounts(&test_market, &pool.data, &pool.address, &tuna_position.address);

            let route_ix_builder = RouteV2 {
                user_transfer_authority: tuna_position.address,
                user_source_token_account: tuna_position_ata_b,
                user_destination_token_account: tuna_position_ata_a,
                destination_token_account: None,
                source_mint: tuna_position.data.mint_b,
                destination_mint: test_market.mint_a_address,
                source_token_program: spl_token::ID,
                event_authority: JUPITER_EVENT_AUTHORITY,
                program: JUPITER_PROGRAM_ID,
                destination_token_program: spl_token::ID,
            };

            let a_to_b = false;
            let in_amount = 1005231667 - 10052316;

            let mut route_ix = route_ix_builder.instruction_with_remaining_accounts(
                RouteV2InstructionArgs {
                    route_plan: vec![RoutePlanStepV2 {
                        swap: Swap::WhirlpoolSwapV2 {
                            a_to_b,
                            remaining_accounts_info: Some(RemainingAccountsInfo {
                                slices: vec![RemainingAccountsSlice {
                                    accounts_type: AccountsType::SupplementalTickArrays,
                                    length: 2,
                                }],
                            }),
                        },
                        bps: 10000,
                        input_index: 0,
                        output_index: 1,
                    }],
                    in_amount,
                    quoted_out_amount: 0,
                    slippage_bps: 0,
                    platform_fee_bps: 0,
                    positive_slippage_bps: 0,
                },
                &route_accounts,
            );

            route_ix.accounts[0].is_signer = false;

            ctx.send_transaction(liquidate_tuna_lp_position_orca_jupiter_instructions(
                &ctx.signer.pubkey(),
                &tuna_position.data,
                &tuna_config.data,
                &vaults[0].address,
                &vaults[0].data,
                &vaults[1].address,
                &vaults[1].data,
                &pool.data,
                &test_market.token_program_a,
                &test_market.token_program_b,
                route_ix.accounts,
                vec![],
                LiquidateTunaLpPositionJupiterArgs {
                    decrease_percent: HUNDRED_PERCENT,
                    jupiter_route_data: route_ix.data,
                },
            ))
            .unwrap();
        });
    }
}
