// src/weapons.js — 《星塵貓大作戰》6 種自動攻擊武器（Lv1-5）與升級三選一系統

import { GAME_CONFIG, WEAPONS } from './config.js';
import { ObjectPool } from './entities.js';

const WEAPON_IDS = Object.keys(WEAPONS);

// 各武器 1~5 級強化預覽文字（供升級卡片清楚呈現）
export const WEAPON_LEVEL_DESCRIPTIONS = {
  stardust_bolt: [
    '自動鎖定最近小怪發射星光魔彈',
    '傷害 +28%、發射節奏更快',
    '星彈連發數 +1，鎖敵範圍提升',
    '星彈可穿透 1 隻小怪，傷害再提升',
    '三連星光貫穿彈，射速大幅強化',
  ],
  fish_boomerang: [
    '拋出穿透並飛回的發光小魚乾',
    '飛行距離更遠，傷害 +30%',
    '同時拋出 2 條迴旋小魚乾',
    '小魚乾體積加大、擊退力與傷害提升',
    '三連大迴旋魚乾，來回橫掃怪群',
  ],
  bubble_shield: [
    '召喚 2 顆環繞守護泡泡撞飛小怪',
    '守護泡泡增至 3 顆，傷害提升',
    '旋轉速度加快、護盾半徑加大',
    '守護泡泡增至 4 顆，擊退更強',
    '5 顆滿環星光泡泡，全向近身防護',
  ],
  yarn_lightning: [
    '隨機召喚可跳躍 2 名目標的毛線閃電',
    '連鎖跳躍增至 3 名，冷卻縮短',
    '連鎖跳躍增至 4 名，雷擊傷害大幅提升',
    '連鎖跳躍增至 5 名，跳躍範圍加大',
    '6 連星光雷網，極速清場高壓怪群',
  ],
  catnip_aura: [
    '展開腳下星光貓草領域，減速並持續安撫小怪',
    '領域半徑加大，減速提升至 28%',
    '安撫頻率加快，傷害與範圍同步提升',
    '大幅擴張領域，減速強化至 40%',
    '滿級治癒大結界，強力緩速 48% 並高頻安撫',
  ],
  box_airdrop: [
    '鎖定怪堆空投彈力紙箱，範圍震退小怪',
    '空投爆震半徑加大，傷害 +32%',
    '每次連續空投 2 個彈力紙箱',
    '冷卻縮短，爆震範圍與擊退力再強化',
    '三連巨型空投紙箱，大範圍重磅清怪',
  ],
};

// 升級保底／屬性強化卡片（含回血與機動／吸星／冷卻／傷害）
export const PASSIVE_UPGRADES = {
  heal_heart: {
    id: 'heal_heart',
    kind: 'passive',
    name: '暖心魚乾點心',
    icon: '💛',
    badge: '即時回復',
    desc: '回復 1 顆愛心（滿血時改為最大生命 +0.5 心並補滿）',
  },
  passive_speed: {
    id: 'passive_speed',
    kind: 'passive',
    name: '輕盈肉球步',
    icon: '🐾',
    badge: '屬性強化',
    desc: '貓咪移動速度永久 +12%，走位更從容',
  },
  passive_magnet: {
    id: 'passive_magnet',
    kind: 'passive',
    name: '星塵引力圈',
    icon: '🧲',
    badge: '屬性強化',
    desc: '星塵吸附範圍永久 +28%，升級更流暢',
  },
  passive_haste: {
    id: 'passive_haste',
    kind: 'passive',
    name: '星光節拍器',
    icon: '✨',
    badge: '屬性強化',
    desc: '全部武器攻擊冷卻永久 -10%',
  },
  passive_power: {
    id: 'passive_power',
    kind: 'passive',
    name: '閃耀星塵祝福',
    icon: '🌟',
    badge: '屬性強化',
    desc: '全部武器傷害永久 +16%',
  },
};

// ---------------------------------------------------------------------------
// 武器系統核心（共用 GAME_CONFIG.POOLS.BULLETS 固定物件池）
// ---------------------------------------------------------------------------

export class WeaponSystem {
  constructor() {
    this.levels = {};
    this.timers = {};
    this.bubbleAngle = 0;
    this.auraPulsePhase = 0;
    this._nextBoomerangId = 1;

    // 固定容量投射物／空投池（對應 config.js POOLS.BULLETS）
    this.bullets = new ObjectPool(GAME_CONFIG.POOLS.BULLETS, () => ({
      active: false,
      _poolIndex: 0,
      kind: 'bolt', // 'bolt' | 'boomerang' | 'airdrop'
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      targetX: 0,
      targetY: 0,
      startY: 0,
      angle: 0,
      spin: 0,
      radius: 8,
      blastRadius: 60,
      damage: 10,
      knockback: 80,
      pierce: 0,
      age: 0,
      life: 1.5,
      returning: false,
      boomerangId: 0,
      lastHitUid: 0,
      color: '#ffd166',
    }));

    // 毛線雷電鏈視覺電弧池（固定 24 段，零 GC）
    this.lightningArcs = new ObjectPool(24, () => ({
      active: false,
      _poolIndex: 0,
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      age: 0,
      life: 0.24,
      seed: 0,
    }));

    // 暫存目標列表，避免每幀建立新陣列
    this._scratchTargets = [];

    this.reset();
  }

