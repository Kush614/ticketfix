// The robot cell: a gantry with a gripper, a conveyor that feeds parts, a bin, and simple gravity.
// The robot's program lives in controller.js; this file is the "physical" cell it drives.
import { createController, CELL, PX_PER_MM } from './controller.js';

const PARTS = 3;
const W = 900, H = 440;
const RAIL_Y = 40, FLOOR_Y = 400, BELT_Y = 330, BELT_X0 = 30, BELT_X1 = 300;
const BIN = { x0: 598, x1: 698, top: 300 };      // the bin, in pixels: centre 648 px = 540 mm
const BOX = 40, ARM_SPEED = 520, BELT_SPEED = 160, G = 1800;

const canvas = document.getElementById('cell');
const ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);

const arm = { x: CELL.PICK_X_MM * PX_PER_MM, y: CELL.HOME_Y_MM * PX_PER_MM, closed: false, held: null };
const parts = [];
let spawned = 0, inBin = 0, dropped = 0, done = false, state = '';
const step = createController();

function spawn() { parts.push({ x: BELT_X0 + BOX / 2, y: BELT_Y - BOX / 2, mode: 'belt', vy: 0 }); spawned++; }
spawn();

const io = {
  get partReady() { return parts.some(p => p.mode === 'ready'); },
  moveTo(x, y) {
    const dx = x - arm.x, dy = y - arm.y, d = Math.hypot(dx, dy), s = ARM_SPEED * io.dt;
    if (d <= s) { arm.x = x; arm.y = y; return true; }
    arm.x += dx / d * s; arm.y += dy / d * s;
    return false;
  },
  grip(close) {
    arm.closed = close;
    if (close) {
      const p = parts.find(p => p.mode === 'ready' && Math.abs(p.x - arm.x) < 15 && Math.abs(p.y - BOX / 2 - arm.y) < 8);
      if (p) { p.mode = 'held'; arm.held = p; }
    } else if (arm.held) {
      const p = arm.held; arm.held = null;
      const lands = p.x > BIN.x0 + BOX / 2 - 4 && p.x < BIN.x1 - BOX / 2 + 4;
      p.mode = 'falling'; p.vy = 0;
      p.restY = lands ? FLOOR_Y - BOX / 2 - inBinStack() * BOX : FLOOR_Y - BOX / 2;
      p.into = lands ? 'bin' : 'floor';
      if (spawned < PARTS) spawn();
    }
  },
};
const inBinStack = () => parts.filter(p => p.into === 'bin').length;

function update(dt) {
  io.dt = dt;
  for (const p of parts) {
    if (p.mode === 'belt') { p.x = Math.min(p.x + BELT_SPEED * dt, CELL.PICK_X_MM * PX_PER_MM); if (p.x >= CELL.PICK_X_MM * PX_PER_MM) p.mode = 'ready'; }
    if (p.mode === 'held') { p.x = arm.x; p.y = arm.y + BOX / 2; }
    if (p.mode === 'falling') {
      p.vy += G * dt; p.y += p.vy * dt;
      if (p.y >= p.restY) {
        p.y = p.restY; p.mode = p.into;
        if (p.into === 'bin') inBin++; else dropped++;
        if (inBin + dropped === PARTS) done = true;
      }
    }
  }
  if (!done) state = step(io, dt);
}

function draw() {
  ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1e293b'; ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);
  // rail + carriage
  ctx.fillStyle = '#475569'; ctx.fillRect(10, RAIL_Y - 8, W - 20, 10);
  ctx.fillStyle = '#f59e0b'; ctx.fillRect(arm.x - 26, RAIL_Y - 14, 52, 22);
  ctx.fillStyle = '#94a3b8'; ctx.fillRect(arm.x - 3, RAIL_Y + 8, 6, arm.y - RAIL_Y - 8);
  // gripper fingers
  const open = arm.closed ? BOX / 2 + 3 : BOX / 2 + 14;
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(arm.x - open - 6, arm.y - 6, open * 2 + 12, 8);
  ctx.fillRect(arm.x - open - 6, arm.y - 6, 6, 28);
  ctx.fillRect(arm.x + open, arm.y - 6, 6, 28);
  // conveyor
  ctx.fillStyle = '#334155'; ctx.fillRect(BELT_X0, BELT_Y, BELT_X1 - BELT_X0, 14);
  ctx.fillStyle = '#64748b'; ctx.fillRect(BELT_X0 + 20, BELT_Y + 14, 10, FLOOR_Y - BELT_Y - 14); ctx.fillRect(BELT_X1 - 30, BELT_Y + 14, 10, FLOOR_Y - BELT_Y - 14);
  // bin
  ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(BIN.x0, BIN.top); ctx.lineTo(BIN.x0, FLOOR_Y); ctx.lineTo(BIN.x1, FLOOR_Y); ctx.lineTo(BIN.x1, BIN.top); ctx.stroke();
  ctx.fillStyle = '#86efac'; ctx.font = '14px system-ui'; ctx.textAlign = 'center';
  ctx.fillText(`BIN @ ${CELL.BIN_X_MM} mm`, (BIN.x0 + BIN.x1) / 2, BIN.top - 12);
  // parts
  for (const p of parts) {
    ctx.fillStyle = p.mode === 'floor' ? '#ef4444' : '#a16207';
    ctx.fillRect(p.x - BOX / 2, p.y - BOX / 2, BOX, BOX);
    ctx.strokeStyle = '#facc15'; ctx.lineWidth = 2; ctx.strokeRect(p.x - BOX / 2 + 4, p.y - BOX / 2 + 4, BOX - 8, BOX - 8);
    if (p.mode === 'floor') { ctx.fillStyle = '#fca5a5'; ctx.font = 'bold 14px system-ui'; ctx.fillText('DROPPED', p.x, FLOOR_Y + 24); }
  }
  // readout
  ctx.textAlign = 'left'; ctx.fillStyle = '#e2e8f0'; ctx.font = '14px ui-monospace, monospace';
  ctx.fillText(`gantry x = ${Math.round(arm.x / PX_PER_MM)} mm   state = ${done ? 'DONE' : state}`, 16, 24);
  $('in-bin').textContent = inBin; $('dropped').textContent = dropped;
  $('status').textContent = done ? 'Done' : 'Running';
}

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 1 / 30); last = now;
  update(dt); draw();
  requestAnimationFrame(frame);
}
draw();
requestAnimationFrame(frame);
