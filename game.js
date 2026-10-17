// Ludo Board -- rules engine plus the strategy chooser.
//
// The move ranking is NOT written here. The priority list and the scoring
// factors are read out of satatgy.txt at run time and every priority name found
// in that file must map to a scorer here, otherwise the analysis reports an
// error instead of inventing a rule.
(function (root) {
  "use strict";

  // ---- board geometry, mirrors what ludo-board.html draws -----------------

  var RING = [
    [1,6],[2,6],[3,6],[4,6],[5,6],
    [6,5],[6,4],[6,3],[6,2],[6,1],[6,0],
    [7,0],[8,0],
    [8,1],[8,2],[8,3],[8,4],[8,5],
    [9,6],[10,6],[11,6],[12,6],[13,6],[14,6],
    [14,7],[14,8],
    [13,8],[12,8],[11,8],[10,8],[9,8],
    [8,9],[8,10],[8,11],[8,12],[8,13],[8,14],
    [7,14],[6,14],
    [6,13],[6,12],[6,11],[6,10],[6,9],
    [5,8],[4,8],[3,8],[2,8],[1,8],[0,8],
    [0,7],[0,6]
  ];

  var BOX = {};
  RING.forEach(function (c, i) { BOX[c[0] + "," + c[1]] = i + 1; });
  var n = 53;
  for (var j = 1; j <= 5; j++) BOX[j + ",7"] = n++;
  for (j = 1; j <= 5; j++) BOX["7," + j] = n++;
  for (j = 13; j >= 9; j--) BOX[j + ",7"] = n++;
  for (j = 13; j >= 9; j--) BOX["7," + j] = n++;

  var boxToCell = {};
  Object.keys(BOX).forEach(function (k) {
    var p = k.split(",");
    boxToCell[BOX[k]] = { col: +p[0], row: +p[1] };
  });

  // progress model
  //   0..5    parked in the yard, only a 6 releases a token
  //   6..56   51 ring cells walked from the start box
  //   57..61  the five home-lane cells
  //   62      finished, standing on the home triangle
  var OUT = 6, RING_FROM = 6, RING_TO = 56, LANE_FROM = 57, LANE_TO = 61, FINISH = 62;

  var PLAYERS = {
    green:  { name: "Green",  start: BOX["1,6"],  lane: [53, 54, 55, 56, 57] },
    yellow: { name: "Yellow", start: BOX["8,1"],  lane: [58, 59, 60, 61, 62] },
    blue:   { name: "Blue",   start: BOX["13,8"], lane: [63, 64, 65, 66, 67] },
    red:    { name: "Red",    start: BOX["6,13"], lane: [68, 69, 70, 71, 72] }
  };
  var ORDER = ["green", "red", "yellow", "blue"];

  var SAFE_RING = [BOX["6,2"], BOX["12,6"], BOX["2,8"], BOX["8,12"]];
  var SAFE_TRI = { GHT: true, RHT: true, YHT: true, BHT: true };

  function wrap(i) { return ((i % 52) + 52) % 52; }
  function isSafeRing(r) { return SAFE_RING.indexOf(r) !== -1; }

  function ringAt(key, p) { return wrap(PLAYERS[key].start - 1 + (p - RING_FROM)) + 1; }

  function posOf(key, p) {
    if (p <= 5) return null;
    if (p >= FINISH) return { tri: true };
    if (p <= RING_TO) return { ring: ringAt(key, p) };
    return { lane: p - LANE_FROM + 1 };
  }

  function boxNumber(key, p) {
    if (p <= 5 || p >= FINISH) return null;
    var q = posOf(key, p);
    return q.ring != null ? q.ring : PLAYERS[key].lane[q.lane - 1];
  }

  // human wording for a progress value
  function spotName(key, p) {
    if (p == null) return "not set";
    if (p <= 5) return "Base";
    if (p >= FINISH) return "Finished";
    var box = boxNumber(key, p);
    return p <= RING_TO ? "Track box " + box : "Home path " + (p - LANE_FROM + 1);
  }

  // ---- legal moves --------------------------------------------------------

  function canMove(t, dice) {
    if (t.p >= FINISH) return false;
    if (t.p < OUT) return dice === OUT;
    return t.p + dice <= FINISH;
  }

  function legalMoves(mine, dice) {
    var finished = mine.filter(function (t) { return t.p >= FINISH; }).length;
    var out = [];
    mine.forEach(function (t) {
      if (!canMove(t, dice)) return;
      var next = t.p < OUT ? OUT : t.p + dice;
      out.push({ token: t, from: t.p, to: next, fin: finished + (next >= FINISH ? 1 : 0) });
    });
    return out;
  }

  // opponent tokens standing on a ring cell (yards and lanes are protected)
  function opponentOn(ring, opp) {
    var hits = 0;
    opp.forEach(function (t) {
      if (t.p < RING_FROM || t.p >= FINISH) return;
      if (ringAt(t.key, t.p) === ring) hits++;
    });
    return hits;
  }

  // how many opponent tokens could reach this ring cell on 1..6
  function threatOn(ring, opp) {
    var n = 0;
    opp.forEach(function (t) {
      if (t.p < RING_FROM || t.p > RING_TO) return;
      var gap = wrap(ring - ringAt(t.key, t.p));
      if (gap >= 1 && gap <= 6) n++;
    });
    return n;
  }

  // ---- strategy text ------------------------------------------------------

  // pulls the numbered priority list and the scoring factors out of satatgy.txt.
  // inside the priority section a numbered line that carries a colon is a
  // priority item, a numbered line without one is the start of the next section
  function parseStrategy(text) {
    var lines = text.split(/\r?\n/);
    var priorities = [];
    var factors = [];
    var section = null;

    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i].trim();
      if (!ln) continue;

      // a numbered heading and a bare heading name both have to be recognised,
      // so strip the leading "2. " before testing the section names
      var head = ln.match(/^(\d+)\.\s+(.+)$/);
      var body = head ? head[2] : ln;

      if (/^move choose karne ki priority/i.test(body)) { section = "priority"; continue; }
      if (/^move scoring system/i.test(body)) { section = "scoring"; continue; }

      if (head) {
        var item = body.match(/^(.+?):/);
        if (section === "priority" && item) {
          priorities.push(item[1].trim());
          continue;
        }
        section = null;                    // a plain numbered heading ends it
        continue;
      }

      if (section === "scoring" && /^-\s+/.test(ln)) {
        factors.push(ln.replace(/^-\s+/, "").trim());
      }
    }

    if (!priorities.length) {
      return { ok: false, error: "satatgy.txt se priority list nahi mili. File ya uska format badal gaya hai." };
    }
    return { ok: true, priorities: priorities, factors: factors, raw: text };
  }

  // one scorer per priority name that appears in the file. A name in the file
  // with no scorer here is reported as unsupported -- never guessed at.
  var SCORERS = {
    "winning move": function (c) {
      return c.mv.fin === c.mine.length ? 1 : 0;
    },
    "save token": function (c) {
      var from = c.fromDest && c.fromDest.ring, to = c.dest && c.dest.ring;
      if (from == null || to == null) return 0;
      return (threatOn(from, c.opp) - threatOn(to, c.opp)) * 10;
    },
    "capture opponent": function (c) {
      if (!c.dest || c.dest.ring == null) return 0;
      return opponentOn(c.dest.ring, c.opp) * 100;
    },
    "finish token": function (c) {
      if (c.mv.to < FINISH) return 0;
      return 1000 + c.mv.to;
    },
    "reach safe square": function (c) {
      return c.dest && c.dest.ring != null && isSafeRing(c.dest.ring) ? 100 : 0;
    },
    "create winning position": function (c) {
      var open = 0;
      c.mine.forEach(function (t) {
        if (t !== c.mv.token && canMove(t, c.dice)) open++;
      });
      return open * 10;
    },
    "develop new tokens": function (c) {
      var wasOut = c.mv.from >= RING_FROM;
      var isOut = c.mv.to >= RING_FROM;
      return (isOut ? 10 : 0) + (wasOut ? 0 : 50) + c.active * 10;
    },
    "best progress": function (c) {
      return (c.mv.to - c.mv.from) * 100 + c.mv.to;
    }
  };

  var PRIORITY_TEXT = {
    "winning move": "wins the match outright",
    "save token": "takes the token out of reach",
    "capture opponent": "cuts an opponent token",
    "finish token": "finishes a token",
    "reach safe square": "lands on a safe square",
    "create winning position": "keeps the most follow-up moves open",
    "develop new tokens": "brings more tokens onto the board",
    "best progress": "makes the most progress"
  };

  // the risk factor satatgy.txt lists under "Move Scoring System", applied
  // after the priority list is exhausted
  function riskPenalty(c) {
    if (!c.dest || c.dest.ring == null) return 0;
    if (isSafeRing(c.dest.ring)) return 0;
    return threatOn(c.dest.ring, c.opp) * 500;
  }

  function buildVector(names, ctx) {
    var v = names.map(function (name) {
      var fn = SCORERS[name.toLowerCase()];
      return fn ? fn(ctx) : 0;
    });
    v.push(-riskPenalty(ctx));
    return v;
  }

  function cmp(a, b) {
    for (var i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return a[i] - b[i];
    }
    return 0;
  }

  // names the highest priority that actually fired for this move
  function describeTop(vec, names) {
    for (var i = 0; i < names.length; i++) {
      if (vec[i] > 0) {
        return names[i] + " — " + (PRIORITY_TEXT[names[i].toLowerCase()] || names[i].toLowerCase());
      }
    }
    var last = names.length - 1;
    return names[last] + " — " + (PRIORITY_TEXT[names[last].toLowerCase()] || names[last].toLowerCase());
  }

  // ---- recommendation -----------------------------------------------------

  // returns { ok:false, error } or { ok:true, move, box, reason, priorities, ranked }
  function recommend(opts) {
    var mine = opts.mine, opp = opts.opp, key = opts.key, dice = opts.dice, strategy = opts.strategy;

    if (!strategy || !strategy.ok) {
      return { ok: false, error: (strategy && strategy.error) || "Strategy file load nahi hui." };
    }
    var names = strategy.priorities;
    var missing = names.filter(function (nm) { return !SCORERS[nm.toLowerCase()]; });
    if (missing.length) {
      return {
        ok: false,
        error: "satatgy.txt ke ye rules implement nahi hue: " + missing.join(", ") +
               ". Inpe recommendation generate nahi ho sakti."
      };
    }

    var moves = legalMoves(mine, dice);
    if (!moves.length) return { ok: true, move: null, noMove: true, priorities: names };

    var active = mine.filter(function (t) { return t.p >= RING_FROM && t.p < FINISH; }).length;
    var ranked = moves.map(function (mv) {
      var ctx = {
        mine: mine, opp: opp, key: key, dice: dice, mv: mv, active: active,
        fromDest: posOf(key, mv.from), dest: posOf(key, mv.to)
      };
      return { move: mv, vec: buildVector(names, ctx), ctx: ctx };
    });
    ranked.sort(function (a, b) { return cmp(b.vec, a.vec); });

    var best = ranked[0];
    var reason;
    if (ranked.length === 1) {
      reason = "only legal move on this roll — " + describeTop(best.vec, names);
    } else {
      // the first priority where the winner beats the runner-up is the reason
      for (var i = 0; i < names.length; i++) {
        if (best.vec[i] !== ranked[1].vec[i] && best.vec[i] > 0) {
          reason = names[i] + " — " + (PRIORITY_TEXT[names[i].toLowerCase()] || names[i].toLowerCase());
          break;
        }
      }
      if (!reason) reason = describeTop(best.vec, names);
    }

    var box = boxNumber(key, best.move.to);
    return {
      ok: true,
      move: best.move,
      box: box,
      finished: best.move.to >= FINISH,
      reason: reason,
      priorities: names,
      ranked: ranked.map(function (r) {
        return {
          token: r.move.token.label,
          from: r.move.from,
          to: r.move.to,
          box: boxNumber(key, r.move.to),
          vector: r.vec
        };
      })
    };
  }

  root.Ludo = {
    RING: RING, BOX: BOX, boxToCell: boxToCell,
    PLAYERS: PLAYERS, ORDER: ORDER, SAFE_RING: SAFE_RING, SAFE_TRI: SAFE_TRI,
    OUT: OUT, FINISH: FINISH, RING_FROM: RING_FROM, RING_TO: RING_TO,
    LANE_FROM: LANE_FROM, LANE_TO: LANE_TO,
    ringAt: ringAt, posOf: posOf, boxNumber: boxNumber, spotName: spotName,
    isSafeRing: isSafeRing, canMove: canMove, legalMoves: legalMoves,
    opponentOn: opponentOn, threatOn: threatOn,
    parseStrategy: parseStrategy, recommend: recommend,

    // 1v1: play against the diagonally opposite colour, unchanged
    opponentOf: function (key) {
      return key === "green" ? "blue" : key === "blue" ? "green" : key === "red" ? "yellow" : "red";
    },
    // 2v2: the two diagonals are the teams, so my partner is the colour opposite me
    teamOf: function (key) {
      var foe = key === "green" ? "blue" : key === "blue" ? "green" : key === "red" ? "yellow" : "red";
      return [key, foe];
    },
    loadStrategy: function (url) {
      return fetch(url, { cache: "no-store" })
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.text();
        })
        .then(function (t) { return parseStrategy(t); })
        .catch(function (e) {
          return { ok: false, error: "satatgy.txt load nahi hua (" + e.message + "). Analysis chala nahi ja sakta." };
        });
    }
  };
})(typeof window !== "undefined" ? window : globalThis);