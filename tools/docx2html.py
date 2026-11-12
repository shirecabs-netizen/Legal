#!/usr/bin/env python3
"""Convert the Letter Before Claim .docx into the same HTML design as the original letter.

Usage:
  python3 -I tools/docx2html.py TEMPLATE.html LETTER.docx OUT.html

TEMPLATE.html is an existing letter in the target design (CSS, scripts, logo and signature are
reused verbatim); only the letterhead text, body, contents list and side menu are rebuilt from the
.docx. The .docx is expected to follow the house layout: Heading 1/2 for sections, typed paragraph
numbers followed by a tab (e.g. "7(a)(i)<tab>"), one-row shaded tables for grounds, and
w:bookmarkStart / w:hyperlink pairs for cross-references.
"""
import re
import sys
import html as H
import docx
from docx.oxml.ns import qn

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'


def esc(s):
    return H.escape(s, quote=False)


def on(el, tag):
    """True if a run-property toggle (w:b / w:i) is present and not switched off."""
    if el is None:
        return False
    e = el.find(qn(tag))
    return e is not None and e.get(qn('w:val')) not in ('0', 'false')


class Doc:
    def __init__(self, path):
        self.d = docx.Document(path)
        self.rels = {r.rId: r.target_ref for r in self.d.part.rels.values()}

    # ---- tokens -----------------------------------------------------------------------------
    def tokens(self, p, href=None, out=None):
        """Flatten a paragraph into text / bookmark / break tokens with bold, italic and link info."""
        out = [] if out is None else out
        for ch in p:
            tag = ch.tag.split('}')[1] if '}' in ch.tag else ch.tag
            if tag == 'r':
                rp = ch.find(qn('w:rPr'))
                b, i = on(rp, 'w:b'), on(rp, 'w:i')
                for sub in ch:
                    st = sub.tag.split('}')[1]
                    if st == 't':
                        out.append(dict(k='t', t=sub.text or '', b=b, i=i, href=href))
                    elif st == 'tab':
                        out.append(dict(k='t', t='\t', b=b, i=i, href=href))
                    elif st == 'br':
                        out.append(dict(k='br'))
                    elif st == 'noBreakHyphen':
                        out.append(dict(k='t', t='‑', b=b, i=i, href=href))
            elif tag == 'hyperlink':
                anchor = ch.get(qn('w:anchor'))
                rid = ch.get('{%s}id' % R)
                h = ('#' + anchor) if anchor else (self.rels.get(rid) if rid else None)
                self.tokens(ch, h, out)
            elif tag == 'bookmarkStart':
                n = ch.get(qn('w:name'))
                if n and n != '_GoBack':
                    out.append(dict(k='bm', n=n))
            elif tag in ('smartTag', 'ins', 'sdt', 'sdtContent'):
                self.tokens(ch, href, out)
        return out

    @staticmethod
    def plain(toks):
        return ''.join(t['t'] for t in toks if t['k'] == 't')

    @staticmethod
    def drop_label(toks, label_len):
        """Remove the first label_len characters of text (label + tab) from a token list."""
        out, left = [], label_len
        for t in toks:
            if t['k'] == 't' and left > 0:
                if len(t['t']) <= left:
                    left -= len(t['t'])
                    continue
                t = dict(t, t=t['t'][left:])
                left = 0
            out.append(t)
        # trim leading whitespace
        for t in out:
            if t['k'] == 't':
                t['t'] = t['t'].lstrip()
                if t['t']:
                    break
        return out

    @staticmethod
    def render(toks, quote=False, skip_bm=()):
        parts, cur_href = [], None

        def close():
            nonlocal cur_href
            if cur_href is not None:
                parts.append('</a>')
                cur_href = None

        for t in toks:
            if t['k'] == 'bm':
                if t['n'] not in skip_bm:
                    close()
                    parts.append('<span id="%s"></span>' % t['n'])
                continue
            if t['k'] == 'br':
                close()
                parts.append('<br>')
                continue
            txt = esc(t['t'].replace('\t', ' '))
            if not txt:
                continue
            if t['href'] != cur_href:
                close()
                if t['href']:
                    if t['href'].startswith('#'):
                        parts.append('<a class="xref" href="%s">' % esc(t['href']))
                    else:
                        parts.append('<a href="%s">' % esc(t['href']))
                    cur_href = t['href']
            b, i = t['b'], t['i']
            if quote:
                if b:
                    txt = '<strong><em><span class="g">%s</span></em></strong>' % txt
                else:
                    txt = '<em>%s</em>' % txt
            else:
                if i:
                    txt = '<em>%s</em>' % txt
                if b:
                    txt = '<strong>%s</strong>' % txt
            parts.append(txt)
        close()
        s = ''.join(parts)
        # merge adjacent identical wrappers produced run by run
        for w in ('strong', 'em'):
            s = re.sub(r'</%s><%s>' % (w, w), '', s)
        s = s.replace('</span></em></strong><strong><em><span class="g">', '')
        s = s.replace('</em><em>', '')
        return s

    def bms(self, toks):
        return [t['n'] for t in toks if t['k'] == 'bm']

    def indent(self, p):
        el = p.find(qn('w:pPr'))
        if el is None:
            return 0
        ind = el.find(qn('w:ind'))
        if ind is None:
            return 0
        v = ind.get(qn('w:left')) or ind.get(qn('w:start'))
        return int(v) / 20 if v else 0

    def style(self, p):
        el = p.find(qn('w:pPr'))
        if el is None:
            return 'Normal'
        s = el.find(qn('w:pStyle'))
        return s.get(qn('w:val')) if s is not None else 'Normal'


