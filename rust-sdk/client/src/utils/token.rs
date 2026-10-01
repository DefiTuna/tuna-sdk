use anyhow::{anyhow, Result};
use solana_account::Account;
use solana_instruction::Instruction;
use solana_pubkey::Pubkey;
use solana_system_interface::instruction::transfer;
use spl_associated_token_account::get_associated_token_address_with_program_id;
use spl_associated_token_account::instruction::create_associated_token_account_idempotent;
use spl_token_2022::extension::transfer_fee::instruction::harvest_withheld_tokens_to_mint;
use spl_token_2022::instruction::{close_account, sync_native};
use spl_token_2022::solana_program::program_pack::Pack;
use spl_token_2022::state::Mint;

// `ExtensionType` is `repr(u16)` and `TransferFeeConfig` follows
// `Uninitialized`, so its stable TLV type tag is 1:
// https://github.com/solana-program/token-2022/blob/1c1a20cfa930058a853e15821112571b383c3e70/program/src/extension/mod.rs#L1059-L1067
const TRANSFER_FEE_CONFIG_EXTENSION_TYPE: u16 = 1;
const TOKEN_2022_BASE_ACCOUNT_LENGTH: usize = 165;
const TOKEN_2022_ACCOUNT_TYPE_LENGTH: usize = 1;
const TOKEN_2022_MINT_ACCOUNT_TYPE: u8 = 1;
const TLV_TYPE_LENGTH: usize = 2;
const TLV_LENGTH_LENGTH: usize = 2;
const TLV_HEADER_LENGTH: usize = TLV_TYPE_LENGTH + TLV_LENGTH_LENGTH;

/// Detects `TransferFeeConfig` without converting unrelated extension tags to
/// this SDK's older `ExtensionType` enum. Unknown, well-formed TLVs are skipped.
fn mint_has_transfer_fee_config(data: &[u8]) -> Result<bool> {
    if data.len() == Mint::LEN {
        Mint::unpack(data)?;
        return Ok(false);
    }

    let tlv_start = TOKEN_2022_BASE_ACCOUNT_LENGTH + TOKEN_2022_ACCOUNT_TYPE_LENGTH;
    if data.len() < tlv_start {
        return Err(anyhow!("Malformed Token-2022 mint account data"));
    }

    Mint::unpack(&data[..Mint::LEN])?;
    if data[TOKEN_2022_BASE_ACCOUNT_LENGTH] != TOKEN_2022_MINT_ACCOUNT_TYPE {
        return Err(anyhow!("Token-2022 account is not a mint"));
    }

    let tlv_data = &data[tlv_start..];
    let mut cursor = 0usize;
    while cursor < tlv_data.len() {
        let remaining = tlv_data.len() - cursor;
        // Token-2022 permits a final spare byte during account reallocations.
        if remaining < TLV_TYPE_LENGTH {
            return Ok(false);
        }

        let extension_type = u16::from_le_bytes([tlv_data[cursor], tlv_data[cursor + 1]]);
        if extension_type == 0 {
            return Ok(false);
        }
        if remaining < TLV_HEADER_LENGTH {
            return Err(anyhow!("Malformed Token-2022 mint TLV header"));
        }

        let value_length = usize::from(u16::from_le_bytes([tlv_data[cursor + 2], tlv_data[cursor + 3]]));
        let value_end = cursor
            .checked_add(TLV_HEADER_LENGTH)
            .and_then(|value_start| value_start.checked_add(value_length))
            .ok_or_else(|| anyhow!("Malformed Token-2022 mint TLV length"))?;
        if value_end > tlv_data.len() {
            return Err(anyhow!("Malformed Token-2022 mint TLV value"));
        }
        if extension_type == TRANSFER_FEE_CONFIG_EXTENSION_TYPE {
            return Ok(true);
        }
        cursor = value_end;
    }

    Ok(false)
}

/// Builds the permissionless harvest needed before Tuna closes a position
/// token account. Token-2022 ownership alone is insufficient: only mints that
/// actually carry `TransferFeeConfig` get an instruction.
pub fn harvest_withheld_fees_to_mint_instruction(
    mint: &Pubkey,
    mint_account: &Account,
    source_token_account: &Pubkey,
) -> Result<Option<Instruction>> {
    if mint_account.owner == spl_token::ID {
        return Ok(None);
    }
    if mint_account.owner != spl_token_2022::ID {
        return Err(anyhow!("Mint account {mint} is not owned by a supported token program"));
    }

    if !mint_has_transfer_fee_config(&mint_account.data)? {
        return Ok(None);
    }

    Ok(Some(harvest_withheld_tokens_to_mint(&spl_token_2022::ID, mint, &[source_token_account])?))
}

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

#[cfg(test)]
mod tests {
    use super::*;
    use solana_account::Account;

