use crate::instructions::{OpenTunaSpotPositionOrca, OpenTunaSpotPositionOrcaInstructionArgs};
use crate::types::PoolToken;
use crate::{get_tuna_spot_position_address, OpenTunaSpotPositionInstruction};
use anyhow::{anyhow, Result};
use fusionamm_core::{MAX_SQRT_PRICE, MIN_SQRT_PRICE};
use orca_whirlpools_client::fetch_whirlpool;
use solana_client::rpc_client::RpcClient;
use solana_instruction::Instruction;
use solana_keypair::Keypair;
use solana_pubkey::Pubkey;
use solana_sdk_ids::system_program;
use solana_signer::Signer;
use spl_associated_token_account::get_associated_token_address_with_program_id;

impl Default for OpenTunaSpotPositionOrcaInstructionArgs {
    fn default() -> Self {
        OpenTunaSpotPositionOrcaInstructionArgs {
            position_token: PoolToken::A,
            collateral_token: PoolToken::A,
            lower_limit_order_sqrt_price: MIN_SQRT_PRICE,
            upper_limit_order_sqrt_price: MAX_SQRT_PRICE,
            flags: 0,
        }
    }
}

pub fn open_tuna_spot_position_orca_instructions(
    rpc: &RpcClient,
    authority: &Pubkey,
    whirlpool_address: &Pubkey,
    args: OpenTunaSpotPositionOrcaInstructionArgs,
) -> Result<OpenTunaSpotPositionInstruction> {
    let whirlpool = fetch_whirlpool(rpc, whirlpool_address)?;
    let mint_a_address = whirlpool.data.token_mint_a;
    let mint_b_address = whirlpool.data.token_mint_b;

    let mint_accounts = rpc.get_multiple_accounts(&[mint_a_address.into(), mint_b_address.into()])?;
    let mint_a_account = mint_accounts[0].as_ref().ok_or(anyhow!("Token A mint account not found"))?;
    let mint_b_account = mint_accounts[1].as_ref().ok_or(anyhow!("Token B mint account not found"))?;

    let mut instructions = vec![];
    let mut additional_signers: Vec<Keypair> = Vec::new();

    additional_signers.push(Keypair::new());
    let position_mint = additional_signers[0].pubkey();

    instructions.push(open_tuna_spot_position_orca_instruction(
        authority,
        &position_mint,
        &whirlpool.address,
        &mint_a_address,
        &mint_b_address,
        &mint_a_account.owner,
        &mint_b_account.owner,
        args,
    ));

    Ok(OpenTunaSpotPositionInstruction {
        position_mint,
        instructions,
        additional_signers,
    })
}

pub fn open_tuna_spot_position_orca_instruction(
    authority: &Pubkey,
    position_mint: &Pubkey,
    whirlpool_address: &Pubkey,
    mint_a: &Pubkey,
    mint_b: &Pubkey,
    token_program_a: &Pubkey,
    token_program_b: &Pubkey,
    args: OpenTunaSpotPositionOrcaInstructionArgs,
) -> Instruction {
    let tuna_position_address = get_tuna_spot_position_address(&position_mint).0;

    let ix_builder = OpenTunaSpotPositionOrca {
        authority: *authority,
        mint_a: *mint_a,
        mint_b: *mint_b,
        token_program_a: *token_program_a,
        token_program_b: *token_program_b,
        tuna_position: tuna_position_address,
        tuna_position_mint: *position_mint,
        tuna_position_ata_a: get_associated_token_address_with_program_id(&tuna_position_address, mint_a, token_program_a),
        tuna_position_ata_b: get_associated_token_address_with_program_id(&tuna_position_address, mint_b, token_program_b),
        whirlpool: *whirlpool_address,
        system_program: system_program::ID,
        associated_token_program: spl_associated_token_account::ID,
    };

    ix_builder.instruction(args)
}
