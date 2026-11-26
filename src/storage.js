// src/storage.js — 《星塵貓大作戰》本機存檔與解鎖判定模組

import { CATS, ACHIEVEMENTS } from './config.js';

const STORAGE_KEY = 'stardust_cat_save_v1';
const SAVE_VERSION = 1;

const VALID_CAT_IDS = new Set(CATS.map((cat) => cat.id));
const VALID_ACH_IDS = new Set(ACHIEVEMENTS.map((ach) => ach.id));
const DEFAULT_CAT_IDS = CATS
  .filter((cat) => cat.unlock && cat.unlock.type === 'default')
  .map((cat) => cat.id);
const FALLBACK_CAT_ID = DEFAULT_CAT_IDS[0] || CATS[0].id;

function createDefaultSave() {
  return {
    version: SAVE_VERSION,
    totalStars: 0,
    totalKills: 0,
    bestNoHitSec: 0,
    clearedStages: [],
    selectedCat: FALLBACK_CAT_ID,
    unlockedCats: [...DEFAULT_CAT_IDS],
    unlockedAchievements: [],
    muted: false,
  };
}

function toNonNegativeNumber(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    return fallback;
  }
  return num;
}

function toNonNegativeInt(value, fallback = 0) {
  return Math.floor(toNonNegativeNumber(value, fallback));
}

function isCatConditionMet(cat, data) {
  if (!cat || !cat.unlock) {
    return false;
  }

  const { type, target } = cat.unlock;
  switch (type) {
    case 'default':
      return true;
    case 'totalStars':
      return data.totalStars >= target;
    case 'noHitSec':
      return data.bestNoHitSec >= target;
    case 'clearStage':
      return data.clearedStages.includes(target);
    case 'totalKills':
      return data.totalKills >= target;
    default:
      return false;
  }
}

function sanitizeSave(raw) {
  const base = createDefaultSave();
  if (!raw || typeof raw !== 'object') {
    return base;
  }

  const totalStars = toNonNegativeInt(raw.totalStars, 0);
  const totalKills = toNonNegativeInt(raw.totalKills, 0);
  const bestNoHitSec = Math.floor(toNonNegativeNumber(raw.bestNoHitSec, 0) * 10) / 10;

  const clearedStages = Array.isArray(raw.clearedStages)
    ? Array.from(
        new Set(
          raw.clearedStages
            .map((id) => Number(id))
            .filter((id) => Number.isInteger(id) && id > 0)
        )
      ).sort((a, b) => a - b)
    : [];

  const unlockedAchievements = Array.isArray(raw.unlockedAchievements)
    ? Array.from(
        new Set(
          raw.unlockedAchievements.filter(
            (id) => typeof id === 'string' && VALID_ACH_IDS.has(id)
          )
        )
      )
    : [];

  const unlockedCatSet = new Set(DEFAULT_CAT_IDS);
  if (Array.isArray(raw.unlockedCats)) {
    for (const id of raw.unlockedCats) {
      if (typeof id === 'string' && VALID_CAT_IDS.has(id)) {
        unlockedCatSet.add(id);
      }
    }
  }

  const provisional = {
    version: SAVE_VERSION,
    totalStars,
    totalKills,
    bestNoHitSec,
    clearedStages,
    selectedCat: FALLBACK_CAT_ID,
    unlockedCats: Array.from(unlockedCatSet),
    unlockedAchievements,
    muted: Boolean(raw.muted),
  };

  // 若舊版存檔尚未紀錄 unlockedCats，依現有累計進度同步補齊避免資料不一致
  for (const cat of CATS) {
    if (!unlockedCatSet.has(cat.id) && isCatConditionMet(cat, provisional)) {
      unlockedCatSet.add(cat.id);
    }
  }
  provisional.unlockedCats = Array.from(unlockedCatSet);

  if (
    typeof raw.selectedCat === 'string' &&
    unlockedCatSet.has(raw.selectedCat)
  ) {
    provisional.selectedCat = raw.selectedCat;
  }

  return provisional;
}

function cloneSave(data) {
  return {
    version: data.version,
    totalStars: data.totalStars,
    totalKills: data.totalKills,
    bestNoHitSec: data.bestNoHitSec,
    clearedStages: [...data.clearedStages],
    selectedCat: data.selectedCat,
    unlockedCats: [...data.unlockedCats],
    unlockedAchievements: [...data.unlockedAchievements],
    muted: data.muted,
  };
}

export class GameStorage {
  constructor(storageKey = STORAGE_KEY) {
    this.storageKey = storageKey;
    this.available = this._detectAvailability();
    this.data = this.load();
  }

  _detectAvailability() {
    try {
      const testKey = `${this.storageKey}__probe`;
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      return true;
    } catch (_err) {
      return false;
    }
  }

  load() {
    if (!this.available) {
      this.data = createDefaultSave();
      return cloneSave(this.data);
    }

    try {
      const rawText = window.localStorage.getItem(this.storageKey);
      if (!rawText) {
        this.data = createDefaultSave();
        this.save();
        return cloneSave(this.data);
      }

      const parsed = JSON.parse(rawText);
      this.data = sanitizeSave(parsed);
      return cloneSave(this.data);
    } catch (_err) {
      this.data = createDefaultSave();
      this.save();
      return cloneSave(this.data);
    }
  }

