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
  quill: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.6 3.4C14.8 3.6 9.9 6.4 7.9 11.4c-.5 1.2-.7 2.5-.7 3.8L3 19.6 4.4 21l4.3-4.2c1.3 0 2.6-.2 3.8-.7 5-2 7.8-6.9 8.1-12.7z"/></svg>',
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
    const had = list.some(x => x && LEGACY_ITEMS[x.n]);
    s.inventory[tab] = list.map(x => x && LEGACY_ITEMS[x.n] ? { ...x, n: LEGACY_ITEMS[x.n] } : x).filter(x => x && ITEMS[x.n] && ITEMS[x.n].tab === tab && x.q > 0).map(cleanStackMk);
    if (had && tab !== '장비') s.inventory[tab] = mergeStacks(s.inventory[tab]); // 옛 이름이 같은 분류로 합쳐졌으면 칸도 합친다
  });
  hardenState(s);
  if (s.active && !ACTIONS[s.active.id]) s.active = null;
  if (s.pending && !ACTIONS[s.pending.id]) s.pending = null;
  if (s.pending && s.pending.result && Array.isArray(s.pending.result.items)) s.pending.result.items = s.pending.result.items.filter(r => Array.isArray(r)).map(r => [legacyName(r[0]), ...r.slice(1)]).filter(r => ITEMS[r[0]]);
  if (s.codex && s.codex.items && typeof s.codex.items === 'object') Object.keys(s.codex.items).forEach(n => { if (LEGACY_ITEMS[n]) { if (LEGACY_ITEMS[n] && ITEMS[LEGACY_ITEMS[n]]) s.codex.items[LEGACY_ITEMS[n]] = 1; delete s.codex.items[n]; } });
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
const CHAT_TABS = ['월드', '길드', '파티', 'RP', '알림']; // 알림 = 공지만 받는 읽기 전용
/* ROOM 저장 검증: 알 수 없는 가구·이상한 좌표/색/개수를 걸러낸다 (서버에서 받은 남의 방도 같은 함수로 거른다) */
function cleanRoom(r) {
  r = r && typeof r === 'object' ? r : {};
  const out = defaultRoom();
  Object.keys(ROOM_SKIN_KEY).forEach(cat => { const key = ROOM_SKIN_KEY[cat], f = furnDef(r[key]); if (f && f.cat === cat) out[key] = f.id; });
  const seen = new Set();
  (Array.isArray(r.items) ? r.items : []).forEach(it => {
    const f = it && furnDef(it.f); if (!f || f.skin || out.items.length >= ROOM_MAX) return;
    let u = intIn(it.u, 1, 9e6, 0); if (!u || seen.has(u)) { u = 1; while (seen.has(u)) u++; } seen.add(u);
    out.items.push({ u, f: f.id, x: intIn(it.x, -300, ROOM_W, 0), y: intIn(it.y, -300, ROOM_H, 0), flip: it.flip ? 1 : 0, c: typeof it.c === 'string' && /^#[0-9a-fA-F]{6}$/.test(it.c) ? it.c.toLowerCase() : '', z: intIn(it.z, 0, 1e6, 0) });
  });
  out.items.sort((a, b) => a.z - b.z).forEach((it, i) => { it.z = i + 1; }); // z 를 1..n 으로 다시 매긴다 (상대 순서 유지)
  out.zc = out.items.length;
  return out;
}
function petHungerOf(p) { // 저장 검증: 배부름 필드 (없던 옛 펫은 마지막 먹이 시각으로 계산)
  const t = Date.now();
  if (Number.isFinite(p.full) && Number.isFinite(p.fullAt)) return { full: clamp(p.full, 0, PET_FULL_MAX), fullAt: Math.min(p.fullAt, t), decayAt: Number.isFinite(p.decayAt) ? Math.min(p.decayAt, t) : t };
  const left = Number.isFinite(p.fedAt) ? PET_FED_MS - (t - p.fedAt) : 0;
  return { full: left > 0 ? Math.round(PET_FULL_MAX * left / PET_FED_MS) : 0, fullAt: t, decayAt: t };
}
function hardenState(s) {
  const c = s.character;
  c.name = cleanText(c.name, 12); c.title = TITLES.includes(c.title) ? c.title : TITLES[0];
  s.titles = [...new Set([TITLES[0], ...(Array.isArray(s.titles) ? s.titles : []).filter(t => TITLES.includes(t)), ...(TITLES.includes(c.title) ? [c.title] : [])])];
  c.age = intIn(c.age, AGE_MIN, AGE_MAX, 20); c.keywords = cleanText(c.keywords, 60);
  c.ability = cleanText(c.ability, 20); c.abilityDesc = cleanText(c.abilityDesc, 300);
  c.mainStat = STAT_DEFS.some(d => d.key === c.mainStat) ? c.mainStat : ''; c.subStat = STAT_DEFS.some(d => d.key === c.subStat) && c.subStat !== c.mainStat ? c.subStat : '';
  c.level = intIn(c.level, 1, s.flags && s.flags.cap35 === true ? MAX_LEVEL : LEVEL_CAP_BASE, 1); s.crEarned = intIn(s.crEarned, 0, 1e9, 0); s.crLast = intIn(s.crLast, 0, 1e12, 0); c.rank = 'FEDCBAS'.includes(c.rank) ? c.rank : 'F';
  c.allowFriend = c.allowFriend !== false; c.allowGuild = c.allowGuild !== false;
  s.unlockSeen = Object.fromEntries(Object.entries(s.unlockSeen && typeof s.unlockSeen === 'object' ? s.unlockSeen : {}).filter(([k, v]) => typeof k === 'string' && k.length < 30 && v === true));
  s.profileEditAt = intIn(s.profileEditAt, 0, 4e12, 0);
  s.room = cleanRoom(s.room);
  { const m = s.market && typeof s.market === 'object' ? s.market : {};
    s.market = {
      sell: (Array.isArray(m.sell) ? m.sell : []).map(r => r && LEGACY_ITEMS[r.item] ? { ...r, item: LEGACY_ITEMS[r.item] } : r).filter(r => r && ITEMS[r.item] && typeof r.key === 'string' && /^[\w-]{6,40}$/.test(r.key)).slice(0, MARKET_SLOTS).map(r => { const qty = intIn(r.qty, 1, 99, 1); return { key: r.key, id: intIn(r.id, 0, 9e15, 0), item: r.item, qty, price: intIn(r.price, 1, MARKET_TOTAL_MAX, 1), got: intIn(r.got, 0, qty, 0), ...(typeof r.mk === 'string' && cleanText(r.mk, MK_LEN) ? { mk: cleanText(r.mk, MK_LEN) } : {}) }; }),
      buy: (Array.isArray(m.buy) ? m.buy : []).map(r => r && LEGACY_ITEMS[r.item] ? { ...r, item: LEGACY_ITEMS[r.item] } : r).filter(r => r && ITEMS[r.item] && Number.isFinite(+r.id) && +r.id > 0 && typeof r.req === 'string' && /^[\w-]{6,40}$/.test(r.req)).slice(0, 10).map(r => ({ id: intIn(r.id, 1, 9e15, 1), req: r.req, item: r.item, qty: intIn(r.qty, 1, 99, 1), price: intIn(r.price, 1, 99 * MARKET_TOTAL_MAX, 1), ...(typeof r.mk === 'string' && cleanText(r.mk, MK_LEN) ? { mk: cleanText(r.mk, MK_LEN) } : {}) })),
    };
    s.mseen = (Array.isArray(s.mseen) ? s.mseen : []).filter(x => typeof x === 'string' && /^[sc]\d{1,16}$/.test(x)).slice(-60); }
  { const b = s.bench, items = b && typeof b === 'object' ? cleanItemList(b.items, 5) : []; s.bench = items.length && Number.isFinite(+b.id) && +b.id > 0 ? { id: intIn(b.id, 1, 9e15, 1), items } : null; s.ltSeen = (Array.isArray(s.ltSeen) ? s.ltSeen : []).map(x => intIn(x, 1, 9e15, 0)).filter(Boolean).slice(-20); }
  { const st = {}; let kinds = 0; if (s.storage && typeof s.storage === 'object') Object.keys(s.storage).forEach(n0 => { const n = LEGACY_ITEMS[n0] || n0, q = intIn(s.storage[n0], 0, STORAGE_STACK, 0); if (ITEMS[n] && q > 0 && (st[n] || kinds < STORAGE_KINDS)) { if (!st[n]) kinds++; st[n] = Math.min(STORAGE_STACK, (st[n] || 0) + q); } }); s.storage = st; }
  { const lz = s.leisure && typeof s.leisure === 'object' ? s.leisure : {}; s.leisure = { day: intIn(lz.day, -1, 1e7, -1), id: LEISURE_IDS.includes(lz.id) ? lz.id : '' }; }
  s.rescueAt = Object.fromEntries(Object.entries(s.rescueAt && typeof s.rescueAt === 'object' ? s.rescueAt : {}).filter(([k, v]) => DANGER_ZONES.some(z => z.id === k) && Number.isFinite(v)));
  if (s.dungeon) s.dungeon.rs = Object.fromEntries(Object.entries(s.dungeon.rs && typeof s.dungeon.rs === 'object' ? s.dungeon.rs : {}).filter(([k]) => /^-?\d{1,3},-?\d{1,3}$/.test(k)).map(([k]) => [k, 1]));
  s.deaths = intIn(s.deaths, 0, 99999, 0); s.lostCount = intIn(s.lostCount, 0, 999999, 0);
  { const m = s.trainMsg && typeof s.trainMsg === 'object' ? s.trainMsg : {}; s.trainMsg = { help: cleanText(m.help || '', DUEL_MSG_MAX), win: cleanText(m.win || '', DUEL_MSG_MAX), lose: cleanText(m.lose || '', DUEL_MSG_MAX) }; s.duelSeen = (Array.isArray(s.duelSeen) ? s.duelSeen : []).map(x => intIn(x, 1, 9e15, 0)).filter(Boolean).slice(-20); s.duelBets = cleanDuelBets(s.duelBets); }
  s.qact = Object.fromEntries(Object.entries(s.qact && typeof s.qact === 'object' ? s.qact : {}).filter(([k]) => QMARKS[k]).map(([k, v]) => [k, intIn(v, 0, 7, 0)]));
  s.lostBox = (Array.isArray(s.lostBox) ? s.lostBox : []).filter(x => x && ITEMS[legacyName(x.n)]).map(x => { const n = legacyName(x.n), mk = typeof x.mk === 'string' ? cleanText(x.mk, MK_LEN) : ''; return { n, q: intIn(x.q, 1, ITEMS[n].tab === '장비' ? 1 : STACK_MAX, 1), ...(mk ? { mk } : {}) }; }).slice(0, LOSTBOX_SLOTS);
  s.quick = Array.from({ length: QUICK_SLOTS }, (_, i) => { const n = Array.isArray(s.quick) ? s.quick[i] : null; return typeof n === 'string' && ITEMS[n] && ITEMS[n].use ? n : null; }); s.quickOpen = s.quickOpen === true;
  if (s.settings && typeof s.settings.quickBar !== 'boolean') s.settings.quickBar = true;
  if (s.settings && typeof s.settings.duelFx !== 'boolean') s.settings.duelFx = true;
  { const b = s.petBowl && typeof s.petBowl === 'object' ? s.petBowl : {}; let left = PET_BOWL_MAX; s.petBowl = {}; Object.entries(b).forEach(([n, q]) => { const k = intIn(q, 0, left, 0); if (ITEMS[n] && ITEMS[n].feed && k > 0) { s.petBowl[n] = k; left -= k; } }); } s.mailItemSent = intIn(s.mailItemSent, 0, 999999, 0);
  s.statPeak = Object.fromEntries(STAT_DEFS.map(d => [d.key, intIn((s.statPeak || {})[d.key], 0, 9999, 0)]));
  s.tickets = intIn(s.tickets, 0, 9999, 0); s.questCount = intIn(s.questCount, 0, 999999, 0); s.actMs = Number.isFinite(s.actMs) ? clamp(s.actMs, 0, 1e12) : 0;
  { const g = s.gacha && typeof s.gacha === 'object' ? s.gacha : {}; s.gacha = { pat: intIn(g.pat, 0, GACHA_SETS.length - 1, 0), pulls: intIn(g.pulls, 0, 999999, 0), wins: intIn(g.wins, 0, 999999, 0) }; }
  s.money = intIn(s.money, 0, 999999999, 0); s.statPoints = intIn(s.statPoints, 0, 99, 0);
  STAT_DEFS.forEach(d => { s.stats[d.key] = intIn(s.stats[d.key], 0, 99, STAT_BASE); });
  s.enchants = Object.fromEntries(Object.entries(s.enchants && typeof s.enchants === 'object' ? s.enchants : {}).filter(([k, e]) => ITEMS[k] && ITEMS[k].tab === '장비' && e && (e.k === 'hp' || e.k === 'sp' || STAT_DEFS.some(d => d.key === e.k))).map(([k, e]) => [k, { k: e.k, v: intIn(e.v, 1, e.k === 'hp' || e.k === 'sp' ? 30 : 5, 1), n: intIn(e.n, 1, 9999, 1) }]));
  s.reinforce = Object.fromEntries(Object.entries(s.reinforce && typeof s.reinforce === 'object' ? s.reinforce : {}).filter(([k]) => ITEMS[k] && ITEMS[k].slot === '무기').map(([k, v]) => [k, intIn(v, 0, REINFORCE_RANKS.length - 1, 0)]).filter(([, v]) => v > 0));
  s.nicks = Object.fromEntries(Object.entries(s.nicks && typeof s.nicks === 'object' ? s.nicks : {}).filter(([k, v]) => ITEMS[k] && ITEMS[k].slot === '무기' && s.reinforce[k] >= REINFORCE_RANKS.length - 1 && typeof v === 'string').map(([k, v]) => [k, cleanText(v, NICK_MAX)]).filter(([, v]) => v));
  s.fishBest = Object.fromEntries(Object.entries(s.fishBest && typeof s.fishBest === 'object' ? s.fishBest : {}).filter(([k, v]) => FISH_SIZE[k] && Number.isFinite(v) && v > 0).map(([k, v]) => [k, Math.min(300, Math.round(v * 10) / 10)]));
  s.flags = { ...(s.flags && typeof s.flags === 'object' ? s.flags : {}), lostFound: !!(s.flags && s.flags.lostFound), annoA: s.flags && (s.flags.annoA === 'pending' || s.flags.annoA === 'done') ? s.flags.annoA : '', annoMax: s.flags && (s.flags.annoMax === 'pending' || s.flags.annoMax === 'done') ? s.flags.annoMax : '' };
  if (s.dungeon) s.dungeon.tf = Object.fromEntries(Object.entries(s.dungeon.tf && typeof s.dungeon.tf === 'object' ? s.dungeon.tf : {}).filter(([k, v]) => /^-?\d{1,3},-?\d{1,3}$/.test(k) && Number.isFinite(v)).map(([k, v]) => [k, intIn(v, 0, TAME_FAIL_MAX, 0)]));
  const v = s.vitals, mb = maxBonus(s.equipment, s.enchants);
  v.hpMax = 100 + mb.hp; v.spMax = 100 + mb.sp; v.hp = intIn(v.hp, 1, v.hpMax, v.hpMax); v.sp = intIn(v.sp, 0, v.spMax, v.spMax); v.exp = intIn(v.exp, 0, 999999, 0);
  s.settings.bgmVolume = intIn(s.settings.bgmVolume, 0, 100, BGM_DEFAULT_VOLUME); s.settings.sfxVolume = intIn(s.settings.sfxVolume, 0, 100, 65);
  s.settings.customAccent = /^#[0-9a-f]{6}$/i.test(s.settings.customAccent) ? s.settings.customAccent : '#197da1';
  if (!(s.settings.fontSize in FONT_SCALES)) s.settings.fontSize = 'm';
  if (!['light', 'dark', 'custom'].includes(s.settings.theme)) s.settings.theme = 'light';
  if (!['light', 'dark'].includes(s.settings.customBase)) s.settings.customBase = 'light';
  s.settings.guildAlert = s.settings.guildAlert !== false;
  { const ct = s.settings.chatTabs && typeof s.settings.chatTabs === 'object' ? s.settings.chatTabs : {}; const o = Object.fromEntries(CHAT_TABS.map(k => [k, ct[k] !== false])); s.settings.chatTabs = CHAT_TABS.some(k => o[k]) ? o : Object.fromEntries(CHAT_TABS.map(k => [k, true])); }
  s.follow = s.follow === true; s.partyMove = s.partyMove === true;
  s.lounge = Object.fromEntries(Object.entries(s.lounge && typeof s.lounge === 'object' ? s.lounge : {}).filter(([k]) => QMARKS[k]).map(([k, v]) => [k, intIn(v, 0, 9999, 0)]));
  ['장비', '소모품', '재료'].forEach(t => (s.inventory[t] || []).forEach(cleanStackMk)); // 제작자 표 검증 (합계 ≤ 수량)
  { // 옛 제작자 표시(이름마다 하나)는 지금 가진 그 이름의 물건(이름 없는 것)·착용 중인 장비·창고에 그대로 붙이고 지운다
    const old = Object.fromEntries(Object.entries(s.madeBy && typeof s.madeBy === 'object' ? s.madeBy : {}).filter(([k, v]) => ITEMS[k] && typeof v === 'string' && v).map(([k, v]) => [k, cleanText(v, MK_LEN)]));
    s.equipMk = Object.fromEntries(Object.entries(s.equipMk && typeof s.equipMk === 'object' ? s.equipMk : {}).filter(([sl, v]) => s.equipment[sl] && typeof v === 'string' && v).map(([sl, v]) => [sl, cleanText(v, MK_LEN)]));
    Object.entries(old).forEach(([n, lb]) => {
      if (!lb) return;
      (s.inventory[ITEMS[n].tab] || []).forEach(x => { if (x.n !== n) return; const free = x.q - mkSum(x); if (free > 0) { x.mk = x.mk || {}; x.mk[lb] = (x.mk[lb] || 0) + free; } });
      Object.entries(s.equipment).forEach(([sl, en]) => { if (en === n && !s.equipMk[sl]) s.equipMk[sl] = lb; });
      const sq = s.storage && s.storage[n] | 0; if (sq > 0) { s.storageMk = s.storageMk && typeof s.storageMk === 'object' ? s.storageMk : {}; const cur = s.storageMk[n] || {}; const free = sq - Object.values(cur).reduce((a, b) => a + (b | 0), 0); if (free > 0) { cur[lb] = (cur[lb] || 0) + free; s.storageMk[n] = cur; } }
    });
    s.madeBy = {};
    const sm = s.storageMk && typeof s.storageMk === 'object' ? s.storageMk : {}; s.storageMk = {};
    Object.entries(sm).forEach(([n, t]) => { const cap = s.storage && s.storage[n] | 0; if (!cap || !t || typeof t !== 'object') return; const o = {}; let left = cap; Object.entries(t).forEach(([k, v]) => { const lb = cleanText(k, MK_LEN), c = Math.min(intIn(v, 0, STORAGE_STACK, 0), left); if (lb && c > 0) { o[lb] = (o[lb] || 0) + c; left -= c; } }); if (Object.keys(o).length) s.storageMk[n] = o; });
  }
  s.journals = Object.fromEntries(Object.entries(s.journals && typeof s.journals === 'object' ? s.journals : {}).filter(([k, v]) => QMARKS[k] && v).map(([k]) => [k, 1]));
  if (s.side === '주위 대원') s.side = '상황'; // 탭 이름이 바뀌었다
  if (!['임무', '서브잡', '펫', '상황'].includes(s.side)) s.side = '임무';
  { const m = {}; TAG_NAMES.forEach(t => { const v = s.mastery && s.mastery[t]; if (Number.isFinite(v) && v > 0) m[t] = Math.min(MASTERY_TOTAL, Math.floor(v)); }); s.mastery = m; }
  s.engraves = Object.fromEntries(Object.entries(s.engraves && typeof s.engraves === 'object' ? s.engraves : {}).filter(([k, v]) => ITEMS[k] && ITEMS[k].engrave && typeof v === 'string').map(([k, v]) => [k, cleanText(v, ENGRAVE_MAX)]).filter(([, v]) => v));
  s.todos = (Array.isArray(s.todos) ? s.todos : []).filter(t => t && typeof t.t === 'string' && cleanText(t.t, TODO_LEN)).slice(0, TODO_MAX).map(t => ({ id: intIn(t.id, 1, 1e9, 1), t: cleanText(t.t, TODO_LEN), done: t.done === true }));
  { const seen = new Set(); s.todos.forEach(t => { while (seen.has(t.id)) t.id++; seen.add(t.id); }); s.todoSeq = intIn(s.todoSeq, 0, 1e9, 0); s.todoSeq = Math.max(s.todoSeq, ...s.todos.map(t => t.id), 0); }
  s.sitOpen = { near: !(s.sitOpen && s.sitOpen.near === false), todo: !(s.sitOpen && s.sitOpen.todo === false), party: !(s.sitOpen && s.sitOpen.party === false) };
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
  s.chats = chats; if (!CHAT_TABS.includes(s.chatTab) || !s.settings.chatTabs[s.chatTab]) s.chatTab = CHAT_TABS.find(k => s.settings.chatTabs[k]);
  const known = id => QUESTS.some(q => q.id === String(id).split('#')[0]); // 'id#0' 같은 조건별 진행도 키도 인정한다(승급 시험 처치 현황이 불러올 때마다 지워지던 원인)
  s.questTaken = Object.fromEntries(Object.keys(s.questTaken || {}).filter(known).map(k => [k, true]));
  s.qprog = Object.fromEntries(Object.keys(s.qprog || {}).filter(known).map(k => [k, intIn(s.qprog[k], 0, 999, 0)]));
  s.questAt = Object.fromEntries(Object.entries(s.questAt && typeof s.questAt === 'object' ? s.questAt : {}).filter(([k, v]) => known(k) && Number.isFinite(v)));
  const fp = Array.isArray(s.farm && s.farm.plots) ? s.farm.plots : [];
  s.farm = { plots: Array.from({ length: 6 }, (_, i) => { const p = fp[i]; return p && CROPS[p.crop] && Number.isFinite(p.at) ? { crop: p.crop, at: p.at, ...(p.told ? { told: true } : {}) } : null; }) }; // told: 다 자랐다고 이미 알림
  s.pets = (Array.isArray(s.pets) ? s.pets : []).filter(p => p && PET_SPECIES[p.id]).map(p => ({ id: p.id, lv: intIn(p.lv, 1, PET_MAX_LV, 1), pxp: intIn(p.pxp, 0, 99999, 0), acc: PET_ACC[p.acc] ? p.acc : '', bond: intIn(p.bond, 0, 100, PET_BOND_START), fedAt: Number.isFinite(p.fedAt) ? p.fedAt : 0, ...petHungerOf(p), petAt: Number.isFinite(p.petAt) ? p.petAt : 0, name: cleanText(p.name, PET_NAME_MAX), pers: PET_PERS[p.pers] ? p.pers : pick(PET_PERS_LIST), exp: p.exp && DANGER_ZONES.some(z => z.id === p.exp.zone) && Number.isFinite(p.exp.at) ? { zone: p.exp.zone, at: p.exp.at, ms: Number.isFinite(p.exp.ms) ? clamp(p.exp.ms, 3600000, PET_EXP_MS) : PET_EXP_MS } : null }))
    .filter((p, i, a) => a.findIndex(q => q.id === p.id) === i).slice(0, Object.keys(PET_SPECIES).length);
  if (s.pets[s.petActive] && s.pets[s.petActive].exp) s.petActive = -1;
  s.petActive = intIn(s.petActive, -1, s.pets.length - 1, -1);
  const jb = s.subjob;
  s.subjob = jb && typeof jb === 'object' && Array.isArray(jb.tags) && jb.tags.some(t => TAG_NAMES.includes(t))
    ? { name: cleanText(jb.name, JOB_NAME_MAX) || jb.tags.find(t => TAG_NAMES.includes(t)), tags: [...new Set(jb.tags.filter(t => TAG_NAMES.includes(t)))].slice(0, JOB_TAG_MAX), level: intIn(jb.level, 1, JOB_MAX_LV, 1), prog: intIn(jb.prog, 0, 99, 0), lastAt: Number.isFinite(jb.lastAt) ? jb.lastAt : 0 } : null;
  s.friends = [...new Set((Array.isArray(s.friends) ? s.friends : []).map(n => cleanText(n, 12)).filter(Boolean))].slice(0, FRIEND_MAX);
  s.mailSeq = intIn(s.mailSeq, 1, 999999999, 1);
  const okItems = it => (Array.isArray(it) ? it : []).filter(r => Array.isArray(r)).map(r => [legacyName(r[0]), ...r.slice(1)]).filter(r => ITEMS[r[0]]).map(r => ilRow(r[0], intIn(r[1], 1, 99, 1), typeof r[2] === 'string' ? cleanText(r[2], MK_LEN) : '')).slice(0, MAIL_ITEM_KINDS);
  s.mail = (Array.isArray(s.mail) ? s.mail : []).filter(m => m && Number.isFinite(m.at)).map(m => ({ id: intIn(m.id, 1, 999999999, 1), from: cleanText(m.from, 12), subject: cleanText(m.subject, 30), body: cleanText(m.body, 300),
    items: okItems(m.items), at: m.at, kept: m.kept === true, read: m.read === true, got: m.got === true, sid: typeof m.sid === 'string' ? m.sid.replace(/[^\w-]/g, '').slice(0, 24) : '' })).slice(0, MAIL_BOX_MAX);
  s.results = (Array.isArray(s.results) ? s.results : []).filter(r => r && typeof r.text === 'string').slice(0, RESULT_KEEP).map(r => ({ t: cleanText(r.t, 30), text: cleanText(r.text, 300), at: Number.isFinite(r.at) ? r.at : 0,
    gain: (Array.isArray(r.gain) ? r.gain : []).slice(0, 12).map(c => cleanText(c, 40)).filter(Boolean), loss: (Array.isArray(r.loss) ? r.loss : []).slice(0, 8).map(c => cleanText(c, 40)).filter(Boolean) }));
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
  s.logs = (Array.isArray(s.logs) ? s.logs : []).filter(l => l && typeof l.text === 'string').map(l => ({ time: cleanText(l.time, 10), text: cleanText(l.text, 400) })).slice(0, 60);
  if (s.crafting && (!RECIPES[s.crafting.index] || !Number.isFinite(s.crafting.endAt))) s.crafting = null;
  if (s.crafting) { s.crafting.out = RECIPES[s.crafting.index].out; s.crafting.qty = intIn(s.crafting.qty, 1, MAX_BATCH, 1); s.crafting.great = !!s.crafting.great; s.crafting.ready = !!s.crafting.ready; s.crafting.used = (Array.isArray(s.crafting.used) ? s.crafting.used : []).map(u => Array.isArray(u) && LEGACY_ITEMS[u[0]] ? [LEGACY_ITEMS[u[0]], u[1]] : u).filter(u => Array.isArray(u) && ITEMS[u[0]]).map(u => typeof u[2] === 'string' && cleanText(u[2], MK_LEN) ? [u[0], intIn(u[1], 1, 9999, 1), cleanText(u[2], MK_LEN)] : [u[0], intIn(u[1], 1, 9999, 1)]).slice(0, 24); }
  if (!['장비', '소모품', '약', '기타'].includes(s.craftTab)) s.craftTab = null; if (!(typeof s.craftTag === 'string' && (TAG_NAMES.includes(s.craftTag) || s.craftTag === '태그 없음'))) s.craftTag = null; // 제작 탭: 분류(craftTab) + 태그(craftTag) 둘 다 맞는 것만
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
  } catch (e) { // 읽다가 실패해도 원본은 지우지 않는다: 백업 키에 따로 보관하고 콘솔에 남긴다
    try { const raw = localStorage.getItem(SAVE_KEY); if (raw && !localStorage.getItem(SAVE_KEY + '-backup')) localStorage.setItem(SAVE_KEY + '-backup', raw); } catch (e2) { /* 저장 불가 환경 */ }
    window.__loadError = String(e && e.message || e); console.error('저장 데이터를 읽지 못했습니다:', e);
  }
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
const bagCapacityFor = eq => ((eq['가방'] && ITEMS[eq['가방']].capacity) || BASE_BAG_CAPACITY) + exerciseSlots();
function exerciseSlots() { return Math.max(0, masteryInfo('운동').lv - 1); } // 운동 숙련 레벨이 1 오를 때마다 소지품 1칸 (Lv.1 = +0)
const bagCapacity = () => bagCapacityFor(state.equipment);
/* 제작자 표시: 한 칸(스택) 안에서 제작자별 개수를 따로 센다. 스택 { n, q, mk?: { '초보 요리사 미나': 2 } } — mk에 없는 나머지(q - 합계)는 이름 없는 것.
   mk 인자: undefined = 가리지 않음(자동: 이름 없는 것 먼저 쓴다), '' = 이름 없는 것만, '문자열' = 그 제작자 것만 */
function mkSum(s) { return s.mk ? Object.values(s.mk).reduce((a, b) => a + b, 0) : 0; } // (function 선언: 불러오기 검증(hardenState)에서도 쓴다 — const 는 TDZ)
function mkHave(s, mk) { return mk === '' ? s.q - mkSum(s) : (s.mk && s.mk[mk]) | 0; }
const countItem = (name, mk) => !ITEMS[name] ? 0 : state.inventory[ITEMS[name].tab].filter(s => s.n === name).reduce((a, s) => a + (mk === undefined ? s.q : mkHave(s, mk)), 0);
function itemVariants(name, inv = state.inventory) { // [{ mk, q }] 이름 없는 것('')이 먼저, 그다음 제작자 이름순
  const it = ITEMS[name]; if (!it) return [];
  const m = {}; inv[it.tab].filter(s => s.n === name).forEach(s => { const free = s.q - mkSum(s); if (free > 0) m[''] = (m[''] || 0) + free; Object.entries(s.mk || {}).forEach(([k, v]) => { if (v > 0) m[k] = (m[k] || 0) + v; }); });
  return Object.entries(m).sort((a, b) => (a[0] === '' ? -1 : b[0] === '' ? 1 : a[0].localeCompare(b[0]))).map(([mk, q]) => ({ mk, q }));
}
function legacyName(n) { return typeof n === 'string' && LEGACY_ITEMS[n] ? LEGACY_ITEMS[n] : n; } // 옛 아이템 이름 → 지금 이름 (hardenState에서 쓰므로 function 선언)
function mergeStacks(list) { // 같은 이름 칸을 STACK_MAX 까지 합친다 (제작자 표도 함께)
  const out = [];
  list.forEach(x => {
    let q = x.q, mk = x.mk ? { ...x.mk } : null;
    for (const y of out) {
      if (y.n !== x.n || y.q >= STACK_MAX || q <= 0) continue;
      const a = Math.min(q, STACK_MAX - y.q); y.q += a; q -= a;
      if (mk) { let m = a; for (const k of Object.keys(mk)) { if (m <= 0) break; const c = Math.min(mk[k], m); y.mk = y.mk || {}; y.mk[k] = (y.mk[k] || 0) + c; mk[k] -= c; m -= c; if (!mk[k]) delete mk[k]; } }
    }
    if (q > 0) out.push({ n: x.n, q, ...(mk && Object.keys(mk).length ? { mk } : {}) });
  });
  return out.map(cleanStackMk);
}
function cleanStackMk(x) { // 저장 검증: 스택의 제작자 표 (합계가 q를 넘지 않게)
  if (!x.mk || typeof x.mk !== 'object') { delete x.mk; return x; }
  const out = {}; let left = x.q;
  Object.entries(x.mk).forEach(([k, v]) => { const n = cleanText(k, MK_LEN), c = Math.min(intIn(v, 0, 999999, 0), left); if (n && c > 0) { out[n] = (out[n] || 0) + c; left -= c; } });
  if (Object.keys(out).length) x.mk = out; else delete x.mk;
  return x;
}

/* 가방 칸은 장비/소모품/재료 전체가 공유한다 */
const usedSlots = (inv = state.inventory) => Object.values(inv).reduce((a, l) => a + l.length, 0);

/* 담을 수 있는 수량을 계산해 담는다. 담은 수량을 반환 */
function addItem(name, qty = 1, mk = '') {
  const it = ITEMS[name], list = state.inventory[it.tab], stackable = it.tab !== '장비';
  mk = mk ? cleanText(mk, MK_LEN) : '';
  const tag = (s, a) => { if (mk && a > 0) { s.mk = s.mk || {}; s.mk[mk] = (s.mk[mk] || 0) + a; } };
  let left = qty;
  if (stackable) {
    for (const s of list) {
      if (s.n !== name || s.q >= STACK_MAX) continue;
      const a = Math.min(left, STACK_MAX - s.q); s.q += a; left -= a; tag(s, a); // 제작자가 달라도 같은 칸을 쓴다
    }
  }
  while (left > 0 && usedSlots() < bagCapacity()) {
    const a = stackable ? Math.min(left, STACK_MAX) : 1, s = { n: name, q: a };
    tag(s, a); list.push(s); left -= a;
  }
  if (qty - left) discover('items', name);
  return qty - left;
}
function canAdd(name) {
  const it = ITEMS[name], list = state.inventory[it.tab];
  return usedSlots() < bagCapacity() || (it.tab !== '장비' && list.some(s => s.n === name && s.q < STACK_MAX));
}
/* 꺼내기: 실제로 꺼낸 [[제작자('' = 없음), 개수], ...]. mk 를 안 주면 이름 없는 것부터, 그다음 제작자 것 */
function takeItem(name, qty = 1, mk) {
  const list = state.inventory[ITEMS[name].tab], out = [];
  let left = qty;
  const passes = mk !== undefined ? [mk] : ['', ...itemVariants(name).map(v => v.mk).filter(Boolean)];
  for (const p of passes) {
    let got = 0;
    for (let i = list.length - 1; i >= 0 && left > 0; i--) {
      const s = list[i]; if (s.n !== name) continue;
      const a = Math.min(left, mkHave(s, p)); if (a <= 0) continue;
      s.q -= a; left -= a; got += a;
      if (p) { s.mk[p] -= a; if (!s.mk[p]) delete s.mk[p]; if (!Object.keys(s.mk).length) delete s.mk; }
      if (!s.q) list.splice(i, 1);
    }
    if (got) out.push([p, got]);
    if (left <= 0) break;
  }
  return out;
}
function removeItem(name, qty = 1, mk) { return takeItem(name, qty, mk).reduce((a, r) => a + r[1], 0); }
function relabelItem(name, qty, to) { // 방금 담은 이름 없는 것 qty개에 제작자 표시를 붙인다 (제작 완료)
  const list = state.inventory[ITEMS[name].tab]; let left = qty; to = cleanText(to, MK_LEN); if (!to) return;
  for (let i = list.length - 1; i >= 0 && left > 0; i--) { const s = list[i]; if (s.n !== name) continue; const a = Math.min(left, mkHave(s, '')); if (a <= 0) continue; s.mk = s.mk || {}; s.mk[to] = (s.mk[to] || 0) + a; left -= a; }
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
const enchantables = () => [...new Set([...Object.values(state.equipment).filter(Boolean), ...state.inventory['장비'].map(s => s.n)])].filter(n => ITEMS[n] && ITEMS[n].tab === '장비' && !ITEMS[n].petAcc);
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
  const ok = rnd() < Math.min(.95, REINFORCE_RATE[lv] + effects().reinforce); // 행운 보정
  if (ok) state.reinforce[name] = lv + 1;
  save();
  return { ok, lv: ok ? lv + 1 : lv };
}
/* A랭까지 강화한 무기에는 이름을 붙일 수 있다 */
/* ---------- 분해: 소지품의 장비(가방 포함)를 재료 + 소정의 CR로 ---------- */
const DISMANTLE_BACK = .5, DISMANTLE_CR = .25; // 레시피 재료의 절반(내림, 최소 1종 1개) / 판매가의 1/4 CR
function dismantleYield(name) { // { mats:[[이름,수량]], cr } 또는 null(분해 불가)
  const it = ITEMS[name];
  if (!it || it.tab !== '장비' || it.hidden || it.hold || it.petAcc) return null; // 소지만으로 효과가 있는 물건(반지)은 분해하지 않는다
  const rc = RECIPES.find(r => r.out === name), bag = {};
  if (rc) {
    Object.entries(rc.mats).forEach(([k, q]) => { const n = MAT_GROUPS[k] ? MAT_GROUPS[k][0] : k, g = Math.floor(q * DISMANTLE_BACK); if (g > 0 && ITEMS[n]) bag[n] = (bag[n] || 0) + g; });
    if (!Object.keys(bag).length) { const [k] = Object.entries(rc.mats).sort((a, b) => b[1] - a[1])[0], n = MAT_GROUPS[k] ? MAT_GROUPS[k][0] : k; if (ITEMS[n]) bag[n] = 1; }
  }
  if (!Object.keys(bag).length) { // 레시피가 없는 장비(승급 보상 가방 등): 크기·종류에 맞춰 기본 재료
    if (it.capacity) { bag['생체 섬유'] = Math.max(1, Math.round(it.capacity / 10)); bag['합금 파편'] = Math.max(1, Math.round(it.capacity / 16)); }
    else { bag['합금 파편'] = 1; bag['생체 섬유'] = 1; }
  }
  return { mats: Object.entries(bag).filter(([n]) => ITEMS[n]), cr: Math.max(2, Math.round((it.sell || 10) * DISMANTLE_CR)) };
}
function discardItem(name, qty = 1, mk) { // 소지품 버리기: 성공하면 { qty }, 실패하면 사유 문자열 (착용 중인 장비는 소지품이 아니라서 버려지지 않는다)
  if (!state.created) return '먼저 캐릭터를 만드세요.';
  if (!ITEMS[name]) return '알 수 없는 아이템입니다.';
  const have = countItem(name, mk); if (have < 1) return '소지품에 그 물건이 없습니다.';
  qty = Math.min(intIn(qty, 1, 9999, 1), have);
  removeItem(name, qty, mk);
  if (ITEMS[name].tab === '장비' && !state.inventory['장비'].some(s => s.n === name) && !Object.values(state.equipment).includes(name) && !(state.storage[name] > 0)) { // 마지막 한 개면 그 이름의 강화·세공·이름도 함께 사라진다
    delete state.enchants[name]; delete state.reinforce[name]; delete state.nicks[name]; delete state.engraves[name];
  }
  syncMax(); save();
  return { qty };
}
const dismantlable = () => { const seen = {}; state.inventory['장비'].forEach(s => { if (dismantleYield(s.n)) seen[s.n] = (seen[s.n] || 0) + 1; }); return Object.entries(seen); };
function dismantleItem(name, qty = 1) { // 성공하면 { mats, cr, qty }, 실패하면 사유 문자열
  if (!state.created) return '먼저 캐릭터를 만드세요.';
  if (placeKey() !== '본부') return '분해는 본부에서만 할 수 있습니다.';
  const y = dismantleYield(name);
  if (!y) return '분해할 수 없는 장비입니다.';
  const have = state.inventory['장비'].filter(s => s.n === name).length;
  if (!have) return '소지품에 그 장비가 없습니다. (착용 중인 장비는 먼저 벗어야 합니다)';
  qty = Math.min(intIn(qty, 1, 99, 1), have);
  const snap = JSON.stringify(state.inventory), got = {};
  removeItem(name, qty);
  for (const [n, q] of y.mats) { const want = q * qty, g = addItem(n, want); if (g < want) { state.inventory = JSON.parse(snap); return '가방 공간이 부족해 재료를 모두 담을 수 없습니다. 가방을 비워 주세요.'; } got[n] = want; }
  state.money += y.cr * qty;
  if (!state.inventory['장비'].some(s => s.n === name) && !Object.values(state.equipment).includes(name)) { // 마지막 한 개면 그 이름의 강화·세공·이름도 함께 사라진다
    delete state.enchants[name]; delete state.reinforce[name]; delete state.nicks[name]; delete state.engraves[name];
  }
  syncMax(); save();
  return { mats: Object.entries(got), cr: y.cr * qty, qty };
}
/* ---------- 숙련 ---------- */
function masteryInfo(tag) { // { lv, cur, need } (만렙이면 need 0)
  let xp = (state.mastery && state.mastery[tag]) | 0, lv = 1;
  while (lv < MASTERY_MAX && xp >= MASTERY_NEED(lv)) { xp -= MASTERY_NEED(lv); lv++; }
  return lv >= MASTERY_MAX ? { lv, cur: 0, need: 0 } : { lv, cur: xp, need: MASTERY_NEED(lv) };
}
const masteryLv = tag => masteryInfo(tag).lv;
function addMastery(tag, n) { // 오른 레벨(안 올랐으면 0)
  if (!TAG_NAMES.includes(tag) || !(n > 0)) return 0;
  const before = masteryLv(tag);
  state.mastery[tag] = Math.min(MASTERY_TOTAL, (state.mastery[tag] | 0) + Math.floor(n));
  const now = masteryLv(tag); return now > before ? now : 0;
}
function masteryBonus(tag) { // 숙련이 주는 보너스 { gather, craftTime, farmTime, farmYield, heal } (해당 없는 건 0)
  const lv = masteryLv(tag) - 1, b = { gather: 0, craftTime: 0, farmTime: 0, farmYield: 0, heal: 0, atk: 0 };
  if (GATHER_KINDS[tag]) b.gather = lv * .006;                       // 수확 +1개 확률 (최대 17.4%)
  else if (MASTERY_CRAFT_TAGS.includes(tag)) b.craftTime = lv * .005; // 제작 시간 단축 (최대 14.5%)
  else if (tag === '농사') { b.farmTime = lv * .005; b.farmYield = lv * .01; }
  else if (MASTERY_HEAL_TAGS.includes(tag)) b.heal = lv * .01;      // 음식·약 회복량 (최대 29%)
  else if (tag === '운동') b.atk = lv * .005;                         // 사냥 공격력 (최대 14.5%)
  return b;
}
function masteryText(tag) { // 마우스를 올렸을 때 보이는 보너스 설명
  const b = masteryBonus(tag), p = n => `${Math.round(n * 1000) / 10}%`;
  if (GATHER_KINDS[tag]) return `${tag}할 때 수확 +1개 확률 ${p(b.gather)} (레벨당 +0.6%)`;
  if (MASTERY_CRAFT_TAGS.includes(tag)) return `${tag} 물건의 제작 시간 -${p(b.craftTime)} (레벨당 -0.5%)`;
  if (tag === '농사') return `작물 성장 시간 -${p(b.farmTime)} · 수확 +1개 확률 ${p(b.farmYield)} (레벨당 -0.5% / +1%)`;
  if (tag === '운동') return `사냥 공격력 +${p(b.atk)} (레벨당 +0.5%) · 사냥에서 이길 때마다 오른다`;
  return `${tag} 음식·약의 회복량 +${p(b.heal)} (레벨당 +1%)`;
}
/* 투두리스트 (상황 탭): 직접 쓰고 체크하고 지운다 ---------- */
/* ---------- 실시간 교환 (교환대) ----------
   올린 물건은 내 기기에서 먼저 빼 두고(state.bench) 서버에는 올린 목록만 둔다. 늘릴 때는 '내 기기에서 빼기 → 서버 반영', 줄일 때는 '서버 반영 → 돌려받기' 순서라
   어느 순간에도 서버 목록 ⊆ 내 기록이 되어 물건이 복사되거나 사라지지 않는다. 마감(성사/취소) 때 settleLive 가 한 번에 정리한다. */
const benchList = () => (state.bench ? state.bench.items : []);
const benchQty = (n, mk = '') => (benchList().find(r => ilKey(r) === ilKey([n, 0, mk])) || [0, 0])[1];
function benchNext(name, delta, mk = '') { // (이름, 제작자) 줄의 수량을 delta 만큼 바꾼 새 목록 (불가능하면 null)
  const k = ilKey([name, 0, mk]), cur = benchList().map(r => r.slice()), r = cur.find(x => ilKey(x) === k), q = (r ? r[1] : 0) + delta;
  if (q < 0 || q > 99 || !ITEMS[name] || name === MAIL_SHIP_ITEM) return null;
  if (!r) { if (cur.length >= 5) return null; if (q > 0) cur.push(ilRow(name, q, mk)); return cur; }
  if (q === 0) return cur.filter(x => ilKey(x) !== k);
  r[1] = q; return cur;
}
function benchRaise(id, name, n, mk = '') { // 소지품에서 빼서 교환대 기록에 올린다. 성공하면 새 목록, 아니면 사유 문자열
  const next = benchNext(name, n, mk); if (!next) return '교환대에는 물건을 5종류까지, 한 종류에 99개까지 올릴 수 있어요.';
  if (state.bench && state.bench.id !== id) return '이미 다른 교환 기록이 남아 있어요.';
  if (countItem(name, mk) < n) return `${name}이(가) 모자랍니다.`;
  removeItem(name, n, mk); state.bench = { id, items: next }; save(); return next;
}
function benchLowerOk(name, n) { // 줄일 때 돌려받을 자리가 있는지 (있으면 null, 없으면 사유)
  const free = (STACK_MAX * (bagCapacity() - usedSlots())) + (state.inventory[ITEMS[name].tab] || []).filter(s => s.n === name).reduce((a, s) => a + Math.max(0, STACK_MAX - s.q), 0);
  return ITEMS[name].tab === '장비' ? (usedSlots() + n <= bagCapacity() ? null : '가방에 자리가 없어요.') : (free >= n ? null : '가방에 자리가 없어요.');
}
function benchLower(name, n, next, mk = '') { // 서버가 줄인 목록을 받아들였을 때: 돌려받고 기록을 맞춘다
  addItem(name, n, mk); state.bench = next.length ? { id: state.bench.id, items: next } : null; save();
}
/* 값어치 = 상점에서 파는 가장 싼 값, 상점에 없으면 판매가의 2배 (대원 간 거래 가격 한도의 기준) */
function tradeValue(name) {
  let best = 0;
  Object.keys(SHOPS).forEach(p => shopRows(p).forEach(r => { if (r[0] === name && (!best || r[1] < best)) best = r[1]; }));
  return best || (sellPrice(name) * 2);
}
/* ---------- 대원 간 거래 (상점가 '대원 간 상점') ----------
   올릴 때 내 기기에서 물건을 먼저 빼 state.market.sell 에 기록한다(서버 호출이 끊겨도 같은 key 로 다시 보내면 한 번만 올라간다). price 는 개당 가격.
   팔린 개수(서버 sold)만큼 수수료를 뗀 CR 을 받고(e.got 로 한 번만), 취소·만료·다 팔림이면 남은 물건을 돌려받는다(state.mseen 멱등).
   살 때는 개수를 직접 정하고, 가방에 들어갈 자리를 확인한 뒤 값을 먼저 치른다. 결과가 ok 면 바로 소지품에 넣고(자리가 갑자기 없으면 남은 것만 메일),
   결과를 모르면 state.market.buy 에 남겨 같은 req 로 다시 확인한다(서버는 같은 req 에 같은 답). CR 은 클라이언트 기준이라 가격 규칙도 클라이언트에서 막는다. */
const marketUnitMax = n => Math.max(2, Math.ceil(tradeValue(n) * MARKET_UNIT_RATIO));
const marketNet = price => Math.floor(price * (1 - MARKET_FEE));
const marketKey = () => 'k' + Math.floor(Math.random() * 1e9).toString(36) + nowMs().toString(36);
function marketListCheck(name, qty, unit, mk) { // 올려도 되는가 (되면 null). unit = 개당 가격, mk = 올릴 제작자 것('' = 이름 없는 것)
  if (!ITEMS[name] || ITEMS[name].hidden || name === MAIL_SHIP_ITEM) return '거래할 수 없는 물건이에요.';
  if (!Number.isInteger(qty) || qty < 1 || qty > 99) return '수량은 1~99개예요.';
  if (!Number.isInteger(unit) || unit < 1) return '가격을 확인하세요.';
  if (unit > marketUnitMax(name)) return `개당 가격이 너무 비싸요. (개당 최대 ${marketUnitMax(name)} CR)`;
  if (unit * qty > MARKET_TOTAL_MAX) return `한 건의 전체 값은 ${MARKET_TOTAL_MAX} CR까지예요.`;
  if (state.market.sell.length >= MARKET_SLOTS) return `동시에 ${MARKET_SLOTS}건까지 올릴 수 있어요.`;
  if (countItem(name, mk) < qty) return `${name}이(가) 모자랍니다.`;
  return null;
}
function marketLocalList(name, qty, unit, mk = '') { // 소지품에서 빼 기록한다. 성공하면 기록, 실패하면 사유 문자열
  mk = mk ? cleanText(mk, MK_LEN) : '';
  const err = marketListCheck(name, qty, unit, mk); if (err) return err;
  const e = { key: marketKey(), id: 0, item: name, qty, price: unit, got: 0, ...(mk ? { mk } : {}) };
  removeItem(name, qty, mk); state.market.sell.push(e); state.flags.marketSell = true; save(); return e;
}
function marketGiveBack(e, n, tag) { // 남은 물건을 돌려받는다 (가방이 모자라면 메일)
  if (n <= 0) return;
  const g = addItem(e.item, n, e.mk || '');
  if (g < n) receiveServerMail('대원 간 거래', '거래 물건 반환', '가방에 자리가 없어 못 돌려받은 물건입니다. 수령하세요.', [ilRow(e.item, n - g, e.mk || '')], 'b' + tag);
}
function marketSettleSell(rows) { // 서버의 내 목록과 맞춘다. → { sold: [{item,qty,net}], back: [{item,qty}], acks: [id] }
  const out = { sold: [], back: [], acks: [] }, byKey = {}, mine = new Set(state.market.sell.map(e => e.key));
  (Array.isArray(rows) ? rows : []).forEach(r => {
    if (!r || typeof r.ckey !== 'string') return; byKey[r.ckey] = r;
    const id = intIn(r.id, 1, 9e15, 0); // 이미 정산해 둔 것인데 확인(ack)이 끊긴 경우: 다시 확인만 한다
    if (id && !mine.has(r.ckey) && r.status !== 'open' && (state.mseen.includes('s' + id) || state.mseen.includes('c' + id))) out.acks.push(id);
  });
  const keep = [];
  state.market.sell.forEach(e => {
    const r = byKey[e.key]; const id = r ? intIn(r.id, 1, 9e15, 0) : 0;
    if (!r || !id) { keep.push(e); return; } // 아직 서버에 없다 (올리는 중이거나 끊겼다) — 다시 보낸다
    const sold = intIn(r.sold, 0, e.qty, 0);
    if (sold > e.got) { const net = marketNet(e.price * (sold - e.got)); state.money += net; out.sold.push({ item: e.item, qty: sold - e.got, net }); e.got = sold; }
    if (r.status === 'open') { e.id = id; keep.push(e); return; }
    const tag = (r.status === 'sold' ? 's' : 'c') + id;
    if (!state.mseen.includes(tag)) {
      state.mseen.push(tag); state.mseen = state.mseen.slice(-60);
      const left = r.status === 'sold' ? 0 : intIn(r.qty, 0, e.qty - e.got, 0);
      if (left) { marketGiveBack(e, left, id); out.back.push({ item: e.item, qty: left }); }
    }
    out.acks.push(id);
  });
  state.market.sell = keep; save(); return out;
}
function marketBuyStart(id, item, qty, unit, mk = '') { // 개수를 정해 산다: 자리 확인 → 값을 먼저 치른다. 성공하면 { req }, 실패하면 사유 문자열
  qty = Math.floor(+qty); const total = unit * qty;
  if (!ITEMS[item] || !(qty >= 1 && qty <= 99) || !(unit >= 1)) return '살 수 없는 물건이에요.';
  if (state.money < total) return 'CR이 부족합니다.';
  if (ITEMS[item].tab === '장비' ? usedSlots() + qty > bagCapacity() : !canAddQty(item, qty)) return '가방에 자리가 없어요.';
  if (state.market.buy.length >= 10) return '처리 중인 구매가 많아요. 잠시 뒤 다시 시도하세요.';
  mk = mk ? cleanText(mk, MK_LEN) : '';
  const req = marketKey(); state.money -= total; state.market.buy.push({ id, req, item, qty, price: total, ...(mk ? { mk } : {}) }); save(); return { req };
}
function canAddQty(name, qty) { // 이 물건 qty 개가 들어갈 자리가 있는가 (장비 외)
  const tab = ITEMS[name].tab, free = STACK_MAX * (bagCapacity() - usedSlots()) + (state.inventory[tab] || []).filter(s => s.n === name).reduce((a, s) => a + Math.max(0, STACK_MAX - s.q), 0);
  return free >= qty;
}
function marketBuyResult(req, r) { // 서버 답을 받았다. → 'ok' | 'gone'(환불) | 'retry'(결과를 모름)
  const i = state.market.buy.findIndex(b => b.req === req); if (i < 0) return 'gone';
  const b = state.market.buy[i];
  if (r && r.ok && r.item === b.item) {
    state.market.buy.splice(i, 1);
    const mk = typeof r.mk === 'string' ? cleanText(r.mk, MK_LEN) : (b.mk || ''), g = addItem(b.item, b.qty, mk); // 서버가 알려 준 제작자 (옛 서버면 목록에서 본 값)
    if (g < b.qty) receiveServerMail('대원 간 거래', '거래 성사', '가방에 자리가 없어 못 넣은 물건입니다. 수령하세요.', [ilRow(b.item, b.qty - g, mk)], 'mb' + b.id + req.slice(-6));
    save(); return 'ok';
  }
  if (r && r.ok === false && ['gone', 'mine', 'short', 'bad'].includes(r.msg)) { state.market.buy.splice(i, 1); state.money += b.price; save(); return r.msg === 'short' ? 'short' : 'gone'; }
  return 'retry';
}
const listDiff = (a, b) => a.map(r => ilRow(r[0], r[1] - (b.find(x => ilKey(x) === ilKey(r)) || [0, 0])[1], r[2] || '')).filter(r => r[1] > 0); // a 에서 b 를 뺀 몫 (이름+제작자로 맞춘다)
function settleLive(v) { // 마감된 교환(done/cancelled)을 정리한다. → { done, name, got, back } (이미 정리한 번호면 null)
  const id = intIn(v && v.id, 1, 9e15, 0), name = cleanText(v && v.name, 12) || '?';
  if (!id || state.ltSeen.includes(id)) return null;
  const done = v.status === 'done', b = state.bench && state.bench.id === id ? state.bench : null;
  let back = [];
  if (b) back = done ? listDiff(b.items, cleanItemList(v.mine, 5)) : b.items.map(r => r.slice()); // 성사됐으면 서버에 못 올라간 몫만, 취소면 전부
  const left = [];
  back.forEach(([n, q, mk]) => { const g = addItem(n, q, mk || ''); if (g < q) left.push(ilRow(n, q - g, mk || '')); });
  if (left.length) receiveServerMail(`교환 · ${name}`.slice(0, 12), '교환 물건 반환', '가방에 자리가 없어 못 돌려받은 물건입니다. 수령하세요.', left, 'lb' + id);
  const got = done ? cleanItemList(v.their, 5) : [];
  if (done) {
    if (got.length) receiveServerMail(`교환 · ${name}`.slice(0, 12), '교환 성사', `${name} 대원과의 교환이 성사됐어요. 받은 물건을 수령하세요.`, got, 'lt' + id);
    state.trades = { day: todayKey(), n: (state.trades.day === todayKey() ? state.trades.n : 0) + 1 };
  }
  if (b) state.bench = null;
  state.ltSeen.push(id); state.ltSeen = state.ltSeen.slice(-20); save();
  return { done, name, got, back };
}
function releaseStaleBench(activeId) { // 서버에 없는 교환의 기록이 남아 있으면 물건을 전부 돌려받는다
  if (!state.bench || state.bench.id === activeId) return null;
  const r = settleLive({ id: state.bench.id, status: 'cancelled', name: '?', mine: [], their: [] });
  if (!r) { state.bench = null; save(); }
  return r;
}

/* ---------- 개인실 창고 (세이브 안의 이름→수량 표라 서버에 따로 부담이 없다) ---------- */
const storageKinds = () => Object.keys(state.storage).length;
const storageList = () => Object.entries(state.storage).filter(([n, q]) => ITEMS[n] && q > 0).sort((a, b) => ITEMS[a[0]].tab.localeCompare(ITEMS[b[0]].tab) || a[0].localeCompare(b[0]));
const storedVariants = name => { const q = state.storage[name] | 0, m = (state.storageMk || {})[name] || {}, signed = Object.entries(m).filter(([, v]) => v > 0).sort((a, b) => a[0].localeCompare(b[0])), free = q - signed.reduce((a, r) => a + r[1], 0); return [...(free > 0 ? [{ mk: '', q: free }] : []), ...signed.map(([mk, v]) => ({ mk, q: v }))]; };
function storeItem(name, qty, mk) { // 소지품 → 창고. 성공하면 null, 실패하면 사유 (제작자 표시는 창고에서도 따로 센다)
  if (state.location !== '개인실') return '창고는 개인실에서만 쓸 수 있습니다.';
  const it = ITEMS[name]; if (!it) return '알 수 없는 아이템입니다.';
  qty = intIn(qty, 1, STORAGE_STACK, 0);
  const have = countItem(name, mk); if (!qty || have < 1) return '맡길 물건이 소지품에 없습니다.';
  qty = Math.min(qty, have);
  const cur = state.storage[name] || 0;
  if (!cur && storageKinds() >= STORAGE_KINDS) return `창고에는 서로 다른 아이템을 ${STORAGE_KINDS}종까지만 둘 수 있습니다.`;
  if (cur >= STORAGE_STACK) return `「${name}」은(는) 창고에 ${STORAGE_STACK}개까지만 둘 수 있습니다.`;
  qty = Math.min(qty, STORAGE_STACK - cur);
  const took = takeItem(name, qty, mk), n = took.reduce((a, r) => a + r[1], 0); if (!n) return '맡길 물건이 소지품에 없습니다.';
  state.storage[name] = cur + n;
  took.forEach(([m, c]) => { if (!m) return; state.storageMk = state.storageMk || {}; const t = state.storageMk[name] = state.storageMk[name] || {}; t[m] = (t[m] || 0) + c; });
  save(); return null;
}
function takeStored(name, qty, mk) { // 창고 → 소지품. 성공하면 { got }, 실패하면 사유 문자열 (가방이 모자라면 담을 수 있는 만큼만). mk 를 안 주면 이름 없는 것부터
  if (state.location !== '개인실') return '창고는 개인실에서만 쓸 수 있습니다.';
  const cur = state.storage[name] | 0; if (!ITEMS[name] || cur < 1) return '창고에 그 물건이 없습니다.';
  const vs = storedVariants(name).filter(v => mk === undefined || v.mk === mk), avail = vs.reduce((a, v) => a + v.q, 0);
  qty = Math.min(intIn(qty, 1, STORAGE_STACK, 0), avail); if (!qty) return avail ? '꺼낼 수량이 잘못되었습니다.' : '창고에 그 물건이 없습니다.';
  let got = 0, left = qty;
  for (const v of vs) {
    if (left <= 0) break;
    const g = addItem(name, Math.min(left, v.q), v.mk); got += g; left -= g;
    if (v.mk && g) { const t = state.storageMk[name]; t[v.mk] -= g; if (!t[v.mk]) delete t[v.mk]; if (!Object.keys(t).length) delete state.storageMk[name]; }
    if (g < Math.min(left + g, v.q)) break; // 가방이 찼다
  }
  if (!got) return '가방에 자리가 없습니다.';
  if (cur - got > 0) state.storage[name] = cur - got; else { delete state.storage[name]; if (state.storageMk) delete state.storageMk[name]; }
  save(); return { got };
}
function addTodo(text) {
  const t = cleanText(text, TODO_LEN);
  if (!t) return '내용을 입력하세요.';
  if (state.todos.length >= TODO_MAX) return `할 일은 ${TODO_MAX}개까지 적을 수 있습니다.`;
  state.todos.push({ id: ++state.todoSeq, t, done: false }); save(); return null;
}
function toggleTodo(id) { const t = state.todos.find(x => x.id === id); if (!t) return false; t.done = !t.done; save(); return true; }
function removeTodo(id) { const n = state.todos.length; state.todos = state.todos.filter(x => x.id !== id); if (state.todos.length !== n) save(); return state.todos.length !== n; }
function clearDoneTodos() { const n = state.todos.length; state.todos = state.todos.filter(x => !x.done); if (state.todos.length !== n) save(); return n - state.todos.length; }
const nickOf = n => (state.nicks && state.nicks[n]) || '';
const engraveOf = n => (state.engraves && state.engraves[n]) || '';
const shownName = n => nickOf(n) || (engraveOf(n) ? `${engraveOf(n)}의 ${n}` : n);
function engraveItem(name, text) { // 반지에 이름 새기기 (비우면 지움). 성공 null / 실패 사유
  if (!state.created) return '먼저 캐릭터를 만드세요.';
  if (!ITEMS[name] || !ITEMS[name].engrave) return '이름을 새길 수 없는 물건입니다.';
  if (!countItem(name)) return '그 반지를 가지고 있지 않습니다.';
  const t = cleanText(text, ENGRAVE_MAX);
  if (!t) delete state.engraves[name]; else state.engraves[name] = t;
  save(); return null;
}
const canNick = n => !!(ITEMS[n] && ITEMS[n].slot === '무기' && reinforceLv(n) >= REINFORCE_RANKS.length - 1);
function setNick(name, text) { // 성공 null / 실패 사유
  if (!canNick(name) || !enchantables().includes(name)) return 'A랭까지 강화한 무기에만 이름을 붙일 수 있습니다.';
  const t = cleanText(text, NICK_MAX);
  if (!t) { delete state.nicks[name]; save(); return null; }
  state.nicks[name] = t; save(); return null;
}
/* 장착 변경. 성공 true / 공간 부족 'space' / 실패 false */
function changeEquipment(slot, newName, mk) { // mk: 고른 제작자 것 (안 주면 이름 없는 것 먼저)
  const cur = state.equipment[slot], list = state.inventory['장비'].slice(), curMk = (state.equipMk || {})[slot] || '';
  let newMk = '';
  if (newName) {
    const lab = e => (e.mk ? Object.keys(e.mk)[0] : '') || '';
    let i = mk !== undefined ? list.findIndex(s => s.n === newName && lab(s) === mk) : list.findIndex(s => s.n === newName && !lab(s));
    if (i < 0 && mk === undefined) i = list.findIndex(s => s.n === newName);
    if (i < 0) return false;
    newMk = lab(list[i]); list.splice(i, 1);
  }
  if (cur) list.push(curMk ? { n: cur, q: 1, mk: { [curMk]: 1 } } : { n: cur, q: 1 });
  const nextEq = { ...state.equipment, [slot]: newName }, cap = bagCapacityFor(nextEq);
  if (usedSlots({ ...state.inventory, '장비': list }) > cap) return 'space';
  state.equipment = nextEq; state.equipMk = { ...(state.equipMk || {}) };
  if (newName && newMk) state.equipMk[slot] = newMk; else delete state.equipMk[slot];
  state.inventory['장비'] = list;
  syncMax();
  return true;
}

/* 사용할 수 없는 이유 (없으면 ''). 귀환 신호기는 진행 중인 행동이 없을 때만 */
function useErr(name) {
  const use = ITEMS[name].use;
  if (use && use.camp) {
    if (state.active || state.pending) return '진행 중이거나 결과 확인이 필요한 행동이 있어 쓸 수 없습니다.';
    if (!campsOf(use.camp).length) return '캠프 위치를 찾지 못했습니다.';
  }
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
/* 사용했을 때 실제로 늘어나는 양 { hp, sp } (최대치를 넘는 부분은 뺀다) */
function useGain(name, n = 1) {
  const use = ITEMS[name] && ITEMS[name].use, v = state.vitals;
  if (!use || use.warp || use.camp) return { hp: 0, sp: 0 };
  n = Math.min(intIn(n, 1, MAX_BATCH, 1), Math.max(1, countItem(name)));
  const m = 1 + healBonus(name);
  return { hp: use.hp ? Math.max(0, Math.min(v.hpMax, v.hp + Math.round(use.hp * m) * n) - v.hp) : 0, sp: use.sp ? Math.max(0, Math.min(v.spMax, v.sp + Math.round(use.sp * m) * n) - v.sp) : 0 };
}
const useGainText = (name, n) => { const g = useGain(name, n), v = state.vitals, b = []; if (ITEMS[name].use.hp) b.push(`HP ${v.hp} → ${v.hp + g.hp}`); if (ITEMS[name].use.sp) b.push(`기력 ${v.sp} → ${v.sp + g.sp}`); return b.join(' · '); }; // 지금 수치 → 사용 뒤 수치
const useFull = (name, n) => { const g = useGain(name, n), u = ITEMS[name].use; return (!u.hp || !g.hp) && (!u.sp || !g.sp); }; // 오를 수치가 하나도 없다
/* 캠프 신호기: 구역의 캠프 칸 목록 [{x,y,label}] (둘이면 북쪽/남쪽, 같은 줄이면 서쪽/동쪽) */
function campsOf(zoneId) {
  const z = DANGER_ZONES.find(d => d.id === zoneId); if (!z) return [];
  const out = []; z.map.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === 'C') out.push({ x, y }); }));
  if (out.length === 2) { const [a, b] = out, v = a.y !== b.y, f = v ? (a.y < b.y) : (a.x < b.x); a.label = v ? (f ? '북쪽 캠프' : '남쪽 캠프') : (f ? '서쪽 캠프' : '동쪽 캠프'); b.label = v ? (f ? '남쪽 캠프' : '북쪽 캠프') : (f ? '동쪽 캠프' : '서쪽 캠프'); }
  else out.forEach((c, i) => { c.label = out.length > 1 ? `캠프 ${i + 1}` : '캠프'; });
  return out;
}
function useBeacon(name, ci = 0, mk) { // 성공하면 null, 아니면 사유
  const it = ITEMS[name], zid = it && it.use && it.use.camp; if (!zid) return '신호기가 아닙니다.';
  const err = useErr(name); if (err) return err;
  const c = campsOf(zid)[ci]; if (!c) return '캠프를 고르세요.';
  if (!countItem(name, mk) || !removeItem(name, 1, mk)) return `${name}이(가) 없습니다.`;
  state.location = '이동장치'; discover('zones', zid);
  enterDungeon(zid); const d = state.dungeon; d.x = c.x; d.y = c.y; revealAround(d); save();
  return null;
}
function useItem(name, n = 1, mk) {
  const use = ITEMS[name].use, v = state.vitals;
  n = use && use.warp ? 1 : Math.min(intIn(n, 1, MAX_BATCH, 1), countItem(name, mk));
  if (!use || use.camp || useErr(name) || !n || !removeItem(name, n, mk)) return false; // 캠프 신호기는 useBeacon
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
  state.buffs.push({ id, endAt: nowMs() + ((BUFFS[id] && BUFFS[id].ms) || BUFF_MS) });
}

