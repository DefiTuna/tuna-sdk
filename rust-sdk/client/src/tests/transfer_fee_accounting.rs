#[cfg(test)]
mod tests {
    use crate::accounts::{fetch_all_vault, fetch_lending_position, fetch_tuna_lp_position, fetch_tuna_spot_position};
    use crate::instructions::{
        CreateMarketInstructionArgs, OpenTunaSpotPositionInstructionArgs, RepayTunaLpPositionDebt, RepayTunaLpPositionDebtInstructionArgs,
        SetDefaultMaxPercentageOfLeftovers, SetDefaultMaxPercentageOfLeftoversInstructionArgs,
    };
    use crate::tests::*;
    use crate::types::{MarketMaker, PoolToken};
    use crate::{
        close_tuna_spot_position_instruction, close_tuna_spot_position_instructions, deposit_instruction, get_lending_position_address,
        get_tuna_config_address, get_tuna_liquidity_position_address, get_tuna_spot_position_address,
        open_and_increase_tuna_lp_position_orca_instructions, open_tuna_spot_position_instructions, OpenAndIncreaseTunaLpPositionArgs,
        HUNDRED_PERCENT, LEVERAGE_ONE,
    };
    use orca_whirlpools_client::fetch_whirlpool;
    use serial_test::serial;
    use solana_keypair::Keypair;
    use solana_program_test::tokio;
    use solana_pubkey::Pubkey;
    use solana_sdk_ids::system_program;
    use solana_signer::Signer;
    use spl_associated_token_account::get_associated_token_address_with_program_id;
    use spl_token_2022::extension::transfer_fee::{TransferFeeAmount, TransferFeeConfig};
    use spl_token_2022::extension::{BaseStateWithExtensions, BaseStateWithExtensionsMut, StateWithExtensions, StateWithExtensionsMut};
    use spl_token_2022::state::{Account as TokenAccount, Mint};

    fn test_market_args() -> CreateMarketInstructionArgs {
        CreateMarketInstructionArgs {
            address_lookup_table: Default::default(),
            max_leverage: LEVERAGE_ONE * 5,
            protocol_fee: 0,
            protocol_fee_on_collateral: 0,
            liquidation_fee: 10_000,
            liquidation_threshold: 920_000,
            oracle_price_deviation_threshold: HUNDRED_PERCENT / 2,
            disabled: false,
            borrow_limit_a: u64::MAX,
            borrow_limit_b: u64::MAX,
            unused: 0,
            rebalance_protocol_fee: 0,
            spot_position_size_limit_a: u64::MAX,
            spot_position_size_limit_b: u64::MAX,
        }
    }

    fn token_amounts(ctx: &RpcContext, address: &Pubkey) -> (u64, u64) {
        let account = ctx.rpc.get_account(address).unwrap();
        let state = StateWithExtensions::<TokenAccount>::unpack(&account.data).unwrap();
        let withheld = state
            .get_extension::<TransferFeeAmount>()
            .map(|extension| u64::from(extension.withheld_amount))
            .unwrap_or(0);
        (state.base.amount, withheld)
    }

    async fn set_withheld_amount(ctx: &RpcContext, address: &Pubkey, withheld_amount: u64) {
        let mut account = ctx.rpc.get_account(address).unwrap();
        {
            let mut state = StateWithExtensionsMut::<TokenAccount>::unpack(&mut account.data).unwrap();
            state.base.amount = 0;
            state.get_extension_mut::<TransferFeeAmount>().unwrap().withheld_amount = withheld_amount.into();
        }
        ctx.set_account(address, &account).await;
    }

    async fn append_v8_scaled_ui_amount_fixture(ctx: &RpcContext, mint: &Pubkey) {
        // The client test harness links spl-token-2022 v6 and cannot initialize
        // v8 ScaledUiAmount. Append its real v8 TLV tag/length to the otherwise
        // valid fee mint so the SDK close path sees the forward-compatibility
        // layout that broke enum-based detection.
        const SCALED_UI_AMOUNT_EXTENSION_TYPE: u16 = 25;
        const SCALED_UI_AMOUNT_CONFIG_LENGTH: u16 = 56;

        let mut account = ctx.rpc.get_account(mint).unwrap();
        account.data.extend_from_slice(&SCALED_UI_AMOUNT_EXTENSION_TYPE.to_le_bytes());
        account.data.extend_from_slice(&SCALED_UI_AMOUNT_CONFIG_LENGTH.to_le_bytes());
        account.data.resize(account.data.len() + usize::from(SCALED_UI_AMOUNT_CONFIG_LENGTH), 0);
        ctx.set_account(mint, &account).await;
    }

