// src/ui.js — 《星塵貓大作戰》單手直向 UI、極簡避動態島 HUD、選單、升級卡片與解鎖橫幅

import { CATS, STAGES, WEAPONS, ACHIEVEMENTS } from './config.js';
import { drawCat } from './sprites.js';

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCountdown(seconds) {
  const safe = Math.max(0, Math.ceil(seconds));
  const min = Math.floor(safe / 60);
  const sec = safe % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function renderHeartSvg(state) {
  // state: 'full' | 'half' | 'empty'
  if (state === 'full') {
    return `<svg class="hud-heart" viewBox="0 0 20 18" aria-hidden="true"><path d="M10 16.5C9.5 16.1 1.8 10.9 1.8 5.8C1.8 3.1 3.9 1.2 6.3 1.2C7.9 1.2 9.2 2.0 10 3.3C10.8 2.0 12.1 1.2 13.7 1.2C16.1 1.2 18.2 3.1 18.2 5.8C18.2 10.9 10.5 16.1 10 16.5Z" fill="#ff7aa2" stroke="#ffd6e5" stroke-width="1.2"/></svg>`;
  }
  if (state === 'half') {
    return `<svg class="hud-heart" viewBox="0 0 20 18" aria-hidden="true"><path d="M10 16.5C9.5 16.1 1.8 10.9 1.8 5.8C1.8 3.1 3.9 1.2 6.3 1.2C7.9 1.2 9.2 2.0 10 3.3C10.8 2.0 12.1 1.2 13.7 1.2C16.1 1.2 18.2 3.1 18.2 5.8C18.2 10.9 10.5 16.1 10 16.5Z" fill="rgba(255,255,255,0.14)" stroke="rgba(255,214,229,0.55)" stroke-width="1.2"/><path d="M10 16.5C9.5 16.1 1.8 10.9 1.8 5.8C1.8 3.1 3.9 1.2 6.3 1.2C7.9 1.2 9.2 2.0 10 3.3V16.5Z" fill="#ff7aa2"/></svg>`;
  }
  return `<svg class="hud-heart" viewBox="0 0 20 18" aria-hidden="true"><path d="M10 16.5C9.5 16.1 1.8 10.9 1.8 5.8C1.8 3.1 3.9 1.2 6.3 1.2C7.9 1.2 9.2 2.0 10 3.3C10.8 2.0 12.1 1.2 13.7 1.2C16.1 1.2 18.2 3.1 18.2 5.8C18.2 10.9 10.5 16.1 10 16.5Z" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.28)" stroke-width="1.2"/></svg>`;
}

function injectStyles() {
  if (document.getElementById('stardust-ui-styles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'stardust-ui-styles';
  style.textContent = `
    /* ---------------- 極簡頂部 HUD ---------------- */
    .hud-wrap {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 6px;
      pointer-events: none;
    }

    .hud-row {
      width: 100%;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: start;
      gap: 8px;
      pointer-events: none;
    }

    .hud-left {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 78px;
    }

    .hud-hearts {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 3px;
      max-width: 106px;
      padding: 4px 7px;
      border-radius: 12px;
      background: rgba(15, 20, 44, 0.56);
      border: 1px solid rgba(255, 255, 255, 0.12);
    }

    .hud-heart {
      width: 15px;
      height: 14px;
      display: block;
      filter: drop-shadow(0 0 4px rgba(255, 122, 162, 0.35));
    }

    .hud-mini-stats {
      display: flex;
      align-items: center;
      gap: 6px;
      padding-left: 3px;
      font-size: 11px;
      font-weight: 700;
      color: #ffd166;
      text-shadow: 0 1px 4px rgba(0, 0, 0, 0.65);
    }

    .hud-center {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      min-width: 0;
      padding-top: 2px;
    }

    .hud-xp-shell {
      width: 100%;
      max-width: 176px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .hud-xp-track {
      width: 100%;
      height: 7px;
      border-radius: 999px;
      background: rgba(12, 16, 36, 0.72);
      border: 1px solid rgba(255, 255, 255, 0.16);
      overflow: hidden;
    }

    .hud-xp-fill {
      height: 100%;
      width: 0%;
      border-radius: 999px;
      background: linear-gradient(90deg, #9bf6ff 0%, #ffd166 100%);
      box-shadow: 0 0 8px rgba(255, 209, 102, 0.55);
      transition: width 120ms ease-out;
    }

    .hud-timer-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font-variant-numeric: tabular-nums;
      text-shadow: 0 1px 5px rgba(0, 0, 0, 0.7);
    }

    .hud-lv-pill {
      font-size: 11px;
      font-weight: 800;
      color: #151b38;
      background: #ffd166;
      padding: 1px 6px;
      border-radius: 999px;
      line-height: 1.3;
    }

    .hud-time-text {
      font-size: 16px;
      font-weight: 800;
      letter-spacing: 0.5px;
      color: #f8f9fc;
    }

    .hud-boss-box {
      width: 100%;
      max-width: 186px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
      padding: 4px 8px 5px;
      border-radius: 12px;
      background: rgba(34, 14, 34, 0.76);
      border: 1px solid rgba(255, 158, 187, 0.52);
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
    }

    .hud-boss-label {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      font-weight: 800;
      color: #ffd166;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .hud-boss-track {
      width: 100%;
      height: 8px;
      border-radius: 999px;
      background: rgba(12, 10, 24, 0.8);
      overflow: hidden;
    }

    .hud-boss-fill {
      height: 100%;
      width: 100%;
      border-radius: 999px;
      background: linear-gradient(90deg, #ff5c8a 0%, #ffd166 100%);
      transition: width 90ms linear;
    }

    .hud-right {
      display: flex;
      align-items: center;
      gap: 6px;
      pointer-events: auto;
    }

    .hud-icon-btn {
      width: 36px;
      height: 36px;
      border-radius: 12px;
      background: rgba(18, 25, 54, 0.72);
      border: 1px solid rgba(255, 255, 255, 0.18);
      color: #f8f9fc;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(8, 12, 30, 0.34);
      transition: transform 120ms ease, background 120ms ease;
    }

    .hud-icon-btn:active {
      transform: scale(0.92);
      background: rgba(39, 52, 105, 0.9);
    }

    .hud-stage-banner {
      align-self: center;
      margin-top: 4px;
      padding: 7px 14px;
      border-radius: 14px;
      background: rgba(17, 24, 52, 0.78);
      border: 1px solid rgba(255, 209, 102, 0.44);
      text-align: center;
      box-shadow: 0 6px 18px rgba(6, 10, 26, 0.4);
      transition: opacity 220ms ease, transform 220ms ease;
    }

    .hud-stage-banner.hidden {
      opacity: 0;
      transform: translateY(-6px);
      pointer-events: none;
    }

    .hud-stage-banner-title {
      font-size: 13px;
      font-weight: 800;
      color: #ffd166;
    }

    .hud-stage-banner-sub {
      font-size: 11px;
      color: #dbe4ff;
      margin-top: 1px;
    }

    .hud-weapons-strip {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 5px;
      pointer-events: none;
    }

    .hud-weapon-chip {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 3px 7px;
      border-radius: 10px;
      background: rgba(16, 22, 48, 0.62);
      border: 1px solid rgba(255, 255, 255, 0.14);
      font-size: 11px;
      font-weight: 700;
      color: #f8f9fc;
    }

    .hud-weapon-lv {
      color: #ffd166;
      font-size: 10px;
    }

    /* ---------------- 通用彈窗面板 ---------------- */
    .panel-card {
      width: 100%;
      max-width: 370px;
      max-height: 100%;
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px;
      border-radius: 24px;
      background: linear-gradient(180deg, rgba(28, 38, 78, 0.94) 0%, rgba(18, 24, 52, 0.96) 100%);
      border: 1px solid rgba(255, 255, 255, 0.16);
      box-shadow: 0 18px 46px rgba(6, 9, 24, 0.6);
      color: #f8f9fc;
      overflow-y: auto;
      overscroll-behavior: contain;
      touch-action: pan-y;
    }

    .menu-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
    }

    .menu-title {
      margin: 0;
      font-size: 24px;
      font-weight: 900;
      letter-spacing: 0.8px;
      color: #ffd166;
      text-shadow: 0 2px 12px rgba(255, 209, 102, 0.35);
    }

    .menu-subtitle {
      margin: 2px 0 0;
      font-size: 12px;
      color: #c5d1ef;
    }

    .menu-top-actions {
      display: flex;
      gap: 6px;
      flex-shrink: 0;
    }

    .menu-pill-btn {
      height: 36px;
      padding: 0 11px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.18);
      color: #f8f9fc;
      font-size: 13px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
    }

    .menu-pill-btn:active {
      transform: scale(0.95);
    }

    .section-label {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
      font-weight: 800;
      color: #9bf6ff;
      letter-spacing: 0.5px;
    }

    /* ---------------- 3 關卡切換列 ---------------- */
    .stage-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 7px;
    }

    .stage-btn {
      padding: 9px 6px;
      border-radius: 14px;
      background: rgba(14, 19, 42, 0.72);
      border: 1.5px solid rgba(255, 255, 255, 0.13);
      color: #dce4fb;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
      text-align: center;
      transition: transform 120ms ease, border-color 140ms ease, background 140ms ease;
    }

    .stage-btn.selected {
      background: rgba(49, 64, 126, 0.75);
      border-color: #ffd166;
      box-shadow: 0 0 14px rgba(255, 209, 102, 0.25);
      color: #ffffff;
    }

    .stage-btn:active {
      transform: scale(0.96);
    }

    .stage-diff {
      font-size: 10px;
      font-weight: 800;
      padding: 1px 6px;
      border-radius: 999px;
      letter-spacing: 0.5px;
    }

    .stage-diff.EASY { background: rgba(128, 237, 153, 0.22); color: #80ed99; }
    .stage-diff.NORMAL { background: rgba(255, 158, 187, 0.24); color: #ff9ebb; }
    .stage-diff.HARD { background: rgba(155, 246, 255, 0.22); color: #9bf6ff; }

    .stage-name {
      font-size: 12px;
      font-weight: 800;
      line-height: 1.25;
    }

    .stage-clear-mark {
      font-size: 10px;
      color: #ffd166;
      min-height: 13px;
    }

    /* ---------------- 5 隻小貓橫向滑動選擇器 ---------------- */
    .cat-carousel-wrap {
      position: relative;
    }

    .cat-scroller {
      display: flex;
      gap: 10px;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
      padding: 2px 24px 6px;
      touch-action: pan-x;
      overscroll-behavior-x: contain;
    }

    .cat-scroller::-webkit-scrollbar {
      display: none;
    }

    .cat-card {
      flex: 0 0 100%;
      scroll-snap-align: center;
      padding: 12px 13px;
      border-radius: 18px;
      background: rgba(14, 19, 42, 0.76);
      border: 1.5px solid rgba(255, 255, 255, 0.14);
      display: flex;
      flex-direction: column;
      gap: 8px;
      transition: border-color 150ms ease, box-shadow 150ms ease;
    }

    .cat-card.selected {
      border-color: #ffd166;
      box-shadow: 0 0 18px rgba(255, 209, 102, 0.24);
    }

    .cat-card.locked {
      border-color: rgba(255, 255, 255, 0.1);
      background: rgba(12, 16, 35, 0.82);
    }

    .cat-card-top {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .cat-avatar-box {
      width: 74px;
      height: 74px;
      border-radius: 16px;
      background: radial-gradient(circle at 50% 55%, rgba(255, 209, 102, 0.18) 0%, rgba(19, 25, 50, 0.9) 75%);
      border: 1px solid rgba(255, 255, 255, 0.12);
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      flex-shrink: 0;
    }

    .cat-avatar-canvas {
      width: 72px;
      height: 72px;
      display: block;
    }

    .cat-card.locked .cat-avatar-canvas {
      filter: brightness(0.42) saturate(0.45);
    }

    .cat-lock-badge {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      text-shadow: 0 2px 8px rgba(0, 0, 0, 0.8);
    }

    .cat-meta {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .cat-name-row {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }

    .cat-name {
      font-size: 16px;
      font-weight: 800;
      color: #ffffff;
    }

    .cat-title-tag {
      font-size: 10px;
      font-weight: 800;
      padding: 2px 6px;
      border-radius: 999px;
      background: rgba(255, 209, 102, 0.2);
      color: #ffd166;
    }

    .cat-weapon-tag {
      font-size: 11px;
      color: #9bf6ff;
      font-weight: 700;
    }

    .cat-desc {
      font-size: 12px;
      line-height: 1.4;
      color: #d6dff7;
    }

    .cat-unlock-box {
      padding: 7px 9px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.06);
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .cat-unlock-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 11px;
      color: #ffd166;
      font-weight: 700;
    }

    .cat-progress-track {
      width: 100%;
      height: 6px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.12);
      overflow: hidden;
    }

    .cat-progress-fill {
      height: 100%;
      border-radius: 999px;
      background: linear-gradient(90deg, #ff9ebb 0%, #ffd166 100%);
    }

    .cat-nav-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      margin-top: 2px;
    }

    .cat-arrow-btn {
      width: 30px;
      height: 30px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.1);
      color: #f8f9fc;
      font-size: 14px;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .cat-dots {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .cat-dot {
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.25);
      transition: width 160ms ease, background 160ms ease;
    }

    .cat-dot.active {
      width: 18px;
      background: #ffd166;
    }

    /* ---------------- 大拇指友善主操作按鈕 ---------------- */
    .primary-btn {
      width: 100%;
      min-height: 50px;
      padding: 12px 16px;
      border-radius: 16px;
      background: linear-gradient(135deg, #ffd166 0%, #ffad66 100%);
      color: #1c1a2e;
      font-size: 16px;
      font-weight: 900;
      letter-spacing: 0.6px;
      box-shadow: 0 8px 22px rgba(255, 195, 92, 0.35);
      transition: transform 120ms ease, opacity 120ms ease;
    }

    .primary-btn:active {
      transform: scale(0.97);
    }

    .primary-btn:disabled {
      opacity: 0.48;
      background: rgba(170, 178, 206, 0.35);
      color: #dce4fb;
      box-shadow: none;
    }

    .secondary-btn {
      width: 100%;
      min-height: 44px;
      padding: 10px 14px;
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.18);
      color: #f8f9fc;
      font-size: 14px;
      font-weight: 800;
      transition: transform 120ms ease;
    }

    .secondary-btn:active {
      transform: scale(0.97);
    }

    /* ---------------- 升級三選一大按鈕卡片 ---------------- */
    .levelup-header {
      text-align: center;
    }

    .levelup-title {
      margin: 0;
      font-size: 21px;
      font-weight: 900;
      color: #ffd166;
    }

    .levelup-sub {
      margin: 4px 0 0;
      font-size: 12px;
      color: #c9d5f4;
    }

    .upgrade-list {
      display: flex;
      flex-direction: column;
      gap: 11px;
    }

    .upgrade-card-btn {
      width: 100%;
      min-height: 86px;
      padding: 12px 14px;
      border-radius: 18px;
      background: linear-gradient(135deg, rgba(38, 51, 102, 0.92) 0%, rgba(23, 31, 66, 0.95) 100%);
      border: 1.5px solid rgba(255, 209, 102, 0.36);
      color: #f8f9fc;
      display: flex;
      align-items: center;
      gap: 12px;
      text-align: left;
      box-shadow: 0 8px 20px rgba(8, 12, 30, 0.38);
      transition: transform 120ms ease, border-color 120ms ease;
    }

    .upgrade-card-btn:active {
      transform: scale(0.97);
      border-color: #ffd166;
    }

    .upgrade-icon {
      width: 52px;
      height: 52px;
      border-radius: 14px;
      background: rgba(255, 209, 102, 0.14);
      border: 1px solid rgba(255, 209, 102, 0.34);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 26px;
      flex-shrink: 0;
    }

    .upgrade-body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .upgrade-top-line {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .upgrade-name {
      font-size: 16px;
      font-weight: 800;
      color: #ffffff;
    }

    .upgrade-badge {
      font-size: 11px;
      font-weight: 800;
      padding: 2px 8px;
      border-radius: 999px;
      background: rgba(155, 246, 255, 0.18);
      color: #9bf6ff;
      white-space: nowrap;
    }

    .upgrade-badge.is-new {
      background: rgba(255, 209, 102, 0.24);
      color: #ffd166;
    }

    .upgrade-badge.is-passive {
      background: rgba(255, 158, 187, 0.24);
      color: #ff9ebb;
    }

    .upgrade-desc {
      font-size: 12px;
      line-height: 1.4;
      color: #d7e0f7;
    }

    /* ---------------- 成就與結算清單 ---------------- */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .stat-tile {
      padding: 9px 10px;
      border-radius: 14px;
      background: rgba(14, 19, 42, 0.72);
      border: 1px solid rgba(255, 255, 255, 0.12);
      text-align: center;
    }

    .stat-val {
      font-size: 18px;
      font-weight: 900;
      color: #ffd166;
    }

    .stat-label {
      font-size: 11px;
      color: #c2ceec;
      margin-top: 2px;
    }

    .ach-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .ach-row {
      padding: 10px 12px;
      border-radius: 14px;
      background: rgba(14, 19, 42, 0.72);
      border: 1px solid rgba(255, 255, 255, 0.12);
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .ach-row.unlocked {
      border-color: rgba(255, 209, 102, 0.48);
      background: rgba(45, 55, 104, 0.55);
    }

    .ach-icon {
      font-size: 20px;
      width: 30px;
      text-align: center;
      flex-shrink: 0;
    }

    .ach-title {
      font-size: 13px;
      font-weight: 800;
      color: #ffffff;
    }

    .ach-desc {
      font-size: 11px;
      color: #c4d0ee;
      margin-top: 2px;
    }

    /* ---------------- 成就／角色解鎖溫馨吐司 ---------------- */
    .toast-icon {
      width: 34px;
      height: 34px;
      border-radius: 12px;
      background: rgba(255, 209, 102, 0.18);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      flex-shrink: 0;
    }

    .toast-text {
      flex: 1;
      min-width: 0;
    }

    .toast-sub {
      font-size: 11px;
      font-weight: 800;
      color: #ffd166;
    }

    .toast-name {
      font-size: 14px;
      font-weight: 900;
      color: #ffffff;
      margin-top: 1px;
    }

    /* ---------------- 星空茶會 Ending 浮動返回列 ---------------- */
    .ending-hud-bar {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      pointer-events: auto;
    }
  `;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// 主 UI 控制器
// ---------------------------------------------------------------------------

export class GameUI {
  constructor() {
    injectStyles();

    this.hudTopEl = document.getElementById('hud-top');
    this.hudBottomEl = document.getElementById('hud-bottom');
    this.overlayRootEl = document.getElementById('overlay-root');
    this.toastContainerEl = document.getElementById('toast-container');

    this.hudMounted = false;
    this.hudRefs = null;
    this._lastHpKey = '';
    this._lastWeaponKey = '';
    this._lastMuted = null;

    // 開始選單貓咪預覽畫布快取（供主迴圈帶入柔和呼吸動畫）
    this.catPreviewCanvases = [];
    this.menuSelectedStageId = STAGES[0].id;
    this.menuFocusedCatIndex = 0;

    // 升級卡片彈出防誤觸時間戳
    this._levelUpUnlockAt = 0;

    // 成就／解鎖橫幅佇列（每次 2.5 秒不擋路滑入滑出）
    this._toastQueue = [];
    this._toastBusy = false;
  }

  // -------------------------------------------------------------------------
  // 頂部極簡 HUD（愛心血條、經驗條、倒數／Boss 血條、暫停與靜音鈕）
  // -------------------------------------------------------------------------

  showHud(handlers) {
    this.hudMounted = true;
    this._lastHpKey = '';
    this._lastWeaponKey = '';
    this._lastMuted = null;

    this.hudTopEl.innerHTML = `
      <div class="hud-wrap">
        <div class="hud-row">
          <div class="hud-left">
            <div class="hud-hearts" data-ref="hearts"></div>
            <div class="hud-mini-stats">
              <span data-ref="stars">✦ 0</span>
              <span data-ref="kills">🫧 0</span>
            </div>
          </div>

          <div class="hud-center">
            <div class="hud-boss-box" data-ref="bossBox" style="display:none;">
              <div class="hud-boss-label">
                <span data-ref="bossName">BOSS</span>
                <span data-ref="bossHpText">100%</span>
              </div>
              <div class="hud-boss-track">
                <div class="hud-boss-fill" data-ref="bossFill"></div>
              </div>
            </div>

            <div class="hud-xp-shell">
              <div class="hud-timer-row" data-ref="timerRow">
                <span class="hud-lv-pill" data-ref="lvText">Lv.1</span>
                <span class="hud-time-text" data-ref="timeText">02:00</span>
              </div>
              <div class="hud-xp-track">
                <div class="hud-xp-fill" data-ref="xpFill"></div>
              </div>
            </div>
          </div>

          <div class="hud-right">
            <button type="button" class="hud-icon-btn ui-interactive" data-ref="muteBtn" aria-label="切換靜音">🔊</button>
            <button type="button" class="hud-icon-btn ui-interactive" data-ref="pauseBtn" aria-label="暫停遊戲">⏸</button>
          </div>
        </div>

        <div class="hud-stage-banner hidden" data-ref="banner">
          <div class="hud-stage-banner-title" data-ref="bannerTitle"></div>
          <div class="hud-stage-banner-sub" data-ref="bannerSub"></div>
        </div>
      </div>
    `;

    this.hudBottomEl.innerHTML = `<div class="hud-weapons-strip" data-ref="weaponsStrip"></div>`;

    this.hudRefs = {
      hearts: this.hudTopEl.querySelector('[data-ref="hearts"]'),
      stars: this.hudTopEl.querySelector('[data-ref="stars"]'),
      kills: this.hudTopEl.querySelector('[data-ref="kills"]'),
      bossBox: this.hudTopEl.querySelector('[data-ref="bossBox"]'),
      bossName: this.hudTopEl.querySelector('[data-ref="bossName"]'),
      bossHpText: this.hudTopEl.querySelector('[data-ref="bossHpText"]'),
      bossFill: this.hudTopEl.querySelector('[data-ref="bossFill"]'),
      timerRow: this.hudTopEl.querySelector('[data-ref="timerRow"]'),
      lvText: this.hudTopEl.querySelector('[data-ref="lvText"]'),
      timeText: this.hudTopEl.querySelector('[data-ref="timeText"]'),
      xpFill: this.hudTopEl.querySelector('[data-ref="xpFill"]'),
      muteBtn: this.hudTopEl.querySelector('[data-ref="muteBtn"]'),
      pauseBtn: this.hudTopEl.querySelector('[data-ref="pauseBtn"]'),
      banner: this.hudTopEl.querySelector('[data-ref="banner"]'),
      bannerTitle: this.hudTopEl.querySelector('[data-ref="bannerTitle"]'),
      bannerSub: this.hudTopEl.querySelector('[data-ref="bannerSub"]'),
      weaponsStrip: this.hudBottomEl.querySelector('[data-ref="weaponsStrip"]'),
    };

    this.hudRefs.muteBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      if (handlers && typeof handlers.onToggleMute === 'function') {
        handlers.onToggleMute();
      }
    });

    this.hudRefs.pauseBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      if (handlers && typeof handlers.onPause === 'function') {
        handlers.onPause();
      }
    });
  }

  hideHud() {
    this.hudMounted = false;
    this.hudRefs = null;
    this.hudTopEl.innerHTML = '';
    this.hudBottomEl.innerHTML = '';
  }

  updateHud({ player, levelDirector, enemyPool, weaponSystem, muted }) {
    if (!this.hudMounted || !this.hudRefs || !player) {
      return;
    }

    const r = this.hudRefs;

    // 1. 左上愛心血條（支援半顆心精準渲染，僅於數值變更時更新 DOM）
    const hpKey = `${player.hp}/${player.maxHp}`;
    if (hpKey !== this._lastHpKey) {
      this._lastHpKey = hpKey;
      const totalSlots = Math.ceil(player.maxHp);
      let html = '';
      for (let i = 0; i < totalSlots; i++) {
        const diff = player.hp - i;
        if (diff >= 1) {
          html += renderHeartSvg('full');
        } else if (diff >= 0.5) {
          html += renderHeartSvg('half');
        } else {
          html += renderHeartSvg('empty');
        }
      }
      r.hearts.innerHTML = html;
    }

    r.stars.textContent = `✦ ${player.starsCollected}`;
    r.kills.textContent = `🫧 ${player.kills}`;
    r.lvText.textContent = `Lv.${player.level}`;
    r.xpFill.style.width = `${Math.round(player.getXpRatio() * 100)}%`;

    // 2. 正上方倒數時間 <-> Boss 血條無縫切換
    const boss = enemyPool && enemyPool.activeBoss;
    if (boss && boss.active) {
      r.bossBox.style.display = 'flex';
      r.timerRow.style.display = 'none';
      const pct = Math.max(0, Math.min(100, (boss.hp / boss.maxHp) * 100));
      r.bossName.textContent = `👑 ${boss.name}`;
      r.bossHpText.textContent = `${Math.ceil(pct)}%`;
      r.bossFill.style.width = `${pct.toFixed(1)}%`;
    } else {
      r.bossBox.style.display = 'none';
      r.timerRow.style.display = 'flex';
      r.timeText.textContent = formatCountdown(levelDirector ? levelDirector.getTimeRemaining() : 0);
    }

    // 3. 靜音鈕狀態同步
    if (this._lastMuted !== muted) {
      this._lastMuted = muted;
      r.muteBtn.textContent = muted ? '🔇' : '🔊';
    }

    // 4. 關卡溫和階段提示橫幅
    if (levelDirector && levelDirector.bannerTimer > 0 && levelDirector.bannerText) {
      r.banner.classList.remove('hidden');
      r.bannerTitle.textContent = levelDirector.bannerText;
      r.bannerSub.textContent = levelDirector.bannerSub || '';
    } else {
      r.banner.classList.add('hidden');
    }

    // 5. 底部持有武器迷你標示列
    if (weaponSystem) {
      const owned = weaponSystem.getOwnedWeaponIds();
      const weaponKey = owned.map((id) => `${id}:${weaponSystem.getLevel(id)}`).join(',');
      if (weaponKey !== this._lastWeaponKey) {
        this._lastWeaponKey = weaponKey;
        r.weaponsStrip.innerHTML = owned
          .map((id) => {
            const spec = WEAPONS[id];
            const lv = weaponSystem.getLevel(id);
            return `<span class="hud-weapon-chip">${spec.icon} <span class="hud-weapon-lv">Lv.${lv}</span></span>`;
          })
          .join('');
      }
    }
  }

  // -------------------------------------------------------------------------
  // Overlay 開關控制
  // -------------------------------------------------------------------------

  clearOverlay() {
    this.overlayRootEl.classList.remove('active');
    this.overlayRootEl.innerHTML = '';
    this.catPreviewCanvases = [];
  }

  _setOverlayHtml(html) {
    this.overlayRootEl.classList.add('active');
    this.overlayRootEl.innerHTML = html;
  }

  // -------------------------------------------------------------------------
  // 開始選單：3 關卡切換 + 左右滑動選 5 隻小貓 + 成就列表
  // -------------------------------------------------------------------------

  showStartMenu({ storage, selectedStageId, handlers }) {
    this.hideHud();
    const save = storage.getData();
    this.menuSelectedStageId = selectedStageId || STAGES[0].id;

    const currentCatIdx = Math.max(
      0,
      CATS.findIndex((c) => c.id === save.selectedCat)
    );
    this.menuFocusedCatIndex = currentCatIdx;

    const allCleared = save.clearedStages.length >= STAGES.length;

    const stagesHtml = STAGES.map((stage) => {
      const isSelected = stage.id === this.menuSelectedStageId;
      const isCleared = save.clearedStages.includes(stage.id);
      return `
        <button type="button" class="stage-btn ui-interactive ${isSelected ? 'selected' : ''}" data-stage-id="${stage.id}">
          <span class="stage-diff ${stage.difficulty}">${stage.difficulty}</span>
          <span class="stage-name">${escapeHtml(stage.name)}</span>
          <span class="stage-clear-mark">${isCleared ? '✦ 已通關' : `第 ${stage.id} 關`}</span>
        </button>
      `;
    }).join('');

    const catsHtml = CATS.map((cat, index) => {
      const progress = storage.getCatUnlockProgress(cat.id);
      const unlocked = progress.unlocked;
      const startWeapon = WEAPONS[cat.startWeapon];
      const isSelected = cat.id === save.selectedCat;

      const unlockBlock = unlocked
        ? ''
        : `
          <div class="cat-unlock-box">
            <div class="cat-unlock-row">
              <span>🔒 ${escapeHtml(progress.text)}</span>
              <span>${progress.current}/${progress.target}</span>
            </div>
            <div class="cat-progress-track">
              <div class="cat-progress-fill" style="width:${Math.round(progress.ratio * 100)}%"></div>
            </div>
          </div>
        `;

      return `
        <div class="cat-card ${unlocked ? '' : 'locked'} ${isSelected ? 'selected' : ''}" data-cat-index="${index}" data-cat-id="${cat.id}">
          <div class="cat-card-top">
            <div class="cat-avatar-box">
              <canvas class="cat-avatar-canvas" width="144" height="144" data-cat-preview="${cat.id}"></canvas>
              ${unlocked ? '' : '<div class="cat-lock-badge">🔒</div>'}
            </div>
            <div class="cat-meta">
              <div class="cat-name-row">
                <span class="cat-name">${escapeHtml(cat.name)}</span>
                <span class="cat-title-tag">${escapeHtml(cat.title)}</span>
              </div>
              <div class="cat-weapon-tag">初始武器：${startWeapon ? `${startWeapon.icon}${escapeHtml(startWeapon.name)}` : ''}</div>
              <div class="cat-desc">${escapeHtml(cat.desc)}</div>
            </div>
          </div>
          ${unlockBlock}
        </div>
      `;
    }).join('');

    const dotsHtml = CATS.map(
      (_cat, idx) => `<span class="cat-dot ${idx === currentCatIdx ? 'active' : ''}" data-dot-index="${idx}"></span>`
    ).join('');

    this._setOverlayHtml(`
      <div class="panel-card ui-interactive">
        <div class="menu-header">
          <div>
            <h1 class="menu-title">✦ 星塵貓大作戰</h1>
            <p class="menu-subtitle">累計星塵 ${save.totalStars} ・成就 ${save.unlockedAchievements.length}/${ACHIEVEMENTS.length}</p>
          </div>
          <div class="menu-top-actions">
            <button type="button" class="menu-pill-btn" data-action="achievements">🏆 成就</button>
            <button type="button" class="menu-pill-btn" data-action="mute" aria-label="靜音">${save.muted ? '🔇' : '🔊'}</button>
          </div>
        </div>

        <div class="section-label">
          <span>選擇星夜關卡</span>
          <span>每關 2 分鐘＋Boss</span>
        </div>
        <div class="stage-grid">${stagesHtml}</div>

        <div class="section-label">
          <span>左右滑動選擇星塵貓</span>
          <span data-ref="catCounter">${currentCatIdx + 1} / ${CATS.length}</span>
        </div>

        <div class="cat-carousel-wrap">
          <div class="cat-scroller" data-ref="catScroller">${catsHtml}</div>
          <div class="cat-nav-row">
            <button type="button" class="cat-arrow-btn" data-action="prevCat" aria-label="上一隻貓">‹</button>
            <div class="cat-dots">${dotsHtml}</div>
            <button type="button" class="cat-arrow-btn" data-action="nextCat" aria-label="下一隻貓">›</button>
          </div>
        </div>

        <button type="button" class="primary-btn" data-action="start">開始星夜冒險</button>
        ${allCleared ? '<button type="button" class="secondary-btn" data-action="ending">✨ 重溫星空茶會 Ending</button>' : ''}
      </div>
    `);

    const root = this.overlayRootEl;
    const scroller = root.querySelector('[data-ref="catScroller"]');
    const startBtn = root.querySelector('[data-action="start"]');
    const counterEl = root.querySelector('[data-ref="catCounter"]');
    const dots = Array.from(root.querySelectorAll('.cat-dot'));
    const cards = Array.from(root.querySelectorAll('.cat-card'));

    // 註冊 5 隻貓的預覽畫布供動畫繪製
    this.catPreviewCanvases = Array.from(root.querySelectorAll('[data-cat-preview]')).map((canvas) => ({
      catId: canvas.getAttribute('data-cat-preview'),
      canvas,
      ctx: canvas.getContext('2d'),
    }));
    this.updateMenuPreviews(0);

    const syncFocusedCat = (index, scrollIntoView = false) => {
      const clamped = Math.max(0, Math.min(CATS.length - 1, index));
      this.menuFocusedCatIndex = clamped;
      const cat = CATS[clamped];
      const unlocked = storage.isCatUnlocked(cat.id);

      counterEl.textContent = `${clamped + 1} / ${CATS.length}`;
      dots.forEach((d, i) => d.classList.toggle('active', i === clamped));
      cards.forEach((c, i) => c.classList.toggle('selected', i === clamped && unlocked));

      if (unlocked) {
        storage.setSelectedCat(cat.id);
        startBtn.disabled = false;
        startBtn.textContent = `帶著「${cat.name}」出發！`;
      } else {
        startBtn.disabled = true;
        startBtn.textContent = `尚未解鎖：${cat.unlock.text}`;
      }

      if (scrollIntoView && cards[clamped]) {
        cards[clamped].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    };

    // 捲動對齊當前已選貓咪
    requestAnimationFrame(() => {
      if (cards[currentCatIdx]) {
        cards[currentCatIdx].scrollIntoView({ behavior: 'auto', inline: 'center', block: 'nearest' });
      }
      syncFocusedCat(currentCatIdx, false);
    });

    // 偵測手指左右滑動切換貓咪
    let scrollTimer = null;
    scroller.addEventListener(
      'scroll',
      () => {
        if (scrollTimer !== null) {
          window.clearTimeout(scrollTimer);
        }
        scrollTimer = window.setTimeout(() => {
          const cardWidth = cards[0] ? cards[0].offsetWidth + 10 : scroller.clientWidth;
          if (cardWidth > 0) {
            const idx = Math.round(scroller.scrollLeft / cardWidth);
            if (idx !== this.menuFocusedCatIndex) {
              syncFocusedCat(idx, false);
              if (handlers && typeof handlers.onUiClick === 'function') {
                handlers.onUiClick();
              }
            }
          }
        }, 70);
      },
      { passive: true }
    );

    // 關卡按鈕綁定
    root.querySelectorAll('[data-stage-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-stage-id'));
        this.menuSelectedStageId = id;
        root.querySelectorAll('[data-stage-id]').forEach((b) =>
          b.classList.toggle('selected', Number(b.getAttribute('data-stage-id')) === id)
        );
        if (handlers && typeof handlers.onSelectStage === 'function') {
          handlers.onSelectStage(id);
        }
      });
    });

    // 左右箭頭快速切換貓咪
    root.querySelector('[data-action="prevCat"]').addEventListener('click', () => {
      syncFocusedCat(this.menuFocusedCatIndex - 1, true);
      if (handlers && typeof handlers.onUiClick === 'function') {
        handlers.onUiClick();
      }
    });

    root.querySelector('[data-action="nextCat"]').addEventListener('click', () => {
      syncFocusedCat(this.menuFocusedCatIndex + 1, true);
      if (handlers && typeof handlers.onUiClick === 'function') {
        handlers.onUiClick();
      }
    });

    // 靜音與成就清單按鈕
    const muteBtn = root.querySelector('[data-action="mute"]');
    muteBtn.addEventListener('click', () => {
      if (handlers && typeof handlers.onToggleMute === 'function') {
        const nextMuted = handlers.onToggleMute();
        muteBtn.textContent = nextMuted ? '🔇' : '🔊';
      }
    });

    root.querySelector('[data-action="achievements"]').addEventListener('click', () => {
      if (handlers && typeof handlers.onOpenAchievements === 'function') {
        handlers.onOpenAchievements();
      }
    });

    startBtn.addEventListener('click', () => {
      const cat = CATS[this.menuFocusedCatIndex];
      if (!storage.isCatUnlocked(cat.id)) {
        return;
      }
      if (handlers && typeof handlers.onStartGame === 'function') {
        handlers.onStartGame(this.menuSelectedStageId, cat.id);
      }
    });

    const endingBtn = root.querySelector('[data-action="ending"]');
    if (endingBtn) {
      endingBtn.addEventListener('click', () => {
        if (handlers && typeof handlers.onOpenEnding === 'function') {
          handlers.onOpenEnding();
        }
      });
    }
  }

  updateMenuPreviews(time) {
    if (this.catPreviewCanvases.length === 0) {
      return;
    }
    for (let i = 0; i < this.catPreviewCanvases.length; i++) {
      const entry = this.catPreviewCanvases[i];
      const ctx = entry.ctx;
            if (!ctx) {
        continue;
      }
      ctx.clearRect(0, 0, entry.canvas.width, entry.canvas.height);
      drawCat(ctx, entry.catId, 72, 86, {
        time: time + i * 0.6,
        moving: i === this.menuFocusedCatIndex,
        facing: 1,
        scale: 2.15,
        showShadow: true,
      });
    }
  }

  // -------------------------------------------------------------------------
  // 成就列表彈窗
  // -------------------------------------------------------------------------

  showAchievementsModal({ storage, onClose }) {
    const save = storage.getData();
    const rowsHtml = ACHIEVEMENTS.map((ach) => {
      const unlocked = storage.isAchievementUnlocked(ach.id);
      return `
        <div class="ach-row ${unlocked ? 'unlocked' : ''}">
          <div class="ach-icon">${unlocked ? '🌟' : '🔒'}</div>
          <div>
            <div class="ach-title">${escapeHtml(ach.name)}</div>
            <div class="ach-desc">${escapeHtml(ach.desc)}</div>
          </div>
        </div>
      `;
    }).join('');

    this._setOverlayHtml(`
      <div class="panel-card ui-interactive">
        <div class="menu-header">
          <div>
            <h2 class="menu-title" style="font-size:20px;">🏆 星夜成就手冊</h2>
            <p class="menu-subtitle">已達成 ${save.unlockedAchievements.length} / ${ACHIEVEMENTS.length} 項成就</p>
          </div>
        </div>

        <div class="stats-grid">
          <div class="stat-tile">
            <div class="stat-val">✦ ${save.totalStars}</div>
            <div class="stat-label">累計收集星塵</div>
          </div>
          <div class="stat-tile">
            <div class="stat-val">🫧 ${save.totalKills}</div>
            <div class="stat-label">累計安撫小怪</div>
          </div>
          <div class="stat-tile">
            <div class="stat-val">${Math.floor(save.bestNoHitSec)}s</div>
            <div class="stat-label">最長連續無傷</div>
          </div>
          <div class="stat-tile">
            <div class="stat-val">${save.clearedStages.length} / ${STAGES.length}</div>
            <div class="stat-label">通關關卡數</div>
          </div>
        </div>

        <div class="ach-list">${rowsHtml}</div>

        <button type="button" class="primary-btn" data-action="close">返回選單</button>
      </div>
    `);

    this.overlayRootEl.querySelector('[data-action="close"]').addEventListener('click', () => {
      if (typeof onClose === 'function') {
        onClose();
      }
    });
  }

  // -------------------------------------------------------------------------
  // 升級三選一大按鈕卡片（含 260ms 防誤觸保護）
  // -------------------------------------------------------------------------

  showLevelUpChoices({ level, choices, onSelect }) {
    this._levelUpUnlockAt = performance.now() + 260;

    const cardsHtml = choices
      .map((card, index) => {
        const badgeClass =
          card.kind === 'passive'
            ? 'is-passive'
            : card.currentLv === 0
              ? 'is-new'
              : '';
        return `
          <button type="button" class="upgrade-card-btn ui-interactive" data-choice-idx="${index}">
            <div class="upgrade-icon">${card.icon || '✦'}</div>
            <div class="upgrade-body">
              <div class="upgrade-top-line">
                <span class="upgrade-name">${escapeHtml(card.name)}</span>
                <span class="upgrade-badge ${badgeClass}">${escapeHtml(card.badge)}</span>
              </div>
              <div class="upgrade-desc">${escapeHtml(card.desc)}</div>
            </div>
          </button>
        `;
      })
      .join('');

    this._setOverlayHtml(`
      <div class="panel-card ui-interactive">
        <div class="levelup-header">
          <h2 class="levelup-title">✦ 星塵升級・Lv.${level} ✦</h2>
          <p class="levelup-sub">選擇一項祝福強化你的星塵貓</p>
        </div>
        <div class="upgrade-list">${cardsHtml}</div>
      </div>
    `);

    this.overlayRootEl.querySelectorAll('[data-choice-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (performance.now() < this._levelUpUnlockAt) {
          return;
        }
        const idx = Number(btn.getAttribute('data-choice-idx'));
        const chosen = choices[idx];
        if (chosen && typeof onSelect === 'function') {
          onSelect(chosen);
        }
      });
    });
  }

  // -------------------------------------------------------------------------
  // 暫停選單
  // -------------------------------------------------------------------------

  showPauseMenu({ stage, weaponSystem, muted, autoPaused, handlers }) {
    const owned = weaponSystem ? weaponSystem.getOwnedWeaponIds() : [];
    const weaponsHtml = owned
      .map((id) => {
        const spec = WEAPONS[id];
        return `<span class="hud-weapon-chip">${spec.icon} ${escapeHtml(spec.name)} <span class="hud-weapon-lv">Lv.${weaponSystem.getLevel(id)}</span></span>`;
      })
      .join('');

    this._setOverlayHtml(`
      <div class="panel-card ui-interactive">
        <div class="levelup-header">
          <h2 class="levelup-title">🌙 休息一下</h2>
          <p class="levelup-sub">${autoPaused ? '偵測到切換畫面，已為你安全暫停' : `第 ${stage.id} 關・${escapeHtml(stage.name)}`}</p>
        </div>

        <div class="hud-weapons-strip" style="justify-content:center;">${weaponsHtml}</div>

        <button type="button" class="primary-btn" data-action="resume">繼續星夜散步</button>
        <button type="button" class="secondary-btn" data-action="mute">${muted ? '🔇 音樂音效：已靜音（點擊開啟）' : '🔊 音樂音效：開啟中（點擊靜音）'}</button>
        <button type="button" class="secondary-btn" data-action="restart">重新挑戰本關</button>
        <button type="button" class="secondary-btn" data-action="menu">返回主選單</button>
      </div>
    `);

    const root = this.overlayRootEl;
    root.querySelector('[data-action="resume"]').addEventListener('click', () => {
      if (handlers && typeof handlers.onResume === 'function') {
        handlers.onResume();
      }
    });

    const muteBtn = root.querySelector('[data-action="mute"]');
    muteBtn.addEventListener('click', () => {
      if (handlers && typeof handlers.onToggleMute === 'function') {
        const nextMuted = handlers.onToggleMute();
        muteBtn.textContent = nextMuted
          ? '🔇 音樂音效：已靜音（點擊開啟）'
          : '🔊 音樂音效：開啟中（點擊靜音）';
      }
    });

    root.querySelector('[data-action="restart"]').addEventListener('click', () => {
      if (handlers && typeof handlers.onRestart === 'function') {
        handlers.onRestart();
      }
    });

    root.querySelector('[data-action="menu"]').addEventListener('click', () => {
      if (handlers && typeof handlers.onBackToMenu === 'function') {
        handlers.onBackToMenu();
      }
    });
  }

  // -------------------------------------------------------------------------
  // 通關／結束結算面板
  // -------------------------------------------------------------------------

  showResultScreen({ victory, stage, player, allCleared, handlers }) {
    const nextStage = STAGES.find((s) => s.id === stage.id + 1) || null;
    const title = victory ? '✦ 星夜安撫成功！✦' : '🌙 貓咪累了，先打個盹';
    const sub = victory
      ? `成功守護「${stage.name}」，星塵更加閃耀了`
      : `在「${stage.name}」收集了許多星塵，再試一次吧`;

    const primaryActionHtml =
      victory && allCleared
        ? `<button type="button" class="primary-btn" data-action="ending">✨ 進入星空茶會 Ending</button>`
        : victory && nextStage
          ? `<button type="button" class="primary-btn" data-action="nextStage">前往第 ${nextStage.id} 關・${escapeHtml(nextStage.name)}</button>`
          : `<button type="button" class="primary-btn" data-action="retry">再玩一次本關</button>`;

    this._setOverlayHtml(`
      <div class="panel-card ui-interactive">
        <div class="levelup-header">
          <h2 class="levelup-title">${title}</h2>
          <p class="levelup-sub">${escapeHtml(sub)}</p>
        </div>

        <div class="stats-grid">
          <div class="stat-tile">
            <div class="stat-val">✦ ${player.starsCollected}</div>
            <div class="stat-label">本局收集星塵</div>
          </div>
          <div class="stat-tile">
            <div class="stat-val">🫧 ${player.kills}</div>
            <div class="stat-label">本局安撫小怪</div>
          </div>
          <div class="stat-tile">
            <div class="stat-val">${Math.floor(player.bestNoHitSec)}s</div>
            <div class="stat-label">最長連續無傷</div>
          </div>
          <div class="stat-tile">
            <div class="stat-val">Lv.${player.level}</div>
            <div class="stat-label">最終達成等級</div>
          </div>
        </div>

        ${primaryActionHtml}
        ${victory && nextStage && !allCleared ? '<button type="button" class="secondary-btn" data-action="retry">重玩本關</button>' : ''}
        <button type="button" class="secondary-btn" data-action="menu">返回選單換貓咪</button>
      </div>
    `);

    const root = this.overlayRootEl;
    const endingBtn = root.querySelector('[data-action="ending"]');
    if (endingBtn) {
      endingBtn.addEventListener('click', () => {
        if (handlers && typeof handlers.onOpenEnding === 'function') {
          handlers.onOpenEnding();
        }
      });
    }

    const nextBtn = root.querySelector('[data-action="nextStage"]');
    if (nextBtn && nextStage) {
      nextBtn.addEventListener('click', () => {
        if (handlers && typeof handlers.onNextStage === 'function') {
          handlers.onNextStage(nextStage.id);
        }
      });
    }

    const retryBtn = root.querySelector('[data-action="retry"]');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        if (handlers && typeof handlers.onRetry === 'function') {
          handlers.onRetry();
        }
      });
    }

    root.querySelector('[data-action="menu"]').addEventListener('click', () => {
      if (handlers && typeof handlers.onBackToMenu === 'function') {
        handlers.onBackToMenu();
      }
    });
  }

  // -------------------------------------------------------------------------
  // 星空茶會 Ending 輕量操作列（不擋點擊綻放像素煙火）
  // -------------------------------------------------------------------------

  showEndingControls({ muted, handlers }) {
    this.clearOverlay();
    this.hudMounted = false;
    this.hudRefs = null;

    this.hudTopEl.innerHTML = `
      <div class="ending-hud-bar">
        <button type="button" class="hud-icon-btn ui-interactive" data-ref="endingMute" aria-label="切換靜音">${muted ? '🔇' : '🔊'}</button>
        <button type="button" class="menu-pill-btn ui-interactive" data-ref="endingBack">返回選單</button>
      </div>
    `;
    this.hudBottomEl.innerHTML = '';

    const muteBtn = this.hudTopEl.querySelector('[data-ref="endingMute"]');
    muteBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      if (handlers && typeof handlers.onToggleMute === 'function') {
        const nextMuted = handlers.onToggleMute();
        muteBtn.textContent = nextMuted ? '🔇' : '🔊';
      }
    });

    this.hudTopEl.querySelector('[data-ref="endingBack"]').addEventListener('click', (event) => {
      event.stopPropagation();
      if (handlers && typeof handlers.onBackToMenu === 'function') {
        handlers.onBackToMenu();
      }
    });
  }

  // -------------------------------------------------------------------------
  // 成就與角色新解鎖溫馨上方橫幅（顯示 2.5 秒不擋路自動淡出）
  // -------------------------------------------------------------------------

  showUnlockToasts(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return;
    }
    for (let i = 0; i < items.length; i++) {
      this._toastQueue.push(items[i]);
    }
    if (!this._toastBusy) {
      this._processNextToast();
    }
  }

  _processNextToast() {
    if (this._toastQueue.length === 0) {
      this._toastBusy = false;
      return;
    }

    this._toastBusy = true;
    const item = this._toastQueue.shift();
    const icon = item.type === 'cat' ? '🐱' : '🌟';

    const el = document.createElement('div');
    el.className = 'unlock-toast';
    el.innerHTML = `
      <div class="toast-icon">${icon}</div>
      <div class="toast-text">
        <div class="toast-sub">${escapeHtml(item.subtitle || '達成新成就')}</div>
        <div class="toast-name">${escapeHtml(item.name)}</div>
      </div>
    `;
    this.toastContainerEl.appendChild(el);

    // 停留 2.5 秒後平滑滑出
    window.setTimeout(() => {
      el.classList.add('leaving');
      window.setTimeout(() => {
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
        this._processNextToast();
      }, 240);
    }, 2500);
  }
}

