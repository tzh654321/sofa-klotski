"""把视频帧拆成连通色块，量出每一块在格坐标里的包围盒。

用法：先 ffmpeg 导出 raw rgb24，再跑本脚本：
  ffmpeg -ss 6 -i x.mp4 -frames:v 1 -f rawvideo -pix_fmt rgb24 -s 400x500 f.raw
  python tools/blocks.py f.raw 400 500 100
"""
import sys
from collections import deque


def load(path, w, h):
    data = open(path, 'rb').read()
    px = [[(data[(y * w + x) * 3], data[(y * w + x) * 3 + 1], data[(y * w + x) * 3 + 2])
           for x in range(w)] for y in range(h)]
    return px


def is_purple(c):
    r, g, b = c
    return b > 170 and r > 70 and g < 110 and (b - g) > 90


def main(path, w, h, cell):
    px = load(path, w, h)
    seen = [[False] * w for _ in range(h)]
    comps = []
    for y in range(h):
        for x in range(w):
            if seen[y][x] or not is_purple(px[y][x]):
                continue
            q = deque([(x, y)])
            seen[y][x] = True
            x0 = x1 = x
            y0 = y1 = y
            n = 0
            while q:
                cx, cy = q.popleft()
                n += 1
                if cx < x0: x0 = cx
                if cx > x1: x1 = cx
                if cy < y0: y0 = cy
                if cy > y1: y1 = cy
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and is_purple(px[ny][nx]):
                        seen[ny][nx] = True
                        q.append((nx, ny))
            comps.append((n, x0, y0, x1, y1))
    comps.sort(reverse=True)
    out = []
    for n, x0, y0, x1, y1 in comps:
        if n < 400:
            continue
        bw = (x1 - x0 + 1) / cell
        bh = (y1 - y0 + 1) / cell
        out.append(dict(area=n,
                        cell=[round(x0 / cell, 2), round(y0 / cell, 2),
                              round((x1 + 1) / cell, 2), round((y1 + 1) / cell, 2)],
                        size=[round(bw, 2), round(bh, 2)]))
    print('%-9s %-6s %-26s %s' % ('area', 'size', 'cell rect', 'fill'))
    for o in out:
        c = o['cell']
        fill = o['area'] / ((c[2] - c[0]) * (c[3] - c[1]) * cell * cell)
        print('%-9d %-6s (%.2f,%.2f)-(%.2f,%.2f)  %.2f' %
              (o['area'], '%gx%g' % tuple(o['size']), c[0], c[1], c[2], c[3], fill))
    return out


if __name__ == '__main__':
    main(sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]) if len(sys.argv) > 4 else 100)
