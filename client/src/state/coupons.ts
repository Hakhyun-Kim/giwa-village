import type { Coupon } from "../types";

const key = (address: string) => `giwa-coupons-${address.toLowerCase()}`;

export function loadCoupons(address: string): Coupon[] {
  try {
    return JSON.parse(localStorage.getItem(key(address)) ?? "[]");
  } catch {
    return [];
  }
}

export function addCoupon(address: string, c: Coupon): void {
  const list = loadCoupons(address);
  list.unshift(c);
  localStorage.setItem(key(address), JSON.stringify(list.slice(0, 50)));
}

export function updateCoupon(
  address: string,
  tx: string,
  patch: Partial<Coupon>,
): void {
  const list = loadCoupons(address).map((c) =>
    c.tx === tx ? { ...c, ...patch } : c,
  );
  localStorage.setItem(key(address), JSON.stringify(list));
}
