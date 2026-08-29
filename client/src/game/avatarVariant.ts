export interface AvatarVariant {
  hat: 0 | 1 | 2 | 3;
  headScale: number;
  bodyWidth: number;
}

export function variantFrom(seed: string): AvatarVariant {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 33 + seed.charCodeAt(i)) >>> 0;
  }
  return {
    hat: (hash % 4) as AvatarVariant["hat"],
    headScale: 0.9 + ((hash >> 3) % 25) / 100,
    bodyWidth: 0.85 + ((hash >> 8) % 30) / 100,
  };
}
