use crate::accounts::fetch_maybe_lending_position;
use crate::{deposit_instructions, get_lending_position_address, open_lending_position_instruction, MaybeAccount};
use solana_client::rpc_client::RpcClient;
use solana_program::instruction::Instruction;
use solana_program::pubkey::Pubkey;

pub fn open_lending_position_and_deposit_instructions(rpc: &RpcClient, authority: &Pubkey, mint: &Pubkey, token_program: &Pubkey, amount: u64) -> Vec<Instruction> {
    let lending_position_address = get_lending_position_address(&authority, &mint).0;

    match fetch_maybe_lending_position(rpc, &lending_position_address).unwrap() {
        MaybeAccount::Exists(_) => deposit_instructions(authority, mint, token_program, amount),
        MaybeAccount::NotFound(_) => {
            let mut instructions = vec![open_lending_position_instruction(authority, mint)];
            instructions.extend(deposit_instructions(authority, mint, token_program, amount));
            instructions
        }
    }
}
