/* 가입 페이지 화면. 검사 규칙은 auth.js(Check/AuthApi) */
const $s = id => document.getElementById(id);
const msg = (id, t, ok) => { const e = $s(id); e.textContent = t || ''; e.classList.toggle('ok', !!ok && !!t); };
function liveCheck() {
  const id = $s('suId').value.trim().toLowerCase(), pw = $s('suPw').value, pw2 = $s('suPw2').value;
  msg('suIdMsg', id ? (Check.id(id) || '사용할 수 있는 형식이에요.') : '', id && !Check.id(id));
  msg('suPwMsg', pw ? (Check.pw(pw, id) || '좋아요.') : '', pw && !Check.pw(pw, id));
  $s('suMeter').style.width = (pw ? Check.strength(pw) * 25 : 0) + '%';
  msg('suPw2Msg', pw2 ? (pw === pw2 ? '일치해요.' : '비밀번호가 달라요.') : '', pw2 && pw === pw2);
}
['suId', 'suPw', 'suPw2'].forEach(i => $s(i).addEventListener('input', liveCheck));
$s('suForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $s('suGo'), out = $s('suResult');
  btn.disabled = true; out.textContent = ''; out.className = 'su-result';
  ['suIdMsg', 'suInvMsg'].forEach(i => msg(i, ''));
  try {
    const r = await AuthApi.signup({ id: $s('suId').value, pw: $s('suPw').value, pw2: $s('suPw2').value, invite: $s('suInv').value, other: $s('suOther').checked });
    if (r.ok) {
      out.textContent = `가입이 완료되었어요! 이제 게임으로 돌아가 탐색을 시작하세요. ${r.left === '?' ? '' : `(이 초대코드 남은 자리 ${r.left}명)`}`; out.classList.add('ok');
      $s('suForm').querySelectorAll('input').forEach(i => { i.value = ''; i.checked = false; }); liveCheck();
    } else {
      out.textContent = r.err; out.classList.add('err');
      if (r.field === 'invite') msg('suInvMsg', r.err);
      if (r.field === 'id') msg('suIdMsg', r.err);
    }
  } catch (err) { out.textContent = '가입 처리 중 문제가 생겼어요. 잠시 뒤에 다시 시도해 주세요.'; out.classList.add('err'); }
  btn.disabled = false;
});