/* 장비 + 소지(hold) 아이템 + 세트 + 세공으로 인한 스탯 보정 { str: n, ... } (버프는 빼고) */
function gearMods() {
  const m = {}, add = o => { for (const k in o) m[k] = (m[k] || 0) + o[k]; };
  new Set(Object.values(state.inventory).flat().map(s => s.n)).forEach(n => { if (ITEMS[n] && ITEMS[n].hold) add(ITEMS[n].hold); }); // 소지만 해도 적용되는 아이템(반지 등): 종류마다 한 번만
  Object.values(state.equipment).forEach(n => { if (!n) return; if (ITEMS[n].mods) add(ITEMS[n].mods); const e = state.enchants[n]; if (e && STAT_DEFS.some(d => d.key === e.k)) add({ [e.k]: e.v }); });
  ITEM_SETS.forEach(st => { if (st.need.every(n => Object.values(state.equipment).includes(n))) add(st.mods); });
  const ch = state.character; if (ch.mainStat) add({ [ch.mainStat]: MAIN_STAT_BONUS }); if (ch.subStat && ch.subStat !== ch.mainStat) add({ [ch.subStat]: SUB_STAT_BONUS });
  return m;
}
/* 장비 + 버프로 인한 스탯 보정 { str: n, ... } */
function statMods() {
  const m = gearMods();
  activeBuffs().forEach(b => { for (const k in b.mods) m[k] = (m[k] || 0) + b.mods[k]; });
  return m;
}
function totalStats() {
  const m = statMods(), t = {};
  STAT_DEFS.forEach(d => { t[d.key] = Math.max(0, state.stats[d.key] + (m[d.key] || 0)); });
  return t;
}
/* 스탯 -> 효과 수치(0.1 = 10%). 스탯당 1개, 모두 상한 50% */
function effects(t = totalStats()) {
  return { atk: Math.min(.5, t.str * .006) + masteryBonus('운동').atk + (jobFx().atk || 0), evade: Math.min(.5, t.agi * .005), ggreat: Math.min(.5, t.int * .006), rare: Math.min(.5, t.wil * .005), craftTime: Math.min(.5, t.sen * .006 + jobFx().craftTime), craftGreat: Math.min(.5, t.luk * .006),
    petTime: Math.min(.5, t.str * .01), travelHurt: Math.min(.6, t.agi * .02), farmTime: Math.min(.5, t.int * .01), repeatKeep: Math.min(.5, t.wil * .02), travelFind: Math.min(.1, t.sen * .002), reinforce: Math.min(.3, t.luk * .01) };
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
function seasonOf(now = nowMs()) { // { name, icon, day(그 계절 몇 일째) } — 한국 시간 날짜 기준
  const d = new Date(now + 9 * 3600000), y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
  const s = m === 12 || m <= 2 ? SEASONS[0] : m <= 5 ? SEASONS[1] : m <= 8 ? SEASONS[2] : SEASONS[3];
  const sy = s.m === 12 && m <= 2 ? y - 1 : y, start = Date.UTC(sy, s.m - 1, 1), today = Date.UTC(y, m - 1, d.getUTCDate());
  return { name: s.n, icon: s.ic, day: Math.floor((today - start) / 86400000) + 1 };
}
function altitude(now = nowMs()) { // 상공(안전지대)은 8,4xx m 근처에서 천천히 흔들리고, 지상은 구역 고도 + 칸마다 조금 다르다
  const dn = state.dungeon;
  if (dn && ZONE_ALT[dn.zone] != null) { const h = (Math.imul(dn.x + 3, 73856093) ^ Math.imul(dn.y + 5, 19349663)) >>> 0; return { sky: false, m: Math.max(0, ZONE_ALT[dn.zone] + (h % 61) - 30) }; }
  return { sky: true, m: SKY_ALT + Math.round(18 * Math.sin(now / 90000)) };
}
const weatherFx = () => { const w = todayWeather(); return { gather: w.wet ? WEATHER_GATHER : 0, atk: w.wet ? 0 : WEATHER_ATK }; };
const modText = mods => Object.entries(mods).map(([k, v]) => `${STAT_DEFS.find(d => d.key === k).name} ${v > 0 ? '+' : ''}${v}`);
const weaponAtk = () => { const w = state.equipment['무기']; return (w && ITEMS[w].atk) ? ITEMS[w].atk + reinforceBonus(w) : 0; };

function spendStatPoint(key) {
  if (state.statPoints < 1 || !(key in state.stats)) return false;
  state.stats[key]++; state.statPoints--;
  return true;
}

/* 스테이터스 임시 분배(draft)를 저장 버튼으로 한꺼번에 확정한다. draft={키:올릴 수} — 남은 포인트를 넘거나 모르는 키면 거부 */
function commitStatDraft(draft) {
  const ks = Object.keys(draft || {}).filter(k => draft[k] > 0); let sum = 0;
  for (const k of ks) { if (!(k in state.stats) || !Number.isInteger(draft[k])) return false; sum += draft[k]; }
  if (!sum || sum > state.statPoints) return false;
  ks.forEach(k => { state.stats[k] += draft[k]; }); state.statPoints -= sum;
  return true;
}

/* ---------- 경험치 / 레벨 ---------- */
/* 레벨 곡선: 갈수록 급격히 늘어 만렙(30)은 오래 걸린다. 상한을 두지 않아 뒤로 갈수록 계속 힘들어진다 (Lv.20쯤 1천 이상, Lv.29는 2천 후반) */
const expMax = lv => Math.round((50 + 4 * lv ** 1.85) * EXP_SLOW);
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
  if (c.level >= levelCap()) { v.exp = 0; return 0; }
  v.exp += n;
  while (c.level < levelCap() && v.exp >= expMax(c.level)) { v.exp -= expMax(c.level); c.level++; state.statPoints++; ups++; }
  if (c.level >= levelCap()) v.exp = 0;
  return ups;
}

