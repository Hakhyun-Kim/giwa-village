// 자동 생성 파일 — scripts/deploy-market.mjs 가 기록한다. 직접 수정 금지.
export const MARKET_ADDRESS = "0x61491fee55e574cd515da6383af0a2a1c1511357" as `0x${string}`;
export const MARKET_DEPLOY_TX = "0x6021703cb4da9373bc19bb6861e27893d98cdbd5911f2801360a3dd54910ec5e";
export const MARKET_ABI = [
  {
    "inputs": [],
    "name": "TransferFailed",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "expected",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "sent",
        "type": "uint256"
      }
    ],
    "name": "WrongPrice",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ZeroPrice",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ZeroSeller",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ZeroValue",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "seller",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "itemId",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "price",
        "type": "uint256"
      }
    ],
    "name": "Listed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "buyer",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "seller",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "itemId",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "Purchased",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "seller",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "itemId",
        "type": "string"
      }
    ],
    "name": "Unlisted",
    "type": "event"
  },
  {
    "inputs": [
      {
        "internalType": "address payable",
        "name": "seller",
        "type": "address"
      },
      {
        "internalType": "string",
        "name": "itemId",
        "type": "string"
      }
    ],
    "name": "buy",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "itemId",
        "type": "string"
      },
      {
        "internalType": "uint128",
        "name": "price",
        "type": "uint128"
      }
    ],
    "name": "list",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "seller",
        "type": "address"
      },
      {
        "internalType": "string",
        "name": "itemId",
        "type": "string"
      }
    ],
    "name": "listingOf",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "price",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "active",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "itemId",
        "type": "string"
      }
    ],
    "name": "unlist",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;
