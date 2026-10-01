#[cfg(test)]
mod tests {
    use crate::accounts::{fetch_all_vault, fetch_tuna_config};
    use crate::instructions::{CreateMarketInstructionArgs, OpenTunaSpotPositionInstructionArgs};
    use crate::modify_tuna_spot_position_fusion::ModifyTunaSpotPositionArgs;
    use crate::modify_tuna_spot_position_orca::modify_tuna_spot_position_orca_instructions;
    use crate::tests::*;
    use crate::types::{AccountsType, MarketMaker, PoolToken, RemainingAccountsInfo, RemainingAccountsSlice};
    use crate::{
        get_tuna_config_address, get_tuna_spot_position_address, instructions::ModifyTunaSpotPositionJupiter,
        instructions::ModifyTunaSpotPositionJupiterInstructionArgs, open_tuna_spot_position_instructions, HUNDRED_PERCENT, JUPITER_PROGRAM_ID,
        LEVERAGE_ONE,
    };
    use serial_test::serial;
    use solana_instruction::AccountMeta;
    use solana_keypair::Keypair;
    use solana_program_test::tokio;
    use solana_pubkey::Pubkey;
    use solana_signer::Signer;
    use spl_associated_token_account::{
        get_associated_token_address_with_program_id, instruction::create_associated_token_account_idempotent,
    };
    use spl_token::ID as TOKEN_PROGRAM_ID;

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

    /// Regression test for the unbound-mint vulnerability in the Jupiter spot handlers.
    ///
    /// The Jupiter variants receive an untyped pool account and therefore cannot pin `mint_a`/`mint_b`
    /// to the pool via account constraints the way the Orca/Fusion variants do. Before the fix, an
    /// attacker could pass an arbitrary decoy mint (matching only in decimals): every token account was
    /// derived from the passed mint while the debt accounting acted on the stored vault/position mints,
    /// letting real debt be cancelled with a worthless token.
    ///
    /// The fix binds the caller-supplied mints to the position's stored (pool-validated) mints inside
    /// `tuna_spot_position::modify`. This test opens a legitimate position and then calls the Jupiter
    /// modify handler with a decoy `mint_a`, expecting the transaction to abort with `InvalidPool`
    /// (custom error 0x19cf / 6607) before any swap or repay can happen.
    #[test]
    #[serial]
    fn test_modify_jupiter_rejects_unbound_mint() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let signer = Keypair::new();
            let ctx = RpcContext::new(&signer, orca::get_whirlpool_config_accounts(&signer.pubkey())).await;
            let test_market = setup_test_market(&ctx, test_market_args(), MarketMaker::Orca, TestMarketArgs::default())
                .await
                .unwrap();

            // Open a legitimate position (its mint_a/mint_b are validated against the pool at open time).
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

            // Give the position real collateral + debt so it is a realistic drain target.
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

            // Create a decoy mint that shares mint_a's decimals but is unrelated to the pool.
            let decoy_mint = setup_mint(&ctx, test_market.mint_a.decimals).await.unwrap();

            let tuna_position_address = get_tuna_spot_position_address(&signer.pubkey(), &test_market.pool).0;
            let tuna_config = fetch_tuna_config(&ctx.rpc, &get_tuna_config_address().0).unwrap();
            let vaults = fetch_all_vault(&ctx.rpc, &[test_market.vault_a, test_market.vault_b]).unwrap();

            // The attacker pre-creates all A-side token accounts derived from the decoy mint, exactly as
            // the exploit would. These must exist for Anchor's account validation to reach the guard.
            let vault_a_ata_decoy = get_associated_token_address_with_program_id(&test_market.vault_a, &decoy_mint, &TOKEN_PROGRAM_ID);
            let position_ata_a_decoy = get_associated_token_address_with_program_id(&tuna_position_address, &decoy_mint, &TOKEN_PROGRAM_ID);
            let owner_ata_a_decoy = get_associated_token_address_with_program_id(&signer.pubkey(), &decoy_mint, &TOKEN_PROGRAM_ID);
            let fee_recipient_ata_a_decoy =
                get_associated_token_address_with_program_id(&tuna_config.data.fee_recipient, &decoy_mint, &TOKEN_PROGRAM_ID);

            // The real vault_b token account (created during market setup / the increase above).
            let vault_b_ata =
                get_associated_token_address_with_program_id(&test_market.vault_b, &test_market.mint_b_address, &test_market.token_program_b);

