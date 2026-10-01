#[cfg(test)]
mod tests {
    use crate::accounts::{fetch_all_vault, fetch_market, fetch_tuna_config, fetch_tuna_lp_position};
    use crate::instructions::{CreateMarketInstructionArgs, OpenTunaLpPositionFusionInstructionArgs};
    use crate::tests::fusion::swap_exact_in;
    use crate::tests::*;
    use crate::types::{MarketMaker, TunaPositionState};
    use crate::{
        close_active_tuna_lp_position_fusion_instructions, close_tuna_lp_position_fusion_instruction, collect_and_compound_fees_fusion_instructions,
        decrease_tuna_lp_position_fusion_instructions, get_tuna_config_address, get_tuna_liquidity_position_address,
        increase_tuna_lp_position_fusion_instructions, liquidate_tuna_lp_position_fusion_instructions,
        open_and_increase_tuna_lp_position_fusion_instructions, open_tuna_lp_position_fusion_instruction,
        rebalance_tuna_lp_position_fusion_instructions, CloseActiveTunaLpPositionArgs, DecreaseTunaLpPositionArgs, IncreaseTunaLpPositionArgs,
        OpenAndIncreaseTunaLpPositionArgs, HUNDRED_PERCENT, LEVERAGE_ONE, TUNA_POSITION_FLAGS_ALLOW_REBALANCING,
    };
    use fusionamm_client::fetch_fusion_pool;
    use rstest::rstest;
    use serial_test::serial;
    use solana_keypair::Keypair;
    use solana_program_test::tokio;
    use solana_signer::Signer;
    use solana_system_interface::instruction::transfer;
    use spl_associated_token_account::{get_associated_token_address_with_program_id, instruction::create_associated_token_account_idempotent};

    /// Anchor custom error offset (6000) + `ErrorCode::InvalidPool` (607).
    const INVALID_POOL: &[&str] = &["0x19cf", "6607"];
    /// Anchor's built-in `ConstraintRaw` error (code 2003).
    const CONSTRAINT_RAW: &[&str] = &["0x7d3", "2003"];
    /// Anchor custom error offset (6000) + `ErrorCode::MAPriceDeviationThresholdExceeded` (672).
    const MA_PRICE_DEVIATION_THRESHOLD_EXCEEDED: &[&str] = &["0x1a10", "6672"];

    fn assert_custom_error(result: Result<solana_signature::Signature, Box<dyn std::error::Error>>, codes: &[&str], what: &str) {
        let err = result.expect_err(what);
        let err_str = err.to_string();
        assert!(codes.iter().any(|code| err_str.contains(code)), "expected one of {codes:?} ({what}), got: {err_str}");
    }

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