/* ---------- 방치형 행동 ---------- */
const MIN_CYCLE = CYCLE_SEC[0], MAX_CYCLE = CYCLE_SEC[1];
const spOf = a => (a.cost ? a.cost.sp : 0);
/* 이동 기력. 지상이 끼면 더 든다 */
const moveCost = id => (LOCATIONS[id].danger || LOCATIONS[state.location].danger) ? MOVE_SP_DANGER : MOVE_SP_SAFE;

let customMultiMin = 45; // '직접 입력' 시간(분)
const setCustomMin = v => { customMultiMin = clamp(Math.floor(Number(v)) || 45, CUSTOM_MIN_MIN, CUSTOM_MIN_MAX); return customMultiMin; };
const multiOpt = mi => { const o = MULTI_OPTIONS[mi] || MULTI_OPTIONS[0]; return o.custom ? { label: fmtSpan(customMultiMin * 60), sec: customMultiMin * 60 } : o; };
function fmtSpan(sec) { const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60); return h && m ? `${h}시간 ${m}분` : h ? `${h}시간` : `${m}분`; }
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
  if (q && lv >= q.lv && !state.questTaken[q.id] && !seen['promo:' + (q.promo || q.id)]) { seen['promo:' + (q.promo || q.id)] = true; out.push(q.cap ? `한계 돌파 임무를 받을 수 있어요! 본부 '승급'에서 레벨 제한(${LEVEL_CAP_BASE})을 풀 수 있습니다.` : `${q.promo}등급 승급 시험을 받을 수 있어요! 본부에서 승급을 선택해 보세요.`); }
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
/* 같은 몬스터도 입구 근처는 약하고(체력 ×0.7) 가장 먼 곳은 아주 강하다(체력 ×17). 보수(EXP·CR)와 드롭도 멀수록 크게 늘어난다. 구역끼리의 차이는 미세하다 */
function scaleMonster(m, d) {
  const k = .7 + 16.3 * Math.pow(d, 2.3);
  return { ...m, hp: Math.round(m.hp * k), atk: Math.max(1, Math.round(m.atk * (1 + .8 * d))), exp: Math.round(m.exp * (1 + DEPTH_REWARD * d)), cr: Math.round(m.cr * (1 + DEPTH_REWARD * d)), hit: 1 + 2 * d, diff: d };
}
const monsterBase = a => a.monster || a.terrain.monster;
const monsterOf = (a, d) => scaleMonster(monsterBase(a), d === undefined ? curDifficulty() : d);
/* ---- 여가구역 ---- */
const leisureTaken = () => state.leisure.day === todayIndex() && !!state.leisure.id; // 오늘 이미 버프를 받았나
/* 파티 정보(서버에서 받아 온다, 저장하지 않음): members = [{ uid, name, leader }] (나 포함) */
const PARTY = { id: 0, members: [], invites: [] };
/* ---------- 파티 동행: 파티장의 위치(서버 문자열)를 따라 한 걸음씩 이동한다 ---------- */
const PACE_MIN_SEC = 10; // 서버에서 받은 이동 시간이 이보다 짧으면 믿지 않는다
/* 함께 움직이는 파티(파티장 + 동행을 켠 파티원, 접속 중)에서는 가장 빠른 사람의 칸당 시간에 맞춘다. 더 느려지는 일은 없다 */
function paceSec() {
  const mine = stepSec(); if (!PARTY.id || PARTY.members.length < 2) return mine;
  const me = PARTY.members.find(m => m.uid && m.uid === Cloud.userUid); const L = PARTY.members.find(m => m.leader), lOn = me && me.leader ? state.partyMove : !!(L && L.online && L.fol); if (!(me && me.leader ? state.partyMove : state.follow && lOn)) return mine; // 파티장이 파티 이동을 켠 동안만
  let best = mine; PARTY.members.forEach(m => { if (m === me || !m.online || !(m.leader ? m.fol : (m.fol && lOn)) || !(m.spd >= PACE_MIN_SEC && m.spd <= DUNGEON_STEP_SEC)) return; best = Math.min(best, m.spd); });
  return best;
}
function entranceOf(zoneId) { const z = zoneOf(zoneId); let x = 0, y = 0; z.map.forEach((row, ry) => { const cx = row.indexOf('S'); if (cx >= 0) { x = cx; y = ry; } }); return [x, y]; }
/* 파티원에게 알리는 내 위치. 이동 중이면 가는 곳(목적지)을 알려 주어 파티원이 함께 출발한다 */
function placeNow() {
  const a = state.active;
  if (a && a.id === '타일 이동' && state.dungeon && Array.isArray(a.path) && a.path.length) { const [x, y] = a.path[a.path.length - 1]; return `${state.dungeon.zone}:${x},${y}`; }
  if (a && a.id === '구역 이동' && a.to && zoneOf(a.to)) { const [x, y] = entranceOf(a.to); return `${a.to}:${x},${y}`; }
  return state.dungeon ? `${state.dungeon.zone}:${state.dungeon.x},${state.dungeon.y}` : String(state.location || '');
}
function parsePlace(raw) { // 서버에서 받은 위치를 믿지 않고 다시 확인한다. { air } / { zone, x, y } / null
  if (typeof raw !== 'string' || !raw || raw.length > 40) return null;
  const m = /^(.+):(\d{1,3}),(\d{1,3})$/.exec(raw);
  if (m) { const z = DANGER_ZONES.find(d => d.id === m[1]); if (!z) return null; const ch = tileOf(zoneOf(z.id), +m[2], +m[3]); if (!ch || ch === '#' || ch === '.') return null; return { zone: z.id, x: +m[2], y: +m[3] }; }
  const l = LOCATIONS[raw]; return l && !l.danger ? { air: raw } : null;
}
function syncArrive(eta) { // 동행: 방금 시작한 이동을 파티장 도착 시각(eta)에 맞춰 늘이거나 줄인다 (원래 시간의 0.25~2배 안에서)
  const a = state.active; if (!a || !(eta > nowMs() + 1500)) return;
  const want = eta - a.startAt, have = a.endAt - a.startAt; if (!(have > 0)) return;
  const k = Math.max(.25, Math.min(2, want / have)); if (Math.abs(k - 1) < .03) return;
  a.endAt = a.startAt + Math.round(have * k); a.cycleSec = Math.max(1, Math.round(a.cycleSec * k)); if (Array.isArray(a.cum)) a.cum = a.cum.map(c => +(c * k).toFixed(2)); a.synced = true; save();
}
function followStep(raw, eta) { // 파티장 위치(raw)에 한 걸음 다가간다. { moved, what } / { err } / { wait } / {}
  if (!state.created) return {};
  const t = parsePlace(raw); if (!t || t.air === '개인실') return {};
  const d = state.dungeon;
  if (d && !(t.zone && d.zone === t.zone)) { // 다른 곳으로 가려면 먼저 입구로 돌아가 퇴장한다
    const [sx, sy] = entranceOf(d.zone);
    if (state.active || state.pending) return { wait: true };
    if (d.x === sx && d.y === sy) { leaveDungeon(); return { moved: true, what: 'leave' }; }
    const e = startMove(sx, sy); return e ? { err: e } : { moved: true, what: 'move' };
  }
  if (state.active || state.pending) return { wait: true };
  if (d) { if (d.x === t.x && d.y === t.y) return {}; const e = startMove(t.x, t.y); if (!e) syncArrive(eta); return e ? { err: e } : { moved: true, what: 'move' }; }
  if (t.air) { if (state.location === t.air) return {}; const r = travelTo(t.air); return r.err ? { err: r.err } : { moved: true, what: 'travel' }; }
  if (state.location !== '이동장치') { const r = travelTo('이동장치'); return r.err ? { err: r.err } : { moved: true, what: 'travel' }; }
  const e = startTrip(t.zone); if (!e) syncArrive(eta); return e ? { err: e } : { moved: true, what: 'trip' };
}
/* 동행 묘사: 파티장이 '파티 이동', 파티원이 '동행'을 켠 채 함께 움직일 때 이동·전투·채집·채굴·낚시 결과에 붙는 한 줄 */
const TOGETHER_LINES = {
  move: [n => `동료(${n})와 발을 맞춰 걷는다. 앞서거니 뒤서거니 하는 발소리가 든든하다.`, n => `뒤돌아보면 ${n}이(가) 한 걸음 거리에서 따라온다. 혼자였다면 길이 더 길었을 것이다.`, n => `${n}과(와) 나란히 걸으니 폐허의 바람도 덜 차다.`],
  battle: [n => `등 뒤를 ${n}이(가) 맡아 준 덕에 한결 마음 놓고 싸웠다.`, n => `${n}과(와) 눈짓으로 신호를 주고받으며 몬스터를 몰아붙였다.`, n => `쓰러진 몬스터 곁에서 ${n}과(와) 가볍게 주먹을 맞부딪쳤다.`],
  채집: [n => `${n}과(와) 나란히 쭈그려 앉아 풀숲을 뒤졌다. 누가 더 많이 찾나 내기도 했다.`, n => `${n}이(가) 찾은 것을 내밀며 웃었다. 같이 하니 시간이 금방 갔다.`],
  채굴: [n => `${n}과(와) 번갈아 곡괭이를 휘둘렀다. 땀을 닦는 사이 쉴 틈을 서로 내주었다.`, n => `광석 부딪치는 소리가 ${n}의 곡괭이 소리와 박자를 맞췄다.`],
  낚시: [n => `${n}과(와) 나란히 낚싯대를 드리웠다. 말없이 앉아 있어도 어색하지 않았다.`, n => `찌를 바라보다 ${n}과(와) 눈이 마주쳐 같이 웃었다. 누가 먼저 낚나 내기하는 중이다.`]
};
/* 지금 함께 움직이는 파티원 이름들 (내가 파티장이면 '동행'을 켠 파티원, 파티원이면 '파티 이동'을 켠 파티장과 다른 동행자) */
function togetherNames() {
  if (!PARTY.id) return [];
  const me = state.character.name, ms = PARTY.members.filter(m => m.name !== me && m.online && m.fol);
  if (partyLeader()) return state.partyMove ? ms.map(m => m.name) : [];
  const L = PARTY.members.find(m => m.leader);
  return state.follow && L && L.online && L.fol ? ms.map(m => m.name) : [];
}
function togetherLine(kind, rnd = Math.random) { const ns = togetherNames(), l = TOGETHER_LINES[kind]; return ns.length && l ? pickR(rnd, l)(ns.slice(0, 3).join('·')) : ''; }
const partyOthers = () => PARTY.members.map(m => m.name).filter(n => n && n !== state.character.name);
function leisureText(id, rnd = Math.random) {
  const l = LEISURE[id], others = partyOthers().sort(() => rnd() - .5).slice(0, 3);
  if (others.length >= 1 && rnd() < .7) return pickR(rnd, l[`p${others.length + 1}`](...others));
  return pickR(rnd, l.solo);
}
function actionPreview(id, mi = 0) {
  const a = ACTIONS[id], fx = effects(), sp = spOf(a), opt = multiOpt(mi);
  if (a.kind === 'leisure') { const sn = STAT_DEFS.find(d => d.key === LEISURE[id].stat).name; return { time: '즉시', gain: leisureTaken() ? '오늘은 이미 버프를 받았습니다. 분위기만 즐깁니다.' : `${sn} +2 버프 (8시간) · EXP +5`, cost: '없음 (버프는 하루 한 번 · 한국 시간 오전 4시에 초기화 · 한 번 받으면 바꿀 수 없음)' }; }
  const multi = (a.kind === 'gather' || a.kind === 'battle') && opt.sec > 0 && !(a.kind === 'battle' && state.vitals.hp <= HP_RETREAT); // HP가 바닥이면 전투는 한 번만
  const cMin = multi ? Math.floor(opt.sec / (a.kind === 'gather' ? GATHER_SEC : MAX_CYCLE)) : 1, cMax = multi ? Math.floor(opt.sec / (a.kind === 'gather' ? GATHER_SEC : MIN_CYCLE)) : 1;
  const rng = (lo, hi, f = x => x) => lo === hi ? `${f(lo)}` : `${f(lo)}~${f(hi)}`;
  const costs = [], per = multi ? ` (${rng(cMin, cMax)}회 반복)` : '';
  const n0 = repeatCount(id), note = (a.kind === 'gather' || a.kind === 'battle') ? (n0 >= REPEAT_FREE ? `이 장소에서 이 행동을 ${n0}번 했습니다. 지금은 아이템 획득 확률이 ${Math.round((a.kind === 'gather' ? gatherRepeat : repeatChance)(n0 + 1) * 100)}%로 떨어져 있어요. (12시간 뒤 초기화)` : `이 장소에서 같은 행동 ${n0}회 (${REPEAT_FREE + 1}번째부터 아이템 획득 확률 저하 · 12시간 뒤 초기화)`) : '';
  if (a.kind === 'gather' || a.kind === 'battle') {
    const time = multi ? `${opt.label}${per}` : a.kind === 'gather' ? '5분' : '6분';
    costs.push(`기력 -${rng(sp * cMin, sp * cMax)}`);
    if (state.vitals.hp <= 1) costs.push('⚠ HP가 1이라 다치면 죽습니다');
    if (a.kind === 'gather') {
      const h = a.hazard;
      costs.push(`${h.text} 사고 시 HP -${h.hp[0]}~${h.hp[1]} (회당 ${Math.round(h.chance * 100)}%)`);
      const find = Math.min(1, GATHER_FIND + weatherFx().gather) * gatherRepeat(n0 + 1);
      const odds = `재료 획득 ${pct(find)} (빈손 ${pct(1 - find)}) · 대성공(2배) ${pct(fx.ggreat)}${a.rare ? ` · 희귀 ${a.rare} ${pct(RARE_BASE + fx.rare)}` : ''} · 사고로 다칠 확률 ${pct(h.chance)} (안 다칠 확률 ${pct(1 - h.chance)})`;
      return { time, gain: `${a.items.join(' / ')} 회당 1~3개 · EXP +6/회 (총 ${rng(cMin * 6, cMax * 6)})`, cost: costs.join(' · '), note, odds };
    }
    const m = monsterOf(a);
    { const db = foeDebuff(m.name); costs.push('전투 피해로 HP 감소', `패배 시 ${db}(${BUFFS[db].desc.split('. ').pop()})`, `HP ${HP_RETREAT} 이하가 되면 중단`); }
    if (state.vitals.hp <= HP_RETREAT) costs.push(`⚠ HP가 ${HP_RETREAT} 이하입니다. 이 상태로 싸우면 한 번만 싸우고, 지면 사망해 클론으로 재탄생합니다`);
    const bo = battleOdds(m), rep = repeatChance(n0 + 1);
    const odds = `승리 약 ${bo.win}% · 다칠 확률 약 ${bo.hurt}% (1회 최대 HP -${m.hpCap || BATTLE_HP_CAP}) · 재료 ${pct(BATTLE_MAT * rep)} · ${m.drops.map(([n, p]) => `${n} ${pct(p * rep)}`).join(' · ')}`;
    return { time, gain: `승리 시 EXP +${m.exp} · CR +${m.cr} · 재료 (회당)`, cost: costs.join(' · '), note, odds };
  }
  if (a.kind === 'rescue') { const m = state.dungeon ? rescueFoe() : null; return { time: '즉시', gain: m ? `이기면 감사의 보수: ${m.rare ? `희귀 재료(${m.rare}) 또는 ` : ''}CR 약 ${Math.round(m.cr * (3 + 4 * m.d))} · EXP +${15 + Math.round(25 * m.d)}` : '이기면 감사의 보수', cost: `기력 -${sp} · 지면 HP -${RESCUE_HP[0]}~${RESCUE_HP[1]} (깊은 곳일수록 크게, 죽지는 않음)`, note: m ? `상대: ${m.name} (체력 ${m.hp} · 공격 ${m.atk})` : '' }; }
  if (a.kind === 'tame') return { time: '10분', gain: `성공하면 펫을 얻음 (성공 확률 약 ${Math.round(tameChance() * 100)}% · 감각이 높을수록 유리 · 펫 사료를 먹이면 +${Math.round(TAME_FOOD_BONUS * 100)}%p) · EXP +12`, cost: `기력 -${sp} · 먹이 1개(직접 고른 작물/펫 사료) 소모 · 실패하면 HP 손실 가능` };
  if (a.kind === 'train') { const n = learnableRecipes().length; return { time: '25분', gain: `새 제작 레시피 1종을 무작위로 습득 · EXP +${TRAIN_EXP}`, cost: `기력 -${sp}`, note: n ? `지금 배울 수 있는 레시피 ${n}종 (승급하면 후보가 늘어납니다)` : '지금은 더 배울 수 있는 레시피가 없습니다.' }; }
  if (a.kind === 'rest') return { time: a.sec >= 3600 ? `${a.sec / 3600}시간` : a.sec >= 120 ? `${a.sec / 60}분` : '1분', gain: a.full ? 'HP · 기력 완전 회복 · 충분한 휴식(의지 +2, 5분)' : `HP +30 · 기력 +${a.restSp ?? REST_SP} · 충분한 휴식(의지 +2, 5분)`, cost: '없음' };
  if (a.kind === 'travel') return { time: LOCATIONS[a.to].danger ? `${ZONE_TRIP_SEC / 60}분` : '즉시', gain: `이동 후 그 구역의 선택지를 이용할 수 있음${ZONE_MIN_RANK[a.to] ? ` (${ZONE_MIN_RANK[a.to]}등급 이상)` : ''}`, cost: moveCost(a.to) ? `기력 -${moveCost(a.to)}` : '기력 소모 없음' };
  if (a.kind === 'enter') return { time: '즉시', gain: '타일 지도 탐색 시작 (타일 1칸 이동 = 3분 · 기력 1)', cost: '없음' };
  if (a.kind === 'leave') return { time: '즉시', gain: '구역 지도로 돌아감', cost: '없음' };
  if (a.kind === 'gamble') { const g = GAMBLES[id]; return { time: '즉시', gain: `성공(${pct(GAMBLE_WIN)}): ${[g.good.money ? `CR +${g.good.money}` : '', ...(g.good.items || []).map(([n, q]) => `${n} ×${q}`), g.good.exp ? `EXP +${g.good.exp}` : '', g.good.hp ? `HP +${g.good.hp}` : '', g.good.buff || ''].filter(Boolean).join(' · ')}`, cost: `기력 -${sp} · 실패(${pct(1 - GAMBLE_WIN)}): ${[g.bad.money ? `CR ${g.bad.money}` : '', g.bad.hp ? `HP ${g.bad.hp}` : '', g.bad.buff || ''].filter(Boolean).join(' · ')} (1시간에 한 번)` }; }
  if (a.kind === 'lounge') return { time: '즉시', gain: '이 자리에서 머물며 시간을 보낸다. 시간대(낮/밤)에 따라 다른 풍경을 볼 수 있다.', cost: '없음' };
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
const gatherRepeat = nth => nth <= REPEAT_FREE ? 1 : Math.min(1, repeatChance(nth) + effects().repeatKeep); // 의지: 반복할수록 떨어지는 채집 성공 확률을 일부 되살린다
const repeatChance = nth => nth <= REPEAT_FREE ? 1 : Math.max(.2, 1 - .2 * (nth - REPEAT_FREE));
function noteRepeat(id, n) {
  const k = repKey(id), r = state.repeats[k];
  for (const q in state.repeats) if (state.repeats[q].at + REPEAT_RESET_SEC * 1000 <= nowMs()) delete state.repeats[q]; // 만료된 장소 기록 정리
  state.repeats[k] = r && r.at + REPEAT_RESET_SEC * 1000 > nowMs() ? { n: r.n + n, at: r.at } : { n, at: nowMs() };
}
/* 칸마다 나타나는 채집 행동: 이 칸의 지형이 주는 재료 중 0~2개가 무작위(입장할 때마다 다르게). 같은 칸은 같은 결과 */
function seededRng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/* 펫 꼬시기: 칸마다 가끔 나타난다 (같은 칸은 같은 결과). 한 칸에서 TAME_FAIL_MAX 번 실패하면 그 칸에서는 사라진다 */
function tameShown(z, x, y, seed) {
  const t = z.terrains[terrainIndex(tileOf(z, x, y))];
  if (!t || !t.tameId || state.pets.some(p => p.id === t.monster.name)) return false;
  const d = state.dungeon;
  if (d && d.x === x && d.y === y && d.zone === z.id && ((d.tf || {})[`${x},${y}`] | 0) >= TAME_FAIL_MAX) return false;
  return seededRng((seed || 1) * 17 + x * 6271 + y * 9127 + z.n * 7919)() < TAME_APPEAR;
}
function tameShown2(z, x, y, seed) { // 몬스터가 아닌 작은 동물 펫 (PET_WILD)
  const t = z.terrains[terrainIndex(tileOf(z, x, y))], a = t && t.tameId2 && ACTIONS[t.tameId2];
  if (!a || state.pets.some(p => p.id === a.pet)) return false;
  const d = state.dungeon;
  if (d && d.x === x && d.y === y && d.zone === z.id && ((d.tf || {})[`${x},${y}`] | 0) >= TAME_FAIL_MAX) return false;
  return seededRng((seed || 1) * 31 + x * 4099 + y * 7177 + z.n * 3301)() < PET_WILD_APPEAR;
}
/* 칸마다 나타나는 몬스터: 이 지형의 몬스터 중 하나 (같은 칸은 같은 결과) */
function rescueShown(z, x, y, seed) { // 이 칸에 구조를 기다리는 대원이 있다
  const t = z.terrains[terrainIndex(tileOf(z, x, y))], d = state.dungeon;
  if (!t || !state.created) return false;
  if ((state.rescueAt[z.id] || 0) + RESCUE_COOLDOWN_MS > nowMs()) return false;
  if (d && d.zone === z.id && (d.rs || {})[`${x},${y}`]) return false;
  return seededRng((seed || 1) * 23 + x * 4517 + y * 7883 + z.n * 104723)() < RESCUE_APPEAR;
}
function rescueFoe() { // 지금 칸에서 구조할 때 상대 (그 칸에 나오는 몬스터, 깊을수록 강하다)
  const d = state.dungeon, z = zoneOf(d.zone), t = z.terrains[terrainIndex(tileOf(z, d.x, d.y))], a = ACTIONS[tileBattleId(z, t, d.x, d.y, d.seed)], base = (a && monsterBase(a)) || t.monster, dd = curDifficulty();
  return { name: base.name, kind: base.kind, atk: Math.max(1, Math.round(base.atk * (1 + .6 * dd))), hp: Math.round(base.hp * (1.4 + 1.6 * dd)), cr: base.cr, d: dd, rare: t.rare, terrain: t };
}
const rescueHpLoss = dd => clamp(Math.round(RESCUE_HP[0] + (RESCUE_HP[1] - RESCUE_HP[0]) * dd + (Math.random() * 2 - 1)), RESCUE_HP[0], RESCUE_HP[1]);
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
function startAction(id, mi = 0, baitName = null) {
  const a = ACTIONS[id];
  if (a.kind === 'todo') return '아직 구현되지 않은 기능입니다.';
  if (!['gather', 'battle', 'rest', 'investigate', 'gamble', 'tame', 'train', 'leisure', 'lounge', 'rescue'].includes(a.kind)) return '시작할 수 없는 행동입니다.';
  if (!state.created) return '먼저 캐릭터를 만드세요.';
  if (state.active || state.pending) return '이미 진행 중이거나 결과 확인이 필요한 행동이 있습니다.';
  if (['gather', 'battle', 'investigate', 'tame', 'rescue'].includes(a.kind) && bagFull()) return BAG_FULL_MSG; // 가방이 가득 차면 탐색 전에 정리부터
  const lg = levelGate(id);
  if (lg) return lg;
  if (a.kind === 'train' && !learnableRecipes().length) return RECIPES.some(rc => !recipeKnown(rc)) ? '지금 등급에서 더 배울 수 있는 레시피가 없습니다. 승급하면 새 레시피를 배울 수 있어요.' : '배울 수 있는 레시피를 모두 익혔습니다.';
  if (actionBlocked(id)) return a.kind === 'gamble' ? `방금 한 판을 했습니다. ${fmtDur(actionBlocked(id))} 뒤에 다시 할 수 있어요.` : '이 칸은 조금 전에 조사했습니다. 12시간 뒤에 다시 할 수 있습니다.';
  const t = nowMs(), v = state.vitals, cost = spOf(a);
  if (a.kind === 'leisure') { // 여가: 하루 한 번만 버프. 그 뒤에는 분위기 묘사만
    const first = !leisureTaken(), r = { text: leisureText(id), items: [], exp: first ? 5 : 0, money: 0, hp: 0, sp: 0, spCost: 0, buff: null };
    if (first) { state.leisure = { day: todayIndex(), id }; r.buff = a.buff; r.text += ` 【${BUFFS[a.buff].desc.split('. ')[1]} · 8시간】`; }
    else r.text += ' (오늘의 여가 버프는 이미 받았어요. 분위기만 즐겼습니다.)';
    state.pending = { id, result: r };
    save();
    return null;
  }
  if (a.kind === 'lounge') { // '?' 칸: 낮/밤에 따라 다른 묘사. LOUNGE_NEED번째에 저널을 얻는다
    const d = state.dungeon, q = QMARKS[a.zone];
    if (!d || d.zone !== a.zone || tileOf(zoneOf(a.zone), d.x, d.y) !== '?') return '이곳에서만 할 수 있어요.';
    if (a.act !== undefined) { // 저널을 모두 모은 뒤의 선택지: 파티 인원에 따라 다른 묘사
      if (!allJournals()) return '이곳에서만 할 수 있어요.';
      const qa = QMARK_ACTS[a.zone][a.act], ns = partyOthers().sort(() => Math.random() - .5).slice(0, 3), list = ns.length ? qa['p' + (ns.length + 1)] : qa.solo;
      const text = pick(list).replace(/\{(\d)\}/g, (m, k) => ns[k - 1] || '동료');
      state.qact[a.zone] = (state.qact[a.zone] | 0) | (1 << a.act);
      state.pending = { id, result: { text, items: [], exp: 0, money: 0, hp: 0, sp: 0, spCost: 0, buff: null } }; save();
      return null;
    }
    const n = state.lounge[a.zone] = Math.min(9999, (state.lounge[a.zone] | 0) + 1), night = isNightNow();
    const r = { text: pick(night ? q.vnight : q.vday), items: [], exp: 0, money: 0, hp: 0, sp: 0, spCost: 0, buff: null };
    if (n >= LOUNGE_NEED && !state.journals[a.zone]) {
      state.journals[a.zone] = 1; r.text += `\n\n바닥에 낡은 수첩 한 권이 떨어져 있는 걸 발견했다. 누군가의 탐험록이다. 도감에 기록해 두었다.`; r.journal = a.zone;
      if (allJournals()) { r.text += `\n수첩을 덮는 순간, 뒤표지 안쪽에 접혀 있던 종이 한 장이 툭 떨어졌다.`; r.journalLast = true; } // 마지막 저널 (도감 저널 맨 끝)
    }
    state.pending = { id, result: r };
    save();
    return null;
  }
  if (a.kind === 'rescue') { // 대원 구조: 바로 싸운다. 결과는 지금 정해지고, 화면은 로그를 한 줄씩 보여 준다
    const d = state.dungeon, z = d && zoneOf(d.zone);
    if (!d || d.zone !== a.zone || !rescueShown(z, d.x, d.y, d.seed)) return '이 칸에는 도움이 필요한 대원이 보이지 않습니다.';
    if (v.sp < cost) return `기력이 부족합니다. (필요 ${cost})`;
    v.sp -= cost;
    const m = rescueFoe(), who = pick(RESCUE_NAMES), st = { hp: Math.max(20, v.hpMax), mhp: m.hp }, hp0 = st.hp, log = [];
    discover('monsters', m.name);
    for (let i = 0; i < 40 && st.hp > 0 && st.mhp > 0; i++) { const l = mockRound(m, st); log.push({ t: l.text, k: l.kind, d: l.dealt || 0, h: l.taken || 0 }); }
    const win = st.mhp <= 0, r = { text: pick(RESCUE_SCENES)(m.name) + ' ', items: [], exp: win ? 15 + Math.round(25 * m.d) : 5, money: 0, hp: 0, sp: 0, spCost: cost, buff: null };
    if (win) {
      if (m.rare && chance(RESCUE_RARE)) { r.items.push([m.rare, m.d > .6 ? 2 : 1]); }
      else r.money = Math.round(m.cr * (3 + 4 * m.d));
      r.text += `${m.name}을(를) 물리치고 대원을 구했다! ` + pick(RESCUE_THANKS)(who);
    } else { r.hp = -rescueHpLoss(m.d); r.text += pick(RESCUE_FAIL)(who, m.name); }
    floorLoss(r); r.death = false; // 구조 전투에서 지면 다치기만 하고 죽지는 않는다
    r.rescue = { foe: m.name, who, win, hp0, mhp0: m.hp, log };
    d.rs = d.rs || {}; d.rs[`${d.x},${d.y}`] = 1; state.rescueAt[d.zone] = t;
    state.pending = { id, result: r };
    save();
    return null;
  }
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
    const pid = a.pet || a.terrain.monster.name, sp = PET_SPECIES[pid];
    if (state.pets.some(p => p.id === pid)) return '이미 길들인 종입니다.';
    if (state.dungeon && !(a.pet ? tameShown2 : tameShown)(zoneOf(state.dungeon.zone), state.dungeon.x, state.dungeon.y, state.dungeon.seed)) return '이 칸에는 더 이상 길들일 개체가 보이지 않습니다.';
    if (!baitItems().length) return '먹이가 될 작물이나 펫 사료가 필요합니다. 농장에서 키워 보세요.';
    bait = baitName == null ? baitItems()[0] : baitName; // 먹일 먹이는 직접 고른다 (고르지 않은 호출만 기본값)
    if (!baitItems().includes(bait)) return '고른 먹이가 가방에 없습니다. 먹일 먹이를 다시 골라 주세요.';
    if (v.sp < cost) return `기력이 부족합니다. (필요 ${cost})`;
  }
  const risk = a.kind === 'battle' && v.hp <= HP_RETREAT; // HP가 낮은데도 싸우면: 한 번만 싸우고, 지면 사망 → 클론 재탄생
  const mopt = multiOpt(mi), multi = (a.kind === 'gather' || a.kind === 'battle') && mopt.sec > 0 && !risk;
  const cycleSec = a.kind === 'rest' || a.kind === 'train' ? a.sec : a.kind === 'tame' ? TAME_SEC : a.kind === 'gather' ? GATHER_SEC : rand(MIN_CYCLE, MAX_CYCLE);
  const cycles = multi ? Math.max(1, Math.floor(mopt.sec / cycleSec)) : 1;
  const total = multi ? mopt.sec : cycleSec, spCost = cost * cycles;
  if (v.sp < spCost) return `기력이 부족합니다. (필요 ${spCost}) 식량을 먹거나 휴식하세요.`;
  v.sp -= spCost;
  if (bait) removeItem(bait);
  state.results = []; // 다른 행동을 시작하면 지난 결과 카드는 닫는다
  state.active = { id, startAt: t, endAt: t + total * 1000, cycles, cycleSec, spCost, ...(bait ? { bait } : {}), ...(a.kind === 'battle' ? { seed: 1 + Math.floor(Math.random() * 2147483000), hp0: v.hp, bs: battleSnap(), d: curDifficulty(), ...(risk ? { risk: true } : {}) } : a.kind === 'gather' ? { d: curDifficulty() } : {}) };
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
  state.results = []; // 다른 행동을 시작하면 지난 결과 카드는 닫는다
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
    runs.push(b); lost += b.lost; // 져도 남은 회차는 계속한다 (HP가 바닥나면 위에서 멈춘다)
  }
  return { m, runs };
}
const pickR = (r, arr) => arr[Math.floor(r() * arr.length)];
/* 착용 장비에 반응하는 묘사 한 줄 (없으면 ''). kind: 't' 이동 / 'b' 전투 */
const PARTICLES = [['이(가)', '이', '가'], ['은(는)', '은', '는'], ['을(를)', '을', '를'], ['와(과)', '과', '와'], ['으로', '으로', '로'], ['로', '으로', '로'], ['이', '이', '가'], ['가', '이', '가'], ['은', '은', '는'], ['는', '은', '는'], ['을', '을', '를'], ['를', '을', '를'], ['과', '과', '와'], ['와', '과', '와']];
/* 이름 바로 뒤에 붙은 조사를 받침에 맞게 고친다 ('빗자루을' -> '빗자루를') */
function fixJosa(name, text) {
  const jong = hasJong(name), esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(esc + '(이\\(가\\)|은\\(는\\)|을\\(를\\)|와\\(과\\)|으로|로|이|가|은|는|을|를|과|와)(?![가-힣])', 'g'), (m, p) => {
    const e = PARTICLES.find(x => x[0] === p); if (!e) return m;
    const lastRieul = (name.charCodeAt(name.length - 1) - 0xAC00) % 28 === 8;
    return name + (p === '으로' || p === '로' ? (jong && !lastRieul ? '으로' : '로') : jong ? e[1] : e[2]);
  });
}
/* 착용 장비에 반응하는 묘사 한 줄 (없으면 ''). kind: 't' 이동 / 'b' 전투 / 'g' 채집 / 'i' 조사 */
function equipLine(kind, r) {
  const worn = Object.values(state.equipment).filter(n => n && ITEMS[n]), pool = [];
  worn.forEach(n => {
    const e = EQUIP_LINES[n];
    if (e && e[kind] && e[kind].length) { pool.push(e[kind]); pool.push(e[kind]); } // 아이템 전용 문장은 두 배로 자주
    const it = ITEMS[n], sl = SLOT_LINES[it.slot], wk = it.slot === '무기' ? WEAPON_LINES[weaponKind(n)] : null;
    if (wk && wk[kind]) pool.push(wk[kind](n).map(x => fixJosa(n, x)));
    if (sl && sl[kind]) pool.push(sl[kind](n).map(x => fixJosa(n, x)));
  });
  Object.values(EQUIP_SET_LINES).forEach(st => { if (st.need.every(n => worn.includes(n)) && st[kind] && st[kind].length) { pool.push(st[kind]); pool.push(st[kind]); } });
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
    else if (act.risk) { parts.push(`${nm}의 일격에 무릎이 꺾였다. 시야가 어둡게 가라앉는다…`); kind = 'hurt'; } // HP가 바닥인 채 싸워 졌다: 사망
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
  { const tg = togetherLine('move', seededRng(base * 71 + 3)); if (tg) out.push({ text: tg, kind: 'note' }); } // 파티 동행 묘사는 이동 지문에
  for (let k = 1; k <= n && k <= 600; k++) { if (k < n - 40) continue;
    const r = seededRng(base * 37 + k * 6151), roll = r(), place = travelPlace(act, k);
    if (top && roll < .3) out.push({ text: pickR(r, TRAVEL_STYLE[top]), kind: 'dodge' });
    else if (roll < .65) out.push({ text: pickR(r, TRAVEL_SCENE)(place), kind: 'note' });
    else out.push({ text: pickR(r, TRAVEL_SCENE)(place) + ' ' + pickR(r, TRAVEL_FLOURISH), kind: 'note' });
    { const re = seededRng(base * 53 + k * 911 + 5), ln = re() < .25 ? equipLine('t', re) : ''; if (ln) out[out.length - 1] = { text: ln, kind: 'note' }; }
  }
  return out;
}

