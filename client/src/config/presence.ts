// 자동 생성 파일 — scripts/deploy-village.mjs 가 기록한다. 직접 수정 금지.
export const PRESENCE_ADDRESS = "0x4d600672cefae3c8462f3d9feb2cb739001e7a93" as `0x${string}`;
export const PRESENCE_DEPLOY_TX = "0xc6a66097483836fe562550e74e01d71fc025086a190708e90fa7f23323280483";
export const PRESENCE_DEPLOY_BLOCK = 31034320n;
export const PRESENCE_ABI = [
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
        "internalType": "int32",
        "name": "x100",
        "type": "int32"
      },
      {
        "indexed": false,
        "internalType": "int32",
        "name": "z100",
        "type": "int32"
      },
      {
        "indexed": false,
        "internalType": "int16",
        "name": "vx100",
        "type": "int16"
      },
      {
        "indexed": false,
        "internalType": "int16",
        "name": "vz100",
        "type": "int16"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "emote",
        "type": "uint8"
      }
    ],
    "name": "Beacon",
    "type": "event"
  },
  {
    "inputs": [
      {
        "internalType": "int32",
        "name": "x100",
        "type": "int32"
      },
      {
        "internalType": "int32",
        "name": "z100",
        "type": "int32"
      },
      {
        "internalType": "int16",
        "name": "vx100",
        "type": "int16"
      },
      {
        "internalType": "int16",
        "name": "vz100",
        "type": "int16"
      },
      {
        "internalType": "uint8",
        "name": "emote",
        "type": "uint8"
      }
    ],
    "name": "beacon",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;
