// 자동 생성 파일 — scripts/deploy-village.mjs 가 기록한다. 직접 수정 금지.
export const BOSS_ADDRESS = "0x11dbe73cc9185cd4c7c278bedf7065ea6f459d63" as `0x${string}`;
export const BOSS_DEPLOY_TX = "0x0ec62e8ab7d86cb5da973fa844f283fe32508d80c7b3bbb6eab471bedb328106";
export const BOSS_DEPLOY_BLOCK = 34636631n;
export const BOSS_ABI = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "guilds_",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "hearth_",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "legacyBoss_",
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
        "internalType": "uint256",
        "name": "week",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "lastHitter",
        "type": "address"
      }
    ],
    "name": "Slain",
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
        "name": "week",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint128",
        "name": "dmg",
        "type": "uint128"
      },
      {
        "indexed": false,
        "internalType": "uint128",
        "name": "remaining",
        "type": "uint128"
      }
    ],
    "name": "Struck",
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
        "name": "week",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint32",
        "name": "trophies",
        "type": "uint32"
      }
    ],
    "name": "Trophy",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "BASE_HP",
    "outputs": [
      {
        "internalType": "uint128",
        "name": "",
        "type": "uint128"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "COOLDOWN",
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
    "name": "EPOCH",
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
    "name": "claimTrophy",
    "outputs": [],
    "stateMutability": "nonpayable",
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
    "name": "contribOf",
    "outputs": [
      {
        "internalType": "uint128",
        "name": "",
        "type": "uint128"
      }
    ],
    "stateMutability": "view",
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
    "name": "dealtOf",
    "outputs": [
      {
        "internalType": "uint128",
        "name": "",
        "type": "uint128"
      }
    ],
    "stateMutability": "view",
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
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "guildContribOf",
    "outputs": [
      {
        "internalType": "uint128",
        "name": "",
        "type": "uint128"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "guilds",
    "outputs": [
      {
        "internalType": "contract IBossGuilds",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "hearth",
    "outputs": [
      {
        "internalType": "contract IBossHearth",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "legacyBoss",
    "outputs": [
      {
        "internalType": "contract ILegacyBoss",
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
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "slainOf",
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
        "internalType": "uint128",
        "name": "remaining",
        "type": "uint128"
      },
      {
        "internalType": "bool",
        "name": "slain",
        "type": "bool"
      },
      {
        "internalType": "uint128",
        "name": "myContrib",
        "type": "uint128"
      },
      {
        "internalType": "uint64",
        "name": "nextStrikeAt",
        "type": "uint64"
      },
      {
        "internalType": "bool",
        "name": "prevClaimable",
        "type": "bool"
      },
      {
        "internalType": "uint32",
        "name": "trophies",
        "type": "uint32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "strike",
    "outputs": [
      {
        "internalType": "uint128",
        "name": "dmg",
        "type": "uint128"
      }
    ],
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
    "name": "trophiesOf",
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
    "name": "week",
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
