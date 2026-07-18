// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// 기와장터 길드 + 백층 던전 (비동기 코업) — 완전 온체인 정산
/// - 시드: 주차(에포크)마다 첫 원정 시점의 직전 블록 해시로 고정 (검증 가능)
/// - 문 결과: keccak(시드, 길드, 원정회차, 스텝, 문) — 서버도 플레이어도 조작 불가
/// - 플레이는 클라이언트가 로컬로 즉시 시뮬레이션, 귀환 시 settleRun 한 번으로
///   컨트랙트가 전 과정을 재계산·검증해 길드 기록에 확정한다.
/// - 기록은 양도 불가 상태값 (토큰 아님 — 규제 안전선)
contract GiwaGuilds {
    struct DungeonState {
        uint32 epoch;
        uint16 floor; // 이번 주 확정 층
        uint16 best; // 역대 최고층
        uint32 runs; // 귀환까지 간 원정 수
        uint32 attempts; // 총 입장 수 (원정 회차 — 맵 리그라인드 방지)
    }

    struct Guild {
        string name;
        string emblem;
        address founder;
        uint64 createdAt;
        address[] members;
        DungeonState d;
    }

    uint256 public constant EPOCH_SECONDS = 7 days;
    uint16 public constant MAX_FLOOR = 100;
    uint256 public constant MAX_MEMBERS = 20;
    uint256 public constant MAX_PICKS = 64;

    Guild[] private _guilds;
    mapping(address => uint256) private _memberGuild; // guildId + 1 (0 = 무소속)
    mapping(bytes32 => bool) private _nameTaken;
    mapping(uint256 => mapping(uint32 => bool)) private _attemptSettled;

    mapping(uint256 => bytes32) public epochSeed;
    mapping(uint256 => uint64) public epochSeedBlock;

    event GuildCreated(uint256 indexed guildId, string name, string emblem, address founder);
    event GuildJoined(uint256 indexed guildId, address member);
    event GuildLeft(uint256 indexed guildId, address member);
    event SeedPinned(uint256 indexed epoch, uint64 blockNumber, bytes32 seed);
    event ExpeditionStarted(uint256 indexed guildId, address indexed member, uint32 attempt, uint256 epoch);
    event RunSettled(uint256 indexed guildId, address indexed member, uint32 attempt, uint16 climbed, uint16 floor);

    function currentEpoch() public view returns (uint256) {
        return block.timestamp / EPOCH_SECONDS;
    }

    function guildCount() external view returns (uint256) {
        return _guilds.length;
    }

    function guildOf(address member) public view returns (uint256 idPlus1) {
        return _memberGuild[member];
    }

    function guildAt(uint256 id) external view returns (Guild memory g) {
        g = _guilds[id];
        // 주차가 바뀌었으면 이번 주 층수는 0으로 보여준다 (저장은 쓰기 시점에 갱신)
        if (g.d.epoch != currentEpoch()) g.d.floor = 0;
    }

    /// 전체 길드 — 클라이언트 리더보드용 단일 호출
    function allGuilds() external view returns (Guild[] memory out) {
        uint256 e = currentEpoch();
        out = new Guild[](_guilds.length);
        for (uint256 i; i < _guilds.length; i++) {
            out[i] = _guilds[i];
            if (out[i].d.epoch != e) out[i].d.floor = 0;
        }
    }

    function createGuild(string calldata name, string calldata emblem) external returns (uint256 id) {
        require(_memberGuild[msg.sender] == 0, "member");
        require(bytes(name).length >= 1 && bytes(name).length <= 36, "name");
        require(bytes(emblem).length >= 1 && bytes(emblem).length <= 8, "emblem");
        bytes32 key = keccak256(bytes(name));
        require(!_nameTaken[key], "taken");
        _nameTaken[key] = true;

        id = _guilds.length;
        Guild storage g = _guilds.push();
        g.name = name;
        g.emblem = emblem;
        g.founder = msg.sender;
        g.createdAt = uint64(block.timestamp);
        g.members.push(msg.sender);
        g.d.epoch = uint32(currentEpoch());
        _memberGuild[msg.sender] = id + 1;
        emit GuildCreated(id, name, emblem, msg.sender);
    }

    function joinGuild(uint256 id) external {
        require(_memberGuild[msg.sender] == 0, "member");
        Guild storage g = _guilds[id];
        require(g.members.length < MAX_MEMBERS, "full");
        g.members.push(msg.sender);
        _memberGuild[msg.sender] = id + 1;
        emit GuildJoined(id, msg.sender);
    }

    function leaveGuild() external {
        uint256 idPlus1 = _memberGuild[msg.sender];
        require(idPlus1 != 0, "none");
        Guild storage g = _guilds[idPlus1 - 1];
        for (uint256 i; i < g.members.length; i++) {
            if (g.members[i] == msg.sender) {
                g.members[i] = g.members[g.members.length - 1];
                g.members.pop();
                break;
            }
        }
        _memberGuild[msg.sender] = 0;
        emit GuildLeft(idPlus1 - 1, msg.sender);
    }

    function _rollover(Guild storage g) private {
        uint32 e = uint32(currentEpoch());
        if (g.d.epoch != e) {
            g.d.epoch = e;
            g.d.floor = 0;
        }
    }

    /// 원정 시작 — 회차를 올려 이번 원정의 맵을 확정하고, 주차 시드가 없으면 고정한다
    function enterExpedition() external returns (uint32 attempt, bytes32 seed) {
        uint256 idPlus1 = _memberGuild[msg.sender];
        require(idPlus1 != 0, "none");
        Guild storage g = _guilds[idPlus1 - 1];
        _rollover(g);

        uint256 e = currentEpoch();
        if (epochSeed[e] == bytes32(0)) {
            epochSeed[e] = blockhash(block.number - 1);
            epochSeedBlock[e] = uint64(block.number - 1);
            emit SeedPinned(e, uint64(block.number - 1), epochSeed[e]);
        }
        g.d.attempts += 1;
        emit ExpeditionStarted(idPlus1 - 1, msg.sender, g.d.attempts, e);
        return (g.d.attempts, epochSeed[e]);
    }

    /// 문 결과 — 0 전진(+1) / 1 순풍(+2) / 2 함정. step은 원정 내 스텝 번호(0부터).
    function doorRoll(
        bytes32 seed,
        uint256 guildId,
        uint32 attempt,
        uint256 step,
        uint8 door
    ) public pure returns (uint8) {
        uint8 b = uint8(keccak256(abi.encodePacked(seed, guildId, attempt, step, door))[0]);
        if (b < 154) return 0; // ≈60%
        if (b < 192) return 1; // ≈15%
        return 2; // ≈25%
    }

    /// 귀환 — 문 선택 배열을 재계산·검증해 길드 기록에 확정한다.
    /// 함정이 포함된 배열은 거부된다(잠정 층수는 애초에 무효).
    function settleRun(uint32 attempt, uint8[] calldata picks) external {
        uint256 idPlus1 = _memberGuild[msg.sender];
        require(idPlus1 != 0, "none");
        uint256 gid = idPlus1 - 1;
        Guild storage g = _guilds[gid];
        _rollover(g);

        require(picks.length >= 1 && picks.length <= MAX_PICKS, "picks");
        require(attempt >= 1 && attempt <= g.d.attempts, "attempt");
        require(!_attemptSettled[gid][attempt], "settled");
        _attemptSettled[gid][attempt] = true;

        bytes32 seed = epochSeed[currentEpoch()];
        require(seed != bytes32(0), "seed");

        uint16 climbed;
        for (uint256 i; i < picks.length; i++) {
            require(picks[i] < 3, "door");
            uint8 o = doorRoll(seed, gid, attempt, i, picks[i]);
            require(o != 2, "trap");
            climbed += o == 0 ? 1 : 2;
        }

        uint16 next = g.d.floor + climbed;
        if (next > MAX_FLOOR) next = MAX_FLOOR;
        g.d.floor = next;
        if (next > g.d.best) g.d.best = next;
        g.d.runs += 1;
        emit RunSettled(gid, msg.sender, attempt, climbed, next);
    }
}
