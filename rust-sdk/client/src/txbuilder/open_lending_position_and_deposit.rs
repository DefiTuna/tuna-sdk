use crate::accounts::fetch_maybe_lending_position;
use crate::open_lending_position_v2::open_lending_position_v2_instruction;
use crate::{deposit_instructions, get_lending_position_address, open_lending_position_instruction, MaybeAccount};
use anyhow::Result;
use solana_client::rpc_client::RpcClient;
use solana_instruction::Instruction;
use solana_pubkey::Pubkey;

pub fn open_lending_position_and_deposit_instructions(
    rpc: &RpcClient,
    authority: &Pubkey,
    mint: &Pubkey,
    vault: Option<&Pubkey>,
    amount: u64,
) -> Result<Vec<Instruction>> {
    let lending_position_address = get_lending_position_address(authority, vault.unwrap_or(mint)).0;

    match fetch_maybe_lending_position(rpc, &lending_position_address)? {
        MaybeAccount::Exists(_) => Ok(deposit_instructions(rpc, authority, mint, vault, amount)?),
        MaybeAccount::NotFound(_) => {
            let mut instructions = vec![if vault.is_some() {
                open_lending_position_v2_instruction(authority, mint, vault.unwrap())
            } else {
                open_lending_position_instruction(authority, mint)
            }];
            instructions.extend(deposit_instructions(rpc, authority, mint, vault, amount)?);
            Ok(instructions)
        }
    }
}
