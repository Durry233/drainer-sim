const { ethers } = require('ethers');
const fs = require('fs');
const csv = require('csv-parser');

// Mainnet RPC for allowance query (view-only, legal)
const mainnetProvider = new ethers.JsonRpcProvider('https://eth-mainnet.g.alchemy.com/v2/demo');

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

async function scanAllowance(addr, tokenAddr, spenderAddr) {
  const erc20 = new ethers.Contract(tokenAddr, ERC20_ABI, mainnetProvider);
  try {
    const dec = await erc20.decimals();
    const balance = await erc20.balanceOf(addr);
    const allowance = await erc20.allowance(addr, spenderAddr);
    const balanceHuman = ethers.formatUnits(balance, dec);
    const allowanceHuman = ethers.formatUnits(allowance, dec);
    return {
      addr,
      tokenAddr,
      spenderAddr,
      balance: balanceHuman,
      allowance: allowanceHuman,
      isPositive: allowance > 0n
    };
  } catch (e) {
    console.log(`Query failed for ${addr}: ${e.message}`);
    return null;
  }
}

async function loadVictims(csvPath = 'dune-results.csv') {
  return new Promise((resolve, reject) => {
    const victims = [];
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (row) => {
        const addr = row.victim_wallet?.trim();
        const token = row.token_address?.trim();
        const spender = row.malicious_dapp?.trim();
        const rawAmtStr = row.raw_amount?.trim();
        if (addr && token && spender && rawAmtStr && !isNaN(rawAmtStr) && rawAmtStr !== '') {
          victims.push({
            addr,
            token,
            spender,
            rawAmtStr
          });
        }
      })
      .on('end', () => resolve(victims))
      .on('error', reject);
  });
}

async function main() {
  const victims = await loadVictims();
  console.log(`Loaded ${victims.length} victims`);
  if (victims.length === 0) {
    console.log('Add test data to CSV!');
    return;
  }
  console.log('\n--- Scan Results ---\n');
  let positiveCount = 0;
  for (const v of victims) {
    const result = await scanAllowance(v.addr, v.token, v.spender);
    if (result) {
      console.log(`Victim ${result.addr} | Token ${result.tokenAddr} | Spender ${result.spenderAddr}`);
      console.log(`Balance: ${result.balance} | Allowance: ${result.allowance} | Positive: ${result.isPositive}`);
      if (result.isPositive) positiveCount++;
    }
    await new Promise(r => setTimeout(r, 1000)); // Rate limit (1s)
  }
  console.log(`\nSummary: ${positiveCount} / ${victims.length} have positive allowance (targets).`);
}

main().catch(console.error);
