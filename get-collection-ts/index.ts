import { Connection, PublicKey } from "@solana/web3.js";
import { programs } from "@metaplex/js";
import fs from "fs";
import { MetadataData } from "@metaplex-foundation/mpl-token-metadata";
const {
  metadata: { Metadata }
} = programs;

async function main() {
  let connection = new Connection(
    "https://api.metaplex.solana.com",
    "confirmed"
  );
  let collection_id = new PublicKey(process.argv.slice(2, 3)[0]);
  let metaplexProgramId = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";

  console.log("Getting signatures...");
  let signatures = await connection.getSignaturesForAddress(collection_id);
  let metadataAddresses = [];
  let mintAddresses = new Set<string>();

  console.log("Getting transaction data...");
  const promises = signatures.map((s) =>
    connection.getTransaction(s.signature)
  );
  const transactions = await Promise.all(promises);

  console.log("Parsing transaction data...");
  for (const tx of transactions) {
    let programIds = tx!.transaction.message
      .programIds()
      .map((p) => p.toString());
    let accountKeys = tx!.transaction.message.accountKeys.map((p) =>
      p.toString()
    );

    // Only look in transactions that call the Metaplex token metadata program
    if (programIds.includes(metaplexProgramId)) {
      // Go through all instructios in a given transaction
      for (const ix of tx!.transaction.message.instructions) {
        // Filter for setAndVerify or verify instructions in the Metaplex token metadata program
        if (
          (ix.data == "K" || ix.data == "S") &&
          accountKeys[ix.programIdIndex] == metaplexProgramId
        ) {
          let metadataAddressIndex = ix.accounts[0];
          let metadata_address =
            tx!.transaction.message.accountKeys[metadataAddressIndex];
          metadataAddresses.push(metadata_address);
        }
      }
    }
  }

  const promises2 = metadataAddresses.map((a) => connection.getAccountInfo(a));
  const metadataAccounts = await Promise.all(promises2);
  for (const account of metadataAccounts) {
    let metadata = await MetadataData.deserialize(account!.data);
    mintAddresses.add(metadata.mint);
  }
  let mints: string[] = Array.from(mintAddresses);
  fs.writeFileSync(`${collection_id}_mints.json`, JSON.stringify(mints));
}

main().then(() => console.log("Success"));