            ctx.send_transaction(vec![
                create_associated_token_account_idempotent(&signer.pubkey(), &test_market.vault_a, &decoy_mint, &TOKEN_PROGRAM_ID),
                create_associated_token_account_idempotent(&signer.pubkey(), &tuna_position_address, &decoy_mint, &TOKEN_PROGRAM_ID),
                create_associated_token_account_idempotent(&signer.pubkey(), &signer.pubkey(), &decoy_mint, &TOKEN_PROGRAM_ID),
                create_associated_token_account_idempotent(
                    &signer.pubkey(),
                    &tuna_config.data.fee_recipient,
                    &decoy_mint,
                    &TOKEN_PROGRAM_ID,
                ),
            ])
            .unwrap();

            // Real B-side accounts (unchanged). Make sure the owner/fee-recipient ATAs exist.
            let position_ata_b = get_associated_token_address_with_program_id(
                &tuna_position_address,
                &test_market.mint_b_address,
                &test_market.token_program_b,
            );
            let owner_ata_b =
                get_associated_token_address_with_program_id(&signer.pubkey(), &test_market.mint_b_address, &test_market.token_program_b);
            let fee_recipient_ata_b = get_associated_token_address_with_program_id(
                &tuna_config.data.fee_recipient,
                &test_market.mint_b_address,
                &test_market.token_program_b,
            );

            ctx.send_transaction(vec![
                create_associated_token_account_idempotent(
                    &signer.pubkey(),
                    &signer.pubkey(),
                    &test_market.mint_b_address,
                    &test_market.token_program_b,
                ),
                create_associated_token_account_idempotent(
                    &signer.pubkey(),
                    &tuna_config.data.fee_recipient,
                    &test_market.mint_b_address,
                    &test_market.token_program_b,
                ),
            ])
            .unwrap();

            // A single dummy remaining account stands in for the Jupiter route; the guard fires before it
            // is ever read.
            let dummy_route_account = Pubkey::default();

            let ix = ModifyTunaSpotPositionJupiter {
                authority: signer.pubkey(),
                tuna_config: get_tuna_config_address().0,
                mint_a: decoy_mint, // <-- the attack: a mint not bound to the pool
                mint_b: test_market.mint_b_address,
                token_program_a: TOKEN_PROGRAM_ID,
                token_program_b: test_market.token_program_b,
                market: test_market.market,
                vault_a: test_market.vault_a,
                vault_b: test_market.vault_b,
                vault_a_ata: vault_a_ata_decoy,
                vault_b_ata,
                tuna_position: tuna_position_address,
                tuna_position_ata_a: position_ata_a_decoy,
                tuna_position_ata_b: position_ata_b,
                tuna_position_owner_ata_a: owner_ata_a_decoy,
                tuna_position_owner_ata_b: owner_ata_b,
                fee_recipient_ata_a: fee_recipient_ata_a_decoy,
                fee_recipient_ata_b: fee_recipient_ata_b,
                oracle_price_update_a: vaults[0].data.oracle_price_update,
                oracle_price_update_b: vaults[1].data.oracle_price_update,
                pool: test_market.pool,
                jupiter_program: JUPITER_PROGRAM_ID,
                memo_program: spl_memo::ID,
                system_program: solana_system_interface::program::ID,
            }
            .instruction_with_remaining_accounts(
                ModifyTunaSpotPositionJupiterInstructionArgs {
                    decrease_percent: HUNDRED_PERCENT,
                    collateral_amount: 0,
                    borrow_amount: 0,
                    jupiter_route_data: vec![],
                    remaining_accounts_info: RemainingAccountsInfo {
                        slices: vec![RemainingAccountsSlice {
                            accounts_type: AccountsType::JupiterRoute,
                            length: 1,
                        }],
                    },
                },
                &[AccountMeta::new_readonly(dummy_route_account, false)],
            );

            let result = ctx.send_transaction(vec![ix]);
            let err = result.expect_err("modify_tuna_spot_position_jupiter must reject a mint not bound to the pool");
            let err_str = err.to_string();
            assert!(
                err_str.contains("0x19cf") || err_str.contains("6607"),
                "expected InvalidPool (0x19cf / 6607), got: {err_str}"
            );
        });
    }
}
