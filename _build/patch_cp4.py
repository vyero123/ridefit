import io
p='geom.js'; s=io.open(p,encoding='utf-8').read()
def rep(x,y):
    global s
    assert x in s, x[:70]; s=s.replace(x,y,1)
rep("""  function fitHtml(cfg, party) {""","""  /* ---------------- backseat room guidance ----------------
     Seated anthropometrics (approximate ratios of standing height, used only to translate a
     passenger's height into what headroom/legroom figures mean): sitting height ~0.52 H (crown
     above the seat cushion), comfortable SAE-style legroom ~0.55 H. Manufacturer headroom is
     measured from the seat cushion and legroom from the H-point, so these are indicative bands,
     not verdicts. */
  function roomBand(h, head, leg) {
    var needHead = h * 0.52 + 1.0;
    var needLeg = h * 0.55;
    var hs = has(head) ? head - needHead : null;
    var ls = has(leg) ? leg - needLeg : null;
    var worst = null;
    if (hs !== null) { worst = hs; }
    if (ls !== null) { worst = worst === null ? ls : Math.min(worst, ls); }
    if (worst === null) { return { band: 'unknown', hs: hs, ls: ls }; }
    var band = worst >= 2.5 ? 'roomy' : (worst >= 0 ? 'ok' : (worst >= -2.5 ? 'tight' : 'cramped'));
    return { band: band, hs: hs, ls: ls };
  }

  function rowLabel(n) { return n === 2 ? 'second row' : 'third row'; }

  /* Assign riders to rows: the reference person drives; the others fill row 2, then row 3, then
     the spare front seat, tallest first, so the guidance is about the seats people would actually use. */
  function assignRows(cfg, people) {
    var rows = has(cfg.rows) ? cfg.rows : 2;
    var seats = has(cfg.seats) ? cfg.seats : 5;
    var frontSeats = (seats >= 6 && rows <= 2 && cfg.bedLen) ? 3 : 2;
    var cap2 = rows >= 3 ? Math.min(3, seats - frontSeats - 2) : seats - frontSeats;
    if (cap2 < 0) { cap2 = 0; }
    var cap3 = rows >= 3 ? seats - frontSeats - cap2 : 0;
    var out = [], i, front = frontSeats - 1, r2 = cap2, r3 = cap3;
    var sorted = people.slice().sort(function (a, b) { return b.h - a.h; });
    for (i = 0; i < sorted.length; i++) {
      if (r2 > 0) { out.push({ p: sorted[i], row: 2 }); r2--; }
      else if (r3 > 0) { out.push({ p: sorted[i], row: 3 }); r3--; }
      else if (front > 0) { out.push({ p: sorted[i], row: 1 }); front--; }
      else { out.push({ p: sorted[i], row: 0 }); }
    }
    return out;
  }

  function roomHtml(cfg, party, metric) {
    var people = party.people || [];
    var o = [], i, a, r, b, who, txt, cls;
    var rows = has(cfg.rows) ? cfg.rows : 2;
    var name = cfg.model ? 'The ' + cfg.model : 'This vehicle';
    if (rows < 2) {
      return '<p class="vvy-room note">' + esc(name + ' has a single row of seats, so there is no back seat to judge.') + '</p>';
    }
    if (!has(cfg.headroom2) && !has(cfg.legroom2)) {
      return '<p class="vvy-room note">Rear-seat headroom and legroom are not on file for this configuration, so no back-seat guidance is given rather than guessing.</p>';
    }
    var gen = roomBand(70, cfg.headroom2, cfg.legroom2);
    var genTxt;
    if (gen.band === 'roomy') { genTxt = 'Second row: roomy enough for adults on a long drive'; }
    else if (gen.band === 'ok') { genTxt = 'Second row: works for average-height adults, with little to spare'; }
    else if (gen.band === 'tight') { genTxt = 'Second row: tight for adults — fine for shorter trips or kids'; }
    else { genTxt = 'Second row: really a kids-and-short-hops space'; }
    genTxt += ' (' + (has(cfg.headroom2) ? shortDim(cfg.headroom2, metric) + ' headroom' : '') + (has(cfg.headroom2) && has(cfg.legroom2) ? ', ' : '') + (has(cfg.legroom2) ? shortDim(cfg.legroom2, metric) + ' legroom' : '') + ').';
    if (rows >= 3 && has(cfg.legroom3)) {
      var g3 = roomBand(70, cfg.headroom3, cfg.legroom3);
      genTxt += ' Third row (' + (has(cfg.headroom3) ? shortDim(cfg.headroom3, metric) + ' headroom, ' : '') + shortDim(cfg.legroom3, metric) + ' legroom): ' + (g3.band === 'roomy' || g3.band === 'ok' ? 'genuinely usable by adults' : (g3.band === 'tight' ? 'kids first, adults for short hops' : 'best left to kids')) + '.';
    }
    o.push('<p class="vvy-room gen">' + esc(genTxt) + '</p>');

    if (people.length) {
      a = assignRows(cfg, people);
      o.push('<ul class="vvy-room list">');
      for (i = 0; i < a.length; i++) {
        r = a[i]; who = 'Your ' + esc(personLabel(r.p.h, metric)) + (r.p.kind === 'kid' ? ' kid' : ' adult');
        if (r.row === 0) { o.push('<li class="no">' + who + ' has no seat in this vehicle.</li>'); continue; }
        if (r.row === 1) { o.push('<li class="ok">' + who + ' rides up front' + (has(cfg.legroom1) ? ' (' + esc(shortDim(cfg.legroom1, metric)) + ' legroom)' : '') + '.</li>'); continue; }
        var head = r.row === 2 ? cfg.headroom2 : cfg.headroom3, leg = r.row === 2 ? cfg.legroom2 : cfg.legroom3;
        b = roomBand(r.p.h, head, leg);
        if (b.band === 'unknown') { o.push('<li class="note">' + who + ': ' + rowLabel(r.row) + ' room is not on file.</li>'); continue; }
        var why = [];
        if (b.hs !== null && b.hs < 0) { why.push('about ' + shortDim(-b.hs, metric) + ' short on headroom'); }
        if (b.ls !== null && b.ls < 0) { why.push('about ' + shortDim(-b.ls, metric) + ' short on legroom'); }
        if (b.band === 'roomy') { txt = who + ' should be comfortable in the ' + rowLabel(r.row) + ', even on a long drive.'; cls = 'ok'; }
        else if (b.band === 'ok') { txt = who + ' fits the ' + rowLabel(r.row) + ' with a little to spare' + (b.ls !== null && b.ls < 2 ? ' — knees may brush the seat ahead if it is slid back' : '') + '.'; cls = 'ok'; }
        else if (b.band === 'tight') { txt = who + ' will be tight in the ' + rowLabel(r.row) + ' of this one' + (why.length ? ' (' + why.join(', ') + ')' : '') + ' — fine for short trips.'; cls = 'warn'; }
        else { txt = who + ' will be cramped in the ' + rowLabel(r.row) + (why.length ? ' (' + why.join(', ') + ')' : '') + '.'; cls = 'no'; }
        o.push('<li class="' + cls + '">' + txt + '</li>');
      }
      o.push('</ul>');
    }
    var fl = [];
    if (cfg.approx && (indexOf(cfg.approx, 'headroom2') >= 0 || indexOf(cfg.approx, 'headroom3') >= 0)) { fl.push('headroom figures here are with the standard moonroof'); }
    if (cfg.approx && indexOf(cfg.approx, 'legroom3') >= 0) { fl.push('third-row legroom is the maximum of a sliding range'); }
    o.push('<p class="vvy-room caveat">Guidance, not a verdict: seat height, cushion angle and how far the front seats are set change real-world room by inches' + (fl.length ? '; ' + fl.join('; ') : '') + '.</p>');
    return o.join('');
  }

  function fitHtml(cfg, party) {""")
