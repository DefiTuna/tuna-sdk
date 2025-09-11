use std::error::Error;

use solana_client::{
    rpc_client::RpcClient,
    rpc_filter::{Memcmp, RpcFilterType},
};
use solana_pubkey::Pubkey;

use crate::accounts::{TunaLpPosition, TUNA_LP_POSITION_DISCRIMINATOR};
use crate::generated::shared::DecodedAccount;
use crate::gpa::utils::fetch_decoded_program_accounts;

#[derive(Debug, Clone)]
pub enum TunaLpPositionFilter {
    Authority(Pubkey),
    Pool(Pubkey),
    MintA(Pubkey),
    MintB(Pubkey),
    Mint(Pubkey),
}

impl From<TunaLpPositionFilter> for RpcFilterType {
    fn from(val: TunaLpPositionFilter) -> Self {
        match val {
            TunaLpPositionFilter::Authority(address) => RpcFilterType::Memcmp(Memcmp::new_base58_encoded(11, &address.to_bytes())),
            TunaLpPositionFilter::Pool(address) => RpcFilterType::Memcmp(Memcmp::new_base58_encoded(43, &address.to_bytes())),
            TunaLpPositionFilter::MintA(address) => RpcFilterType::Memcmp(Memcmp::new_base58_encoded(75, &address.to_bytes())),
            TunaLpPositionFilter::MintB(address) => RpcFilterType::Memcmp(Memcmp::new_base58_encoded(107, &address.to_bytes())),
            TunaLpPositionFilter::Mint(address) => RpcFilterType::Memcmp(Memcmp::new_base58_encoded(139, &address.to_bytes())),
        }
    }
}

pub fn fetch_all_tuna_lp_position_with_filter(
    rpc: &RpcClient,
    filters: Vec<TunaLpPositionFilter>,
) -> Result<Vec<DecodedAccount<TunaLpPosition>>, Box<dyn Error>> {
    let mut filters: Vec<RpcFilterType> = filters.into_iter().map(|filter| filter.into()).collect();
    filters.push(RpcFilterType::Memcmp(Memcmp::new_base58_encoded(0, &TUNA_LP_POSITION_DISCRIMINATOR)));
    fetch_decoded_program_accounts(rpc, filters)
}