  save() {
    if (!this.available) {
      return false;
    }

    try {
      window.localStorage.setItem(this.storageKey, JSON.stringify(this.data));
      return true;
    } catch (_err) {
      return false;
    }
  }

  getData() {
    return cloneSave(this.data);
  }

  reset() {
    this.data = createDefaultSave();
    this.save();
    return cloneSave(this.data);
  }

  isCatUnlocked(catId) {
    return this.data.unlockedCats.includes(catId);
  }

  isAchievementUnlocked(achId) {
    return this.data.unlockedAchievements.includes(achId);
  }

  getCatUnlockProgress(catId) {
    const cat = CATS.find((item) => item.id === catId);
    if (!cat) {
      return { unlocked: false, current: 0, target: 1, ratio: 0, text: '' };
    }

    const unlocked = this.isCatUnlocked(cat.id);
    const { type, target, text } = cat.unlock;

    if (unlocked || type === 'default') {
      return { unlocked: true, current: target, target, ratio: 1, text };
    }

    let current = 0;
    let effectiveTarget = Math.max(1, target);

    switch (type) {
      case 'totalStars':
        current = Math.min(this.data.totalStars, target);
        break;
      case 'noHitSec':
        current = Math.min(Math.floor(this.data.bestNoHitSec), target);
        break;
      case 'clearStage':
        current = this.data.clearedStages.includes(target) ? 1 : 0;
        effectiveTarget = 1;
        break;
      case 'totalKills':
        current = Math.min(this.data.totalKills, target);
        break;
      default:
        current = 0;
    }

    return {
      unlocked: false,
      current,
      target: effectiveTarget,
      ratio: Math.max(0, Math.min(1, current / effectiveTarget)),
      text,
    };
  }

  setSelectedCat(catId) {
    if (!this.isCatUnlocked(catId)) {
      return false;
    }
    if (this.data.selectedCat !== catId) {
      this.data.selectedCat = catId;
      this.save();
    }
    return true;
  }

  setMuted(muted) {
    const next = Boolean(muted);
    if (this.data.muted !== next) {
      this.data.muted = next;
      this.save();
    }
    return this.data.muted;
  }

  toggleMuted() {
    return this.setMuted(!this.data.muted);
  }

  /**
   * 檢查所有尚未解鎖的角色與成就，寫入存檔並回傳剛解鎖項目陣列供 UI 彈窗顯示。
   * 回傳格式：
   * Array<{
   *   type: 'cat' | 'achievement',
   *   id: string,
   *   name: string,
   *   subtitle: string,
   *   desc: string
   * }>
   */
  checkUnlocks() {
    const newlyUnlocked = [];

    for (const cat of CATS) {
      if (this.data.unlockedCats.includes(cat.id)) {
        continue;
      }
      if (isCatConditionMet(cat, this.data)) {
        this.data.unlockedCats.push(cat.id);
        newlyUnlocked.push({
          type: 'cat',
          id: cat.id,
          name: cat.name,
          subtitle: `新貓咪解鎖・${cat.title}`,
          desc: cat.desc,
        });
      }
    }

    for (const ach of ACHIEVEMENTS) {
      if (this.data.unlockedAchievements.includes(ach.id)) {
        continue;
      }
      if (typeof ach.check === 'function' && ach.check(this.data)) {
        this.data.unlockedAchievements.push(ach.id);
        newlyUnlocked.push({
          type: 'achievement',
          id: ach.id,
          name: ach.name,
          subtitle: '達成新成就',
          desc: ach.desc,
        });
      }
    }

    if (newlyUnlocked.length > 0) {
      this.save();
    }

    return newlyUnlocked;
  }

  /**
   * 寫入單局結算或即時進度，並自動觸發解鎖檢查。
   * 回傳本次新解鎖的角色與成就陣列。
   */
  recordProgress({ stars = 0, kills = 0, noHitSec = 0, clearedStageId = null } = {}) {
    const addStars = toNonNegativeInt(stars, 0);
    const addKills = toNonNegativeInt(kills, 0);
    const runNoHitSec = Math.floor(toNonNegativeNumber(noHitSec, 0) * 10) / 10;

    let changed = false;

    if (addStars > 0) {
      this.data.totalStars += addStars;
      changed = true;
    }

    if (addKills > 0) {
      this.data.totalKills += addKills;
      changed = true;
    }

    if (runNoHitSec > this.data.bestNoHitSec) {
      this.data.bestNoHitSec = runNoHitSec;
      changed = true;
    }

    if (
      Number.isInteger(clearedStageId) &&
      clearedStageId > 0 &&
      !this.data.clearedStages.includes(clearedStageId)
    ) {
      this.data.clearedStages.push(clearedStageId);
      this.data.clearedStages.sort((a, b) => a - b);
      changed = true;
    }

    const newlyUnlocked = this.checkUnlocks();

    if (changed && newlyUnlocked.length === 0) {
      this.save();
    }

    return newlyUnlocked;
  }
}

export const storage = new GameStorage();
