/* ---------- ROOM (개인실 'ROOM' · 프로필의 '구경') ----------
   방 데이터는 state.room (data.js 의 ROOM_상수·FURN, core.js 의 cleanRoom 이 검증). 이 파일은 화면과 조작만 맡는다.
   · 방 창은 ROOM_W×ROOM_H(600) 고정 좌표. 화면에서는 창 너비에 맞춰 줄이고(roomFit), +/− 와 끌기로 확대·이동한다.
   · 격자·겹침 금지 없음. 마지막으로 놓거나 누른 가구가 같은 층의 맨 위(z). 벽 소품은 항상 바닥 가구 뒤.
   · 내 배경 이미지는 600×600 JPEG(글자 100000자 이하)로 줄여 이 기기에 두고, 서버에는 세이브가 아니라 별도 표(room_bgs)에 올린다. */
const ROOMBG_KEY = 'deeplayer-roombg';
const roomBgLocal = () => { try { const v = localStorage.getItem(ROOMBG_KEY); return v && v.length <= ROOM_BG_MAX && ROOM_BG_RE.test(v) ? v : ''; } catch (e) { return ''; } };
const roomBgStore = v => { try { if (v) localStorage.setItem(ROOMBG_KEY, v); else localStorage.removeItem(ROOMBG_KEY); } catch (e) { /* 저장 공간 없음 */ } };
const roomBgOk = v => typeof v === 'string' && v.length <= ROOM_BG_MAX && ROOM_BG_RE.test(v);

/* ----- 가구 그림 (문자 도트 → 캔버스, 색 바꿀 부분은 밝기만 가진 회색에 고른 색을 곱한다) ----- */
const _furnCv = {}, _srcImg = {};
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
let _loadT = 0;
function roomFurnLoaded(id) { Object.keys(_furnCv).forEach(k => { if (k.startsWith(id + '|')) delete _furnCv[k]; }); clearTimeout(_loadT); _loadT = setTimeout(() => { if (!isRoomOpen()) return; const room = roomData(); $$('#roomItems .rm-item').forEach(el => { const it = room.items.find(x => x.u === +el.dataset.u), d = it && furnDef(it.f); if (!d) return; const sz = furnSize(d); el.style.width = sz.w + 'px'; el.style.height = sz.h + 'px'; el.src = furnUrl(d, it.c); }); }, 60); } // 그림이 다 불러와지면 화면을 통째로 다시 그리지 않고 크기만 고친다 (끌고 있는 중에도 안전)
function srcInfo(def) { // PNG 그림 불러오기 (한 번만). 다 불러오면 화면을 다시 그린다
  let im = _srcImg[def.id];
  if (!im) {
    im = _srcImg[def.id] = { base: new Image(), mask: null };
    im.base.onload = () => roomFurnLoaded(def.id); im.base.onerror = () => { im.failed = true; roomFurnLoaded(def.id); }; im.base.src = def.src;
    if (def.maskSrc) { im.mask = new Image(); im.mask.onload = () => roomFurnLoaded(def.id); im.mask.onerror = () => { im.maskFailed = true; roomFurnLoaded(def.id); }; im.mask.src = def.maskSrc; }
  }
  return im;
}
const srcReady = (def, needMask) => { const im = srcInfo(def); return im.base.complete && im.base.naturalWidth > 0 && (!needMask || im.maskFailed || (im.mask && im.mask.complete && im.mask.naturalWidth > 0)); };
const srcFailed = def => !!def.src && !def.map && !!srcInfo(def).failed;
function tempCanvas(def) { // 그림 파일이 아직 없을 때 대신 보이는 임시 표시 (회색 점선 상자 + 이름)
  const cv = document.createElement('canvas'), w = def.w || 64, h = def.h || 64; cv.width = w; cv.height = h; const c = cv.getContext('2d');
  c.fillStyle = 'rgba(200,200,205,.75)'; c.fillRect(0, 0, w, h); c.strokeStyle = '#6b6b75'; c.lineWidth = 2; c.setLineDash([5, 4]); c.strokeRect(1, 1, w - 2, h - 2);
  c.setLineDash([]); c.lineWidth = 1; c.beginPath(); c.moveTo(2, 2); c.lineTo(w - 2, h - 2); c.moveTo(w - 2, 2); c.lineTo(2, h - 2); c.strokeStyle = 'rgba(107,107,117,.45)'; c.stroke();
  c.fillStyle = '#2b2b33'; c.font = '10px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; const t = String(def.name || def.id).slice(0, Math.max(2, Math.floor(w / 7)));
  c.fillStyle = 'rgba(255,255,255,.8)'; c.fillRect(2, h / 2 - 7, w - 4, 14); c.fillStyle = '#2b2b33'; c.fillText(t, w / 2, h / 2 + 1);
  return cv;
}
function furnCanvas(def, color) { // 문자 도트(map)나 PNG(src) 를 캔버스로. 색상 변경은 mask 부분에만 곱한다
  const key = def.id + '|' + (color || ''); if (_furnCv[key]) return _furnCv[key];
  const cv = document.createElement('canvas'), tint = color && /^#[0-9a-fA-F]{6}$/.test(color) ? hexRgb(color) : null;
  if (def.map) {
    const w = def.map[0].length, h = def.map.length; cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ch = def.map[y][x], p = FURN_PALETTE[ch]; if (!p) continue;
      const i = (y * w + x) * 4, t = tint && FURN_MASK.includes(ch);
      img.data[i] = t ? Math.round(p[0] * tint[0] / 255) : p[0]; img.data[i + 1] = t ? Math.round(p[1] * tint[1] / 255) : p[1]; img.data[i + 2] = t ? Math.round(p[2] * tint[2] / 255) : p[2]; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  } else if (def.src) {
    const im = srcInfo(def);
    if (im.failed) { const t = tempCanvas(def); _furnCv[key] = t; return t; }
    if (!srcReady(def, !!def.maskSrc)) { cv.width = def.w || 64; cv.height = def.h || 64; return cv; } // 아직 불러오는 중 (캐시하지 않는다)
    const w = im.base.naturalWidth, h = im.base.naturalHeight; cv.width = w; cv.height = h; const ctx = cv.getContext('2d'); ctx.drawImage(im.base, 0, 0);
    if (tint && im.mask) {
      try {
        const m = document.createElement('canvas'); m.width = w; m.height = h; const mc = m.getContext('2d'); mc.drawImage(im.mask, 0, 0, w, h);
        const bd = ctx.getImageData(0, 0, w, h), md = mc.getImageData(0, 0, w, h);
        for (let i = 0; i < bd.data.length; i += 4) { const a = md.data[i + 3] / 255 * (md.data[i] / 255); if (a > 0) for (let k = 0; k < 3; k++) bd.data[i + k] = Math.round(bd.data[i + k] * (1 - a) + bd.data[i + k] * tint[k] / 255 * a); }
        ctx.putImageData(bd, 0, 0);
      } catch (e) { /* 파일로 직접 열면(file://) 브라우저가 픽셀 읽기를 막는다 — 색 없이 원본을 보여 준다 */ }
    }
  } else { cv.width = cv.height = 1; }
  _furnCv[key] = cv; return cv;
}
const furnUrl = (def, color) => { // 색을 바꾸지 않은 PNG 는 파일 그대로 쓴다 (캔버스를 거치지 않아 어디서든 보인다)
  if (def.src && !def.map && !color && !srcFailed(def)) return def.src;
  try { return furnCanvas(def, color).toDataURL(); } catch (e) { return def.src || ''; }
};
const furnScale = def => (def.map ? ROOM_SCALE : (def.scale || 1));
function furnSize(def) { const cv = furnCanvas(def, ''), k = furnScale(def); return { w: Math.round(cv.width * k), h: Math.round(cv.height * k) }; }
const furnMaskable = def => !!((def.maskSrc && !srcInfo(def).failed && !srcInfo(def).maskFailed) || (def.map && def.map.some(r => [...r].some(c => FURN_MASK.includes(c)))));

