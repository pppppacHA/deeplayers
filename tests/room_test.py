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
    ev("""(()=>{const mk=(w,h,fill)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle=fill;x.fillRect(0,0,w,h);return c.toDataURL()};
      defFurn('t_bed','침대','테스트 침대','',{src:mk(40,24,'#bbbbbb'),maskSrc:mk(40,24,'#ffffff'),layer:'floor',scale:2,w:40,h:24});
      defFurn('t_chair','의자','테스트 의자','',{src:mk(16,20,'#996633'),maskSrc:'',layer:'floor',scale:1,w:16,h:20});
      defFurn('t_wall','벽지','테스트 벽지','',{skin:{l:'#ddd',r:'#ccc'},src:mk(600,600,'#aa5555')});
      defFurn('t_floor','바닥','테스트 바닥','',{skin:{a:'#bbb',b:'#aaa'},src:mk(600,600,'#55aa55')});
      defFurn('t_nowall','벽지','없는 벽지','',{skin:{l:'#ddd',r:'#ccc'},src:'assets/room/nope_w.png'});
      defFurn('t_nofloor','바닥','없는 바닥','',{skin:{a:'#bbb',b:'#aaa'},src:'assets/room/nope_f.png'});
      defFurn('t_bg','배경','테스트 배경','',{skin:{a:'#8c8c8c',b:'#8c8c8c'},src:mk(600,600,'#5555aa')});
      defFurn('t_clock','벽소품','테스트 시계','',{src:mk(12,12,'#223344'),maskSrc:'',layer:'wall',scale:1,w:12,h:12})})()""")
    ev("(()=>{state.location='개인실';renderAction()})()")
    check('home_choice', ev("LOCATIONS['개인실'].groups.some(g=>g.items.includes('ROOM'))"))
    pg.click('[data-choice="ROOM"]'); pg.wait_for_timeout(150)
    check('room_opens', pg.locator('#roomRoot').count() == 1 and 'ROOM' in pg.inner_text('#modalTitle') and pg.locator('#modal.room').count() == 1)
    check('bar_order_export_then_edit', ev("[...document.querySelectorAll('.room-bar button')].map(b=>b.dataset.act).join()") == 'room-export,room-edit')
    check('room_view_buttons', pg.locator('[data-act="room-edit"]').count() == 1 and pg.locator('[data-act="room-export"]').count() == 1)
    sz = ev("(()=>{const r=document.querySelector('#roomVp').getBoundingClientRect();return [r.width,r.height]})()")
    check('vp_square', abs(sz[0]-sz[1]) < 2 and sz[0] > 300, sz)
    pg.click('[data-act="room-edit"]'); pg.wait_for_timeout(80)
    check('edit_ui', pg.locator('.rm-grid .slot').count() == 25 and pg.locator('[data-act="room-save"]').count() == 1)
    for t in ['벽지', '바닥', '침대', '의자', '책상', '수납', '소품', '벽소품', '배경']:
        while pg.locator(f'[data-act="room-tab"][data-tab="{t}"]').count() == 0:
            pg.click('[data-act="room-tabs"][data-d="1"]')
        pg.click(f'[data-act="room-tab"][data-tab="{t}"]'); pg.wait_for_timeout(40)
        check('tab_' + t, pg.locator('.rm-grid .slot').count() == 25 and (t in ('책상','수납','소품') or pg.locator('.rm-slot').count() >= 1))
    while pg.locator('[data-act="room-tab"][data-tab="침대"]').count() == 0:
        pg.click('[data-act="room-tabs"][data-d="-1"]')
    pg.click('[data-act="room-tab"][data-tab="침대"]')
    pg.click('.rm-slot[data-id="t_bed"]'); pg.wait_for_timeout(60)
    check('placed', ev("view.room.draft.items.length") == 1 and pg.locator('#rmEd').count() == 1 and pg.locator('#roomItems .rm-item').count() == 1)
    pg.click('[data-act="room-tab"][data-tab="의자"]'); pg.click('.rm-slot'); pg.wait_for_timeout(60)
    while pg.locator('[data-act="room-tab"][data-tab="벽소품"]').count() == 0:
        pg.click('[data-act="room-tabs"][data-d="1"]')
    pg.click('[data-act="room-tab"][data-tab="벽소품"]')
    # 벽 소품 추가: clock1
    pg.click('.rm-slot[data-id="t_clock"]'); pg.wait_for_timeout(60)
    z = ev("(()=>{const els=[...document.querySelectorAll('#roomItems .rm-item')].map(e=>+e.style.zIndex);return els})()")
    check('png_items_render', ev("document.querySelectorAll('#roomItems .rm-item').length") == 3 and ev("[...document.querySelectorAll('#roomItems .rm-item')].every(e=>e.getAttribute('src'))"))
    check('wall_prop_behind', z[2] < min(z[0], z[1]), z)
    # 드래그
    box = pg.locator('#roomItems .rm-item').nth(1).bounding_box()
    x0 = ev("view.room.draft.items[1].x")
    pg.mouse.move(box['x']+box['width']/2, box['y']+box['height']/2); pg.mouse.down(); pg.mouse.move(box['x']+box['width']/2+60, box['y']+box['height']/2+20, steps=5); pg.mouse.up(); pg.wait_for_timeout(50)
    x1 = ev("view.room.draft.items[1].x")
    check('drag_moves', x1 > x0, [x0, x1])
    top_u = ev("view.room.draft.items.reduce((a,b)=>a.z>b.z?a:b).u")
    check('clicked_goes_top', top_u == ev("view.room.draft.items[1].u"))
    # 편집기 창 끌기
    eb = pg.locator('#rmEdBar').bounding_box(); l0 = ev("document.querySelector('#rmEd').offsetLeft")
    pg.mouse.move(eb['x']+20, eb['y']+8); pg.mouse.down(); pg.mouse.move(eb['x']+80, eb['y']-40, steps=5); pg.mouse.up(); pg.wait_for_timeout(50)
    check('editor_draggable', ev("document.querySelector('#rmEd').offsetLeft") != l0)
    # 반전/색
    f0 = ev("view.room.draft.items[1].flip"); pg.click('[data-act="room-flip"]'); check('flip', ev("view.room.draft.items[1].flip") != f0)
    ev("roomSelect(view.room.draft.items[0].u)")
    check('color_btn_enabled', ev("!document.querySelector('[data-act=room-color]').disabled"))
    pg.click('[data-act="room-color"]'); pg.wait_for_timeout(60)
    geo = ev("(()=>{const e=document.querySelector('#rmEd').getBoundingClientRect(),p=document.querySelector('#rmPick');if(!p)return null;const r=p.getBoundingClientRect();return [e.top,e.bottom,e.left,e.width,r.top,r.bottom,r.left,r.width,window.innerHeight]})()")
    check('picker_opens_below_editor', geo and (geo[4] >= geo[1] or geo[5] <= geo[0]) and abs(geo[6]-geo[2]) < 2 and geo[5] <= geo[8], geo)
    pg.click('#rmPick [data-act="room-color-set"][data-c="#e57373"]'); check('color', ev("view.room.draft.items[0].c") == '#e57373')
    ev("(()=>{const i=document.querySelector('#rmH');i.value='200';i.dispatchEvent(new Event('input',{bubbles:true}))})()")
    check('color_slider', ev("/^#[0-9a-f]{6}$/.test(view.room.draft.items[0].c)") and ev("view.room.draft.items[0].c") != '#e57373')
    ev("(()=>{view.room.draft.items[0].c='#ff0000';roomEdRefresh()})()")
    l1 = ev("document.querySelector('#rmEd').offsetLeft"); pg.mouse.move(1,1)
    pg.click('[data-act="room-color"]'); check('picker_closes', pg.locator('#rmPick').count() == 0)
    ev("(()=>{view.room.draft.items[0].c='#ff0000';roomEdRefresh()})()")
    # 새 레이아웃: 버튼은 오버레이 창 밖, 편집기는 fixed 이고 창 밖으로 이동, 삭제 후에도 보임
    check('bar_outside_modal', ev("(()=>{const b=document.querySelector('.room-bar');return !!b&&!document.querySelector('#modal').contains(b)&&getComputedStyle(b).position==='fixed'})()"))
    check('footer_same_line', ev("(()=>{const f=document.querySelector('#roomSide .inv-footer');const a=f.querySelector('[data-act=room-save]').getBoundingClientRect(),b=f.querySelector('.pages span').getBoundingClientRect();return Math.abs((a.top+a.bottom)/2-(b.top+b.bottom)/2)<8&&a.left<b.left})()"))
    check('default_bg_white_only_two', ev("defaultRoom().bg")=='b_white' and ev("FURN.filter(f=>f.cat==='배경'&&!f.src).map(f=>f.id).join()")=='b_white,b_custom' and ev("cleanRoom({bg:'b_night'}).bg")=='b_white')
    eb2 = pg.locator('#rmEdBar').bounding_box(); mr = ev("document.querySelector('#modal').getBoundingClientRect().left")
    pg.mouse.move(eb2['x']+20, eb2['y']+8); pg.mouse.down(); pg.mouse.move(2, eb2['y']+8, steps=6); pg.mouse.up(); pg.wait_for_timeout(50)
    check('editor_leaves_modal', ev("document.querySelector('#rmEd').getBoundingClientRect().left") < mr - 5, [ev("document.querySelector('#rmEd').getBoundingClientRect().left"), mr])
    pg.screenshot(path=str(ROOT/'tests'/'out'/'room_edit.png'))
    check('editor_fits', ev("(()=>{const e=document.querySelector('#rmEd .rm-ed-body');return e.scrollWidth<=e.clientWidth+1})()"))
    check('bar_attached_to_modal', ev("(()=>{const b=document.querySelector('.room-bar').getBoundingClientRect(),m=document.querySelector('#modal').getBoundingClientRect();return Math.abs(b.right-m.right)<6&&b.bottom<=m.top+1&&m.top-b.bottom<14})()"))
    check('bg_static_on_pan', ev("(()=>{const bg=document.querySelector('.room-bg');return !document.querySelector('#roomStage').contains(bg)})()"))
    pg.wait_for_timeout(300)
    px = ev("(()=>{const c=furnCanvas(furnDef('t_bed'),'#ff0000');const d=c.getContext('2d').getImageData(5,5,1,1).data;return [d[0],d[1],d[2]]})()")
    check('png_mask_tint_applies', px[0] > px[1] + 60 and px[1] == px[2], px)
    check('png_scale_size', ev("furnSize(furnDef('t_bed')).w")==80 and ev("furnSize(furnDef('t_chair')).w")==16)
    ev("(()=>{const R=view.room;R.draft.wall='t_wall';R.draft.floor='t_floor';R.draft.bg='t_bg';roomRender()})()")
    pg.wait_for_timeout(300)
    check('skin_png_rendered', pg.locator('.room-svg image').count() == 2 and pg.locator('img.room-bg').count() == 1 and pg.locator('.room-svg polygon').count() == 0)
    ev("(()=>{const R=view.room;R.draft.wall='t_nowall';R.draft.floor='t_nofloor';R.draft.bg='b_custom';roomRender()})()")
    check('missing_png_skin_shows_colors', ev("(()=>{const s=roomSkins({wall:'t_nowall',floor:'t_nofloor',bg:'b_white'});return !s.wp&&!s.fp&&cleanRoom({wall:'wall_00'}).wall==='wall_00'})()"))
    check('skin_png_removed_falls_back_to_colors', pg.locator('.room-svg polygon').count() == 2 and pg.locator('.room-svg image').count() == 0)
    check('clean_keeps_png_skin', ev("cleanRoom({wall:'t_wall',floor:'t_floor',bg:'t_bg'}).wall")=='t_wall' and ev("cleanRoom({wall:'t_floor'}).wall")==ev("ROOM_DEFAULT_SKIN.wall"))
    pg.wait_for_timeout(300)
    ev("defFurn('t_missing','침대','없음','없는 파일',{src:'assets/room/nope_zz.png',maskSrc:'assets/room/nope_zz_mask.png',w:64,h:64})")
    ev("furnUrl(furnDef('t_missing'),'')"); pg.wait_for_timeout(800)
    check('missing_png_gets_temp_marker', ev("furnUrl(furnDef('t_missing'),'').startsWith('data:image/png')") and ev("furnSize(furnDef('t_missing')).w")==64 and not ev("furnMaskable(furnDef('t_missing'))"))
    check('real_bed_png_size', ev("furnSize(furnDef('bed_00')).w")==96 and ev("furnSize(furnDef('bed_00')).h")==78)
    # 확대/이동
    s0 = ev("view.room.scale"); pg.click('[data-act="room-zoom"][data-d="1"]'); check('zoom', ev("view.room.scale") > s0)
    # 배경 이미지 올리기
    png = ROOT/'tests'/'out'/'bg_test.png'; png.parent.mkdir(exist_ok=True)
    ev("(()=>{})()")
    from base64 import b64decode
    png.write_bytes(b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='))
    while pg.locator('[data-act="room-tab"][data-tab="배경"]').count() == 0:
        pg.click('[data-act="room-tabs"][data-d="1"]')
    pg.click('[data-act="room-tab"][data-tab="배경"]'); pg.set_input_files('#rmBgFile', str(png)); pg.wait_for_timeout(400)
    bg = ev("localStorage.getItem('deeplayer-roombg')")
    check('bg_saved_small', bg and len(bg) <= 100000 and bg.startswith('data:image/jpeg'), len(bg or ''))
    import base64
    nb = ev("(()=>{const c=document.createElement('canvas');c.width=c.height=900;const x=c.getContext('2d'),d=x.createImageData(900,900);for(let i=0;i<d.data.length;i+=4){d.data[i]=Math.random()*255;d.data[i+1]=Math.random()*255;d.data[i+2]=Math.random()*255;d.data[i+3]=255}x.putImageData(d,0,0);return c.toDataURL('image/png').split(',')[1]})()")
    pg.set_input_files('#rmBgFile', files=[{'name':'n.png','mimeType':'image/png','buffer':base64.b64decode(nb)}]); pg.wait_for_timeout(1500)
    bg2 = ev("localStorage.getItem('deeplayer-roombg')")
    check('bg_noise_compressed_under_limit', bg2 and len(bg2) <= 100000 and bg2 != bg, len(bg2 or ''))
    check('bg_size_600', ev("new Promise(r=>{const i=new Image();i.onload=()=>r([i.naturalWidth,i.naturalHeight]);i.src=localStorage.getItem('deeplayer-roombg')})") in ([600,600],[500,500],[420,420],[340,340]))
    pg.click('.rm-slot[data-id="b_custom"]'); pg.wait_for_timeout(60)
    check('bg_applied', ev("view.room.draft.bg") == 'b_custom' and pg.locator('img.room-bg').count() == 1)
    # 저장
    pg.click('[data-act="room-save"]'); pg.wait_for_timeout(80)
    check('saved', ev("state.room.items.length") == 3 and ev("JSON.parse(localStorage.getItem('deeplayer-ui')).room.items.length") == 3 and ev("state.room.bg") == 'b_custom')
    check('saved_color_kept', ev("state.room.items.some(i=>i.c==='#ff0000')"))
    # 이미지 출력 (file:// 에서는 실제 PNG가 캔버스를 막으므로 data: 스킨으로 확인)
    ev("(()=>{[state.room,view.room.data].forEach(r=>{r.wall='t_wall';r.floor='t_floor'});roomRender()})()"); pg.wait_for_timeout(300)
    with pg.expect_download() as d: pg.click('[data-act="room-export"]')
    check('export_png', d.value.suggested_filename == 'myroom.png')
    # 취소는 버림
    pg.click('[data-act="room-edit"]'); pg.click('.rm-slot'); pg.click('[data-act="room-cancel"]'); pg.wait_for_timeout(50)
    check('cancel_discards', ev("state.room.items.length") == 3)
    # 삭제
    pg.click('[data-act="room-edit"]'); pg.locator('#roomItems .rm-item').nth(0).click(force=True); pg.click('[data-act="room-del"]'); check('delete', ev("view.room.draft.items.length") == 2)
    check('editor_stays_after_delete', pg.locator('#rmEd').count() == 1)
    pg.click('[data-act="room-cancel"]')
    # 한도
    check('limit', ev("(()=>{const r=cleanRoom({items:Array.from({length:99},(_,i)=>({u:i+1,f:'t_chair',x:1,y:1}))});return r.items.length<=ROOM_MAX})()"))
    check('clean_rejects_bad', ev("(()=>{const r=cleanRoom({wall:'x',items:[{u:1,f:'nope',x:9,y:9},{u:2,f:'wall_00',x:1,y:1},{u:3,f:'t_bed',x:99999,y:-99999,c:'red'}]});return r.items.length===1&&r.items[0].x<=600&&r.items[0].y>=-300&&r.items[0].c===''})()"))
    # 구경 (상대 프로필)
    ev("closeModal()")
    ev("Object.defineProperty(Cloud,'enabled',{get:()=>true});Cloud.user=()=>({id:'u'});Cloud.getRoom=async n=>({name:n,room:state.room,bg:localStorage.getItem('deeplayer-roombg')})")
    check('peek_btn_html', 'data-act="room-peek"' in ev("otherEquipHtml({}, '다른이')") and 'equip-head' in ev("otherEquipHtml({}, '다른이')"))
    ev("modal('t', otherEquipHtml({}, '다른이'), [])"); pg.click('[data-act="room-peek"]'); pg.wait_for_timeout(200)
    check('peek_opens_readonly', '다른이의 ROOM' in pg.inner_text('#modalTitle') and pg.locator('[data-act="room-edit"]').count() == 0 and pg.locator('#roomItems .rm-item').count() == 3 and pg.locator('#roomItems .rm-item.edit').count() == 0)
    pg.screenshot(path=str(ROOT/'tests'/'out'/'room_peek.png'))
    check('no_js_errors', not errs, errs)
    b.close()
print(json.dumps({'FAILED': FAIL}, ensure_ascii=False)); sys.exit(1 if FAIL else 0)
