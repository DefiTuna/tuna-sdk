#[cfg(test)]
mod tests {
    use crate::accounts::{fetch_all_vault, fetch_market, fetch_tuna_config, fetch_tuna_spot_position};
    use crate::instructions::{
        CreateMarketInstructionArgs, LiquidateTunaSpotPositionOrca, LiquidateTunaSpotPositionOrcaInstructionArgs,
        OpenTunaSpotPositionInstructionArgs, ResetTunaSpotPosition, ResetTunaSpotPositionInstructionArgs, SetTunaSpotPositionLimitOrders,
        SetTunaSpotPositionLimitOrdersInstructionArgs,
    };
    use crate::modify_tuna_spot_position_fusion::ModifyTunaSpotPositionArgs;
    use crate::modify_tuna_spot_position_orca::modify_tuna_spot_position_orca_instructions;
    use crate::tests::*;
    use crate::types::{AccountsType, MarketMaker, PoolToken, RemainingAccountsInfo, RemainingAccountsSlice};
    use crate::utils::orca::get_swap_tick_arrays;
    use crate::{
        close_tuna_spot_position_instructions, create_market_instruction, get_market_address, get_tuna_config_address,
        get_tuna_spot_position_address, liquidate_tuna_spot_position_orca_instructions, open_tuna_spot_position_instructions, HUNDRED_PERCENT,
        LEVERAGE_ONE,
    };
    use orca_whirlpools_client::{fetch_whirlpool, get_oracle_address};
    use orca_whirlpools_core::price_to_sqrt_price;
    use serial_test::serial;
    use solana_instruction::{AccountMeta, Instruction};
    use solana_keypair::Keypair;
    use solana_program_test::tokio;
    use solana_pubkey::Pubkey;
    use solana_signer::Signer;
    use spl_associated_token_account::get_associated_token_address_with_program_id;

    /// Anchor custom error offset (6000) + `ErrorCode::InvalidPool` (607).
    const INVALID_POOL: &[&str] = &["0x19cf", "6607"];
    /// Anchor custom error offset (6000) + `ErrorCode::OraclePriceDeviationThresholdExceeded` (619).
    const ORACLE_PRICE_DEVIATION_THRESHOLD_EXCEEDED: &[&str] = &["0x19db", "6619"];
    /// Anchor custom error offset (6000) + `ErrorCode::OracleStalePrice` (618).
    const ORACLE_STALE_PRICE: &[&str] = &["0x19da", "6618"];
    /// Anchor custom error offset (6000) + `ErrorCode::PositionNotEmpty` (625).
    const POSITION_NOT_EMPTY: &[&str] = &["0x19e1", "6625"];
    const STRICT_ORACLE_DEVIATION_THRESHOLD: u32 = HUNDRED_PERCENT * 3 / 100;

    fn test_market_args() -> CreateMarketInstructionArgs {
        CreateMarketInstructionArgs {
            address_lookup_table: Default::default(),
            max_leverage: (LEVERAGE_ONE * 1020) / 100,
            protocol_fee: 1000,
            protocol_fee_on_collateral: 1000,
            liquidation_fee: 10000,
            liquidation_threshold: 920000,
            oracle_price_deviation_threshold: HUNDRED_PERCENT / 2,
            disabled: false,
            borrow_limit_a: u64::MAX,
            borrow_limit_b: u64::MAX,
            unused: 0,
            rebalance_protocol_fee: 0,
            spot_position_size_limit_a: 1000_000_000_000,
            spot_position_size_limit_b: 100000_000_000,
        }
    }

    fn strict_test_market_args() -> CreateMarketInstructionArgs {
        let mut args = test_market_args();
        args.oracle_price_deviation_threshold = STRICT_ORACLE_DEVIATION_THRESHOLD;
        args
    }

    fn assert_custom_error(result: Result<solana_signature::Signature, Box<dyn std::error::Error>>, codes: &[&str], what: &str) {
        let err = result.expect_err(what);
        let err_str = err.to_string();
        assert!(codes.iter().any(|c| err_str.contains(c)), "expected one of {codes:?} ({what}), got: {err_str}");
    }

