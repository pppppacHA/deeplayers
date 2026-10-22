"""
무작위 대량 시뮬레이션(퍼즈) 테스트. 실행: python3 tests/fuzz.py [시드수=4] [시드당 횟수=1500]
- 서버 없이(cloud.js 비움) 캐릭터를 만들고, 게임 코드의 함수들을 무작위로 호출한다.
- 매 단계 뒤에 불변 조건을 검사한다: 예외 없음 / 숫자 NaN·Infinity 없음 / 가방 칸 수·수량 범위 /
  HP·기력 범위 / sanitize 가 멱등이고 아이템·돈·레벨을 조용히 잃지 않는다.
- 실패하면 시드와 마지막 동작 목록을 출력한다. 종료 코드 1.
"""
import json, os, re, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / 'index.html').as_uri()
SEEDS = int(sys.argv[1]) if len(sys.argv) > 1 else 4
STEPS = int(sys.argv[2]) if len(sys.argv) > 2 else 1500

FUZZ_JS = r"""
({seed, steps}) => {
  let a = seed >>> 0;
  const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const ri = n => Math.floor(rnd() * n), pk = l => l[ri(l.length)];
  const log = [], fails = [], stats = {};
  const bump = k => { stats[k] = (stats[k] || 0) + 1; };
  const walk = (o, path, out) => { // NaN / Infinity 찾기
    if (typeof o === 'number') { if (!Number.isFinite(o)) out.push(path); return; }
    if (o && typeof o === 'object') for (const k in o) walk(o[k], path + '.' + k, out);
  };
  const totalItems = s => ['장비', '소모품', '재료'].reduce((n, t) => n + s.inventory[t].reduce((x, y) => x + y.q, 0), 0);
  const clone = o => JSON.parse(JSON.stringify(o));
  const check = (where) => {
    const bad = []; walk(state, 'state', bad);
    if (bad.length) fails.push(`${where}: 숫자 이상 ${bad.slice(0, 3).join(',')}`);
    const cap = bagCapacity(), used = usedSlots();
    ['장비', '소모품', '재료'].forEach(t => state.inventory[t].forEach(s => {
      if (!ITEMS[s.n] || ITEMS[s.n].tab !== t) fails.push(`${where}: 잘못된 칸 ${t}/${s.n}`);
      else if (!Number.isInteger(s.q) || s.q < 1 || s.q > (t === '장비' ? 1 : STACK_MAX)) fails.push(`${where}: 수량 이상 ${s.n} ${s.q}`);
    }));
    if (used > cap) fails.push(`${where}: 가방 초과 ${used}/${cap}`);
    const v = state.vitals;
    if (!(v.hp >= 1 && v.hp <= v.hpMax) || !(v.sp >= 0 && v.sp <= v.spMax)) fails.push(`${where}: 체력/기력 범위 hp=${v.hp}/${v.hpMax} sp=${v.sp}/${v.spMax}`);
    if (!Number.isInteger(state.money) || state.money < 0) fails.push(`${where}: 돈 이상 ${state.money}`);
    if (!Number.isInteger(state.tickets) || state.tickets < 0) fails.push(`${where}: 뽑기권 이상 ${state.tickets}`);
    // sanitize 는 멱등이어야 하고 아이템·돈·레벨을 잃으면 안 된다
    const c1 = sanitize(clone(state)), c2 = sanitize(clone(c1));
    if (JSON.stringify(c1) !== JSON.stringify(c2)) {
      const k = Object.keys(c1).find(k => JSON.stringify(c1[k]) !== JSON.stringify(c2[k]));
      fails.push(`${where}: sanitize 멱등 아님 (${k})`);
    }
    if (totalItems(c1) !== totalItems(state)) fails.push(`${where}: sanitize 가 아이템을 잃음 ${totalItems(state)}→${totalItems(c1)}`);
    if (c1.money !== state.money || c1.character.level !== state.character.level) fails.push(`${where}: sanitize 가 돈/레벨을 바꿈`);
    if (state.dungeon && state.location !== state.dungeon.zone) fails.push(`${where}: 위치-미궁 불일치 ${state.location}/${state.dungeon.zone}`);
    if (state.active && state.pending) fails.push(`${where}: active 와 pending 동시`);
  };
  const finish = () => { // 진행 중인 행동을 즉시 끝내고 결과를 받는다
    if (state.active) { state.active.endAt = nowMs() - 1; const r = finishIfDue(); if (r === true && state.pending) { bump('claim:' + ACTIONS[state.pending.id].kind); const c = claimResult(); if (c && c.died) bump('died'); } }
    else if (state.pending) claimResult();
  };
  const heal = () => { state.vitals.hp = state.vitals.hpMax; state.vitals.sp = state.vitals.spMax; if (state.money < 3000) state.money += 5000; };
  const walkable = z => { const l = []; z.map.forEach((row, y) => [...row].forEach((c, x) => { if (c !== '#' && c !== '.') l.push([x, y]); })); return l; };
  const allItems = Object.keys(ITEMS);
  const ops = {
    giveItems() { for (let i = 0; i < 1 + ri(4); i++) addItem(pk(allItems), 1 + ri(8)); },
    trip() {
      if (state.dungeon || state.created !== true) return;
      finish(); state.location = '이동장치'; const z = pk(DANGER_ZONES); heal();
      const e = startTrip(z.id); if (!e) { bump('trip'); finish(); }
    },
    teleport() {
      if (!state.dungeon) return; const z = zoneOf(state.dungeon.zone), t = pk(walkable(z));
      state.dungeon.x = t[0]; state.dungeon.y = t[1]; revealAround(state.dungeon);
    },
    tileAction() {
      if (!state.dungeon) return; finish(); heal();
      const items = currentGroups().flatMap(g => g.items); if (!items.length) return;
      const id = pk(items), a = ACTIONS[id];
      if (a.kind === 'lostfound') { if (typeof turnInLost() === 'object') bump('lostTurnIn'); return; }
      if (['board', 'shop', 'gacha', 'enhance', 'promo', 'farm', 'pet', 'subjob', 'travel', 'enter', 'leave', 'step', 'todo'].includes(a.kind)) return;
      const bait = a.kind === 'tame' ? (baitItems()[0] || null) : null;
      if (a.kind === 'tame' && !bait) addItem('감자', 2);
      const e = startAction(id, ri(3), a.kind === 'tame' ? (baitItems()[0] || null) : null);
      if (!e) { bump('act:' + a.kind); finish(); } else bump('rej');
    },
    gearUp() { // 무기 강화·세공·이름
      heal(); state.money += 20000;
      const names = enchantables(); if (!names.length) return; const n = pk(names);
      if (ITEMS[n].slot === '무기' && rnd() < .5) { for (let i = 0; i < 12; i++) reinforceItem(n, () => 0); if (canNick(n)) setNick(n, pk(['검', '가나다라마바사아자차카타파하하', '', '<b>x</b>', '달콤이'])); }
      else enchantItem(n);
    },
    equip() {
      const l = state.inventory['장비']; if (!l.length) return; const s = pk(l);
      changeEquipment(ITEMS[s.n].slot, s.n);
    },
    unequip() { const slot = pk(EQUIP_SLOTS); if (state.equipment[slot]) changeEquipment(slot, null); },
    craftOne() {
      finish(); if (state.crafting) { if (state.crafting.ready) collectCraft(); else if (rnd() < .5) cancelCraft(); else { state.crafting.endAt = nowMs() - 1; craftTick(); collectCraft(); } return; }
      const i = ri(RECIPES.length), rc = RECIPES[i];
      if (!state.learned.includes(rc.out) && !STARTER_RECIPES.includes(rc.out)) state.learned.push(rc.out);
      Object.entries(rc.mats).forEach(([n, q]) => addItem(MAT_GROUPS[n] ? pk(MAT_GROUPS[n]) : n, q * 3));
      if (craft(i, 1 + ri(3), null) === 'ok') bump('craft');
    },
    shop() {
      finish(); const places = Object.keys(SHOPS); const p = pk(places);
      const rows = shopRows(p); if (!rows.length) return; const r = pk(rows);
      state.money += 3000;
      // 위치 조건을 맞춰 준다
      const at = shopAt(p);
      if (SHOPS[p].base) { if (!state.dungeon || state.dungeon.zone !== p) return; }
      else { state.dungeon = null; state.location = at; }
      if (buyItem(p, r[0], 1 + ri(3)) === null) bump('buy');
      const held = Object.values(state.inventory).flat(); if (held.length) { const h = pk(held); sellItem(p, h.n, 1 + ri(h.q)); }
    },
    useConsumable() {
      const l = state.inventory['소모품']; if (!l.length) return; const s = pk(l);
      if (ITEMS[s.n].use && !ITEMS[s.n].use.warp) useItem(s.n, 1 + ri(3));
    },
    quest() {
      finish(); const place = state.dungeon ? placeKey() : state.location;
      const q = QUESTS.filter(x => x.board === (place || '')); if (!q.length) { if (state.dungeon) return; }
      state.location = state.dungeon ? state.location : '본부'; state.dungeon = state.dungeon;
      const cand = QUESTS.filter(x => x.board); const x = pk(cand);
      takeQuest(x.id);
      needParts(x).forEach((n, i) => { if (n.type === 'item') addItem(n.name, n.qty); if (n.type === 'kill') state.qprog[progKey(x, i)] = n.qty; });
      completeQuest(x.id);
    },
    rest() { finish(); state.vitals.hp = Math.max(1, state.vitals.hp - ri(40)); state.vitals.sp = ri(state.vitals.spMax); },
    petFeed() {
      if (!state.pets.length) { addPet(pk(Object.keys(PET_SPECIES))); return; }
      state.location = state.dungeon ? state.location : '개인실';
      if (state.location !== '개인실') return;
      const feedables = allItems.filter(n => ITEMS[n].feed); const n = pk(feedables); addItem(n, 1); feedPet(ri(state.pets.length), n);
    },
    lost() { addItem(pk(Object.values(LOST_ITEMS)), 1 + ri(3)); },
    leave() { if (state.dungeon && !state.active) leaveDungeon(); },
    rebirth() { if (rnd() < .1) { state.vitals.hp = 1; dieAndRebirth(); } },
    reload() { // 저장→불러오기를 거쳐도 같은 상태인지
      flushSave(); const before = JSON.stringify(sanitize(clone(state)));
      const raw = localStorage.getItem(SAVE_KEY); if (!raw) return;
      const re = JSON.stringify(sanitize(merge(createDefaultState(), JSON.parse(raw))));
      if (before !== re) { const A = JSON.parse(before), B = JSON.parse(re); const k = Object.keys(A).find(k => JSON.stringify(A[k]) !== JSON.stringify(B[k])); fails.push(`reload: 저장/불러오기 후 달라짐 (${k})`); }
    },
    renderAll() { renderProfile(); renderInventory(); renderEquip(); renderAction(); renderStatus(); renderBuffs(true); if (typeof renderLeftTab === 'function') renderLeftTab(); },
  };
  const names = Object.keys(ops);
  heal(); state.money = 20000;
  for (let i = 0; i < steps && fails.length < 5; i++) {
    const name = rnd() < .45 ? pk(['tileAction', 'teleport', 'trip']) : pk(names);
    log.push(name); if (log.length > 12) log.shift();
    try { ops[name](); check(`step ${i} ${name}`); } catch (e) { fails.push(`step ${i} ${name}: 예외 ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`); }
  }
  return { fails, log, stats };
}
"""

