// 캔버스 설정
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// 게임 상수
const GRAVITY = 0.6;
const FRICTION = 0.85;
const MAX_SPEED = 6;
const JUMP_FORCE = -14;
const ACCELERATION = 0.8;

// 월드/카메라 설정
const WORLD_WIDTH = 1920;  // 캔버스의 2배
const WORLD_HEIGHT = 810;  // 50% 높게 (세로 스크롤 가능)

// 카메라
const camera = {
    x: 0,
    y: 0,

    update(target) {
        // 플레이어를 중심으로 카메라 이동
        const targetX = target.x + target.width / 2 - canvas.width / 2;
        const targetY = target.y + target.height / 2 - canvas.height / 2;

        // 가로: 부드럽게 따라감
        this.x += (targetX - this.x) * 0.1;

        // 세로: 데드존 적용 (플레이어가 화면 중앙 ±100px 벗어날 때만 이동)
        const screenCenterY = this.y + canvas.height / 2;
        const playerCenterY = target.y + target.height / 2;
        const deadZone = 100;

        if (playerCenterY < screenCenterY - deadZone) {
            // 플레이어가 위쪽 데드존 벗어남
            this.y += (targetY - this.y) * 0.03;
        } else if (playerCenterY > screenCenterY + deadZone) {
            // 플레이어가 아래쪽 데드존 벗어남
            this.y += (targetY - this.y) * 0.05;
        }

        // 카메라 경계 제한
        if (this.x < 0) this.x = 0;
        if (this.x > WORLD_WIDTH - canvas.width) this.x = WORLD_WIDTH - canvas.width;
        if (this.y < 0) this.y = 0;
        if (this.y > WORLD_HEIGHT - canvas.height) this.y = WORLD_HEIGHT - canvas.height;
    }
};

// 데미지 텍스트 배열
const damageTexts = [];

// 데미지 텍스트 클래스
class DamageText {
    constructor(x, y, damage, color = '#ff0') {
        this.x = x;
        this.y = y;
        this.damage = damage;
        this.color = color;
        this.alpha = 1;
        this.velY = -3;
        this.life = 60;
    }

    update() {
        this.y += this.velY;
        this.velY += 0.05;
        this.life--;
        this.alpha = this.life / 60;
        return this.life > 0;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.strokeText(this.damage, this.x, this.y);
        ctx.fillText(this.damage, this.x, this.y);
        ctx.restore();
    }
}

// ===== 장비 시스템 ===== (EQUIPMENT_DEFINITIONS는 Equip/Equip.js에서 로드)

const RARITY_COLORS = {
    'D': '#AAAAAA',   // 회색
    'C': '#FFFFFF',   // 흰색
    'B': '#00FF00',   // 초록
    'A': '#0088FF',   // 파랑
    'S': '#AA00FF',   // 보라
    'SS': '#FF8800',  // 주황
    'SR': '#FF4466',  // 빨강
    'SU': '#FFD700'   // 금색
};

// 등급 순서 (높은 등급이 앞, 인덱스가 낮을수록 높은 등급)
const RARITY_ORDER = ['SU', 'SR', 'SS', 'S', 'A', 'B', 'C', 'D'];

const SLOT_NAMES = {
    helmet: '투구',
    armor: '갑옷',
    weapon: '무기',
    boots: '신발',
    // 재료 타입
    ore: '광석',
    herb: '약초',
    leather: '가죽',
    wood: '목재',
    gem: '보석',
    // 아이템 타입
    potion: '포션',
    scroll: '주문서',
    food: '음식',
    bomb: '폭탄'
};

// 장비 UI 상태
let equipmentPanelOpen = false;
let selectedInventoryIndex = -1;
let equipmentButtonBounds = { x: 0, y: 0, width: 80, height: 35 };
let selectedEquipmentTab = 'weapon'; // 현재 선택된 탭
const EQUIPMENT_TABS = ['weapon', 'helmet', 'armor', 'boots', 'material', 'item'];
const TAB_NAMES = { weapon: '무기', helmet: '투구', armor: '갑옷', boots: '신발', material: '재료', item: '아이템' };

// 탭에 따라 올바른 정의를 반환하는 헬퍼 함수
function getItemDefinition(id, tab) {
    if (tab === 'material') {
        return typeof MATERIAL_DEFINITIONS !== 'undefined' ? MATERIAL_DEFINITIONS[id] : null;
    } else if (tab === 'item') {
        return typeof ITEM_DEFINITIONS !== 'undefined' ? ITEM_DEFINITIONS[id] : null;
    } else {
        return typeof EQUIPMENT_DEFINITIONS !== 'undefined' ? EQUIPMENT_DEFINITIONS[id] : null;
    }
}

// ID로 정의를 자동 탐색하는 함수
function findDefinition(id) {
    if (typeof EQUIPMENT_DEFINITIONS !== 'undefined' && EQUIPMENT_DEFINITIONS[id]) {
        return { def: EQUIPMENT_DEFINITIONS[id], category: 'equipment' };
    }
    if (typeof MATERIAL_DEFINITIONS !== 'undefined' && MATERIAL_DEFINITIONS[id]) {
        return { def: MATERIAL_DEFINITIONS[id], category: 'material' };
    }
    if (typeof ITEM_DEFINITIONS !== 'undefined' && ITEM_DEFINITIONS[id]) {
        return { def: ITEM_DEFINITIONS[id], category: 'item' };
    }
    return null;
}

let viewingEquipmentId = null; // 상세 정보 보기 중인 장비 ID
let viewingEquipmentSlot = null; // 장착 슬롯에서 보는 경우 슬롯 이름
let inventoryScrollRow = 0; // 인벤토리 스크롤 행 위치

// 장비 아이템 배열
let equipmentItems = [];

// 플레이어 클래스
class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 32;
        this.height = 48;
        this.velX = 0;
        this.velY = 0;
        this.jumping = false;
        this.grounded = false;
        this.jumpCount = 0;
        this.maxJumps = 2;
        this.direction = 1;
        this.animFrame = 0;
        this.animTimer = 0;

        // 플랫폼 통과
        this.droppingDown = false;
        this.dropTimer = 0;

        // 사다리 타기
        this.climbing = false;
        this.onLadder = null;

        // 전투 관련
        this.hp = 100;
        this.maxHp = 100;
        this.attacking = false;
        this.attackTimer = 0;
        this.attackCooldown = 0;
        this.attackDamage = 15;
        this.invincible = false;
        this.invincibleTimer = 0;
        this.flashTimer = 0;

        // 코인
        this.coins = 0;

        // 레벨/경험치
        this.level = 1;
        this.exp = 0;
        this.expToNextLevel = 100;
        this.levelUpEffect = 0;
        this.spawnEffect = 0;

        // 번개 버프
        this.lightningBuff = false;
        this.lightningBuffTimer = 0;
        this.lightningBuffDuration = 3600; // 60초 (60fps * 60)

        // 화염구 버프
        this.fireballBuff = false;
        this.fireballBuffTimer = 0;
        this.fireballBuffDuration = 600; // 10초
        this.orbitingFireballs = [];

        // 장비 시스템
        this.equipment = {
            helmet: null,
            armor: null,
            weapon: null,
            boots: null
        };
        this.inventory = {
            weapon: [],
            helmet: [],
            armor: [],
            boots: [],
            material: [],
            item: []
        };
        this.maxInventoryPerSlot = 99; // 종류별 최대 보유 수
        this.equipmentStats = {
            attackDamage: 0,
            defense: 0,
            maxHp: 0,
            speed: 0,
            extraJump: 0
        };
    }

    // 장비 장착
    equipItem(equipmentId) {
        const item = EQUIPMENT_DEFINITIONS[equipmentId];
        if (!item) return false;

        const slot = item.type;

        // 기존 장비가 있으면 인벤토리로
        if (this.equipment[slot]) {
            this.inventory[slot].push(this.equipment[slot]);
        }

        // 새 장비 장착
        this.equipment[slot] = equipmentId;

        // 인벤토리에서 제거
        const invIndex = this.inventory[slot].indexOf(equipmentId);
        if (invIndex !== -1) {
            this.inventory[slot].splice(invIndex, 1);
        }

        this.recalculateEquipmentStats();
        return true;
    }

    // 장비 해제
    unequipItem(slot) {
        if (!this.equipment[slot]) return false;

        if (this.inventory[slot].length >= this.maxInventoryPerSlot) {
            return false;
        }

        this.inventory[slot].push(this.equipment[slot]);
        this.equipment[slot] = null;
        this.recalculateEquipmentStats();
        return true;
    }

    // 장비 스탯 재계산
    recalculateEquipmentStats() {
        this.equipmentStats = {
            attackDamage: 0,
            defense: 0,
            maxHp: 0,
            speed: 0,
            extraJump: 0
        };

        for (let slot in this.equipment) {
            const equipId = this.equipment[slot];
            if (equipId) {
                const def = EQUIPMENT_DEFINITIONS[equipId];
                if (def && def.stats) {
                    for (let stat in def.stats) {
                        if (this.equipmentStats[stat] !== undefined) {
                            this.equipmentStats[stat] += def.stats[stat];
                        }
                    }
                }
            }
        }

        // maxJumps 업데이트
        this.maxJumps = 2 + this.equipmentStats.extraJump;
    }

    // 총 공격력
    getTotalAttackDamage() {
        return this.attackDamage + this.equipmentStats.attackDamage;
    }

    // 총 방어력
    getTotalDefense() {
        return this.equipmentStats.defense;
    }

    // 총 최대 HP
    getTotalMaxHp() {
        return this.maxHp + this.equipmentStats.maxHp;
    }

    // 인벤토리에 추가 (등급 높은 순으로 정렬, 같은 등급이면 획득 순서)
    addToInventory(itemId) {
        const found = findDefinition(itemId);
        if (!found) return false;

        const item = found.def;
        const category = found.category;

        // 인벤토리 슬롯 결정
        let slot;
        if (category === 'equipment') {
            slot = item.type; // weapon, helmet, armor, boots
        } else if (category === 'material') {
            slot = 'material';
        } else if (category === 'item') {
            slot = 'item';
        } else {
            return false;
        }

        if (this.inventory[slot].length >= this.maxInventoryPerSlot) {
            return false;
        }

        // 등급 순서에 따라 삽입 위치 찾기
        const newRarityIndex = RARITY_ORDER.indexOf(item.rarity);
        let insertIndex = this.inventory[slot].length; // 기본값: 맨 뒤

        for (let i = 0; i < this.inventory[slot].length; i++) {
            const existingFound = findDefinition(this.inventory[slot][i]);
            if (!existingFound) continue;
            const existingRarityIndex = RARITY_ORDER.indexOf(existingFound.def.rarity);

            // 새 아이템의 등급이 더 높으면 (인덱스가 더 낮으면) 여기에 삽입
            if (newRarityIndex < existingRarityIndex) {
                insertIndex = i;
                break;
            }
        }

        this.inventory[slot].splice(insertIndex, 0, itemId);
        return true;
    }

    gainExp(amount) {
        this.exp += amount;

        // 레벨업 체크
        while (this.exp >= this.expToNextLevel) {
            this.exp -= this.expToNextLevel;
            this.levelUp();
        }
    }

    levelUp() {
        this.level++;
        this.expToNextLevel = Math.floor(100 * Math.pow(1.5, this.level - 1));

        // 스탯 증가
        this.maxHp += 20;
        this.hp = this.maxHp; // 풀피 회복
        this.attackDamage += 5;

        // 레벨업 이펙트
        this.levelUpEffect = 120;

        // 레벨업 텍스트
        damageTexts.push(new DamageText(
            this.x + this.width / 2,
            this.y - 30,
            'LEVEL UP!',
            '#ffff00'
        ));

        console.log(`레벨 업! Lv.${this.level} | HP: ${this.maxHp} | 공격력: ${this.attackDamage}`);
    }

    update(keys, platforms) {
        // 사다리 체크
        this.onLadder = null;
        for (let ladder of ladders) {
            if (ladder.containsPlayer(this)) {
                this.onLadder = ladder;
                break;
            }
        }

        // 사다리 타기 시작/종료
        if (this.onLadder) {
            if ((keys.up || keys.down) && !this.climbing) {
                this.climbing = true;
                this.velY = 0;
                this.velX = 0;
                // 사다리 중앙에 정렬
                this.x = this.onLadder.x + this.onLadder.width / 2 - this.width / 2;
            }
        } else {
            this.climbing = false;
        }

        // 사다리 타는 중
        if (this.climbing && this.onLadder) {
            const climbSpeed = 4;

            // 위아래 이동
            if (keys.up) {
                this.y -= climbSpeed;
                // 사다리 상단 도달
                if (this.y < this.onLadder.y - this.height + 10) {
                    this.y = this.onLadder.y - this.height;
                    this.climbing = false;
                    this.grounded = true;
                }
            }
            if (keys.down) {
                this.y += climbSpeed;
                // 사다리 하단 도달
                if (this.y + this.height > this.onLadder.y + this.onLadder.height) {
                    this.climbing = false;
                }
            }

            // 좌우로 빠져나가기 + 방향 전환
            if (keys.left) {
                this.direction = -1;
                this.x -= 3;
                if (!this.onLadder.containsPlayer(this)) {
                    this.climbing = false;
                }
            }
            if (keys.right) {
                this.direction = 1;
                this.x += 3;
                if (!this.onLadder.containsPlayer(this)) {
                    this.climbing = false;
                }
            }

            // 점프로 빠져나가기
            if (keys.space && !this.jumping) {
                this.climbing = false;
                this.velY = JUMP_FORCE * 0.7;
                this.jumping = true;
            }

            // 사다리에서는 중력 무시
            this.velY = 0;
            this.grounded = false;

            // 사다리에서도 공격 타이머/쿨다운 업데이트
            if (this.attacking) {
                this.attackTimer--;
                if (this.attackTimer <= 0) {
                    this.attacking = false;
                }
            }
            if (this.attackCooldown > 0) {
                this.attackCooldown--;
            }

            // 사다리에서도 화염구 버프 업데이트
            if (this.fireballBuff) {
                this.fireballBuffTimer--;
                for (let fb of this.orbitingFireballs) {
                    fb.update(this);
                }
                if (this.fireballBuffTimer <= 0) {
                    this.fireballBuff = false;
                    this.orbitingFireballs = [];
                    damageTexts.push(new DamageText(
                        this.x + this.width / 2,
                        this.y - 20,
                        '화염구 버프 종료',
                        '#888888'
                    ));
                }
            }

            return; // 사다리 타는 중에는 일반 이동 스킵
        }

        // 좌우 이동
        if (keys.left) {
            this.velX -= ACCELERATION;
            this.direction = -1;
        }
        if (keys.right) {
            this.velX += ACCELERATION;
            this.direction = 1;
        }

        // 마찰 적용
        this.velX *= FRICTION;

        // 최대 속도 제한 (장비 속도 보너스 적용)
        const effectiveMaxSpeed = MAX_SPEED + this.equipmentStats.speed;
        if (this.velX > effectiveMaxSpeed) this.velX = effectiveMaxSpeed;
        if (this.velX < -effectiveMaxSpeed) this.velX = -effectiveMaxSpeed;

        // 아주 작은 속도는 0으로
        if (Math.abs(this.velX) < 0.1) this.velX = 0;

        // 중력 적용
        this.velY += GRAVITY;

        // 위치 업데이트
        this.x += this.velX;
        this.y += this.velY;

        // 땅에 닿았는지 초기화
        this.grounded = false;

        // 드롭다운 타이머
        if (this.dropTimer > 0) {
            this.dropTimer--;
            if (this.dropTimer <= 0) {
                this.droppingDown = false;
            }
        }

        // 플랫폼 충돌 검사
        for (let platform of platforms) {
            if (this.collidesWith(platform)) {
                // 드롭다운 중이 아닐 때만 충돌 처리
                if (!this.droppingDown && this.velY > 0 && this.y + this.height - this.velY <= platform.y) {
                    this.y = platform.y - this.height;
                    this.velY = 0;
                    this.grounded = true;
                    this.jumpCount = 0;
                }
            }
        }

        // 월드 경계
        if (this.x < 0) this.x = 0;
        if (this.x + this.width > WORLD_WIDTH) this.x = WORLD_WIDTH - this.width;

        // 바닥
        if (this.y + this.height > WORLD_HEIGHT - 50) {
            this.y = WORLD_HEIGHT - 50 - this.height;
            this.velY = 0;
            this.grounded = true;
            this.jumpCount = 0;
        }

        // 애니메이션 업데이트
        if (Math.abs(this.velX) > 0.5) {
            this.animTimer++;
            if (this.animTimer > 8) {
                this.animTimer = 0;
                this.animFrame = (this.animFrame + 1) % 4;
            }
        } else {
            this.animFrame = 0;
        }

        // 공격 타이머
        if (this.attacking) {
            this.attackTimer--;
            if (this.attackTimer <= 0) {
                this.attacking = false;
            }
        }

        // 공격 쿨다운
        if (this.attackCooldown > 0) {
            this.attackCooldown--;
        }

        // 무적 타이머
        if (this.invincible) {
            this.invincibleTimer--;
            this.flashTimer++;
            if (this.invincibleTimer <= 0) {
                this.invincible = false;
                this.flashTimer = 0;
            }
        }

        // 레벨업 이펙트 타이머
        if (this.levelUpEffect > 0) {
            this.levelUpEffect--;
        }

        // 스폰 이펙트 타이머
        if (this.spawnEffect > 0) {
            this.spawnEffect--;
        }

        // 번개 버프 타이머
        if (this.lightningBuff) {
            this.lightningBuffTimer--;
            if (this.lightningBuffTimer <= 0) {
                this.lightningBuff = false;
                damageTexts.push(new DamageText(
                    this.x + this.width / 2,
                    this.y - 20,
                    '번개 버프 종료',
                    '#888888'
                ));
            }
        }

        // 화염구 버프 타이머
        if (this.fireballBuff) {
            this.fireballBuffTimer--;
            // 화염구 업데이트
            for (let fb of this.orbitingFireballs) {
                fb.update(this);
            }
            if (this.fireballBuffTimer <= 0) {
                this.fireballBuff = false;
                this.orbitingFireballs = [];
                damageTexts.push(new DamageText(
                    this.x + this.width / 2,
                    this.y - 20,
                    '화염구 버프 종료',
                    '#888888'
                ));
            }
        }
    }

    attack() {
        if (this.attackCooldown <= 0) {
            this.attacking = true;
            this.attackTimer = 10;
            this.attackCooldown = 12;

            // 부메랑 발사
            const boomerangX = this.x + this.width / 2 + (this.direction * 20);
            const boomerangY = this.y + this.height / 2;
            boomerangs.push(new Boomerang(boomerangX, boomerangY, this.direction, this.getTotalAttackDamage()));

            // 랜덤 번개 OFF
            // if (Math.random() < 0.5) {
            //     this.triggerLightning();
            // }

            return true;
        }
        return false;
    }

    triggerLightning() {
        // 화면에 보이는 적 찾기
        const visibleMonsters = monsters.filter(m => {
            if (!m.alive) return false;
            const screenX = m.x - camera.x;
            const screenY = m.y - camera.y;
            return screenX >= -50 && screenX <= canvas.width + 50 &&
                   screenY >= -50 && screenY <= canvas.height + 50;
        });

        if (visibleMonsters.length > 0) {
            // 랜덤하게 하나 선택
            const target = visibleMonsters[Math.floor(Math.random() * visibleMonsters.length)];
            const targetX = target.x + target.width / 2;
            const targetY = target.y + target.height / 2;

            // 노란색 번개 생성
            lightnings.push(new Lightning(targetX, targetY, this.getTotalAttackDamage() * 2, 'yellow'));

            // 데미지 적용
            target.takeDamage(this.getTotalAttackDamage() * 2, targetX);

            // 번개 텍스트 (노란색)
            damageTexts.push(new DamageText(targetX, target.y - 30, 'LIGHTNING!', '#ffff00'));
        }
    }

    activateLightningBuff() {
        this.lightningBuff = true;
        this.lightningBuffTimer = this.lightningBuffDuration;
        damageTexts.push(new DamageText(
            this.x + this.width / 2,
            this.y - 30,
            '⚡ 번개 버프! (60초)',
            '#00ffff'
        ));
    }

    // 버프 번개 발동 (타격 시 호출)
    triggerBuffLightning(target) {
        if (!this.lightningBuff || !target.alive) return;

        const targetX = target.x + target.width / 2;
        const targetY = target.y + target.height / 2;

        // 청록색 번개 생성 (버프 번개)
        lightnings.push(new Lightning(targetX, targetY, Math.floor(this.getTotalAttackDamage() * 0.5), 'cyan'));

        // 추가 데미지 적용
        target.takeDamage(Math.floor(this.getTotalAttackDamage() * 0.5), targetX);
    }

    activateFireballBuff() {
        this.fireballBuff = true;
        this.fireballBuffTimer = this.fireballBuffDuration;

        // 8개의 궤도 화염구 생성
        this.orbitingFireballs = [];
        for (let i = 0; i < 8; i++) {
            this.orbitingFireballs.push(new OrbitingFireball(i, 8));
        }

        damageTexts.push(new DamageText(
            this.x + this.width / 2,
            this.y - 30,
            '🔥 화염구! (10초)',
            '#ff6600'
        ));
    }

    getAttackHitbox() {
        const attackRange = 75;
        const attackWidth = 68;
        const attackHeight = 40;

        if (this.direction === 1) {
            return {
                x: this.x + this.width,
                y: this.y + 5,
                width: attackWidth,
                height: attackHeight
            };
        } else {
            return {
                x: this.x - attackWidth,
                y: this.y + 5,
                width: attackWidth,
                height: attackHeight
            };
        }
    }

    takeDamage(damage) {
        if (!this.invincible) {
            // 방어력 적용
            const actualDamage = Math.max(1, damage - this.getTotalDefense());
            this.hp -= actualDamage;
            this.invincible = true;
            this.invincibleTimer = 60;
            damageTexts.push(new DamageText(this.x + this.width / 2, this.y, actualDamage, '#ff4444'));

            // 넉백
            this.velX = this.direction * -5;
            this.velY = -5;

            if (this.hp <= 0) {
                this.hp = 0;
                this.respawn();
            }
        }
    }

    respawn() {
        // 미리보기 모드에서는 현재 스테이지 시작점으로 리스폰
        if (isPreviewMode && currentStageData && currentStageData.playerStart) {
            this.x = currentStageData.playerStart.x;
            this.y = currentStageData.playerStart.y;
        } else {
            this.x = 100;
            this.y = 300;
        }
        this.hp = this.getTotalMaxHp();
        this.velX = 0;
        this.velY = 0;
        this.invincible = true;
        this.invincibleTimer = 120;
    }

    jump() {
        if (this.jumpCount < this.maxJumps) {
            this.velY = JUMP_FORCE;
            this.jumping = true;
            this.jumpCount++;
        }
    }

    dropDown() {
        if (this.grounded && this.y + this.height < WORLD_HEIGHT - 50) {
            // 바닥이 아닌 플랫폼 위에 있을 때만
            this.droppingDown = true;
            this.dropTimer = 15;
            this.y += 5; // 플랫폼 아래로 살짝 이동
        }
    }

    collidesWith(obj) {
        return this.x < obj.x + obj.width &&
               this.x + this.width > obj.x &&
               this.y < obj.y + obj.height &&
               this.y + this.height > obj.y;
    }

    draw(ctx) {
        // 무적 시 깜빡임 비활성화
        // if (this.invincible && Math.floor(this.flashTimer / 4) % 2 === 0) {
        //     return;
        // }

        ctx.save();
        ctx.translate(this.x + this.width / 2, this.y);
        ctx.scale(this.direction, 1);
        ctx.translate(-this.width / 2, 0);

        // 몸통
        ctx.fillStyle = '#4a90d9';
        ctx.fillRect(4, 16, 24, 24);

        // 머리
        ctx.fillStyle = '#ffdbac';
        ctx.beginPath();
        ctx.arc(16, 12, 12, 0, Math.PI * 2);
        ctx.fill();

        // 머리카락
        ctx.fillStyle = '#4a3728';
        ctx.beginPath();
        ctx.arc(16, 8, 10, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(6, 4, 20, 6);

        // 눈
        ctx.fillStyle = '#000';
        ctx.fillRect(12, 10, 3, 4);
        ctx.fillRect(18, 10, 3, 4);

        // 팔 (공격 시 앞으로)
        ctx.fillStyle = '#ffdbac';
        if (this.attacking) {
            ctx.fillRect(24, 20, 20, 8);
            // 검
            ctx.fillStyle = '#888';
            ctx.fillRect(40, 10, 6, 30);
            ctx.fillStyle = '#ff0';
            ctx.fillRect(40, 8, 6, 4);
        } else {
            ctx.fillRect(24, 22, 8, 6);
        }

        // 다리
        ctx.fillStyle = '#3a3a3a';
        const legOffset = Math.sin(this.animFrame * Math.PI / 2) * 4;
        if (this.grounded && Math.abs(this.velX) > 0.5) {
            ctx.fillRect(6, 40, 8, 10 + legOffset);
            ctx.fillRect(18, 40, 8, 10 - legOffset);
        } else {
            ctx.fillRect(6, 40, 8, 10);
            ctx.fillRect(18, 40, 8, 10);
        }

        ctx.restore();

        // 공격 이펙트
        if (this.attacking && this.attackTimer > 5) {
            this.drawAttackEffect(ctx);
        }

        // 스폰 이펙트
        if (this.spawnEffect > 0) {
            this.drawSpawnEffect(ctx);
        }

        // 레벨업 이펙트
        if (this.levelUpEffect > 0) {
            this.drawLevelUpEffect(ctx);
        }

        // 번개 버프 이펙트
        if (this.lightningBuff) {
            this.drawLightningBuffEffect(ctx);
        }
    }

    drawLevelUpEffect(ctx) {
        ctx.save();
        const alpha = Math.min(1, this.levelUpEffect / 60);
        ctx.globalAlpha = alpha;

        // 빛나는 원형 효과
        const radius = 40 + (120 - this.levelUpEffect) * 0.5;
        const gradient = ctx.createRadialGradient(
            this.x + this.width / 2, this.y + this.height / 2, 0,
            this.x + this.width / 2, this.y + this.height / 2, radius
        );
        gradient.addColorStop(0, 'rgba(255, 255, 100, 0.8)');
        gradient.addColorStop(0.5, 'rgba(255, 200, 50, 0.4)');
        gradient.addColorStop(1, 'rgba(255, 150, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x + this.width / 2, this.y + this.height / 2, radius, 0, Math.PI * 2);
        ctx.fill();

        // 별 파티클
        ctx.fillStyle = '#ffff00';
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2 + (120 - this.levelUpEffect) * 0.05;
            const dist = 30 + Math.sin((120 - this.levelUpEffect) * 0.1 + i) * 10;
            const starX = this.x + this.width / 2 + Math.cos(angle) * dist;
            const starY = this.y + this.height / 2 + Math.sin(angle) * dist;
            ctx.font = '12px Arial';
            ctx.fillText('★', starX - 5, starY + 4);
        }

        ctx.restore();
    }

    drawSpawnEffect(ctx) {
        ctx.save();
        const progress = 1 - (this.spawnEffect / 30); // 0에서 1로 진행
        const alpha = Math.min(1, this.spawnEffect / 15);
        const flash = Math.sin(progress * Math.PI * 8) * 0.3 + 0.7; // 빠른 반짝임

        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;

        // 밝은 플래시 효과
        ctx.globalAlpha = alpha * flash * 0.6;
        const flashGradient = ctx.createRadialGradient(
            centerX, centerY, 0,
            centerX, centerY, 60
        );
        flashGradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        flashGradient.addColorStop(0.3, 'rgba(200, 230, 255, 0.8)');
        flashGradient.addColorStop(1, 'rgba(100, 200, 255, 0)');
        ctx.fillStyle = flashGradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, 60, 0, Math.PI * 2);
        ctx.fill();

        // 빛 기둥 효과
        ctx.globalAlpha = alpha;
        const pillarGradient = ctx.createLinearGradient(
            centerX, this.y + this.height + 20,
            centerX, this.y - 60
        );
        pillarGradient.addColorStop(0, 'rgba(100, 200, 255, 0)');
        pillarGradient.addColorStop(0.3, 'rgba(150, 220, 255, 0.6)');
        pillarGradient.addColorStop(0.6, 'rgba(200, 240, 255, 0.8)');
        pillarGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = pillarGradient;
        ctx.fillRect(centerX - 25, this.y - 60, 50, this.height + 80);

        // 반짝이는 별 파티클 (더 많이)
        for (let i = 0; i < 16; i++) {
            const particleProgress = (progress * 3 + i * 0.06) % 1;
            const angle = (i / 16) * Math.PI * 2;
            const dist = 15 + Math.sin(progress * Math.PI * 6 + i) * 10;
            const px = centerX + Math.cos(angle) * dist;
            const py = this.y + this.height - particleProgress * (this.height + 50);
            const twinkle = Math.sin(progress * Math.PI * 12 + i * 2) * 0.5 + 0.5;
            const size = (2 + twinkle * 3) * (1 - particleProgress);

            ctx.globalAlpha = alpha * twinkle * (1 - particleProgress);
            ctx.fillStyle = i % 2 === 0 ? '#FFFFFF' : '#AAE0FF';
            ctx.beginPath();
            ctx.arc(px, py, size, 0, Math.PI * 2);
            ctx.fill();
        }

        // 반짝이 스파크
        ctx.globalAlpha = alpha * flash;
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '14px Arial';
        for (let i = 0; i < 6; i++) {
            const sparkAngle = progress * Math.PI * 4 + (i / 6) * Math.PI * 2;
            const sparkDist = 20 + progress * 30;
            const sx = centerX + Math.cos(sparkAngle) * sparkDist;
            const sy = centerY + Math.sin(sparkAngle) * sparkDist * 0.6;
            ctx.fillText('✦', sx - 5, sy + 5);
        }

        ctx.restore();
    }

    drawAttackEffect(ctx) {
        const hitbox = this.getAttackHitbox();
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;

        // 슬래시 이펙트
        const progress = (10 - this.attackTimer) / 5;
        ctx.beginPath();
        if (this.direction === 1) {
            ctx.arc(hitbox.x, hitbox.y + hitbox.height / 2, 52, -Math.PI / 3, Math.PI / 3 * progress);
        } else {
            ctx.arc(hitbox.x + hitbox.width, hitbox.y + hitbox.height / 2, 52, Math.PI - Math.PI / 3 * progress, Math.PI + Math.PI / 3);
        }
        ctx.stroke();
        ctx.restore();
    }

    drawLightningBuffEffect(ctx) {
        ctx.save();

        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        const time = Date.now() * 0.005;

        // 전기 오라
        ctx.globalAlpha = 0.3 + Math.sin(time * 2) * 0.1;
        const gradient = ctx.createRadialGradient(centerX, centerY, 10, centerX, centerY, 40);
        gradient.addColorStop(0, 'rgba(100, 200, 255, 0.5)');
        gradient.addColorStop(0.5, 'rgba(0, 150, 255, 0.2)');
        gradient.addColorStop(1, 'rgba(0, 100, 200, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, 40, 0, Math.PI * 2);
        ctx.fill();

        // 작은 번개 파티클
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
            const angle = time + i * Math.PI / 2;
            const dist = 25 + Math.sin(time * 3 + i) * 5;
            const px = centerX + Math.cos(angle) * dist;
            const py = centerY + Math.sin(angle) * dist;

            // 작은 번개 모양
            ctx.beginPath();
            ctx.moveTo(px - 3, py - 5);
            ctx.lineTo(px + 1, py - 1);
            ctx.lineTo(px - 1, py + 1);
            ctx.lineTo(px + 3, py + 5);
            ctx.stroke();
        }

        ctx.restore();
    }
}

