// src/config.js — 《星塵貓大作戰》全局共用設定與平衡常數

export const GAME_CONFIG = {
  DESIGN_WIDTH: 390,     // 基準邏輯寬度（對應 iPhone 直向視野）
  DESIGN_HEIGHT: 844,    // 基準邏輯高度
  WORLD_SIZE: 1800,      // 無縫可走動星光場地大小（正方形）
  MAX_DT: 0.05,          // 防止切換 App 回來時間爆衝（秒）
  STAGE_DURATION: 120,   // 每關 Boss 登場前生存秒數（約 2 分鐘）
  JOYSTICK_MAX_R: 52,    // 浮動搖桿最大推桿半徑
  BASE_MAGNET_R: 72,     // 預設星塵吸附半徑
  PLAYER_HITBOX_R: 13,   // 偏寬容的玩家受擊半徑（略小於視覺體型）
  INVINCIBLE_SEC: 1.15,  // 受傷後無敵閃爍時間
  POOLS: {
    ENEMIES: 140,
    BULLETS: 180,
    GEMS: 220,
    PARTICLES: 260,
  },
};

export const CATS = [
  {
    id: 'box_tabby',
    name: '舉手紙箱貓',
    title: '元氣新手',
    desc: '開局自帶星塵魔彈，升級所需星塵 -10%',
    colors: { main: '#9aa0a6', belly: '#f7f8fa', accent: '#c9935b', eye: '#1e1e2e' },
    hat: 'cardboard',
    stats: { maxHp: 3, speed: 175, magnetBonus: 1.0, cdMult: 1.0, xpMult: 0.9 },
    startWeapon: 'stardust_bolt',
    unlock: { type: 'default', target: 0, text: '初始角色' },
  },
  {
    id: 'calico_dango',
    name: '三花糰子貓',
    title: '吸星達人',
    desc: '開局自帶迴旋小魚乾，吸星範圍 +45%',
    colors: { main: '#fff7eb', belly: '#ffffff', accent: '#e88d55', patch: '#3d3535', eye: '#2b2424' },
    hat: 'dango',
    stats: { maxHp: 3, speed: 180, magnetBonus: 1.45, cdMult: 1.0, xpMult: 1.0 },
    startWeapon: 'fish_boomerang',
    unlock: { type: 'totalStars', target: 500, text: '累計收集 500 顆星塵' },
  },
  {
    id: 'matcha_orange',
    name: '抹茶胖橘貓',
    title: '安心肉盾',
    desc: '最大生命 5 顆心，每 25 秒自動回復半顆心',
    colors: { main: '#f2a65a', belly: '#fff5e4', accent: '#7fb069', eye: '#2d231a' },
    hat: 'scarf',
    stats: { maxHp: 5, speed: 165, magnetBonus: 1.05, cdMult: 1.0, xpMult: 1.0, regenSec: 25 },
    startWeapon: 'catnip_aura',
    unlock: { type: 'noHitSec', target: 60, text: '單局連續 60 秒無傷' },
  },
  {
    id: 'starry_black',
    name: '星空黑貓',
    title: '疾風法師',
    desc: '移速 +18%、武器冷卻 -12%，開局自帶毛線雷電',
    colors: { main: '#2b2d42', belly: '#3f4261', accent: '#ffd166', eye: '#ffe66d' },
    hat: 'halo',
    stats: { maxHp: 3, speed: 206, magnetBonus: 1.1, cdMult: 0.88, xpMult: 1.0 },
    startWeapon: 'yarn_lightning',
    unlock: { type: 'clearStage', target: 2, text: '通關第 2 關「晚霞燈籠夜市」' },
  },
  {
    id: 'onsen_white',
    name: '溫泉白貓',
    title: '治癒大師',
    desc: '開局自帶泡泡護盾，每次升級釋放全屏擊退星波',
    colors: { main: '#ffffff', belly: '#f0f4f8', accent: '#ff9f1c', eye: '#3a2e39' },
    hat: 'towel_orange',
    stats: { maxHp: 4, speed: 178, magnetBonus: 1.15, cdMult: 0.95, xpMult: 1.0, levelNova: true },
    startWeapon: 'bubble_shield',
    unlock: { type: 'totalKills', target: 300, text: '累計安撫 300 隻小怪' },
  },
];

