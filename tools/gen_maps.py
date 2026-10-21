"""위험구역 타일 지도 생성기. 실행: python3 tools/gen_maps.py  → data.js에 붙여 넣을 MAPS 블록을 출력한다.
문자: . 허공(지도 밖) / # 벽 / S 입구 / C 캠프 / E 이벤트 / a~e 지형.  모든 칸이 입구에서 이어지도록 보장한다."""
import random, math, sys
from collections import deque

def shape_blob(w, h, rnd):
    cx, cy = (w-1)/2, (h-1)/2
    ph = [rnd.uniform(0, 6.28) for _ in range(3)]
    def ok(x, y):
        a = math.atan2((y-cy)/(h/2), (x-cx)/(w/2)); r = math.hypot((x-cx)/(w/2), (y-cy)/(h/2))
        return r < .78 + .16*math.sin(3*a+ph[0]) + .1*math.sin(5*a+ph[1])
    return ok
def shape_crescent(w, h, rnd):
    cx, cy = w*.5, h*.5
    def ok(x, y):
        r1 = math.hypot((x-cx)/(w*.5), (y-cy)/(h*.55)); r2 = math.hypot((x-cx-w*.2)/(w*.40), (y-cy+h*.04)/(h*.46))
        return r1 < .98 and r2 > .72
    return ok
def shape_ring(w, h, rnd):
    cx, cy = (w-1)/2, (h-1)/2
    def ok(x, y):
        r = math.hypot((x-cx)/(w/2), (y-cy)/(h/2)); a = math.atan2(y-cy, x-cx)
        return (.38 < r < 1.0 + .06*math.sin(4*a)) or (r <= .38 and (abs(x-cx) < 1.2 or abs(y-cy) < 1.0))
    return ok
def shape_canyon(w, h, rnd):
    def ok(x, y):
        c = h/2 + (h*.28)*math.sin(x/w*math.pi*2.3) ; return abs(y-c) < 2.3 + (1 if (x//3) % 2 else 0)
    return ok
def shape_cross(w, h, rnd):
    cx, cy = (w-1)/2, (h-1)/2
    def ok(x, y):
        arm = abs(x-cx) < 1.7 or abs(y-cy) < 1.7
        dx, dy = abs(x-cx), abs(y-cy)
        bridge = abs(dx-dy) < 1.1 and 2.5 < math.hypot(dx, dy) < 7
        lobe = math.hypot(dx-(cx-2.4), dy-(cy-2.4)) < 2.5
        return arm or bridge or lobe
    return ok

def build(w, h, shape, seed, n_terrain=5, n_event=4, wall=.06):
    for attempt in range(400):
        rnd = random.Random(seed*1000+attempt)
        ok = shape(w, h, rnd)
        cells = [(x, y) for y in range(h) for x in range(w) if ok(x, y)]
        cs = set(cells)
        # 가장 큰 연결 덩어리만 사용
        seen, best = set(), []
        for c in cells:
            if c in seen: continue
            comp, q = [], deque([c]); seen.add(c)
            while q:
                p = q.popleft(); comp.append(p)
                for d in ((1,0),(-1,0),(0,1),(0,-1)):
                    n = (p[0]+d[0], p[1]+d[1])
                    if n in cs and n not in seen: seen.add(n); q.append(n)
            if len(comp) > len(best): best = comp
        cells = best; cs = set(cells)
        if len(cells) < 60: continue
        # 입구: 왼쪽 가장자리 근처 칸
        S = min(cells, key=lambda p: (p[0] + abs(p[1]-h/2)*.3, p[1]))
        # 지형: 시드 5개 보로노이
        seeds = rnd.sample(cells, n_terrain)
        grid = {}
        for _ in range(6): # 로이드 반복: 지형 구역 크기를 비슷하게 맞춘다
            for p in cells:
                grid[p] = min(range(n_terrain), key=lambda i: (p[0]-seeds[i][0])**2 + (p[1]-seeds[i][1])**2 + rnd.uniform(0, 1.5))
            for i in range(n_terrain):
                m = [p for p in cells if grid[p] == i]
                if m:
                    mx, my = sum(p[0] for p in m)/len(m), sum(p[1] for p in m)/len(m)
                    seeds[i] = min(cells, key=lambda p: (p[0]-mx)**2 + (p[1]-my)**2)
        # 먼 곳에 캠프/이벤트
        def far(excl, k):
            out = []
            pool = [p for p in cells if p not in excl]
            for _ in range(k):
                p = max(pool, key=lambda q: min([abs(q[0]-e[0])+abs(q[1]-e[1]) for e in excl+out] or [0]))
                out.append(p); pool.remove(p)
            return out
        C = far([S], 2)
        E = far([S] + C, n_event)
        special = {S: 'S', **{p: 'C' for p in C}, **{p: 'E' for p in E}}
        # 벽: 연결 유지하며 흩뿌림
        walls = set(); cand = [p for p in cells if p not in special]; rnd.shuffle(cand)
        target = int(len(cells)*wall)
        def connected(blocked):
            q = deque([S]); s = {S}
            while q:
                p = q.popleft()
                for d in ((1,0),(-1,0),(0,1),(0,-1)):
                    n = (p[0]+d[0], p[1]+d[1])
                    if n in cs and n not in blocked and n not in s: s.add(n); q.append(n)
            return len(s) == len(cs) - len(blocked)
        for p in cand:
            if len(walls) >= target: break
            if connected(walls | {p}): walls.add(p)
        if any(sum(1 for p in cells if grid[p] == i and p not in walls and p not in special) < 5 for i in range(n_terrain)): continue
        rows = []
        for y in range(h):
            r = ''
            for x in range(w):
                p = (x, y)
                r += '.' if p not in cs else '#' if p in walls else special.get(p, 'abcde'[grid[p]])
            rows.append(r)
        return rows
    raise SystemExit('실패')

SPECS = [('제1구역', 13, 11, shape_blob, 11, 3), ('제2구역', 15, 11, shape_crescent, 22, 3),
         ('제3구역', 13, 13, shape_ring, 33, 3), ('제4구역', 19, 11, shape_canyon, 44, 4), ('제5구역', 15, 15, shape_cross, 55, 4)]
if __name__ == '__main__':
    print("const MAPS = { // 문자: . 허공 / # 벽 / S 입구 / C 캠프 / E 이벤트 / a~e = 지형(terrains[0..4]). tools/gen_maps.py로 만든다. 지역마다 모양이 다르다")
    for i, (z, w, h, sh, seed, ne) in enumerate(SPECS):
        rows = build(w, h, sh, seed, 5, ne)
        print(f"  '{z}': [" + ', '.join(f"'{r}'" for r in rows) + ']' + (',' if i < len(SPECS)-1 else ''))
    print('};')
