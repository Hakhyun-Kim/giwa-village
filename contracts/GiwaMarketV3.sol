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

/// 기와장터 노점 컨트랙트 v3
/// - v2(에스크로 + ERC-1155 쿠폰 + 리스팅/가격 강제) 유지
/// - 노점 레지스트리 온체인: 개설(제목·위치·상품 메타) + 리스팅이 단일 tx.
///   서버 없이 클라이언트가 체인에서 노점 목록을 직접 읽는다.
contract GiwaMarketV3 {
    // ---------- ERC-1155 (최소 구현) ----------
    event TransferSingle(
        address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value
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

    // ---------- 리스팅 (v2 호환) ----------
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

    // ---------- 노점 레지스트리 (v3 신규) ----------
    struct StallItem {
        string name;
        string emoji;
        uint128 price;
    }

    struct Stall {
        string title;
        int32 x;
        int32 z;
        uint64 openedAt;
        bool open;
        StallItem[] items;
    }

    mapping(address => Stall) private _stalls;
    address[] private _stallOwners; // 한 번이라도 노점을 연 주소 목록

    event StallOpened(address indexed owner, string title, int32 x, int32 z);
    event StallClosed(address indexed owner);

    /// 노점 개설 — 제목·위치·상품(가격 포함)을 한 번에 기록. 재호출 시 갱신.
    function openStall(
        string calldata title,
        int32 x,
        int32 z,
        StallItem[] calldata items
    ) external {
        require(bytes(title).length >= 1 && bytes(title).length <= 60, "title");
        require(items.length >= 1 && items.length <= 3, "items");
        Stall storage s = _stalls[msg.sender];
        if (s.openedAt == 0) _stallOwners.push(msg.sender);
        s.title = title;
        s.x = x;
        s.z = z;
        s.openedAt = uint64(block.timestamp);
        s.open = true;
        delete s.items;
        for (uint256 i; i < items.length; i++) {
            require(items[i].price > 0, "price");
            require(bytes(items[i].name).length >= 1 && bytes(items[i].name).length <= 48, "name");
            s.items.push(items[i]);
        }
        emit StallOpened(msg.sender, title, x, z);
    }

    function closeStall() external {
        Stall storage s = _stalls[msg.sender];
        require(s.open, "closed");
        s.open = false;
        emit StallClosed(msg.sender);
    }

    function stallOf(address owner) external view returns (Stall memory) {
        return _stalls[owner];
    }

    /// 열려 있는 노점 전체 — 클라이언트가 한 번의 호출로 마을을 그린다
    function openStalls()
        external
        view
        returns (address[] memory owners, Stall[] memory data)
    {
        uint256 n;
        for (uint256 i; i < _stallOwners.length; i++) {
            if (_stalls[_stallOwners[i]].open) n++;
        }
        owners = new address[](n);
        data = new Stall[](n);
        uint256 j;
        for (uint256 i; i < _stallOwners.length; i++) {
            address o = _stallOwners[i];
            if (_stalls[o].open) {
                owners[j] = o;
                data[j] = _stalls[o];
                j++;
            }
        }
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

    function tokenIdOf(address seller, string memory itemId) public pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(seller, itemId)));
    }

    function _pushPurchase(
        address payable seller,
        string memory itemId
    ) private returns (uint256 purchaseId) {
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

    /// v2 호환 자유 구매 (리스팅 있으면 가격 강제)
    function buy(
        address payable seller,
        string calldata itemId
    ) external payable returns (uint256 purchaseId) {
        if (seller == address(0)) revert ZeroSeller();
        if (msg.value == 0 || msg.value > type(uint128).max) revert ZeroValue();
        Listing memory l = _listings[seller][keccak256(bytes(itemId))];
        if (l.active && msg.value != l.price) revert WrongPrice(l.price, msg.value);
        return _pushPurchase(seller, itemId);
    }

    /// 온체인 노점 상품 구매 — 가격은 항상 체인에 기록된 값으로 강제
    function buyStall(
        address payable seller,
        uint8 index
    ) external payable returns (uint256 purchaseId) {
        Stall storage s = _stalls[seller];
        require(s.open && index < s.items.length, "item");
        if (msg.value != s.items[index].price) {
            revert WrongPrice(s.items[index].price, msg.value);
        }
        return _pushPurchase(seller, s.items[index].name);
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
