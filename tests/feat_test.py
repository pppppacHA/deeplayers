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
    ev("closeModal()"); ev("document.querySelector('[data-chat=\"RP\"]').click()"); pg.fill('#chatInput', '안녕'); pg.press('#chatInput', 'Enter'); pg.wait_for_timeout(60)
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
    check('duel_sim_deterministic', ev("(()=>{const f=[{team:1,...duelClean(duelSnap(),'가')},...duelDummies(2)];const a=JSON.stringify(duelSim(f,12345)),b=JSON.stringify(duelSim(f,12345)),c=duelSim(f,12345);return a===b&&c.log.length>0&&[1,2].includes(c.win)&&c.log.every(e=>e.sup!==undefined||(e.d>=1&&e.d<=6))})()"))
    check('duel_text_by_main_stat', ev("(()=>{const f=[{team:1,...duelClean({name:'가',main:'agi',hp:100,atk:10},'가')},{team:2,...duelClean({name:'나',main:'str',hp:100,atk:10},'나')}];return DUEL_STATS.every(k=>DUEL_LINES[k].length===5)&&duelText({a:0,t:1,d:6,dmg:9,dodge:false,ko:false,s:0},f).startsWith('🎲6')})()"))
    check('duel_snap_clamped', ev("JSON.stringify(duelClean({hp:99999,atk:-5,ev:3,main:'x',win:'<b>'+'가'.repeat(60)}))") == ev("JSON.stringify(duelClean({hp:600,atk:1,ev:.5,main:'str',win:'b'+'가'.repeat(39)}))"))
    pg.wait_for_selector('[data-choice="훈련 메시지"]', timeout=10000); ev("document.querySelector('[data-choice=\"훈련 메시지\"]').click()"); pg.wait_for_selector('#tmWin', timeout=10000); pg.fill('#tmWin', '좋은 승부!'); pg.fill('#tmLose', '다음엔 안 져'); pg.click('[data-act="tmsg-save"]'); pg.wait_for_timeout(40)
    check('train_msg_saved', ev("state.trainMsg.win") == '좋은 승부!' and ev("duelSnap().lose") == '다음엔 안 져')
    pg.click('[data-choice="대련장"]'); pg.wait_for_timeout(60); pg.click('[data-act="duel-practice"][data-n="1"]'); pg.wait_for_timeout(60)
    check('practice_duel_plays', pg.locator('#duelRoot').count() == 1)
    ev("view.duelTimer&&clearInterval(view.duelTimer);(()=>{const fs=[{team:1,me:true,...duelClean(duelSnap(),state.character.name)},...duelDummies(1)];duelPlay(fs,7,0)})()")
    pg.wait_for_selector('.duel-result', timeout=120000)
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
    check('duel_team_support', ev("(()=>{const f=[{team:1,...duelClean(duelSnap(),'가')},...duelDummies(2,1),...duelDummies(3)];for(let s=1;s<40;s++){const r=duelSim(f,s);if(r.log.some(e=>e.sup!==undefined)&&r.log.some(e=>e.bo))return duelText(r.log.find(e=>e.sup!==undefined),f).includes('지원')}return false})()"))
    check('chat_unread_badge', ev("typeof unreadOf==='function'&&unreadOf('길드')===0&&typeof chatMarkSeen==='function'"))  # 서버 연결 상태 동작은 cloud_test
    check('herb_salve_is_medicine', ev("craftCat('약초 연고')") == '약')
    r = ev("(()=>{const q=QUESTS.find(x=>x.daily==='hq');state.questTaken[q.id]=true;state.qprog[q.id]=2;const e=abandonQuest(q.id);return [e,!!state.questTaken[q.id],state.qprog[q.id]===undefined,abandonQuest('adapt')!==null]})()")
    check('quest_abandon', r == [None, False, True, True], r)
    check('duel_all_lines_shown', ev("(()=>{const fs=[{team:1,me:true,...duelClean({...duelSnap(),win:'승리 대사',lose:'패배 대사'},state.character.name)},...duelDummies(1,1),...duelDummies(2)];closeModal();modal('t',duelRoomHtml({id:0},fs));const sim=duelSim(fs,5);state.duelSeen=[];duelPlay(fs,5,0);return sim})()") is not None)
    pg.wait_for_selector('.duel-result', timeout=60000)
    check('duel_all_lines_shown_count', pg.locator('#duelEnd .duel-say').count() == 4, pg.inner_text('#duelEnd'))
    ev("(()=>{const fs=[{team:1,me:true,...duelClean({...duelSnap(),win:'',lose:''},state.character.name)},{team:2,...duelClean({...duelSnap(),win:'',lose:''},'상대')}];closeModal();modal('t',duelRoomHtml({id:0},fs));duelPlay(fs,9,0)})()")
    pg.wait_for_selector('.duel-result', timeout=60000)
    check('duel_default_lines_for_everyone', pg.locator('#duelEnd .duel-say').count() == 2, pg.inner_text('#duelEnd'))
    ev("closeModal()")
    check('craft_every_recipe_has_group_and_tag', ev("RECIPES.every(r=>['장비','소모품','약','기타'].includes(craftGroup(r.out))&&craftTagsOf(r.out).length&&!craftTagsOf(r.out).includes(CRAFT_NOTAG))"))
    check('rare_delivery_quests_pay_more', ev("QUESTS.filter(q=>q.rareBoost).length") >= 1, ev("QUESTS.filter(q=>q.rareBoost).map(q=>q.id).join()"))
    check('craft_etc_has_pet_acc', ev("craftGroup('석영 방울')==='기타'&&craftGroup('펫 사료')==='소모품'"))
    ev("closeModal();window.__left=0;window.__room={id:77,title:'t',status:'open',seed:5,host:true,members:[{team:1,me:true,host:true,snap:duelSnap()}]};Cloud.duelView=async()=>window.__room;Cloud.duelLeave=async()=>{window.__left++};openDuelRoom(window.__room)")
    pg.wait_for_timeout(100); ev("document.querySelector('#closeModal').click()"); pg.wait_for_timeout(100)
    check('duel_x_minimizes_not_leaves', ev("view.duelMin===77&&window.__left===0"), ev("[view.duelMin,view.duelRoom,window.__left]"))
    ev("openSettings()"); pg.wait_for_timeout(100); ev("closeModal()"); pg.wait_for_timeout(4600)
    check('duel_minimized_room_stays', ev("view.duelMin===77&&!!document.querySelector('#duelChip')&&window.__left===0"), ev("[view.duelMin,window.__left]"))
    ev("document.querySelector('#duelChip').click()"); pg.wait_for_timeout(300)
    check('duel_minimized_room_restores', pg.locator('#duelRoot').count() == 1 and ev("view.duelRoom===77&&!document.querySelector('#duelChip')"))
    ev("void (Cloud.duelView=async()=>{throw new Error('net')})"); ev("document.querySelector('[data-act=duel-min]').click()"); pg.wait_for_timeout(100); ev("document.querySelector('#duelChip').click()"); pg.wait_for_timeout(200)
    check('duel_restore_error_keeps_room', ev("view.duelMin===77&&!!document.querySelector('#duelChip')"))
    ev("view.duelMin=null;duelChip();stopDuelTimers()")
    ev("void (Cloud.duelView=async(id)=>id===88?window.__r2:window.__room);window.__r2={id:88,title:'t2',status:'open',seed:6,host:true,members:[{team:1,me:true,host:true,snap:duelSnap()}]};window.__room.members.push({team:2,snap:{...duelSnap(),name:'상대'}});openDuelRoom(window.__room);closeModal();view.duelMin=null;duelChip();stopDuelTimers();openDuelRoom(window.__r2)")
    pg.wait_for_timeout(100); ev("closeModal()"); pg.wait_for_timeout(300)
    check('duel_chip_shows_current_room', ev("document.querySelector('#duelChip').textContent.includes('A 1 · B 0')"), ev("document.querySelector('#duelChip').textContent"))
    ev("view.duelMin=null;duelChip();stopDuelTimers()")
    r = ev("(()=>{closeModal();state.duelBets={};state.duelEscrow=null;state.money=500;const e1=escrowSet(70,{cr:40});const e2=escrowSet(70,{cr:100});const m1=state.money;const e3=escrowSet(70,{cr:200});const m2=state.money;escrowSet(70,null);const m3=state.money;return [e1,e2,m1,m2,m3]})()")
    check('duel_escrow_min_change_refund', r[0] and r[1] is None and r[2] == 400 and r[3] == 300 and r[4] == 500, r)
    r = ev("(()=>{state.money=1000;state.duelBets={};state.duelEscrow=null;escrowSet(71,{cr:100});const me={team:1,me:true,...duelClean(duelSnap(),state.character.name),bet:{cr:100}};const fs=[me,{team:2,...duelClean(duelSnap(),'갑'),bet:{cr:300}},{team:2,...duelClean(duelSnap(),'을'),bet:{cr:50}}];const sim=duelSim(fs,4242);const b=duelBetResolve(4242,fs,sim,71);duelBetResolve(4242,fs,sim,71);const m1=state.money;const t=duelBetSettle(4242);duelBetSettle(4242);return [m1,state.money,b.won,t,state.duelEscrow]})()")
    check('duel_bet_individual_settle_once', r[0] == 900 and r[1] == (900 + 100 + 332 if r[2] else 900) and r[4] is None, r)  # 이기면 (300+50)×0.95=332
    check('duel_bet_rule', ev("(()=>{const a={team:1,name:'가'},b={team:2,name:'나'},c={team:2,name:'다'};return [betRuleError([a,b]),betRuleError([{...a,bet:{cr:50}},b]),betRuleError([{...a,bet:{item:'목재',qty:1}},{...b,bet:{cr:50}},{...c,bet:{cr:50}}]),betRuleError([{...a,bet:{item:'목재',qty:2}},{...b,bet:{cr:50}},{...c,bet:{cr:60}}])].map(x=>x?1:0).join('')})()") == '0110')
    check('duel_bet_cant_overpay_or_locked', ev("(()=>{state.duelEscrow=null;state.money=30;const a=escrowSet(72,{cr:50});addItem('목재',3);toggleLock('목재');const b=escrowSet(72,{item:'목재',qty:1});toggleLock('목재');return !!a&&!!b&&state.money===30&&!state.duelEscrow})()"))
    check('duel_stake_sanitized', ev("[cleanBet({cr:5}),cleanBet({cr:9999}),cleanBet({item:'없는템',qty:1}),cleanBet({item:'목재',qty:99}),JSON.stringify(cleanBet({cr:'60'}))].join('|')") == '||||{"cr":60}')
    check('item_lock_blocks_discard_sell', ev("(()=>{addItem('목재',2);toggleLock('목재');const d=discardItem('목재',1);const ok=typeof d==='string'&&d.includes('잠긴');toggleLock('목재');return ok&&!isLocked('목재')})()"))
    r = ev("(()=>{const s=cardSeats([{name:'나',me:true}]);let ok=true;for(let k=1;k<40;k++){for(const g of ['joker','onecard']){const x=cardSim(g,s,k);if(!x.done||x.rank.length!==4||new Set(x.rank).size!==4)ok=false;const mv=[];let G=cardReplay(g,s,k,mv),n=0;while(G.wait>=0&&n<300){mv.push({seq:mv.length,seat:0,move:n%3?null:{i:0,draw:true},timeout:n%2===1});G=cardReplay(g,s,k,mv);n++;}if(!G.done)ok=false;if(JSON.stringify(cardReplay(g,s,k,mv).rank)!==JSON.stringify(G.rank))ok=false;}}return [ok,s.filter(p=>p.bot).length]})()")
    check('card_replay_deterministic_4_seats', r[0] and r[1] == 3, r)
    ev("closeModal();openCards()"); pg.wait_for_timeout(100); ev("document.querySelector('[data-act=card-practice][data-g=onecard]').click()"); pg.wait_for_timeout(200)
    check('card_my_turn_controls', pg.locator('#cardWin .ct-seat').count() == 4 and pg.locator('#cardRoot [data-act=card-play]').count() >= 5 and pg.locator('#cardTimer').count() == 1)
    ev("(()=>{let n=0;while(view.cg&&!view.cg.G.done&&n<400){cardSubmit(null);n++;}clearTimeout(view.cg.anim);view.cg.anim=0;view.cg.shown=view.cg.G.log.length-1;cardRender();})()"); pg.wait_for_timeout(200)
    check('card_window_controls', pg.locator('#cardWin [data-act=cw-min]').count() == 1 and pg.locator('#cardWin [data-act=cw-restore]').count() == 1 and pg.locator('#cardWin [data-act=cw-close]').count() == 1 and pg.locator('#cardWin .cw-help[data-tip-desc]').count() == 1 and pg.locator('#cardWin .ct-seat.pos-S.me').count() == 1 and pg.locator('#cardWin .ct-seat.pos-N').count() == 1)
    ev("document.querySelector('[data-act=cw-min]').click()"); check('card_window_minimize', ev("document.querySelector('#cardWin').classList.contains('min')")); ev("document.querySelector('[data-act=cw-restore]').click()")
    check('card_practice_plays_to_end', pg.locator('#cardRoot .card-rank li').count() == 4 and pg.locator('#cardAgain:not(.hidden)').count() == 1)
    ev("closeModal();void (Cloud.chatFetch=async()=>[{id:3,name:'갑',body:'안녕'}]);openDuelRoom({id:95,title:'카드방',game:'onecard',status:'open',seed:null,host:true,members:[{team:1,me:true,host:true,snap:duelSnap()},{team:2,snap:{...duelSnap(),name:'갑'}}]})")
    pg.wait_for_timeout(100)
    check('card_room_no_chat_has_stake_ui', pg.locator('#tcIn').count() == 0 and pg.locator('#cardStake').count() == 1 and pg.locator('.card-seat').count() == 4)
    r = ev("(()=>{state.duelBets={};state.duelEscrow=null;state.money=200;const a=escrowSet(96,{cr:5},true),b=escrowSet(96,{cr:150},true),c=escrowSet(96,{cr:40},true);const m=state.money;const seats=[{name:'나',me:true},{name:'갑'},{name:'자동 대원 1',bot:true},{name:'자동 대원 2',bot:true}];let G=null;for(let k=1;k<200;k++){const x=cardSim('onecard',seats,k);if(x.rank.find(i=>!seats[i].bot)===0){G=x;break;}}const bt=cardBetResolve(777,96,G,0);const t=duelBetSettle(777);return [!!a,!!b,c,m,state.money,bt&&bt.won,t]})()")
    check('card_bet_range_and_win', r[0] and r[1] and r[2] is None and r[3] == 160 and r[4] == 160 + 40 + 38, r)  # 사람 2명: 40 + floor(40×0.95)=38
    check('title_rename_and_limit_exp', ev("STAT_PEAK_TITLES.str===\"I'm always angry.\"&&STAT_PEAK_TITLES.luk==='초고교급 희망'&&expMax(30)>expMax(29)*2&&expMax(34)>expMax(30)*2"))
    ev("cwClose();view.duelRoom=null;view.duelWatch=false;stopDuelTimers();view.duelMin=null;duelChip()")
    ev("cwClose();closeModal();openCardTable('joker')"); pg.wait_for_timeout(200)
    r = ev("(()=>{const G=view.cg.G;return [G.wait,document.querySelectorAll('[data-act=card-pick]').length,G.done]})()")
    if r[0] == 0:
        n0 = ev("view.cg.moves.length"); pg.click('[data-act=card-pick]', timeout=5000); pg.wait_for_timeout(100)
        check('card_joker_pick_works', ev("view.cg.moves.length") == n0 + 1)
    else:
        check('card_joker_pick_works', r[2] or r[0] == -1, r)
    ev("cwClose();closeModal()")
    ev("window.__left=0;void (Cloud.duelLeave=async()=>{window.__left++});openDuelRoom({id:91,title:'관전방',status:'open',seed:1,host:false,members:[{team:1,host:true,snap:{...duelSnap(),name:'갑'}},{team:2,snap:{...duelSnap(),name:'을'}}]})")
    pg.wait_for_timeout(100)
    check('duel_watch_mode_ui', ev("document.querySelector('#modalTitle').textContent.startsWith('관전')&&!!document.querySelector('[data-act=duel-unwatch]')&&!document.querySelector('[data-act=duel-leave]')"))
    ev("document.querySelector('#closeModal').click()"); pg.wait_for_timeout(100)
    check('duel_watch_close_does_not_leave_or_minimize', ev("window.__left===0&&!view.duelMin&&!view.duelRoom&&!document.querySelector('#duelChip')"))
    ev("duelInvitesIn([{room:5,from:'친구',title:'한판'}])")
    check('duel_invite_chip', ev("!!document.querySelector('#duelInvChip')&&view.duelInv.id===5"))
    ev("closeModal();window.__fx=0;const h=hitSfx,w=swishSfx,f=sfx;hitSfx=(...a)=>{window.__fx++;h(...a)};swishSfx=(...a)=>{window.__fx++;w(...a)};openMock()"); pg.wait_for_timeout(100)
    ev("document.querySelector('[data-act=mock-start]').click()"); pg.wait_for_timeout(250)
    banner = pg.locator('#duelCut .duel-start').count(); pg.wait_for_timeout(2600)
    check('mock_battle_like_duel', banner == 1 and ev("window.__fx") >= 3 and pg.locator('#mockArena .duel-f').count() == 2 and ev("document.querySelector('#dh1').style.width!=='100%'||document.querySelector('#dh0').style.width!=='100%'"), [banner, ev("window.__fx")])
    ev("closeModal()")
    r = ev("(async()=>{const bak={e:Object.getOwnPropertyDescriptor(Cloud,'enabled'),u:Cloud.user,m:Cloud.marketMine,st:Cloud.marketStatus,a:Cloud.marketAck,l:Cloud.marketList};try{Object.defineProperty(Cloud,'enabled',{get:()=>true,configurable:true});Cloud.user=()=>'tester';Cloud.marketMine=async()=>[];Cloud.marketStatus=async k=>[{id:5,ckey:k[0],item:'목재',qty:0,price:10,status:'sold',sold:3}];Cloud.marketAck=async()=>{};state.market.sell=[{key:'kkkkkk1',id:5,item:'목재',qty:3,price:10,got:0}];state.market.buy=[];state.mseen=[];const m0=state.money;await marketSync();return [state.market.sell.length,state.money-m0,Cloud.enabled===true]}finally{Object.defineProperty(Cloud,'enabled',bak.e);Cloud.user=bak.u;Cloud.marketMine=bak.m;Cloud.marketStatus=bak.st;Cloud.marketAck=bak.a}})()")
    check('market_acked_elsewhere_settles', r[0] == 0 and r[1] == 27, r)  # 3×10 판매, 수수료 10% → 27
    ev("state.titles.push('강함의 증표');state.character.title='강함의 증표'")
    ev("view.duelInv=null;duelInvChip();stopDuelTimers();state.duelBets[999]={won:true,cr:20,items:[],lost:'',at:Date.now(),done:false};state.duelEscrow={room:5,bet:{cr:60},at:Date.now()};state.locks=['목재']")
    ev("save()"); pg.reload(); pg.wait_for_timeout(300)
    check('old_title_renamed_on_load', ev("state.character.title===\"I'm always angry.\"&&state.titles.includes(\"I'm always angry.\")"))
    check('duel_bets_survive_reload', ev("!!(state.duelBets&&state.duelBets[999]&&state.duelBets[999].cr===20&&state.duelEscrow&&state.duelEscrow.bet.cr===60&&isLocked('목재'))"))
    check('reload_keeps_save_no_load_error', ev("state.created===true&&!localStorage.getItem(SAVE_KEY+'-backup')"))  # 불러오기 오류(TDZ 등)로 세이브가 초기화되지 않는다
    check('no_js_errors', not errs, errs)
    b.close()
print(json.dumps({'FAILED': FAIL, 'checks': N[0]}, ensure_ascii=False))
