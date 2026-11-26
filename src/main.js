// src/main.js — 《星塵貓大作戰》主迴圈、畫布適配、生命週期防掉血保護與全模組整合

import { GAME_CONFIG, STAGES } from './config.js';
import { storage } from './storage.js';
import {
  drawBackground,
  drawCat,
  drawEnemy,
  drawGem,
  drawPickup,
} from './sprites.js';
import {
  FloatingJoystick,
  ScreenShake,
  Player,
  EnemyPool,
  GemPool,
  ParticlePool,
  PickupPool,
} from './entities.js';
import {
  WeaponSystem,
  generateUpgradeChoices,
  applyUpgradeChoice,
} from './weapons.js';
import { LevelDirector, StarryTeaPartyEnding } from './levels.js';
import { audio } from './audio.js';
import { GameUI } from './ui.js';

const STATE = {
  MENU: 'MENU',
  PLAYING: 'PLAYING',
  LEVEL_UP: 'LEVEL_UP',
  PAUSED: 'PAUSED',
  RESULT: 'RESULT',
  ENDING: 'ENDING',
};

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

class StardustCatApp {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d', { alpha: false });

    this.dpr = 1;
    this.viewW = GAME_CONFIG.DESIGN_WIDTH;
    this.viewH = GAME_CONFIG.DESIGN_HEIGHT;
    this.worldScale = 1;
    this.worldViewW = GAME_CONFIG.DESIGN_WIDTH;
    this.worldViewH = GAME_CONFIG.DESIGN_HEIGHT;

    this.state = STATE.MENU;
    this.selectedStageId = STAGES[0].id;
    this.time = 0;
    this.lastTimestamp = 0;

    // 核心子系統實例
    this.ui = new GameUI();
    this.joystick = new FloatingJoystick(GAME_CONFIG.JOYSTICK_MAX_R);
    this.shake = new ScreenShake();
    this.player = new Player(storage.getData().selectedCat);
    this.enemyPool = new EnemyPool(GAME_CONFIG.POOLS.ENEMIES);
    this.gemPool = new GemPool(GAME_CONFIG.POOLS.GEMS);
    this.particlePool = new ParticlePool(GAME_CONFIG.POOLS.PARTICLES);
    this.pickupPool = new PickupPool(12);
    this.weaponSystem = new WeaponSystem();
    this.levelDirector = new LevelDirector();
    this.ending = new StarryTeaPartyEnding();

    // 相機位置（世界邏輯座標）
    this.cameraX = GAME_CONFIG.WORLD_SIZE * 0.5;
    this.cameraY = GAME_CONFIG.WORLD_SIZE * 0.5;

    // 單局即時進度同步（確保局內達成成就即時跳溫馨橫幅，且不重複累計）
    this.syncedStars = 0;
    this.syncedKills = 0;
    this.progressSyncTimer = 0;

    // 預建立固定回調物件，避免每幀重新配置閉包
    this.combatCallbacks = {
      particles: this.particlePool,
      gems: this.gemPool,
      shake: this.shake,
      onKill: (_enemy, _x, _y, wasBoss) => {
        this.player.kills += 1;
        if (wasBoss) {
          audio.playBossDefeat();
          this.shake.add(7.5, 9);
        }
      },
      onWeaponFire: (weaponId) => {
        audio.playWeapon(weaponId);
      },
      onWeaponImpact: (weaponId) => {
        audio.playWeapon(weaponId);
      },
    };

    this.directorCallbacks = {
      onBossIncoming: () => {
        audio.playBossWarning();
      },
      onBossSpawn: () => {
        audio.playBossWarning();
        this.shake.add(5.0, 10);
      },
      onBossWarning: () => {
        audio.playBossWarning();
      },
      onBossAttack: () => {},
      onPlayerHurt: () => {
        audio.playHurt();
      },
      onPickupSpawn: () => {
        audio.playPickup('wish_bell');
      },
      onStageClear: (stage) => {
        this._handleStageClear(stage);
      },
    };

    // 同步本機靜音設定
    audio.setMuted(storage.getData().muted);

    this._bindGlobalEvents();
    this._resize();
    this.joystick.attach(this.canvas);
    this.openStartMenu();

