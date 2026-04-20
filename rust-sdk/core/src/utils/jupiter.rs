use solana_instruction::Instruction;
use solana_pubkey::Pubkey;

// Jupiter instruction discriminators
pub const JUPITER_CREATE_TOKEN_ACCOUNT_DISCRIMINATOR: [u8; 8] = [147, 241, 123, 100, 244, 132, 174, 118];
pub const JUPITER_ROUTE_DISCRIMINATOR: [u8; 8] = [229, 23, 203, 151, 122, 227, 173, 42];
pub const JUPITER_ROUTE_V2_DISCRIMINATOR: [u8; 8] = [187, 100, 250, 204, 49, 196, 175, 20];
pub const JUPITER_ROUTE_WITH_TOKEN_LEDGER_DISCRIMINATOR: [u8; 8] = [150, 86, 71, 116, 167, 93, 14, 104];
pub const JUPITER_EXACT_OUT_ROUTE_DISCRIMINATOR: [u8; 8] = [208, 51, 239, 151, 123, 43, 237, 92];
pub const JUPITER_EXACT_OUT_ROUTE_V2_DISCRIMINATOR: [u8; 8] = [157, 138, 184, 82, 21, 244, 243, 36];
pub const JUPITER_SHARED_ACCOUNTS_ROUTE_DISCRIMINATOR: [u8; 8] = [193, 32, 155, 51, 65, 214, 156, 129];
pub const JUPITER_SHARED_ACCOUNTS_ROUTE_V2_DISCRIMINATOR: [u8; 8] = [209, 152, 83, 147, 124, 254, 216, 233];
pub const JUPITER_SHARED_ACCOUNTS_ROUTE_WITH_TOKEN_LEDGER_DISCRIMINATOR: [u8; 8] = [230, 121, 143, 80, 119, 159, 106, 170];
pub const JUPITER_SHARED_ACCOUNTS_EXACT_OUT_ROUTE_DISCRIMINATOR: [u8; 8] = [176, 209, 105, 168, 154, 125, 69, 62];
pub const JUPITER_SHARED_ACCOUNTS_EXACT_OUT_ROUTE_V2_DISCRIMINATOR: [u8; 8] = [53, 96, 229, 202, 216, 187, 250, 24];

pub fn is_jupiter_create_token_account_instruction(ix: &Instruction) -> bool {
    if ix.data.len() < 8 {
        return false;
    }

    ix.data[0..8] == JUPITER_CREATE_TOKEN_ACCOUNT_DISCRIMINATOR
}

pub fn get_user_source_token_account_address(ix: &Instruction) -> Option<Pubkey> {
    if ix.data.len() < 8 {
        return None;
    }

    let ix_discriminator = &ix.data[0..8];

    if ix_discriminator == JUPITER_ROUTE_V2_DISCRIMINATOR || ix_discriminator == JUPITER_EXACT_OUT_ROUTE_V2_DISCRIMINATOR {
        Some(ix.accounts[1].pubkey)
    } else if ix_discriminator == JUPITER_ROUTE_DISCRIMINATOR
        || ix_discriminator == JUPITER_EXACT_OUT_ROUTE_DISCRIMINATOR
        || ix_discriminator == JUPITER_SHARED_ACCOUNTS_ROUTE_V2_DISCRIMINATOR
        || ix_discriminator == JUPITER_SHARED_ACCOUNTS_EXACT_OUT_ROUTE_V2_DISCRIMINATOR
    {
        Some(ix.accounts[2].pubkey)
    } else if ix_discriminator == JUPITER_SHARED_ACCOUNTS_ROUTE_DISCRIMINATOR
        || ix_discriminator == JUPITER_SHARED_ACCOUNTS_EXACT_OUT_ROUTE_DISCRIMINATOR
    {
        Some(ix.accounts[3].pubkey)
    } else {
        None
    }
}

pub fn get_user_destination_token_account_address(ix: &Instruction) -> Option<Pubkey> {
    if ix.data.len() < 8 {
        return None;
    }

    let ix_discriminator = &ix.data[0..8];

    if ix_discriminator == JUPITER_ROUTE_V2_DISCRIMINATOR || ix_discriminator == JUPITER_EXACT_OUT_ROUTE_V2_DISCRIMINATOR {
        Some(ix.accounts[2].pubkey)
    } else if ix_discriminator == JUPITER_ROUTE_DISCRIMINATOR || ix_discriminator == JUPITER_EXACT_OUT_ROUTE_DISCRIMINATOR {
        Some(ix.accounts[3].pubkey)
    } else {
        None
    }
}
