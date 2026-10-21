/* ==========================================================
   ui.js - 화면 렌더링과 이벤트 처리
   규칙/저장은 core.js, 콘텐츠는 data.js. 버튼은 data-act 속성으로 A 객체의 핸들러에 연결된다.
   ========================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let view = { dpan: { x: 0, y: 0 }, dzoom: 1, petBack: {}, phase: 'idle', mult: 0, equipSlot: null, quest: null, target: null }; // 저장하지 않는 임시 화면 상태 (phase: idle | confirm(id))
const resetPhase = () => { view.phase = 'idle'; view.id = null; view.lastResult = null; };

/* ---------- 공통 UI ---------- */
function toast(t) {
  const el = $('#toast');
  el.textContent = t;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2400);
}
function addLog(text) {
  state.logs.unshift({ time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }), text });
  state.logs = state.logs.slice(0, 100);
  renderLogs(); save();
}
function modal(title, body, actions = [], small = false) {
  hideTip();
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = body;
  $('#modalActions').innerHTML = actions.join('');
  $('#modal').classList.toggle('small', small);
  $('#overlay').classList.add('open');
}
const closeModal = () => { if (view.mockTimer) { clearInterval(view.mockTimer); view.mockTimer = 0; } $('#overlay').classList.remove('open'); applyTheme(); }; // 저장하지 않은 테마 미리보기는 되돌린다
const btnClose = '<button data-act="close">닫기</button>';

/* ---------- 테마 ---------- */
function applyTheme(st = state.settings) {
  const body = document.body;
  const base = st.theme === 'custom' ? st.customBase : st.theme;
  body.dataset.theme = base === 'dark' ? 'dark' : 'light';
  body.classList.toggle('custom-cursor', st.cursor !== false);
  body.style.setProperty('--fs', FONT_SCALES[st.fontSize] || 1);
  const vars = ['--accent', '--accent-2', '--accent-soft', '--accent-line', '--primary', '--primary-line', '--primary-text'];
  vars.forEach(v => body.style.removeProperty(v));
  if (st.theme !== 'custom') return;
  const c = st.customAccent, dark = '#000', light = '#fff';
  body.style.setProperty('--accent', c);
  body.style.setProperty('--accent-2', `color-mix(in srgb, ${c} 80%, ${base === 'dark' ? light : dark})`);
  body.style.setProperty('--accent-soft', `color-mix(in srgb, ${c} 14%, var(--panel))`);
  body.style.setProperty('--accent-line', `color-mix(in srgb, ${c} 45%, var(--panel))`);
  body.style.setProperty('--primary', `color-mix(in srgb, ${c} 85%, ${dark})`);
  body.style.setProperty('--primary-line', `color-mix(in srgb, ${c} 85%, ${dark})`);
  body.style.setProperty('--primary-text', '#fff');
}

/* ---------- 프로필 / 스테이터스 ---------- */
function renderProfile() {
  const c = state.character;
  const nm = $('#charName');
  nm.textContent = c.name || '-';
  nm.dataset.tipTitle = c.ability ? `이능력 · ${c.ability}` : ''; nm.dataset.tipDesc = c.abilityDesc || '이능력 설명이 없습니다.';
  if (!c.ability) { delete nm.dataset.tipTitle; delete nm.dataset.tipDesc; }
  $('#titleChip').textContent = c.title;
  $('#charMeta').textContent = `LV.${c.level}${c.level >= MAX_LEVEL ? ' MAX' : ''}　${c.rank}등급　${c.age}세`;
  const tags = c.keywords.split(',').map(t => t.trim()).filter(Boolean);
  $('#charTags').textContent = tags.map(t => '#' + t).join(' ');
  const jb = state.subjob; $('#charJob').textContent = jb ? `서브잡 · ${jb.name} Lv.${jb.level}` : '';
  $('#money').textContent = state.money.toLocaleString();
  const img = getAvatar();
  const btn = $('#avatarButton');
  btn.classList.toggle('empty', !img);
  btn.innerHTML = img ? `<img src="${esc(img)}" alt="프로필">` : icon('add');
  btn.title = '프로필 보기';
}
const AVATAR_KEY = 'deeplayer-avatar';
const getAvatar = () => { try { const v = localStorage.getItem(AVATAR_KEY); return v && /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(v) ? v : null; } catch (e) { return null; } };
function renderBars() {
  const v = state.vitals;
  const maxed = state.character.level >= MAX_LEVEL;
  const rows = [['HP', 'hp', v.hp, v.hpMax], ['기력', 'sp', v.sp, v.spMax], ['EXP', 'exp', maxed ? 1 : v.exp, maxed ? 1 : expMax(state.character.level)]];
  $('#bars').innerHTML = rows.map(([label, cls, cur, max]) =>
    `<div class="bar-row"><b>${label}</b><div class="bar ${cls}"><span style="width:${clamp(cur / max * 100, 0, 100)}%"></span></div><span class="val">${cls === 'exp' && maxed ? 'MAX' : `${cur} / ${max}`}</span></div>`).join('');
}

/* 버프 아이콘(프로필 오른쪽 위)과 스테이터스의 효과 목록. 버프가 바뀔 때만 다시 그린다 */
/* 시간제 버프 + 펫(든든한 동안) + 서브잡(상시) */
function allBuffs() {
  const list = activeBuffs(), p = activePet(), j = state.subjob;
  if (p && petFed(p)) list.push({ id: `펫 · ${PET_SPECIES[p.id].name}`, type: 'buff', icon: 'pets', desc: `함께 다니는 펫. 타일 이동 시간 -${Math.round(petBuff(p) * 100)}%`, endAt: p.fedAt + PET_FED_MS });
  if (j) list.push({ id: `서브잡 · ${j.name}`, type: 'buff', icon: 'work', desc: jobActive() ? `Lv.${j.level} ${jobFxText()}` : `Lv.${j.level} 오늘 납품을 마치면 적용: ${jobFxText(true)}`, endAt: jobActive() ? j.lastAt + JOB_DAY_MS : 0 });
  return list;
}
/* 아이템 툴팁 문장: 설명 + 서브잡 태그 + 판매가 */
const itemTip = it => `${it.desc}${(it.tags || []).length ? ` [태그] ${it.tags.join(' · ')}` : ''}${it.sell ? ` [판매가] ${it.sell} CR` : ''}`;
function renderBuffs(force) {
  const list = allBuffs(), sig = list.map(b => b.id + b.endAt).join();
  if (!force && sig === renderBuffs.sig) return;
  renderBuffs.sig = sig;
  $('#buffIcons').innerHTML = list.map(b =>
    `<button class="buff-icon ${b.type}" data-tip-title="${esc(b.id)}" data-tip-desc="${esc(b.desc)}" ${b.endAt ? `data-tip-end="${b.endAt}"` : ''} aria-label="${esc(b.id)}">${icon(b.icon)}</button>`).join('');
  renderStatus();
}
function combatPageHtml() { // 스테이터스 2페이지: 공격력 / 방어력 / 모의전투 (1페이지와 같은 칸 크기)
  const t = totalStats(), fx = effects(t), wa = weaponAtk(), eff = (3 + wa) * (1 + fx.atk), hit = BATTLE_HIT * (1 - fx.evade);
  return '<div class="stat-grid">' +
    `<div class="stat" data-tip-title="공격력" data-tip-desc="기본 3 + 무기 ${wa}에 근력 보정 +${round1(fx.atk * 100)}%가 곱해집니다."><div class="stat-head"><b>공격력</b><span class="stat-val">${round1(eff)}</span></div><div class="stat-eff"><span>무기 ${esc(state.equipment['무기'] || '맨손')}</span></div></div>` +
    `<div class="stat" data-tip-title="방어력" data-tip-desc="몬스터의 한 번 공격이 맞을 확률입니다. 기본 ${round1(BATTLE_HIT * 100)}%에서 민첩 보정 -${round1(fx.evade * 100)}%."><div class="stat-head"><b>방어력</b><span class="stat-val">${round1(hit * 100)}%</span></div><div class="stat-eff"><span>피격 확률</span></div></div>` +
    `<button class="stat span2 mock-card" data-act="extras-open" data-tip-title="모의전투" data-tip-desc="상대를 골라 전투를 구경해 보세요. 실제 진행에는 영향이 없어요."><div class="stat-head"><b>모의전투</b><span class="stat-plus">${icon('sports_martial_arts')}</span></div><div class="stat-eff"><span>연습 상대와 겨뤄 보기</span></div></button>` +
    '</div>';
}
function renderStatus() {
  $$('#statusPager button').forEach(b => b.classList.toggle('on', +b.dataset.p === (view.statusPage || 0)));
  if (view.statusPage === 1) { const h = view.statH; $('#statusBody').innerHTML = combatPageHtml(); if (h) $('#statusBody .stat-grid').style.minHeight = h + 'px'; $('#statPoints').classList.toggle('hidden', !state.statPoints); $('#statPoints').textContent = `남은 포인트 ${state.statPoints}`; return; }
  const t = totalStats(), fx = effects(t), pts = state.statPoints;
  const badge = $('#statPoints');
  badge.textContent = `남은 포인트 ${pts}`;
  badge.classList.toggle('hidden', !pts);
  $('#statusBody').innerHTML = '<div class="stat-grid">' + STAT_DEFS.map(d => {
    const bonus = t[d.key] - state.stats[d.key];
    const eff = d.fx.map(([k, label, sign, unit]) => `<span>${label} <b>${sign}${round1(fx[k] * 100)}${unit}</b></span>`).join('');
    return `<div class="stat" data-tip-title="${d.name} · ${d.fx[0][1]}" data-tip-desc="${esc(d.tip)}"><div class="stat-head"><b>${d.name}</b><small>${d.en}</small><span class="stat-val">${state.stats[d.key]}${bonus ? `<em class="${bonus < 0 ? 'neg' : ''}">${bonus > 0 ? '+' : ''}${bonus}</em>` : ''}</span>` +
      `${pts ? `<button class="stat-plus" data-act="stat-up" data-stat="${d.key}" title="포인트 사용">${icon('add')}</button>` : ''}</div><div class="stat-eff">${eff}</div></div>`;
  }).join('') + '</div>';
  const g = $('#statusBody .stat-grid'); if (g) view.statH = Math.round(g.getBoundingClientRect().height) || view.statH;
}

/* ---------- 왼쪽 탭: 장비 / 인벤토리 / 제작 ---------- */
const LEFT_TITLES = { EQUIP: ['장비', 'checkroom'], INVENTORY: ['소지품', 'backpack'], CRAFT: ['제작', 'construction'] };
function renderLeftTab() {
  $$('[data-ltab]').forEach(b => b.classList.toggle('active', b.dataset.ltab === state.leftTab));
  $('#viewEquip').classList.toggle('hidden', state.leftTab !== 'EQUIP');
  $('#viewInv').classList.toggle('hidden', state.leftTab !== 'INVENTORY');
  $('#viewCraft').classList.toggle('hidden', state.leftTab !== 'CRAFT');
  const [name, ic] = LEFT_TITLES[state.leftTab];
  $('#leftTitle').textContent = name; $('#leftTitleIcon').textContent = ic;
  $('#leftMeta').textContent = state.leftTab === 'INVENTORY' ? `${usedSlots()} / ${bagCapacity()}` : state.leftTab === 'CRAFT' ? `${RECIPES.filter(recipeKnown).length}종` : `${Object.values(state.equipment).filter(Boolean).length} / ${EQUIP_SLOTS.length}`;
}
function equipSlotHtml(slot, big) {
  const n = state.equipment[slot], it = n && ITEMS[n];
  const title = it ? n : `${slot} · 비어 있음`, desc = it ? it.desc : '눌러서 착용 가능한 아이템을 확인합니다.';
  return `<button class="slot clickable ${big ? 'big' : ''} ${it ? 'filled' : ''} ${view.equipSlot === slot ? 'selected' : ''}" data-act="equip-slot" data-slot="${esc(slot)}" data-tip-title="${esc(title)}" data-tip-desc="${esc(desc)}" aria-label="${esc(slot)}">${it ? icon(it.icon) : `<span class="slot-label">${esc(slot)}</span>`}</button>`;
}
/* 장비 칸 아래: 선택한 칸에 착용 가능한 아이템 (소지품과 같은 칸 UI) */
function renderEquipPick() {
  const slot = view.equipSlot, box = $('#equipPick');
  if (!slot) { box.innerHTML = '<p class="tiny pick-hint">장비 칸을 누르면 착용 가능한 아이템이 여기에 표시됩니다.</p>'; return; }
  const cur = state.equipment[slot], list = state.inventory['장비'].filter(s => ITEMS[s.n].slot === slot);
  const cells = list.map(s => `<button class="slot clickable filled" data-act="pick-equip" data-item="${esc(s.n)}" data-tip-title="${esc(s.n)}" data-tip-desc="${esc(itemTip(ITEMS[s.n]))}" aria-label="${esc(s.n)}">${icon(ITEMS[s.n].icon)}</button>`);
  while (cells.length < 6) cells.push('<div class="slot" aria-label="빈 슬롯"></div>');
  box.innerHTML = `<div class="pick-head"><b>${esc(slot)}</b><span class="tiny">${cur ? `착용 중: ${esc(cur)}` : '착용 중인 장비 없음'}</span><span class="spacer"></span>${cur ? `<button data-act="unequip" data-slot="${esc(slot)}">해제</button>` : ''}</div>` +
    `<div class="inv-grid">${cells.join('')}</div>${list.length ? '' : '<div class="empty">착용 가능한 아이템이 없습니다.</div>'}`;
}
function renderEquip() {
  $('#equipGrid').innerHTML = EQUIP_SMALL.map(s => equipSlotHtml(s, false)).join('');
  $('#equipBig').innerHTML = EQUIP_BIG.map(s => equipSlotHtml(s, true)).join('');
  const sum = {};
  Object.values(state.equipment).forEach(n => n && ITEMS[n].mods && Object.entries(ITEMS[n].mods).forEach(([k, v]) => { sum[k] = (sum[k] || 0) + v; }));
  const en = {}; Object.values(state.equipment).forEach(n => { const e = n && state.enchants[n]; if (!e) return; if (e.k === 'hp' || e.k === 'sp') en[e.k] = (en[e.k] || 0) + e.v; else sum[e.k] = (sum[e.k] || 0) + e.v; });
  const chips = [...modText(sum), ...(weaponAtk() ? [`공격력 +${weaponAtk()}`] : []), ...(en.hp ? [`최대 HP +${en.hp}`] : []), ...(en.sp ? [`최대 기력 +${en.sp}`] : [])];
  $('#equipFx').innerHTML = chips.map(c => `<span class="buff">${esc(c)}</span>`).join('') || '<span class="tiny">장착 효과 없음</span>';
  renderEquipPick();
}

function renderInventory() {
  const cap = bagCapacity(), tab = state.invTab;
  const items = (tab ? [tab] : ['장비', '소모품', '재료']).flatMap(t => state.inventory[t]);
  $$('[data-inv]').forEach(b => b.classList.toggle('active', b.dataset.inv === tab));
  const pages = Math.max(1, Math.ceil(cap / PAGE_SIZE));
  state.page = clamp(state.page, 1, pages);
  const start = (state.page - 1) * PAGE_SIZE, count = Math.min(PAGE_SIZE, cap - start);
  $('#inventoryGrid').innerHTML = Array.from({ length: count }, (_, i) => {
    const s = items[start + i], it = s && ITEMS[s.n];
    return it
      ? `<button class="slot clickable filled" data-act="item" data-item="${esc(s.n)}" data-tip-title="${esc(s.n)}" data-tip-desc="${esc(itemTip(it))}" aria-label="${esc(s.n)}">${icon(it.icon)}${s.q > 1 ? `<span class="qty">${s.q}</span>` : ''}</button>`
      : '<div class="slot" aria-label="빈 슬롯"></div>';
  }).join('');
  $('#invPage').textContent = `${state.page} / ${pages}`;
  $('#leftMeta').textContent = state.leftTab === 'INVENTORY' ? `${usedSlots()} / ${cap}` : $('#leftMeta').textContent;
  $('#itemCount').textContent = `${usedSlots()} / ${cap}`;
  $('#prevPage').disabled = state.page === 1;
  $('#nextPage').disabled = state.page === pages;
}

/* 개발자 도구 자리: 배포 코드에는 개발자 기능이 없다. 미리보기 빌드(tools/build_preview.py)만 tools/dev-preview.js 로 이 버튼을 채워 넣는다. */
let devBtn = () => '';
/* 개발자 도구: 서버의 관리자 계정으로 로그인했을 때만 js/dev.js 를 불러온다 (개발자 코드 입력은 없앴다). 미리보기 빌드에는 처음부터 합쳐져 있다 */
async function loadDevScript() {
  if (!window.DEV) await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'js/dev.js?t=' + Date.now(); s.onload = ok; s.onerror = () => no(new Error('dev.js')); document.head.appendChild(s); });
  return !!window.DEV;
}
/* 관리자 계정(서버 admins 표에 등록된 아이디)으로 로그인하면 개발자 코드 없이 개발자 도구가 켜진다 */
if (Cloud.enabled && Cloud.user()) Cloud.isAdmin().then(ok => { view.isAdmin = !!ok; if (ok && $('#chatFeed')) renderChat(); return ok && loadDevScript(); }).then(on => { if (on) { renderAction(); renderCraft(); } }).catch(() => { /* 오프라인이면 일반 계정 */ });
function openCraftQty(i) {
  const rc = RECIPES[i], it = ITEMS[rc.out], max = maxCraft(rc);
  modal(`${rc.out} 제작`, `<div class="nearby-row"><div class="round-avatar">${icon(it.icon)}</div><div class="grow"><strong>${esc(rc.out)}</strong><small class="effect">${esc(itemEffect(rc.out))}</small></div></div>` +
    `<div class="choice-label">몇 개 만들까요? (최대 ${max}개)</div><div class="qty-row"><button data-act="cq-step" data-d="-1" aria-label="하나 줄이기">−</button><input id="cqQty" type="number" min="1" max="${max}" value="1" inputmode="numeric" data-index="${i}" aria-label="제작 개수"><button data-act="cq-step" data-d="1" aria-label="하나 늘리기">＋</button><button data-act="cq-max">최대</button></div><p class="tiny" id="cqInfo"></p>`,
    [btnClose, `<button class="primary" data-act="craft-go" data-index="${i}">제작 시작</button>`], true);
  cqUpdate();
}
function cqUpdate() {
  const q = $('#cqQty'); if (!q) return;
  const rc = RECIPES[+q.dataset.index], n = clamp(Math.floor(+q.value) || 1, 1, +q.max);
  $('#cqInfo').textContent = `소요 시간 ${fmtTime(craftTotalSec(rc, n) * 1000)} · 재료 ${Object.entries(rc.mats).map(([m, c]) => `${m} ${c * n}`).join(', ')}`;
}
document.addEventListener('input', e => { if (e.target.id === 'cqQty') cqUpdate(); });
function craftJobHtml() {
  const c = state.crafting;
  if (!c) return '';
  const it = ITEMS[c.out], left = c.endAt - nowMs();
  return `<div class="craft-job"><div class="round-avatar">${icon(it.icon)}</div><div class="grow"><strong>${esc(c.out)} ${c.ready ? '제작 완료' : '제작 중'}${c.great ? ' <em class="tag ok">대성공</em>' : ''}</strong>` +
    (c.ready ? '<small>가방이 가득 차 수령을 기다리는 중입니다.</small>' : `<div class="progress"><span id="craftBar" style="width:${clamp((nowMs() - c.startAt) / (c.endAt - c.startAt) * 100, 0, 100)}%"></span></div><small>남은 시간 <b id="craftLeft">${fmtTime(left)}</b></small>`) +
    `</div>${c.ready ? '<button class="primary" data-act="craft-collect">수령</button>' : `${devBtn()}<button data-act="craft-cancel">취소</button>`}</div>`;
}
function updateCraftTimer() {
  const c = state.crafting, bar = $('#craftBar');
  if (!c || !bar) return;
  bar.style.width = clamp((nowMs() - c.startAt) / (c.endAt - c.startAt) * 100, 0, 100) + '%';
  $('#craftLeft').textContent = fmtTime(c.endAt - nowMs());
}
function renderCraft() {
  const tab = state.craftTab, only = !!view.craftOnly;
  $('#craftOnly').classList.toggle('active', only); $('#craftOnly').setAttribute('aria-pressed', only);
  $$('[data-craft]').forEach(b => b.classList.toggle('active', b.dataset.craft === tab));
  const shown = RECIPES.map((rc, i) => ({ rc, i })).filter(({ rc }) => recipeKnown(rc) && (!tab || craftCat(rc.out) === tab) && (!only || canCraft(rc)));
  $('#craftCount').textContent = `레시피 ${shown.length}종`;
  $('#craftList').innerHTML = craftJobHtml() + shown.map(({ rc, i }) => {
    const it = ITEMS[rc.out], ok = canCraft(rc) && !state.crafting;
    const mats = Object.entries(rc.mats).map(([n, q]) => `<span class="${countItem(n) >= q ? '' : 'lack'}">${esc(n)} ${countItem(n)}/${q}</span>`).join(' · ');
    return `<div class="recipe"><div class="round-avatar">${icon(it.icon)}</div><div class="grow"><strong>${esc(rc.out)} <em class="tag">${esc(craftCat(rc.out))}</em></strong><small class="effect">${esc(itemEffect(rc.out))}</small><small>제작 시간 ${fmtTime(craftSec(rc) * 1000)} · ${mats}</small></div><button class="primary" data-act="craft" data-index="${i}" ${ok ? '' : 'disabled'}>제작</button></div>`;
  }).join('') + (() => { const n = RECIPES.filter(rc => !recipeKnown(rc)).length; return n ? `<div class="empty">개인실의 '단련'(1시간)으로 새 레시피를 배울 수 있어요. (남은 ${n}종 · 승급하면 후보가 늘어납니다)</div>` : ''; })() || '<div class="empty">레시피가 없습니다.</div>';
}
const renderBag = () => { renderEquip(); renderInventory(); renderCraft(); renderStatus(); renderLeftTab(); };

/* ---------- 지도 / 구역 ---------- */
function applyMapTransform() { $('#mapWorld').style.transform = state.dungeon ? (view.dpan.x || view.dpan.y || view.dzoom !== 1 ? `translate(${view.dpan.x}px,${view.dpan.y}px) scale(${view.dzoom})` : 'none') : `translate(${state.pan.x}px,${state.pan.y}px) scale(${state.zoom})`; }
/* 재료 검색: 이름에 검색어가 들어 있는 재료를 얻을 수 있는 지형/구역을 찾는다 */
const matTerrains = (z, q) => z.terrains.map((t, i) => [t, i]).filter(([t]) => [...t.gather, t.rare].some(n => n && n.toLowerCase().includes(q))).map(([t, i]) => i);
const terrainMats = t => `[채집] ${t.gather.join(' · ')}${t.rare ? ` [희귀] ${t.rare}` : ''}`;
const zoneMats = zid => { const z = DANGER_ZONES.find(x => x.id === zid); return z ? [...new Set(z.terrains.flatMap(t => [...t.gather, t.rare].filter(Boolean)))] : []; };
function renderMapSearch(hits) { // 검색 결과 안내
  const q = (view.mapQ || '').trim().toLowerCase(), box = $('#mapSearchInfo'); if (!box) return;
  if (!q) { box.textContent = ''; return; }
  if (state.dungeon) {
    const z = zoneOf(state.dungeon.zone), ts = matTerrains(z, q).map(i => z.terrains[i].name);
    box.textContent = ts.length ? `${ts.join(', ')} 지형 · 탐색한 ${hits}칸` : '이 구역에서는 찾을 수 없어요';
  } else box.textContent = hits ? `${hits}곳 표시됨` : '표시할 구역이 없어요';
}
function renderMap() {
  $('#mapStage').classList.toggle('dungeon', !!state.dungeon); // 타일 지도에서는 지도 이동·확대 버튼을 숨긴다
  applyMapTransform();
  if (state.dungeon) { renderDungeon(); return; }
  const mq = (view.mapQ || '').trim().toLowerCase(); let hlN = 0;
  const nodes = DANGER_NODES[state.location] ? [...MAP_NODES, DANGER_NODES[state.location]] : MAP_NODES;
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  const lines = nodes.flatMap(n => n.links.map(id => `<line class="node-line" x1="${n.x}" y1="${n.y}" x2="${byId[id].x}" y2="${byId[id].y}"/>`)).join('');
  $('#mapWorld').innerHTML = `<svg class="node-svg" viewBox="0 0 100 100" preserveAspectRatio="none">${lines}</svg>` +
    nodes.map(n => { const zm = zoneMats(n.id), hl = mq && zm.some(m => m.toLowerCase().includes(mq)); if (hl) hlN++; return `<button class="map-node ${n.danger ? 'danger' : ''} ${state.location === n.id ? 'current' : ''} ${hl ? 'hl' : ''}" style="left:${n.x}%;top:${n.y}%" data-act="node" data-node="${esc(n.id)}" data-tip-title="${esc(LOCATIONS[n.id].name)}" data-tip-desc="${esc((state.location === n.id ? '현재 위치' : (moveCost(n.id) ? `이동 기력 -${moveCost(n.id)}` : '이동 기력 소모 없음')) + (zm.length ? ` [재료] ${zm.join(' · ')}` : ''))}" aria-label="${esc(n.label)}"><span class="node-label">${esc(n.label)}</span></button>`; }).join('');
  renderMapSearch(hlN);
}

