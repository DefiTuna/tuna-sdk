#[cfg(test)]
mod tests {
    use crate::accounts::{fetch_all_vault, fetch_market, fetch_tuna_config, fetch_tuna_spot_position};
    use crate::instructions::{CreateMarketInstructionArgs, OpenTunaSpotPositionInstructionArgs};
    use crate::modify_tuna_spot_position_fusion::ModifyTunaSpotPositionArgs;
    use crate::modify_tuna_spot_position_orca::modify_tuna_spot_position_orca_instructions;
    use crate::tests::orca::swap_exact_in;
    use crate::tests::*;
    use crate::types::{MarketMaker, PoolToken};
    use crate::{
        close_tuna_spot_position_instructions, get_tuna_config_address, get_tuna_spot_position_address, get_vault_address,
        liquidate_tuna_spot_position_orca_instructions, open_tuna_spot_position_instructions, TunaError, HUNDRED_PERCENT, LEVERAGE_ONE,
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
    fn test_open_increase_decrease_close_position() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let signer = Keypair::new();
            let ctx = RpcContext::new(&signer, orca::get_whirlpool_config_accounts(&signer.pubkey())).await;
            let test_market = setup_test_market(&ctx, test_market_args(), MarketMaker::Orca, TestMarketArgs::default())
                .await
                .unwrap();

            let instructions = open_tuna_spot_position_instructions(
                &ctx.rpc,
                &ctx.signer.pubkey(),
                &test_market.pool,
                OpenTunaSpotPositionInstructionArgs {
                    position_token: PoolToken::A,
                    collateral_token: PoolToken::A,
                },
            )
            .unwrap();

            ctx.send_transaction(instructions).unwrap();

            ctx.send_transaction(
                modify_tuna_spot_position_orca_instructions(
                    &ctx.rpc,
                    &ctx.signer.pubkey(),
                    &test_market.pool,
                    None,
                    ModifyTunaSpotPositionArgs {
                        decrease_percent: 0,
                        collateral_amount: 1_000_000_000,
                        borrow_amount: 1_000_000_000,
                        required_swap_amount: 0,
                    },
                )
                .unwrap(),
            )
            .unwrap();

            ctx.send_transaction(
                modify_tuna_spot_position_orca_instructions(
                    &ctx.rpc,
                    &ctx.signer.pubkey(),
                    &test_market.pool,
                    None,
                    ModifyTunaSpotPositionArgs {
                        decrease_percent: HUNDRED_PERCENT,
                        collateral_amount: 0,
                        borrow_amount: 0,
                        required_swap_amount: 0,
                    },
                )
                .unwrap(),
            )
            .unwrap();

            ctx.send_transaction(close_tuna_spot_position_instructions(&ctx.rpc, &ctx.signer.pubkey(), &test_market.pool).unwrap())
                .unwrap();
        });
    }

    #[test]
    #[serial]
    fn test_liquidate_zero_total_spot_long_and_classify_residual_b_debt() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let signer = Keypair::new();
            let ctx = RpcContext::new(&signer, orca::get_whirlpool_config_accounts(&signer.pubkey())).await;
            let mut market_args = test_market_args();
            market_args.oracle_price_deviation_threshold = HUNDRED_PERCENT;
            let test_market = setup_test_market(&ctx, market_args, MarketMaker::Orca, TestMarketArgs::default())
                .await
                .unwrap();

            let initial_pool = fetch_whirlpool(&ctx.rpc, &test_market.pool).unwrap();
            let tuna_config = fetch_tuna_config(&ctx.rpc, &get_tuna_config_address().0).unwrap();

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

            // Drive down the A/B price after opening a tiny but ordinary spot long.
            // Its token-A assets then floor below one raw B unit while its raw-B
            // debt remains positive.
            for _ in 0..6 {
                swap_exact_in(&ctx, &initial_pool.address, 500_000_000_000, &initial_pool.data.token_mint_a, None)
                    .await
                    .unwrap();
            }

            let low_pool = fetch_whirlpool(&ctx.rpc, &test_market.pool).unwrap();
            assert!(low_pool.data.sqrt_price < initial_pool.data.sqrt_price);
            let tuna_position_address = get_tuna_spot_position_address(&signer.pubkey(), &test_market.pool).0;
            let tuna_position = fetch_tuna_spot_position(&ctx.rpc, &tuna_position_address).unwrap();
            let market_before = fetch_market(&ctx.rpc, &test_market.market).unwrap();
            let vaults_before = fetch_all_vault(&ctx.rpc, &[test_market.vault_a, test_market.vault_b]).unwrap();

            assert_eq!(tuna_position.data.position_token, PoolToken::A);
            assert!(tuna_position.data.loan_shares > 0);
            let (total, debt) = tuna_position
                .data
                .compute_total_and_debt(low_pool.data.sqrt_price, &vaults_before[0].data, &vaults_before[1].data)
                .unwrap();
            assert_eq!(total, 0);
            assert!(debt > 0);
            assert_eq!(
                tuna_position
                    .data
                    .is_healthy(low_pool.data.sqrt_price, &market_before.data, &vaults_before[0].data, &vaults_before[1].data),
                Ok((false, u32::MAX))
            );
            assert_eq!(
                tuna_position
                    .data
                    .compute_leverage(low_pool.data.sqrt_price, &vaults_before[0].data, &vaults_before[1].data),
                Err(TunaError::LeverageIsOutOfRange)
            );

            ctx.send_transaction(liquidate_tuna_spot_position_orca_instructions(
                &ctx.signer.pubkey(),
                &tuna_position.data,
                &tuna_config.data,
                &vaults_before[0].address,
                &vaults_before[0].data,
                &vaults_before[1].address,
                &vaults_before[1].data,
                &low_pool.data,
                &test_market.mint_a_account,
                &test_market.mint_b_account,
                None,
            )
            .unwrap())
            .unwrap();

            let market_after = fetch_market(&ctx.rpc, &test_market.market).unwrap();
            let vaults_after = fetch_all_vault(&ctx.rpc, &[test_market.vault_a, test_market.vault_b]).unwrap();
            assert_eq!(market_after.data.bad_debt_b, market_before.data.bad_debt_b + tuna_position.data.loan_shares);
            assert_eq!(vaults_after[1].data.unpaid_debt_shares, vaults_before[1].data.unpaid_debt_shares + tuna_position.data.loan_shares);
            assert!(fetch_tuna_spot_position(&ctx.rpc, &tuna_position_address).is_err());
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
                    borrow_amount: 1_500_000_000,
                    required_swap_amount: 0,
                },
            )
            .unwrap();
            instructions.append(&mut increase_ixs);

            ctx.send_transaction(instructions).unwrap();

            swap_exact_in(&ctx, &pool.address, 500000000000, &pool.data.token_mint_a, None)
                .await
                .unwrap();

            let tuna_position_address = get_tuna_spot_position_address(&signer.pubkey(), &test_market.pool).0;
            let tuna_position = fetch_tuna_spot_position(&ctx.rpc, &tuna_position_address).unwrap();
            let vaults = fetch_all_vault(
                &ctx.rpc,
                &[
                    get_vault_address(&test_market.mint_a_address, None).0,
                    get_vault_address(&test_market.mint_b_address, None).0,
                ],
            )
            .unwrap();

            ctx.send_transaction(
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
                .unwrap(),
            )
            .unwrap();
        });
    }
}
