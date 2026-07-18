// 자동 생성 파일 — scripts/deploy-village.mjs 가 기록한다. 직접 수정 금지.
export const GUILDS_ADDRESS = "0x65e4de091071d2f0d47b24f1ada5c2c7ba2c7638" as `0x${string}`;
export const GUILDS_DEPLOY_TX = "0x8b47aa102e8bf20f37b89f9c6e43b56902187063f1b493a5c84f12a3c1795b46";
export const GUILDS_DEPLOY_BLOCK = 31040873n;
export const GUILDS_ABI = [
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "guildId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "member",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint32",
        "name": "attempt",
        "type": "uint32"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "epoch",
        "type": "uint256"
      }
    ],
    "name": "ExpeditionStarted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "guildId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "name",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "emblem",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "founder",
        "type": "address"
      }
    ],
    "name": "GuildCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "guildId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "member",
        "type": "address"
      }
    ],
    "name": "GuildJoined",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "guildId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "member",
        "type": "address"
      }
    ],
    "name": "GuildLeft",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "guildId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "member",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint32",
        "name": "attempt",
        "type": "uint32"
      },
      {
        "indexed": false,
        "internalType": "uint16",
        "name": "climbed",
        "type": "uint16"
      },
      {
        "indexed": false,
        "internalType": "uint16",
        "name": "floor",
        "type": "uint16"
      }
    ],
    "name": "RunSettled",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "epoch",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "blockNumber",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "seed",
        "type": "bytes32"
      }
    ],
    "name": "SeedPinned",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "EPOCH_SECONDS",
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
    "name": "MAX_FLOOR",
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
    "name": "MAX_MEMBERS",
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
    "name": "MAX_PICKS",
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
    "name": "allGuilds",
    "outputs": [
      {
        "components": [
          {
            "internalType": "string",
            "name": "name",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "emblem",
            "type": "string"
          },
          {
            "internalType": "address",
            "name": "founder",
            "type": "address"
          },
          {
            "internalType": "uint64",
            "name": "createdAt",
            "type": "uint64"
          },
          {
            "internalType": "address[]",
            "name": "members",
            "type": "address[]"
          },
          {
            "components": [
              {
                "internalType": "uint32",
                "name": "epoch",
                "type": "uint32"
              },
              {
                "internalType": "uint16",
                "name": "floor",
                "type": "uint16"
              },
              {
                "internalType": "uint16",
                "name": "best",
                "type": "uint16"
              },
              {
                "internalType": "uint32",
                "name": "runs",
                "type": "uint32"
              },
              {
                "internalType": "uint32",
                "name": "attempts",
                "type": "uint32"
              }
            ],
            "internalType": "struct GiwaGuilds.DungeonState",
            "name": "d",
            "type": "tuple"
          }
        ],
        "internalType": "struct GiwaGuilds.Guild[]",
        "name": "out",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "name",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "emblem",
        "type": "string"
      }
    ],
    "name": "createGuild",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "currentEpoch",
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
        "internalType": "bytes32",
        "name": "seed",
        "type": "bytes32"
      },
      {
        "internalType": "uint256",
        "name": "guildId",
        "type": "uint256"
      },
      {
        "internalType": "uint32",
        "name": "attempt",
        "type": "uint32"
      },
      {
        "internalType": "uint256",
        "name": "step",
        "type": "uint256"
      },
      {
        "internalType": "uint8",
        "name": "door",
        "type": "uint8"
      }
    ],
    "name": "doorRoll",
    "outputs": [
      {
        "internalType": "uint8",
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "enterExpedition",
    "outputs": [
      {
        "internalType": "uint32",
        "name": "attempt",
        "type": "uint32"
      },
      {
        "internalType": "bytes32",
        "name": "seed",
        "type": "bytes32"
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
    "name": "epochSeed",
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
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "epochSeedBlock",
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
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "guildAt",
    "outputs": [
      {
        "components": [
          {
            "internalType": "string",
            "name": "name",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "emblem",
            "type": "string"
          },
          {
            "internalType": "address",
            "name": "founder",
            "type": "address"
          },
          {
            "internalType": "uint64",
            "name": "createdAt",
            "type": "uint64"
          },
          {
            "internalType": "address[]",
            "name": "members",
            "type": "address[]"
          },
          {
            "components": [
              {
                "internalType": "uint32",
                "name": "epoch",
                "type": "uint32"
              },
              {
                "internalType": "uint16",
                "name": "floor",
                "type": "uint16"
              },
              {
                "internalType": "uint16",
                "name": "best",
                "type": "uint16"
              },
              {
                "internalType": "uint32",
                "name": "runs",
                "type": "uint32"
              },
              {
                "internalType": "uint32",
                "name": "attempts",
                "type": "uint32"
              }
            ],
            "internalType": "struct GiwaGuilds.DungeonState",
            "name": "d",
            "type": "tuple"
          }
        ],
        "internalType": "struct GiwaGuilds.Guild",
        "name": "g",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "guildCount",
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
        "name": "member",
        "type": "address"
      }
    ],
    "name": "guildOf",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "idPlus1",
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
    "name": "joinGuild",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "leaveGuild",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint32",
        "name": "attempt",
        "type": "uint32"
      },
      {
        "internalType": "uint8[]",
        "name": "picks",
        "type": "uint8[]"
      }
    ],
    "name": "settleRun",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;
