use crate::accounts::{Referral, REFERRAL_DISCRIMINATOR};
use crate::gpa::utils::fetch_decoded_program_accounts;
use crate::DecodedAccount;
use solana_client::rpc_client::RpcClient;
use solana_client::rpc_filter::{Memcmp, RpcFilterType};
use solana_pubkey::Pubkey;
use std::error::Error;

#[derive(Debug, Clone)]
pub enum ReferralFilter {
    Authority(Pubkey),
    ReferralId(u32),
}

impl From<ReferralFilter> for RpcFilterType {
    fn from(val: ReferralFilter) -> Self {
        match val {
            ReferralFilter::Authority(address) => RpcFilterType::Memcmp(Memcmp::new_base58_encoded(8, &address.to_bytes())),
            ReferralFilter::ReferralId(referral_id) => RpcFilterType::Memcmp(Memcmp::new_base58_encoded(48, &referral_id.to_le_bytes())),
        }
    }
}

pub fn fetch_all_referral_with_filter(rpc: &RpcClient, filters: Vec<ReferralFilter>) -> Result<Vec<DecodedAccount<Referral>>, Box<dyn Error>> {
    let mut filters: Vec<RpcFilterType> = filters.into_iter().map(|filter| filter.into()).collect();
    filters.push(RpcFilterType::Memcmp(Memcmp::new_base58_encoded(0, &REFERRAL_DISCRIMINATOR)));
    fetch_decoded_program_accounts(rpc, filters)
}
