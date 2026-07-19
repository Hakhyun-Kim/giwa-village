// 자동 생성 파일 — scripts/deploy-village.mjs 가 기록한다. 직접 수정 금지.
export const HEARTH_ADDRESS = "0xf780265d5f49abd8c7e5d18d81d33426f62f3365" as `0x${string}`;
export const HEARTH_DEPLOY_TX = "0x9ee86fbfcea7fe8a9b66212115d1e77c4c87ca1657da12612f5fcf5a5870c51e";
export const HEARTH_DEPLOY_BLOCK = 31091006n;
export const HEARTH_ABI = [
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
        "name": "window",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint16",
        "name": "count",
        "type": "uint16"
      }
    ],
    "name": "Gathered",
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
        "name": "window",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint32",
        "name": "warmth",
        "type": "uint32"
      }
    ],
    "name": "Warmed",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "WINDOW",
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
        "name": "w",
        "type": "uint256"
      }
    ],
    "name": "claim",
    "outputs": [
      {
        "internalType": "uint32",
        "name": "",
        "type": "uint32"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "countOf",
    "outputs": [
      {
        "internalType": "uint16",
        "name": "",
        "type": "uint16"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "gather",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "ts",
        "type": "uint256"
      }
    ],
    "name": "isMarketDay",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "joined",
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
        "internalType": "address",
        "name": "who",
        "type": "address"
      }
    ],
    "name": "statusOf",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "w",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "joinedNow",
        "type": "bool"
      },
      {
        "internalType": "uint16",
        "name": "cnt",
        "type": "uint16"
      },
      {
        "internalType": "bool",
        "name": "prevClaimable",
        "type": "bool"
      },
      {
        "internalType": "uint32",
        "name": "warmth",
        "type": "uint32"
      }
    ],
    "stateMutability": "view",
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
    "name": "warmthOf",
    "outputs": [
      {
        "internalType": "uint32",
        "name": "",
        "type": "uint32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "windowNow",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;
