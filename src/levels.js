// src/levels.js — 《星塵貓大作戰》120秒關卡波次導演、Boss 預警彈幕系統與 15 秒星空茶會互動 Ending

import { GAME_CONFIG, STAGES, CATS } from './config.js';
import { ObjectPool } from './entities.js';
import { drawCat, drawBossWarning } from './sprites.js';

const PICKUP_ROTATION = ['magnet', 'fish_soup', 'wish_bell'];
const BOSS_WARNING_SEC = 0.8;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function getStageById(stageIdOrObj) {
  if (stageIdOrObj && typeof stageIdOrObj === 'object') {
    return stageIdOrObj;
  }
  return STAGES.find((s) => s.id === stageIdOrObj) || STAGES[0];
}

// ---------------------------------------------------------------------------
// 關卡波次導演與 Boss 技能系統
// ---------------------------------------------------------------------------

export class LevelDirector {
  constructor() {
    // 固定容量 Boss 慢速可愛彈幕物件池（避免連續遊玩 GC 卡頓）
    this.bossBullets = new ObjectPool(72, () => ({
      active: false,
      _poolIndex: 0,
      style: 'star', // 'star' | 'takoyaki' | 'coin'
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 9,
      damage: 0.5,
      age: 0,
      life: 4.8,
      spin: 0,
      color: '#ffd166',
      coreColor: '#ffffff',
    }));

    // 專屬 0.8 秒 Boss 攻擊地面預警光圈池
    this.bossWarnings = new ObjectPool(4, () => ({
      active: false,
      _poolIndex: 0,
      shape: 'circle', // 'circle' | 'line' | 'ring'
      x: 0,
      y: 0,
      radius: 76,
      innerRadius: 0,
      angle: 0,
      length: 250,
      width: 58,
      color: '#ffd166',
      elapsed: 0,
      duration: BOSS_WARNING_SEC,
      progress: 0,
      skillKind: 'danmaku', // 'dash' | 'danmaku'
      bossType: 'boss_box_king',
    }));

    this.stage = STAGES[0];
    this.elapsed = 0;
    this.phase = 'warmup';
    this.spawnTimer = 0;
    this.nextPickupSec = 30;
    this.pickupDropIndex = 0;
    this.rushAnnounced = false;
    this.bossWarningAnnounced = false;

    this.bossSpawned = false;
    this.stageCleared = false;
    this.bossSkillCooldown = 2.2;
    this.bossSkillCycle = 0;
    this.bossWarningActive = false;

    // 畫面橫幅短訊佇列（供 HUD 顯示柔和提示）
    this.bannerText = '';
    this.bannerSub = '';
    this.bannerTimer = 0;
  }

  startStage(stageIdOrObj) {
    this.stage = getStageById(stageIdOrObj);
    this.elapsed = 0;
    this.phase = 'warmup';
    this.spawnTimer = 0.65;
    this.nextPickupSec = 30;
    this.pickupDropIndex = 0;
    this.rushAnnounced = false;
    this.bossWarningAnnounced = false;

    this.bossSpawned = false;
    this.stageCleared = false;
    this.bossSkillCooldown = 2.0;
    this.bossSkillCycle = 0;
    this.bossWarningActive = false;

    this.bossBullets.clear();
    this.bossWarnings.clear();

    this.showBanner(`第 ${this.stage.id} 關・${this.stage.name}`, '星夜散步開始，收集星塵變強吧', 2.8);
  }

  clear() {
    this.bossBullets.clear();
    this.bossWarnings.clear();
    this.bannerTimer = 0;
  }

  showBanner(title, subtitle = '', duration = 2.6) {
    this.bannerText = title;
    this.bannerSub = subtitle;
    this.bannerTimer = duration;
  }

  getTimeRemaining() {
    return Math.max(0, GAME_CONFIG.STAGE_DURATION - this.elapsed);
  }

  getProgressRatio() {
    return clamp(this.elapsed / GAME_CONFIG.STAGE_DURATION, 0, 1);
  }

  update(dt, time, context) {
    const {
      player,
      enemyPool,
      pickupPool,
      particlePool,
      shake,
      callbacks = null,
    } = context;

    if (this.bannerTimer > 0) {
      this.bannerTimer = Math.max(0, this.bannerTimer - dt);
    }

    if (this.stageCleared || player.dead) {
      return;
    }

    if (!this.bossSpawned) {
      this.elapsed += dt;
      this._updateNormalPhase(dt, player, enemyPool, pickupPool, particlePool, callbacks);
    } else {
      this._updateBossPhase(dt, time, player, enemyPool, pickupPool, particlePool, shake, callbacks);
    }

    this._updateBossBullets(dt, player, shake, particlePool, callbacks);
  }

  // -------------------------------------------------------------------------
  // 0–120 秒平滑難度曲線：0-30 暖身、30-75 混怪+每30秒驚喜道具、75-115 溫和怪潮、120 清場出 Boss
  // -------------------------------------------------------------------------

