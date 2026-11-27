// src/sprites.js — 《星塵貓大作戰》柔光像素可愛風 Canvas 2D 程式化繪圖模組

import { GAME_CONFIG, CATS, STAGES } from './config.js';

const CAT_MAP = new Map(CATS.map((cat) => [cat.id, cat]));
const GLOW_CACHE = new Map();

// ---------------------------------------------------------------------------
// 通用效能快取與像素繪圖工具
// ---------------------------------------------------------------------------

function getGlowSprite(color) {
  if (GLOW_CACHE.has(color)) {
    return GLOW_CACHE.get(color);
  }

  const size = 64;
  const half = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const gctx = canvas.getContext('2d');

  const grad = gctx.createRadialGradient(half, half, 1, half, half, half);
  grad.addColorStop(0, color);
  grad.addColorStop(0.38, hexToRgba(color, 0.45));
  grad.addColorStop(0.72, hexToRgba(color, 0.14));
  grad.addColorStop(1, hexToRgba(color, 0));

  gctx.fillStyle = grad;
  gctx.fillRect(0, 0, size, size);

  GLOW_CACHE.set(color, canvas);
  return canvas;
}

function hexToRgba(hex, alpha) {
  if (typeof hex !== 'string' || !hex.startsWith('#')) {
    return `rgba(255, 255, 255, ${alpha})`;
  }
  let clean = hex.slice(1);
  if (clean.length === 3) {
    clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2];
  }
  const num = parseInt(clean, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawSoftGlow(ctx, x, y, radius, color, alpha = 0.6) {
  if (radius <= 0 || alpha <= 0) {
    return;
  }
  const sprite = getGlowSprite(color);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);
  ctx.restore();
}

