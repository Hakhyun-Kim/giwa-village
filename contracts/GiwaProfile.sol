// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPGuilds {
    struct DungeonState { uint32 epoch; uint16 floor; uint16 best; uint32 runs; uint32 attempts; }
    struct Guild {
        string name; string emblem; address founder; uint64 createdAt;
        address[] members; DungeonState d;
    }
    function guildOf(address member) external view returns (uint256 idPlus1);
    function guildAt(uint256 id) external view returns (Guild memory);
}

interface IPHonors {
    function profileOf(address who) external view returns (uint256 mask, uint256 equippedId);
}

interface IPBoxes {
    function profileOf(address who)
        external view returns (uint256 mask, uint8 equipped, uint64 pendingBlock, uint64 nextOpenAt);
}

interface IPHearth {
    function warmthOf(address who) external view returns (uint32);
}

interface IPWorkshop {
    function wornOf(address who)
        external view returns (bool exists, uint256 id, bytes16 pixels, uint16 palette);
}

interface IPBoss {
    function trophiesOf(address who) external view returns (uint32);
}

/// 기와장터 소셜 프로필 애그리게이터 — 외부 dApp이 RPC 1콜로 지갑의
/// 마을 프로필(길드·칭호·장신구·문양·온기·전리품)을 읽는다.
/// 쓰기 없음, 순수 뷰 조합. "지갑의 소셜 레이어"를 외부에서 소비하는 진입점.
contract GiwaProfile {
    IPGuilds public immutable guilds;
    IPHonors public immutable honors;
    IPBoxes public immutable boxes;
    IPHearth public immutable hearth;
    IPWorkshop public immutable workshop;
    IPBoss public immutable boss;

    struct Profile {
        uint256 guildIdPlus1;
        string guildName;
        string guildEmblem;
        uint256 honorMask;
        uint256 honorEquipped;
        uint256 trinketMask;
        uint8 trinketEquipped;
        bool wearing;
        bytes16 wearPixels;
        uint16 wearPalette;
        uint32 warmth;
        uint32 trophies;
    }

    constructor(
        address guilds_,
        address honors_,
        address boxes_,
        address hearth_,
        address workshop_,
        address boss_
    ) {
        guilds = IPGuilds(guilds_);
        honors = IPHonors(honors_);
        boxes = IPBoxes(boxes_);
        hearth = IPHearth(hearth_);
        workshop = IPWorkshop(workshop_);
        boss = IPBoss(boss_);
    }

    function profileOf(address who) external view returns (Profile memory p) {
        p.guildIdPlus1 = guilds.guildOf(who);
        if (p.guildIdPlus1 > 0) {
            IPGuilds.Guild memory g = guilds.guildAt(p.guildIdPlus1 - 1);
            p.guildName = g.name;
            p.guildEmblem = g.emblem;
        }
        (p.honorMask, p.honorEquipped) = honors.profileOf(who);
        (p.trinketMask, p.trinketEquipped, , ) = boxes.profileOf(who);
        (p.wearing, , p.wearPixels, p.wearPalette) = workshop.wornOf(who);
        p.warmth = hearth.warmthOf(who);
        p.trophies = boss.trophiesOf(who);
    }
}