/* ---------- 채집·채굴·낚시 묘사 (스테이터스에 따라 달라지는 문장) ---------- */
const eulReul = w => { const c = (w || '').charCodeAt((w || '').length - 1) - 0xAC00; return c >= 0 && c % 28 !== 0 ? '을' : '를'; };
const GATHER_START = { '채집': '주위를 둘러보며 손을 뻗었다.', '채굴': '곡괭이를 고쳐 쥐고 암벽 앞에 섰다.', '낚시': '낚싯줄을 풀어 물가에 드리웠다.' };
const GATHER_SCENE = {
  '채집': [p => `${p}의 풀숲을 헤치며 쓸 만한 것을 찾았다.`, p => `${p}의 바닥을 살피며 천천히 걸었다.`, p => `허리를 숙여 ${p}의 흙을 털어 냈다.`, p => `${p}의 바람 소리를 들으며 잠시 손을 쉬었다.`, p => `${p}에서 가방을 고쳐 메고 다시 손을 뻗었다.`],
  '채굴': [p => `${p}의 바위를 두드려 소리를 확인했다.`, p => `곡괭이 끝에서 불꽃이 튀었다. ${p}는 단단하다.`, p => `${p}의 암벽 틈에 먼지가 자욱하게 일었다.`, p => `땀을 닦으며 ${p}의 바위를 올려다보았다.`, p => `부서진 돌 조각이 ${p}의 바닥에 흩어졌다.`],
  '낚시': [p => `${p}의 수면이 잔잔하게 일렁였다.`, p => `찌가 살짝 흔들렸지만 아직 아니다.`, p => `${p}의 물가에 앉아 숨을 죽이고 기다렸다.`, p => `줄을 감았다 풀며 ${p}의 물살을 가늠했다.`, p => `멀리서 물새가 울었다. 낚싯대는 조용하다.`]
};
const GATHER_STYLE = { // [능력치][방식] = 문장 목록 (it = 대상 이름)
  str: { '채집': [it => `근력으로 뿌리째 단단히 박힌 ${it}${eulReul(it)} 힘껏 뽑아 올렸다.`, it => `굵은 줄기도 맨손으로 꺾어 ${it}${eulReul(it)} 거뜬히 챙겼다.`], '채굴': [it => `근력을 실어 곡괭이를 내리찍자 바위가 쩍 갈라졌다.`, it => `묵직한 곡괭이질에 ${it}이(가) 박힌 단단한 바위가 부서졌다.`], '낚시': [it => `팔 힘으로 낚싯대를 강하게 당겨 버티는 줄을 끌어올렸다.`, it => `요동치는 낚싯대를 근력으로 꽉 붙들었다.`] },
  int: { '채집': [it => `지식을 떠올려 ${it}이(가) 자랄 만한 자리를 정확히 짚었다.`, it => `주변 식생을 분석해 ${it}의 위치를 어림했다.`], '채굴': [it => `암석의 결을 읽어 가장 약한 지점에 곡괭이를 겨눴다.`, it => `광맥의 방향을 머릿속으로 그려 보고 파 들어갔다.`], '낚시': [it => `물살과 수심을 계산해 미끼를 던질 자리를 골랐다.`, it => `물고기가 모이는 길목을 추리해 줄을 옮겼다.`] },
  agi: { '채집': [it => `가벼운 몸놀림으로 수풀 사이를 오가며 ${it}${eulReul(it)} 재빠르게 모았다.`, it => `발소리를 죽이고 빠르게 움직여 ${it}${eulReul(it)} 하나씩 낚아챘다.`], '채굴': [it => `재빠른 손놀림으로 흔들리는 돌 사이를 피해 파냈다.`, it => `무너지는 돌 조각을 날렵하게 피하며 곡괭이를 휘둘렀다.`], '낚시': [it => `입질이 오자마자 번개같이 낚싯대를 채 올렸다.`, it => `재빠른 손목 놀림으로 줄을 감았다.`] },
  wil: { '채집': [it => `지칠 법도 하지만 의지로 버티며 ${it}${eulReul(it)} 찾아 걸었다.`, it => `포기하지 않고 같은 자리를 한 번 더 뒤졌다.`], '채굴': [it => `팔이 저려도 의지로 곡괭이를 멈추지 않았다.`, it => `단단한 바위에 맞서 묵묵히 같은 곳을 계속 두드렸다.`], '낚시': [it => `입질이 없어도 의지로 끈기 있게 줄을 지켜보았다.`, it => `긴 기다림에도 흔들리지 않고 자세를 유지했다.`] },
  sen: { '채집': [it => `예민한 감각으로 풀잎 사이의 ${it} 냄새를 먼저 알아챘다.`, it => `손끝의 감각만으로 ${it}${eulReul(it)} 상하지 않게 따냈다.`], '채굴': [it => `곡괭이를 타고 오는 진동으로 안쪽의 빈 공간을 느꼈다.`, it => `소리의 미세한 차이로 ${it}이(가) 있는 곳을 짐작했다.`], '낚시': [it => `줄 끝에 닿는 작은 떨림을 감각으로 먼저 알아챘다.`, it => `물결의 미세한 변화를 읽고 때를 맞췄다.`] },
  luk: { '채집': [it => `무심코 발길이 닿은 곳에 ${it}이(가) 눈에 띄었다.`, it => `우연히 들춘 잎 아래에서 좋은 느낌이 났다.`], '채굴': [it => `아무렇게나 내리친 곳에서 반짝이는 것이 보였다.`, it => `운이 따랐는지 곡괭이가 광맥의 결을 정확히 갈랐다.`], '낚시': [it => `아무 데나 던진 줄에 묘한 기운이 느껴졌다.`, it => `우연히 던진 자리에 물고기 떼가 지나갔다.`] }
};
function gatherLogFor(act, now = nowMs()) {
  const a = ACTIONS[act.id] || {}, how = a.method || '채집', it = (a.items && a.items[0]) || '재료', place = a.terrain && a.terrain.name || '이 일대';
  const n = Math.floor(Math.max(0, now - act.startAt) / 1000 / BATTLE_LOG_SEC), out = [{ text: `${place}에서 ${GATHER_START[how] || GATHER_START['채집']}`, kind: 'note' }];
  const base = (act.seed || Math.floor(act.startAt / 1000)) >>> 0, t = totalStats();
  const keys = Object.keys(STAT_STYLE).filter(k => (t[k] || 0) >= 1);
  const sum = keys.reduce((x, k) => x + t[k], 0);
  for (let k = 1; k <= n && k <= 600; k++) { if (k < n - 40) continue;
    const r = seededRng(base * 41 + k * 4219), roll = r();
    if (sum > 0 && roll < .55) { // 스테이터스가 높을수록 그 능력치의 묘사가 자주 나온다
      let x = r() * sum, st = keys[0]; for (const kk of keys) { x -= t[kk]; if (x <= 0) { st = kk; break; } }
      out.push({ text: pickR(r, GATHER_STYLE[st][how] || GATHER_STYLE[st]['채집'])(it), kind: 'hit' });
    } else out.push({ text: pickR(r, GATHER_SCENE[how] || GATHER_SCENE['채집'])(place), kind: 'note' });
    { const re = seededRng(base * 67 + k * 131 + 3), ln = re() < .2 ? equipLine('g', re) : ''; if (ln) out.push({ text: ln, kind: 'note' }); } // 착용 장비 묘사 (별도 시드라 기존 문장 순서는 그대로)
  }
  return out;
}
const activityLogFor = (act, now) => { const a = ACTIONS[act.id], k = a && a.kind; return k === 'battle' ? battleLogFor(act, now) : k === 'step' || k === 'trip' ? travelLogFor(act, now) : k === 'gather' ? gatherLogFor(act, now) : []; };
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
  if (chance(RARE_BASE + fx.rare)) { r.items.push([t.rare, 1]); r.text += ` 조사 중 희귀한 ${t.rare}을(를) 발견했습니다!`; }
  else if (chance(INVEST_ITEM)) { const n = pick(t.gather); r.items.push([n, 1]); r.text += ` 조사 중 ${n}을(를) 발견했습니다.`; }
  else r.text += ' 눈에 띄는 물건은 없었습니다.';
  { const ln = chance(.3) ? equipLine('i', Math.random) : ''; if (ln) r.text += ` ${ln}`; }
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
    if (rc) { state.learned.push(rc.out); r.recipe = rc.out; r.text = `25분의 속성학습 끝에 「${rc.out}」 제작법을 익혔습니다. (재료: ${Object.entries(rc.mats).map(([n, q]) => `${n} ×${q}`).join(', ')})`; }
    else r.text = '속성학습을 마쳤습니다. 더 익힐 제작법은 없었습니다.';
    return r;
  }
  if (a.kind === 'tame') {
    const mon = a.pet ? { name: a.pet } : a.terrain.monster, ok = chance(tameChance(act && act.bait));
    r.exp = 12; r.sp = 0; r.spCost = spPaid;
    if (ok) { r.pet = mon.name; r.text = `${mon.name}이(가) 먹이를 받아먹고 경계를 풀었습니다. 길들이기 성공! 「${PET_SPECIES[mon.name].name}」이(가) 곁에 따릅니다.`; }
    else { r.tameFail = true; r.text = `${mon.name}이(가) 먹이만 채 가고 달아났습니다.`; if (chance(.5)) { const h = rand(...a.hazard.hp); r.hp -= h; r.text += ` 달아나며 물려 HP를 ${h} 잃었습니다.`; } }
    floorLoss(r);
    return r;
  }
  const zoneId = id.split(' ')[0], seed = ZONE_SEEDS[zoneId], jf = jobFx(), dd = (act && Number.isFinite(act.d) ? clamp(act.d, 0, 1) : 0);
  const bag = {}, add = (n, q) => { bag[n] = (bag[n] || 0) + q; };
  let done = 0, wins = 0, losses = 0, greats = 0, accidents = 0, stop = '', lowered = 0;
  const rep0 = repeatCount(id);
  for (let i = 0; i < cycles; i++) {
    if (i > 0 && state.vitals.hp + r.hp <= HP_RETREAT) { stop = `HP가 ${HP_RETREAT} 이하로 떨어져 중단했습니다.`; break; }
    const great = a.kind === 'gather' && chance(fx.ggreat), mult = great ? 2 : 1, keep = chance((a.kind === 'gather' ? Math.min(1, GATHER_FIND + weatherFx().gather) : 1) * (a.kind === 'gather' ? gatherRepeat : repeatChance)(rep0 + i + 1));
    if (!keep) lowered++;
    if (great) greats++;
    if (a.kind === 'gather') {
      if (keep) { const it = pick(a.items); add(it, rand(1, 3) * mult); if (chance((jf.gather[a.method] || 0) + masteryBonus(a.method).gather)) add(it, 1); if (dd && chance(DEPTH_GATHER.more * dd)) add(it, 1); if (a.rare && chance(RARE_BASE + fx.rare + DEPTH_GATHER.rare * dd)) add(a.rare, mult); if (seed && chance(SEED_DROP.gather)) add(seed, 1); if (chance(PERS_SEED_DROP)) add(pick(PERS_SEEDS), 1); }
      r.exp += 6;
      if (chance(a.hazard.chance)) { r.hp -= rand(...a.hazard.hp); accidents++; }
    } else {
      const m = monsterOf(a, act && act.d || 0), b = (br && br.runs[i]) || simulateBattle(m, Math.max(1, state.vitals.hp + r.hp));
      discover('monsters', m.name);
      r.hp -= b.lost;
      if (b.win) { wins++; countKill(m.name); if (!r.buff && chance(WIN_DEBUFF)) r.buff = foeDebuff(m.name); /* 이겨도 가끔 상처가 남는다 */ r.exp += m.exp; r.money += m.cr; if (keep) { if (chance(Math.min(.95, BATTLE_MAT * (1 + DEPTH_DROP * dd)))) add(pick(t.gather), rand(1, 2) * mult); m.drops.forEach(([n, p]) => { if (chance(Math.min(.95, p * (1 + DEPTH_DROP * dd)))) add(n, mult); }); } if (seed && chance(SEED_DROP.battle)) add(seed, 1); }
      else { losses++; r.buff = foeDebuff(m.name); if (act && act.risk) { r.death = true; r.deathWhy = 'battle'; } } // 진 회차는 보상 없이 HP만 잃고(적에 따라 다른 디버프), 남은 회차는 이어간다. HP가 바닥인데 싸워서 지면 사망
    }
    done++;
  }
  { // 분실물: 아주 드물게 구역마다 정해진 물건이 섞여 나온다 (알리지 않는다)
    const lostN = LOST_ITEMS[zoneId], tries = a.kind === 'gather' ? done : wins;
    for (let i = 0; lostN && i < tries; i++) if (chance((LOST_CHANCE[a.kind] || 0) * (1 + LOST_DEPTH * dd))) add(lostN, 1);
  }
  if (a.kind === 'gather' && a.method === '낚시') { // 낚은 물고기마다 크기(cm)가 정해진다. 큰 순서로 몇 마리만 보여 준다
    const sizes = [];
    Object.entries(bag).forEach(([n, q]) => { const rg = FISH_SIZE[n]; if (!rg) return; for (let k = 0; k < Math.min(q, 40); k++) { const u = a.spot ? Math.max(Math.random(), (Math.random() + Math.random()) / 2) : (Math.random() + Math.random()) / 2, big = chance(a.spot ? SPOT_BIG : .03) ? 1.15 : 1; sizes.push([n, Math.round((rg[0] + (rg[1] - rg[0]) * u) * big * 10) / 10]); } });
    sizes.sort((x, y) => y[1] - x[1]);
    const best = {}; sizes.forEach(([n, cm]) => { if (!best[n]) best[n] = cm; });
    r.fish = Object.entries(best);
    r.fishShow = sizes.slice(0, FISH_SHOW).map(([n, cm]) => `${n} ${cm}cm${cm > (state.fishBest[n] || 0) && best[n] === cm ? ' ★신기록' : ''}`);
  }
  r.items = Object.entries(bag);
  if (a.kind === 'gather' && GATHER_KINDS[a.method]) r.mast = [a.method, done]; // 숙련은 결과를 받을 때(claimResult) 오른다
  else if (a.kind === 'battle' && wins) r.mast = ['운동', wins];
  floorLoss(r);
  r.refund = (cycles - done) * per; r.sp = 0; r.spCost = spPaid - r.refund; // 쓰지 않은 회차의 기력은 '회복'이 아니라 소모에서 빼서 보여 준다
  noteRepeat(id, done);
  const tail = [lowered ? (a.kind === 'gather' ? `빈손 ${lowered}회` : `재료를 못 얻은 회차 ${lowered}회`) : '', greats ? `대성공 ${greats}회` : '', accidents ? `사고 ${accidents}회` : '', stop].filter(Boolean).join(' · ');
  if (a.kind === 'gather') r.text = `${t.name}에서 ${done}회 「${a.label}」 했습니다.${tail ? ' ' + tail : ''}${r.fishShow && r.fishShow.length ? `\n낚은 물고기: ${r.fishShow.join(' · ')}` : ''}`;
  else r.text = `${monsterBase(a).name}와(과) ${done}회 교전: ${wins}승 ${losses}패.${tail ? ' ' + tail : ''}`;
  const tg = togetherLine(a.kind === 'gather' ? a.method : 'battle'); if (tg) r.text += `\n${tg}`; // 동행 중이면 함께한 묘사가 붙는다
  return r;
}