function drawShadow(ctx, x, y, rx, ry, alpha = 0.28) {
  ctx.save();
  ctx.fillStyle = `rgba(8, 10, 24, ${alpha})`;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function pxRect(ctx, x, y, w, h, color) {
  if (color) {
    ctx.fillStyle = color;
  }
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function drawPixelOval(ctx, cx, cy, rx, ry, fill, stroke = null, strokeWidth = 2) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function drawPixelStar(ctx, cx, cy, size, color, innerColor = '#ffffff') {
  const s = Math.max(2, Math.round(size));
  const half = Math.max(1, Math.round(s * 0.34));
  ctx.fillStyle = color;
  pxRect(ctx, cx - half, cy - s, half * 2, s * 2);
  pxRect(ctx, cx - s, cy - half, s * 2, half * 2);
  if (innerColor) {
    const core = Math.max(1, Math.round(s * 0.28));
    ctx.fillStyle = innerColor;
    pxRect(ctx, cx - core, cy - core, core * 2, core * 2);
  }
}

function tileHash(tx, ty, salt = 0) {
  let n = (tx * 374761393 + ty * 668265263 + salt * 1442695041) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function getBounceTransform(time, moving, seed = 0, freq = 10, hopHeight = 4.5) {
  if (!moving) {
    const breath = Math.sin(time * 3.2 + seed);
    return {
      offsetY: breath * 0.9,
      scaleX: 1 + breath * 0.03,
      scaleY: 1 - breath * 0.03,
      phase: time * 3.2 + seed,
    };
  }
  const phase = time * freq + seed;
  const s = Math.sin(phase);
  const absS = Math.abs(s);
  const lift = Math.pow(absS, 0.85);
  return {
    offsetY: -lift * hopHeight,
    scaleX: 1 + (0.5 - lift) * 0.16,
    scaleY: 1 - (0.5 - lift) * 0.16,
    phase,
  };
}

// ---------------------------------------------------------------------------
// 1. 無縫捲動星光地板背景（隨 3 個關卡 palette 切換）
// ---------------------------------------------------------------------------

export function drawBackground(ctx, cameraX, cameraY, viewW, viewH, stageInput, time = 0) {
  const stage = stageInput || STAGES[0];
  const palette = stage.palette || STAGES[0].palette;
  const worldSize = GAME_CONFIG.WORLD_SIZE;
  const tileSize = 96;

  // 1. 底層星夜色
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, viewW, viewH);

  const startTx = Math.floor(cameraX / tileSize) - 1;
  const endTx = Math.floor((cameraX + viewW) / tileSize) + 1;
  const startTy = Math.floor(cameraY / tileSize) - 1;
  const endTy = Math.floor((cameraY + viewH) / tileSize) + 1;

  // 2. 細部地板格紋與關卡專屬微裝飾（96x96）
  for (let ty = startTy; ty <= endTy; ty++) {
    for (let tx = startTx; tx <= endTx; tx++) {
      const sx = Math.round(tx * tileSize - cameraX);
      const sy = Math.round(ty * tileSize - cameraY);

      if ((tx + ty) % 2 === 0) {
        ctx.fillStyle = hexToRgba(palette.grid, 0.34);
        ctx.fillRect(sx, sy, tileSize, tileSize);
      }

      // 細緻像素交點星芒
      ctx.fillStyle = hexToRgba(palette.grid, 0.52);
      ctx.fillRect(sx - 1, sy - 1, 2, 2);

      const h1 = tileHash(tx, ty, 11);
      const h2 = tileHash(tx, ty, 29);
      const h3 = tileHash(tx, ty, 47);
      const dx = sx + 16 + Math.floor(h2 * (tileSize - 32));
      const dy = sy + 16 + Math.floor(h3 * (tileSize - 32));

      if (stage.id === 1) {
        // 第 1 關：星夜野餐草地（草叢、小星花、微光螢火）
        if (h1 < 0.44) {
          ctx.fillStyle = hexToRgba(palette.grass, 0.78);
          pxRect(ctx, dx - 5, dy, 2, 6);
          pxRect(ctx, dx - 1, dy - 3, 2, 9);
          pxRect(ctx, dx + 3, dy + 1, 2, 5);
          if (h2 > 0.55) {
            const flowerColor = h3 > 0.5 ? '#ff9ebb' : '#fff3b0';
            pxRect(ctx, dx - 2, dy - 5, 4, 3, flowerColor);
            pxRect(ctx, dx - 1, dy - 4, 2, 1, '#ffffff');
          }
        } else if (h1 < 0.62) {
          const pulse = 0.45 + 0.35 * Math.sin(time * 2.2 + h2 * 10);
          drawSoftGlow(ctx, dx, dy, 13, palette.glow, pulse * 0.35);
          drawPixelStar(ctx, dx, dy, 2.5, hexToRgba(palette.glow, pulse), '#fffdf7');
        }
      } else if (stage.id === 2) {
        // 第 2 關：晚霞燈籠夜市（石板紋路、暖金燈影、落櫻光點）
        if (h1 < 0.42) {
          ctx.fillStyle = hexToRgba(palette.grass, 0.48);
          pxRect(ctx, dx - 12, dy - 5, 24, 10);
          ctx.fillStyle = hexToRgba('#ffffff', 0.06);
          pxRect(ctx, dx - 10, dy - 4, 20, 2);
        } else if (h1 < 0.64) {
          const pulse = 0.5 + 0.35 * Math.sin(time * 2.6 + h3 * 12);
          drawSoftGlow(ctx, dx, dy, 20, palette.glow, pulse * 0.28);
          pxRect(ctx, dx - 2, dy - 2, 4, 4, hexToRgba('#ffd166', pulse * 0.85));
        }
      } else {
        // 第 3 關：月華竹林溫泉（竹葉、踏腳石、月華水波）
        if (h1 < 0.34) {
          const wave = Math.sin(time * 2.0 + h2 * 8) * 2;
          ctx.strokeStyle = hexToRgba(palette.glow, 0.24);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(dx, dy, 12 + wave * 0.5, 5, 0, 0, Math.PI * 2);
          ctx.stroke();
        } else if (h1 < 0.6) {
          ctx.fillStyle = hexToRgba(palette.grass, 0.8);
          pxRect(ctx, dx - 6, dy, 9, 3);
          pxRect(ctx, dx - 2, dy - 3, 9, 3);
          if (h2 > 0.6) {
            drawPixelOval(ctx, dx + 10, dy + 4, 6, 4, hexToRgba('#496b6b', 0.6));
          }
        } else if (h1 < 0.72) {
          const pulse = 0.4 + 0.4 * Math.sin(time * 2.4 + h3 * 9);
          drawSoftGlow(ctx, dx, dy, 14, palette.glow, pulse * 0.32);
          pxRect(ctx, dx - 1, dy - 1, 3, 3, hexToRgba('#ffffff', pulse * 0.85));
        }
      }
    }
  }

  // 3. 大場景主題地標層（288x288 巨格，讓移動時更有探索感）
  const macroSize = 288;
  const mStartX = Math.floor(cameraX / macroSize) - 1;
  const mEndX = Math.floor((cameraX + viewW) / macroSize) + 1;
  const mStartY = Math.floor(cameraY / macroSize) - 1;
  const mEndY = Math.floor((cameraY + viewH) / macroSize) + 1;

  for (let my = mStartY; my <= mEndY; my++) {
    for (let mx = mStartX; mx <= mEndX; mx++) {
      const mh = tileHash(mx, my, 73);
      if (mh > 0.62) {
        continue;
      }
      const ox = 74 + tileHash(mx, my, 81) * (macroSize - 148);
      const oy = 74 + tileHash(mx, my, 89) * (macroSize - 148);
      const lx = Math.round(mx * macroSize + ox - cameraX);
      const ly = Math.round(my * macroSize + oy - cameraY);

      if (stage.id === 1) {
        // 第 1 關地標：小野餐墊（粉白格紋＋點心籃）或星花小環
        if (mh < 0.3) {
          drawSoftGlow(ctx, lx, ly, 46, '#ffd166', 0.14);
          pxRect(ctx, lx - 28, ly - 20, 56, 40, 'rgba(255, 245, 228, 0.24)');
          pxRect(ctx, lx - 28, ly - 10, 56, 8, 'rgba(255, 158, 187, 0.22)');
          pxRect(ctx, lx - 28, ly + 4, 56, 8, 'rgba(255, 158, 187, 0.22)');
          pxRect(ctx, lx - 14, ly - 20, 8, 40, 'rgba(255, 209, 102, 0.18)');
          pxRect(ctx, lx + 8, ly - 20, 8, 40, 'rgba(255, 209, 102, 0.18)');
          // 小點心盤
          drawPixelOval(ctx, lx + 8, ly - 4, 7, 5, 'rgba(255, 255, 255, 0.45)');
          pxRect(ctx, lx + 5, ly - 6, 3, 3, '#ff9ebb');
          pxRect(ctx, lx + 9, ly - 5, 3, 3, '#95d57b');
        } else {
          // 柔和星光花環
          drawSoftGlow(ctx, lx, ly, 36, '#9bf6ff', 0.14);
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + mh * 6;
            const fx = lx + Math.cos(a) * 22;
            const fy = ly + Math.sin(a) * 16;
            pxRect(ctx, fx - 2, fy - 2, 4, 4, i % 2 === 0 ? '#ffd166' : '#ff9ebb');
          }
        }
      } else if (stage.id === 2) {
        // 第 2 關地標：夜市暖光燈籠陣與石板廣場
        const sway = Math.sin(time * 2.2 + mh * 10) * 2;
        drawSoftGlow(ctx, lx, ly, 58, '#ff9ebb', 0.22);
        drawSoftGlow(ctx, lx, ly, 32, '#ffd166', 0.2);

        // 地面圓形祭典石紋
        ctx.strokeStyle = 'rgba(255, 209, 102, 0.18)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(lx, ly, 32, 22, 0, 0, Math.PI * 2);
        ctx.stroke();

        // 兩盞發光小燈籠裝飾
        for (let i = -1; i <= 1; i += 2) {
          const dx = lx + i * 24 + sway * 0.4;
          const dy = ly - 10;
          pxRect(ctx, dx - 1, dy - 10, 2, 6, '#5c3c4c');
          drawPixelOval(ctx, dx, dy, 6.5, 8, 'rgba(255, 143, 171, 0.72)', 'rgba(255, 209, 102, 0.8)', 1.4);
          pxRect(ctx, dx - 2, dy - 2, 4, 4, 'rgba(255, 243, 176, 0.85)');
        }
      } else {
        // 第 3 關地標：冒煙溫泉小池 或 月下竹林小景
        if (mh < 0.34) {
          drawSoftGlow(ctx, lx, ly, 54, '#9bf6ff', 0.2);
          drawPixelOval(ctx, lx, ly, 36, 23, 'rgba(72, 149, 160, 0.32)', 'rgba(155, 246, 255, 0.35)', 2);
          const ripple = (time * 0.7 + mh * 5) % 1;
          ctx.strokeStyle = hexToRgba('#9bf6ff', (1 - ripple) * 0.35);
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.ellipse(lx, ly, 8 + ripple * 24, 5 + ripple * 14, 0, 0, Math.PI * 2);
          ctx.stroke();
          // 溫泉熱氣微升
          const sy = -((time * 12 + mh * 20) % 18);
          const sa = Math.max(0, 1 - Math.abs(sy) / 18) * 0.38;
          ctx.fillStyle = `rgba(255, 255, 255, ${sa})`;
          pxRect(ctx, lx - 6, ly - 4 + sy, 3, 6);
          pxRect(ctx, lx + 8, ly - 8 + sy * 0.8, 3, 5);
        } else {
          // 靜謐竹節小叢
          ctx.fillStyle = 'rgba(45, 106, 95, 0.55)';
          pxRect(ctx, lx - 10, ly - 24, 4, 34);
          pxRect(ctx, lx + 4, ly - 18, 4, 28);
          ctx.fillStyle = 'rgba(155, 246, 255, 0.25)';
          pxRect(ctx, lx - 10, ly - 14, 4, 2);
          pxRect(ctx, lx - 10, ly - 2, 4, 2);
          pxRect(ctx, lx + 4, ly - 8, 4, 2);
          // 飄逸竹葉
          ctx.fillStyle = 'rgba(82, 168, 138, 0.65)';
          pxRect(ctx, lx - 16, ly - 20, 8, 3);
          pxRect(ctx, lx + 7, ly - 16, 9, 3);
        }
      }
    }
  }

  // 4. 輕微視差飄浮環境微粒（螢火／夜市火星／溫泉月光）
  const parallaxTile = 160;
  const pCamX = cameraX * 0.65;
  const pCamY = cameraY * 0.65;
  const pStartX = Math.floor(pCamX / parallaxTile) - 1;
  const pEndX = Math.floor((pCamX + viewW) / parallaxTile) + 1;
  const pStartY = Math.floor(pCamY / parallaxTile) - 1;
  const pEndY = Math.floor((pCamY + viewH) / parallaxTile) + 1;

  for (let py = pStartY; py <= pEndY; py++) {
    for (let px = pStartX; px <= pEndX; px++) {
      const h = tileHash(px, py, 91);
      if (h > 0.62) {
        continue;
      }
      const ox = tileHash(px, py, 103) * parallaxTile;
      const oy = tileHash(px, py, 127) * parallaxTile;
      const driftX = Math.cos(time * 0.9 + h * 12) * 5;
      const driftY = Math.sin(time * 1.4 + h * 15) * 5;
      const sx = px * parallaxTile + ox - pCamX + driftX;
      const sy = py * parallaxTile + oy - pCamY + driftY;
      const twinkle = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(time * 3.1 + h * 20));
      const particleColor =
        stage.id === 2 ? (h > 0.3 ? '#ffd166' : '#ff9ebb') : palette.glow;
      pxRect(ctx, sx, sy, h > 0.45 ? 3 : 2, h > 0.45 ? 3 : 2, hexToRgba(particleColor, twinkle));
    }
  }

  // 5. 場地邊界柔光星牆（WORLD_SIZE x WORLD_SIZE）
  const bx = -cameraX;
  const by = -cameraY;
  const bw = worldSize;
  const bh = worldSize;

  ctx.save();
  ctx.fillStyle = 'rgba(8, 10, 22, 0.45)';
  if (by > 0) {
    ctx.fillRect(0, 0, viewW, Math.min(viewH, by));
  }
  if (by + bh < viewH) {
    ctx.fillRect(0, Math.max(0, by + bh), viewW, viewH - Math.max(0, by + bh));
  }
  if (bx > 0) {
    ctx.fillRect(0, Math.max(0, by), Math.min(viewW, bx), Math.min(viewH, by + bh) - Math.max(0, by));
  }
  if (bx + bw < viewW) {
    const rx = Math.max(0, bx + bw);
    ctx.fillRect(rx, Math.max(0, by), viewW - rx, Math.min(viewH, by + bh) - Math.max(0, by));
  }

  ctx.strokeStyle = hexToRgba(palette.glow, 0.55);
  ctx.lineWidth = 4;
  ctx.setLineDash([12, 10]);
  ctx.lineDashOffset = -time * 18;
  ctx.strokeRect(bx, by, bw, bh);
  ctx.setLineDash([]);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 2. 5 隻可選貓咪主角（含柔光、陰影、彈跳形變、朝向翻轉與專屬造型）
// ---------------------------------------------------------------------------

export function drawCat(ctx, catInput, x, y, options = {}) {
  const cat = typeof catInput === 'string' ? CAT_MAP.get(catInput) || CATS[0] : catInput || CATS[0];
  const {
    time = 0,
    moving = false,
    facing = 1,
    scale = 1,
    invincible = false,
    hurtFlash = 0,
    showShadow = true,
  } = options;

  // 無敵閃爍半透明回饋
  const invAlpha = invincible && Math.floor(time * 14) % 2 === 0 ? 0.42 : 1;
  const isChubby = cat.id === 'matcha_orange';
  const isBlack = cat.id === 'starry_black';
  const isBoxCat = cat.id === 'box_tabby';

  const bounce = getBounceTransform(time, moving, 0, isChubby ? 9 : 11, isChubby ? 3.5 : 5);

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // 底部柔和陰影
  if (showShadow) {
    const shadowScale = 1 - Math.abs(bounce.offsetY) * 0.03;
    drawShadow(ctx, 0, 15, (isChubby ? 17 : 14) * shadowScale, 6 * shadowScale, 0.32);
  }

  // 角色自身微弱星塵柔光（星空黑貓額外強化外緣柔光以提升暗背景辨識度）
  const glowColor = isBlack ? '#ffd166' : cat.colors.accent || '#ffd166';
  drawSoftGlow(ctx, 0, 2, isBlack ? 30 : 24, glowColor, isBlack ? 0.34 : 0.22);

  ctx.globalAlpha *= invAlpha;

  // 套用彈跳位移、朝向翻轉與 Squash & Stretch
  ctx.translate(0, bounce.offsetY);
  ctx.scale((facing < 0 ? -1 : 1) * bounce.scaleX, bounce.scaleY);

  const outline = isBlack ? '#5b618a' : '#262130';
  const main = cat.colors.main;
  const belly = cat.colors.belly;
  const accent = cat.colors.accent;
  const eyeColor = cat.colors.eye;
  const bodyRx = isChubby ? 15 : 12;
  const bodyRy = isChubby ? 12 : 10.5;
  const headRx = isChubby ? 14.5 : 13;
  const headRy = isChubby ? 12 : 11;

  // 搖擺尾巴
  const tailWag = Math.sin(time * (moving ? 10 : 4.2)) * 4;
  ctx.save();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 6.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-bodyRx + 3, 7);
  ctx.quadraticCurveTo(-bodyRx - 8, 2 + tailWag * 0.5, -bodyRx - 6, -6 + tailWag);
  ctx.stroke();

  ctx.strokeStyle = main;
  ctx.lineWidth = 3.6;
  ctx.beginPath();
  ctx.moveTo(-bodyRx + 3, 7);
  ctx.quadraticCurveTo(-bodyRx - 8, 2 + tailWag * 0.5, -bodyRx - 6, -6 + tailWag);
  ctx.stroke();
  if (isBlack) {
    // 星空黑貓尾尖星光
    pxRect(ctx, -bodyRx - 7, -7 + tailWag, 3, 3, '#ffd166');
  }
  ctx.restore();

  // 小腳丫（行走交替踏步）
  const stepL = moving ? Math.sin(bounce.phase) * 3 : 0;
  const stepR = moving ? -Math.sin(bounce.phase) * 3 : 0;
  drawPixelOval(ctx, -5, 13 + Math.min(0, stepL), 4, 3, belly, outline, 1.8);
  drawPixelOval(ctx, 5, 13 + Math.min(0, stepR), 4, 3, belly, outline, 1.8);

  // 身體與肚皮
  drawPixelOval(ctx, 0, 5, bodyRx, bodyRy, main, outline, 2);
  drawPixelOval(ctx, 1, 7, bodyRx * 0.62, bodyRy * 0.62, belly);

  // 身體花紋細節
  if (cat.id === 'box_tabby') {
    pxRect(ctx, -9, 2, 4, 2, '#737982');
    pxRect(ctx, -8, 6, 4, 2, '#737982');
  } else if (cat.id === 'calico_dango') {
    pxRect(ctx, -10, 1, 5, 5, cat.colors.patch || '#3d3535');
    pxRect(ctx, 6, 3, 4, 4, accent);
  } else if (cat.id === 'matcha_orange') {
    pxRect(ctx, -12, 2, 5, 2, '#d88234');
    pxRect(ctx, -11, 6, 5, 2, '#d88234');
    pxRect(ctx, 8, 4, 4, 2, '#d88234');
  } else if (cat.id === 'starry_black') {
    pxRect(ctx, -6, 3, 2, 2, '#ffd166');
    pxRect(ctx, 5, 6, 2, 2, '#9bf6ff');
  }

  // 舉手紙箱貓：高舉小手左右擺動（在頭部兩側後方繪製）
  if (isBoxCat) {
    const waveL = Math.sin(time * 9.5) * 3;
    const waveR = Math.cos(time * 9.5) * 3;

    ctx.save();
    // 左高舉手
    ctx.translate(-12, -2 + waveL * 0.4);
    ctx.rotate(-0.45 + waveL * 0.06);
    drawPixelOval(ctx, 0, -6, 3.6, 6.2, main, outline, 1.8);
    pxRect(ctx, -2, -10, 4, 3, belly);
    ctx.restore();

    ctx.save();
    // 右高舉手
    ctx.translate(12, -2 + waveR * 0.4);
    ctx.rotate(0.45 - waveR * 0.06);
    drawPixelOval(ctx, 0, -6, 3.6, 6.2, main, outline, 1.8);
    pxRect(ctx, -2, -10, 4, 3, belly);
    ctx.restore();
  } else {
    // 其他貓咪的胸前可愛小手
    const pawBob = moving ? Math.sin(bounce.phase) * 1.4 : 0;
    drawPixelOval(ctx, -8, 6 + pawBob, 3.4, 2.8, belly, outline, 1.6);
    drawPixelOval(ctx, 8, 6 - pawBob, 3.4, 2.8, belly, outline, 1.6);
  }

  // 抹茶胖橘貓的抹茶綠圍巾（位於頭與身體交界）
  if (cat.hat === 'scarf') {
    const flutter = Math.sin(time * (moving ? 9 : 3.5)) * 2.5;
    // 飄動圍巾尾端
    ctx.fillStyle = '#5f8f4d';
    pxRect(ctx, -14, 1 + flutter * 0.4, 6, 10);
    ctx.fillStyle = accent;
    pxRect(ctx, -13, 1 + flutter * 0.4, 4, 9);
    pxRect(ctx, -13, 8 + flutter * 0.4, 4, 2, '#d8f3dc');
    // 圍巾主圈
    drawPixelOval(ctx, 0, 0.5, 13.5, 4.5, accent, '#3d5e31', 1.8);
    pxRect(ctx, -8, -1, 16, 2, '#a6d48e');
  }

  // 貓耳朵
  drawCatEar(ctx, -8, -15, -1, main, outline, isBlack ? '#5b4b7a' : '#ffbfd3');
  drawCatEar(ctx, 8, -15, 1, cat.id === 'calico_dango' ? accent : main, outline, isBlack ? '#5b4b7a' : '#ffbfd3');

  // 貓咪頭部
  drawPixelOval(ctx, 0, -9, headRx, headRy, main, outline, 2);

  // 頭部專屬花紋
  if (cat.id === 'box_tabby') {
    pxRect(ctx, -4, -18, 2, 4, '#6e757f');
    pxRect(ctx, -1, -19, 2, 5, '#6e757f');
    pxRect(ctx, 2, -18, 2, 4, '#6e757f');
  } else if (cat.id === 'calico_dango') {
    // 臉部明顯三花色塊（左黑褐塊、右橘色塊）
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, -9, headRx - 1, headRy - 1, 0, 0, Math.PI * 2);
    ctx.clip();
    drawPixelOval(ctx, -8, -15, 7, 6.5, cat.colors.patch || '#3d3535');
    drawPixelOval(ctx, 9, -13, 7, 6.5, accent);
    ctx.restore();
  } else if (cat.id === 'matcha_orange') {
    pxRect(ctx, -4, -19, 2, 4, '#d88234');
    pxRect(ctx, -1, -20, 2, 5, '#d88234');
    pxRect(ctx, 2, -19, 2, 4, '#d88234');
  }

  // 眼睛（星空黑貓為金黃大眼）
  const blinkCycle = (time + (cat.id.length * 0.7)) % 4.2;
  const isBlinking = blinkCycle > 4.06;
  const eyeY = -9.5;
  const eyeRadius = isBlack ? 3.2 : 2.3;

  if (isBlinking) {
    pxRect(ctx, -7, eyeY, 4, 1.8, eyeColor);
    pxRect(ctx, 3, eyeY, 4, 1.8, eyeColor);
  } else {
    drawPixelOval(ctx, -4.8, eyeY, eyeRadius, eyeRadius + (isBlack ? 0.4 : 0), eyeColor);
    drawPixelOval(ctx, 5.2, eyeY, eyeRadius, eyeRadius + (isBlack ? 0.4 : 0), eyeColor);
    // 眼中亮點
    pxRect(ctx, -6, eyeY - 2, 2, 2, '#ffffff');
    pxRect(ctx, 4, eyeY - 2, 2, 2, '#ffffff');
    if (isBlack) {
      pxRect(ctx, -4, eyeY + 1, 1.5, 1.5, '#fff9db');
      pxRect(ctx, 6, eyeY + 1, 1.5, 1.5, '#fff9db');
    }
  }

  // 腮紅（溫泉白貓泡湯腮紅更粉潤）
  const blushAlpha = cat.id === 'onsen_white' ? 0.72 : 0.48;
  ctx.fillStyle = `rgba(255, 146, 178, ${blushAlpha})`;
  pxRect(ctx, -10.5, -7, 4, 2.5);
  pxRect(ctx, 6.5, -7, 4, 2.5);

  // 鼻子與可愛 w 嘴
  const mouthColor = isBlack ? '#ffe66d' : '#3a2e39';
  pxRect(ctx, -0.5, -7.5, 2, 1.5, '#ff9ebb');
  ctx.strokeStyle = mouthColor;
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-2.5, -5.2);
  ctx.quadraticCurveTo(-0.8, -3.5, 0.5, -5.2);
  ctx.quadraticCurveTo(1.8, -3.5, 3.5, -5.2);
  ctx.stroke();

  // 頭飾細節（5 隻貓咪核心辨識點）
  if (cat.hat === 'cardboard') {
    // 舉手紙箱貓：頭頂小紙箱與微開箱蓋
    ctx.save();
    ctx.translate(0, -21);
    ctx.rotate(Math.sin(time * 5) * 0.05);
    // 左/右張開紙箱翼
    pxRect(ctx, -14, -4, 5, 3, '#b87f47');
    pxRect(ctx, 9, -4, 5, 3, '#b87f47');
    // 箱體本體
    pxRect(ctx, -10, -9, 20, 11, '#c9935b');
    ctx.strokeStyle = '#5c3c1e';
    ctx.lineWidth = 1.6;
    ctx.strokeRect(-10, -9, 20, 11);
    // 箱頂反光與封箱膠帶
    pxRect(ctx, -9, -8, 18, 2.5, '#e2b47d');
    pxRect(ctx, -2, -9, 4, 6, '#f4dfb6');
    ctx.restore();
  } else if (cat.hat === 'dango') {
    // 三花糰子貓：頭頂三色糰子串
    ctx.save();
    ctx.translate(2, -21);
    ctx.rotate(-0.22);
    // 竹籤
    ctx.strokeStyle = '#b98b54';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-11, 2);
    ctx.lineTo(13, -6);
    ctx.stroke();
    // 粉 / 白 / 抹茶綠 三顆糰子
    drawPixelOval(ctx, -5, 0, 4.2, 4, '#ff9ebb', '#4a3038', 1.4);
    drawPixelOval(ctx, 2, -2.2, 4.2, 4, '#fffdf7', '#4a3038', 1.4);
    drawPixelOval(ctx, 9, -4.4, 4.2, 4, '#95d57b', '#4a3038', 1.4);
    pxRect(ctx, -6.5, -2, 2, 1.5, '#ffffff');
    pxRect(ctx, 0.5, -4, 2, 1.5, '#ffffff');
    pxRect(ctx, 7.5, -6, 2, 1.5, '#ffffff');
    ctx.restore();
  } else if (cat.hat === 'halo') {
    // 星空黑貓：微微發光的星星光環
    const hover = Math.sin(time * 4.5) * 1.8;
    const pulse = 0.65 + 0.35 * Math.sin(time * 5.2);
    drawSoftGlow(ctx, 0, -25 + hover, 16, '#ffd166', pulse * 0.55);
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.ellipse(0, -25 + hover, 10, 3.2, 0, 0, Math.PI * 2);
    ctx.stroke();
    drawPixelStar(ctx, 0, -26 + hover, 4, '#ffe66d', '#ffffff');
  } else if (cat.hat === 'towel_orange') {
    // 溫泉白貓：頭頂摺疊白毛巾 + 小橘子 + 微飄熱氣
    ctx.save();
    ctx.translate(0, -19.5);
    // 摺疊毛巾
    pxRect(ctx, -9, -3, 18, 6, '#eef4fa');
    ctx.strokeStyle = '#8d9db6';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-9, -3, 18, 6);
    pxRect(ctx, -8, 0, 16, 1.5, '#cfdbe8');
    // 小橘子與綠葉
    drawPixelOval(ctx, 0, -6.5, 4.6, 4.1, '#ff9f1c', '#9c4f06', 1.4);
    pxRect(ctx, -2, -8.5, 2, 1.5, '#ffe19c');
    pxRect(ctx, 0, -12, 3, 2, '#70c167');
    // 微量溫泉熱氣
    const steamY = -((time * 12) % 10);
    const steamAlpha = Math.max(0, 1 - Math.abs(steamY) / 10) * 0.5;
    ctx.fillStyle = `rgba(255, 255, 255, ${steamAlpha})`;
    pxRect(ctx, 9, -6 + steamY, 2, 3);
    ctx.restore();
  }

  // 受擊白閃覆蓋
  if (hurtFlash > 0) {
    ctx.globalAlpha = Math.min(0.75, hurtFlash);
    drawPixelOval(ctx, 0, -2, bodyRx + 2, 18, '#ffffff');
  }

  ctx.restore();
}

