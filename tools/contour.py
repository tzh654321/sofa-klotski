"""Trace the sofa outline out of the flat-colour design image.

marching-squares on the colour mask -> chained loops -> Douglas-Peucker,
then expressed in board-cell units (origin = shape bbox centre).
"""
import json
import math
import sys

sys.path.insert(0, __file__.rsplit('\\', 1)[0])
from png import read_png

CASES = {
    1: [('L', 'B')], 2: [('B', 'R')], 3: [('L', 'R')], 4: [('R', 'T')],
    5: [('L', 'T'), ('B', 'R')], 6: [('T', 'B')], 7: [('L', 'T')],
    8: [('T', 'L')], 9: [('T', 'B')], 10: [('T', 'R'), ('B', 'L')],
    11: [('T', 'R')], 12: [('L', 'R')], 13: [('B', 'R')], 14: [('L', 'B')],
}


def edge_pt(name, i, j):
    if name == 'T':
        return (i + 0.5, float(j))
    if name == 'R':
        return (float(i + 1), j + 0.5)
    if name == 'B':
        return (i + 0.5, float(j + 1))
    return (float(i), j + 0.5)


def trace(mask, w, h):
    segs = []
    for j in range(h):
        for i in range(w):
            tl = mask[j][i]
            tr = mask[j][i + 1] if i + 1 < w else False
            bl = mask[j + 1][i] if j + 1 < h else False
            br = mask[j + 1][i + 1] if (j + 1 < h and i + 1 < w) else False
            idx = (8 if tl else 0) + (4 if tr else 0) + (2 if br else 0) + (1 if bl else 0)
            for a, b in CASES.get(idx, ()):
                segs.append((edge_pt(a, i, j), edge_pt(b, i, j)))
    adj = {}
    for k, (a, b) in enumerate(segs):
        adj.setdefault(a, []).append(k)
        adj.setdefault(b, []).append(k)
    used = [False] * len(segs)
    loops = []
    for k0 in range(len(segs)):
        if used[k0]:
            continue
        used[k0] = True
        a, b = segs[k0]
        loop = [a, b]
        cur = b
        while True:
            nxt = None
            for k in adj.get(cur, ()):
                if not used[k]:
                    nxt = k
                    break
            if nxt is None:
                break
            used[nxt] = True
            p, q = segs[nxt]
            cur = q if (abs(p[0] - cur[0]) + abs(p[1] - cur[1]) < 1e-6) else p
            loop.append(cur)
        if len(loop) > 8:
            loops.append(loop)
    loops.sort(key=len, reverse=True)
    return loops


def dp(pts, eps):
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]
        bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy) or 1e-9
        best, bi = -1, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            d = abs((px - ax) * dy - (py - ay) * dx) / L
            if d > best:
                best, bi = d, i
        if best > eps:
            keep[bi] = True
            stack.append((a, bi))
            stack.append((bi, b))
    return [pts[i] for i in range(len(pts)) if keep[i]]


def smooth_closed(pts, half_window):
    """circular moving-average to kill the 1px staircase of the pixel mask"""
    n = len(pts)
    out = []
    for i in range(n):
        sx = sy = 0.0
        for k in range(-half_window, half_window + 1):
            p = pts[(i + k) % n]
            sx += p[0]
            sy += p[1]
        m = 2 * half_window + 1
        out.append((sx / m, sy / m))
    return out


def resample_closed(pts, n_out):
    """uniform arc-length resampling of a closed polyline"""
    n = len(pts)
    seg = []
    total = 0.0
    for i in range(n):
        a = pts[i]
        b = pts[(i + 1) % n]
        d = math.hypot(b[0] - a[0], b[1] - a[1])
        seg.append((a, b, d))
        total += d
    step = total / n_out
    out = []
    idx = 0
    acc = 0.0
    for k in range(n_out):
        target = k * step
        while idx < n - 1 and acc + seg[idx][2] < target:
            acc += seg[idx][2]
            idx += 1
        a, b, d = seg[idx]
        t = 0.0 if d < 1e-9 else (target - acc) / d
        out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


def main(path, hexcolor, cols=4, rows=5, eps=1.2):
    im = read_png(path)
    cs = im.w / cols
    csy = im.h / rows
    tc = (int(hexcolor[1:3], 16), int(hexcolor[3:5], 16), int(hexcolor[5:7], 16))
    tol = 40
    mask = [[False] * (im.w + 1) for _ in range(im.h + 1)]
    for y in range(im.h):
        row = mask[y]
        for x in range(im.w):
            p = im.rgb(x, y)
            if abs(p[0] - tc[0]) <= tol and abs(p[1] - tc[1]) <= tol and abs(p[2] - tc[2]) <= tol:
                row[x] = True
    loops = trace(mask, im.w, im.h)
    if not loops:
        raise SystemExit('no contour for %s' % hexcolor)
    loop = loops[0]
    print('loops:', [len(l) for l in loops[:5]])
    # drop the duplicated closing point
    if abs(loop[0][0] - loop[-1][0]) < 1e-6 and abs(loop[0][1] - loop[-1][1]) < 1e-6:
        loop = loop[:-1]
    simple = resample_closed(smooth_closed(loop, 6), 160)
    print('raw %d -> smoothed/resampled %d pts (dp would give %d)'
          % (len(loop), len(simple), len(dp(loop, eps))))
    xs = [p[0] for p in simple]
    ys = [p[1] for p in simple]
    bx0, bx1, by0, by1 = min(xs), max(xs), min(ys), max(ys)
    cx = (bx0 + bx1) / 2.0
    cy = (by0 + by1) / 2.0
    pts = [[round((p[0] - cx) / cs, 4), round((p[1] - cy) / csy, 4)] for p in simple]
    area = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        area += x1 * y2 - x2 * y1
    area = abs(area) / 2.0
    print('contour pts raw=%d simple=%d' % (len(loop), len(simple)))
    print('bbox cell: x %.3f..%.3f  y %.3f..%.3f  (w=%.3f h=%.3f)'
          % (bx0 / cs, bx1 / cs, by0 / csy, by1 / csy, (bx1 - bx0) / cs, (by1 - by0) / csy))
    print('area = %.4f cells^2' % area)
    print('bbox centre px (%.1f, %.1f) -> cell (%.3f, %.3f)' % (cx, cy, cx / cs, cy / csy))
    print('signed area sign', 'CW' if sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts))) > 0 else 'CCW')
    out = dict(pts=pts, bbox_cell=[round(bx0 / cs, 4), round(by0 / csy, 4), round(bx1 / cs, 4), round(by1 / csy, 4)],
               center_cell=[round(cx / cs, 4), round(cy / csy, 4)], area=round(area, 4))
    dst = sys.argv[3] if len(sys.argv) > 3 else 'sofa-klotski/tools/data/sofa_outline.json'
    open(dst, 'w', encoding='utf-8').write(json.dumps(out, indent=1))
    print('wrote %s (%d pts)' % (dst, len(pts)))
    # coarse ascii preview (0.1 cell resolution)
    for gy in range(30):
        line = ''
        for gx in range(12):
            px = bx0 + (gx + 0.5) * (bx1 - bx0) / 12
            py = by0 + (gy + 0.5) * (by1 - by0) / 30
            inside = False
            for i in range(len(simple)):
                x1, y1 = simple[i]
                x2, y2 = simple[(i + 1) % len(simple)]
                if (y1 > py) != (y2 > py):
                    xi = x1 + (py - y1) * (x2 - x1) / (y2 - y1)
                    if xi > px:
                        inside = not inside
            line += '#' if inside else '.'
        print('  ' + line)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else '#22b14c')
