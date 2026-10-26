/* ==========================================================
   ui.js - 화면 렌더링과 이벤트 처리
   규칙/저장은 core.js, 콘텐츠는 data.js. 버튼은 data-act 속성으로 A 객체의 핸들러에 연결된다.
   ========================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let view = { farmBack: {}, dpan: { x: 0, y: 0 }, dzoom: 1, petBack: {}, phase: 'idle', mult: 0, equipSlot: null, quest: null, target: null }; // 저장하지 않는 임시 화면 상태 (phase: idle | confirm(id))
const resetPhase = () => { view.phase = 'idle'; view.id = null; };

/* ---------- 공통 UI ---------- */
function toast(t) {
  const el = $('#toast');
  el.textContent = t;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2400);
}
const LOG_KEEP = 60;
function addLog(text) {
  state.logs.unshift({ time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }), text });
  state.logs = state.logs.slice(0, LOG_KEEP); // 많이 쌓이면 오래된 것부터 지운다
  renderLogs(); save();
}
function modal(title, body, actions = [], small = false) {
  hideTip(); { const rf = $('#roomFloat'); if (rf) rf.remove(); }
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = body;
  $('#modalActions').innerHTML = actions.join('');
  $('#modal').classList.toggle('small', small); $('#modal').classList.remove('terminal', 'room', 'solo');
  $('#overlay').classList.add('open');
}
const closeModal = () => { view.room = null; if (view.duelRoom) { const id = view.duelRoom; view.duelRoom = null; stopDuelTimers(); if (duelOnline()) Cloud.duelLeave(id).catch(() => {}); } // 대련방 창을 닫으면 방에서 나간다 (시작한 방은 그대로)
  { const rf = $('#roomFloat'); if (rf) rf.remove(); } if (view.mockTimer) { clearInterval(view.mockTimer); view.mockTimer = 0; } if (view.rescueTimer) { clearInterval(view.rescueTimer); view.rescueTimer = 0; } view.rescueAnim = false; $('#overlay').classList.remove('open'); applyTheme(); }; // 저장하지 않은 테마 미리보기는 되돌린다
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
  $('#charMeta').textContent = `LV.${c.level}${c.level >= levelCap() ? ' MAX' : ''}　${c.rank}등급　${c.age}세`;
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
function gainBarsHtml(name, n) { // 소모품 회복량을 HP·기력 막대로 (지금 칸 + 찰 칸을 밝게)
  const u = ITEMS[name] && ITEMS[name].use, v = state.vitals; if (!u || u.warp || u.camp) return '';
  const g = useGain(name, n), row = (lb, cls, cur, max, d) => { const w = clamp(cur / max * 100, 0, 100); return `<div class="bar-row ${d ? 'gaining' : ''}"><b>${lb}</b><div class="bar ${cls}"><span style="width:${w}%"></span>${d ? `<i class="gain" style="left:${w}%;width:${clamp(d / max * 100, 0, 100 - w)}%"></i>` : ''}</div><span class="val">${cur} → ${cur + d}</span></div>`; };
  return `<div class="bars gain-bars">${u.hp ? row('HP', 'hp', v.hp, v.hpMax, g.hp) : ''}${u.sp ? row('기력', 'sp', v.sp, v.spMax, g.sp) : ''}</div>`;
}
const useGainHtml = (name, n) => `<p>${icon('healing')} ${n > 1 ? n + '개 ' : ''}사용하면 <b>${esc(useGainText(name, n))}</b>${useFull(name, n) ? ' <small>(이미 가득 차서 오르지 않아요)</small>' : ''}</p>${gainBarsHtml(name, n)}`;
function renderBars(pv) { // pv={hp,sp}: 소모품을 쓰면 찰 만큼을 막대 위에 밝게 미리 보여 준다(퀵슬롯에 마우스를 올렸을 때)
  const v = state.vitals;
  const maxed = state.character.level >= levelCap();
  const rows = [['HP', 'hp', v.hp, v.hpMax], ['기력', 'sp', v.sp, v.spMax], ['EXP', 'exp', maxed ? 1 : v.exp, maxed ? 1 : expMax(state.character.level)]];
  $('#bars').innerHTML = rows.map(([label, cls, cur, max]) =>
    { const g = pv && pv[cls] > 0 ? pv[cls] : 0, w = clamp(cur / max * 100, 0, 100); return `<div class="bar-row ${g ? 'gaining' : ''}"><b>${label}</b><div class="bar ${cls}"><span style="width:${w}%"></span>${g ? `<i class="gain" style="left:${w}%;width:${clamp(g / max * 100, 0, 100 - w)}%"></i>` : ''}</div><span class="val">${cls === 'exp' && maxed ? 'MAX' : g ? `${cur} → ${cur + g}` : `${cur} / ${max}`}</span></div>`; }).join('');
}

/* 버프 아이콘(프로필 오른쪽 위)과 스테이터스의 효과 목록. 버프가 바뀔 때만 다시 그린다 */
/* 시간제 버프 + 펫(든든한 동안) + 서브잡(상시) */
function allBuffs() {
  const list = activeBuffs(), p = activePet(), j = state.subjob;
  if (p && petFed(p)) list.push({ id: `펫 · ${petName(p)}`, type: 'buff', icon: 'pets', desc: `함께 다니는 펫. 타일 이동 시간 -${Math.round(petBuff(p) * 100)}% · 배부름 ${Math.ceil(petFull(p))}%`, endAt: petEmptyAt(p) });
  if (j) list.push({ id: `서브잡 · ${j.name}`, type: 'buff', icon: 'work', desc: jobActive() ? `Lv.${j.level} ${jobFxText()}` : `Lv.${j.level} 오늘 납품을 마치면 적용: ${jobFxText(true)}`, endAt: jobActive() ? nextKstMidnight(j.lastAt) : 0 });
  { const w = todayWeather(); list.push({ id: `날씨 · ${w.name}`, type: 'buff', icon: w.icon, desc: w.desc, endAt: 0, weather: true }); }
  return list;
}
/* 아이템 툴팁 문장: 설명 + 서브잡 태그 + 판매가 */
const itemTip = (name, mk) => itemLines(name, false, mk).filter(Boolean).join('\n'); // 이름으로 부른다 (mk: 그 제작자 것)
const entryMk = s => (s && s.mk ? Object.keys(s.mk)[0] : '') || ''; // 장비 한 칸의 제작자
const mkShort = mk => (mk ? mk.split(' ').slice(-1)[0] : '이름 없음'); // 칸 안에 짧게: 만든 사람 이름
const itemInfoHtml = (name, mk) => { const [a, b] = itemLines(name, false, mk); return `<span class="it-l1">${esc(a)}</span>${b ? `<span class="it-l2">${esc(b)}</span>` : ''}`; };
function renderBuffs(force) {
  const list = allBuffs(), sig = list.map(b => b.id + b.endAt).join();
  if (!force && sig === renderBuffs.sig) return;
  renderBuffs.sig = sig;
  // 버프·디버프는 종류마다 아이콘 하나씩만 보이고, 나머지는 그 아이콘에 마우스를 올리면 함께 보인다
  const one = t => { const g = list.filter(b => b.type === t); if (!g.length) return '';
    const b = g[0], more = g.slice(1).map(x => `${x.id} — ${x.desc}`).join('\n');
    return `<button class="buff-icon ${b.type}${b.weather ? ' weather' : ''}" data-tip-title="${esc(b.id)}" data-tip-desc="${esc(b.desc)}" ${more ? `data-tip-more="${esc(more)}"` : ''} ${b.endAt ? `data-tip-end="${b.endAt}"` : ''} aria-label="${esc(b.id)}">${icon(b.icon)}${g.length > 1 ? `<i class="buff-count">+${g.length - 1}</i>` : ''}</button>`; };
  $('#buffIcons').innerHTML = one('buff') + one('debuff');
  renderStatus();
}
function masteryPageHtml() { // 스테이터스 3페이지: 숙련을 한 줄씩 (이름 · 레벨 · 진행 막대 · 숙련도). 보너스는 마우스를 올리면 보인다
  return '<div class="mast-list">' + TAG_NAMES.map(t => {
    const m = masteryInfo(t), ic = (JOB_TAGS.find(x => x[0] === t) || [])[1] || 'star', max = m.lv >= MASTERY_MAX, pct = max ? 100 : Math.round(m.cur / m.need * 100);
    return `<div class="mast-row" data-tip-title="${esc(t)} 숙련 Lv.${m.lv}${max ? ' (MAX)' : ''}" data-tip-desc="${esc(masteryText(t) + (max ? '' : `\n다음 레벨까지 ${m.need - m.cur}`))}">${icon(ic)}<b>${esc(t)}</b><em>Lv.${m.lv}</em><div class="bar"><span style="width:${pct}%"></span></div><span class="val">${max ? 'MAX' : `${m.cur}/${m.need}`}</span></div>`;
  }).join('') + '</div>';
}
function combatPageHtml() { // 스테이터스 2페이지: 1단 공격력/방어력 · 2단 이동속도 · 3단 모의전투 (1페이지와 같은 칸 크기)
  const t = totalStats(), fx = effects(t), wa = weaponAtk(), eff = (3 + wa) * (1 + fx.atk + weatherFx().atk), hit = BATTLE_HIT * (1 - fx.evade), ps = petSpeed(), sec = stepSec();
  const w = state.equipment['무기'];
  return '<div class="stat-grid">' +
    `<div class="stat" data-tip-title="공격력" data-tip-desc="기본 3 + 무기 ${wa}에 근력 보정 +${round1(fx.atk * 100)}%가 곱해집니다."><div class="stat-head"><b>공격력</b></div><div class="stat-eff"><span class="eff-l">무기 ${esc(w ? shownName(w) : '맨손')}</span><b class="eff-v">${round1(eff)}</b></div></div>` +
    `<div class="stat" data-tip-title="방어력" data-tip-desc="몬스터의 한 번 공격이 맞을 확률입니다. 기본 ${round1(BATTLE_HIT * 100)}%에서 민첩 보정 -${round1(fx.evade * 100)}%."><div class="stat-head"><b>방어력</b></div><div class="stat-eff"><span class="eff-l">피격 확률</span><b class="eff-v">${round1(hit * 100)}%</b></div></div>` +
    `<div class="stat span2" data-tip-title="이동속도" data-tip-desc="지상에서 한 칸을 가는 데 걸리는 시간입니다. 기본 ${DUNGEON_STEP_SEC}초에서 동행 펫 효과 -${round1(ps * 100)}%가 적용됩니다. 험난한 지형은 시간이 더 걸립니다."><div class="stat-head"><b>이동속도</b></div><div class="stat-eff"><span class="eff-l">한 칸당${ps ? ` · 펫 -${round1(ps * 100)}%` : ''}</span><b class="eff-v">${round1(sec)}초</b></div></div>` +
    `<button class="stat span2 mock-card" data-act="extras-open" data-tip-title="모의전투" data-tip-desc="상대를 골라 전투를 구경해 보세요. 실제 진행에는 영향이 없어요."><div class="stat-head"><b>모의전투</b><span class="stat-plus">${icon('sports_martial_arts')}</span></div><div class="stat-eff"><span>연습 상대와 겨뤄 보기</span></div></button>` +
    '</div>';
}
function remeasureStat() { // 글꼴이 늦게 로드되거나 창 크기·글자 크기가 바뀌어 칸 높이가 달라져도 1·2페이지 높이를 다시 맞춘다
  if (!state.created || !$('#statusBody')) return;
  const p = view.statusPage || 0, gh = () => { const g = $('#statusBody .stat-grid'); return g ? Math.round(g.getBoundingClientRect().height) : 0; };
  view.statH = 0; view.statusPage = 0; renderStatus(); const n0 = gh();
  view.statH = 0; view.statusPage = 1; renderStatus(); const n1 = gh();
  view.statH = 0; view.statusPage = 2; renderStatus(); const n2 = $('#statusBody .mast-list') ? Math.round($('#statusBody .mast-list').getBoundingClientRect().height) : 0;
  view.statH = Math.max(n0, n1, n2); view.statusPage = p; renderStatus(); // 세 페이지 중 가장 큰 쪽 높이로 맞춘다
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasureStat);
{ let _rt; addEventListener('resize', () => { clearTimeout(_rt); _rt = setTimeout(remeasureStat, 150); }); }
function renderStatus() {
  $$('#statusPager button').forEach(b => b.classList.toggle('on', +b.dataset.p === (view.statusPage || 0)));
  if (view.statusPage === 2) { const h = view.statH; $('#statusBody').innerHTML = masteryPageHtml(); if (h) $('#statusBody .mast-list').style.minHeight = h + 'px'; $('#statPoints').classList.toggle('hidden', !state.statPoints); $('#statPoints').textContent = `남은 포인트 ${state.statPoints}`; return; }
  if (view.statusPage === 1) { const h = view.statH; $('#statusBody').innerHTML = combatPageHtml(); if (h) $('#statusBody .stat-grid').style.minHeight = h + 'px'; const g1 = $('#statusBody .stat-grid'), h1 = Math.round(g1.getBoundingClientRect().height); if (h1 > (view.statH || 0)) view.statH = h1; $('#statPoints').classList.toggle('hidden', !state.statPoints); $('#statPoints').textContent = `남은 포인트 ${state.statPoints}`; return; }
  const t = totalStats(), fx = effects(t), dr = view.statDraft || {}, drSum = Object.values(dr).reduce((a, b) => a + b, 0), pts = state.statPoints - drSum;
  $('#statSave').classList.toggle('hidden', !drSum);
  const badge = $('#statPoints');
  badge.textContent = `남은 포인트 ${pts}`;
  badge.classList.toggle('hidden', !pts);
  $('#statusBody').innerHTML = '<div class="stat-grid">' + STAT_DEFS.map(d => {
    const bonus = t[d.key] - state.stats[d.key];
    // 카드마다 효과가 2개(기본 효과 + 추가 효과): 숫자 아래 화살표로 슬라이드쇼처럼 넘겨 본다 (카드 크기는 그대로)
    const bf = STAT_BUFFS.find(x => x.stat === d.key), [k0, l0, s0, u0] = d.fx[0], idx = (view.statSlide && view.statSlide[d.key]) ? 1 : 0;
    const cur = idx ? { label: bf.label, val: `${bf.sign}${round1(fx[bf.key] * 100)}${bf.unit}`, tip: bf.tip } : { label: l0, val: `${s0}${round1(fx[k0] * 100)}${u0}`, tip: d.tip };
    const star = state.character.mainStat === d.key ? `<span class="stat-star" title="주 스탯 (+${MAIN_STAT_BONUS})">★</span>` : state.character.subStat === d.key ? `<span class="stat-star" title="부 스탯 (+${SUB_STAT_BONUS})">☆</span>` : ''; // 주 스탯 ★ · 부 스탯 ☆
    return `<div class="stat" data-tip-title="${d.name} · ${cur.label}" data-tip-desc="${esc(cur.tip)}"><div class="stat-head"><b>${d.name}</b><small>${d.en}</small>${star}<span class="stat-val">${state.stats[d.key] + (dr[d.key] || 0)}${dr[d.key] ? `<em class="draft">+${dr[d.key]}</em>` : ''}${bonus ? `<em class="${bonus < 0 ? 'neg' : ''}">${bonus > 0 ? '+' : ''}${bonus}</em>` : ''}</span>` +
      `${dr[d.key] ? `<button class="stat-plus stat-minus" data-act="stat-down" data-stat="${d.key}" title="되돌리기">${icon('remove')}</button>` : ''}${pts ? `<button class="stat-plus" data-act="stat-up" data-stat="${d.key}" title="포인트 사용 (저장해야 확정)">${icon('add')}</button>` : ''}</div>` +
      `<div class="stat-eff stat-slide"><div class="se-main"><span class="eff-l">${cur.label}</span><b class="eff-v">${cur.val}</b></div><button class="se-next" data-act="stat-slide" data-stat="${d.key}" title="${idx ? '이전 효과' : '다음 효과'} (${idx + 1}/2)" aria-label="${idx ? '이전 효과 보기' : '다음 효과 보기'}">${icon(idx ? 'chevron_left' : 'chevron_right')}<i>${idx + 1}/2</i></button></div></div>`;
  }).join('') + '</div>';
  const g = $('#statusBody .stat-grid'); if (g) { if (view.statH) g.style.minHeight = view.statH + 'px'; const h0 = Math.round(g.getBoundingClientRect().height); if (h0 > (view.statH || 0)) view.statH = h0; }
}

/* ---------- 왼쪽 탭: 장비 / 인벤토리 / 제작 ---------- */
const LEFT_TITLES = { EQUIP: ['장비', 'checkroom'], INVENTORY: ['소지품', 'backpack'], CRAFT: ['제작', 'construction'] };
function invHeight() { // 소지품 탭을 보여 줬을 때의 세로 길이
  const vs = ['#viewInv', '#viewCraft', '#viewEquip'].map(q => $(q)), was = vs.map(v => v.classList.contains('hidden')), cr = vs[1];
  const keep = cr.style.height; cr.style.height = ''; vs[1].classList.add('hidden'); vs[2].classList.add('hidden'); vs[0].classList.remove('hidden');
  const h = Math.round(vs[0].getBoundingClientRect().height);
  vs.forEach((v, i) => v.classList.toggle('hidden', was[i])); cr.style.height = keep;
  return h || 0;
}
function renderLeftTab() {
  $$('[data-ltab]').forEach(b => b.classList.toggle('active', b.dataset.ltab === state.leftTab));
  $('#viewEquip').classList.toggle('hidden', state.leftTab !== 'EQUIP');
  $('#viewInv').classList.toggle('hidden', state.leftTab !== 'INVENTORY');
  $('#viewCraft').classList.toggle('hidden', state.leftTab !== 'CRAFT');
  const [name, ic] = LEFT_TITLES[state.leftTab];
  { const cr = $('#viewCraft'); const h = state.leftTab === 'CRAFT' ? invHeight() : 0; cr.style.height = h ? h + 'px' : ''; cr.style.flex = h ? '0 0 auto' : ''; } // 제작 탭도 소지품 탭과 같은 세로 길이
  $('#leftTitle').textContent = name; $('#leftTitleIcon').textContent = ic;
  $('#leftMeta').textContent = state.leftTab === 'INVENTORY' ? `${usedSlots()} / ${bagCapacity()}` : state.leftTab === 'CRAFT' ? '' : `${Object.values(state.equipment).filter(Boolean).length} / ${EQUIP_SLOTS.length}`;
  $('#craftCount').classList.toggle('hidden', state.leftTab !== 'CRAFT'); $('#craftOnly').classList.toggle('hidden', state.leftTab !== 'CRAFT'); // 제작 탭일 때만 헤더에
}
function equipSlotHtml(slot, big) {
  const n = state.equipment[slot], it = n && ITEMS[n];
  const title = it ? shownName(n) : `${slot} · 비어 있음`, desc = it ? itemTip(n, (state.equipMk || {})[slot] || '') : '눌러서 착용 가능한 아이템을 확인합니다.';
  return `<button class="slot clickable ${big ? 'big' : ''} ${it ? 'filled' : ''} ${view.equipSlot === slot ? 'selected' : ''}" data-act="equip-slot" data-slot="${esc(slot)}" data-tip-title="${esc(title)}" data-tip-desc="${esc(desc)}" aria-label="${esc(slot)}">${it ? icon(it.icon) : `<span class="slot-label">${esc(slot)}</span>`}</button>`;
}
/* 장비 칸 아래: 선택한 칸에 착용 가능한 아이템 (소지품과 같은 칸 UI) */
function renderEquipPick() {
  const slot = view.equipSlot, box = $('#equipPick');
  if (!slot) { box.innerHTML = '<p class="tiny pick-hint">장비 칸을 누르면 착용 가능한 아이템이 여기에 표시됩니다.</p>'; return; }
  const cur = state.equipment[slot], list = state.inventory['장비'].filter(s => ITEMS[s.n].slot === slot);
  const cells = list.map(s => { const mk = entryMk(s); return `<button class="slot clickable filled" data-act="pick-equip" data-item="${esc(s.n)}" data-mk="${esc(mk)}" data-tip-title="${esc(shownName(s.n))}" data-tip-desc="${esc(itemTip(s.n, mk))}" aria-label="${esc(s.n)}">${icon(ITEMS[s.n].icon)}${mk ? `<span class="mk-label">${esc(mkShort(mk))}</span>` : ''}</button>`; });
  while (cells.length < 6) cells.push('<div class="slot" aria-label="빈 슬롯"></div>');
  box.innerHTML = `<div class="pick-head"><b>${esc(slot)}</b><span class="tiny">${cur ? `착용 중: ${esc(cur)}` : '착용 중인 장비 없음'}</span><span class="spacer"></span>${cur ? `<button data-act="unequip" data-slot="${esc(slot)}">해제</button>` : ''}</div>` +
    `<div class="inv-grid">${cells.join('')}</div>${list.length ? '' : '<div class="empty">착용 가능한 아이템이 없습니다.</div>'}`;
}
function renderEquip() {
  $('#equipGrid').innerHTML = EQUIP_SMALL.map(s => equipSlotHtml(s, false)).join('');
  $('#equipBig').innerHTML = EQUIP_BIG.map(s => equipSlotHtml(s, true)).join('');
  const sum = gearMods(); // 착용 장비 + 소지만 해도 적용되는 아이템 + 세트 + 세공을 합산
  const en = {}; Object.values(state.equipment).forEach(n => { const e = n && state.enchants[n]; if (e && (e.k === 'hp' || e.k === 'sp')) en[e.k] = (en[e.k] || 0) + e.v; });
  const chips = [...modText(sum), ...(weaponAtk() ? [`공격력 +${weaponAtk()}`] : []), ...(en.hp ? [`최대 HP +${en.hp}`] : []), ...(en.sp ? [`최대 기력 +${en.sp}`] : [])];
  $('#equipFx').innerHTML = chips.map(c => `<span class="buff">${esc(c)}</span>`).join('') || '<span class="tiny">장착 효과 없음</span>';
  renderEquipPick();
}

function renderInventory() {
  const cap = bagCapacity(), tab = state.invTab;
  const iq = String(view.invQ || '').trim().toLowerCase(); // 소지품 검색: 소지품 안의 물건만 이름으로 찾는다
  const items = (tab ? [tab] : ['장비', '소모품', '재료']).flatMap(t => state.inventory[t]).filter(s => !iq || `${s.n} ${shownName(s.n)}`.toLowerCase().includes(iq));
  $$('[data-inv]').forEach(b => b.classList.toggle('active', b.dataset.inv === tab));
  const pages = Math.max(1, Math.ceil((iq ? items.length : cap) / PAGE_SIZE));
  state.page = clamp(state.page, 1, pages);
  const start = (state.page - 1) * PAGE_SIZE, count = iq ? PAGE_SIZE : Math.min(PAGE_SIZE, cap - start);
  $('#inventoryGrid').innerHTML = Array.from({ length: count }, (_, i) => {
    const s = items[start + i], it = s && ITEMS[s.n];
    return it
      ? (it.tab === '장비'
        ? (() => { const mk = entryMk(s); return `<button class="slot clickable filled" data-act="item" data-item="${esc(s.n)}" data-mk="${esc(mk)}" data-tip-title="${esc(shownName(s.n))}" data-tip-desc="${esc(itemTip(s.n, mk))}" aria-label="${esc(s.n)}">${icon(it.icon)}${mk ? `<span class="mk-label">${esc(mkShort(mk))}</span>` : ''}</button>`; })()
        : `<button class="slot clickable filled ${s.mk ? 'has-mk' : ''}" data-act="item" data-item="${esc(s.n)}" data-tip-title="${esc(shownName(s.n))}" data-tip-desc="${esc(itemTip(s.n))}" aria-label="${esc(s.n)}">${icon(it.icon)}${s.mk ? '<span class="mk-dot" aria-hidden="true"></span>' : ''}${s.q > 1 ? `<span class="qty">${s.q}</span>` : ''}</button>`)
      : '<div class="slot" aria-label="빈 슬롯"></div>';
  }).join('');
  $('#invPage').textContent = `${state.page} / ${pages}`;
  $('#leftMeta').textContent = state.leftTab === 'INVENTORY' ? `${usedSlots()} / ${cap}` : $('#leftMeta').textContent;
  $('#itemCount').textContent = `${usedSlots()} / ${cap}`;
  $('#prevPage').disabled = state.page === 1;
  $('#nextPage').disabled = state.page === pages;
  const hs = JSON.stringify(gearMods()); // 소지만으로 적용되는 아이템이 늘거나 줄면 장비 효과 줄과 스테이터스도 같이 갱신
  if (renderInventory.hs !== hs) { const first = renderInventory.hs === undefined; renderInventory.hs = hs; if (!first) { renderEquip(); renderStatus(); } }
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
/* 레시피에 재료 분류('물고기'·'알'·'과일')가 있으면 어떤 아이템을 쓸지 고를 수 있다. 고르지 않으면 값싼 것부터 자동 */
const groupsOf = rc => Object.keys(rc.mats).filter(n => MAT_GROUPS[n]);
const needsPick = rc => groupsOf(rc).some(g => MAT_GROUPS[g].filter(m => countItem(m) > 0).length > 1);
const curPicks = () => { const o = {}; $$('#modalBody .mat-pick').forEach(s => { if (s.value) o[s.dataset.g] = s.value; }); return o; };
const matPickHtml = (rc, i) => groupsOf(rc).map(g => { const own = MAT_GROUPS[g].filter(m => countItem(m) > 0), sel = (view.matPick || {})[g];
  return `<div class="srow fontrow"><span>${esc(g)} 고르기</span><select class="mat-pick" data-g="${esc(g)}" ${own.length ? '' : 'disabled'}><option value="">자동 (값싼 것부터)</option>${own.map(m => `<option value="${esc(m)}" ${m === sel ? 'selected' : ''}>${esc(m)} ×${countItem(m)}</option>`).join('')}</select></div>`; }).join('');
function openCraftQty(i) {
  view.matPick = Object.fromEntries(Object.entries(view.matPick || {}).filter(([g, m]) => m && MAT_GROUPS[g] && ITEMS[m] && countItem(m) > 0));
  const rc = RECIPES[i], it = ITEMS[rc.out], max = Math.max(1, maxCraft(rc, view.matPick));
  modal(`${rc.out} 제작`, `<div class="nearby-row"><div class="round-avatar">${icon(it.icon)}</div><div class="grow"><strong>${esc(rc.out)}</strong><small class="effect">${esc(itemEffect(rc.out))}</small></div></div>` +
    `<div class="choice-label">몇 개 만들까요? (최대 ${max}개)</div><div class="qty-row"><button data-act="cq-step" data-d="-1" aria-label="하나 줄이기">−</button><input id="cqQty" type="number" min="1" max="${max}" value="1" inputmode="numeric" data-index="${i}" aria-label="제작 개수"><button data-act="cq-step" data-d="1" aria-label="하나 늘리기">＋</button><button data-act="cq-max">최대</button></div><p class="tiny" id="cqInfo"></p>` + matPickHtml(rc, i),
    [btnClose, `<button class="primary" id="cqGo" data-act="craft-go" data-index="${i}">제작 시작</button>`], true);
  cqUpdate();
}
function cqUpdate() {
  const q = $('#cqQty'); if (!q) return;
  const rc = RECIPES[+q.dataset.index], picks = curPicks(); view.matPick = { ...(view.matPick || {}), ...Object.fromEntries(groupsOf(rc).map(g => [g, picks[g] || ''])) };
  const max = maxCraft(rc, picks); q.max = Math.max(1, max); if (+q.value > q.max) q.value = q.max;
  const n = clamp(Math.floor(+q.value) || 1, 1, +q.max), lab = $('#modalBody .choice-label'); if (lab) lab.textContent = `몇 개 만들까요? (최대 ${max}개)`;
  const go = $('#cqGo'); if (go) go.disabled = max < 1;
  $('#cqInfo').textContent = max < 1 ? '고른 재료가 부족합니다.' : `소요 시간 ${fmtTime(craftTotalSec(rc, n) * 1000)} · 재료 ${Object.entries(rc.mats).map(([m, c]) => `${picks[m] || m} ${c * n}`).join(', ')}`;
}
document.addEventListener('change', e => { if (e.target.classList && e.target.classList.contains('mat-pick')) cqUpdate(); if (e.target.id === 'expZone') view.expZone = e.target.value; });
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
  const cq = String(view.craftQ || '').trim().toLowerCase(); // 레시피 검색: 만들 물건 이름이나 재료 이름
  const shown = RECIPES.map((rc, i) => ({ rc, i })).filter(({ rc }) => recipeKnown(rc) && (!tab || craftCat(rc.out) === tab) && (!only || canCraft(rc)) && (!cq || `${rc.out} ${Object.keys(rc.mats).join(' ')}`.toLowerCase().includes(cq)));
  $('#craftCount').textContent = `레시피 ${shown.length}종`;
  $('#craftList').innerHTML = craftJobHtml() + shown.map(({ rc, i }) => {
    const it = ITEMS[rc.out], ok = canCraft(rc) && !state.crafting;
    const mats = Object.entries(rc.mats).map(([n, q]) => `<span class="${matCount(n) >= q ? '' : 'lack'}">${esc(n)} ${matCount(n)}/${q}</span>`).join(' · ');
    return `<div class="recipe"><div class="round-avatar">${icon(it.icon)}</div><div class="grow"><strong>${esc(rc.out)} <em class="tag">${esc(craftCat(rc.out))}</em>${craftField(rc.out) ? ` <em class="tag field">${esc(craftField(rc.out))}</em>` : ''}</strong><small class="effect">${esc(itemEffect(rc.out))}</small><small>제작 시간 ${fmtTime(craftSec(rc) * 1000)} · ${mats}</small></div><button class="primary" data-act="craft" data-index="${i}" ${ok ? '' : 'disabled'}>제작</button></div>`;
  }).join('') + (() => { const n = RECIPES.filter(rc => !recipeKnown(rc)).length; return n ? `<div class="empty">개인실의 '속성학습'(25분)으로 새 레시피를 배울 수 있어요. (남은 ${n}종 · 승급하면 후보가 늘어납니다)</div>` : ''; })() || '<div class="empty">레시피가 없습니다.</div>';
}
const renderBag = () => { renderEquip(); renderInventory(); renderCraft(); renderStatus(); renderLeftTab(); renderQuick(); };

/* ---------- 지도 / 구역 ---------- */
function applyMapTransform() { $('#mapWorld').style.transform = state.dungeon ? (view.dpan.x || view.dpan.y || view.dzoom !== 1 ? `translate(${view.dpan.x}px,${view.dpan.y}px) scale(${view.dzoom})` : 'none') : `translate(${state.pan.x}px,${state.pan.y}px) scale(${state.zoom})`; }
/* 재료 검색: 이름에 검색어가 들어 있는 재료를 얻을 수 있는 지형/구역을 찾는다 */
const matTerrains = (z, q) => z.terrains.map((t, i) => [t, i]).filter(([t]) => [...t.gather, t.rare, ...t.monsters.map(m => m.name)].some(n => n && n.toLowerCase().includes(q))).map(([t, i]) => i); // 재료나 출몰 몬스터 이름으로 찾는다
/* 지도 칸 설명: 같은 지형이라도 칸마다 나타나는 재료·몬스터는 다르므로, 칸 좌표를 주면 그 칸에 실제로 나타나는 것만 보여 준다 (검색·범례는 지형 전체) */
function tileMats(z, t, x, y, seed) {
  const sp = x === undefined ? null : spotAt(z, x, y), gids = [...new Set([...(sp ? sp.fish : []), ...tileGatherIds(z, x, y, seed).map(id => ACTIONS[id] && ACTIONS[id].items && ACTIONS[id].items[0]).filter(Boolean)])]; // 낚시터 물고기와 칸 채집물이 겹치면 한 번만
  const bm = ACTIONS[tileBattleId(z, t, x, y, seed)];
  return `[채집] ${gids.length ? gids.join(' · ') : '없음'}${t.rare ? ` [희귀] ${t.rare}` : ''} [출몰] ${bm && bm.monster ? bm.monster.name : t.monster.name}`;
}
const terrainMats = t => `[채집] ${t.gather.join(' · ')}${t.rare ? ` [희귀] ${t.rare}` : ''} [출몰] ${[...new Set(t.monsters.map(m => m.name))].join(' · ')}`;
const zoneMats = zid => { const z = DANGER_ZONES.find(x => x.id === zid); return z ? [...new Set(z.terrains.flatMap(t => [...t.gather, t.rare, ...t.monsters.map(m => m.name)].filter(Boolean)))] : []; };
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
    const ti = terrainIndex(ch), info = tileInfo(z, ch, x, y, true), me = d.x === x && d.y === y;
    const evDone = ch === 'E' && d.done.includes(eventIndex(z, x, y)), going = dest && dest[0] === x && dest[1] === y;
    const glyph = me ? '<i class="pawn"></i>' : ch === 'S' ? icon('logout') : ch === 'C' ? icon('camping') : ch === 'E' ? icon(evDone ? 'check' : 'priority_high') : ch === '?' ? icon('question_mark') : info.spot ? icon('phishing') : ti >= 0 ? icon(z.terrains[ti].icon) : '';
    const hl = ti >= 0 && mq && matTerrains(z, mq).includes(ti); if (hl) hlCount++;
    const unv = !me && !(state.visited[d.zone] || {})[`${x},${y}`]; // 보이기만 하고 밟아 본 적 없는 칸은 흑백
    const cls = `tile floor ${unv ? 'unvisited' : ''} ${hl ? 'hl' : ''} ${ti >= 0 ? 't' + ti : ''} ${ch === 'C' ? 'camp' : ''} ${info.spot ? 'spot' : ''} ${ch === 'E' ? 'ev' : ''} ${ch === '?' ? 'qm' : ''} ${evDone ? 'done' : ''} ${ch === 'S' ? 'start' : ''} ${me ? 'me' : ''} ${going ? 'going' : ''}`;
    const tip = `data-tip-title="${esc(info.name)}" data-tip-desc="${esc(info.desc + (info.terrain ? ' ' + tileMats(z, info.terrain, x, y, d.seed) : ''))}"`;
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
    const z = zoneOf(d.zone), info = tileInfo(z, tileOf(z, d.x, d.y), d.x, d.y);
    desc = `${info.name} — ${info.desc}`;
    const ch = tileOf(z, d.x, d.y), safe = ch === 'S' || ch === 'C' || ch === '?', dd = tileDifficulty(z, d.x, d.y);
    meta = `미궁 · ${info.name} · 위험도 ${safe ? '안전' : `${(DANGER_LEVELS.find(([lim]) => dd < lim) || DANGER_LEVELS[DANGER_LEVELS.length - 1])[1]} (심도 ${Math.round(dd * 100)}%)`}`; // 지금 칸: 입구에서 멀수록 적이 강하다
    $('#mapMeta').dataset.danger = safe ? 0 : 1 + DANGER_LEVELS.findIndex(([lim]) => dd < lim);
  } else $('#mapMeta').dataset.danger = '';
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
function baitPickHtml() { // 길들일 때 먹일 먹이를 직접 고른다
  const have = {}; baitItems().forEach(n => { have[n] = (have[n] || 0) + 1; });
  const names = Object.keys(have); if (!names.length) return '';
  if (!names.includes(view.bait)) view.bait = names[0];
  return `<div class="row-gap"><label class="tiny" for="tameBait">먹일 먹이</label><select id="tameBait">${names.map(n => `<option value="${esc(n)}" ${n === view.bait ? 'selected' : ''}>${esc(n)} ×${countItem(n)} (친밀도 +${feedGain(n)}${n === PET_FOOD ? ' · 길들이기 +' + Math.round(TAME_FOOD_BONUS * 100) + '%p' : ''})</option>`).join('')}</select></div>`;
}
function bagFullWarn() { sfx('error'); modal('소지품이 가득 찼어요', `<p class="detail-desc">${esc(BAG_FULL_MSG)}</p><p class="tiny">소지품 ${usedSlots()}/${bagCapacity()}칸 · 분실물 보관함 ${state.lostBox.length}/${LOSTBOX_SLOTS}칸</p>`, [btnClose, '<button class="primary" data-act="bagfull-inv">소지품 열기</button>']); }
function askAction(id, target) { const k = ACTIONS[id] && ACTIONS[id].kind; if (['gather', 'battle', 'tame', 'rescue'].includes(k) && bagFull()) { bagFullWarn(); return; } view.phase = 'confirm'; view.id = id; view.mult = 0; view.target = target || null; renderAction(); }
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
const buffText = b => { const ms = BUFFS[b].ms || BUFF_MS; return `${b} (${BUFFS[b].desc.split('. ')[1]}, ${ms >= 3600000 ? ms / 3600000 + '시간' : ms / 60000 + '분'})`; };
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
    g.items.map(id => { const bl = actionBlocked(id), lg = levelGate(id); return `<button data-act="choice" data-choice="${esc(id)}" class="${lg ? 'locked' : ''}" ${disabled || bl ? 'disabled' : ''}${lg ? ` title="${esc(lg)}"` : ''}>${icon(ACTIONS[id].icon)} ${esc(ACTIONS[id].label)}${ACTIONS[id].kind === 'leisure' && leisureTaken() && state.leisure.id === id ? ' <small>(오늘 받음)</small>' : ''}${lg ? ` <small>(Lv.${ACTIONS[id].kind === 'subjob' ? SUBJOB_MIN_LV : PET_MIN_LV}~)</small>` : ''}${bl ? ` <small>(${Math.ceil(bl / 3600000)}시간 뒤)</small>` : ''}</button>`; }).join('') + '</div></div>').join('');
}
const MOVE_KINDS = ['travel', 'step', 'enter', 'leave'];
const runLabel = a => a.kind === 'leisure' ? '즐기기' : MOVE_KINDS.includes(a.kind) ? (a.kind === 'enter' ? '입장' : a.kind === 'leave' ? '퇴장' : '이동') : '실행';
const confirmTitle = a => a.kind === 'leisure' ? `오늘의 여가를 ${a.title}에서 보내시겠습니까?` : a.kind === 'travel' ? `${LOCATIONS[a.to].name}(으)로 이동하시겠습니까?` : a.kind === 'step' ? '이 타일로 이동하시겠습니까?' : a.kind === 'enter' ? `${LOCATIONS[state.location].name}에 입장하시겠습니까?` : a.kind === 'leave' ? '미궁에서 퇴장하시겠습니까?' : `행동 확인 · ${a.title}`;
/* 확인창용 예상 정보. 타일 이동은 목표 칸까지의 경로로 계산한다 */
function previewOf(id, mi) {
  const a = ACTIONS[id];
  if (a.kind !== 'step') return actionPreview(id, mi);
  const m = state.dungeon && view.target ? planMove(...view.target) : { err: '이동할 수 없습니다.' };
  if (m.err) return m;
  const z = zoneOf(state.dungeon.zone), info = tileInfo(z, tileOf(z, ...view.target), ...view.target, true);
  return { time: `${fmtDur(m.sec)} (${m.steps}칸${m.rough ? ` · 험난한 지형 ${m.rough}칸 포함` : ''})`, gain: `${info.name} 도착`, cost: `기력 -${m.sp}`, desc: `${info.name} — ${info.desc}` };
}
/* 본부 전광판: 들어올 때마다 리코가 읽어 주는 문구가 바뀐다 (이벤트 문구가 있으면 그것만) */
const bbPool = () => { const src = BILLBOARD_EVENT.length ? BILLBOARD_EVENT : BILLBOARD; return src.map(x => typeof x === 'string' ? { t: '속보', text: x } : x).filter(x => x && typeof x.text === 'string' && x.text); };
function bbPick() {
  const pool = bbPool(); if (!pool.length) return null;
  let i = Math.floor(Math.random() * pool.length); if (pool.length > 1 && i === view.bbIdx) i = (i + 1) % pool.length;
  view.bbIdx = i; return pool[i];
}
function billboardHtml() {
  if (!view.bbOn || !view.bbLine) { view.bbOn = true; view.bbLine = bbPick(); }
  const b = view.bbLine; if (!b) return '';
  return `<div class="billboard" aria-live="off"><div class="bb-head"><span class="bb-live">● ON AIR</span><span class="bb-ch">${icon('smart_toy')} ${esc(TUTORIAL_NPC.name)} ${esc(b.t || '방송')}</span></div><div class="bb-text" id="bbText">${esc(b.text)}</div></div>`;
}
setInterval(() => { // 본부에 머무는 동안 문구가 가끔 바뀐다 (화면 전체를 다시 그리지 않고 글자만 바꾼다)
  const el = $('#bbText'); if (!el || state.location !== '본부' || state.dungeon || document.hidden) return;
  const b = bbPick(); if (!b) return; view.bbLine = b;
  el.classList.add('bb-out'); setTimeout(() => { const e2 = $('#bbText'); if (!e2) return; e2.textContent = b.text; e2.classList.remove('bb-out'); const ch = $('.bb-ch'); if (ch) ch.innerHTML = `${icon('smart_toy')} ${esc(TUTORIAL_NPC.name)} ${esc(b.t || '방송')}`; }, 300);
}, 14000);
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
      (['battle', 'step', 'trip', 'gather'].includes(a.kind) ? '<div class="battle-log" id="battleLog" aria-live="off"></div>' : '') +
      `<div class="reward-actions">${devBtn()}<button data-act="action-abort">중단</button></div>`;
    $('#choices').innerHTML = choicesHtml(true);
    updateRunning();
    return;
  }
  const d = state.dungeon;
  const lastCard = (state.results || []).map((r, i) => `<div class="last-result"><div class="lr-head"><strong>${icon('assignment_turned_in')} 결과 · ${esc(r.t)}</strong><button data-act="result-close" data-i="${i}" aria-label="닫기">${icon('close')}</button></div><p>${esc(r.text)}</p>` +
    `<div class="reward-list">${chipList(r.gain)}${r.loss.map(c => `<span class="reward-chip bad">${esc(c)}</span>`).join('')}</div></div>`).join('');
  const tinfo = d && tileInfo(zoneOf(d.zone), tileOf(zoneOf(d.zone), d.x, d.y), d.x, d.y);
  let html = d ? `<h3>${icon('explore')} ${esc(loc.name)} · ${esc(tinfo.name)}</h3><p>${esc(tinfo.desc)}</p><p class="tiny">가고 싶은 타일을 누르면 이동 확인창이 뜹니다. 한 칸에 ${DUNGEON_STEP_SEC / 60}분 · 기력 ${DUNGEON_STEP_SP}이 듭니다.</p>`
    : `<h3>${esc(loc.name)}</h3><p>${loc.danger ? '입장하면 타일 미궁을 탐색할 수 있습니다.' : '행동을 선택하면 예상 시간과 보상을 먼저 확인할 수 있습니다.'}</p>`;
  if (!d && state.location === '본부' && view.phase !== 'confirm') html += billboardHtml(); else if (state.location !== '본부') view.bbOn = false;
  if (view.phase === 'confirm') {
    const a = ACTIONS[view.id], todo = a.kind === 'todo', multi = a.kind === 'gather' || a.kind === 'battle', pv = previewOf(view.id, view.mult);
    if (pv.err) { resetPhase(); renderAction(); return; }
    html += `<div class="action-confirm-inline"><div class="cf-head"><strong>${esc(confirmTitle(a))}</strong>${todo ? '' : `<span class="cf-time">${icon('schedule')} ${esc(pv.time)}</span>`}</div><p>${esc(pv.desc || a.action)}</p>` +
      (a.kind === 'tame' ? baitPickHtml() : '') +
      (view.id === '휴식' || view.id === '잠자기' ? `<div class="chips mult">${[['휴식', '30분 휴식'], ['잠자기', '6시간 잠자기']].map(([id, l]) => `<button class="chip ${id === view.id ? 'active' : ''}" data-act="rest-mode" data-id="${id}">${l}</button>`).join('')}</div>` : '') +
      (multi ? `<div class="chips mult">${MULTI_OPTIONS.map((o, i) => `<button class="chip ${i === view.mult ? 'active' : ''}" data-act="mult" data-i="${i}">${o.label}</button>`).join('')}</div>${MULTI_OPTIONS[view.mult].custom ? `<div class="row-gap custom-time"><label class="tiny" for="customMin">직접 입력</label><input id="customMin" type="number" min="${CUSTOM_MIN_MIN}" max="${CUSTOM_MIN_MAX}" step="1" value="${customMultiMin}"><span class="tiny">분 (${CUSTOM_MIN_MIN}분~${CUSTOM_MIN_MAX / 60}시간)</span></div>` : ''}` : '') +
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
    const key = `${a.startAt}|${a.id}|${Math.floor((nowMs() - a.startAt) / 1000 / BATTLE_LOG_SEC)}`; // 묘사는 1분에 한 줄만 바뀌므로 같은 분에는 다시 계산하지 않는다
    if (bl.dataset.key === key) return;
    bl.dataset.key = key;
    const lines = activityLogFor(a).slice(-BATTLE_LOG_SHOW), sig = lines.map(l => l.text).join('|');
    if (bl.dataset.sig !== sig) { bl.dataset.sig = sig; bl.innerHTML = lines.map(l => `<div class="bl ${l.kind}">${esc(l.text)}</div>`).join(''); bl.scrollTop = bl.scrollHeight; }
  }
}

/* ---------- 행동 완료 알림 (탭을 보고 있지 않을 때) ---------- */
const baseTitle = document.title;
function awardTitles() { checkTitles().forEach(t => { if (t === '정점에 다다른' && state.flags.annoMax !== 'done') { state.flags.annoMax = 'pending'; save(); toast('최고 레벨 달성! 축하합니다!'); announceMax(); } addLog(`칭호 획득: ${t}`); toast(`새 칭호를 얻었습니다! 「${t}」 (프로필에서 착용)`); sfx('levelup'); }); }
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
  if (resetBoardQuests()) { renderSide(); toast('완수한 임무가 오전 4시를 지나 다시 받을 수 있게 되었습니다.'); }
  for (let n = 0; petLevelUps.length && n < 5; n++) { const u = petLevelUps.shift(); toast(`${u.name}이(가) Lv.${u.lv}이 되었어요! 이동 속도가 조금 빨라졌습니다.`); addLog(`펫 레벨업: ${u.name} Lv.${u.lv}`); sfx('levelup'); } petLevelUps.length = 0;
  if (petHungerTick()) renderSide();
  { const ate = bowlAutoFeed(); if (ate.length) { renderSide(); if ($('#petBowl')) openPets(true); } } // 먹이통: 배고픈 펫이 알아서 먹는다
  farmRefresh(); petSideRefresh();
  followTick(); partyPlacePush();
  awardTitles();
  newUnlocks().forEach(t => { addLog(t); toast(t); sfx('levelup'); notifyDone(t); });
  state.pets.forEach(p => { const k = p.id + (p.exp ? p.exp.at : 0); if (expReady(p) && !view.petBack[k]) { view.petBack[k] = true; toast(`${petName(p)}이(가) ${p.exp.zone} 탐험에서 돌아왔어요. 개인실에서 수확물을 받으세요.`); sfx('done'); } });
  state.farm.plots.forEach((p, i) => { if (p && plotReady(p) && !p.told) { p.told = true; save(); const msg = `밭 ${i + 1}번의 ${p.crop}이(가) 다 자랐어요. 개인실에서 수확하세요.`; toast(msg); addLog(msg); sfx('done'); notifyDone(msg); } });
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
  if (state.pending && !(view.rescueAnim && $('#overlay').classList.contains('open') && $('#rescueLog'))) A.claim(); // 결과는 확인을 누르지 않아도 바로 받는다 (끝난 행동의 결과 카드는 행동 패널에 남는다)
  if (craftTick()) {
    const name = state.crafting.out, res = collectCraft();
    renderBag(); sfx('done'); notifyDone(`${name} 제작이 완료되었습니다.`);
    if (res) masteryNote(res.mUp);
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
/* 오른쪽 '펫' 탭: 보유 펫과 탐험 중인 펫의 상태를 한눈에 */
const petRoot = el => (el && el.closest && el.closest('#sideView')) || $('#modalBody');
const petLvText = p => `Lv.${p.lv || 1}${(p.lv || 1) >= PET_MAX_LV ? ' (최대)' : ` · EXP ${p.pxp || 0}/${petXpMax(p.lv || 1)}`} · 악세서리 ${p.acc || '없음'}`;
function openPetFeed(i) { // 간식 고르기: 가진 간식을 보여 주고 하나를 골라 준다
  const p = state.pets[i]; if (!p) return;
  const feeds = Object.values(state.inventory).flat().filter(x => ITEMS[x.n].feed).reduce((m, x) => (m[x.n] = (m[x.n] || 0) + x.q, m), {});
  const rows = Object.entries(feeds).sort((a, b) => ITEMS[a[0]].feed - ITEMS[b[0]].feed).map(([n, q]) => {
    const herb = PET_PERS_LIST.find(k => PET_PERS[k].herb === n), same = herb && p.pers === herb;
    return `<div class="nearby-row"><div class="round-avatar">${icon(ITEMS[n].icon)}</div><div class="grow"><strong>${esc(n)} ×${q}</strong><small>친밀도 +${feedGain(n) + (petAcc(p).bond || 0)} · 배부름 +${feedFull(n)}${herb ? ` · 먹이면 성격이 '${esc(herb)}'(으)로 바뀜` : ''}</small></div><button class="primary" data-act="pet-feed-do" data-i="${i}" data-item="${esc(n)}" ${same ? 'disabled title="이미 그 성격이에요"' : ''}>주기</button></div>`;
  }).join('');
  modal(`${petName(p)}에게 간식 주기`, `<p class="tiny">줄 간식을 고르세요. 지금 배부름 ${Math.ceil(petFull(p))}%. 간식을 먹으면 배가 차고 친밀도가 올라요. 배부름은 하루에 걸쳐 줄어들고, 배가 비어 있으면 친밀도가 조금씩 떨어져요. 성격 허브를 주면 성격이 바뀝니다.</p>` + (rows || '<div class="empty">줄 수 있는 간식이 없습니다. 농장에서 작물을 키워 보세요.</div>'), [btnClose], true);
}
function openPetSend(i) { // 탐험 보내기: 구역과 가져갈 먹이를 고르고 '보내기'
  const p = state.pets[i]; if (!p) return;
  if (!view.expZone || !DANGER_ZONES.some(z => z.id === view.expZone)) view.expZone = DANGER_ZONES[0].id;
  const have = [...new Set(baitItems())].map(n => [n, countItem(n)]).filter(([, q]) => q > 0);
  const rows = have.map(([n, q]) => `<div class="nearby-row"><div class="round-avatar">${icon(ITEMS[n].icon)}</div><div class="grow"><strong>${esc(n)} ×${q}</strong><small>${n === PET_FOOD ? '펫 사료' : '간식'}</small></div><button class="primary" data-act="pet-send-do" data-i="${i}" data-item="${esc(n)}">보내기</button></div>`).join('');
  const bw = bowlCheapest(), bowlRow = bw ? `<div class="nearby-row"><div class="round-avatar">${icon('rice_bowl')}</div><div class="grow"><strong>먹이통에서 챙기기</strong><small>먹이통의 ${esc(bw)} 1개를 자동으로 가져가요 (먹이통 ${bowlTotal()}개)</small></div><button class="primary" data-act="pet-send-do" data-i="${i}" data-item="${BOWL_BAIT}">보내기</button></div>` : '';
  modal(`${petName(p)} 탐험 보내기`, `<div class="srow fontrow"><span>탐험 구역</span><select id="expZone">${DANGER_ZONES.map(z => `<option value="${esc(z.id)}" ${z.id === view.expZone ? 'selected' : ''}>${esc(z.name)}</option>`).join('')}</select></div>` +
    `<p class="tiny">가져갈 먹이를 고르고 '보내기'를 누르세요. 먹이 1개가 들고, 24시간 뒤에 그 구역의 재료를 가져와요.</p>` + (bowlRow + rows || '<div class="empty">가져갈 먹이(작물·펫 사료)가 없습니다. 먹이통을 채워 두면 거기서 챙겨 가요.</div>'), [btnClose], true);
}
function openPetAcc(i) { // 펫 악세서리 창: 가진 악세서리를 달거나 벗긴다
  const p = state.pets[i]; if (!p) return;
  const have = Object.keys(PET_ACC).filter(n => countItem(n) > 0);
  const row = (n, on) => `<div class="nearby-row"><div class="round-avatar">${icon(PET_ACC[n].icon)}</div><div class="grow"><strong>${esc(n)}</strong><small>${esc(PET_ACC[n].text)}</small><small>${esc(PET_ACC[n].desc)}</small></div>${on ? `<button data-act="pet-acc-off" data-i="${i}">벗기기</button>` : `<button class="primary" data-act="pet-acc-set" data-i="${i}" data-name="${esc(n)}">달아 주기</button>`}</div>`;
  modal(`${petName(p)}의 악세서리`, `<p class="tiny">잘 쓰이지 않는 재료로 제작한 악세서리를 펫에게 달아 줍니다. 한 번에 하나만 달 수 있고, 벗기면 소지품으로 돌아옵니다. 효과는 함께 다니는 든든한 펫에게만 적용돼요.</p>` +
    `<div class="choice-label">달고 있는 악세서리</div>${p.acc ? row(p.acc, true) : '<div class="empty">달고 있는 악세서리가 없습니다.</div>'}` +
    `<div class="choice-label">가진 악세서리</div>${have.map(n => row(n, false)).join('') || '<div class="empty">가진 악세서리가 없습니다. 제작 탭에서 만들 수 있어요. (레시피는 단련이나 구입으로 배웁니다)</div>'}`, [btnClose], true);
}
const petRefresh = el => { if (el && el.closest && el.closest('#sideView')) renderSide(); else { openPets(true); renderSide(); } };
const petSig = () => state.pets.map(p => `${p.id}|${p.name || ''}|${p.exp ? (expReady(p) ? 'R' : 'E') + p.exp.zone : state.petActive === state.pets.indexOf(p) ? 'A' : 'W'}|${p.bond}|${p.pers}`).join(';') + '|' + state.side + '|' + (view.petSub || '상태') + '|' + view.petNaming + '|' + state.petActive;
const petOrder = () => state.pets.map((_, i) => i).sort((a, b) => (state.petActive === b) - (state.petActive === a) || a - b); // 함께 다니는 펫이 맨 위
function petPanelHtml() {
  const sub = ['상태', '도감', '돌보기'].includes(view.petSub) ? view.petSub : '상태', tabs = `<div class="subtabs">${['상태', '도감', '돌보기'].map(t => `<button class="${t === sub ? 'active' : ''}" data-act="pet-sub" data-sub="${t}">${t}</button>`).join('')}</div>`;
  if (sub === '돌보기') return tabs + petCareHtml(true);
  if (sub === '도감') { const l = codexEntries('펫'); return tabs + `<p class="tiny codex-count">지금 데리고 있는 펫 ${l.filter(e => e.known).length} / ${l.length}</p><div class="codex-list">` + l.map(e => e.known
    ? `<div class="nearby-row"><div class="round-avatar">${icon(e.icon)}</div><div class="grow"><strong>${esc(e.name)}</strong><small>${esc(e.desc)}</small></div></div>`
    : `<div class="nearby-row unknown"><div class="round-avatar">${icon('help')}</div><div class="grow"><strong>???</strong><small>아직 길들이지 못했습니다. 서식지: ${esc(e.where)}</small></div></div>`).join('') + '</div>'; }
  const rows = petOrder().map(i => {
    const p = state.pets[i], sp = PET_SPECIES[p.id], away = !!p.exp, ready = expReady(p), act = state.petActive === i;
    const st = away ? (ready ? `${p.exp.zone} 탐험에서 돌아왔어요!` : `${p.exp.zone} 탐험 중 · <span class="pet-left" data-i="${i}">${fmtLeft(expLeft(p))}</span> 남음`) : act ? '동행 중' : '대기 중';
    const pct = away && !ready ? Math.round((1 - expLeft(p) / (p.exp.ms || PET_EXP_MS)) * 100) : 0;
    return `<div class="nearby-row pet-side-row ${away ? 'away' : ''}"><div class="round-avatar">${icon(sp.icon || 'pets')}</div><div class="grow"><strong>${esc(petName(p))}${p.name ? ` <small>(${esc(sp.name)})</small>` : ''}</strong>` +
      `<small>${st}</small><small>친밀도 ${p.bond}/100 · 성격 ${esc(petPersOf(p))}</small><small>${esc(petLvText(p))}</small>` + (away && !ready ? `<div class="bar thin"><span class="pet-bar" data-i="${i}" style="width:${pct}%"></span></div>` : '') + `</div>` +
      (ready ? `<button class="primary" data-act="pet-claim" data-i="${i}">수확물 받기</button>` : '') + `</div>`;
  }).join('');
  return tabs + rows;
}
function petSideRefresh() { // 매 초: 남은 시간 갱신, 상태가 바뀌면 다시 그린다
  if (state.side !== '펫') return;
  if (view.petSig !== petSig()) { renderSide(); return; }
  $$('#sideView .pet-left').forEach(e => { const p = state.pets[+e.dataset.i]; if (p && p.exp) e.textContent = fmtLeft(expLeft(p)); });
  $$('#sideView .pet-bar').forEach(e => { const p = state.pets[+e.dataset.i]; if (p && p.exp) e.style.width = Math.round((1 - expLeft(p) / (p.exp.ms || PET_EXP_MS)) * 100) + '%'; });
}
function renderSide() {
  $$('[data-side]').forEach(b => b.classList.toggle('active', b.dataset.side === state.side));
  const mine = takenQuests().filter(x => !state.questDone[x.id]), q = mine.length;
  const jt = $('#sideJobTab'); if (jt) jt.classList.toggle('hidden', !state.subjob);
  if (state.side === '서브잡' && !state.subjob) state.side = '임무'; // 서브잡을 그만두면 탭도 사라진다
  const pt = $('#sidePetTab'); if (pt) pt.classList.toggle('hidden', !state.pets.length);
  if (state.side === '펫' && !state.pets.length) state.side = '임무';
  $$('[data-side]').forEach(b => b.classList.toggle('active', b.dataset.side === state.side));
  $('#rightTitle').textContent = state.side; $('#rightTitleIcon').textContent = state.side === '임무' ? 'assignment' : state.side === '서브잡' ? 'work' : state.side === '펫' ? 'pets' : 'groups';
  $('#rightMeta').textContent = state.side === '임무' ? `진행 ${q}` : state.side === '서브잡' ? (state.subjob ? `Lv.${state.subjob.level}` : '') : state.side === '펫' ? `${state.pets.length}마리 · 탐험 ${state.pets.filter(p => p.exp).length}` : `${NEARBY_PLAYERS.length}명`;
  if (state.side === '펫') { $('#sideView').innerHTML = petPanelHtml(); view.petSig = petSig(); return; }
  if (state.side === '서브잡') {
    $('#sideView').innerHTML = jobPanelHtml(true);
    const pk = view.jobPicks || {}; $$('#sideView .job-pick').forEach(i => { if (pk[i.dataset.n] != null) i.value = Math.min(+i.max, pk[i.dataset.n]); }); jobPickSum($('#sideView'));
    return;
  }
  if (state.side === '상황') { renderSituation(); return; }
  const order = [...mine].sort((a, b) => ((b.kind === '메인') - (a.kind === '메인')) || ((questProgress(b).ready ? 1 : 0) - (questProgress(a).ready ? 1 : 0))); // 메인 임무가 맨 위, 그다음 완수 가능한 임무 (같으면 원래 순서)
  if (!order.length) { $('#sideView').innerHTML = '<div class="empty">진행 중인 임무가 없습니다.</div>'; return; }
  $('#sideView').innerHTML = order.map(q => {
    const done = !!state.questDone[q.id], open = view.quest === q.id, pr = questProgress(q);
    const detail = open ? `<div class="quest-detail"><p>${esc(q.desc)}</p><div class="quest-prog"><div class="progress"><span style="width:${pr.cur / pr.max * 100}%"></span></div><small>${esc(pr.text)}</small></div>` +
      `<div class="quest-reward">${esc(rewardText(q))}</div>` +
      `<div class="confirm-actions"><button class="primary" data-act="quest-done" data-id="${q.id}" ${done || !pr.ready ? 'disabled' : ''}>${done ? '완료됨' : '임무 완수'}</button></div></div>` : '';
    return `<div class="quest-item ${open ? 'open' : ''} ${done ? 'done' : ''} ${!done && pr.ready ? 'ready' : ''}"><div class="quest-row ${q.kind === '메인' ? 'main-quest' : ''}" data-act="quest" data-id="${q.id}"><span class="quest-state">${done ? '완료' : pr.ready ? '완수 가능' : '진행 중'}</span><strong>${q.kind === '메인' ? '◆ ' : ''}${esc(q.title)}</strong><small>${esc(q.desc)}</small></div>${detail}</div>`;
  }).join('');
}
function renderSituation() { // '상황' 탭: 접을 수 있는 두 칸 — 주위 대원 / 투두리스트
  const box = $('#sideView'), old = box.querySelector('#todoIn'), keep = old ? { v: old.value, f: document.activeElement === old } : null, so = state.sitOpen || { near: true, todo: true, party: true };
  const head = (k, title, extra) => `<button class="sit-head" data-act="sit-toggle" data-k="${k}" aria-expanded="${!!so[k]}">${icon(so[k] ? 'expand_more' : 'chevron_right')}<b>${title}</b>${extra ? `<small>${extra}</small>` : ''}</button>`;
  const pm = PARTY.members.filter(m => m.name !== state.character.name);
  const nearP = pm.map(m => `<div class="nearby-row"><div class="round-avatar" data-user="${esc(m.name)}">${avatarOf(m.name)}</div><div class="grow"><strong data-user="${esc(m.name)}">${esc(m.name)}</strong><small>파티${m.leader ? ' · 파티장' : ''} · 주위 대원 · ${m.online ? '접속 중' : '오프라인'}</small></div><button data-act="ftrade-open" data-name="${esc(m.name)}">교환</button></div>`).join('');
  const pn = new Set(pm.map(m => m.name)), np = (view.nearby || []).filter(p => !pn.has(p.name));
  const nearSrv = np.map(p => `<div class="nearby-row"><div class="round-avatar" data-user="${esc(p.name)}">${avatarOf(p.name)}</div><div class="grow"><strong data-user="${esc(p.name)}">${esc(p.name)}</strong><small>같은 칸 · 접속 중</small></div><button data-act="ftrade-open" data-name="${esc(p.name)}">교환</button></div>`).join('');
  const nearAll = NEARBY_PLAYERS.length + pm.length + np.length;
  const partyBody = partyOn() ? (PARTY.id ? `<div class="party-list">${PARTY.members.map(m => `<div class="party-row"><span>${icon(m.leader ? 'workspace_premium' : 'person')}</span><b data-user="${esc(m.name)}">${esc(m.name)}</b>${m.leader ? '<em class="tag">파티장</em>' : ''}<small class="party-st">${esc(partyStatus(m))}</small>${partyLeader() && m.uid !== Cloud.userUid ? `<button data-act="party-kick" data-uid="${esc(m.uid)}" data-name="${esc(m.name)}" title="파티에서 내보냅니다">내보내기</button>` : ''}</div>`).join('')}</div>${partyLeader() ? `<div class="party-follow"><button class="${state.partyMove ? 'primary' : ''}" data-act="partymove-toggle" aria-pressed="${state.partyMove}">${icon('groups')} 파티 이동 ${state.partyMove ? '켜짐' : '꺼짐'}</button><small>${esc(state.partyMove ? '동행 모드를 켠 파티원이 내가 움직이면 따라와요.' : '켜야 동행 모드를 켠 파티원이 함께 움직여요.')}${paceSec() < stepSec() - .5 ? esc(` · 이동 속도를 파티에서 가장 빠른 사람에 맞춰 한 칸 ${Math.round(paceSec())}초`) : ''}</small></div>` : `<div class="party-follow"><button class="${state.follow ? 'primary' : ''}" data-act="follow-toggle" aria-pressed="${state.follow}">${icon('directions_walk')} 동행 모드 ${state.follow ? '켜짐' : '꺼짐'}</button><small>${esc(state.follow ? (view.followMsg || '파티장을 기다리는 중이에요.') : '켜 두면 파티장이 파티 이동을 켰을 때 따라가요.')}${paceSec() < stepSec() - .5 ? esc(` · 이동 속도를 파티에서 가장 빠른 사람에 맞춰 한 칸 ${Math.round(paceSec())}초`) : ''}</small></div>`}<div class="party-foot"><small>${PARTY.members.length}/4명 · 파티원은 항상 주위 대원이에요</small><button data-act="party-leave">나가기</button></div>` : '<div class="empty">파티가 없습니다. 친구 창이나 대원 프로필에서 초대해 보세요. (2~4명)</div>')
    + (PARTY.invites.length ? `<div class="party-inv">${PARTY.invites.map(r => `<div class="party-row"><span>${icon('mail')}</span><b>${esc(r.name)}</b><small>의 파티 초대</small><button class="primary" data-act="party-answer" data-id="${r.id}" data-ok="1">수락</button><button data-act="party-answer" data-id="${r.id}" data-ok="0">거절</button></div>`).join('')}</div>` : '') : '<div class="empty">파티는 서버에 로그인하면 쓸 수 있어요.</div>';
  const near = nearP + nearSrv + (NEARBY_PLAYERS.length ? '' : (nearP || nearSrv) ? '' : '<div class="empty">주위에 다른 대원이 없습니다.</div>') + NEARBY_PLAYERS.map(([n, s]) => `<div class="nearby-row"><div class="round-avatar">${icon('person')}</div><div class="grow"><strong>${esc(n)}</strong><small>${esc(LOCATIONS[state.location].name)} · ${esc(s)}</small></div><button data-act="player" data-player="${esc(n)}">정보</button><button data-act="trade-open" data-player="${esc(n)}">교환</button></div>`).join('');
  const doneN = state.todos.filter(t => t.done).length;
  const todo = `<div class="todo-add"><input id="todoIn" maxlength="${TODO_LEN}" placeholder="할 일을 적고 Enter" autocomplete="off"><button class="primary" data-act="todo-add">추가</button></div>` +
    (state.todos.map(t => `<div class="todo-row ${t.done ? 'done' : ''}"><button class="todo-check" data-act="todo-toggle" data-id="${t.id}" role="checkbox" aria-checked="${t.done}" aria-label="${esc(t.t)}">${icon(t.done ? 'check_box' : 'check_box_outline_blank')}</button><span class="todo-t">${esc(t.t)}</span><button class="mini" data-act="todo-del" data-id="${t.id}" aria-label="삭제" title="삭제">${icon('close')}</button></div>`).join('') || '<div class="empty">적어 둔 할 일이 없습니다.</div>') +
    (state.todos.length ? `<div class="todo-foot"><button data-act="todo-all" data-on="1" ${doneN === state.todos.length ? 'disabled' : ''}>${icon('done_all')} 모두 체크</button><button data-act="todo-all" data-on="0" ${doneN ? '' : 'disabled'}>${icon('remove_done')} 모두 해제</button>${doneN ? `<button data-act="todo-clear">완료한 항목 ${doneN}개 지우기</button>` : ''}</div>` : '');
  box.innerHTML = `<div class="sit-sec">${head('party', '파티', PARTY.id ? `${PARTY.members.length}/4명` : PARTY.invites.length ? `초대 ${PARTY.invites.length}` : '')}${so.party ? `<div class="sit-body">${partyBody}</div>` : ''}</div><div class="sit-sec">${head('near', '주위 대원', `${nearAll}명`)}${so.near ? `<div class="sit-body">${near}</div>` : ''}</div><div class="sit-sec">${head('todo', '투두리스트', `${doneN}/${state.todos.length}`)}${so.todo ? `<div class="sit-body">${todo}</div>` : ''}</div>`;
  if (keep) { const n = box.querySelector('#todoIn'); if (n) { n.value = keep.v; if (keep.f) n.focus(); } }
}
function masteryNote(list) { // 숙련 레벨이 오르면 알린다 (list: [[태그, 레벨], ...])
  (list || []).filter(Boolean).forEach(([t, lv]) => { toast(`숙련 「${t}」 Lv.${lv} 달성!`); addLog(`숙련 「${t}」이(가) Lv.${lv}이(가) 되었습니다.`); });
  if (list && list.length) renderStatus();
}
const SYSTEM_SPEAKERS = { '관제 시스템': 'smart_toy', '시스템': 'smart_toy', '공지': 'campaign', '업데이트': 'system_update_alt' };
const FACE_ICONS = ['face', 'face_2', 'face_3', 'face_4', 'face_5', 'face_6'];
const speakerIcon = n => SYSTEM_SPEAKERS[n] || 'person'; // 프로필 이미지가 없는 유저는 모두 같은 사람 모양 아이콘(성별 구분 없음)
/* ---- 대원 아이콘: 각자 설정한 프로필 이미지(서버에 64px로 올려 둔 것)를 보여 주고, 없으면 기본 얼굴 아이콘 ---- */
view.avatars = {}; view.avWant = new Set(); view.chatSrv = { '월드': [], '길드': [], '파티': [], 'RP': [] }; view.chatLast = { '월드': 0, '길드': 0, '파티': 0, 'RP': 0 }; view.partyId = 0;
const CHAT_CH = { '월드': 'world', '길드': 'guild', '파티': 'party', 'RP': 'rp' }, CHAT_CACHE = 'deeplayer-chat', CHAT_KEEP = 60;
(function loadChatCache() { // 새로고침해도 직전 대화가 바로 보이도록 서버 채팅의 최근 글을 이 기기에 남겨 둔다 (아이디가 다르면 무시)
  try {
    const c = JSON.parse(localStorage.getItem(CHAT_CACHE)); if (!c || c.u !== Cloud.user()) return;
    for (const tab of ['월드', '길드', 'RP']) {
      const rows = ((c[tab] || {}).rows || []).filter(r => Array.isArray(r) && Number.isFinite(r[3])).slice(-CHAT_KEEP).map(r => [cleanText(r[0], 12), cleanText(r[1], 200), /^[0-9a-f-]{36}$/i.test(r[2]) ? r[2] : '', r[3], Number.isFinite(r[4]) ? r[4] : 0, /^rank:(?:[A-Z]|MAX)$/.test(r[5] || '') ? r[5] : '']);
      view.chatSrv[tab] = rows; view.chatLast[tab] = rows.length ? rows[rows.length - 1][3] : 0;
    }
  } catch (e) { /* 저장된 대화 없음 */ }
})();
function saveChatCache() { try { localStorage.setItem(CHAT_CACHE, JSON.stringify({ u: Cloud.user(), '월드': { rows: view.chatSrv['월드'].slice(-CHAT_KEEP) }, '길드': { rows: view.chatSrv['길드'].slice(-CHAT_KEEP) }, 'RP': { rows: view.chatSrv['RP'].slice(-CHAT_KEEP) } })); } catch (e) { /* 저장 불가 */ } }
const chatOnline = () => Cloud.enabled && !!Cloud.user();
function avatarOf(name) {
  const n = String(name || ''), mine = n === '나' || (state.character.name && n === state.character.name);
  if (SYSTEM_SPEAKERS[n]) return icon(SYSTEM_SPEAKERS[n]);
  const img = mine ? getAvatar() : view.avatars[n];
  if (img && /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(img)) return `<img src="${esc(img)}" alt="">`;
  if (!mine && chatOnline() && !(n in view.avatars) && n) { view.avWant.add(n); clearTimeout(view.avT); view.avT = setTimeout(fetchAvatars, 250); }
  return icon('person');
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
async function smallAvatar(dataUrl, px = 64, max = 19000) { // 서버에는 64px 작은 이미지(채팅·목록) + 크게 보기용 300px 이미지를 따로 올린다
  const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = dataUrl; });
  const k = Math.min(1, px / Math.max(img.width, img.height, 1)), cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(img.width * k)); cv.height = Math.max(1, Math.round(img.height * k));
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  for (const q of [.8, .7, .5, .35]) { let o = cv.toDataURL('image/webp', q); if (!o.startsWith('data:image/webp')) o = cv.toDataURL('image/jpeg', q); if (o.length <= max) return o; }
  return '';
}
async function syncMyAvatar(clear) { // 내 이미지를 서버와 맞춘다. 이 기기에 이미지가 없으면 서버 것을 받아 온다(지우기는 명시적으로 눌렀을 때만)
  if (!chatOnline()) return;
  try {
    const my = getAvatar();
    if (my) { const sm = await smallAvatar(my); if (sm) { await Cloud.setAvatar(sm); try { const bg = await smallAvatar(my, 300, 88000); if (bg) await Cloud.setAvatarBig(bg); } catch (e) { /* 크게 보기 이미지는 서버 준비 전이면 생략 */ } } return; } // 변환에 실패해 빈 값이 되면 서버 이미지를 지우지 않는다
    if (clear) { await Cloud.setAvatar(''); return; }
    const nm = state.created && state.character.name; if (!nm) return;
    const got = await Cloud.getAvatars([nm]), img = got && got[nm];
    if (typeof img === 'string' && /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(img)) { try { localStorage.setItem(AVATAR_KEY, img); } catch (e) { /* 저장 불가 */ } renderProfile(); renderChat(); }
  } catch (e) { /* 서버 준비 전 */ }
}
async function chatPoll() { // 월드·길드 채팅을 서버에서 가져온다
  if (!chatOnline() || !state.created || document.hidden || view.chatBusy) return;
  view.chatBusy = true; let changed = false;
  try {
    const tabs = [];
    for (const tab of ['월드', '길드', '파티', 'RP']) {
      if (!chatTabOn(tab)) continue; // 꺼 둔 탭은 가져오지 않는다
      if (tab === '길드' && !state.guild) { if (view.chatSrv['길드'].length) { view.chatSrv['길드'] = []; view.chatLast['길드'] = 0; changed = true; } continue; }
      if (tab === '파티' && !PARTY.id) { if (view.chatSrv['파티'].length) { view.chatSrv['파티'] = []; view.chatLast['파티'] = 0; changed = true; } continue; }
      tabs.push(tab);
    }
    let all = null; // 켜 둔 채널을 요청 한 번으로 (서버에 chat_fetch_all 이 없으면 예전처럼 채널마다)
    if (tabs.length && !view._noAll) { try { all = await Cloud.chatFetchAll(Object.fromEntries(tabs.map(t => [CHAT_CH[t], view.chatLast[t]]))); } catch (e) { if (/404|PGRST202|Could not find/i.test(String(e && e.message))) view._noAll = true; } }
    for (const tab of tabs) {
      let rows;
      if (all && typeof all === 'object') rows = Array.isArray(all[CHAT_CH[tab]]) ? all[CHAT_CH[tab]] : [];
      else if (view._noAll) { if (tab === 'RP') continue; try { rows = await Cloud.chatFetch(CHAT_CH[tab], view.chatLast[tab]); } catch (e) { continue; } }
      else continue;
      for (const r of rows) {
        const id = Number(r.id); if (!Number.isFinite(id) || id <= view.chatLast[tab]) continue;
        view.chatLast[tab] = id; view.chatNewAt = nowMs(); view.chatSrv[tab].push([cleanText(r.name, 12) || '?', cleanText(r.body, 200), /^[0-9a-f-]{36}$/i.test(r.uid) ? r.uid : '', id, Date.parse(r.at) || 0, /^rank:(?:[A-Z]|MAX)$/.test(r.sys || '') ? r.sys : '']); changed = true;
        if (r.uid !== Cloud.userUid && state.chatTab !== tab && view.chatReady) { toast(`[${tab}] ${cleanText(r.name, 12)}: ${cleanText(r.body, 40)}`); }
      }
      view.chatSrv[tab] = view.chatSrv[tab].slice(-100);
    }
  } finally { view.chatBusy = false; }
  view.chatReady = true;
  if (changed) saveChatCache();
  if (changed && $('#chatFeed') && CHAT_CH[state.chatTab]) renderChat();
}
function fmtChatTime(ms) { // 오늘이면 '오후 7:35', 다른 날이면 '10/20 오후 7:35'
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const d = new Date(ms), n = new Date(), t = d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
  return d.toDateString() === n.toDateString() ? t : `${d.getMonth() + 1}/${d.getDate()} ${t}`;
}
const partyBarHtml = () => `<span class="chan-info">${icon('group')} ${PARTY.id ? `파티 · ${PARTY.members.map(m => esc(m.name)).join(', ')}` : partyOn() ? '파티 없음' : '서버 로그인 필요'}</span>${PARTY.id ? '<button data-act="party-leave">나가기</button>' : ''}`;
const chatTabOn = k => state.settings.chatTabs[k] !== false;
function renderChat() {
  if (!chatTabOn(state.chatTab)) state.chatTab = CHAT_TABS.find(chatTabOn) || '알림'; // 꺼 둔 탭을 보고 있었다면 켜진 첫 탭으로
  $$('[data-chat]').forEach(b => b.classList.toggle('hidden', !chatTabOn(b.dataset.chat)));
  const tab = state.chatTab, g = state.guild, bar = $('#guildBar');
  bar.classList.toggle('hidden', tab !== '길드' && tab !== '파티');
  if (tab === '파티') bar.innerHTML = partyBarHtml(); else bar.innerHTML = `<span class="chan-info">${icon('groups')} ${g ? `${esc(g.name)} · ${g.members.length + 1}명${g.master ? ' · 길드장' : ''}` : '길드 없음'}</span><button data-act="guild-open">${icon('settings')} ${g ? '관리' : '만들기'}</button>`;
  const writer = tab === '알림' && canNotice(); // 알림은 공지만 받는 읽기 전용 — 개발자 모드가 켜져 있으면 말머리를 달아 공지를 쓸 수 있다
  $('#chatForm').classList.toggle('hidden', tab === '알림' && !writer);
  $('#noticeHead').classList.toggle('hidden', !writer); $('#chatInput').placeholder = writer ? '공지 내용 입력...' : '암호화 메시지 입력...';
  if (tab === '알림') setTray(false);
  $('#noticeNote').classList.toggle('hidden', tab !== '알림' || writer);
  { const pi = todayPatchIndex(), bn = $('#noticeBanner'); bn.classList.toggle('hidden', tab !== '알림' || pi < 0); bn.dataset.post = pi; }
  $$('[data-chat]').forEach(b => b.classList.toggle('active', b.dataset.chat === state.chatTab));
  { const bt = $('.bell-tab'); if (bt && bt.offsetHeight) bt.style.width = bt.offsetHeight + 'px'; } // 알림 벨 버튼은 정사각형
  { const noti = tab === '알림'; $('#emojiBtn').classList.toggle('hidden', noti); $('#diceBtn').classList.toggle('hidden', noti); if (noti) setTray(false); } // 알림 탭에서는 이모티콘·주사위를 쓸 수 없다
  const feedHtml = (chatOnline() && CHAT_CH[state.chatTab] ? view.chatSrv[state.chatTab] : (state.chats[state.chatTab] || [])).map((row) => {
    const [n, m] = row, srv = chatOnline() && CHAT_CH[state.chatTab], uid = srv ? row[2] : '', at = srv ? row[4] : row[2], tm = fmtChatTime(at);
    if (srv && row[5]) return `<div class="msg-sys" role="status">${icon('workspace_premium')}<span>${esc(m)}</span></div>`; // 승급 축하 같은 시스템 공지: 가운데 정렬
    const st = /^\[(.+)\]$/.exec(m), sticker = st && (STICKERS.find(x => x[0] === st[1]) || STICKERS_OLD.find(x => x[0] === st[1]));
    const body = sticker ? `<div class="bubble sticker-msg" title="${esc(sticker[0])}">${icon(sticker[1])}</div>` : `<div class="bubble">${esc(m)}</div>`;
    const mine = n === '나' || (!!uid && uid === Cloud.userUid), who = mine ? (state.character.name || '나') : n;
    return `<div class="msg ${mine ? 'mine' : 'other'}"><div class="msg-ava" data-user="${esc(mine ? '나' : n)}">${avatarOf(mine ? '나' : n)}</div><div class="msg-main"><span class="msg-name" data-user="${esc(mine ? '나' : n)}">${esc(who)}</span>${tm ? `<time class="msg-time">${esc(tm)}</time>` : ''}${state.chatTab === '알림' && canNotice() && (view.nIds || {})[n + '\n' + m] ? `<button class="msg-del" data-act="notice-del" data-id="${(view.nIds || {})[n + '\n' + m]}" title="이 공지 삭제" aria-label="공지 삭제">${icon('delete')}</button>` : ''}${body}</div></div>`; // 컴팩트 한 줄 형식: 아이콘 · 이름 · 내용 (내 이름은 색이 다르다)
  }).join('');
  const feed = $('#chatFeed'); if (feed.dataset.tab !== tab || view.chatHtml !== feedHtml) { view.chatHtml = feedHtml; feed.dataset.tab = tab; feed.innerHTML = feedHtml; feed.scrollTop = feed.scrollHeight; } // 바뀐 게 없으면 다시 그리지 않는다 (오래 켜 둘 때 이미지 다시 읽기 방지)
}
/* 게시글 본문: 줄 맨 앞의 [말머리]는 포인트 색으로 */
const postHtml = text => esc(text).replace(/(^|\n)\[([^\]\n]{1,12})\]/g, (m, br, t) => `${br}<b class="head-tag">[${t}]</b>`);
function openBoard(name, at = 0) {
  const posts = POSTS[name] || [], k = clamp(at, 0, posts.length - 1);
  modal(name, `<div class="post-layout"><div class="post-list">${posts.map((p, i) => `<button class="post-item ${i === k ? 'active' : ''}" data-act="post" data-board="${esc(name)}" data-post="${i}">${esc(p[0])}</button>`).join('')}</div>` +
    `<article class="post-detail" id="postDetail"><h3>${esc(posts[k][0])}</h3><p>${postHtml(posts[k][1])}</p></article></div>`, [btnClose]);
}
/* 오늘(한국 시간) 날짜의 패치노트가 있으면 그 글의 번호 (없으면 -1) */
function todayPatchIndex() {
  const d = new Date(Date.now() + 9 * 3600000), tag = `업데이트 · ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
  return (POSTS['공지'] || []).findIndex(p => p[0] === tag);
}

/* ---------- 서버 저장 (js/cloud.js 의 CLOUD 설정이 채워져 있을 때만 나타난다) ---------- */
let _cloudTimer = 0, _cloudBlocked = false;
function cloudSchedule() {
  if (!Cloud.enabled || !Cloud.user() || _cloudBlocked || _cloudTimer) return;
  _cloudTimer = setTimeout(cloudAutoPush, 20000);
}
/* 이 기기에서 사람이 직접 한 조작 시각(자동 저장·틱은 포함하지 않는다)과 서버와 마지막으로 맞춘 시각: 다른 기기의 진행을 덮어써도 되는지 가른다 */
const LS_ACT = 'deeplayer-lastact', LS_SYNC = 'deeplayer-syncedat';
const lsNum = k => { try { return +localStorage.getItem(k) || 0; } catch (e) { return 0; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, String(v)); } catch (e) { /* 저장 불가 */ } };
let _lastAct = lsNum(LS_ACT), _actW = 0;
const markAct = () => { _lastAct = Date.now(); if (_lastAct - _actW > 4000) { _actW = _lastAct; lsSet(LS_ACT, _lastAct); } };
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, markAct, true));
const cloudDirty = () => !lsNum(LS_SYNC) || _lastAct > lsNum(LS_SYNC); // 서버와 맞춘 기록이 없으면 안전하게 '바뀐 것'으로 본다
/* 한 번에 한 기기: 이 브라우저의 기기 번호. 서버 세이브의 __dev 가 다른 기기 번호면 새 기기가 접속한 것이다 */
const DEV_KEY = 'deeplayer-device';
const DEV = (() => { try { let v = localStorage.getItem(DEV_KEY); if (!/^[0-9a-z]{10,24}$/.test(v || '')) { v = Array.from(crypto.getRandomValues(new Uint8Array(10)), b => (b % 36).toString(36)).join(''); localStorage.setItem(DEV_KEY, v); } return v; } catch (e) { return 'nodev' + Math.random().toString(36).slice(2, 10); } })();
let _claimed = false, _locked = false;
function lockDevice() {
  if (_locked) return; _locked = true; window.__locked = true;
  if (_cloudTimer) { clearTimeout(_cloudTimer); _cloudTimer = 0; }
  const el = document.createElement('div'); el.id = 'devLock';
  el.innerHTML = `<div class="dev-card"><h3>${icon('devices')} 다른 기기에서 접속 중이에요</h3><p>한 번에 한 기기에서만 플레이할 수 있어요.<br>이 화면은 잠시 멈췄습니다.</p><button class="primary" id="devTake">이 기기에서 계속하기</button><p class="tiny">누르면 서버의 최신 진행을 불러오고, 다른 기기는 멈춥니다.</p></div>`;
  document.body.appendChild(el);
  $('#devTake').onclick = async () => { $('#devTake').disabled = true; try { const s = await Cloud.pull(); if (s && s.data) { window.__locked = false; cloudApply(s.data, s.rev); } else { $('#devTake').disabled = false; } } catch (e) { $('#devTake').disabled = false; toast('서버에 연결하지 못했어요.'); } };
}
let _avCache = { src: '', out: '' };
async function cloudPayload() { // 서버 세이브에 64px 프로필 이미지를 함께 싣는다: 다른 기기에서 서버 불러오기만 해도 이미지가 따라온다
  const d = JSON.parse(JSON.stringify(state)), my = getAvatar(); d.__dev = DEV;
  if (my) { try { if (_avCache.src !== my) _avCache = { src: my, out: await smallAvatar(my) }; if (_avCache.out) d.__avatar = _avCache.out; } catch (e) { /* 이미지 없이 저장 */ } }
  return d;
}
async function cloudPushNow() { // 지금 서버에 저장. → { ok } | { ok:false, skip:true }
  if (!Cloud.enabled || !Cloud.user() || !state.created || window.__noSave || _locked) return { ok: false, skip: true };
  const t = Date.now(), d = await cloudPayload();
  const r = await Cloud.push(d);
  if (r && r.ok) { lsSet(LS_SYNC, t); _claimed = true; }
  return r || { ok: false };
}
async function cloudAutoPush() {
  _cloudTimer = 0;
  if (!state.created) return; // 캐릭터를 아직 만들지 않은 빈 상태로 서버 진행을 덮어쓰지 않는다
  try {
    const r = await cloudPushNow();
    if (!r.ok && !r.skip) { _cloudBlocked = true; cloudSync(true); }
  } catch (e) { /* 오프라인: 다음 저장 때 다시 시도 */ }
}
const AV_RE = /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/;
function cloudApply(data, rev) { // 서버 세이브로 교체하고 다시 시작
  data = JSON.parse(JSON.stringify(data));
  const av = data.__avatar; delete data.__avatar; delete data.__dev;
  if (typeof av === 'string' && av.length < 40000 && AV_RE.test(av) && !getAvatar()) { try { localStorage.setItem(AVATAR_KEY, av); } catch (e) { /* 저장 불가 */ } }
  if (state.created && Array.isArray(data.mail)) { // 이 기기에만 있는 서버 메일(서버 보관함에서는 이미 지워짐)은 잃지 않게 합친다
    const have = new Set(data.mail.map(m => m && m.sid).filter(Boolean)), mine = state.mail.filter(m => m.sid && !have.has(m.sid));
    if (mine.length) { let seq = Math.max(intIn(data.mailSeq, 1, 999999999, 1), ...data.mail.map(m => (m && +m.id) || 0).map(n => n + 1)); data.mail = [...data.mail, ...mine.map(m => ({ ...m, id: seq++ }))]; data.mailSeq = seq; }
  }
  if (Number.isFinite(rev)) Cloud.setRev(rev);
  if (state.created && cloudDirty()) { try { localStorage.setItem('deeplayer-replaced', JSON.stringify(state)); } catch (e) { /* 보관 불가 */ } } // 덮어쓰기 직전의 이 기기 진행을 한 번 보관
  lsSet(LS_SYNC, Date.now()); lsSet(LS_ACT, 0); _lastAct = 0;
  window.__noSave = true;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* 저장 불가 */ }
  location.reload();
}
/* 다른 기기(PC↔폰)에서 더 새로 저장했는지 확인한다. 이 기기에서 한 조작이 없으면 조용히 서버 진행으로 바꾸고, 있으면 어느 쪽을 쓸지 묻는다 */
let _syncAt = 0, _syncBusy = false;
let _noHead = false; // 서버에 save_head 가 아직 없으면(옛 SQL) 예전처럼 전체를 받는다
async function cloudSync(force) {
  if (!Cloud.enabled || !Cloud.user() || !state.created || _syncBusy || window.__noSave || _locked) return;
  if (!force && Date.now() - _syncAt < 20000) return;
  _syncAt = Date.now(); _syncBusy = true;
  try {
    if (!_noHead) { // 먼저 rev·기기 번호만 확인하고, 서버가 더 새롭거나 다른 기기가 들어왔을 때만 세이브 전체를 받는다 (서버 부담·데이터 사용량 감소)
      let h = null; try { h = await Cloud.head(); } catch (e) { if (/save_head|404|PGRST/i.test(String(e && e.message))) _noHead = true; else throw e; }
      if (!_noHead) {
        if (!h || !h.created) return;
        const otherDev = _claimed && h.dev && h.dev !== DEV;
        if (!otherDev && !(h.rev > Cloud.rev())) { if (!_claimed) { if (h.dev === DEV) _claimed = true; else await cloudPushNow(); } return; }
      }
    }
    const s = await Cloud.pull(true);
    if (!s || !s.data || !s.data.created) return;
    if (_claimed && s.data.__dev && s.data.__dev !== DEV) { lockDevice(); return; } // 다른 기기가 새로 접속함
    if (!(s.rev > Cloud.rev())) { if (!_claimed) { if (s.data.__dev === DEV) _claimed = true; else await cloudPushNow(); } return; } // 서버와 같은 버전이면 이 기기가 현재 기기가 된다
    cloudApply(s.data, s.rev); // 서버가 더 새로우면 항상 서버 진행으로 (이 기기에서 바뀐 것이 있었다면 apply 가 만약을 위해 따로 보관)
  } catch (e) { /* 오프라인 */ } finally { _syncBusy = false; }
}
function cloudGroupHtml() {
  const u = Cloud.enabled && Cloud.user();
  const local = '<button data-act="local-save">로컬 저장</button><button data-act="local-load">로컬 불러오기</button>';
  if (!u) return `<div class="setting-group"><h3>저장</h3><div class="cloudrow"><span class="tiny">세이브 파일로 저장하고 불러올 수 있어요.</span>${local}</div></div>`;
  return `<div class="setting-group"><h3>서버 저장</h3><div class="cloudrow"><span><b>${esc(u)}</b> 로그인됨</span><button data-act="cloud-push">저장</button><button data-act="cloud-pull">서버 불러오기</button>${local}</div><div class="cloudrow"><button data-act="cloud-backups">서버 백업</button><span class="tiny">서버 저장이 덮어써지기 전 진행을 최대 12개 보관해요.</span></div><p class="tiny">진행은 20초 정도마다 자동으로 서버에 저장돼요.${_cloudBlocked ? ' (⚠ 다른 기기가 먼저 저장해 자동 저장이 멈춰 있어요)' : ''} 로컬 저장은 이 기기에 세이브 파일(.json)로 내려받아요.</p></div>`;
}
async function cloudAfterLogin() { // 로그인 직후: 서버에 세이브가 있으면 어느 쪽을 쓸지 묻는다
  const s = await Cloud.pull();
  if (!s) { if (!state.created) { toast('서버에 저장된 진행이 없어요.'); return; } await cloudPushNow(); toast('이 기기의 진행을 서버에 저장했어요.'); openSettings(); return; }
  modal('서버 저장 발견', `<p>서버에 저장된 진행이 있어요. (${esc(String(s.at || '').slice(0, 16).replace('T', ' '))})<br>어느 쪽을 쓸까요?</p><p class="tiny">서버 것을 쓰면 이 기기의 현재 진행은 사라집니다.</p>`,
    ['<button data-act="cloud-use-server" class="primary">서버 진행 불러오기</button>', '<button data-act="cloud-use-local">이 기기 진행으로 덮어쓰기</button>']);
  view.cloudServer = s;
}

/* ---------- 서버 백업 목록 (supabase/backups.sql) ---------- */
const BACKUP_KIND = { auto: '자동', guard: '안전장치', manual: '수동' };
async function openBackups() {
  modal('서버 백업', '<p class="tiny">불러오는 중…</p>', ['<button data-act="close">닫기</button>'], true);
  let list = [];
  try { list = await Cloud.listBackups(); }
  catch (e) { modal('서버 백업', '<p class="detail-desc">백업 목록을 불러오지 못했어요. 서버에 <b>supabase/backups.sql</b>을 한 번 실행해야 해요.</p>', ['<button data-act="close">닫기</button>'], true); return; }
  const when = at => { const d = new Date(at); return Number.isNaN(+d) ? '' : d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }); };
  const rows = list.map(b => `<div class="nearby-row"><div class="grow"><strong>${esc(when(b.at))} <span class="tag">${esc(BACKUP_KIND[b.kind] || '자동')}</span></strong><small>${esc(cleanText(b.name, 12) || '-')} · Lv.${esc(String(intIn(b.level, 0, 999, 0)))} · ${esc(String(intIn(b.money, 0, 99999999, 0)))} CR</small></div><button data-act="backup-restore" data-id="${esc(String(intIn(b.id, 0, 9e15, 0)))}">불러오기</button><button class="danger" data-act="backup-delete" data-id="${esc(String(intIn(b.id, 0, 9e15, 0)))}">삭제</button></div>`).join('');
  modal('서버 백업', `<p class="tiny">서버 저장이 덮어써지기 전의 진행을 유저별로 최대 12개까지 보관해요. (6시간마다 자동, 캐릭터가 사라지는 덮어쓰기 직전에는 항상)</p>` +
    (rows || '<div class="empty">아직 백업이 없어요. 서버에 저장된 진행이 있다면 \'지금 백업\'을 눌러 보세요.</div>'),
    ['<button data-act="close">닫기</button>', '<button class="primary" data-act="backup-now">지금 백업</button>'], true);
}
/* 이 기기의 저장이 비어 있는데(새 기기·저장 손실) 서버에 진행이 있으면 먼저 알려 준다: 모르고 새 캐릭터를 만들어 덮어쓰지 않도록 */
async function cloudRecover() {
  try {
    const s = await Cloud.pull();
    if (s && s.data && s.data.created) {
      view.cloudServer = s;
      modal('서버 저장 발견', `<p>이 기기에는 진행이 없지만, 서버에 저장된 진행이 있어요. (${esc(String(s.at || '').slice(0, 16).replace('T', ' '))})</p><p class="tiny">새로 시작하면 서버의 기존 진행은 새 캐릭터로 덮어써질 수 있어요.</p>`,
        ['<button data-act="cloud-use-server" class="primary">서버 진행 불러오기</button>', '<button data-act="cloud-fresh">새로 시작하기</button>']);
      return;
    }
  } catch (e) { /* 서버를 못 읽으면 그냥 시작 */ }
  startTutorial();
}
/* ---------- 설정 (소리는 한 묶음, 컴팩트) ---------- */
const snd = (id, ic, label, on) => `<label class="switch snd-switch"><span>${icon(ic)} ${label}</span><input id="${id}" type="checkbox" role="switch" ${on ? 'checked' : ''}><i></i></label>`;
const sw = (id, label, on, cls = '', dis = '') => `<label class="switch ${cls}"><span>${label}</span><input id="${id}" type="checkbox" role="switch" ${on ? 'checked' : ''} ${dis}><i></i></label>`;
/* 설정 창의 값을 지금 바로 적용하고 저장한다. 채팅 탭이 모두 꺼지는 등 잘못된 값이면 false */
function applySettingsNow() {
  if (!$('#bgmOn')) return false;
  const ctabs = Object.fromEntries(CHAT_TABS.map(k => [k, $('#ctab_' + k) ? $('#ctab_' + k).checked : true]));
  if (!CHAT_TABS.some(k => ctabs[k])) { toast('채팅 탭은 최소 한 개는 켜 두어야 해요.'); sfx('error'); CHAT_TABS.forEach(k => { if ($('#ctab_' + k)) $('#ctab_' + k).checked = !!state.settings.chatTabs[k]; }); return false; }
  state.settings = { chatTabs: ctabs, bgmOn: $('#bgmOn').checked, bgmVolume: +$('#bgmVolume').value, clickOn: $('#clickOn').checked, alertOn: $('#alertOn').checked, sfxVolume: +$('#sfxVolume').value,
    notify: $('#notifyOn').checked, guildAlert: $('#guildAlertOn').checked, cursor: $('#cursorOn').checked, quickBar: $('#quickBarOn') ? $('#quickBarOn').checked : state.settings.quickBar !== false, theme: $('#themeSelect').value, customBase: $('#customBase').value, customAccent: $('#customAccent').value, fontSize: $('#fontSize').value };
  if (state.settings.notify && window.Notification && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (e) { /* 알림 불가 */ } }
  applyTheme(); applyBgm(); renderChat(); renderQuick(); save();
  return true;
}
function openSettings() {
  const st = state.settings;
  const opt = (v, l, cur) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`;
  modal('환경 설정',
    `<p class="tiny settings-note">설정은 바꾸는 즉시 적용되고 저장돼요.</p><div class="setting-group"><h3>소리</h3>` +
    `<div class="snd-card">${snd('bgmOn', 'music_note', '배경음악', st.bgmOn)}<div class="snd-slider">${icon('volume_down')}<input id="bgmVolume" type="range" min="0" max="100" value="${st.bgmVolume}" aria-label="배경음악 크기"><b id="bgmValue">${st.bgmVolume}%</b></div></div>` +
    `<div class="snd-card"><div class="snd-pair">${snd('clickOn', 'ads_click', '클릭음', st.clickOn)}${snd('alertOn', 'notifications_active', '알림음', st.alertOn)}</div>` +
    `<div class="snd-slider">${icon('volume_down')}<input id="sfxVolume" type="range" min="0" max="100" value="${st.sfxVolume}" aria-label="효과음 크기"><b id="sfxValue">${st.sfxVolume}%</b></div></div></div>` +
    `<div class="setting-group"><h3>표시</h3>${sw('cursorOn', '사용자 지정 커서', st.cursor)}${sw('quickBarOn', '퀵슬롯 표시 (넓은 화면에서만)', st.quickBar !== false)}<div class="srow fontrow"><span>글자 크기</span><select id="fontSize">${opt('s', '작게', st.fontSize)}${opt('m', '보통', st.fontSize)}${opt('l', '크게', st.fontSize)}${opt('xl', '아주 크게', st.fontSize)}</select></div><div class="row-gap ui-reset-row"><button data-act="ui-reset">${icon('restart_alt')} UI 기본값으로 되돌리기</button><span class="tiny">패널 폭·높이, 접은 패널, 지도 확대, 글자 크기, 커서를 처음 상태로 돌려요.</span></div></div>` +
    `<div class="setting-group"><h3>튜토리얼</h3><div class="row-gap"><button data-act="tutorial-replay">튜토리얼 다시 보기</button></div></div>` +
    cloudGroupHtml() +
    `<div class="setting-group"><h3>채팅창 탭</h3>${CHAT_TABS.map(k => sw('ctab_' + k, `${k} 탭 표시`, st.chatTabs[k])).join('')}<p class="tiny">끈 탭은 채팅창에서 사라지고, 그 채널의 새 메시지 알림도 오지 않아요. 최소 한 개는 켜 두어야 해요.</p></div>` +
    `<div class="setting-group"><h3>알림</h3>${sw('notifyOn', '다른 탭을 보고 있을 때 행동 완료 알림', st.notify)}${sw('guildAlertOn', '길드 채팅 알림 (새 메시지가 오면 알림음과 알림창)', st.guildAlert)}</div>` +
    `<div class="setting-group"><h3>테마</h3><div class="srow theme"><select id="themeSelect">${opt('light', '라이트', st.theme)}${opt('dark', '다크', st.theme)}${opt('custom', '사용자 설정', st.theme)}</select>` +
    `<span id="customOpts" class="${st.theme === 'custom' ? '' : 'hidden'}"><select id="customBase">${opt('light', '라이트 기반', st.customBase)}${opt('dark', '다크 기반', st.customBase)}</select><input id="customAccent" type="color" value="${esc(st.customAccent)}" title="강조 색상"></span></div></div>` +
    (window.DEV ? `<details class="setting-group dev-fold" id="devFold"><summary>개발자</summary><div class="row-gap"><span class="tiny">개발자 도구가 켜져 있습니다.</span><button data-act="dev-open">개발자 도구 열기</button><button data-act="bug-list">버그 리포트 보기</button></div></details>` : ''),
    [btnClose], true);
}

/* ---------- 도감: 구역 / 아이템 / 몬스터 / 레시피 (서브 분류 칩) ---------- */
const CODEX_BASE_TABS = ['구역', '아이템', '몬스터', '펫', '레시피', '칭호'];
const codexTabs = () => Object.keys(state.journals || {}).length ? [...CODEX_BASE_TABS, '저널'] : CODEX_BASE_TABS; // 저널은 하나라도 얻은 뒤에야 탭이 보인다 (히든)
const CODEX_ITEM_SUBS = ['장비', '요리', '낚시', '소모품', '재료']; // 도감 아이템 분류 (소모품은 요리를 뺀 나머지)
const CODEX_SUBS = { '구역': ['공중', '지상', '지형'], '아이템': CODEX_ITEM_SUBS, '몬스터': MONSTER_KINDS, '펫': [], '레시피': [], '칭호': [], '저널': [] };
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
  Object.keys(SHOPS).forEach(k => shopRows(k).forEach(([n, pr]) => (sh[n] = sh[n] || []).push([k, pr])));
  PERS_SEEDS.forEach(n => put(n, '채집 중 아주 드물게'));
  GACHA_SETS.forEach(g => g.prizes.forEach(pr => { if (pr.item) put(pr.item[0], '뽑기 경품'); }));
  Object.entries(sh).forEach(([n, l]) => put(n, `상점 (${l.map(([a, b]) => `${a} ${b}원`).join(', ')})`));
  Object.entries(CROPS).forEach(([n, c]) => put(n, `농장 (${c.seed} 심기)`));
  RECIPES.forEach(rc => put(rc.out, `제작 (${Object.entries(rc.mats).map(([n, q]) => `${n} ×${q}`).join(' + ')})`));
  QUESTS.forEach(q => ((q.reward && q.reward.items) || []).forEach(([n]) => put(n, `임무 보상 · ${q.title}`)));
  _src = m; return m;
}
const sourceText = n => { const l = itemSources()[n]; return l ? l.join(' / ') : '특별한 이벤트·거래 등'; }; // 얻는 곳은 전부 보여 준다 (예전엔 4곳 + 외 n곳)
function codexItemSub(n) {
  const it = ITEMS[n];
  if (it.tab === '장비') return '장비';
  if (it.how === '낚시') return '낚시';
  if (it.tab === '소모품') return it.use && it.use.sp && (!MEDICINES.has(n) || n === '계란말이') ? '요리' : '소모품';
  return '재료';
}
const craftField = name => ((ITEMS[name] && ITEMS[name].tags) || []).filter(t => MASTERY_JOB[t]).join('·'); // 레시피 분야 (요리·목공·재봉·대장·가죽공예·보석공예·약학)
function codexEntries(tab) {
  const c = state.codex;
  if (tab === '구역') return [
    ...SAFE_ZONES.map(z => ({ sub: '공중', icon: z.icon, name: z.id, desc: z.desc, known: c.zones[z.id] })),
    ...DANGER_ZONES.map(z => ({ sub: '지상', icon: z.icon, name: z.name, desc: z.desc, known: c.zones[z.id] })),
    ...DANGER_ZONES.flatMap(z => z.terrains.map(t => ({ sub: '지형', icon: t.icon, name: `${t.name} · ${z.id}`, desc: t.desc, known: c.zones[`${z.id}:${t.name}`] })))
  ];
  if (tab === '아이템') return Object.entries(ITEMS).filter(([n, it]) => !it.hidden || c.items[n]).map(([n, it]) => ({ sub: codexItemSub(n), icon: it.icon, name: n, desc: it.desc + (FISH_SIZE[n] ? ` (크기 ${FISH_SIZE[n][0]}~${FISH_SIZE[n][1]}cm)` : ''), src: sourceText(n), best: FISH_SIZE[n] ? (state.fishBest[n] ? `최고 기록 ${state.fishBest[n]}cm` : '아직 기록이 없어요') : '', known: c.items[n] }));
  if (tab === '펫') return Object.entries(PET_SPECIES).map(([id, sp]) => { const p = state.pets.find(x => x.id === id); // 지금 데리고 있는 펫만 '발견'으로 보인다
    return { sub: '', icon: sp.icon || 'pets', name: p ? `${petName(p)}${p.name ? ` (${sp.name})` : ''}` : sp.name, desc: p ? `고향 ${sp.zone} · Lv.${p.lv || 1} · 친밀도 ${p.bond}/100 · 동행 시 이동 시간 -${Math.round(petBuff(p) * 100)}%` : '', where: p ? '' : sp.zone, known: !!p }; });
  if (tab === '저널') return DANGER_ZONES.filter(z => QMARKS[z.id]).map(z => ({ sub: '', icon: 'menu_book', name: `${QMARKS[z.id].name} 탐험록 · ${z.id}`, desc: QMARKS[z.id].journal, known: !!(state.journals || {})[z.id], journal: true }))
    .concat(allJournals() ? [{ sub: '', icon: 'menu_book', name: LAST_JOURNAL.name, desc: LAST_JOURNAL.text, known: true, journal: true, last: true }] : []); // 마지막 장은 다 모으기 전에는 자리('???')도 보이지 않는다
  if (tab === '몬스터') return DANGER_ZONES.flatMap(z => z.terrains.flatMap(t => t.monsters.map(m => ({ sub: m.kind, icon: m.kind === '짐승' ? 'pets' : 'bug_report', name: m.name,
    desc: `${m.desc} (HP ${m.hp} · 공격 ${m.atk})`, where: `${z.name} · ${t.name}`, known: c.monsters[m.name] }))));
  return RECIPES.map(rc => ({ sub: '', icon: ITEMS[rc.out].icon, name: rc.out, desc: (craftField(rc.out) ? `[${craftField(rc.out)}] ` : '') + Object.entries(rc.mats).map(([n, q]) => `${n} ×${q}`).join(' + '), known: recipeKnown(rc), badge: recipeKnown(rc) ? (c.recipes[rc.out] ? '제작 완료' : '미제작') : (rankAtLeast(rc.rank) ? '단련으로 습득 가능' : `${rc.rank}등급부터 단련으로 습득`) }));
}
function codexFiltered() { // 현재 탭·분류·정렬·검색을 적용한 목록 (검색은 발견한 항목의 이름·설명·서식지만 찾는다)
  const { tab, sub } = codexView, all = codexEntries(tab);
  let list = sub ? all.filter(e => e.sub === sub) : all;
  const q = String(codexView.q || '').trim().toLowerCase();
  if (q) list = list.filter(e => e.known && `${e.name} ${e.desc || ''} ${e.where || ''} ${e.sub || ''}`.toLowerCase().includes(q));
  if (codexView.sort === 'name') list = [...list].sort((a, b) => (b.known ? 1 : 0) - (a.known ? 1 : 0) || (a.known ? a.name.localeCompare(b.name, 'ko') : 0)); // 가나다순: 발견한 것만 이름순, 미발견은 뒤에(순서로 정체가 드러나지 않게)
  return list;
}
function codexListHtml(list) {
  if (!list.length) return `<div class="empty">${codexView.q ? '검색 결과가 없어요. 아직 발견하지 못한 항목은 검색되지 않아요.' : '항목이 없습니다.'}</div>`;
  return list.map(e => e.known
      ? `<div class="nearby-row"><div class="round-avatar">${icon(e.icon)}</div><div class="grow"><strong>${esc(e.name)}</strong><small${e.journal ? ' class="journal"' : ''}>${esc(e.desc)}${e.where ? ` · 서식지 ${esc(e.where)}` : ''}</small>${e.src ? `<small class="src">획득: ${esc(e.src)}</small>` : ''}${e.best ? `<small class="src best">${icon('emoji_events')} ${esc(e.best)}</small>` : ''}</div>${e.badge ? `<span class="tag ${e.badge === '제작 완료' ? 'ok' : ''}">${e.badge}</span>` : e.sub ? `<span class="tag">${esc(e.sub)}</span>` : ''}</div>`
      : `<div class="nearby-row unknown"><div class="round-avatar">${icon('help')}</div><div class="grow"><strong>???</strong><small>아직 발견하지 못했습니다.</small></div>${e.sub ? `<span class="tag">${esc(e.sub)}</span>` : ''}</div>`).join('');
}
const codexCountText = list => codexView.tab === '레시피' ? `${list.length}종` : `발견 ${list.filter(e => e.known).length} / ${list.length}`;
/* 저널 탭: 공지·세계관처럼 왼쪽에 저널 1·2…, 눌러서 오른쪽에 본문 */
function journalHtml() {
  const l = codexEntries('저널'), k = clamp(codexView.jIdx || 0, 0, l.length - 1), e = l[k];
  return `<div class="post-layout journal-layout"><div class="post-list">${l.map((x, i) => x.known
    ? `<button class="post-item ${i === k ? 'active' : ''} ${x.last ? 'last' : ''}" data-act="codex-journal" data-j="${i}">${x.last ? esc(LAST_JOURNAL.name) : `저널 ${i + 1}`}</button>`
    : `<button class="post-item locked" disabled>저널 ${i + 1} · ???</button>`).join('')}</div>` +
    (e.known ? `<article class="post-detail ${e.last ? 'j-last-wrap' : ''}"><h3>${esc(e.name)}</h3><p>${esc(e.desc)}</p>${e.last ? `<p class="j-last">${esc(LAST_JOURNAL.tail)}</p>` : ''}</article>` : `<article class="post-detail"><p>아직 발견하지 못한 저널입니다.</p></article>`) + `</div>`;
}
/* 칭호 도감: 모든 칭호와 얻는 조건. 히든 칭호(HIDDEN_TITLES)는 얻기 전까지 이름·조건을 숨긴다. 진화하는 칭호(제작 숙련·레시피)는 지금 단계가 표시된다 */
function titleCodexHtml() {
  const got = new Set(state.titles), rows = TITLE_DEFS.map(([n, cond]) => {
    const has = got.has(n) || (state.character.title === n), hid = HIDDEN_TITLES.includes(n) && !has;
    return `<div class="title-dex ${has ? 'got' : ''}"><span class="title-chip">${hid ? '???' : esc(n)}</span><small>${hid ? '숨겨진 칭호입니다. 어딘가에서 우연히 얻을 수 있어요.' : esc(cond)}</small>${has ? `<em>${icon('check')} 획득</em>` : ''}</div>`;
  });
  return `<p class="tiny codex-count">칭호 ${TITLE_DEFS.filter(([n]) => got.has(n)).length} / ${TITLE_DEFS.length} · 얻은 칭호는 프로필에서 착용할 수 있어요. (숙련·레시피 칭호는 높은 단계를 얻으면 낮은 단계가 바뀝니다)</p><div class="title-dex-list">${rows.join('')}</div>`;
}
function codexHtml() {
  const { tab, sub } = codexView, list = codexFiltered();
  if (tab === '칭호') return `<div class="tabs flush">${codexTabs().map(t => `<button class="${t === tab ? 'active' : ''}" data-act="codex-tab" data-codex="${t}">${t}</button>`).join('')}</div>` + titleCodexHtml();
  if (tab === '저널') return `<div class="tabs flush">${codexTabs().map(t => `<button class="${t === tab ? 'active' : ''}" data-act="codex-tab" data-codex="${t}">${t}</button>`).join('')}</div>` + journalHtml();
  return `<div class="tabs flush">${codexTabs().map(t => `<button class="${t === tab ? 'active' : ''}" data-act="codex-tab" data-codex="${t}">${t}</button>`).join('')}</div>` +
    (CODEX_SUBS[tab].length ? `<div class="chips">${['', ...CODEX_SUBS[tab]].map(x => `<button class="chip ${x === (sub || '') ? 'active' : ''}" data-act="codex-sub" data-sub="${x}">${x || '전체'}</button>`).join('')}</div>` : '') +
    `<div class="search-row codex-search"><input id="codexQ" type="search" maxlength="20" placeholder="도감에서 검색 (발견한 항목)" aria-label="도감 검색" autocomplete="off" value="${esc(codexView.q || '')}"></div>` +
    `<div class="codex-bar"><p class="tiny codex-count" id="codexCount">${codexCountText(list)}</p><span class="codex-sort"><button class="${codexView.sort === 'name' ? '' : 'active'}" data-act="codex-sort" data-sort="">기본순</button><button class="${codexView.sort === 'name' ? 'active' : ''}" data-act="codex-sort" data-sort="name">가나다순</button></span></div><div class="codex-list" id="codexList">${codexListHtml(list)}</div>`;
}
document.addEventListener('input', e => { // 도감 검색: 입력창은 다시 그리지 않고 목록만 바꾼다
  if (!e.target || e.target.id !== 'codexQ') return;
  codexView.q = cleanText(e.target.value, 20);
  const list = codexFiltered(), l = $('#codexList'), c = $('#codexCount'); if (!l || !c) return;
  l.innerHTML = codexListHtml(list); c.textContent = codexCountText(list);
});

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
    ? `<div class="choice-label">받은 친구 신청 ${view.inbox.length}건</div>` + view.inbox.map(r => `<div class="nearby-row"><div class="round-avatar" data-user="${esc(r.name)}">${avatarOf(r.name)}</div><div class="grow"><strong data-user="${esc(r.name)}">${esc(r.name)}</strong><small>친구 신청을 보냈어요</small></div><button class="primary" data-act="friend-accept" data-id="${r.id}">수락</button><button data-act="friend-decline" data-id="${r.id}">거절</button></div>`).join('') : '';
  if (view.tIn && view.tIn.length) h += `<div class="choice-label">받은 교환 제안 ${view.tIn.length}건</div>` + view.tIn.map(r => `<div class="nearby-row"><div class="round-avatar">${icon('swap_horiz')}</div><div class="grow"><strong>${esc(r.name)}</strong><small>${esc(`줌: ${itemsText(r.give)} ↔ 요청: ${itemsText(r.want)}`)}</small></div><button class="primary" data-act="ftrade-accept" data-id="${r.id}">수락</button><button data-act="ftrade-decline" data-id="${r.id}">거절</button></div>`).join('');
  if (view.tOut && view.tOut.length) h += `<div class="choice-label">내가 보낸 교환 제안 ${view.tOut.length}건 (물건은 맡겨 둔 상태)</div>` + view.tOut.map(r => `<div class="nearby-row"><div class="round-avatar">${icon('hourglass_top')}</div><div class="grow"><strong>${esc(r.name)}</strong><small>${esc(`내가 줌: ${itemsText(r.give)} ↔ 받을 것: ${itemsText(r.want)}`)}</small></div><button data-act="ftrade-cancel" data-id="${r.id}">취소</button></div>`).join('');
  return h;
};
const sid9 = v => intIn(v, 1, 9e15, 0);
/* ---- 파티 (서버 기준): PARTY = { id, members:[{uid,name,leader}], invites:[{id,name}] } ---- */
const partyOn = () => chatOnline();
const partyMe = () => PARTY.members.find(m => m.uid === Cloud.userUid);
const partyLeader = () => !!(partyMe() && partyMe().leader);
const PARTY_ERR = { not_leader: '파티장만 초대할 수 있어요.', target_in_party: '이미 다른 파티에 속해 있는 대원이에요.', full: '파티는 최대 4명이에요.', limit: '보낸 초대가 너무 많아요.', busy: '상대에게 쌓인 초대가 너무 많아요.', not_found: '대원을 찾지 못했어요.', bad: '자기 자신은 초대할 수 없어요.', gone: '이미 사라진 초대예요.', in_party: '이미 파티에 속해 있어요.' };
async function partySync(quiet) { // 서버에서 내 파티와 받은 초대를 가져온다
  if (!partyOn()) { if (PARTY.id || PARTY.members.length) { Object.assign(PARTY, { id: 0, members: [], invites: [] }); view.chatSrv['파티'] = []; } return; }
  let pi; try { pi = await Cloud.partyInfo(); } catch (e) { return; } // 서버 준비 전
  const p = pi && pi.party, before = PARTY.id, names0 = partyOthers().join('|');
  PARTY.id = p && Number.isFinite(+p.id) ? +p.id : 0;
  PARTY.members = p && Array.isArray(p.members) ? p.members.slice(0, 4).map(m => ({ uid: /^[0-9a-f-]{36}$/i.test(m.uid) ? m.uid : '', name: cleanText(m.name, 12) || '?', leader: !!m.leader, online: m.online === true || m.uid === Cloud.userUid, place: typeof m.place === 'string' ? m.place.slice(0, 40) : '', spd: Number.isFinite(+m.spd) ? +m.spd : 0, fol: m.fol === true, etaAt: Number.isFinite(+m.eta) && +m.eta > 0 && +m.eta <= 3600000 ? nowMs() + +m.eta : 0 })).filter(m => m.uid) : [];
  if (!PARTY.members.length) PARTY.id = 0;
  PARTY.invites = (pi && Array.isArray(pi.incoming) ? pi.incoming : []).slice(0, 10).map(r => ({ id: sid9(r.id), name: cleanText(r.name, 12) })).filter(r => r.id && r.name);
  view.partyUid = {}; PARTY.members.forEach(m => { view.partyUid[m.name] = m.uid; });
  if ((state.follow && (!PARTY.id || partyLeader())) || (state.partyMove && (!PARTY.id || !partyLeader()))) { state.follow = false; state.partyMove = false; save(); } // 파티가 없거나 내가 파티장이면 동행은 꺼진다
  if (before !== PARTY.id) { view.placeSent = ''; view.followMsg = ''; }
  if (PARTY.invites.length > Math.max(view.partyInvN || 0, 0) && !quiet) toast(`파티 초대가 ${PARTY.invites.length}건 와 있어요. (상황 탭에서 확인)`);
  view.partyInvN = PARTY.invites.length;
  if (before !== PARTY.id) { view.chatSrv['파티'] = []; view.chatLast['파티'] = 0; if (!PARTY.id && before && !quiet) toast('파티에서 나왔어요.'); }
  if (state.side === '상황') renderSituation();
  if ($('#chatFeed') && (state.chatTab === '파티' || before !== PARTY.id || names0 !== partyOthers().join('|'))) renderChat();
}
/* ---- 파티 동행: 파티원이 켜면 파티장이 움직일 때 따라간다 (각자 정상 기력·시간) ---- */
const FOLLOW_GAP_MS = 2500, FOLLOW_RETRY_MS = 30000;
/* 파티원 한 줄 상태: 동행(파티장은 파티 이동) 켜짐 여부와 지금 있는 곳 */
function partyStatus(m) {
  const mine = m.uid === Cloud.userUid, on = mine ? partyFlag() : m.fol, online = mine || m.online;
  const pl = mine ? placeNow() : m.place, pp = pl ? parsePlace(pl) : null;
  const where = !online ? '오프라인' : pp ? (pp.zone ? `${pp.zone} (${pp.x},${pp.y})` : LOCATIONS[pp.air].name) : '위치 모름';
  return `${m.leader ? '파티 이동' : '동행'} ${on ? '켜짐' : '꺼짐'} · ${where}`;
}
function partyFlag() { return !!(PARTY.id && (partyLeader() ? state.partyMove : state.follow)); } // 서버에 알리는 fol: 파티장은 '파티 이동', 파티원은 '동행'
function followLeader() { return PARTY.members.find(m => m.leader); }
function followTick() {
  if (!state.created || !state.follow || !PARTY.id || partyLeader() || view.phase !== 'idle') return;
  if (nowMs() < (view.followAt || 0)) return;
  const L = followLeader();
  if (!L || !L.online) { view.followMsg = '파티장이 접속 중이 아니에요.'; return; }
  if (!L.fol) { view.followMsg = '파티장이 파티 이동을 켜면 따라가요.'; return; }
  const r = followStep(L.place, L.etaAt);
  view.followAt = nowMs() + FOLLOW_GAP_MS;
  if (r.err) { view.followMsg = r.err; view.followAt = nowMs() + FOLLOW_RETRY_MS; if (view.followErr !== r.err) { view.followErr = r.err; toast(`동행을 이어가지 못했어요: ${r.err}`); sfx('error'); if (state.side === '상황') renderSituation(); } return; }
  view.followErr = '';
  if (r.wait) return;
  if (r.moved) { view.followMsg = '파티장을 따라가는 중이에요.'; resetPhase(); renderBars(); renderMapHead(); renderMap(); renderAction(); renderSide(); save(); return; }
  const was = view.followMsg; view.followMsg = L.place && parsePlace(L.place) && parsePlace(L.place).air === '개인실' ? '파티장이 개인실에 있어요.' : '파티장과 같은 곳에 있어요.';
  if (was !== view.followMsg && state.side === '상황') renderSituation();
}
async function partyPlacePush() { // 내 위치·이동 시간·동행 여부가 바뀔 때만 서버에 올린다 (파티원은 파티장 위치와 가장 빠른 이동 시간을 이 값으로 안다)
  if (!partyOn() || !PARTY.id || !state.created || view.placeBusy) return;
  const a = state.active, mv = a && (a.id === '타일 이동' || a.id === '구역 이동'), eta = mv ? Math.max(0, a.endAt - nowMs()) : 0; // 이동 중이면 도착까지 남은 시간도 (파티원이 같은 때 도착하도록)
  const p = placeNow(), spd = Math.round(stepSec()), key = `${p}|${spd}|${partyFlag() ? 1 : 0}|${mv ? a.endAt : 0}`; if (key === view.placeSent) return;
  view.placeBusy = true; try { await Cloud.setPlace(p, spd, partyFlag(), eta); view.placeSent = key; } catch (e) { /* 서버 준비 전: 다음에 다시 */ } view.placeBusy = false;
}
async function partyDo(fn, okMsg) { // 파티 요청 공통 처리
  if (!partyOn()) { toast('파티는 서버에 로그인해야 쓸 수 있어요.'); sfx('error'); return false; }
  try {
    const r = await fn();
    if (r && r.ok === false) { toast(PARTY_ERR[r.msg] || '처리하지 못했어요.'); sfx('error'); await partySync(true); return false; }
    if (okMsg) toast(okMsg); sfx('ok');
  } catch (e) { toast('서버에 연결하지 못했어요. 서버에 supabase/friends.sql 최신본이 적용됐는지 확인하세요.'); sfx('error'); return false; }
  await partySync(true); return true;
}
/* A급 승급 축하: 승급이 서버 저장에 올라간 뒤 서버에 알려 월드 채팅에 공지가 올라가게 한다 (실패하면 60초마다 다시 시도) */
async function announceRankA() {
  if (state.flags.annoA !== 'pending' || !Cloud.enabled || !Cloud.user() || view.annoBusy) return;
  view.annoBusy = true;
  try {
    flushSave(); const p = await cloudPushNow(); if (!(p && p.ok)) return;
    const r = await Cloud.announceRank('A');
    if (r && r.ok) { state.flags.annoA = 'done'; save(); toast('A급 승급을 월드 채팅에 알렸어요!'); chatPoll(); }
  } catch (e) { /* 다음에 다시 */ } finally { view.annoBusy = false; }
}
/* 만렙 축하: A급 승급과 같은 방식 (서버가 내 저장의 레벨을 확인하고 월드 채팅에 한 번만 올린다) */
async function announceMax() {
  if (state.flags.annoMax !== 'pending' || !Cloud.enabled || !Cloud.user() || view.annoMaxBusy) return;
  view.annoMaxBusy = true;
  try {
    flushSave(); const p = await cloudPushNow(); if (!(p && p.ok)) return;
    const r = await Cloud.announceRank('MAX');
    if (r && r.ok) { state.flags.annoMax = 'done'; save(); toast('최고 레벨 달성을 월드 채팅에 알렸어요!'); chatPoll(); }
  } catch (e) { /* 다음에 다시 */ } finally { view.annoMaxBusy = false; }
}
async function friendPoll() {
  marketSync(); // 서버에서 친구 신청·메일·교환 소식을 가져온다
  if (!Cloud.enabled || !Cloud.user() || !state.created || _polling) return;
  announceRankA(); announceMax();
  if (!view.mailBackfill) { view.mailBackfill = true; Cloud.myItemMailCount().then(n => { n = intIn(n, 0, 99999, 0); if (n > (state.mailItemSent | 0)) { state.mailItemSent = n; save(); awardTitles(); } }).catch(() => {}); } // 이 기능 전에 보낸 아이템 메일도 (서버에 남은 만큼) 센다
  _polling = true;
  try {
    await Cloud.prefetchInbox(); // 아래 다섯 가지를 요청 한 번으로
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
      const fl = await Cloud.listFriends(); view.friendUid = {}; view.friendOnline = {};
      const names = [];
      for (const f of fl) { const n = cleanText(f.name, 12); if (n && /^[0-9a-f-]{36}$/i.test(f.uid)) { view.friendUid[n] = f.uid; view.friendOnline[n] = f.online === true; if (!names.includes(n)) names.push(n); } }
      // 서버 친구 목록이 기준이다: 친구가 닉네임을 바꿔도 옛 이름이 따로 남지 않는다
      if (names.join('\n') !== state.friends.join('\n')) { state.friends = names.slice(0, FRIEND_MAX); save(); changed = true; }
    } catch (e) { /* 서버 준비 전 */ }
    try { // 메일
      const ml = await Cloud.fetchMail(), ids = []; let got = 0;
      for (const m of ml) {
        const id = sid9(m.id); if (!id) continue;
        if (receiveServerMail(cleanText(m.name, 12) || '?', cleanText(m.subject, 30) || '(제목 없음)', cleanText(m.body, 300), m.items, 's' + id)) { got++; newMail++; }
        ids.push(id);
      }
      if (ids.length) {
        // 서버 보관함에서 지우기 전에, 받은 메일이 담긴 이 기기의 진행을 먼저 서버 저장에 올린다(저장에 실패하면 지우지 않고 다음에 다시 받는다 — sid로 중복은 막는다)
        flushSave(); let kept = false;
        try { const r = await cloudPushNow(); kept = !!(r && r.ok); } catch (e) { kept = false; }
        if (kept) await Cloud.ackMail(ids);
        renderMailBadge(); if (got) toast(`새 메일 ${got}통이 도착했어요.`);
      }
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
    renderMailBadge(); // 파티는 POLLS.party 가 따로 확인한다
    if (changed || newMail) { if ($('#friendInbox')) openFriends(true); }
    else if ($('#friendInbox')) $('#friendInbox').innerHTML = inboxHtml();
  } finally { _polling = false; Cloud.clearPrefetch(); }
}
/* ---------- 서버 호출 일정 (요청 수 줄이기) ----------
   모든 주기 호출을 한 곳에서 관리한다. 'active'=최근 5분 안에 조작함, 'idle'=화면은 켜져 있지만 조작 없음, 'hidden'=다른 탭/앱.
   자리를 비우거나 탭이 가려지면 간격을 크게 늘리고(null=부르지 않음), 위치는 바뀌었을 때만 보낸다. 접속 표시(90초)는 채팅 확인이 유지한다 */
const IDLE_MS = 5 * 60 * 1000;
let _lastInput = Date.now();
const pollWake = () => { ['chat', 'party', 'sync', 'friend', 'notices'].forEach(k => { _pollAt[k] = 0; }); }; // 깊은 자리 비움·숨김에서 돌아오면 바로 다시 확인
['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => addEventListener(ev, () => { const away = Date.now() - _lastInput > AWAY_MS; _lastInput = Date.now(); if (away) pollWake(); }, { passive: true, capture: true }));
document.addEventListener('visibilitychange', () => { if (!document.hidden) { _pollAt.chat = 0; _pollAt.party = 0; } });
const AWAY_MS = 15 * 60 * 1000; // 15분 넘게 조작이 없으면 '깊은 자리 비움': 서버 확인을 거의 멈춘다 (돌아와 조작하면 바로 다시 확인)
const pollMode = () => Date.now() - _lastInput > AWAY_MS ? 'away' : document.hidden ? 'hidden' : Date.now() - _lastInput > IDLE_MS ? 'idle' : 'active';
const following = () => !!(state.follow && PARTY.id);
const POLLS = { // 이름: [함수, active, idle, hidden, away] (밀리초, null = 안 함)
  party: [() => partySync(), () => (following() ? 3000 : 20000), () => (following() ? 3000 : 60000), () => (following() ? 5000 : null), () => (following() ? 5000 : 300000)], // 파티 초대·구성·위치: 평소 20초, 동행 중 3초 (파티장 출발을 바로 따라간다)
  chat: [() => chatPoll(), () => (nowMs() - (view.chatNewAt || 0) > 180000 ? 10000 : 6000), 30000, null, 300000], // 조용한 채팅은 10초, 새 글이 오가면 6초
  nearby: [() => nearbyPoll(), () => (state.side === '상황' ? 30000 : 60000), 90000, null, null],
  lt: [() => ltPoll(), 20000, 60000, null, null], // 실시간 교환 초대 확인 (교환 창이 열려 있으면 창이 2초마다 따로 확인)
  friend: [() => friendPoll(), 60000, 180000, 300000, 600000],
  sync: [() => cloudSync(), 60000, 180000, null, 600000],
  notices: [() => syncNotices(), 300000, 600000, null, null]
};
const _pollAt = {};
function pollTick() {
  if (!Cloud.enabled || !Cloud.user() || !state.created) return;
  const mode = pollMode(), t = Date.now(), col = { active: 1, idle: 2, hidden: 3, away: 4 }[mode];
  if (mode !== 'hidden' && mode !== 'away' && locKey() !== view.nbSent && t - (_pollAt.nearby || 0) > 3000) { _pollAt.nearby = t; nearbyPoll(); } // 위치가 바뀌면 바로 알린다
  for (const [k, p] of Object.entries(POLLS)) {
    let gap = p[col]; if (typeof gap === 'function') gap = gap();
    if (gap == null || t - (_pollAt[k] || 0) < gap) continue;
    _pollAt[k] = t; p[0]();
  }
}
if (Cloud.enabled) { const t0 = Date.now(); _pollAt.chat = t0 - 4800; _pollAt.nearby = t0 - 58000; _pollAt.lt = t0 - 12000; _pollAt.friend = t0 - 55000; _pollAt.sync = t0; _pollAt.notices = t0; setTimeout(() => { syncMyAvatar(); chatPoll(); }, 1200); setInterval(pollTick, 3000); }
function openFriends(noPoll) {
  Object.keys(view.avatars).forEach(k => { if (!view.avatars[k]) delete view.avatars[k]; }); // 못 찾았던 이름은 창을 열 때 다시 물어본다
  renderMailBadge();
  const on = Cloud.enabled && Cloud.user(), master = !!(state.guild && state.guild.master) && guildOnline();
  const list = state.friends.map(n => { const uid = (view.friendUid || {})[n]; return `<div class="nearby-row"><div class="round-avatar" data-user="${esc(n)}">${avatarOf(n)}</div><div class="grow"><strong data-user="${esc(n)}">${esc(n)}</strong><small class="${on && (view.friendOnline || {})[n] ? 'st-on' : on ? 'st-off' : ''}">${esc(on ? ((view.friendOnline || {})[n] === undefined ? '확인 중…' : view.friendOnline[n] ? '온라인' : '오프라인') : (samplePlayer(n) || ['', '온라인'])[1])}</small></div><div class="row-btns">` +
    `<button data-act="friend-mail" data-name="${esc(n)}">메일</button>` +
    (on ? `<button data-act="party-invite" data-uid="${esc(uid || '')}" data-name="${esc(n)}" ${uid && (!PARTY.id || partyLeader()) ? '' : 'disabled'} title="${!PARTY.id || partyLeader() ? '파티에 초대합니다 (2~4명)' : '파티장만 초대할 수 있어요'}">파티 초대</button>` : '') +
    `<button data-act="friend-guild-invite" data-name="${esc(n)}" ${master && uid ? '' : 'disabled'} title="${master ? '길드에 초대합니다' : '길드장만 초대할 수 있어요'}">길드 초대</button>` +
    `<button data-act="friend-remove" data-name="${esc(n)}">삭제</button></div></div>`; }).join('');
  modal('친구', `<div class="search-row"><input id="friendSearch" placeholder="대원 이름으로 검색" aria-label="대원 검색"><button data-act="friend-search">검색</button></div><div id="friendResult"></div><div id="friendInbox">${inboxHtml()}</div>` +
    `<div class="choice-label">친구 ${state.friends.length}/${FRIEND_MAX}</div><div id="friendList">${list || '<div class="empty">아직 친구가 없습니다. 주위 대원의 정보 창이나 검색으로 추가하세요.</div>'}</div>` +
    `<p class="tiny">서버에 로그인하면 이름으로 다른 대원을 찾을 수 있어요. 메일은 친구에게만 보낼 수 있어요.</p>`, [btnClose]);
  if (!noPoll) friendPoll();
}
/* 메일 첨부: 소지품 칸(장비/소모품/재료 탭 · 페이지)에서 눌러 담는다. view.mailAtt = { 이름: 수량 } */
const vKey = (n, mk) => n + '\u0001' + (mk || ''), vSplit = k => { const [n, mk] = String(k).split('\u0001'); return [n, mk || '']; }; // 이름+제작자 한 칸
const mailAttList = () => Object.entries(view.mailAtt || {}).map(([k, q]) => { const [n, mk] = vSplit(k); return ilRow(n, q, mk); }).filter(([n, q]) => q > 0 && ITEMS[n]); // [[이름, 수량, 제작자?]]
function invVariants(tab) { // 소지품 순서대로, 제작자가 다르면 따로 한 칸 [{ n, mk, q }]
  const seen = new Set(), out = [];
  (tab ? [tab] : ['장비', '소모품', '재료']).flatMap(t => state.inventory[t]).forEach(s => { if (seen.has(s.n)) return; seen.add(s.n); itemVariants(s.n).forEach(v => out.push({ n: s.n, mk: v.mk, q: v.q })); });
  return out;
}
function renderMailAttach() {
  if (!$('#mailGrid')) return;
  const tab = view.mailInvTab || null, att = view.mailAtt || (view.mailAtt = {});
  const stacks = invVariants(tab).filter(s => s.n !== MAIL_SHIP_ITEM);
  const pages = Math.max(1, Math.ceil(stacks.length / PAGE_SIZE)), pg = clamp(view.mailInvPage || 1, 1, pages); view.mailInvPage = pg;
  const cnt = Math.max(12, Math.min(PAGE_SIZE, stacks.length - (pg - 1) * PAGE_SIZE));
  $('#mailTabs').innerHTML = [['', '전체'], ['장비', '장비'], ['소모품', '소모품'], ['재료', '재료']].map(([v, l]) => `<button class="${(tab || '') === v ? 'active' : ''}" data-act="mail-inv-tab" data-tab="${v}">${l}</button>`).join('');
  $('#mailGrid').innerHTML = Array.from({ length: cnt }, (_, k) => {
    const st = stacks[(pg - 1) * PAGE_SIZE + k], it = st && ITEMS[st.n];
    if (!it) return '<div class="slot" aria-label="빈 슬롯"></div>';
    const vk = vKey(st.n, st.mk), left = st.q - (att[vk] || 0);
    return `<button class="slot clickable filled" data-act="mail-att" data-key="${esc(vk)}" data-item="${esc(st.n)}" data-tip-title="${esc(st.n)}" data-tip-desc="${esc(itemTip(st.n, st.mk))}" aria-label="${esc(st.n)}" ${left < 1 ? 'disabled' : ''}>${icon(it.icon)}${st.mk ? `<span class="mk-label">${esc(mkShort(st.mk))}</span>` : ''}${st.q > 1 ? `<span class="qty">${st.q}</span>` : ''}</button>`;
  }).join('');
  $('#mailPage').textContent = `${pg} / ${pages}`; $('#mailPrev').disabled = pg === 1; $('#mailNext').disabled = pg === pages;
  const list = mailAttList(), total = list.reduce((a, [, q]) => a + q, 0);
  $('#mailItems').innerHTML = list.length ? list.map(([n, q, mk]) => `<button class="slot clickable filled" data-act="mail-att-del" data-key="${esc(vKey(n, mk))}" data-item="${esc(n)}" data-tip-title="${esc(n)}" data-tip-desc="${esc((mk ? `제작 · ${mk}\n` : '') + '누르면 하나 뺍니다.')}" aria-label="${esc(n)} 빼기">${icon(ITEMS[n].icon)}${mk ? `<span class="mk-label">${esc(mkShort(mk))}</span>` : ''}<span class="qty">${q}</span></button>`).join('') : '<small class="tiny">아래 소지품을 눌러 담으세요.</small>';
  $('#mailAttInfo').textContent = `첨부 ${list.length}/${MAIL_ITEM_KINDS}종 · ${total}/${MAIL_ITEM_TOTAL}개${list.length ? ` · 운송장치 1개 사용 (보유 ${countItem(MAIL_SHIP_ITEM)}개)` : ''}`;
}
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
      `<div class="srow fontrow"><span>받는 사람</span><select id="mailTo" ${state.friends.length ? '' : 'disabled'}>${state.friends.length ? state.friends.map(n => `<option ${n === view.mailTo ? 'selected' : ''}>${esc(n)}</option>`).join('') : '<option value="">친구 없음</option>'}</select></div>` +
      `<div class="srow fontrow"><span>제목</span><input id="mailSubject" maxlength="30" placeholder="메일 제목" value="${esc(view.mailSubj || '')}"></div>` +
      `<div class="srow fontrow"><span>내용</span><textarea id="mailBody" maxlength="300" placeholder="내용을 입력하세요 (300자)"></textarea></div>` +
      `<div class="choice-label">아이템 첨부 (선택)</div><div class="mail-att" id="mailItems"></div><div class="row-gap"><button data-act="mail-pick-open">${icon('inventory_2')} 소지품에서 고르기</button></div><small class="tiny" id="mailAttInfo"></small>` +
      `<div class="mail-picker hidden" id="mailPicker"><div class="picker-card"><div class="picker-head"><strong>소지품 · 첨부할 아이템</strong><button class="primary" data-act="mail-pick-close">완료</button></div>` +
      `<div class="inventory-head"><div class="subtabs" id="mailTabs"></div></div><div class="inv-scroll"><div class="inv-grid" id="mailGrid"></div></div>` +
      `<div class="inv-footer"><span class="inv-count"></span><div class="pages"><button id="mailPrev" data-act="mail-inv-page" data-d="-1" title="이전 페이지"><span class="material-symbols-rounded" aria-hidden="true">chevron_left</span></button><span id="mailPage">1 / 1</span><button id="mailNext" data-act="mail-inv-page" data-d="1" title="다음 페이지"><span class="material-symbols-rounded" aria-hidden="true">chevron_right</span></button></div></div></div></div>` +
      `<p class="tiny">글만 보내는 메일은 무료예요. 아이템을 담으려면 <b>${MAIL_SHIP_ITEM}</b>(상점가에서 구매)가 1개 필요해요. (보유 ${ship}개 · 종류 ${MAIL_ITEM_KINDS}개, 합계 ${MAIL_ITEM_TOTAL}개까지)</p>`;
    modal('메일', body, [btnClose, `<button class="primary" data-act="mail-send" ${state.friends.length ? '' : 'disabled'}>보내기</button>`], true);
    renderMailAttach();
    return;
  }
  const open = view.mailOpen && state.mail.find(m => m.id === view.mailOpen && mailDelivered(m));
  if (open) {
    body = `<div class="result mail-view"><strong>${esc(open.subject)}</strong><small>${esc(open.from)} · ${new Date(open.at).toLocaleDateString('ko-KR')} · ${open.kept ? '보존됨' : `${mailDaysLeft(open)}일 뒤 사라짐`}</small><p>${esc(open.body)}</p>` +
      (open.items.length ? `<div class="reward-list">${chipList(open.items.map(([n, q, mk]) => `${n} ×${q}${mk ? ` (제작 · ${mk})` : ''}`))}</div>` : '') + '</div>';
    modal('메일', body, [`<button data-act="mail-back">목록</button>`, `<button data-act="mail-reply" data-id="${open.id}">${icon('reply')} 답장</button>`, `<button data-act="mail-keep" data-id="${open.id}">${open.kept ? '보존 해제' : `보존 (${keptCount()}/${MAIL_KEEP_MAX})`}</button>`, `<button data-act="mail-delete" data-id="${open.id}">삭제</button>`,
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
  tip.innerHTML = `<b>${esc(el.dataset.tipTitle)}</b><span>${esc(el.dataset.tipDesc)}</span>${left}${el.dataset.tipMore ? `<span class="tip-more">${el.dataset.tipMore.split('\n').map(esc).join('<br>')}</span>` : ''}`;
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
  'confirm-cancel': () => { const b = view.confirmBack; view.confirmBack = null; if (b) b(); else closeModal(); },
  'crop-cancel': () => { if (view.crop) { view.crop.bmp.close && view.crop.bmp.close(); view.crop = null; } openProfile(); },
  'crop-ok': async () => {
    const c = view.crop; if (!c) return;
    try {
      const data = await compressImage(c.bmp, { x: Math.round(c.x), y: Math.round(c.y), w: Math.round(c.s), h: Math.round(c.s) });
      c.bmp.close && c.bmp.close(); view.crop = null;
      localStorage.setItem(AVATAR_KEY, data); syncMyAvatar(); renderProfile(); openProfile();
      toast(`프로필 이미지 변경 완료 (${Math.round(data.length * .75 / 1024)}KB로 압축)`);
    } catch (err) { toast('이미지를 처리하지 못했습니다.'); }
  },
  'avatar-clear': () => { try { localStorage.removeItem(AVATAR_KEY); } catch (e) { /* 저장 불가 */ } renderProfile(); openProfile(); syncMyAvatar(true); renderChat(); },

  /* 지도 / 행동 */
  node: el => { const id = el.dataset.node; if (id !== state.location && !state.active && !state.pending) doTravel(id); else if (id !== state.location) { toast('진행 중이거나 결과 확인이 필요한 행동이 있어 이동할 수 없습니다.'); sfx('error'); } },
  choice: el => {
    const a = ACTIONS[el.dataset.choice], lg = levelGate(el.dataset.choice);
    if (lg) { toast(lg); sfx('error'); return; }
    if (a.kind === 'board') openQuestBoard(); else if (a.kind === 'shop') { view.shopId = a.shop || placeKey(); view.shopTab = shopTabs(view.shopId)[0]; openShop(); } else if (a.kind === 'gacha') openGacha();
    else if (a.kind === 'lostfound') {
      const r = turnInLost();
      if (typeof r === 'string') { toast(r); sfx('error'); return; }
      toast(`캠프 관리인이 물건을 받아 들고 한참을 들여다보더니, 뽑기권 ${r.tickets}장을 건넸습니다.`); addLog(`분실물을 전달하고 뽑기권 ${r.tickets}장을 받았습니다.`);
      if (r.gift) toast(`그리고 감사의 표시로 「${r.gift}」을(를) 받았습니다.`); awardTitles(); renderProfile(); renderInventory(); renderAction(); sfx('levelup');
    }
    else if (a.kind === 'enhance') openEnhance(); else if (a.kind === 'dismantle') openDismantle(); else if (a.kind === 'market') openMarket('사기'); else if (a.kind === 'room') openRoom(); else if (a.kind === 'storage') { view.storSel = null; openStorage(); } else if (a.kind === 'promo') openPromo(); else if (a.kind === 'lostbox') openLostBox(); else if (a.kind === 'duel') openDuel(); else if (a.kind === 'bossinfo') openBossInfo(); else if (a.kind === 'tmsg') openTrainMsg(); else if (a.kind === 'farm') openFarm(); else if (a.kind === 'pet') openPets(); else if (a.kind === 'subjob') { view.quitAsk = false; openJob(); }
    else if (a.kind === 'travel') { // 시간이 걸리지 않는 이동은 묻지 않고 바로 간다. 이동장치에서 지상으로 내려가는 1분짜리만 묻는다
      if (LOCATIONS[a.to].danger && state.location === '이동장치') askAction(el.dataset.choice); else doTravel(a.to);
    }
    else if (a.kind === 'enter') { enterDungeon(a.zone); resetPhase(); renderMapHead(); renderMap(); renderAction(); renderSide(); }
    else if (a.kind === 'leave') { leaveDungeon(); resetPhase(); renderMapHead(); renderMap(); renderAction(); }
    else if (a.kind === 'investigate' || a.kind === 'gamble' || a.kind === 'lounge' || (a.kind === 'leisure' && leisureTaken())) { // 시간이 걸리지 않는 행동은 누르면 바로 실행한다 (여가는 버프를 받은 뒤에만)
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
  'recipe-buy': el => {
    const out = el.dataset.out, err = buyRecipe(out);
    if (err) { toast(err); sfx('error'); return; }
    renderProfile(); renderCraft(); sfx('ok'); toast(`${out} 레시피를 배웠습니다.`); openShop(true);
  },
  'gacha-draw': () => {
    const r = drawGacha();
    if (typeof r === 'string') { toast(r); sfx('error'); return; }
    view.gachaLast = r; renderProfile(); renderInventory(); renderLeftTab(); sfx(r.rank <= 2 ? 'levelup' : 'ok');
    if (r.rank === 1) addLog(`뽑기 1등 당첨! ${prizeText(r.prize)}`);
    openGacha(true);
  },
  'shop-tab': el => { view.shopTab = el.dataset.tab; openShop(); },
  'shop-sell': el => {
    const name = el.dataset.name, qty = +el.dataset.qty || 1, pr = sellPrice(name), err = sellItem(view.shopId || placeKey(), name, qty);
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
    renderBag(); sfx('ok'); toast(`${r.crop} ×${r.qty} 수확`); masteryNote(r.mUp ? [r.mUp] : []); openFarm(true);
  },
  'farm-harvest-all': () => {
    const got = {}; let err = '';
    for (let i = 0; i < farmPlotCount(); i++) {
      if (!plotReady(state.farm.plots[i])) continue;
      const r = harvestPlot(i);
      if (typeof r === 'string') { err = r; break; }
      got[r.crop] = (got[r.crop] || 0) + r.qty; if (r.mUp) masteryNote([r.mUp]);
    }
    const txt = Object.entries(got).map(([n, q]) => `${n} ×${q}`).join(', ');
    renderBag(); openFarm(true);
    if (txt) { sfx('ok'); toast(`수확: ${txt}${err ? ` (${err})` : ''}`); } else { toast(err || '수확할 작물이 없습니다.'); sfx('error'); }
  },
  'bowl-open': () => openBowlPick(),
  'bowl-back': () => openPets(),
  'bowl-put': el => { const e = bowlPut(el.dataset.item, el.dataset.qty); if (e) { toast(e); sfx('error'); return; } renderBag(); sfx('ok'); openBowlPick(); },
  'bowl-take': el => { const g = bowlTake(el.dataset.item); if (!g) { toast('가방에 자리가 없어요.'); sfx('error'); return; } renderBag(); sfx('click'); openPets(true); },
  'pet-feed-pick': el => { view.feed = el.dataset.item; petRefresh(el); },
  'pet-sel': el => { view.petSel = +el.dataset.i; openPets(true); },
  'pet-feed': el => { const i = +el.dataset.i, e = petCareErr(i); if (e) { toast(e); sfx('error'); return; } view.petFrom = el.closest('#sideView') ? 'side' : 'modal'; view.petScroll = view.petFrom === 'modal' ? $('#modalBody').scrollTop : 0; openPetFeed(i); }, // 간식 주기: 줄 간식을 고르는 창
  'pet-feed-do': el => {
    const i = +el.dataset.i, pet = state.pets[i], before = pet && pet.pers, err = feedPet(i, el.dataset.item);
    if (err) { toast(err); sfx('error'); openPetFeed(i); return; }
    renderBag(); renderBuffs(true); sfx('ok'); toast(pet.pers !== before ? `${petName(pet)}의 성격이 '${pet.pers}'(으)로 바뀌었습니다. ${petFeedLine(pet)}` : petFeedLine(pet));
    if (view.petFrom === 'modal') { openPets(); $('#modalBody').scrollTop = view.petScroll || 0; } else closeModal(); renderSide();
  },
  'pet-name': el => { view.petNaming = +el.dataset.i; petRefresh(el); const e = $('#petNameIn'); if (e) e.focus(); },
  'pet-name-cancel': el => { view.petNaming = -1; petRefresh(el); },
  'pet-name-save': el => { const err = renamePet(+el.dataset.i, petRoot(el).querySelector('#petNameIn').value); if (err) { toast(err); sfx('error'); return; } view.petNaming = -1; renderBuffs(true); sfx('ok'); toast('펫 이름을 저장했습니다.'); petRefresh(el); },
  'pet-sub': el => { view.petSub = el.dataset.sub; renderSide(); },
  'pet-acc': el => { openPetAcc(+el.dataset.i); },
  'pet-acc-set': el => { const i = +el.dataset.i, e = petEquip(i, el.dataset.name); if (e) { toast(e); sfx('error'); return; } sfx('ok'); renderBag(); renderBuffs(true); renderSide(); openPetAcc(i); },
  'pet-acc-off': el => { const i = +el.dataset.i, e = petUnequip(i); if (e) { toast(e); sfx('error'); return; } sfx('ok'); renderBag(); renderBuffs(true); renderSide(); openPetAcc(i); },
  'pet-active': el => { const i = +el.dataset.i, err = setActivePet(state.petActive === i ? -1 : i); if (err) { toast(err); sfx('error'); return; } renderBuffs(true); petRefresh(el); },
  'notice-del': el => {
    if (!canNotice()) return;
    askConfirm('공지 삭제', '이 공지를 정말 삭제할까요? 모든 대원의 알림 탭에서 사라지고 되돌릴 수 없어요.', '삭제', 'notice-del-do', { id: el.dataset.id }, closeModal);
  },
  'notice-del-do': async el => {
    const id = intIn(el.dataset.id, 1, 9e15, 0); closeModal(); if (!id || !canNotice()) return;
    try { await Cloud.deleteNotice(id); await syncNotices(); toast('공지를 삭제했습니다.'); sfx('ok'); }
    catch (e) { toast('공지를 삭제하지 못했어요. 관리자 계정인지, 서버에 supabase/admin.sql 최신본이 적용됐는지 확인하세요.'); sfx('error'); }
  },
  'party-invite': async el => {
    const uid = el.dataset.uid, name = el.dataset.name;
    if (!/^[0-9a-f-]{36}$/i.test(uid || '')) { toast('대원 정보를 서버에서 가져오는 중이에요. 잠시 뒤 다시 시도해 주세요.'); friendPoll(); return; }
    el.disabled = true;
    const ok = await partyDo(() => Cloud.partyInvite(uid), `${name} 대원에게 파티 초대를 보냈어요.`);
    el.disabled = false; if (ok) addLog(`${name} 대원에게 파티 초대를 보냈습니다.`);
  },
  'party-answer': async el => { const id = +el.dataset.id, yes = el.dataset.ok === '1'; el.disabled = true; await partyDo(() => Cloud.partyAnswer(id, yes), yes ? '파티에 들어왔어요.' : '초대를 거절했어요.'); renderChat(); },
  'partymove-toggle': () => {
    if (!PARTY.id || !partyLeader()) { toast('파티장만 쓸 수 있어요.'); sfx('error'); return; }
    state.partyMove = !state.partyMove; view.placeSent = ''; save(); sfx('click');
    toast(state.partyMove ? '파티 이동을 켰어요. 동행 모드인 파티원이 따라옵니다.' : '파티 이동을 껐어요.');
    renderSituation(); partyPlacePush();
  },
  'follow-toggle': () => {
    if (!PARTY.id || partyLeader()) { toast('파티원일 때만 쓸 수 있어요. (파티장은 따라가는 쪽이 아니에요)'); sfx('error'); return; }
    state.follow = !state.follow; view.followAt = 0; view.followErr = ''; view.followMsg = ''; save(); sfx('click');
    toast(state.follow ? '동행 모드를 켰어요. 파티장이 파티 이동을 켜면 따라갑니다.' : '동행 모드를 껐어요.');
    renderSituation(); if (state.follow) followTick();
  },
  'party-leave': () => askConfirm('파티 나가기', '파티에서 나갈까요? 파티장이 나가면 다음 사람이 파티장이 되고, 혼자 남으면 파티가 사라져요.', '나가기', 'party-leave-do', {}, closeModal),
  'party-leave-do': async () => { closeModal(); await partyDo(() => Cloud.partyLeave(), '파티에서 나왔어요.'); renderChat(); },
  'party-kick': async el => { if (!partyLeader()) return; el.disabled = true; await partyDo(() => Cloud.partyKick(el.dataset.uid), `${el.dataset.name} 대원을 파티에서 내보냈어요.`); },
  'sit-toggle': el => { const k = el.dataset.k; if (k !== 'near' && k !== 'todo' && k !== 'party') return; state.sitOpen[k] = !state.sitOpen[k]; save(); renderSide(); },
  'todo-add': () => { const i = $('#todoIn'), e = addTodo(i ? i.value : ''); if (e) { toast(e); sfx('error'); return; } if (i) i.value = ''; renderSide(); const n = $('#todoIn'); if (n) n.focus(); sfx('click'); },
  'todo-toggle': el => { toggleTodo(+el.dataset.id); renderSide(); sfx('click'); },
  'todo-del': el => { removeTodo(+el.dataset.id); renderSide(); },
  'todo-all': el => { const on = el.dataset.on === '1'; state.todos.forEach(t => { t.done = on; }); save(); renderSide(); sfx('click'); }, // 일괄 체크·해제 (매일 임무 수주 확인용)
  'todo-clear': () => { clearDoneTodos(); renderSide(); sfx('ok'); },
  'pet-dex-toggle': el => { view.petDexOpen = !view.petDexOpen; petRefresh(el); },
  'pet-stroke': el => { const r = petStroke(+el.dataset.i); if (r.err) { toast(r.err); sfx('error'); return; } view.petMsg = { i: +el.dataset.i, text: r.text }; sfx('ok'); petRefresh(el); },
  'pet-mood': el => { const r = petAskMood(+el.dataset.i); if (r.err) { toast(r.err); sfx('error'); return; } view.petMsg = { i: +el.dataset.i, text: r.text }; sfx('ok'); petRefresh(el); },
  'pet-send': el => { view.petFrom = el.closest('#sideView') ? 'side' : 'modal'; openPetSend(+el.dataset.i); }, // 탐험 보내기: 구역·먹이를 고르는 창
  'pet-send-do': el => {
    const sel = $('#expZone'); if (sel) view.expZone = sel.value;
    const i = +el.dataset.i, err = sendExpedition(i, view.expZone, el.dataset.item);
    if (err) { toast(err); sfx('error'); openPetSend(i); return; }
    renderBag(); sfx('ok'); toast(`펫이 ${view.expZone} 탐험을 떠났습니다. 24시간 뒤에 돌아와요.`);
    if (view.petFrom === 'side') { closeModal(); renderSide(); } else { openPets(); renderSide(); }
  },
  'pet-claim': el => {
    const r = claimExpedition(+el.dataset.i);
    if (typeof r === 'string') { toast(r); sfx('error'); return; }
    renderBag(); sfx('ok'); toast(`탐험 수확: ${r.items.map(([n, q]) => `${n} ×${q}`).join(', ')}`);
    if (r.boxed && r.boxed.length) { toast(`가방이 가득 차 ${r.boxed.map(([n, q]) => `${n} ${q}개`).join(', ')}을(를) 본부 분실물 보관함으로 보냈습니다.`); addLog(`가방이 가득 차 ${r.boxed.map(([n, q]) => `${n} ×${q}`).join(', ')} → 본부 분실물 보관함`); }
    if (r.lost.length) toast(`분실물 보관함도 가득 차 ${r.lost.map(([n, q]) => `${n} ${q}개`).join(', ')}을(를) 얻지 못했습니다.`);
    addLog(`펫 탐험 수확: ${r.items.map(([n, q]) => `${n} ×${q}`).join(' · ')}`); petRefresh(el);
  },
  'job-join': () => {
    const err = joinSubjob($('#jobName').value, $$('.job-tag:checked').map(c => c.value));
    if (err) { toast(err); sfx('error'); return; }
    renderProfile(); renderBuffs(true); addLog(`서브잡에 가입했습니다: ${state.subjob.name}`); sfx('ok'); toast('서브잡에 가입했습니다.'); renderSide(); openJob();
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
    if (!state.created) { toast('캐릭터를 만든 뒤에 서버에 저장할 수 있어요.'); return; }
    try { const r = await cloudPushNow(); if (r.ok) { _cloudBlocked = false; toast('서버에 저장했어요.'); } else { _cloudBlocked = true; toast('다른 기기에서 먼저 저장했어요. "서버에서 불러오기"를 먼저 해 주세요.'); } } catch (e) { toast('서버에 저장하지 못했어요.'); }
  },
  'cloud-backups': () => openBackups(),
  'backup-now': async () => {
    try { const r = await Cloud.backupNow(); toast(r && r.ok ? '지금 상태를 서버에 백업했어요.' : r && r.why === 'too_fast' ? '방금 백업했어요. 1분 뒤에 다시 눌러 주세요.' : '백업할 진행이 서버에 없어요. (먼저 서버에 저장해 주세요)'); sfx('ok'); openBackups(); }
    catch (e) { toast('서버 백업에 실패했어요. (서버에 backups.sql 을 실행했는지 확인해 주세요)'); sfx('error'); }
  },
  'backup-restore': el => askConfirm('백업 불러오기', '이 백업으로 되돌립니다. 지금 서버에 있는 진행은 먼저 자동으로 백업해 두고, 이 기기의 진행은 백업 내용으로 바뀝니다.', '불러오기', 'backup-restore-do', { id: el.dataset.id }, openBackups),
  'backup-delete': el => askConfirm('백업 삭제', '이 백업을 서버에서 삭제합니다. 삭제하면 되돌릴 수 없어요.', '삭제', 'backup-delete-do', { id: el.dataset.id }, openBackups),
  'backup-delete-do': async el => {
    try { const r = await Cloud.deleteBackup(+el.dataset.id); toast(r && r.ok ? '백업을 삭제했어요.' : '이미 없는 백업이에요.'); sfx('ok'); }
    catch (e) { toast('삭제하지 못했어요. (서버에 backups.sql 을 다시 실행했는지 확인해 주세요)'); sfx('error'); }
    openBackups();
  },
  'backup-restore-do': async el => {
    try { try { await Cloud.backupNow(); } catch (e) { /* 지금 상태 백업은 실패해도 계속 */ }
      const d = await Cloud.getBackup(+el.dataset.id);
      if (!d || !d.created) { toast('이 백업을 불러오지 못했어요.'); sfx('error'); return; }
      toast('백업을 불러옵니다.'); cloudApply(d);
    } catch (e) { toast('백업을 불러오지 못했어요.'); sfx('error'); }
  },
  'cloud-fresh': () => { closeModal(); startTutorial(); },
  'cloud-pull': async () => { try { const s = await Cloud.pull(); if (s) cloudApply(s.data, s.rev); else toast('서버에 저장된 진행이 없어요.'); } catch (e) { toast('서버에서 불러오지 못했어요.'); } },
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
  'cloud-use-server': () => { if (view.cloudServer) cloudApply(view.cloudServer.data, view.cloudServer.rev); },
  'cloud-keep-local': async () => { const s = view.cloudServer; if (s) Cloud.setRev(s.rev); try { const r = await cloudPushNow(); if (r.ok) { _cloudBlocked = false; toast('이 기기의 진행을 서버에 저장했어요.'); closeModal(); } else toast('서버에 저장하지 못했어요.'); } catch (e) { toast('서버에 저장하지 못했어요.'); } },
  'cloud-use-local': async () => { try { await cloudPushNow(); toast('이 기기의 진행을 서버에 저장했어요.'); closeModal(); } catch (e) { toast('서버에 저장하지 못했어요.'); } },
  'job-auto': el => {
    let left = jobNeed(state.subjob.level);
    const root = jobRoot(el), want = {}; jobStock().forEach(r => { const q = Math.min(left, r.q); want[r.n] = q; left -= q; });
    root.querySelectorAll('.job-pick').forEach(i => { i.value = want[i.dataset.n] || 0; }); jobPickSum(root);
    if (root.id === 'sideView') view.jobPicks = want;
  },
  'job-deliver': el => {
    const picks = {}; jobRoot(el).querySelectorAll('.job-pick').forEach(i => { picks[i.dataset.n] = Number(i.value) || 0; });
    const fromSide = !!el.closest('#sideView'); view.jobPicks = {};
    const r = deliverJob(picks);
    if (typeof r === 'string') { toast(r); sfx('error'); return; }
    renderProfile(); renderBag(); renderBuffs(true); sfx(r.up ? 'levelup' : 'ok');
    const mg = Object.entries(r.mGain || {}).map(([t, g]) => `${t} 숙련 +${g}`).join(' · ');
    toast(`납품 완료: ${r.n}개 · +${r.pay} CR${mg ? ` · ${mg}` : ''}${r.up ? ` · 서브잡 레벨 업! Lv.${state.subjob.level}` : ''}`); masteryNote(r.mUp || []); if (mg) renderStatus();
    if (r.up) addLog(`서브잡 레벨 업: ${state.subjob.name} Lv.${state.subjob.level}`);
    if (fromSide) renderSide(); else openJob();
  },
  'job-quit': () => { if (!view.quitAsk) { view.quitAsk = true; openJob(true); return; } view.quitAsk = false; quitSubjob(); renderProfile(); renderBuffs(true); toast('서브잡을 그만두었습니다.'); renderSide(); openJob(); },
  'status-page': el => { const p = +el.dataset.p; view.statusPage = p === 2 ? 2 : p === 1 ? 1 : 0; renderStatus(); },
  'stat-slide': el => { view.statSlide = view.statSlide || {}; view.statSlide[el.dataset.stat] = !view.statSlide[el.dataset.stat]; renderStatus(); },
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
  'guild-rename': async () => {
    const name = cleanText($('#guildRename').value, GUILD_NAME_MAX);
    if (name.length < GUILD_NAME_MIN) { toast(`길드 이름은 ${GUILD_NAME_MIN}~${GUILD_NAME_MAX}자로 입력하세요.`); sfx('error'); return; }
    if (guildOnline()) {
      try {
        const r = await Cloud.guildRename(name);
        if (!r || !r.ok) { sfx('error'); toast({ dup: '이미 있는 길드 이름이에요.', not_master: '길드장만 이름을 바꿀 수 있어요.', bad_name: `길드 이름은 ${GUILD_NAME_MIN}~${GUILD_NAME_MAX}자로 입력하세요.` }[r && r.msg] || '이름을 바꾸지 못했어요.'); return; }
        sfx('ok'); toast(`길드 이름을 「${name}」(으)로 바꿨어요.`); addLog(`길드 이름을 「${name}」(으)로 바꿨습니다.`); openGuildOnline();
      } catch (e) { toast('이름을 바꾸지 못했어요. 서버에 friends.sql 을 실행했는지 확인해 주세요.'); }
      return;
    }
    const err = renameGuild(name);
    if (err) { toast(err); sfx('error'); return; }
    sfx('ok'); toast(`길드 이름을 「${name}」(으)로 바꿨어요.`); addLog(`길드 이름을 「${name}」(으)로 바꿨습니다.`); renderChat(); openGuild();
  },
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
  'guild-leave': () => { const m = state.guild && state.guild.master; askConfirm(m ? '길드 해산' : '길드 탈퇴', m ? '정말로 길드를 해산할까요? 길드원 모두가 길드에서 나가게 되고, 되돌릴 수 없어요.' : '정말로 길드를 탈퇴할까요?', m ? '해산하기' : '탈퇴하기', 'guild-leave-do', {}, () => openGuild()); },
  'guild-leave-do': async () => {
    if (guildOnline()) { try { const m = state.guild && state.guild.master; await Cloud.guildLeave(); state.guild = null; state.chats['길드'] = [['시스템', '길드 채널은 길드에 가입하거나 만든 뒤 사용할 수 있습니다.']]; save(); renderChat(); toast(m ? '길드를 해산했습니다.' : '길드를 탈퇴했습니다.'); openGuildOnline(); } catch (e) { toast('처리하지 못했어요.'); } return; }
    const m = state.guild.master; leaveGuild(); renderChat(); openGuild(); toast(m ? '길드를 해산했습니다.' : '길드를 탈퇴했습니다.'); },
  tile: el => {
    if (state.active || state.pending) { toast(state.pending ? '먼저 결과를 확인하세요.' : '행동이 진행 중이라 이동할 수 없습니다.'); sfx('error'); return; }
    const x = +el.dataset.x, y = +el.dataset.y, m = planMove(x, y);
    if (m.err) { toast(m.err); sfx('error'); return; }
    askAction('타일 이동', [x, y]);
  },
  mult: el => { view.mult = +el.dataset.i; renderAction(); const e = $('#customMin'); if (e) { e.focus(); e.select(); } },
  'action-cancel': () => { resetPhase(); renderAction(); },
  'rest-mode': el => { if (['휴식', '잠자기'].includes(el.dataset.id)) { view.id = el.dataset.id; renderAction(); } },
  'action-run': () => {
    const a = ACTIONS[view.id];
    if (a.kind === 'travel') {
      if (LOCATIONS[a.to].danger && state.location === '이동장치') { const err = startTrip(a.to); if (err) { toast(err); sfx('error'); return; } resetPhase(); renderBars(); renderAction(); renderMap(); return; }
      doTravel(a.to); return;
    }
    if (a.kind === 'step') { doMove(); return; }
    if (a.kind === 'enter') { enterDungeon(a.zone); resetPhase(); renderMapHead(); renderMap(); renderAction(); renderSide(); return; }
    if (a.kind === 'leave') { leaveDungeon(); resetPhase(); renderMapHead(); renderMap(); renderAction(); return; }
    if (a.kind === 'rescue') { const msg = startAction(view.id); if (msg) { toast(msg); sfx('error'); return; } resetPhase(); renderBars(); renderAction(); openRescueFight(); return; }
    if (a.kind === 'leisure') { const msg = startAction(view.id); if (msg) { toast(msg); sfx('error'); return; } resetPhase(); renderBars(); renderAction(); sfx('ok'); if (state.pending) A.claim(); return; }
    { const ce = $('#customMin'); if (ce && MULTI_OPTIONS[view.mult].custom) setCustomMin(ce.value); }
    const bsel = $('#tameBait'); if (bsel) view.bait = bsel.value;
    const msg = startAction(view.id, view.mult, ACTIONS[view.id].kind === 'tame' && bsel ? view.bait : null);
    if (msg === BAG_FULL_MSG) { resetPhase(); renderAction(); bagFullWarn(); return; }
    if (msg) { toast(msg); sfx('error'); return; }
    renderBars();
    resetPhase(); renderAction();
  },
  'action-abort': () => { const mv = state.active.id === '타일 이동'; abortAction(); if (travelFinds.length) toast(`길가에서 ${[...new Set(travelFinds)].join(', ')}을(를) 주웠습니다!`), travelFinds.length = 0; renderBars(); renderMapHead(); renderMap(); renderAction(); },
  'result-close': el => { state.results.splice(+el.dataset.i, 1); save(); renderAction(); },
  claim: () => {
    if (!state.pending) { renderAction(); return; }
    const pend = state.pending, r = claimResult();
    state.results.unshift({ t: (ACTIONS[pend.id] || {}).title || String(pend.id), text: pend.result.text, at: nowMs(), gain: rewardChips(pend.result), loss: costChips(pend.result) });
    state.results.length = Math.min(state.results.length, RESULT_KEEP); save();
    renderProfile(); renderBars(); renderBuffs(true); renderBag(); renderAction(); renderMapHead(); renderMap(); renderSide();
    const loss = costChips(r.result); masteryNote(r.mUp);
    const act = ACTIONS[r.id], rare = act.terrain && r.result.items.some(([n]) => n === act.terrain.rare);
    if (r.died) {
      awardTitles();
      addLog(`사망: ${r.result.text} — 본부에서 재탄생했습니다.${r.died.lost ? ` (구조비 ${r.died.lost} CR)` : ''}`);
      sfx('error');
      modal('재탄생했습니다', `<p class="detail-desc">${r.result.deathWhy === 'battle' ? `HP가 바닥난 몸으로 다시 전투에 나섰다가 쓰러져 숨이 끊어졌습니다.` : 'HP가 1인 채로 또 피해를 입어 숨이 끊어졌습니다.'}</p><p class="detail-desc">클론은 데이터로 되살아납니다. 대원은 본부에서 재탄생했어요. HP ${REBIRTH_HP}로 깨어났고 부상 상태입니다.</p><p class="tiny">${r.died.lost ? `구조비로 ${r.died.lost} CR을 냈습니다. ` : ''}그 행동의 보상은 받지 못했지만 레벨과 소지품은 그대로예요.</p>`, [btnClose]);
      return;
    }
    if (r.result.recipe) { addLog(`속성학습: 「${r.result.recipe}」 제작법을 익혔습니다.`); toast(`새 레시피 「${r.result.recipe}」를 익혔습니다!`); renderCraft(); renderLeftTab(); }
    if (act.kind === 'event' || r.ups || r.lost.length || rare || /대성공|사고|패배|후퇴|희귀|부상/.test(r.result.text)) // 특별한 사건만 기록
      addLog(`${act.title}: ${r.result.text} (${rewardChips(r.result).join(' · ') || '보상 없음'}${loss.length ? ` / 손실: ${loss.join(' · ')}` : ''})`);
    sfx(r.ups ? 'levelup' : 'ok');
    if (r.boxed && r.boxed.length) { toast(`가방이 가득 차 ${r.boxed.map(([n, q]) => `${n} ${q}개`).join(', ')}을(를) 본부 분실물 보관함으로 보냈습니다.`); addLog(`가방이 가득 차 ${r.boxed.map(([n, q]) => `${n} ×${q}`).join(', ')} → 본부 분실물 보관함`); }
    if (r.lost.length) toast(`분실물 보관함도 가득 차 ${r.lost.map(([n, q]) => `${n} ${q}개`).join(', ')}을(를) 얻지 못했습니다.`);
    if (r.ups) toast(`레벨 업! Lv.${state.character.level} · 스탯 포인트 +${r.ups}`);
    if (r.result.journal) { sfx('levelup'); view.jLast = !!r.result.journalLast; modal('저널을 획득했습니다', `<p class="detail-desc">저널을 획득했습니다. 도감을 확인해주세요.</p>${view.jLast ? '<p class="tiny">수첩 사이에 한 장이 더 끼워져 있었다.</p>' : ''}`, ['<button class="primary" data-act="open-codex-journal">도감 열기</button>', btnClose], true); }
  },
  'open-codex-journal': () => { closeModal(); codexView.tab = '저널'; codexView.sub = null; codexView.jIdx = view.jLast ? codexEntries('저널').length - 1 : Math.max(0, codexEntries('저널').findIndex(e => e.known)); view.jLast = false; codexView.q = ''; openSystem('도감'); },

  /* 스탯 / 제작 / 아이템 */
  'stat-up': el => { const k = el.dataset.stat, d = view.statDraft = view.statDraft || {}; if (!(k in state.stats)) return; if (state.statPoints - Object.values(d).reduce((a, b) => a + b, 0) < 1) return; d[k] = (d[k] || 0) + 1; renderStatus(); },
  'stat-down': el => { const d = view.statDraft || {}, k = el.dataset.stat; if (d[k]) { d[k]--; if (!d[k]) delete d[k]; } renderStatus(); },
  'stat-reset': () => { view.statDraft = {}; renderStatus(); },
  'stat-commit': () => { if (commitStatDraft(view.statDraft)) { view.statDraft = {}; sfx('ok'); toast('스테이터스를 저장했습니다.'); renderStatus(); renderCraft(); renderProfile(); save(); } else { view.statDraft = {}; renderStatus(); } },
  craft: el => { // 여러 개 만들 수 있으면 몇 개 만들지 먼저 고른다
    const i = +el.dataset.index, rc = RECIPES[i];
    if (rc && !state.crafting && canCraft(rc) && (maxCraft(rc) > 1 || needsPick(rc))) { openCraftQty(i); return; }
    A['craft-go']({ dataset: { index: i, qty: 1 } });
  },
  'cq-step': el => { const q = $('#cqQty'); q.value = clamp((+q.value || 1) + (+el.dataset.d), 1, +q.max); cqUpdate(); },
  'cq-max': () => { const q = $('#cqQty'); q.value = q.max; cqUpdate(); },
  'craft-go': el => {
    const res = craft(+el.dataset.index, el.dataset.qty ? +el.dataset.qty : intIn($('#cqQty').value, 1, MAX_BATCH, 1), el.dataset.qty ? null : curPicks()), name = RECIPES[+el.dataset.index].out;
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
    toast(`${r.out} ${r.got}개 제작 완료${r.great ? ' (대성공! +1)' : ''}`); masteryNote(r.mUp); renderBag();
  },
  item: el => {
    const name = el.dataset.item, it = ITEMS[name]; if (!it) return;
    let mk = el.dataset.mk; // undefined = 아직 안 고름
    const vs = itemVariants(name); if (mk === undefined || !vs.some(v => v.mk === mk)) mk = vs.length ? vs[0].mk : ''; // 처음에는 이름 없는 것(없으면 첫 제작자 것)을 고른 채로 연다
    const have = countItem(name, mk), canEquip = it.slot && state.inventory['장비'].some(s => s.n === name && entryMk(s) === mk), mka = `data-mk="${esc(mk)}"`;
    modal(shownName(name), `<div class="nearby-row"><div class="round-avatar">${icon(it.icon)}</div><div class="grow"><strong>${esc(shownName(name))}</strong><small>${it.slot ? esc(it.slot) + ' 장비' : esc(it.tab)} · 보유 ${have}개${countItem(name) > have ? ` (전체 ${countItem(name)}개)` : ''}</small>${mk ? `<small class="mk-line">${icon('draw')} 제작 · ${esc(mk)}</small>` : ''}</div></div><p class="detail-desc item-info">${itemInfoHtml(name, mk)}</p>` +
      (it.use && !it.use.warp && !it.use.camp ? `<div class="use-gain" id="useGain">${useGainHtml(name, 1)}</div>` : '') +
      (vs.length > 1 && it.tab !== '장비' ? `<div class="choice-label">만든 사람 고르기</div><div class="inv-grid vpick-grid">${variantCells(name, vs, 'item', mk)}</div>` : '') + // 제작자가 섞여 있으면 여기서 골라 쓴다
      ((it.mods || state.enchants[name]) ? `<div class="buffs">${[...(it.mods ? modText(it.mods) : []), ...(state.enchants[name] ? [`세공 · ${enchantText(state.enchants[name])}`] : [])].map(b => `<span class="buff">${esc(b)}</span>`).join('')}</div>` : ''),
      [btnClose, ...(it.use && it.tab === '소모품' ? [state.quick.includes(name) ? `<button data-act="quick-del-name" data-item="${esc(name)}">${icon('bookmark_remove')} 퀵슬롯 빼기</button>` : `<button data-act="quick-add" data-item="${esc(name)}">${icon('bookmark_add')} 퀵슬롯 등록</button>`] : []), `<button class="danger" data-act="drop-open" data-item="${esc(name)}" ${mka}>${icon('delete')} 버리기</button>`, ...(it.engrave ? [`<button class="primary" data-act="engrave-open" data-item="${esc(name)}">${icon('edit')} 이름 새기기</button>`] : []), ...(it.use ? [(it.use.warp || it.use.camp || have < 2 ? '' : `<select id="useQty" data-item="${esc(name)}" aria-label="사용 개수" title="사용할 개수">${Array.from({ length: Math.min(have, MAX_BATCH) }, (_, k) => `<option value="${k + 1}">${k + 1}</option>`).join('')}</select>`) + `<button class="primary" data-act="use" data-item="${esc(name)}" ${mka}>사용</button>`] : []), ...(canEquip ? [`<button class="primary" data-act="equip" data-item="${esc(name)}" ${mka}>장착</button>`] : [])], true);
  },
  'drop-open': el => { // 버리기: 개수를 고르고 한 번 더 묻는다
    const name = el.dataset.item, mk = el.dataset.mk, have = ITEMS[name] ? countItem(name, mk) : 0; if (!have) { closeModal(); return; }
    const opts = Array.from({ length: Math.min(have, 99) }, (_, k) => `<option value="${k + 1}">${k + 1}</option>`).join('') + (have > 99 ? `<option value="${have}">${have}</option>` : '');
    modal('버리기', `<p class="detail-desc">「${esc(shownName(name))}」을(를) 버립니다. 버린 물건은 <b>되돌릴 수 없어요.</b> (보유 ${have}개)</p><div class="row-gap"><label class="tiny" for="dropQty">버릴 개수</label><select id="dropQty">${opts}</select></div>`,
      ['<button data-act="close">취소</button>', `<button class="danger" data-act="drop-do" data-item="${esc(name)}" ${mk === undefined ? '' : `data-mk="${esc(mk)}"`}>버리기</button>`], true);
  },
  'drop-do': el => {
    const name = el.dataset.item, n = $('#dropQty') ? intIn($('#dropQty').value, 1, 9999, 1) : 1, r = discardItem(name, n, el.dataset.mk);
    if (typeof r === 'string') { toast(r); sfx('error'); closeModal(); return; }
    closeModal(); renderBag(); renderBars(); renderProfile(); renderAction(); sfx('click'); toast(`${shownName(name)} ×${r.qty}을(를) 버렸습니다.`);
  },
  use: el => {
    const name = el.dataset.item;
    if (ITEMS[name] && ITEMS[name].use && ITEMS[name].use.camp) { openBeacon(name, el.dataset.mk); return; }
    const err = useErr(name), n = $('#useQty') ? intIn($('#useQty').value, 1, MAX_BATCH, 1) : 1;
    if (err) { toast(err); sfx('error'); return; }
    const gainTxt = ITEMS[name].use.warp ? '' : useGainText(name, n);
    if (useItem(name, n, el.dataset.mk)) {
      closeModal(); resetPhase(); renderBars(); renderBag(); renderMapHead(); renderMap(); renderAction(); renderSide(); save();
      toast(ITEMS[name].use.warp ? '귀환 신호기로 본부에 돌아왔습니다.' : `${name}을(를) ${n > 1 ? n + '개 ' : ''}사용했습니다. (${gainTxt})`);
    }
  },
  'equip-slot': el => { view.equipSlot = view.equipSlot === el.dataset.slot ? null : el.dataset.slot; renderEquip(); },
  'pick-equip': el => equipChange(ITEMS[el.dataset.item].slot, el.dataset.item, '장착했습니다.', el.dataset.mk),
  equip: el => equipChange(ITEMS[el.dataset.item].slot, el.dataset.item, '장착했습니다.', el.dataset.mk),
  unequip: el => equipChange(el.dataset.slot, null, '해제했습니다.'),

  /* 오른쪽 패널 / 게시판 / 채팅 */
  player: el => { const n = el.dataset.player, p = samplePlayer(n), fr = state.friends.includes(n);
    modal(n, `<p>현재 위치: ${esc(LOCATIONS[state.location].name)}</p><p>상태: ${esc(p ? p[1] : '온라인')} · 이능 발현자</p><p class="tiny">친구 요청을 보내면 상대가 수락했을 때 친구가 됩니다. (자리 비움은 응답 없음)</p>`,
      [btnClose, `<button class="primary" data-act="friend-add" data-name="${esc(n)}" ${fr ? 'disabled' : ''}>${fr ? '친구' : '친구 추가'}</button>`], true); },
  quest: el => { view.quest = view.quest === el.dataset.id ? null : el.dataset.id; renderSide(); },
  'quest-done': el => {
    const q = QUESTS.find(x => x.id === el.dataset.id);
    if (!q || !questReady(q)) { toast('아직 임무 조건을 달성하지 못했습니다.'); return; }
    if (questOverflow(q).length) { view.qfull = { id: q.id, drop: {} }; openQuestFull(); return; } // 가방이 가득 차면 먼저 자리를 만든다
    questFinish(q, {});
  },
  'qfull-pick': el => { const st = (state.inventory[el.dataset.tab] || [])[+el.dataset.idx]; if (!st || st.n !== el.dataset.item) { openQuestFull(); return; }
    askConfirm('소지품 버리기', `「${shownName(st.n)}」 ×${st.q}을(를) 버려서 자리를 만들까요? 버린 물건은 되돌릴 수 없어요.`, '버리기', 'qfull-pick-do', { tab: el.dataset.tab, idx: el.dataset.idx, item: st.n }, openQuestFull); },
  'qfull-pick-do': el => { const r = discardStack(el.dataset.tab, +el.dataset.idx, el.dataset.item); if (typeof r === 'string') { toast(r); sfx('error'); } else { sfx('click'); renderBag(); renderBars(); renderProfile(); renderAction(); toast(`${shownName(r.name)} ×${r.q}을(를) 버렸습니다.`); } openQuestFull(); },
  'qfull-drop': el => { const q = view.qfull && QUESTS.find(x => x.id === view.qfull.id); if (!q) { closeModal(); return; } const o = questOverflow(q, view.qfull.drop).find(x => x[0] === el.dataset.item); if (!o) { openQuestFull(); return; }
    askConfirm('보상 버리기', `보상 「${shownName(o[0])}」 ×${o[1]}은(는) 가방에 들어가지 않습니다. 받지 않고 버릴까요? 버린 보상은 다시 받을 수 없어요.`, '버리기', 'qfull-drop-do', { item: o[0], qty: o[1] }, openQuestFull); },
  'qfull-drop-do': el => { const f = view.qfull; if (!f) { closeModal(); return; } f.drop[el.dataset.item] = (f.drop[el.dataset.item] || 0) + intIn(el.dataset.qty, 1, 9999, 1); sfx('click'); openQuestFull(); },
  'qfull-cancel': () => { view.qfull = null; closeModal(); },
  sticker: el => { if (state.chatTab === '알림') { setTray(false); return; } if (!STICKERS.some(x => x[0] === el.dataset.name)) return; sendChat(`[${el.dataset.name}]`); setTray(false); },
  post: el => {
    const p = POSTS[el.dataset.board][+el.dataset.post];
    $$('[data-act="post"]').forEach(x => x.classList.toggle('active', x === el));
    $('#postDetail').innerHTML = `<h3>${esc(p[0])}</h3><p>${postHtml(p[1])}</p>`;
  },
  'open-patch': el => { const i = +el.dataset.post; if (i >= 0) openBoard('공지', i); },

  /* 캐릭터 / 설정 */
  'profile-edit': () => { if (profileLockLeft() > 0) return; view.profEdit = true; openProfile(true); },
  'profile-edit-cancel': () => { view.profEdit = false; openProfile(); },
  'char-save': () => {
    const c = state.character, left = profileLockLeft();
    if (left > 0) { // 쿨타임 중에도 주·부 스탯이 아직 비어 있으면 그것만 정할 수 있다 (수정 시각은 건드리지 않는다)
      if (c.mainStat || c.subStat) { toast(`프로필은 ${fmtLong(left)} 뒤에 다시 수정할 수 있어요.`); return; }
      const ms = $('#cMain').value, ss = $('#cSub').value, ok = k => STAT_DEFS.some(d => d.key === k);
      if (!ok(ms) && !ok(ss)) { toast('주 스탯이나 부 스탯을 골라 주세요.'); sfx('error'); return; }
      if (ms && ms === ss) { toast('주 스탯과 부 스탯은 서로 다른 스테이터스로 골라 주세요.'); sfx('error'); return; }
      c.mainStat = ok(ms) ? ms : ''; c.subStat = ok(ss) ? ss : '';
      toast('주·부 스탯을 정했습니다. 이후 변경은 프로필 수정 간격(24시간)을 따라요.'); sfx('ok'); view.profEdit = false; renderProfile(); renderStatus(); save(); closeModal(); return;
    }
    const next = { name: cleanText($('#cName').value, 12) || c.name, age: intIn($('#cAge').value, AGE_MIN, AGE_MAX, c.age), keywords: cleanText($('#cKeywords').value, 60),
      ability: cleanText($('#cAbility').value, 20) || c.ability, abilityDesc: cleanText($('#cAbilityDesc').value, 300),
      mainStat: $('#cMain').value, subStat: $('#cSub').value, allowFriend: $('#cFriend').checked, allowGuild: $('#cGuild').checked };
    if (!STAT_DEFS.some(d => d.key === next.mainStat)) next.mainStat = ''; if (!STAT_DEFS.some(d => d.key === next.subStat)) next.subStat = '';
    if (next.mainStat && next.mainStat === next.subStat) { toast('주 스탯과 부 스탯은 서로 다른 스테이터스로 골라 주세요.'); sfx('error'); return; }
    if (Object.keys(next).some(k => next[k] !== c[k])) { Object.assign(c, next); state.profileEditAt = nowMs(); toast('프로필을 수정했습니다. 24시간 뒤에 다시 수정할 수 있어요.'); }
    view.profEdit = false; renderProfile(); save(); closeModal();
  },
  'settings-save': () => { if (applySettingsNow()) { closeModal(); toast('설정을 저장했습니다.'); } }, // 예전 저장 버튼(지금은 바꾸는 즉시 저장되므로 창에는 없다)

  /* 메일 / 친구 / 길드 / 도감 */
  'trade-open': el => openTrade(el.dataset.player),
  'trade-do': el => {
    const err = tradeWith(el.dataset.player, $('#tradeGive').value, $('#tradeGiveQty').value, $('#tradeWant').value, $('#tradeWantQty').value);
    if (err) { toast(err); sfx('error'); return; }
    renderBag(); sfx('ok'); toast(`교환했습니다. 오늘 남은 교환 ${tradesLeft()}회`); addLog(`${el.dataset.player}님과 물건을 교환했습니다.`);
    openTrade(el.dataset.player);
  },
  'mk-tab': el => { view.mkTab = el.dataset.tab; renderMarket(); if (view.mkTab === '사기') marketBrowse(); },
  'mk-search': () => { view.mkQ = cleanText(($('#mkQ') || {}).value, 20); marketBrowse(); },
  'mk-refresh': () => marketBrowse(),
  'mk-list': async () => {
    const [name, mk] = vSplit(($('#mkItem') || {}).value || ''), qty = intIn(($('#mkQty') || {}).value, 1, 99, 0), price = intIn(($('#mkPrice') || {}).value, 1, MARKET_TOTAL_MAX, 0);
    if (!ITEMS[name]) return;
    const e = marketLocalList(name, qty, price, mk); if (typeof e === 'string') { toast(e); sfx('error'); return; }
    renderBag(); sfx('ok'); view.mkTab = '내 목록'; renderMarket();
    try { const r = await Cloud.marketList(e.key, e.item, e.qty, e.price, e.mk || ''); if (r && r.ok === false) { state.market.sell = state.market.sell.filter(x => x !== e); marketGiveBack(e, e.qty, 'r' + e.key.slice(-6)); save(); renderBag(); toast(r.msg === 'full' ? '서버에 올라간 물건이 너무 많아요. 먼저 정리해 주세요.' : '거래 등록이 거절돼 물건을 돌려받았어요.'); sfx('error'); } else if (r && r.ok) e.id = intIn(r.id, 1, 9e15, 0); save(); }
    catch (x) { toast('서버와 연결하지 못했어요. 연결되면 자동으로 올라갑니다.'); }
    if (isMkOpen()) renderMarket(true);
  },
  'mk-pick': () => { view.mkItem = ($('#mkItem') || {}).value; renderMarket(true); },
  'mk-cancel': async el => {
    const id = intIn(el.dataset.id, 1, 9e15, 0); if (!id) return;
    try { const r = await Cloud.marketCancel(id); if (r && r.ok) { await marketSync(); toast('거래를 취소했어요.'); } else toast('이미 팔렸거나 정리된 거래예요.'); await marketSync(); }
    catch (x) { toast('서버와 연결하지 못했어요.'); sfx('error'); }
  },
  'mk-buy': async el => {
    const id = intIn(el.dataset.id, 1, 9e15, 0), x = (view.mkList || []).find(r => r.id === id); if (!x) return;
    const qty = intIn(($('#mkN' + id) || {}).value, 1, x.qty, 1);
    const s = marketBuyStart(id, x.item, qty, x.price, x.mk || ''); if (typeof s === 'string') { toast(s); sfx('error'); return; }
    renderProfile(); let res = 'retry';
    try { res = marketBuyResult(s.req, await Cloud.marketBuy(id, qty, s.req)); } catch (e) { /* 결과를 모르면 pending 으로 남긴다 */ }
    renderBag(); renderProfile();
    if (res === 'ok') { toast(`${x.item} ×${qty}을(를) 샀어요. (-${x.price * qty} CR)`); sfx('levelup'); }
    else if (res === 'retry') toast('결과를 확인하는 중이에요. 잠시 뒤 자동으로 처리됩니다.');
    else { toast(res === 'short' ? '남은 개수가 모자라 CR을 돌려받았어요. 목록을 새로 불러옵니다.' : '이미 팔려서 CR을 돌려받았어요.'); sfx('error'); }
    if (res !== 'retry') marketBrowse(); else if (isMkOpen()) renderMarket(true);
  },
  'storage-pick': el => { const n = el.dataset.name, mk = el.dataset.mk || '', side = el.dataset.side === 'stor' ? 'stor' : 'bag', same = view.storSel && view.storSel.name === n && view.storSel.side === side && (view.storSel.mk || '') === mk; view.storSel = same ? null : { side, name: n, mk }; openStorage(true); },
  'storage-put': el => {
    const n = el.dataset.name, err = ITEMS[n] ? storeItem(n, el.dataset.qty, el.dataset.mk || '') : '알 수 없는 아이템입니다.';
    if (err) { toast(err); sfx('error'); openStorage(true); return; }
    renderBag(); renderInventory(); renderProfile(); renderAction(); sfx('ok'); openStorage(true);
  },
  'storage-take': el => {
    const n = el.dataset.name, r = ITEMS[n] ? takeStored(n, el.dataset.qty, el.dataset.mk || '') : '알 수 없는 아이템입니다.';
    if (typeof r === 'string') { toast(r); sfx('error'); openStorage(true); return; }
    if (r.got < intIn(el.dataset.qty, 1, STORAGE_STACK, 1)) toast('가방이 가득 차 일부만 꺼냈습니다.');
    renderBag(); renderInventory(); renderProfile(); renderAction(); sfx('ok'); openStorage(true);
  },
  'enh-tab': el => { view.enhTab = el.dataset.tab; openEnhance(); },
  'nick-open': el => {
    const n = el.dataset.name; if (!canNick(n)) { toast('A랭까지 강화한 무기에만 이름을 붙일 수 있어요.'); return; }
    view.nickFor = n;
    modal('무기 이름 붙이기', `<p class="detail-desc">A랭까지 키운 「${esc(n)}」에 이름을 붙여 주세요. 설명에 ‘${esc(state.character.name || '')}의 애착이 담긴 무기’가 더해집니다. (최대 ${NICK_MAX}자, 비우면 원래 이름)</p><div class="srow fontrow"><span>이름</span><input id="nickInput" maxlength="${NICK_MAX}" value="${esc(nickOf(n))}" placeholder="${esc(n)}"></div>`, ['<button data-act="nick-cancel">취소</button>', '<button class="primary" data-act="nick-save">저장</button>'], true);
  },
  'engrave-open': el => {
    const n = el.dataset.item; if (!ITEMS[n] || !ITEMS[n].engrave) return;
    view.engraveFor = n;
    modal('이름 새기기', `<p class="detail-desc">「${esc(n)}」 안쪽에 이름을 새깁니다. ‘○○의 ${esc(n)}’처럼 보여요. (최대 ${ENGRAVE_MAX}자, 비우면 지움 · 언제든 다시 새길 수 있어요)</p><div class="srow fontrow"><span>새길 이름</span><input id="engraveInput" maxlength="${ENGRAVE_MAX}" value="${esc(engraveOf(n))}" placeholder="이름" autocomplete="off"></div>`, ['<button data-act="engrave-cancel">취소</button>', '<button class="primary" data-act="engrave-save">새기기</button>'], true);
    const i = $('#engraveInput'); if (i) i.focus();
  },
  'engrave-cancel': el => { const n = view.engraveFor; if (n) A.item({ dataset: { item: n } }); else closeModal(); },
  'engrave-save': () => {
    const n = view.engraveFor, r = engraveItem(n, ($('#engraveInput') || {}).value || '');
    if (r) { toast(r); sfx('error'); return; }
    renderInventory(); renderEquip(); sfx('ok'); toast(engraveOf(n) ? `「${shownName(n)}」(으)로 새겼어요.` : '새긴 이름을 지웠어요.'); A.item({ dataset: { item: n } });
  },
  'nick-cancel': () => openEnhance(true),
  'nick-save': () => {
    const r = setNick(view.nickFor, ($('#nickInput') || {}).value || '');
    if (r) { toast(r); sfx('error'); return; }
    renderEquip(); renderInventory(); sfx('ok'); toast(nickOf(view.nickFor) ? `「${nickOf(view.nickFor)}」(으)로 이름을 붙였어요.` : '원래 이름으로 돌렸어요.'); openEnhance(true);
  },
  'reinforce-roll': el => {
    const r = reinforceItem(el.dataset.name);
    if (typeof r === 'string') { toast(r); sfx('error'); return; }
    renderBag(); renderProfile(); sfx(r.ok ? 'ok' : 'error');
    toast(r.ok ? `${el.dataset.name} 강화 성공! ${REINFORCE_RANKS[r.lv]}랭이 되었어요.` : `${el.dataset.name} 강화에 실패했어요… (CR만 잃었어요)`);
    addLog(`무기 강화 ${r.ok ? '성공' : '실패'}: ${el.dataset.name} (${REINFORCE_RANKS[r.lv]}랭)`);
    openEnhance(true);
  },
  'dismantle-ask': el => { const n = el.dataset.name, y = dismantleYield(n); if (!y) return; askConfirm('분해', `「${n}」을(를) 분해할까요? ${y.mats.map(([m, q]) => `${m} ×${q}`).join(', ')}와(과) ${y.cr} CR을 얻고, 장비는 사라집니다.`, '분해', 'dismantle-do', { name: n }, openDismantle); },
  'dismantle-do': el => {
    const r = dismantleItem(el.dataset.name);
    if (typeof r === 'string') { toast(r); sfx('error'); openDismantle(true); return; }
    renderBag(); renderBars(); renderProfile(); renderInventory(); sfx('ok');
    toast(`${el.dataset.name} 분해: ${r.mats.map(([m, q]) => `${m} ×${q}`).join(', ')} · ${r.cr} CR`); addLog(`장비 분해: ${el.dataset.name} → ${r.mats.map(([m, q]) => `${m} ×${q}`).join(', ')}, ${r.cr} CR`);
    openDismantle(true);
  },
  'enhance-roll': el => {
    const r = enchantItem(el.dataset.name);
    if (typeof r === 'string') { toast(r); sfx('error'); return; }
    renderBag(); renderBars(); renderProfile(); sfx('ok');
    toast(`${el.dataset.name}: ${enchantText(r.now)}${r.old ? ` (이전: ${enchantText(r.old)})` : ''}`);
    addLog(`장비 세공: ${el.dataset.name} → ${enchantText(r.now)}`);
    openEnhance(true);
  },
  'rescue-skip': () => { if (view.rescueFinish) view.rescueFinish(); },
  'rescue-done': () => { closeModal(); if (state.pending) A.claim(); },
  'quick-add': el => { const e = quickSet(el.dataset.item); if (e) { toast(e); sfx('error'); return; } renderQuick(); toast(`「${el.dataset.item}」을(를) 퀵슬롯에 등록했습니다.`); closeModal(); },
  'quick-del-name': el => { const i = state.quick.indexOf(el.dataset.item); if (i >= 0) quickClear(i); renderQuick(); closeModal(); toast('퀵슬롯에서 뺐습니다.'); },
  'quick-use': el => {
    const n = state.quick[+el.dataset.qi]; if (!n || !ITEMS[n]) return;
    if (!countItem(n)) { toast(`${n}이(가) 없습니다.`); sfx('error'); return; }
    if (ITEMS[n].use.camp) { openBeacon(n); return; }
    const err = useErr(n); if (err) { toast(err); sfx('error'); return; }
    const gain = ITEMS[n].use.warp ? '' : useGainText(n, 1);
    if (useItem(n, 1)) { resetPhase(); renderBars(countItem(n) ? useGain(n, 1) : null); renderBag(); renderMapHead(); renderMap(); renderAction(); renderSide(); renderQuick(); save(); toast(ITEMS[n].use.warp ? '귀환 신호기로 본부에 돌아왔습니다.' : `${n} 사용 (${gain})`); }
  },
  'quick-snd': el => { const k = el.dataset.k; if (!['bgmOn', 'clickOn', 'alertOn'].includes(k)) return; state.settings[k] = !state.settings[k]; applyBgm(); save(); renderQuick(); toast(`${{ bgmOn: '배경음악', clickOn: '클릭음', alertOn: '알림음' }[k]} ${state.settings[k] ? '켬' : '끔'}`); },
  'quick-toggle': () => { state.quickOpen = !state.quickOpen; save(); renderQuick(); },
  'ui-reset': () => askConfirm('UI 기본값으로 되돌리기', '패널 폭과 높이, 접어 둔 패널, 지도 확대·위치, 글자 크기, 커서 설정을 처음 상태로 되돌릴까요? 게임 진행·소리·테마·채팅 탭 설정은 그대로예요.', '되돌리기', 'ui-reset-do', {}, openSettings),
  'ui-reset-do': () => { resetUiDefaults(); openSettings(); toast('UI를 기본 상태로 되돌렸습니다.'); sfx('ok'); },
  'title-scroll': el => { const box = $('#titleChips'); if (box) box.scrollBy({ left: (+el.dataset.d || 1) * Math.max(120, box.clientWidth * .8), behavior: 'smooth' }); },
  'title-set': el => { const err = setTitle(el.dataset.title); if (err) { toast(err); sfx('error'); return; } renderProfile(); sfx('ok'); $$('.tchip').forEach(b => b.classList.toggle('on', b.dataset.title === state.character.title)); const pt = $('#pcTitle'); if (pt) pt.textContent = state.character.title; },
  'mail-tab': el => { view.mailSubj = ''; view.mailTab = el.dataset.tab; view.mailOpen = null; view.mailAtt = {}; view.mailInvPage = 1; openMail(); },
  'mail-open': el => { const m = state.mail.find(x => x.id === +el.dataset.id); if (m) { view.mailOpen = m.id; m.read = true; save(); renderMailBadge(); } openMail(true); },
  'mail-reply': el => { const m = state.mail.find(x => x.id === +el.dataset.id); if (!m) return;
    if (!state.friends.includes(m.from)) { toast('친구가 아닌 발신자에게는 답장할 수 없습니다.'); sfx('error'); return; }
    view.mailTab = '메일 보내기'; view.mailOpen = null; view.mailAtt = {}; view.mailInvPage = 1; view.mailTo = m.from; view.mailSubj = cleanText(/^RE:/i.test(m.subject) ? m.subject : 'RE: ' + m.subject, 30); openMail(); },
  'mail-back': () => { view.mailOpen = null; openMail(); },
  'mail-keep': el => { const err = toggleKeep(+el.dataset.id); if (err) { toast(err); sfx('error'); return; } sfx('ok'); openMail(true); },
  'mail-delete': el => { deleteMail(+el.dataset.id); view.mailOpen = null; renderMailBadge(); openMail(); },
  'mail-claim': el => {
    const err = claimMail(+el.dataset.id);
    if (err) { toast(err); sfx('error'); return; }
    renderBag(); renderMailBadge(); sfx('ok'); toast('첨부 아이템을 받았습니다.'); openMail(true);
  },
  'mail-pick-open': () => { $('#mailPicker').classList.remove('hidden'); renderMailAttach(); },
  'mail-pick-close': () => $('#mailPicker').classList.add('hidden'),
  'mail-inv-tab': el => { view.mailInvTab = el.dataset.tab || null; view.mailInvPage = 1; renderMailAttach(); },
  'mail-inv-page': el => { view.mailInvPage = (view.mailInvPage || 1) + +el.dataset.d; renderMailAttach(); },
  'mail-att': el => {
    const k = el.dataset.key, [n, mk] = vSplit(k), att = view.mailAtt || (view.mailAtt = {}), list = mailAttList(), total = list.reduce((a, [, q]) => a + q, 0);
    if (!ITEMS[n]) return;
    if (!att[k] && list.length >= MAIL_ITEM_KINDS) { toast(`첨부는 종류 ${MAIL_ITEM_KINDS}개까지예요.`); sfx('error'); return; }
    if (total >= MAIL_ITEM_TOTAL) { toast(`첨부는 합계 ${MAIL_ITEM_TOTAL}개까지예요.`); sfx('error'); return; }
    if ((att[k] || 0) >= countItem(n, mk)) { sfx('error'); return; }
    att[k] = (att[k] || 0) + 1; renderMailAttach();
  },
  'mail-att-del': el => { const att = view.mailAtt || {}, k = el.dataset.key; if (att[k]) att[k]--; if (!att[k]) delete att[k]; renderMailAttach(); },
  'mail-send': async () => {
    const items = mailAttList();
    const to = $('#mailTo').value, subject = $('#mailSubject').value, body = $('#mailBody').value, online = Cloud.enabled && Cloud.user();
    const uid = online ? (view.friendUid || {})[to] : null;
    if (online && !uid && state.friends.includes(to)) { toast('친구 정보를 서버에서 가져오는 중이에요. 잠시 뒤 다시 보내 주세요.'); friendPoll(); return; }
    const err = sendMail(to, subject, body, items);
    if (err) { toast(err); sfx('error'); return; }
    const had = sendMail.sent || []; view.mailAtt = {}; // 실제로 소지품에서 뺀 첨부(걸러진 목록)만 서버로 보낸다
    if (online) { // 서버로 실제 전달 (실패하면 아이템을 돌려준다)
      const sent = cleanItemList(had);
      try {
        const r = await Cloud.sendMail(uid, cleanText(subject, 30), cleanText(body, 300), sent);
        if (!r || !r.ok) throw new Error(r && r.msg);
      } catch (e) {
        if (sent.length) { addItem(MAIL_SHIP_ITEM, 1); sent.forEach(([n, q, mk]) => addItem(n, q, mk || '')); }
        renderBag(); save(); sfx('error');
        toast(e && e.message === 'full' ? '상대의 메일함이 가득 차서 보낼 수 없어요.' : e && e.message === 'not_friend' ? '서버에서 친구로 확인되지 않아요.' : '메일을 보내지 못했어요. 서버에 friends.sql 을 실행했는지 확인해 주세요.'); return;
      }
      renderBag(); sfx('ok'); toast(`메일을 보냈습니다.${sent.length ? ' (운송장치 1개 사용)' : ''}`); view.mailTab = '받은 메일함'; openMail(); return;
    }
    renderBag(); sfx('ok'); toast(`메일을 보냈습니다.${had.length ? ' (운송장치 1개 사용)' : ''} (서버에 로그인하지 않아 실제로는 전달되지 않아요)`); view.mailTab = '받은 메일함'; openMail();
  },
  'ftrade-open': el => {
    const pm = PARTY.members.find(m => m.name === el.dataset.name);
    if (pm && !pm.online) { toast(`${pm.name} 대원이 접속 중이 아니라 교환할 수 없어요. 교환은 상대가 접속해 있을 때만 가능해요.`); sfx('error'); return; }
    if (!pm && !(view.nearby || []).some(p => p.name === el.dataset.name)) { toast('교환은 파티원이나 같은 칸에 있는 대원과만 할 수 있어요.'); sfx('error'); return; }
    liveTradeStart(el.dataset.name);
  },
  'lt-plus': el => ltEdit(el.dataset.name, intIn(el.dataset.qty, 1, 99, 1), el.dataset.mk || ''),
  'lt-minus': el => ltEdit(el.dataset.name, -intIn(el.dataset.qty, 1, 99, 1), el.dataset.mk || ''),
  'lt-confirm': () => ltConfirm(),
  'lt-cancel': () => ltCancel(),
  'lt-answer': el => ltAnswer(el.dataset.accept === '1'),
  'lt-hide': () => { closeModal(); },
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
          return `<div class="nearby-row"><div class="round-avatar" data-user="${esc(n)}">${avatarOf(n)}</div><div class="grow"><strong data-user="${esc(n)}">${esc(n)}</strong><small>${esc(`${REMOTE_PLAYERS[n]} · Lv.${intIn(r.level, 1, MAX_LEVEL, 1)} ${'FEDCBAS'.includes(r.rank) ? r.rank : 'F'}등급`)}</small></div><button data-act="friend-req" data-uid="${esc(UID.test(r.uid) ? r.uid : '')}" data-name="${esc(n)}" ${has || !UID.test(r.uid) ? 'disabled' : ''}>${has ? '친구' : '친구 신청'}</button></div>`; }).join('')
          : '<p class="tiny">찾는 대원이 없어요. (이름 일부만 입력해도 돼요. 상대가 친구 추가를 막아 둔 경우에도 나오지 않아요)</p>';
      } catch (e) { if ($('#friendResult')) $('#friendResult').innerHTML = '<p class="tiny">검색하지 못했어요. 서버에 friends.sql 을 실행했는지 확인해 주세요.</p>'; }
      return;
    }
    const p = samplePlayer(v);
    $('#friendResult').innerHTML = !v ? '<p class="tiny">검색어를 입력하세요.</p>' : p
      ? `<div class="nearby-row"><div class="round-avatar" data-user="${esc(v)}">${avatarOf(v)}</div><div class="grow"><strong data-user="${esc(v)}">${esc(v)}</strong><small>${esc(p[1])}</small></div><button data-act="friend-add" data-name="${esc(v)}" ${state.friends.includes(v) ? 'disabled' : ''}>${state.friends.includes(v) ? '친구' : '친구 추가'}</button></div>`
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
  'friend-mail': el => { view.mailSubj = ''; view.mailTab = '메일 보내기'; view.mailOpen = null; view.mailAtt = {}; view.mailInvPage = 1; view.mailTo = el.dataset.name; openMail(); },
  'friend-guild-invite': async el => {
    const name = el.dataset.name, uid = (view.friendUid || {})[name];
    if (!uid || !(state.guild && state.guild.master)) { toast('길드장만 초대할 수 있어요.'); sfx('error'); return; }
    el.disabled = true;
    try {
      const r = await Cloud.guildInvite(uid);
      if (r && r.ok) { sfx('ok'); toast(`${name} 대원에게 길드 초대를 보냈어요. 수락하면 가입돼요.`); el.disabled = false; return; }
      el.disabled = false; sfx('error'); toast({ full: '길드가 가득 찼어요.', limit: '대기 중인 초대가 너무 많아요. (최대 10건)', target_in_guild: '이미 길드가 있는 대원이에요.', not_found: '초대할 수 없는 대원이에요.', not_master: '길드장만 초대할 수 있어요.' }[r && r.msg] || '초대하지 못했어요.');
    } catch (e) { el.disabled = false; toast('초대하지 못했어요.'); }
  },
  'friend-remove': el => askConfirm('친구 삭제', `정말로 ${el.dataset.name} 대원을 친구에서 삭제할까요?`, '삭제하기', 'friend-remove-do', { name: el.dataset.name }, () => openFriends(true)),
  'friend-remove-do': el => { const uid = view.friendUid && view.friendUid[el.dataset.name]; removeFriend(el.dataset.name); if (uid && Cloud.enabled && Cloud.user()) Cloud.removeFriend(uid).catch(() => {}); if (view.friendUid) delete view.friendUid[el.dataset.name]; openFriends(true); },
  'beacon-go': el => { const name = el.dataset.item, err = useBeacon(name, +el.dataset.ci, el.dataset.mk === undefined ? undefined : el.dataset.mk); if (err) { toast(err); sfx('error'); return; } closeModal(); resetPhase(); view.dpanSeed = null; renderBars(); renderBag(); renderMapHead(); renderMap(); renderAction(); renderSide(); renderQuick(); sfx('ok'); const z = state.dungeon; toast(`${name}의 신호를 따라 ${z.zone} ${(campsOf(z.zone).find(c => c.x === z.x && c.y === z.y) || {}).label || '캠프'}에 내려왔습니다.`); addLog(`${name} 사용 → ${z.zone} 캠프`); },
  'bagfull-inv': () => { closeModal(); const b = $('[data-ltab="INVENTORY"]'); if (b) b.click(); },
  'tmsg-open': () => openTrainMsg(),
  'tmsg-save': () => { state.trainMsg = { help: cleanText($('#tmHelp').value, DUEL_MSG_MAX), win: cleanText($('#tmWin').value, DUEL_MSG_MAX), lose: cleanText($('#tmLose').value, DUEL_MSG_MAX) }; save(); sfx('ok'); toast('훈련 메시지를 저장했어요.'); closeModal(); },
  'duel-practice': el => { const n = intIn(el.dataset.n, 1, DUEL_TEAM_MAX, 1), fs = [{ team: 1, me: true, ...duelClean(duelSnap(), state.character.name) }, ...duelDummies(n)];
    stopDuelTimers(); modal(`연습 대련 · 1 : ${n}`, duelRoomHtml({ id: 0 }, fs), ['<button data-act="duel-back">대련장으로</button>']); duelPlay(fs, 1 + Math.floor(Math.random() * 2e9), 0); },
  'duel-back': () => openDuel(),
  'duel-refresh': () => duelLoadList(),
  'duel-create': async el => { el.disabled = true; try { const r = await Cloud.duelCreate($('#duelTitle') ? $('#duelTitle').value : '', duelSnap()); if (r && r.ok) { const v = await Cloud.duelView(r.id); if (v) { openDuelRoom(v); return; } } toast('방을 만들지 못했어요.'); } catch (e) { toast('방을 만들지 못했어요. 서버에 supabase/friends.sql 최신본이 필요해요.'); } el.disabled = false; },
  'duel-join': async el => { const id = intIn(el.dataset.id, 1, 9e15, 0), t = el.dataset.team === '2' ? 2 : 1; try { const r = await Cloud.duelJoin(id, t, duelSnap()); if (!r || !r.ok) { toast({ full: '그 팀은 가득 찼어요.', closed: '이미 시작했거나 닫힌 방이에요.' }[r && r.msg] || '들어가지 못했어요.'); sfx('error'); duelLoadList(); return; } const v = await Cloud.duelView(id); if (v) { clearInterval(view.duelPoll); view.duelPoll = 0; openDuelRoom(v); } } catch (e) { toast('들어가지 못했어요.'); } },
  'duel-leave': async el => { const id = intIn(el.dataset.id, 1, 9e15, 0); stopDuelTimers(); try { await Cloud.duelLeave(id); } catch (e) { /* 이미 닫힘 */ } openDuel(); },
  'duel-start': async el => { const id = intIn(el.dataset.id, 1, 9e15, 0); el.disabled = true; try { const r = await Cloud.duelStart(id); if (!r || !r.ok) { toast(r && r.msg === 'need_two' ? '양 팀에 한 명 이상 있어야 해요.' : '시작하지 못했어요.'); el.disabled = false; return; } const v = await Cloud.duelView(id); if (v) openDuelRoom(v); } catch (e) { toast('시작하지 못했어요.'); el.disabled = false; } },
  'lostbox-take': el => { const r = lostBoxTake(+el.dataset.i); if (typeof r === 'string') { toast(r); sfx('error'); return; } sfx('ok'); toast(`${shownName(r.n)} ×${r.q}을(를) 가방에 넣었습니다.`); renderBag(); openLostBox(); },
  'lostbox-all': () => { let n = 0, err = ''; for (let i = state.lostBox.length - 1; i >= 0; i--) { const r = lostBoxTake(i); if (typeof r === 'string') err = r; else n += r.q; } if (n) { sfx('ok'); toast(`보관함에서 ${n}개를 가방에 넣었습니다.${state.lostBox.length ? ' (자리가 모자라 일부는 남았어요)' : ''}`); } else if (err) { toast(err); sfx('error'); } renderBag(); openLostBox(); },
  'avatar-zoom': el => openAvatarZoom(el.dataset.name),
  'codex-journal': el => { codexView.jIdx = +el.dataset.j || 0; $('#codexRoot').innerHTML = codexHtml(); },
  'codex-tab': el => { codexView.tab = el.dataset.codex; codexView.sub = null; codexView.q = ''; $('#codexRoot').innerHTML = codexHtml(); },
  'codex-sort': el => { codexView.sort = el.dataset.sort || ''; $('#codexRoot').innerHTML = codexHtml(); },
  'codex-sub': el => { codexView.sub = el.dataset.sub || null; $('#codexRoot').innerHTML = codexHtml(); },
  'logout-ok': () => { closeModal(); if (Cloud.enabled && Cloud.user()) { if (_cloudTimer) { clearTimeout(_cloudTimer); _cloudTimer = 0; cloudAutoPush().finally(() => A['cloud-logout']()); } else A['cloud-logout'](); } else toast('서버 인증 기능은 아직 연결되지 않았습니다.'); },
};
/* 프로필 사진 크게 보기: 프로필 창 위에 겹치는 오버레이(누르면 닫힘). 남의 사진은 300px 큰 이미지를 그때만 받는다 */
const avBig = {};
async function openAvatarZoom(name) {
  const mine = name === state.character.name, ok = v => typeof v === 'string' && AV_RE.test(v);
  let img = mine ? getAvatar() : (avBig[name] || view.avatars[name]);
  if (!ok(img)) return;
  let z = $('#avZoom'); if (!z) { z = document.createElement('div'); z.id = 'avZoom'; z.className = 'av-zoom'; z.addEventListener('click', () => z.remove()); document.body.appendChild(z); }
  z.innerHTML = `<img src="${esc(img)}" alt="${esc(name)} 프로필 사진"><span class="tiny">${esc(name)} · 누르면 닫혀요</span>`;
  if (mine || avBig[name] || !(Cloud.enabled && Cloud.user() && Cloud.avatarBig)) return;
  try { const b = await Cloud.avatarBig(name); if (ok(b)) { avBig[name] = b; const im = $('#avZoom img'); if (im) im.src = b; } } catch (e) { /* 큰 이미지가 없으면 작은 것 그대로 */ }
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#avZoom')) { $('#avZoom').remove(); e.stopPropagation(); } }, true);
function otherEquipHtml(eq, who) { // 다른 대원의 착용 장비 (서버가 준 {칸: 이름}을 걸러서 내 장비 탭과 같은 칸 UI로)
  const safe = {}; if (eq && typeof eq === 'object') EQUIP_SMALL.concat(EQUIP_BIG).forEach(sl => { const n = eq[sl]; if (typeof n === 'string' && ITEMS[n] && ITEMS[n].tab === '장비' && ITEMS[n].slot === sl) safe[sl] = n; /* 히든 장비(안대 등)도 착용 중이면 보인다 */ });
  const cell = (sl, big) => { const n = safe[sl], it = n && ITEMS[n]; return `<div class="slot ${big ? 'big' : ''} ${it ? 'filled' : ''}" ${it ? `data-tip-title="${esc(n)}" data-tip-desc="${esc(itemLines(n, true).filter(Boolean).join('\n'))}"` : `data-tip-title="${esc(sl)} · 비어 있음" data-tip-desc=""`} aria-label="${esc(sl)}">${it ? icon(it.icon) : `<span class="slot-label">${esc(sl)}</span>`}</div>`; };
  return `<div class="choice-label equip-head"><span>착용 장비</span>${who ? roomPeekBtn(who) : ''}</div><div class="equip-wrap other-equip"><div class="equip-grid">${EQUIP_SMALL.map(s => cell(s)).join('')}</div><div class="equip-big">${EQUIP_BIG.map(s => cell(s, true)).join('')}</div></div>`;
}
const myCard = () => { const c = state.character; return { name: c.name, online: true, level: c.level, rank: c.rank, ability: c.ability, abilityDesc: c.abilityDesc, title: c.title, age: c.age, guild: state.guild ? state.guild.name : '', keywords: c.keywords, equipment: state.equipment, mainStat: c.mainStat, subStat: c.subStat }; };
async function viewUser(name) { // 이름·아이콘을 누르면 그 대원의 프로필을 보여준다. 나도 남이 보는 것과 같은 화면 (편집은 왼쪽 위 내 사진을 눌렀을 때만)
  const me = name === '나' || name === state.character.name; if (me) name = state.character.name;
  const cell = (k, v) => `<div class="uc"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
  const draw = (r, uid, note) => {
    const has = !me && state.friends.includes(name), p = samplePlayer(name), pr = r && r.ability !== undefined ? r : null;
    const st = r ? (r.online ? '온라인' : '자리 비움') : (REMOTE_PLAYERS[name] || (p && p[1]) || '알 수 없음');
    const kw = pr ? String(pr.keywords || '').split(',').map(t => t.trim()).filter(Boolean).map(t => '#' + cleanText(t, 10)).join(' ') : '';
    modal('프로필', `<div class="user-card"><div class="round-avatar big zoomable" data-act="avatar-zoom" data-name="${esc(name)}" title="크게 보기">${avatarOf(name)}</div><div class="uc-name">${pr && pr.title ? `<span class="title-chip">${esc(cleanText(pr.title, 20))}</span>` : ''}<strong>${esc(name)}</strong></div>${pr ? `<div class="uc-ability"><b>${icon('bolt')} 이능력 · ${esc(cleanText(pr.ability, 20) || '미설정')}</b><p>${esc(cleanText(pr.abilityDesc, 300) || '이능력 설명이 없습니다.')}</p>${abilityStatChips({ mainStat: STAT_DEFS.some(d => d.key === pr.mainStat) ? pr.mainStat : '', subStat: STAT_DEFS.some(d => d.key === pr.subStat) && pr.subStat !== pr.mainStat ? pr.subStat : '' })}</div>` : ''}</div>` +
      `<div class="user-grid">${cell('상태', st)}${r ? cell('레벨', 'Lv.' + intIn(r.level, 1, MAX_LEVEL, 1)) + cell('등급', ('FEDCBAS'.includes(r.rank) ? r.rank : 'F') + '등급') : ''}${pr ? cell('나이', intIn(pr.age, 0, 999, 0) + '세') : ''}${cell('관계', me ? '나' : has ? '친구' : '친구 아님')}${pr ? cell('길드', pr.guild ? cleanText(pr.guild, 12) : '-') : ''}</div>` +
      (kw ? `<div class="char-tags">${esc(kw)}</div>` : '') + (pr && pr.equipment ? otherEquipHtml(pr.equipment, name) : pr ? '<p class="tiny">장비 정보는 서버에 supabase/friends.sql 최신본을 실행하면 보여요.</p>' : '') +
      (pr ? '' : (Cloud.enabled && Cloud.user() ? `<p class="tiny">${esc(note || '자세한 프로필을 불러오는 중…')}</p>` : '<p class="tiny">서버에 로그인하면 이능력 등 자세한 프로필을 볼 수 있어요.</p>')),
      me ? [btnClose] : [btnClose, (PARTY.members.some(m => m.name === name) || (view.nearby || []).some(p => p.name === name)) ? `<button class="primary" data-act="ftrade-open" data-name="${esc(name)}">교환</button>` : '', uid && chatOnline() && (!PARTY.id || partyLeader()) && !PARTY.members.some(m => m.name === name) ? `<button data-act="party-invite" data-uid="${esc(uid)}" data-name="${esc(name)}">파티 초대</button>` : '', !has && uid ? `<button class="primary" data-act="friend-req" data-uid="${esc(uid)}" data-name="${esc(name)}">친구 신청</button>` : ''].filter(Boolean));
    view.userShown = name;
  };
  if (me) { draw(myCard(), ''); return; } // 내 정보는 서버에 묻지 않고 지금 상태로
  draw(null, '');
  if (!(Cloud.enabled && Cloud.user())) return;
  const ok = f => f && view.userShown === name && $('#overlay').classList.contains('open') && $('#modalBody').querySelector('.user-card');
  let why = '프로필을 찾지 못했어요. (닉네임이 바뀌었거나 없는 대원일 수 있어요)';
  try {
    const f = await Cloud.getProfile(name);
    if (f && typeof f === 'object' && f.name) { if (ok(f)) draw(f, /^[0-9a-f-]{36}$/i.test(f.uid) ? f.uid : ''); return; }
  } catch (e) { why = '자세한 프로필(이능력 등)은 서버에 supabase/friends.sql 최신본을 실행해야 볼 수 있어요.'; }
  try {
    const f = (await Cloud.searchPlayers(name)).find(r => r && cleanText(r.name, 12) === name);
    if (ok(f)) { draw(f, /^[0-9a-f-]{36}$/i.test(f.uid) ? f.uid : '', why); return; }
  } catch (e) { /* 서버 정보를 못 받아도 기본 정보는 보여준다 */ }
  if (ok(true)) draw(null, '', why);
}
document.addEventListener('click', e => {
  const u = e.target.closest('[data-user]');
  if (u && !e.target.closest('button')) { viewUser(u.dataset.user); return; }
  const el = e.target.closest('[data-act]');
  if (el && !el.disabled && A[el.dataset.act]) A[el.dataset.act](el, e);
});

/* 같은 칸에 제작자가 다른 것이 섞여 있을 때: 소지품처럼 네모 칸으로 보여 주고 하나를 고른다 */
function variantCells(name, vs, act, sel) {
  const it = ITEMS[name];
  return vs.map(v => `<button class="slot clickable filled vpick ${v.mk ? 'has-mk' : ''} ${v.mk === sel ? 'selected' : ''}" data-act="${act}" data-item="${esc(name)}" data-mk="${esc(v.mk)}" aria-pressed="${v.mk === sel}" data-tip-title="${esc(shownName(name))}" data-tip-desc="${esc(itemTip(name, v.mk))}" aria-label="${esc(`${name} · ${v.mk || '이름 없음'}`)}">${icon(it.icon)}<span class="mk-label">${esc(mkShort(v.mk))}</span>${v.q > 1 ? `<span class="qty">${v.q}</span>` : ''}</button>`).join('');
}
/* ---------- 퀵슬롯 (오른쪽 끝 세로 막대): 위에는 소리 켜고 끄기, 아래는 등록한 소모품 (누르면 1개 사용, 오른쪽 클릭으로 빼기) ---------- */
function quickTop() { const bar = $('#quickBar'), col = $('.right-column') || $('#layout'); if (bar && col) bar.style.top = Math.max(0, Math.round(col.getBoundingClientRect().top)) + 'px'; } // 퀵슬롯 윗부분을 다른 탭 윗부분과 맞춘다
addEventListener('resize', () => quickTop()); if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => quickTop());
function renderQuick() {
  let bar = $('#quickBar');
  if (!bar) { bar = document.createElement('aside'); bar.id = 'quickBar'; bar.addEventListener('pointerover', e => { const b = e.target.closest('[data-qi]'), n = b && state.quick[+b.dataset.qi]; if (n && ITEMS[n] && ITEMS[n].use && !ITEMS[n].use.warp && !ITEMS[n].use.camp && countItem(n)) { view.quickPv = n; renderBars(useGain(n, 1)); } }); bar.addEventListener('pointerout', e => { if (view.quickPv && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('[data-qi]'))) { view.quickPv = null; renderBars(); } }); bar.className = 'quick-bar'; bar.setAttribute('aria-label', '퀵슬롯'); document.body.appendChild(bar); bar.addEventListener('contextmenu', e => { const b = e.target.closest('[data-qi]'); if (!b) return; e.preventDefault(); if (quickClear(+b.dataset.qi)) { renderQuick(); toast('퀵슬롯에서 뺐습니다.'); } }); }
  const on = state.created && state.settings.quickBar !== false, st = state.settings, open = !!state.quickOpen;
  document.body.classList.toggle('has-quick', on); bar.classList.toggle('hidden', !on); bar.classList.toggle('open', open);
  quickTop();
  if (!on) return;
  const name = n => esc(n.length > QUICK_NAME_MAX ? n.slice(0, QUICK_NAME_MAX) + '…' : n);
  const snd = (k, ic, off, label) => `<button class="qs snd ${st[k] ? '' : 'off'}" data-act="quick-snd" data-k="${k}" title="${label} ${st[k] ? '끄기' : '켜기'}" aria-pressed="${!!st[k]}">${icon(st[k] ? ic : off)}<span class="qs-name">${label}</span></button>`;
  bar.innerHTML = snd('bgmOn', 'music_note', 'music_off', '배경음악') + snd('clickOn', 'touch_app', 'do_not_touch', '클릭음') + snd('alertOn', 'notifications_active', 'notifications_off', '알림음') + '<i class="qs-sep"></i>' +
    state.quick.map((n, i) => { const it = n && ITEMS[n], q = n ? countItem(n) : 0; return it ? `<button class="qs item ${q ? '' : 'empty'}" data-act="quick-use" data-qi="${i}" data-tip-title="${esc(n)} ×${q}" data-tip-desc="${esc((it.use && !it.use.warp && !it.use.camp && q ? `사용하면 ${useGainText(n, 1)}${useFull(n, 1) ? ' (이미 가득 참)' : ''}\n` : '') + '누르면 1개 사용 · 오른쪽 클릭: 퀵슬롯에서 빼기')}">${icon(it.icon)}${q > 1 ? `<span class="qty">${q > 99 ? '99+' : q}</span>` : ''}<span class="qs-name">${name(n)}</span></button>` : `<div class="qs blank" title="소지품의 소모품을 눌러 '퀵슬롯 등록'"></div>`; }).join('') +
    `<button class="qs toggle" data-act="quick-toggle" title="${open ? '접기' : '펼치기 (이름 보기)'}" aria-expanded="${open}">${icon(open ? 'chevron_right' : 'chevron_left')}</button>`;
}
function equipChange(slot, name, doneText, mk) {
  const prev = state.equipment[slot], res = changeEquipment(slot, name, mk);
  if (res === 'space') { toast('인벤토리 공간이 부족해 변경할 수 없습니다.'); return; }
  if (!res) return;
  closeModal(); renderBag(); renderBuffs(true); save();
  const msg = `${name || prev}을(를) ${doneText}`;
  toast(msg);
}

/* ---------- 정적 요소 연결 ---------- */
$('#closeModal').onclick = closeModal;
$('#overlay').onclick = e => { if (e.target === $('#overlay')) closeModal(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); if (e.key === 'Enter' && e.target && e.target.id === 'todoIn' && !e.isComposing) { e.preventDefault(); A['todo-add'](); } });
/* ---------- 대원 간 거래 (상점가 '대원 간 상점' · 상단 아이콘으로 어디서든) ---------- */
let _mkBusy = false;
const isMkOpen = () => $('#overlay').classList.contains('open') && !!$('#mkRoot'); // 닫힌 창의 내용이 남아 있어도 열린 것으로 보지 않는다 (백그라운드 확인이 창을 다시 띄우지 않게)
async function marketSync() { // 내가 올린 것·처리 중인 구매를 서버와 맞춘다 (비어 있으면 아무것도 보내지 않는다)
  if (!Cloud.enabled || !Cloud.user() || !state.created || _mkBusy) return;
  if (!state.market.sell.length && !state.market.buy.length) return;
  _mkBusy = true;
  try {
    for (const b of state.market.buy.slice()) { // 결과를 모르는 구매는 다시 확인한다 (이미 산 것이면 같은 답이 온다)
      const r = marketBuyResult(b.req, await Cloud.marketBuy(b.id, b.qty, b.req)); if (r === 'ok') toast(`${b.item} ×${b.qty} 구매가 처리됐어요.`); else if (r !== 'retry') toast('이미 팔려서 CR을 돌려받았어요.');
    }
    if (state.market.sell.length) {
      for (const e of state.market.sell.filter(x => !x.id)) { try { const r = await Cloud.marketList(e.key, e.item, e.qty, e.price, e.mk || ''); if (r && r.ok === false && r.msg) { state.market.sell = state.market.sell.filter(x => x !== e); marketGiveBack(e, e.qty, 'r' + e.key.slice(-6)); toast('거래 등록이 거절돼 물건을 돌려받았어요.'); } } catch (x) { /* 다음에 다시 */ } }
      const out = marketSettleSell(await Cloud.marketMine());
      out.sold.forEach(s => { toast(`${s.item} ×${s.qty}이(가) 팔렸어요! +${s.net} CR`); addLog(`거래: ${s.item} ×${s.qty} 판매 (+${s.net} CR)`); sfx('ok'); });
      out.back.forEach(s => toast(`${s.item} ×${s.qty} 거래가 끝나 물건을 돌려받았어요.`));
      for (const id of out.acks) { try { await Cloud.marketAck(id); } catch (x) { /* 다음에 다시 */ } }
    }
    renderBag(); renderProfile(); renderMailBadge();
  } catch (e) { /* 서버 준비 전 */ } finally { _mkBusy = false; if (isMkOpen()) renderMarket(true); }
}
async function marketBrowse() {
  view.mkList = null; if (isMkOpen()) renderMarket(true);
  try { const r = await Cloud.marketBrowse(view.mkQ || ''); view.mkList = (Array.isArray(r) ? r : []).slice(0, 300).map(x => ({ id: intIn(x && x.id, 1, 9e15, 0), mine: !!(x && x.mine === true), item: x && x.item, mk: x && typeof x.mk === 'string' ? cleanText(x.mk, MK_LEN) : '', qty: intIn(x && x.qty, 1, 99, 1), price: intIn(x && x.price, 1, MARKET_TOTAL_MAX, 1) })).filter(x => x.id && ITEMS[x.item]); }
  catch (e) { view.mkList = []; view.mkErr = true; }
  if (isMkOpen()) renderMarket(true);
}
function marketHtml() {
  const tab = ['사기', '팔기', '내 목록'].includes(view.mkTab) ? view.mkTab : '사기';
  const tabs = `<div class="tabs flush">${['사기', '팔기', '내 목록'].map(t => `<button class="${t === tab ? 'active' : ''}" data-act="mk-tab" data-tab="${t}">${t}${t === '내 목록' && state.market.sell.length ? ` ${state.market.sell.length}` : ''}</button>`).join('')}</div>`;
  let body;
  if (tab === '사기') {
    const rows = view.mkList == null ? '<div class="empty">불러오는 중…</div>' : view.mkList.map(x => `<div class="shop-row"><span class="shop-ic">${icon(ITEMS[x.item].icon)}</span><div class="grow"><strong>${esc(shownName(x.item))} <span class="tiny">남은 ${x.qty}개</span></strong>${x.mk ? `<small class="mk-line">제작 · ${esc(x.mk)}</small>` : ''}<small class="tiny">개당 ${x.price} CR${tradeValue(x.item) ? ` (상점 시세 ${tradeValue(x.item)} CR)` : ''}</small></div>${x.mine ? '<em class="tag" title="내가 올린 상품이에요. 내 목록에서 취소할 수 있어요.">내 상품</em>' : `<input type="number" class="mk-n" id="mkN${x.id}" min="1" max="${x.qty}" value="1" aria-label="살 개수"><button class="primary" data-act="mk-buy" data-id="${x.id}">구매</button>`}</div>`).join('') || `<div class="empty">${view.mkErr ? '서버에 연결하지 못했어요.' : '올라온 물건이 없어요.'}</div>`;
    body = `<div class="mk-search"><input id="mkQ" maxlength="20" placeholder="물건 이름 검색" value="${esc(view.mkQ || '')}"><button data-act="mk-search">검색</button><button data-act="mk-refresh">새로고침</button></div><div class="shop-list">${rows}</div>`;
  } else if (tab === '팔기') {
    const vs = invVariants().filter(v => ITEMS[v.n] && !ITEMS[v.n].hidden && v.n !== MAIL_SHIP_ITEM).sort((x, y) => ITEMS[x.n].tab.localeCompare(ITEMS[y.n].tab) || x.n.localeCompare(y.n)), keys = vs.map(v => vKey(v.n, v.mk));
    const selK = keys.includes(view.mkItem) ? view.mkItem : keys[0], selV = vs[keys.indexOf(selK)], sel = selV && selV.n; // 제작자가 다르면 따로 고른다
    body = vs.length ? `<div class="mk-sell"><label>물건<select id="mkItem">${vs.map((v, i) => `<option value="${esc(keys[i])}" ${keys[i] === selK ? 'selected' : ''}>${esc(shownName(v.n))}${v.mk ? ` · ${esc(v.mk)}` : ''} (×${v.q})</option>`).join('')}</select></label>` +
      `<label>수량<input id="mkQty" type="number" min="1" max="${Math.min(99, selV.q)}" value="1"></label><label>개당 가격(CR)<input id="mkPrice" type="number" min="1" max="${marketUnitMax(sel)}" value="${Math.max(1, tradeValue(sel))}"></label>` +
      `<p class="tiny">상점 시세 ${tradeValue(sel)} CR · 개당 최대 ${marketUnitMax(sel)} CR · 한 건 전체 ${MARKET_TOTAL_MAX} CR까지 · 사는 대원이 원하는 개수만큼 나눠 살 수 있고, 팔린 만큼 수수료 ${Math.round(MARKET_FEE * 100)}%를 뗍니다. 올린 물건은 소지품에서 빠지고, 취소하거나 3일이 지나면 돌아옵니다. (동시 ${MARKET_SLOTS}건)</p><button class="primary" data-act="mk-list">올리기</button></div>` : '<div class="empty">팔 수 있는 소지품이 없어요.</div>';
  } else if (tab === '내 목록') {
    const rows = state.market.sell.map(e => `<div class="shop-row"><span class="shop-ic">${icon(ITEMS[e.item].icon)}</span><div class="grow"><strong>${esc(shownName(e.item))} <span class="tiny">×${e.qty}</span></strong>${e.mk ? `<small class="mk-line">제작 · ${esc(e.mk)}</small>` : ''}<small class="tiny">개당 ${e.price} CR · ${e.id ? `판매 중${e.got ? ` (${e.got}개 팔림)` : ''}` : '등록 중… (연결되면 올라가요)'}</small></div>${e.id ? `<button data-act="mk-cancel" data-id="${e.id}">취소</button>` : ''}</div>`).join('') || '<div class="empty">올려 둔 물건이 없어요.</div>';
    body = rows + (state.market.buy.length ? `<p class="tiny">처리 중인 구매 ${state.market.buy.length}건 — 결과가 확인되면 바로 소지품에 들어옵니다.</p>` : '');
  }
  return `<div id="mkRoot">${tabs}${body}</div>`;
}
function renderMarket(keep) {
  const sc = keep && $('#modalBody') ? $('#modalBody').scrollTop : 0, q = $('#mkQ') ? $('#mkQ').value : null, act = document.activeElement && document.activeElement.id;
  modal('대원 간 거래', marketHtml(), [btnClose], true);
  if (q != null && $('#mkQ')) { $('#mkQ').value = q; if (act === 'mkQ') $('#mkQ').focus(); }
  if ($('#modalBody')) $('#modalBody').scrollTop = sc;
}
function openMarket(tab) {
  if (!(Cloud.enabled && Cloud.user())) { modal('대원 간 거래', '<p class="detail-desc">서버에 로그인해야 다른 대원과 거래할 수 있어요.</p>', [btnClose], true); return; }
  view.mkTab = tab || view.mkTab || '사기'; renderMarket(); marketSync(); if (view.mkTab === '사기' && view.mkList == null) marketBrowse();
}
if ($('#tradeHubBtn')) { $('#tradeHubBtn').title = '대원 간 거래'; $('#tradeHubBtn').onclick = () => openMarket(); }
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
const SETTING_IDS = ['bgmOn', 'bgmVolume', 'clickOn', 'alertOn', 'sfxVolume', 'notifyOn', 'guildAlertOn', 'cursorOn', 'quickBarOn', 'themeSelect', 'customBase', 'customAccent', 'fontSize', ...CHAT_TABS.map(k => 'ctab_' + k)];
document.addEventListener('change', e => { if (e.target.id === 'mkItem') { A['mk-pick'](); return; } if (SETTING_IDS.includes(e.target.id) && e.target.closest('#modalBody')) applySettingsNow(); }); // 설정은 바꾸는 즉시 저장
document.addEventListener('change', e => {
  if (e.target.id === 'themeSelect') $('#customOpts').classList.toggle('hidden', e.target.value !== 'custom');
  if (['themeSelect', 'customBase', 'customAccent', 'cursorOn', 'fontSize'].includes(e.target.id)) previewTheme();
});

/* 프로필 창 → 그 안의 사진 버튼 → 이미지 선택. 이미지는 올리기 전에 작게 줄여 저장한다 (서버 부담↓) */
const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], AVATAR_PX = 300, AVATAR_MAX_BYTES = 200 * 1024;
async function compressImage(src, rect) { // 고른 정사각형 범위(rect)를 잘라 가장 긴 변 300px, WebP(미지원이면 JPEG)로 압축. 결과 200KB 이하
  const bmp = src instanceof Blob ? await createImageBitmap(src) : src;
  const r = rect || { x: 0, y: 0, w: bmp.width, h: bmp.height }, k = Math.min(1, AVATAR_PX / Math.max(r.w, r.h));
  const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(r.w * k)); cv.height = Math.max(1, Math.round(r.h * k));
  cv.getContext('2d').drawImage(bmp, r.x, r.y, r.w, r.h, 0, 0, cv.width, cv.height); if (src instanceof Blob && bmp.close) bmp.close();
  let out = '';
  for (const q of [.82, .7, .55, .4]) { out = cv.toDataURL('image/webp', q); if (!out.startsWith('data:image/webp')) out = cv.toDataURL('image/jpeg', q); if (out.length * .75 <= AVATAR_MAX_BYTES) break; }
  return out;
}
/* 이미지 자르기: 큰 이미지도 정사각형 범위를 직접 골라 자를 수 있다 (끌어서 이동 · 오른쪽 아래 모서리/슬라이더로 크기) */
async function startCrop(file) {
  const bmp = await createImageBitmap(file), W = bmp.width, H = bmp.height, s0 = Math.min(W, H), k = 300 / Math.max(W, H);
  const c = view.crop = { bmp, W, H, k, x: (W - s0) / 2, y: (H - s0) / 2, s: s0, min: Math.max(8, Math.round(s0 * .08)) };
  modal('프로필 이미지 자르기', `<p class="tiny">사진에서 쓸 부분을 정사각형으로 골라 주세요. 네모를 끌어 움직이고, 오른쪽 아래 모서리나 슬라이더로 크기를 바꿔요.</p>` +
    `<div class="crop-wrap"><canvas id="cropCv" width="${Math.round(W * k)}" height="${Math.round(H * k)}"></canvas></div>` +
    `<div class="srow fontrow pf-row"><span>범위 크기</span><input type="range" id="cropSize" min="${c.min}" max="${s0}" value="${s0}"></div>`,
    ['<button data-act="crop-cancel">취소</button>', '<button class="primary" data-act="crop-ok">적용</button>'], true);
  const cv = $('#cropCv'), ctx = cv.getContext('2d'), clampN = (v, a, b) => Math.max(a, Math.min(b, v));
  const draw = () => {
    const w = cv.width, h = cv.height, sx = c.x * k, sy = c.y * k, ss = c.s * k;
    ctx.clearRect(0, 0, w, h); ctx.drawImage(c.bmp, 0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, w, sy); ctx.fillRect(0, sy + ss, w, h - sy - ss); ctx.fillRect(0, sy, sx, ss); ctx.fillRect(sx + ss, sy, w - sx - ss, ss);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(sx, sy, ss, ss);
    ctx.fillStyle = '#fff'; ctx.fillRect(sx + ss - 9, sy + ss - 9, 12, 12);
    $('#cropSize').value = Math.round(c.s);
  };
  let mode = null, last = null;
  const pt = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * (cv.width / r.width) / k, y: (e.clientY - r.top) * (cv.height / r.height) / k }; };
  cv.onpointerdown = e => {
    const p = pt(e), hx = c.x + c.s, hy = c.y + c.s, hr = 16 / k;
    if (Math.abs(p.x - hx) < hr && Math.abs(p.y - hy) < hr) mode = 'size';
    else { mode = 'move'; if (!(p.x >= c.x && p.x <= hx && p.y >= c.y && p.y <= hy)) { c.x = clampN(p.x - c.s / 2, 0, W - c.s); c.y = clampN(p.y - c.s / 2, 0, H - c.s); } }
    last = p; try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ } draw();
  };
  cv.onpointermove = e => {
    if (!mode) return; const p = pt(e), dx = p.x - last.x, dy = p.y - last.y; last = p;
    if (mode === 'move') { c.x = clampN(c.x + dx, 0, W - c.s); c.y = clampN(c.y + dy, 0, H - c.s); }
    else c.s = clampN(c.s + Math.max(dx, dy), c.min, Math.min(W - c.x, H - c.y));
    draw();
  };
  cv.onpointerup = cv.onpointercancel = () => { mode = null; };
  $('#cropSize').oninput = e => { const cx = c.x + c.s / 2, cy = c.y + c.s / 2; c.s = clampN(+e.target.value, c.min, Math.min(W, H)); c.x = clampN(cx - c.s / 2, 0, W - c.s); c.y = clampN(cy - c.s / 2, 0, H - c.s); draw(); };
  draw();
}
const statOpts = (cur, skip) => `<option value="">선택 안 함</option>${STAT_DEFS.filter(d => d.key !== skip).map(d => `<option value="${d.key}" ${d.key === cur ? 'selected' : ''}>${d.name}</option>`).join('')}`;
const abilityStatChips = c => (c.mainStat || c.subStat) ? `<div class="ab-stats">${c.mainStat ? `<span class="ab-chip main" title="주 스탯: 해당 스테이터스 +${MAIN_STAT_BONUS}">주 ${STAT_DEFS.find(d => d.key === c.mainStat).name} +${MAIN_STAT_BONUS}</span>` : ''}${c.subStat ? `<span class="ab-chip" title="부 스탯: 해당 스테이터스 +${SUB_STAT_BONUS}">부 ${STAT_DEFS.find(d => d.key === c.subStat).name} +${SUB_STAT_BONUS}</span>` : ''}</div>` : '';
function openProfile(keepScroll) {
  const st0 = keepScroll === true && $('#modalBody') ? $('#modalBody').scrollTop : 0;
  const c = state.character, img = getAvatar(), tags = c.keywords.split(',').map(t => t.trim()).filter(Boolean).map(t => '#' + t).join(' ');
  // 이미 열려 있는 입력칸에 쓴 내용은 창을 다시 그려도 지우지 않는다
  const dr = $('#cName') ? { ab: $('#cAbility').value, name: $('#cName').value, age: $('#cAge').value, kw: $('#cKeywords').value, desc: $('#cAbilityDesc').value, fr: $('#cFriend').checked, gu: $('#cGuild').checked, ms: $('#cMain').value, ss: $('#cSub').value } : null;
  const lock = profileLockLeft(), editing = !!view.profEdit && lock <= 0, dis = editing ? '' : 'disabled', statFree = lock > 0 && !c.mainStat && !c.subStat, sdis = editing || statFree ? '' : 'disabled'; // 수정 버튼을 눌러야 입력칸이 열린다 (주·부 스탯이 아직 없으면 쿨타임 중에도 그것만 고를 수 있다)
  const row = (label, inner) => `<div class="srow fontrow pf-row"><span>${label}</span>${inner}</div>`;
  modal('프로필', `<div class="profile-card"><button class="avatar big ${img ? '' : 'empty'}" data-act="avatar-pick" title="이미지 변경" aria-label="프로필 이미지 변경">${img ? `<img src="${esc(img)}" alt="프로필">` : icon('add_a_photo')}<span class="avatar-edit">${icon('photo_camera')}</span></button>` +
    `<div class="pc-info"><div class="title-chip" id="pcTitle">${esc(c.title)}</div><strong>${esc(c.name || '-')}</strong><div class="char-meta">LV.${c.level}　${esc(c.rank)}등급　${c.age}세</div><div class="char-tags">${esc(tags)}</div>${state.subjob ? `<div class="char-job">${esc(`서브잡 · ${state.subjob.name} Lv.${state.subjob.level}`)}</div>` : ''}</div><div class="pf-sw">${sw('cFriend', '친구 추가 허용', dr ? dr.fr : c.allowFriend, 'near', dis)}${sw('cGuild', '길드 초대 허용', dr ? dr.gu : c.allowGuild, 'near', dis)}</div></div>` +
    `<div class="pc-ability"><b>${icon('bolt')} 이능력 · ${esc(c.ability || '미설정')}</b><p>${esc(c.abilityDesc || '이능력 설명이 없습니다.')}</p>${abilityStatChips(c)}</div>` +
    `<div class="choice-label">칭호 ${state.titles.length}개 보유 · 눌러서 착용</div><div class="title-strip"><button class="ts-arrow hidden" data-act="title-scroll" data-d="-1" aria-label="이전 칭호">${icon('chevron_left')}</button><div class="title-chips" id="titleChips">${TITLE_DEFS.filter(([n]) => state.titles.includes(n)).map(([n, d]) =>
      `<button class="tchip ${c.title === n ? 'on' : ''}" data-act="title-set" data-title="${esc(n)}" title="달성: ${esc(d)}">${esc(n)}</button>`).join('')}</div><button class="ts-arrow hidden" data-act="title-scroll" data-d="1" aria-label="다음 칭호">${icon('chevron_right')}</button></div>` +
    `<div class="setting-group"><div class="pf-head"><h3>캐릭터 정보</h3><div class="pf-side">${editing ? `<button class="pf-edit on" data-act="profile-edit-cancel">${icon('close')} 편집 취소</button>` : `<button class="pf-edit" data-act="profile-edit" ${lock > 0 ? 'disabled' : ''}>${icon('edit')} 편집</button>`}</div></div>` +
    (lock > 0 ? `<p class="tiny">프로필(칭호 제외)은 수정 후 24시간이 지나야 다시 바꿀 수 있어요. 남은 시간 ${fmtLong(lock)}${statFree ? ' · 주·부 스탯은 아직 정하지 않아서 지금 고를 수 있어요.' : ''}</p>` : state.profileEditAt ? '' : '<p class="tiny">첫 수정은 바로 가능하고, 그 뒤에는 24시간마다 한 번 수정할 수 있어요.</p>') +
    row('이름', `<input id="cName" maxlength="12" ${dis} value="${esc(dr ? dr.name : c.name)}">`) +
    row('나이', `<input id="cAge" ${dis} type="number" min="${AGE_MIN}" max="${AGE_MAX}" value="${esc(dr ? dr.age : c.age)}">`) +
    row('키워드', `<input id="cKeywords" maxlength="60" ${dis} placeholder="쉼표로 구분 (예: 과묵, 정찰)" value="${esc(dr ? dr.kw : c.keywords)}">`) +
    row('이능력 이름', `<input id="cAbility" maxlength="20" ${dis} value="${esc(dr ? dr.ab : c.ability)}">`) +
    row('이능력 설명', `<textarea id="cAbilityDesc" maxlength="300" ${dis} placeholder="어떤 능력인지 자유롭게 적어 주세요">${esc(dr ? dr.desc : c.abilityDesc)}</textarea>`) +
    row('주·부 스탯', `<div class="ab-sel"><select id="cMain" ${sdis} aria-label="주 스탯" title="주 스탯 +${MAIN_STAT_BONUS}">${statOpts(dr ? dr.ms : c.mainStat, '')}</select><select id="cSub" ${sdis} aria-label="부 스탯" title="부 스탯 +${SUB_STAT_BONUS}">${statOpts(dr ? dr.ss : c.subStat, '')}</select></div>`) +
    `<p class="tiny">이능력과 어울리는 스테이터스 두 개를 고르면 주 스탯 +${MAIN_STAT_BONUS}, 부 스탯 +${SUB_STAT_BONUS}이 적용돼요. (프로필 수정 간격에 따라 바꿀 수 있어요)</p>` +
    `</div>` +
    `<p class="tiny">사진 버튼을 눌러 이미지를 고르면 ${AVATAR_PX}px로 자동 압축됩니다. (png·jpg·webp·gif)</p>`,
    [`<button data-act="avatar-clear" ${img ? '' : 'disabled'}>이미지 삭제</button>`, `<button class="primary" data-act="char-save" ${editing || statFree ? '' : 'disabled'}>저장</button>`]);
  $('#modalBody').scrollTop = st0;
  initTitleStrip();
}
function resetUiDefaults() { // 설정 > 표시 > UI 기본값: 화면 배치·확대·글자 크기만 처음으로 (진행·소리·테마는 그대로)
  const d = createDefaultState();
  state.layout = { ...d.layout }; state.collapsed = {}; state.zoom = d.zoom ?? 1; state.pan = { ...(d.pan || { x: 0, y: 0 }) };
  state.settings.fontSize = d.settings.fontSize; state.settings.cursor = d.settings.cursor;
  view.dpan = { x: 0, y: 0 }; view.dzoom = 1; view.statusPage = 0; view.statSlide = {};
  $$('.panel.collapsed').forEach(p => p.classList.remove('collapsed'));
  applyTheme(); applyLayout(); applyMapTransform(); renderStatus(); renderMap(); save();
}
/* 칭호 목록: 많아져 한 화면을 넘으면 좌우 화살표가 생기고, 화살표·스와이프(터치)·마우스 끌기·휠로 넘겨 본다 */
function titleArrows() {
  const box = $('#titleChips'); if (!box) return;
  const over = box.scrollWidth > box.clientWidth + 2, [l, r] = box.parentElement.querySelectorAll('.ts-arrow');
  l.classList.toggle('hidden', !over); r.classList.toggle('hidden', !over);
  l.disabled = box.scrollLeft <= 1; r.disabled = box.scrollLeft + box.clientWidth >= box.scrollWidth - 1;
}
function initTitleStrip() {
  const box = $('#titleChips'); if (!box) return;
  const on = box.querySelector('.tchip.on'); if (on && on.offsetLeft > box.clientWidth) box.scrollLeft = on.offsetLeft - 8; // 착용 중인 칭호가 보이게
  box.onscroll = () => titleArrows();
  box.onwheel = e => { if (box.scrollWidth <= box.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; e.preventDefault(); box.scrollLeft += e.deltaY; };
  let drag = null; // 마우스로 끌어 넘기기 (터치는 브라우저 기본 스크롤)
  box.onpointerdown = e => { if (e.pointerType !== 'mouse') return; drag = { x: e.clientX, s: box.scrollLeft, moved: false }; };
  box.onpointermove = e => { if (!drag) return; const dx = e.clientX - drag.x; if (Math.abs(dx) > 5) drag.moved = true; if (drag.moved) box.scrollLeft = drag.s - dx; };
  box.onpointerup = box.onpointerleave = () => { if (drag && drag.moved) view.noClickUntil = Date.now() + 150; drag = null; };
  box.addEventListener('click', e => { if (Date.now() < (view.noClickUntil || 0)) { e.stopPropagation(); e.preventDefault(); } }, true);
  titleArrows();
}
$('#avatarButton').onclick = () => { view.profEdit = false; openProfile(); };
$('#avatarFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  if (!AVATAR_TYPES.includes(f.type)) { toast('png, jpg, webp, gif 이미지만 올릴 수 있습니다.'); return; }
  if (f.size > 20 * 1024 * 1024) { toast('이미지는 20MB 이하로 선택하세요.'); return; }
  try { await startCrop(f); } catch (err) { toast('이미지를 처리하지 못했습니다.'); }
};
$$('[data-ltab]').forEach(b => { b.onclick = () => { state.leftTab = b.dataset.ltab; renderLeftTab(); save(); }; });
$('#craftOnly').onclick = () => { view.craftOnly = !view.craftOnly; renderCraft(); };
$$('[data-craft]').forEach(b => { b.onclick = () => { state.craftTab = state.craftTab === b.dataset.craft ? null : b.dataset.craft; renderCraft(); save(); }; });
$$('[data-inv]').forEach(b => { b.onclick = () => { state.invTab = state.invTab === b.dataset.inv ? null : b.dataset.inv; state.page = 1; renderInventory(); save(); }; });
$('#prevPage').onclick = () => { state.page--; renderInventory(); };
$('#nextPage').onclick = () => { state.page++; renderInventory(); };
$$('[data-side]').forEach(b => { b.onclick = () => { state.side = b.dataset.side; renderSide(); save(); }; });
$$('[data-chat]').forEach(b => { b.onclick = () => { state.chatTab = b.dataset.chat; renderChat(); save(); }; });
const canNotice = () => typeof devOn === 'function' ? devOn() : !!view.isAdmin; // 개발자 도구가 로드됐으면 켜기/끄기를 따르고(관리자도 꺼 두면 일반 플레이), 아직이면 서버 관리자 여부로 판단한다. 실제 권한은 서버가 다시 검사한다.
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
  view.nIds = {}; rows.forEach(r => { const id = intIn(r.id, 1, 9e15, 0); if (id) view.nIds[cleanText(r.head, 20) + '\n' + cleanText(r.body, 300)] = id; }); // 지우기용 서버 번호
  if (_verNotified) state.chats['알림'].push(['업데이트', '게임이 업데이트되었어요! 새로고침(F5, 안 되면 Ctrl+F5)하면 새 버전이 적용돼요.']);
  if ($('#chatFeed')) renderChat();
}
const CHAT_COOL_MS = 3000; // 도배 방지: 채팅은 3초에 한 번
function sendChat(val) {
  if (state.chatTab === '알림') { if (canNotice()) postNotice(val); else { toast('알림 채널은 공지만 받을 수 있어요.'); sfx('error'); } return; }
  if (state.chatTab === '길드' && !state.guild) { toast('길드가 없습니다. 위의 버튼으로 길드를 만들거나 가입하세요.'); sfx('error'); return; }
  if (state.chatTab === '파티' && !PARTY.id) { toast('파티가 없습니다. 친구 창이나 대원 프로필에서 파티에 초대해 보세요.'); sfx('error'); return; }
  if (state.chatTab === '파티' && !chatOnline()) { toast('파티 채팅은 서버에 로그인해야 쓸 수 있어요.'); sfx('error'); return; }
  const wait = (view.chatAt || 0) + CHAT_COOL_MS - nowMs();
  if (wait > 0) { toast(`채팅은 3초에 한 번만 보낼 수 있어요. (${Math.ceil(wait / 1000)}초 뒤)`); sfx('error'); return false; }
  view.chatAt = nowMs();
  if (chatOnline() && CHAT_CH[state.chatTab]) { // 서버 채팅: 다른 대원에게도 보인다
    const tab = state.chatTab; state.flags.chatted = true; if (tab === 'RP' && !state.flags.rpChat) { state.flags.rpChat = true; save(); awardTitles(); }
    Cloud.chatSend(CHAT_CH[tab], val).then(r => { if (r && r.ok === false) { toast(r.msg === 'too_fast' ? '너무 빨리 보내고 있어요. 잠시 뒤에 보내 주세요.' : r.msg === 'no_channel' ? (tab === '파티' ? '파티가 없어 보낼 수 없어요.' : '길드가 없어 보낼 수 없어요.') : '보내지 못했어요.'); sfx('error'); } else chatPoll(); }).catch(() => { toast('보내지 못했어요. 서버에 friends.sql 을 실행했는지 확인해 주세요.'); sfx('error'); });
    renderSide(); return;
  }
  state.chats[state.chatTab] = [...state.chats[state.chatTab], ['나', val, Date.now()]].slice(-200);
  state.flags.chatted = true; if (state.chatTab === 'RP' && !state.flags.rpChat) { state.flags.rpChat = true; save(); awardTitles(); }
  renderChat(); renderSide(); // 채팅은 로그에 남기지 않는다
}

/* ---------- 임무 수주 / 상점 / 길드 창 ---------- */
const fmtLeft = ms => { const h = Math.floor(ms / 3600000), m = Math.ceil(ms % 3600000 / 60000); return h ? `${h}시간 ${m % 60}분` : `${m}분`; };
function openQuestBoard(keepScroll) {
  const place = placeKey(), d = state.dungeon, ci = d ? Math.max(0, campsOf(d.zone).findIndex(c => c.x === d.x && c.y === d.y)) : 0, list = QUESTS.filter(q => q.board === place && !(q.once && state.questDone[q.id]) && (!q.daily || boardDailyOk(q, undefined, ci) || state.questTaken[q.id])); // 캠프마다 다른 임무
  if (!list.length) { toast('이곳에서는 임무를 수주할 수 없습니다.'); return; }
  const active = activeBoard().length;
  const st = keepScroll ? $('#modalBody').scrollTop : 0;
  const rows = list.map(q => {
    const done = !!state.questDone[q.id], taken = !!state.questTaken[q.id], left = boardResetLeft(q.id);
    return `<div class="board-quest ${done ? 'done' : ''}"><div class="grow"><strong>${esc(q.title)}</strong><small>${esc(q.desc)}</small><small class="rw">${esc(rewardText(q))}</small>${taken ? `<small>${done ? `완수 · ${fmtLeft(left)} 뒤 다시 받을 수 있어요` : '수주함 · 진행 중 (리셋되지 않아요)'}</small>` : ''}</div>` +
      `<button class="${taken || done ? '' : 'primary'}" data-act="quest-take" data-id="${q.id}" ${taken || done ? 'disabled' : ''}>${done ? '완수' : taken ? '수주함' : '수주'}</button></div>`;
  }).join('');
  modal(`임무 수주 · ${place === '본부' ? '본부' : place + ' 캠프'}`,
    `<p class="tiny">${place === '본부' ? '본부에서는 공통 임무를 받을 수 있어요.' : `${esc(place)}에서만 받을 수 있는 특별 임무예요.`} 동시에 ${BOARD_MAX_ACTIVE}개까지 (지금 ${active}개). <b>완수한 임무</b>는 매일 오전 4시에 리셋되어 다시 받을 수 있고, 진행 중인 임무는 리셋되지 않아요.${place === '본부' ? ' 본부의 기본 임무는 한 번만 할 수 있고, 일일 의뢰는 매일 5개가 새로 걸려요.' : ''}</p>` + rows, [btnClose]);
  $('#modalBody').scrollTop = st;
}
function openShop(keepScroll) {
  const place = SHOPS[view.shopId] && shopAt(view.shopId) === placeKey() ? view.shopId : placeKey(), shop = SHOPS[place];
  if (!shop) { toast('이곳에는 상점이 없습니다.'); return; }
  view.shopId = place;
  const tabs = shopTabs(place);
  if (!tabs.includes(view.shopTab)) view.shopTab = tabs[0];
  const st = keepScroll ? $('#modalBody').scrollTop : 0, tab = view.shopTab, sec = shopSections(place);
  const row = ([n, price]) => {
    const it = ITEMS[n], stack = it.tab !== '장비';
    return `<div class="shop-row"><span class="shop-ic">${icon(it.icon)}</span><div class="grow"><strong>${esc(n)}${it.slot ? ` <em class="tag slot-tag">착용 위치 · ${esc(it.slot)}</em>` : ''}</strong><small class="item-info">${itemInfoHtml(n)}</small></div><span class="price">${price} CR</span>` +
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
      return `<div class="shop-row"><span class="shop-ic">${icon(it.icon)}</span><div class="grow"><strong>${esc(n)} <span class="tiny">×${q}</span></strong><small class="item-info">${itemInfoHtml(n)}</small></div><span class="price">${pr} CR</span>` +
        `<button data-act="shop-sell" data-name="${esc(n)}" data-qty="1">판매</button>` + (q > 1 ? `<button data-act="shop-sell" data-name="${esc(n)}" data-qty="${q}">전부 (${pr * q})</button>` : '') + '</div>';
    }).join('') : '<div class="empty">팔 수 있는 아이템이 없습니다. (착용 중인 장비와 기본 무기는 팔 수 없어요)</div>';
  } else if (tab === '레시피') {
    const list = recipesForSale();
    body = list.length ? '<p class="tiny">레시피를 사면 바로 제작할 수 있어요. 등급이 모자라면 살 수 없습니다. 이미 아는 레시피는 나오지 않아요.</p>' + list.map(rc => {
      const it = ITEMS[rc.out], pr = recipePrice(rc), lock = !rankAtLeast(rc.rank), mats = Object.entries(rc.mats).map(([n, q]) => `${n} ×${q}`).join(' + ');
      return `<div class="shop-row"><span class="shop-ic">${icon(it.icon)}</span><div class="grow"><strong>${esc(rc.out)} <em class="tag">${esc(craftCat(rc.out))}</em>${craftField(rc.out) ? ` <em class="tag field">${esc(craftField(rc.out))}</em>` : ''}</strong><small class="item-info">${itemInfoHtml(rc.out)}</small><small>재료 ${esc(mats)}${lock ? ` · ${rc.rank}등급부터` : ''}</small></div><span class="price">${pr} CR</span>` +
        `<button data-act="recipe-buy" data-out="${esc(rc.out)}" ${lock || state.money < pr ? 'disabled' : ''}>배우기</button></div>`;
    }).join('') : '<div class="empty">살 수 있는 레시피가 없습니다. 모든 레시피를 알고 있어요.</div>';
  } else {
    const rows = sec[tab] || [];
    const slotHint = rows.some(r => ITEMS[r[0]].slot) ? '<p class="tiny slot-hint">장비는 구입 후 소지품의 <b>장비</b> 탭에서 고르거나, 스테이터스 쪽 장비 칸(머리·목·손 등)을 눌러 착용합니다. 이름 옆 <b>착용 위치</b>가 들어갈 칸입니다.</p>' : '';
    body = rows.length ? slotHint + rows.map(row).join('') : `<div class="empty">${tab === 'RP템' ? '준비 중입니다.' : '이 분류는 이 상점에서 취급하지 않습니다.'}</div>`;
  }
  modal(shop.title,
    `<p class="tiny">보유 CR <b id="shopMoney">${state.money.toLocaleString()}</b> · 가방 ${usedSlots()} / ${bagCapacity()}${place.startsWith('제') ? ' · 캠프 가격은 조금 비쌉니다.' : ''}</p>` +
    `<div class="tabs flush shop-tabs">${tabs.map(t => `<button class="${t === tab ? 'active' : ''}" data-act="shop-tab" data-tab="${t}">${t}</button>`).join('')}</div>` +
    `<div class="shop-list">${body}</div>`, [btnClose]);
  $('#modalBody').scrollTop = st;
}
/* 뽑기 기계: 뽑기권을 내고 1~5등 경품을 뽑는다 */
function openGacha(keepScroll) {
  const set = gachaSet(), g = state.gacha, last = view.gachaLast, st = keepScroll ? $('#modalBody').scrollTop : 0;
  const rows = set.prizes.map((pr, i) => `<div class="shop-row gacha-row r${i + 1}"><span class="gacha-rank">${i + 1}등</span><div class="grow"><strong>${esc(prizeText(pr))}</strong>${pr.item ? `<small class="item-info">${itemInfoHtml(pr.item[0])}</small>` : ''}</div><span class="price">${round1(GACHA_RATES[i] * 100)}%</span></div>`).join('');
  const res = last ? `<div class="result gacha-result r${last.rank}"><strong>${last.rank}등 당첨! ${esc(prizeText(last.prize))}</strong>${last.changed ? '<small>1등이 나와 경품 묶음이 바뀌었습니다.</small>' : ''}</div>` : '';
  modal('뽑기 기계', `<p class="tiny">뽑기권은 임무를 ${TICKET_EVERY}번 완수할 때마다 1장 받습니다. (지금까지 ${state.questCount || 0}번 완수 · 다음 뽑기권까지 ${TICKET_EVERY - ((state.questCount || 0) % TICKET_EVERY)}번)</p>` +
    `<div class="choice-label">보유 뽑기권 <b id="ticketCount">${state.tickets}</b>장 · 지금 경품: ${esc(set.name)}</div>${res}<div class="shop-list">${rows}</div>` +
    `<p class="tiny">1등이 나오면 경품 묶음이 다른 것으로 바뀝니다. (이 기기의 기록 기준이며, 다른 대원과 공유되지는 않습니다) 지금까지 ${g.pulls}번 뽑아 1등 ${g.wins}번.</p>`,
    [btnClose, `<button class="primary" data-act="gacha-draw" ${state.tickets < 1 ? 'disabled' : ''}>${icon('redeem')} 뽑기 (1장)</button>`], true);
  $('#modalBody').scrollTop = st;
}

/* 캠프 신호기: 구역의 캠프 중 어디로 갈지 고른다 */
function openBeacon(name, mk) {
  const zid = ITEMS[name].use.camp, err = useErr(name); if (err) { toast(err); sfx('error'); return; }
  const cs = campsOf(zid), mka = mk === undefined ? '' : `data-mk="${esc(mk)}"`;
  modal(name, `<p class="detail-desc">${esc(zid)} 캠프로 곧장 내려갑니다. 신호기 1개를 씁니다.${state.dungeon && state.dungeon.zone !== zid ? ` 지금 있는 ${esc(state.dungeon.zone)}에서는 나가게 돼요.` : ''}</p>` +
    `<div class="choice-label">어느 캠프로 갈까요?</div><div class="beacon-list">${cs.map((c, i) => `<button class="primary" data-act="beacon-go" data-item="${esc(name)}" data-ci="${i}" ${mka}>${icon('camping')} ${esc(c.label)} <small>(${c.x}, ${c.y})</small></button>`).join('')}</div>`, [btnClose]);
}
/* ---------- 훈련장: 보스전 안내 · 훈련 메시지 · 대련 ---------- */
function openBossInfo() {
  modal('보스전 안내', `<p class="detail-desc">훈련장에 곧 <b>보스전</b>이 열립니다. 지금은 아직 보스가 없고, 진행 방식만 미리 안내해 드려요.</p>
<div class="boss-info"><p><b>${icon('skull')} 거대한 보스 하나</b> — 체력이 아주 많은 보스가 약 <b>3일</b> 동안 머뭅니다. 모든 대원이 함께 체력을 깎아요.</p>
<p><b>${icon('casino')} D20 실시간 전투</b> — 모의 전투처럼 한 줄씩 진행되고, 매 합마다 D20을 굴립니다. 1에 가까울수록 불리하고 20에 가까울수록 유리해요.</p>
<p><b>${icon('military_tech')} 기여도</b> — 이길 때마다 기여도가 쌓입니다. 보스전이 끝나면 기여도에 따라 상점보다 좋은 <b>한정 무기·장비</b>와 <b>스테이터스 초기화 아이템</b>을 받을 수 있어요.</p>
<p><b>${icon('handshake')} 지원 버프</b> — 전투 중 일정 확률로, 예전에 보스전에 참가했던 대원이 나타나 도와줍니다. 그 대원이 '훈련 메시지'에 적어 둔 말이 함께 떠요.</p>
<p><b>${icon('local_fire_department')} 소모가 큰 전투</b> — 다른 전투보다 HP와 기력이 많이 듭니다. 회복 아이템을 넉넉히 챙겨 두세요.</p></div>
<p class="tiny">지원 메시지는 지금부터 '훈련 메시지'에서 미리 정해 둘 수 있어요.</p>`, [btnClose, '<button class="primary" data-act="tmsg-open">훈련 메시지 정하기</button>']);
}
function openTrainMsg() {
  const m = state.trainMsg, row = (id, lb, v, ph) => `<label class="tmsg-row"><span>${lb}</span><input id="${id}" maxlength="${DUEL_MSG_MAX}" value="${esc(v)}" placeholder="${esc(ph)}"></label>`;
  modal('훈련 메시지', `<p class="tiny">최대 ${DUEL_MSG_MAX}자. 다른 대원에게 그대로 보여요.</p>` +
    row('tmHelp', '보스전 지원', m.help, '예) 뒤는 내가 맡을게!') + row('tmWin', '대련 승리', m.win, '예) 좋은 승부였어.') + row('tmLose', '대련 패배', m.lose, '예) 다음엔 안 져!') +
    '<p class="tiny">보스전 지원: 다른 대원이 보스전에서 내 도움 버프를 받을 때 뜹니다. 대련 대사: 대련이 끝나면 상대에게도 보여요.</p>', [btnClose, '<button class="primary" data-act="tmsg-save">저장</button>'], true);
}
const duelOnline = () => !!(Cloud.enabled && Cloud.user());
function duelFighters(members) { return members.map(m => ({ team: m.team === 2 ? 2 : 1, me: !!m.me, host: !!m.host, ...duelClean(m.snap, m.snap && m.snap.name) })); }
function openDuel() {
  view.duelRoom = null; stopDuelTimers();
  modal('대련장', `<p class="tiny">방을 만들거나 들어가 대련합니다. 팀마다 최대 ${DUEL_TEAM_MAX}명, 매 공격마다 D6을 굴려요. (1 헛손질 · 6 결정타) 보상은 없어요.</p>` +
    `<div class="choice-label">연습 대련 (허수아비와)</div><div class="row-btns">${[1, 2, 3].map(n => `<button data-act="duel-practice" data-n="${n}">1 : ${n}</button>`).join('')}</div>` +
    (duelOnline() ? `<div class="choice-label">대원 대련방</div><div class="search-row"><input id="duelTitle" maxlength="20" placeholder="방 이름 (비워도 돼요)"><button class="primary" data-act="duel-create">방 만들기</button></div><div id="duelList"><p class="tiny">방 목록을 불러오는 중…</p></div>`
      : '<p class="tiny">다른 대원과의 대련은 서버에 로그인해야 할 수 있어요.</p>'), [btnClose, duelOnline() ? '<button data-act="duel-refresh">새로고침</button>' : '']);
  if (duelOnline()) duelLoadList();
}
async function duelLoadList() {
  let list = []; try { list = await Cloud.duelList(); } catch (e) { if ($('#duelList')) $('#duelList').innerHTML = '<p class="tiny">방 목록을 받지 못했어요. 서버에 supabase/friends.sql 최신본이 필요해요.</p>'; return; }
  const box = $('#duelList'); if (!box) return;
  box.innerHTML = (Array.isArray(list) ? list : []).slice(0, 30).map(r => { const id = intIn(r.id, 1, 9e15, 0), a = intIn(r.a, 0, 3, 0), b = intIn(r.b, 0, 3, 0); return id ? `<div class="nearby-row"><div class="grow"><strong>${esc(cleanText(r.title, 20) || `${cleanText(r.host, 12)}의 대련방`)}</strong><small>방장 ${esc(cleanText(r.host, 12))} · A팀 ${a}/${DUEL_TEAM_MAX} · B팀 ${b}/${DUEL_TEAM_MAX}</small></div><div class="row-btns"><button data-act="duel-join" data-id="${id}" data-team="1" ${a >= DUEL_TEAM_MAX ? 'disabled' : ''}>A팀</button><button data-act="duel-join" data-id="${id}" data-team="2" ${b >= DUEL_TEAM_MAX ? 'disabled' : ''}>B팀</button></div></div>` : ''; }).join('') || '<div class="empty">열린 대련방이 없어요. 방을 만들어 보세요.</div>';
}
function stopDuelTimers() { clearInterval(view.duelPoll); clearInterval(view.duelTimer); view.duelPoll = view.duelTimer = 0; }
function duelRoomHtml(v, fs) {
  const col = t => `<div class="duel-team t${t}"><div class="choice-label">${t === 1 ? 'A팀' : 'B팀'} ${fs.filter(f => f.team === t).length}/${DUEL_TEAM_MAX}</div>${fs.filter(f => f.team === t).map(f => `<div class="duel-f ${f.me ? 'me' : ''}"><strong>${esc(f.name)}${f.host ? ' 👑' : ''}</strong><small>Lv.${f.lv} · HP ${f.hp} · 주 ${esc(STAT_DEFS.find(d => d.key === f.main).name)}${f.sub ? ` · 부 ${esc(STAT_DEFS.find(d => d.key === f.sub).name)}` : ''}</small></div>`).join('') || '<div class="empty">비어 있음</div>'}</div>`;
  return `<div id="duelRoot" data-id="${v.id}"><div class="duel-teams">${col(1)}<div class="duel-vs">VS</div>${col(2)}</div><div class="battle-log duel-log" id="duelLog"></div><div id="duelEnd"></div></div>`;
}
function openDuelRoom(v) { // 서버 대련방 (v = duel_view 결과)
  const fs = duelFighters(Array.isArray(v.members) ? v.members : []), mine = fs.find(f => f.me), open = v.status === 'open';
  modal(`대련방 · ${cleanText(v.title, 20) || '이름 없는 방'}`, duelRoomHtml(v, fs) + (open ? `<p class="tiny">${v.host ? '양 팀에 한 명 이상 모이면 시작할 수 있어요.' : '방장이 시작하면 대련이 펼쳐져요.'}</p>` : ''),
    [`<button data-act="duel-leave" data-id="${v.id}">${open ? '나가기' : '닫기'}</button>`, open && mine ? `<button data-act="duel-join" data-id="${v.id}" data-team="${mine.team === 1 ? 2 : 1}">${mine.team === 1 ? 'B팀으로' : 'A팀으로'}</button>` : '', open && v.host ? `<button class="primary" data-act="duel-start" data-id="${v.id}" ${new Set(fs.map(f => f.team)).size < 2 ? 'disabled' : ''}>대련 시작</button>` : ''].filter(Boolean));
  view.duelRoom = v.id; view.duelSig = JSON.stringify([v.status, fs.map(f => [f.name, f.team])]);
  if (v.status === 'started' && Number.isFinite(+v.seed)) duelPlay(fs, +v.seed, v.id);
  if (!view.duelPoll && open) view.duelPoll = setInterval(duelPollRoom, 2000);
}
async function duelPollRoom() {
  if (!$('#duelRoot') || !view.duelRoom) { stopDuelTimers(); return; }
  let v; try { v = await Cloud.duelView(view.duelRoom); } catch (e) { return; }
  if (!v || !$('#duelRoot')) return;
  if (v.status === 'closed') { stopDuelTimers(); toast('대련방이 닫혔어요.'); openDuel(); return; }
  const fs = duelFighters(v.members || []), sig = JSON.stringify([v.status, fs.map(f => [f.name, f.team])]);
  if (sig !== view.duelSig) { clearInterval(view.duelPoll); view.duelPoll = 0; openDuelRoom(v); }
}
function duelPlay(fs, seed, roomId) { // 한 줄씩 보여 주고 끝나면 결과와 대사
  clearInterval(view.duelPoll); clearInterval(view.duelTimer); view.duelPoll = 0;
  const sim = duelSim(fs, seed), box = $('#duelLog'); let i = 0;
  if (!box) return;
  box.innerHTML = `<div class="bl note">대련 시작! ${esc(fs.filter(f => f.team === 1).map(f => f.name).join('·'))} VS ${esc(fs.filter(f => f.team === 2).map(f => f.name).join('·'))}</div>`;
  const end = () => {
    clearInterval(view.duelTimer); view.duelTimer = 0;
    const me = fs.find(f => f.me), won = me ? me.team === sim.win : null, lines = fs.map(f => { const t = f.team === sim.win ? f.win : f.lose; return t ? `<p class="duel-say"><b>${esc(f.name)}</b> 「${esc(t)}」</p>` : ''; }).join('');
    const el = $('#duelEnd'); if (el) el.innerHTML = `<div class="duel-result ${won === true ? 'win' : won === false ? 'lose' : ''}">${sim.win === 1 ? 'A팀' : 'B팀'} 승리!${won === true ? ' 🎉' : ''} <small>(${sim.rounds}합)</small></div>${lines}`;
    if (roomId && !state.duelSeen.includes(roomId)) { state.duelSeen = [...state.duelSeen, roomId].slice(-20); }
    if (!state.flags.duel) { state.flags.duel = true; awardTitles(); }
    save(); sfx(won === false ? 'error' : 'levelup');
  };
  if (roomId && state.duelSeen.includes(roomId)) { box.innerHTML += sim.log.map(e => `<div class="bl ${e.dodge ? 'dodge' : e.d >= 5 ? 'hit' : 'note'}">${esc(duelText(e, fs))}</div>`).join(''); box.scrollTop = box.scrollHeight; end(); return; }
  view.duelTimer = setInterval(() => {
    const b = $('#duelLog'); if (!b) { clearInterval(view.duelTimer); view.duelTimer = 0; return; }
    if (i >= sim.log.length) { end(); return; }
    const e = sim.log[i++]; b.insertAdjacentHTML('beforeend', `<div class="bl ${e.dodge ? 'dodge' : e.d >= 5 ? 'hit' : 'note'}">${esc(duelText(e, fs))}</div>`); b.scrollTop = b.scrollHeight;
  }, DUEL_LINE_MS);
}
/* ---------- 본부 분실물 보관함 ---------- */
function openLostBox() {
  const box = state.lostBox, cells = Array.from({ length: LOSTBOX_SLOTS }, (_, i) => { const x = box[i], it = x && ITEMS[x.n]; return it ? `<button class="slot filled" data-act="lostbox-take" data-i="${i}" data-tip-title="${esc(shownName(x.n))} ×${x.q}" data-tip-desc="${esc((x.mk ? `제작: ${x.mk}\n` : '') + '누르면 가방으로 옮깁니다')}" aria-label="${esc(x.n)} 받기">${icon(it.icon)}${x.q > 1 ? `<span class="qty">${x.q}</span>` : ''}</button>` : '<div class="slot"></div>'; }).join('');
  modal('분실물 보관함', `<p class="detail-desc">가방이 가득 차 받지 못한 보상은 여기로 옵니다. 칸을 누르면 가방으로 옮겨요. (${box.length}/${LOSTBOX_SLOTS}칸, 보관함도 가득 차면 그 뒤의 보상은 사라집니다)</p><div class="inv-grid lostbox-grid">${cells}</div>`, [btnClose, box.length ? '<button class="primary" data-act="lostbox-all">모두 받기</button>' : '']);
}
/* ---------- 승급 ---------- */
function openPromo() {
  const c = state.character, q = nextPromo(), taken = q && state.questTaken[q.id];
  let body = `<p class="tiny">현재 등급 <b>${esc(c.rank)}</b> · 승급 시험은 메인 임무로 진행됩니다. 임무를 마치면 바로 승급해요. A등급이 되면 레벨 제한을 푸는 '한계 돌파' 임무를 받을 수 있어요.</p>`;
  if (!q) body += `<div class="empty">${state.flags.cap35 ? `모든 승급과 한계 돌파를 마쳤습니다. (최고 레벨 ${MAX_LEVEL})` : '승급할 수 있는 등급이 없습니다.'}</div>`;
  else {
    const pr = questProgress(q);
    body += `<div class="board-quest"><div class="grow"><strong>${esc(q.title)}</strong><small>${esc(q.desc)}</small><small class="rw">${esc(rewardText(q))} · ${q.cap ? `최고 레벨 ${LEVEL_CAP_BASE} → ${q.cap}` : `승급 ${esc(c.rank)} → ${esc(q.promo)}`}</small>` +
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
function petCareHtml(compact) { // 펫 돌보기 화면. compact=오른쪽 '펫' 탭: 함께 다니는 펫 + 펫 목록(탐험 남은 시간)만. 전체는 개인실 '펫 돌보기' 창
  const feeds = Object.values(state.inventory).flat().filter(x => ITEMS[x.n].feed);
  if (!feeds.some(x => x.n === view.feed)) view.feed = feeds[0] ? feeds[0].n : null;
  if (!DANGER_ZONES.some(z => z.id === view.expZone)) view.expZone = DANGER_ZONES[0].id;
  const owned = Object.fromEntries(state.pets.map(p => [p.id, p]));
  const dex = Object.entries(PET_SPECIES).map(([id, sp]) => owned[id]
    ? `<div class="pet-dex got" title="${esc(sp.name)}">${icon('pets')}<small>${esc(sp.name)}</small></div>` : `<div class="pet-dex" title="아직 길들이지 못했습니다">${icon('help')}<small>${esc(sp.zone)}</small></div>`).join('');
  const editRow = i => { const p = state.pets[i], sp = PET_SPECIES[p.id]; // 이름 수정: 박스 맨 아래 가운데 (동행 여부와 상관없이)
    return view.petNaming === i ? `<div class="search-row pet-edit-row"><input id="petNameIn" maxlength="${PET_NAME_MAX}" placeholder="${esc(sp.name)}" value="${esc(p.name || '')}" aria-label="펫 이름"><button class="primary" data-act="pet-name-save" data-i="${i}">저장</button><button data-act="pet-name-cancel">취소</button></div>`
      : ''; };
  const penBtn = i => view.petNaming === i ? '' : ` <button class="mini pen" data-act="pet-name" data-i="${i}" title="이름 수정" aria-label="이름 수정">${icon('quill')}</button>`;
  const mini = i => { const p = state.pets[i], sp = PET_SPECIES[p.id], away = !!p.exp, ready = expReady(p);
    const st = away ? (ready ? `${p.exp.zone} 탐험에서 돌아왔어요!` : `${p.exp.zone} 탐험 중 · <span class="pet-left" data-i="${i}">${fmtLeft(expLeft(p))}</span> 남음`) : '대기 중';
    return `<div class="nearby-row pet-side-row ${away ? 'away' : ''}"><div class="round-avatar">${icon(sp.icon || 'pets')}</div><div class="grow"><strong>${esc(petName(p))}${p.name ? ` <small>(${esc(sp.name)})</small>` : ''}${penBtn(i)}</strong><small>${st}</small><small>친밀도 ${p.bond}/100 · 성격 ${esc(petPersOf(p))}</small><small>${esc(petLvText(p))}</small>${away && !ready ? `<div class="bar thin"><span class="pet-bar" data-i="${i}" style="width:${Math.round((1 - expLeft(p) / (p.exp.ms || PET_EXP_MS)) * 100)}%"></span></div>` : ''}</div>${ready ? `<button class="primary" data-act="pet-claim" data-i="${i}">수확물 받기</button>` : away ? '' : `<button data-act="pet-active" data-i="${i}">함께 다니기</button>`}${editRow(i)}</div>`; };
  const order = petOrder();
  if (!compact && order.length && !order.includes(view.petSel)) view.petSel = state.petActive >= 0 && order.includes(state.petActive) ? state.petActive : order[0];
  const card = i => { const p = state.pets[i], sp = PET_SPECIES[p.id], away = !!p.exp, ready = expReady(p), act = state.petActive === i; // 펫 목록 그리드: 이름·종족·상태 (탐험 중이면 남은 시간)
    const st = away ? (ready ? '돌아옴!' : `탐험 <span class="pet-left" data-i="${i}">${fmtLeft(expLeft(p))}</span>`) : act ? '동행 중' : '대기 중';
    return `<button class="pet-card ${view.petSel === i ? 'selected' : ''} ${away ? 'away' : ''} ${act ? 'act' : ''} ${ready ? 'ready' : ''}" data-act="pet-sel" data-i="${i}" aria-pressed="${view.petSel === i}">${icon(sp.icon || 'pets')}<strong>${esc(petName(p))}</strong><small>${esc(p.id)}</small><em>${st}</em></button>`; };
  const rows = order.map(i => {
    if (compact && state.petActive !== i) return mini(i);
    if (!compact && view.petSel !== i) return '';
    const p = state.pets[i], sp = PET_SPECIES[p.id], fed = petFed(p), act = state.petActive === i, away = !!p.exp, ready = expReady(p);
    const state1 = away ? (ready ? `${p.exp.zone} 탐험에서 돌아왔어요!` : `${p.exp.zone} 탐험 중 · ${fmtLeft(expLeft(p))} 남음`) : act ? '동행 중' : '대기 중';
    return `<div class="pet-row ${act ? 'active' : ''}"><div class="round-avatar">${icon('pets')}</div><div class="grow"><strong>${esc(petName(p))} ${p.name ? `<small>(${esc(sp.name)})</small> ` : ''}${penBtn(i)} <span class="tag">${esc(state1)}</span></strong>` +
      `<small class="pet-line">${esc(petCareLine(p))}</small>${view.petMsg && view.petMsg.i === i ? `<small class="pet-talk">${esc(view.petMsg.text)}</small>` : ''}<small>${esc(petLvText(p))}</small><small>성격 ${esc(petPersOf(p))} · 친밀도 ${p.bond}/100 · ${fed ? `배부름 ${Math.ceil(petFull(p))}% (${fmtLeft(Math.max(0, petEmptyAt(p) - nowMs()))} 뒤 배고픔)` : '배고픔 — 간식을 주지 않으면 친밀도가 조금씩 줄어요'} · 동행 시 이동 시간 -${Math.round(petBuff(p) * 100)}%${fed ? '' : ' (먹이를 줘야 적용)'}</small>` +
      `<div class="bar thin"><span style="width:${p.bond}%"></span></div><div class="bar thin full" title="배부름"><span style="width:${Math.ceil(petFull(p))}%"></span></div></div>` +
      `<div class="col-btns">${away ? (ready ? `<button class="primary" data-act="pet-claim" data-i="${i}">수확물 받기</button>` : '<button disabled>탐험 중</button>')
        : (() => { const ok = !petCareErr(i), tip = ok ? '' : ' title="함께 다니지 않는 펫은 개인실에서 돌볼 수 있어요"'; return `<button data-act="pet-feed" data-i="${i}" ${feeds.length && ok ? '' : 'disabled'}${tip}>간식 주기</button><button data-act="pet-stroke" data-i="${i}" ${ok ? '' : 'disabled'}${tip}>쓰다듬기</button><button data-act="pet-mood" data-i="${i}" ${ok ? '' : 'disabled'}${tip}>기분 묻기</button><button data-act="pet-active" data-i="${i}">${act ? '동행 해제' : '함께 다니기'}</button><button data-act="pet-acc" data-i="${i}">악세서리</button>${act ? '' : `<button data-act="pet-send" data-i="${i}" ${feeds.length ? '' : 'disabled'}>탐험 보내기</button>`}`; })()}</div>${editRow(i)}</div>`;
  }).join('');
  if (compact) {
    return (rows || '<div class="empty">아직 길들인 펫이 없습니다.</div>') + '<p class="tiny">성격 허브를 간식으로 주면 펫의 성격이 바뀌어요. 탐험 보내기·도감 등 전체 돌보기는 개인실의 \'펫 돌보기\'에서 할 수 있어요.</p>';
  }
  return `<p class="tiny">펫은 지상의 짐승 지형에서 <b>길들이기</b>로 얻어요. 펫 보관함은 소지품과 별도이고, 같은 종은 한 마리만 모을 수 있어요. 한 마리는 <b>동행</b>(배부름이 남아 있는 동안 타일 이동 시간 단축), 나머지는 <b>24시간 자동 탐험</b>을 보낼 수 있어요.</p>` +
    (order.length ? `<div class="choice-label">내 펫 ${order.length}마리 <small class="tiny">· 눌러서 돌보기·탐험·동행</small></div><div class="pet-grid">${order.map(card).join('')}</div>${rows}` : '<div class="empty">아직 길들인 펫이 없습니다. 지상에서 작물이나 펫 사료를 들고 짐승을 길들여 보세요.</div>') +
    bowlHtml() +
    `<button class="choice-label dex-toggle" data-act="pet-dex-toggle" aria-expanded="${!!view.petDexOpen}">${icon(view.petDexOpen ? 'expand_less' : 'expand_more')} 펫 도감 ${state.pets.length}/${petCap()}</button>${view.petDexOpen ? `<div class="pet-dex-grid">${dex}</div>` : ''}` +
    `<p class="tiny">성격 허브(활발·얌전·장난꾸러기·느긋·호기심·의젓)를 간식으로 주면 펫의 성격이 바뀌고, 성격에 따라 돌보는 문구가 달라져요. 허브는 농장에서 키울 수 있고 씨앗은 채집하다 아주 가끔 나옵니다.</p>` +
    `<p class="tiny">탐험을 보내면 먹이 1개가 들고, 돌아오면 그 구역의 재료·희귀 재료·특산 씨앗을 확률로 가져와요. (친밀도가 높고 고향 구역이면 더 많이)</p>` ;
}
function bowlHtml() { // 개인실 펫 돌보기: 먹이통 (함께 다니지 않는 펫이 배고프면 알아서 먹는다)
  const list = Object.entries(state.petBowl || {}).filter(([n, q]) => ITEMS[n] && q > 0);
  const cells = list.map(([n, q]) => `<button class="slot clickable filled" data-act="bowl-take" data-item="${esc(n)}" data-tip-title="${esc(n)} ×${q}" data-tip-desc="누르면 소지품으로 꺼냅니다." aria-label="${esc(n)} 꺼내기">${icon(ITEMS[n].icon)}<span class="qty">${q}</span></button>`);
  while (cells.length < 6) cells.push('<div class="slot" aria-label="빈 칸"></div>');
  return `<div class="pet-bowl" id="petBowl"><div class="choice-label bowl-head"><span>${icon('rice_bowl')} 먹이통 <small class="tiny">${bowlTotal()} / ${PET_BOWL_MAX}</small></span><button data-act="bowl-open" ${state.location === '개인실' ? '' : 'disabled'}>먹이 채우기</button></div>` +
    `<div class="inv-grid">${cells.slice(0, Math.max(6, cells.length)).join('')}</div><p class="tiny">함께 다니지 않는 펫은 배부름이 ${PET_BOWL_AT}% 아래로 내려가면 먹이통에서 알아서 먹어요. (싼 간식부터, 성격 허브는 넣을 수 없어요)</p></div>`;
}
function openBowlPick() {
  const have = [...new Set(Object.values(state.inventory).flat().map(s => s.n))].filter(n => ITEMS[n].feed && !isHerb(n)).sort((a, b) => ITEMS[a].feed - ITEMS[b].feed);
  const rows = have.map(n => { const q = countItem(n); return `<div class="nearby-row"><div class="round-avatar">${icon(ITEMS[n].icon)}</div><div class="grow"><strong>${esc(n)} ×${q}</strong><small>배부름 +${feedFull(n)} · 친밀도 +${feedGain(n)}</small></div><button data-act="bowl-put" data-item="${esc(n)}" data-qty="1">1개</button>${q > 1 ? `<button class="primary" data-act="bowl-put" data-item="${esc(n)}" data-qty="${q}">전부</button>` : ''}</div>`; }).join('');
  modal('먹이통 채우기', `<p class="tiny">먹이통 ${bowlTotal()} / ${PET_BOWL_MAX}개</p>` + (rows || '<div class="empty">넣을 간식(작물·펫 사료)이 없어요.</div>'), ['<button data-act="bowl-back">돌아가기</button>'], true);
}
function openPets(keepScroll) {
  const st = keepScroll ? $('#modalBody').scrollTop : 0;
  modal('펫 돌보기', petCareHtml(), [btnClose]);
  $('#modalBody').scrollTop = st;
}

/* ---------- 서브잡 (상점가) ---------- */
const jobRoot = el => (el && el.closest && el.closest('#sideView')) || $('#modalBody');
function jobPickSum(root = $('#modalBody')) {
  const t = [...root.querySelectorAll('.job-pick')].reduce((a, i) => a + (Number(i.value) || 0), 0), el = root.querySelector('.job-total');
  if (el && state.subjob) el.textContent = `고른 수량 ${t} / ${jobNeed(state.subjob.level)}`;
}
document.addEventListener('input', e => { if (e.target.classList && e.target.classList.contains('job-pick')) { jobPickSum(jobRoot(e.target)); if (e.target.closest('#sideView')) { view.jobPicks = view.jobPicks || {}; view.jobPicks[e.target.dataset.n] = e.target.value; } } });
function openTrade(name, keepScroll) {
  const st0 = keepScroll === true && $('#modalBody') ? $('#modalBody').scrollTop : 0, p = NEARBY_PLAYERS.find(x => x[0] === name);
  if (!p) { toast('주위에 없는 대원입니다.'); return; }
  const mine = ['소모품', '재료', '장비'].flatMap(t => state.inventory[t]).map(s => s.n), uniq = [...new Set(mine)], offers = playerOffers(p);
  const body = `<p class="tiny">${esc(name)}님과 물건을 맞바꿉니다. 하루 ${TRADE_DAILY}회까지 · 오늘 남은 횟수 <b>${tradesLeft()}회</b>. 장착 중인 장비는 줄 수 없어요.</p>` +
    (offers.length ? `<div class="srow fontrow trade-row"><span>내가 줄 물건</span><select id="tradeGive">${uniq.map(n => `<option value="${esc(n)}">${esc(n)} (${countItem(n)})</option>`).join('')}</select><input id="tradeGiveQty" type="number" min="1" value="1" style="width:64px"></div>` +
      `<div class="srow fontrow trade-row"><span>받을 물건</span><select id="tradeWant">${offers.map(([n, q]) => `<option value="${esc(n)}">${esc(n)} (최대 ${q})</option>`).join('')}</select><input id="tradeWantQty" type="number" min="1" value="1" style="width:64px"></div>`
      : '<div class="empty">상대가 내놓은 물건이 없습니다.</div>') +
    '';
  modal(`${name}님과 교환`, body, [btnClose, `<button class="primary" data-act="trade-do" data-player="${esc(name)}" ${offers.length && tradesLeft() ? '' : 'disabled'}>교환하기</button>`], true);
  $('#modalBody').scrollTop = st0;
}
/* ---------- 추가 기능: 모의 전투 (실제 진행·보상에는 영향 없음) ---------- */
function mockMonsters() {
  const seen = new Set(), out = [];
  for (const [id, a] of Object.entries(ACTIONS)) { if (a.kind !== 'battle') continue; const m = monsterBase(a); if (m && !seen.has(m.name)) { seen.add(m.name); out.push(m); } }
  return out.sort((x, y) => x.hp * x.atk - y.hp * y.atk); // 위쪽이 약한 몬스터, 아래로 갈수록 강한 몬스터
}
function openRescueFight() { // 대원 구조 전투: 이미 정해진 결과(state.pending)를 한 줄씩 보여 주고, 끝나거나 창을 닫으면 결과를 받는다
  const p = state.pending, rs = p && p.result && p.result.rescue; if (!rs || !Array.isArray(rs.log) || !(rs.hp0 > 0) || !(rs.mhp0 > 0)) { A.claim(); return; } // 깨진 저장이면 바로 결과만 받는다
  if (view.rescueTimer) clearInterval(view.rescueTimer);
  view.rescueAnim = true;
  modal('위험에 처한 대원 구하기', `<p class="tiny">${esc(rs.who)} 대원을 구하러 ${esc(rs.foe)}에게 달려들었다!</p>` +
    `<div class="mock-bars"><div><small id="rsMe">나</small><div class="progress"><span id="rsMeBar" style="width:100%"></span></div></div><div><small id="rsEn">상대</small><div class="progress"><span id="rsEnBar" class="bad" style="width:100%"></span></div></div></div>` +
    `<div class="battle-log mock" id="rescueLog"></div>`, ['<button data-act="rescue-skip">건너뛰기</button>', '<button class="primary hidden" data-act="rescue-done">확인</button>'], true);
  let i = 0, hp = rs.hp0, mhp = rs.mhp0;
  const bars = () => { const a = $('#rsMeBar'), b = $('#rsEnBar'); if (!a) return; a.style.width = clamp(hp / rs.hp0 * 100, 0, 100) + '%'; b.style.width = clamp(mhp / rs.mhp0 * 100, 0, 100) + '%'; $('#rsMe').textContent = `나 ${Math.max(0, hp)}/${rs.hp0}`; $('#rsEn').textContent = `${rs.foe} ${Math.max(0, mhp)}/${rs.mhp0}`; };
  const add = (t, k) => { const lg = $('#rescueLog'); if (!lg) return; lg.insertAdjacentHTML('beforeend', `<div class="bl ${esc(k)}">${esc(t)}</div>`); lg.scrollTop = lg.scrollHeight; };
  const finish = () => {
    clearInterval(view.rescueTimer); view.rescueTimer = 0;
    for (; i < rs.log.length; i++) { const l = rs.log[i]; mhp -= l.d; hp -= l.h; add(l.t, l.k); }
    bars(); add(rs.win ? `${rs.foe}을(를) 물리쳤다! ${rs.who} 대원을 구했다.` : `${rs.foe}을(를) 이기지 못했다…`, 'note');
    const sk = $('[data-act="rescue-skip"]'), ok = $('[data-act="rescue-done"]'); if (sk) sk.classList.add('hidden'); if (ok) ok.classList.remove('hidden');
    sfx(rs.win ? 'levelup' : 'error');
  };
  view.rescueFinish = finish;
  bars(); add(`${rs.foe}와(과) 마주쳤다. 전투 시작!`, 'note');
  view.rescueTimer = setInterval(() => {
    if (!$('#rescueLog')) { clearInterval(view.rescueTimer); view.rescueTimer = 0; view.rescueAnim = false; return; }
    if (i >= rs.log.length) { finish(); return; }
    const l = rs.log[i++]; mhp -= l.d; hp -= l.h; add(l.t, l.k); bars();
  }, 450);
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
/* ---------- 실시간 교환 (교환대) ---------- */
let _ltBusy = false;
const isLtOpen = () => $('#overlay').classList.contains('open') && !!$('#ltRoot'); // 닫힌 창의 내용이 남아 있어도 열린 것으로 보지 않는다
const sameList = (a, b) => a.length === b.length && a.every(([n, q]) => (b.find(r => r[0] === n) || [0, 0])[1] === q);
let _nbBusy = false;
async function nearbyPoll() { // 같은 칸에 접속 중인 대원. 내 위치도 서버에 알린다 (위치가 바뀌면 바로, 아니면 pollTick 주기)
  if (!Cloud.enabled || !Cloud.user() || !state.created || _nbBusy) return;
  _nbBusy = true;
  try {
    const loc = locKey(); view.nbSent = loc; const r = await Cloud.nearbyPlayers(loc), list = (Array.isArray(r) ? r : []).slice(0, 20).map(p => ({ uid: String(p && p.uid || '').slice(0, 40), name: cleanText(p && p.name, 12) })).filter(p => p.uid && p.name);
    const key = JSON.stringify(list); if (key !== view.nbKey) { view.nbKey = key; view.nearby = list; if (state.side === '상황' && $('#sideView') && !$('#todoIn:focus')) renderSituation(); }
  } catch (e) { /* 서버 준비 전 */ } finally { _nbBusy = false; }
}
async function ltPoll() { // 서버에서 내 교환 상태를 가져와 맞춘다 (평소 5초, 교환창이 열려 있으면 2초)
  if (!Cloud.enabled || !Cloud.user() || !state.created || _ltBusy) return;
  _ltBusy = true;
  try { await ltApply(await Cloud.liveTradeView()); } catch (e) { /* 서버 준비 전 */ } finally { _ltBusy = false; }
}
async function ltApply(v) {
  view.lt = v && typeof v === 'object' ? { ...v, name: cleanText(v.name, 12) || '?', mine: cleanItemList(v.mine, 5), their: cleanItemList(v.their, 5) } : null;
  v = view.lt;
  if (!v) { if (releaseStaleBench(0)) { renderBag(); toast('교환 기록이 없어 올려 둔 물건을 돌려받았어요.'); } if (isLtOpen()) closeModal(); return; }
  if (state.bench && state.bench.id !== v.id && releaseStaleBench(v.id)) renderBag();
  if (v.status === 'done' || v.status === 'cancelled') { await ltFinish(v); return; }
  if (v.status === 'invited') {
    if (v.from_me) { if (isLtOpen()) renderLive(); return; }
    if (!$('#overlay').classList.contains('open') && view.ltAsk !== v.id) { view.ltAsk = v.id; sfx('ok'); ltAskModal(v); }
    else if (view.ltAsk !== v.id && view.ltToast !== v.id) { view.ltToast = v.id; toast(`${v.name} 대원이 교환을 신청했어요.`); }
    return;
  }
  // 교환대가 열린 상태: 내 기록이 서버 목록과 다르면(올리다 끊긴 경우) 서버에 다시 보낸다
  if (state.bench && state.bench.id === v.id && (!sameList(state.bench.items, v.mine)) && !view.ltAct) {
    try { const r = await Cloud.liveTradeSet(v.id, state.bench.items, 0); if (r && r.view) { view.lt = { ...r.view, name: v.name, mine: cleanItemList(r.view.mine, 5), their: cleanItemList(r.view.their, 5) }; v = view.lt; } } catch (e) { /* 다음에 다시 */ }
  }
  if (isLtOpen()) renderLive();
  else if (!$('#overlay').classList.contains('open') && view.ltOpened !== v.id) openLive(); // 처음 한 번만 자동으로 연다 (닫은 창을 다시 띄우지 않는다)
  else if (view.ltToast !== v.id) { view.ltToast = v.id; toast(`${v.name} 대원과의 교환이 진행 중이에요. (상대 프로필의 교환 버튼으로 다시 열 수 있어요)`); }
}
async function ltFinish(v) {
  const r = settleLive(v);
  if (r) {
    renderBag(); renderProfile(); renderMailBadge();
    if (r.done) { addLog(`${r.name} 대원과 물건을 교환했습니다.`); sfx('levelup'); toast((r.got.length ? `${r.name} 대원과 교환이 성사됐어요! 받은 물건은 메일함에서 수령하세요.` : `${r.name} 대원과 교환이 성사됐어요.`)); }
    else { sfx('error'); toast(r.back.length ? '교환이 취소됐어요. 올려 둔 물건을 돌려받았어요.' : `${r.name} 대원과의 교환이 이루어지지 않았어요.`); }
  }
  try { await Cloud.liveTradeAck(v.id); } catch (e) { /* 다음에 다시 */ }
  view.lt = null; if (isLtOpen() || view.ltAsk === v.id) { view.ltAsk = 0; closeModal(); }
}
function ltAskModal(v) {
  modal('교환 신청', `<p class="detail-desc"><b>${esc(v.name)}</b> 대원이 교환을 신청했어요. 수락하면 서로 교환대에 물건을 올리고, 둘 다 '교환'을 누르면 바뀝니다. (3분 안에 답하세요 · 오늘 남은 횟수 ${tradesLeft()}/${TRADE_DAILY})</p>`,
    ['<button data-act="lt-answer" data-accept="0">거절</button>', `<button class="primary" data-act="lt-answer" data-accept="1" ${tradesLeft() ? '' : 'disabled'}>수락</button>`], true);
}
async function ltAnswer(accept) {
  const v = view.lt; if (!v || v.status !== 'invited' || v.from_me || view.ltAct) return;
  if (accept && !tradesLeft()) { toast(`오늘은 교환을 모두 했습니다. (하루 ${TRADE_DAILY}회)`); sfx('error'); return; }
  view.ltAct = true;
  try {
    const r = await Cloud.liveTradeAnswer(v.id, accept); closeModal(); view.ltAsk = 0;
    if (r && r.view) await ltApply(r.view); else { toast('이미 처리된 신청이에요.'); await ltPoll(); }
  } catch (e) { toast('처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.'); sfx('error'); } finally { view.ltAct = false; }
}
async function liveTradeStart(name) {
  const v0 = view.lt;
  if (v0 && (v0.status === 'open' || v0.status === 'invited')) { if (v0.status === 'open') openLive(); else toast('이미 교환을 신청해 두었어요. 상대의 답을 기다려 주세요.'); return; }
  const uid = (view.partyUid || {})[name] || ((view.nearby || []).find(p => p.name === name) || {}).uid;
  if (!uid) { toast('상대 정보를 서버에서 가져오는 중이에요. 잠시 뒤 다시 시도해 주세요.'); friendPoll(); return; }
  if (!tradesLeft()) { toast(`오늘은 교환을 모두 했습니다. (하루 ${TRADE_DAILY}회)`); sfx('error'); return; }
  try {
    const r = await Cloud.liveTradeInvite(uid); if (!r || !r.ok) throw new Error(r && r.msg);
    toast(`${name} 대원에게 교환을 신청했어요.`); sfx('ok'); await ltPoll(); if (view.lt && !isLtOpen()) openLive();
  } catch (e) {
    sfx('error'); toast({ not_near: '상대가 같은 칸에 없어요. 교환은 파티원이나 같은 칸의 대원과만 할 수 있어요.', offline: '상대가 접속 중이 아니에요. 교환은 상대가 접속해 있을 때만 할 수 있어요.', busy: '상대가 다른 교환 중이에요.', busy_me: '아직 끝나지 않은 교환이 있어요. 잠시 뒤 다시 시도해 주세요.', bad: '교환을 신청할 수 없는 상대예요.' }[e && e.message] || '교환을 신청하지 못했어요.');
  }
}
async function ltEdit(name, delta, mk = '') { // 교환대에 올리기(+) / 내리기(−). mk = 제작자('' = 이름 없는 것)
  const v = view.lt; if (!v || v.status !== 'open' || view.ltAct || !ITEMS[name]) return;
  view.ltAct = true;
  try {
    if (delta > 0) { // 내 기기에서 먼저 빼고 서버에 알린다 (끊기면 다음 확인 때 다시 보낸다)
      const r = benchRaise(v.id, name, delta, mk); if (typeof r === 'string') { toast(r); sfx('error'); return; }
      renderBag(); sfx('click');
      const res = await Cloud.liveTradeSet(v.id, r, 0); if (res && res.view) await ltApply(res.view);
    } else { // 서버가 받아들인 뒤에 돌려받는다
      const have = benchQty(name, mk), m = Math.min(-delta, have); if (!m) return;
      const err = benchLowerOk(name, m); if (err) { toast(err); sfx('error'); return; }
      const next = benchNext(name, -m, mk), res = await Cloud.liveTradeSet(v.id, next, 0);
      if (res && res.ok) { benchLower(name, m, next, mk); renderBag(); sfx('click'); }
      if (res && res.view) await ltApply(res.view);
    }
  } catch (e) { toast('서버와 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.'); sfx('error'); }
  finally { view.ltAct = false; if (isLtOpen()) renderLive(true); }
}
async function ltConfirm() {
  const v = view.lt; if (!v || v.status !== 'open' || view.ltAct) return;
  if (!sameList(benchList(), v.mine)) { toast('올린 물건을 서버에 맞추는 중이에요. 잠시 뒤 다시 눌러 주세요.'); ltPoll(); return; }
  view.ltAct = true;
  try {
    const r = await Cloud.liveTradeConfirm(v.id, v.ver);
    if (r && r.view) await ltApply(r.view);
    if (r && r.ok) { if (view.lt && view.lt.status === 'open') toast('교환을 눌렀어요. 상대도 누르면 바로 바뀝니다.'); }
    else { sfx('error'); toast({ changed: '교환대가 바뀌었어요. 다시 확인하고 눌러 주세요.', empty: '교환대에 올린 물건이 없어요.', both_cr: 'CR 은 한쪽만 낼 수 있어요.', moved: '상대와 같은 칸이 아니게 되어 교환이 취소됐어요.', closed: '교환이 이미 끝났어요.' }[r && r.msg] || '처리하지 못했어요.'); }
  } catch (e) { toast('서버와 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.'); sfx('error'); }
  finally { view.ltAct = false; if (isLtOpen()) renderLive(true); }
}
async function ltCancel() {
  const v = view.lt; if (!v || view.ltAct || (v.status !== 'open' && v.status !== 'invited')) return;
  view.ltAct = true;
  try { const r = await Cloud.liveTradeCancel(v.id); if (r && r.view) await ltApply(r.view); else await ltPoll(); }
  catch (e) { toast('서버와 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.'); sfx('error'); }
  finally { view.ltAct = false; }
}
function liveHtml(v) {
  if (v.status === 'invited') return `<div id="ltRoot" class="lt-wait"><p class="detail-desc"><b>${esc(v.name)}</b> 대원이 수락하기를 기다리는 중이에요… (3분 안에 답이 없으면 자동으로 끝나요)</p></div>`;
  const mine = benchList(), their = v.their, bagV = invVariants().filter(x => x.n !== MAIL_SHIP_ITEM).sort((a, b) => ITEMS[a.n].tab.localeCompare(ITEMS[b.n].tab) || a.n.localeCompare(b.n));
  const mkTag = mk => (mk ? ` <small class="mk-line">· ${esc(mk)}</small>` : ''), mka = mk => `data-mk="${esc(mk || '')}"`;
  const col = (title, list, own, ok) => `<div class="lt-col"><div class="lt-head"><b>${esc(title)}</b>${ok ? '<span class="lt-ok">교환 확인 ✔</span>' : ''}</div>` +
    (list.map(([n, q, mk]) => `<div class="lt-item">${icon(ITEMS[n].icon)}<span>${esc(shownName(n))} ×${q}${mkTag(mk)}</span>${own ? `<button data-act="lt-minus" data-name="${esc(n)}" ${mka(mk)} data-qty="1">−1</button><button data-act="lt-minus" data-name="${esc(n)}" ${mka(mk)} data-qty="${q}">내리기</button>` : ''}</div>`).join('') || '<div class="lt-empty">비어 있음</div>') + '</div>';
  const pick = bagV.map(({ n, mk, q }) => {
    const bq = benchQty(n, mk), full = bq >= 99 || (!bq && mine.length >= 5);
    return `<div class="lt-item">${icon(ITEMS[n].icon)}<span>${esc(shownName(n))} ×${q}${mkTag(mk)}</span><button data-act="lt-plus" data-name="${esc(n)}" ${mka(mk)} data-qty="1" ${full ? 'disabled' : ''}>+1</button>${q > 1 ? `<button data-act="lt-plus" data-name="${esc(n)}" ${mka(mk)} data-qty="${Math.min(q, 99 - bq)}" ${full ? 'disabled' : ''}>전부</button>` : ''}</div>`;
  }).join('') || '<div class="lt-empty">올릴 소지품이 없어요.</div>';
  return `<div id="ltRoot"><p class="tiny">서로 물건을 올린 뒤 <b>둘 다 '교환'</b>을 누르면 바뀝니다. 누른 뒤 누구든 물건을 바꾸면 확인이 풀려요. 올린 물건은 내 소지품에서 빠져 있고, 취소하면 돌아옵니다. (15분 동안 아무 변화가 없으면 자동 취소)</p>` +
    `<div class="lt-grid">${col('내 교환대', mine, true, v.my_ok)}${col(`${v.name}의 교환대`, their, false, v.their_ok)}</div>` +
    `<div class="choice-label">내 소지품에서 올리기 <small class="tiny">— 종류 5개 · 종류마다 99개까지</small></div><div class="lt-pick">${pick}</div></div>`;
}
function liveButtons(v) {
  const b = ['<button data-act="lt-hide">창 닫기</button>', '<button class="danger" data-act="lt-cancel">교환 취소</button>'];
  if (v.status === 'open') { const can = (benchList().length + v.their.length) > 0; b.push(`<button class="primary" data-act="lt-confirm" ${v.my_ok || !can ? 'disabled' : ''}>${v.my_ok ? '확인함 · 상대를 기다리는 중' : '교환'}</button>`); }
  return b;
}
function openLive() {
  const v = view.lt; if (!v) return;
  view.ltOpened = v.id;
  modal(`${v.name} 대원과 교환`, liveHtml(v), liveButtons(v), true);
  view.ltKey = '';
  if (!view.ltTimer) view.ltTimer = setInterval(() => { if (!isLtOpen()) { clearInterval(view.ltTimer); view.ltTimer = 0; return; } ltPoll(); }, 2000);
}
function renderLive(force) { // 바뀐 것이 있을 때만 다시 그린다 (스크롤 위치 유지)
  const v = view.lt; if (!v || !isLtOpen()) return;
  const key = JSON.stringify([v.status, v.ver, v.my_ok, v.their_ok, v.their, benchList(), usedSlots()]);
  if (!force && key === view.ltKey) return;
  view.ltKey = key;
  const sc = $('#modalBody').scrollTop;
  modal(`${v.name} 대원과 교환`, liveHtml(v), liveButtons(v), true);
  $('#modalBody').scrollTop = sc;
}
/* 되돌릴 수 없는 일을 하기 전에 "정말로 할지" 묻는 작은 창. 취소하면 back()으로 원래 창으로 돌아간다 */
function questFinish(q, drop) {
  const r = completeQuest(q.id, drop); view.qfull = null;
  if (!r) { toast('아직 임무 조건을 달성하지 못했습니다.'); return; }
  renderProfile(); renderBars(); renderStatus(); renderSide(); sfx(r.ups ? 'levelup' : 'ok');
  renderInventory(); renderLeftTab();
  addLog(`임무 완수: ${q.title} (${rewardText(q)})`);
  toast(`임무 완수! ${q.title}${r.ups ? ` · 레벨 업 Lv.${state.character.level}` : ''}${r.ticket ? ' · 뽑기권 1장 획득!' : ''}`);
  if (r.ticket) addLog(`뽑기권 1장을 받았습니다. (상점가 뽑기 기계)`);
  if (r.cap) { addLog(`한계 돌파! 최고 레벨이 ${r.cap}(으)로 올랐습니다.`); toast(`한계 돌파! 이제 Lv.${r.cap}까지 성장할 수 있어요.`); renderProfile(); renderBars(); }
  if (r.promo) {
    const news = RECIPES.filter(rc => rc.rank === r.promo && !recipeKnown(rc)).map(rc => rc.out);
    renderCraft(); renderLeftTab();
    if (r.promo === 'A') { state.flags.annoA = 'pending'; save(); announceRankA(); } // A급이 되면 월드 채팅에 축하 공지가 올라간다
    if (news.length) { addLog(`${r.promo}등급 승급! 속성학습으로 배울 수 있는 레시피 ${news.length}종 추가`); toast(`${r.promo}등급 승급! 단련으로 새 레시피 ${news.length}종을 배울 수 있게 되었습니다.`); }
  }
  const lost = Object.entries(drop).filter(([, c]) => c > 0).map(([n, c]) => `${shownName(n)} ×${c}`);
  if (lost.length) toast(`보상 ${lost.join(', ')}은(는) 받지 않고 버렸습니다.`);
}
/* 임무 보상이 가방에 다 안 들어갈 때: 소지품 한 칸을 버리거나, 못 받는 보상을 버리거나 */
function openQuestFull() {
  const f = view.qfull, q = f && QUESTS.find(x => x.id === f.id); if (!q) { closeModal(); return; }
  if (!questReady(q)) { view.qfull = null; closeModal(); toast('아직 임무 조건을 달성하지 못했습니다.'); return; }
  const ov = questOverflow(q, f.drop);
  if (!ov.length) { closeModal(); questFinish(q, f.drop); return; }
  const need = new Set(needParts(q).filter(n => n.name).map(n => n.name)); // 이 임무에 쓰이는 물건은 버릴 수 없다
  const cells = []; ['장비', '소모품', '재료'].forEach(tab => (state.inventory[tab] || []).forEach((st, i) => { if (!ITEMS[st.n] || need.has(st.n)) return;
    cells.push(`<button class="slot clickable filled" data-act="qfull-pick" data-tab="${tab}" data-idx="${i}" data-item="${esc(st.n)}" data-tip-title="${esc(shownName(st.n))}" data-tip-desc="${esc(itemTip(st.n))}" aria-label="${esc(st.n)}">${icon(ITEMS[st.n].icon)}${st.q > 1 ? `<span class="qty">${st.q}</span>` : ''}</button>`); }));
  modal('가방이 가득 찼어요',
    `<p class="detail-desc">임무 보상을 모두 담을 자리가 없습니다. 소지품에서 한 칸을 골라 버리거나, 받을 수 없는 보상을 버려야 해요.</p>` +
    `<p class="tiny">담지 못하는 보상</p>` + ov.map(([n, c]) => `<div class="row-gap"><span>${icon(ITEMS[n].icon)} ${esc(shownName(n))} ×${c}</span><button class="danger" data-act="qfull-drop" data-item="${esc(n)}">이 보상 버리기</button></div>`).join('') +
    `<p class="tiny">버릴 소지품 고르기 (누르면 한 번 더 물어요)</p>` + (cells.length ? `<div class="inv-grid">${cells.join('')}</div>` : '<div class="empty">버릴 수 있는 소지품이 없습니다.</div>'),
    ['<button data-act="qfull-cancel">취소</button>'], true);
}
function askConfirm(title, msg, okLabel, act, data, back) {
  view.confirmBack = back;
  const attrs = Object.entries(data || {}).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ');
  modal(title, `<p class="detail-desc">${esc(msg)}</p>`, ['<button data-act="confirm-cancel">취소</button>', `<button class="danger" data-act="${act}" ${attrs}>${esc(okLabel)}</button>`], true);
}
function openEnhance(keepScroll) {
  const st0 = keepScroll === true && $('#modalBody') ? $('#modalBody').scrollTop : 0, names = enchantables(), worn = new Set(Object.values(state.equipment));
  const tab = view.enhTab === '세공' ? '세공' : '강화';
  const tabs = `<div class="tabs flush">${['강화', '세공'].map(t => `<button class="${t === tab ? 'active' : ''}" data-act="enh-tab" data-tab="${t}">${t}</button>`).join('')}</div>`;
  let intro, rows;
  if (tab === '강화') {
    intro = `<p class="tiny">무기를 F랭에서 A랭까지 키웁니다. 랭크가 오를수록 무기 공격력이 늘지만, 도전에 실패하면 CR만 잃어요. (랭크는 내려가지 않아요) 보유 CR ${state.money}</p>`;
    rows = names.filter(n => ITEMS[n].slot === '무기').map(n => {
      const it = ITEMS[n], lv = reinforceLv(n), max = lv >= REINFORCE_RANKS.length - 1;
      return `<div class="nearby-row"><div class="round-avatar">${icon(it.icon)}</div><div class="grow"><strong>${esc(shownName(n))}${nickOf(n) ? ` <small>(${esc(n)})</small>` : ''} <em class="tag">${REINFORCE_RANKS[lv]}랭</em></strong><small>${worn.has(n) ? '착용 중' : '소지품'} · 공격력 +${it.atk + reinforceBonus(n)}${lv ? ` (강화 +${reinforceBonus(n)})` : ''}</small><small>${max ? (nickOf(n) ? `최고 랭크입니다. 이름: 「${esc(nickOf(n))}」` : '최고 랭크입니다. 이제 이 무기에 이름을 붙일 수 있어요.') : `${REINFORCE_RANKS[lv]} → ${REINFORCE_RANKS[lv + 1]} · 성공 ${Math.round(REINFORCE_RATE[lv] * 100)}% · 공격력 +${REINFORCE_BONUS[lv + 1] - REINFORCE_BONUS[lv]}`}</small></div>` +
        (max ? `<button class="primary" data-act="nick-open" data-name="${esc(n)}">${icon('edit')} ${nickOf(n) ? '이름 바꾸기' : '이름 붙이기'}</button></div>` : `<button class="primary" data-act="reinforce-roll" data-name="${esc(n)}" ${state.money < REINFORCE_COST[lv] ? 'disabled' : ''}>강화 (${REINFORCE_COST[lv]} CR)</button></div>`);
    }).join('') || '<div class="empty">강화할 무기가 없습니다. 무기를 얻거나 제작해 보세요.</div>';
  } else {
    intro = `<p class="tiny">CR ${ENCHANT_COST}을 내면 장비에 무작위 효과(스탯 +1~2, 최대 HP·기력 +5~15)가 하나 붙습니다. 장착하면 적용되고, 다시 세공하면 새 효과로 바뀝니다. 같은 이름의 장비는 효과를 함께 씁니다. 보유 CR ${state.money}</p>`;
    rows = names.map(n => {
      const it = ITEMS[n], e = state.enchants[n];
      return `<div class="nearby-row"><div class="round-avatar">${icon(it.icon)}</div><div class="grow"><strong>${esc(n)}</strong><small>${esc(it.slot)} · ${worn.has(n) ? '착용 중' : '소지품'}${e ? ` · ${e.n}회 세공` : ''}</small><small class="${e ? 'ench-on' : ''}">${e ? `현재 효과: ${esc(enchantText(e))}` : '아직 세공하지 않았습니다.'}</small></div>` +
        `<button class="primary" data-act="enhance-roll" data-name="${esc(n)}" ${state.money < ENCHANT_COST ? 'disabled' : ''}>${e ? '다시' : '세공'} (${ENCHANT_COST} CR)</button></div>`;
    }).join('') || '<div class="empty">세공할 장비가 없습니다. 장비를 얻거나 제작해 보세요.</div>';
  }
  modal('장비 강화', tabs + intro + rows, [btnClose], true);
  $('#modalBody').scrollTop = st0;
}
function openDismantle(keepScroll) {
  const st0 = keepScroll === true && $('#modalBody') ? $('#modalBody').scrollTop : 0, rows = dismantlable().map(([n, c]) => {
    const it = ITEMS[n], y = dismantleYield(n), up = [reinforceLv(n) ? `${REINFORCE_RANKS[reinforceLv(n)]}랭` : '', state.enchants[n] ? '세공' : '', nickOf(n) ? '이름' : ''].filter(Boolean).join('·');
    return `<div class="nearby-row"><div class="round-avatar">${icon(it.icon)}</div><div class="grow"><strong>${esc(n)}${c > 1 ? ` ×${c}` : ''}</strong><small>${esc(it.slot)} · 소지품${up ? ` · ${esc(up)} 기록은 마지막 1개를 분해하면 사라짐` : ''}</small><small>얻는 것: ${y.mats.map(([m, q]) => `${esc(m)} ×${q}`).join(', ')} · ${y.cr} CR</small></div>` +
      `<button class="danger" data-act="dismantle-ask" data-name="${esc(n)}">분해</button></div>`;
  }).join('') || '<div class="empty">분해할 장비가 없습니다. 소지품에 쓰지 않는 장비가 있어야 해요. (착용 중인 장비는 분해할 수 없습니다)</div>';
  modal('분해', `<p class="tiny">소지품의 장비를 분해하면 재료와 약간의 CR을 얻습니다. 분해한 장비는 되돌릴 수 없어요. 보유 CR ${state.money}</p>` + rows, [btnClose], true);
  $('#modalBody').scrollTop = st0;
}
const storQ = () => String(view.storQ || '').trim().toLowerCase();
document.addEventListener('input', e => { // 소지품·창고 검색: 입력창은 그대로 두고 목록만 다시 그린다
  if (!e.target) return;
  if (e.target.id === 'craftQ') { view.craftQ = cleanText(e.target.value, 20); renderCraft(); }
  if (e.target.id === 'invQ') { view.invQ = cleanText(e.target.value, 20); state.page = 1; renderInventory(); }
  else if (e.target.id === 'storQ') { view.storQ = cleanText(e.target.value, 20); const b = $('#storBox'); if (b && view.storList) b.innerHTML = view.storList(); } // 입력창은 그대로 두고 창고 목록만 바꾼다 (한글 조합이 끊기지 않게)
});
function openStorage(keepScroll) {
  if (keepScroll !== true) view.storQ = ''; // 개인실 창고: 소지품 격자와 창고 격자를 한 화면에서 보고, 칸을 눌러 고른 뒤 옮긴다 (세이브에 이름→수량만 저장)
  const st0 = keepScroll === true && $('#modalBody') ? $('#modalBody').scrollTop : 0;
  const bag = {}; Object.values(state.inventory).flat().forEach(s => { bag[s.n] = (bag[s.n] || 0) + s.q; });
  const bagNames = Object.keys(bag).filter(n => ITEMS[n]).sort((x, y) => ITEMS[x].tab.localeCompare(ITEMS[y].tab) || x.localeCompare(y));
  const bagV = bagNames.flatMap(n => itemVariants(n).map(v => [n, v.mk, v.q])); // 제작자가 다르면 따로 고른다
  const sq = storQ(), stor = storageList().filter(([n]) => !sq || `${n} ${shownName(n)}`.toLowerCase().includes(sq));
  const storV = n => storedVariants(n).map(v => [n, v.mk, v.q]), vq = (side, n, mk) => side === 'bag' ? countItem(n, mk) : (storedVariants(n).find(v => v.mk === mk) || { q: 0 }).q;
  let sel = view.storSel; // { side: 'bag' | 'stor', name, mk }
  if (!sel || !ITEMS[sel.name] || !vq(sel.side, sel.name, sel.mk || '')) sel = view.storSel = null;
  const cell = (side, n, q, mk = '') => `<button class="slot clickable filled ${sel && sel.side === side && sel.name === n && (sel.mk || '') === mk ? 'selected' : ''}" data-act="storage-pick" data-side="${side}" data-name="${esc(n)}" data-mk="${esc(mk)}" data-tip-title="${esc(shownName(n))} ×${q}" data-tip-desc="${esc(itemTip(n, mk))}" aria-label="${esc(n)}">${icon(ITEMS[n].icon)}${mk ? `<span class="mk-label">${esc(mkShort(mk))}</span>` : ''}<span class="qty">${q}</span></button>`;
  const grid = (cells, min) => { const c = cells.slice(); while (c.length < min) c.push('<div class="slot" aria-label="빈 칸"></div>'); return `<div class="inv-grid stor-grid">${c.join('')}</div>`; };
  const btns = (act, n, max, mk) => [1, 10].filter(q => q < max).map(q => `<button data-act="${act}" data-name="${esc(n)}" data-mk="${esc(mk)}" data-qty="${q}">${q}</button>`).join('') + `<button data-act="${act}" data-name="${esc(n)}" data-mk="${esc(mk)}" data-qty="${max}">${max > 1 ? '전부' : '1'}</button>`;
  const storHtml = view.storList = () => { const sq2 = storQ(); return grid(storageList().filter(([n]) => !sq2 || `${n} ${shownName(n)}`.toLowerCase().includes(sq2)).flatMap(([n]) => storV(n)).map(([n, mk, q]) => cell('stor', n, q, mk)), 18); };
  let bar = '<p class="tiny stor-hint">옮길 물건의 칸을 눌러 고르세요. 소지품에서 고르면 창고로, 창고에서 고르면 소지품으로 옮깁니다.</p>';
  if (sel) {
    const n = sel.name, mk = sel.mk || '', put = sel.side === 'bag', max = put ? Math.min(countItem(n, mk), STORAGE_STACK) : vq('stor', n, mk);
    bar = `<div class="stor-bar"><span class="grow">${icon(ITEMS[n].icon)} <b>${esc(shownName(n))}</b>${mk ? ` <span class="tiny mk-line">제작 · ${esc(mk)}</span>` : ''} <span class="tiny">${put ? `소지품 ${countItem(n, mk)}개${state.storage[n] ? ` · 창고 ${state.storage[n]}개` : ''} → 창고로` : `창고 ${vq('stor', n, mk)}개 → 소지품으로`}</span></span><span class="stor-btns">${btns(put ? 'storage-put' : 'storage-take', n, max, mk)}</span></div>`;
  }
  modal('개인실 창고', `<p class="tiny">창고 <b>${storageKinds()} / ${STORAGE_KINDS}</b>종 · 가방 ${usedSlots()} / ${bagCapacity()} · 한 종류에 ${STORAGE_STACK}개까지. 창고에 둔 물건은 소지품이 아니라서 소지 효과(반지 등)가 없어요.</p>` +
    `<div class="choice-label">소지품</div>${grid(bagV.map(([n, mk, q]) => cell('bag', n, q, mk)), 18)}${bar}` +
    `<div class="choice-label">창고 <small class="tiny">${storageKinds()} / ${STORAGE_KINDS}종</small></div><div class="search-row stor-search"><input id="storQ" type="search" maxlength="20" placeholder="창고에서 검색" aria-label="창고 검색" autocomplete="off" value="${esc(view.storQ || '')}"></div><div id="storBox">${storHtml()}</div>`, [btnClose], true);
  $('#modalBody').scrollTop = st0;
}
function jobPanelHtml(side) { // 서브잡 납품 화면 (창과 오른쪽 '서브잡' 탭이 함께 쓴다. 탭에서는 그만두기가 없다)
  const j = state.subjob;
  const need = jobNeed(j.level), stock = jobStock(), have = stock.reduce((a, r) => a + r.q, 0), cd = jobCooldown(), act = jobActive();
  const picks = stock.length ? stock.map(r => `<div class="job-pick-row"><span class="grow">${icon(ITEMS[r.n].icon)} ${esc(r.n)} <small>(보유 ${r.q} · 판매가 ${r.price})</small></span><input type="number" class="job-pick" data-n="${esc(r.n)}" min="0" max="${r.q}" value="0" ${cd ? 'disabled' : ''}></div>`).join('') : `<div class="empty">납품할 수 있는 ${esc(j.tags.join('/'))} 태그 아이템이 없습니다.</div>`;
  return (`<div class="job-card"><div class="job-head"><strong>${esc(j.name)}</strong><span class="tag">Lv.${j.level}${j.level >= JOB_MAX_LV ? ' MAX' : ''}</span>${j.tags.map(t => `<span class="tag">#${t}</span>`).join('')}</div>` +
    `<div class="bar thin"><span style="width:${j.level >= JOB_MAX_LV ? 100 : j.prog / jobProgNeed(j.level) * 100}%"></span></div>` +
    `<small>${j.level >= JOB_MAX_LV ? '최고 레벨입니다.' : `다음 레벨까지 납품 ${j.prog}/${jobProgNeed(j.level)}일`}</small>` +
    `<small>${act ? `<b>버프 적용 중</b> (${fmtLeft(cd)} 남음): ${esc(jobFxText())}` : `<b>버프 꺼짐</b> — 오늘 납품을 마치면 적용: ${esc(jobFxText(true))}`}</small>` +
    `<small>오늘의 납품: ${j.tags.join('/')} 태그 아이템 <b>${need}개</b>를 직접 골라 내세요 (납품 대금 = 판매가의 125%)</small>` +
    (cd ? `<small class="risk">다음 납품까지 ${fmtLeft(cd)}</small>` : '') + `</div>` +
    `<div class="job-picks">${picks}</div><small class="job-total">고른 수량 0 / ${need}</small>` +
    `<div class="row-gap"><button data-act="job-auto" ${cd || have < need ? 'disabled' : ''}>싼 것부터 채우기</button><button class="primary" data-act="job-deliver" ${cd || have < need ? 'disabled' : ''}>납품하기</button>${side ? '' : `<button data-act="job-quit" class="${view.quitAsk ? 'danger' : ''}">${view.quitAsk ? '정말 그만두기 (레벨 초기화)' : '서브잡 그만두기'}</button>`}</div>`);
}
function openJob(keepScroll) {
  const j = state.subjob, st = keepScroll ? $('#modalBody').scrollTop : 0;
  const lore = `<div class="job-lore">${icon('memory')}<p>클론 인간의 몸은 새로 만들어 낼 수 있어도, <b>근본이 되는 인간의 기억</b>은 가만히 두면 조금씩 닳아 없어집니다. 사람다운 일상을 반복하는 것 — 무언가를 만들고, 거두고, 나누는 것 — 이 기억을 붙잡아 두는 유일한 방법입니다. 서브잡은 그래서 필요한 일입니다.</p></div>`;
  if (!j) {
    modal('서브잡 가입', lore + `<div class="srow fontrow"><span>생전 가졌던 직업</span><input id="jobName" maxlength="${JOB_NAME_MAX}" placeholder="비워 두면 태그 이름 (예: 숲속 요리사)"></div>` +
      `<div class="choice-label">태그 (1개) — 같은 태그가 붙은 아이템을 납품해요</div><div class="tag-grid">${JOB_TAGS.map(([t, ic, d]) => `<label class="tag-pick" title="${esc(d)}"><input type="radio" name="jobtag" class="job-tag" value="${t}"><span>${icon(ic)} ${t}</span></label>`).join('')}</div>` +
      `<p class="tiny">하루에 한 번, 태그가 붙은 아이템을 정해진 개수만큼 납품하면 서브잡 레벨이 오르고 버프를 받아요. 생전 직업은 프로필에 표시됩니다. 하루에 한 번 납품을 마친 날에만 서브잡 버프가 적용돼요. 아이템의 태그는 가방·상점 아이템 설명에서 볼 수 있어요. 채집·채굴·낚시를 뺀 태그(요리·약학·제작·농사)는 납품한 개수만큼 스테이터스의 그 숙련도도 올라요.</p>`,
      [btnClose, '<button class="primary" data-act="job-join">가입</button>'], true);
    return;
  }
  modal(`서브잡 · ${j.name}`, lore + jobPanelHtml(false), [btnClose], true);
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
    const joined = !was; // 이름만 바뀐 경우(길드장이 이름 변경)에는 길드 채팅 기록을 지우지 않는다
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
    modal('길드', `<div class="search-row"><input id="guildQ" placeholder="길드 이름으로 검색" aria-label="길드 검색" value="${esc(dr.s)}"><button data-act="guild-find">검색</button></div><div id="guildFound"></div>` + incHtml + sentHtml +
      `<div class="choice-label">길드 만들기</div><div class="form-row"><label>길드 이름</label><input id="guildName" maxlength="${GUILD_NAME_MAX}" placeholder="${GUILD_NAME_MIN}~${GUILD_NAME_MAX}자" value="${esc(defaultGuildName())}"></div>` +
      `<p class="tiny">길드를 만들면 길드장이 되어 대원을 초대할 수 있어요. 이미 있는 길드에는 가입 신청을 보내고 길드장이 수락하면 가입돼요.</p>`,
      [btnClose, '<button class="primary" data-act="guild-create">길드 만들기</button>']);
    return;
  }
  const mem = (g.members || []).map(m => ({ uid: m.uid, name: cleanText(m.name, 12), master: !!m.master }));
  modal(`길드 · ${cleanText(g.name, GUILD_NAME_MAX)}`, (g.master ? `<div class="search-row"><input id="guildQ" placeholder="대원 이름으로 검색" aria-label="대원 검색" value="${esc(dr.s)}"><button data-act="guild-find-player">검색</button></div><div id="guildFound"></div>` : '') + incHtml + sentHtml +
    `<div class="choice-label">길드원 ${mem.length}/${GUILD_MAX}</div><div class="member-grid">` + mem.map(m => `<div class="member-row"><div class="round-avatar" data-user="${esc(m.name)}">${avatarOf(m.name)}</div><div class="grow"><strong data-user="${esc(m.name)}">${esc(m.name)}</strong><small>${m.master ? '길드장' : '길드원'}${m.uid === Cloud.userUid ? ' (나)' : ''}</small></div></div>`).join('') + '</div>' +
    (g.master ? `<div class="choice-label">길드 이름 변경</div><div class="search-row"><input id="guildRename" maxlength="${GUILD_NAME_MAX}" placeholder="${GUILD_NAME_MIN}~${GUILD_NAME_MAX}자" aria-label="새 길드 이름" value="${esc(cleanText(g.name, GUILD_NAME_MAX))}"><button data-act="guild-rename">변경</button></div>` : '') +
    `<p class="tiny">${g.master ? '길드장입니다. 위 검색으로 대원을 초대하거나 가입 신청을 수락할 수 있어요.' : '길드원입니다.'}</p>`,
    [btnClose, `<button class="danger" data-act="guild-leave">${g.master ? '길드 해산' : '길드 탈퇴'}</button>`]);
}
function openGuild() {
  if (guildOnline()) { openGuildOnline(); return; }
  const g = state.guild;
  if (!g) {
    modal('길드', `<p class="tiny">길드를 만들면 길드장이 되어 다른 대원를 초대할 수 있어요.</p>` +
      `<div class="form-row"><label>길드 이름</label><input id="guildName" maxlength="${GUILD_NAME_MAX}" placeholder="${GUILD_NAME_MIN}~${GUILD_NAME_MAX}자" value="${esc(defaultGuildName())}"></div>` +
      `<div class="choice-label">가입할 수 있는 길드</div><div class="empty">지금 가입할 수 있는 길드가 없습니다.</div>`,
      [btnClose, '<button class="primary" data-act="guild-create">길드 만들기</button>']);
    return;
  }
  const rest = NEARBY_PLAYERS.filter(p => !g.members.includes(p[0]));
  modal(`길드 · ${g.name}`, `<p class="tiny">${g.members.length + 1}/${GUILD_MAX}명 · ${g.master ? '길드장입니다. 아래에서 대원을 초대할 수 있어요.' : '길드원입니다.'}</p>` +
    `<div class="member-grid"><div class="member-row"><div class="round-avatar" data-user="${esc('나')}">${avatarOf('나')}</div><div class="grow"><strong data-user="${esc('나')}">${esc(state.character.name || '나')}</strong><small>${g.master ? '길드장 (나)' : '나'}</small></div></div>` +
    g.members.map(n => `<div class="member-row"><div class="round-avatar" data-user="${esc(n)}">${avatarOf(n)}</div><div class="grow"><strong data-user="${esc(n)}">${esc(n)}</strong><small>길드원</small></div></div>`).join('') + '</div>' +
    (g.master ? `<div class="choice-label">길드 이름 변경</div><div class="search-row"><input id="guildRename" maxlength="${GUILD_NAME_MAX}" placeholder="${GUILD_NAME_MIN}~${GUILD_NAME_MAX}자" aria-label="새 길드 이름" value="${esc(g.name)}"><button data-act="guild-rename">변경</button></div>` : '') +
    (g.master && rest.length ? '<div class="choice-label">초대</div>' + rest.map(([n, st]) => `<div class="member-row"><div class="grow"><strong>${esc(n)}</strong><small>${esc(st)}</small></div><button data-act="guild-invite" data-name="${esc(n)}">초대</button></div>`).join('') : ''),
    [btnClose, `<button class="danger" data-act="guild-leave">${g.master ? '길드 해산' : '길드 탈퇴'}</button>`]);
}
$('#chatForm').onsubmit = e => {
  e.preventDefault();
  const val = $('#chatInput').value.trim();
  if (!val) return;
  if (sendChat(val) !== false) $('#chatInput').value = ''; // 쿨타임에 걸리면 쓴 글을 지우지 않는다
};
/* 이모티콘: 입력창 위에 종류가 뜨고, 누르면 바로 전송 */
function setTray(open) {
  const tray = $('#stickerTray');
  if (open) tray.innerHTML = STICKERS.map(([n, ic]) => `<button class="sticker" data-act="sticker" data-name="${n}" title="${n}" aria-label="${n}">${icon(ic)}</button>`).join('');
  tray.classList.toggle('hidden', !open);
  $('#emojiBtn').classList.toggle('active', open);
}
$('#diceBtn').onclick = () => { if (state.chatTab === '알림') return; sendChat(`🎲 주사위를 굴렸어요: ${1 + Math.floor(Math.random() * 6)}`); setTray(false); };
$('#emojiBtn').onclick = () => state.chatTab === '알림' ? setTray(false) : setTray($('#stickerTray').classList.contains('hidden'));
$('#clearLog').onclick = () => { state.logs = []; renderLogs(); save(); };

/* 지도 드래그 / 확대 / 축소 / 중앙 정렬 */
let drag = null;
const stage = $('#mapStage');
stage.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' && e.button !== 1 && e.button !== 0) return; // 마우스: 왼쪽은 빈 곳(타일·노드 밖)을 끌면 이동, 가운데(휠) 버튼은 어디서든
  if (e.target.closest('.map-tools, .map-search, input')) return;
  const mid = e.pointerType === 'mouse' && e.button === 1; // 가운데 버튼은 노드·타일 위에서도 끌 수 있다
  if (!mid && e.target.closest('button')) {
    if (!state.dungeon || e.pointerType === 'mouse') return; // 마우스 왼쪽 클릭은 타일·노드 누르기 그대로
    drag = { x: e.clientX, y: e.clientY, px: view.dpan.x, py: view.dpan.y, d: 1, pend: true, id: e.pointerId }; return; // 위험지대 타일: 톡 누르면 이동, 끌면 지도 이동
  }
  e.preventDefault();
  drag = state.dungeon ? { x: e.clientX, y: e.clientY, px: view.dpan.x, py: view.dpan.y, d: 1 } : { x: e.clientX, y: e.clientY, px: state.pan.x, py: state.pan.y };
  stage.classList.add('dragging');
  stage.setPointerCapture(e.pointerId);
});
stage.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); }); // 휠 클릭 자동 스크롤 방지
stage.addEventListener('wheel', e => { if (e.target.closest('.map-search, input')) return; e.preventDefault(); zoomBy(e.deltaY < 0 ? .1 : -.1); }, { passive: false }); // 마우스 휠: 확대·축소
stage.addEventListener('pointermove', e => {
  if (!drag) return;
  if (drag.pend) { if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return; drag.pend = false; drag.moved = true; try { stage.setPointerCapture(drag.id); } catch (er) { /* 무시 */ } stage.classList.add('dragging'); }
  const nx = drag.px + e.clientX - drag.x, ny = drag.py + e.clientY - drag.y;
  if (drag.d) { const lim = (v, n) => clamp(v, -n, n); view.dpan = { x: lim(nx, stage.clientWidth), y: lim(ny, stage.clientHeight) }; } else state.pan = { x: nx, y: ny };
  applyMapTransform();
});
const endDrag = () => { if (drag) { const was = drag; drag = null; stage.classList.remove('dragging'); if (was.moved) view.noClickUntil = Date.now() + 350; if (!was.d && !was.pend) save(); } };
stage.addEventListener('click', e => { if (Date.now() < (view.noClickUntil || 0)) { e.stopPropagation(); e.preventDefault(); } }, true); // 끌고 난 뒤 손가락을 뗄 때 타일이 눌리지 않게
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
  L.statusH = intIn(L.statusH, 0, 2000, 0); L.mapH = intIn(L.mapH, 0, 3000, 0); L.questH = intIn(L.questH, 0, 3000, 0); // 0 = 자동 높이
  rootStyle.setProperty('--left', L.left + 'px'); rootStyle.setProperty('--right', L.right + 'px');
  rootStyle.setProperty('--status-h', L.statusH + 'px'); rootStyle.setProperty('--map-h', L.mapH + 'px');
  $('.status-panel').classList.toggle('sized', L.statusH > 0); $('.map-panel').classList.toggle('sized', L.mapH > 0);
  rootStyle.setProperty('--quest-h', L.questH + 'px'); $('.quest-panel').classList.toggle('sized', L.questH > 0);
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
addVGrip('.quest-panel', 'questH', 140, () => { const c = $('.right-column'); return c.clientHeight - 200 - colGap(c); }); // 임무 ↔ 채팅 높이
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
const cf = { step: 1, name: '', age: '', keywords: '', ability: '', abilityDesc: '', mainStat: '', subStat: '', stats: {} };
const resetCf = () => Object.assign(cf, { step: 1, name: '', age: '', keywords: '', ability: '', abilityDesc: '', mainStat: '', subStat: '', stats: Object.fromEntries(STAT_DEFS.map(d => [d.key, STAT_BASE])) });
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
  $('#tutCloudLoad').classList.toggle('hidden', !(Cloud.enabled && Cloud.user() && !state.created && !tut.replay)); // 저장이 날아가 처음 화면이 떴을 때 서버 진행을 바로 불러올 수 있게
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
    body.innerHTML = `<p class="npc-say">이능력은 자유롭게 적어 주세요. (이름과 설명은 롤플용이에요. 어울리는 스테이터스를 주·부로 고르면 +2/+1이 붙어요) 스테이터스는 전부 0에서 시작해요. ${STAT_POOL}포인트를 원하는 곳에 자유롭게 나눠 주세요. (한 곳에 몰아도 돼요) 모든 탐색자의 총합은 같아요.</p>` +
      `<div class="form-row"><label>이능력 이름 <em class="req">필수</em></label><input id="ctAbility" maxlength="20" placeholder="예: 그림자 이동" value="${esc(cf.ability)}"></div>` +
      `<div class="form-row"><label>이능력 설명 <em class="opt">선택</em></label><textarea id="ctAbilityDesc" maxlength="300" placeholder="어떤 능력인지 자유롭게 적어 주세요">${esc(cf.abilityDesc)}</textarea></div>` +
      `<div class="form-row"><label>주·부 스탯 <em class="opt">선택</em></label><span class="ab-sel"><select id="ctMain" aria-label="주 스탯">${statOpts(cf.mainStat, '')}</select><select id="ctSub" aria-label="부 스탯">${statOpts(cf.subStat, '')}</select></span><small class="tiny">주 스탯 +${MAIN_STAT_BONUS} · 부 스탯 +${SUB_STAT_BONUS} (나중에 프로필에서 바꿀 수 있어요)</small></div>` +
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
  const m = { ctName: 'name', ctAge: 'age', ctKeywords: 'keywords', ctAbility: 'ability', ctAbilityDesc: 'abilityDesc', ctMain: 'mainStat', ctSub: 'subStat' }[e.target.id];
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
  const st = TUTORIAL_STEPS[tut.step]; let el = $(st.sel);
  if (!el || !el.getClientRects().length) el = $('.top-actions'); // 좁은 화면 등에서 안 보이는 대상(퀵슬롯)은 설명만 보여 준다
  const panel = el.closest('.panel');
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
$('#tutCloudLoad').onclick = async () => {
  const b = $('#tutCloudLoad'); b.disabled = true;
  try {
    const sv = await Cloud.pull();
    if (sv && sv.data && sv.data.created) { toast('서버 진행을 불러옵니다.'); cloudApply(sv.data); return; }
    try { // 서버 저장 자체가 비어 있으면 가장 최근 백업을 찾아 본다
      const bl = await Cloud.listBackups(), nb = (bl || [])[0];
      if (nb) { const d = await Cloud.getBackup(+nb.id); if (d && d.created) { toast('서버 백업에서 진행을 불러옵니다.'); cloudApply(d); return; } }
    } catch (e) { /* 백업 기능이 없으면 무시 */ }
    toast('서버에 저장된 진행이 없어요.');
  } catch (e) { toast('서버에서 불러오지 못했어요.'); }
  b.disabled = false;
};
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
  showUpdateBar();
}
/* 새로고침하기 전까지 사라지지 않는 안내 막대 (채팅 알림은 다시 그려지면 지워질 수 있어서 따로 둔다) */
function showUpdateBar() {
  if (document.getElementById('updateBar')) return;
  const b = document.createElement('div'); b.id = 'updateBar'; b.setAttribute('role', 'alert');
  b.innerHTML = `<span>${icon('system_update_alt')} 게임이 업데이트되었어요. 새로고침하면 새 버전이 적용돼요.</span><button type="button" id="updateReload">새로고침</button>`;
  document.body.appendChild(b);
  document.getElementById('updateReload').onclick = () => { try { flushSave(); } catch (e) { /* 저장 실패해도 새로고침 */ } location.reload(); };
}
function init() {
  state.chats['알림'] = state.chats['알림'].filter(m => m[0] !== '업데이트'); // 지난 업데이트 공지는 새로고침하면 사라진다
  applyTheme(); applyLayout();
  finishIfDue(); pruneBuffs();
  renderProfile(); renderBars(); renderLeftTab(); renderBag(); renderBuffs(true);
  renderLogs(); renderChat();
  setLocation(state.location);
  if (!state.tutorialDone) { if (Cloud.enabled && Cloud.user() && !state.created) cloudRecover(); else startTutorial(); }
  const setTxt = (id, v) => { const e = $(id); if (e && e.textContent !== v) e.textContent = v; };
  const clock = () => {
    $('#clock').textContent = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    const w = todayWeather(), se = seasonOf(), al = altitude();
    setTxt('#hdWeather', w.name); setTxt('#hdWeatherIc', w.icon); setTxt('#hdSeason', `${se.name} · ${se.day}일차`); setTxt('#hdSeasonIc', se.icon);
    setTxt('#hdAlt', `${al.sky ? '상공' : '지상'} ${al.m.toLocaleString('ko-KR')}m`);
  };
  clock();
  setInterval(() => { tick(); clock(); }, 1000);
  checkUpdate(); setInterval(checkUpdate, 5 * 60 * 1000);
  syncNotices(); // 이후는 pollTick 이 (자리 비움·숨김이면 덜 자주) 부른다
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { checkUpdate(); cloudSync(); }
    else if (Cloud.enabled && Cloud.user() && !_cloudBlocked && (_saveQueued || _cloudTimer)) { if (_saveQueued) flushSave(); if (_cloudTimer) { clearTimeout(_cloudTimer); _cloudTimer = 0; } cloudAutoPush(); } // 폰은 백그라운드에서 타이머가 멈추므로 화면을 떠날 때 바로 저장
  });
  addEventListener('focus', () => cloudSync());
  if (state.created && !(Cloud.enabled && !Cloud.user())) setTimeout(() => cloudSync(true), 600);
}
if (!(Cloud.enabled && !Cloud.user())) init(); // 서버 연결 중 로그인 전이면 게임을 시작하지 않는다 (가입 페이지로 이동 중)

/* 길드 메시지 수신 화면 처리: 알림이 켜져 있으면 알림음과 토스트 */
function onGuildMessage(name, text) {
  const alert = receiveGuildMessage(name, text);
  renderChat();
  if (alert && state.chatTab !== '길드') { sfx('ok'); toast(`[길드] ${name}: ${text.slice(0, 40)}`); }
}

document.addEventListener('change', e => { if (e.target && e.target.id === 'customMin') { setCustomMin(e.target.value); renderAction(); const n = $('#customMin'); if (n) n.blur(); } });

/* 소모품 사용 창: 개수를 바꾸면 회복량 표시도 바뀐다 */
document.addEventListener('change', e => {
  const t = e.target;
  if (!t || t.id !== 'useQty') return;
  const name = t.dataset.item, g = $('#useGain'); if (!ITEMS[name] || !g) return;
  g.innerHTML = useGainHtml(name, +t.value);
});
