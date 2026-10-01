#[cfg(test)]
mod tests {
    use crate::accounts::{fetch_all_vault, fetch_market, fetch_tuna_config, fetch_tuna_lp_position};
    use crate::instructions::{
        CreateMarketInstructionArgs, OpenTunaLpPositionOrcaInstructionArgs, SetLiquidatorAuthority, SetLiquidatorAuthorityInstructionArgs,
    };
    use crate::tests::orca::swap_exact_in;
    use crate::tests::*;
    use crate::types::MarketMaker;
    use crate::{
        close_active_tuna_lp_position_orca_instructions, close_tuna_lp_position_orca_instruction, collect_and_compound_fees_orca_instructions,
        decrease_tuna_lp_position_orca_instructions, get_tuna_config_address, get_tuna_liquidity_position_address, get_vault_address,
        increase_tuna_lp_position_orca_instructions, liquidate_tuna_lp_position_orca_instructions,
        open_and_increase_tuna_lp_position_orca_instructions, open_tuna_lp_position_orca_instruction, rebalance_tuna_lp_position_orca_instructions,
        CloseActiveTunaLpPositionArgs, DecreaseTunaLpPositionArgs, IncreaseTunaLpPositionArgs, OpenAndIncreaseTunaLpPositionArgs, TunaError,
        TunaPosition, HUNDRED_PERCENT, LEVERAGE_ONE, TUNA_POSITION_FLAGS_ALLOW_REBALANCING,
    };
    use defituna_sdk_core::fixed::Rounding;
    use orca_whirlpools_client::fetch_whirlpool;
    use orca_whirlpools_core::{price_to_sqrt_price, sqrt_price_to_tick_index};
    use serial_test::serial;
    use solana_keypair::Keypair;
    use solana_program_test::tokio;
    use solana_signer::Signer;
    use solana_system_interface::instruction::transfer;
    use spl_associated_token_account::{get_associated_token_address_with_program_id, instruction::create_associated_token_account_idempotent};

    /// Anchor custom error offset (6000) + `ErrorCode::InvalidPool` (607).
    const INVALID_POOL: &[&str] = &["0x19cf", "6607"];
    /// Anchor custom error offset (6000) + `ErrorCode::PositionNotEmpty` (625).
    const POSITION_NOT_EMPTY: &[&str] = &["0x19e1", "6625"];
    /// Anchor custom error offset (6000) + `ErrorCode::PositionValuationDegenerate` (629).
    const POSITION_VALUATION_DEGENERATE: &[&str] = &["0x19e5", "6629"];
    /// Anchor's built-in `ConstraintRaw` error (code 2003).
    const CONSTRAINT_RAW: &[&str] = &["0x7d3", "2003"];

    fn token_amount(ctx: &RpcContext, address: &solana_pubkey::Pubkey) -> u64 {
        let account = ctx.rpc.get_account(address).unwrap();
        u64::from_le_bytes(account.data[64..72].try_into().unwrap())
    }

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

