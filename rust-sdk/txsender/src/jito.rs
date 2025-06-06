use crate::request_handler::RequestHandler;
use anyhow::{anyhow, Result};
use futures_util::StreamExt;
use log::{error, info, warn};
use reqwest::{Client, Method, Url};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use solana_sdk::native_token::LAMPORTS_PER_SOL;
use std::time::Duration;
use tokio::task::JoinHandle;
use tokio::time::sleep;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::Message;

pub const MIN_JITO_TIP_LAMPORTS: u64 = 1000;
pub const MIN_JITO_TIP_SOL: f64 = MIN_JITO_TIP_LAMPORTS as f64 / LAMPORTS_PER_SOL as f64;

/// Jito tip accounts
pub const JITO_TIP_ACCOUNTS: [&str; 8] = [
    "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
    "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
    "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
    "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
    "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
    "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
    "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
    "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
];

#[derive(Deserialize, Default, Clone, Debug)]
pub struct JitoTipInfo {
    pub time: String,
    pub landed_tips_25th_percentile: f64,     // in SOL
    pub landed_tips_50th_percentile: f64,     // in SOL
    pub landed_tips_75th_percentile: f64,     // in SOL
    pub landed_tips_95th_percentile: f64,     // in SOL
    pub landed_tips_99th_percentile: f64,     // in SOL
    pub ema_landed_tips_50th_percentile: f64, // in SOL
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct BasicRequest {
    pub jsonrpc: String,
    pub id: u32,
    pub method: String,
    pub params: Vec<Vec<String>>,
}

pub async fn send_jito_bundle(client: Client, serialized_transactions: Vec<String>, jito_api_url: &str) -> Result<String> {
    let request = BasicRequest {
        jsonrpc: "2.0".to_string(),
        id: 1,
        method: "sendBundle".to_string(),
        params: vec![serialized_transactions],
    };

    let parsed_url = Url::parse(jito_api_url).expect("Failed to parse URL");

    let handler = RequestHandler::new(client.clone())?;
    let response: Value = handler.send(Method::POST, parsed_url, Some(&request)).await?;

    if let Some(error) = response.get("error") {
        return Err(anyhow!("{}", error.to_string()));
    }

    if let Some(result) = response.get("result") {
        if let Some(bundle_id) = result.as_str() {
            return Ok(bundle_id.to_string());
        }
    }

    Err(anyhow!("Unexpected response format"))
}

pub async fn poll_jito_bundle_statuses(client: Client, bundle_id: String, jito_api_url: &str, timeout: Duration) -> Result<String> {
    let interval: Duration = Duration::from_secs(2);
    let start: tokio::time::Instant = tokio::time::Instant::now();

    while start.elapsed() < timeout {
        let bundle_statuses = get_bundle_statuses(client.clone(), vec![bundle_id.clone()], jito_api_url).await?;

        if let Some(values) = bundle_statuses["result"]["value"].as_array() {
            if !values.is_empty() {
                if let Some(status) = values[0]["confirmation_status"].as_str() {
                    if status == "confirmed" {
                        return Ok(values[0]["transactions"][0].as_str().unwrap().to_string());
                    }
                }
            }
        }

        sleep(interval).await;
    }

    Err(anyhow!("Unable to confirm jito bundle {} in {} seconds", bundle_id, timeout.as_secs()))
}

/// Get the status of Jito bundles
///
/// # Arguments
/// * `bundle_ids` - An array of bundle IDs to check the status for
/// * `jito_api_url` - The Jito Block Engine API URL
///
/// # Returns
/// A `Result` containing the status of the bundles as a `serde_json::Value`
pub async fn get_bundle_statuses(client: Client, bundle_ids: Vec<String>, jito_api_url: &str) -> Result<Value> {
    let request: BasicRequest = BasicRequest {
        jsonrpc: "2.0".to_string(),
        id: 1,
        method: "getBundleStatuses".to_string(),
        params: vec![bundle_ids],
    };

    let parsed_url: Url = Url::parse(jito_api_url).expect("Failed to parse URL");

    let handler = RequestHandler::new(client)?;
    let response: Value = handler.send(Method::POST, parsed_url, Some(&request)).await?;

    if let Some(error) = response.get("error") {
        return Err(anyhow!("Error getting jito bundle statuses: {:?}; url: {}", error, jito_api_url.to_string()));
    }

    // Return the response value
    Ok(response)
}

pub fn start_jito_tips_stream<F, Fut>(on_update: F) -> JoinHandle<()>
where
    F: Fn(JitoTipInfo) -> Fut + Send + 'static,
    Fut: std::future::Future<Output = ()> + Send + 'static,
{
    tokio::spawn(async move {
        let mut connect_attempts = 0;
        loop {
            connect_attempts += 1;
            let request = "wss://bundles.jito.wtf/api/v1/bundles/tip_stream".into_client_request().unwrap();

            let (ws_stream, _) = connect_async(request).await.expect("Failed to connect");
            info!(target: "log", "Connected to Jito tip stream");

            let (_, mut read) = ws_stream.split();

            while let Some(msg) = read.next().await {
                match msg {
                    Ok(Message::Text(text)) => {
                        //info!(target: "log", "Received: {}", text);
                        let tips = serde_json::from_slice::<Vec<JitoTipInfo>>(text.as_bytes()).expect("Failed to parse Jito tip stream");
                        if tips.len() > 0 {
                            connect_attempts = 0;
                            on_update(tips[0].clone()).await;
                        }
                    }
                    Ok(_) => {}
                    Err(e) => error!(target: "log", "Jito tip stream webSocket error: {}", e),
                }
            }

            if connect_attempts >= 5 {
                panic!("Failed to connect to Jito tip stream after 5 attempts");
            }
        }
    })
}

/// Jito API URLs for different regions
pub fn get_jito_api_url_by_region(region: &str) -> String {
    match region {
        "NY" => "https://ny.mainnet.block-engine.jito.wtf".to_string(),
        "Amsterdam" => "https://amsterdam.mainnet.block-engine.jito.wtf".to_string(),
        "Frankfurt" => "https://frankfurt.mainnet.block-engine.jito.wtf".to_string(),
        "Tokyo" => "https://tokyo.mainnet.block-engine.jito.wtf".to_string(),
        "Default" => "https://mainnet.block-engine.jito.wtf".to_string(),
        _ => {
            warn!(target: "log", "Unknown Jito region provided: '{}', using the default one.", region);
            "https://mainnet.block-engine.jito.wtf".to_string()
        }
    }
}
