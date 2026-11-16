"""把整段视频按 4fps 采样成 4x5 占格位图，用于和引擎可达集比对。

输出每行: t, 20 位占格串(行优先 '1'=有块), 沙发包围盒(w x h), 是否轴对齐
"""
import sys
from collections import deque

W, H, CELL = 400, 500, 100
NC, NR = 4, 5


def main(raw_path, frames):
    data = open(raw_path, 'rb').read()
    fsz = W * H * 3
    n = len(data) // fsz
    out = []
    for fi in range(min(n, frames)):
        base = fi * fsz
        def px(x, y):
            i = base + (y * W + x) * 3
            return data[i], data[i + 1], data[i + 2]
        def purple(c):
            r, g, b = c
            return b > 170 and r > 70 and g < 110 and (b - g) > 90
        # 占格：每格 6x6 采样，超过 40% 紫色算占用
        occ = ''
        for r in range(NR):
            for c in range(NC):
                hit = 0
                tot = 0
                for dy in range(6):
                    for dx in range(6):
                        x = int((c + (dx + 0.5) / 6) * CELL)
                        y = int((r + (dy + 0.5) / 6) * CELL)
                        tot += 1
                        if purple(px(x, y)):
                            hit += 1
                occ += '1' if hit / tot > 0.4 else '0'
        out.append(occ)
    print('\n'.join(out))


if __name__ == '__main__':
    main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 10 ** 9)
