// 자동 생성 파일 — scripts/deploy-village.mjs 가 기록한다. 직접 수정 금지.
export const HONORS_ADDRESS = "0xdc1c3388129b4e9a5ab23a8bc3b90a5c7eafc648" as `0x${string}`;
export const HONORS_DEPLOY_TX = "0x86a8708235f3bde9013b35bb18cf204f019d7526f9b8b67e8eb830f7b23f803c";
export const HONORS_DEPLOY_BLOCK = 31038052n;
export const HONORS_ABI = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "market_",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "guilds_",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "who",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "HonorClaimed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "who",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "HonorEquipped",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "MAX_ID",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "claim",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "who",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "eligible",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "equip",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "guilds",
    "outputs": [
      {
        "internalType": "contract IGiwaGuilds",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "market",
    "outputs": [
      {
        "internalType": "contract IGiwaMarketStalls",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "who",
        "type": "address"
      }
    ],
    "name": "profileOf",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "mask",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "equippedId",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;
