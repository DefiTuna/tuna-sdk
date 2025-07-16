use crate::accounts::{fetch_all_vault, fetch_tuna_config, TunaConfig, Vault};
use crate::instructions::{OpenPositionWithLiquidityFusion, OpenPositionWithLiquidityFusionInstructionArgs};
use crate::types::{AccountsType, RemainingAccountsInfo, RemainingAccountsSlice};
use crate::utils::fusion::get_swap_tick_arrays;
use crate::utils::get_create_ata_instructions;
use crate::{get_market_address, get_tuna_config_address, get_tuna_position_address, get_vault_address};
use anyhow::{anyhow, Result};
use fusionamm_client::{
    fetch_fusion_pool, get_fusion_pool_address, get_position_address, get_tick_array_address, FusionPool, InitializeTickArray,
    InitializeTickArrayInstructionArgs, TickArray, FP_NFT_UPDATE_AUTH,
};
use fusionamm_core::get_tick_array_start_tick_index;
use solana_client::rpc_client::RpcClient;
use solana_instruction::{AccountMeta, Instruction};
use solana_keypair::Keypair;
use solana_pubkey::Pubkey;
use solana_sdk_ids::system_program;
use solana_signer::Signer;
use solana_sysvar::rent::Rent;
use solana_sysvar::slot_hashes::SysvarId;
use spl_associated_token_account::get_associated_token_address_with_program_id;
use spl_associated_token_account::instruction::create_associated_token_account_idempotent;

#[derive(Debug)]
pub struct OpenPositionWithLiquidityInstruction {
    /// The public key of the position NFT that represents ownership of the newly opened position.
    pub position_mint: Pubkey,

    /// A vector of `Instruction` objects required to execute the position opening.
    pub instructions: Vec<Instruction>,

    /// A vector of `Keypair` objects representing additional signers required for the instructions.
    pub additional_signers: Vec<Keypair>,

    /// The cost of initializing the position, measured in lamports.
    pub initialization_cost: u64,
}

#[derive(Default)]
pub struct OpenPositionWithLiquidityArgs {
    pub tick_lower_index: i32,
    pub tick_upper_index: i32,
    pub tick_stop_loss_index: i32,
    pub tick_take_profit_index: i32,
    pub flags: u32,
    pub collateral_a: u64,
    pub collateral_b: u64,
    pub borrow_a: u64,
    pub borrow_b: u64,
    pub min_added_amount_a: u64,
    pub min_added_amount_b: u64,
    pub max_swap_slippage: u32,
}

