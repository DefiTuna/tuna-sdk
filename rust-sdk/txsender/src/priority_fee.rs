use solana_client::client_error::ClientError;
use solana_client::rpc_client::RpcClient;
use solana_sdk::pubkey::Pubkey;
use std::collections::HashMap;

#[derive(Copy, Clone, PartialEq)]
pub enum PriorityFeeLevel {
    None,
    Low,
    Medium,
    High,
    VeryHigh,
    Ultimate,
}

pub fn get_priority_fee_estimate(client: &RpcClient, addresses: Vec<Pubkey>, level: PriorityFeeLevel) -> Result<u64, ClientError> {
    let recent_prioritization_fees = client.get_recent_prioritization_fees(&addresses)?;
    if recent_prioritization_fees.is_empty() {
        return Ok(0);
    }
    let mut sorted_fees: Vec<_> = recent_prioritization_fees.into_iter().collect();
    sorted_fees.sort_by(|a, b| b.slot.cmp(&a.slot));
    let chunk_size = 150;
    let chunks: Vec<_> = sorted_fees.chunks(chunk_size).take(3).collect();
    let mut percentiles: HashMap<u8, u64> = HashMap::new();
    for chunk in chunks.iter() {
        let fees: Vec<u64> = chunk.iter().map(|fee| fee.prioritization_fee).collect();
        percentiles = calculate_percentiles(&fees);
    }

    let percentile = match level {
        PriorityFeeLevel::None => 0,
        PriorityFeeLevel::Low => 70,
        PriorityFeeLevel::Medium => 75,
        PriorityFeeLevel::High => 80,
        PriorityFeeLevel::VeryHigh => 85,
        PriorityFeeLevel::Ultimate => 95,
    };

    let fee = if percentile == 0 {
        0
    } else {
        *percentiles.get(&percentile).unwrap_or(&0)
    };

    Ok(fee)
}

fn calculate_percentiles(fees: &[u64]) -> HashMap<u8, u64> {
    let mut sorted_fees = fees.to_vec();
    sorted_fees.sort_unstable();
    let len = sorted_fees.len();
    let percentiles = vec![10, 25, 50, 60, 70, 75, 80, 85, 90, 100];
    percentiles
        .into_iter()
        .map(|p| {
            let index = (p as f64 / 100.0 * len as f64).round() as usize;
            (p, sorted_fees[index.saturating_sub(1)])
        })
        .collect()
}
