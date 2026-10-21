/* ==========================================================
   core.js - 상태, 저장, 게임 규칙 (DOM을 다루지 않는다)
   화면 갱신은 ui.js가 담당한다. 규칙을 바꿀 때는 이 파일만 수정한다.
   ========================================================== */

/* ---------- 유틸 ---------- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const chance = p => Math.random() < p;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const round1 = v => Math.round(v * 10) / 10;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/* 머티리얼 아이콘에 없는 모양은 직접 그린 SVG 를 쓴다 (이름이 CUSTOM_ICONS 에 있으면 그것을 그린다) */
const CUSTOM_ICONS = {
  pistol: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="1.5" y="5" width="20" height="6" rx="1.2"/><rect x="2.5" y="3.4" width="2" height="1.8"/><rect x="18" y="3.4" width="2" height="1.8"/><path d="M12.6 11h6.4l-1.9 9.2a1 1 0 0 1-1 .8h-2.6a1 1 0 0 1-1-1.2z"/><path d="M6.5 11v3c0 1.2.9 2 2 2h3.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><rect x="9.6" y="11" width="1.5" height="3" rx=".6"/></svg>'
};
const icon = n => CUSTOM_ICONS[n] ? `<span class="material-symbols-rounded custom-icon" aria-hidden="true">${CUSTOM_ICONS[n]}</span>` : `<span class="material-symbols-rounded" aria-hidden="true">${n}</span>`;
const fmtTime = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const merge = (base, over) => {
  const out = { ...base };
  for (const k in over) out[k] = isObj(base[k]) && isObj(over[k]) ? merge(base[k], over[k]) : over[k];
  return out;
};

/* ---------- 저장 ---------- */
function sanitize(s) {
  if (!LOCATIONS[s.location]) s.location = DEFAULT_LOCATION;
  EQUIP_SLOTS.forEach(slot => {
    const n = s.equipment[slot];
    if (n && (!ITEMS[n] || ITEMS[n].slot !== slot)) s.equipment[slot] = null;
  });
  ['장비', '소모품', '재료'].forEach(tab => {
    const list = Array.isArray(s.inventory[tab]) ? s.inventory[tab] : [];
    s.inventory[tab] = list.filter(x => x && ITEMS[x.n] && ITEMS[x.n].tab === tab && x.q > 0);
  });
  hardenState(s);
  if (s.active && !ACTIONS[s.active.id]) s.active = null;
  if (s.pending && !ACTIONS[s.pending.id]) s.pending = null;
  s.buffs = (s.buffs || []).filter(b => BUFFS[b.id]);
  const z = s.dungeon && DANGER_ZONES.find(d => d.id === s.dungeon.zone);
  if (!z || !tileOf(z, s.dungeon.x, s.dungeon.y) || tileOf(z, s.dungeon.x, s.dungeon.y) === '#' || tileOf(z, s.dungeon.x, s.dungeon.y) === '.') { s.dungeon = null; if (LOCATIONS[s.location] && LOCATIONS[s.location].danger) s.location = '이동장치'; }
  if (s.dungeon && s.location !== s.dungeon.zone) s.location = s.dungeon.zone;
  if (s.dungeon && !Number.isFinite(s.dungeon.seed)) s.dungeon.seed = Math.floor(Math.random() * 2147483647);
  return s;
}
/* 저장 데이터 검증: 손으로 고친 저장 값이 게임 규칙을 깨지 못하게 범위와 형식을 강제한다.
   (클라이언트 검증일 뿐이다. 실서비스에서는 서버가 모든 규칙을 다시 계산해야 한다 → SECURITY.md) */
const cleanText = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, max);
const intIn = (v, lo, hi, d) => Number.isFinite(+v) ? clamp(Math.floor(+v), lo, hi) : d;
const CHAT_TABS = ['월드', '길드', '알림']; // 알림 = 공지만 받는 읽기 전용
function hardenState(s) {
  const c = s.character;
  c.name = cleanText(c.name, 12); c.title = TITLES.includes(c.title) ? c.title : TITLES[0];
  s.titles = [...new Set([TITLES[0], ...(Array.isArray(s.titles) ? s.titles : []).filter(t => TITLES.includes(t)), ...(TITLES.includes(c.title) ? [c.title] : [])])];
  c.age = intIn(c.age, AGE_MIN, AGE_MAX, 20); c.keywords = cleanText(c.keywords, 60);
  c.ability = cleanText(c.ability, 20); c.abilityDesc = cleanText(c.abilityDesc, 300);
  c.level = intIn(c.level, 1, MAX_LEVEL, 1); c.rank = 'FEDCBAS'.includes(c.rank) ? c.rank : 'F';
  c.allowFriend = c.allowFriend !== false; c.allowGuild = c.allowGuild !== false;
  s.unlockSeen = Object.fromEntries(Object.entries(s.unlockSeen && typeof s.unlockSeen === 'object' ? s.unlockSeen : {}).filter(([k, v]) => typeof k === 'string' && k.length < 30 && v === true));
  s.profileEditAt = intIn(s.profileEditAt, 0, 4e12, 0);
  s.deaths = intIn(s.deaths, 0, 99999, 0);
  s.money = intIn(s.money, 0, 999999999, 0); s.statPoints = intIn(s.statPoints, 0, 99, 0);
  STAT_DEFS.forEach(d => { s.stats[d.key] = intIn(s.stats[d.key], 0, 99, STAT_BASE); });
  s.enchants = Object.fromEntries(Object.entries(s.enchants && typeof s.enchants === 'object' ? s.enchants : {}).filter(([k, e]) => ITEMS[k] && ITEMS[k].tab === '장비' && e && (e.k === 'hp' || e.k === 'sp' || STAT_DEFS.some(d => d.key === e.k))).map(([k, e]) => [k, { k: e.k, v: intIn(e.v, 1, e.k === 'hp' || e.k === 'sp' ? 30 : 5, 1), n: intIn(e.n, 1, 9999, 1) }]));
  s.reinforce = Object.fromEntries(Object.entries(s.reinforce && typeof s.reinforce === 'object' ? s.reinforce : {}).filter(([k]) => ITEMS[k] && ITEMS[k].slot === '무기').map(([k, v]) => [k, intIn(v, 0, REINFORCE_RANKS.length - 1, 0)]).filter(([, v]) => v > 0));
  const v = s.vitals, mb = maxBonus(s.equipment, s.enchants);
  v.hpMax = 100 + mb.hp; v.spMax = 100 + mb.sp; v.hp = intIn(v.hp, 1, v.hpMax, v.hpMax); v.sp = intIn(v.sp, 0, v.spMax, v.spMax); v.exp = intIn(v.exp, 0, 999999, 0);
  s.settings.bgmVolume = intIn(s.settings.bgmVolume, 0, 100, BGM_DEFAULT_VOLUME); s.settings.sfxVolume = intIn(s.settings.sfxVolume, 0, 100, 65);
  s.settings.customAccent = /^#[0-9a-f]{6}$/i.test(s.settings.customAccent) ? s.settings.customAccent : '#197da1';
  if (!(s.settings.fontSize in FONT_SCALES)) s.settings.fontSize = 'm';
  if (!['light', 'dark', 'custom'].includes(s.settings.theme)) s.settings.theme = 'light';
  if (!['light', 'dark'].includes(s.settings.customBase)) s.settings.customBase = 'light';
  s.settings.guildAlert = s.settings.guildAlert !== false;
  if (!['임무', '주위 대원'].includes(s.side)) s.side = '임무';
  const ex = {}; // 가 본 칸: 구역/좌표 형식만 남긴다
  DANGER_ZONES.forEach(z => { const src = s.explored && typeof s.explored === 'object' ? s.explored[z.id] : null; ex[z.id] = {}; if (src && typeof src === 'object') Object.keys(src).filter(k => /^-?\d{1,3},-?\d{1,3}$/.test(k)).slice(0, 4000).forEach(k => { ex[z.id][k] = 1; }); });
  if (s.dungeon) Object.keys(s.dungeon.seen || {}).filter(k => /^-?\d{1,3},-?\d{1,3}$/.test(k)).forEach(k => { ex[s.dungeon.zone][k] = 1; });
  s.explored = ex;
  const vis = {}; // 실제로 밟아 본 칸만 남긴다 (이전 저장에는 기록이 없어 지금 서 있는 칸부터 쌓인다)
  DANGER_ZONES.forEach(z => { const src = s.visited && typeof s.visited === 'object' ? s.visited[z.id] : null; vis[z.id] = {}; if (src && typeof src === 'object') Object.keys(src).filter(k => /^-?\d{1,3},-?\d{1,3}$/.test(k)).slice(0, 4000).forEach(k => { vis[z.id][k] = 1; }); });
  if (s.dungeon && vis[s.dungeon.zone] && Number.isFinite(s.dungeon.x) && Number.isFinite(s.dungeon.y)) vis[s.dungeon.zone][`${s.dungeon.x},${s.dungeon.y}`] = 1;
  s.visited = vis;
  const chats = {}; // 채널은 월드/길드/알림만. 알림은 항상 공지에서 다시 만든다(읽기 전용)
  CHAT_TABS.forEach(k => { chats[k] = (Array.isArray(s.chats[k]) ? s.chats[k] : []).filter(m => Array.isArray(m) && (m.length === 2 || m.length === 3)).map(m => [cleanText(m[0], 20), cleanText(m[1], 300), Number.isFinite(m[2]) ? m[2] : 0]).slice(-200); });
  chats['알림'] = NOTICE_FEED();
  s.chats = chats; if (!CHAT_TABS.includes(s.chatTab)) s.chatTab = CHAT_TABS[0];
  const known = id => QUESTS.some(q => q.id === id);
  s.questTaken = Object.fromEntries(Object.keys(s.questTaken || {}).filter(known).map(k => [k, true]));
  s.qprog = Object.fromEntries(Object.keys(s.qprog || {}).filter(known).map(k => [k, intIn(s.qprog[k], 0, 999, 0)]));
  s.questAt = Object.fromEntries(Object.entries(s.questAt && typeof s.questAt === 'object' ? s.questAt : {}).filter(([k, v]) => known(k) && Number.isFinite(v)));
  const fp = Array.isArray(s.farm && s.farm.plots) ? s.farm.plots : [];
  s.farm = { plots: Array.from({ length: 6 }, (_, i) => { const p = fp[i]; return p && CROPS[p.crop] && Number.isFinite(p.at) ? { crop: p.crop, at: p.at } : null; }) };
  s.pets = (Array.isArray(s.pets) ? s.pets : []).filter(p => p && PET_SPECIES[p.id]).map(p => ({ id: p.id, bond: intIn(p.bond, 0, 100, PET_BOND_START), fedAt: Number.isFinite(p.fedAt) ? p.fedAt : 0, exp: p.exp && DANGER_ZONES.some(z => z.id === p.exp.zone) && Number.isFinite(p.exp.at) ? { zone: p.exp.zone, at: p.exp.at } : null }))
    .filter((p, i, a) => a.findIndex(q => q.id === p.id) === i).slice(0, Object.keys(PET_SPECIES).length);
  if (s.pets[s.petActive] && s.pets[s.petActive].exp) s.petActive = -1;
  s.petActive = intIn(s.petActive, -1, s.pets.length - 1, -1);
  const jb = s.subjob;
  s.subjob = jb && typeof jb === 'object' && Array.isArray(jb.tags) && jb.tags.some(t => TAG_NAMES.includes(t))
    ? { name: cleanText(jb.name, JOB_NAME_MAX) || jb.tags.find(t => TAG_NAMES.includes(t)), tags: [...new Set(jb.tags.filter(t => TAG_NAMES.includes(t)))].slice(0, JOB_TAG_MAX), level: intIn(jb.level, 1, JOB_MAX_LV, 1), prog: intIn(jb.prog, 0, 99, 0), lastAt: Number.isFinite(jb.lastAt) ? jb.lastAt : 0 } : null;
  s.friends = [...new Set((Array.isArray(s.friends) ? s.friends : []).map(n => cleanText(n, 12)).filter(Boolean))].slice(0, FRIEND_MAX);
  s.mailSeq = intIn(s.mailSeq, 1, 999999999, 1);
  const okItems = it => (Array.isArray(it) ? it : []).filter(r => Array.isArray(r) && ITEMS[r[0]]).map(r => [r[0], intIn(r[1], 1, 99, 1)]).slice(0, MAIL_ITEM_KINDS);
  s.mail = (Array.isArray(s.mail) ? s.mail : []).filter(m => m && Number.isFinite(m.at)).map(m => ({ id: intIn(m.id, 1, 999999999, 1), from: cleanText(m.from, 12), subject: cleanText(m.subject, 30), body: cleanText(m.body, 300),
    items: okItems(m.items), at: m.at, kept: m.kept === true, read: m.read === true, got: m.got === true })).slice(0, MAIL_BOX_MAX);
  const g = s.guild;
  if (g && typeof g === 'object' && cleanText(g.name, GUILD_NAME_MAX).length >= GUILD_NAME_MIN) {
    s.guild = { name: cleanText(g.name, GUILD_NAME_MAX), master: g.master === true, members: [...new Set((Array.isArray(g.members) ? g.members : []).map(n => cleanText(n, 12)).filter(Boolean))].slice(0, GUILD_MAX - 1) };
  } else s.guild = null;
  s.gambleAt = Object.fromEntries(Object.entries(s.gambleAt && typeof s.gambleAt === 'object' ? s.gambleAt : {}).filter(([k, v]) => GAMBLES[k] && Number.isFinite(v)));
  s.invAt = Object.fromEntries(Object.entries(s.invAt && typeof s.invAt === 'object' ? s.invAt : {}).filter(([k, v]) => /^제\d구역,\d+,\d+$/.test(k) && Number.isFinite(v)).slice(0, 200));
  s.repeats = Object.fromEntries(Object.entries(s.repeats && typeof s.repeats === 'object' ? s.repeats : {}).filter(([k, v]) => ACTIONS[k.split('@')[0]] && v && Number.isFinite(v.at)).map(([k, v]) => [k, { n: intIn(v.n, 0, 9999, 0), at: v.at }]));
  s.trades = { day: /^\d{4}-\d{2}-\d{2}$/.test((s.trades || {}).day) ? s.trades.day : '', n: intIn((s.trades || {}).n, 0, 99, 0) };
  s.learned = [...new Set(Array.isArray(s.learned) ? s.learned : [])].filter(n => RECIPES.some(rc => rc.out === n) && !STARTER_RECIPES.includes(n));
  s.eventAt = Object.fromEntries(Object.entries(s.eventAt && typeof s.eventAt === 'object' ? s.eventAt : {}).filter(([k, v]) => /^제\d구역:\d+$/.test(k) && Number.isFinite(v)).slice(0, 200));
  if (s.active && s.active.id === '타일 이동' && s.active.cum && !(Array.isArray(s.active.cum) && s.active.cum.length === (s.active.path || []).length && s.active.cum.every(Number.isFinite))) delete s.active.cum;
  s.logs = (Array.isArray(s.logs) ? s.logs : []).filter(l => l && typeof l.text === 'string').map(l => ({ time: cleanText(l.time, 10), text: cleanText(l.text, 400) })).slice(0, 100);
  if (s.crafting && (!RECIPES[s.crafting.index] || !Number.isFinite(s.crafting.endAt))) s.crafting = null;
  if (s.crafting) { s.crafting.qty = intIn(s.crafting.qty, 1, MAX_BATCH, 1); s.crafting.great = !!s.crafting.great; s.crafting.ready = !!s.crafting.ready; }
  if (!['장비', '음식', '약', '재료'].includes(s.craftTab)) s.craftTab = null;
  if (s.active && s.active.id === '구역 이동' && !(LOCATIONS[s.active.to] && LOCATIONS[s.active.to].danger && !s.dungeon && Number.isFinite(s.active.endAt))) s.active = null;
  if (s.active && s.active.id === '타일 이동' && !(s.dungeon && Array.isArray(s.active.path) && s.active.path.length)) s.active = null;
}
function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved && saved.version === SAVE_VERSION) {
        // 단련 도입 전 저장: 예전 규칙(등급별 해금)으로 알고 있던 레시피를 그대로 이어받는다
        if (saved.created && !Array.isArray(saved.learned)) { const ri = RANK_ORDER.indexOf((saved.character || {}).rank); saved.learned = RECIPES.filter(rc => ri >= RANK_ORDER.indexOf(rc.rank) && !STARTER_RECIPES.includes(rc.out)).map(rc => rc.out); }
        return sanitize(merge(createDefaultState(), saved));
      }
    }
  } catch (e) { /* 깨진 저장 데이터는 무시 */ }
  return createDefaultState();
}
const state = loadState();

