use crate::instructions::{UpdateMarket, UpdateMarketInstructionArgs};
use crate::{get_market_address, get_tuna_config_address};
use solana_instruction::Instruction;
use solana_pubkey::Pubkey;

pub fn update_market_instruction(authority: &Pubkey, pool: &Pubkey, args: UpdateMarketInstructionArgs) -> Instruction {
    let tuna_config_address = get_tuna_config_address().0;
    let market_address = get_market_address(pool).0;

    let ix_builder = UpdateMarket {
        authority: *authority,
        tuna_config: tuna_config_address,
        market: market_address,
    };

    ix_builder.instruction(args)
}
