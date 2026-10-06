// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IGiwaMarketV4 {
    function purchaseFor(address buyer, address payable seller, string calldata itemId)
        external
        payable
        returns (uint256 purchaseId);
}

/// 기와장터 흥정 v2 — 구매자가 값을 부르고(에스크로), 판매자가 받아들이면 GiwaMarketV4 의
/// 일반 구매가 된다. v1 과 달리 즉시 정산하지 않는다: 수락한 흥정도 24시간 에스크로 · 분쟁 · 환불을
/// 그대로 탄다. 리스팅 값보다 낮은 제안도 받을 수 있고, 제안은 7일 뒤 만료된다(만료되면 누구나
/// 무를 수 있고, 돈은 언제나 구매자에게 돌아간다). 쿠폰을 직접 다루지 않으므로 받는 코드도 없다.
contract GiwaOffersV2 {
    IGiwaMarketV4 public immutable market;

    struct Offer {
        address buyer;
        address payable seller;
        uint128 amount;
        uint64 expiresAt;
        bool active;
        string itemName;
    }

    Offer[] private _offers;
    mapping(address => uint256[]) private _activeOf; // 판매자별 활성 흥정 — 닫히면 swap-and-pop
    mapping(uint256 => uint256) private _activeIndex; // 흥정 id → 자리 + 1

    uint64 public constant OFFER_TTL = 7 days;

    event OfferMade(
        uint256 indexed id,
        address indexed seller,
        address indexed buyer,
        string itemName,
        uint256 amount
    );
    event OfferCancelled(uint256 indexed id);
    event OfferAccepted(uint256 indexed id, uint256 purchaseId);

    constructor(address market_) {
        market = IGiwaMarketV4(market_);
    }

    function makeOffer(address payable seller, string calldata itemName)
        external
        payable
        returns (uint256 id)
    {
        require(seller != address(0) && seller != msg.sender, "seller");
        require(msg.value > 0 && msg.value <= type(uint128).max, "value");
        require(bytes(itemName).length >= 1 && bytes(itemName).length <= 48, "name");
        id = _offers.length;
        _offers.push(
            Offer(msg.sender, seller, uint128(msg.value), uint64(block.timestamp) + OFFER_TTL, true, itemName)
        );
        _activeOf[seller].push(id);
        _activeIndex[id] = _activeOf[seller].length;
        emit OfferMade(id, seller, msg.sender, itemName, msg.value);
    }

    /// 구매자는 언제든, 만료된 흥정은 누구나 무른다 — 걸어 둔 돈은 구매자에게 돌아간다
    function cancelOffer(uint256 id) external {
        Offer storage o = _offers[id];
        require(o.active, "inactive");
        require(msg.sender == o.buyer || block.timestamp > o.expiresAt, "buyer");
        _close(id, o);
        (bool ok, ) = payable(o.buyer).call{value: o.amount}("");
        require(ok, "refund");
        emit OfferCancelled(id);
    }

    /// 판매자 수락 — 제안가로 장터의 에스크로 구매가 된다(쿠폰은 정산 때 구매자에게)
    function acceptOffer(uint256 id) external returns (uint256 purchaseId) {
        Offer storage o = _offers[id];
        require(o.active && msg.sender == o.seller, "seller");
        require(block.timestamp <= o.expiresAt, "expired");
        _close(id, o);
        purchaseId = market.purchaseFor{value: o.amount}(o.buyer, o.seller, o.itemName);
        emit OfferAccepted(id, purchaseId);
    }

    function _close(uint256 id, Offer storage o) private {
        o.active = false;
        uint256[] storage ids = _activeOf[o.seller];
        uint256 pos = _activeIndex[id] - 1;
        uint256 last = ids[ids.length - 1];
        ids[pos] = last;
        _activeIndex[last] = pos + 1;
        ids.pop();
        delete _activeIndex[id];
    }

    function offerAt(uint256 id) external view returns (Offer memory) {
        return _offers[id];
    }

    function offerCount() external view returns (uint256) {
        return _offers.length;
    }

    /// 판매자에게 걸린 활성 흥정을 offset 부터 limit 개 (만료돼도 무르기 전까지는 들어 있다 — expiresAt 으로 가린다)
    function offersFor(address seller, uint256 offset, uint256 limit)
        external
        view
        returns (uint256[] memory ids, Offer[] memory offers, uint256 total)
    {
        uint256[] storage all = _activeOf[seller];
        total = all.length;
        uint256 n = offset >= total ? 0 : total - offset;
        if (n > limit) n = limit;
        ids = new uint256[](n);
        offers = new Offer[](n);
        for (uint256 i; i < n; i++) {
            ids[i] = all[offset + i];
            offers[i] = _offers[ids[i]];
        }
    }
}