/* 미궁: 보이는 칸만 그린다. 아무 칸이나 누르면 이동 확인창이 뜬다 (멀면 칸 수만큼 시간·기력이 든다) */
function renderDungeon() {
  refreshEvents(state.dungeon);
  if (view.dpanSeed !== state.dungeon.seed) { view.dpanSeed = state.dungeon.seed; view.dpan = { x: 0, y: 0 }; view.dzoom = 1; applyMapTransform(); } // 새 던전에 들어가면 이동 초기화
  const d = state.dungeon, z = zoneOf(d.zone), dest = state.active && state.active.path ? state.active.path[state.active.path.length - 1] : null;
  const mq = (view.mapQ || '').trim().toLowerCase(); let hlCount = 0;
  const cells = z.map.map((row, y) => [...row].map((ch, x) => {
    if (ch === '.') return '<div class="tile void"></div>';
    if (!d.seen[`${x},${y}`]) return '<div class="tile unseen"></div>';
    if (ch === '#') return '<div class="tile wall"></div>';
    const ti = terrainIndex(ch), info = tileInfo(z, ch), me = d.x === x && d.y === y;
    const evDone = ch === 'E' && d.done.includes(eventIndex(z, x, y)), going = dest && dest[0] === x && dest[1] === y;
    const glyph = me ? '<i class="pawn"></i>' : ch === 'S' ? icon('logout') : ch === 'C' ? icon('camping') : ch === 'E' ? icon(evDone ? 'check' : 'priority_high') : ti >= 0 ? icon(z.terrains[ti].icon) : '';
    const hl = ti >= 0 && mq && matTerrains(z, mq).includes(ti); if (hl) hlCount++;
    const cls = `tile floor ${hl ? 'hl' : ''} ${ti >= 0 ? 't' + ti : ''} ${ch === 'C' ? 'camp' : ''} ${ch === 'E' ? 'ev' : ''} ${evDone ? 'done' : ''} ${ch === 'S' ? 'start' : ''} ${me ? 'me' : ''} ${going ? 'going' : ''}`;
    const tip = `data-tip-title="${esc(info.name)}" data-tip-desc="${esc(info.desc + (info.terrain ? ' ' + terrainMats(info.terrain) : ''))}"`;
    return me ? `<div class="${cls}" ${tip}>${glyph}</div>` : `<button class="${cls} adj" data-act="tile" data-x="${x}" data-y="${y}" ${tip} aria-label="${esc(info.name)}">${glyph}</button>`;
  }).join('')).join('');
  const cols = Math.max(...z.map.map(r => r.length)), rows = z.map.length, st = $('.map-stage'), gap = 3;
  const sw = st ? st.clientWidth : 0, sh = st ? st.clientHeight : 0; // 지도가 무대에 꽉 차도록 타일 크기를 맞춘다 (최대 46px, 최소 20px)
  const tile = sw && sh ? Math.max(20, Math.min(46, Math.floor((sw - 16 - gap * (cols - 1)) / cols), Math.floor((sh - 16 - gap * (rows - 1)) / rows))) : 46;
  $('#mapWorld').innerHTML = `<div class="tile-board" style="--tile:${tile}px;grid-template-columns:repeat(${cols},var(--tile))">${cells}</div>`;
  renderMapSearch(hlCount);
}
function renderMapHead() {
  const loc = LOCATIONS[state.location], d = state.dungeon;
  let desc = loc.desc, meta = loc.meta.join(' / ');
  if (d) {
    const z = zoneOf(d.zone), info = tileInfo(z, tileOf(z, d.x, d.y));
    desc = `${info.name} — ${info.desc}`;
    meta = `${loc.meta[0]} / 미궁 · ${info.name}`;
  }
  $('#mapLocation').textContent = loc.name;
  $('#mapDescription').textContent = desc;
  $('#mapMeta').textContent = meta;
  $('#mapIcon').textContent = loc.icon;
  $('.map-panel').dataset.tone = loc.tone;
}
function setLocation(id) { // 시작할 때 저장된 위치를 화면에 반영
  if (!LOCATIONS[id]) return;
  state.location = id; discover('zones', id);
  resetPhase();
  renderMapHead(); renderMap(); renderAction(); renderSide();
}
/* 시간이 걸리는 행동(타일 이동 등)만 확인창을 거친다. 지도 이동·입장·퇴장은 즉시라 바로 실행한다 */
function askAction(id, target) { view.phase = 'confirm'; view.id = id; view.mult = 0; view.target = target || null; renderAction(); }
function doTravel(id) {
  const res = travelTo(id);
  if (res.err) { toast(res.err); sfx('error'); return; }
  resetPhase(); renderBars(); renderMapHead(); renderMap(); renderAction(); renderSide();
  save();
}
function doMove() {
  const [x, y] = view.target, msg = startMove(x, y);
  if (msg) { toast(msg); sfx('error'); return; }
  const m = state.active;
  resetPhase(); renderBars(); renderMap(); renderAction();
}

/* ---------- 구역 활동 (대기 / 확인 / 진행 중 / 결과) ---------- */
const buffText = b => `${b} (${BUFFS[b].desc.split('. ')[1]}, 5분)`;
/* 얻는 것 / 잃는 것(디메리트) */
function rewardChips(r) {
  return [...r.items.map(([n, q]) => `${n} ×${q}`), r.exp ? `EXP +${r.exp}` : '', r.money > 0 ? `CR +${r.money}` : '',
    r.hp > 0 ? `HP +${r.hp}` : '', r.sp > 0 ? `기력 +${r.sp}` : '', r.buff && BUFFS[r.buff].type === 'buff' ? buffText(r.buff) : ''].filter(Boolean);
}
function costChips(r) {
  return [r.spCost ? `기력 -${r.spCost}` : '', r.money < 0 ? `CR ${r.money}` : '', r.sp < 0 ? `기력 ${r.sp}` : '', r.hp < 0 ? `HP ${r.hp}` : '', r.buff && BUFFS[r.buff].type === 'debuff' ? buffText(r.buff) : ''].filter(Boolean);
}
const chipList = (list, cls = '') => list.map(c => `<span class="reward-chip ${cls}">${esc(c)}</span>`).join('') || '<span class="tiny">없음</span>';
function choicesHtml(disabled) {
  const groups = currentGroups();
  if (!groups.length) return '<div class="empty">이 칸에서 할 수 있는 행동이 없습니다. 지형 칸을 찾아 이동하세요.</div>';
  return groups.map(g =>
    `<div class="choice-group">${g.label ? `<div class="choice-label">${esc(g.label)}</div>` : ''}<div class="choice-col">` +
    g.items.map(id => { const bl = actionBlocked(id), lg = levelGate(id); return `<button data-act="choice" data-choice="${esc(id)}" class="${lg ? 'locked' : ''}" ${disabled || bl ? 'disabled' : ''}${lg ? ` title="${esc(lg)}"` : ''}>${icon(ACTIONS[id].icon)} ${esc(ACTIONS[id].label)}${lg ? ` <small>(Lv.${ACTIONS[id].kind === 'subjob' ? SUBJOB_MIN_LV : PET_MIN_LV}~)</small>` : ''}${bl ? ` <small>(${Math.ceil(bl / 3600000)}시간 뒤)</small>` : ''}</button>`; }).join('') + '</div></div>').join('');
}
const MOVE_KINDS = ['travel', 'step', 'enter', 'leave'];
const runLabel = a => MOVE_KINDS.includes(a.kind) ? (a.kind === 'enter' ? '입장' : a.kind === 'leave' ? '퇴장' : '이동') : '실행';
const confirmTitle = a => a.kind === 'travel' ? `${LOCATIONS[a.to].name}(으)로 이동하시겠습니까?` : a.kind === 'step' ? '이 타일로 이동하시겠습니까?' : a.kind === 'enter' ? `${LOCATIONS[state.location].name}에 입장하시겠습니까?` : a.kind === 'leave' ? '미궁에서 퇴장하시겠습니까?' : `행동 확인 · ${a.title}`;
/* 확인창용 예상 정보. 타일 이동은 목표 칸까지의 경로로 계산한다 */
function previewOf(id, mi) {
  const a = ACTIONS[id];
  if (a.kind !== 'step') return actionPreview(id, mi);
  const m = state.dungeon && view.target ? planMove(...view.target) : { err: '이동할 수 없습니다.' };
  if (m.err) return m;
  const z = zoneOf(state.dungeon.zone), info = tileInfo(z, tileOf(z, ...view.target));
  return { time: `${fmtDur(m.sec)} (${m.steps}칸${m.rough ? ` · 험난한 지형 ${m.rough}칸 포함` : ''})`, gain: `${info.name} 도착`, cost: `기력 -${m.sp}`, desc: `${info.name} — ${info.desc}` };
}
function renderAction() {
  const loc = LOCATIONS[state.location], main = $('#actionMain'), panel = $('#actionPanel');
  panel.classList.toggle('showing-reward', !!state.pending);

  if (state.pending) { // 결과 화면: 결과 확인 버튼은 오른쪽 아래
    const { id, result: r } = state.pending;
    main.innerHTML = `<h3>${icon('assignment_turned_in')} 작전 결과 · ${esc(ACTIONS[id].title)}</h3><div class="result">${esc(r.text)}</div>` +
      `<h3>${icon('redeem')} 획득 보상</h3><div class="reward-list">${chipList(rewardChips(r))}</div>` +
      `<h3 class="cost-title">${icon('heart_broken')} 소모 · 손실</h3><div class="reward-list">${chipList(costChips(r), 'bad')}</div>` +
      `<div class="reward-actions"><button class="primary" data-act="claim">${icon('check')} 결과 확인</button></div>`;
    return;
  }
  if (state.active) { // 진행 중
    const act = state.active, a = ACTIONS[act.id], rep = act.cycles > 1 ? ` · ${act.cycles}회 반복` : '';
    main.innerHTML = `<h3>${icon('hourglass_top')} 진행 중 · ${esc(a.title)}${rep}</h3><p>${esc(a.action)}</p>` +
      `<div class="progress"><span id="runBar"></span></div><div class="run-meta"><span id="runLeft"></span><span>창을 닫아도 시간은 흐릅니다</span></div>` +
      (['battle', 'step', 'trip'].includes(a.kind) ? '<div class="battle-log" id="battleLog" aria-live="off"></div>' : '') +
      `<div class="reward-actions">${devBtn()}<button data-act="action-abort">중단</button></div>`;
    $('#choices').innerHTML = choicesHtml(true);
    updateRunning();
    return;
  }
  const d = state.dungeon;
  const lastCard = view.lastResult ? (() => { const { id, result: r } = view.lastResult, gain = rewardChips(r), loss = costChips(r);
    return `<div class="last-result"><div class="lr-head"><strong>${icon('assignment_turned_in')} 결과 · ${esc(ACTIONS[id].title)}</strong><button data-act="claim" aria-label="닫기">${icon('close')}</button></div><p>${esc(r.text)}</p>` +
      `<div class="reward-list">${chipList(gain)}${loss.map(c => `<span class="reward-chip bad">${esc(c)}</span>`).join('')}</div></div>`; })() : '';
  const tinfo = d && tileInfo(zoneOf(d.zone), tileOf(zoneOf(d.zone), d.x, d.y));
  let html = d ? `<h3>${icon('explore')} ${esc(loc.name)} · ${esc(tinfo.name)}</h3><p>${esc(tinfo.desc)}</p><p class="tiny">가고 싶은 타일을 누르면 이동 확인창이 뜹니다. 한 칸에 ${DUNGEON_STEP_SEC / 60}분 · 기력 ${DUNGEON_STEP_SP}이 듭니다.</p>`
    : `<h3>${esc(loc.name)}</h3><p>${loc.danger ? '입장하면 타일 미궁을 탐색할 수 있습니다.' : '행동을 선택하면 예상 시간과 보상을 먼저 확인할 수 있습니다.'}</p>`;
  if (view.phase === 'confirm') {
    const a = ACTIONS[view.id], todo = a.kind === 'todo', multi = a.kind === 'gather' || a.kind === 'battle', pv = previewOf(view.id, view.mult);
    if (pv.err) { resetPhase(); renderAction(); return; }
    html += `<div class="action-confirm-inline"><div class="cf-head"><strong>${esc(confirmTitle(a))}</strong>${todo ? '' : `<span class="cf-time">${icon('schedule')} ${esc(pv.time)}</span>`}</div><p>${esc(pv.desc || a.action)}</p>` +
      (multi ? `<div class="chips mult">${MULTI_OPTIONS.map((o, i) => `<button class="chip ${i === view.mult ? 'active' : ''}" data-act="mult" data-i="${i}">${o.label}</button>`).join('')}</div>` : '') +
      (todo ? '' : `${pv.odds ? `<small class="odds">확률 · ${esc(pv.odds)}</small>` : ''}<small class="gain"><b>보상</b> ${esc(pv.gain)}</small><small class="risk"><b>위험</b> ${esc(pv.cost)}</small>${pv.note ? `<small class="repeat-note">${esc(pv.note)}</small>` : ''}`) +
      `<div class="confirm-actions"><button data-act="action-cancel">${todo ? '닫기' : '취소'}</button>${todo ? '' : `<button class="primary" data-act="action-run">${esc(runLabel(a))}</button>`}</div></div>`;
  }
  main.innerHTML = lastCard + html;
  $('#choices').innerHTML = choicesHtml(false);
}
function updateRunning() {
  const a = state.active, bar = $('#runBar');
  if (!a || !bar) return;
  bar.style.width = clamp((nowMs() - a.startAt) / (a.endAt - a.startAt) * 100, 0, 100) + '%';
  $('#runLeft').textContent = `남은 시간 ${fmtTime(a.endAt - nowMs())}`;
  const bl = $('#battleLog'); // 전투 묘사 (1분에 한 줄, 전투가 끝나면 이 창과 함께 사라진다)
  if (bl) {
    const lines = activityLogFor(a).slice(-BATTLE_LOG_SHOW), sig = lines.map(l => l.text).join('|');
    if (bl.dataset.sig !== sig) { bl.dataset.sig = sig; bl.innerHTML = lines.map(l => `<div class="bl ${l.kind}">${esc(l.text)}</div>`).join(''); bl.scrollTop = bl.scrollHeight; }
  }
}

/* ---------- 행동 완료 알림 (탭을 보고 있지 않을 때) ---------- */
const baseTitle = document.title;
function awardTitles() { checkTitles().forEach(t => { addLog(`칭호 획득: ${t}`); toast(`새 칭호를 얻었습니다! 「${t}」 (프로필에서 착용)`); sfx('levelup'); }); }
function notifyDone(text) {
  if (!state.settings.notify || !document.hidden) return;
  document.title = `✔ 행동 완료 · ${baseTitle}`;
  try { if (window.Notification && Notification.permission === 'granted') new Notification('행동 완료', { body: text }); } catch (e) { /* 알림 불가 환경 */ }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) document.title = baseTitle; });

/* 1초마다: 버프 만료, 행동 진행/완료 */
function tick() {
  const col = collapseNow();
  if (col) {
    resetPhase(); renderBars(); renderMapHead(); renderMap(); renderAction(); renderSide(); renderBuffs();
    addLog(`쓰러져 본부로 구조되었습니다.${col.lost ? ` (구조비 ${col.lost} CR)` : ''}`); sfx('error');
    modal('쓰러졌습니다', `<p class="detail-desc">기력이 바닥나 더 움직일 수 없게 되었고, 비상 신호를 본 구조대가 대원을 데려왔습니다.</p><p class="detail-desc">본부로 안전하게 돌아왔어요. 개인실에서 쉬거나 잠자면 회복됩니다.</p><p class="tiny">${col.lost ? `구조비로 ${col.lost} CR을 냈고 ` : ''}부상 상태가 되었습니다. 아이템은 그대로입니다.</p>`, [btnClose]);
  }
  if (pruneBuffs()) { renderBuffs(); save(); }
  renderBuffs(); // 펫의 든든함이 끝나면 버프 아이콘도 사라진다
  if (resetBoardQuests()) { renderSide(); toast('수주한 임무가 24시간이 지나 리셋되었습니다.'); }
  farmRefresh();
  awardTitles();
  newUnlocks().forEach(t => { addLog(t); toast(t); sfx('levelup'); notifyDone(t); });
  state.pets.forEach(p => { const k = p.id + (p.exp ? p.exp.at : 0); if (expReady(p) && !view.petBack[k]) { view.petBack[k] = true; toast(`${PET_SPECIES[p.id].name}이(가) ${p.exp.zone} 탐험에서 돌아왔어요. 개인실에서 수확물을 받으세요.`); sfx('done'); } });
  if (pruneMail()) renderMailBadge();
  if (renderMailBadge.n !== unreadMail()) { renderMailBadge.n = unreadMail(); renderMailBadge(); }
  if (state.active) {
    const fin = finishIfDue();
    if (fin) {
      renderBars(); renderMapHead(); renderMap(); renderAction(); renderSide();
      if (fin === 'trip') { notifyDone('지상에 도착했습니다.'); sfx('done'); toast('지상에 도착했습니다. 미궁 입구입니다.'); }
      else if (fin === 'step') { const z = zoneOf(state.dungeon.zone), n = tileInfo(z, tileOf(z, state.dungeon.x, state.dungeon.y)).name; notifyDone('이동을 마쳤습니다.'); sfx('done'); toast('도착했습니다.'); }
      else { notifyDone(`${ACTIONS[state.pending.id].title}을(를) 마쳤습니다.`); sfx('done'); toast('행동이 완료되었습니다. 보상을 받았습니다.'); }
      if (travelFinds.length) toast(`길가에서 ${[...new Set(travelFinds)].join(', ')}을(를) 주웠습니다!`), travelFinds.length = 0;
    } else updateRunning();
  }
  if (state.pending) A.claim(); // 결과는 확인을 누르지 않아도 바로 받는다 (끝난 행동의 결과 카드는 행동 패널에 남는다)
  if (craftTick()) {
    const name = state.crafting.out, res = collectCraft();
    renderBag(); sfx('done'); notifyDone(`${name} 제작이 완료되었습니다.`);
    if (res && res.got) { toast(`${name} 제작 완료${res.great ? ' (대성공! 2개)' : ''}`); if (res.great) addLog(`${name} 제작 대성공! 2개가 만들어졌습니다.`); }
    else toast(`${name} 제작 완료. 가방을 비우고 제작 탭에서 수령하세요.`);
  }
  updateCraftTimer();
}

/* ---------- 로그 / 오른쪽 패널 / 채팅 / 게시판 ---------- */
function renderLogs() {
  $('#logList').innerHTML = state.logs.map(l => `<div class="log-row"><time>${esc(l.time)}</time><p>${esc(l.text)}</p></div>`).join('') || '<div class="empty">기록이 없습니다.</div>';
}
const rewardText = q => `보상 · EXP +${q.reward.exp} · CR +${q.reward.money}${(q.reward.items || []).map(([n, c]) => ` · ${n} ×${c}`).join('')}`;
function renderSide() {
  $$('[data-side]').forEach(b => b.classList.toggle('active', b.dataset.side === state.side));
  const mine = takenQuests().filter(x => !state.questDone[x.id]), q = mine.length;
  $('#rightTitle').textContent = state.side; $('#rightTitleIcon').textContent = state.side === '임무' ? 'assignment' : 'groups';
  $('#rightMeta').textContent = state.side === '임무' ? `진행 ${q}` : `${NEARBY_PLAYERS.length}명`;
  if (state.side === '주위 대원') {
    $('#sideView').innerHTML = NEARBY_PLAYERS.map(([n, s]) =>
      `<div class="nearby-row"><div class="round-avatar">${icon('person')}</div><div class="grow"><strong>${esc(n)}</strong><small>${esc(LOCATIONS[state.location].name)} · ${esc(s)}</small></div><button data-act="player" data-player="${esc(n)}">정보</button><button data-act="trade-open" data-player="${esc(n)}">교환</button></div>`).join('') +
      (NEARBY_PLAYERS.length ? '' : '<div class="empty">주위에 다른 대원이 없습니다.</div>') + '<p class="tiny">같은 장소에 있는 대원은 서버 연결 후에 표시됩니다.</p>';
    return;
  }
  const order = [...mine].sort((a, b) => (questProgress(b).ready ? 1 : 0) - (questProgress(a).ready ? 1 : 0)); // 완수 가능한 임무를 맨 위로 (같으면 원래 순서)
  if (!order.length) { $('#sideView').innerHTML = '<div class="empty">진행 중인 임무가 없습니다.</div>'; return; }
  $('#sideView').innerHTML = order.map(q => {
    const done = !!state.questDone[q.id], open = view.quest === q.id, pr = questProgress(q);
    const detail = open ? `<div class="quest-detail"><p>${esc(q.desc)}</p><div class="quest-prog"><div class="progress"><span style="width:${pr.cur / pr.max * 100}%"></span></div><small>${esc(pr.text)}</small></div>` +
      `<div class="quest-reward">${esc(rewardText(q))}</div>` +
      `<div class="confirm-actions"><button class="primary" data-act="quest-done" data-id="${q.id}" ${done || !pr.ready ? 'disabled' : ''}>${done ? '완료됨' : '임무 완수'}</button></div></div>` : '';
    return `<div class="quest-item ${open ? 'open' : ''} ${done ? 'done' : ''} ${!done && pr.ready ? 'ready' : ''}"><div class="quest-row ${q.kind === '메인' ? 'main-quest' : ''}" data-act="quest" data-id="${q.id}"><span class="quest-state">${done ? '완료' : pr.ready ? '완수 가능' : '진행 중'}</span><strong>${q.kind === '메인' ? '◆ ' : ''}${esc(q.title)}</strong><small>${esc(q.desc)}</small></div>${detail}</div>`;
  }).join('');
}
const SYSTEM_SPEAKERS = { '관제 시스템': 'smart_toy', '시스템': 'smart_toy', '공지': 'campaign', '업데이트': 'system_update_alt' };
const FACE_ICONS = ['face', 'face_2', 'face_3', 'face_4', 'face_5', 'face_6'];
const speakerIcon = n => SYSTEM_SPEAKERS[n] || FACE_ICONS[[...n].reduce((a, c) => a + c.charCodeAt(0), 0) % FACE_ICONS.length];
/* ---- 대원 아이콘: 각자 설정한 프로필 이미지(서버에 64px로 올려 둔 것)를 보여 주고, 없으면 기본 얼굴 아이콘 ---- */
view.avatars = {}; view.avWant = new Set(); view.chatSrv = { '월드': [], '길드': [] }; view.chatLast = { '월드': 0, '길드': 0 };
const CHAT_CH = { '월드': 'world', '길드': 'guild' }, CHAT_CACHE = 'deeplayer-chat', CHAT_KEEP = 60;
(function loadChatCache() { // 새로고침해도 직전 대화가 바로 보이도록 서버 채팅의 최근 글을 이 기기에 남겨 둔다 (아이디가 다르면 무시)
  try {
    const c = JSON.parse(localStorage.getItem(CHAT_CACHE)); if (!c || c.u !== Cloud.user()) return;
    for (const tab of ['월드', '길드']) {
      const rows = ((c[tab] || {}).rows || []).filter(r => Array.isArray(r) && Number.isFinite(r[3])).slice(-CHAT_KEEP).map(r => [cleanText(r[0], 12), cleanText(r[1], 200), /^[0-9a-f-]{36}$/i.test(r[2]) ? r[2] : '', r[3]]);
      view.chatSrv[tab] = rows; view.chatLast[tab] = rows.length ? rows[rows.length - 1][3] : 0;
    }
  } catch (e) { /* 저장된 대화 없음 */ }
})();
function saveChatCache() { try { localStorage.setItem(CHAT_CACHE, JSON.stringify({ u: Cloud.user(), '월드': { rows: view.chatSrv['월드'].slice(-CHAT_KEEP) }, '길드': { rows: view.chatSrv['길드'].slice(-CHAT_KEEP) } })); } catch (e) { /* 저장 불가 */ } }
const chatOnline = () => Cloud.enabled && !!Cloud.user();
function avatarOf(name) {
  const n = String(name || ''), mine = n === '나' || (state.character.name && n === state.character.name);
  if (SYSTEM_SPEAKERS[n]) return icon(SYSTEM_SPEAKERS[n]);
  const img = mine ? getAvatar() : view.avatars[n];
  if (img && /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(img)) return `<img src="${esc(img)}" alt="">`;
  if (!mine && chatOnline() && !(n in view.avatars) && n) { view.avWant.add(n); clearTimeout(view.avT); view.avT = setTimeout(fetchAvatars, 250); }
  return icon(mine ? 'person' : speakerIcon(n));
}
async function fetchAvatars() { // 아직 모르는 대원의 이미지를 한꺼번에 가져온다 (없는 대원도 '없음'으로 기억해 다시 묻지 않는다)
  const names = [...view.avWant].slice(0, 40); view.avWant.clear(); if (!names.length || !chatOnline()) return;
  try {
    const got = await Cloud.getAvatars(names);
    names.forEach(n => { view.avatars[n] = typeof got[n] === 'string' ? got[n] : ''; });
    renderChat(); // 열려 있는 창은 통째로 다시 그리지 않고(검색 결과·입력이 지워짐) 아이콘 칸만 바꾼다
    $$('#modalBody .round-avatar, #modalBody .member-row .round-avatar').forEach(el => { const nm = el.nextElementSibling && el.nextElementSibling.querySelector('strong'); const n = nm && nm.textContent.trim(); if (n && names.includes(n) && view.avatars[n]) el.innerHTML = avatarOf(n); });
  } catch (e) { names.forEach(n => { view.avatars[n] = ''; }); }
}
setInterval(() => { view.avatars = {}; }, 10 * 60 * 1000); // 10분마다 새로 받아 다른 대원이 바꾼 이미지도 반영
async function smallAvatar(dataUrl) { // 서버에는 64px 작은 이미지만 올린다
  const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = dataUrl; });
  const k = 64 / Math.max(img.width, img.height, 1), cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(img.width * k)); cv.height = Math.max(1, Math.round(img.height * k));
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  for (const q of [.7, .5, .35]) { let o = cv.toDataURL('image/webp', q); if (!o.startsWith('data:image/webp')) o = cv.toDataURL('image/jpeg', q); if (o.length <= 19000) return o; }
  return '';
}
async function syncMyAvatar() { // 내 이미지를 서버에 올린다 (바꾸거나 지울 때, 접속할 때)
  if (!chatOnline()) return;
  try { const my = getAvatar(); await Cloud.setAvatar(my ? await smallAvatar(my) : ''); } catch (e) { /* 서버 준비 전 */ }
}
async function chatPoll() { // 월드·길드 채팅을 서버에서 가져온다
  if (!chatOnline() || !state.created || document.hidden || view.chatBusy) return;
  view.chatBusy = true; let changed = false;
  try {
    for (const tab of ['월드', '길드']) {
      if (tab === '길드' && !state.guild) { if (view.chatSrv['길드'].length) { view.chatSrv['길드'] = []; view.chatLast['길드'] = 0; changed = true; } continue; }
      let rows; try { rows = await Cloud.chatFetch(CHAT_CH[tab], view.chatLast[tab]); } catch (e) { continue; }
      for (const r of rows) {
        const id = Number(r.id); if (!Number.isFinite(id) || id <= view.chatLast[tab]) continue;
        view.chatLast[tab] = id; view.chatSrv[tab].push([cleanText(r.name, 12) || '?', cleanText(r.body, 200), /^[0-9a-f-]{36}$/i.test(r.uid) ? r.uid : '', id]); changed = true;
        if (r.uid !== Cloud.userUid && state.chatTab !== tab && view.chatReady) { toast(`[${tab}] ${cleanText(r.name, 12)}: ${cleanText(r.body, 40)}`); }
      }
      view.chatSrv[tab] = view.chatSrv[tab].slice(-100);
    }
  } finally { view.chatBusy = false; }
  view.chatReady = true;
  if (changed) saveChatCache();
  if (changed && $('#chatFeed') && (state.chatTab === '월드' || state.chatTab === '길드')) renderChat();
}
function renderChat() {
  const tab = state.chatTab, g = state.guild, bar = $('#guildBar');
  bar.classList.toggle('hidden', tab !== '길드');
  bar.innerHTML = `<span class="chan-info">${icon('groups')} ${g ? `${esc(g.name)} · ${g.members.length + 1}명${g.master ? ' · 길드장' : ''}` : '길드 없음'}</span><button data-act="guild-open">${icon('settings')} ${g ? '관리' : '만들기'}</button>`;
  const writer = tab === '알림' && canNotice(); // 알림은 공지만 받는 읽기 전용 — 개발자 모드가 켜져 있으면 말머리를 달아 공지를 쓸 수 있다
  $('#chatForm').classList.toggle('hidden', tab === '알림' && !writer);
  $('#noticeHead').classList.toggle('hidden', !writer); $('#chatInput').placeholder = writer ? '공지 내용 입력...' : '암호화 메시지 입력...';
  if (tab === '알림') setTray(false);
  $('#noticeNote').classList.toggle('hidden', tab !== '알림' || writer);
  $$('[data-chat]').forEach(b => b.classList.toggle('active', b.dataset.chat === state.chatTab));
  $('#chatFeed').innerHTML = (chatOnline() && CHAT_CH[state.chatTab] ? view.chatSrv[state.chatTab] : (state.chats[state.chatTab] || [])).map(([n, m, uid]) => {
    const st = /^\[(.+)\]$/.exec(m), sticker = st && STICKERS.find(x => x[0] === st[1]);
    const body = sticker ? `<div class="bubble sticker-msg" title="${esc(sticker[0])}">${icon(sticker[1])}</div>` : `<div class="bubble">${esc(m)}</div>`;
    const mine = n === '나' || (!!uid && uid === Cloud.userUid), who = mine ? (state.character.name || '나') : n;
    return `<div class="msg ${mine ? 'mine' : 'other'}"><div class="msg-ava">${avatarOf(mine ? '나' : n)}</div><div class="msg-main"><span class="msg-name">${esc(who)}</span>${body}</div></div>`; // 컴팩트 한 줄 형식: 아이콘 · 이름 · 내용 (내 이름은 색이 다르다)
  }).join('');
  $('#chatFeed').scrollTop = $('#chatFeed').scrollHeight;
}
function openBoard(name) {
  const posts = POSTS[name] || [];
  modal(name, `<div class="post-layout"><div class="post-list">${posts.map((p, i) => `<button class="post-item ${i ? '' : 'active'}" data-act="post" data-board="${esc(name)}" data-post="${i}">${esc(p[0])}</button>`).join('')}</div>` +
    `<article class="post-detail" id="postDetail"><h3>${esc(posts[0][0])}</h3><p>${esc(posts[0][1])}</p></article></div>`, [btnClose]);
}

