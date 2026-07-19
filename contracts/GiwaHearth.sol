// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// 기와장터 모닥불(화로) — "모닥불은 혼자 못 쬔다".
/// 10분 화로 윈도에 gather()로 함께 모이면, 윈도가 닫힌 뒤 claim()으로
/// 온기(양도 불가 카운터)를 받는다. 2명 이상 모였을 때만 — 함께 있음의
/// 온체인 증명이다. 장날(토 21시 KST = 12:00 UTC, 1시간)에는 온기 2배.
contract GiwaHearth {
    uint256 public constant WINDOW = 600; // 10분

    mapping(uint256 => mapping(address => bool)) public joined;
    mapping(uint256 => uint16) public countOf;
    mapping(uint256 => mapping(address => bool)) private _claimed;
    mapping(address => uint32) public warmthOf;

    event Gathered(address indexed who, uint256 indexed window, uint16 count);
    event Warmed(address indexed who, uint256 indexed window, uint32 warmth);

    function windowNow() public view returns (uint256) {
        return block.timestamp / WINDOW;
    }

    /// 장날 여부 — 1970-01-01이 목요일이므로 day % 7 == 2 가 토요일
    function isMarketDay(uint256 ts) public pure returns (bool) {
        uint256 day = ts / 86400;
        uint256 secOfDay = ts % 86400;
        return (day % 7) == 2 && secOfDay >= 12 hours && secOfDay < 13 hours;
    }

    /// 모닥불에 모인다 (현재 윈도)
    function gather() external {
        uint256 w = windowNow();
        require(!joined[w][msg.sender], "joined");
        joined[w][msg.sender] = true;
        countOf[w] += 1;
        emit Gathered(msg.sender, w, countOf[w]);
    }

    /// 닫힌 윈도의 온기 수령 — 2명 이상 함께였을 때만
    function claim(uint256 w) external returns (uint32) {
        require(w < windowNow(), "open");
        require(joined[w][msg.sender], "absent");
        require(countOf[w] >= 2, "alone");
        require(!_claimed[w][msg.sender], "claimed");
        _claimed[w][msg.sender] = true;
        uint32 add = isMarketDay(w * WINDOW) ? 2 : 1;
        warmthOf[msg.sender] += add;
        emit Warmed(msg.sender, w, warmthOf[msg.sender]);
        return warmthOf[msg.sender];
    }

    /// 클라이언트 상태 조회 헬퍼
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
        prevClaimable = joined[prev][who] && countOf[prev] >= 2 && !_claimed[prev][who];
        warmth = warmthOf[who];
    }
}
