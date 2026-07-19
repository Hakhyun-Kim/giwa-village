// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// 기와장터 공방 — 유저 제작 문양(8x8 픽셀, 4색)의 온체인 등록·판매·착용.
/// 창작물 판매는 게임플레이 보상이 아니므로 거래 가능(규제 안전선과 양립).
/// 구매 대금은 중개 없이 창작자에게 즉시 전달된다. 문양 데이터는 16바이트
/// (픽셀당 2비트) + 16색 프리셋 인덱스 4개(uint16)로 전부 온체인에 산다.
contract GiwaWorkshop {
    struct Design {
        address payable creator;
        uint64 createdAt;
        uint32 mints;
        uint128 price; // 0 = 무료 배포
        uint16 palette; // 4 x 4bit 프리셋 색 인덱스
        bytes16 pixels; // 8x8 x 2bit, row-major
        string name;
    }

    Design[] private _designs;
    mapping(uint256 => mapping(address => bool)) private _owned;
    mapping(address => uint256) private _wearing; // designId + 1 (0 = 없음)

    event DesignRegistered(uint256 indexed id, address indexed creator, string name, uint256 price);
    event DesignBought(uint256 indexed id, address indexed buyer, address indexed creator, uint256 price);
    event Worn(address indexed who, uint256 idPlus1);

    error WrongPrice(uint256 expected, uint256 sent);

    function register(
        string calldata name,
        bytes16 pixels,
        uint16 palette,
        uint128 price
    ) external returns (uint256 id) {
        require(bytes(name).length >= 1 && bytes(name).length <= 36, "name");
        id = _designs.length;
        _designs.push(
            Design(payable(msg.sender), uint64(block.timestamp), 0, price, palette, pixels, name)
        );
        _owned[id][msg.sender] = true; // 창작자는 자동 보유
        emit DesignRegistered(id, msg.sender, name, price);
    }

    /// 구매 — 대금은 창작자에게 즉시 전달
    function buyDesign(uint256 id) external payable {
        Design storage d = _designs[id];
        require(!_owned[id][msg.sender], "owned");
        if (msg.value != d.price) revert WrongPrice(d.price, msg.value);
        _owned[id][msg.sender] = true;
        d.mints += 1;
        if (msg.value > 0) {
            (bool ok, ) = d.creator.call{value: msg.value}("");
            require(ok, "pay");
        }
        emit DesignBought(id, msg.sender, d.creator, msg.value);
    }

    /// 착용 — idPlus1 (0이면 벗기). 보유한 문양만.
    function wear(uint256 idPlus1) external {
        require(idPlus1 == 0 || _owned[idPlus1 - 1][msg.sender], "not-owned");
        _wearing[msg.sender] = idPlus1;
        emit Worn(msg.sender, idPlus1);
    }

    function designCount() external view returns (uint256) {
        return _designs.length;
    }

    function designAt(uint256 id) external view returns (Design memory) {
        return _designs[id];
    }

    /// 최신순 페이지 조회 (클라이언트 장터 목록용)
    function designsPage(uint256 offset, uint256 limit)
        external
        view
        returns (uint256[] memory ids, Design[] memory list)
    {
        uint256 n = _designs.length;
        uint256 from = n > offset ? n - offset : 0;
        uint256 count = from > limit ? limit : from;
        ids = new uint256[](count);
        list = new Design[](count);
        for (uint256 i; i < count; i++) {
            uint256 id = from - 1 - i;
            ids[i] = id;
            list[i] = _designs[id];
        }
    }

    function ownedOf(address who, uint256 id) external view returns (bool) {
        return _owned[id][who];
    }

    /// 착용 중 문양 — 없으면 exists=false
    function wornOf(address who)
        external
        view
        returns (bool exists, uint256 id, bytes16 pixels, uint16 palette)
    {
        uint256 p1 = _wearing[who];
        if (p1 == 0) return (false, 0, 0, 0);
        Design storage d = _designs[p1 - 1];
        return (true, p1 - 1, d.pixels, d.palette);
    }
}