// 몬스터 ID로 데이터 가져오기
function getMonsterDataById(monsterId) {
    if (typeof MONSTER_DATA !== 'undefined') {
        return MONSTER_DATA.find(m => m.id === monsterId);
    }
    return null;
}

// 몬스터 클래스
class Monster {
    constructor(x, y, monsterId = 100001) {
        this.x = x;
        this.y = y;
        this.monsterId = monsterId;

        // 테이블에서 몬스터 데이터 가져오기
        const data = getMonsterDataById(monsterId);

        if (data) {
            this.type = data.type;
            this.name = data.name;
            this.width = data.width || 40;
            this.height = data.height || 36;
            this.hp = data.hp || 50;
            this.maxHp = data.hp || 50;
            this.damage = data.damage || 10;
            this.speed = data.speed || 1.5;
            this.coinCount = data.coinCount || 2;
            this.coinValue = data.coinValue || 10;
            this.expGain = data.expGain || 20;
            this.equipDropChance = data.equipDropChance || 0.08;
            this.equipMaxRarity = data.equipMaxRarity || 'C';
            this.materialDropChance = data.materialDropChance || 0.1;
            this.materialMaxRarity = data.materialMaxRarity || 'C';
            this.itemDropChance = data.itemDropChance || 0.05;
            this.itemMaxRarity = data.itemMaxRarity || 'C';
            this.isHpBig = data.isHpBig || false;
        } else {
            // 기본값 (슬라임)
            this.type = 'slime';
            this.name = '슬라임';
            this.width = 40;
            this.height = 36;
            this.hp = 50;
            this.maxHp = 50;
            this.damage = 10;
            this.speed = 1.5;
            this.coinCount = 2;
            this.coinValue = 10;
            this.expGain = 20;
            this.equipDropChance = 0.08;
            this.equipMaxRarity = 'C';
            this.materialDropChance = 0.1;
            this.materialMaxRarity = 'C';
            this.itemDropChance = 0.05;
            this.itemMaxRarity = 'C';
            this.isHpBig = false;
        }

        this.velX = 0;
        this.velY = 0;
        this.direction = 1;
        this.patrolRange = 100;
        this.startX = x;
        this.animFrame = 0;
        this.animTimer = 0;
        this.hitTimer = 0;
        this.alive = true;
        this.deathTimer = 0;

        // 고스트 특수 속성
        if (this.type === 'ghost' || this.type === 'ghostBoss' || this.type === 'ghostSlave') {
            this.floatOffset = 0;
            this.floatTimer = Math.random() * Math.PI * 2;
            this.freeRoam = true;
        }

        // ghostBoss 특수 스킬: 유령 소환
        if (this.type === 'ghostBoss') {
            this.summonTimer = 0;
            this.summonInterval = 300; // 5초 (60fps * 5)
            this.summonedGhosts = [];
            this.maxSummons = 10;
            this.pendingSpawns = [];
            // 체력 재생
            this.noHitTimer = 0;
            this.regenInterval = 300; // 5초 (60fps * 5)
        }
    }

    update(platforms) {
        if (!this.alive) {
            this.deathTimer++;
            return this.deathTimer < 30;
        }

        // 현재 서 있는 플랫폼 찾기
        let currentPlatform = null;
        const groundY = WORLD_HEIGHT - 50;

        if (this.y + this.height >= groundY - 5 && this.y + this.height <= groundY + 5) {
            // 바닥에 있음
            currentPlatform = { x: 0, width: WORLD_WIDTH, y: groundY };
        } else {
            for (let platform of platforms) {
                if (this.y + this.height >= platform.y - 5 &&
                    this.y + this.height <= platform.y + 5 &&
                    this.x + this.width > platform.x &&
                    this.x < platform.x + platform.width) {
                    currentPlatform = platform;
                    break;
                }
            }
        }

        // 넉백 중이 아닐 때만 패트롤
        if (Math.abs(this.velX) < 0.5) {
            // ghostSlave는 플레이어를 추적
            if (this.type === 'ghostSlave') {
                const playerCenterX = player.x + player.width / 2;
                const playerCenterY = player.y + player.height / 2;
                const myCenterX = this.x + this.width / 2;
                const myCenterY = this.y + this.height / 2;

                // X축 추적
                if (playerCenterX < myCenterX - 5) {
                    this.x -= this.speed * 1.5;
                    this.direction = -1;
                } else if (playerCenterX > myCenterX + 5) {
                    this.x += this.speed * 1.5;
                    this.direction = 1;
                }

                // Y축 추적 (부유하므로)
                if (playerCenterY < myCenterY - 5) {
                    this.y -= this.speed;
                } else if (playerCenterY > myCenterY + 5) {
                    this.y += this.speed;
                }

                // 월드 경계
                if (this.x < 0) this.x = 0;
                if (this.x + this.width > WORLD_WIDTH) this.x = WORLD_WIDTH - this.width;
                if (this.y < 0) this.y = 0;
                if (this.y + this.height > WORLD_HEIGHT - 50) this.y = WORLD_HEIGHT - 50 - this.height;
            } else {
                this.x += this.speed * this.direction;
            }

            // 자유 이동 몬스터 (고스트)
            if (this.freeRoam && this.type !== 'ghostSlave') {
                // 월드 경계에서만 방향 전환
                if (this.x <= 0) {
                    this.x = 0;
                    this.direction = 1;
                } else if (this.x + this.width >= WORLD_WIDTH) {
                    this.x = WORLD_WIDTH - this.width;
                    this.direction = -1;
                }
            } else if (!this.freeRoam) {
                // 플랫폼 위에 있으면 플랫폼 경계에서 방향 전환
                if (currentPlatform) {
                    if (this.x <= currentPlatform.x) {
                        this.x = currentPlatform.x;
                        this.direction = 1;
                    } else if (this.x + this.width >= currentPlatform.x + currentPlatform.width) {
                        this.x = currentPlatform.x + currentPlatform.width - this.width;
                        this.direction = -1;
                    }
                }

                // 기본 패트롤 범위도 유지
                if (this.x > this.startX + this.patrolRange) {
                    this.direction = -1;
                } else if (this.x < this.startX - this.patrolRange) {
                    this.direction = 1;
                }
            }
        } else {
            // 넉백 적용
            this.x += this.velX;
            this.velX *= 0.85; // 마찰로 감속
        }

        // 월드 경계
        if (this.x < 0) this.x = 0;
        if (this.x + this.width > WORLD_WIDTH) this.x = WORLD_WIDTH - this.width;

        // 중력 (freeRoam 몬스터는 제외)
        if (!this.freeRoam) {
            this.velY += GRAVITY;
            this.y += this.velY;

            // 플랫폼 충돌
            for (let platform of platforms) {
                if (this.collidesWith(platform)) {
                    if (this.velY > 0 && this.y + this.height - this.velY <= platform.y) {
                        this.y = platform.y - this.height;
                        this.velY = 0;
                    }
                }
            }
        }

        // 바닥 (freeRoam 몬스터는 제외)
        if (!this.freeRoam && this.y + this.height > WORLD_HEIGHT - 50) {
            this.y = WORLD_HEIGHT - 50 - this.height;
            this.velY = 0;
        }

        // 애니메이션
        this.animTimer++;
        if (this.animTimer > 15) {
            this.animTimer = 0;
            this.animFrame = (this.animFrame + 1) % 2;
        }

        // 피격 타이머
        if (this.hitTimer > 0) {
            this.hitTimer--;
        }

        // 고스트 부유 효과
        if (this.type === 'ghost' || this.type === 'ghostBoss' || this.type === 'ghostSlave') {
            this.floatTimer += 0.08;
            this.floatOffset = Math.sin(this.floatTimer) * 8;
        }

        // ghostBoss 유령 소환 스킬
        if (this.type === 'ghostBoss') {
            // 죽은 소환수 제거
            this.summonedGhosts = this.summonedGhosts.filter(g => g.alive);

            this.summonTimer++;
            if (this.summonTimer >= this.summonInterval) {
                this.summonTimer = 0;

                // 최대 10마리까지만 소환
                const canSummon = Math.min(2, this.maxSummons - this.summonedGhosts.length);
                for (let i = 0; i < canSummon; i++) {
                    // 보스 몸에서 노예 유령 생성 (좌우 오프셋)
                    const offsetX = (i === 0 ? -80 : 80);
                    const spawnX = this.x + this.width / 2 + offsetX;
                    const spawnY = this.y + 50;

                    const ghost = new Monster(spawnX, spawnY, 100005);
                    this.pendingSpawns.push(ghost);
                    this.summonedGhosts.push(ghost);

                    // 소환 이펙트 텍스트
                    damageTexts.push(new DamageText(
                        ghost.x + ghost.width / 2,
                        ghost.y,
                        '소환!',
                        '#8a2be2'
                    ));
                }
            }

            // 체력 재생 (5초간 피격 없으면 최대 체력의 10% 회복)
            this.noHitTimer++;
            if (this.noHitTimer >= this.regenInterval && this.hp < this.maxHp) {
                this.noHitTimer = 0;
                const regenAmount = Math.floor(this.maxHp * 0.1);
                this.hp = Math.min(this.hp + regenAmount, this.maxHp);
                damageTexts.push(new DamageText(
                    this.x + this.width / 2,
                    this.y - 20,
                    '+' + regenAmount,
                    '#00ff00'
                ));
            }
        }

        return true;
    }

