use std::error::Error;

use solana_client::{
    rpc_client::RpcClient,
    rpc_filter::{Memcmp, RpcFilterType},
};
use solana_pubkey::Pubkey;

use crate::accounts::{TunaLpPosition, TUNA_SPOT_POSITION_DISCRIMINATOR};
use crate::generated::shared::DecodedAccount;
use crate::gpa::utils::fetch_decoded_program_accounts;

#[derive(Debug, Clone)]
pub enum TunaSpotPositionFilter {
    Authority(Pubkey),
    Pool(Pubkey),
    MintA(Pubkey),
    MintB(Pubkey),
    Mint(Pubkey),
}

impl From<TunaSpotPositionFilter> for RpcFilterType {
    fn from(val: TunaSpotPositionFilter) -> Self {
        match val {
            TunaSpotPositionFilter::Authority(address) => RpcFilterType::Memcmp(Memcmp::new_base58_encoded(11, &address.to_bytes())),
            TunaSpotPositionFilter::Pool(address) => RpcFilterType::Memcmp(Memcmp::new_base58_encoded(43, &address.to_bytes())),
            TunaSpotPositionFilter::MintA(address) => RpcFilterType::Memcmp(Memcmp::new_base58_encoded(75, &address.to_bytes())),
            TunaSpotPositionFilter::MintB(address) => RpcFilterType::Memcmp(Memcmp::new_base58_encoded(107, &address.to_bytes())),
            TunaSpotPositionFilter::Mint(address) => RpcFilterType::Memcmp(Memcmp::new_base58_encoded(139, &address.to_bytes())),
        }
    }
}

pub fn fetch_all_tuna_spot_position_with_filter(
    rpc: &RpcClient,
    filters: Vec<TunaSpotPositionFilter>,
) -> Result<Vec<DecodedAccount<TunaLpPosition>>, Box<dyn Error>> {
    let mut filters: Vec<RpcFilterType> = filters.into_iter().map(|filter| filter.into()).collect();
    filters.push(RpcFilterType::Memcmp(Memcmp::new_base58_encoded(0, &TUNA_SPOT_POSITION_DISCRIMINATOR)));
    fetch_decoded_program_accounts(rpc, filters)
}
