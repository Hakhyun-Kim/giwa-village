// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IBossGuilds {
    function guildOf(address member) external view returns (uint256 idPlus1);
}

interface IBossHearth {
    function warmthOf(address who) external view returns (uint32);

    function isMarketDay(uint256 ts) external pure returns (bool);
}

/// 기와장터 도깨비 토벌 — 주간 보스, 함께 때려잡는 동시성 코업.
/// 참가비 없음(가스만), 보상은 양도 불가 전리품 카운터 — 규제 안전선 유지.
/// 데미지는 블록 해시 롤 + 온기 보정, 장날(토 21시 KST)엔 2배.
/// 개인·길드 기여도가 온체인에 쌓인다.
contract GiwaBoss {
    uint256 public constant EPOCH = 7 days;
    uint128 public constant BASE_HP = 2000;
    uint64 public constant COOLDOWN = 30; // 초

    IBossGuilds public immutable guilds;
    IBossHearth public immutable hearth;

    mapping(uint256 => uint128) public dealtOf; // week => 누적 데미지
    mapping(uint256 => bool) public slainOf;
    mapping(uint256 => mapping(address => uint128)) public contribOf;
    mapping(uint256 => mapping(uint256 => uint128)) public guildContribOf; // week => guildId
    mapping(uint256 => mapping(address => uint64)) private _lastStrike;
    mapping(uint256 => mapping(address => bool)) private _claimed;
    mapping(address => uint32) public trophiesOf; // 양도 불가 전리품

    event Struck(address indexed who, uint256 indexed week, uint128 dmg, uint128 remaining);
    event Slain(uint256 indexed week, address indexed lastHitter);
    event Trophy(address indexed who, uint256 indexed week, uint32 trophies);

    constructor(address guilds_, address hearth_) {
        guilds = IBossGuilds(guilds_);
        hearth = IBossHearth(hearth_);
    }

    function week() public view returns (uint256) {
        return block.timestamp / EPOCH;
    }

    /// 타격 — 쿨다운 30초. 데미지 = 10~30 랜덤 + 온기(최대 20) 보정, 장날 2배.
    function strike() external returns (uint128 dmg) {
        uint256 w = week();
        require(!slainOf[w], "slain");
        require(block.timestamp >= _lastStrike[w][msg.sender] + COOLDOWN, "cooldown");
        _lastStrike[w][msg.sender] = uint64(block.timestamp);

        uint256 roll = uint256(
            keccak256(abi.encodePacked(blockhash(block.number - 1), msg.sender, block.timestamp))
        );
        dmg = uint128(10 + (roll % 21)); // 10~30
        uint32 warmth = hearth.warmthOf(msg.sender);
        dmg += uint128(warmth > 20 ? 20 : warmth);
        if (hearth.isMarketDay(block.timestamp)) dmg *= 2;

        dealtOf[w] += dmg;
        contribOf[w][msg.sender] += dmg;
        uint256 gid = guilds.guildOf(msg.sender);
        if (gid > 0) guildContribOf[w][gid - 1] += dmg;

        uint128 remaining = dealtOf[w] >= BASE_HP ? 0 : BASE_HP - dealtOf[w];
        emit Struck(msg.sender, w, dmg, remaining);
        if (remaining == 0 && !slainOf[w]) {
            slainOf[w] = true;
            emit Slain(w, msg.sender);
        }
    }

    /// 토벌된 주의 전리품 수령 — 기여자만, 1회
    function claimTrophy(uint256 w) external {
        require(slainOf[w], "alive");
        require(contribOf[w][msg.sender] > 0, "no-contrib");
        require(!_claimed[w][msg.sender], "claimed");
        _claimed[w][msg.sender] = true;
        trophiesOf[msg.sender] += 1;
        emit Trophy(msg.sender, w, trophiesOf[msg.sender]);
    }

    function statusOf(address who)
        external
        view
        returns (
            uint256 w,
            uint128 remaining,
            bool slain,
            uint128 myContrib,
            uint64 nextStrikeAt,
            bool prevClaimable,
            uint32 trophies
        )
    {
        w = week();
        remaining = dealtOf[w] >= BASE_HP ? 0 : BASE_HP - dealtOf[w];
        slain = slainOf[w];
        myContrib = contribOf[w][who];
        nextStrikeAt = _lastStrike[w][who] + COOLDOWN;
        uint256 prev = w - 1;
        prevClaimable = slainOf[prev] && contribOf[prev][who] > 0 && !_claimed[prev][who];
        trophies = trophiesOf[who];
    }
}
