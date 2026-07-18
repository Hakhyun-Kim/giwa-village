// 데모 모드 정적 데이터 — 테스트넷 마을 스냅샷 (공개 주소만 포함).
// 노점 주소는 실제 GIWA Sepolia 지갑이라 데모에서도 진짜 온체인 구매가 동작한다.
import type { Stall } from "../types";

export const DEMO_STALLS: Stall[] = [
  {
    id: "brand-pizza",
    ownerAddress: "0xEF2cfE6939AcF538339ab5d3343E28fE3e643C61",
    ownerName: "화덕피자공방",
    title: "화덕피자공방",
    tag: "만원 할인",
    x: 16,
    z: -5,
    items: [
      { id: "brand-pizza-0", name: "만원 할인쿠폰", emoji: "🍕", priceEth: "0.002" },
      { id: "brand-pizza-1", name: "조각피자 교환권", emoji: "🍕", priceEth: "0.001" },
    ],
    brand: true,
    theme: "pizza",
    createdAt: 1784315132039,
  },
  {
    id: "brand-cvs",
    ownerAddress: "0xEF2cfE6939AcF538339ab5d3343E28fE3e643C61",
    ownerName: "달빛편의점",
    title: "달빛편의점",
    tag: "24시간 영업",
    x: 21,
    z: 5,
    items: [
      { id: "brand-cvs-0", name: "삼각김밥 교환권", emoji: "🍙", priceEth: "0.0005" },
      { id: "brand-cvs-1", name: "아이스크림 교환권", emoji: "🍦", priceEth: "0.0005" },
    ],
    brand: true,
    theme: "cvs",
    createdAt: 1784315132039,
  },
  {
    id: "brand-burger",
    ownerAddress: "0xEF2cfE6939AcF538339ab5d3343E28fE3e643C61",
    ownerName: "번개버거",
    title: "번개버거",
    tag: "30분 배달",
    x: 27,
    z: -5,
    items: [
      { id: "brand-burger-0", name: "버거세트 배달쿠폰", emoji: "🍔", priceEth: "0.001" },
    ],
    brand: true,
    theme: "burger",
    createdAt: 1784315132039,
  },
  {
    id: "s-d3371dcd",
    ownerAddress: "0xd3371DcdF259B196367e0DAa4B6770834913557b",
    ownerName: "보부상 두칠",
    title: "싸다싸 목도리",
    x: 11.1,
    z: 3.5,
    items: [{ id: "s-d3371dcd-0", name: "목도리", emoji: "🧣", priceEth: "0.0008" }],
    createdAt: 1784315566199,
  },
  {
    id: "s-d3a73104",
    ownerAddress: "0xd3A7310471c3713291fF8AEc006B3BDE1037a623",
    ownerName: "주모 향단",
    title: "달래네 꼬치",
    x: 13.5,
    z: -3.9,
    items: [
      { id: "s-d3a73104-0", name: "꼬치", emoji: "🍡", priceEth: "0.0005" },
      { id: "s-d3a73104-1", name: "랜덤박스", emoji: "🎁", priceEth: "0.002" },
    ],
    createdAt: 1784315567367,
  },
  {
    id: "s-deaa766e",
    ownerAddress: "0xdEAA766E462e7959670a72461df4D7BC9FCbD408",
    ownerName: "떡장수 순이",
    title: "곰배 엿가락",
    x: 23.3,
    z: 4.9,
    items: [{ id: "s-deaa766e-0", name: "엿가락", emoji: "🍬", priceEth: "0.0004" }],
    createdAt: 1784315577598,
  },
  {
    id: "s-74ff8183",
    ownerAddress: "0x74Ff8183A7D88F3A653Dd339f41D50a79dADa8aE",
    ownerName: "방물장수 오씨",
    title: "오씨 방물잡화",
    x: 30.2,
    z: 3.1,
    items: [
      { id: "s-74ff8183-0", name: "홍등", emoji: "🏮", priceEth: "0.001" },
      { id: "s-74ff8183-1", name: "목검", emoji: "🗡️", priceEth: "0.003" },
    ],
    createdAt: 1784315578004,
  },
];

export interface DemoNpc {
  name: string;
  address: string;
  home: [number, number];
}

export const DEMO_NPCS: DemoNpc[] = [
  { name: "보부상 두칠", address: "0xd3371DcdF259B196367e0DAa4B6770834913557b", home: [11.1, 4.5] },
  { name: "주모 향단", address: "0xd3A7310471c3713291fF8AEc006B3BDE1037a623", home: [13.5, -2.9] },
  { name: "떡장수 순이", address: "0xdEAA766E462e7959670a72461df4D7BC9FCbD408", home: [23.3, 5.9] },
  { name: "방물장수 오씨", address: "0x74Ff8183A7D88F3A653Dd339f41D50a79dADa8aE", home: [30.2, 4.1] },
  { name: "나그네 바람", address: "0xbe35Ff65F89EE3a22ceCF6c391F436F877c31d4f", home: [0, -8] },
  { name: "길손 새벽", address: "0xd6fDE8B7D6de3D3297154F26A6811Cf24A7d2024", home: [-6, 6] },
];
