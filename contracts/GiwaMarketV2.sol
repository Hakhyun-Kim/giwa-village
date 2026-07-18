// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC1155Receiver {
    function onERC1155Received(
        address operator,
        address from,
        uint256 id,
        uint256 value,
        bytes calldata data
    ) external returns (bytes4);
}

/// 기와장터 노점 컨트랙트 v2
/// - 에스크로: 구매 대금은 컨트랙트가 보관. 구매자 확정(confirm) 또는
///   24시간 경과 후(release) 판매자에게 정산된다.
/// - ERC-1155: 구매 즉시 쿠폰 토큰이 구매자 지갑으로 민팅된다 (온체인 소유).
/// - v1의 리스팅/가격 강제/영수증 이벤트는 그대로 유지.
contract GiwaMarketV2 {
    // ---------- ERC-1155 (최소 구현) ----------
    event TransferSingle(
        address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value
    );
    event TransferBatch(
        address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values
    );
    event ApprovalForAll(address indexed account, address indexed operator, bool approved);

    mapping(uint256 => mapping(address => uint256)) private _balances;
    mapping(address => mapping(address => bool)) private _operatorApprovals;

    function uri(uint256) public pure returns (string memory) {
        return "https://hakhyun-kim.github.io/giwa-village/coupon/{id}.json";
    }

    function balanceOf(address account, uint256 id) public view returns (uint256) {
        return _balances[id][account];
    }

    function balanceOfBatch(
        address[] calldata accounts,
        uint256[] calldata ids
    ) external view returns (uint256[] memory out) {
        require(accounts.length == ids.length, "len");
        out = new uint256[](accounts.length);
        for (uint256 i; i < accounts.length; i++) {
            out[i] = _balances[ids[i]][accounts[i]];
        }
    }

    function setApprovalForAll(address operator, bool approved) external {
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function isApprovedForAll(address account, address operator) public view returns (bool) {
        return _operatorApprovals[account][operator];
    }

    function safeTransferFrom(
        address from, address to, uint256 id, uint256 value, bytes calldata data
    ) external {
        require(from == msg.sender || _operatorApprovals[from][msg.sender], "auth");
        require(to != address(0), "to0");
        uint256 b = _balances[id][from];
        require(b >= value, "bal");
        unchecked {
            _balances[id][from] = b - value;
        }
        _balances[id][to] += value;
        emit TransferSingle(msg.sender, from, to, id, value);
        _checkReceiver(from, to, id, value, data);
    }

    function safeBatchTransferFrom(
        address from, address to, uint256[] calldata ids, uint256[] calldata values, bytes calldata data
    ) external {
        require(from == msg.sender || _operatorApprovals[from][msg.sender], "auth");
        require(to != address(0), "to0");
        require(ids.length == values.length, "len");
        for (uint256 i; i < ids.length; i++) {
            uint256 b = _balances[ids[i]][from];
            require(b >= values[i], "bal");
            unchecked {
                _balances[ids[i]][from] = b - values[i];
            }
            _balances[ids[i]][to] += values[i];
        }
        emit TransferBatch(msg.sender, from, to, ids, values);
        data; // 배치 수신자 콜백은 v2 범위 외 (EOA 간 전송 가정)
    }

    function supportsInterface(bytes4 iid) external pure returns (bool) {
        return iid == 0xd9b67a26 || iid == 0x0e89341c || iid == 0x01ffc9a7;
    }

    function _mint(address to, uint256 id, uint256 value) internal {
        _balances[id][to] += value;
        emit TransferSingle(msg.sender, address(0), to, id, value);
        _checkReceiver(address(0), to, id, value, "");
    }

    function _checkReceiver(
        address from, address to, uint256 id, uint256 value, bytes memory data
    ) private {
        if (to.code.length > 0) {
            try IERC1155Receiver(to).onERC1155Received(msg.sender, from, id, value, data)
            returns (bytes4 r) {
                require(r == IERC1155Receiver.onERC1155Received.selector, "rcv");
            } catch {
                revert("rcv");
            }
        }
    }

    // ---------- 리스팅 (v1 동일) ----------
    struct Listing {
        uint128 price;
        bool active;
    }

    mapping(address => mapping(bytes32 => Listing)) private _listings;

    event Listed(address indexed seller, string itemId, uint256 price);
    event Unlisted(address indexed seller, string itemId);

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

    // ---------- 에스크로 구매 ----------
    struct Purchase {
        address buyer;
        address payable seller;
        uint128 amount;
        uint64 releaseAt;
        bool settled;
    }

    Purchase[] private _purchases;

    uint64 public constant AUTO_RELEASE_AFTER = 24 hours;

    event Purchased(
        address indexed buyer,
        address indexed seller,
        string itemId,
        uint256 amount,
        uint256 indexed purchaseId,
        uint256 tokenId
    );
    event Settled(uint256 indexed purchaseId, address indexed seller, uint256 amount);

    function tokenIdOf(address seller, string calldata itemId) public pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(seller, itemId)));
    }

    function buy(
        address payable seller,
        string calldata itemId
    ) external payable returns (uint256 purchaseId) {
        if (seller == address(0)) revert ZeroSeller();
        if (msg.value == 0 || msg.value > type(uint128).max) revert ZeroValue();
        Listing memory l = _listings[seller][keccak256(bytes(itemId))];
        if (l.active && msg.value != l.price) revert WrongPrice(l.price, msg.value);

        purchaseId = _purchases.length;
        _purchases.push(
            Purchase(
                msg.sender,
                seller,
                uint128(msg.value),
                uint64(block.timestamp) + AUTO_RELEASE_AFTER,
                false
            )
        );
        uint256 tid = tokenIdOf(seller, itemId);
        _mint(msg.sender, tid, 1);
        emit Purchased(msg.sender, seller, itemId, msg.value, purchaseId, tid);
    }

    /// 구매자 확정 → 즉시 정산
    function confirm(uint256 purchaseId) external {
        Purchase storage p = _purchases[purchaseId];
        require(msg.sender == p.buyer, "buyer");
        _settle(purchaseId, p);
    }

    /// 24시간 경과 후에는 누구나 정산 실행 가능 (판매자 보호)
    function release(uint256 purchaseId) external {
        Purchase storage p = _purchases[purchaseId];
        require(block.timestamp >= p.releaseAt, "early");
        _settle(purchaseId, p);
    }

    function _settle(uint256 id, Purchase storage p) private {
        require(!p.settled, "settled");
        p.settled = true;
        (bool ok, ) = p.seller.call{value: p.amount}("");
        if (!ok) revert TransferFailed();
        emit Settled(id, p.seller, p.amount);
    }

    function purchaseOf(
        uint256 id
    )
        external
        view
        returns (address buyer, address seller, uint256 amount, uint64 releaseAt, bool settled)
    {
        Purchase memory p = _purchases[id];
        return (p.buyer, p.seller, p.amount, p.releaseAt, p.settled);
    }

    function purchaseCount() external view returns (uint256) {
        return _purchases.length;
    }
}
