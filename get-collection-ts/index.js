import { PublicKey } from "@solana/web3.js";
import fs from "fs";

const url = `https://mainnet.helius-rpc.com/?api-key=<api-key>`;

const getAssetsByGroup = async () => {
  const args = process.argv.slice(2, 4);

  let collection_id = new PublicKey(args[0]);
  console.time("getAssetsByGroup"); // Start the timer
  let page = 1;
  let assetList = [];

  while (page) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "my-id",
        method: "getAssetsByGroup",
        params: {
          groupKey: "collection",
          groupValue: collection_id,
          page: page,
          limit: 1000,
        },
      }),
    });
    const { result } = await response.json();

    assetList.push(...result.items);
    if (result.total !== 1000) {
      page = false;
    } else {
      page++;
    }
  }
  const resultData = {
    totalResults: assetList.length,
    results: assetList,
  };
  console.log(`${collection_id} Assets`, resultData);

  const mints = resultData.results.map((item) => {
    return item.id;
  }
  );
  console.log(`${collection_id} Mints`, mints);
  console.timeEnd("getAssetsByGroup"); // Stop the timer
  fs.writeFileSync(`${collection_id}_full.json`, JSON.stringify(resultData));
  fs.writeFileSync(`${collection_id}_mints.json`, JSON.stringify(mints));

  // 

};
getAssetsByGroup();