function drawCatEar(ctx, x, y, dir, fill, outline, inner) {
  ctx.beginPath();
  ctx.moveTo(x - dir * 4, y + 4);
  ctx.lineTo(x + dir * 2, y - 6);
  ctx.lineTo(x + dir * 6, y + 4);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = outline;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x - dir * 1.5, y + 2.5);
  ctx.lineTo(x + dir * 1.8, y - 3);
  ctx.lineTo(x + dir * 4, y + 2.5);
  ctx.closePath();
  ctx.fillStyle = inner;
  ctx.fill();
}

// ---------------------------------------------------------------------------
// 3. 6 種可愛小怪 + 3 隻關卡 Boss
// ---------------------------------------------------------------------------

export function drawEnemy(ctx, enemy, time = 0) {
  if (!enemy) {
    return;
  }
  const type = enemy.type || enemy.id || 'dandelion';
  if (enemy.isBoss || type.startsWith('boss_')) {
    drawBoss(ctx, enemy, time);
    return;
  }

  const x = enemy.x || 0;
  const y = enemy.y || 0;
  const facing = enemy.facing || (enemy.vx < -0.1 ? -1 : 1);
  const seed = enemy.animSeed || (enemy.id ? enemy.id * 1.7 : (x + y) * 0.03);
  const hitFlash = enemy.hitFlash || 0;
  const scale = enemy.scale || 1;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  switch (type) {
    case 'dandelion':
      drawEnemyDandelion(ctx, time, seed, facing, hitFlash);
      break;
    case 'box_slime':
      drawEnemyBoxSlime(ctx, time, seed, facing, hitFlash);
      break;
    case 'lantern_jelly':
      drawEnemyLanternJelly(ctx, time, seed, facing, hitFlash);
      break;
    case 'dango_hopper':
      drawEnemyDangoHopper(ctx, time, seed, facing, hitFlash);
      break;
    case 'yarn_roller':
      drawEnemyYarnRoller(ctx, time, seed, facing, hitFlash);
      break;
    case 'firefly_wisp':
      drawEnemyFireflyWisp(ctx, time, seed, facing, hitFlash);
      break;
    default:
      drawEnemyDandelion(ctx, time, seed, facing, hitFlash);
      break;
  }

  ctx.restore();
}

