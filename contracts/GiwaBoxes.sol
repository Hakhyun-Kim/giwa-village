// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ILegacyBoxes {
    function profileOf(address who)
        external
        view
        returns (uint256 mask, uint8 equipped, uint64 pendingBlock, uint64 nextOpenAt);
}

/// 기와장터 랜덤박스(복주머니) v2 — 완전 온체인 개봉, 참가비 없음.
/// - 무료 + 주소당 쿨다운: 돈이 오가지 않으므로 사행성 논란이 없다.
/// - 결과는 개봉 tx가 담긴 블록의 해시로만 확정(2단계: open → 다음 블록에 reveal).
///   v1 은 256블록이 지나면 keccak(블록, 주소)로 정해 **열기 전에 계산할 수 있었다** — v2 는 그때
///   결과를 주지 않고 봉인을 무른다(쿨다운 없이 다시 연다 · guide/V4.md §6).
/// - 여덟 가지 장신구는 모두 1/8 이다(KINDS · ODDS_DENOMINATOR — 화면이 이 상수를 읽는다).
/// - 보상은 양도 불가 장신구(소울바운드) — 전송 함수가 아예 없다. v1 의 보유 · 장착은 legacyBoxes 로 읽어 잇는다.
contract GiwaBoxes {
    uint256 public constant COOLDOWN = 60; // 초
    uint8 public constant KINDS = 8; // 1..8
    uint8 public constant ODDS_DENOMINATOR = 8; // 장신구마다 1/8

    ILegacyBoxes public immutable legacyBoxes;

    mapping(address => uint64) public lastOpenAt;
    mapping(address => uint64) private _pendingBlock; // 0 = 없음
    mapping(address => uint256) private _ownedMask; // 1 << kind
    mapping(address => uint8) private _equipped; // 0 = 없음
    mapping(address => bool) private _equipSet; // v2 에서 장착을 한 번이라도 골랐는가 (아니면 v1 장착을 잇는다)

    event BoxOpened(address indexed who, uint64 commitBlock);
    event BoxRevealed(address indexed who, uint8 kind);
    event BoxExpired(address indexed who, uint64 commitBlock);
    event TrinketEquipped(address indexed who, uint8 kind);

    constructor(address legacyBoxes_) {
        legacyBoxes = ILegacyBoxes(legacyBoxes_);
    }

    /// 상자 열기 — 이 tx가 담긴 블록의 해시가 결과를 봉인한다
    function openBox() external {
        require(_pendingBlock[msg.sender] == 0, "pending");
        require(block.timestamp >= lastOpenAt[msg.sender] + COOLDOWN, "cooldown");
        lastOpenAt[msg.sender] = uint64(block.timestamp);
        _pendingBlock[msg.sender] = uint64(block.number);
        emit BoxOpened(msg.sender, uint64(block.number));
    }

    /// 개봉 — 다음 블록부터 256블록 안에. 그 뒤에는 결과 없이 봉인을 무르고 0 을 돌려준다
    /// (쿨다운 없이 바로 다시 열 수 있다). 결과는 언제나 열기 뒤의 블록 해시로만 정해진다.
    function reveal() external returns (uint8 kind) {
        uint64 b = _pendingBlock[msg.sender];
        require(b != 0 && block.number > b, "wait");
        _pendingBlock[msg.sender] = 0;
        bytes32 h = blockhash(b);
        if (h == bytes32(0)) {
            lastOpenAt[msg.sender] = 0;
            emit BoxExpired(msg.sender, b);
            return 0;
        }
        uint8 roll = uint8(keccak256(abi.encodePacked(h, msg.sender))[0]);
        kind = 1 + (roll % KINDS); // 여덟 가지 모두 1/8
        _ownedMask[msg.sender] |= (1 << kind);
        emit BoxRevealed(msg.sender, kind);
    }

    /// 장착 — 0이면 해제. 보유한 장신구만(v1 에서 얻은 것 포함).
    function equipTrinket(uint8 kind) external {
        require(kind == 0 || (_maskOf(msg.sender) & (1 << kind)) != 0, "not-owned");
        _equipped[msg.sender] = kind;
        _equipSet[msg.sender] = true;
        emit TrinketEquipped(msg.sender, kind);
    }

    function _legacy(address who) private view returns (uint256 mask, uint8 equipped) {
        if (address(legacyBoxes) == address(0)) return (0, 0);
        (mask, equipped, , ) = legacyBoxes.profileOf(who);
    }

    function _maskOf(address who) private view returns (uint256) {
        (uint256 legacyMask, ) = _legacy(who);
        return _ownedMask[who] | legacyMask;
    }

    function profileOf(address who)
        external
        view
        returns (uint256 mask, uint8 equipped, uint64 pendingBlock, uint64 nextOpenAt)
    {
        (uint256 legacyMask, uint8 legacyEquipped) = _legacy(who);
        return (
            _ownedMask[who] | legacyMask,
            _equipSet[who] ? _equipped[who] : legacyEquipped,
            _pendingBlock[who],
            lastOpenAt[who] == 0 ? 0 : lastOpenAt[who] + uint64(COOLDOWN)
        );
    }
}
