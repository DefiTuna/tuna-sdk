use anyhow::Result;
use solana_account::Account;
use solana_address_lookup_table_interface::state::LOOKUP_TABLE_META_SIZE;
use solana_pubkey::Pubkey;
use solana_rpc_client::rpc_client::RpcClient;
use spl_token::solana_program::address_lookup_table::AddressLookupTableAccount;

pub fn fetch_address_lookup_table(
  client: &RpcClient,
  lookup_table_address: &Pubkey,
) -> Result<AddressLookupTableAccount> {
  let account = client.get_account(lookup_table_address)?;
  let table = deserialize_address_lookup_table(*lookup_table_address, &account)?;
  Ok(table)
}

/// modified from sdk.1.17.x
/// https://docs.rs/solana-program/latest/src/solana_program/address_lookup_table/state.rs.html#192
pub fn deserialize_address_lookup_table(address: Pubkey, account: &Account) -> Result<AddressLookupTableAccount> {
  let raw_addresses_data: &[u8] = account
    .data
    .get(LOOKUP_TABLE_META_SIZE..)
    .expect("invalid lookup table account data length");

  let addresses = bytemuck::try_cast_slice(raw_addresses_data).expect("incorrect address lookup table");

  Ok(AddressLookupTableAccount {
    key: address,
    addresses: addresses.to_vec(),
  })
}
