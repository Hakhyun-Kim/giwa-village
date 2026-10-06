// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IHearthIdentity {
    function identityOf(address who) external view returns (address);
}

interface IHearthDojang {
    function isVerified(address account, bytes32 attesterId) external view returns (bool);
}

interface ILegacyHearth {
    function warmthOf(address who) external view returns (uint32);
}

/// 기와장터 모닥불(화로) v2 — "모닥불은 혼자 못 쬔다".
/// 10분 화로 윈도에 gather()로 함께 모이면, 윈도가 닫힌 뒤 claim()으로
/// 온기(양도 불가 카운터)를 받는다. 장날(토 21시 KST = 12:00 UTC, 1시간)에는 온기 2배.
///
/// v1 은 "지갑 둘"만 보아 한 사람이 지갑 둘로 혼자 온기를 얻었다(guide/V4.md §8).
/// v2 는 지갑이 아니라 **사람**을 센다: 호패(GiwaIdentity)를 따라간 주인이 셈의 단위이고
/// (같은 주인의 버너 둘은 한 사람), 업비트 Dojang 인증을 받은 사람은 한 사람으로,
/// 인증이 없는 사람은 반 사람으로 센다. 한 사람 몫이 모여야(무게 4 = 인증 둘 · 인증 하나 + 손님 둘 · 손님 넷)
/// 온기가 생긴다. v1 의 온기는 legacyHearth 로 읽어 잇는다.
contract GiwaHearth {
    uint256 public constant WINDOW = 600; // 10분
    uint16 public constant WEIGHT_VERIFIED = 2; // Dojang 인증 — 한 사람
    uint16 public constant WEIGHT_GUEST = 1; // 인증 없음 — 반 사람
    uint16 public constant WEIGHT_NEEDED = 4; // 두 사람 몫

    ILegacyHearth public immutable legacyHearth;
    IHearthIdentity public immutable identity;
    IHearthDojang public immutable dojang;
    bytes32 public immutable attesterId;

    mapping(uint256 => mapping(address => bool)) public joined; // 창 → 버너
    mapping(uint256 => mapping(address => bool)) public personJoined; // 창 → 주인(호패를 따라간 주소)
    mapping(uint256 => uint16) public countOf; // 모인 사람 수
    mapping(uint256 => uint16) public weightOf; // 모인 무게
    mapping(uint256 => mapping(address => bool)) private _claimed;
    mapping(address => uint32) private _earned;

    event Gathered(address indexed who, uint256 indexed window, uint16 count);
    event Warmed(address indexed who, uint256 indexed window, uint32 warmth);

    constructor(address legacyHearth_, address identity_, address dojang_, bytes32 attesterId_) {
        legacyHearth = ILegacyHearth(legacyHearth_);
        identity = IHearthIdentity(identity_);
        dojang = IHearthDojang(dojang_);
        attesterId = attesterId_;
    }

    function windowNow() public view returns (uint256) {
        return block.timestamp / WINDOW;
    }

    /// 장날 여부 — 1970-01-01이 목요일이므로 day % 7 == 2 가 토요일
    function isMarketDay(uint256 ts) public pure returns (bool) {
        uint256 day = ts / 86400;
        uint256 secOfDay = ts % 86400;
        return (day % 7) == 2 && secOfDay >= 12 hours && secOfDay < 13 hours;
    }

    /// 온기 — v1 에서 쬔 것과 v2 에서 쬔 것을 합친다
    function warmthOf(address who) public view returns (uint32) {
        uint32 legacy = address(legacyHearth) == address(0) ? 0 : legacyHearth.warmthOf(who);
        return legacy + _earned[who];
    }

    /// 이 주소 뒤에 선 사람 — 호패가 있으면 그 주인, 없으면 자신
    function personOf(address who) public view returns (address) {
        return address(identity) == address(0) ? who : identity.identityOf(who);
    }

    /// 이 사람이 모닥불에서 갖는 무게 — 인증이면 한 사람, 아니면 반 사람
    function weightFor(address who) public view returns (uint16) {
        if (address(dojang) == address(0)) return WEIGHT_GUEST;
        try dojang.isVerified(personOf(who), attesterId) returns (bool ok) {
            return ok ? WEIGHT_VERIFIED : WEIGHT_GUEST;
        } catch {
            return WEIGHT_GUEST;
        }
    }

    /// 모닥불에 모인다 (현재 윈도) — 같은 사람의 두 번째 버너는 받지 않는다
    function gather() external {
        uint256 w = windowNow();
        require(!joined[w][msg.sender], "joined");
        address person = personOf(msg.sender);
        require(!personJoined[w][person], "same-person");
        joined[w][msg.sender] = true;
        personJoined[w][person] = true;
        countOf[w] += 1;
        weightOf[w] += weightFor(msg.sender);
        emit Gathered(msg.sender, w, countOf[w]);
    }

    /// 닫힌 윈도의 온기 수령 — 두 사람 몫이 모였을 때만
    function claim(uint256 w) external returns (uint32) {
        require(w < windowNow(), "open");
        require(joined[w][msg.sender], "absent");
        require(weightOf[w] >= WEIGHT_NEEDED, "alone");
        require(!_claimed[w][msg.sender], "claimed");
        _claimed[w][msg.sender] = true;
        _earned[msg.sender] += isMarketDay(w * WINDOW) ? 2 : 1;
        uint32 warmth = warmthOf(msg.sender);
        emit Warmed(msg.sender, w, warmth);
        return warmth;
    }

    /// 클라이언트 상태 조회 헬퍼 (v1 과 같은 모양 — 모인 무게는 weightOf 로 따로 읽는다)
    function statusOf(address who)
        external
        view
        returns (
            uint256 w,
            bool joinedNow,
            uint16 cnt,
            bool prevClaimable,
            uint32 warmth
        )
    {
        w = windowNow();
        joinedNow = joined[w][who];
        cnt = countOf[w];
        uint256 prev = w - 1;
        prevClaimable = joined[prev][who] && weightOf[prev] >= WEIGHT_NEEDED && !_claimed[prev][who];
        warmth = warmthOf(who);
    }
}
