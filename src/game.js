'use strict';
/* =========================================================================
   绿茵王朝 · GRASSROOTS DYNASTY
   离线单文件足球俱乐部经营游戏
   ========================================================================= */

/* -------------------------------------------------------------------------
   0. 基础工具
   ------------------------------------------------------------------------- */
const APP_VERSION = '1.3.11';
const SAVE_VERSION = 1;
const SAVE_KEY = 'gdynasty_save_v1';
const TEST_MODE_KEY = 'gdynasty_test_mode_v1';
const USER_CLUB_ID = 1;
const SQUAD_LIMIT = 26;
const BENCH_SIZE = 7;
const MAX_SUBS = 5;
// v1.2.0：只保留进攻方在对方禁区内的头球攻门；防守解围、摆渡、门将开球和普通高球不再头球。
const HEADER_SHOTS_ONLY = true;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const lerp = (a, b, t) => a + (b - a) * t;
const round = (n, p = 0) => { const m = Math.pow(10, p); return Math.round(n * m) / m; };
const sum = arr => arr.reduce((a, b) => a + b, 0);
const avg = arr => arr.length ? sum(arr) / arr.length : 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function fmtMoney(n, opts = {}) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  n = Number(n);
  const sign = n < 0 ? '-' : (opts.plus && n > 0 ? '+' : '');
  const a = Math.abs(n);
  let s;
  if (a >= 1e8) s = `¥${(a / 1e8).toFixed(a >= 1e9 ? 1 : 2)}亿`;
  else if (a >= 1e4) s = `¥${(a / 1e4).toFixed(a >= 1e6 ? 0 : 1)}万`;
  else s = `¥${Math.round(a).toLocaleString('zh-CN')}`;
  return sign + s;
}
function fmtWage(n) { return `${fmtMoney(n)}/周`; }
function fmtPlain(n) { return Number(n || 0).toLocaleString('zh-CN'); }
function fmtStat(n, p = 1) { return Number(n || 0).toFixed(p); }
function pct(n) { return `${Math.round(n)}%`; }
function fmtDateCN(d) { return `${d.getMonth() + 1}月${d.getDate()}日`; }
function dayName(i) { return ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][i] || ''; }
function dateForWeek(week, day = 5) {
  if (!G?.season?.startISO) return new Date();
  const [y, m, d] = G.season.startISO.split('-').map(Number);
  const base = new Date(y, m - 1, d);
  base.setDate(base.getDate() + (week - 1) * 7 + day);
  return base;
}
function fixtureDateText(fx) { try { return fmtDateCN(dateForWeek(fx.round, 5)); } catch { return ''; } }
function currentDate() { return dateForWeek(G?.season?.week || 1, G?.season?.day || 0); }
function nowISO() { return new Date().toISOString(); }
function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function weightedPick(items, weightFn) {
  let total = 0;
  for (const it of items) total += Math.max(0, weightFn(it));
  let r = rand() * total;
  for (const it of items) {
    r -= Math.max(0, weightFn(it));
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}
function normal(mean = 0, sd = 1) {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function clampRound(n, lo, hi) { return Math.round(clamp(n, lo, hi)); }
function initials(name) { return String(name || '').replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '').slice(0, 2).toUpperCase(); }
function sortBy(arr, fn, dir = 1) { return arr.slice().sort((a, b) => (fn(a) - fn(b)) * dir); }
function debounce(fn, ms = 250) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; }

function toast(title, body = '', type = '') {
  const root = $('#toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<strong>${esc(title)}</strong>${body ? `<span>${esc(body)}</span>` : ''}`;
  root.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0';
    el.style.transform = 'translateX(10px)';
    setTimeout(() => el.remove(), 320);
  }, 4200);
}

function secureRandomBytes(len) { const b = new Uint8Array(len); crypto.getRandomValues(b); return b; }
function bufToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(bin);
}
function base64ToBuf(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/* -------------------------------------------------------------------------
   1. 随机数
   ------------------------------------------------------------------------- */
let G = null;
let _rngState = 0x9e3779b9;
let FRIENDLY_ACTIVE = false;
let FRIENDLY = null;
function setRngSeed(seed) { _rngState = (seed >>> 0) || 1; if (G) G.rngState = _rngState; }
function rand() {
  let t = _rngState += 0x6D2B79F5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  if (G) G.rngState = _rngState;
  return r;
}
function randInt(lo, hi) { return Math.floor(rand() * (hi - lo + 1)) + lo; }
function chance(p) { return rand() < p; }

/* -------------------------------------------------------------------------
   2. 游戏常量
   ------------------------------------------------------------------------- */
const ATTRIBUTES = [
  { key: 'sho', label: '射门', short: '射' }, { key: 'pas', label: '传球', short: '传' },
  { key: 'dri', label: '运球', short: '运' }, { key: 'spd', label: '速度', short: '速' },
  { key: 'str', label: '力量', short: '力' }, { key: 'tac', label: '抢断', short: '抢' },
  { key: 'def', label: '防守', short: '防' }, { key: 'gk', label: '守门', short: '门' },
  { key: 'sta', label: '耐力', short: '耐' }, { key: 'phy', label: '身体素质', short: '身' },
  { key: 'vis', label: '视野', short: '视' },
];
const ATTR_KEYS = ATTRIBUTES.map(a => a.key);
const ATTR_LABELS = Object.fromEntries(ATTRIBUTES.map(a => [a.key, a.label]));
const POSITIONS = ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'LM', 'RM', 'AM', 'LW', 'RW', 'ST', 'SS'];
const POS_CN = { GK: '门将', CB: '中后卫', LB: '左后卫', RB: '右后卫', DM: '后腰', CM: '中场', LM: '左前卫', RM: '右前卫', AM: '前腰', LW: '左边锋', RW: '右边锋', ST: '中锋', SS: '影锋', WB: '翼卫' };
const POS_GROUP = { GK: 'GK', CB: 'DF', LB: 'DF', RB: 'DF', WB: 'DF', DM: 'MF', CM: 'MF', LM: 'MF', RM: 'MF', AM: 'MF', LW: 'FW', RW: 'FW', ST: 'FW', SS: 'FW' };

const ROLE_WEIGHTS = {
  GK: { gk: 64, def: 8, pas: 8, vis: 5, str: 8, spd: 7 },
  CB: { def: 27, tac: 24, str: 18, spd: 10, pas: 9, dri: 5, vis: 7 },
  LB: { spd: 20, def: 18, tac: 17, pas: 15, dri: 12, vis: 8, str: 6, sho: 4 },
  RB: { spd: 20, def: 18, tac: 17, pas: 15, dri: 12, vis: 8, str: 6, sho: 4 },
  WB: { spd: 24, def: 16, tac: 15, pas: 16, dri: 12, vis: 8, str: 5, sho: 4 },
  DM: { tac: 25, def: 19, pas: 20, vis: 14, str: 10, dri: 7, spd: 5 },
  CM: { pas: 24, vis: 20, dri: 14, tac: 10, def: 8, sho: 8, spd: 9, str: 5, gk: 2 },
  LM: { spd: 20, dri: 18, pas: 18, vis: 13, def: 8, tac: 8, sho: 8, str: 5, gk: 2 },
  RM: { spd: 20, dri: 18, pas: 18, vis: 13, def: 8, tac: 8, sho: 8, str: 5, gk: 2 },
  AM: { pas: 21, vis: 19, dri: 20, sho: 14, spd: 11, str: 5, tac: 4, def: 3, gk: 2 },
  LW: { dri: 22, spd: 23, pas: 14, sho: 14, vis: 12, str: 4, def: 3, tac: 3, gk: 2 },
  RW: { dri: 22, spd: 23, pas: 14, sho: 14, vis: 12, str: 4, def: 3, tac: 3, gk: 2 },
  ST: { sho: 33, spd: 18, str: 15, dri: 13, pas: 8, vis: 6, tac: 2, def: 2, gk: 2 },
  SS: { sho: 25, dri: 18, pas: 15, vis: 14, spd: 14, str: 7, tac: 3, def: 3, gk: 2 },
};

const FORMATION_SLOTS = {
  '4-4-2': [
    { pos: 'GK', x: .045, y: .50 }, { pos: 'LB', x: .18, y: .16 }, { pos: 'CB', x: .145, y: .38 },
    { pos: 'CB', x: .145, y: .62 }, { pos: 'RB', x: .18, y: .84 }, { pos: 'LM', x: .37, y: .12 },
    { pos: 'CM', x: .34, y: .38 }, { pos: 'CM', x: .34, y: .62 }, { pos: 'RM', x: .37, y: .88 },
    { pos: 'ST', x: .55, y: .38 }, { pos: 'ST', x: .55, y: .62 },
  ],
  '4-3-3': [
    { pos: 'GK', x: .045, y: .50 }, { pos: 'LB', x: .18, y: .16 }, { pos: 'CB', x: .145, y: .38 },
    { pos: 'CB', x: .145, y: .62 }, { pos: 'RB', x: .18, y: .84 }, { pos: 'CM', x: .32, y: .30 },
    { pos: 'CM', x: .31, y: .50 }, { pos: 'CM', x: .32, y: .70 }, { pos: 'LW', x: .50, y: .15 },
    { pos: 'ST', x: .56, y: .50 }, { pos: 'RW', x: .50, y: .85 },
  ],
  '4-2-3-1': [
    { pos: 'GK', x: .045, y: .50 }, { pos: 'LB', x: .18, y: .16 }, { pos: 'CB', x: .145, y: .38 },
    { pos: 'CB', x: .145, y: .62 }, { pos: 'RB', x: .18, y: .84 }, { pos: 'DM', x: .29, y: .40 },
    { pos: 'DM', x: .29, y: .60 }, { pos: 'LW', x: .44, y: .15 }, { pos: 'AM', x: .43, y: .50 },
    { pos: 'RW', x: .44, y: .85 }, { pos: 'ST', x: .56, y: .50 },
  ],
  '4-1-4-1': [
    { pos: 'GK', x: .045, y: .50 }, { pos: 'LB', x: .18, y: .16 }, { pos: 'CB', x: .145, y: .38 },
    { pos: 'CB', x: .145, y: .62 }, { pos: 'RB', x: .18, y: .84 }, { pos: 'DM', x: .29, y: .50 },
    { pos: 'LM', x: .42, y: .12 }, { pos: 'CM', x: .38, y: .38 }, { pos: 'CM', x: .38, y: .62 },
    { pos: 'RM', x: .42, y: .88 }, { pos: 'ST', x: .56, y: .50 },
  ],
  '4-4-1-1': [
    { pos: 'GK', x: .045, y: .50 }, { pos: 'LB', x: .18, y: .16 }, { pos: 'CB', x: .145, y: .38 },
    { pos: 'CB', x: .145, y: .62 }, { pos: 'RB', x: .18, y: .84 }, { pos: 'LM', x: .37, y: .13 },
    { pos: 'CM', x: .33, y: .38 }, { pos: 'CM', x: .33, y: .62 }, { pos: 'RM', x: .37, y: .87 },
    { pos: 'SS', x: .47, y: .50 }, { pos: 'ST', x: .56, y: .50 },
  ],
  '3-5-2': [
    { pos: 'GK', x: .045, y: .50 }, { pos: 'CB', x: .145, y: .28 }, { pos: 'CB', x: .135, y: .50 },
    { pos: 'CB', x: .145, y: .72 }, { pos: 'LB', x: .30, y: .08 }, { pos: 'CM', x: .33, y: .32 },
    { pos: 'DM', x: .30, y: .50 }, { pos: 'CM', x: .33, y: .68 }, { pos: 'RB', x: .30, y: .92 },
    { pos: 'ST', x: .55, y: .40 }, { pos: 'ST', x: .55, y: .60 },
  ],
  '5-3-2': [
    { pos: 'GK', x: .045, y: .50 }, { pos: 'LB', x: .22, y: .08 }, { pos: 'CB', x: .145, y: .28 },
    { pos: 'CB', x: .135, y: .50 }, { pos: 'CB', x: .145, y: .72 }, { pos: 'RB', x: .22, y: .92 },
    { pos: 'CM', x: .34, y: .30 }, { pos: 'CM', x: .32, y: .50 }, { pos: 'CM', x: .34, y: .70 },
    { pos: 'ST', x: .54, y: .40 }, { pos: 'ST', x: .54, y: .60 },
  ],
  '3-4-3': [
    { pos: 'GK', x: .045, y: .50 }, { pos: 'CB', x: .14, y: .30 }, { pos: 'CB', x: .13, y: .50 },
    { pos: 'CB', x: .14, y: .70 }, { pos: 'LM', x: .33, y: .10 }, { pos: 'CM', x: .31, y: .40 },
    { pos: 'CM', x: .31, y: .60 }, { pos: 'RM', x: .33, y: .90 }, { pos: 'LW', x: .49, y: .18 },
    { pos: 'ST', x: .56, y: .50 }, { pos: 'RW', x: .49, y: .82 },
  ],
};
const FORMATIONS = Object.keys(FORMATION_SLOTS);

const ATTACK_STYLES = {
  balanced: { name: '均衡进攻', desc: '不追求单一套路，根据场上情况选择。', icon: '衡' },
  possession: { name: '控球渗透', desc: '耐心传递，压缩对手空间；怕高位逼抢。', icon: '控' },
  counter: { name: '快速反击', desc: '主动让出球权，断球后直插身后；克制高位逼抢。', icon: '反' },
  wing: { name: '边路传中', desc: '拉开宽度，从两翼输送传中；克制低位防守。', icon: '边' },
  longball: { name: '长传冲吊', desc: '越过中场，直接找前锋；消耗较低，失误率偏高。', icon: '长' },
};
const DEFENSE_STYLES = {
  press: { name: '高位逼抢', desc: '前场压迫、就地反抢；体力消耗大，身后空当明显。', icon: '压' },
  low: { name: '低位防守', desc: '收缩禁区、保护中路；让出球权，反击距离更长。', icon: '收' },
  balanced: { name: '均衡防守', desc: '中位防线，兼顾压迫与保护。', icon: '衡' },
};
const TEMPO_STYLES = {
  slow: { name: '慢节奏', desc: '降低往返，减少体能消耗与失误。', icon: '慢' },
  normal: { name: '中节奏', desc: '根据比赛局势自然调节。', icon: '中' },
  fast: { name: '快节奏', desc: '更快出球、更多前插；机会与失误同时增加。', icon: '快' },
};

const TIERS = {
  1: {
    name: '超级联赛', short: '超', label: '第一级别', base: 79, ticket: 180, difficulty: 10,
    tv: 1200000, sponsor: [420000, 620000, 850000], fanbase: [60000, 190000],
    capacity: [22000, 65000], prize: [50000000, 32000000, 22000000, 15000000, 11000000, 9000000, 7500000, 6200000, 5200000, 4300000, 3600000, 3000000],
    win: 900000, draw: 300000, promotionBonus: 0, relegationParachute: 9000000,
  },
  2: {
    name: '甲级联赛', short: '甲', label: '第二级别', base: 69, ticket: 120, difficulty: 8,
    tv: 250000, sponsor: [120000, 180000, 260000], fanbase: [22000, 62000],
    capacity: [12000, 38000], prize: [15000000, 10000000, 7000000, 5000000, 3800000, 3000000, 2500000, 2100000, 1800000, 1500000, 1200000, 1000000],
    win: 280000, draw: 90000, promotionBonus: 35000000, relegationParachute: 2500000,
  },
  3: {
    name: '乙级联赛', short: '乙', label: '第三级别', base: 59, ticket: 80, difficulty: 6,
    tv: 60000, sponsor: [38000, 62000, 90000], fanbase: [9000, 26000],
    capacity: [6500, 19000], prize: [5000000, 3400000, 2300000, 1700000, 1300000, 1000000, 850000, 700000, 580000, 480000, 400000, 330000],
    win: 90000, draw: 30000, promotionBonus: 10000000, relegationParachute: 700000,
  },
  4: {
    name: '丙级联赛', short: '丙', label: '第四级别', base: 49, ticket: 50, difficulty: 4,
    tv: 15000, sponsor: [12000, 20000, 30000], fanbase: [3000, 9000],
    capacity: [3500, 11000], prize: [1500000, 950000, 650000, 460000, 360000, 290000, 240000, 200000, 165000, 135000, 110000, 90000],
    win: 26000, draw: 9000, promotionBonus: 2500000, relegationParachute: 200000,
  },
  5: {
    name: '城市联赛', short: '城', label: '第五级别', base: 35, ticket: 30, difficulty: 2,
    tv: 5000, sponsor: [6000, 10000, 15000], fanbase: [700, 2400],
    capacity: [1800, 6500], prize: [400000, 270000, 190000, 140000, 110000, 90000, 72000, 60000, 48000, 38000, 28000, 22000],
    win: 12000, draw: 4000, promotionBonus: 600000, relegationParachute: 0,
  },
};
const TIER_NAME = t => TIERS[t]?.name || '未知级别';
const TIER_LABEL = t => `第${['', '一', '二', '三', '四', '五'][t] || t}级别 · ${TIER_NAME(t)}`;
const TIER_DIFFICULTY = t => TIERS[t]?.difficulty ?? 0;
const TIER_DIFFICULTY_LABEL = t => `+${TIER_DIFFICULTY(t)}%`;
// 联赛强度 = 高级别联赛 AI 的执行力加成（百分比，直接加在 AI 球员的场上属性/判定上）。
// v1.3.11：旧版用对数曲线把 ×66 / ×26.4 / ×10.6 / ×4.3 / ×1.9 换算成 +42.9% / +33.6% /
// +24.2% / +15.0% / +6.6% 的执行力，足以抵消 10 点以上的球员能力差：乙级 70 打 60 都赢不了，
// 超级联赛更是无法竞争。现在直接按百分比给 10% / 8% / 6% / 4% / 2%，让能力差重新成为
// 比赛结果的主要因素；更高一级的难度主要由联赛基础能力（79 / 69 / 59 / 49 / 35）拉开。
function aiTierExecutionBonus(tier) {
  return 1 + TIER_DIFFICULTY(tier) / 100;
}

const PERSONALITY_TYPES = [
  { id: 'professional', name: '职业', desc: '训练投入，不易受外界影响。' },
  { id: 'ambitious', name: '雄心', desc: '渴望更高舞台与主力位置。' },
  { id: 'loyal', name: '忠诚', desc: '愿意与俱乐部共渡难关。' },
  { id: 'volatile', name: '情绪化', desc: '状态与士气波动更大。' },
  { id: 'leader', name: '领袖', desc: '能带动更衣室与场上队友。' },
  { id: 'mercenary', name: '逐利', desc: '对薪资非常敏感。' },
  { id: 'homebody', name: '恋家', desc: '适应新环境较慢，但稳定。' },
  { id: 'clutch', name: '大场面', desc: '关键比赛更容易发挥。' },
];
/* 球员球风：会轻微改变拿球后的选择，但不会违反基本战术常识 */
const PLAY_STYLES = {
  balanced: { name: '均衡型', desc: '根据局面选择传球、盘带或射门。', pass: 1, shoot: 1, dribble: 1, run: 1, label: '均衡' },
  passer: { name: '组织型', desc: '优先寻找位置更好的队友，喜欢短传与二过一。', pass: 1.32, shoot: .72, dribble: .72, run: .92, label: '传球优先' },
  direct: { name: '直传型', desc: '喜欢第一时间向前输送，快速发起反击。', pass: 1.16, shoot: .88, dribble: .84, run: 1.06, label: '向前直传' },
  dribbler: { name: '突破型', desc: '喜欢带球推进和一对一，能凭个人能力撕开防线。', pass: .76, shoot: .94, dribble: 1.55, run: 1.08, label: '喜欢盘带' },
  finisher: { name: '终结型', desc: '更倾向于自己完成射门，尤其喜欢单刀与禁区内起脚。', pass: .78, shoot: 1.42, dribble: 1.02, run: 1.04, label: '喜欢射门' },
  runner: { name: '跑动型', desc: '不断前插、拉扯防线，擅长反击和无球跑位。', pass: 1, shoot: 1.04, dribble: 1.06, run: 1.3, label: '积极前插' },
};
function playStyleOf(p) {
  if (!p) return 'balanced';
  if (p.playStyle && PLAY_STYLES[p.playStyle]) return p.playStyle;
  const traits = p.traits || [];
  if (traits.includes('playmaker')) return 'passer';
  if (traits.includes('dribbler')) return 'dribbler';
  if (traits.includes('poacher') || traits.includes('power_shot')) return 'finisher';
  if (traits.includes('speedster')) return 'runner';
  if (['ST','SS'].includes(p.pos)) return 'finisher';
  if (['CM','AM','DM'].includes(p.pos)) return 'direct';
  return 'balanced';
}
function playStyleName(p) { return PLAY_STYLES[playStyleOf(p)].name; }
function makePlayStyle(pos, traits = []) {
  if (pos === 'GK') return 'balanced';
  if (traits.includes('playmaker')) return 'passer';
  if (traits.includes('dribbler')) return 'dribbler';
  if (traits.includes('poacher') || traits.includes('power_shot')) return 'finisher';
  if (traits.includes('speedster')) return 'runner';
  const pools = {
    CB: [['balanced', 6], ['passer', 2], ['direct', 1]],
    LB: [['runner', 4], ['direct', 2], ['balanced', 2], ['dribbler', 1]],
    RB: [['runner', 4], ['direct', 2], ['balanced', 2], ['dribbler', 1]],
    WB: [['runner', 4], ['direct', 2], ['dribbler', 2], ['balanced', 1]],
    DM: [['passer', 3], ['direct', 3], ['balanced', 3]],
    CM: [['passer', 4], ['direct', 3], ['balanced', 2], ['dribbler', 1]],
    LM: [['dribbler', 3], ['runner', 3], ['direct', 2], ['passer', 1]],
    RM: [['dribbler', 3], ['runner', 3], ['direct', 2], ['passer', 1]],
    AM: [['passer', 3], ['dribbler', 3], ['finisher', 2], ['direct', 2]],
    LW: [['dribbler', 4], ['finisher', 2], ['runner', 2], ['direct', 1]],
    RW: [['dribbler', 4], ['finisher', 2], ['runner', 2], ['direct', 1]],
    ST: [['finisher', 5], ['runner', 3], ['direct', 1], ['dribbler', 1]],
    SS: [['finisher', 3], ['dribbler', 2], ['passer', 2], ['runner', 2]],
  };
  const pool = (pools[pos] || pools.CM).flatMap(([k, n]) => Array(n).fill(k));
  return pick(pool);
}

const TRAITS = {
  power_shot: { name: '重炮手', desc: '禁区外射门力量与威胁更高。' },
  speedster: { name: '快马', desc: '冲刺速度与反击跑位更出色。' },
  tackler: { name: '抢断机器', desc: '一对一防守成功率更高。' },
  playmaker: { name: '组织核心', desc: '传球视野与关键传球能力更强。' },
  aerial: { name: '空霸', desc: '传中争顶和定位球威胁更高。' },
  ironman: { name: '铁人', desc: '赛后体力恢复更快，受伤概率较低。' },
  injury_prone: { name: '玻璃体质', desc: '更容易在训练和比赛中受伤。' },
  clutch: { name: '大心脏', desc: '比赛末段与关键球处理更稳定。' },
  leader: { name: '队长气质', desc: '在场上和更衣室中提升队友士气。' },
  dribbler: { name: '盘带大师', desc: '狭小空间内更擅长摆脱。' },
  poacher: { name: '禁区之狐', desc: '在禁区内捕捉机会的能力更强。' },
  long_shot: { name: '远射好手', desc: '远距离射门更准、更敢于起脚。' },
  sweeper_keeper: { name: '清道夫门将', desc: '出击范围更大，擅长处理身后球。' },
  big_game: { name: '关键先生', desc: '强强对话与淘汰赛表现提升。' },
};

const NATIONALITIES = [
  { code: 'CN', cn: '中国', type: 'cn', weight: 26,
    surnames: '王李张刘陈杨黄赵吴周徐孙马朱胡郭何高林罗郑梁谢宋唐许韩冯邓曹彭曾萧田董袁潘于蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤'.split(''),
    given: '伟强磊军洋勇杰涛明超秀霞平刚桂英华玉芳建华志文博宇轩浩然子豪俊杰嘉豪睿泽梓涵晨曦一鸣思远天佑泽宇明轩子墨嘉懿子涵皓轩宇航俊熙家豪志轩瑞泽博文雨泽天琪浩宇铭泽一诺子骞'.match(/.{1,2}/g) },
  { code: 'JP', cn: '日本', type: 'jp', weight: 4.2, surnames: ['佐藤','铃木','高桥','田中','伊藤','渡边','山本','中村','小林','加藤','吉田','山田','佐佐木','松本','井上','木村','林','清水','山崎','森','池田','桥本','阿部','石川','中岛','前田','藤田','小川','冈田','后藤','长谷川','村上','石井','近藤','坂本'], given: ['翔太','大辉','悠斗','海斗','莲','阳向','结翔','颯真','优真','树','拓海','光','亮太','健太','直辉','一辉','春树','大地','龙之介','瑛太','慎也','航平','雄大','智也','和也','大和','快','奏太'] },
  { code: 'KR', cn: '韩国', type: 'kr', weight: 3, surnames: ['金','李','朴','崔','郑','姜','赵','尹','张','林','韩','吴','申','徐','权','黄','安','宋','柳','洪','全','高','文','孙','白'], given: ['敏俊','智勋','承佑','贤宇','俊浩','东健','在熙','志焕','泰勋','成民','圭贤','民载','尚宇','浩俊','允成','载民','东元','时宇','建佑','振宇','成洙','英浩','敏赫','正民','宰贤'] },
  { code: 'BR', cn: '巴西', type: 'west', weight: 6, first: ['João','Lucas','Gabriel','Matheus','Thiago','Rafael','Bruno','Diego','Felipe','Vinícius','Pedro','Caio','André','Rodrigo','Gustavo','Leandro','Fábio','Marcelo','Renato','Eduardo','Igor','Danilo','Wesley','Douglas','Murilo'], last: ['Silva','Santos','Oliveira','Souza','Lima','Pereira','Costa','Almeida','Nascimento','Rodrigues','Gomes','Martins','Araújo','Ribeiro','Carvalho','Barbosa','Rocha','Dias','Monteiro','Cardoso','Teixeira','Moreira','Freitas','Ferreira','Cavalcanti'] },
  { code: 'AR', cn: '阿根廷', type: 'west', weight: 4, first: ['Mateo','Santiago','Lautaro','Julián','Nicolás','Alejandro','Pablo','Sergio','Andrés','Diego','Facundo','Agustín','Tomás','Franco','Valentín','Ramiro','Emiliano','Joaquín','Gonzalo','Maximiliano'], last: ['Fernández','González','Rodríguez','López','Martínez','Pérez','Gómez','Díaz','Romero','Álvarez','Sosa','Torres','Benítez','Acosta','Medina','Herrera','Aguirre','Pereyra','Rojas','Cabrera'] },
  { code: 'EN', cn: '英格兰', type: 'west', weight: 4, first: ['Oliver','Harry','Jack','George','Charlie','Jacob','Thomas','Alfie','Lewis','Ethan','James','Oscar','William','Henry','Archie','Freddie','Leo','Mason','Harvey','Daniel'], last: ['Smith','Jones','Taylor','Brown','Wilson','Evans','Thomas','Roberts','Walker','Wright','Robinson','Thompson','White','Hughes','Edwards','Hall','Green','Wood','Harris','Clarke'] },
  { code: 'FR', cn: '法国', type: 'west', weight: 4, first: ['Hugo','Lucas','Théo','Nathan','Louis','Gabriel','Adam','Raphaël','Arthur','Jules','Enzo','Noah','Mathis','Baptiste','Clément','Maxime','Antoine','Yanis','Ilan','Sacha'], last: ['Martin','Bernard','Dubois','Moreau','Laurent','Simon','Michel','Lefèvre','Leroy','Roux','Fournier','Girard','Mercier','Dupont','Lambert','Bonnet','François','Renaud','Perrin','Morel'] },
  { code: 'DE', cn: '德国', type: 'west', weight: 3.2, first: ['Leon','Finn','Elias','Noah','Paul','Felix','Jonas','Luca','David','Tim','Lukas','Maximilian','Moritz','Julian','Fabian','Nico','Jannik','Tom','Erik','Marvin'], last: ['Müller','Schmidt','Schneider','Fischer','Weber','Meyer','Wagner','Becker','Hoffmann','Schäfer','Koch','Bauer','Richter','Klein','Wolf','Schröder','Neumann','Schwarz','Zimmermann','Braun'] },
  { code: 'ES', cn: '西班牙', type: 'west', weight: 3.2, first: ['Alejandro','Pablo','Sergio','Javier','Adrián','Diego','Carlos','David','Iván','Rubén','Marcos','Raúl','Hugo','Álvaro','Mario','Daniel','Manu','Óscar','Luis','Aitor'], last: ['García','Martínez','López','Sánchez','Rodríguez','Fernández','Gómez','Pérez','Díaz','Torres','Ramírez','Vázquez','Ruiz','Jiménez','Moreno','Muñoz','Álvarez','Romero','Alonso','Navarro'] },
  { code: 'IT', cn: '意大利', type: 'west', weight: 3, first: ['Lorenzo','Matteo','Andrea','Gabriele','Riccardo','Tommaso','Alessandro','Marco','Davide','Simone','Federico','Luca','Stefano','Francesco','Nicolò','Gianluca','Emanuele','Pietro','Samuele','Alberto'], last: ['Rossi','Russo','Ferrari','Esposito','Bianchi','Romano','Colombo','Ricci','Marino','Greco','Bruno','Gallo','Conti','De Luca','Mancini','Costa','Giordano','Rizzo','Lombardi','Fontana'] },
  { code: 'PT', cn: '葡萄牙', type: 'west', weight: 2.4, first: ['João','Diogo','Tiago','Rui','Pedro','Miguel','André','Bernardo','Gonçalo','Rafael','Nuno','Vasco','Duarte','Luís','Tomás','Afonso','Frederico','Henrique','Martim','Filipe'], last: ['Silva','Santos','Ferreira','Pereira','Costa','Oliveira','Rodrigues','Martins','Sousa','Gonçalves','Lopes','Marques','Almeida','Ribeiro','Pinto','Carvalho','Teixeira','Correia','Mendes','Soares'] },
  { code: 'NL', cn: '荷兰', type: 'west', weight: 2, first: ['Daan','Sem','Milan','Levi','Finn','Luuk','Bram','Jesse','Thijs','Noud','Julian','Ruben','Tim','Stijn','Sven','Kay','Jens','Tijn','Mats','Bo'], last: ['de Jong','Jansen','de Vries','van Dijk','Bakker','Visser','Smit','Meijer','de Boer','Mulder','de Groot','Bos','Vos','Peters','Hendriks','van Leeuwen','Dekker','Brouwer','van den Berg','Willems'] },
  { code: 'HR', cn: '克罗地亚', type: 'west', weight: 1.4, first: ['Luka','Marko','Ivan','Nikola','Petar','Ante','Josip','Stipe','Filip','Matej','Domagoj','Mario','Dario','Igor','Toni'], last: ['Kovač','Marić','Jurić','Petrović','Marković','Nikolić','Babić','Ilić','Perić','Vuković','Šarić','Bošnjak','Pavlović','Radić','Blažević'] },
  { code: 'RS', cn: '塞尔维亚', type: 'west', weight: 1.4, first: ['Stefan','Nikola','Marko','Luka','Miloš','Dušan','Aleksandar','Filip','Nemanja','Ivan','Uroš','Bogdan','Vuk','Lazar','Ognjen'], last: ['Jovanović','Petrović','Nikolić','Marković','Đorđević','Stojanović','Ilić','Pavlović','Milošević','Todorović','Kostić','Ristić','Simić','Lazić','Đukić'] },
  { code: 'PL', cn: '波兰', type: 'west', weight: 1.3, first: ['Jakub','Kacper','Szymon','Antoni','Filip','Jan','Mateusz','Michał','Piotr','Bartosz','Adam','Wojciech','Paweł','Tomasz','Oskar'], last: ['Nowak','Kowalski','Wiśniewski','Wójcik','Kamiński','Zieliński','Szymański','Woźniak','Dąbrowski','Kozłowski','Jankowski','Mazur','Kwiatkowski','Krawczyk','Piotrowski'] },
  { code: 'TR', cn: '土耳其', type: 'west', weight: 1.4, first: ['Emre','Mert','Burak','Hakan','Kerem','Arda','Cenk','Yusuf','Onur','Serkan','Volkan','Ozan','Efe','Tolga','Berk'], last: ['Yılmaz','Kaya','Demir','Şahin','Çelik','Yıldız','Aydın','Öztürk','Arslan','Doğan','Kılıç','Aslan','Çetin','Kurt','Şen'] },
  { code: 'MA', cn: '摩洛哥', type: 'arab', weight: 1.3, first: ['Mohamed','Ahmed','Youssef','Omar','Karim','Amine','Bilal','Ilyas','Hamza','Ayoub','Mehdi','Reda','Zakaria','Anas','Sofiane'], last: ['El Amrani','Benali','Haddad','Mansour','Bouazza','Ziani','Alaoui','Berrada','Chraibi','Fassi','Tazi','Benjelloun','Naciri','El Idrissi','Bennani'] },
  { code: 'SN', cn: '塞内加尔', type: 'west', weight: 1.4, first: ['Sadio','Mamadou','Ousmane','Cheikh','Ibrahima','Moussa','Abdou','Lamine','Pape','El Hadji','Baba','Souleymane','Modou','Malick','Assane'], last: ['Diop','Ndiaye','Diallo','Traoré','Sarr','Gueye','Faye','Ba','Fall','Cissé','Seck','Sy','Mbaye','Thiam','Kane'] },
  { code: 'NG', cn: '尼日利亚', type: 'west', weight: 1.4, first: ['Chinedu','Obinna','Emeka','Tunde','Ifeanyi','Kelechi','Samuel','Victor','Emmanuel','Uche','Nnamdi','Segun','Femi','Chidi','Kingsley'], last: ['Okafor','Adeyemi','Okonkwo','Balogun','Eze','Adebayo','Mensah','Obi','Nwosu','Olawale','Ibe','Ogbonna','Afolabi','Umeh','Chukwu'] },
  { code: 'GH', cn: '加纳', type: 'west', weight: 0.9, first: ['Kwame','Kofi','Kwesi','Yaw','Kojo','Nana','Daniel','Michael','Prince','Abdul','Sadiq','Isaac','Joshua','Samuel','Emmanuel'], last: ['Mensah','Owusu','Boateng','Asante','Appiah','Osei','Agyeman','Addo','Amoah','Frimpong','Antwi','Baah','Darko','Nkrumah','Quaye'] },
  { code: 'US', cn: '美国', type: 'west', weight: 2, first: ['Tyler','Brandon','Mason','Logan','Ethan','Cole','Jaden','Cameron','Austin','Jordan','Dylan','Hunter','Caleb','Ryan','Connor'], last: ['Johnson','Williams','Miller','Davis','Carter','Anderson','Thompson','Jackson','Harris','Martin','Thompson','Moore','Allen','Young','King'] },
  { code: 'MX', cn: '墨西哥', type: 'west', weight: 2, first: ['Luis','Carlos','José','Miguel','Diego','Javier','Raúl','Andrés','Fernando','Ricardo','Emilio','Alejandro','Héctor','Óscar','Santiago'], last: ['Hernández','García','Martínez','López','Ramírez','Flores','Sánchez','Torres','Vargas','Castillo','Mendoza','Guzmán','Reyes','Salazar','Cruz'] },
  { code: 'CA', cn: '加拿大', type: 'west', weight: 0.9, first: ['Liam','Noah','Ethan','Lucas','Owen','Nathan','Evan','Cameron','Aiden','Jacob','Logan','Mason','Ryan','Cole','Tyler'], last: ['Smith','Tremblay','Martin','Roy','Gagnon','Lee','Wilson','Johnson','MacDonald','Taylor','Brown','Bouchard','Côté','Miller','Anderson'] },
  { code: 'AU', cn: '澳大利亚', type: 'west', weight: 1.3, first: ['Liam','Noah','Jack','Riley','Lachlan','Cooper','Hunter','Mason','Ethan','Jayden','Oliver','Harrison','Flynn','Archie','Max'], last: ['Smith','Jones','Williams','Brown','Wilson','Taylor','Clarke','Walker','Harris','Mitchell','Campbell','Anderson','Ryan','Kelly','Turner'] },
  { code: 'IR', cn: '伊朗', type: 'arab', weight: 0.9, first: ['Ali','Reza','Arman','Amir','Kian','Navid','Omid','Mehdi','Sina','Pouya','Hossein','Mohammad','Saeed','Farid','Dariush'], last: ['Hosseini','Ahmadi','Karimi','Rahimi','Moradi','Mohammadi','Rezaei','Jafari','Ansari','Bagheri','Ebrahimi','Sadeghi','Naderi','Zare','Ghasemi'] },
  { code: 'EG', cn: '埃及', type: 'arab', weight: 0.9, first: ['Mohamed','Ahmed','Mostafa','Mahmoud','Youssef','Omar','Karim','Hassan','Ali','Tarek','Sherif','Hany','Amr','Wael','Islam'], last: ['Hassan','Ibrahim','Mansour','Fathy','El-Sayed','Abdelrahman','Salah','Kamal','Rashad','Nasser','Shawky','Farouk','Hegazy','Zaki','Ezzat'] },
  { code: 'SE', cn: '瑞典', type: 'west', weight: 1, first: ['Erik','Magnus','Jonas','Emil','Oscar','Elias','Viktor','Anton','Filip','Gustav','Linus','Hugo','Isak','Albin','Axel'], last: ['Andersson','Johansson','Karlsson','Nilsson','Eriksson','Larsson','Olsson','Persson','Svensson','Gustafsson','Pettersson','Jonsson','Lindberg','Berglund','Holm'] },
  { code: 'NO', cn: '挪威', type: 'west', weight: 0.9, first: ['Magnus','Emil','Jonas','Sander','Kristian','Henrik','Mathias','Eivind','Marius','Ole','Håkon','Sindre','Tobias','Andreas','Erlend'], last: ['Hansen','Johansen','Olsen','Larsen','Andersen','Pedersen','Nilsen','Kristiansen','Engebretsen','Berg','Haugen','Dahl','Holm','Solberg','Moen'] },
  { code: 'DK', cn: '丹麦', type: 'west', weight: 0.8, first: ['Frederik','Mikkel','Rasmus','Emil','Oliver','Magnus','Mathias','Anders','Jakob','Kasper','Mads','Christian','Lasse','Jonas','Søren'], last: ['Nielsen','Jensen','Hansen','Pedersen','Andersen','Christensen','Larsen','Sørensen','Rasmussen','Jørgensen','Petersen','Madsen','Kristensen','Olsen','Thomsen'] },
  { code: 'BE', cn: '比利时', type: 'west', weight: 1.4, first: ['Arne','Bram','Wout','Jelle','Senne','Lars','Milan','Thibo','Niels','Jasper','Quinten','Matteo','Jarne','Wannes','Lennert'], last: ['Peeters','Janssens','Maes','Willems','Claes','Goossens','Wouters','De Smet','Vermeulen','Vandamme','Mertens','Pauwels','Hermans','Aerts','Dewulf'] },
  { code: 'CH', cn: '瑞士', type: 'west', weight: 0.9, first: ['Noah','Liam','Leon','Jan','Nico','Elias','Luca','David','Levin','Andrin','Cédric','Julian','Fabio','Silvan','Flurin'], last: ['Müller','Meier','Schmid','Keller','Frei','Brunner','Baumann','Widmer','Huber','Gerber','Steiner','Fischer','Weber','Moser','Bachmann'] },
  { code: 'GR', cn: '希腊', type: 'west', weight: 0.9, first: ['Giorgos','Nikos','Kostas','Dimitris','Yannis','Panagiotis','Theo','Alexis','Stelios','Vasilis','Christos','Manolis','Petros','Andreas','Sotiris'], last: ['Papadopoulos','Nikolaidis','Georgiou','Vlachos','Pappas','Karagiannis','Oikonomou','Antoniou','Dimitriou','Petridis','Konstantinou','Alexiou','Stavros','Kotsios','Manolas'] },
  { code: 'CO', cn: '哥伦比亚', type: 'west', weight: 1.3, first: ['Santiago','Juan','Andrés','Luis','Carlos','Jhon','Camilo','Sebastián','Felipe','Diego','Nicolás','Daniel','Julián','Kevin','Miguel'], last: ['García','Rodríguez','Martínez','Gómez','López','Hernández','Ramírez','Castro','Vargas','Moreno','Ortiz','Muñoz','Rojas','Cárdenas','Quintero'] },
  { code: 'UY', cn: '乌拉圭', type: 'west', weight: 1, first: ['Facundo','Martín','Nicolás','Federico','Maximiliano','Brian','Rodrigo','Agustín','Sebastián','Lucas','Ignacio','Emiliano','Diego','Matías','Gonzalo'], last: ['Rodríguez','Fernández','Pérez','González','García','Martínez','Silva','Sosa','Pereira','López','Cabrera','Olivera','Acosta','Ramos','Núñez'] },
  { code: 'CL', cn: '智利', type: 'west', weight: 0.8, first: ['Matías','Benjamín','Vicente','Diego','Ignacio','Tomás','Felipe','Cristóbal','Joaquín','Sebastián','Alexander','Nicolás','Gabriel','Lucas','Javier'], last: ['González','Rojas','Muñoz','Díaz','Contreras','Silva','Sepúlveda','Morales','Fuentes','Araya','Reyes','Cáceres','Vergara','Soto','Valdés'] },
  { code: 'EC', cn: '厄瓜多尔', type: 'west', weight: 0.7, first: ['Carlos','Luis','Andrés','Jordy','Ángel','Moisés','Jeremy','Kendry','Piero','Gonzalo','Felipe','Diego','Damián','Leonardo','Joao'], last: ['García','Quiñónez','Plata','Méndez','Castillo','Valencia','Estupiñán','Caicedo','Preciado','Paredes','Vera','Sornoza','Arreaga','Hurtado','Cifuentes'] },
  { code: 'DZ', cn: '阿尔及利亚', type: 'arab', weight: 0.7, first: ['Yacine','Riyad','Islam','Adel','Bilal','Sofiane','Nabil','Karim','Rachid','Ayoub','Mehdi','Houssem','Ilyes','Zinedine','Farid'], last: ['Benrahma','Mahrez','Bennacer','Slimani','Belaïli','Boudaoui','Zerrouki','Mandi','Tahrat','Feghouli','Bensebaini','Atal','Bentaleb','Chaïbi','Boulaya'] },
  { code: 'CI', cn: '科特迪瓦', type: 'west', weight: 0.9, first: ['Yao','Kouassi','Serge','Didier','Jean','Franck','Wilfried','Ibrahim','Souleymane','Christian','Koffi','Aboubacar','Seko','Odilon','Hamed'], last: ['Kessié','Fofana','Traoré','Koné','Boly','Aurier','Gradel','Zaha','Bamba','Diomandé','Doumbia','Coulibaly','Yao','Aké','Deli'] },
  { code: 'CM', cn: '喀麦隆', type: 'west', weight: 0.7, first: ['Samuel','Vincent','Karl','André','Jean','Franck','Martin','Olivier','Benoît','Clinton','Collins','Boris','Yvan','Stéphane','Emmanuel'], last: ['Eto’o','N’Koulou','Onana','Anguissa','Toko','Moumi','Fai','Castelletto','Aban','Ondoua','Ebosse','Wooh','Ngom','Mbeumo','Bassogog'] },
  { code: 'ZA', cn: '南非', type: 'west', weight: 0.6, first: ['Sipho','Thabo','Mandla','Lerato','Kagiso','Tshepo','Bongani','Lwazi','Sibusiso','Themba','Katlego','Tebogo','Mpho','Neo','Ayanda'], last: ['Nkosi','Dlamini','Ndlovu','Khumalo','Mokoena','Mahlangu','Zulu','Mthembu','Mabaso','Sithole','Molefe','Pule','Mahlangu','Mbatha','Radebe'] },
  { code: 'SA', cn: '沙特阿拉伯', type: 'arab', weight: 0.8, first: ['Mohammed','Abdullah','Salem','Faisal','Saud','Nawaf','Hattan','Yasser','Ali','Khalid','Omar','Sultan','Fahad','Majed','Turki'], last: ['Al-Otaibi','Al-Dawsari','Al-Shehri','Al-Ghannam','Al-Buraikan','Al-Faraj','Al-Malki','Al-Harbi','Al-Qahtani','Al-Amri','Al-Zahrani','Al-Yami','Al-Mutairi','Al-Hassan'] },
  { code: 'QA', cn: '卡塔尔', type: 'arab', weight: 0.5, first: ['Akram','Hassan','Mohammed','Ali','Abdulaziz','Yusuf','Ahmed','Ismail','Khalid','Nasser','Tarek','Sultan','Fahad','Saad','Jassim'], last: ['Afif','Al-Haydos','Ali','Hassan','Al-Rawi','Boudiaf','Waad','Hatem','Salman','Al-Brake','Madibo','Fadli','Al-Ahrak','Suhaib','Al-Ganehi'] },
  { code: 'UZ', cn: '乌兹别克斯坦', type: 'west', weight: 0.6, first: ['Eldor','Jaloliddin','Otabek','Odil','Rustam','Sardor','Temur','Aziz','Islom','Jasur','Bobur','Mirjalol','Doston','Farrukh','Sanjar'], last: ['Shomurodov','Masharipov','Urunov','Ahmedov','Rashidov','Turgunov','Yusupov','Khamrobekov','Sayfiev','Ismoilov','Erkinov','Norchaev','Sergeev','Fayzullaev','Turdiev'] },
  { code: 'TH', cn: '泰国', type: 'west', weight: 0.5, first: ['Teerasil','Chanathip','Supachok','Theerathon','Narubadin','Sarach','Ekanit','Pansa','Worachit','Suphanat','Kritsada','Pathompol','Thitipan','Chalerm','Sittichok'], last: ['Dangda','Songkrasin','Sarapat','Bunmathan','Phala','Yooyen','Panya','Hemviboon','Chaikamdee','Mueanta','Nonthasri','Charoenrattanapirom','Phimpha','Khamdee','Sukjit'] },
  { code: 'VN', cn: '越南', type: 'west', weight: 0.5, first: ['Nguyễn','Trần','Lê','Phạm','Hoàng','Huỳnh','Phan','Vũ','Đặng','Bùi','Đỗ','Hồ','Ngô','Dương','Lý'], last: ['Văn Toàn','Quang Hải','Công Phượng','Tiến Linh','Văn Hậu','Hoàng Đức','Tuấn Anh','Xuân Trường','Đức Chinh','Hữu Thắng','Minh Vương','Văn Quyết','Trọng Hoàng','Thanh Bình','Anh Đức'] },
  { code: 'ID', cn: '印度尼西亚', type: 'west', weight: 0.5, first: ['Egy','Pratama','Rizky','Bambang','Ilija','Saddil','Andik','Evan','Rachmat','Dedi','Marselino','Witan','Ricky','Sandy','Hokky'], last: ['Maulana','Arhan','Fajrin','Pamungkas','Spasojević','Ramdani','Vermansyah','Dimas','Kambuya','Saputra','Ferdinan','Sulaeman','Walsh','Caraka'] },
  { code: 'NZ', cn: '新西兰', type: 'west', weight: 0.35, first: ['Chris','Michael','Liam','Ben','Tyler','Marco','Rory','Matt','Joel','Elijah','Jay','Sam','Oscar','Nik','Clayton'], last: ['Wood','Barbarouses','Payne','Hall','Boyd','Rojas','Cacace','Garbett','Stamenić','Bell','Waine','Just','Sutton','Lewis','Howieson'] },
  { code: 'CZ', cn: '捷克', type: 'west', weight: 0.7, first: ['Tomáš','Jakub','Petr','Martin','Ondřej','Lukáš','Jan','Vojtěch','David','Adam','Filip','Pavel','Marek','Jiří','Šimon'], last: ['Novák','Svoboda','Dvořák','Černý','Procházka','Kučera','Veselý','Horák','Němec','Marek','Pospíšil','Pokorný','Hájek','Jelínek','Král'] },
  { code: 'AT', cn: '奥地利', type: 'west', weight: 0.7, first: ['Lukas','Florian','Michael','Jakob','David','Simon','Fabian','Tobias','Marco','Stefan','Alexander','Raphael','Manuel','Jonas','Elias'], last: ['Gruber','Huber','Wagner','Müller','Pichler','Steiner','Moser','Mayer','Hofer','Leitner','Berger','Fuchs','Eder','Fischer','Schmid'] },
  { code: 'SCO', cn: '苏格兰', type: 'west', weight: 0.7, first: ['Callum','Ross','Scott','Andrew','Ryan','Fraser','Kieran','Lewis','Grant','Craig','Stuart','Euan','Jamie','Robbie','Liam'], last: ['MacDonald','Campbell','Stewart','Robertson','Fraser','Graham','Murray','Reid','Grant','Ross','Young','Scott','Hamilton','Wallace','Gray'] },
  { code: 'WAL', cn: '威尔士', type: 'west', weight: 0.35, first: ['Dylan','Rhys','Ethan','Owain','Gareth','Iwan','Llyr','Tomos','Aled','Rhodri','Cai','Harri','Osian','Gethin','Steffan'], last: ['Davies','Jones','Williams','Evans','Thomas','Roberts','Lewis','Hughes','Morgan','Griffiths','Owen','Rees','Price','Jenkins','Meredith'] },
  { code: 'IE', cn: '爱尔兰', type: 'west', weight: 0.55, first: ['Conor','Sean','Cian','Niall','Eoin','Liam','Darragh','Oisin','Ronan','Patrick','Ciaran','Fionn','Donal','Shane','Killian'], last: ['Murphy','Kelly','O’Sullivan','Walsh','Smith','O’Brien','Byrne','Ryan','O’Connor','O’Neill','McCarthy','Doyle','Kennedy','Lynch','Murray'] },
  { code: 'UA', cn: '乌克兰', type: 'west', weight: 0.7, first: ['Andriy','Vitaliy','Oleksandr','Mykola','Taras','Dmytro','Yuriy','Serhiy','Roman','Artem','Bohdan','Maksym','Denys','Ivan','Vladyslav'], last: ['Shevchenko','Bondarenko','Kovalenko','Tkachenko','Kravchenko','Melnyk','Boyko','Kovalchuk','Savchenko','Rudenko','Lysenko','Marchenko','Moroz','Yavorskyi','Zinchenko'] },
  { code: 'RO', cn: '罗马尼亚', type: 'west', weight: 0.7, first: ['Andrei','Alexandru','Mihai','Cristian','Ionuț','Vlad','Răzvan','George','Florin','Ciprian','Darius','Denis','Robert','Sergiu','Ovidiu'], last: ['Popescu','Ionescu','Popa','Stan','Dumitru','Stoica','Gheorghe','Matei','Ciobanu','Munteanu','Lazăr','Rusu','Radu','Moldovan','Marin'] },
  { code: 'HU', cn: '匈牙利', type: 'west', weight: 0.5, first: ['Bence','Márk','Dávid','Ádám','Tamás','László','Péter','Gergő','Balázs','Zsolt','Attila','Dániel','Máté','Norbert','Levente'], last: ['Nagy','Kovács','Tóth','Szabó','Horváth','Varga','Kiss','Molnár','Németh','Farkas','Balogh','Papp','Lakatos','Takács','Juhász'] },
  { code: 'IS', cn: '冰岛', type: 'west', weight: 0.3, first: ['Aron','Hörður','Ragnar','Birkir','Jón','Magnús','Björn','Einar','Gunnar','Ólafur','Kristján','Valdimar','Hjalti','Sveinn','Arnar'], last: ['Jónsson','Sigurðsson','Guðmundsson','Gunnarsson','Ólafsson','Magnússon','Einarsson','Bjarnason','Kristjánsson','Helgason','Stefánsson','Pálsson','Halldórsson','Þórsson','Hauksson'] },
];
const NAT_BY_CODE = Object.fromEntries(NATIONALITIES.map(n => [n.code, n]));
function pickNationality(foreignBias = 0) {
  if (foreignBias > 0) {
    const weighted = NATIONALITIES.map(n => ({ ...n, _w: n.weight * (n.code !== 'CN' ? (1 + foreignBias) : 1) }));
    const chosen = weightedPick(weighted, x => x._w);
    return NAT_BY_CODE[chosen.code];
  }
  return weightedPick(NATIONALITIES, x => x.weight);
}

const HIDDEN_PLAYERS = [
  { key: 'liuyi', name: '刘一', nat: '中国', code: 'CN', age: 17, pos: 'ST', hidden: true, attrs: { sho: 38, pas: 24, dri: 30, spd: 40, str: 38, tac: 16, def: 12, gk: 8, vis: 22 }, traits: ['power_shot', 'speedster'], playStyle: 'finisher', tagline: '据说能把球门震得发响的街头少年。', growthBias: { sho: 1.4, spd: 1.25, str: 1.25 }, potential: 100 },
  { key: 'luozhihong', name: '罗志弘', nat: '中国', code: 'CN', age: 18, pos: 'DM', hidden: true, attrs: { sho: 25, pas: 27, dri: 26, spd: 36, str: 41, tac: 42, def: 34, gk: 8, vis: 25 }, traits: ['tackler', 'speedster'], playStyle: 'runner', tagline: '从搬运工球场走出的硬汉，铲球像一堵墙。', growthBias: { str: 1.4, spd: 1.2, tac: 1.45 }, potential: 100 },
  { key: 'tanyunkai', name: '谭云开', nat: '中国', code: 'CN', age: 18, pos: 'GK', hidden: true, attrs: { sho: 34, pas: 41, dri: 25, spd: 31, str: 29, tac: 35, def: 27, gk: 47, vis: 38 }, traits: ['sweeper_keeper', 'playmaker'], playStyle: 'passer', tagline: '能用手扑救，也能用脚发动进攻的异类门将。', growthBias: { gk: 1.4, pas: 1.35, tac: 1.25, sho: 1.2 }, potential: 100 },
  { key: 'tankewei', name: '谭科纬', nat: '中国', code: 'CN', age: 18, pos: 'CM', hidden: true, attrs: { sho: 33, pas: 39, dri: 43, spd: 33, str: 29, tac: 28, def: 26, gk: 9, vis: 37 }, traits: ['dribbler', 'playmaker'], playStyle: 'dribbler', tagline: '技术均衡得不像业余球员，盘带时像球黏在脚上。', growthBias: { dri: 1.45, pas: 1.3, vis: 1.3 }, potential: 100 },
  { key: 'huzhaohao', name: '胡钊豪', nat: '中国', code: 'CN', age: 17, pos: 'DM', hidden: true, attrs: { sho: 24, pas: 31, dri: 29, spd: 40, str: 37, tac: 46, def: 41, gk: 8, vis: 28, sta: 54, phy: 43 }, traits: ['tackler', 'ironman'], playStyle: 'runner', tagline: '在水泥场上练出的拦截机器，跑不死，也很难被过掉。', growthBias: { def: 1.55, tac: 1.6, spd: 1.25, sta: 1.35, phy: 1.2 }, potential: 100 },
];

/* -------------------------------------------------------------------------
   3. 名字与球员
   ------------------------------------------------------------------------- */
const usedNames = new Set(HIDDEN_PLAYERS.map(h => h.name));
function clearNameRegistry() { usedNames.clear(); HIDDEN_PLAYERS.forEach(h => usedNames.add(h.name)); }
function makePlayerName(nat) {
  for (let tries = 0; tries < 100; tries++) {
    let name = '';
    if (nat.type === 'cn') name = pick(nat.surnames) + pick(nat.given);
    else if (nat.type === 'jp' || nat.type === 'kr') name = pick(nat.surnames) + pick(nat.given);
    else name = `${pick(nat.first)} ${pick(nat.last)}`;
    if (!usedNames.has(name)) { usedNames.add(name); return name; }
    if (nat.type === 'cn') {
      const alt = name + '·' + pick(['安', '宁', '川', '泽', '航']);
      if (!usedNames.has(alt)) { usedNames.add(alt); return alt; }
    }
  }
  let base = nat.type === 'cn' ? pick(nat.surnames) + pick(nat.given) : `${pick(nat.first)} ${pick(nat.last)}`;
  let n = 2;
  while (usedNames.has(`${base} ${n}`)) n++;
  const val = `${base} ${n}`;
  usedNames.add(val);
  return val;
}
let nextPlayerId = 1;
let nextClubId = 1;
let nextFixtureId = 1;
function calcOvr(attrs, pos) {
  const weights = ROLE_WEIGHTS[pos] || ROLE_WEIGHTS.CM;
  let total = 0, wsum = 0;
  for (const k of ATTR_KEYS) { const w = weights[k] || 0; total += (attrs[k] || 0) * w; wsum += w; }
  return round(total / Math.max(1, wsum));
}
function effectiveOvrForRole(p, role) {
  if (!p) return 0;
  const weights = ROLE_WEIGHTS[role] || ROLE_WEIGHTS.CM;
  let total = 0, wsum = 0;
  for (const k of ATTR_KEYS) { const w = weights[k] || 0; total += (p.attrs[k] || 0) * w; wsum += w; }
  const base = total / Math.max(1, wsum);
  const fit = positionFit(p.pos, role);
  return round(base * (0.72 + fit * 0.28) * (0.9 + (p.fitness ?? 100) / 1000));
}
function positionFit(playerPos, role) {
  if (!playerPos || !role) return .5;
  if (playerPos === role) return 1;
  const isGk1 = playerPos === 'GK', isGk2 = role === 'GK';
  if (isGk1 || isGk2) return (isGk1 && isGk2) ? 1 : .03;
  const left = new Set(['LB', 'LM', 'LW']);
  const right = new Set(['RB', 'RM', 'RW']);
  const sidePenalty = ((left.has(playerPos) && right.has(role)) || (right.has(playerPos) && left.has(role))) ? .82 : 1;
  const same = {
    CB: { DM: .82, LB: .72, RB: .72, CM: .68 }, LB: { LM: .9, LW: .78, CB: .68, DM: .65, WB: 1 },
    RB: { RM: .9, RW: .78, CB: .68, DM: .65, WB: 1 }, WB: { LB: 1, RB: 1, LM: .82, RM: .82 },
    DM: { CB: .8, CM: .9, AM: .66 }, CM: { DM: .86, AM: .88, LM: .8, RM: .8, SS: .7 },
    LM: { LW: .9, CM: .8, AM: .76, LB: .72 }, RM: { RW: .9, CM: .8, AM: .76, RB: .72 },
    AM: { CM: .86, SS: .85, LW: .8, RW: .8, ST: .62 }, LW: { LM: 1, ST: .72, AM: .78, RW: .7 },
    RW: { RM: 1, ST: .72, AM: .78, LW: .7 }, ST: { SS: .86, LW: .65, RW: .65, AM: .6 },
    SS: { ST: .85, AM: .88, CM: .65 }, GK: {},
  };
  let fit = (same[playerPos] && same[playerPos][role]) || .42;
  if (POS_GROUP[playerPos] === POS_GROUP[role]) fit = Math.max(fit, .58);
  if (POS_GROUP[playerPos] !== 'GK' && POS_GROUP[role] !== 'GK' && POS_GROUP[playerPos] !== POS_GROUP[role]) fit *= .9;
  return clamp(fit * sidePenalty, .22, 1);
}
function makeAttrsFor(pos, quality, age = 24) {
  const q = clamp(quality, 5, 99);
  const profile = {
    GK: { gk: 1.38, def: .82, pas: .8, vis: .82, str: 1.04, spd: .86, tac: .75, dri: .6, sho: .5 },
    CB: { gk: .12, def: 1.28, tac: 1.22, pas: .86, vis: .82, str: 1.2, spd: .95, dri: .7, sho: .62 },
    LB: { gk: .12, def: 1.08, tac: 1.06, pas: 1.0, vis: .88, str: .88, spd: 1.16, dri: .98, sho: .68 },
    RB: { gk: .12, def: 1.08, tac: 1.06, pas: 1.0, vis: .88, str: .88, spd: 1.16, dri: .98, sho: .68 },
    DM: { gk: .1, def: 1.1, tac: 1.22, pas: 1.12, vis: .96, str: 1.06, spd: .88, dri: .9, sho: .7 },
    CM: { gk: .1, def: .88, tac: .92, pas: 1.18, vis: 1.16, str: .92, spd: .9, dri: 1.03, sho: .86 },
    LM: { gk: .1, def: .8, tac: .8, pas: 1.04, vis: .94, str: .8, spd: 1.18, dri: 1.12, sho: .86 },
    RM: { gk: .1, def: .8, tac: .8, pas: 1.04, vis: .94, str: .8, spd: 1.18, dri: 1.12, sho: .86 },
    AM: { gk: .1, def: .7, tac: .7, pas: 1.12, vis: 1.12, str: .8, spd: 1.05, dri: 1.2, sho: 1.0 },
    LW: { gk: .1, def: .64, tac: .64, pas: .98, vis: .92, str: .78, spd: 1.26, dri: 1.22, sho: 1.0 },
    RW: { gk: .1, def: .64, tac: .64, pas: .98, vis: .92, str: .78, spd: 1.26, dri: 1.22, sho: 1.0 },
    ST: { gk: .09, def: .54, tac: .52, pas: .82, vis: .8, str: 1.1, spd: 1.12, dri: 1.02, sho: 1.34 },
    SS: { gk: .09, def: .56, tac: .56, pas: .92, vis: .92, str: .9, spd: 1.12, dri: 1.12, sho: 1.16 },
  }[pos] || {};
  const physical = {
    GK: { sta: .98, phy: 1.08 }, CB: { sta: 1.12, phy: 1.25 }, LB: { sta: 1.14, phy: 1.02 }, RB: { sta: 1.14, phy: 1.02 },
    DM: { sta: 1.18, phy: 1.12 }, CM: { sta: 1.14, phy: .96 }, LM: { sta: 1.12, phy: .9 }, RM: { sta: 1.12, phy: .9 },
    AM: { sta: 1.0, phy: .86 }, LW: { sta: 1.06, phy: .84 }, RW: { sta: 1.06, phy: .84 }, ST: { sta: 1.04, phy: 1.14 }, SS: { sta: 1.02, phy: .98 },
  }[pos] || { sta: 1, phy: 1 };
  profile.sta = physical.sta; profile.phy = physical.phy;
  const out = {};
  for (const k of ATTR_KEYS) {
    const p = profile[k] ?? 1;
    let v = q * (0.72 + p * 0.26) + normal(0, 7.5);
    if (age < 21) { if (k === 'str' || k === 'def' || k === 'tac') v -= 2; if (k === 'spd' || k === 'dri' || k === 'sta') v += 2; }
    else if (age > 31) { if (k === 'spd' || k === 'dri') v -= (age - 31) * 1.4; if (k === 'sta' || k === 'phy') v -= (age - 31) * .9; if (k === 'vis' || k === 'def' || k === 'gk' || k === 'str') v += 1; }
    if (k === 'gk' && pos !== 'GK') v = Math.min(v, 24);
    if (k === 'gk' && pos === 'GK') v += 8;
    out[k] = clampRound(v, 5, 97);
  }
  return out;
}
function emptySeasonStats() { return { apps: 0, starts: 0, minutes: 0, goals: 0, assists: 0, cleanSheets: 0, conceded: 0, yellow: 0, red: 0, ratingSum: 0, ratings: 0, motm: 0, keyPasses: 0, saves: 0 }; }
function emptyCareerStats() { return { apps: 0, goals: 0, assists: 0, cleanSheets: 0, yellow: 0, red: 0, seasons: 0, titles: 0, promotions: 0 }; }
function pickPersonality() { const t = pick(PERSONALITY_TYPES); return { id: t.id, name: t.name }; }
function rollTraits(pos, ovr, potential) {
  const out = [];
  const lucky = ovr >= 52 || potential >= 70;
  const pool = ['power_shot', 'speedster', 'tackler', 'playmaker', 'aerial', 'ironman', 'injury_prone', 'clutch', 'leader', 'dribbler', 'poacher', 'long_shot', 'sweeper_keeper', 'big_game'];
  const allowed = pool.filter(t => {
    if (t === 'sweeper_keeper') return pos === 'GK';
    if (t === 'poacher') return ['ST', 'SS'].includes(pos);
    if (t === 'aerial') return ['ST', 'CB', 'SS', 'GK'].includes(pos);
    if (t === 'tackler') return POS_GROUP[pos] === 'DF' || pos === 'DM';
    if (t === 'dribbler') return POS_GROUP[pos] === 'MF' || POS_GROUP[pos] === 'FW';
    if (t === 'playmaker') return ['CM', 'AM', 'DM', 'LW', 'RW'].includes(pos);
    if (t === 'long_shot' || t === 'power_shot') return pos !== 'GK';
    if (t === 'speedster') return pos !== 'GK' && pos !== 'CB';
    if (t === 'leader') return ovr >= 45 || potential >= 65;
    return true;
  });
  const n = chance(.09) ? (lucky ? 2 : 1) : chance(.28) ? 1 : 0;
  while (out.length < n && allowed.length) {
    const t = allowed.splice(randInt(0, allowed.length - 1), 1)[0];
    if (!out.includes(t)) out.push(t);
  }
  return out;
}
function calcWage(ovr, potential, age) {
  const base = Math.pow(1.105, Math.max(0, ovr - 25)) * 135;
  let w = base * (1 + Math.max(0, potential - ovr) / 220);
  if (age <= 21) w *= .78;
  if (age >= 32) w *= .9;
  return Math.max(280, Math.round(w / 50) * 50);
}
function calcValue(p) {
  if (!p) return 0;
  // 身价首先由当前能力决定，年龄和潜力只做修正。这样 70 能力球员不会比 40/50 球员更便宜。
  const ovr = clamp(p.ovr || 30, 5, 99);
  const abilityPart = Math.pow(1.13, Math.max(0, ovr - 30)) * 15000;
  const age = p.age;
  let ageFactor;
  if (age <= 18) ageFactor = 1.18; else if (age <= 21) ageFactor = 1.14; else if (age <= 24) ageFactor = 1.08;
  else if (age <= 27) ageFactor = 1.02; else if (age <= 29) ageFactor = .94; else if (age <= 31) ageFactor = .84;
  else if (age <= 33) ageFactor = .72; else if (age <= 35) ageFactor = .6; else ageFactor = .5;
  const room = Math.max(0, (p.potential || ovr) - ovr);
  const potPart = 1 + Math.min(.38, room * .0075);
  const formPart = .94 + clamp(p.form || 55, 20, 90) / 650;
  const contractPart = .86 + clamp(p.contract ?? 2, 0, 5) * .028;
  const statusPart = p.transferStatus === 'listed' ? .9 : p.transferStatus === 'requested' ? .86 : 1;
  return Math.max(2000, Math.round(abilityPart * ageFactor * potPart * formPart * contractPart * statusPart / 500) * 500);
}
function makePlayer(opts = {}) {
  const nat = opts.nat || pickNationality(opts.foreignBias || 0);
  const age = opts.age ?? clampRound(normal(25, 4.8), 16, 37);
  const pos = opts.pos || weightedPick(POSITIONS, p => ({ GK: 4, CB: 16, LB: 9, RB: 9, DM: 7, CM: 14, LM: 6, RM: 6, AM: 7, LW: 6, RW: 6, ST: 13, SS: 4 }[p]));
  const quality = opts.quality ?? clamp(normal(38, 7), 12, 92);
  const attrs = { ...(opts.attrs || makeAttrsFor(pos, quality, age)) };
  if (attrs.sta == null) attrs.sta = clampRound(25 + (attrs.str || 40) * .4 + (attrs.spd || 40) * .2 + Math.max(0, 32 - age) * .8, 5, 95);
  if (attrs.phy == null) attrs.phy = clampRound((attrs.str || 40) * .65 + (attrs.spd || 40) * .15 + (attrs.tac || 40) * .1 + 10, 5, 95);
  const ovr = calcOvr(attrs, pos);
  let potential;
  if (opts.potential != null) potential = clamp(Math.round(opts.potential), ovr + 1, 100);
  else {
    let room;
    if (age <= 18) room = randInt(8, 23); else if (age <= 21) room = randInt(5, 18); else if (age <= 24) room = randInt(2, 11);
    else if (age <= 27) room = randInt(0, 6); else room = randInt(0, 3);
    if (opts.gemChance && chance(opts.gemChance)) room += randInt(12, 28);
    potential = clamp(ovr + room, ovr + 1, 97);
  }
  const wage = opts.wage ?? calcWage(ovr, potential, age);
  const contract = opts.contract ?? randInt(1, 4);
  const traits = opts.traits || rollTraits(pos, ovr, potential);
  const name = opts.name || makePlayerName(nat);
  return {
    id: opts.id || nextPlayerId++,
    name, nat: nat.cn, natCode: nat.code, age, pos, attrs, ovr, potential, wage, contract,
    morale: opts.morale ?? randInt(48, 76), fitness: opts.fitness ?? randInt(83, 100), form: opts.form ?? randInt(42, 62),
    clubId: opts.clubId ?? null, number: opts.number ?? 0, traits, personality: opts.personality || pickPersonality(),
    injuryDays: opts.injuryDays ?? 0, suspension: opts.suspension ?? 0, yellowCards: opts.yellowCards ?? 0, redCards: opts.redCards ?? 0,
    transferStatus: opts.transferStatus || 'none', promise: opts.promise || 'rotation', hidden: !!opts.hidden, youth: !!opts.youth,
    playStyle: opts.playStyle || makePlayStyle(pos, traits),
    homegrown: !!opts.homegrown, loyalty: opts.loyalty ?? randInt(25, 88), ambition: opts.ambition ?? randInt(25, 92),
    professionalism: opts.professionalism ?? randInt(30, 92), leadership: opts.leadership ?? randInt(10, 82),
    height: opts.height ?? (pos === 'GK' ? randInt(185, 198) : pos === 'CB' ? randInt(180, 194) : pos === 'ST' ? randInt(176, 191) : randInt(168, 185)),
    foot: opts.foot || (chance(.23) ? '左' : chance(.08) ? '双' : '右'), joinedSeason: opts.joinedSeason ?? 0,
    season: emptySeasonStats(), career: opts.career || emptyCareerStats(), careerSeasons: opts.careerSeasons || 0,
    loan: opts.loan || null, askingMultiplier: opts.askingMultiplier || round(1.03 + rand() * .2, 2),
    growthBias: opts.growthBias || null, hiddenKey: opts.hiddenKey || null, moraleLog: [], lastOfferDay: 0,
  };
}
function capPlayerOverall(p, maxOvr, maxPotential = null) {
  if (!p) return p;
  for (let i = 0; i < 4 && p.ovr > maxOvr; i++) {
    const factor = maxOvr / p.ovr;
    for (const k of ATTR_KEYS) p.attrs[k] = clampRound(p.attrs[k] * factor, 5, 96);
    p.ovr = calcOvr(p.attrs, p.pos);
  }
  if (maxPotential != null) p.potential = clamp(Math.round(p.potential), p.ovr + 1, maxPotential);
  return p;
}
function addCareer(p, stats) {
  if (!p.career) p.career = emptyCareerStats();
  p.career.apps += stats.apps || 0; p.career.goals += stats.goals || 0; p.career.assists += stats.assists || 0;
  p.career.cleanSheets += stats.cleanSheets || 0; p.career.yellow += stats.yellow || 0; p.career.red += stats.red || 0;
}
function resetSeasonStats(p) {
  addCareer(p, p.season || emptySeasonStats());
  p.season = emptySeasonStats();
  p.careerSeasons = (p.careerSeasons || 0) + 1;
  p.yellowCards = 0; p.redCards = 0;
}

/* -------------------------------------------------------------------------
   4. 俱乐部生成
   ------------------------------------------------------------------------- */
function emptyClubStats() { return { played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, points: 0, position: 0 }; }
function calcRecommendedWageBudget(club) {
  const t = TIERS[club.tier];
  return Math.round((t.sponsor[1] * 1.4 + t.tv * .45 + club.capacity * club.ticket * .65) / 100) * 100;
}
const CLUB_NAME_POOL = {
  1: [['北辰联合','北辰'],['澜海竞技','澜海'],['赤霄城','赤霄'],['麒麟体育','麒麟'],['东望者','东望'],['云际联','云际'],['白塔竞技','白塔'],['天穹城','天穹'],['银翼足球会','银翼'],['南屿海港','南屿'],['长风联','长风'],['金穗俱乐部','金穗']],
  2: [['黑潮竞技','黑潮'],['雾川联','雾川'],['山海关城','山海'],['星野体育','星野'],['青石联','青石'],['江原城','江原'],['白鲸足球会','白鲸'],['落日城','落日'],['苍梧竞技','苍梧'],['铁桥联','铁桥'],['海岬流浪者','海岬'],['极光城','极光']],
  3: [['赤岩矿工','赤岩'],['银杉堡','银杉'],['风谷先锋','风谷'],['云岭公羊','云岭'],['蓝湾海鸥','蓝湾'],['白鹿体育','白鹿'],['麒麟街','麒麟街'],['雷港竞技','雷港'],['松江联','松江'],['沙洲城','沙洲'],['枫桥竞技','枫桥'],['雾岛海风','雾岛']],
  4: [['红枫镇','红枫'],['石桥联','石桥'],['野马竞技','野马'],['潮汐城','潮汐'],['青藤体育','青藤'],['南山青年','南山'],['北岸工人','北岸'],['金沙滩','金沙'],['稻香城','稻香'],['老码头','码头'],['望江联','望江'],['柳林堡','柳林']],
  5: [['新桥联','新桥'],['东湖竞技','东湖'],['飞燕体育','飞燕'],['竹海城','竹海'],['河畔流浪者','河畔'],['北门工人','北门'],['晨星足球会','晨星'],['大野联','大野'],['灯塔城','灯塔'],['西林体育','西林'],['青砖街','青砖'],['南塘竞技','南塘']],
};
const CLUB_COLOR_POOL = [
  ['#b74e47','#f2e6d0'], ['#3f76a1','#f0e7d2'], ['#c5a047','#17231a'], ['#4d8f68','#f5e9ce'],
  ['#8461a5','#f4e8d7'], ['#b46c3b','#f3e9d5'], ['#3a8680','#f1e4c9'], ['#8e8a3c','#f7eed7'],
  ['#9e3f56','#f2dfcc'], ['#446a94','#eadcc4'], ['#517a4c','#f0e4cb'], ['#9f6b2f','#f2e7d4'],
];
function makeClub(opts = {}) {
  const tier = opts.tier || 5;
  const t = TIERS[tier];
  const name = opts.name;
  const colors = opts.colors || [pick(CLUB_COLOR_POOL)[0], '#f1e8d5'];
  const id = opts.id || nextClubId++;
  const rep = opts.reputation ?? clampRound(normal(20 + (5 - tier) * 16, 9), 8, 98);
  const fanbase = opts.fanbase ?? clampRound(lerp(t.fanbase[0], t.fanbase[1], Math.pow(rep / 100, 1.4)) * (.75 + rand() * .5), 200, Math.round(t.fanbase[1] * 1.4));
  const capacity = opts.capacity ?? clampRound(lerp(t.capacity[0], t.capacity[1], rand() * .75 + .1), 1200, t.capacity[1]);
  return {
    id, name, short: opts.short || name.slice(0, 2), tier, colors,
    logo: opts.logo || makeCrest(colors, name, randInt(0, 3), id),
    kit: opts.kit || makeKit(colors, pick(['solid', 'stripes', 'sash', 'halves'])),
    reputation: rep, fanbase, capacity,
    stadium: opts.stadium || `${name.slice(0, 2)}体育场`,
    city: opts.city || pick(['青岚','东湖','北岸','南屿','云岭','白河','铁桥','金湾','松江','望川','石桥','星野']),
    ticket: opts.ticket ?? t.ticket,
    cash: opts.cash ?? Math.round(lerp(200000, 3000000, Math.pow(rep / 100, 2)) * (tier <= 2 ? 8 : tier === 3 ? 3 : 1)),
    transferBudget: opts.transferBudget ?? Math.round((tier === 1 ? randInt(15, 80) : tier === 2 ? randInt(5, 25) : tier === 3 ? randInt(1, 8) : tier === 4 ? randInt(300, 1500) : randInt(40, 260)) * 10000),
    wageBudget: 0,
    facility: { training: opts.trainingLevel ?? randInt(1, tier <= 2 ? 5 : tier === 3 ? 4 : 3), medical: opts.medicalLevel ?? randInt(1, tier <= 2 ? 5 : 3), youth: opts.youthLevel ?? randInt(1, tier <= 2 ? 5 : 3) },
    formation: opts.formation || pick(FORMATIONS.slice(0, 6)),
    tactics: opts.tactics || { attack: pick(['possession','counter','wing','longball']), defense: pick(['press','low','balanced']), tempo: pick(['slow','normal','fast']) },
    squad: [], lineup: [], bench: [], captainId: null, form: [], seasonStats: emptyClubStats(), honours: [],
    boardConfidence: opts.boardConfidence ?? 60, expectation: '', isUser: false, sponsor: null, sponsorOffers: [],
    bankLoan: 0, sellOns: [], receivable: [], payable: [], ledger: [], construction: [], groundOwned: false,
    trainingGroundValue: 0, ticketHistory: [], seasonGoal: null, reputationHistory: [], promotedSeason: null,
  };
}

function buildUniverse(seed, draft) {
  clearNameRegistry();
  nextPlayerId = 1; nextClubId = 1; nextFixtureId = 1;
  setRngSeed(seed);
  const clubs = {};
  const players = {};
  const t = TIERS[5];
  const user = makeClub({
    id: USER_CLUB_ID, name: draft.clubName || '青岚竞技', short: (draft.clubName || '青岚竞').slice(0, 3), tier: 5,
    colors: [draft.primary || '#b74e47', draft.secondary || '#f2e6d0'], logo: draft.logo || null,
    kit: draft.kitImage || null, city: draft.city || '青岚', stadium: draft.stadium || '青岚体育场',
    reputation: 18, fanbase: 900, capacity: 2600, cash: 800000, transferBudget: 800000,
    trainingLevel: 1, medicalLevel: 1, youthLevel: 1, formation: '4-4-2',
    tactics: { attack: 'balanced', defense: 'balanced', tempo: 'normal' }, boardConfidence: 58, ticket: t.ticket,
  });
  user.isUser = true;
  user.short = (draft.clubName || '青岚竞技').replace(/足球俱乐部|俱乐部|竞技|联/g, '').slice(0, 4) || '青岚';
  user.user = { manager: draft.manager || '无名教练', founded: 2026, primary: draft.primary || '#b74e47', secondary: draft.secondary || '#f2e6d0', kitPattern: draft.kitPattern || 'sash', stadiumLevel: 1, trainingGroundOwned: false };
  user.kit = draft.kitImage || makeKit([draft.primary || '#b74e47', draft.secondary || '#f2e6d0'], draft.kitPattern || 'sash');
  user.tactics = { attack: 'balanced', defense: 'balanced', tempo: 'normal' };
  user.sponsor = null;
  user.sponsorOffers = makeSponsorOffers(user);
  user.groundOwned = false; user.trainingGroundValue = 0;
  user.interestedPlayers = []; user.hiddenSeen = []; user.streetLastDay = -1; user.youthPromotions = 0;
  user.sellOnReceivables = []; user.owedSellOns = []; user.receivable = []; user.payable = [];
  clubs[user.id] = user;
  nextClubId = Math.max(nextClubId, user.id + 1);

  const usedClubNames = new Set([user.name]);
  const divisions = {};
  for (let tier = 1; tier <= 5; tier++) {
    const pool = CLUB_NAME_POOL[tier].slice();
    const n = tier === 5 ? 11 : 12;
    const chosen = [];
    for (let i = 0; i < n; i++) {
      let item = pool[randInt(0, pool.length - 1)];
      let guard = 0;
      while (usedClubNames.has(item[0]) && guard++ < 40) item = pool[randInt(0, pool.length - 1)];
      pool.splice(pool.indexOf(item), 1);
      usedClubNames.add(item[0]);
      chosen.push(item);
    }
    for (const [name, short] of chosen) {
      const colors = CLUB_COLOR_POOL[randInt(0, CLUB_COLOR_POOL.length - 1)];
      const repBase = 12 + (5 - tier) * 17;
      const club = makeClub({
        name, short, tier, colors,
        reputation: clampRound(normal(repBase, tier === 1 ? 10 : 7), 8, 98),
        city: pick(['青岚','东湖','北岸','南屿','云岭','白河','铁桥','金湾','松江','望川','石桥','星野','赤岩','雾川','海岬','长岭']),
        cash: Math.round(lerp(300000, 26000000, Math.pow((12 + (5 - tier) * 17) / 100, 1.8)) * (.6 + rand() * .9)),
        transferBudget: Math.round(lerp(100000, 12000000, Math.pow((12 + (5 - tier) * 17) / 100, 1.8)) * (.5 + rand() * 1.1)),
      });
      club.stadium = `${club.city}${pick(['体育场','竞技场','球场','公园球场'])}`;
      clubs[club.id] = club;
    }
  }
  for (let tier = 1; tier <= 5; tier++) {
    divisions[tier] = { tier, name: TIER_NAME(tier), clubIds: Object.values(clubs).filter(c => c.tier === tier).map(c => c.id), fixtures: [] };
  }
  for (const club of Object.values(clubs)) if (!club.isUser) generateSquadForClub(club, players);
  const freeAgentIds = [];
  const desiredFree = 34;
  const initialSpecial = 28;
  const initialPositions = ['GK','GK','GK','CB','CB','CB','LB','LB','RB','RB','DM','DM','CM','CM','CM','LM','LM','RM','RM','AM','AM','LW','LW','RW','RW','ST','ST','SS'];
  for (let i = 0; i < desiredFree; i++) {
    const isInitial = i < initialSpecial;
    const nat = pickNationality(isInitial ? .25 : .45);
    const age = clampRound(normal(24, 4.5), 17, 35);
    // 民间自由球员：大多只是勉强能踢城市联赛，顶尖者也只是“可用”，不是现成球星
    let quality = clamp(normal(isInitial ? 29 : 34, isInitial ? 5.2 : 6), 16, 48);
    if (isInitial && chance(.07)) quality += randInt(2, 5);
    const pos = isInitial ? initialPositions[i] : weightedPick(POSITIONS, p => ({ GK: 3, CB: 14, LB: 8, RB: 8, DM: 6, CM: 15, LM: 5, RM: 5, AM: 6, LW: 5, RW: 5, ST: 12, SS: 3 }[p]));
    const p = makePlayer({ nat, age, pos, quality: clamp(quality, 15, 48), gemChance: isInitial ? .025 : .012, contract: randInt(1, 3), clubId: null, transferStatus: 'free', foreignBias: .3 });
    // 自由市场里可以淘到不错的球员，但没有现成的城市联赛明星
    capPlayerOverall(p, isInitial ? 42 : 43, isInitial ? 86 : 80);
    if (!isInitial) p.potential = clamp(p.potential, p.ovr + 2, 78);
    p.season = emptySeasonStats(); p.personality = pickPersonality(); p.morale = randInt(45, 72);
    players[p.id] = p;
    freeAgentIds.push(p.id);
  }
  const initialPool = freeAgentIds.slice(0, initialSpecial);
  for (let tier = 1; tier <= 5; tier++) divisions[tier].fixtures = generateDivisionFixtures(divisions[tier].clubIds, tier);
  const startISO = seasonStartISO(2026, 1);
  const state = {
    version: SAVE_VERSION, appVersion: APP_VERSION, seed, rngState: _rngState, createdAt: nowISO(),
    userClubId: USER_CLUB_ID, manager: draft.manager || '无名教练', clubs, divisions, players,
    freeAgents: freeAgentIds, initialPool,
    season: { number: 1, year: 2026, label: '2026赛季', week: 1, day: 0, round: 1, startISO, phase: 'season', finished: false, transferWindowOpen: true, transferWindowLabel: '季初转会窗', lastRoundSimulated: 0 },
    userTier: 5, offers: [], negotiations: [], news: [], matchHistory: [], transferHistory: [],
    youthProspects: [], youthIntakeCount: 0, youthPromotions: 0, seasonHistory: [],
    market: { playerIds: [], refreshedSeason: 0, refreshedWeek: 0 },
    finance: { ledger: [], lastWeekSummary: null, negativeWeeks: 0, bankruptcyWarning: 0, wageArrears: 0 },
    board: { confidence: 58, goal: '', targetPosition: 8, seasonsAtClub: 0, warning: 0, trophies: [] },
    meta: { onboardingDone: false, tutorialSeen: false, initialPoolSigned: false, totalDays: 0, lastAutosave: null, difficulty: '标准', settings: { reduceMotion: false }, bankrupt: false, testMode: readTestModeFlag() },
    trainer: { focus: 'balanced', intensity: 'normal', weeklyLog: [], lastReport: null },
    lastMatch: null, versionChecksum: APP_VERSION,
  };
  state.rngState = _rngState;
  return state;
}

function generateSquadForClub(club, players) {
  const tierBase = TIERS[club.tier].base;
  const positions = [];
  for (let i = 0; i < 3; i++) positions.push('GK');
  const dfPos = ['CB','CB','CB','LB','RB','LB','RB','CB'];
  for (let i = 0; i < 8; i++) positions.push(dfPos[i]);
  const mfPos = ['CM','CM','DM','AM','LM','RM','CM'];
  for (let i = 0; i < 7; i++) positions.push(mfPos[i]);
  const fwPos = ['ST','ST','LW','RW','SS'];
  for (let i = 0; i < 5; i++) positions.push(fwPos[i]);
  const shuffled = shuffle(positions);
  let idx = 0;
  for (const pos of shuffled) {
    let quality = normal(tierBase, 5.2);
    // 低级别联赛不该凭空出现碾压全队的球星；开局对手整体仍略强于你的草根阵容
    if (idx === 0) quality += club.tier === 5 ? randInt(2, 5) : randInt(5, 10);
    if (idx === 1) quality += randInt(2, 6);
    if (idx === shuffled.length - 1) quality -= randInt(2, 6);
    // 第五级别是草根联赛：允许有强点，但不该出现能力碾压全场的“外援”
    if (club.tier === 5) quality = Math.min(quality, 40);
    const age = clampRound(normal(25.5, 4.2), 17, 36);
    const nat = pickNationality(club.tier <= 3 ? .55 : .28);
    const p = makePlayer({
      nat, age, pos, quality: clamp(quality, 20, club.tier === 5 ? 40 : 92), clubId: club.id, number: idx + 1,
      gemChance: .035, foreignBias: club.tier <= 3 ? .7 : .25, joinedSeason: 0,
    });
    // 属性生成有随机波动，可能需要两步才能把个别“异常高”的球员压回草根水平
    for (let capStep = 0; capStep < 3 && club.tier === 5 && p.ovr > 43; capStep++) {
      const factor = 43 / p.ovr;
      for (const k of ATTR_KEYS) p.attrs[k] = clampRound(p.attrs[k] * factor, 5, 96);
      p.ovr = calcOvr(p.attrs, p.pos);
    }
    if (p.ovr > tierBase + 14) {
      for (const k of ATTR_KEYS) p.attrs[k] = clampRound(p.attrs[k] * .92, 5, 96);
      p.ovr = calcOvr(p.attrs, p.pos);
      p.potential = Math.max(p.ovr + 1, p.potential - 2);
    }
    p.wage = calcWage(p.ovr, p.potential, p.age);
    p.contract = randInt(1, 4);
    p.season = emptySeasonStats(); p.career = emptyCareerStats();
    p.number = idx + 1;
    players[p.id] = p;
    club.squad.push(p.id);
    idx++;
  }
  let n = 1;
  for (const pid of club.squad) players[pid].number = n++;
  club.wageBudget = Math.round(club.squad.reduce((a, id) => a + (players[id].wage || 0), 0) * 1.12);
  club.captainId = pickCaptain(club, players);
  club.lineup = bestLineupForClub(club, players, false);
  club.bench = bestBenchForClub(club, players, club.lineup, 7, false);
}
function pickCaptain(club, players) {
  const ps = club.squad.map(id => players[id]).filter(Boolean);
  if (!ps.length) return null;
  return sortBy(ps, p => (p.leadership || 0) * .55 + p.ovr * .3 + (p.age - 18) * .8 + (p.traits?.includes('leader') ? 10 : 0), -1)[0]?.id || ps[0].id;
}
function bestLineupForClub(club, players, excludeUnavailable = false, formationOverride) {
  const formation = formationOverride || club.formation || '4-4-2';
  const all = club.squad.map(id => players[id]).filter(Boolean)
    .filter(p => !excludeUnavailable || (p.injuryDays <= 0 && p.suspension <= 0));
  return buildBestLineup(all, formation);
}
function bestBenchForClub(club, players, lineup, count = 7, excludeUnavailable = true) {
  const used = new Set((lineup || club.lineup || []).map(x => x.playerId).filter(Boolean));
  const all = club.squad.map(id => players[id]).filter(Boolean)
    .filter(p => !excludeUnavailable || (p.injuryDays <= 0 && p.suspension <= 0));
  return buildBestBench(all, used, count).map(p => p.id);
}
function generateDivisionFixtures(clubIds, tier) {
  const ids = shuffle(clubIds);
  const n = ids.length;
  const rounds = [];
  const arr = ids.slice();
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i], b = arr[n - 1 - i];
      pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    const fixed = arr[0];
    const rest = arr.slice(1);
    rest.unshift(rest.pop());
    arr.splice(0, arr.length, fixed, ...rest);
  }
  const fixtures = [];
  for (let r = 0; r < rounds.length; r++) for (const [h, a] of rounds[r]) fixtures.push({ id: nextFixtureId++, tier, round: r + 1, home: h, away: a, played: false, hg: 0, ag: 0, scorers: [], stats: null });
  for (let r = 0; r < rounds.length; r++) for (const [h, a] of rounds[r]) fixtures.push({ id: nextFixtureId++, tier, round: r + 1 + n - 1, home: a, away: h, played: false, hg: 0, ag: 0, scorers: [], stats: null });
  return fixtures;
}
function seasonStartISO(year) {
  const d = new Date(year, 2, 1);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* -------------------------------------------------------------------------
   5. 队徽与球衣
   ------------------------------------------------------------------------- */
function svgData(svg) { return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; }
function makeCrest(colors, name, style = 0, seed = 1) {
  const [p, s] = colors;
  const init = esc(initials(name));
  const star = (seed % 7 === 0);
  let inner = '';
  if (style === 0) {
    inner = `<path d="M128 18L228 52V142c0 70-47 107-100 126C75 249 28 212 28 142V52z" fill="${p}" stroke="${s}" stroke-width="7"/><path d="M128 38L208 66v75c0 52-34 82-80 101-46-19-80-49-80-101V66z" fill="none" stroke="${s}" stroke-width="3" opacity=".45"/>`;
  } else if (style === 1) {
    inner = `<circle cx="128" cy="140" r="105" fill="${p}" stroke="${s}" stroke-width="8"/><circle cx="128" cy="140" r="84" fill="none" stroke="${s}" stroke-width="3" opacity=".45"/><path d="M128 38v204M26 140h204" stroke="${s}" stroke-width="2" opacity=".22"/>`;
  } else if (style === 2) {
    inner = `<path d="M128 20l106 42v98c0 66-45 109-106 134C67 269 22 226 22 160V62z" fill="none" stroke="${s}" stroke-width="9"/><path d="M128 35l90 36v89c0 58-40 94-90 117-50-23-90-59-90-117V71z" fill="${p}"/>`;
  } else {
    inner = `<path d="M64 36h128l26 35-31 170c-1 6-6 10-12 10h-94c-6 0-11-4-12-10L38 71z" fill="${p}" stroke="${s}" stroke-width="7"/><path d="M74 50h108l15 20-23 151h-92L59 70z" fill="none" stroke="${s}" stroke-width="2.5" opacity=".4"/>`;
  }
  const starMark = star ? `<path d="M128 62l8 24 25 1-20 15 7 24-20-14-20 14 7-24-20-15 25-1z" fill="${s}" opacity=".9"/>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 288"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".16"/><stop offset=".55" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity=".2"/></linearGradient></defs>${inner}${starMark}<text x="128" y="176" text-anchor="middle" font-family="'Microsoft YaHei','PingFang SC',sans-serif" font-size="56" font-weight="700" fill="${s}" letter-spacing="2">${init}</text><rect x="0" y="0" width="256" height="288" fill="url(#g)"/></svg>`;
  return svgData(svg);
}
function isLightColor(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ''));
  if (!m) return true;
  const r = parseInt(m[1], 16) / 255, g = parseInt(m[2], 16) / 255, b = parseInt(m[3], 16) / 255;
  return .2126 * r + .7152 * g + .0722 * b > .55;
}
function makeKit(colors, pattern = 'sash', numberText = '10') {
  const [p, s] = colors;
  // 球衣主体左右对称，中心线固定在 x=130；所有花纹都用 clipPath 裁进衣服内。
  const body = 'M92 34C100 52 113 60 130 60C147 60 160 52 168 34L202 46L222 92L190 108L190 260C190 267 185 272 178 272L82 272C75 272 70 267 70 260L70 108L38 92L58 46Z';
  let deco = '';
  if (pattern === 'stripes') {
    deco = [45, 83, 121, 159, 197].map(x => `<rect x="${x}" y="0" width="18" height="280" fill="${s}" opacity=".9"/>`).join('');
  } else if (pattern === 'sash') {
    deco = `<path d="M60 0L98 0L188 280L150 280Z" fill="${s}" opacity=".92"/>`;
  } else if (pattern === 'halves') {
    deco = `<rect x="0" y="0" width="130" height="280" fill="${s}" opacity=".92"/>`;
  } else if (pattern === 'hoops') {
    deco = [84, 146, 208].map(y => `<rect x="0" y="${y}" width="260" height="24" fill="${s}" opacity=".9"/>`).join('');
  }
  // 号码底板用与辅色相反的明暗，保证号码在任何花纹上都清楚。
  const light = isLightColor(s);
  const plateFill = light ? 'rgba(10,15,12,.58)' : 'rgba(250,247,240,.82)';
  const plateStroke = light ? 'rgba(255,255,255,.16)' : 'rgba(0,0,0,.26)';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 280">
  <defs>
    <clipPath id="kit-body"><path d="${body}"/></clipPath>
    <linearGradient id="kit-shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".2"/></linearGradient>
  </defs>
  <path d="${body}" fill="${p}" stroke="rgba(0,0,0,.24)" stroke-width="2" stroke-linejoin="round"/>
  <g clip-path="url(#kit-body)">${deco}<rect x="0" y="0" width="260" height="280" fill="url(#kit-shade)"/></g>
  <path d="M96 36C104 53 116 61 130 61C144 61 156 53 164 36" fill="none" stroke="${s}" stroke-width="5" stroke-linecap="round" opacity=".92"/>
  <path d="M44 93L68 105" stroke="${s}" stroke-width="5" stroke-linecap="round" opacity=".9"/>
  <path d="M216 93L192 105" stroke="${s}" stroke-width="5" stroke-linecap="round" opacity=".9"/>
  <rect x="104" y="152" width="52" height="56" rx="9" fill="${plateFill}" stroke="${plateStroke}" stroke-width="1.5"/>
  <text x="130" y="193" text-anchor="middle" font-family="'Bahnschrift','Arial Narrow',sans-serif" font-size="42" font-weight="700" fill="${s}" opacity=".98">${esc(numberText)}</text>
</svg>`;
  return svgData(svg);
}
function crestFor(club) { return club?.logo || makeCrest(club?.colors || ['#7b7b6d', '#eee'], club?.name || '?', 1, club?.id || 1); }
function kitFor(club) { return club?.kit || makeKit(club?.colors || ['#7b7b6d', '#eee'], 'solid'); }


/* -------------------------------------------------------------------------
   6. 查询与通用辅助
   ------------------------------------------------------------------------- */
function userClub() { return G?.clubs?.[G.userClubId] || null; }
function player(id) { return G?.players?.[id] || null; }
function clubById(id) { return G?.clubs?.[id] || null; }
function squadPlayers(clubOrId) {
  const c = typeof clubOrId === 'object' ? clubOrId : clubById(clubOrId);
  if (!c) return [];
  return c.squad.map(id => player(id)).filter(Boolean);
}
function availableSquadPlayers(clubOrId) { return squadPlayers(clubOrId).filter(p => p.injuryDays <= 0 && p.suspension <= 0); }
function isUserPlayer(p) { return p && p.clubId === G?.userClubId; }
function isLoanedOut(p) { return !!(p?.loan && p.clubId !== p.loan.fromClubId); }
function otherClubs() { return Object.values(G.clubs).filter(c => !c.isUser); }
function managerName() { return G?.manager || '无名教练'; }
function currentSeasonLabel() { return G?.season?.label || '赛季'; }
function unreadNewsCount() { return (G?.news || []).filter(n => n.unread).length; }
function moraleInfo(v) {
  if (v >= 82) return { label: '亢奋', cls: 'green' };
  if (v >= 66) return { label: '满意', cls: 'green' };
  if (v >= 50) return { label: '平稳', cls: 'gold' };
  if (v >= 34) return { label: '低落', cls: 'orange' };
  if (v >= 18) return { label: '不满', cls: 'red' };
  return { label: '愤怒', cls: 'red' };
}
function fitnessInfo(v) {
  if (v >= 86) return { label: '充沛', cls: 'green' };
  if (v >= 70) return { label: '良好', cls: '' };
  if (v >= 55) return { label: '疲劳', cls: 'orange' };
  if (v >= 35) return { label: '疲惫', cls: 'red' };
  return { label: '透支', cls: 'red' };
}
function formInfo(v) {
  if (v >= 72) return { label: '火热', cls: 'green' };
  if (v >= 58) return { label: '稳定', cls: '' };
  if (v >= 42) return { label: '一般', cls: 'orange' };
  return { label: '低迷', cls: 'red' };
}
function ovrClass(v) { return v >= 70 ? 'hi' : v >= 50 ? 'mid' : 'lo'; }
function playerStatusTags(p) {
  const tags = [];
  if (p.injuryDays > 0) tags.push(`<span class="tag red">伤停 ${p.injuryDays} 天</span>`);
  if (p.suspension > 0) tags.push(`<span class="tag red">停赛 ${Math.ceil(p.suspension)} 场</span>`);
  if (p.loan) tags.push('<span class="tag blue">租借</span>');
  if (p.transferStatus === 'requested') tags.push('<span class="tag orange">申请离队</span>');
  if (p.transferStatus === 'listed') tags.push('<span class="tag gold">挂牌</span>');
  if (p.transferStatus === 'loan') tags.push('<span class="tag blue">外租</span>');
  if (p.hidden) tags.push('<span class="tag gold">神秘天赋</span>');
  return tags.join('');
}
function squadRoleStatus(p, club = userClub()) {
  if (!p || !club) return { label: '未上场', cls: 'faint' };
  const inLineup = (club.lineup || []).some(x => x.playerId === p.id);
  if (inLineup) return { label: '首发', cls: 'gold' };
  const inBench = (club.bench || []).includes(p.id);
  if (inBench) return { label: '替补席', cls: 'blue' };
  return { label: '未上场', cls: 'faint' };
}
function squadRoleTag(p, club = userClub()) {
  const s = squadRoleStatus(p, club);
  return `<span class="tag ${s.cls}">${s.label}</span>`;
}
function getUserSquadSorted() {
  const c = userClub();
  if (!c) return [];
  return squadPlayers(c).slice().sort((a, b) => {
    const groupA = ['GK', 'DF', 'MF', 'FW'].indexOf(POS_GROUP[a.pos] || 'MF');
    const groupB = ['GK', 'DF', 'MF', 'FW'].indexOf(POS_GROUP[b.pos] || 'MF');
    return groupA - groupB || b.ovr - a.ovr;
  });
}
function autoLineupScore(p, role) {
  if (!p) return -1e9;
  if (role === 'GK') {
    return p.pos === 'GK'
      ? p.ovr + (p.fitness ?? 100) * .03 + (p.form ?? 55) * .04
      : -1e9;
  }
  if (p.pos === 'GK') return -1e9;
  const fit = positionFit(p.pos, role);
  let score = effectiveOvrForRole(p, role) + fit * 16;
  if (p.pos === role) score += 4;
  if (fit < .5) score -= 6;
  if (fit < .35) score -= 12;
  if (POS_GROUP[p.pos] !== POS_GROUP[role]) score -= 8;
  score += ((p.form ?? 55) - 55) * .10;
  score += ((p.morale ?? 60) - 60) * .04;
  score += ((p.fitness ?? 100) - 80) * .08;
  return score;
}
// 最大权匹配（匈牙利算法）：给定位置和候选球员，求“总评分最高”的一对一分配。
// 之前的贪心 + 局部交换无法摆脱局部最优（例如强点先占了边路，中锋位置只剩弱替补），
// 这里直接一次求出全局最优解，复杂度 O(max(位置数, 人数)^3)，实际规模只有 10×26。
function solveLineupAssignment(slots, players, scoreFor) {
  const n = slots.length, m = players.length;
  if (!n) return [];
  if (!m) return new Array(n).fill(-1);
  const size = Math.max(n, m);
  const weights = [];
  let maxScore = 0;
  for (let i = 0; i < n; i++) {
    const row = [];
    for (let j = 0; j < m; j++) {
      const s = scoreFor(players[j], slots[i]);
      row.push(s);
      if (s > maxScore) maxScore = s;
    }
    weights.push(row);
  }
  // 空位罚分远大于任何真实评分：只有在人手不够时才会留下空位。
  const emptyPenalty = maxScore * 4 + 1000;
  const cost = [];
  for (let i = 0; i < size; i++) {
    const row = [];
    for (let j = 0; j < size; j++) {
      if (i < n && j < m) row.push(maxScore - weights[i][j]);
      else if (i < n) row.push(emptyPenalty);
      else row.push(0);
    }
    cost.push(row);
  }
  const u = new Array(size + 1).fill(0), v = new Array(size + 1).fill(0);
  const match = new Array(size + 1).fill(0), way = new Array(size + 1).fill(0);
  for (let i = 1; i <= size; i++) {
    match[0] = i;
    let j0 = 0;
    const minv = new Array(size + 1).fill(Infinity);
    const used = new Array(size + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = match[j0];
      let delta = Infinity, j1 = 0;
      for (let j = 1; j <= size; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= size; j++) {
        if (used[j]) { u[match[j]] += delta; v[j] -= delta; }
        else minv[j] -= delta;
      }
      j0 = j1;
    } while (match[j0] !== 0);
    do { const j1 = way[j0]; match[j0] = match[j1]; j0 = j1; } while (j0);
  }
  const assign = new Array(n).fill(-1);
  for (let j = 1; j <= size; j++) {
    const i = match[j];
    if (i >= 1 && i <= n && j <= m) assign[i - 1] = j - 1;
  }
  return assign;
}
function buildBestLineup(playerList, formation = '4-4-2') {
  const slots = FORMATION_SLOTS[formation] || FORMATION_SLOTS['4-4-2'];
  const eligible = playerList.filter(Boolean);
  const out = slots.map(s => ({ slot: s.pos, playerId: null }));
  const used = new Set();
  // 门将单独处理，绝不让非门将客串，也不让门将去踢外场。
  const gkIndex = slots.findIndex(s => s.pos === 'GK');
  if (gkIndex >= 0) {
    let gk = null, gkScore = -Infinity;
    for (const p of eligible) {
      if (p.pos !== 'GK') continue;
      const score = autoLineupScore(p, 'GK');
      if (score > gkScore) { gkScore = score; gk = p; }
    }
    if (gk) { out[gkIndex] = { slot: 'GK', playerId: gk.id }; used.add(gk.id); }
  }
  // 外场位置一次求出全局最优分配，不再依赖贪心落位后的两两交换。
  const slotRefs = [];
  for (let i = 0; i < slots.length; i++) if (slots[i].pos !== 'GK') slotRefs.push({ pos: slots[i].pos, i });
  const outfield = eligible.filter(p => p.pos !== 'GK' && !used.has(p.id));
  if (slotRefs.length && outfield.length) {
    const assign = solveLineupAssignment(slotRefs, outfield, (p, slot) => autoLineupScore(p, slot.pos));
    for (let r = 0; r < slotRefs.length; r++) {
      const j = assign[r];
      if (j < 0) continue;
      out[slotRefs[r].i] = { slot: slotRefs[r].pos, playerId: outfield[j].id };
    }
  }
  return out;
}
function bestLineupPlayers(club, availableOnly = true) {
  const eligible = squadPlayers(club).filter(p => !availableOnly || (p.injuryDays <= 0 && p.suspension <= 0));
  return buildBestLineup(eligible, club.formation || '4-4-2');
}
function buildBestBench(playerList, usedIds, count = BENCH_SIZE) {
  const used = usedIds instanceof Set ? usedIds : new Set(usedIds || []);
  const available = playerList.filter(p => p && !used.has(p.id));
  const score = p => p.ovr + (p.fitness ?? 100) * .08 + ((p.form ?? 55) - 55) * .08 + ((p.morale ?? 60) - 60) * .03;
  const byGroup = { GK: [], DF: [], MF: [], FW: [] };
  for (const p of available) (byGroup[POS_GROUP[p.pos] || 'MF']).push(p);
  for (const g of Object.values(byGroup)) g.sort((a, b) => score(b) - score(a));
  const chosen = [], chosenIds = new Set();
  const take = p => {
    if (!p || chosen.length >= count || chosenIds.has(p.id)) return false;
    chosen.push(p); chosenIds.add(p.id); return true;
  };
  // 替补席优先保证门将 + 后卫/中场/前锋都有覆盖，再按能力补满。
  if (byGroup.GK.length) take(byGroup.GK.shift());
  const groups = ['DF', 'MF', 'FW'];
  let progressed = true;
  while (chosen.length < count && progressed) {
    progressed = false;
    for (const g of groups) {
      if (chosen.length >= count) break;
      const p = byGroup[g].shift();
      if (p) { take(p); progressed = true; }
    }
  }
  if (chosen.length < count) {
    const rest = Object.values(byGroup).flat().filter(p => !chosenIds.has(p.id)).sort((a, b) => score(b) - score(a));
    for (const p of rest) { if (chosen.length >= count) break; take(p); }
  }
  return chosen;
}
function bestBenchIds(club, count = BENCH_SIZE) {
  const used = new Set((club.lineup || []).map(x => x.playerId).filter(Boolean));
  const idle = squadPlayers(club).filter(p => !used.has(p.id) && !p.loan && p.injuryDays <= 0 && p.suspension <= 0);
  return buildBestBench(idle, used, count).map(p => p.id);
}
// 只把“健康、属于本队、没有重复”的球员留在首发；空出来的位置用可用的最佳球员补上。
// 这样“自动排阵”把伤号排除后不会被下一次渲染又塞回首发。
function sanitizeLineup(c, slots, rebuild = false) {
  if (!c) return [];
  if (rebuild || !Array.isArray(c.lineup) || c.lineup.length !== slots.length) {
    c.lineup = bestLineupPlayers(c, true).map(x => ({ ...x }));
    return c.lineup;
  }
  const seen = new Set();
  c.lineup = slots.map((s, i) => {
    const rawId = Number(c.lineup[i]?.playerId);
    const p = rawId ? player(rawId) : null;
    if (!p || p.clubId !== c.id || p.loan || seen.has(p.id)) return { slot: s.pos, playerId: null };
    seen.add(p.id);
    return { slot: s.pos, playerId: p.id };
  });
  return c.lineup;
}
function fillEmptyLineupSlots(c, slots = FORMATION_SLOTS[c?.formation] || FORMATION_SLOTS['4-4-2']) {
  if (!c) return;
  const used = new Set((c.lineup || []).map(x => Number(x.playerId)).filter(Boolean));
  const available = squadPlayers(c).filter(p => !used.has(p.id) && !p.loan && p.injuryDays <= 0 && p.suspension <= 0);
  if (!available.length) return;
  const emptySlots = [];
  for (let i = 0; i < slots.length; i++) if (!c.lineup[i]?.playerId) emptySlots.push({ pos: slots[i].pos, i });
  if (!emptySlots.length) return;
  // 门将位只用门将补，外场位用最大权匹配补，避免“先补的位置抢走最合适的球员”。
  for (const slot of emptySlots.filter(s => s.pos === 'GK')) {
    let gk = null, gkScore = -Infinity;
    for (const p of available) {
      if (p.pos !== 'GK' || used.has(p.id)) continue;
      const score = autoLineupScore(p, 'GK');
      if (score > gkScore) { gkScore = score; gk = p; }
    }
    if (!gk) continue;
    c.lineup[slot.i] = { slot: 'GK', playerId: gk.id };
    used.add(gk.id);
  }
  const rest = emptySlots.filter(s => s.pos !== 'GK');
  const fieldPlayers = available.filter(p => p.pos !== 'GK' && !used.has(p.id));
  if (!rest.length || !fieldPlayers.length) return;
  const assign = solveLineupAssignment(rest, fieldPlayers, (p, s) => autoLineupScore(p, s.pos));
  for (let r = 0; r < rest.length; r++) {
    const j = assign[r];
    if (j < 0) continue;
    c.lineup[rest[r].i] = { slot: rest[r].pos, playerId: fieldPlayers[j].id };
  }
}
function ensureUserLineupValid() {
  const c = userClub();
  if (!c) return false;
  const slots = FORMATION_SLOTS[c.formation] || FORMATION_SLOTS['4-4-2'];
  sanitizeLineup(c, slots, false);
  fillEmptyLineupSlots(c, slots);
  normalizeUserBench();
  return true;
}
function normalizeUserBench() {
  const c = userClub();
  if (!c) return;
  const lineupIds = new Set((c.lineup || []).map(x => Number(x.playerId)).filter(Boolean));
  const seen = new Set();
  const out = [];
  for (const rawId of (c.bench || [])) {
    const id = Number(rawId);
    const p = player(id);
    if (!p || p.clubId !== c.id || lineupIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= BENCH_SIZE) break;
  }
  c.bench = out;
}
function allPlayedFixturesOfClub(clubId) {
  const out = [];
  for (const div of Object.values(G.divisions)) out.push(...div.fixtures.filter(f => f.played && (f.home === clubId || f.away === clubId)));
  return out.sort((a, b) => a.round - b.round);
}
function currentFormFor(clubId, limit = 5) {
  return allPlayedFixturesOfClub(clubId).slice(-limit).map(f => resultForClub(f, clubId)).filter(Boolean).join('');
}
function resultForClub(f, clubId) {
  if (!f.played) return '';
  const h = f.home === clubId;
  const gf = h ? f.hg : f.ag;
  const ga = h ? f.ag : f.hg;
  return gf > ga ? 'W' : gf < ga ? 'L' : 'D';
}
function fixtureOpponent(f, clubId) { return f.home === clubId ? f.away : f.home; }
function findUserFixture(round = G.season.round) {
  const c = userClub();
  const div = G.divisions[c?.tier];
  if (!div) return null;
  return div.fixtures.find(f => f.round === round && (f.home === G.userClubId || f.away === G.userClubId)) || null;
}
function nextUserFixture() {
  const c = userClub();
  if (!c) return null;
  const div = G.divisions[c.tier];
  if (!div) return null;
  return div.fixtures.find(f => (f.home === c.id || f.away === c.id) && !f.played) || null;
}
function userHasPlayedRound(round) { const f = findUserFixture(round); return !!(f && f.played); }
function getFixtureById(id) {
  for (const div of Object.values(G.divisions)) {
    const f = div.fixtures.find(x => x.id === id);
    if (f) return f;
  }
  return null;
}
function allFixturesOfClub(clubId) {
  const c = clubById(clubId);
  if (!c) return [];
  return G.divisions[c.tier]?.fixtures.filter(f => f.home === clubId || f.away === clubId).sort((a, b) => a.round - b.round) || [];
}
function teamPower(clubId) {
  const c = clubById(clubId);
  if (!c) return 30;
  const players = squadPlayers(c);
  if (!players.length) return 20;
  const sorted = players.slice().sort((a, b) => (b.ovr + (b.form || 55) * .04) - (a.ovr + (a.form || 55) * .04));
  const top = sorted.slice(0, 11);
  let power = avg(top.map(p => p.ovr));
  const best = sorted[0]?.ovr || 30;
  power += clamp(best - power, 0, 12) * .2;
  const avgFit = avg(top.map(p => (p.fitness ?? 90) / 100));
  const avgMorale = avg(top.map(p => (p.morale ?? 60) / 100));
  return round(power * (0.88 + avgFit * .1) * (0.96 + avgMorale * .04), 1);
}
function clubStarPlayers(clubId, n = 3) { return squadPlayers(clubId).sort((a, b) => b.ovr - a.ovr).slice(0, n); }
function computeStandings(tier) {
  const div = G.divisions[tier];
  if (!div) return [];
  const rows = div.clubIds.map(id => ({ clubId: id, club: clubById(id), played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, points: 0 }));
  const map = Object.fromEntries(rows.map(r => [r.clubId, r]));
  for (const f of div.fixtures) {
    if (!f.played) continue;
    const h = map[f.home], a = map[f.away];
    if (!h || !a) continue;
    h.played++; a.played++;
    h.gf += f.hg; h.ga += f.ag; a.gf += f.ag; a.ga += f.hg;
    if (f.hg > f.ag) { h.wins++; a.losses++; h.points += 3; }
    else if (f.hg < f.ag) { a.wins++; h.losses++; a.points += 3; }
    else { h.draws++; a.draws++; h.points++; a.points++; }
  }
  rows.sort((a, b) => b.points - a.points || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || b.wins - a.wins || a.club.name.localeCompare(b.club.name, 'zh-Hans-CN'));
  rows.forEach((r, i) => { r.position = i + 1; r.gd = r.gf - r.ga; });
  return rows;
}
function userStanding() {
  const t = userClub()?.tier;
  if (!t) return null;
  return computeStandings(t).find(r => r.clubId === G.userClubId) || null;
}
function divisionPositionPrize(tier, position) {
  const arr = TIERS[tier]?.prize || [];
  return arr[position - 1] || arr[arr.length - 1] || 0;
}
function transferWindowOpen() {
  const w = G?.season?.week || 1;
  return w <= 4 || (w >= 11 && w <= 14);
}
function transferWindowLabel() {
  if (!transferWindowOpen()) return '转会窗关闭';
  return G.season.week <= 4 ? '季初转会窗' : '中期转会窗';
}
function refreshTransferWindow() {
  if (!G?.season) return;
  G.season.transferWindowOpen = transferWindowOpen();
  G.season.transferWindowLabel = transferWindowLabel();
}
function addNews(title, body = '', type = 'club', opts = {}) {
  if (!G) return;
  G.news.unshift({
    id: `n${Date.now()}${randInt(100, 999)}${G.news.length}`, title, body, type,
    day: G.meta?.totalDays || 0, season: G.season?.number || 1, week: G.season?.week || 1,
    unread: opts.unread !== false, action: opts.action || null, data: opts.data || null,
  });
  if (G.news.length > 80) G.news.length = 80;
}
function markAllNewsRead() { (G.news || []).forEach(n => n.unread = false); }
function addLedger(amount, title, note = '', category = 'other') {
  const c = userClub();
  if (!c) return;
  c.cash += amount;
  c.ledger.unshift({
    id: `l${Date.now()}${randInt(100, 999)}`, day: G.meta?.totalDays || 0, season: G.season?.number || 1, week: G.season?.week || 1,
    date: currentDate().toISOString().slice(0, 10), amount: Math.round(amount), title, note, category,
  });
  if (c.ledger.length > 240) c.ledger.length = 240;
}
function clubWageBill(club) {
  if (!club) return 0;
  let total = 0;
  const inSquad = new Set(club.squad);
  for (const id of club.squad) {
    const p = player(id);
    if (!p) continue;
    if (p.loan) {
      if (p.loan.toClubId === club.id) total += Math.round(p.wage * (p.loan.wageShare ?? 50) / 100);
      else if (p.loan.fromClubId === club.id) total += Math.round(p.wage * (100 - (p.loan.wageShare ?? 50)) / 100);
      else total += p.wage;
    } else total += p.wage;
  }
  // 外租球员已不在 squad 中，但母队可能仍需承担部分工资
  for (const p of Object.values(G?.players || {})) {
    if (inSquad.has(p.id) || !p.loan) continue;
    if (p.loan.fromClubId === club.id) total += Math.round(p.wage * (100 - (p.loan.wageShare ?? 50)) / 100);
  }
  return Math.round(total);
}
function clubSquadValue(club) { return squadPlayers(club).reduce((a, p) => a + calcValue(p), 0); }
function clubFacilityUpkeep(club) {
  const f = club.facility || { training: 1, medical: 1, youth: 1 };
  const scale = { 1: 12, 2: 7, 3: 4, 4: 2, 5: 1 }[club.tier] || 1;
  let upkeep = (f.training * 1100 + f.medical * 750 + f.youth * 900) * scale;
  if (!club.groundOwned) upkeep += (2500 + f.training * 500) * scale * .45;
  else upkeep += 900 * scale;
  upkeep += club.capacity * 0.8;
  return Math.round(upkeep);
}
function weeklySponsorIncome(club) {
  const sp = club.sponsor;
  if (!sp || sp.endWeek < (G?.season?.week || 1)) return 0;
  return sp.weekly || 0;
}
function remainingWeeksInSeason() { return Math.max(1, 22 - (G?.season?.week || 1) + 1); }
function calculateWeeklyProjection() {
  const c = userClub();
  if (!c) return { income: 0, expense: 0, net: 0, items: [] };
  const tv = TIERS[c.tier]?.tv || 0;
  const sponsor = weeklySponsorIncome(c);
  const merch = Math.round(c.fanbase * c.ticket * .035);
  const wages = clubWageBill(c);
  const facility = clubFacilityUpkeep(c);
  const interest = Math.round((c.bankLoan || 0) * .009);
  const annualPay = (c.payable || []).filter(x => x.dueSeason === G.season.number).reduce((a, x) => a + x.amount, 0);
  const annualReceive = (c.receivable || []).filter(x => x.dueSeason === G.season.number).reduce((a, x) => a + x.amount, 0);
  const installments = 0;
  const income = tv + sponsor + merch;
  const expense = wages + facility + interest;
  return { income, expense, net: income - expense, tv, sponsor, merch, wages, facility, interest, installments, annualPay, annualReceive };
}
function estimatedAttendance(club, opponent, isHome = true) {
  if (!club || !isHome) return 0;
  const t = TIERS[club.tier];
  const basePrice = t.ticket;
  const priceRatio = (club.ticket || basePrice) / basePrice;
  const fillBase = clamp(0.25 + (club.fanbase / Math.max(1, club.capacity)) * .55, .18, .96);
  const recent = currentFormFor(club.id, 5);
  let formBonus = 0;
  for (const ch of recent) formBonus += ch === 'W' ? .035 : ch === 'D' ? .005 : -.018;
  const opp = opponent ? clubById(opponent) : null;
  const oppBonus = opp ? clamp((opp.reputation - club.reputation) / 300, -.02, .07) : 0;
  const pricePenalty = clamp(1 - (priceRatio - 1) * .58, .5, 1.12);
  const rivalBonus = opp && opp.tier === club.tier ? .01 : 0;
  const fill = clamp(fillBase * pricePenalty + formBonus + oppBonus + rivalBonus + normal(0, .025), .12, 1);
  return Math.round(clamp(club.capacity * fill, Math.min(180, club.capacity), club.capacity));
}
function matchdayIncome(club, opponent) {
  const attendance = estimatedAttendance(club, opponent, true);
  const ticketRevenue = attendance * (club.ticket || 30);
  const concessions = Math.round(attendance * (club.ticket || 30) * .22);
  const matchSponsor = Math.round(attendance * 3.2 + (club.reputation || 10) * 45);
  return { attendance, ticketRevenue, concessions, matchSponsor, total: ticketRevenue + concessions + matchSponsor };
}
function fanbaseDeltaAfterResult(club, result, opponentRep, attendance) {
  let delta = result === 'W' ? randInt(6, 18) : result === 'D' ? randInt(-1, 5) : randInt(-10, -2);
  delta = Math.round(delta * (1 + (opponentRep || 20) / 160));
  if (attendance / Math.max(1, club.capacity) > .88) delta += randInt(3, 9);
  const old = club.fanbase;
  club.fanbase = Math.max(150, Math.round(old + delta * (club.tier <= 2 ? 12 : club.tier === 3 ? 4 : 1)));
  return club.fanbase - old;
}
function setBoardGoal() {
  const c = userClub();
  if (!c) return;
  const table = computeStandings(c.tier);
  const powers = table.map(r => ({ id: r.clubId, p: teamPower(r.clubId) })).sort((a, b) => b.p - a.p);
  const rank = powers.findIndex(x => x.id === c.id) + 1;
  let target = 8, goalText = '稳定中游';
  if (rank <= 2) { target = 2; goalText = '争夺升级资格'; }
  else if (rank <= 4) { target = 4; goalText = '冲击前半区与升级区'; }
  else if (rank <= 8) { target = 8; goalText = '进入联赛上半区'; }
  else { target = 10; goalText = '完成保级，避免垫底'; }
  G.board.targetPosition = target;
  G.board.goal = goalText;
  c.expectation = goalText;
  c.boardConfidence = clamp(c.boardConfidence, 20, 95);
  addNews('董事会确定赛季目标', `本赛季${goalText}。董事会将根据最终排名、财政状况和球队士气进行评估。`, 'board');
}
function updateBoardAfterMatch(result, home, opponentRep) {
  const b = G.board;
  let d = result === 'W' ? 4 : result === 'D' ? 0 : -4;
  if (!home) d += .5;
  d += (opponentRep - userClub().reputation) / 90;
  b.confidence = Math.round(clamp(b.confidence + d, 0, 100));
  userClub().boardConfidence = b.confidence;
  if (b.confidence < 22) addNews('董事会发出警告', '球队近期表现与投入不相称，董事会要求尽快扭转局面。', 'board');
}
function sponsorBrands() {
  return [
    ['岚图动力','汽车制造'],['北岸银行','金融服务'],['晨光饮料','运动饮料'],['铁桥重工','工业装备'],
    ['云岭航空','航空出行'],['星河通讯','通讯科技'],['新港物流','物流运输'],['白鹿乳业','乳制品'],
    ['金湾地产','城市建设'],['极光能源','新能源'],['松江啤酒','啤酒酿造'],['海岬旅游','文旅度假'],
    ['东湖汽车','汽车销售'],['青藤科技','互联网服务'],['长风保险','保险服务'],['赤岩建材','建筑材料'],
    ['南塘食品','食品加工'],['灯塔照明','照明设备'],['野马体育','运动装备'],['云际酒店','酒店集团'],
  ];
}
function makeSponsorOffers(club) {
  const tier = club.tier || 5;
  const t = TIERS[tier];
  const brands = shuffle(sponsorBrands());
  const offers = [];
  for (let i = 0; i < 3; i++) {
    const [name, sector] = brands[i];
    const reputationFactor = .7 + clamp(club.reputation / 100, 0, .6);
    const base = lerp(t.sponsor[0], t.sponsor[2], rand() * .75 + .08) * reputationFactor;
    const weekly = Math.round(base / 500) * 500;
    const duration = randInt(10, 18);
    const upfront = weekly * randInt(2, 4);
    const objectives = [
      { type: 'topHalf', label: '赛季结束进入联赛上半区', target: 6, bonus: weekly * randInt(4, 7) },
      { type: 'wins', label: `赛季取得至少 ${Math.min(14, 8 + tier)} 场胜利`, target: Math.min(14, 8 + tier), bonus: weekly * randInt(3, 6) },
      { type: 'top6', label: '赛季结束位列前六', target: 6, bonus: weekly * randInt(3, 5) },
      { type: 'none', label: '无附加成绩要求', target: 0, bonus: 0 },
      { type: 'promotion', label: '率队升级', target: 0, bonus: weekly * randInt(6, 10) },
    ];
    const objective = objectives[randInt(0, objectives.length - 1)];
    const startWeek = G?.season?.week || 1;
    offers.push({ id: `sp${Date.now()}${randInt(100,999)}${i}`, name, sector, weekly, upfront, duration, startWeek, endWeek: Math.min(22, startWeek + duration - 1), objective, active: false, signedWeek: null });
  }
  return offers;
}
function activeSponsor() {
  const sp = userClub()?.sponsor;
  if (!sp) return null;
  if (sp.endWeek < G.season.week) return null;
  return sp;
}
function signSponsor(offerId) {
  const c = userClub();
  const offer = (c.sponsorOffers || []).find(o => o.id === offerId);
  if (!offer) return toast('合同不存在', '这份报价已经失效。', 'bad');
  if (activeSponsor()) return toast('已有赞助商', '当前合同结束前无法另签主赞助商。', 'bad');
  c.sponsor = { ...offer, active: true, signedWeek: G.season.week };
  c.sponsorOffers = (c.sponsorOffers || []).filter(o => o.id !== offerId);
  addLedger(offer.upfront, `主赞助签约：${offer.name}`, `签字费 · ${offer.sector}`, 'sponsor');
  addNews('新的主赞助商', `俱乐部与${offer.name}签下主赞助合同：签字费 ${fmtMoney(offer.upfront)}，每周 ${fmtMoney(offer.weekly)}。`, 'finance');
  toast('赞助合同签署', `${offer.name} 的签字费已到账。`, 'good');
  saveGame(); renderApp();
}
function payWeeklySponsor() {
  const c = userClub();
  const sp = activeSponsor();
  if (!sp) return;
  if (G.season.week <= sp.endWeek && G.season.week > sp.signedWeek) addLedger(sp.weekly, `赞助商周付：${sp.name}`, sp.sector, 'sponsor');
}
function evaluateSponsorObjective() {
  const c = userClub();
  const sp = c.sponsor;
  if (!sp || !sp.objective || sp.objective.type === 'none' || sp.objective.bonus <= 0) return null;
  const table = computeStandings(c.tier);
  const row = table.find(r => r.clubId === c.id);
  if (!row) return null;
  let ok = false;
  const o = sp.objective;
  if (o.type === 'topHalf') ok = row.position <= 6;
  else if (o.type === 'top6') ok = row.position <= 6;
  else if (o.type === 'wins') ok = row.wins >= o.target;
  else if (o.type === 'promotion') ok = row.position <= 2;
  if (ok) {
    addLedger(o.bonus, `${sp.name} 成绩奖金`, o.label, 'sponsor');
    addNews('赞助商奖金到账', `${sp.name} 认可球队完成「${o.label}」，支付奖金 ${fmtMoney(o.bonus)}。`, 'finance');
  } else {
    addNews('赞助商目标未达成', `${sp.name} 的合同目标「${o.label}」未能完成，未触发奖金。`, 'finance');
  }
  return { ok, bonus: o.bonus };
}
function bankCreditLimit(club) {
  const base = { 1: 30000000, 2: 10000000, 3: 3000000, 4: 1000000, 5: 400000 }[club.tier] || 300000;
  const fan = Math.round(club.fanbase * ({ 1: 160, 2: 80, 3: 30, 4: 10, 5: 3 }[club.tier] || 3));
  return Math.max(base, Math.round((base + fan) / 10000) * 10000);
}
function gkOnPitch(club) {
  const c = club;
  if (!c) return null;
  const gkSlot = c.lineup?.find(x => x.slot === 'GK');
  if (gkSlot?.playerId) return player(gkSlot.playerId);
  return squadPlayers(c).find(p => p.pos === 'GK') || null;
}
function validateMatchdaySquad() {
  const c = userClub();
  if (!c) return { ok: false, msg: '尚未创建俱乐部' };
  ensureUserLineupValid();
  const ids = c.lineup.map(x => x.playerId).filter(Boolean);
  if (ids.length < 11) return { ok: false, msg: `首发只有 ${ids.length} 人，请先补满 11 人。` };
  const unavailable = ids.map(player).filter(p => !p || p.injuryDays > 0 || p.suspension > 0);
  if (unavailable.length) return { ok: false, msg: '首发中有伤停球员，请调整阵容。' };
  const gk = ids.map(player).filter(p => p?.pos === 'GK');
  if (!gk.length) return { ok: false, msg: '首发阵容必须包含一名门将。' };
  const benchIds = (c.bench || []).filter(id => { const p = player(id); return p && p.injuryDays <= 0 && p.suspension <= 0 && !ids.includes(id); });
  if (benchIds.length < 5) return { ok: false, msg: `替补席不足 5 人（当前 ${benchIds.length} 人），请在阵容页调整或签约。`, warnOnly: true };
  return { ok: true };
}
function getInjuryRiskText(intensity) { return { light: '低', normal: '中', high: '高' }[intensity] || '中'; }
function weekMatchLabel() {
  const f = nextUserFixture();
  if (!f) return { text: '赛季结束', sub: '' };
  const opp = clubById(fixtureOpponent(f, G.userClubId));
  return { text: `第 ${f.round} 轮 · ${f.home === G.userClubId ? '主场' : '客场'}`, sub: `对阵 ${opp?.name || '待定'} · ${fixtureDateText(f)}` };
}

/* -------------------------------------------------------------------------
   7. 日期 / 周结算 / 体力恢复
   ------------------------------------------------------------------------- */
function payWeeklyFinances() {
  const c = userClub();
  if (!c) return;
  const proj = calculateWeeklyProjection();
  payWeeklySponsor();
  addLedger(TIERS[c.tier].tv, '联赛转播分成', TIER_LABEL(c.tier), 'broadcast');
  const merch = Math.round(c.fanbase * c.ticket * .035);
  addLedger(merch, '俱乐部商品与会员收入', `球迷基础 ${fmtPlain(Math.round(c.fanbase))} 人`, 'commercial');
  addLedger(-proj.wages, '球员周薪', `${squadPlayers(c).length} 名注册球员`, 'wages');
  addLedger(-proj.facility, '设施维护与场地费用', c.groundOwned ? '自有训练基地' : '租赁训练场地', 'facility');
  if (c.bankLoan > 0) {
    const interest = Math.round(c.bankLoan * .009);
    if (interest > 0) addLedger(-interest, '银行贷款利息', `贷款余额 ${fmtMoney(c.bankLoan)}`, 'loan');
  }
  G.finance.lastWeekSummary = { ...proj, week: G.season.week };
  if (c.cash < 0) {
    G.finance.negativeWeeks++;
    c.boardConfidence = clamp(c.boardConfidence - 5, 0, 100);
    G.board.confidence = c.boardConfidence;
    for (const p of squadPlayers(c)) p.morale = clamp(p.morale - 6, 0, 100);
    addNews('俱乐部出现资金缺口', `本周结算后现金为 ${fmtMoney(c.cash)}。若持续为负，球员士气与董事会信心将进一步下降。`, 'finance');
    if (G.finance.negativeWeeks >= 3) {
      addNews('破产风险警告', '连续三周现金为负。董事会要求你立即通过出售球员、贷款或削减工资来改善账面。', 'finance');
      G.finance.bankruptcyWarning = 1;
    }
    if (G.finance.negativeWeeks >= 6 && c.cash < -500000) showBankruptcy();
  } else {
    G.finance.negativeWeeks = 0;
  }
  if (clubWageBill(c) > c.wageBudget * 1.08) {
    c.boardConfidence = clamp(c.boardConfidence - 2, 0, 100);
    addNews('工资总额超出建议上限', `当前周薪 ${fmtMoney(clubWageBill(c))}，超过董事会建议的 ${fmtMoney(c.wageBudget)}。`, 'board');
  }
}
function processWeeklyRecovery() {
  for (const c of Object.values(G.clubs)) {
    if (!c.isUser) {
      for (const id of c.squad) {
        const p = player(id);
        if (!p) continue;
        p.fitness = clamp(Math.max(p.fitness, 88) + randInt(0, 6), 0, 100);
        p.morale = clamp(p.morale + (p.morale < 55 ? 1 : 0), 0, 100);
      }
    }
  }
}
function startNewWeek(opts = {}) {
  if (!G) return;
  G.season.week += 1;
  G.season.day = 0;
  G.season.round = G.season.week;
  G.meta.totalDays += 1;
  refreshTransferWindow();
  G.trainer.weeklyLog = [];
  if (!opts.silent) {
    payWeeklyFinances();
    processWeeklyRecovery();
    processConstruction();
    checkMoraleRequests();
    refreshMarketOffersWeekly();
    if (G.season.week === 11) {
      G.season.transferWindowOpen = true;
      G.season.transferWindowLabel = '中期转会窗';
      addNews('中期转会窗开启', '联赛第 11 至 14 周为中期转会窗，其他俱乐部会开始活跃。', 'transfer');
      refreshTransferListings();
    }
    if (G.season.week === 15) addNews('中期转会窗关闭', '转会市场恢复关闭状态，已提交的报价仍会继续谈判。', 'transfer');
    if (G.season.week === 5) addNews('季初转会窗关闭', '俱乐部间转会暂停，自由球员仍可在任何时候签约。', 'transfer');
  }
  saveGame();
}
function advanceToNextDayDirect() {
  if (!G) return;
  G.season.day += 1;
  G.meta.totalDays += 1;
  dailyRecovery();
  if (G.season.day >= 7) { G.season.day = 0; startNewWeek(); }
  refreshTransferWindow();
  saveGame();
}
function dailyRecovery() {
  const c = userClub();
  if (!c) return;
  const med = c.facility.medical || 1;
  for (const p of squadPlayers(c)) {
    if (p.loan) continue;
    const ageFactor = p.age <= 22 ? 1.12 : p.age >= 31 ? .82 : 1;
    const base = 3.8 + med * .9;
    let recover = base * ageFactor + (p.traits?.includes('ironman') ? 1.2 : 0) - (p.traits?.includes('injury_prone') ? .3 : 0);
    if (p.injuryDays > 0) recover *= .35;
    if (p.fitness < 35) recover += 1.2;
    p.fitness = clamp(p.fitness + recover, 0, 100);
    if (p.suspension > 0) p.suspension = Math.max(0, p.suspension - .125);
    if (p.injuryDays > 0) {
      p.injuryDays = Math.max(0, p.injuryDays - 1);
      if (p.injuryDays === 0) addNews(`${p.name} 伤愈复出`, '医疗组确认球员已恢复合练。', 'team');
    }
  }
  for (const c2 of Object.values(G.clubs)) {
    if (c2.isUser) continue;
    for (const id of c2.squad) {
      const p = player(id);
      if (!p) continue;
      if (p.injuryDays > 0) p.injuryDays--;
      if (p.suspension > 0) p.suspension = Math.max(0, p.suspension - .125);
    }
  }
}
function checkMoraleRequests() {
  const c = userClub();
  if (!c) return;
  const squad = squadPlayers(c);
  const avgWage = avg(squad.map(p => p.wage)) || 500;
  for (const p of squad) {
    if (p.transferStatus === 'requested') continue;
    const bench = (p.season?.apps || 0) < (G.season.week - 1) * .35 && p.ovr > 45;
    if (p.morale < 30 && bench && p.ambition > 55 && chance(.12)) {
      p.transferStatus = 'requested';
      addNews(`${p.name} 请求离队`, `${p.name} 对出场时间与薪资感到不满，正式向俱乐部提出转会申请。`, 'team');
    }
    if (p.personality?.id === 'mercenary' && p.wage < avgWage * .55 && p.morale < 50 && chance(.08)) {
      p.morale = clamp(p.morale - 4, 0, 100);
      addNews(`${p.name} 对薪资不满`, '球员认为自己的贡献没有得到相应回报，要求改善合同。', 'team');
    }
  }
  const cap = c.captainId ? player(c.captainId) : null;
  if (cap && cap.traits?.includes('leader')) for (const p of squad) p.morale = clamp(p.morale + .3, 0, 100);
}
function processConstruction() {
  const c = userClub();
  if (!c || !c.construction?.length) return;
  const done = [];
  for (const item of c.construction) {
    item.remaining -= 1;
    if (item.remaining <= 0) done.push(item);
  }
  c.construction = c.construction.filter(x => x.remaining > 0);
  for (const item of done) {
    if (item.type === 'training') c.facility.training = Math.max(c.facility.training, item.level);
    if (item.type === 'medical') c.facility.medical = Math.max(c.facility.medical, item.level);
    if (item.type === 'youth') c.facility.youth = Math.max(c.facility.youth, item.level);
    if (item.type === 'stadium') c.capacity = Math.max(c.capacity, item.capacity);
    if (item.type === 'ground') { c.groundOwned = true; c.trainingGroundValue = item.value; }
    addNews('工程完工', `${item.label} 已完成。`, 'club');
    toast('工程完工', item.label, 'good');
  }
}
function showBankruptcy() {
  if (!G) return;
  G.meta.bankrupt = true;
  openModal({
    kicker: '俱乐部命运', title: '破产清算',
    body: `<div class="tc" style="padding:12px 0"><div style="font-size:44px;font-weight:750;color:var(--red);font-family:var(--num)">${fmtMoney(userClub().cash)}</div><p class="muted" style="font-size:12px;margin-top:8px;line-height:1.8">连续六周无法扭转负现金流，银行冻结了俱乐部账户。<br>董事会已向联赛提交退出申请。你的这次经营，以破产告终。</p><div class="hairline"></div><p class="xsmall faint">你仍然可以导出现有存档，或重新开始一段新的征程。</p></div>`,
    actions: `<button class="btn ghost" data-action="export-save">导出最后存档</button><button class="btn danger" data-action="reset-game">重新开始</button>`,
    closable: false,
  });
}

/* -------------------------------------------------------------------------
   8. 阵容编辑
   ------------------------------------------------------------------------- */
function setFormation(formation) {
  const c = userClub();
  if (!c || !FORMATION_SLOTS[formation]) return;
  c.formation = formation;
  c.lineup = bestLineupPlayers(c, true).map(x => ({ ...x }));
  c.bench = bestBenchIds(c, BENCH_SIZE);
  autoAssignCaptainIfNeeded();
  addNews('阵型调整', `主教练将阵型调整为 ${formation}，球员开始适应新的站位要求。`, 'team');
  saveGame(); renderApp();
}
function autoPickLineup() {
  const c = userClub();
  if (!c) return;
  const slots = FORMATION_SLOTS[c.formation] || FORMATION_SLOTS['4-4-2'];
  c.lineup = bestLineupPlayers(c, true).map(x => ({ ...x }));
  sanitizeLineup(c, slots, false);
  c.bench = bestBenchIds(c, BENCH_SIZE);
  autoAssignCaptainIfNeeded();
  saveGame(); renderApp();
  const starters = c.lineup.filter(x => x.playerId).length;
  const bench = (c.bench || []).length;
  const missing = starters < slots.length ? ` · 有 ${slots.length - starters} 个位置没有可用球员` : '';
  toast('已自动排阵', `选出 ${starters} 名首发、${bench} 名替补${missing}。`, missing ? 'gold' : 'good');
}
function assignPlayerToSlot(slotIndex, playerId) {
  const c = userClub();
  if (!c) return;
  const p = player(playerId);
  if (!p || p.clubId !== c.id) return;
  if (p.injuryDays > 0 || p.suspension > 0) return toast('无法上场', '该球员有伤停或停赛。', 'bad');
  const slot = c.lineup[slotIndex];
  if (!slot) return;
  const oldIdx = c.lineup.findIndex(x => x.playerId === playerId);
  if (oldIdx >= 0) {
    const temp = c.lineup[oldIdx].playerId;
    c.lineup[oldIdx].playerId = slot.playerId;
    slot.playerId = temp;
  } else slot.playerId = playerId;
  c.bench = bestBenchIds(c, BENCH_SIZE);
  autoAssignCaptainIfNeeded();
  closeModal(); saveGame(); renderApp();
}
function clearSlot(slotIndex) {
  const c = userClub();
  if (!c) return;
  c.lineup[slotIndex].playerId = null;
  c.bench = bestBenchIds(c, BENCH_SIZE);
  closeModal(); saveGame(); renderApp();
}
function setBenchPlayer(slotIndex, playerId) {
  const c = userClub();
  if (!c) return;
  const p = player(playerId);
  if (!p || p.clubId !== c.id) return;
  if (p.injuryDays > 0 || p.suspension > 0) return toast('无法进入替补席', '该球员有伤停或停赛。', 'bad');
  if (c.lineup.some(x => x.playerId === playerId)) return toast('已在首发', '请先把他从首发换下。', 'bad');
  const bench = (c.bench || []).slice(0, BENCH_SIZE);
  while (bench.length < BENCH_SIZE) bench.push(null);
  const oldIndex = bench.indexOf(playerId);
  if (oldIndex >= 0 && oldIndex !== slotIndex) {
    // 选择已经在替补席另一格的球员时交换两格，避免同一球员出现两次或顶掉别人。
    const old = bench[slotIndex];
    bench[slotIndex] = playerId;
    bench[oldIndex] = old || null;
  } else {
    bench[slotIndex] = playerId;
  }
  c.bench = bench.filter(Boolean);
  normalizeUserBench();
  closeModal(); saveGame(); renderApp();
}
function autoAssignCaptainIfNeeded() {
  const c = userClub();
  if (!c) return;
  const ids = c.lineup.map(x => x.playerId).filter(Boolean);
  if (!c.captainId || !ids.includes(c.captainId)) {
    const candidates = ids.map(player).filter(Boolean);
    c.captainId = sortBy(candidates, p => (p.leadership || 0) * .5 + p.ovr * .3 + (p.traits?.includes('leader') ? 10 : 0), -1)[0]?.id || null;
  }
}
function setCaptain(id) {
  const c = userClub();
  if (!c) return;
  if (!squadPlayers(c).some(p => p.id === id)) return;
  c.captainId = id;
  addNews('队长变更', `${player(id)?.name || '球员'} 被任命为球队队长。更衣室将观察他的表现。`, 'team');
  saveGame(); renderApp();
}
function toggleTransferStatus(playerId, status) {
  const p = player(playerId);
  if (!p || !isUserPlayer(p)) return;
  if (p.loan) return toast('租借球员', '租借期内的球员不能被挂牌或转售。', 'bad');
  p.transferStatus = p.transferStatus === status ? 'none' : status;
  saveGame(); renderApp();
  toast('球员状态更新', status === 'listed' ? '已列入转会名单，其他俱乐部会更容易提出报价。' : status === 'loan' ? '已列入外租名单。' : '已取消。', 'good');
}
function squadNumberAvailable(club, num) { return !squadPlayers(club).some(p => p.number === num); }
function assignSquadNumber(p, club) {
  let n = 1;
  while (n <= 40 && !squadNumberAvailable(club, n)) n++;
  p.number = n <= 40 ? n : randInt(41, 89);
}

/* -------------------------------------------------------------------------
   9. 训练
   ------------------------------------------------------------------------- */
const TRAINING_FATIGUE_MULT = 2.7;
const TRAINING_FOCUS = {
  balanced: { name: '综合训练', desc: '均衡提升多项能力，收益稳定但幅度较小。', attrs: ['pas', 'dri', 'tac', 'sho', 'sta'], fitness: 4.2, gain: .038, inj: 1 },
  attack: { name: '进攻演练', desc: '重点提升射门、传球与无球跑动。', attrs: ['sho', 'pas', 'dri', 'vis', 'spd'], fitness: 4.2, gain: .05, inj: 1.05 },
  defense: { name: '防守阵型', desc: '重点提升抢断、防守站位与力量。', attrs: ['tac', 'def', 'str', 'vis', 'phy'], fitness: 3.8, gain: .05, inj: 1.02 },
  physical: { name: '体能强化', desc: '提升速度、力量、耐力与身体素质，但消耗明显，受伤风险增加。', attrs: ['spd', 'str', 'sta', 'phy'], fitness: 6.2, gain: .055, inj: 1.5 },
  technical: { name: '技术细节', desc: '提升运球、传球和视野，适合年轻球员。', attrs: ['dri', 'pas', 'vis', 'sho'], fitness: 3.6, gain: .052, inj: .8 },
  recovery: { name: '恢复调整', desc: '不进行高强度训练，额外恢复体力。', attrs: [], fitness: 0, gain: 0, inj: .15, recovery: 7 },
  rest: { name: '完全休息', desc: '全队休息，大幅恢复体力，但不会提升能力。', attrs: [], fitness: 0, gain: 0, inj: 0, recovery: 12 },
};
const POSITION_TRAINING_BIAS = {
  GK: { gk: 1.35, def: 1.0, tac: .8, pas: .7, vis: .7, str: .8, spd: .7, dri: .4, sho: .25, sta: .9, phy: 1.0 },
  DF: { def: 1.25, tac: 1.2, str: 1.15, phy: 1.15, sta: 1.05, spd: .9, pas: .8, vis: .8, dri: .65, sho: .5, gk: .05 },
  MF: { pas: 1.2, dri: 1.12, vis: 1.15, sta: 1.12, tac: .95, def: .85, spd: .95, str: .85, sho: .8, phy: .85, gk: .05 },
  FW: { sho: 1.25, dri: 1.15, spd: 1.1, phy: 1.05, sta: .95, pas: .9, vis: .9, str: .9, tac: .5, def: .45, gk: .05 },
};
const INTENSITY = {
  light: { name: '轻松', factor: .65, fitness: .7, inj: .35, recovery: 1 },
  normal: { name: '标准', factor: 1, fitness: 1, inj: 1, recovery: 0 },
  high: { name: '高强度', factor: 1.45, fitness: 1.55, inj: 2.35, recovery: -2 },
};
function applyTrainingSession(focusKey, intensityKey, players, opts = {}) {
  const c = userClub();
  if (!c) return { gains: [], injuries: [], trained: 0 };
  const focus = TRAINING_FOCUS[focusKey] || TRAINING_FOCUS.balanced;
  const intensity = INTENSITY[intensityKey] || INTENSITY.normal;
  const facilityBonus = 1 + (c.facility.training - 1) * .22 + (c.groundOwned ? .08 : 0);
  const medFactor = 1 - (c.facility.medical - 1) * .12;
  const gains = [], injuries = [];
  let trained = 0;
  for (const p of players) {
    if (p.injuryDays > 0 || p.suspension > 0) continue;
    if (p.fitness < 18 && focusKey !== 'rest' && focusKey !== 'recovery') continue;
    trained++;
    const ageFactor = p.age <= 20 ? 1.35 : p.age <= 23 ? 1.18 : p.age <= 27 ? .95 : p.age <= 30 ? .65 : .35;
    const professional = .75 + (p.professionalism || 50) / 200;
    const conditionFactor = p.fitness < 45 ? .55 : 1;
    const bias = POSITION_TRAINING_BIAS[POS_GROUP[p.pos] || 'MF'] || POSITION_TRAINING_BIAS.MF;
    const positionFactor = focus.attrs.length ? avg(focus.attrs.map(k => bias[k] || .55)) : 1;
    let gainChance = focus.gain * ageFactor * professional * facilityBonus * intensity.factor * conditionFactor * clamp(positionFactor, .3, 1.4);
    if (opts.weekly) gainChance *= .72;
    if (p.ovr >= p.potential) gainChance = 0;
    const drain = focus.fitness * intensity.fitness * (p.age > 31 ? 1.2 : 1) * (0.9 + p.ovr / 500) * TRAINING_FATIGUE_MULT;
    p.fitness = clamp(p.fitness - drain, 1, 100);
    if (focus.recovery) p.fitness = clamp(p.fitness + focus.recovery * intensity.recovery, 0, 100);
    if (focus.attrs.length && chance(gainChance)) {
      const attrKey = weightedPick(focus.attrs, k => (p.growthBias?.[k] || 1) * (bias[k] || .45) * (k === 'spd' && p.age >= 29 ? .2 : 1));
      const old = p.attrs[attrKey];
      p.attrs[attrKey] = clamp(p.attrs[attrKey] + 1, 5, 99);
      const newOvr = calcOvr(p.attrs, p.pos);
      if (newOvr > p.potential + 1) p.attrs[attrKey] = old;
      else { p.ovr = newOvr; gains.push({ playerId: p.id, attr: attrKey, from: old, to: p.attrs[attrKey] }); }
    }
    const injuryChance = .0022 * intensity.inj * (p.age >= 31 ? 1.6 : p.age <= 20 ? .8 : 1) * (1 + (100 - p.fitness) / 260) * medFactor * (p.traits?.includes('injury_prone') ? 1.8 : 1) * (p.traits?.includes('ironman') ? .55 : 1);
    if (chance(injuryChance)) {
      const days = randInt(3, 12) + (intensityKey === 'high' ? randInt(1, 5) : 0);
      p.injuryDays = Math.max(p.injuryDays, days);
      injuries.push({ playerId: p.id, days });
      p.morale = clamp(p.morale - 6, 0, 100);
    }
  }
  return { gains, injuries, trained, focus: focus.name, intensity: intensity.name };
}
function applyTrainingAndAdvance(focusKey, intensityKey) {
  if (!G || G.meta.bankrupt) return;
  if (G.season.day >= 5) return toast('比赛日', '比赛日不安排训练，请直接进入比赛。', 'bad');
  const c = userClub();
  if (!c) return;
  if (focusKey === 'rest' || focusKey === 'recovery') intensityKey = 'light';
  const report = applyTrainingSession(focusKey, intensityKey, squadPlayers(c));
  G.trainer.focus = focusKey; G.trainer.intensity = intensityKey;
  const dayLabel = dayName(G.season.day);
  G.trainer.weeklyLog.push({ day: dayLabel, ...report });
  G.trainer.lastReport = { day: dayLabel, ...report };
  G.meta.totalDays++;
  G.season.day += 1;
  dailyRecovery();
  if (G.season.day >= 7) { G.season.day = 0; startNewWeek(); }
  expiringOfferCheck();
  refreshTransferWindow();
  saveGame(); showTrainingReport(report, dayLabel); renderApp();
}
function restAndAdvance() {
  if (!G || G.meta.bankrupt) return;
  if (G.season.day >= 5) return toast('比赛日', '比赛日请进入赛前部署完成本轮。', 'bad');
  const c = userClub();
  const report = applyTrainingSession('rest', 'light', squadPlayers(c));
  G.trainer.weeklyLog.push({ day: dayName(G.season.day), ...report, rest: true });
  G.meta.totalDays++;
  G.season.day += 1;
  dailyRecovery();
  if (G.season.day >= 7) { G.season.day = 0; startNewWeek(); }
  expiringOfferCheck();
  refreshTransferWindow();
  saveGame();
  toast('球队休息一天', '球员体力得到恢复，今日没有安排战术训练。', 'good');
  renderApp();
}
function trainUntilMatchday(mode = 'train') {
  if (!G || G.meta.bankrupt) return;
  if (G.season.day >= 5) return toast('比赛日', '已经到达比赛日。', 'bad');
  const focusKey = G.trainer.focus || 'balanced';
  let intensityKey = G.trainer.intensity || 'normal';
  if (focusKey === 'rest' || focusKey === 'recovery') intensityKey = 'light';
  const days = 5 - G.season.day;
  if (days <= 0) return;
  let allGains = [], allInjuries = [], trained = 0;
  for (let i = 0; i < days; i++) {
    if (G.season.day >= 5) break;
    if (mode === 'rest') {
      const rep = applyTrainingSession('recovery', 'light', squadPlayers(userClub()));
      allInjuries.push(...rep.injuries);
    } else {
      const rep = applyTrainingSession(focusKey, intensityKey, squadPlayers(userClub()));
      allGains.push(...rep.gains); allInjuries.push(...rep.injuries); trained += rep.trained;
    }
    G.meta.totalDays++;
    G.season.day += 1;
    dailyRecovery();
  }
  G.trainer.weeklyLog.push({ day: '本周合练', gains: allGains, injuries: allInjuries, trained, focus: mode === 'rest' ? '恢复调整' : TRAINING_FOCUS[focusKey].name, intensity: mode === 'rest' ? '轻松' : INTENSITY[intensityKey].name });
  expiringOfferCheck();
  refreshTransferWindow();
  saveGame();
  openModal({
    kicker: mode === 'rest' ? '恢复周期' : '训练周期', title: mode === 'rest' ? '全队进入恢复模式' : '本周训练完成',
    body: `<div class="flex between" style="margin-bottom:12px"><div><div class="label">训练计划</div><div style="font-size:18px;font-weight:650">${mode === 'rest' ? '恢复调整' : TRAINING_FOCUS[focusKey].name}</div></div><div class="tc"><div class="label">训练天数</div><div class="num" style="font-size:18px;font-weight:650">${days}</div></div></div>${reportBody(allGains, allInjuries)}<p class="xsmall muted" style="margin-top:10px">球队已推进至周六比赛日。本轮必须完成，可以亲自指挥，也可以在赛前部署中冒险让助教代管。</p>`,
    actions: `<button class="btn primary" data-action="close-modal">查看比赛日</button>`,
  });
  renderApp();
}
function reportBody(gains, injuries) {
  const gainRows = gains.slice(0, 10).map(g => {
    const p = player(g.playerId);
    return `<div class="log-row"><span class="daytag">提升</span><span>${esc(p?.name || '球员')} 的${esc(ATTR_LABELS[g.attr] || g.attr)} ${g.from} → ${g.to}。</span></div>`;
  }).join('');
  const injRows = injuries.slice(0, 5).map(x => {
    const p = player(x.playerId);
    return `<div class="log-row" style="color:var(--red)"><span class="daytag">伤病</span><span>${esc(p?.name || '球员')} 在训练中受伤，预计缺席 ${x.days} 天。</span></div>`;
  }).join('');
  return `<div class="training-log">${gainRows || '<div class="log-row"><span class="daytag">报告</span><span>没有球员出现明显的能力提升。低级别联赛的训练条件有限，持续投入会带来回报。</span></div>'}${injRows}</div>`;
}
function showTrainingReport(report, dayLabel) {
  const body = `<div class="flex between" style="margin-bottom:12px"><div><div class="label">${esc(dayLabel)} · 训练报告</div><div style="font-size:18px;font-weight:650">${esc(report.focus)} · ${esc(report.intensity)}</div></div><div class="tag green">${report.trained} 人参加</div></div>${reportBody(report.gains, report.injuries)}`;
  openModal({ kicker: '训练与恢复', title: report.gains.length ? '训练有所收获' : '训练结束', body, actions: `<button class="btn primary" data-action="close-modal">继续</button>` });
}

/* -------------------------------------------------------------------------
   10. 设施 / 合同续约
   ------------------------------------------------------------------------- */
function facilityUpgradeCost(club, type, targetLevel) {
  const base = { training: 150000, medical: 120000, youth: 180000 }[type] || 150000;
  const tierScale = { 1: 12, 2: 7, 3: 4, 4: 2, 5: 1 }[club.tier] || 1;
  const levelScale = [0, 1, 1.9, 3.4, 5.6][targetLevel - 1] || 5.6;
  return Math.round(base * tierScale * levelScale / 10000) * 10000;
}
function facilityMaxLevel(club) { return 5; }
function startFacilityUpgrade(type) {
  const c = userClub();
  if (!c) return;
  const current = c.facility[type] || 1;
  if (current >= 5) return toast('已达最高等级', '该设施已经完成全部升级。', 'bad');
  if (c.construction?.some(x => x.type === type)) return toast('施工中', '该设施正在进行升级。', 'bad');
  const target = current + 1;
  const cost = facilityUpgradeCost(c, type, target);
  if (c.cash < cost) return toast('资金不足', `需要 ${fmtMoney(cost)}，当前现金 ${fmtMoney(c.cash)}。`, 'bad');
  const names = { training: '训练设施', medical: '医疗中心', youth: '青训学院' };
  addLedger(-cost, `${names[type]}升级至 ${target} 级`, '设施建设工程款', 'facility');
  c.construction.push({ type, level: target, label: `${names[type]} ${target} 级`, remaining: 2, cost });
  addNews('设施建设开工', `${names[type]}将升级至 ${target} 级，预计两周后完工。`, 'club');
  saveGame(); renderApp();
  toast('工程已开工', `${names[type]}升级中，两周后生效。`, 'good');
}
function stadiumExpansionCost(club, seats) {
  const perSeat = { 1: 9000, 2: 4200, 3: 1800, 4: 700, 5: 240 }[club.tier] || 260;
  return Math.round(seats * perSeat / 10000) * 10000;
}
function startStadiumExpansion(seats) {
  const c = userClub();
  if (!c) return;
  if (c.construction?.some(x => x.type === 'stadium')) return toast('施工中', '球场扩建正在进行。', 'bad');
  const cost = stadiumExpansionCost(c, seats);
  if (c.cash < cost) return toast('资金不足', `扩建需要 ${fmtMoney(cost)}，当前现金 ${fmtMoney(c.cash)}。`, 'bad');
  addLedger(-cost, `球场扩建 +${fmtPlain(seats)} 座`, '建设工程款', 'facility');
  c.construction.push({ type: 'stadium', capacity: c.capacity + seats, label: `球场扩建至 ${fmtPlain(c.capacity + seats)} 座`, remaining: 4, cost, seats });
  addNews('球场扩建动工', `新增 ${fmtPlain(seats)} 个座位，预计四周后完工。施工期间主场比赛仍可使用现有看台。`, 'club');
  saveGame(); renderApp();
  toast('扩建动工', '四周后完工。', 'good');
}
function buyTrainingGround() {
  const c = userClub();
  if (!c || c.groundOwned) return;
  const cost = { 1: 12000000, 2: 6000000, 3: 2200000, 4: 900000, 5: 420000 }[c.tier] || 420000;
  if (c.cash < cost) return toast('资金不足', `购买训练基地需要 ${fmtMoney(cost)}。`, 'bad');
  addLedger(-cost, '购入训练基地土地', '长期资产 · 免除场地租金', 'facility');
  c.construction.push({ type: 'ground', label: '自有训练基地交付', remaining: 1, cost, value: cost });
  addNews('训练基地购地完成', '俱乐部买下训练基地土地，未来将免除场地租金并略微提升训练效果。', 'club');
  saveGame(); renderApp();
  toast('购地手续完成', '训练基地将在下周交付。', 'good');
}
function renewalDemand(p) {
  const baseValue = calcValue(p);
  let demandWage = Math.round((p.wage * (1.1 + Math.max(0, p.potential - p.ovr) / 100) + baseValue * .0012) / 50) * 50;
  demandWage = Math.max(demandWage, 300);
  const years = p.age <= 23 ? 4 : p.age <= 28 ? 3 : 2;
  return { wage: demandWage, years, bonus: Math.round(baseValue * .04 / 500) * 500 };
}
function openRenewalModal(playerId) {
  const p = player(playerId);
  const c = userClub();
  if (!p || !c || p.clubId !== c.id) return;
  if (p.loan) return toast('租借球员', '不能与租借球员续约；他的合同属于原俱乐部。', 'bad');
  const demand = renewalDemand(p);
  openModal({
    kicker: '合同谈判', title: `与 ${p.name} 续约`,
    body: `<div class="nego-box"><div class="nego-head">${shirtAvatar(p, c)}<div style="flex:1"><div style="font-size:13px;font-weight:650">${esc(p.name)}</div><div class="xsmall muted">${p.age} 岁 · ${POS_CN[p.pos]} · 当前周薪 ${fmtWage(p.wage)} · 合同还剩 ${p.contract} 年</div></div><div class="tc"><div class="label">期望周薪</div><div class="num gold" style="font-size:16px;font-weight:650">${fmtWage(demand.wage)}</div></div></div><div class="flex gap12" style="margin-bottom:12px"><div class="tag">${moraleInfo(p.morale).label} · 士气 ${Math.round(p.morale)}</div><div class="tag">${POS_CN[p.pos]}</div><div class="tag">${p.personality?.name || '职业'}</div></div><div class="nego-form"><label>周薪报价<input id="renew-wage" type="number" min="300" step="50" value="${Math.round((p.wage + demand.wage) / 2)}"></label><label>合同年限<select id="renew-years"><option value="1">1 年</option><option value="2" ${demand.years===2?'selected':''}>2 年</option><option value="3" ${demand.years===3?'selected':''}>3 年</option><option value="4" ${demand.years===4?'selected':''}>4 年</option></select></label><label class="full">签字费<input id="renew-bonus" type="number" min="0" step="500" value="${Math.round(demand.bonus * .4)}"></label></div><div class="nego-footer"><span class="xsmall faint">球员会综合考虑薪资、出场时间、球队前景与忠诚度。</span><button class="btn primary" data-action="submit-renewal" data-id="${p.id}">提交续约报价</button></div></div>`,
    actions: `<button class="btn ghost" data-action="close-modal">暂不续约</button>`, wide: true,
  });
}
function submitRenewal(playerId) {
  const p = player(playerId), c = userClub();
  if (!p || !c) return;
  const wage = Math.max(300, Number($('#renew-wage')?.value || 0));
  const years = clamp(Number($('#renew-years')?.value || 2), 1, 5);
  const bonus = Math.max(0, Number($('#renew-bonus')?.value || 0));
  const demand = renewalDemand(p);
  const wageScore = wage / Math.max(1, demand.wage);
  const score = wageScore * .65 + .25 + (p.loyalty || 50) / 200 + (p.morale - 45) / 220 + p.ambition / 400 - (years === 1 ? .05 : years >= 4 ? -.015 : 0) + (p.transferStatus === 'requested' ? -.14 : 0);
  const accepted = score >= .89 && bonus >= demand.bonus * .15;
  if (!accepted) {
    openModal({ kicker: '合同谈判', title: '报价被拒绝', body: `<div class="nego-msg bad">球员认为报价低于预期。他希望在周薪 ${fmtWage(demand.wage)} 左右续约，并要求至少 ${fmtMoney(demand.bonus)} 的签字费。你可以提高待遇后再次尝试。</div>`, actions: `<button class="btn ghost" data-action="close-modal">稍后再谈</button><button class="btn primary" data-action="open-renewal" data-id="${p.id}">重新报价</button>`, narrow: true });
    return;
  }
  if (c.cash < bonus) return toast('资金不足', '无法支付签字费。', 'bad');
  if (bonus > 0) addLedger(-bonus, `${p.name} 续约签字费`, `${years} 年新合同`, 'contract');
  p.wage = wage;
  p.contract = G.season.finished ? years + 1 : years;
  p.morale = clamp(p.morale + 10, 0, 100); p.transferStatus = 'none';
  addNews('续约完成', `${p.name} 与俱乐部签下 ${years} 年新合同，周薪 ${fmtWage(wage)}。`, 'team');
  saveGame(); closeModal(); renderApp();
  toast('续约完成', `${p.name} 将在球队继续效力。`, 'good');
}


/* -------------------------------------------------------------------------
   11. 应用状态与渲染工具
   ------------------------------------------------------------------------- */
let SETUP = null;
let UI = {
  screen: 'home', squadTab: 'all', viewTier: null, marketTab: 'market',
  marketFilters: { q: '', pos: 'ALL', maxPrice: '', minOvr: '', tier: 'ALL', loanOnly: false },
  squadSearch: '', squadPos: 'ALL', financesTab: 'overview', modal: null,
  setupWorldReady: false, lastMatchFixtureId: null, matchScreenTab: 'stats',
};
let _saveTimer = null;
let _testCodeStreak = 0;
const TEST_CODE = 'cutezrr';
function readTestModeFlag() {
  try { return localStorage.getItem(TEST_MODE_KEY) === '1'; } catch { return false; }
}
function writeTestModeFlag(on) {
  try { if (on) localStorage.setItem(TEST_MODE_KEY, '1'); else localStorage.removeItem(TEST_MODE_KEY); } catch {}
}

function clubCrestEl(club, cls = 'crest') { return `<img class="${cls}" src="${crestFor(club)}" alt="${esc(club?.name || '')}队徽">`; }
function clubKitEl(club, cls = 'kit-img') { return `<img class="${cls}" src="${kitFor(club)}" alt="${esc(club?.name || '')}球衣">`; }
function shirtAvatar(p, club) {
  const colors = club?.colors || ['#24372b', '#e7e2d2'];
  return `<div class="shirt" style="background:${colors[0]};border-color:${colors[1]};color:${colors[1]}">${p?.number || '—'}</div>`;
}
function playerLink(p, club, sub = true) {
  if (!p) return `<span class="muted">无人</span>`;
  return `<button class="player-link" data-action="open-player" data-id="${p.id}">${shirtAvatar(p, club)}<span class="col grow" style="min-width:0"><span class="pname">${esc(p.name)}</span>${sub ? `<span class="pmeta">${p.age} 岁 · ${POS_CN[p.pos]} · ${esc(p.nat)}</span>` : ''}</span></button>`;
}
function posTag(pos) { return `<span class="pos-tag pos-${pos}">${pos}</span>`; }
function formPills(formStr) {
  if (!formStr) return '<span class="faint xsmall">暂无</span>';
  return formStr.split('').map(ch => `<span class="form-pill ${ch}">${ch === 'W' ? '胜' : ch === 'D' ? '平' : '负'}</span>`).join('');
}
function fitnessBar(v) {
  const cls = v >= 70 ? '' : v >= 55 ? 'gold' : 'red';
  return `<span class="fitness-wrap"><span class="bar ${cls}"><i style="width:${clamp(v,0,100)}%"></i></span><span>${Math.round(v)}</span></span>`;
}
function ovrSpan(v) { return `<span class="ovr ${ovrClass(v)}">${v}</span>`; }
function newsTag(type) {
  return { board: '董事会', finance: '财政', transfer: '转会', team: '球队', club: '俱乐部', match: '比赛', youth: '青训', training: '训练' }[type] || '消息';
}
function daysUntilNextFixture() {
  const f = nextUserFixture();
  if (!f) return null;
  return Math.max(0, (f.round - G.season.week) * 7 + 5 - G.season.day);
}
function logoForDraft() {
  if (!SETUP) return '';
  return SETUP.logo || makeCrest([SETUP.primary, SETUP.secondary], SETUP.clubName || '青岚竞技', SETUP.crestStyle || 0, 101);
}
function kitForDraft() {
  if (!SETUP) return '';
  return SETUP.kitImage || makeKit([SETUP.primary, SETUP.secondary], SETUP.kitPattern || 'sash');
}
function makeSetupDraft() {
  return {
    stage: 'welcome', clubName: '青岚竞技', manager: '', city: '青岚', stadium: '青岚体育场',
    primary: '#b74e47', secondary: '#f2e6d0', kitPattern: 'sash', crestStyle: 0,
    logo: null, kitImage: null, seed: (Math.random() * 0xFFFFFFFF) >>> 0, world: null,
    selected: [], recommendationMade: false, created: false,
  };
}
function loadImageFile(file, maxSize = 512) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('没有选择文件'));
    if (!/^image\//.test(file.type)) return reject(new Error('请选择图片文件'));
    if (file.size > 8 * 1024 * 1024) return reject(new Error('图片不能超过 8MB'));
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('图片读取失败'));
      img.onload = () => {
        try {
          const ratio = Math.min(1, maxSize / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * ratio));
          const h = Math.max(1, Math.round(img.height * ratio));
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', .9));
        } catch (e) { reject(e); }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* -------------------------------------------------------------------------
   12. 新游戏设置
   ------------------------------------------------------------------------- */
function initNewSetup() {
  SETUP = makeSetupDraft();
  UI.screen = 'home';
  renderSetup();
}
function renderSetup() {
  const app = $('#app');
  if (!SETUP) return;
  let content = '';
  if (SETUP.stage === 'welcome') content = setupWelcome();
  else if (SETUP.stage === 'identity') content = setupIdentity();
  else if (SETUP.stage === 'look') content = setupLook();
  else if (SETUP.stage === 'recruit') content = setupRecruit();
  app.innerHTML = `<div class="setup-screen">
    <div class="setup-top"><div class="brand"><div class="brand-mark">GD</div><div><div class="brand-name">绿茵王朝</div><div class="brand-sub">Grassroots Dynasty · 足球经理</div></div></div><div class="flex gap12"><span class="xsmall faint">离线单文件 · 本地存档加密导出</span>${SETUP.stage !== 'welcome' ? `<button class="btn ghost sm" data-action="setup-back">返回</button>` : ''}</div></div>
    <div class="setup-hero-pitch"></div>
    <div class="setup-main">${content}</div>
    <div style="position:relative;z-index:1;padding:12px 34px;border-top:1px solid rgba(255,255,255,.05);display:flex;justify-content:space-between;font-size:9px;color:var(--faint)"><span>所有俱乐部、人物与赛事均为虚构</span><span>v${APP_VERSION} · 无需联网</span></div>
  </div>`;
}
function setupWelcome() {
  let hasSave = false;
  try { hasSave = !!localStorage.getItem(SAVE_KEY); } catch {}
  return `<div class="setup-intro" style="max-width:760px">
    <div class="eyebrow">从第五级别开始</div>
    <h1>把一支<br><span>无名球队</span>带上巅峰。</h1>
    <p>你是一名刚刚接手的俱乐部老板。这里没有豪门预算，也没有现成的球星。你需要在城市联赛的泥地里，用有限的资金招募第一批球员，安排训练、制定战术、谈判转会，并在 3 分钟的实时比赛里做出判断。升级、破产、天才、背叛——都由你亲手写下。</p>
    <div class="setup-actions"><button class="btn primary lg" data-action="setup-begin">开始新的俱乐部</button><button class="btn ghost lg" data-action="open-import-save">导入加密存档</button><button class="btn ghost lg" data-action="open-friendly-mode">双存档友谊赛</button>${hasSave ? '<button class="btn ghost lg" data-action="reset-save-confirm">清除本地存档</button>' : ''}</div>
  </div>
  <div class="setup-features">
    <div class="setup-feature"><div class="n">01 / 真实比赛</div><div class="t">2D 实时足球</div><div class="d">连续跑位、传球轨迹、门将扑救与红黄牌，由属性和战术共同驱动。</div></div>
    <div class="setup-feature"><div class="n">02 / 长期经营</div><div class="t">从第五级到冠军</div><div class="d">22 轮双循环，两个升降级名额。每一分都算数。</div></div>
    <div class="setup-feature"><div class="n">03 / 人的游戏</div><div class="t">合同与更衣室</div><div class="d">士气、野心、工资差距、出场时间。你面对的不是一串数字。</div></div>
    <div class="setup-feature"><div class="n">04 / 冒险与回报</div><div class="t">球探与青训</div><div class="d">在民间试训中寻找隐藏天才，或让青训营慢慢长成你的根基。</div></div>
  </div>`;
}
function setupStep(n, label) {
  const current = SETUP.stage === 'identity' ? 1 : SETUP.stage === 'look' ? 2 : SETUP.stage === 'recruit' ? 3 : 1;
  return `<div class="setup-step ${n === current ? 'active' : n < current ? 'done' : ''}"><span class="sn">${n}</span><span>${label}</span></div>`;
}
function setupIdentity() {
  return `<div class="setup-card"><div class="setup-steps">${setupStep(1,'俱乐部身份')}${setupStep(2,'队徽与球衣')}${setupStep(3,'组建初始阵容')}</div>
    <div class="setup-body"><div class="kicker">Step 01 / Identity</div><h2>先给这支球队一个名字。</h2><p class="lead">名字、城市、球场都可以自己决定。预算固定为 ${fmtMoney(800000)}，其中的一部分将用于签下你最初的球员。你从城市联赛——联赛体系的第五级别开始。</p>
      <div class="form-grid">
        <label class="field"><span>俱乐部名称</span><input data-setup="clubName" maxlength="14" value="${esc(SETUP.clubName)}" placeholder="例如：青岚竞技"></label>
        <label class="field"><span>主教练姓名</span><input data-setup="manager" maxlength="12" value="${esc(SETUP.manager)}" placeholder="你的名字"></label>
        <label class="field"><span>所在城市</span><input data-setup="city" maxlength="8" value="${esc(SETUP.city)}"></label>
        <label class="field"><span>主场名称</span><input data-setup="stadium" maxlength="16" value="${esc(SETUP.stadium)}"></label>
        <div class="full"><div class="hairline"></div><div class="flex gap16" style="flex-wrap:wrap"><div><div class="label">初始资金</div><div class="num" style="font-size:19px;color:var(--gold-bright)">${fmtMoney(800000)}</div></div><div><div class="label">起始级别</div><div style="font-size:19px">第五级别 · 城市联赛</div></div><div><div class="label">董事会预期</div><div style="font-size:19px">先活下来</div></div></div></div>
      </div></div>
    <div class="setup-foot"><span class="hint">所有数字与人物均为虚构，不对应现实俱乐部。</span><button class="btn primary" data-action="setup-to-look">下一步 · 选择队徽</button></div>
  </div>`;
}
function setupLook() {
  const crests = [0,1,2,3].map(i => `<button class="crest-option ${!SETUP.logo && SETUP.crestStyle === i ? 'active' : ''}" data-action="setup-crest" data-style="${i}" title="队徽模板 ${i+1}"><img src="${makeCrest([SETUP.primary, SETUP.secondary], SETUP.clubName || '青岚竞技', i, 101)}" alt="队徽模板"></button>`).join('');
  const patterns = [['solid','纯色'],['stripes','竖条纹'],['sash','斜绶带'],['halves','左右拼色'],['hoops','横条纹']].map(([k,n]) => `<button class="pattern-btn ${SETUP.kitPattern === k ? 'active' : ''}" data-action="setup-pattern" data-pattern="${k}">${n}</button>`).join('');
  return `<div class="setup-card"><div class="setup-steps">${setupStep(1,'俱乐部身份')}${setupStep(2,'队徽与球衣')}${setupStep(3,'组建初始阵容')}</div>
    <div class="setup-body"><div class="kicker">Step 02 / Colours & Crest</div><h2>你的球队，应该一眼就被记住。</h2><p class="lead">选择一个队徽模板，或上传自己的图片。球衣颜色和图案会出现在比赛现场、球员列表和俱乐部页面。图片支持 PNG / JPG / SVG。</p>
      <div class="identity-grid" style="margin-top:18px">
        <div><div class="label">队徽</div><div class="flex gap16" style="align-items:center;margin:8px 0 4px"><img src="${logoForDraft()}" alt="当前队徽" style="width:92px;height:104px;object-fit:contain"><div><div class="crest-options">${crests}</div><div class="flex gap6" style="margin-top:9px"><button class="btn sm" data-action="setup-upload-logo">上传队徽图片</button>${SETUP.logo ? `<button class="btn sm ghost" data-action="setup-clear-logo">使用模板</button>` : ''}</div></div></div><div class="hairline"></div><div class="label">主色与辅色</div><div class="color-row" style="margin-top:6px"><label class="field"><span>主色</span><input type="color" data-setup="primary" value="${SETUP.primary}"></label><label class="field"><span>辅色</span><input type="color" data-setup="secondary" value="${SETUP.secondary}"></label></div></div>
        <div><div class="label">主场球衣</div><div class="flex gap16" style="align-items:center;margin:8px 0 4px"><img src="${kitForDraft()}" alt="当前球衣" style="width:104px;height:116px;object-fit:contain"><div style="flex:1"><div class="pattern-row">${patterns}</div><div class="flex gap6" style="margin-top:9px"><button class="btn sm" data-action="setup-upload-kit">上传球衣图片</button>${SETUP.kitImage ? `<button class="btn sm ghost" data-action="setup-clear-kit">使用生成球衣</button>` : ''}</div></div></div><div class="hairline"></div><div class="tactic-note">俱乐部会徽与球衣只保存在你的本地存档中。上传的图片会压缩到合理尺寸，不会离开这台设备。</div></div>
      </div></div>
    <div class="setup-foot"><span class="hint">图片不能是表情包；请使用真实图片或我们提供的矢量模板。</span><button class="btn primary" data-action="setup-to-recruit">下一步 · 招募首批球员</button></div>
  </div>`;
}
function recruitSummaryState() {
  const pool = SETUP.world.initialPool.map(id => SETUP.world.players[id]).filter(Boolean);
  const selectedPlayers = pool.filter(p => SETUP.selected.includes(p.id));
  const selectedCounts = setupSignedCounts(selectedPlayers);
  const totalFee = selectedPlayers.reduce((a, p) => a + onboardingFee(p), 0);
  const totalWage = selectedPlayers.reduce((a, p) => a + p.wage, 0);
  const cash = SETUP.world.clubs[USER_CLUB_ID].cash;
  const checks = [
    { k: '总人数 ≥ 14', ok: selectedPlayers.length >= 14, v: `${selectedPlayers.length} 人` },
    { k: '门将 ≥ 2', ok: selectedCounts.GK >= 2, v: `${selectedCounts.GK} 人` },
    { k: '后卫 ≥ 5', ok: selectedCounts.DF >= 5, v: `${selectedCounts.DF} 人` },
    { k: '中场 ≥ 4', ok: selectedCounts.MF >= 4, v: `${selectedCounts.MF} 人` },
    { k: '前锋 ≥ 2', ok: selectedCounts.FW >= 2, v: `${selectedCounts.FW} 人` },
    { k: '签约费不超过现金', ok: totalFee <= cash, v: fmtMoney(totalFee) },
  ];
  return { pool, selectedPlayers, selectedCounts, totalFee, totalWage, cash, checks, valid: checks.every(c => c.ok) };
}
function recruitSummaryHtml() {
  const { selectedPlayers, totalFee, totalWage, cash, checks, valid } = recruitSummaryState();
  return `<div class="rs-block"><div class="rs-k">初始预算</div><div class="rs-v">${fmtMoney(cash)}</div><div class="budget-bar ${totalFee > cash ? 'over' : ''}"><i style="width:${clamp(totalFee / cash * 100, 0, 100)}%"></i></div><div class="xsmall faint">已用签约费 ${fmtMoney(totalFee)}</div></div>
    <div class="rs-block"><div class="rs-k">已选人数</div><div class="rs-v">${selectedPlayers.length}<span style="font-size:10px;color:var(--faint);font-family:var(--sans)"> / 至少 14 人</span></div><div class="xsmall muted" style="margin-top:3px">预计周薪 ${fmtMoney(totalWage)}</div></div>
    <div class="rs-block"><div class="check-list">${checks.map(c => `<div class="check-item ${c.ok ? 'ok' : 'bad'}"><span>${c.ok ? '✓' : '·'} ${c.k}</span><span class="cv">${c.v}</span></div>`).join('')}</div></div>
    <div class="rs-block"><button class="btn primary block" data-action="finish-onboarding" ${valid ? '' : 'disabled'}>签下球员 · 开始征程</button><div class="xsmall faint tc" style="margin-top:6px">签约后预算将立即扣除</div></div>`;
}
function setupRecruit() {
  if (!SETUP.world) return `<div class="setup-card"><div class="setup-body tc" style="padding:60px 20px"><div class="kicker">正在生成世界</div><h2>球探正在整理名单……</h2></div></div>`;
  const { pool } = recruitSummaryState();
  const rows = pool.map(p => {
    const selected = SETUP.selected.includes(p.id);
    const fee = onboardingFee(p);
    return `<div class="recruit-item ${selected ? 'selected' : ''}" role="button" tabindex="0" data-action="toggle-recruit" data-id="${p.id}">${posTag(p.pos)}<span class="ri-main"><span class="ri-name">${esc(p.name)} <span class="faint xsmall">${esc(p.nat)}</span></span><span class="ri-meta">${p.age} 岁 · 综合 ${p.ovr} · 潜力 ${Math.round(p.potential)} · ${moraleInfo(p.morale).label}</span></span><span class="ri-fee">${selected ? '已选择' : fmtMoney(fee)}<span>${fmtMoney(p.wage)}/周</span></span><button class="btn xs ghost recruit-info" data-action="setup-player-detail" data-id="${p.id}">数值</button></div>`;
  }).join('');
  return `<div class="setup-card" style="width:min(1040px,100%)"><div class="setup-steps">${setupStep(1,'俱乐部身份')}${setupStep(2,'队徽与球衣')}${setupStep(3,'组建初始阵容')}</div>
    <div class="setup-body"><div class="flex between" style="align-items:flex-start;flex-wrap:wrap"><div><div class="kicker">Step 03 / First Squad</div><h2>用有限的钱，签下第一批人。</h2><p class="lead">没有免费的天才。这里只有自由球员与试训者，他们的能力普遍不高，但其中也许有人值得长期培养。至少要签下 14 人，才能报名参赛。</p></div><div class="flex gap6"><button class="btn sm" data-action="auto-recruit">智能推荐 16 人</button><button class="btn sm ghost" data-action="clear-recruit">清空</button></div></div>
      <div class="recruit-layout"><div class="recruit-list" id="recruit-list">${rows}</div><div class="recruit-summary" id="recruit-summary">${recruitSummaryHtml()}</div></div></div>
    <div class="setup-foot"><span class="hint">提示：先保证每个位置都有人，再考虑潜力。低能力、高潜力的年轻人会在长期训练中成长。</span><button class="btn ghost" data-action="setup-back">上一步</button></div>
  </div>`;
}
function onboardingFee(p) { return Math.max(1000, Math.round(calcValue(p) * .18 / 500) * 500); }
function setupSignedCounts(players) { const c = { GK: 0, DF: 0, MF: 0, FW: 0 }; for (const p of players) c[POS_GROUP[p.pos]]++; return c; }
function autoRecommendRecruits() {
  if (!SETUP?.world) return;
  const pool = SETUP.world.initialPool.map(id => SETUP.world.players[id]).filter(Boolean);
  const byGroup = { GK: [], DF: [], MF: [], FW: [] };
  for (const p of pool) byGroup[POS_GROUP[p.pos]].push(p);
  for (const g of Object.values(byGroup)) g.sort((a,b) => (b.ovr + b.potential*.28 - onboardingFee(b)/3000) - (a.ovr + a.potential*.28 - onboardingFee(a)/3000));
  const selected = [];
  const take = (group, n) => { for (let i = 0; i < n && i < byGroup[group].length; i++) selected.push(byGroup[group][i].id); };
  take('GK',2); take('DF',5); take('MF',5); take('FW',4);
  const budget = SETUP.world.clubs[USER_CLUB_ID].cash;
  let total = selected.reduce((a,id) => a + onboardingFee(SETUP.world.players[id]), 0);
  while (total > budget * .92 && selected.length > 14) {
    const sorted = selected.slice().sort((a,b) => {
      const pa = SETUP.world.players[a], pb = SETUP.world.players[b];
      const priority = p => POS_GROUP[p.pos] === 'GK' ? 20 : p.ovr + p.potential * .2;
      return priority(pa) - priority(pb);
    });
    const candidate = sorted.find(id => {
      const pp = SETUP.world.players[id];
      const group = POS_GROUP[pp.pos];
      const min = group === 'DF' ? 5 : group === 'MF' ? 4 : group === 'FW' ? 2 : 2;
      return setupSignedCounts(selected.map(x => SETUP.world.players[x]))[group] > min;
    });
    if (!candidate) break;
    selected.splice(selected.indexOf(candidate), 1);
    total -= onboardingFee(SETUP.world.players[candidate]);
  }
  SETUP.selected = selected; SETUP.recommendationMade = true; renderSetup();
}
function toggleRecruit(id) {
  if (!SETUP?.selected) return;
  const pid = Number(id);
  const list = $('#recruit-list');
  const scrollTop = list ? list.scrollTop : 0;
  if (SETUP.selected.includes(pid)) SETUP.selected = SETUP.selected.filter(x => x !== pid);
  else {
    if (SETUP.selected.length >= 20) return toast('人数上限', '初始阶段最多签下 20 人。', 'bad');
    SETUP.selected.push(pid);
  }
  const selected = SETUP.selected.includes(pid);
  const row = document.querySelector(`.recruit-item[data-id="${pid}"]`);
  const p = SETUP.world?.players?.[pid];
  if (row) {
    row.classList.toggle('selected', selected);
    const feeEl = row.querySelector('.ri-fee');
    if (feeEl && p) feeEl.innerHTML = selected ? '已选择' : `${fmtMoney(onboardingFee(p))}<span>${fmtMoney(p.wage)}/周</span>`;
  }
  const summary = $('#recruit-summary');
  if (summary) {
    // 只更新右侧汇总，不重建整个招募列表，滚动位置和焦点都不会丢。
    summary.innerHTML = recruitSummaryHtml();
  } else {
    renderSetup();
    const nextList = $('#recruit-list');
    if (nextList) nextList.scrollTop = scrollTop;
  }
}
function syncDraftToWorld() {
  if (!SETUP?.world) return;
  const c = SETUP.world.clubs[USER_CLUB_ID];
  c.name = SETUP.clubName.trim() || '青岚竞技';
  c.short = c.name.replace(/足球俱乐部|俱乐部|竞技|联/g, '').slice(0,4) || c.name.slice(0,2);
  c.colors = [SETUP.primary, SETUP.secondary];
  c.logo = SETUP.logo || makeCrest(c.colors, c.name, SETUP.crestStyle || 0, 101);
  c.kit = SETUP.kitImage || makeKit(c.colors, SETUP.kitPattern || 'sash');
  c.city = SETUP.city.trim() || '青岚';
  c.stadium = SETUP.stadium.trim() || `${c.city}体育场`;
  c.user = { manager: SETUP.manager.trim() || '无名教练', founded: 2026, primary: SETUP.primary, secondary: SETUP.secondary, kitPattern: SETUP.kitPattern, stadiumLevel: 1, trainingGroundOwned: false };
  SETUP.world.manager = c.user.manager;
}
async function openRecruitStep() {
  if (!SETUP) return;
  SETUP.clubName = (SETUP.clubName || '青岚竞技').trim() || '青岚竞技';
  SETUP.city = (SETUP.city || '青岚').trim() || '青岚';
  SETUP.stadium = (SETUP.stadium || `${SETUP.city}体育场`).trim();
  SETUP.manager = (SETUP.manager || '无名教练').trim();
  if (!SETUP.world) {
    $('#app').innerHTML = `<div class="setup-screen"><div class="setup-main tc"><div class="kicker">正在生成世界</div><h1 style="font-size:44px;margin-top:10px">正在搭建联赛金字塔……</h1><p class="muted" style="margin-top:8px">五个级别、六十家俱乐部、一千多名球员与二十二轮赛程。</p><div style="width:180px;height:3px;background:rgba(255,255,255,.08);margin:24px auto;border-radius:2px;overflow:hidden"><i style="display:block;width:40%;height:100%;background:var(--gold);animation:loadBar 1s infinite alternate"></i></div></div><style>@keyframes loadBar{from{transform:translateX(-100%)}to{transform:translateX(250%)}}</style></div>`;
    await sleep(60);
    SETUP.world = buildUniverse(SETUP.seed, { clubName: SETUP.clubName, manager: SETUP.manager, city: SETUP.city, stadium: SETUP.stadium, primary: SETUP.primary, secondary: SETUP.secondary, logo: SETUP.logo, kitImage: SETUP.kitImage, kitPattern: SETUP.kitPattern });
    syncDraftToWorld();
    SETUP.selected = [];
  } else syncDraftToWorld();
  SETUP.stage = 'recruit';
  renderSetup();
}
function finishOnboarding() {
  if (!SETUP?.world) return;
  syncDraftToWorld();
  const w = SETUP.world;
  const pool = w.initialPool.map(id => w.players[id]).filter(Boolean);
  const selected = pool.filter(p => SETUP.selected.includes(p.id));
  const errors = [], counts = setupSignedCounts(selected);
  if (selected.length < 14) errors.push('至少需要签下 14 名球员');
  if (counts.GK < 2) errors.push('至少需要 2 名门将');
  if (counts.DF < 5) errors.push('至少需要 5 名后卫');
  if (counts.MF < 4) errors.push('至少需要 4 名中场');
  if (counts.FW < 2) errors.push('至少需要 2 名前锋');
  const totalFee = selected.reduce((a,p) => a + onboardingFee(p), 0);
  if (totalFee > w.clubs[USER_CLUB_ID].cash) errors.push('签约费超过初始预算');
  if (errors.length) return toast('阵容还不完整', errors.join('；'), 'bad');
  G = w; _rngState = w.rngState;
  const c = userClub();
  c.cash = 800000;
  const fees = selected.reduce((a,p) => a + onboardingFee(p), 0);
  for (const p of selected) {
    p.clubId = c.id; p.contract = randInt(2, 4); p.joinedSeason = 1; p.transferStatus = 'none';
    p.wage = calcWage(p.ovr, p.potential, p.age);
    c.squad.push(p.id);
    G.freeAgents = G.freeAgents.filter(id => id !== p.id);
  }
  let num = 1;
  for (const pid of c.squad) player(pid).number = num++;
  c.wageBudget = Math.max(Math.round(clubWageBill(c) * 1.35 / 1000) * 1000, 6000);
  c.lineup = bestLineupPlayers(c, false).map(x => ({ ...x }));
  c.bench = bestBenchIds(c, BENCH_SIZE);
  c.captainId = null; autoAssignCaptainIfNeeded();
  c.boardConfidence = 58;
  G.manager = SETUP.manager;
  G.meta.onboardingDone = true; G.meta.initialPoolSigned = true;
  c.ledger = [];
  addLedger(-fees, '初始阵容签约费', `${selected.length} 名球员的注册与签字费用`, 'transfer');
  setBoardGoal();
  addNews('欢迎来到青岚', `${managerName()}，董事会欢迎你接手${c.name}。本赛季的目标是${G.board.goal}。城市联赛的每一分都不容易。`, 'club');
  addNews('转会窗已开启', '季初转会窗开放至第 4 周。自由球员可以在任何时候签约，其他俱乐部球员需要在窗口内完成谈判。', 'transfer');
  addNews('三份主赞助报价', '财务部收到了三份主赞助合同报价，签字费立即到账，之后每周支付。前往财政中心选择一份签约。', 'finance');
  G.season.transferWindowOpen = true;
  refreshTransferListings();
  saveGame();
  SETUP = null; UI.screen = 'home'; renderApp();
  setTimeout(() => showTutorial(true), 350);
}

/* -------------------------------------------------------------------------
   13. 主界面
   ------------------------------------------------------------------------- */
function navBadge(screen) {
  if (screen === 'transfers') {
    const n = (G?.offers || []).filter(o => o.status === 'pending' && o.sellerClubId === G.userClubId).length;
    return n ? `<span class="alert-badge">${n}</span>` : '';
  }
  if (screen === 'home') { const n = unreadNewsCount(); return n ? `<span class="alert-badge">${n}</span>` : ''; }
  return '';
}
function renderApp() {
  if (!G) { renderSetup(); return; }
  if (!G.meta.onboardingDone) { renderSetup(); return; }
  if (G.meta.bankrupt && !UI.modal) setTimeout(showBankruptcy, 50);
  const c = userClub();
  if (!c) return;
  const now = currentDate();
  const isMatchday = G.season.day === 5 && !userHasPlayedRound(G.season.round);
  const displayDate = `${now.getMonth() + 1}月${now.getDate()}日 · ${dayName(G.season.day)}`;
  const primaryAction = G.season.finished
    ? `<button class="btn primary advance-btn" data-action="show-season-review"><span class="date-label"><span>赛季结束</span><small>查看赛季总结</small></span></button>`
    : isMatchday
    ? `<button class="btn primary advance-btn" data-action="match-setup"><span class="date-label"><span>比赛日</span><small>进入赛前部署</small></span></button>`
    : G.season.day === 6
      ? `<button class="btn primary advance-btn" data-action="finish-week"><span class="date-label"><span>周日</span><small>结算并进入下周</small></span></button>`
      : `<button class="btn primary advance-btn" data-action="nav" data-screen="training"><span class="date-label"><span>训练日</span><small>安排今日训练</small></span></button>`;
  const tabs = [['home','主页'],['squad','阵容'],['training','训练'],['schedule','赛程'],['transfers','转会'],['youth','青训'],['finance','财政'],['club','俱乐部']];
  $('#app').innerHTML = `<div class="shell">
    <aside class="sidebar">
      <div class="brand"><div class="brand-mark">GD</div><div><div class="brand-name">绿茵王朝</div><div class="brand-sub">GRASSROOTS DYNASTY</div></div></div>
      <div class="club-mini">${clubCrestEl(c,'crest sm')}<div class="club-mini-info"><div class="club-mini-name">${esc(c.name)}</div><div class="club-mini-meta">${TIER_NAME(c.tier)} · ${currentSeasonLabel()}</div></div></div>
      <nav class="nav">${tabs.map(([key,label],i) => `<button class="${UI.screen === key ? 'active' : ''}" data-action="nav" data-screen="${key}"><span class="idx">${String(i+1).padStart(2,'0')}</span><span class="lbl">${label}</span>${navBadge(key)}</button>`).join('')}</nav>
      <div class="sidebar-foot"><div class="date-mini"><strong>${currentSeasonLabel()}</strong> · 第 ${G.season.week} 周<br>${displayDate} · ${roomForNext()}</div><div class="sidebar-actions"><button class="btn ghost" data-action="open-save-menu">存档</button><button class="btn ghost" data-action="show-help">帮助</button></div></div>
    </aside>
    <main class="main">
      <div class="topbar"><div class="topbar-left">${clubCrestEl(c,'crest')}<div><div class="top-club-name">${esc(c.name)}</div><div class="top-club-meta"><span>${TIER_LABEL(c.tier)}</span><span class="inline-sep"></span><span>主教练 ${esc(managerName())}</span><span class="inline-sep"></span><span>${G.season.day === 5 ? '比赛日' : `第 ${G.season.week} 周 · ${dayName(G.season.day)}`}</span></div></div></div>
        <div class="topbar-right">${G.meta.bankrupt ? `<span class="tag red">破产清算</span>` : ''}${G.meta.testMode ? '<span class="tag gold" title="测试模式已开启">测试模式</span>' : ''}<div class="status-pill"><span class="k">现金</span><span class="v money ${c.cash < 0 ? 'neg' : ''}">${fmtMoney(c.cash)}</span></div><div class="status-pill"><span class="k">周薪</span><span class="v">${fmtMoney(clubWageBill(c))}</span></div>${primaryAction}</div></div>
      ${renderScreenSafe()}
    </main>
  </div>`;
  bindRenderedEvents();
}
function roomForNext() {
  const d = daysUntilNextFixture();
  if (d === null) return '赛季结束';
  if (d === 0) return '今日比赛';
  return `${d} 天后比赛`;
}
function renderScreenSafe() {
  try { return renderScreen(); }
  catch (e) {
    console.error(e);
    return `<div class="card pad"><div class="kicker">页面渲染失败</div><h2>出现了一个技术问题</h2><p class="muted" style="margin-top:6px">${esc(e.message)}</p><button class="btn primary" data-action="nav" data-screen="home" style="margin-top:12px">返回主页</button></div>`;
  }
}
function renderScreen() {
  switch (UI.screen) {
    case 'home': return renderHome();
    case 'squad': return renderSquad();
    case 'training': return renderTraining();
    case 'schedule': return renderSchedule();
    case 'transfers': return renderTransfers();
    case 'youth': return renderYouth();
    case 'finance': return renderFinance();
    case 'club': return renderClub();
    default: return renderHome();
  }
}
function greeting() { const h = new Date().getHours(); return h < 6 ? '夜深了' : h < 12 ? '早上好' : h < 18 ? '下午好' : '晚上好'; }
function homeAgenda() {
  const d = G.season.day;
  const played = userHasPlayedRound(G.season.round);
  return [
    { text: '查看训练计划与球员体力', done: d > 4, now: d < 5 },
    { text: '完成赛前阵容与战术部署', done: d >= 5, now: d === 4 },
    { text: d === 5 ? '完成本轮比赛（可冒险跳过）' : '准备下一场比赛', done: played, now: d === 5 && !played },
    { text: '赛后恢复与周结算', done: d === 6, now: d === 6 },
  ].map(a => ({ ...a, cls: `${a.done ? 'done' : ''} ${a.now ? 'now' : ''}` }));
}
function tacticalPreview(us, them) {
  const t = us || { attack: 'balanced', defense: 'balanced', tempo: 'normal' };
  const o = them || { attack: 'balanced', defense: 'balanced', tempo: 'normal' };
  let score = 0;
  const notes = [];
  const attPairs = [['counter','press',.085],['possession','press',-.052],['longball','press',.045],['wing','low',.078],['counter','low',-.045],['possession','low',-.028],['longball','low',.025],['wing','press',-.018],['balanced','balanced',.01],['wing','balanced',.018],['longball','balanced',.008]];
  for (const [a,d,v] of attPairs) if (t.attack === a && o.defense === d) { score += v; notes.push(`${ATTACK_STYLES[a].name}对${DEFENSE_STYLES[d].name}`); }
  const defPairs = [['press','possession',.065],['press','counter',-.06],['press','longball',-.036],['low','wing',-.032],['low','counter',.028],['low','possession',.025],['balanced','counter',-.012]];
  for (const [a,d,v] of defPairs) if (t.defense === a && o.attack === d) { score += v; notes.push(`${DEFENSE_STYLES[a].name}应对${ATTACK_STYLES[d].name}`); }
  if (t.tempo === 'fast' && o.tempo !== 'fast') score += .015;
  if (t.tempo === 'slow' && o.tempo === 'fast') score += .008;
  if (t.tempo === 'fast' && o.tempo === 'fast') score -= .01;
  const side = score > .055 ? 'good' : score < -.045 ? 'bad' : 'neutral';
  return { score, side, label: side === 'good' ? '略占上风' : side === 'bad' ? '略处下风' : '均势', notes: [...new Set(notes)] };
}
function tacticEdgeExplanation(edge) {
  if (!edge || !edge.notes.length) return '两套体系之间没有明显的相互克制，比赛将更多取决于球员能力、体力和临场运气。';
  return `关键对位：${edge.notes.join('；')}。`;
}
function renderHome() {
  const c = userClub();
  const next = nextUserFixture();
  const standing = userStanding();
  const table = computeStandings(c.tier);
  const opp = next ? clubById(fixtureOpponent(next, c.id)) : null;
  const form = currentFormFor(c.id, 5);
  const oppForm = opp ? currentFormFor(opp.id, 5) : '';
  const isMatchday = G.season.day === 5 && next && next.round === G.season.round;
  const edge = opp ? tacticalPreview(c.tactics, opp.tactics) : null;
  const proj = calculateWeeklyProjection();
  const squad = squadPlayers(c);
  const fitAvg = Math.round(avg(squad.map(p => p.fitness)) || 0);
  const moraleAvg = Math.round(avg(squad.map(p => p.morale)) || 0);
  const topScorer = squad.slice().sort((a,b) => (b.season?.goals||0) - (a.season?.goals||0))[0];
  const expiring = squad.filter(p => p.contract <= 1);
  const pendingOffers = (G.offers || []).filter(o => o.status === 'pending' && o.sellerClubId === c.id);
  const recentNews = G.news.slice(0, 4);
  const homeAttendance = next && next.home === c.id ? estimatedAttendance(c, next.away) : null;
  return `<div class="page-head"><div><div class="kicker">${currentSeasonLabel()} / 第 ${G.season.week} 周 / ${dayName(G.season.day)}</div><h1>${greeting()}，${esc(managerName())}。</h1><div class="sub">${G.season.day === 5 ? '比赛日。更衣室的空气比平时更重。' : G.season.day === 6 ? '一周结束，下一场比赛已经在路上。' : '训练、谈判、准备。足球从来不只是九十分钟。'}</div></div><div class="flex gap8 wrap">${pendingOffers.length ? `<button class="btn" data-action="nav" data-screen="transfers"><span class="tag gold">${pendingOffers.length} 份报价待处理</span></button>` : ''}<button class="btn ghost" data-action="show-inbox">消息 ${unreadNewsCount() ? `<span class="tag gold">${unreadNewsCount()}</span>` : ''}</button></div></div>
  <div class="dash-grid"><div class="dash-col">
    ${next ? `<div class="hero-match"><div class="hero-head"><span class="kicker">${next.round === G.season.round ? '下一场比赛' : `第 ${next.round} 轮`} · ${next.home === c.id ? '主场' : '客场'}</span><span class="tag ${next.home === c.id ? 'green' : 'blue'}">${next.home === c.id ? esc(c.stadium) : '客场作战'}</span></div>
      <div class="hero-body"><div class="matchup"><div class="team-side">${clubCrestEl(c,'crest lg')}<div class="tname">${esc(c.name)}</div><div class="tmeta">${formPills(form)}</div></div><div class="vs-block"><div class="vs-day">${fixtureDateText(next)}</div><div class="vs-time">15:00</div><div class="vs-place">${TIER_NAME(c.tier)} · 第 ${next.round} 轮</div></div><div class="team-side">${clubCrestEl(opp,'crest lg')}<div class="tname">${esc(opp?.name || '待定')}</div><div class="tmeta">${formPills(oppForm)}</div></div></div>
        <div class="weather-line"><span>球场：<b>${esc(next.home === c.id ? c.stadium : opp?.stadium || '对方主场')}</b></span><span>排名：<b>${standing?.position || '—'} / ${table.length}</b></span>${homeAttendance ? `<span>预计观众：<b>${fmtPlain(homeAttendance)} 人</b></span>` : `<span>远征球迷：<b>${fmtPlain(Math.round(c.fanbase*.08))} 人</b></span>`}</div></div>
      <div class="hero-foot"><span>${isMatchday ? '比赛即将开始。你可以先调整首发、战术与赛前训话。' : `距离比赛还有 ${Math.max(0,(next.round-G.season.week)*7+5-G.season.day)} 天。利用训练与转会窗口提升球队。`}</span><span class="tag ${edge?.side === 'good' ? 'green' : edge?.side === 'bad' ? 'red' : 'gold'}">战术面：${edge?.label || '均势'}</span></div>
      <div class="hero-actions"><div class="btn-row">${isMatchday ? `<button class="btn primary lg grow" data-action="match-setup">进入赛前部署</button><button class="btn ghost" data-action="nav" data-screen="squad">调整阵容</button>` : `<button class="btn primary" data-action="nav" data-screen="squad">查看阵容与战术</button><button class="btn ghost" data-action="nav" data-screen="training">安排训练</button>`}</div></div>
    </div>` : `<div class="hero-match"><div class="hero-body"><div class="kicker">赛季结束</div><h2 style="margin:6px 0">所有人都在等待下一年。</h2><p class="muted">赛季已结束。查看赛季总结，处理到期合同，然后开启新的征程。</p><div class="btn-row" style="margin-top:14px"><button class="btn primary" data-action="show-season-review">查看赛季总结</button><button class="btn ghost" data-action="nav" data-screen="squad">处理合同</button></div></div></div>`}
    <div class="stat-strip"><div class="stat-cell"><div class="k">联赛排名</div><div class="v">${standing?.position || '—'}<small>/ ${table.length}</small></div><div class="d">${standing ? `${standing.points} 分 · ${standing.wins}胜${standing.draws}平${standing.losses}负` : '尚未开赛'}</div></div><div class="stat-cell"><div class="k">球队平均能力</div><div class="v">${Math.round(avg(squad.map(p=>p.ovr))||0)}</div><div class="d">${squad.length} 名注册球员</div></div><div class="stat-cell"><div class="k">平均体力</div><div class="v">${fitAvg}<small>/100</small></div><div class="d">${fitnessInfo(fitAvg).label} · 恢复取决于医疗设施</div></div><div class="stat-cell"><div class="k">更衣室</div><div class="v">${moraleAvg}</div><div class="d">${moraleInfo(moraleAvg).label} · 董事会 ${G.board.confidence}</div></div></div>
    <div class="card pad"><div class="section-title"><div><h2>球队事务</h2><div class="sub">今天可以做的决定</div></div><button class="text-link" data-action="show-inbox">全部消息</button></div><div class="agenda"><div class="agenda-head"><span class="kicker">${dayName(G.season.day)}计划</span><span class="tag ${isMatchday ? 'green' : 'gold'}">${isMatchday ? '比赛日' : G.season.day === 6 ? '周结算' : '训练日'}</span></div><div class="agenda-body"><div class="agenda-list">${homeAgenda().map(a => `<div class="agenda-row ${a.cls}"><span class="mark">${a.done ? '✓' : a.now ? '·' : ''}</span><span>${a.text}</span></div>`).join('')}</div>${G.season.day < 5 ? `<div class="flex gap8 wrap"><button class="btn primary" data-action="quick-train">按计划训练并推进</button><button class="btn ghost" data-action="rest-day">全队休息一天</button><button class="btn ghost" data-action="nav" data-screen="training">详细安排</button></div>` : isMatchday ? `<button class="btn primary" data-action="match-setup">进入比赛 · 无法跳过</button>` : `<button class="btn primary" data-action="finish-week">结束本周，进入下一周</button>`}</div></div></div>
    <div class="card pad"><div class="section-title"><div><h2>最近消息</h2><div class="sub">来自董事会、球探与更衣室</div></div><button class="text-link" data-action="show-inbox">查看全部</button></div><div class="news-list">${recentNews.length ? recentNews.map(n => `<div class="news-item"><div class="news-date">W${n.week}<br>${newsTag(n.type)}</div><div class="news-main"><div class="news-title">${esc(n.title)}</div><div class="news-body">${esc(n.body)}</div></div>${n.unread ? '<span class="news-unread"></span>' : ''}</div>`).join('') : '<div class="empty-state"><strong>还没有消息</strong>随着赛季推进，新闻会出现在这里。</div>'}</div></div>
  </div>
  <div class="dash-col">
    <div class="card pad"><div class="section-title"><div><h2>联赛形势</h2><div class="sub">${TIER_NAME(c.tier)} · 实时积分</div></div><button class="text-link" data-action="nav" data-screen="schedule">赛程</button></div><table class="mini-table"><thead><tr><th>球队</th><th>赛</th><th>净</th><th>分</th></tr></thead><tbody>${table.slice(0,6).map(r => `<tr class="${r.clubId === c.id ? 'me' : ''}"><td class="team-cell">${clubCrestEl(r.club,'crest sm')}${esc(r.club.name)}</td><td>${r.played}</td><td>${r.gd>0?'+':''}${r.gd}</td><td>${r.points}</td></tr>`).join('')}${standing && standing.position > 6 ? `<tr class="me"><td class="team-cell">${clubCrestEl(c,'crest sm')}${esc(c.name)}</td><td>${standing.played}</td><td>${standing.gd>0?'+':''}${standing.gd}</td><td>${standing.points}</td></tr>` : ''}</tbody></table></div>
    <div class="card pad"><div class="section-title"><div><h2>财务概况</h2><div class="sub">每周现金流</div></div><button class="text-link" data-action="nav" data-screen="finance">管理</button></div><div class="finance-mini"><div class="cell"><div class="k">现金</div><div class="v ${c.cash<0?'red':''}">${fmtMoney(c.cash)}</div></div><div class="cell"><div class="k">本周预计结余</div><div class="v ${proj.net<0?'red':'green'}">${fmtMoney(proj.net,{plus:true})}</div></div><div class="cell"><div class="k">周薪总额</div><div class="v">${fmtMoney(proj.wages)}</div></div><div class="cell"><div class="k">工资预算</div><div class="v">${fmtMoney(c.wageBudget)}</div></div></div><div class="hairline" style="margin:12px 0 8px"></div><div class="flex between small"><span class="muted">董事会信心</span><span class="${G.board.confidence<35?'red':'gold'}">${G.board.confidence} / 100</span></div><div class="bar ${G.board.confidence<35?'red':'gold'}" style="margin-top:5px"><i style="width:${G.board.confidence}%"></i></div><p class="xsmall faint" style="margin-top:8px">赛季目标：${esc(G.board.goal)}</p>${expiring.length ? `<div class="hairline" style="margin:11px 0 8px"></div><div class="flex between small"><span class="muted">合同进入最后一年</span><span class="gold">${expiring.length} 人</span></div><div class="xsmall faint" style="margin-top:3px">前往阵容页续约，避免自由身离队。</div>` : ''}</div>
    <div class="card pad"><div class="section-title"><div><h2>关注名单</h2><div class="sub">其他俱乐部的兴趣与合同</div></div><button class="text-link" data-action="nav" data-screen="transfers">市场</button></div><div class="watch-list">${pendingOffers.slice(0,3).map(o => { const p = player(o.playerId), buyer = clubById(o.buyerClubId); return `<div class="watch-row">${clubCrestEl(buyer,'crest sm')}<div class="info"><div class="t">${esc(p?.name || '球员')} 收到报价</div><div class="m">${esc(buyer?.name || '')} · ${o.type === 'loan' ? '租借' : '永久转会'}</div></div><div class="amt">${fmtMoney(o.fee)}</div></div>`; }).join('')}${(c.interestedPlayers || []).slice(0,3).map(x => { const p = player(x.playerId), buyer = clubById(x.clubId); return `<div class="watch-row">${clubCrestEl(buyer,'crest sm')}<div class="info"><div class="t">${esc(p?.name || '球员')}</div><div class="m">${esc(buyer?.name || '')} 正在关注</div></div><div class="amt">${Math.round(x.interest*100)}%</div></div>`; }).join('')}${!pendingOffers.length && !(c.interestedPlayers||[]).length ? `<div class="empty-state" style="padding:16px 10px"><strong>暂无外部兴趣</strong>让球员在场上拿出表现，或者把他挂牌。</div>` : ''}</div></div>
    ${topScorer && topScorer.season?.goals ? `<div class="card tight flex between"><div class="flex gap10">${shirtAvatar(topScorer,c)}<div><div class="small" style="font-weight:600">${esc(topScorer.name)}</div><div class="xsmall faint">队内最佳射手</div></div></div><div class="tc"><div class="num" style="font-size:22px;color:var(--gold-bright)">${topScorer.season.goals}</div><div class="xsmall faint">球</div></div></div>` : ''}
  </div></div>`;
}

/* -------------------------------------------------------------------------
   14. 阵容页
   ------------------------------------------------------------------------- */
function shortName(name) {
  if (!name) return '—';
  if (/[\u4e00-\u9fa5]/.test(name)) return name.length > 4 ? name.slice(-3) : name;
  const parts = name.split(' ');
  return parts.length > 1 ? parts[parts.length - 1] : name;
}
function filterSquadRows(squad) {
  let rows = squad;
  const q = (UI.squadSearch || '').trim().toLowerCase();
  if (q) rows = rows.filter(p => p.name.toLowerCase().includes(q) || p.nat.includes(q) || p.pos.toLowerCase().includes(q) || POS_CN[p.pos].includes(q));
  if (UI.squadPos && UI.squadPos !== 'ALL') rows = rows.filter(p => p.pos === UI.squadPos);
  if (UI.squadTab === 'contract') rows = rows.filter(p => p.contract <= 2).sort((a,b)=>a.contract-b.contract);
  if (UI.squadTab === 'transfer') rows = rows.filter(p => p.transferStatus !== 'none');
  return rows;
}
function tacticDescription(t) {
  return `${ATTACK_STYLES[t.attack]?.name || '均衡进攻'}、${DEFENSE_STYLES[t.defense]?.name || '均衡防守'}、${TEMPO_STYLES[t.tempo]?.name || '中节奏'}。${tacticHint(t)}`;
}
function tacticHint(t) {
  if (t.attack === 'counter' && t.defense === 'low') return '球队会退得很深，等待断球后一击致命。适合能力不如对手时搏冷。';
  if (t.attack === 'possession' && t.defense === 'press') return '高控球加高位逼抢能压制弱队，但体能与身后空当是隐患。';
  if (t.attack === 'wing' && t.defense === 'low') return '低位防守加边路传中：保守中寻找一次传中机会。';
  if (t.tempo === 'fast') return '高节奏会增加射门与失误，比赛末段更考验替补深度。';
  if (t.tempo === 'slow') return '慢节奏适合领先时消耗时间，但不适合落后追赶。';
  return '均衡的踢法没有明显短板，也不会克制任何体系。';
}
function renderSquad() {
  const c = userClub();
  ensureUserLineupValid();
  const slots = FORMATION_SLOTS[c.formation] || FORMATION_SLOTS['4-4-2'];
  const lineup = c.lineup || [];
  const bench = (c.bench || []).slice(0, BENCH_SIZE);
  const squad = getUserSquadSorted();
  const valid = validateMatchdaySquad();
  const starters = lineup.map(x => player(x.playerId)).filter(Boolean);
  const avgOvr = Math.round(avg(starters.map(p => effectiveOvrForRole(p, lineup.find(x => x.playerId === p.id)?.slot))) || 0);
  const attackRating = Math.round(avg(starters.filter(p => ['ST','SS','LW','RW','AM'].includes(p.pos)).map(p => p.attrs.sho*.5 + p.attrs.dri*.2 + p.attrs.spd*.2 + p.attrs.pas*.1)) || 0);
  const midRating = Math.round(avg(starters.filter(p => ['CM','DM','LM','RM','AM'].includes(p.pos)).map(p => p.attrs.pas*.4 + p.attrs.vis*.3 + p.attrs.tac*.2 + p.attrs.dri*.1)) || 0);
  const defRating = Math.round(avg(starters.filter(p => ['CB','LB','RB','GK'].includes(p.pos)).map(p => p.attrs.def*.4 + p.attrs.tac*.3 + p.attrs.gk*.2 + p.attrs.str*.1)) || 0);
  const filtered = filterSquadRows(squad);
  const banner = !valid.ok ? `<div class="card tight flex between" style="border-color:rgba(221,119,109,.3);background:rgba(221,119,109,.05);margin-bottom:12px"><span class="small red">${esc(valid.msg)}</span><button class="btn sm" data-action="auto-lineup">自动排阵</button></div>` : '';
  return `<div class="page-head"><div><div class="kicker">Squad / Tactics</div><h1>阵容与战术</h1><div class="sub">没有一套阵容能赢下所有比赛。根据对手、体力和赛程做出选择。</div></div><div class="btn-row"><button class="btn ghost" data-action="auto-lineup">自动选择最佳阵容</button><button class="btn primary" data-action="${G.season.day === 5 && !userHasPlayedRound(G.season.round) ? 'match-setup' : 'nav'}" ${G.season.day === 5 ? '' : 'data-screen="training"'}>${G.season.day === 5 ? '进入比赛' : '安排训练'}</button></div></div>${banner}
  <div class="squad-layout"><div class="pitch-card"><div class="pitch-card-head"><div><span class="kicker">首发十一人</span><div class="xsmall faint" style="margin-top:2px">点击球员更换位置 · 位置适应度会影响表现</div></div><div class="flex gap8"><span class="tag gold">${c.formation}</span><span class="tag">平均 ${avgOvr}</span><select data-change="captain" style="width:auto;padding:4px 26px 4px 7px;font-size:10px;border-radius:5px">${starters.map(p=>`<option value="${p.id}" ${c.captainId===p.id?'selected':''}>队长：${esc(p.name)}</option>`).join('')}</select></div></div>
    <div class="pitch-wrap"><div class="lineup-pitch"><div class="circle-mid"></div><div class="box left"></div><div class="box right"></div><div class="box6 left"></div><div class="box6 right"></div><div class="goal left"></div><div class="goal right"></div>${slots.map((s,i) => { const entry = lineup[i] || {}; const p = player(entry.playerId); return `<button class="lineup-slot ${p?'':'empty'} ${p && c.captainId === p.id?'captain':''} ${p && (p.injuryDays>0||p.suspension>0)?'suspended':''}" style="left:${s.x*100}%;top:${s.y*100}%" data-action="lineup-slot" data-index="${i}"><span class="slot-token" style="${p?`background:${c.colors[0]};border-color:${c.colors[1]};color:${c.colors[1]}`:''}">${p ? p.number : '+'}<span class="slot-pos">${s.pos}</span></span><span class="player-name">${p ? esc(shortName(p.name)) : '选择球员'}</span><span class="slot-fitline"><span class="slot-fit"><i style="width:${p?p.fitness:0}%"></i></span><span class="slot-stam">${p?Math.round(p.fitness):''}</span></span></button>`; }).join('')}</div>
      <div class="bench-box"><div class="flex between"><span class="label">替补席 · ${bench.filter(Boolean).length}/${BENCH_SIZE}</span><span class="xsmall faint">比赛最多换 5 人</span></div><div class="bench-list">${Array.from({length:BENCH_SIZE}).map((_,i) => { const p = player(bench[i]); return `<button class="bench-slot ${p?'':'empty'}" data-action="bench-slot" data-index="${i}">${p ? `<div class="bn">${esc(shortName(p.name))}</div><div class="bp">${p.pos} · ${Math.round(p.fitness)}</div>` : '+ 空位'}</button>`; }).join('')}</div></div>
    </div></div>
    <div class="card tactics-panel">
      <div class="tactic-group"><div class="flex between"><h4>阵型</h4><span class="tag">${c.formation}</span></div><div class="formation-grid">${FORMATIONS.map(f => `<button class="form-btn ${c.formation===f?'active':''}" data-action="set-formation" data-formation="${f}">${f}</button>`).join('')}</div></div>
      <div class="tactic-group"><h4>进攻风格</h4><div class="desc">球队拿球之后如何推进。</div><div class="option-grid">${Object.entries(ATTACK_STYLES).map(([k,v]) => `<button class="option-btn ${c.tactics.attack===k?'active':''}" data-action="tactic" data-side="attack" data-key="${k}"><strong>${v.name}</strong>${v.desc}</button>`).join('')}</div></div>
      <div class="tactic-group"><h4>防守风格</h4><div class="desc">丢球之后球队如何保护球门。</div><div class="option-grid">${Object.entries(DEFENSE_STYLES).map(([k,v]) => `<button class="option-btn ${c.tactics.defense===k?'active':''}" data-action="tactic" data-side="defense" data-key="${k}"><strong>${v.name}</strong>${v.desc}</button>`).join('')}</div></div>
      <div class="tactic-group"><h4>比赛节奏</h4><div class="desc">更快的节奏制造更多回合，也消耗更多体力。</div><div class="option-grid">${Object.entries(TEMPO_STYLES).map(([k,v]) => `<button class="option-btn ${c.tactics.tempo===k?'active':''}" data-action="tactic" data-side="tempo" data-key="${k}"><strong>${v.name}</strong>${v.desc}</button>`).join('')}</div></div>
      <div class="tactic-group"><div class="label" style="margin-bottom:5px">战术面板</div><div class="team-rating-box"><div class="rating-cell"><div class="k">进攻</div><div class="v">${attackRating||'—'}</div></div><div class="rating-cell"><div class="k">中场</div><div class="v">${midRating||'—'}</div></div><div class="rating-cell"><div class="k">防守</div><div class="v">${defRating||'—'}</div></div></div><div class="tactic-note" style="margin-top:9px"><strong>当前思路：</strong>${tacticDescription(c.tactics)}</div></div>
    </div>
  </div>
  <div class="card pad" style="margin-top:16px"><div class="squad-toolbar"><div><div class="kicker">Full Squad</div><h2 style="font-size:18px;margin-top:2px">球员名单</h2><div class="xsmall faint">${squad.length} 名球员 · <span class="gold">首发 ${starters.length}</span> · <span style="color:var(--blue)">替补席 ${bench.filter(Boolean).length}</span> · <span class="faint">未上场 ${Math.max(0, squad.length - starters.length - bench.filter(Boolean).length)}</span> · 周薪 ${fmtMoney(clubWageBill(c))} · 阵容价值 ${fmtMoney(clubSquadValue(c))}</div></div><div class="flex gap8 wrap"><div class="seg">${[['all','全部'],['contract','合同'],['transfer','转会状态']].map(([k,n]) => `<button class="${UI.squadTab===k?'active':''}" data-action="squad-tab" data-tab="${k}">${n}</button>`).join('')}</div><button class="btn sm" data-action="nav" data-screen="transfers">转会市场</button></div></div>
    <div class="filters-row" style="margin-bottom:10px"><input id="squad-search" placeholder="搜索姓名、国籍或位置" value="${esc(UI.squadSearch||'')}" data-input="squad-search"><select id="squad-filter-pos" data-change="squad-pos"><option value="ALL">所有位置</option>${POSITIONS.map(p => `<option value="${p}" ${UI.squadPos===p?'selected':''}>${POS_CN[p]}</option>`).join('')}</select></div>
    <div class="table-wrap"><table class="data-table"><thead><tr><th>球员</th><th>位置</th><th>定位</th><th>年龄</th><th>能力</th><th>潜力</th><th>体力</th><th>士气</th><th>状态</th><th>合同</th><th>周薪</th><th>身价</th><th>赛季</th><th style="text-align:right">操作</th></tr></thead><tbody>${filtered.length ? filtered.map(p => `<tr><td class="name-col">${playerLink(p,c)}${c.captainId===p.id?'<span class="tag gold" style="margin-left:5px">队长</span>':''}</td><td>${posTag(p.pos)}</td><td>${squadRoleTag(p,c)}</td><td>${p.age}</td><td>${ovrSpan(p.ovr)}</td><td><span class="num gold">${Math.round(p.potential)}</span></td><td>${fitnessBar(p.fitness)}</td><td><span class="${moraleInfo(p.morale).cls}">${moraleInfo(p.morale).label}</span><div class="xsmall faint">${Math.round(p.morale)}</div></td><td>${playerStatusTags(p) || `<span class="${formInfo(p.form).cls}">${formInfo(p.form).label}</span>`}</td><td>${p.contract} 年</td><td>${fmtMoney(p.wage)}</td><td>${fmtMoney(calcValue(p))}</td><td>${p.season.apps}场 ${p.season.goals}球</td><td class="actions-cell"><button class="btn xs ghost" data-action="open-player" data-id="${p.id}">详情</button> <button class="btn xs" data-action="open-renewal" data-id="${p.id}">续约</button> <button class="btn xs ghost" data-action="toggle-transfer" data-id="${p.id}" data-status="${p.transferStatus==='listed'?'none':'listed'}">${p.transferStatus==='listed'?'撤牌':'挂牌'}</button></td></tr>`).join('') : `<tr><td colspan="14"><div class="empty-state">没有符合条件的球员。</div></td></tr>`}</tbody></table></div>
  </div>
  <div class="card pad" style="margin-top:16px"><div class="flex between wrap gap12"><div><div class="kicker">Contract Watch</div><h3 style="font-size:16px;margin-top:2px">合同与转会提醒</h3><div class="xsmall muted">合同还剩 1 年或更少的球员，需要在赛季结束前续约，否则将自由身离队。被挂牌的球员更容易吸引报价。</div></div><div class="flex gap8">${squad.filter(p=>p.contract<=1).length ? `<span class="tag red">${squad.filter(p=>p.contract<=1).length} 人合同告急</span>` : `<span class="tag green">合同状况健康</span>`}</div></div><div class="flex gap8 wrap" style="margin-top:10px">${squad.filter(p=>p.contract<=1).slice(0,6).map(p=>`<button class="btn sm ghost" data-action="open-renewal" data-id="${p.id}">${esc(p.name)} · 续约（${p.contract}年）</button>`).join('') || '<span class="xsmall faint">暂无即将到期合同。</span>'}</div></div>`;
}

/* -------------------------------------------------------------------------
   15. 训练页
   ------------------------------------------------------------------------- */
function renderTraining() {
  const c = userClub();
  const squad = getUserSquadSorted();
  const focus = TRAINING_FOCUS[G.trainer.focus] || TRAINING_FOCUS.balanced;
  const isRecoveryFocus = G.trainer.focus === 'rest' || G.trainer.focus === 'recovery';
  const intensity = isRecoveryFocus ? INTENSITY.light : (INTENSITY[G.trainer.intensity] || INTENSITY.normal);
  const d = G.season.day;
  const matchday = d === 5;
  const canTrain = d < 5;
  const sortedByFit = squad.slice().sort((a,b) => a.fitness - b.fitness);
  const report = G.trainer.lastReport;
  const log = G.trainer.weeklyLog.slice().reverse();
  return `<div class="page-head"><div><div class="kicker">Training Ground</div><h1>训练基地</h1><div class="sub">每天的训练都会消耗体力，但很少会立刻带来明显提升。真正的成长来自长期坚持。</div></div><div class="flex gap8"><span class="tag ${c.groundOwned?'green':'orange'}">${c.groundOwned?'自有训练基地':'租赁训练场地'}</span><span class="tag">训练设施 ${c.facility.training} 级</span><span class="tag">医疗 ${c.facility.medical} 级</span></div></div>
  <div class="week-strip">${Array.from({length:7}).map((_,i) => `<div class="day-card ${i===d?'today':i===5?'matchday':''} ${i<d?'done':''}"><div class="dw">${dayName(i)}</div><div class="dd">${dateForWeek(G.season.week,i).getDate()}</div><div class="ds">${i===5?'比赛':i===6?'恢复':i<d?'已过':i===d?'今天':'待训练'}</div></div>`).join('')}</div>
  ${matchday ? `<div class="card pad" style="border-color:rgba(120,201,158,.28);background:rgba(120,201,158,.035);margin-bottom:14px"><div class="flex between wrap gap12"><div><div class="kicker">比赛日</div><h2 style="font-size:20px;margin-top:3px">今天不能训练。你可以亲自指挥，也可以让助教冒险代管。</h2><p class="muted small" style="margin-top:3px">调整好阵容与战术后，进入赛前部署。</p></div><button class="btn primary" data-action="match-setup">进入比赛</button></div></div>` : d===6 ? `<div class="card pad" style="border-color:rgba(215,184,107,.25);margin-bottom:14px"><div class="flex between wrap gap12"><div><div class="kicker">周日</div><h2 style="font-size:20px;margin-top:3px">给球队一个完整的恢复日。</h2><p class="muted small" style="margin-top:3px">今天不会安排训练，结束本周后将进入下一周。</p></div><button class="btn primary" data-action="finish-week">结束本周</button></div></div>` : ''}
  <div class="training-layout"><div class="col gap16">
    <div class="card pad"><div class="section-title"><div><h2>今日训练</h2><div class="sub">${dayName(d)} · ${d<5?'训练后自动进入下一天':'今日不安排训练'}</div></div><div class="tag ${intensity.name==='高强度'?'red':intensity.name==='轻松'?'green':'gold'}">${intensity.name}</div></div>
      <div class="focus-grid">${Object.entries(TRAINING_FOCUS).map(([k,v]) => `<button class="focus-card ${G.trainer.focus===k?'active':''}" data-action="training-focus" data-key="${k}" ${!canTrain?'disabled':''}><strong>${v.name}</strong><span>${v.desc}</span><span style="color:var(--faint);margin-top:4px">体能消耗 ${v.fitness?Math.round(v.fitness*intensity.fitness*TRAINING_FATIGUE_MULT):0} · 成长 ${v.gain?'小概率':'无'}</span></button>`).join('')}</div>
      <div class="hairline"></div><div class="flex between gap12 wrap"><div><div class="label">训练强度</div><div class="intensity-row" style="margin-top:5px">${Object.entries(INTENSITY).map(([k,v]) => `<button class="intensity-btn ${G.trainer.intensity===k?'active':''}" data-action="training-intensity" data-key="${k}" ${!canTrain || G.trainer.focus==='rest' || G.trainer.focus==='recovery'?'disabled':''}>${v.name}</button>`).join('')}</div></div><div style="max-width:260px"><div class="xsmall faint">预计受伤风险：<span class="${intensity.inj>2?'red':intensity.inj>1?'orange':'green'}">${getInjuryRiskText(G.trainer.intensity)}</span> · 医疗等级可降低风险</div><div class="xsmall faint" style="margin-top:3px">高强度提升更快，同时消耗更多体力。</div></div></div>
      <div class="btn-row" style="margin-top:15px"><button class="btn primary" data-action="train-day" ${!canTrain?'disabled':''}>完成今日训练并推进</button><button class="btn ghost" data-action="train-week" ${!canTrain?'disabled':''}>一键训练至比赛日</button><button class="btn ghost" data-action="rest-week" ${!canTrain?'disabled':''}>恢复训练至比赛日</button><button class="btn ghost" data-action="rest-day" ${!canTrain?'disabled':''}>休息一天</button></div>
      ${d>=5 ? `<p class="xsmall orange" style="margin-top:9px">比赛日必须完成本轮；可以亲自指挥，也可以冒险跳过。</p>` : ''}
    </div>
    <div class="card pad"><div class="section-title"><div><h2>本周训练记录</h2><div class="sub">成长是累加的，但不会超过球员的潜力上限。</div></div><span class="tag">${log.length} 次记录</span></div>${report?`<div class="tactic-note" style="margin-bottom:10px"><strong>${report.day||'最近一次'}：</strong>${report.gains?.length?`${report.gains.length} 项能力得到提升。`:'没有明显能力提升。'}${report.injuries?.length?` ${report.injuries.length} 人受伤。`:''}</div>`:''}<div class="training-log">${log.length ? log.map(x => `<div class="log-row"><span class="daytag">${esc(x.day||'记录')}</span><span>${esc(x.focus||'训练')}${x.intensity?` · ${esc(x.intensity)}`:''} · ${x.gains?.length||0} 项提升${x.injuries?.length?` · ${x.injuries.length} 人受伤`:''}</span></div>`).join('') : '<div class="empty-state" style="padding:18px"><strong>本周还没有训练</strong>选择训练重点，然后完成今日训练。</div>'}</div></div>
  </div>
  <div class="col gap16"><div class="card pad"><div class="section-title"><div><h2>球员状态</h2><div class="sub">按体力从低到高排列</div></div><button class="text-link" data-action="nav" data-screen="squad">阵容</button></div><div class="condition-list">${sortedByFit.map(p => `<div class="condition-row"><span class="nm">${esc(p.name)}</span><span class="bar ${p.fitness<55?'red':p.fitness<75?'gold':''}"><i style="width:${p.fitness}%"></i></span><span class="pct">${Math.round(p.fitness)}</span></div>`).join('')}</div></div>
    <div class="card pad"><div class="section-title"><div><h2>训练条件</h2><div class="sub">设施与土地决定长期上限</div></div><button class="text-link" data-action="nav" data-screen="finance">升级</button></div><div class="facility-card"><div class="facility-icon">TR</div><div class="facility-info"><div class="ft">训练设施 <span class="tag">Lv.${c.facility.training}</span></div><div class="fd">提升训练成长概率，缩短年轻球员的成长周期。</div><div class="pips">${Array.from({length:5}).map((_,i)=>`<i class="${i<c.facility.training?'on':''}"></i>`).join('')}</div></div></div><div class="facility-card"><div class="facility-icon">ME</div><div class="facility-info"><div class="ft">医疗中心 <span class="tag">Lv.${c.facility.medical}</span></div><div class="fd">降低训练与比赛中的受伤概率，加快每日体力恢复。</div><div class="pips">${Array.from({length:5}).map((_,i)=>`<i class="${i<c.facility.medical?'on':''}"></i>`).join('')}</div></div></div><div class="facility-card"><div class="facility-icon">YG</div><div class="facility-info"><div class="ft">青训学院 <span class="tag">Lv.${c.facility.youth}</span></div><div class="fd">影响赛季末青训苗子的数量与潜力。</div><div class="pips">${Array.from({length:5}).map((_,i)=>`<i class="${i<c.facility.youth?'on':''}"></i>`).join('')}</div></div></div><div class="tactic-note" style="margin-top:10px"><strong>体力机制：</strong>比赛消耗大量体力，训练日每天只恢复一部分。连续高强度训练或逼抢战术会让主力提前透支。替补球员因此同样重要。</div></div>
  </div></div>`;
}


/* -------------------------------------------------------------------------
   16. 转会：市场、报价、谈判
   ------------------------------------------------------------------------- */
function marketPlayerIds() {
  if (!G.market) G.market = { playerIds: [], refreshedSeason: 0, refreshedWeek: 0 };
  const valid = [];
  for (const id of G.market.playerIds) {
    const p = player(id);
    if (!p || p.clubId === G.userClubId || p.loan) continue;
    valid.push(id);
  }
  for (const id of G.freeAgents) if (player(id) && !valid.includes(id)) valid.push(id);
  G.market.playerIds = [...new Set(valid)];
  return G.market.playerIds.slice();
}
function askingPriceFor(p) {
  if (!p) return 0;
  const seller = p.clubId ? clubById(p.clubId) : null;
  if (!seller) return 0;
  let mult = p.askingMultiplier || 1.15;
  if (p.transferStatus === 'listed') mult *= .92;
  else if (p.transferStatus === 'requested') mult *= .84;
  if (seller.squad.length <= 18) mult *= 1.28;
  if (p.contract <= 1) mult *= .72;
  if (p.age >= 31) mult *= .9;
  const top = Math.max(...seller.squad.map(id => player(id)?.ovr || 0));
  if (p.ovr >= top - 1) mult *= 1.12;
  const value = calcValue(p);
  // 卖家不会把一名球员卖到明显低于其能力身价的水平。
  const scale = Math.max(value * .82, value * clamp(mult, .72, 1.85));
  if (scale >= 1e6) return Math.round(scale / 10000) * 10000;
  if (scale >= 1e5) return Math.round(scale / 1000) * 1000;
  return Math.round(scale / 500) * 500;
}
function isLoanAvailable(p) {
  if (!p || !p.clubId || p.loan) return false;
  const seller = clubById(p.clubId);
  if (!seller || seller.isUser) return false;
  if (p.age > 24) return false;
  if ((p.potential - p.ovr) < 7 && p.ovr > 55) return false;
  const user = userClub();
  if (!user) return false;
  if (seller.tier < user.tier - 1) return false;
  if (seller.tier === user.tier - 1 && p.ovr > TIERS[user.tier].base + 13) return false;
  return true;
}
/* 自由球员池的容量与位置结构。
   旧逻辑只有“低能力老将淡出”一条规则：合同到期的球员不断加入，AI 俱乐部却很少签门将，
   于是几个赛季后自由市场里会堆出一两百人，其中门将越来越多（门将综合能力被守门属性抬高，
   又几乎不会低于 42，正好躲过清理规则）。这里统一收口：
   1) 年龄过大或已经无法立足的老将直接退出职业足坛；
   2) 门将数量不超过 FREE_AGENT_GK_LIMIT；
   3) 总人数不超过 FREE_AGENT_LIMIT，优先保留年轻、高潜力、能力更强的球员。
   隐藏球员、青训苗子、测试工具生成的结果以及正在谈判的球员永远不会被清理。 */
const FREE_AGENT_LIMIT = 64;
const FREE_AGENT_GK_LIMIT = 4;
const FREE_AGENT_MAX_AGE = 35;
function freeAgentPriority(p) {
  const room = Math.max(0, (p.potential || p.ovr) - p.ovr);
  let score = p.ovr + room * .6;
  if (p.age <= 21) score += 10;
  else if (p.age <= 24) score += 5;
  else if (p.age >= 30) score -= (p.age - 29) * 2.5;
  return score;
}
function protectedFreeAgentIds() {
  const ids = new Set();
  const season = G?.season?.number || 0;
  for (const p of Object.values(G?.players || {})) {
    if (!p) continue;
    if (p.hidden || p.hiddenKey || p.youth || p.testPull || p.testStreet) { ids.add(p.id); continue; }
    // 玩家本赛季刚解约的球员多留一个赛季，避免“刚离队就查无此人”
    if (p.userReleasedSeason && p.userReleasedSeason >= season - 1) ids.add(p.id);
  }
  for (const id of (G?.youthProspects || [])) ids.add(Number(id));
  for (const n of (G?.negotiations || [])) if (n.status === 'open') ids.add(Number(n.playerId));
  return ids;
}
function dropFreeAgent(p) {
  if (!p) return;
  delete G.players[p.id];
  G.freeAgents = (G.freeAgents || []).filter(id => Number(id) !== p.id);
  G.negotiations = (G.negotiations || []).filter(n => Number(n.playerId) !== p.id);
  G.offers = (G.offers || []).filter(o => Number(o.playerId) !== p.id);
  if (G.market?.playerIds) G.market.playerIds = G.market.playerIds.filter(id => Number(id) !== p.id);
}
function pruneFreeAgents() {
  if (!G?.players) return 0;
  const protectedIds = protectedFreeAgentIds();
  const seen = new Set();
  const pool = [];
  for (const rawId of (G.freeAgents || [])) {
    const id = Number(rawId);
    if (seen.has(id)) continue;
    seen.add(id);
    const p = player(id);
    if (!p || p.clubId || p.loan) continue;
    pool.push(p);
  }
  const keep = new Map();
  let removed = 0;
  for (const p of pool) {
    if (protectedIds.has(p.id)) { keep.set(p.id, p); continue; }
    const tooOld = p.age >= FREE_AGENT_MAX_AGE;
    const washedUp = p.age >= 29 && p.ovr < 36 && ((p.potential || p.ovr) - p.ovr) < 6;
    if (tooOld || washedUp) { dropFreeAgent(p); removed++; continue; }
    keep.set(p.id, p);
  }
  // 门将上限：同一时间只保留最有价值/最有潜力的几名门将，其余的退出职业足坛。
  const gks = [...keep.values()].filter(p => p.pos === 'GK' && !protectedIds.has(p.id)).sort((a, b) => freeAgentPriority(b) - freeAgentPriority(a));
  for (let i = FREE_AGENT_GK_LIMIT; i < gks.length; i++) {
    keep.delete(gks[i].id);
    dropFreeAgent(gks[i]);
    removed++;
  }
  // 总人数上限：隐藏/测试/谈判中的球员始终保留，其余按吸引力排序截断。
  if (keep.size > FREE_AGENT_LIMIT) {
    const droppable = [...keep.values()].filter(p => !protectedIds.has(p.id)).sort((a, b) => freeAgentPriority(a) - freeAgentPriority(b));
    let over = keep.size - FREE_AGENT_LIMIT;
    for (const p of droppable) {
      if (over <= 0) break;
      keep.delete(p.id);
      dropFreeAgent(p);
      removed++;
      over--;
    }
  }
  const kept = new Set(keep.keys());
  G.freeAgents = [...new Set((G.freeAgents || []).map(Number).filter(id => kept.has(id)))];
  return removed;
}
function freeAgentPoolStats() {
  const ps = (G?.freeAgents || []).map(id => player(id)).filter(Boolean);
  return { total: ps.length, gk: ps.filter(p => p.pos === 'GK').length };
}
function refreshTransferListings(force = false) {
  if (!G) return;
  if (!G.market) G.market = {};
  if (!force && G.market.refreshedSeason === G.season.number && G.market.refreshedWeek === G.season.week) return;
  // 每次刷新市场前顺手收口自由球员池，避免赛季中不断签约/解约后名单继续膨胀。
  pruneFreeAgents();
  const ids = [];
  for (const club of otherClubs()) {
    if (club.squad.length <= 15) continue;
    const ps = squadPlayers(club);
    const sorted = ps.slice().sort((a,b) => b.ovr - a.ovr);
    const protectedIds = new Set(sorted.slice(0, Math.min(11, sorted.length)).map(p => p.id));
    const pool = ps.filter(p => p.age <= 33 && !p.loan);
    // 门将挂牌要克制：只有真正富余（非主力门将）或被挂牌/申请离队时，才以较低概率
    // 把一名门将放进市场；外场球员优先填满每家俱乐部的挂牌名额。
    const gkUnhappy = pool.filter(p => p.pos === 'GK' && (p.transferStatus === 'listed' || p.transferStatus === 'requested'));
    const gks = pool.filter(p => p.pos === 'GK');
    const firstGk = gks.slice().sort((a, b) => b.ovr - a.ovr)[0];
    const gkSurplus = gks.filter(p => p !== firstGk && !gkUnhappy.includes(p));
    const gkCandidate = gkUnhappy[0] || (gkSurplus.length && chance(.16) ? pick(gkSurplus) : null);
    const candidates = shuffle(pool.filter(p => p.pos !== 'GK'));
    if (gkCandidate) candidates.unshift(gkCandidate);
    let listedCount = 0;
    let listedGk = 0;
    for (const p of candidates) {
      if (listedCount >= (club.tier <= 2 ? 3 : 2)) break;
      const surplus = !protectedIds.has(p.id);
      const unhappy = p.transferStatus === 'listed' || p.transferStatus === 'requested';
      if (!surplus && !unhappy && !chance(.12)) continue;
      if (p.pos === 'GK') {
        if (listedGk >= 1) continue;
        listedGk++;
      }
      p.loanListed = isLoanAvailable(p) && chance(.3);
      ids.push(p.id);
      listedCount++;
    }
  }
  for (const id of G.freeAgents) if (player(id)) ids.push(id);
  G.market.playerIds = [...new Set(ids)];
  G.market.refreshedSeason = G.season.number;
  G.market.refreshedWeek = G.season.week;
  G.market.lastOpenedDay = G.meta.totalDays;
}
function expiringOfferCheck() {
  if (!G?.offers) return;
  const today = G.meta.totalDays;
  let changed = false;
  for (const o of G.offers) {
    if (o.status === 'pending' && o.expiresDay < today) {
      o.status = 'expired';
      changed = true;
      addNews('报价已过期', `${clubById(o.buyerClubId)?.name || '对方俱乐部'} 对 ${player(o.playerId)?.name || '球员'} 的报价已过期。`, 'transfer');
    }
  }
  if (changed) saveGame();
}
function clubInterestScore(club, p) {
  if (!club || !p || club.isUser) return 0;
  if (club.squad.length >= 26) return 0;
  const power = teamPower(club.id);
  const tierBase = TIERS[club.tier].base;
  let score = .08;
  const qualityGap = p.ovr - (tierBase - 1);
  if (qualityGap > 0) score += clamp(qualityGap * .026, 0, .34);
  if (p.potential - p.ovr > 9 && p.age <= 22) score += .16;
  if (p.transferStatus === 'listed') score += .28;
  if (p.transferStatus === 'requested') score += .2;
  if (p.contract <= 1) score += .12;
  if (p.ovr > power + 3) score += .14;
  if (p.age >= 31) score -= .08;
  const value = calcValue(p);
  if (value > (club.transferBudget || 0) * .7) score -= .35;
  if (club.tier < (userClub()?.tier || 5)) score += .05;
  if (p.ovr < tierBase - 12) score -= .18;
  return clamp(score, 0, .98);
}
function updateUserPlayerInterests() {
  const c = userClub();
  if (!c) return;
  const list = [];
  for (const p of squadPlayers(c)) {
    if (p.loan) continue;
    let best = null;
    for (const club of otherClubs()) {
      if (club.squad.length >= 26) continue;
      const value = calcValue(p);
      if (value > Math.max(club.transferBudget || 0, 15000) * 1.8) continue;
      const score = clubInterestScore(club, p);
      if (!best || score > best.interest) best = { playerId: p.id, clubId: club.id, interest: round(score,2) };
    }
    if (best && best.interest >= .36) list.push(best);
  }
  c.interestedPlayers = list.sort((a,b) => b.interest - a.interest).slice(0,8);
}
function generateIncomingOffersForWeek() {
  if (!transferWindowOpen()) return;
  const c = userClub();
  if (!c) return;
  const pending = G.offers.filter(o => o.status === 'pending' && o.sellerClubId === c.id);
  if (pending.length >= 5) return;
  const usedBuyers = new Set(pending.map(o => o.buyerClubId));
  const eligible = squadPlayers(c).filter(p => !p.loan && !p.injuryDays);
  const candidates = [];
  for (const p of eligible) {
    const interestClubs = otherClubs().map(club => ({ club, score: clubInterestScore(club, p) }))
      .filter(x => x.score >= .42 && x.club.transferBudget >= calcValue(p) * .35 && !usedBuyers.has(x.club.id)).sort((a,b) => b.score - a.score);
    if (!interestClubs.length) continue;
    let chanceBase = p.transferStatus === 'listed' ? .55 : p.transferStatus === 'requested' ? .45 : .11;
    chanceBase += (p.season?.goals || 0) * .008;
    if (p.contract <= 1) chanceBase += .06;
    if (!chance(chanceBase)) continue;
    candidates.push({ p, club: interestClubs[0].club, score: interestClubs[0].score });
  }
  candidates.sort((a,b) => b.score - a.score);
  const maxNew = Math.min(2, 5 - pending.length);
  let created = 0;
  for (const { p, club, score } of candidates.slice(0, maxNew)) {
    const value = calcValue(p);
    let fee = Math.round(value * (.7 + score * .5 + rand() * .18) / 500) * 500;
    if (p.contract <= 1) fee = Math.round(fee * .62 / 500) * 500;
    if (p.transferStatus === 'listed') fee = Math.max(fee, Math.round(value * .86 / 500) * 500);
    fee = Math.max(1500, fee);
    const isLoan = (p.transferStatus === 'loan') || (p.age <= 23 && (p.potential - p.ovr) >= 8 && score < .55 && chance(.34));
    if (isLoan) fee = Math.round(value * .045 / 500) * 500;
    const installYears = !isLoan && chance(.33) ? randInt(2, 3) : 1;
    const sellOn = !isLoan && chance(.16) ? randInt(5, 15) : 0;
    const offer = {
      id: `o${Date.now()}${randInt(1000,9999)}`, playerId: p.id, buyerClubId: club.id, sellerClubId: c.id,
      type: isLoan ? 'loan' : 'buy', fee, installYears, sellOn, wageShare: isLoan ? randInt(55,100) : 100,
      loanUntilSeason: isLoan ? G.season.number : null, status: 'pending', createdDay: G.meta.totalDays,
      expiresDay: G.meta.totalDays + randInt(4,7), rounds: 0, patience: 3, log: [],
      counterMax: Math.round(value * (1.02 + score * .55) / 500) * 500, fromUser: false,
    };
    offer.log.push({ who: 'club', text: isLoan ? `${club.name}希望租借这名年轻球员，愿意承担 ${offer.wageShare}% 的工资。` : `${club.name}对${p.name}感兴趣，正式提交报价。` });
    G.offers.push(offer);
    pending.push(offer);
    usedBuyers.add(club.id);
    created++;
    addNews(`${club.name} 提交报价`, isLoan ? `对方希望租借 ${p.name} 至赛季结束。` : `对方为 ${p.name} 报价 ${fmtMoney(fee)}${installYears > 1 ? `，分 ${installYears} 年支付` : ''}。你可以接受、拒绝或还价。`, 'transfer');
  }
  if (created) saveGame();
}
function refreshMarketOffersWeekly() {
  if (!G) return;
  updateUserPlayerInterests();
  if (transferWindowOpen()) { refreshTransferListings(); generateIncomingOffersForWeek(); }
}
function openIncomingOffer(offerId) {
  const o = G.offers.find(x => x.id === offerId);
  if (!o) return;
  const p = player(o.playerId), buyer = clubById(o.buyerClubId), seller = clubById(o.sellerClubId);
  if (!p || !buyer) return;
  const expiresIn = Math.max(0, o.expiresDay - G.meta.totalDays);
  openModal({
    kicker: o.type === 'loan' ? '租借报价' : '转会报价', title: `${buyer.name} 的报价`,
    body: `<div class="player-hero">${shirtAvatar(p, seller)}<div><div class="player-hero-name">${esc(p.name)}</div><div class="player-hero-meta">${p.age} 岁 · ${POS_CN[p.pos]} · ${esc(p.nat)} · 当前身价 ${fmtMoney(calcValue(p))}</div><div class="player-hero-badges"><span class="tag">能力 ${p.ovr}</span><span class="tag gold">潜力 ${Math.round(p.potential)}</span>${playerStatusTags(p)}</div></div><div class="ovr-hero"><div class="v">${p.ovr}</div><div class="k">综合</div></div></div>
    <div class="offer-card unread" style="margin-bottom:12px"><div class="offer-head"><div class="offer-title">${esc(buyer.name)} · 正式报价</div><span class="tag ${o.type==='loan'?'blue':'gold'}">${o.type==='loan'?'租借':'永久转会'}</span></div><div class="offer-meta">报价金额：<strong class="gold">${fmtMoney(o.fee)}</strong>${o.installYears>1?` · 分 ${o.installYears} 年支付`:''}<br>${o.type==='loan'?`工资承担：${o.wageShare}% · 租期至本赛季结束`:`二次转会分成：${o.sellOn?o.sellOn+'%':'无'}`}<br>报价有效期：<span class="${expiresIn<=2?'red':''}">${expiresIn} 天</span></div></div>
    <div class="nego-log">${o.log.map(l => `<div class="nego-msg ${l.who}">${esc(l.text)}</div>`).join('')}</div>
    <div class="tactic-note">${o.type==='loan'?'租借期间，球员将代表对方俱乐部出场，赛季结束后回到你的阵容。你的工资支出会相应减少。':'永久转会完成后，球员将立即离开球队。如果他是首发，请记得重新排阵。'}</div>`,
    actions: `<button class="btn danger" data-action="reject-offer" data-id="${o.id}">拒绝</button><button class="btn ghost" data-action="open-sell-counter" data-id="${o.id}">还价</button><button class="btn primary" data-action="accept-offer" data-id="${o.id}">接受报价</button>`,
    wide: true,
  });
}
function acceptIncomingOffer(offerId) {
  const o = G.offers.find(x => x.id === offerId);
  if (!o || o.status !== 'pending') return;
  const p = player(o.playerId), c = userClub(), buyer = clubById(o.buyerClubId);
  if (!p || !buyer) return;
  if (p.clubId !== c.id) { o.status = 'invalid'; closeModal(); return; }
  if (o.type === 'loan') {
    c.squad = c.squad.filter(id => id !== p.id);
    buyer.squad.push(p.id);
    p.loan = { fromClubId: c.id, toClubId: buyer.id, wageShare: o.wageShare, loanFee: o.fee, untilSeason: G.season.number };
    p.clubId = buyer.id;
    if (o.fee > 0) addLedger(o.fee, `${p.name} 外租至 ${buyer.name}`, `租借费 · 工资承担 ${o.wageShare}%`, 'transfer');
    addNews('租借完成', `${p.name} 将以租借身份加盟${buyer.name}，直到本赛季结束。`, 'transfer');
  } else {
    const owed = (c.owedSellOns || []).find(x => x.playerId === p.id);
    const firstPay = o.installYears > 1 ? Math.round(o.fee / o.installYears) : o.fee;
    if (o.installYears > 1) for (let y = 1; y < o.installYears; y++) c.receivable.push({ amount: Math.round(o.fee / o.installYears), dueSeason: G.season.number + y, playerId: p.id, buyerClubId: buyer.id });
    c.squad = c.squad.filter(id => id !== p.id);
    buyer.squad.push(p.id);
    p.loan = null; p.clubId = buyer.id; p.contract = 3; p.wage = calcWage(p.ovr, p.potential, p.age);
    p.transferStatus = 'none'; assignSquadNumber(p, buyer);
    addLedger(firstPay, `${p.name} 转会至 ${buyer.name}`, o.installYears > 1 ? `首期付款 · 总价 ${fmtMoney(o.fee)}` : '永久转会收入', 'transfer');
    if (owed) {
      const cut = Math.round(o.fee * owed.percent / 100);
      addLedger(-cut, `支付 ${clubById(owed.clubId)?.name || '原俱乐部'} 二次转会分成`, `${owed.percent}% 转售分成条款`, 'transfer');
      c.owedSellOns = c.owedSellOns.filter(x => x !== owed);
    }
    if (o.sellOn > 0) {
      if (!c.sellOnReceivables) c.sellOnReceivables = [];
      c.sellOnReceivables.push({ playerId: p.id, percent: o.sellOn, clubId: buyer.id, sinceSeason: G.season.number });
    }
    addNews('转会完成', `${p.name} 正式加盟${buyer.name}。转会费 ${fmtMoney(o.fee)}${o.installYears>1?`，分 ${o.installYears} 年支付`:''}。`, 'transfer');
    G.transferHistory.unshift({ day: G.meta.totalDays, season: G.season.number, type: 'sale', playerId: p.id, playerName: p.name, fromClubId: c.id, toClubId: buyer.id, fee: o.fee, installYears: o.installYears, sellOn: o.sellOn });
    if (G.transferHistory.length > 200) G.transferHistory.length = 200;
  }
  o.status = 'accepted';
  c.lineup = c.lineup.filter(x => x.playerId !== p.id);
  const neededSlots = (FORMATION_SLOTS[c.formation] || FORMATION_SLOTS['4-4-2']).length;
  if (c.lineup.length !== neededSlots || c.lineup.some(x => !x.playerId)) {
    c.lineup = bestLineupPlayers(c, true).map(x => ({ ...x }));
  }
  c.bench = bestBenchIds(c, BENCH_SIZE);
  autoAssignCaptainIfNeeded();
  updateUserPlayerInterests();
  saveGame(); closeModal(); renderApp();
  toast(o.type === 'loan' ? '租借完成' : '转会完成', `${p.name} 已离开球队。`, 'good');
}
function rejectIncomingOffer(offerId) {
  const o = G.offers.find(x => x.id === offerId);
  if (!o) return;
  o.status = 'rejected';
  addNews('报价被拒绝', `你拒绝了 ${clubById(o.buyerClubId)?.name || '对方俱乐部'} 对 ${player(o.playerId)?.name || '球员'} 的报价。`, 'transfer');
  saveGame(); closeModal(); renderApp();
}
function openSellCounter(offerId) {
  const o = G.offers.find(x => x.id === offerId);
  if (!o) return;
  const p = player(o.playerId);
  const suggested = Math.max(o.fee, Math.round(calcValue(p) * 1.15 / 500) * 500);
  openModal({
    kicker: '转会谈判', title: '提出你的要价',
    body: `<div class="nego-box"><div class="flex between" style="margin-bottom:10px"><div><div class="small muted">对方报价</div><div class="num gold" style="font-size:19px">${fmtMoney(o.fee)}</div></div><div class="tr"><div class="small muted">球员身价</div><div class="num" style="font-size:19px">${fmtMoney(calcValue(p))}</div></div></div><div class="nego-form"><label>你的要价<input id="sell-counter-fee" type="number" min="1000" step="500" value="${suggested}"></label><label>分期年数<select id="sell-counter-years"><option value="1">一次性付清</option><option value="2">分 2 年</option><option value="3">分 3 年</option></select></label><label>要求二次转会分成<select id="sell-counter-sellon"><option value="0">不要分成</option><option value="5">5%</option><option value="10">10%</option><option value="15">15%</option></select></label><label>谈判立场<select id="sell-counter-tone"><option value="firm">坚持要价</option><option value="soft">可以小幅让步</option></select></label></div><div class="nego-log" style="margin-top:12px;max-height:none">${o.log.map(l => `<div class="nego-msg ${l.who}">${esc(l.text)}</div>`).join('')}</div><p class="xsmall faint" style="margin-top:8px">对方最高心理价位约为 ${fmtMoney(o.counterMax)}。超过这个数字，谈判很可能破裂。</p></div>`,
    actions: `<button class="btn ghost" data-action="close-modal">取消</button><button class="btn primary" data-action="submit-sell-counter" data-id="${o.id}">发送还价</button>`, wide: true,
  });
}
function submitSellCounter(offerId) {
  const o = G.offers.find(x => x.id === offerId);
  if (!o) return;
  const p = player(o.playerId);
  const fee = Math.max(1000, Number($('#sell-counter-fee')?.value || 0));
  const years = clamp(Number($('#sell-counter-years')?.value || 1), 1, 3);
  const sellOn = clamp(Number($('#sell-counter-sellon')?.value || 0), 0, 20);
  const tone = $('#sell-counter-tone')?.value || 'firm';
  o.rounds = (o.rounds || 0) + 1;
  o.log.push({ who: 'me', text: `我要求转会费 ${fmtMoney(fee)}${years>1?`，分 ${years} 年支付`:''}${sellOn?`，并保留 ${sellOn}% 的二次转会分成`:''}。` });
  const totalValue = fee * (years > 1 ? .95 : 1) + calcValue(p) * sellOn / 100 * .45;
  const max = o.counterMax * (tone === 'soft' ? .96 : 1.03);
  if (totalValue <= max) {
    o.fee = Math.round(fee / 500) * 500; o.installYears = years; o.sellOn = sellOn;
    o.log.push({ who: 'ok', text: `${clubById(o.buyerClubId)?.name || '对方'}接受了新的条件。报价已更新，你可以确认成交。` });
    addNews('转会谈判取得进展', `${clubById(o.buyerClubId)?.name || '对方'}接受了你对 ${p.name} 的新要价。`, 'transfer');
    saveGame(); closeModal(); openIncomingOffer(o.id); renderApp();
    return;
  }
  if (fee > max * 1.28) {
    o.status = 'rejected';
    o.log.push({ who: 'bad', text: `${clubById(o.buyerClubId)?.name || '对方'}认为要价脱离现实，退出了谈判。` });
    addNews('转会谈判破裂', `${clubById(o.buyerClubId)?.name || '对方'}撤回了对 ${p.name} 的报价。`, 'transfer');
    saveGame(); closeModal(); renderApp(); toast('谈判破裂', '对方撤回了报价。', 'bad');
    return;
  }
  o.fee = Math.round(max * .965 / 500) * 500; o.installYears = Math.min(years, 2); o.sellOn = Math.min(sellOn, 8);
  o.patience -= 1;
  o.log.push({ who: 'club', text: `这个价格超出了我们的预算。我们最多可以出到 ${fmtMoney(o.fee)}${o.installYears>1?'，分两年支付':''}。这是我们能接受的极限。` });
  addNews('对方还价', `${clubById(o.buyerClubId)?.name || '对方'}对 ${p.name} 提出了最终报价 ${fmtMoney(o.fee)}。`, 'transfer');
  saveGame(); closeModal(); openIncomingOffer(o.id); renderApp();
}
function canNegotiateForUser(p) {
  if (!p) return false;
  if (!p.clubId) return true;
  const seller = clubById(p.clubId), user = userClub();
  if (!seller || !user) return false;
  const userTier = user.tier;
  const gap = userTier - seller.tier; // 正数代表卖方俱乐部级别更高
  if (gap <= 0) return true;
  if (['listed', 'requested'].includes(p.transferStatus)) return true;
  const cap = TIERS[userTier].base + (gap >= 2 ? 8 : 15);
  if (p.ovr <= cap) return true;
  if (gap >= 2) {
    // 更高级别俱乐部的年轻储备，除非已被挂牌，否则不会卖给低级别球队
    if (p.age <= 21 && (p.potential - p.ovr) >= 12 && p.ovr <= cap + 3) return true;
    return false;
  }
  // 只高一级：超过能力上限的核心球员不出售；年轻高潜例外
  if (p.age <= 21 && (p.potential - p.ovr) >= 12 && p.ovr <= cap + 4) return true;
  return false;
}
function startBuyNegotiation(playerId, mode = 'buy') {
  const p = player(playerId), c = userClub();
  if (!p || !c) return;
  if (!p.clubId) return openFreeAgentNegotiation(p.id);
  if (p.clubId === c.id) return toast('已在阵中', '这名球员已经属于你的俱乐部。', 'bad');
  if (!canNegotiateForUser(p)) return toast('对方拒绝谈判', '你的俱乐部级别还不足以吸引这名球员。先在联赛中证明自己。', 'bad');
  if (mode === 'buy' && !transferWindowOpen()) return toast('转会窗关闭', '自由球员可以随时签约；其他俱乐部球员必须在转会窗内谈判。', 'bad');
  if (c.squad.length >= SQUAD_LIMIT) return toast('阵容已满', `一线队最多 ${SQUAD_LIMIT} 人，请先出售或外租球员。`, 'bad');
  const seller = clubById(p.clubId);
  if (!seller) return;
  const asking = askingPriceFor(p);
  const nego = {
    id: `ng${Date.now()}${randInt(100,999)}`, kind: mode === 'loan' ? 'loan-buy' : 'buy', playerId: p.id,
    sellerClubId: seller.id, buyerClubId: c.id, stage: 'club', status: 'open', createdDay: G.meta.totalDays,
    rounds: 0, patience: 3, asking, lastOffer: null, log: [],
  };
  nego.log.push({ who: 'club', text: mode === 'loan' ? `${seller.name}表示可以讨论租借，但需要一笔租借费和工资分担。` : `${seller.name}愿意听取报价。他们的心理价位大约在 ${fmtMoney(asking)}。` });
  G.negotiations.push(nego);
  saveGame(); openNegotiation(nego.id);
}
function openFreeAgentNegotiation(playerId) {
  const p = player(playerId), c = userClub();
  if (!p || !c) return;
  if (c.squad.length >= SQUAD_LIMIT) return toast('阵容已满', `一线队最多 ${SQUAD_LIMIT} 人。`, 'bad');
  const existing = G.negotiations.find(n => n.kind === 'free' && n.playerId === p.id && n.status === 'open');
  if (existing) { openNegotiation(existing.id); return; }
  const nego = {
    id: `ng${Date.now()}${randInt(100,999)}`, kind: 'free', playerId: p.id, sellerClubId: null,
    buyerClubId: c.id, stage: 'contract', status: 'open', createdDay: G.meta.totalDays,
    rounds: 0, patience: 3, asking: 0, lastOffer: null, log: [{ who: 'club', text: '球员是自由身，可以直接讨论个人合同。' }],
  };
  G.negotiations.push(nego);
  saveGame(); openNegotiation(nego.id);
}
function contractDemand(p, buyer, role = 'rotation') {
  const baseWage = calcWage(p.ovr, p.potential, p.age);
  const roleFactor = role === 'star' ? 1.17 : role === 'squad' ? .88 : 1;
  const tierAppeal = buyer.tier <= 3 ? 1.08 : 1;
  const seller = p.clubId ? clubById(p.clubId) : null;
  const dropDownGap = seller ? Math.max(0, seller.tier - buyer.tier) : 0;
  let wage = Math.max(p.wage * 1.08, baseWage * 1.04) * roleFactor * tierAppeal;
  wage *= 1 + dropDownGap * .17;
  if (p.ambition > 70 && buyer.tier >= 4) wage *= 1.04;
  if (p.age <= 22) wage *= .93;
  const bonus = Math.max(500, Math.round(calcValue(p) * (p.age <= 23 ? .055 : .035) * (role === 'star' ? 1.2 : 1) / 500) * 500);
  return { wage: Math.round(wage/50)*50, bonus, years: p.age <= 23 ? 4 : p.age <= 28 ? 3 : 2 };
}
function openNegotiation(negoId) {
  const nego = G.negotiations.find(n => n.id === negoId);
  if (!nego) return;
  const p = player(nego.playerId), c = userClub();
  const seller = nego.sellerClubId ? clubById(nego.sellerClubId) : null;
  if (!p) return;
  if (nego.stage === 'club') {
    const asking = nego.asking;
    openModal({
      kicker: '转会谈判 · 俱乐部', title: `${seller.name} · ${p.name}`,
      body: `<div class="player-hero">${shirtAvatar(p, seller)}<div><div class="player-hero-name">${esc(p.name)}</div><div class="player-hero-meta">${p.age} 岁 · ${POS_CN[p.pos]} · ${esc(p.nat)} · ${esc(seller.name)}</div><div class="player-hero-badges"><span class="tag">能力 ${p.ovr}</span><span class="tag gold">潜力 ${Math.round(p.potential)}</span><span class="tag">合同 ${p.contract} 年</span></div></div><div class="ovr-hero"><div class="v">${p.ovr}</div><div class="k">综合</div></div></div>
      <div class="flex between" style="margin-bottom:10px"><div><div class="label">对方心理价位</div><div class="num gold" style="font-size:19px">${fmtMoney(asking)}</div></div><div class="tr"><div class="label">预估身价</div><div class="num" style="font-size:17px">${fmtMoney(calcValue(p))}</div></div></div>
      <div class="nego-log">${nego.log.map(l => `<div class="nego-msg ${l.who}">${esc(l.text)}</div>`).join('')}</div>
      <div class="nego-form"><label>首次报价<input id="nego-fee" type="number" min="1000" step="500" value="${nego.lastOffer?.fee || Math.round(asking*.82/500)*500}"></label><label>付款年限<select id="nego-install"><option value="1">一次性付清</option><option value="2">分 2 年</option><option value="3">分 3 年</option></select></label><label>提供二次转会分成<select id="nego-sellon"><option value="0">0%</option><option value="5">5%</option><option value="10">10%</option><option value="15">15%</option></select></label><label>报价策略<select id="nego-tone"><option value="normal">正常报价</option><option value="low">低价试探</option><option value="final">最终报价</option></select></label></div>
      <div class="nego-footer"><span class="xsmall faint">谈判耐心：${'●'.repeat(nego.patience)}${'○'.repeat(Math.max(0,3-nego.patience))}</span><button class="btn primary" data-action="submit-buy-offer" data-id="${nego.id}">提交报价</button></div>`,
      actions: `<button class="btn ghost" data-action="cancel-negotiation" data-id="${nego.id}">结束谈判</button>`, wide: true,
    });
    return;
  }
  if (nego.stage === 'contract' || nego.kind === 'free') {
    const demand = contractDemand(p, c, 'rotation');
    openModal({
      kicker: nego.kind === 'free' ? '自由球员 · 个人合同' : '转会谈判 · 球员合同', title: `与 ${p.name} 讨论个人条款`,
      body: `<div class="player-hero">${shirtAvatar(p, seller || c)}<div><div class="player-hero-name">${esc(p.name)}</div><div class="player-hero-meta">${p.age} 岁 · ${POS_CN[p.pos]} · ${esc(p.nat)}</div><div class="player-hero-badges"><span class="tag">能力 ${p.ovr}</span><span class="tag gold">潜力 ${Math.round(p.potential)}</span><span class="tag">${esc(p.personality?.name || '职业')}</span></div></div><div class="ovr-hero"><div class="v">${p.ovr}</div><div class="k">综合</div></div></div>
      <div class="flex between" style="margin-bottom:10px"><div><div class="label">球员周薪期望</div><div class="num gold" style="font-size:19px">${fmtWage(demand.wage)}</div></div><div class="tr"><div class="label">期望签字费</div><div class="num" style="font-size:17px">${fmtMoney(demand.bonus)}</div></div><div class="tr"><div class="label">倾向合同</div><div class="num" style="font-size:17px">${demand.years} 年</div></div></div>
      <div class="nego-log">${nego.log.map(l => `<div class="nego-msg ${l.who}">${esc(l.text)}</div>`).join('')}</div>
      <div class="nego-form"><label>周薪报价<input id="nego-wage" type="number" min="300" step="50" value="${Math.round((demand.wage*.84+p.wage*.16)/50)*50}"></label><label>合同年限<select id="nego-years"><option value="1">1 年</option><option value="2">2 年</option><option value="3">3 年</option><option value="4">4 年</option><option value="5">5 年</option></select></label><label>签字费<input id="nego-bonus" type="number" min="0" step="500" value="${Math.round(demand.bonus*.65/500)*500}"></label><label>球队定位<select id="nego-role"><option value="star">核心球员</option><option value="rotation" selected>轮换主力</option><option value="squad">替补深度</option></select></label></div>
      <div class="nego-footer"><span class="xsmall faint">转会费 ${fmtMoney(nego.lastOffer?.fee || 0)} · 球员会看重工资、定位、俱乐部级别与签字费。</span><button class="btn primary" data-action="submit-contract-offer" data-id="${nego.id}">提交合同</button></div>`,
      actions: `<button class="btn ghost" data-action="cancel-negotiation" data-id="${nego.id}">退出谈判</button>`, wide: true,
    });
  }
}
function submitBuyOffer(negoId) {
  const nego = G.negotiations.find(n => n.id === negoId);
  if (!nego) return;
  const p = player(nego.playerId);
  const fee = Math.max(1000, Number($('#nego-fee')?.value || 0));
  const install = clamp(Number($('#nego-install')?.value || 1), 1, 3);
  const sellOn = clamp(Number($('#nego-sellon')?.value || 0), 0, 20);
  const tone = $('#nego-tone')?.value || 'normal';
  const asking = nego.asking;
  nego.lastOffer = { fee, install, sellOn }; nego.rounds++;
  nego.log.push({ who: 'me', text: `我们报价 ${fmtMoney(fee)}${install>1?`，分 ${install} 年支付`:''}${sellOn?`，并提供 ${sellOn}% 的二次转会分成`:''}。` });
  const effective = fee * (install === 1 ? 1 : install === 2 ? .965 : .935) + calcValue(p) * sellOn / 100 * .55;
  const threshold = asking * (tone === 'final' ? .96 : .91);
  if (effective >= asking * .99) {
    nego.stage = 'contract';
    nego.log.push({ who: 'ok', text: `${clubById(nego.sellerClubId).name}接受了报价。现在可以与球员讨论个人合同。` });
    addNews('转会费达成一致', `你与${clubById(nego.sellerClubId).name}就 ${p.name} 的转会费达成一致，等待球员签约。`, 'transfer');
    saveGame(); closeModal(); openNegotiation(nego.id); renderApp();
    return;
  }
  if (effective >= threshold) {
    nego.log.push({ who: 'club', text: `报价接近我们的估值。把总价提高到约 ${fmtMoney(asking)}，我们就可以放人。` });
    nego.patience--;
  } else if (tone === 'low' && nego.rounds >= 2) {
    nego.log.push({ who: 'bad', text: `${clubById(nego.sellerClubId).name}认为你没有诚意，结束了谈判。` });
    nego.status = 'rejected';
    addNews('转会谈判破裂', `${p.name} 的转会谈判破裂。`, 'transfer');
    saveGame(); closeModal(); renderApp(); return;
  } else {
    nego.log.push({ who: 'bad', text: `${clubById(nego.sellerClubId).name}拒绝了报价。他们希望得到接近 ${fmtMoney(asking)} 的总价。` });
    nego.patience--;
  }
  if (nego.patience <= 0) {
    nego.status = 'rejected'; nego.log.push({ who: 'bad', text: '对方失去了耐心，谈判终止。' });
    addNews('转会谈判破裂', `${p.name} 的转会谈判终止。`, 'transfer');
    saveGame(); closeModal(); renderApp(); toast('谈判破裂', '对方结束了谈判。', 'bad'); return;
  }
  saveGame(); closeModal(); openNegotiation(nego.id); renderApp();
}
function submitContractOffer(negoId) {
  const nego = G.negotiations.find(n => n.id === negoId);
  if (!nego) return;
  const p = player(nego.playerId), c = userClub();
  const wage = Math.max(300, Number($('#nego-wage')?.value || 0));
  const years = clamp(Number($('#nego-years')?.value || 2), 1, 5);
  const bonus = Math.max(0, Number($('#nego-bonus')?.value || 0));
  const role = $('#nego-role')?.value || 'rotation';
  const demand = contractDemand(p, c, role);
  const roleScore = role === 'star' ? .07 : role === 'squad' ? -.07 : 0;
  const sellerClub = p.clubId ? clubById(p.clubId) : null;
  const sellerRep = sellerClub?.reputation || 30;
  const dropPenalty = sellerClub ? Math.max(0, sellerClub.tier - c.tier) * .055 : 0;
  const wageRatio = wage / Math.max(1, demand.wage);
  const bonusRatio = bonus / Math.max(1, demand.bonus);
  const yearsFit = years >= demand.years ? .03 : years >= 2 ? -.01 : -.04;
  const score = wageRatio * .55 + .27 + bonusRatio * .1 + yearsFit + roleScore + (c.reputation - sellerRep) / 500 + (p.ambition > 70 ? .015 : 0) - dropPenalty;
  nego.log.push({ who: 'me', text: `个人合同：周薪 ${fmtWage(wage)}，${years} 年，签字费 ${fmtMoney(bonus)}，定位：${role === 'star' ? '核心球员' : role === 'squad' ? '替补深度' : '轮换主力'}。` });
  if (score >= .9 || (wageRatio >= .98 && bonus >= demand.bonus * .75)) {
    const transferFee = nego.kind === 'free' ? 0 : (nego.lastOffer?.fee || 0);
    const install = nego.lastOffer?.install || 1;
    const agentFee = Math.max(1000, Math.round(transferFee * .05 / 500) * 500);
    const upfrontFee = install > 1 ? Math.round(transferFee / install) : transferFee;
    if (c.cash < upfrontFee + agentFee + bonus) return toast('资金不足', `需要至少 ${fmtMoney(upfrontFee+agentFee+bonus)} 的现金。`, 'bad');
    finalizeIncomingTransfer(nego, { wage, years, bonus, role, transferFee, install, sellOn: nego.lastOffer?.sellOn || 0, agentFee });
  } else {
    nego.patience--;
    const msg = wageRatio < .86 ? `球员希望周薪至少达到 ${fmtWage(demand.wage)}。他不想在收入上做出让步。` : bonus < demand.bonus * .35 ? `签字费偏低。经纪团队希望至少得到 ${fmtMoney(demand.bonus)}。` : role === 'squad' ? '球员不愿意接受替补定位，他相信自己能在你的球队踢上主力。' : '球员还在犹豫。他需要看到更明确的诚意。';
    nego.log.push({ who: 'bad', text: msg });
    if (nego.patience <= 0) {
      nego.status = 'rejected'; nego.log.push({ who: 'bad', text: '球员暂时关闭了谈判。' });
      addNews('合同谈判破裂', `${p.name} 拒绝了你的合同报价。`, 'transfer');
      saveGame(); closeModal(); renderApp(); return;
    }
    saveGame(); closeModal(); openNegotiation(nego.id); renderApp();
  }
}
function finalizeIncomingTransfer(nego, terms) {
  const p = player(nego.playerId), c = userClub(), seller = nego.sellerClubId ? clubById(nego.sellerClubId) : null;
  if (!p) return;
  if (c.squad.length >= SQUAD_LIMIT) return toast('阵容已满', '请先清理阵容。', 'bad');
  const isFree = nego.kind === 'free';
  if (seller) seller.squad = seller.squad.filter(id => id !== p.id);
  else G.freeAgents = G.freeAgents.filter(id => id !== p.id);
  p.clubId = c.id; p.loan = null; p.wage = terms.wage; p.contract = G.season.finished ? terms.years + 1 : terms.years; p.promise = terms.role; p.testStreet = false;
  p.morale = clamp(p.morale + (terms.role === 'star' ? 8 : terms.role === 'squad' ? -5 : 2), 20, 95);
  p.transferStatus = 'none'; p.joinedSeason = G.season.number;
  c.squad.push(p.id); assignSquadNumber(p, c);
  const upfront = terms.install > 1 ? Math.round(terms.transferFee / terms.install) : terms.transferFee;
  if (!isFree) {
    addLedger(-upfront, `${p.name} 转会费`, `从 ${seller?.name || '自由市场'} 加盟${terms.install>1?` · 首期，分 ${terms.install} 年`:''}`, 'transfer');
    if (terms.agentFee) addLedger(-terms.agentFee, `${p.name} 经纪人佣金`, '转会附加费用', 'transfer');
    if (terms.install > 1) for (let y = 1; y < terms.install; y++) c.payable.push({ amount: Math.round(terms.transferFee / terms.install), dueSeason: G.season.number + y, playerId: p.id, sellerClubId: seller.id });
    if (terms.sellOn > 0) { if (!c.owedSellOns) c.owedSellOns = []; c.owedSellOns.push({ playerId: p.id, percent: terms.sellOn, clubId: seller.id }); }
    G.transferHistory.unshift({ day: G.meta.totalDays, season: G.season.number, type: 'buy', playerId: p.id, playerName: p.name, fromClubId: seller.id, toClubId: c.id, fee: terms.transferFee, installYears: terms.install, sellOn: terms.sellOn });
  } else {
    G.transferHistory.unshift({ day: G.meta.totalDays, season: G.season.number, type: 'free', playerId: p.id, playerName: p.name, fromClubId: null, toClubId: c.id, fee: 0 });
  }
  if (G.transferHistory.length > 200) G.transferHistory.length = 200;
  if (terms.bonus > 0) addLedger(-terms.bonus, `${p.name} 签字费`, `${terms.years} 年合同`, 'contract');
  nego.status = 'done';
  addNews('新援加盟', `${p.name} 与俱乐部签下 ${terms.years} 年合同，周薪 ${fmtWage(terms.wage)}。`, 'transfer');
  c.bench = bestBenchIds(c, BENCH_SIZE);
  updateUserPlayerInterests();
  saveGame(); closeModal(); renderApp();
  toast('转会完成', `${p.name} 已加入球队。`, 'good');
}
function cancelNegotiation(negoId) {
  const n = G.negotiations.find(x => x.id === negoId);
  if (n && n.status === 'open') n.status = 'withdrawn';
  saveGame(); closeModal(); renderApp();
}
function loanTransferRequest(playerId) {
  const p = player(playerId), c = userClub();
  if (!p || !c) return;
  if (!isLoanAvailable(p)) return toast('无法租借', '该球员目前不在可租借名单中。', 'bad');
  if (!transferWindowOpen()) return toast('转会窗关闭', '租借只能在转会窗内办理。', 'bad');
  if (c.squad.length >= SQUAD_LIMIT) return toast('阵容已满', '请先清理阵容。', 'bad');
  const seller = clubById(p.clubId);
  const loanFee = Math.max(500, Math.round(calcValue(p) * .04 / 500) * 500);
  openModal({
    kicker: '租借谈判', title: `租借 ${p.name}`,
    body: `<div class="player-hero">${shirtAvatar(p, seller)}<div><div class="player-hero-name">${esc(p.name)}</div><div class="player-hero-meta">${p.age} 岁 · ${POS_CN[p.pos]} · ${esc(seller.name)}</div><div class="player-hero-badges"><span class="tag">能力 ${p.ovr}</span><span class="tag gold">潜力 ${Math.round(p.potential)}</span><span class="tag blue">可租借</span></div></div></div><div class="offer-card"><div class="offer-head"><div class="offer-title">预计租借条件</div><span class="tag blue">至赛季结束</span></div><div class="offer-meta">租借费：<strong class="gold">${fmtMoney(loanFee)}</strong><br>工资承担：60%（每周 ${fmtWage(p.wage*.6)}）<br>球员将在赛季结束后返回${seller.name}。</div></div><div class="nego-form"><label>租借费<input id="loan-fee" type="number" min="0" step="500" value="${loanFee}"></label><label>工资承担<select id="loan-share"><option value="50">50%</option><option value="60" selected>60%</option><option value="75">75%</option><option value="100">100%</option></select></label></div><p class="xsmall faint" style="margin-top:8px">租借可以立刻补强阵容，但球员不会成为你的长期资产，也不能在租借期内被出售。</p>`,
    actions: `<button class="btn ghost" data-action="close-modal">取消</button><button class="btn primary" data-action="submit-loan" data-id="${p.id}">提交租借申请</button>`, wide: true,
  });
}
function submitLoanRequest(playerId) {
  const p = player(playerId), c = userClub(), seller = clubById(p.clubId);
  if (!p || !seller) return;
  const fee = Math.max(0, Number($('#loan-fee')?.value || 0));
  const share = clamp(Number($('#loan-share')?.value || 60), 0, 100);
  if (c.cash < fee) return toast('资金不足', '无法支付租借费。', 'bad');
  if (c.squad.length >= SQUAD_LIMIT) return toast('阵容已满', '请先清理阵容。', 'bad');
  if (!(share >= 60 || chance(.55))) return toast('租借被拒绝', `${seller.name}希望获得更高的工资分担。`, 'bad');
  if (fee > 0) addLedger(-fee, `${p.name} 租借费`, `从 ${seller.name} 租借至赛季结束`, 'transfer');
  seller.squad = seller.squad.filter(id => id !== p.id);
  c.squad.push(p.id); p.clubId = c.id; p.testStreet = false;
  p.loan = { fromClubId: seller.id, toClubId: c.id, wageShare: share, loanFee: fee, untilSeason: G.season.number };
  p.transferStatus = 'none'; assignSquadNumber(p, c);
  addNews('租借加盟', `${p.name} 以租借形式从${seller.name}加盟，租期至本赛季结束。`, 'transfer');
  closeModal(); saveGame(); renderApp();
  toast('租借完成', `${p.name} 已经加入球队。`, 'good');
}
function processLoanReturns() {
  for (const c of Object.values(G.clubs)) {
    for (const id of c.squad.slice()) {
      const p = player(id);
      if (!p || !p.loan) continue;
      if (p.loan.untilSeason < G.season.number) {
        const from = clubById(p.loan.fromClubId);
        if (from) {
          c.squad = c.squad.filter(x => x !== id);
          if (!from.squad.includes(id)) from.squad.push(id);
          p.clubId = from.id; p.loan = null;
          if (from.isUser) addNews(`${p.name} 租借期满归队`, '球员结束租借，回到俱乐部阵容。', 'transfer');
        }
      }
    }
  }
}
function processSellOnResales() {
  const c = userClub();
  if (!c) return;
  const keep = [];
  for (const clause of (c.sellOnReceivables || [])) {
    const p = player(clause.playerId);
    if (!p) continue;
    const owner = clubById(p.clubId);
    if (!owner || owner.isUser) continue;
    if (!chance(.16 + (p.age <= 23 ? .1 : 0) + (p.potential > 75 ? .08 : 0))) { keep.push(clause); continue; }
    const candidates = otherClubs().filter(x => x.id !== owner.id && x.transferBudget >= calcValue(p) * .9 && x.squad.length < 26);
    if (!candidates.length) { keep.push(clause); continue; }
    const newClub = pick(candidates);
    const saleFee = Math.round(calcValue(p) * (1.05 + rand() * .65) / 1000) * 1000;
    owner.squad = owner.squad.filter(id => id !== p.id);
    newClub.squad.push(p.id); p.clubId = newClub.id; assignSquadNumber(p, newClub);
    const cut = Math.round(saleFee * clause.percent / 100);
    addLedger(cut, `二次转会分成：${p.name}`, `从 ${newClub.name} 收到 ${clause.percent}% 转售分成`, 'transfer');
    addNews('二次转会分成到账', `${p.name} 从${owner.name}转会至${newClub.name}，你获得 ${fmtMoney(cut)} 的转售分成。`, 'transfer');
  }
  c.sellOnReceivables = keep.filter(cl => player(cl.playerId));
}
function processIncomingReceivables() {
  const c = userClub();
  if (!c) return;
  const thisSeason = G.season.number;
  const mature = (c.receivable || []).filter(x => x.dueSeason === thisSeason);
  c.receivable = (c.receivable || []).filter(x => x.dueSeason > thisSeason);
  for (const x of mature) addLedger(x.amount, '转会费分期到账', `${clubById(x.buyerClubId)?.name || '买方'}支付的分期款`, 'transfer');
  const payable = (c.payable || []).filter(x => x.dueSeason === thisSeason);
  c.payable = (c.payable || []).filter(x => x.dueSeason > thisSeason);
  let total = 0;
  for (const x of payable) total += x.amount;
  if (total > 0) addLedger(-total, '转会费分期付款', '本赛季到期分期款项', 'transfer');
}


/* -------------------------------------------------------------------------
   17. 赛程与积分榜
   ------------------------------------------------------------------------- */
function renderSchedule() {
  const c = userClub();
  const viewingTier = UI.viewTier || c.tier;
  const table = computeStandings(viewingTier);
  const myFixtures = allFixturesOfClub(c.id);
  const next = nextUserFixture();
  const seasonProgress = Math.round((myFixtures.filter(f => f.played).length / Math.max(1, myFixtures.length)) * 100);
  return `<div class="page-head"><div><div class="kicker">Fixtures & Table</div><h1>赛程与积分榜</h1><div class="sub">${TIER_NAME(c.tier)}采用 12 队主客场双循环，共 22 轮。联赛强度：AI 执行力 ${TIER_DIFFICULTY_LABEL(c.tier)}，每升一级强度都会提高；升班马前 8 周会经历适应期。</div></div><div class="flex gap8"><select class="division-select" data-change="view-tier">${[1,2,3,4,5].map(t => `<option value="${t}" ${viewingTier===t?'selected':''}>${TIER_NAME(t)}${t===c.tier?' · 我的联赛':''}</option>`).join('')}</select><button class="btn ghost" data-action="nav" data-screen="squad">前往阵容</button></div></div>
  <div class="card pad" style="margin-bottom:16px"><div class="flex between wrap gap12"><div><div class="label">赛季进程</div><div class="flex gap10" style="align-items:baseline"><span class="num" style="font-size:26px">${G.season.week}<span style="font-size:12px;color:var(--faint)"> / 22 轮</span></span><span class="tag ${transferWindowOpen()?'green':'gold'}">${transferWindowLabel()}</span></div></div><div class="tr"><div class="xsmall faint">已赛 ${myFixtures.filter(f=>f.played).length} 场 · 剩余 ${myFixtures.filter(f=>!f.played).length} 场</div><div class="season-progress" style="width:240px"><i style="width:${seasonProgress}%"></i></div></div></div></div>
  <div class="dash-grid"><div class="dash-col"><div class="card pad"><div class="section-title"><div><h2>我的赛程</h2><div class="sub">主客场双循环 · 周六比赛</div></div>${next?`<span class="tag gold">下一场：第 ${next.round} 轮</span>`:'<span class="tag green">赛季结束</span>'}</div><div class="fixture-list">${myFixtures.map(f => { const opp = clubById(fixtureOpponent(f,c.id)); const home = f.home === c.id; const res = resultForClub(f,c.id); const isNext = next && next.id === f.id; return `<button class="fixture-row ${isNext?'next':''}" data-action="open-fixture" data-id="${f.id}" style="width:100%;background:transparent;border-left:0;border-right:0;border-top:0;color:inherit;text-align:left"><span class="fx-date">第${f.round}轮<br>${fixtureDateText(f)}</span><span class="fx-main">${clubCrestEl(opp,'crest sm')}<span class="fx-opp">${home?'vs':'@'} ${esc(opp?.name||'待定')}</span><span class="fx-venue">${home?'主':'客'}</span></span><span class="fx-result ${res}">${f.played?`${f.hg} : ${f.ag}`:isNext?'<span class="upcoming">下一场</span>':'未赛'}</span></button>`; }).join('')}</div></div>
    <div class="card pad"><div class="section-title"><div><h2>联赛规则</h2><div class="sub">${TIER_NAME(viewingTier)} · 升降级制度</div></div><span class="tag">12 队</span></div><div class="rules-grid"><div class="rule"><div class="n">FORMAT</div><div class="t">主客场双循环</div><div class="d">每支球队与另外 11 支球队各交手两次，共 22 轮、132 场比赛。胜 3 分，平 1 分。</div></div><div class="rule"><div class="n">TIEBREAK</div><div class="t">同分排序</div><div class="d">积分 → 净胜球 → 进球数 → 胜场数。前两名直接升级，末两名降级。</div></div><div class="rule"><div class="n">PROMOTION</div><div class="t">升级名额</div><div class="d">${viewingTier===1?'顶级联赛不设升级；联赛冠军获得赛季奖杯。':'前两名直接升入更高一级联赛，无附加赛。'}</div></div><div class="rule"><div class="n">RELEGATION</div><div class="t">降级名额</div><div class="d">${viewingTier===5?'城市联赛是职业金字塔的底层，不设降级；末两名将接受董事会评估。':'末两名直接降入下一级联赛。'}</div></div></div></div>
  </div>
  <div class="dash-col"><div class="card pad"><div class="section-title"><div><h2>${TIER_NAME(viewingTier)}积分榜</h2><div class="sub">第 ${G.season.week} 周 · ${viewingTier===c.tier?'你的联赛':'其他级别'}</div></div>${viewingTier!==c.tier?`<span class="tag blue">观战</span>`:`<span class="tag gold">第 ${table.find(r=>r.clubId===c.id)?.position || '—'} 位</span>`}</div><div class="table-wrap" style="border:0"><table class="league-table"><thead><tr><th>#</th><th>球队</th><th>赛</th><th>胜</th><th>平</th><th>负</th><th>净</th><th>分</th><th class="hide-sm">近况</th></tr></thead><tbody>${table.map(r => `<tr class="${r.clubId===c.id?'me':''} ${viewingTier>1&&r.position<=2?'promote-row':''} ${viewingTier<5&&r.position>=table.length-1?'relegate-row':''}"><td><span class="rank ${r.position<=2?'top':r.position>=table.length-1?'bottom':''}">${r.position}</span></td><td class="team-cell">${clubCrestEl(r.club,'crest sm')}${esc(r.club.name)}</td><td>${r.played}</td><td>${r.wins}</td><td>${r.draws}</td><td>${r.losses}</td><td>${r.gd>0?'+':''}${r.gd}</td><td style="color:var(--gold-bright);font-weight:650">${r.points}</td><td class="hide-sm">${formPills(currentFormFor(r.clubId,5))}</td></tr>`).join('')}</tbody></table></div><div class="flex gap12" style="margin-top:10px;font-size:9.5px;color:var(--faint)"><span class="flex gap4"><i style="width:3px;height:10px;background:var(--green);display:inline-block"></i>升级区</span><span class="flex gap4"><i style="width:3px;height:10px;background:var(--red);display:inline-block"></i>降级区</span></div></div>
    <div class="card pad"><div class="section-title"><div><h2>本轮其他场次</h2><div class="sub">同级联赛</div></div><span class="tag">第 ${G.season.week} 轮</span></div><div class="fixture-list">${(G.divisions[viewingTier]?.fixtures||[]).filter(f=>f.round===G.season.week).slice(0,6).map(f => { const h=clubById(f.home),a=clubById(f.away); return `<div class="fixture-row" style="grid-template-columns:1fr 40px 1fr"><span class="fx-main" style="justify-content:flex-end">${esc(h?.short||h?.name||'')}</span><span class="tc num xsmall faint">${f.played?`${f.hg}-${f.ag}`:'vs'}</span><span class="fx-main">${esc(a?.short||a?.name||'')}</span></div>`; }).join('')}</div></div>
  </div></div>`;
}
function openFixtureDetails(fixtureId) {
  const f = getFixtureById(fixtureId);
  if (!f) return;
  const c = userClub(), home = clubById(f.home), away = clubById(f.away), oppId = fixtureOpponent(f,c.id), opp = clubById(oppId);
  const scorers = (f.scorers || []).map(id => player(id)).filter(Boolean);
  const stats = f.stats;
  openModal({
    kicker: `${TIER_NAME(f.tier)} · 第 ${f.round} 轮`, title: `${home.name} vs ${away.name}`,
    body: `<div class="match-setup-hero"><div class="setup-matchup"><div class="setup-team">${clubCrestEl(home,'crest lg')}<div class="n">${esc(home.name)}</div><div class="m">${f.home===c.id?'你的球队':'主队'}</div></div><div class="setup-mid"><div class="round">${f.played?'全场':fixtureDateText(f)}</div><div class="time">${f.played?`${f.hg} : ${f.ag}`:'VS'}</div><div class="venue">${esc(home.stadium)}</div></div><div class="setup-team">${clubCrestEl(away,'crest lg')}<div class="n">${esc(away.name)}</div><div class="m">${f.away===c.id?'你的球队':'客队'}</div></div></div></div>
    ${f.played?`<div class="detail-grid"><div><div class="stat-block-title">进球</div><div class="scorer-list">${scorers.length?scorers.map(p=>`<div>${esc(p.name)} <b>${p.clubId===f.home?home.short:away.short}</b></div>`).join(''):'<div class="faint">没有进球记录</div>'}</div></div><div><div class="stat-block-title">比赛数据</div>${stats?`<div class="ft-stat-line"><span>控球率</span><span class="v">${stats.possessionH}% - ${stats.possessionA}%</span></div><div class="ft-stat-line"><span>射门</span><span class="v">${stats.shotsH} - ${stats.shotsA}</span></div><div class="ft-stat-line"><span>射正</span><span class="v">${stats.onTargetH} - ${stats.onTargetA}</span></div><div class="ft-stat-line"><span>犯规</span><span class="v">${stats.foulsH} - ${stats.foulsA}</span></div><div class="ft-stat-line"><span>越位</span><span class="v">${stats.offsidesH || 0} - ${stats.offsidesA || 0}</span></div>`:'<div class="faint xsmall">本场没有详细数据。</div>'}</div></div></div>`:`<div class="tactic-note">比赛尚未进行。若这是你的球队，比赛日必须进入赛前部署完成比赛。</div>`}${opp?`<div class="hairline"></div><div class="flex between"><div class="small">对手近况</div><div>${formPills(currentFormFor(opp.id,5))}</div></div>`:''}`,
    actions: `<button class="btn ghost" data-action="close-modal">关闭</button>`, wide: true,
  });
}

/* -------------------------------------------------------------------------
   18. 转会市场页面
   ------------------------------------------------------------------------- */
function filterMarketPlayers(ids) {
  const f = UI.marketFilters;
  let arr = ids.map(id => player(id)).filter(Boolean).filter(canNegotiateForUser);
  if (f.q) { const q = f.q.toLowerCase(); arr = arr.filter(p => p.name.toLowerCase().includes(q) || p.nat.toLowerCase().includes(q) || p.natCode.toLowerCase().includes(q)); }
  if (f.pos && f.pos !== 'ALL') arr = arr.filter(p => p.pos === f.pos);
  if (f.maxPrice) arr = arr.filter(p => (p.clubId ? askingPriceFor(p) : 0) <= Number(f.maxPrice));
  if (f.minOvr) arr = arr.filter(p => p.ovr >= Number(f.minOvr));
  if (f.tier && f.tier !== 'ALL') arr = arr.filter(p => f.tier === 'FREE' ? !p.clubId : p.clubId && clubById(p.clubId)?.tier === Number(f.tier));
  if (f.loanOnly) arr = arr.filter(p => p.loanListed || isLoanAvailable(p));
  if (!transferWindowOpen()) arr = arr.filter(p => !p.clubId);
  return arr.sort((a,b) => b.ovr - a.ovr || b.potential - a.potential);
}
function renderTransfers() {
  const c = userClub();
  const ids = marketPlayerIds();
  const marketCount = ids.length;
  const list = filterMarketPlayers(ids);
  const incoming = (G.offers || []).filter(o => o.status === 'pending' && o.sellerClubId === c.id);
  const history = G.transferHistory.slice(0,8);
  const activeNego = (G.negotiations || []).filter(n => n.status === 'open' && n.buyerClubId === c.id);
  const expiring = squadPlayers(c).filter(p => p.contract <= 1);
  const tabs = [['market','转会市场'],['squad','我的球员'],['offers',`收到报价${incoming.length?` (${incoming.length})`:''}`]];
  let body = '';
  if (UI.marketTab === 'market') {
    body = `<div class="market-layout"><div class="card pad">
      <div class="flex between wrap gap10" style="margin-bottom:10px"><div><div class="kicker">Transfer Market</div><h2 style="font-size:18px">可谈判球员</h2></div><span class="xsmall faint">显示 ${list.length} / ${marketCount} 名球员</span></div>
      <div class="window-banner ${transferWindowOpen()?'':'closed'}"><span>${transferWindowOpen()?`转会窗开放中 · ${transferWindowLabel()}（第 ${G.season.week} 周）`:'转会窗已关闭。只可签下自由球员，其他俱乐部之间的转会谈判暂停。'}</span>${transferWindowOpen()?'<span class="tag green">OPEN</span>':'<span class="tag red">CLOSED</span>'}</div>
      <div class="market-filters"><label>搜索<input id="market-q" value="${esc(UI.marketFilters.q)}" placeholder="姓名或国籍"></label><label>位置<select id="market-pos"><option value="ALL">全部</option>${POSITIONS.map(p=>`<option value="${p}" ${UI.marketFilters.pos===p?'selected':''}>${POS_CN[p]}</option>`).join('')}</select></label><label>最高价格<input id="market-price" type="number" min="0" step="1000" value="${esc(UI.marketFilters.maxPrice)}" placeholder="不限"></label><label>最低能力<input id="market-ovr" type="number" min="0" max="100" value="${esc(UI.marketFilters.minOvr)}" placeholder="不限"></label><label>来源<select id="market-tier"><option value="ALL">全部</option><option value="FREE" ${UI.marketFilters.tier==='FREE'?'selected':''}>自由球员</option>${[1,2,3,4,5].map(t=>`<option value="${t}" ${UI.marketFilters.tier==t?'selected':''}>${TIER_NAME(t)}</option>`).join('')}</select></label><div class="flex gap6"><button class="btn primary" data-action="apply-market-filters">筛选</button><button class="btn ghost" data-action="reset-market-filters">重置</button></div></div>
      <div class="flex gap6" style="margin-bottom:10px"><button class="btn sm ${UI.marketFilters.loanOnly?'green':'ghost'}" data-action="toggle-loan-filter">${UI.marketFilters.loanOnly?'只看租借：开':'只看可租借'}</button><button class="btn sm ghost" data-action="update-interests">刷新市场关注</button></div>
      <div class="player-rows"><div class="player-row header"><span>球员</span><span>位置</span><span class="hide-sm">年龄 / 能力</span><span>合同</span><span class="hide-xs">身价</span><span style="text-align:right">要价 / 操作</span></div>${list.length?list.slice(0,140).map(p => { const club = p.clubId?clubById(p.clubId):null; const price = p.clubId?askingPriceFor(p):0; const loan = p.loanListed || isLoanAvailable(p); return `<div class="player-row"><div class="flex gap8" style="min-width:0">${playerLink(p,club||c,true)}${p.transferStatus==='listed'?'<span class="tag gold">挂牌</span>':''}${loan?'<span class="tag blue hide-sm">可租</span>':''}</div><div>${posTag(p.pos)}</div><div class="hide-sm"><div class="small">${p.age} 岁 · ${Math.round(p.fitness)} 体力</div><div class="flex gap6">${ovrSpan(p.ovr)}<span class="xsmall gold">潜 ${Math.round(p.potential)}</span></div></div><div><div class="small">${club?`${p.contract} 年`:'自由身'}</div><div class="xsmall faint">${club?esc(club.name):'无俱乐部'}</div></div><div class="hide-xs val">${club?fmtMoney(calcValue(p)):'—'}<div class="xsmall faint">${club?esc(club.short):''}</div></div><div style="text-align:right">${club?`<div class="val gold" style="margin-bottom:4px">${fmtMoney(price)}</div><div class="flex gap4" style="justify-content:flex-end"><button class="btn xs" data-action="open-player" data-id="${p.id}">详情</button><button class="btn xs primary" data-action="bid-player" data-id="${p.id}" ${transferWindowOpen()?'':'disabled'}>谈判</button>${loan?`<button class="btn xs ghost" data-action="loan-player" data-id="${p.id}" ${transferWindowOpen()?'':'disabled'}>租</button>`:''}</div>`:`<div class="val green">自由球员</div><div class="flex gap4" style="justify-content:flex-end"><button class="btn xs" data-action="open-player" data-id="${p.id}">详情</button><button class="btn xs primary" data-action="free-sign" data-id="${p.id}">签约</button></div>`}</div></div>`; }).join(''):'<div class="empty-state" style="margin-top:4px"><strong>没有符合条件的球员</strong>调整筛选条件，或等待转会窗口刷新。</div>'}</div>
    </div><div class="col gap16">
      <div class="card pad"><div class="section-title"><div><h2>转会预算</h2><div class="sub">现金与工资空间</div></div></div><div class="detail-list"><div class="dl-row"><span class="k">可动用现金</span><span class="v gold">${fmtMoney(c.cash)}</span></div><div class="dl-row"><span class="k">当前周薪</span><span class="v">${fmtMoney(clubWageBill(c))}</span></div><div class="dl-row"><span class="k">建议周薪上限</span><span class="v">${fmtMoney(c.wageBudget)}</span></div><div class="dl-row"><span class="k">阵容人数</span><span class="v ${c.squad.length>=SQUAD_LIMIT?'red':''}">${c.squad.length} / ${SQUAD_LIMIT}</span></div><div class="dl-row"><span class="k">合同最后一年</span><span class="v ${expiring.length?'red':''}">${expiring.length} 人</span></div></div><div class="tactic-note" style="margin-top:10px"><strong>提示：</strong>分期付款能降低首期压力，但会占用未来赛季的现金。不要让工资单超过比赛日收入。</div></div>
      <div class="card pad"><div class="section-title"><div><h2>进行中的谈判</h2><div class="sub">俱乐部或球员尚未签字</div></div></div>${activeNego.length?activeNego.map(n => { const p=player(n.playerId),s=clubById(n.sellerClubId); return `<div class="offer-card"><div class="offer-head"><div class="offer-title">${esc(p?.name||'球员')}</div><span class="tag gold">${n.stage==='club'?'俱乐部谈判':'个人合同'}</span></div><div class="offer-meta">${esc(s?.name||'自由球员')} · 第 ${n.rounds+1} 轮</div><button class="btn sm primary" data-action="open-negotiation" data-id="${n.id}" style="margin-top:8px">继续谈判</button></div>`; }).join(''):'<div class="empty-state" style="padding:18px"><strong>没有进行中的谈判</strong>从市场里选择一名球员开始。</div>'}</div>
      <div class="card pad"><div class="section-title"><div><h2>关注你的球员</h2><div class="sub">外部兴趣会随表现变化</div></div></div><div class="watch-list">${(c.interestedPlayers||[]).slice(0,5).map(x => { const p=player(x.playerId),club=clubById(x.clubId); return `<div class="watch-row">${clubCrestEl(club,'crest sm')}<div class="info"><div class="t">${esc(p?.name)}</div><div class="m">${esc(club?.name)} · 兴趣 ${Math.round(x.interest*100)}%</div></div></div>`; }).join('')||'<div class="xsmall faint">让小球队的球员在场上证明自己，外部兴趣会逐渐出现。</div>'}</div></div>
    </div></div>`;
  } else if (UI.marketTab === 'squad') {
    const squad = getUserSquadSorted();
    body = `<div class="card pad"><div class="flex between wrap gap10"><div><div class="kicker">My Players</div><h2 style="font-size:18px">球员出售与外租</h2><div class="xsmall faint">挂牌会提高其他俱乐部的兴趣。合同最后一年，对方可能压价。</div></div><div class="flex gap8"><span class="tag">${squad.length} 人</span><span class="tag ${transferWindowOpen()?'green':'red'}">${transferWindowLabel()}</span></div></div><div class="table-wrap" style="margin-top:12px"><table class="data-table"><thead><tr><th>球员</th><th>位置</th><th>能力</th><th>潜力</th><th>合同</th><th>身价</th><th>周薪</th><th>外部兴趣</th><th>状态</th><th style="text-align:right">操作</th></tr></thead><tbody>${squad.map(p => { const interest=(c.interestedPlayers||[]).find(x=>x.playerId===p.id); return `<tr><td class="name-col">${playerLink(p,c)}</td><td>${posTag(p.pos)}</td><td>${p.ovr}</td><td class="gold">${Math.round(p.potential)}</td><td>${p.contract} 年</td><td>${fmtMoney(calcValue(p))}</td><td>${fmtMoney(p.wage)}</td><td>${interest?`<span class="squad-interest">${Math.round(interest.interest*100)}%</span>`:'<span class="faint">—</span>'}</td><td>${p.transferStatus==='listed'?'<span class="tag gold">已挂牌</span>':p.transferStatus==='loan'?'<span class="tag blue">外租名单</span>':p.transferStatus==='requested'?'<span class="tag orange">申请离队</span>':'<span class="tag">非卖</span>'}</td><td class="actions-cell"><button class="btn xs ${p.transferStatus==='listed'?'green':''}" data-action="toggle-transfer" data-id="${p.id}" data-status="listed">${p.transferStatus==='listed'?'撤销挂牌':'挂牌'}</button> <button class="btn xs ghost" data-action="toggle-transfer" data-id="${p.id}" data-status="loan">${p.transferStatus==='loan'?'取消外租':'外租'}</button></td></tr>`; }).join('')}</tbody></table></div><p class="xsmall faint" style="margin-top:9px">只有在转会窗内才会收到正式的永久转会报价。外租可以节省部分工资，但球员在赛季结束后才会归队。</p></div>`;
  } else {
    const offers = (G.offers || []).filter(o => o.sellerClubId === c.id).sort((a,b)=>(b.status==='pending')-(a.status==='pending')||b.createdDay-a.createdDay);
    body = `<div class="card pad"><div class="flex between wrap gap10"><div><div class="kicker">Incoming Offers</div><h2 style="font-size:18px">收到的报价</h2><div class="xsmall faint">报价会在数天后过期。你还可以要求二次转会分成。</div></div><span class="tag ${incoming.length?'gold':''}">${incoming.length} 份待处理</span></div><div style="margin-top:12px">${offers.length?offers.map(o => { const p=player(o.playerId),buyer=clubById(o.buyerClubId); const expires=Math.max(0,o.expiresDay-G.meta.totalDays); return `<div class="offer-card ${o.status==='pending'?'unread':''}"><div class="offer-head"><div class="flex gap9">${shirtAvatar(p,c)}<div><div class="offer-title">${esc(p?.name||'球员')}</div><div class="offer-meta">${esc(buyer?.name||'')} · ${o.type==='loan'?'租借':'永久转会'} · ${o.status==='pending'?`剩余 ${expires} 天`:o.status==='accepted'?'已接受':o.status==='rejected'?'已拒绝':'已过期'}</div></div></div><div class="offer-money"><div class="v">${fmtMoney(o.fee)}</div><div class="l">${o.installYears>1?`分 ${o.installYears} 年`:'一次性'}</div></div></div>${o.status==='pending'?`<div class="flex gap6" style="justify-content:flex-end"><button class="btn xs ghost" data-action="reject-offer" data-id="${o.id}">拒绝</button><button class="btn xs ghost" data-action="open-incoming-offer" data-id="${o.id}">查看详情</button><button class="btn xs primary" data-action="accept-offer" data-id="${o.id}">接受</button></div>`:''}</div>`; }).join(''):'<div class="empty-state"><strong>还没有收到报价</strong>当你的球员表现出色，或者被挂牌时，其他俱乐部会主动联系你。</div>'}</div></div>`;
  }
  return `<div class="page-head"><div><div class="kicker">Transfer Centre</div><h1>转会市场</h1><div class="sub">钱不是万能的，但没有钱，连试训都办不了。商谈转会费、个人合同、分期与二次转会分成。</div></div><div class="flex gap8"><button class="btn ghost" data-action="update-interests">刷新关注</button>${incoming.length?`<button class="btn primary" data-action="market-tab" data-tab="offers">处理 ${incoming.length} 份报价</button>`:''}</div></div>
  <div class="market-tabs">${tabs.map(([k,n])=>`<button class="${UI.marketTab===k?'active':''}" data-action="market-tab" data-tab="${k}">${n}</button>`).join('')}</div>${body}
  <div class="card pad" style="margin-top:16px"><div class="flex between wrap gap12"><div><div class="kicker">Transfer History</div><h3 style="font-size:16px;margin-top:2px">最近转会记录</h3></div><span class="tag">最近 ${history.length} 笔</span></div>${history.length?`<div class="table-wrap" style="margin-top:10px"><table class="data-table compact"><thead><tr><th>时间</th><th>球员</th><th>类型</th><th>对方俱乐部</th><th>金额</th><th>条款</th></tr></thead><tbody>${history.map(h=>`<tr><td>${h.season}季 · 第${Math.max(1,Math.ceil((h.day||0)/7))}周</td><td>${esc(h.playerName)}</td><td>${h.type==='buy'?'买入':h.type==='sale'?'卖出':h.type==='loan'?'租借':'自由签约'}</td><td>${esc(clubById(h.type==='buy'||h.type==='free'?h.fromClubId:h.toClubId)?.name||'—')}</td><td>${fmtMoney(h.fee)}</td><td>${h.installYears>1?`分${h.installYears}年`:''}${h.sellOn?` · 二转${h.sellOn}%`:''}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-state" style="margin-top:10px;padding:18px"><strong>暂无转会记录</strong></div>'}</div>`;
}
function coreAbilityRowsHtml(p) {
  const rows = [
    ['射门', p.attrs.sho], ['力量', p.attrs.str], ['速度', p.attrs.spd], ['运球', p.attrs.dri],
    ['传球', p.attrs.pas], ['防守', p.attrs.def], ['守门', p.attrs.gk], ['耐力', p.attrs.sta],
    ['身体素质', p.attrs.phy], ['士气', p.morale],
  ];
  return rows.map(([label, raw]) => {
    const v = clamp(Math.round(raw || 0), 0, 100);
    return `<div class="attr-row"><span class="ak">${label}</span><span class="bar ${v >= 70 ? 'gold' : v < 40 ? 'red' : ''}"><i style="width:${v}%"></i></span><span class="av">${v}</span></div>`;
  }).join('');
}
function extraAbilityRowsHtml(p) {
  return [['抢断', p.attrs.tac], ['视野', p.attrs.vis]].map(([label, raw]) => {
    const v = clamp(Math.round(raw || 0), 0, 100);
    return `<div class="attr-row"><span class="ak">${label}</span><span class="bar ${v >= 70 ? 'gold' : v < 40 ? 'red' : ''}"><i style="width:${v}%"></i></span><span class="av">${v}</span></div>`;
  }).join('');
}
function openSetupPlayerDetail(playerId) {
  const p = SETUP?.world?.players?.[playerId];
  if (!p) return;
  openModal({
    kicker: 'Player Report', title: p.name,
    body: `<div class="player-hero"><div class="player-big-shirt">${POS_CN[p.pos]}</div><div><div class="player-hero-name">${esc(p.name)}</div><div class="player-hero-meta">${p.age} 岁 · ${POS_CN[p.pos]} · ${esc(p.nat)} · ${p.height}cm</div><div class="player-hero-badges">${posTag(p.pos)}<span class="tag">能力 ${p.ovr}</span><span class="tag gold">潜力 ${Math.round(p.potential)}</span><span class="tag">${esc(p.personality?.name || '职业')}</span></div></div><div class="ovr-hero"><div class="v">${p.ovr}</div><div class="k">综合能力</div></div></div><div class="stat-block-title">能力数值（1–100）</div><div class="attr-grid">${coreAbilityRowsHtml(p)}</div><div class="stat-block-title" style="margin-top:10px">其他属性</div><div class="attr-grid">${extraAbilityRowsHtml(p)}</div><p class="xsmall faint" style="margin-top:10px">签约费 ${fmtMoney(onboardingFee(p))} · 周薪 ${fmtMoney(p.wage)} · 球风 ${esc(playStyleName(p))}</p>`,
    actions: `<button class="btn ghost" data-action="close-modal">关闭</button><button class="btn primary" data-action="setup-detail-select" data-id="${p.id}">${SETUP.selected.includes(p.id) ? '取消选择' : '选择该球员'}</button>`,
    wide: true,
  });
}
function openPlayerDetail(playerId) {
  const p = player(playerId);
  if (!p) return;
  const c = userClub(), club = p.clubId ? clubById(p.clubId) : null, own = p.clubId === c.id;
  const attrs = coreAbilityRowsHtml(p);
  const traits = (p.traits||[]).map(t=>`<span class="tag gold">${TRAITS[t]?.name||t}</span>`).join('') || '<span class="tag">无明显技术标签</span>';
  const stats = p.season || emptySeasonStats();
  const interest = (c.interestedPlayers||[]).find(x=>x.playerId===p.id);
  const hidden = p.hidden;
  openModal({
    kicker: own?'球队球员':p.clubId?'球探报告':'自由球员', title: p.name,
    body: `<div class="player-hero"><div class="player-big-shirt">${p.number || POS_CN[p.pos]}</div><div><div class="player-hero-name">${esc(p.name)} ${hidden?'<span class="tag gold">命运之子</span>':''}</div><div class="player-hero-meta">${p.age} 岁 · ${POS_CN[p.pos]} · ${esc(p.nat)} · ${p.foot}脚 · ${p.height}cm</div><div class="player-hero-badges">${posTag(p.pos)}<span class="tag">${own?'你的球队':esc(club?.name||'自由身')}</span>${own?squadRoleTag(p,c):''}${playerStatusTags(p)}${interest?`<span class="tag gold">外部兴趣 ${Math.round(interest.interest*100)}%</span>`:''}</div></div><div class="ovr-hero"><div class="v">${p.ovr}</div><div class="k">综合能力</div><div class="xsmall gold" style="margin-top:4px">潜力 ${Math.round(p.potential)}</div></div></div>
    ${hidden?`<div class="tactic-note" style="border-color:rgba(215,184,107,.4);margin-bottom:12px"><strong>球探密报：</strong>${esc(HIDDEN_PLAYERS.find(h=>h.key===p.hiddenKey)?.tagline||'这名球员身上有某种难以解释的东西。')}</div>`:''}
    <div class="detail-grid"><div><div class="stat-block-title">能力数值（1–100）</div><div class="attr-grid">${attrs}</div><div class="stat-block-title" style="margin-top:10px">其他属性</div><div class="attr-grid">${extraAbilityRowsHtml(p)}</div><div class="stat-block-title" style="margin-top:12px">技术特点</div><div class="trait-list">${traits}<span class="tag blue">${esc(playStyleName(p))}</span></div><div class="xsmall faint" style="margin-top:5px">${esc(PLAY_STYLES[playStyleOf(p)].desc)}</div><div class="stat-block-title" style="margin-top:12px">性格与合同</div><div class="detail-list"><div class="dl-row"><span class="k">性格</span><span class="v">${esc(p.personality?.name||'职业')}</span></div><div class="dl-row"><span class="k">球风</span><span class="v">${esc(playStyleName(p))} · ${esc(PLAY_STYLES[playStyleOf(p)].label)}</span></div><div class="dl-row"><span class="k">职业性</span><span class="v">${p.professionalism}</span></div><div class="dl-row"><span class="k">雄心</span><span class="v">${p.ambition}</span></div><div class="dl-row"><span class="k">忠诚</span><span class="v">${p.loyalty}</span></div><div class="dl-row"><span class="k">合同</span><span class="v ${p.contract<=1?'red':''}">${p.contract} 年</span></div><div class="dl-row"><span class="k">周薪</span><span class="v">${fmtWage(p.wage)}</span></div><div class="dl-row"><span class="k">身价</span><span class="v">${fmtMoney(calcValue(p))}</span></div></div></div>
    <div><div class="stat-block-title">身体状态</div><div class="detail-list"><div class="dl-row"><span class="k">体力</span><span class="v">${Math.round(p.fitness)} / 100 · ${fitnessInfo(p.fitness).label}</span></div><div class="dl-row"><span class="k">士气</span><span class="v">${Math.round(p.morale)} / 100 · ${moraleInfo(p.morale).label}</span></div><div class="dl-row"><span class="k">竞技状态</span><span class="v">${formInfo(p.form).label}</span></div><div class="dl-row"><span class="k">伤病</span><span class="v ${p.injuryDays?'red':''}">${p.injuryDays?`伤停 ${p.injuryDays} 天`:'健康'}</span></div><div class="dl-row"><span class="k">停赛</span><span class="v">${p.suspension?`${Math.ceil(p.suspension)} 场`:'无'}</span></div></div><div class="stat-block-title" style="margin-top:12px">赛季数据</div><div class="detail-list"><div class="dl-row"><span class="k">出场 / 首发</span><span class="v">${stats.apps} / ${stats.starts}</span></div><div class="dl-row"><span class="k">进球 / 助攻</span><span class="v">${stats.goals} / ${stats.assists}</span></div><div class="dl-row"><span class="k">平均评分</span><span class="v">${stats.ratings?fmtStat(stats.ratingSum/stats.ratings,2):'—'}</span></div><div class="dl-row"><span class="k">黄牌 / 红牌</span><span class="v">${stats.yellow} / ${stats.red}</span></div>${p.pos==='GK'?`<div class="dl-row"><span class="k">零封 / 扑救</span><span class="v">${stats.cleanSheets} / ${stats.saves}</span></div>`:''}<div class="dl-row"><span class="k">职业生涯</span><span class="v">${p.career?.apps||0} 场 · ${p.career?.goals||0} 球</span></div></div>${own?`<div class="stat-block-title" style="margin-top:12px">合同状态</div><div class="detail-list"><div class="dl-row"><span class="k">球队定位</span><span class="v">${p.promise==='star'?'核心':p.promise==='squad'?'替补':'轮换'}</span></div></div>`:''}</div></div>`,
    actions: own
      ? `<button class="btn ghost" data-action="close-modal">关闭</button><button class="btn ghost" data-action="set-captain" data-id="${p.id}">设为队长</button><button class="btn ghost" data-action="toggle-transfer" data-id="${p.id}" data-status="listed">${p.transferStatus==='listed'?'撤销挂牌':'挂牌出售'}</button><button class="btn primary" data-action="open-renewal" data-id="${p.id}">续约</button>`
      : p.clubId
        ? `<button class="btn ghost" data-action="close-modal">关闭</button>${isLoanAvailable(p)&&transferWindowOpen()?`<button class="btn ghost" data-action="loan-player" data-id="${p.id}">申请租借</button>`:''}<button class="btn primary" data-action="bid-player" data-id="${p.id}" ${transferWindowOpen()?'':'disabled'}>发起转会谈判</button>`
        : `<button class="btn ghost" data-action="close-modal">关闭</button><button class="btn primary" data-action="free-sign" data-id="${p.id}">与自由球员谈判</button>`,
    wide: true,
  });
}


/* -------------------------------------------------------------------------
   19. 青训与招募
   ------------------------------------------------------------------------- */
/* 青训隐藏天才：按每名球员独立判定，学院等级越高概率略增（1 级 0.24% → 5 级 0.40%）。
   抽卡、赛季青训和测试模式的概率模拟共用这一处公式。 */
const YOUTH_HIDDEN_BASE = .002;
const YOUTH_HIDDEN_PER_LEVEL = .0004;
function youthHiddenChance(level) {
  return YOUTH_HIDDEN_BASE + Math.max(1, Number(level) || 1) * YOUTH_HIDDEN_PER_LEVEL;
}
function renderYouth() {
  const c = userClub();
  const level = c.facility.youth;
  const prospects = (G.youthProspects || []).map(id => player(id)).filter(Boolean);
  const streetUsedToday = c.streetLastDay === G.meta.totalDays;
  const canPromote = Math.max(0, 3 - (G.youthPromotions || 0));
  return `<div class="page-head"><div><div class="kicker">Academy & Scouting</div><h1>青训与招募</h1><div class="sub">有些天才藏在球探的旧笔记本里，有些藏在城市边缘的水泥球场。你需要花时间，也需要运气。</div></div><div class="flex gap8"><span class="tag gold">青训等级 ${level}</span><span class="tag ${canPromote?'green':'red'}">本赛季可提拔 ${canPromote} 人</span></div></div>
  <div class="youth-grid"><div class="col gap16">
    <div class="card pad"><div class="section-title"><div><div class="kicker">Academy Prospects</div><h2 style="font-size:18px;margin-top:2px">青训营名单</h2><div class="sub">每个赛季末，青训营会根据设施等级产生 1–3 名年轻人。你最多可提拔 3 人进入一线队。</div></div><span class="tag">${prospects.length} 名待提拔</span></div>
      ${prospects.length?prospects.map(p => `<div class="prospect-card">${shirtAvatar(p,c)}<div class="prospect-main"><div class="prospect-name">${esc(p.name)} ${p.hidden?'<span class="tag gold">隐藏天才</span>':''}</div><div class="prospect-meta">${p.age} 岁 · ${POS_CN[p.pos]} · ${esc(p.nat)} · 当前能力 ${p.ovr}</div><div style="margin-top:4px">${(p.traits||[]).map(t=>`<span class="tag" style="font-size:9px">${TRAITS[t]?.name||t}</span>`).join('')||'<span class="xsmall faint">尚未形成技术标签</span>'}</div></div><div class="potential-range">${Math.round(p.potential)}<span>潜力</span></div><button class="btn sm primary" data-action="promote-prospect" data-id="${p.id}" ${canPromote<=0?'disabled':''}>提拔</button></div>`).join(''):`<div class="empty-state"><strong>青训营暂时空着</strong>赛季结束后，青训主管会根据学院等级提交一份新名单。升级青训设施能提高苗子的质量。</div>`}
      <div class="hairline"></div><div class="flex between wrap gap10"><div class="xsmall faint">提拔球员将获得 2 年青年合同，周薪较低，但会占用一线队名额。</div><button class="btn ghost sm" data-action="generate-youth-preview" ${prospects.length?'disabled':''}>提前评估青训（需支付评估费）</button></div>
    </div>
    <div class="card pad"><div class="section-title"><div><div class="kicker">Street Trials</div><h2 style="font-size:18px;margin-top:2px">民间招募</h2><div class="sub">在城市的野球场、工厂联赛和业余队里寻找被遗漏的人。</div></div><span class="tag ${streetUsedToday?'red':'green'}">${streetUsedToday?'今日已试训':'今日可试训'}</span></div>
      <div class="street-card"><div class="flex between gap12 wrap"><div><div class="label">试训费用</div><div class="num" style="font-size:23px;color:var(--gold-bright)">¥3,000</div><div class="xsmall muted">每次只能考察一名球员，每天一次。</div></div><button class="btn primary" data-action="street-recruit" ${streetUsedToday?'disabled':''}>开始街头试训</button></div><div class="rarity-note">绝大多数民间球员能力有限，甚至无法立足职业联赛。但其中<b>极低概率</b>会出现拥有惊人潜力的年轻人。坊间流传着五个名字——刘一、罗志弘、谭云开、谭科纬、胡钊豪——没有人知道他们是不是真的存在。<br><span class="faint">每名隐藏球员单次出现概率：0.05%（五人合计 0.25%）。</span></div></div>
      <div class="flex gap8 wrap" style="margin-top:12px"><span class="tag">低能力也可能高潜力</span><span class="tag">成长取决于训练与出场</span><span class="tag">性格会影响发展</span></div>
    </div>
    <div class="card pad"><div class="section-title"><div><h2 style="font-size:17px">青训设施</h2><div class="sub">更高级的学院需要更多维护费</div></div><button class="btn sm" data-action="open-facility" data-type="youth">升级学院</button></div><div class="flex between" style="align-items:center"><div class="academy-level"><div class="v">${level}</div><div class="u">/ 5 级</div></div><div class="flex gap4">${Array.from({length:5}).map((_,i)=>`<span style="width:22px;height:5px;border-radius:2px;background:${i<level?'var(--gold)':'rgba(255,255,255,.09)'}"></span>`).join('')}</div></div><div class="tactic-note" style="margin-top:10px"><strong>学院等级影响：</strong>赛季末青训人数、初始能力、潜力上限。等级越高，出现高潜力苗子的概率越大，但每级维护费会显著提高。</div></div>
  </div>
  <div class="col gap16"><div class="card pad"><div class="section-title"><div><h2>招募纪律</h2><div class="sub">一次签约不能解决所有问题</div></div></div><div class="tutorial-list"><div class="tutorial-item"><span class="ti">01</span><div><strong>潜力不是即战力</strong>低能力的年轻人需要训练和比赛时间。把 18 岁的潜力股直接放进首发，可能会输掉现在。</div></div><div class="tutorial-item"><span class="ti">02</span><div><strong>训练会消耗体力</strong>高强度训练提高成长概率，也增加伤病风险。赛季很漫长，轮换比一次训练更重要。</div></div><div class="tutorial-item"><span class="ti">03</span><div><strong>隐藏天才</strong>极低概率出现的命运之子，初始能力并不高，但潜力上限为 100。发现只是开始，培养才是答案。</div></div><div class="tutorial-item"><span class="ti">04</span><div><strong>合同与时间</strong>青训和民间球员的合同成本较低，但他们也会成长、要求更高的工资。提前续约，避免被人免费挖走。</div></div></div></div>
    <div class="card pad"><div class="section-title"><div><h2>球探网络</h2><div class="sub">本地与区域覆盖</div></div></div><div class="detail-list"><div class="dl-row"><span class="k">球探人数</span><span class="v">${Math.max(1,Math.round(level))} 人</span></div><div class="dl-row"><span class="k">覆盖范围</span><span class="v">${level>=4?'全国':level>=2?'区域':'本城'}</span></div><div class="dl-row"><span class="k">今日试训</span><span class="v">${streetUsedToday?'已完成':'尚未使用'}</span></div><div class="dl-row"><span class="k">下次青训评估</span><span class="v">赛季结束</span></div></div></div>
  </div></div>`;
}
function createHiddenPlayer(template) {
  if (G.players && Object.values(G.players).some(p => p.hiddenKey === template.key)) return null;
  const nat = NAT_BY_CODE[template.code];
  const p = makePlayer({
    name: template.name, nat, age: template.age, pos: template.pos, attrs: { ...template.attrs },
    potential: template.potential, traits: template.traits.slice(), hidden: true, hiddenKey: template.key,
    personality: { id: 'ambitious', name: '雄心' }, morale: 64, fitness: 96, clubId: null,
    contract: 0, wage: 0, growthBias: template.growthBias, loyalty: 72, ambition: 88,
    professionalism: 78, leadership: 55, transferStatus: 'free',
  });
  p.wage = calcWage(p.ovr, p.potential, p.age);
  p.season = emptySeasonStats();
  G.players[p.id] = p;
  return p;
}
const STREET_HIDDEN_CHANCE = .0005;
function rollStreetCandidate(opts = {}) {
  const c = userClub();
  const test = !!opts.test;
  c.hiddenSeen = c.hiddenSeen || [];
  let hiddenTemplate = null;
  for (const h of HIDDEN_PLAYERS) {
    if (!test && c.hiddenSeen.includes(h.key)) continue;
    if (chance(STREET_HIDDEN_CHANCE)) { hiddenTemplate = h; break; }
  }
  let candidate = null, isHidden = false;
  if (hiddenTemplate) {
    candidate = createHiddenPlayer(hiddenTemplate);
    if (candidate) {
      isHidden = true;
      if (!test) c.hiddenSeen.push(hiddenTemplate.key);
    }
  }
  if (!candidate) {
    const roll = rand();
    let quality, potential;
    const nat = pickNationality(.35);
    const age = randInt(16,27);
    // 街头试训的绝大多数人连城市联赛轮换都不够，稍微“能用”的已属少数
    if (roll < .90) { quality = normal(21,4.5); potential = Math.round(clamp(quality + randInt(3,12), 18, 45)); }
    else if (roll < .985) { quality = normal(28,4); potential = Math.round(clamp(quality + randInt(6,18), 32, 58)); }
    else if (roll < .998) { quality = normal(33,3.5); potential = Math.round(clamp(quality + randInt(12,24), 46, 70)); }
    else { quality = normal(37,3); potential = Math.round(clamp(quality + randInt(16,28), 58, 80)); }
    const pos = weightedPick(POSITIONS, p => ({ GK:3, CB:13, LB:8, RB:8, DM:6, CM:14, LM:5, RM:5, AM:6, LW:5, RW:5, ST:12, SS:3 }[p]));
    candidate = makePlayer({ nat, age, pos, quality: clamp(quality,14,48), potential, clubId: null, contract: 0, transferStatus: 'free', fitness: randInt(70,98), personality: pickPersonality(), foreignBias: .25 });
    // 普通民间球探结果不设“隐藏外挂”，即使万里挑一也不该直接送你一名城市联赛巨星
    for (let capStep = 0; capStep < 3 && candidate.ovr > 41; capStep++) {
      const factor = 41 / candidate.ovr;
      for (const k of ATTR_KEYS) candidate.attrs[k] = clampRound(candidate.attrs[k] * factor, 5, 96);
      candidate.ovr = calcOvr(candidate.attrs, candidate.pos);
    }
    candidate.wage = Math.round(calcWage(candidate.ovr,candidate.potential,candidate.age)*.82/50)*50;
    G.players[candidate.id] = candidate;
  }
  return { candidate, isHidden };
}
function streetRecruit() {
  const c = userClub();
  if (!c) return;
  if (c.streetLastDay === G.meta.totalDays) return toast('今天已经试训过', '球探需要一天时间整理报告。', 'bad');
  if (c.cash < 3000) return toast('资金不足', '试训费用为 ¥3,000。', 'bad');
  c.streetLastDay = G.meta.totalDays;
  addLedger(-3000, '街头试训费用', '球探差旅与场地费用', 'scouting');
  const { candidate, isHidden } = rollStreetCandidate();
  G.freeAgents.push(candidate.id);
  if (isHidden) addNews('无法解释的试训报告', `球探在城市边缘的球场上发现了一个名叫 ${candidate.name} 的年轻人。报告里只有一句话：不要让别人先签下他。`, 'youth');
  const fee = isHidden ? 5000 : Math.max(500, Math.round(calcValue(candidate)*.06/500)*500);
  const attributes = ATTRIBUTES.map(a => `<div class="attr-row"><span class="ak">${a.label}</span><span class="bar ${candidate.attrs[a.key]>=65?'gold':''}"><i style="width:${candidate.attrs[a.key]}%"></i></span><span class="av">${candidate.attrs[a.key]}</span></div>`).join('');
  openModal({
    kicker: isHidden?'命运之子 · 极低概率事件':'街头试训报告', title: isHidden?`你找到了 ${candidate.name}`:`试训者：${candidate.name}`,
    body: `<div class="player-hero"><div class="player-big-shirt">${POS_CN[candidate.pos]}</div><div><div class="player-hero-name">${esc(candidate.name)} ${isHidden?'<span class="tag gold">隐藏天才</span>':''}</div><div class="player-hero-meta">${candidate.age} 岁 · ${POS_CN[candidate.pos]} · ${esc(candidate.nat)} · ${candidate.height}cm · ${candidate.foot}脚</div><div class="player-hero-badges">${posTag(candidate.pos)}<span class="tag">能力 ${candidate.ovr}</span><span class="tag ${isHidden?'gold':''}">潜力 ${Math.round(candidate.potential)}</span><span class="tag">${esc(candidate.personality?.name||'职业')}</span></div></div><div class="ovr-hero"><div class="v">${candidate.ovr}</div><div class="k">当前能力</div></div></div>
    ${isHidden?`<div class="tactic-note" style="border-color:rgba(215,184,107,.45);background:rgba(215,184,107,.08);margin-bottom:12px"><strong>球探手记：</strong>${esc(HIDDEN_PLAYERS.find(h=>h.key===candidate.hiddenKey)?.tagline)}<br>他的当前能力并不起眼，但潜力上限为 <b>100</b>。如果给予足够的时间和正确的训练，他可能成为这支球队的传奇。</div>`:`<div class="tactic-note" style="margin-bottom:12px"><strong>球探评价：</strong>${candidate.potential-candidate.ovr>=20?'技术粗糙，但身体条件与成长空间值得关注。':candidate.ovr>=42?'比预想中成熟，能够立刻参与轮换。':'能力普通，需要长期训练才可能进入一线队。'}</div>`}
    <div class="detail-grid"><div><div class="stat-block-title">能力属性</div><div class="attr-grid">${attributes}</div></div><div><div class="stat-block-title">签约条件</div><div class="detail-list"><div class="dl-row"><span class="k">签约费</span><span class="v gold">${fmtMoney(fee)}</span></div><div class="dl-row"><span class="k">期望周薪</span><span class="v">${fmtWage(candidate.wage)}</span></div><div class="dl-row"><span class="k">合同年限</span><span class="v">3 年</span></div><div class="dl-row"><span class="k">位置</span><span class="v">${POS_CN[candidate.pos]}</span></div><div class="dl-row"><span class="k">性格</span><span class="v">${esc(candidate.personality?.name)}</span></div></div><div class="stat-block-title" style="margin-top:10px">技术标签</div><div class="trait-list">${(candidate.traits||[]).map(t=>`<span class="tag gold">${TRAITS[t]?.name||t}</span>`).join('')||'<span class="tag">无</span>'}</div></div></div>`,
    actions: `<button class="btn ghost" data-action="close-modal">先不签约</button><button class="btn primary" data-action="sign-street" data-id="${candidate.id}" data-fee="${fee}">签下他 · ${fmtMoney(fee)}</button>`, wide: true,
  });
  saveGame(); renderApp();
}
function signStreetCandidate(id, fee) {
  const p = player(id), c = userClub();
  if (!p || !c) return;
  if (c.squad.length >= SQUAD_LIMIT) return toast('阵容已满', '无法签下更多球员。', 'bad');
  if (c.cash < fee) return toast('资金不足', `需要 ${fmtMoney(fee)}。`, 'bad');
  addLedger(-fee, `${p.name} 签约费`, '街头试训签约', 'transfer');
  p.clubId = c.id; p.contract = 3; p.transferStatus = 'none'; p.joinedSeason = G.season.number; p.testStreet = false;
  p.wage = p.wage || calcWage(p.ovr,p.potential,p.age);
  c.squad.push(p.id); assignSquadNumber(p,c);
  G.freeAgents = G.freeAgents.filter(x => x !== p.id);
  c.bench = bestBenchIds(c, BENCH_SIZE);
  addNews('民间签约', `${p.name} 与俱乐部签下 3 年合同。${p.hidden?'球探相信这不是一次普通的签约。':''}`, 'youth');
  closeModal(); saveGame(); renderApp();
  toast('签约完成', `${p.name} 加入了球队。`, 'good');
}
function promoteProspect(playerId) {
  const c = userClub(), p = player(playerId);
  if (!p || !c) return;
  if (!(G.youthProspects||[]).includes(p.id)) return;
  if ((G.youthPromotions||0) >= 3) return toast('提拔名额已用完', '每个赛季最多提拔 3 名青训球员。', 'bad');
  if (c.squad.length >= SQUAD_LIMIT) return toast('阵容已满', '请先清理一线队名额。', 'bad');
  c.squad.push(p.id); p.clubId = c.id; p.youth = false; p.contract = 2; p.testPull = false;
  p.wage = Math.max(300, Math.round(calcWage(p.ovr,p.potential,p.age)*.8/50)*50);
  p.joinedSeason = G.season.number; p.transferStatus = 'none'; assignSquadNumber(p,c);
  G.youthProspects = (G.youthProspects||[]).filter(x => x !== p.id);
  G.youthPromotions = (G.youthPromotions||0) + 1;
  c.bench = bestBenchIds(c, BENCH_SIZE);
  addNews('青训提拔', `${p.name} 从青训营升入一线队。${p.potential>=80?'青训主管认为他可能是这一代最好的产品。':'他需要时间适应职业比赛。'}`, 'youth');
  saveGame(); renderApp();
  toast('提拔完成', `${p.name} 进入了一线队。`, 'good');
}
function generateYouthPreview() {
  const c = userClub();
  if (!c) return;
  if ((G.youthProspects||[]).length) return;
  const cost = 30000 + c.facility.youth * 10000;
  if (c.cash < cost) return toast('资金不足', `提前评估需要 ${fmtMoney(cost)}。`, 'bad');
  addLedger(-cost, '青训提前评估费用', '球探与青训教练加班评估', 'scouting');
  generateYouthIntake(true);
  saveGame(); renderApp();
  toast('评估完成', '青训主管提交了新的名单。', 'good');
}
/* 抽取一名青训苗子的原始结果（不创建球员对象；供十连抽的纯统计模拟复用）。
   注意：随机数调用顺序必须与旧版 generateYouthIntake 保持一致，避免改变存档的 RNG 轨迹。 */
function rollYouthProspect(level) {
  const age = randInt(16,18);
  const pos = weightedPick(POSITIONS, p => ({ GK:4, CB:15, LB:8, RB:8, DM:7, CM:14, LM:5, RM:5, AM:6, LW:5, RW:5, ST:12, SS:6 }[p]));
  const quality = normal(19 + level * 3.2, 4.5);
  const hidden = chance(youthHiddenChance(level));
  const potential = hidden ? clamp(randInt(96,100), 90, 100) : chance(.03 + level*.012) ? clamp(round(68 + level*4 + normal(0,5)), 60, 96) : clamp(round(42 + level*5 + normal(0,7)), 35, 82);
  return { age, pos, quality, hidden, potential };
}
function buildYouthProspect(roll, level) {
  const nat = pickNationality(.18);
  const p = makePlayer({ nat, age: roll.age, pos: roll.pos, quality: clamp(roll.quality,12,48), potential: roll.potential, hidden: !!roll.hidden, youth: true, clubId: null, contract: 0, transferStatus: 'free', wage: 0, personality: pickPersonality(), foreignBias: .22 });
  p.wage = Math.max(280, Math.round(calcWage(p.ovr,p.potential,p.age)*.75/50)*50);
  p.homegrown = true; p.season = emptySeasonStats();
  return p;
}
function generateYouthIntake(force = false) {
  const c = userClub();
  if (!c) return;
  const level = c.facility.youth || 1;
  const count = randInt(1,3);
  const newIds = [];
  for (let i = 0; i < count; i++) {
    const p = buildYouthProspect(rollYouthProspect(level), level);
    G.players[p.id] = p; newIds.push(p.id);
  }
  G.youthProspects = [...newIds, ...(G.youthProspects||[])].slice(0,8);
  addNews('青训营新名单', `青训主管提交了 ${newIds.length} 名年轻球员的报告。前往青训页面查看并决定是否提拔。`, 'youth');
  if (!force) G.youthIntakeCount = (G.youthIntakeCount||0) + 1;
}

/* -------------------------------------------------------------------------
   20. 财政中心
   ------------------------------------------------------------------------- */
function renderFinance() {
  const c = userClub();
  const proj = calculateWeeklyProjection();
  const credit = bankCreditLimit(c);
  const activeSp = activeSponsor();
  const offers = c.sponsorOffers || [];
  const construction = c.construction || [];
  const ledger = c.ledger || [];
  const activeTab = UI.financesTab || 'overview';
  const filteredLedger = ledger.filter(x => activeTab === 'overview' ? true : activeTab === 'in' ? x.amount > 0 : x.amount < 0).slice(0,45);
  return `<div class="page-head"><div><div class="kicker">Finance & Operations</div><h1>财政中心</h1><div class="sub">每周支付工资，每个主场获得门票收入。盲目扩张会把俱乐部拖进破产边缘。</div></div><div class="flex gap8"><span class="tag ${c.cash<0?'red':'green'}">现金 ${fmtMoney(c.cash)}</span><span class="tag ${G.finance.negativeWeeks?'red':'gold'}">连续负现金 ${G.finance.negativeWeeks||0} 周</span></div></div>
  <div class="finance-cards"><div class="fin-card ${c.cash<0?'warn':'good'}"><div class="k">现金余额</div><div class="v ${c.cash<0?'red':''}">${fmtMoney(c.cash)}</div><div class="d">可用流动资产 · 欠薪 ${fmtMoney(Math.max(0,G.finance.wageArrears||0))}</div></div><div class="fin-card ${proj.net<0?'warn':'good'}"><div class="k">本周预计结余</div><div class="v ${proj.net<0?'red':'green'}">${fmtMoney(proj.net,{plus:true})}</div><div class="d">不含门票和比赛奖金</div></div><div class="fin-card"><div class="k">工资 / 周</div><div class="v">${fmtMoney(clubWageBill(c))}</div><div class="d">建议上限 ${fmtMoney(c.wageBudget)}</div></div><div class="fin-card ${c.bankLoan>0?'warn':''}"><div class="k">银行贷款</div><div class="v">${fmtMoney(c.bankLoan||0)}</div><div class="d">信用额度 ${fmtMoney(credit)} · 周息 0.9%</div></div></div>
  ${G.finance.negativeWeeks>=2?`<div class="card tight flex between" style="border-color:rgba(221,119,109,.35);background:rgba(221,119,109,.06);margin-bottom:14px"><div class="flex gap10"><span class="tag red">警告</span><div><div class="small" style="font-weight:600">俱乐部已连续 ${G.finance.negativeWeeks} 周现金为负</div><div class="xsmall muted">球员士气正在下降。连续六周无法改善将面临破产清算。</div></div></div><button class="btn sm danger" data-action="open-loan-modal">申请贷款</button></div>`:''}
  <div class="fin-layout"><div class="col gap16">
    <div class="card pad"><div class="section-title"><div><h2>本周现金流</h2><div class="sub">工资、转播、赞助与设施维护</div></div><span class="tag">包含所有固定收支</span></div><div class="flex between wrap gap10" style="margin-bottom:8px"><div><div class="label">预计净额</div><div class="num" style="font-size:26px;color:${proj.net<0?'var(--red)':'var(--green)'}">${fmtMoney(proj.net,{plus:true})}</div></div><div class="tr xsmall muted">收入 ${fmtMoney(proj.income)} · 支出 ${fmtMoney(proj.expense)}<br>主场门票另计</div></div><div class="project-item"><span>联赛转播分成</span><span class="v green">+${fmtMoney(proj.tv)}</span></div><div class="project-item"><span>主赞助商周付</span><span class="v green">+${fmtMoney(proj.sponsor)}</span></div><div class="project-item"><span>商品与会员收入</span><span class="v green">+${fmtMoney(proj.merch)}</span></div><div class="project-item"><span>球员周薪</span><span class="v red">-${fmtMoney(proj.wages)}</span></div><div class="project-item"><span>设施维护与场地</span><span class="v red">-${fmtMoney(proj.facility)}</span></div><div class="project-item"><span>银行贷款利息</span><span class="v red">-${fmtMoney(proj.interest)}</span></div><div class="project-item"><span>转会分期（赛季切换时结算）</span><span class="v red">-${fmtMoney(proj.annualPay||0)}</span></div><div class="hairline"></div><div class="flex between small"><span class="muted">门票收入（每个主场）</span><span class="gold">预计 ${fmtMoney(matchdayIncome(c,null).total)}</span></div><p class="xsmall faint" style="margin-top:6px">门票预计按当前上座率与票价估算。战绩、对手和票价都会影响上座人数。</p></div>
    <div class="card pad"><div class="section-title"><div><h2>收支记录</h2><div class="sub">按时间倒序</div></div><div class="ledger-tabs"><button class="btn xs ${activeTab==='overview'?'primary':'ghost'}" data-action="finance-tab" data-tab="overview">全部</button><button class="btn xs ${activeTab==='in'?'primary':'ghost'}" data-action="finance-tab" data-tab="in">收入</button><button class="btn xs ${activeTab==='out'?'primary':'ghost'}" data-action="finance-tab" data-tab="out">支出</button></div></div><div class="table-wrap" style="border:0"><div class="ledger">${filteredLedger.length?filteredLedger.map(x=>`<div class="ledger-row"><div class="date">${x.season}季<br>W${x.week||'?'}</div><div class="desc"><strong>${esc(x.title)}</strong><span>${esc(x.note||'')}</span></div><div class="amt ${x.amount>=0?'in':'out'}">${x.amount>=0?'+':''}${fmtMoney(x.amount)}</div></div>`).join(''):'<div class="empty-state">还没有收支记录。</div>'}</div></div></div>
    <div class="card pad" id="facilities"><div class="section-title"><div><h2>球场与设施</h2><div class="sub">扩建和维护需要时间，也会改变长期成本</div></div><span class="tag">${TIER_NAME(c.tier)}</span></div>${construction.length?`<div class="tactic-note" style="border-color:rgba(215,184,107,.28);margin-bottom:10px"><strong>施工中：</strong>${construction.map(x=>`${esc(x.label)}（剩余 ${x.remaining} 周）`).join('；')}</div>`:''}<div class="facility-card"><div class="facility-icon">ST</div><div class="facility-info"><div class="ft">${esc(c.stadium)} <span class="tag">${fmtPlain(c.capacity)} 座</span></div><div class="fd">球迷基础 ${fmtPlain(Math.round(c.fanbase))} 人 · 票价 ${fmtMoney(c.ticket)} · 平均上座 ${fmtPlain(estimatedAttendance(c,null))} 人</div><div class="flex gap6" style="margin-top:6px"><button class="btn xs" data-action="open-stadium-expansion">扩建看台</button><button class="btn xs ghost" data-action="open-ticket-price">调整票价</button></div></div></div><div class="facility-card"><div class="facility-icon">TR</div><div class="facility-info"><div class="ft">训练设施 <span class="tag">Lv.${c.facility.training}</span></div><div class="fd">提升训练成长概率。当前维护费已计入每周设施成本。</div><div class="pips">${Array.from({length:5}).map((_,i)=>`<i class="${i<c.facility.training?'on':''}"></i>`).join('')}</div><div style="margin-top:7px"><button class="btn xs" data-action="open-facility" data-type="training">升级训练设施</button></div></div></div><div class="facility-card"><div class="facility-icon">ME</div><div class="facility-info"><div class="ft">医疗中心 <span class="tag">Lv.${c.facility.medical}</span></div><div class="fd">降低受伤风险、加快每日体力恢复。更高等级也减少重伤概率。</div><div class="pips">${Array.from({length:5}).map((_,i)=>`<i class="${i<c.facility.medical?'on':''}"></i>`).join('')}</div><div style="margin-top:7px"><button class="btn xs" data-action="open-facility" data-type="medical">升级医疗中心</button></div></div></div><div class="facility-card"><div class="facility-icon">YG</div><div class="facility-info"><div class="ft">青训学院 <span class="tag">Lv.${c.facility.youth}</span></div><div class="fd">影响每赛季青训苗子的质量与数量。升级费用较高，但可能带来长期回报。</div><div class="pips">${Array.from({length:5}).map((_,i)=>`<i class="${i<c.facility.youth?'on':''}"></i>`).join('')}</div><div style="margin-top:7px"><button class="btn xs" data-action="open-facility" data-type="youth">升级青训学院</button></div></div></div><div class="facility-card" style="border-color:${c.groundOwned?'rgba(120,201,158,.25)':'rgba(215,184,107,.2)'}"><div class="facility-icon">LD</div><div class="facility-info"><div class="ft">训练基地 ${c.groundOwned?'<span class="tag green">自有土地</span>':'<span class="tag orange">租赁</span>'}</div><div class="fd">${c.groundOwned?'土地已购入，免除场地租金，并略微提升训练效果。':'目前租赁场地，每周租金已计入设施维护费。购地可锁定长期成本，但需要一大笔现金。'}</div>${!c.groundOwned?'<div style="margin-top:7px"><button class="btn xs" data-action="buy-ground">购买训练基地土地</button></div>':''}</div></div></div>
  </div>
  <div class="col gap16"><div class="card pad"><div class="section-title"><div><h2>银行贷款</h2><div class="sub">及时雨，但利息会累积</div></div><span class="tag ${c.bankLoan?'orange':'green'}">${fmtMoney(c.bankLoan||0)}</span></div><div class="loan-meter"><i style="width:${clamp((c.bankLoan||0)/Math.max(1,credit)*100,0,100)}%"></i></div><div class="flex between xsmall muted"><span>已用 ${fmtMoney(c.bankLoan||0)}</span><span>额度 ${fmtMoney(credit)}</span></div><div class="btn-row" style="margin-top:10px"><button class="btn sm" data-action="open-loan-modal">申请贷款</button>${c.bankLoan>0?`<button class="btn sm ghost" data-action="open-repay-modal">提前还款</button>`:''}</div><p class="xsmall faint" style="margin-top:7px">贷款周息按未偿还本金计算。现金长期为负，董事会将介入。</p></div>
    <div class="card pad"><div class="section-title"><div><h2>主赞助商</h2><div class="sub">广告合作带来稳定的周收入</div></div></div>${activeSp?`<div class="sponsor-card active"><div class="flex between"><div class="sn">${esc(activeSp.name)}</div><span class="tag green">生效中</span></div><div class="sm">${esc(activeSp.sector)} · 第 ${activeSp.signedWeek} 周签约</div><div class="sv">${fmtMoney(activeSp.weekly)}<span style="font-size:9px;color:var(--faint);font-family:var(--sans)"> /周</span></div><div class="sd">合同至第 ${activeSp.endWeek} 周 · 目标：${esc(activeSp.objective?.label||'无')}${activeSp.objective?.bonus?` · 奖金 ${fmtMoney(activeSp.objective.bonus)}`:''}</div></div>`:`<div class="empty-state" style="padding:18px;margin-bottom:8px"><strong>暂无主赞助商</strong>签署一份合同，获得签字费与每周现金。</div>`}${offers.slice(0,3).map(o=>`<div class="sponsor-card"><div class="sn">${esc(o.name)} <span class="tag">${esc(o.sector)}</span></div><div class="sv">${fmtMoney(o.weekly)}<span style="font-size:9px;color:var(--faint);font-family:var(--sans)"> /周</span></div><div class="sd">签字费 ${fmtMoney(o.upfront)} · 至第 ${o.endWeek} 周<br>目标：${esc(o.objective?.label||'无')}${o.objective?.bonus?` · 奖金 ${fmtMoney(o.objective.bonus)}`:''}</div><button class="btn sm ${activeSp?'ghost':'primary'}" data-action="sign-sponsor" data-id="${o.id}" ${activeSp?'disabled':''} style="margin-top:8px">${activeSp?'已有赞助商':'签署合同'}</button></div>`).join('')||(activeSp?'':'<div class="xsmall faint">暂无新的赞助报价。</div>')}</div>
    <div class="card pad"><div class="section-title"><div><h2>应收账款</h2><div class="sub">未来转会收入</div></div></div><div class="detail-list"><div class="dl-row"><span class="k">分期应收</span><span class="v">${fmtMoney((c.receivable||[]).reduce((a,x)=>a+x.amount,0))}</span></div><div class="dl-row"><span class="k">分期应付</span><span class="v red">${fmtMoney((c.payable||[]).reduce((a,x)=>a+x.amount,0))}</span></div><div class="dl-row"><span class="k">二次转会应收</span><span class="v">${(c.sellOnReceivables||[]).length} 项</span></div><div class="dl-row"><span class="k">二次转会应付</span><span class="v">${(c.owedSellOns||[]).length} 项</span></div></div></div>
    <div class="card pad"><div class="section-title"><div><h2>工资管理</h2><div class="sub">更衣室对差距很敏感</div></div></div><div class="flex between small"><span class="muted">当前周薪</span><span>${fmtMoney(clubWageBill(c))}</span></div><div class="bar gold" style="margin-top:4px"><i style="width:${clamp(clubWageBill(c)/Math.max(1,c.wageBudget)*100,0,100)}%"></i></div><div class="flex between xsmall faint" style="margin-top:3px"><span>建议上限 ${fmtMoney(c.wageBudget)}</span><span>${clubWageBill(c)>c.wageBudget?'已超支':'可控'}</span></div><div class="btn-row" style="margin-top:10px"><button class="btn sm ghost" data-action="expand-wage-budget">申请提高预算</button><button class="btn sm ghost" data-action="nav" data-screen="transfers" data-tab="squad">清理阵容</button></div></div>
  </div></div>`;
}

/* -------------------------------------------------------------------------
   21. 俱乐部
   ------------------------------------------------------------------------- */
function clubMotto(c) {
  const tier = c.tier;
  if (tier === 1) return '站在最高处，风最大。所有人都在看着你如何守住这里。';
  if (tier === 2) return '离顶级联赛只差一个赛季。要么上去，要么继续等待。';
  if (tier === 3) return '职业足球的门槛近在眼前。每一场比赛都在改变俱乐部的命运。';
  if (tier === 4) return '从泥地到看台，这里的人懂得每一分钱的重量。';
  return '一支从城市边缘起步的球队。没有历史，正好可以亲手写下第一页。';
}
function renderClub() {
  const c = userClub();
  const honours = c.honours || [];
  const history = G.seasonHistory || [];
  const construction = c.construction || [];
  return `<div class="page-head"><div><div class="kicker">Club & Legacy</div><h1>俱乐部</h1><div class="sub">名字、颜色、球场、记忆。你正在建造的不只是一支球队。</div></div><div class="flex gap8"><button class="btn ghost" data-action="show-help">游戏指南</button><button class="btn primary" data-action="open-save-menu">存档与导出</button></div></div>
  <div class="club-hero"><div class="club-hero-inner">${clubCrestEl(c,'crest xl')}<div class="club-hero-info"><div class="kicker">${c.user?.founded||G.season.year-G.season.number+1} 年成立 · ${esc(c.city||'青岚')}</div><h2>${esc(c.name)}</h2><div class="meta"><span class="tag gold">${TIER_LABEL(c.tier)}</span><span class="tag">主教练 ${esc(managerName())}</span><span class="tag">${esc(c.stadium)}</span><span class="tag">${fmtPlain(c.capacity)} 座</span></div><p class="xsmall muted" style="margin-top:8px;max-width:520px">${clubMotto(c)}</p></div><div class="club-hero-stats"><div class="hero-stat"><div class="k">球迷基础</div><div class="v">${fmtPlain(Math.round(c.fanbase))}</div></div><div class="hero-stat"><div class="k">声望</div><div class="v">${c.reputation}</div></div><div class="hero-stat"><div class="k">董事会信任</div><div class="v">${G.board.confidence}</div></div><div class="hero-stat"><div class="k">现金</div><div class="v ${c.cash<0?'red':''}" style="font-size:16px">${fmtMoney(c.cash)}</div></div></div></div></div>
  <div class="dash-grid"><div class="dash-col">
    <div class="card pad"><div class="section-title"><div><h2>俱乐部身份</h2><div class="sub">队徽、球衣与主场都可以在这里更改</div></div><button class="btn sm" data-action="open-identity-editor">编辑外观</button></div><div class="kit-preview-row"><div align="center"><img src="${crestFor(c)}" alt="队徽" style="width:110px;height:122px;object-fit:contain"><div class="label" style="margin-top:4px">队徽</div></div><div align="center"><img src="${kitFor(c)}" alt="主场球衣" style="width:118px;height:130px;object-fit:contain"><div class="label" style="margin-top:4px">主场球衣</div></div><div style="flex:1;min-width:160px"><div class="detail-list"><div class="dl-row"><span class="k">主教练</span><span class="v">${esc(managerName())}</span></div><div class="dl-row"><span class="k">主场</span><span class="v">${esc(c.stadium)}</span></div><div class="dl-row"><span class="k">训练基地</span><span class="v">${c.groundOwned?'自有':'租赁'}</span></div><div class="dl-row"><span class="k">队长</span><span class="v">${esc(player(c.captainId)?.name||'未指定')}</span></div><div class="dl-row"><span class="k">阵容人数</span><span class="v">${squadPlayers(c).length} / ${SQUAD_LIMIT}</span></div></div></div></div></div>
    <div class="card pad"><div class="section-title"><div><h2>董事会</h2><div class="sub">成绩与财政决定你的位置</div></div><span class="tag ${G.board.confidence<35?'red':'gold'}">信任 ${G.board.confidence}/100</span></div><div class="bar ${G.board.confidence<35?'red':'gold'}" style="height:7px"><i style="width:${G.board.confidence}%"></i></div><div class="detail-list" style="margin-top:10px"><div class="dl-row"><span class="k">赛季目标</span><span class="v">${esc(G.board.goal)}</span></div><div class="dl-row"><span class="k">当前排名</span><span class="v">${userStanding()?.position||'—'} / 12</span></div><div class="dl-row"><span class="k">董事会评估</span><span class="v">${G.board.confidence>=70?'非常满意':G.board.confidence>=50?'保持耐心':G.board.confidence>=30?'需要改善':'失去耐心'}</span></div><div class="dl-row"><span class="k">财政状态</span><span class="v ${c.cash<0?'red':''}">${c.cash<0?'现金流告急':'正常'}</span></div></div><div class="tactic-note" style="margin-top:10px"><strong>提示：</strong>赛季结束时排名低于董事会目标过多，董事会信任会下降。信任过低时，董事会在新赛季会收紧工资与转会预算。</div></div>
    <div class="card pad"><div class="section-title"><div><h2>荣誉室</h2><div class="sub">所有的升级、冠军与记忆</div></div><span class="tag">${honours.length} 项</span></div>${honours.length?honours.slice().reverse().map(h=>`<div class="honour-row"><div class="honour-year">${h.season}</div><div class="honour-name">${esc(h.name)}</div><div class="honour-tier">${esc(h.tier||'')}</div></div>`).join(''):`<div class="empty-state"><strong>荣誉室空空如也</strong>升级、冠军和保级都会留下记录。你的第一段历史还在书写。</div>`}${history.length?`<div class="hairline"></div><div class="stat-block-title">最近赛季</div>${history.slice(0,4).map(h=>`<div class="flex between small" style="padding:4px 0"><span>${h.season}赛季 · ${TIER_NAME(h.tier)}</span><span class="num">第 ${h.position} 名 · ${h.points} 分</span></div>`).join('')}`:''}</div>
  </div>
  <div class="dash-col"><div class="card pad"><div class="section-title"><div><h2>设施与工程</h2><div class="sub">训练、医疗、青训与看台</div></div><button class="text-link" data-action="nav" data-screen="finance">前往财政</button></div>${construction.length?construction.map(x=>`<div class="flex between small" style="padding:7px 0;border-bottom:1px solid var(--line)"><span>${esc(x.label)}</span><span class="tag gold">${x.remaining} 周</span></div>`).join(''):'<p class="xsmall faint">目前没有在建工程。</p>'}<div class="hairline"></div><div class="detail-list"><div class="dl-row"><span class="k">训练设施</span><span class="v">Lv.${c.facility.training}</span></div><div class="dl-row"><span class="k">医疗中心</span><span class="v">Lv.${c.facility.medical}</span></div><div class="dl-row"><span class="k">青训学院</span><span class="v">Lv.${c.facility.youth}</span></div><div class="dl-row"><span class="k">看台容量</span><span class="v">${fmtPlain(c.capacity)}</span></div></div></div>
    <div class="card pad"><div class="section-title"><div><h2>队内档案</h2><div class="sub">更衣室与表现</div></div></div><div class="detail-list"><div class="dl-row"><span class="k">球队平均能力</span><span class="v">${Math.round(avg(squadPlayers(c).map(p=>p.ovr))||0)}</span></div><div class="dl-row"><span class="k">平均年龄</span><span class="v">${fmtStat(avg(squadPlayers(c).map(p=>p.age)),1)} 岁</span></div><div class="dl-row"><span class="k">平均体力</span><span class="v">${Math.round(avg(squadPlayers(c).map(p=>p.fitness))||0)}</span></div><div class="dl-row"><span class="k">平均士气</span><span class="v">${Math.round(avg(squadPlayers(c).map(p=>p.morale))||0)}</span></div><div class="dl-row"><span class="k">周薪总额</span><span class="v">${fmtMoney(clubWageBill(c))}</span></div><div class="dl-row"><span class="k">阵容价值</span><span class="v">${fmtMoney(clubSquadValue(c))}</span></div></div></div>
    <div class="card pad"><div class="section-title"><div><h2>存档与设置</h2><div class="sub">导出加密存档，随时继续</div></div></div><div class="btn-row"><button class="btn primary" data-action="export-save">导出加密存档</button><button class="btn" data-action="open-import-save">导入存档</button></div><div class="btn-row" style="margin-top:8px"><button class="btn ghost" data-action="show-help">游戏指南</button><button class="btn ghost" data-action="open-save-menu">存档管理</button></div><p class="xsmall faint" style="margin-top:10px">游戏会自动保存在本浏览器。导出的 <span class="gold">.gdsave</span> 文件使用 AES-256-GCM 加密，需要密码才能导入。所有随机事件、赛程、对手阵容和谈判状态都会写入存档。</p></div>
    <div class="card tight"><div class="flex between"><span class="xsmall faint">绿茵王朝 v${APP_VERSION}</span><span class="xsmall faint">离线单文件版</span></div><div class="xsmall faint" style="margin-top:3px">所有人物、俱乐部与赛事均为虚构，不构成任何现实影射。</div></div>
  </div></div>`;
}


/* -------------------------------------------------------------------------
   22. 模态框、教程与消息
   ------------------------------------------------------------------------- */
function openModal(opts = {}) {
  const root = $('#modal-root');
  if (!root) return;
  UI.modal = opts;
  const cls = opts.wide ? 'wide' : opts.narrow ? 'narrow' : '';
  const footer = opts.actions !== undefined ? `<div class="modal-foot ${opts.footerBetween ? 'between' : ''}">${opts.actions}</div>` : '';
  root.innerHTML = `<div class="modal-backdrop" data-action="backdrop-close">
    <div class="modal ${cls}" role="dialog" aria-modal="true">
      <div class="modal-head"><div><div class="kicker">${esc(opts.kicker || '')}</div><h3>${esc(opts.title || '')}</h3></div>${opts.closable === false ? '' : '<button class="modal-close" data-action="close-modal" aria-label="关闭">×</button>'}</div>
      <div class="modal-body">${opts.body || ''}</div>
      ${footer}
    </div>
  </div>`;
  const firstInput = root.querySelector('input, select');
  if (firstInput) setTimeout(() => { try { firstInput.focus(); } catch {} }, 80);
}
function closeModal() {
  const root = $('#modal-root');
  if (root) root.innerHTML = '';
  UI.modal = null;
}
function showInbox() {
  markAllNewsRead();
  const news = G.news.slice(0, 40);
  openModal({
    kicker: 'Inbox', title: '俱乐部消息',
    body: news.length ? `<div class="news-list">${news.map(n => `<div class="news-item"><div class="news-date">W${n.week}<br>${newsTag(n.type)}</div><div class="news-main"><div class="news-title">${esc(n.title)}</div><div class="news-body">${esc(n.body)}</div></div></div>`).join('')}</div>` : '<div class="empty-state"><strong>收件箱为空</strong>消息会在赛季推进时出现。</div>',
    actions: `<button class="btn ghost" data-action="close-modal">关闭</button>`, wide: true,
  });
  renderApp();
}
function showTutorial(firstTime = false) {
  const body = `<div class="setup-body" style="padding:0"><div class="kicker">经理手册</div><h2 style="font-size:23px;margin-top:3px">你只需要做决定，不需要控制球员。</h2><p class="lead" style="margin-top:5px">比赛会自动进行。你可以在赛前安排阵容与战术，在比赛中暂停换人、调整风格。90 分钟的比赛压缩为约 3 分钟。</p>
    <div class="tutorial-list" style="margin-top:18px">
      <div class="tutorial-item"><span class="ti">01</span><div><strong>每天：训练与恢复</strong>工作日可以训练。训练会消耗体力、极低概率提升能力；周末比赛才是真正的考验。球员不会在每场比赛前自动恢复满体力。</div></div>
      <div class="tutorial-item"><span class="ti">02</span><div><strong>每周：工资与门票</strong>周一结算工资、赞助与设施维护，主场门票收入在比赛后到账。长期负现金会欠薪，最终破产。你可以贷款，但利息会累积。</div></div>
      <div class="tutorial-item"><span class="ti">03</span><div><strong>比赛：战术克制与运气</strong>进攻/防守风格和节奏会互相克制。实力更强不代表稳赢；门将神扑、红牌、伤停补时绝杀都会发生。保持冷静。</div></div>
      <div class="tutorial-item"><span class="ti">04</span><div><strong>长期：潜力与合同</strong>低能力球员也可能有高潜力。训练、出场时间和设施决定成长。合同最后一年会被低价挖角，赛季结束自由身离队。</div></div>
      <div class="tutorial-item"><span class="ti">05</span><div><strong>转会：先谈判，再签字</strong>买入需要先与俱乐部谈妥转会费，再与球员谈个人合同。分期、二次转会分成、租借都可以使用。卖出时也可以还价。</div></div>
    </div>
    <div class="tactic-note" style="margin-top:14px"><strong>当前目标：</strong>${esc(G.board.goal || '先在城市联赛站稳脚跟')}。如果不知道下一步做什么，回到主页，按“今日事务”的提示推进。</div></div>`;
  openModal({
    kicker: firstTime ? '欢迎来到俱乐部' : '游戏指南', title: firstTime ? '从这里开始' : '绿茵王朝 · 经理手册',
    body, actions: `<button class="btn primary" data-action="close-modal">开始工作</button>`, wide: true,
  });
  if (firstTime) G.meta.tutorialSeen = true;
}
function showHelp() {
  openModal({
    kicker: 'Manual', title: '游戏机制速查',
    body: `<div class="detail-grid">
      <div><div class="stat-block-title">比赛</div><div class="tutorial-list">
        <div class="tutorial-item"><span class="ti">90′</span><div><strong>时长与操作</strong>约 3 分钟实时进行 + 中场暂停。可暂停、换人、调整战术，也可以冒险让助教跳过。最多 5 次换人。</div></div>
        <div class="tutorial-item"><span class="ti">XI</span><div><strong>首发要求</strong>必须 11 人、至少 1 名门将，替补席建议 5 人以上。伤停球员不能出场。</div></div>
        <div class="tutorial-item"><span class="ti">TK</span><div><strong>战术克制</strong>反击克制高位逼抢，边路传中克制低位防守，控球怕逼抢。高节奏增加机会和体力消耗。</div></div>
      </div></div>
      <div><div class="stat-block-title">经营</div><div class="tutorial-list">
        <div class="tutorial-item"><span class="ti">¥</span><div><strong>财政</strong>每周发工资，主场比赛日有门票。扩建看台、升级设施有建设周期。连续 6 周现金为负且无法偿还可能破产。</div></div>
        <div class="tutorial-item"><span class="ti">CT</span><div><strong>合同</strong>合同剩余年数在赛季末减少。归零的球员自由离队。合同最后一年，卖价会被压低。</div></div>
        <div class="tutorial-item"><span class="ti">TR</span><div><strong>转会窗</strong>第 1–4 周与第 11–14 周开放。自由球员随时可签。买入分为俱乐部谈判和球员合同两步。</div></div>
      </div></div>
      <div><div class="stat-block-title">成长</div><div class="tutorial-list">
        <div class="tutorial-item"><span class="ti">PT</span><div><strong>潜力</strong>能力上限为 100。训练、出场、年龄和设施共同影响成长。潜力高的低能力球员值得长期投资。</div></div>
        <div class="tutorial-item"><span class="ti">FIT</span><div><strong>体力</strong>比赛消耗最大，训练日只恢复一部分。高强度训练和逼抢战术会让球员透支。合理轮换是长期取胜的关键。</div></div>
        <div class="tutorial-item"><span class="ti">??</span><div><strong>隐藏天才</strong>民间试训中，每名特定隐藏球员有 0.05% 的出现概率。青训营也极低概率产出隐藏天才。</div></div>
      </div></div>
      <div><div class="stat-block-title">联赛</div><div class="tutorial-list">
        <div class="tutorial-item"><span class="ti">12</span><div><strong>规模</strong>五级联赛，每级 12 队，22 轮主客场双循环。胜 3 分、平 1 分。</div></div>
        <div class="tutorial-item"><span class="ti">↑</span><div><strong>升降级</strong>前 2 名升级，末 2 名降级（城市联赛为底层，不降级）。同分依次比较净胜球、进球、胜场。</div></div>
        <div class="tutorial-item"><span class="ti">SAVE</span><div><strong>存档</strong>自动保存在本地。导出文件使用密码 + AES-256-GCM 加密，包含整个联赛世界、随机状态和谈判。</div></div>
      </div></div>
    </div>
    <div class="tactic-note" style="margin-top:14px"><strong>核心理念：</strong>能力决定下限，战术决定对位，体力决定后程，运气决定故事。不要只堆总评——工资、士气、合同与更衣室同样会毁掉一支球队。</div>`,
    actions: `<button class="btn primary" data-action="close-modal">明白了</button>`, wide: true,
  });
}
function openSaveMenu() {
  const c = userClub();
  const last = G.meta.lastAutosave ? new Date(G.meta.lastAutosave).toLocaleString('zh-CN') : '尚未保存';
  const testMode = !!G.meta.testMode;
  const yt = G.meta.youthTest;
  const ytPulls = Number(yt?.pulls) || 0;
  const ytHidden = Number(yt?.hidden) || 0;
  const youthTestLine = ytPulls ? `<div class="xsmall faint" style="margin-top:4px">青训十连抽累计：${ytPulls} 抽 · 隐藏 ${ytHidden} 人（${((ytHidden / ytPulls) * 100).toFixed(2)}%）</div>` : '';
  const st = G.meta.streetTest;
  const stPulls = Number(st?.pulls) || 0;
  const stHidden = Number(st?.hidden) || 0;
  const streetTestLine = stPulls ? `<div class="xsmall faint" style="margin-top:4px">街头十连抽累计：${stPulls} 抽 · 隐藏 ${stHidden} 人（${((stHidden / stPulls) * 100).toFixed(2)}%）</div>` : '';
  const testPanel = testMode ? `
    <div class="hairline"></div>
    <div class="flex between wrap gap8"><div class="stat-block-title" style="margin:0">测试工具</div><span class="tag gold">TEST MODE</span></div>
    <div class="tactic-note" style="margin-top:8px">测试模式已开启。以下操作会直接修改当前存档；调参后可先用“批量模拟 10 场”看数据。</div>
    <div class="btn-row" style="margin-top:10px">
      <button class="btn sm" data-action="test-add-cash">+¥1,000,000</button>
      <button class="btn sm" data-action="test-restore-fitness">恢复全队体力</button>
      <button class="btn sm" data-action="test-heal-all">清除伤病/停赛</button>
      <button class="btn sm" data-action="test-goto-matchday">跳到比赛日</button>
      <button class="btn sm" data-action="test-simulate-10">批量模拟 10 场</button>
      <button class="btn sm" data-action="test-youth-ten-pull">青训十连抽</button>
      <button class="btn sm" data-action="test-street-ten-pull">街头十连抽</button>
      <button class="btn sm ghost" data-action="open-draw-history">抽取记录</button>
      <button class="btn sm danger" data-action="reset-save-confirm">重置存档</button>
      <button class="btn sm ghost" data-action="test-exit">退出测试模式</button>
    </div>
    <div class="xsmall faint" style="margin-top:8px">种子 ${G.seed ?? '—'} · RNG ${G.rngState ?? '—'} · 第 ${G.season.week} 周 · 测试模式会写入本地存档。</div>
    ${youthTestLine}
    ${streetTestLine}
  ` : `
    <div class="hairline"></div>
    <div class="stat-block-title">设置代码</div>
    <div class="flex gap6">
      <input id="settings-code" style="flex:1;min-width:0" maxlength="40" autocomplete="off" placeholder="输入设置代码">
      <button class="btn sm" data-action="apply-settings-code" style="flex:0 0 auto">应用</button>
    </div>
    <div id="settings-code-status" class="xsmall faint" style="margin-top:6px">${_testCodeStreak ? `已连续正确 ${_testCodeStreak} / 3 次。` : '连续输入正确代码 3 次可进入测试模式。'}</div>
    <div class="hairline" style="margin-top:12px"></div>
    <div class="flex between wrap gap8"><span class="xsmall faint">清空本地存档并回到开始界面；导出的 .gdsave 不受影响。</span><button class="btn sm danger" data-action="reset-save-confirm">重置存档</button></div>
  `;
  openModal({
    kicker: 'Save & Data', title: '存档与设置',
    body: `<div class="detail-list"><div class="dl-row"><span class="k">俱乐部</span><span class="v">${esc(c.name)}</span></div><div class="dl-row"><span class="k">赛季进度</span><span class="v">${currentSeasonLabel()} · 第 ${G.season.week} 周</span></div><div class="dl-row"><span class="k">自动保存</span><span class="v">${esc(last)}</span></div><div class="dl-row"><span class="k">存档版本</span><span class="v">v${APP_VERSION}</span></div>${testMode ? '<div class="dl-row"><span class="k">测试模式</span><span class="v gold">已开启</span></div>' : ''}</div>
    <div class="tactic-note" style="margin-top:12px"><strong>导出加密存档</strong>会生成一个 <span class="gold">.gdsave</span> 文件。你需要设置密码；没有密码无法导入。密码不会保存在任何地方。</div>
    <div class="btn-row" style="margin-top:12px"><button class="btn primary" data-action="export-save">导出加密存档</button><button class="btn" data-action="open-import-save">导入存档</button><button class="btn ghost" data-action="open-friendly-mode">双存档友谊赛</button><button class="btn ghost" data-action="manual-save">立即保存</button></div>
    ${testPanel}
    <div class="hairline"></div><div class="flex between wrap gap8"><span class="xsmall faint">开始新的游戏会覆盖当前本地存档。</span><button class="btn sm ghost" data-action="new-game-confirm">新建俱乐部</button></div>`,
    actions: `<button class="btn ghost" data-action="close-modal">关闭</button>`, wide: true,
  });
}
function openExportDialog() {
  openModal({
    kicker: 'Encrypted Save', title: '导出加密存档',
    body: `<p class="small muted" style="line-height:1.7">存档包含整个联赛世界：所有俱乐部、球员、赛程、对手战术、转会报价、合同与随机数状态。文件使用 <strong class="gold">AES-256-GCM</strong> 加密，密钥由密码通过 PBKDF2-SHA256（210,000 次迭代）派生。</p><div class="hairline"></div><label class="field"><span>设置存档密码（至少 6 位）</span><input id="export-password" type="password" autocomplete="new-password" placeholder="请牢记，不会保存在游戏中"></label><label class="field"><span>再次输入密码</span><input id="export-password2" type="password" autocomplete="new-password"></label><p class="xsmall orange">忘记密码将无法恢复存档。</p>`,
    actions: `<button class="btn ghost" data-action="close-modal">取消</button><button class="btn primary" data-action="do-export-save">加密并下载</button>`, narrow: true,
  });
}
async function deriveSaveKey(password, salt, iterations = 210000) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function gzipBytes(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function gunzipBytes(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function doExportSave() {
  const pwd = $('#export-password')?.value || '';
  const pwd2 = $('#export-password2')?.value || '';
  if (pwd.length < 6) return toast('密码太短', '请设置至少 6 位密码。', 'bad');
  if (pwd !== pwd2) return toast('两次密码不一致', '请重新输入。', 'bad');
  if (!window.crypto?.subtle) return toast('浏览器不支持加密', '请使用最新版 Safari / Chrome / Edge / Firefox；iPadOS 若仍失败，请通过本地服务器打开。', 'bad');
  const btn = $('[data-action="do-export-save"]');
  if (btn) { btn.disabled = true; btn.textContent = '正在加密…'; }
  try {
    saveGame(true);
    const snapshot = { save: G, meta: { app: APP_VERSION, format: 'GDSAVE', season: G.season.label, club: userClub().name, manager: managerName(), exportedAt: nowISO() } };
    let bytes = new TextEncoder().encode(JSON.stringify(snapshot));
    let compressed = false;
    if ('CompressionStream' in window) { try { bytes = await gzipBytes(bytes); compressed = true; } catch {} }
    const salt = secureRandomBytes(16), iv = secureRandomBytes(12);
    const key = await deriveSaveKey(pwd, salt);
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
    const wrapper = {
      format: 'GDSAVE', version: 1, crypt: 'AES-256-GCM', kdf: { name: 'PBKDF2-SHA256', iterations: 210000, salt: bufToBase64(salt) },
      iv: bufToBase64(iv), compressed, payload: bufToBase64(cipher),
      meta: { app: APP_VERSION, club: userClub().name, manager: managerName(), season: G.season.label, week: G.season.week, exportedAt: nowISO() },
    };
    // iPadOS Safari 对 application/octet-stream 更倾向于下载到“文件”，而不是在新标签页里预览 JSON。
    const blob = new Blob([JSON.stringify(wrapper, null, 2)], { type: 'application/octet-stream' });
    const a = document.createElement('a');
    const safe = (userClub().name || '俱乐部').replace(/[\\/:*?"<>|]/g, '_');
    a.href = URL.createObjectURL(blob);
    a.download = `${safe}_${G.season.label}_第${G.season.week}周.gdsave`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    closeModal();
    toast('存档已导出', `文件大小约 ${(blob.size / 1024 / 1024).toFixed(2)} MB。请妥善保管密码。`, 'good');
  } catch (e) {
    console.error(e);
    toast('导出失败', e.message || '请重试。', 'bad');
    if (btn) { btn.disabled = false; btn.textContent = '加密并下载'; }
  }
}
function openImportSavePicker() {
  const inp = $('#hidden-save-file');
  if (!inp) return;
  if (!window.crypto?.subtle) return toast('无法解密存档', '当前浏览器未提供 WebCrypto。iPadOS 请使用最新 Safari；若仍失败，请通过本地服务器打开。', 'bad');
  window._pendingImportText = null;
  inp.value = '';
  inp.click();
}
/* iPadOS 13+ 默认伪装成 MacIntel，需要通过触点数区分。 */
function isIPadOS() {
  const ua = navigator.userAgent || '';
  return /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}
function promptImportPassword(file, text) {
  window._pendingImportText = null;
  let wrapper = null;
  try { wrapper = JSON.parse(String(text || '')); } catch {}
  if (!wrapper || wrapper.format !== 'GDSAVE' || !wrapper.payload) {
    return toast('不是有效的存档', '请选择由“导出加密存档”生成的 .gdsave 文件。', 'bad');
  }
  openModal({
    kicker: 'Encrypted Save', title: '导入存档',
    body: `<p class="small muted">文件：${esc(file.name)}<br>大小：${(file.size / 1024 / 1024).toFixed(2)} MB</p>${isIPadOS() ? '<p class="xsmall faint" style="margin-top:6px">iPadOS：文件选择器会列出所有文件，选择 .gdsave 即可。</p>' : ''}<div class="hairline"></div><label class="field"><span>输入存档密码</span><input id="import-password" type="password" autocomplete="current-password" placeholder="导入后当前进度将被覆盖"></label><p class="xsmall orange">导入会覆盖当前本地进度。请确认密码正确。</p>`,
    actions: `<button class="btn ghost" data-action="close-modal">取消</button><button class="btn primary" data-action="do-import-save">解密并导入</button>`, narrow: true,
  });
  window._pendingImportText = text;
}
async function decryptSaveText(text, pwd) {
  const wrapper = JSON.parse(text);
  if (wrapper.format !== 'GDSAVE' || !wrapper.payload) throw new Error('不是有效的绿茵王朝存档');
  if (!pwd.length) throw new Error('请输入存档密码');
  if (!window.crypto?.subtle) throw new Error('当前浏览器不支持存档解密');
  const salt = new Uint8Array(base64ToBuf(wrapper.kdf.salt));
  const iv = new Uint8Array(base64ToBuf(wrapper.iv));
  const key = await deriveSaveKey(pwd, salt, wrapper.kdf.iterations || 210000);
  let bytes = new Uint8Array(base64ToBuf(wrapper.payload));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, bytes);
  let out = new Uint8Array(plain);
  if (wrapper.compressed) out = await gunzipBytes(out);
  const snapshot = JSON.parse(new TextDecoder().decode(out));
  if (!snapshot.save || !snapshot.save.clubs || !snapshot.save.players) throw new Error('存档内容不完整');
  const g = snapshot.save;
  if (!g.clubs[g.userClubId]) throw new Error('找不到用户俱乐部');
  return g;
}
async function doImportSave() {
  const pwd = $('#import-password')?.value || '';
  const text = window._pendingImportText;
  if (!text) return toast('文件已失效', '请重新选择存档文件。', 'bad');
  if (!pwd.length) return toast('请输入密码', '', 'bad');
  const btn = $('[data-action="do-import-save"]');
  if (btn) { btn.disabled = true; btn.textContent = '正在解密…'; }
  try {
    const g = await decryptSaveText(text, pwd);
    G = g;
    ensureGameShape();
    _rngState = g.rngState || 0x9e3779b9;
    G.meta.lastAutosave = nowISO();
    UI.screen = 'home';
    closeModal(); saveGame(true); renderApp();
    toast('存档已导入', `${userClub().name} · ${G.season.label} 第 ${G.season.week} 周`, 'good');
    window._pendingImportText = null;
  } catch (e) {
    console.error(e);
    const msg = e?.name === 'OperationError' ? '密码不正确，或存档已损坏。' : e.message || '无法读取存档';
    toast('导入失败', msg, 'bad');
    if (btn) { btn.disabled = false; btn.textContent = '解密并导入'; }
  }
}
/* ---------------- 双存档友谊赛 ---------------- */
function openFriendlyMode() {
  if (matchEngine) return toast('比赛进行中', '请先结束当前比赛。', 'bad');
  FRIENDLY = FRIENDLY || { slots: { a: { text: null, fileName: '', save: null, error: '' }, b: { text: null, fileName: '', save: null, error: '' } }, prev: null };
  renderFriendlyModal();
}
function friendlyPickFile(slot) {
  window._friendlySlot = slot;
  const inp = $('#hidden-friendly-save');
  if (!inp) return;
  inp.value = '';
  inp.click();
}
function friendlyReceiveFile(file) {
  const slot = window._friendlySlot;
  if (!FRIENDLY || !slot) return;
  const reader = new FileReader();
  reader.onload = () => {
    FRIENDLY.slots[slot].fileName = file.name;
    FRIENDLY.slots[slot].text = String(reader.result || '');
    FRIENDLY.slots[slot].save = null;
    FRIENDLY.slots[slot].error = '';
    renderFriendlyModal();
  };
  reader.onerror = () => toast('读取失败', '无法读取存档文件。', 'bad');
  reader.readAsText(file);
}
function friendlySaveInfo(save) {
  const c = save?.clubs?.[save.userClubId];
  if (!c) return null;
  const ps = (c.squad || []).map(id => save.players[id]).filter(Boolean);
  const ovr = Math.round(avg(ps.map(p => p.ovr)) || 0);
  return { club: c, ovr, count: ps.length };
}
async function friendlyLoadSlot(slot) {
  const s = FRIENDLY?.slots?.[slot];
  if (!s?.text) return toast('请选择文件', '先选择一个 .gdsave 存档。', 'bad');
  const pwd = $(`#friendly-pass-${slot}`)?.value || '';
  try {
    let g;
    const trimmed = s.text.trim();
    if (trimmed.startsWith('{') && !trimmed.includes('"payload"')) {
      const snap = JSON.parse(trimmed);
      g = snap.save || snap;
    } else {
      g = await decryptSaveText(s.text, pwd);
    }
    if (!g?.clubs || !g?.players || !g.clubs[g.userClubId]) throw new Error('存档内容不完整');
    s.save = g; s.error = '';
    renderFriendlyModal();
    toast('存档已载入', friendlySaveInfo(g).club.name, 'good');
  } catch (e) {
    console.error(e);
    s.error = e?.name === 'OperationError' ? '密码不正确，或存档已损坏。' : (e.message || '无法读取存档');
    renderFriendlyModal();
  }
}
function renderFriendlyModal() {
  if (!FRIENDLY) return;
  const card = (slot, label) => {
    const s = FRIENDLY.slots[slot];
    const info = s.save ? friendlySaveInfo(s.save) : null;
    return `<div class="card pad" style="border-color:${info ? 'rgba(120,201,158,.28)' : 'var(--line)'}">
      <div class="flex between wrap gap8"><div><div class="kicker">Save ${slot.toUpperCase()}</div><h3 style="font-size:16px;margin-top:2px">${label}</h3></div><span class="tag ${info ? 'green' : 'faint'}">${info ? '已载入' : '未载入'}</span></div>
      <div class="hairline" style="margin:10px 0"></div>
      ${info ? `<div class="flex gap10" style="align-items:center">${clubCrestEl(info.club, 'crest')}<div><div class="small" style="font-weight:600">${esc(info.club.name)}</div><div class="xsmall faint">${TIER_NAME(info.club.tier)} · ${info.club.formation} · 平均能力 ${info.ovr} · ${info.count} 人</div></div></div>` : `
        <div class="flex gap6 wrap"><button class="btn sm primary" data-action="friendly-pick" data-slot="${slot}">选择 .gdsave</button><span class="xsmall faint" style="align-self:center">${s.fileName ? esc(s.fileName) : '尚未选择文件'}</span></div>
        ${isIPadOS() ? '<div class="xsmall faint" style="margin-top:6px">iPadOS：文件选择器会显示所有文件，选择 .gdsave 即可。</div>' : ''}
        ${s.text ? `<label class="field" style="margin-top:9px"><span>存档密码</span><input id="friendly-pass-${slot}" type="password" autocomplete="current-password" placeholder="输入这个存档的密码"></label><button class="btn sm" data-action="friendly-load" data-slot="${slot}" style="margin-top:7px">解密并载入</button>` : ''}
        ${s.error ? `<div class="xsmall red" style="margin-top:7px">${esc(s.error)}</div>` : ''}`}
    </div>`;
  };
  const ready = !!(FRIENDLY.slots.a.save && FRIENDLY.slots.b.save);
  openModal({
    kicker: 'Friendly Match', title: '双存档友谊赛',
    body: `<p class="small muted" style="line-height:1.7">同时载入两个存档，让两支球队按照各自当前阵型和战术踢一场全自动友谊赛。双方开局满体力，助教掌控换人与临场调整，你只需要观看。比赛不计入赛程、不增加球员能力、不会改写任何存档。</p>
      <div class="detail-grid" style="margin-top:12px">${card('a', '主队存档')}${card('b', '客队存档')}</div>
      <div class="tactic-note" style="margin-top:12px"><strong>规则：</strong>友谊赛不计入联赛积分、不产生门票收入、不消耗存档中的体力或合同；所有球员以满体力开场。结束或关闭页面都不会影响两个原始存档。</div>`,
    actions: `<button class="btn ghost" data-action="close-modal">取消</button><button class="btn primary" data-action="friendly-start" ${ready ? '' : 'disabled'}>开始全自动友谊赛</button>`,
    wide: true,
  });
}
function deepCloneJson(v) { return JSON.parse(JSON.stringify(v)); }
function buildFriendlyWorld(saveA, saveB) {
  const makeSide = (save, idBase, isHome) => {
    const srcClub = save.clubs[save.userClubId];
    if (!srcClub) throw new Error('存档里找不到用户俱乐部');
    const srcPlayers = (srcClub.squad || []).map(id => save.players[id]).filter(Boolean);
    if (srcPlayers.length < 11) throw new Error(`${srcClub.name} 的一线队不足 11 人`);
    const idMap = new Map();
    srcPlayers.forEach((p, i) => idMap.set(p.id, idBase + i));
    const club = deepCloneJson(srcClub);
    club.id = isHome ? 1 : 2;
    club.isUser = isHome;
    club.squad = srcPlayers.map(p => idMap.get(p.id));
    club.lineup = (srcClub.lineup || []).map(x => ({ slot: x.slot, playerId: idMap.get(x.playerId) || null })).filter(x => x.playerId);
    club.bench = (srcClub.bench || []).map(id => idMap.get(id)).filter(Boolean);
    club.captainId = idMap.get(srcClub.captainId) || null;
    club.promotedSeason = null;
    const players = {};
    for (const p of srcPlayers) {
      const np = deepCloneJson(p);
      np.id = idMap.get(p.id);
      np.clubId = club.id;
      np.fitness = 100;
      np.injuryDays = 0;
      np.suspension = 0;
      np.yellowCards = 0;
      np.redCards = 0;
      np.loan = null;
      np.transferStatus = 'none';
      np.morale = Math.max(58, np.morale ?? 60);
      players[np.id] = np;
    }
    return { club, players };
  };
  const a = makeSide(saveA, 1000, true);
  const b = makeSide(saveB, 5000, false);
  const players = { ...a.players, ...b.players };
  for (const side of [a, b]) {
    if (!side.club.lineup || side.club.lineup.length < 11) side.club.lineup = bestLineupForClub(side.club, players, true);
    if (!side.club.bench || side.club.bench.length < 5) side.club.bench = bestBenchForClub(side.club, players, side.club.lineup, BENCH_SIZE, true);
    side.club.wageBudget = side.club.wageBudget || 6000;
  }
  return {
    version: SAVE_VERSION, appVersion: APP_VERSION, seed: (Math.random() * 0xFFFFFFFF) >>> 0, rngState: _rngState || 1,
    userClubId: 1, manager: '友谊赛助教', clubs: { 1: a.club, 2: b.club }, players,
    divisions: {}, freeAgents: [], initialPool: [], offers: [], negotiations: [], news: [], matchHistory: [], transferHistory: [],
    youthProspects: [], seasonHistory: [], market: { playerIds: [], refreshedSeason: 0, refreshedWeek: 0 },
    finance: { ledger: [], lastWeekSummary: null, negativeWeeks: 0, bankruptcyWarning: 0, wageArrears: 0 },
    board: { confidence: 60, goal: '友谊赛', targetPosition: 6, seasonsAtClub: 0, warning: 0, trophies: [] },
    meta: { onboardingDone: true, totalDays: 0, lastAutosave: null, difficulty: '友谊赛', settings: {}, bankrupt: false, testMode: false },
    trainer: { focus: 'balanced', intensity: 'normal', weeklyLog: [], lastReport: null },
    season: { number: 0, year: 2026, label: '友谊赛', week: 0, day: 0, round: 0, startISO: seasonStartISO(2026), phase: 'friendly', finished: false, transferWindowOpen: false, transferWindowLabel: '友谊赛' },
    lastMatch: null,
  };
}
function startFriendlyMatch() {
  if (!FRIENDLY?.slots?.a?.save || !FRIENDLY?.slots?.b?.save) return toast('存档未就绪', '请先载入两个存档。', 'bad');
  try {
    const world = buildFriendlyWorld(FRIENDLY.slots.a.save, FRIENDLY.slots.b.save);
    FRIENDLY.prev = { g: G, setup: SETUP, screen: UI.screen, rng: _rngState };
    FRIENDLY_ACTIVE = true;
    G = world;
    _rngState = (Math.random() * 0xFFFFFFFF) >>> 0;
    G.rngState = _rngState;
    const c = G.clubs[1], opp = G.clubs[2];
    const fixture = { id: 'friendly', round: '友谊赛', home: c.id, away: opp.id, played: false };
    const engine = new MatchEngine({
      fixture, userClub: c, oppClub: opp, weather: rollWeather(), teamTalk: 'calm',
      oppLineup: (opp.lineup || []).slice(), oppBench: (opp.bench || []).slice(),
    });
    engine.friendly = true;
    matchEngine = engine;
    matchUi = { tab: 'stats', overlay: null, lastUi: 0, selectedOut: null, selectedIn: null, halftimeShown: false, fulltimeShown: false, raf: 0, friendly: true };
    closeModal();
    UI.screen = 'home';
    document.body.style.overflow = 'hidden';
    renderMatchScreen();
    engine.start(onFriendlyHalfTime, onFriendlyFinished);
  } catch (e) {
    console.error(e);
    FRIENDLY_ACTIVE = false;
    if (FRIENDLY?.prev) {
      G = FRIENDLY.prev.g; SETUP = FRIENDLY.prev.setup; _rngState = FRIENDLY.prev.rng;
    }
    toast('无法开始友谊赛', e.message || '请检查两个存档。', 'bad');
  }
}
function onFriendlyHalfTime(eng) {
  if (matchEngine !== eng) return;
  matchUi.overlay = 'halftime';
  const root = $('#match-overlay-root');
  if (root) {
    const us = eng.stats.left, os = eng.stats.right;
    root.innerHTML = `<div class="half-overlay"><div class="half-panel"><div class="half-head"><div><div class="kicker">Friendly · Half Time</div><h3>中场休息 · ${esc(eng.userClub.short)} ${eng.teams.left.score} : ${eng.teams.right.score} ${esc(eng.oppClub.short)}</h3></div></div><div class="half-body"><div class="full"><div class="match-preview-line"><span>控球率</span><span>${Math.round(us.poss/(us.poss+os.poss||1)*100)}% - ${Math.round(os.poss/(us.poss+os.poss||1)*100)}%</span></div><div class="match-preview-line"><span>射门 / 射正</span><span>${us.shots} / ${us.onTarget} - ${os.shots} / ${os.onTarget}</span></div><div class="tactic-note" style="margin-top:10px">助教正在处理中场调整，下半场将自动开始。</div></div></div></div></div>`;
  }
  setTimeout(() => {
    if (matchEngine === eng && eng.halfTime) {
      matchUi.overlay = null;
      const r = $('#match-overlay-root'); if (r) r.innerHTML = '';
      eng.secondHalf();
    }
  }, 2400);
}
function onFriendlyFinished(eng) {
  if (matchEngine !== eng) return;
  matchUi.overlay = 'fulltime';
  G.lastMatch = { attendance: 0, income: null, friendly: true };
  renderFullTimeOverlay();
}
function finishFriendlyMode() {
  const prev = FRIENDLY?.prev;
  if (matchEngine) { matchEngine.stop(); matchEngine = null; }
  const root = $('#match-root'); if (root) root.innerHTML = '';
  document.body.style.overflow = '';
  closeModal();
  FRIENDLY_ACTIVE = false;
  FRIENDLY = null;
  if (prev) {
    G = prev.g; SETUP = prev.setup; _rngState = prev.rng;
    if (G) { UI.screen = prev.screen || 'home'; renderApp(); }
    else if (SETUP) renderSetup();
    else initNewSetup();
  } else {
    if (G) renderApp(); else initNewSetup();
  }
  toast('友谊赛结束', '本场比赛没有写入任何存档，也没有球员获得成长。', 'good');
}
function manualSave() {
  const ok = saveGame(true);
  toast(ok ? '已保存' : '保存失败', ok ? '进度已写入本地浏览器存储。' : '可能是本地存储空间不足。建议导出加密存档。', ok ? 'good' : 'bad');
}
function newGameConfirm() {
  openModal({
    kicker: '危险操作', title: '重新开始？',
    body: `<p class="small muted" style="line-height:1.7">这会清除当前俱乐部和本地自动存档。建议先导出一份加密存档。此操作不可撤销。</p>`,
    actions: `<button class="btn ghost" data-action="close-modal">取消</button><button class="btn ghost" data-action="export-save">先导出存档</button><button class="btn danger" data-action="confirm-new-game">确认重新开始</button>`, narrow: true,
  });
}
function confirmNewGame() {
  try { localStorage.removeItem(SAVE_KEY); } catch {}
  G = null; SETUP = null; IDENTITY_DRAFT = null; closeModal();
  initNewSetup();
}
function applySettingsCode() {
  if (!G) return;
  const input = $('#settings-code');
  const status = $('#settings-code-status');
  const raw = (input?.value || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!raw) {
    if (status) status.textContent = '请输入设置代码。';
    return;
  }
  const repeated = raw === TEST_CODE.repeat(3);
  if (raw === TEST_CODE) _testCodeStreak++;
  else if (repeated) _testCodeStreak = 3;
  else _testCodeStreak = 0;
  if (input) input.value = '';
  if (_testCodeStreak >= 3) {
    _testCodeStreak = 0;
    G.meta.testMode = true;
    writeTestModeFlag(true);
    saveGame();
    renderApp();
    openSaveMenu();
    toast('测试模式已开启', '测试工具已加入存档与设置面板。', 'gold');
    return;
  }
  if (status) {
    status.textContent = raw === TEST_CODE
      ? `代码正确，连续 ${_testCodeStreak} / 3 次。`
      : '代码不正确，连续次数已重置。';
  }
  if (raw !== TEST_CODE && !repeated) toast('设置代码无效', '连续输入正确代码 3 次可进入测试模式。', 'bad');
  else if (raw === TEST_CODE) toast(`设置代码 ${_testCodeStreak} / 3`, '再连续输入两次即可进入测试模式。', 'good');
}
function resetSaveConfirm() {
  openModal({
    kicker: '危险操作', title: '重置本地存档？',
    body: `<p class="small muted" style="line-height:1.7">这会删除浏览器中的本地自动存档，并返回开始界面。已经导出的 <span class="gold">.gdsave</span> 文件不受影响。</p><div class="tactic-note" style="margin-top:10px">测试模式开关会保留，避免每次重置后重新输入代码；如果只是想让球队重新开始，可以使用“新建俱乐部”。</div>`,
    actions: `<button class="btn ghost" data-action="close-modal">取消</button><button class="btn danger" data-action="confirm-reset-save">确认重置</button>`,
    narrow: true,
  });
}
function confirmResetSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch {}
  _testCodeStreak = 0;
  if (matchEngine) { try { matchEngine.stop(); } catch {} }
  G = null; SETUP = null; IDENTITY_DRAFT = null; matchSetupState = null; matchEngine = null;
  closeModal();
  document.body.style.overflow = '';
  UI.screen = 'home';
  try { location.reload(); } catch { initNewSetup(); }
}
function testAddCash() {
  if (!G) return;
  const c = userClub();
  c.cash += 1000000;
  c.transferBudget = Math.max(c.transferBudget || 0, c.cash);
  saveGame(); renderApp(); openSaveMenu();
  toast('测试：资金 +¥100万', '现金和转会预算已更新。', 'gold');
}
function testRestoreFitness() {
  if (!G) return;
  for (const p of squadPlayers(userClub())) p.fitness = 100;
  saveGame(); renderApp(); openSaveMenu();
  toast('测试：体力已恢复', '全队体力回到 100。', 'good');
}
function testHealAll() {
  if (!G) return;
  for (const p of squadPlayers(userClub())) {
    p.injuryDays = 0; p.suspension = 0; p.yellowCards = 0;
  }
  saveGame(); renderApp(); openSaveMenu();
  toast('测试：伤病/停赛已清除', '全队恢复可用状态。', 'good');
}
function testGotoMatchday() {
  if (!G) return;
  const nf = nextUserFixture();
  if (!nf) return toast('没有下一场比赛', '赛季可能已经结束。', 'bad');
  G.season.round = nf.round;
  G.season.week = Math.max(G.season.week, nf.round);
  G.season.day = 5;
  saveGame(); closeModal(); renderApp();
  toast('测试：已跳到比赛日', `第 ${nf.round} 轮 · 可以进入赛前部署。`, 'gold');
}
function testSimulate10() {
  if (!G) return;
  if (!nextUserFixture()) return toast('没有可模拟的比赛', '赛季可能已经结束。', 'bad');
  openModal({
    kicker: 'Test Tools', title: '正在批量模拟…',
    body: '<p class="small muted">正在用当前首发连续模拟 10 场，不会修改赛程或存档。大约需要几秒钟。</p>',
    actions: '', narrow: true, closable: false,
  });
  setTimeout(() => {
    const rows = [];
    let error = null;
    try {
      for (let i = 0; i < 10; i++) {
        const r = debugSimulateMatch();
        if (!r) break;
        rows.push(r);
      }
    } catch (e) { error = e; }
    if (!rows.length) {
      openSaveMenu();
      return toast('模拟失败', error?.message || '没有可用的比赛。', 'bad');
    }
    const agg = rows.reduce((a, r) => {
      for (const side of ['left', 'right']) {
        const s = r.stats[side];
        a[side].goals += side === 'left' ? r.score[0] : r.score[1];
        a[side].shots += s.shots; a[side].passes += s.passes; a[side].ok += s.passesOk;
        a[side].tackles += s.tackles; a[side].interceptions += s.interceptions;
      }
      return a;
    }, { left: { goals: 0, shots: 0, passes: 0, ok: 0, tackles: 0, interceptions: 0 }, right: { goals: 0, shots: 0, passes: 0, ok: 0, tackles: 0, interceptions: 0 } });
    const pct = (s) => s.passes ? Math.round(s.ok / s.passes * 100) : 0;
    openModal({
      kicker: 'Test Tools', title: '批量模拟结果 · 10 场',
      body: `<div class="match-preview-line"><span>总比分</span><span>${agg.left.goals} : ${agg.right.goals}</span></div>
        <div class="match-preview-line"><span>射门</span><span>${agg.left.shots} : ${agg.right.shots}</span></div>
        <div class="match-preview-line"><span>传球成功率</span><span>${pct(agg.left)}% : ${pct(agg.right)}%</span></div>
        <div class="match-preview-line"><span>抢断</span><span>${agg.left.tackles} : ${agg.right.tackles}</span></div>
        <div class="match-preview-line"><span>拦截</span><span>${agg.left.interceptions} : ${agg.right.interceptions}</span></div>
        <div class="hairline" style="margin:10px 0"></div>
        <div class="detail-list">${rows.map((r, i) => `<div class="dl-row"><span class="k">第 ${i + 1} 场</span><span class="v">${r.score[0]} : ${r.score[1]} · 射门 ${r.stats.left.shots}-${r.stats.right.shots}</span></div>`).join('')}</div>
        <p class="xsmall faint" style="margin-top:10px">模拟只读取当前存档，不写入赛程或结果。</p>`,
      actions: `<button class="btn ghost" data-action="open-save-menu">返回测试工具</button><button class="btn primary" data-action="close-modal">关闭</button>`, wide: true,
    });
  }, 60);
}
/* ---- 测试模式：十连抽历史记录 ---- */
const DRAW_HISTORY_LIMIT = 20;
function drawHistory() {
  if (!G) return [];
  G.meta = G.meta || {};
  if (!Array.isArray(G.meta.drawHistory)) G.meta.drawHistory = [];
  return G.meta.drawHistory;
}
function recordDrawHistory(type, pulled, extra = {}) {
  const history = drawHistory();
  const cards = pulled.map(x => {
    const p = x?.p || x;
    return {
      name: p.name, pos: p.pos, age: p.age, ovr: p.ovr, potential: p.potential,
      nat: p.nat, hidden: !!(x?.hidden || p.hidden),
    };
  });
  const entry = {
    type, at: nowISO(), ...extra,
    hidden: cards.filter(c => c.hidden).length,
    avgPotential: Math.round(cards.reduce((s, c) => s + c.potential, 0) / Math.max(1, cards.length)),
    cards,
  };
  history.unshift(entry);
  if (history.length > DRAW_HISTORY_LIMIT) history.length = DRAW_HISTORY_LIMIT;
  return entry;
}
function openDrawHistory() {
  const history = drawHistory();
  if (!history.length) return toast('暂无抽取记录', '完成一次十连抽后，会保留最近 20 次。', 'bad');
  const items = history.map(h => {
    const label = h.type === 'youth' ? `青训十连抽${h.level ? ` · Lv.${h.level}` : ''}` : '街头十连抽';
    const time = h.at ? new Date(h.at).toLocaleString('zh-CN') : '—';
    const hiddenNames = (h.cards || []).filter(c => c.hidden).map(c => c.name).join('、');
    const cards = (h.cards || []).map((c, i) => `<div class="prospect-card" style="${c.hidden ? 'border-color:rgba(215,184,107,.45);background:rgba(215,184,107,.06)' : ''}"><div class="prospect-main"><div class="prospect-name">#${i + 1} ${esc(c.name)} ${c.hidden ? '<span class="tag gold">隐藏天才</span>' : ''}</div><div class="prospect-meta">${c.age} 岁 · ${POS_CN[c.pos] || c.pos} · 能力 ${c.ovr} · 潜力 ${c.potential}</div></div><div class="potential-range">${c.potential}<span>潜力</span></div></div>`).join('');
    return `<details class="draw-history-item"><summary><span>${label} · ${time}</span><span class="tag ${h.hidden ? 'gold' : ''}">隐藏 ${h.hidden}${hiddenNames ? ` · ${esc(hiddenNames)}` : ''} · 平均潜力 ${h.avgPotential}</span></summary><div style="padding-top:6px">${cards}</div></details>`;
  }).join('');
  openModal({
    kicker: 'Test Tools · 抽取记录',
    title: `抽取记录 · 最近 ${history.length} 次`,
    body: `<p class="small muted" style="line-height:1.7">每次十连抽都会保存最近 ${DRAW_HISTORY_LIMIT} 次的快照，包含隐藏球员；即使球员后来被清理，记录仍然保留。</p><div class="hairline"></div><div class="draw-history">${items}</div><p class="xsmall faint" style="margin-top:8px">历史记录仅用于查看，已清理的测试球员不会因此回到自由球员市场。</p>`,
    actions: `<button class="btn ghost" data-action="open-save-menu">返回存档与设置</button><button class="btn primary" data-action="close-modal">关闭</button>`,
    wide: true,
  });
}
/* ---- 测试模式：青训十连抽 / 隐藏概率统计 ---- */
function youthTestStats() {
  if (!G) return null;
  G.meta = G.meta || {};
  if (!G.meta.youthTest || typeof G.meta.youthTest !== 'object') {
    G.meta.youthTest = { pulls: 0, hidden: 0, high: 0, potentialSum: 0 };
  }
  const s = G.meta.youthTest;
  s.pulls = Number(s.pulls) || 0;
  s.hidden = Number(s.hidden) || 0;
  s.high = Number(s.high) || 0;
  s.potentialSum = Number(s.potentialSum) || 0;
  return s;
}
function clearYouthTestPulls() {
  if (!G?.players) return 0;
  const stale = new Set();
  for (const p of Object.values(G.players)) {
    if (p?.testPull && !p.clubId) stale.add(p.id);
  }
  if (!stale.size) return 0;
  G.youthProspects = (G.youthProspects || []).filter(id => !stale.has(id));
  for (const id of stale) delete G.players[id];
  return stale.size;
}
function testYouthTenPull() {
  if (!G || !G.meta?.testMode) return toast('测试模式未开启', '请先在存档与设置中输入设置代码。', 'bad');
  const c = userClub();
  if (!c) return;
  const level = c.facility.youth || 1;
  const cleared = clearYouthTestPulls();
  const pulled = [];
  for (let i = 0; i < 10; i++) {
    const p = buildYouthProspect(rollYouthProspect(level), level);
    p.testPull = true;
    G.players[p.id] = p;
    pulled.push(p);
  }
  G.youthProspects = [...pulled.map(p => p.id), ...(G.youthProspects || [])];
  const stats = youthTestStats();
  for (const p of pulled) {
    stats.pulls += 1;
    if (p.hidden) stats.hidden += 1;
    if (p.potential >= 90) stats.high += 1;
    stats.potentialSum += p.potential;
  }
  recordDrawHistory('youth', pulled.map(p => ({ p, hidden: p.hidden })), { level });
  saveGame();
  renderApp();
  openYouthTenPullModal(pulled, level, cleared);
}
function openYouthTenPullModal(pulled, level, cleared = 0) {
  const stats = youthTestStats();
  const rate = youthHiddenChance(level);
  const tenRate = 1 - Math.pow(1 - rate, 10);
  const hidden = pulled.filter(p => p.hidden).length;
  const high = pulled.filter(p => p.potential >= 90).length;
  const avgPotential = Math.round(pulled.reduce((s, p) => s + p.potential, 0) / Math.max(1, pulled.length));
  const actualRate = stats.pulls ? stats.hidden / stats.pulls : 0;
  const rows = pulled.map((p, i) => {
    const border = p.hidden ? 'border-color:rgba(215,184,107,.55);background:rgba(215,184,107,.07)' : p.potential >= 90 ? 'border-color:rgba(120,201,158,.4);background:rgba(120,201,158,.05)' : '';
    return `<div class="prospect-card" style="${border}"><div class="prospect-main"><div class="prospect-name">#${i + 1} ${esc(p.name)} ${p.hidden ? '<span class="tag gold">隐藏天才</span>' : p.potential >= 90 ? '<span class="tag green">顶级潜力</span>' : ''}</div><div class="prospect-meta">${p.age} 岁 · ${POS_CN[p.pos]} · ${esc(p.nat)} · 当前能力 ${p.ovr} · 性格 ${esc(p.personality?.name || '—')}</div><div style="margin-top:4px">${(p.traits || []).slice(0,3).map(t => `<span class="tag" style="font-size:9px">${TRAITS[t]?.name || t}</span>`).join('') || '<span class="xsmall faint">尚无技术标签</span>'}</div></div><div class="potential-range">${p.potential}<span>潜力</span></div></div>`;
  }).join('');
  openModal({
    kicker: 'Test Tools · 青训十连抽',
    title: `十连抽结果 · 隐藏天才 ${hidden} 名`,
    body: `<div class="flex between wrap gap16" style="margin-bottom:12px">
      <div><div class="label">学院等级</div><div class="num" style="font-size:24px">Lv.${level}</div></div>
      <div><div class="label">单抽隐藏概率</div><div class="num" style="font-size:24px;color:var(--gold)">${(rate * 100).toFixed(2)}%</div></div>
      <div><div class="label">十连至少 1 名</div><div class="num" style="font-size:24px">${(tenRate * 100).toFixed(2)}%</div></div>
      <div><div class="label">本批平均潜力</div><div class="num" style="font-size:24px">${avgPotential}</div></div>
    </div>
    <div class="flex gap8 wrap" style="margin-bottom:10px"><span class="tag gold">隐藏 ${hidden}</span><span class="tag green">潜力 90+ ${high}</span><span class="tag">10 人已写入青训名单</span>${cleared ? `<span class="tag">已清理上批 ${cleared} 人</span>` : ''}<button class="text-link" data-action="open-draw-history" style="margin-left:auto">抽取记录（最近 20 次）</button></div>
    <div>${rows}</div>
    <div class="hairline"></div>
    <div class="detail-list">
      <div class="dl-row"><span class="k">累计实测</span><span class="v">${stats.pulls} 抽 · 隐藏 ${stats.hidden} 人 · 实际 ${(actualRate * 100).toFixed(2)}%</span></div>
      <div class="dl-row"><span class="k">理论期望</span><span class="v">每 ${Math.round(1 / rate)} 抽约 1 名 · 十连 ${(tenRate * 100).toFixed(2)}%</span></div>
      <div class="dl-row"><span class="k">累计潜力 90+</span><span class="v">${stats.high} 人 · 累计平均潜力 ${stats.pulls ? Math.round(stats.potentialSum / stats.pulls) : 0}</span></div>
    </div>
    <div class="tactic-note" style="margin-top:10px"><strong>说明：</strong>十连抽与赛季末青训使用同一套概率代码，结果会写入当前存档，可正常提拔。再次抽卡会清理上一批<strong>尚未提拔</strong>的测试球员，累计统计保留；抽卡会消耗随机数。每次十连也会写入最近 20 次抽取记录。<br><span class="faint">注：刘一、罗志弘、谭云开、谭科纬、胡钊豪这五名特定隐藏球员只出现在街头试训（0.05%/人/次），不在青训池中。</span></div>`,
    actions: `<button class="btn ghost" data-action="test-youth-probability">模拟 1000 抽 · 仅统计</button><button class="btn" data-action="test-youth-ten-pull">再抽 10 次</button><button class="btn primary" data-action="close-modal">关闭</button>`,
    wide: true,
  });
}
function testYouthProbability() {
  if (!G || !G.meta?.testMode) return toast('测试模式未开启', '请先在存档与设置中输入设置代码。', 'bad');
  const c = userClub();
  if (!c) return;
  const level = c.facility.youth || 1;
  const n = 1000;
  const savedRng = _rngState, savedGameRng = G.rngState;
  let hidden = 0, p90 = 0, p75 = 0, p60 = 0, below60 = 0, sum = 0, minP = 100, maxP = 0;
  for (let i = 0; i < n; i++) {
    const r = rollYouthProspect(level);
    if (r.hidden) hidden += 1;
    if (r.potential >= 90) p90 += 1;
    else if (r.potential >= 75) p75 += 1;
    else if (r.potential >= 60) p60 += 1;
    else below60 += 1;
    sum += r.potential;
    minP = Math.min(minP, r.potential);
    maxP = Math.max(maxP, r.potential);
  }
  _rngState = savedRng;
  G.rngState = savedGameRng;
  const rate = youthHiddenChance(level);
  const expected = n * rate;
  const actual = hidden / n;
  const tenRate = 1 - Math.pow(1 - rate, 10);
  const diff = hidden - expected;
  openModal({
    kicker: 'Test Tools · 青训概率统计',
    title: `模拟 ${n} 抽 · 隐藏 ${hidden} 名`,
    body: `<div class="detail-list">
      <div class="dl-row"><span class="k">学院等级 / 样本</span><span class="v">Lv.${level} · ${n} 抽（仅统计）</span></div>
      <div class="dl-row"><span class="k">隐藏天才</span><span class="v gold">${hidden} 人 · 实际 ${(actual * 100).toFixed(2)}% · 配置 ${(rate * 100).toFixed(2)}%</span></div>
      <div class="dl-row"><span class="k">理论期望</span><span class="v">${expected.toFixed(1)} 人（偏差 ${diff >= 0 ? '+' : ''}${diff.toFixed(1)}）</span></div>
      <div class="dl-row"><span class="k">十连至少 1 名</span><span class="v">${(tenRate * 100).toFixed(2)}% · 平均每 ${Math.round(1 / rate)} 抽 1 名</span></div>
      <div class="dl-row"><span class="k">潜力分布</span><span class="v">&lt;60 ${below60} · 60–74 ${p60} · 75–89 ${p75} · 90+ ${p90}</span></div>
      <div class="dl-row"><span class="k">平均潜力 / 区间</span><span class="v">${(sum / n).toFixed(1)} · ${minP}–${maxP}</span></div>
    </div>
    <div class="tactic-note" style="margin-top:10px"><strong>结论：</strong>${hidden === 0 ? '本次样本没有出现隐藏天才，单抽概率确实很低；可以继续增加样本量，或调整公式后再测。' : `本次出现 ${hidden} 名，理论期望 ${expected.toFixed(1)} 名。`} 该模拟不会创建球员、不会写入存档，随机数状态已恢复。</div>
    <p class="xsmall faint" style="margin-top:8px">隐藏概率公式：0.2% + 学院等级 × 0.04%（${level} 级 = ${(rate * 100).toFixed(2)}% / 名）。十连抽按 10 名球员独立判定。此统计只针对青训营的隐藏天才；街头试训的五名特定球员仍为 0.05%/人/次。</p>`,
    actions: `<button class="btn ghost" data-action="test-youth-probability">再模拟 1000 抽</button><button class="btn primary" data-action="close-modal">关闭</button>`,
    wide: true,
  });
}
/* ---- 测试模式：街头十连抽 / 五名隐藏球员概率 ---- */
function streetTestStats() {
  if (!G) return null;
  G.meta = G.meta || {};
  if (!G.meta.streetTest || typeof G.meta.streetTest !== 'object') {
    G.meta.streetTest = { pulls: 0, hidden: 0, high: 0, potentialSum: 0 };
  }
  const s = G.meta.streetTest;
  s.pulls = Number(s.pulls) || 0;
  s.hidden = Number(s.hidden) || 0;
  s.high = Number(s.high) || 0;
  s.potentialSum = Number(s.potentialSum) || 0;
  return s;
}
function clearStreetTestPulls() {
  if (!G?.players) return 0;
  const stale = new Set();
  for (const p of Object.values(G.players)) {
    if (p?.testStreet && !p.clubId) stale.add(p.id);
  }
  if (!stale.size) return 0;
  G.freeAgents = (G.freeAgents || []).filter(id => !stale.has(id));
  G.negotiations = (G.negotiations || []).filter(n => !stale.has(n.playerId));
  G.offers = (G.offers || []).filter(o => !stale.has(o.playerId));
  for (const id of stale) delete G.players[id];
  return stale.size;
}
function pendingStreetTestHidden() {
  if (!G?.players) return [];
  return Object.values(G.players).filter(p => p?.testStreet && !p.clubId && p.hidden);
}
function openStreetTestHiddenWarning(players) {
  const rows = players.map(p => `<div class="dl-row"><span class="k">${esc(p.name)} · ${POS_CN[p.pos] || p.pos}</span><span class="v gold">潜力 ${p.potential}</span></div>`).join('');
  openModal({
    kicker: 'Test Tools · 街头十连抽',
    title: `上一批还有 ${players.length} 名未签约的隐藏天才`,
    body: `<p class="small muted" style="line-height:1.7">再次抽取会清理上一批尚未签约的测试球员，其中包括：</p><div class="detail-list" style="margin-top:8px">${rows}</div><div class="tactic-note" style="margin-top:10px"><strong>注意：</strong>隐藏球员每个名字在存档中唯一。被清理后，这批测试结果会从自由球员市场移除。建议先去自由球员市场签下他；已经签约的隐藏球员不会受影响。即使清理，最近 20 次抽取记录仍会保留。</div>`,
    actions: `<button class="btn ghost" data-action="close-modal">取消</button><button class="btn ghost" data-action="test-street-open-market">去签约</button><button class="btn primary" data-action="test-street-force-ten-pull">仍然再抽</button>`,
    wide: true,
  });
}
function testStreetTenPull(force = false) {
  if (!G || !G.meta?.testMode) return toast('测试模式未开启', '请先在存档与设置中输入设置代码。', 'bad');
  const c = userClub();
  if (!c) return;
  const pendingHidden = pendingStreetTestHidden();
  if (pendingHidden.length && !force) {
    openStreetTestHiddenWarning(pendingHidden);
    return;
  }
  const cleared = clearStreetTestPulls();
  const pulled = [];
  for (let i = 0; i < 10; i++) {
    const { candidate, isHidden } = rollStreetCandidate({ test: true });
    candidate.testStreet = true;
    G.freeAgents.push(candidate.id);
    pulled.push({ p: candidate, hidden: isHidden });
  }
  const stats = streetTestStats();
  for (const { p, hidden } of pulled) {
    stats.pulls += 1;
    if (hidden) stats.hidden += 1;
    if (p.potential >= 80) stats.high += 1;
    stats.potentialSum += p.potential;
  }
  recordDrawHistory('street', pulled);
  saveGame();
  renderApp();
  openStreetTenPullModal(pulled, cleared);
}
function openStreetTenPullModal(pulled, cleared = 0) {
  const stats = streetTestStats();
  const per = STREET_HIDDEN_CHANCE;
  const total = 1 - Math.pow(1 - per, HIDDEN_PLAYERS.length);
  const tenRate = 1 - Math.pow(1 - total, 10);
  const hidden = pulled.filter(x => x.hidden).length;
  const high = pulled.filter(x => x.p.potential >= 80).length;
  const avgPotential = Math.round(pulled.reduce((s, x) => s + x.p.potential, 0) / Math.max(1, pulled.length));
  const actualRate = stats.pulls ? stats.hidden / stats.pulls : 0;
  const rows = pulled.map(({ p, hidden: isHidden }, i) => {
    const border = isHidden ? 'border-color:rgba(215,184,107,.55);background:rgba(215,184,107,.07)' : p.potential >= 80 ? 'border-color:rgba(120,201,158,.4);background:rgba(120,201,158,.05)' : '';
    return `<div class="prospect-card" style="${border}"><div class="prospect-main"><div class="prospect-name">#${i + 1} ${esc(p.name)} ${isHidden ? '<span class="tag gold">隐藏天才</span>' : p.potential >= 80 ? '<span class="tag green">高潜力</span>' : ''}</div><div class="prospect-meta">${p.age} 岁 · ${POS_CN[p.pos]} · ${esc(p.nat)} · 当前能力 ${p.ovr} · 潜力 ${p.potential} · 性格 ${esc(p.personality?.name || '—')}</div><div style="margin-top:4px">${(p.traits || []).slice(0,3).map(t => `<span class="tag" style="font-size:9px">${TRAITS[t]?.name || t}</span>`).join('') || '<span class="xsmall faint">尚无技术标签</span>'}</div></div><div class="potential-range">${p.potential}<span>潜力</span></div></div>`;
  }).join('');
  openModal({
    kicker: 'Test Tools · 街头十连抽',
    title: `街头十连抽 · 隐藏天才 ${hidden} 名`,
    body: `<div class="flex between wrap gap16" style="margin-bottom:12px">
      <div><div class="label">单次隐藏概率</div><div class="num" style="font-size:24px;color:var(--gold)">${(total * 100).toFixed(2)}%</div></div>
      <div><div class="label">十连至少 1 名</div><div class="num" style="font-size:24px">${(tenRate * 100).toFixed(2)}%</div></div>
      <div><div class="label">本批平均潜力</div><div class="num" style="font-size:24px">${avgPotential}</div></div>
      <div><div class="label">累计实测隐藏率</div><div class="num" style="font-size:24px">${(actualRate * 100).toFixed(2)}%</div></div>
    </div>
    <div class="flex gap8 wrap" style="margin-bottom:10px"><span class="tag gold">隐藏 ${hidden}</span><span class="tag green">潜力 80+ ${high}</span><span class="tag">10 人已加入自由球员市场</span>${cleared ? `<span class="tag">已清理上批 ${cleared} 人</span>` : ''}<button class="text-link" data-action="open-draw-history" style="margin-left:auto">抽取记录（最近 20 次）</button></div>
    <div>${rows}</div>
    <div class="hairline"></div>
    <div class="detail-list">
      <div class="dl-row"><span class="k">累计实测</span><span class="v">${stats.pulls} 抽 · 隐藏 ${stats.hidden} 人 · 实际 ${(actualRate * 100).toFixed(2)}%</span></div>
      <div class="dl-row"><span class="k">理论期望</span><span class="v">每 ${Math.round(1 / total)} 抽约 1 名 · 十连 ${(tenRate * 100).toFixed(2)}%</span></div>
      <div class="dl-row"><span class="k">累计潜力 80+</span><span class="v">${stats.high} 人 · 累计平均潜力 ${stats.pulls ? Math.round(stats.potentialSum / stats.pulls) : 0}</span></div>
    </div>
    <div class="tactic-note" style="margin-top:10px"><strong>说明：</strong>与真实街头试训使用同一套概率（五名特定球员各 0.05%，合计约 0.25%）。结果会加入自由球员市场，可在转会页签约。再次抽卡会清理上一批<strong>尚未签约</strong>的测试球员；如果上一批有未签约的隐藏天才，会先弹出确认提示。每次十连也会写入最近 20 次抽取记录。隐藏球员每个名字在存档中唯一。<br><span class="faint">注：本工具只影响当前存档的自由球员列表和累计统计，不扣试训费、不占用每日试训次数。</span></div>`,
    actions: `<button class="btn ghost" data-action="test-street-probability">模拟 1000 抽 · 仅统计</button><button class="btn ghost" data-action="test-street-open-market">去自由球员市场</button><button class="btn" data-action="test-street-ten-pull">再抽 10 次</button><button class="btn primary" data-action="close-modal">关闭</button>`,
    wide: true,
  });
}
function testStreetProbability() {
  if (!G || !G.meta?.testMode) return toast('测试模式未开启', '请先在存档与设置中输入设置代码。', 'bad');
  const n = 1000;
  const savedRng = _rngState, savedGameRng = G.rngState;
  const nameHits = Object.fromEntries(HIDDEN_PLAYERS.map(h => [h.key, 0]));
  let hidden = 0;
  for (let i = 0; i < n; i++) {
    for (const h of HIDDEN_PLAYERS) {
      if (!chance(STREET_HIDDEN_CHANCE)) continue;
      hidden += 1;
      nameHits[h.key] += 1;
      break;
    }
  }
  _rngState = savedRng;
  G.rngState = savedGameRng;
  const per = STREET_HIDDEN_CHANCE;
  const total = 1 - Math.pow(1 - per, HIDDEN_PLAYERS.length);
  const expected = n * total;
  const tenRate = 1 - Math.pow(1 - total, 10);
  const diff = hidden - expected;
  const nameRows = HIDDEN_PLAYERS.map(h => `<div class="dl-row"><span class="k">${esc(h.name)}</span><span class="v">${nameHits[h.key]} 次</span></div>`).join('');
  openModal({
    kicker: 'Test Tools · 街头概率统计',
    title: `模拟 ${n} 抽 · 隐藏 ${hidden} 名`,
    body: `<div class="detail-list">
      <div class="dl-row"><span class="k">样本</span><span class="v">${n} 抽（仅统计，不创建球员）</span></div>
      <div class="dl-row"><span class="k">隐藏天才</span><span class="v gold">${hidden} 人 · 实际 ${(hidden / n * 100).toFixed(3)}% · 配置 ${(total * 100).toFixed(3)}%</span></div>
      <div class="dl-row"><span class="k">理论期望</span><span class="v">${expected.toFixed(2)} 人（偏差 ${diff >= 0 ? '+' : ''}${diff.toFixed(2)}）</span></div>
      <div class="dl-row"><span class="k">十连至少 1 名</span><span class="v">${(tenRate * 100).toFixed(2)}% · 平均每 ${Math.round(1 / total)} 抽 1 名</span></div>
    </div>
    <div class="stat-block-title" style="margin-top:10px">各隐藏球员命中次数</div>
    <div class="detail-list">${nameRows}</div>
    <div class="tactic-note" style="margin-top:10px"><strong>说明：</strong>五名特定球员每人每次独立 0.05%，合计约 ${(total * 100).toFixed(3)}%。该模拟不读取 hiddenSeen、不创建球员、不写存档，前后恢复 RNG。</div>`,
    actions: `<button class="btn ghost" data-action="test-street-probability">再模拟 1000 抽</button><button class="btn primary" data-action="close-modal">关闭</button>`,
    wide: true,
  });
}
function openStreetTestFreeAgents() {
  closeModal();
  UI.screen = 'transfers';
  UI.marketTab = 'market';
  UI.marketFilters.tier = 'FREE';
  UI.marketFilters.q = '';
  renderApp();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function testExit() {
  if (!G) return;
  G.meta.testMode = false;
  writeTestModeFlag(false);
  _testCodeStreak = 0;
  saveGame();
  renderApp();
  openSaveMenu();
  toast('测试模式已关闭', '设置代码可以重新开启。', 'good');
}

/* -------------------------------------------------------------------------
   23. 存档：自动保存、载入、形状修复
   ------------------------------------------------------------------------- */
function saveGame(force = false) {
  if (FRIENDLY_ACTIVE) return false;
  if (!G || !G.meta?.onboardingDone) return false;
  try {
    G.rngState = _rngState;
    G.meta.lastAutosave = nowISO();
    const data = JSON.stringify(G);
    localStorage.setItem(SAVE_KEY, data);
    return true;
  } catch (e) {
    console.error('Save failed', e);
    if (!window._saveWarned) {
      window._saveWarned = true;
      toast('自动保存失败', '本地存储空间不足。请立即导出加密存档，否则进度可能丢失。', 'bad');
    }
    return false;
  }
}
function loadLocalSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const g = JSON.parse(raw);
    if (!g || !g.clubs || !g.players || !g.clubs[g.userClubId] || !g.meta?.onboardingDone) return false;
    G = g;
    ensureGameShape();
    _rngState = G.rngState || 0x9e3779b9;
    return true;
  } catch (e) {
    console.error('Load failed', e);
    return false;
  }
}
function ensureGameShape() {
  if (!G) return;
  G.offers = G.offers || [];
  G.negotiations = G.negotiations || [];
  G.news = G.news || [];
  G.freeAgents = G.freeAgents || [];
  G.transferHistory = G.transferHistory || [];
  G.seasonHistory = G.seasonHistory || [];
  G.youthProspects = G.youthProspects || [];
  G.youthPromotions = G.youthPromotions || 0;
  G.matchHistory = G.matchHistory || [];
  G.market = G.market || { playerIds: [], refreshedSeason: 0, refreshedWeek: 0 };
  G.finance = G.finance || { ledger: [], lastWeekSummary: null, negativeWeeks: 0, bankruptcyWarning: 0, wageArrears: 0 };
  G.board = G.board || { confidence: 50, goal: '稳定中游', targetPosition: 8, seasonsAtClub: 0, warning: 0, trophies: [] };
  G.meta = G.meta || { onboardingDone: true, totalDays: 0, bankrupt: false };
  G.meta.bankrupt = !!G.meta.bankrupt;
  G.meta.testMode = !!G.meta.testMode || readTestModeFlag();
  G.trainer = G.trainer || { focus: 'balanced', intensity: 'normal', weeklyLog: [], lastReport: null };
  const c = userClub();
  if (!c) return;
  // 旧存档里自动生成的球衣 SVG 带有花纹越界、号码被遮挡的问题。上传图片不受影响。
  const kitPatterns = ['solid', 'stripes', 'sash', 'halves', 'hoops'];
  for (const club of Object.values(G.clubs)) {
    if (!club || !club.colors) continue;
    if (club.kit && !club.kit.startsWith('data:image/svg')) continue;
    const pat = club.isUser ? (club.user?.kitPattern || 'sash') : kitPatterns[(club.id * 2 + 1) % kitPatterns.length];
    club.kit = makeKit(club.colors, pat);
  }
  c.sponsorOffers = c.sponsorOffers || [];
  c.interestedPlayers = c.interestedPlayers || [];
  c.hiddenSeen = c.hiddenSeen || [];
  c.sellOnReceivables = c.sellOnReceivables || [];
  c.owedSellOns = c.owedSellOns || [];
  c.receivable = c.receivable || [];
  c.payable = c.payable || [];
  c.construction = c.construction || [];
  c.ledger = c.ledger || [];
  c.honours = c.honours || [];
  c.facility = c.facility || { training: 1, medical: 1, youth: 1 };
  c.tactics = c.tactics || { attack: 'balanced', defense: 'balanced', tempo: 'normal' };
  c.lineup = c.lineup || [];
  c.bench = c.bench || [];
  normalizeUserBench();
  c.squad = c.squad || [];
  c.streetLastDay = c.streetLastDay ?? -1;
  c.promotedSeason = c.promotedSeason ?? null;
  c.wageBudget = c.wageBudget || 6000;
  c.sponsor = c.sponsor || null;
  G.season = G.season || { number: 1, year: 2026, label: '2026赛季', week: 1, day: 0, round: 1, startISO: seasonStartISO(2026), phase: 'season', finished: false, transferWindowOpen: true, transferWindowLabel: '季初转会窗' };
  G.board.trophies = G.board.trophies || [];
  G.board.goal = G.board.goal || '稳定中游';
  // 同步 ID 计数器与姓名注册表，避免导入存档后新生成对象覆盖旧对象
  try {
    const playerIds = Object.keys(G.players).map(Number);
    nextPlayerId = Math.max(1, ...playerIds) + 1;
    const clubIds = Object.keys(G.clubs).map(Number);
    nextClubId = Math.max(1, ...clubIds) + 1;
    let maxFixture = 0;
    for (const div of Object.values(G.divisions || {})) for (const f of (div.fixtures || [])) maxFixture = Math.max(maxFixture, f.id || 0);
    nextFixtureId = maxFixture + 1;
    usedNames.clear();
    HIDDEN_PLAYERS.forEach(h => usedNames.add(h.name));
    for (const p of Object.values(G.players)) {
      usedNames.add(p.name);
      p.ovr = Math.round(Number(p.ovr) || (p.attrs ? calcOvr(p.attrs, p.pos) : 30));
      p.potential = clamp(Math.round(Number(p.potential) || p.ovr), p.ovr + 1, 100);
      // v1.3.7 旧档补标记：修复前青训隐藏判定只影响潜力，没有写入 hidden。
      // 非隐藏青训的潜力上限是 96，因此自家青训球员潜力 97–100 可以确定来自隐藏分支。
      if (!p.hidden && !p.hiddenKey && p.homegrown && p.potential >= 97) p.hidden = true;
      if (!p.playStyle) p.playStyle = playStyleOf(p);
      if (p.attrs && p.attrs.sta == null) p.attrs.sta = clampRound(25 + (p.attrs.str || 40) * .4 + (p.attrs.spd || 40) * .2 + Math.max(0, 32 - p.age) * .8, 5, 95);
      if (p.attrs && p.attrs.phy == null) p.attrs.phy = clampRound((p.attrs.str || 40) * .65 + (p.attrs.spd || 40) * .15 + (p.attrs.tac || 40) * .1 + 10, 5, 95);
    }
  } catch (e) { console.warn('ID sync failed', e); }
}
function refreshMatchHUD() {
  if (matchEngine) { updateMatchScoreboard(); updateMatchSide(false); }
}

/* -------------------------------------------------------------------------
   24. 俱乐部外观编辑
   ------------------------------------------------------------------------- */
let IDENTITY_DRAFT = null;
function openIdentityEditor() {
  const c = userClub();
  IDENTITY_DRAFT = {
    name: c.name, city: c.city, stadium: c.stadium,
    primary: c.colors[0], secondary: c.colors[1], pattern: c.user?.kitPattern || 'sash',
    crestStyle: c.user?.crestStyle ?? 0,
    logo: c.logo && c.logo.startsWith('data:image/svg') ? null : c.logo,
    kitImage: c.kit && c.kit.startsWith('data:image/svg') ? null : c.kit,
  };
  renderIdentityEditor();
}
function draftClubColors() { return [IDENTITY_DRAFT.primary, IDENTITY_DRAFT.secondary]; }
function draftClubLogo() { return IDENTITY_DRAFT.logo || makeCrest(draftClubColors(), IDENTITY_DRAFT.name || '青岚竞技', IDENTITY_DRAFT.crestStyle || 0, 202); }
function draftClubKit() { return IDENTITY_DRAFT.kitImage || makeKit(draftClubColors(), IDENTITY_DRAFT.pattern || 'sash'); }
function renderIdentityEditor() {
  const d = IDENTITY_DRAFT;
  const patterns = [['solid','纯色'],['stripes','竖条纹'],['sash','斜绶带'],['halves','左右拼色'],['hoops','横条纹']];
  openModal({
    kicker: 'Club Identity', title: '编辑俱乐部外观',
    body: `<div class="identity-grid">
      <div><div class="label">队徽与颜色</div><div class="flex gap16" style="align-items:center;margin:8px 0"><img id="identity-logo-preview" src="${draftClubLogo()}" alt="队徽预览" style="width:100px;height:112px;object-fit:contain"><div><button class="btn sm" data-action="identity-upload-logo">上传队徽图片</button><div class="xsmall faint" style="margin-top:5px">PNG / JPG / SVG</div></div></div><div class="crest-options">${[0,1,2,3].map(i => `<button class="crest-option ${!d.logo && (d.crestStyle||0)===i?'active':''}" data-action="identity-crest" data-style="${i}"><img src="${makeCrest(draftClubColors(), d.name || '青岚竞技', i, 202)}" alt="模板"></button>`).join('')}</div><div class="color-row" style="margin-top:10px"><label class="field"><span>主色</span><input id="identity-primary" type="color" value="${d.primary}" data-identity="primary"></label><label class="field"><span>辅色</span><input id="identity-secondary" type="color" value="${d.secondary}" data-identity="secondary"></label></div></div>
      <div><div class="label">主场球衣</div><div class="flex gap16" style="align-items:center;margin:8px 0"><img id="identity-kit-preview" src="${draftClubKit()}" alt="球衣预览" style="width:110px;height:122px;object-fit:contain"><button class="btn sm" data-action="identity-upload-kit">上传球衣图片</button></div><div class="pattern-row">${patterns.map(([k,n]) => `<button class="pattern-btn ${d.pattern===k?'active':''}" data-action="identity-pattern" data-pattern="${k}">${n}</button>`).join('')}</div><label class="field" style="margin-top:10px"><span>俱乐部名称</span><input id="identity-name" value="${esc(d.name)}" data-identity="name" maxlength="14"></label><label class="field"><span>主场名称</span><input id="identity-stadium" value="${esc(d.stadium)}" data-identity="stadium" maxlength="16"></label></div></div><p class="xsmall faint" style="margin-top:10px">比赛中的球员用俱乐部主色与辅色表示。上传图片只保存在本地存档中。</p>`,
    actions: `<button class="btn ghost" data-action="close-modal">取消</button><button class="btn primary" data-action="save-identity">保存外观</button>`, wide: true,
  });
}
function refreshIdentityPreview() {
  if (!IDENTITY_DRAFT) return;
  const lp = $('#identity-logo-preview'); if (lp) lp.src = draftClubLogo();
  const kp = $('#identity-kit-preview'); if (kp) kp.src = draftClubKit();
  $$('.crest-option img', $('#modal-root')).forEach((el, i) => { el.src = makeCrest(draftClubColors(), IDENTITY_DRAFT.name || '青岚竞技', i, 202); });
}
function saveIdentity() {
  const c = userClub();
  if (!IDENTITY_DRAFT) return;
  if (!IDENTITY_DRAFT.name.trim()) return toast('名称不能为空', '', 'bad');
  c.name = IDENTITY_DRAFT.name.trim();
  c.short = c.name.replace(/足球俱乐部|俱乐部|竞技|联/g, '').slice(0,4) || c.name.slice(0,2);
  c.city = IDENTITY_DRAFT.city || c.city;
  c.stadium = IDENTITY_DRAFT.stadium || c.stadium;
  c.colors = [IDENTITY_DRAFT.primary, IDENTITY_DRAFT.secondary];
  c.logo = IDENTITY_DRAFT.logo || makeCrest(c.colors, c.name, IDENTITY_DRAFT.crestStyle || 0, 202);
  c.kit = IDENTITY_DRAFT.kitImage || makeKit(c.colors, IDENTITY_DRAFT.pattern || 'sash');
  c.user = { ...(c.user || {}), primary: IDENTITY_DRAFT.primary, secondary: IDENTITY_DRAFT.secondary, kitPattern: IDENTITY_DRAFT.pattern, crestStyle: IDENTITY_DRAFT.crestStyle };
  IDENTITY_DRAFT = null;
  closeModal(); saveGame(); renderApp();
  toast('俱乐部外观已更新', '', 'good');
}


/* -------------------------------------------------------------------------
   25. 经营相关弹窗
   ------------------------------------------------------------------------- */
function openFacilityModal(type) {
  const c = userClub();
  if (!c) return;
  const current = c.facility[type] || 1;
  if (current >= 5) return toast('已达最高等级', '该设施已经完成全部升级。', 'bad');
  const target = current + 1;
  const cost = facilityUpgradeCost(c, type, target);
  const names = { training: '训练设施', medical: '医疗中心', youth: '青训学院' };
  const effects = {
    training: '训练成长概率提升约 22%，并略微改善球员潜力兑现速度。',
    medical: '受伤概率下降约 12%，每日体力恢复加快，重伤概率降低。',
    youth: '赛季青训人数与潜力提升，出现高潜力苗子的概率增加。',
  };
  openModal({
    kicker: 'Facility Upgrade', title: `升级${names[type]}`,
    body: `<div class="flex between" style="margin-bottom:12px"><div><div class="label">当前等级</div><div class="num" style="font-size:27px">Lv.${current}</div></div><div class="tc"><div class="xsmall faint">升级至</div><div class="num gold" style="font-size:27px">Lv.${target}</div></div><div class="tr"><div class="label">工程费用</div><div class="num gold" style="font-size:18px">${fmtMoney(cost)}</div></div></div>
    <div class="tactic-note"><strong>效果：</strong>${effects[type]}<br><strong>周期：</strong>2 周。施工期间无法重复升级同类设施。<br><strong>维护：</strong>升级后每周设施成本会相应增加。</div>
    <p class="xsmall faint" style="margin-top:10px">当前现金 ${fmtMoney(c.cash)}。升级会立即扣除工程款。</p>`,
    actions: `<button class="btn ghost" data-action="close-modal">取消</button><button class="btn primary" data-action="confirm-facility" data-type="${type}" ${c.cash < cost ? 'disabled' : ''}>确认开工</button>`, narrow: true,
  });
}
function confirmFacility(type) {
  closeModal();
  startFacilityUpgrade(type);
}
function openLoanModal() {
  const c = userClub();
  const limit = bankCreditLimit(c);
  const available = Math.max(0, limit - (c.bankLoan || 0));
  openModal({
    kicker: 'Bank Loan', title: '申请银行贷款',
    body: `<div class="detail-list"><div class="dl-row"><span class="k">信用额度</span><span class="v">${fmtMoney(limit)}</span></div><div class="dl-row"><span class="k">当前贷款</span><span class="v">${fmtMoney(c.bankLoan||0)}</span></div><div class="dl-row"><span class="k">可借额度</span><span class="v gold">${fmtMoney(available)}</span></div><div class="dl-row"><span class="k">周利率</span><span class="v">0.9%</span></div></div><label class="field" style="margin-top:12px"><span>借款金额</span><input id="loan-amount" type="number" min="10000" max="${available}" step="10000" value="${Math.min(available, 200000)}"></label><p class="xsmall orange">贷款会立即到账，但每周会从俱乐部现金中扣除利息。不要用贷款支付长期工资。</p>`,
    actions: `<button class="btn ghost" data-action="close-modal">取消</button><button class="btn primary" data-action="do-borrow" ${available<10000?'disabled':''}>确认借款</button>`, narrow: true,
  });
}
function doBorrow() {
  const c = userClub();
  const amount = Math.round(Number($('#loan-amount')?.value || 0));
  const available = Math.max(0, bankCreditLimit(c) - (c.bankLoan || 0));
  if (!amount || amount < 10000) return toast('金额无效', '单次借款至少 ¥10,000。', 'bad');
  if (amount > available) return toast('超过额度', `最多可借 ${fmtMoney(available)}。`, 'bad');
  c.bankLoan = (c.bankLoan || 0) + amount;
  addLedger(amount, '银行贷款到账', '俱乐部融资 · 周息 0.9%', 'loan');
  addNews('银行贷款到账', `俱乐部获得 ${fmtMoney(amount)} 贷款，未偿还余额 ${fmtMoney(c.bankLoan)}。`, 'finance');
  saveGame(); closeModal(); renderApp();
  toast('贷款到账', `已收到 ${fmtMoney(amount)}。`, 'good');
}
function openRepayModal() {
  const c = userClub();
  openModal({
    kicker: 'Bank Loan', title: '提前还款',
    body: `<div class="detail-list"><div class="dl-row"><span class="k">未偿还本金</span><span class="v">${fmtMoney(c.bankLoan||0)}</span></div><div class="dl-row"><span class="k">可用现金</span><span class="v ${c.cash<0?'red':''}">${fmtMoney(c.cash)}</span></div></div><label class="field" style="margin-top:12px"><span>还款金额</span><input id="repay-amount" type="number" min="10000" max="${Math.min(c.bankLoan||0, Math.max(0,c.cash))}" step="10000" value="${Math.min(c.bankLoan||0, Math.max(0,c.cash))}"></label>`,
    actions: `<button class="btn ghost" data-action="close-modal">取消</button><button class="btn primary" data-action="do-repay">确认还款</button>`, narrow: true,
  });
}
function doRepay() {
  const c = userClub();
  const amount = Math.round(Number($('#repay-amount')?.value || 0));
  if (!amount || amount < 10000) return toast('金额无效', '单次还款至少 ¥10,000。', 'bad');
  if (amount > c.cash) return toast('现金不足', '无法完成还款。', 'bad');
  if (amount > (c.bankLoan || 0)) return toast('超过贷款余额', '', 'bad');
  addLedger(-amount, '偿还银行贷款', '减少未偿还本金', 'loan');
  c.bankLoan -= amount;
  saveGame(); closeModal(); renderApp();
  toast('还款完成', `已偿还 ${fmtMoney(amount)}。`, 'good');
}
function openStadiumExpansionModal() {
  const c = userClub();
  const options = [500, 1000, 2000, 3000];
  openModal({
    kicker: 'Stadium Expansion', title: '扩建看台',
    body: `<p class="small muted" style="line-height:1.7">容量不是越大越好。只有上座率接近满员时，扩建才能带来明显的门票收入。</p><div class="detail-list"><div class="dl-row"><span class="k">当前容量</span><span class="v">${fmtPlain(c.capacity)} 座</span></div><div class="dl-row"><span class="k">球迷基础</span><span class="v">${fmtPlain(Math.round(c.fanbase))} 人</span></div><div class="dl-row"><span class="k">施工周期</span><span class="v">4 周</span></div></div><div class="nego-form" style="margin-top:12px"><label>扩建规模<select id="stadium-seats">${options.map(s => `<option value="${s}">+${fmtPlain(s)} 座 · ${fmtMoney(stadiumExpansionCost(c,s))}</option>`).join('')}</select></label><label>扩建后容量<div class="num gold" style="font-size:20px;margin-top:7px" id="stadium-preview-capacity">${fmtPlain(c.capacity)}</div></label></div>`,
    actions: `<button class="btn ghost" data-action="close-modal">取消</button><button class="btn primary" data-action="do-stadium-expansion">确认扩建</button>`, narrow: true,
  });
}
function doStadiumExpansion() {
  const seats = Number($('#stadium-seats')?.value || 1000);
  closeModal();
  startStadiumExpansion(seats);
}
function openTicketPriceModal() {
  const c = userClub();
  const base = TIERS[c.tier].ticket;
  const min = Math.round(base * .55), max = Math.round(base * 1.65);
  openModal({
    kicker: 'Ticket Pricing', title: '调整票价',
    body: `<p class="small muted">票价越高，单场收入越高，但上座率会下降。战绩和对手也会影响球迷是否愿意买票。</p><label class="field" style="margin-top:12px"><span>主场票价（建议区间 ${fmtMoney(min)} – ${fmtMoney(max)}）</span><input id="ticket-price" type="number" min="${min}" max="${max}" step="1" value="${c.ticket}"></label><div class="tactic-note">当前票价 ${fmtMoney(c.ticket)} · 预计上座 ${fmtPlain(estimatedAttendance(c,null))} 人 · 预计门票收入 ${fmtMoney(estimatedAttendance(c,null)*c.ticket)}</div>`,
    actions: `<button class="btn ghost" data-action="close-modal">取消</button><button class="btn primary" data-action="do-ticket-price">确认价格</button>`, narrow: true,
  });
}
function doTicketPrice() {
  const c = userClub();
  const base = TIERS[c.tier].ticket;
  const min = Math.round(base * .55), max = Math.round(base * 1.65);
  const price = clamp(Math.round(Number($('#ticket-price')?.value || c.ticket)), min, max);
  c.ticket = price;
  addNews('票价调整', `俱乐部将主场票价调整为 ${fmtMoney(price)}。这一变化会立即影响上座率。`, 'finance');
  saveGame(); closeModal(); renderApp();
  toast('票价已更新', `新票价 ${fmtMoney(price)}。`, 'good');
}
function confirmBuyGround() {
  const c = userClub();
  const cost = { 1: 12000000, 2: 6000000, 3: 2200000, 4: 900000, 5: 420000 }[c.tier] || 420000;
  openModal({
    kicker: 'Land Purchase', title: '购买训练基地土地',
    body: `<p class="small muted">买下训练基地的土地可以免除每周的场地租赁费，并略微提升训练效果。这是一项长期投资，不会立刻让球队变强。</p><div class="detail-list" style="margin-top:10px"><div class="dl-row"><span class="k">购地价格</span><span class="v gold">${fmtMoney(cost)}</span></div><div class="dl-row"><span class="k">当前现金</span><span class="v">${fmtMoney(c.cash)}</span></div><div class="dl-row"><span class="k">交付时间</span><span class="v">1 周</span></div><div class="dl-row"><span class="k">长期收益</span><span class="v">免除场地租金</span></div></div>`,
    actions: `<button class="btn ghost" data-action="close-modal">取消</button><button class="btn primary" data-action="do-buy-ground" ${c.cash<cost?'disabled':''}>确认购地</button>`, narrow: true,
  });
}
function expandWageBudget() {
  const c = userClub();
  const cost = Math.max(50000, Math.round(c.wageBudget * .2 / 10000) * 10000);
  if (c.cash < cost) return toast('资金不足', '提高工资预算需要向董事会缴纳保证金。', 'bad');
  addLedger(-cost, '提高工资预算保证金', '董事会批准的预算调整', 'board');
  c.wageBudget = Math.round(c.wageBudget * 1.15 / 1000) * 1000;
  G.board.confidence = clamp(G.board.confidence + 1, 0, 100);
  addNews('工资预算调整', `董事会同意将周薪预算提高至 ${fmtMoney(c.wageBudget)}。`, 'board');
  saveGame(); renderApp();
}

/* -------------------------------------------------------------------------
   26. 阵容选择弹窗
   ------------------------------------------------------------------------- */
function choiceRow(p, c, opts = {}) {
  const ovr = opts.ovr ?? p.ovr;
  const fit = opts.fit != null ? opts.fit : Math.round(positionFit(p.pos, opts.slotPos || p.pos) * 100);
  const action = opts.action;
  const index = opts.index;
  const isCurrent = opts.current;
  const styleName = playStyleName(p);
  return `<div class="lineup-choice ${isCurrent ? 'is-current' : ''}" role="button" tabindex="0" data-action="${action}" data-index="${index}" data-id="${p.id}">
    <div class="choice-shirt" style="background:${c.colors[0]};border-color:${c.colors[1]};color:${c.colors[1]}">${p.number || '—'}</div>
    <div class="choice-main">
      <div class="choice-name">${esc(p.name)} ${posTag(p.pos)} ${squadRoleTag(p, c)} ${isCurrent ? '<span class="tag gold">当前</span>' : ''} ${playerStatusTags(p)}</div>
      <div class="choice-meta">${p.age} 岁 · ${esc(p.nat)} · 天然位置 ${POS_CN[p.pos] || p.pos} · ${esc(styleName)} · 适应度 ${fit}%</div>
    </div>
    <div class="choice-numbers">
      <div><strong class="${ovrClass(ovr)}">${ovr}</strong><span>位置能力</span></div>
      <div><strong>${Math.round(p.fitness)}</strong><span>体力</span></div>
      <div><strong class="gold">${Math.round(p.potential)}</strong><span>潜力</span></div>
    </div>
    <span class="btn xs ${isCurrent ? 'gold' : 'primary'} choice-pick">${isCurrent ? '当前' : '选择'}</span>
  </div>`;
}
function openLineupSlotModal(index) {
  const c = userClub();
  const slots = FORMATION_SLOTS[c.formation] || FORMATION_SLOTS['4-4-2'];
  const slot = slots[index];
  if (!slot) return;
  const current = c.lineup[index]?.playerId;
  const available = squadPlayers(c).filter(p => p.injuryDays <= 0 && p.suspension <= 0)
    .sort((a,b) => (effectiveOvrForRole(b, slot.pos) + positionFit(b.pos,slot.pos)*12) - (effectiveOvrForRole(a, slot.pos) + positionFit(a.pos,slot.pos)*12));
  openModal({
    kicker: `首发位置 · ${slot.pos}`, title: `选择${POS_CN[slot.pos] || slot.pos}`,
    body: available.length ? `<div class="lineup-choice-list">${available.map(p => choiceRow(p, c, {
      ovr: effectiveOvrForRole(p, slot.pos),
      fit: Math.round(positionFit(p.pos, slot.pos) * 100),
      slotPos: slot.pos,
      action: 'assign-slot',
      index,
      current: p.id === current,
    })).join('')}</div>` : '<div class="empty-state"><strong>没有可用球员</strong>请先签下球员或让伤员恢复。</div>',
    actions: `<button class="btn ghost" data-action="close-modal">取消</button>${current ? `<button class="btn danger" data-action="clear-slot" data-index="${index}">清空该位置</button>` : ''}`, wide: true,
  });
}
function openBenchSlotModal(index) {
  const c = userClub();
  const lineupIds = new Set(c.lineup.map(x => x.playerId).filter(Boolean));
  const benchCurrent = (c.bench || [])[index];
  const available = squadPlayers(c).filter(p => !lineupIds.has(p.id) && p.injuryDays <= 0 && p.suspension <= 0)
    .sort((a,b) => b.ovr - a.ovr);
  openModal({
    kicker: '替补席', title: '选择替补球员',
    body: available.length ? `<div class="lineup-choice-list">${available.map(p => choiceRow(p, c, {
      action: 'assign-bench',
      index,
      current: p.id === benchCurrent,
    })).join('')}</div>` : '<div class="empty-state"><strong>没有可用的替补</strong>请签下更多球员或等待伤员恢复。</div>',
    actions: `<button class="btn ghost" data-action="close-modal">取消</button>`, wide: true,
  });
}


/* -------------------------------------------------------------------------
   27. 事件与动作分发
   ------------------------------------------------------------------------- */
function bindRenderedEvents() {
  // 所有事件均使用委托，在 initEvents 中统一绑定。
}
function refreshSetupPreview() {
  if (!SETUP) return;
  const logoImgs = $$('img[alt="当前队徽"]');
  const kitImgs = $$('img[alt="当前球衣"]');
  logoImgs.forEach(img => img.src = logoForDraft());
  kitImgs.forEach(img => img.src = kitForDraft());
  $$('.crest-option').forEach(btn => {
    const img = btn.querySelector('img');
    if (img) img.src = makeCrest([SETUP.primary, SETUP.secondary], SETUP.clubName || '青岚竞技', Number(btn.dataset.style || 0), 101);
  });
}
async function handleImageUpload(file) {
  const kind = window._uploadKind;
  if (!kind) return;
  try {
    const data = await loadImageFile(file, kind.includes('kit') ? 512 : 384);
    if (kind === 'setup-logo') { SETUP.logo = data; renderSetup(); }
    else if (kind === 'setup-kit') { SETUP.kitImage = data; renderSetup(); }
    else if (kind === 'identity-logo') { IDENTITY_DRAFT.logo = data; renderIdentityEditor(); }
    else if (kind === 'identity-kit') { IDENTITY_DRAFT.kitImage = data; renderIdentityEditor(); }
    toast('图片已载入', '保存后会写入本地存档。', 'good');
  } catch (e) {
    toast('图片读取失败', e.message || '请换一张图片。', 'bad');
  }
  window._uploadKind = null;
}
function handleAction(action, el, e) {
  const ds = el.dataset;
  const id = Number(ds.id || 0);
  switch (action) {
    // ---- 新游戏 / 设置 ----
    case 'setup-begin': SETUP.stage = 'identity'; renderSetup(); break;
    case 'setup-back': {
      if (SETUP.stage === 'identity') SETUP.stage = 'welcome';
      else if (SETUP.stage === 'look') SETUP.stage = 'identity';
      else if (SETUP.stage === 'recruit') SETUP.stage = 'look';
      renderSetup(); break;
    }
    case 'setup-to-look': {
      SETUP.clubName = (SETUP.clubName || '').trim() || '青岚竞技';
      SETUP.manager = (SETUP.manager || '').trim() || '无名教练';
      SETUP.stage = 'look'; renderSetup(); break;
    }
    case 'setup-to-recruit': openRecruitStep(); break;
    case 'setup-crest': SETUP.crestStyle = Number(ds.style); SETUP.logo = null; renderSetup(); break;
    case 'setup-pattern': SETUP.kitPattern = ds.pattern; SETUP.kitImage = null; renderSetup(); break;
    case 'setup-upload-logo': window._uploadKind = 'setup-logo'; $('#hidden-file').click(); break;
    case 'setup-upload-kit': window._uploadKind = 'setup-kit'; $('#hidden-file').click(); break;
    case 'setup-clear-logo': SETUP.logo = null; renderSetup(); break;
    case 'setup-clear-kit': SETUP.kitImage = null; renderSetup(); break;
    case 'toggle-recruit': toggleRecruit(id); break;
    case 'auto-recruit': autoRecommendRecruits(); break;
    case 'clear-recruit': SETUP.selected = []; renderSetup(); break;
    case 'setup-player-detail': openSetupPlayerDetail(id); break;
    case 'setup-detail-select': toggleRecruit(id); closeModal(); break;
    case 'finish-onboarding': finishOnboarding(); break;
    // ---- 导航 ----
    case 'nav': {
      closeModal();
      if (ds.screen) UI.screen = ds.screen;
      if (ds.tab) UI.marketTab = ds.tab;
      UI.viewTier = null;
      renderApp();
      window.scrollTo({ top: 0, behavior: 'instant' });
      break;
    }
    case 'squad-tab': UI.squadTab = ds.tab; renderApp(); break;
    case 'market-tab': UI.marketTab = ds.tab; renderApp(); break;
    case 'go-train': UI.screen = 'training'; renderApp(); break;
    case 'quick-train': applyTrainingAndAdvance(G.trainer.focus || 'balanced', G.trainer.intensity || 'normal'); break;
    case 'rest-day': restAndAdvance(); break;
    case 'train-day': applyTrainingAndAdvance(G.trainer.focus || 'balanced', G.trainer.intensity || 'normal'); break;
    case 'train-week': trainUntilMatchday('train'); break;
    case 'rest-week': trainUntilMatchday('rest'); break;
    case 'finish-week': {
      if (G.season.finished) { showSeasonReview(); break; }
      if (G.season.day !== 6) return toast('还不能结束本周', '请先完成当前日程和比赛。', 'bad');
      expiringOfferCheck();
      dailyRecovery();
      startNewWeek();
      renderApp();
      break;
    }
    case 'training-focus': G.trainer.focus = ds.key; renderApp(); break;
    case 'training-intensity': G.trainer.intensity = ds.key; renderApp(); break;
    // ---- 阵容 ----
    case 'auto-lineup': autoPickLineup(); break;
    case 'set-formation': setFormation(ds.formation); break;
    case 'tactic': {
      const c = userClub();
      if (!c) break;
      if (ds.side === 'attack' && ATTACK_STYLES[ds.key]) c.tactics.attack = ds.key;
      if (ds.side === 'defense' && DEFENSE_STYLES[ds.key]) c.tactics.defense = ds.key;
      if (ds.side === 'tempo' && TEMPO_STYLES[ds.key]) c.tactics.tempo = ds.key;
      saveGame(); renderApp(); break;
    }
    case 'lineup-slot': openLineupSlotModal(Number(ds.index)); break;
    case 'bench-slot': openBenchSlotModal(Number(ds.index)); break;
    case 'assign-slot': assignPlayerToSlot(Number(ds.index), id); break;
    case 'assign-bench': setBenchPlayer(Number(ds.index), id); break;
    case 'clear-slot': clearSlot(Number(ds.index)); break;
    case 'open-player': openPlayerDetail(id); break;
    case 'open-renewal': openRenewalModal(id); break;
    case 'submit-renewal': submitRenewal(id); break;
    case 'toggle-transfer': {
      const p = player(id);
      if (!p) break;
      const status = ds.status;
      if (status === 'none') p.transferStatus = 'none';
      else p.transferStatus = p.transferStatus === status ? 'none' : status;
      saveGame(); closeModal(); renderApp();
      toast('球员状态更新', p.transferStatus === 'listed' ? '已挂牌出售。' : p.transferStatus === 'loan' ? '已加入外租名单。' : '已取消挂牌。', 'good');
      break;
    }
    case 'set-captain': setCaptain(id); closeModal(); break;
    // ---- 消息 / 帮助 ----
    case 'show-inbox': showInbox(); break;
    case 'show-help': showHelp(); break;
    case 'close-modal': closeModal(); break;
    case 'backdrop-close': if (e.target === el) closeModal(); break;
    // ---- 转会 ----
    case 'market-tab': UI.marketTab = ds.tab; renderApp(); break;
    case 'apply-market-filters': {
      UI.marketFilters.q = $('#market-q')?.value || '';
      UI.marketFilters.pos = $('#market-pos')?.value || 'ALL';
      UI.marketFilters.maxPrice = $('#market-price')?.value || '';
      UI.marketFilters.minOvr = $('#market-ovr')?.value || '';
      UI.marketFilters.tier = $('#market-tier')?.value || 'ALL';
      renderApp(); break;
    }
    case 'reset-market-filters': UI.marketFilters = { q: '', pos: 'ALL', maxPrice: '', minOvr: '', tier: 'ALL', loanOnly: false }; renderApp(); break;
    case 'toggle-loan-filter': UI.marketFilters.loanOnly = !UI.marketFilters.loanOnly; renderApp(); break;
    case 'update-interests': updateUserPlayerInterests(); refreshTransferListings(); toast('市场已刷新', '外部兴趣与可谈判名单已更新。', 'good'); saveGame(); renderApp(); break;
    case 'bid-player': startBuyNegotiation(id, 'buy'); break;
    case 'loan-player': loanTransferRequest(id); break;
    case 'free-sign': openFreeAgentNegotiation(id); break;
    case 'open-negotiation': openNegotiation(ds.id); break;
    case 'cancel-negotiation': cancelNegotiation(ds.id); break;
    case 'submit-buy-offer': submitBuyOffer(ds.id); break;
    case 'submit-contract-offer': submitContractOffer(ds.id); break;
    case 'open-incoming-offer': openIncomingOffer(ds.id); break;
    case 'accept-offer': acceptIncomingOffer(ds.id); break;
    case 'reject-offer': rejectIncomingOffer(ds.id); break;
    case 'open-sell-counter': openSellCounter(ds.id); break;
    case 'submit-sell-counter': submitSellCounter(ds.id); break;
    case 'submit-loan': submitLoanRequest(id); break;
    // ---- 青训 ----
    case 'street-recruit': streetRecruit(); break;
    case 'sign-street': signStreetCandidate(id, Number(ds.fee || 0)); break;
    case 'promote-prospect': promoteProspect(id); break;
    case 'generate-youth-preview': generateYouthPreview(); break;
    // ---- 财政 / 设施 ----
    case 'finance-tab': UI.financesTab = ds.tab; renderApp(); break;
    case 'open-facility': openFacilityModal(ds.type); break;
    case 'confirm-facility': confirmFacility(ds.type); break;
    case 'open-loan-modal': openLoanModal(); break;
    case 'do-borrow': doBorrow(); break;
    case 'open-repay-modal': openRepayModal(); break;
    case 'do-repay': doRepay(); break;
    case 'open-stadium-expansion': openStadiumExpansionModal(); break;
    case 'do-stadium-expansion': doStadiumExpansion(); break;
    case 'open-ticket-price': openTicketPriceModal(); break;
    case 'do-ticket-price': doTicketPrice(); break;
    case 'buy-ground': confirmBuyGround(); break;
    case 'do-buy-ground': closeModal(); buyTrainingGround(); break;
    case 'sign-sponsor': signSponsor(ds.id); break;
    case 'expand-wage-budget': expandWageBudget(); break;
    // ---- 赛程 ----
    case 'open-fixture': openFixtureDetails(Number(ds.id)); break;
    // ---- 外观 ----
    case 'open-identity-editor': openIdentityEditor(); break;
    case 'identity-crest': IDENTITY_DRAFT.crestStyle = Number(ds.style); IDENTITY_DRAFT.logo = null; renderIdentityEditor(); break;
    case 'identity-pattern': IDENTITY_DRAFT.pattern = ds.pattern; IDENTITY_DRAFT.kitImage = null; renderIdentityEditor(); break;
    case 'identity-upload-logo': window._uploadKind = 'identity-logo'; $('#hidden-file').click(); break;
    case 'identity-upload-kit': window._uploadKind = 'identity-kit'; $('#hidden-file').click(); break;
    case 'save-identity': saveIdentity(); break;
    // ---- 存档 ----
    case 'open-save-menu': openSaveMenu(); break;
    case 'export-save': openExportDialog(); break;
    case 'do-export-save': doExportSave(); break;
    case 'open-import-save': openImportSavePicker(); break;
    case 'do-import-save': doImportSave(); break;
    case 'open-friendly-mode': openFriendlyMode(); break;
    case 'friendly-pick': friendlyPickFile(ds.slot); break;
    case 'friendly-load': friendlyLoadSlot(ds.slot); break;
    case 'friendly-start': startFriendlyMatch(); break;
    case 'friendly-finish-close': finishFriendlyMode(); break;
    case 'manual-save': manualSave(); break;
    case 'new-game-confirm': newGameConfirm(); break;
    case 'confirm-new-game': confirmNewGame(); break;
    case 'reset-game': confirmNewGame(); break;
    case 'apply-settings-code': applySettingsCode(); break;
    case 'reset-save-confirm': resetSaveConfirm(); break;
    case 'confirm-reset-save': confirmResetSave(); break;
    case 'test-add-cash': testAddCash(); break;
    case 'test-restore-fitness': testRestoreFitness(); break;
    case 'test-heal-all': testHealAll(); break;
    case 'test-goto-matchday': testGotoMatchday(); break;
    case 'test-simulate-10': testSimulate10(); break;
    case 'test-youth-ten-pull': testYouthTenPull(); break;
    case 'test-youth-probability': testYouthProbability(); break;
    case 'test-street-ten-pull': testStreetTenPull(); break;
    case 'test-street-force-ten-pull': testStreetTenPull(true); break;
    case 'test-street-probability': testStreetProbability(); break;
    case 'test-street-open-market': openStreetTestFreeAgents(); break;
    case 'open-draw-history': openDrawHistory(); break;
    case 'test-exit': testExit(); break;
    // ---- 比赛 ----
    case 'match-setup': openMatchSetup(); break;
    case 'close-match-setup': closeMatchSetup(); break;
    case 'prematch-talk': if (matchSetupState) { matchSetupState.teamTalk = ds.key; closeModal(); openMatchSetup(); } break;
    case 'match-subs-close': matchSubsClose(); break;
    case 'match-sub-cancel': matchSubsClose(); break;
    case 'start-match': startLiveMatch(); break;
    case 'risk-skip-match': openRiskSkipConfirm(); break;
    case 'confirm-risk-skip': confirmRiskSkip(); break;
    case 'cancel-risk-skip': closeModal(); openMatchSetup(); break;
    case 'match-pause': toggleMatchPause(); break;
    case 'match-resume': resumeMatch(); break;
    case 'match-tactics-tab':
    case 'match-stats-tab':
    case 'match-lineup-tab':
    case 'match-commentary-tab':
      setMatchScreenTab(ds.tab || 'stats'); break;
    case 'match-tactic': setMatchTactic(ds.side, ds.key); break;
    case 'match-formation': setMatchFormation(ds.formation); break;
    case 'match-team-talk': setMatchTeamTalk(ds.key); break;
    case 'open-match-subs': openMatchSubs(); break;
    case 'match-select-out': selectMatchOut(Number(ds.index)); break;
    case 'match-select-in': selectMatchIn(Number(ds.index)); break;
    case 'make-substitution': makeSubstitution(); break;
    case 'half-time-continue': continueSecondHalf(); break;
    case 'match-risk-skip': openMatchRiskSkipConfirm(); break;
    case 'confirm-match-risk-skip': runMatchRiskSkip(); break;
    case 'match-finish-close': closeMatchScreen(); break;
    case 'show-season-review': {
      if (matchEngine) {
        matchEngine.stop(); matchEngine = null;
        const mr = $('#match-root'); if (mr) mr.innerHTML = '';
        document.body.style.overflow = '';
        renderApp();
      }
      showSeasonReview(); break;
    }
    case 'season-continue': confirmContinueSeason(); break;
    case 'force-continue-season': continueToNextSeason(); break;
    case 'match-speed-debug': break;
    default:
      console.warn('Unknown action', action);
  }
}
function initEvents() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    if (el.disabled) return;
    e.preventDefault();
    handleAction(el.dataset.action, el, e);
  });
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.setup) {
      SETUP[t.dataset.setup] = t.value;
      if (['clubName', 'primary', 'secondary'].includes(t.dataset.setup)) refreshSetupPreview();
    }
    if (t.dataset.identity && IDENTITY_DRAFT) {
      IDENTITY_DRAFT[t.dataset.identity] = t.value;
      if (t.dataset.identity === 'primary' || t.dataset.identity === 'secondary' || t.dataset.identity === 'name') refreshIdentityPreview();
    }
    if (t.id === 'squad-search') UI.squadSearch = t.value;
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.change === 'view-tier') { UI.viewTier = Number(t.value); renderApp(); }
    if (t.dataset.change === 'squad-pos') { UI.squadPos = t.value; renderApp(); }
    if (t.dataset.change === 'squad-search') { UI.squadSearch = t.value; renderApp(); }
    if (t.dataset.change === 'captain') { setCaptain(Number(t.value)); }
    if (t.id === 'stadium-seats') {
      const cap = userClub().capacity + Number(t.value || 0);
      const el = $('#stadium-preview-capacity');
      if (el) el.textContent = fmtPlain(cap);
    }
    if (t.id === 'hidden-file') {}
  });
  const fileInput = $('#hidden-file');
  if (fileInput) fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) handleImageUpload(fileInput.files[0]);
    fileInput.value = '';
  });
  const saveInput = $('#hidden-save-file');
  if (saveInput) saveInput.addEventListener('change', () => {
    const file = saveInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => promptImportPassword(file, String(reader.result || ''));
    reader.onerror = () => toast('读取失败', '无法读取存档文件。', 'bad');
    reader.readAsText(file);
    saveInput.value = '';
  });
  const friendlyInput = $('#hidden-friendly-save');
  if (friendlyInput) friendlyInput.addEventListener('change', () => {
    const file = friendlyInput.files?.[0];
    if (file) friendlyReceiveFile(file);
    friendlyInput.value = '';
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target?.id === 'settings-code') {
      e.preventDefault();
      applySettingsCode();
      return;
    }
    if (e.key === 'Escape') {
      if (UI.modal) {
        const backToSetup = !!document.querySelector('[data-action="cancel-risk-skip"]');
        closeModal();
        if (backToSetup) openMatchSetup();
        return;
      }
      if (matchEngine && matchEngine.active && !matchEngine.paused) toggleMatchPause();
    }
    if (e.code === 'Space') {
      const tag = document.activeElement?.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(tag)) return;
      if (matchEngine && matchEngine.active && !matchEngine.finished) { e.preventDefault(); toggleMatchPause(); }
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && matchEngine && matchEngine.active && !matchEngine.paused && !matchEngine.finished) {
      matchEngine.paused = true;
      matchEngine.pauseReason = '页面切换';
      renderMatchPause();
    }
  });
}

/* -------------------------------------------------------------------------
   28. 启动
   ------------------------------------------------------------------------- */
function initApp() {
  initEvents();
  const loaded = loadLocalSave();
  if (loaded) {
    UI.screen = 'home';
    renderApp();
    if (G.meta.bankrupt) setTimeout(showBankruptcy, 400);
  } else {
    initNewSetup();
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initApp);
else initApp();


/* -------------------------------------------------------------------------
   29. 比赛：赛前部署与 2D 实时引擎
   ------------------------------------------------------------------------- */
let matchEngine = null;
let matchSetupState = null;
let matchUi = { tab: 'stats', overlay: null, lastUi: 0, selectedOut: null, selectedIn: null, halftimeShown: false, fulltimeShown: false, raf: 0 };
let _matchLoopRaf = 0;

const WEATHERS = [
  { key: 'sunny', name: '晴', pass: 0, shot: 0, stamina: 0, desc: '草皮干燥，适合传递与快速推进。' },
  { key: 'cloudy', name: '多云', pass: 0, shot: 0, stamina: 0, desc: '气温适中，没有明显的天气影响。' },
  { key: 'windy', name: '大风', pass: -.025, shot: -.02, stamina: .02, desc: '长传和传中更难控制，远射轨迹会飘。' },
  { key: 'light_rain', name: '小雨', pass: -.018, shot: -.012, stamina: .015, desc: '球速略快，地面传球需要更精细的处理。' },
  { key: 'heavy_rain', name: '大雨', pass: -.05, shot: -.035, stamina: .06, desc: '湿滑草皮增加失误，体能消耗也会加快。' },
];
function rollWeather() {
  return weightedPick(WEATHERS, w => ({ sunny: 34, cloudy: 27, windy: 13, light_rain: 17, heavy_rain: 9 }[w.key]));
}

function openMatchSetup() {
  if (!G) return;
  if (G.season.day !== 5) return toast('不是比赛日', '只有周六比赛日才能进入比赛部署。', 'bad');
  const f = findUserFixture(G.season.round);
  if (!f || f.played) {
    const nf = nextUserFixture();
    if (!nf) return toast('赛季已结束', '没有可进行的比赛。', 'bad');
    return toast('不是比赛日', '请在比赛日周六进入比赛。', 'bad');
  }
  const c = userClub(), opp = clubById(fixtureOpponent(f, c.id));
  ensureUserLineupValid();
  const valid = validateMatchdaySquad();
  if (!valid.ok && !valid.warnOnly) {
    openModal({
      kicker: '无法开始比赛', title: '首发阵容不完整',
      body: `<p class="small muted">${esc(valid.msg)}</p><div class="tactic-note" style="margin-top:10px">请前往阵容页补满首发，或签下自由球员。比赛必须完成，请先处理阵容。</div>`,
      actions: `<button class="btn ghost" data-action="close-modal">关闭</button><button class="btn primary" data-action="nav" data-screen="squad">前往阵容</button>`, narrow: true,
    });
    return;
  }
  const edge = tacticalPreview(c.tactics, opp.tactics);
  if (!matchSetupState || matchSetupState.fixtureId !== f.id) {
    matchSetupState = { fixtureId: f.id, weather: rollWeather(), teamTalk: 'calm' };
  }
  const weather = matchSetupState.weather;
  const userPlayers = c.lineup.map(x => player(x.playerId)).filter(Boolean);
  const oppStars = clubStarPlayers(opp.id, 3);
  const lineupCount = userPlayers.length;
  const benchCount = (c.bench || []).filter(id => player(id) && player(id).injuryDays <= 0 && player(id).suspension <= 0).length;
  openModal({
    kicker: `${TIER_NAME(c.tier)} · 第 ${f.round} 轮`, title: `赛前部署 · ${c.name} vs ${opp.name}`,
    body: `<div class="match-setup-hero"><div class="setup-matchup"><div class="setup-team">${clubCrestEl(c,'crest lg')}<div class="n">${esc(c.name)}</div><div class="m">${f.home===c.id?'主场':'客场'}</div></div><div class="setup-mid"><div class="round">${fixtureDateText(f)}</div><div class="time">15:00</div><div class="venue">${esc(f.home===c.id?c.stadium:opp.stadium)}</div></div><div class="setup-team">${clubCrestEl(opp,'crest lg')}<div class="n">${esc(opp.name)}</div><div class="m">${f.home===c.id?'客队':'主队'}</div></div></div></div>
    <div class="flex between wrap gap12" style="margin-bottom:12px"><span class="tag ${valid.warnOnly?'orange':'green'}">${valid.warnOnly ? valid.msg : `首发 ${lineupCount} 人 · 替补 ${benchCount} 人`}</span><span class="tag">联赛强度：AI 执行力 ${TIER_DIFFICULTY_LABEL(c.tier)}</span>${c.promotedSeason===G.season.number&&G.season.week<=8?'<span class="tag orange">升班马适应期 · 执行力 -10%</span>':''}<span class="tag">比赛约 3 分钟 · 可冒险跳过</span></div>
    <div class="detail-grid">
      <div><div class="edge-box"><div class="eh"><span>战术对位</span><span class="${edge.side==='good'?'green':edge.side==='bad'?'red':'gold'}">${edge.label}</span></div><div class="ed">${tacticEdgeExplanation(edge)}</div><div class="mt-1" style="margin-top:6px;font-size:10px;color:var(--muted)">我方：${ATTACK_STYLES[c.tactics.attack]?.name || '均衡'} · ${DEFENSE_STYLES[c.tactics.defense]?.name || '均衡'} · ${TEMPO_STYLES[c.tactics.tempo]?.name || '中节奏'}<br>对手倾向：${ATTACK_STYLES[opp.tactics.attack]?.name || '均衡'} · ${DEFENSE_STYLES[opp.tactics.defense]?.name || '均衡'}</div></div>
        <div class="weather-line"><span>天气：<b>${weather.name}</b></span><span>传球影响：<b>${weather.pass ? (weather.pass*100).toFixed(1)+'%' : '无'}</b></span><span>体能消耗：<b>${weather.stamina ? '+'+(weather.stamina*100).toFixed(0)+'%' : '正常'}</b></span></div>
        <div class="tactic-note" style="margin-top:10px">${esc(weather.desc)}</div>
      </div>
      <div><div class="stat-block-title">赛前训话</div><div class="team-talk-grid">${[['motivate','激励进攻'],['calm','稳住防线'],['free','自由发挥']].map(([k,n])=>`<button class="talk-btn ${matchSetupState.teamTalk===k?'active':''}" data-action="prematch-talk" data-key="${k}">${n}</button>`).join('')}</div><div class="xsmall faint" style="margin-top:7px">训话只会影响本场比赛，不能反复使用。激励会提高进攻欲望、增加体能消耗；稳住防线会降低冒险。</div>
        <div class="hairline"></div><div class="stat-block-title">对手情报</div><div class="opponent-report"><div class="report-cell"><div class="k">近况</div><div class="v">${formPills(currentFormFor(opp.id,5)) || '—'}</div></div><div class="report-cell"><div class="k">联赛排名</div><div class="v">${computeStandings(opp.tier).find(r=>r.clubId===opp.id)?.position || '—'} / 12</div></div><div class="report-cell"><div class="k">危险球员</div><div class="v">${esc(oppStars[0]?.name || '—')}</div></div><div class="report-cell"><div class="k">对手能力</div><div class="v">${Math.round(teamPower(opp.id))}</div></div></div><div class="xsmall faint" style="margin-top:6px">对手预计使用 ${opp.formation}，但你无法完全确定其临场调整。</div>
      </div>
    </div>
    <div class="hairline"></div><div class="flex between wrap gap8"><div class="xsmall faint">比赛中可以暂停、换人、调整战术。冒险跳过会由助教代管，结果立即结算，但全队会额外消耗体能并增加受伤风险。</div><div class="flex gap6"><button class="btn ghost sm" data-action="close-match-setup">返回</button><button class="btn ghost sm" data-action="nav" data-screen="squad">调整阵容</button><button class="btn danger sm" data-action="risk-skip-match" title="助教代管，结果立即结算；额外消耗体能并有受伤风险">冒险跳过</button><button class="btn primary" data-action="start-match">开始比赛</button></div></div>`,
    actions: '', wide: true, closable: true,
  });
}
function closeMatchSetup() { closeModal(); matchSetupState = null; }
function setPrematchTalk(key) {
  if (!matchSetupState) return;
  matchSetupState.teamTalk = key;
  // 只切换按钮状态，不重建整个赛前弹窗，避免点一次闪一次。
  $$('.talk-btn[data-action="prematch-talk"]').forEach(btn => {
    const on = btn.dataset.key === key;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

/* ---------------- 比赛引擎 ---------------- */
class MatchEngine {
  constructor(cfg) {
    this.fixture = cfg.fixture;
    this.userClub = cfg.userClub;
    this.oppClub = cfg.oppClub;
    this.userIsHome = cfg.fixture.home === cfg.userClub.id;
    this.weather = cfg.weather || WEATHERS[0];
    this.teamTalk = cfg.teamTalk || 'calm';
    this.time = 0;
    this.simTime = 0;
    this.half = 1;
    this.addedTime = randInt(1, 4);
    this.addedTime2 = randInt(2, 5);
    this.paused = false;
    this.finished = false;
    this.halfTime = false;
    this.active = true;
    this.userTalkUsed = false;
    this.userTalk = null;
    this.restartTimer = 0.8;
    this.restartState = null;
    this._settling = false;
    this.last = performance.now();
    this.kickoffSide = chance(.5) ? 'left' : 'right';
    this.stats = {
      left: { poss: 0, shots: 0, onTarget: 0, xg: 0, passes: 0, passesOk: 0, fouls: 0, corners: 0, yellow: 0, red: 0, saves: 0, tackles: 0, dribbles: 0, interceptions: 0, offsides: 0 },
      right: { poss: 0, shots: 0, onTarget: 0, xg: 0, passes: 0, passesOk: 0, fouls: 0, corners: 0, yellow: 0, red: 0, saves: 0, tackles: 0, dribbles: 0, interceptions: 0, offsides: 0 },
    };
    this.commentary = [];
    this.goalEvents = [];
    this.allPlayers = [];
    this.cardEvents = [];
    this.finishCallback = null;
    this.flash = null;
    this._flashSeq = 0;
    this.lastPassLine = null;
    this.penaltyState = null;
    this.ball = { x: 52.5, y: 34, vx: 0, vy: 0, z: 0, vz: 0, owner: null, lastTouch: null, lastTouchTeam: null, passMeta: null, shotMeta: null, noControlUntil: 0, corner: false, outCooldown: 0, indirectFreeKick: false, freeKick: false, offsideExemptTeam: null, offsideExemptUntil: 0, headerLockUntil: 0, lastHeaderAt: -99, headerContext: null, trail: [], trailActiveUntil: 0 };
    this.teams = {
      left: { side: 'left', dir: 1, club: cfg.userClub, isUser: true, score: 0, tactics: { ...cfg.userClub.tactics }, formation: cfg.userClub.formation, players: [], bench: [], subsUsed: 0, phase: 'defense', markAssignments: {}, presser: null, coverPlayer: null, talk: cfg.teamTalk || 'calm', home: this.userIsHome },
      right: { side: 'right', dir: -1, club: cfg.oppClub, isUser: false, score: 0, tactics: { ...cfg.oppClub.tactics }, formation: cfg.oppClub.formation, players: [], bench: [], subsUsed: 0, phase: 'defense', markAssignments: {}, presser: null, coverPlayer: null, talk: 'calm', home: !this.userIsHome },
    };
    this.buildTeams(cfg);
    this.participants = this.allPlayers.slice();
    this.tacticalEdgeLeft = tacticalPreview(cfg.userClub.tactics, cfg.oppClub.tactics).score;
    this.setKickoff(this.kickoffSide);
    this.addComment(0, `${this.userClub.name} 对阵 ${this.oppClub.name}。${this.userIsHome?'主队':'客队'}球迷的声浪在球场里回荡。`, 'general');
    this.addComment(0, `天气：${this.weather.name}。${this.weather.desc}`, 'general');
    this.userTeamTalk();
    this.lastTickStatsSecond = 0;
    this.lastInjuryCheck = 0;
    this.lastAutoSub = 0;
    this.raf = null;
  }
  buildTeams(cfg) {
    const makePlayerFor = (p, slot, side, slotIndex) => {
      const team = this.teams[side];
      const baseX = side === 'left' ? 2 + slot.x * 100 : 103 - slot.x * 100;
      const baseY = slot.y * 68;
      const mp = {
        pid: p.id, p, name: p.name, number: p.number || slotIndex + 1, pos: p.pos, role: slot.pos, slotIndex,
        side, team, isUser: team.isUser, x: baseX, y: baseY, baseX, baseY,
        vx: 0, vy: 0, targetX: baseX, targetY: baseY, dir: team.dir,
        stamina: clamp(p.fitness ?? 90, 18, 100), startStamina: clamp(p.fitness ?? 90, 18, 100),
        onPitch: true, sentOff: false, injuryNow: false, injuryDays: 0, started: true, minutes: 0,
        yellow: 0, red: 0, goals: 0, assists: 0, shots: 0, keyPasses: 0, tackles: 0, saves: 0, conceded: 0,
        rating: 6.2, decisionTimer: rand() * .2, tackleCd: 0, dive: null, touches: 0, lastAction: '',
        isGK: slot.pos === 'GK', runPhase: rand() * 6.28, matchTreat: false,
        labelShift: (p.number || slotIndex + 1) % 2 === 1 ? 10 : 0,
      };
      mp.team.players.push(mp);
      this.allPlayers.push(mp);
      return mp;
    };
    // 用户队
    const uSlots = FORMATION_SLOTS[cfg.userClub.formation] || FORMATION_SLOTS['4-4-2'];
    let userLineup = cfg.userClub.lineup || [];
    userLineup.forEach((entry, i) => {
      const p = player(entry.playerId);
      if (!p) return;
      const slot = uSlots[i] || { pos: entry.slot || p.pos, x: .5, y: .5 };
      makePlayerFor(p, slot, 'left', i);
    });
    // 补足（理论上不会发生）
    if (this.teams.left.players.length < 11) {
      for (const p of availableSquadPlayers(cfg.userClub)) {
        if (this.teams.left.players.some(mp => mp.pid === p.id)) continue;
        if (this.teams.left.players.length >= 11) break;
        makePlayerFor(p, { pos: p.pos, x: .4, y: .5 }, 'left', this.teams.left.players.length);
      }
    }
    // 对手
    const oppSlots = FORMATION_SLOTS[cfg.oppClub.formation] || FORMATION_SLOTS['4-4-2'];
    const oppLineup = cfg.oppLineup || bestLineupForClub(cfg.oppClub, G.players, true);
    oppLineup.forEach((entry, i) => {
      const p = player(entry.playerId);
      if (!p) return;
      const slot = oppSlots[i] || { pos: entry.slot || p.pos, x: .5, y: .5 };
      makePlayerFor(p, slot, 'right', i);
    });
    if (this.teams.right.players.length < 11) {
      for (const p of availableSquadPlayers(cfg.oppClub)) {
        if (this.teams.right.players.some(mp => mp.pid === p.id)) continue;
        if (this.teams.right.players.length >= 11) break;
        makePlayerFor(p, { pos: p.pos, x: .4, y: .5 }, 'right', this.teams.right.players.length);
      }
    }
    // 替补
    const userBenchIds = (cfg.userClub.bench || []).filter(id => {
      const p = player(id);
      return p && p.injuryDays <= 0 && p.suspension <= 0 && !this.teams.left.players.some(mp => mp.pid === id);
    }).slice(0, 7);
    this.teams.left.bench = userBenchIds.map(id => this.makeBenchPlayer(player(id), 'left'));
    const oppBenchIds = (cfg.oppClub.bench || []).slice(0, 7);
    const oppBench = oppBenchIds.map(id => player(id)).filter(p => p && !this.teams.right.players.some(mp => mp.pid === p.id));
    this.teams.right.bench = oppBench.map(p => this.makeBenchPlayer(p, 'right'));
    this.gk = {
      left: this.teams.left.players.find(mp => mp.isGK) || null,
      right: this.teams.right.players.find(mp => mp.isGK) || null,
    };
  }
  makeBenchPlayer(p, side) {
    return { pid: p.id, p, name: p.name, number: p.number || 0, pos: p.pos, role: p.pos, side, isBench: true, stamina: clamp(p.fitness ?? 90, 10, 100), used: false };
  }
  userTeamTalk() {
    const t = this.teams.left, talk = this.teamTalk;
    if (talk === 'motivate') { t.talkMod = { attack: .05, defense: -.025, stamina: .04 }; this.addComment(0, '你在更衣室里提高了音量。球员们明显被点燃了，但也可能压得太靠前。', 'general'); }
    else if (talk === 'calm') { t.talkMod = { attack: -.01, defense: .035, stamina: 0 }; this.addComment(0, '你要求球队保持耐心，先把阵型站稳。', 'general'); }
    else { t.talkMod = { attack: .015, defense: .005, stamina: -.01 }; this.addComment(0, '你让球员自由发挥，享受比赛。更衣室里响起了零散的笑声。', 'general'); }
    t.talkMod = t.talkMod || { attack: 0, defense: 0, stamina: 0 };
  }
  addComment(minute, text, type = 'general') {
    this._commentSeq = (this._commentSeq || 0) + 1;
    this.commentary.unshift({ id: this._commentSeq, minute: Math.floor(minute), text, type });
    if (this.commentary.length > 90) this.commentary.length = 90;
  }
  addFlash(big, small, ms = 1800) {
    this.flash = { id: ++this._flashSeq, big, small, ms, until: performance.now() + ms };
  }
  setKickoff(side) {
    this._settling = false;
    const team = this.teams[side];
    let taker = this._pendingKickoffTakerId ? team.players.find(mp => mp.onPitch && mp.pid === this._pendingKickoffTakerId) : null;
    this._pendingKickoffTakerId = null;
    if (!taker) taker = this.pickKickoffTaker(team);
    this.beginRestart(team, 52.5, 34, 'kickoff', { taker });
  }
  pickKickoffTaker(team) {
    const options = team.players.filter(mp => mp.onPitch && !mp.isGK);
    if (!options.length) return team.players.find(mp => mp.onPitch) || null;
    return options.slice().sort((a, b) => dist(a.x, a.y, 52.5, 34) - dist(b.x, b.y, 52.5, 34))[0];
  }
  prepareKickoffWalk(side) {
    const team = this.teams[side];
    const taker = this.pickKickoffTaker(team);
    this._pendingKickoffTakerId = taker?.pid || null;
    this.applyKickoffSettleTargets();
  }
  applyKickoffSettleTargets() {
    for (const mp of this.allPlayers) {
      if (!mp.onPitch) continue;
      mp.targetX = mp.baseX; mp.targetY = mp.baseY;
      mp.restartWalkFactor = 1;
    }
    if (!this._pendingKickoffTakerId) return;
    const taker = this.allPlayers.find(mp => mp.onPitch && mp.pid === this._pendingKickoffTakerId);
    if (taker) {
      taker.targetX = 52.5; taker.targetY = 34;
      taker.restartWalkFactor = .9;
    }
  }
  beginRestart(team, x, y, type, opts = {}) {
    let taker = opts.taker || this.nearestPlayerOfTeam(team, x, y, type !== 'goalkick');
    if (!taker && type !== 'goalkick') taker = this.nearestPlayerOfTeam(team, x, y);
    this.restartState = { type, team, taker, ballX: x, ballY: y, elapsed: 0, wait: opts.wait ?? 1, corner: !!opts.corner, indirect: !!opts.indirect, wallPlayers: [] };
    this.restartTimer = 0;
    this._settling = false;
    this.ball.owner = null;
    this.ball.x = x; this.ball.y = y;
    this.ball.vx = 0; this.ball.vy = 0; this.ball.z = 0; this.ball.vz = 0;
    this.ball.passMeta = null; this.ball.shotMeta = null; this.ball.corner = !!opts.corner;
    this.ball.indirectFreeKick = false;
    this.ball.freeKick = false;
    this.ball.headerLockUntil = 0; this.ball.lastHeaderAt = -99;
    this.ball.trail = []; this.ball.trailActiveUntil = 0;
    // 只有角球/任意球等死球传中才允许争顶；开放式高球不再自动触发头球。
    this.ball.headerContext = type === 'corner' ? 'corner' : type === 'freekick' ? 'freekick' : null;
    this.ball.offsideExemptTeam = null; this.ball.offsideExemptUntil = 0;
    this.ball.lastTouch = null; this.ball.lastTouchTeam = null;
    this.snapRestartPositions(team, type, x, y, taker);
  }
  bestSetPieceTaker(team, x, y) {
    const goalX = team.side === 'left' ? 105 : 0;
    const shootingRange = dist(x, y, goalX, 34) < 33;
    const options = team.players.filter(mp => mp.onPitch && !mp.isGK);
    if (!options.length) return null;
    return options.slice().sort((a, b) => {
      const score = p => {
        const s = shootingRange
          ? p.p.attrs.sho * 1.25 + p.p.attrs.pas * .32 + p.p.attrs.vis * .28
          : p.p.attrs.pas * 1.1 + p.p.attrs.vis * .5 + p.p.attrs.sho * .18;
        return s + (p.p.traits?.includes('long_shot') ? 7 : 0);
      };
      return score(b) - score(a);
    })[0];
  }
  bestCornerTaker(team) {
    const options = team.players.filter(mp => mp.onPitch && !mp.isGK);
    if (!options.length) return null;
    return options.slice().sort((a, b) => {
      const score = p => {
        const wide = ['LB', 'RB', 'LM', 'RM', 'LW', 'RW'].includes(p.role) ? 18 : 0;
        return p.p.attrs.pas * 1.2 + p.p.attrs.vis * .55 + wide;
      };
      return score(b) - score(a);
    })[0];
  }
  freeKickLayout(team, opponent, x, y) {
    const attackGoalX = team.side === 'left' ? 105 : 0;
    const distGoal = dist(x, y, attackGoalX, 34);
    const angle = Math.abs(y - 34);
    // 只有进入前场、且在中路有射门角度的直接任意球才排人墙。
    if (distGoal > 33 || angle > 28) return null;
    const wallCount = distGoal < 24 && angle < 15 ? 4 : distGoal < 31 ? 3 : 2;
    // 人墙封近角，门将守远角。近角是离球更近的那根门柱。
    const nearPostY = y < 34 ? 30.34 : 37.66;
    const aimY = nearPostY + (34 - nearPostY) * .08;
    const vx = attackGoalX - x, vy = aimY - y;
    const vd = Math.hypot(vx, vy) || 1;
    const wallDist = Math.min(9.15, Math.max(4.5, vd - 2.2));
    const wx = x + vx / vd * wallDist;
    const wy = y + vy / vd * wallDist;
    const perpX = -vy / vd, perpY = vx / vd;
    const wallPlayers = opponent.players
      .filter(mp => mp.onPitch && !mp.isGK && !['ST', 'SS'].includes(mp.role))
      .sort((a, b) => (b.p.height + (b.p.attrs.str || 0) * .12 + (b.p.attrs.def || 0) * .08) - (a.p.height + (a.p.attrs.str || 0) * .12 + (a.p.attrs.def || 0) * .08))
      .slice(0, wallCount);
    const wallSlots = new Map();
    wallPlayers.forEach((mp, i) => {
      const off = (i - (wallPlayers.length - 1) / 2) * 1.4;
      wallSlots.set(mp.pid, { x: clamp(wx + perpX * off, 1.2, 103.8), y: clamp(wy + perpY * off, 1.2, 66.8) });
    });
    // 进攻方在禁区里安排 5 个抢点球员，防守方除人墙外逐个盯防。
    const boxAttackers = team.players
      .filter(mp => mp.onPitch && !mp.isGK && ['ST', 'SS', 'CB', 'AM', 'LW', 'RW', 'LM', 'RM'].includes(mp.role))
      .sort((a, b) => (b.p.height + (b.p.attrs.str || 0) * .1) - (a.p.height + (a.p.attrs.str || 0) * .1))
      .slice(0, 5);
    const atkSlots = new Map(boxAttackers.map((mp, i) => [mp.pid, {
      x: clamp(attackGoalX - team.dir * (6 + (i % 2) * 2.3), 2, 103),
      y: clamp(24 + i * 6, 3, 65),
    }]));
    const freeDefenders = opponent.players.filter(mp => mp.onPitch && !mp.isGK && !wallSlots.has(mp.pid));
    const defSlots = new Map();
    for (const att of boxAttackers) {
      const attSlot = atkSlots.get(att.pid) || { x: att.x, y: att.y };
      let best = null, bd = Infinity;
      for (const def of freeDefenders) {
        if (defSlots.has(def.pid)) continue;
        const d = dist(def.x, def.y, att.x, att.y);
        if (d < bd) { bd = d; best = def; }
      }
      if (best) {
        defSlots.set(best.pid, {
          x: clamp(attSlot.x + team.dir * 1.4, 2, 103),
          y: clamp(attSlot.y, 3, 65),
        });
      }
    }
    const gkY = clamp(34 + (34 - nearPostY) * .55, 30.7, 37.3);
    return { wallSlots, atkSlots, defSlots, gkY, wallPlayers };
  }
  snapRestartPositions(team, type, x, y, taker) {
    const opponent = this.getOpponent(team);
    const attackGoalX = team.side === 'left' ? 105 : 0;
    const boxAttackers = team.players.filter(mp => mp.onPitch && mp !== taker && !mp.isGK && ['ST','SS','CB','AM','LW','RW','LM','RM'].includes(mp.role)).slice(0, 5);
    const atkSlots = new Map(boxAttackers.map((mp, i) => [mp.pid, { x: attackGoalX - team.dir * (6 + (i % 2) * 2.5), y: 24 + i * 6 }]));
    // 角球防守：按防守能力挑 5 人，逐个贴住禁区里的进攻球员，而不是站成一排看球。
    const boxDefenders = opponent.players
      .filter(mp => mp.onPitch && !mp.isGK && !['ST', 'SS'].includes(mp.role))
      .sort((a, b) => (b.p.attrs.def + b.p.attrs.str * .25 + b.p.height * .08) - (a.p.attrs.def + a.p.attrs.str * .25 + a.p.height * .08))
      .slice(0, 5);
    const defSlots = new Map();
    const freeDefs = boxDefenders.slice();
    for (const att of boxAttackers) {
      const attSlot = atkSlots.get(att.pid) || { x: att.x, y: att.y };
      let best = null, bd = Infinity;
      for (const def of freeDefs) {
        const d = dist(def.x, def.y, att.x, att.y);
        if (d < bd) { bd = d; best = def; }
      }
      if (best) {
        defSlots.set(best.pid, { x: clamp(attSlot.x + team.dir * 1.4, 2, 103), y: clamp(attSlot.y, 3, 65) });
        freeDefs.splice(freeDefs.indexOf(best), 1);
      }
    }
    // 直接任意球：排人墙、门将守远角，禁区内攻防球员各自落位。
    const freeKick = type === 'freekick' && !this.restartState?.indirect
      ? this.freeKickLayout(team, opponent, x, y)
      : null;
    if (freeKick && this.restartState) {
      this.restartState.wallPlayers = freeKick.wallPlayers.map(mp => mp.pid);
    }
    for (const mp of this.allPlayers) {
      if (!mp.onPitch) continue;
      let px = mp.baseX, py = mp.baseY;
      if (freeKick) {
        const slot = freeKick.wallSlots.get(mp.pid)
          || (mp.team === team ? freeKick.atkSlots.get(mp.pid) : freeKick.defSlots.get(mp.pid));
        if (slot) { px = slot.x; py = slot.y; }
      }
      if (type === 'kickoff') {
        // 中圈开球时双方必须在本方半场。
        px = mp.team.side === 'left' ? Math.min(px, 51.8) : Math.max(px, 53.2);
      } else if (type === 'corner') {
        const slot = mp.team === team ? atkSlots.get(mp.pid) : defSlots.get(mp.pid);
        if (slot) { px = slot.x; py = slot.y; }
      }
      // 门将始终站在本方球门线附近；球门球时再由 taker 覆盖到球点。
      if (mp.isGK) {
        px = (mp.team.side === 'left' ? 0 : 105) + mp.team.dir * 1.7;
        py = freeKick && mp.team === opponent ? freeKick.gkY : 34;
      }
      if (mp === taker) {
        px = x - team.dir * .5;
        py = y;
      }
      mp.x = clamp(px, .8, 104.2); mp.y = clamp(py, .8, 67.2);
      mp.vx = 0; mp.vy = 0;
      mp.targetX = mp.x; mp.targetY = mp.y;
    }
  }
  updateRestart(dt, paused = false) {
    const r = this.restartState;
    if (!r) return;
    if (!r.taker || !r.taker.onPitch) {
      r.taker = this.nearestPlayerOfTeam(r.team, r.ballX, r.ballY, r.type !== 'goalkick');
      if (!r.taker && r.type !== 'goalkick') r.taker = this.nearestPlayerOfTeam(r.team, r.ballX, r.ballY);
      if (!r.taker) { this.restartState = null; return; }
      r.taker.x = clamp(r.ballX - r.team.dir * .5, .8, 104.2);
      r.taker.y = clamp(r.ballY, .8, 67.2);
      r.taker.vx = 0; r.taker.vy = 0;
      r.taker.targetX = r.taker.x; r.taker.targetY = r.taker.y;
    }
    if (paused) return;
    r.elapsed += dt;
    if (r.elapsed >= (r.wait || 1)) this.takeRestart();
  }
  takeRestart() {
    const r = this.restartState;
    if (!r) return;
    const taker = r.taker;
    this.restartState = null;
    if (!taker || !taker.onPitch) return;
    if (r.type === 'throwin') {
      this.takeThrowIn(taker);
      return;
    }
    this.ball.owner = taker;
    this.ball.x = taker.x + taker.dir * .4;
    this.ball.y = taker.y;
    if (r.type === 'corner') {
      this.ball.x = r.team.side === 'left' ? 104.1 : .9;
      this.ball.y = clamp(r.ballY, 1.4, 66.6);
    }
    this.ball.lastTouch = taker; this.ball.lastTouchTeam = r.team;
    this.ball.corner = r.corner;
    this.ball.indirectFreeKick = !!r.indirect;
    this.ball.freeKick = r.type === 'freekick';
    // 人墙在球被踢出后的半秒内保持站位，避免刚排好就四散。
    if (this.ball.freeKick && r.wallPlayers?.length) {
      for (const pid of r.wallPlayers) {
        const wall = this.findPlayerMatch(pid);
        if (wall) wall.setPieceHoldUntil = this.simTime + .55;
      }
    }
    const offsideExempt = ['throwin', 'goalkick', 'corner'].includes(r.type);
    this.ball.offsideExemptTeam = offsideExempt ? r.team : null;
    this.ball.offsideExemptUntil = offsideExempt ? this.simTime + 2.5 : 0;
    this.ball.noControlUntil = this.simTime + .12;
    taker.targetX = taker.x; taker.targetY = taker.y;
    taker.decisionTimer = .04;
    this.restartTimer = .16;
  }
  takeThrowIn(taker) {
    const team = taker.team;
    const mp = taker;
    const pass = this.bestPassOption(mp);
    let target = pass?.target || this.nearestPlayerOfTeam(team, mp.x + team.dir * 14, mp.y, true);
    let tx, ty;
    if (target) {
      const rawDist = dist(mp.x, mp.y, target.x, target.y);
      const flight = clamp(rawDist / 15, .35, 1.15);
      tx = target.x + (target.vx || 0) * flight * .45;
      ty = target.y + (target.vy || 0) * flight * .45;
    } else {
      tx = clamp(mp.x + team.dir * 14, 3, 102);
      ty = clamp(mp.y + (34 - mp.y) * .18, 3, 65);
    }
    const rawDist = dist(mp.x, mp.y, tx, ty);
    const power = clamp(10 + rawDist * .58, 11, 21);
    const dx = tx - mp.x, dy = ty - mp.y;
    const d = Math.hypot(dx, dy) || 1;
    const angle = Math.atan2(dy, dx) + normal(0, .018);
    this.ball.owner = null;
    this.ball.x = clamp(mp.x + team.dir * .4, .9, 104.1);
    this.ball.y = clamp(mp.y, 1.2, 66.8);
    this.ball.vx = Math.cos(angle) * power;
    this.ball.vy = Math.sin(angle) * power;
    this.ball.z = 1.8; this.ball.vz = 2.6;
    this.ball.lastTouch = mp; this.ball.lastTouchTeam = team;
    this.ball.passMeta = target ? { from: mp, intended: target, originX: mp.x, originY: mp.y, type: 'throwin', startTime: this.time, createdAt: this.simTime, offside: null } : null;
    this.ball.shotMeta = null;
    this.ball.corner = false;
    this.ball.headerContext = null;
    this.ball.indirectFreeKick = false;
    this.ball.offsideExemptTeam = team;
    this.ball.offsideExemptUntil = this.simTime + 2.5;
    this.ball.noControlUntil = this.simTime + .18;
    this.ball.trail = [];
    this.ball.trailActiveUntil = this.simTime + 1.2;
    mp.touches++;
    mp.lastAction = 'throwin';
    this.stats[team.side].passes++;
    this.addComment(Math.floor(this.time), `${mp.name} 手抛球${target ? `找 ${target.name}` : '掷入前场'}。`, 'general');
    this.restartTimer = .16;
  }
  start(onHalf, onFinish) {
    this.onHalf = onHalf;
    this.onFinish = onFinish;
    this.last = performance.now();
    const loop = (now) => {
      if (!this.active) return;
      const dtReal = Math.min(.05, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      if (!this.paused && !this.halfTime && !this.finished) {
        let remaining = dtReal;
        const step = 1 / 60;
        while (remaining > 0) {
          const s = Math.min(step, remaining);
          this.step(s);
          remaining -= s;
        }
      } else if (!this.finished && (this.restartState || this._settling || this.halfTime)) {
        // 停表时，死球/中场休息阶段仍然让球员走位：发球人走向球，其他人回到阵型。
        if (this.restartState) this.updateRestart(dtReal, true);
        else this.updatePlayerMovement(dtReal, true);
      }
      this.draw();
      if (matchEngine === this && now - (this._uiLast || 0) > 160) {
        this._uiLast = now;
        updateMatchScoreboard();
        updateMatchSide(false);
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() {
    this.active = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
  }
  step(dt) {
    if (this.finished) return;
    this.simTime += dt;
    if (this.penaltyState) {
      this.penaltyState.timer -= dt;
      if (this.penaltyState.timer <= 0) {
        const team = this.penaltyState.team;
        this.penaltyState = null;
        this.takePenalty(team);
      }
      this.updatePlayerMovement(dt, true);
      return;
    }
    if (this.restartState) {
      this.updateRestart(dt, false);
      return;
    }
    if (this.restartTimer > 0) {
      this.restartTimer -= dt;
      this.updatePlayerMovement(dt, true);
      if (this.restartTimer <= 0 && this._pendingKickoff) {
        const side = this._pendingKickoff;
        this._pendingKickoff = null;
        this.setKickoff(side);
      }
      this.updateBall(dt);
      return;
    }
    // 时间
    this.time += dt * .5;
    if (this.half === 1 && this.time >= 45) {
      this.time = 45;
      this.halfTime = true;
      this.paused = true;
      this._settling = true;
      this.prepareKickoffWalk(this.kickoffSide === 'left' ? 'right' : 'left');
      this.addComment(45, '上半场结束。球员们走向球员通道。', 'general');
      if (this.onHalf) this.onHalf(this);
      return;
    }
    if (this.half === 2 && this.time >= 90 + this.addedTime2) {
      this.endMatch();
      return;
    }
    // 半场开始附加时间提示
    if (this.half === 1 && this.time >= 45 + this.addedTime) { /* handled by half time at 45 */ }
    if (this.half === 2 && this.time >= 90 && !this._announcedStoppage) {
      this._announcedStoppage = true;
      this.addComment(90, `第四官员示意补时 ${this.addedTime2} 分钟。`, 'general');
    }
    // 体力、球员分钟
    const staminaDrain = this.staminaDrainFactor();
    for (const mp of this.allPlayers) {
      if (!mp.onPitch) continue;
      mp.minutes += dt * .5;
      let drain = .047 + (mp.isGK ? -.026 : 0) + this.weather.stamina * .55;
      if (mp.vx * mp.vx + mp.vy * mp.vy > 30) drain += .015;
      if (mp.team.tactics.defense === 'press') drain += .007;
      if (mp.team.tactics.tempo === 'fast') drain += .005;
      if (mp.p.traits?.includes('ironman')) drain *= .86;
      if (mp.p.traits?.includes('injury_prone')) drain *= 1.08;
      mp.stamina = clamp(mp.stamina - drain * staminaDrain * dt * 3.2, 8, 100);
    }
    // 球权与控球统计
    if (this.ball.owner) { this.stats[this.ball.owner.side].poss += dt; }
    else if (this.ball.lastTouchTeam) this.stats[this.ball.lastTouchTeam.side].poss += dt;
    // 决策
    for (const mp of this.allPlayers) {
      if (!mp.onPitch) continue;
      mp.decisionTimer -= dt;
      if (mp.decisionTimer <= 0) {
        mp.decisionTimer = .055 + rand() * .075;
        this.think(mp);
      }
      if (mp.tackleCd > 0) mp.tackleCd -= dt;
    }
    // 战术与盯人更新
    this.updateTeamStructure();
    // 移动
    this.updatePlayerMovement(dt, false);
    // 抢断
    this.handleTackles(dt);
    // 球体运动
    this.updateBall(dt);
    // 伤情和换人检查
    this.checkInjuries(dt);
    this.checkAISubs();
  }
  staminaDrainFactor() { return 1; }
  updateTeamStructure() {
    const ownerTeam = this.ball.owner?.team || this.ball.lastTouchTeam;
    for (const side of ['left', 'right']) {
      const team = this.teams[side];
      team.phase = ownerTeam === team ? 'attack' : 'defense';
      if (this.ball.owner?.team === team) team.phase = 'attack';
      if (this.ball.owner && this.ball.owner.team !== team) team.phase = 'defense';
    }
    // 每 0.25s 分配盯人（近似）
    this._structureTimer = (this._structureTimer || 0) - (1 / 60);
    if (this._structureTimer <= 0) {
      this._structureTimer = .28;
      for (const side of ['left', 'right']) this.assignMarks(side);
    }
  }
  assignMarks(side) {
    const team = this.teams[side];
    const opp = side === 'left' ? this.teams.right : this.teams.left;
    const defenders = team.players.filter(mp => mp.onPitch && !mp.isGK && !['ST','SS'].includes(mp.role));
    const attackers = opp.players.filter(mp => mp.onPitch && !mp.isGK);
    const ball = this.ball;
    const goalX = side === 'left' ? 0 : 105;
    // 压迫者优先选择能站到持球人前进线路前方的人，而不是永远从背后追。
    const containX = ball.x - team.dir * 2.2;
    let presser = null, pd = Infinity;
    for (const mp of team.players) {
      if (!mp.onPitch || mp.isGK) continue;
      const d = dist(mp.x, mp.y, containX, ball.y) * .72 + dist(mp.x, mp.y, ball.x, ball.y) * .28;
      let roleBonus = ['ST','SS'].includes(mp.role) ? (team.tactics.defense === 'press' ? -1.5 : 8) : 0;
      roleBonus += ['AM','LW','RW','LM','RM'].includes(mp.role) ? (team.tactics.defense === 'press' ? -1 : 3) : 0;
      if (d + roleBonus < pd) { pd = d + roleBonus; presser = mp; }
    }
    team.presser = presser;
    // 第二防守人站在球与球门之间，负责封线路和保护压迫者身后。
    let cover = null, cd = Infinity;
    for (const def of defenders) {
      if (def === presser) continue;
      const d = dist(def.x, def.y, containX, ball.y) * .7 + dist(def.x, def.y, ball.x, ball.y) * .3;
      if (d < cd) { cd = d; cover = def; }
    }
    const coverRange = team.tactics.defense === 'press' ? 26 : team.tactics.defense === 'low' ? 15 : 21;
    team.coverPlayer = cover && cd < coverRange ? cover : null;
    const used = new Set([presser?.pid, team.coverPlayer?.pid].filter(Boolean));
    const marks = {};
    // 禁区里的进攻球员优先；然后再按离球门/球的距离选择最有威胁的人。
    const boxThreats = attackers.filter(a => this.isInBox(a, a.team));
    const boxSet = new Set(boxThreats.map(a => a.pid));
    const otherThreats = attackers.filter(a => !boxSet.has(a.pid) && (dist(a.x, a.y, goalX, 34) < 48 || dist(a.x, a.y, ball.x, ball.y) < 24));
    const threats = [...boxThreats, ...otherThreats].sort((a, b) => {
      const da = Math.hypot(goalX - a.x, 34 - a.y) + dist(a.x, a.y, ball.x, ball.y) * .25;
      const db = Math.hypot(goalX - b.x, 34 - b.y) + dist(b.x, b.y, ball.x, ball.y) * .25;
      return da - db;
    }).slice(0, 6);
    for (const att of threats) {
      let best = null, bd = Infinity;
      for (const def of defenders) {
        if (used.has(def.pid)) continue;
        const d = dist(def.x, def.y, att.x, att.y);
        if (d < bd) { bd = d; best = def; }
      }
      if (best && bd < 28) { used.add(best.pid); marks[best.pid] = att.pid; }
    }
    team.markAssignments = marks;
  }
  getOpponent(team) { return team.side === 'left' ? this.teams.right : this.teams.left; }
  findPlayerMatch(id) { return this.allPlayers.find(mp => mp.pid === id && mp.onPitch) || null; }
  nearestOpponent(mp, maxDist = 999, excludeGk = false) {
    let best = null, bd = maxDist;
    for (const op of this.allPlayers) {
      if (!op.onPitch || op.team === mp.team) continue;
      if (excludeGk && op.isGK) continue;
      const d = dist(mp.x, mp.y, op.x, op.y);
      if (d < bd) { bd = d; best = op; }
    }
    return { player: best, dist: bd };
  }
  oneOnOneInfo(mp) {
    const team = mp.team;
    const goalX = team.side === 'left' ? 105 : 0;
    const distGoal = dist(mp.x, mp.y, goalX, 34);
    const gk = this.gk[team.side === 'left' ? 'right' : 'left'];
    if (!gk || !gk.onPitch || Math.abs(mp.y - 34) > 22 || distGoal > 32) {
      return { oneOnOne: false, distGoal, gkDist: 99, blockers: 0 };
    }
    const gkDist = dist(mp.x, mp.y, gk.x, gk.y);
    // 身后追防的后卫不取消单刀；只有贴到身前/身侧的后卫才会。
    let closeAhead = 99;
    for (const op of this.allPlayers) {
      if (!op.onPitch || op.team === team || op.isGK) continue;
      if (dist(op.x, op.y, goalX, 34) > distGoal + 4) continue;
      closeAhead = Math.min(closeAhead, dist(mp.x, mp.y, op.x, op.y));
    }
    if (closeAhead < 5.2) {
      return { oneOnOne: false, distGoal, gkDist, blockers: 1 };
    }
    // 检查射门线路上是否还有能封堵的后卫；身后追防的后卫不阻止单刀成立。
    const dx = goalX - mp.x, dy = 34 - mp.y;
    const len2 = dx * dx + dy * dy || 1;
    let blockers = 0;
    for (const op of this.allPlayers) {
      if (!op.onPitch || op.team === team || op.isGK) continue;
      if (dist(op.x, op.y, goalX, 34) > distGoal + 2) continue;
      const t = clamp(((op.x - mp.x) * dx + (op.y - mp.y) * dy) / len2, 0, 1);
      const px = mp.x + dx * t, py = mp.y + dy * t;
      if (dist(op.x, op.y, px, py) < 5.5) { blockers++; break; }
    }
    const oneOnOne = blockers === 0 && (distGoal < 30 || gkDist < 20);
    return { oneOnOne, distGoal, gkDist, blockers };
  }
  offsideLineFor(team) {
    const defendGoalX = team.side === 'left' ? 105 : 0;
    const defenders = this.allPlayers.filter(p => p.onPitch && p.team !== team);
    if (defenders.length < 2) return null;
    const sorted = defenders.slice().sort((a, b) => Math.abs(a.x - defendGoalX) - Math.abs(b.x - defendGoalX));
    const secondLast = sorted[1];
    if (!secondLast) return null;
    // 越位线取“倒数第二名防守球员”和“球”中更靠进攻方向的一条。
    const lineX = team.dir > 0 ? Math.max(secondLast.x, this.ball.x) : Math.min(secondLast.x, this.ball.x);
    return { x: lineX, secondLast, defendGoalX, dir: team.dir };
  }
  isOffsideAtPass(from, target) {
    if (!from || !target || !target.onPitch || !from.onPitch) return null;
    const team = from.team;
    if (!team || target.team !== team) return null;
    // 界外球、球门球、角球的第一脚传球不判越位。
    if (this.ball.offsideExemptTeam === team && this.simTime < this.ball.offsideExemptUntil) return null;
    const dir = team.dir;
    if ((target.x - from.x) * dir <= .1) return null;
    if ((target.x - 52.5) * dir <= 0) return null;
    const line = this.offsideLineFor(team);
    if (!line) return null;
    // 目标必须越过越位线（球或倒数第二名防守球员）至少 .35m，才判越位。
    if ((target.x - line.x) * dir <= .35) return null;
    return { player: target, from, spotX: target.x, spotY: target.y };
  }
  pressureOn(mp) {
    let count = 0, total = 0;
    for (const op of this.allPlayers) {
      if (!op.onPitch || op.team === mp.team) continue;
      const d = dist(mp.x, mp.y, op.x, op.y);
      if (d < 7) { count++; total += (7 - d) / 7; }
    }
    return { count, amount: clamp(total * .22, 0, 1) };
  }
  attr(mp, key) {
    let v = mp.p.attrs[key] || 0;
    const stam = clamp(mp.stamina / 100, .2, 1);
    let factor = .68 + .32 * stam;
    factor *= .96 + clamp(mp.p.form || 55, 20, 90) / 1000;
    factor *= .985 + clamp(mp.p.morale ?? 60, 0, 100) / 5000;
    if (mp.injuryNow) factor *= .7;
    if (mp.team.home) factor *= 1.015;
    // 联赛强度：高级别 AI 的执行力小幅提高；加成必须远小于球员能力差，避免能力更强的球队反而踢不过弱队。
    if (!this.friendly && !mp.team.isUser) factor *= aiTierExecutionBonus(mp.team.club.tier);
    // 升班马适应期：刚升级的前 8 周，球队整体执行力下降，容易被打回原形。
    if (!this.friendly && mp.team.isUser && mp.team.club.promotedSeason === G?.season?.number && (G?.season?.week || 1) <= 8) factor *= .9;
    const tactical = (mp.side === 'left' ? this.tacticalEdgeLeft : -this.tacticalEdgeLeft) || 0;
    if (['sho','pas','dri','vis','spd'].includes(key)) factor *= 1 + tactical * .55;
    if (['def','tac','str'].includes(key)) factor *= 1 + tactical * .3;
    if (mp.team.talkMod?.attack && ['sho','dri','spd'].includes(key)) factor *= 1 + mp.team.talkMod.attack;
    if (mp.team.talkMod?.defense && ['def','tac'].includes(key)) factor *= 1 + mp.team.talkMod.defense;
    return v * factor;
  }
  maxSpeed(mp) {
    let v = 4.85 + this.attr(mp, 'spd') * .054;
    if (mp.p.traits?.includes('speedster')) v += .32;
    if (mp.isGK) v *= .82;
    if (this.ball.owner === mp) v *= .9;
    if (mp.stamina < 35) v *= .92;
    if (mp.evadeUntil && this.simTime < mp.evadeUntil) v *= 1.09;
    if (mp.stumbleUntil && this.simTime < mp.stumbleUntil) v *= .55;
    return v;
  }
  think(mp) {
    if (!mp.onPitch) return;
    if (this.ball.owner === mp) this.carrierDecision(mp);
    else if (mp.isGK) this.gkDecision(mp);
    else this.offBallTarget(mp);
  }
  carrierDecision(mp) {
    if (this.restartTimer > 0 || mp.minutes < .05) return;
    const pressure = this.pressureOn(mp);
    const team = mp.team;
    if (mp.isGK) {
      if (this.simTime < (mp.ballHoldUntil || 0)) return;
      this.passFrom(mp, this.bestPassOption(mp, { allowGk: false, long: true })?.target || null, 'long');
      return;
    }
    // 带球时也持续调整脚下方向，避免拿球后站桩
    const drib = this.carrierDribbleTarget(mp);
    mp.targetX = drib.x; mp.targetY = drib.y;
    const earlyNo = this.nearestOpponent(mp, 6);
    const earlyStyle = PLAY_STYLES[playStyleOf(mp)];
    const takingFreeKick = !!this.ball.freeKick;
    // 贴身时先给持球人一个反应窗口，而不是等防守球员单方面出脚；任意球主罚者不受贴身干扰。
    if (!takingFreeKick && earlyNo.player && earlyNo.dist < 3.25 && this.simTime > (mp.nextEvade || 0) && mp.stamina > 28) {
      const earlyPass = this.bestPassOption(mp);
      const betterPass = earlyPass && earlyPass.lane >= .56 && earlyPass.openness >= .66
        && (earlyPass.betterPosition || earlyNo.dist < 2.35);
      if (!betterPass && chance(clamp((earlyStyle.dribble - 1) * .28 + .09, .025, .36))) {
        this.tryBeatDefender(mp, earlyNo.player);
        mp.ballHoldUntil = this.simTime + .38;
        return;
      }
    }
    if (this.simTime < (mp.ballHoldUntil || 0)) return;

    const goalX = team.side === 'left' ? 105 : 0;
    const distGoal = dist(mp.x, mp.y, goalX, 34);
    const angle = Math.abs(mp.y - 34);
    const inBox = team.side === 'left' ? mp.x > 88.5 : mp.x < 16.5;
    const no = this.nearestOpponent(mp, 10);
    const styleKey = playStyleOf(mp);
    const style = PLAY_STYLES[styleKey];
    const pass = this.bestPassOption(mp);
    // 角球第一脚必须向禁区内送球，不能沿着边线横传或带球，否则会立刻出界。
    if (this.ball.corner) return this.cornerDelivery(mp);
    // 间接任意球不能直接射门：第一脚必须传球或解围。
    if (this.ball.indirectFreeKick) {
      if (pass) return this.passFrom(mp, pass.target, pass.type, pass.lead);
      return this.clearBall(mp);
    }
    // 直接任意球：射程内由主罚者直接攻门，人墙会阻挡低平球；角度偏或距离太远则传中。
    if (this.ball.freeKick) {
      mp.targetX = mp.x; mp.targetY = mp.y;
      const fkAngle = Math.abs(mp.y - 34);
      if (distGoal < 33 && fkAngle < 28) {
        const shootChance = clamp(.84 + (this.attr(mp, 'sho') - 55) * .0035 - Math.max(0, distGoal - 19) * .012, .52, .94);
        if (chance(shootChance)) return this.shoot(mp, false);
        const boxMates = team.players
          .filter(p => p !== mp && p.onPitch && !p.isGK && this.isInBox(p, team) && !this.isOffsideAtPass(mp, p))
          .sort((a, b) => this.openness(b) - this.openness(a));
        if (boxMates.length && chance(.72)) return this.passFrom(mp, boxMates[0], 'cross');
        if (pass) return this.passFrom(mp, pass.target, pass.type, pass.lead);
        return this.clearBall(mp);
      }
      if (distGoal < 45) {
        const boxMates = team.players
          .filter(p => p !== mp && p.onPitch && !p.isGK && this.isInBox(p, team) && !this.isOffsideAtPass(mp, p))
          .sort((a, b) => this.openness(b) - this.openness(a));
        if (boxMates.length && chance(.82)) return this.passFrom(mp, boxMates[0], 'cross');
      }
    }
    // 边路推进到前场后，优先把球吊进禁区，制造头球和门前混战。
    const inWideFinal = !inBox && (mp.y < 26 || mp.y > 42) && (team.side === 'left' ? mp.x > 68 : mp.x < 37);
    if (inWideFinal) {
      const boxMates = team.players
        .filter(p => p !== mp && p.onPitch && !p.isGK && this.isInBox(p, team) && !this.isOffsideAtPass(mp, p))
        .sort((a, b) => this.openness(b) - this.openness(a));
      if (boxMates.length && chance(clamp(.64 - pressure.amount * .2, .44, .72))) {
        return this.passFrom(mp, boxMates[0], 'cross');
      }
    }
    // 禁区里有队友时，优先尝试传中/送入禁区，而不是只在外面倒脚。
    if (!inBox && pass && this.isInBox(pass.target, team) && chance(.7)) return this.passFrom(mp, pass.target, pass.type, pass.lead);
    const oo = this.oneOnOneInfo(mp);
    const oneOnOne = oo.oneOnOne;
    const underPressure = !oneOnOne && ((no.player && no.dist < 2.5) || pressure.amount > .34);
    const clearShot = oneOnOne || (inBox && angle < 14 && (!no.player || no.dist > 2.1));
    const shotQuality = clamp(
      (inBox ? .55 : distGoal < 19 ? .36 : distGoal < 26 ? .2 : distGoal < 31 ? .1 : 0)
      + (1 - clamp(angle / 30, 0, 1)) * .2
      + (mp.p.attrs.sho / 100) * .18
      - pressure.amount * .34,
      0, 1
    );
    const closeOpenPass = pass && pass.distance <= 16 && pass.lane >= .58 && pass.openness >= .72;
    const runway = this.openRunway(mp);
    // 前方有明显空间（或身边 7 米内没人）时，先带球靠近球门再射，不要在中远距离直接远射打偏。
    const spaceToShoot = runway.open || pressure.amount < .2;
    const holdForBetterShot = !inBox && distGoal > 18 && spaceToShoot && !oneOnOne;
    const spaceScore = Math.max(runway.score, pressure.amount < .2 ? .65 : 0);

    // 单刀优先：已经甩开防线、直面门将时，不再机械回传，给射门明显更高的权重。
    if (oneOnOne && chance(clamp(.6 + (style.shoot - 1) * .3, .45, .85))) return this.shoot(mp, true);

    if (holdForBetterShot) {
      const betterPassAvailable = pass && pass.betterPosition && pass.lane >= .7 && pass.openness >= .72;
      if (!betterPassAvailable) {
        const keepChance = clamp(.74 + spaceScore * .22 + (style.dribble - 1) * .1, .58, .97);
        if (chance(keepChance)) {
          mp.ballHoldUntil = this.simTime + .16 + rand() * .18;
          mp.targetX = clamp(mp.x + team.dir * (7 + spaceScore * 6), 2, 103);
          mp.targetY = clamp(mp.y + (34 - mp.y) * .08, 2, 66);
          return;
        }
      }
    }

    // 禁区内有起脚空间时优先尝试射门，避免在门前反复横传。
    if (inBox && !oneOnOne && chance(clamp(.46 + shotQuality * .42, .46, .88))) return this.shoot(mp, false);

    // 明显更好的近距离队友：即使球风偏独，也必须先考虑传球
    if (pass && closeOpenPass && !clearShot && (underPressure || pass.betterPosition || style.pass >= 1.2)) {
      if (chance(.62 + Math.max(0, style.pass - 1) * .3)) return this.passFrom(mp, pass.target, pass.type, pass.lead);
    }
    // 被逼抢且传球线路安全
    if (pass && underPressure && pass.lane >= .42) {
      if (chance(.55 + Math.max(0, style.pass - 1) * .2)) return this.passFrom(mp, pass.target, pass.type, pass.lead);
    }
    // 射门：机会极好时所有球风都会射；普通机会受“终结型/组织型”影响
    let shootChance = 0;
    if (!holdForBetterShot && distGoal < 36 && angle < 35) {
      shootChance = .13 + shotQuality * .56;
      if (inBox) shootChance += .18;
      if (clearShot) shootChance += .22;
      shootChance *= style.shoot;
      if (pressure.amount > .42) shootChance *= .66;
      if (mp.stamina < 35) shootChance *= .86;
      if (mp.p.traits?.includes('long_shot') && distGoal < 33 && distGoal > 17) shootChance += .05;
      if (mp.p.traits?.includes('poacher') && inBox) shootChance += .05;
      if (distGoal < 26 && angle < 22) shootChance = Math.max(shootChance, .34);
      if (oneOnOne) shootChance = Math.max(shootChance, .6);
      if (chance(clamp(shootChance, 0, .97))) return this.shoot(mp, oneOnOne);
    }
    // 远射：只有被压住、没有明显空当，或确实有远射标签时才起脚。
    if (!holdForBetterShot && !inBox && distGoal < 44 && angle < 40) {
      const longShotTrait = mp.p.traits?.includes('long_shot');
      const canLongShot = longShotTrait || (pressure.amount > .28 && !runway.open);
      if (canLongShot) {
        let longChance = .09 + Math.max(0, 42 - distGoal) * .011 - Math.max(0, distGoal - 42) * .015;
        if (longShotTrait) longChance += .07;
        if (mp.team.tactics.attack === 'counter') longChance += .02;
        if (pressure.amount > .5) longChance *= .65;
        if (mp.stamina < 30) longChance *= .82;
        if (chance(clamp(longChance, .02, .42))) return this.shoot(mp);
      }
    }
    // 一对一：突破型球员在贴身防守下会优先尝试过人，而不是机械回传
    const canTakeOn = no.player && no.dist < 3.05 && this.simTime > (mp.nextEvade || 0)
      && !(pass && pass.lane >= .55 && pass.openness >= .65 && pass.betterPosition)
      && !(pass && pass.distance <= 14 && pass.lane >= .6);
    if (canTakeOn) {
      let takeOnChance = clamp((style.dribble - .72) * .28 + this.attr(mp, 'dri') / 420, .02, .34);
      if (underPressure) takeOnChance += .035;
      if (chance(takeOnChance)) {
        this.tryBeatDefender(mp, no.player);
        mp.ballHoldUntil = this.simTime + .4;
        return;
      }
    }
    // 常规传球
    if (pass) {
      let passChance = .08 + pass.lane * .17 + Math.min(.13, pass.openness * .055);
      passChance *= style.pass;
      if (pass.betterPosition) passChance += .07;
      if (pass.distance < 13) passChance += .035;
      if (underPressure) passChance += .14;
      if (team.tactics.attack === 'possession') passChance += .055;
      if (team.tactics.attack === 'counter') passChance -= .025;
      if (team.tactics.tempo === 'fast') passChance += .03;
      if (mp.stamina < 30) passChance += .05;
      if (runway.open) passChance *= 1 - runway.score * .45;
      if (this.ball.corner && (team.side === 'left' ? mp.x > 97 : mp.x < 8)) passChance += .5;
      if (chance(clamp(passChance, .025, .82))) return this.passFrom(mp, pass.target, pass.type, pass.lead);
    }
    // 没有好传球线路时，继续尝试一对一
    if (no.player && no.dist < 2.9 && this.simTime > (mp.nextEvade || 0)) {
      if (chance(clamp((style.dribble - .7) * .26 + this.attr(mp, 'dri') / 440, .015, .28))) {
        this.tryBeatDefender(mp, no.player);
        mp.ballHoldUntil = this.simTime + .4;
        return;
      }
    }
    // 后场被围抢且没有安全出球点，果断解围
    const ownThird = team.side === 'left' ? mp.x < 31 : mp.x > 74;
    if (ownThird && pressure.amount > .6 && (!pass || pass.lane < .32) && chance(.32)) return this.clearBall(mp);
    if (mp.stamina < 20) {
      if (pass && pass.lane >= .35) this.passFrom(mp, pass.target, pass.type, pass.lead);
      else this.clearBall(mp);
      return;
    }
    // 继续带球，下一次思考前不再做决定
    mp.ballHoldUntil = this.simTime + .05 + rand() * .08;
  }
  tryBeatDefender(mp, op) {
    if (!mp || !op || !mp.onPitch || !op.onPitch) return false;
    mp.nextEvade = this.simTime + 2.6 + rand() * 1.2;
    const style = PLAY_STYLES[playStyleOf(mp)];
    const dri = this.attr(mp, 'dri'), tac = this.attr(op, 'tac');
    const spd = this.attr(mp, 'spd'), ospd = this.attr(op, 'spd');
    let odds = .34 + (dri - tac) * .008 + (spd - ospd) * .0035 + (style.dribble - 1) * .2;
    if (op.p.traits?.includes('tackler')) odds -= .05;
    if (mp.stamina < 35) odds -= .05;
    odds = clamp(odds, .12, .78);
    if (chance(odds)) {
      mp.evadeUntil = this.simTime + .78;
      mp.evadeDir = mp.y < op.y ? -1 : 1;
      mp.ballHoldUntil = this.simTime + .55;
      op.tackleCd = Math.max(op.tackleCd || 0, this.simTime + 1.25);
      op.stumbleUntil = this.simTime + .48;
      this.stats[mp.team.side].dribbles++;
      mp.rating += .05; op.rating -= .02;
      this.addComment(Math.floor(this.time), `${mp.name} 一个变向晃过了 ${op.name}！`, 'chance');
      return true;
    }
    mp.stumbleUntil = this.simTime + .22;
    op.tackleCd = Math.max(op.tackleCd || 0, this.simTime + .5);
    return false;
  }
  bestPassOption(mp, opts = {}) {
    const team = mp.team;
    const goalX = team.side === 'left' ? 105 : 0;
    const mates = team.players.filter(other => other.onPitch && other !== mp && (!other.isGK || opts.allowGk));
    const styleKey = playStyleOf(mp);
    const style = PLAY_STYLES[styleKey];
    const carrierGoalDist = dist(mp.x, mp.y, goalX, 34);
    let best = null, bestScore = -1e9;
    for (const mate of mates) {
      if (mate.isGK && !opts.allowGk) continue;
      // 传球前先看越位线；绝大多数时候会避开越位队友，只有极少数判断失误会传过去。
      if (this.isOffsideAtPass(mp, mate) && chance(.92)) continue;
      const d = dist(mp.x, mp.y, mate.x, mate.y);
      if (d < 4 || d > 58) continue;
      const lane = this.passLaneQuality(mp, mate);
      const openness = this.openness(mate);
      const forward = (mate.x - mp.x) * team.dir;
      const mateGoalDist = dist(mate.x, mate.y, goalX, 34);
      const betterPosition = mateGoalDist < carrierGoalDist - 2.5;
      const runner = ['ST', 'SS', 'LW', 'RW'].includes(mate.role);
      const inBoxMate = this.isInBox(mate, team);
      const breakaway = runner && mateGoalDist < 28 && forward > 7 && lane >= .55 && openness >= .6 && Math.abs(mate.y - 34) < 24;
      let score = forward * .12 + lane * 3.2 + Math.min(1.4, openness) * .9 - Math.abs(d - 16) * .026;
      if (betterPosition) score += 1.3;
      if (breakaway) score += 1.35;
      if (inBoxMate) score += 1.5 + (this.isWide(mp, team) ? .7 : 0);
      if (styleKey === 'passer') score += Math.max(0, 15 - d) * .04 + lane * .35;
      if (styleKey === 'direct') score += Math.max(0, forward) * .05 + (betterPosition ? .5 : 0);
      if (styleKey === 'finisher') score -= .2;
      if (styleKey === 'dribbler') score -= .35;
      if (team.tactics.attack === 'possession') score += Math.max(0, 20 - d) * .03 + lane * .35;
      if (team.tactics.attack === 'counter') score += Math.max(0, forward) * .055 + (['ST','LW','RW'].includes(mate.role) ? 1.1 : 0);
      if (team.tactics.attack === 'longball' && forward > 20) score += 1.8;
      if (team.tactics.attack === 'wing' && ['ST','SS','AM'].includes(mate.role) && this.isWide(mp, team)) score += 1.4;
      if (opts.long && d < 20) score -= 1.2;
      if (opts.long && d > 30) score += 1.3;
      if (lane < .35) score -= inBoxMate ? .8 : 2.2;
      if (lane < .18) score -= inBoxMate ? 1.2 : 3.2;
      if (d < 7 && lane < .5) score -= .9;
      if (d > 36 && lane < .62) score -= 1.0;
      if (this.ball.corner) score += this.isInBox(mate, team) ? 4 : -1;
      if (mate.isGK) score -= 2.2;
      if (score > bestScore) {
        bestScore = score;
        let type = 'ground';
        if (this.isWide(mp, team) && this.isInBox(mate, team)) type = 'cross';
        else if (inBoxMate && (this.isWide(mp, team) || d > 18)) type = 'cross';
        else if (breakaway) type = 'through';
        else if (d > 32) type = 'long';
        else if (team.tactics.attack === 'counter' && forward > 15) type = 'through';
        else if (styleKey === 'direct' && betterPosition && d > 11) type = 'through';
        const lead = type === 'through' ? clamp(8 + this.attr(mp, 'vis') * .04, 8, 14) : type === 'long' || type === 'cross' ? 3 : 1.5;
        best = { target: mate, type, lead, score: bestScore, distance: d, lane, openness, betterPosition, mateGoalDist, carrierGoalDist };
      }
    }
    return best;
  }
  passLaneQuality(from, to) {
    const dx = to.x - from.x, dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    let quality = 1;
    for (const op of this.allPlayers) {
      if (!op.onPitch || op.team === from.team || op === from) continue;
      const t = clamp(((op.x - from.x) * dx + (op.y - from.y) * dy) / (len * len), 0, 1);
      const px = from.x + dx * t, py = from.y + dy * t;
      const d = dist(px, py, op.x, op.y);
      if (d < 1.2) quality = Math.min(quality, .08);
      else if (d < 2.2) quality -= .16;
      else if (d < 3.5) quality -= .06;
    }
    return clamp(quality, 0, 1);
  }
  openness(mp) {
    let best = 18;
    for (const op of this.allPlayers) {
      if (!op.onPitch || op.team === mp.team) continue;
      best = Math.min(best, dist(mp.x, mp.y, op.x, op.y));
    }
    return clamp(best / 12, 0, 1.5);
  }
  isWide(mp, team) { return team.side === 'left' ? (mp.y < 18 || mp.y > 50) : (mp.y < 18 || mp.y > 50); }
  isInBox(mp, team) { return team.side === 'left' ? (mp.x > 88.5) : (mp.x < 16.5); }
  passFrom(mp, target, type = 'ground', lead = 1.5) {
    if (!target || !mp.onPitch) return this.clearBall(mp);
    const team = mp.team;
    const rawDist = dist(mp.x, mp.y, target.x, target.y);
    const speed = type === 'cross' ? 20 : type === 'long' ? 25 : clamp(11 + rawDist * .65, 11, 23);
    const flight = type === 'long' || type === 'cross';
    const flightTime = clamp(rawDist / Math.max(8, speed), .25, 1.6);
    const leadSec = flightTime * .62;
    const tx = target.x + target.vx * leadSec + (type === 'through' ? team.dir * Math.max(0, lead) * .6 : 0);
    const ty = target.y + target.vy * leadSec;
    let dx = tx - mp.x, dy = ty - mp.y;
    const d = Math.hypot(dx, dy) || 1;
    const passAttr = clamp(this.attr(mp, 'pas') / 100, .05, .98);
    const pressure = this.pressureOn(mp);
    // 短传更可靠：普通业余球员在无人逼抢下也能稳定把球送到队友脚下
    let error = (1 - passAttr) * .115 + (d / 80) * .03 + Math.max(0, -this.weather.pass) * .9;
    if (pressure.amount > .42) error += .016 + pressure.amount * .016;
    if (type === 'long' || type === 'cross') error += .018;
    error = clamp(error, .006, .24);
    const angle = Math.atan2(dy, dx) + normal(0, error * .55);
    const power = speed * clamp(1 + (rand() - .5) * .06, .94, 1.06);
    const offside = this.isOffsideAtPass(mp, target);
    const headerContext = this.ball.headerContext;
    this.ball.indirectFreeKick = false;
    this.releaseBall(mp);
    this.ball.vx = Math.cos(angle) * power;
    this.ball.vy = Math.sin(angle) * power;
    this.ball.x = clamp(mp.x + Math.cos(angle) * .8, .9, 104.1);
    this.ball.y = clamp(mp.y + Math.sin(angle) * .8, 1.1, 66.9);
    this.ball.z = flight ? .9 : 0;
    this.ball.vz = flight ? (type === 'cross' ? 7.5 : 6.5) : 0;
    this.ball.passMeta = { from: mp, intended: target, originX: mp.x, originY: mp.y, type, startTime: this.time, createdAt: this.simTime, offside };
    this.ball.lastTouch = mp; this.ball.lastTouchTeam = team;
    this.ball.corner = false;
    this.ball.headerContext = headerContext;
    this.ball.noControlUntil = this.simTime + .16;
    this.lastPass = { player: mp, time: this.simTime, team };
    this.stats[team.side].passes++;
    mp.touches++;
    mp.rating += .01;
    this.lastPassLine = { x1: mp.x, y1: mp.y, x2: target.x, y2: target.y, until: performance.now() + 550 };
    if (!offside && (type === 'cross' || (type === 'through' && target && this.isInBox(target, team)))) {
      this.addComment(Math.floor(this.time), type === 'cross' ? `${mp.name} 在边路起球，传向禁区。` : `${mp.name} 送出一脚直塞，撕开了防线。`, 'chance');
    }
    mp.lastAction = 'pass';
  }
  clearBall(mp) {
    const team = mp.team;
    this.releaseBall(mp);
    const dir = team.dir;
    this.ball.vx = dir * randInt(17, 28);
    this.ball.vy = (rand() - .5) * 17;
    if (mp.y < 8 && this.ball.vy < 0) this.ball.vy = Math.abs(this.ball.vy);
    if (mp.y > 60 && this.ball.vy > 0) this.ball.vy = -Math.abs(this.ball.vy);
    this.ball.z = 1.2;
    this.ball.vz = randInt(5, 8);
    this.ball.x = clamp(mp.x + dir * .7, .9, 104.1);
    this.ball.y = clamp(mp.y, 1.1, 66.9);
    this.ball.lastTouch = mp; this.ball.lastTouchTeam = team;
    this.ball.passMeta = null;
    this.ball.headerContext = null;
    this.ball.indirectFreeKick = false;
    this.ball.noControlUntil = this.simTime + .3;
    mp.lastAction = 'clear';
  }
  releaseBall(mp) {
    if (this.ball.owner === mp) this.ball.owner = null;
    // 任意球标记只在主罚球员第一次触球前有效；传球、射门、解围被断后立即失效。
    if (this.ball.freeKick) this.ball.freeKick = false;
  }
  shoot(mp, oneOnOne = false, header = false) {
    if (!mp) return;
    if (!header && this.ball.owner !== mp) return;
    if (this.ball.indirectFreeKick) return;
    const freeKick = !!this.ball.freeKick && !header;
    const team = mp.team;
    const goalX = team.side === 'left' ? 105 : 0;
    const gk = this.gk[team.side === 'left' ? 'right' : 'left'];
    const distGoal = dist(mp.x, mp.y, goalX, 34);
    const longShot = distGoal > 28;
    let targetY, targetZ, power, lowFreeKick = false;
    if (freeKick) {
      // 大部分任意球绕过人墙打远角，少数低平球打近角；低平球更容易被人墙挡出。
      lowFreeKick = chance(.28);
      const side = lowFreeKick ? (mp.y < 34 ? -1 : 1) : (mp.y < 34 ? 1 : -1);
      const fkSigma = clamp(1.55 - this.attr(mp, 'sho') * .012 - this.attr(mp, 'vis') * .005 + this.pressureOn(mp).amount * .8 - this.weather.shot * 10, .5, 2.4);
      targetY = 34 + side * (lowFreeKick ? 2.0 + rand() * .7 : 2.65 + rand() * .55) + normal(0, fkSigma);
      targetZ = lowFreeKick ? .2 + rand() * .55 : .85 + rand() * 1.1;
      power = clamp(28 + this.attr(mp, 'sho') * .055 + (mp.p.traits?.includes('power_shot') ? 1.5 : 0) + rand() * 2.2, 27, 36);
    } else {
      const gkY = gk?.y ?? 34;
      const aimSide = gkY > 34 ? -1 : 1;
      const aimY = 34 + aimSide * (1.2 + rand() * 2.0);
      const sigmaBase = clamp(2.0 + distGoal * .065 - this.attr(mp, 'sho') * .02 - this.attr(mp, 'vis') * .003 + this.pressureOn(mp).amount * 1.4 - this.weather.shot * 22, .6, 5.2);
      const sigma = header ? Math.max(1.1, sigmaBase * 1.5) : oneOnOne ? Math.max(.5, sigmaBase * .84) : sigmaBase * (longShot ? 1.5 : .92);
      targetY = aimY + normal(0, sigma);
      targetZ = header ? rand() * 1.5 + .2 : longShot ? (rand() < .32 ? rand() * 3.2 + .2 : rand() * 1.7 + .2) : rand() < .82 ? rand() * 1.7 + .2 : rand() * 3.2 + .2;
      power = header
        ? clamp(14 + this.attr(mp, 'str') * .06 + (mp.p.height - 175) * .06 + rand() * 2, 12, 26)
        : clamp(25 + this.attr(mp, 'sho') * .06 + (mp.p.traits?.includes('power_shot') ? 2.5 : 0) + rand() * 3, 22, 34);
    }
    const onTarget = Math.abs(targetY - 34) < 3.55 && targetZ < 2.43;
    const tx = goalX, ty = targetY;
    let dx = tx - mp.x, dy = ty - mp.y;
    const d = Math.hypot(dx, dy) || 1;
    this.releaseBall(mp);
    this.ball.trail = [];
    this.ball.trailActiveUntil = this.simTime + 2.5;
    this.ball.x = mp.x + team.dir * .6;
    this.ball.y = mp.y;
    this.ball.vx = dx / d * power;
    this.ball.vy = dy / d * power;
    const tGoal = Math.max(.12, d / Math.max(12, power));
    this.ball.z = header ? 1.0 : freeKick && !lowFreeKick ? 1.05 : .22;
    // 高弧线任意球使用更大的下坠重力，让球越过人墙后落入球门；低平球保持正常重力。
    const shotGravity = freeKick && !lowFreeKick ? 26 : 12;
    this.ball.vz = (targetZ - this.ball.z) / tGoal + (shotGravity / 2) * tGoal;
    this.ball.lastTouch = mp; this.ball.lastTouchTeam = team;
    this.ball.passMeta = null;
    this.ball.headerContext = null;
    this.ball.noControlUntil = this.simTime + .1;
    this.ball.shotMeta = {
      shooter: mp, team, onTarget, targetY, targetZ, power, done: false,
      save: false, saveProb: 0, gk, oneOnOne, header, longShot, freeKick, lowFreeKick,
      assist: this.lastPass && this.lastPass.team === team && this.simTime - this.lastPass.time < 5 ? this.lastPass.player : null,
    };
    this.stats[team.side].shots++;
    if (onTarget) this.stats[team.side].onTarget++;
    const xg = clamp(1 / (1 + Math.exp((distGoal - 14) / 5)) * .75 + (onTarget ? .12 : 0) + (oneOnOne ? .04 : 0) - (header ? .02 : 0) - this.pressureOn(mp).amount * .08, .01, .93);
    this.stats[team.side].xg += xg;
    this.ball.shotMeta.xg = xg;
    mp.shots++;
    mp.rating += .035;
    if (gk) {
      const gkDist = Math.abs(gk.y - targetY);
      const skill = this.attr(gk, 'gk');
      const placement = clamp(Math.abs(targetY - 34) / 3.55, 0, 1);
      let saveProb = .77 + (skill - 55) * .004 - placement * .08 - Math.max(0, power - 27) * .006 - (distGoal < 9 ? .05 : 0) - (oneOnOne ? .025 : 0) + (header ? .06 : 0) + (longShot && !freeKick ? .11 : 0) - (freeKick ? .08 : 0);
      if (targetZ > 1.9) saveProb += .06;
      if (gk.p.traits?.includes('sweeper_keeper')) saveProb += .012;
      if (mp.p.traits?.includes('clutch')) saveProb -= .03;
      saveProb = clamp(saveProb, .08, .93);
      this.ball.shotMeta.saveProb = saveProb;
      this.ball.shotMeta.save = onTarget && chance(saveProb);
      gk.dive = { dir: targetY > gk.y ? 1 : -1, amount: clamp(Math.abs(targetY - gk.y) / 3.55, .2, 1), t: 0, save: this.ball.shotMeta.save };
      gk.rating += .015;
    }
    const shotText = header
      ? `头球攻门！${mp.name} 在禁区内抢点，${onTarget ? '球奔向球门。' : '球偏出了目标。'}`
      : freeKick
      ? `任意球直接攻门！${mp.name} 把球绕过人墙，${onTarget ? '球直奔球门。' : '球偏出了目标。'}`
      : oneOnOne
      ? `单刀！${mp.name} 直面门将，起脚射门！${onTarget ? '球奔向球门。' : '球偏出了目标。'}`
      : longShot
      ? `远射！${mp.name} 在禁区外直接起脚，${onTarget ? '球奔向球门。' : '球偏出了目标。'}`
      : `${mp.name} 起脚射门！${onTarget ? '球奔向球门。' : '球偏出了目标。'}`;
    this.addComment(Math.floor(this.time), shotText, 'shot');
  }
  ownGoalCheck(team) { return false; }
  takePenalty(team) {
    const shooters = team.players.filter(mp => mp.onPitch && !mp.isGK).sort((a,b) => b.p.attrs.sho - a.p.attrs.sho);
    const shooter = shooters[0];
    if (!shooter) return;
    const gk = this.gk[team.side === 'left' ? 'right' : 'left'];
    const goalX = team.side === 'left' ? 105 : 0;
    this.ball.x = goalX - team.dir * 11;
    this.ball.y = 34;
    shooter.x = this.ball.x - team.dir * .7; shooter.y = 34;
    shooter.targetX = shooter.x; shooter.targetY = shooter.y;
    this.ball.owner = shooter;
    this.ball.lastTouch = shooter;
    this.ball.lastTouchTeam = team;
    this.restartTimer = .25;
    const targetY = 34 + (chance(.5) ? -1 : 1) * (1.6 + rand() * 1.6);
    const save = chance(.22);
    this.ball.shotMeta = { shooter, team, onTarget: true, targetY, targetZ: .8, power: 30, done: false, save, saveProb: .22, gk, penalty: true };
    this.stats[team.side].shots++;
    this.stats[team.side].onTarget++;
    this.stats[team.side].xg += .78;
    shooter.shots++;
    this.releaseBall(shooter);
    const dx = goalX - shooter.x, dy = targetY - shooter.y;
    const d = Math.hypot(dx, dy) || 1;
    this.ball.vx = dx / d * 30; this.ball.vy = dy / d * 30; this.ball.z = .25;
    const pTime = Math.max(.1, d / 30);
    this.ball.vz = (.8 - .25) / pTime + 6 * pTime;
    this.ball.noControlUntil = this.simTime + .8;
    if (gk) gk.dive = { dir: targetY > gk.y ? 1 : -1, amount: 1, t: 0, save };
    this.addComment(Math.floor(this.time), `${shooter.name} 站在点球点前……`, 'card');
  }
  gkDecision(mp) {
    const team = mp.team;
    if (this.ball.owner === mp) {
      const pass = this.bestPassOption(mp, { allowGk: false, long: true });
      if (pass) this.passFrom(mp, pass.target, 'long');
      else this.clearBall(mp);
      return;
    }
    this.offBallTarget(mp);
  }
  updatePlayerMovement(dt, frozen) {
    for (const mp of this.allPlayers) {
      if (!mp.onPitch) continue;
      if (mp.dive) { mp.dive.t += dt; if (mp.dive.t > .55) mp.dive = null; }
      // 死球/暂停时由 restartState 明确指定目标点；这里不再额外把球员往基准点推，
      // 否则正在走向球点的发球人会被拉回阵型。
      let tx = mp.targetX, ty = mp.targetY;
      if (this.ball.owner === mp && !frozen) {
        const c = this.carrierDribbleTarget(mp);
        tx = c.x; ty = c.y;
      }
      // 人墙在任意球踢出后的短暂时间内保持站位，不立刻散开。
      if (mp.setPieceHoldUntil && this.simTime < mp.setPieceHoldUntil) {
        tx = mp.x; ty = mp.y;
      }
      const dx = tx - mp.x, dy = ty - mp.y;
      const d = Math.hypot(dx, dy);
      let desiredVx = 0, desiredVy = 0;
      if (d > .4) {
        const arrival = clamp(d / 3.5, .35, 1);
        const walk = this.restartState && mp.restartWalkFactor ? mp.restartWalkFactor : 1;
        const max = this.maxSpeed(mp) * arrival * walk;
        desiredVx = dx / d * max;
        desiredVy = dy / d * max;
      }
      const accel = (6.5 + this.attr(mp, 'str') * .06) * dt;
      mp.vx = approach(mp.vx, desiredVx, accel);
      mp.vy = approach(mp.vy, desiredVy, accel);
      // 体力低时减速
      if (mp.stamina < 30) { mp.vx *= .985; mp.vy *= .985; }
      mp.x += mp.vx * dt;
      mp.y += mp.vy * dt;
      // 边界
      mp.x = clamp(mp.x, .8, 104.2);
      mp.y = clamp(mp.y, .8, 67.2);
      if (Math.abs(mp.vx) > .15) mp.dir = mp.vx > 0 ? 1 : -1;
      // 草地摩擦与静止
      if (!frozen && d <= .4) { mp.vx *= .86; mp.vy *= .86; }
    }
    // 简单球员碰撞
    for (let i = 0; i < this.allPlayers.length; i++) {
      const a = this.allPlayers[i]; if (!a.onPitch) continue;
      for (let j = i + 1; j < this.allPlayers.length; j++) {
        const b = this.allPlayers[j]; if (!b.onPitch) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const minD = 1.35;
        if (d > .001 && d < minD) {
          const push = (minD - d) * .26;
          a.x -= dx / d * push; a.y -= dy / d * push;
          b.x += dx / d * push; b.y += dy / d * push;
        }
      }
    }
    // 球在脚下
    if (this.ball.owner && this.ball.owner.onPitch) {
      const o = this.ball.owner;
      const lead = this.ball.owner.isGK ? .4 : .62;
      this.ball.x = o.x + o.dir * lead;
      this.ball.y = o.y + clamp((o.vy || 0) * .04, -.6, .6);
      this.ball.z = 0; this.ball.vz = 0;
    }
  }
  openRunway(mp) {
    const team = mp.team, dir = team.dir;
    let nearest = 99;
    for (const op of this.allPlayers) {
      if (!op.onPitch || op.team === team || op.isGK) continue;
      const forward = (op.x - mp.x) * dir;
      const lateral = Math.abs(op.y - mp.y);
      if (forward > -.5 && forward < 22 && lateral < 12) {
        nearest = Math.min(nearest, Math.max(0, forward));
      }
    }
    const score = clamp((nearest - 2.5) / 13, 0, 1);
    return { open: nearest > 7.5, score, nearest };
  }
  cornerDelivery(mp) {
    const team = mp.team;
    const goalX = team.side === 'left' ? 105 : 0;
    const dir = team.dir;
    const mates = team.players
      .filter(p => p !== mp && p.onPitch && !p.isGK && this.isInBox(p, team))
      .sort((a, b) => (this.openness(b) + b.p.height / 500) - (this.openness(a) + a.p.height / 500));
    if (mates.length) {
      this.passFrom(mp, mates[0], 'cross', 3);
      this.addComment(Math.floor(this.time), `${mp.name} 把角球开向禁区，${mates[0].name} 在抢点。`, 'chance');
      return;
    }
    // 没有队友在禁区时，直接把球吊到点球点附近，避免贴边线横传后出界。
    this.releaseBall(mp);
    this.ball.corner = false;
    this.ball.headerContext = 'corner';
    this.ball.passMeta = null; this.ball.shotMeta = null;
    const targetX = goalX - dir * 10;
    const targetY = clamp(34 + (rand() - .5) * 8, 10, 58);
    const dx = targetX - mp.x, dy = targetY - mp.y;
    const d = Math.hypot(dx, dy) || 1;
    const power = 23;
    this.ball.x = mp.x + dir * .6;
    this.ball.y = clamp(mp.y + (mp.y < 34 ? 1.1 : -1.1), 1.2, 66.8);
    this.ball.vx = dx / d * power;
    this.ball.vy = dy / d * power;
    this.ball.z = .8; this.ball.vz = 5.8;
    this.ball.lastTouch = mp; this.ball.lastTouchTeam = team;
    this.ball.noControlUntil = this.simTime + .2;
    mp.lastAction = 'cross';
    this.addComment(Math.floor(this.time), `${mp.name} 把角球吊向禁区中央。`, 'chance');
  }
  carrierDribbleTarget(mp) {
    const team = mp.team;
    const goalX = team.side === 'left' ? 105 : 0;
    // 刚完成一次变向/过人：向空当方向加速一趟
    if (mp.evadeUntil && this.simTime < mp.evadeUntil) {
      return {
        x: clamp(mp.x + team.dir * 5.2, 2, 103),
        y: clamp(mp.y + (mp.evadeDir || 1) * 5.5, 2, 66),
      };
    }
    let dx = goalX - mp.x, dy = 34 - mp.y;
    const d = Math.hypot(dx, dy) || 1;
    // 最近对手干扰：不是绕开所有防守，而是寻找可推进的缝隙
    const no = this.nearestOpponent(mp, 10);
    let avoidX = 0, avoidY = 0;
    if (no.player) {
      const ox = mp.x - no.player.x, oy = mp.y - no.player.y;
      const od = Math.hypot(ox, oy) || 1;
      const drib = this.attr(mp, 'dri');
      const strength = clamp((10 - no.dist) / 10, 0, 1) * (1.05 - drib / 180);
      avoidX += ox / od * strength * 7;
      avoidY += oy / od * strength * 12;
      // 高盘带球员会更主动地选择从对手身侧穿过
      if (drib > 58 && no.dist < 3.2) {
        avoidY += (mp.y < no.player.y ? -1 : 1) * (1.8 + drib / 50);
      }
    }
    let tx = mp.x + dx / d * 7 + avoidX;
    let ty = mp.y + dy / d * 2.5 + avoidY;
    // 边线内切
    if (mp.y < 5) ty = mp.y + 5;
    if (mp.y > 63) ty = mp.y - 5;
    // 控球战术更多靠近中路
    if (team.tactics.attack === 'wing' && Math.abs(mp.y - 34) < 8) ty += (mp.y < 34 ? -4 : 4);
    return { x: clamp(tx, 2, 103), y: clamp(ty, 2, 66) };
  }
  offBallTarget(mp) {
    if (mp.isGK) return this.gkPosition(mp);
    const team = mp.team;
    const ball = this.ball;
    const phase = team.phase;
    // 接球人主动迎球，避免“球从脚边滚过去”
    if (ball.passMeta && ball.passMeta.intended === mp) {
      if (ball.z > .8 || ball.passMeta.type === 'cross' || ball.passMeta.type === 'long') {
        const land = this.ballLandingPoint();
        mp.targetX = land.x; mp.targetY = land.y;
      } else {
        const ahead = clamp(dist(mp.x, mp.y, ball.x, ball.y) / 18, .15, .65);
        mp.targetX = clamp(ball.x + ball.vx * ahead, 2, 103);
        mp.targetY = clamp(ball.y + ball.vy * ahead, 2, 66);
      }
      return;
    }
    // 无主球：每队最多两人追球，其他人保持阵型；高空球去落点争顶
    if (!ball.owner) {
      const land = this.ballLandingPoint();
      const pair = this.nearestTwoToBall(team);
      if (pair.includes(mp)) {
        mp.targetX = clamp(land.x, 2, 103);
        mp.targetY = clamp(land.y, 2, 66);
        return;
      }
    }
    const ownGoalX = team.side === 'left' ? 0 : 105;
    const attackGoalX = team.side === 'left' ? 105 : 0;
    const base = this.slotBase(mp);
    const ballProgress = clamp((team.side === 'left' ? ball.x : 105 - ball.x) / 105, 0, 1);
    const ballInOwnHalf = team.side === 'left' ? ball.x < 52.5 : ball.x > 52.5;
    const ballSide = ball.y < 34 ? -1 : 1;
    let tx = base.x, ty = base.y;
    let maxDev = phase === 'attack' ? 28 : 20;

    if (phase === 'attack') {
      const style = team.tactics.attack;
      const push = 5.5 + ballProgress * 9 + (style === 'counter' ? 3 : style === 'longball' ? 4 : style === 'possession' ? 2 : 0);
      tx += team.dir * push;
      ty += clamp((ball.y - 34) * .1, -5, 5);
      // 进攻时整条防线随球前压，避免前锋已经到禁区、后卫还站在己方禁区线
      const teamLine = clamp(ball.x - team.dir * 24, ownGoalX + team.dir * 16, ownGoalX + team.dir * 50);
      // 球在边路前场时，中路球员全部冲向禁区抢点，而不是站在禁区外看球。
      const wideAttack = ballProgress > .52 && (ball.y < 26 || ball.y > 42)
        && (team.side === 'left' ? ball.x > 68 : ball.x < 37);

      if (mp.role === 'CB') {
        tx = lerp(tx, teamLine, .75);
        tx = Math.min(tx, ball.x - team.dir * 16);
        maxDev = 32;
      } else if (mp.role === 'LB' || mp.role === 'RB') {
        const mySide = mp.role === 'LB' ? -1 : 1;
        const overlap = (style === 'wing' || style === 'possession') && mySide === ballSide && ball.x * team.dir > 55;
        tx = lerp(tx, teamLine + team.dir * 5, .4);
        tx += team.dir * (overlap ? 10 : 2);
        tx = Math.min(tx, ownGoalX + team.dir * (overlap ? 78 : 60));
        ty = lerp(ty, mySide < 0 ? 12 : 56, .25);
        maxDev = 32;
      } else if (mp.role === 'DM') {
        tx = lerp(tx, teamLine + team.dir * 9, .42);
        tx = Math.min(tx, ball.x - team.dir * 6);
        ty = lerp(ty, 34, .35);
        maxDev = 26;
      } else if (mp.role === 'AM') {
        const supportX = ball.x - team.dir * 4;
        tx = lerp(tx, supportX, .4);
        ty += (mp.slotIndex % 2 === 0 ? -1 : 1) * 4;
        if (wideAttack) {
          tx = attackGoalX - team.dir * 12;
          ty = 34 + (mp.slotIndex % 2 === 0 ? -4 : 4);
        } else if (ballProgress > .52) {
          tx = lerp(tx, attackGoalX - team.dir * 10, .5);
          ty = lerp(ty, 34 + (ball.y - 34) * .2, .35);
        }
        maxDev = 44;
      } else if (mp.role === 'CM') {
        const supportX = ball.x - team.dir * 10;
        tx = lerp(tx, supportX, .28);
        ty += (mp.slotIndex % 2 === 0 ? -1 : 1) * 4;
        maxDev = 28;
      } else if (['LW','RW','LM','RM'].includes(mp.role)) {
        const mySide = (mp.role.includes('L') ? -1 : 1);
        if (style === 'wing') {
          ty = lerp(ty, mySide < 0 ? 7 : 61, .6);
          tx += team.dir * 7;
        } else {
          ty = lerp(ty, mySide < 0 ? 14 : 54, .3);
        }
        // 球在另一侧且进入前场时，远侧边锋包抄后点
        if (ballProgress > .55 && mySide !== ballSide) {
          tx = attackGoalX - team.dir * 10;
          ty = mySide < 0 ? 25 : 43;
        }
        maxDev = 40;
      } else if (mp.role === 'ST' || mp.role === 'SS') {
        const channel = (mp.slotIndex % 2 === 0 ? -1 : 1);
        const behind = this.isInBox({ x: ball.x, y: ball.y }, team) || ballProgress > .52;
        if (wideAttack) {
          tx = attackGoalX - team.dir * 9;
          ty = 34 + channel * 6;
        } else {
          tx = lerp(tx, attackGoalX - team.dir * (behind ? 7 : 14), .74);
          ty = 34 + channel * (behind ? 8 : 11) + Math.sin(this.time * .45 + mp.runPhase) * 3;
          if (ball.y < 20) ty = channel < 0 ? 30 : 44;
          if (ball.y > 48) ty = channel < 0 ? 24 : 38;
        }
        maxDev = 52;
      }
      // 最后一线：不要所有攻击球员都挤在球周围
      if (mp.role !== 'GK' && mp.role !== 'ST' && mp.role !== 'SS') {
        const ballNear = dist(mp.x, mp.y, ball.x, ball.y);
        if (ballNear < 7) {
          tx += (mp.x > ball.x ? 1 : -1) * 2;
          ty += (mp.y > 34 ? 1 : -1) * 1.5;
        }
      }
    } else {
      const defStyle = team.tactics.defense;
      const linePush = defStyle === 'press' ? 5 : defStyle === 'low' ? -5 : 0;
      tx += team.dir * linePush;
      if (!ballInOwnHalf) tx += team.dir * (defStyle === 'press' ? 4 : 1);
      ty += clamp((ball.y - 34) * .14, -6, 6);
      // 防守时保持一条完整防线：球在中场，后卫就压到中场；球进禁区，整条线回收
      const defLine = clamp(ball.x - team.dir * 15, ownGoalX + team.dir * 12, ownGoalX + team.dir * 52);

      if (mp.role === 'CB') {
        tx = lerp(tx, defLine - team.dir * 2, .76);
        tx = Math.min(tx, ball.x - team.dir * 3);
        tx = Math.max(tx, ownGoalX + team.dir * 8);
        maxDev = 32;
      } else if (mp.role === 'LB' || mp.role === 'RB') {
        const mySide = mp.role === 'LB' ? -1 : 1;
        tx = lerp(tx, defLine + team.dir * 2, .55);
        tx = Math.min(tx, ball.x - team.dir * 1);
        if (mySide !== ballSide) ty = lerp(ty, 34, .24);
        maxDev = 32;
      } else if (mp.role === 'DM') {
        tx = lerp(tx, defLine + team.dir * 8, .5);
        tx = Math.min(tx, ball.x - team.dir * 3);
        ty = lerp(ty, 34 + (ball.y - 34) * .2, .4);
        maxDev = 30;
      } else if (['CM','LM','RM','AM'].includes(mp.role)) {
        tx = lerp(tx, defLine + team.dir * (mp.role === 'AM' ? 16 : 12), .38);
        tx = Math.min(tx, ball.x - team.dir * 1);
        maxDev = 32;
      } else if (mp.role === 'ST' || mp.role === 'SS') {
        // 防守时回收到中线附近；只有高位逼抢才继续前压
        const target = team.side === 'left' ? 48 : 57;
        tx = lerp(tx, target, defStyle === 'press' && ballInOwnHalf ? .18 : .55);
        ty = lerp(ty, 34 + (ball.y - 34) * .2, .3);
        maxDev = 28;
      }

      const markId = team.markAssignments[mp.pid];
      if (markId && mp.role !== 'ST' && mp.role !== 'SS') {
        const mark = this.allPlayers.find(x => x.pid === markId && x.onPitch);
        if (mark) {
          const markInBox = this.isInBox(mark, mark.team);
          const tight = markInBox || team.tactics.defense === 'press' || dist(mp.x, mp.y, mark.x, mark.y) < 16;
          const markTargetX = mark.x - team.dir * (markInBox ? 1.1 : 1.8);
          tx = lerp(tx, markTargetX, tight ? .74 : .58);
          ty = lerp(ty, mark.y, tight ? .64 : .5);
          if (tight) maxDev = Math.max(maxDev, 35);
        }
      }
      const oppOwner = this.ball.owner && this.ball.owner.team !== team ? this.ball.owner : null;
      // 第二防守人：持球推进时主动上抢，站到持球人与球门之间，形成双人包夹。
      if (team.coverPlayer === mp) {
        if (oppOwner) {
          tx = lerp(tx, ball.x - team.dir * 3.2, .62);
          ty = lerp(ty, ball.y, .54);
          maxDev = 36;
        } else {
          tx = lerp(tx, ball.x - team.dir * 3.2, .58);
          ty = lerp(ty, lerp(ball.y, 34, .2), .52);
          maxDev = 35;
        }
      }
      if (team.presser === mp) {
        if (oppOwner) {
          // 不再只追着球跑：目标是持球人前方、靠本方球门一侧的拦截点。
          tx = ball.x - team.dir * 2.2 + (oppOwner.vx || 0) * .12;
          ty = ball.y + (oppOwner.vy || 0) * .1;
        } else {
          tx = ball.x + ball.vx * .05;
          ty = ball.y + ball.vy * .04;
        }
        maxDev = 40;
      }
    }

    // 与队友保持距离，减少多人挤在同一点
    let sx = 0, sy = 0;
    for (const mate of team.players) {
      if (mate === mp || !mate.onPitch) continue;
      const d = dist(mp.x, mp.y, mate.x, mate.y);
      if (d < 6.5 && d > .1) {
        const w = (6.5 - d) / 6.5;
        sx += (mp.x - mate.x) / d * w * 3.2;
        sy += (mp.y - mate.y) / d * w * 3.2;
      }
    }
    tx += sx; ty += sy;
    // 限制离阵型基准点的距离，防止全队被球吸走
    const dx = tx - base.x, dy = ty - base.y;
    const dl = Math.hypot(dx, dy);
    const devLimit = team.presser === mp ? 38 : maxDev;
    if (dl > devLimit) {
      tx = base.x + dx / dl * devLimit;
      ty = base.y + dy / dl * devLimit;
    }
    // 进攻球员自己观察越位线：无球跑位时保持在线后，不再长期站在越位位置等球。
    if (phase === 'attack' && this.ball.owner !== mp) {
      const line = this.offsideLineFor(team);
      if (line) {
        const margin = (mp.role === 'ST' || mp.role === 'SS') ? 1.25 : .9;
        const limit = line.x - team.dir * margin;
        if (team.dir > 0) tx = Math.min(tx, limit);
        else tx = Math.max(tx, limit);
      }
    }
    mp.targetX = clamp(tx, 3, 102);
    mp.targetY = clamp(ty, 3, 65);
  }
  slotBase(mp) {
    const team = mp.team;
    const slots = FORMATION_SLOTS[team.formation] || FORMATION_SLOTS['4-4-2'];
    const slot = slots[mp.slotIndex] || { x: .4, y: .5 };
    return { x: team.side === 'left' ? 2 + slot.x * 100 : 103 - slot.x * 100, y: slot.y * 68 };
  }
  gkPosition(mp) {
    const team = mp.team;
    const goalX = team.side === 'left' ? 0 : 105;
    const ballDist = Math.abs(this.ball.x - goalX);
    const off = team.side === 'left' ? 1.7 : -1.7;
    let x = goalX + off;
    let y = clamp(34 + (this.ball.y - 34) * .36, 29.5, 38.5);
    if (this.ball.owner && this.ball.owner.team !== team) {
      const od = dist(this.ball.owner.x, this.ball.owner.y, goalX, 34);
      if (od < 26 && !this.ball.owner.isGK) x = goalX + (team.side === 'left' ? 1 : -1) * clamp(20 - od, 1.7, 8);
      if (this.ball.owner.role === 'ST' && od < 14) x = goalX + (team.side === 'left' ? 1 : -1) * 2.4;
    }
    if (this.ball.shotMeta && !this.ball.shotMeta.done) {
      const tm = this.ball.shotMeta;
      y = lerp(y, tm.targetY, .32);
    }
    mp.targetX = x; mp.targetY = y;
    // 持球门将交给 gkDecision，这里不改
    return { x, y };
  }
  ballFlightTime() {
    const b = this.ball;
    if (b.z <= 0) return 0;
    const g = 12;
    return (b.vz + Math.sqrt(Math.max(0, b.vz * b.vz + 2 * g * b.z))) / g;
  }
  ballLandingPoint() {
    const b = this.ball;
    const t = this.ballFlightTime();
    return { x: clamp(b.x + b.vx * t, .6, 104.4), y: clamp(b.y + b.vy * t, .6, 67.4), t };
  }
  nearestTwoToBall(team) {
    const land = this.ballLandingPoint();
    return team.players.filter(mp => mp.onPitch && !mp.isGK)
      .sort((a, b) => dist(a.x, a.y, land.x, land.y) - dist(b.x, b.y, land.x, land.y))
      .slice(0, 2);
  }
  headerContest(b) {
    if (!HEADER_SHOTS_ONLY) return false;
    if (this.simTime < (b.headerLockUntil || 0)) return false;
    if (b.z < 1.15 || b.z > 2.7 || b.vz > 5.5) return false;
    // 角球/任意球/传中进入禁区时，防守方也可以头球解围；普通高球仍只允许进攻方在对方禁区攻门。
    const boxSide = b.x > 88.5 ? 'right' : b.x < 16.5 ? 'left' : null;
    const defendingTeam = boxSide ? this.teams[boxSide] : null;
    const attackingTeam = defendingTeam ? this.getOpponent(defendingTeam) : null;
    const canDefendHeader = b.headerContext === 'corner' || b.headerContext === 'freekick' || b.passMeta?.type === 'cross';
    const candidates = this.allPlayers.filter(p => {
      if (!p.onPitch || p === b.lastTouch) return false;
      // 防守方在定位球防守时争顶范围略大，避免只站在原地看进攻球员顶球。
      const radius = canDefendHeader && p.team === defendingTeam ? 2.75 : 2.15;
      return dist(p.x, p.y, b.x, b.y) < radius;
    });
    if (!candidates.length) return false;
    const gk = candidates.find(p => p.isGK && (p.team.side === 'left' ? p.x < 18 : p.x > 87));
    if (gk && chance(.78)) {
      b.owner = gk;
      b.vx = 0; b.vy = 0; b.z = 0; b.vz = 0;
      b.x = gk.x; b.y = gk.y;
      b.passMeta = null; b.shotMeta = null;
      b.headerContext = null;
      b.trail = []; b.trailActiveUntil = 0;
      b.lastTouch = gk; b.lastTouchTeam = gk.team;
      b.noControlUntil = this.simTime + .3;
      gk.ballHoldUntil = this.simTime + .3;
      this.addComment(Math.floor(this.time), `${gk.name} 高高跃起，摘下高空球。`, 'general');
      return true;
    }
    const attackers = candidates.filter(p => {
      const goalX = p.team.side === 'left' ? 105 : 0;
      return p.team.phase === 'attack' && this.isInBox(p, p.team) && dist(p.x, p.y, goalX, 34) < 22;
    });
    const defenders = canDefendHeader && attackingTeam
      ? candidates.filter(p => p.team === defendingTeam && this.isInBox(p, attackingTeam))
      : [];
    if (!attackers.length && !defenders.length) {
      b.headerLockUntil = this.simTime + .7;
      b.headerContext = null;
      return false;
    }
    const headerScore = p => p.p.height + this.attr(p, 'str') * .25 + (p.team === defendingTeam ? 8 : 0);
    const best = [...attackers, ...defenders].sort((a, b2) => headerScore(b2) - headerScore(a))[0];
    this.headBall(best, b);
    return true;
  }
  headBall(mp, b) {
    const team = mp.team;
    const goalX = team.side === 'left' ? 105 : 0;
    const distGoal = dist(mp.x, mp.y, goalX, 34);
    b.lastTouch = mp; b.lastTouchTeam = team;
    b.passMeta = null; b.shotMeta = null;
    // 头球后给一个短暂的“争顶锁”，避免两个人在原地连续顶来顶去、
    // 每次顶球都把速度卸掉，最后让第三个人轻松停球。
    b.headerLockUntil = this.simTime + .85;
    b.lastHeaderAt = this.simTime;
    b.noControlUntil = this.simTime + .45;
    b.headerContext = null;
    b.owner = null;
    if (this.isInBox(mp, team) && distGoal < 22 && Math.abs(mp.y - 34) < 16) {
      this.shoot(mp, false, true);
      return;
    }
    // 头球摆渡极低概率（0.1%）；其余情况一律向安全方向顶出，避免连续头球。
    let target = null, best = -1e9;
    for (const mate of team.players) {
      if (mate === mp || !mate.onPitch || mate.isGK) continue;
      const forward = (mate.x - mp.x) * team.dir;
      const score = forward * .18 + this.openness(mate) * 1.6 - Math.abs(mate.y - mp.y) * .04;
      if (score > best) { best = score; target = mate; }
    }
    const power = 14 + this.attr(mp, 'str') * .075 + (mp.p.height - 175) * .06;
    const flickOn = team.phase === 'attack' && target && best > 0 && chance(.001);
    if (flickOn) {
      const dx = target.x - mp.x, dy = target.y - mp.y;
      const d = Math.hypot(dx, dy) || 1;
      b.vx = dx / d * power;
      b.vy = dy / d * power;
    } else {
      b.vx = team.dir * power;
      b.vy = (mp.y < 34 ? 1 : -1) * (4 + rand() * 4);
    }
    b.z = 1.35; b.vz = 4.2 + rand() * 1.8;
    this.addComment(Math.floor(this.time), flickOn ? `${mp.name} 头球摆渡。` : team.phase === 'defense' ? `${mp.name} 头球解围。` : `${mp.name} 头球顶出。`, 'general');
  }
  updateBall(dt) {
    if (this.ball.owner) return;
    const b = this.ball;
    const prevX = b.x, prevY = b.y;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    // 空中球
    if (b.z > 0 || b.vz > 0) {
      b.z += b.vz * dt;
      // 高弧线任意球使用更陡的下坠；低平球、扑救和封堵后的反弹球恢复正常重力。
      b.vz -= (b.shotMeta?.freeKick && !b.shotMeta.lowFreeKick && !b.shotMeta.done ? 26 : 12) * dt;
      if (b.z <= 0) { b.z = 0; b.vz = 0; b.vx *= .94; b.vy *= .94; }
    }
    const speed = Math.hypot(b.vx, b.vy);
    if (b.z <= .05) {
      const fric = 2.8 * dt;
      if (speed <= fric) { b.vx = 0; b.vy = 0; }
      else { b.vx -= b.vx / speed * fric; b.vy -= b.vy / speed * fric; }
    }
    // 记录高速球/射门/被挡出后的完整飞行轨迹，绘制时形成渐隐尾迹。
    const trailOn = (b.shotMeta && !b.shotMeta.done) || b.trailActiveUntil > this.simTime;
    if (trailOn) {
      const last = b.trail[b.trail.length - 1];
      if (!last || dist(last.x, last.y, b.x, b.y) > .12) {
        b.trail.push({ x: b.x, y: b.y, z: b.z });
        if (b.trail.length > 40) b.trail.shift();
      }
    } else if (b.trail.length) {
      b.trail = [];
    }
    if (this.lastPassLine && performance.now() > this.lastPassLine.until) this.lastPassLine = null;
    if (b.passMeta && this.simTime - (b.passMeta.createdAt || 0) > 4) b.passMeta = null;
    // 出界 / 进球检测
    const crossedRight = b.x >= 105, crossedLeft = b.x <= 0;
    if (crossedRight || crossedLeft) {
      const goalTop = 34 - 3.66, goalBottom = 34 + 3.66;
      const inGoal = b.y > goalTop && b.y < goalBottom && b.z < 2.44;
      const side = crossedRight ? 'left' : 'right'; // 射向右方 = 左队进攻
      const scoringTeam = this.teams[side];
      if (inGoal) {
        if (b.shotMeta && b.shotMeta.done) return;
        if (b.shotMeta?.save) {
          // 门将扑出
          const gk = b.shotMeta.gk;
          if (gk) { gk.saves++; gk.rating += .35; this.stats[gk.side].saves++; }
          // 扑救后让球真实弹出：有时扑回场内，有时扑出底线形成角球，轨迹全程可见。
          // 门将扑救后多数把球留在场内，减少“扑出底线→连续角球”的循环。
          const parryWide = chance(.22);
          b.x = crossedRight ? 104.2 : .8;
          if (parryWide) {
            const outSign = b.y < 34 ? -1 : 1;
            b.y = clamp(34 + outSign * (5.2 + rand() * 2.4), 22, 46);
            b.vx = crossedRight ? (9 + rand() * 5) : -(9 + rand() * 5);
            b.vy = outSign * (4 + rand() * 3);
            b.z = .45; b.vz = 1.4 + rand() * 1.2;
          } else {
            b.y = clamp(b.y, 30.5, 37.5);
            b.vx = -Math.sign(b.vx || 1) * (9 + rand() * 9);
            b.vy = (rand() - .5) * 10;
            b.z = .4; b.vz = 2 + rand() * 2;
          }
          b.shotMeta.done = true;
          b.trailActiveUntil = this.simTime + 1.4;
          b.lastTouch = gk || b.lastTouch;
          b.lastTouchTeam = gk?.team || b.lastTouchTeam;
          this.addComment(Math.floor(this.time), b.shotMeta.penalty ? '门将扑出了点球！' : '门将做出扑救，把球挡了出去！', 'save');
          this.ball.noControlUntil = this.simTime + .25;
          return;
        }
        this.scoreGoal(side, b);
        return;
      }
      // 出底线
      const lastTeam = b.lastTouchTeam;
      const isAttacking = lastTeam === scoringTeam;
      if (isAttacking) this.restartGoalKick(this.teams[side === 'left' ? 'right' : 'left']);
      else this.restartCorner(scoringTeam, crossedRight ? 'right' : 'left', b.y);
      return;
    }
    if (b.y <= 0 || b.y >= 68) {
      const team = b.lastTouchTeam;
      const other = team === this.teams.left ? this.teams.right : this.teams.left;
      this.restartThrowIn(other, b.x, b.y <= 0 ? 0.7 : 67.3);
      return;
    }
    // 射门在飞行中：只允许防守球员封堵，不允许像传球一样被直接控制
    if (b.shotMeta && !b.shotMeta.done) {
      if (b.z < 2.1) {
        for (const blocker of this.allPlayers) {
          if (!blocker.onPitch || blocker.isGK || blocker.team === b.shotMeta.team) continue;
          if (dist(blocker.x, blocker.y, b.x, b.y) > 1.15) continue;
          const handballInBox = this.isInBox(blocker, b.shotMeta.team);
          if (chance(handballInBox ? .01 : .005)) {
            this.foul(blocker, b.shotMeta.shooter, { type: 'handball', spotX: b.x, spotY: b.y });
            return;
          }
          if (chance(.16 + this.attr(blocker, 'def') * .0012)) {
            if (b.shotMeta.onTarget) this.stats[b.shotMeta.team.side].onTarget = Math.max(0, this.stats[b.shotMeta.team.side].onTarget - 1);
            this.stats[blocker.team.side].blocks = (this.stats[blocker.team.side].blocks || 0) + 1;
            const shotDir = b.shotMeta.team.dir;
            const blockedInBox = this.isInBox(blocker, b.shotMeta.team);
            b.shotMeta = null;
            if (blockedInBox && chance(.55)) {
              // 禁区内封堵后向球门线外侧弹出，形成真实轨迹，之后是否角球由出界判定决定。
              b.vx = shotDir * (10 + rand() * 8);
              b.vy = (b.y < 34 ? -1 : 1) * (10 + rand() * 8);
            } else {
              b.vx = (rand() - .5) * 16;
              b.vy = (rand() - .5) * 12 + (b.vy > 0 ? 4 : -4);
            }
            b.z = .3; b.vz = 1.8 + rand() * 2;
            b.lastTouch = blocker; b.lastTouchTeam = blocker.team;
            b.trailActiveUntil = this.simTime + 1.4;
            b.noControlUntil = this.simTime + .3;
            this.addComment(Math.floor(this.time), `${blocker.name} 用身体封堵了射门。`, 'general');
            return;
          }
          if (chance(.2)) {
            if (b.shotMeta.onTarget) this.stats[b.shotMeta.team.side].onTarget = Math.max(0, this.stats[b.shotMeta.team.side].onTarget - 1);
            this.stats[blocker.team.side].blocks = (this.stats[blocker.team.side].blocks || 0) + 1;
            const shotDir = b.shotMeta.team.dir;
            const blockedInBox = this.isInBox(blocker, b.shotMeta.team);
            b.shotMeta = null;
            if (blockedInBox && chance(.45)) {
              b.vx = shotDir * (9 + rand() * 9);
              b.vy = (b.y < 34 ? -1 : 1) * (9 + rand() * 9);
            } else {
              const ang = rand() * Math.PI * 2;
              const sp = 6 + rand() * 9;
              b.vx = Math.cos(ang) * sp; b.vy = Math.sin(ang) * sp;
            }
            b.z = .35; b.vz = 1.8 + rand() * 1.6;
            b.lastTouch = blocker; b.lastTouchTeam = blocker.team;
            b.trailActiveUntil = this.simTime + 1.2;
            b.noControlUntil = this.simTime + .28;
            this.addComment(Math.floor(this.time), `${blocker.name} 用身体把高速球挡出。`, 'general');
            return;
          }
        }
      }
      return;
    }
    // 高空球：去落点争顶，不允许像地面球一样直接吸在脚下
    if (b.z > 1.15) {
      if (this.headerContest(b)) return;
      return;
    }
    // 球员接触球
    if (this.simTime < b.noControlUntil) return;
    const ballSpeed = Math.hypot(b.vx, b.vy);
    let best = null, intercepted = false, passCompleted = false;
    const passMeta = b.passMeta;
    if (passMeta && passMeta.from?.onPitch) {
      const intended = passMeta.intended;
      const fromTeam = passMeta.from.team;
      // 1) 接球人优先：短传在无人干扰时应该有很高的成功率
      if (intended && intended.onPitch && dist(intended.x, intended.y, b.x, b.y) < 2.25) {
        if (passMeta.offside?.player === intended) {
          this.callOffside(passMeta.offside);
          return;
        }
        let control = .92 + this.attr(intended, 'dri') * .0012 - ballSpeed * .003;
        if (b.z > 1.0) control -= .08;
        if (ballSpeed > 20) control -= .04;
        if (this.pressureOn(intended).amount > .5) control -= .08;
        if (intended.p.traits?.includes('first_touch')) control += .035;
        control = clamp(control, .62, .99);
        if (chance(control)) { best = intended; passCompleted = true; }
        else {
          // 停球失误，球弹开，但不直接送给对手
          b.lastTouch = intended; b.lastTouchTeam = intended.team;
          b.passMeta = null;
          b.vx = (rand() - .5) * 7; b.vy = (rand() - .5) * 7; b.z = 0; b.vz = 0;
          b.noControlUntil = this.simTime + .28;
          return;
        }
      }
      // 2) 同队球员在极近距离可以接手，但不应该“抢走”正常传球
      if (!best) {
        for (const mp of this.allPlayers) {
          if (!mp.onPitch || mp.team !== fromTeam || mp === passMeta.from || mp === intended) continue;
          if (dist(mp.x, mp.y, b.x, b.y) > 1.0) continue;
          if (ballSpeed > 15) continue;
          if (chance(.5)) { best = mp; passCompleted = true; break; }
        }
      }
      // 3) 对手只有真正贴到传球线路上才能拦截，不再“路过就断”
      if (!best && b.z < 2.2) {
        let thief = null, td = .85;
        for (const op of this.allPlayers) {
          if (!op.onPitch || op.team === fromTeam || op.isGK) continue;
          const d = dist(op.x, op.y, b.x, b.y);
          if (d < td) { td = d; thief = op; }
        }
        if (thief) {
          if (b.z < 1.4 && passMeta.from && chance(.002)) {
            this.foul(thief, passMeta.from, { type: 'handball', spotX: b.x, spotY: b.y });
            return;
          }
          if (ballSpeed > 16) {
            b.passMeta = null;
            b.lastTouch = thief; b.lastTouchTeam = thief.team;
            b.vx = (rand() - .5) * 13; b.vy = (rand() - .5) * 13;
            b.z = .35; b.vz = 2 + rand() * 1.5;
            b.noControlUntil = this.simTime + .25;
            this.addComment(Math.floor(this.time), `${thief.name} 被高速球击中，球弹了出去。`, 'general');
            return;
          }
          let intercept = .11 + this.attr(thief, 'tac') * .0025 + this.attr(thief, 'def') * .0008;
          intercept += (this.attr(thief, 'spd') - ballSpeed) * .004;
          intercept = clamp(intercept, .05, .35);
          if (chance(intercept)) { best = thief; intercepted = true; }
        }
      }
      // 没有球员碰到，球继续飞行；不再每帧自动判给最近的人
      if (!best) return;
    } else {
      let bd = 1.6;
      for (const mp of this.allPlayers) {
        if (!mp.onPitch) continue;
        const d = dist(mp.x, mp.y, b.x, b.y);
        if (mp.isGK) {
          const goalX = mp.team.side === 'left' ? 0 : 105;
          if (dist(mp.x, mp.y, goalX, 34) < 18) bd = Math.max(bd, 1.85);
        }
        if (d < bd) { bd = d; best = mp; }
      }
      if (!best) return;
      const clean = ballSpeed < 13 && b.z < 1.05;
      if (!best.isGK && !clean) {
        const ang = rand() * Math.PI * 2;
        const deflectSpeed = clamp(ballSpeed * .35, 4, 15);
        b.vx = Math.cos(ang) * deflectSpeed;
        b.vy = Math.sin(ang) * deflectSpeed;
        b.z = .35; b.vz = 2 + rand() * 1.8;
        b.lastTouch = best; b.lastTouchTeam = best.team;
        b.noControlUntil = this.simTime + .22;
        this.addComment(Math.floor(this.time), `${best.name} 将高速球挡出。`, 'general');
        return;
      }
      let control = .55 + this.attr(best, 'dri') * .0055 - ballSpeed * .007;
      if (best.isGK) control += .28;
      if (b.z > 1.8) control -= .22;
      control = clamp(control, .2, .97);
      if (!chance(control)) {
        b.vx = (rand() - .5) * 9; b.vy = (rand() - .5) * 9; b.z = 0; b.vz = 0;
        b.noControlUntil = this.simTime + .18;
        return;
      }
    }
    if (best) {
      if (passMeta && !intercepted && passCompleted) {
        this.stats[best.team.side].passesOk++;
      }
      if (intercepted) {
        this.stats[best.team.side].interceptions++;
        if (chance(.3)) this.addComment(Math.floor(this.time), `${best.name} 预判到了传球线路，完成拦截。`, 'general');
      }
      b.owner = best;
      b.lastTouch = best; b.lastTouchTeam = best.team;
      b.vx = 0; b.vy = 0; b.z = 0; b.vz = 0;
      b.passMeta = null; b.shotMeta = null; b.corner = false; b.headerContext = null;
      b.trail = []; b.trailActiveUntil = 0;
      b.indirectFreeKick = false;
      best.touches++;
      best.rating += intercepted ? .03 : .004;
      if (best.isGK) best.rating += .005;
      best.ballHoldUntil = this.simTime + .1 + rand() * .16;
      b.noControlUntil = this.simTime + .18;
    }
  }
  handleTackles(dt) {
    if (!this.ball.owner || this.ball.owner.isGK) return;
    const carrier = this.ball.owner;
    // 贴身防守：距离比旧版更大，避免只有传球线路才能断球
    const closeDefenders = this.allPlayers
      .filter(op => op.onPitch && op.team !== carrier.team && !op.isGK && dist(op.x, op.y, carrier.x, carrier.y) < 2.45)
      .sort((a, b) => dist(a.x, a.y, carrier.x, carrier.y) - dist(b.x, b.y, carrier.x, carrier.y));
    const defendingGoalX = carrier.team.side === 'left' ? 105 : 0;
    const dangerZone = this.isInBox(carrier, carrier.team) || dist(carrier.x, carrier.y, defendingGoalX, 34) < 30;
    let attempts = 0;
    for (const op of closeDefenders) {
      if (op.tackleCd > this.simTime || (op.stumbleUntil || 0) > this.simTime) continue;
      const d = dist(op.x, op.y, carrier.x, carrier.y);
      op.tackleCd = this.simTime + .78 + rand() * .5;
      attempts++;
      const tac = this.attr(op, 'tac'), dri = this.attr(carrier, 'dri');
      let success = .205 + (tac - dri) * .008 + (this.attr(op, 'str') - this.attr(carrier, 'str')) * .0025;
      if (carrier.stamina < 40) success += .045;
      if (op.p.traits?.includes('tackler')) success += .05;
      if (carrier.p.traits?.includes('dribbler')) success -= .04;
      if (carrier.evadeUntil && this.simTime < carrier.evadeUntil) success -= .14;
      if (carrier.stumbleUntil && this.simTime < carrier.stumbleUntil) success += .08;
      if (op.team.presser === op) success += .025;
      if (op.team.coverPlayer === op) success += .02;
      const ownGoalX = op.team.side === 'left' ? 0 : 105;
      if (dist(op.x, op.y, ownGoalX, 34) < dist(carrier.x, carrier.y, ownGoalX, 34)) success += .025;
      success = clamp(success, .04, .6);
      if (chance(success)) {
        this.releaseBall(carrier);
        this.ball.owner = op;
        op.ballHoldUntil = this.simTime + .24;
        this.ball.x = op.x + op.dir * .4; this.ball.y = op.y;
        this.ball.lastTouch = op; this.ball.lastTouchTeam = op.team;
        this.ball.indirectFreeKick = false;
        op.tackles++; op.rating += .08;
        carrier.rating -= .03;
        carrier.stumbleUntil = this.simTime + .3;
        carrier.nextEvade = Math.max(carrier.nextEvade || 0, this.simTime + 1.8);
        this.stats[op.team.side].tackles++;
        this.ball.noControlUntil = this.simTime + .2;
        this.addComment(Math.floor(this.time), `${op.name} 贴身抢断，从 ${carrier.name} 脚下把球捅走！`, 'general');
        return;
      }
      // 失败也可能犯规，但只保留极少数真正的鲁莽动作，避免比赛被哨声切碎。
      // 危险区域只轻微提高，保证偶尔还能出现直接任意球，而不是把比赛变成犯规大战。
      let foulChance = .015 + (tac < dri ? .003 : 0) + (op.team.tactics.defense === 'press' ? .002 : 0);
      if (dangerZone) foulChance += .03;
      if (attempts > 1) foulChance *= .5;
      if (chance(foulChance)) { this.foul(op, carrier); return; }
      // 危险区域允许第二名防守人补抢一次，避免第一个人失败后整条防线站着看。
      if (attempts >= (dangerZone ? 2 : 1)) break;
    }
  }
  callOffside(info) {
    if (!info?.player || !info?.from) return;
    const attacking = info.from.team;
    const defending = this.getOpponent(attacking);
    this.stats[attacking.side].offsides = (this.stats[attacking.side].offsides || 0) + 1;
    this.addComment(Math.floor(this.time), `越位！${info.player.name} 在传球瞬间已经越过防线，${defending.club.short} 获得间接任意球。`, 'general');
    this.addFlash('越位', info.player.name, 1200);
    this.ball.owner = null;
    this.ball.vx = 0; this.ball.vy = 0; this.ball.z = 0; this.ball.vz = 0;
    this.ball.passMeta = null; this.ball.shotMeta = null; this.ball.corner = false;
    this.beginRestart(defending, clamp(info.spotX, 3, 102), clamp(info.spotY, 3, 65), 'offside', { indirect: true, minDelay: .35, maxWait: 6 });
  }
  foul(offender, victim, opts = {}) {
    const type = opts.type || 'tackle';
    const team = offender.team;
    const attacking = this.getOpponent(team);
    this.stats[team.side].fouls++;
    // 大字提示只保留进球和犯规类事件；必须显示犯规方，而不是获得球权的一方。
    const offenderLabel = `${offender.team.club.short} · ${offender.name}`;
    this.addFlash(type === 'handball' ? '手球' : '犯规', offenderLabel, 900);
    const spotX = clamp(opts.spotX ?? victim?.x ?? this.ball.x, 3, 102);
    const spotY = clamp(opts.spotY ?? victim?.y ?? this.ball.y, 3, 65);
    const inBox = this.isInBox({ x: spotX, y: spotY }, attacking);
    const severity = rand();
    const cardChance = type === 'handball' ? .24 : .18;
    if (chance(cardChance) || severity > .965) {
      const red = severity > .993 || chance(type === 'handball' ? .02 : .012);
      this.bookPlayer(offender, red);
    }
    if (inBox) {
      const msg = type === 'handball'
        ? `手球！${offender.name} 在禁区内用手挡球，${attacking.club.name} 获得点球。`
        : `点球！${offender.name} 在禁区内犯规，${attacking.club.name} 获得点球。`;
      this.addComment(Math.floor(this.time), msg, 'card');
      this.addFlash(type === 'handball' ? '手球' : '点球', offenderLabel, 1600);
      this.ball.owner = null; this.ball.vx = 0; this.ball.vy = 0;
      this.ball.x = attacking.side === 'left' ? 94 : 11; this.ball.y = 34;
      this.ball.indirectFreeKick = false;
      // 点球也先复位所有人，等待约 1 秒再主罚。
      for (const p of this.allPlayers) {
        if (!p.onPitch) continue;
        if (p.isGK) { p.x = (p.team.side === 'left' ? 0 : 105) + p.team.dir * 1.7; p.y = 34; }
        else { p.x = p.baseX; p.y = p.baseY; }
        p.vx = 0; p.vy = 0; p.targetX = p.x; p.targetY = p.y;
      }
      this.restartTimer = 1.2;
      this.penaltyState = { team: attacking, timer: 1.0 };
      return;
    }
    // 任意球：前场危险区域由脚法最好的球员主罚，并让对方排出人墙。
    const goalX = attacking.side === 'left' ? 105 : 0;
    const directRange = dist(spotX, spotY, goalX, 34) < 33 && Math.abs(spotY - 34) < 28;
    const taker = this.bestSetPieceTaker(attacking, spotX, spotY);
    this.beginRestart(attacking, spotX, spotY, 'freekick', { taker, wait: directRange ? 1.35 : 1 });
    const msg = type === 'handball'
      ? `${offender.name}（${offender.team.club.short}）手球犯规，${attacking.club.short} 获得任意球。`
      : `${offender.name}（${offender.team.club.short}）犯规，${attacking.club.short} 获得任意球。`;
    const wallMsg = directRange ? ` ${team.club.short} 排出人墙，${taker?.name || '主罚球员'} 准备直接攻门。` : '';
    this.addComment(Math.floor(this.time), msg + wallMsg, 'general');
  }
  bookPlayer(mp, red = false) {
    if (red) {
      mp.red = 1; mp.sentOff = true; mp.onPitch = false;
      this.stats[mp.team.side].red++;
      const t = mp.team;
      t.players = t.players.filter(x => x !== mp);
      this.allPlayers = this.allPlayers.filter(x => x !== mp);
      this.addComment(Math.floor(this.time), `红牌！${mp.name} 被直接罚下。`, 'card');
      this.addFlash('红牌', mp.name, 1400);
      if (this.ball.owner === mp) this.releaseBall(mp);
      if (mp.isGK) {
        this.gk[mp.side] = null;
        // 让一名场上球员客串门将
        const sub = mp.team.players.filter(x => x.onPitch && !x.isGK).sort((a,b) => b.p.attrs.gk - a.p.attrs.gk)[0];
        if (sub) { sub.isGK = true; sub.role = 'GK'; this.gk[mp.side] = sub; }
      }
      mp.rating -= 1.8;
      return;
    }
    mp.yellow++;
    this.stats[mp.team.side].yellow++;
    mp.rating -= .22;
    if (mp.yellow >= 2) {
      mp.sentOff = true; mp.onPitch = false;
      this.stats[mp.team.side].red++;
      const t = mp.team;
      t.players = t.players.filter(x => x !== mp);
      this.allPlayers = this.allPlayers.filter(x => x !== mp);
      this.addComment(Math.floor(this.time), `第二张黄牌！${mp.name} 被罚下。`, 'card');
      this.addFlash('红牌', mp.name, 1400);
      if (this.ball.owner === mp) this.releaseBall(mp);
      if (mp.isGK) {
        this.gk[mp.side] = null;
        const sub = t.players.filter(x => x.onPitch && !x.isGK).sort((a,b) => b.p.attrs.gk - a.p.attrs.gk)[0];
        if (sub) { sub.isGK = true; sub.role = 'GK'; this.gk[mp.side] = sub; }
      }
    } else {
      this.addComment(Math.floor(this.time), `黄牌：${mp.name}。`, 'card');
    }
  }
  nearestPlayerOfTeam(team, x, y, excludeGk = false) {
    let best = null, bd = 999;
    for (const mp of team.players) {
      if (!mp.onPitch) continue;
      if (excludeGk && mp.isGK) continue;
      const d = dist(mp.x, mp.y, x, y);
      if (d < bd) { bd = d; best = mp; }
    }
    return best;
  }
  restartThrowIn(team, x, y) {
    // y 是出界时的那条边线（上边约 0，下边约 68），不能只判断 y<=0，否则上边线会被发到下边线。
    const touchlineY = y < 34 ? .9 : 67.1;
    this.beginRestart(team, clamp(x, 2, 103), touchlineY, 'throwin', { minDelay: .3, maxWait: 6 });
    this.addComment(Math.floor(this.time), `边线球，${team.club.short} 重新组织进攻。`, 'general');
  }
  restartGoalKick(team) {
    const gk = team.players.find(mp => mp.onPitch && mp.isGK) || this.nearestPlayerOfTeam(team, team.side === 'left' ? 3 : 102, 34);
    if (!gk) return;
    this.beginRestart(team, team.side === 'left' ? 5.5 : 99.5, 34, 'goalkick', { taker: gk, walkFactor: .5, minDelay: .4, maxWait: 4.5 });
    this.addComment(Math.floor(this.time), `${team.club.short} 门将准备开球。`, 'general');
  }
  restartCorner(team, side, ballY = 34) {
    this.stats[team.side].corners++;
    // 角球点必须在边线内侧，不能贴着 y=1/67 发球；否则第一脚横传就会滚出边线。
    // 角球从球出底线的那一侧发出，不再随机换边。
    const cornerY = ballY < 34 ? 1.6 : 66.4;
    const taker = this.bestCornerTaker(team);
    this.beginRestart(team, side === 'right' ? 104 : 1, cornerY, 'corner', { corner: true, taker, walkFactor: 1.1, minDelay: .35, maxWait: 8 });
    this.addComment(Math.floor(this.time), `角球，${team.club.short} 有机会把球送进禁区。`, 'chance');
  }
  scoreGoal(side, ball) {
    const team = this.teams[side];
    team.score++;
    const shooter = ball.shotMeta?.shooter;
    const last = ball.lastTouch;
    let scorer = shooter || last;
    if (!scorer) return this.restartGoalKick(this.teams[side === 'left' ? 'right' : 'left']);
    const ownGoal = scorer.team !== team;
    if (ownGoal) { scorer.rating -= 1.2; this.addComment(Math.floor(this.time), `乌龙球！${scorer.name} 把球送进了自家球门。`, 'goal'); }
    else {
      scorer.goals++;
      scorer.rating += 1.25;
      // 助攻
      const assist = ball.shotMeta?.assist || (ball.passMeta?.from && ball.passMeta.from.team === team ? ball.passMeta.from : null);
      if (assist && assist !== scorer && assist.team === team) { assist.assists++; assist.rating += .55; }
      this.addComment(Math.floor(this.time), `进球！${team.club.name}！${scorer.name} 把球送进了球门！`, 'goal');
    }
    this.addFlash('进球', `${team.club.name} · ${Math.floor(this.time)}'`, 2000);
    this.goalEvents.push({ side, scorerId: scorer.pid, scorerName: scorer.name, minute: Math.floor(this.time), ownGoal, assistId: ball.shotMeta?.assist?.pid || null });
    ball.owner = null; ball.vx = 0; ball.vy = 0; ball.z = 0; ball.vz = 0;
    ball.x = 52.5; ball.y = 34;
    ball.shotMeta = null; ball.passMeta = null; ball.corner = false;
    ball.trail = []; ball.trailActiveUntil = 0;
    this.restartTimer = 2.2;
    this._pendingKickoff = side === 'left' ? 'right' : 'left';
    this._settling = true;
    this.prepareKickoffWalk(this._pendingKickoff);
  }
  checkInjuries(dt) {
    this._injuryTimer = (this._injuryTimer || 0) + dt;
    if (this._injuryTimer < 5) return;
    this._injuryTimer = 0;
    for (const mp of this.allPlayers) {
      if (!mp.onPitch || mp.injuryNow) continue;
      let p = .00028;
      if (mp.stamina < 35) p *= 2.1;
      if (mp.p.traits?.includes('injury_prone')) p *= 2.5;
      if (mp.p.traits?.includes('ironman')) p *= .4;
      p *= (1 - (this.userClub.facility.medical || 1) * .08);
      if (chance(p)) {
        mp.injuryNow = true;
        const days = randInt(3, 15);
        mp.injuryDays = days;
        this.addComment(Math.floor(this.time), `${mp.name} 倒在地上，似乎无法继续坚持。`, 'card');
      }
    }
  }
  checkAISubs() {
    if (this.time < 55) return;
    const sides = this.friendly ? ['left', 'right'] : ['right'];
    for (const side of sides) {
      const team = this.teams[side];
      if (team.subsUsed >= (this.friendly ? MAX_SUBS : 3) || this.time - (team.lastAutoSub || 0) < 8) continue;
      const candidates = team.players.filter(mp => mp.onPitch && !mp.isGK && mp.stamina < 55).sort((a,b) => a.stamina - b.stamina);
      const out = candidates[0];
      if (!out) continue;
      const bench = team.bench.filter(b => !b.used && b.pos !== 'GK');
      if (!bench.length) continue;
      bench.sort((a,b) => b.stamina - a.stamina);
      const incoming = bench[0];
      team.lastAutoSub = this.time;
      this.substitute(side, out.pid, incoming.pid, true);
    }
  }
  substitute(side, outPid, inPid, ai = false) {
    const team = this.teams[side];
    if (team.subsUsed >= MAX_SUBS) return { ok: false, msg: '换人次数已经用完。' };
    const out = team.players.find(mp => mp.pid === outPid && mp.onPitch);
    const bench = team.bench.find(mp => mp.pid === inPid && !mp.used);
    if (!out || !bench) return { ok: false, msg: '换人信息无效。' };
    if (out.isGK && bench.pos !== 'GK') return { ok: false, msg: '门将位置只能用门将替换。' };
    const inMp = this.makeSubPlayer(bench, out, side);
    // 记录出场
    out.onPitch = false;
    bench.used = true;
    const idx = team.players.indexOf(out);
    if (idx >= 0) team.players[idx] = inMp;
    this.allPlayers = this.allPlayers.filter(mp => mp !== out);
    this.allPlayers.push(inMp);
    this.participants.push(inMp);
    if (out.isGK) this.gk[side] = inMp;
    if (this.restartState) {
      if (this.restartState.taker === out) this.restartState.taker = inMp;
      inMp.x = clamp(this.restartState.ballX - this.restartState.team.dir * .5, .8, 104.2);
      inMp.y = clamp(this.restartState.ballY, .8, 67.2);
      inMp.vx = 0; inMp.vy = 0;
      inMp.targetX = inMp.x; inMp.targetY = inMp.y;
    } else if (this._settling) {
      if (this._pendingKickoffTakerId === out.pid) this._pendingKickoffTakerId = inMp.pid;
      this.applyKickoffSettleTargets();
    }
    team.subsUsed++;
    this.addComment(Math.floor(this.time), `${team.club.short} 换人：${out.name} 下，${inMp.name} 上。`, 'sub');
    return { ok: true };
  }
  makeSubPlayer(bench, out, side) {
    const p = bench.p;
    return {
      pid: p.id, p, name: p.name, number: p.number || 0, pos: p.pos, role: out.role, slotIndex: out.slotIndex,
      side, team: this.teams[side], isUser: this.teams[side].isUser,
      x: out.x, y: out.y, baseX: out.baseX, baseY: out.baseY, vx: 0, vy: 0, targetX: out.x, targetY: out.y,
      dir: out.dir, stamina: clamp(p.fitness ?? 85, 20, 100), startStamina: clamp(p.fitness ?? 85, 20, 100),
      onPitch: true, sentOff: false, injuryNow: false, injuryDays: 0, started: false, minutes: 0,
      yellow: 0, red: 0, goals: 0, assists: 0, shots: 0, keyPasses: 0, tackles: 0, saves: 0, conceded: 0,
      rating: 6.2, decisionTimer: rand() * .2, tackleCd: 0, dive: null, touches: 0, lastAction: '', isGK: p.pos === 'GK' && out.isGK, runPhase: rand() * 6.28, labelShift: out.labelShift || 0,
    };
  }
  setUserTactics(side, key, value) {
    if (!this.teams[side]) return;
    if (key === 'attack' && ATTACK_STYLES[value]) this.teams[side].tactics.attack = value;
    if (key === 'defense' && DEFENSE_STYLES[value]) this.teams[side].tactics.defense = value;
    if (key === 'tempo' && TEMPO_STYLES[value]) this.teams[side].tactics.tempo = value;
    this.tacticalEdgeLeft = tacticalPreview(this.teams.left.tactics, this.teams.right.tactics).score;
  }
  changeFormation(side, formation) {
    const team = this.teams[side];
    if (!team || !FORMATION_SLOTS[formation]) return false;
    const slots = FORMATION_SLOTS[formation];
    const available = team.players.filter(mp => mp.onPitch);
    const used = new Set();
    const assignments = new Array(slots.length).fill(null);
    const order = slots.map((s, i) => ({ ...s, i })).sort((a, b) => (a.pos === 'GK' ? -1 : b.pos === 'GK' ? 1 : 0));
    for (const slot of order) {
      let best = null, bestScore = -1e9;
      for (const mp of available) {
        if (used.has(mp.pid)) continue;
        if (slot.pos === 'GK' && !mp.isGK) continue;
        if (slot.pos !== 'GK' && mp.isGK) continue;
        const fit = positionFit(mp.p, slot.pos);
        const score = effectiveOvrForRole(mp.p, slot.pos) + fit * 18;
        if (score > bestScore) { bestScore = score; best = mp; }
      }
      if (best) { used.add(best.pid); assignments[slot.i] = best; }
    }
    for (let i = 0; i < slots.length; i++) {
      const mp = assignments[i];
      if (!mp) continue;
      const slot = slots[i];
      mp.role = slot.pos;
      mp.slotIndex = i;
      mp.baseX = side === 'left' ? 2 + slot.x * 100 : 103 - slot.x * 100;
      mp.baseY = slot.y * 68;
      mp.targetX = mp.baseX; mp.targetY = mp.baseY;
    }
    team.formation = formation;
    if (this.restartState) this.snapRestartPositions(this.restartState.team, this.restartState.type, this.restartState.ballX, this.restartState.ballY, this.restartState.taker);
    else if (this._settling) this.applyKickoffSettleTargets();
    this.addComment(Math.floor(this.time), `${team.club.short} 改为 ${formation}，球员们开始适应新的站位。`, 'general');
    return true;
  }
  halftimeAdjustAI() {
    const team = this.teams.right;
    const diff = team.score - this.teams.left.score;
    if (diff < 0) { team.tactics.tempo = 'fast'; team.tactics.attack = chance(.5) ? 'wing' : 'counter'; team.tactics.defense = 'press'; }
    else if (diff > 0) { team.tactics.tempo = 'slow'; team.tactics.defense = 'low'; team.tactics.attack = 'counter'; }
    this.tacticalEdgeLeft = tacticalPreview(this.teams.left.tactics, this.teams.right.tactics).score;
  }
  secondHalf() {
    this.half = 2;
    this.halfTime = false;
    this.paused = false;
    this.time = 45;
    this.setKickoff(this.kickoffSide === 'left' ? 'right' : 'left');
    this.addComment(45, '下半场比赛开始。', 'general');
    this.halftimeAdjustAI();
  }
  endMatch() {
    if (this.finished) return;
    this.finished = true;
    this.paused = true;
    this.time = 90 + this.addedTime2;
    this.addComment(90 + this.addedTime2, `全场比赛结束。${this.userClub.short} ${this.teams.left.score} : ${this.teams.right.score} ${this.oppClub.short}。`, 'general');
    if (this.onFinish) this.onFinish(this);
  }
  summary() {
    const teamStats = {};
    for (const side of ['left', 'right']) {
      const s = this.stats[side];
      const totalPoss = this.stats.left.poss + this.stats.right.poss || 1;
      teamStats[side] = {
        possession: Math.round(s.poss / totalPoss * 100), shots: s.shots, onTarget: s.onTarget,
        xg: round(s.xg, 2), passes: s.passes, passesOk: s.passesOk, fouls: s.fouls,
        corners: s.corners, yellow: s.yellow, red: s.red, saves: s.saves, score: this.teams[side].score,
        tackles: s.tackles, dribbles: s.dribbles, interceptions: s.interceptions,
        offsides: s.offsides || 0,
        passAccuracy: s.passes ? Math.round(s.passesOk / s.passes * 100) : 0,
      };
    }
    const players = this.participants.map(mp => ({
      pid: mp.pid, side: mp.side, name: mp.name, started: mp.started, minutes: Math.round(mp.minutes),
      goals: mp.goals, assists: mp.assists, yellow: mp.yellow, red: mp.red, sentOff: mp.sentOff, rating: round(clamp(mp.rating, 3.2, 9.9), 1),
      saves: mp.saves, injuredDays: mp.injuryDays, stamina: round(mp.stamina), shots: mp.shots, tackles: mp.tackles,
    }));
    return {
      fixtureId: this.fixture.id, leftScore: this.teams.left.score, rightScore: this.teams.right.score,
      userScore: this.teams.left.score, oppScore: this.teams.right.score,
      userIsHome: this.userIsHome, teamStats, players, goalEvents: this.goalEvents,
      commentary: this.commentary.slice(), weather: this.weather.name, addedTime: this.addedTime2,
    };
  }
  draw() {
    const canvas = $('#match-canvas');
    if (!canvas) return;
    const wrap = canvas.parentElement;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(320, wrap.clientWidth), h = Math.max(260, wrap.clientHeight);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const padX = Math.max(18, w * .025), padY = Math.max(16, h * .04);
    const scale = Math.min((w - padX * 2) / 105, (h - padY * 2) / 68);
    const ox = (w - 105 * scale) / 2, oy = (h - 68 * scale) / 2;
    const X = x => ox + x * scale, Y = y => oy + y * scale;
    // 背景
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0b1710'); bg.addColorStop(1, '#07100b'); ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    // 草皮条纹
    const wet = this.weather.key.includes('rain');
    const pitchBase = wet ? '#1b5034' : '#1f5b3b';
    const pitchAlt = wet ? '#17462d' : '#1a5033';
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = i % 2 ? pitchBase : pitchAlt;
      ctx.fillRect(X(i * 6.5625), Y(0), X(6.5625) - X(0), Y(68) - Y(0));
    }
    ctx.strokeStyle = 'rgba(240,244,231,.55)'; ctx.lineWidth = Math.max(1, scale * .12);
    // 外线
    ctx.strokeRect(X(0), Y(0), 105 * scale, 68 * scale);
    ctx.beginPath(); ctx.moveTo(X(52.5), Y(0)); ctx.lineTo(X(52.5), Y(68)); ctx.stroke();
    ctx.beginPath(); ctx.arc(X(52.5), Y(34), 9.15 * scale, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(X(52.5), Y(34), 1.5 * scale, 0, Math.PI * 2); ctx.fillStyle = 'rgba(240,244,231,.6)'; ctx.fill();
    // 禁区
    ctx.strokeRect(X(0), Y(13.85), 16.5 * scale, 40.3 * scale);
    ctx.strokeRect(X(88.5), Y(13.85), 16.5 * scale, 40.3 * scale);
    ctx.strokeRect(X(0), Y(24.85), 5.5 * scale, 18.3 * scale);
    ctx.strokeRect(X(99.5), Y(24.85), 5.5 * scale, 18.3 * scale);
    // 点球点
    ctx.beginPath(); ctx.arc(X(11), Y(34), scale * .28, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(X(94), Y(34), scale * .28, 0, Math.PI * 2); ctx.fill();
    // 球门（网袋向场外延伸）
    drawGoal(ctx, X(0), Y(30.34), 2 * scale, 7.32 * scale, scale, true);
    drawGoal(ctx, X(105), Y(30.34), 2 * scale, 7.32 * scale, scale, false);
    // 禁区弧与角球弧
    ctx.beginPath(); ctx.arc(X(11), Y(34), 9.15 * scale, -0.94, 0.94); ctx.stroke();
    ctx.beginPath(); ctx.arc(X(94), Y(34), 9.15 * scale, Math.PI - 0.94, Math.PI + 0.94); ctx.stroke();
    for (const cx of [0, 105]) for (const cy of [0, 68]) {
      ctx.beginPath(); ctx.arc(X(cx), Y(cy), 1.2 * scale, 0, Math.PI * 2); ctx.stroke();
    }
    // 射门/被挡出后的球路尾迹，保留完整弹道
    const trail = this.ball.trail || [];
    if (trail.length > 1) {
      ctx.save();
      ctx.lineCap = 'round';
      for (let i = 1; i < trail.length; i++) {
        const a = i / trail.length;
        const p0 = trail[i - 1], p1 = trail[i];
        ctx.beginPath();
        ctx.strokeStyle = `rgba(248,224,150,${.06 + a * .3})`;
        ctx.lineWidth = Math.max(.8, scale * .16 * a);
        ctx.moveTo(X(p0.x), Y(p0.y) - clamp(p0.z, 0, 6) * scale * .55);
        ctx.lineTo(X(p1.x), Y(p1.y) - clamp(p1.z, 0, 6) * scale * .55);
        ctx.stroke();
      }
      ctx.restore();
    }
    // 阴影与球员
    for (const mp of this.allPlayers) {
      if (!mp.onPitch) continue;
      this.drawPlayer(ctx, mp, X, Y, scale);
    }
    // 球
    this.drawBall(ctx, X(this.ball.x), Y(this.ball.y), scale, this.ball.z);
    // 队伍识别图例
    const lx = ox + 5, ly = Math.max(8, oy - 26);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = '600 11px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.beginPath(); ctx.arc(lx + 5, ly, 5, 0, Math.PI * 2); ctx.fillStyle = this.teams.left.club.colors[0]; ctx.fill(); ctx.strokeStyle = '#e9cd89'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = 'rgba(240,240,230,.85)'; ctx.fillText(this.userClub.short, lx + 16, ly);
    const lx2 = lx + 16 + ctx.measureText(this.userClub.short).width + 18;
    ctx.beginPath(); ctx.arc(lx2 + 5, ly, 5, 0, Math.PI * 2); ctx.fillStyle = this.teams.right.club.colors[0]; ctx.fill(); ctx.strokeStyle = '#8ec5e8'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = 'rgba(240,240,230,.85)'; ctx.fillText(this.oppClub.short, lx2 + 16, ly);
    // 传球轨迹
    if (this.lastPassLine) {
      const p = this.lastPassLine;
      ctx.save(); ctx.strokeStyle = 'rgba(255,246,205,.18)'; ctx.lineWidth = 1; ctx.setLineDash([4, 5]);
      ctx.beginPath(); ctx.moveTo(X(p.x1), Y(p.y1)); ctx.lineTo(X(p.x2), Y(p.y2)); ctx.stroke(); ctx.restore();
    }
    // 球权高亮
    if (this.ball.owner) {
      const o = this.ball.owner;
      ctx.beginPath(); ctx.arc(X(o.x), Y(o.y), (o.isGK ? 13 : 12) * scale / 9, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(248,221,143,.36)'; ctx.lineWidth = 1.3; ctx.stroke();
    }
  }
  drawPlayer(ctx, mp, X, Y, scale) {
    const x = X(mp.x), y = Y(mp.y);
    const r = Math.max(7, Math.min(14, scale * .86));
    const colors = mp.team.club.colors || ['#3b5c49', '#f0e6d0'];
    const primary = colors[0], secondary = colors[1];
    // 阴影
    ctx.save(); ctx.beginPath(); ctx.ellipse(x, y + r * .85, r * .85, r * .35, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,.32)'; ctx.fill(); ctx.restore();
    // 扑救姿态偏移
    let px = 0, py = 0;
    if (mp.dive) {
      const p = Math.sin(Math.min(1, mp.dive.t / .3) * Math.PI);
      px = mp.dive.dir * p * r * .9;
      py = -p * r * .3;
    }
    // 队伍识别环：主队金色，客队蓝色，保证球衣颜色接近时也能区分
    ctx.beginPath(); ctx.arc(x, y, r + 3.2, 0, Math.PI * 2);
    ctx.strokeStyle = mp.isUser ? 'rgba(235,203,128,.45)' : 'rgba(128,190,232,.45)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath(); ctx.arc(x + px, y + py, r, 0, Math.PI * 2);
    ctx.fillStyle = mp.isGK ? mixColor(primary, '#e4d69f', .22) : primary;
    ctx.fill();
    ctx.lineWidth = mp.isUser ? 2.2 : 1.8;
    ctx.strokeStyle = mp.isUser ? '#e9cd89' : '#8ec5e8';
    ctx.stroke();
    if (mp.isGK) { ctx.beginPath(); ctx.arc(x + px, y + py, r * .72, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,.38)'; ctx.lineWidth = 1; ctx.stroke(); }
    ctx.fillStyle = secondary; ctx.font = `700 ${Math.max(7, r * .86)}px Bahnschrift, Arial Narrow, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(mp.number || '', x + px, y + py + .5);
    // 名字与体力
    const label = pitchDisplayName(mp.name);
    const fs = Math.max(8.5, Math.min(11.5, scale * .78));
    ctx.font = `600 ${fs}px "PingFang SC","Microsoft YaHei",sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const labelShift = mp.labelShift || 0;
    const ty = y + r + 4 + labelShift;
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(3,8,5,.66)'; ctx.fillRect(x - tw / 2 - 3, ty - 1, tw + 6, fs + 4);
    ctx.fillStyle = 'rgba(248,248,238,.96)'; ctx.fillText(label, x, ty);
    // 体力条
    const bw = Math.max(24, r * 2.35), bh = 3;
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x - bw / 2, ty + fs + 4, bw, bh);
    ctx.fillStyle = mp.stamina > 60 ? '#84d5a6' : mp.stamina > 35 ? '#e0b56e' : '#e2796d';
    ctx.fillRect(x - bw / 2, ty + fs + 4, bw * clamp(mp.stamina / 100, 0, 1), bh);
    // 牌/伤
    if (mp.yellow >= 1 && !mp.sentOff) { ctx.fillStyle = '#e2c55f'; ctx.fillRect(x + r + 3, y - r, 3, 6); }
    if (mp.sentOff) { ctx.fillStyle = '#d95c53'; ctx.fillRect(x + r + 3, y - r, 3, 6); }
    if (mp.injuryNow) { ctx.strokeStyle = 'rgba(225,112,103,.8)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r + 2, 0, Math.PI * 2); ctx.stroke(); }
    // 进球标记
    if (mp.goals > 0) {
      ctx.fillStyle = 'rgba(215,184,107,.9)'; ctx.beginPath(); ctx.arc(x - r - 4, y - r - 2, 2.2, 0, Math.PI * 2); ctx.fill();
    }
  }
  drawBall(ctx, x, y, scale, z) {
    const r = Math.max(3.4, scale * .36) * (1 + clamp(z, 0, 6) * .045);
    const yy = y - clamp(z, 0, 6) * scale * .55;
    ctx.save(); ctx.beginPath(); ctx.ellipse(x, y + 2, r * .85, r * .32, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fill(); ctx.restore();
    ctx.beginPath(); ctx.arc(x, yy, r, 0, Math.PI * 2); ctx.fillStyle = '#f6f4e8'; ctx.fill();
    ctx.lineWidth = .8; ctx.strokeStyle = 'rgba(20,28,20,.7)'; ctx.stroke();
    ctx.fillStyle = 'rgba(20,28,20,.8)'; ctx.beginPath(); ctx.arc(x, yy, r * .25, 0, Math.PI * 2); ctx.fill();
  }
}

function drawGoal(ctx, x, y, w, h, scale, flip) {
  ctx.save(); ctx.strokeStyle = 'rgba(250,250,245,.8)'; ctx.fillStyle = 'rgba(255,255,255,.035)'; ctx.lineWidth = Math.max(1, scale * .1);
  ctx.fillRect(flip ? x - w : x, y, w, h);
  ctx.strokeRect(flip ? x - w : x, y, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = .6;
  for (let i = 1; i < 8; i++) {
    ctx.beginPath(); ctx.moveTo((flip ? x : x + w) + (flip ? -w * i / 8 : 0), y); ctx.lineTo((flip ? x : x + w) + (flip ? -w * i / 8 : 0), y + h); ctx.stroke();
  }
  for (let i = 1; i < 5; i++) {
    ctx.beginPath(); ctx.moveTo(flip ? x - w : x, y + h * i / 5); ctx.lineTo(flip ? x : x + w, y + h * i / 5); ctx.stroke();
  }
  ctx.restore();
}
function pitchDisplayName(name) {
  if (!name) return '球员';
  if (/[\u4e00-\u9fa5]/.test(name)) return name.length > 4 ? name.slice(-4) : name;
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const first = parts[0].replace(/\./g, '');
  return `${first.slice(0, 1)}. ${parts[parts.length - 1]}`.slice(0, 14);
}
function dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }
function approach(v, target, step) { if (v < target) return Math.min(target, v + step); return Math.max(target, v - step); }
function mixColor(a, b, t) {
  const pa = hexToRgb(a), pb = hexToRgb(b);
  if (!pa || !pb) return a;
  const c = pa.map((v,i) => Math.round(lerp(v, pb[i], t)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  return m ? [parseInt(m[1],16), parseInt(m[2],16), parseInt(m[3],16)] : null;
}

/* ---------------- 比赛界面 ---------------- */
function startLiveMatch() {
  if (!G) return;
  if (!matchSetupState) return openMatchSetup();
  const f = getFixtureById(matchSetupState.fixtureId);
  if (!f || f.played) return toast('无法开始', '这场比赛已经结束。', 'bad');
  const c = userClub(), opp = clubById(fixtureOpponent(f, c.id));
  const valid = validateMatchdaySquad();
  if (!valid.ok && !valid.warnOnly) return toast('阵容不完整', valid.msg, 'bad');
  const oppLineup = bestLineupForClub(opp, G.players, true).map(x => ({ ...x }));
  const oppBench = bestBenchForClub(opp, G.players, oppLineup, BENCH_SIZE, true);
  closeModal();
  UI.screen = 'home';
  const engine = new MatchEngine({
    fixture: f, userClub: c, oppClub: opp,
    weather: matchSetupState.weather, teamTalk: matchSetupState.teamTalk,
    oppLineup, oppBench,
  });
  matchEngine = engine;
  matchUi = { tab: 'stats', overlay: null, lastUi: 0, selectedOut: null, selectedIn: null, halftimeShown: false, fulltimeShown: false, raf: 0 };
  document.body.style.overflow = 'hidden';
  renderMatchScreen();
  engine.start(onMatchHalfTime, onMatchFinished);
}
function openRiskSkipConfirm() {
  if (!G || !matchSetupState) return;
  const f = getFixtureById(matchSetupState.fixtureId);
  if (!f || f.played) return toast('无法跳过', '这场比赛已经结束。', 'bad');
  const c = userClub(), opp = clubById(fixtureOpponent(f, c.id));
  const valid = validateMatchdaySquad();
  if (!valid.ok && !valid.warnOnly) return toast('阵容不完整', valid.msg, 'bad');
  openModal({
    kicker: 'Assistant Takeover', title: '让助教冒险接管本场比赛？',
    body: `<p class="small muted">助教会沿用你当前的首发、阵型和战术，但不会在比赛中换人或调整。全场比赛会立即模拟并结算，你可以直接进入下一个比赛日。</p>
      <div class="tactic-note" style="margin-top:10px"><strong>风险：</strong>没有临场指挥，球队的执行力会下降；全队额外消耗体能，并有更高概率出现伤情。</div>
      <div class="detail-list" style="margin-top:10px"><div class="dl-row"><span class="k">对手</span><span class="v">${esc(opp.name)}</span></div><div class="dl-row"><span class="k">场地</span><span class="v">${f.home === c.id ? '主场' : '客场'} · ${esc(f.home === c.id ? c.stadium : opp.stadium)}</span></div><div class="dl-row"><span class="k">天气</span><span class="v">${matchSetupState.weather.name}</span></div><div class="dl-row"><span class="k">赛前训话</span><span class="v">${{ motivate: '激励进攻', calm: '稳住防线', free: '自由发挥' }[matchSetupState.teamTalk] || '稳住防线'}</span></div></div>`,
    actions: `<button class="btn ghost" data-action="cancel-risk-skip">继续亲自指挥</button><button class="btn danger" data-action="confirm-risk-skip">确认冒险跳过</button>`,
    narrow: true, closable: false,
  });
}
function confirmRiskSkip() {
  if (!G || !matchSetupState) return;
  const f = getFixtureById(matchSetupState.fixtureId);
  if (!f || f.played) return toast('无法跳过', '这场比赛已经结束。', 'bad');
  const c = userClub(), opp = clubById(fixtureOpponent(f, c.id));
  const valid = validateMatchdaySquad();
  if (!valid.ok && !valid.warnOnly) return toast('阵容不完整', valid.msg, 'bad');
  const cfg = { weather: matchSetupState.weather, teamTalk: matchSetupState.teamTalk };
  openModal({
    kicker: 'Assistant Takeover', title: '助教正在指挥比赛',
    body: `<div class="flex gap12" style="align-items:center"><div class="brand-mark">GD</div><div><div class="small">${esc(c.name)} vs ${esc(opp.name)}</div><div class="xsmall faint" style="margin-top:3px">比赛正在快速模拟，结果会立即结算。</div></div></div>`,
    actions: '', narrow: true, closable: false,
  });
  // 让“正在模拟”先渲染一帧，再跑同步引擎。
  setTimeout(() => runRiskSkip(f, c, opp, cfg), 60);
}
function runRiskSkip(f, c, opp, cfg) {
  if (!G) return;
  ensureUserLineupValid();
  const oppLineup = bestLineupForClub(opp, G.players, true).map(x => ({ ...x }));
  const oppBench = bestBenchForClub(opp, G.players, oppLineup, BENCH_SIZE, true);
  const engine = new MatchEngine({
    fixture: f, userClub: c, oppClub: opp,
    weather: cfg.weather, teamTalk: cfg.teamTalk,
    oppLineup, oppBench,
  });
  engine.riskSkip = true;
  engine.teams.left.talkMod = { attack: -.06, defense: -.05, stamina: .04 };
  engine.addComment(0, '助教接管了场边指挥。球队按照既有计划比赛，但没有临场调整。', 'general');
  let steps = 0;
  while (!engine.finished && steps < 60 * 360) {
    if (engine.halfTime) engine.secondHalf();
    if (engine.paused) engine.paused = false;
    engine.step(1 / 60);
    steps++;
  }
  if (!engine.finished) engine.endMatch();
  const summary = engine.summary();
  closeModal();
  handleMatchFinished(engine);
  const injured = applyRiskAftermath(summary);
  if (G.lastMatch) G.lastMatch.riskSkip = true;
  saveGame();
  UI.screen = 'home';
  renderApp();
  if (G.season.finished) {
    setTimeout(showSeasonReview, 400);
    return;
  }
  showRiskSkipResult(engine, summary, injured);
}
function applyRiskAftermath(summary, opts = {}) {
  // 冒险跳过的额外代价：体能、士气和伤情。
  const starters = summary.players.filter(r => r.started && r.minutes > 0).map(r => player(r.pid)).filter(Boolean);
  let injured = null;
  for (const p of starters) {
    p.fitness = clamp(p.fitness - randInt(opts.fitMin ?? 2, opts.fitMax ?? 6), 5, 100);
    if (chance(.25)) p.morale = clamp(p.morale - 1, 5, 100);
  }
  if (starters.length && chance(opts.injuryChance ?? .16)) {
    const pool = starters.filter(p => p.pos !== 'GK');
    injured = pick(pool.length ? pool : starters);
    if (injured) {
      injured.injuryDays = Math.max(injured.injuryDays || 0, randInt(2, 5));
      addNews('助教代班的代价', `${injured.name} 在比赛中受伤，预计缺阵 ${injured.injuryDays} 天。`, 'injury');
    }
  }
  return injured;
}
function showRiskSkipResult(eng, summary, injured) {
  const c = userClub(), opp = eng.oppClub;
  const us = eng.teams.left.score, os = eng.teams.right.score;
  const result = us > os ? '胜' : us < os ? '负' : '平';
  const resultCls = us > os ? 'green' : us < os ? 'red' : 'gold';
  const L = summary.teamStats.left, R = summary.teamStats.right;
  openModal({
    kicker: 'Assistant Report', title: `助教带队 · ${c.short} ${us} : ${os} ${opp.short}`,
    body: `<div class="flex between wrap gap8"><span class="tag ${resultCls}">${result}</span><span class="xsmall faint">第 ${eng.fixture.round} 轮 · ${eng.userIsHome ? '主场' : '客场'} · ${eng.weather.name}</span></div>
      <div class="hairline" style="margin:12px 0"></div>
      <div class="match-preview-line"><span>控球率</span><span>${L.possession}% - ${R.possession}%</span></div>
      <div class="match-preview-line"><span>射门 / 射正</span><span>${L.shots} / ${L.onTarget} - ${R.shots} / ${R.onTarget}</span></div>
      <div class="match-preview-line"><span>预期进球</span><span>${fmtStat(L.xg, 2)} - ${fmtStat(R.xg, 2)}</span></div>
      <div class="match-preview-line"><span>传球成功率</span><span>${L.passAccuracy}% - ${R.passAccuracy}%</span></div>
      <div class="tactic-note" style="margin-top:10px">助教没有进行换人或临场调整。全队额外消耗了体能${injured ? `，${esc(injured.name)} 还出现了伤情` : ''}。</div>
      ${injured ? `<div class="tactic-note" style="margin-top:7px;border-color:rgba(221,119,109,.3)">伤情报告：${esc(injured.name)} 预计缺阵 ${injured.injuryDays} 天。可在阵容页查看。</div>` : ''}`,
    actions: `<button class="btn primary" data-action="close-modal">完成比赛日</button>`,
    wide: true,
  });
}

function openMatchRiskSkipConfirm() {
  const eng = matchEngine;
  if (!eng || eng.finished) return;
  eng.paused = true;
  const remaining = Math.max(1, 90 - Math.floor(eng.time));
  openModal({
    kicker: 'Assistant Takeover', title: `让助教接手剩余 ${remaining} 分钟？`,
    body: `<p class="small muted">助教会从当前比分和场上状态继续比赛，但不会换人，也不会做临场战术调整。剩余比赛会立即模拟并结算。</p>
      <div class="tactic-note" style="margin-top:10px"><strong>风险：</strong>球队执行力下降，全队额外消耗体能，并有一定概率出现伤情。</div>
      <div class="detail-list" style="margin-top:10px"><div class="dl-row"><span class="k">当前比分</span><span class="v">${eng.userClub.short} ${eng.teams.left.score} : ${eng.teams.right.score} ${eng.oppClub.short}</span></div><div class="dl-row"><span class="k">比赛时间</span><span class="v">${Math.floor(eng.time)}' · ${eng.half === 1 ? '上半场' : '下半场'}</span></div><div class="dl-row"><span class="k">换人名额</span><span class="v">${eng.teams.left.subsUsed} / ${MAX_SUBS} 已用</span></div></div>`,
    actions: `<button class="btn ghost" data-action="close-modal">继续亲自指挥</button><button class="btn danger" data-action="confirm-match-risk-skip">确认冒险跳过</button>`,
    narrow: true,
  });
}
function runMatchRiskSkip() {
  const eng = matchEngine;
  if (!eng || eng.finished) return;
  closeModal();
  matchUi.overlay = null;
  renderMatchOverlay();
  eng.paused = false;
  const oldHalf = eng.onHalf, oldFinish = eng.onFinish;
  eng.onHalf = null; eng.onFinish = null;
  eng.teams.left.talkMod = { attack: -.05, defense: -.045, stamina: .035 };
  eng.addComment(Math.floor(eng.time), '助教接管了剩余比赛。球队继续按现有计划踢，但没有临场调整。', 'general');
  let steps = 0;
  while (!eng.finished && steps < 60 * 360) {
    if (eng.halfTime) eng.secondHalf();
    if (eng.paused) eng.paused = false;
    eng.step(1 / 60);
    steps++;
  }
  if (!eng.finished) eng.endMatch();
  eng.onHalf = oldHalf; eng.onFinish = oldFinish;
  const summary = eng.summary();
  onMatchFinished(eng);
  const injured = applyRiskAftermath(summary, { fitMin: 1, fitMax: 4, injuryChance: .1 });
  if (G.lastMatch) G.lastMatch.riskSkip = true;
  saveGame();
  toast('助教完成比赛', injured ? `${injured.name} 受伤，预计缺阵 ${injured.injuryDays} 天。` : '剩余比赛已模拟，额外体能消耗已计入。', injured ? 'bad' : 'gold');
}

function renderMatchScreen() {
  const eng = matchEngine;
  if (!eng) return;
  const c = eng.userClub, o = eng.oppClub;
  const compLabel = eng.friendly ? '友谊赛 · 全自动助教模式' : `${TIER_NAME(c.tier)} · 第 ${eng.fixture.round} 轮`;
  const tabs = eng.friendly
    ? `<button class="${matchUi.tab==='stats'?'active':''}" data-action="match-stats-tab" data-tab="stats">数据</button><button class="${matchUi.tab==='lineup'?'active':''}" data-action="match-lineup-tab" data-tab="lineup">阵容</button><button class="${matchUi.tab==='commentary'?'active':''}" data-action="match-commentary-tab" data-tab="commentary">直播</button>`
    : `<button class="${matchUi.tab==='stats'?'active':''}" data-action="match-stats-tab" data-tab="stats">数据</button><button class="${matchUi.tab==='lineup'?'active':''}" data-action="match-lineup-tab" data-tab="lineup">阵容</button><button class="${matchUi.tab==='commentary'?'active':''}" data-action="match-commentary-tab" data-tab="commentary">直播</button><button class="${matchUi.tab==='tactics'?'active':''}" data-action="match-tactics-tab" data-tab="tactics">战术</button>`;
  $('#match-root').innerHTML = `<div class="match-screen">
    <div class="match-top">
      <div class="match-competition">${compLabel} <span class="muted">· ${eng.friendly ? '两存档 · 满体力 · 不计赛程' : `${eng.userIsHome ? '主场' : '客场'} · ${eng.weather.name}`}</span></div>
      <div class="score-bar"><div class="score-team">${clubCrestEl(c,'crest')}<span class="sn">${esc(c.name)}</span></div><div class="score-center"><div class="score-line" id="match-score">0 : 0</div><div class="clock-line" id="match-clock"><span class="live-dot"></span>00:00</div></div><div class="score-team away"><span class="sn">${esc(o.name)}</span>${clubCrestEl(o,'crest')}</div></div>
      <div class="match-top-actions"><button class="btn sm" data-action="match-pause">暂停</button>${eng.friendly ? '<button class="btn sm ghost" data-action="friendly-finish-close">退出友谊赛</button>' : '<button class="btn sm ghost" data-action="open-match-subs">换人</button>'}</div>
    </div>
    <div class="match-main">
      <div class="match-pitch-area"><div class="match-canvas-wrap"><canvas id="match-canvas"></canvas><div id="match-event-flash"></div><div id="match-overlay-root"></div></div>
        <div class="match-bottom-bar"><span class="match-control-hint">${eng.friendly ? '助教全自动指挥 · 你只需观看 · 不写入赛程、不增加能力' : '空格暂停 · 比赛实时进行 · 只有换人和战术调整需要你的操作'}</span><div class="flex gap6"><span class="tag" id="match-pos-tag">控球 —</span><span class="tag">${eng.friendly ? '友谊赛' : (eng.userIsHome ? '主场优势' : '客场作战')}</span></div></div>
      </div>
      <aside class="match-side">
        <div class="match-side-tabs">${tabs}</div>
        <div class="match-side-content" id="match-side-content"></div>
      </aside>
    </div>
  </div>`;
  updateMatchSide(true);
  updateMatchScoreboard();
}
function closeMatchScreen() {
  if (matchEngine) { matchEngine.stop(); matchEngine = null; }
  $('#match-root').innerHTML = '';
  document.body.style.overflow = '';
  closeModal();
  UI.screen = 'home';
  renderApp();
  if (G && G.season.finished) setTimeout(showSeasonReview, 400);
}
function updateMatchScoreboard() {
  if (!matchEngine) return;
  const eng = matchEngine;
  const sc = $('#match-score'); if (sc) sc.textContent = `${eng.teams.left.score} : ${eng.teams.right.score}`;
  const cl = $('#match-clock'); if (cl) {
    const minute = Math.min(90, Math.floor(eng.time));
    const label = eng.half === 2 && eng.time >= 90 ? `90+${Math.max(1, Math.ceil(eng.time - 90))}'` : `${String(minute).padStart(2,'0')}'`;
    cl.innerHTML = `<span class="live-dot"></span>${label}`;
  }
  const pt = $('#match-pos-tag'); if (pt) {
    const total = eng.stats.left.poss + eng.stats.right.poss || 1;
    pt.textContent = `控球 ${Math.round(eng.stats.left.poss/total*100)}% : ${Math.round(eng.stats.right.poss/total*100)}%`;
  }
  const pauseBtn = document.querySelector('.match-top-actions [data-action="match-pause"]');
  if (pauseBtn) pauseBtn.textContent = eng.paused ? '继续' : '暂停';
  const flashEl = $('#match-event-flash');
  if (flashEl) {
    const now = performance.now();
    const flash = eng.flash;
    if (flash && now < flash.until) {
      // 只在新事件到来时替换内容；每 160ms 重建 DOM 会让 CSS 动画反复重启，看起来在闪。
      if (flashEl.dataset.flashId !== String(flash.id)) {
        flashEl.dataset.flashId = String(flash.id);
        flashEl.innerHTML = `<div class="match-event-flash" style="animation-duration:${Math.max(300, flash.ms)}ms"><div class="big">${esc(flash.big)}</div><div class="small">${esc(flash.small)}</div></div>`;
      }
    } else if (flashEl.innerHTML) {
      flashEl.innerHTML = '';
      delete flashEl.dataset.flashId;
    }
  }
}
function updateMatchSide(force = false, tab = null) {
  if (!matchEngine) return;
  const now = performance.now();
  if (!force && now - matchUi.lastUi < 220) return;
  matchUi.lastUi = now;
  if (tab) matchUi.tab = tab;
  document.querySelectorAll('.match-side-tabs button').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === matchUi.tab));
  const eng = matchEngine, user = eng.userClub, opp = eng.oppClub;
  if (eng.friendly && matchUi.tab === 'tactics') matchUi.tab = 'stats';
  const root = $('#match-side-content'); if (!root) return;
  const us = eng.stats.left, os = eng.stats.right;
  if (matchUi.tab === 'stats') {
    const total = us.poss + os.poss || 1;
    const row = (label, a, b, bar = false) => `<div class="match-stats-row"><span class="msl">${a}</span><span class="mslabel">${label}</span><span class="msr">${b}</span></div>${bar ? `<div class="stat-under"><i style="width:${a}%"></i><i style="width:${100-a}%;background:rgba(255,255,255,.28)"></i></div>` : ''}`;
    root.innerHTML = `<div class="flex between xsmall muted" style="margin-bottom:10px"><span>${esc(user.short)}</span><span>${esc(opp.short)}</span></div>
      ${row('控球率', Math.round(us.poss/total*100), Math.round(os.poss/total*100), true)}
      ${row('射门', us.shots, os.shots)}
      ${row('射正', us.onTarget, os.onTarget)}
      ${row('越位', us.offsides || 0, os.offsides || 0)}
      ${row('预期进球', fmtStat(us.xg,2), fmtStat(os.xg,2))}
      ${row('传球成功率', us.passes ? Math.round(us.passesOk/us.passes*100) : 0, os.passes ? Math.round(os.passesOk/os.passes*100) : 0)}
      ${row('成功抢断', us.tackles, os.tackles)}
      ${row('成功过人', us.dribbles, os.dribbles)}
      ${row('传球拦截', us.interceptions, os.interceptions)}
      ${row('角球', us.corners, os.corners)}
      ${row('犯规', us.fouls, os.fouls)}
      ${row('黄牌', us.yellow, os.yellow)}
      ${row('红牌', us.red, os.red)}
      ${row('门将扑救', us.saves, os.saves)}
      ${row('封堵', us.blocks || 0, os.blocks || 0)}
      <div class="tactic-note" style="margin-top:12px"><strong>战术：</strong>对方正在使用 ${ATTACK_STYLES[eng.teams.right.tactics.attack]?.name || '均衡'} / ${DEFENSE_STYLES[eng.teams.right.tactics.defense]?.name || '均衡'}。${eng.half===1?'上半场':''}</div>`;
  } else if (matchUi.tab === 'lineup') {
    const list = (side) => {
      const t = eng.teams[side];
      return `<div class="ml-section-label">${side==='left'?esc(user.name):esc(opp.name)} · ${side==='left'?'你的球队':'对手'}${t.red ? '' : ''}</div>${t.players.map(mp => `<div class="ml-row ${!mp.onPitch?'off':''}"><span class="num">${mp.number}</span><span class="pos-tag pos-${mp.pos}" style="font-size:8px">${mp.role}</span><span class="nm">${esc(mp.name)}${mp.goals?' <span class="gold">'+mp.goals+'球</span>':''}${mp.yellow?' <span style="color:#e2c55f">■</span>':''}${mp.red?' <span class="red">■</span>':''}</span><span class="bar"><i style="width:${mp.stamina}%"></i></span><span class="fit">${Math.round(mp.stamina)}</span></div>`).join('')}`;
    };
    root.innerHTML = `<div class="match-lineup-list">${list('left')}<div class="ml-section-label">替补</div>${eng.teams.left.bench.map(b=>`<div class="ml-row"><span class="num">${b.number||'—'}</span><span class="pos-tag pos-${b.pos}" style="font-size:8px">${b.pos}</span><span class="nm">${esc(b.name)}${b.used?' <span class="faint">已使用</span>':''}</span><span class="fit">${Math.round(b.stamina)}</span></div>`).join('')}<div class="hairline"></div>${list('right')}</div>`;
  } else if (matchUi.tab === 'commentary') {
    // 直播页只在有新解说时重建，并保持用户当前滚动位置，避免每 200ms 跳回顶部。
    const stamp = `${eng.commentary.length}:${eng.commentary[0]?.id || 0}`;
    const hasList = !!root.querySelector('.commentary');
    if (!hasList || root.dataset.commentaryStamp !== stamp) {
      const prevTop = root.scrollTop;
      const prevHeight = root.scrollHeight;
      const wasAtTop = prevTop <= 6;
      root.innerHTML = `<div class="commentary">${eng.commentary.map(c => `<div class="comment-row ${c.type==='goal'?'goal':c.type==='card'?'card':c.type==='sub'?'sub':''}"><span class="cm">${c.minute}'</span><span>${esc(c.text)}</span></div>`).join('')}</div>`;
      root.dataset.commentaryStamp = stamp;
      if (wasAtTop) root.scrollTop = 0;
      else root.scrollTop = Math.max(0, prevTop + (root.scrollHeight - prevHeight));
    }
  } else {
    const t = eng.teams.left, o = eng.teams.right;
    root.innerHTML = `<div class="stat-block-title">临场阵型</div><div class="formation-grid" style="grid-template-columns:repeat(3,1fr)">${FORMATIONS.map(f=>`<button class="form-btn ${t.formation===f?'active':''}" data-action="match-formation" data-formation="${f}">${f}</button>`).join('')}</div><div class="stat-block-title" style="margin-top:12px">你的战术</div>${tacticalButtons('attack', t.tactics.attack, ATTACK_STYLES)}${tacticalButtons('defense', t.tactics.defense, DEFENSE_STYLES)}${tacticalButtons('tempo', t.tactics.tempo, TEMPO_STYLES)}
      <div class="hairline"></div><div class="stat-block-title">球队指令</div><div class="team-talk-grid">${[['motivate','压上进攻'],['calm','稳住'],['free','自由发挥']].map(([k,n])=>`<button class="mt-btn ${eng.userTalk===k?'active':''}" data-action="match-team-talk" data-key="${k}" ${eng.userTalkUsed?'disabled':''}>${n}</button>`).join('')}</div>${eng.userTalkUsed?'<div class="xsmall faint" style="margin-top:6px">本场临场训话已使用。</div>':''}
      <div class="stat-block-title" style="margin-top:12px">对手情报</div><div class="xsmall muted">对手：${ATTACK_STYLES[o.tactics.attack]?.name || '均衡'} / ${DEFENSE_STYLES[o.tactics.defense]?.name || '均衡'} / ${TEMPO_STYLES[o.tactics.tempo]?.name || '中节奏'}</div><div class="tactic-note" style="margin-top:10px">换人会同步球员位置：替补球员会直接接替被换下球员的位置与角色。红牌球员无法被替换。</div><div class="btn-row" style="margin-top:12px"><button class="btn sm" data-action="open-match-subs">打开换人面板</button><button class="btn sm ghost" data-action="match-pause">${eng.paused?'继续比赛':'暂停'}</button></div>`;
  }
}
function tacticalButtons(side, current, styles) {
  return `<div class="stat-block-title" style="margin-top:9px">${side==='attack'?'进攻风格':side==='defense'?'防守风格':'比赛节奏'}</div><div class="match-tactic-btn-grid">${Object.entries(styles).map(([k,v])=>`<button class="mt-btn ${current===k?'active':''}" data-action="match-tactic" data-side="${side}" data-key="${k}">${v.name}</button>`).join('')}</div>`;
}
function setMatchScreenTab(tab) {
  matchUi.tab = tab;
  document.querySelectorAll('.match-side-tabs button').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
  updateMatchSide(true, tab);
}
function setMatchTactic(side, key) {
  if (!matchEngine) return;
  if (matchEngine.friendly) return toast('友谊赛全自动', '本场由助教指挥，你不需要调整战术。', 'gold');
  matchEngine.setUserTactics('left', side, key);
  if (side === 'attack') userClub().tactics.attack = key;
  if (side === 'defense') userClub().tactics.defense = key;
  if (side === 'tempo') userClub().tactics.tempo = key;
  updateMatchSide(true, 'tactics');
  toast('战术已调整', `${side==='attack'?'进攻':side==='defense'?'防守':'节奏'}已改变。`, 'gold');
}
function setMatchFormation(formation) {
  if (!matchEngine) return;
  if (matchEngine.friendly) return toast('友谊赛全自动', '本场由助教指挥，阵型按存档中的设置执行。', 'gold');
  const ok = matchEngine.changeFormation('left', formation);
  if (ok) {
    updateMatchSide(true, 'tactics');
    if (matchUi.overlay === 'halftime') renderHalfTimeOverlay();
    toast('阵型已改变', `球队改为 ${formation}。球员位置已重新安排。`, 'gold');
  }
}
function setMatchTeamTalk(key) {
  if (!matchEngine) return;
  if (matchEngine.friendly) return toast('友谊赛全自动', '本场由助教指挥。', 'gold');
  if (matchEngine.userTalkUsed) return toast('已经喊过话', '一场比赛只能进行一次临场训话。', 'bad');
  matchEngine.userTalkUsed = true;
  matchEngine.userTalk = key;
  const t = matchEngine.teams.left;
  t.talk = key;
  if (key === 'motivate') t.talkMod = { attack: .05, defense: -.03, stamina: .04 };
  else if (key === 'calm') t.talkMod = { attack: -.01, defense: .04, stamina: 0 };
  else t.talkMod = { attack: .02, defense: 0, stamina: 0 };
  // 直接更新所有训话按钮，中场面板和右侧战术面板都立刻显示选中状态。
  $$('.mt-btn[data-action="match-team-talk"]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.key === key);
    btn.disabled = true;
  });
  matchEngine.addComment(Math.floor(matchEngine.time), '你在场边向球队喊话，战术指令已经传达。', 'general');
  toast('指令已传达', '球员会在接下来的几分钟内做出反应。', 'good');
  updateMatchSide(true, 'tactics');
}
function toggleMatchPause() {
  if (!matchEngine || matchEngine.finished || matchEngine.halfTime) return;
  matchEngine.paused = !matchEngine.paused;
  matchUi.overlay = matchEngine.paused ? 'pause' : null;
  renderMatchOverlay();
  updateMatchSide(true, matchUi.tab);
}
function resumeMatch() {
  if (!matchEngine) return;
  matchEngine.paused = false; matchUi.overlay = null; renderMatchOverlay();
}
function renderMatchPause() {
  if (!matchEngine) return;
  matchUi.overlay = 'pause';
  renderMatchOverlay();
}
function renderMatchOverlay() {
  const eng = matchEngine; if (!eng) return;
  const root = $('#match-overlay-root'); if (!root) return;
  if (matchUi.overlay === 'pause') {
    const restartNote = (eng.restartState || eng._settling)
      ? '死球后所有球员已回到站位，等待 1 秒后重新开球。'
      : '比赛不会被跳过。你可以暂停思考，但时间只在继续后推进。战术可以在右侧面板随时调整。';
    root.innerHTML = `<div class="match-pause-overlay"><div class="pause-panel"><div class="kicker">PAUSED</div><h2>比赛暂停</h2><p>${esc(eng.userClub.short)} ${eng.teams.left.score} : ${eng.teams.right.score} ${esc(eng.oppClub.short)} · ${Math.floor(eng.time)}'</p><div class="btn-row" style="justify-content:center"><button class="btn primary" data-action="match-resume">继续比赛</button><button class="btn ghost" data-action="open-match-subs">换人</button><button class="btn danger" data-action="match-risk-skip">冒险跳过</button></div><p class="xsmall faint" style="margin-top:12px">${restartNote}</p></div></div>`;
  } else if (matchUi.overlay === 'subs') {
    root.innerHTML = renderSubOverlay();
  } else {
    root.innerHTML = '';
  }
}
function openMatchSubs() {
  if (!matchEngine) return;
  if (matchEngine.finished) return;
  if (matchEngine.friendly) return toast('友谊赛全自动', '换人由双方助教自动完成。', 'gold');
  matchEngine.paused = true;
  matchUi.overlay = 'subs';
  matchUi.selectedOut = null; matchUi.selectedIn = null;
  renderMatchOverlay();
}
function selectMatchOut(index) {
  matchUi.selectedOut = index;
  matchUi.selectedIn = null;
  renderMatchOverlay();
}
function selectMatchIn(index) {
  if (matchUi.selectedOut === null) return toast('先选择被换下球员', '请先从场上球员中选择一人。', 'bad');
  matchUi.selectedIn = index;
  renderMatchOverlay();
}
function makeSubstitution() {
  if (!matchEngine) return;
  const t = matchEngine.teams.left;
  if (matchUi.selectedOut === null || matchUi.selectedIn === null) return toast('换人信息不完整', '请选择被换下和换上的球员。', 'bad');
  const out = t.players[matchUi.selectedOut];
  const bench = t.bench.filter(b => !b.used);
  const incoming = bench[matchUi.selectedIn];
  if (!out || !incoming) return;
  const res = matchEngine.substitute('left', out.pid, incoming.pid, false);
  if (!res.ok) return toast('换人失败', res.msg, 'bad');
  // 同步一线队未来阵容？正式换人不影响赛前阵容，但赛后体力会保留。
  matchUi.selectedOut = null; matchUi.selectedIn = null;
  renderMatchOverlay();
  updateMatchSide(true, 'lineup');
}
function renderSubOverlay() {
  const eng = matchEngine, t = eng.teams.left;
  const onPitch = t.players;
  const bench = t.bench.filter(b => !b.used && !t.players.some(mp => mp.pid === b.pid));
  const selectedOut = matchUi.selectedOut !== null ? onPitch[matchUi.selectedOut] : null;
  const selectedIn = matchUi.selectedIn !== null ? bench[matchUi.selectedIn] : null;
  const benchValid = bench.filter(b => !selectedOut || (selectedOut.isGK ? b.pos === 'GK' : b.pos !== 'GK' || b.pos === selectedOut.pos));
  return `<div class="half-overlay"><div class="half-panel"><div class="half-head"><div><div class="kicker">Substitutions</div><h3>换人 · 已用 ${t.subsUsed} / ${MAX_SUBS}</h3></div><button class="btn sm ghost" data-action="match-subs-close">关闭</button></div><div class="half-body"><div class="sub-window"><div class="sub-column"><h4>场上球员（选择换下）</h4>${onPitch.map((mp,i)=>`<button class="sub-player ${matchUi.selectedOut===i?'selected':''}" data-action="match-select-out" data-index="${i}"><span class="pos-tag pos-${mp.pos}" style="font-size:8px">${mp.role}</span><span>${esc(mp.name)}</span><span class="fit-badge">${Math.round(mp.stamina)}</span>${mp.goals?`<span class="tag gold">${mp.goals}</span>`:''}</button>`).join('')}</div><div class="sub-column"><h4>替补席（选择换上）</h4>${bench.map((b,i)=>`<button class="sub-player ${matchUi.selectedIn===i?'selected':''}" data-action="match-select-in" data-index="${i}" ${selectedOut&&selectedOut.isGK&&b.pos!=='GK'?'disabled':''}><span class="pos-tag pos-${b.pos}" style="font-size:8px">${b.pos}</span><span>${esc(b.name)}</span><span class="fit-badge">${Math.round(b.stamina)}</span></button>`).join('') || '<div class="xsmall faint">没有可用替补。</div>'}</div></div><div class="full"><div class="tactic-note">${selectedOut ? `将换下：${esc(selectedOut.name)}（${selectedOut.role}）${selectedIn?` → ${esc(selectedIn.name)}（${selectedIn.pos}）`:''}`:'请选择一名场上球员。'}</div></div></div><div class="half-foot"><span class="xsmall faint">最多 5 次换人。被换下的球员不能重新上场。</span><div class="flex gap6"><button class="btn ghost" data-action="match-sub-cancel">取消</button><button class="btn primary" data-action="make-substitution" ${!selectedOut||!selectedIn?'disabled':''}>确认换人</button></div></div></div></div>`;
}
function matchSubsClose() {
  if (!matchEngine) return;
  if (matchEngine.halfTime) {
    matchUi.overlay = 'halftime';
    renderHalfTimeOverlay();
    return;
  }
  matchUi.overlay = null;
  if (!matchEngine.finished) matchEngine.paused = false;
  renderMatchOverlay();
}
function closeSubOverlay() { matchSubsClose(); }
function onMatchHalfTime(eng) {
  if (!matchEngine) return;
  matchUi.overlay = 'halftime';
  matchUi.halftimeShown = true;
  renderHalfTimeOverlay();
  updateMatchSide(true, 'stats');
}
function renderHalfTimeOverlay() {
  const eng = matchEngine; if (!eng) return;
  const root = $('#match-overlay-root'); if (!root) return;
  const total = eng.stats.left.poss + eng.stats.right.poss || 1;
  root.innerHTML = `<div class="half-overlay"><div class="half-panel"><div class="half-head"><div><div class="kicker">Half Time</div><h3>中场休息 · ${esc(eng.userClub.short)} ${eng.teams.left.score} : ${eng.teams.right.score} ${esc(eng.oppClub.short)}</h3></div><button class="btn sm ghost" data-action="open-match-subs">换人</button></div><div class="half-body"><div><div class="stat-block-title">上半场数据</div><div class="match-preview-line"><span>控球率</span><span>${Math.round(eng.stats.left.poss/total*100)}% - ${Math.round(eng.stats.right.poss/total*100)}%</span></div><div class="match-preview-line"><span>射门</span><span>${eng.stats.left.shots} - ${eng.stats.right.shots}</span></div><div class="match-preview-line"><span>射正</span><span>${eng.stats.left.onTarget} - ${eng.stats.right.onTarget}</span></div><div class="match-preview-line"><span>预期进球</span><span>${fmtStat(eng.stats.left.xg,2)} - ${fmtStat(eng.stats.right.xg,2)}</span></div></div><div><div class="stat-block-title">中场调整</div><div class="team-talk-grid">${[['motivate','压上进攻'],['calm','稳住防线'],['free','自由发挥']].map(([k,n])=>`<button class="mt-btn ${eng.userTalk===k?'active':''}" data-action="match-team-talk" data-key="${k}" ${eng.userTalkUsed?'disabled':''}>${n}</button>`).join('')}</div>${eng.userTalkUsed?'<div class="xsmall faint" style="margin-top:6px">本场临场训话已使用。</div>':''}<div class="stat-block-title" style="margin-top:9px">临场阵型</div><div class="formation-grid" style="grid-template-columns:repeat(3,1fr)">${FORMATIONS.map(f=>`<button class="form-btn ${eng.teams.left.formation===f?'active':''}" data-action="match-formation" data-formation="${f}">${f}</button>`).join('')}</div><p class="xsmall faint" style="margin-top:7px">你可以在下半场开始前换人、调整战术。对手也会根据比分改变策略。</p><div class="tactic-note" style="margin-top:8px">当前战术：${ATTACK_STYLES[eng.teams.left.tactics.attack]?.name} / ${DEFENSE_STYLES[eng.teams.left.tactics.defense]?.name} / ${TEMPO_STYLES[eng.teams.left.tactics.tempo]?.name}</div></div><div class="full"><div class="flex between wrap gap8"><span class="xsmall faint">换人名额：${eng.teams.left.subsUsed} / ${MAX_SUBS}</span><button class="btn danger" data-action="match-risk-skip">冒险跳过</button><button class="btn primary" data-action="half-time-continue">开始下半场</button></div></div></div></div></div>`;
}
function continueSecondHalf() {
  if (!matchEngine) return;
  matchUi.overlay = null;
  $('#match-overlay-root').innerHTML = '';
  matchEngine.secondHalf();
  updateMatchSide(true, 'stats');
}
function onMatchFinished(eng) {
  if (!matchEngine) return;
  handleMatchFinished(eng);
  matchUi.overlay = 'fulltime';
  renderFullTimeOverlay();
}
function renderFriendlyFullTime(eng) {
  const root = $('#match-overlay-root'); if (!root) return;
  const c = eng.userClub, o = eng.oppClub;
  const summary = eng.summary();
  const us = summary.teamStats.left, os = summary.teamStats.right;
  const goals = eng.goalEvents.slice().sort((a,b) => a.minute - b.minute);
  const players = eng.participants.filter(mp => mp.minutes > 0).sort((a,b) => b.rating - a.rating).slice(0, 10);
  root.innerHTML = `<div class="match-fulltime"><div class="ft-panel"><div class="ft-head"><div class="label">双存档友谊赛 · 全自动 · 全场</div><div class="ft-score"><span class="${eng.teams.left.score>eng.teams.right.score?'win':''}">${eng.teams.left.score}</span> : <span class="${eng.teams.right.score>eng.teams.left.score?'win':''}">${eng.teams.right.score}</span></div><div class="ft-teams">${clubCrestEl(c,'crest sm')} ${esc(c.name)} <span class="tag gold">友谊赛</span> ${esc(o.name)} ${clubCrestEl(o,'crest sm')}</div><div class="xsmall faint" style="margin-top:7px">满体力开局 · 助教全自动 · 不计入赛程 · 不增加球员能力</div></div>
    <div class="ft-body"><div class="detail-grid"><div><div class="stat-block-title">进球</div><div class="scorer-list">${goals.length ? goals.map(g=>`<div>${g.minute}' · <b>${esc(g.scorerName)}</b> <span class="faint">${esc(g.side==='left'?c.short:o.short)}</span>${g.ownGoal?' <span class="red">乌龙</span>':''}</div>`).join('') : '<div class="faint">没有进球</div>'}</div><div class="stat-block-title" style="margin-top:12px">比赛数据</div><div class="match-preview-line"><span>控球率</span><span>${us.possession}% - ${os.possession}%</span></div><div class="match-preview-line"><span>射门 / 射正</span><span>${us.shots} / ${us.onTarget} · ${os.shots} / ${os.onTarget}</span></div><div class="match-preview-line"><span>预期进球</span><span>${fmtStat(us.xg,2)} - ${fmtStat(os.xg,2)}</span></div><div class="match-preview-line"><span>抢断 / 过人</span><span>${us.tackles} / ${us.dribbles} · ${os.tackles} / ${os.dribbles}</span></div><div class="match-preview-line"><span>传球成功率</span><span>${us.passAccuracy}% - ${os.passAccuracy}%</span></div><div class="match-preview-line"><span>角球</span><span>${us.corners} - ${os.corners}</span></div></div><div><div class="stat-block-title">球员评分</div><div class="rating-list">${players.map(mp=>`<div class="rating-row"><span class="nm">${esc(mp.name)}</span><span class="pos-tag pos-${mp.pos}" style="font-size:8px">${mp.role}</span><span class="rating-chip ${mp.rating>=7?'hi':mp.rating<6?'lo':''}">${fmtStat(mp.rating,1)}</span></div>`).join('')}</div><div class="tactic-note" style="margin-top:10px"><strong>说明：</strong>本场比赛只用于观看和测试阵型，不会写入两个存档的赛程、积分、体力、合同或球员成长。</div></div></div>
    <div class="ft-foot"><button class="btn primary" data-action="friendly-finish-close">结束友谊赛</button></div></div></div>`;
}
function renderFullTimeOverlay() {
  const eng = matchEngine; if (!eng) return;
  if (eng.friendly) return renderFriendlyFullTime(eng);
  const root = $('#match-overlay-root'); if (!root) return;
  const c = eng.userClub, o = eng.oppClub;
  const us = eng.stats.left, os = eng.stats.right;
  const userGoals = eng.goalEvents.filter(g => g.side === 'left');
  const oppGoals = eng.goalEvents.filter(g => g.side === 'right');
  const userResult = eng.teams.left.score > eng.teams.right.score ? 'W' : eng.teams.left.score < eng.teams.right.score ? 'L' : 'D';
  const players = eng.participants.filter(mp => mp.minutes > 0).sort((a,b) => b.rating - a.rating).slice(0, 8);
  const ftInfo = G.lastMatch || {};
  root.innerHTML = `<div class="match-fulltime"><div class="ft-panel"><div class="ft-head"><div class="label">${TIER_NAME(c.tier)} · 第 ${eng.fixture.round} 轮 · 全场</div><div class="ft-score"><span class="${userResult==='W'?'win':''}">${eng.teams.left.score}</span> : <span class="${userResult==='L'?'win':''}">${eng.teams.right.score}</span></div><div class="ft-teams">${clubCrestEl(c,'crest sm')} ${esc(c.name)} <span class="tag ${userResult==='W'?'green':userResult==='L'?'red':'gold'}">${userResult==='W'?'胜':userResult==='L'?'负':'平'}</span> ${esc(o.name)} ${clubCrestEl(o,'crest sm')}</div><div class="xsmall faint" style="margin-top:7px">${eng.userIsHome?'主场':'客场'} · ${eng.weather.name} · 观众 ${fmtPlain(ftInfo.attendance || 0)} 人</div></div>
    <div class="ft-body"><div class="detail-grid"><div><div class="stat-block-title">进球</div><div class="scorer-list">${[...userGoals.map(g=>({...g, team:c.name})), ...oppGoals.map(g=>({...g, team:o.name}))].length ? [...userGoals.map(g=>({...g, team:c.short})), ...oppGoals.map(g=>({...g, team:o.short}))].sort((a,b)=>a.minute-b.minute).map(g=>`<div>${g.minute}' · <b>${esc(g.scorerName)}</b> <span class="faint">${esc(g.team)}</span>${g.ownGoal?' <span class="red">乌龙</span>':''}</div>`).join('') : '<div class="faint">没有进球</div>'}</div><div class="stat-block-title" style="margin-top:12px">比赛数据</div><div class="match-preview-line"><span>控球率</span><span>${Math.round(us.poss/(us.poss+os.poss||1)*100)}% - ${Math.round(os.poss/(us.poss+os.poss||1)*100)}%</span></div><div class="match-preview-line"><span>射门 / 射正</span><span>${us.shots} / ${us.onTarget} · ${os.shots} / ${os.onTarget}</span></div><div class="match-preview-line"><span>预期进球</span><span>${fmtStat(us.xg,2)} - ${fmtStat(os.xg,2)}</span></div><div class="match-preview-line"><span>抢断 / 过人</span><span>${us.tackles} / ${us.dribbles} · ${os.tackles} / ${os.dribbles}</span></div><div class="match-preview-line"><span>传球成功率</span><span>${us.passes?Math.round(us.passesOk/us.passes*100):0}% - ${os.passes?Math.round(os.passesOk/os.passes*100):0}%</span></div><div class="match-preview-line"><span>门将扑救</span><span>${us.saves} - ${os.saves}</span></div><div class="match-preview-line"><span>越位</span><span>${us.offsides || 0} - ${os.offsides || 0}</span></div></div><div><div class="stat-block-title">球员评分</div><div class="rating-list">${players.map(mp=>`<div class="rating-row"><span class="nm">${esc(mp.name)}</span><span class="pos-tag pos-${mp.pos}" style="font-size:8px">${mp.role}</span><span class="rating-chip ${mp.rating>=7?'hi':mp.rating<6?'lo':''}">${fmtStat(mp.rating,1)}</span></div>`).join('')}</div>${ftInfo.income?`<div class="tactic-note" style="margin-top:10px"><strong>门票收入：</strong>${fmtMoney(ftInfo.income.total)} · 观众 ${fmtPlain(ftInfo.income.attendance)} 人${ftInfo.prize?` · 联赛奖金 ${fmtMoney(ftInfo.prize)}`:''}</div>`:''}</div></div></div>
    <div class="ft-foot">${G.season.finished?`<button class="btn primary" data-action="show-season-review">查看赛季总结</button>`:`<button class="btn primary" data-action="match-finish-close">完成比赛日</button>`}</div></div></div>`;
}


/* -------------------------------------------------------------------------
   30. 比赛结果结算、AI 比赛与赛季流程
   ------------------------------------------------------------------------- */
function poissonSample(lambda) {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rand(); } while (p > L);
  return clamp(k - 1, 0, 7);
}
function simulateAIFixture(f) {
  if (!f || f.played) return;
  if (f.home === G.userClubId || f.away === G.userClubId) return;
  const h = clubById(f.home), a = clubById(f.away);
  if (!h || !a) return;
  const hp = teamPower(h.id), ap = teamPower(a.id);
  const edge = tacticalPreview(h.tactics, a.tactics).score;
  const diff = (hp - ap + 2.2 + edge * 15) / 8.2;
  const lambdaH = clamp(1.36 * Math.exp(diff * .58), .2, 4.6);
  const lambdaA = clamp(1.12 * Math.exp(-diff * .5), .15, 4.2);
  let hg = poissonSample(lambdaH), ag = poissonSample(lambdaA);
  hg = clamp(hg, 0, 5); ag = clamp(ag, 0, 5);
  f.hg = hg; f.ag = ag; f.played = true;
  const hl = bestLineupForClub(h, G.players, true);
  const al = bestLineupForClub(a, G.players, true);
  const hPlayers = hl.map(x => player(x.playerId)).filter(Boolean);
  const aPlayers = al.map(x => player(x.playerId)).filter(Boolean);
  const scorerIds = [];
  for (let i = 0; i < hg; i++) {
    const scorer = weightedPick(hPlayers, p => positionalGoalWeight(p));
    if (scorer) { scorer.season.goals++; scorerIds.push(scorer.id); }
    const assister = chance(.65) ? weightedPick(hPlayers.filter(p => p !== scorer), p => p.pos === 'GK' ? .1 : (p.attrs.pas + p.attrs.vis) / 20) : null;
    if (assister && assister !== scorer) assister.season.assists++;
  }
  for (let i = 0; i < ag; i++) {
    const scorer = weightedPick(aPlayers, p => positionalGoalWeight(p));
    if (scorer) { scorer.season.goals++; scorerIds.push(scorer.id); }
    const assister = chance(.65) ? weightedPick(aPlayers.filter(p => p !== scorer), p => p.pos === 'GK' ? .1 : (p.attrs.pas + p.attrs.vis) / 20) : null;
    if (assister && assister !== scorer) assister.season.assists++;
  }
  f.scorers = scorerIds;
  const possessionH = clamp(Math.round(50 + (hp - ap) * 1.1 + normal(0, 7) + (h.tactics.attack === 'possession' ? 6 : 0)), 28, 72);
  f.stats = {
    possessionH, possessionA: 100 - possessionH,
    shotsH: clamp(Math.round(hg * 3 + 4 + normal(0, 3)), 2, 24),
    shotsA: clamp(Math.round(ag * 3 + 4 + normal(0, 3)), 2, 24),
    onTargetH: clamp(Math.round(hg * 2 + 1 + normal(0, 2)), 1, 12),
    onTargetA: clamp(Math.round(ag * 2 + 1 + normal(0, 2)), 1, 12),
    foulsH: randInt(0, 4), foulsA: randInt(0, 4),
    offsidesH: randInt(0, 3), offsidesA: randInt(0, 3),
  };
  const updateTeam = (club, lineup, gf, ga) => {
    for (const p of lineup) {
      if (!p) continue;
      p.season.apps++; p.season.starts++; p.season.minutes += 90;
      p.season.ratingSum += clamp(6.2 + normal(gf > ga ? .6 : gf < ga ? -.5 : 0, .6), 4.1, 9.2); p.season.ratings++;
      p.form = clamp(p.form + normal(0, 2), 30, 88);
      p.fitness = clamp(p.fitness - randInt(12, 28), 40, 100);
      if (p.pos === 'GK' && ga === 0) p.season.cleanSheets++;
      if (p.pos === 'GK') p.season.conceded += ga;
    }
    // 黄牌随机
    if (chance(.28)) {
      const p = pick(lineup.filter(x => x && x.pos !== 'GK')) || null;
      if (p) { p.season.yellow++; p.yellowCards = (p.yellowCards || 0) + 1; if (p.yellowCards >= 5) { p.suspension = (p.suspension||0) + 1; p.yellowCards -= 5; } }
    }
    if (chance(.018)) {
      const p = pick(lineup.filter(x => x && x.pos !== 'GK')) || null;
      if (p) { p.season.red++; p.suspension = (p.suspension||0) + 1; }
    }
  };
  updateTeam(h, hPlayers, hg, ag);
  updateTeam(a, aPlayers, ag, hg);
}
function positionalGoalWeight(p) {
  if (!p || p.pos === 'GK') return 0;
  const base = { ST: 6, SS: 4.5, LW: 3.6, RW: 3.6, AM: 3, CM: 1.7, LM: 2, RM: 2, DM: .9, CB: .5, LB: .55, RB: .55, WB: .7 }[p.pos] || 1;
  return base * (0.55 + p.attrs.sho / 100);
}
function simulateRoundFixtures(round) {
  for (let tier = 1; tier <= 5; tier++) {
    const div = G.divisions[tier];
    if (!div) continue;
    for (const f of div.fixtures) {
      if (f.round === round && !f.played) simulateAIFixture(f);
    }
  }
}
function updateFixtureFromEngine(f, summary, userHome) {
  f.played = true;
  f.hg = userHome ? summary.userScore : summary.oppScore;
  f.ag = userHome ? summary.oppScore : summary.userScore;
  f.scorers = summary.goalEvents.map(g => g.scorerId).filter(Boolean);
  const L = summary.teamStats.left, R = summary.teamStats.right;
  f.stats = userHome ? {
    possessionH: L.possession, possessionA: R.possession, shotsH: L.shots, shotsA: R.shots,
    onTargetH: L.onTarget, onTargetA: R.onTarget, foulsH: L.fouls, foulsA: R.fouls,
    offsidesH: L.offsides || 0, offsidesA: R.offsides || 0,
    xgH: L.xg, xgA: R.xg, cardsH: L.yellow + L.red, cardsA: R.yellow + R.red,
  } : {
    possessionH: R.possession, possessionA: L.possession, shotsH: R.shots, shotsA: L.shots,
    onTargetH: R.onTarget, onTargetA: L.onTarget, foulsH: R.fouls, foulsA: L.fouls,
    offsidesH: R.offsides || 0, offsidesA: L.offsides || 0,
    xgH: R.xg, xgA: L.xg, cardsH: R.yellow + R.red, cardsA: L.yellow + L.red,
  };
}
function maybeMatchAbilityGain(p, rec) {
  if (!p?.attrs || p.ovr >= p.potential || rec.minutes <= 0) return null;
  const age = p.age || 24;
  const base = age <= 21 ? .03 : age <= 24 ? .018 : age <= 28 ? .01 : .005;
  const perf = clamp((rec.rating - 6) * .008, -.005, .015);
  if (!chance(clamp(base + perf, .002, .045))) return null;
  const pools = {
    GK: ['gk', 'def', 'vis', 'phy'],
    DF: ['def', 'tac', 'str', 'phy', 'sta'],
    MF: ['pas', 'dri', 'vis', 'sta', 'tac'],
    FW: ['sho', 'dri', 'spd', 'vis', 'phy'],
  };
  const pool = pools[POS_GROUP[p.pos] || 'MF'] || pools.MF;
  const key = weightedPick(pool, k => (p.growthBias?.[k] || 1) * (p.attrs[k] < 70 ? 1.25 : .65));
  const old = p.attrs[key];
  p.attrs[key] = clamp(old + 1, 5, 99);
  const newOvr = calcOvr(p.attrs, p.pos);
  if (newOvr > p.potential + 1) { p.attrs[key] = old; return null; }
  p.ovr = newOvr;
  if (G && p.clubId === G.userClubId) addNews('比赛成长', `${p.name} 在比赛中提升了${ATTR_LABELS[key] || key} ${old} → ${p.attrs[key]}。`, 'team');
  return { playerId: p.id, attr: key, from: old, to: p.attrs[key] };
}
function applyMatchPlayerStats(summary, userHome) {
  const c = userClub();
  for (const rec of summary.players) {
    const p = player(rec.pid);
    if (!p) continue;
    if (rec.minutes <= 0 && !rec.started) continue;
    p.season.apps = (p.season.apps || 0) + 1;
    if (rec.started) p.season.starts = (p.season.starts || 0) + 1;
    p.season.minutes = (p.season.minutes || 0) + rec.minutes;
    p.season.goals = (p.season.goals || 0) + rec.goals;
    p.season.assists = (p.season.assists || 0) + rec.assists;
    p.season.yellow = (p.season.yellow || 0) + rec.yellow;
    p.season.red = (p.season.red || 0) + rec.red;
    p.season.ratingSum = (p.season.ratingSum || 0) + rec.rating;
    p.season.ratings = (p.season.ratings || 0) + 1;
    p.season.saves = (p.season.saves || 0) + (rec.saves || 0);
    const userScore = summary.userScore, oppScore = summary.oppScore;
    const ownGoalsConceded = p.clubId === c.id ? summary.oppScore : summary.userScore;
    if (p.pos === 'GK') {
      p.season.conceded = (p.season.conceded || 0) + ownGoalsConceded;
      if (ownGoalsConceded === 0) p.season.cleanSheets = (p.season.cleanSheets || 0) + 1;
    }
    p.form = clamp(lerp(p.form || 55, rec.rating * 10 + 6, .35), 20, 95);
    p.fitness = clamp(rec.stamina, 5, 100);
    maybeMatchAbilityGain(p, rec);
    if (rec.injuredDays > 0) p.injuryDays = Math.max(p.injuryDays || 0, rec.injuredDays);
    if (rec.sentOff && !rec.red) p.suspension = (p.suspension || 0) + 1;
    else if (rec.red > 0) p.suspension = (p.suspension || 0) + 1;
    p.yellowCards = (p.yellowCards || 0) + rec.yellow;
    while (p.yellowCards >= 5) { p.suspension = (p.suspension || 0) + 1; p.yellowCards -= 5; }
    if (p.clubId === c.id) {
      p.morale = clamp(p.morale + (rec.rating >= 7.2 ? 3 : rec.rating < 5.9 ? -3 : rec.goals ? 2 : 0), 5, 100);
      if (p.transferStatus === 'requested' && rec.rating > 7) p.morale = clamp(p.morale + 2, 0, 100);
    }
  }
}
function updateUserSquadMoraleAfterMatch(result, appearanceIds, scorers) {
  const c = userClub();
  for (const p of squadPlayers(c)) {
    let d = result === 'W' ? 5 : result === 'D' ? 1 : -4;
    if (!appearanceIds.has(p.id)) d -= 1.2;
    if (scorers.has(p.id)) d += 2.4;
    if (p.stamina < 35) d -= 1;
    p.morale = clamp(p.morale + d, 5, 100);
  }
}
function handleMatchFinished(eng) {
  if (!G || !eng) return;
  if (G._processedFixtureId === eng.fixture.id) return;
  G._processedFixtureId = eng.fixture.id;
  const summary = eng.summary();
  const f = getFixtureById(eng.fixture.id);
  if (!f) return;
  const c = userClub(), opp = clubById(fixtureOpponent(f, c.id));
  const userHome = f.home === c.id;
  updateFixtureFromEngine(f, summary, userHome);
  applyMatchPlayerStats(summary, userHome);
  const result = summary.userScore > summary.oppScore ? 'W' : summary.userScore < summary.oppScore ? 'L' : 'D';
  const appearanceIds = new Set(summary.players.filter(r => r.minutes > 0).map(r => r.pid));
  const scorerIds = new Set(summary.goalEvents.filter(g => g.side === 'left' && !g.ownGoal).map(g => g.scorerId));
  updateUserSquadMoraleAfterMatch(result, appearanceIds, scorerIds);
  const income = userHome ? matchdayIncome(c, opp.id) : null;
  if (income) {
    addLedger(income.ticketRevenue, '主场门票收入', `对阵 ${opp.name} · 观众 ${fmtPlain(income.attendance)} 人`, 'matchday');
    addLedger(income.concessions, '比赛日餐饮与周边', `观众 ${fmtPlain(income.attendance)} 人`, 'matchday');
    addLedger(income.matchSponsor, '比赛日广告收入', '场边广告与赞助激活', 'matchday');
  } else {
    const travel = Math.max(1000, Math.round(TIERS[c.tier].tv * .08 / 1000) * 1000);
    addLedger(-travel, '客场差旅费用', `前往 ${opp.stadium}`, 'matchday');
  }
  let prize = 0;
  if (result === 'W') prize = TIERS[c.tier].win;
  else if (result === 'D') prize = TIERS[c.tier].draw;
  if (prize > 0) addLedger(prize, `联赛${result === 'W' ? '胜场' : '平局'}奖金`, `第 ${f.round} 轮 · ${opp.name}`, 'prize');
  updateBoardAfterMatch(result, userHome, opp.reputation);
  const att = income?.attendance || estimatedAttendance(opp, c.id);
  fanbaseDeltaAfterResult(c, result, opp.reputation, att || c.capacity * .5);
  const timeNow = Math.floor(eng.time);
  addNews(`${result === 'W' ? '胜利' : result === 'L' ? '失利' : '平局'}：${c.short} ${summary.userScore} : ${summary.oppScore} ${opp.short}`,
    `第 ${f.round} 轮${userHome ? '主场' : '客场'}。${summary.goalEvents.length ? '进球者：' + summary.goalEvents.map(g => g.scorerName).join('、') + '。' : '双方均未破门。'}${income ? ` 门票收入 ${fmtMoney(income.total)}。` : ''}`, 'match');
  // 模拟本轮其余联赛
  simulateRoundFixtures(f.round);
  // 记录
  G.lastMatch = {
    fixtureId: f.id, season: G.season.number, week: G.season.week, round: f.round,
    userScore: summary.userScore, oppScore: summary.oppScore, result, home: userHome,
    opponentId: opp.id, attendance: income?.attendance || estimatedAttendance(opp, c.id),
    income, prize, summary, engine: undefined,
  };
  G.matchHistory.push({
    season: G.season.number, round: f.round, opponentId: opp.id, home: userHome,
    userScore: summary.userScore, oppScore: summary.oppScore, result,
    scorers: summary.goalEvents.map(g => ({ name: g.scorerName, side: g.side, minute: g.minute })),
    stats: f.stats, income: income?.total || 0,
  });
  if (G.matchHistory.length > 120) G.matchHistory.shift();
  G.season.day = 6;
  G.meta.totalDays++;
  expiringOfferCheck();
  matchSetupState = null;
  // 赛季末：22 轮或所有赛程已完成
  const playedAll = allFixturesOfClub(c.id).every(x => x.played);
  if (playedAll) fileSeasonEnd();
  saveGame();
}
function fileSeasonEnd() {
  if (!G || G.season.finished) return;
  const c = userClub();
  const tables = {};
  for (let t = 1; t <= 5; t++) tables[t] = computeStandings(t).map(r => ({ clubId: r.clubId, position: r.position, played: r.played, wins: r.wins, draws: r.draws, losses: r.losses, gf: r.gf, ga: r.ga, gd: r.gd, points: r.points }));
  G.season.finalTables = tables;
  const row = tables[c.tier].find(r => r.clubId === c.id);
  const position = row?.position || 12;
  const champion = position === 1;
  const promoted = c.tier > 1 && position <= 2;
  const relegated = c.tier < 5 && position >= 11;
  // 赛季排名奖金
  const prize = divisionPositionPrize(c.tier, position);
  addLedger(prize, '赛季排名奖金', `${TIER_NAME(c.tier)} 第 ${position} 名`, 'prize');
  // 董事会
  let confidenceDelta = 0;
  if (position <= G.board.targetPosition) confidenceDelta += 8;
  else if (position <= G.board.targetPosition + 2) confidenceDelta -= 1;
  else confidenceDelta -= 10;
  if (champion) confidenceDelta += 8;
  if (promoted) confidenceDelta += 8;
  if (relegated) confidenceDelta -= 12;
  if (c.cash < 0) confidenceDelta -= 5;
  G.board.confidence = clamp(G.board.confidence + confidenceDelta, 0, 100);
  c.boardConfidence = G.board.confidence;
  if (champion) {
    c.honours.push({ season: G.season.year, name: `${TIER_NAME(c.tier)}冠军`, tier: TIER_NAME(c.tier) });
    G.board.trophies.push({ season: G.season.year, tier: c.tier, name: `${TIER_NAME(c.tier)}冠军` });
    addNews('冠军！', `${c.name} 获得${G.season.label}${TIER_NAME(c.tier)}冠军。整座城市都在庆祝。`, 'club');
  }
  if (promoted) addNews('升级成功', `${c.name} 以第 ${position} 名完成赛季，获得下赛季${TIER_NAME(c.tier - 1)}参赛资格。`, 'club');
  if (relegated) addNews('不幸降级', `${c.name} 最终排名第 ${position}，下赛季将降入${TIER_NAME(c.tier + 1)}。`, 'club');
  evaluateSponsorObjective();
  // 赛季荣誉数据
  G.season.review = {
    position, champion, promoted, relegated, prize,
    confidenceDelta, finalTables: tables, tier: c.tier,
    topScorers: topScorersForDivision(c.tier, 8),
    expiring: squadPlayers(c).filter(p => p.contract <= 1).map(p => ({ id: p.id, name: p.name, age: p.age, contract: p.contract, wage: p.wage, ovr: p.ovr, potential: p.potential })),
    boardGoal: G.board.goal,
  };
  G.season.finished = true;
  G.season.phase = 'review';
  G.season.day = 6;
  addNews('赛季结束', `${G.season.label}结束。${c.name} 最终排名第 ${position}，获得排名奖金 ${fmtMoney(prize)}。前往赛季总结查看合同与升降级。`, 'board');
  saveGame();
}
function topScorersForDivision(tier, limit = 8) {
  const clubIds = G.divisions[tier]?.clubIds || [];
  const arr = [];
  for (const id of clubIds) {
    for (const p of squadPlayers(id)) if ((p.season?.goals || 0) > 0) arr.push({ id: p.id, name: p.name, club: clubById(p.clubId)?.short || '', goals: p.season.goals, assists: p.season.assists || 0 });
  }
  return arr.sort((a,b) => b.goals - a.goals || b.assists - a.assists).slice(0, limit);
}
function seasonExpiringPlayers() {
  return squadPlayers(userClub()).filter(p => p.contract <= 1 && !p.loan).map(p => ({ id: p.id, name: p.name, age: p.age, contract: p.contract, wage: p.wage, ovr: p.ovr, potential: p.potential }));
}
function confirmContinueSeason() {
  if (!G?.season?.finished) return;
  const expiring = seasonExpiringPlayers();
  if (!expiring.length) { continueToNextSeason(); return; }
  openModal({
    kicker: '合同提醒', title: '还有球员即将自由离队',
    body: `<p class="small muted" style="line-height:1.7">以下球员的合同将在新赛季开始时到期。如果你现在进入新赛季，他们会成为自由球员。</p><div class="detail-list" style="margin-top:10px">${expiring.map(p=>`<div class="dl-row"><span class="k">${esc(p.name)} · ${p.age} 岁</span><span class="v">${p.contract} 年 · 能力 ${p.ovr}</span></div>`).join('')}</div><p class="xsmall orange" style="margin-top:10px">建议先返回阵容页完成续约，再进入新赛季。</p>`,
    actions: `<button class="btn ghost" data-action="close-modal">留在赛季总结</button><button class="btn" data-action="nav" data-screen="squad">返回阵容续约</button><button class="btn danger" data-action="force-continue-season">仍然进入新赛季</button>`,
    wide: true,
  });
}
function showSeasonReview() {
  if (matchEngine) {
    matchEngine.stop(); matchEngine = null;
    const mr = $('#match-root'); if (mr) mr.innerHTML = '';
    document.body.style.overflow = '';
    renderApp();
  }
  if (!G?.season?.finished) {
    if (G?.season?.phase === 'review') { /* fallthrough */ }
    else return toast('赛季尚未结束', '完成全部 22 轮比赛后才能查看赛季总结。', 'bad');
  }
  const c = userClub();
  const review = G.season.review || {};
  const tables = G.season.finalTables || {};
  const row = tables[c.tier]?.find(r => r.clubId === c.id) || review;
  const expiring = seasonExpiringPlayers();
  const topScorers = review.topScorers || [];
  const promotionTeams = (tables[c.tier] || []).slice(0, 2);
  const relegationTeams = c.tier < 5 ? (tables[c.tier] || []).slice(-2) : [];
  openModal({
    kicker: `${G.season.label} · 赛季总结`, title: review.champion ? '冠军赛季' : review.promoted ? '升级赛季' : review.relegated ? '艰难的赛季' : '赛季结束',
    body: `<div class="club-hero" style="padding:18px;margin-bottom:14px"><div class="club-hero-inner">${clubCrestEl(c,'crest lg')}<div class="club-hero-info"><div class="kicker">${TIER_NAME(c.tier)} · 最终排名</div><h2 style="font-size:26px">第 ${row.position} 名 <span class="xsmall faint">· ${row.points} 分 · ${row.wins}胜 ${row.draws}平 ${row.losses}负</span></h2><div class="meta"><span class="tag ${review.champion?'gold':review.promoted?'green':review.relegated?'red':'solid'}">${review.champion?'冠军':review.promoted?'升级':review.relegated?'降级':'留级'}</span><span class="tag">排名奖金 ${fmtMoney(review.prize || 0)}</span><span class="tag ${G.board.confidence<35?'red':'gold'}">董事会信任 ${G.board.confidence}</span></div></div><div class="club-hero-stats"><div class="hero-stat"><div class="k">进球 / 失球</div><div class="v">${row.gf} <span style="font-size:12px;color:var(--faint)">/ ${row.ga}</span></div></div><div class="hero-stat"><div class="k">净胜球</div><div class="v">${row.gd>0?'+':''}${row.gd}</div></div><div class="hero-stat"><div class="k">赛季目标</div><div class="v" style="font-size:13px">${esc(G.board.goal)}</div></div></div></div></div>
    <div class="detail-grid"><div><div class="stat-block-title">联赛最终排名</div><div class="table-wrap" style="border:0"><table class="league-table"><thead><tr><th>#</th><th>球队</th><th>分</th><th>净</th></tr></thead><tbody>${(tables[c.tier]||[]).map(r=>`<tr class="${r.clubId===c.id?'me':''}"><td>${r.position}</td><td class="team-cell">${clubCrestEl(clubById(r.clubId),'crest sm')}${esc(clubById(r.clubId)?.name)}</td><td>${r.points}</td><td>${r.gd>0?'+':''}${r.gd}</td></tr>`).join('')}</tbody></table></div></div>
    <div><div class="stat-block-title">联赛奖项</div><div class="scorer-list">${topScorers.length?topScorers.map((p,i)=>`<div class="flex between"><span>${i+1}. ${esc(p.name)} <span class="faint">${esc(p.club)}</span></span><b>${p.goals} 球</b></div>`).join(''):'<div class="faint">暂无进球记录</div>'}</div>
      <div class="stat-block-title" style="margin-top:12px">升降级</div><div class="scorer-list"><div>升级：${promotionTeams.map(r=>esc(clubById(r.clubId)?.name)).join('、') || '—'}</div><div>降级：${relegationTeams.length?relegationTeams.map(r=>esc(clubById(r.clubId)?.name)).join('、'):'无（最低级别）'}</div></div>
      <div class="stat-block-title" style="margin-top:12px">合同警报</div>${expiring.length?`<div class="xsmall red" style="line-height:1.7">${expiring.map(p=>`${esc(p.name)}（${p.contract}年）`).join('、')}<br><span class="faint">进入新赛季后，这些合同到期的球员将自由离队。请先前往阵容页续约。</span></div>`:'<div class="xsmall green">没有即将到期的合同。</div>'}
    </div></div>
    <div class="tactic-note" style="margin-top:12px">${review.promoted?'董事会已经批准升级奖金，并提高了下赛季预算。更高一级的联赛会带来更多收入，也会带来更高的工资要求。':review.relegated?'降级会减少转播与门票收入。董事会仍然信任你，但下赛季必须止住颓势。':'稳定的赛季结束了。现在，决定哪些人留下，哪些人离开。'}</div>`,
    actions: `<button class="btn ghost" data-action="close-modal">返回主页</button><button class="btn ghost" data-action="nav" data-screen="squad">处理合同</button><button class="btn primary" data-action="season-continue">进入新赛季</button>`,
    wide: true, closable: true,
  });
}
function returnAllLoans() {
  for (const c of Object.values(G.clubs)) {
    for (const id of c.squad.slice()) {
      const p = player(id);
      if (!p?.loan) continue;
      const from = clubById(p.loan.fromClubId);
      if (!from) { p.loan = null; continue; }
      c.squad = c.squad.filter(x => x !== id);
      if (!from.squad.includes(id)) from.squad.push(id);
      p.clubId = from.id;
      p.loan = null;
    }
  }
}
function releasePlayerToFreeAgency(p, club, reason = '合同到期') {
  if (!p || !club) return;
  club.squad = club.squad.filter(id => id !== p.id);
  club.lineup = (club.lineup || []).filter(x => x.playerId !== p.id);
  club.bench = (club.bench || []).filter(id => id !== p.id);
  if (club.captainId === p.id) club.captainId = null;
  if (club.isUser) {
    // 玩家自己解约的球员至少保留一个赛季，避免“刚离队就消失在自由市场”。
    p.userReleasedSeason = G?.season?.number || 0;
    addNews(`${p.name} 离队`, `${reason}，${p.name} 成为自由球员。你可以尝试重新签下他，或者寻找替代者。`, 'transfer');
  } else if ((p.age >= 29 && p.ovr < 43) || p.ovr < 26) {
    // 低级别老将或能力不足者淡出职业赛场，避免自由球员无限膨胀
    p.clubId = null;
    delete G.players[p.id];
    G.freeAgents = G.freeAgents.filter(id => id !== p.id);
    return;
  }
  p.clubId = null;
  p.contract = 0;
  p.transferStatus = 'free';
  p.loan = null;
  if (!G.freeAgents.includes(p.id)) G.freeAgents.push(p.id);
}
function retirePlayer(p) {
  if (!p) return;
  const club = p.clubId ? clubById(p.clubId) : null;
  if (club) {
    club.squad = club.squad.filter(id => id !== p.id);
    club.lineup = (club.lineup || []).filter(x => x.playerId !== p.id);
    club.bench = (club.bench || []).filter(id => id !== p.id);
    if (club.isUser) addNews(`${p.name} 宣布退役`, `在效力${club.name}后，${p.name} 结束了自己的球员生涯。`, 'team');
  }
  p.clubId = null;
  p.loan = null;
  p.retired = true;
  delete G.players[p.id];
  G.freeAgents = G.freeAgents.filter(id => id !== p.id);
  G.youthProspects = (G.youthProspects || []).filter(id => id !== p.id);
}
function progressPlayerAtSeasonEnd(p, club) {
  p.age++;
  const age = p.age;
  const tier = club?.tier || 5;
  const played = p.season?.apps || 0;
  const room = Math.max(0, (p.potential || p.ovr) - p.ovr);
  let gains = 0;
  if (age <= 21) gains = clampRound(normal(2.1 + room * .05, 1.3), 0, 5);
  else if (age <= 24) gains = clampRound(normal(1.4 + room * .04, 1.1), 0, 4);
  else if (age <= 27) gains = clampRound(normal(.7 + room * .02, .9), 0, 3);
  else if (age <= 30) gains = clampRound(normal(.2, .7), 0, 2);
  else gains = 0;
  if (played > 25) gains++;
  if (p.professionalism > 70) gains++;
  if (p.hidden) gains += 1;
  if (club?.isUser) gains += Math.round((club.facility.training - 1) * .35);
  if (room <= 0) gains = 0;
  const attrsPool = age <= 23 ? ['sho','pas','dri','spd','str','tac','def','vis'] : age <= 29 ? ['pas','vis','tac','def','sho','dri','str'] : ['pas','vis','tac','def','str'];
  for (let i = 0; i < gains; i++) {
    if (p.ovr >= p.potential) break;
    const key = weightedPick(attrsPool, k => (p.growthBias?.[k] || 1) * (k === 'spd' && age >= 30 ? .15 : 1));
    const old = p.attrs[key];
    p.attrs[key] = clamp(p.attrs[key] + 1, 5, 99);
    const ovr = calcOvr(p.attrs, p.pos);
    if (ovr > p.potential + 1) p.attrs[key] = old;
    else p.ovr = ovr;
  }
  // 年龄衰减：30 岁后开始下滑，越老掉得越快；体能和速度先受影响。
  const beforeDeclineOvr = p.ovr;
  if (age >= 30) {
    const decline = age >= 37 ? randInt(6, 9) : age >= 35 ? randInt(5, 7) : age >= 33 ? randInt(4, 6) : age >= 31 ? randInt(3, 4) : randInt(2, 3);
    const pool = age >= 34 ? ['spd', 'sta', 'dri', 'phy', 'str', 'sho', 'def'] : ['spd', 'sta', 'dri', 'str', 'sho'];
    for (let i = 0; i < decline; i++) {
      const key = pick(pool);
      p.attrs[key] = clamp(p.attrs[key] - 1, 5, 99);
    }
    p.ovr = calcOvr(p.attrs, p.pos);
    p.potential = Math.max(p.ovr, p.potential - randInt(1, 3));
  }
  let retired = false;
  if (age >= 36 && chance(.35) || age >= 39) { retirePlayer(p); retired = true; }
  else p.ovr = calcOvr(p.attrs, p.pos);
  if (!retired && club?.isUser && p.ovr < beforeDeclineOvr) {
    const drop = beforeDeclineOvr - p.ovr;
    addNews('老将状态下滑', `${p.name} 已经 ${age} 岁，本赛季综合能力从 ${beforeDeclineOvr} 下降到 ${p.ovr}（-${drop}）。速度、体能和对抗会继续随着年龄下降，请提前准备替代者。`, 'team');
  }
}
function resolveContractsAndAge() {
  // 租借回归
  returnAllLoans();
  for (const club of Object.values(G.clubs)) {
    for (const id of club.squad.slice()) {
      const p = player(id);
      if (!p) continue;
      p.contract = (p.contract ?? 1) - 1;
      if (p.contract <= 0) {
        if (club.isUser) releasePlayerToFreeAgency(p, club, '合同到期');
        else {
          // AI 俱乐部有一定概率续约核心球员
          const renew = chance(p.ovr >= TIERS[club.tier].base ? .84 : .6);
          if (renew) {
            p.contract = randInt(2, 4);
            p.wage = calcWage(p.ovr, p.potential, p.age);
          } else releasePlayerToFreeAgency(p, club, '合同到期');
        }
      }
    }
  }
  // 年龄增长与退役
  for (const club of Object.values(G.clubs)) {
    for (const id of club.squad.slice()) {
      const p = player(id);
      if (p) progressPlayerAtSeasonEnd(p, club);
    }
  }
  // 自由球员与青年合同也进行年龄/成长结算（不处理退役的复杂新闻）
  for (const id of G.freeAgents.slice()) {
    const p = player(id);
    if (!p) continue;
    p.age++;
  }
  // 长年无人问津的自由球员会被这里清理；门将数量也在此封顶。
  pruneFreeAgents();
}
function refillAISquads() {
  // AI 俱乐部优先从自由球员市场补强，但不是无限制地“吸干”市场：
  // 每赛季最多从自由市场签下 FREE_AGENT_AI_SIGNINGS 人，其余用新生成的球员补足，
  // 这样玩家始终能在自由市场找到可签的人。门将只签“富余”的，至少给玩家留 2 名。
  const aiSignBudget = { left: 20 };
  for (const club of otherClubs()) {
    club.squad = club.squad.filter(id => player(id));
    club.lineup = (club.lineup || []).filter(x => x.playerId && player(x.playerId)?.clubId === club.id);
    club.bench = (club.bench || []).filter(id => player(id)?.clubId === club.id);
    let guard = 0;
    while (club.squad.length < 20 && guard++ < 30) {
      const current = squadPlayers(club);
      const hasGk = current.filter(p => p.pos === 'GK').length;
      const freeGkLeft = G.freeAgents.map(id => player(id)).filter(p => p && !p.clubId && p.pos === 'GK').length;
      // 门将也要有消耗出口：除了必须补到 2 人，第 3 门将的空缺也会以一定概率从自由市场签人，
      // 否则每个赛季释放出来的门将只会堆在自由市场里。
      const wantGk = hasGk < 2 || (hasGk < 3 && chance(.3));
      const needPos = wantGk ? 'GK' : weightedPick(POSITIONS, p => ({ GK: .2, CB: 14, LB: 8, RB: 8, DM: 6, CM: 14, LM: 5, RM: 5, AM: 6, LW: 5, RW: 5, ST: 12, SS: 3 }[p]));
      // 在自由球员中寻找合适目标
      const freeCandidates = G.freeAgents.map(id => player(id)).filter(p => p && p.age <= 32 && p.clubId == null && (needPos === 'GK' ? p.pos === 'GK' : POS_GROUP[p.pos] === POS_GROUP[needPos]) && (p.ovr >= TIERS[club.tier].base - 10 || (p.age <= 23 && p.potential >= TIERS[club.tier].base)));
      const gkReserveOk = !wantGk || freeGkLeft > 2;
      let signed = false;
      if (freeCandidates.length && aiSignBudget.left > 0 && gkReserveOk && chance(wantGk ? .85 : .42)) {
        freeCandidates.sort((a,b) => (b.ovr + Math.max(0, b.potential - b.ovr) * .3) - (a.ovr + Math.max(0, a.potential - a.ovr) * .3));
        const pickFree = freeCandidates[0];
        pickFree.clubId = club.id;
        pickFree.contract = randInt(1, 3);
        pickFree.wage = calcWage(pickFree.ovr, pickFree.potential, pickFree.age);
        pickFree.transferStatus = 'none';
        pickFree.fitness = randInt(80, 98);
        G.freeAgents = G.freeAgents.filter(id => id !== pickFree.id);
        club.squad.push(pickFree.id);
        assignSquadNumber(pickFree, club);
        aiSignBudget.left--;
        signed = true;
      }
      if (signed) continue;
      const age = randInt(18, 28);
      const quality = clamp(normal(TIERS[club.tier].base - 3, 6), 24, 90);
      const nat = pickNationality(club.tier <= 3 ? .5 : .3);
      const p = makePlayer({ nat, age, pos: needPos, quality, clubId: club.id, contract: randInt(2, 4), gemChance: .02, foreignBias: .3 });
      p.wage = calcWage(p.ovr, p.potential, p.age);
      G.players[p.id] = p;
      club.squad.push(p.id);
      assignSquadNumber(p, club);
    }
    club.captainId = pickCaptain(club, G.players);
    club.lineup = bestLineupForClub(club, G.players, true);
    club.bench = bestBenchForClub(club, G.players, club.lineup, 7, true);
    club.wageBudget = Math.round(clubWageBill(club) * 1.12);
    club.capacity = Math.max(club.capacity, TIERS[club.tier].capacity[0]);
    club.fanbase = clamp(club.fanbase, TIERS[club.tier].fanbase[0] * .35, TIERS[club.tier].fanbase[1] * 1.4);
    const budgetFloor = { 1: 30000000, 2: 12000000, 3: 3000000, 4: 800000, 5: 160000 }[club.tier] || 160000;
    club.transferBudget = Math.max(club.transferBudget, Math.round(budgetFloor * (.65 + rand() * .6) / 10000) * 10000);
  }
  // 收口自由球员池：老将淡出、门将数量封顶、总人数封顶（详细规则见 pruneFreeAgents）。
  pruneFreeAgents();
}
function resetAllForNewSeason() {
  for (const p of Object.values(G.players)) {
    if (!p.season) p.season = emptySeasonStats();
    resetSeasonStats(p);
    p.form = clamp(randInt(44, 62), 20, 90);
    p.fitness = randInt(88, 100);
    p.injuryDays = 0;
    p.suspension = 0;
    p.yellowCards = 0;
    p.morale = clamp(Math.round(lerp(p.morale ?? 60, 64, .55)), 20, 95);
    p.contract = p.contract ?? 0;
  }
  // 青年合同到期清理
  G.youthProspects = (G.youthProspects || []).filter(id => player(id));
}
function continueToNextSeason() {
  if (!G?.season?.finished) return;
  closeModal();
  const c = userClub();
  const oldTier = c.tier;
  const review = G.season.review || {};
  const finalTables = G.season.finalTables || {};
  const oldYear = G.season.year;
  const oldSeason = G.season.number;
  const userRow = finalTables[oldTier]?.find(r => r.clubId === c.id);
  // 升降级：全联赛同步洗牌
  for (let t = 1; t <= 4; t++) {
    const down = (finalTables[t] || []).slice(-2);
    const up = (finalTables[t + 1] || []).slice(0, 2);
    for (const r of down) { const cl = clubById(r.clubId); if (cl) cl.tier = t + 1; }
    for (const r of up) { const cl = clubById(r.clubId); if (cl) cl.tier = t; }
  }
  // 用户升降级奖金
  const newTier = c.tier;
  const promoted = newTier < oldTier;
  const relegated = newTier > oldTier;
  if (promoted) {
    const bonus = TIERS[oldTier].promotionBonus || 0;
    if (bonus > 0) addLedger(bonus, '升级奖金', `${TIER_NAME(oldTier)} → ${TIER_NAME(newTier)}`, 'prize');
    c.reputation = clamp(c.reputation + 5, 5, 99);
    c.fanbase = Math.round(c.fanbase * 1.28);
    c.capacity = Math.max(c.capacity, Math.round(TIERS[newTier].capacity[0] * .55));
    c.promotedSeason = oldSeason + 1;
    addNews('新的级别', `俱乐部升入${TIER_NAME(newTier)}。更高的舞台带来更多收入、更大的球迷群体，以及更高的工资要求。`, 'club');
    addNews('升班马适应期', `${TIER_NAME(newTier)}的对抗强度明显高于上一级。新赛季前 8 周，球队会因不适应节奏而整体执行力下降；如果阵容深度不足，很容易在积分榜底部挣扎并降回去。`, 'board');
    G.board.confidence = clamp(G.board.confidence + 6, 0, 100);
  } else if (relegated) {
    c.promotedSeason = null;
    const parachute = TIERS[oldTier].relegationParachute || 0;
    if (parachute > 0) addLedger(parachute, '降级保护金', `从${TIER_NAME(oldTier)}降级`, 'prize');
    c.reputation = clamp(c.reputation - 5, 5, 99);
    c.fanbase = Math.round(c.fanbase * .82);
    addNews('降级', `俱乐部降入${TIER_NAME(newTier)}。董事会要求球队尽快重返更高级别。`, 'club');
    G.board.confidence = clamp(G.board.confidence - 8, 0, 100);
  }
  G.seasonHistory.push({
    season: oldYear, tier: oldTier, position: userRow?.position || 12, points: userRow?.points || 0,
    champion: review.champion, promoted, relegated,
  });
  if (G.seasonHistory.length > 20) G.seasonHistory.shift();
  // 合同、年龄、退役与租借
  resolveContractsAndAge();
  // 同步各联赛
  for (let t = 1; t <= 5; t++) {
    G.divisions[t].clubIds = Object.values(G.clubs).filter(cl => cl.tier === t).map(cl => cl.id);
  }
  refillAISquads();
  // 用户阵容整理
  c.lineup = bestLineupPlayers(c, true).map(x => ({ ...x }));
  c.bench = bestBenchIds(c, BENCH_SIZE);
  autoAssignCaptainIfNeeded();
  c.squad = c.squad.filter(id => player(id) && player(id).clubId === c.id);
  if (c.captainId && !player(c.captainId)) c.captainId = null;
  if (!c.lineup.some(x => x.playerId)) c.lineup = [];
  // 新赛季基础
  resetAllForNewSeason();
  G.season.number = oldSeason + 1;
  G.season.year = oldYear + 1;
  G.season.label = `${oldYear + 1}赛季`;
  G.season.startISO = seasonStartISO(oldYear + 1);
  G.season.week = 1; G.season.day = 0; G.season.round = 1;
  G.season.finished = false; G.season.phase = 'season';
  G.season.finalTables = null; G.season.review = null;
  G.season.transferWindowOpen = true; G.season.transferWindowLabel = '季初转会窗';
  G.season.lastRoundSimulated = 0;
  G.userTier = c.tier;
  G.offers = []; G.negotiations = [];
  G.lastMatch = null;
  G.market = { playerIds: [], refreshedSeason: 0, refreshedWeek: 0 };
  G.youthPromotions = 0;
  G.youthIntakeCount = 0;
  c.streetLastDay = -1;
  c.interestedPlayers = [];
  c.sponsor = null;
  c.sponsorOffers = makeSponsorOffers(c);
  c.wageBudget = Math.max(6000, calcRecommendedWageBudget(c));
  if (G.board.confidence < 30) {
    c.wageBudget = Math.round(c.wageBudget * (G.board.confidence < 15 ? .72 : .86) / 1000) * 1000;
    addNews('董事会收紧预算', `由于上赛季表现与信任度不佳，董事会将新赛季周薪预算限制在 ${fmtMoney(c.wageBudget)}。`, 'board');
  }
  c.boardConfidence = G.board.confidence;
  // 新赛程
  for (let t = 1; t <= 5; t++) {
    G.divisions[t].fixtures = generateDivisionFixtures(G.divisions[t].clubIds, t);
  }
  // 分期收付、二次转会
  processIncomingReceivables();
  processSellOnResales();
  // 青训产出：未提拔的旧苗子会成长一岁，超过年龄后离开学院
  ageYouthProspects();
  generateYouthIntake();
  setBoardGoal();
  addNews('新赛季开始', `${G.season.label}开始。转会窗已经开启，董事会目标：${G.board.goal}。`, 'board');
  refreshTransferListings(true);
  saveGame(true);
  renderApp();
  openModal({
    kicker: 'New Season', title: `${G.season.label} · 新的征程`,
    body: `<div class="flex between wrap gap14"><div>${clubCrestEl(c,'crest lg')}</div><div style="flex:1"><div class="kicker">${TIER_NAME(c.tier)}</div><h2 style="font-size:23px;margin-top:2px">${esc(c.name)}</h2><p class="small muted" style="margin-top:4px">董事会目标：${esc(G.board.goal)}。青年队已经提交了新一批球员名单。</p></div></div><div class="hairline"></div><div class="detail-list"><div class="dl-row"><span class="k">现有球员</span><span class="v">${squadPlayers(c).length} 人</span></div><div class="dl-row"><span class="k">可用现金</span><span class="v gold">${fmtMoney(c.cash)}</span></div><div class="dl-row"><span class="k">工资预算</span><span class="v">${fmtMoney(c.wageBudget)}</span></div><div class="dl-row"><span class="k">青训新苗</span><span class="v">${(G.youthProspects||[]).length} 人</span></div></div><p class="xsmall faint" style="margin-top:10px">合同到期离队的球员已成为自由球员。你可以在转会市场重新签下他们，或寻找新的面孔。</p>`,
    actions: `<button class="btn primary" data-action="close-modal">开始新赛季</button>`, wide: true,
  });
}
function ageYouthProspects() {
  const keep = [];
  for (const id of (G.youthProspects || [])) {
    const p = player(id);
    if (!p) continue;
    p.age++;
    if (p.age >= 21) {
      addNews(`${p.name} 离开青训营`, '由于超过青训年龄且未获提拔，球员离开了俱乐部。', 'youth');
      delete G.players[p.id];
      G.freeAgents = G.freeAgents.filter(x => x !== p.id);
    } else {
      // 学院内小幅成长
      const key = pick(['pas', 'dri', 'tac', 'sho']);
      p.attrs[key] = clamp(p.attrs[key] + randInt(0, 1), 5, 99);
      p.ovr = calcOvr(p.attrs, p.pos);
      keep.push(id);
    }
  }
  G.youthProspects = keep;
}
function debugSimulateMatch() {
  if (!G) return null;
  const c = userClub();
  const f = nextUserFixture();
  if (!f) return null;
  const opp = clubById(fixtureOpponent(f, c.id));
  ensureUserLineupValid();
  const engine = new MatchEngine({
    fixture: f, userClub: c, oppClub: opp, weather: WEATHERS[0], teamTalk: 'calm',
    oppLineup: bestLineupForClub(opp, G.players, true), oppBench: bestBenchForClub(opp, G.players, bestLineupForClub(opp, G.players, true), 7, true),
  });
  let steps = 0;
  while (!engine.finished && steps < 60 * 360) {
    if (engine.halfTime) { engine.secondHalf(); }
    if (engine.paused) engine.paused = false;
    engine.step(1/60);
    steps++;
  }
  return { score: [engine.teams.left.score, engine.teams.right.score], stats: engine.stats, summary: engine.summary(), steps };
}