/* ---------- 서버 저장 (js/cloud.js 의 CLOUD 설정이 채워져 있을 때만 나타난다) ---------- */
let _cloudTimer = 0, _cloudBlocked = false;
function cloudSchedule() {
  if (!Cloud.enabled || !Cloud.user() || _cloudBlocked || _cloudTimer) return;
  _cloudTimer = setTimeout(cloudAutoPush, 20000);
}
async function cloudAutoPush() {
  _cloudTimer = 0;
  try {
    const r = await Cloud.push(JSON.parse(JSON.stringify(state)));
    if (!r.ok) { _cloudBlocked = true; toast('다른 기기에서 먼저 저장했어요. 설정 → 서버 저장에서 선택해 주세요.'); }
  } catch (e) { /* 오프라인: 다음 저장 때 다시 시도 */ }
}
function cloudApply(data) { // 서버 세이브로 교체하고 다시 시작
  window.__noSave = true;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* 저장 불가 */ }
  location.reload();
}
function cloudGroupHtml() {
  const u = Cloud.enabled && Cloud.user();
  const local = '<button data-act="local-save">로컬 저장</button><button data-act="local-load">로컬 불러오기</button>';
  if (!u) return `<div class="setting-group"><h3>저장</h3><div class="cloudrow"><span class="tiny">세이브 파일로 저장하고 불러올 수 있어요.</span>${local}</div></div>`;
  return `<div class="setting-group"><h3>서버 저장</h3><div class="cloudrow"><span><b>${esc(u)}</b> 로그인됨</span><button data-act="cloud-push">저장</button><button data-act="cloud-pull">서버 불러오기</button>${local}</div><p class="tiny">진행은 20초 정도마다 자동으로 서버에 저장돼요.${_cloudBlocked ? ' (⚠ 다른 기기가 먼저 저장해 자동 저장이 멈춰 있어요)' : ''} 로컬 저장은 이 기기에 세이브 파일(.json)로 내려받아요.</p></div>`;
}
async function cloudAfterLogin() { // 로그인 직후: 서버에 세이브가 있으면 어느 쪽을 쓸지 묻는다
  const s = await Cloud.pull();
  if (!s) { await Cloud.push(JSON.parse(JSON.stringify(state))); toast('이 기기의 진행을 서버에 저장했어요.'); openSettings(); return; }
  modal('서버 저장 발견', `<p>서버에 저장된 진행이 있어요. (${esc(String(s.at || '').slice(0, 16).replace('T', ' '))})<br>어느 쪽을 쓸까요?</p><p class="tiny">서버 것을 쓰면 이 기기의 현재 진행은 사라집니다.</p>`,
    ['<button data-act="cloud-use-server" class="primary">서버 진행 불러오기</button>', '<button data-act="cloud-use-local">이 기기 진행으로 덮어쓰기</button>']);
  view.cloudServer = s;
}