    takeDamage(damage, attackerX) {
        this.hp -= damage;
        this.hitTimer = 10;
        // ghostBoss 재생 타이머 리셋
        if (this.type === 'ghostBoss') {
            this.noHitTimer = 0;
        }
        damageTexts.push(new DamageText(this.x + this.width / 2, this.y, damage, '#ffff00'));

        // 넉백 (공격자 반대 방향으로)
        const knockbackDir = this.x > attackerX ? 1 : -1;
        this.velX = knockbackDir * 8;
        this.velY = -5;

        if (this.hp <= 0) {
            this.alive = false;
            this.hp = 0;

            // ghostBoss 사망 시 소환된 유령들도 제거
            if (this.type === 'ghostBoss' && this.summonedGhosts) {
                this.summonedGhosts.forEach(ghost => {
                    if (ghost.alive) {
                        ghost.alive = false;
                        ghost.deathTimer = 0;
                        damageTexts.push(new DamageText(
                            ghost.x + ghost.width / 2,
                            ghost.y,
                            '소멸',
                            '#8a2be2'
                        ));
                    }
                });
                this.summonedGhosts = [];
            }

            // 코인 드랍 (테이블 데이터 사용)
            for (let i = 0; i < this.coinCount; i++) {
                coins.push(new Coin(
                    this.x + this.width / 2 - 10,
                    this.y + this.height / 2,
                    this.coinValue
                ));
            }

            // 경험치 획득 (테이블 데이터 사용)
            player.gainExp(this.expGain);
            damageTexts.push(new DamageText(
                this.x + this.width / 2,
                this.y - 20,
                '+' + this.expGain + ' EXP',
                '#00ffff'
            ));

            // 장비 드랍 (테이블 데이터 사용)
            const equipDropChance = this.equipDropChance;
            if (Math.random() < equipDropChance) {
                const droppedEquip = this.getRandomEquipmentDrop();
                if (droppedEquip) {
                    equipmentItems.push(new EquipmentItem(
                        this.x + this.width / 2 - 14,
                        this.y + this.height / 2,
                        droppedEquip
                    ));
                }
            }

            // 재료 드랍 (독립 확률)
            if (Math.random() < this.materialDropChance) {
                const droppedMaterial = this.getRandomMaterialDrop();
                if (droppedMaterial) {
                    equipmentItems.push(new EquipmentItem(
                        this.x + this.width / 2 - 14 + (Math.random() - 0.5) * 20,
                        this.y + this.height / 2,
                        droppedMaterial
                    ));
                }
            }

            // 아이템 드랍 (독립 확률)
            if (Math.random() < this.itemDropChance) {
                const droppedItem = this.getRandomItemDrop();
                if (droppedItem) {
                    equipmentItems.push(new EquipmentItem(
                        this.x + this.width / 2 - 14 + (Math.random() - 0.5) * 20,
                        this.y + this.height / 2,
                        droppedItem
                    ));
                }
            }
        }
    }

    getRandomEquipmentDrop() {
        let possibleDrops = [];
        let totalWeight = 0;

        // 몬스터별 최대 희귀도 (테이블 데이터 사용)
        const rarityOrder = ['D', 'C', 'B', 'A', 'S', 'SS', 'SR', 'SU'];
        const maxRarityIndex = rarityOrder.indexOf(this.equipMaxRarity);

        for (let id in EQUIPMENT_DEFINITIONS) {
            const def = EQUIPMENT_DEFINITIONS[id];
            const rarityIndex = rarityOrder.indexOf(def.rarity);

            if (rarityIndex <= maxRarityIndex) {
                possibleDrops.push({ id, weight: def.dropWeight });
                totalWeight += def.dropWeight;
            }
        }

        let roll = Math.random() * totalWeight;
        for (let drop of possibleDrops) {
            roll -= drop.weight;
            if (roll <= 0) {
                return drop.id;
            }
        }

        return possibleDrops.length > 0 ? possibleDrops[0].id : null;
    }

    getRandomMaterialDrop() {
        if (typeof MATERIAL_DEFINITIONS === 'undefined') return null;

        let possibleDrops = [];
        let totalWeight = 0;

        const rarityOrder = ['D', 'C', 'B', 'A', 'S', 'SS', 'SR', 'SU'];
        const maxRarityIndex = rarityOrder.indexOf(this.materialMaxRarity);

        for (let id in MATERIAL_DEFINITIONS) {
            const def = MATERIAL_DEFINITIONS[id];
            const rarityIndex = rarityOrder.indexOf(def.rarity);

            if (rarityIndex <= maxRarityIndex) {
                possibleDrops.push({ id, weight: def.dropWeight });
                totalWeight += def.dropWeight;
            }
        }

        let roll = Math.random() * totalWeight;
        for (let drop of possibleDrops) {
            roll -= drop.weight;
            if (roll <= 0) {
                return drop.id;
            }
        }

        return possibleDrops.length > 0 ? possibleDrops[0].id : null;
    }

    getRandomItemDrop() {
        if (typeof ITEM_DEFINITIONS === 'undefined') return null;

        let possibleDrops = [];
        let totalWeight = 0;

        const rarityOrder = ['D', 'C', 'B', 'A', 'S', 'SS', 'SR', 'SU'];
        const maxRarityIndex = rarityOrder.indexOf(this.itemMaxRarity);

        for (let id in ITEM_DEFINITIONS) {
            const def = ITEM_DEFINITIONS[id];
            const rarityIndex = rarityOrder.indexOf(def.rarity);

            if (rarityIndex <= maxRarityIndex) {
                possibleDrops.push({ id, weight: def.dropWeight });
                totalWeight += def.dropWeight;
            }
        }

        let roll = Math.random() * totalWeight;
        for (let drop of possibleDrops) {
            roll -= drop.weight;
            if (roll <= 0) {
                return drop.id;
            }
        }

        return possibleDrops.length > 0 ? possibleDrops[0].id : null;
    }

    collidesWith(obj) {
        return this.x < obj.x + obj.width &&
               this.x + this.width > obj.x &&
               this.y < obj.y + obj.height &&
               this.y + this.height > obj.y;
    }

    draw(ctx) {
        ctx.save();

        // 피격 시 빨갛게
        if (this.hitTimer > 0) {
            ctx.filter = 'brightness(2) saturate(2)';
        }

        // 죽었을 때 페이드아웃
        if (!this.alive) {
            ctx.globalAlpha = 1 - this.deathTimer / 30;
        }

        ctx.translate(this.x + this.width / 2, this.y);
        ctx.scale(this.direction, 1);
        ctx.translate(-this.width / 2, 0);

        // 기본 크기 대비 스케일 계산
        const baseSize = { slime: { w: 40, h: 36 }, mushroom: { w: 36, h: 44 }, ghost: { w: 38, h: 46 }, ghostBoss: { w: 38, h: 46 }, ghostSlave: { w: 38, h: 46 } };
        const base = baseSize[this.type] || { w: 40, h: 36 };
        const scaleX = this.width / base.w;
        const scaleY = this.height / base.h;
        ctx.scale(scaleX, scaleY);

        if (this.type === 'slime') {
            this.drawSlime(ctx);
        } else if (this.type === 'mushroom') {
            this.drawMushroom(ctx);
        } else if (this.type === 'ghost') {
            this.drawGhost(ctx);
        } else if (this.type === 'ghostBoss') {
            this.drawGhostBoss(ctx);
        } else if (this.type === 'ghostSlave') {
            this.drawGhostSlave(ctx);
        }

        ctx.restore();

        // HP 바 (isHpBig가 true인 몬스터는 화면 중앙에 표시)
        if (this.alive && this.hp < this.maxHp && !this.isHpBig) {
            this.drawHpBar(ctx);
        }
    }

    drawSlime(ctx) {
        const bounce = Math.sin(this.animFrame * Math.PI) * 3;

        // 몸통
        ctx.fillStyle = '#5cb85c';
        ctx.beginPath();
        ctx.ellipse(20, 28 - bounce, 20, 14 + bounce, 0, 0, Math.PI * 2);
        ctx.fill();

        // 하이라이트
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath();
        ctx.ellipse(12, 20 - bounce, 6, 4, -0.3, 0, Math.PI * 2);
        ctx.fill();

        // 눈
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(12, 26 - bounce, 3, 0, Math.PI * 2);
        ctx.arc(26, 26 - bounce, 3, 0, Math.PI * 2);
        ctx.fill();

        // 입
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(19, 30 - bounce, 5, 0.2, Math.PI - 0.2);
        ctx.stroke();
    }

    drawMushroom(ctx) {
        const sway = Math.sin(this.animFrame * Math.PI) * 2;

        // 줄기
        ctx.fillStyle = '#f5deb3';
        ctx.fillRect(10, 24, 16, 20);

        // 갓
        ctx.fillStyle = '#d2691e';
        ctx.beginPath();
        ctx.ellipse(18, 20 + sway, 18, 16, 0, Math.PI, Math.PI * 2);
        ctx.fill();

        // 갓 무늬
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(10, 12 + sway, 4, 0, Math.PI * 2);
        ctx.arc(24, 14 + sway, 3, 0, Math.PI * 2);
        ctx.arc(16, 8 + sway, 3, 0, Math.PI * 2);
        ctx.fill();

        // 눈
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(12, 30, 2, 0, Math.PI * 2);
        ctx.arc(24, 30, 2, 0, Math.PI * 2);
        ctx.fill();

        // 입 (화난 표정)
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(14, 36);
        ctx.lineTo(18, 34);
        ctx.lineTo(22, 36);
        ctx.stroke();
    }

    drawGhost(ctx) {
        const float = this.floatOffset || 0;
        const wave = Math.sin(this.animTimer * 0.2) * 3;

        ctx.save();
        ctx.translate(0, float);

        // 반투명 효과
        ctx.globalAlpha = 0.8;

        // 몸통 (유령 형태)
        ctx.fillStyle = '#e8e8ff';
        ctx.beginPath();
        ctx.moveTo(19, 46);
        // 물결치는 하단
        ctx.lineTo(5 + wave, 46);
        ctx.lineTo(8, 40);
        ctx.lineTo(2 + wave, 46);
        ctx.lineTo(0, 38);
        // 왼쪽 면
        ctx.quadraticCurveTo(-2, 20, 8, 8);
        // 상단 (둥근 머리)
        ctx.quadraticCurveTo(19, -2, 30, 8);
        // 오른쪽 면
        ctx.quadraticCurveTo(40, 20, 38, 38);
        ctx.lineTo(36 - wave, 46);
        ctx.lineTo(30, 40);
        ctx.lineTo(33 + wave, 46);
        ctx.lineTo(26, 40);
        ctx.lineTo(19, 46);
        ctx.closePath();
        ctx.fill();

        // 외곽선
        ctx.strokeStyle = 'rgba(150, 150, 200, 0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 빛나는 효과
        ctx.shadowColor = '#aaaaff';
        ctx.shadowBlur = 15;

        // 눈 (빨간 눈)
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ff3333';
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.ellipse(12, 22, 5, 6, 0, 0, Math.PI * 2);
        ctx.ellipse(26, 22, 5, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // 눈 하이라이트
        ctx.fillStyle = '#fff';
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(10, 20, 2, 0, Math.PI * 2);
        ctx.arc(24, 20, 2, 0, Math.PI * 2);
        ctx.fill();

        // 입 (무서운 표정)
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.moveTo(14, 32);
        ctx.lineTo(16, 36);
        ctx.lineTo(19, 33);
        ctx.lineTo(22, 36);
        ctx.lineTo(24, 32);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    drawGhostBoss(ctx) {
        const float = this.floatOffset || 0;
        const wave = Math.sin(this.animTimer * 0.2) * 3;

        ctx.save();
        ctx.translate(0, float);

        // 반투명 효과
        ctx.globalAlpha = 0.85;

        // 몸통 (보스 유령 - 더 어두운 보라색)
        ctx.fillStyle = '#6a0dad';
        ctx.beginPath();
        ctx.moveTo(19, 46);
        ctx.lineTo(5 + wave, 46);
        ctx.lineTo(8, 40);
        ctx.lineTo(2 + wave, 46);
        ctx.lineTo(0, 38);
        ctx.quadraticCurveTo(-2, 20, 8, 8);
        ctx.quadraticCurveTo(19, -2, 30, 8);
        ctx.quadraticCurveTo(40, 20, 38, 38);
        ctx.lineTo(36 - wave, 46);
        ctx.lineTo(30, 40);
        ctx.lineTo(33 + wave, 46);
        ctx.lineTo(26, 40);
        ctx.lineTo(19, 46);
        ctx.closePath();
        ctx.fill();

        // 외곽선 (보라색 빛)
        ctx.strokeStyle = 'rgba(138, 43, 226, 0.8)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 왕관
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.moveTo(8, 8);
        ctx.lineTo(10, -2);
        ctx.lineTo(14, 4);
        ctx.lineTo(19, -4);
        ctx.lineTo(24, 4);
        ctx.lineTo(28, -2);
        ctx.lineTo(30, 8);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#daa520';
        ctx.lineWidth = 1;
        ctx.stroke();

        // 빛나는 효과
        ctx.shadowColor = '#8a2be2';
        ctx.shadowBlur = 20;

        // 눈 (노란 눈)
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffff00';
        ctx.shadowColor = '#ffff00';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.ellipse(12, 22, 5, 6, 0, 0, Math.PI * 2);
        ctx.ellipse(26, 22, 5, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // 눈 하이라이트
        ctx.fillStyle = '#fff';
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(10, 20, 2, 0, Math.PI * 2);
        ctx.arc(24, 20, 2, 0, Math.PI * 2);
        ctx.fill();

        // 입 (무서운 표정)
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.moveTo(12, 32);
        ctx.lineTo(15, 38);
        ctx.lineTo(19, 34);
        ctx.lineTo(23, 38);
        ctx.lineTo(26, 32);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    drawGhostSlave(ctx) {
        const float = this.floatOffset || 0;
        const wave = Math.sin(this.animTimer * 0.2) * 3;

        ctx.save();
        ctx.translate(0, float);

        // 반투명 효과
        ctx.globalAlpha = 0.7;

        // 몸통 (노예 유령 - 초록빛 유령)
        ctx.fillStyle = '#20b2aa';
        ctx.beginPath();
        ctx.moveTo(19, 46);
        ctx.lineTo(5 + wave, 46);
        ctx.lineTo(8, 40);
        ctx.lineTo(2 + wave, 46);
        ctx.lineTo(0, 38);
        ctx.quadraticCurveTo(-2, 20, 8, 8);
        ctx.quadraticCurveTo(19, -2, 30, 8);
        ctx.quadraticCurveTo(40, 20, 38, 38);
        ctx.lineTo(36 - wave, 46);
        ctx.lineTo(30, 40);
        ctx.lineTo(33 + wave, 46);
        ctx.lineTo(26, 40);
        ctx.lineTo(19, 46);
        ctx.closePath();
        ctx.fill();

        // 외곽선
        ctx.strokeStyle = 'rgba(0, 139, 139, 0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 빛나는 효과
        ctx.shadowColor = '#20b2aa';
        ctx.shadowBlur = 10;

        // 눈 (빨간 눈)
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ff3333';
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.ellipse(12, 22, 4, 5, 0, 0, Math.PI * 2);
        ctx.ellipse(26, 22, 4, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // 눈 하이라이트
        ctx.fillStyle = '#fff';
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(10, 20, 1.5, 0, Math.PI * 2);
        ctx.arc(24, 20, 1.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    drawHpBar(ctx) {
        const barWidth = 40;
        const barHeight = 6;
        const x = this.x;
        const y = this.y - 12;

        // 배경
        ctx.fillStyle = '#333';
        ctx.fillRect(x, y, barWidth, barHeight);

        // HP
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(x, y, barWidth * (this.hp / this.maxHp), barHeight);

        // 테두리
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, barWidth, barHeight);
    }
}

// 플랫폼 클래스
class Platform {
    constructor(x, y, width, height, color = '#8B4513') {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.color = color;
    }

    draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);

        ctx.fillStyle = '#228B22';
        ctx.fillRect(this.x, this.y, this.width, 8);

        ctx.strokeStyle = '#5D3A1A';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x, this.y, this.width, this.height);
    }
}

// 배경 구름
class Cloud {
    constructor(x, y, size) {
        this.x = x;
        this.y = y;
        this.size = size;
        this.speed = 0.2 + Math.random() * 0.3;
    }

    update() {
        this.x -= this.speed;
        if (this.x + this.size * 3 < -200) {
            this.x = WORLD_WIDTH + 100;
        }
    }

    draw(ctx) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.arc(this.x + this.size, this.y - this.size * 0.3, this.size * 0.8, 0, Math.PI * 2);
        ctx.arc(this.x + this.size * 1.8, this.y, this.size * 0.9, 0, Math.PI * 2);
        ctx.fill();
    }
}

// 코인 클래스
class Coin {
    constructor(x, y, value = 10) {
        this.x = x;
        this.y = y;
        this.width = 20;
        this.height = 20;
        this.value = value;
        this.collected = false;
        this.animFrame = 0;
        this.animTimer = 0;
        this.velY = -8; // 위로 튀어오름
        this.velX = (Math.random() - 0.5) * 4; // 좌우로 약간 퍼짐
        this.grounded = false;
        this.lifeTime = 600; // 10초 후 사라짐
    }

    update() {
        if (this.collected) return false;

        this.lifeTime--;
        if (this.lifeTime <= 0) return false;

        // 물리
        if (!this.grounded) {
            this.velY += 0.4;
            this.y += this.velY;
            this.x += this.velX;

            // 바닥 충돌
            if (this.y > WORLD_HEIGHT - 50 - this.height) {
                this.y = WORLD_HEIGHT - 50 - this.height;
                this.velY = 0;
                this.velX = 0;
                this.grounded = true;
            }
        }

        // 애니메이션
        this.animTimer++;
        if (this.animTimer > 4) {
            this.animTimer = 0;
            this.animFrame = (this.animFrame + 1) % 8;
        }

        return true;
    }

    draw(ctx) {
        if (this.collected) return;

        ctx.save();

        // 깜빡임 (사라지기 전)
        if (this.lifeTime < 120 && Math.floor(this.lifeTime / 10) % 2 === 0) {
            ctx.globalAlpha = 0.5;
        }

        // 빛나는 효과
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 8;

        // 코인 회전 효과 (폭 변화)
        const scaleX = Math.cos(this.animFrame * Math.PI / 4);
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;

        ctx.translate(centerX, centerY);
        ctx.scale(scaleX, 1);

        // 코인 외곽
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();

        // 코인 내부
        ctx.fillStyle = '#ffec8b';
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, Math.PI * 2);
        ctx.fill();

        // $ 표시
        if (Math.abs(scaleX) > 0.3) {
            ctx.fillStyle = '#daa520';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('$', 0, 0);
        }

        ctx.restore();
    }

    collidesWith(player) {
        return !this.collected &&
               player.x < this.x + this.width &&
               player.x + player.width > this.x &&
               player.y < this.y + this.height &&
               player.y + player.height > this.y;
    }

    collect() {
        if (this.collected) return 0;
        this.collected = true;
        return this.value;
    }
}

// 코인 배열
let coins = [];

// 부메랑 배열
let boomerangs = [];

// 스포너 배열
let spawners = [];

// 번개 배열
let lightnings = [];

// 번개 클래스
class Lightning {
    constructor(targetX, targetY, damage, color = 'cyan') {
        this.x = targetX;
        this.y = targetY;
        this.damage = damage;
        this.color = color; // 'cyan' or 'yellow'
        this.duration = 20;
        this.timer = this.duration;
        this.segments = [];
        this.generateSegments();
    }

    generateSegments() {
        // 번개 세그먼트 생성 (화면 상단에서 타겟까지)
        const startY = 0;
        const endY = this.y;
        let currentX = this.x;
        let currentY = startY;

        this.segments = [];
        const segmentCount = 8;
        const segmentHeight = (endY - startY) / segmentCount;

        for (let i = 0; i < segmentCount; i++) {
            const nextX = this.x + (Math.random() - 0.5) * 60;
            const nextY = currentY + segmentHeight;
            this.segments.push({
                x1: currentX,
                y1: currentY,
                x2: nextX,
                y2: nextY
            });
            currentX = nextX;
            currentY = nextY;
        }
        // 마지막 세그먼트는 정확히 타겟으로
        this.segments.push({
            x1: currentX,
            y1: currentY,
            x2: this.x,
            y2: this.y
        });
    }

    update() {
        this.timer--;
        // 번개 지글거림 효과
        if (this.timer % 3 === 0) {
            this.generateSegments();
        }
        return this.timer > 0;
    }