    fn liquidation_instructions(ctx: &RpcContext, test_market: &TestMarket) -> Vec<Instruction> {
        let pool = fetch_whirlpool(&ctx.rpc, &test_market.pool).unwrap();
        let tuna_config = fetch_tuna_config(&ctx.rpc, &get_tuna_config_address().0).unwrap();
        let tuna_position = fetch_tuna_spot_position(&ctx.rpc, &get_tuna_spot_position_address(&ctx.signer.pubkey(), &test_market.pool).0).unwrap();
        let vaults = fetch_all_vault(&ctx.rpc, &[test_market.vault_a, test_market.vault_b]).unwrap();

        liquidate_tuna_spot_position_orca_instructions(
            &ctx.signer.pubkey(),
            &tuna_position.data,
            &tuna_config.data,
            &vaults[0].address,
            &vaults[0].data,
            &vaults[1].address,
            &vaults[1].data,
            &pool.data,
            &test_market.mint_a_account,
            &test_market.mint_b_account,
            None,
        )
        .unwrap()
    }

    async fn open_position_with_borrow(ctx: &RpcContext, test_market: &TestMarket, borrow_amount: u64) {
        let mut instructions = open_tuna_spot_position_instructions(
            &ctx.rpc,
            &ctx.signer.pubkey(),
            &test_market.pool,
            OpenTunaSpotPositionInstructionArgs {
                position_token: PoolToken::A,
                collateral_token: PoolToken::A,
            },
        )
        .unwrap();

        let mut increase_ixs = modify_tuna_spot_position_orca_instructions(
            &ctx.rpc,
            &ctx.signer.pubkey(),
            &test_market.pool,
            Some(PoolToken::A),
            ModifyTunaSpotPositionArgs {
                decrease_percent: 0,
                collateral_amount: 1_000_000_000,
                borrow_amount,
                required_swap_amount: 0,
            },
        )
        .unwrap();
        instructions.append(&mut increase_ixs);

        ctx.send_transaction(instructions).unwrap();
    }

    /// Opens a leveraged spot position (long A, collateral A, borrowed B) on a fresh Orca market.
    async fn open_leveraged_position(ctx: &RpcContext, test_market: &TestMarket) {
        open_position_with_borrow(ctx, test_market, 1_000_000_000).await;
    }

    async fn make_position_liquidatable(ctx: &RpcContext, test_market: &TestMarket) -> u128 {
        let pool = fetch_whirlpool(&ctx.rpc, &test_market.pool).unwrap();
        orca::swap_exact_in(ctx, &pool.address, 500_000_000_000, &pool.data.token_mint_a, None)
            .await
            .unwrap();
        fetch_whirlpool(&ctx.rpc, &test_market.pool).unwrap().data.sqrt_price
    }

    /// Creates a debt-free, healthy position whose stop-loss is reached after a
    /// pool move. It must execute even when the reference lags behind.
    async fn prepare_solvent_reached_limit_order(ctx: &RpcContext, test_market: &TestMarket, initial_sqrt_price: u128) -> u128 {
        open_position_with_borrow(ctx, test_market, 0).await;

        let tuna_position_address = get_tuna_spot_position_address(&ctx.signer.pubkey(), &test_market.pool).0;
        let stop_loss_sqrt_price = initial_sqrt_price / 100 * 99;
        ctx.send_transaction(vec![SetTunaSpotPositionLimitOrders {
            authority: ctx.signer.pubkey(),
            tuna_position: tuna_position_address,
        }
        .instruction(SetTunaSpotPositionLimitOrdersInstructionArgs {
            lower_limit_order_sqrt_price: stop_loss_sqrt_price,
            upper_limit_order_sqrt_price: u128::MAX,
        })])
        .unwrap();

        let manipulated_sqrt_price = make_position_liquidatable(ctx, test_market).await;
        assert!(manipulated_sqrt_price <= stop_loss_sqrt_price, "the solvent stop-loss must be reached");

        let tuna_position = fetch_tuna_spot_position(&ctx.rpc, &tuna_position_address).unwrap();
        let market = fetch_market(&ctx.rpc, &test_market.market).unwrap();
        let vaults = fetch_all_vault(&ctx.rpc, &[test_market.vault_a, test_market.vault_b]).unwrap();
        assert_eq!(tuna_position.data.loan_shares, 0, "the regression fixture must not enter the bad-debt path");
        assert!(
            tuna_position
                .data
                .is_healthy(manipulated_sqrt_price, &market.data, &vaults[0].data, &vaults[1].data)
                .unwrap()
                .0,
            "the reached limit order must remain solvent and healthy"
        );

        manipulated_sqrt_price
    }

