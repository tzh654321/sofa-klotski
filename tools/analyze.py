"""Extract the puzzle layout + the sofa outline straight from the design images.

Usage:  python tools/analyze.py <image.png> [--cells 4x5]

Outputs a JSON description (printed) with:
  - board size / cell size in px
  - one axis-aligned rect per flat-colour block, in cell units
  - the sofa's outline as a simplified polygon in cell units
"""
import json
import sys
import collections
import math

sys.path.insert(0, __file__.rsplit('\\', 1)[0])
from png import read_png


def mode_color(im):
    cnt = collections.Counter()
    for y in range(0, im.h, 3):
        for x in range(0, im.w, 3):
            cnt[im.rgb(x, y)] += 1
    return cnt


def near(a, b, tol=26):
    return abs(a[0] - b[0]) <= tol and abs(a[1] - b[1]) <= tol and abs(a[2] - b[2]) <= tol


def main(path, cols=4, rows=5):
    im = read_png(path)
    print('image %dx%d colorType=%d' % (im.w, im.h, im.ct))
    cnt = mode_color(im)
    print('top colours:')
    for c, n in cnt.most_common(14):
        print('   #%02x%02x%02x  %6d  %5.1f%%' % (c[0], c[1], c[2], n, 100.0 * n / sum(cnt.values())))

    # background = colour of the four image corners
    corners = [im.rgb(2, 2), im.rgb(im.w - 3, 2), im.rgb(2, im.h - 3), im.rgb(im.w - 3, im.h - 3)]
    bg = collections.Counter(corners).most_common(1)[0][0]
    print('corner colours', corners, '-> bg #%02x%02x%02x' % bg)

    # label every pixel: which of the frequent colours it belongs to
    palette = [c for c, n in cnt.most_common(14) if n > 300]
    def label(x, y):
        p = im.rgb(x, y)
        if near(p, bg, 30):
            return 'bg'
        for c in palette:
            if near(p, c, 26):
                return '#%02x%02x%02x' % c
        return None

    cs = im.w / cols
    csy = im.h / rows
    print('assumed cell %.2f x %.2f px' % (cs, csy))

    # gather bbox per label
    boxes = {}
    for y in range(0, im.h):
        for x in range(0, im.w):
            lb = label(x, y)
            if lb is None or lb == 'bg':
                continue
            b = boxes.get(lb)
            if b is None:
                boxes[lb] = [x, y, x, y, 1]
            else:
                if x < b[0]: b[0] = x
                if y < b[1]: b[1] = y
                if x > b[2]: b[2] = x
                if y > b[3]: b[3] = y
                b[4] += 1

    print('\ncolour blobs:')
    out_blocks = []
    for lb, (x0, y0, x1, y1, n) in sorted(boxes.items()):
        w = (x1 - x0 + 1) / cs
        h = (y1 - y0 + 1) / csy
        print('  %s bbox px(%d,%d)-(%d,%d)  cell(%.2f,%.2f)-(%.2f,%.2f) size %.2fx%.2f area=%d'
              % (lb, x0, y0, x1, y1, x0 / cs, y0 / csy, (x1 + 1) / cs, (y1 + 1) / csy, w, h, n))
        out_blocks.append(dict(color=lb, px=[x0, y0, x1, y1],
                               cell=[round(x0 / cs, 3), round(y0 / csy, 3),
                                     round((x1 + 1) / cs, 3), round((y1 + 1) / csy, 3)],
                               w=round(w, 3), h=round(h, 3), area=n))

    print(json.dumps(out_blocks, indent=1))


if __name__ == '__main__':
    main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 4, int(sys.argv[3]) if len(sys.argv) > 3 else 5)
