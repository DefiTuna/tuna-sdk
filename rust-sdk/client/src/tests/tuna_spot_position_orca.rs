#[cfg(test)]
mod tests {
    use crate::accounts::{fetch_all_vault, fetch_tuna_config, fetch_tuna_spot_position};
    use crate::instructions::{CreateMarketInstructionArgs, OpenTunaSpotPositionOrcaInstructionArgs};
    use crate::tests::orca::swap_exact_in;
    use crate::tests::*;
    use crate::types::{MarketMaker, PoolToken};
    use crate::{
        close_active_tuna_spot_position_orca_instructions, close_tuna_spot_position_instructions, decrease_tuna_spot_position_orca_instructions,
        get_tuna_config_address, get_tuna_spot_position_address, get_vault_address, increase_tuna_spot_position_orca_instructions,
        liquidate_tuna_spot_position_orca_instructions, open_and_increase_tuna_spot_position_orca_instructions,
        open_tuna_spot_position_orca_instructions, DecreaseTunaSpotPositionArgs, IncreaseTunaSpotPositionArgs, OpenAndIncreaseTunaSpotPositionArgs,
        HUNDRED_PERCENT, LEVERAGE_ONE,
    };
    use orca_whirlpools_client::fetch_whirlpool;
    use serial_test::serial;
    use solana_keypair::Keypair;
    use solana_program_test::tokio;
    use solana_signer::Signer;

    fn test_market_args() -> CreateMarketInstructionArgs {
        CreateMarketInstructionArgs {
            market_maker: MarketMaker::Orca,
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
            let test_market = setup_test_market(&ctx, test_market_args(), false, false, false).await.unwrap();

            let instructions = open_tuna_spot_position_orca_instructions(
                &ctx.rpc,
                &ctx.signer.pubkey(),
                &test_market.pool,
                OpenTunaSpotPositionOrcaInstructionArgs {
                    position_token: PoolToken::A,
                    collateral_token: PoolToken::A,
                },
            )
            .unwrap();

            ctx.send_transaction(instructions).unwrap();

            ctx.send_transaction(
                increase_tuna_spot_position_orca_instructions(
                    &ctx.rpc,
                    &ctx.signer.pubkey(),
                    &test_market.pool,
                    IncreaseTunaSpotPositionArgs {
                        collateral_amount: 1_000_000_000,
                        borrow_amount: 1_000_000_000,
                        min_swap_amount_out: 0,
                    },
                )
                .unwrap(),
            )
            .unwrap();

            ctx.send_transaction(
                decrease_tuna_spot_position_orca_instructions(
                    &ctx.rpc,
                    &ctx.signer.pubkey(),
                    &test_market.pool,
                    DecreaseTunaSpotPositionArgs {
                        withdraw_percent: HUNDRED_PERCENT,
                        max_swap_amount_in: 0,
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
    fn test_open_position_with_liquidity_and_close_with_liquidity() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let signer = Keypair::new();
            let ctx = RpcContext::new(&signer, orca::get_whirlpool_config_accounts(&signer.pubkey())).await;
            let test_market = setup_test_market(&ctx, test_market_args(), false, false, false).await.unwrap();

            let instructions = open_and_increase_tuna_spot_position_orca_instructions(
                &ctx.rpc,
                &ctx.signer.pubkey(),
                &test_market.pool,
                OpenAndIncreaseTunaSpotPositionArgs {
                    position_token: PoolToken::A,
                    collateral_token: PoolToken::A,
                    collateral_amount: 1_000_000_000,
                    borrow_amount: 1_000_000_000,
                    min_swap_amount_out: 0,
                },
            )
            .unwrap();

            ctx.send_transaction(instructions).unwrap();

            ctx.send_transaction(close_active_tuna_spot_position_orca_instructions(&ctx.rpc, &ctx.signer.pubkey(), &test_market.pool, 0).unwrap())
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
            let test_market = setup_test_market(&ctx, test_market_args(), false, false, false).await.unwrap();

            let pool = fetch_whirlpool(&ctx.rpc, &test_market.pool).unwrap();
            let tuna_config = fetch_tuna_config(&ctx.rpc, &get_tuna_config_address().0).unwrap();

            let instructions = open_and_increase_tuna_spot_position_orca_instructions(
                &ctx.rpc,
                &ctx.signer.pubkey(),
                &test_market.pool,
                OpenAndIncreaseTunaSpotPositionArgs {
                    position_token: PoolToken::A,
                    collateral_token: PoolToken::A,
                    collateral_amount: 1_000_000_000,
                    borrow_amount: 1_500_000_000,
                    min_swap_amount_out: 0,
                },
            )
            .unwrap();

            ctx.send_transaction(instructions).unwrap();

            swap_exact_in(&ctx, &pool.address, 500000000000, &pool.data.token_mint_a, None)
                .await
                .unwrap();

            let tuna_position_address = get_tuna_spot_position_address(&signer.pubkey(), &test_market.pool).0;
            let tuna_position = fetch_tuna_spot_position(&ctx.rpc, &tuna_position_address).unwrap();
            let vaults = fetch_all_vault(
                &ctx.rpc,
                &[
                    get_vault_address(&test_market.mint_a_address).0,
                    get_vault_address(&test_market.mint_b_address).0,
                ],
            )
            .unwrap();

            ctx.send_transaction(liquidate_tuna_spot_position_orca_instructions(
                &ctx.signer.pubkey(),
                &tuna_position.data,
                &tuna_config.data,
                &vaults[0].data,
                &vaults[1].data,
                &pool.data,
                &test_market.token_program_a,
                &test_market.token_program_b,
                true,
                None,
            ))
            .unwrap();
        });
    }
}