const allJournals = () => { const ids = Object.keys(QMARKS); return ids.length > 0 && ids.every(id => (state.journals || {})[id]); }; // 지금 있는 모든 구역의 저널을 모았다 (구역이 늘면 그것까지)
/* 시간이 다 된 행동을 마무리한다. 타일 이동이면 'step', 결과 대기면 true, 아직이면 false */
function finishIfDue() {
  const act = state.active;
  if (!act || nowMs() < act.endAt) return false;
  const a = ACTIONS[act.id];
  state.active = null;
  if (Number.isFinite(act.startAt) && act.endAt > act.startAt) state.actMs = Math.min(1e12, (state.actMs || 0) + (act.endAt - act.startAt)); // 끝낸 행동 시간 누적
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
  const boxed = [];
  r.items.forEach(([n, q]) => { const got = addItem(n, q); if (got < q) { const b = lostBoxPut(n, q - got); if (b) boxed.push([n, b]); if (q - got - b > 0) lost.push([n, q - got - b]); } }); // 가방이 차면 본부 분실물 보관함으로
  state.money = Math.max(0, state.money + r.money);
  if (r.pet) addPet(r.pet);
  if (r.tameFail && state.dungeon) { const tf = state.dungeon.tf || (state.dungeon.tf = {}), k = `${state.dungeon.x},${state.dungeon.y}`; tf[k] = Math.min(TAME_FAIL_MAX, (tf[k] | 0) + 1); }
  (Array.isArray(r.fish) ? r.fish : []).forEach(([n, cm]) => { const rg = FISH_SIZE[n]; if (rg && Number.isFinite(cm) && cm > 0 && cm <= rg[1] * 1.15 + .1 && cm > (state.fishBest[n] || 0)) state.fishBest[n] = cm; });
  v.hp = clamp(v.hp + r.hp, 1, v.hpMax);
  v.sp = clamp(v.sp + r.sp + (r.refund || 0), 0, v.spMax);
  if (r.buff) addBuff(r.buff);
  const ups = gainExp(r.exp), mUp = []; petGain(r.exp);
  if (Array.isArray(r.mast) && (GATHER_KINDS[r.mast[0]] || r.mast[0] === '운동') && Number.isFinite(r.mast[1]) && r.mast[1] > 0) { const u = addMastery(r.mast[0], (r.mast[0] === '운동' ? MASTERY_GAIN.hunt : MASTERY_GAIN.gather) * Math.min(r.mast[1], 1000)); if (u) mUp.push([r.mast[0], u]); }
  state.pending = null;
  save();
  return { id, lost, boxed, ups, result: r, mUp };
}