function drawEnemyDandelion(ctx, time, seed, facing, hitFlash) {
  const floatY = Math.sin(time * 4.2 + seed) * 3.5;
  drawShadow(ctx, 0, 14, 10, 4, 0.24);
  drawSoftGlow(ctx, 0, floatY, 18, '#fff7d6', 0.28);

  ctx.save();
  ctx.translate(0, floatY);
  ctx.scale(facing < 0 ? -1 : 1, 1);

  // 飄逸小絨毛外瓣
  const fluffColor = hitFlash > 0 ? '#ffffff' : '#fffdf2';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + time * 0.8 + seed;
    const fx = Math.cos(a) * 10;
    const fy = Math.sin(a) * 9.5;
    drawPixelOval(ctx, fx, fy, 4.2, 4.2, fluffColor, '#9aa6b2', 1.2);
  }
  // 主球體
  drawPixelOval(ctx, 0, 0, 10, 9.5, fluffColor, '#7f8c9a', 1.8);
  // 綠色小花托
  pxRect(ctx, -3, 8, 6, 3, '#7fb069');
  // 可愛小臉
  pxRect(ctx, -4, -2, 2.2, 2.5, '#2b2d42');
  pxRect(ctx, 3, -2, 2.2, 2.5, '#2b2d42');
  pxRect(ctx, -6, 1, 2.5, 1.5, '#ff9ebb');
  pxRect(ctx, 4.5, 1, 2.5, 1.5, '#ff9ebb');
  pxRect(ctx, -0.5, 1, 2.5, 1.4, '#5a6270');

  ctx.restore();
}

