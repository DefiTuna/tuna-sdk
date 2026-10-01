use crate::accounts::{fetch_all_tuna_price_update, fetch_all_vault};
use crate::instructions::{UpdateVault, UpdateVaultInstructionArgs};
use crate::tests::{with_serialized_data, RpcContext, TestMarket};
use crate::{
    create_price_update_instruction, get_tuna_config_address, get_tuna_price_update_address, update_oracle_price_instruction, TunaOraclePriceUpdate,
};
use solana_pubkey::Pubkey;
use solana_signer::Signer;

const ORACLE_QUOTE_PRICE: i64 = 1_000_000_000;

pub fn spot_price(sqrt_price: u128) -> f64 {
    let sqrt_price = sqrt_price as f64 / (1_u128 << 64) as f64;
    sqrt_price * sqrt_price
}

fn base_oracle_price_for_pool(sqrt_price: u128, decimals_a: u8, decimals_b: u8) -> i64 {
    let decimal_scale = 10_f64.powi(i32::from(decimals_b) - i32::from(decimals_a));
    let base_quote_ratio = spot_price(sqrt_price) / decimal_scale;
    (base_quote_ratio * ORACLE_QUOTE_PRICE as f64).round() as i64
}

pub fn publish_tuna_oracle_prices(ctx: &RpcContext, test_market: &TestMarket, sqrt_price: u128) {
    let price_a = base_oracle_price_for_pool(sqrt_price, test_market.mint_a.decimals, test_market.mint_b.decimals);
    assert!(price_a > 0);

    ctx.send_transaction(vec![update_oracle_price_instruction(
        &ctx.signer.pubkey(),
        &[
            TunaOraclePriceUpdate {
                mint: test_market.mint_a_address,
                price: price_a,
                exponent: 0,
            },
            TunaOraclePriceUpdate {
                mint: test_market.mint_b_address,
                price: ORACLE_QUOTE_PRICE,
                exponent: 0,
            },
        ],
    )])
    .unwrap();
}

pub fn configure_tuna_oracles(ctx: &RpcContext, test_market: &TestMarket, sqrt_price: u128) {
    let price_update_a = get_tuna_price_update_address(&test_market.mint_a_address).0;
    let price_update_b = get_tuna_price_update_address(&test_market.mint_b_address).0;

    ctx.send_transaction(vec![
        create_price_update_instruction(&ctx.signer.pubkey(), &test_market.mint_a_address),
        create_price_update_instruction(&ctx.signer.pubkey(), &test_market.mint_b_address),
    ])
    .unwrap();
    publish_tuna_oracle_prices(ctx, test_market, sqrt_price);

    let vaults = fetch_all_vault(&ctx.rpc, &[test_market.vault_a, test_market.vault_b]).unwrap();
    ctx.send_transaction(vec![
        UpdateVault {
            authority: ctx.signer.pubkey(),
            tuna_config: get_tuna_config_address().0,
            vault: vaults[0].address,
        }
        .instruction(UpdateVaultInstructionArgs {
            interest_rate: vaults[0].data.interest_rate,
            supply_limit: vaults[0].data.supply_limit,
            oracle_price_update: price_update_a,
            pyth_oracle_feed_id: Pubkey::default(),
        }),
        UpdateVault {
            authority: ctx.signer.pubkey(),
            tuna_config: get_tuna_config_address().0,
            vault: vaults[1].address,
        }
        .instruction(UpdateVaultInstructionArgs {
            interest_rate: vaults[1].data.interest_rate,
            supply_limit: vaults[1].data.supply_limit,
            oracle_price_update: price_update_b,
            pyth_oracle_feed_id: Pubkey::default(),
        }),
    ])
    .unwrap();
}

/// Ages both test feeds without advancing the bank clock. This keeps the pool and
/// position fixture fixed while exercising the program's real freshness check.
pub async fn age_tuna_oracles(ctx: &RpcContext, test_market: &TestMarket, age_seconds: i64) {
    assert!(age_seconds >= 0);

    let addresses = [
        get_tuna_price_update_address(&test_market.mint_a_address).0,
        get_tuna_price_update_address(&test_market.mint_b_address).0,
    ];
    let updates = fetch_all_tuna_price_update(&ctx.rpc, &addresses).unwrap();

    for update in updates {
        let mut aged = update.data;
        aged.publish_time = aged.publish_time.checked_sub(age_seconds).unwrap();
        ctx.set_account(&update.address, &with_serialized_data(update.account, &aged)).await;
    }
}