/* ---------- 본부 분실물 보관함: 가방이 가득 차 못 받은 보상이 여기로 온다 (LOSTBOX_SLOTS 칸, 칸마다 STACK_MAX) ---------- */
function lostBoxPut(name, q, mk = '') { // 넣은 개수를 돌려준다
  if (!ITEMS[name] || !(q > 0)) return 0;
  const box = state.lostBox, stack = ITEMS[name].tab !== '장비'; let left = q;
  if (stack) for (const x of box) { if (x.n !== name || (x.mk || '') !== mk || x.q >= STACK_MAX) continue; const a = Math.min(left, STACK_MAX - x.q); x.q += a; left -= a; }
  while (left > 0 && box.length < LOSTBOX_SLOTS) { const a = stack ? Math.min(left, STACK_MAX) : 1; box.push({ n: name, q: a, ...(mk ? { mk } : {}) }); left -= a; }
  return q - left;
}
function lostBoxTake(i) { // 한 칸을 가방으로 (들어가는 만큼). 성공하면 { n, q }, 실패하면 사유
  const x = state.lostBox[i]; if (!x) return '그 칸이 비어 있어요.';
  if (state.location !== '본부') return '분실물 보관함은 본부에 있어요.';
  const g = addItem(x.n, x.q, x.mk || ''); if (!g) return '가방에 자리가 없어요. 소지품을 정리한 뒤 받으세요.';
  x.q -= g; if (x.q <= 0) state.lostBox.splice(i, 1);
  save(); return { n: x.n, q: g };
}
const bagFull = () => usedSlots() >= bagCapacity();
const BAG_FULL_MSG = '소지품이 가득 찼어요! 탐색하기 전에 버리거나 창고에 맡겨 한 칸 이상 비워 주세요. (못 받은 보상은 본부 분실물 보관함으로 가지만 5칸뿐이에요)';
/* ---------- 분실물 ---------- */
const lostHeld = () => Object.values(LOST_ITEMS).filter(n => countItem(n) > 0);
function turnInLost() { // 캠프에서 분실물을 돌려준다. 성공 { n, tickets } / 사유 문자열
  if (!state.created) return '먼저 캐릭터를 만드세요.';
  if (!state.dungeon || placeKey() !== state.dungeon.zone) return '안전 캠프에서만 돌려줄 수 있습니다.';
  const list = lostHeld(); if (!list.length) return '돌려줄 물건이 없습니다.';
  const first = !state.flags.lostFound;
  let n = 0; list.forEach(x => { n += removeItem(x, countItem(x)); });
  state.lostCount = Math.min(999999, (state.lostCount | 0) + n);
  const tk = n * LOST_REWARD_TICKETS; state.tickets = Math.min(9999, (state.tickets || 0) + tk);
  let gift = null; if (first) { state.flags.lostFound = true; if (addItem('안대', 1)) gift = '안대'; }
  save();
  return { n, tickets: tk, names: list, gift };
}

/* ---------- 제작 ---------- */
/* 재료 분류(MAT_GROUPS: '물고기'·'알'·'과일'): 레시피에 분류 이름이 들어 있으면 그 분류의 아무 아이템이나(또는 고른 것으로) 낼 수 있다. picks = { 분류: 고른 아이템 } */
const groupPick = (g, picks) => { const p = picks && picks[g]; return p && MAT_GROUPS[g] && MAT_GROUPS[g].includes(p) ? p : ''; };
const matCount = (n, picks) => { const g = MAT_GROUPS[n]; if (!g) return countItem(n); const p = groupPick(n, picks); return p ? countItem(p) : g.reduce((a, m) => a + countItem(m), 0); };
const canCraft = (rc, picks) => Object.entries(rc.mats).every(([n, q]) => matCount(n, picks) >= q);
const cheapFirst = g => [...MAT_GROUPS[g]].sort((a, b) => (ITEMS[a].sell || 0) - (ITEMS[b].sell || 0)); // 고르지 않으면 값싼 것부터 쓴다
/* 재료를 실제로 꺼낸다. 쓴 것의 목록 [[이름, 수량]] (제작 취소 시 그대로 돌려준다) */
function takeMats(rc, qty, picks) { // 쓴 재료 [[이름, 수량, 제작자?], ...] (이름 없는 것부터 쓰고, 취소하면 제작자 표시까지 그대로 돌려준다)
  const used = {}, note = (n, took) => took.forEach(([mk, c]) => { const k = n + '\u0001' + mk; used[k] = (used[k] || 0) + c; });
  Object.entries(rc.mats).forEach(([n, q]) => {
    let need = q * qty;
    if (!MAT_GROUPS[n]) { note(n, takeItem(n, need)); return; }
    const p = groupPick(n, picks);
    for (const m of (p ? [p] : cheapFirst(n))) { const t = Math.min(countItem(m), need); if (t > 0) { note(m, takeItem(m, t)); need -= t; } if (need <= 0) break; }
  });
  return Object.entries(used).map(([k, q]) => { const [n, mk] = k.split('\u0001'); return mk ? [n, q, mk] : [n, q]; });
}
/* 제작 아이템의 효과 문장 */
function itemEffectParts(name, plain) { // { base: 기본 효과, extra: 강화·세공·세트 } 문장 목록
  const it = ITEMS[name], base = [], extra = [];
  if (it.use) { if (it.use.hp) base.push(`HP +${it.use.hp} 회복`); if (it.use.sp) base.push(`기력 +${it.use.sp} 회복`); }
  if (it.atk) base.push(`공격력 +${it.atk}`);
  if (it.mods) base.push(...modText(it.mods));
  if (it.petAcc && PET_ACC[name]) base.push(`펫 악세서리 효과: ${PET_ACC[name].text}`); // 펫에게 달았을 때의 효과
  if (plain) { if (it.capacity) base.push(`소지 칸 ${it.capacity}칸`); return { base, extra }; } // 다른 사람의 장비를 볼 때는 내 강화·세공·세트를 붙이지 않는다
  if (reinforceLv(name)) extra.push(`강화 ${REINFORCE_RANKS[reinforceLv(name)]}랭 (공격력 +${reinforceBonus(name)})`);
  if (state.enchants[name]) extra.push(`세공: ${enchantText(state.enchants[name])}`);
  if (nickOf(name)) extra.push(`${state.character.name || '주인'}의 애착이 담긴 무기`);
  { const st = ITEM_SETS.find(x => x.need.includes(name)); if (st) extra.push(`세트 ${st.name}(${st.need.join('+')}): ${modText(st.mods).join(' ')}`); }
  if (it.capacity) base.push(`소지 칸 ${it.capacity}칸`);
  if (it.hold) base.push(`소지만 해도 ${modText(it.hold).join(' ')}`);
  return { base, extra };
}
function itemEffectRaw(name) { // 설명에 없는 착용·사용 효과. 없으면 ''
  const { base, extra } = itemEffectParts(name); return [...base, ...extra].join(' · ');
}
function itemEffect(name) { return itemEffectRaw(name) || '제작 재료'; }
/* 아이템 설명 통일: 1줄 '설명 | 효과'(효과가 없으면 생략), 2줄 '[태그] … [판매가] nCR' */
function itemLines(name, plain, mk) { // mk: 그 제작자 것의 설명 / 안 주면 내 소지품의 제작자들을 모아 보여 준다 (plain=남의 것은 빼고)
  const it = ITEMS[name]; if (!it) return ['', ''];
  const { base, extra } = itemEffectParts(name, plain), b = base.join(' · ');
  const eff = [b && !it.desc.includes(b) ? b : '', ...extra].filter(Boolean).join(' · '); // 기본 효과가 설명에 이미 있으면 빼고, 강화·세공은 항상 붙인다
  const l2 = [it.group ? `[분류] ${it.group}` : '', makerText(name, plain, mk), (it.tags || []).length ? `[태그] ${it.tags.join(' · ')}` : '', it.sell ? `[판매가] ${it.sell}CR` : ''].filter(Boolean).join(' ');
  return [it.desc + (eff ? ` | ${eff}` : ''), l2];
}
function makerText(name, plain, mk) {
  if (typeof mk === 'string') return mk ? `[제작] ${mk}` : '';
  if (plain) return '';
  const vs = itemVariants(name).filter(v => v.mk); if (!vs.length) return '';
  return `[제작] ${vs.map(v => vs.length > 1 || itemVariants(name).length > 1 ? `${v.mk} ×${v.q}` : v.mk).join(' · ')}`;
}
/* 제작 시간(초): 감각 스탯으로 단축 */
const craftMastery = rc => Math.max(0, ...(ITEMS[rc.out].tags || []).filter(t => MASTERY_CRAFT_TAGS.includes(t)).map(t => masteryBonus(t).craftTime));
const craftSec = rc => Math.max(5, Math.round(rc.sec * (1 - Math.min(.6, effects().craftTime + craftMastery(rc)))));
/* 제작 시작. 'ok' / 'mats' / 'space' / 'busy'. 재료는 시작할 때 소모하고, 시간이 지나면 완성된다 (성공률 없음) */
/* 이 아이템을 몇 개까지 더 넣을 수 있나 (빈 칸 + 쌓을 수 있는 자리) */
function roomFor(name) {
  const it = ITEMS[name], list = state.inventory[it.tab], free = Math.max(0, bagCapacity() - usedSlots());
  if (it.tab === '장비') return free;
  return free * STACK_MAX + list.filter(s => s.n === name).reduce((a, s) => a + Math.max(0, STACK_MAX - s.q), 0);
}
/* 지금 재료와 가방 자리로 한 번에 만들 수 있는 최대 개수 */
const maxCraft = (rc, picks) => Math.min(MAX_BATCH, roomFor(rc.out), ...Object.entries(rc.mats).map(([n, q]) => Math.floor(matCount(n, picks) / q)));
const craftTotalSec = (rc, qty) => craftSec(rc) * qty;
function craft(index, qty = 1, picks = null) {
  const rc = RECIPES[index];
  if (!rc) return 'mats';
  qty = intIn(qty, 1, MAX_BATCH, 1);
  if (!recipeKnown(rc)) return 'unknown';
  if (state.crafting) return 'busy';
  if (!canCraft(rc, picks)) return 'mats';
  if (!canAdd(rc.out)) return 'space';
  qty = Math.min(qty, Math.max(1, maxCraft(rc, picks)));
  const used = takeMats(rc, qty, picks);
  const t = nowMs();
  state.crafting = { index, out: rc.out, qty, startAt: t, endAt: t + craftTotalSec(rc, qty) * 1000, great: chance(effects().craftGreat), ready: false, used };
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
  state.crafting = null;
  const mUp = []; (ITEMS[c.out].tags || []).filter(t => TAG_NAMES.includes(t) && !GATHER_KINDS[t] && t !== '농사').forEach(t => { const u = addMastery(t, MASTERY_GAIN.craft * (c.qty || 1) * (CRAFT_MASTERY_MULT[t] || 1)); if (u) mUp.push([t, u]); });
  const jt = (ITEMS[c.out].tags || []).find(t => MASTERY_JOB[t]), mt = jt && masteryTitleOf(jt, masteryLv(jt)); // 제작 숙련 칭호가 있으면 만든 물건에 제작자 표시가 붙는다
  if (mt) relabelItem(c.out, got, `${mt} ${state.character.name || ''}`.trim()); // 이번에 만든 것에만 제작자 이름이 박힌다 (다른 제작자 것과 같은 칸, 따로 센다)
  save();
  return { got, lost: want - got, great: c.great, out: c.out, mUp };
}
/* 제작 취소: 재료를 돌려받는다 */
function cancelCraft() {
  const c = state.crafting;
  if (!c || c.ready) return false;
  if (Array.isArray(c.used) && c.used.length) c.used.forEach(([n, q, mk]) => addItem(n, q, mk || ''));
  else Object.entries(RECIPES[c.index].mats).forEach(([n, q]) => addItem(MAT_GROUPS[n] ? MAT_GROUPS[n][0] : n, q * (c.qty || 1))); // 옛 저장(재료 기록 없음)
  state.crafting = null; save();
  return true;
}

/* ---------- 미궁 (타일맵) ---------- */
const zoneOf = id => DANGER_ZONES.find(z => z.id === id);
function tileOf(z, x, y) { return (z.map[y] || '')[x]; }
const terrainIndex = ch => 'abcde'.indexOf(ch);

