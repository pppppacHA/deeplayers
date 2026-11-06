/* 개발자 도구 — 서버의 관리자 계정으로 로그인했을 때만 불러온다 (ui.js loadDevScript). 미리보기 빌드에는 처음부터 들어 있다.
   ※ 브라우저에서 도는 코드라 누구나 파일을 열어 볼 수 있다. 일반 유저에게 숨기는 용도이며, 진짜 권한 검사는 서버가 해야 한다. (SECURITY.md) */
window.DEV = true;
/* 개발자 모드 켜기/끄기: 끄면 '즉시 완료' 같은 개발자 표시가 사라지고 알림 채널에 공지를 쓸 수도 없다 (설정은 이 브라우저에 기억) */
var _devMode = (() => { try { return localStorage.getItem('deeplayer-devmode') !== '0'; } catch (e) { return true; } })();
function devOn() { return !!window.DEV && _devMode !== false; }
devBtn = () => !devOn() ? '' : `<button class="dev-btn" data-act="dev-finish" title="개발자 전용: 시간 걸리는 행동을 바로 끝냅니다">${icon('bolt')} 즉시 완료 (DEV)</button>`;

const devRefresh = () => { renderProfile(); renderBars(); renderBuffs(true); renderBag(); renderMapHead(); renderMap(); renderAction(); renderSide(); save(); };
A['dev-finish'] = () => {
  const t = nowMs();
  if (state.active) state.active.endAt = Math.min(state.active.endAt, t);
  if (state.crafting && !state.crafting.ready) state.crafting.endAt = Math.min(state.crafting.endAt, t);
  tick();
};
function openDevPanel() {
  const items = Object.keys(ITEMS).map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  modal('개발자 도구', `<div class="row-gap"><span class="tiny">개발자 모드: <b>${devOn() ? '켜짐' : '꺼짐'}</b> — 끄면 즉시 완료 표시와 공지 쓰기가 숨겨져요.</span><button data-act="dev-mode">${devOn() ? '끄기' : '켜기'}</button></div><p class="tiny">디버깅용입니다. 눌러서 바로 적용돼요.</p>` +
    `<div class="setting-group"><h3>상태</h3><div class="row-gap"><button data-act="dev-finish">행동 즉시 완료</button><button data-act="dev-heal">HP·기력 가득</button><button data-act="dev-hp1">HP 1로</button><button data-act="dev-sp0">기력 0으로</button></div></div>` +
    `<div class="setting-group"><h3>성장</h3><div class="row-gap"><button data-act="dev-money">CR +1000</button><button data-act="dev-level">레벨 +1</button><button data-act="dev-rank">다음 등급으로 승급</button></div></div>` +
    `<div class="setting-group"><h3>아이템</h3><div class="row-gap"><select id="devItem">${items}</select><input id="devQty" type="number" min="1" max="99" value="5" style="width:64px"><button data-act="dev-give">지급</button></div></div>` +
    `<div class="setting-group"><h3>시간 · 이동</h3><div class="row-gap"><button data-act="dev-farm">농장 즉시 성장</button><button data-act="dev-board">임무 수주 초기화</button><button data-act="dev-home">본부로 이동</button></div></div>` +
    `<div class="setting-group"><h3>낚시대회 테스트</h3><p class="tiny">실제 대회와 따로 노는 테스트 대회(서버 id fetest, 관리자만)를 지금 엽니다. 보상·칭호는 지급하지 않고 결과만 알려 줘요. 새로고침하면 원래 대회로 돌아가요.</p><div class="row-gap"><button data-act="dev-ff-open">테스트 대회 열기 (1시간)</button><button data-act="dev-ff-spot">낚시터로 이동</button><button data-act="dev-ff-fish">물고기 받기</button><button data-act="dev-ff-end">테스트 대회 끝내기</button></div></div>` +
    `<div class="setting-group"><h3>저장</h3><div class="row-gap"><button data-act="dev-export">저장 데이터 복사</button></div></div>`, [btnClose], true);
}
Object.assign(A, {
  'dev-ff-open': () => {
    const f = fishFest(); if (f && f.joined && !FISH_FEST.test) { toast('이미 실제 대회에 참가 중이라 테스트를 열 수 없어요. (기록이 섞이지 않게)'); return; }
    if (!FISH_FEST.test) view._ffReal = { id: FISH_FEST.id, start: FISH_FEST.start, end: FISH_FEST.end };
    Object.assign(FISH_FEST, { id: 'fetest', test: true, start: nowMs() - 60000, end: nowMs() + 3600000 }); state.ffest = null; view.ffBoard = null; devRefresh(); toast('테스트 대회를 열었어요. 낚시터 칸에서 낚시대회를 눌러 보세요.');
  },
  'dev-ff-spot': () => {
    const z = DANGER_ZONES.find(x => FISH_SPOTS[x.id] && LOCATIONS[x.id]), sp = z && FISH_SPOTS[z.id]; if (!sp) return;
    if (state.active) { toast('진행 중인 행동을 먼저 끝내 주세요.'); return; }
    state.location = z.id; discover('zones', z.id); enterDungeon(z.id); state.dungeon.x = sp.x; state.dungeon.y = sp.y; revealAround(state.dungeon, true); closeModal(); devRefresh(); toast(`${z.id} ${sp.name}(으)로 왔어요.`);
  },
  'dev-ff-fish': () => { festFishes().slice(0, 4).forEach(n => addItem(n, 3)); devRefresh(); toast('물고기 4종을 3마리씩 넣었어요.'); },
  'dev-ff-end': () => { if (!FISH_FEST.test) { toast('테스트 대회가 열려 있지 않아요.'); return; } FISH_FEST.end = nowMs() - 6 * 60000; FISH_FEST.start = Math.min(FISH_FEST.start, FISH_FEST.end - 60000); view.ffBoard = null; ffSync(true).then(() => { devRefresh(); }); toast('테스트 대회를 끝냈어요. 결과를 확인하는 중…'); },
  'dev-mode': () => { _devMode = !_devMode; try { localStorage.setItem('deeplayer-devmode', _devMode ? '1' : '0'); } catch (e) { /* 저장 불가 */ } renderAction(); renderChat(); openDevPanel(); toast(_devMode ? '개발자 모드를 켰습니다.' : '개발자 모드를 껐습니다.'); },
  'dev-heal': () => { state.vitals.hp = state.vitals.hpMax; state.vitals.sp = state.vitals.spMax; devRefresh(); toast('HP·기력을 채웠습니다.'); },
  'dev-hp1': () => { state.vitals.hp = 1; devRefresh(); toast('HP를 1로 만들었습니다.'); },
  'dev-sp0': () => { state.vitals.sp = 0; devRefresh(); toast('기력을 0으로 만들었습니다.'); },
  'dev-money': () => { state.money += 1000; devRefresh(); toast('CR +1000'); },
  'dev-level': () => { const need = Math.max(1, expMax(state.character.level) - state.vitals.exp); gainExp(need); devRefresh(); toast(`Lv.${state.character.level}`); },
  'dev-rank': () => { const i = PROMO_ORDER.indexOf(state.character.rank); if (i < 0 || i >= PROMO_ORDER.length - 1) { toast('더 올릴 등급이 없습니다.'); return; } state.character.rank = PROMO_ORDER[i + 1]; devRefresh(); renderCraft(); toast(`등급 ${state.character.rank}`); },
  'dev-give': () => { const n = $('#devItem').value, q = Math.max(1, Math.min(99, Number($('#devQty').value) || 1)); const got = addItem(n, q); devRefresh(); toast(`${n} ×${got} 지급`); },
  'dev-farm': () => { (state.farm.plots || []).forEach(p => { if (p) p.at = 0; }); devRefresh(); toast('농장 작물이 모두 자랐습니다.'); },
  'dev-board': () => { state.questAt = {}; state.questTaken = Object.fromEntries(Object.entries(state.questTaken).filter(([id]) => { const q = QUESTS.find(x => x.id === id); return q && !q.board; })); devRefresh(); toast('수주한 임무를 초기화했습니다.'); },
  'dev-home': () => { state.dungeon = null; state.active = null; state.pending = null; state.location = '본부'; devRefresh(); toast('본부로 이동했습니다.'); },
  'dev-export': () => { try { navigator.clipboard.writeText(JSON.stringify(state)); toast('저장 데이터를 복사했습니다.'); } catch (e) { toast('복사할 수 없는 환경입니다.'); } }
});