rep("""    fit: fit,
    fitHtml: fitHtml,""","""    fit: fit,
    fitHtml: fitHtml,
    roomHtml: roomHtml,
    roomBand: roomBand,""")
rep("""    if (has(cfg.seats)) { o.push(row('Seating',""","""    if (has(cfg.headroom2)) { o.push(row('2nd-row headroom', dim(cfg.headroom2, metric), isApprox(cfg, 'headroom2') ? a : '')); }
    if (has(cfg.legroom2)) { o.push(row('2nd-row legroom', dim(cfg.legroom2, metric), isApprox(cfg, 'legroom2') ? a : '')); }
    if (has(cfg.headroom3)) { o.push(row('3rd-row headroom', dim(cfg.headroom3, metric), isApprox(cfg, 'headroom3') ? a : '')); }
    if (has(cfg.legroom3)) { o.push(row('3rd-row legroom', dim(cfg.legroom3, metric), isApprox(cfg, 'legroom3') ? a : '')); }
    if (has(cfg.seats)) { o.push(row('Seating',""")
rep("""    { k: 'seats',     l: 'Seats',            more: 'More',    less: 'Fewer',    kind: 'count', unit: 'seat' },""",
"""    { k: 'seats',     l: 'Seats',            more: 'More',    less: 'Fewer',    kind: 'count', unit: 'seat' },
    { k: 'headroom2', l: '2nd-row headroom', more: 'Roomier', less: 'Tighter',  kind: 'dim' },
    { k: 'legroom2',  l: '2nd-row legroom',  more: 'Roomier', less: 'Tighter',  kind: 'dim' },
    { k: 'legroom3',  l: '3rd-row legroom',  more: 'Roomier', less: 'Tighter',  kind: 'dim' },""")