function drawEnemyBoxSlime(ctx, time, seed, facing, hitFlash) {
  const b = getBounceTransform(time, true, seed, 8.5, 4);
  drawShadow(ctx, 0, 13, 13, 4.5, 0.3);

  ctx.save();
  ctx.translate(0, b.offsetY);
  ctx.scale((facing < 0 ? -1 : 1) * b.scaleX, b.scaleY);

  // 史萊姆頭部從紙箱探出
  const slimeFill = hitFlash > 0 ? '#ffffff' : '#80ed99';
  drawSoftGlow(ctx, 0, -4, 16, '#80ed99', 0.25);
  drawPixelOval(ctx, 0, -5, 10.5, 9, slimeFill, '#2b6e44', 1.8);
  pxRect(ctx, -5, -10, 4, 2.5, '#d8f3dc');

  // 可愛雙眼
  pxRect(ctx, -4.5, -6, 2.5, 3, '#1e2749');
  pxRect(ctx, 3, -6, 2.5, 3, '#1e2749');
  pxRect(ctx, -4.5, -6, 1.2, 1.2, '#ffffff');
  pxRect(ctx, 3, -6, 1.2, 1.2, '#ffffff');

  // 迷你小紙箱底座
  const boxFill = hitFlash > 0 ? '#ffffff' : '#c9935b';
  pxRect(ctx, -12, -1, 24, 12, boxFill);
  ctx.strokeStyle = '#5c3c1e';
  ctx.lineWidth = 1.8;
  ctx.strokeRect(-12, -1, 24, 12);
  // 紙箱開蓋翼
  pxRect(ctx, -14, -2, 5, 3, '#dfa96f');
  pxRect(ctx, 9, -2, 5, 3, '#dfa96f');
  pxRect(ctx, -2, -1, 4, 5, '#f4dfb6');

  ctx.restore();
}

function drawEnemyLanternJelly(ctx, time, seed, facing, hitFlash) {
  const hover = Math.sin(time * 4.5 + seed) * 4;
  drawShadow(ctx, 0, 16, 10, 3.8, 0.22);
  drawSoftGlow(ctx, 0, hover - 2, 22, '#ff9ebb', 0.42);

  ctx.save();
  ctx.translate(0, hover);
  ctx.scale(facing < 0 ? -1 : 1, 1);

  // 搖曳觸鬚
  ctx.strokeStyle = hitFlash > 0 ? '#ffffff' : '#ffd166';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  for (let i = -1.5; i <= 1.5; i += 1) {
    const tx = i * 4.2;
    const sway = Math.sin(time * 7 + seed + i) * 3;
    ctx.beginPath();
    ctx.moveTo(tx, 6);
    ctx.quadraticCurveTo(tx + sway, 11, tx - sway * 0.6, 15);
    ctx.stroke();
  }

  // 燈籠傘蓋本體
  const bodyColor = hitFlash > 0 ? '#ffffff' : '#ff8fab';
  drawPixelOval(ctx, 0, -2, 11.5, 9.5, bodyColor, '#6e2842', 1.8);
  // 內部暖黃發光芯與燈籠骨線
  drawPixelOval(ctx, 0, -2, 6.5, 6.5, '#ffd166');
  ctx.strokeStyle = 'rgba(110, 40, 66, 0.35)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(0, -2, 5.5, 9, 0, 0, Math.PI * 2);
  ctx.stroke();

  // 上下木質燈蓋
  pxRect(ctx, -5, -12.5, 10, 3, '#4a2535');
  pxRect(ctx, -6, 5.5, 12, 2.5, '#4a2535');

  // 溫柔笑眼
  pxRect(ctx, -4.5, -3, 2.2, 2.5, '#3b1c2c');
  pxRect(ctx, 3, -3, 2.2, 2.5, '#3b1c2c');
  pxRect(ctx, -0.5, 0, 2, 1.5, '#8c3452');

  ctx.restore();
}

function drawEnemyDangoHopper(ctx, time, seed, facing, hitFlash) {
  const b = getBounceTransform(time, true, seed, 9.5, 6.5);
  drawShadow(ctx, 0, 14, 11, 4, 0.28);

  ctx.save();
  ctx.translate(0, b.offsetY);
  ctx.scale((facing < 0 ? -1 : 1) * b.scaleX, b.scaleY);

  // 頂部小竹籤
  pxRect(ctx, -1, -20, 2, 10, '#c89b63');

  // 堆疊三色彈跳糰子（底綠、中白、頂粉）
  const c1 = hitFlash > 0 ? '#ffffff' : '#95d57b';
  const c2 = hitFlash > 0 ? '#ffffff' : '#fffdf7';
  const c3 = hitFlash > 0 ? '#ffffff' : '#ff9ebb';

  drawPixelOval(ctx, 0, 7, 9.5, 6.5, c1, '#3d3138', 1.8);
  drawPixelOval(ctx, 0, -1, 9, 6.5, c2, '#3d3138', 1.8);
  drawPixelOval(ctx, 0, -9, 8.2, 6, c3, '#3d3138', 1.8);

  // 中間糰子的元氣表情
  pxRect(ctx, -4, -2.5, 2, 2.4, '#2b2424');
  pxRect(ctx, 3, -2.5, 2, 2.4, '#2b2424');
  pxRect(ctx, -6, 0, 2, 1.4, '#ff8fab');
  pxRect(ctx, 5, 0, 2, 1.4, '#ff8fab');
  // 頂部反光
  pxRect(ctx, -3, -12, 3, 2, '#ffffff');

  ctx.restore();
}

function drawEnemyYarnRoller(ctx, time, seed, facing, hitFlash) {
  const rollAngle = time * 5.5 * (facing < 0 ? -1 : 1) + seed;
  const bounceY = -Math.abs(Math.sin(time * 8 + seed)) * 2.5;
  drawShadow(ctx, 0, 13, 12, 4.5, 0.28);

  // 拖尾小毛線
  ctx.save();
  ctx.strokeStyle = '#c77dff';
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  const tailDir = facing < 0 ? 1 : -1;
  ctx.beginPath();
  ctx.moveTo(tailDir * 8, 8);
  ctx.quadraticCurveTo(tailDir * 15, 6 + Math.sin(time * 9 + seed) * 3, tailDir * 20, 10);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.translate(0, bounceY);
  drawSoftGlow(ctx, 0, 0, 17, '#c77dff', 0.24);

  // 旋轉毛線球紋路
  ctx.save();
  ctx.rotate(rollAngle);
  const yarnFill = hitFlash > 0 ? '#ffffff' : '#b892ff';
  drawPixelOval(ctx, 0, 0, 11.5, 11.5, yarnFill, '#48286b', 2);
  ctx.strokeStyle = hitFlash > 0 ? '#f0e6ff' : '#e0c3fc';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(-4, -3, 9, -0.4, 1.6);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(5, 4, 8, 2.5, 4.6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-9, 3);
  ctx.lineTo(9, -3);
  ctx.stroke();
  ctx.restore();

  // 貼在毛線球正面的鈕扣可愛小眼
  ctx.scale(facing < 0 ? -1 : 1, 1);
  drawPixelOval(ctx, -3, -1, 2.3, 2.3, '#231942');
  drawPixelOval(ctx, 4.5, -1, 2.3, 2.3, '#231942');
  pxRect(ctx, -3.5, -2, 1.4, 1.4, '#ffffff');
  pxRect(ctx, 4, -2, 1.4, 1.4, '#ffffff');

  ctx.restore();
}