/* ----- 방 그림 (배경·벽·바닥) ----- */
const _skinImg = {};
let _skinT = 0;
function skinOk(def) { // 직접 그린 PNG 틀은 파일이 실제로 불러와졌을 때만 쓴다 (없으면 색으로 보여 주다가, 불러와지면 바꾼다)
  if (!def.src) return false;
  let im = _skinImg[def.src];
  if (!im) { im = _skinImg[def.src] = new Image(); im.onload = () => { clearTimeout(_skinT); _skinT = setTimeout(() => { if (isRoomOpen() && !view.room.dragging) roomRender(); }, 60); }; im.src = def.src; }
  return im.complete && im.naturalWidth > 0;
}
function roomSkins(room) {
  const w = furnDef(room.wall) || furnDef(ROOM_DEFAULT_SKIN.wall), f = furnDef(room.floor) || furnDef(ROOM_DEFAULT_SKIN.floor), b = furnDef(room.bg) || furnDef(ROOM_DEFAULT_SKIN.bg);
  return { w: w.skin, f: f.skin, b: b.skin, wd: w, fd: f, bd: b, wp: skinOk(w) ? w.src : '', fp: skinOk(f) ? f.src : '', bp: skinOk(b) ? b.src : '', custom: b.id === 'b_custom' };
}
const polyStr = pts => pts.map(p => p.join(',')).join(' ');
function roomBgHtml(room, bg) { // 배경: 방을 움직이거나 확대해도 그대로 있는 층
  const s = roomSkins(room);
  if (s.bp && !s.custom) return `<img class="room-bg" src="${esc(s.bp)}" alt="" draggable="false">`;
  return s.custom && roomBgOk(bg) ? `<img class="room-bg" src="${bg}" alt="" draggable="false">` : `<div class="room-bg" style="background:linear-gradient(${s.b.a},${s.b.b})"></div>`;
}
function roomSvg(room) { // 방(벽·바닥)만 — 움직이고 확대된다
  const s = roomSkins(room), G = ROOM_GEO;
  const lines = []; for (let i = 1; i < 6; i++) { const t = i / 6, a = [G.floor[0][0] + (G.floor[3][0] - G.floor[0][0]) * t, G.floor[0][1] + (G.floor[3][1] - G.floor[0][1]) * t], b = [G.floor[1][0] + (G.floor[2][0] - G.floor[1][0]) * t, G.floor[1][1] + (G.floor[2][1] - G.floor[1][1]) * t]; lines.push(`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/>`); }
  const wall = s.wp ? `<image href="${esc(s.wp)}" x="0" y="0" width="${ROOM_W}" height="${ROOM_H}"/>` : `<polygon points="${polyStr(G.wall)}" fill="${s.w.l}" stroke="#0003" stroke-width="2"/>`;
  const floor = s.fp ? `<image href="${esc(s.fp)}" x="0" y="0" width="${ROOM_W}" height="${ROOM_H}"/>` : `<polygon points="${polyStr(G.floor)}" fill="${s.f.a}" stroke="#0003" stroke-width="2"/><g stroke="${s.f.b}" stroke-width="3" opacity=".7">${lines.join('')}</g>`;
  return `<svg class="room-svg" viewBox="0 0 ${ROOM_W} ${ROOM_H}" width="${ROOM_W}" height="${ROOM_H}" aria-hidden="true">${wall}${floor}</svg>`;
}
const roomItemZ = (it, def) => (def.layer === 'wall' ? 10 : 5000) + it.z; // 벽 소품은 항상 바닥 가구 뒤
function roomItemsHtml(room, edit, sel) {
  return room.items.map(it => { const d = furnDef(it.f); if (!d) return ''; const sz = furnSize(d);
    return `<img class="rm-item ${edit ? 'edit' : ''} ${sel === it.u ? 'sel' : ''}" data-u="${it.u}" alt="${esc(d.name)}" draggable="false" src="${furnUrl(d, it.c)}" style="left:${it.x}px;top:${it.y}px;width:${sz.w}px;height:${sz.h}px;z-index:${roomItemZ(it, d)};image-rendering:${furnScale(d) > 1 ? 'pixelated' : 'auto'};${it.flip ? 'transform:scaleX(-1);' : ''}">`; }).join('');
}

