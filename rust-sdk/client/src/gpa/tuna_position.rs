use std::error::Error;

pub const TUNA_POSITION_DISCRIMINATOR: &[u8] = &[76, 197, 161, 51, 232, 15, 137, 220];

use solana_client::{
    rpc_client::RpcClient,
    rpc_filter::{Memcmp, RpcFilterType},
};
use solana_pubkey::Pubkey;

use crate::accounts::TunaPosition;
use crate::generated::shared::DecodedAccount;
use crate::gpa::utils::fetch_decoded_program_accounts;

#[derive(Debug, Clone)]
pub enum TunaPositionFilter {
    Authority(Pubkey),
    Pool(Pubkey),
    MintA(Pubkey),
    MintB(Pubkey),
    Mint(Pubkey),
}

impl From<TunaPositionFilter> for RpcFilterType {
    fn from(val: TunaPositionFilter) -> Self {
        match val {
            TunaPositionFilter::Authority(address) => RpcFilterType::Memcmp(Memcmp::new_base58_encoded(11, &address.to_bytes())),
            TunaPositionFilter::Pool(address) => RpcFilterType::Memcmp(Memcmp::new_base58_encoded(43, &address.to_bytes())),
            TunaPositionFilter::MintA(address) => RpcFilterType::Memcmp(Memcmp::new_base58_encoded(75, &address.to_bytes())),
            TunaPositionFilter::MintB(address) => RpcFilterType::Memcmp(Memcmp::new_base58_encoded(107, &address.to_bytes())),
            TunaPositionFilter::Mint(address) => RpcFilterType::Memcmp(Memcmp::new_base58_encoded(139, &address.to_bytes())),
        }
    }
}

pub fn fetch_all_tuna_position_with_filter(
    rpc: &RpcClient,
    filters: Vec<TunaPositionFilter>,
) -> Result<Vec<DecodedAccount<TunaPosition>>, Box<dyn Error>> {
    let mut filters: Vec<RpcFilterType> = filters.into_iter().map(|filter| filter.into()).collect();
    filters.push(RpcFilterType::Memcmp(Memcmp::new_base58_encoded(0, TUNA_POSITION_DISCRIMINATOR)));
    fetch_decoded_program_accounts(rpc, filters)
}