/* ---------- 설정 (소리는 한 묶음, 컴팩트) ---------- */
const snd = (id, ic, label, on) => `<label class="switch snd-switch"><span>${icon(ic)} ${label}</span><input id="${id}" type="checkbox" role="switch" ${on ? 'checked' : ''}><i></i></label>`;
const sw = (id, label, on, cls = '', dis = '') => `<label class="switch ${cls}"><span>${label}</span><input id="${id}" type="checkbox" role="switch" ${on ? 'checked' : ''} ${dis}><i></i></label>`;
function openSettings() {
  const st = state.settings;
  const opt = (v, l, cur) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`;
  modal('환경 설정',
    `<div class="setting-group"><h3>소리</h3>` +
    `<div class="snd-card">${snd('bgmOn', 'music_note', '배경음악', st.bgmOn)}<div class="snd-slider">${icon('volume_down')}<input id="bgmVolume" type="range" min="0" max="100" value="${st.bgmVolume}" aria-label="배경음악 크기"><b id="bgmValue">${st.bgmVolume}%</b></div></div>` +
    `<div class="snd-card"><div class="snd-title">${icon('graphic_eq')} 효과음</div><div class="snd-pair">${snd('clickOn', 'ads_click', '클릭음', st.clickOn)}${snd('alertOn', 'notifications_active', '알림음', st.alertOn)}</div>` +
    `<div class="snd-slider">${icon('volume_down')}<input id="sfxVolume" type="range" min="0" max="100" value="${st.sfxVolume}" aria-label="효과음 크기"><b id="sfxValue">${st.sfxVolume}%</b></div></div></div>` +
    `<div class="setting-group"><h3>표시</h3>${sw('cursorOn', '사용자 지정 커서', st.cursor)}<div class="srow fontrow"><span>글자 크기</span><select id="fontSize">${opt('s', '작게', st.fontSize)}${opt('m', '보통', st.fontSize)}${opt('l', '크게', st.fontSize)}${opt('xl', '아주 크게', st.fontSize)}</select></div></div>` +
    `<div class="setting-group"><h3>튜토리얼</h3><div class="row-gap end"><button data-act="tutorial-replay">튜토리얼 다시 보기</button></div></div>` +
    cloudGroupHtml() +
    `<div class="setting-group"><h3>알림</h3>${sw('notifyOn', '다른 탭을 보고 있을 때 행동 완료 알림', st.notify)}${sw('guildAlertOn', '길드 채팅 알림 (새 메시지가 오면 알림음과 알림창)', st.guildAlert)}</div>` +
    `<div class="setting-group"><h3>테마</h3><div class="srow theme"><select id="themeSelect">${opt('light', '라이트', st.theme)}${opt('dark', '다크', st.theme)}${opt('custom', '사용자 설정', st.theme)}</select>` +
    `<span id="customOpts" class="${st.theme === 'custom' ? '' : 'hidden'}"><select id="customBase">${opt('light', '라이트 기반', st.customBase)}${opt('dark', '다크 기반', st.customBase)}</select><input id="customAccent" type="color" value="${esc(st.customAccent)}" title="강조 색상"></span></div></div>` +
    (window.DEV ? `<details class="setting-group dev-fold" id="devFold"><summary>개발자</summary><div class="row-gap"><span class="tiny">개발자 도구가 켜져 있습니다.</span><button data-act="dev-open">개발자 도구 열기</button><button data-act="bug-list">버그 리포트 보기</button></div></details>` : ''),
    ['<button data-act="close">취소</button>', '<button class="primary" data-act="settings-save">저장</button>'], true);
}

/* ---------- 도감: 구역 / 아이템 / 몬스터 / 레시피 (서브 분류 칩) ---------- */
const CODEX_TABS = ['구역', '아이템', '몬스터', '레시피'];
const CODEX_SUBS = { '구역': ['공중', '지상', '지형'], '아이템': ITEM_CATEGORIES, '몬스터': MONSTER_KINDS, '레시피': [] };
const codexView = { tab: '구역', sub: null };
const defaultGuildName = () => `${state.character.name}의 길드`.slice(0, GUILD_NAME_MAX);
/* 아이템 획득처: 데이터에서 한 번만 계산해 둔다 */
let _src = null;
function itemSources() {
  if (_src) return _src;
  const m = {}, put = (n, t) => { if (ITEMS[n]) (m[n] = m[n] || []).includes(t) || m[n].push(t); };
  DANGER_ZONES.forEach(z => z.terrains.forEach(t => {
    const w = `${z.id} ${t.name}`;
    t.gather.forEach(n => put(n, `${w} 채집`));
    if (t.rare) put(t.rare, `${w} 희귀 채집·조사`);
    t.monsters.forEach(mo => mo.drops.forEach(([n]) => put(n, `${w} · ${mo.name} 처치`)));
  }));
  Object.entries(ZONE_SEEDS).forEach(([z, n]) => put(n, `${z} 채집·전투 중 드물게`));
  const sh = {};
  Object.entries(SHOPS).forEach(([k, d]) => [...d.base, ...d.special].forEach(([n, pr]) => (sh[n] = sh[n] || []).push([k, pr])));
  Object.entries(sh).forEach(([n, l]) => put(n, `상점 (${l[0][0]} ${l[0][1]}원${l.length > 1 ? ` 외 ${l.length - 1}곳` : ''})`));
  Object.entries(CROPS).forEach(([n, c]) => put(n, `농장 (${c.seed} 심기)`));
  RECIPES.forEach(rc => put(rc.out, `제작 (${Object.entries(rc.mats).map(([n, q]) => `${n} ×${q}`).join(' + ')})`));
  QUESTS.forEach(q => ((q.reward && q.reward.items) || []).forEach(([n]) => put(n, `임무 보상 · ${q.title}`)));
  _src = m; return m;
}
const sourceText = n => { const l = itemSources()[n]; return l ? (l.length > 4 ? l.slice(0, 4).join(' / ') + ` 외 ${l.length - 4}곳` : l.join(' / ')) : '특별한 이벤트·거래 등'; };
function codexEntries(tab) {
  const c = state.codex;
  if (tab === '구역') return [
    ...SAFE_ZONES.map(z => ({ sub: '공중', icon: z.icon, name: z.id, desc: z.desc, known: c.zones[z.id] })),
    ...DANGER_ZONES.map(z => ({ sub: '지상', icon: z.icon, name: z.name, desc: z.desc, known: c.zones[z.id] })),
    ...DANGER_ZONES.flatMap(z => z.terrains.map(t => ({ sub: '지형', icon: t.icon, name: `${t.name} · ${z.id}`, desc: t.desc, known: c.zones[`${z.id}:${t.name}`] })))
  ];
  if (tab === '아이템') return Object.entries(ITEMS).map(([n, it]) => ({ sub: it.tab, icon: it.icon, name: n, desc: it.desc, src: sourceText(n), known: c.items[n] }));
  if (tab === '몬스터') return DANGER_ZONES.flatMap(z => z.terrains.flatMap(t => t.monsters.map(m => ({ sub: m.kind, icon: m.kind === '짐승' ? 'pets' : 'bug_report', name: m.name,
    desc: `${m.desc} (HP ${m.hp} · 공격 ${m.atk})`, where: `${z.name} · ${t.name}`, known: c.monsters[m.name] }))));
  return RECIPES.map(rc => ({ sub: '', icon: ITEMS[rc.out].icon, name: rc.out, desc: Object.entries(rc.mats).map(([n, q]) => `${n} ×${q}`).join(' + '), known: recipeKnown(rc), badge: recipeKnown(rc) ? (c.recipes[rc.out] ? '제작 완료' : '미제작') : (rankAtLeast(rc.rank) ? '단련으로 습득 가능' : `${rc.rank}등급부터 단련으로 습득`) }));
}
function codexHtml() {
  const { tab, sub } = codexView, all = codexEntries(tab), list = sub ? all.filter(e => e.sub === sub) : all;
  const found = list.filter(e => e.known).length;
  return `<div class="tabs flush">${CODEX_TABS.map(t => `<button class="${t === tab ? 'active' : ''}" data-act="codex-tab" data-codex="${t}">${t}</button>`).join('')}</div>` +
    (CODEX_SUBS[tab].length ? `<div class="chips">${['', ...CODEX_SUBS[tab]].map(x => `<button class="chip ${x === (sub || '') ? 'active' : ''}" data-act="codex-sub" data-sub="${x}">${x || '전체'}</button>`).join('')}</div>` : '') +
    `<p class="tiny codex-count">${tab === '레시피' ? `${list.length}종` : `발견 ${found} / ${list.length}`}</p><div class="codex-list">` +
    list.map(e => e.known
      ? `<div class="nearby-row"><div class="round-avatar">${icon(e.icon)}</div><div class="grow"><strong>${esc(e.name)}</strong><small>${esc(e.desc)}${e.where ? ` · 서식지 ${esc(e.where)}` : ''}</small>${e.src ? `<small class="src">획득: ${esc(e.src)}</small>` : ''}</div>${e.badge ? `<span class="tag ${e.badge === '제작 완료' ? 'ok' : ''}">${e.badge}</span>` : e.sub ? `<span class="tag">${esc(e.sub)}</span>` : ''}</div>`
      : `<div class="nearby-row unknown"><div class="round-avatar">${icon('help')}</div><div class="grow"><strong>???</strong><small>아직 발견하지 못했습니다.</small></div>${e.sub ? `<span class="tag">${esc(e.sub)}</span>` : ''}</div>`).join('') + '</div>';
}

function openSystem(name) {
  let body, actions = [btnClose];
  if (name === '메일') { view.mailTab = '받은 메일함'; view.mailOpen = null; openMail(); return; }
  else if (name === '친구') { openFriends(); return;
  } else if (name === '길드') {
    openGuild(); return;
  } else {
    body = `<div id="codexRoot">${codexHtml()}</div>`;
  }
  modal(name, body, actions);
}

/* ---------- 친구 / 메일 ---------- */
let _inboxN = -1, _tradeN = -1, _guildN = -1, _polling = false;
const itemsText = list => list.map(([n, q]) => `${n} ×${q}`).join(', ');
const inboxHtml = () => {
  let h = (view.fOut && view.fOut.length) ? `<div class="choice-label">내가 보낸 친구 신청 ${view.fOut.length}건 (상대의 수락을 기다리는 중)</div>` + view.fOut.map(r => `<div class="nearby-row"><div class="round-avatar">${icon('hourglass_top')}</div><div class="grow"><strong>${esc(r.name)}</strong><small>수락 대기 중</small></div><button data-act="friend-req-cancel" data-id="${r.id}">취소</button></div>`).join('') : '';
  h += (view.inbox && view.inbox.length)
    ? `<div class="choice-label">받은 친구 신청 ${view.inbox.length}건</div>` + view.inbox.map(r => `<div class="nearby-row"><div class="round-avatar">${avatarOf(r.name)}</div><div class="grow"><strong>${esc(r.name)}</strong><small>친구 신청을 보냈어요</small></div><button class="primary" data-act="friend-accept" data-id="${r.id}">수락</button><button data-act="friend-decline" data-id="${r.id}">거절</button></div>`).join('') : '';
  if (view.tIn && view.tIn.length) h += `<div class="choice-label">받은 교환 제안 ${view.tIn.length}건</div>` + view.tIn.map(r => `<div class="nearby-row"><div class="round-avatar">${icon('swap_horiz')}</div><div class="grow"><strong>${esc(r.name)}</strong><small>${esc(`줌: ${itemsText(r.give)} ↔ 요청: ${itemsText(r.want)}`)}</small></div><button class="primary" data-act="ftrade-accept" data-id="${r.id}">수락</button><button data-act="ftrade-decline" data-id="${r.id}">거절</button></div>`).join('');
  if (view.tOut && view.tOut.length) h += `<div class="choice-label">내가 보낸 교환 제안 ${view.tOut.length}건 (물건은 맡겨 둔 상태)</div>` + view.tOut.map(r => `<div class="nearby-row"><div class="round-avatar">${icon('hourglass_top')}</div><div class="grow"><strong>${esc(r.name)}</strong><small>${esc(`내가 줌: ${itemsText(r.give)} ↔ 받을 것: ${itemsText(r.want)}`)}</small></div><button data-act="ftrade-cancel" data-id="${r.id}">취소</button></div>`).join('');
  return h;
};
const sid9 = v => intIn(v, 1, 9e15, 0);
async function friendPoll() { // 서버에서 친구 신청·메일·교환 소식을 가져온다
  if (!Cloud.enabled || !Cloud.user() || !state.created || _polling) return;
  _polling = true;
  try {
    let changed = false, newMail = 0;
    try { // 친구 신청 / 결과
      const ib = await Cloud.friendInbox();
      view.fOut = (ib.sent || []).map(r => ({ id: sid9(r.id), name: cleanText(r.name, 12) })).filter(r => r.id && r.name);
      view.inbox = (ib.incoming || []).map(r => ({ id: sid9(r.id), name: cleanText(r.name, 12) })).filter(r => r.id && r.name);
      for (const r of ib.results || []) {
        const n = cleanText(r.name, 12), id = sid9(r.id); if (!id) continue;
        if (r.status === 'accepted') { const err = addFriendAccepted(n); toast(err ? `${n} 대원이 수락했지만 ${err}` : `${n} 대원이 친구 신청을 수락했어요.`); }
        else toast(`${n} 대원이 친구 신청을 거절했어요.`);
        changed = true; try { await Cloud.ackFriendReq(id); } catch (e) { /* 다음에 다시 */ }
      }
      if (view.inbox.length > Math.max(_inboxN, 0)) toast(`친구 신청이 ${view.inbox.length}건 와 있어요. (친구 창에서 확인)`);
      _inboxN = view.inbox.length;
    } catch (e) { /* 서버 준비 전 */ }
    try { // 서버 친구 목록(메일·교환 주소)
      const fl = await Cloud.listFriends(); view.friendUid = {};
      for (const f of fl) { const n = cleanText(f.name, 12); if (n && /^[0-9a-f-]{36}$/i.test(f.uid)) { view.friendUid[n] = f.uid; if (!state.friends.includes(n)) { addFriendAccepted(n); changed = true; } } }
    } catch (e) { /* 서버 준비 전 */ }
    try { // 메일
      const ml = await Cloud.fetchMail(), ids = [];
      for (const m of ml) {
        const id = sid9(m.id); if (!id) continue;
        receiveServerMail(cleanText(m.name, 12) || '?', cleanText(m.subject, 30) || '(제목 없음)', cleanText(m.body, 300), m.items); ids.push(id); newMail++;
      }
      if (ids.length) { await Cloud.ackMail(ids); renderMailBadge(); toast(`새 메일 ${ids.length}통이 도착했어요.`); }
    } catch (e) { /* 서버 준비 전 */ }
    try { // 교환
      const tb = await Cloud.tradeInbox(), fix = r => ({ id: sid9(r.id), name: cleanText(r.name, 12), give: cleanItemList(r.give, 3), want: cleanItemList(r.want, 3) });
      view.tIn = (tb.incoming || []).map(fix).filter(r => r.id && r.give.length && r.want.length);
      view.tOut = (tb.sent || []).map(fix).filter(r => r.id);
      for (const r0 of tb.results || []) {
        const r = fix(r0); if (!r.id) continue;
        if (r0.status === 'accepted') receiveServerMail(`교환 · ${r.name}`.slice(0, 12), '교환 성사', `${r.name} 대원이 교환을 수락했어요. 받은 물건을 수령하세요.`, r.want);
        else receiveServerMail(`교환 · ${r.name}`.slice(0, 12), '교환 취소', `${r.name} 대원과의 교환이 성사되지 않았어요. 맡겨 둔 물건을 돌려받으세요.`, r.give);
        toast(r0.status === 'accepted' ? `${r.name} 대원과의 교환이 성사됐어요. 메일함에서 수령하세요.` : `${r.name} 대원과의 교환이 취소됐어요. 메일함에서 물건을 돌려받으세요.`);
        changed = true; try { await Cloud.ackTrade(r.id); } catch (e) { /* 다음에 다시 */ }
      }
      if (view.tIn.length > Math.max(_tradeN, 0)) toast(`교환 제안이 ${view.tIn.length}건 와 있어요. (친구 창에서 확인)`);
      _tradeN = view.tIn.length;
    } catch (e) { /* 서버 준비 전 */ }
    try { // 길드
      const gi = await Cloud.guildInfo(); guildSyncState(gi);
      const n = (gi.incoming || []).length;
      if (n > Math.max(_guildN, 0)) toast(`길드 요청이 ${n}건 와 있어요. (길드 창에서 확인)`);
      _guildN = n; view.guildIn = n;
    } catch (e) { /* 서버 준비 전 */ }
    renderMailBadge();
    if (changed || newMail) { if ($('#friendInbox')) openFriends(true); }
    else if ($('#friendInbox')) $('#friendInbox').innerHTML = inboxHtml();
  } finally { _polling = false; }
}
if (Cloud.enabled) { setTimeout(friendPoll, 5000); setInterval(friendPoll, 60000); setTimeout(() => { syncMyAvatar(); chatPoll(); }, 1200); setInterval(chatPoll, 6000); }
function openFriends(noPoll) {
  Object.keys(view.avatars).forEach(k => { if (!view.avatars[k]) delete view.avatars[k]; }); // 못 찾았던 이름은 창을 열 때 다시 물어본다
  renderMailBadge();
  const list = state.friends.map(n => `<div class="nearby-row"><div class="round-avatar">${avatarOf(n)}</div><div class="grow"><strong>${esc(n)}</strong><small>${esc((samplePlayer(n) || ['', '온라인'])[1])}</small></div>${Cloud.enabled && Cloud.user() ? `<button data-act="ftrade-open" data-name="${esc(n)}">교환</button>` : ''}<button data-act="friend-remove" data-name="${esc(n)}">삭제</button></div>`).join('');
  modal('친구', `<div class="search-row"><input id="friendSearch" placeholder="대원 이름으로 검색" aria-label="대원 검색"><button data-act="friend-search">검색</button></div><div id="friendResult"></div><div id="friendInbox">${inboxHtml()}</div>` +
    `<div class="choice-label">친구 ${state.friends.length}/${FRIEND_MAX}</div><div id="friendList">${list || '<div class="empty">아직 친구가 없습니다. 주위 대원의 정보 창이나 검색으로 추가하세요.</div>'}</div>` +
    `<p class="tiny">서버에 로그인하면 이름으로 다른 대원을 찾을 수 있어요. 메일은 친구에게만 보낼 수 있어요. (메일·교환 등은 아직 서버와 연결되지 않았어요)</p>`, [btnClose]);
  if (!noPoll) friendPoll();
}
const mailItemRow = () => {
  const have = Object.values(state.inventory).flat().filter(s => s.n !== MAIL_SHIP_ITEM);
  const names = [...new Set(have.map(s => s.n))];
  return `<div class="mail-item row-gap"><select><option value="">(아이템 선택)</option>${names.map(n => `<option value="${esc(n)}">${esc(n)} (보유 ${countItem(n)})</option>`).join('')}</select><input type="number" min="1" max="99" value="1" aria-label="수량"></div>`;
};
function renderMailBadge() { // 메일 / 친구(신청·교환 제안) / 길드(초대·가입 신청) 아이콘에 새 소식 점을 단다
  const set = (name, n, label) => $$(`[data-system="${name}"]`).forEach(b => { b.classList.toggle('has-dot', n > 0); b.title = n ? `${label} (새 소식 ${n})` : label; });
  set('메일', unreadMail(), '메일함');
  set('친구', ((view.inbox || []).length) + ((view.tIn || []).length), '친구');
  set('길드', view.guildIn || 0, '길드');
}
function openMail(keepScroll) {
  const st = keepScroll ? $('#modalBody').scrollTop : 0, tab = view.mailTab || '받은 메일함', ship = countItem(MAIL_SHIP_ITEM);
  const tabs = `<div class="tabs flush">${['받은 메일함', '메일 보내기'].map(t => `<button class="${t === tab ? 'active' : ''}" data-act="mail-tab" data-tab="${t}">${t}</button>`).join('')}</div>`;
  let body;
  if (tab === '메일 보내기') {
    body = tabs + (state.friends.length ? '' : '<p class="tiny risk">받는 사람은 친구 목록에서 고를 수 있어요. 먼저 친구를 추가하세요. (친구 버튼)</p>') +
      `<div class="srow fontrow"><span>받는 사람</span><select id="mailTo" ${state.friends.length ? '' : 'disabled'}>${state.friends.length ? state.friends.map(n => `<option>${esc(n)}</option>`).join('') : '<option value="">친구 없음</option>'}</select></div>` +
      `<div class="srow fontrow"><span>제목</span><input id="mailSubject" maxlength="30" placeholder="메일 제목"></div>` +
      `<div class="srow fontrow"><span>내용</span><textarea id="mailBody" maxlength="300" placeholder="내용을 입력하세요 (300자)"></textarea></div>` +
      `<div class="choice-label">아이템 첨부 (선택)</div><div id="mailItems"></div><div class="row-gap"><button data-act="mail-add-row">+ 아이템 추가</button></div>` +
      `<p class="tiny">글만 보내는 메일은 무료예요. 아이템을 담으려면 <b>${MAIL_SHIP_ITEM}</b>(상점가에서 구매)가 1개 필요해요. (보유 ${ship}개 · 종류 ${MAIL_ITEM_KINDS}개, 합계 ${MAIL_ITEM_TOTAL}개까지)</p>`;
    modal('메일', body, [btnClose, `<button class="primary" data-act="mail-send" ${state.friends.length ? '' : 'disabled'}>보내기</button>`], true);
    return;
  }
  const open = view.mailOpen && state.mail.find(m => m.id === view.mailOpen && mailDelivered(m));
  if (open) {
    body = `<div class="result mail-view"><strong>${esc(open.subject)}</strong><small>${esc(open.from)} · ${new Date(open.at).toLocaleDateString('ko-KR')} · ${open.kept ? '보존됨' : `${mailDaysLeft(open)}일 뒤 사라짐`}</small><p>${esc(open.body)}</p>` +
      (open.items.length ? `<div class="reward-list">${chipList(open.items.map(([n, q]) => `${n} ×${q}`))}</div>` : '') + '</div>';
    modal('메일', body, [`<button data-act="mail-back">목록</button>`, `<button data-act="mail-keep" data-id="${open.id}">${open.kept ? '보존 해제' : `보존 (${keptCount()}/${MAIL_KEEP_MAX})`}</button>`, `<button data-act="mail-delete" data-id="${open.id}">삭제</button>`,
      open.items.length ? `<button class="primary" data-act="mail-claim" data-id="${open.id}" ${open.got ? 'disabled' : ''}>${open.got ? '수령 완료' : '첨부 받기'}</button>` : btnClose], true);
    return;
  }
  const rows = state.mail.filter(mailDelivered).map(m => `<div class="nearby-row mail-row ${m.read ? '' : 'unread'}"><div class="round-avatar">${icon(m.items.length ? 'package_2' : 'mail')}</div><div class="grow"><strong>${esc(m.subject)}</strong><small>${esc(m.from)} · ${m.kept ? '보존됨' : `${mailDaysLeft(m)}일 뒤 사라짐`}${m.items.length && !m.got ? ' · 첨부 있음' : ''}</small></div><button data-act="mail-open" data-id="${m.id}">읽기</button></div>`).join('');
  modal('메일', tabs + `<p class="tiny">메일은 ${MAIL_KEEP_DAYS}일이 지나면 사라져요. 보존한 메일(${keptCount()}/${MAIL_KEEP_MAX}통까지)만 남습니다.</p>` + (rows || '<div class="empty">받은 메일이 없습니다.</div>'),
    [btnClose, `<button class="primary" data-act="mail-tab" data-tab="메일 보내기">${icon('edit')} 메일 쓰기</button>`], true);
  $('#modalBody').scrollTop = st;
}

/* ---------- 툴팁 (data-tip-title / data-tip-desc / data-tip-end) ---------- */
const tip = $('#tooltip');
function showTip(el) {
  const left = el.dataset.tipEnd ? `<span class="tip-time">남은 시간 ${fmtTime(+el.dataset.tipEnd - nowMs())}</span>` : '';
  tip.innerHTML = `<b>${esc(el.dataset.tipTitle)}</b><span>${esc(el.dataset.tipDesc)}</span>${left}`;
  const r = el.getBoundingClientRect();
  tip.classList.add('show');
  const w = tip.offsetWidth, h = tip.offsetHeight;
  let y = r.bottom + 8;
  if (y + h > window.innerHeight - 8) y = r.top - h - 8;
  tip.style.left = clamp(r.left + r.width / 2 - w / 2, 8, window.innerWidth - w - 8) + 'px';
  tip.style.top = Math.max(8, y) + 'px';
}
function hideTip() { tip.classList.remove('show'); }
document.addEventListener('mouseover', e => { const el = e.target.closest('[data-tip-title]'); if (el) showTip(el); else hideTip(); });
document.addEventListener('scroll', hideTip, true);

/* ---------- 소리 ----------
   효과음: 브라우저에서 짧은 부드러운 톤을 합성한다 (파일 없음).
   BGM: BGM_FILE(audio/bgm.mp3)을 반복 재생하고, 파일이 없으면 내장 앰비언트 음을 합성한다. 브라우저 정책상 첫 클릭 이후 시작된다. */
let actx;
function tone(freq, start, dur, vol) {
  const t0 = actx.currentTime + start, o = actx.createOscillator(), g = actx.createGain();
  o.type = 'sine'; o.frequency.value = freq;
  g.gain.setValueAtTime(.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + .012);
  g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
  o.connect(g); g.connect(actx.destination);
  o.start(t0); o.stop(t0 + dur + .02);
}
const SFX = { click: [[700, 0, .05, .5]], ok: [[587, 0, .1, .8], [880, .09, .16, .8]], done: [[659, 0, .12, 1], [784, .12, .12, 1], [988, .24, .22, 1]],
  levelup: [[523, 0, .1, 1], [659, .1, .1, 1], [784, .2, .1, 1], [1047, .3, .3, 1]], error: [[300, 0, .09, .8], [240, .09, .14, .8]] };
function sfx(name) {
  const st = state.settings;
  if (!(name === 'click' ? st.clickOn : st.alertOn) || !st.sfxVolume) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    SFX[name].forEach(([f, d, l, v]) => tone(f, d, l, .09 * v * st.sfxVolume / 100));
  } catch (e) { /* 소리 불가 환경 */ }
}

let bgmMode = null, bgmEl = null, synth = null;
const BGM_GAIN = .6; // 배경음악은 설정 값의 60%로 재생한다 (효과음보다 한결 조용하게)
const bgmVol = () => state.settings.bgmVolume / 100 * BGM_GAIN;
let bgmFade = null;
/* 파일 BGM 페이드: 현재 볼륨에서 target까지 ms 동안 부드럽게 바꾼다 */
function fadeBgm(target, ms, done) {
  clearInterval(bgmFade); bgmFade = null;
  if (!bgmEl) { if (done) done(); return; }
  const from = bgmEl.volume, t0 = performance.now();
  bgmFade = setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    bgmEl.volume = Math.min(1, Math.max(0, from + (target - from) * k));
    if (k >= 1) { clearInterval(bgmFade); bgmFade = null; if (done) done(); }
  }, 50);
}
/* 내장 앰비언트: 느리게 바뀌는 코드 패드 + 가끔 울리는 맑은 음 (파일이 없을 때) */
function startSynth() {
  actx = actx || new (window.AudioContext || window.webkitAudioContext)();
  const out = actx.createGain(), lp = actx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 1100;
  out.gain.value = .0001; out.connect(lp); lp.connect(actx.destination);
  const chords = [[110, 165, 220, 261.6], [87.3, 130.8, 174.6, 261.6], [98, 146.8, 196, 246.9], [82.4, 123.5, 164.8, 247]];
  const bells = [523.3, 587.3, 659.3, 784, 880];
  let i = 0;
  const bar = () => {
    const t0 = actx.currentTime;
    chords[i++ % chords.length].forEach((f, k) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = k ? 'sine' : 'triangle'; o.frequency.value = f; o.detune.value = (k - 1.5) * 4;
      g.gain.setValueAtTime(.0001, t0);
      g.gain.linearRampToValueAtTime(.22, t0 + 2.5);
      g.gain.linearRampToValueAtTime(.0001, t0 + 9);
      o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + 9.2);
    });
    [2, 5].forEach(d => { if (Math.random() < .7) { const f = bells[Math.floor(Math.random() * bells.length)], o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = f; g.gain.setValueAtTime(.0001, t0 + d); g.gain.exponentialRampToValueAtTime(.05, t0 + d + .05); g.gain.exponentialRampToValueAtTime(.0001, t0 + d + 2.4);
      o.connect(g); g.connect(out); o.start(t0 + d); o.stop(t0 + d + 2.5); } });
  };
  bar();
  synth = { out, timer: setInterval(bar, 8000) };
  setBgmVolume(state.settings.bgmVolume);
}
function setBgmVolume(v) { // 슬라이더 조절: 바로 반영 (켜고 끌 때만 페이드)
  if (bgmMode === 'file') { clearInterval(bgmFade); bgmFade = null; if (!bgmEl.paused) bgmEl.volume = v / 100 * BGM_GAIN; }
  if (synth) synth.out.gain.setTargetAtTime(Math.max(.0001, v / 100 * .5 * BGM_GAIN), actx.currentTime, .6);
}
function stopBgm() { // 페이드아웃 후 멈춘다
  if (bgmEl && !bgmEl.paused) fadeBgm(0, 1200, () => bgmEl.pause());
  if (synth) { clearInterval(synth.timer); synth.out.gain.setTargetAtTime(.0001, actx.currentTime, .45); synth = null; }
}
function applyBgm() {
  const st = state.settings;
  if (!st.bgmOn || !st.bgmVolume) { stopBgm(); return; }
  if (bgmMode === 'file') {
    if (bgmEl.paused) { bgmEl.volume = 0; bgmEl.play().catch(() => {}); }
    fadeBgm(bgmVol(), 1600); return; // 켤 때 페이드인
  }
  if (bgmMode === 'synth') { if (!synth) startSynth(); else setBgmVolume(st.bgmVolume); if (actx.state === 'suspended') actx.resume(); return; }
  if (bgmMode === 'loading') return;
  bgmMode = 'loading';
  bgmEl = new Audio();
  bgmEl.loop = true; bgmEl.volume = 0;
  bgmEl.addEventListener('error', () => { bgmMode = 'synth'; applyBgm(); }, { once: true });
  bgmEl.addEventListener('canplaythrough', () => { bgmMode = 'file'; applyBgm(); }, { once: true });
  bgmEl.src = BGM_FILE;
}
/* 첫 사용자 동작에서 BGM 시작 + 모든 버튼에 부드러운 클릭음 */
document.addEventListener('pointerdown', () => applyBgm(), { once: true });
document.addEventListener('click', e => { const b = e.target.closest('button'); if (b && !b.disabled) sfx('click'); });

/* ---------- 클릭 처리: data-act -> A[이름] ---------- */
const A = {
  close: closeModal,
  'tutorial-replay': () => startTutorial(true),
  'avatar-pick': () => $('#avatarFile').click(),
  'avatar-clear': () => { try { localStorage.removeItem(AVATAR_KEY); } catch (e) { /* 저장 불가 */ } renderProfile(); openProfile(); syncMyAvatar(); renderChat(); },

  /* 지도 / 행동 */
  node: el => { const id = el.dataset.node; if (id !== state.location && !state.active && !state.pending) doTravel(id); else if (id !== state.location) { toast('진행 중이거나 결과 확인이 필요한 행동이 있어 이동할 수 없습니다.'); sfx('error'); } },
  choice: el => {
    const a = ACTIONS[el.dataset.choice], lg = levelGate(el.dataset.choice);
    if (lg) { toast(lg); sfx('error'); return; }
    if (a.kind === 'board') openQuestBoard(); else if (a.kind === 'shop') { view.shopTab = SHOP_TABS[0]; openShop(); }
    else if (a.kind === 'enhance') openEnhance(); else if (a.kind === 'promo') openPromo(); else if (a.kind === 'farm') openFarm(); else if (a.kind === 'pet') openPets(); else if (a.kind === 'subjob') { view.quitAsk = false; openJob(); }
    else if (a.kind === 'travel') { // 시간이 걸리지 않는 이동은 묻지 않고 바로 간다. 이동장치에서 지상으로 내려가는 1분짜리만 묻는다
      if (LOCATIONS[a.to].danger && state.location === '이동장치') askAction(el.dataset.choice); else doTravel(a.to);
    }
    else if (a.kind === 'enter') { enterDungeon(a.zone); resetPhase(); renderMapHead(); renderMap(); renderAction(); renderSide(); }
    else if (a.kind === 'leave') { leaveDungeon(); resetPhase(); renderMapHead(); renderMap(); renderAction(); }
    else if (a.kind === 'investigate' || a.kind === 'gamble') { // 시간이 걸리지 않는 행동은 누르면 바로 실행한다
      const msg = startAction(el.dataset.choice);
      if (msg) { toast(msg); sfx('error'); return; }
      renderBars(); renderAction(); sfx('ok');
      if (state.pending) A.claim();
    } else askAction(el.dataset.choice);
  },
  'quest-take': el => {
    const err = takeQuest(el.dataset.id);
    if (err) { toast(err); sfx('error'); return; }
    const q = QUESTS.find(x => x.id === el.dataset.id);
    addLog(`임무 수주: ${q.title}`); toast(`임무를 수주했습니다. ${q.title}`); sfx('ok');
    renderSide(); openQuestBoard(true);
  },
  'shop-buy': el => {
    const place = el.dataset.place, name = el.dataset.name, qty = +el.dataset.qty || 1, err = buyItem(place, name, qty);
    if (err) { toast(err); sfx('error'); return; }
    renderProfile(); renderInventory(); renderLeftTab(); renderEquipPick(); sfx('ok');
    toast(`${name} ×${qty} 구입`);
    openShop(true);
  },
  'shop-tab': el => { view.shopTab = el.dataset.tab; openShop(); },
  'shop-sell': el => {
    const name = el.dataset.name, qty = +el.dataset.qty || 1, pr = sellPrice(name), err = sellItem(placeKey(), name, qty);
    if (err) { toast(err); sfx('error'); return; }
    renderProfile(); renderInventory(); renderLeftTab(); renderEquipPick(); sfx('ok');
    toast(`${name} ×${qty} 판매 (+${pr * qty} CR)`);
    openShop(true);
  },
  'promo-take': () => {
    const err = takePromo();
    if (err) { toast(err); sfx('error'); return; }
    const q = nextPromo(); addLog(`승급 시험을 받았습니다: ${q.title}`); toast('승급 시험(메인 임무)을 받았습니다.'); sfx('ok');
    renderSide(); openPromo();
  },
  'farm-plant': el => {
    const sel = $('#seedSel'); if (sel && sel.value) view.seed = sel.value;
    const err = plantCrop(+el.dataset.i, view.seed);
    if (err) { toast(err); sfx('error'); return; }
    renderBag(); sfx('ok'); openFarm(true);
  },
  'farm-harvest': el => {
    const r = harvestPlot(+el.dataset.i);
    if (typeof r === 'string') { toast(r); sfx('error'); return; }
    renderBag(); sfx('ok'); toast(`${r.crop} ×${r.qty} 수확`); openFarm(true);
  },
  'farm-harvest-all': () => {
    const got = {}; let err = '';
    for (let i = 0; i < farmPlotCount(); i++) {
      if (!plotReady(state.farm.plots[i])) continue;
      const r = harvestPlot(i);
      if (typeof r === 'string') { err = r; break; }
      got[r.crop] = (got[r.crop] || 0) + r.qty;
    }
    const txt = Object.entries(got).map(([n, q]) => `${n} ×${q}`).join(', ');
    renderBag(); openFarm(true);
    if (txt) { sfx('ok'); toast(`수확: ${txt}${err ? ` (${err})` : ''}`); } else { toast(err || '수확할 작물이 없습니다.'); sfx('error'); }
  },
  'pet-feed': el => {
    const sel = $('#feedSel'); if (sel && sel.value) view.feed = sel.value;
    const err = feedPet(+el.dataset.i, view.feed);
    if (err) { toast(err); sfx('error'); return; }
    renderBag(); renderBuffs(true); sfx('ok'); toast('펫이 맛있게 먹었습니다.'); openPets(true);
  },
  'pet-active': el => { const i = +el.dataset.i, err = setActivePet(state.petActive === i ? -1 : i); if (err) { toast(err); sfx('error'); return; } renderBuffs(true); openPets(true); },
  'pet-send': el => {
    const sel = $('#expZone'); if (sel) view.expZone = sel.value;
    const err = sendExpedition(+el.dataset.i, view.expZone);
    if (err) { toast(err); sfx('error'); return; }
    renderBag(); sfx('ok'); toast(`펫이 ${view.expZone} 탐험을 떠났습니다. 24시간 뒤에 돌아와요.`); openPets(true);
  },
  'pet-claim': el => {
    const r = claimExpedition(+el.dataset.i);
    if (typeof r === 'string') { toast(r); sfx('error'); return; }
    renderBag(); sfx('ok'); toast(`탐험 수확: ${r.items.map(([n, q]) => `${n} ×${q}`).join(', ')}`);
    if (r.lost.length) toast(`가방이 가득 차 ${r.lost.map(([n, q]) => `${n} ${q}개`).join(', ')}을(를) 얻지 못했습니다.`);
    addLog(`펫 탐험 수확: ${r.items.map(([n, q]) => `${n} ×${q}`).join(' · ')}`); openPets(true);
  },
  'job-join': () => {
    const err = joinSubjob($('#jobName').value, $$('.job-tag:checked').map(c => c.value));
    if (err) { toast(err); sfx('error'); return; }
    renderProfile(); renderBuffs(true); addLog(`서브잡에 가입했습니다: ${state.subjob.name}`); sfx('ok'); toast('서브잡에 가입했습니다.'); openJob();
  },
  'dev-open': () => openDevPanel(),
  'bug-send': async () => {
    const body = cleanText($('#bugText').value, BUG_MAX);
    if (body.length < 5) { toast('내용을 5자 이상 적어 주세요.'); sfx('error'); return; }
    try {
      if (Cloud.enabled && Cloud.user()) await Cloud.submitBug(body, bugCtx());
      else { const l = localBugs(); l.push({ body, ctx: bugCtx() }); localStorage.setItem(BUG_KEY, JSON.stringify(l)); }
      closeModal(); toast('리포트를 보냈어요. 고마워요!'); sfx('ok');
    } catch (e) { toast(/too_many/.test(e.message) ? '잠시 뒤에 다시 보내 주세요. (너무 많이 보냈어요)' : '보내지 못했어요. 잠시 뒤에 다시 시도해 주세요.'); sfx('error'); }
  },
  'bug-list': () => openBugList(),
  'bug-del': async el => { try { await Cloud.deleteBug(+el.dataset.id); openBugList(); } catch (e) { toast('삭제하지 못했어요.'); } },
  'cloud-login': async () => {
    const id = $('#clId').value, pw = $('#clPw').value;
    if (!id || !pw) { toast('아이디와 비밀번호를 입력해 주세요.'); return; }
    const r = await Cloud.login(id, pw);
    if (!r.ok) { toast(r.err); sfx('error'); return; }
    _cloudBlocked = false;
    try { await cloudAfterLogin(); } catch (e) { toast('서버와 연결하지 못했어요.'); }
  },
  'cloud-logout': () => { Cloud.logout(); _cloudBlocked = false; location.href = 'signup.html'; },
  'cloud-push': async () => {
    try { const r = await Cloud.push(JSON.parse(JSON.stringify(state))); if (r.ok) { _cloudBlocked = false; toast('서버에 저장했어요.'); } else { _cloudBlocked = true; toast('다른 기기에서 먼저 저장했어요. "서버에서 불러오기"를 먼저 해 주세요.'); } } catch (e) { toast('서버에 저장하지 못했어요.'); }
  },
  'cloud-pull': async () => { try { const s = await Cloud.pull(); if (s) cloudApply(s.data); else toast('서버에 저장된 진행이 없어요.'); } catch (e) { toast('서버에서 불러오지 못했어요.'); } },
  'local-save': () => {
    try {
      const d = new Date(), z = n => String(n).padStart(2, '0'), name = `deeplayer-save-${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}.json`;
      const blob = new Blob([JSON.stringify({ game: 'deeplayer', version: SAVE_VERSION, savedAt: d.toISOString(), data: state })], { type: 'application/json' });
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast('세이브 파일을 저장했어요.');
    } catch (e) { toast('세이브 파일을 만들지 못했어요.'); }
  },
  'local-load': () => {
    const f = document.createElement('input'); f.type = 'file'; f.accept = '.json,application/json';
    f.onchange = async () => {
      const file = f.files && f.files[0]; if (!file) return;
      if (file.size > 2_000_000) { toast('세이브 파일이 너무 커요.'); return; }
      try {
        const j = JSON.parse(await file.text());
        if (!j || j.game !== 'deeplayer' || j.version !== SAVE_VERSION || !j.data || typeof j.data !== 'object' || !j.data.character) { toast('이 게임의 세이브 파일이 아니거나 버전이 달라요.'); return; }
        view.localSave = j;
        modal('세이브 파일 불러오기', `<p>${esc(String(j.savedAt || '').slice(0, 16).replace('T', ' '))}에 저장한 진행을 불러올까요?</p><p class="tiny">이 기기의 현재 진행은 사라집니다.</p>`,
          ['<button data-act="close">취소</button>', '<button class="primary" data-act="local-load-ok">불러오기</button>'], true);
      } catch (e) { toast('세이브 파일을 읽지 못했어요.'); }
    };
    f.click();
  },
  'local-load-ok': () => { if (view.localSave) cloudApply(view.localSave.data); },
  'cloud-use-server': () => { if (view.cloudServer) cloudApply(view.cloudServer.data); },
  'cloud-use-local': async () => { try { await Cloud.push(JSON.parse(JSON.stringify(state))); toast('이 기기의 진행을 서버에 저장했어요.'); closeModal(); } catch (e) { toast('서버에 저장하지 못했어요.'); } },
  'job-auto': () => {
    let left = jobNeed(state.subjob.level);
    const want = {}; jobStock().forEach(r => { const q = Math.min(left, r.q); want[r.n] = q; left -= q; });
    $$('.job-pick').forEach(i => { i.value = want[i.dataset.n] || 0; }); jobPickSum();
  },
  'job-deliver': () => {
    const picks = {}; $$('.job-pick').forEach(i => { picks[i.dataset.n] = Number(i.value) || 0; });
    const r = deliverJob(picks);
    if (typeof r === 'string') { toast(r); sfx('error'); return; }
    renderProfile(); renderBag(); renderBuffs(true); sfx(r.up ? 'levelup' : 'ok');
    toast(`납품 완료: ${r.n}개 · +${r.pay} CR${r.up ? ` · 서브잡 레벨 업! Lv.${state.subjob.level}` : ''}`);
    if (r.up) addLog(`서브잡 레벨 업: ${state.subjob.name} Lv.${state.subjob.level}`);
    openJob();
  },
  'job-quit': () => { if (!view.quitAsk) { view.quitAsk = true; openJob(true); return; } view.quitAsk = false; quitSubjob(); renderProfile(); renderBuffs(true); toast('서브잡을 그만두었습니다.'); openJob(); },
  'status-page': el => { view.statusPage = +el.dataset.p === 1 ? 1 : 0; renderStatus(); },
  'extras-open': () => openMock(),
  'mock-start': () => mockStart(),
  'guild-open': () => openGuild(),
  'guild-find': async () => {
    const q = cleanText($('#guildQ').value, GUILD_NAME_MAX); if (!q) { $('#guildFound').innerHTML = '<p class="tiny">검색어를 입력하세요.</p>'; return; }
    try {
      const list = await Cloud.guildSearch(q);
      $('#guildFound').innerHTML = list.length ? list.map(r => `<div class="member-row"><div class="round-avatar">${icon('groups')}</div><div class="grow"><strong>${esc(cleanText(r.name, GUILD_NAME_MAX))}</strong><small>${esc(`길드장 ${cleanText(r.master, 12)} · ${intIn(r.count, 0, GUILD_MAX, 0)}/${GUILD_MAX}명`)}</small></div><button data-act="guild-apply" data-id="${intIn(r.id, 1, 9e15, 0)}">가입 신청</button></div>`).join('') : '<p class="tiny">찾는 길드가 없어요.</p>';
    } catch (e) { toast('검색하지 못했어요.'); }
  },
  'guild-find-player': async () => {
    const q = cleanText($('#guildQ').value, 12); if (!q) { $('#guildFound').innerHTML = '<p class="tiny">검색어를 입력하세요.</p>'; return; }
    try {
      const UID = /^[0-9a-f-]{36}$/i, list = (await Cloud.searchGuildTargets(q)).filter(r => r && UID.test(r.uid) && r.name);
      $('#guildFound').innerHTML = list.length ? list.map(r => `<div class="member-row"><div class="round-avatar">${icon('person')}</div><div class="grow"><strong>${esc(cleanText(r.name, 12))}</strong><small>${esc(`Lv.${intIn(r.level, 1, MAX_LEVEL, 1)} ${'FEDCBAS'.includes(r.rank) ? r.rank : 'F'}등급`)}</small></div><button data-act="guild-invite-req" data-uid="${esc(r.uid)}" data-name="${esc(cleanText(r.name, 12))}">초대</button></div>`).join('') : '<p class="tiny">초대할 수 있는 대원이 없어요. (이미 길드가 있거나 길드 초대를 막아 둔 대원은 나오지 않아요)</p>';
    } catch (e) { toast('검색하지 못했어요.'); }
  },
  'guild-invite-req': async el => {
    el.disabled = true;
    try { const r = await Cloud.guildInvite(el.dataset.uid); if (r && r.ok) { sfx('ok'); toast(`${el.dataset.name} 대원에게 길드 초대를 보냈어요. 수락하면 가입돼요.`); openGuildOnline(true); return; }
      el.disabled = false; sfx('error'); toast({ full: '길드가 가득 찼어요.', limit: '대기 중인 초대가 너무 많아요. (최대 10건)', target_in_guild: '이미 길드가 있는 대원이에요.', not_found: '초대할 수 없는 대원이에요.', not_master: '길드장만 초대할 수 있어요.' }[r && r.msg] || '초대하지 못했어요.');
    } catch (e) { el.disabled = false; toast('초대하지 못했어요.'); }
  },
  'guild-apply': async el => {
    el.disabled = true;
    try { const r = await Cloud.guildApply(+el.dataset.id); if (r && r.ok) { sfx('ok'); toast('가입 신청을 보냈어요. 길드장이 수락하면 가입돼요.'); openGuildOnline(true); return; }
      el.disabled = false; sfx('error'); toast({ full: '길드가 가득 찼어요.', limit: '대기 중인 신청이 너무 많아요. (최대 5건)', in_guild: '이미 길드에 속해 있어요.', not_found: '없는 길드예요.' }[r && r.msg] || '신청하지 못했어요.');
    } catch (e) { el.disabled = false; toast('신청하지 못했어요.'); }
  },
  'guild-answer': async el => {
    try { const r = await Cloud.guildAnswer(+el.dataset.id, !!el.dataset.yes);
      if (r && r.ok) { sfx('ok'); toast(r.joined ? '길드 가입이 이루어졌어요.' : '거절했어요.'); } else { sfx('error'); toast({ in_guild: '이미 길드에 속해 있어서 수락할 수 없어요.', full: '길드가 가득 찼어요.', gone: '이미 처리된 요청이에요.' }[r && r.msg] || '처리하지 못했어요.'); }
      openGuildOnline();
    } catch (e) { toast('처리하지 못했어요.'); }
  },
  'guild-cancel': async el => { try { await Cloud.guildCancel(+el.dataset.id); openGuildOnline(true); } catch (e) { toast('취소하지 못했어요.'); } },
  'guild-create': async () => {
    if (guildOnline()) {
      const name = cleanText($('#guildName').value, GUILD_NAME_MAX);
      if (name.length < GUILD_NAME_MIN) { toast(`길드 이름은 ${GUILD_NAME_MIN}~${GUILD_NAME_MAX}자로 입력하세요.`); sfx('error'); return; }
      try { const r = await Cloud.guildCreate(name);
        if (!r || !r.ok) { sfx('error'); toast({ dup: '이미 있는 길드 이름이에요.', in_guild: '이미 길드에 속해 있어요.', bad_name: `길드 이름은 ${GUILD_NAME_MIN}~${GUILD_NAME_MAX}자로 입력하세요.` }[r && r.msg] || '길드를 만들지 못했어요.'); return; }
        sfx('levelup'); addLog(`길드 「${name}」을(를) 만들었습니다.`); toast('길드를 만들었습니다.'); openGuildOnline();
      } catch (e) { toast('길드를 만들지 못했어요. 서버에 friends.sql 을 실행했는지 확인해 주세요.'); }
      return;
    }
    const err = createGuild($('#guildName').value);
    if (err) { toast(err); sfx('error'); return; }
    renderChat(); openGuild(); sfx('levelup'); addLog(`길드 「${state.guild.name}」을(를) 만들었습니다.`); toast('길드를 만들었습니다.');
  },
  'guild-invite': el => {
    const err = inviteGuild(el.dataset.name);
    if (err) { toast(err); sfx('error'); return; }
    renderChat(); openGuild(); sfx('ok'); toast(`${el.dataset.name}님이 길드에 들어왔습니다.`);
  },
  'guild-leave': async () => {
    if (guildOnline()) { try { const m = state.guild && state.guild.master; await Cloud.guildLeave(); state.guild = null; state.chats['길드'] = [['시스템', '길드 채널은 길드에 가입하거나 만든 뒤 사용할 수 있습니다.']]; save(); renderChat(); toast(m ? '길드를 해산했습니다.' : '길드를 탈퇴했습니다.'); openGuildOnline(); } catch (e) { toast('처리하지 못했어요.'); } return; }
    const m = state.guild.master; leaveGuild(); renderChat(); openGuild(); toast(m ? '길드를 해산했습니다.' : '길드를 탈퇴했습니다.'); },
  tile: el => {
    if (state.active || state.pending) { toast(state.pending ? '먼저 결과를 확인하세요.' : '행동이 진행 중이라 이동할 수 없습니다.'); sfx('error'); return; }
    const x = +el.dataset.x, y = +el.dataset.y, m = planMove(x, y);
    if (m.err) { toast(m.err); sfx('error'); return; }
    askAction('타일 이동', [x, y]);
  },
  mult: el => { view.mult = +el.dataset.i; renderAction(); },
  'action-cancel': () => { resetPhase(); renderAction(); },
  'action-run': () => {
    const a = ACTIONS[view.id];
    if (a.kind === 'travel') {
      if (LOCATIONS[a.to].danger && state.location === '이동장치') { const err = startTrip(a.to); if (err) { toast(err); sfx('error'); return; } resetPhase(); renderBars(); renderAction(); renderMap(); return; }
      doTravel(a.to); return;
    }
    if (a.kind === 'step') { doMove(); return; }
    if (a.kind === 'enter') { enterDungeon(a.zone); resetPhase(); renderMapHead(); renderMap(); renderAction(); renderSide(); return; }
    if (a.kind === 'leave') { leaveDungeon(); resetPhase(); renderMapHead(); renderMap(); renderAction(); return; }
    const msg = startAction(view.id, view.mult);
    if (msg) { toast(msg); sfx('error'); return; }
    renderBars();
    resetPhase(); renderAction();
  },
  'action-abort': () => { const mv = state.active.id === '타일 이동'; abortAction(); if (travelFinds.length) toast(`길가에서 ${[...new Set(travelFinds)].join(', ')}을(를) 주웠습니다!`), travelFinds.length = 0; renderBars(); renderMapHead(); renderMap(); renderAction(); },
  claim: () => {
    if (!state.pending) { view.lastResult = null; renderAction(); return; } // 이미 받은 결과 카드를 닫는다
    const pend = state.pending, r = claimResult();
    view.lastResult = { id: pend.id, result: pend.result };
    renderProfile(); renderBars(); renderBuffs(true); renderBag(); renderAction(); renderMapHead(); renderMap(); renderSide();
    const loss = costChips(r.result);
    const act = ACTIONS[r.id], rare = act.terrain && r.result.items.some(([n]) => n === act.terrain.rare);
    if (r.died) {
      awardTitles();
      addLog(`사망: ${r.result.text} — 본부에서 재탄생했습니다.${r.died.lost ? ` (구조비 ${r.died.lost} CR)` : ''}`);
      sfx('error');
      modal('재탄생했습니다', `<p class="detail-desc">HP가 1인 채로 또 피해를 입어 숨이 끊어졌습니다.</p><p class="detail-desc">클론은 데이터로 되살아납니다. 대원은 본부에서 재탄생했어요. HP ${REBIRTH_HP}로 깨어났고 부상 상태입니다.</p><p class="tiny">${r.died.lost ? `구조비로 ${r.died.lost} CR을 냈습니다. ` : ''}그 행동의 보상은 받지 못했지만 레벨과 소지품은 그대로예요.</p>`, [btnClose]);
      return;
    }
    if (r.result.recipe) { addLog(`단련: 「${r.result.recipe}」 제작법을 익혔습니다.`); toast(`새 레시피 「${r.result.recipe}」를 익혔습니다!`); renderCraft(); renderLeftTab(); }
    if (act.kind === 'event' || r.ups || r.lost.length || rare || /대성공|사고|패배|후퇴|희귀|부상/.test(r.result.text)) // 특별한 사건만 기록
      addLog(`${act.title}: ${r.result.text} (${rewardChips(r.result).join(' · ') || '보상 없음'}${loss.length ? ` / 손실: ${loss.join(' · ')}` : ''})`);
    sfx(r.ups ? 'levelup' : 'ok');
    if (r.lost.length) toast(`가방이 가득 차 ${r.lost.map(([n, q]) => `${n} ${q}개`).join(', ')}을(를) 얻지 못했습니다.`);
    if (r.ups) toast(`레벨 업! Lv.${state.character.level} · 스탯 포인트 +${r.ups}`);
  },

  /* 스탯 / 제작 / 아이템 */
  'stat-up': el => { if (spendStatPoint(el.dataset.stat)) { renderStatus(); renderCraft(); save(); } },
  craft: el => { // 여러 개 만들 수 있으면 몇 개 만들지 먼저 고른다
    const i = +el.dataset.index, rc = RECIPES[i];
    if (rc && !state.crafting && canCraft(rc) && maxCraft(rc) > 1) { openCraftQty(i); return; }
    A['craft-go']({ dataset: { index: i, qty: 1 } });
  },
  'cq-step': el => { const q = $('#cqQty'); q.value = clamp((+q.value || 1) + (+el.dataset.d), 1, +q.max); cqUpdate(); },
  'cq-max': () => { const q = $('#cqQty'); q.value = q.max; cqUpdate(); },
  'craft-go': el => {
    const res = craft(+el.dataset.index, el.dataset.qty ? +el.dataset.qty : intIn($('#cqQty').value, 1, MAX_BATCH, 1)), name = RECIPES[+el.dataset.index].out;
    if (!el.dataset.qty) closeModal();
    const msgs = { ok: `${name} 제작을 시작했습니다.`, mats: '재료가 부족합니다.', space: '가방 공간이 부족합니다.', busy: '이미 제작 중인 아이템이 있습니다.', rank: '아직 모르는 레시피입니다.' };
    toast(msgs[res]);
    renderBag(); save();
  },
  'craft-cancel': () => { if (cancelCraft()) { toast('제작을 취소하고 재료를 돌려받았습니다.'); renderBag(); } },
  'craft-collect': () => {
    const r = collectCraft();
    if (!r) return;
    if (!r.got) { toast('가방이 가득 찼습니다. 칸을 비우세요.'); sfx('error'); return; }
    toast(`${r.out} ${r.got}개 제작 완료${r.great ? ' (대성공! +1)' : ''}`); renderBag();
  },
  item: el => {
    const name = el.dataset.item, it = ITEMS[name], have = countItem(name), canEquip = it.slot && state.inventory['장비'].some(s => s.n === name);
    modal(name, `<div class="nearby-row"><div class="round-avatar">${icon(it.icon)}</div><div class="grow"><strong>${esc(name)}</strong><small>${it.slot ? esc(it.slot) + ' 장비' : esc(it.tab)} · 보유 ${countItem(name)}개</small></div></div><p class="detail-desc">${esc(it.desc)}</p><p class="tiny">효과: ${esc(itemEffect(name))}</p>` +
      ((it.mods || state.enchants[name]) ? `<div class="buffs">${[...(it.mods ? modText(it.mods) : []), ...(state.enchants[name] ? [`강화 · ${enchantText(state.enchants[name])}`] : [])].map(b => `<span class="buff">${esc(b)}</span>`).join('')}</div>` : ''),
      [btnClose, ...(it.use ? [(it.use.warp || have < 2 ? '' : `<input id="useQty" type="number" min="1" max="${Math.min(have, MAX_BATCH)}" value="1" aria-label="사용 개수" style="width:56px">`) + `<button class="primary" data-act="use" data-item="${esc(name)}">사용</button>`] : []), ...(canEquip ? [`<button class="primary" data-act="equip" data-item="${esc(name)}">장착</button>`] : [])], true);
  },
  use: el => {
    const name = el.dataset.item;
    const err = useErr(name), n = $('#useQty') ? intIn($('#useQty').value, 1, MAX_BATCH, 1) : 1;
    if (err) { toast(err); sfx('error'); return; }
    if (useItem(name, n)) {
      closeModal(); resetPhase(); renderBars(); renderBag(); renderMapHead(); renderMap(); renderAction(); renderSide(); save();
      toast(ITEMS[name].use.warp ? '귀환 신호기로 본부에 돌아왔습니다.' : `${name}을(를) ${n > 1 ? n + '개 ' : ''}사용했습니다.`);
    }
  },
  'equip-slot': el => { view.equipSlot = view.equipSlot === el.dataset.slot ? null : el.dataset.slot; renderEquip(); },
  'pick-equip': el => equipChange(ITEMS[el.dataset.item].slot, el.dataset.item, '장착했습니다.'),
  equip: el => equipChange(ITEMS[el.dataset.item].slot, el.dataset.item, '장착했습니다.'),
  unequip: el => equipChange(el.dataset.slot, null, '해제했습니다.'),

  /* 오른쪽 패널 / 게시판 / 채팅 */
  player: el => { const n = el.dataset.player, p = samplePlayer(n), fr = state.friends.includes(n);
    modal(n, `<p>현재 위치: ${esc(LOCATIONS[state.location].name)}</p><p>상태: ${esc(p ? p[1] : '온라인')} · 이능 발현자</p><p class="tiny">친구 요청을 보내면 상대가 수락했을 때 친구가 됩니다. (자리 비움은 응답 없음)</p>`,
      [btnClose, `<button class="primary" data-act="friend-add" data-name="${esc(n)}" ${fr ? 'disabled' : ''}>${fr ? '친구' : '친구 추가'}</button>`], true); },
  quest: el => { view.quest = view.quest === el.dataset.id ? null : el.dataset.id; renderSide(); },
  'quest-done': el => {
    const q = QUESTS.find(x => x.id === el.dataset.id), r = completeQuest(q.id);
    if (!r) { toast('아직 임무 조건을 달성하지 못했습니다.'); return; }
    renderProfile(); renderBars(); renderStatus(); renderSide(); sfx(r.ups ? 'levelup' : 'ok');
    renderInventory(); renderLeftTab();
    addLog(`임무 완수: ${q.title} (${rewardText(q)})`);
    toast(`임무 완수! ${q.title}${r.ups ? ` · 레벨 업 Lv.${state.character.level}` : ''}`);
    if (r.promo) {
      const news = RECIPES.filter(rc => rc.rank === r.promo && !recipeKnown(rc)).map(rc => rc.out);
      renderCraft(); renderLeftTab();
      if (news.length) { addLog(`${r.promo}등급 승급! 단련으로 배울 수 있는 레시피 ${news.length}종 추가`); toast(`${r.promo}등급 승급! 단련으로 새 레시피 ${news.length}종을 배울 수 있게 되었습니다.`); }
    }
  },
  sticker: el => { sendChat(`[${el.dataset.name}]`); setTray(false); },
  post: el => {
    const p = POSTS[el.dataset.board][+el.dataset.post];
    $$('[data-act="post"]').forEach(x => x.classList.toggle('active', x === el));
    $('#postDetail').innerHTML = `<h3>${esc(p[0])}</h3><p>${esc(p[1])}</p>`;
  },

  /* 캐릭터 / 설정 */
  'char-save': () => {
    const c = state.character, left = profileLockLeft();
    if (left > 0) { toast(`프로필은 ${fmtLong(left)} 뒤에 다시 수정할 수 있어요.`); return; }
    const next = { name: cleanText($('#cName').value, 12) || c.name, age: intIn($('#cAge').value, AGE_MIN, AGE_MAX, c.age), keywords: cleanText($('#cKeywords').value, 60),
      ability: cleanText($('#cAbility').value, 20) || c.ability, abilityDesc: cleanText($('#cAbilityDesc').value, 300),
      allowFriend: $('#cFriend').checked, allowGuild: $('#cGuild').checked };
    if (Object.keys(next).some(k => next[k] !== c[k])) { Object.assign(c, next); state.profileEditAt = nowMs(); toast('프로필을 수정했습니다. 24시간 뒤에 다시 수정할 수 있어요.'); }
    renderProfile(); save(); closeModal();
  },
  'settings-save': () => {
    state.settings = { bgmOn: $('#bgmOn').checked, bgmVolume: +$('#bgmVolume').value, clickOn: $('#clickOn').checked, alertOn: $('#alertOn').checked, sfxVolume: +$('#sfxVolume').value,
      notify: $('#notifyOn').checked, guildAlert: $('#guildAlertOn').checked, cursor: $('#cursorOn').checked, theme: $('#themeSelect').value, customBase: $('#customBase').value, customAccent: $('#customAccent').value, fontSize: $('#fontSize').value };
    if (state.settings.notify && window.Notification && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (e) { /* 알림 불가 */ } }
    applyTheme(); applyBgm(); save(); closeModal(); toast('설정을 저장했습니다.');
  },

  /* 메일 / 친구 / 길드 / 도감 */
  'trade-open': el => openTrade(el.dataset.player),
  'trade-do': el => {
    const err = tradeWith(el.dataset.player, $('#tradeGive').value, $('#tradeGiveQty').value, $('#tradeWant').value, $('#tradeWantQty').value);
    if (err) { toast(err); sfx('error'); return; }
    renderBag(); sfx('ok'); toast(`교환했습니다. 오늘 남은 교환 ${tradesLeft()}회`); addLog(`${el.dataset.player}님과 물건을 교환했습니다.`);
    openTrade(el.dataset.player);
  },
  'enhance-roll': el => {
    const r = enchantItem(el.dataset.name);
    if (typeof r === 'string') { toast(r); sfx('error'); return; }
    renderBag(); renderBars(); renderProfile(); sfx('ok');
    toast(`${el.dataset.name}: ${enchantText(r.now)}${r.old ? ` (이전: ${enchantText(r.old)})` : ''}`);
    addLog(`장비 강화: ${el.dataset.name} → ${enchantText(r.now)}`);
    openEnhance(true);
  },
  'title-set': el => { const err = setTitle(el.dataset.title); if (err) { toast(err); sfx('error'); return; } renderProfile(); sfx('ok'); $$('.tchip').forEach(b => b.classList.toggle('on', b.dataset.title === state.character.title)); const pt = $('#pcTitle'); if (pt) pt.textContent = state.character.title; },
  'mail-tab': el => { view.mailTab = el.dataset.tab; view.mailOpen = null; openMail(); },
  'mail-open': el => { const m = state.mail.find(x => x.id === +el.dataset.id); if (m) { view.mailOpen = m.id; m.read = true; save(); renderMailBadge(); } openMail(true); },
  'mail-back': () => { view.mailOpen = null; openMail(); },
  'mail-keep': el => { const err = toggleKeep(+el.dataset.id); if (err) { toast(err); sfx('error'); return; } sfx('ok'); openMail(true); },
  'mail-delete': el => { deleteMail(+el.dataset.id); view.mailOpen = null; renderMailBadge(); openMail(); },
  'mail-claim': el => {
    const err = claimMail(+el.dataset.id);
    if (err) { toast(err); sfx('error'); return; }
    renderBag(); renderMailBadge(); sfx('ok'); toast('첨부 아이템을 받았습니다.'); openMail(true);
  },
  'mail-add-row': () => { if ($$('.mail-item').length < MAIL_ITEM_KINDS) $('#mailItems').insertAdjacentHTML('beforeend', mailItemRow()); },
  'mail-send': async () => {
    const items = $$('.mail-item').map(r => [r.querySelector('select').value, +r.querySelector('input').value]).filter(r => r[0]);
    const to = $('#mailTo').value, subject = $('#mailSubject').value, body = $('#mailBody').value, online = Cloud.enabled && Cloud.user();
    const uid = online ? (view.friendUid || {})[to] : null;
    if (online && !uid && state.friends.includes(to)) { toast('친구 정보를 서버에서 가져오는 중이에요. 잠시 뒤 다시 보내 주세요.'); friendPoll(); return; }
    const had = items.filter(r => r[0] && ITEMS[r[0]]).map(([n, q]) => [n, intIn(q, 1, 99, 1)]), ship = countItem(MAIL_SHIP_ITEM);
    const err = sendMail(to, subject, body, items);
    if (err) { toast(err); sfx('error'); return; }
    if (online) { // 서버로 실제 전달 (실패하면 아이템을 돌려준다)
      const sent = cleanItemList(had);
      try {
        const r = await Cloud.sendMail(uid, cleanText(subject, 30), cleanText(body, 300), sent);
        if (!r || !r.ok) throw new Error(r && r.msg);
      } catch (e) {
        if (sent.length) { addItem(MAIL_SHIP_ITEM, 1); sent.forEach(([n, q]) => addItem(n, q)); }
        renderBag(); save(); sfx('error');
        toast(e && e.message === 'full' ? '상대의 메일함이 가득 차서 보낼 수 없어요.' : e && e.message === 'not_friend' ? '서버에서 친구로 확인되지 않아요.' : '메일을 보내지 못했어요. 서버에 friends.sql 을 실행했는지 확인해 주세요.'); return;
      }
      renderBag(); sfx('ok'); toast(`메일을 보냈습니다.${sent.length ? ' (운송장치 1개 사용)' : ''}`); view.mailTab = '받은 메일함'; openMail(); return;
    }
    renderBag(); sfx('ok'); toast(`메일을 보냈습니다.${items.length ? ' (운송장치 1개 사용)' : ''} (서버에 로그인하지 않아 실제로는 전달되지 않아요)`); view.mailTab = '받은 메일함'; openMail();
  },
  'ftrade-open': el => openFriendTrade(el.dataset.name),
  'ftrade-send': async el => {
    const name = el.dataset.name, uid = (view.friendUid || {})[name], give = $('#ftGive').value, want = $('#ftWant').value.trim();
    const gq = intIn($('#ftGiveQty').value, 1, 99, 0), wq = intIn($('#ftWantQty').value, 1, 99, 0);
    if (!uid) { toast('친구 정보를 서버에서 가져오는 중이에요. 잠시 뒤 다시 시도해 주세요.'); friendPoll(); return; }
    if (!tradesLeft()) { toast(`오늘은 교환 제안을 모두 보냈습니다. (하루 ${TRADE_DAILY}회)`); sfx('error'); return; }
    if (!ITEMS[give] || !gq || !ITEMS[want] || !wq || want === MAIL_SHIP_ITEM || give === MAIL_SHIP_ITEM) { toast('교환할 물건과 수량을 확인하세요. (받을 물건은 목록에서 고르세요)'); sfx('error'); return; }
    if (countItem(give) < gq) { toast(`${give}이(가) 모자랍니다.`); sfx('error'); return; }
    el.disabled = true; removeItem(give, gq); // 제안하는 동안 물건을 맡긴다
    try {
      const r = await Cloud.proposeTrade(uid, [[give, gq]], [[want, wq]]);
      if (!r || !r.ok) throw new Error(r && r.msg);
      state.trades = { day: todayKey(), n: (state.trades.day === todayKey() ? state.trades.n : 0) + 1 }; save();
      renderBag(); sfx('ok'); toast(`${name} 대원에게 교환을 제안했어요. 물건은 맡겨 두며, 거절·취소되면 메일로 돌아와요.`); friendPoll(); openFriends(true);
    } catch (e) {
      addItem(give, gq); renderBag(); el.disabled = false; sfx('error');
      toast({ limit: '대기 중인 제안이 너무 많아요. (최대 5건)', busy: '상대에게 쌓인 제안이 너무 많아요.', not_friend: '서버에서 친구로 확인되지 않아요.' }[e && e.message] || '제안하지 못했어요. 서버에 friends.sql 을 실행했는지 확인해 주세요.');
    }
  },
  'ftrade-accept': async el => {
    const t = (view.tIn || []).find(x => x.id === +el.dataset.id); if (!t) return;
    if (t.want.some(([n, q]) => countItem(n) < q)) { toast('요청받은 물건이 모자라요.'); sfx('error'); return; }
    try {
      const r = await Cloud.answerTrade(t.id, true);
      if (!r || !r.ok) { toast('이미 처리된 제안이에요.'); friendPoll(); return; }
      const give = cleanItemList(r.give, 3), want = cleanItemList(r.want, 3);
      want.forEach(([n, q]) => removeItem(n, q));
      receiveServerMail(`교환 · ${t.name}`.slice(0, 12), '교환 성사', `${t.name} 대원과의 교환이 성사됐어요. 받은 물건을 수령하세요.`, give);
      view.tIn = view.tIn.filter(x => x.id !== t.id); renderBag(); renderMailBadge(); sfx('ok'); toast('교환이 성사됐어요. 메일함에서 물건을 수령하세요.'); addLog(`${t.name} 대원과 물건을 교환했습니다.`); openFriends(true);
    } catch (e) { toast('처리하지 못했어요.'); }
  },
  'ftrade-decline': async el => {
    try { await Cloud.answerTrade(+el.dataset.id, false); view.tIn = (view.tIn || []).filter(x => x.id !== +el.dataset.id); openFriends(true); } catch (e) { toast('처리하지 못했어요.'); }
  },
  'ftrade-cancel': async el => {
    try { await Cloud.cancelTrade(+el.dataset.id); toast('제안을 취소했어요. 물건은 곧 메일로 돌아와요.'); friendPoll(); } catch (e) { toast('취소하지 못했어요.'); }
  },
  'friend-search': async () => {
    const v = cleanText($('#friendSearch').value, 12);
    if (Cloud.enabled && Cloud.user()) { // 서버에 있는 대원을 이름으로 찾는다
      const box = $('#friendResult');
      if (!v) { box.innerHTML = '<p class="tiny">검색어를 입력하세요.</p>'; return; }
      box.innerHTML = '<p class="tiny">찾는 중…</p>';
      try {
        const found = (await Cloud.searchPlayers(v)).filter(r => r && typeof r.name === 'string' && r.name && r.name !== state.character.name);
        const UID = /^[0-9a-f-]{36}$/i; found.forEach(r => { REMOTE_PLAYERS[cleanText(r.name, 12)] = r.online ? '온라인' : '자리 비움'; });
        if (!$('#friendResult')) return;
        $('#friendResult').innerHTML = found.length ? found.map(r => { const n = cleanText(r.name, 12), has = state.friends.includes(n);
          return `<div class="nearby-row"><div class="round-avatar">${avatarOf(n)}</div><div class="grow"><strong>${esc(n)}</strong><small>${esc(`${REMOTE_PLAYERS[n]} · Lv.${intIn(r.level, 1, MAX_LEVEL, 1)} ${'FEDCBAS'.includes(r.rank) ? r.rank : 'F'}등급`)}</small></div><button data-act="friend-req" data-uid="${esc(UID.test(r.uid) ? r.uid : '')}" data-name="${esc(n)}" ${has || !UID.test(r.uid) ? 'disabled' : ''}>${has ? '친구' : '친구 신청'}</button></div>`; }).join('')
          : '<p class="tiny">찾는 대원이 없어요. (이름 일부만 입력해도 돼요. 상대가 친구 추가를 막아 둔 경우에도 나오지 않아요)</p>';
      } catch (e) { if ($('#friendResult')) $('#friendResult').innerHTML = '<p class="tiny">검색하지 못했어요. 서버에 friends.sql 을 실행했는지 확인해 주세요.</p>'; }
      return;
    }
    const p = samplePlayer(v);
    $('#friendResult').innerHTML = !v ? '<p class="tiny">검색어를 입력하세요.</p>' : p
      ? `<div class="nearby-row"><div class="round-avatar">${avatarOf(v)}</div><div class="grow"><strong>${esc(v)}</strong><small>${esc(p[1])}</small></div><button data-act="friend-add" data-name="${esc(v)}" ${state.friends.includes(v) ? 'disabled' : ''}>${state.friends.includes(v) ? '친구' : '친구 추가'}</button></div>`
      : '<p class="tiny">대원을 찾을 수 없습니다. (서버에 로그인하면 다른 대원을 찾을 수 있어요)</p>';
  },
  'friend-req': async el => {
    const name = el.dataset.name; el.disabled = true;
    try {
      const r = await Cloud.sendFriendReq(el.dataset.uid);
      if (r && r.ok && r.msg === 'auto') { addFriendAccepted(r.name || name); sfx('ok'); toast(`${name} 대원과 친구가 되었습니다.`); openFriends(); return; }
      if (r && r.ok) { sfx('ok'); el.textContent = '신청함'; toast(`${name} 대원에게 친구 신청을 보냈어요. 상대가 수락하면 친구가 됩니다.`); friendPoll(); return; }
      el.disabled = false; sfx('error');
      toast({ dup: '이미 신청했어요. 상대의 응답을 기다려 주세요.', busy: '상대의 응답이 아직 정리되지 않았어요. 잠시 뒤에 다시 시도해 주세요.', limit: '대기 중인 신청이 너무 많아요. (최대 10건)', not_found: '이 대원에게는 신청할 수 없어요.', self: '나에게는 신청할 수 없어요.' }[r && r.msg] || '신청하지 못했어요.');
    } catch (e) { el.disabled = false; toast('신청하지 못했어요. 서버에 friends.sql 을 실행했는지 확인해 주세요.'); }
  },
  'friend-req-cancel': async el => { try { await Cloud.cancelFriendReq(+el.dataset.id); view.fOut = (view.fOut || []).filter(x => x.id !== +el.dataset.id); toast('친구 신청을 취소했어요.'); openFriends(true); } catch (e) { toast('취소하지 못했어요.'); } },
  'friend-accept': async el => {
    if (state.friends.length >= FRIEND_MAX) { toast(`친구는 ${FRIEND_MAX}명까지 둘 수 있습니다.`); sfx('error'); return; }
    try { const r = await Cloud.answerFriendReq(+el.dataset.id, true); if (r && r.ok) { addFriendAccepted(r.name); sfx('ok'); toast(`${cleanText(r.name, 12)} 대원과 친구가 되었습니다.`); } view.inbox = (view.inbox || []).filter(x => x.id !== +el.dataset.id); openFriends(true); } catch (e) { toast('처리하지 못했어요.'); }
  },
  'friend-decline': async el => {
    try { await Cloud.answerFriendReq(+el.dataset.id, false); view.inbox = (view.inbox || []).filter(x => x.id !== +el.dataset.id); openFriends(true); } catch (e) { toast('처리하지 못했어요.'); }
  },
  'friend-add': el => {
    const err = addFriend(el.dataset.name);
    if (err) { toast(err); sfx('error'); return; }
    sfx('ok'); toast(`${el.dataset.name} 대원과 친구가 되었습니다.`); if ($('#friendList')) openFriends(); else closeModal();
  },
  'friend-remove': el => { const uid = view.friendUid && view.friendUid[el.dataset.name]; removeFriend(el.dataset.name); if (uid && Cloud.enabled && Cloud.user()) Cloud.removeFriend(uid).catch(() => {}); if (view.friendUid) delete view.friendUid[el.dataset.name]; openFriends(true); },
  'codex-tab': el => { codexView.tab = el.dataset.codex; codexView.sub = null; $('#codexRoot').innerHTML = codexHtml(); },
  'codex-sub': el => { codexView.sub = el.dataset.sub || null; $('#codexRoot').innerHTML = codexHtml(); },
  'logout-ok': () => { closeModal(); if (Cloud.enabled && Cloud.user()) { if (_cloudTimer) { clearTimeout(_cloudTimer); _cloudTimer = 0; cloudAutoPush().finally(() => A['cloud-logout']()); } else A['cloud-logout'](); } else toast('서버 인증 기능은 아직 연결되지 않았습니다.'); },
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el && !el.disabled && A[el.dataset.act]) A[el.dataset.act](el, e);
});

function equipChange(slot, name, doneText) {
  const prev = state.equipment[slot], res = changeEquipment(slot, name);
  if (res === 'space') { toast('인벤토리 공간이 부족해 변경할 수 없습니다.'); return; }
  if (!res) return;
  closeModal(); renderBag(); renderBuffs(true); save();
  const msg = `${name || prev}을(를) ${doneText}`;
  toast(msg);
}

/* ---------- 정적 요소 연결 ---------- */
$('#closeModal').onclick = closeModal;
$('#overlay').onclick = e => { if (e.target === $('#overlay')) closeModal(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
$$('[data-board]').forEach(b => { b.onclick = () => openBoard(b.dataset.board); });
$$('[data-system]').forEach(b => { b.onclick = () => openSystem(b.dataset.system); });
$('#settingsBtn').onclick = openSettings;
$('#bugBtn').onclick = openBugReport;
$('#logoutBtn').onclick = () => modal('로그아웃', Cloud.enabled && Cloud.user() ? '<p>로그아웃하면 가입/로그인 화면으로 이동해요. 진행은 서버에 저장되어 있어요.</p>' : '<p>서버에 연결되어 있지 않아 실제 계정 로그아웃은 수행되지 않습니다.</p>', ['<button data-act="close">취소</button>', '<button class="primary" data-act="logout-ok">확인</button>'], true);
/* 테마/커서는 저장하기 전에도 바로 미리 보인다 (취소하면 되돌아감) */
const previewTheme = () => applyTheme({ ...state.settings, theme: $('#themeSelect').value, customBase: $('#customBase').value, customAccent: $('#customAccent').value, cursor: $('#cursorOn').checked, fontSize: $('#fontSize').value });
document.addEventListener('input', e => {
  if (['customAccent'].includes(e.target.id)) previewTheme();
  if (e.target.id === 'bgmVolume') { $('#bgmValue').textContent = e.target.value + '%'; setBgmVolume(+e.target.value); }
  if (e.target.id === 'sfxVolume') $('#sfxValue').textContent = e.target.value + '%';
});
document.addEventListener('change', e => {
  if (e.target.id === 'themeSelect') $('#customOpts').classList.toggle('hidden', e.target.value !== 'custom');
  if (['themeSelect', 'customBase', 'customAccent', 'cursorOn', 'fontSize'].includes(e.target.id)) previewTheme();
});

/* 프로필 창 → 그 안의 사진 버튼 → 이미지 선택. 이미지는 올리기 전에 작게 줄여 저장한다 (서버 부담↓) */
const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], AVATAR_PX = 256, AVATAR_MAX_BYTES = 200 * 1024;
async function compressImage(file) { // 가장 긴 변 256px, WebP(미지원이면 JPEG)로 압축. 결과 200KB 이하
  const bmp = await createImageBitmap(file), k = Math.min(1, AVATAR_PX / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(bmp.width * k)); cv.height = Math.max(1, Math.round(bmp.height * k));
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height); bmp.close && bmp.close();
  let out = '';
  for (const q of [.82, .7, .55, .4]) { out = cv.toDataURL('image/webp', q); if (!out.startsWith('data:image/webp')) out = cv.toDataURL('image/jpeg', q); if (out.length * .75 <= AVATAR_MAX_BYTES) break; }
  return out;
}
function openProfile(keepScroll) {
  const st0 = keepScroll === true && $('#modalBody') ? $('#modalBody').scrollTop : 0;
  const c = state.character, img = getAvatar(), tags = c.keywords.split(',').map(t => t.trim()).filter(Boolean).map(t => '#' + t).join(' ');
  // 이미 열려 있는 입력칸에 쓴 내용은 창을 다시 그려도 지우지 않는다
  const dr = $('#cName') ? { ab: $('#cAbility').value, name: $('#cName').value, age: $('#cAge').value, kw: $('#cKeywords').value, desc: $('#cAbilityDesc').value, fr: $('#cFriend').checked, gu: $('#cGuild').checked } : null;
  const lock = profileLockLeft(), dis = lock > 0 ? 'disabled' : '';
  const row = (label, inner) => `<div class="srow fontrow"><span>${label}</span>${inner}</div>`;
  modal('프로필', `<div class="profile-card"><button class="avatar big ${img ? '' : 'empty'}" data-act="avatar-pick" title="이미지 변경" aria-label="프로필 이미지 변경">${img ? `<img src="${esc(img)}" alt="프로필">` : icon('add_a_photo')}<span class="avatar-edit">${icon('photo_camera')}</span></button>` +
    `<div class="pc-info"><div class="title-chip" id="pcTitle">${esc(c.title)}</div><strong>${esc(c.name || '-')}</strong><div class="char-meta">LV.${c.level}　${esc(c.rank)}등급　${c.age}세</div><div class="char-tags">${esc(tags)}</div>${state.subjob ? `<div class="char-job">${esc(`서브잡 · ${state.subjob.name} Lv.${state.subjob.level}`)}</div>` : ''}</div></div>` +
    `<div class="pc-ability"><b>${icon('bolt')} 이능력 · ${esc(c.ability || '미설정')}</b><p>${esc(c.abilityDesc || '이능력 설명이 없습니다.')}</p></div>` +
    `<div class="choice-label">칭호 ${state.titles.length}개 보유 · 눌러서 착용</div><div class="title-chips">${TITLE_DEFS.filter(([n]) => state.titles.includes(n)).map(([n, d]) =>
      `<button class="tchip ${c.title === n ? 'on' : ''}" data-act="title-set" data-title="${esc(n)}" title="달성: ${esc(d)}">${esc(n)}</button>`).join('')}</div>` +
    `<div class="setting-group"><h3>캐릭터 정보 수정</h3>` +
    (lock > 0 ? `<p class="tiny">프로필(칭호 제외)은 수정 후 24시간이 지나야 다시 바꿀 수 있어요. 남은 시간 ${fmtLong(lock)}</p>` : state.profileEditAt ? '' : '<p class="tiny">첫 수정은 바로 가능하고, 그 뒤에는 24시간마다 한 번 수정할 수 있어요.</p>') +
    row('이름', `<input id="cName" maxlength="12" ${dis} value="${esc(dr ? dr.name : c.name)}">`) +
    row('이능력 이름', `<input id="cAbility" maxlength="20" ${dis} value="${esc(dr ? dr.ab : c.ability)}">`) +
    row('나이', `<input id="cAge" ${dis} type="number" min="${AGE_MIN}" max="${AGE_MAX}" value="${esc(dr ? dr.age : c.age)}">`) +
    row('키워드', `<input id="cKeywords" maxlength="60" ${dis} placeholder="쉼표로 구분 (예: 과묵, 정찰)" value="${esc(dr ? dr.kw : c.keywords)}">`) +
    row('이능력 설명', `<textarea id="cAbilityDesc" maxlength="300" ${dis} placeholder="어떤 능력인지 자유롭게 적어 주세요">${esc(dr ? dr.desc : c.abilityDesc)}</textarea>`) +
    `${sw('cFriend', '친구 추가 허용', dr ? dr.fr : c.allowFriend, 'near', dis)}${sw('cGuild', '길드 초대 허용', dr ? dr.gu : c.allowGuild, 'near', dis)}</div>` +
    `<p class="tiny">사진 버튼을 눌러 이미지를 고르면 ${AVATAR_PX}px로 자동 압축됩니다. (png·jpg·webp·gif)</p>`,
    [btnClose, `<button data-act="avatar-clear" ${img ? '' : 'disabled'}>이미지 삭제</button>`, `<button class="primary" data-act="char-save" ${dis}>저장</button>`]);
  $('#modalBody').scrollTop = st0;
}
$('#avatarButton').onclick = openProfile;
$('#avatarFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  if (!AVATAR_TYPES.includes(f.type)) { toast('png, jpg, webp, gif 이미지만 올릴 수 있습니다.'); return; }
  if (f.size > 20 * 1024 * 1024) { toast('이미지는 20MB 이하로 선택하세요.'); return; }
  try {
    const data = await compressImage(f);
    localStorage.setItem(AVATAR_KEY, data); syncMyAvatar(); renderProfile(); if ($('#overlay').classList.contains('open')) openProfile();
    toast(`프로필 이미지 변경 완료 (${Math.round(data.length * .75 / 1024)}KB로 압축)`);
  } catch (err) { toast('이미지를 처리하지 못했습니다.'); }
};
$$('[data-ltab]').forEach(b => { b.onclick = () => { state.leftTab = b.dataset.ltab; renderLeftTab(); save(); }; });
$('#craftOnly').onclick = () => { view.craftOnly = !view.craftOnly; renderCraft(); };
$$('[data-craft]').forEach(b => { b.onclick = () => { state.craftTab = state.craftTab === b.dataset.craft ? null : b.dataset.craft; renderCraft(); save(); }; });
$$('[data-inv]').forEach(b => { b.onclick = () => { state.invTab = state.invTab === b.dataset.inv ? null : b.dataset.inv; state.page = 1; renderInventory(); save(); }; });
$('#prevPage').onclick = () => { state.page--; renderInventory(); };
$('#nextPage').onclick = () => { state.page++; renderInventory(); };
$$('[data-side]').forEach(b => { b.onclick = () => { state.side = b.dataset.side; renderSide(); save(); }; });
$$('[data-chat]').forEach(b => { b.onclick = () => { state.chatTab = b.dataset.chat; renderChat(); save(); }; });
const canNotice = () => !!view.isAdmin || (typeof devOn === 'function' && devOn()); // 서버 관리자(admins 표)면 개발자 도구 없이도 공지를 쓸 수 있다. 실제 권한은 서버가 다시 검사한다
async function postNotice(body) {
  const head = cleanText($('#noticeHead').value, 20) || '공지';
  try {
    if (Cloud.enabled && Cloud.user()) { await Cloud.postNotice(head, body); await syncNotices(); }
    else { state.chats['알림'] = [...state.chats['알림'], [head, body]].slice(-200); renderChat(); }
    sfx('ok');
  } catch (e) { toast('공지를 올리지 못했어요. 관리자 계정인지 확인해 주세요.'); sfx('error'); }
}
/* 서버 공지: 관리자가 올린 공지를 모두에게 보여 준다 (지난 공지는 최근 30개) */
async function syncNotices() {
  if (!(Cloud.enabled && Cloud.user())) return;
  let rows; try { rows = await Cloud.listNotices(); } catch (e) { return; }
  state.chats['알림'] = [...NOTICE_FEED(), ...rows.slice().reverse().map(r => [cleanText(r.head, 20), cleanText(r.body, 300)])];
  if ($('#chatFeed')) renderChat();
}
function sendChat(val) {
  if (state.chatTab === '알림') { if (canNotice()) postNotice(val); else { toast('알림 채널은 공지만 받을 수 있어요.'); sfx('error'); } return; }
  if (state.chatTab === '길드' && !state.guild) { toast('길드가 없습니다. 위의 버튼으로 길드를 만들거나 가입하세요.'); sfx('error'); return; }
  if (chatOnline() && CHAT_CH[state.chatTab]) { // 서버 채팅: 다른 대원에게도 보인다
    const tab = state.chatTab; state.flags.chatted = true;
    Cloud.chatSend(CHAT_CH[tab], val).then(r => { if (r && r.ok === false) { toast(r.msg === 'too_fast' ? '너무 빨리 보내고 있어요. 잠시 뒤에 보내 주세요.' : r.msg === 'no_channel' ? '길드가 없어 보낼 수 없어요.' : '보내지 못했어요.'); sfx('error'); } else chatPoll(); }).catch(() => { toast('보내지 못했어요. 서버에 friends.sql 을 실행했는지 확인해 주세요.'); sfx('error'); });
    renderSide(); return;
  }
  state.chats[state.chatTab] = [...state.chats[state.chatTab], ['나', val]].slice(-200);
  state.flags.chatted = true;
  renderChat(); renderSide(); // 채팅은 로그에 남기지 않는다
}

/* ---------- 임무 수주 / 상점 / 길드 창 ---------- */
const fmtLeft = ms => { const h = Math.floor(ms / 3600000), m = Math.ceil(ms % 3600000 / 60000); return h ? `${h}시간 ${m % 60}분` : `${m}분`; };
function openQuestBoard(keepScroll) {
  const place = placeKey(), list = QUESTS.filter(q => q.board === place);
  if (!list.length) { toast('이곳에서는 임무를 수주할 수 없습니다.'); return; }
  const active = activeBoard().length;
  const st = keepScroll ? $('#modalBody').scrollTop : 0;
  const rows = list.map(q => {
    const done = !!state.questDone[q.id], taken = !!state.questTaken[q.id], left = boardResetLeft(q.id);
    return `<div class="board-quest ${done ? 'done' : ''}"><div class="grow"><strong>${esc(q.title)}</strong><small>${esc(q.desc)}</small><small class="rw">${esc(rewardText(q))}</small>${taken ? `<small>${done ? '완수' : '수주함'} · ${fmtLeft(left)} 뒤 리셋</small>` : ''}</div>` +
      `<button class="${taken || done ? '' : 'primary'}" data-act="quest-take" data-id="${q.id}" ${taken || done ? 'disabled' : ''}>${done ? '완수' : taken ? '수주함' : '수주'}</button></div>`;
  }).join('');
  modal(`임무 수주 · ${place === '본부' ? '본부' : place + ' 캠프'}`,
    `<p class="tiny">${place === '본부' ? '본부에서는 공통 임무를 받을 수 있어요.' : `${esc(place)}에서만 받을 수 있는 특별 임무예요.`} 동시에 ${BOARD_MAX_ACTIVE}개까지 (지금 ${active}개). 수주한 임무는 <b>24시간이 지나면 리셋</b>되어 다시 받을 수 있어요.</p>` + rows, [btnClose]);
  $('#modalBody').scrollTop = st;
}
function openShop(keepScroll) {
  const place = placeKey(), shop = SHOPS[place];
  if (!shop) { toast('이곳에는 상점이 없습니다.'); return; }
  if (!SHOP_TABS.includes(view.shopTab)) view.shopTab = SHOP_TABS[0];
  const st = keepScroll ? $('#modalBody').scrollTop : 0, tab = view.shopTab, sec = shopSections(place);
  const tagText = n => (ITEMS[n].tags || []).length ? ` · 태그 ${ITEMS[n].tags.join('/')}` : '';
  const row = ([n, price]) => {
    const it = ITEMS[n], stack = it.tab !== '장비';
    return `<div class="shop-row"><span class="shop-ic">${icon(it.icon)}</span><div class="grow"><strong>${esc(n)}</strong><small>${esc(it.desc)}${esc(tagText(n))}</small></div><span class="price">${price} CR</span>` +
      `<button data-act="shop-buy" data-place="${esc(place)}" data-name="${esc(n)}" data-qty="1" ${state.money < price ? 'disabled' : ''}>구입</button>` +
      (stack ? `<button data-act="shop-buy" data-place="${esc(place)}" data-name="${esc(n)}" data-qty="5" ${state.money < price * 5 ? 'disabled' : ''}>×5</button>` : '') + '</div>';
  };
  let body;
  if (tab === '판매') {
    const m = {};
    sellable().forEach(x => { m[x.n] = (m[x.n] || 0) + x.q; });
    const names = Object.keys(m).sort((a, b) => ITEMS[a].tab.localeCompare(ITEMS[b].tab) || a.localeCompare(b));
    body = names.length ? names.map(n => {
      const it = ITEMS[n], q = m[n], pr = sellPrice(n);
      return `<div class="shop-row"><span class="shop-ic">${icon(it.icon)}</span><div class="grow"><strong>${esc(n)} <span class="tiny">×${q}</span></strong><small>${esc(it.tab)}${esc(tagText(n))}</small></div><span class="price">${pr} CR</span>` +
        `<button data-act="shop-sell" data-name="${esc(n)}" data-qty="1">판매</button>` + (q > 1 ? `<button data-act="shop-sell" data-name="${esc(n)}" data-qty="${q}">전부 (${pr * q})</button>` : '') + '</div>';
    }).join('') : '<div class="empty">팔 수 있는 아이템이 없습니다. (착용 중인 장비와 기본 무기는 팔 수 없어요)</div>';
  } else {
    body = sec[tab].length ? sec[tab].map(row).join('') : '<div class="empty">이 분류는 이 상점에서 취급하지 않습니다.</div>';
  }
  modal(shop.title,
    `<p class="tiny">보유 CR <b id="shopMoney">${state.money.toLocaleString()}</b> · 가방 ${usedSlots()} / ${bagCapacity()}${place === '상점가' ? '' : ' · 캠프 가격은 조금 비쌉니다.'}</p>` +
    `<div class="tabs flush shop-tabs">${SHOP_TABS.map(t => `<button class="${t === tab ? 'active' : ''}" data-act="shop-tab" data-tab="${t}">${t}</button>`).join('')}</div>` +
    `<div class="shop-list">${body}</div>`, [btnClose]);
  $('#modalBody').scrollTop = st;
}

/* ---------- 승급 ---------- */
function openPromo() {
  const c = state.character, q = nextPromo(), taken = q && state.questTaken[q.id];
  let body = `<p class="tiny">현재 등급 <b>${esc(c.rank)}</b> · 승급 시험은 메인 임무로 진행됩니다. 임무를 마치면 바로 승급해요. (지금은 D등급까지)</p>`;
  if (!q) body += `<div class="empty">${c.rank === 'D' ? 'D등급까지 승급했습니다. 그다음 등급은 아직 준비 중입니다.' : '승급할 수 있는 등급이 없습니다.'}</div>`;
  else {
    const pr = questProgress(q);
    body += `<div class="board-quest"><div class="grow"><strong>${esc(q.title)}</strong><small>${esc(q.desc)}</small><small class="rw">${esc(rewardText(q))} · 승급 ${esc(c.rank)} → ${esc(q.promo)}</small>` +
      `<small>필요 레벨 Lv.${q.lv}${c.level < q.lv ? ` (지금 Lv.${c.level})` : ''}${taken ? ` · 진행: ${esc(pr.text)}` : ''}</small></div>` +
      `<button class="${taken ? '' : 'primary'}" data-act="promo-take" ${taken || c.level < q.lv ? 'disabled' : ''}>${taken ? '진행 중' : '시험 받기'}</button></div>`;
  }
  modal('승급', body, [btnClose], true);
}

/* ---------- 농장 (개인실) ---------- */
function openFarm(keepScroll) {
  const st = keepScroll ? $('#modalBody').scrollTop : 0, n = farmPlotCount();
  const seeds = Object.values(state.inventory).flat().filter(x => ITEMS[x.n].seed);
  if (!seeds.some(x => x.n === view.seed)) view.seed = seeds[0] ? seeds[0].n : null;
  const plots = Array.from({ length: n }, (_, i) => {
    const p = state.farm.plots[i];
    if (!p) return `<div class="plot empty-plot"><div class="plot-name">${icon('grass')} 빈 밭 ${i + 1}</div><small>${view.seed ? '선택한 씨앗을 심을 수 있어요.' : '씨앗이 없습니다.'}</small><button data-act="farm-plant" data-i="${i}" ${view.seed ? '' : 'disabled'}>심기</button></div>`;
    const ready = plotReady(p), c = CROPS[p.crop];
    return `<div class="plot ${ready ? 'ready' : ''}" data-i="${i}" data-ready="${+ready}" data-end="${p.at + growMs(p.crop)}"><div class="plot-name">${icon(c.icon)} ${esc(p.crop)}</div>` +
      `<small class="plot-time">${ready ? '수확할 수 있어요!' : `자라는 중 · ${fmtLeft(p.at + growMs(p.crop) - nowMs())}`}</small>` +
      `<button class="${ready ? 'primary' : ''}" data-act="farm-harvest" data-i="${i}" ${ready ? '' : 'disabled'}>수확</button></div>`;
  }).join('');
  const jf = jobFx();
  modal('농장', `<p class="tiny">씨앗을 심으면 시간이 지나 자랍니다. 창을 닫아도 계속 자라요. 수확한 작물은 <b>제작·판매·펫 먹이·서브잡 납품</b>에 쓸 수 있어요. 밭 ${n}칸 (등급이 오르면 늘어납니다)${jf.farmTime ? ` · 서브잡 효과: 성장 -${Math.round(jf.farmTime * 100)}%` : ''}</p>` +
    `<div class="row-gap"><label class="tiny" for="seedSel">심을 씨앗</label><select id="seedSel" ${seeds.length ? '' : 'disabled'}>${seeds.length ? seeds.map(x => `<option value="${esc(x.n)}" ${x.n === view.seed ? 'selected' : ''}>${esc(x.n)} ×${x.q} (${CROPS[ITEMS[x.n].seed].grow}분)</option>`).join('') : '<option>씨앗 없음</option>'}</select>` +
    `<button data-act="farm-harvest-all">모두 수확</button></div><div class="plot-grid" id="farmBox">${plots}</div>` +
    `<p class="tiny">씨앗은 상점가 상점이나 지상의 캠프 상점, 지상 채집·전투(드물게)에서 얻을 수 있어요.</p>`, [btnClose]);
  view.farmOpen = true;
  $('#modalBody').scrollTop = st;
}
/* 1초마다: 열린 농장 창의 남은 시간을 갱신하고, 다 자란 밭이 생기면 다시 그린다 */
function farmRefresh() {
  if (!view.farmOpen) return;
  if (!$('#overlay').classList.contains('open') || !$('#farmBox')) { view.farmOpen = false; return; }
  let redraw = false;
  $$('#farmBox .plot[data-i]').forEach(el => {
    const left = +el.dataset.end - nowMs();
    if (left <= 0 && el.dataset.ready === '0') redraw = true;
    else if (left > 0) el.querySelector('.plot-time').textContent = `자라는 중 · ${fmtLeft(left)}`;
  });
  if (redraw) openFarm(true);
}

/* ---------- 펫 (개인실) ---------- */
function openPets(keepScroll) {
  const st = keepScroll ? $('#modalBody').scrollTop : 0, feeds = Object.values(state.inventory).flat().filter(x => ITEMS[x.n].feed);
  if (!feeds.some(x => x.n === view.feed)) view.feed = feeds[0] ? feeds[0].n : null;
  if (!DANGER_ZONES.some(z => z.id === view.expZone)) view.expZone = DANGER_ZONES[0].id;
  const owned = Object.fromEntries(state.pets.map(p => [p.id, p]));
  const dex = Object.entries(PET_SPECIES).map(([id, sp]) => owned[id]
    ? `<div class="pet-dex got" title="${esc(sp.name)}">${icon('pets')}<small>${esc(sp.name)}</small></div>` : `<div class="pet-dex" title="아직 길들이지 못했습니다">${icon('help')}<small>${esc(sp.zone)}</small></div>`).join('');
  const rows = state.pets.map((p, i) => {
    const sp = PET_SPECIES[p.id], fed = petFed(p), act = state.petActive === i, away = !!p.exp, ready = expReady(p);
    const state1 = away ? (ready ? `${p.exp.zone} 탐험에서 돌아왔어요!` : `${p.exp.zone} 탐험 중 · ${fmtLeft(expLeft(p))} 남음`) : act ? '동행 중' : '대기 중';
    return `<div class="pet-row ${act ? 'active' : ''}"><div class="round-avatar">${icon('pets')}</div><div class="grow"><strong>${esc(sp.name)} <span class="tag">${esc(state1)}</span></strong>` +
      `<small>친밀도 ${p.bond}/100 · ${fed ? `든든함 ${fmtLeft(Math.max(0, p.fedAt + PET_FED_MS - nowMs()))} 남음` : '배고픔'} · 동행 시 이동 시간 -${Math.round(petBuff(p) * 100)}%${fed ? '' : ' (먹이를 줘야 적용)'}</small>` +
      `<div class="bar thin"><span style="width:${p.bond}%"></span></div></div>` +
      `<div class="col-btns">${away ? (ready ? `<button class="primary" data-act="pet-claim" data-i="${i}">수확물 받기</button>` : '<button disabled>탐험 중</button>')
        : `<button data-act="pet-feed" data-i="${i}" ${feeds.length ? '' : 'disabled'}>먹이 주기</button><button data-act="pet-active" data-i="${i}">${act ? '동행 해제' : '함께 다니기'}</button><button data-act="pet-send" data-i="${i}" ${act || !feeds.length ? 'disabled' : ''}>탐험 보내기</button>`}</div></div>`;
  }).join('');
  modal('펫 돌보기', `<p class="tiny">펫은 지상의 짐승 지형에서 <b>길들이기</b>로 얻어요. 펫 보관함은 소지품과 별도이고, 같은 종은 한 마리만 모을 수 있어요. 한 마리는 <b>동행</b>(먹이를 준 뒤 24시간 타일 이동 시간 단축), 나머지는 <b>24시간 자동 탐험</b>을 보낼 수 있어요.</p>` +
    `<div class="choice-label">펫 도감 ${state.pets.length}/${petCap()}</div><div class="pet-dex-grid">${dex}</div>` +
    `<div class="row-gap"><label class="tiny" for="feedSel">줄 먹이</label><select id="feedSel" ${feeds.length ? '' : 'disabled'}>${feeds.length ? feeds.map(x => `<option value="${esc(x.n)}" ${x.n === view.feed ? 'selected' : ''}>${esc(x.n)} ×${x.q} (친밀도 +${ITEMS[x.n].feed})</option>`).join('') : '<option>먹이 없음 (작물·펫 사료)</option>'}</select>` +
    `<label class="tiny" for="expZone">탐험 구역</label><select id="expZone">${DANGER_ZONES.map(z => `<option value="${esc(z.id)}" ${z.id === view.expZone ? 'selected' : ''}>${esc(z.name)}</option>`).join('')}</select></div>` +
    `<p class="tiny">탐험을 보내면 먹이 1개가 들고, 돌아오면 그 구역의 재료·희귀 재료·특산 씨앗을 확률로 가져와요. (친밀도가 높고 고향 구역이면 더 많이)</p>` +
    (rows || '<div class="empty">아직 길들인 펫이 없습니다. 지상에서 작물이나 펫 사료를 들고 짐승을 길들여 보세요.</div>'), [btnClose]);
  $('#modalBody').scrollTop = st;
}

/* ---------- 서브잡 (상점가) ---------- */
function jobPickSum() {
  const t = $$('.job-pick').reduce((a, i) => a + (Number(i.value) || 0), 0), el = $('#jobPickTotal');
  if (el && state.subjob) el.textContent = `고른 수량 ${t} / ${jobNeed(state.subjob.level)}`;
}
document.addEventListener('input', e => { if (e.target.classList && e.target.classList.contains('job-pick')) jobPickSum(); });
function openTrade(name, keepScroll) {
  const st0 = keepScroll === true && $('#modalBody') ? $('#modalBody').scrollTop : 0, p = NEARBY_PLAYERS.find(x => x[0] === name);
  if (!p) { toast('주위에 없는 대원입니다.'); return; }
  const mine = ['소모품', '재료', '장비'].flatMap(t => state.inventory[t]).map(s => s.n), uniq = [...new Set(mine)], offers = playerOffers(p);
  const body = `<p class="tiny">${esc(name)}님과 물건을 맞바꿉니다. 하루 ${TRADE_DAILY}회까지 · 오늘 남은 횟수 <b>${tradesLeft()}회</b>. 장착 중인 장비는 줄 수 없어요.</p>` +
    (offers.length ? `<div class="srow fontrow trade-row"><span>내가 줄 물건</span><select id="tradeGive">${uniq.map(n => `<option value="${esc(n)}">${esc(n)} (${countItem(n)})</option>`).join('')}</select><input id="tradeGiveQty" type="number" min="1" value="1" style="width:64px"></div>` +
      `<div class="srow fontrow trade-row"><span>받을 물건</span><select id="tradeWant">${offers.map(([n, q]) => `<option value="${esc(n)}">${esc(n)} (최대 ${q})</option>`).join('')}</select><input id="tradeWantQty" type="number" min="1" value="1" style="width:64px"></div>`
      : '<div class="empty">상대가 내놓은 물건이 없습니다.</div>') +
    '<p class="tiny">지금은 서버가 없어 상대의 물건은 테스트용으로만 존재합니다. 실제 대원과의 교환은 서버 연결 후 열립니다.</p>';
  modal(`${name}님과 교환`, body, [btnClose, `<button class="primary" data-act="trade-do" data-player="${esc(name)}" ${offers.length && tradesLeft() ? '' : 'disabled'}>교환하기</button>`], true);
  $('#modalBody').scrollTop = st0;
}
/* ---------- 추가 기능: 모의 전투 (실제 진행·보상에는 영향 없음) ---------- */
function mockMonsters() {
  const seen = new Set(), out = [];
  for (const [id, a] of Object.entries(ACTIONS)) { if (a.kind !== 'battle') continue; const m = monsterBase(a); if (m && !seen.has(m.name)) { seen.add(m.name); out.push(m); } }
  return out.sort((x, y) => x.hp * x.atk - y.hp * y.atk); // 위쪽이 약한 몬스터, 아래로 갈수록 강한 몬스터
}
function openMock() {
  const ms = mockMonsters();
  modal('추가 기능 · 모의 전투', `<p class="tiny">상대를 골라 전투를 구경해 보세요. 위쪽일수록 약하고 아래로 갈수록 강한 상대예요. 보상·HP·기력에는 영향이 없어요.</p>` +
    `<div class="srow fontrow"><span>상대</span><select id="mockMon">${ms.map((m, i) => `<option value="${i}">${esc(m.name)} (HP ${m.hp})</option>`).join('')}</select></div>` +
    `<div class="mock-bars"><div><small id="mockMe">나</small><div class="progress"><span id="mockMeBar" style="width:100%"></span></div></div><div><small id="mockEn">상대</small><div class="progress"><span id="mockEnBar" class="bad" style="width:100%"></span></div></div></div>` +
    `<div class="battle-log mock" id="mockLog"><div class="bl-note">상대를 고르고 시작을 누르세요.</div></div>`,
    [btnClose, '<button class="primary" data-act="mock-start">전투 시작</button>']);
}
function mockStart() {
  if (view.mockTimer) { clearInterval(view.mockTimer); view.mockTimer = 0; }
  const ms = mockMonsters(), m = ms[+$('#mockMon').value] || ms[0]; if (!m) return;
  const st = { hp: Math.max(20, state.vitals.hpMax), mhp: m.hp * 2 }, hp0 = st.hp, mhp0 = st.mhp, log = $('#mockLog');
  log.innerHTML = ''; let rounds = 0;
  const add = (text, kind) => { log.insertAdjacentHTML('beforeend', `<div class="bl ${kind}">${esc(text)}</div>`); log.scrollTop = log.scrollHeight; };
  const bars = () => { $('#mockMeBar').style.width = clamp(st.hp / hp0 * 100, 0, 100) + '%'; $('#mockEnBar').style.width = clamp(st.mhp / mhp0 * 100, 0, 100) + '%'; $('#mockMe').textContent = `나 ${Math.max(0, Math.round(st.hp))}/${hp0}`; $('#mockEn').textContent = `${m.name} ${Math.max(0, Math.round(st.mhp))}/${mhp0}`; };
  add(`${m.name}와(과) 마주쳤다. 전투 시작!`, 'note'); bars();
  $('[data-act="mock-start"]').disabled = true;
  view.mockTimer = setInterval(() => {
    if (!$('#mockLog')) { clearInterval(view.mockTimer); view.mockTimer = 0; return; }
    rounds++; const l = mockRound(m, st); add(l.text, l.kind); bars();
    if (st.mhp <= 0 || st.hp <= 0 || rounds >= 40) {
      clearInterval(view.mockTimer); view.mockTimer = 0;
      add(st.mhp <= 0 ? `${m.name}을(를) 쓰러뜨렸다! 모의 전투 승리.` : st.hp <= 0 ? '쓰러졌다… 모의 전투 패배.' : '승부가 나지 않은 채 전투가 끝났다.', 'note');
      const b = $('[data-act="mock-start"]'); if (b) { b.disabled = false; b.textContent = '다시 하기'; }
    }
  }, 650);
}
function openFriendTrade(name) {
  const mine = ['소모품', '재료', '장비'].flatMap(t => state.inventory[t]).map(s => s.n).filter(n => n !== MAIL_SHIP_ITEM), uniq = [...new Set(mine)];
  const all = Object.keys(ITEMS).filter(n => n !== MAIL_SHIP_ITEM);
  const body = `<p class="tiny">${esc(name)} 대원에게 교환을 제안합니다. 내가 줄 물건은 상대가 답할 때까지 맡겨 두고, 거절·취소·3일 만료 시 메일로 돌아와요. 하루 ${TRADE_DAILY}회까지 · 오늘 남은 횟수 <b>${tradesLeft()}회</b>. 장착 중인 장비는 줄 수 없어요.</p>` +
    (uniq.length ? `<div class="srow fontrow trade-row"><span>내가 줄 물건</span><select id="ftGive">${uniq.map(n => `<option value="${esc(n)}">${esc(n)} (${countItem(n)})</option>`).join('')}</select><input id="ftGiveQty" type="number" min="1" max="99" value="1" style="width:64px"></div>` +
      `<div class="srow fontrow trade-row"><span>받고 싶은 물건</span><input id="ftWant" list="ftItems" placeholder="아이템 이름" autocomplete="off"><input id="ftWantQty" type="number" min="1" max="99" value="1" style="width:64px"></div><datalist id="ftItems">${all.map(n => `<option value="${esc(n)}">`).join('')}</datalist>` : '<div class="empty">줄 수 있는 물건이 없습니다.</div>');
  modal(`${name} 대원과 교환`, body, ['<button data-act="close">닫기</button>', `<button class="primary" data-act="ftrade-send" data-name="${esc(name)}" ${uniq.length && tradesLeft() ? '' : 'disabled'}>제안 보내기</button>`], true);
}
function openEnhance(keepScroll) {
  const st0 = keepScroll === true && $('#modalBody') ? $('#modalBody').scrollTop : 0, names = enchantables(), worn = new Set(Object.values(state.equipment));
  const rows = names.map(n => {
    const it = ITEMS[n], e = state.enchants[n];
    return `<div class="nearby-row"><div class="round-avatar">${icon(it.icon)}</div><div class="grow"><strong>${esc(n)}</strong><small>${esc(it.slot)} · ${worn.has(n) ? '착용 중' : '소지품'}${e ? ` · ${e.n}회 강화` : ''}</small><small class="${e ? 'ench-on' : ''}">${e ? `현재 효과: ${esc(enchantText(e))}` : '아직 강화하지 않았습니다.'}</small></div>` +
      `<button class="primary" data-act="enhance-roll" data-name="${esc(n)}" ${state.money < ENCHANT_COST ? 'disabled' : ''}>${e ? '다시' : '강화'} (${ENCHANT_COST} CR)</button></div>`;
  }).join('') || '<div class="empty">강화할 장비가 없습니다. 장비를 얻거나 제작해 보세요.</div>';
  modal('장비 강화', `<p class="tiny">CR ${ENCHANT_COST}을 내면 장비에 무작위 효과(스탯 +1~2, 최대 HP·기력 +5~15)가 하나 붙습니다. 장착하면 적용되고, 다시 강화하면 새 효과로 바뀝니다. 같은 이름의 장비는 효과를 함께 씁니다. 보유 CR ${state.money}</p>` + rows, [btnClose], true);
  $('#modalBody').scrollTop = st0;
}
function openJob(keepScroll) {
  const j = state.subjob, st = keepScroll ? $('#modalBody').scrollTop : 0;
  const lore = `<div class="job-lore">${icon('memory')}<p>클론 인간의 몸은 새로 만들어 낼 수 있어도, <b>근본이 되는 인간의 기억</b>은 가만히 두면 조금씩 닳아 없어집니다. 사람다운 일상을 반복하는 것 — 무언가를 만들고, 거두고, 나누는 것 — 이 기억을 붙잡아 두는 유일한 방법입니다. 서브잡은 그래서 필요한 일입니다.</p></div>`;
  if (!j) {
    modal('서브잡 가입', lore + `<div class="srow fontrow"><span>생전 가졌던 직업</span><input id="jobName" maxlength="${JOB_NAME_MAX}" placeholder="비워 두면 태그 이름 (예: 숲속 요리사)"></div>` +
      `<div class="choice-label">태그 (1개) — 같은 태그가 붙은 아이템을 납품해요</div><div class="tag-grid">${JOB_TAGS.map(([t, ic, d]) => `<label class="tag-pick" title="${esc(d)}"><input type="radio" name="jobtag" class="job-tag" value="${t}"><span>${icon(ic)} ${t}</span></label>`).join('')}</div>` +
      `<p class="tiny">하루에 한 번, 태그가 붙은 아이템을 정해진 개수만큼 납품하면 서브잡 레벨이 오르고 버프를 받아요. 생전 직업은 프로필에 표시됩니다. 하루에 한 번 납품을 마친 날에만 서브잡 버프가 적용돼요. 아이템의 태그는 가방·상점 아이템 설명에서 볼 수 있어요.</p>`,
      [btnClose, '<button class="primary" data-act="job-join">가입</button>'], true);
    return;
  }
  const need = jobNeed(j.level), stock = jobStock(), have = stock.reduce((a, r) => a + r.q, 0), cd = jobCooldown(), act = jobActive();
  const picks = stock.length ? stock.map(r => `<div class="job-pick-row"><span class="grow">${icon(ITEMS[r.n].icon)} ${esc(r.n)} <small>(보유 ${r.q} · 판매가 ${r.price})</small></span><input type="number" class="job-pick" data-n="${esc(r.n)}" min="0" max="${r.q}" value="0" ${cd ? 'disabled' : ''}></div>`).join('') : `<div class="empty">납품할 수 있는 ${esc(j.tags.join('/'))} 태그 아이템이 없습니다.</div>`;
  modal(`서브잡 · ${j.name}`, lore +
    `<div class="job-card"><div class="job-head"><strong>${esc(j.name)}</strong><span class="tag">Lv.${j.level}${j.level >= JOB_MAX_LV ? ' MAX' : ''}</span>${j.tags.map(t => `<span class="tag">#${t}</span>`).join('')}</div>` +
    `<div class="bar thin"><span style="width:${j.level >= JOB_MAX_LV ? 100 : j.prog / jobProgNeed(j.level) * 100}%"></span></div>` +
    `<small>${j.level >= JOB_MAX_LV ? '최고 레벨입니다.' : `다음 레벨까지 납품 ${j.prog}/${jobProgNeed(j.level)}일`}</small>` +
    `<small>${act ? `<b>버프 적용 중</b> (${fmtLeft(cd)} 남음): ${esc(jobFxText())}` : `<b>버프 꺼짐</b> — 오늘 납품을 마치면 적용: ${esc(jobFxText(true))}`}</small>` +
    `<small>오늘의 납품: ${j.tags.join('/')} 태그 아이템 <b>${need}개</b>를 직접 골라 내세요 (납품 대금 = 판매가의 125%)</small>` +
    (cd ? `<small class="risk">다음 납품까지 ${fmtLeft(cd)}</small>` : '') + `</div>` +
    `<div class="job-picks">${picks}</div><small id="jobPickTotal">고른 수량 0 / ${need}</small>` +
    `<div class="row-gap"><button data-act="job-auto" ${cd || have < need ? 'disabled' : ''}>싼 것부터 채우기</button><button class="primary" data-act="job-deliver" ${cd || have < need ? 'disabled' : ''}>납품하기</button><button data-act="job-quit" class="${view.quitAsk ? 'danger' : ''}">${view.quitAsk ? '정말 그만두기 (레벨 초기화)' : '서브잡 그만두기'}</button></div>`, [btnClose], true);
  $('#modalBody').scrollTop = st;
}
/* ---- 서버 길드: 초대/가입 신청은 상대(또는 길드장)가 수락해야 이루어진다 ---- */
const guildOnline = () => Cloud.enabled && !!Cloud.user();
function guildSyncState(info) { // 서버의 길드 정보를 내 상태에 반영 (서버가 기준)
  const sg = info && info.guild, was = state.guild;
  if (!sg) { if (was) { state.guild = null; state.chats['길드'] = [['시스템', '길드 채널은 길드에 가입하거나 만든 뒤 사용할 수 있습니다.']]; save(); renderChat(); } return; }
  const me = state.character.name, members = (sg.members || []).map(m => cleanText(m.name, 12)).filter(Boolean);
  const mine = (sg.members || []).findIndex(m => m && m.uid === Cloud.userUid);
  const others = members.filter((n, i) => i !== mine);
  const next = { name: cleanText(sg.name, GUILD_NAME_MAX), master: !!sg.master, members: others.slice(0, GUILD_MAX - 1) };
  if (!was || was.name !== next.name || was.master !== next.master || was.members.join() !== next.members.join()) {
    const joined = !was || was.name !== next.name;
    state.guild = next;
    if (joined) state.chats['길드'] = [['시스템', `길드 「${next.name}」에 속해 있습니다.`]];
    save(); renderChat();
  }
}
const guildReqRows = (list, acts) => list.map(r => `<div class="member-row"><div class="round-avatar">${icon(r.kind === 'invite' ? 'mail' : 'person_add')}</div><div class="grow"><strong>${esc(r.kind === 'invite' ? r.guild : r.name)}</strong><small>${esc(r.text)}</small></div>${acts(r)}</div>`).join('');
async function openGuildOnline(keepForm) {
  Object.keys(view.avatars).forEach(k => { if (!view.avatars[k]) delete view.avatars[k]; });
  let info; const dr = keepForm ? { s: ($('#guildQ') || {}).value || '' } : { s: '' };
  try { info = await Cloud.guildInfo(); } catch (e) { toast('길드 정보를 가져오지 못했어요. 서버에 friends.sql 을 실행했는지 확인해 주세요.'); return; }
  view.guildInfo = info; view.guildIn = (info.incoming || []).length; renderMailBadge(); guildSyncState(info);
  const clean = (a, kind) => (a || []).map(r => ({ id: intIn(r.id, 1, 9e15, 0), kind: r.kind === 'invite' ? 'invite' : 'apply', guild: cleanText(r.guild, GUILD_NAME_MAX), name: cleanText(r.name, 12) })).filter(r => r.id);
  const inc = clean(info.incoming), sent = clean(info.sent), g = info.guild;
  const incHtml = inc.length ? '<div class="choice-label">받은 요청</div>' + guildReqRows(inc.map(r => ({ ...r, text: r.kind === 'invite' ? `${r.name} 길드장의 초대` : `${r.name} 대원의 가입 신청` })), r => `<button class="primary" data-act="guild-answer" data-id="${r.id}" data-yes="1">수락</button><button data-act="guild-answer" data-id="${r.id}">거절</button>`) : '';
  const sentHtml = sent.length ? '<div class="choice-label">보낸 요청 (상대가 수락해야 해요)</div>' + guildReqRows(sent.map(r => ({ ...r, text: r.kind === 'invite' ? `${r.name} 대원에게 초대 보냄` : `${r.guild}에 가입 신청함` })), r => `<button data-act="guild-cancel" data-id="${r.id}">취소</button>`) : '';
  if (!g) {
    modal('길드', `<p class="tiny">길드를 만들면 길드장이 되어 대원을 초대할 수 있어요. 이미 있는 길드에는 가입 신청을 보내고 길드장이 수락하면 가입돼요.</p>` +
      `<div class="form-row"><label>길드 이름</label><input id="guildName" maxlength="${GUILD_NAME_MAX}" placeholder="${GUILD_NAME_MIN}~${GUILD_NAME_MAX}자" value="${esc(defaultGuildName())}"></div>` + incHtml + sentHtml +
      `<div class="choice-label">길드 찾기</div><div class="search-row"><input id="guildQ" placeholder="길드 이름으로 검색" value="${esc(dr.s)}"><button data-act="guild-find">검색</button></div><div id="guildFound"></div>`,
      [btnClose, '<button class="primary" data-act="guild-create">길드 만들기</button>']);
    return;
  }
  const mem = (g.members || []).map(m => ({ uid: m.uid, name: cleanText(m.name, 12), master: !!m.master }));
  modal(`길드 · ${cleanText(g.name, GUILD_NAME_MAX)}`, `<p class="tiny">${mem.length}/${GUILD_MAX}명 · ${g.master ? '길드장입니다. 대원을 초대하거나 가입 신청을 수락할 수 있어요.' : '길드원입니다.'}</p>` +
    '<div class="member-grid">' + mem.map(m => `<div class="member-row"><div class="round-avatar">${avatarOf(m.name)}</div><div class="grow"><strong>${esc(m.name)}</strong><small>${m.master ? '길드장' : '길드원'}${m.uid === Cloud.userUid ? ' (나)' : ''}</small></div></div>`).join('') + '</div>' + incHtml + sentHtml +
    (g.master ? `<div class="choice-label">초대하기</div><div class="search-row"><input id="guildQ" placeholder="대원 이름으로 검색" value="${esc(dr.s)}"><button data-act="guild-find-player">검색</button></div><div id="guildFound"></div>` : ''),
    [btnClose, `<button class="danger" data-act="guild-leave">${g.master ? '길드 해산' : '길드 탈퇴'}</button>`]);
}
function openGuild() {
  if (guildOnline()) { openGuildOnline(); return; }
  const g = state.guild;
  if (!g) {
    modal('길드', `<p class="tiny">길드를 만들면 길드장이 되어 다른 대원를 초대할 수 있어요.</p>` +
      `<div class="form-row"><label>길드 이름</label><input id="guildName" maxlength="${GUILD_NAME_MAX}" placeholder="${GUILD_NAME_MIN}~${GUILD_NAME_MAX}자" value="${esc(defaultGuildName())}"></div>` +
      `<div class="choice-label">가입할 수 있는 길드</div><div class="empty">지금 가입할 수 있는 길드가 없습니다. 다른 길드는 서버 연결 후에 나타납니다.</div>`,
      [btnClose, '<button class="primary" data-act="guild-create">길드 만들기</button>']);
    return;
  }
  const rest = NEARBY_PLAYERS.filter(p => !g.members.includes(p[0]));
  modal(`길드 · ${g.name}`, `<p class="tiny">${g.members.length + 1}/${GUILD_MAX}명 · ${g.master ? '길드장입니다. 아래에서 대원을 초대할 수 있어요.' : '길드원입니다.'}</p>` +
    `<div class="member-grid"><div class="member-row"><div class="round-avatar">${avatarOf('나')}</div><div class="grow"><strong>${esc(state.character.name || '나')}</strong><small>${g.master ? '길드장 (나)' : '나'}</small></div></div>` +
    g.members.map(n => `<div class="member-row"><div class="round-avatar">${avatarOf(n)}</div><div class="grow"><strong>${esc(n)}</strong><small>길드원</small></div></div>`).join('') + '</div>' +
    (g.master && rest.length ? '<div class="choice-label">초대</div>' + rest.map(([n, st]) => `<div class="member-row"><div class="grow"><strong>${esc(n)}</strong><small>${esc(st)}</small></div><button data-act="guild-invite" data-name="${esc(n)}">초대</button></div>`).join('') : ''),
    [btnClose, `<button class="danger" data-act="guild-leave">${g.master ? '길드 해산' : '길드 탈퇴'}</button>`]);
}
$('#chatForm').onsubmit = e => {
  e.preventDefault();
  const val = $('#chatInput').value.trim();
  if (!val) return;
  $('#chatInput').value = '';
  sendChat(val);
};
/* 이모티콘: 입력창 위에 종류가 뜨고, 누르면 바로 전송 */
function setTray(open) {
  const tray = $('#stickerTray');
  if (open) tray.innerHTML = STICKERS.map(([n, ic]) => `<button class="sticker" data-act="sticker" data-name="${n}" title="${n}" aria-label="${n}">${icon(ic)}</button>`).join('');
  tray.classList.toggle('hidden', !open);
  $('#emojiBtn').classList.toggle('active', open);
}
$('#emojiBtn').onclick = () => setTray($('#stickerTray').classList.contains('hidden'));
$('#clearLog').onclick = () => { state.logs = []; renderLogs(); save(); };

/* 지도 드래그 / 확대 / 축소 / 중앙 정렬 */
let drag = null;
const stage = $('#mapStage');
stage.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' && e.button !== 1) return; // 마우스는 가운데(휠) 버튼으로만 지도를 움직인다 (터치는 그대로 끌기)
  const mid = e.pointerType === 'mouse'; // 가운데 버튼은 노드·타일 위에서도 끌 수 있다
  if (!mid && (e.target.closest('button') || state.dungeon)) return;
  e.preventDefault();
  drag = state.dungeon ? { x: e.clientX, y: e.clientY, px: view.dpan.x, py: view.dpan.y, d: 1 } : { x: e.clientX, y: e.clientY, px: state.pan.x, py: state.pan.y };
  stage.classList.add('dragging');
  stage.setPointerCapture(e.pointerId);
});
stage.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); }); // 휠 클릭 자동 스크롤 방지
stage.addEventListener('pointermove', e => {
  if (!drag) return;
  const nx = drag.px + e.clientX - drag.x, ny = drag.py + e.clientY - drag.y;
  if (drag.d) { const lim = (v, n) => clamp(v, -n, n); view.dpan = { x: lim(nx, stage.clientWidth), y: lim(ny, stage.clientHeight) }; } else state.pan = { x: nx, y: ny };
  applyMapTransform();
});
const endDrag = () => { if (drag) { const was = drag; drag = null; stage.classList.remove('dragging'); if (!was.d) save(); } };
stage.addEventListener('pointerup', endDrag);
stage.addEventListener('pointercancel', endDrag);
const zoomBy = d => { if (state.dungeon) { view.dzoom = clamp(+(view.dzoom + d).toFixed(2), .65, 1.8); applyMapTransform(); return; } state.zoom = clamp(+(state.zoom + d).toFixed(2), .65, 1.8); applyMapTransform(); save(); };
$('#mapSearch').addEventListener('input', e => { view.mapQ = e.target.value.slice(0, 12); renderMap(); });
$('#mapSearch').addEventListener('pointerdown', e => e.stopPropagation());
$('#zoomIn').onclick = () => zoomBy(.12);
$('#zoomOut').onclick = () => zoomBy(-.12);
$('#resetMap').onclick = () => { if (state.dungeon) { view.dpan = { x: 0, y: 0 }; view.dzoom = 1; applyMapTransform(); return; } state.zoom = 1; state.pan = { x: 0, y: 0 }; applyMapTransform(); save(); };

/* 컬럼 가로 폭 조절 (데스크톱) */
const rootStyle = document.documentElement.style;
function applyLayout() {
  const L = state.layout = state.layout || {};
  L.left = clamp(+L.left || 292, 230, 430); L.right = clamp(+L.right || 315, 250, 430);
  L.statusH = intIn(L.statusH, 0, 2000, 0); L.mapH = intIn(L.mapH, 0, 3000, 0); // 0 = 자동 높이
  rootStyle.setProperty('--left', L.left + 'px'); rootStyle.setProperty('--right', L.right + 'px');
  rootStyle.setProperty('--status-h', L.statusH + 'px'); rootStyle.setProperty('--map-h', L.mapH + 'px');
  $('.status-panel').classList.toggle('sized', L.statusH > 0); $('.map-panel').classList.toggle('sized', L.mapH > 0);
}
/* 패널 사이 틈을 끌어 세로 높이 조절 (더블클릭: 자동 높이로) */
function addVGrip(sel, key, minH, maxFn) {
  const panel = $(sel), el = document.createElement('div');
  el.className = 'vgrip'; el.title = '끌어서 높이 조절 · 더블클릭: 원래대로';
  panel.after(el);
  el.addEventListener('dblclick', () => { state.layout[key] = 0; applyLayout(); if (state.dungeon) renderDungeon(); save(); });
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startY = e.clientY, start = panel.offsetHeight; let raf = 0;
    el.classList.add('on'); document.body.style.userSelect = 'none';
    const move = ev => {
      state.layout[key] = clamp(Math.round(start + ev.clientY - startY), minH, Math.max(minH, maxFn()));
      applyLayout();
      if (state.dungeon && !raf) raf = requestAnimationFrame(() => { raf = 0; renderDungeon(); });
    };
    const up = () => { el.classList.remove('on'); document.body.style.userSelect = ''; window.removeEventListener('pointermove', move); save(); if (state.dungeon) renderDungeon(); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  });
}
const colGap = col => parseFloat(getComputedStyle(col).rowGap) || 6;
addVGrip('.status-panel', 'statusH', 90, () => { const c = $('.left-column'); return c.clientHeight - $('.profile-panel').offsetHeight - 200 - colGap(c) * 2; });
addVGrip('.map-panel', 'mapH', 300, () => { const c = $('.center-column'); return c.clientHeight - $('#actionPanel').offsetHeight - colGap(c); });
function addGutter(which) {
  const el = document.createElement('div');
  el.className = 'gutter ' + which;
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX, start = state.layout[which];
    document.body.style.userSelect = 'none';
    const move = ev => {
      const dx = ev.clientX - startX;
      state.layout[which] = which === 'left' ? clamp(start + dx, 230, 430) : clamp(start - dx, 250, 430);
      applyLayout();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', () => { document.body.style.userSelect = ''; window.removeEventListener('pointermove', move); save(); }, { once: true });
  });
  $('#layout').appendChild(el);
}
addGutter('left');
addGutter('right');

/* 좁은 화면(≤1200px)에서 패널을 접는 막대 (CSS가 넓은 화면에서는 숨김) */
$$('.panel[data-panel]').forEach(p => {
  const key = p.dataset.panel, bar = document.createElement('button');
  bar.className = 'collapse-bar';
  bar.innerHTML = `<span>${esc(key)}</span><span class="spacer"></span>${icon('expand_more')}`;
  p.classList.toggle('collapsed', !!state.collapsed[key]);
  bar.onclick = () => { state.collapsed[key] = !state.collapsed[key]; p.classList.toggle('collapsed', state.collapsed[key]); save(); };
  p.prepend(bar);
});

/* 브라우저가 다시 넓어지면 접어 둔 패널을 모두 펼친다 */
const wideMq = window.matchMedia('(min-width:1201px)');
const restorePanels = () => { if (!wideMq.matches) return; state.collapsed = {}; $$('.panel.collapsed').forEach(p => p.classList.remove('collapsed')); save(); };
(wideMq.addEventListener ? wideMq.addEventListener('change', restorePanels) : wideMq.addListener(restorePanels));
restorePanels();

/* 미궁 방향키 / WASD: 옆 타일 이동 확인창을 연다. Enter로 확인 */
document.addEventListener('keydown', e => {
  if ($('#overlay').classList.contains('open') || !$('#tutorial').classList.contains('hidden') || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Enter' && view.phase === 'confirm') { e.preventDefault(); A['action-run'](); return; }
  if (!state.dungeon || state.active || state.pending) return;
  const dir = { ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0] }[e.key];
  if (dir) { e.preventDefault(); const x = state.dungeon.x + dir[0], y = state.dungeon.y + dir[1]; if (!planMove(x, y).err) askAction('타일 이동', [x, y]); }
});

/* ---------- 튜토리얼: 안드로이드 리코의 이야기 → 캐릭터 생성 → 화면 안내 → 무기 선택 ---------- */
const tut = { page: 0, step: 0, mode: null, replay: false };
const cf = { step: 1, name: '', age: '', keywords: '', ability: '', abilityDesc: '', stats: {} };
const resetCf = () => Object.assign(cf, { step: 1, name: '', age: '', keywords: '', ability: '', abilityDesc: '', stats: Object.fromEntries(STAT_DEFS.map(d => [d.key, STAT_BASE])) });
let weaponPick = null;
function tutShow(mode) {
  tut.mode = mode;
  $('#tutorial').classList.toggle('hidden', !mode);
  [['story', '#tutStory'], ['create', '#tutCreate'], ['weapon', '#tutWeapon'], ['tour', '#tutSpot'], ['tour', '#tutCard']].forEach(([m, sel]) => $(sel).classList.toggle('hidden', mode !== m));
}
const npcHead = () => `<div class="npc-head"><div class="npc-avatar">${icon(TUTORIAL_NPC.icon)}</div><div><b>${TUTORIAL_NPC.name}</b><small>${TUTORIAL_NPC.role}</small></div></div>`;
const lastPage = () => tut.replay ? TUTORIAL_STORY.length - 2 : TUTORIAL_STORY.length - 1; // 다시 보기는 캐릭터 생성 안내를 건너뜀
function startTutorial(replay) {
  hideTip(); closeModal(); tut.replay = !!replay;
  if (!replay && state.created && !state.tutorialDone) { openWeapon(); return; }
  tut.page = replay ? TUTORIAL_REPLAY_FROM : 0; resetCf(); tutShow('story'); renderStory();
}
function renderStory() {
  const pg = TUTORIAL_STORY[tut.page], p = $('#tutText'), npc = pg.who === 'npc';
  $('#tutNpc').classList.toggle('hidden', !npc); $('#tutNpc').innerHTML = npc ? npcHead() : '';
  $('#tutGift').classList.toggle('hidden', !pg.gift);
  $('#tutStory').classList.toggle('npc', npc);
  p.textContent = pg.text;
  p.classList.remove('fade'); void p.offsetWidth; p.classList.add('fade');
  $('#tutNextStory').textContent = tut.page === lastPage() ? (tut.replay || state.created ? '단말기 안내 보기' : '캐릭터 만들기') : '다음';
  const from = tut.replay ? TUTORIAL_REPLAY_FROM : 0;
  $('#tutDots').innerHTML = TUTORIAL_STORY.slice(from, lastPage() + 1).map((_, i) => `<i class="${i + from === tut.page ? 'on' : ''}"></i>`).join('');
}
function afterStory() {
  if (!tut.replay && !state.created) { resetCf(); cf.step = 1; tutShow('create'); renderCreate(); }
  else startTour();
}
function startTour() { tut.step = 0; tutShow('tour'); renderTour(); }

/* 캐릭터 생성: 1) 이름·나이·키워드 2) 이능력(자유 기입)·스테이터스 분배. 모두 F등급·1레벨·100CR·스탯 총합 동일 */
const poolLeft = () => STAT_BASE * STAT_DEFS.length + STAT_POOL - STAT_DEFS.reduce((a, d) => a + cf.stats[d.key], 0);
function renderCreate() {
  const body = $('#tutCreateBody'), t = {};
  STAT_DEFS.forEach(d => { t[d.key] = cf.stats[d.key]; });
  const fx = effects(t);
  $('#tutCreateHead').innerHTML = npcHead() + `<span class="cstep">${cf.step} / 2</span>`;
  if (cf.step === 1) {
    body.innerHTML = `<p class="npc-say">먼저 새 몸의 이름을 정해 주세요. 나이와 키워드는 비워 둬도 괜찮아요. 나중에 설정에서 바꿀 수 있어요.</p>` +
      `<div class="form-row"><label>이름 <em class="req">필수</em></label><input id="ctName" maxlength="12" placeholder="최대 12자" value="${esc(cf.name)}"></div>` +
      `<div class="form-row"><label>나이 <em class="opt">선택</em></label><input id="ctAge" type="number" min="${AGE_MIN}" max="${AGE_MAX}" placeholder="${AGE_MIN}~${AGE_MAX}세 (비우면 20세)" value="${cf.age}"></div>` +
      `<div class="form-row"><label>키워드 <em class="opt">선택</em></label><input id="ctKeywords" maxlength="60" placeholder="쉼표로 구분 (예: 과묵, 정찰)" value="${esc(cf.keywords)}"></div>`;
    $('#tutCreateActions').innerHTML = '<button class="primary" id="ctNext">다음</button>';
  } else {
    body.innerHTML = `<p class="npc-say">이능력은 자유롭게 적어 주세요. (롤플용이라 게임 수치에는 영향이 없어요) 스테이터스는 전부 0에서 시작해요. ${STAT_POOL}포인트를 원하는 곳에 자유롭게 나눠 주세요. (한 곳에 몰아도 돼요) 모든 탐색자의 총합은 같아요.</p>` +
      `<div class="form-row"><label>이능력 이름 <em class="req">필수</em></label><input id="ctAbility" maxlength="20" placeholder="예: 그림자 이동" value="${esc(cf.ability)}"></div>` +
      `<div class="form-row"><label>이능력 설명 <em class="opt">선택</em></label><textarea id="ctAbilityDesc" maxlength="300" placeholder="어떤 능력인지 자유롭게 적어 주세요">${esc(cf.abilityDesc)}</textarea></div>` +
      `<div class="pool">남은 포인트 <b id="ctPool">${poolLeft()}</b><span class="pool-btns"><button id="ctRandom">${icon('casino')} 랜덤 배분</button><button id="ctReset">초기화</button></span></div><div class="ct-stats">` +
      STAT_DEFS.map(d => { const [k, label, sign, unit] = d.fx[0]; return `<div class="ct-stat"><div class="ct-name"><b>${d.name}</b><small>${d.en}</small></div><div class="ct-ctrl"><button data-ct="${d.key}" data-d="-1" aria-label="${d.name} 감소">${icon('remove')}</button><b class="ct-val" id="ctv-${d.key}">${cf.stats[d.key]}</b><button data-ct="${d.key}" data-d="1" aria-label="${d.name} 증가">${icon('add')}</button></div><small class="ct-eff" id="cte-${d.key}">${label} ${sign}${round1(fx[k] * 100)}${unit}</small></div>`; }).join('') + '</div>';
    $('#tutCreateActions').innerHTML = '<button id="ctPrev">이전</button><button class="primary" id="ctDone">생성 완료</button>';
  }
}
function updateCreateStats() {
  const t = {}; STAT_DEFS.forEach(d => { t[d.key] = cf.stats[d.key]; });
  const fx = effects(t);
  $('#ctPool').textContent = poolLeft();
  STAT_DEFS.forEach(d => { const [k, label, sign, unit] = d.fx[0]; $(`#ctv-${d.key}`).textContent = cf.stats[d.key]; $(`#cte-${d.key}`).textContent = `${label} ${sign}${round1(fx[k] * 100)}${unit}`; });
}
$('#tutCreate').addEventListener('input', e => {
  const m = { ctName: 'name', ctAge: 'age', ctKeywords: 'keywords', ctAbility: 'ability', ctAbilityDesc: 'abilityDesc' }[e.target.id];
  if (m) cf[m] = e.target.value;
});
$('#tutCreate').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.ct) {
    const k = b.dataset.ct, d = +b.dataset.d, v = cf.stats[k] + d;
    if (v < STAT_BASE || v > STAT_CAP || (d > 0 && poolLeft() <= 0)) { sfx('error'); return; }
    cf.stats[k] = v; updateCreateStats(); return;
  }
  if (b.id === 'ctRandom' || b.id === 'ctReset') { // 스테이터스 랜덤 배분 / 초기화
    STAT_DEFS.forEach(d => { cf.stats[d.key] = STAT_BASE; });
    if (b.id === 'ctRandom') for (let i = 0; i < STAT_POOL; i++) { const open = STAT_DEFS.filter(d => cf.stats[d.key] < STAT_CAP); cf.stats[open[Math.floor(Math.random() * open.length)].key]++; }
    updateCreateStats(); sfx('ok'); return;
  }
  if (b.id === 'ctNext') {
    if (!cleanText(cf.name, 12)) { toast('이름을 입력하세요.'); sfx('error'); return; }
    if (cf.age !== '' && !(Math.floor(+cf.age) >= AGE_MIN && Math.floor(+cf.age) <= AGE_MAX)) { toast(`나이는 ${AGE_MIN}~${AGE_MAX}세 사이로 입력하세요.`); sfx('error'); return; }
    cf.step = 2; renderCreate();
  } else if (b.id === 'ctPrev') { cf.step = 1; renderCreate(); }
  else if (b.id === 'ctDone') {
    const msg = createCharacter(cf);
    if (msg) { toast(msg); sfx('error'); return; }
    renderProfile(); renderBars(); renderBuffs(true); renderBag(); renderSide(); addLog(`${state.character.name}이(가) 새 몸으로 깨어났습니다.`); sfx('levelup');
    startTour();
  }
});

