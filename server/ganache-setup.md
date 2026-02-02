# Ganache Setup Guide for Block Vote

## 🚀 Quick Setup

### 1. Install Ganache
```bash
npm install -g ganache-cli
# OR download Ganache GUI from https://trufflesuite.com/ganache/
```

### 2. Start Ganache
```bash
# CLI version
ganache-cli -p 7545 -i 1337 --accounts 10 --defaultBalanceEther 100

# OR use Ganache GUI:
# - Set RPC Server: HTTP://127.0.0.1:7545
# - Network ID: 1337
# - Accounts: 10
# - Default Balance: 100 ETH
```

### 3. Deploy Smart Contract
```bash
cd contracts
truffle migrate --reset --network development
```

### 4. Update Environment Variables
Copy the deployed contract address and admin account address to your `.env` file:

```env
ETHEREUM_NODE_URL=http://127.0.0.1:7545
CONTRACT_ADDRESS=<deployed_contract_address>
ADMIN_ETHEREUM_ADDRESS=<first_account_from_ganache>
CHAIN_ID=1337
```

## 🔧 Troubleshooting

### Common Issues:

1. **"Connection refused" error**
   - Make sure Ganache is running on port 7545
   - Check if another service is using port 7545

2. **"Insufficient funds" error**
   - Ensure the admin account has ETH (should have 100 ETH by default)
   - Check the admin address in your .env file

3. **"Contract method does not exist" error**
   - Redeploy the contract with `truffle migrate --reset`
   - Update the contract address in .env

4. **"Network ID mismatch" error**
   - Set Ganache network ID to 1337
   - Update CHAIN_ID in .env to match

## ✅ Verification Commands

Test your setup:
```bash
# Check if Ganache is running
curl -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' http://127.0.0.1:7545

# Check account balance
curl -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_getBalance","params":["YOUR_ADMIN_ADDRESS","latest"],"id":1}' http://127.0.0.1:7545
``` 