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

/// 기와장터 노점 컨트랙트 v4 — 노점 · 리스팅 · 에스크로 · 쿠폰. 흥정은 GiwaOffersV2 가 맡는다.
///
/// v3 에서 바뀐 것 (guide/V4.md):
/// - 리스팅 없는 buy() 는 받지 않는다. 값을 정하지 않은 거래는 모두 흥정(GiwaOffersV2)을 지난다.
///   흥정이 이 장터를 부르는 길은 purchaseFor 하나뿐이고, 부를 수 있는 주소는 배포 때 한 번 고정된다
///   (바꾸는 함수 없음). 그래서 리스팅 값보다 낮은 제안도 판매자가 받을 수 있다.
/// - 수락한 흥정도 일반 구매와 같은 에스크로 · 분쟁 경로를 탄다(즉시 정산 없음).
/// - 쿠폰은 정산될 때 구매자에게 발행된다. 환불이면 발행되지 않으므로 "돈도 쿠폰도 가진" 상태가 없다.
/// - 판매자는 기한이 지난 여러 건을 releaseMany 로 한 번에 받는다. 체인에는 타이머가 없다 — 자동 정산은 없다.
/// - uri() 는 온체인 JSON 이다(파일 호스팅 없음). 노점 · 흥정 목록은 페이지로 읽고, 활성 목록은 swap-and-pop 색인이다.
/// 관리자 키는 없다.
contract GiwaMarketV4 {
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

    function _move(address from, address to, uint256 id, uint256 value) private {
        uint256 b = _balances[id][from];
        require(b >= value, "bal");
        unchecked {
            _balances[id][from] = b - value;
        }
        _balances[id][to] += value;
    }

    function safeTransferFrom(
        address from, address to, uint256 id, uint256 value, bytes calldata data
    ) external {
        require(from == msg.sender || _operatorApprovals[from][msg.sender], "auth");
        require(to != address(0), "to0");
        _move(from, to, id, value);
        emit TransferSingle(msg.sender, from, to, id, value);
        _checkReceiver(from, to, id, value, data);
    }

    function safeBatchTransferFrom(
        address from, address to, uint256[] calldata ids, uint256[] calldata values, bytes calldata data
    ) external {
        require(from == msg.sender || _operatorApprovals[from][msg.sender], "auth");
        require(to != address(0), "to0");
        require(ids.length == values.length, "len");
        for (uint256 i; i < ids.length; i++) _move(from, to, ids[i], values[i]);
        emit TransferBatch(msg.sender, from, to, ids, values);
        data; // 배치 수신자 콜백은 범위 외 (EOA 간 전송 가정)
    }

    function supportsInterface(bytes4 iid) external pure returns (bool) {
        return iid == 0xd9b67a26 || iid == 0x0e89341c || iid == 0x01ffc9a7;
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

    /// 흥정 계약 — 배포 스크립트가 다음 nonce 로 계산한 주소를 넣는다(바꾸는 함수 없음)
    address public immutable offers;

    constructor(address offers_) {
        offers = offers_;
    }

    // ---------- 쿠폰 메타데이터 (온체인 JSON) ----------
    struct CouponMeta {
        address seller;
        string itemId;
    }

    mapping(uint256 => CouponMeta) private _coupons;

    function tokenIdOf(address seller, string memory itemId) public pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(seller, itemId)));
    }

    /// 쿠폰의 이름 · 판매자 · 테스트넷 표기를 data: URI 로 돌려준다
    function uri(uint256 id) external view returns (string memory) {
        CouponMeta storage m = _coupons[id];
        require(m.seller != address(0), "id");
        return string.concat(
            "data:application/json;utf8,{\"name\":\"",
            _jsonEscape(m.itemId),
            "\",\"description\":\"GIWA Village coupon (testnet, no monetary value)\",\"seller\":\"",
            _hexAddress(m.seller),
            "\"}"
        );
    }

    function _jsonEscape(string memory s) private pure returns (string memory) {
        bytes memory b = bytes(s);
        bytes memory out = new bytes(b.length * 2);
        uint256 n;
        for (uint256 i; i < b.length; i++) {
            bytes1 c = b[i];
            if (uint8(c) < 0x20) continue; // 제어 문자는 버린다
            if (c == '"' || c == "\\") out[n++] = "\\";
            out[n++] = c;
        }
        assembly {
            mstore(out, n)
        }
        return string(out);
    }

    function _hexAddress(address a) private pure returns (string memory) {
        bytes memory hexChars = "0123456789abcdef";
        bytes memory out = new bytes(42);
        out[0] = "0";
        out[1] = "x";
        uint160 v = uint160(a);
        for (uint256 i; i < 20; i++) {
            uint8 byt = uint8(v >> (8 * (19 - i)));
            out[2 + 2 * i] = hexChars[byt >> 4];
            out[3 + 2 * i] = hexChars[byt & 0x0f];
        }
        return string(out);
    }

    // ---------- 리스팅 ----------
    struct Listing {
        uint128 price;
        bool active;
    }

    mapping(address => mapping(bytes32 => Listing)) private _listings;

    event Listed(address indexed seller, string itemId, uint256 price);
    event Unlisted(address indexed seller, string itemId);

    error NotListed();
    error WrongPrice(uint256 expected, uint256 sent);
    error TransferFailed();

    function list(string calldata itemId, uint128 price) external {
        require(price > 0, "price");
        require(bytes(itemId).length >= 1 && bytes(itemId).length <= 48, "name");
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

    // ---------- 노점 레지스트리 ----------
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
    address[] private _openOwners; // 지금 열린 노점만 — 닫으면 swap-and-pop 으로 뺀다
    mapping(address => uint256) private _openIndex; // 자리 + 1 (0 = 닫힘)

    event StallOpened(address indexed owner, string title, int32 x, int32 z);
    event StallClosed(address indexed owner);

    /// 노점 개설 — 제목 · 위치 · 상품(가격 포함)을 한 번에 기록. 재호출 시 갱신.
    function openStall(
        string calldata title,
        int32 x,
        int32 z,
        StallItem[] calldata items
    ) external {
        require(bytes(title).length >= 1 && bytes(title).length <= 60, "title");
        require(items.length >= 1 && items.length <= 3, "items");
        Stall storage s = _stalls[msg.sender];
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
        if (_openIndex[msg.sender] == 0) {
            _openOwners.push(msg.sender);
            _openIndex[msg.sender] = _openOwners.length;
        }
        emit StallOpened(msg.sender, title, x, z);
    }

    function closeStall() external {
        Stall storage s = _stalls[msg.sender];
        require(s.open, "closed");
        s.open = false;
        _popIndex(_openOwners, _openIndex, msg.sender);
        emit StallClosed(msg.sender);
    }

    function stallOf(address owner) external view returns (Stall memory) {
        return _stalls[owner];
    }

    /// 열린 노점을 offset 부터 limit 개 — 클라이언트가 페이지로 마을을 그린다
    function openStalls(uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory owners, Stall[] memory data, uint256 total)
    {
        total = _openOwners.length;
        uint256 n = _pageLen(total, offset, limit);
        owners = new address[](n);
        data = new Stall[](n);
        for (uint256 i; i < n; i++) {
            owners[i] = _openOwners[offset + i];
            data[i] = _stalls[owners[i]];
        }
    }

    // ---------- 에스크로 구매 ----------
    struct Purchase {
        address buyer;
        address payable seller;
        uint128 amount;
        uint64 releaseAt;
        bool settled;
        bool disputed;
        uint256 tokenId;
    }

    Purchase[] private _purchases;

    uint64 public constant RELEASE_AFTER = 24 hours;
    uint64 public constant DISPUTE_EXTENSION = 7 days;

    event Purchased(
        address indexed buyer,
        address indexed seller,
        string itemId,
        uint256 amount,
        uint256 indexed purchaseId,
        uint256 tokenId
    );
    event Settled(uint256 indexed purchaseId, address indexed seller, uint256 amount);
    event Disputed(uint256 indexed purchaseId, address indexed buyer);
    event Refunded(uint256 indexed purchaseId, address indexed buyer, uint256 amount);

    function _pushPurchase(
        address buyer,
        address payable seller,
        string memory itemId,
        uint256 amount
    ) private returns (uint256 purchaseId) {
        require(seller != address(0) && seller != buyer, "seller");
        uint256 tid = tokenIdOf(seller, itemId);
        if (_coupons[tid].seller == address(0)) _coupons[tid] = CouponMeta(seller, itemId);
        purchaseId = _purchases.length;
        _purchases.push(
            Purchase(
                buyer,
                seller,
                uint128(amount),
                uint64(block.timestamp) + RELEASE_AFTER,
                false,
                false,
                tid
            )
        );
        emit Purchased(buyer, seller, itemId, amount, purchaseId, tid);
    }

    /// 리스팅된 품목만 산다 — 값은 리스팅 값으로 강제. 리스팅이 없으면 흥정(makeOffer)으로.
    function buy(
        address payable seller,
        string calldata itemId
    ) external payable returns (uint256 purchaseId) {
        Listing memory l = _listings[seller][keccak256(bytes(itemId))];
        if (!l.active) revert NotListed();
        if (msg.value != l.price) revert WrongPrice(l.price, msg.value);
        return _pushPurchase(msg.sender, seller, itemId, msg.value);
    }

    /// 흥정이 성사됐을 때 — 흥정 계약만 부른다. 값은 판매자가 받아들인 제안가다
    function purchaseFor(
        address buyer,
        address payable seller,
        string calldata itemId
    ) external payable returns (uint256 purchaseId) {
        require(msg.sender == offers, "offers");
        require(msg.value > 0 && msg.value <= type(uint128).max, "value");
        return _pushPurchase(buyer, seller, itemId, msg.value);
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
        return _pushPurchase(msg.sender, seller, s.items[index].name, msg.value);
    }

    /// 구매자 확정 → 정산(대금은 판매자에게, 쿠폰은 구매자에게)
    function confirm(uint256 purchaseId) external {
        Purchase storage p = _purchases[purchaseId];
        require(msg.sender == p.buyer, "buyer");
        _settle(purchaseId, p);
    }

    /// 기한(24시간 · 분쟁이면 7일)이 지나면 누구나 정산할 수 있다(판매자 보호)
    function release(uint256 purchaseId) external {
        Purchase storage p = _purchases[purchaseId];
        require(block.timestamp >= p.releaseAt, "early");
        _settle(purchaseId, p);
    }

    /// 여러 건을 한 번에 — 기한 전 · 이미 끝난 건은 건너뛴다. 정산한 수를 돌려준다
    function releaseMany(uint256[] calldata ids) external returns (uint256 done) {
        for (uint256 i; i < ids.length; i++) {
            Purchase storage p = _purchases[ids[i]];
            if (p.settled || block.timestamp < p.releaseAt) continue;
            _settle(ids[i], p);
            done++;
        }
    }

    /// 분쟁 신고 (구매자) — 정산 기한을 7일로 늦춰 협의 시간을 확보한다.
    /// 구매자는 여전히 confirm 으로 정산할 수 있고, 판매자는 refund 로 환불할 수 있다.
    function dispute(uint256 purchaseId) external {
        Purchase storage p = _purchases[purchaseId];
        require(msg.sender == p.buyer, "buyer");
        require(!p.settled && !p.disputed, "state");
        p.disputed = true;
        uint64 extended = uint64(block.timestamp) + DISPUTE_EXTENSION;
        if (extended > p.releaseAt) p.releaseAt = extended;
        emit Disputed(purchaseId, msg.sender);
    }

    /// 환불 (판매자) — 대금을 돌려준다. 쿠폰은 정산 전이라 아직 발행되지 않았다.
    function refund(uint256 purchaseId) external {
        Purchase storage p = _purchases[purchaseId];
        require(msg.sender == p.seller, "seller");
        require(!p.settled, "settled");
        p.settled = true;
        (bool ok, ) = payable(p.buyer).call{value: p.amount}("");
        if (!ok) revert TransferFailed();
        emit Refunded(purchaseId, p.buyer, p.amount);
    }

    function _settle(uint256 id, Purchase storage p) private {
        require(!p.settled, "settled");
        p.settled = true;
        _balances[p.tokenId][p.buyer] += 1;
        emit TransferSingle(msg.sender, address(0), p.buyer, p.tokenId, 1);
        (bool ok, ) = p.seller.call{value: p.amount}("");
        if (!ok) revert TransferFailed();
        emit Settled(id, p.seller, p.amount);
        // 받는 쪽 콜백은 부르지 않는다 — 구매자가 거부하는 계약이어도 판매자의 정산이 막히면 안 된다
    }

    function purchaseOf(
        uint256 id
    )
        external
        view
        returns (
            address buyer,
            address seller,
            uint256 amount,
            uint64 releaseAt,
            bool settled,
            bool disputed,
            uint256 tokenId
        )
    {
        Purchase memory p = _purchases[id];
        return (p.buyer, p.seller, p.amount, p.releaseAt, p.settled, p.disputed, p.tokenId);
    }

    function purchaseCount() external view returns (uint256) {
        return _purchases.length;
    }

    // ---------- 쿠폰 사용 (소각) ----------
    event Redeemed(address indexed who, uint256 indexed id, uint256 value);

    /// 쿠폰 사용 — 보유한 쿠폰을 소각하고 온체인 사용 증빙을 남긴다(상인은 Redeemed 이벤트로 검증)
    function redeem(uint256 id, uint256 value) external {
        uint256 b = _balances[id][msg.sender];
        require(value > 0 && b >= value, "bal");
        unchecked {
            _balances[id][msg.sender] = b - value;
        }
        emit TransferSingle(msg.sender, msg.sender, address(0), id, value);
        emit Redeemed(msg.sender, id, value);
    }

    // ---------- 공용 ----------
    function _pageLen(uint256 total, uint256 offset, uint256 limit) private pure returns (uint256) {
        if (offset >= total) return 0;
        uint256 n = total - offset;
        return n < limit ? n : limit;
    }

    function _popIndex(
        address[] storage arr,
        mapping(address => uint256) storage index,
        address who
    ) private {
        uint256 pos = index[who] - 1;
        address last = arr[arr.length - 1];
        arr[pos] = last;
        index[last] = pos + 1;
        arr.pop();
        delete index[who];
    }
}