/* ----- 화면 ----- */
const isRoomOpen = () => !!view.room && $('#overlay').classList.contains('open') && !!$('#roomRoot');
const roomData = () => (view.room && view.room.edit ? view.room.draft : view.room && view.room.data);
function roomTileHtml(d, room) { // 소지품 칸(.slot)과 같은 모양
  const on = d.skin ? room[ROOM_SKIN_KEY[d.cat]] === d.id : false;
  const pos = d.cat === '벽지' ? '50% 38%' : d.cat === '바닥' ? '50% 62%' : '50% 50%';
  const face = d.skin && d.src && skinOk(d) ? `<span class="rm-sw" style="background:${d.cat === '배경' ? `url('${esc(d.src)}') center/cover` : `url('${esc(d.src)}') ${pos}/300% auto no-repeat`}"></span>` : d.skin ? `<span class="rm-sw" style="background:${d.skin.l ? `${d.skin.l}` : `linear-gradient(${d.skin.a},${d.skin.b})`}"></span>` : `<img src="${furnUrl(d, '')}" alt="" draggable="false">`;
  return `<button class="slot clickable filled rm-slot ${on ? 'selected' : ''}" data-act="room-pick" data-id="${esc(d.id)}" data-tip-title="${esc(d.name)}" data-tip-desc="${esc(d.desc || '')}" aria-label="${esc(d.name)}">${face}</button>`;
}
function roomSideHtml() {
  const R = view.room, room = roomData();
  if (!R.edit) return '';
  const tab = ROOM_TABS.includes(R.tab) ? R.tab : '침대', list = FURN.filter(f => f.cat === tab), pages = Math.max(1, Math.ceil(list.length / 25)), page = Math.min(R.page || 0, pages - 1);
  const tiles = list.slice(page * 25, page * 25 + 25).map(d => roomTileHtml(d, room));
  while (tiles.length < 25) tiles.push('<div class="slot" aria-label="빈 슬롯"></div>');
  const bgBtns = tab === '배경' ? `<div class="rm-bgbtns"><button data-act="room-bg-pick">내 이미지 올리기</button><button data-act="room-bg-clear" ${roomBgLocal() ? '' : 'disabled'}>이미지 삭제</button><input type="file" id="rmBgFile" accept="image/*" hidden><small class="tiny">${ROOM_BG_PX}×${ROOM_BG_PX}로 맞추고 압축해 저장해요. '내 배경 이미지' 칸을 눌러 적용하세요.</small></div>` : '';
  const TV = 5, off = Math.max(0, Math.min(R.tabOff || 0, ROOM_TABS.length - TV));
  return `<div class="rm-tabrow"><button class="rm-arrow" data-act="room-tabs" data-d="-1" ${off <= 0 ? 'disabled' : ''} title="이전 분류">${icon('chevron_left')}</button><div class="subtabs rm-tabs">${ROOM_TABS.slice(off, off + TV).map(t => `<button class="${t === tab ? 'active' : ''}" data-act="room-tab" data-tab="${t}">${t}</button>`).join('')}</div><button class="rm-arrow" data-act="room-tabs" data-d="1" ${off >= ROOM_TABS.length - TV ? 'disabled' : ''} title="다음 분류">${icon('chevron_right')}</button></div>` +
    `<div class="inv-grid rm-grid">${tiles.join('')}</div>${bgBtns}` +
    `<div class="inv-footer"><div class="rm-foot-btns"><button class="primary" data-act="room-save">룸 저장</button><button data-act="room-cancel">편집 취소</button></div>` +
    `<div class="pages"><button data-act="room-page" data-d="-1" ${page <= 0 ? 'disabled' : ''} title="이전 페이지">${icon('chevron_left')}</button><span>${page + 1} / ${pages}</span><button data-act="room-page" data-d="1" ${page >= pages - 1 ? 'disabled' : ''} title="다음 페이지">${icon('chevron_right')}</button></div></div>` +
    `<small class="tiny rm-count">가구 ${room.items.length} / ${ROOM_MAX}</small>`;
}
function roomEditorHtml() { // 화면 어디로든 옮길 수 있는 떠 있는 창 (가구를 지워도 계속 보인다)
  const R = view.room; if (!R.edit) return '';
  const it = R.draft.items.find(x => x.u === R.sel), d = it && furnDef(it.f), ed = R.ed || { x: 20, y: 80 };
  const can = d && furnMaskable(d);
  return `<div class="rm-ed" id="rmEd" style="left:${ed.x}px;top:${ed.y}px"><div class="rm-ed-bar" id="rmEdBar">가구 편집기${d ? ` · ${esc(d.name)}` : ''}</div><div class="rm-ed-body">` +
    `<button data-act="room-flip" ${it ? '' : 'disabled'}>좌우반전</button>` +
    `<button class="rm-colorbtn ${R.pick && can ? 'on' : ''}" data-act="room-color" ${can ? '' : 'disabled'} title="${d && !can ? '이 가구는 색을 바꿀 수 있는 부분이 없어요' : ''}">색상변경</button>` +
    `<span class="rm-swatch" style="background:${it && it.c ? it.c : 'transparent'}"></span><button data-act="room-del" ${it ? '' : 'disabled'}>삭제</button></div></div>`;
}
function roomBarHtml() { // 오버레이 안이 아니라 바깥(흐린 부분) 오른쪽 위에 작게 뜬다
  const R = view.room;
  return `<div class="room-bar"><button data-act="room-export">이미지 출력</button>${R.viewOnly || R.edit ? '' : '<button class="primary" data-act="room-edit">룸 편집</button>'}</div>`;
}
function roomHtml() {
  const R = view.room, room = roomData(), bg = R.viewOnly ? R.bg : roomBgLocal();
  return `<div class="room-layout" id="roomLayout"><div class="room-main"><div class="room-vp" id="roomVp">${roomBgHtml(room, bg)}<div class="room-stage" id="roomStage">${roomSvg(room)}<div class="room-items" id="roomItems">${roomItemsHtml(room, R.edit, R.sel)}</div></div>` +
    `<div class="map-tools"><button class="icon" data-act="room-zoom" data-d="1" title="확대">${icon('add')}</button><button class="icon" data-act="room-zoom" data-d="-1" title="축소">${icon('remove')}</button><button class="icon" data-act="room-zoom" data-d="0" title="중앙 정렬">${icon('center_focus_strong')}</button></div></div></div>` +
    (R.edit ? `<div class="room-side" id="roomSide">${roomSideHtml()}</div>` : '') + `</div>`;
}
function roomFloatRender() {
  const R = view.room, ov = $('#overlay'); if (!R || !ov) return;
  let f = $('#roomFloat'); if (!f) { f = document.createElement('div'); f.id = 'roomFloat'; ov.appendChild(f); }
  if (R.edit && !R.ed) { const v = $('#roomVp'); if (v) { const r = v.getBoundingClientRect(); R.ed = { x: Math.round(r.left + 8), y: Math.round(r.bottom - 72) }; } }
  f.innerHTML = roomBarHtml() + roomEditorHtml(); roomBarPlace(); roomPickRender();
}
function roomBarPlace() { // 룸 편집/이미지 출력: ROOM 창 오른쪽 위 바깥에 살짝 띄워 붙인다
  const bar = $('#roomFloat .room-bar'), m = $('#modal'); if (!bar || !m) return;
  const r = m.getBoundingClientRect(), h = bar.offsetHeight || 26;
  bar.style.left = 'auto'; bar.style.right = Math.max(4, Math.round(window.innerWidth - r.right)) + 'px'; bar.style.top = Math.max(4, Math.round(r.top - h - 6)) + 'px';
}
function roomFit() { // 창 너비에 맞춰 방을 줄이고, 확대·이동을 반영한다
  const vp = $('#roomVp'), st = $('#roomStage'); if (!vp || !st || !view.room) return;
  const R = view.room, base = vp.clientWidth / ROOM_W, s = base * (R.zoom || 1);
  R.scale = s; st.style.transform = `translate(${R.px || 0}px, ${R.py || 0}px) scale(${s})`;
}
function roomRender() { // 방 전체를 다시 그린다 (끄는 중에는 부르지 않는다)
  const root = $('#roomRoot'); if (!root || !view.room) return;
  root.innerHTML = roomHtml(); $('#modal').classList.toggle('solo', !view.room.edit); roomFloatRender(); roomFit();
}
function roomOpenWindow(title) {
  modal(title, '<div id="roomRoot"></div>', [], false); $('#modal').classList.add('room');
  roomRender();
}
function openRoom() { // 내 방
  view.room = { viewOnly: false, edit: false, data: cleanRoom(state.room), zoom: 1, px: 0, py: 0, tab: '침대', page: 0, sel: 0 };
  roomOpenWindow('ROOM');
  if (!roomBgLocal() && Cloud.enabled && Cloud.user()) Cloud.myRoomBg().then(v => { if (roomBgOk(v)) { roomBgStore(v); if (isRoomOpen()) roomRender(); } }).catch(() => {});
}
async function peekRoom(name) { // 다른 대원의 방 구경
  if (!(Cloud.enabled && Cloud.user())) { toast('서버에 로그인해야 구경할 수 있어요.'); return; }
  let r; try { r = await Cloud.getRoom(name); } catch (e) { toast('방 정보를 불러오지 못했어요. (서버 SQL 갱신이 필요할 수 있어요)'); return; }
  if (!r || typeof r !== 'object') { toast('방 정보를 찾지 못했어요.'); return; }
  view.room = { viewOnly: true, name: cleanText(r.name || name, 12), edit: false, data: cleanRoom(r.room), bg: roomBgOk(r.bg) ? r.bg : '', zoom: 1, px: 0, py: 0 };
  roomOpenWindow(`${view.room.name}의 ROOM`);
}
const roomPeekBtn = name => (Cloud.enabled && Cloud.user() ? `<button class="rm-peek" data-act="room-peek" data-name="${esc(name)}">구경</button>` : '');

