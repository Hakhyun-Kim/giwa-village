// 자동 생성 파일 — scripts/deploy-village.mjs 가 기록한다. 직접 수정 금지.
// 호패(GiwaIdentity)는 아직 GIWA Sepolia 에 배포 전이다 — 주소가 null 이면 화면은 호패 없이 돈다.
// 배포: node scripts/deploy-village.mjs GiwaIdentity (이 파일을 실제 주소로 덮어쓴다)
export const IDENTITY_ADDRESS = null as `0x${string}` | null;
export const IDENTITY_DEPLOY_TX = null as string | null;
export const IDENTITY_DEPLOY_BLOCK = null as bigint | null;
export const IDENTITY_ABI = [
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "burner",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "principal",
        "type": "address"
      }
    ],
    "name": "Linked",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "burner",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "principal",
        "type": "address"
      }
    ],
    "name": "Unlinked",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "LINK_TYPEHASH",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "domainSeparator",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
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
    "name": "identityOf",
    "outputs": [
      {
        "internalType": "address",
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
        "name": "principal",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "deadline",
        "type": "uint256"
      },
      {
        "internalType": "uint8",
        "name": "v",
        "type": "uint8"
      },
      {
        "internalType": "bytes32",
        "name": "r",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "s",
        "type": "bytes32"
      }
    ],
    "name": "link",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "burner",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "principal",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "nonce",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "deadline",
        "type": "uint256"
      }
    ],
    "name": "linkDigest",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
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
    "name": "nonces",
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
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "principalOf",
    "outputs": [
      {
        "internalType": "address",
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
        "name": "burner",
        "type": "address"
      }
    ],
    "name": "revoke",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "unlink",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;
