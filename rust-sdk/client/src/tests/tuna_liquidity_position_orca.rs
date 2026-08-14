#[cfg(test)]
mod tests {
    use crate::accounts::{fetch_all_vault, fetch_market, fetch_tuna_config, fetch_tuna_lp_position};
    use crate::instructions::{CreateMarketInstructionArgs, OpenTunaLpPositionOrcaInstructionArgs};
    use crate::tests::orca::swap_exact_in;
    use crate::tests::*;
    use crate::types::MarketMaker;
    use crate::{
        close_active_tuna_lp_position_orca_instructions, close_tuna_lp_position_orca_instruction, collect_and_compound_fees_orca_instructions,
        decrease_tuna_lp_position_orca_instructions, get_tuna_config_address, get_tuna_liquidity_position_address, get_vault_address,
        increase_tuna_lp_position_orca_instructions, liquidate_tuna_lp_position_orca_instructions,
        open_and_increase_tuna_lp_position_orca_instructions, open_tuna_lp_position_orca_instruction, rebalance_tuna_lp_position_orca_instructions,
        CloseActiveTunaLpPositionArgs, DecreaseTunaLpPositionArgs, IncreaseTunaLpPositionArgs, OpenAndIncreaseTunaLpPositionArgs, HUNDRED_PERCENT,
        LEVERAGE_ONE, TUNA_POSITION_FLAGS_ALLOW_REBALANCING,
    };
    use orca_whirlpools_client::fetch_whirlpool;
    use serial_test::serial;
    use solana_keypair::Keypair;
    use solana_program_test::tokio;
    use solana_signer::Signer;

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
            borrow_limit_a: u64::MAX,
            borrow_limit_b: u64::MAX,
            unused: 0,
            rebalance_protocol_fee: 0,
            spot_position_size_limit_a: 1000_000_000_000,
            spot_position_size_limit_b: 100000_000_000,
        }
    }

    #[test]
    #[serial]
    fn test_open_add_remove_liquidity_and_close_position() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let signer = Keypair::new();
            let ctx = RpcContext::new(&signer, orca::get_whirlpool_config_accounts(&signer.pubkey())).await;
            let test_market = setup_test_market(&ctx, test_market_args(), MarketMaker::Orca, TestMarketArgs::default())
                .await
                .unwrap();

            let pool = fetch_whirlpool(&ctx.rpc, &test_market.pool).unwrap();

            let position_mint = Keypair::new();
            let actual_tick_index = pool.data.tick_current_index - (pool.data.tick_current_index % pool.data.tick_spacing as i32);

            ctx.send_transaction_with_signers(
                vec![open_tuna_lp_position_orca_instruction(
                    &ctx.rpc,
                    &ctx.signer.pubkey(),
                    &position_mint.pubkey(),
                    &test_market.pool,
                    OpenTunaLpPositionOrcaInstructionArgs {
                        tick_lower_index: actual_tick_index - pool.data.tick_spacing as i32 * 5,
                        tick_upper_index: actual_tick_index + pool.data.tick_spacing as i32 * 5,
                        lower_limit_order_sqrt_price: 0,
                        upper_limit_order_sqrt_price: 0,
                        flags: 0,
                    },
                )
                .unwrap()],
                vec![&position_mint],
            )
            .unwrap();

            ctx.send_transaction(
                increase_tuna_lp_position_orca_instructions(
                    &ctx.rpc,
                    &ctx.signer.pubkey(),
                    &position_mint.pubkey(),
                    IncreaseTunaLpPositionArgs {
                        collateral_a: 1_000_000_000,
                        collateral_b: 100_000_000,
                        borrow_a: 1_000_000_000,
                        borrow_b: 100_000_000,
                        min_added_amount_a: 0,
                        min_added_amount_b: 0,
                    },
                )
                .unwrap(),
            )
            .unwrap();

            ctx.send_transaction(
                decrease_tuna_lp_position_orca_instructions(
                    &ctx.rpc,
                    &ctx.signer.pubkey(),
                    &position_mint.pubkey(),
                    DecreaseTunaLpPositionArgs::default(),
                )
                .unwrap(),
            )
            .unwrap();

            let tuna_position_address = get_tuna_liquidity_position_address(&position_mint.pubkey()).0;
            let tuna_position = fetch_tuna_lp_position(&ctx.rpc, &tuna_position_address).unwrap();

            ctx.send_transaction(vec![close_tuna_lp_position_orca_instruction(
                &ctx.signer.pubkey(),
                &tuna_position.data,
                &test_market.token_program_a,
                &test_market.token_program_b,
            )])
            .unwrap();
        });
    }

    #[test]
    #[serial]
    fn test_open_position_with_liquidity_and_close_with_liquidity() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let signer = Keypair::new();
            let ctx = RpcContext::new(&signer, orca::get_whirlpool_config_accounts(&signer.pubkey())).await;
            let test_market = setup_test_market(&ctx, test_market_args(), MarketMaker::Orca, TestMarketArgs::default())
                .await
                .unwrap();

            let pool = fetch_whirlpool(&ctx.rpc, &test_market.pool).unwrap();

            let actual_tick_index = pool.data.tick_current_index - (pool.data.tick_current_index % pool.data.tick_spacing as i32);

            let ix = open_and_increase_tuna_lp_position_orca_instructions(
                &ctx.rpc,
                &ctx.signer.pubkey(),
                &test_market.pool,
                OpenAndIncreaseTunaLpPositionArgs {
                    tick_lower_index: actual_tick_index - pool.data.tick_spacing as i32 * 5,
                    tick_upper_index: actual_tick_index + pool.data.tick_spacing as i32 * 5,
                    lower_limit_order_sqrt_price: 0,
                    upper_limit_order_sqrt_price: 0,
                    flags: 0,
                    collateral_a: 1_000_000_000,
                    collateral_b: 100_000_000,
                    borrow_a: 1_000_000_000,
                    borrow_b: 100_000_000,
                    min_added_amount_a: 0,
                    min_added_amount_b: 0,
                },
            )
            .unwrap();

            ctx.send_transaction_with_signers(ix.instructions, ix.additional_signers.iter().collect())
                .unwrap();

            ctx.send_transaction(
                close_active_tuna_lp_position_orca_instructions(
                    &ctx.rpc,
                    &ctx.signer.pubkey(),
                    &ix.position_mint,
                    CloseActiveTunaLpPositionArgs::default(),
                )
                .unwrap(),
            )
            .unwrap();
        });
    }

    #[test]
    #[serial]
    fn test_collect_and_compound_uses_market_vaults_for_shared_and_isolated_layouts() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let signer = Keypair::new();
            let ctx = RpcContext::new(&signer, orca::get_whirlpool_config_accounts(&signer.pubkey())).await;
            let test_market = setup_test_market(&ctx, test_market_args(), MarketMaker::Orca, TestMarketArgs::default())
                .await
                .unwrap();

            let pool = fetch_whirlpool(&ctx.rpc, &test_market.pool).unwrap();
            let position_mint = Keypair::new();
            let actual_tick_index = pool.data.tick_current_index - (pool.data.tick_current_index % pool.data.tick_spacing as i32);

            ctx.send_transaction_with_signers(
                vec![open_tuna_lp_position_orca_instruction(
                    &ctx.rpc,
                    &ctx.signer.pubkey(),
                    &position_mint.pubkey(),
                    &test_market.pool,
                    OpenTunaLpPositionOrcaInstructionArgs {
                        tick_lower_index: actual_tick_index - pool.data.tick_spacing as i32 * 5,
                        tick_upper_index: actual_tick_index + pool.data.tick_spacing as i32 * 5,
                        lower_limit_order_sqrt_price: 0,
                        upper_limit_order_sqrt_price: 0,
                        flags: 0,
                    },
                )
                .unwrap()],
                vec![&position_mint],
            )
            .unwrap();

            let instructions = collect_and_compound_fees_orca_instructions(&ctx.rpc, &ctx.signer.pubkey(), &position_mint.pubkey(), false).unwrap();
            let instruction = instructions.iter().find(|instruction| instruction.program_id == crate::TUNA_ID).unwrap();
            assert_eq!(instruction.accounts[5].pubkey, test_market.vault_a);
            assert_eq!(instruction.accounts[6].pubkey, test_market.vault_b);

            // Permissionless market creation currently supports Fusion only. Reuse valid Orca
            // accounts and model the equivalent isolated-vault layout directly through RPC.
            let tuna_position = fetch_tuna_lp_position(&ctx.rpc, &get_tuna_liquidity_position_address(&position_mint.pubkey()).0).unwrap();
            let tuna_config = fetch_tuna_config(&ctx.rpc, &get_tuna_config_address().0).unwrap();
            let market = fetch_market(&ctx.rpc, &test_market.market).unwrap();
            let vaults = fetch_all_vault(&ctx.rpc, &[test_market.vault_a, test_market.vault_b]).unwrap();
            let mint_accounts = ctx
                .rpc
                .get_multiple_accounts(&[test_market.mint_a_address, test_market.mint_b_address])
                .unwrap();

            let (isolated_vault_a_address, isolated_vault_a_bump) = get_vault_address(&test_market.mint_a_address, Some(&test_market.market));
            let (isolated_vault_b_address, isolated_vault_b_bump) = get_vault_address(&test_market.mint_b_address, Some(&test_market.market));
            let mut isolated_market = market.data.clone();
            isolated_market.vault_a = isolated_vault_a_address;
            isolated_market.vault_b = isolated_vault_b_address;
            isolated_market.authority = signer.pubkey();
            let mut isolated_vault_a = vaults[0].data.clone();
            isolated_vault_a.bump = [isolated_vault_a_bump];
            isolated_vault_a.authority = signer.pubkey();
            isolated_vault_a.market = test_market.market;
            let mut isolated_vault_b = vaults[1].data.clone();
            isolated_vault_b.bump = [isolated_vault_b_bump];
            isolated_vault_b.authority = signer.pubkey();
            isolated_vault_b.market = test_market.market;

            let isolated_ctx = RpcContext::new(
                &signer,
                vec![
                    (tuna_position.address, tuna_position.account),
                    (pool.address, pool.account),
                    (tuna_config.address, tuna_config.account),
                    (market.address, with_serialized_data(market.account, &isolated_market)),
                    (isolated_vault_a_address, with_serialized_data(vaults[0].account.clone(), &isolated_vault_a)),
                    (isolated_vault_b_address, with_serialized_data(vaults[1].account.clone(), &isolated_vault_b)),
                    (test_market.mint_a_address, mint_accounts[0].clone().unwrap()),
                    (test_market.mint_b_address, mint_accounts[1].clone().unwrap()),
                ],
            )
            .await;
            let instructions =
                collect_and_compound_fees_orca_instructions(&isolated_ctx.rpc, &isolated_ctx.signer.pubkey(), &position_mint.pubkey(), false)
                    .unwrap();
            let instruction = instructions.iter().find(|instruction| instruction.program_id == crate::TUNA_ID).unwrap();
            assert_eq!(instruction.accounts[5].pubkey, isolated_vault_a_address);
            assert_eq!(instruction.accounts[6].pubkey, isolated_vault_b_address);
        });
    }

    #[test]
    #[serial]
    fn test_rebalance_position() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let signer = Keypair::new();
            let ctx = RpcContext::new(&signer, orca::get_whirlpool_config_accounts(&signer.pubkey())).await;
            let test_market = setup_test_market(&ctx, test_market_args(), MarketMaker::Orca, TestMarketArgs::default())
                .await
                .unwrap();

            let pool = fetch_whirlpool(&ctx.rpc, &test_market.pool).unwrap();

            let actual_tick_index = pool.data.tick_current_index - (pool.data.tick_current_index % pool.data.tick_spacing as i32);

            let ix = open_and_increase_tuna_lp_position_orca_instructions(
                &ctx.rpc,
                &ctx.signer.pubkey(),
                &test_market.pool,
                OpenAndIncreaseTunaLpPositionArgs {
                    tick_lower_index: actual_tick_index - pool.data.tick_spacing as i32 * 5,
                    tick_upper_index: actual_tick_index + pool.data.tick_spacing as i32 * 5,
                    lower_limit_order_sqrt_price: 0,
                    upper_limit_order_sqrt_price: 0,
                    flags: TUNA_POSITION_FLAGS_ALLOW_REBALANCING,
                    collateral_a: 1_000_000_000,
                    collateral_b: 1_000_000,
                    borrow_a: 2_000_000_000,
                    borrow_b: 2_000_000,
                    min_added_amount_a: 0,
                    min_added_amount_b: 0,
                },
            )
            .unwrap();

            ctx.send_transaction_with_signers(ix.instructions, ix.additional_signers.iter().collect())
                .unwrap();

            swap_exact_in(&ctx, &pool.address, 100_000_000_000, &pool.data.token_mint_a, None)
                .await
                .unwrap();

            ctx.send_transaction(
                rebalance_tuna_lp_position_orca_instructions(&ctx.rpc, &ctx.signer.pubkey(), &ix.position_mint)
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
            let ctx = RpcContext::new(&signer, orca::get_whirlpool_config_accounts(&signer.pubkey())).await;
            let test_market = setup_test_market(&ctx, test_market_args(), MarketMaker::Orca, TestMarketArgs::default())
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
                },
            )
            .unwrap();

            ctx.send_transaction_with_signers(ix.instructions, ix.additional_signers.iter().collect())
                .unwrap();

            swap_exact_in(&ctx, &pool.address, 50000000000, &pool.data.token_mint_b, None)
                .await
                .unwrap();

            let tuna_position = fetch_tuna_lp_position(&ctx.rpc, &get_tuna_liquidity_position_address(&ix.position_mint).0).unwrap();
            let vaults = fetch_all_vault(
                &ctx.rpc,
                &[
                    get_vault_address(&test_market.mint_a_address, None).0,
                    get_vault_address(&test_market.mint_b_address, None).0,
                ],
            )
            .unwrap();

            ctx.send_transaction(liquidate_tuna_lp_position_orca_instructions(
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
                None,
            ))
            .unwrap();
        });
    }
}