/* ----- 편집 동작 ----- */
function roomBring(it) { const R = view.room; R.draft.zc = (R.draft.zc || 0) + 1; it.z = R.draft.zc; if (R.draft.zc > 100000) { R.draft.items.sort((a, b) => a.z - b.z).forEach((x, i) => { x.z = i + 1; }); R.draft.zc = R.draft.items.length; } }
function roomSelect(u, refresh = true) {
  const R = view.room; R.sel = u; const it = R.draft.items.find(x => x.u === u);
  if (it) { roomBring(it); const el = $(`#roomItems .rm-item[data-u="${u}"]`); if (el) el.style.zIndex = roomItemZ(it, furnDef(it.f)); }
  $$('#roomItems .rm-item').forEach(e => e.classList.toggle('sel', +e.dataset.u === u));
  if (refresh) roomEdRefresh();
}
function roomEdRefresh() { const w = $('#rmEd'), wrap = document.createElement('div'); wrap.innerHTML = roomEditorHtml(); if (w && wrap.firstChild) w.replaceWith(wrap.firstChild); roomPickRender(); }
/* ----- 색상 고르개: 편집기 바로 아래(자리가 없으면 위)에 떠서 방이 가려지지 않는다 ----- */
const ROOM_SWATCHES = ['#ffffff', '#d9d9d9', '#8c8c8c', '#333333', '#e57373', '#f2a65a', '#f2d96b', '#9ccc65', '#4db6ac', '#64b5f6', '#9575cd', '#f48fb1', '#a1887f', '#ffccbc', '#c5e1a5', '#b3e5fc'];
const hex2hsl = h => { const m = /^#([0-9a-f]{6})$/i.exec(h || ''); if (!m) return [0, 0, 100]; const n = parseInt(m[1], 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let hh = 0, ss = 0; if (mx !== mn) { const d = mx - mn; ss = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hh *= 60; } return [Math.round(hh), Math.round(ss * 100), Math.round(l * 100)]; };
const hsl2hex = (h, s, l) => { s /= 100; l /= 100; const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join(''); };
function roomPickHtml(c) {
  const [h, s, l] = hex2hsl(c || '#ffffff');
  return `<div class="rm-pick-sw">${ROOM_SWATCHES.map(x => `<button data-act="room-color-set" data-c="${x}" style="background:${x}" title="${x}"></button>`).join('')}</div>` +
    `<label>색조<input type="range" id="rmH" min="0" max="360" value="${h}" style="background:linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)"></label>` +
    `<label>채도<input type="range" id="rmS" min="0" max="100" value="${s}" style="background:linear-gradient(90deg,#888,${hsl2hex(h, 100, 50)})"></label>` +
    `<label>밝기<input type="range" id="rmL" min="0" max="100" value="${l}" style="background:linear-gradient(90deg,#000,${hsl2hex(h, s, 50)},#fff)"></label>`;
}
function roomPickRender() {
  const R = view.room, f = $('#roomFloat'); let w = $('#rmPick'); const it = R && R.edit && R.draft.items.find(x => x.u === R.sel), d = it && furnDef(it.f);
  if (!R || !f || !R.pick || !d || !furnMaskable(d)) { if (R) R.pick = false; if (w) w.remove(); return; }
  if (!w) { w = document.createElement('div'); w.id = 'rmPick'; w.className = 'rm-pick'; f.appendChild(w); }
  if (!w.dataset.u || +w.dataset.u !== it.u) { w.dataset.u = it.u; w.innerHTML = roomPickHtml(it.c); }
  roomPickPlace();
}
function roomPickPlace() {
  const w = $('#rmPick'), e = $('#rmEd'); if (!w || !e) return; const r = e.getBoundingClientRect(), h = w.offsetHeight || 150;
  w.style.width = r.width + 'px'; w.style.left = Math.max(0, Math.min(window.innerWidth - r.width, r.left)) + 'px';
  w.style.top = (r.bottom + 4 + h <= window.innerHeight ? r.bottom + 4 : Math.max(0, r.top - 4 - h)) + 'px';
}
function roomPickApply(c) { // 고르는 동안 바로 보인다
  const R = view.room, it = R.draft.items.find(x => x.u === R.sel), d = it && furnDef(it.f); if (!it || !d) return;
  it.c = c.toLowerCase(); const el = $(`#roomItems .rm-item[data-u="${it.u}"]`); if (el) el.src = furnUrl(d, it.c); const sw = $('#rmEd .rm-swatch'); if (sw) sw.style.background = it.c;
}
function roomAdd(d) {
  const R = view.room, room = R.draft;
  if (d.skin) { room[ROOM_SKIN_KEY[d.cat]] = d.id; roomRender(); return; }
  if (room.items.length >= ROOM_MAX) { toast(`가구는 ${ROOM_MAX}개까지 놓을 수 있어요.`); sfx('error'); return; }
  const sz = furnSize(d), n = room.items.length, u = (room.items.reduce((a, x) => Math.max(a, x.u), 0)) + 1;
  const it = { u, f: d.id, x: Math.round(ROOM_W / 2 - sz.w / 2 + (n % 5) * 14), y: Math.round(d.layer === 'wall' ? 190 + (n % 4) * 10 : 330 + (n % 5) * 10), flip: 0, c: '', z: 0 };
  roomBring(it); room.items.push(it); R.sel = u; roomRender(); sfx('click');
}
function roomPointer() { // 끌어서 이동 (가구) / 끌어서 이동 (빈 곳 = 방 화면) / 편집기 창 옮기기
  let drag = null;
  document.addEventListener('pointerdown', e => {
    if (!isRoomOpen() || e.button > 1) return;
    const R = view.room;
    const bar = e.target.closest('#rmEdBar');
    if (bar) { const w = $('#rmEd'); drag = { kind: 'ed', sx: e.clientX, sy: e.clientY, ox: w.offsetLeft, oy: w.offsetTop, w }; bar.setPointerCapture(e.pointerId); e.preventDefault(); return; }
    const vp = e.target.closest('#roomVp'); if (!vp || e.target.closest('.map-tools')) return;
    const itEl = e.target.closest('.rm-item');
    if (itEl && R.edit) {
      const u = +itEl.dataset.u, it = R.draft.items.find(x => x.u === u); if (!it) return;
      roomSelect(u); drag = { kind: 'item', it, el: itEl, sx: e.clientX, sy: e.clientY, ox: it.x, oy: it.y, moved: false };
    } else { if (R.edit && R.sel) { R.sel = 0; $$('#roomItems .rm-item').forEach(x => x.classList.remove('sel')); roomSelect(0); } drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: R.px || 0, oy: R.py || 0 }; }
    R.dragging = true; vp.setPointerCapture(e.pointerId); e.preventDefault();
  });
  document.addEventListener('pointermove', e => {
    if (!drag || !isRoomOpen()) return; const R = view.room, dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (drag.kind === 'item') {
      const s = R.scale || 1; drag.moved = drag.moved || Math.abs(dx) + Math.abs(dy) > 3;
      const d = furnDef(drag.it.f), sz = furnSize(d);
      drag.it.x = Math.round(Math.max(-sz.w / 2, Math.min(ROOM_W - sz.w / 2, drag.ox + dx / s))); drag.it.y = Math.round(Math.max(-sz.h / 2, Math.min(ROOM_H - sz.h / 2, drag.oy + dy / s)));
      drag.el.style.left = drag.it.x + 'px'; drag.el.style.top = drag.it.y + 'px';
    } else if (drag.kind === 'pan') { R.px = drag.ox + dx; R.py = drag.oy + dy; roomFit(); }
    else if (drag.kind === 'ed') { const w = drag.w; R.ed = { x: Math.max(0, Math.min(window.innerWidth - w.offsetWidth, drag.ox + dx)), y: Math.max(0, Math.min(window.innerHeight - w.offsetHeight, drag.oy + dy)) }; w.style.left = R.ed.x + 'px'; w.style.top = R.ed.y + 'px'; roomPickPlace(); }
  });
  const end = () => { drag = null; if (view.room) view.room.dragging = false; };
  document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end);
  document.addEventListener('wheel', e => { if (isRoomOpen() && e.target.closest('#roomVp')) { e.preventDefault(); roomZoom(e.deltaY < 0 ? 1 : -1); } }, { passive: false });
  window.addEventListener('resize', () => { if (isRoomOpen()) { roomFit(); roomBarPlace(); } });
  document.addEventListener('input', e => { // 색상 슬라이더
    if (!isRoomOpen() || !/^rm[HSL]$/.test(e.target.id || '')) return; const g = id => +$('#' + id).value, h = g('rmH'), sa = g('rmS'), l = g('rmL');
    roomPickApply(hsl2hex(h, sa, l)); $('#rmS').style.background = `linear-gradient(90deg,#888,${hsl2hex(h, 100, 50)})`; $('#rmL').style.background = `linear-gradient(90deg,#000,${hsl2hex(h, sa, 50)},#fff)`;
  });
  document.addEventListener('change', e => { if (e.target.id === 'rmBgFile' && isRoomOpen() && e.target.files && e.target.files[0]) roomBgFromFile(e.target.files[0]); });
}
function roomZoom(d) { const R = view.room; if (!R) return; if (!d) { R.zoom = 1; R.px = 0; R.py = 0; } else R.zoom = Math.max(.6, Math.min(3, +(((R.zoom || 1) + d * .2)).toFixed(2))); roomFit(); }