/* 타일 정보 { name, desc, terrain } */
const spotAt = (z, x, y) => { const s = FISH_SPOTS[z.id]; return s && s.x === x && s.y === y ? s : null; };
const isNightNow = () => { const h = new Date(nowMs() + 9 * 3600e3).getUTCHours(); return h < 6 || h >= 18; }; // 한국 시간 18시~06시는 밤
function tileInfo(z, ch, x, y, hide) { // hide: 지도 위 마우스오버·이동 확인처럼 멀리서 보는 경우 ('?' 칸은 정체를 감춘다)
  if (hide && ch === '?') return { name: '?', desc: '이 장소에 무언가가 있는 것 같습니다.' };
  const ti = terrainIndex(ch), sp = x === undefined ? null : spotAt(z, x, y);
  if (sp && ti >= 0) return { name: sp.name, desc: sp.desc + ' (큰 물고기가 잡힐 확률 +) ' + z.terrains[ti].desc, terrain: z.terrains[ti], spot: sp };
  if (ti >= 0) { const t = z.terrains[ti]; return { name: t.name, desc: t.desc + (t.rough && ROUGH_EXTRA_SEC[t.rough] ? ` (험난한 지형: 이 칸에 들어갈 때 이동 시간 +${ROUGH_EXTRA_SEC[t.rough] / 60}분)` : ''), terrain: t }; }
  return { S: { name: '입구', desc: '구역으로 돌아갈 수 있는 입구입니다.' }, C: { name: '안전 캠프', desc: '지상 속 안전지대입니다. 안전하게 쉴 수 있습니다.' },
    E: { name: '이벤트 지점', desc: '무언가 일어날 것 같은 장소입니다.' }, '?': z.id && QMARKS[z.id] ? { name: QMARKS[z.id].name, desc: isNightNow() ? QMARKS[z.id].night : QMARKS[z.id].day } : { name: '?', desc: '' } }[ch];
}
/* E 칸의 번호(읽는 순서) */
const eventIndex = (z, x, y) => z.map.slice(0, y).join('').split('E').length - 1 + z.map[y].slice(0, x).split('E').length - 1;
function revealAround(d, mark = true) { // mark=false: 지나가기만 한 칸 — 주변은 보이지만 '밟은 칸'(색이 켜지는 칸)으로는 치지 않는다
  const ex = state.explored[d.zone] || (state.explored[d.zone] = {});
  if (mark) (state.visited[d.zone] || (state.visited[d.zone] = {}))[`${d.x},${d.y}`] = 1;
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
  if (ti >= 0) { const t = z.terrains[ti]; const sp = spotAt(z, state.dungeon.x, state.dungeon.y); return [{ label: sp ? sp.name : t.name, items: [t.actions[0], ...(sp ? sp.ids : []), ...(rescueShown(z, state.dungeon.x, state.dungeon.y, state.dungeon.seed) ? [`${z.id} 대원 구조`] : []), ...tileGatherIds(z, state.dungeon.x, state.dungeon.y, state.dungeon.seed).filter(id => !(sp && ACTIONS[id] && ACTIONS[id].method === '낚시' && sp.fish.includes(ACTIONS[id].items[0]))), tileBattleId(z, t, state.dungeon.x, state.dungeon.y, state.dungeon.seed), ...(tameShown(z, state.dungeon.x, state.dungeon.y, state.dungeon.seed) ? [t.tameId] : []), ...(tameShown2(z, state.dungeon.x, state.dungeon.y, state.dungeon.seed) ? [t.tameId2] : [])] }]; }
  if (ch === 'C') return [{ label: '안전 캠프', items: ['캠프 휴식', '임무 수주', '상점', '모닥불 주사위', ...(lostHeld().length ? ['분실물 전달'] : [])] }];
  if (ch === 'S') return [{ label: '입구', items: ['퇴장'] }];
  if (ch === '?' && QMARKS[z.id]) return [{ label: QMARKS[z.id].name, items: [`${z.id} 시간을 보낸다`, ...(allJournals() && QMARK_ACTS[z.id] ? QMARK_ACTS[z.id].map(q => q.id) : [])] }];
  return [];
}
/* 타일 이동 계획: 지금 칸에서 (tx,ty)까지 벽을 피한 최단 경로. { path:[[x,y]..], steps, sec, sp } / { err } */
/* 칸에 들어갈 때 걸리는 초: 기본 + 험난한 지형 추가 시간 */
function tileSec(z, x, y) { const ti = terrainIndex(tileOf(z, x, y)), r = ti >= 0 ? (z.terrains[ti].rough || 0) : 0; return Math.round(paceSec() + ROUGH_EXTRA_SEC[r]); }
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
  return { path, cum, steps: path.length, sec: acc, sp: path.length * DUNGEON_STEP_SP, rough: path.filter(([x, y]) => tileSec(z, x, y) > Math.round(paceSec())).length };
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
  state.results = []; // 다른 행동을 시작하면 지난 결과 카드는 닫는다
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
    petGainRaw(PET_XP_STEP); d.x = x; d.y = y; revealAround(d, i === path.length - 1); // 누른 칸(경로의 끝)만 밟은 칸으로 친다
    const tz = terrainIndex(tileOf(z, x, y));
    if (tz >= 0) {
      discover('zones', `${z.id}:${z.terrains[tz].name}`);
      if (chance(TRAVEL_FIND + effects().rare * .05 + effects().travelFind + petFx('find'))) { const n = pick(z.terrains[tz].gather); if (addItem(n, 1)) travelFinds.push(n); } // 길가에서 아주 드물게 재료를 줍는다
    }
  }
  const ch = tileOf(z, d.x, d.y);
  if (ch === 'E') {
    const idx = eventIndex(z, d.x, d.y);
    if (!d.done.includes(idx)) {
      d.done.push(idx); state.eventAt[`${d.zone}:${idx}`] = nowMs();
      const ev = z.events[idx % z.events.length];
      const er = { text: `${ev.title} — ${ev.text}`, items: ev.items || [], exp: ev.exp || 0, money: ev.money || 0, hp: ev.hp || 0, sp: ev.sp || 0, spCost: 0, buff: null };
      if (er.hp < 0 && chance(effects().travelHurt)) { er.hp = 0; er.text += ' 민첩하게 몸을 피해 다치지 않았다.'; } // 민첩: 이동 중 사건으로 다칠 확률 감소
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
  Object.assign(state.character, { name, age, keywords: cleanText(f.keywords, 60), ability, abilityDesc: cleanText(f.abilityDesc, 300), mainStat: STAT_DEFS.some(d => d.key === f.mainStat) ? f.mainStat : '', subStat: STAT_DEFS.some(d => d.key === f.subStat) && f.subStat !== f.mainStat ? f.subStat : '', level: 1, rank: 'F', title: TITLES[0] });
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
function locKey() { // 서버에 알리는 '내 위치': 같은 값이면 같은 칸. 개인실은 비공개('')
  if (state.dungeon) return `${state.dungeon.zone}:${state.dungeon.x},${state.dungeon.y}`.slice(0, 40);
  return state.location === '개인실' ? '' : String(state.location || '').slice(0, 40);
}
function placeKey() {
  if (state.dungeon) { const z = zoneOf(state.dungeon.zone); return tileOf(z, state.dungeon.x, state.dungeon.y) === 'C' ? z.id : null; }
  return state.location;
}
const canAbandon = q => !!q && !!(q.board || q.promo || q.cap) && !!state.questTaken[q.id] && !state.questDone[q.id]; // 수주한 임무·승급 시험은 포기할 수 있다 (기본 메인 임무 제외)
function abandonQuest(id) {
  const q = QUESTS.find(x => x.id === id); if (!canAbandon(q)) return '포기할 수 없는 임무입니다.';
  needParts(q).forEach((_, i) => delete state.qprog[progKey(q, i)]); delete state.questTaken[q.id]; delete state.questAt[q.id]; save();
  return null;
}
const isTaken = q => (q.board || q.promo || q.cap) ? !!state.questTaken[q.id] : true;
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
  if (state.questDone[id]) return q.once ? '이미 완수한 임무입니다.' : '이미 완수한 임무입니다. 24시간 뒤에 다시 나타납니다.';
  if (state.questTaken[id]) return '이미 수주한 임무입니다.';
  if (activeBoard().length >= BOARD_MAX_ACTIVE) return `수주 임무는 동시에 ${BOARD_MAX_ACTIVE}개까지 진행할 수 있습니다.`;
  state.questTaken[id] = true; state.qprog[id] = 0; state.questAt[id] = nowMs(); save();
  return null;
}
/* 임무 리셋(오전 4시): 완수해 둔 임무만 처음 상태로 돌아가 다시 수주할 수 있다. 진행 중인 임무와 진행도는 유지된다. 리셋된 임무 수 */
function resetBoardQuests() {
  let n = 0;
  QUESTS.filter(q => q.board && !q.once && state.questTaken[q.id] && state.questDone[q.id]).forEach(q => { // 한 번만 하는 기본 임무(once)는 되돌리지 않는다
 // 완수해 둔 임무만 다시 받을 수 있게 되돌린다. 지금 진행 중인 임무와 진행도는 건드리지 않는다
    if (!state.questAt[q.id]) state.questAt[q.id] = nowMs(); // 옛 저장: 지금부터 센다
    if (nowMs() < nextBoardReset(state.questAt[q.id])) return;
    needParts(q).forEach((_, i) => delete state.qprog[progKey(q, i)]);
    delete state.questTaken[q.id]; delete state.questDone[q.id]; delete state.questAt[q.id]; n++;
  });
  if (n) save();
  return n;
}
const nextBoardReset = t => Math.floor((t + (9 - BOARD_RESET_HOUR) * 3600000) / 86400000 + 1) * 86400000 - (9 - BOARD_RESET_HOUR) * 3600000; // 수주 뒤 처음 맞는 한국 시간 오전 4시
const boardResetLeft = id => state.questAt[id] ? Math.max(0, nextBoardReset(state.questAt[id]) - nowMs()) : 0;
/* 승급: 지금 등급의 다음 등급 시험(메인 임무). 없으면 null (B등급 이후는 아직 없음) */
const nextPromo = () => { const i = PROMO_ORDER.indexOf(state.character.rank); if (i >= 0 && i < PROMO_ORDER.length - 1) return QUESTS.find(q => q.promo === PROMO_ORDER[i + 1]); return 'AS'.includes(state.character.rank) && !state.flags.cap35 ? QUESTS.find(q => q.id === 'limit_35') : null; }; // A등급 다음은 한계 돌파 임무
function levelCap() { return state.flags && state.flags.cap35 ? MAX_LEVEL : LEVEL_CAP_BASE; }
function takePromo() {
  const q = nextPromo();
  if (!state.created) return '먼저 캐릭터를 만드세요.';
  if (state.location !== '본부') return '승급 시험은 본부에서 받을 수 있습니다.';
  if (!q) return state.flags.cap35 ? '모든 승급과 한계 돌파를 마쳤습니다.' : '지금은 더 받을 수 있는 시험이 없습니다.';
  if (state.questTaken[q.id]) return '이미 승급 시험을 받았습니다.';
  if (state.character.level < q.lv) return `Lv.${q.lv} 이상이어야 받을 수 있습니다.`;
  state.questTaken[q.id] = true; needParts(q).forEach((_, i) => { state.qprog[progKey(q, i)] = 0; }); save();
  return null;
}
/* { cur, max, text, ready } — multi는 조건별 진행을 합쳐 보여준다 */
function partProgress(q, n, i) {
  if (n.type === 'visit') { const cur = n.zones.filter(id => state.codex.zones[id]).length; return { cur, max: n.zones.length, text: `${cur}/${n.zones.length} 구역 방문`, ready: cur >= n.zones.length }; }
  if (n.type === 'item') { const cur = Math.min(countItem(n.name), n.qty); return { cur, max: n.qty, text: `${n.name} ${cur}/${n.qty}${n.consume ? ' (납품)' : ''}`, ready: cur >= n.qty }; }
  if (n.type === 'recipe') { const cur = Math.min(state.learned.length, n.qty); return { cur, max: n.qty, text: `레시피 습득 ${cur}/${n.qty}`, ready: cur >= n.qty }; }
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
const questReady = q => !!q && isTaken(q) && !state.questDone[q.id] && questProgress(q).ready;
/* 보상 아이템 중 가방에 못 들어가는 몫: [[이름, 수량]...]. 납품으로 비는 칸을 반영하고, drop(이름→수량)은 미리 포기한 보상. 상태는 바꾸지 않는다 */
function questOverflow(q, drop = {}) {
  const inv = JSON.parse(JSON.stringify(state.inventory)), cap = bagCapacity(), used = () => Object.values(inv).reduce((a, l) => a + l.length, 0), out = [], dl = { ...drop };
  needParts(q).forEach(n => { if (!n.consume) return; const l = inv[ITEMS[n.name].tab]; let left = n.qty; for (let i = l.length - 1; i >= 0 && left > 0; i--) { if (l[i].n !== n.name) continue; const a = Math.min(left, l[i].q); l[i].q -= a; left -= a; if (!l[i].q) l.splice(i, 1); } });
  (q.reward.items || []).forEach(([name, c]) => {
    if (!ITEMS[name]) return; const cut = Math.min(c, dl[name] || 0); dl[name] = (dl[name] || 0) - cut; let left = c - cut; const it = ITEMS[name], list = inv[it.tab], stack = it.tab !== '장비';
    if (stack) for (const x of list) { if (x.n !== name || x.q >= STACK_MAX) continue; const a = Math.min(left, STACK_MAX - x.q); x.q += a; left -= a; }
    while (left > 0 && used() < cap) { const a = stack ? Math.min(left, STACK_MAX) : 1; list.push({ n: name, q: a }); left -= a; }
    if (left > 0) out.push([name, left]);
  });
  return out;
}
/* 소지품 한 칸(스택)을 통째로 버린다. 성공하면 { name, q }, 실패하면 사유 */
function discardStack(tab, idx, name) {
  const l = state.inventory[tab], st = l && l[idx];
  if (!st || st.n !== name) return '그 칸이 바뀌었습니다.';
  l.splice(idx, 1);
  if (tab === '장비' && !l.some(s => s.n === name) && !Object.values(state.equipment).includes(name) && !(state.storage[name] > 0)) { delete state.enchants[name]; delete state.reinforce[name]; delete state.nicks[name]; delete state.engraves[name]; }
  syncMax(); save();
  return { name, q: st.q };
}
function completeQuest(id, drop = {}) {
  const q = QUESTS.find(x => x.id === id);
  if (!q || !isTaken(q) || state.questDone[id] || !questProgress(q).ready) return null;
  needParts(q).forEach(n => { if (n.consume) removeItem(n.name, n.qty); });
  state.questDone[id] = true;
  state.questCount = (state.questCount || 0) + 1; const ticket = state.questCount % TICKET_EVERY === 0; if (ticket) state.tickets = Math.min(9999, (state.tickets || 0) + 1);
  if (q.promo) { state.character.rank = q.promo; } // 승급 시험을 마치면 등급이 오른다
  if (q.cap) state.flags.cap35 = true; // 한계 돌파: 최고 레벨 35
  state.money += q.reward.money || 0;
  const dl = { ...drop }; (q.reward.items || []).forEach(([n, c]) => { const cut = Math.min(c, dl[n] || 0); dl[n] = (dl[n] || 0) - cut; if (c - cut > 0) addItem(n, c - cut); });
  const ups = gainExp(q.reward.exp || 0);
  save();
  if (q.cap) gainExp(0);
  return { ups, promo: q.promo || null, cap: q.cap || null, ticket };
}

/* ---------- 상점 ---------- */
const SHOP_TABS = ['기본 보급품', '장비', '소모품', '재료', '판매'];
const shopAt = id => (SHOPS[id] && SHOPS[id].at) || id;           // 상점이 있는 장소 (보급품 상점·종합 상가는 상점가)
const shopTabs = id => (SHOPS[id] && SHOPS[id].tabs) || SHOP_TABS; // 상점마다 탭이 다르다
const RECIPE_PRICE = { F: 150, E: 350, D: 800 };                    // 레시피 구입가(등급별)
/* 상점의 구입 탭별 목록: { 탭: [[이름, 가격]...] }. 캠프는 기본 보급품(base) + 특별 상품(special)을 분류로 나누고, 상점가 상점은 sections 를 그대로 쓴다 */
function shopSections(place) {
  const shop = SHOPS[place];
  if (!shop) return null;
  if (shop.sections) return Object.fromEntries(Object.entries(shop.sections).map(([k, v]) => [k, [...v]]));
  const sec = { '기본 보급품': [...shop.base], '장비': [], '소모품': [], '재료': [] };
  shop.special.forEach(r => sec[ITEMS[r[0]].tab].push(r));
  return sec;
}
const shopRows = place => { const sec = shopSections(place); return sec ? Object.values(sec).flat() : []; };
/* 구입. 성공하면 null, 아니면 사유 */
function buyItem(place, name, qty = 1) {
  const shop = SHOPS[place], row = shop && shopRows(place).find(r => r[0] === name);
  if (!row || !ITEMS[name]) return '이 상점에서 팔지 않는 물건입니다.';
  if (!state.created) return '먼저 캐릭터를 만드세요.';
  if (placeKey() !== shopAt(place)) return '지금 있는 장소의 상점이 아닙니다.';
  qty = intIn(qty, 1, 99, 1);
  const total = row[1] * qty;
  if (state.money < total) return `CR이 부족합니다. (필요 ${total} CR)`;
  if (!canAdd(name) || (ITEMS[name].tab === '장비' && usedSlots() + qty > bagCapacity())) return '가방에 빈 칸이 없습니다.';
  const got = addItem(name, qty);
  if (got < qty) { if (got) removeItem(name, got); return '가방에 빈 칸이 없습니다.'; }
  state.money -= total; save();
  return null;
}
/* 레시피 판매(보급품 상점): 아직 모르는 레시피를 CR로 바로 배운다. 등급이 모자라면 살 수 없다 */
const recipePrice = rc => RECIPE_PRICE[rc.rank] || RECIPE_PRICE.F;
const recipesForSale = () => RECIPES.filter(rc => !recipeKnown(rc));
function buyRecipe(out) {
  const rc = RECIPES.find(r => r.out === out);
  if (!rc) return '없는 레시피입니다.';
  if (!state.created) return '먼저 캐릭터를 만드세요.';
  if (placeKey() !== shopAt('보급품 상점')) return '지금 있는 장소의 상점이 아닙니다.';
  if (recipeKnown(rc)) return '이미 알고 있는 레시피입니다.';
  if (!rankAtLeast(rc.rank)) return `${rc.rank}등급 이상이어야 살 수 있습니다.`;
  if (state.money < recipePrice(rc)) return `CR이 부족합니다. (필요 ${recipePrice(rc)} CR)`;
  state.money -= recipePrice(rc); state.learned.push(out); save();
  return null;
}
/* ---------- 뽑기 ---------- */
const gachaSet = () => GACHA_SETS[state.gacha.pat] || GACHA_SETS[0];
const prizeText = pr => pr.money ? `${pr.money.toLocaleString()} CR` : `${pr.item[0]} ×${pr.item[1]}`;
/* 한 번 뽑는다. { rank(1~5), prize, changed } / 사유(문자열). 가방에 못 담는 경품이면 뽑기권을 쓰지 않는다 */
function drawGacha(roll = Math.random()) {
  if (!state.created) return '먼저 캐릭터를 만드세요.';
  if (placeKey() !== '상점가') return '뽑기 기계는 상점가에 있습니다.';
  if (state.tickets < 1) return '뽑기권이 없습니다.';
  let acc = 0, rank = GACHA_RATES.length;
  for (let i = 0; i < GACHA_RATES.length; i++) { acc += GACHA_RATES[i]; if (roll < acc) { rank = i + 1; break; } }
  const set = gachaSet(), prize = set.prizes[rank - 1];
  if (prize.item && !canAdd(prize.item[0])) return '가방에 빈 칸이 없습니다. 경품을 받을 자리를 비워 주세요.';
  if (prize.item && (ITEMS[prize.item[0]].tab === '장비') && usedSlots() + prize.item[1] > bagCapacity()) return '가방에 빈 칸이 없습니다. 경품을 받을 자리를 비워 주세요.';
  if (prize.item) { const got = addItem(prize.item[0], prize.item[1]); if (got < prize.item[1]) { if (got) removeItem(prize.item[0], got); return '가방에 빈 칸이 없습니다. 경품을 받을 자리를 비워 주세요.'; } }
  else state.money += prize.money;
  state.tickets--; state.gacha.pulls++;
  let changed = false;
  if (rank === 1) { state.gacha.wins++; state.gacha.pat = (state.gacha.pat + 1) % GACHA_SETS.length; changed = true; } // 1등이 나오면 경품 묶음이 바뀐다
  save();
  return { rank, prize, changed };
}
/* 판매: 가방에 있는 아이템(착용 중인 것은 제외)을 팔 수 있는 장소(상점)에서 sell 가격으로 판다 */
const sellPrice = name => (ITEMS[name] && ITEMS[name].sell) || 0;
const sellable = () => Object.values(state.inventory).flat().filter(s => sellPrice(s.n) > 0);
function sellItem(place, name, qty = 1, mk) {
  if (!SHOPS[place] || placeKey() !== shopAt(place)) return '지금 있는 장소의 상점이 아닙니다.';
  if (!state.created) return '먼저 캐릭터를 만드세요.';
  if (!sellPrice(name)) return '상점에서 사지 않는 물건입니다.';
  qty = intIn(qty, 1, 9999, 1);
  const have = countItem(name, mk);
  if (!have) return '그 아이템을 가지고 있지 않습니다.';
  qty = Math.min(qty, have);
  if (!removeItem(name, qty, mk)) return '판매하지 못했습니다.';
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
  const fx = { craftTime: 0, farmTime: 0, farmYield: 0, gather: {}, heal: {}, atk: 0 }, j = state.subjob;
  if (!j || (!always && !jobActive())) return fx;
  const lv = j.level;
  j.tags.forEach(t => {
    if (GATHER_KINDS[t]) fx.gather[t] = Math.min(.3, lv * .03);
    else if (['목공', '재봉', '대장', '가죽공예', '보석공예'].includes(t)) fx.craftTime = Math.min(.3, fx.craftTime + lv * .03);
    else if (t === '농사') { fx.farmTime = Math.min(.3, lv * .03); fx.farmYield = Math.min(.4, lv * .04); }
    else if (t === '운동') fx.atk = Math.min(.2, lv * .02);
    else fx.heal[t] = Math.min(.4, lv * .04);
  });
  return fx;
}
const healBonus = name => Math.max(0, ...(ITEMS[name].tags || []).map(t => (jobFx().heal[t] || 0) + masteryBonus(t).heal));
const jobFxText = (always) => {
  const f = jobFx(always), p = [];
  Object.entries(f.gather).forEach(([t, v]) => p.push(`${t} 수확 +1개 확률 ${Math.round(v * 100)}%`));
  if (f.craftTime) p.push(`제작 시간 -${Math.round(f.craftTime * 100)}%`);
  if (f.farmTime) p.push(`작물 성장 시간 -${Math.round(f.farmTime * 100)}% · 수확 +1개 확률 ${Math.round(f.farmYield * 100)}%`);
  if (f.atk) p.push(`사냥 공격력 +${Math.round(f.atk * 100)}%`);
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
  const mGain = {}; // 납품한 물건의 태그 중 이 서브잡 태그(채집·채굴·낚시 제외)에 숙련도가 쌓인다
  list.forEach(([n, q, price]) => { removeItem(n, q); pay += q * price; (ITEMS[n].tags || []).filter(t => j.tags.includes(t) && TAG_NAMES.includes(t) && !GATHER_KINDS[t]).forEach(t => { mGain[t] = (mGain[t] || 0) + q * MASTERY_GAIN.job; }); });
  const mUp = []; Object.entries(mGain).forEach(([t, g]) => { const u = addMastery(t, g); if (u) mUp.push([t, u]); });
  pay = Math.round(pay * 1.25); state.money += pay; j.lastAt = nowMs();
  let up = false;
  if (j.level < JOB_MAX_LV && ++j.prog >= jobProgNeed(j.level)) { j.level++; j.prog = 0; up = true; }
  save();
  return { n: need, pay, up, mGain, mUp };
}

/* ---------- 농장 ---------- */
const farmPlotCount = () => FARM_PLOTS[state.character.rank] || FARM_PLOTS.F;
const growMs = crop => Math.round(CROPS[crop].grow * 60000 * (1 - Math.min(.7, jobFx().farmTime + effects().farmTime + masteryBonus('농사').farmTime)));
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
  const c = CROPS[p.crop], qty = rand(...c.yield) + (chance(jobFx().farmYield + masteryBonus('농사').farmYield) ? 1 : 0), got = addItem(p.crop, qty);
  if (got < qty) { if (got) removeItem(p.crop, got); return '가방에 빈 칸이 없습니다.'; }
  state.farm.plots[i] = null; const up = addMastery('농사', MASTERY_GAIN.farm); save();
  return { crop: p.crop, qty, mUp: up ? ['농사', up] : null };
}

/* ---------- 펫 ---------- */
const petCap = () => Object.keys(PET_SPECIES).length; // 펫 보관함: 종마다 한 마리씩 모으는 도감식 (중복 불가), 소지품과 별도
const petDrainMs = p => PET_FULL_DRAIN_MS * (1 + Math.max(0, Math.min(100, p.bond | 0)) / PET_BOND_SLOW); // 친밀도가 높을수록 배가 늦게 꺼진다 (친밀도 100 = 2배 느리게)
const petFull = p => !p ? 0 : !Number.isFinite(p.full) ? Math.max(0, PET_FULL_MAX * (1 - (nowMs() - (p.fedAt || 0)) / PET_FED_MS)) : Math.max(0, Math.min(PET_FULL_MAX, p.full - (nowMs() - (p.fullAt || 0)) / petDrainMs(p) * PET_FULL_MAX)); // 지금 배부름 0~100 (배부름 필드가 없는 펫은 옛 방식 fedAt 으로)
const petEmptyAt = p => !Number.isFinite(p.full) ? (p.fedAt || 0) + PET_FED_MS : (p.fullAt || 0) + p.full / PET_FULL_MAX * petDrainMs(p); // 배가 완전히 비는 시각
const petFed = p => petFull(p) > 0;
const feedFull = item => Math.round(PET_FULL_GAIN * (item === PET_FOOD ? FOOD_BOND_MULT : 1));
function petHungerTick() { // 배가 빈 채로 PET_HUNGRY_MS 가 지날 때마다 친밀도가 준다 (탐험 중에는 멈춤). 바뀌면 true
  let ch = false; const t = nowMs();
  state.pets.forEach(p => {
    if (p.exp) return;
    const from = Math.max(petEmptyAt(p), p.decayAt || 0), n = Math.floor((t - from) / PET_HUNGRY_MS);
    if (n < 1) return;
    p.decayAt = from + n * PET_HUNGRY_MS; p.bond = Math.max(0, p.bond - n * PET_HUNGRY_BOND); ch = true;
  });
  if (ch) save();
  return ch;
}
const petAcc = p => (p && PET_ACC[p.acc]) || {};
const petBuff = p => Math.min(.5, PET_SPECIES[p.id].base * (.5 + p.bond / 200) * (1 + ((p.lv || 1) - 1) * PET_LV_SPEED) + (petAcc(p).spd || 0)); // 이동속도 증가 비율 (타일 이동 시간 단축)
const petLevelUps = []; // 펫이 레벨업한 기록 (UI가 비우며 알림)
const petFx = k => { const p = activePet(); return p && !p.exp && petFed(p) ? petAcc(p)[k] || 0 : 0; }; // 함께 다니는 든든한 펫의 악세서리 효과
function petGainRaw(x) { // 함께 다니는 든든한 펫만 EXP를 얻는다
  const p = activePet(); if (!p || p.exp || !petFed(p) || !(x > 0) || (p.lv || 1) >= PET_MAX_LV) return;
  p.pxp = (p.pxp || 0) + Math.max(1, Math.round(x * (1 + (petAcc(p).pxp || 0))));
  while (p.lv < PET_MAX_LV && p.pxp >= petXpMax(p.lv)) { p.pxp -= petXpMax(p.lv); p.lv++; petLevelUps.push({ name: petName(p), lv: p.lv }); }
  if (p.lv >= PET_MAX_LV) p.pxp = 0;
}
const petGain = exp => petGainRaw(exp * PET_XP_SHARE);
/* 악세서리 달기 / 벗기기. 성공하면 null, 아니면 사유 */
function petEquip(i, name) {
  const p = state.pets[i];
  if (!p) return '펫이 없습니다.';
  if (p.exp) return '탐험 중인 펫에게는 달아 줄 수 없습니다.';
  if (!PET_ACC[name] || countItem(name) < 1) return '가지고 있지 않은 악세서리입니다.';
  const old = p.acc;
  if (!removeItem(name, 1)) return '가지고 있지 않은 악세서리입니다.';
  if (old && !addItem(old, 1)) { addItem(name, 1); return '가방이 가득 차서 기존 악세서리를 뺄 수 없습니다.'; }
  p.acc = name; save(); return null;
}
function petUnequip(i) {
  const p = state.pets[i];
  if (!p || !p.acc) return '벗길 악세서리가 없습니다.';
  if (p.exp) return '탐험 중인 펫의 악세서리는 벗길 수 없습니다.';
  if (!addItem(p.acc, 1)) return '가방이 가득 찼습니다.';
  p.acc = ''; save(); return null;
}
const activePet = () => state.pets[state.petActive] || null;
const petSpeed = () => { const p = activePet(); return p && petFed(p) ? petBuff(p) : 0; };
const stepSec = () => DUNGEON_STEP_SEC * (1 - petSpeed());
const baitItems = () => Object.values(state.inventory).flat().filter(s => ITEMS[s.n].feed).map(s => s.n).sort((a, b) => ITEMS[a].feed - ITEMS[b].feed);
const tameChance = bait => clamp(TAME_BASE + totalStats().sen * .02 + (bait === PET_FOOD ? TAME_FOOD_BONUS : 0), 0, .8);
const feedGain = n => Math.round((ITEMS[n].feed || 0) * (n === PET_FOOD ? FOOD_BOND_MULT : 1));
function addPet(id) {
  if (!PET_SPECIES[id] || state.pets.some(p => p.id === id) || state.pets.length >= petCap()) return false;
  state.pets.push({ id, lv: 1, pxp: 0, acc: '', bond: PET_BOND_START, fedAt: 0, full: 0, fullAt: nowMs(), decayAt: nowMs(), exp: null, pers: pick(PET_PERS_LIST) });
  if (state.petActive < 0) state.petActive = 0;
  save();
  return true;
}
/* 먹이: 작물 / 펫 사료. 든든함이 24시간 유지되고 친밀도가 오른다 */
const bowlTotal = () => Object.values(state.petBowl || {}).reduce((a, b) => a + b, 0);
const isHerb = n => PET_PERS_LIST.some(k => PET_PERS[k].herb === n);
function bowlPut(name, qty) { // 소지품 → 먹이통 (개인실, 작물·펫 사료만. 성격 허브는 직접 줘야 한다). 성공 null / 사유
  if (state.location !== '개인실') return '먹이통은 개인실에 있어요.';
  if (!ITEMS[name] || !ITEMS[name].feed || isHerb(name)) return '먹이통에는 작물이나 펫 사료만 넣을 수 있어요.';
  const room = PET_BOWL_MAX - bowlTotal(); if (room <= 0) return `먹이통이 가득 찼어요. (최대 ${PET_BOWL_MAX}개)`;
  const n = removeItem(name, Math.min(intIn(qty, 1, PET_BOWL_MAX, 1), room)); if (!n) return '그 간식이 소지품에 없어요.';
  state.petBowl = state.petBowl || {}; state.petBowl[name] = (state.petBowl[name] || 0) + n; save(); return null;
}
function bowlTake(name) { // 먹이통 → 소지품 (전부). 담은 개수
  const q = (state.petBowl || {})[name] | 0; if (!q) return 0;
  const g = addItem(name, q); if (g >= q) delete state.petBowl[name]; else state.petBowl[name] = q - g; save(); return g;
}
function bowlAutoFeed() { // 함께 다니지 않고 탐험 중도 아닌 펫이 배고프면 먹이통에서 먹는다 (싼 것부터). 먹은 펫 이름 목록
  const ate = [];
  state.pets.forEach((p, i) => {
    if (i === state.petActive || p.exp || petFull(p) >= PET_BOWL_AT) return;
    const n = Object.keys(state.petBowl || {}).filter(k => state.petBowl[k] > 0).sort((a, b) => (ITEMS[a].feed || 0) - (ITEMS[b].feed || 0))[0]; if (!n) return;
    if (!--state.petBowl[n]) delete state.petBowl[n];
    const t = nowMs(); p.full = Math.min(PET_FULL_MAX, petFull(p) + feedFull(n)); p.fullAt = t; p.decayAt = t; p.fedAt = t;
    p.bond = Math.min(100, p.bond + feedGain(n) + (petAcc(p).bond || 0)); ate.push(petName(p));
  });
  if (ate.length) save();
  return ate;
}
function quickSet(name) { // 소모품을 퀵슬롯 빈 칸에 등록. 성공 null / 사유
  if (!ITEMS[name] || !ITEMS[name].use) return '사용할 수 있는 소모품만 퀵슬롯에 넣을 수 있어요.';
  if (!Array.isArray(state.quick) || state.quick.length !== QUICK_SLOTS) state.quick = Array.from({ length: QUICK_SLOTS }, (_, i) => (state.quick || [])[i] || null);
  if (state.quick.includes(name)) return '이미 퀵슬롯에 있어요.';
  const i = state.quick.indexOf(null); if (i < 0) return `퀵슬롯이 가득 찼어요. (오른쪽 클릭으로 빼기)`;
  state.quick[i] = name; save(); return null;
}
function quickClear(i) { if (state.quick[i]) { state.quick[i] = null; save(); return true; } return false; }
function feedPet(i, item) {
  const p = state.pets[i], it = ITEMS[item];
  const ce = petCareErr(i); if (ce) return ce;
  if (!it || !it.feed) return '펫이 먹을 수 없는 아이템입니다.';
  const herb = PET_PERS_LIST.find(k => PET_PERS[k].herb === item); // 성격 허브를 간식으로 주면 성격이 바뀐다
  if (herb && p.pers === herb) return `${petName(p)}은(는) 이미 ${herb} 성격입니다.`;
  if (!removeItem(item)) return '먹이가 없습니다.';
  if (herb) p.pers = herb;
  const t = nowMs(); p.full = Math.min(PET_FULL_MAX, petFull(p) + feedFull(item)); p.fullAt = t; p.decayAt = t;
  p.bond = Math.min(100, p.bond + feedGain(item) + (petAcc(p).bond || 0)); p.fedAt = t; save();
  return null;
}
/* 돌보기(간식·쓰다듬기·기분 묻기): 개인실에서, 또는 함께 다니는 펫이면 어디서든 */
function petCareErr(i) {
  const p = state.pets[i];
  if (!p) return '펫이 없습니다.';
  if (p.exp) return '탐험 중인 펫은 돌볼 수 없습니다.';
  if (state.location !== '개인실' && state.petActive !== i) return '함께 다니지 않는 펫은 개인실에서 돌볼 수 있습니다.';
  return null;
}
const petCry = p => { const h = PET_CRY.find(([k]) => PET_SPECIES[p.id].name.includes(k) || p.id.includes(k)); return h ? h[1] : '끼잉'; };
function petMood(p) {
  const fed = petFed(p);
  if (!fed) return p.bond >= 60 ? '조금 출출함' : p.bond >= 30 ? '배고픔' : '시무룩함';
  return p.bond >= 80 ? '아주 행복함' : p.bond >= 50 ? '기분 좋음' : p.bond >= 25 ? '편안함' : '아직 낯설어함';
}
const petTalk = p => `${petName(p)}: ${petCry(p)} (${petName(p)}은(는) ${PET_FEEL[petMood(p)] || '평온한 기분을 느끼는 것 같다'})`;
function petAskMood(i) { const e = petCareErr(i); return e ? { err: e } : { text: petTalk(state.pets[i]) }; }
function petStroke(i) { // 쓰다듬기: 친밀도 +1, 펫마다 10분에 한 번
  const e = petCareErr(i); if (e) return { err: e };
  const p = state.pets[i], t = nowMs(), left = p.petAt + PET_STROKE_MS - t;
  if (left > 0) return { err: `${petName(p)}은(는) 방금 쓰다듬었어요. ${Math.ceil(left / 60000)}분 뒤에 다시 쓰다듬을 수 있어요.` };
  p.petAt = t; const up = p.bond < 100; p.bond = Math.min(100, p.bond + PET_STROKE_BOND + (petAcc(p).bond || 0)); save();
  return { text: `${petName(p)}: ${petCry(p)} ${petLineFill(pick(PET_PAT[petPersOf(p)]), p)}${up ? ` (친밀도 +${PET_STROKE_BOND})` : ''}` };
}
/* 성격에 따라 바뀌는 문구 */
const petPersOf = p => PET_PERS[p && p.pers] ? p.pers : PET_PERS_LIST[0];
const petLineFill = (t, p) => t.replace('{n}', petName(p));
const petFeedLine = p => petLineFill(pick(PET_PERS[petPersOf(p)].feed), p);
const petCareLine = p => { const l = PET_PERS[petPersOf(p)].care; return petLineFill(l[Math.floor(Date.now() / 3600000 + (p.id.length || 1)) % l.length], p); }; // 한 시간마다 바뀐다
function setActivePet(i) {
  if (!(i >= -1 && i < state.pets.length)) return '없는 펫입니다.';
  if (i >= 0 && state.pets[i].exp) return '탐험 중인 펫은 동행할 수 없습니다.';
  state.petActive = i; save();
  return null;
}
/* ---- 펫 자동 탐험: 24시간 뒤 선택한 지상 구역의 재료를 가져온다 ---- */
const petName = p => (p && p.name) || PET_SPECIES[p.id].name; // 이름을 붙이지 않았으면 종 이름
function renamePet(i, name) { // 빈 이름이면 종 이름으로 되돌린다
  const p = state.pets[i]; if (!p) return '펫이 없습니다.';
  p.name = cleanText(name, PET_NAME_MAX); save(); return null;
}
const expLeft = p => p.exp ? Math.max(0, p.exp.at + (p.exp.ms || PET_EXP_MS) - nowMs()) : 0;
const expReady = p => !!p.exp && expLeft(p) === 0;
const BOWL_BAIT = '__bowl';
function bowlCheapest() { return Object.keys(state.petBowl || {}).filter(k => state.petBowl[k] > 0 && ITEMS[k]).sort((a, b) => (ITEMS[a].feed || 0) - (ITEMS[b].feed || 0))[0] || null; }
function sendExpedition(i, zoneId, baitName = null) {
  const p = state.pets[i], z = DANGER_ZONES.find(x => x.id === zoneId);
  if (!p) return '펫이 없습니다.';
  if (!z) return '갈 수 있는 구역이 아닙니다.';
  if (state.location !== '개인실') return '탐험 보내기는 개인실에서 할 수 있습니다.';
  if (p.exp) return '이미 탐험 중입니다.';
  if (state.petActive === i) return '동행 중인 펫은 먼저 동행을 해제하세요.';
  const bw = bowlCheapest(); // 먹이통이 채워져 있으면 거기서 1개를 자동으로 챙겨 간다 (소지품에 먹이가 없어도 된다)
  if (bw && (baitName == null || baitName === BOWL_BAIT)) { state.petBowl[bw]--; if (state.petBowl[bw] <= 0) delete state.petBowl[bw]; }
  else {
    if (baitName === BOWL_BAIT) return '먹이통이 비어 있습니다.';
    if (!baitItems().length) return '탐험을 떠나는 펫에게 줄 먹이(작물·펫 사료)가 필요합니다. (먹이통을 채워 두면 거기서 챙겨 가요)';
    const bait = baitName == null ? baitItems()[0] : baitName;
    if (!baitItems().includes(bait)) return '고른 먹이가 가방에 없습니다. 줄 먹이를 다시 골라 주세요.';
    removeItem(bait);
  }
  p.exp = { zone: zoneId, at: nowMs(), ms: Math.round(PET_EXP_MS * (1 - effects().petTime)) }; p.fedAt = nowMs(); p.full = PET_FULL_MAX; p.fullAt = nowMs(); save(); // 도시락을 들고 떠난다
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
  const items = expeditionLoot(p), lost = [], boxed = [];
  items.forEach(([n, q]) => { const g = addItem(n, q); if (g < q) { const b = lostBoxPut(n, q - g); if (b) boxed.push([n, b]); if (q - g - b > 0) lost.push([n, q - g - b]); } });
  p.exp = null; p.bond = Math.min(100, p.bond + 2); p.decayAt = nowMs(); save(); // 돌아온 뒤부터 다시 허기를 센다
  return { items, lost, boxed };
}

/* ---------- 칭호 ---------- */
/* 지역의 걸을 수 있는 칸을 전부 밝혔는지 */
function zoneFullyLit(zid) {
  const z = DANGER_ZONES.find(x => x.id === zid), ex = state.explored && state.explored[zid]; if (!z || !ex) return false;
  return z.map.every((row, y) => [...row].every((c, x) => c === '#' || c === '.' || ex[`${x},${y}`]));
}
/* 같은 제작 직업의 낮은 호칭을 지우고, 착용 중이었다면 새 호칭으로 바꾼다. 바뀌었으면 true */
function supersedeMasteryTitles() {
  let changed = false;
  { const cur = craftTitleOf(); if (cur) CRAFT_TITLES.map(t => t[1]).filter(t => t !== cur).forEach(t => { if (state.titles.includes(t)) { state.titles = state.titles.filter(x => x !== t); changed = true; } if (state.character.title === t) { state.character.title = state.titles.includes(cur) ? cur : state.character.title; changed = true; } }); }
  Object.entries(MASTERY_JOB).forEach(([tag, job]) => {
    const cur = masteryTitleOf(tag, masteryLv(tag)); if (!cur) return;
    const olds = masteryRanks(tag).map(([, nm]) => `${nm} ${job}`).filter(t => t !== cur);
    olds.forEach(t => {
      if (state.titles.includes(t)) { state.titles = state.titles.filter(x => x !== t); changed = true; }
      if (state.character.title === t) { state.character.title = state.titles.includes(cur) ? cur : state.character.title; changed = true; }
    });
  });
  return changed;
}
/* 조건을 채운 칭호를 얻는다. 새로 얻은 칭호 이름들 */
function noteStatPeak() { // 버프·장비 포함 스탯의 최고 기록 (확정된 값만: 나누기 전 포인트는 세지 않는다). 바뀌면 true
  const t = totalStats(), pk = state.statPeak = state.statPeak || {}; let ch = false;
  for (const k in t) if (t[k] > (pk[k] | 0)) { pk[k] = Math.min(9999, t[k]); ch = true; }
  return ch;
}
function checkTitles() {
  if (!state.created) return [];
  if (noteStatPeak()) save();
  if (state.money > (state.crLast | 0)) state.crEarned = Math.min(1e9, (state.crEarned | 0) + state.money - (state.crLast | 0)); state.crLast = state.money; // 번 CR 누적 (쓴 것은 빼지 않는다)
  const got = TITLE_DEFS.filter(([n, , ok]) => !state.titles.includes(n) && ok()).map(t => t[0]);
  if (got.length) state.titles.push(...got);
  const swapped = supersedeMasteryTitles(); // 제작 호칭은 레벨이 오르면 덮어쓴다 (초보 재봉사 → 숙련 재봉사)
  if (got.length || swapped) save();
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
function ilKey(r) { return r[0] + '\u0001' + (r[2] || ''); } // 물건 목록의 한 줄 = 이름 + 제작자 (function 선언: hardenState 에서도 쓴다)
function ilRow(n, q, mk) { return mk ? [n, q, mk] : [n, q]; }
function cleanItemList(arr, max = 5) { // [[이름, 수량, 제작자?]] (같은 이름이라도 제작자가 다르면 다른 줄)
  const out = [], seen = new Set();
  for (const r0 of Array.isArray(arr) ? arr : []) {
    const r = Array.isArray(r0) && LEGACY_ITEMS[r0[0]] ? [LEGACY_ITEMS[r0[0]], ...r0.slice(1)] : r0; // 옛 클라이언트가 보낸 옛 이름도 받는다
    if (!Array.isArray(r) || typeof r[0] !== 'string' || !ITEMS[r[0]] || r[0] === MAIL_SHIP_ITEM) continue;
    const mk = typeof r[2] === 'string' ? cleanText(r[2], MK_LEN) : '', k = ilKey([r[0], 0, mk]); if (seen.has(k)) continue;
    seen.add(k); out.push(ilRow(r[0], intIn(r[1], 1, 99, 1), mk));
    if (out.length >= max) break;
  }
  return out;
}
/* 서버에서 받은 메일/교환 결과를 메일함에 넣는다 */
/* 서버 메일: sid(서버 번호)로 중복을 막는다 — 이미 받은 메일이면 false */
function receiveServerMail(from, subject, body, items, sid = '') { if (sid && state.mail.some(m => m.sid === sid)) return false; pushMail(from, subject, body, cleanItemList(items), nowMs(), sid); save(); return true; }
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
function pushMail(from, subject, body, items = [], at = nowMs(), sid = '') {
  state.mail.unshift({ id: state.mailSeq++, from: cleanText(from, 12), subject: cleanText(subject, 30), body: cleanText(body, 300), items, at, kept: false, read: false, got: false, sid });
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
  const snap = JSON.stringify(state.inventory); // 하나라도 못 담으면 전부 되돌린다 (제작자 표시 포함)
  if (m.items.some(([n, q, mk]) => addItem(n, q, mk || '') < q)) { state.inventory = JSON.parse(snap); return '가방에 빈 칸이 부족합니다. 비운 뒤 다시 받으세요.'; }
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
  for (const [n, q, mk0] of items) {
    const mk = typeof mk0 === 'string' ? cleanText(mk0, MK_LEN) : '', k = ilKey([n, 0, mk]);
    if (!ITEMS[n] || seen.has(k) || n === MAIL_SHIP_ITEM) continue;
    seen.add(k); list.push(ilRow(n, intIn(q, 1, 99, 1), mk));
  }
  if (list.length > MAIL_ITEM_KINDS) return `첨부는 종류 ${MAIL_ITEM_KINDS}개까지입니다.`;
  if (list.reduce((a, r) => a + r[1], 0) > MAIL_ITEM_TOTAL) return `첨부는 합계 ${MAIL_ITEM_TOTAL}개까지입니다.`;
  if (list.some(([n, q, mk]) => countItem(n, mk || '') < q)) return '가지고 있는 수량보다 많이 담을 수 없습니다.';
  if (list.length && countItem(MAIL_SHIP_ITEM) < 1) return `아이템을 담아 보내려면 ${MAIL_SHIP_ITEM}(상점 구매)가 1개 필요합니다.`;
  if (list.length) { removeItem(MAIL_SHIP_ITEM, 1); list.forEach(([n, q, mk]) => removeItem(n, q, mk || '')); }
  sendMail.sent = list.map(r => r.slice()); // 실제로 가방에서 뺀 첨부 (중복·운송장치 제외 후)
  if (list.length) state.mailItemSent = Math.min(999999, (state.mailItemSent | 0) + 1); // 아이템 배달 횟수 (칭호)
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
/* 길드 이름 변경(길드장만). 성공하면 null, 아니면 사유 */
function renameGuild(name) {
  name = cleanText(name, GUILD_NAME_MAX);
  if (!state.guild) return '길드가 없습니다.';
  if (!state.guild.master) return '길드장만 이름을 바꿀 수 있어요.';
  if (name.length < GUILD_NAME_MIN) return `길드 이름은 ${GUILD_NAME_MIN}~${GUILD_NAME_MAX}자로 입력하세요.`;
  if (name === state.guild.name) return '지금 이름과 같아요.';
  state.guild.name = name; save();
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

/* ---------- 대련 (2026-10-27): 같은 시드·같은 참가자면 어느 기기에서나 같은 결과 ---------- */
const DUEL_STATS = ['str', 'agi', 'int', 'wil', 'sen', 'luk'];
function duelSnap() { // 내 대련 능력치 (서버에도 이 값을 올리고, 서버가 범위를 다시 자른다)
  const bs = battleSnap(), c = state.character, m = state.trainMsg || {};
  return { name: c.name, lv: c.level, hp: Math.max(20, Math.min(600, state.vitals.hpMax)), atk: Math.max(1, Math.min(200, Math.round((3 + bs.wa) * (1 + bs.atk) * 10) / 10)), ev: Math.max(0, Math.min(.5, +bs.evade.toFixed(3))),
    main: DUEL_STATS.includes(c.mainStat) ? c.mainStat : bs.top || 'str', sub: DUEL_STATS.includes(c.subStat) ? c.subStat : '', st: (() => { const t = totalStats(); return Object.fromEntries(DUEL_STATS.map(k => [k, Math.max(0, Math.min(80, t[k] | 0))])); })(), help: cleanText(m.help || '', DUEL_MSG_MAX), win: cleanText(m.win || '', DUEL_MSG_MAX), lose: cleanText(m.lose || '', DUEL_MSG_MAX) };
}
function duelClean(sn, name) { // 받은 능력치를 다시 거른다
  const o = sn && typeof sn === 'object' ? sn : {}, num = (v, a, b, d) => Number.isFinite(+v) ? Math.max(a, Math.min(b, +v)) : d;
  return { name: cleanText(name || o.name, 12) || '?', lv: intIn(o.lv, 1, MAX_LEVEL, 1), hp: Math.round(num(o.hp, 20, 600, 100)), atk: num(o.atk, 1, 200, 5), ev: num(o.ev, 0, .5, 0),
    main: DUEL_STATS.includes(o.main) ? o.main : 'str', sub: DUEL_STATS.includes(o.sub) ? o.sub : '', st: Object.fromEntries(DUEL_STATS.map(k => [k, intIn(o.st && o.st[k], 0, 80, 0)])), help: cleanText(o.help || '', DUEL_MSG_MAX), win: cleanText(o.win || '', DUEL_MSG_MAX), lose: cleanText(o.lose || '', DUEL_MSG_MAX) };
}
function duelDummies(n, team = 2, off = 0) { // 연습 상대(2팀) · 연습 동료(1팀): 내 능력치를 조금 낮춘 허수아비
  const me = duelSnap();
  return Array.from({ length: Math.max(0, Math.min(DUEL_TEAM_MAX, n)) }, (_, k) => { const i = k + off; return { team, ...duelClean({ ...me, help: team === 1 ? '뒤는 맡겨!' : '', name: team === 1 ? ['동료 훈련병', '교관 보조 로봇'][k] || '동료' : DUEL_DUMMY[i % DUEL_DUMMY.length], hp: Math.round(me.hp * (.75 + i * .05)), atk: me.atk * .8, ev: me.ev * .6, main: DUEL_STATS[(i * 2 + 1) % 6], sub: DUEL_STATS[(i * 2 + 4) % 6], ...(team === 1 ? { win: '해냈다! 같이 싸워서 다행이야.', lose: '다음엔 꼭 이기자.' } : { win: '훈련 종료. 자세를 다시 점검하십시오.', lose: '삐빅… 훌륭합니다.' }) }) }; });
}
/* fighters: [{team(1|2), name, hp, atk, ev, main, sub}] (순서 고정) → { log:[{r,a,t,d,dmg,dodge,ko}], win: 1|2, hp:[남은 HP] } */
function duelSim(fighters, seed) {
  const rnd = seededRng((seed >>> 0) || 1), hp = fighters.map(f => f.hp), log = [], boost = [], used = [];
  const alive = t => fighters.map((f, i) => i).filter(i => fighters[i].team === t && hp[i] > 0);
  let r = 0;
  while (alive(1).length && alive(2).length && r < DUEL_ROUND_MAX) {
    r++;
    const ord = fighters.map((f, i) => [i, rnd() + (f.st.agi || 0) * DUEL_STAT.agiFirst]); const order = ord.filter(([i]) => hp[i] > 0).sort((x, y) => y[1] - x[1]).map(x => x[0]); // 민첩: 먼저 움직일 가능성↑
    for (const a of order) {
      if (hp[a] <= 0) continue;
      const foes = alive(fighters[a].team === 1 ? 2 : 1); if (!foes.length) break;
      const mates = fighters.map((f, i) => i).filter(i => i !== a && fighters[i].team === fighters[a].team && hp[i] > 0);
      if (mates.length && !boost[a] && rnd() < DUEL_SUP_P) { const h = mates[Math.floor(rnd() * mates.length)]; boost[a] = 1; log.push({ r, sup: h, a, s: Math.floor(rnd() * 1000) }); } // 같은 팀의 지원
      const A = fighters[a], t = foes[Math.floor(rnd() * foes.length)], T = fighters[t], S = DUEL_STAT;
      let d = 1 + Math.floor(rnd() * 6), lucky = false;
      if (d <= 2 && rnd() < Math.min(S.lukMax, (A.st.luk || 0) * S.luk)) { d = 1 + Math.floor(rnd() * 6); lucky = true; } // 행운: 나쁜 주사위를 다시 굴린다
      const dodge = d < 6 && d > 1 && rnd() < Math.max(0, T.ev * .5 - (A.st.int || 0) * S.intPierce), bo = !!boost[a]; // 지능: 상대 회피를 꿰뚫는다
      let dmg = dodge ? 0 : A.atk * DUEL_D6[d - 1] * (.9 + rnd() * .2) * (bo ? DUEL_SUP_MULT : 1);
      if (!dodge && d >= 5) dmg *= 1 + Math.min(S.intCritMax, (A.st.int || 0) * S.intCrit); // 지능: 강타·결정타 위력↑
      dmg = dodge ? 0 : Math.round(dmg * (1 - Math.min(S.wilMax, (T.st.wil || 0) * S.wil))); if (!dodge) boost[a] = 0; // 의지: 받는 피해↓
      let endure = false; if (dmg >= hp[t] && !used[t] && rnd() < Math.min(S.endureMax, (T.st.wil || 0) * S.endure)) { dmg = hp[t] - 1; used[t] = 1; endure = true; } // 의지: 한 번은 1로 버틴다
      hp[t] = Math.max(0, hp[t] - dmg);
      log.push({ r, a, t, d, dmg, dodge, ko: hp[t] <= 0, bo, hp: hp[t], lucky, endure, s: Math.floor(rnd() * 1000) });
      if (dodge && hp[a] > 0 && rnd() < Math.min(S.senMax, (T.st.sen || 0) * S.sen)) { const c = Math.max(1, Math.round(T.atk * S.ctrMult)); hp[a] = Math.max(0, hp[a] - c); log.push({ r, a: t, t: a, d: 0, dmg: c, ctr: true, ko: hp[a] <= 0, hp: hp[a], s: Math.floor(rnd() * 1000) }); } // 감각: 피한 뒤 반격
    }
  }
  const left = tm => fighters.reduce((s, f, i) => s + (f.team === tm ? hp[i] / f.hp : 0), 0);
  const win = !alive(2).length ? 1 : !alive(1).length ? 2 : left(1) >= left(2) ? 1 : 2;
  return { log, win, hp, rounds: r };
}
function duelText(e, fighters) { // 기록 한 줄 → 묘사 (주 능력·주사위 단계, 가끔 부 능력 한 줄)
  if (e.sup !== undefined) { const H = fighters[e.sup], A0 = fighters[e.a]; return `✦ ${H.name}의 지원! 「${H.help || '힘내!'}」 ${A0.name}의 다음 공격 +${Math.round((DUEL_SUP_MULT - 1) * 100)}%`; }
  const A = fighters[e.a], T = fighters[e.t], f = s => s.replace(/\{a\}/g, A.name).replace(/\{t\}/g, T.name), pk = l => l[e.s % l.length];
  if (e.ctr) return `↺ ${A.name}이(가) 틈을 놓치지 않고 반격했다! (-${e.dmg})${e.ko ? ' ' + f(pk(DUEL_KO)) : ''}`;
  const tier = e.d === 1 ? 0 : e.d === 2 ? 1 : e.d <= 4 ? 2 : e.d === 5 ? 3 : 4;
  let out = `🎲${e.d} ` + (e.dodge ? f(pk(DUEL_DODGE)) : f(pk(DUEL_LINES[A.main][tier])) + (e.dmg ? ` (-${e.dmg})` : ''));
  if (A.sub && !e.dodge && e.s % 4 === 0) out += ' ' + f(pk(DUEL_SUB[A.sub]));
  if (e.lucky) out = '🍀' + out;
  if (e.endure) out += ` ${T.name}이(가) 이를 악물고 버텨 냈다! (HP 1)`;
  if (e.ko) out += ' ' + f(pk(DUEL_KO));
  return out;
}

/* ===== 대련 판돈 (10/27) =====
   방장이 정한 판돈(서버 stake)을 대련이 시작될 때(이 기기에서 처음 볼 때) 낸다. 결과는 시드로 정해져 있으므로 낼 때 승패·인원을 함께 적어 두고,
   대련 연출이 끝나거나(또는 창을 닫아 못 봤어도 3분 뒤) 이긴 쪽이면 정산한다. 서버는 CR·아이템을 옮기지 않는다(세이브 권한, 거래소와 같음). */
function cleanDuelStake(st) { // 서버에서 받은 판돈을 다시 거른다
  if (!st || typeof st !== 'object') return null;
  if (st.cr != null) { const c = Math.floor(+st.cr); return Number.isFinite(c) && c >= DUEL_BET_CR_MIN && c <= DUEL_BET_CR_MAX ? { cr: c } : null; }
  const n = typeof st.item === 'string' ? st.item : '', q = Math.floor(+st.qty);
  return ITEMS[n] && !ITEMS[n].hidden && Number.isFinite(q) && q >= 1 && q <= DUEL_BET_QTY_MAX ? { item: n, qty: q } : null;
}
function cleanDuelBets(b) { // 저장 검증 (hardenState에서 쓰므로 function 선언)
  const out = {}; if (!b || typeof b !== 'object') return out;
  Object.entries(b).slice(-20).forEach(([k, v]) => {
    const seed = Math.floor(+k); if (!(seed > 0) || !v || typeof v !== 'object') return; const st = cleanDuelStake(v.st); if (!st) return;
    out[seed] = { st, paid: !!v.paid, won: !!v.won, w: Math.max(1, Math.min(3, v.w | 0)), l: Math.max(0, Math.min(3, v.l | 0)), at: Number.isFinite(+v.at) ? +v.at : 0, done: !!v.done };
  });
  return out;
}
const duelStakeText = st => !st ? '' : st.cr ? `${st.cr} CR` : `${st.item} ×${st.qty}`;
function canPayStake(st) { st = cleanDuelStake(st); if (!st) return true; return st.cr ? state.money >= st.cr : countItem(st.item) >= st.qty; }
function duelBetGain(b) { // 이긴 사람이 받는 것 (내 판돈 + 진 쪽 판돈을 이긴 인원으로 나눈 몫, 수수료 제외)
  const share = b.l / b.w; return b.st.cr ? { cr: b.st.cr + Math.floor(b.st.cr * share * (1 - DUEL_BET_FEE)) } : { item: b.st.item, qty: b.st.qty + Math.floor(b.st.qty * share * (1 - DUEL_BET_FEE) + 1e-9) };
}
function duelBetPay(seed, stake, fs, sim) { // 대련 시작 때 판돈 내기 (같은 시드는 한 번만). 못 내면 이번 판은 걸지 않은 것으로 한다
  const st = cleanDuelStake(stake), me = fs.find(f => f.me); if (!st || !me || !(seed > 0)) return null;
  state.duelBets = state.duelBets || {}; if (state.duelBets[seed]) return state.duelBets[seed];
  const w = fs.filter(f => f.team === sim.win).length, l = fs.length - w;
  let paid = false; if (st.cr) { if (state.money >= st.cr) { state.money -= st.cr; paid = true; } } else if (countItem(st.item) >= st.qty) { paid = removeItem(st.item, st.qty) >= st.qty; }
  const keys = Object.keys(state.duelBets); if (keys.length >= 20) delete state.duelBets[keys[0]];
  state.duelBets[seed] = { st, paid, won: me.team === sim.win, w: Math.max(1, w), l, at: Date.now(), done: !paid }; save();
  return state.duelBets[seed];
}
function duelBetSettle(seed) { // 정산 (이긴 쪽만 받는다). 결과 문구를 돌려준다
  const b = state.duelBets && state.duelBets[seed]; if (!b || b.done) return '';
  b.done = true; let txt = '';
  if (b.paid && b.won) { const g = duelBetGain(b);
    if (g.cr) { state.money += g.cr; txt = `판돈 +${g.cr} CR`; }
    else { const a = addItem(g.item, g.qty), box = a < g.qty ? lostBoxPut(g.item, g.qty - a) : 0; txt = `판돈 ${g.item} +${g.qty}${a < g.qty ? ` (가방이 가득 차 ${box}개는 분실물 보관함으로)` : ''}`; }
  } else if (b.paid) txt = `판돈 -${duelStakeText(b.st)}`;
  save(); return txt;
}
function duelBetSweep() { // 대련을 끝까지 못 봤어도 3분 지나면 정산
  const b = state.duelBets || {}; let n = 0; Object.keys(b).forEach(k => { if (!b[k].done && Date.now() - b[k].at > 180000) { duelBetSettle(+k); n++; } }); return n;
}
