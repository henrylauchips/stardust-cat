// src/entities.js — 《星塵貓大作戰》浮動搖桿、固定容量物件池、玩家、敵人、星塵與震動系統

import { GAME_CONFIG, CATS, STAGES } from './config.js';

const CAT_MAP = new Map(CATS.map((cat) => [cat.id, cat]));

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function roundHalf(value) {
  return Math.round(value * 2) / 2;
}

// ---------------------------------------------------------------------------
// 通用固定容量物件池（零執行期配置，避免 iOS GC 卡頓）
// ---------------------------------------------------------------------------

export class ObjectPool {
  constructor(capacity, factoryFn) {
    this.capacity = Math.max(1, capacity);
    this.items = new Array(this.capacity);
    this.activeCount = 0;

    for (let i = 0; i < this.capacity; i++) {
      const item = factoryFn(i);
      item.active = false;
      item._poolIndex = i;
      this.items[i] = item;
    }
  }

  acquire() {
    for (let i = 0; i < this.capacity; i++) {
      const item = this.items[i];
      if (!item.active) {
        item.active = true;
        this.activeCount++;
        return item;
      }
    }
    return null;
  }

  release(item) {
    if (!item || !item.active) {
      return;
    }
    item.active = false;
    if (this.activeCount > 0) {
      this.activeCount--;
    }
  }

  clear() {
    for (let i = 0; i < this.capacity; i++) {
      this.items[i].active = false;
    }
    this.activeCount = 0;
  }

