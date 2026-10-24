"""마이홈 단독 테스트 (빠름). python3 tests/room_test.py"""
import json, os, sys, re
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / 'index.html').as_uri()
STUB = ".material-symbols-rounded{color:transparent!important}"
FAIL = []
def check(n, c, info=None):
    if not c: FAIL.append(n); print('FAIL', n, str(info)[:300], flush=True)
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1440, 'height': 900}, accept_downloads=True); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: (errs.append(str(e)), print('PAGEERROR', e)))
    pg.route('**/*fonts.g*', lambda r: r.abort())
    ctx.route('**/js/cloud.js', lambda r: r.fulfill(body=re.sub(r"const CLOUD = \{[^}]*\};", "const CLOUD = { url: '', key: '' };", (ROOT/'js'/'cloud.js').read_text(encoding='utf8')), content_type='application/javascript; charset=utf-8'))
    pg.goto(URL); pg.evaluate("localStorage.clear()"); pg.reload(); pg.add_style_tag(content=STUB); pg.wait_for_timeout(250)
    ev = pg.evaluate
    pg.click('#tutSkipStory'); pg.fill('#ctName', '방주인'); pg.click('#ctNext'); pg.fill('#ctAbility', '꾸미기')
    for k, n in [('str', 3), ('agi', 3), ('int', 2), ('wil', 2), ('sen', 1), ('luk', 1)]:
        for _ in range(n): pg.click(f'[data-ct="{k}"][data-d="1"]')
    pg.click('#ctDone'); pg.click('#tutSkip'); pg.click('[data-weapon="훈련용 검"]'); pg.click('#tutWeaponOk'); pg.wait_for_timeout(100)
    ev("""(()=>{QUESTS.push({id:'t_full',kind:'서브',title:'테스트',desc:'',need:{type:'flag',flag:'tflag',text:'테스트'},reward:{exp:1,money:5,items:[['응급 키트',1]]}});
      QUESTS.push({id:'t_full2',kind:'서브',title:'테스트2',desc:'',need:{type:'flag',flag:'tflag',text:'테스트'},reward:{exp:1,money:5,items:[['응급 키트',1]]}});state.flags.tflag=true;
      window.fillBag=()=>{state.inventory={'장비':[],'소모품':[],'재료':[]};const names=Object.keys(ITEMS).filter(n=>ITEMS[n].tab==='재료'&&n!=='응급 키트').slice(0,bagCapacity());names.forEach(n=>state.inventory['재료'].push({n,q:1}))};fillBag();return usedSlots()})()""")
    check('bag_full', ev("usedSlots()") == ev("bagCapacity()"))
    check('overflow_detected', ev("questOverflow(QUESTS.find(q=>q.id==='t_full')).length") == 1)
    ev("A['quest-done']({dataset:{id:'t_full'}})"); pg.wait_for_timeout(100)
    check('full_window', '가방이 가득' in pg.inner_text('#modalTitle') and pg.locator('[data-act="qfull-pick"]').count() == ev("bagCapacity()") and pg.locator('[data-act="qfull-drop"]').count() == 1 and not ev("state.questDone.t_full"))
    pg.click('[data-act="qfull-pick"] >> nth=0'); pg.wait_for_timeout(60)
    check('pick_asks_confirm', pg.locator('[data-act="qfull-pick-do"]').count() == 1 and '버려서' in pg.inner_text('#modalBody'))
    pg.click('[data-act="confirm-cancel"]'); pg.wait_for_timeout(60)
    check('cancel_returns', '가방이 가득' in pg.inner_text('#modalTitle') and ev("usedSlots()") == ev("bagCapacity()") and not ev("state.questDone.t_full"))
    pg.click('[data-act="qfull-pick"] >> nth=0'); pg.click('[data-act="qfull-pick-do"]'); pg.wait_for_timeout(100)
    check('pick_frees_and_completes', ev("state.questDone.t_full") is True and ev("countItem('응급 키트')") == 1 and ev("usedSlots()") == ev("bagCapacity()"))
    ev("(()=>{fillBag();state.questTaken={};})()")
    ev("A['quest-done']({dataset:{id:'t_full2'}})"); pg.wait_for_timeout(100)
    pg.click('[data-act="qfull-drop"]'); pg.wait_for_timeout(60)
    check('drop_asks_confirm', pg.locator('[data-act="qfull-drop-do"]').count() == 1 and '버릴까요' in pg.inner_text('#modalBody'))
    pg.click('[data-act="qfull-drop-do"]'); pg.wait_for_timeout(100)
    check('drop_reward_completes', ev("state.questDone.t_full2") is True and ev("countItem('응급 키트')") == 0 and ev("usedSlots()") == ev("bagCapacity()"))
    ev("(()=>{state.questDone={};state.inventory={'장비':[],'소모품':[],'재료':[]};})()")
    check('no_overflow_when_space', ev("questOverflow(QUESTS.find(q=>q.id==='t_full')).length") == 0)
    ev("A['quest-done']({dataset:{id:'t_full'}})"); pg.wait_for_timeout(60)
    check('direct_when_space', ev("state.questDone.t_full") is True and ev("countItem('응급 키트')") == 1 and pg.locator('[data-act="qfull-pick"]').count() == 0)
    check('no_js_errors', not errs, errs); b.close()
print(json.dumps({'FAILED': FAIL}, ensure_ascii=False)); sys.exit(1 if FAIL else 0)