function drawEnemyFireflyWisp(ctx, time, seed, facing, hitFlash) {
  const floatY = Math.sin(time * 6 + seed) * 4.5;
  const wingFlap = Math.sin(time * 24 + seed) * 0.45;
  drawShadow(ctx, 0, 14, 8, 3, 0.2);
  drawSoftGlow(ctx, 0, floatY, 22, '#9bf6ff', 0.5);

  ctx.save();
  ctx.translate(0, floatY);
  ctx.scale(facing < 0 ? -1 : 1, 1);

  // 小巧透明像素翅膀
  ctx.save();
  ctx.translate(-5, -4);
  ctx.rotate(-0.5 + wingFlap);
  drawPixelOval(ctx, -4, -3, 5.5, 3, 'rgba(225, 252, 255, 0.8)', '#56cfe1', 1.2);
  ctx.restore();

  ctx.save();
  ctx.translate(4, -4);
  ctx.rotate(0.5 - wingFlap);
  drawPixelOval(ctx, 4, -3, 5.5, 3, 'rgba(225, 252, 255, 0.8)', '#56cfe1', 1.2);
  ctx.restore();

  // 螢火蟲光球身體
  const coreFill = hitFlash > 0 ? '#ffffff' : '#9bf6ff';
  drawPixelOval(ctx, 0, 0, 8.5, 9.5, coreFill, '#2a6f82', 1.8);
  drawPixelOval(ctx, 0, 2.5, 5.5, 4.8, '#fff3b0');

  // 頭頂觸角小星光
  pxRect(ctx, -1, -12, 2, 3, '#56cfe1');
  pxRect(ctx, -2, -14, 4, 3, '#ffd166');

  // 閃亮眼睛
  pxRect(ctx, -3.5, -3, 2, 2.5, '#13313d');
  pxRect(ctx, 2.5, -3, 2, 2.5, '#13313d');

  ctx.restore();
}

// ---------------------------------------------------------------------------
// 3B. 3 隻關卡專屬 Boss
// ---------------------------------------------------------------------------

export function drawBoss(ctx, boss, time = 0) {
  if (!boss) {
    return;
  }
  const type = boss.type || boss.id || 'boss_box_king';
  const x = boss.x || 0;
  const y = boss.y || 0;
  const facing = boss.facing || (boss.vx < -0.1 ? -1 : 1);
  const hitFlash = boss.hitFlash || 0;
  const charging = Boolean(boss.charging);
  const scale = boss.scale || 1;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // Boss 專屬氣場光環
  const auraColor =
    type === 'boss_takoyaki' ? '#ff9ebb' : type === 'boss_daruma' ? '#ff6b6b' : '#ffd166';
  const auraPulse = charging ? 0.55 + 0.25 * Math.sin(time * 18) : 0.32 + 0.1 * Math.sin(time * 4);
  drawSoftGlow(ctx, 0, 0, 62, auraColor, auraPulse);

  switch (type) {
    case 'boss_box_king':
      drawBossBoxKing(ctx, time, facing, hitFlash, charging);
      break;
    case 'boss_takoyaki':
      drawBossTakoyaki(ctx, time, facing, hitFlash, charging);
      break;
    case 'boss_daruma':
      drawBossDaruma(ctx, time, facing, hitFlash, charging);
      break;
    default:
      drawBossBoxKing(ctx, time, facing, hitFlash, charging);
      break;
  }

  ctx.restore();
}

function drawBossBoxKing(ctx, time, facing, hitFlash, charging) {
  const b = getBounceTransform(time, true, 0, charging ? 14 : 6, charging ? 7 : 4.5);
  drawShadow(ctx, 0, 38, 42, 13, 0.36);

  ctx.save();
  ctx.translate(0, b.offsetY);
  ctx.scale((facing < 0 ? -1 : 1) * b.scaleX, b.scaleY);

  // 紅金王者披風（在紙箱後方微飄）
  const capeSway = Math.sin(time * 5) * 3;
  ctx.fillStyle = '#c13b56';
  ctx.beginPath();
  ctx.moveTo(-30, -8);
  ctx.lineTo(-42, 28 + capeSway);
  ctx.lineTo(42, 28 - capeSway);
  ctx.lineTo(30, -8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // 巨型紙箱貓王本體
  const boxMain = hitFlash > 0 ? '#ffffff' : '#c9935b';
  const boxLight = hitFlash > 0 ? '#ffffff' : '#e4b783';
  const boxDark = '#694422';

  // 左右外翻紙箱翼
  pxRect(ctx, -44, -18, 12, 8, '#b57b42');
  pxRect(ctx, 32, -18, 12, 8, '#b57b42');

  // 紙箱堡壘主體
  pxRect(ctx, -34, -22, 68, 54, boxMain);
  ctx.strokeStyle = boxDark;
  ctx.lineWidth = 3;
  ctx.strokeRect(-34, -22, 68, 54);
  pxRect(ctx, -31, -19, 62, 7, boxLight);
  pxRect(ctx, -5, -22, 10, 14, '#f5e2bc');

  // 紙箱前緣貓爪拍打
  const pawBounce = Math.sin(time * 8) * 3;
  drawPixelOval(ctx, -20, -19 + pawBounce, 9, 6.5, '#f7f8fa', '#2d2638', 2.2);
  drawPixelOval(ctx, 20, -19 - pawBounce, 9, 6.5, '#f7f8fa', '#2d2638', 2.2);

  // 從紙箱內探出的巨型貓王大臉
  const catFur = hitFlash > 0 ? '#ffffff' : '#a8aeb8';
  drawCatEar(ctx, -16, -34, -1, catFur, '#262130', '#ffbfd3');
  drawCatEar(ctx, 16, -34, 1, catFur, '#262130', '#ffbfd3');
  drawPixelOval(ctx, 0, -24, 24, 17, catFur, '#262130', 2.5);
  // 虎斑額紋
  pxRect(ctx, -7, -38, 3, 7, '#6c7380');
  pxRect(ctx, -1.5, -39, 3, 8, '#6c7380');
  pxRect(ctx, 4, -38, 3, 7, '#6c7380');

  // 霸氣又可愛的金色貓眼
  drawPixelOval(ctx, -9, -24, 4.5, 4.5, '#ffd166', '#1e1e2e', 1.8);
  drawPixelOval(ctx, 9, -24, 4.5, 4.5, '#ffd166', '#1e1e2e', 1.8);
  pxRect(ctx, -10, -26, 2, 4, '#1e1e2e');
  pxRect(ctx, 8, -26, 2, 4, '#1e1e2e');
  // 小鬍鬚與嘴
  pxRect(ctx, -2, -19, 4, 2.5, '#ff9ebb');
  ctx.strokeStyle = '#262130';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-5, -15);
  ctx.quadraticCurveTo(0, -12, 5, -15);
  ctx.stroke();

  // 頭頂黃金像素王冠
  ctx.save();
  ctx.translate(0, -42);
  ctx.fillStyle = '#ffd166';
  ctx.strokeStyle = '#8a5a00';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-13, 4);
  ctx.lineTo(-15, -10);
  ctx.lineTo(-5, -3);
  ctx.lineTo(0, -13);
  ctx.lineTo(5, -3);
  ctx.lineTo(15, -10);
  ctx.lineTo(13, 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  pxRect(ctx, -2, -4, 4, 4, '#ff5c8a');
  ctx.restore();

  // 紙箱正面愛心貓爪徽章
  drawPixelStar(ctx, 0, 12, 7, '#ffd166', '#fff8d6');

  ctx.restore();
}

