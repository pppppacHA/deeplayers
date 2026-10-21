"""서버 저장(cloud.js) 모의 테스트: Supabase 응답을 가짜로 만들어 로그인 → 올리기 → 충돌 흐름을 확인한다. 실행: python3 tests/cloud_test.py"""
import functools, http.server, json, os, threading, sys
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT))
sv.RequestHandlerClass.log_message = lambda *a: None
threading.Thread(target=sv.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{sv.server_port}/index.html'
fails = []
def rect(pg, sel):
    return pg.evaluate("s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,r:r.right,b:r.bottom,w:r.width,h:r.height}}", sel)
def check(n, c, info=None):
    print(('ok  ' if c else 'FAIL'), n, '' if c else info)
    if not c: fails.append(n)
server = {'rev': 0, 'data': None, 'pushes': []}
def api(route):
    req = route.request; u = req.url; h = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'content-type': 'application/json'}
    if req.method == 'OPTIONS': return route.fulfill(status=204, headers=h)
    body = json.loads(req.post_data or '{}')
    if '/auth/v1/token' in u:
        if body.get('password') == 'good-pass-123': return route.fulfill(headers=h, body=json.dumps({'access_token': 'a', 'refresh_token': 'r', 'expires_in': 3600}))
        return route.fulfill(status=400, headers=h, body=json.dumps({'error_description': 'Invalid login credentials'}))
    if '/rpc/is_admin' in u: return route.fulfill(headers=h, body='true')
    if '/rpc/pull_save' in u:
        return route.fulfill(headers=h, body=json.dumps(None if server['data'] is None else {'rev': server['rev'], 'data': server['data'], 'at': '2026-10-21T03:00:00Z'}))
    if '/rpc/push_save' in u:
        if body['p_rev'] != server['rev']: return route.fulfill(headers=h, body=json.dumps({'ok': False, 'rev': server['rev']}))
        server['rev'] += 1; server['data'] = body['p_data']; server['pushes'].append(server['rev'])
        return route.fulfill(headers=h, body=json.dumps({'ok': True, 'rev': server['rev']}))
    route.fulfill(status=404, headers=h, body='{}')
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
    pg.route('**/fonts.*/**', lambda r: r.abort())
    pg.route('https://x.supabase.co/**', api)
    def patch(r):
        res = r.fetch(); r.fulfill(response=res, body=__import__('re').sub(r"const CLOUD = \{[^}]*\};", "const CLOUD = { url: 'https://x.supabase.co/rest/v1/', key: 'k' };", res.text()))
    pg.route('**/js/cloud.js', patch)
    pg.goto(URL); pg.wait_for_timeout(700)
    check('gate_no_tutorial_before_signup', pg.evaluate("typeof state==='undefined'||document.querySelector('#tutorial')===null||document.querySelector('#tutorial').classList.contains('hidden')") or pg.url.endswith('signup.html'))
    check('gate_redirects_to_signup_when_logged_out', pg.url.endswith('signup.html'), pg.url)
    check('signup_page_has_tabs', pg.locator('#suTabs:not(.hidden)').count() == 1 and pg.locator('#suForm:not(.hidden)').count() == 1 and pg.locator('#liForm.hidden').count() == 1)
    pg.click('[data-su="login"]')
    pg.fill('#liId', 'tester1'); pg.fill('#liPw', 'wrong-pass'); pg.click('#liGo'); pg.wait_for_timeout(400)
    check('bad_login_rejected', pg.url.endswith('signup.html') and '맞지' in pg.inner_text('#liResult'))
    server['rev'] = 3; server['data'] = {'version': 8, 'money': 31337}
    pg.fill('#liPw', 'good-pass-123'); pg.click('#liGo'); pg.wait_for_timeout(1500)
    check('login_goes_to_game_with_server_save', pg.url.endswith('index.html') and pg.evaluate("Cloud.user()") == 'tester1', pg.url)
    pg.evaluate("document.querySelector('#tutorial').classList.add('hidden')")
    check('admin_account_gets_dev_tools', pg.evaluate("window.DEV===true"))
    pg.evaluate("openSettings()"); pg.wait_for_timeout(100)
    cr_ = [rect(pg, '.cloudrow span'), rect(pg, '[data-act="cloud-push"]'), rect(pg, '[data-act="cloud-pull"]')]
    check('settings_shows_logged_in_with_save_and_load_right', cr_[1]['x'] > cr_[0]['x'] and cr_[2]['x'] > cr_[1]['x'] and abs(cr_[1]['y'] - cr_[0]['y']) < 14 and pg.locator('.cloudrow button').count() == 2, cr_)
    pg.evaluate("state.money=777;save()"); pg.click('[data-act="cloud-push"]'); pg.wait_for_timeout(300)
    check('manual_push_bumps_rev', server['rev'] == 4 and server['data']['money'] == 777, server['rev'])
    server['rev'] = 9  # 다른 기기가 먼저 저장
    pg.evaluate("openSettings()"); pg.click('[data-act="cloud-push"]'); pg.wait_for_timeout(300)
    check('conflict_blocks_push', server['rev'] == 9 and pg.evaluate("_cloudBlocked") is True)
    server['data']['money'] = 4242
    pg.evaluate("openSettings()"); pg.click('[data-act="cloud-pull"]'); pg.wait_for_timeout(1000)
    check('pull_replaces_local_and_reloads', pg.evaluate("state.money") == 4242, pg.evaluate("state.money"))
    pg.evaluate("document.querySelector('#tutorial').classList.add('hidden')")
    pg.evaluate("openSettings()")
    check('settings_has_no_logout_or_signup_link', pg.locator('[data-act="cloud-logout"]').count() == 0 and pg.locator('a[href="signup.html"]').count() == 0)
    pg.evaluate("closeModal()"); pg.click('#logoutBtn'); pg.click('[data-act="logout-ok"]'); pg.wait_for_timeout(900)
    check('logout_returns_to_signup', pg.url.endswith('signup.html') and pg.evaluate("Cloud.user()") is None)
    b.close()
print('FAILED' if fails else 'ALL OK', fails)
sys.exit(1 if fails else 0)