/* ---------- 도감 ---------- */
function discover(type, id) {
  const c = state.codex[type];
  if (!c[id]) { c[id] = 1; return true; }
  return false;
}
(function discoverStart() {
  Object.values(state.inventory).forEach(l => l.forEach(s => discover('items', s.n)));
  Object.values(state.equipment).forEach(n => n && discover('items', n));
})();
/* 저장: 같은 동작 안에서 save()가 여러 번 불려도 마지막에 한 번만 쓴다 (JSON 직렬화·디스크 쓰기 절감). 창을 닫을 때는 즉시 쓴다 */
let _saveQueued = false;
function flushSave() { _saveQueued = false; if (window.__noSave) return; try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* 저장 불가 환경 */ }
  if (typeof cloudSchedule === 'function') cloudSchedule(); }
function save() { if (_saveQueued) return; _saveQueued = true; queueMicrotask(flushSave); }
addEventListener('pagehide', () => { if (_saveQueued) flushSave(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && _saveQueued) flushSave(); });

/* ---------- 인벤토리 ---------- */
const bagCapacityFor = eq => (eq['가방'] && ITEMS[eq['가방']].capacity) || BASE_BAG_CAPACITY;
const bagCapacity = () => bagCapacityFor(state.equipment);
const countItem = name => state.inventory[ITEMS[name].tab].filter(s => s.n === name).reduce((a, s) => a + s.q, 0);

/* 가방 칸은 장비/소모품/재료 전체가 공유한다 */
const usedSlots = (inv = state.inventory) => Object.values(inv).reduce((a, l) => a + l.length, 0);

/* 담을 수 있는 수량을 계산해 담는다. 담은 수량을 반환 */
function addItem(name, qty = 1) {
  const it = ITEMS[name], list = state.inventory[it.tab], stackable = it.tab !== '장비';
  let left = qty;
  if (stackable) {
    for (const s of list) {
      if (s.n !== name || s.q >= STACK_MAX) continue;
      const a = Math.min(left, STACK_MAX - s.q); s.q += a; left -= a;
    }
  }
  while (left > 0 && usedSlots() < bagCapacity()) {
    const a = stackable ? Math.min(left, STACK_MAX) : 1;
    list.push({ n: name, q: a }); left -= a;
  }
  if (qty - left) discover('items', name);
  return qty - left;
}
function canAdd(name) {
  const it = ITEMS[name], list = state.inventory[it.tab];
  return usedSlots() < bagCapacity() || (it.tab !== '장비' && list.some(s => s.n === name && s.q < STACK_MAX));
}
function removeItem(name, qty = 1) {
  const list = state.inventory[ITEMS[name].tab];
  let left = qty;
  for (let i = list.length - 1; i >= 0 && left > 0; i--) {
    if (list[i].n !== name) continue;
    const a = Math.min(left, list[i].q); list[i].q -= a; left -= a;
    if (!list[i].q) list.splice(i, 1);
  }
  return qty - left;
}

/* ---------- 장비 강화 ---------- */
function maxBonus(eq, enchants) {
  const b = { hp: 0, sp: 0 };
  Object.values(eq).forEach(n => { const e = n && enchants[n]; if (e && (e.k === 'hp' || e.k === 'sp')) b[e.k] += e.v; });
  return b;
}
function syncMax() { // 최대 HP·기력 = 100 + 장착한 장비의 강화 보너스
  const b = maxBonus(state.equipment, state.enchants), v = state.vitals;
  v.hpMax = 100 + b.hp; v.spMax = 100 + b.sp; v.hp = Math.min(v.hp, v.hpMax); v.sp = Math.min(v.sp, v.spMax);
}
const enchantText = e => !e ? '' : e.k === 'hp' ? `최대 HP +${e.v}` : e.k === 'sp' ? `최대 기력 +${e.v}` : `${STAT_DEFS.find(d => d.key === e.k).name} +${e.v}`;
function rollEnchant() {
  const total = ENCHANT_POOL.reduce((a, p) => a + p[1], 0); let r = Math.random() * total, pick_ = ENCHANT_POOL[0];
  for (const p of ENCHANT_POOL) { if (r < p[1]) { pick_ = p; break; } r -= p[1]; }
  return { k: pick_[0], v: rand(...pick_[2]) };
}
/* 강화할 수 있는 장비: 장착 중이거나 소지품에 있는 장비 (이름별로 하나) */
const enchantables = () => [...new Set([...Object.values(state.equipment).filter(Boolean), ...state.inventory['장비'].map(s => s.n)])].filter(n => ITEMS[n] && ITEMS[n].tab === '장비');
/* 강화 시도. 성공 { old, now } / 실패 사유 문자열 */
function enchantItem(name) {
  if (!ITEMS[name] || ITEMS[name].tab !== '장비' || !enchantables().includes(name)) return '강화할 수 없는 장비입니다.';
  if (state.money < ENCHANT_COST) return `CR이 부족합니다. (필요 ${ENCHANT_COST})`;
  state.money -= ENCHANT_COST;
  const old = state.enchants[name] || null, now = rollEnchant();
  state.enchants[name] = { ...now, n: (old ? old.n : 0) + 1 };
  syncMax(); save();
  return { old, now: state.enchants[name] };
}
/* 무기 강화: F랭에서 A랭까지. 단계마다 CR을 내고 도전하며, 실패하면 CR만 잃는다 (랭크는 내려가지 않는다) */
const reinforceLv = n => (state.reinforce && state.reinforce[n]) | 0;
const reinforceBonus = n => REINFORCE_BONUS[reinforceLv(n)] || 0;
function reinforceItem(name, rnd = Math.random) { // 성공 { ok, lv } / 실패 사유 문자열
  if (!ITEMS[name] || ITEMS[name].slot !== '무기' || !enchantables().includes(name)) return '강화할 수 없는 무기입니다.';
  const lv = reinforceLv(name);
  if (lv >= REINFORCE_RANKS.length - 1) return '이미 최고 랭크(A)입니다.';
  const cost = REINFORCE_COST[lv];
  if (state.money < cost) return `CR이 부족합니다. (필요 ${cost})`;
  state.money -= cost;
  const ok = rnd() < REINFORCE_RATE[lv];
  if (ok) state.reinforce[name] = lv + 1;
  save();
  return { ok, lv: ok ? lv + 1 : lv };
}
/* 장착 변경. 성공 true / 공간 부족 'space' / 실패 false */
function changeEquipment(slot, newName) {
  const cur = state.equipment[slot], list = state.inventory['장비'].slice();
  if (newName) {
    const i = list.findIndex(s => s.n === newName);
    if (i < 0) return false;
    list.splice(i, 1);
  }
  if (cur) list.push({ n: cur, q: 1 });
  const nextEq = { ...state.equipment, [slot]: newName }, cap = bagCapacityFor(nextEq);
  if (usedSlots({ ...state.inventory, '장비': list }) > cap) return 'space';
  state.equipment = nextEq;
  state.inventory['장비'] = list;
  syncMax();
  return true;
}

/* 사용할 수 없는 이유 (없으면 ''). 귀환 신호기는 진행 중인 행동이 없을 때만 */
function useErr(name) {
  const use = ITEMS[name].use;
  if (use && use.warp) {
    if (state.active || state.pending) return '진행 중이거나 결과 확인이 필요한 행동이 있어 쓸 수 없습니다.';
    if (state.location === '본부' && !state.dungeon) return '이미 본부에 있습니다.';
  }
  return '';
}
/* HP 손실 처리: 평소엔 HP 1까지만 닳는다(죽기 직전에 멈춘다). 이미 HP가 1인데 또 다치면 죽는다 */
function floorLoss(r) {
  const loss = -r.hp;
  if (loss > 0 && state.vitals.hp <= 1) r.death = true;
  r.hp = -Math.min(Math.max(0, loss), Math.max(0, state.vitals.hp - 1));
}
const REBIRTH_HP = 50, REBIRTH_SP = 30;
/* 사망 → 재탄생. 본부에서 일부 회복한 채 깨어나고, 구조비(보유 CR의 일부)를 낸다. 레벨·소지품은 그대로 */
function dieAndRebirth() {
  const lost = Math.min(COLLAPSE_LOSS_MAX, Math.floor(state.money * COLLAPSE_LOSS));
  state.money -= lost; state.dungeon = null; state.location = '본부';
  state.vitals.hp = REBIRTH_HP; state.vitals.sp = Math.max(state.vitals.sp, REBIRTH_SP);
  state.deaths = (state.deaths || 0) + 1;
  addBuff('부상'); save();
  return { lost };
}
/* ---------- 쓰러짐 / 구조: 죽지는 않는다. 위험할 때 HP 1로 남고, 더 못 움직이면 본부로 구조된다 ---------- */
const hasRestoreItem = () => ['소모품'].some(t => (state.inventory[t] || []).some(s => s.q > 0 && ITEMS[s.n].use && (ITEMS[s.n].use.sp || ITEMS[s.n].use.warp)));
function collapseReason() {
  if (state.active || state.pending || !state.vitals) return '';
  if (!state.dungeon && !LOCATIONS[state.location].danger) return '';
  const need = state.dungeon ? DUNGEON_STEP_SP : MOVE_SP_DANGER;
  return state.vitals.sp < need && !hasRestoreItem() ? 'sp' : '';
}
function collapseNow() {
  const why = collapseReason();
  if (!why) return null;
  const lost = Math.min(COLLAPSE_LOSS_MAX, Math.floor(state.money * COLLAPSE_LOSS));
  state.money -= lost; state.dungeon = null; state.location = '본부';
  state.vitals.sp = Math.max(state.vitals.sp, 10);
  addBuff('부상'); save();
  return { why, lost };
}
function useItem(name, n = 1) {
  const use = ITEMS[name].use, v = state.vitals;
  n = use && use.warp ? 1 : Math.min(intIn(n, 1, MAX_BATCH, 1), countItem(name));
  if (!use || useErr(name) || !n || !removeItem(name, n)) return false;
  if (use.warp) { state.dungeon = null; state.location = '본부'; discover('zones', '본부'); save(); return true; }
  const m = 1 + healBonus(name); // 서브잡 요리/약학 버프
  if (use.hp) v.hp = clamp(v.hp + Math.round(use.hp * m) * n, 0, v.hpMax);
  if (use.sp) v.sp = clamp(v.sp + Math.round(use.sp * m) * n, 0, v.spMax);
  return true;
}

/* ---------- 버프 / 스탯 ---------- */
const nowMs = () => Date.now();
const activeBuffs = () => state.buffs.filter(b => b.endAt > nowMs()).map(b => ({ ...BUFFS[b.id], id: b.id, endAt: b.endAt }));
function pruneBuffs() {
  const before = state.buffs.length;
  state.buffs = state.buffs.filter(b => b.endAt > nowMs());
  return state.buffs.length !== before;
}
function addBuff(id) {
  state.buffs = state.buffs.filter(b => b.id !== id);
  state.buffs.push({ id, endAt: nowMs() + BUFF_MS });
}

/* 장비 + 버프로 인한 스탯 보정 { str: n, ... } */
function statMods() {
  const m = {}, add = o => { for (const k in o) m[k] = (m[k] || 0) + o[k]; };
  Object.values(state.equipment).forEach(n => { if (!n) return; if (ITEMS[n].mods) add(ITEMS[n].mods); const e = state.enchants[n]; if (e && STAT_DEFS.some(d => d.key === e.k)) add({ [e.k]: e.v }); });
  ITEM_SETS.forEach(st => { if (st.need.every(n => Object.values(state.equipment).includes(n))) add(st.mods); });
  activeBuffs().forEach(b => add(b.mods));
  return m;
}
function totalStats() {
  const m = statMods(), t = {};
  STAT_DEFS.forEach(d => { t[d.key] = Math.max(0, state.stats[d.key] + (m[d.key] || 0)); });
  return t;
}
/* 스탯 -> 효과 수치(0.1 = 10%). 스탯당 1개, 모두 상한 50% */
function effects(t = totalStats()) {
  return { atk: Math.min(.5, t.str * .006), evade: Math.min(.5, t.agi * .005), ggreat: Math.min(.5, t.int * .006), rare: Math.min(.5, t.wil * .005), craftTime: Math.min(.5, t.sen * .006 + jobFx().craftTime), craftGreat: Math.min(.5, t.luk * .006) };
}
/* ---- 오늘의 날씨 (한국 시간 하루마다 바뀐다): 비·눈이 오는 날은 채집·채굴·낚시 재료 획득 확률 +, 그렇지 않은 날은 사냥 공격력 + ---- */
const WEATHERS = [
  { name: '맑음', icon: 'wb_sunny', wet: false, p: .4 }, { name: '흐림', icon: 'cloud', wet: false, p: .3 },
  { name: '비', icon: 'rainy', wet: true, p: .2 }, { name: '눈', icon: 'weather_snowy', wet: true, p: .1 }
];
const WEATHER_GATHER = .15, WEATHER_ATK = .1;
function todayWeather(now = nowMs()) {
  const day = Math.floor((now + 9 * 3600000) / 86400000), r = seededRng(day * 7919 + 17)(); let acc = 0, w = WEATHERS[0];
  for (const x of WEATHERS) { acc += x.p; if (r < acc) { w = x; break; } }
  return { ...w, desc: w.wet ? `${w.name} 오는 날: 채집·채굴·낚시로 재료를 얻을 확률 +${WEATHER_GATHER * 100}%p` : `${w.name}인 날: 사냥 공격력 +${WEATHER_ATK * 100}%` };
}
const weatherFx = () => { const w = todayWeather(); return { gather: w.wet ? WEATHER_GATHER : 0, atk: w.wet ? 0 : WEATHER_ATK }; };
const modText = mods => Object.entries(mods).map(([k, v]) => `${STAT_DEFS.find(d => d.key === k).name} ${v > 0 ? '+' : ''}${v}`);
const weaponAtk = () => { const w = state.equipment['무기']; return (w && ITEMS[w].atk) ? ITEMS[w].atk + reinforceBonus(w) : 0; };

function spendStatPoint(key) {
  if (state.statPoints < 1 || !(key in state.stats)) return false;
  state.stats[key]++; state.statPoints--;
  return true;
}

/* ---------- 경험치 / 레벨 ---------- */
/* 레벨 곡선: 갈수록 급격히 늘어 만렙(30)은 오래 걸린다. 표시는 3자리를 넘지 않게 999로 제한 */
const expMax = lv => Math.min(999, Math.round((50 + 4 * lv ** 1.85) * EXP_SLOW));
/* 레벨이 모자라 못 쓰는 기능이면 사유, 아니면 '' */
function levelGate(id) {
  const a = ACTIONS[id], lv = state.character.level;
  if (a && a.kind === 'subjob' && lv < SUBJOB_MIN_LV) return `서브잡은 Lv.${SUBJOB_MIN_LV}부터 가입할 수 있습니다. (지금 Lv.${lv})`;
  if (a && (a.kind === 'pet' || a.kind === 'tame') && lv < PET_MIN_LV) return `펫은 Lv.${PET_MIN_LV}부터 만날 수 있습니다. (지금 Lv.${lv})`;
  return '';
}
function gainExp(n) {
  const v = state.vitals, c = state.character;
  let ups = 0;
  if (c.level >= MAX_LEVEL) { v.exp = 0; return 0; }
  v.exp += n;
  while (c.level < MAX_LEVEL && v.exp >= expMax(c.level)) { v.exp -= expMax(c.level); c.level++; state.statPoints++; ups++; }
  if (c.level >= MAX_LEVEL) v.exp = 0;
  return ups;
}

/* ---------- 방치형 행동 ---------- */
const MIN_CYCLE = CYCLE_SEC[0], MAX_CYCLE = CYCLE_SEC[1];
const spOf = a => (a.cost ? a.cost.sp : 0);
/* 이동 기력. 지상이 끼면 더 든다 */
const moveCost = id => (LOCATIONS[id].danger || LOCATIONS[state.location].danger) ? MOVE_SP_DANGER : MOVE_SP_SAFE;

