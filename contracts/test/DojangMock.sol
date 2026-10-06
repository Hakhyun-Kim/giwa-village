// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// 로컬 시험(test:local) 전용 — DojangScroll.isVerified 와 같은 모양. 배포하지 않는다.
contract DojangMock {
    mapping(address => mapping(bytes32 => bool)) private _verified;

    function setVerified(address account, bytes32 attesterId, bool ok) external {
        _verified[account][attesterId] = ok;
    }

    function isVerified(address account, bytes32 attesterId) external view returns (bool) {
        return _verified[account][attesterId];
    }
}