  reset(startWeaponId = null) {
    for (let i = 0; i < WEAPON_IDS.length; i++) {
      const id = WEAPON_IDS[i];
      this.levels[id] = 0;
      this.timers[id] = 0;
    }
    this.bubbleAngle = 0;
    this.auraPulsePhase = 0;
    this._nextBoomerangId = 1;
    this.bullets.clear();
    this.lightningArcs.clear();

    if (startWeaponId && WEAPONS[startWeaponId]) {
      this.levels[startWeaponId] = 1;
    }
  }

  getLevel(weaponId) {
    return this.levels[weaponId] || 0;
  }

  getOwnedWeaponIds() {
    const owned = [];
    for (let i = 0; i < WEAPON_IDS.length; i++) {
      const id = WEAPON_IDS[i];
      if (this.levels[id] > 0) {
        owned.push(id);
      }
    }
    return owned;
  }

  upgradeWeapon(weaponId) {
    const spec = WEAPONS[weaponId];
    if (!spec) {
      return 0;
    }
    const cur = this.levels[weaponId] || 0;
    if (cur >= spec.maxLv) {
      return cur;
    }
    const next = cur + 1;
    this.levels[weaponId] = next;
    // 新獲得武器可立即觸發一次攻擊，強化回饋感
    if (cur === 0) {
      this.timers[weaponId] = 0.08;
    }
    return next;
  }

  // -------------------------------------------------------------------------
  // 各武器 1~5 級平衡參數計算（皆以 WEAPONS[id].baseCd / baseDmg 為基準）
  // -------------------------------------------------------------------------

  _getBoltStats(lv, player) {
    const spec = WEAPONS.stardust_bolt;
    const counts = [0, 1, 1, 2, 2, 3];
    const pierces = [0, 0, 0, 0, 1, 2];
    const dmgScale = [0, 1.0, 1.28, 1.42, 1.68, 1.95];
    const cdScale = [0, 1.0, 0.88, 0.84, 0.78, 0.68];

    return {
      count: counts[lv],
      pierce: pierces[lv],
      damage: spec.baseDmg * dmgScale[lv] * player.dmgMult,
      cd: spec.baseCd * cdScale[lv] * player.getEffectiveCdMult(),
      range: 270 + lv * 22,
      speed: 370 + lv * 18,
    };
  }

  _getBoomerangStats(lv, player) {
    const spec = WEAPONS.fish_boomerang;
    const counts = [0, 1, 1, 2, 2, 3];
    const dmgScale = [0, 1.0, 1.3, 1.45, 1.75, 2.05];
    const cdScale = [0, 1.0, 0.94, 0.9, 0.84, 0.78];

    return {
      count: counts[lv],
      damage: spec.baseDmg * dmgScale[lv] * player.dmgMult,
      cd: spec.baseCd * cdScale[lv] * player.getEffectiveCdMult(),
      speed: 290 + lv * 24,
      outTime: 0.44 + lv * 0.04,
      radius: 12 + lv * 1.5,
      knockback: 90 + lv * 15,
    };
  }

  _getBubbleStats(lv, player) {
    const spec = WEAPONS.bubble_shield;
    const counts = [0, 2, 3, 3, 4, 5];
    const dmgScale = [0, 1.0, 1.25, 1.48, 1.75, 2.1];

    return {
      count: counts[lv],
      orbitRadius: 46 + lv * 6,
      bubbleRadius: 11 + lv * 1.1,
      angularSpeed: 2.35 + lv * 0.32,
      damage: spec.baseDmg * dmgScale[lv] * player.dmgMult,
      knockback: 165 + lv * 24,
      tickCd: spec.baseCd,
      perEnemyHitCd: Math.max(0.28, 0.46 - lv * 0.03),
    };
  }

  _getLightningStats(lv, player) {
    const spec = WEAPONS.yarn_lightning;
    const chains = [0, 2, 3, 4, 5, 6];
    const dmgScale = [0, 1.0, 1.22, 1.5, 1.75, 2.1];
    const cdScale = [0, 1.0, 0.9, 0.84, 0.78, 0.7];

    return {
      chains: chains[lv],
      damage: spec.baseDmg * dmgScale[lv] * player.dmgMult,
      cd: spec.baseCd * cdScale[lv] * player.getEffectiveCdMult(),
      startRange: 250 + lv * 18,
      jumpRange: 135 + lv * 16,
    };
  }

  _getAuraStats(lv, player) {
    const spec = WEAPONS.catnip_aura;
    const radii = [0, 66, 80, 94, 110, 128];
    const slows = [1, 0.78, 0.72, 0.66, 0.6, 0.52];
    const dmgScale = [0, 1.0, 1.28, 1.55, 1.85, 2.25];
    const cdScale = [0, 1.0, 0.94, 0.86, 0.8, 0.74];

    return {
      radius: radii[lv],
      slowFactor: slows[lv],
      damage: spec.baseDmg * dmgScale[lv] * player.dmgMult,
      cd: spec.baseCd * cdScale[lv] * player.getEffectiveCdMult(),
    };
  }