/* 확인 화면용 예상 { time, gain, cost } 문장. mi = MULTI_OPTIONS 인덱스 */
/* 전투 확률 추정: 같은 몬스터와 100번 싸워 본 결과 (승리 %, 다치는 %) */
function battleOdds(m) {
  let win = 0, hurt = 0; const N = 120, hp0 = Math.max(2, state.vitals.hp);
  for (let i = 0; i < N; i++) { const b = simulateBattle(m, hp0); if (b.win) win++; if (b.lost > 0) hurt++; }
  return { win: Math.min(99, Math.round(win / N * 100)), hurt: Math.round(hurt / N * 100) };
}
const BATTLE_MAX_WIN_MISS = .01; // 아무리 쉬운 상대여도 승리 확률은 최대 99%
/* 새로 열린 콘텐츠 알림: 승급 시험을 받을 수 있게 되거나 레벨로 열리는 콘텐츠가 열리면 한 번만 알려 준다. [문구, ...] */
const LEVEL_CONST = { SUBJOB_MIN_LV: () => SUBJOB_MIN_LV, PET_MIN_LV: () => PET_MIN_LV };
function newUnlocks() {
  if (!state.created) return [];
  const out = [], lv = state.character.level, seen = state.unlockSeen;
  const q = nextPromo();
  if (q && lv >= q.lv && !state.questTaken[q.id] && !seen['promo:' + q.promo]) { seen['promo:' + q.promo] = true; out.push(`${q.promo}등급 승급 시험을 받을 수 있어요! 본부에서 승급을 선택해 보세요.`); }
  for (const [key, c, text] of LEVEL_UNLOCK_NOTES) { const need = LEVEL_CONST[c](); if (lv >= need && !seen['lv:' + key]) { seen['lv:' + key] = true; out.push(`Lv.${need} 달성: ${text}`); } }
  if (out.length) save();
  return out;
}
const PROFILE_EDIT_COOL_MS = 24 * 3600 * 1000;
const profileLockLeft = () => Math.max(0, state.profileEditAt + PROFILE_EDIT_COOL_MS - nowMs()); // 남은 잠금 시간(ms), 0이면 수정 가능
const fmtDur = sec => { sec = Math.round(sec); const m = Math.floor(sec / 60), r = sec % 60; return m ? (r ? `${m}분 ${r}초` : `${m}분`) : `${r}초`; };
const fmtLong = ms => { const m = Math.ceil(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`; };
const pct = x => `${Math.round(x * 1000) / 10}%`;
/* ---- 전투 난이도: 입구에서 멀어질수록 몬스터가 강해진다 ---- */
const _distCache = {};
function entranceDist(z) { // 입구(S)에서 각 칸까지 걸어서 몇 칸인지 (한 번만 계산)
  if (_distCache[z.id]) return _distCache[z.id];
  const d = {}, q = []; let max = 1;
  z.map.forEach((row, y) => [...row].forEach((c, x) => { if (c === 'S' && !q.length) { d[`${x},${y}`] = 0; q.push([x, y]); } }));
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, c = tileOf(z, nx, ny), k = `${nx},${ny}`;
      if (!c || c === '#' || c === '.' || k in d) continue;
      d[k] = d[`${x},${y}`] + 1; max = Math.max(max, d[k]); q.push([nx, ny]);
    }
  }
  return (_distCache[z.id] = { d, max });
}
const tileDifficulty = (z, x, y) => { const e = entranceDist(z), n = e.d[`${x},${y}`]; return n === undefined ? .5 : clamp(n / e.max, 0, 1); }; // 0(입구)~1(가장 먼 곳)
const curDifficulty = () => state.dungeon ? tileDifficulty(zoneOf(state.dungeon.zone), state.dungeon.x, state.dungeon.y) : 0;
/* 같은 몬스터도 입구 근처는 약하고(체력 ×0.7) 가장 먼 곳은 아주 강하다(체력 ×17). 1렙은 입구 근처에서, 고레벨은 깊은 곳에서 겨룰 만하다 */
function scaleMonster(m, d) {
  const k = .7 + 16.3 * Math.pow(d, 2.3);
  return { ...m, hp: Math.round(m.hp * k), atk: Math.max(1, Math.round(m.atk * (1 + .8 * d))), exp: Math.round(m.exp * (1 + d)), cr: Math.round(m.cr * (1 + d)), hit: 1 + 2 * d, diff: d };
}
const monsterBase = a => a.monster || a.terrain.monster;
const monsterOf = (a, d) => scaleMonster(monsterBase(a), d === undefined ? curDifficulty() : d);
function actionPreview(id, mi = 0) {
  const a = ACTIONS[id], fx = effects(), sp = spOf(a), opt = MULTI_OPTIONS[mi] || MULTI_OPTIONS[0];
  const multi = (a.kind === 'gather' || a.kind === 'battle') && opt.sec > 0;
  const cMin = multi ? Math.floor(opt.sec / (a.kind === 'gather' ? GATHER_SEC : MAX_CYCLE)) : 1, cMax = multi ? Math.floor(opt.sec / (a.kind === 'gather' ? GATHER_SEC : MIN_CYCLE)) : 1;
  const rng = (lo, hi, f = x => x) => lo === hi ? `${f(lo)}` : `${f(lo)}~${f(hi)}`;
  const costs = [], per = multi ? ` (${rng(cMin, cMax)}회 반복)` : '';
  const n0 = repeatCount(id), note = (a.kind === 'gather' || a.kind === 'battle') ? (n0 >= REPEAT_FREE ? `이 장소에서 이 행동을 ${n0}번 했습니다. 지금은 아이템 획득 확률이 ${Math.round(repeatChance(n0 + 1) * 100)}%로 떨어져 있어요. (12시간 뒤 초기화)` : `이 장소에서 같은 행동 ${n0}회 (${REPEAT_FREE + 1}번째부터 아이템 획득 확률 저하 · 12시간 뒤 초기화)`) : '';
  if (a.kind === 'gather' || a.kind === 'battle') {
    const time = multi ? `${opt.label}${per}` : a.kind === 'gather' ? '5분' : '6분';
    costs.push(`기력 -${rng(sp * cMin, sp * cMax)}`);
    if (state.vitals.hp <= 1) costs.push('⚠ HP가 1이라 다치면 죽습니다');
    if (a.kind === 'gather') {
      const h = a.hazard;
      costs.push(`${h.text} 사고 시 HP -${h.hp[0]}~${h.hp[1]} (회당 ${Math.round(h.chance * 100)}%)`);
      const find = Math.min(1, GATHER_FIND + weatherFx().gather) * repeatChance(n0 + 1);
      const odds = `재료 획득 ${pct(find)} (빈손 ${pct(1 - find)}) · 대성공(2배) ${pct(fx.ggreat)}${a.rare ? ` · 희귀 ${a.rare} ${pct(.05 + fx.rare)}` : ''} · 사고로 다칠 확률 ${pct(h.chance)} (안 다칠 확률 ${pct(1 - h.chance)})`;
      return { time, gain: `${a.items.join(' / ')} 회당 1~3개 · EXP +6/회 (총 ${rng(cMin * 6, cMax * 6)})`, cost: costs.join(' · '), note, odds };
    }
    const m = monsterOf(a);
    costs.push('전투 피해로 HP 감소', '패배 시 부상(민첩 -2)', `HP ${HP_RETREAT} 이하가 되면 중단`);
    const bo = battleOdds(m), rep = repeatChance(n0 + 1);
    const odds = `승리 약 ${bo.win}% · 다칠 확률 약 ${bo.hurt}% (1회 최대 HP -${m.hpCap || BATTLE_HP_CAP}) · 재료 ${pct(BATTLE_MAT * rep)} · ${m.drops.map(([n, p]) => `${n} ${pct(p * rep)}`).join(' · ')}`;
    return { time, gain: `승리 시 EXP +${m.exp} · CR +${m.cr} · 재료 (회당)`, cost: costs.join(' · '), note, odds };
  }
  if (a.kind === 'tame') return { time: '10분', gain: `성공하면 펫을 얻음 (성공 확률 약 ${Math.round(tameChance() * 100)}% · 감각이 높을수록 유리) · EXP +12`, cost: `기력 -${sp} · 먹이 1개(작물/펫 사료) 소모 · 실패하면 HP 손실 가능` };
  if (a.kind === 'train') { const n = learnableRecipes().length; return { time: '1시간', gain: `새 제작 레시피 1종을 무작위로 습득 · EXP +${TRAIN_EXP}`, cost: `기력 -${sp}`, note: n ? `지금 배울 수 있는 레시피 ${n}종 (승급하면 후보가 늘어납니다)` : '지금은 더 배울 수 있는 레시피가 없습니다.' }; }
  if (a.kind === 'rest') return { time: a.sec >= 3600 ? `${a.sec / 3600}시간` : a.sec >= 120 ? `${a.sec / 60}분` : '1분', gain: a.full ? 'HP · 기력 완전 회복 · 충분한 휴식(의지 +2, 5분)' : `HP +30 · 기력 +${a.restSp ?? REST_SP} · 충분한 휴식(의지 +2, 5분)`, cost: '없음' };
  if (a.kind === 'travel') return { time: LOCATIONS[a.to].danger ? `${ZONE_TRIP_SEC / 60}분` : '즉시', gain: `이동 후 그 구역의 선택지를 이용할 수 있음${ZONE_MIN_RANK[a.to] ? ` (${ZONE_MIN_RANK[a.to]}등급 이상)` : ''}`, cost: moveCost(a.to) ? `기력 -${moveCost(a.to)}` : '기력 소모 없음' };
  if (a.kind === 'enter') return { time: '즉시', gain: '타일 지도 탐색 시작 (타일 1칸 이동 = 3분 · 기력 1)', cost: '없음' };
  if (a.kind === 'leave') return { time: '즉시', gain: '구역 지도로 돌아감', cost: '없음' };
  if (a.kind === 'gamble') { const g = GAMBLES[id]; return { time: '즉시', gain: `성공(${pct(GAMBLE_WIN)}): ${[g.good.money ? `CR +${g.good.money}` : '', ...(g.good.items || []).map(([n, q]) => `${n} ×${q}`), g.good.exp ? `EXP +${g.good.exp}` : '', g.good.hp ? `HP +${g.good.hp}` : '', g.good.buff || ''].filter(Boolean).join(' · ')}`, cost: `기력 -${sp} · 실패(${pct(1 - GAMBLE_WIN)}): ${[g.bad.money ? `CR ${g.bad.money}` : '', g.bad.hp ? `HP ${g.bad.hp}` : '', g.bad.buff || ''].filter(Boolean).join(' · ')} (1시간에 한 번)` }; }
  if (a.kind === 'investigate') return { time: '즉시', gain: `이 지형의 정보 확인 · 무작위 아이템 발견 가능 · 도감 등록`, cost: `기력 -${sp} (이 칸은 12시간에 한 번)`, odds: `재료 발견 ${pct(INVEST_ITEM)} · 희귀 ${pct(.05 + effects().rare)} · 함정으로 다칠 확률 ${pct(INVEST_HURT)}` };
  return { time: '-', gain: '없음', cost: '없음' };
}

/* 이 칸에서 막힌 행동인가 (이미 조사한 칸 등) */
const INVEST_RESET_MS = 12 * 3600 * 1000;
const tileKey = d => `${d.zone},${d.x},${d.y}`;
/* 막힌 행동이면 다시 할 수 있을 때까지 남은 ms(양수), 아니면 0. 조사는 한 번 하면 12시간 뒤에 다시 할 수 있다 */
function actionBlocked(id) {
  const a = ACTIONS[id], d = state.dungeon;
  if (a.kind === 'gamble') { const at = state.gambleAt[id]; return at && at + GAMBLE_COOL_MS > nowMs() ? at + GAMBLE_COOL_MS - nowMs() : 0; }
  if (a.kind !== 'investigate' || !d) return 0;
  const at = state.invAt[tileKey(d)];
  return at && at + INVEST_RESET_MS > nowMs() ? at + INVEST_RESET_MS - nowMs() : 0;
}
/* 같은 행동의 반복 횟수(12시간이 지나면 0으로 돌아간다)와 그 다음 회차의 아이템 획득 확률 */
const repKey = id => state.dungeon ? `${id}@${tileKey(state.dungeon)}` : id; // 같은 장소에서 같은 행동일 때만 누적
function repeatCount(id) { const r = state.repeats[repKey(id)]; return r && r.at + REPEAT_RESET_SEC * 1000 > nowMs() ? r.n : 0; }
const repeatChance = nth => nth <= REPEAT_FREE ? 1 : Math.max(.2, 1 - .2 * (nth - REPEAT_FREE));
function noteRepeat(id, n) {
  const k = repKey(id), r = state.repeats[k];
  for (const q in state.repeats) if (state.repeats[q].at + REPEAT_RESET_SEC * 1000 <= nowMs()) delete state.repeats[q]; // 만료된 장소 기록 정리
  state.repeats[k] = r && r.at + REPEAT_RESET_SEC * 1000 > nowMs() ? { n: r.n + n, at: r.at } : { n, at: nowMs() };
}
/* 칸마다 나타나는 채집 행동: 이 칸의 지형이 주는 재료 중 0~2개가 무작위(입장할 때마다 다르게). 같은 칸은 같은 결과 */
function seededRng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/* 칸마다 나타나는 몬스터: 이 지형의 몬스터 중 하나 (같은 칸은 같은 결과) */
function tileBattleId(z, t, x, y, seed) { const r = seededRng((seed || 1) * 17 + x * 6151 + y * 92821 + z.n * 7919); return t.battleIds[Math.floor(r() * t.battleIds.length)]; }
function tileGatherIds(z, x, y, seed) {
  const t = z.terrains[terrainIndex(tileOf(z, x, y))];
  if (!t) return [];
  const rnd = seededRng((seed || 1) * 31 + x * 7919 + y * 104729 + z.n * 15485863), roll = rnd();
  const want = GATHER_COUNT_ODDS.find(([p]) => roll < p)[1], pool = [...t.gather];
  for (let i = pool.length - 1; i > 0; i--) { const k = Math.floor(rnd() * (i + 1)); [pool[i], pool[k]] = [pool[k], pool[i]]; }
  return pool.slice(0, Math.min(want, pool.length)).map(n => t.gatherIds[n]);
}

/* 시작할 수 있으면 null, 없으면 사유 문자열 */
function startAction(id, mi = 0) {
  const a = ACTIONS[id];
  if (a.kind === 'todo') return '아직 구현되지 않은 기능입니다.';
  if (!['gather', 'battle', 'rest', 'investigate', 'gamble', 'tame', 'train'].includes(a.kind)) return '시작할 수 없는 행동입니다.';
  if (!state.created) return '먼저 캐릭터를 만드세요.';
  if (state.active || state.pending) return '이미 진행 중이거나 결과 확인이 필요한 행동이 있습니다.';
  const lg = levelGate(id);
  if (lg) return lg;
  if (a.kind === 'train' && !learnableRecipes().length) return RECIPES.some(rc => !recipeKnown(rc)) ? '지금 등급에서 더 배울 수 있는 레시피가 없습니다. 승급하면 새 레시피를 배울 수 있어요.' : '배울 수 있는 레시피를 모두 익혔습니다.';
  if (actionBlocked(id)) return a.kind === 'gamble' ? `방금 한 판을 했습니다. ${fmtDur(actionBlocked(id))} 뒤에 다시 할 수 있어요.` : '이 칸은 조금 전에 조사했습니다. 12시간 뒤에 다시 할 수 있습니다.';
  if (a.kind === 'battle' && state.vitals.hp <= HP_RETREAT) return `HP가 부족합니다. (${HP_RETREAT} 초과 필요) 쉬거나 응급 키트를 사용하세요.`;
  const t = nowMs(), v = state.vitals, cost = spOf(a);
  if (a.kind === 'investigate') {
    if (v.sp < cost) return `기력이 부족합니다. (필요 ${cost})`;
    v.sp -= cost;
    const d = state.dungeon;
    state.invAt[tileKey(d)] = t;
    state.pending = { id, result: investigate(a) };
    save();
    return null;
  }
  if (a.kind === 'gamble') {
    if (v.sp < cost) return `기력이 부족합니다. (필요 ${cost})`;
    if (state.money < a.stake) return `판돈이 부족합니다. (CR ${a.stake} 필요)`;
    v.sp -= cost; state.gambleAt[id] = t;
    const g = GAMBLES[id], win = Math.random() < GAMBLE_WIN, o = win ? g.good : g.bad;
    const r = { text: (win ? '【성공】 ' : '【실패】 ') + o.text, items: (o.items || []).map(([n, q]) => [n, q]), exp: o.exp || (win ? 4 : 2), money: o.money || 0, hp: o.hp || 0, sp: 0, spCost: cost, buff: o.buff || null, gamble: win ? 'win' : 'lose' };
    if (r.money < 0) r.money = -Math.min(-r.money, state.money);
    state.pending = { id, result: r };
    save();
    return null;
  }
  let bait = null;
  if (a.kind === 'tame') {
    const sp = PET_SPECIES[a.terrain.monster.name];
    if (state.pets.some(p => p.id === a.terrain.monster.name)) return '이미 길들인 종입니다.';
    bait = baitItems()[0];
    if (!bait) return '먹이가 될 작물이나 펫 사료가 필요합니다. 농장에서 키워 보세요.';
    if (v.sp < cost) return `기력이 부족합니다. (필요 ${cost})`;
  }
  const multi = (a.kind === 'gather' || a.kind === 'battle') && MULTI_OPTIONS[mi].sec > 0;
  const cycleSec = a.kind === 'rest' || a.kind === 'train' ? a.sec : a.kind === 'tame' ? TAME_SEC : a.kind === 'gather' ? GATHER_SEC : rand(MIN_CYCLE, MAX_CYCLE);
  const cycles = multi ? Math.max(1, Math.floor(MULTI_OPTIONS[mi].sec / cycleSec)) : 1;
  const total = multi ? MULTI_OPTIONS[mi].sec : cycleSec, spCost = cost * cycles;
  if (v.sp < spCost) return `기력이 부족합니다. (필요 ${spCost}) 식량을 먹거나 휴식하세요.`;
  v.sp -= spCost;
  if (bait) removeItem(bait);
  state.active = { id, startAt: t, endAt: t + total * 1000, cycles, cycleSec, spCost, ...(bait ? { bait } : {}), ...(a.kind === 'battle' ? { seed: 1 + Math.floor(Math.random() * 2147483000), hp0: v.hp, bs: battleSnap(), d: curDifficulty() } : {}) };
  save();
  return null;
}
/* 이동장치 → 위험구역: 1분이 걸린다. 도착하면 그 구역 미궁 입구에 들어선다. 성공 null / 실패 사유 */
function startTrip(zoneId) {
  if (!state.created) return '먼저 캐릭터를 만드세요.';
  if (!LOCATIONS[zoneId] || !LOCATIONS[zoneId].danger || state.location !== '이동장치' || state.dungeon) return '지금은 이동할 수 없습니다.';
  const need = ZONE_MIN_RANK[zoneId];
  if (need && RANK_ORDER.indexOf(state.character.rank) < RANK_ORDER.indexOf(need)) return `${need}등급 이상만 내려갈 수 있는 구역입니다. (지금 ${state.character.rank}등급)`;
  if (state.active || state.pending) return '진행 중이거나 결과 확인이 필요한 행동이 있어 이동할 수 없습니다.';
  const c = moveCost(zoneId);
  if (state.vitals.sp < c) return `기력이 부족해 이동할 수 없습니다. (필요 ${c})`;
  state.vitals.sp -= c;
  const t = nowMs();
  state.active = { id: '구역 이동', to: zoneId, startAt: t, endAt: t + ZONE_TRIP_SEC * 1000, cycles: 1, cycleSec: ZONE_TRIP_SEC, spCost: c };
  save();
  return null;
}
function abortAction() { // 중단하면 소모한 기력을 돌려받는다 (타일 이동은 이미 지나온 칸까지 가고 나머지만 환불)
  const v = state.vitals, a = state.active;
  let refund = a.spCost || 0;
  if (a.id === '타일 이동') {
    const el = (nowMs() - a.startAt) / 1000, cum = a.cum || a.path.map((_, i) => a.cycleSec / a.path.length * (i + 1));
    const done = clamp(cum.filter(c => c <= el).length, 0, a.path.length - 1);
    applyMove(a.path, done); refund = (a.path.length - done) * DUNGEON_STEP_SP;
  }
  v.sp = Math.min(v.spMax, v.sp + refund);
  if (a.bait && ITEMS[a.bait]) addItem(a.bait); // 길들이기를 중단하면 먹이도 돌려받는다
  state.active = null; save();
}

/* 지도 이동(구역 사이): 시간은 걸리지 않고 기력만 든다. { err } / { moved } */
function travelTo(id) {
  if (id === state.location) return { moved: true };
  if (state.dungeon) return { err: '미궁 안에서는 구역을 이동할 수 없습니다. 입구에서 퇴장하세요.' };
  if (state.active || state.pending) return { err: '진행 중이거나 결과 확인이 필요한 행동이 있어 이동할 수 없습니다.' };
  const c = moveCost(id);
  if (state.vitals.sp < c) return { err: `기력이 부족해 이동할 수 없습니다. (필요 ${c})` };
  state.vitals.sp -= c;
  state.location = id;
  discover('zones', id);
  save();
  return { moved: true };
}

/* ---------- 전투 묘사 ----------
   진행 중 묘사는 실제 결과와 같은 시드 계산에서 나온다. 모의 전투는 별도의 구경용 계산이다. */
const BATTLE_LOG_SEC = 60; // 진행 중인 전투·이동은 1분에 한 줄씩 묘사가 나온다
const BATTLE_LOG_SHOW = 5;
const STAT_STYLE = { str: '근력', int: '지능', agi: '민첩', wil: '의지', sen: '감각', luk: '행운' };
function topCombatStat(t = totalStats()) { // 가장 높은 능력치 (5 이상일 때만 전투 스타일에 반영)
  let best = null; for (const k of Object.keys(STAT_STYLE)) if (t[k] >= 5 && (!best || t[k] > t[best])) best = k;
  return best;
}
const HIT_STYLE = {
  str: (m, d) => `근력을 실어 ${m}을(를) 힘껏 내리쳤다. (-${d})`,
  int: (m, d) => `${m}의 움직임을 읽고 허점을 파고드는 전략으로 맞섰다. (-${d})`,
  agi: (m, d) => `빠른 발놀림으로 ${m}의 뒤를 잡아 일격을 넣었다. (-${d})`,
  wil: (m, d) => `물러서지 않는 의지로 버티며 ${m}에게 일격을 꽂았다. (-${d})`,
  sen: (m, d) => `${m}의 급소를 감각으로 짚어 정확히 찔렀다. (-${d})`,
  luk: (m, d) => `운 좋게 ${m}의 빈틈이 열려 일격을 넣었다. (-${d})`
};
const DODGE_STYLE = {
  agi: m => `민첩하게 몸을 비틀어 ${m}의 공격을 가볍게 흘렸다.`,
  int: m => `${m}의 공격 궤적을 미리 계산해 비켜섰다.`,
  sen: m => `${m}의 기척을 먼저 느끼고 한 발 물러섰다.`,
  luk: m => `${m}의 공격이 아슬아슬하게 빗나갔다. 운이 좋았다!`
};
/* 한 줄 묘사. r()는 0~1 난수. 돌려주는 값: { text, kind: 'hit'|'hurt'|'dodge'|'note', dealt, taken } */
function battleLine(m, r, ctx = {}) {
  const t = ctx.stats || totalStats(), fx = ctx.fx || effects(), dmg = (3 + weaponAtk()) * (1 + fx.atk), jit = () => .85 + r() * .3, top = topCombatStat(t);
  const roll = r(), name = m.name;
  if (roll < .42) { // 내가 때렸다
    const crit = r() < .1, d = Math.max(1, Math.round(dmg * jit() * (crit ? 2 : 1)));
    if (top && HIT_STYLE[top] && r() < .55) return { text: (crit ? '치명타! ' : '') + HIT_STYLE[top](name, d), kind: 'hit', dealt: d, taken: 0 };
    const gen = [`${name}에게 일격을 가했다. (-${d})`, `${name}의 옆구리를 베어 냈다. (-${d})`, `재빠르게 파고들어 ${name}을(를) 때렸다. (-${d})`, `${name}이(가) 주춤할 만큼 강하게 쳤다. (-${d})`];
    return { text: (crit ? '치명타! ' : '') + gen[Math.floor(r() * gen.length)], kind: 'hit', dealt: d, taken: 0 };
  }
  if (roll < .62) { // 맞았다
    const d = Math.max(1, Math.round(m.atk * jit() * (1 - fx.evade)));
    const gen = [`${name}의 반격에 스쳤다. (피해 ${d})`, `${name}의 공격을 막지 못하고 맞았다. (피해 ${d})`, `${name}에게 밀려 자세가 흐트러졌다. (피해 ${d})`];
    return { text: gen[Math.floor(r() * gen.length)], kind: 'hurt', dealt: 0, taken: d };
  }
  if (roll < .84) { // 피했다
    if (top && DODGE_STYLE[top] && r() < .6) return { text: DODGE_STYLE[top](name), kind: 'dodge', dealt: 0, taken: 0 };
    const gen = [`${name}의 공격을 가까스로 피했다.`, `${name}이(가) 휘두른 공격이 허공을 갈랐다.`, `뒤로 물러나 ${name}과(와) 거리를 벌렸다.`];
    return { text: gen[Math.floor(r() * gen.length)], kind: 'dodge', dealt: 0, taken: 0 };
  }
  const gen = [`${name}이(가) 거칠게 숨을 몰아쉰다.`, `${name}과(와) 서로 틈을 노리며 맴돈다.`, `${name}의 움직임이 조금 둔해진 것 같다.`, `숨을 고르며 다음 기회를 엿본다.`];
  return { text: gen[Math.floor(r() * gen.length)], kind: 'note', dealt: 0, taken: 0 };
}
/* 진행 중인 전투의 묘사: 시작할 때 정한 시드(act.seed)로 실제 결과와 똑같은 전투를 다시 계산해서 1분 단위로 풀어 쓴다.
   그래서 묘사에서 몰아붙이던 쪽이 결과에서도 이기고, 밀리던 쪽은 후퇴한다. 시간 기준이라 창을 닫았다 열어도 같다 */
const rngFor = (act, i) => seededRng(((act.seed || 1) * 977 + i * 7919 + 13) >>> 0);
function battleRuns(act, a) { // [{win, rounds, lost, rs}] 회차별 전투 (resolveAction과 같은 계산)
  const m = scaleMonster(monsterBase(a), act.d || 0), runs = []; let lost = 0;
  const hp0 = Number.isFinite(act.hp0) ? act.hp0 : state.vitals.hp;
  for (let i = 0; i < act.cycles; i++) {
    if (i > 0 && hp0 - lost <= HP_RETREAT) break;
    const b = simulateBattle(m, Math.max(1, hp0 - lost), rngFor(act, i), act.bs || battleSnap());
    runs.push(b); lost += b.lost;
    if (!b.win) break;
  }
  return { m, runs };
}
const pickR = (r, arr) => arr[Math.floor(r() * arr.length)];
/* 착용 장비에 반응하는 묘사 한 줄 (없으면 ''). kind: 't' 이동 / 'b' 전투 */
function equipLine(kind, r) {
  const worn = Object.values(state.equipment).filter(Boolean), pool = [];
  worn.forEach(n => { const e = EQUIP_LINES[n]; if (e && e[kind] && e[kind].length) pool.push(e[kind]); });
  Object.values(EQUIP_SET_LINES).forEach(st => { if (st.need.every(n => worn.includes(n)) && st[kind].length) { pool.push(st[kind]); pool.push(st[kind]); } });
  if (!pool.length) return '';
  return pickR(r, pickR(r, pool));
}
const FOE_STATE = [
  [.75, m => [`${m}은(는) 아직 쌩쌩해 보인다.`, `${m}의 기세가 여전히 사납다.`, `${m}은(는) 물러설 기색이 없다.`]],
  [.5, m => [`${m}이(가) 숨을 거칠게 몰아쉰다.`, `${m}의 움직임이 조금 둔해졌다.`, `${m}의 몸 곳곳에 상처가 늘어간다.`]],
  [.25, m => [`${m}이(가) 비틀거리기 시작했다.`, `${m}의 공격이 눈에 띄게 흐트러졌다.`, `${m}은(는) 뒷걸음질 치며 경계한다.`]],
  [0, m => [`${m}은(는) 금방이라도 쓰러질 듯하다.`, `${m}이(가) 마지막 힘을 쥐어짜 버틴다.`, `${m}의 눈빛에서 기세가 사라져 간다.`]]
];
const OPENERS = {
  near: m => [`${m}와(과) 마주쳤다. 전투 시작!`, `풀숲에서 ${m}이(가) 튀어나왔다!`, `${m}이(가) 길목을 가로막았다. 검을 고쳐 쥔다.`],
  mid: m => [`${m}이(가) 낮게 으르렁거리며 다가온다. 만만치 않아 보인다.`, `${m}의 기척이 심상치 않다. 신중하게 거리를 잰다.`],
  far: m => [`압도적인 기운의 ${m}와(과) 마주쳤다! 숨이 막힌다.`, `이 깊은 곳의 ${m}은(는) 눈빛부터 다르다. 각오를 다진다.`]
};
const ATK_ONE = [(m, d) => `${m}에게 일격을 가했다. (-${d})`, (m, d) => `틈을 노려 ${m}의 옆구리를 베었다. (-${d})`, (m, d) => `${m}이(가) 주춤할 만큼 강하게 쳤다. (-${d})`, (m, d) => `재빠르게 파고들어 ${m}을(를) 때렸다. (-${d})`];
const ATK_MANY = [(m, d) => `연이은 공격으로 ${m}을(를) 몰아붙였다. (-${d})`, (m, d) => `숨 돌릴 틈 없이 ${m}을(를) 두들겼다. (-${d})`, (m, d) => `흐름을 타고 ${m}에게 공격을 쏟아부었다. (-${d})`];
const ATK_NONE = [m => `기회를 놓쳤다. ${m}이(가) 날쌔게 빠져나갔다.`, m => `${m}의 몸에 닿기 직전 공격이 빗나갔다.`, m => `공격이 허공을 갈랐다. ${m}은(는) 무사하다.`, m => `${m}이(가) 몸을 틀어 공격을 피했다.`, m => `칼끝이 ${m}의 털끝만 스치고 지나갔다.`];
const HURT_LINE = [(m, d) => `${m}의 돌진에 정면으로 부딪혔다. (피해 ${d})`, (m, d) => `${m}이(가) 파고든 틈에 옆구리를 내주었다. (피해 ${d})`, (m, d) => `${m}의 반격에 맞았다. (피해 ${d})`, (m, d) => `${m}에게 밀려 자세가 흐트러졌다. (피해 ${d})`, (m, d) => `${m}의 공격을 막지 못했다. (피해 ${d})`];
const GLANCE_LINE = [m => `${m}의 공격에 크게 휘청였지만 이를 악물고 버텼다.`, m => `${m}에게 한 방 맞았지만 아슬아슬하게 견뎌 냈다.`];
const DODGE_LINE = [m => `${m}이(가) 달려드는 순간 옆으로 굴러 피했다.`, m => `${m}의 이빨이 소매를 스치고 지나갔다.`, m => `${m}의 공격을 가까스로 피했다.`, m => `뒤로 물러나 ${m}과(와) 거리를 벌렸다.`, m => `${m}이(가) 휘두른 발톱이 허공을 갈랐다.`];
const QUIET = [m => `${m}의 발톱이 땅을 긁는 소리가 날카롭게 울렸다.`, m => `잠시 정적이 흐르고, ${m}과(와) 시선이 얽혔다.`, m => `${m}이(가) 몸을 낮추고 도약할 기회를 노린다.`, m => `${m}과(와) 서로 틈을 노리며 맴돈다.`, m => `숨을 고르며 ${m}의 움직임을 살폈다.`, m => `${m}의 눈치를 보며 천천히 거리를 좁혔다.`];
function battleSlotLine(m, runs, ci, slot, act) { // 회차 ci 의 slot(0~5)번째 1분 묘사
  const b = runs[ci], n = b.rs.length, r = rngFor(act, 1000 + ci * 10 + slot), nm = m.name, top = act.bs && act.bs.top || null;
  const from = Math.floor(slot * n / 6), to = Math.floor((slot + 1) * n / 6), rs = b.rs.slice(from, to), parts = [];
  const dealt = rs.reduce((s, x) => s + x.dealt, 0), crit = rs.some(x => x.crit), hurt = rs.reduce((s, x) => s + x.hurt, 0), dodges = rs.filter(x => x.dodge).length, glance = rs.some(x => x.glance);
  if (!rs.length) parts.push(pickR(r, QUIET)(nm));
  else {
    if (dealt > 0) {
      if (top && HIT_STYLE[top] && r() < .5) parts.push((crit ? '치명타! ' : '') + HIT_STYLE[top](nm, dealt));
      else parts.push((crit ? '치명타! ' : '') + pickR(r, rs.filter(x => x.dealt).length > 1 ? ATK_MANY : ATK_ONE)(nm, dealt));
    } else parts.push(pickR(r, ATK_NONE)(nm));
    if (hurt > 0) parts.push(pickR(r, HURT_LINE)(nm, hurt));
    else if (glance) parts.push(pickR(r, GLANCE_LINE)(nm));
    else if (dodges > 0) parts.push(top && DODGE_STYLE[top] && r() < .6 ? DODGE_STYLE[top](nm) : pickR(r, DODGE_LINE)(nm));
    const pct = (rs[rs.length - 1].mhp) / (b.mhp0 || m.hp);
    if (b.rs[to - 1] && pct > 0) { const st = FOE_STATE.find(([lim]) => pct > lim) || FOE_STATE[3]; parts.push(pickR(r, st[1](nm))); }
  }
  { const re = seededRng((act.seed || 1) * 31 + ci * 97 + slot * 13 + 7), ln = re() < .22 && slot > 0 && slot < 5 ? equipLine('b', re) : ''; if (ln) parts.push(ln); }
  let kind = hurt > 0 || glance ? 'hurt' : dealt > 0 ? 'hit' : dodges ? 'dodge' : 'note';
  if (slot === 5) {
    const last = b.rs[n - 1], dead = last && last.mhp <= 0;
    if (b.win) { parts.push(`${nm}을(를) 쓰러뜨렸다!`); kind = 'hit'; }
    else if (dead) { parts.push('숨통을 끊으려던 순간, 마지막 일격이 빗나가 놓치고 말았다…'); kind = 'hurt'; }
    else { parts.push(`더는 버틸 수 없어 ${nm}에게서 물러났다…`); kind = 'hurt'; }
  }
  return { text: parts.join(' '), kind };
}
function battleLogFor(act, now = nowMs()) {
  const a = ACTIONS[act.id]; if (!a || a.kind !== 'battle') return [];
  const { m, runs } = battleRuns(act, a), n = Math.floor(Math.max(0, now - act.startAt) / 1000 / BATTLE_LOG_SEC), out = [], d = act.d || 0;
  const ro = seededRng((act.seed || 1) + 5);
  out.push({ text: pickR(ro, d < .34 ? OPENERS.near(m.name) : d < .67 ? OPENERS.mid(m.name) : OPENERS.far(m.name)), kind: 'note' });
  const per = Math.max(1, Math.round((act.cycleSec || 360) / BATTLE_LOG_SEC));
  for (let k = Math.max(1, n - 40); k <= n; k++) {
    const ci = Math.floor((k - 1) / per), slot = (k - 1) % per;
    if (ci >= act.cycles) break;
    if (runs[ci]) out.push(battleSlotLine(m, runs, ci, Math.min(5, Math.floor(slot * 6 / per)), act));
    else out.push({ text: '전투를 마치고 숨을 돌리며 돌아가는 길이다.', kind: 'note' });
  }
  return out;
}
/* 이동 중 묘사: 1분에 한 줄. 지나는 칸의 지형 이름과 능력치 스타일을 섞어 쉽게 질리지 않게 한다. 이동이 끝나면 사라진다 */
const TRAVEL_STYLE = {
  str: ['길을 막은 바위를 힘으로 밀어내고 지나갔다.', '무거운 짐을 고쳐 메고 성큼성큼 걸었다.', '쓰러진 나무줄기를 번쩍 들어 옆으로 치웠다.'],
  int: ['지형을 살피며 가장 안전한 길을 계산해 걸었다.', '주변 지형을 머릿속에 그리며 지름길을 찾아냈다.', '발자국의 방향을 읽고 위험한 쪽을 피해 갔다.'],
  agi: ['가벼운 걸음으로 장애물을 훌쩍 넘었다.', '바람처럼 빠르게 거친 길을 가로질렀다.', '발끝으로 바위를 짚으며 경쾌하게 건너뛰었다.'],
  wil: ['지친 몸을 의지로 일으켜 계속 걸었다.', '흔들리지 않는 걸음으로 묵묵히 나아갔다.', '숨이 차올랐지만 멈추지 않고 한 걸음 더 내디뎠다.'],
  sen: ['멀리 있는 기척을 먼저 알아채고 길을 살짝 돌았다.', '바람결의 미세한 변화를 읽고 발걸음을 늦췄다.', '낯선 냄새를 맡고 조용히 방향을 틀었다.'],
  luk: ['길가에서 반짝이는 무언가를 발견했다!', '운 좋게 가장 편한 길로 접어들었다.', '무너질 뻔한 땅을 아슬아슬하게 피해 갔다.']
};
const TRAVEL_SCENE = [
  t => `${t}의 풍경을 구경하며 느긋하게 걸었다.`, t => `${t}의 바람이 얼굴을 스치고 지나간다.`, t => `${t}에 들어서자 공기가 사뭇 달라졌다.`,
  t => `${t}의 땅을 밟을 때마다 발밑에서 소리가 난다.`, t => `${t}의 하늘 한 켠에 구름이 천천히 흘러갔다.`, t => `${t}의 길이 구불구불 이어져 있다. 서두르지 않고 걸었다.`,
  t => `${t}에서 멀리 공중도시의 불빛이 깜박이는 것이 보였다.`, t => `${t}의 땅이 조금씩 경사져 올라간다.`, t => `${t}의 고요함 속에서 자신의 숨소리만 들렸다.`, t => `${t}에 희미한 짐승의 발자국이 남아 있다.`, t => `${t} 너머로 공중도시의 그림자가 아득하게 보인다.`, t => `${t}의 낯선 식물이 눈에 들어왔다.`
];
const TRAVEL_FLOURISH = [
  '들키지 않도록 몸을 낮추고 숨어서 이동했다.', '수상한 발자국을 발견했지만 조용히 지나쳤다.', '작은 개울가에서 잠시 숨을 돌렸다.',
  '바람결에 낯선 냄새가 실려 와 발걸음을 서둘렀다.', '멀리서 정체 모를 울음소리가 들렸다. 소리를 죽이고 나아갔다.', '옛 문명의 잔해 사이를 지나며 주위를 살폈다.',
  '풀숲이 흔들려 멈칫했지만 바람 탓이었다.', '길가에 떨어진 낡은 표식을 발견했다. 누군가 먼저 지나간 흔적이다.', '구름 사이로 햇살이 쏟아져 잠시 눈을 가렸다.',
  '허리춤의 물통을 열어 한 모금 마시고 다시 걸음을 옮겼다.', '발을 헛디딜 뻔했지만 재빨리 균형을 잡았다.', '멀리 다른 대원의 모닥불 연기가 가늘게 피어올랐다.', '낯선 새가 머리 위를 맴돌다가 사라졌다.',
  '바닥에 흩어진 금속 조각이 햇빛에 반짝였다. 옛 문명의 흔적일까.', '숨을 가다듬고 장비를 점검했다. 아직 문제없다.', '새 떼가 한꺼번에 날아올라 가슴이 철렁했다.', '발밑의 돌이 굴러 소리가 나자 숨을 죽였다.', '잠시 멈춰 서서 가야 할 방향을 다시 확인했다.'
];
function travelPlace(act, k) { // k분째에 지나는 칸의 지형 이름
  try {
    const z = state.dungeon && zoneOf(state.dungeon.zone); if (!z) return '길';
    let pt = null;
    if (act.path && act.path.length) { const cum = act.cum, el = k * BATTLE_LOG_SEC; let i = cum ? cum.findIndex(c => c * 1 >= el) : Math.min(k, act.path.length) - 1; if (i < 0) i = act.path.length - 1; pt = act.path[i]; }
    const ch = pt ? tileOf(z, pt[0], pt[1]) : null, ti = ch ? 'abcde'.indexOf(ch) : -1;
    return ti >= 0 && z.terrains[ti] ? z.terrains[ti].name : '이 일대';
  } catch (e) { return '길'; }
}
function travelLogFor(act, now = nowMs()) {
  const n = Math.floor(Math.max(0, now - act.startAt) / 1000 / BATTLE_LOG_SEC), top = act.bs && act.bs.top || topCombatStat(), out = [{ text: '이동을 시작했다. 주위를 살피며 걷는다.', kind: 'note' }];
  const base = (act.seed || Math.floor(act.startAt / 1000)) >>> 0;
  for (let k = 1; k <= n && k <= 600; k++) { if (k < n - 40) continue;
    const r = seededRng(base * 37 + k * 6151), roll = r(), place = travelPlace(act, k);
    if (top && roll < .3) out.push({ text: pickR(r, TRAVEL_STYLE[top]), kind: 'dodge' });
    else if (roll < .65) out.push({ text: pickR(r, TRAVEL_SCENE)(place), kind: 'note' });
    else out.push({ text: pickR(r, TRAVEL_SCENE)(place) + ' ' + pickR(r, TRAVEL_FLOURISH), kind: 'note' });
    { const re = seededRng(base * 53 + k * 911 + 5), ln = re() < .25 ? equipLine('t', re) : ''; if (ln) out[out.length - 1] = { text: ln, kind: 'note' }; }
  }
  return out;
}
const activityLogFor = (act, now) => { const a = ACTIONS[act.id], k = a && a.kind; return k === 'battle' ? battleLogFor(act, now) : k === 'step' || k === 'trip' ? travelLogFor(act, now) : []; };
/* 모의 전투 한 라운드 (실제 결과에는 영향 없음). st = { hp, mhp }  */
const MOCK_HIT = .35;
function mockRound(m, st, r = Math.random) {
  const fx = effects(), line = battleLine(m, r);
  // 묘사와 수치를 맞춘다: 때린 줄이면 몬스터 HP 감소, 맞은 줄이면 내 HP 감소
  if (line.kind === 'hit') st.mhp -= line.dealt;
  else if (line.kind === 'hurt') st.hp -= line.taken;
  return line;
}
/* 전투 시뮬레이션 (실시간 아님). hp0에서 시작해 { win, rounds, lost, rs }.
   rnd 가 시드 난수면 같은 결과가 나온다: 진행 중 전투 묘사와 최종 결과가 같은 계산에서 나온다. rs = 라운드별 기록 */
const battleSnap = () => { const fx = effects(); return { atk: fx.atk + weatherFx().atk, evade: fx.evade, wa: weaponAtk(), top: topCombatStat() }; };
function simulateBattle(m, hp0, rnd = Math.random, bs = battleSnap()) {
  const dmg = (3 + bs.wa) * (1 + bs.atk), jitter = () => .85 + rnd() * .3, hitP = Math.min(.5, BATTLE_HIT * (m.hit || 1) * (1 - bs.evade)), cap = m.hpCap || BATTLE_HP_CAP;
  const mhp0 = Math.round(m.hp * (.6 + rnd() * .9)); let hp = hp0, mhp = mhp0, rounds = 0, lost = 0; const rs = [];
  while (mhp > 0 && hp > 1 && rounds < 40) {
    rounds++;
    const r = { dealt: 0, crit: false, hurt: 0, dodge: false, miss: false };
    if (rnd() < .8) { r.crit = rnd() < .1; r.dealt = Math.max(1, Math.round(dmg * jitter() * (r.crit ? 2 : 1))); mhp -= r.dealt; } else r.miss = true;
    r.mhp = Math.max(0, mhp);
    if (mhp > 0) {
      if (rnd() < hitP) { const d = Math.max(1, Math.round(m.atk * jitter())), real = Math.max(0, Math.min(d, cap - lost, hp - 1)); hp -= d; lost += real; r.hurt = real; r.glance = real < d; }
      else r.dodge = true;
    }
    rs.push(r);
    if (mhp <= 0) break;
  }
  return { mhp0, win: mhp <= 0 && !(rnd() > 1 - BATTLE_MAX_WIN_MISS), rounds, lost: Math.min(lost, cap, hp0 - 1), rs };
}

/* 조사(즉시): 지형 정보 + 무작위 아이템 */
function investigate(a) {
  const t = a.terrain, fx = effects(), m = monsterOf(a);
  const r = { text: '', items: [], exp: 2, money: 0, hp: 0, sp: 0, spCost: spOf(a), buff: null };
  discover('monsters', m.name);
  r.text = `${t.name}: ${t.desc} 서식 몬스터는 ${m.name}(${m.kind}), 채집물은 ${t.gather.join('·')}입니다.`;
  if (chance(.05 + fx.rare)) { r.items.push([t.rare, 1]); r.text += ` 조사 중 희귀한 ${t.rare}을(를) 발견했습니다!`; }
  else if (chance(INVEST_ITEM)) { const n = pick(t.gather); r.items.push([n, 1]); r.text += ` 조사 중 ${n}을(를) 발견했습니다.`; }
  else r.text += ' 눈에 띄는 물건은 없었습니다.';
  if (chance(INVEST_HURT)) { const h = rand(...INVEST_HURT_HP); r.hp -= h; r.text += ` 함정을 건드려 HP를 ${h} 잃었습니다.`; }
  floorLoss(r);
  return r;
}

/* 완료 시점에 결과를 계산한다: { text, items:[[이름,수량]], exp, money, hp, sp, spCost, buff } (반복 행동은 회차별로 누적) */
function resolveAction(id, cycles = 1, spPaid = 0, act = null) {
  const a = ACTIONS[id], fx = effects(), t = a.terrain, per = spOf(a), br = act && act.seed && a.kind === 'battle' ? battleRuns(act, a) : null;
  const r = { text: '', items: [], exp: 0, money: 0, hp: 0, sp: 0, spCost: spPaid, buff: null };
  if (a.kind === 'rest') {
    r.hp = a.full ? state.vitals.hpMax : 30; r.sp = a.full ? state.vitals.spMax : (a.restSp ?? REST_SP); r.buff = '충분한 휴식';
    r.text = id === '캠프 휴식' ? '안전 캠프에서 푹 쉬었습니다.' : a.full ? '깊이 잠들어 HP와 기력을 모두 회복했습니다.' : '개인실에서 쉬었습니다.';
    return r;
  }
  if (a.kind === 'train') {
    const pool = learnableRecipes(), rc = pool.length ? pick(pool) : null;
    r.exp = TRAIN_EXP; r.sp = 0;
    if (rc) { state.learned.push(rc.out); r.recipe = rc.out; r.text = `1시간의 단련 끝에 「${rc.out}」 제작법을 익혔습니다. (재료: ${Object.entries(rc.mats).map(([n, q]) => `${n} ×${q}`).join(', ')})`; }
    else r.text = '단련을 마쳤습니다. 더 익힐 제작법은 없었습니다.';
    return r;
  }
  if (a.kind === 'tame') {
    const mon = a.terrain.monster, ok = chance(tameChance());
    r.exp = 12; r.sp = 0; r.spCost = spPaid;
    if (ok) { r.pet = mon.name; r.text = `${mon.name}이(가) 먹이를 받아먹고 경계를 풀었습니다. 길들이기 성공! 「${PET_SPECIES[mon.name].name}」이(가) 곁에 따릅니다.`; }
    else { r.text = `${mon.name}이(가) 먹이만 채 가고 달아났습니다.`; if (chance(.5)) { const h = rand(...a.hazard.hp); r.hp -= h; r.text += ` 달아나며 물려 HP를 ${h} 잃었습니다.`; } }
    floorLoss(r);
    return r;
  }
  const zoneId = id.split(' ')[0], seed = ZONE_SEEDS[zoneId], jf = jobFx();
  const bag = {}, add = (n, q) => { bag[n] = (bag[n] || 0) + q; };
  let done = 0, wins = 0, losses = 0, greats = 0, accidents = 0, stop = '', lowered = 0;
  const rep0 = repeatCount(id);
  for (let i = 0; i < cycles; i++) {
    if (i > 0 && state.vitals.hp + r.hp <= HP_RETREAT) { stop = `HP가 ${HP_RETREAT} 이하로 떨어져 중단했습니다.`; break; }
    const great = a.kind === 'gather' && chance(fx.ggreat), mult = great ? 2 : 1, keep = chance((a.kind === 'gather' ? Math.min(1, GATHER_FIND + weatherFx().gather) : 1) * repeatChance(rep0 + i + 1));
    if (!keep) lowered++;
    if (great) greats++;
    if (a.kind === 'gather') {
      if (keep) { const it = pick(a.items); add(it, rand(1, 3) * mult); if (chance(jf.gather[a.method] || 0)) add(it, 1); if (a.rare && chance(.05 + fx.rare)) add(a.rare, mult); if (seed && chance(SEED_DROP.gather)) add(seed, 1); }
      r.exp += 6;
      if (chance(a.hazard.chance)) { r.hp -= rand(...a.hazard.hp); accidents++; }
    } else {
      const m = monsterOf(a, act && act.d || 0), b = (br && br.runs[i]) || simulateBattle(m, Math.max(1, state.vitals.hp + r.hp));
      discover('monsters', m.name);
      r.hp -= b.lost;
      if (b.win) { wins++; countKill(m.name); r.exp += m.exp; r.money += m.cr; if (keep) { if (chance(BATTLE_MAT)) add(pick(t.gather), rand(1, 2) * mult); m.drops.forEach(([n, p]) => { if (chance(p)) add(n, mult); }); } if (seed && chance(SEED_DROP.battle)) add(seed, 1); }
      else { losses++; r.buff = '부상'; done++; stop = `${m.name}에게 패배해 후퇴했습니다.`; break; }
    }
    done++;
  }
  r.items = Object.entries(bag);
  floorLoss(r);
  r.refund = (cycles - done) * per; r.sp = 0; r.spCost = spPaid - r.refund; // 쓰지 않은 회차의 기력은 '회복'이 아니라 소모에서 빼서 보여 준다
  noteRepeat(id, done);
  const tail = [lowered ? (a.kind === 'gather' ? `빈손 ${lowered}회` : `재료를 못 얻은 회차 ${lowered}회`) : '', greats ? `대성공 ${greats}회` : '', accidents ? `사고 ${accidents}회` : '', stop].filter(Boolean).join(' · ');
  if (a.kind === 'gather') r.text = `${t.name}에서 ${done}회 「${a.label}」 했습니다.${tail ? ' ' + tail : ''}`;
  else r.text = `${monsterBase(a).name}와(과) ${done}회 교전: ${wins}승 ${losses}패.${tail ? ' ' + tail : ''}`;
  return r;
}

/* 시간이 다 된 행동을 마무리한다. 타일 이동이면 'step', 결과 대기면 true, 아직이면 false */
function finishIfDue() {
  const act = state.active;
  if (!act || nowMs() < act.endAt) return false;
  const a = ACTIONS[act.id];
  state.active = null;
  if (a.kind === 'trip') { state.location = act.to; discover('zones', act.to); enterDungeon(act.to); return 'trip'; }
  if (a.kind === 'step') { const ev = applyMove(act.path, act.path.length); save(); return ev ? true : 'step'; }
  state.pending = { id: act.id, result: resolveAction(act.id, act.cycles, act.spCost, act) };
  save();
  return true;
}

/* 결과 확인: 보상 적용. { lost: 못 담은 아이템, ups: 레벨업 횟수, id } 반환 */
function claimResult() {
  const { id, result: r } = state.pending, v = state.vitals, lost = [];
  if (r.death) { state.pending = null; return { id, lost, ups: 0, result: r, died: dieAndRebirth() }; } // 죽으면 이 행동의 보상은 받지 못한다
  r.items.forEach(([n, q]) => { const got = addItem(n, q); if (got < q) lost.push([n, q - got]); });
  state.money = Math.max(0, state.money + r.money);
  if (r.pet) addPet(r.pet);
  v.hp = clamp(v.hp + r.hp, 1, v.hpMax);
  v.sp = clamp(v.sp + r.sp + (r.refund || 0), 0, v.spMax);
  if (r.buff) addBuff(r.buff);
  const ups = gainExp(r.exp);
  state.pending = null;
  save();
  return { id, lost, ups, result: r };
}

/* ---------- 제작 ---------- */
const canCraft = rc => Object.entries(rc.mats).every(([n, q]) => countItem(n) >= q);
/* 제작 아이템의 효과 문장 */
function itemEffect(name) {
  const it = ITEMS[name], p = [];
  if (it.use) { if (it.use.hp) p.push(`HP +${it.use.hp} 회복`); if (it.use.sp) p.push(`기력 +${it.use.sp} 회복`); }
  if (it.atk) p.push(`공격력 +${it.atk}`);
  if (it.mods) p.push(...modText(it.mods));
  if (reinforceLv(name)) p.push(`강화 ${REINFORCE_RANKS[reinforceLv(name)]}랭 (공격력 +${reinforceBonus(name)})`);
  if (state.enchants[name]) p.push(`세공: ${enchantText(state.enchants[name])}`);
  { const st = ITEM_SETS.find(x => x.need.includes(name)); if (st) p.push(`세트 ${st.name}(${st.need.join('+')}): ${modText(st.mods).join(' ')}`); }
  if (it.capacity) p.push(`소지 칸 ${it.capacity}칸`);
  return p.join(' · ') || '제작 재료';
}
/* 제작 시간(초): 감각 스탯으로 단축 */
const craftSec = rc => Math.max(5, Math.round(rc.sec * (1 - effects().craftTime)));
/* 제작 시작. 'ok' / 'mats' / 'space' / 'busy'. 재료는 시작할 때 소모하고, 시간이 지나면 완성된다 (성공률 없음) */
const MAX_BATCH = 99;
/* 이 아이템을 몇 개까지 더 넣을 수 있나 (빈 칸 + 쌓을 수 있는 자리) */
function roomFor(name) {
  const it = ITEMS[name], list = state.inventory[it.tab], free = Math.max(0, bagCapacity() - usedSlots());
  if (it.tab === '장비') return free;
  return free * STACK_MAX + list.filter(s => s.n === name).reduce((a, s) => a + Math.max(0, STACK_MAX - s.q), 0);
}
/* 지금 재료와 가방 자리로 한 번에 만들 수 있는 최대 개수 */
const maxCraft = rc => Math.min(MAX_BATCH, roomFor(rc.out), ...Object.entries(rc.mats).map(([n, q]) => Math.floor(countItem(n) / q)));
const craftTotalSec = (rc, qty) => craftSec(rc) * qty;
function craft(index, qty = 1) {
  const rc = RECIPES[index];
  if (!rc) return 'mats';
  qty = intIn(qty, 1, MAX_BATCH, 1);
  if (!recipeKnown(rc)) return 'unknown';
  if (state.crafting) return 'busy';
  if (!canCraft(rc)) return 'mats';
  if (!canAdd(rc.out)) return 'space';
  qty = Math.min(qty, Math.max(1, maxCraft(rc)));
  Object.entries(rc.mats).forEach(([n, q]) => removeItem(n, q * qty));
  const t = nowMs();
  state.crafting = { index, out: rc.out, qty, startAt: t, endAt: t + craftTotalSec(rc, qty) * 1000, great: chance(effects().craftGreat), ready: false };
  save();
  return 'ok';
}
/* 완성 시각이 지났으면 완성 상태로. 바뀌면 true */
function craftTick() {
  const c = state.crafting;
  if (!c || c.ready || nowMs() < c.endAt) return false;
  c.ready = true; save();
  return true;
}
/* 완성품 수령. { got, lost, great } / null(아직) */
function collectCraft() {
  const c = state.crafting;
  if (!c || !c.ready) return null;
  const want = (c.qty || 1) + (c.great ? 1 : 0), got = addItem(c.out, want);
  if (!got) return { got: 0, lost: want, great: c.great, out: c.out, full: true };
  discover('recipes', c.out);
  state.crafting = null; save();
  return { got, lost: want - got, great: c.great, out: c.out };
}
/* 제작 취소: 재료를 돌려받는다 */
function cancelCraft() {
  const c = state.crafting;
  if (!c || c.ready) return false;
  Object.entries(RECIPES[c.index].mats).forEach(([n, q]) => addItem(n, q * (c.qty || 1)));
  state.crafting = null; save();
  return true;
}

/* ---------- 미궁 (타일맵) ---------- */
const zoneOf = id => DANGER_ZONES.find(z => z.id === id);
function tileOf(z, x, y) { return (z.map[y] || '')[x]; }
const terrainIndex = ch => 'abcde'.indexOf(ch);

/* 타일 정보 { name, desc, terrain } */
function tileInfo(z, ch) {
  const ti = terrainIndex(ch);
  if (ti >= 0) { const t = z.terrains[ti]; return { name: t.name, desc: t.desc + (t.rough && ROUGH_EXTRA_SEC[t.rough] ? ` (험난한 지형: 이 칸에 들어갈 때 이동 시간 +${ROUGH_EXTRA_SEC[t.rough] / 60}분)` : ''), terrain: t }; }
  return { S: { name: '입구', desc: '구역으로 돌아갈 수 있는 입구입니다.' }, C: { name: '안전 캠프', desc: '지상 속 안전지대입니다. 안전하게 쉴 수 있습니다.' },
    E: { name: '이벤트 지점', desc: '무언가 일어날 것 같은 장소입니다.' } }[ch];
}
/* E 칸의 번호(읽는 순서) */
const eventIndex = (z, x, y) => z.map.slice(0, y).join('').split('E').length - 1 + z.map[y].slice(0, x).split('E').length - 1;
function revealAround(d) {
  const ex = state.explored[d.zone] || (state.explored[d.zone] = {});
  (state.visited[d.zone] || (state.visited[d.zone] = {}))[`${d.x},${d.y}`] = 1;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const k = `${d.x + dx},${d.y + dy}`; d.seen[k] = 1; ex[k] = 1; }
}
function enterDungeon(zoneId) {
  const z = zoneOf(zoneId);
  let x = 0, y = 0;
  z.map.forEach((row, ry) => { const cx = row.indexOf('S'); if (cx >= 0) { x = cx; y = ry; } });
  state.dungeon = { zone: zoneId, x, y, seen: { ...(state.explored[zoneId] || {}) }, done: Object.keys(state.eventAt).filter(k => k.startsWith(zoneId + ':') && state.eventAt[k] + EVENT_RESET_MS > nowMs()).map(k => +k.split(':')[1]), seed: Math.floor(Math.random() * 2147483647) };
  revealAround(state.dungeon);
  state.flags.entered = true;
  save();
}
function leaveDungeon() { state.dungeon = null; state.location = '이동장치'; save(); } // 퇴장하면 구역 화면을 거치지 않고 바로 이동장치로 돌아간다
/* 현재 칸에서 고를 수 있는 행동 묶음 */
function currentGroups() {
  if (!state.dungeon) return LOCATIONS[state.location].groups;
  const z = zoneOf(state.dungeon.zone), ch = tileOf(z, state.dungeon.x, state.dungeon.y), ti = terrainIndex(ch);
  if (ti >= 0) { const t = z.terrains[ti]; return [{ label: t.name, items: [t.actions[0], ...tileGatherIds(z, state.dungeon.x, state.dungeon.y, state.dungeon.seed), tileBattleId(z, t, state.dungeon.x, state.dungeon.y, state.dungeon.seed), ...(t.tameId ? [t.tameId] : [])] }]; }
  if (ch === 'C') return [{ label: '안전 캠프', items: ['캠프 휴식', '임무 수주', '상점', '모닥불 주사위'] }];
  if (ch === 'S') return [{ label: '입구', items: ['퇴장'] }];
  return [];
}
/* 타일 이동 계획: 지금 칸에서 (tx,ty)까지 벽을 피한 최단 경로. { path:[[x,y]..], steps, sec, sp } / { err } */
/* 칸에 들어갈 때 걸리는 초: 기본 + 험난한 지형 추가 시간 */
function tileSec(z, x, y) { const ti = terrainIndex(tileOf(z, x, y)), r = ti >= 0 ? (z.terrains[ti].rough || 0) : 0; return Math.round(stepSec() + ROUGH_EXTRA_SEC[r]); }
function planMove(tx, ty) {
  const d = state.dungeon, z = zoneOf(d.zone), ch = tileOf(z, tx, ty);
  if (!ch || ch === '#' || ch === '.') return { err: '갈 수 없는 칸입니다.' };
  if (tx === d.x && ty === d.y) return { err: '이미 이 칸에 있습니다.' };
  const dist = { [`${d.x},${d.y}`]: 0 }, prev = { [`${d.x},${d.y}`]: null }, open = [[d.x, d.y]], seen = {};
  while (open.length) { // 칸마다 걸리는 시간이 달라서 가장 빨리 가는 길을 찾는다 (다익스트라)
    open.sort((a, b) => dist[`${b[0]},${b[1]}`] - dist[`${a[0]},${a[1]}`]);
    const [x, y] = open.pop(), kk = `${x},${y}`;
    if (seen[kk]) continue; seen[kk] = 1;
    if (x === tx && y === ty) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, c = tileOf(z, nx, ny), k = `${nx},${ny}`;
      if (!c || c === '#' || c === '.') continue;
      const nd = dist[kk] + tileSec(z, nx, ny);
      if (!(k in dist) || nd < dist[k]) { dist[k] = nd; prev[k] = kk; open.push([nx, ny]); }
    }
  }
  if (!(`${tx},${ty}` in prev)) return { err: '길이 이어져 있지 않습니다.' };
  const path = []; let k = `${tx},${ty}`;
  while (prev[k]) { path.unshift(k.split(',').map(Number)); k = prev[k]; }
  let acc = 0; const cum = path.map(([x, y]) => (acc += tileSec(z, x, y)));
  return { path, cum, steps: path.length, sec: acc, sp: path.length * DUNGEON_STEP_SP, rough: path.filter(([x, y]) => tileSec(z, x, y) > Math.round(stepSec())).length };
}
/* 이동 시작. 성공 null / 실패 사유 */
function startMove(tx, ty) {
  if (state.active) return '행동이 진행 중이라 이동할 수 없습니다.';
  if (state.pending) return '먼저 결과를 확인하세요.';
  const m = planMove(tx, ty);
  if (m.err) return m.err;
  if (state.vitals.sp < m.sp) return `기력이 부족해 이동할 수 없습니다. (필요 ${m.sp}) 식량을 먹으세요.`;
  state.vitals.sp -= m.sp;
  const t = nowMs();
  state.active = { id: '타일 이동', startAt: t, endAt: t + m.sec * 1000, cycles: 1, cycleSec: m.sec, spCost: m.sp, path: m.path, cum: m.cum, seed: 1 + Math.floor(Math.random() * 2147483000), bs: { top: topCombatStat() } };
  save();
  return null;
}
/* 경로를 따라 done칸 이동한 것으로 처리. 도착 칸이 이벤트면 이벤트 결과를 만든다. 'event' / null */
const travelFinds = []; // 이동 중 주운 아이템 (UI가 비우며 알림)
/* 이벤트 지점: 치른 지 EVENT_RESET_MS가 지나면 다시 이벤트가 생긴다 */
function refreshEvents(d) {
  if (!d) return;
  d.done = d.done.filter(i => { const at = state.eventAt[`${d.zone}:${i}`]; return at && at + EVENT_RESET_MS > nowMs(); });
  for (const k in state.eventAt) if (state.eventAt[k] + EVENT_RESET_MS <= nowMs()) delete state.eventAt[k];
}
function applyMove(path, done) {
  const d = state.dungeon, z = zoneOf(d.zone);
  refreshEvents(d);
  for (let i = 0; i < done; i++) {
    const [x, y] = path[i];
    d.x = x; d.y = y; revealAround(d);
    const tz = terrainIndex(tileOf(z, x, y));
    if (tz >= 0) {
      discover('zones', `${z.id}:${z.terrains[tz].name}`);
      if (chance(TRAVEL_FIND + effects().rare * .05)) { const n = pick(z.terrains[tz].gather); if (addItem(n, 1)) travelFinds.push(n); } // 길가에서 아주 드물게 재료를 줍는다
    }
  }
  const ch = tileOf(z, d.x, d.y);
  if (ch === 'E') {
    const idx = eventIndex(z, d.x, d.y);
    if (!d.done.includes(idx)) {
      d.done.push(idx); state.eventAt[`${d.zone}:${idx}`] = nowMs();
      const ev = z.events[idx % z.events.length];
      const er = { text: `${ev.title} — ${ev.text}`, items: ev.items || [], exp: ev.exp || 0, money: ev.money || 0, hp: ev.hp || 0, sp: ev.sp || 0, spCost: 0, buff: null };
      floorLoss(er);
      state.pending = { id: `${z.id} 이벤트`, result: er };
      return 'event';
    }
  }
  return null;
}

/* ---------- 캐릭터 생성 / 무기 선택 (튜토리얼) ---------- */
const statsTotal = st => STAT_DEFS.reduce((a, d) => a + st[d.key], 0);
/* 성공 null / 실패 사유. 모든 캐릭터는 F등급·1레벨·100CR·스탯 총합 동일 */
function createCharacter(f) {
  const name = cleanText(f.name, 12);
  if (!name) return '이름을 입력하세요.';
  const blankAge = f.age === '' || f.age == null; // 나이는 비워 두면 20세
  const age = blankAge ? 20 : Math.floor(+f.age);
  if (!(age >= AGE_MIN && age <= AGE_MAX)) return `나이는 ${AGE_MIN}~${AGE_MAX}세 사이로 입력하세요.`;
  const ability = cleanText(f.ability, 20);
  if (!ability) return '이능력 이름을 입력하세요.';
  const st = {};
  for (const d of STAT_DEFS) {
    const v = Math.floor(+f.stats[d.key]);
    if (!(v >= STAT_BASE && v <= STAT_CAP)) return '스테이터스 값이 올바르지 않습니다.';
    st[d.key] = v;
  }
  if (statsTotal(st) !== STAT_BASE * STAT_DEFS.length + STAT_POOL) return `스테이터스 포인트 ${STAT_POOL}을(를) 모두 분배하세요.`;
  state.learned = [];
  Object.assign(state.character, { name, age, keywords: cleanText(f.keywords, 60), ability, abilityDesc: cleanText(f.abilityDesc, 300), level: 1, rank: 'F', title: TITLES[0] });
  state.stats = st; state.statPoints = 0; state.money = 100; state.vitals = { hp: 100, hpMax: 100, sp: 100, spMax: 100, exp: 0 };
  state.created = true; state.questTaken = {}; state.qprog = {}; state.questAt = {}; state.titles = [TITLES[0]]; state.friends = []; state.mail = []; state.mailSeq = 1; pushMail('관제국', '배치 안내', '탐색자 등록이 승인되었습니다. 본부에서 장비를 점검하고 첫 임무를 확인하십시오. 아이템을 담아 보낼 때 쓰는 운송장치를 보급품으로 드립니다. 15일이 지난 메일은 사라지니 남기고 싶은 메일은 보존하세요.', [[MAIL_SHIP_ITEM, 2]]); state.farm = { plots: [] }; state.pets = []; state.petActive = -1; state.subjob = null; save();
  return null;
}
function chooseWeapon(name) {
  if (!WEAPON_NAMES.includes(name) || state.tutorialDone) return false;
  if (state.equipment['무기']) state.inventory['장비'] = state.inventory['장비'].filter(s => s.n !== state.equipment['무기']);
  state.equipment['무기'] = name; discover('items', name);
  START_KIT.forEach(([n, q]) => addItem(n, q));
  state.tutorialDone = true; save();
  return true;
}

/* ---------- 임무 ---------- */
/* 지금 있는 장소: 지상 구역의 안전 캠프(타일 C)면 구역 이름, 공중이면 그 장소 이름. 아니면 null */
function placeKey() {
  if (state.dungeon) { const z = zoneOf(state.dungeon.zone); return tileOf(z, state.dungeon.x, state.dungeon.y) === 'C' ? z.id : null; }
  return state.location;
}
const isTaken = q => (q.board || q.promo) ? !!state.questTaken[q.id] : true;
const takenQuests = () => QUESTS.filter(isTaken);
/* 조건 목록: 단일 조건이면 하나, multi면 여러 개. 처치 진행도는 qprog에 조건별 키로 저장한다 */
const needParts = q => q.need.type === 'multi' ? q.need.parts : [q.need];
const progKey = (q, i) => needParts(q).length > 1 ? `${q.id}#${i}` : q.id;
function countKill(name) {
  QUESTS.forEach(q => {
    if (!state.questTaken[q.id] || state.questDone[q.id]) return;
    needParts(q).forEach((n, i) => {
      if (n.type !== 'kill' || (n.monster && n.monster !== name)) return;
      const k = progKey(q, i); state.qprog[k] = Math.min(n.qty, (state.qprog[k] || 0) + 1);
    });
  });
}
const activeBoard = () => QUESTS.filter(x => x.board && state.questTaken[x.id] && !state.questDone[x.id]);
/* 임무 수주. 성공하면 null, 아니면 사유 */
function takeQuest(id) {
  const q = QUESTS.find(x => x.id === id);
  if (!q || !q.board) return '수주할 수 없는 임무입니다.';
  if (!state.created) return '먼저 캐릭터를 만드세요.';
  if (placeKey() !== q.board) return '이 장소에서 받을 수 있는 임무가 아닙니다.';
  if (state.questDone[id]) return '이미 완수한 임무입니다. 24시간 뒤에 다시 나타납니다.';
  if (state.questTaken[id]) return '이미 수주한 임무입니다.';
  if (activeBoard().length >= BOARD_MAX_ACTIVE) return `수주 임무는 동시에 ${BOARD_MAX_ACTIVE}개까지 진행할 수 있습니다.`;
  state.questTaken[id] = true; state.qprog[id] = 0; state.questAt[id] = nowMs(); save();
  return null;
}
/* 수주 임무 24시간 리셋: 수주한 지 24시간이 지난 임무는 (완수했든 못 했든) 처음 상태로 돌아가 다시 수주할 수 있다. 리셋된 임무 수 */
function resetBoardQuests() {
  let n = 0;
  QUESTS.filter(q => q.board && state.questTaken[q.id]).forEach(q => {
    if (!state.questAt[q.id]) state.questAt[q.id] = nowMs(); // 옛 저장: 지금부터 센다
    if (nowMs() - state.questAt[q.id] < BOARD_RESET_MS) return;
    needParts(q).forEach((_, i) => delete state.qprog[progKey(q, i)]);
    delete state.questTaken[q.id]; delete state.questDone[q.id]; delete state.questAt[q.id]; n++;
  });
  if (n) save();
  return n;
}
const boardResetLeft = id => state.questAt[id] ? Math.max(0, state.questAt[id] + BOARD_RESET_MS - nowMs()) : 0;
/* 승급: 지금 등급의 다음 등급 시험(메인 임무). 없으면 null (D등급 이후는 아직 없음) */
const nextPromo = () => { const i = PROMO_ORDER.indexOf(state.character.rank); return i >= 0 && i < PROMO_ORDER.length - 1 ? QUESTS.find(q => q.promo === PROMO_ORDER[i + 1]) : null; };
function takePromo() {
  const q = nextPromo();
  if (!state.created) return '먼저 캐릭터를 만드세요.';
  if (state.location !== '본부') return '승급 시험은 본부에서 받을 수 있습니다.';
  if (!q) return '지금은 D등급까지만 승급할 수 있습니다.';
  if (state.questTaken[q.id]) return '이미 승급 시험을 받았습니다.';
  if (state.character.level < q.lv) return `Lv.${q.lv} 이상이어야 받을 수 있습니다.`;
  state.questTaken[q.id] = true; needParts(q).forEach((_, i) => { state.qprog[progKey(q, i)] = 0; }); save();
  return null;
}
/* { cur, max, text, ready } — multi는 조건별 진행을 합쳐 보여준다 */
function partProgress(q, n, i) {
  if (n.type === 'visit') { const cur = n.zones.filter(id => state.codex.zones[id]).length; return { cur, max: n.zones.length, text: `${cur}/${n.zones.length} 구역 방문`, ready: cur >= n.zones.length }; }
  if (n.type === 'item') { const cur = Math.min(countItem(n.name), n.qty); return { cur, max: n.qty, text: `${n.name} ${cur}/${n.qty}${n.consume ? ' (납품)' : ''}`, ready: cur >= n.qty }; }
  if (n.type === 'kill') { const cur = Math.min(state.qprog[progKey(q, i)] || 0, n.qty); return { cur, max: n.qty, text: `${n.monster || '몬스터'} 처치 ${cur}/${n.qty}`, ready: cur >= n.qty }; }
  const ok = !!state.flags[n.flag];
  return { cur: +ok, max: 1, text: `${n.text} ${ok ? '완료' : '미완료'}`, ready: ok };
}
function questProgress(q) {
  const ps = needParts(q).map((n, i) => partProgress(q, n, i));
  if (ps.length === 1) return ps[0];
  return { cur: ps.reduce((a, p) => a + p.cur, 0), max: ps.reduce((a, p) => a + p.max, 0), text: ps.map(p => p.text).join(' · '), ready: ps.every(p => p.ready) };
}
/* 임무 완수. 성공하면 { ups, items }, 아니면 null */
function completeQuest(id) {
  const q = QUESTS.find(x => x.id === id);
  if (!q || !isTaken(q) || state.questDone[id] || !questProgress(q).ready) return null;
  needParts(q).forEach(n => { if (n.consume) removeItem(n.name, n.qty); });
  state.questDone[id] = true;
  if (q.promo) { state.character.rank = q.promo; } // 승급 시험을 마치면 등급이 오른다
  state.money += q.reward.money || 0;
  (q.reward.items || []).forEach(([n, c]) => addItem(n, c));
  const ups = gainExp(q.reward.exp || 0);
  save();
  return { ups, promo: q.promo || null };
}

/* ---------- 상점 ---------- */
const SHOP_TABS = ['기본 보급품', '장비', '소모품', '재료', '판매'];
/* 상점의 구입 탭별 목록: 기본 보급품(base) + 특별 상품(special)을 아이템 분류로 나눈다. { 탭: [[이름, 가격]...] } */
function shopSections(place) {
  const shop = SHOPS[place];
  if (!shop) return null;
  const sec = { '기본 보급품': [...shop.base], '장비': [], '소모품': [], '재료': [] };
  shop.special.forEach(r => sec[ITEMS[r[0]].tab].push(r));
  return sec;
}
/* 구입. 성공하면 null, 아니면 사유 */
function buyItem(place, name, qty = 1) {
  const shop = SHOPS[place], row = shop && [...shop.base, ...shop.special].find(r => r[0] === name);
  if (!row || !ITEMS[name]) return '이 상점에서 팔지 않는 물건입니다.';
  if (!state.created) return '먼저 캐릭터를 만드세요.';
  if (placeKey() !== place) return '지금 있는 장소의 상점이 아닙니다.';
  qty = intIn(qty, 1, 99, 1);
  const total = row[1] * qty;
  if (state.money < total) return `CR이 부족합니다. (필요 ${total} CR)`;
  if (!canAdd(name) || (ITEMS[name].tab === '장비' && usedSlots() + qty > bagCapacity())) return '가방에 빈 칸이 없습니다.';
  const got = addItem(name, qty);
  if (got < qty) { if (got) removeItem(name, got); return '가방에 빈 칸이 없습니다.'; }
  state.money -= total; save();
  return null;
}
/* 판매: 가방에 있는 아이템(착용 중인 것은 제외)을 팔 수 있는 장소(상점)에서 sell 가격으로 판다 */
const sellPrice = name => (ITEMS[name] && ITEMS[name].sell) || 0;
const sellable = () => Object.values(state.inventory).flat().filter(s => sellPrice(s.n) > 0);
function sellItem(place, name, qty = 1) {
  if (!SHOPS[place] || placeKey() !== place) return '지금 있는 장소의 상점이 아닙니다.';
  if (!state.created) return '먼저 캐릭터를 만드세요.';
  if (!sellPrice(name)) return '상점에서 사지 않는 물건입니다.';
  qty = intIn(qty, 1, 9999, 1);
  const have = countItem(name);
  if (!have) return '그 아이템을 가지고 있지 않습니다.';
  qty = Math.min(qty, have);
  if (!removeItem(name, qty)) return '판매하지 못했습니다.';
  state.money += sellPrice(name) * qty; save();
  return null;
}

/* ---------- 서브잡 ----------
   클론 인간의 근본이 되는 인간의 기억이 닳아 없어지지 않도록 유지하는 일. 하루 한 번, 같은 태그의 아이템을 납품해 레벨을 올리고 버프를 받는다. */
const jobNeed = lv => 2 + lv;       // 납품 개수: Lv1 3개 … Lv10 12개
const jobProgNeed = lv => lv + 1;   // 다음 레벨까지 필요한 납품 일수
const jobBuffed = () => jobActive();
/* 레벨별 버프. tags마다 다르다: 채집/채굴/낚시 = 해당 수확 +1개 확률, 목공/재봉/대장 = 제작 시간 단축, 농사 = 성장 단축 + 수확 +1개 확률, 요리/약학 = 회복량 증가 */
/* 버프는 오늘(자정 0시 기준) 납품을 마쳤을 때만 적용된다. always = true면 납품 여부와 상관없이 레벨 기준 효과를 계산(미리보기용) */
/* 서브잡 납품은 한국 시간 자정(0시)에 리셋된다: 마지막 납품과 같은 날이면 오늘은 이미 끝낸 것 */
const kstDayOf = t => Math.floor((t + 9 * 3600000) / 86400000), nextKstMidnight = t => (kstDayOf(t) + 1) * 86400000 - 9 * 3600000;
const jobActive = () => !!state.subjob && state.subjob.lastAt > 0 && nowMs() < nextKstMidnight(state.subjob.lastAt);
function jobFx(always) {
  const fx = { craftTime: 0, farmTime: 0, farmYield: 0, gather: {}, heal: {} }, j = state.subjob;
  if (!j || (!always && !jobActive())) return fx;
  const lv = j.level;
  j.tags.forEach(t => {
    if (GATHER_KINDS[t]) fx.gather[t] = Math.min(.3, lv * .03);
    else if (['목공', '재봉', '대장', '가죽공예', '보석공예'].includes(t)) fx.craftTime = Math.min(.3, fx.craftTime + lv * .03);
    else if (t === '농사') { fx.farmTime = Math.min(.3, lv * .03); fx.farmYield = Math.min(.4, lv * .04); }
    else fx.heal[t] = Math.min(.4, lv * .04);
  });
  return fx;
}
const healBonus = name => Math.max(0, ...(ITEMS[name].tags || []).map(t => jobFx().heal[t] || 0));
const jobFxText = (always) => {
  const f = jobFx(always), p = [];
  Object.entries(f.gather).forEach(([t, v]) => p.push(`${t} 수확 +1개 확률 ${Math.round(v * 100)}%`));
  if (f.craftTime) p.push(`제작 시간 -${Math.round(f.craftTime * 100)}%`);
  if (f.farmTime) p.push(`작물 성장 시간 -${Math.round(f.farmTime * 100)}% · 수확 +1개 확률 ${Math.round(f.farmYield * 100)}%`);
  Object.entries(f.heal).forEach(([t, v]) => p.push(`${t} 음식·약 회복량 +${Math.round(v * 100)}%`));
  return p.join(' · ') || '버프 없음';
};
/* 납품 가능한 아이템: 소모품/재료 중 서브잡 태그가 겹치는 것. 싼 것부터 소비한다. [{ n, q, price }] */
function jobStock() {
  const j = state.subjob; if (!j) return [];
  const m = {};
  ['소모품', '재료'].forEach(tab => state.inventory[tab].forEach(s => { const it = ITEMS[s.n]; if (it.sell && (it.tags || []).some(t => j.tags.includes(t))) m[s.n] = (m[s.n] || 0) + s.q; }));
  return Object.entries(m).map(([n, q]) => ({ n, q, price: ITEMS[n].sell })).sort((a, b) => a.price - b.price);
}
const jobCooldown = () => state.subjob && state.subjob.lastAt > 0 ? Math.max(0, nextKstMidnight(state.subjob.lastAt) - nowMs()) : 0;
function joinSubjob(name, tags) {
  name = cleanText(name, JOB_NAME_MAX);
  if (!state.created) return '먼저 캐릭터를 만드세요.';
  if (state.location !== '상점가') return '서브잡 가입은 상점가에서 할 수 있습니다.';
  if (state.subjob) return '이미 서브잡이 있습니다. 먼저 그만두세요.';
  tags = [...new Set(tags)].filter(t => TAG_NAMES.includes(t));
  if (!tags.length) return '태그를 하나 고르세요.';
  if (tags.length > JOB_TAG_MAX) return `태그는 ${JOB_TAG_MAX}개만 고를 수 있습니다.`;
  if (!name) name = tags[0]; // 생전 직업을 비워 두면 태그 이름이 들어간다
  state.subjob = { name, tags, level: 1, prog: 0, lastAt: 0 }; save();
  return null;
}
function quitSubjob() { state.subjob = null; save(); }
/* 하루 한 번 납품. picks = { 아이템: 수량 } (직접 고른 납품 목록). 없으면 싼 것부터 자동으로 채운다. 성공하면 { n, pay, up }, 아니면 사유 문장 */
function deliverJob(picks) {
  const j = state.subjob;
  if (!j) return '서브잡이 없습니다.';
  if (state.location !== '상점가') return '납품은 상점가에서 할 수 있습니다.';
  if (jobCooldown()) return '오늘은 이미 납품했습니다. 자정(0시)에 다시 할 수 있습니다.';
  const need = jobNeed(j.level), stock = jobStock();
  if (stock.reduce((a, r) => a + r.q, 0) < need) return `납품할 아이템이 부족합니다. (${j.tags.join('/')} 태그 ${need}개 필요)`;
  let list = [];
  if (picks) {
    for (const [n, q0] of Object.entries(picks)) {
      const q = Math.floor(Number(q0)) || 0, r = stock.find(x => x.n === n);
      if (q < 0) return '납품 수량이 올바르지 않습니다.';
      if (!q) continue;
      if (!r) return `${n}은(는) 이 서브잡에 납품할 수 없습니다.`;
      if (q > r.q) return `${n}을(를) ${r.q}개보다 많이 낼 수 없습니다.`;
      list.push([n, q, r.price]);
    }
    const total = list.reduce((a, r) => a + r[1], 0);
    if (total !== need) return `정확히 ${need}개를 골라 주세요. (지금 ${total}개)`;
  } else { let left = need; for (const r of stock) { const q = Math.min(left, r.q); list.push([r.n, q, r.price]); left -= q; if (!left) break; } }
  let pay = 0;
  list.forEach(([n, q, price]) => { removeItem(n, q); pay += q * price; });
  pay = Math.round(pay * 1.25); state.money += pay; j.lastAt = nowMs();
  let up = false;
  if (j.level < JOB_MAX_LV && ++j.prog >= jobProgNeed(j.level)) { j.level++; j.prog = 0; up = true; }
  save();
  return { n: need, pay, up };
}

/* ---------- 농장 ---------- */
const farmPlotCount = () => FARM_PLOTS[state.character.rank] || FARM_PLOTS.F;
const growMs = crop => Math.round(CROPS[crop].grow * 60000 * (1 - jobFx().farmTime));
const plotReady = p => !!p && nowMs() - p.at >= growMs(p.crop);
function plantCrop(i, seed) {
  const crop = ITEMS[seed] && ITEMS[seed].seed;
  if (!state.created) return '먼저 캐릭터를 만드세요.';
  if (state.location !== '개인실') return '농장은 개인실에서 쓸 수 있습니다.';
  if (!(i >= 0 && i < farmPlotCount())) return '없는 밭입니다.';
  if (!crop) return '심을 수 없는 아이템입니다.';
  if (state.farm.plots[i]) return '이미 작물이 자라고 있습니다.';
  if (!removeItem(seed)) return '씨앗이 없습니다.';
  state.farm.plots[i] = { crop, at: nowMs() }; save();
  return null;
}
function harvestPlot(i) {
  const p = state.farm.plots[i];
  if (!p) return '비어 있는 밭입니다.';
  if (!plotReady(p)) return '아직 자라는 중입니다.';
  const c = CROPS[p.crop], qty = rand(...c.yield) + (chance(jobFx().farmYield) ? 1 : 0), got = addItem(p.crop, qty);
  if (got < qty) { if (got) removeItem(p.crop, got); return '가방에 빈 칸이 없습니다.'; }
  state.farm.plots[i] = null; save();
  return { crop: p.crop, qty };
}

/* ---------- 펫 ---------- */
const petCap = () => Object.keys(PET_SPECIES).length; // 펫 보관함: 종마다 한 마리씩 모으는 도감식 (중복 불가), 소지품과 별도
const petFed = p => nowMs() - p.fedAt < PET_FED_MS;
const petBuff = p => PET_SPECIES[p.id].base * (.5 + p.bond / 200); // 이동속도 증가 비율 (타일 이동 시간 단축)
const activePet = () => state.pets[state.petActive] || null;
const petSpeed = () => { const p = activePet(); return p && petFed(p) ? petBuff(p) : 0; };
const stepSec = () => DUNGEON_STEP_SEC * (1 - petSpeed());
const baitItems = () => Object.values(state.inventory).flat().filter(s => ITEMS[s.n].feed).map(s => s.n).sort((a, b) => ITEMS[a].feed - ITEMS[b].feed);
const tameChance = () => clamp(TAME_BASE + totalStats().sen * .02, 0, .8);
function addPet(id) {
  if (!PET_SPECIES[id] || state.pets.some(p => p.id === id) || state.pets.length >= petCap()) return false;
  state.pets.push({ id, bond: PET_BOND_START, fedAt: 0, exp: null });
  if (state.petActive < 0) state.petActive = 0;
  save();
  return true;
}
/* 먹이: 작물 / 펫 사료. 든든함이 24시간 유지되고 친밀도가 오른다 */
function feedPet(i, item) {
  const p = state.pets[i], it = ITEMS[item];
  if (!p) return '펫이 없습니다.';
  if (state.location !== '개인실') return '펫 돌보기는 개인실에서 할 수 있습니다.';
  if (!it || !it.feed) return '펫이 먹을 수 없는 아이템입니다.';
  if (!removeItem(item)) return '먹이가 없습니다.';
  p.bond = Math.min(100, p.bond + it.feed); p.fedAt = nowMs(); save();
  return null;
}
function setActivePet(i) {
  if (!(i >= -1 && i < state.pets.length)) return '없는 펫입니다.';
  if (i >= 0 && state.pets[i].exp) return '탐험 중인 펫은 동행할 수 없습니다.';
  state.petActive = i; save();
  return null;
}
/* ---- 펫 자동 탐험: 24시간 뒤 선택한 지상 구역의 재료를 가져온다 ---- */
const expLeft = p => p.exp ? Math.max(0, p.exp.at + PET_EXP_MS - nowMs()) : 0;
const expReady = p => !!p.exp && expLeft(p) === 0;
function sendExpedition(i, zoneId) {
  const p = state.pets[i], z = DANGER_ZONES.find(x => x.id === zoneId);
  if (!p) return '펫이 없습니다.';
  if (!z) return '갈 수 있는 구역이 아닙니다.';
  if (state.location !== '개인실') return '탐험 보내기는 개인실에서 할 수 있습니다.';
  if (p.exp) return '이미 탐험 중입니다.';
  if (state.petActive === i) return '동행 중인 펫은 먼저 동행을 해제하세요.';
  const bait = baitItems()[0];
  if (!bait) return '탐험을 떠나는 펫에게 줄 먹이(작물·펫 사료)가 필요합니다.';
  removeItem(bait);
  p.exp = { zone: zoneId, at: nowMs() }; p.fedAt = nowMs(); save();
  return null;
}
/* 탐험 결과 계산: 구역 지형들의 재료 풀에서 확률로 가져온다 */
function expeditionLoot(p) {
  const z = DANGER_ZONES.find(x => x.id === p.exp.zone), mats = [...new Set(z.terrains.flatMap(t => t.gather))], rares = [...new Set(z.terrains.map(t => t.rare))];
  const rolls = PET_EXP_ROLLS + Math.floor(p.bond / 34) + (PET_SPECIES[p.id].zone === z.id ? 1 : 0), bag = {};
  for (let i = 0; i < rolls; i++) {
    const r = Math.random(), name = r < PET_EXP_ODDS.common ? pick(mats) : r < PET_EXP_ODDS.common + PET_EXP_ODDS.rare ? pick(rares) : ZONE_SEEDS[z.id];
    bag[name] = (bag[name] || 0) + (r < PET_EXP_ODDS.common ? rand(1, 2) : 1);
  }
  return Object.entries(bag);
}
/* 귀환한 펫의 수확물을 받는다. { items, lost } / 사유 */
function claimExpedition(i) {
  const p = state.pets[i];
  if (!p || !p.exp) return '탐험 중인 펫이 아닙니다.';
  if (!expReady(p)) return '아직 돌아오지 않았습니다.';
  const items = expeditionLoot(p), lost = [];
  items.forEach(([n, q]) => { const g = addItem(n, q); if (g < q) lost.push([n, q - g]); });
  p.exp = null; p.bond = Math.min(100, p.bond + 2); save();
  return { items, lost };
}

/* ---------- 칭호 ---------- */
/* 지역의 걸을 수 있는 칸을 전부 밝혔는지 */
function zoneFullyLit(zid) {
  const z = DANGER_ZONES.find(x => x.id === zid), ex = state.explored && state.explored[zid]; if (!z || !ex) return false;
  return z.map.every((row, y) => [...row].every((c, x) => c === '#' || c === '.' || ex[`${x},${y}`]));
}
/* 조건을 채운 칭호를 얻는다. 새로 얻은 칭호 이름들 */
function checkTitles() {
  if (!state.created) return [];
  const got = TITLE_DEFS.filter(([n, , ok]) => !state.titles.includes(n) && ok()).map(t => t[0]);
  if (got.length) { state.titles.push(...got); save(); }
  return got;
}
function setTitle(name) {
  if (!state.titles.includes(name)) return '아직 얻지 못한 칭호입니다.';
  state.character.title = name; save();
  return null;
}

/* ---------- 친구 / 메일 ---------- */
const samplePlayer = n => NEARBY_PLAYERS.find(p => p[0] === n);
const REMOTE_PLAYERS = {}; // 서버 검색으로 찾은 대원 { 이름: '온라인' | '자리 비움' } (저장하지 않음)
/* 서버에서 온 아이템 목록 [[이름, 수량]]을 믿지 않고 걸러낸다 */
function cleanItemList(arr, max = 5) {
  const out = [], seen = new Set();
  for (const r of Array.isArray(arr) ? arr : []) {
    if (!Array.isArray(r) || typeof r[0] !== 'string' || !ITEMS[r[0]] || seen.has(r[0]) || r[0] === MAIL_SHIP_ITEM) continue;
    seen.add(r[0]); out.push([r[0], intIn(r[1], 1, 99, 1)]);
    if (out.length >= max) break;
  }
  return out;
}
/* 서버에서 받은 메일/교환 결과를 메일함에 넣는다 */
function receiveServerMail(from, subject, body, items) { pushMail(from, subject, body, cleanItemList(items)); save(); }
/* 서버에서 상대가 수락한 친구를 목록에 넣는다. 성공하면 null, 아니면 사유 */
function addFriendAccepted(name) {
  name = cleanText(name, 12);
  if (!name) return '이름이 올바르지 않습니다.';
  if (state.friends.includes(name)) return null;
  if (state.friends.length >= FRIEND_MAX) return `친구는 ${FRIEND_MAX}명까지 둘 수 있습니다.`;
  state.friends.push(name); save();
  return null;
}
/* 친구 추가. 온라인인 대원은 바로 수락하고, 자리 비움이면 응답이 없다. 성공하면 null, 아니면 사유 */
function addFriend(name) {
  name = cleanText(name, 12);
  if (!state.created) return '먼저 캐릭터를 만드세요.';
  const p = samplePlayer(name);
  if (!p) return '대원을 찾을 수 없습니다. (서버에 로그인하면 다른 대원을 찾아 친구 신청을 보낼 수 있어요)';
  if (state.friends.includes(name)) return '이미 친구입니다.';
  if (state.friends.length >= FRIEND_MAX) return `친구는 ${FRIEND_MAX}명까지 둘 수 있습니다.`;
  if (p && p[1] !== '온라인') return `${name} 대원은 자리 비움 상태라 응답이 없습니다.`;
  state.friends.push(name); save();
  return null;
}
function removeFriend(name) { state.friends = state.friends.filter(n => n !== name); save(); }
const mailDelivered = m => m.at <= nowMs();
const unreadMail = () => state.mail.filter(m => mailDelivered(m) && (!m.read || (m.items.length && !m.got))).length;
function pushMail(from, subject, body, items = [], at = nowMs()) {
  state.mail.unshift({ id: state.mailSeq++, from: cleanText(from, 12), subject: cleanText(subject, 30), body: cleanText(body, 300), items, at, kept: false, read: false, got: false });
  // 가득 차면 보존하지 않은 가장 오래된 메일부터 지운다
  while (state.mail.length > MAIL_BOX_MAX) { const i = [...state.mail].reverse().findIndex(m => !m.kept); if (i < 0) break; state.mail.splice(state.mail.length - 1 - i, 1); }
}
/* 15일이 지난(보존하지 않은) 메일을 지운다. 지운 수 */
function pruneMail() {
  const before = state.mail.length;
  state.mail = state.mail.filter(m => m.kept || nowMs() - m.at < MAIL_KEEP_DAYS * 86400000);
  if (state.mail.length !== before) save();
  return before - state.mail.length;
}
const mailDaysLeft = m => Math.max(0, Math.ceil((m.at + MAIL_KEEP_DAYS * 86400000 - nowMs()) / 86400000));
const keptCount = () => state.mail.filter(m => m.kept).length;
function toggleKeep(id) {
  const m = state.mail.find(x => x.id === id);
  if (!m) return '메일이 없습니다.';
  if (!m.kept && keptCount() >= MAIL_KEEP_MAX) return `보존 메일은 ${MAIL_KEEP_MAX}통까지입니다.`;
  m.kept = !m.kept; save();
  return null;
}
function deleteMail(id) { state.mail = state.mail.filter(m => m.id !== id); save(); }
/* 첨부 수령. { n } / 사유 */
function claimMail(id) {
  const m = state.mail.find(x => x.id === id);
  if (!m || !m.items.length) return '받을 첨부가 없습니다.';
  if (m.got) return '이미 받았습니다.';
  const lost = [];
  m.items.forEach(([n, q]) => { const g = addItem(n, q); if (g < q) { lost.push(n); if (g) removeItem(n, g); } });
  if (lost.length) { m.items.forEach(([n, q]) => { if (!lost.includes(n)) removeItem(n, q); }); return '가방에 빈 칸이 부족합니다. 비운 뒤 다시 받으세요.'; }
  m.got = true; save();
  return null;
}
/* 메일 보내기. items = [[이름, 수량]]. 첨부가 있으면 운송장치 1개가 든다. 받는 사람은 반드시 친구. 성공하면 null, 아니면 사유 */
function sendMail(to, subject, body, items = []) {
  to = cleanText(to, 12); subject = cleanText(subject, 30); body = cleanText(body, 300);
  if (!state.created) return '먼저 캐릭터를 만드세요.';
  if (!state.friends.includes(to)) return '받는 사람은 친구 목록에서 골라야 합니다.';
  if (!subject) return '제목을 입력하세요.';
  const list = [], seen = new Set(); sendMail.sent = [];
  for (const [n, q] of items) {
    if (!ITEMS[n] || seen.has(n) || n === MAIL_SHIP_ITEM) continue;
    seen.add(n); list.push([n, intIn(q, 1, 99, 1)]);
  }
  if (list.length > MAIL_ITEM_KINDS) return `첨부는 종류 ${MAIL_ITEM_KINDS}개까지입니다.`;
  if (list.reduce((a, r) => a + r[1], 0) > MAIL_ITEM_TOTAL) return `첨부는 합계 ${MAIL_ITEM_TOTAL}개까지입니다.`;
  if (list.some(([n, q]) => countItem(n) < q)) return '가지고 있는 수량보다 많이 담을 수 없습니다.';
  if (list.length && countItem(MAIL_SHIP_ITEM) < 1) return `아이템을 담아 보내려면 ${MAIL_SHIP_ITEM}(상점 구매)가 1개 필요합니다.`;
  if (list.length) { removeItem(MAIL_SHIP_ITEM, 1); list.forEach(([n, q]) => removeItem(n, q)); }
  sendMail.sent = list.map(r => r.slice()); // 실제로 가방에서 뺀 첨부 (중복·운송장치 제외 후)
  save();
  return null;
}

/* ---------- 길드 ---------- */
/* 길드 만들기. 성공하면 null, 아니면 사유 */
function createGuild(name) {
  name = cleanText(name, GUILD_NAME_MAX);
  if (!state.created) return '먼저 캐릭터를 만드세요.';
  if (state.guild) return '이미 길드에 속해 있습니다.';
  if (name.length < GUILD_NAME_MIN) return `길드 이름은 ${GUILD_NAME_MIN}~${GUILD_NAME_MAX}자로 입력하세요.`;
  state.guild = { name, master: true, members: [] };
  state.chats['길드'] = [['시스템', `길드 「${name}」을(를) 만들었습니다. 길드장은 다른 대원를 초대할 수 있어요.`]]; save();
  return null;
}
/* 초대(길드장만). 대원이 '온라인'이면 수락하고 '자리 비움'이면 응답이 없다. 성공하면 null, 아니면 사유 */
function inviteGuild(name) {
  const g = state.guild, p = NEARBY_PLAYERS.find(x => x[0] === name);
  if (!g) return '길드가 없습니다.';
  if (!g.master) return '길드장만 초대할 수 있습니다.';
  if (!p) return '초대할 수 없는 상대입니다.';
  if (g.members.includes(name)) return '이미 길드원입니다.';
  if (g.members.length + 1 >= GUILD_MAX) return `길드원은 최대 ${GUILD_MAX}명입니다.`;
  if (p[1] !== '온라인') return `${name}님이 응답하지 않았습니다. (자리 비움)`;
  g.members.push(name);
  state.chats['길드'].push(['시스템', `${name}님이 길드에 들어왔습니다.`]); save();
  return null;
}
function leaveGuild() { // 길드장이 나가면 길드는 해산된다
  if (!state.guild) return;
  state.guild = null;
  state.chats['길드'] = [['시스템', '길드 채널은 길드에 가입하거나 만든 뒤 사용할 수 있습니다.']]; save();
}

/* 길드 채널에 메시지가 도착했다 (서버가 연결되면 여기로 들어온다). 알림을 켜 두었을 때만 true를 돌려준다 */
function receiveGuildMessage(name, text) {
  if (!state.guild) return false;
  const list = state.chats['길드'];
  list.push([cleanText(name, 20), cleanText(text, 300)]);
  if (list.length > 100) list.splice(0, list.length - 100);
  save();
  return !!state.settings.guildAlert;
}

/* ---------- 주위 대원과 물건 교환 (하루 TRADE_DAILY회) ----------
   서버가 없어서 상대는 NEARBY_PLAYERS의 [이름, 상태, 내놓은 물건]으로만 존재한다. 서버가 붙으면 이 규칙을 서버에서 검사한다. */
const todayKey = () => { const d = new Date(nowMs()); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const tradesLeft = () => state.trades.day === todayKey() ? Math.max(0, TRADE_DAILY - state.trades.n) : TRADE_DAILY;
const playerOffers = p => (Array.isArray(p && p[2]) ? p[2] : []).filter(o => Array.isArray(o) && ITEMS[o[0]] && o[1] > 0);
/* 성공 null / 실패 사유. 내 아이템 give를 gq개 주고 상대의 want를 wq개 받는다 */
function tradeWith(name, give, gq, want, wq) {
  const p = NEARBY_PLAYERS.find(x => x[0] === name);
  if (!p) return '주위에 없는 대원입니다.';
  if (p[1] !== '온라인') return `${name}님은 지금 응답할 수 없습니다.`;
  if (!tradesLeft()) return `오늘은 교환을 모두 했습니다. (하루 ${TRADE_DAILY}회)`;
  gq = Math.floor(+gq); wq = Math.floor(+wq);
  if (!ITEMS[give] || !(gq > 0) || !ITEMS[want] || !(wq > 0)) return '교환할 물건과 수량을 확인하세요.';
  if (countItem(give) < gq) return `${give}이(가) 모자랍니다.`;
  const offer = playerOffers(p).find(o => o[0] === want);
  if (!offer || offer[1] < wq) return `${name}님이 내놓지 않은 물건입니다.`;
  removeItem(give, gq);
  const got = addItem(want, wq);
  if (got < wq) { if (got) removeItem(want, got); addItem(give, gq); return '가방에 자리가 없어 교환하지 못했습니다.'; } // 되돌린다
  state.trades = { day: todayKey(), n: (state.trades.day === todayKey() ? state.trades.n : 0) + 1 };
  save();
  return null;
}
