use crate::get_tuna_spot_position_address;
use crate::instructions::{OpenTunaSpotPositionFusion, OpenTunaSpotPositionFusionInstructionArgs};
use crate::types::PoolToken;
use anyhow::{anyhow, Result};
use fusionamm_client::fetch_fusion_pool;
use solana_client::rpc_client::RpcClient;
use solana_instruction::Instruction;
use solana_pubkey::Pubkey;
use solana_sdk_ids::system_program;
use spl_associated_token_account::get_associated_token_address_with_program_id;

impl Default for OpenTunaSpotPositionFusionInstructionArgs {
    fn default() -> Self {
        OpenTunaSpotPositionFusionInstructionArgs {
            position_token: PoolToken::A,
            collateral_token: PoolToken::A,
        }
    }
}

pub fn open_tuna_spot_position_fusion_instructions(
    rpc: &RpcClient,
    authority: &Pubkey,
    fusion_pool_address: &Pubkey,
    args: OpenTunaSpotPositionFusionInstructionArgs,
) -> Result<Vec<Instruction>> {
    let fusion_pool = fetch_fusion_pool(rpc, fusion_pool_address)?;
    let mint_a_address = fusion_pool.data.token_mint_a;
    let mint_b_address = fusion_pool.data.token_mint_b;

    let mint_accounts = rpc.get_multiple_accounts(&[mint_a_address.into(), mint_b_address.into()])?;
    let mint_a_account = mint_accounts[0].as_ref().ok_or(anyhow!("Token A mint account not found"))?;
    let mint_b_account = mint_accounts[1].as_ref().ok_or(anyhow!("Token B mint account not found"))?;

    let mut instructions = vec![];

    instructions.push(open_tuna_spot_position_fusion_instruction(
        authority,
        &fusion_pool.address,
        &mint_a_address,
        &mint_b_address,
        &mint_a_account.owner,
        &mint_b_account.owner,
        args,
    ));

    Ok(instructions)
}

pub fn open_tuna_spot_position_fusion_instruction(
    authority: &Pubkey,
    fusion_pool_address: &Pubkey,
    mint_a: &Pubkey,
    mint_b: &Pubkey,
    token_program_a: &Pubkey,
    token_program_b: &Pubkey,
    args: OpenTunaSpotPositionFusionInstructionArgs,
) -> Instruction {
    let tuna_position_address = get_tuna_spot_position_address(authority, fusion_pool_address).0;

    let ix_builder = OpenTunaSpotPositionFusion {
        authority: *authority,
        mint_a: *mint_a,
        mint_b: *mint_b,
        token_program_a: *token_program_a,
        token_program_b: *token_program_b,
        tuna_position: tuna_position_address,
        tuna_position_ata_a: get_associated_token_address_with_program_id(&tuna_position_address, mint_a, token_program_a),
        tuna_position_ata_b: get_associated_token_address_with_program_id(&tuna_position_address, mint_b, token_program_b),
        fusion_pool: *fusion_pool_address,
        system_program: system_program::ID,
        associated_token_program: spl_associated_token_account::ID,
    };

    ix_builder.instruction(args)
}