function drawBossTakoyaki(ctx, time, facing, hitFlash, charging) {
  const hoverY = Math.sin(time * 3.8) * 6;
  const tilt = Math.sin(time * 2.4) * 0.06;
  drawShadow(ctx, 0, 44, 44, 12, 0.3);

  ctx.save();
  ctx.translate(0, hoverY);
  ctx.rotate(tilt);
  ctx.scale(facing < 0 ? -1 : 1, 1);

  // 飛船尾部雙螺旋槳
  const propSpin = Math.sin(time * 28) * 8;
  pxRect(ctx, -44, -3, 10, 6, '#5c4b51');
  pxRect(ctx, -47, -3 - Math.abs(propSpin), 4, 6 + Math.abs(propSpin) * 2, '#9bf6ff');

  // 下方小吊籃與可愛探頭章魚腳
  ctx.strokeStyle = '#8c6239';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-14, 24);
  ctx.lineTo(-12, 32);
  ctx.moveTo(14, 24);
  ctx.lineTo(12, 32);
  ctx.stroke();
  pxRect(ctx, -16, 30, 32, 10, '#7c4d3a');
  ctx.strokeStyle = '#3d2218';
  ctx.lineWidth = 2;
  ctx.strokeRect(-16, 30, 32, 10);

  // 兩隻晃動的粉紅章魚小觸手
  const tentacleWave = Math.sin(time * 7) * 4;
  ctx.strokeStyle = '#ff6b8b';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-8, 36);
  ctx.quadraticCurveTo(-14, 43 + tentacleWave, -18, 39);
  ctx.moveTo(8, 36);
  ctx.quadraticCurveTo(14, 43 - tentacleWave, 18, 39);
  ctx.stroke();

  // 巨型章魚燒球型氣囊本體
  const doughFill = hitFlash > 0 ? '#ffffff' : '#e09f5a';
  drawPixelOval(ctx, 0, 0, 38, 30, doughFill, '#6b3e19', 3);

  // 頂部濃郁章魚燒醬汁帽
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, 36, 28, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = hitFlash > 0 ? '#ffe5d9' : '#582f24';
  ctx.beginPath();
  ctx.moveTo(-40, -32);
  ctx.lineTo(40, -32);
  ctx.lineTo(40, -6);
  ctx.quadraticCurveTo(26, 2, 16, -8);
  ctx.quadraticCurveTo(6, 4, -6, -8);
  ctx.quadraticCurveTo(-20, 2, -40, -8);
  ctx.closePath();
  ctx.fill();

  // 奶白美乃滋波浪條紋
  ctx.strokeStyle = '#fff8dc';
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-26, -18);
  ctx.lineTo(-14, -10);
  ctx.lineTo(-2, -20);
  ctx.lineTo(10, -10);
  ctx.lineTo(22, -19);
  ctx.lineTo(30, -11);
  ctx.stroke();

  // 海苔粉小點點
  pxRect(ctx, -18, -12, 3, 3, '#4f9d69');
  pxRect(ctx, -2, -13, 3, 3, '#4f9d69');
  pxRect(ctx, 14, -14, 3, 3, '#4f9d69');
  pxRect(ctx, 4, -7, 3, 3, '#4f9d69');
  ctx.restore();

  // 頂部隨風飄動柴魚片（熱舞感）
  const bonitoSway = Math.sin(time * 10) * 4;
  ctx.fillStyle = '#f2b880';
  ctx.strokeStyle = '#8c5327';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-6, -28);
  ctx.quadraticCurveTo(-14 + bonitoSway, -42, -2 + bonitoSway, -40);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(6, -28);
  ctx.quadraticCurveTo(16 - bonitoSway, -43, 4 - bonitoSway, -39);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 飛船舷窗眼睛與發光探照燈
  drawPixelOval(ctx, 14, 5, 7, 7, charging ? '#ffd166' : '#9bf6ff', '#3a221c', 2.2);
  pxRect(ctx, 11, 2, 3, 3, '#ffffff');
  drawPixelOval(ctx, -4, 6, 5.5, 5.5, charging ? '#ffd166' : '#9bf6ff', '#3a221c', 2);
  pxRect(ctx, -6, 3.5, 2.5, 2.5, '#ffffff');
  // 圓腮紅
  ctx.fillStyle = 'rgba(255, 130, 160, 0.55)';
  pxRect(ctx, 20, 12, 7, 4);
  pxRect(ctx, -14, 12, 6, 4);

  ctx.restore();
}

function drawBossDaruma(ctx, time, facing, hitFlash, charging) {
  const b = getBounceTransform(time, true, 1, charging ? 13 : 6.5, charging ? 8 : 5);
  drawShadow(ctx, 0, 39, 40, 13, 0.36);

  ctx.save();
  ctx.translate(0, b.offsetY);
  ctx.scale((facing < 0 ? -1 : 1) * b.scaleX, b.scaleY);

  // 背部緩慢旋轉招財金光輪
  ctx.save();
  ctx.rotate(time * 1.1);
  ctx.strokeStyle = 'rgba(255, 209, 102, 0.48)';
  ctx.lineWidth = 2.5;
  ctx.setLineDash([7, 7]);
  ctx.beginPath();
  ctx.arc(0, -2, 46, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // 巨型朱紅圓胖達摩身軀
  const redFill = hitFlash > 0 ? '#ffffff' : '#e63946';
  drawPixelOval(ctx, 0, 2, 36, 37, redFill, '#591119', 3);

  // 兩側金色吉祥紋飾
  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(-25, 10, 8, -1.2, 1.2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(25, 10, 8, Math.PI - 1.2, Math.PI + 1.2);
  ctx.stroke();

  // 米白色開運臉盤
  drawPixelOval(ctx, 0, -10, 23, 15, '#fff6e5', '#6b1d25', 2.2);

  // 粗黑鶴眉與鬍鬚紋
  ctx.strokeStyle = '#1f1a24';
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-16, -15);
  ctx.quadraticCurveTo(-9, -22, -3, -15);
  ctx.moveTo(3, -15);
  ctx.quadraticCurveTo(9, -22, 16, -15);
  ctx.stroke();

  // 炯炯有神的圓眼（蓄力時閃耀金光）
  drawPixelOval(ctx, -9, -10, 5, 5, '#ffffff', '#1f1a24', 1.8);
  drawPixelOval(ctx, 9, -10, 5, 5, '#ffffff', '#1f1a24', 1.8);
  drawPixelOval(ctx, -8.5, -10, 2.8, 2.8, charging ? '#ffb703' : '#1f1a24');
  drawPixelOval(ctx, 8.5, -10, 2.8, 2.8, charging ? '#ffb703' : '#1f1a24');
  pxRect(ctx, -10, -12, 1.8, 1.8, '#ffffff');
  pxRect(ctx, 7, -12, 1.8, 1.8, '#ffffff');

  // 達摩八字小鬍子與微笑
  ctx.strokeStyle = '#1f1a24';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(-12, -2);
  ctx.quadraticCurveTo(0, -6, 12, -2);
  ctx.stroke();
  pxRect(ctx, -18, -8, 4, 3, '#ff9ebb');
  pxRect(ctx, 14, -8, 4, 3, '#ff9ebb');

  // 肚皮金色招財大銅錢徽章
  drawPixelOval(ctx, 0, 20, 14, 13, '#ffd166', '#9e6200', 2.2);
  pxRect(ctx, -4, 16, 8, 8, '#b5172a');
  ctx.strokeStyle = '#9e6200';
  ctx.lineWidth = 1.6;
  ctx.strokeRect(-4, 16, 8, 8);

  // 頭頂小金星
  drawPixelStar(ctx, 0, -32, 5, '#ffd166', '#ffffff');

  ctx.restore();
}

// ---------------------------------------------------------------------------
// 4. 星塵寶石、3 種場地驚喜道具、Boss 攻擊地面預警光圈
// ---------------------------------------------------------------------------

export function drawGem(ctx, gem, time = 0) {
  if (!gem) {
    return;
  }
  const x = gem.x || 0;
  const y = gem.y || 0;
  const seed = gem.animSeed || (x * 0.1 + y * 0.1);
  const value = gem.value || 1;
  const tier = gem.tier || (value >= 10 ? 3 : value >= 4 ? 2 : 1);

  const bob = Math.sin(time * 5.2 + seed) * 2.2;
  const pulse = 0.72 + 0.28 * Math.sin(time * 6.5 + seed);

  const palette =
    tier === 3
      ? { main: '#ff9ebb', glow: '#ff9ebb', size: 8.5 }
      : tier === 2
        ? { main: '#9bf6ff', glow: '#9bf6ff', size: 6.8 }
        : { main: '#ffd166', glow: '#ffd166', size: 5.4 };

  ctx.save();
  ctx.translate(x, y + bob);

  drawSoftGlow(ctx, 0, 0, palette.size * 2.3, palette.glow, 0.45 * pulse);
  drawPixelStar(ctx, 0, 0, palette.size, palette.main, '#ffffff');

  if (tier >= 2) {
    const orbit = time * 3 + seed;
    pxRect(
      ctx,
      Math.cos(orbit) * (palette.size + 3) - 1,
      Math.sin(orbit) * (palette.size + 3) - 1,
      2,
      2,
      '#ffffff'
    );
  }

  ctx.restore();
}

export function drawPickup(ctx, pickup, time = 0) {
  if (!pickup) {
    return;
  }
  const type = pickup.type || 'magnet';
  const x = pickup.x || 0;
  const y = pickup.y || 0;
  const bob = Math.sin(time * 4.5 + x * 0.05) * 3.5;
  const ringPulse = 0.5 + 0.5 * Math.sin(time * 5);

  const beaconColor =
    type === 'magnet'
      ? '#9bf6ff'
      : type === 'fish_soup' || type === 'soup'
        ? '#ffd166'
        : '#ff9ebb';

  ctx.save();
  ctx.translate(x, y);

  // 地面驚喜道具光環提示
  drawSoftGlow(ctx, 0, 2, 26 + ringPulse * 5, beaconColor, 0.45);
  ctx.strokeStyle = hexToRgba(beaconColor, 0.55 + ringPulse * 0.35);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 12, 14 + ringPulse * 3, 6 + ringPulse * 1.2, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.translate(0, bob);

  if (type === 'magnet') {
    // 道具 1：大磁鐵（全圖吸星塵）
    // 磁力波紋
    const wave = (time * 1.8) % 1;
    ctx.strokeStyle = hexToRgba('#9bf6ff', (1 - wave) * 0.75);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -1, 10 + wave * 12, 0, Math.PI * 2);
    ctx.stroke();

    // U 型紅銀像素磁鐵
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#381828';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(0, 1, 9, Math.PI, 0, false);
    ctx.moveTo(-9, 1);
    ctx.lineTo(-9, 10);
    ctx.moveTo(9, 1);
    ctx.lineTo(9, 10);
    ctx.stroke();

    ctx.strokeStyle = '#ef476f';
    ctx.lineWidth = 6.5;
    ctx.beginPath();
    ctx.arc(0, 1, 9, Math.PI, 0, false);
    ctx.moveTo(-9, 1);
    ctx.lineTo(-9, 7);
    ctx.moveTo(9, 1);
    ctx.lineTo(9, 7);
    ctx.stroke();

    // 磁鐵銀白極端
    pxRect(ctx, -12.5, 5, 7, 5, '#edf2f4');
    pxRect(ctx, 5.5, 5, 7, 5, '#edf2f4');
    pxRect(ctx, -12.5, 5, 7, 2, '#9bf6ff');
    pxRect(ctx, 5.5, 5, 7, 2, '#9bf6ff');
  } else if (type === 'fish_soup' || type === 'soup') {
    // 道具 2：暖呼呼魚湯（回復生命）
    // 飄升像素熱氣
    for (let i = -1; i <= 1; i++) {
      const sy = -((time * 16 + (i + 1) * 6) % 14);
      const sa = Math.max(0, 1 - Math.abs(sy) / 14) * 0.8;
      ctx.fillStyle = `rgba(255, 255, 255, ${sa})`;
      pxRect(ctx, i * 5 - 1 + Math.sin(time * 5 + i) * 1.5, -8 + sy, 2.5, 4);
    }

    // 湯碗本體
    ctx.fillStyle = '#5c374c';
    ctx.strokeStyle = '#2b1925';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 1, 13, 0, Math.PI, false);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // 碗底腳座與金線
    pxRect(ctx, -6, 12, 12, 3, '#3d2232');
    pxRect(ctx, -10, 5, 20, 2, '#ffd166');

    // 金黃魚湯液面
    drawPixelOval(ctx, 0, 1, 12.5, 4.5, '#ffe599', '#2b1925', 1.8);
    // 湯中小魚尾與粉紅魚板
    drawPixelOval(ctx, -3, 0.5, 4.5, 2.5, '#ff9ebb');
    pxRect(ctx, 2, -2, 5, 3, '#f4a261');
    pxRect(ctx, 6, -4, 3, 5, '#e76f51');
  } else {
    // 道具 3：祈願鈴鐺（wish_bell / bell：清場星波或全體安撫強化）
    const swing = Math.sin(time * 6.5) * 0.18;
    ctx.save();
    ctx.rotate(swing);

    // 紅色祈願結繩
    pxRect(ctx, -6, -12, 12, 4, '#ef476f');
    pxRect(ctx, -8, -10, 4, 4, '#d90429');
    pxRect(ctx, 4, -10, 4, 4, '#d90429');

    // 金色鈴鐺球體
    drawPixelOval(ctx, 0, 1, 11, 10.5, '#ffd166', '#8a5a00', 2);
    // 鈴鐺高光
    pxRect(ctx, -5, -5, 4, 3, '#fff9db');
    // 鈴鐺下緣溝槽與小孔
    ctx.strokeStyle = '#8a5a00';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-7, 4);
    ctx.lineTo(7, 4);
    ctx.stroke();
    drawPixelOval(ctx, 0, 4, 2.5, 2.5, '#5c3a00');

    // 底部流蘇小星
    pxRect(ctx, -1.5, 11, 3, 5, '#ef476f');
    ctx.restore();

    drawPixelStar(ctx, 11, -10, 3.2, '#fff3b0', '#ffffff');
  }

  ctx.restore();
}

