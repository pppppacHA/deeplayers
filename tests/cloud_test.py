"""서버 저장(cloud.js) 모의 테스트: Supabase 응답을 가짜로 만들어 로그인 → 올리기 → 충돌 흐름을 확인한다. 실행: python3 tests/cloud_test.py"""
import functools, http.server, json, os, threading, sys
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT))
sv.RequestHandlerClass.log_message = lambda *a: None
threading.Thread(target=sv.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{sv.server_port}/index.html'
fails = []
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
        res = r.fetch(); r.fulfill(response=res, body=res.text() + "\nCLOUD.url='https://x.supabase.co';CLOUD.key='k';")
    pg.route('**/js/cloud.js', patch)
    pg.goto(URL); pg.wait_for_timeout(500)
    pg.evaluate("document.querySelector('#tutorial').classList.add('hidden')")
    ok = pg.evaluate("typeof Cloud!=='undefined'&&Cloud.enabled")
    check('cloud_enabled_by_config', ok)
    pg.evaluate("openSettings()"); pg.wait_for_timeout(100)
    check('settings_shows_login_group', pg.locator('#clId').count() == 1)
    pg.fill('#clId', 'tester1'); pg.fill('#clPw', 'wrong-pass'); pg.click('[data-act="cloud-login"]'); pg.wait_for_timeout(300)
    check('bad_login_rejected', pg.evaluate("Cloud.user()") is None)
    pg.fill('#clPw', 'good-pass-123'); pg.click('[data-act="cloud-login"]'); pg.wait_for_timeout(500)
    check('login_uploads_local_when_server_empty', pg.evaluate("Cloud.user()") == 'tester1' and server['rev'] == 1 and server['data'] is not None, server['rev'])
    pg.evaluate("openSettings()"); pg.wait_for_timeout(100)
    check('settings_shows_logged_in', pg.locator('[data-act="cloud-push"]').count() == 1)
    pg.evaluate("state.money=777;save()"); pg.click('[data-act="cloud-push"]'); pg.wait_for_timeout(300)
    check('manual_push_bumps_rev', server['rev'] == 2 and server['data']['money'] == 777)
    server['rev'] = 5  # 다른 기기가 먼저 저장
    pg.evaluate("openSettings()"); pg.click('[data-act="cloud-push"]'); pg.wait_for_timeout(300)
    check('conflict_blocks_push', server['rev'] == 5 and pg.evaluate("_cloudBlocked") is True)
    server['data']['money'] = 4242
    pg.evaluate("openSettings()"); pg.click('[data-act="cloud-pull"]'); pg.wait_for_timeout(800)
    check('pull_replaces_local_and_reloads', pg.evaluate("state.money") == 4242, pg.evaluate("state.money"))
    pg.evaluate("Cloud.logout()"); check('logout_clears_session', pg.evaluate("Cloud.user()") is None)
    b.close()
print('FAILED' if fails else 'ALL OK', fails)
sys.exit(1 if fails else 0)
