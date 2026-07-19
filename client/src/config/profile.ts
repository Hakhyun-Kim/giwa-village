// 자동 생성 파일 — scripts/deploy-village.mjs 가 기록한다. 직접 수정 금지.
export const PROFILE_ADDRESS = "0xefe0e8d69661fd67f5fe2368f9b1f7ff6d395416" as `0x${string}`;
export const PROFILE_DEPLOY_TX = "0x32c0b8949637f92a1b809d71753e08d8c09b9ab8563c081af0a4b97d35e43af3";
export const PROFILE_DEPLOY_BLOCK = 31119697n;
export const PROFILE_ABI = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "guilds_",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "honors_",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "boxes_",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "hearth_",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "workshop_",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "boss_",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "boss",
    "outputs": [
      {
        "internalType": "contract IPBoss",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "boxes",
    "outputs": [
      {
        "internalType": "contract IPBoxes",
        "name": "",
        "type": "address"
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
        "internalType": "contract IPGuilds",
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
        "internalType": "contract IPHearth",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "honors",
    "outputs": [
      {
        "internalType": "contract IPHonors",
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
        "components": [
          {
            "internalType": "uint256",
            "name": "guildIdPlus1",
            "type": "uint256"
          },
          {
            "internalType": "string",
            "name": "guildName",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "guildEmblem",
            "type": "string"
          },
          {
            "internalType": "uint256",
            "name": "honorMask",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "honorEquipped",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "trinketMask",
            "type": "uint256"
          },
          {
            "internalType": "uint8",
            "name": "trinketEquipped",
            "type": "uint8"
          },
          {
            "internalType": "bool",
            "name": "wearing",
            "type": "bool"
          },
          {
            "internalType": "bytes16",
            "name": "wearPixels",
            "type": "bytes16"
          },
          {
            "internalType": "uint16",
            "name": "wearPalette",
            "type": "uint16"
          },
          {
            "internalType": "uint32",
            "name": "warmth",
            "type": "uint32"
          },
          {
            "internalType": "uint32",
            "name": "trophies",
            "type": "uint32"
          }
        ],
        "internalType": "struct GiwaProfile.Profile",
        "name": "p",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "workshop",
    "outputs": [
      {
        "internalType": "contract IPWorkshop",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;