export const WEAPONS = {
  stardust_bolt: {
    id: 'stardust_bolt',
    name: '星塵魔彈',
    icon: '✦',
    desc: '自動鎖定最近小怪發射柔和星光彈',
    maxLv: 5,
    baseCd: 0.72,
    baseDmg: 14,
    evolution: {
      name: '銀河流星雨',
      icon: '🌠',
      desc: '連發穿透星塵流星，命中綻放柔和星花',
      color: '#ffe680',
    },
  },
  fish_boomerang: {
    id: 'fish_boomerang',
    name: '迴旋小魚乾',
    icon: '🐟',
    desc: '拋出穿透並飛回的發光小魚乾',
    maxLv: 5,
    baseCd: 1.45,
    baseDmg: 18,
    evolution: {
      name: '雙星金魚舞',
      icon: '🐠',
      desc: '成對旋飛的黃金小魚乾，軌跡擴大並灑落星塵',
      color: '#ffb86c',
    },
  },
  bubble_shield: {
    id: 'bubble_shield',
    name: '泡泡護盾環',
    icon: '🫧',
    desc: '環繞身體的守護泡泡，撞飛近身小怪',
    maxLv: 5,
    baseCd: 0.1,
    baseDmg: 12,
    evolution: {
      name: '星環極光泡',
      icon: '🪐',
      desc: '高速旋轉的極光星環，強力震退周圍小怪',
      color: '#8be9fd',
    },
  },
  yarn_lightning: {
    id: 'yarn_lightning',
    name: '毛線雷電鏈',
    icon: '⚡',
    desc: '隨機召喚在敵群間跳躍的星光閃電',
    maxLv: 5,
    baseCd: 1.9,
    baseDmg: 24,
    evolution: {
      name: '彩虹織星雷',
      icon: '🌈',
      desc: '柔光彩虹電鏈超遠連鎖，每次跳躍皆落星芒',
      color: '#d6a2ff',
    },
  },
  catnip_aura: {
    id: 'catnip_aura',
    name: '貓草治癒圈',
    icon: '🌿',
    desc: '腳下擴散的星光領域，減速並持續安撫周圍小怪',
    maxLv: 5,
    baseCd: 0.45,
    baseDmg: 8,
    evolution: {
      name: '夢境花田域',
      icon: '🌸',
      desc: '大幅擴展的櫻粉星花領域，強力緩速並定時綻放星波',
      color: '#ff9ec6',
    },
  },
  box_airdrop: {
    id: 'box_airdrop',
    name: '紙箱空投炮',
    icon: '📦',
    desc: '朝怪堆空降彈力紙箱，造成範圍震退',
    maxLv: 5,
    baseCd: 2.3,
    baseDmg: 32,
    evolution: {
      name: '星願禮物雨',
      icon: '🎁',
      desc: '連環空降星願禮盒，擴大範圍震退並爆出星塵',
      color: '#ffd166',
    },
  },
};


export const STAGES = [
  {
    id: 1,
    difficulty: 'EASY',
    name: '星夜野餐草地',
    bgmTheme: 'musicbox',
    bpm: 80,
    palette: { bg: '#1e2749', grid: '#273469', glow: '#ffd166', grass: '#3a5a68' },
    spawnRateBase: 1.25,
    hpScale: 1.0,
    speedScale: 1.0,
    enemies: ['dandelion', 'box_slime'],
    boss: { id: 'boss_box_king', name: '巨型紙箱貓王', hp: 7000, speed: 98 },
  },
  {
    id: 2,
    difficulty: 'NORMAL',
    name: '晚霞燈籠夜市',
    bgmTheme: 'lofi_epiano',
    bpm: 86,
    palette: { bg: '#352245', grid: '#4a2e5c', glow: '#ff9ebb', grass: '#6b3e5e' },
    spawnRateBase: 1.0,
    hpScale: 1.35,
    speedScale: 1.12,
    enemies: ['box_slime', 'lantern_jelly', 'dango_hopper'],
    boss: { id: 'boss_takoyaki', name: '章魚燒飛行船', hp: 8200, speed: 108 },
  },
  {
    id: 3,
    difficulty: 'HARD',
    name: '月華竹林溫泉',
    bgmTheme: 'koto_pentatonic',
    bpm: 92,
    palette: { bg: '#162b2c', grid: '#203f40', glow: '#9bf6ff', grass: '#2d5753' },
    spawnRateBase: 0.82,
    hpScale: 1.7,
    speedScale: 1.22,
    enemies: ['lantern_jelly', 'yarn_roller', 'firefly_wisp'],
    boss: { id: 'boss_daruma', name: '巨型招財達摩', hp: 9600, speed: 113 },
  },
];

export const ACHIEVEMENTS = [
  { id: 'ach_first_win', name: '初次星夜漫步', desc: '通關任意 1 個關卡', check: (s) => s.clearedStages.length >= 1 },
  { id: 'ach_stars_500', name: '星塵收藏家', desc: '累計收集 500 顆星塵（解鎖三花糰子貓）', check: (s) => s.totalStars >= 500 },
  { id: 'ach_nohit_60', name: '優雅散步者', desc: '單局連續 60 秒無傷（解鎖抹茶胖橘貓）', check: (s) => s.bestNoHitSec >= 60 },
  { id: 'ach_stage2', name: '夜市探險貓', desc: '通關第 2 關（解鎖星空黑貓）', check: (s) => s.clearedStages.includes(2) },
  { id: 'ach_kills_300', name: '溫柔安撫師', desc: '累計安撫 300 隻小怪（解鎖溫泉白貓）', check: (s) => s.totalKills >= 300 },
  { id: 'ach_all_clear', name: '星空茶會主角', desc: '通關全部 3 個關卡並解鎖 Ending', check: (s) => s.clearedStages.length >= 3 },
];
