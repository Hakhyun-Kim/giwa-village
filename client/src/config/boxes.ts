// 자동 생성 파일 — scripts/deploy-village.mjs 가 기록한다. 직접 수정 금지.
export const BOXES_ADDRESS = "0xeb0349f00fc781c807b6d15c74d7f5fb15996b2e" as `0x${string}`;
export const BOXES_DEPLOY_TX = "0xce42108bb012cf6ed8e87dafc6f603bbb000343e05e7e661a69b9cd0b63fd14d";
export const BOXES_DEPLOY_BLOCK = 31087280n;
export const BOXES_ABI = [
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
        "indexed": false,
        "internalType": "uint64",
        "name": "commitBlock",
        "type": "uint64"
      }
    ],
    "name": "BoxOpened",
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
        "indexed": false,
        "internalType": "uint8",
        "name": "kind",
        "type": "uint8"
      }
    ],
    "name": "BoxRevealed",
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
        "indexed": false,
        "internalType": "uint8",
        "name": "kind",
        "type": "uint8"
      }
    ],
    "name": "TrinketEquipped",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "COOLDOWN",
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
    "inputs": [],
    "name": "KINDS",
    "outputs": [
      {
        "internalType": "uint8",
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint8",
        "name": "kind",
        "type": "uint8"
      }
    ],
    "name": "equipTrinket",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "lastOpenAt",
    "outputs": [
      {
        "internalType": "uint64",
        "name": "",
        "type": "uint64"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "openBox",
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
        "internalType": "uint8",
        "name": "equipped",
        "type": "uint8"
      },
      {
        "internalType": "uint64",
        "name": "pendingBlock",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "nextOpenAt",
        "type": "uint64"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "reveal",
    "outputs": [
      {
        "internalType": "uint8",
        "name": "kind",
        "type": "uint8"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;