  _getAirdropStats(lv, player) {
    const spec = WEAPONS.box_airdrop;
    const counts = [0, 1, 1, 2, 2, 3];
    const radii = [0, 56, 68, 76, 88, 100];
    const dmgScale = [0, 1.0, 1.32, 1.5, 1.8, 2.15];
    const cdScale = [0, 1.0, 0.94, 0.88, 0.8, 0.72];

    return {
      count: counts[lv],
      blastRadius: radii[lv],
      damage: spec.baseDmg * dmgScale[lv] * player.dmgMult,
      cd: spec.baseCd * cdScale[lv] * player.getEffectiveCdMult(),
      knockback: 185 + lv * 22,
    };
  }

  // -------------------------------------------------------------------------
  // 每幀更新：自動施放 6 種武器、更新投射物、碰撞與視覺電弧
  // -------------------------------------------------------------------------

  update(dt, time, player, enemyPool, callbacks = null) {
    if (player.dead) {
      return;
    }

    // 1. 星塵魔彈
    const boltLv = this.levels.stardust_bolt;
    if (boltLv > 0) {
      this.timers.stardust_bolt -= dt;
      if (this.timers.stardust_bolt <= 0) {
        const stats = this._getBoltStats(boltLv, player);
        const fired = this._fireStardustBolt(player, enemyPool, stats, callbacks);
        this.timers.stardust_bolt = fired ? stats.cd : 0.12;
      }
    }

    // 2. 迴旋小魚乾
    const fishLv = this.levels.fish_boomerang;
    if (fishLv > 0) {
      this.timers.fish_boomerang -= dt;
      if (this.timers.fish_boomerang <= 0) {
        const stats = this._getBoomerangStats(fishLv, player);
        this._fireFishBoomerang(player, enemyPool, stats, callbacks);
        this.timers.fish_boomerang = stats.cd;
      }
    }

    // 3. 泡泡護盾環（持續旋轉 + 固定間隔檢測碰撞）
    const bubbleLv = this.levels.bubble_shield;
    if (bubbleLv > 0) {
      const stats = this._getBubbleStats(bubbleLv, player);
      this.bubbleAngle += stats.angularSpeed * dt;
      this.timers.bubble_shield -= dt;
      if (this.timers.bubble_shield <= 0) {
        this._updateBubbleShieldHits(player, enemyPool, stats, callbacks);
        this.timers.bubble_shield = stats.tickCd;
      }
    }

    // 4. 毛線雷電鏈
    const lightningLv = this.levels.yarn_lightning;
    if (lightningLv > 0) {
      this.timers.yarn_lightning -= dt;
      if (this.timers.yarn_lightning <= 0) {
        const stats = this._getLightningStats(lightningLv, player);
        const struck = this._fireYarnLightning(player, enemyPool, stats, callbacks);
        this.timers.yarn_lightning = struck ? stats.cd : 0.18;
      }
    }

    // 5. 貓草治癒圈
    const auraLv = this.levels.catnip_aura;
    if (auraLv > 0) {
      this.auraPulsePhase += dt * 3.4;
      this.timers.catnip_aura -= dt;
      if (this.timers.catnip_aura <= 0) {
        const stats = this._getAuraStats(auraLv, player);
        this._pulseCatnipAura(player, enemyPool, stats, callbacks);
        this.timers.catnip_aura = stats.cd;
      }
    }

    // 6. 紙箱空投炮
    const airdropLv = this.levels.box_airdrop;
    if (airdropLv > 0) {
      this.timers.box_airdrop -= dt;
      if (this.timers.box_airdrop <= 0) {
        const stats = this._getAirdropStats(airdropLv, player);
        const dropped = this._fireBoxAirdrop(player, enemyPool, stats, callbacks);
        this.timers.box_airdrop = dropped ? stats.cd : 0.2;
      }
    }

    // 更新所有飛行中的投射物與空投箱
    this._updateBullets(dt, player, enemyPool, callbacks);

    // 更新毛線雷電電弧壽命
    const arcs = this.lightningArcs.items;
    for (let i = 0; i < arcs.length; i++) {
      const a = arcs[i];
      if (!a.active) {
        continue;
      }
      a.age += dt;
      if (a.age >= a.life) {
        this.lightningArcs.release(a);
      }
    }
  }

  _fireStardustBolt(player, enemyPool, stats, callbacks) {
    const target = enemyPool.getNearest(player.x, player.y, stats.range);
    if (!target) {
      return false;
    }

    const baseAngle = Math.atan2(target.y - player.y, target.x - player.x);
    const spreadStep = 0.16;

    for (let i = 0; i < stats.count; i++) {
      const b = this.bullets.acquire();
      if (!b) {
        break;
      }
      const offset = (i - (stats.count - 1) * 0.5) * spreadStep;
      const angle = baseAngle + offset;

      b.kind = 'bolt';
      b.x = player.x + Math.cos(angle) * 14;
      b.y = player.y + Math.sin(angle) * 14;
      b.vx = Math.cos(angle) * stats.speed;
      b.vy = Math.sin(angle) * stats.speed;
      b.angle = angle;
      b.spin = 0;
      b.radius = 7;
      b.damage = stats.damage;
      b.knockback = 75;
      b.pierce = stats.pierce;
      b.age = 0;
      b.life = 1.05;
      b.returning = false;
      b.lastHitUid = 0;
      b.color = '#ffd166';
    }

    if (callbacks && typeof callbacks.onWeaponFire === 'function') {
      callbacks.onWeaponFire('stardust_bolt');
    }
    return true;
  }

