"""미리보기 빌드: index.html + css + js(+dev.js) 를 한 파일로 합친다. (배포 금지 — tools/ 는 zip 에 넣지 않는다)
사용: python3 tools/build_preview.py <출력.html>
- CSP 메타 제거, css/js 인라인, dev.js 는 ui.js 뒤에 붙인다(미리보기에만 개발자 도구)
- 서버 연결 끄기(CLOUD 비움), signup.html 로 보내는 부분 제거
- BGM·방 PNG 는 data: URI 로 넣는다 (_로 시작하는 안내 그림은 제외)
※ 이전 버전 파일이 사라져 게시된 미리보기 결과물과 같게 나오도록 다시 만든 것 (2026-10-24)
"""
import base64, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def read(p):
    return (ROOT / p).read_text(encoding='utf8')


def data_uri(path, mime):
    return f'data:{mime};base64,' + base64.b64encode(path.read_bytes()).decode()


def build():
    html = read('index.html')
    html = re.sub(r'<title>[^<]*</title>', '<title>DEEP LAYER UI</title>', html)
    html = re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>\n', '', html)
    import urllib.parse as _u
    html = re.sub(r'<link rel="(?:icon|apple-touch-icon)"[^>]*>\n', '', html)  # 파일 파비콘 → 미리보기에는 SVG 를 data: 로 넣는다
    html = html.replace('</title>', '</title>\n<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,' + _u.quote(read('favicon.svg')) + '">', 1)
    for css in ('theme', 'style'):
        html = html.replace(f'<link rel="stylesheet" href="css/{css}.css">', '<style>\n' + read(f'css/{css}.css') + '\n</style>')

    data = read('js/data.js')
    assets = {p.name: data_uri(p, 'image/png') for p in sorted((ROOT / 'assets/room').glob('*.png')) if not p.name.startswith('_')}
    data = 'const ROOM_ASSETS = ' + json.dumps(assets) + ';\n' + data
    items = {p.name: data_uri(p, 'image/png') for p in sorted((ROOT / 'assets/items').glob('*.png')) if not p.name.startswith('_')} if (ROOT / 'assets/items').is_dir() else {}
    data = 'const ITEM_ASSETS = ' + json.dumps(items) + ';\n' + data  # 아이템 도트 아이콘도 한 파일 안에
    data = data.replace('src: `assets/room/${id}.png`', 'src: (ROOM_ASSETS[`${id}.png`] || `assets/room/${id}.png`)')
    data = data.replace('maskSrc: o.mask ? `assets/room/${id}_mask.png` : \'\'', 'maskSrc: o.mask ? (ROOM_ASSETS[`${id}_mask.png`] || `assets/room/${id}_mask.png`) : \'\'')
    bgm = ROOT / 'audio/bgm.mp3'
    if bgm.exists():
        data = data.replace("const BGM_FILE = 'audio/bgm.mp3';", "const BGM_FILE = '" + data_uri(bgm, 'audio/mpeg') + "';")

    cloud = read('js/cloud.js')
    cloud = re.sub(r"const CLOUD = \{[^}]*\};", "const CLOUD = { url: '', key: '' };", cloud)
    cloud = cloud.replace("location.replace('signup.html');", 'void 0;')

    ui = read('js/ui.js').replace("location.href = 'signup.html';", 'location.reload();') + '\n' + read('js/dev.js')

    parts = {'data': data, 'core': read('js/core.js'), 'cloud': cloud, 'ui': ui, 'room': read('js/room.js')}
    for name, src in parts.items():
        html = html.replace(f'<script src="js/{name}.js"></script>', '<script>\n' + src + '\n</script>')
    if 'signup.html' in html or 'src="js/' in html:
        raise SystemExit('남은 외부 참조가 있습니다: ' + ', '.join(m for m in ('signup.html', 'src="js/') if m in html))
    return html


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('사용: python3 tools/build_preview.py <출력.html>')
    Path(sys.argv[1]).write_text(build(), encoding='utf8')