function renderTour() {
  const st = TUTORIAL_STEPS[tut.step], el = $(st.sel), panel = el.closest('.panel');
  if (panel) panel.classList.remove('collapsed'); // 접힌 패널도 펼쳐서 보여준다 (저장된 접힘 상태는 그대로)
  el.scrollIntoView({ block: 'center', inline: 'nearest' });
  const r = el.getBoundingClientRect(), pad = 5, spot = $('#tutSpot').style;
  spot.left = r.left - pad + 'px'; spot.top = r.top - pad + 'px'; spot.width = r.width + pad * 2 + 'px'; spot.height = r.height + pad * 2 + 'px';
  $('#tutStep').innerHTML = `<span class="npc-mini">${icon(TUTORIAL_NPC.icon)}${TUTORIAL_NPC.name}</span> ${tut.step + 1} / ${TUTORIAL_STEPS.length}`;
  $('#tutTitle').textContent = st.title; $('#tutBody').textContent = st.text;
  $('#tutPrev').disabled = tut.step === 0;
  $('#tutNext').textContent = tut.step === TUTORIAL_STEPS.length - 1 ? (tut.replay ? '완료' : '무기 고르기') : '다음';
  const card = $('#tutCard'), W = window.innerWidth, H = window.innerHeight;
  card.style.cssText = '';
  if (W <= 760) return; // 좁은 화면은 CSS가 아래에 고정
  const cw = card.offsetWidth, ch = card.offsetHeight;
  let left, top = clamp(r.top, 8, H - ch - 8);
  if (r.right + 14 + cw <= W - 8) left = r.right + 14;
  else if (r.left - 14 - cw >= 8) left = r.left - 14 - cw;
  else { left = clamp(r.left + r.width / 2 - cw / 2, 8, W - cw - 8); top = r.bottom + 14 + ch <= H - 8 ? r.bottom + 14 : Math.max(8, r.top - ch - 14); }
  card.style.left = left + 'px'; card.style.top = top + 'px';
}
function endTour() { if (!tut.replay && !state.tutorialDone) openWeapon(); else endTutorial(); }
function openWeapon() {
  weaponPick = null; tutShow('weapon');
  $('#tutWeaponHead').innerHTML = npcHead();
  $('#tutWeaponSay').textContent = '마지막이에요! 무기를 하나 골라 주세요. 성능은 모두 같으니 마음에 드는 걸로요. 보급품(건조 식량 3개, 응급 키트 1개)도 함께 드릴게요.';
  renderWeapons();
}
function renderWeapons() {
  $('#tutWeaponList').innerHTML = WEAPON_NAMES.map(n => `<button class="weapon ${weaponPick === n ? 'on' : ''}" data-weapon="${n}"><span class="w-ic">${icon(ITEMS[n].icon)}</span><b>${ITEMS[n].weapon}</b><small>${esc(ITEMS[n].desc.split('. ')[1] || '')}</small></button>`).join('');
  $('#tutWeaponOk').disabled = !weaponPick;
}
$('#tutWeaponList').addEventListener('click', e => { const b = e.target.closest('[data-weapon]'); if (b) { weaponPick = b.dataset.weapon; renderWeapons(); } });
$('#tutWeaponOk').onclick = () => {
  if (!weaponPick || !chooseWeapon(weaponPick)) return;
  const n = weaponPick; renderBag(); renderProfile(); sfx('levelup'); addLog(`${n}을(를) 받았습니다. 건조 식량 3개, 응급 키트 1개를 지급받았습니다.`);
  endTutorial(`${n}을(를) 받았습니다. 건조 식량 3개와 응급 키트 1개도 지급되었어요!`);
};
function endTutorial(msg) {
  tutShow(null); hideTip();
  if (!tut.replay && !state.tutorialDone) { state.tutorialDone = state.created ? state.tutorialDone : false; }
  save();
  toast(msg || '튜토리얼을 마쳤습니다. 본부에서 임무를 확인해 보세요!');
}
$('#tutNextStory').onclick = () => { if (tut.page < lastPage()) { tut.page++; renderStory(); } else afterStory(); };
$('#tutSkipStory').onclick = afterStory;
$('#tutSkip').onclick = endTour;
$('#tutPrev').onclick = () => { if (tut.step > 0) { tut.step--; renderTour(); } };
$('#tutNext').onclick = () => { if (tut.step < TUTORIAL_STEPS.length - 1) { tut.step++; renderTour(); } else endTour(); };
window.addEventListener('resize', () => { if (tut.mode === 'tour') renderTour(); if (state.dungeon) renderDungeon(); });

