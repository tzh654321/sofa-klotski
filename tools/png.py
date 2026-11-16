"""Minimal dependency-free PNG decoder (8-bit, non-interlaced).

Only needs zlib from the stdlib, so it runs on any of this machine's
Python installs (the managed 3.13 venv has a broken _ssl/_sqlite3, but
zlib is fine).
"""
import struct
import zlib


def read_png(path):
    data = open(path, 'rb').read()
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError('not a png')
    pos = 8
    idat = b''
    w = h = bd = ct = inter = None
    plte = None
    trns = None
    while pos < len(data):
        (ln,) = struct.unpack('>I', data[pos:pos + 4])
        typ = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + ln]
        pos += 12 + ln
        if typ == b'IHDR':
            w, h, bd, ct, _comp, _filt, inter = struct.unpack('>IIBBBBB', body)
        elif typ == b'IDAT':
            idat += body
        elif typ == b'PLTE':
            plte = body
        elif typ == b'tRNS':
            trns = body
        elif typ == b'IEND':
            break
    if bd != 8 or inter != 0:
        raise ValueError('unsupported png: bd=%s inter=%s' % (bd, inter))
    nch = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ct]
    bpp = nch
    stride = w * bpp
    raw = zlib.decompress(idat)
    out = bytearray(h * stride)
    prev = bytearray(stride)
    p = 0
    for y in range(h):
        f = raw[p]
        p += 1
        line = bytearray(raw[p:p + stride])
        p += stride
        if f == 1:
            for i in range(bpp, stride):
                line[i] = (line[i] + line[i - bpp]) & 255
        elif f == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 255
        elif f == 3:
            for i in range(stride):
                a = line[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 255
        elif f == 4:
            for i in range(stride):
                a = line[i - bpp] if i >= bpp else 0
                b = prev[i]
                c = prev[i - bpp] if i >= bpp else 0
                pp = a + b - c
                pa = abs(pp - a)
                pb = abs(pp - b)
                pc = abs(pp - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 255
        out[y * stride:(y + 1) * stride] = line
        prev = line
    return Image(w, h, ct, out, plte, trns)


class Image:
    def __init__(self, w, h, ct, buf, plte, trns):
        self.w = w
        self.h = h
        self.ct = ct
        self.buf = buf
        self.plte = plte
        self.trns = trns

    def rgb(self, x, y):
        i = (y * self.w + x)
        b = self.buf
        if self.ct == 3:
            idx = b[i] * 3
            return (self.plte[idx], self.plte[idx + 1], self.plte[idx + 2])
        if self.ct == 0:
            v = b[i]
            return (v, v, v)
        if self.ct == 4:
            v = b[i * 2]
            return (v, v, v)
        if self.ct == 2:
            return (b[i * 3], b[i * 3 + 1], b[i * 3 + 2])
        return (b[i * 4], b[i * 4 + 1], b[i * 4 + 2])

    def rgb_rows(self):
        for y in range(self.h):
            yield y, [self.rgb(x, y) for x in range(self.w)]
