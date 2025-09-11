use crate::accounts::{fetch_all_vault, fetch_tuna_config, TunaConfig, Vault};
use crate::instructions::{OpenAndIncreaseTunaSpotPositionFusion, OpenAndIncreaseTunaSpotPositionFusionInstructionArgs};
use crate::types::{AccountsType, PoolToken, RemainingAccountsInfo, RemainingAccountsSlice};
use crate::utils::fusion::get_swap_tick_arrays;
use crate::utils::get_create_ata_instructions;
use crate::{get_market_address, get_tuna_config_address, get_tuna_spot_position_address, get_vault_address};
use anyhow::{anyhow, Result};
use fusionamm_client::{fetch_fusion_pool, FusionPool};
use fusionamm_core::{MAX_SQRT_PRICE, MIN_SQRT_PRICE};
use solana_client::rpc_client::RpcClient;
use solana_instruction::{AccountMeta, Instruction};
use solana_keypair::Keypair;
use solana_pubkey::Pubkey;
use solana_sdk_ids::system_program;
use solana_signer::Signer;
use spl_associated_token_account::get_associated_token_address_with_program_id;
use spl_associated_token_account::instruction::create_associated_token_account_idempotent;

pub struct OpenAndIncreaseTunaSpotPositionArgs {
    pub position_token: PoolToken,
    pub collateral_token: PoolToken,
    pub collateral_amount: u64,
    pub borrow_amount: u64,
    pub lower_limit_order_sqrt_price: u128,
    pub upper_limit_order_sqrt_price: u128,
    pub flags: u32,
    pub max_swap_slippage: u32,
}

impl Default for OpenAndIncreaseTunaSpotPositionArgs {
    fn default() -> Self {
        OpenAndIncreaseTunaSpotPositionArgs {
            position_token: PoolToken::A,
            collateral_token: PoolToken::A,
            collateral_amount: 0,
            borrow_amount: 0,
            lower_limit_order_sqrt_price: MIN_SQRT_PRICE,
            upper_limit_order_sqrt_price: MAX_SQRT_PRICE,
            flags: 0,
            max_swap_slippage: 0,
        }
    }
}

#[derive(Debug)]
pub struct OpenAndIncreaseTunaSpotPositionInstruction {
    /// The public key of the position NFT that represents ownership of the newly opened position.
    pub position_mint: Pubkey,

    /// A vector of `Instruction` objects required to execute the position opening.
    pub instructions: Vec<Instruction>,

    /// A vector of `Keypair` objects representing additional signers required for the instructions.
    pub additional_signers: Vec<Keypair>,
}

pub fn open_and_increase_tuna_spot_position_fusion_instructions(
    rpc: &RpcClient,
    authority: &Pubkey,
    fusion_pool_address: &Pubkey,
    args: OpenAndIncreaseTunaSpotPositionArgs,
) -> Result<OpenAndIncreaseTunaSpotPositionInstruction> {
    let fusion_pool = fetch_fusion_pool(rpc, fusion_pool_address)?;
    let mint_a_address = fusion_pool.data.token_mint_a;
    let mint_b_address = fusion_pool.data.token_mint_b;

    let tuna_config = fetch_tuna_config(rpc, &get_tuna_config_address().0)?;

    let vaults = fetch_all_vault(&rpc, &[get_vault_address(&mint_a_address).0, get_vault_address(&mint_b_address).0])?;
    let (vault_a, vault_b) = (&vaults[0], &vaults[1]);

    let mint_accounts = rpc.get_multiple_accounts(&[mint_a_address.into(), mint_b_address.into()])?;
    let mint_a_account = mint_accounts[0].as_ref().ok_or(anyhow!("Token A mint account not found"))?;
    let mint_b_account = mint_accounts[1].as_ref().ok_or(anyhow!("Token B mint account not found"))?;

    let (collateral_token_mint_address, collateral_token_mint_account) = if args.collateral_token == PoolToken::A {
        (mint_a_address, mint_a_account)
    } else {
        (mint_b_address, mint_b_account)
    };
    let authority_ata_instructions = get_create_ata_instructions(
        &collateral_token_mint_address,
        authority,
        authority,
        &collateral_token_mint_account.owner,
        args.collateral_amount,
    );

    let mut instructions = vec![];
    let mut additional_signers: Vec<Keypair> = Vec::new();

    additional_signers.push(Keypair::new());
    let position_mint = additional_signers[0].pubkey();

    instructions.extend(authority_ata_instructions.create);
    instructions.push(create_associated_token_account_idempotent(
        authority,
        &tuna_config.data.fee_recipient,
        &mint_a_address,
        &mint_a_account.owner,
    ));
    instructions.push(create_associated_token_account_idempotent(
        authority,
        &tuna_config.data.fee_recipient,
        &mint_b_address,
        &mint_b_account.owner,
    ));

    instructions.push(open_and_increase_tuna_spot_position_fusion_instruction(
        authority,
        &position_mint,
        &tuna_config.data,
        &vault_a.data,
        &vault_b.data,
        &fusion_pool.address,
        &fusion_pool.data,
        &mint_a_account.owner,
        &mint_b_account.owner,
        args,
    ));
    instructions.extend(authority_ata_instructions.cleanup);

    Ok(OpenAndIncreaseTunaSpotPositionInstruction {
        position_mint,
        instructions,
        additional_signers,
    })
}

