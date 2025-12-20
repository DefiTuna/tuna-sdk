use crate::get_tuna_spot_position_address;
use crate::instructions::{OpenTunaSpotPosition, OpenTunaSpotPositionInstructionArgs};
use crate::types::PoolToken;
use anyhow::{anyhow, Result};
use fusionamm_client::{FusionPool, FUSIONAMM_ID};
use orca_whirlpools_client::{Whirlpool, WHIRLPOOL_ID};
use solana_client::rpc_client::RpcClient;
use solana_instruction::Instruction;
use solana_pubkey::Pubkey;
use solana_sdk_ids::system_program;
use spl_associated_token_account::get_associated_token_address_with_program_id;

impl Default for OpenTunaSpotPositionInstructionArgs {
    fn default() -> Self {
        OpenTunaSpotPositionInstructionArgs {
            position_token: PoolToken::A,
            collateral_token: PoolToken::A,
        }
    }
}

pub fn open_tuna_spot_position_instructions(
    rpc: &RpcClient,
    authority: &Pubkey,
    pool_address: &Pubkey,
    args: OpenTunaSpotPositionInstructionArgs,
) -> Result<Vec<Instruction>> {
    let pool_account = rpc.get_account(pool_address)?;

    let (mint_a_address, mint_b_address) = if pool_account.owner == FUSIONAMM_ID {
        let pool = FusionPool::from_bytes(&pool_account.data)?;
        (pool.token_mint_a, pool.token_mint_b)
    } else if pool_account.owner == WHIRLPOOL_ID {
        let pool = Whirlpool::from_bytes(&pool_account.data)?;
        (pool.token_mint_a, pool.token_mint_b)
    } else {
        return Err(anyhow!("Incorrect fusion or orca pool"));
    };

    let mint_accounts = rpc.get_multiple_accounts(&[mint_a_address.into(), mint_b_address.into()])?;
    let mint_a_account = mint_accounts[0].as_ref().ok_or(anyhow!("Token A mint account not found"))?;
    let mint_b_account = mint_accounts[1].as_ref().ok_or(anyhow!("Token B mint account not found"))?;

    let mut instructions = vec![];

    instructions.push(open_tuna_spot_position_instruction(
        authority,
        pool_address,
        &mint_a_address,
        &mint_b_address,
        &mint_a_account.owner,
        &mint_b_account.owner,
        args,
    ));

    Ok(instructions)
}

pub fn open_tuna_spot_position_instruction(
    authority: &Pubkey,
    pool_address: &Pubkey,
    mint_a: &Pubkey,
    mint_b: &Pubkey,
    token_program_a: &Pubkey,
    token_program_b: &Pubkey,
    args: OpenTunaSpotPositionInstructionArgs,
) -> Instruction {
    let tuna_position_address = get_tuna_spot_position_address(authority, pool_address).0;

    let ix_builder = OpenTunaSpotPosition {
        authority: *authority,
        mint_a: *mint_a,
        mint_b: *mint_b,
        token_program_a: *token_program_a,
        token_program_b: *token_program_b,
        tuna_position: tuna_position_address,
        tuna_position_ata_a: get_associated_token_address_with_program_id(&tuna_position_address, mint_a, token_program_a),
        tuna_position_ata_b: get_associated_token_address_with_program_id(&tuna_position_address, mint_b, token_program_b),
        pool: *pool_address,
        system_program: system_program::ID,
        associated_token_program: spl_associated_token_account::ID,
    };

    ix_builder.instruction(args)
}
