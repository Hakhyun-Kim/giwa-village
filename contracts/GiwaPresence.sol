// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// 기와장터 프레즌스 비컨 — 저장 없이 이벤트만 발행하는 초경량 존재감 채널.
/// 클라이언트는 이동 중 1~2초마다 (위치, 속도)를 쏘고, 서로의 이벤트를 폴링해
/// 속도 벡터로 데드레커닝(예측 이동)한다. 좌표는 ×100 정수 양자화.
/// emote: 0 없음, 1 👋, 2 🎁, 3 🛍️ … 255 퇴장.
contract GiwaPresence {
    event Beacon(
        address indexed who,
        int32 x100,
        int32 z100,
        int16 vx100,
        int16 vz100,
        uint8 emote
    );

    function beacon(int32 x100, int32 z100, int16 vx100, int16 vz100, uint8 emote) external {
        emit Beacon(msg.sender, x100, z100, vx100, vz100, emote);
    }
}
