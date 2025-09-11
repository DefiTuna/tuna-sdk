use crate::accounts::{Market, MARKET_DISCRIMINATOR};
use crate::gpa::utils::fetch_decoded_program_accounts;
use crate::types::MarketMaker;
use crate::DecodedAccount;
use solana_client::rpc_client::RpcClient;
use solana_client::rpc_filter::{Memcmp, RpcFilterType};
use solana_pubkey::Pubkey;
use std::error::Error;

#[derive(Debug, Clone)]
pub enum MarketFilter {
    MarketMaker(MarketMaker),
    Mint(Pubkey),
}

impl From<MarketFilter> for RpcFilterType {
    fn from(val: MarketFilter) -> Self {
        match val {
            MarketFilter::MarketMaker(market_maker) => RpcFilterType::Memcmp(Memcmp::new_base58_encoded(11, &[market_maker as u8])),
            MarketFilter::Mint(address) => RpcFilterType::Memcmp(Memcmp::new_base58_encoded(12, &address.to_bytes())),
        }
    }
}

pub fn fetch_all_market_with_filter(rpc: &RpcClient, filters: Vec<MarketFilter>) -> Result<Vec<DecodedAccount<Market>>, Box<dyn Error>> {
    let mut filters: Vec<RpcFilterType> = filters.into_iter().map(|filter| filter.into()).collect();
    filters.push(RpcFilterType::Memcmp(Memcmp::new_base58_encoded(0, &MARKET_DISCRIMINATOR)));
    fetch_decoded_program_accounts(rpc, filters)
}