pub fn open_position_with_liquidity_fusion_instructions(
    rpc: &RpcClient,
    authority: &Pubkey,
    fusion_pool_address: &Pubkey,
    args: OpenPositionWithLiquidityArgs,
) -> Result<OpenPositionWithLiquidityInstruction> {
    let rent = rpc.get_account(&Rent::id())?;
    let rent: Rent = bincode::deserialize(&rent.data)?;

    let whirlpool = fetch_fusion_pool(rpc, fusion_pool_address)?;
    let mint_a_address = whirlpool.data.token_mint_a;
    let mint_b_address = whirlpool.data.token_mint_b;

    let tuna_config = fetch_tuna_config(rpc, &get_tuna_config_address().0)?;

    let vaults = fetch_all_vault(&rpc, &[get_vault_address(&mint_a_address).0, get_vault_address(&mint_b_address).0])?;
    let (vault_a, vault_b) = (&vaults[0], &vaults[1]);

    let mint_accounts = rpc.get_multiple_accounts(&[mint_a_address.into(), mint_b_address.into()])?;
    let mint_a_account = mint_accounts[0].as_ref().ok_or(anyhow!("Token A mint account not found"))?;
    let mint_b_account = mint_accounts[1].as_ref().ok_or(anyhow!("Token B mint account not found"))?;

    let authority_ata_a_instructions = get_create_ata_instructions(&mint_a_address, authority, authority, &mint_a_account.owner, args.collateral_a);
    let authority_ata_b_instructions = get_create_ata_instructions(&mint_b_address, authority, authority, &mint_b_account.owner, args.collateral_b);

    let mut instructions = vec![];
    let mut non_refundable_rent: u64 = 0;
    let mut additional_signers: Vec<Keypair> = Vec::new();

    additional_signers.push(Keypair::new());
    let position_mint = additional_signers[0].pubkey();

    instructions.extend(authority_ata_a_instructions.create);
    instructions.extend(authority_ata_b_instructions.create);
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

    let tick_spacing = whirlpool.data.tick_spacing;
    let lower_tick_array_start_index = get_tick_array_start_tick_index(args.tick_lower_index, tick_spacing);
    let upper_tick_array_start_index = get_tick_array_start_tick_index(args.tick_upper_index, tick_spacing);

    let lower_tick_array_address = get_tick_array_address(&fusion_pool_address, lower_tick_array_start_index)?.0;
    let upper_tick_array_address = get_tick_array_address(&fusion_pool_address, upper_tick_array_start_index)?.0;

    let tick_array_infos = rpc.get_multiple_accounts(&[lower_tick_array_address.into(), upper_tick_array_address.into()])?;

    if tick_array_infos[0].is_none() {
        instructions.push(
            InitializeTickArray {
                fusion_pool: whirlpool.address,
                funder: *authority,
                tick_array: lower_tick_array_address,
                system_program: system_program::id(),
            }
            .instruction(InitializeTickArrayInstructionArgs {
                start_tick_index: lower_tick_array_start_index,
            }),
        );
        non_refundable_rent += rent.minimum_balance(TickArray::LEN);
    }

    if tick_array_infos[1].is_none() && lower_tick_array_start_index != upper_tick_array_start_index {
        instructions.push(
            InitializeTickArray {
                fusion_pool: whirlpool.address,
                funder: *authority,
                tick_array: upper_tick_array_address,
                system_program: system_program::id(),
            }
            .instruction(InitializeTickArrayInstructionArgs {
                start_tick_index: upper_tick_array_start_index,
            }),
        );
        non_refundable_rent += rent.minimum_balance(TickArray::LEN);
    }

    instructions.push(open_position_with_liquidity_fusion_instruction(
        authority,
        &position_mint,
        &tuna_config.data,
        &vault_a.data,
        &vault_b.data,
        &whirlpool.data,
        &mint_a_account.owner,
        &mint_b_account.owner,
        args,
    ));
    instructions.extend(authority_ata_a_instructions.cleanup);
    instructions.extend(authority_ata_b_instructions.cleanup);

    Ok(OpenPositionWithLiquidityInstruction {
        position_mint,
        instructions,
        additional_signers,
        initialization_cost: non_refundable_rent,
    })
}

