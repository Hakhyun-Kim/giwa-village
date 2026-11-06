// 공방(UGC): 8x8 픽셀 문양의 온체인 등록·판매·착용 (GiwaWorkshop)
// 창작물 거래 — 대금은 창작자에게 직접, 문양 데이터는 전부 온체인.
import { formatEther, parseEther } from "viem";
import { publicClient, activeWalletClient, queueTx } from "../wallet/wallet";
import { WORKSHOP_ADDRESS, WORKSHOP_ABI } from "../config/workshop";

export { PRESET16, encodePixels, decodePixels, paletteSlot, encodePalette } from "./pattern";
import { decodePixels, encodePalette, encodePixels, paletteSlot, wornFrom } from "./pattern";

export interface WorkshopDesign {
  id: number;
  creator: string;
  name: string;
  priceEth: string;
  mints: number;
  pixels: string; // 0x + 32 hex
  palette: number;
  /** 체인에 오른 시각(초) — 컨트랙트가 문양과 함께 적어 둔 값 */
  createdAt?: number;
}

/** 문양 → 캔버스 (아바타 텍스처·미리보기 공용) */
export function patternCanvas(pixelsHex: string, palette: number, scale = 8): HTMLCanvasElement {
  const cells = decodePixels(pixelsHex);
  const canvas = document.createElement("canvas");
  canvas.width = 8 * scale;
  canvas.height = 8 * scale;
  const ctx = canvas.getContext("2d")!;
  for (let i = 0; i < 64; i++) {
    const color = paletteSlot(palette, cells[i]);
    if (color === "#00000000") continue;
    ctx.fillStyle = color;
    ctx.fillRect((i % 8) * scale, Math.floor(i / 8) * scale, scale, scale);
  }
  return canvas;
}

interface ChainDesign {
  creator: `0x${string}`;
  createdAt: bigint;
  mints: number;
  price: bigint;
  palette: number;
  pixels: `0x${string}`;
  name: string;
}

export async function fetchDesigns(limit = 24): Promise<WorkshopDesign[]> {
  const [ids, list] = (await publicClient.readContract({
    address: WORKSHOP_ADDRESS,
    abi: WORKSHOP_ABI,
    functionName: "designsPage",
    args: [0n, BigInt(limit)],
  })) as [readonly bigint[], readonly ChainDesign[]];
  return ids.map((id, i) => ({
    id: Number(id),
    creator: list[i].creator,
    name: list[i].name,
    priceEth: formatEther(list[i].price),
    mints: list[i].mints,
    pixels: list[i].pixels,
    palette: list[i].palette,
    createdAt: Number(list[i].createdAt),
  }));
}

/** 번호 하나로 문양 하나 — 링크로 들어온 문양이 최근 목록 밖이어도 보이게. 없거나 못 읽으면 null */
export async function fetchDesign(id: number): Promise<WorkshopDesign | null> {
  try {
    const d = (await publicClient.readContract({
      address: WORKSHOP_ADDRESS,
      abi: WORKSHOP_ABI,
      functionName: "designAt",
      args: [BigInt(id)],
    })) as ChainDesign;
    return {
      id,
      creator: d.creator,
      name: d.name,
      priceEth: formatEther(d.price),
      mints: d.mints,
      pixels: d.pixels,
      palette: d.palette,
      createdAt: Number(d.createdAt),
    };
  } catch {
    return null;
  }
}

export async function ownedDesign(who: string, id: number): Promise<boolean> {
  return (await publicClient.readContract({
    address: WORKSHOP_ADDRESS,
    abi: WORKSHOP_ABI,
    functionName: "ownedOf",
    args: [who as `0x${string}`, BigInt(id)],
  })) as boolean;
}

/** 착용 중 문양 — "pixelsHex:palette" 문자열 (없으면 null) */
export async function wornPatternOf(addr: string): Promise<{ code: string; id: number | null } | null> {
  const [exists, id, pixels, palette] = (await publicClient.readContract({
    address: WORKSHOP_ADDRESS,
    abi: WORKSHOP_ABI,
    functionName: "wornOf",
    args: [addr as `0x${string}`],
  })) as [boolean, bigint, `0x${string}`, number];
  return wornFrom(exists, id, pixels, palette);
}

export async function registerDesign(
  name: string,
  cells: number[],
  paletteSlots: number[],
  priceEth: string,
): Promise<void> {
  const wc = activeWalletClient;
  if (!wc?.account) throw new Error("지갑이 없습니다.");
  const tx = await queueTx(() =>
    wc.writeContract({
      account: wc.account!,
      chain: wc.chain,
      address: WORKSHOP_ADDRESS,
      abi: WORKSHOP_ABI,
      functionName: "register",
      args: [
        name,
        encodePixels(cells),
        encodePalette(paletteSlots),
        priceEth ? parseEther(priceEth) : 0n,
      ],
    }),
  );
  await publicClient.waitForTransactionReceipt({ hash: tx });
}

export async function buyDesignOnChain(id: number, priceEth: string): Promise<void> {
  const wc = activeWalletClient;
  if (!wc?.account) throw new Error("지갑이 없습니다.");
  const tx = await queueTx(() =>
    wc.writeContract({
      account: wc.account!,
      chain: wc.chain,
      address: WORKSHOP_ADDRESS,
      abi: WORKSHOP_ABI,
      functionName: "buyDesign",
      args: [BigInt(id)],
      value: parseEther(priceEth || "0"),
    }),
  );
  await publicClient.waitForTransactionReceipt({ hash: tx });
}

export async function wearDesign(idPlus1: number): Promise<void> {
  const wc = activeWalletClient;
  if (!wc?.account) throw new Error("지갑이 없습니다.");
  const tx = await queueTx(() =>
    wc.writeContract({
      account: wc.account!,
      chain: wc.chain,
      address: WORKSHOP_ADDRESS,
      abi: WORKSHOP_ABI,
      functionName: "wear",
      args: [BigInt(idPlus1)],
    }),
  );
  await publicClient.waitForTransactionReceipt({ hash: tx });
}