    #[test]
    #[serial]
    fn test_close_rejects_outstanding_loan_shares_and_accepts_settled_position() {
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
            assert_eq!((tuna_position.data.loan_shares_a, tuna_position.data.loan_shares_b), (0, 0));

            // Model the orphaned-liability state directly after proving that the
            // AMM position and token accounts are otherwise ready to close.
            let mut indebted_position = tuna_position.data.clone();
            indebted_position.loan_shares_a = 1;
            ctx.set_account(&tuna_position_address, &with_serialized_data(tuna_position.account.clone(), &indebted_position))
                .await;

            assert_custom_error(
                ctx.send_transaction(vec![close_tuna_lp_position_orca_instruction(
                    &ctx.signer.pubkey(),
                    &indebted_position,
                    &test_market.token_program_a,
                    &test_market.token_program_b,
                )]),
                POSITION_NOT_EMPTY,
                "close_tuna_lp_position_orca must reject outstanding loan shares",
            );

            let tuna_position_after = fetch_tuna_lp_position(&ctx.rpc, &tuna_position_address).unwrap();
            assert_eq!(tuna_position_after.data.loan_shares_a, 1);

            // Restore the settled state and retain the existing successful-close
            // coverage so the new guard does not reject a genuinely empty position.
            ctx.set_account(&tuna_position_address, &with_serialized_data(tuna_position.account, &tuna_position.data))
                .await;
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

            let mut wrong_mint_ix = close_tuna_lp_position_orca_instruction(
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
                "close_tuna_lp_position_orca must reject a mint that differs from the stored position mint",
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

            let mut wrong_mint_b_ix = close_tuna_lp_position_orca_instruction(
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
                "close_tuna_lp_position_orca must reject mint_b when it differs from the stored position mint",
            );
            fetch_tuna_lp_position(&ctx.rpc, &tuna_position_address).expect("wrong mint_b close must preserve the position");

            // The same instruction with the position's stored mints remains a valid close.
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
    fn test_rebalance_position_authority_succeeds_and_stranger_is_rejected() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let signer = Keypair::new();
            let ctx = RpcContext::new(&signer, orca::get_whirlpool_config_accounts(&signer.pubkey())).await;
            let test_market = setup_test_market(&ctx, test_market_args(), MarketMaker::Orca, TestMarketArgs::default())
                .await
                .unwrap();

            // Make the configured liquidator distinct so the success path exercises only the position-authority branch.
            let configured_liquidator = Keypair::new().pubkey();
            assert_ne!(configured_liquidator, ctx.signer.pubkey());
            ctx.send_transaction(vec![SetLiquidatorAuthority {
                authority: ctx.signer.pubkey(),
                tuna_config: get_tuna_config_address().0,
            }
            .instruction(SetLiquidatorAuthorityInstructionArgs {
                liquidator_authority: configured_liquidator,
            })])
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

            let stranger = Keypair::new();
            ctx.send_transaction(vec![transfer(&ctx.signer.pubkey(), &stranger.pubkey(), 1_000_000_000)])
                .unwrap();
            let stranger_rebalance = rebalance_tuna_lp_position_orca_instructions(&ctx.rpc, &stranger.pubkey(), &ix.position_mint).unwrap();
            assert_custom_error(
                ctx.send_transaction_with_signers(stranger_rebalance.instructions, vec![&stranger]),
                CONSTRAINT_RAW,
                "a stranger must not rebalance another authority's position",
            );

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
    fn test_rebalance_position_as_configured_liquidator_succeeds() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let signer = Keypair::new();
            let ctx = RpcContext::new(&signer, orca::get_whirlpool_config_accounts(&signer.pubkey())).await;
            let test_market = setup_test_market(&ctx, test_market_args(), MarketMaker::Orca, TestMarketArgs::default())
                .await
                .unwrap();

            let liquidator = Keypair::new();
            assert_ne!(liquidator.pubkey(), ctx.signer.pubkey());
            ctx.send_transaction(vec![
                transfer(&ctx.signer.pubkey(), &liquidator.pubkey(), 1_000_000_000),
                SetLiquidatorAuthority {
                    authority: ctx.signer.pubkey(),
                    tuna_config: get_tuna_config_address().0,
                }
                .instruction(SetLiquidatorAuthorityInstructionArgs {
                    liquidator_authority: liquidator.pubkey(),
                }),
            ])
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

            let rebalance = rebalance_tuna_lp_position_orca_instructions(&ctx.rpc, &liquidator.pubkey(), &ix.position_mint).unwrap();
            ctx.send_transaction_with_signers(rebalance.instructions, vec![&liquidator]).unwrap();
        });
    }

    #[test]
    #[serial]
    fn test_zero_total_health_distinguishes_positive_from_rounded_debt_in_sdk() {
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

            let mut tuna_position = fetch_tuna_lp_position(&ctx.rpc, &get_tuna_liquidity_position_address(&ix.position_mint).0).unwrap();
            tuna_position.data.liquidity = 1;
            tuna_position.data.leftovers_a = 0;
            tuna_position.data.leftovers_b = 0;
            let market = fetch_market(&ctx.rpc, &test_market.market).unwrap();
            let vaults = fetch_all_vault(&ctx.rpc, &[test_market.vault_a, test_market.vault_b]).unwrap();
            let (total, debt) = tuna_position
                .data
                .compute_total_and_debt(pool.data.sqrt_price, &vaults[0].data, &vaults[1].data)
                .unwrap();

            assert_eq!(total, 0);
            assert!(debt > 0);
            assert_eq!(
                tuna_position
                    .data
                    .is_healthy(pool.data.sqrt_price, &market.data, &vaults[0].data, &vaults[1].data),
                Ok((false, u32::MAX))
            );
            assert_eq!(
                tuna_position
                    .data
                    .compute_leverage(pool.data.sqrt_price, &vaults[0].data, &vaults[1].data),
                Err(TunaError::LeverageIsOutOfRange)
            );

            // One raw A unit is worth less than one raw B unit at this pool
            // price, so both sides of this indebted position round to zero.
            tuna_position.data.liquidity = 0;
            tuna_position.data.leftovers_a = 1;
            tuna_position.data.loan_shares_a = 1;
            tuna_position.data.loan_shares_b = 0;
            let (total, debt) = tuna_position
                .data
                .compute_total_and_debt(pool.data.sqrt_price, &vaults[0].data, &vaults[1].data)
                .unwrap();
            assert_eq!((total, debt), (0, 0));
            assert_eq!(
                tuna_position
                    .data
                    .is_healthy(pool.data.sqrt_price, &market.data, &vaults[0].data, &vaults[1].data),
                Err(TunaError::PositionValuationDegenerate)
            );
            assert_eq!(
                tuna_position
                    .data
                    .compute_leverage(pool.data.sqrt_price, &vaults[0].data, &vaults[1].data),
                Err(TunaError::LeverageIsOutOfRange)
            );
        });
    }

    #[test]
    #[serial]
    fn test_liquidation_rejects_exactly_healthy_degenerate_valuation_without_charging_fee() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let signer = Keypair::new();
            let ctx = RpcContext::new(&signer, orca::get_whirlpool_config_accounts(&signer.pubkey())).await;
            let mut market_args = test_market_args();
            market_args.liquidation_fee = HUNDRED_PERCENT / 10;
            let test_market = setup_test_market(&ctx, market_args, MarketMaker::Orca, TestMarketArgs::default())
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
                    borrow_a: 500_000_000,
                    borrow_b: 0,
                    min_added_amount_a: 0,
                    min_added_amount_b: 0,
                },
            )
            .unwrap();
            ctx.send_transaction_with_signers(ix.instructions, ix.additional_signers.iter().collect())
                .unwrap();

            // Move the pool far below the LP range. The position and its debt are
            // then both entirely token A, while A's B-denominated value floors to zero.
            let low_sqrt_price = price_to_sqrt_price(0.000_000_01, 9, 6);
            let mut manipulated_pool = pool.data.clone();
            manipulated_pool.sqrt_price = low_sqrt_price;
            manipulated_pool.tick_current_index = sqrt_price_to_tick_index(low_sqrt_price);
            ctx.set_account(&pool.address, &with_serialized_data(pool.account, &manipulated_pool))
                .await;

            let tuna_position_address = get_tuna_liquidity_position_address(&ix.position_mint).0;
            let mut tuna_position = fetch_tuna_lp_position(&ctx.rpc, &tuna_position_address).unwrap();
            // The ratio swap can leave a few raw B units. Remove that setup artifact
            // from both accounting and custody to model the reviewer's all-A state.
            let position_ata_b =
                get_associated_token_address_with_program_id(&tuna_position_address, &test_market.mint_b_address, &test_market.token_program_b);
            let mut position_ata_b_account = ctx.rpc.get_account(&position_ata_b).unwrap();
            assert_eq!(token_amount(&ctx, &position_ata_b), tuna_position.data.leftovers_b);
            position_ata_b_account.data[64..72].copy_from_slice(&0u64.to_le_bytes());
            ctx.set_account(&position_ata_b, &position_ata_b_account).await;
            tuna_position.data.leftovers_b = 0;
            ctx.set_account(&tuna_position_address, &with_serialized_data(tuna_position.account, &tuna_position.data))
                .await;
            let tuna_position = fetch_tuna_lp_position(&ctx.rpc, &tuna_position_address).unwrap();
            let market = fetch_market(&ctx.rpc, &test_market.market).unwrap();
            let vaults = fetch_all_vault(&ctx.rpc, &[test_market.vault_a, test_market.vault_b]).unwrap();
            let (liquidity_a, liquidity_b) = tuna_position.data.get_total_balance(low_sqrt_price).unwrap();
            let total_a = liquidity_a + tuna_position.data.leftovers_a;
            let total_b = liquidity_b + tuna_position.data.leftovers_b;
            let debt_a = vaults[0]
                .data
                .calculate_borrowed_funds(tuna_position.data.loan_shares_a, Rounding::Up)
                .unwrap();
            let debt_b = vaults[1]
                .data
                .calculate_borrowed_funds(tuna_position.data.loan_shares_b, Rounding::Up)
                .unwrap();

            assert!(tuna_position.data.liquidity > 0);
            assert_eq!((total_b, debt_b), (0, 0));
            assert!(debt_a > 0 && debt_a < total_a);
            assert!(
                (debt_a as u128) * (HUNDRED_PERCENT as u128) < (total_a as u128) * (market.data.liquidation_threshold as u128),
                "the exact token-A debt ratio must remain below the liquidation threshold"
            );
            let liquidation_fee_a = total_a * market.data.liquidation_fee as u64 / HUNDRED_PERCENT as u64;
            assert!(liquidation_fee_a > 0);
            assert!(total_a - debt_a >= liquidation_fee_a, "token A must cover both full repayment and a nonzero liquidation fee");
            assert_eq!(
                tuna_position
                    .data
                    .compute_total_and_debt(low_sqrt_price, &vaults[0].data, &vaults[1].data),
                Ok((0, 0))
            );

            let fee_before_a = token_amount(&ctx, &test_market.ata_a);
            let fee_before_b = token_amount(&ctx, &test_market.ata_b);
            assert_custom_error(
                ctx.send_transaction(liquidate_tuna_lp_position_orca_instructions(
                    &ctx.signer.pubkey(),
                    &tuna_position.data,
                    &tuna_config.data,
                    &vaults[0].address,
                    &vaults[0].data,
                    &vaults[1].address,
                    &vaults[1].data,
                    &manipulated_pool,
                    &test_market.mint_a_account,
                    &test_market.mint_b_account,
                    None,
                )
                .unwrap()),
                POSITION_VALUATION_DEGENERATE,
                "liquidation must abort when debt-bearing valuation precision is exhausted",
            );
            assert_eq!(token_amount(&ctx, &test_market.ata_a), fee_before_a);
            assert_eq!(token_amount(&ctx, &test_market.ata_b), fee_before_b);

            let position_after = fetch_tuna_lp_position(&ctx.rpc, &tuna_position.address).unwrap();
            assert_eq!(position_after.data.liquidity, tuna_position.data.liquidity);
            assert_eq!(position_after.data.loan_shares_a, tuna_position.data.loan_shares_a);
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

            ctx.send_transaction(
                liquidate_tuna_lp_position_orca_instructions(
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