pub fn open_position_with_liquidity_fusion_instruction(
    authority: &Pubkey,
    position_mint: &Pubkey,
    tuna_config: &TunaConfig,
    vault_a: &Vault,
    vault_b: &Vault,
    fusion_pool: &FusionPool,
    token_program_a: &Pubkey,
    token_program_b: &Pubkey,
    args: OpenPositionWithLiquidityArgs,
) -> Instruction {
    let mint_a = fusion_pool.token_mint_a;
    let mint_b = fusion_pool.token_mint_b;
    let tick_spacing = fusion_pool.tick_spacing;

    assert_eq!(vault_a.mint, mint_a);
    assert_eq!(vault_b.mint, mint_b);

    let fusion_pool_address = get_fusion_pool_address(&mint_a, &mint_b, tick_spacing).unwrap().0;
    let tuna_config_address = get_tuna_config_address().0;
    let market_address = get_market_address(&fusion_pool_address).0;
    let tuna_position_address = get_tuna_position_address(&position_mint).0;
    let tuna_position_owner_ata_a = get_associated_token_address_with_program_id(&authority, &mint_a, token_program_a);
    let tuna_position_owner_ata_b = get_associated_token_address_with_program_id(&authority, &mint_b, token_program_b);
    let fusion_position_address = get_position_address(&position_mint).unwrap().0;

    let vault_a_address = get_vault_address(&mint_a).0;
    let vault_b_address = get_vault_address(&mint_b).0;

    let tick_array_lower_start_tick_index = get_tick_array_start_tick_index(args.tick_lower_index, tick_spacing);
    let tick_array_lower_address = get_tick_array_address(&fusion_pool_address, tick_array_lower_start_tick_index).unwrap().0;

    let tick_array_upper_start_tick_index = get_tick_array_start_tick_index(args.tick_upper_index, tick_spacing);
    let tick_array_upper_address = get_tick_array_address(&fusion_pool_address, tick_array_upper_start_tick_index).unwrap().0;

    let swap_ticks_arrays = get_swap_tick_arrays(fusion_pool.tick_current_index, tick_spacing, &fusion_pool_address);

    let ix_builder = OpenPositionWithLiquidityFusion {
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
        tuna_position_ata: get_associated_token_address_with_program_id(&tuna_position_address, &position_mint, &spl_token_2022::ID),
        tuna_position_ata_a: get_associated_token_address_with_program_id(&tuna_position_address, &mint_a, token_program_a),
        tuna_position_ata_b: get_associated_token_address_with_program_id(&tuna_position_address, &mint_b, token_program_b),
        tuna_position_owner_ata_a,
        tuna_position_owner_ata_b,
        fee_recipient_ata_a: get_associated_token_address_with_program_id(&tuna_config.fee_recipient, &mint_a, token_program_a),
        fee_recipient_ata_b: get_associated_token_address_with_program_id(&tuna_config.fee_recipient, &mint_b, token_program_b),
        pyth_oracle_price_feed_a: vault_a.pyth_oracle_price_update,
        pyth_oracle_price_feed_b: vault_b.pyth_oracle_price_update,
        fusionamm_program: fusionamm_client::ID,
        fusion_pool: fusion_pool_address,
        fusion_position: fusion_position_address,
        token_program_a: *token_program_a,
        token_program_b: *token_program_b,
        metadata_update_auth: FP_NFT_UPDATE_AUTH,
        memo_program: spl_memo::ID,
        token2022_program: spl_token_2022::ID,
        system_program: system_program::ID,
        associated_token_program: spl_associated_token_account::ID,
    };

    ix_builder.instruction_with_remaining_accounts(
        OpenPositionWithLiquidityFusionInstructionArgs {
            tick_lower_index: args.tick_lower_index,
            tick_upper_index: args.tick_upper_index,
            tick_stop_loss_index: args.tick_stop_loss_index,
            tick_take_profit_index: args.tick_take_profit_index,
            flags: args.flags,
            collateral_a: args.collateral_a,
            collateral_b: args.collateral_b,
            borrow_a: args.borrow_a,
            borrow_b: args.borrow_b,
            min_added_amount_a: args.min_added_amount_a,
            min_added_amount_b: args.min_added_amount_b,
            max_swap_slippage: args.max_swap_slippage,
            remaining_accounts_info: RemainingAccountsInfo {
                slices: vec![
                    RemainingAccountsSlice {
                        accounts_type: AccountsType::SwapTickArrays,
                        length: 5,
                    },
                    RemainingAccountsSlice {
                        accounts_type: AccountsType::TickArrayLower,
                        length: 1,
                    },
                    RemainingAccountsSlice {
                        accounts_type: AccountsType::TickArrayUpper,
                        length: 1,
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
            AccountMeta::new(tick_array_lower_address, false),
            AccountMeta::new(tick_array_upper_address, false),
            AccountMeta::new(fusion_pool.token_vault_a, false),
            AccountMeta::new(fusion_pool.token_vault_b, false),
        ],
    )
}
