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
  