    #[test]
    #[serial]
    fn transfer_fee_vault_accounting_and_sdk_harvest() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        runtime.block_on(async {
            let signer = Keypair::new();
            let ctx = RpcContext::new(&signer, orca::get_whirlpool_config_accounts(&signer.pubkey())).await;
            let test_market = setup_test_market(
                &ctx,
                test_market_args(),
                MarketMaker::Orca,
                TestMarketArgs {
                    mint_b_has_transfer_fee: true,
                    ..TestMarketArgs::default()
                },
            )
            .await
            .unwrap();

            ctx.send_transaction(vec![SetDefaultMaxPercentageOfLeftovers {
                authority: ctx.signer.pubkey(),
                tuna_config: get_tuna_config_address().0,
            }
            .instruction(SetDefaultMaxPercentageOfLeftoversInstructionArgs {
                max_percentage_of_leftovers: HUNDRED_PERCENT / 10,
            })])
            .unwrap();

            // Deposit: the vault and lending ledgers must claim only the
            // spendable amount that arrives after the destination fee.
            let deposit_amount = 10_000_000;
            let vaults_before = fetch_all_vault(&ctx.rpc, &[test_market.vault_a, test_market.vault_b]).unwrap();
            let vault_b_before = &vaults_before[1].data;
            let vault_b_ata =
                get_associated_token_address_with_program_id(&test_market.vault_b, &test_market.mint_b_address, &test_market.token_program_b);
            let (vault_spendable_before, _) = token_amounts(&ctx, &vault_b_ata);
            let lending_position_address = get_lending_position_address(&ctx.signer.pubkey(), &test_market.mint_b_address).0;
            let lending_before = fetch_lending_position(&ctx.rpc, &lending_position_address).unwrap();

            ctx.send_transaction(vec![deposit_instruction(
                &ctx.signer.pubkey(),
                &test_market.mint_b_address,
                &test_market.token_program_b,
                None,
                deposit_amount,
            )])
            .unwrap();

            let vaults_after_deposit = fetch_all_vault(&ctx.rpc, &[test_market.vault_a, test_market.vault_b]).unwrap();
            let vault_b_after_deposit = &vaults_after_deposit[1].data;
            let lending_after = fetch_lending_position(&ctx.rpc, &lending_position_address).unwrap();
            let (vault_spendable_after_deposit, vault_withheld_after_deposit) = token_amounts(&ctx, &vault_b_ata);
            let realized_deposit = vault_spendable_after_deposit - vault_spendable_before;
            let expected_deposit_shares =
                (realized_deposit as u128 * vault_b_before.deposited_shares as u128 / vault_b_before.deposited_funds as u128) as u64;

            assert_eq!(realized_deposit, 9_000_000);
            assert_eq!(vault_withheld_after_deposit, 10_000_000_000 + 1_000_000);
            assert_eq!(vault_b_after_deposit.deposited_funds - vault_b_before.deposited_funds, realized_deposit);
            assert_eq!(vault_b_after_deposit.deposited_shares - vault_b_before.deposited_shares, expected_deposit_shares);
            assert_eq!(lending_after.data.deposited_funds - lending_before.data.deposited_funds, realized_deposit);
            assert_eq!(lending_after.data.deposited_shares - lending_before.data.deposited_shares, expected_deposit_shares);

            // Borrow through the shared LP increase seam. Debt must equal the
            // vault's gross spendable outflow; SPL withholds the fee on the
            // position ATA, which receives the requested net amount.
            let pool = fetch_whirlpool(&ctx.rpc, &test_market.pool).unwrap();
            let actual_tick_index = pool.data.tick_current_index - (pool.data.tick_current_index % pool.data.tick_spacing as i32);
            let borrow_amount = 10_000_000;
            let vaults_before_borrow = fetch_all_vault(&ctx.rpc, &[test_market.vault_a, test_market.vault_b]).unwrap();
            let (vault_spendable_before_borrow, _) = token_amounts(&ctx, &vault_b_ata);

            let open = open_and_increase_tuna_lp_position_orca_instructions(
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
                    // Covers the second transfer fee when Whirlpool moves the
                    // borrowed net amount from the position into its vault.
                    collateral_b: 200_000_000,
                    borrow_a: 0,
                    borrow_b: borrow_amount,
                    min_added_amount_a: 0,
                    min_added_amount_b: 0,
                },
            )
            .unwrap();
            ctx.send_transaction_with_signers(open.instructions, open.additional_signers.iter().collect())
                .unwrap();

            let tuna_position_address = get_tuna_liquidity_position_address(&open.position_mint).0;
            let tuna_position = fetch_tuna_lp_position(&ctx.rpc, &tuna_position_address).unwrap();
            let tuna_position_ata_b =
                get_associated_token_address_with_program_id(&tuna_position_address, &test_market.mint_b_address, &test_market.token_program_b);
            let (_, position_withheld_after_borrow) = token_amounts(&ctx, &tuna_position_ata_b);
            let vaults_after_borrow = fetch_all_vault(&ctx.rpc, &[test_market.vault_a, test_market.vault_b]).unwrap();
            let (vault_spendable_after_borrow, _) = token_amounts(&ctx, &vault_b_ata);
            let realized_borrow_outflow = vault_spendable_before_borrow - vault_spendable_after_borrow;
            let debt_increase = vaults_after_borrow[1].data.borrowed_funds - vaults_before_borrow[1].data.borrowed_funds;

            let mint_state = StateWithExtensions::<Mint>::unpack(&test_market.mint_b_account.data).unwrap();
            let fee_config = mint_state.get_extension::<TransferFeeConfig>().unwrap();
            let epoch = ctx.rpc.get_epoch_info().unwrap().epoch;
            let transfer_fee = fee_config.calculate_epoch_fee(epoch, realized_borrow_outflow).unwrap();
            assert_eq!(realized_borrow_outflow - transfer_fee, borrow_amount);
            assert!(position_withheld_after_borrow >= transfer_fee);
            assert_eq!(debt_increase, realized_borrow_outflow);
            assert!(tuna_position.data.loan_shares_b > 0);

            // Repay through the explicit LP repayment instruction. The vault
            // receives net, only that net retires debt, and the fee shortfall
            // remains represented by outstanding loan shares.
            let repay_amount = 1_000_000;
            let vaults_before_repay = fetch_all_vault(&ctx.rpc, &[test_market.vault_a, test_market.vault_b]).unwrap();
            let (vault_spendable_before_repay, _) = token_amounts(&ctx, &vault_b_ata);
            let tuna_position_ata_a =
                get_associated_token_address_with_program_id(&tuna_position_address, &test_market.mint_a_address, &test_market.token_program_a);
            let repay_instruction = RepayTunaLpPositionDebt {
                authority: ctx.signer.pubkey(),
                mint_a: test_market.mint_a_address,
                mint_b: test_market.mint_b_address,
                market: test_market.market,
                vault_a: test_market.vault_a,
                vault_b: test_market.vault_b,
                vault_a_ata: get_associated_token_address_with_program_id(
                    &test_market.vault_a,
                    &test_market.mint_a_address,
                    &test_market.token_program_a,
                ),
                vault_b_ata,
                tuna_position: tuna_position_address,
                tuna_position_ata_a,
                tuna_position_ata_b,
                tuna_position_owner_ata_a: test_market.ata_a,
                tuna_position_owner_ata_b: test_market.ata_b,
                token_program_a: test_market.token_program_a,
                token_program_b: test_market.token_program_b,
                memo_program: spl_memo::ID,
                system_program: system_program::ID,
            }
            .instruction(RepayTunaLpPositionDebtInstructionArgs {
                collateral_funds_a: 0,
                collateral_funds_b: repay_amount,
            });
            ctx.send_transaction(vec![repay_instruction]).unwrap();

            let vaults_after_repay = fetch_all_vault(&ctx.rpc, &[test_market.vault_a, test_market.vault_b]).unwrap();
            let (vault_spendable_after_repay, _) = token_amounts(&ctx, &vault_b_ata);
            let tuna_position_after_repay = fetch_tuna_lp_position(&ctx.rpc, &tuna_position_address).unwrap();
            let realized_repay = vault_spendable_after_repay - vault_spendable_before_repay;
            let retired_debt = vaults_before_repay[1].data.borrowed_funds - vaults_after_repay[1].data.borrowed_funds;

            assert_eq!(realized_repay, 900_000);
            assert_eq!(retired_debt, realized_repay);
            assert!(realized_repay < repay_amount);
            assert!(tuna_position_after_repay.data.loan_shares_b > 0);

            // Close: synthesize the exact physically-empty/withheld-present
            // state. A direct Tuna instruction fails with the distinct error;
            // the RPC SDK builder detects only mint B's extension, prepends one
            // permissionless harvest, and then closes successfully.
            let vaults_before_close = fetch_all_vault(&ctx.rpc, &[test_market.vault_a, test_market.vault_b]).unwrap();
            let vault_b_ledger_before_close = (
                vaults_before_close[1].data.deposited_funds,
                vaults_before_close[1].data.deposited_shares,
                vaults_before_close[1].data.borrowed_funds,
                vaults_before_close[1].data.borrowed_shares,
            );
            let (vault_spendable_before_close, _) = token_amounts(&ctx, &vault_b_ata);

            ctx.send_transaction(
                open_tuna_spot_position_instructions(
                    &ctx.rpc,
                    &ctx.signer.pubkey(),
                    &test_market.pool,
                    OpenTunaSpotPositionInstructionArgs {
                        position_token: PoolToken::A,
                        collateral_token: PoolToken::A,
                    },
                )
                .unwrap(),
            )
            .unwrap();

            let spot_position_address = get_tuna_spot_position_address(&ctx.signer.pubkey(), &test_market.pool).0;
            let spot_position = fetch_tuna_spot_position(&ctx.rpc, &spot_position_address).unwrap();
            let spot_position_ata_b =
                get_associated_token_address_with_program_id(&spot_position_address, &test_market.mint_b_address, &test_market.token_program_b);
            set_withheld_amount(&ctx, &spot_position_ata_b, 1).await;

            let direct_close = close_tuna_spot_position_instruction(
                &ctx.signer.pubkey(),
                &spot_position.data,
                &spot_position.address,
                &test_market.token_program_a,
                &test_market.token_program_b,
            );
            let direct_error = ctx.send_transaction(vec![direct_close]).unwrap_err().to_string();
            assert!(direct_error.contains("0x1a18") || direct_error.contains("6680"), "unexpected direct-close error: {direct_error}");

            append_v8_scaled_ui_amount_fixture(&ctx, &test_market.mint_b_address).await;
            let close_instructions = close_tuna_spot_position_instructions(&ctx.rpc, &ctx.signer.pubkey(), &test_market.pool).unwrap();
            assert_eq!(close_instructions.len(), 2);
            assert_eq!(close_instructions[0].program_id, spl_token_2022::ID);
            assert_eq!(close_instructions[0].accounts[0].pubkey, test_market.mint_b_address);
            assert!(close_instructions[0].accounts[0].is_writable);
            assert_eq!(close_instructions[0].accounts[1].pubkey, spot_position_ata_b);
            assert_eq!(close_instructions[1].program_id, crate::TUNA_ID);

            ctx.send_transaction(close_instructions).unwrap();
            assert!(ctx.rpc.get_account(&spot_position_address).is_err());

            let vaults_after_close = fetch_all_vault(&ctx.rpc, &[test_market.vault_a, test_market.vault_b]).unwrap();
            let vault_b_ledger_after_close = (
                vaults_after_close[1].data.deposited_funds,
                vaults_after_close[1].data.deposited_shares,
                vaults_after_close[1].data.borrowed_funds,
                vaults_after_close[1].data.borrowed_shares,
            );
            let (vault_spendable_after_close, _) = token_amounts(&ctx, &vault_b_ata);
            assert_eq!(vault_b_ledger_after_close, vault_b_ledger_before_close);
            assert_eq!(vault_spendable_after_close, vault_spendable_before_close);
        });
    }
}