/* ----- 내 배경 이미지: 150×150 으로 줄여 JPEG 으로 (작은 용량) ----- */
function roomBgFromFile(file) {
  if (!/^image\//.test(file.type) || file.size > 8e6) { toast('이미지 파일(8MB 이하)만 쓸 수 있어요.'); return; }
  const fr = new FileReader(); // 보안 정책상 blob: 주소는 못 쓰므로 data: 로 읽는다
  fr.onerror = () => toast('이미지를 읽지 못했어요.');
  fr.onload = () => {
    const im = new Image();
    im.onload = () => {
      const s0 = Math.min(im.naturalWidth, im.naturalHeight); if (!s0) { toast('이미지를 읽지 못했어요.'); return; }
      let out = ''; // 600×600 으로 맞추고, 용량이 넘으면 화질을 낮추다가 그래도 크면 크기를 줄인다
      for (const px of [ROOM_BG_PX, 500, 420, 340]) {
        const cv = document.createElement('canvas'); cv.width = cv.height = px; const ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, px, px); ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(im, (im.naturalWidth - s0) / 2, (im.naturalHeight - s0) / 2, s0, s0, 0, 0, px, px);
        for (const q of [.82, .7, .58, .46, .36]) { const v = cv.toDataURL('image/jpeg', q); if (roomBgOk(v)) { out = v; break; } }
        if (out) break;
      }
      if (!out) { toast('이미지가 너무 복잡해서 줄이지 못했어요. 다른 이미지를 써 주세요.'); return; }
      roomBgStore(out); if (view.room && view.room.edit) view.room.draft.bg = 'b_custom';
      if (Cloud.enabled && Cloud.user()) Cloud.setRoomBg(out).catch(() => toast('서버에는 올리지 못했어요. 이 기기에서만 보여요.'));
      toast('배경 이미지를 바꿨어요.'); if (isRoomOpen()) roomRender();
    };
    im.onerror = () => toast('이미지를 읽지 못했어요.');
    im.src = String(fr.result);
  };
  fr.readAsDataURL(file);
}

