use anyhow::Result;
use solana_client::rpc_client::RpcClient;
use solana_sdk::{commitment_config::CommitmentConfig, pubkey::Pubkey};
use std::{env, str::FromStr, time::Duration};

mod crawl;
use crawl::crawl_txs;

fn main() -> Result<()> {
    let args: Vec<String> = env::args().collect();
    let rpc = args[1].clone();
    let collection_id = Pubkey::from_str(&args[2].clone())?;
    let commitment = CommitmentConfig::from_str("confirmed")?;
    let timeout = Duration::from_secs(300);
    let client = RpcClient::new_with_timeout_and_commitment(rpc.clone(), timeout, commitment);

    crawl_txs(&client, &collection_id)?;

    Ok(())
}