  _fireFishBoomerang(player, enemyPool, stats, callbacks) {
    const target = enemyPool.getNearest(player.x, player.y, 340);
    let baseAngle = player.facing < 0 ? Math.PI : 0;
    if (target) {
      baseAngle = Math.atan2(target.y - player.y, target.x - player.x);
    } else if (player.moving) {
      baseAngle = Math.atan2(player.vy, player.vx);
    }

    const spreadStep = stats.count === 2 ? 0.5 : 0.42;

    for (let i = 0; i < stats.count; i++) {
      const b = this.bullets.acquire();
      if (!b) {
        break;
      }
      const offset = (i - (stats.count - 1) * 0.5) * spreadStep;
      const angle = baseAngle + offset;

      b.kind = 'boomerang';
      b.x = player.x;
      b.y = player.y;
      b.vx = Math.cos(angle) * stats.speed;
      b.vy = Math.sin(angle) * stats.speed;
      b.angle = angle;
      b.spin = 0;
      b.radius = stats.radius;
      b.damage = stats.damage;
      b.knockback = stats.knockback;
      b.pierce = 99;
      b.age = 0;
      b.life = stats.outTime;
      b.returning = false;
      b.boomerangId = this._nextBoomerangId++;
      b.lastHitUid = 0;
      b.color = '#9bf6ff';
    }

    if (callbacks && typeof callbacks.onWeaponFire === 'function') {
      callbacks.onWeaponFire('fish_boomerang');
    }
  }

  _updateBubbleShieldHits(player, enemyPool, stats, callbacks) {
    const enemies = enemyPool.pool.items;
    let hitAny = false;

    for (let i = 0; i < stats.count; i++) {
      const angle = this.bubbleAngle + (i / stats.count) * Math.PI * 2;
      const bx = player.x + Math.cos(angle) * stats.orbitRadius;
      const by = player.y + Math.sin(angle) * stats.orbitRadius;

      for (let j = 0; j < enemies.length; j++) {
        const e = enemies[j];
        if (!e.active || e.bubbleHitCd > 0) {
          continue;
        }
        const dx = e.x - bx;
        const dy = e.y - by;
        const minD = e.radius + stats.bubbleRadius;
        if (dx * dx + dy * dy <= minD * minD) {
          e.bubbleHitCd = stats.perEnemyHitCd;
          const outX = e.x - player.x;
          const outY = e.y - player.y;
          const outLen = Math.hypot(outX, outY) || 1;
          enemyPool.damageEnemy(
            e,
            stats.damage,
            (outX / outLen) * stats.knockback,
            (outY / outLen) * stats.knockback,
            callbacks
          );
          if (callbacks && callbacks.particles) {
            callbacks.particles.spawnBurst(bx, by, 4, '#9bf6ff', 80, 0.25);
          }
          hitAny = true;
        }
      }
    }

    if (hitAny && callbacks && typeof callbacks.onWeaponFire === 'function') {
      callbacks.onWeaponFire('bubble_shield');
    }
  }

  _fireYarnLightning(player, enemyPool, stats, callbacks) {
    const first = enemyPool.getNearest(player.x, player.y, stats.startRange);
    if (!first) {
      return false;
    }

    const targets = this._scratchTargets;
    targets.length = 0;
    targets.push(first);

    const enemies = enemyPool.pool.items;
    const jumpSq = stats.jumpRange * stats.jumpRange;

    // 依序尋找尚未被連到的最近敵人形成雷電鏈
    let anchor = first;
    for (let step = 1; step < stats.chains; step++) {
      let nextTarget = null;
      let bestDistSq = jumpSq;

      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (!e.active || targets.includes(e)) {
          continue;
        }
        const dx = e.x - anchor.x;
        const dy = e.y - anchor.y;
        const dSq = dx * dx + dy * dy;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          nextTarget = e;
        }
      }

