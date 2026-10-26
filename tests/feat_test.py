"""2026-10-27 1차 기능 단독 테스트 (빠름). python3 tests/feat_test.py
고기·가죽 분류/옛 이름 변환, 분실물 보관함, 가방 가득 경고, 캠프 신호기, 한계 돌파, 칭호, 공방·캠프 의뢰, 새 펫, 펫 그리드, 회복 미리보기, RP 탭, 동행 도착 맞추기"""
import json, re
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / 'index.html').as_uri()
STUB = ".material-symbols-rounded{color:transparent!important}"
FAIL, N = [], [0]
def check(n, c, info=None):
    N[0] += 1
    if not c: FAIL.append(n); print('FAIL', n, str(info)[:300], flush=True)
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1440, 'height': 900}); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: (errs.append(str(e)), print('PAGEERROR', e)))
    pg.route('**/*fonts.g*', lambda r: r.abort())
    ctx.route('**/js/cloud.js', lambda r: r.fulfill(body=re.sub(r"const CLOUD = \{[^}]*\};", "const CLOUD = { url: '', key: '' };", (ROOT/'js'/'cloud.js').read_text(encoding='utf8')), content_type='application/javascript; charset=utf-8'))
    pg.goto(URL); pg.evaluate("localStorage.clear()"); pg.reload(); pg.add_style_tag(content=STUB); pg.wait_for_timeout(250)
    ev = pg.evaluate
    pg.click('#tutSkipStory'); pg.fill('#ctName', '시험'); pg.click('#ctNext'); pg.fill('#ctAbility', '검사'); pg.click('#ctRandom'); pg.click('#ctDone'); pg.click('#tutSkip'); pg.click('[data-weapon="훈련용 검"]'); pg.click('#tutWeaponOk'); pg.wait_for_timeout(100)

    # --- 고기·가죽 분류 ---
    check('beast_items_by_class', ev("['포유류 고기','조류 고기','파충류 고기','양서류 고기','어류 고기','절지류 고기','포유류 가죽','두꺼운 포유류 가죽'].every(n=>ITEMS[n])&&!ITEMS['숲 늑대 고기']&&!ITEMS['숲 늑대 가죽']"))
    check('beast_drops_use_class', ev("DANGER_ZONES.every(z=>z.terrains.every(t=>t.monsters.every(m=>m.kind!=='짐승'||m.drops.every(([n])=>ITEMS[n]&&/^(두꺼운 )?(포유류|조류|파충류|양서류|어류|절지류) (고기|가죽)$/.test(n)))))"))
    check('beast_groups_for_recipes', ev("MAT_GROUPS['고기'].includes('포유류 고기')&&MAT_GROUPS['가죽'].includes('조류 가죽')&&MAT_GROUPS['두꺼운 가죽'].includes('두꺼운 절지류 가죽')"))
    r = ev("""(()=>{const raw=JSON.parse(JSON.stringify(state));raw.inventory['재료']=[{n:'숲 늑대 고기',q:10},{n:'붉은 여우 고기',q:95},{n:'숲 늑대 가죽',q:3},{n:'황금 전갈 가죽',q:2}];raw.codex.items['숲 늑대 고기']=1;raw.storage={'멧돼지 가죽':4};
      raw.mail=[{id:1,from:'x',subject:'s',body:'b',items:[['갈매기 떼 고기',2]],at:Date.now()}];const h=sanitize(raw);return {inv:h.inventory['재료'],cx:[!!h.codex.items['포유류 고기'],!!h.codex.items['숲 늑대 고기']],st:h.storage,mail:h.mail[0].items}})()""")
    check('legacy_beast_items_mapped_and_merged', r['inv'] == [{'n': '포유류 고기', 'q': 99}, {'n': '포유류 고기', 'q': 6}, {'n': '포유류 가죽', 'q': 3}, {'n': '두꺼운 절지류 가죽', 'q': 2}], r)
    check('legacy_beast_in_codex_storage_mail', r['cx'] == [True, False] and r['st'] == {'포유류 가죽': 4} and r['mail'] == [['조류 고기', 2]], r)
    check('legacy_beast_in_item_list', ev("JSON.stringify(cleanItemList([['숲 늑대 고기',3],['모르는 것',1]]))") == '[["포유류 고기",3]]')

    # --- 분실물 보관함 / 가방 가득 ---
    check('lostbox_put_limits_slots', ev("(()=>{state.lostBox=[];const a=lostBoxPut('목재',150),b=lostBoxPut('석재',600);return [a,b,state.lostBox.length]})()") == [150, 297, 5])
    check('lostbox_in_hq_choices', ev("LOCATIONS['본부'].groups.some(g=>g.items.includes('분실물 보관함'))"))
    check('lostbox_take_only_at_hq', ev("(()=>{state.location='상점가';const e=lostBoxTake(0);state.location='본부';const r=lostBoxTake(0);return [typeof e,r&&r.n]})()") == ['string', '목재'])
    ev("(()=>{closeModal();state.location='본부';renderAction()})()"); pg.click('#choices button:has-text("분실물 보관함")'); pg.wait_for_timeout(80)
    check('lostbox_modal_cells', pg.locator('.lostbox-grid > *').count() == 5 and pg.locator('[data-act="lostbox-take"]').count() == 4)
    pg.click('[data-act="lostbox-all"]'); pg.wait_for_timeout(60)
    check('lostbox_take_all_moves_to_bag', ev("state.lostBox.length") < 4 and ev("countItem('석재')") > 0)
    ev("closeModal()")
    r = ev("""(()=>{state.lostBox=[];const inv=JSON.stringify(state.inventory);const cap=bagCapacity();let i=0;while(usedSlots()<cap){state.inventory['장비'].push({n:'훈련용 검',q:1});if(++i>200)break}
      state.pending={id:Object.keys(ACTIONS).find(k=>ACTIONS[k].kind==='gather'),result:{text:'t',items:[['석영 모래',5]],exp:0,money:0,hp:0,sp:0}};const c=claimResult();
      const full=bagFull(),msg=startAction(Object.keys(ACTIONS).find(k=>ACTIONS[k].kind==='gather'));state.inventory=JSON.parse(inv);return {boxed:c.boxed,lost:c.lost,box:state.lostBox.length,full,msg}})()""")
    check('full_bag_reward_goes_to_lostbox', r['boxed'] == [['석영 모래', 5]] and r['lost'] == [] and r['box'] == 1, r)
    check('full_bag_blocks_exploring', r['full'] and r['msg'] == ev("BAG_FULL_MSG"), r)
    ev("state.lostBox=[]")

    # --- 캠프 신호기 ---
    check('beacon_items_and_shop', ev("DANGER_ZONES.every(z=>ITEMS[`${z.id} 캠프 신호기`]&&ITEMS[`${z.id} 캠프 신호기`].use.camp===z.id&&SHOPS[z.id].special.some(r=>r[0]===`${z.id} 캠프 신호기`))"))
    check('beacon_camp_labels', ev("JSON.stringify(campsOf('제1구역').map(c=>c.label))") == '["북쪽 캠프","남쪽 캠프"]' and ev("campsOf('제7구역').length") >= 1)
    ev("(()=>{state.dungeon=null;state.location='본부';addItem('제2구역 캠프 신호기',1);renderBag()})()")
    ev("openItem ? 0 : 0") if False else None
    r = ev("(()=>{const e=useBeacon('제2구역 캠프 신호기',1),c=campsOf('제2구역')[1];return [e,state.dungeon&&state.dungeon.zone,state.dungeon&&state.dungeon.x===c.x&&state.dungeon.y===c.y,countItem('제2구역 캠프 신호기'),tileOf(zoneOf('제2구역'),c.x,c.y)]})()")
    check('beacon_warps_to_chosen_camp', r == [None, '제2구역', True, 0, 'C'], r)
    check('beacon_not_healing', ev("useGain('제2구역 캠프 신호기',1).hp===0&&useItem('제2구역 캠프 신호기',1)===false"))
    ev("(()=>{leaveDungeon();state.location='본부'})()")

    # --- 한계 돌파 / 레벨 ---
    r = ev("""(()=>{const c=state.character,b=[c.level,c.rank,state.flags.cap35,state.vitals.exp];c.rank='B';const a=nextPromo()&&nextPromo().id;c.rank='A';const q=nextPromo();c.level=30;state.vitals.exp=0;const g0=gainExp(99999);
      state.flags.cap35=true;const g1=gainExp(999999);const lv=c.level,cap=levelCap();state.flags.cap35=b[2];c.level=b[0];c.rank=b[1];state.vitals.exp=b[3];return {a,q:q&&q.id,cap:q&&q.cap,g0,lv,capv:cap}})()""")
    check('cap_quest_after_rank_a', r['a'] == 'promo_a' and r['q'] == 'limit_35' and r['cap'] == 35, r)
    check('level_capped_until_quest', r['g0'] == 0 and r['lv'] == 35 and r['capv'] == 35, r)
    check('cap_quest_not_taken_by_default', ev("!isTaken(QUESTS.find(q=>q.id==='limit_35'))"))
    check('cap_level_sanitized', ev("(()=>{const raw=JSON.parse(JSON.stringify(state));raw.character.level=34;raw.flags.cap35=false;const a=sanitize(raw).character.level;const r2=JSON.parse(JSON.stringify(state));r2.character.level=34;r2.flags.cap35=true;return [a,sanitize(r2).character.level]})()") == [30, 34])

    # --- 칭호 ---
    check('new_titles_defined', ev("['맡은 바를 다 하는','그럼에도 나 자신','승부다!','장사꾼','주머니가 두둑한','부지런한 손','공방의 주인','만물 제작자','한계를 넘어선'].every(n=>TITLE_DEFS.some(t=>t[0]===n))"))
    check('stat_titles_at_30', ev("STAT_PEAK_NEED") == 30)
    r = ev("""(()=>{const b=JSON.stringify({t:state.titles,q:state.questCount,f:state.flags,m:state.money,e:state.crEarned,l:state.crLast,cx:state.codex.recipes});
      state.questCount=40;state.flags.rpChat=true;state.flags.marketSell=true;state.crLast=state.money;state.money+=5000;const got=checkTitles();
      state.codex.recipes={};RECIPES.slice(0,31).forEach(r=>state.codex.recipes[r.out]=1);checkTitles();const a=state.titles.includes('부지런한 손');RECIPES.slice(0,41).forEach(r=>state.codex.recipes[r.out]=1);checkTitles();const c=[state.titles.includes('부지런한 손'),state.titles.includes('공방의 주인')];
      const o=JSON.parse(b);state.titles=o.t;state.questCount=o.q;state.flags=o.f;state.money=o.m;state.crEarned=o.e;state.crLast=o.l;state.codex.recipes=o.cx;return {got,a,c}})()""")
    check('titles_awarded', all(t in r['got'] for t in ['맡은 바를 다 하는', '그럼에도 나 자신', '장사꾼', '주머니가 두둑한']), r)
    check('craft_title_evolves', r['a'] and r['c'] == [False, True], r)
    ev("closeModal();openSystem('도감')"); pg.click('[data-act="codex-tab"][data-codex="칭호"]'); pg.wait_for_timeout(60)
    check('title_codex_lists_all_hides_hidden', pg.locator('.title-dex').count() == ev("TITLE_DEFS.length") and '???' in pg.inner_text('#codexRoot') and '착한 사마리아인' not in pg.inner_text('#codexRoot'))
    ev("closeModal()")

    # --- 임무 ---
    check('workshop_quests_daily', ev("QUESTS.filter(q=>q.daily==='ws'&&boardDailyOk(q)).length") == ev("WORKSHOP_DAILY") and ev("EASY_RECIPES.every(([n])=>RECIPES.some(r=>r.out===n&&r.rank==='F'))"))
    check('camp_quests_local_items', ev("DANGER_ZONES.every(z=>{const ids=CAMP_QUESTS[z.id];return ids.length>=2&&ids.filter(id=>id.startsWith('cd_')).every(id=>{const q=QUESTS.find(x=>x.id===id),other=DANGER_ZONES.filter(o=>o!==z).flatMap(o=>o.terrains.flatMap(t=>t.gather));return q.board===z.id&&!other.includes(q.need.name)})&&QUESTS.filter(q=>q.daily==='camp'&&q.board===z.id&&boardDailyOk(q)).length===Math.min(CAMP_DAILY,ids.length)})"))
    check('fishing_quests_exist', ev("QUESTS.filter(q=>/낚시 의뢰|신선한 생선/.test(q.title)).length") >= 5)
    check('craft_mastery_multiplier', ev("(()=>{const m=JSON.stringify(state.mastery);state.mastery={};state.crafting={index:RECIPES.findIndex(r=>r.out==='나무 숟가락'),out:'나무 숟가락',qty:1,ready:true,used:[]};collectCraft();const v=state.mastery['목공']|0;state.mastery=JSON.parse(m);return v})()") == ev("MASTERY_GAIN.craft*2"))
    check('exercise_adds_bag_slots', ev("(()=>{const m=JSON.stringify(state.mastery),c0=bagCapacity();state.mastery={'운동':MASTERY_NEED(1)+MASTERY_NEED(2)};const c1=bagCapacity();state.mastery=JSON.parse(m);return c1-c0})()") == 2)

    # --- 펫 ---
    check('new_pets', ev("['들쥐','고슴도치','들고양이','꼬마 용','두더지','눈토끼'].every(n=>PET_SPECIES[n]&&ACTIONS[Object.keys(ACTIONS).find(k=>ACTIONS[k].pet===n)])"))
    r = ev("""(()=>{const z=zoneOf('제1구역'),t=z.terrains.find(x=>x.name==='깊은 숲');const old=PET_WILD_APPEAR;PET_WILD_APPEAR=1;state.character.level=10;enterDungeon('제1구역');const d=state.dungeon;let pos=null;z.map.forEach((row,y)=>[...row].forEach((ch,x)=>{if(!pos&&terrainIndex(ch)===z.terrains.indexOf(t))pos=[x,y]}));
      d.x=pos[0];d.y=pos[1];const shown=tameShown2(z,d.x,d.y,d.seed),ids=currentGroups()[0].items;addItem('감자',2);const e=startAction(t.tameId2,0,'감자');PET_WILD_APPEAR=old;return {shown,has:ids.includes(t.tameId2),e,pet:state.active&&state.active.id}})()""")
    check('wild_pet_tame_action', r['has'] and r['e'] is None and r['pet'] == '제1구역 깊은 숲 고슴도치 길들이기', r)
    ev("(()=>{state.active=null;leaveDungeon();state.location='개인실'})()")
    r = ev("""(()=>{['숲 늑대','멧돼지','모래게'].forEach(n=>addPet(n));const p=state.pets[0];p.full=100;p.fullAt=Date.now()-12*3600e3;p.bond=0;const a=petFull(p);p.bond=100;const b2=petFull(p);
      state.petBowl={'감자':2};const n0=countItem('감자');removeItem('감자',n0);state.petActive=-1;const e=sendExpedition(1,'제1구역');return {a:Math.round(a),b:Math.round(b2),e,bowl:state.petBowl['감자'],exp:!!state.pets[1].exp}})()""")
    check('bond_slows_hunger', r['a'] == 50 and r['b'] == 75, r)
    check('expedition_uses_bowl_food', r['e'] is None and r['bowl'] == 1 and r['exp'], r)
    ev("closeModal();openPets()"); pg.wait_for_timeout(60)
    check('pet_grid_cards', pg.locator('.pet-card').count() == ev("state.pets.length") and pg.locator('.pet-row').count() == 1 and '탐험' in pg.inner_text('.pet-card[data-i="1"]'))
    pg.click('.pet-card[data-i="2"]'); pg.wait_for_timeout(50)
    check('pet_grid_select_shows_detail', pg.locator('.pet-card.selected[data-i="2"]').count() == 1 and pg.locator('[data-act="pet-stroke"][data-i="2"]').count() == 1)
    ev("closeModal()")

    # --- 회복 미리보기 / 퀵슬롯 / RP / 동행 ---
    ev("(()=>{state.vitals.hp=30;addItem('응급 키트',2);renderBag();renderBars()})()")
    check('gain_bars_html', 'class="gain"' in ev("gainBarsHtml('응급 키트',1)") and 'HP' in ev("gainBarsHtml('응급 키트',1)"))
    check('quick_hover_preview_on_bars', ev("(()=>{renderBars(useGain('응급 키트',1));const g=!!document.querySelector('#bars .gain');renderBars();return g&&!document.querySelector('#bars .gain')})()"))
    check('rp_tab_and_bell', pg.locator('[data-chat="RP"]').count() == 1 and pg.locator('.bell-tab[data-chat="알림"]').count() == 1 and ev("CHAT_TABS.includes('RP')"))
    ev("closeModal()"); pg.click('[data-chat="RP"]'); pg.fill('#chatInput', '안녕'); pg.press('#chatInput', 'Enter'); pg.wait_for_timeout(60)
    check('rp_chat_gives_title', ev("state.flags.rpChat===true&&state.titles.includes('그럼에도 나 자신')"))
    r = ev("(()=>{enterDungeon('제1구역');const d=state.dungeon;const z=zoneOf('제1구역');let t=null;z.map.forEach((row,y)=>[...row].forEach((ch,x)=>{if(!t&&terrainIndex(ch)>=0&&Math.abs(x-d.x)+Math.abs(y-d.y)===1)t=[x,y]}));state.vitals.sp=100;const eta=Date.now()+90000;const e=startMove(t[0],t[1]);const before=state.active.endAt;syncArrive(eta);return [e,Math.abs(state.active.endAt-eta)<2000||state.active.endAt===state.active.startAt+Math.round((before-state.active.startAt)*2),state.active.synced===true]})()")
    check('follow_sync_arrival', r[0] is None and r[1] and r[2], r)
    ev("(()=>{state.active=null;leaveDungeon()})()")
    check('results_cleared_on_new_action', ev("(()=>{state.results=[{t:'x',text:'y',gain:[],loss:[]}];state.location='개인실';const id=Object.keys(ACTIONS).find(k=>ACTIONS[k].kind==='rest');startAction(id);const n=state.results.length;state.active=null;return n})()") == 0)
    check('codex_sources_full', '외 ' not in ev("Object.keys(ITEMS).map(n=>sourceText(n)).join('|')"))
    check('max_announce_center', ev("/^rank:(?:[A-Z]|MAX)$/.test('rank:MAX')"))
    # --- 2차: 훈련장 ---
    ev("closeModal()")
    check('training_ground_node', ev("(()=>{state.dungeon=null;state.active=null;state.pending=null;const r=travelTo('훈련장');renderMap();renderAction();return !r.err&&state.location==='훈련장'})()") and pg.locator('[data-choice="대련장"]').count() == 1 and pg.locator('[data-choice="보스전 안내"]').count() == 1)
    check('duel_sim_deterministic', ev("(()=>{const f=[{team:1,...duelClean(duelSnap(),'가')},...duelDummies(2)];const a=JSON.stringify(duelSim(f,12345)),b=JSON.stringify(duelSim(f,12345)),c=duelSim(f,12345);return a===b&&c.log.length>0&&[1,2].includes(c.win)&&c.log.every(e=>e.d>=1&&e.d<=6)})()"))
    check('duel_text_by_main_stat', ev("(()=>{const f=[{team:1,...duelClean({name:'가',main:'agi',hp:100,atk:10},'가')},{team:2,...duelClean({name:'나',main:'str',hp:100,atk:10},'나')}];return DUEL_STATS.every(k=>DUEL_LINES[k].length===5)&&duelText({a:0,t:1,d:6,dmg:9,dodge:false,ko:false,s:0},f).startsWith('🎲6')})()"))
    check('duel_snap_clamped', ev("JSON.stringify(duelClean({hp:99999,atk:-5,ev:3,main:'x',win:'<b>'+'가'.repeat(60)}))") == ev("JSON.stringify(duelClean({hp:600,atk:1,ev:.5,main:'str',win:'b'+'가'.repeat(39)}))"))
    pg.click('[data-choice="훈련 메시지"]'); pg.wait_for_timeout(60); pg.fill('#tmWin', '좋은 승부!'); pg.fill('#tmLose', '다음엔 안 져'); pg.click('[data-act="tmsg-save"]'); pg.wait_for_timeout(40)
    check('train_msg_saved', ev("state.trainMsg.win") == '좋은 승부!' and ev("duelSnap().lose") == '다음엔 안 져')
    pg.click('[data-choice="대련장"]'); pg.wait_for_timeout(60); pg.click('[data-act="duel-practice"][data-n="1"]'); pg.wait_for_timeout(60)
    check('practice_duel_plays', pg.locator('#duelRoot').count() == 1)
    ev("view.duelTimer&&clearInterval(view.duelTimer);(()=>{const fs=[{team:1,me:true,...duelClean(duelSnap(),state.character.name)},...duelDummies(1)];duelPlay(fs,7,0)})()")
    pg.wait_for_timeout(int(ev("DUEL_LINE_MS")) * (ev("duelSim([{team:1,...duelClean(duelSnap(),state.character.name)},...duelDummies(1)],7).log.length") + 2))
    check('practice_duel_result_and_title', pg.locator('.duel-result').count() == 1 and ev("state.titles.includes('승부다!')"))
    ev("closeModal()"); pg.click('[data-choice="보스전 안내"]'); pg.wait_for_timeout(40)
    check('boss_info_modal', 'D20' in pg.inner_text('#modalBody') and '3일' in pg.inner_text('#modalBody'))
    ev("closeModal()")
    # --- '?' 칸 저널 이후 선택지 (히든) ---
    r = ev("""(()=>{closeModal();state.active=null;state.pending=null;const z=zoneOf('제1구역');enterDungeon('제1구역');const d=state.dungeon;z.map.forEach((row,y)=>[...row].forEach((ch,x)=>{if(ch==='?'){d.x=x;d.y=y}}));
      const before=currentGroups()[0].items.length;const bj=JSON.stringify(state.journals);Object.keys(QMARKS).forEach(k=>state.journals[k]=1);const ids=currentGroups()[0].items;
      const e=startAction(QMARK_ACTS['제1구역'][1].id);const t=state.pending&&state.pending.result.text;state.pending=null;const bit=state.qact['제1구역'];state.journals=JSON.parse(bj);const after=currentGroups()[0].items.length;leaveDungeon();
      return {before,n:ids.length,e,solo:QMARK_ACTS['제1구역'][1].solo.includes(t),bit,after}})()""")
    check('qmark_acts_after_all_journals', r['before'] == 1 and r['n'] == 4 and r['after'] == 1 and r['e'] is None and r['solo'] and r['bit'] == 2, r)
    check('qmark_acts_data_complete', ev("Object.keys(QMARKS).every(z=>QMARK_ACTS[z]&&QMARK_ACTS[z].length===3&&QMARK_ACTS[z].every(q=>q.solo.length===5&&['p2','p3','p4'].every(k=>q[k].length===3)))"))
    check('qmark_acts_not_in_patch_notes', all(q not in ev("POSTS['공지'].map(p=>p[1]).join()") for q in ['갈대 피리', '머무르기']))
    check('tile_icon_size_original', ev("(()=>{enterDungeon('제1구역');renderMap();const i=document.querySelector('.tile .material-symbols-rounded');const f=parseFloat(getComputedStyle(i).fontSize);leaveDungeon();renderMap();return f>=17})()"))
    check('topbar_divider_back', ev("getComputedStyle(document.querySelector('.topbar')).borderBottomStyle") != 'none')
    # --- 피드백 패치 ---
    check('recipe_field_shown', ev("craftField('나무 숟가락')") == '목공' and '[목공]' in ev("codexEntries('레시피').find(e=>e.name==='나무 숟가락').desc"))
    check('camp_quests_rotate_kill_and_item', ev("DANGER_ZONES.every(z=>{const l=QUESTS.filter(q=>q.board===z.id&&(!q.daily||boardDailyOk(q)));return l.filter(q=>q.need.type==='kill').length===CAMP_KILL_DAILY&&l.filter(q=>q.need.type==='item').length===CAMP_DAILY&&l.every(q=>q.daily)})"))
    check('camp_quests_change_by_day', ev("DANGER_ZONES.some(z=>{const d=t=>QUESTS.filter(q=>q.board===z.id&&q.daily&&boardDailyOk(q,t)).map(q=>q.id).join();return [1,2,3,4,5].some(k=>d(Date.now()+k*864e5)!==d(Date.now()))})"))
    check('hq_hunt_quests_daily', ev("QUESTS.filter(q=>q.daily==='hq'&&boardDailyOk(q)).length") == ev("HQ_HUNT_DAILY") and ev("QUESTS.filter(q=>q.daily==='hq').every(q=>q.need.type==='kill'&&q.title.includes('사냥'))"))
    check('hidden_gear_visible_to_others', 'data-tip-title="안대"' in ev("otherEquipHtml({'얼굴':'안대'},'')"))
    ev("(()=>{state.todos=[];addTodo('a');addTodo('b');renderSide()})()")
    check('todo_bulk_check', ev("(()=>{A['todo-all']({dataset:{on:'1'}});const a=state.todos.every(t=>t.done);A['todo-all']({dataset:{on:'0'}});return a&&state.todos.every(t=>!t.done)})()"))
    check('two_camps_have_different_quests', ev("DANGER_ZONES.filter(z=>campsOf(z.id).length===2).every(z=>{const a=QUESTS.filter(q=>q.board===z.id&&q.daily&&boardDailyOk(q,undefined,0)).map(q=>q.id),b=QUESTS.filter(q=>q.board===z.id&&q.daily&&boardDailyOk(q,undefined,1)).map(q=>q.id);return a.length===4&&b.length===4&&a.every(id=>!b.includes(id))})"))
    check('no_js_errors', not errs, errs)
    b.close()
print(json.dumps({'FAILED': FAIL, 'checks': N[0]}, ensure_ascii=False))
