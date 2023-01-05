import { ConfirmedSignatureInfo, Connection, PublicKey } from "@solana/web3.js";
import fs from "fs";
import { Metadata } from "@metaplex-foundation/mpl-token-metadata";

async function main() {
    // Get command line arguments
    const args = process.argv.slice(2, 4);

    let connection = new Connection(
        args[1] || "https://api.metaplex.com",
        "confirmed"
    );
    let collection_id = new PublicKey(args[0]);
    let metaplexProgramId = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";

    console.log("Getting signatures...");
    let allSignatures: ConfirmedSignatureInfo[] = [];

    // This returns the first 1000, so we need to loop through until we run out of signatures to get.
    let signatures = await connection.getSignaturesForAddress(collection_id);
    allSignatures.push(...signatures);
    do {
        let options = {
            before: signatures[signatures.length - 1].signature,
        };
        signatures = await connection.getSignaturesForAddress(
            collection_id,
            options
        );
        allSignatures.push(...signatures);
    } while (signatures.length > 0);

    console.log(`Found ${allSignatures.length} signatures`);
    let metadataAddresses: PublicKey[] = [];
    let mintAddresses = new Set<string>();

    console.log("Getting transaction data...");
    const promises = allSignatures.map((s) =>
        connection.getTransaction(s.signature)
    );
    const transactions = await Promise.all(promises);

    console.log("Parsing transaction data...");
    for (const tx of transactions) {
        if (tx) {
            let programIds = tx!.transaction.message
                .programIds()
                .map((p) => p.toString());
            let accountKeys = tx!.transaction.message.accountKeys.map((p) =>
                p.toString()
            );

            // Only look in transactions that call the Metaplex token metadata program
            if (programIds.includes(metaplexProgramId)) {
                // Go through all instructions in a given transaction
                for (const ix of tx!.transaction.message.instructions) {
                    // Filter for setAndVerify or verify instructions in the Metaplex token metadata program
                    if (
                        (ix.data == "K" || // VerifyCollection instruction
                            ix.data == "S" || // SetAndVerifyCollection instruction
                            ix.data == "X" || // VerifySizedCollectionItem instruction
                            ix.data == "Z") && // SetAndVerifySizedCollectionItem instruction
                        accountKeys[ix.programIdIndex] == metaplexProgramId
                    ) {
                        let metadataAddressIndex = ix.accounts[0];
                        let metadata_address =
                            tx!.transaction.message.accountKeys[
                                metadataAddressIndex
                            ];
                        metadataAddresses.push(metadata_address);
                    }
                }
            }
        }
    }

    const promises2 = metadataAddresses.map((a) =>
        connection.getAccountInfo(a)
    );
    const metadataAccounts = await Promise.all(promises2);
    for (const account of metadataAccounts) {
        if (account) {
            let metadata = await Metadata.deserialize(account!.data);
            mintAddresses.add(metadata[0].mint.toBase58());
        }
    }
    let mints: string[] = Array.from(mintAddresses);
    fs.writeFileSync(`${collection_id}_mints.json`, JSON.stringify(mints));
}

main().then(() => console.log("Success"));
