// Text ?곗씠??(?먮룞 ?앹꽦??
const TEXT_DATA = {
    "levelUp": {
        "id": 500001,
        "key": "levelUp",
        "text": "LEVEL UP!",
        "color": "#ffff00",
        "fontSize": 16,
        "life": 60
    },
    "buffEndFire": {
        "id": 500002,
        "key": "buffEndFire",
        "text": "화염구 버프 종료",
        "color": "#888888",
        "fontSize": 14,
        "life": 60
    },
    "buffEndLightning": {
        "id": 500003,
        "key": "buffEndLightning",
        "text": "번개 버프 종료",
        "color": "#888888",
        "fontSize": 14,
        "life": 60
    },
    "lightning": {
        "id": 500004,
        "key": "lightning",
        "text": "LIGHTNING!",
        "color": "#ffff00",
        "fontSize": 24,
        "life": 60
    },
    "buffLightning": {
        "id": 500005,
        "key": "buffLightning",
        "text": "⚡ 번개 버프! (60초)",
        "color": "#00ffff",
        "fontSize": 14,
        "life": 60
    },
    "buffFireball": {
        "id": 500006,
        "key": "buffFireball",
        "text": "🔥 화염구! (10초)",
        "color": "#ff6600",
        "fontSize": 14,
        "life": 60
    },
    "shurikenMax": {
        "id": 500007,
        "key": "shurikenMax",
        "text": "✦ 표창 최대!",
        "color": "#888888",
        "fontSize": 14,
        "life": 60
    },
    "shurikenAdd": {
        "id": 500008,
        "key": "shurikenAdd",
        "text": "✦ 표창 +1 (총 {0}개)",
        "color": "#6a6a6a",
        "fontSize": 14,
        "life": 60
    },
    "playerDamage": {
        "id": 500009,
        "key": "playerDamage",
        "text": "{0}",
        "color": "#ff4444",
        "fontSize": 28,
        "life": 60
    },
    "bossSummon": {
        "id": 500010,
        "key": "bossSummon",
        "text": "소환!",
        "color": "#8a2be2",
        "fontSize": 18,
        "life": 60
    },
    "bossRegen": {
        "id": 500011,
        "key": "bossRegen",
        "text": "0",
        "color": "#00ff00",
        "fontSize": 20,
        "life": 60
    },
    "monsterDamage": {
        "id": 500012,
        "key": "monsterDamage",
        "text": "{0}",
        "color": "#ffff00",
        "fontSize": 28,
        "life": 60
    },
    "bossGhostDeath": {
        "id": 500013,
        "key": "bossGhostDeath",
        "text": "소멸",
        "color": "#8a2be2",
        "fontSize": 18,
        "life": 60
    },
    "expGain": {
        "id": 500014,
        "key": "expGain",
        "text": "+{0} EXP",
        "color": "#00ffff",
        "fontSize": 16,
        "life": 60
    },
    "fireHit": {
        "id": 500015,
        "key": "fireHit",
        "text": "🔥",
        "color": "#ff4400",
        "fontSize": 20,
        "life": 30
    },
    "potionHeal": {
        "id": 500016,
        "key": "potionHeal",
        "text": "0",
        "color": "#44ff44",
        "fontSize": 20,
        "life": 60
    },
    "equipGet": {
        "id": 500017,
        "key": "equipGet",
        "text": "{0} 획득!",
        "color": "{1}",
        "fontSize": 14,
        "life": 60
    },
    "inventoryFull": {
        "id": 500018,
        "key": "inventoryFull",
        "text": "인벤토리 가득!",
        "color": "#FF0000",
        "fontSize": 14,
        "life": 60
    },
    "lobbyHeal": {
        "id": 500019,
        "key": "lobbyHeal",
        "text": "체력 회복!",
        "color": "#00ff00",
        "fontSize": 18,
        "life": 60
    },
    "previewMode": {
        "id": 500020,
        "key": "previewMode",
        "text": "미리보기 모드",
        "color": "#9333ea",
        "fontSize": 16,
        "life": 60
    },
    "critical": {
        "id": 500021,
        "key": "critical",
        "text": "CRITICAL!",
        "color": "#ff0000",
        "fontSize": 20,
        "life": 60
    },
    "stomp": {
        "id": 500022,
        "key": "stomp",
        "text": "STOMP!",
        "color": "#ff8800",
        "fontSize": 18,
        "life": 60
    },
    "coinGet": {
        "id": 500023,
        "key": "coinGet",
        "text": "+{0} G",
        "color": "#ffd700",
        "fontSize": 16,
        "life": 60
    }
};

// ?띿뒪???앹꽦 ?ы띁 ?⑥닔
function createText(key, x, y, ...args) {
    const data = TEXT_DATA[key];
    if (!data) {
        console.error('Unknown text key:', key);
        return null;
    }

    let text = data.text;
    let color = data.color;

    // {0}, {1}, ... 移섑솚
    args.forEach((arg, index) => {
        text = text.replace(`{${index}}`, arg);
        color = color.replace(`{${index}}`, arg);
    });

    return new DamageText(x, y, text, color, data.life, data.fontSize);
}