/* ----- 이미지 출력 ----- */
function roomExport() {
  const room = cleanRoom(roomData()), bg = view.room.viewOnly ? view.room.bg : roomBgLocal(), s = roomSkins(room), G = ROOM_GEO;
  const cv = document.createElement('canvas'); cv.width = ROOM_W; cv.height = ROOM_H; const ctx = cv.getContext('2d');
  const load = src => new Promise(r => { if (!src) { r(null); return; } const im = new Image(); im.onload = () => r(im); im.onerror = () => r(null); im.src = src; });
  Promise.all([load(!s.custom && s.bp), load(s.custom && roomBgOk(bg) && bg), load(s.wp), load(s.fp)]).then(([bgPng, bgUser, wallPng, floorPng]) => {
    const poly = (pts, fill) => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = 2; ctx.stroke(); };
    const g = ctx.createLinearGradient(0, 0, 0, ROOM_H); g.addColorStop(0, s.b.a); g.addColorStop(1, s.b.b); ctx.fillStyle = g; ctx.fillRect(0, 0, ROOM_W, ROOM_H);
    ctx.imageSmoothingEnabled = true;
    if (bgPng || bgUser) ctx.drawImage(bgPng || bgUser, 0, 0, ROOM_W, ROOM_H);
    if (wallPng) ctx.drawImage(wallPng, 0, 0, ROOM_W, ROOM_H); else poly(G.wall, s.w.l);
    if (floorPng) ctx.drawImage(floorPng, 0, 0, ROOM_W, ROOM_H); else poly(G.floor, s.f.a);
    room.items.map(it => ({ it, d: furnDef(it.f) })).filter(x => x.d).sort((a, b) => roomItemZ(a.it, a.d) - roomItemZ(b.it, b.d)).forEach(({ it, d }) => {
      const sp = furnCanvas(d, it.c), sz = furnSize(d); ctx.imageSmoothingEnabled = furnScale(d) <= 1; ctx.save(); ctx.translate(it.x + (it.flip ? sz.w : 0), it.y); if (it.flip) ctx.scale(-1, 1); ctx.drawImage(sp, 0, 0, sz.w, sz.h); ctx.restore();
    });
    try { cv.toBlob(b => { if (!b) { toast('이미지를 만들지 못했어요.'); return; } const u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = 'myroom.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); toast('방 이미지를 저장했어요.'); }, 'image/png'); } catch (e) { toast('이미지를 만들지 못했어요. (파일로 직접 연 화면에서는 브라우저가 막을 수 있어요)'); }
  });
}

/* ----- 버튼 ----- */
Object.assign(A, {
  'room-edit': () => { const R = view.room; if (!R || R.viewOnly) return; R.edit = true; R.draft = cleanRoom(R.data); R.sel = 0; R.tab = R.tab || '침대'; R.page = 0; R.ed = null; roomRender(); },
  'room-cancel': () => { const R = view.room; if (!R) return; R.edit = false; R.sel = 0; roomRender(); toast('편집을 취소했어요.'); },
  'room-save': () => { const R = view.room; if (!R || !R.edit) return; state.room = cleanRoom(R.draft); save(); R.data = cleanRoom(state.room); R.edit = false; R.sel = 0; roomRender(); sfx('ok'); toast('룸을 저장했어요.'); },
  'room-tabs': el => { const R = view.room; R.tabOff = Math.max(0, Math.min(ROOM_TABS.length - 5, (R.tabOff || 0) + intIn(el.dataset.d, -1, 1, 0))); $('#roomSide').innerHTML = roomSideHtml(); },
  'room-tab': el => { const R = view.room; R.tab = el.dataset.tab; R.page = 0; $('#roomSide').innerHTML = roomSideHtml(); },
  'room-page': el => { const R = view.room; R.page = Math.max(0, (R.page || 0) + intIn(el.dataset.d, -1, 1, 0)); $('#roomSide').innerHTML = roomSideHtml(); },
  'room-pick': el => { const R = view.room, d = furnDef(el.dataset.id); if (!R || !R.edit || !d) return; if (d.id === 'b_custom' && !roomBgLocal()) { toast('먼저 「내 이미지 올리기」로 이미지를 올려 주세요.'); return; } roomAdd(d); },
  'room-color': () => { const R = view.room; if (!R || !R.edit) return; R.pick = !R.pick; const w = $('#rmPick'); if (w) w.remove(); roomEdRefresh(); sfx('click'); },
  'room-color-set': el => { const c = el.dataset.c; if (!/^#[0-9a-f]{6}$/i.test(c || '')) return; roomPickApply(c); const w = $('#rmPick'); if (w) { w.innerHTML = roomPickHtml(c); } },
  'room-flip': () => { const R = view.room, it = R && R.draft.items.find(x => x.u === R.sel); if (!it) return; it.flip = it.flip ? 0 : 1; const el = $(`#roomItems .rm-item[data-u="${it.u}"]`); if (el) el.style.transform = it.flip ? 'scaleX(-1)' : ''; sfx('click'); },
  'room-del': () => { const R = view.room, i = R && R.draft.items.findIndex(x => x.u === R.sel); if (i == null || i < 0) return; R.draft.items.splice(i, 1); R.sel = 0; roomRender(); sfx('click'); },
  'room-zoom': el => roomZoom(intIn(el.dataset.d, -1, 1, 0)),
  'room-export': () => roomExport(),
  'room-bg-pick': () => { const f = $('#rmBgFile'); if (f) { f.value = ''; f.click(); } },
  'room-bg-clear': () => { roomBgStore(''); if (view.room && view.room.draft && view.room.draft.bg === 'b_custom') view.room.draft.bg = ROOM_DEFAULT_SKIN.bg; if (Cloud.enabled && Cloud.user()) Cloud.setRoomBg('').catch(() => {}); toast('배경 이미지를 지웠어요.'); roomRender(); },
  'room-peek': el => peekRoom(cleanText(el.dataset.name, 12))
});
roomPointer();