  _updateNormalPhase(dt, player, enemyPool, pickupPool, particlePool, callbacks) {
    const duration = GAME_CONFIG.STAGE_DURATION; // 120 秒
    const t = this.elapsed;

    // 1. 判斷當前波次階段與溫和提示
    if (t < 30) {
      this.phase = 'warmup';
    } else if (t < 75) {
      this.phase = 'escalate';
    } else if (t < 115) {
      this.phase = 'rush';
      if (!this.rushAnnounced) {
        this.rushAnnounced = true;
        this.showBanner('星夜小怪潮來襲！', '保持移動，小心走位收集星塵', 2.6);
      }
    } else if (t < duration) {
      this.phase = 'pre_boss';
      if (!this.bossWarningAnnounced) {
        this.bossWarningAnnounced = true;
        this.showBanner('星光震動中…', `${this.stage.boss.name} 即將登場`, 3.2);
        if (callbacks && typeof callbacks.onBossIncoming === 'function') {
          callbacks.onBossIncoming(this.stage.boss);
        }
      }
    }

    // 2. 每 30 秒（30s、60s、90s）於玩家附近安全位置掉落驚喜道具
    if (t >= this.nextPickupSec && this.nextPickupSec < duration) {
      this._spawnSafePickupNearPlayer(player, pickupPool, particlePool, callbacks);
      this.nextPickupSec += 30;
    }

    // 3. 抵達 120 秒：溫柔清空場上所有普通小怪並召喚該關專屬 Boss
    if (t >= duration) {
      this._clearNormalEnemiesForBoss(enemyPool, particlePool);
      this._spawnStageBoss(player, enemyPool, particlePool, callbacks);
      return;
    }

    // 4. 115–120 秒給玩家 5 秒微喘息準備迎接 Boss，不再新增小怪
    if (t >= 115) {
      return;
    }

    // 5. 依階段計算生怪間隔與每次生成數量
    const baseRate = this.stage.spawnRateBase || 1.0;
    let spawnInterval = baseRate * 1.18;
    let batchCount = 1;
    let maxActiveCap = 24;

    if (this.phase === 'warmup') {
      // 0–30 秒：輕鬆暖身，單隻或少量出現
      const p = t / 30;
      spawnInterval = baseRate * (1.28 - p * 0.25);
      batchCount = p > 0.65 ? 2 : 1;
      maxActiveCap = 20;
    } else if (this.phase === 'escalate') {
      // 30–75 秒：小怪組合增多，曲線平緩抬升
      const p = (t - 30) / 45;
      spawnInterval = baseRate * (0.98 - p * 0.24);
      batchCount = p > 0.5 ? 3 : 2;
      maxActiveCap = 46;
    } else {
      // 75–115 秒：溫和怪潮衝刺，保留單手繞圈空間
      const p = (t - 75) / 40;
      spawnInterval = baseRate * (0.72 - p * 0.14);
      batchCount = p > 0.55 ? 4 : 3;
      maxActiveCap = 72;
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = Math.max(0.32, spawnInterval);

      if (enemyPool.activeCount < maxActiveCap) {
        const room = Math.min(batchCount, maxActiveCap - enemyPool.activeCount);
        const baseAngle = Math.random() * Math.PI * 2;
        for (let i = 0; i < room; i++) {
          const type = this._pickEnemyType(t);
          const angle = baseAngle + (i - (room - 1) * 0.5) * 0.28 + (Math.random() - 0.5) * 0.14;
          const dist = 250 + Math.random() * 85;
          const sx = clamp(player.x + Math.cos(angle) * dist, 32, GAME_CONFIG.WORLD_SIZE - 32);
          const sy = clamp(player.y + Math.sin(angle) * dist, 32, GAME_CONFIG.WORLD_SIZE - 32);
          enemyPool.spawnEnemy(type, sx, sy, this.stage, t);
        }
      }
    }
  }

  _pickEnemyType(elapsedSec) {
    const list = this.stage.enemies && this.stage.enemies.length > 0
      ? this.stage.enemies
      : ['dandelion'];

    if (list.length === 1) {
      return list[0];
    }

    // 0–30 秒暖身：主要為第 1 種基礎小怪，偶爾混入第 2 種讓玩家先熟悉
    if (elapsedSec < 30) {
      return Math.random() < 0.78 ? list[0] : list[1];
    }

    // 30–75 秒：開放全體關卡小怪組合
    if (elapsedSec < 75) {
      return list[Math.floor(Math.random() * list.length)];
    }

    // 75–115 秒：略微提高後段特色小怪比重
    const roll = Math.random();
    if (list.length >= 3 && roll < 0.44) {
      return list[2];
    }
    if (roll < 0.78) {
      return list[1];
    }
    return list[0];
  }

  _spawnSafePickupNearPlayer(player, pickupPool, particlePool, callbacks) {
    // 受傷時優先給予暖心魚湯，否則輪流掉落大磁鐵、魚湯、祈願鈴鐺
    let type = PICKUP_ROTATION[this.pickupDropIndex % PICKUP_ROTATION.length];
    this.pickupDropIndex += 1;
    if (player.hp <= Math.max(1, player.maxHp * 0.5) && Math.random() < 0.65) {
      type = 'fish_soup';
    }

    // 選取距離玩家 115–165px 且不貼近場地邊緣的安全位置
    const angle = Math.random() * Math.PI * 2;
    const dist = 115 + Math.random() * 50;
    const px = clamp(player.x + Math.cos(angle) * dist, 75, GAME_CONFIG.WORLD_SIZE - 75);
    const py = clamp(player.y + Math.sin(angle) * dist, 75, GAME_CONFIG.WORLD_SIZE - 75);

    const spawned = pickupPool.spawn(type, px, py);
    if (spawned) {
      if (particlePool) {
        const color = type === 'magnet' ? '#9bf6ff' : type === 'fish_soup' ? '#ffd166' : '#ff9ebb';
        particlePool.spawnRing(px, py, 8, 42, color, 0.45);
        particlePool.spawnBurst(px, py, 10, color, 95, 0.42);
      }
      const label =
        type === 'magnet'
          ? '驚喜道具：星塵大磁鐵！'
          : type === 'fish_soup'
            ? '驚喜道具：暖呼呼魚湯！'
            : '驚喜道具：祈願鈴鐺！';
      this.showBanner(label, '就在附近，快去撿起來吧', 2.2);
      if (callbacks && typeof callbacks.onPickupSpawn === 'function') {
        callbacks.onPickupSpawn(type, px, py);
      }
    }
  }

