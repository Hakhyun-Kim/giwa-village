// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IGiwaMarketStalls {
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

    function stallOf(address owner) external view returns (Stall memory);
}

interface IGiwaGuilds {
    struct DungeonState {
        uint32 epoch;
        uint16 floor;
        uint16 best;
        uint32 runs;
        uint32 attempts;
    }
    struct Guild {
        string name;
        string emblem;
        address founder;
        uint64 createdAt;
        address[] members;
        DungeonState d;
    }

    function guildOf(address member) external view returns (uint256 idPlus1);

    function guildAt(uint256 id) external view returns (Guild memory);

    function guildCount() external view returns (uint256);

    function currentEpoch() external view returns (uint256);
}

/// 기와장터 칭호 — 소울바운드 기록 (전송 함수 자체가 없다: 규제 안전선).
/// 조건은 전부 다른 컨트랙트의 온체인 상태로 검증하므로 서버·운영자 개입이 없다.
/// 장착(equip)한 칭호는 클라이언트가 이름표 배지(코스메틱)로 그린다.
contract GiwaHonors {
    // id 1 개점(노점을 열어봄) · 2 길드 창설자 · 3 등반가(최고 10층+) ·
    // id 4 고층 정복자(최고 30층+) · 5 등반왕(이번 주 1위 길드의 길드원)
    uint256 public constant MAX_ID = 5;

    IGiwaMarketStalls public immutable market;
    IGiwaGuilds public immutable guilds;

    mapping(address => uint256) private _ownedMask; // 비트마스크 (1 << id)
    mapping(address => uint256) private _equipped; // 0 = 없음

    event HonorClaimed(address indexed who, uint256 indexed id);
    event HonorEquipped(address indexed who, uint256 indexed id);

    constructor(address market_, address guilds_) {
        market = IGiwaMarketStalls(market_);
        guilds = IGiwaGuilds(guilds_);
    }

    function profileOf(address who) external view returns (uint256 mask, uint256 equippedId) {
        return (_ownedMask[who], _equipped[who]);
    }

    function eligible(address who, uint256 id) public view returns (bool) {
        if (id == 1) return market.stallOf(who).openedAt > 0;
        uint256 idPlus1 = guilds.guildOf(who);
        if (idPlus1 == 0) return false;
        IGiwaGuilds.Guild memory g = guilds.guildAt(idPlus1 - 1);
        if (id == 2) return g.founder == who;
        if (id == 3) return g.d.best >= 10;
        if (id == 4) return g.d.best >= 30;
        if (id == 5) {
            // 이번 주 1위 길드(1층 이상, 동점 허용)의 길드원 — 주간 결산은
            // 클레임으로 영구 기록된다 (키퍼 없는 자동화)
            uint256 e = guilds.currentEpoch();
            uint16 myFloor = g.d.epoch == e ? g.d.floor : 0;
            if (myFloor == 0) return false;
            uint256 n = guilds.guildCount();
            for (uint256 i; i < n; i++) {
                IGiwaGuilds.Guild memory o = guilds.guildAt(i);
                uint16 f = o.d.epoch == e ? o.d.floor : 0;
                if (f > myFloor) return false;
            }
            return true;
        }
        return false;
    }

    function claim(uint256 id) external {
        require(id >= 1 && id <= MAX_ID, "id");
        require(_ownedMask[msg.sender] & (1 << id) == 0, "owned");
        require(eligible(msg.sender, id), "not-eligible");
        _ownedMask[msg.sender] |= (1 << id);
        emit HonorClaimed(msg.sender, id);
    }

    /// 장착 — 0이면 해제. 보유한 칭호만.
    function equip(uint256 id) external {
        require(id == 0 || (_ownedMask[msg.sender] & (1 << id)) != 0, "not-owned");
        _equipped[msg.sender] = id;
        emit HonorEquipped(msg.sender, id);
    }
}