with sync_playwright() as p:
    b = p.chromium.launch()
    bad = 0
    for seed in range(1, SEEDS + 1):
        ctx = b.new_context(viewport={'width': 1440, 'height': 900})
        pg = ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.route('**/*fonts.g*', lambda r: r.abort())
        ctx.route('**/js/cloud.js', lambda r: r.fulfill(body=re.sub(r"const CLOUD = \{[^}]*\};", "const CLOUD = { url: '', key: '' };", (ROOT / 'js' / 'cloud.js').read_text(encoding='utf8')), content_type='application/javascript; charset=utf-8'))
        pg.goto(URL); pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_timeout(250)
        pg.click('#tutSkipStory'); pg.wait_for_timeout(60)
        pg.fill('#ctName', '퍼즈'); pg.click('#ctNext'); pg.fill('#ctAbility', '그림자 이동')
        for k, n in [('str', 3), ('agi', 3), ('int', 2), ('wil', 2), ('sen', 1), ('luk', 1)]:
            for _ in range(n): pg.click(f'[data-ct="{k}"][data-d="1"]')
        pg.click('#ctDone'); pg.wait_for_timeout(150)
        pg.click('#tutSkip'); pg.wait_for_timeout(60)
        pg.click('[data-weapon="훈련용 검"]'); pg.click('#tutWeaponOk'); pg.wait_for_timeout(100)
        res = pg.evaluate(FUZZ_JS, {'seed': seed * 7919, 'steps': STEPS})
        ok = not res['fails'] and not errs
        print(f"seed {seed}: {'OK' if ok else 'FAIL'} (steps {STEPS}) {json.dumps(res['stats'], ensure_ascii=False)}", flush=True)
        if not ok:
            bad += 1
            for f in res['fails'][:5]: print('   ', f[:400])
            for e in errs[:3]: print('    PAGEERROR', e[:300])
            print('    last ops:', ' > '.join(res['log']))
        ctx.close()
    b.close()
sys.exit(1 if bad else 0)