    /// Simulates a permanent-delegate burn: zero the `amount` field (bytes 64..72 of the base token account
    /// layout, shared by spl-token and token-2022) of a token account without going through the token program.
    async fn drain_token_account(ctx: &RpcContext, address: &Pubkey) {
        let mut account = ctx.rpc.get_account(address).unwrap();
        account.data[64..72].copy_from_slice(&0u64.to_le_bytes());
        ctx.set_account(address, &account).await;
    }

    /// Regression test: the liquidation reference market must be the position's own market.
    ///
    /// The liquidation contexts derive the position PDA from `tuna_position.pool` and the market PDA from the
    /// caller-supplied pool. Before the fix nothing required the two pools to match, so a liquidator could
    /// evaluate a position's health / limit orders against the price and fee policy of a *different* pool of
    /// the same pair. Here a second whirlpool for the same mints is created at half the price (which would make
    /// the position look unhealthy) with its own market, and a liquidation is attempted against it.
    #[test]
    #[serial]
    fn test_liquidate_rejects_foreign_reference_pool() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let signer = Keypair::new();
            let ctx = RpcContext::new(&signer, orca::get_whirlpool_config_accounts(&signer.pubkey())).await;
            let test_market = setup_test_market(&ctx, test_market_args(), MarketMaker::Orca, TestMarketArgs::default())
                .await
                .unwrap();

            open_leveraged_position(&ctx, &test_market).await;

            // A second pool for the same pair (different tick spacing) priced at half of the real pool, plus a market for it.
            let foreign_pool =
                orca::setup_whirlpool(&ctx, &test_market.mint_a_address, &test_market.mint_b_address, 128, price_to_sqrt_price(100.0, 9, 6), false)
                    .await
                    .unwrap();
            assert_ne!(foreign_pool, test_market.pool);

            ctx.send_transaction(vec![create_market_instruction(
                &signer.pubkey(),
                &foreign_pool,
                &test_market.vault_a,
                &test_market.vault_b,
                test_market_args(),
            )])
            .unwrap();

            let foreign_whirlpool = fetch_whirlpool(&ctx.rpc, &foreign_pool).unwrap();
            let tuna_config = fetch_tuna_config(&ctx.rpc, &get_tuna_config_address().0).unwrap();
            let vaults = fetch_all_vault(&ctx.rpc, &[test_market.vault_a, test_market.vault_b]).unwrap();
            let tuna_position_address = get_tuna_spot_position_address(&signer.pubkey(), &test_market.pool).0;
            let tuna_position_before = fetch_tuna_spot_position(&ctx.rpc, &tuna_position_address).unwrap();
            assert!(tuna_position_before.data.amount > 0 && tuna_position_before.data.loan_shares > 0);

            let (mint_a, mint_b) = (test_market.mint_a_address, test_market.mint_b_address);
            let (token_program_a, token_program_b) = (test_market.token_program_a, test_market.token_program_b);
            let swap_tick_arrays = get_swap_tick_arrays(foreign_whirlpool.data.tick_current_index, 128, &foreign_pool);

