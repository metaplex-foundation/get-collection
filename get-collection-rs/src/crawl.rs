use anyhow::Result;
use mpl_token_metadata::{state::Metadata, ID};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json;
use solana_client::rpc_client::{GetConfirmedSignaturesForAddress2Config, RpcClient};
use solana_program::borsh::try_from_slice_unchecked;
use solana_sdk::{commitment_config::CommitmentConfig, pubkey::Pubkey, signature::Signature};
use solana_transaction_status::{
    EncodedConfirmedTransaction, EncodedTransaction, UiInstruction, UiMessage, UiParsedInstruction,
    UiTransactionEncoding,
};
use std::{
    collections::HashSet,
    str::FromStr,
    sync::{Arc, Mutex},
};

#[derive(Debug, Deserialize, Clone, PartialEq, Eq, Hash, Serialize)]
struct Transaction {
    pub program_id: String,
    pub accounts: Vec<String>,
    pub data: String,
}

impl Transaction {
    fn new() -> Transaction {
        Transaction {
            program_id: String::new(),
            accounts: Vec::new(),
            data: String::new(),
        }
    }
}

pub fn crawl_txs(client: &RpcClient, collection_id: &Pubkey) -> Result<()> {
    let mut all_signatures = Vec::new();
    let mut signatures = client.get_signatures_for_address(&collection_id)?;

    while signatures.len() > 0 {
        let last_sig = Signature::from_str(&signatures[signatures.len() - 1].signature)?;
        all_signatures.append(&mut signatures);
        let config = GetConfirmedSignaturesForAddress2Config {
            before: Some(last_sig),
            until: None,
            limit: None,
            commitment: Some(CommitmentConfig::confirmed()),
        };
        signatures = client.get_signatures_for_address_with_config(&collection_id, config)?;
    }
    let transactions = Arc::new(Mutex::new(Vec::new()));

    println!("Found {} signatures", all_signatures.len());

    all_signatures.par_iter().for_each(|sig| {
        let signature = Signature::from_str(&sig.signature).expect("Failed to parse signature");
        let tx = match client.get_transaction(&signature, UiTransactionEncoding::JsonParsed) {
            Ok(tx) => tx,
            Err(err) => {
                println!("Failed to get transaction: {:?}", err);
                return;
            }
        };
        let transaction = extract_transaction_data(tx);
        transactions.lock().unwrap().push(transaction);
    });

    let transactions = transactions.lock().unwrap();

    let transactions: Vec<&Transaction> =
        transactions.iter().filter(|tx| is_verify_tx(tx)).collect();

    let metadata_accounts: Vec<String> = transactions
        .iter()
        .map(|tx| tx.accounts[0].clone())
        .collect();

    let mint_accounts = Arc::new(Mutex::new(HashSet::new()));

    metadata_accounts.par_iter().for_each(|m| {
        let mint_accounts = mint_accounts.clone();
        let data = client
            .get_account_data(&Pubkey::from_str(m).unwrap())
            .unwrap();
        let metadata: Metadata = try_from_slice_unchecked(&data).unwrap();
        mint_accounts
            .lock()
            .unwrap()
            .insert(metadata.mint.to_string());
    });

    let mut file = std::fs::File::create(format!("{}_transactions.json", collection_id))?;
    serde_json::to_writer(&mut file, &transactions)?;

    let mut file = std::fs::File::create(format!("{}_mints.json", collection_id))?;
    serde_json::to_writer(&mut file, &mint_accounts)?;

    Ok(())
}

fn is_verify_tx(tx: &Transaction) -> bool {
    tx.program_id == ID.to_string() && (tx.data == "S" || tx.data == "K")
}

fn extract_transaction_data(tx: EncodedConfirmedTransaction) -> Transaction {
    let mut transaction = Transaction::new();

    let encoded_tx = tx.transaction.transaction;
    if let EncodedTransaction::Json(json) = encoded_tx {
        let message = json.message;

        match message {
            UiMessage::Parsed(value) => {
                for ix in value.instructions {
                    match ix {
                        UiInstruction::Parsed(ix) => match ix {
                            UiParsedInstruction::PartiallyDecoded(ix) => {
                                transaction.program_id = ix.program_id.to_string();
                                transaction.accounts = ix.accounts;
                                transaction.data = ix.data;
                            }
                            UiParsedInstruction::Parsed(_ix) => {
                                // skip system instructions
                                continue;
                            }
                        },
                        UiInstruction::Compiled(ix) => {
                            let accounts: Vec<String> = ix
                                .accounts
                                .chunks(32)
                                .map(|x| bs58::encode(x).into_string())
                                .collect();

                            let program_id = &accounts[ix.program_id_index as usize];
                            transaction.program_id = program_id.to_string();
                            transaction.accounts = accounts;
                            transaction.data = ix.data;
                        }
                    }
                }
            }
            UiMessage::Raw(value) => {
                for ix in value.instructions {
                    let accounts: Vec<String> = ix
                        .accounts
                        .chunks(32)
                        .map(|x| bs58::encode(x).into_string())
                        .collect();

                    let program_id = &accounts[ix.program_id_index as usize];
                    transaction.program_id = program_id.to_string();
                    transaction.accounts = accounts;
                    transaction.data = ix.data;
                }
            }
        };
    }
    transaction
}