    draw(ctx) {
        ctx.save();

        const alpha = this.timer / this.duration;

        // 색상별 설정
        let glowColor, innerColor, branchColor, impactColor;
        if (this.color === 'yellow') {
            glowColor = '#ffff00';
            innerColor = `rgba(255, 255, 200, ${alpha})`;
            branchColor = `rgba(255, 220, 100, ${alpha * 0.7})`;
            impactColor = { r: 255, g: 220, b: 100 };
        } else {
            glowColor = '#00ffff';
            innerColor = `rgba(200, 255, 255, ${alpha})`;
            branchColor = `rgba(150, 200, 255, ${alpha * 0.7})`;
            impactColor = { r: 100, g: 200, b: 255 };
        }

        // 번개 광채
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 30;

        // 메인 번개
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        for (let seg of this.segments) {
            ctx.moveTo(seg.x1, seg.y1);
            ctx.lineTo(seg.x2, seg.y2);
        }
        ctx.stroke();

        // 내부 번개 (더 밝은 색)
        ctx.strokeStyle = innerColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let seg of this.segments) {
            ctx.moveTo(seg.x1, seg.y1);
            ctx.lineTo(seg.x2, seg.y2);
        }
        ctx.stroke();

        // 분기 번개
        ctx.strokeStyle = branchColor;
        ctx.lineWidth = 1;
        for (let i = 2; i < this.segments.length - 1; i += 2) {
            const seg = this.segments[i];
            const branchDir = Math.random() > 0.5 ? 1 : -1;
            ctx.beginPath();
            ctx.moveTo(seg.x2, seg.y2);
            ctx.lineTo(seg.x2 + branchDir * 30, seg.y2 + 20);
            ctx.stroke();
        }

        // 타격 지점 효과
        ctx.globalAlpha = alpha;
        const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, 40);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
        gradient.addColorStop(0.3, `rgba(${impactColor.r}, ${impactColor.g}, ${impactColor.b}, 0.5)`);
        gradient.addColorStop(1, `rgba(${impactColor.r}, ${impactColor.g}, ${impactColor.b}, 0)`);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 40, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

// 궤도 화염구 클래스
class OrbitingFireball {
    constructor(index, total) {
        this.index = index;
        this.total = total;
        this.angle = (index / total) * Math.PI * 2;
        this.orbitRadius = 60;
        this.rotationSpeed = 0.05;
        this.size = 16;
        this.damage = 8;
        this.hitCooldowns = new Map(); // 몬스터별 히트 쿨다운
        this.hitCooldownTime = 30; // 0.5초 쿨다운
        this.x = 0;
        this.y = 0;
        this.particleTimer = 0;
        this.particles = [];
    }

    update(player) {
        // 궤도 회전
        this.angle += this.rotationSpeed;

        // 플레이어 중심으로 위치 계산
        const centerX = player.x + player.width / 2;
        const centerY = player.y + player.height / 2;
        this.x = centerX + Math.cos(this.angle) * this.orbitRadius;
        this.y = centerY + Math.sin(this.angle) * this.orbitRadius;

        // 히트 쿨다운 감소
        for (let [monster, cooldown] of this.hitCooldowns) {
            if (cooldown > 0) {
                this.hitCooldowns.set(monster, cooldown - 1);
            }
        }

        // 파티클 업데이트
        this.particleTimer++;
        if (this.particleTimer > 2) {
            this.particleTimer = 0;
            this.particles.push({
                x: this.x + (Math.random() - 0.5) * 8,
                y: this.y + (Math.random() - 0.5) * 8,
                life: 15,
                size: 4 + Math.random() * 4
            });
        }
        this.particles = this.particles.filter(p => {
            p.life--;
            p.y -= 1;
            p.size *= 0.9;
            return p.life > 0;
        });

        // 몬스터와 충돌 체크
        for (let monster of monsters) {
            if (monster.alive && this.collidesWith(monster)) {
                const cooldown = this.hitCooldowns.get(monster) || 0;
                if (cooldown <= 0) {
                    monster.takeDamage(this.damage, this.x);
                    this.hitCooldowns.set(monster, this.hitCooldownTime);
                    // 화염 히트 이펙트
                    damageTexts.push(new DamageText(
                        monster.x + monster.width / 2,
                        monster.y - 10,
                        '🔥',
                        '#ff4400'
                    ));
                }
            }
        }
    }

    collidesWith(obj) {
        const dx = this.x - (obj.x + obj.width / 2);
        const dy = this.y - (obj.y + obj.height / 2);
        const dist = Math.sqrt(dx * dx + dy * dy);
        return dist < this.size + Math.max(obj.width, obj.height) / 2;
    }

