// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IGiwaMarket {
    function buy(address payable seller, string calldata itemId)
        external
        payable
        returns (uint256 purchaseId);

    function confirm(uint256 purchaseId) external;

    function tokenIdOf(address seller, string memory itemId) external pure returns (uint256);

    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 value,
        bytes calldata data
    ) external;
}

/// 기와장터 흥정(오퍼) — 구매자가 부르는 값을 에스크로로 걸고, 판매자가
/// 수락하면 그 자리에서 체결된다. 기존 GiwaMarketV3를 조합해 동작:
/// 수락 시 market.buy(제안가) → confirm(즉시 정산) → 쿠폰을 구매자에게 전달.
/// 흥정 성사는 양측 합의이므로 24시간 에스크로 없이 즉시 체결된다.
contract GiwaOffers {
    IGiwaMarket public immutable market;

    struct Offer {
        address buyer;
        address payable seller;
        uint128 amount;
        bool active;
        string itemName;
    }

    Offer[] private _offers;

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
        market = IGiwaMarket(market_);
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
        _offers.push(Offer(msg.sender, seller, uint128(msg.value), true, itemName));
        emit OfferMade(id, seller, msg.sender, itemName, msg.value);
    }

    /// 구매자 취소 — 걸어둔 금액을 돌려받는다
    function cancelOffer(uint256 id) external {
        Offer storage o = _offers[id];
        require(o.active && msg.sender == o.buyer, "buyer");
        o.active = false;
        (bool ok, ) = payable(o.buyer).call{value: o.amount}("");
        require(ok, "refund");
        emit OfferCancelled(id);
    }

    /// 판매자 수락 — 제안가로 즉시 체결 (구매 영수증 + 쿠폰 민팅 + 정산)
    function acceptOffer(uint256 id) external {
        Offer storage o = _offers[id];
        require(o.active && msg.sender == o.seller, "seller");
        o.active = false;
        uint256 pid = market.buy{value: o.amount}(o.seller, o.itemName);
        market.confirm(pid); // 흥정 성사 = 합의 → 즉시 정산
        market.safeTransferFrom(
            address(this),
            o.buyer,
            market.tokenIdOf(o.seller, o.itemName),
            1,
            ""
        );
        emit OfferAccepted(id, pid);
    }

    function offerAt(uint256 id) external view returns (Offer memory) {
        return _offers[id];
    }

    function offerCount() external view returns (uint256) {
        return _offers.length;
    }

    /// 판매자에게 걸린 활성 오퍼 목록
    function offersFor(address seller)
        external
        view
        returns (uint256[] memory ids, Offer[] memory list)
    {
        uint256 n;
        for (uint256 i; i < _offers.length; i++) {
            if (_offers[i].active && _offers[i].seller == seller) n++;
        }
        ids = new uint256[](n);
        list = new Offer[](n);
        uint256 j;
        for (uint256 i; i < _offers.length; i++) {
            if (_offers[i].active && _offers[i].seller == seller) {
                ids[j] = i;
                list[j] = _offers[i];
                j++;
            }
        }
    }

    /// 쿠폰(ERC-1155) 수취용
    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes calldata
    ) external pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }
}
