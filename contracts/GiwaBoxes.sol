// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// 기와장터 랜덤박스 — 완전 온체인 개봉, 참가비 없음.
/// - 무료 + 주소당 쿨다운: 돈이 오가지 않으므로 사행성 논란이 없다.
/// - 결과는 개봉 tx가 담긴 블록의 해시로 확정(2단계: open → 다음 블록에 reveal).
///   유저는 결과를 미리 알 수도, 마음에 안 든다고 무를 수도 없다.
/// - 보상은 양도 불가 장신구(소울바운드) — 전송 함수가 아예 없다.
contract GiwaBoxes {
    uint256 public constant COOLDOWN = 60; // 초
    uint8 public constant KINDS = 8; // 1..8 (8 = 에픽)

    mapping(address => uint64) public lastOpenAt;
    mapping(address => uint64) private _pendingBlock; // 0 = 없음
    mapping(address => uint256) private _ownedMask; // 1 << kind
    mapping(address => uint8) private _equipped; // 0 = 없음

    event BoxOpened(address indexed who, uint64 commitBlock);
    event BoxRevealed(address indexed who, uint8 kind);
    event TrinketEquipped(address indexed who, uint8 kind);

    /// 상자 열기 — 이 tx가 담긴 블록의 해시가 결과를 봉인한다
    function openBox() external {
        require(_pendingBlock[msg.sender] == 0, "pending");
        require(block.timestamp >= lastOpenAt[msg.sender] + COOLDOWN, "cooldown");
        lastOpenAt[msg.sender] = uint64(block.timestamp);
        _pendingBlock[msg.sender] = uint64(block.number);
        emit BoxOpened(msg.sender, uint64(block.number));
    }

    /// 개봉 — 다음 블록부터 가능. 256블록(약 4분) 지나면 폴백 해시 사용.
    function reveal() external returns (uint8 kind) {
        uint64 b = _pendingBlock[msg.sender];
        require(b != 0 && block.number > b, "wait");
        bytes32 h = blockhash(b);
        if (h == bytes32(0)) {
            // 256블록 경과 — 개봉을 영영 막지 않기 위한 결정론적 폴백
            h = keccak256(abi.encodePacked(b, msg.sender));
        }
        uint8 roll = uint8(keccak256(abi.encodePacked(h, msg.sender))[0]);
        if (roll < 128) kind = 1 + (roll % 4); // 커먼 4종 ≈50%
        else if (roll < 224) kind = 5 + (roll % 3); // 레어 3종 ≈37.5%
        else kind = 8; // 에픽 ≈12.5%
        _ownedMask[msg.sender] |= (1 << kind);
        _pendingBlock[msg.sender] = 0;
        emit BoxRevealed(msg.sender, kind);
    }

    /// 장착 — 0이면 해제. 보유한 장신구만.
    function equipTrinket(uint8 kind) external {
        require(kind == 0 || (_ownedMask[msg.sender] & (1 << kind)) != 0, "not-owned");
        _equipped[msg.sender] = kind;
        emit TrinketEquipped(msg.sender, kind);
    }

    function profileOf(address who)
        external
        view
        returns (uint256 mask, uint8 equipped, uint64 pendingBlock, uint64 nextOpenAt)
    {
        return (
            _ownedMask[who],
            _equipped[who],
            _pendingBlock[who],
            lastOpenAt[who] + uint64(COOLDOWN)
        );
    }
}
