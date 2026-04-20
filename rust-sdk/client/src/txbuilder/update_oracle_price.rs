use crate::instructions::{UpdateOraclePrice, UpdateOraclePriceInstructionArgs};
use crate::types::OraclePriceUpdate;
use crate::{get_tuna_config_address, get_tuna_price_update_address};
use solana_instruction::{AccountMeta, Instruction};
use solana_pubkey::Pubkey;

pub struct TunaOraclePriceUpdate {
    pub mint: Pubkey,
    pub price: i64,
    pub exponent: i32,
}

pub fn update_oracle_price_instruction(authority: &Pubkey, args: &[TunaOraclePriceUpdate]) -> Instruction {
    let tuna_config_address = get_tuna_config_address().0;

    let mut remaining_accounts: Vec<AccountMeta> = vec![];
    let mut ix_args = UpdateOraclePriceInstructionArgs { price_updates: vec![] };

    for arg in args {
        let price_update_address = get_tuna_price_update_address(&arg.mint).0;
        remaining_accounts.push(AccountMeta::new(price_update_address, false));

        ix_args.price_updates.push(OraclePriceUpdate {
            price: arg.price,
            exponent: arg.exponent,
        });
    }

    let ix_builder = UpdateOraclePrice {
        authority: *authority,
        tuna_config: tuna_config_address,
    };

    ix_builder.instruction_with_remaining_accounts(ix_args, remaining_accounts.as_slice())
}
