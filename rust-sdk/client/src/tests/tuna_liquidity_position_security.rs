#[cfg(test)]
mod tests {
    use crate::accounts::{fetch_all_vault, fetch_market, fetch_tuna_config, fetch_tuna_lp_position};
    use crate::instructions::CreateMarketInstructionArgs;
    use crate::tests::*;
    use crate::types::MarketMaker;
    use crate::{
        get_tuna_config_address, get_tuna_liquidity_position_address, liquidate_tuna_lp_position_orca_instructions,
        open_and_increase_tuna_lp_position_orca_instructions, OpenAndIncreaseTunaLpPositionArgs, HUNDRED_PERCENT, LEVERAGE_ONE,
    };
    use orca_whirlpools_client::fetch_whirlpool;
    use serial_test::serial;
    use solana_instruction::Instruction;
    use solana_keypair::Keypair;
    use solana_program_test::tokio;
    use solana_pubkey::Pubkey;
    use solana_signer::Signer;
    use spl_associated_token_account::get_associated_token_address_with_program_id;
    use std::error::Error;

    /// Anchor custom error offset (6000) + `ErrorCode::OracleStalePrice` (618).
    const ORACLE_STALE_PRICE: &[&str] = &["0x19da", "6618"];
    /// Anchor custom error offset (6000) + `ErrorCode::OraclePriceDeviationThresholdExceeded` (619).
    const ORACLE_PRICE_DEVIATION_THRESHOLD_EXCEEDED: &[&str] = &["0x19db", "6619"];
    const STRICT_ORACLE_DEVIATION_THRESHOLD: u32 = HUNDRED_PERCENT * 3 / 100;
    const ACCEPTED_LP_ORACLE_AGES_SECONDS: [i64; 2] = [131, 260];
    const STALE_LP_ORACLE_AGE_SECONDS: i64 = 261;

    struct LpLimitOrderFixture {
        test_market: TestMarket,
        position_mint: Pubkey,
        initial_sqrt_price: u128,
        manipulated_sqrt_price: u128,
    }

    fn strict_test_market_args() -> CreateMarketInstructionArgs {
        CreateMarketInstructionArgs {
            address_lookup_table: Default::default(),
            max_leverage: (LEVERAGE_ONE * 1020) / 100,
            protocol_fee: 1000,
            protocol_fee_on_collateral: 1000,
            liquidation_fee: 10000,
            liquidation_threshold: 920000,
            oracle_price_deviation_threshold: STRICT_ORACLE_DEVIATION_THRESHOLD,
            disabled: false,
            borrow_limit_a: u64::MAX,
            borrow_limit_b: u64::MAX,
            unused: 0,
            rebalance_protocol_fee: 0,
            spot_position_size_limit_a: 1000_000_000_000,
            spot_position_size_limit_b: 100000_000_000,
        }
    }

    fn assert_custom_error(result: Result<solana_signature::Signature, Box<dyn Error>>, codes: &[&str], what: &str) {
        let err = result.expect_err(what);
        let err_str = err.to_string();
        assert!(codes.iter().any(|code| err_str.contains(code)), "expected one of {codes:?} ({what}), got: {err_str}");
    }

    fn writable_accounts(instructions: &[Instruction], fee_payer: Pubkey) -> Vec<Pubkey> {
        let mut addresses = instructions
            .iter()
            .flat_map(|instruction| instruction.accounts.iter())
            .filter(|account| account.is_writable && account.pubkey != fee_payer)
            .map(|account| account.pubkey)
            .collect::<Vec<_>>();
        addresses.sort_unstable();
        addresses.dedup();
        addresses
    }