            let ix = LiquidateTunaSpotPositionOrca {
                authority: signer.pubkey(),
                tuna_config: get_tuna_config_address().0,
                mint_a,
                mint_b,
                token_program_a,
                token_program_b,
                // <-- the attack: the reference market/pool belong to a different pool than the position's.
                market: get_market_address(&foreign_pool).0,
                whirlpool: foreign_pool,
                vault_a: test_market.vault_a,
                vault_b: test_market.vault_b,
                vault_a_ata: get_associated_token_address_with_program_id(&test_market.vault_a, &mint_a, &token_program_a),
                vault_b_ata: get_associated_token_address_with_program_id(&test_market.vault_b, &mint_b, &token_program_b),
                tuna_position: tuna_position_address,
                tuna_position_ata_a: get_associated_token_address_with_program_id(&tuna_position_address, &mint_a, &token_program_a),
                tuna_position_ata_b: get_associated_token_address_with_program_id(&tuna_position_address, &mint_b, &token_program_b),
                fee_recipient_ata_a: get_associated_token_address_with_program_id(&tuna_config.data.fee_recipient, &mint_a, &token_program_a),
                fee_recipient_ata_b: get_associated_token_address_with_program_id(&tuna_config.data.fee_recipient, &mint_b, &token_program_b),
                tuna_position_owner: signer.pubkey(),
                tuna_position_owner_ata_a: Some(get_associated_token_address_with_program_id(&signer.pubkey(), &mint_a, &token_program_a)),
                tuna_position_owner_ata_b: None,
                oracle_price_update_a: vaults[0].data.oracle_price_update,
                oracle_price_update_b: vaults[1].data.oracle_price_update,
                whirlpool_program: orca_whirlpools_client::ID,
                memo_program: spl_memo::ID,
                system_program: solana_system_interface::program::ID,
            }
            .instruction_with_remaining_accounts(
                LiquidateTunaSpotPositionOrcaInstructionArgs {
                    decrease_percent: HUNDRED_PERCENT,
                    remaining_accounts_info: RemainingAccountsInfo {
                        slices: vec![
                            RemainingAccountsSlice {
                                accounts_type: AccountsType::SwapTickArrays,
                                length: 5,
                            },
                            RemainingAccountsSlice {
                                accounts_type: AccountsType::PoolVaultTokenA,
                                length: 1,
                            },
                            RemainingAccountsSlice {
                                accounts_type: AccountsType::PoolVaultTokenB,
                                length: 1,
                            },
                            RemainingAccountsSlice {
                                accounts_type: AccountsType::WhirlpoolOracle,
                                length: 1,
                            },
                        ],
                    },
                },
                &[
                    AccountMeta::new(swap_tick_arrays[0], false),
                    AccountMeta::new(swap_tick_arrays[1], false),
                    AccountMeta::new(swap_tick_arrays[2], false),
                    AccountMeta::new(swap_tick_arrays[3], false),
                    AccountMeta::new(swap_tick_arrays[4], false),
                    AccountMeta::new(foreign_whirlpool.data.token_vault_a, false),
                    AccountMeta::new(foreign_whirlpool.data.token_vault_b, false),
                    AccountMeta::new(get_oracle_address(&foreign_pool).unwrap().0, false),
                ],
            );

            assert_custom_error(
                ctx.send_transaction(vec![ix]),
                INVALID_POOL,
                "liquidate_tuna_spot_position_orca must reject a reference pool that differs from the position's pool",
            );

