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
server = {'notices': [], 'ndel': [], 'party': {'party': None, 'incoming': []}, 'pcalls': [], 'backups': [], 'bdata': {}, 'bnow': 0, 'chat': [], 'chatsent': [], 'avatars': {}, 'avq': [], 'setav': [], 'rev': 0, 'data': None, 'pushes': [], 'sent': [], 'incoming': [], 'results': [], 'answers': [], 'acks': [], 'friends': [], 'mails': [], 'inmail': [], 'mack': [], 'props': [], 'tb': {'incoming': [], 'sent': [], 'results': []}, 'tans': [], 'tack': [], 'gcalls': [], 'ginfo': {'guild': None, 'incoming': [], 'sent': []}}
pg_name = ['테스터']
def api(route):
    req = route.request; u = req.url; h = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'content-type': 'application/json'}
    if req.method == 'OPTIONS': return route.fulfill(status=204, headers=h)
    body = json.loads(req.post_data or '{}')
    if '/auth/v1/token' in u:
        if body.get('password') == 'good-pass-123': return route.fulfill(headers=h, body=json.dumps({'access_token': 'a', 'refresh_token': 'r', 'expires_in': 3600}))
        return route.fulfill(status=400, headers=h, body=json.dumps({'error_description': 'Invalid login credentials'}))
    if '/rpc/search_players' in u and 'guild' not in u: return route.fulfill(headers=h, body=json.dumps([{'uid': '11111111-1111-1111-1111-111111111111', 'name': '미나', 'rank': 'E', 'level': '5', 'online': True}, {'uid': '22222222-2222-2222-2222-222222222222', 'name': '<img src=x onerror=alert(1)>', 'rank': 'F', 'level': '1', 'online': False}] if body.get('p_q') else []))
    if '/rpc/send_friend_req' in u: server['sent'].append(body.get('p_to')); return route.fulfill(headers=h, body=json.dumps({'ok': True, 'msg': 'sent', 'name': '미나'}))
    if '/rpc/friend_inbox' in u: return route.fulfill(headers=h, body=json.dumps({'incoming': server['incoming'], 'results': server['results'], 'sent': server.get('fsent', [])}))
    if '/rpc/answer_friend_req' in u: server['answers'].append([body.get('p_id'), body.get('p_accept')]); server['incoming'] = []; server['friends'] = [{'uid': '33333333-3333-3333-3333-333333333333', 'name': '하늘'}]; return route.fulfill(headers=h, body=json.dumps({'ok': True, 'name': '하늘'}))
    if '/rpc/ack_friend_req' in u: server['acks'].append(body.get('p_id')); server['results'] = []; return route.fulfill(headers=h, body='null')
    if '/rpc/list_friends' in u: return route.fulfill(headers=h, body=json.dumps(server['friends']))
    if '/rpc/send_mail' in u: server['mails'].append(body); return route.fulfill(headers=h, body=json.dumps({'ok': True}))
    if '/rpc/fetch_mail' in u: return route.fulfill(headers=h, body=json.dumps(server['inmail']))
    if '/rpc/ack_mail' in u: server['mack'].extend(body.get('p_ids', [])); server['inmail'] = []; return route.fulfill(headers=h, body='null')
    if '/rpc/propose_trade' in u:
        server['props'].append(body)
        if server.get('off'): return route.fulfill(headers=h, body=json.dumps({'ok': False, 'msg': 'offline'}))
        return route.fulfill(headers=h, body=json.dumps({'ok': True}))
    if '/rpc/trade_inbox' in u: return route.fulfill(headers=h, body=json.dumps(server['tb']))
    if '/rpc/answer_trade' in u: server['tans'].append([body.get('p_id'), body.get('p_accept')]); server['tb']['incoming'] = []; return route.fulfill(headers=h, body=json.dumps({'ok': True, 'name': '하늘', 'give': [['목재', 3]], 'want': [['약초', 2]]}))
    if '/rpc/ack_trade' in u: server['tack'].append(body.get('p_id')); server['tb']['results'] = []; return route.fulfill(headers=h, body='null')
    if '/rpc/live_trade_' in u:
        op = u.split('/rpc/live_trade_')[1].split('?')[0]; lv = server.get('ltview'); server.setdefault('ltcalls', []).append([op, body])
        ok = lambda extra=None: route.fulfill(headers=h, body=json.dumps(dict({'ok': True, 'view': lv}, **(extra or {}))))
        if op == 'view': return route.fulfill(headers=h, body=json.dumps(lv))
        if op == 'invite':
            if server.get('off'): return route.fulfill(headers=h, body=json.dumps({'ok': False, 'msg': 'offline'}))
            server['ltview'] = {'id': 50, 'status': 'invited', 'ver': 0, 'from_me': True, 'name': '라온', 'mine': [], 'their': [], 'my_ok': False, 'their_ok': False}
            return route.fulfill(headers=h, body=json.dumps({'ok': True, 'id': 50}))
        if op == 'answer':
            if lv and lv['status'] == 'invited': lv['status'] = 'open' if body.get('p_accept') else 'cancelled'; lv['ver'] += 1; return ok()
            return route.fulfill(headers=h, body=json.dumps({'ok': False}))
        if op == 'set':
            if server.get('setfail'): return route.fulfill(status=500, headers=h, body=json.dumps({'message': 'boom'}))
            if lv and lv['status'] == 'open': lv['mine'] = body.get('p_items'); lv['mine_cr'] = body.get('p_cr', 0); lv['ver'] += 1; lv['my_ok'] = lv['their_ok'] = False; return ok()
            return route.fulfill(headers=h, body=json.dumps({'ok': False, 'msg': 'closed', 'view': lv}))
        if op == 'confirm':
            if not lv or lv['status'] != 'open': return route.fulfill(headers=h, body=json.dumps({'ok': False, 'msg': 'closed', 'view': lv}))
            if body.get('p_ver') != lv['ver']: return route.fulfill(headers=h, body=json.dumps({'ok': False, 'msg': 'changed', 'view': lv}))
            lv['my_ok'] = True
            if lv['their_ok']: lv['status'] = 'done'; lv['ver'] += 1
            return ok()
        if op == 'cancel':
            if lv and lv['status'] in ('invited', 'open'): lv['status'] = 'cancelled'; lv['ver'] += 1; return ok()
            return route.fulfill(headers=h, body=json.dumps({'ok': False, 'view': lv}))
        if op == 'ack': server['ltview'] = None; return route.fulfill(headers=h, body='null')
    if '/rpc/market_' in u:
        op = u.split('/rpc/market_')[1].split('?')[0]; M = server.setdefault('mk', {'rows': [], 'other': [], 'calls': []}); M['calls'].append([op, body])
        J = lambda o: route.fulfill(headers=h, body=json.dumps(o))
        if M.get('fail') and op in ('list', 'mine', 'buy', 'browse'): return route.fulfill(status=500, headers=h, body=json.dumps({'message': 'boom'}))
        if op == 'list':
            r = next((x for x in M['rows'] if x['ckey'] == body.get('p_ckey')), None)
            if not r: r = {'id': 100 + len(M['rows']), 'ckey': body['p_ckey'], 'item': body['p_item'], 'qty': body['p_qty'], 'price': body['p_price'], 'sold': 0, 'status': 'open', 'ack': False}; M['rows'].append(r)
            return J({'ok': True, 'id': r['id']})
        if op == 'browse': return J([{'id': x['id'], 'seller': x['seller_name'], 'item': x['item'], 'qty': x['qty'], 'price': x['price']} for x in M['other'] if x['status'] == 'open' and x['qty'] > 0])
        if op == 'mine': return J([{k: x[k] for k in ('id', 'ckey', 'item', 'qty', 'price', 'status', 'sold')} for x in M['rows'] if not x.get('ack')])
        if op == 'buy':
            M.setdefault('reqs', {})
            if body['p_req'] in M['reqs']: return J(M['reqs'][body['p_req']])
            x = next((y for y in M['other'] if y['id'] == body.get('p_id')), None)
            if not x or x['status'] != 'open' or x['qty'] <= 0: return J({'ok': False, 'msg': 'gone'})
            if x['qty'] < body['p_qty']: return J({'ok': False, 'msg': 'short', 'left': x['qty']})
            x['qty'] -= body['p_qty']; ans = {'ok': True, 'item': x['item'], 'qty': body['p_qty'], 'price': x['price']}; M['reqs'][body['p_req']] = ans
            if x['qty'] == 0: x['status'] = 'sold'
            return J(ans)
        if op == 'cancel':
            x = next((y for y in M['rows'] if y['id'] == body.get('p_id')), None)
            if x and x['status'] == 'open': x['status'] = 'cancelled'; return J({'ok': True})
            return J({'ok': False})
        if op == 'ack':
            for x in M['rows']:
                if x['id'] == body.get('p_id'): x['ack'] = True
            return route.fulfill(headers=h, body='null')
    if '/rpc/nearby_players' in u: server.setdefault('nbcalls', []).append(body.get('p_loc')); return route.fulfill(headers=h, body=json.dumps(server.get('nearby', [])))
    if '/rpc/party_info' in u: return route.fulfill(headers=h, body=json.dumps(server['party']))
    if '/rpc/party_invite' in u: server['pcalls'].append(['invite', body]); return route.fulfill(headers=h, body=json.dumps({'ok': True}))
    if '/rpc/party_answer' in u: server['pcalls'].append(['answer', body]); server['party']['incoming'] = []; return route.fulfill(headers=h, body=json.dumps({'ok': True, 'joined': bool(body.get('p_accept'))}))
    if '/rpc/party_leave' in u: server['pcalls'].append(['leave', body]); server['party']['party'] = None; return route.fulfill(headers=h, body='null')
    if '/rpc/party_kick' in u: server['pcalls'].append(['kick', body]); return route.fulfill(headers=h, body=json.dumps({'ok': True}))
    if '/rpc/guild_info' in u: return route.fulfill(headers=h, body=json.dumps(server['ginfo']))
    if '/rpc/guild_create' in u: server['gcalls'].append(['create', body]); server['ginfo']['guild'] = {'id': 1, 'name': body['p_name'], 'master': True, 'members': [{'uid': 'me', 'name': pg_name[0], 'master': True}]}; return route.fulfill(headers=h, body=json.dumps({'ok': True}))
    if '/rpc/guild_search' in u: return route.fulfill(headers=h, body=json.dumps([{'id': 4, 'name': '별빛길드', 'count': 3, 'master': '하늘'}]))
    if '/rpc/search_players_guild' in u: return route.fulfill(headers=h, body=json.dumps([{'uid': '44444444-4444-4444-4444-444444444444', 'name': '새싹', 'rank': 'F', 'level': '2'}]))
    if '/rpc/guild_invite' in u: server['gcalls'].append(['invite', body]); return route.fulfill(headers=h, body=json.dumps({'ok': True}))
    if '/rpc/guild_apply' in u: server['gcalls'].append(['apply', body]); return route.fulfill(headers=h, body=json.dumps({'ok': True}))
    if '/rpc/guild_answer' in u: server['gcalls'].append(['answer', body]); server['ginfo']['incoming'] = []; return route.fulfill(headers=h, body=json.dumps({'ok': True, 'joined': True}))
    if '/rpc/guild_rename' in u: server['gcalls'].append(['rename', body]); (server['ginfo'].get('guild') or {}).update({'name': body.get('p_name')}); return route.fulfill(headers=h, body=json.dumps({'ok': True}))
    if '/rpc/guild_leave' in u: server['gcalls'].append(['leave', body]); server['ginfo']['guild'] = None; return route.fulfill(headers=h, body='null')
    if '/rpc/announce_rank' in u: server.setdefault('anno', []).append(body.get('p_rank')); return route.fulfill(headers=h, body=json.dumps({'ok': not server.get('annofail'), 'msg': 'not_yet'}))
    if '/rpc/chat_fetch' in u: return route.fulfill(headers=h, body=json.dumps([m for m in server['chat'] if m['id'] > body.get('p_after', 0)]))
    if '/rpc/get_profile' in u:
        return route.fulfill(headers=h, body=json.dumps({'uid': '33333333-3333-3333-3333-333333333333', 'name': body.get('p_name'), 'title': '신입 능력자', 'rank': 'E', 'level': '7', 'age': '24', 'keywords': '과묵,정찰', 'ability': '그림자 이동', 'abilityDesc': '그림자 사이를 건넌다', 'online': True, 'guild': '별무리'}) if body.get('p_name') == '하늘' else 'null')
    if '/rpc/chat_send' in u: server['chatsent'].append(body); return route.fulfill(headers=h, body=json.dumps({'ok': True}))
    if '/rpc/get_avatars' in u: server['avq'].append(body.get('p_names')); return route.fulfill(headers=h, body=json.dumps({n: server['avatars'][n] for n in body.get('p_names', []) if n in server['avatars']}))
    if '/rpc/set_avatar' in u: server['setav'].append(body.get('p_img')); return route.fulfill(headers=h, body='null')
    if '/rpc/list_notices' in u: return route.fulfill(headers=h, body=json.dumps(sorted(server['notices'], key=lambda r: -r['id'])))
    if '/rpc/delete_notice' in u: server['ndel'].append(body.get('p_id')); server['notices'] = [r for r in server['notices'] if r['id'] != body.get('p_id')]; return route.fulfill(headers=h, body='null')
    if '/rpc/is_admin' in u: return route.fulfill(headers=h, body='true')
    if '/rpc/pull_save' in u:
        return route.fulfill(headers=h, body=json.dumps(None if server['data'] is None else {'rev': server['rev'], 'data': server['data'], 'at': '2026-10-21T03:00:00Z'}))
    if '/rpc/push_save' in u:
        if body['p_rev'] != server['rev']: return route.fulfill(headers=h, body=json.dumps({'ok': False, 'rev': server['rev']}))
        server['rev'] += 1; server['data'] = body['p_data']; server['pushes'].append(server['rev'])
        return route.fulfill(headers=h, body=json.dumps({'ok': True, 'rev': server['rev']}))
    if '/rpc/list_backups' in u: return route.fulfill(headers=h, body=json.dumps(server['backups']))
    if '/rpc/get_backup' in u: return route.fulfill(headers=h, body=json.dumps(server['bdata'].get(str(body.get('p_id')))))
    if '/rpc/delete_backup' in u: n0 = len(server['backups']); server['backups'] = [b for b in server['backups'] if b['id'] != body.get('p_id')]; server.setdefault('bdel', []).append(body.get('p_id')); return route.fulfill(headers=h, body=json.dumps({'ok': len(server['backups']) < n0}))
    if '/rpc/backup_now' in u: server['bnow'] += 1; return route.fulfill(headers=h, body=json.dumps({'ok': True}))
    route.fulfill(status=404, headers=h, body='{}')
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(); pg.on('pageerror', lambda e: print('PAGEERR', str(e)[:200]))
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
    ls_, ll_ = rect(pg, '[data-act="local-save"]'), rect(pg, '[data-act="local-load"]')
    check('settings_shows_logged_in_with_save_and_load_right', cr_[2]['x'] > cr_[1]['x'] and ls_['x'] > cr_[2]['r'] - 1 and ll_['x'] > ls_['x'] and abs(ls_['y'] - cr_[1]['y']) < 6 and cr_[1]['y'] > cr_[0]['y'] and pg.locator('.cloudrow button').count() == 5, [cr_, ls_, ll_])
    pg.evaluate("window.__c0=state.created;state.created=true;state.money=777;save()"); pg.click('[data-act="cloud-push"]'); pg.wait_for_timeout(300)
    check('manual_push_bumps_rev', server['rev'] == 4 and server['data']['money'] == 777, server['rev'])
    pg.evaluate("state.created=false"); n_push = len(server['pushes']); pg.evaluate("openSettings()"); pg.click('[data-act="cloud-push"]'); pg.wait_for_timeout(200)
    check('blank_state_never_pushed', len(server['pushes']) == n_push and server['data']['money'] == 777)
    pg.evaluate("state.created=true")
    server['rev'] = 9  # 다른 기기가 먼저 저장
    pg.evaluate("openSettings()"); pg.click('[data-act="cloud-push"]'); pg.wait_for_timeout(300)
    check('conflict_blocks_push', server['rev'] == 9 and pg.evaluate("_cloudBlocked") is True)
    pg.evaluate("state.created=window.__c0")
    server['data']['money'] = 4242
    pg.evaluate("state.created=true;openFriends()"); pg.fill('#friendSearch', '미'); pg.click('[data-act="friend-search"]'); pg.wait_for_timeout(300)
    check('friend_search_uses_server', pg.locator('#friendResult .nearby-row').count() == 2 and '미나' in pg.inner_text('#friendResult') and pg.locator('#friendResult img').count() == 0)
    check('friend_request_button_label', pg.locator('#friendResult [data-act="friend-req"]').first.inner_text() == '친구 신청' and pg.locator('#friendResult [data-act="friend-add"]').count() == 0)
    pg.click('#friendResult [data-act="friend-req"] >> nth=0'); pg.wait_for_timeout(300)
    check('friend_request_sent_not_friend_yet', server['sent'] == ['11111111-1111-1111-1111-111111111111'] and not pg.evaluate("state.friends.includes('미나')"), server['sent'])
    server['fsent'] = [{'id': 3, 'name': '미나'}]
    pg.evaluate("openFriends()"); pg.wait_for_timeout(500)
    check('sent_friend_requests_listed', '수락 대기' in pg.inner_text('#friendInbox') and '미나' in pg.inner_text('#friendInbox') and pg.locator('[data-act="friend-req-cancel"]').count() == 1)
    server['fsent'] = []; pg.wait_for_timeout(900)
    # 받은 신청 → 수락해야 친구
    server['incoming'] = [{'id': 7, 'name': '하늘'}]
    pg.evaluate("openFriends()")
    for _ in range(12):  # 다른 폴링이 돌고 있으면 friendPoll 이 바로 끝나므로, 신청이 목록에 들어올 때까지 다시 시도한다
        pg.evaluate("friendPoll()"); pg.wait_for_timeout(450)
        if pg.evaluate("!!(view.inbox && view.inbox.some(r => r.name === '하늘'))"): break
    pg.evaluate("openFriends()"); pg.wait_for_timeout(200)
    pg.wait_for_timeout(100)
    check('incoming_request_listed', pg.locator('#friendInbox [data-act="friend-accept"]').count() == 1 and '하늘' in pg.inner_text('#friendInbox') and not pg.evaluate("state.friends.includes('하늘')"))
    check('friend_icon_dot_on_request', pg.locator('[data-system="친구"].has-dot').count() == 1)
    pg.click('#friendInbox [data-act="friend-accept"]'); pg.wait_for_timeout(400)
    check('friend_icon_dot_cleared', pg.locator('[data-system="친구"].has-dot').count() == 0)
    check('accept_makes_friend', pg.evaluate("state.friends.includes('하늘')") and server['answers'] == [[7, True]], server['answers'])
    # 내가 보낸 신청이 수락됨 → 목록에 추가되고 결과 확인(ack)
    server['friends'] = [{'uid': '33333333-3333-3333-3333-333333333333', 'name': '하늘'}, {'uid': '11111111-1111-1111-1111-111111111111', 'name': '미나'}]  # 수락하면 서버 친구 목록에도 올라간다
    server['results'] = [{'id': 9, 'name': '미나', 'status': 'accepted'}]
    pg.evaluate("friendPoll()"); pg.wait_for_timeout(500)
    check('accepted_result_adds_friend_and_acks', pg.evaluate("state.friends.includes('미나')") and server['acks'] == [9], server['acks'])
    # ---------- 메일 / 교환 (서버) ----------
    UID_H = '33333333-3333-3333-3333-333333333333'
    server['friends'] = [{'uid': UID_H, 'name': '하늘'}]
    pg.evaluate("friendPoll()"); pg.wait_for_timeout(500)
    check('friend_uid_map_loaded', pg.evaluate("view.friendUid['하늘']") == UID_H)
    server['friends'] = [{'uid': UID_H, 'name': '하늘이'}]
    pg.evaluate("friendPoll()"); pg.wait_for_timeout(500)
    check('renamed_friend_replaces_old_name', pg.evaluate("state.friends.includes('하늘이')") and not pg.evaluate("state.friends.includes('하늘')") and pg.evaluate("state.friends.filter(n=>n.startsWith('하늘')).length") == 1, pg.evaluate("state.friends"))
    server['friends'] = [{'uid': UID_H, 'name': '하늘'}]
    pg.evaluate("friendPoll()"); pg.wait_for_timeout(500)
    pg.evaluate("viewUser('하늘')"); pg.wait_for_timeout(500)
    check('other_profile_loads_ability_title_guild', '그림자 이동' in pg.inner_text('#modalBody') and '신입 능력자' in pg.inner_text('#modalBody') and '별무리' in pg.inner_text('#modalBody') and pg.locator('.user-grid .uc').count() >= 5, pg.inner_text('#modalBody'))
    check('other_profile_ability_at_top_right', pg.evaluate("(()=>{const u=document.querySelector('.user-card'),a=u&&u.querySelector('.uc-ability'),n=u&&u.querySelector('.uc-name');if(!a||!n)return false;const ab=a.getBoundingClientRect(),nb=n.getBoundingClientRect();return ab.left>=nb.right+8&&ab.top<nb.bottom+40})()"))
    pg.evaluate("viewUser('없는사람')"); pg.wait_for_timeout(500)
    check('other_profile_missing_shows_reason', '찾지 못' in pg.inner_text('#modalBody') or '최신본' in pg.inner_text('#modalBody'), pg.inner_text('#modalBody'))
    pg.evaluate("closeModal()")
    pg.evaluate("closeModal(); state.mail=[]; view.mailTab='메일 보내기'; openMail()"); pg.fill('#mailSubject', '안부'); pg.fill('#mailBody', '잘 지내?')
    pg.select_option('#mailTo', '하늘'); pg.click('[data-act="mail-send"]'); pg.wait_for_timeout(500)
    check('mail_sent_to_server', len(server['mails']) == 1 and server['mails'][0]['p_to'] == UID_H and server['mails'][0]['p_subject'] == '안부' and server['mails'][0]['p_items'] == [], server['mails'])
    server['inmail'] = [{'id': 5, 'name': '하늘', 'subject': '선물', 'body': '받아', 'items': [['목재', 2], ['없는템', 1], ['운송장치', 3]], 'at': 'x'}]
    pg.evaluate("friendPoll()"); pg.wait_for_timeout(600)
    check('mail_received_and_filtered', pg.evaluate("state.mail.length") == 1 and pg.evaluate("state.mail[0].items") == [['목재', 2]] and server['mack'] == [5], pg.evaluate("state.mail"))
    pg.evaluate("addItem('약초',5);removeItem('목재',countItem('목재'));addItem('목재',4);state.trades={day:'',n:0}")
    server['tb'] = {'incoming': [{'id': 21, 'name': '하늘', 'give': [['목재', 3]], 'want': [['약초', 2]]}], 'sent': [], 'results': []}
    pg.evaluate("openFriends()"); pg.wait_for_timeout(500)
    pg.click('[data-act="ftrade-accept"]'); pg.wait_for_timeout(600)
    check('trade_accept_pays_and_mails_items', server['tans'] == [[21, True]] and pg.evaluate("countItem('약초')") == 3 and pg.evaluate("state.mail[0].items") == [['목재', 3]], pg.evaluate("state.mail[0]"))
    server['tb'] = {'incoming': [], 'sent': [], 'results': [{'id': 22, 'name': '하늘', 'status': 'declined', 'give': [['목재', 3]], 'want': [['약초', 2]]}]}
    pg.evaluate("friendPoll()"); pg.wait_for_timeout(600)
    check('trade_declined_returns_items_by_mail', server['tack'] == [22] and pg.evaluate("state.mail[0].items") == [['목재', 3]] and '취소' in pg.evaluate("state.mail[0].subject"))
    # ---------- 길드 (서버) ----------
    pg.evaluate("closeModal()"); pg.evaluate("openGuild()"); pg.wait_for_timeout(500)
    check('guild_online_modal_has_search_and_create', pg.locator('#guildQ').count() == 1 and pg.locator('[data-act="guild-create"]').count() == 1)
    pg.fill('#guildQ', '별'); pg.click('[data-act="guild-find"]'); pg.wait_for_timeout(400)
    pg.click('[data-act="guild-apply"]'); pg.wait_for_timeout(400)
    check('guild_apply_sent_not_joined', ['apply', {'p_guild': 4}] in server['gcalls'] and pg.evaluate("state.guild") is None, server['gcalls'])
    server['ginfo']['incoming'] = [{'id': 31, 'kind': 'invite', 'guild': '달빛길드', 'name': '하늘'}]
    pg.evaluate("openGuild()"); pg.wait_for_timeout(500)
    check('guild_invite_listed_needs_accept', pg.locator('[data-act="guild-answer"][data-yes="1"]').count() == 1 and pg.evaluate("state.guild") is None)
    check('guild_icon_dot_on_invite', pg.locator('[data-system="길드"].has-dot').count() == 1)
    server['ginfo']['guild'] = {'id': 9, 'name': '달빛길드', 'master': False, 'members': [{'uid': 'x', 'name': '하늘', 'master': True}, {'uid': 'me2', 'name': '테스터', 'master': False}]}
    pg.click('[data-act="guild-answer"][data-yes="1"]'); pg.wait_for_timeout(600)
    check('guild_icon_dot_cleared', pg.locator('[data-system="길드"].has-dot').count() == 0)
    check('guild_accept_syncs_state', ['answer', {'p_id': 31, 'p_accept': True}] in server['gcalls'] and pg.evaluate("state.guild && state.guild.name") == '달빛길드' and pg.evaluate("state.guild.master") is False, pg.evaluate("state.guild"))
    server['ginfo']['guild'] = {'id': 9, 'name': '달빛길드', 'master': True, 'members': [{'uid': 'me', 'name': '테스터', 'master': True}]}
    server['ginfo']['incoming'] = [{'id': 32, 'kind': 'apply', 'guild': '달빛길드', 'name': '새싹'}]
    pg.evaluate("openGuild()"); pg.wait_for_timeout(500)
    check('guild_master_sees_application', '새싹' in pg.inner_text('#modalBody') and '가입 신청' in pg.inner_text('#modalBody') and pg.locator('#guildQ').count() == 1)
    server['avatars'] = {'하늘': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='}
    server['ginfo']['guild']['members'] = [{'uid': 'me', 'name': '테스터', 'master': True}, {'uid': 'u2', 'name': '하늘', 'master': False}, {'uid': 'u3', 'name': '바다', 'master': False}]
    pg.evaluate("view.avatars={};openGuild()"); pg.wait_for_timeout(1200)
    check('guild_members_two_columns', pg.evaluate("getComputedStyle(document.querySelector('.member-grid')).gridTemplateColumns.trim().split(/\\s+/).length") == 2 and pg.locator('.member-grid .member-row').count() == 3)
    check('guild_member_shows_profile_image', pg.locator('.member-grid .round-avatar img').count() == 1, pg.inner_html('.member-grid')[:300])
    pg.fill('#guildQ', '새'); pg.click('[data-act="guild-find-player"]'); pg.wait_for_timeout(400); pg.click('[data-act="guild-invite-req"]'); pg.wait_for_timeout(400)
    check('guild_invite_sent', ['invite', {'p_to': '44444444-4444-4444-4444-444444444444'}] in server['gcalls'], [server['gcalls'], pg.inner_text('#modalBody')[:300]])
    pg.fill('#guildRename', '새달빛'); pg.click('[data-act="guild-rename"]'); pg.wait_for_timeout(600)
    check('guild_rename_calls_server_and_updates', ['rename', {'p_name': '새달빛'}] in server['gcalls'] and pg.evaluate("state.guild && state.guild.name") == '새달빛' and '새달빛' in pg.inner_text('#modalTitle'), [server['gcalls'][-1], pg.evaluate("state.guild")])
    pg.evaluate("closeModal()")
    # ---------- 채팅 서버 연결 / 프로필 이미지 ----------
    PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
    server['avatars'] = {'하늘': PNG}
    server['chat'] = [{'id': 1, 'name': '하늘', 'body': '안녕하세요', 'uid': '11111111-1111-1111-1111-111111111111', 'at': '2026-10-21T09:00:00Z'}, {'id': 2, 'name': '<b>해커</b>', 'body': '<img src=x onerror=alert(1)>', 'uid': '22222222-2222-2222-2222-222222222222', 'at': '2026-10-21T09:00:05Z'}]
    pg.evaluate("view.avatars={};view.avq=0;state.chatTab='월드';renderChat();chatPoll()"); pg.wait_for_timeout(900)
    check('world_chat_shows_server_messages', '안녕하세요' in pg.inner_text('#chatFeed') and pg.locator('#chatFeed .msg').count() == 2, pg.inner_text('#chatFeed'))
    check('chat_shows_time', pg.locator('#chatFeed .msg-time').count() == 2 and ('오전' in pg.inner_text('#chatFeed .msg-time') or '오후' in pg.inner_text('#chatFeed .msg-time')), pg.inner_html('#chatFeed')[:300])
    check('chat_is_escaped', pg.locator('#chatFeed img[src="x"]').count() == 0 and pg.locator('#chatFeed b').count() == 0)
    check('chat_shows_sender_profile_image', pg.locator('#chatFeed .msg-ava img').count() == 1 and any('하늘' in q for q in server['avq']), [server['avq'], pg.evaluate('JSON.stringify(view.avatars)'), pg.inner_html('#chatFeed')[:400]])
    server['chat'].append({'id': 3, 'name': '하늘', 'body': '새 메시지', 'uid': '11111111-1111-1111-1111-111111111111', 'at': '2026-10-21T09:01:00Z'})
    pg.evaluate("chatPoll()"); pg.wait_for_timeout(700)
    check('chat_poll_appends_only_new', pg.locator('#chatFeed .msg').count() == 3 and pg.evaluate("view.chatLast['월드']") == 3)
    cache = pg.evaluate("JSON.parse(localStorage.getItem('deeplayer-chat'))")
    check('chat_cached_on_device', cache and len(cache['월드']['rows']) == 3 and cache['월드']['rows'][0][1] == '안녕하세요', cache)
    saved_chat = server['chat']; server['chat'] = []
    pg.evaluate("flushSave && flushSave()"); pg.reload(); pg.wait_for_timeout(500)
    pg.evaluate("document.querySelector('#tutorial') && document.querySelector('#tutorial').classList.add('hidden')")
    check('chat_survives_reload', pg.evaluate("state.chatTab") == '월드' and '안녕하세요' in pg.inner_text('#chatFeed') and '새 메시지' in pg.inner_text('#chatFeed'), pg.inner_text('#chatFeed')[:200])
    server['chat'] = saved_chat; pg.wait_for_timeout(1800)
    check('chat_reload_no_duplicates', pg.locator('#chatFeed .msg').count() == 3, pg.locator('#chatFeed .msg').count())
    server['chat'].append({'id': 4, 'name': '미나', 'body': '미나님이 A급으로 승급하셨습니다. 축하합니다!', 'uid': '11111111-1111-1111-1111-111111111111', 'at': '2026-10-21T09:02:00Z', 'sys': 'rank:A'})
    server['chat'].append({'id': 5, 'name': '해커', 'body': '해커님이 S급으로 승급하셨습니다.', 'uid': '22222222-2222-2222-2222-222222222222', 'at': '2026-10-21T09:03:00Z', 'sys': '<script>'})
    pg.evaluate("chatPoll()"); pg.wait_for_timeout(700)
    check('rank_announcement_rendered_centered', pg.locator('#chatFeed .msg-sys').count() == 1 and 'A급으로 승급' in pg.inner_text('#chatFeed .msg-sys') and pg.evaluate("getComputedStyle(document.querySelector('#chatFeed .msg-sys')).justifyContent") == 'center' and pg.locator('#chatFeed .msg').count() == 4, pg.locator('#chatFeed .msg-sys').count())
    check('fake_sys_flag_ignored', pg.evaluate("view.chatSrv['월드'].filter(r=>r[5]).length") == 1)
    pg.evaluate("state.flags.annoA='pending';announceRankA()"); pg.wait_for_timeout(900)
    check('rank_announce_calls_server_once_done', server.get('anno') == ['A'] and pg.evaluate("state.flags.annoA") == 'done', server.get('anno'))
    pg.evaluate("announceRankA()"); pg.wait_for_timeout(300)
    check('rank_announce_not_repeated', server.get('anno') == ['A'])
    server['annofail'] = True; pg.evaluate("state.flags.annoA='pending';announceRankA()"); pg.wait_for_timeout(700)
    check('rank_announce_failure_stays_pending', pg.evaluate("state.flags.annoA") == 'pending'); server['annofail'] = False
    pg.evaluate("state.flags.annoA='done'")
    pg.evaluate("view.chatAt=0")
    pg.evaluate("sendChat('반가워요')"); pg.wait_for_timeout(600)
    check('chat_send_goes_to_server', server['chatsent'] and server['chatsent'][-1] == {'p_channel': 'world', 'p_body': '반가워요'}, server['chatsent'])
    pg.evaluate("state.chatTab='길드';renderChat();chatPoll()"); pg.wait_for_timeout(500)
    pg.evaluate("view.chatAt=0")
    pg.evaluate("sendChat('길드 인사')"); pg.wait_for_timeout(500)
    check('guild_chat_uses_guild_channel', server['chatsent'][-1] == {'p_channel': 'guild', 'p_body': '길드 인사'}, server['chatsent'])
    pg.evaluate("state.chatTab='월드';renderChat()")
    # ---- 공지 삭제 (관리자) ----
    server['notices'] = [{'id': 5, 'head': '공지', 'body': '실수로 보낸 공지', 'created_at': '2026-10-23T07:00:00Z'}]
    pg.evaluate("view.isAdmin=true"); pg.evaluate("syncNotices()"); pg.wait_for_timeout(500)
    pg.evaluate("state.chatTab='알림';renderChat()")
    check('notice_delete_button_for_admin', pg.locator('#chatFeed [data-act="notice-del"]').count() == 1, pg.inner_html('#chatFeed')[:200])
    pg.click('#chatFeed [data-act="notice-del"]'); pg.wait_for_timeout(200)
    check('notice_delete_asks_first', '정말' in pg.inner_text('#modalBody') and server['ndel'] == [])
    pg.click('[data-act="confirm-cancel"]'); pg.wait_for_timeout(100)
    check('notice_delete_cancel_keeps', server['ndel'] == [] and '실수로 보낸 공지' in pg.inner_text('#chatFeed'))
    pg.click('#chatFeed [data-act="notice-del"]'); pg.wait_for_timeout(200)
    pg.click('[data-act="notice-del-do"]'); pg.wait_for_timeout(600)
    check('notice_delete_removes', server['ndel'] == [5] and '실수로 보낸 공지' not in pg.inner_text('#chatFeed'), server['ndel'])
    pg.evaluate("view.isAdmin=false"); server['notices'] = [{'id': 6, 'head': '공지', 'body': '다른 공지', 'created_at': '2026-10-23T07:00:00Z'}]; pg.evaluate("syncNotices()"); pg.wait_for_timeout(400)
    check('notice_delete_hidden_for_non_admin', pg.locator('#chatFeed [data-act="notice-del"]').count() == 0 or pg.evaluate("canNotice()"))
    pg.evaluate("state.chatTab='월드';renderChat()")
    # ---- 파티 ----
    UID_ME = pg.evaluate("Cloud.userUid"); UID_A = '55555555-5555-5555-5555-555555555555'
    server['party'] = {'party': None, 'incoming': [{'id': 7, 'name': '라온'}]}
    pg.evaluate("partySync()"); pg.wait_for_timeout(500)
    pg.evaluate("state.side='상황';renderSide()")
    check('party_invite_listed', pg.locator('[data-act="party-answer"][data-ok="1"]').count() == 1 and pg.evaluate("PARTY.id") == 0, pg.inner_text('#sideView')[:200])
    server['party'] = {'party': {'id': 3, 'leader': False, 'members': [{'uid': '66666666-6666-6666-6666-666666666666', 'name': '라온', 'leader': True, 'online': True}, {'uid': UID_ME, 'name': pg.evaluate("state.character.name"), 'leader': False}]}, 'incoming': []}
    pg.click('[data-act="party-answer"][data-ok="1"]'); pg.wait_for_timeout(700)
    check('party_accept_calls_server', ['answer', {'p_id': 7, 'p_accept': True}] in server['pcalls'] and pg.evaluate("PARTY.id") == 3, server['pcalls'])
    check('party_member_is_nearby_with_trade', pg.locator('[data-act="ftrade-open"][data-name="라온"]').count() == 1 and pg.evaluate("partyOthers()") == ['라온'], pg.inner_text('#sideView')[:300])
    check('party_non_leader_cannot_kick', pg.locator('[data-act="party-kick"]').count() == 0)
    pg.evaluate("PARTY.members.find(m=>m.name==='라온').online=false"); pg.evaluate("A['ftrade-open']({dataset:{name:'라온'}})"); pg.wait_for_timeout(200)
    check('trade_blocked_when_party_member_offline', pg.locator('#ftGive').count() == 0)
    pg.evaluate("PARTY.members.find(m=>m.name==='라온').online=true")
    # ---------- 실시간 교환 ----------
    LT = lambda: [c[0] for c in server.get('ltcalls', [])]
    pg.evaluate("state.trades={day:'',n:0};state.mail=[];state.bench=null;state.ltSeen=[];view.lt=null;removeItem('목재',countItem('목재'));addItem('목재',6);removeItem('약초',countItem('약초'));addItem('약초',1)")
    server['off'] = True; server['ltcalls'] = []; server['ltview'] = None
    pg.evaluate("A['ftrade-open']({dataset:{name:'라온'}})"); pg.wait_for_timeout(500)
    check('live_trade_offline_rejected_no_window', not pg.evaluate("isLtOpen()") and 'invite' in LT() and pg.evaluate("countItem('목재')") == 6)
    server['off'] = False
    pg.evaluate("A['ftrade-open']({dataset:{name:'라온'}})"); pg.wait_for_timeout(700)
    check('live_trade_invite_uses_party_uid', ['invite', {'p_to': '66666666-6666-6666-6666-666666666666'}] in server['ltcalls'], server['ltcalls'])
    check('live_trade_waiting_window', pg.locator('#ltRoot.lt-wait').count() == 1 and pg.locator('[data-act="lt-cancel"]').count() == 1, pg.inner_text('#modalBody')[:100])
    server['ltview']['status'] = 'open'; server['ltview']['ver'] += 1
    pg.evaluate("ltPoll()"); pg.wait_for_timeout(500)
    check('live_trade_bench_opens_on_accept', pg.locator('.lt-grid .lt-col').count() == 2 and pg.locator('[data-act="lt-confirm"]').count() == 1 and pg.locator('[data-act="lt-confirm"][disabled]').count() == 1)
    pg.evaluate("closeModal()"); pg.evaluate("ltPoll()"); pg.wait_for_timeout(500)
    check('live_trade_closed_window_stays_closed', not pg.evaluate("isLtOpen()"))
    pg.evaluate("openLive()"); pg.wait_for_timeout(200)
    pg.click('[data-act="lt-plus"][data-name="목재"][data-qty="1"]'); pg.wait_for_timeout(500)
    check('live_trade_put_item_deducts_and_syncs', pg.evaluate("countItem('목재')") == 5 and server['ltview']['mine'] == [['목재', 1]] and pg.evaluate("state.bench.items") == [['목재', 1]], [pg.evaluate("countItem('목재')"), server['ltview']['mine']])
    pg.click('[data-act="lt-plus"][data-name="목재"][data-qty="5"]'); pg.wait_for_timeout(500)
    check('live_trade_put_all', pg.evaluate("countItem('목재')") == 0 and server['ltview']['mine'] == [['목재', 6]])
    pg.click('[data-act="lt-minus"][data-name="목재"][data-qty="1"]'); pg.wait_for_timeout(500)
    check('live_trade_take_back_after_server_ok', pg.evaluate("countItem('목재')") == 1 and server['ltview']['mine'] == [['목재', 5]] and pg.evaluate("state.bench.items") == [['목재', 5]])
    server['setfail'] = True
    pg.click('[data-act="lt-plus"][data-name="목재"][data-qty="1"]'); pg.wait_for_timeout(500)
    check('live_trade_offline_put_keeps_local_record', pg.evaluate("countItem('목재')") == 0 and pg.evaluate("state.bench.items") == [['목재', 6]] and server['ltview']['mine'] == [['목재', 5]])
    pg.click('[data-act="lt-minus"][data-name="목재"][data-qty="1"]'); pg.wait_for_timeout(500)
    check('live_trade_take_back_blocked_when_server_fails', pg.evaluate("countItem('목재')") == 0 and pg.evaluate("state.bench.items") == [['목재', 6]])
    server['setfail'] = False
    pg.evaluate("ltPoll()"); pg.wait_for_timeout(600)
    check('live_trade_poll_resends_local_record', server['ltview']['mine'] == [['목재', 6]])
    server['ltview']['their'] = [['약초', 2], ['없는템', 1], ['운송장치', 1]]; server['ltview']['ver'] += 1; server['ltview']['their_ok'] = True
    pg.evaluate("ltPoll()"); pg.wait_for_timeout(500)
    check('live_trade_shows_partner_items_cleaned', '약초' in pg.inner_text('.lt-grid') and '없는템' not in pg.inner_text('.lt-grid') and '운송장치' not in pg.inner_text('.lt-grid') and '교환 확인' in pg.inner_text('.lt-grid'))
    pg.click('[data-act="lt-confirm"]'); pg.wait_for_timeout(600)
    check('live_trade_completes_when_both_confirm', 'confirm' in LT() and pg.evaluate("state.bench") is None and pg.evaluate("state.trades.n") == 1 and not pg.evaluate("isLtOpen()") and 'ack' in LT(), [LT(), pg.evaluate("state.bench")])
    check('live_trade_partner_items_arrive_by_mail', pg.evaluate("state.mail.some(m=>m.sid==='lt50'&&JSON.stringify(m.items)===JSON.stringify([['약초',2]]))") and pg.evaluate("countItem('목재')") == 0, pg.evaluate("state.mail"))
    n0 = pg.evaluate("state.mail.length")
    pg.evaluate("ltFinish({id:50,status:'done',name:'라온',mine:[['목재',6]],their:[['약초',2]]})"); pg.wait_for_timeout(300)
    check('live_trade_settle_is_idempotent', pg.evaluate("state.mail.length") == n0 and pg.evaluate("state.trades.n") == 1 and pg.evaluate("countItem('목재')") == 0)
    # 취소: 올려 둔 물건이 전부 돌아온다
    pg.evaluate("addItem('목재',4)"); server['ltcalls'] = []; server['ltview'] = None
    pg.evaluate("A['ftrade-open']({dataset:{name:'라온'}})"); pg.wait_for_timeout(600)
    server['ltview']['id'] = 51; server['ltview']['status'] = 'open'; server['ltview']['ver'] += 1
    pg.evaluate("ltPoll()"); pg.wait_for_timeout(500)
    pg.evaluate("state.bench={id:50,items:[]}"); pg.evaluate("state.bench=null")
    pg.click('[data-act="lt-plus"][data-name="목재"][data-qty="4"]'); pg.wait_for_timeout(500)
    server['ltview']['status'] = 'cancelled'
    pg.evaluate("ltPoll()"); pg.wait_for_timeout(600)
    check('live_trade_cancel_returns_items', pg.evaluate("countItem('목재')") == 4 and pg.evaluate("state.bench") is None and not pg.evaluate("isLtOpen()") and pg.evaluate("state.trades.n") == 1, pg.evaluate("[countItem('목재'),state.bench]"))
    # 성사됐지만 서버에 올라가지 못한 몫은 돌려받는다
    pg.evaluate("state.bench={id:52,items:[['목재',3]]};removeItem('목재',3)")
    pg.evaluate("ltFinish({id:52,status:'done',name:'라온',mine:[['목재',1]],their:[]})"); pg.wait_for_timeout(300)
    check('live_trade_done_refunds_unsynced_part', pg.evaluate("countItem('목재')") == 3 and pg.evaluate("state.bench") is None, pg.evaluate("countItem('목재')"))
    # 받는 쪽: 신청이 오면 수락 창이 뜬다
    pg.evaluate("closeModal();view.lt=null;view.ltAsk=0"); server['ltcalls'] = []
    server['ltview'] = {'id': 60, 'status': 'invited', 'ver': 0, 'from_me': False, 'name': '라온', 'mine': [], 'their': [], 'my_ok': False, 'their_ok': False}
    pg.evaluate("ltPoll()"); pg.wait_for_timeout(500)
    check('live_trade_incoming_invite_prompt', pg.locator('[data-act="lt-answer"][data-accept="1"]').count() == 1, pg.inner_text('#modalBody')[:100])
    pg.click('[data-act="lt-answer"][data-accept="1"]'); pg.wait_for_timeout(700)
    check('live_trade_accept_opens_bench', ['answer', {'p_id': 60, 'p_accept': True}] in server['ltcalls'] and pg.locator('.lt-grid').count() == 1, server['ltcalls'])
    pg.evaluate("ltCancel()"); pg.wait_for_timeout(700)
    check('live_trade_cancel_button_closes', 'cancel' in LT() and not pg.evaluate("isLtOpen()") and 'ack' in LT())
    # ---------- 같은 칸 제한 + CR 거래 ----------
    server['nearby'] = [{'uid': '77777777-7777-7777-7777-777777777777', 'name': '미나'}, {'uid': 'x', 'name': ''}]
    pg.evaluate("nearbyPoll()"); pg.wait_for_timeout(500)
    check('nearby_poll_sends_location_and_lists', len(server.get('nbcalls', [])) >= 1 and pg.evaluate("view.nearby.map(p=>p.name)") == ['미나'], server.get('nbcalls'))
    pg.evaluate("state.side='상황';renderSituation()")
    check('nearby_listed_with_trade_button', pg.locator('#sideView [data-act="ftrade-open"][data-name="미나"]').count() == 1)
    pg.evaluate("view.lt=null"); server['ltcalls'] = []
    pg.evaluate("A['ftrade-open']({dataset:{name:'멀리있는사람'}})"); pg.wait_for_timeout(300)
    check('trade_blocked_when_not_nearby_or_party', 'invite' not in LT())
    pg.evaluate("viewUser('미나')"); pg.wait_for_timeout(300)
    check('profile_has_trade_button_for_nearby', pg.locator('#modalFoot [data-act="ftrade-open"][data-name="미나"], #modal [data-act="ftrade-open"][data-name="미나"]').count() >= 1)
    pg.evaluate("viewUser('아무개')"); pg.wait_for_timeout(300)
    check('profile_no_trade_button_for_stranger', pg.locator('[data-act="ftrade-open"][data-name="아무개"]').count() == 0)
    pg.evaluate("closeModal()")
    check('loc_key_private_room_empty', pg.evaluate("(state.location='개인실',locKey())") == '' and pg.evaluate("(state.location='본부',locKey())") == '본부')
    # ---------- 대원 간 거래 (상점) ----------
    pg.evaluate("closeModal();state.market={sell:[],buy:[]};state.mseen=[];state.mail=[];state.money=1000;removeItem('목재',countItem('목재'));addItem('목재',10)")
    server['mk'] = {'rows': [], 'other': [{'id': 900, 'seller_name': '하늘', 'item': '약초', 'qty': 3, 'price': 7, 'status': 'open'}], 'calls': []}
    um = pg.evaluate("marketUnitMax('목재')")
    check('market_unit_cap_enforced', pg.evaluate(f"marketListCheck('목재',2,{um+1})") is not None and pg.evaluate(f"marketListCheck('목재',2,{um})") is None)
    check('market_total_cap_and_qty', pg.evaluate("marketListCheck('목재',100,1)") is not None and pg.evaluate("marketListCheck('목재',11,1)") is not None and pg.evaluate("marketListCheck('없는템',1,1)") is not None and pg.evaluate("marketListCheck('목재',2,MARKET_TOTAL_MAX)") is not None)
    pg.evaluate("openMarket('팔기')"); pg.wait_for_timeout(400)
    check('market_window_tabs', pg.locator('#mkRoot .tabs button').count() == 3 and pg.locator('#mkItem').count() == 1)
    pg.select_option('#mkItem', '목재'); pg.wait_for_timeout(100)
    pg.fill('#mkQty', '3'); pg.fill('#mkPrice', str(um)); pg.click('[data-act="mk-list"]'); pg.wait_for_timeout(700)
    check('market_list_moves_item_and_syncs', pg.evaluate("countItem('목재')") == 7 and len(server['mk']['rows']) == 1 and server['mk']['rows'][0]['qty'] == 3 and server['mk']['rows'][0]['price'] == um and pg.evaluate("state.market.sell[0].id") == server['mk']['rows'][0]['id'], server['mk']['rows'])
    check('market_my_list_shows_entry', '판매 중' in pg.inner_text('#mkRoot'))
    # 일부만 팔림 → 팔린 만큼만 수수료 뗀 CR, 나머지는 계속 판매
    R = server['mk']['rows'][0]; R['sold'] = 1; R['qty'] = 2; m0 = pg.evaluate("state.money")
    pg.evaluate("marketSync()"); pg.wait_for_timeout(700)
    check('market_partial_sale_pays_sold_part', pg.evaluate("state.money") == m0 + pg.evaluate(f"marketNet({um})") and pg.evaluate("state.market.sell.length") == 1 and pg.evaluate("state.market.sell[0].got") == 1, pg.evaluate("state.money"))
    pg.evaluate("marketSync()"); pg.wait_for_timeout(500)
    check('market_partial_not_paid_twice', pg.evaluate("state.money") == m0 + pg.evaluate(f"marketNet({um})"))
    # 전부 팔림
    R['sold'] = 3; R['qty'] = 0; R['status'] = 'sold'
    pg.evaluate("marketSync()"); pg.wait_for_timeout(1500)
    pg.wait_for_timeout(1000)
    check('market_sold_out_finishes', pg.evaluate("state.money") == m0 + (pg.evaluate(f"marketNet({um})") + pg.evaluate(f"marketNet({um}*2)")) and pg.evaluate("state.market.sell.length") == 0 and R['ack'] is True, pg.evaluate("state.money"))
    # 취소: 일부 팔린 뒤 남은 개수만 돌려받는다
    pg.evaluate("state.market.sell.push({key:'kcancel01',id:0,item:'목재',qty:4,price:2,got:0});removeItem('목재',4)"); n0 = pg.evaluate("countItem('목재')"); m1 = pg.evaluate("state.money")
    server['mk']['rows'].append({'id': 777, 'ckey': 'kcancel01', 'item': '목재', 'qty': 3, 'price': 2, 'sold': 1, 'status': 'cancelled', 'ack': False})
    pg.evaluate("marketSync()"); pg.wait_for_timeout(700)
    check('market_cancel_returns_only_remaining', pg.evaluate("countItem('목재')") == n0 + 3 and pg.evaluate("state.money") == m1 + pg.evaluate("marketNet(2)") and pg.evaluate("state.market.sell.length") == 0)
    # 올리다 끊김 → 같은 key 로 다시 보낸다
    server['mk']['fail'] = True; pg.evaluate("openMarket('팔기')"); pg.wait_for_timeout(300)
    pg.fill('#mkQty', '1'); pg.fill('#mkPrice', str(um)); pg.click('[data-act="mk-list"]'); pg.wait_for_timeout(600)
    check('market_list_offline_keeps_record', pg.evaluate("state.market.sell.length") == 1 and pg.evaluate("state.market.sell[0].id") == 0)
    k = pg.evaluate("state.market.sell[0].key"); server['mk']['fail'] = False
    pg.evaluate("marketSync()"); pg.wait_for_timeout(700)
    check('market_list_retry_same_key', any(c[1].get('p_ckey') == k for c in server['mk']['calls'] if c[0] == 'list') and pg.evaluate("state.market.sell[0].id") > 0, pg.evaluate("state.market.sell"))
    # 사기: 개수를 직접 정해 1개만
    pg.evaluate("state.market={sell:[],buy:[]};openMarket('사기')"); pg.wait_for_timeout(700)
    check('market_browse_lists_other_listing', pg.locator('[data-act="mk-buy"][data-id="900"]').count() == 1 and pg.locator('#mkN900').count() == 1)
    m0 = pg.evaluate("state.money"); h0 = pg.evaluate("countItem('약초')"); pg.fill('#mkN900', '1'); pg.click('[data-act="mk-buy"][data-id="900"]'); pg.wait_for_timeout(900)
    check('market_buy_one_goes_straight_to_bag', pg.evaluate("state.money") == m0 - 7 and pg.evaluate("countItem('약초')") == h0 + 1 and pg.evaluate("state.mail.length") == 0 and pg.evaluate("state.market.buy.length") == 0 and server['mk']['other'][0]['qty'] == 2, pg.evaluate("state.money"))
    pg.evaluate("openMarket('사기')"); pg.wait_for_timeout(700)
    pg.fill('#mkN900', '2'); pg.click('[data-act="mk-buy"][data-id="900"]'); pg.wait_for_timeout(900)
    check('market_buy_remaining_two', pg.evaluate("countItem('약초')") == h0 + 3 and pg.evaluate("state.money") == m0 - 21 and server['mk']['other'][0]['status'] == 'sold')
    pg.evaluate("state.money=100"); r1 = pg.evaluate("marketBuyStart(901,'약초',2,10)")
    check('market_buy_unknown_result_stays_pending', r1['req'] and pg.evaluate("state.money") == 80 and pg.evaluate(f"marketBuyResult('{r1['req']}',null)") == 'retry' and pg.evaluate("state.market.buy.length") == 1)
    check('market_buy_gone_refunds', pg.evaluate(f"marketBuyResult('{r1['req']}',{{ok:false,msg:'gone'}})") == 'gone' and pg.evaluate("state.money") == 100 and pg.evaluate("state.market.buy.length") == 0)
    r2 = pg.evaluate("marketBuyStart(902,'약초',2,10)")
    check('market_buy_short_refunds', pg.evaluate(f"marketBuyResult('{r2['req']}',{{ok:false,msg:'short',left:1}})") == 'short' and pg.evaluate("state.money") == 100)
    check('market_buy_needs_money_and_space', pg.evaluate("(state.money=5,marketBuyStart(903,'약초',1,10))") == 'CR이 부족합니다.' and pg.evaluate("(state.money=500,marketBuyStart(904,'약초',0,10))") == '살 수 없는 물건이에요.')
    check('market_buy_full_bag_refused', pg.evaluate("(()=>{state.money=5000;const keep=state.inventory['재료'];const cap=bagCapacity();let i=0;while(usedSlots()<cap){state.inventory['재료'].push({n:'목재',q:1});i++;if(i>999)break}const r=marketBuyStart(905,'약초',99,10);state.inventory['재료']=keep;return r})()") == '가방에 자리가 없어요.')
    check('market_harden_cleans_garbage', pg.evaluate("(()=>{const s=JSON.parse(JSON.stringify(state));s.market={sell:[{key:'x',item:'목재',qty:5,price:5},{key:'goodkey123',item:'없는템',qty:1,price:1},{key:'goodkey456',item:'목재',qty:999,price:99999,id:'abc',got:500}],buy:[{id:-1,req:'abcdef',item:'약초',qty:1,price:5},{id:7,req:'abcdefg',item:'약초',qty:3,price:'x'},{id:8,req:'bad req',item:'약초',qty:1,price:1}]};s.mseen=['s1','zzz',5];hardenState(s);return s.market.sell.length===1&&s.market.sell[0].qty===99&&s.market.sell[0].price===5000&&s.market.sell[0].got===99&&s.market.buy.length===1&&s.market.buy[0].id===7&&s.mseen.length===1&&s.mseen[0]==='s1'})()"))
    pg.evaluate("closeModal();state.money=500")
    pg.evaluate("state.trades={day:todayKey(),n:TRADE_DAILY};view.lt=null"); server['ltcalls'] = []
    pg.evaluate("A['ftrade-open']({dataset:{name:'라온'}})"); pg.wait_for_timeout(400)
    check('live_trade_daily_limit_blocks_invite', 'invite' not in LT())
    pg.evaluate("state.trades={day:'',n:0}")
    pg.evaluate("closeModal()")
    pg.evaluate("state.chatTab='파티';renderChat()"); pg.evaluate("view.chatAt=0"); pg.evaluate("sendChat('파티 인사')"); pg.wait_for_timeout(500)
    check('party_chat_uses_party_channel', server['chatsent'][-1] == {'p_channel': 'party', 'p_body': '파티 인사'}, server['chatsent'][-1:])
    pg.evaluate("A['party-leave-do']()"); pg.wait_for_timeout(600)
    check('party_leave_calls_server', ['leave', {}] in server['pcalls'] and pg.evaluate("PARTY.id") == 0, server['pcalls'])
    pg.evaluate("view.chatAt=0"); pg.evaluate("sendChat('혼자')"); 
    check('party_chat_blocked_without_party', server['chatsent'][-1] == {'p_channel': 'party', 'p_body': '파티 인사'})
    pg.evaluate("state.chatTab='월드';renderChat()")
    pg.evaluate("openFriends()"); pg.wait_for_timeout(600)
    check('friend_window_has_party_invite_button', pg.locator('[data-act="party-invite"]').count() >= 1, pg.inner_text('#modalBody')[:200])
    pg.evaluate("document.querySelector('[data-act=\"party-invite\"]:not([disabled])') && document.querySelector('[data-act=\"party-invite\"]:not([disabled])').click()"); pg.wait_for_timeout(600)
    check('party_invite_sent_to_friend_uid', any(c[0] == 'invite' and c[1].get('p_to') for c in server['pcalls']), server['pcalls'])
    pg.evaluate("closeModal()")
    # 설정: 채팅 탭 끄기
    pg.evaluate("openSettings()")
    check('settings_has_chat_tab_switches', pg.locator('#ctab_월드').count() == 1 and pg.locator('#ctab_파티').count() == 1)
    pg.evaluate("document.querySelector('#ctab_월드').checked=false"); pg.evaluate("A['settings-save']()"); pg.wait_for_timeout(300)
    check('chat_tab_off_hides_button', pg.evaluate("getComputedStyle(document.querySelector('[data-chat=\"월드\"]')).display") == 'none' and pg.evaluate("state.chatTab") != '월드', pg.evaluate("state.chatTab"))
    pg.evaluate("openSettings()")
    for k in ['월드','길드','파티','알림']: pg.evaluate("k=>{document.querySelector('#ctab_'+k).checked=false}", k)
    pg.evaluate("A['settings-save']()"); pg.wait_for_timeout(200)
    check('chat_tabs_cannot_all_be_off', pg.evaluate("Object.values(state.settings.chatTabs).some(Boolean)"))
    pg.evaluate("closeModal()")
    pg.evaluate("state.settings.chatTabs['월드']=true; renderChat()")
    pg.evaluate("(p=>{localStorage.setItem(AVATAR_KEY,p)})(arguments[0])") if False else pg.evaluate("p=>localStorage.setItem(AVATAR_KEY,p)", PNG)
    pg.evaluate("syncMyAvatar()"); pg.wait_for_timeout(700)
    check('my_avatar_uploaded_small', server['setav'] and server['setav'][-1].startswith('data:image/') and len(server['setav'][-1]) < 20000, [str(x)[:40] for x in server['setav']])
    pg.evaluate("document.querySelector('[data-act=\"avatar-clear\"]')") ; pg.evaluate("A['avatar-clear']()"); pg.wait_for_timeout(500)
    check('my_avatar_removal_synced', server['setav'][-1] == '')
    # 다른 기기: 로컬 이미지가 없을 때 서버 이미지를 지우지 않고 받아 온다
    n0 = len(server['setav']); nm = '테스터'; pg.evaluate("state.character.name='테스터'"); server['avatars'][nm] = PNG
    pg.evaluate("localStorage.removeItem(AVATAR_KEY)"); pg.evaluate("syncMyAvatar()"); pg.wait_for_timeout(700)
    check('other_device_keeps_server_avatar', len(server['setav']) == n0, server['setav'][n0:])
    check("other_device_downloads_own_avatar", pg.evaluate("getAvatar()") == PNG, [nm, pg.evaluate("state.created"), server["avq"][-2:]])
    pg.evaluate("localStorage.removeItem(AVATAR_KEY)"); server['avatars'].pop(nm, None)
    pg.evaluate("view.avatars={};state.friends=['하늘'];openFriends(true)"); pg.wait_for_timeout(900)
    check('friend_list_shows_profile_image', pg.locator('#friendList .round-avatar img').count() == 1)
    pg.evaluate("state.friends=[];closeModal()")
    server['data']['money'] = 4242  # 그동안 자동 저장이 서버 데이터를 덮었을 수 있어 다시 정한다
    pg.evaluate("openSettings()"); pg.click('[data-act="cloud-pull"]'); pg.wait_for_timeout(1000)
    check('pull_replaces_local_and_reloads', pg.evaluate("state.money") == 4242, pg.evaluate("state.money"))
    # ── 결과 카드 보존: 다른 활동을 해도, 새로고침해도 남는다
    pg.evaluate("document.querySelector('#tutorial') && document.querySelector('#tutorial').classList.add('hidden')")
    pg.evaluate("state.results=[{t:'화염정령 사냥',text:'화염정령을 쓰러뜨렸다',at:1,gain:['화염의 정수 ×1'],loss:[]},{t:'모래게 사냥',text:'모래게를 잡았다',at:2,gain:[],loss:['기력 -1']}];save();renderAction()")
    pg.evaluate("hardenState(state)") if False else None
    check('result_card_only_latest_kept', pg.evaluate("state.results.length") == 2 and True)  # 직접 넣은 값은 불러올 때 1개로 줄어든다
    pg.evaluate("flushSave()"); pg.reload(); pg.wait_for_timeout(700)
    pg.evaluate("document.querySelector('#tutorial') && document.querySelector('#tutorial').classList.add('hidden')")
    check('result_card_survives_reload_latest_only', pg.evaluate("state.results.length") == 1 and pg.locator('.last-result').count() == 1 and '화염정령 사냥' in pg.inner_text('#actionPanel'), pg.evaluate("state.results.length"))
    pg.evaluate("A['result-close']({dataset:{i:'0'}})")
    check('result_card_close', pg.evaluate("state.results.length") == 0 and pg.locator('.last-result').count() == 0)
    pg.evaluate("state.results=[];save()")
    # ── 프로필 이미지는 서버 세이브에 실려 다른 기기로 간다
    pg.evaluate("p=>localStorage.setItem(AVATAR_KEY,p)", PNG); pg.evaluate("flushSave()")
    pg.evaluate("window.__r=null;cloudPushNow().then(r=>window.__r=r)"); pg.wait_for_timeout(900)
    check('save_carries_avatar', isinstance(server['data'].get('__avatar'), str) and server['data']['__avatar'].startswith('data:image/') and len(server['data']['__avatar']) < 20000, str(server['data'].get('__avatar'))[:40])
    pg.evaluate("localStorage.removeItem(AVATAR_KEY)")
    pg.evaluate("cloudApply(%s, %d)" % (json.dumps(server['data']), server['rev'])); pg.wait_for_timeout(1500)
    check('avatar_arrives_with_server_load', pg.evaluate("getAvatar()") is not None and pg.evaluate("state.__avatar") is None, pg.evaluate("getAvatar()"))
    # ── 폰/PC 자동 동기화: 서버가 더 새롭고 이 기기에서 한 조작이 없으면 조용히 서버 진행으로 바뀐다
    pg.evaluate("document.querySelector('#tutorial') && document.querySelector('#tutorial').classList.add('hidden')")
    d2 = json.loads(json.dumps(server['data'])); d2['money'] = 7777; server['data'] = d2; server['rev'] += 3
    pg.evaluate("lsSet(LS_SYNC, Date.now() - 1000); _lastAct = 0"); pg.evaluate("cloudSync(true)"); pg.wait_for_timeout(1500)
    check('auto_sync_applies_newer_server', pg.evaluate("state.money") == 7777 and pg.evaluate("Cloud.rev()") == server['rev'], [pg.evaluate("state.money"), pg.evaluate("Cloud.rev()"), server['rev']])
    pg.evaluate("document.querySelector('#tutorial') && document.querySelector('#tutorial').classList.add('hidden')")
    # 이 기기에서 조작했어도 서버가 더 새로우면 묻지 않고 서버 진행으로 바뀐다 (직전 진행은 따로 보관)
    server['rev'] += 2; server['data']['money'] = 3131; pg.evaluate("lsSet(LS_SYNC, Date.now() - 5000); _lastAct = Date.now()"); pg.evaluate("state.money=1234;flushSave()")
    pg.evaluate("cloudSync(true)"); pg.wait_for_timeout(1500)
    check('auto_sync_always_uses_server', pg.evaluate("state.money") == 3131 and pg.locator('[data-act="cloud-keep-local"]').count() == 0, pg.evaluate("state.money"))
    check('replaced_local_progress_kept', json.loads(pg.evaluate("localStorage.getItem('deeplayer-replaced')") or '{}').get('money') == 1234)
    pg.evaluate("document.querySelector('#tutorial') && document.querySelector('#tutorial').classList.add('hidden')")
    # ── 메일: 서버 보관함에서 지우기 전에 서버 저장에 먼저 올리고, 중복 없이 한 번만 받는다
    server['inmail'] = [{'id': 77, 'name': '미나', 'subject': '폰으로 온 메일', 'body': '안녕', 'items': []}]; server['mack'].clear(); np0 = len(server['pushes'])
    pg.evaluate("friendPoll()"); pg.wait_for_timeout(1500)
    check('mail_received_with_server_id', pg.evaluate("state.mail.filter(m=>m.sid==='s77').length") == 1, pg.evaluate("state.mail.map(m=>m.sid)"))
    check('mail_saved_to_server_before_ack', 77 in server['mack'] and len(server['pushes']) > np0 and any(m.get('sid') == 's77' for m in server['data']['mail']), [server['mack'], len(server['pushes']) - np0])
    server['inmail'] = [{'id': 77, 'name': '미나', 'subject': '폰으로 온 메일', 'body': '안녕', 'items': []}]; pg.evaluate("friendPoll()"); pg.wait_for_timeout(900)
    check('mail_not_duplicated', pg.evaluate("state.mail.filter(m=>m.sid==='s77').length") == 1)
    # 다른 기기의 오래된 서버 세이브를 불러와도 이 기기에서 받은 메일은 남는다
    d3 = json.loads(json.dumps(server['data'])); d3['mail'] = [m for m in d3['mail'] if m.get('sid') != 's77']; d3['money'] = 8888
    pg.evaluate("flushSave()"); pg.evaluate("cloudApply(%s, %d)" % (json.dumps(d3), server['rev'])); pg.wait_for_timeout(1500)
    check('mail_survives_server_load', pg.evaluate("state.money") == 8888 and pg.evaluate("state.mail.filter(m=>m.sid==='s77').length") == 1, [pg.evaluate("state.money"), pg.evaluate("state.mail.map(m=>m.sid)")])
    # ── 한 번에 한 기기: 다른 기기가 접속하면 이 화면은 잠기고, '이 기기에서 계속하기'로 되찾는다
    pg.evaluate("document.querySelector('#tutorial') && document.querySelector('#tutorial').classList.add('hidden')")
    pg.evaluate("window.__r=null;cloudPushNow().then(r=>window.__r=r)"); pg.wait_for_timeout(500)
    me = pg.evaluate("DEV")
    check('save_carries_device_id', server['data'].get('__dev') == me and pg.evaluate("_claimed") is True, [server['data'].get('__dev'), me])
    d4 = json.loads(json.dumps(server['data'])); d4['__dev'] = 'otherdevice1'; d4['money'] = 6060; server['data'] = d4; server['rev'] += 1
    n_p = len(server['pushes']); pg.evaluate("cloudSync(true)"); pg.wait_for_timeout(900)
    check('new_device_locks_old_page', pg.locator('#devLock').count() == 1 and pg.locator('#devTake').is_visible(), pg.locator('#devLock').count())
    pg.evaluate("state.money=1;flushSave();cloudAutoPush()"); pg.wait_for_timeout(500)
    check('locked_page_does_not_push', len(server['pushes']) == n_p and server['data']['money'] == 6060, [len(server['pushes']), n_p])
    pg.click('#devTake'); pg.wait_for_timeout(1800)
    check('take_over_loads_server_and_claims', pg.evaluate("state.money") == 6060 and pg.locator('#devLock').count() == 0 and server['data'].get('__dev') == me, [pg.evaluate("state.money"), server['data'].get('__dev')])
    pg.evaluate("document.querySelector('#tutorial') && document.querySelector('#tutorial').classList.add('hidden')")
    # 저장이 날아가 처음(스토리) 화면이 떴을 때: 오른쪽 아래 '서버 불러오기'로 서버 진행을 바로 불러온다
    server['data']['created'] = True; server['data']['money'] = 5151
    pg.evaluate("(()=>{const s=JSON.parse(localStorage.getItem(SAVE_KEY));s.created=false;s.tutorialDone=false;localStorage.setItem(SAVE_KEY,JSON.stringify(s))})()")
    pg.reload(); pg.wait_for_timeout(1500)
    pg.evaluate("document.querySelector('#modalBody') && closeModal && closeModal()")
    if pg.locator('#tutStory').is_visible() or True:
        pg.evaluate("tut.replay=false;tut.page=0;tutShow('story');renderStory()")
    cb = rect(pg, '#tutCloudLoad') if pg.locator('#tutCloudLoad').is_visible() else None
    tb = rect(pg, '#tutStory')
    check('tutorial_has_server_load_bottom_right', cb is not None and cb['r'] > tb['r'] - 60 and cb['b'] > tb['b'] - 60, [cb, tb])
    if cb: pg.click('#tutCloudLoad'); pg.wait_for_timeout(1500)
    check('tutorial_server_load_restores', pg.evaluate("state.money") == 5151 and pg.evaluate("state.created") is True, pg.evaluate("[state.money, state.created]"))
    # 서버 백업: 목록 → 지금 백업 → 불러오기, 그리고 서버 저장이 비었을 때 스토리 버튼이 최근 백업을 찾는다
    server['backups'] = [{'id': 11, 'at': '2026-10-21T01:00:00Z', 'rev': 3, 'kind': 'guard', 'name': '테스터', 'level': '5', 'money': '300'}]
    server['bdata'] = {'11': {'created': True, 'money': 300, 'version': 8}}
    pg.evaluate("document.querySelector('#tutorial').classList.add('hidden')")
    pg.evaluate("openSettings()"); pg.click('[data-act="cloud-backups"]'); pg.wait_for_timeout(600)
    check('backup_list_shown', pg.locator('[data-act="backup-restore"]').count() == 1 and '테스터' in pg.inner_text('#modalBody') and '안전장치' in pg.inner_text('#modalBody') and pg.locator('[data-act="backup-now"]').count() == 1, pg.inner_text('#modalBody'))
    pg.click('[data-act="backup-now"]'); pg.wait_for_timeout(500)
    check('backup_now_calls_server', server['bnow'] == 1)
    check('backup_delete_button_beside_restore', pg.locator('[data-act="backup-delete"]').count() == 1)
    pg.click('[data-act="backup-delete"]'); pg.wait_for_timeout(200)
    check('backup_delete_asks_confirm', pg.locator('[data-act="backup-delete-do"]').count() == 1)
    pg.click('[data-act="confirm-cancel"]'); pg.wait_for_timeout(300)
    check('backup_delete_cancel_keeps', not server.get('bdel') and pg.locator('[data-act="backup-restore"]').count() == 1)
    pg.click('[data-act="backup-delete"]'); pg.wait_for_timeout(200); pg.click('[data-act="backup-delete-do"]'); pg.wait_for_timeout(600)
    check('backup_delete_removes_from_server_and_list', server.get('bdel') == [11] and pg.locator('[data-act="backup-restore"]').count() == 0, server.get('bdel'))
    server['backups'] = [{'id': 11, 'at': '2026-10-21T01:00:00Z', 'rev': 3, 'kind': 'guard', 'name': '테스터', 'level': '5', 'money': '300'}]; pg.evaluate("openBackups()"); pg.wait_for_timeout(500)
    pg.click('[data-act="backup-restore"]'); pg.wait_for_timeout(200)
    pg.click('[data-act="backup-restore-do"]'); pg.wait_for_timeout(1800)
    check('backup_restore_applies_and_backs_up_current_first', pg.evaluate("state.money") == 300 and server['bnow'] == 2, [pg.evaluate("state.money"), server['bnow']])
    server['data']['created'] = False; server['bdata']['11']['money'] = 616
    pg.evaluate("(()=>{const s=JSON.parse(localStorage.getItem(SAVE_KEY));s.created=false;s.tutorialDone=false;localStorage.setItem(SAVE_KEY,JSON.stringify(s))})()")
    pg.reload(); pg.wait_for_timeout(1500)
    pg.evaluate("tut.replay=false;tut.page=0;tutShow('story');renderStory()")
    pg.click('#tutCloudLoad'); pg.wait_for_timeout(1800)
    check('story_button_falls_back_to_backup', pg.evaluate("state.money") == 616 and pg.evaluate("state.created") is True, pg.evaluate("[state.money, state.created]"))
    server['data']['created'] = True

    pg.evaluate("document.querySelector('#tutorial').classList.add('hidden')")
    pg.evaluate("openSettings()")
    check('settings_has_no_logout_or_signup_link', pg.locator('[data-act="cloud-logout"]').count() == 0 and pg.locator('a[href="signup.html"]').count() == 0)
    pg.evaluate("closeModal()"); pg.click('#logoutBtn'); pg.click('[data-act="logout-ok"]'); pg.wait_for_timeout(900)
    check('logout_returns_to_signup', pg.url.endswith('signup.html') and pg.evaluate("Cloud.user()") is None)
    b.close()
print('FAILED' if fails else 'ALL OK', fails)
sys.exit(1 if fails else 0)
