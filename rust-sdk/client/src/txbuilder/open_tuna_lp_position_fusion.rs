use crate::instructions::{OpenTunaLpPositionFusion, OpenTunaLpPositionFusionInstructionArgs};
use crate::{get_market_address, get_tuna_liquidity_position_address};
use anyhow::{anyhow, Result};
use fusionamm_client::{fetch_fusion_pool, get_position_address, FP_NFT_UPDATE_AUTH};
use solana_client::rpc_client::RpcClient;
use solana_instruction::Instruction;
use solana_pubkey::Pubkey;
use solana_sdk_ids::system_program;
use spl_associated_token_account::get_associated_token_address_with_program_id;

pub fn open_tuna_lp_position_fusion_instruction(
    rpc: &RpcClient,
    authority: &Pubkey,
    position_mint: &Pubkey,
    whirlpool: &Pubkey,
    args: OpenTunaLpPositionFusionInstructionArgs,
) -> Result<Instruction> {
    let whirlpool = fetch_fusion_pool(rpc, &whirlpool)?;
    let mint_a_address = whirlpool.data.token_mint_a;
    let mint_b_address = whirlpool.data.token_mint_b;

    let mint_accounts = rpc.get_multiple_accounts(&[mint_a_address.into(), mint_b_address.into()])?;
    let mint_a_account = mint_accounts[0].as_ref().ok_or(anyhow!("Token A mint account not found"))?;
    let mint_b_account = mint_accounts[1].as_ref().ok_or(anyhow!("Token B mint account not found"))?;

    let tuna_position_address = get_tuna_liquidity_position_address(&position_mint).0;
    let market_address = get_market_address(&whirlpool.address).0;

    let ix_builder = OpenTunaLpPositionFusion {
        authority: *authority,
        mint_a: mint_a_address,
        mint_b: mint_b_address,
        market: market_address,
        tuna_position: tuna_position_address,
        tuna_position_mint: *position_mint,
        tuna_position_ata: get_associated_token_address_with_program_id(&tuna_position_address, &position_mint, &spl_token_2022::ID),
        tuna_position_ata_a: get_associated_token_address_with_program_id(&tuna_position_address, &mint_a_address, &mint_a_account.owner),
        tuna_position_ata_b: get_associated_token_address_with_program_id(&tuna_position_address, &mint_b_address, &mint_b_account.owner),
        fusionamm_program: fusionamm_client::ID,
        fusion_pool: whirlpool.address,
        fusion_position: get_position_address(&position_mint)?.0,
        metadata_update_auth: FP_NFT_UPDATE_AUTH,
        token_program_a: mint_a_account.owner,
        token_program_b: mint_b_account.owner,
        token2022_program: spl_token_2022::ID,
        system_program: system_program::ID,
        associated_token_program: spl_associated_token_account::ID,
    };

    Ok(ix_builder.instruction(args))
}