    #[rstest]
    #[case(false)]
    #[case(true)]
    #[serial]
    fn test_open_close_position(#[case] permissionless: bool) {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let signer = Keypair::new();
            let ctx = RpcContext::new(&signer, fusion::get_fusion_pool_config_accounts(&signer.pubkey())).await;
            let test_market = setup_test_market(
                &ctx,
                test_market_args(),
                MarketMaker::Fusion,
                TestMarketArgs {
                    permissionless,
                    ..TestMarketArgs::default()
                },
            )
            .await
            .unwrap();

            let pool = fetch_fusion_pool(&ctx.rpc, &test_market.pool).unwrap();

            let position_mint = Keypair::new();
            let actual_tick_index = pool.data.tick_current_index - (pool.data.tick_current_index % pool.data.tick_spacing as i32);

            ctx.send_transaction_with_signers(
                vec![open_tuna_lp_position_fusion_instruction(
                    &ctx.rpc,
                    &ctx.signer.pubkey(),
                    &position_mint.pubkey(),
                    &test_market.pool,
                    OpenTunaLpPositionFusionInstructionArgs {
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
                increase_tuna_lp_position_fusion_instructions(
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
                decrease_tuna_lp_position_fusion_instructions(
                    &ctx.rpc,
                    &ctx.signer.pubkey(),
                    &position_mint.pubkey(),
                    DecreaseTunaLpPositionArgs {
                        decrease_percent: HUNDRED_PERCENT,
                        swap_to_token: None,
                        min_removed_amount_a: 0,
                        min_removed_amount_b: 0,
                    },
                )
                .unwrap(),
            )
            .unwrap();

            let tuna_position_address = get_tuna_liquidity_position_address(&position_mint.pubkey()).0;
            let tuna_position = fetch_tuna_lp_position(&ctx.rpc, &tuna_position_address).unwrap();

            // Reproduce the vulnerable caller shape: pair a decoy mint with its empty ATA owned by the
            // position PDA, while leaving every other account on the legitimate position unchanged.
            let decoy_mint = setup_mint(&ctx, test_market.mint_a.decimals).await.unwrap();
            let real_position_ata_a =
                get_associated_token_address_with_program_id(&tuna_position_address, &tuna_position.data.mint_a, &test_market.token_program_a);
            let decoy_position_ata_a =
                get_associated_token_address_with_program_id(&tuna_position_address, &decoy_mint, &test_market.token_program_a);
            ctx.send_transaction(vec![create_associated_token_account_idempotent(
                &ctx.signer.pubkey(),
                &tuna_position_address,
                &decoy_mint,
                &test_market.token_program_a,
            )])
            .unwrap();

            let mut wrong_mint_ix = close_tuna_lp_position_fusion_instruction(
                &ctx.signer.pubkey(),
                &tuna_position.data,
                &test_market.token_program_a,
                &test_market.token_program_b,
            );
            wrong_mint_ix
                .accounts
                .iter_mut()
                .find(|account| account.pubkey == tuna_position.data.mint_a)
                .expect("close instruction must contain mint_a")
                .pubkey = decoy_mint;
            wrong_mint_ix
                .accounts
                .iter_mut()
                .find(|account| account.pubkey == real_position_ata_a)
                .expect("close instruction must contain the position's mint_a ATA")
                .pubkey = decoy_position_ata_a;

            assert_custom_error(
                ctx.send_transaction(vec![wrong_mint_ix]),
                INVALID_POOL,
                "close_tuna_lp_position_fusion must reject a mint that differs from the stored position mint",
            );
            fetch_tuna_lp_position(&ctx.rpc, &tuna_position_address).expect("wrong-mint close must preserve the position");

            // Independently exercise mint_b while mint_a and its ATA remain canonical.
            let decoy_mint_b = setup_mint_te(&ctx, test_market.mint_b.decimals, &[]).await.unwrap();
            let real_position_ata_b =
                get_associated_token_address_with_program_id(&tuna_position_address, &tuna_position.data.mint_b, &test_market.token_program_b);
            let decoy_position_ata_b =
                get_associated_token_address_with_program_id(&tuna_position_address, &decoy_mint_b, &test_market.token_program_b);
            ctx.send_transaction(vec![create_associated_token_account_idempotent(
                &ctx.signer.pubkey(),
                &tuna_position_address,
                &decoy_mint_b,
                &test_market.token_program_b,
            )])
            .unwrap();

            let mut wrong_mint_b_ix = close_tuna_lp_position_fusion_instruction(
                &ctx.signer.pubkey(),
                &tuna_position.data,
                &test_market.token_program_a,
                &test_market.token_program_b,
            );
            wrong_mint_b_ix
                .accounts
                .iter_mut()
                .find(|account| account.pubkey == tuna_position.data.mint_b)
                .expect("close instruction must contain mint_b")
                .pubkey = decoy_mint_b;
            wrong_mint_b_ix
                .accounts
                .iter_mut()
                .find(|account| account.pubkey == real_position_ata_b)
                .expect("close instruction must contain the position's mint_b ATA")
                .pubkey = decoy_position_ata_b;

            assert_custom_error(
                ctx.send_transaction(vec![wrong_mint_b_ix]),
                INVALID_POOL,
                "close_tuna_lp_position_fusion must reject mint_b when it differs from the stored position mint",
            );
            fetch_tuna_lp_position(&ctx.rpc, &tuna_position_address).expect("wrong mint_b close must preserve the position");

            // The same instruction with the position's stored mints remains a valid close.
            ctx.send_transaction(vec![close_tuna_lp_position_fusion_instruction(
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

    #[rstest]
    #[case(false)]
    #[case(true)]
    #[serial]
    fn test_open_position_with_liquidity_and_close_with_liquidity(#[case] permissionless: bool) {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let signer = Keypair::new();
            let ctx = RpcContext::new(&signer, fusion::get_fusion_pool_config_accounts(&signer.pubkey())).await;
            let test_market = setup_test_market(
                &ctx,
                test_market_args(),
                MarketMaker::Fusion,
                TestMarketArgs {
                    permissionless,
                    ..TestMarketArgs::default()
                },
            )
            .await
            .unwrap();

            let pool = fetch_fusion_pool(&ctx.rpc, &test_market.pool).unwrap();

            let actual_tick_index = pool.data.tick_current_index - (pool.data.tick_current_index % pool.data.tick_spacing as i32);

            let ix = open_and_increase_tuna_lp_position_fusion_instructions(
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
                close_active_tuna_lp_position_fusion_instructions(
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

    #[rstest]
    #[case(false)]
    #[case(true)]
    #[serial]
    fn test_collect_and_compound_uses_market_vaults(#[case] permissionless: bool) {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let signer = Keypair::new();
            let ctx = RpcContext::new(&signer, fusion::get_fusion_pool_config_accounts(&signer.pubkey())).await;
            let test_market = setup_test_market(
                &ctx,
                test_market_args(),
                MarketMaker::Fusion,
                TestMarketArgs {
                    permissionless,
                    ..TestMarketArgs::default()
                },
            )
            .await
            .unwrap();

            let pool = fetch_fusion_pool(&ctx.rpc, &test_market.pool).unwrap();
            let position_mint = Keypair::new();
            let actual_tick_index = pool.data.tick_current_index - (pool.data.tick_current_index % pool.data.tick_spacing as i32);

            ctx.send_transaction_with_signers(
                vec![open_tuna_lp_position_fusion_instruction(
                    &ctx.rpc,
                    &ctx.signer.pubkey(),
                    &position_mint.pubkey(),
                    &test_market.pool,
                    OpenTunaLpPositionFusionInstructionArgs {
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

            let instructions = collect_and_compound_fees_fusion_instructions(&ctx.rpc, &ctx.signer.pubkey(), &position_mint.pubkey(), false).unwrap();
            let instruction = instructions.iter().find(|instruction| instruction.program_id == crate::TUNA_ID).unwrap();

            assert_eq!(instruction.accounts[7].pubkey, test_market.vault_a);
            assert_eq!(instruction.accounts[8].pubkey, test_market.vault_b);
        });
    }

    #[rstest]
    #[case(false)]
    #[case(true)]
    #[serial]
    fn test_rebalance_position_authority_succeeds_and_stranger_is_rejected(#[case] permissionless: bool) {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let signer = Keypair::new();
            let ctx = RpcContext::new(&signer, fusion::get_fusion_pool_config_accounts(&signer.pubkey())).await;
            let test_market = setup_test_market(
                &ctx,
                test_market_args(),
                MarketMaker::Fusion,
                TestMarketArgs {
                    permissionless,
                    ..TestMarketArgs::default()
                },
            )
            .await
            .unwrap();

            let pool = fetch_fusion_pool(&ctx.rpc, &test_market.pool).unwrap();

            let actual_tick_index = pool.data.tick_current_index - (pool.data.tick_current_index % pool.data.tick_spacing as i32);

            let ix = open_and_increase_tuna_lp_position_fusion_instructions(
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

            let stranger = Keypair::new();
            ctx.send_transaction(vec![transfer(&ctx.signer.pubkey(), &stranger.pubkey(), 1_000_000_000)])
                .unwrap();
            let stranger_rebalance = rebalance_tuna_lp_position_fusion_instructions(&ctx.rpc, &stranger.pubkey(), &ix.position_mint).unwrap();
            assert_custom_error(
                ctx.send_transaction_with_signers(stranger_rebalance.instructions, vec![&stranger]),
                CONSTRAINT_RAW,
                "a stranger must not rebalance another authority's position",
            );

            ctx.send_transaction(
                rebalance_tuna_lp_position_fusion_instructions(&ctx.rpc, &ctx.signer.pubkey(), &ix.position_mint)
                    .unwrap()
                    .instructions,
            )
            .unwrap();
        });
    }

    #[test]
    #[serial]
    fn test_debt_free_rebalance_rejects_fusion_spot_ma_deviation() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let signer = Keypair::new();
            let ctx = RpcContext::new(&signer, fusion::get_fusion_pool_config_accounts(&signer.pubkey())).await;
            let mut market_args = test_market_args();
            market_args.oracle_price_deviation_threshold = 0;
            let test_market = setup_test_market(&ctx, market_args, MarketMaker::Fusion, TestMarketArgs::default())
                .await
                .unwrap();

            let pool = fetch_fusion_pool(&ctx.rpc, &test_market.pool).unwrap();
            let actual_tick_index = pool.data.tick_current_index - (pool.data.tick_current_index % pool.data.tick_spacing as i32);
            let ix = open_and_increase_tuna_lp_position_fusion_instructions(
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
                    borrow_a: 0,
                    borrow_b: 0,
                    min_added_amount_a: 0,
                    min_added_amount_b: 0,
                },
            )
            .unwrap();
            ctx.send_transaction_with_signers(ix.instructions, ix.additional_signers.iter().collect())
                .unwrap();

            let tuna_position = fetch_tuna_lp_position(&ctx.rpc, &get_tuna_liquidity_position_address(&ix.position_mint).0).unwrap();
            assert_eq!((tuna_position.data.loan_shares_a, tuna_position.data.loan_shares_b), (0, 0));

            swap_exact_in(&ctx, &pool.address, 100_000_000_000, &pool.data.token_mint_a, None)
                .await
                .unwrap();
            let moved_pool = fetch_fusion_pool(&ctx.rpc, &test_market.pool).unwrap();
            assert_ne!(moved_pool.data.sqrt_price, moved_pool.data.ma_sqrt_price);

            assert_custom_error(
                ctx.send_transaction(
                    rebalance_tuna_lp_position_fusion_instructions(&ctx.rpc, &ctx.signer.pubkey(), &ix.position_mint)
                        .unwrap()
                        .instructions,
                ),
                MA_PRICE_DEVIATION_THRESHOLD_EXCEEDED,
                "a debt-free Fusion rebalance must enforce the pool's MA reference price",
            );
        });
    }

    #[test]
    #[serial]
    fn test_liquidation_accepts_zero_total_position_with_positive_debt() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let signer = Keypair::new();
            let ctx = RpcContext::new(&signer, fusion::get_fusion_pool_config_accounts(&signer.pubkey())).await;
            let test_market = setup_test_market(&ctx, test_market_args(), MarketMaker::Fusion, TestMarketArgs::default())
                .await
                .unwrap();

            let pool = fetch_fusion_pool(&ctx.rpc, &test_market.pool).unwrap();
            let tuna_config = fetch_tuna_config(&ctx.rpc, &get_tuna_config_address().0).unwrap();
            let actual_tick_index = pool.data.tick_current_index - (pool.data.tick_current_index % pool.data.tick_spacing as i32);
            let ix = open_and_increase_tuna_lp_position_fusion_instructions(
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

            // Model a price-moved LP whose positive liquidity rounds to zero assets while
            // retaining debt, then exercise the real on-chain liquidation gate.
            let tuna_position_address = get_tuna_liquidity_position_address(&ix.position_mint).0;
            let mut tuna_position = fetch_tuna_lp_position(&ctx.rpc, &tuna_position_address).unwrap();
            tuna_position.data.liquidity = 1;
            tuna_position.data.leftovers_a = 0;
            tuna_position.data.leftovers_b = 0;
            ctx.set_account(&tuna_position_address, &with_serialized_data(tuna_position.account, &tuna_position.data))
                .await;

            let tuna_position = fetch_tuna_lp_position(&ctx.rpc, &tuna_position_address).unwrap();
            let vaults = fetch_all_vault(&ctx.rpc, &[test_market.vault_a, test_market.vault_b]).unwrap();
            let (total, debt) = tuna_position
                .data
                .compute_total_and_debt(pool.data.sqrt_price, &vaults[0].data, &vaults[1].data)
                .unwrap();
            assert_eq!(total, 0);
            assert!(debt > 0);
            let market = fetch_market(&ctx.rpc, &test_market.market).unwrap();
            assert_eq!(
                tuna_position
                    .data
                    .is_healthy(pool.data.sqrt_price, &market.data, &vaults[0].data, &vaults[1].data),
                Ok((false, u32::MAX))
            );

            ctx.send_transaction(
                liquidate_tuna_lp_position_fusion_instructions(
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
                .unwrap(),
            )
            .unwrap();

            let tuna_position_after = fetch_tuna_lp_position(&ctx.rpc, &tuna_position_address).unwrap();
            assert_eq!(tuna_position_after.data.state, TunaPositionState::Liquidated);
            assert_eq!(tuna_position_after.data.liquidity, 0);
        });
    }

    #[rstest]
    #[case(false)]
    #[case(true)]
    #[serial]
    fn test_liquidate_position(#[case] permissionless: bool) {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let signer = Keypair::new();
            let ctx = RpcContext::new(&signer, fusion::get_fusion_pool_config_accounts(&signer.pubkey())).await;
            let test_market = setup_test_market(
                &ctx,
                test_market_args(),
                MarketMaker::Fusion,
                TestMarketArgs {
                    permissionless,
                    ..TestMarketArgs::default()
                },
            )
            .await
            .unwrap();

            let pool = fetch_fusion_pool(&ctx.rpc, &test_market.pool).unwrap();
            let tuna_config = fetch_tuna_config(&ctx.rpc, &get_tuna_config_address().0).unwrap();

            let actual_tick_index = pool.data.tick_current_index - (pool.data.tick_current_index % pool.data.tick_spacing as i32);

            let ix = open_and_increase_tuna_lp_position_fusion_instructions(
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
            let vaults = fetch_all_vault(&ctx.rpc, &[test_market.vault_a, test_market.vault_b]).unwrap();

            ctx.send_transaction(
                liquidate_tuna_lp_position_fusion_instructions(
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
                .unwrap(),
            )
            .unwrap();
        });
    }
}
