/* 개발자 도구 — 설정의 '개발자 코드'가 맞을 때만 불러온다 (ui.js devUnlock). 미리보기 빌드에는 처음부터 들어 있다.
   ※ 브라우저에서 도는 코드라 누구나 파일을 열어 볼 수 있다. 일반 유저에게 숨기는 용도이며, 진짜 권한 검사는 서버가 해야 한다. (SECURITY.md) */
window.DEV = true;
devBtn = () => `<button class="dev-btn" data-act="dev-finish" title="개발자 전용: 시간 걸리는 행동을 바로 끝냅니다">${icon('bolt')} 즉시 완료 (DEV)</button>`;

const devRefresh = () => { renderProfile(); renderBars(); renderBuffs(true); renderBag(); renderMapHead(); renderMap(); renderAction(); renderSide(); save(); };
A['dev-finish'] = () => {
  const t = nowMs();
  if (state.active) state.active.endAt = Math.min(state.active.endAt, t);
  if (state.crafting && !state.crafting.ready) state.crafting.endAt = Math.min(state.crafting.endAt, t);
  tick();
};
function openDevPanel() {
  const items = Object.keys(ITEMS).map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  modal('개발자 도구', `<p class="tiny">디버깅용입니다. 눌러서 바로 적용돼요.</p>` +
    `<div class="setting-group"><h3>상태</h3><div class="row-gap"><button data-act="dev-finish">행동 즉시 완료</button><button data-act="dev-heal">HP·기력 가득</button><button data-act="dev-hp1">HP 1로</button><button data-act="dev-sp0">기력 0으로</button></div></div>` +
    `<div class="setting-group"><h3>성장</h3><div class="row-gap"><button data-act="dev-money">CR +1000</button><button data-act="dev-level">레벨 +1</button><button data-act="dev-rank">다음 등급으로 승급</button></div></div>` +
    `<div class="setting-group"><h3>아이템</h3><div class="row-gap"><select id="devItem">${items}</select><input id="devQty" type="number" min="1" max="99" value="5" style="width:64px"><button data-act="dev-give">지급</button></div></div>` +
    `<div class="setting-group"><h3>시간 · 이동</h3><div class="row-gap"><button data-act="dev-farm">농장 즉시 성장</button><button data-act="dev-board">임무 수주 초기화</button><button data-act="dev-home">본부로 이동</button></div></div>` +
    `<div class="setting-group"><h3>저장</h3><div class="row-gap"><button data-act="dev-export">저장 데이터 복사</button></div></div>`, [btnClose], true);
}
Object.assign(A, {
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