  forEachActive(callback) {
    for (let i = 0; i < this.capacity; i++) {
      const item = this.items[i];
      if (item.active) {
        callback(item, i);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 全畫面浮動隱形搖桿（單一 pointerId 追蹤，絕不卡鍵）
// ---------------------------------------------------------------------------

export class FloatingJoystick {
  constructor(maxRadius = GAME_CONFIG.JOYSTICK_MAX_R) {
    this.maxRadius = maxRadius;
    this.deadZone = 4;
    this.pointerId = null;
    this.active = false;

    this.originX = 0;
    this.originY = 0;
    this.currentX = 0;
    this.currentY = 0;

    // 歸一化移動向量（-1 ~ 1）與推桿力度（0 ~ 1）
    this.dx = 0;
    this.dy = 0;
    this.strength = 0;
    this.visualAlpha = 0;

    // 桌面測試備援鍵盤狀態（不影響手機觸控）
    this._keys = {
      up: false,
      down: false,
      left: false,
      right: false,
    };

    this._target = null;
    this._boundDown = this._onPointerDown.bind(this);
    this._boundMove = this._onPointerMove.bind(this);
    this._boundUp = this._onPointerUpOrCancel.bind(this);
    this._boundReset = this.reset.bind(this);
    this._boundVisibility = this._onVisibilityChange.bind(this);
    this._boundKeyDown = this._onKeyDown.bind(this);
    this._boundKeyUp = this._onKeyUp.bind(this);
  }

  attach(element) {
    if (this._target === element) {
      return;
    }
    this.detach();
    this._target = element;

    element.addEventListener('pointerdown', this._boundDown, { passive: false });
    window.addEventListener('pointermove', this._boundMove, { passive: false });
    window.addEventListener('pointerup', this._boundUp, { passive: true });
    window.addEventListener('pointercancel', this._boundUp, { passive: true });
    window.addEventListener('blur', this._boundReset);
    document.addEventListener('visibilitychange', this._boundVisibility);
    window.addEventListener('keydown', this._boundKeyDown);
    window.addEventListener('keyup', this._boundKeyUp);
  }

  detach() {
    if (!this._target) {
      return;
    }
    this._target.removeEventListener('pointerdown', this._boundDown);
    window.removeEventListener('pointermove', this._boundMove);
    window.removeEventListener('pointerup', this._boundUp);
    window.removeEventListener('pointercancel', this._boundUp);
    window.removeEventListener('blur', this._boundReset);
    document.removeEventListener('visibilitychange', this._boundVisibility);
    window.removeEventListener('keydown', this._boundKeyDown);
    window.removeEventListener('keyup', this._boundKeyUp);
    this._target = null;
    this.reset();
  }

  reset() {
    this.pointerId = null;
    this.active = false;
    this.dx = 0;
    this.dy = 0;
    this.strength = 0;
    this._keys.up = false;
    this._keys.down = false;
    this._keys.left = false;
    this._keys.right = false;
  }

  _onVisibilityChange() {
    if (document.hidden) {
      this.reset();
    }
  }

  _getLocalPoint(event) {
    if (!this._target) {
      return { x: event.clientX, y: event.clientY };
    }
    const rect = this._target.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  _onPointerDown(event) {
    if (this.pointerId !== null) {
      return;
    }
    if (event.button !== undefined && event.button !== 0 && event.pointerType === 'mouse') {
      return;
    }

    event.preventDefault();
    const pt = this._getLocalPoint(event);
    this.pointerId = event.pointerId;
    this.active = true;
    this.originX = pt.x;
    this.originY = pt.y;
    this.currentX = pt.x;
    this.currentY = pt.y;
    this.dx = 0;
    this.dy = 0;
    this.strength = 0;

    if (this._target && typeof this._target.setPointerCapture === 'function') {
      try {
        this._target.setPointerCapture(event.pointerId);
      } catch (_err) {
        // 某些瀏覽器非觸控事件不支援 capture，安全略過
      }
    }
  }

  _onPointerMove(event) {
    if (!this.active || event.pointerId !== this.pointerId) {
      return;
    }

    event.preventDefault();
    const pt = this._getLocalPoint(event);
    const rawX = pt.x - this.originX;
    const rawY = pt.y - this.originY;
    const dist = Math.hypot(rawX, rawY);

    if (dist <= this.deadZone) {
      this.currentX = pt.x;
      this.currentY = pt.y;
      this.dx = 0;
      this.dy = 0;
      this.strength = 0;
      return;
    }

    const clampedDist = Math.min(dist, this.maxRadius);
    const nx = rawX / dist;
    const ny = rawY / dist;

    this.currentX = this.originX + nx * clampedDist;
    this.currentY = this.originY + ny * clampedDist;
    this.strength = clampedDist / this.maxRadius;
    this.dx = nx * this.strength;
    this.dy = ny * this.strength;
  }

  _onPointerUpOrCancel(event) {
    if (this.pointerId === null || event.pointerId !== this.pointerId) {
      return;
    }

    if (this._target && typeof this._target.releasePointerCapture === 'function') {
      try {
        if (this._target.hasPointerCapture(event.pointerId)) {
          this._target.releasePointerCapture(event.pointerId);
        }
      } catch (_err) {
        // 忽略已釋放狀態
      }
    }

    this.pointerId = null;
    this.active = false;
    this.dx = 0;
    this.dy = 0;
    this.strength = 0;
  }

  _onKeyDown(event) {
    if (event.code === 'ArrowUp' || event.code === 'KeyW') this._keys.up = true;
    if (event.code === 'ArrowDown' || event.code === 'KeyS') this._keys.down = true;
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') this._keys.left = true;
    if (event.code === 'ArrowRight' || event.code === 'KeyD') this._keys.right = true;
  }

  _onKeyUp(event) {
    if (event.code === 'ArrowUp' || event.code === 'KeyW') this._keys.up = false;
    if (event.code === 'ArrowDown' || event.code === 'KeyS') this._keys.down = false;
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') this._keys.left = false;
    if (event.code === 'ArrowRight' || event.code === 'KeyD') this._keys.right = false;
  }

  getVector(outVec) {
    if (this.active) {
      outVec.x = this.dx;
      outVec.y = this.dy;
      return outVec;
    }

    let kx = 0;
    let ky = 0;
    if (this._keys.left) kx -= 1;
    if (this._keys.right) kx += 1;
    if (this._keys.up) ky -= 1;
    if (this._keys.down) ky += 1;

    if (kx !== 0 || ky !== 0) {
      const len = Math.hypot(kx, ky);
      outVec.x = kx / len;
      outVec.y = ky / len;
    } else {
      outVec.x = 0;
      outVec.y = 0;
    }
    return outVec;
  }

  update(dt) {
    const targetAlpha = this.active ? 1 : 0;
    const speed = this.active ? 16 : 10;
    this.visualAlpha += (targetAlpha - this.visualAlpha) * Math.min(1, dt * speed);
    if (!this.active && this.visualAlpha < 0.01) {
      this.visualAlpha = 0;
    }
  }

  draw(ctx) {
    if (this.visualAlpha <= 0.01) {
      return;
    }

    ctx.save();
    ctx.globalAlpha = this.visualAlpha * 0.42;

    // 外圈柔光底環
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.originX, this.originY, this.maxRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 209, 102, 0.08)';
    ctx.fill();

    // 內圈推桿圓點
    ctx.globalAlpha = this.visualAlpha * 0.72;
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath();
    ctx.arc(this.currentX, this.currentY, 18, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// 柔和阻尼畫面震動（Damped Screen Shake）
// ---------------------------------------------------------------------------

export class ScreenShake {
  constructor() {
    this.intensity = 0;
    this.time = 0;
    this.damping = 11;
    this.offsetX = 0;
    this.offsetY = 0;
    this._phaseX = 0;
    this._phaseY = 0;
  }

  add(amount, damping = 11) {
    if (amount <= 0) {
      return;
    }
    this.intensity = Math.min(14, Math.max(this.intensity, amount));
    this.damping = damping;
    this._phaseX = Math.random() * Math.PI * 2;
    this._phaseY = Math.random() * Math.PI * 2;
  }

  reset() {
    this.intensity = 0;
    this.time = 0;
    this.offsetX = 0;
    this.offsetY = 0;
  }

  update(dt) {
    if (this.intensity <= 0.08) {
      this.intensity = 0;
      this.offsetX = 0;
      this.offsetY = 0;
      return;
    }

    this.time += dt;
    this.intensity *= Math.exp(-this.damping * dt);

    // 高頻阻尼正弦，手感 Q 彈不暈眩
    this.offsetX = Math.sin(this.time * 52 + this._phaseX) * this.intensity;
    this.offsetY = Math.cos(this.time * 46 + this._phaseY) * this.intensity;
  }
}

// ---------------------------------------------------------------------------
// 玩家實體（支援 5 隻貓咪特性、半心生命、無敵幀與升級經驗條）
// ---------------------------------------------------------------------------

export class Player {
  constructor(catId = CATS[0].id) {
    this._moveVec = { x: 0, y: 0 };
    this.init(catId);
  }

  init(catId) {
    const cat = CAT_MAP.get(catId) || CATS[0];
    this.cat = cat;
    this.catId = cat.id;

    const center = GAME_CONFIG.WORLD_SIZE * 0.5;
    this.x = center;
    this.y = center;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;
    this.moving = false;

    this.hitboxR = GAME_CONFIG.PLAYER_HITBOX_R;
    this.maxHp = cat.stats.maxHp;
    this.hp = cat.stats.maxHp;

    this.invincibleTimer = 0;
    this.hurtFlash = 0;
    this.noHitSec = 0;
    this.bestNoHitSec = 0;

    // 抹茶胖橘貓每 25 秒自動回復半顆心
    this.regenInterval = cat.stats.regenSec || 0;
    this.regenTimer = 0;
    // 溫泉白貓升級釋放全屏擊退星波
    this.hasLevelNova = Boolean(cat.stats.levelNova);

    // 局內升級卡片累積的被動加成
    this.speedMult = 1.0;
    this.magnetMult = 1.0;
    this.bonusCdMult = 1.0;
    this.dmgMult = 1.0;

    // 經驗與等級系統（配合每關 2 分鐘節奏）
    this.level = 1;
    this.xp = 0;
    this.xpToNext = this.computeXpToNext(1);
    this.pendingLevelUps = 0;

    // 單局累計數據
    this.starsCollected = 0;
    this.kills = 0;
    this.dead = false;
  }

  computeXpToNext(level) {
    const lv = Math.max(1, level);
    const raw = 8 + (lv - 1) * 6 + Math.floor((lv - 1) * (lv - 1) * 1.35);
    const mult = this.cat.stats.xpMult || 1.0;
    return Math.max(5, Math.round(raw * mult));
  }

  getEffectiveSpeed() {
    return this.cat.stats.speed * this.speedMult;
  }

  getEffectiveMagnetRadius() {
    return GAME_CONFIG.BASE_MAGNET_R * (this.cat.stats.magnetBonus || 1.0) * this.magnetMult;
  }

  getEffectiveCdMult() {
    return Math.max(0.45, (this.cat.stats.cdMult || 1.0) * this.bonusCdMult);
  }

  getXpRatio() {
    if (this.xpToNext <= 0) {
      return 0;
    }
    return clamp(this.xp / this.xpToNext, 0, 1);
  }

  update(dt, joystick, onAutoHeal = null) {
    if (this.dead) {
      return;
    }

    if (this.invincibleTimer > 0) {
      this.invincibleTimer = Math.max(0, this.invincibleTimer - dt);
    }
    if (this.hurtFlash > 0) {
      this.hurtFlash = Math.max(0, this.hurtFlash - dt * 4.5);
    }

    this.noHitSec += dt;
    if (this.noHitSec > this.bestNoHitSec) {
      this.bestNoHitSec = this.noHitSec;
    }

    // 抹茶胖橘貓自動回血被動
    if (this.regenInterval > 0) {
      if (this.hp < this.maxHp) {
        this.regenTimer += dt;
        if (this.regenTimer >= this.regenInterval) {
          this.regenTimer -= this.regenInterval;
          const healed = this.heal(0.5);
          if (healed > 0 && typeof onAutoHeal === 'function') {
            onAutoHeal(this, healed);
          }
        }
      } else {
        this.regenTimer = 0;
      }
    }

    // 依據浮動搖桿移動
    const vec = joystick ? joystick.getVector(this._moveVec) : this._moveVec;
    const speed = this.getEffectiveSpeed();

    this.vx = vec.x * speed;
    this.vy = vec.y * speed;
    this.moving = Math.abs(this.vx) > 2 || Math.abs(this.vy) > 2;

    if (this.vx < -4) {
      this.facing = -1;
    } else if (this.vx > 4) {
      this.facing = 1;
    }

    const margin = 24;
    const maxCoord = GAME_CONFIG.WORLD_SIZE - margin;
    this.x = clamp(this.x + this.vx * dt, margin, maxCoord);
    this.y = clamp(this.y + this.vy * dt, margin, maxCoord);
  }

  takeDamage(amount = 0.5, shake = null, particles = null) {
    if (this.dead || this.invincibleTimer > 0 || amount <= 0) {
      return false;
    }

    this.hp = Math.max(0, roundHalf(this.hp - amount));
    this.invincibleTimer = GAME_CONFIG.INVINCIBLE_SEC;
    this.hurtFlash = 1.0;
    this.noHitSec = 0;

    if (shake) {
      shake.add(6.5, 11);
    }
    if (particles) {
      particles.spawnBurst(this.x, this.y, 12, '#ff9ebb', 135, 0.45);
      particles.spawnRing(this.x, this.y, 14, 46, '#ff9ebb', 0.3);
    }

    if (this.hp <= 0) {
      this.dead = true;
    }
    return true;
  }

  heal(amount = 0.5) {
    if (this.dead || amount <= 0) {
      return 0;
    }
    const prev = this.hp;
    this.hp = Math.min(this.maxHp, roundHalf(this.hp + amount));
    return roundHalf(this.hp - prev);
  }

  addXp(xpGain, starGain = 1) {
    this.starsCollected += Math.max(0, starGain);
    this.xp += Math.max(0, xpGain);

    let levelsGained = 0;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level += 1;
      this.xpToNext = this.computeXpToNext(this.level);
      this.pendingLevelUps += 1;
      levelsGained += 1;
    }

    return {
      leveledUp: levelsGained > 0,
      levelsGained,
    };
  }
}

// ---------------------------------------------------------------------------
// 6 種小怪原型數值（對應 config.js STAGES.enemies）
// ---------------------------------------------------------------------------

export const ENEMY_ARCHETYPES = {
  dandelion: {
    type: 'dandelion',
    radius: 13,
    hp: 24,
    speed: 64,
    contactDmg: 0.5,
    xp: 2,
    stars: 1,
    color: '#fff3b0',
    wobble: 18,
  },
  box_slime: {
    type: 'box_slime',
    radius: 15,
    hp: 40,
    speed: 58,
    contactDmg: 0.5,
    xp: 3,
    stars: 2,
    color: '#80ed99',
    wobble: 6,
  },
  lantern_jelly: {
    type: 'lantern_jelly',
    radius: 15,
    hp: 48,
    speed: 68,
    contactDmg: 0.5,
    xp: 4,
    stars: 2,
    color: '#ff9ebb',
    wobble: 22,
  },
  dango_hopper: {
    type: 'dango_hopper',
    radius: 14,
    hp: 54,
    speed: 78,
    contactDmg: 0.5,
    xp: 4,
    stars: 3,
    color: '#95d57b',
    wobble: 14,
  },
  yarn_roller: {
    type: 'yarn_roller',
    radius: 15,
    hp: 66,
    speed: 88,
    contactDmg: 0.5,
    xp: 5,
    stars: 3,
    color: '#c77dff',
    wobble: 8,
  },
  firefly_wisp: {
    type: 'firefly_wisp',
    radius: 12,
    hp: 46,
    speed: 98,
    contactDmg: 0.5,
    xp: 5,
    stars: 3,
    color: '#9bf6ff',
    wobble: 28,
  },
};

// ---------------------------------------------------------------------------
// 敵人物件池（含小怪、Boss AI 與地面預警光圈管理）
// ---------------------------------------------------------------------------

export class EnemyPool {
  constructor(capacity = GAME_CONFIG.POOLS.ENEMIES) {
    this._nextUid = 1;
    this.pool = new ObjectPool(capacity, () => ({
      active: false,
      _poolIndex: 0,
      uid: 0,
      type: 'dandelion',
      name: '',
      isBoss: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      knockVx: 0,
      knockVy: 0,
      radius: 14,
      hp: 20,
      maxHp: 20,
      speed: 60,
      contactDmg: 0.5,
      xp: 2,
      stars: 1,
      color: '#ffd166',
      wobble: 10,
      facing: 1,
      scale: 1,
      animSeed: 0,
      hitFlash: 0,
      slowTimer: 0,
      slowFactor: 1,
      // 武器獨立受擊冷卻（無需額外配置 Map）
      bubbleHitCd: 0,
      boomerangHitId: 0,
      boomerangHitCd: 0,
      // Boss 專屬行為狀態
      charging: false,
      bossTimer: 0,
      bossState: 'chase',
      bossDashVx: 0,
      bossDashVy: 0,
      bossDashTimer: 0,
    }));

    // Boss 地面攻擊預警光圈固定池（最多同時 8 個）
    this.warnings = new ObjectPool(8, () => ({
      active: false,
      _poolIndex: 0,
      ownerUid: 0,
      shape: 'circle',
      x: 0,
      y: 0,
      radius: 72,
      innerRadius: 0,
      angle: 0,
      length: 260,
      width: 56,
      color: '#ff6b8b',
      elapsed: 0,
      duration: 1.25,
      progress: 0,
      damage: 1.0,
      kind: 'slam',
    }));

    this.activeBoss = null;
  }

  get activeCount() {
    return this.pool.activeCount;
  }

  clear() {
    this.pool.clear();
    this.warnings.clear();
    this.activeBoss = null;
  }

  spawnEnemy(type, x, y, stage = STAGES[0], elapsedSec = 0) {
    const enemy = this.pool.acquire();
    if (!enemy) {
      return null;
    }

    const base = ENEMY_ARCHETYPES[type] || ENEMY_ARCHETYPES.dandelion;
    const timeHpScale = 1 + (elapsedSec / GAME_CONFIG.STAGE_DURATION) * 0.65;
    const timeSpdScale = 1 + (elapsedSec / GAME_CONFIG.STAGE_DURATION) * 0.16;

    enemy.uid = this._nextUid++;
    enemy.type = base.type;
    enemy.name = '';
    enemy.isBoss = false;
    enemy.x = clamp(x, 20, GAME_CONFIG.WORLD_SIZE - 20);
    enemy.y = clamp(y, 20, GAME_CONFIG.WORLD_SIZE - 20);
    enemy.vx = 0;
    enemy.vy = 0;
    enemy.knockVx = 0;
    enemy.knockVy = 0;
    enemy.radius = base.radius;
    enemy.maxHp = Math.round(base.hp * (stage.hpScale || 1) * timeHpScale);
    enemy.hp = enemy.maxHp;
    enemy.speed = base.speed * (stage.speedScale || 1) * timeSpdScale;
    enemy.contactDmg = base.contactDmg;
    enemy.xp = base.xp;
    enemy.stars = base.stars;
    enemy.color = base.color;
    enemy.wobble = base.wobble;
    enemy.facing = 1;
    enemy.scale = 1;
    enemy.animSeed = Math.random() * 100;
    enemy.hitFlash = 0;
    enemy.slowTimer = 0;
    enemy.slowFactor = 1;
    enemy.bubbleHitCd = 0;
    enemy.boomerangHitId = 0;
    enemy.boomerangHitCd = 0;
    enemy.charging = false;
    enemy.bossTimer = 0;
    enemy.bossState = 'chase';
    enemy.bossDashVx = 0;
    enemy.bossDashVy = 0;
    enemy.bossDashTimer = 0;

    return enemy;
  }

  spawnBoss(stage, x, y) {
    const bossSpec = (stage && stage.boss) || STAGES[0].boss;
    const boss = this.pool.acquire();
    if (!boss) {
      return null;
    }

    boss.uid = this._nextUid++;
    boss.type = bossSpec.id;
    boss.name = bossSpec.name;
    boss.isBoss = true;
    boss.x = clamp(x, 60, GAME_CONFIG.WORLD_SIZE - 60);
    boss.y = clamp(y, 60, GAME_CONFIG.WORLD_SIZE - 60);
    boss.vx = 0;
    boss.vy = 0;
    boss.knockVx = 0;
    boss.knockVy = 0;
    boss.radius = 36;
    boss.maxHp = bossSpec.hp;
    boss.hp = bossSpec.hp;
    boss.speed = bossSpec.speed;
    boss.contactDmg = 1.0;
    boss.xp = 30;
    boss.stars = 40;
    boss.color = '#ffd166';
    boss.wobble = 0;
    boss.facing = 1;
    boss.scale = 1;
    boss.animSeed = 0;
    boss.hitFlash = 0;
    boss.slowTimer = 0;
    boss.slowFactor = 1;
    boss.bubbleHitCd = 0;
    boss.boomerangHitId = 0;
    boss.boomerangHitCd = 0;
    boss.charging = false;
    boss.bossTimer = 2.4;
    boss.bossState = 'chase';
    boss.bossDashVx = 0;
    boss.bossDashVy = 0;
    boss.bossDashTimer = 0;

    this.activeBoss = boss;
    return boss;
  }

  damageEnemy(enemy, damage, knockX = 0, knockY = 0, callbacks = null) {
    if (!enemy || !enemy.active || damage <= 0) {
      return false;
    }

    enemy.hp -= damage;
    enemy.hitFlash = 1.0;

    const kbResist = enemy.isBoss ? 0.14 : 1.0;
    enemy.knockVx += knockX * kbResist;
    enemy.knockVy += knockY * kbResist;

    if (callbacks && callbacks.particles) {
      callbacks.particles.spawnBurst(enemy.x, enemy.y, enemy.isBoss ? 6 : 4, '#fff3c4', 90, 0.25);
    }

    if (enemy.hp <= 0) {
      const deadX = enemy.x;
      const deadY = enemy.y;
      const wasBoss = enemy.isBoss;
      const xpVal = enemy.xp;
      const starVal = enemy.stars;
      const color = enemy.color;

      if (wasBoss) {
        this._clearWarningsByOwner(enemy.uid);
        if (this.activeBoss === enemy) {
          this.activeBoss = null;
        }
      }

      this.pool.release(enemy);

      if (callbacks) {
        if (callbacks.particles) {
          callbacks.particles.spawnBurst(deadX, deadY, wasBoss ? 28 : 9, color, wasBoss ? 200 : 120, wasBoss ? 0.75 : 0.42);
          if (wasBoss) {
            callbacks.particles.spawnRing(deadX, deadY, 20, 120, '#ffd166', 0.55);
          }
        }
        if (callbacks.gems) {
          if (wasBoss) {
            for (let i = 0; i < 12; i++) {
              const a = (i / 12) * Math.PI * 2;
              const d = 16 + Math.random() * 28;
              callbacks.gems.spawn(deadX + Math.cos(a) * d, deadY + Math.sin(a) * d, 3, 4);
            }
          } else {
            callbacks.gems.spawn(deadX, deadY, xpVal, starVal);
          }
        }
        if (typeof callbacks.onKill === 'function') {
          callbacks.onKill(enemy, deadX, deadY, wasBoss);
        }
      }

      return true;
    }

    return false;
  }

  applySlow(enemy, factor, duration) {
    if (!enemy || !enemy.active) {
      return;
    }
    const effective = enemy.isBoss ? 1 - (1 - factor) * 0.45 : factor;
    if (effective < enemy.slowFactor || enemy.slowTimer <= 0) {
      enemy.slowFactor = effective;
    }
    if (duration > enemy.slowTimer) {
      enemy.slowTimer = duration;
    }
  }

  knockbackAll(originX, originY, radius, force, damage = 0, callbacks = null) {
    const rSq = radius * radius;
    const items = this.pool.items;
    for (let i = 0; i < items.length; i++) {
      const e = items[i];
      if (!e.active) {
        continue;
      }
      const dx = e.x - originX;
      const dy = e.y - originY;
      const distSq = dx * dx + dy * dy;
      if (distSq > rSq) {
        continue;
      }
      const dist = Math.sqrt(distSq) || 1;
      const kx = (dx / dist) * force;
      const ky = (dy / dist) * force;
      if (damage > 0) {
        this.damageEnemy(e, damage, kx, ky, callbacks);
      } else {
        const resist = e.isBoss ? 0.25 : 1.0;
        e.knockVx += kx * resist;
        e.knockVy += ky * resist;
      }
    }
  }

  getNearest(x, y, maxRange = Infinity) {
    let best = null;
    let bestDistSq = maxRange * maxRange;
    const items = this.pool.items;

    for (let i = 0; i < items.length; i++) {
      const e = items[i];
      if (!e.active) {
        continue;
      }
      const dx = e.x - x;
      const dy = e.y - y;
      const dSq = dx * dx + dy * dy;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        best = e;
      }
    }
    return best;
  }

  _clearWarningsByOwner(uid) {
    const items = this.warnings.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].active && items[i].ownerUid === uid) {
        this.warnings.release(items[i]);
      }
    }
  }

  _triggerBossPattern(boss, player) {
    const angleToPlayer = Math.atan2(player.y - boss.y, player.x - boss.x);

    if (boss.type === 'boss_box_king') {
      // 巨型紙箱貓王：預警直線飛撲衝撞
      const w = this.warnings.acquire();
      if (w) {
        w.ownerUid = boss.uid;
        w.shape = 'line';
        w.x = boss.x;
        w.y = boss.y;
        w.angle = angleToPlayer;
        w.length = 270;
        w.width = 62;
        w.radius = 34;
        w.color = '#ffd166';
        w.elapsed = 0;
        w.duration = 1.05;
        w.progress = 0;
        w.damage = 1.0;
        w.kind = 'dash';
      }
      boss.charging = true;
      boss.bossState = 'telegraph';
      boss.bossTimer = 1.05;
      boss.bossDashVx = Math.cos(angleToPlayer) * 340;
      boss.bossDashVy = Math.sin(angleToPlayer) * 340;
      return;
    }

    if (boss.type === 'boss_takoyaki') {
      // 章魚燒飛行船：連續 3 顆落地爆彈預警光圈
      for (let i = 0; i < 3; i++) {
        const w = this.warnings.acquire();
        if (!w) {
          break;
        }
        const spread = i === 0 ? 0 : (i === 1 ? -1 : 1) * 78;
        const perp = angleToPlayer + Math.PI * 0.5;
        w.ownerUid = boss.uid;
        w.shape = 'circle';
        w.x = clamp(player.x + Math.cos(perp) * spread, 50, GAME_CONFIG.WORLD_SIZE - 50);
        w.y = clamp(player.y + Math.sin(perp) * spread, 50, GAME_CONFIG.WORLD_SIZE - 50);
        w.radius = 58;
        w.color = '#ff9ebb';
        w.elapsed = 0;
        w.duration = 1.2 + i * 0.14;
        w.progress = 0;
        w.damage = 1.0;
        w.kind = 'bomb';
      }
      boss.charging = true;
      boss.bossState = 'telegraph';
      boss.bossTimer = 1.48;
      return;
    }

    // 巨型招財達摩：以自身為中心的招財震盪環 + 追蹤圓圈
    const ring = this.warnings.acquire();
    if (ring) {
      ring.ownerUid = boss.uid;
      ring.shape = 'ring';
      ring.x = boss.x;
      ring.y = boss.y;
      ring.innerRadius = 44;
      ring.radius = 148;
      ring.color = '#ff6b6b';
      ring.elapsed = 0;
      ring.duration = 1.25;
      ring.progress = 0;
      ring.damage = 1.0;
      ring.kind = 'ring';
    }
    const spot = this.warnings.acquire();
    if (spot) {
      spot.ownerUid = boss.uid;
      spot.shape = 'circle';
      spot.x = player.x;
      spot.y = player.y;
      spot.radius = 64;
      spot.color = '#ffd166';
      spot.elapsed = 0;
      spot.duration = 1.25;
      spot.progress = 0;
      spot.damage = 1.0;
      spot.kind = 'bomb';
    }
    boss.charging = true;
    boss.bossState = 'telegraph';
    boss.bossTimer = 1.3;
  }

  update(dt, time, player, shake, particles, onBossAttack = null) {
    const items = this.pool.items;
    const worldMax = GAME_CONFIG.WORLD_SIZE - 18;

    // 1. 更新 Boss 地面預警光圈並於倒數結束時結算判定
    const warnItems = this.warnings.items;
    for (let i = 0; i < warnItems.length; i++) {
      const w = warnItems[i];
      if (!w.active) {
        continue;
      }

      w.elapsed += dt;
      w.progress = clamp(w.elapsed / w.duration, 0, 1);

      if (w.elapsed >= w.duration) {
        if (w.kind === 'bomb') {
          if (particles) {
            particles.spawnBurst(w.x, w.y, 16, w.color, 175, 0.48);
            particles.spawnRing(w.x, w.y, 12, w.radius, w.color, 0.34);
          }
          if (shake) {
            shake.add(4.8, 10);
          }
          const d = Math.hypot(player.x - w.x, player.y - w.y);
          if (d <= w.radius + player.hitboxR - 4) {
            player.takeDamage(w.damage, shake, particles);
          }
          if (typeof onBossAttack === 'function') {
            onBossAttack(w);
          }
        } else if (w.kind === 'ring') {
          if (particles) {
            particles.spawnRing(w.x, w.y, w.innerRadius, w.radius, w.color, 0.4);
          }
          if (shake) {
            shake.add(5.5, 10);
          }
          const d = Math.hypot(player.x - w.x, player.y - w.y);
          if (d >= w.innerRadius - player.hitboxR && d <= w.radius + player.hitboxR - 4) {
            player.takeDamage(w.damage, shake, particles);
          }
          if (typeof onBossAttack === 'function') {
            onBossAttack(w);
          }
        } else if (w.kind === 'dash') {
          if (shake) {
            shake.add(3.6, 12);
          }
          if (typeof onBossAttack === 'function') {
            onBossAttack(w);
          }
        }

        this.warnings.release(w);
      }
    }

    // 2. 更新所有啟用中的敵人與 Boss
    for (let i = 0; i < items.length; i++) {
      const e = items[i];
      if (!e.active) {
        continue;
      }

      if (e.hitFlash > 0) {
        e.hitFlash = Math.max(0, e.hitFlash - dt * 6.5);
      }
      if (e.bubbleHitCd > 0) {
        e.bubbleHitCd = Math.max(0, e.bubbleHitCd - dt);
      }
      if (e.boomerangHitCd > 0) {
        e.boomerangHitCd = Math.max(0, e.boomerangHitCd - dt);
      }
      if (e.slowTimer > 0) {
        e.slowTimer -= dt;
        if (e.slowTimer <= 0) {
          e.slowTimer = 0;
          e.slowFactor = 1;
        }
      }

      const toPx = player.x - e.x;
      const toPy = player.y - e.y;
      const distToPlayer = Math.hypot(toPx, toPy) || 1;
      const dirX = toPx / distToPlayer;
      const dirY = toPy / distToPlayer;

      if (e.isBoss) {
        if (e.bossState === 'telegraph') {
          e.vx *= 0.85;
          e.vy *= 0.85;
          e.bossTimer -= dt;
          if (e.bossTimer <= 0) {
            e.charging = false;
            if (e.type === 'boss_box_king') {
              e.bossState = 'dash';
              e.bossDashTimer = 0.72;
            } else {
              e.bossState = 'chase';
              e.bossTimer = 3.2;
            }
          }
        } else if (e.bossState === 'dash') {
          e.vx = e.bossDashVx;
          e.vy = e.bossDashVy;
          e.bossDashTimer -= dt;
          if (e.bossDashTimer <= 0) {
            e.bossState = 'chase';
            e.bossTimer = 2.9;
          }
        } else {
          const effSpeed = e.speed * e.slowFactor;
          e.vx = dirX * effSpeed;
          e.vy = dirY * effSpeed;
          e.bossTimer -= dt;
          if (e.bossTimer <= 0 && distToPlayer < 460) {
            this._triggerBossPattern(e, player);
          }
        }
      } else {
        // 一般小怪：追蹤玩家並加入可愛的左右輕微擺動
        const effSpeed = e.speed * e.slowFactor;
        const perpX = -dirY;
        const perpY = dirX;
        const sway = Math.sin(time * 3.8 + e.animSeed) * e.wobble;
        e.vx = dirX * effSpeed + perpX * sway;
        e.vy = dirY * effSpeed + perpY * sway;
      }

      // 擊退阻尼衰減
      e.x += (e.vx + e.knockVx) * dt;
      e.y += (e.vy + e.knockVy) * dt;
      const kbDecay = Math.exp(-9.5 * dt);
      e.knockVx *= kbDecay;
      e.knockVy *= kbDecay;
      if (Math.abs(e.knockVx) < 1) e.knockVx = 0;
      if (Math.abs(e.knockVy) < 1) e.knockVy = 0;

      e.x = clamp(e.x, 18, worldMax);
      e.y = clamp(e.y, 18, worldMax);

      if (e.vx < -3) {
        e.facing = -1;
      } else if (e.vx > 3) {
        e.facing = 1;
      }

      // 寬容的玩家接觸受擊判定
      const hitDist = e.radius + player.hitboxR - 3;
      if (distToPlayer < hitDist) {
        player.takeDamage(e.contactDmg, shake, particles);
      }
    }

    // 3. 輕量級軟碰撞分離（防止敵人完全疊成同一點）
    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      if (!a.active) {
        continue;
      }
      for (let j = i + 1; j < items.length; j++) {
        const b = items[j];
        if (!b.active) {
          continue;
        }
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minDist = (a.radius + b.radius) * 0.78;
        const dSq = dx * dx + dy * dy;
        if (dSq > 0.01 && dSq < minDist * minDist) {
          const d = Math.sqrt(dSq);
          const push = (minDist - d) * 0.25;
          const nx = dx / d;
          const ny = dy / d;
          if (!a.isBoss) {
            a.x -= nx * push;
            a.y -= ny * push;
          }
          if (!b.isBoss) {
            b.x += nx * push;
            b.y += ny * push;
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 星塵寶石物件池（平滑磁鐵吸附曲線：先微幅彈出再加速飛向玩家）
// ---------------------------------------------------------------------------

export class GemPool {
  constructor(capacity = GAME_CONFIG.POOLS.GEMS) {
    this.pool = new ObjectPool(capacity, () => ({
      active: false,
      _poolIndex: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      value: 1,
      stars: 1,
      tier: 1,
      animSeed: 0,
      age: 0,
      magnetized: false,
      magnetTime: 0,
    }));
  }

  get activeCount() {
    return this.pool.activeCount;
  }

  clear() {
    this.pool.clear();
  }

  spawn(x, y, xpValue = 2, starValue = 1) {
    let gem = this.pool.acquire();

    // 若星塵池已滿，將經驗合併至附近現有寶石，保證零遺失與零配置
    if (!gem) {
      const items = this.pool.items;
      for (let i = 0; i < items.length; i++) {
        const existing = items[i];
        if (existing.active && !existing.magnetized) {
          existing.value += xpValue;
          existing.stars += starValue;
          existing.tier = existing.value >= 10 ? 3 : existing.value >= 4 ? 2 : 1;
          return existing;
        }
      }
      return null;
    }

    const angle = Math.random() * Math.PI * 2;
    const popSpeed = 48 + Math.random() * 44;

    gem.x = x;
    gem.y = y;
    gem.vx = Math.cos(angle) * popSpeed;
    gem.vy = Math.sin(angle) * popSpeed;
    gem.value = xpValue;
    gem.stars = starValue;
    gem.tier = xpValue >= 10 ? 3 : xpValue >= 4 ? 2 : 1;
    gem.animSeed = Math.random() * 50;
    gem.age = 0;
    gem.magnetized = false;
    gem.magnetTime = 0;

    return gem;
  }

  triggerGlobalMagnet(player) {
    const items = this.pool.items;
    for (let i = 0; i < items.length; i++) {
      const g = items[i];
      if (!g.active || g.magnetized) {
        continue;
      }
      this._beginMagnet(g, player);
    }
  }

  _beginMagnet(gem, player) {
    gem.magnetized = true;
    gem.magnetTime = 0;
    // 起始給予微幅反向預備彈跳（Anticipation），形成優雅弧線再吸入
    const dx = gem.x - player.x;
    const dy = gem.y - player.y;
    const dist = Math.hypot(dx, dy) || 1;
    gem.vx = (dx / dist) * 115;
    gem.vy = (dy / dist) * 115;
  }

  update(dt, player, onCollect = null) {
    const items = this.pool.items;
    const magnetR = player.getEffectiveMagnetRadius();
    const magnetRSq = magnetR * magnetR;
    const collectR = player.hitboxR + 11;
    const collectRSq = collectR * collectR;

    for (let i = 0; i < items.length; i++) {
      const g = items[i];
      if (!g.active) {
        continue;
      }

      g.age += dt;
      const dx = player.x - g.x;
      const dy = player.y - g.y;
      const distSq = dx * dx + dy * dy;

      if (!g.magnetized) {
        // 剛掉落的柔和阻尼滑行
        g.x += g.vx * dt;
        g.y += g.vy * dt;
        const drag = Math.exp(-6.5 * dt);
        g.vx *= drag;
        g.vy *= drag;

        if (g.age >= 0.12 && distSq <= magnetRSq) {
          this._beginMagnet(g, player);
        }
      } else {
        g.magnetTime += dt;
        const dist = Math.sqrt(distSq) || 1;
        const nx = dx / dist;
        const ny = dy / dist;

        // 二次平滑加速曲線飛向玩家
        const pullSpeed = Math.min(680, 260 + g.magnetTime * g.magnetTime * 1550);
        const steer = Math.min(1, dt * (6 + g.magnetTime * 18));
        g.vx += (nx * pullSpeed - g.vx) * steer;
        g.vy += (ny * pullSpeed - g.vy) * steer;

        g.x += g.vx * dt;
        g.y += g.vy * dt;
      }

      const finalDx = player.x - g.x;
      const finalDy = player.y - g.y;
      if (finalDx * finalDx + finalDy * finalDy <= collectRSq) {
        const xpVal = g.value;
        const starVal = g.stars;
        const gx = g.x;
        const gy = g.y;
        this.pool.release(g);

        const result = player.addXp(xpVal, starVal);
        if (typeof onCollect === 'function') {
          onCollect(xpVal, starVal, result, gx, gy);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 粒子特效物件池（柔光星粒、爆發點、擴散光環、愛心回復提示）
// ---------------------------------------------------------------------------

export class ParticlePool {
  constructor(capacity = GAME_CONFIG.POOLS.PARTICLES) {
    this.pool = new ObjectPool(capacity, () => ({
      active: false,
      _poolIndex: 0,
      kind: 'spark', // 'spark' | 'star' | 'ring' | 'heart'
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      size: 4,
      startR: 8,
      endR: 48,
      color: '#ffd166',
      age: 0,
      life: 0.4,
      drag: 4.5,
    }));
  }

  clear() {
    this.pool.clear();
  }

  spawnSpark(x, y, vx, vy, color = '#ffd166', size = 4, life = 0.38, kind = 'star') {
    const p = this.pool.acquire();
    if (!p) {
      return null;
    }
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.size = size;
    p.startR = size;
    p.endR = size;
    p.color = color;
    p.age = 0;
    p.life = life;
    p.drag = 4.2;
    return p;
  }

  spawnBurst(x, y, count = 8, color = '#ffd166', speed = 120, life = 0.42) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const spd = speed * (0.45 + Math.random() * 0.7);
      const size = 2.5 + Math.random() * 2.8;
      this.spawnSpark(
        x,
        y,
        Math.cos(angle) * spd,
        Math.sin(angle) * spd,
        color,
        size,
        life * (0.7 + Math.random() * 0.45),
        i % 2 === 0 ? 'star' : 'spark'
      );
    }
  }

  spawnRing(x, y, startR = 10, endR = 64, color = '#ffd166', life = 0.35) {
    const p = this.pool.acquire();
    if (!p) {
      return null;
    }
    p.kind = 'ring';
    p.x = x;
    p.y = y;
    p.vx = 0;
    p.vy = 0;
    p.size = 3;
    p.startR = startR;
    p.endR = endR;
    p.color = color;
    p.age = 0;
    p.life = life;
    p.drag = 0;
    return p;
  }

  spawnHealHearts(x, y, count = 4) {
    for (let i = 0; i < count; i++) {
      const p = this.pool.acquire();
      if (!p) {
        return;
      }
      p.kind = 'heart';
      p.x = x + (Math.random() - 0.5) * 24;
      p.y = y - 6 + (Math.random() - 0.5) * 10;
      p.vx = (Math.random() - 0.5) * 26;
      p.vy = -34 - Math.random() * 26;
      p.size = 4.5 + Math.random() * 2;
      p.startR = 0;
      p.endR = 0;
      p.color = '#ff8fab';
      p.age = 0;
      p.life = 0.72 + Math.random() * 0.25;
      p.drag = 1.2;
    }
  }

  update(dt) {
    const items = this.pool.items;
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      if (!p.active) {
        continue;
      }
      p.age += dt;
      if (p.age >= p.life) {
        this.pool.release(p);
        continue;
      }
      if (p.kind !== 'ring') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const d = Math.exp(-p.drag * dt);
        p.vx *= d;
        p.vy *= d;
      }
    }
  }

  draw(ctx) {
    const items = this.pool.items;
    ctx.save();
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      if (!p.active) {
        continue;
      }
      const t = p.age / p.life;
      const alpha = Math.max(0, 1 - t);
      ctx.globalAlpha = alpha;

      if (p.kind === 'ring') {
        const easeOut = 1 - (1 - t) * (1 - t);
        const r = p.startR + (p.endR - p.startR) * easeOut;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1, 3.5 * alpha);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === 'star') {
        const s = Math.max(1.5, p.size * (1 - t * 0.45));
        const half = Math.max(1, s * 0.36);
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x - half), Math.round(p.y - s), Math.round(half * 2), Math.round(s * 2));
        ctx.fillRect(Math.round(p.x - s), Math.round(p.y - half), Math.round(s * 2), Math.round(half * 2));
      } else if (p.kind === 'heart') {
        const s = p.size * (0.85 + t * 0.3);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x - s * 0.38, p.y - s * 0.1, s * 0.42, 0, Math.PI * 2);
        ctx.arc(p.x + s * 0.38, p.y - s * 0.1, s * 0.42, 0, Math.PI * 2);
        ctx.moveTo(p.x - s * 0.78, p.y + s * 0.05);
        ctx.lineTo(p.x, p.y + s * 0.85);
        ctx.lineTo(p.x + s * 0.78, p.y + s * 0.05);
        ctx.closePath();
        ctx.fill();
      } else {
        const s = Math.max(1.5, p.size * (1 - t * 0.5));
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x - s * 0.5), Math.round(p.y - s * 0.5), Math.round(s), Math.round(s));
      }
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// 場地驚喜道具固定池（大磁鐵 magnet、魚湯 fish_soup、祈願鈴鐺 wish_bell）
// ---------------------------------------------------------------------------

export class PickupPool {
  constructor(capacity = 12) {
    this.pool = new ObjectPool(capacity, () => ({
      active: false,
      _poolIndex: 0,
      type: 'magnet',
      x: 0,
      y: 0,
      age: 0,
      maxAge: 28,
    }));
  }

  clear() {
    this.pool.clear();
  }

  spawn(type, x, y) {
    const item = this.pool.acquire();
    if (!item) {
      return null;
    }
    item.type = type;
    item.x = clamp(x, 60, GAME_CONFIG.WORLD_SIZE - 60);
    item.y = clamp(y, 60, GAME_CONFIG.WORLD_SIZE - 60);
    item.age = 0;
    item.maxAge = 28;
    return item;
  }

  update(dt, player, onPickup = null) {
    const items = this.pool.items;
    const grabR = player.hitboxR + 22;
    const grabRSq = grabR * grabR;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.active) {
        continue;
      }
      item.age += dt;
      if (item.age >= item.maxAge) {
        this.pool.release(item);
        continue;
      }
      const dx = player.x - item.x;
      const dy = player.y - item.y;
      if (dx * dx + dy * dy <= grabRSq) {
        const type = item.type;
        const px = item.x;
        const py = item.y;
        this.pool.release(item);
        if (typeof onPickup === 'function') {
          onPickup(type, px, py);
        }
      }
    }
  }
}
