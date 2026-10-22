"""
화면 무작위 클릭 테스트. 실행: python3 tests/uifuzz.py [시드수=3] [시드당 클릭=500]
보이는 버튼을 무작위로 누르면서 JS 오류(pageerror/console.error)와 멈춤을 찾는다. (서버 없이, 위험한 동작은 건너뜀)
"""
import re, sys, random
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / 'index.html').as_uri()
SEEDS = int(sys.argv[1]) if len(sys.argv) > 1 else 3
CLICKS = int(sys.argv[2]) if len(sys.argv) > 2 else 500
SKIP = re.compile(r'reset|delete|wipe|logout|clear|dev|import|export|download|avatar|recover|cloud|backup|tut|replay|save-file|load-file|crop|signup|account|leave-all|guild-leave|disband')

with sync_playwright() as p:
    b = p.chromium.launch()
    bad = 0
    for seed in range(1, SEEDS + 1):
        rng = random.Random(seed * 101)
        ctx = b.new_context(viewport={'width': 1440, 'height': 900})
        pg = ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)[:300]))
        pg.on('console', lambda m: errs.append('CONSOLE ' + m.text[:300]) if m.type == 'error' and 'font' not in m.text.lower() and 'ERR_' not in m.text and 'Fetch API' not in m.text and 'version.json' not in m.text else None)
        pg.on('dialog', lambda d: d.dismiss())
        pg.route('**/*fonts.g*', lambda r: r.abort())
        ctx.route('**/js/cloud.js', lambda r: r.fulfill(body=re.sub(r"const CLOUD = \{[^}]*\};", "const CLOUD = { url: '', key: '' };", (ROOT / 'js' / 'cloud.js').read_text(encoding='utf8')), content_type='application/javascript; charset=utf-8'))
        pg.goto(URL); pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_timeout(250)
        pg.click('#tutSkipStory'); pg.wait_for_timeout(60)
        pg.fill('#ctName', '클릭'); pg.click('#ctNext'); pg.fill('#ctAbility', '그림자 이동')
        for k, n in [('str', 3), ('agi', 3), ('int', 2), ('wil', 2), ('sen', 1), ('luk', 1)]:
            for _ in range(n): pg.click(f'[data-ct="{k}"][data-d="1"]')
        pg.click('#ctDone'); pg.wait_for_timeout(150)
        pg.click('#tutSkip'); pg.wait_for_timeout(60)
        pg.click('[data-weapon="훈련용 검"]'); pg.click('#tutWeaponOk'); pg.wait_for_timeout(100)
        pg.evaluate("""(()=>{ state.money=50000; state.character.level=20; state.character.rank='B'; state.vitals.hp=100; state.vitals.sp=100;
          Object.keys(ITEMS).filter(n=>!ITEMS[n].hidden).slice(0,50).forEach(n=>addItem(n,3)); addItem('훈련용 검',1); save(); renderBag&&renderBag(); })()""")
        n_ok = 0
        for i in range(CLICKS):
            if pg.url != URL and not pg.url.startswith(URL.split('#')[0]):
                pg.goto(URL); pg.wait_for_timeout(200)
            handle = pg.evaluate_handle("""(skip) => {
              const re = new RegExp(skip);
              const els = [...document.querySelectorAll('button, [data-act], [data-node], .tile, .slot.clickable, .chip')].filter(e => {
                const r = e.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return false;
                const st = getComputedStyle(e); if (st.visibility === 'hidden' || st.display === 'none' || e.disabled) return false;
                const a = ((e.dataset && e.dataset.act) || '') + ' ' + (e.id || ''); if (re.test(a)) return false;
                const cx = r.left + r.width / 2, cy = r.top + r.height / 2; if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return false;
                const top = document.elementFromPoint(cx, cy); return top && (top === e || e.contains(top));
              });
              return els.length ? els[Math.floor(Math.random() * els.length)] : null;
            }""", SKIP.pattern)
            el = handle.as_element()
            if not el:
                pg.keyboard.press('Escape'); pg.evaluate("typeof closeModal==='function'&&closeModal()"); continue
            try:
                el.click(timeout=1500, force=False); n_ok += 1
            except Exception:
                pass
            if i % 7 == 0:  # 시간을 조금 앞당겨 행동이 끝나게 한다
                pg.evaluate("(()=>{ if(state.active){state.active.endAt=Date.now()-1} if(state.vitals.sp<20){state.vitals.sp=state.vitals.spMax} if(state.vitals.hp<20){state.vitals.hp=state.vitals.hpMax} })()")
            pg.wait_for_timeout(15)
            if errs: break
        ok = not errs
        print(f"seed {seed}: {'OK' if ok else 'FAIL'} (clicks ok {n_ok}/{CLICKS})", flush=True)
        if not ok:
            bad += 1
            for e in errs[:5]: print('   ', e)
        ctx.close()
    b.close()
sys.exit(1 if bad else 0)