/* ---------- 시작 ---------- */
/* ---------- 버그 리포트: 누구나 보낼 수 있고, 읽을 수 있는 사람은 서버의 관리자뿐이다 (서버 연결 전에는 이 브라우저에만 쌓여 개발자 도구에서만 보인다) ---------- */
const BUG_KEY = 'deeplayer-bugs', BUG_MAX = 1000;
const bugCtx = () => ({ v: SAVE_VERSION, loc: state.location, lv: state.character.level, rank: state.character.rank, ua: navigator.userAgent.slice(0, 120), at: new Date().toISOString() });
function openBugReport() {
  modal('버그 리포트', `<p class="tiny">어떤 상황에서 무엇이 이상했는지 적어 주세요. 개발자만 볼 수 있어요. (비밀번호 같은 개인정보는 적지 마세요)</p><textarea id="bugText" maxlength="${BUG_MAX}" rows="6" placeholder="예) 제작 수량을 3개로 고르고 시작했는데 재료가 2개만 줄었어요."></textarea><p class="tiny"><span id="bugCount">0</span>/${BUG_MAX}자 · 현재 위치·레벨·기기 정보가 함께 전송돼요.</p>`,
    [btnClose, '<button class="primary" data-act="bug-send">보내기</button>'], true);
  $('#bugText').addEventListener('input', () => { $('#bugCount').textContent = $('#bugText').value.length; });
}
const localBugs = () => { try { const l = JSON.parse(localStorage.getItem(BUG_KEY)); return Array.isArray(l) ? l.slice(-50) : []; } catch (e) { return []; } };
async function openBugList() { // 관리자·개발자 전용 목록
  let rows = [], note = '';
  try { rows = Cloud.enabled && Cloud.user() ? await Cloud.listBugs() : localBugs().reverse().map((b, i) => ({ id: -1 - i, uname: '(이 기기)', body: b.body, ctx: b.ctx, created_at: b.ctx.at })); }
  catch (e) { note = '불러오지 못했어요. 관리자 계정으로 로그인했는지 확인해 주세요.'; }
  modal(`버그 리포트 (${rows.length})`, note ? `<p class="empty">${esc(note)}</p>` : rows.length ? rows.map(r => `<div class="bug-row"><div class="bug-head"><b>${esc(r.uname || '?')}</b> <small>${esc(String(r.created_at || '').slice(0, 16).replace('T', ' '))} · ${esc(String((r.ctx || {}).loc || ''))} Lv.${esc(String((r.ctx || {}).lv || ''))}</small>${r.id > 0 ? `<button class="flat" data-act="bug-del" data-id="${r.id}">삭제</button>` : ''}</div><p>${esc(r.body)}</p></div>`).join('') : '<p class="empty">접수된 리포트가 없어요.</p>', [btnClose]);
}
/* ---------- 새 버전 알림: 배포할 때 만들어지는 version.json 이 접속 때와 달라지면 알림 채널에 공지한다 ---------- */
let _ver = null, _verNotified = false;
async function fetchVersion() {
  try { const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) return null; const j = await r.json(); return typeof j.v === 'string' ? j.v.slice(0, 64) : null; } catch (e) { return null; }
}
async function checkUpdate() {
  const v = await fetchVersion(); if (!v) return; // 로컬 실행 등 version.json 이 없으면 쓰지 않는다
  if (_ver === null) { _ver = v; return; }
  if (v === _ver || _verNotified) return;
  _verNotified = true;
  state.chats['알림'].push(['업데이트', '게임이 업데이트되었어요! 새로고침(F5, 안 되면 Ctrl+F5)하면 새 버전이 적용돼요.']);
  renderChat(); toast('업데이트되었어요. 새로고침해 주세요.'); sfx('ok');
}
function init() {
  state.chats['알림'] = state.chats['알림'].filter(m => m[0] !== '업데이트'); // 지난 업데이트 공지는 새로고침하면 사라진다
  applyTheme(); applyLayout();
  finishIfDue(); pruneBuffs();
  renderProfile(); renderBars(); renderLeftTab(); renderBag(); renderBuffs(true);
  renderLogs(); renderChat();
  setLocation(state.location);
  if (!state.tutorialDone) startTutorial();
  const clock = () => { $('#clock').textContent = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }); };
  clock();
  setInterval(() => { tick(); clock(); }, 1000);
  checkUpdate(); setInterval(checkUpdate, 5 * 60 * 1000);
  syncNotices(); setInterval(syncNotices, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(); });
}
if (!(Cloud.enabled && !Cloud.user())) init(); // 서버 연결 중 로그인 전이면 게임을 시작하지 않는다 (가입 페이지로 이동 중)

/* 길드 메시지 수신 화면 처리: 알림이 켜져 있으면 알림음과 토스트 */
function onGuildMessage(name, text) {
  const alert = receiveGuildMessage(name, text);
  renderChat();
  if (alert && state.chatTab !== '길드') { sfx('ok'); toast(`[길드] ${name}: ${text.slice(0, 40)}`); }
}
