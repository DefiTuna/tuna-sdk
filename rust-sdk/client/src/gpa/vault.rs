use crate::accounts::Vault;
use crate::gpa::utils::fetch_decoded_program_accounts;
use crate::DecodedAccount;
use solana_client::rpc_client::RpcClient;
use solana_client::rpc_filter::{Memcmp, RpcFilterType};
use solana_pubkey::Pubkey;
use std::error::Error;

pub const VAULT_DISCRIMINATOR: &[u8] = &[211, 8, 232, 43, 2, 152, 117, 119];

#[derive(Debug, Clone)]
pub enum VaultFilter {
    Mint(Pubkey),
}

impl From<VaultFilter> for RpcFilterType {
    fn from(val: VaultFilter) -> Self {
        match val {
            VaultFilter::Mint(address) => RpcFilterType::Memcmp(Memcmp::new_base58_encoded(11, &address.to_bytes())),
        }
    }
}

pub fn fetch_all_vault_with_filter(rpc: &RpcClient, filters: Vec<VaultFilter>) -> Result<Vec<DecodedAccount<Vault>>, Box<dyn Error>> {
    let mut filters: Vec<RpcFilterType> = filters.into_iter().map(|filter| filter.into()).collect();
    filters.push(RpcFilterType::Memcmp(Memcmp::new_base58_encoded(0, VAULT_DISCRIMINATOR)));
    fetch_decoded_program_accounts(rpc, filters)
}