  _clearNormalEnemiesForBoss(enemyPool, particlePool) {
    const items = enemyPool.pool.items;
    for (let i = 0; i < items.length; i++) {
      const e = items[i];
      if (!e.active || e.isBoss) {
        continue;
      }
      if (particlePool) {
        particlePool.spawnBurst(e.x, e.y, 4, e.color || '#ffd166', 75, 0.35);
      }
      enemyPool.pool.release(e);
    }
  }

  _spawnStageBoss(player, enemyPool, particlePool, callbacks) {
    this.bossSpawned = true;
    this.phase = 'boss';
    this.bossSkillCooldown = 1.9;
    this.bossSkillCycle = 0;
    this.bossWarningActive = false;

    // 優先在玩家視野上方 215px 登場；若靠近上邊界則改在下方登場
    const offsetY = player.y > 320 ? -215 : 215;
    const bx = clamp(player.x, 90, GAME_CONFIG.WORLD_SIZE - 90);
    const by = clamp(player.y + offsetY, 90, GAME_CONFIG.WORLD_SIZE - 90);

    const boss = enemyPool.spawnBoss(this.stage, bx, by);
    if (boss) {
      // 由 LevelDirector 統一掌控 0.8 秒預警技能，避免 EnemyPool 內建倒數重複觸發
      boss.bossTimer = 9999;
      if (particlePool) {
        particlePool.spawnRing(bx, by, 18, 110, '#ffd166', 0.55);
        particlePool.spawnBurst(bx, by, 22, '#ffd166', 175, 0.65);
      }
      this.showBanner(`BOSS 登場・${boss.name}`, '留意地面 0.8 秒發光預警圈閃避攻擊！', 3.0);
      if (callbacks && typeof callbacks.onBossSpawn === 'function') {
        callbacks.onBossSpawn(boss, this.stage);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Boss 戰階段：0.8 秒地面發光預警圈 → 衝刺 或 慢速可愛彈幕（單手可穩定無傷閃避）
  // -------------------------------------------------------------------------

  _updateBossPhase(dt, _time, player, enemyPool, pickupPool, particlePool, shake, callbacks) {
    const boss = enemyPool.activeBoss;

    // Boss 已被安撫擊敗 -> 通關！
    if (!boss || !boss.active) {
      this.stageCleared = true;
      this.phase = 'cleared';
      this.bossWarnings.clear();
      this.bossBullets.clear();
      this.showBanner('關卡安撫成功！', `${this.stage.name} 恢復了寧靜星光`, 3.2);
      if (callbacks && typeof callbacks.onStageClear === 'function') {
        callbacks.onStageClear(this.stage);
      }
      return;
    }

    // 鎖住 EnemyPool 內部預設技能計時器，統一由本導演調度
    if (boss.bossState === 'chase') {
      boss.bossTimer = 9999;
    }

    // Boss 戰若超過 35 秒，偶爾補掉一個驚喜道具保持良性體驗
    this.elapsed += dt;
    if (this.elapsed >= this.nextPickupSec) {
      this._spawnSafePickupNearPlayer(player, pickupPool, particlePool, callbacks);
      this.nextPickupSec += 35;
    }

    // 更新 0.8 秒地面發光預警圈
    let hasActiveWarning = false;
    const warnings = this.bossWarnings.items;
    for (let i = 0; i < warnings.length; i++) {
      const w = warnings[i];
      if (!w.active) {
        continue;
      }
      hasActiveWarning = true;
      w.elapsed += dt;
      w.progress = clamp(w.elapsed / w.duration, 0, 1);

      // 若是彈幕圈，跟隨 Boss 中心；直線衝刺則鎖定瞄準方向讓玩家可明確側移閃開
      if (w.skillKind === 'danmaku') {
        w.x = boss.x;
        w.y = boss.y;
      }

      if (w.elapsed >= w.duration) {
        this._executeBossSkill(w, boss, player, particlePool, shake, callbacks);
        this.bossWarnings.release(w);
      }
    }

    this.bossWarningActive = hasActiveWarning;

    // 當 Boss 處於追擊狀態且無進行中預警，開始下一輪技能倒數
    if (!hasActiveWarning && boss.bossState === 'chase') {
      boss.charging = false;
      this.bossSkillCooldown -= dt;
      if (this.bossSkillCooldown <= 0) {
        this._beginBossWarning(boss, player, callbacks);
        // 依關卡微調技能節奏（保留充足單手走位呼吸感）
        this.bossSkillCooldown = Math.max(2.3, 3.1 - (this.stage.id - 1) * 0.25);
      }
    }
  }

  _beginBossWarning(boss, player, callbacks) {
    const w = this.bossWarnings.acquire();
    if (!w) {
      return;
    }

    const angleToPlayer = Math.atan2(player.y - boss.y, player.x - boss.x);
    const useDash = this.bossSkillCycle % 2 === 0;
    this.bossSkillCycle += 1;

    w.elapsed = 0;
    w.duration = BOSS_WARNING_SEC; // 嚴格 0.8 秒發光預警
    w.progress = 0;
    w.bossType = boss.type;

    if (useDash) {
      // 衝刺型預警：鎖定直線發光預警帶 + 圓形起點光圈
      w.skillKind = 'dash';
      w.shape = 'line';
      w.x = boss.x;
      w.y = boss.y;
      w.angle = angleToPlayer;
      w.length = boss.type === 'boss_box_king' ? 235 : 215;
      w.width = 58;
      w.radius = 40;
      w.color = boss.type === 'boss_daruma' ? '#ff6b6b' : '#ffd166';
    } else {
      // 慢速可愛彈幕預警：Boss 腳下 0.8 秒地面發光預警圈
      w.skillKind = 'danmaku';
      w.shape = 'circle';
      w.x = boss.x;
      w.y = boss.y;
      w.radius = 78;
      w.angle = angleToPlayer;
      w.color = boss.type === 'boss_takoyaki' ? '#ff9ebb' : '#9bf6ff';
    }

    // 預警期間 Boss 停下蓄力並亮起氣場
    boss.charging = true;
    boss.bossState = 'telegraph';
    boss.bossTimer = BOSS_WARNING_SEC + 0.05;
    boss.bossDashVx = Math.cos(angleToPlayer) * (boss.type === 'boss_daruma' ? 285 : 265);
    boss.bossDashVy = Math.sin(angleToPlayer) * (boss.type === 'boss_daruma' ? 285 : 265);

    if (callbacks && typeof callbacks.onBossWarning === 'function') {
      callbacks.onBossWarning(boss, w.skillKind);
    }
  }

  _executeBossSkill(warning, boss, player, particlePool, shake, callbacks) {
    boss.charging = false;

    if (warning.skillKind === 'dash') {
      // 執行可控速可愛飛撲衝刺（0.64 秒後自動停回追擊）
      boss.bossState = 'dash';
      boss.bossDashTimer = 0.64;

      if (particlePool) {
        particlePool.spawnBurst(boss.x, boss.y, 12, warning.color, 130, 0.4);
      }
      if (shake) {
        shake.add(3.6, 12);
      }

      // 達摩與飛行船衝刺起跳時順帶放出 4 顆極慢速星彈增加演出感
      if (boss.type === 'boss_takoyaki' || boss.type === 'boss_daruma') {
        const style = boss.type === 'boss_takoyaki' ? 'takoyaki' : 'coin';
        for (let i = 0; i < 4; i++) {
          const a = warning.angle + Math.PI * 0.5 * i + Math.PI * 0.25;
          this._spawnBossBullet(boss.x, boss.y, a, 92, style);
        }
      }

      if (callbacks && typeof callbacks.onBossAttack === 'function') {
        callbacks.onBossAttack('dash', boss);
      }
      return;
    }

    // 執行慢速可愛彈幕（空隙充裕，單手小幅度滑動即可穩定閃過）
    boss.bossState = 'chase';
    boss.bossTimer = 9999;

    const aim = Math.atan2(player.y - boss.y, player.x - boss.x);

    if (boss.type === 'boss_box_king') {
      // 巨型紙箱貓王：8 向慢速發光星光彈（間距寬敞）
      const count = 8;
      for (let i = 0; i < count; i++) {
        const a = aim + (i / count) * Math.PI * 2;
        this._spawnBossBullet(boss.x, boss.y, a, 108, 'star');
      }
    } else if (boss.type === 'boss_takoyaki') {
      // 章魚燒飛行船：5 顆慢速章魚燒扇形彈 + 外環 5 顆錯開慢彈
      for (let i = -2; i <= 2; i++) {
        this._spawnBossBullet(boss.x, boss.y, aim + i * 0.34, 112, 'takoyaki');
      }
      for (let i = 0; i < 5; i++) {
        const a = aim + Math.PI + (i / 5) * Math.PI * 2;
        this._spawnBossBullet(boss.x, boss.y, a, 88, 'takoyaki');
      }
    } else {
      // 巨型招財達摩：10 向招財金幣慢速光環
      const count = 10;
      for (let i = 0; i < count; i++) {
        const a = aim + (i / count) * Math.PI * 2;
        this._spawnBossBullet(boss.x, boss.y, a, 104, 'coin');
      }
    }

    if (particlePool) {
      particlePool.spawnRing(boss.x, boss.y, 18, 84, warning.color, 0.36);
    }
    if (shake) {
      shake.add(3.0, 12);
    }
    if (callbacks && typeof callbacks.onBossAttack === 'function') {
      callbacks.onBossAttack('danmaku', boss);
    }
  }

  _spawnBossBullet(x, y, angle, speed, style) {
    const b = this.bossBullets.acquire();
    if (!b) {
      return null;
    }

    b.style = style;
    b.x = x;
    b.y = y;
    b.vx = Math.cos(angle) * speed;
    b.vy = Math.sin(angle) * speed;
    b.radius = style === 'takoyaki' ? 10 : 8.5;
    b.damage = 0.5;
    b.age = 0;
    b.life = 5.2;
    b.spin = angle;

    if (style === 'takoyaki') {
      b.color = '#e09f5a';
      b.coreColor = '#ff9ebb';
    } else if (style === 'coin') {
      b.color = '#ffd166';
      b.coreColor = '#ff6b6b';
    } else {
      b.color = '#ffd166';
      b.coreColor = '#ffffff';
    }

    return b;
  }

  _updateBossBullets(dt, player, shake, particlePool, callbacks) {
    const items = this.bossBullets.items;
    const worldMax = GAME_CONFIG.WORLD_SIZE;

    for (let i = 0; i < items.length; i++) {
      const b = items[i];
      if (!b.active) {
        continue;
      }

      b.age += dt;
      b.spin += dt * 4.2;
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (
        b.age >= b.life ||
        b.x < -20 ||
        b.x > worldMax + 20 ||
        b.y < -20 ||
        b.y > worldMax + 20
      ) {
        this.bossBullets.release(b);
        continue;
      }

      // 偏寬容的彈幕受擊半徑（比視覺略小 2.5px，單手擦彈更療癒）
      const dx = player.x - b.x;
      const dy = player.y - b.y;
      const hitR = b.radius + player.hitboxR - 2.5;
      if (dx * dx + dy * dy <= hitR * hitR) {
        const hurt = player.takeDamage(b.damage, shake, particlePool);
        if (hurt && callbacks && typeof callbacks.onPlayerHurt === 'function') {
          callbacks.onPlayerHurt();
        }
        if (particlePool) {
          particlePool.spawnBurst(b.x, b.y, 6, b.color, 95, 0.3);
        }
        this.bossBullets.release(b);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 繪製：Boss 0.8 秒地面預警光圈 與 慢速可愛彈幕
  // -------------------------------------------------------------------------

  drawGroundWarnings(ctx, time = 0) {
    const items = this.bossWarnings.items;
    for (let i = 0; i < items.length; i++) {
      const w = items[i];
      if (!w.active) {
        continue;
      }
      drawBossWarning(ctx, w, time);
    }
  }

  drawBossBullets(ctx, time = 0) {
    const items = this.bossBullets.items;
    for (let i = 0; i < items.length; i++) {
      const b = items[i];
      if (!b.active) {
        continue;
      }

      ctx.save();
      ctx.translate(b.x, b.y);

      // 外層柔和警示光暈（讓慢速彈幕在任何關卡地板上都極易辨識）
      const pulse = 0.72 + 0.28 * Math.sin(time * 9 + i);
      ctx.fillStyle = `rgba(255, 209, 102, ${0.22 * pulse})`;
      ctx.beginPath();
      ctx.arc(0, 0, b.radius + 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.rotate(b.spin);

      if (b.style === 'takoyaki') {
        // 可愛迷你章魚燒彈
        ctx.fillStyle = '#e09f5a';
        ctx.strokeStyle = '#5c3118';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#582f24';
        ctx.beginPath();
        ctx.arc(0, -2, b.radius * 0.78, Math.PI, 0);
        ctx.fill();

        ctx.fillStyle = '#fff8dc';
        ctx.fillRect(-5, -4, 10, 2);
        ctx.fillStyle = '#4f9d69';
        ctx.fillRect(-2, -6, 3, 2);
      } else if (b.style === 'coin') {
        // 閃亮招財達摩金幣彈
        ctx.fillStyle = '#ffd166';
        ctx.strokeStyle = '#9e6200';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#b5172a';
        ctx.fillRect(-3, -3, 6, 6);
        ctx.fillStyle = '#fff9db';
        ctx.fillRect(-5, -5, 3, 2);
      } else {
        // 紙箱貓王星光彈
        const s = b.radius;
        ctx.fillStyle = '#ffd166';
        ctx.fillRect(-3.5, -s, 7, s * 2);
        ctx.fillRect(-s, -3.5, s * 2, 7);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-3.5, -3.5, 7, 7);
      }

      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------------------
// 3 關全通關專屬：15 秒「星空茶會互動 Ending」（5 隻貓圍坐野餐墊 + 點擊放像素煙火）
// ---------------------------------------------------------------------------

const FIREWORK_PALETTES = [
  ['#ffd166', '#fff3b0', '#ffffff'],
  ['#ff9ebb', '#ffc8dd', '#ffffff'],
  ['#9bf6ff', '#caf0f8', '#ffffff'],
  ['#a8e6cf', '#dcedc1', '#fff3b0'],
  ['#cdb4db', '#ffc8dd', '#ffd166'],
];

export class StarryTeaPartyEnding {
  constructor() {
    this.duration = 15;
    this.elapsed = 0;
    this.active = false;
    this.completed = false;
    this.width = GAME_CONFIG.DESIGN_WIDTH;
    this.height = GAME_CONFIG.DESIGN_HEIGHT;
    this.autoFireworkTimer = 1.1;
    this.tapCount = 0;

    // 預先生成靜態背景星星，避免每幀重算
    this.skyStars = [];
    for (let i = 0; i < 64; i++) {
      this.skyStars.push({
        u: (i * 0.61803398875) % 1,
        v: ((i * 0.38196601125 + 0.07) % 0.62),
        size: i % 5 === 0 ? 3 : 2,
        phase: i * 1.37,
        color: i % 4 === 0 ? '#ffd166' : i % 4 === 1 ? '#9bf6ff' : i % 4 === 2 ? '#ff9ebb' : '#ffffff',
      });
    }

    // 煙火升空火箭池
    this.rockets = new ObjectPool(12, () => ({
      active: false,
      _poolIndex: 0,
      x: 0,
      y: 0,
      startX: 0,
      startY: 0,
      targetX: 0,
      targetY: 0,
      age: 0,
      flightSec: 0.42,
      paletteIndex: 0,
    }));

    // 像素煙火火花與飄浮愛心音符池
    this.sparks = new ObjectPool(240, () => ({
      active: false,
      _poolIndex: 0,
      kind: 'pixel', // 'pixel' | 'star' | 'heart' | 'note'
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      gravity: 78,
      size: 4,
      color: '#ffd166',
      age: 0,
      life: 1.1,
    }));

    // 貓咪開心跳躍反應計時
    this.catCheerTimer = 0;
    this.noteTimer = 0.6;
  }

  start(viewW = GAME_CONFIG.DESIGN_WIDTH, viewH = GAME_CONFIG.DESIGN_HEIGHT) {
    this.width = viewW;
    this.height = viewH;
    this.elapsed = 0;
    this.active = true;
    this.completed = false;
    this.autoFireworkTimer = 0.7;
    this.tapCount = 0;
    this.catCheerTimer = 1.2;
    this.noteTimer = 0.5;
    this.rockets.clear();
    this.sparks.clear();
  }

  resize(viewW, viewH) {
    this.width = viewW;
    this.height = viewH;
  }

  stop() {
    this.active = false;
    this.rockets.clear();
    this.sparks.clear();
  }

  /**
   * 玩家點擊螢幕任意處，綻放一朵療癒像素煙火並讓 5 隻貓咪歡呼彈跳
   */
  triggerFirework(targetX, targetY, audio = null) {
    if (!this.active) {
      return;
    }

    const tx = clamp(targetX, 34, this.width - 34);
    const ty = clamp(targetY, 56, this.height * 0.66);

    const rocket = this.rockets.acquire();
    if (rocket) {
      rocket.startX = clamp(tx + (Math.random() - 0.5) * 44, 30, this.width - 30);
      rocket.startY = this.height * 0.72;
      rocket.x = rocket.startX;
      rocket.y = rocket.startY;
      rocket.targetX = tx;
      rocket.targetY = ty;
      rocket.age = 0;
      rocket.flightSec = 0.34 + Math.random() * 0.12;
      rocket.paletteIndex = Math.floor(Math.random() * FIREWORK_PALETTES.length);
    } else {
      // 若火箭池暫滿，直接原地綻放
      this._burstFirework(tx, ty, Math.floor(Math.random() * FIREWORK_PALETTES.length), audio);
    }

    this.tapCount += 1;
    this.catCheerTimer = 0.85;
  }

  _burstFirework(x, y, paletteIndex, audio = null) {
    const palette = FIREWORK_PALETTES[paletteIndex % FIREWORK_PALETTES.length];
    const outerCount = 22;
    const innerCount = 10;

    // 外層像素星環
    for (let i = 0; i < outerCount; i++) {
      const p = this.sparks.acquire();
      if (!p) {
        break;
      }
      const angle = (i / outerCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.14;
      const speed = 78 + Math.random() * 68;
      p.kind = i % 3 === 0 ? 'star' : 'pixel';
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.gravity = 72;
      p.size = 3.5 + Math.random() * 2.5;
      p.color = palette[i % palette.length];
      p.age = 0;
      p.life = 0.95 + Math.random() * 0.45;
    }

    // 內層溫暖星蕊
    for (let i = 0; i < innerCount; i++) {
      const p = this.sparks.acquire();
      if (!p) {
        break;
      }
      const angle = (i / innerCount) * Math.PI * 2;
      const speed = 34 + Math.random() * 26;
      p.kind = 'star';
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.gravity = 45;
      p.size = 3;
      p.color = '#ffffff';
      p.age = 0;
      p.life = 0.72 + Math.random() * 0.28;
    }

    if (audio && typeof audio.playFirework === 'function') {
      audio.playFirework();
    }
  }

  update(dt, audio = null) {
    if (!this.active) {
      return;
    }

    this.elapsed += dt;
    if (this.elapsed >= this.duration) {
      this.completed = true;
    }

    if (this.catCheerTimer > 0) {
      this.catCheerTimer = Math.max(0, this.catCheerTimer - dt);
    }

    // 自動定時綻放柔和慶祝煙火，同時玩家點擊隨時可追加
    this.autoFireworkTimer -= dt;
    if (this.autoFireworkTimer <= 0) {
      this.autoFireworkTimer = 2.1 + Math.random() * 1.2;
      const fx = this.width * (0.2 + Math.random() * 0.6);
      const fy = this.height * (0.16 + Math.random() * 0.28);
      this.triggerFirework(fx, fy, audio);
    }

    // 從野餐墊上方緩慢飄起療癒小愛心與音符
    this.noteTimer -= dt;
    if (this.noteTimer <= 0) {
      this.noteTimer = 0.95;
      const p = this.sparks.acquire();
      if (p) {
        const cx = this.width * 0.5 + (Math.random() - 0.5) * 160;
        const cy = this.height * 0.68 + (Math.random() - 0.5) * 40;
        p.kind = Math.random() < 0.5 ? 'heart' : 'note';
        p.x = cx;
        p.y = cy;
        p.vx = (Math.random() - 0.5) * 16;
        p.vy = -26 - Math.random() * 18;
        p.gravity = -4;
        p.size = 5;
        p.color = Math.random() < 0.5 ? '#ff9ebb' : '#ffd166';
        p.age = 0;
        p.life = 1.65;
      }
    }

    // 更新升空火箭
    const rockets = this.rockets.items;
    for (let i = 0; i < rockets.length; i++) {
      const r = rockets[i];
      if (!r.active) {
        continue;
      }
      r.age += dt;
      const t = clamp(r.age / r.flightSec, 0, 1);
      const ease = 1 - (1 - t) * (1 - t);
      r.x = r.startX + (r.targetX - r.startX) * ease;
      r.y = r.startY + (r.targetY - r.startY) * ease;

      // 尾跡星塵
      if (Math.random() < 0.45) {
        const trail = this.sparks.acquire();
        if (trail) {
          trail.kind = 'pixel';
          trail.x = r.x + (Math.random() - 0.5) * 3;
          trail.y = r.y + 4;
          trail.vx = (Math.random() - 0.5) * 14;
          trail.vy = 18;
          trail.gravity = 15;
          trail.size = 2.5;
          trail.color = '#fff3b0';
          trail.age = 0;
          trail.life = 0.25;
        }
      }

      if (t >= 1) {
        this._burstFirework(r.targetX, r.targetY, r.paletteIndex, audio);
        this.rockets.release(r);
      }
    }

    // 更新煙火與愛心粒子
    const sparks = this.sparks.items;
    for (let i = 0; i < sparks.length; i++) {
      const p = sparks[i];
      if (!p.active) {
        continue;
      }
      p.age += dt;
      if (p.age >= p.life) {
        this.sparks.release(p);
        continue;
      }
      p.vy += p.gravity * dt;
      const drag = Math.exp(-1.7 * dt);
      p.vx *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  draw(ctx) {
    if (!this.active) {
      return;
    }

    const w = this.width;
    const h = this.height;
    const time = this.elapsed;

    // 1. 深藍星夜漸層天空
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#0f1633');
    sky.addColorStop(0.5, '#1e2749');
    sky.addColorStop(0.76, '#352a59');
    sky.addColorStop(1, '#1d2d44');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // 2. 閃爍星空與溫柔彎月
    for (let i = 0; i < this.skyStars.length; i++) {
      const s = this.skyStars[i];
      const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * 2.6 + s.phase));
      ctx.save();
      ctx.globalAlpha = twinkle;
      ctx.fillStyle = s.color;
      const sx = Math.round(s.u * w);
      const sy = Math.round(s.v * h);
      ctx.fillRect(sx, sy, s.size, s.size);
      ctx.restore();
    }

    // 右上柔和星月
    const moonX = w * 0.8;
    const moonY = h * 0.17;
    const moonGlow = ctx.createRadialGradient(moonX, moonY, 8, moonX, moonY, 68);
    moonGlow.addColorStop(0, 'rgba(255, 243, 176, 0.38)');
    moonGlow.addColorStop(1, 'rgba(255, 243, 176, 0)');
    ctx.fillStyle = moonGlow;
    ctx.beginPath();
    ctx.arc(moonX, moonY, 68, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fff3b0';
    ctx.beginPath();
    ctx.arc(moonX, moonY, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#182143';
    ctx.beginPath();
    ctx.arc(moonX + 8, moonY - 5, 19, 0, Math.PI * 2);
    ctx.fill();

    // 3. 繪製背景層煙火火箭與像素火花
    this._drawFireworks(ctx);

    // 4. 溫柔星光草坡
    const hillY = h * 0.62;
    ctx.fillStyle = '#253c56';
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.88, w * 0.9, h * 0.32, 0, Math.PI, 0, false);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    // 5. 星光野餐墊（柔和粉金格紋）
    const cx = w * 0.5;
    const cy = Math.max(hillY + 95, h * 0.72);
    const matW = Math.min(286, w * 0.78);
    const matH = 124;

    ctx.save();
    ctx.translate(cx, cy);

    // 野餐墊底部星光暈
    const matGlow = ctx.createRadialGradient(0, 0, 20, 0, 0, matW * 0.62);
    matGlow.addColorStop(0, 'rgba(255, 209, 102, 0.28)');
    matGlow.addColorStop(1, 'rgba(255, 209, 102, 0)');
    ctx.fillStyle = matGlow;
    ctx.beginPath();
    ctx.ellipse(0, 4, matW * 0.65, matH * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();

    // 野餐墊梯形布面
    ctx.beginPath();
    ctx.moveTo(-matW * 0.44, -matH * 0.46);
    ctx.lineTo(matW * 0.44, -matH * 0.46);
    ctx.lineTo(matW * 0.54, matH * 0.48);
    ctx.lineTo(-matW * 0.54, matH * 0.48);
    ctx.closePath();
    ctx.fillStyle = '#fff5e4';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffd166';
    ctx.stroke();

    // 溫馨粉金格紋
    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(255, 158, 187, 0.28)';
    for (let x = -matW; x <= matW; x += 28) {
      ctx.fillRect(x, -matH, 14, matH * 2);
    }
    ctx.fillStyle = 'rgba(255, 209, 102, 0.22)';
    for (let y = -matH; y <= matH; y += 22) {
      ctx.fillRect(-matW, y, matW * 2, 11);
    }
    ctx.restore();

    // 野餐墊中央茶壺、茶杯與三色糰子點心盤
    this._drawTeaSet(ctx, time);
    ctx.restore();

    // 6. 5 隻貓咪圍坐星光野餐墊（由後排至前排依 Y 座標排序繪製）
    const catSeats = [
      { cat: CATS[3], x: cx - 72, y: cy - 42, facing: 1 },  // 星空黑貓（左後）
      { cat: CATS[4], x: cx + 72, y: cy - 42, facing: -1 }, // 溫泉白貓（右後）
      { cat: CATS[0], x: cx - 108, y: cy + 8, facing: 1 },  // 舉手紙箱貓（左中）
      { cat: CATS[1], x: cx + 108, y: cy + 8, facing: -1 }, // 三花糰子貓（右中）
      { cat: CATS[2], x: cx, y: cy + 44, facing: 1 },       // 抹茶胖橘貓（前中）
    ];

    const cheering = this.catCheerTimer > 0;
    for (let i = 0; i < catSeats.length; i++) {
      const seat = catSeats[i];
      drawCat(ctx, seat.cat, seat.x, seat.y, {
        time: time + i * 0.45,
        moving: cheering,
        facing: seat.facing,
        scale: 1.08,
        showShadow: true,
      });
    }

    // 7. 柔和祝福字幕與互動提示
    const fadeIn = clamp(time / 1.2, 0, 1);
    ctx.save();
    ctx.globalAlpha = fadeIn;
    ctx.textAlign = 'center';

    ctx.fillStyle = '#ffd166';
    ctx.font = '700 22px -apple-system, BlinkMacSystemFont, "PingFang TC", sans-serif';
    ctx.fillText('✦ 星空茶會・全關卡制霸 ✦', w * 0.5, h * 0.11);

    ctx.fillStyle = '#f8f9fc';
    ctx.font = '500 13px -apple-system, BlinkMacSystemFont, "PingFang TC", sans-serif';
    ctx.fillText('五隻星塵貓圍坐在一起，為你泡了暖呼呼的星光茶', w * 0.5, h * 0.148);

    const hintPulse = 0.65 + 0.35 * Math.sin(time * 3.2);
    ctx.globalAlpha = fadeIn * hintPulse;
    ctx.fillStyle = '#9bf6ff';
    ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "PingFang TC", sans-serif';
    const remain = Math.max(0, Math.ceil(this.duration - this.elapsed));
    const hintText = this.completed
      ? `點擊夜空繼續綻放煙火 ✨（已放 ${this.tapCount} 朵）`
      : `點擊夜空綻放療癒像素煙火 ✨（茶會紀念 ${remain}s）`;
    ctx.fillText(hintText, w * 0.5, h * 0.91);
    ctx.restore();
  }

  _drawTeaSet(ctx, time) {
    // 暖茶壺熱氣
    for (let i = 0; i < 3; i++) {
      const sy = -((time * 14 + i * 8) % 22);
      const sa = Math.max(0, 1 - Math.abs(sy) / 22) * 0.7;
      ctx.fillStyle = `rgba(255, 255, 255, ${sa})`;
      ctx.fillRect(-10 + Math.sin(time * 3 + i) * 3, -18 + sy, 3, 4);
    }

    // 點心托盤
    ctx.fillStyle = '#d4a373';
    ctx.strokeStyle = '#6f4e37';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 2, 34, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 星空小茶壺
    ctx.fillStyle = '#9bf6ff';
    ctx.strokeStyle = '#2b4c7e';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(-11, -3, 10, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(-13, -13, 4, 3);

    // 三色糰子盤
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(13, 1, 11, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff9ebb';
    ctx.beginPath();
    ctx.arc(8, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fffdf7';
    ctx.beginPath();
    ctx.arc(13, -1, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#95d57b';
    ctx.beginPath();
    ctx.arc(18, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // 小茶杯
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(-3, 5, 7, 5);
    ctx.fillStyle = '#ff9ebb';
    ctx.fillRect(6, 7, 7, 5);
  }

  _drawFireworks(ctx) {
    const rockets = this.rockets.items;
    for (let i = 0; i < rockets.length; i++) {
      const r = rockets[i];
      if (!r.active) {
        continue;
      }
      ctx.fillStyle = '#fff3b0';
      ctx.fillRect(Math.round(r.x - 2), Math.round(r.y - 4), 4, 8);
    }

    const sparks = this.sparks.items;
    ctx.save();
    for (let i = 0; i < sparks.length; i++) {
      const p = sparks[i];
      if (!p.active) {
        continue;
      }
      const t = p.age / p.life;
      const alpha = Math.max(0, 1 - t * t);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;

      if (p.kind === 'star') {
        const s = Math.max(2, p.size * (1 - t * 0.35));
        const half = Math.max(1, s * 0.36);
        ctx.fillRect(Math.round(p.x - half), Math.round(p.y - s), Math.round(half * 2), Math.round(s * 2));
        ctx.fillRect(Math.round(p.x - s), Math.round(p.y - half), Math.round(s * 2), Math.round(half * 2));
      } else if (p.kind === 'heart') {
        const s = p.size;
        ctx.beginPath();
        ctx.arc(p.x - s * 0.38, p.y - s * 0.1, s * 0.42, 0, Math.PI * 2);
        ctx.arc(p.x + s * 0.38, p.y - s * 0.1, s * 0.42, 0, Math.PI * 2);
        ctx.moveTo(p.x - s * 0.78, p.y + s * 0.05);
        ctx.lineTo(p.x, p.y + s * 0.85);
        ctx.lineTo(p.x + s * 0.78, p.y + s * 0.05);
        ctx.closePath();
        ctx.fill();
      } else if (p.kind === 'note') {
        ctx.fillRect(Math.round(p.x), Math.round(p.y - 7), 2, 8);
        ctx.fillRect(Math.round(p.x), Math.round(p.y - 7), 5, 2);
        ctx.beginPath();
        ctx.arc(p.x - 1, p.y + 1, 2.8, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const s = Math.max(2, Math.round(p.size * (1 - t * 0.4)));
        ctx.fillRect(Math.round(p.x - s * 0.5), Math.round(p.y - s * 0.5), s, s);
      }
    }
    ctx.restore();
  }
}
