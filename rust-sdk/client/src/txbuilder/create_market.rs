use crate::instructions::{CreateMarket, CreateMarketInstructionArgs};
use crate::{get_market_address, get_tuna_config_address};
use solana_program::instruction::Instruction;
use solana_program::pubkey::Pubkey;
use solana_program::system_program;

pub fn create_market_instruction(authority: &Pubkey, pool: &Pubkey, args: CreateMarketInstructionArgs) -> Instruction {
    let tuna_config_address = get_tuna_config_address().0;
    let market_address = get_market_address(pool).0;

    let ix_builder = CreateMarket {
        authority: *authority,
        tuna_config: tuna_config_address,
        market: market_address,
        pool: *pool,
        system_program: system_program::ID,
    };

    ix_builder.instruction(args)
}