    // v8 `ExtensionType::ScaledUiAmount`. This is deliberately not expressed
    // through the v6 enum linked by this SDK.
    const SCALED_UI_AMOUNT_EXTENSION_TYPE: u16 = 25;
    const TRANSFER_FEE_CONFIG_LENGTH: usize = 108;
    const SCALED_UI_AMOUNT_CONFIG_LENGTH: usize = 56;

    fn token_2022_mint_account(extensions: &[(u16, usize)]) -> Account {
        let mut data = if extensions.is_empty() {
            vec![0; Mint::LEN]
        } else {
            vec![0; TOKEN_2022_BASE_ACCOUNT_LENGTH + TOKEN_2022_ACCOUNT_TYPE_LENGTH]
        };
        Mint::pack(
            Mint {
                is_initialized: true,
                ..Mint::default()
            },
            &mut data[..Mint::LEN],
        )
        .unwrap();

        if !extensions.is_empty() {
            data[TOKEN_2022_BASE_ACCOUNT_LENGTH] = TOKEN_2022_MINT_ACCOUNT_TYPE;
            for (extension_type, value_length) in extensions {
                data.extend_from_slice(&extension_type.to_le_bytes());
                data.extend_from_slice(&u16::try_from(*value_length).unwrap().to_le_bytes());
                data.resize(data.len() + value_length, 0);
            }
        }

        Account {
            lamports: 1,
            data,
            owner: spl_token_2022::ID,
            executable: false,
            rent_epoch: 0,
        }
    }

    #[test]
    fn raw_tlv_detection_skips_extensions_unknown_to_the_v6_enum() {
        let fee_only = token_2022_mint_account(&[(TRANSFER_FEE_CONFIG_EXTENSION_TYPE, TRANSFER_FEE_CONFIG_LENGTH)]);
        assert!(mint_has_transfer_fee_config(&fee_only.data).unwrap());

        let scaled_only = token_2022_mint_account(&[(SCALED_UI_AMOUNT_EXTENSION_TYPE, SCALED_UI_AMOUNT_CONFIG_LENGTH)]);
        assert!(!mint_has_transfer_fee_config(&scaled_only.data).unwrap());

        let scaled_and_fee = token_2022_mint_account(&[
            (SCALED_UI_AMOUNT_EXTENSION_TYPE, SCALED_UI_AMOUNT_CONFIG_LENGTH),
            (TRANSFER_FEE_CONFIG_EXTENSION_TYPE, TRANSFER_FEE_CONFIG_LENGTH),
        ]);
        assert!(mint_has_transfer_fee_config(&scaled_and_fee.data).unwrap());
    }

    #[test]
    fn raw_tlv_detection_rejects_truncated_values() {
        let mut malformed = token_2022_mint_account(&[(SCALED_UI_AMOUNT_EXTENSION_TYPE, SCALED_UI_AMOUNT_CONFIG_LENGTH)]);
        malformed.data.pop();
        assert!(mint_has_transfer_fee_config(&malformed.data).is_err());
    }

    #[test]
    fn harvest_is_emitted_only_for_mints_with_transfer_fee_config() {
        let mint = Pubkey::new_unique();
        let source = Pubkey::new_unique();

        let legacy_mint = Account {
            owner: spl_token::ID,
            ..Account::default()
        };
        assert!(harvest_withheld_fees_to_mint_instruction(&mint, &legacy_mint, &source).unwrap().is_none());
        assert!(harvest_withheld_fees_to_mint_instruction(&mint, &token_2022_mint_account(&[]), &source)
            .unwrap()
            .is_none());
        assert!(harvest_withheld_fees_to_mint_instruction(
            &mint,
            &token_2022_mint_account(&[(SCALED_UI_AMOUNT_EXTENSION_TYPE, SCALED_UI_AMOUNT_CONFIG_LENGTH)]),
            &source,
        )
        .unwrap()
        .is_none());

        let instruction = harvest_withheld_fees_to_mint_instruction(
            &mint,
            &token_2022_mint_account(&[
                (SCALED_UI_AMOUNT_EXTENSION_TYPE, SCALED_UI_AMOUNT_CONFIG_LENGTH),
                (TRANSFER_FEE_CONFIG_EXTENSION_TYPE, TRANSFER_FEE_CONFIG_LENGTH),
            ]),
            &source,
        )
        .unwrap()
        .unwrap();
        assert_eq!(instruction.program_id, spl_token_2022::ID);
        assert_eq!(instruction.accounts.len(), 2);
        assert_eq!(instruction.accounts[0].pubkey, mint);
        assert!(instruction.accounts[0].is_writable);
        assert_eq!(instruction.accounts[1].pubkey, source);
        assert!(instruction.accounts[1].is_writable);
    }
}
