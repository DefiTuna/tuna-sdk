use solana_instruction::Instruction;
use solana_pubkey::Pubkey;
use solana_system_interface::instruction::transfer;
use spl_associated_token_account::get_associated_token_address_with_program_id;
use spl_associated_token_account::instruction::create_associated_token_account_idempotent;
use spl_token_2022::instruction::{close_account, sync_native};

pub struct CreateATAInstructions {
    pub create: Vec<Instruction>,
    pub cleanup: Vec<Instruction>,
}

pub fn get_create_ata_instructions(mint: &Pubkey, owner: &Pubkey, payer: &Pubkey, token_program_id: &Pubkey, amount: u64) -> CreateATAInstructions {
    let mut create_instructions = vec![];
    let mut cleanup_instructions = vec![];

    let owner_ata = get_associated_token_address_with_program_id(&owner, mint, token_program_id);

    create_instructions.push(create_associated_token_account_idempotent(payer, owner, mint, token_program_id));

    if *mint == spl_token::native_mint::ID {
        if amount > 0 {
            create_instructions.push(transfer(&owner, &owner_ata, amount));
            create_instructions.push(sync_native(token_program_id, &owner_ata).unwrap());
        }

        // Close WSOL account on the cleanup stage if the token account belongs to the payer.
        if owner == payer {
            cleanup_instructions.push(close_account(token_program_id, &owner_ata, owner, owner, &[]).unwrap());
        }
    }

    CreateATAInstructions {
        create: create_instructions,
        cleanup: cleanup_instructions,
    }
}
