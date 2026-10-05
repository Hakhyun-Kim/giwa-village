// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// 기와장터 호패(號牌) — "익명 지갑이 아니라 이름 있는 사람과 거래한다".
///
/// 마을 안의 쓰기는 기기마다 만든 소액 버너가 조용히 서명한다. 그런데 Dojang 인증과
/// UP.ID 이름은 업비트가 확인한 *진짜 지갑*에 붙으므로, 버너만 보면 누구인지 알 수 없다.
/// 호패는 그 둘을 잇는다: 진짜 지갑이 "이 버너가 나를 대신한다"고 가스 없이 서명하고
/// (EIP-712), 버너가 그 서명을 들고 link()를 부른다. 양쪽이 모두 동의해야 걸린다 —
/// 진짜 지갑의 서명(대리 허락)과 버너의 msg.sender(호패를 받겠다는 뜻).
///
/// 이름 · 인증을 이 컨트랙트가 판정하지 않는다. 클라이언트가 principalOf(버너)를 읽어
/// 그 주소의 UP.ID · Dojang 을 조회한다 — 레지스트리가 바뀌어도 여기는 그대로다.
/// 버너 키를 잃거나 털렸으면 진짜 지갑이 revoke()로 호패를 거둔다.
contract GiwaIdentity {
    /// 버너 → 그 버너를 대리로 세운 진짜 지갑 (없으면 0)
    mapping(address => address) public principalOf;
    /// 진짜 지갑마다 서명 재사용을 막는 번호 — 서명 하나는 한 번만 쓰인다
    mapping(address => uint256) public nonces;

    bytes32 public constant LINK_TYPEHASH =
        keccak256("Link(address burner,address principal,uint256 nonce,uint256 deadline)");
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    /// secp256k1 n/2 — 높은 s 는 받지 않는다(같은 서명의 다른 표기)
    uint256 private constant HALF_N =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    event Linked(address indexed burner, address indexed principal);
    event Unlinked(address indexed burner, address indexed principal);

    function domainSeparator() public view returns (bytes32) {
        return keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256("GiwaIdentity"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
    }

    /// 진짜 지갑이 서명할 다이제스트 — 클라이언트 · 테스트가 대조용으로 읽는다
    function linkDigest(address burner, address principal, uint256 nonce, uint256 deadline)
        public
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encodePacked(
                "\x19\x01",
                domainSeparator(),
                keccak256(abi.encode(LINK_TYPEHASH, burner, principal, nonce, deadline))
            )
        );
    }

    /// 버너(msg.sender)가 진짜 지갑의 허락 서명을 들고 호패를 건다.
    /// 이미 다른 호패가 걸려 있으면 바꿔 단다(버너 스스로 원한 것이므로).
    function link(address principal, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external {
        require(principal != address(0) && principal != msg.sender, "bad principal");
        require(block.timestamp <= deadline, "expired");
        require(uint256(s) <= HALF_N, "bad sig");
        bytes32 digest = linkDigest(msg.sender, principal, nonces[principal], deadline);
        address signer = ecrecover(digest, v, r, s);
        require(signer != address(0) && signer == principal, "bad sig");
        nonces[principal]++;
        address prev = principalOf[msg.sender];
        if (prev != address(0)) emit Unlinked(msg.sender, prev);
        principalOf[msg.sender] = principal;
        emit Linked(msg.sender, principal);
    }

    /// 버너가 스스로 호패를 내려놓는다
    function unlink() external {
        address p = principalOf[msg.sender];
        require(p != address(0), "not linked");
        delete principalOf[msg.sender];
        emit Unlinked(msg.sender, p);
    }

    /// 진짜 지갑이 제 이름을 단 버너에서 호패를 거둔다 (버너를 잃었거나 털렸을 때)
    function revoke(address burner) external {
        require(principalOf[burner] == msg.sender, "not yours");
        delete principalOf[burner];
        emit Unlinked(burner, msg.sender);
    }

    /// 화면에 보일 주인 — 호패가 있으면 진짜 지갑, 없으면 그 주소 자신
    function identityOf(address who) external view returns (address) {
        address p = principalOf[who];
        return p == address(0) ? who : p;
    }
}