pub fn open_and_increase_tuna_spot_position_fusion_instruction(
    authority: &Pubkey,
    position_mint: &Pubkey,
    tuna_config: &TunaConfig,
    vault_a: &Vault,
    vault_b: &Vault,
    fusion_pool_address: &Pubkey,
    fusion_pool: &FusionPool,
    token_program_a: &Pubkey,
    token_program_b: &Pubkey,
    args: OpenAndIncreaseTunaSpotPositionArgs,
) -> Instruction {
    let mint_a = fusion_pool.token_mint_a;
    let mint_b = fusion_pool.token_mint_b;
    let tick_spacing = fusion_pool.tick_spacing;

    assert_eq!(vault_a.mint, mint_a);
    assert_eq!(vault_b.mint, mint_b);

    let tuna_config_address = get_tuna_config_address().0;
    let market_address = get_market_address(&fusion_pool_address).0;
    let tuna_position_address = get_tuna_spot_position_address(&position_mint).0;
    let tuna_position_owner_ata_a = get_associated_token_address_with_program_id(&authority, &mint_a, token_program_a);
    let tuna_position_owner_ata_b = get_associated_token_address_with_program_id(&authority, &mint_b, token_program_b);

    let vault_a_address = get_vault_address(&mint_a).0;
    let vault_b_address = get_vault_address(&mint_b).0;

    let swap_ticks_arrays = get_swap_tick_arrays(fusion_pool.tick_current_index, tick_spacing, &fusion_pool_address);

    let ix_builder = OpenAndIncreaseTunaSpotPositionFusion {
        authority: *authority,
        tuna_config: tuna_config_address,
        mint_a,
        mint_b,
        market: market_address,
        vault_a: vault_a_address,
        vault_b: vault_b_address,
        vault_a_ata: get_associated_token_address_with_program_id(&vault_a_address, &mint_a, token_program_a),
        vault_b_ata: get_associated_token_address_with_program_id(&vault_b_address, &mint_b, token_program_b),
        tuna_position: tuna_position_address,
        tuna_position_mint: *position_mint,
        tuna_position_ata_a: get_associated_token_address_with_program_id(&tuna_position_address, &mint_a, token_program_a),
        tuna_position_ata_b: get_associated_token_address_with_program_id(&tuna_position_address, &mint_b, token_program_b),
        tuna_position_owner_ata_a: if args.collateral_token == PoolToken::A {
            Some(tuna_position_owner_ata_a)
        } else {
            None
        },
        tuna_position_owner_ata_b: if args.collateral_token == PoolToken::B {
            Some(tuna_position_owner_ata_b)
        } else {
            None
        },
        fee_recipient_ata_a: get_associated_token_address_with_program_id(&tuna_config.fee_recipient, &mint_a, token_program_a),
        fee_recipient_ata_b: get_associated_token_address_with_program_id(&tuna_config.fee_recipient, &mint_b, token_program_b),
        pyth_oracle_price_feed_a: vault_a.pyth_oracle_price_update,
        pyth_oracle_price_feed_b: vault_b.pyth_oracle_price_update,
        fusionamm_program: fusionamm_client::ID,
        fusion_pool: *fusion_pool_address,
        token_program_a: *token_program_a,
        token_program_b: *token_program_b,
        memo_program: spl_memo::ID,
        system_program: system_program::ID,
        associated_token_program: spl_associated_token_account::ID,
    };

    ix_builder.instruction_with_remaining_accounts(
        OpenAndIncreaseTunaSpotPositionFusionInstructionArgs {
            position_token: args.position_token,
            collateral_token: args.collateral_token,
            collateral_amount: args.collateral_amount,
            borrow_amount: args.borrow_amount,
            lower_limit_order_sqrt_price: args.lower_limit_order_sqrt_price,
            upper_limit_order_sqrt_price: args.upper_limit_order_sqrt_price,
            flags: args.flags,
            max_swap_slippage: args.max_swap_slippage,
            remaining_accounts_info: RemainingAccountsInfo {
                slices: vec![
                    RemainingAccountsSlice {
                        accounts_type: AccountsType::SwapTickArrays,
                        length: 5,
                    },
                    RemainingAccountsSlice {
                        accounts_type: AccountsType::PoolVaultTokenA,
                        length: 1,
                    },
                    RemainingAccountsSlice {
                        accounts_type: AccountsType::PoolVaultTokenB,
                        length: 1,
                    },
                ],
            },
        },
        &[
            AccountMeta::new(swap_ticks_arrays[0], false),
            AccountMeta::new(swap_ticks_arrays[1], false),
            AccountMeta::new(swap_ticks_arrays[2], false),
            AccountMeta::new(swap_ticks_arrays[3], false),
            AccountMeta::new(swap_ticks_arrays[4], false),
            AccountMeta::new(fusion_pool.token_vault_a, false),
            AccountMeta::new(fusion_pool.token_vault_b, false),
        ],
    )
}
