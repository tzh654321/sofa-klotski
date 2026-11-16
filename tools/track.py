"""逐帧跟踪曹操(2x2) 与沙发(1x3) 的位置，看视频到底把曹操送到哪。"""
import sys
from collections import deque

W, H, CELL = 400, 500, 100


def main(raw_path, every):
    data = open(raw_path, 'rb').read()
    fsz = W * H * 3
    n = len(data) // fsz
    for fi in range(0, n, every):
        base = fi * fsz
        seen = [[False] * W for _ in range(H)]
        comps = []

        def purple(x, y):
            i = base + (y * W + x) * 3
            r, g, b = data[i], data[i + 1], data[i + 2]
            return b > 170 and r > 70 and g < 110 and (b - g) > 90

        for y in range(H):
            for x in range(W):
                if seen[y][x] or not purple(x, y):
                    continue
                q = deque([(x, y)])
                seen[y][x] = True
                x0 = x1 = x
                y0 = y1 = y
                cnt = 0
                while q:
                    cx, cy = q.popleft()
                    cnt += 1
                    x0 = min(x0, cx); x1 = max(x1, cx)
                    y0 = min(y0, cy); y1 = max(y1, cy)
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < W and 0 <= ny < H and not seen[ny][nx] and purple(nx, ny):
                            seen[ny][nx] = True
                            q.append((nx, ny))
                if cnt > 400:
                    comps.append((cnt, x0 / CELL, y0 / CELL, (x1 + 1) / CELL, (y1 + 1) / CELL))
        comps.sort(reverse=True)
        hero = None
        sofa = None
        cells = 0
        for cnt, x0, y0, x1, y1 in comps:
            bw, bh = x1 - x0, y1 - y0
            if 1.9 < bw < 2.1 and 1.9 < bh < 2.1:
                hero = (round(x0, 2), round(y0, 2))
                cells += 4
            elif (2.8 < bw < 3.1 and bh < 1.1) or (2.8 < bh < 3.1 and bw < 1.1):
                sofa = (round(x0, 2), round(y0, 2), round(bw, 1), round(bh, 1))
                cells += 3
            else:
                cells += int(round(bw * bh))
        print('t=%5.2f hero=%-14s sofa=%-24s occ~%d' % (fi / 4.0, str(hero), str(sofa), cells))


if __name__ == '__main__':
    main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 4)