      if (!nextTarget) {
        break;
      }
      targets.push(nextTarget);
      anchor = nextTarget;
    }

    // 繪製電弧並結算傷害（從玩家出發跳躍到每個目標）
    let prevX = player.x;
    let prevY = player.y - 8;

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      const tx = target.x;
      const ty = target.y;

      const arc = this.lightningArcs.acquire();
      if (arc) {
        arc.x1 = prevX;
        arc.y1 = prevY;
        arc.x2 = tx;
        arc.y2 = ty;
        arc.age = 0;
        arc.life = 0.25;
        arc.seed = Math.random() * 100;
      }

      const dx = tx - prevX;
      const dy = ty - prevY;
      const d = Math.hypot(dx, dy) || 1;
      const chainDecay = Math.pow(0.92, i);

      enemyPool.damageEnemy(
        target,
        stats.damage * chainDecay,
        (dx / d) * 65,
        (dy / d) * 65,
        callbacks
      );

      if (callbacks && callbacks.particles) {
        callbacks.particles.spawnBurst(tx, ty, 5, '#ffe66d', 110, 0.28);
      }

      prevX = tx;
      prevY = ty;
    }

    targets.length = 0;
    if (callbacks && typeof callbacks.onWeaponFire === 'function') {
      callbacks.onWeaponFire('yarn_lightning');
    }
    return true;
  }

  _pulseCatnipAura(player, enemyPool, stats, callbacks) {
    const enemies = enemyPool.pool.items;
    const r = stats.radius;
    let hitCount = 0;

    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.active) {
        continue;
      }
      const dx = e.x - player.x;
      const dy = e.y - player.y;
      const reach = r + e.radius;
      if (dx * dx + dy * dy <= reach * reach) {
        enemyPool.applySlow(e, stats.slowFactor, stats.cd + 0.35);
        const dist = Math.hypot(dx, dy) || 1;
        enemyPool.damageEnemy(
          e,
          stats.damage,
          (dx / dist) * 28,
          (dy / dist) * 28,
          callbacks
        );
        hitCount++;
      }
    }

    if (hitCount > 0 && callbacks && callbacks.particles) {
      callbacks.particles.spawnRing(player.x, player.y, r * 0.45, r, '#95d57b', 0.28);
    }
  }

  _fireBoxAirdrop(player, enemyPool, stats, callbacks) {
    const enemies = enemyPool.pool.items;
    const candidates = this._scratchTargets;
    candidates.length = 0;

    const maxRangeSq = 290 * 290;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.active) {
        continue;
      }
      const dx = e.x - player.x;
      const dy = e.y - player.y;
      if (dx * dx + dy * dy <= maxRangeSq) {
        candidates.push(e);
      }
    }

    if (candidates.length === 0) {
      return false;
    }

    for (let i = 0; i < stats.count; i++) {
      const b = this.bullets.acquire();
      if (!b) {
        break;
      }
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      const jitterX = i === 0 ? 0 : (Math.random() - 0.5) * 46;
      const jitterY = i === 0 ? 0 : (Math.random() - 0.5) * 46;
      const tx = Math.max(40, Math.min(GAME_CONFIG.WORLD_SIZE - 40, pick.x + jitterX));
      const ty = Math.max(40, Math.min(GAME_CONFIG.WORLD_SIZE - 40, pick.y + jitterY));

      b.kind = 'airdrop';
      b.x = tx;
      b.targetX = tx;
      b.targetY = ty;
      b.startY = ty - 240;
      b.y = b.startY;
      b.vx = 0;
      b.vy = 0;
      b.angle = (Math.random() - 0.5) * 0.35;
      b.spin = 0;
      b.radius = 16;
      b.blastRadius = stats.blastRadius;
      b.damage = stats.damage;
      b.knockback = stats.knockback;
      b.pierce = 0;
      b.age = 0;
      b.life = 0.46 + i * 0.1;
      b.returning = false;
      b.color = '#c9935b';
    }

    candidates.length = 0;
    if (callbacks && typeof callbacks.onWeaponFire === 'function') {
      callbacks.onWeaponFire('box_airdrop');
    }
    return true;
  }

  _updateBullets(dt, player, enemyPool, callbacks) {
    const bullets = this.bullets.items;
    const enemies = enemyPool.pool.items;

    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      if (!b.active) {
        continue;
      }

      b.age += dt;

      if (b.kind === 'bolt') {
        b.x += b.vx * dt;
        b.y += b.vy * dt;

        if (b.age >= b.life) {
          this.bullets.release(b);
          continue;
        }

        for (let j = 0; j < enemies.length; j++) {
          const e = enemies[j];
          if (!e.active || e.uid === b.lastHitUid) {
            continue;
          }
          const dx = e.x - b.x;
          const dy = e.y - b.y;
          const hitR = e.radius + b.radius;
          if (dx * dx + dy * dy <= hitR * hitR) {
            b.lastHitUid = e.uid;
            const spd = Math.hypot(b.vx, b.vy) || 1;
            enemyPool.damageEnemy(
              e,
              b.damage,
              (b.vx / spd) * b.knockback,
              (b.vy / spd) * b.knockback,
              callbacks
            );
            if (b.pierce > 0) {
              b.pierce -= 1;
            } else {
              this.bullets.release(b);
              break;
            }
          }
        }
      } else if (b.kind === 'boomerang') {
        b.spin += dt * 15;

        if (!b.returning) {
          // 飛出階段：柔和減速至頂點後折返
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          const slow = Math.exp(-2.6 * dt);
          b.vx *= slow;
          b.vy *= slow;

          if (b.age >= b.life) {
            b.returning = true;
            // 折返時換新 ID，允許回程再穿透打擊一次
            b.boomerangId = this._nextBoomerangId++;
          }
        } else {
          // 飛回玩家階段：追蹤玩家平滑加速收回
          const toPx = player.x - b.x;
          const toPy = player.y - b.y;
          const dist = Math.hypot(toPx, toPy) || 1;
          const returnSpeed = 420;
          const steer = Math.min(1, dt * 11);
          b.vx += ((toPx / dist) * returnSpeed - b.vx) * steer;
          b.vy += ((toPy / dist) * returnSpeed - b.vy) * steer;
          b.x += b.vx * dt;
          b.y += b.vy * dt;

          if (dist <= player.hitboxR + 14 || b.age >= b.life + 1.8) {
            this.bullets.release(b);
            continue;
          }
        }

        // 穿透傷害判定
        for (let j = 0; j < enemies.length; j++) {
          const e = enemies[j];
          if (!e.active) {
            continue;
          }
          if (e.boomerangHitId === b.boomerangId && e.boomerangHitCd > 0) {
            continue;
          }
          const dx = e.x - b.x;
          const dy = e.y - b.y;
          const hitR = e.radius + b.radius;
          if (dx * dx + dy * dy <= hitR * hitR) {
            e.boomerangHitId = b.boomerangId;
            e.boomerangHitCd = 0.34;
            const spd = Math.hypot(b.vx, b.vy) || 1;
            enemyPool.damageEnemy(
              e,
              b.damage,
              (b.vx / spd) * b.knockback,
              (b.vy / spd) * b.knockback,
              callbacks
            );
          }
        }
      } else if (b.kind === 'airdrop') {
        const progress = Math.min(1, b.age / b.life);
        // 加速墜落曲線（Ease-In Cubic）
        const ease = progress * progress * progress;
        b.y = b.startY + (b.targetY - b.startY) * ease;

        if (progress >= 1) {
          enemyPool.knockbackAll(
            b.targetX,
            b.targetY,
            b.blastRadius,
            b.knockback,
            b.damage,
            callbacks
          );
          if (callbacks) {
            if (callbacks.particles) {
              callbacks.particles.spawnRing(b.targetX, b.targetY, 12, b.blastRadius, '#ffd166', 0.32);
              callbacks.particles.spawnBurst(b.targetX, b.targetY, 12, '#e2b47d', 150, 0.4);
            }
            if (callbacks.shake) {
              callbacks.shake.add(3.2, 13);
            }
            if (typeof callbacks.onWeaponImpact === 'function') {
              callbacks.onWeaponImpact('box_airdrop');
            }
          }
          this.bullets.release(b);
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // 繪製：地面層（貓草治癒圈、空投落點陰影）與前景層（泡泡、魔彈、魚乾、雷電、空投箱）
  // -------------------------------------------------------------------------

  drawGroundEffects(ctx, player, time = 0) {
    // 貓草治癒圈（畫在角色腳下）
    const auraLv = this.levels.catnip_aura;
    if (auraLv > 0 && !player.dead) {
      const stats = this._getAuraStats(auraLv, player);
      const r = stats.radius;
      const pulse = 0.5 + 0.5 * Math.sin(this.auraPulsePhase);

      ctx.save();
      ctx.translate(player.x, player.y + 4);

      // 柔和綠金星光結界底盤
      const grad = ctx.createRadialGradient(0, 0, r * 0.15, 0, 0, r);
      grad.addColorStop(0, 'rgba(149, 213, 123, 0.06)');
      grad.addColorStop(0.75, 'rgba(149, 213, 123, 0.18)');
      grad.addColorStop(1, 'rgba(255, 209, 102, 0.24)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();

      // 緩慢旋轉星草外環
      ctx.rotate(time * 0.65);
      ctx.strokeStyle = `rgba(166, 224, 142, ${0.42 + pulse * 0.25})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // 旋轉小葉片點綴
      const leafCount = 4 + auraLv;
      for (let i = 0; i < leafCount; i++) {
        const a = (i / leafCount) * Math.PI * 2;
        const lx = Math.cos(a) * (r - 4);
        const ly = Math.sin(a) * (r - 4);
        ctx.fillStyle = i % 2 === 0 ? '#95d57b' : '#ffd166';
        ctx.fillRect(Math.round(lx - 2), Math.round(ly - 2), 4, 4);
      }

      ctx.restore();
    }

    // 紙箱空投地面落點預警圈
    const bullets = this.bullets.items;
    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      if (!b.active || b.kind !== 'airdrop') {
        continue;
      }
      const p = Math.min(1, b.age / b.life);
      ctx.save();
      ctx.translate(b.targetX, b.targetY);
      ctx.strokeStyle = `rgba(255, 209, 102, ${0.35 + p * 0.5})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, b.blastRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // 逐漸縮小的空投陰影
      ctx.fillStyle = `rgba(10, 12, 24, ${0.15 + p * 0.3})`;
      ctx.beginPath();
      ctx.ellipse(0, 4, 10 + p * 14, 5 + p * 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  drawProjectiles(ctx, player, time = 0) {
    // 1. 泡泡護盾環
    const bubbleLv = this.levels.bubble_shield;
    if (bubbleLv > 0 && !player.dead) {
      const stats = this._getBubbleStats(bubbleLv, player);
      for (let i = 0; i < stats.count; i++) {
        const angle = this.bubbleAngle + (i / stats.count) * Math.PI * 2;
        const bx = player.x + Math.cos(angle) * stats.orbitRadius;
        const by = player.y + Math.sin(angle) * stats.orbitRadius;
        const r = stats.bubbleRadius;

        ctx.save();
        ctx.translate(bx, by);
        ctx.fillStyle = 'rgba(155, 246, 255, 0.32)';
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(224, 251, 252, 0.9)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 泡泡反光點與粉彩星光
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-Math.round(r * 0.45), -Math.round(r * 0.45), 4, 3);
        ctx.fillStyle = 'rgba(255, 158, 187, 0.7)';
        ctx.fillRect(Math.round(r * 0.2), Math.round(r * 0.2), 3, 2);
        ctx.restore();
      }
    }

    // 2. 投射物（星塵魔彈、迴旋小魚乾、墜落紙箱）
    const bullets = this.bullets.items;
    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      if (!b.active) {
        continue;
      }

      if (b.kind === 'bolt') {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.angle);

        // 柔和星光尾跡
        ctx.fillStyle = 'rgba(255, 209, 102, 0.32)';
        ctx.beginPath();
        ctx.ellipse(-6, 0, 10, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // 像素星形彈體
        ctx.fillStyle = '#ffd166';
        ctx.fillRect(-3, -7, 6, 14);
        ctx.fillRect(-7, -3, 14, 6);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-3, -3, 6, 6);
        ctx.restore();
      } else if (b.kind === 'boomerang') {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.spin);

        // 發光迴旋光暈
        ctx.strokeStyle = 'rgba(155, 246, 255, 0.45)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, b.radius + 2, 0, Math.PI * 1.4);
        ctx.stroke();

        // 可愛像素小魚乾
        ctx.fillStyle = '#ffd6a5';
        ctx.strokeStyle = '#6c462f';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(2, 0, 9.5, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // 小魚尾鰭
        ctx.fillStyle = '#f4a261';
        ctx.beginPath();
        ctx.moveTo(-6, 0);
        ctx.lineTo(-13, -5);
        ctx.lineTo(-13, 5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 魚眼與高光
        ctx.fillStyle = '#262130';
        ctx.fillRect(5, -2, 2, 2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-1, -3, 4, 2);
        ctx.restore();
      } else if (b.kind === 'airdrop') {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.angle + Math.sin(time * 12) * 0.08);

        // 降落中的彈力紙箱
        ctx.fillStyle = '#c9935b';
        ctx.fillRect(-14, -12, 28, 24);
        ctx.strokeStyle = '#5c3c1e';
        ctx.lineWidth = 2;
        ctx.strokeRect(-14, -12, 28, 24);
        ctx.fillStyle = '#e5b884';
        ctx.fillRect(-13, -11, 26, 5);
        ctx.fillStyle = '#f7e5c2';
        ctx.fillRect(-3, -12, 6, 12);
        // 箱面星星標記
        ctx.fillStyle = '#ffd166';
        ctx.fillRect(-2, 2, 4, 6);
        ctx.fillRect(-4, 4, 8, 2);
        ctx.restore();
      }
    }

    // 3. 毛線雷電鏈電弧
    const arcs = this.lightningArcs.items;
    for (let i = 0; i < arcs.length; i++) {
      const a = arcs[i];
      if (!a.active) {
        continue;
      }
      const alpha = Math.max(0, 1 - a.age / a.life);
      const segments = 5;
      const dx = a.x2 - a.x1;
      const dy = a.y2 - a.y1;
      const len = Math.hypot(dx, dy) || 1;
      const perpX = -dy / len;
      const perpY = dx / len;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // 外層紫金柔光
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 5 * alpha;
      ctx.beginPath();
      ctx.moveTo(a.x1, a.y1);
      for (let s = 1; s < segments; s++) {
        const t = s / segments;
        const jitter = Math.sin(a.seed + s * 7.3) * 14;
        ctx.lineTo(a.x1 + dx * t + perpX * jitter, a.y1 + dy * t + perpY * jitter);
      }
      ctx.lineTo(a.x2, a.y2);
      ctx.stroke();

      // 內層純白閃電芯
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 * alpha;
      ctx.stroke();

      // 擊中點小星芒
      ctx.fillStyle = '#fff9db';
      ctx.fillRect(Math.round(a.x2 - 4), Math.round(a.y2 - 1), 8, 2);
      ctx.fillRect(Math.round(a.x2 - 1), Math.round(a.y2 - 4), 2, 8);
      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------------------
// 升級三選一卡片智慧生成器（自動過濾滿級武器，並保底穿插回復與屬性強化）
// ---------------------------------------------------------------------------

function shuffleInPlace(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = array[i];
    array[i] = array[j];
    array[j] = tmp;
  }
  return array;
}

function buildWeaponCard(weaponId, currentLv) {
  const spec = WEAPONS[weaponId];
  const nextLv = currentLv + 1;
  const descList = WEAPON_LEVEL_DESCRIPTIONS[weaponId] || [];
  const desc = descList[nextLv - 1] || spec.desc;

  return {
    id: weaponId,
    kind: 'weapon',
    weaponId,
    name: spec.name,
    icon: spec.icon,
    currentLv,
    nextLv,
    badge: currentLv === 0 ? '新武器' : `Lv.${currentLv} → Lv.${nextLv}`,
    desc,
  };
}

export function generateUpgradeChoices(player, weaponSystem, count = 3) {
  const upgradableOwned = [];
  const unlockableNew = [];

  for (let i = 0; i < WEAPON_IDS.length; i++) {
    const id = WEAPON_IDS[i];
    const spec = WEAPONS[id];
    const lv = weaponSystem.getLevel(id);

    if (lv >= spec.maxLv) {
      continue;
    }
    if (lv > 0) {
      upgradableOwned.push(buildWeaponCard(id, lv));
    } else {
      unlockableNew.push(buildWeaponCard(id, 0));
    }
  }

  shuffleInPlace(upgradableOwned);
  shuffleInPlace(unlockableNew);

  const ownedCount = weaponSystem.getOwnedWeaponIds().length;
  const weaponPool = [];

  // 若已擁有武器少於 4 個，優先保留至少 1 個新武器與 1 個現有武器升級
  if (ownedCount < 4) {
    if (unlockableNew.length > 0) {
      weaponPool.push(unlockableNew.shift());
    }
    if (upgradableOwned.length > 0) {
      weaponPool.push(upgradableOwned.shift());
    }
  } else {
    if (upgradableOwned.length > 0) {
      weaponPool.push(upgradableOwned.shift());
    }
    if (unlockableNew.length > 0) {
      weaponPool.push(unlockableNew.shift());
    }
  }

  const remainingWeapons = shuffleInPlace([...upgradableOwned, ...unlockableNew]);
  for (let i = 0; i < remainingWeapons.length; i++) {
    weaponPool.push(remainingWeapons[i]);
  }

  // 準備保底／輔助卡片池（受傷時提高回血魚乾出現權重）
  const passivePool = [];
  const isInjured = player.hp < player.maxHp;

  if (isInjured) {
    passivePool.push({ ...PASSIVE_UPGRADES.heal_heart });
  }

  const statPassives = shuffleInPlace([
    { ...PASSIVE_UPGRADES.passive_speed },
    { ...PASSIVE_UPGRADES.passive_magnet },
    { ...PASSIVE_UPGRADES.passive_haste },
    { ...PASSIVE_UPGRADES.passive_power },
  ]);

  for (let i = 0; i < statPassives.length; i++) {
    passivePool.push(statPassives[i]);
  }
  if (!isInjured) {
    passivePool.push({ ...PASSIVE_UPGRADES.heal_heart });
  }

  const choices = [];
  const usedIds = new Set();

  const tryPush = (card) => {
    if (!card || usedIds.has(card.id)) {
      return false;
    }
    usedIds.add(card.id);
    choices.push(card);
    return true;
  };

  // 先放入最多 (count - 1) 張武器卡，留 1 格穿插回復或屬性保底選項
  const targetWeaponSlots = Math.min(weaponPool.length, Math.max(0, count - 1));
  for (let i = 0; i < weaponPool.length && choices.length < targetWeaponSlots; i++) {
    tryPush(weaponPool[i]);
  }

  // 穿插 1 張保底選項（受傷優先暖心魚乾點心，否則隨機移速／吸星／冷卻／傷害）
  if (choices.length < count && passivePool.length > 0) {
    tryPush(passivePool.shift());
  }

  // 若仍有剩餘空位，優先補未滿級武器，再補其餘被動強化
  for (let i = 0; i < weaponPool.length && choices.length < count; i++) {
    tryPush(weaponPool[i]);
  }
  for (let i = 0; i < passivePool.length && choices.length < count; i++) {
    tryPush(passivePool[i]);
  }

  return choices;
}

export function applyUpgradeChoice(choice, player, weaponSystem, particles = null) {
  if (!choice) {
    return;
  }

  if (choice.kind === 'weapon') {
    weaponSystem.upgradeWeapon(choice.weaponId);
    if (particles) {
      particles.spawnRing(player.x, player.y, 12, 68, '#ffd166', 0.36);
      particles.spawnBurst(player.x, player.y, 12, '#ffd166', 130, 0.45);
    }
    return;
  }

  switch (choice.id) {
    case 'heal_heart': {
      if (player.hp < player.maxHp) {
        player.heal(1.0);
      } else {
        player.maxHp = roundHalf(player.maxHp + 0.5);
        player.hp = player.maxHp;
      }
      if (particles) {
        particles.spawnHealHearts(player.x, player.y, 6);
      }
      break;
    }
    case 'passive_speed':
      player.speedMult *= 1.12;
      if (particles) {
        particles.spawnBurst(player.x, player.y, 10, '#9bf6ff', 120, 0.38);
      }
      break;
    case 'passive_magnet':
      player.magnetMult *= 1.28;
      if (particles) {
        particles.spawnRing(player.x, player.y, 14, 90, '#9bf6ff', 0.42);
      }
      break;
    case 'passive_haste':
      player.bonusCdMult *= 0.9;
      if (particles) {
        particles.spawnBurst(player.x, player.y, 10, '#ffe66d', 130, 0.38);
      }
      break;
    case 'passive_power':
      player.dmgMult *= 1.16;
      if (particles) {
        particles.spawnBurst(player.x, player.y, 12, '#ff9ebb', 140, 0.42);
      }
      break;
    default:
      break;
  }
}

function roundHalf(value) {
  return Math.round(value * 2) / 2;
}
