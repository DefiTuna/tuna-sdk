use std::error::Error;

pub const LENDING_POSITION_DISCRIMINATOR: &[u8] = &[47, 255, 252, 35, 20, 245, 157, 243];

use solana_client::{
    rpc_client::RpcClient,
    rpc_filter::{Memcmp, RpcFilterType},
};
use solana_pubkey::Pubkey;

use crate::accounts::LendingPosition;
use crate::generated::shared::DecodedAccount;
use crate::gpa::utils::fetch_decoded_program_accounts;

#[derive(Debug, Clone)]
pub enum LendingPositionFilter {
    Authority(Pubkey),
    Mint(Pubkey),
}

impl From<LendingPositionFilter> for RpcFilterType {
    fn from(val: LendingPositionFilter) -> Self {
        match val {
            LendingPositionFilter::Authority(address) => RpcFilterType::Memcmp(Memcmp::new_base58_encoded(11, &address.to_bytes())),
            LendingPositionFilter::Mint(address) => RpcFilterType::Memcmp(Memcmp::new_base58_encoded(43, &address.to_bytes())),
        }
    }
}

pub fn fetch_all_lending_position_with_filter(
    rpc: &RpcClient,
    filters: Vec<LendingPositionFilter>,
) -> Result<Vec<DecodedAccount<LendingPosition>>, Box<dyn Error>> {
    let mut filters: Vec<RpcFilterType> = filters.into_iter().map(|filter| filter.into()).collect();
    filters.push(RpcFilterType::Memcmp(Memcmp::new_base58_encoded(0, LENDING_POSITION_DISCRIMINATOR)));
    fetch_decoded_program_accounts(rpc, filters)
}
