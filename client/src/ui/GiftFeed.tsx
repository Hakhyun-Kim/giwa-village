import { useStore } from "../state/store";
import { giwaSepolia } from "../config/giwa";

export default function GiftFeed() {
  const feed = useStore((s) => s.feed);
  if (feed.length === 0) return null;
  const explorer = giwaSepolia.blockExplorers.default.url;

  return (
    <div className="gift-feed">
      {feed.map((g) => (
        <a
          key={g.tx}
          className="gift-feed-item"
          href={`${explorer}/tx/${g.tx}`}
          target="_blank"
          rel="noreferrer"
          title="트랜잭션 보기"
        >
          {g.kind === "sale" ? (
            <>
              {g.itemEmoji ?? "🛍️"} <b>{g.fromName}</b>이(가) <b>{g.toName}</b>
              에서 {g.itemName} 구매
              <span className="amt">{g.amountEth} ETH</span>
            </>
          ) : (
            <>
              🎁 <b>{g.fromName}</b> → <b>{g.toName}</b>
              <span className="amt">{g.amountEth} ETH</span>
            </>
          )}
        </a>
      ))}
    </div>
  );
}