export function drawBossWarning(ctx, warning, time = 0) {
  if (!warning) {
    return;
  }
  const x = warning.x || 0;
  const y = warning.y || 0;
  const radius = Math.max(12, warning.radius || 70);
  const progress = Math.max(0, Math.min(1, warning.progress ?? 0));
  const color = warning.color || '#ff6b8b';
  const shape = warning.shape || 'circle';

  const urgency = progress > 0.72 ? 18 : 8;
  const pulse = 0.65 + 0.35 * Math.sin(time * urgency);

  ctx.save();

  if (shape === 'line') {
    // 直線衝鋒 / 光束預警帶
    const angle = warning.angle || 0;
    const length = warning.length || 260;
    const width = warning.width || 56;

    ctx.translate(x, y);
    ctx.rotate(angle);

    ctx.fillStyle = hexToRgba(color, 0.14 + progress * 0.14);
    ctx.fillRect(0, -width / 2, length, width);

    // 充能推進條
    ctx.fillStyle = hexToRgba(color, 0.28 + progress * 0.22);
    ctx.fillRect(0, -width / 2, length * progress, width);

    ctx.strokeStyle = hexToRgba('#ffd166', 0.65 + pulse * 0.35);
    ctx.lineWidth = 2.5;
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -time * 40;
    ctx.strokeRect(0, -width / 2, length, width);
    ctx.setLineDash([]);

    ctx.restore();
    return;
  }

  ctx.translate(x, y);

  if (shape === 'ring') {
    // 環狀震盪波預警光圈
    const innerR = warning.innerRadius || radius * 0.55;
    const fillR = innerR + (radius - innerR) * progress;

    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.arc(0, 0, innerR, 0, Math.PI * 2, true);
    ctx.fillStyle = hexToRgba(color, 0.18 + progress * 0.16);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, 0, fillR, 0, Math.PI * 2);
    ctx.strokeStyle = hexToRgba('#ffd166', 0.7 + pulse * 0.3);
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.strokeStyle = hexToRgba(color, 0.85);
    ctx.lineWidth = 2.5;
    ctx.setLineDash([8, 6]);
    ctx.lineDashOffset = -time * 28;
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
    return;
  }

  // 預設圓形範圍落地預警光圈
  drawSoftGlow(ctx, 0, 0, radius * 1.15, color, 0.22 + progress * 0.22);

  // 底層警戒區
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = hexToRgba(color, 0.14 + progress * 0.14);
  ctx.fill();

  // 隨倒數由內向外擴張的充能光盤
  const innerRadius = Math.max(4, radius * progress);
  ctx.beginPath();
  ctx.arc(0, 0, innerRadius, 0, Math.PI * 2);
  ctx.fillStyle = hexToRgba(color, 0.22 + progress * 0.24);
  ctx.fill();
  ctx.strokeStyle = hexToRgba('#ffd166', 0.75 + pulse * 0.25);
  ctx.lineWidth = 2.2;
  ctx.stroke();

  // 外框旋轉虛線光圈
  ctx.save();
  ctx.rotate(time * (1.2 + progress * 1.8));
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.strokeStyle = hexToRgba(color, 0.7 + pulse * 0.3);
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 8]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // 中心星芒驚嘆提示
  const markScale = 0.85 + pulse * 0.25;
  ctx.save();
  ctx.scale(markScale, markScale);
  drawPixelStar(ctx, 0, 0, 6, '#ffd166', '#ffffff');
  pxRect(ctx, -1.5, -13, 3, 8, '#ffffff');
  pxRect(ctx, -1.5, -3, 3, 3, '#ffffff');
  ctx.restore();

  ctx.restore();
}