    async fn setup_solvent_reached_limit_order(ctx: &RpcContext) -> LpLimitOrderFixture {
        let test_market = setup_test_market(ctx, strict_test_market_args(), MarketMaker::Orca, TestMarketArgs::default())
            .await
            .unwrap();
        let pool = fetch_whirlpool(&ctx.rpc, &test_market.pool).unwrap();
        let initial_sqrt_price = pool.data.sqrt_price;
        configure_tuna_oracles(ctx, &test_market, initial_sqrt_price);

        let actual_tick_index = pool.data.tick_current_index - (pool.data.tick_current_index % pool.data.tick_spacing as i32);
        let stop_loss_sqrt_price = initial_sqrt_price / 100 * 99;
        let open = open_and_increase_tuna_lp_position_orca_instructions(
            &ctx.rpc,
            &ctx.signer.pubkey(),
            &test_market.pool,
            OpenAndIncreaseTunaLpPositionArgs {
                tick_lower_index: actual_tick_index - pool.data.tick_spacing as i32 * 5,
                tick_upper_index: actual_tick_index + pool.data.tick_spacing as i32 * 5,
                lower_limit_order_sqrt_price: stop_loss_sqrt_price,
                upper_limit_order_sqrt_price: u128::MAX,
                flags: 0,
                collateral_a: 1_000_000_000,
                collateral_b: 100_000_000,
                borrow_a: 0,
                borrow_b: 0,
                min_added_amount_a: 0,
                min_added_amount_b: 0,
            },
        )
        .unwrap();
        ctx.send_transaction_with_signers(open.instructions, open.additional_signers.iter().collect())
            .unwrap();

        orca::swap_exact_in(ctx, &pool.address, 500_000_000_000, &pool.data.token_mint_a, None)
            .await
            .unwrap();
        let manipulated_sqrt_price = fetch_whirlpool(&ctx.rpc, &test_market.pool).unwrap().data.sqrt_price;
        assert!(manipulated_sqrt_price <= stop_loss_sqrt_price, "the solvent LP stop-loss must be reached");

        let tuna_position = fetch_tuna_lp_position(&ctx.rpc, &get_tuna_liquidity_position_address(&open.position_mint).0).unwrap();
        let market = fetch_market(&ctx.rpc, &test_market.market).unwrap();
        let vaults = fetch_all_vault(&ctx.rpc, &[test_market.vault_a, test_market.vault_b]).unwrap();
        assert_eq!((tuna_position.data.loan_shares_a, tuna_position.data.loan_shares_b), (0, 0));
        assert!(
            tuna_position
                .data
                .is_healthy(manipulated_sqrt_price, &market.data, &vaults[0].data, &vaults[1].data)
                .unwrap()
                .0,
            "the reached LP limit order must remain solvent and healthy"
        );

        LpLimitOrderFixture {
            test_market,
            position_mint: open.position_mint,
            initial_sqrt_price,
            manipulated_sqrt_price,
        }
    }

    fn liquidation_instructions(ctx: &RpcContext, fixture: &LpLimitOrderFixture) -> Vec<Instruction> {
        let pool = fetch_whirlpool(&ctx.rpc, &fixture.test_market.pool).unwrap();
        let tuna_config = fetch_tuna_config(&ctx.rpc, &get_tuna_config_address().0).unwrap();
        let tuna_position = fetch_tuna_lp_position(&ctx.rpc, &get_tuna_liquidity_position_address(&fixture.position_mint).0).unwrap();
        let vaults = fetch_all_vault(&ctx.rpc, &[fixture.test_market.vault_a, fixture.test_market.vault_b]).unwrap();

        liquidate_tuna_lp_position_orca_instructions(
            &ctx.signer.pubkey(),
            &tuna_position.data,
            &tuna_config.data,
            &vaults[0].address,
            &vaults[0].data,
            &vaults[1].address,
            &vaults[1].data,
            &pool.data,
            &fixture.test_market.mint_a_account,
            &fixture.test_market.mint_b_account,
            None,
        )
        .unwrap()
    }

    fn assert_rejected_without_writable_account_changes(ctx: &RpcContext, instructions: Vec<Instruction>, expected_error: &[&str], what: &str) {
        // Transaction fees debit the signer even when program execution fails; that
        // network-level charge is not a liquidation effect and is intentionally omitted.
        let observed_accounts = writable_accounts(&instructions, ctx.signer.pubkey());
        let before = ctx.rpc.get_multiple_accounts(&observed_accounts).unwrap();

        assert_custom_error(ctx.send_transaction(instructions), expected_error, what);

        let after = ctx.rpc.get_multiple_accounts(&observed_accounts).unwrap();
        assert_eq!(after, before, "the rejected LP execution must not change any writable transaction account");
    }