    draw(ctx) {
        // 파티클 그리기
        for (let p of this.particles) {
            ctx.save();
            ctx.globalAlpha = p.life / 15;
            ctx.fillStyle = `hsl(${20 + Math.random() * 20}, 100%, ${50 + Math.random() * 30}%)`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        ctx.save();

        // 외부 광채
        ctx.shadowColor = '#ff4400';
        ctx.shadowBlur = 20;

        // 화염구 외곽 (주황색)
        const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size);
        gradient.addColorStop(0, '#ffff00');
        gradient.addColorStop(0.3, '#ffaa00');
        gradient.addColorStop(0.6, '#ff6600');
        gradient.addColorStop(1, '#ff3300');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();

        // 내부 코어 (밝은 노란색)
        const coreGradient = ctx.createRadialGradient(this.x - 3, this.y - 3, 0, this.x, this.y, this.size * 0.5);
        coreGradient.addColorStop(0, '#ffffff');
        coreGradient.addColorStop(0.5, '#ffff88');
        coreGradient.addColorStop(1, 'transparent');
        ctx.fillStyle = coreGradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * 0.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

// 스포너 클래스
class Spawner {
    constructor(x, y, monsterId = 100003, spawnInterval = 300, maxMonsters = 2) {
        this.x = x;
        this.y = y;
        this.width = 60;
        this.height = 80;
        this.monsterId = monsterId;
        this.spawnTimer = 0;
        this.spawnInterval = spawnInterval; // 프레임 단위 (60fps 기준)
        this.maxMonsters = maxMonsters; // 최대 스폰 몬스터 수
        this.spawnedMonsters = [];
        this.animFrame = 0;
        this.animTimer = 0;
        this.spawning = false;
        this.spawnEffect = 0;
    }

    update() {
        // 애니메이션
        this.animTimer++;
        if (this.animTimer > 8) {
            this.animTimer = 0;
            this.animFrame = (this.animFrame + 1) % 4;
        }

        // 죽은 몬스터 제거
        this.spawnedMonsters = this.spawnedMonsters.filter(m => m.alive);

        // 스폰 타이머
        this.spawnTimer++;
        if (this.spawnTimer >= this.spawnInterval && this.spawnedMonsters.length < this.maxMonsters) {
            this.spawn();
            this.spawnTimer = 0;
        }

        // 스폰 이펙트
        if (this.spawnEffect > 0) {
            this.spawnEffect--;
        }
    }

    spawn() {
        const monster = new Monster(this.x + this.width / 2 - 20, this.y + 20, this.monsterId);
        monsters.push(monster);
        this.spawnedMonsters.push(monster);
        this.spawning = true;
        this.spawnEffect = 30;
    }

    draw(ctx) {
        ctx.save();

        // 포탈/소환진 베이스
        const gradient = ctx.createRadialGradient(
            this.x + this.width / 2, this.y + this.height - 10, 5,
            this.x + this.width / 2, this.y + this.height - 10, 35
        );
        gradient.addColorStop(0, 'rgba(100, 0, 150, 0.8)');
        gradient.addColorStop(0.5, 'rgba(150, 50, 200, 0.5)');
        gradient.addColorStop(1, 'rgba(100, 0, 150, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.ellipse(this.x + this.width / 2, this.y + this.height - 10, 35, 12, 0, 0, Math.PI * 2);
        ctx.fill();

        // 소환진 링
        ctx.strokeStyle = 'rgba(200, 100, 255, 0.7)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 2; i++) {
            const radius = 25 + i * 8 + Math.sin(this.animFrame * Math.PI / 2) * 3;
            ctx.beginPath();
            ctx.ellipse(this.x + this.width / 2, this.y + this.height - 10, radius, radius * 0.35, 0, 0, Math.PI * 2);
            ctx.stroke();
        }

        // 스포너 기둥 (어두운 석상)
        ctx.fillStyle = '#3a3a4a';
        ctx.fillRect(this.x + 15, this.y + 10, 30, 60);

        // 기둥 장식
        ctx.fillStyle = '#2a2a3a';
        ctx.fillRect(this.x + 12, this.y + 5, 36, 10);
        ctx.fillRect(this.x + 12, this.y + 60, 36, 10);

        // 마법 문양
        ctx.strokeStyle = '#9933ff';
        ctx.lineWidth = 2;
        const glowIntensity = 0.5 + Math.sin(this.animTimer * 0.3) * 0.3;
        ctx.globalAlpha = glowIntensity;

        // 눈 문양
        ctx.beginPath();
        ctx.arc(this.x + 30, this.y + 35, 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#ff33ff';
        ctx.beginPath();
        ctx.arc(this.x + 30, this.y + 35, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 1;

        // 스폰 이펙트
        if (this.spawnEffect > 0) {
            ctx.globalAlpha = this.spawnEffect / 30;

            // 빛 기둥
            const beamGradient = ctx.createLinearGradient(
                this.x + this.width / 2, this.y - 20,
                this.x + this.width / 2, this.y + this.height
            );
            beamGradient.addColorStop(0, 'rgba(200, 100, 255, 0)');
            beamGradient.addColorStop(0.5, 'rgba(200, 100, 255, 0.8)');
            beamGradient.addColorStop(1, 'rgba(200, 100, 255, 0)');
            ctx.fillStyle = beamGradient;
            ctx.fillRect(this.x + 20, this.y - 20, 20, this.height + 20);

            // 파티클
            for (let i = 0; i < 5; i++) {
                const px = this.x + this.width / 2 + Math.sin(this.spawnEffect * 0.5 + i) * 20;
                const py = this.y + this.height - this.spawnEffect * 2 - i * 10;
                ctx.fillStyle = '#cc66ff';
                ctx.beginPath();
                ctx.arc(px, py, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.restore();
    }
}

// 부메랑 클래스
class Boomerang {
    constructor(x, y, direction, damage) {
        this.x = x;
        this.y = y;
        this.width = 30;
        this.height = 30;
        this.direction = direction;
        this.damage = damage;
        this.speed = 12;
        this.maxDistance = 250;
        this.traveledDistance = 0;
        this.returning = false;
        this.rotation = 0;
        this.hitMonsters = new Set(); // 이미 맞은 몬스터 추적
        this.alive = true;
    }

    update(player) {
        // 회전
        this.rotation += 0.4;

        if (!this.returning) {
            // 나가는 중
            this.x += this.speed * this.direction;
            this.traveledDistance += this.speed;

            // 최대 거리 도달 시 복귀
            if (this.traveledDistance >= this.maxDistance) {
                this.returning = true;
                this.hitMonsters.clear(); // 복귀 시 다시 타격 가능
            }
        } else {
            // 플레이어에게 복귀
            const dx = player.x + player.width / 2 - this.x;
            const dy = player.y + player.height / 2 - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 20) {
                // 플레이어에게 도달하면 사라짐
                this.alive = false;
            } else {
                // 플레이어 방향으로 이동
                this.x += (dx / dist) * this.speed;
                this.y += (dy / dist) * this.speed;
            }
        }

        // 월드 경계 체크
        if (this.x < -50 || this.x > WORLD_WIDTH + 50) {
            this.alive = false;
        }

        return this.alive;
    }

    collidesWith(obj) {
        const centerX = this.x;
        const centerY = this.y;
        const radius = 15;

        return centerX + radius > obj.x &&
               centerX - radius < obj.x + obj.width &&
               centerY + radius > obj.y &&
               centerY - radius < obj.y + obj.height;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);

        // 부메랑 모양 (V자 형태)
        ctx.fillStyle = '#8B4513';
        ctx.strokeStyle = '#5D3A1A';
        ctx.lineWidth = 2;

        ctx.beginPath();
        // 부메랑 V 형태
        ctx.moveTo(-12, -3);
        ctx.lineTo(0, -8);
        ctx.lineTo(12, -3);
        ctx.lineTo(12, 3);
        ctx.lineTo(0, 0);
        ctx.lineTo(-12, 3);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 하이라이트
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        ctx.ellipse(-6, -2, 4, 2, -0.3, 0, Math.PI * 2);
        ctx.fill();

        // 빛나는 효과 (복귀 중일 때)
        if (this.returning) {
            ctx.shadowColor = '#ffd700';
            ctx.shadowBlur = 10;
        }

        ctx.restore();

        // 궤적 효과
        ctx.save();
        ctx.globalAlpha = 0.3;
        for (let i = 1; i <= 3; i++) {
            ctx.beginPath();
            ctx.arc(
                this.x - this.direction * i * 8 * (this.returning ? -0.5 : 1),
                this.y,
                8 - i * 2,
                0,
                Math.PI * 2
            );
            ctx.fillStyle = '#daa520';
            ctx.fill();
        }
        ctx.restore();
    }
}

// 아이템 클래스
class Item {
    constructor(x, y, type = 'potion') {
        this.x = x;
        this.y = y;
        this.width = 24;
        this.height = 28;
        this.type = type;
        this.collected = false;
        this.animFrame = 0;
        this.animTimer = 0;
        this.floatOffset = 0;

        // 아이템 타입별 효과
        if (type === 'potion') {
            this.healAmount = 30;
            this.color = '#ff4466';
        } else if (type === 'lightning') {
            this.color = '#00ffff';
        } else if (type === 'fireball') {
            this.color = '#ff6600';
        }
    }

    update() {
        if (this.collected) return false;

        this.animTimer++;
        if (this.animTimer > 3) {
            this.animTimer = 0;
            this.animFrame++;
        }
        // 위아래로 둥둥 떠다니는 효과
        this.floatOffset = Math.sin(this.animFrame * 0.2) * 5;

        return true;
    }

    draw(ctx) {
        if (this.collected) return;

        const drawY = this.y + this.floatOffset;

        ctx.save();

        // 빛나는 효과
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 10 + Math.sin(this.animFrame * 0.3) * 5;

        if (this.type === 'potion') {
            // 물약 병
            // 병 몸통
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.moveTo(this.x + 4, drawY + 10);
            ctx.lineTo(this.x + 4, drawY + 24);
            ctx.quadraticCurveTo(this.x + 12, drawY + 30, this.x + 20, drawY + 24);
            ctx.lineTo(this.x + 20, drawY + 10);
            ctx.closePath();
            ctx.fill();

            // 하이라이트
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.beginPath();
            ctx.ellipse(this.x + 8, drawY + 16, 3, 5, 0, 0, Math.PI * 2);
            ctx.fill();

            // 병 목
            ctx.fillStyle = '#ddd';
            ctx.fillRect(this.x + 8, drawY + 2, 8, 10);

            // 코르크
            ctx.fillStyle = '#8B4513';
            ctx.fillRect(this.x + 7, drawY, 10, 5);

            ctx.restore();

            // 하트 아이콘
            ctx.fillStyle = '#fff';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('♥', this.x + 12, drawY - 5);
            ctx.textAlign = 'left';
        } else if (this.type === 'lightning') {
            // 번개 오브 (구체 형태)
            const centerX = this.x + 12;
            const centerY = drawY + 14;

            // 외부 광채
            const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 18);
            gradient.addColorStop(0, 'rgba(100, 200, 255, 0.8)');
            gradient.addColorStop(0.5, 'rgba(0, 150, 255, 0.4)');
            gradient.addColorStop(1, 'rgba(0, 100, 200, 0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(centerX, centerY, 18, 0, Math.PI * 2);
            ctx.fill();

            // 구체 본체
            const orbGradient = ctx.createRadialGradient(centerX - 3, centerY - 3, 0, centerX, centerY, 12);
            orbGradient.addColorStop(0, '#ffffff');
            orbGradient.addColorStop(0.3, '#88ddff');
            orbGradient.addColorStop(0.7, '#00aaff');
            orbGradient.addColorStop(1, '#0066cc');
            ctx.fillStyle = orbGradient;
            ctx.beginPath();
            ctx.arc(centerX, centerY, 12, 0, Math.PI * 2);
            ctx.fill();

            // 번개 심볼
            ctx.fillStyle = '#ffff00';
            ctx.shadowColor = '#ffff00';
            ctx.shadowBlur = 8;
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('⚡', centerX, centerY);

            // 작은 전기 파티클
            ctx.strokeStyle = '#00ffff';
            ctx.lineWidth = 1;
            for (let i = 0; i < 3; i++) {
                const angle = (this.animFrame * 0.5 + i * 2.1) % (Math.PI * 2);
                const dist = 14 + Math.sin(this.animFrame * 0.2 + i) * 3;
                const px = centerX + Math.cos(angle) * dist;
                const py = centerY + Math.sin(angle) * dist;
                ctx.beginPath();
                ctx.arc(px, py, 2, 0, Math.PI * 2);
                ctx.stroke();
            }

            ctx.restore();

            // 번개 아이콘 (위에 표시)
            ctx.fillStyle = '#ffff00';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.strokeText('⚡', this.x + 12, drawY - 8);
            ctx.fillText('⚡', this.x + 12, drawY - 8);
            ctx.textAlign = 'left';
        } else if (this.type === 'fireball') {
            // 화염구 오브
            const centerX = this.x + 12;
            const centerY = drawY + 14;

            // 외부 광채
            ctx.shadowColor = '#ff4400';
            ctx.shadowBlur = 20;
            const outerGlow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 22);
            outerGlow.addColorStop(0, 'rgba(255, 100, 0, 0.8)');
            outerGlow.addColorStop(0.5, 'rgba(255, 50, 0, 0.4)');
            outerGlow.addColorStop(1, 'rgba(200, 0, 0, 0)');
            ctx.fillStyle = outerGlow;
            ctx.beginPath();
            ctx.arc(centerX, centerY, 22, 0, Math.PI * 2);
            ctx.fill();

            // 화염구 본체
            const fireGradient = ctx.createRadialGradient(centerX - 2, centerY - 2, 0, centerX, centerY, 14);
            fireGradient.addColorStop(0, '#ffffff');
            fireGradient.addColorStop(0.2, '#ffff00');
            fireGradient.addColorStop(0.5, '#ff8800');
            fireGradient.addColorStop(0.8, '#ff4400');
            fireGradient.addColorStop(1, '#cc2200');
            ctx.fillStyle = fireGradient;
            ctx.beginPath();
            ctx.arc(centerX, centerY, 14, 0, Math.PI * 2);
            ctx.fill();

            // 작은 화염 파티클 (회전)
            for (let i = 0; i < 4; i++) {
                const angle = (this.animFrame * 0.3 + i * Math.PI / 2);
                const dist = 10 + Math.sin(this.animFrame * 0.2 + i) * 3;
                const px = centerX + Math.cos(angle) * dist;
                const py = centerY + Math.sin(angle) * dist;
                ctx.fillStyle = `hsl(${30 - i * 5}, 100%, ${60 - i * 5}%)`;
                ctx.beginPath();
                ctx.arc(px, py, 3, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();

            // 화염 아이콘 (위에 표시)
            ctx.fillStyle = '#ff4400';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.strokeText('🔥', this.x + 12, drawY - 8);
            ctx.fillText('🔥', this.x + 12, drawY - 8);
            ctx.textAlign = 'left';
        } else {
            ctx.restore();
        }
    }

    collidesWith(player) {
        return !this.collected &&
               player.x < this.x + this.width &&
               player.x + player.width > this.x &&
               player.y < this.y + this.height + 10 &&
               player.y + player.height > this.y;
    }

    collect(player) {
        if (this.collected) return;

        this.collected = true;

        if (this.type === 'potion') {
            const healedAmount = Math.min(this.healAmount, player.maxHp - player.hp);
            player.hp += healedAmount;
            if (player.hp > player.maxHp) player.hp = player.maxHp;

            // 회복 텍스트
            damageTexts.push(new DamageText(
                player.x + player.width / 2,
                player.y,
                '+' + healedAmount,
                '#44ff44'
            ));
        } else if (this.type === 'lightning') {
            player.activateLightningBuff();
        } else if (this.type === 'fireball') {
            player.activateFireballBuff();
        }
    }
}

// 장비 아이템 클래스 (드랍/배치용)
class EquipmentItem {
    constructor(x, y, equipmentId, isPlaced = false) {
        this.x = x;
        this.y = y;
        this.width = 28;
        this.height = 28;
        this.equipmentId = equipmentId;
        this.collected = false;
        this.animFrame = 0;
        this.animTimer = 0;
        this.floatOffset = 0;

        // 드랍 시 물리
        this.velY = isPlaced ? 0 : -6;
        this.velX = isPlaced ? 0 : (Math.random() - 0.5) * 3;
        this.grounded = isPlaced;
        this.lifeTime = isPlaced ? Infinity : 1200; // 배치: 영구, 드랍: 20초

        // 장비, 재료, 아이템 모두 지원
        const found = findDefinition(equipmentId);
        this.definition = found ? found.def : null;
        this.category = found ? found.category : null;
    }

    update() {
        if (this.collected) return false;

        if (this.lifeTime !== Infinity) {
            this.lifeTime--;
            if (this.lifeTime <= 0) return false;
        }

        // 물리
        if (!this.grounded) {
            this.velY += 0.4;
            this.y += this.velY;
            this.x += this.velX;

            // 바닥 충돌
            if (this.y > WORLD_HEIGHT - 50 - this.height) {
                this.y = WORLD_HEIGHT - 50 - this.height;
                this.velY = 0;
                this.velX = 0;
                this.grounded = true;
            }

            // 플랫폼 충돌
            for (let platform of platforms) {
                if (this.y + this.height > platform.y &&
                    this.y + this.height - this.velY <= platform.y &&
                    this.x + this.width > platform.x &&
                    this.x < platform.x + platform.width) {
                    this.y = platform.y - this.height;
                    this.velY = 0;
                    this.velX = 0;
                    this.grounded = true;
                }
            }
        }

        // 애니메이션
        this.animTimer++;
        if (this.animTimer > 3) {
            this.animTimer = 0;
            this.animFrame++;
        }
        this.floatOffset = Math.sin(this.animFrame * 0.15) * 4;

        return true;
    }

    draw(ctx) {
        if (this.collected || !this.definition) return;

        const drawY = this.y + this.floatOffset;
        const rarityColor = RARITY_COLORS[this.definition.rarity] || '#FFFFFF';
        const slotType = this.definition.type;

        ctx.save();

        // 깜빡임 (사라지기 전)
        if (this.lifeTime !== Infinity && this.lifeTime < 180 && Math.floor(this.lifeTime / 15) % 2 === 0) {
            ctx.globalAlpha = 0.5;
        }

        // 희귀도 광채
        ctx.shadowColor = rarityColor;
        ctx.shadowBlur = 12 + Math.sin(this.animFrame * 0.2) * 4;

        // 배경 원
        const gradient = ctx.createRadialGradient(
            this.x + 14, drawY + 14, 0,
            this.x + 14, drawY + 14, 16
        );
        gradient.addColorStop(0, 'rgba(255,255,255,0.3)');
        gradient.addColorStop(1, 'rgba(0,0,0,0.3)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x + 14, drawY + 14, 14, 0, Math.PI * 2);
        ctx.fill();

        // 아이콘 (장비, 재료, 아이템 모두 지원)
        drawEquipmentIcon(ctx, this.x, drawY, 28, slotType, this.definition.color);

        // 희귀도 테두리
        ctx.strokeStyle = rarityColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x + 14, drawY + 14, 14, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();

        // 이름 표시
        ctx.fillStyle = rarityColor;
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.definition.name, this.x + 14, drawY - 5);
        ctx.textAlign = 'left';
    }

    drawIcon(ctx, x, y, slotType) {
        ctx.save();
        if (slotType === 'helmet') {
            ctx.beginPath();
            ctx.arc(x + 10, y + 12, 8, Math.PI, 0);
            ctx.lineTo(x + 18, y + 18);
            ctx.lineTo(x + 2, y + 18);
            ctx.closePath();
            ctx.fill();
        } else if (slotType === 'armor') {
            ctx.fillRect(x + 5, y + 2, 10, 16);
            ctx.fillRect(x + 1, y + 4, 18, 10);
        } else if (slotType === 'weapon') {
            ctx.fillRect(x + 9, y + 2, 2, 14);
            ctx.fillRect(x + 5, y + 12, 10, 3);
            ctx.fillRect(x + 8, y + 15, 4, 4);
        } else if (slotType === 'boots') {
            ctx.fillRect(x + 3, y + 8, 6, 10);
            ctx.fillRect(x + 11, y + 8, 6, 10);
            ctx.fillRect(x + 1, y + 16, 8, 3);
            ctx.fillRect(x + 11, y + 16, 8, 3);
        }
        ctx.restore();
    }

    collidesWith(player) {
        return !this.collected &&
               player.x < this.x + this.width &&
               player.x + player.width > this.x &&
               player.y < this.y + this.height + 10 &&
               player.y + player.height > this.y;
    }

    collect(player) {
        if (this.collected) return false;

        if (player.addToInventory(this.equipmentId)) {
            this.collected = true;
            const rarityColor = RARITY_COLORS[this.definition.rarity];
            damageTexts.push(new DamageText(
                player.x + player.width / 2,
                player.y - 20,
                this.definition.name + ' 획득!',
                rarityColor
            ));
            return true;
        } else {
            damageTexts.push(new DamageText(
                player.x + player.width / 2,
                player.y - 20,
                '인벤토리 가득!',
                '#FF0000'
            ));
            return false;
        }
    }
}

// 포탈/문 클래스
class Portal {
    constructor(x, y, targetStage, label = "") {
        this.x = x;
        this.y = y;
        this.width = 50;
        this.height = 70;
        this.targetStage = targetStage;
        this.label = label;
        this.animFrame = 0;
        this.animTimer = 0;
    }

    update() {
        this.animTimer++;
        if (this.animTimer > 5) {
            this.animTimer = 0;
            this.animFrame = (this.animFrame + 1) % 8;
        }
    }

    draw(ctx) {
        // 문 프레임
        ctx.fillStyle = '#4a3728';
        ctx.fillRect(this.x - 5, this.y - 5, this.width + 10, this.height + 5);

        // 문 안쪽 (포탈 효과)
        const gradient = ctx.createLinearGradient(this.x, this.y, this.x + this.width, this.y + this.height);
        const hue = (this.animFrame * 20) % 360;
        gradient.addColorStop(0, `hsl(${hue}, 70%, 50%)`);
        gradient.addColorStop(0.5, `hsl(${(hue + 60) % 360}, 70%, 60%)`);
        gradient.addColorStop(1, `hsl(${(hue + 120) % 360}, 70%, 50%)`);
        ctx.fillStyle = gradient;
        ctx.fillRect(this.x, this.y, this.width, this.height);

        // 포탈 소용돌이 효과
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
            const offset = (this.animFrame + i * 3) % 8;
            ctx.beginPath();
            ctx.ellipse(
                this.x + this.width / 2,
                this.y + this.height / 2,
                10 + offset * 2,
                15 + offset * 3,
                0, 0, Math.PI * 2
            );
            ctx.stroke();
        }

        // 라벨 표시 (대상 스테이지의 displayName 사용)
        let labelText = this.targetStage;
        if (stages[this.targetStage]) {
            labelText = stages[this.targetStage].displayName || this.targetStage;
        }

        if (labelText) {
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 3;
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.strokeText(labelText, this.x + this.width / 2, this.y - 15);
            ctx.fillText(labelText, this.x + this.width / 2, this.y - 15);
            ctx.textAlign = 'left';
        }

        // ↑ 키 안내
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('↑ 진입', this.x + this.width / 2, this.y + this.height + 15);
        ctx.textAlign = 'left';
    }

    collidesWith(player) {
        return player.x < this.x + this.width &&
               player.x + player.width > this.x &&
               player.y < this.y + this.height &&
               player.y + player.height > this.y;
    }
}

// 사다리 클래스
class Ladder {
    constructor(x, y, height) {
        this.x = x;
        this.y = y;
        this.width = 32;
        this.height = height;
    }

    draw(ctx) {
        const rungSpacing = 20;
        const railWidth = 4;

        // 양쪽 레일
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(this.x, this.y, railWidth, this.height);
        ctx.fillRect(this.x + this.width - railWidth, this.y, railWidth, this.height);

        // 가로 발판
        ctx.fillStyle = '#A0522D';
        for (let y = this.y + rungSpacing; y < this.y + this.height; y += rungSpacing) {
            ctx.fillRect(this.x, y - 3, this.width, 6);
        }

        // 하이라이트
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fillRect(this.x + 1, this.y, 2, this.height);
    }

    containsPlayer(player) {
        const playerCenterX = player.x + player.width / 2;
        return playerCenterX > this.x &&
               playerCenterX < this.x + this.width &&
               player.y + player.height > this.y &&
               player.y < this.y + this.height;
    }

    isAtTop(player) {
        return player.y <= this.y;
    }

    isAtBottom(player) {
        return player.y + player.height >= this.y + this.height;
    }
}

// 스테이지 데이터
const stages = {    "Stage001": {
        number: 1,
        displayName: "초원 지대",
        playerStart: { x: 100, y: 710 },
        platforms: [
            { x: 100, y: 690, width: 200, height: 30 },
            { x: 50, y: 590, width: 150, height: 30 },
            { x: 250, y: 530, width: 180, height: 30 },
            { x: 80, y: 430, width: 140, height: 30 },
            { x: 450, y: 660, width: 200, height: 30 },
            { x: 550, y: 560, width: 150, height: 30 },
            { x: 400, y: 470, width: 180, height: 30 },
            { x: 600, y: 390, width: 160, height: 30 },
            { x: 850, y: 690, width: 200, height: 30 },
            { x: 1000, y: 610, width: 180, height: 30 },
            { x: 1150, y: 530, width: 200, height: 30 },
            { x: 1050, y: 430, width: 150, height: 30 },
            { x: 1300, y: 660, width: 180, height: 30 },
            { x: 1400, y: 560, width: 150, height: 30 },
            { x: 1450, y: 410, width: 130, height: 30 },
            { x: 256, y: 256, width: 160, height: 32 }
        ],
        portals: [
            { x: 1470, y: 340, targetStage: "Stage002" },
            { x: 288, y: 192, targetStage: "Lobby" }
        ],
        items: [
            { x: 430, y: 435, type: 'potion' },
            { x: 1100, y: 495, type: 'potion' },
            { x: 630, y: 355, type: 'lightning' },
            { x: 1400, y: 525, type: 'lightning' },
            { x: 280, y: 495, type: 'fireball' },
            { x: 1080, y: 395, type: 'fireball' }
        ],
        monsters: [
            { x: 500, y: 710, monsterId: 100001 },
            { x: 580, y: 510, monsterId: 100002 },
            { x: 630, y: 340, monsterId: 100001 },
            { x: 900, y: 710, monsterId: 100001 },
            { x: 1050, y: 560, monsterId: 100002 },
            { x: 1200, y: 480, monsterId: 100002 },
            { x: 1350, y: 610, monsterId: 100001 },
            { x: 1470, y: 360, monsterId: 100001 },
            { x: 300, y: 480, monsterId: 100002 },
            { x: 480, y: 610, monsterId: 100002 },
            { x: 1100, y: 640, monsterId: 100002 },
            { x: 350, y: 710, monsterId: 100001 },
            { x: 600, y: 710, monsterId: 100002 },
            { x: 750, y: 710, monsterId: 100001 },
            { x: 1000, y: 710, monsterId: 100002 },
            { x: 1150, y: 710, monsterId: 100001 },
            { x: 1300, y: 710, monsterId: 100002 },
            { x: 1450, y: 710, monsterId: 100001 },
            { x: 420, y: 420, monsterId: 100002 },
            { x: 520, y: 420, monsterId: 100001 },
            { x: 680, y: 340, monsterId: 100002 },
            { x: 880, y: 640, monsterId: 100001 },
            { x: 1020, y: 560, monsterId: 100001 },
            { x: 1180, y: 480, monsterId: 100001 },
            { x: 1320, y: 610, monsterId: 100002 },
            { x: 100, y: 540, monsterId: 100001 },
            { x: 180, y: 640, monsterId: 100002 },
            { x: 280, y: 380, monsterId: 100001 },
            { x: 550, y: 510, monsterId: 100001 },
            { x: 950, y: 640, monsterId: 100002 },
            { x: 1250, y: 480, monsterId: 100001 },
            { x: 1400, y: 510, monsterId: 100002 },
            { x: 1500, y: 360, monsterId: 100002 }
        ],
        spawners: [
            { x: 50, y: 320, monsterId: 100003 },
            { x: 1490, y: 680, monsterId: 100003 }
        ],
        ladders: [
            { x: 352, y: 224, height: 288 }
        ],
        background: {
            skyTop: '#87CEEB',
            skyBottom: '#E0F6FF',
            mountains: [
                { x1: 0, peak: 150, x2: 300, color: '#9DC183' },
                { x1: 200, peak: 200, x2: 600, color: '#7CAF6B' },
                { x1: 500, peak: 120, x2: 900, color: '#9DC183' },
                { x1: 800, peak: 180, x2: 1200, color: '#7CAF6B' },
                { x1: 1100, peak: 140, x2: 1400, color: '#9DC183' },
                { x1: 1300, peak: 160, x2: 1600, color: '#7CAF6B' }
            ]
        }
    },    "Stage002": {
        number: 2,
        displayName: "어둠의 동굴",
        playerStart: { x: 100, y: 710 },
        platforms: [
            { x: 50, y: 690, width: 180, height: 30 },
            { x: 200, y: 610, width: 150, height: 30 },
            { x: 80, y: 530, width: 140, height: 30 },
            { x: 250, y: 450, width: 160, height: 30 },
            { x: 50, y: 370, width: 130, height: 30 },
            { x: 450, y: 690, width: 180, height: 30 },
            { x: 550, y: 590, width: 150, height: 30 },
            { x: 400, y: 490, width: 200, height: 30 },
            { x: 600, y: 390, width: 160, height: 30 },
            { x: 800, y: 660, width: 200, height: 30 },
            { x: 950, y: 560, width: 180, height: 30 },
            { x: 850, y: 460, width: 150, height: 30 },
            { x: 1100, y: 690, width: 200, height: 30 },
            { x: 1250, y: 590, width: 180, height: 30 },
            { x: 1150, y: 490, width: 160, height: 30 },
            { x: 1350, y: 410, width: 200, height: 30 }
        ],
        portals: [
            { x: 128, y: 320, targetStage: "Stage001" },
            { x: 1472, y: 338, targetStage: "Stage003" }
        ],
        items: [
            { x: 430, y: 455, type: 'potion' },
            { x: 1180, y: 455, type: 'potion' },
            { x: 630, y: 355, type: 'lightning' },
            { x: 1380, y: 375, type: 'lightning' },
            { x: 110, y: 495, type: 'fireball' },
            { x: 880, y: 425, type: 'fireball' }
        ],
        monsters: [
            { x: 250, y: 560, monsterId: 100001 },
            { x: 500, y: 640, monsterId: 100002 },
            { x: 580, y: 540, monsterId: 100002 },
            { x: 450, y: 440, monsterId: 100001 },
            { x: 630, y: 340, monsterId: 100002 },
            { x: 850, y: 610, monsterId: 100001 },
            { x: 1000, y: 510, monsterId: 100002 },
            { x: 880, y: 410, monsterId: 100002 },
            { x: 1150, y: 640, monsterId: 100001 },
            { x: 1300, y: 540, monsterId: 100002 },
            { x: 1400, y: 360, monsterId: 100001 },
            { x: 250, y: 480, monsterId: 100002 },
            { x: 480, y: 440, monsterId: 100002 },
            { x: 900, y: 610, monsterId: 100002 },
            { x: 1200, y: 440, monsterId: 100002 },
            { x: 300, y: 710, monsterId: 100001 },
            { x: 450, y: 710, monsterId: 100002 },
            { x: 600, y: 710, monsterId: 100001 },
            { x: 750, y: 710, monsterId: 100002 },
            { x: 900, y: 710, monsterId: 100001 },
            { x: 1050, y: 710, monsterId: 100002 },
            { x: 1200, y: 710, monsterId: 100001 },
            { x: 1350, y: 710, monsterId: 100002 },
            { x: 1500, y: 710, monsterId: 100001 },
            { x: 150, y: 640, monsterId: 100002 },
            { x: 280, y: 560, monsterId: 100002 },
            { x: 120, y: 480, monsterId: 100001 },
            { x: 320, y: 400, monsterId: 100002 },
            { x: 100, y: 320, monsterId: 100001 },
            { x: 550, y: 640, monsterId: 100001 },
            { x: 620, y: 540, monsterId: 100001 },
            { x: 500, y: 440, monsterId: 100002 },
            { x: 700, y: 340, monsterId: 100001 },
            { x: 820, y: 610, monsterId: 100002 },
            { x: 970, y: 510, monsterId: 100001 },
            { x: 920, y: 410, monsterId: 100001 },
            { x: 1180, y: 640, monsterId: 100002 },
            { x: 1280, y: 540, monsterId: 100001 },
            { x: 1180, y: 440, monsterId: 100001 },
            { x: 1450, y: 360, monsterId: 100002 },
            { x: 380, y: 440, monsterId: 100001 },
            { x: 1100, y: 640, monsterId: 100001 },
            { x: 950, y: 610, monsterId: 100001 },
            { x: 1250, y: 440, monsterId: 100001 },
            { x: 1380, y: 360, monsterId: 100002 }
        ],
        spawners: [
            { x: 64, y: 160, monsterId: 100003 },
            { x: 1490, y: 680, monsterId: 100003 }
        ],
        ladders: [
        ],
        background: {
            skyTop: '#1a1a2e',
            skyBottom: '#2d2d44',
            mountains: [
                { x1: 0, peak: 150, x2: 300, color: '#3d3d5c' },
                { x1: 200, peak: 200, x2: 600, color: '#2d2d44' },
                { x1: 500, peak: 120, x2: 900, color: '#3d3d5c' },
                { x1: 800, peak: 180, x2: 1200, color: '#2d2d44' },
                { x1: 1100, peak: 140, x2: 1400, color: '#3d3d5c' },
                { x1: 1300, peak: 160, x2: 1600, color: '#2d2d44' }
            ]
        }
    },    "Stage003": {
        number: 3,
        displayName: "버려진 사막",
        playerStart: { x: 100, y: 710 },
        platforms: [
            { x: 50, y: 690, width: 180, height: 30 },
            { x: 200, y: 610, width: 150, height: 30 },
            { x: 80, y: 530, width: 140, height: 30 },
            { x: 250, y: 450, width: 160, height: 30 },
            { x: 50, y: 370, width: 130, height: 30 },
            { x: 450, y: 690, width: 180, height: 30 },
            { x: 550, y: 590, width: 150, height: 30 },
            { x: 400, y: 490, width: 200, height: 30 },
            { x: 600, y: 390, width: 160, height: 30 },
            { x: 800, y: 660, width: 200, height: 30 },
            { x: 950, y: 560, width: 180, height: 30 },
            { x: 850, y: 460, width: 150, height: 30 },
            { x: 1100, y: 690, width: 200, height: 30 },
            { x: 1250, y: 590, width: 180, height: 30 },
            { x: 1150, y: 490, width: 160, height: 30 },
            { x: 1350, y: 410, width: 200, height: 30 }
        ],
        portals: [
            { x: 96, y: 320, targetStage: "Stage002" }
        ],
        items: [
            { x: 430, y: 455, type: 'potion' },
            { x: 1180, y: 455, type: 'potion' },
            { x: 630, y: 355, type: 'lightning' },
            { x: 1380, y: 375, type: 'lightning' },
            { x: 110, y: 495, type: 'fireball' },
            { x: 880, y: 425, type: 'fireball' }
        ],
        monsters: [
            { x: 250, y: 560, monsterId: 100001 },
            { x: 500, y: 640, monsterId: 100001 },
            { x: 580, y: 540, monsterId: 100001 },
            { x: 450, y: 440, monsterId: 100001 },
            { x: 630, y: 340, monsterId: 100001 },
            { x: 850, y: 610, monsterId: 100001 },
            { x: 1000, y: 510, monsterId: 100001 },
            { x: 880, y: 410, monsterId: 100001 },
            { x: 1150, y: 640, monsterId: 100001 },
            { x: 1300, y: 540, monsterId: 100001 },
            { x: 1400, y: 360, monsterId: 100001 },
            { x: 250, y: 480, monsterId: 100001 },
            { x: 480, y: 440, monsterId: 100001 },
            { x: 900, y: 610, monsterId: 100001 },
            { x: 1200, y: 440, monsterId: 100001 },
            { x: 300, y: 710, monsterId: 100001 },
            { x: 450, y: 710, monsterId: 100001 },
            { x: 600, y: 710, monsterId: 100001 },
            { x: 750, y: 710, monsterId: 100001 },
            { x: 900, y: 710, monsterId: 100001 },
            { x: 1050, y: 710, monsterId: 100001 },
            { x: 1200, y: 710, monsterId: 100001 },
            { x: 1350, y: 710, monsterId: 100001 },
            { x: 1500, y: 710, monsterId: 100001 },
            { x: 150, y: 640, monsterId: 100001 },
            { x: 280, y: 560, monsterId: 100001 },
            { x: 120, y: 480, monsterId: 100001 },
            { x: 320, y: 400, monsterId: 100001 },
            { x: 100, y: 320, monsterId: 100001 },
            { x: 550, y: 640, monsterId: 100001 },
            { x: 620, y: 540, monsterId: 100001 },
            { x: 500, y: 440, monsterId: 100001 },
            { x: 700, y: 340, monsterId: 100001 },
            { x: 820, y: 610, monsterId: 100001 },
            { x: 970, y: 510, monsterId: 100001 },
            { x: 920, y: 410, monsterId: 100001 },
            { x: 1180, y: 640, monsterId: 100001 },
            { x: 1280, y: 540, monsterId: 100001 },
            { x: 1180, y: 440, monsterId: 100001 },
            { x: 1450, y: 360, monsterId: 100001 },
            { x: 380, y: 440, monsterId: 100001 },
            { x: 1100, y: 640, monsterId: 100001 },
            { x: 950, y: 610, monsterId: 100001 },
            { x: 1250, y: 440, monsterId: 100001 },
            { x: 1380, y: 360, monsterId: 100001 },
            { x: 1056, y: 320, monsterId: 100004 }
        ],
        spawners: [
            { x: 64, y: 192, monsterId: 100001 },
            { x: 1490, y: 680, monsterId: 100001 }
        ],
        ladders: [
        ],
        background: {
            skyTop: '#f4a460',
            skyBottom: '#ffe4b5',
            mountains: [
                { x1: 0, peak: 150, x2: 300, color: '#deb887' },
                { x1: 200, peak: 200, x2: 600, color: '#d2b48c' },
                { x1: 500, peak: 120, x2: 900, color: '#deb887' },
                { x1: 800, peak: 180, x2: 1200, color: '#d2b48c' },
                { x1: 1100, peak: 140, x2: 1400, color: '#deb887' },
                { x1: 1300, peak: 160, x2: 1600, color: '#d2b48c' }
            ]
        }
    },
    "Lobby": {
        number: 0,
        displayName: "나뭇잎 마을",
        playerStart: { x: 96, y: 722 },
        platforms: [
            { x: 256, y: 626, width: 512, height: 32 }
        ],
        portals: [
            { x: 512, y: 562, targetStage: "Stage001", label: "초원 지대" }
        ],
        items: [],
        monsters: [],
        spawners: [],
        background: {
            skyTop: '#6B8E9F',
            skyBottom: '#A8C8D8',
            mountains: [
                { x1: 0, peak: 200, x2: 400, color: '#8FA88F' },
                { x1: 300, peak: 250, x2: 700, color: '#7A997A' },
                { x1: 600, peak: 180, x2: 900, color: '#8FA88F' }
            ]
        }
    }
};

// 현재 스테이지 (파일명으로 관리)
let currentStage = null;
let currentStageData = null;
let isPreviewMode = false;

// 게임 초기화
const player = new Player(100, 300);
let platforms = [];
let monsters = [];
let portals = [];
let items = [];
let ladders = [];
let stageMonsterSpawns = [];

// 스테이지 로드 함수
function loadStage(stageName) {
    // stages 객체에서 직접 로드
    const stage = stages[stageName];

    if (!stage) {
        console.error(`스테이지를 찾을 수 없습니다: ${stageName}`);
        return false;
    }

    applyStageData(stage, stageName);
    return true;
}

// 스테이지 데이터 적용
function applyStageData(stage, stageName) {
    const previousStage = currentStage;
    currentStage = stageName;
    currentStageData = stage;

    // 플레이어 위치 초기화
    player.x = stage.playerStart.x;
    player.y = stage.playerStart.y;
    player.velX = 0;
    player.velY = 0;
    player.spawnEffect = 30; // 스폰 이펙트 발동 (0.5초)

    // 로비 진입 시 버프 해제 및 체력 회복
    if (stageName === "Lobby") {
        player.lightningBuff = false;
        player.lightningBuffTimer = 0;
        player.fireballBuff = false;
        player.fireballBuffTimer = 0;
        player.hp = player.maxHp;
        if (previousStage && previousStage !== "Lobby") {
            damageTexts.push(new DamageText(
                player.x + player.width / 2,
                player.y - 30,
                '체력 회복!',
                '#00ff00'
            ));
        }
    }

    // 플랫폼 생성
    platforms = stage.platforms.map(p => new Platform(p.x, p.y, p.width, p.height));

    // 포탈 생성
    portals = (stage.portals || []).map(p => new Portal(p.x, p.y, p.targetStage, p.label));

    // 사다리 생성
    ladders = (stage.ladders || []).map(l => new Ladder(l.x, l.y, l.height));

    // 아이템 생성
    items = (stage.items || []).map(i => new Item(i.x, i.y, i.type));

    // 장비 아이템 생성 (맵 배치)
    equipmentItems = (stage.equipment || []).map(e => new EquipmentItem(e.x, e.y, e.equipmentId, true));

    // 코인 초기화 (스테이지 이동 시 기존 드랍 코인 제거)
    coins = [];

    // 부메랑 초기화
    boomerangs = [];

    // 번개 초기화
    lightnings = [];

    // 스포너 생성
    spawners = (stage.spawners || []).map(s => new Spawner(s.x, s.y, s.monsterId, s.spawnInterval || 300, s.maxMonsters || 2));

    // 몬스터 생성
    stageMonsterSpawns = stage.monsters || [];
    monsters = stageMonsterSpawns.map(m => new Monster(m.x, m.y, m.monsterId));

    // 카메라 위치 즉시 설정 (플레이어 중심)
    camera.x = player.x + player.width / 2 - canvas.width / 2;
    camera.y = player.y + player.height / 2 - canvas.height / 2;

    // 카메라 경계 제한
    if (camera.x < 0) camera.x = 0;
    if (camera.x > WORLD_WIDTH - canvas.width) camera.x = WORLD_WIDTH - canvas.width;
    if (camera.y < 0) camera.y = 0;
    if (camera.y > WORLD_HEIGHT - canvas.height) camera.y = WORLD_HEIGHT - canvas.height;

    console.log(`스테이지 로드 완료: ${stageName} - ${stage.displayName || stageName}`);

}

// 몬스터 리스폰
function respawnMonsters() {
    const deadCount = monsters.filter(m => !m.alive && m.deathTimer >= 30).length;
    if (deadCount > 0) {
        monsters = monsters.filter(m => m.alive || m.deathTimer < 30);

        // 3초 후 리스폰
        setTimeout(() => {
            while (monsters.length < stageMonsterSpawns.length) {
                const spawn = stageMonsterSpawns[Math.floor(Math.random() * stageMonsterSpawns.length)];
                monsters.push(new Monster(spawn.x, spawn.y, spawn.monsterId));
            }
        }, 3000);
    }
}

// 게임 초기화 플래그
let gameInitialized = false;

const clouds = [];
for (let i = 0; i < 10; i++) {
    clouds.push(new Cloud(
        Math.random() * WORLD_WIDTH,
        30 + Math.random() * 100,
        20 + Math.random() * 20
    ));
}

// 키 상태
const keys = {
    left: false,
    right: false,
    up: false,
    down: false,
    space: false,
    attack: false
};

let canJump = true;

// 키보드 이벤트
document.addEventListener('keydown', (e) => {
    switch(e.code) {
        case 'ArrowLeft':
        case 'KeyA':
            keys.left = true;
            break;
        case 'ArrowRight':
        case 'KeyD':
            keys.right = true;
            break;
        case 'ArrowUp':
        case 'KeyW':
            keys.up = true;
            // 포탈 진입 체크
            for (let portal of portals) {
                if (portal.collidesWith(player)) {
                    if (isPreviewMode) {
                        damageTexts.push(new DamageText(player.x + player.width/2, player.y - 20, '미리보기 모드', '#9333ea'));
                        break;
                    }
                    loadStage(portal.targetStage);
                    return;
                }
            }
            // 점프 (사다리 타는 중이 아닐 때만)
            if (canJump && !player.climbing) {
                player.jump();
                canJump = false;
            }
            break;
        case 'Space':
            if (canJump) {
                player.jump();
                canJump = false;
            }
            break;
        case 'ArrowDown':
        case 'KeyS':
            keys.down = true;
            player.dropDown();
            break;
        case 'KeyZ':
        case 'ControlLeft':
        case 'ControlRight':
            player.attack();
            break;
        case 'Escape':
            if (equipmentPanelOpen) {
                equipmentPanelOpen = false;
                selectedInventoryIndex = -1;
            }
            break;
    }
    e.preventDefault();
});

document.addEventListener('keyup', (e) => {
    switch(e.code) {
        case 'ArrowLeft':
        case 'KeyA':
            keys.left = false;
            break;
        case 'ArrowRight':
        case 'KeyD':
            keys.right = false;
            break;
        case 'ArrowUp':
        case 'KeyW':
            keys.up = false;
            canJump = true;
            break;
        case 'Space':
            canJump = true;
            break;
        case 'ArrowDown':
        case 'KeyS':
            keys.down = false;
            break;
    }
});

// 마우스 클릭 이벤트 (장비 UI)
canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (equipmentPanelOpen) {
        handleEquipmentPanelClick(mouseX, mouseY);
        return;
    }

    // 장비 버튼 클릭
    if (mouseX >= equipmentButtonBounds.x &&
        mouseX <= equipmentButtonBounds.x + equipmentButtonBounds.width &&
        mouseY >= equipmentButtonBounds.y &&
        mouseY <= equipmentButtonBounds.y + equipmentButtonBounds.height) {
        equipmentPanelOpen = true;
    }
});

// 마우스 휠로 인벤토리 스크롤
canvas.addEventListener('wheel', (e) => {
    if (!equipmentPanelOpen || viewingEquipmentId) return;

    const currentTabInventory = player.inventory[selectedEquipmentTab];
    const equippedItemId = player.equipment[selectedEquipmentTab];
    const totalItems = currentTabInventory.length + (equippedItemId ? 1 : 0);
    const invCols = 8;
    const invRows = 4;
    const totalRows = Math.ceil(totalItems / invCols);
    const maxScrollRow = Math.max(0, totalRows - invRows);

    if (e.deltaY > 0) {
        // 아래로 스크롤
        if (inventoryScrollRow < maxScrollRow) {
            inventoryScrollRow++;
        }
    } else if (e.deltaY < 0) {
        // 위로 스크롤
        if (inventoryScrollRow > 0) {
            inventoryScrollRow--;
        }
    }

    e.preventDefault();
}, { passive: false });

function handleEquipmentPanelClick(mouseX, mouseY) {
    const panelX = canvas.width / 2 - 350;
    const panelY = canvas.height / 2 - 180;
    const panelWidth = 700;
    const panelHeight = 410;

    // 상세 정보창이 열려있을 때
    if (viewingEquipmentId) {
        const detailW = 220;
        const detailH = 200;
        const detailX = canvas.width / 2 - detailW / 2;
        const detailY = canvas.height / 2 - detailH / 2;

        // 닫기 버튼
        if (mouseX >= detailX + detailW - 25 && mouseX <= detailX + detailW - 5 &&
            mouseY >= detailY + 5 && mouseY <= detailY + 25) {
            viewingEquipmentId = null;
            viewingEquipmentSlot = null;
            return;
        }

        // 장착/해제 버튼
        const btnY = detailY + detailH - 40;
        if (mouseX >= detailX + 20 && mouseX <= detailX + 100 &&
            mouseY >= btnY && mouseY <= btnY + 30) {
            if (viewingEquipmentSlot) {
                // 장착 슬롯에서 봤으면 해제
                player.unequipItem(viewingEquipmentSlot);
            } else {
                // 인벤토리에서 봤으면 장착
                player.equipItem(viewingEquipmentId);
            }
            viewingEquipmentId = null;
            viewingEquipmentSlot = null;
            return;
        }

        // 상세창 외부 클릭 - 닫기
        if (mouseX < detailX || mouseX > detailX + detailW ||
            mouseY < detailY || mouseY > detailY + detailH) {
            viewingEquipmentId = null;
            viewingEquipmentSlot = null;
            return;
        }
        return;
    }

    // 패널 외부 클릭 - 닫기
    if (mouseX < panelX || mouseX > panelX + panelWidth ||
        mouseY < panelY || mouseY > panelY + panelHeight) {
        equipmentPanelOpen = false;
        selectedInventoryIndex = -1;
        return;
    }

    // 닫기 버튼
    if (mouseX >= panelX + panelWidth - 30 && mouseX <= panelX + panelWidth - 5 &&
        mouseY >= panelY + 5 && mouseY <= panelY + 30) {
        equipmentPanelOpen = false;
        selectedInventoryIndex = -1;
        return;
    }

    // 탭 영역
    const tabX = panelX + 230;
    const tabY = panelY + 50;
    const tabWidth = 62;
    const tabHeight = 25;
    const tabGap = 5;

    for (let i = 0; i < EQUIPMENT_TABS.length; i++) {
        const tx = tabX + i * (tabWidth + tabGap);
        if (mouseX >= tx && mouseX <= tx + tabWidth &&
            mouseY >= tabY && mouseY <= tabY + tabHeight) {
            selectedEquipmentTab = EQUIPMENT_TABS[i];
            selectedInventoryIndex = -1;
            inventoryScrollRow = 0; // 탭 변경 시 스크롤 초기화
            return;
        }
    }

    // 장비 슬롯 영역 (캐릭터 중심 레이아웃)
    const charCenterX = panelX + 115;
    const charCenterY = panelY + 150;
    const slotSize = 40;

    const slotPositions = {
        helmet: { x: charCenterX - slotSize / 2, y: charCenterY - 85 },
        armor: { x: charCenterX + 35, y: charCenterY - 5 },
        weapon: { x: charCenterX - slotSize - 35, y: charCenterY - 5 },
        boots: { x: charCenterX - slotSize / 2, y: charCenterY + 65 }
    };

    const slots = ['helmet', 'armor', 'weapon', 'boots'];

    for (const slot of slots) {
        const pos = slotPositions[slot];
        const slotX = pos.x;
        const slotY = pos.y;

        if (mouseX >= slotX && mouseX <= slotX + slotSize &&
            mouseY >= slotY && mouseY <= slotY + slotSize) {
            if (player.equipment[slot]) {
                // 장착된 장비 상세 정보 보기
                viewingEquipmentId = player.equipment[slot];
                viewingEquipmentSlot = slot;
            }
            return;
        }
    }

    // 현재 탭의 인벤토리
    const currentTabInventory = player.inventory[selectedEquipmentTab];
    const equippedItemId = player.equipment[selectedEquipmentTab];

    // 표시할 아이템 목록 (장착중인 아이템을 맨 앞에)
    const displayItems = [];
    if (equippedItemId) {
        displayItems.push({ id: equippedItemId, equipped: true });
    }
    for (const itemId of currentTabInventory) {
        displayItems.push({ id: itemId, equipped: false });
    }

    // 인벤토리 영역
    const invX = panelX + 230;
    const invY = tabY + tabHeight + 10;
    const invCols = 8;
    const invRows = 4;
    const invSlotSize = 45;
    const invGap = 5;
    const maxDisplaySlots = invCols * invRows;

    // 스크롤 범위 계산
    const totalRows = Math.ceil(displayItems.length / invCols);
    const maxScrollRow = Math.max(0, totalRows - invRows);
    const startIndex = inventoryScrollRow * invCols;

    // 스크롤 버튼 영역
    const scrollBtnSize = 24;
    const scrollX = invX + invCols * (invSlotSize + invGap) + 5;
    const scrollUpY = invY;
    const scrollDownY = invY + invRows * (invSlotSize + invGap) - scrollBtnSize;

    // 위로 스크롤 버튼 클릭
    if (mouseX >= scrollX && mouseX <= scrollX + scrollBtnSize &&
        mouseY >= scrollUpY && mouseY <= scrollUpY + scrollBtnSize) {
        if (inventoryScrollRow > 0) {
            inventoryScrollRow--;
        }
        return;
    }

    // 아래로 스크롤 버튼 클릭
    if (mouseX >= scrollX && mouseX <= scrollX + scrollBtnSize &&
        mouseY >= scrollDownY && mouseY <= scrollDownY + scrollBtnSize) {
        if (inventoryScrollRow < maxScrollRow) {
            inventoryScrollRow++;
        }
        return;
    }

    // 인벤토리 아이템 클릭
    for (let i = 0; i < maxDisplaySlots; i++) {
        const col = i % invCols;
        const row = Math.floor(i / invCols);
        const itemX = invX + col * (invSlotSize + invGap);
        const itemY = invY + row * (invSlotSize + invGap);

        const actualIndex = startIndex + i;

        if (mouseX >= itemX && mouseX <= itemX + invSlotSize &&
            mouseY >= itemY && mouseY <= itemY + invSlotSize) {
            if (actualIndex < displayItems.length) {
                // 장비 상세 정보 보기
                viewingEquipmentId = displayItems[actualIndex].id;
                viewingEquipmentSlot = displayItems[actualIndex].equipped ? selectedEquipmentTab : null;
            }
            return;
        }
    }
}

// 바닥 그리기 (월드 좌표 사용 - 이미 카메라 변환 적용됨)
function drawGround() {
    const groundY = WORLD_HEIGHT - 50;

    ctx.fillStyle = '#8B4513';
    ctx.fillRect(0, groundY, WORLD_WIDTH, 50);

    ctx.fillStyle = '#228B22';
    ctx.fillRect(0, groundY, WORLD_WIDTH, 10);

    ctx.strokeStyle = '#2E8B2E';
    ctx.lineWidth = 2;
    for (let i = 0; i < WORLD_WIDTH; i += 15) {
        ctx.beginPath();
        ctx.moveTo(i, groundY);
        ctx.lineTo(i + 5, groundY - 8);
        ctx.stroke();
    }
}

// 배경 그리기 (패럴랙스 효과)
function drawBackground() {
    const stage = currentStageData || stages[currentStage];
    const bg = stage && stage.background ? stage.background : {
        skyTop: '#87CEEB',
        skyBottom: '#E0F6FF',
        mountains: []
    };

    // 하늘 (고정)
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, bg.skyTop);
    gradient.addColorStop(1, bg.skyBottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 구름 (느리게 움직임 - 패럴랙스)
    clouds.forEach(cloud => {
        cloud.update();
        ctx.save();
        ctx.translate(-camera.x * 0.3, 0); // 패럴랙스 효과
        cloud.draw(ctx);
        ctx.restore();
    });

    // 산 그리기 (중간 속도로 움직임)
    if (bg.mountains) {
        for (let mt of bg.mountains) {
            const parallaxX = camera.x * 0.5; // 50% 속도로 움직임
            ctx.fillStyle = mt.color;
            ctx.beginPath();
            ctx.moveTo(mt.x1 - parallaxX, canvas.height - 50);
            ctx.lineTo((mt.x1 + mt.x2) / 2 - parallaxX, canvas.height - 50 - mt.peak);
            ctx.lineTo(mt.x2 - parallaxX, canvas.height - 50);
            ctx.fill();
        }
    }
}

// UI 그리기
function drawUI() {
    const stage = currentStageData || stages[currentStage];
    const stageNum = stage ? (stage.number || 0) : 0;
    const stageName = stage ? (stage.displayName || '') : '';

    // 미리보기 모드 표시
    if (isPreviewMode) {
        ctx.fillStyle = 'rgba(147, 51, 234, 0.9)';
        ctx.fillRect(10, 10, 140, 30);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(10, 10, 140, 30);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('미리보기 모드', 80, 30);
        ctx.textAlign = 'left';
    }

    // 스테이지 표시
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(canvas.width - 180, 10, 170, 30);
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2;
    ctx.strokeRect(canvas.width - 180, 10, 170, 30);
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${stageNum}. ${stageName}`, canvas.width - 95, 30);
    ctx.textAlign = 'left';

    // 코인 표시
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(canvas.width - 160, 45, 150, 25);
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2;
    ctx.strokeRect(canvas.width - 160, 45, 150, 25);

    // 코인 아이콘
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(canvas.width - 145, 57, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#daa520';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('$', canvas.width - 145, 61);

    // 코인 수
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`${player.coins}`, canvas.width - 130, 62);

    // HP/EXP 바 배경
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(10, 10, 210, 70);
    ctx.strokeStyle = '#4a9eff';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, 210, 70);

    // 레벨 표시
    ctx.fillStyle = '#ffff00';
    ctx.font = 'bold 14px Arial';
    ctx.fillText(`Lv.${player.level}`, 15, 28);

    // HP 텍스트
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px Arial';
    ctx.fillText('HP', 70, 28);

    // HP 바
    ctx.fillStyle = '#333';
    ctx.fillRect(95, 17, 115, 14);

    const totalMaxHp = player.getTotalMaxHp();
    const hpPercent = player.hp / totalMaxHp;
    const hpColor = hpPercent > 0.5 ? '#4CAF50' : hpPercent > 0.25 ? '#ff9800' : '#f44336';
    ctx.fillStyle = hpColor;
    ctx.fillRect(95, 17, 115 * hpPercent, 14);

    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(95, 17, 115, 14);

    // HP 숫자
    ctx.fillStyle = '#fff';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${player.hp}/${totalMaxHp}`, 152, 27);
    ctx.textAlign = 'left';

    // EXP 텍스트
    ctx.fillStyle = '#00ffff';
    ctx.font = 'bold 12px Arial';
    ctx.fillText('EXP', 15, 48);

    // EXP 바
    ctx.fillStyle = '#333';
    ctx.fillRect(45, 38, 165, 14);

    const expPercent = player.exp / player.expToNextLevel;
    ctx.fillStyle = '#00bfff';
    ctx.fillRect(45, 38, 165 * expPercent, 14);

    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(45, 38, 165, 14);

    // EXP 숫자
    ctx.fillStyle = '#fff';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${player.exp}/${player.expToNextLevel}`, 127, 48);
    ctx.textAlign = 'left';

    // 공격력 표시
    ctx.fillStyle = '#ff6b6b';
    ctx.font = '11px Arial';
    ctx.fillText(`ATK: ${player.getTotalAttackDamage()}`, 15, 68);
    ctx.fillStyle = '#6b9fff';
    ctx.fillText(`DEF: ${player.getTotalDefense()}`, 70, 68);

    // 점프 카운트
    ctx.fillStyle = '#aaa';
    ctx.fillText(`점프: ${player.maxJumps - player.jumpCount}/${player.maxJumps}`, 100, 68);

    // 버프 UI 시작 위치
    let buffY = 85;

    // 번개 버프 표시
    if (player.lightningBuff) {
        const buffSeconds = Math.ceil(player.lightningBuffTimer / 60);
        ctx.fillStyle = 'rgba(0, 100, 150, 0.8)';
        ctx.fillRect(10, buffY, 120, 24);
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(10, buffY, 120, 24);

        // 버프 바
        const buffPercent = player.lightningBuffTimer / player.lightningBuffDuration;
        ctx.fillStyle = '#00aaff';
        ctx.fillRect(12, buffY + 2, 116 * buffPercent, 20);

        // 번개 아이콘과 텍스트
        ctx.fillStyle = '#ffff00';
        ctx.font = 'bold 14px Arial';
        ctx.fillText('⚡', 18, buffY + 17);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px Arial';
        ctx.fillText(`번개 ${buffSeconds}초`, 38, buffY + 16);

        buffY += 28;
    }

    // 화염구 버프 표시
    if (player.fireballBuff) {
        const buffSeconds = Math.ceil(player.fireballBuffTimer / 60);
        ctx.fillStyle = 'rgba(150, 50, 0, 0.8)';
        ctx.fillRect(10, buffY, 120, 24);
        ctx.strokeStyle = '#ff6600';
        ctx.lineWidth = 2;
        ctx.strokeRect(10, buffY, 120, 24);

        // 버프 바
        const buffPercent = player.fireballBuffTimer / player.fireballBuffDuration;
        ctx.fillStyle = '#ff4400';
        ctx.fillRect(12, buffY + 2, 116 * buffPercent, 20);

        // 화염 아이콘과 텍스트
        ctx.fillStyle = '#ffff00';
        ctx.font = 'bold 14px Arial';
        ctx.fillText('🔥', 16, buffY + 17);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px Arial';
        ctx.fillText(`화염 ${buffSeconds}초`, 38, buffY + 16);
    }

    // 미니맵
    const minimapWidth = 150;
    const minimapHeight = 30;
    const minimapX = canvas.width / 2 - minimapWidth / 2;
    const minimapY = 10;

    // 미니맵 배경
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(minimapX, minimapY, minimapWidth, minimapHeight);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(minimapX, minimapY, minimapWidth, minimapHeight);

    // 미니맵에 플랫폼 표시
    const scaleX = minimapWidth / WORLD_WIDTH;
    const scaleY = minimapHeight / WORLD_HEIGHT;
    ctx.fillStyle = '#8B4513';
    platforms.forEach(p => {
        ctx.fillRect(
            minimapX + p.x * scaleX,
            minimapY + p.y * scaleY,
            Math.max(2, p.width * scaleX),
            Math.max(1, p.height * scaleY)
        );
    });

    // 미니맵에 사다리 표시
    ctx.fillStyle = '#DEB887';
    ladders.forEach(l => {
        ctx.fillRect(
            minimapX + l.x * scaleX,
            minimapY + l.y * scaleY,
            Math.max(1, l.width * scaleX),
            Math.max(2, l.height * scaleY)
        );
    });

    // 미니맵에 플레이어 위치 표시
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(
        minimapX + player.x * scaleX - 2,
        minimapY + player.y * scaleY - 2,
        4, 4
    );

    // 미니맵에 몬스터 위치 표시
    ctx.fillStyle = '#ff0000';
    monsters.forEach(m => {
        if (m.alive) {
            ctx.fillRect(
                minimapX + m.x * scaleX - 1,
                minimapY + m.y * scaleY - 1,
                2, 2
            );
        }
    });

    // 미니맵에 포탈 위치 표시
    ctx.fillStyle = '#ff00ff';
    portals.forEach(p => {
        ctx.fillRect(
            minimapX + p.x * scaleX - 1,
            minimapY + p.y * scaleY - 1,
            3, 3
        );
    });

    // 미니맵에 스포너 위치 표시
    ctx.fillStyle = '#9933ff';
    spawners.forEach(s => {
        ctx.fillRect(
            minimapX + s.x * scaleX - 1,
            minimapY + s.y * scaleY - 1,
            3, 3
        );
    });

    // 장비 버튼 (가방 아이콘) - 맵 이름 왼편
    const btnSize = 36;
    const btnX = canvas.width - 180 - btnSize - 10;
    const btnY = 7;

    equipmentButtonBounds = { x: btnX, y: btnY, width: btnSize, height: btnSize };

    // 버튼 배경 (원형)
    ctx.beginPath();
    ctx.arc(btnX + btnSize / 2, btnY + btnSize / 2, btnSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(60, 60, 80, 0.9)';
    ctx.fill();
    ctx.strokeStyle = '#8888FF';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 가방 아이콘 그리기
    const iconX = btnX + btnSize / 2;
    const iconY = btnY + btnSize / 2;

    ctx.save();
    ctx.translate(iconX, iconY);

    // 가방 본체
    ctx.fillStyle = '#CD853F';
    ctx.beginPath();
    ctx.moveTo(-10, -4);
    ctx.lineTo(-12, 12);
    ctx.lineTo(12, 12);
    ctx.lineTo(10, -4);
    ctx.closePath();
    ctx.fill();

    // 가방 덮개
    ctx.fillStyle = '#DEB887';
    ctx.beginPath();
    ctx.moveTo(-10, -4);
    ctx.quadraticCurveTo(0, -10, 10, -4);
    ctx.lineTo(8, 0);
    ctx.quadraticCurveTo(0, -5, -8, 0);
    ctx.closePath();
    ctx.fill();

    // 가방 버클
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(-3, -2, 6, 4);

    // 가방 손잡이
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -8, 5, Math.PI, 0);
    ctx.stroke();

    ctx.restore();

    // 가방 텍스트
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('가방', btnX + btnSize / 2, btnY + btnSize + 12);
    ctx.textAlign = 'left';

    // 보스 HP 바 (isHpBig가 true인 몬스터)
    const bossMonster = monsters.find(m => m.alive && m.isHpBig);
    if (bossMonster) {
        const bossBarWidth = 300;
        const bossBarHeight = 12;
        const bossBarX = canvas.width / 2 - bossBarWidth / 2;
        const bossBarY = 60;

        // 배경
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(bossBarX - 5, bossBarY - 18, bossBarWidth + 10, bossBarHeight + 22);
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 2;
        ctx.strokeRect(bossBarX - 5, bossBarY - 18, bossBarWidth + 10, bossBarHeight + 22);

        // 보스 이름
        ctx.fillStyle = '#ff6666';
        ctx.font = 'bold 11px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(bossMonster.name, canvas.width / 2, bossBarY - 5);

        // HP 바 배경
        ctx.fillStyle = '#333';
        ctx.fillRect(bossBarX, bossBarY, bossBarWidth, bossBarHeight);

        // HP 바
        const bossHpPercent = bossMonster.hp / bossMonster.maxHp;
        const gradient = ctx.createLinearGradient(bossBarX, bossBarY, bossBarX + bossBarWidth * bossHpPercent, bossBarY);
        gradient.addColorStop(0, '#ff0000');
        gradient.addColorStop(0.5, '#ff4444');
        gradient.addColorStop(1, '#ff6666');
        ctx.fillStyle = gradient;
        ctx.fillRect(bossBarX, bossBarY, bossBarWidth * bossHpPercent, bossBarHeight);

        // HP 바 테두리
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(bossBarX, bossBarY, bossBarWidth, bossBarHeight);

        // HP 숫자
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px Arial';
        ctx.fillText(`${bossMonster.hp} / ${bossMonster.maxHp}`, canvas.width / 2, bossBarY + 10);
        ctx.textAlign = 'left';
    }

    // 장비 패널
    if (equipmentPanelOpen) {
        drawEquipmentPanel();
    }
}

// 장비 패널 그리기
function drawEquipmentPanel() {
    const panelX = canvas.width / 2 - 350;
    const panelY = canvas.height / 2 - 180;
    const panelWidth = 700;
    const panelHeight = 410;

    // 반투명 오버레이
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 패널 배경
    ctx.fillStyle = 'rgba(40, 40, 60, 0.95)';
    ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
    ctx.strokeStyle = '#6666AA';
    ctx.lineWidth = 3;
    ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);

    // 제목
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('가방', panelX + panelWidth / 2, panelY + 30);

    // 닫기 버튼
    ctx.fillStyle = '#FF4444';
    ctx.fillRect(panelX + panelWidth - 30, panelY + 5, 25, 25);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 16px Arial';
    ctx.fillText('X', panelX + panelWidth - 17, panelY + 22);

    // 장비 슬롯 (좌측) - 캐릭터 중심 레이아웃
    const charCenterX = panelX + 115;
    const charCenterY = panelY + 150;
    const slotSize = 40;

    // 슬롯 위치 정의 (캐릭터 주변)
    const slotPositions = {
        helmet: { x: charCenterX - slotSize / 2, y: charCenterY - 85 },        // 머리 위
        armor: { x: charCenterX + 35, y: charCenterY - 5 },                    // 오른쪽 몸통
        weapon: { x: charCenterX - slotSize - 35, y: charCenterY - 5 },        // 왼쪽 (무기)
        boots: { x: charCenterX - slotSize / 2, y: charCenterY + 65 }          // 발 아래
    };

    // 캐릭터 그리기 (게임 플레이어와 동일하게)
    ctx.save();
    const scale = 1.5; // 1.5배 확대
    ctx.translate(charCenterX, charCenterY - 25);
    ctx.scale(scale, scale);

    // 몸통
    ctx.fillStyle = '#4a90d9';
    ctx.fillRect(-12, 16, 24, 24);

    // 머리
    ctx.fillStyle = '#ffdbac';
    ctx.beginPath();
    ctx.arc(0, 12, 12, 0, Math.PI * 2);
    ctx.fill();

    // 머리카락
    ctx.fillStyle = '#4a3728';
    ctx.beginPath();
    ctx.arc(0, 8, 10, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-10, 4, 20, 6);

    // 눈
    ctx.fillStyle = '#000';
    ctx.fillRect(-4, 10, 3, 4);
    ctx.fillRect(2, 10, 3, 4);

    // 팔
    ctx.fillStyle = '#ffdbac';
    ctx.fillRect(8, 22, 8, 6);
    ctx.fillRect(-16, 22, 8, 6);

    // 다리
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(-10, 40, 8, 10);
    ctx.fillRect(2, 40, 8, 10);

    ctx.restore();

    // 슬롯 그리기
    const slots = ['helmet', 'armor', 'weapon', 'boots'];

    for (const slot of slots) {
        const pos = slotPositions[slot];
        const slotX = pos.x;
        const slotY = pos.y;

        // 슬롯 배경
        ctx.fillStyle = 'rgba(60, 60, 80, 0.8)';
        ctx.fillRect(slotX, slotY, slotSize, slotSize);
        ctx.strokeStyle = '#888888';
        ctx.lineWidth = 1;
        ctx.strokeRect(slotX, slotY, slotSize, slotSize);

        // 슬롯 라벨 (슬롯 아래)
        ctx.fillStyle = '#888888';
        ctx.font = '9px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(SLOT_NAMES[slot], slotX + slotSize / 2, slotY + slotSize + 11);

        // 장착된 장비
        if (player.equipment[slot]) {
            const def = EQUIPMENT_DEFINITIONS[player.equipment[slot]];
            if (def) {
                // 아이콘 그리기
                drawEquipmentIcon(ctx, slotX, slotY, slotSize, def.type, def.color);

                ctx.strokeStyle = RARITY_COLORS[def.rarity];
                ctx.lineWidth = 2;
                ctx.strokeRect(slotX, slotY, slotSize, slotSize);

                // 등급 표시 (왼쪽 위)
                ctx.fillStyle = RARITY_COLORS[def.rarity];
                ctx.font = 'bold 10px Arial';
                ctx.textAlign = 'left';
                ctx.fillText(def.rarity, slotX + 2, slotY + 11);
            }
        }
    }
    ctx.textAlign = 'left';

    // 탭 (우측 상단)
    const tabX = panelX + 230;
    const tabY = panelY + 50;
    const tabWidth = 62;
    const tabHeight = 25;
    const tabGap = 5;

    for (let i = 0; i < EQUIPMENT_TABS.length; i++) {
        const tab = EQUIPMENT_TABS[i];
        const tx = tabX + i * (tabWidth + tabGap);
        const isSelected = (tab === selectedEquipmentTab);

        // 탭 배경
        ctx.fillStyle = isSelected ? 'rgba(100, 100, 150, 0.9)' : 'rgba(50, 50, 70, 0.8)';
        ctx.fillRect(tx, tabY, tabWidth, tabHeight);
        ctx.strokeStyle = isSelected ? '#AAAAFF' : '#555555';
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.strokeRect(tx, tabY, tabWidth, tabHeight);

        // 탭 텍스트
        ctx.fillStyle = isSelected ? '#FFFFFF' : '#AAAAAA';
        ctx.font = 'bold 11px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(TAB_NAMES[tab], tx + tabWidth / 2, tabY + 17);
    }
    ctx.textAlign = 'left';

    // 현재 탭의 인벤토리
    const currentTabInventory = player.inventory[selectedEquipmentTab];
    // 현재 탭에 장착중인 장비
    const equippedItemId = player.equipment[selectedEquipmentTab];

    // 표시할 아이템 목록 생성 (장착중인 아이템을 맨 앞에)
    const displayItems = [];
    if (equippedItemId) {
        displayItems.push({ id: equippedItemId, equipped: true });
    }
    for (const itemId of currentTabInventory) {
        displayItems.push({ id: itemId, equipped: false });
    }

    // 인벤토리 (우측)
    const invX = panelX + 230;
    const invY = tabY + tabHeight + 10;
    const invCols = 8;
    const invRows = 4;
    const invSlotSize = 45;
    const invGap = 5;
    const maxDisplaySlots = invCols * invRows; // 15칸

    // 스크롤 범위 제한
    const totalRows = Math.ceil(displayItems.length / invCols);
    const maxScrollRow = Math.max(0, totalRows - invRows);
    if (inventoryScrollRow > maxScrollRow) inventoryScrollRow = maxScrollRow;
    if (inventoryScrollRow < 0) inventoryScrollRow = 0;

    const startIndex = inventoryScrollRow * invCols;

    for (let i = 0; i < maxDisplaySlots; i++) {
        const col = i % invCols;
        const row = Math.floor(i / invCols);
        const itemX = invX + col * (invSlotSize + invGap);
        const itemY = invY + row * (invSlotSize + invGap);

        ctx.fillStyle = 'rgba(50, 50, 70, 0.8)';
        ctx.fillRect(itemX, itemY, invSlotSize, invSlotSize);

        const actualIndex = startIndex + i;
        const isSelected = (actualIndex === selectedInventoryIndex);

        if (isSelected) {
            ctx.strokeStyle = '#FFFF00';
            ctx.lineWidth = 3;
        } else {
            ctx.strokeStyle = '#555555';
            ctx.lineWidth = 1;
        }
        ctx.strokeRect(itemX, itemY, invSlotSize, invSlotSize);

        if (actualIndex < displayItems.length) {
            const item = displayItems[actualIndex];
            const def = getItemDefinition(item.id, selectedEquipmentTab);
            if (def) {
                // 아이콘 그리기
                drawEquipmentIcon(ctx, itemX, itemY, invSlotSize, def.type, def.color);

                ctx.strokeStyle = RARITY_COLORS[def.rarity];
                ctx.lineWidth = 2;
                ctx.strokeRect(itemX, itemY, invSlotSize, invSlotSize);

                // 등급 표시 (왼쪽 위)
                ctx.fillStyle = RARITY_COLORS[def.rarity];
                ctx.font = 'bold 10px Arial';
                ctx.textAlign = 'left';
                ctx.fillText(def.rarity, itemX + 3, itemY + 11);

                // 장착중 표시
                if (item.equipped) {
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                    ctx.fillRect(itemX, itemY + invSlotSize - 14, invSlotSize, 14);
                    ctx.fillStyle = '#00FF00';
                    ctx.font = 'bold 9px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText('장착중', itemX + invSlotSize / 2, itemY + invSlotSize - 3);
                }
            }
        }
    }

    // 스크롤 버튼 및 페이지 정보
    const scrollBtnSize = 24;
    const scrollX = invX + invCols * (invSlotSize + invGap) + 5;
    const scrollUpY = invY;
    const scrollDownY = invY + invRows * (invSlotSize + invGap) - scrollBtnSize;

    // 위로 스크롤 버튼
    ctx.fillStyle = inventoryScrollRow > 0 ? 'rgba(100, 100, 150, 0.9)' : 'rgba(50, 50, 70, 0.5)';
    ctx.fillRect(scrollX, scrollUpY, scrollBtnSize, scrollBtnSize);
    ctx.strokeStyle = inventoryScrollRow > 0 ? '#AAAAFF' : '#555555';
    ctx.lineWidth = 1;
    ctx.strokeRect(scrollX, scrollUpY, scrollBtnSize, scrollBtnSize);
    ctx.fillStyle = inventoryScrollRow > 0 ? '#FFFFFF' : '#666666';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('▲', scrollX + scrollBtnSize / 2, scrollUpY + 17);

    // 아래로 스크롤 버튼
    ctx.fillStyle = inventoryScrollRow < maxScrollRow ? 'rgba(100, 100, 150, 0.9)' : 'rgba(50, 50, 70, 0.5)';
    ctx.fillRect(scrollX, scrollDownY, scrollBtnSize, scrollBtnSize);
    ctx.strokeStyle = inventoryScrollRow < maxScrollRow ? '#AAAAFF' : '#555555';
    ctx.lineWidth = 1;
    ctx.strokeRect(scrollX, scrollDownY, scrollBtnSize, scrollBtnSize);
    ctx.fillStyle = inventoryScrollRow < maxScrollRow ? '#FFFFFF' : '#666666';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('▼', scrollX + scrollBtnSize / 2, scrollDownY + 17);

    // 페이지 정보
    ctx.fillStyle = '#AAAAAA';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    const pageInfo = `${inventoryScrollRow + 1}/${Math.max(1, totalRows - invRows + 1)}`;
    ctx.fillText(pageInfo, scrollX + scrollBtnSize / 2, scrollUpY + scrollBtnSize + (scrollDownY - scrollUpY - scrollBtnSize) / 2 + 4);

    // 스탯 표시
    ctx.fillStyle = '#CCCCCC';
    ctx.font = '12px Arial';
    ctx.textAlign = 'left';

    const statsY = panelY + panelHeight - 60;
    ctx.fillText(`총 공격력: ${player.getTotalAttackDamage()}`, panelX + 20, statsY);
    ctx.fillText(`총 방어력: ${player.getTotalDefense()}`, panelX + 20, statsY + 18);
    ctx.fillText(`총 최대HP: ${player.getTotalMaxHp()}`, panelX + 150, statsY);
    ctx.fillText(`추가 속도: +${player.equipmentStats.speed.toFixed(1)}`, panelX + 150, statsY + 18);
    ctx.fillText(`추가 점프: +${player.equipmentStats.extraJump}`, panelX + 280, statsY);

    ctx.textAlign = 'left';

    // 장비 상세 정보창
    if (viewingEquipmentId) {
        drawEquipmentDetail();
    }
}

// 장비 상세 정보창 그리기
function drawEquipmentDetail() {
    const found = findDefinition(viewingEquipmentId);
    if (!found) return;
    const def = found.def;
    const category = found.category;

    const detailW = 220;
    const detailH = 200;
    const detailX = canvas.width / 2 - detailW / 2;
    const detailY = canvas.height / 2 - detailH / 2;

    // 반투명 오버레이
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 패널 배경
    ctx.fillStyle = 'rgba(30, 30, 50, 0.98)';
    ctx.fillRect(detailX, detailY, detailW, detailH);
    ctx.strokeStyle = RARITY_COLORS[def.rarity];
    ctx.lineWidth = 3;
    ctx.strokeRect(detailX, detailY, detailW, detailH);

    // 닫기 버튼
    ctx.fillStyle = '#FF4444';
    ctx.fillRect(detailX + detailW - 25, detailY + 5, 20, 20);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('X', detailX + detailW - 15, detailY + 19);

    // 아이콘
    const iconSize = 50;
    const iconX = detailX + 15;
    const iconY = detailY + 15;
    ctx.fillStyle = 'rgba(60, 60, 80, 0.8)';
    ctx.fillRect(iconX, iconY, iconSize, iconSize);
    drawEquipmentIcon(ctx, iconX, iconY, iconSize, def.type, def.color);
    ctx.strokeStyle = RARITY_COLORS[def.rarity];
    ctx.lineWidth = 2;
    ctx.strokeRect(iconX, iconY, iconSize, iconSize);

    // 등급 표시
    ctx.fillStyle = RARITY_COLORS[def.rarity];
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(def.rarity, iconX + 3, iconY + 14);

    // 이름
    ctx.fillStyle = RARITY_COLORS[def.rarity];
    ctx.font = 'bold 16px Arial';
    ctx.fillText(def.name, iconX + iconSize + 10, iconY + 20);

    // 종류
    ctx.fillStyle = '#AAAAAA';
    ctx.font = '12px Arial';
    const typeName = SLOT_NAMES[def.type] || TAB_NAMES[category] || def.type;
    ctx.fillText(typeName, iconX + iconSize + 10, iconY + 38);

    // 스탯/설명
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '13px Arial';
    let statY = detailY + 85;

    if (category === 'equipment' && def.stats) {
        if (def.stats.attackDamage) {
            ctx.fillText(`공격력: +${def.stats.attackDamage}`, detailX + 20, statY);
            statY += 20;
        }
        if (def.stats.defense) {
            ctx.fillText(`방어력: +${def.stats.defense}`, detailX + 20, statY);
            statY += 20;
        }
        if (def.stats.maxHp) {
            ctx.fillText(`최대 HP: +${def.stats.maxHp}`, detailX + 20, statY);
            statY += 20;
        }
        if (def.stats.speed) {
            ctx.fillText(`속도: +${def.stats.speed.toFixed(1)}`, detailX + 20, statY);
            statY += 20;
        }
        if (def.stats.extraJump) {
            ctx.fillText(`추가 점프: +${def.stats.extraJump}`, detailX + 20, statY);
            statY += 20;
        }
    } else if (category === 'material') {
        if (def.description) {
            ctx.fillText(def.description, detailX + 20, statY);
            statY += 20;
        }
        ctx.fillText(`최대 보유: ${def.stackMax}`, detailX + 20, statY);
    } else if (category === 'item') {
        if (def.description) {
            ctx.fillText(def.description, detailX + 20, statY);
            statY += 20;
        }
        if (def.effect && def.value) {
            ctx.fillText(`효과: ${def.effect} (${def.value})`, detailX + 20, statY);
            statY += 20;
        }
        ctx.fillText(`최대 보유: ${def.stackMax}`, detailX + 20, statY);
    }

    // 장착/해제 버튼 (장비만)
    if (category === 'equipment') {
        const btnY = detailY + detailH - 40;
        const btnText = viewingEquipmentSlot ? '해제' : '장착';
        const btnColor = viewingEquipmentSlot ? '#FF6666' : '#66AA66';

        ctx.fillStyle = btnColor;
        ctx.fillRect(detailX + 20, btnY, 80, 30);
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1;
        ctx.strokeRect(detailX + 20, btnY, 80, 30);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(btnText, detailX + 60, btnY + 20);
    }

    ctx.textAlign = 'left';
}

// 장비 아이콘 그리기 함수
function drawEquipmentIcon(ctx, x, y, size, slotType, color) {
    ctx.save();
    ctx.fillStyle = color;

    const cx = x + size / 2;
    const cy = y + size / 2;
    const s = size * 0.35; // 아이콘 스케일

    if (slotType === 'weapon') {
        // 검 아이콘
        ctx.beginPath();
        ctx.moveTo(cx, cy - s);
        ctx.lineTo(cx + s * 0.15, cy + s * 0.6);
        ctx.lineTo(cx - s * 0.15, cy + s * 0.6);
        ctx.closePath();
        ctx.fill();
        // 손잡이
        ctx.fillRect(cx - s * 0.25, cy + s * 0.5, s * 0.5, s * 0.15);
        ctx.fillRect(cx - s * 0.1, cy + s * 0.6, s * 0.2, s * 0.35);
    } else if (slotType === 'helmet') {
        // 투구 아이콘
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.7, Math.PI, 0, false);
        ctx.lineTo(cx + s * 0.7, cy + s * 0.4);
        ctx.lineTo(cx - s * 0.7, cy + s * 0.4);
        ctx.closePath();
        ctx.fill();
        // 바이저
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(cx - s * 0.5, cy, s, s * 0.25);
    } else if (slotType === 'armor') {
        // 갑옷 아이콘
        ctx.beginPath();
        ctx.moveTo(cx, cy - s * 0.7);
        ctx.lineTo(cx + s * 0.5, cy - s * 0.4);
        ctx.lineTo(cx + s * 0.7, cy - s * 0.2);
        ctx.lineTo(cx + s * 0.4, cy + s * 0.7);
        ctx.lineTo(cx, cy + s * 0.5);
        ctx.lineTo(cx - s * 0.4, cy + s * 0.7);
        ctx.lineTo(cx - s * 0.7, cy - s * 0.2);
        ctx.lineTo(cx - s * 0.5, cy - s * 0.4);
        ctx.closePath();
        ctx.fill();
    } else if (slotType === 'boots') {
        // 신발 아이콘
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.3, cy - s * 0.5);
        ctx.lineTo(cx - s * 0.3, cy + s * 0.3);
        ctx.lineTo(cx - s * 0.6, cy + s * 0.5);
        ctx.lineTo(cx + s * 0.2, cy + s * 0.5);
        ctx.lineTo(cx + s * 0.2, cy - s * 0.5);
        ctx.closePath();
        ctx.fill();
        // 오른쪽 신발
        ctx.beginPath();
        ctx.moveTo(cx + s * 0.35, cy - s * 0.5);
        ctx.lineTo(cx + s * 0.35, cy + s * 0.3);
        ctx.lineTo(cx + s * 0.05, cy + s * 0.5);
        ctx.lineTo(cx + s * 0.7, cy + s * 0.5);
        ctx.lineTo(cx + s * 0.7, cy - s * 0.5);
        ctx.closePath();
        ctx.fill();
    } else if (slotType === 'ore') {
        // 광석 아이콘 (육각형)
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (i * 60 - 30) * Math.PI / 180;
            const px = cx + s * 0.7 * Math.cos(angle);
            const py = cy + s * 0.7 * Math.sin(angle);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
    } else if (slotType === 'herb') {
        // 약초 아이콘 (잎사귀)
        ctx.beginPath();
        ctx.moveTo(cx, cy + s * 0.6);
        ctx.quadraticCurveTo(cx - s * 0.8, cy, cx, cy - s * 0.6);
        ctx.quadraticCurveTo(cx + s * 0.8, cy, cx, cy + s * 0.6);
        ctx.fill();
        // 줄기
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy + s * 0.6);
        ctx.lineTo(cx, cy + s * 0.9);
        ctx.stroke();
    } else if (slotType === 'leather') {
        // 가죽 아이콘 (두루마리 형태)
        ctx.fillRect(cx - s * 0.5, cy - s * 0.4, s, s * 0.8);
        ctx.beginPath();
        ctx.arc(cx - s * 0.5, cy - s * 0.2, s * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + s * 0.5, cy + s * 0.2, s * 0.2, 0, Math.PI * 2);
        ctx.fill();
    } else if (slotType === 'wood') {
        // 목재 아이콘 (통나무)
        ctx.fillRect(cx - s * 0.6, cy - s * 0.25, s * 1.2, s * 0.5);
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.arc(cx + s * 0.6, cy, s * 0.25, 0, Math.PI * 2);
        ctx.fill();
    } else if (slotType === 'gem') {
        // 보석 아이콘 (다이아몬드)
        ctx.beginPath();
        ctx.moveTo(cx, cy - s * 0.7);
        ctx.lineTo(cx + s * 0.5, cy - s * 0.2);
        ctx.lineTo(cx + s * 0.3, cy + s * 0.7);
        ctx.lineTo(cx - s * 0.3, cy + s * 0.7);
        ctx.lineTo(cx - s * 0.5, cy - s * 0.2);
        ctx.closePath();
        ctx.fill();
    } else if (slotType === 'potion') {
        // 포션 아이콘 (병)
        ctx.fillRect(cx - s * 0.15, cy - s * 0.7, s * 0.3, s * 0.3);
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.15, cy - s * 0.4);
        ctx.lineTo(cx - s * 0.4, cy + s * 0.2);
        ctx.lineTo(cx - s * 0.4, cy + s * 0.7);
        ctx.lineTo(cx + s * 0.4, cy + s * 0.7);
        ctx.lineTo(cx + s * 0.4, cy + s * 0.2);
        ctx.lineTo(cx + s * 0.15, cy - s * 0.4);
        ctx.closePath();
        ctx.fill();
    } else if (slotType === 'scroll') {
        // 주문서 아이콘 (두루마리)
        ctx.fillRect(cx - s * 0.4, cy - s * 0.5, s * 0.8, s);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(cx - s * 0.25, cy - s * 0.35, s * 0.5, s * 0.1);
        ctx.fillRect(cx - s * 0.25, cy - s * 0.15, s * 0.5, s * 0.1);
        ctx.fillRect(cx - s * 0.25, cy + s * 0.05, s * 0.5, s * 0.1);
    } else if (slotType === 'food') {
        // 음식 아이콘 (고기)
        ctx.beginPath();
        ctx.ellipse(cx, cy, s * 0.6, s * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(139,69,19,0.8)';
        ctx.fillRect(cx - s * 0.1, cy + s * 0.3, s * 0.2, s * 0.4);
    } else if (slotType === 'bomb') {
        // 폭탄 아이콘
        ctx.beginPath();
        ctx.arc(cx, cy + s * 0.1, s * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy - s * 0.4);
        ctx.lineTo(cx + s * 0.2, cy - s * 0.7);
        ctx.stroke();
        ctx.fillStyle = '#FF4500';
        ctx.beginPath();
        ctx.arc(cx + s * 0.2, cy - s * 0.7, s * 0.15, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

// 전투 처리
function handleCombat() {
    // 플레이어 공격 -> 몬스터
    if (player.attacking && player.attackTimer === 9) {
        const hitbox = player.getAttackHitbox();
        for (let monster of monsters) {
            if (monster.alive &&
                hitbox.x < monster.x + monster.width &&
                hitbox.x + hitbox.width > monster.x &&
                hitbox.y < monster.y + monster.height &&
                hitbox.y + hitbox.height > monster.y) {

                // 치명타 판정 (10% 확률, 5배 데미지)
                let damage = player.getTotalAttackDamage();
                const isCritical = Math.random() < 0.1;
                if (isCritical) {
                    damage *= 5;
                    damageTexts.push(new DamageText(
                        monster.x + monster.width / 2,
                        monster.y - 40,
                        'CRITICAL!',
                        '#ff0000'
                    ));
                }

                monster.takeDamage(damage, player.x);
                // 번개 버프가 있으면 번개 발동
                if (player.lightningBuff) {
                    player.triggerBuffLightning(monster);
                }
            }
        }
    }

    // 내리찍기 공격 (위에서 밟기)
    if (player.velY > 0) { // 플레이어가 떨어지는 중
        for (let monster of monsters) {
            if (monster.alive && player.collidesWith(monster)) {
                // 플레이어 발이 몬스터 머리 근처인지 확인
                const playerBottom = player.y + player.height;
                const monsterTop = monster.y;

                if (playerBottom <= monsterTop + 20 && playerBottom >= monsterTop - 5) {
                    // 내리찍기 데미지 (기본 공격력의 1.5배)
                    let stompDamage = Math.floor(player.attackDamage * 1.5);

                    // 치명타 판정 (10% 확률, 5배 데미지)
                    const isCritical = Math.random() < 0.1;
                    if (isCritical) {
                        stompDamage *= 5;
                        damageTexts.push(new DamageText(
                            monster.x + monster.width / 2,
                            monster.y - 50,
                            'CRITICAL!',
                            '#ff0000'
                        ));
                    }

                    monster.takeDamage(stompDamage, player.x + player.width / 2);

                    // 내리찍기 텍스트
                    damageTexts.push(new DamageText(
                        monster.x + monster.width / 2,
                        monster.y - 30,
                        'STOMP!',
                        '#ff8800'
                    ));

                    // 플레이어 바운스
                    player.velY = -10;
                    player.jumpCount = 1; // 점프 카운트 리셋 (더블점프 가능)

                    // 0.5초 무적
                    player.invincible = true;
                    player.invincibleTimer = 30; // 0.5초 (60fps * 0.5)

                    // 번개 버프가 있으면 번개 발동
                    if (player.lightningBuff) {
                        player.triggerBuffLightning(monster);
                    }

                    break; // 한 번에 하나의 몬스터만 밟기
                }
            }
        }
    }

    // 몬스터 -> 플레이어 충돌 (내리찍기가 아닌 경우에만 데미지)
    for (let monster of monsters) {
        if (monster.alive && player.collidesWith(monster)) {
            // 플레이어가 위에서 떨어지는 중이 아니거나, 밟기 판정이 아닌 경우
            const playerBottom = player.y + player.height;
            const monsterTop = monster.y;
            const isStomping = player.velY > 0 && playerBottom <= monsterTop + 20;

            if (!isStomping) {
                player.takeDamage(monster.damage);
            }
        }
    }
}

// 게임 루프
function gameLoop() {
    // 플레이어 업데이트 (카메라보다 먼저)
    player.update(keys, platforms);

    // 카메라 업데이트
    camera.update(player);

    // 배경 그리기 (패럴랙스 효과 자체 처리)
    drawBackground();

    // 카메라 변환 시작
    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    // 바닥 그리기
    drawGround();

    // 플랫폼 그리기
    platforms.forEach(p => p.draw(ctx));

    // 사다리 그리기
    ladders.forEach(l => l.draw(ctx));

    // 포탈 업데이트 및 그리기
    portals.forEach(p => {
        p.update();
        p.draw(ctx);
    });

    // 아이템 업데이트 및 그리기
    items = items.filter(i => i.update());
    items.forEach(i => {
        i.draw(ctx);
        // 플레이어와 충돌 시 획득
        if (i.collidesWith(player)) {
            i.collect(player);
        }
    });

    // 코인 업데이트 및 그리기
    coins = coins.filter(c => c.update());
    coins.forEach(c => {
        c.draw(ctx);
        // 플레이어와 충돌 시 획득
        if (c.collidesWith(player)) {
            const value = c.collect();
            if (value > 0) {
                player.coins += value;
                damageTexts.push(new DamageText(
                    player.x + player.width / 2,
                    player.y - 10,
                    '+' + value + ' coin',
                    '#ffd700'
                ));
            }
        }
    });

    // 장비 아이템 업데이트 및 그리기
    equipmentItems = equipmentItems.filter(e => e.update());
    equipmentItems.forEach(e => {
        e.draw(ctx);
        if (e.collidesWith(player)) {
            e.collect(player);
        }
    });

    // 스포너 업데이트 및 그리기
    spawners.forEach(s => {
        s.update();
        s.draw(ctx);
    });

    // 몬스터 업데이트 및 그리기
    const newMonsters = [];
    monsters = monsters.filter(m => {
        const result = m.update(platforms);
        // ghostBoss가 소환한 몬스터 수집
        if (m.type === 'ghostBoss' && m.pendingSpawns && m.pendingSpawns.length > 0) {
            newMonsters.push(...m.pendingSpawns);
            m.pendingSpawns = [];
        }
        return result;
    });
    // 소환된 몬스터 추가
    if (newMonsters.length > 0) {
        monsters.push(...newMonsters);
    }
    monsters.forEach(m => m.draw(ctx));

    // 부메랑 업데이트 및 그리기
    boomerangs = boomerangs.filter(b => b.update(player));
    boomerangs.forEach(b => {
        b.draw(ctx);
        // 몬스터와 충돌 체크
        for (let monster of monsters) {
            if (monster.alive && !b.hitMonsters.has(monster) && b.collidesWith(monster)) {
                // 치명타 판정 (10% 확률, 5배 데미지)
                let damage = b.damage;
                const isCritical = Math.random() < 0.1;
                if (isCritical) {
                    damage *= 5;
                    damageTexts.push(new DamageText(
                        monster.x + monster.width / 2,
                        monster.y - 40,
                        'CRITICAL!',
                        '#ff0000'
                    ));
                }

                monster.takeDamage(damage, b.x);
                b.hitMonsters.add(monster);
                // 번개 버프가 있으면 번개 발동
                if (player.lightningBuff) {
                    player.triggerBuffLightning(monster);
                }
            }
        }
    });

    // 번개 업데이트 및 그리기
    lightnings = lightnings.filter(l => l.update());
    lightnings.forEach(l => l.draw(ctx));

    // 플레이어 그리기
    player.draw(ctx);

    // 궤도 화염구 그리기
    if (player.fireballBuff) {
        for (let fb of player.orbitingFireballs) {
            fb.draw(ctx);
        }
    }

    // 데미지 텍스트 (월드 좌표)
    for (let i = damageTexts.length - 1; i >= 0; i--) {
        if (!damageTexts[i].update()) {
            damageTexts.splice(i, 1);
        } else {
            damageTexts[i].draw(ctx);
        }
    }

    // 카메라 변환 종료
    ctx.restore();

    // 전투 처리
    handleCombat();

    // 몬스터 리스폰
    respawnMonsters();

    // UI 그리기 (화면 고정)
    drawUI();

    requestAnimationFrame(gameLoop);
}

// 게임 시작
function initGame() {
    console.log('게임 초기화 중...');

    // 미리보기 모드 확인
    const urlParams = new URLSearchParams(window.location.search);
    const isPreview = urlParams.get('preview') === '1';

    if (isPreview) {
        // 에디터에서 전달한 스테이지 데이터 로드
        isPreviewMode = true;
        const previewData = localStorage.getItem('editorPreviewStage');
        if (previewData) {
            try {
                const stageData = JSON.parse(previewData);
                console.log('미리보기 모드: 에디터 스테이지 로드');
                applyStageData(stageData, 'Preview');
            } catch (e) {
                console.error('미리보기 데이터 파싱 실패:', e);
                loadStage("Lobby");
            }
        } else {
            loadStage("Lobby");
        }
    } else {
        // 로비 로드
        loadStage("Lobby");
    }

    gameInitialized = true;
    console.log('메이플 스타일 게임이 시작되었습니다!');
    console.log('조작법: ← → 이동, Space/↑ 점프, Z/Ctrl 공격');
    gameLoop();
}

initGame();