            // The position is untouched.
            let tuna_position_after = fetch_tuna_spot_position(&ctx.rpc, &tuna_position_address).unwrap();
            assert_eq!(tuna_position_after.data.amount, tuna_position_before.data.amount);
            assert_eq!(tuna_position_after.data.loan_shares, tuna_position_before.data.loan_shares);
        });
    }

    /// A solvent reached limit order uses the pool price even when the oracle lags.
    #[test]
    #[serial]
    fn test_liquidate_solvent_limit_order_ignores_lagging_reference() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let signer = Keypair::new();
            let ctx = RpcContext::new(&signer, orca::get_whirlpool_config_accounts(&signer.pubkey())).await;
            let test_market = setup_test_market(&ctx, strict_test_market_args(), MarketMaker::Orca, TestMarketArgs::default())
                .await
                .unwrap();

            let initial_sqrt_price = fetch_whirlpool(&ctx.rpc, &test_market.pool).unwrap().data.sqrt_price;
            configure_tuna_oracles(&ctx, &test_market, initial_sqrt_price);
            let manipulated_sqrt_price = prepare_solvent_reached_limit_order(&ctx, &test_market, initial_sqrt_price).await;

            let point_deviation = (spot_price(manipulated_sqrt_price) / spot_price(initial_sqrt_price) - 1.0).abs();
            assert!(point_deviation > STRICT_ORACLE_DEVIATION_THRESHOLD as f64 / HUNDRED_PERCENT as f64);

            let tuna_config = fetch_tuna_config(&ctx.rpc, &get_tuna_config_address().0).unwrap();
            let fee_recipient_accounts = [
                get_associated_token_address_with_program_id(
                    &tuna_config.data.fee_recipient,
                    &test_market.mint_a_address,
                    &test_market.token_program_a,
                ),
                get_associated_token_address_with_program_id(
                    &tuna_config.data.fee_recipient,
                    &test_market.mint_b_address,
                    &test_market.token_program_b,
                ),
            ];
            let before = ctx.rpc.get_multiple_accounts(&fee_recipient_accounts).unwrap();
            ctx.send_transaction(liquidation_instructions(&ctx, &test_market)).unwrap();
            let after = ctx.rpc.get_multiple_accounts(&fee_recipient_accounts).unwrap();
            assert_ne!(after, before, "the solvent limit order must execute despite the stale reference value");
        });
    }

    /// Bad-debt liquidation still requires a fresh, in-threshold oracle even
    /// though the same oracle cannot block solvent liquidation above.
    #[test]
    #[serial]
    fn test_spot_bad_debt_liquidation_checks_deviation_and_freshness() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            for stale in [false, true] {
                let signer = Keypair::new();
                let ctx = RpcContext::new(&signer, orca::get_whirlpool_config_accounts(&signer.pubkey())).await;
                let test_market = setup_test_market(&ctx, strict_test_market_args(), MarketMaker::Orca, TestMarketArgs::default())
                    .await
                    .unwrap();
                let initial_pool = fetch_whirlpool(&ctx.rpc, &test_market.pool).unwrap();
                configure_tuna_oracles(&ctx, &test_market, initial_pool.data.sqrt_price);

                // Tiny long A, borrowed B: after a severe A/B drop its assets
                // cannot cover even one raw unit of B debt (F4 recovery fixture).
                let mut instructions = open_tuna_spot_position_instructions(
                    &ctx.rpc,
                    &ctx.signer.pubkey(),
                    &test_market.pool,
                    OpenTunaSpotPositionInstructionArgs {
                        position_token: PoolToken::A,
                        collateral_token: PoolToken::B,
                    },
                )
                .unwrap();
                instructions.append(
                    &mut modify_tuna_spot_position_orca_instructions(
                        &ctx.rpc,
                        &ctx.signer.pubkey(),
                        &test_market.pool,
                        Some(PoolToken::B),
                        ModifyTunaSpotPositionArgs {
                            decrease_percent: 0,
                            collateral_amount: 3,
                            borrow_amount: 1,
                            required_swap_amount: 0,
                        },
                    )
                    .unwrap(),
                );
                ctx.send_transaction(instructions).unwrap();

                for _ in 0..6 {
                    orca::swap_exact_in(&ctx, &initial_pool.address, 500_000_000_000, &initial_pool.data.token_mint_a, None)
                        .await
                        .unwrap();
                }
                let low_pool = fetch_whirlpool(&ctx.rpc, &test_market.pool).unwrap();
                let position_address = get_tuna_spot_position_address(&ctx.signer.pubkey(), &test_market.pool).0;
                let position = fetch_tuna_spot_position(&ctx.rpc, &position_address).unwrap();
                let market = fetch_market(&ctx.rpc, &test_market.market).unwrap();
                let vaults = fetch_all_vault(&ctx.rpc, &[test_market.vault_a, test_market.vault_b]).unwrap();
                assert!(position.data.loan_shares > 0);
                assert_eq!(
                    position
                        .data
                        .is_healthy(low_pool.data.sqrt_price, &market.data, &vaults[0].data, &vaults[1].data),
                    Ok((false, u32::MAX)),
                );

                let expected = if stale {
                    publish_tuna_oracle_prices(&ctx, &test_market, low_pool.data.sqrt_price);
                    age_tuna_oracles(&ctx, &test_market, 131).await;
                    ORACLE_STALE_PRICE
                } else {
                    ORACLE_PRICE_DEVIATION_THRESHOLD_EXCEEDED
                };
                assert_custom_error(
                    ctx.send_transaction(liquidation_instructions(&ctx, &test_market)),
                    expected,
                    "repayment shortfall must reject a deviating or stale oracle",
                );
                let after = fetch_tuna_spot_position(&ctx.rpc, &position_address).unwrap();
                assert_eq!(after.data.loan_shares, position.data.loan_shares, "failed bad-debt liquidation must roll back");
                assert_eq!(fetch_market(&ctx.rpc, &test_market.market).unwrap().data.bad_debt_b, market.data.bad_debt_b);
            }
        });
    }

    /// An unhealthy but repayable position may be liquidated despite a stale
    /// or deviating oracle: protection is for protocol bad debt, not eligibility.
    #[test]
    #[serial]
    fn test_spot_solvent_unhealthy_liquidation_ignores_bad_reference() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            for stale in [false, true] {
                let signer = Keypair::new();
                let ctx = RpcContext::new(&signer, orca::get_whirlpool_config_accounts(&signer.pubkey())).await;
                let test_market = setup_test_market(&ctx, strict_test_market_args(), MarketMaker::Orca, TestMarketArgs::default())
                    .await
                    .unwrap();
                let initial_price = fetch_whirlpool(&ctx.rpc, &test_market.pool).unwrap().data.sqrt_price;
                configure_tuna_oracles(&ctx, &test_market, initial_price);
                open_position_with_borrow(&ctx, &test_market, 1_000_000_000).await;
                let pool = fetch_whirlpool(&ctx.rpc, &test_market.pool).unwrap();
                orca::swap_exact_in(&ctx, &pool.address, 150_000_000_000, &pool.data.token_mint_a, None)
                    .await
                    .unwrap();
                let moved_price = fetch_whirlpool(&ctx.rpc, &test_market.pool).unwrap().data.sqrt_price;
                let position_address = get_tuna_spot_position_address(&ctx.signer.pubkey(), &test_market.pool).0;
                let position = fetch_tuna_spot_position(&ctx.rpc, &position_address).unwrap();
                let market = fetch_market(&ctx.rpc, &test_market.market).unwrap();
                let vaults = fetch_all_vault(&ctx.rpc, &[test_market.vault_a, test_market.vault_b]).unwrap();
                assert!(
                    !position
                        .data
                        .is_healthy(moved_price, &market.data, &vaults[0].data, &vaults[1].data)
                        .unwrap()
                        .0
                );
                if stale {
                    publish_tuna_oracle_prices(&ctx, &test_market, moved_price);
                    age_tuna_oracles(&ctx, &test_market, 131).await;
                } else {
                    assert!(
                        (spot_price(moved_price) / spot_price(initial_price) - 1.0).abs()
                            > STRICT_ORACLE_DEVIATION_THRESHOLD as f64 / HUNDRED_PERCENT as f64
                    );
                }
                ctx.send_transaction(liquidation_instructions(&ctx, &test_market)).unwrap();
                let after = fetch_market(&ctx.rpc, &test_market.market).unwrap();
                assert_eq!(after.data.bad_debt_a, market.data.bad_debt_a);
                assert_eq!(after.data.bad_debt_b, market.data.bad_debt_b);
            }
        });
    }

    /// An in-threshold reference also allows the reached limit order.
    #[test]
    #[serial]
    fn test_liquidate_accepts_pool_price_within_reference_threshold() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let signer = Keypair::new();
            let ctx = RpcContext::new(&signer, orca::get_whirlpool_config_accounts(&signer.pubkey())).await;
            let test_market = setup_test_market(&ctx, strict_test_market_args(), MarketMaker::Orca, TestMarketArgs::default())
                .await
                .unwrap();

            let initial_sqrt_price = fetch_whirlpool(&ctx.rpc, &test_market.pool).unwrap().data.sqrt_price;
            configure_tuna_oracles(&ctx, &test_market, initial_sqrt_price);
            let manipulated_sqrt_price = prepare_solvent_reached_limit_order(&ctx, &test_market, initial_sqrt_price).await;

            publish_tuna_oracle_prices(&ctx, &test_market, manipulated_sqrt_price);

            let tuna_config = fetch_tuna_config(&ctx.rpc, &get_tuna_config_address().0).unwrap();
            let fee_recipient_accounts = [
                get_associated_token_address_with_program_id(
                    &tuna_config.data.fee_recipient,
                    &test_market.mint_a_address,
                    &test_market.token_program_a,
                ),
                get_associated_token_address_with_program_id(
                    &tuna_config.data.fee_recipient,
                    &test_market.mint_b_address,
                    &test_market.token_program_b,
                ),
            ];
            let fee_balances_before = ctx.rpc.get_multiple_accounts(&fee_recipient_accounts).unwrap();

            ctx.send_transaction(liquidation_instructions(&ctx, &test_market)).unwrap();

            let fee_balances_after = ctx.rpc.get_multiple_accounts(&fee_recipient_accounts).unwrap();
            assert_ne!(fee_balances_after, fee_balances_before, "the reached limit order must pay a protocol reward");
        });
    }

    /// The remediation must not make an external feed mandatory for markets whose vaults do not configure one.
    #[test]
    #[serial]
    fn test_liquidate_without_reference_oracle_remains_enabled() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let signer = Keypair::new();
            let ctx = RpcContext::new(&signer, orca::get_whirlpool_config_accounts(&signer.pubkey())).await;
            let test_market = setup_test_market(&ctx, strict_test_market_args(), MarketMaker::Orca, TestMarketArgs::default())
                .await
                .unwrap();

            let vaults = fetch_all_vault(&ctx.rpc, &[test_market.vault_a, test_market.vault_b]).unwrap();
            assert_eq!(vaults[0].data.oracle_price_update, Pubkey::default());
            assert_eq!(vaults[1].data.oracle_price_update, Pubkey::default());

            open_position_with_borrow(&ctx, &test_market, 1_500_000_000).await;
            make_position_liquidatable(&ctx, &test_market).await;
            ctx.send_transaction(liquidation_instructions(&ctx, &test_market)).unwrap();
        });
    }

    /// Regression test: the owner cannot close a position whose token accounts were drained out from under it
    /// (e.g. by a permanent-delegate mint) while the position still records an amount and outstanding debt.
    /// Before the fix `close_position` only checked the token-account balances, so the loan would be orphaned
    /// in the vault/market while the owner could re-open a zero-debt position at the same PDA.
    #[test]
    #[serial]
    fn test_close_rejects_position_with_drained_token_accounts() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let signer = Keypair::new();
            let ctx = RpcContext::new(&signer, orca::get_whirlpool_config_accounts(&signer.pubkey())).await;
            let test_market = setup_test_market(&ctx, test_market_args(), MarketMaker::Orca, TestMarketArgs::default())
                .await
                .unwrap();

            open_leveraged_position(&ctx, &test_market).await;

            let tuna_position_address = get_tuna_spot_position_address(&signer.pubkey(), &test_market.pool).0;
            let tuna_position = fetch_tuna_spot_position(&ctx.rpc, &tuna_position_address).unwrap();
            assert!(tuna_position.data.amount > 0 && tuna_position.data.loan_shares > 0);

            let position_ata_a =
                get_associated_token_address_with_program_id(&tuna_position_address, &test_market.mint_a_address, &test_market.token_program_a);
            let position_ata_b =
                get_associated_token_address_with_program_id(&tuna_position_address, &test_market.mint_b_address, &test_market.token_program_b);
            drain_token_account(&ctx, &position_ata_a).await;
            drain_token_account(&ctx, &position_ata_b).await;

            assert_custom_error(
                ctx.send_transaction(close_tuna_spot_position_instructions(&ctx.rpc, &signer.pubkey(), &test_market.pool).unwrap()),
                POSITION_NOT_EMPTY,
                "close_tuna_spot_position must reject a position with a non-zero amount",
            );

            // Position state (and its liability) survives.
            let tuna_position_after = fetch_tuna_spot_position(&ctx.rpc, &tuna_position_address).unwrap();
            assert_eq!(tuna_position_after.data.loan_shares, tuna_position.data.loan_shares);
        });
    }

    /// Regression test for the `amount == 0 && loan_shares > 0` state (the exact orphaned-liability shape):
    /// neither `close_tuna_spot_position` nor `reset_tuna_spot_position` may proceed while debt is outstanding.
    /// Reset in particular flips `position_token`, which would re-attribute the debt to the other vault.
    #[test]
    #[serial]
    fn test_close_and_reset_reject_outstanding_debt() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let signer = Keypair::new();
            let ctx = RpcContext::new(&signer, orca::get_whirlpool_config_accounts(&signer.pubkey())).await;
            let test_market = setup_test_market(&ctx, test_market_args(), MarketMaker::Orca, TestMarketArgs::default())
                .await
                .unwrap();

            open_leveraged_position(&ctx, &test_market).await;

            let tuna_position_address = get_tuna_spot_position_address(&signer.pubkey(), &test_market.pool).0;
            let tuna_position = fetch_tuna_spot_position(&ctx.rpc, &tuna_position_address).unwrap();
            assert!(tuna_position.data.loan_shares > 0);

            // Force the position into `amount == 0, loan_shares > 0` with empty token accounts.
            let mut orphaned = tuna_position.data.clone();
            orphaned.amount = 0;
            ctx.set_account(&tuna_position_address, &with_serialized_data(tuna_position.account.clone(), &orphaned))
                .await;

            let position_ata_a =
                get_associated_token_address_with_program_id(&tuna_position_address, &test_market.mint_a_address, &test_market.token_program_a);
            let position_ata_b =
                get_associated_token_address_with_program_id(&tuna_position_address, &test_market.mint_b_address, &test_market.token_program_b);
            drain_token_account(&ctx, &position_ata_a).await;
            drain_token_account(&ctx, &position_ata_b).await;

            assert_custom_error(
                ctx.send_transaction(close_tuna_spot_position_instructions(&ctx.rpc, &signer.pubkey(), &test_market.pool).unwrap()),
                POSITION_NOT_EMPTY,
                "close_tuna_spot_position must reject a position with outstanding loan shares",
            );

            let reset_ix = ResetTunaSpotPosition {
                authority: signer.pubkey(),
                mint_a: test_market.mint_a_address,
                mint_b: test_market.mint_b_address,
                tuna_position: tuna_position_address,
                tuna_position_ata_a: position_ata_a,
                tuna_position_ata_b: position_ata_b,
            }
            .instruction(ResetTunaSpotPositionInstructionArgs {
                position_token: PoolToken::B,
                collateral_token: PoolToken::B,
            });

            assert_custom_error(
                ctx.send_transaction(vec![reset_ix]),
                POSITION_NOT_EMPTY,
                "reset_tuna_spot_position must reject a position with outstanding loan shares",
            );

            let tuna_position_after = fetch_tuna_spot_position(&ctx.rpc, &tuna_position_address).unwrap();
            assert_eq!(tuna_position_after.data.loan_shares, tuna_position.data.loan_shares);
            assert_eq!(tuna_position_after.data.position_token, PoolToken::A);
        });
    }
}