io.open(p,'w',encoding='utf-8').write(s)

h=io.open('shell.html',encoding='utf-8').read()
h=h.replace("""    <h3 class="sec">How it lines up with you</h3>
    <div id="comps">{{STATIC_COMPS}}</div>""","""    <h3 class="sec">How it lines up with you</h3>
    <div id="comps">{{STATIC_COMPS}}</div>
    <h3 class="sec">Back-seat room for your crew</h3>
    <div id="room">{{STATIC_ROOM}}</div>""")
h=h.replace("""      <div id="fitBox"></div>""","""      <div id="fitBox"></div>
      <div id="roomBox"></div>""")
io.open('shell.html','w',encoding='utf-8').write(h)

c=io.open('style.css',encoding='utf-8').read()
c=c.replace("footer { padding: 16px 12px 24px;", """.vvy-room { font-size: 14px; margin: 0 0 6px; }
.vvy-room.gen { font-weight: 500; }
.vvy-room.note { color: #7b8794; font-size: 13px; }
.vvy-room.caveat { color: #7b8794; font-size: 12px; margin-top: 6px; }
ul.vvy-room.list { padding-left: 0; list-style: none; margin: 4px 0 6px; }
ul.vvy-room.list li { padding: 6px 10px; border-radius: 8px; margin-bottom: 4px; font-size: 13px; }
ul.vvy-room.list li.ok { background: #e3f6ec; color: #0b5b32; }
ul.vvy-room.list li.warn { background: #fff4d6; color: #5a3d00; }
ul.vvy-room.list li.no { background: #fde8e6; color: #8a1c14; }
ul.vvy-room.list li.note { background: #f0f2f5; color: #52606d; }
#roomBox { margin: 4px 0 6px; }
footer { padding: 16px 12px 24px;""",1)
io.open('style.css','w',encoding='utf-8').write(c)

a=io.open('app.js',encoding='utf-8').read()
x="""    byId('fitBox').innerHTML = VVY.fitHtml(A, state.party);"""
assert x in a
a=a.replace(x,"""    byId('fitBox').innerHTML = VVY.fitHtml(A, state.party);
    byId('room').innerHTML = VVY.roomHtml(A, state.party, state.metric);
    byId('roomBox').innerHTML = VVY.roomHtml(A, state.party, state.metric);""",1)
io.open('app.js','w',encoding='utf-8').write(a)

b=io.open('build.py',encoding='utf-8').read()
b=b.replace("""var out = VVY.renderAll(cfg, 75, false);
process.stdout.write(JSON.stringify(out));""","""var out = VVY.renderAll(cfg, 75, false);
out.room = VVY.roomHtml(cfg, { people: [] }, false);
process.stdout.write(JSON.stringify(out));""")
b=b.replace("""    '{{STATIC_SRC}}': static['src'],""","""    '{{STATIC_SRC}}': static['src'],
    '{{STATIC_ROOM}}': static['room'],""")
io.open('build.py','w',encoding='utf-8').write(b)
print('patched')