    /// An indebted LP liquidation that cannot repay the lending vault must
    /// still enforce reference deviation and freshness after the swap.
    #[test]
    #[serial]
    fn test_lp_bad_debt_liquidation_rejects_deviating_and_stale_oracles() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            for stale in [false, true] {
                let signer = Keypair::new();
                let ctx = RpcContext::new(&signer, orca::get_whirlpool_config_accounts(&signer.pubkey())).await;
                let test_market = setup_test_market(&ctx, strict_test_market_args(), MarketMaker::Orca, TestMarketArgs::default())
                    .await
                    .unwrap();
                let pool = fetch_whirlpool(&ctx.rpc, &test_market.pool).unwrap();
                configure_tuna_oracles(&ctx, &test_market, pool.data.sqrt_price);
                let tick = pool.data.tick_current_index - (pool.data.tick_current_index % pool.data.tick_spacing as i32);
                let open = open_and_increase_tuna_lp_position_orca_instructions(
                    &ctx.rpc,
                    &ctx.signer.pubkey(),
                    &test_market.pool,
                    OpenAndIncreaseTunaLpPositionArgs {
                        tick_lower_index: tick - pool.data.tick_spacing as i32 * 3,
                        tick_upper_index: tick + pool.data.tick_spacing as i32 * 3,
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
                ctx.send_transaction_with_signers(open.instructions, open.additional_signers.iter().collect())
                    .unwrap();

                // Simulate an already-overindebted LP with a real outstanding A
                // loan, so liquidity removal cannot repay the required shares.
                let position_address = get_tuna_liquidity_position_address(&open.position_mint).0;
                let position = fetch_tuna_lp_position(&ctx.rpc, &position_address).unwrap();
                let mut overindebted = position.data.clone();
                overindebted.loan_shares_a *= 3;
                ctx.set_account(&position_address, &with_serialized_data(position.account.clone(), &overindebted))
                    .await;

                orca::swap_exact_in(&ctx, &pool.address, 50_000_000_000, &pool.data.token_mint_b, None)
                    .await
                    .unwrap();
                let moved_price = fetch_whirlpool(&ctx.rpc, &test_market.pool).unwrap().data.sqrt_price;
                let market = fetch_market(&ctx.rpc, &test_market.market).unwrap();
                let vaults = fetch_all_vault(&ctx.rpc, &[test_market.vault_a, test_market.vault_b]).unwrap();
                assert!(
                    !overindebted
                        .is_healthy(moved_price, &market.data, &vaults[0].data, &vaults[1].data)
                        .unwrap()
                        .0
                );

                let expected = if stale {
                    publish_tuna_oracle_prices(&ctx, &test_market, moved_price);
                    age_tuna_oracles(&ctx, &test_market, STALE_LP_ORACLE_AGE_SECONDS).await;
                    ORACLE_STALE_PRICE
                } else {
                    ORACLE_PRICE_DEVIATION_THRESHOLD_EXCEEDED
                };
                let fixture = LpLimitOrderFixture {
                    test_market,
                    position_mint: open.position_mint,
                    initial_sqrt_price: pool.data.sqrt_price,
                    manipulated_sqrt_price: moved_price,
                };
                assert_rejected_without_writable_account_changes(
                    &ctx,
                    liquidation_instructions(&ctx, &fixture),
                    expected,
                    "LP bad-debt liquidation must check the post-swap reference",
                );

                // Restore the originally funded debt. The same adverse pool
                // price is unhealthy but repayable, so a bad reference cannot
                // block liquidation or create protocol bad debt.
                ctx.set_account(&position_address, &with_serialized_data(position.account, &position.data))
                    .await;
                assert!(
                    !position
                        .data
                        .is_healthy(moved_price, &market.data, &vaults[0].data, &vaults[1].data)
                        .unwrap()
                        .0
                );
                ctx.send_transaction(liquidation_instructions(&ctx, &fixture)).unwrap();
                let after = fetch_market(&ctx.rpc, &fixture.test_market.market).unwrap();
                assert_eq!(after.data.bad_debt_a, market.data.bad_debt_a);
                assert_eq!(after.data.bad_debt_b, market.data.bad_debt_b);
            }
        });
    }

    /// A solvent LP limit order must execute despite a lagging oracle value.
    #[test]
    #[serial]
    fn test_lp_solvent_limit_order_ignores_lagging_reference() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let signer = Keypair::new();
            let ctx = RpcContext::new(&signer, orca::get_whirlpool_config_accounts(&signer.pubkey())).await;
            let fixture = setup_solvent_reached_limit_order(&ctx).await;

            let point_deviation = (spot_price(fixture.manipulated_sqrt_price) / spot_price(fixture.initial_sqrt_price) - 1.0).abs();
            assert!(point_deviation > STRICT_ORACLE_DEVIATION_THRESHOLD as f64 / HUNDRED_PERCENT as f64);

            let tuna_config = fetch_tuna_config(&ctx.rpc, &get_tuna_config_address().0).unwrap();
            let fee_recipient_accounts = [
                get_associated_token_address_with_program_id(
                    &tuna_config.data.fee_recipient,
                    &fixture.test_market.mint_a_address,
                    &fixture.test_market.token_program_a,
                ),
                get_associated_token_address_with_program_id(
                    &tuna_config.data.fee_recipient,
                    &fixture.test_market.mint_b_address,
                    &fixture.test_market.token_program_b,
                ),
            ];
            let before = ctx.rpc.get_multiple_accounts(&fee_recipient_accounts).unwrap();
            ctx.send_transaction(liquidation_instructions(&ctx, &fixture)).unwrap();
            let after = ctx.rpc.get_multiple_accounts(&fee_recipient_accounts).unwrap();
            assert_ne!(after, before, "the solvent LP limit order must pay a protocol reward");
        });
    }

    /// LP liquidation deliberately uses the existing shortfall policy of 260 seconds,
    /// so a configured, in-threshold feed older than 130 seconds remains usable.
    #[test]
    #[serial]
    fn test_lp_liquidate_accepts_in_threshold_reference_aged_between_130_and_260_seconds() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            for age_seconds in ACCEPTED_LP_ORACLE_AGES_SECONDS {
                let signer = Keypair::new();
                let ctx = RpcContext::new(&signer, orca::get_whirlpool_config_accounts(&signer.pubkey())).await;
                let fixture = setup_solvent_reached_limit_order(&ctx).await;

                publish_tuna_oracle_prices(&ctx, &fixture.test_market, fixture.manipulated_sqrt_price);
                age_tuna_oracles(&ctx, &fixture.test_market, age_seconds).await;

                let tuna_config = fetch_tuna_config(&ctx.rpc, &get_tuna_config_address().0).unwrap();
                let fee_recipient_accounts = [
                    get_associated_token_address_with_program_id(
                        &tuna_config.data.fee_recipient,
                        &fixture.test_market.mint_a_address,
                        &fixture.test_market.token_program_a,
                    ),
                    get_associated_token_address_with_program_id(
                        &tuna_config.data.fee_recipient,
                        &fixture.test_market.mint_b_address,
                        &fixture.test_market.token_program_b,
                    ),
                ];
                let fee_balances_before = ctx.rpc.get_multiple_accounts(&fee_recipient_accounts).unwrap();

                ctx.send_transaction(liquidation_instructions(&ctx, &fixture)).unwrap();

                let fee_balances_after = ctx.rpc.get_multiple_accounts(&fee_recipient_accounts).unwrap();
                assert_ne!(fee_balances_after, fee_balances_before, "the reached LP limit order must pay a protocol reward");
            }
        });
    }

    /// Even an expired configured feed cannot block a solvent LP limit order.
    #[test]
    #[serial]
    fn test_lp_solvent_limit_order_ignores_expired_reference() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let signer = Keypair::new();
            let ctx = RpcContext::new(&signer, orca::get_whirlpool_config_accounts(&signer.pubkey())).await;
            let fixture = setup_solvent_reached_limit_order(&ctx).await;

            publish_tuna_oracle_prices(&ctx, &fixture.test_market, fixture.manipulated_sqrt_price);
            age_tuna_oracles(&ctx, &fixture.test_market, STALE_LP_ORACLE_AGE_SECONDS).await;

            let position_address = get_tuna_liquidity_position_address(&fixture.position_mint).0;
            ctx.send_transaction(liquidation_instructions(&ctx, &fixture)).unwrap();
            let position = fetch_tuna_lp_position(&ctx.rpc, &position_address).unwrap();
            assert_eq!(position.data.liquidity, 0, "expired oracle must not strand a solvent LP limit order");
        });
    }
}