    this._loop = this._loop.bind(this);
    window.requestAnimationFrame(this._loop);
  }

  // -------------------------------------------------------------------------
  // 全域事件：音訊解鎖、視窗縮放、切換 App／來電自動暫停防掉血、Ending 煙火點擊
  // -------------------------------------------------------------------------

  _bindGlobalEvents() {
    const unlockOnce = () => {
      audio.unlockAudio();
      if (this.state === STATE.MENU && !audio.isPlayingBgm) {
        audio.startStageBgm(this.selectedStageId);
      }
    };

    window.addEventListener('pointerdown', unlockOnce, { passive: true });
    window.addEventListener('touchstart', unlockOnce, { passive: true });

    window.addEventListener('resize', () => this._resize());
    window.addEventListener('orientationchange', () => {
      window.setTimeout(() => this._resize(), 80);
    });

    // 監聽 visibilitychange 與 blur：切換 App 或接電話自動暫停，回來不掉血
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this._handleAppBackgrounded();
      } else {
        this.lastTimestamp = 0;
      }
    });

    window.addEventListener('blur', () => {
      this._handleAppBackgrounded();
    });

    window.addEventListener('pagehide', () => {
      this._handleAppBackgrounded();
    });

    // 星空茶會互動 Ending 點擊夜空綻放像素煙火
    this.canvas.addEventListener('pointerdown', (event) => {
      if (this.state !== STATE.ENDING) {
        return;
      }
      audio.unlockAudio();
      const rect = this.canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      this.ending.triggerFirework(x, y, audio);
    });
  }

  _handleAppBackgrounded() {
    this.joystick.reset();
    this.lastTimestamp = 0;

    if (this.state === STATE.PLAYING) {
      this.pauseGame(true);
    }

    if (audio.ctx && audio.ctx.state === 'running') {
      audio.ctx.suspend().catch(() => {});
    }
  }

  _resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.viewW = Math.max(320, window.innerWidth || GAME_CONFIG.DESIGN_WIDTH);
    this.viewH = Math.max(480, window.innerHeight || GAME_CONFIG.DESIGN_HEIGHT);

    // 依基準寬度 390px 縮放世界視野，讓不同尺寸 iPhone 視野一致，桌面不過度放大
    const widthScale = this.viewW / GAME_CONFIG.DESIGN_WIDTH;
    this.worldScale = this.viewW <= 520 ? clamp(widthScale, 0.85, 1.25) : clamp(widthScale, 1.0, 1.18);
    this.worldViewW = this.viewW / this.worldScale;
    this.worldViewH = this.viewH / this.worldScale;

    this.canvas.width = Math.round(this.viewW * this.dpr);
    this.canvas.height = Math.round(this.viewH * this.dpr);
    this.canvas.style.width = `${this.viewW}px`;
    this.canvas.style.height = `${this.viewH}px`;

    this.ending.resize(this.viewW, this.viewH);
  }

  _toggleMute() {
    audio.unlockAudio();
    const nextMuted = storage.toggleMuted();
    audio.setMuted(nextMuted);
    if (!nextMuted) {
      audio.playButton();
    }
    return nextMuted;
  }

  // -------------------------------------------------------------------------
  // 狀態切換：主選單、成就、開始遊玩、升級暫停、暫停、結算、星空茶會 Ending
  // -------------------------------------------------------------------------

  openStartMenu() {
    this.state = STATE.MENU;
    this.joystick.reset();
    this.ending.stop();
    this.levelDirector.clear();

    if (audio.unlocked) {
      audio.startStageBgm(this.selectedStageId);
    }

    this.ui.showStartMenu({
      storage,
      selectedStageId: this.selectedStageId,
      handlers: {
        onSelectStage: (stageId) => {
          audio.unlockAudio();
          audio.playButton();
          this.selectedStageId = stageId;
          audio.startStageBgm(stageId);
        },
        onUiClick: () => {
          audio.unlockAudio();
          audio.playButton();
        },
        onToggleMute: () => this._toggleMute(),
        onOpenAchievements: () => {
          audio.unlockAudio();
          audio.playButton();
          this.ui.showAchievementsModal({
            storage,
            onClose: () => {
              audio.playButton();
              this.openStartMenu();
            },
          });
        },
        onStartGame: (stageId, catId) => {
          audio.unlockAudio();
          audio.playButton();
          this.startRun(stageId, catId);
        },
        onOpenEnding: () => {
          audio.unlockAudio();
          audio.playButton();
          this.startEnding();
        },
      },
    });
  }

  startRun(stageId = this.selectedStageId, catId = storage.getData().selectedCat) {
    this.selectedStageId = stageId;
    storage.setSelectedCat(catId);

    this.ending.stop();
    this.joystick.reset();
    this.shake.reset();
    this.enemyPool.clear();
    this.gemPool.clear();
    this.particlePool.clear();
    this.pickupPool.clear();

    this.player.init(catId);
    this.weaponSystem.reset(this.player.cat.startWeapon);
    this.levelDirector.startStage(stageId);

    this.syncedStars = 0;
    this.syncedKills = 0;
    this.progressSyncTimer = 0;

    this.cameraX = this.player.x - this.worldViewW * 0.5;
    this.cameraY = this.player.y - this.worldViewH * 0.5;

    this.state = STATE.PLAYING;
    this.lastTimestamp = 0;

    this.ui.clearOverlay();
    this.ui.showHud({
      onToggleMute: () => this._toggleMute(),
      onPause: () => {
        audio.unlockAudio();
        audio.playButton();
        this.pauseGame(false);
      },
    });

    this.ui.updateHud({
      player: this.player,
      levelDirector: this.levelDirector,
      enemyPool: this.enemyPool,
      weaponSystem: this.weaponSystem,
      muted: storage.getData().muted,
    });

    audio.startStageBgm(this.levelDirector.stage);
  }

  pauseGame(autoPaused = false) {
    if (this.state !== STATE.PLAYING) {
      return;
    }

    this.state = STATE.PAUSED;
    this.joystick.reset();

    this.ui.showPauseMenu({
      stage: this.levelDirector.stage,
      weaponSystem: this.weaponSystem,
      muted: storage.getData().muted,
      autoPaused,
      handlers: {
        onResume: () => {
          audio.unlockAudio();
          audio.playButton();
          this.ui.clearOverlay();
          this.state = STATE.PLAYING;
          this.lastTimestamp = 0;
        },
        onToggleMute: () => this._toggleMute(),
        onRestart: () => {
          audio.unlockAudio();
          audio.playButton();
          this.startRun(this.selectedStageId, this.player.catId);
        },
        onBackToMenu: () => {
          audio.unlockAudio();
          audio.playButton();
          this._syncRunProgress(null);
          this.openStartMenu();
        },
      },
    });
  }

  _openLevelUpIfPending() {
    if (this.state !== STATE.PLAYING || this.player.dead || this.levelDirector.stageCleared) {
      return;
    }
    if (this.player.pendingLevelUps <= 0) {
      return;
    }

    this.state = STATE.LEVEL_UP;
    this.joystick.reset();
    audio.playLevelUp();

    const choices = generateUpgradeChoices(this.player, this.weaponSystem, 3);
    this.ui.showLevelUpChoices({
      level: this.player.level,
      choices,
      onSelect: (chosen) => {
        audio.playButton();
        applyUpgradeChoice(chosen, this.player, this.weaponSystem, this.particlePool);

        // 溫泉白貓專屬特性：每次升級釋放全屏擊退星波
        if (this.player.hasLevelNova) {
          this.enemyPool.knockbackAll(
            this.player.x,
            this.player.y,
            340,
            260,
            18 * this.player.dmgMult,
            this.combatCallbacks
          );
          this.particlePool.spawnRing(this.player.x, this.player.y, 18, 220, '#9bf6ff', 0.48);
          this.particlePool.spawnBurst(this.player.x, this.player.y, 18, '#ffd166', 180, 0.5);
          this.shake.add(4.0, 11);
        }

        this.player.pendingLevelUps = Math.max(0, this.player.pendingLevelUps - 1);
        if (this.player.pendingLevelUps > 0) {
          this.state = STATE.PLAYING;
          this._openLevelUpIfPending();
        } else {
          this.ui.clearOverlay();
          this.state = STATE.PLAYING;
          this.lastTimestamp = 0;
        }
      },
    });
  }

  _handlePickup(type, px, py) {
    audio.playPickup(type);

    if (type === 'magnet') {
      this.gemPool.triggerGlobalMagnet(this.player);
      this.particlePool.spawnRing(px, py, 14, 150, '#9bf6ff', 0.45);
      this.levelDirector.showBanner('星塵大磁鐵啟動！', '全場星塵飛奔而來', 1.8);
      return;
    }

    if (type === 'fish_soup') {
      const healed = this.player.heal(1.0);
      this.particlePool.spawnHealHearts(this.player.x, this.player.y, 6);
      if (healed > 0) {
        this.levelDirector.showBanner('暖呼呼魚湯 💛', `回復了 ${healed} 顆愛心`, 1.8);
      } else {
        const res = this.player.addXp(6, 5);
        this.levelDirector.showBanner('滿血魚湯好滋味！', '額外獲得星塵經驗值', 1.8);
        if (res.leveledUp) {
          this._openLevelUpIfPending();
        }
      }
      return;
    }

    // 祈願鈴鐺：釋放溫柔全屏星波安撫小怪並清空場上 Boss 彈幕
    this.enemyPool.knockbackAll(
      this.player.x,
      this.player.y,
      380,
      280,
      44 * this.player.dmgMult,
      this.combatCallbacks
    );
    this.levelDirector.bossBullets.clear();
    this.particlePool.spawnRing(this.player.x, this.player.y, 16, 260, '#ffd166', 0.52);
    this.particlePool.spawnBurst(this.player.x, this.player.y, 20, '#ff9ebb', 190, 0.55);
    this.shake.add(5.0, 10);
    this.levelDirector.showBanner('祈願鈴鐺響起 🔔', '星光清場波安撫周圍小怪！', 1.9);
  }

  _syncRunProgress(clearedStageId = null) {
    const deltaStars = Math.max(0, this.player.starsCollected - this.syncedStars);
    const deltaKills = Math.max(0, this.player.kills - this.syncedKills);

    const newlyUnlocked = storage.recordProgress({
      stars: deltaStars,
      kills: deltaKills,
      noHitSec: this.player.bestNoHitSec,
      clearedStageId,
    });

    this.syncedStars += deltaStars;
    this.syncedKills += deltaKills;

    if (newlyUnlocked.length > 0) {
      this.ui.showUnlockToasts(newlyUnlocked);
      audio.playLevelUp();
    }

    return newlyUnlocked;
  }

  _handleStageClear(stage) {
    if (this.state === STATE.RESULT || this.state === STATE.ENDING) {
      return;
    }

    const newlyUnlocked = this._syncRunProgress(stage.id);
    const allClearedNow = storage.getData().clearedStages.length >= STAGES.length;
    const justCompletedAll = newlyUnlocked.some((item) => item.id === 'ach_all_clear');

    // 首次通關全部 3 個關卡時，直接獻上 15 秒星空茶會互動 Ending
    if (justCompletedAll) {
      this.startEnding();
      return;
    }

    this._openResultScreen(true, allClearedNow);
  }

  _handlePlayerDefeat() {
    if (this.state === STATE.RESULT) {
      return;
    }
    this._syncRunProgress(null);
    this._openResultScreen(false, storage.getData().clearedStages.length >= STAGES.length);
  }

  _openResultScreen(victory, allCleared) {
    this.state = STATE.RESULT;
    this.joystick.reset();

    this.ui.showResultScreen({
      victory,
      stage: this.levelDirector.stage,
      player: this.player,
      allCleared,
      handlers: {
        onOpenEnding: () => {
          audio.unlockAudio();
          audio.playButton();
          this.startEnding();
        },
        onNextStage: (nextStageId) => {
          audio.unlockAudio();
          audio.playButton();
          this.startRun(nextStageId, this.player.catId);
        },
        onRetry: () => {
          audio.unlockAudio();
          audio.playButton();
          this.startRun(this.selectedStageId, this.player.catId);
        },
        onBackToMenu: () => {
          audio.unlockAudio();
          audio.playButton();
          this.openStartMenu();
        },
      },
    });
  }

  startEnding() {
    this.state = STATE.ENDING;
    this.joystick.reset();
    this.ending.start(this.viewW, this.viewH);
    this.lastTimestamp = 0;

    // 星空茶會搭配溫柔八音盒搖籃曲
    audio.startBgm('musicbox', 78);

    this.ui.showEndingControls({
      muted: storage.getData().muted,
      handlers: {
        onToggleMute: () => this._toggleMute(),
        onBackToMenu: () => {
          audio.unlockAudio();
          audio.playButton();
          this.ending.stop();
          this.openStartMenu();
        },
      },
    });
  }

  // -------------------------------------------------------------------------
  // requestAnimationFrame 主迴圈（嚴格限制 dt <= GAME_CONFIG.MAX_DT）
  // -------------------------------------------------------------------------

  _loop(timestamp) {
    if (this.lastTimestamp === 0) {
      this.lastTimestamp = timestamp;
    }

    const rawDt = Math.max(0, (timestamp - this.lastTimestamp) / 1000);
    this.lastTimestamp = timestamp;
    const dt = Math.min(rawDt, GAME_CONFIG.MAX_DT);

    this.time += dt;

    this._update(dt);
    this._render();

    window.requestAnimationFrame(this._loop);
  }

  _update(dt) {
    if (this.state === STATE.MENU) {
      // 標題背景緩慢星光漫遊 + 貓咪預覽呼吸動畫
      const halfWorld = GAME_CONFIG.WORLD_SIZE * 0.5;
      this.cameraX = halfWorld - this.worldViewW * 0.5 + Math.cos(this.time * 0.14) * 140;
      this.cameraY = halfWorld - this.worldViewH * 0.5 + Math.sin(this.time * 0.11) * 110;
      this.ui.updateMenuPreviews(this.time);
      return;
    }

    if (this.state === STATE.ENDING) {
      this.ending.update(dt, audio);
      return;
    }

    if (this.state !== STATE.PLAYING) {
      return;
    }

    // 1. 浮動搖桿與玩家移動
    this.joystick.update(dt);
    this.player.update(dt, this.joystick, (p) => {
      this.particlePool.spawnHealHearts(p.x, p.y, 4);
      audio.playPickup('fish_soup');
    });

    // 2. 關卡波次導演與 Boss 0.8 秒預警技能
    this.levelDirector.update(dt, this.time, {
      player: this.player,
      enemyPool: this.enemyPool,
      pickupPool: this.pickupPool,
      particlePool: this.particlePool,
      shake: this.shake,
      callbacks: this.directorCallbacks,
    });

    if (this.state !== STATE.PLAYING) {
      return;
    }

    // 3. 6 種自動武器更新與命中結算
    this.weaponSystem.update(dt, this.time, this.player, this.enemyPool, this.combatCallbacks);

    // 4. 敵人與 Boss 更新（前後比對血量以觸發接觸受傷柔音）
    const hpBefore = this.player.hp;
    this.enemyPool.update(dt, this.time, this.player, this.shake, this.particlePool);
    if (this.player.hp < hpBefore) {
      audio.playHurt();
    }

    // 5. 星塵磁鐵平滑吸附與升級檢查
    this.gemPool.update(dt, this.player, (_xp, _stars, res) => {
      audio.playGemCollect();
      if (res && res.leveledUp) {
        this._openLevelUpIfPending();
      }
    });

    // 6. 場地驚喜道具拾取
    this.pickupPool.update(dt, this.player, (type, px, py) => {
      this._handlePickup(type, px, py);
    });

    // 7. 粒子與阻尼畫面震動
    this.particlePool.update(dt);
    this.shake.update(dt);

    // 8. 平滑跟隨相機（邊界留白保護，不超過 WORLD_SIZE）
    const targetCamX = clamp(
      this.player.x - this.worldViewW * 0.5,
      0,
      Math.max(0, GAME_CONFIG.WORLD_SIZE - this.worldViewW)
    );
    const targetCamY = clamp(
      this.player.y - this.worldViewH * 0.5,
      0,
      Math.max(0, GAME_CONFIG.WORLD_SIZE - this.worldViewH)
    );
    const camLerp = Math.min(1, dt * 8.5);
    this.cameraX += (targetCamX - this.cameraX) * camLerp;
    this.cameraY += (targetCamY - this.cameraY) * camLerp;

    // 9. 每 0.5 秒同步即時成就進度（例如單局 60 秒無傷或累計 500 星塵）
    this.progressSyncTimer += dt;
    if (this.progressSyncTimer >= 0.5) {
      this.progressSyncTimer = 0;
      this._syncRunProgress(null);
    }

    // 10. 更新極簡頂部 HUD
    this.ui.updateHud({
      player: this.player,
      levelDirector: this.levelDirector,
      enemyPool: this.enemyPool,
      weaponSystem: this.weaponSystem,
      muted: storage.getData().muted,
    });

    // 11. 確認玩家是否耗盡生命
    if (this.player.dead) {
      this._handlePlayerDefeat();
    }
  }

  _render() {
    const ctx = this.ctx;

    if (this.state === STATE.ENDING) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.ending.draw(ctx);
      return;
    }

    const stage =
      this.state === STATE.MENU
        ? STAGES.find((s) => s.id === this.selectedStageId) || STAGES[0]
        : this.levelDirector.stage;

    const shakeX = this.state === STATE.PLAYING ? this.shake.offsetX : 0;
    const shakeY = this.state === STATE.PLAYING ? this.shake.offsetY : 0;
    const camX = this.cameraX + shakeX;
    const camY = this.cameraY + shakeY;

    // 世界座標繪製層（依 worldScale * dpr 清晰呈現）
    ctx.setTransform(this.dpr * this.worldScale, 0, 0, this.dpr * this.worldScale, 0, 0);

    drawBackground(ctx, camX, camY, this.worldViewW, this.worldViewH, stage, this.time);

    if (this.state === STATE.MENU) {
      return;
    }

    ctx.save();
    ctx.translate(-camX, -camY);

    // 1. 地面特效層（貓草治癒圈、空投落點圈、Boss 0.8s 發光預警圈）
    this.weaponSystem.drawGroundEffects(ctx, this.player, this.time);
    this.levelDirector.drawGroundWarnings(ctx, this.time);

    // 2. 掉落物層（星塵寶石與 3 種場地驚喜道具）
    const gems = this.gemPool.pool.items;
    for (let i = 0; i < gems.length; i++) {
      const g = gems[i];
      if (!g.active) {
        continue;
      }
      if (
        g.x >= camX - 24 &&
        g.x <= camX + this.worldViewW + 24 &&
        g.y >= camY - 24 &&
        g.y <= camY + this.worldViewH + 24
      ) {
        drawGem(ctx, g, this.time);
      }
    }

    const pickups = this.pickupPool.pool.items;
    for (let i = 0; i < pickups.length; i++) {
      const item = pickups[i];
      if (item.active) {
        drawPickup(ctx, item, this.time);
      }
    }

    // 3. 角色與小怪／Boss 層
    const enemies = this.enemyPool.pool.items;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.active) {
        continue;
      }
      if (
        e.x >= camX - 70 &&
        e.x <= camX + this.worldViewW + 70 &&
        e.y >= camY - 70 &&
        e.y <= camY + this.worldViewH + 70
      ) {
        drawEnemy(ctx, e, this.time);
      }
    }

    if (!this.player.dead) {
      drawCat(ctx, this.player.cat, this.player.x, this.player.y, {
        time: this.time,
        moving: this.player.moving,
        facing: this.player.facing,
        scale: 1,
        invincible: this.player.invincibleTimer > 0,
        hurtFlash: this.player.hurtFlash,
        showShadow: true,
      });
    }

    // 4. 武器投射物、毛線電弧、Boss 慢速可愛彈幕與星塵粒子
    this.weaponSystem.drawProjectiles(ctx, this.player, this.time);
    this.levelDirector.drawBossBullets(ctx, this.time);
    this.particlePool.draw(ctx);

    ctx.restore();

    // 5. 螢幕空間繪製全畫面浮動隱形搖桿（1:1 精準對齊手指位置）
    if (this.state === STATE.PLAYING) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.joystick.draw(ctx);
    }
  }
}

function startStardustApp() {
  try {
    new StardustCatApp();
  } catch (err) {
    const box = document.createElement('pre');
    box.style.cssText = 'position:fixed;inset:60px 12px auto;z-index:999;background:#2b1122;color:#ff9ebb;padding:12px;border-radius:12px;font-size:12px;white-space:pre-wrap;word-break:break-all;';
    box.textContent = '啟動錯誤：' + (err && err.stack ? err.stack : String(err));
    document.body.appendChild(box);
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', startStardustApp, { once: true });
} else {
  startStardustApp();
}
