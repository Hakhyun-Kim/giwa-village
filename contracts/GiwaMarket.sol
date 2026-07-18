// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// 기와장터 노점 컨트랙트 (v1)
/// - 판매자가 아이템을 리스팅하면 구매 가격이 체인에서 강제된다
/// - 모든 구매는 Purchased 이벤트로 온체인 영수증을 남긴다
/// - 리스팅 없는 구매도 허용(영수증만) — 가스 없는 노점(봇 등)용
/// v2 로드맵: 에스크로 보류/분쟁, ERC-1155 상품 전달
contract GiwaMarket {
    struct Listing {
        uint128 price;
        bool active;
    }

    mapping(address => mapping(bytes32 => Listing)) private _listings;

    event Listed(address indexed seller, string itemId, uint256 price);
    event Unlisted(address indexed seller, string itemId);
    event Purchased(
        address indexed buyer,
        address indexed seller,
        string itemId,
        uint256 amount
    );

    error ZeroSeller();
    error ZeroValue();
    error ZeroPrice();
    error WrongPrice(uint256 expected, uint256 sent);
    error TransferFailed();

    function list(string calldata itemId, uint128 price) external {
        if (price == 0) revert ZeroPrice();
        _listings[msg.sender][keccak256(bytes(itemId))] = Listing(price, true);
        emit Listed(msg.sender, itemId, price);
    }

    function unlist(string calldata itemId) external {
        delete _listings[msg.sender][keccak256(bytes(itemId))];
        emit Unlisted(msg.sender, itemId);
    }

    function listingOf(
        address seller,
        string calldata itemId
    ) external view returns (uint256 price, bool active) {
        Listing memory l = _listings[seller][keccak256(bytes(itemId))];
        return (l.price, l.active);
    }

    function buy(address payable seller, string calldata itemId) external payable {
        if (seller == address(0)) revert ZeroSeller();
        if (msg.value == 0) revert ZeroValue();
        Listing memory l = _listings[seller][keccak256(bytes(itemId))];
        if (l.active && msg.value != l.price) revert WrongPrice(l.price, msg.value);
        (bool ok, ) = seller.call{value: msg.value}("");
        if (!ok) revert TransferFailed();
        emit Purchased(msg.sender, seller, itemId, msg.value);
    }
}