# A label (number / roman / letter) is separated from its text by a tab, or by a run of 2+ spaces
SEP = r'(?:\t|[ \u00a0]{2,})'
LABELS = [
    (re.compile(r'^7\([a-z]\)\([ivx]+\)' + SEP), 'np l1 wide'),
    (re.compile(r'^\d+\.\d+\.\d+' + SEP), 'np l2'),
    (re.compile(r'^\d+\.\d+' + SEP), 'np l1'),
    (re.compile(r'^\([ivx]+\)' + SEP), 'np rom'),
    (re.compile(r'^Ground [A-Z]' + SEP), 'np li'),
    (re.compile('^\u25aa' + SEP), 'np bul'),
    (re.compile(r'^[A-Z]\.' + SEP), 'np li'),
    (re.compile(r'^\d+\.' + SEP), 'np li'),
]


def para_class(text, ind):
    for rx, cls in LABELS:
        m = rx.match(text)
        if m:
            if cls == 'np li' and re.match(r'^\d+\.' + SEP, text) and ind >= 90:
                cls = 'np rom'
            return m, cls
    return None, None


def convert(template_path, docx_path, out_path):
    tpl = open(template_path, encoding='utf8').read()
    logo = re.search(r'<img class="logo"[^>]*src="([^"]+)"', tpl).group(1)
    sig = re.search(r'<img class="sig"[^>]*src="([^"]+)"', tpl).group(1)

    D = Doc(docx_path)
    body = D.d.element.body
    kids = list(body.iterchildren())

    # ---- locate landmarks --------------------------------------------------------------------
    def ptext(el):
        return D.plain(D.tokens(el)).strip()

    # header table, meta table
    tables = [k for k in kids if k.tag == qn('w:tbl')]
    hdr_tbl, meta_tbl = tables[0], tables[1]

    def cell_paras(tc):
        return [p for p in tc.findall(qn('w:p'))]

    hdr_cells = hdr_tbl.find(qn('w:tr')).findall(qn('w:tc'))
    lh_lines = []
    for p in cell_paras(hdr_cells[-1]):
        toks = D.tokens(p)
        if D.plain(toks).strip():
            lh_lines.append('<span>%s</span>' % D.render(toks))
    letterhead = ('<header class="letterhead">\n  <img class="logo" alt="SHIRE" src="%s">\n  '
                  '<div class="lh-text">%s</div>\n</header>' % (logo, ''.join(lh_lines)))

    rows = []
    for tr in meta_tbl.findall(qn('w:tr')):
        tcs = tr.findall(qn('w:tc'))
        th = esc(' '.join(D.plain(D.tokens(p)).strip() for p in cell_paras(tcs[0])).strip().title()
                 .replace('Copy To', 'Copy to'))
        td = '<br>'.join(D.render(D.tokens(p)) for p in cell_paras(tcs[1]) if D.plain(D.tokens(p)).strip())
        rows.append('<tr><th>%s</th><td>%s</td></tr>' % (th, td))
    meta = '<table class="meta"><tbody>%s</tbody></table>' % ''.join(rows)

    # ---- walk the remaining body -------------------------------------------------------------
    idx = kids.index(meta_tbl) + 1
    seq = kids[idx:]
    # banner: first bold paragraph then following ind=12 paragraphs
    banner_parts, i = [], 0
    while i < len(seq) and not ptext(seq[i]):
        i += 1
    while i < len(seq) and seq[i].tag == qn('w:p') and ptext(seq[i]) and D.indent(seq[i]) == 12:
        banner_parts.append(ptext(seq[i]))
        i += 1
    banner = '<div class="banner"><span class="bt">%s</span>%s</div>' % (
        esc(banner_parts[0]), ''.join('<span class="bs">%s</span>' % esc(b) for b in banner_parts[1:]))
    seq = seq[i:]

    out = [letterhead, meta, banner]
    # urgent, salute, opening paragraphs (until 'Contents')
    j = 0
    while j < len(seq):
        el = seq[j]
        if el.tag != qn('w:p'):
            j += 1
            continue
        toks = D.tokens(el)
        t = D.plain(toks).strip()
        if t == 'Contents':
            break
        if t:
            if t.startswith('URGENT'):
                out.append('<p class="urgent">%s</p>' % D.render(toks))
            elif t.startswith('Dear '):
                out.append('<p class="salute">%s</p>' % esc(t))
            else:
                out.append('<p class="opening">%s</p>' % D.render(toks))
        j += 1
    j += 1  # past 'Contents'

    # contents rows (paragraphs with an internal hyperlink) until first Heading 1
    contents = []
    while j < len(seq):
        el = seq[j]
        if el.tag == qn('w:p') and D.style(el) == 'Heading1':
            break
        if el.tag == qn('w:p'):
            toks = D.tokens(el)
            t = D.plain(toks)
            href = next((x['href'] for x in toks if x['k'] == 't' and x['href']), None)
            if t.strip() and href:
                contents.append((D.indent(el), t, href[1:]))
        j += 1
    rows = []  # (level, tn, tt, id)
    for ind, t, anchor in contents:
        t = t.replace(' ', ' ')
        if ind < 40:
            lvl = 'l1'
        elif ind >= 70:
            lvl = 'l4'
        elif re.match(r'^\d+\.\d+', t):
            lvl = 'l2'
        else:
            lvl = 'l3'
        if lvl in ('l1', 'l2'):
            tn, tt = (re.split(r'\t+|[ \u00a0]{2,}', t.strip(), maxsplit=1) + [''])[:2]
        elif lvl == 'l3':
            m = re.match(r'^([A-Z])\s+(.*)$', t.strip())
            tn, tt = (m.group(1), m.group(2)) if m else ('', t.strip())
        else:
            tn, tt = '', re.sub(r'^▪\s*|^■\s*', '', t.strip())
        tt = re.sub(r'\s+', ' ', tt).strip()
        rows.append((lvl, tn.strip(), tt, anchor))

    cl = ''.join('<li class="%s"><a href="#%s"><span class="tn">%s</span><span class="tt">%s</span></a></li>'
                 % (lvl, a, esc(tn), esc(tt)) for lvl, tn, tt, a in rows)
    out.append('<section class="contents" id="contents"><h2 class="ctitle">Contents</h2>'
               '<p class="cnote">Each entry is linked to the section it names.</p><ul>%s</ul></section>' % cl)

    # ---- sections -----------------------------------------------------------------------------
    body_els = seq[j:]
    sec_open = False
    cur_sec = None
    closing_started = False

    def first_bm(toks):
        b = D.bms(toks)
        return b[0] if b else None

    for el in body_els:
        tag = el.tag.split('}')[1]
        if tag == 'tbl':
            rows_ = el.findall(qn('w:tr'))
            tcs = rows_[0].findall(qn('w:tc'))
            if len(rows_) == 1 and len(tcs) == 2:  # ground banner
                ps = [D.tokens(p) for p in cell_paras(tcs[1])]
                texts = [D.plain(t).strip() for t in ps]
                bm = next((first_bm(t) for t in [D.tokens(p) for p in cell_paras(tcs[0])] + ps if first_bm(t)), None)
                texts = [t for t in texts if t]
                head_, _, rng_ = texts[0].partition('|')
                small = esc(head_.strip()) + ('<span style="text-transform:none;letter-spacing:.06em"> | %s</span>' % esc(rng_.strip()) if rng_.strip() else '')
                title = esc(' '.join(texts[1:]))
                out.append('<div class="ground"%s><small>%s</small><strong>%s</strong></div>'
                           % (' id="%s"' % bm if bm else '', small, title))
            else:  # schedule table
                head = rows_[0]
                ths = ''.join('<th>%s</th>' % esc(D.plain(D.tokens(p)).strip())
                              for tc in head.findall(qn('w:tc')) for p in cell_paras(tc)[:1])
                trs = []
                for tr in rows_[1:]:
                    cells = []
                    for n, tc in enumerate(tr.findall(qn('w:tc'))):
                        inner = '<br>'.join(D.render(D.tokens(p)) for p in cell_paras(tc) if D.plain(D.tokens(p)).strip())
                        if n == 0 and '<strong>' not in inner and '<em>' not in inner:
                            inner = '<strong>%s</strong>' % inner
                        cells.append('<td>%s</td>' % inner)
                    trs.append('<tr>%s</tr>' % ''.join(cells))
                out.append('<div class="tablewrap"><table class="sched"><thead><tr>%s</tr></thead><tbody>%s</tbody></table></div>'
                           % (ths, ''.join(trs)))
            continue
        if tag != 'p':
            continue
        toks = D.tokens(el)
        text = D.plain(toks)
        t = text.strip()
        bms = D.bms(toks)
        st = D.style(el)
        ind = D.indent(el)

        if not t:
            if bms:
                out.append(''.join('<span id="%s"></span>' % b for b in bms))
            continue

        if st == 'Heading1':
            if sec_open:
                out.append('</section>')
            num, title = (re.split(r'\t+|[ \u00a0]{2,}', t.strip(), maxsplit=1) + [''])[:2]
            cur_sec = int(re.match(r'\d+', num).group(0))
            bid = bms[0] if bms else 's_%s' % num
            out.append('<section class="sec" id="%s"><h2 class="h1"><span class="n">%s</span><span class="tt">%s</span></h2>'
                       % (bid, esc(num), esc(title.strip())))
            sec_open = True
            continue
        if st == 'Heading2':
            num, title = (re.split(r'\t+|[ \u00a0]{2,}', t.strip(), maxsplit=1) + [''])[:2]
            bid = bms[0] if bms else 's_%s' % num.replace('.', '_')
            out.append('<h3 class="h2" id="%s"><span class="n">%s</span><span class="tt">%s</span></h3>'
                       % (bid, esc(num), esc(title.strip())))
            continue

        if t.startswith('Yours faithfully'):
            if sec_open:
                out.append('</section>')
                sec_open = False
            closing_started = True
            out.append('<div class="closing"><p class="yf">%s</p><img class="sig" alt="Signature of Subrata Pati" src="%s">'
                       % (esc(t), sig))
            closing = 'name'
            continue
        if closing_started:
            if closing == 'name':
                out.append('<p class="nm">%s</p>' % esc(t))
                closing = 'role'
            elif closing == 'role':
                out.append('<p>%s</p>' % esc(t))
                closing = 'note'
            elif closing == 'note':
                out.append('<p class="encl">%s</p></div><footer class="legal">' % D.render(toks))
                closing = 'legal'
            else:
                out.append('<p>%s</p>' % D.render(toks))
            continue

        # subhead  "■  Title"
        if t.startswith('■'):
            title = esc(t.lstrip('■').strip())
            bid = bms[0] if bms else None
            out.append('<h4 class="subhead"%s>%s</h4>' % (' id="%s"' % bid if bid else '', title))
            continue

        m, cls = para_class(text, ind)
        if m:
            rest = D.drop_label(toks, m.end())
            label = esc(text[:m.end()].strip())
            bid = bms[0] if bms else None
            html_ = D.render(rest, skip_bm=(bid,) if bid else ())
            idattr = ' id="%s"' % bid if bid else ''
            if cls in ('np l1 wide', 'np l1', 'np l2') and bid:
                nlab = '<a class="n" href="#%s">%s</a>' % (bid, label)
            else:
                nlab = '<span class="n">%s</span>' % label
            out.append('<div class="%s"%s>%s<div class="t">%s</div></div>' % (cls, idattr, nlab, html_))
            continue

        # quotation
        if 72 <= ind < 90:
            out.append('<blockquote class="q">%s</blockquote>' % D.render(toks, quote=True))
            continue

        # question group heading within section 11
        if cur_sec == 11 and len(t) < 140 and all(x['b'] for x in toks if x['k'] == 't' and x['t'].strip()):
            out.append('<h4 class="qgroup">%s</h4>' % esc(t))
            continue

        if t.startswith('Mr Subrata Pati, 5 Riverside'):
            out.append('<p class="address">%s</p>' % D.render(toks))
            continue

        bid = bms[0] if bms else None
        out.append('<p class="ind"%s>%s</p>' % (' id="%s"' % bid if bid else '', D.render(toks, skip_bm=(bid,) if bid else ())))

    if closing_started:
        out.append('</footer>')
    elif sec_open:
        out.append('</section>')

    main = '<main class="sheet">\n' + '\n'.join(out) + '\n</main>'

    # ---- side menu --------------------------------------------------------------------------
    def li(lvl, tn, tt, a, kids_html=''):
        has = bool(kids_html)
        short = re.sub(r'\s*\(paragraphs?\b.*\)\s*$', '', tt).strip() if lvl in ('l3', 'l4') else tt
        btn = ('<button class="tg" type="button" aria-expanded="false" aria-label="Expand or collapse"></button>'
               if has else '<span class="tg none"></span>')
        return ('<li class="%s%s"><div class="row">%s<a href="#%s" title="%s"><span class="tn">%s</span>'
                '<span class="tt">%s</span></a></div>%s</li>'
                % (lvl, ' has' if has else '', btn, a, esc(tt), esc(tn), esc(short),
                   '<ul>%s</ul>' % kids_html if has else ''))

    tree, i = [], 0

    def take(level_set, start):
        """collect consecutive rows at deeper levels than rows[start]."""
        order = {'l1': 1, 'l2': 2, 'l3': 3, 'l4': 4}
        base = order[rows[start][0]]
        k = start + 1
        while k < len(rows) and order[rows[k][0]] > base:
            k += 1
        return k

    def build(start, end):
        order = {'l1': 1, 'l2': 2, 'l3': 3, 'l4': 4}
        html_, k = [], start
        while k < end:
            lvl, tn, tt, a = rows[k]
            nxt = take(None, k)
            kids_html = build(k + 1, nxt) if nxt > k + 1 else ''
            html_.append(li(lvl, tn, tt, a, kids_html))
            k = nxt
        return ''.join(html_)

    nav_list = build(0, len(rows))
    nav = ('<nav class="side" id="sidenav" aria-label="Contents"><div class="side-top"><p class="side-h">Contents</p>'
           '<span class="side-ctl"><button type="button" data-all="1">Expand all</button>'
           '<button type="button" data-all="0">Collapse all</button></span></div><ul class="tree">%s</ul></nav>' % nav_list)

    res = re.sub(r'<nav class="side".*?</nav>', lambda m: nav, tpl, count=1, flags=re.S)
    res = re.sub(r'<main class="sheet">.*?</main>', lambda m: main, res, count=1, flags=re.S)
    open(out_path, 'w', encoding='utf8').write(res)
    return len(rows), len(out)


if __name__ == '__main__':
    n, m = convert(*sys.argv[1:4])
    print('contents rows: %d, body blocks: %d' % (n, m))
