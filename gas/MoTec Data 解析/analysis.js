/* ============================================================================
 * analysis.js — セットアップ解析エンジン
 *  (1) 計算チャンネル再現 (User.xml / Brake endless.xml 由来)
 *  (2) ラップ区間ごとの車両姿勢・ブレーキ・スリップ指標の集計
 *  (3) ルールベースのセット変更提案 (GT/ハコ車, オフライン)
 *  (4) Claude API 用の数値サマリ生成 (生ldは送らない)
 * 依存: LD (ld_engine.js) — window.LD
 * ==========================================================================*/
(function (global) {
  'use strict';

  /* ---- 低レベル: あるファイルの、あるラップ区間の生サンプルを取り出す ---- */
  function chanWindow(file, name, lap) {
    const LD = global.LD;
    if (!file.cache[name]) {
      const c = file.header.channels.find((x) => x.name === name);
      if (!c) return null;
      file.cache[name] = { ch: c, data: LD.loadChannel(file.buf, c) };
    }
    const co = file.cache[name];
    const f = co.ch.freq || 1;
    const s = Math.floor(lap.tStart * f);
    const e = Math.min(Math.floor(lap.tEnd * f), co.data.length);
    return { data: co.data, s, e, f, unit: co.ch.unit };
  }
  function has(file, name) {
    return !!file.header.channels.find((x) => x.name === name);
  }

  /* ---- 統計ヘルパ ---- */
  function agg(win) {
    if (!win) return null;
    let mn = Infinity, mx = -Infinity, sum = 0, n = 0, absSum = 0;
    for (let i = win.s; i < win.e; i++) {
      const v = win.data[i];
      if (!isFinite(v)) continue;
      if (v < mn) mn = v; if (v > mx) mx = v; sum += v; absSum += Math.abs(v); n++;
    }
    if (!n) return null;
    return { min: mn, max: mx, avg: sum / n, absAvg: absSum / n, n, range: mx - mn };
  }
  // 2つの同期窓を要素ごとに演算 (freqが同じ前提。異なる時は短い方に合わせる)
  function combine(winA, winB, fn) {
    if (!winA || !winB) return null;
    const nA = winA.e - winA.s, nB = winB.e - winB.s;
    const n = Math.min(nA, nB);
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = fn(winA.data[winA.s + i], winB.data[winB.s + i]);
    return { data: out, s: 0, e: n, f: winA.f };
  }
  function aggArr(arr, filterFn) {
    let mn = Infinity, mx = -Infinity, sum = 0, n = 0, absSum = 0;
    for (const v of arr) {
      if (!isFinite(v)) continue;
      if (filterFn && !filterFn(v)) continue;
      if (v < mn) mn = v; if (v > mx) mx = v; sum += v; absSum += Math.abs(v); n++;
    }
    if (!n) return null;
    return { min: mn, max: mx, avg: sum / n, absAvg: absSum / n, n, range: mx - mn };
  }

  /* ==========================================================================
   * 計算チャンネル: 生chから派生chを作る (グラフにも出せる)
   * 返り値 {data, f}  (freq基準は元chに合わせる)
   * ========================================================================*/
  const DERIVED = {
    'RH Roll Fr': { need: ['Ride Height FR', 'Ride Height FL'], unit: 'mm',
      calc: (f, lap) => combine(chanWindow(f, 'Ride Height FR', lap), chanWindow(f, 'Ride Height FL', lap), (a, b) => a - b) },
    'RH Roll Rr': { need: ['Ride Height RR', 'Ride Height RL'], unit: 'mm',
      calc: (f, lap) => combine(chanWindow(f, 'Ride Height RR', lap), chanWindow(f, 'Ride Height RL', lap), (a, b) => a - b) },
    'RH Pitching': { need: ['Ride Height FL', 'Ride Height FR', 'Ride Height RL', 'Ride Height RR'], unit: 'mm',
      calc: (f, lap) => {
        const fl = chanWindow(f, 'Ride Height FL', lap), fr = chanWindow(f, 'Ride Height FR', lap),
          rl = chanWindow(f, 'Ride Height RL', lap), rr = chanWindow(f, 'Ride Height RR', lap);
        const n = Math.min(fl.e - fl.s, fr.e - fr.s, rl.e - rl.s, rr.e - rr.s);
        const out = new Float64Array(n);
        for (let i = 0; i < n; i++) out[i] = (fl.data[fl.s + i] + fr.data[fr.s + i]) / 2 - (rl.data[rl.s + i] + rr.data[rr.s + i]) / 2;
        return { data: out, s: 0, e: n, f: fl.f };
      } },
    'DP Roll Fr': { need: ['Damper Pos FR', 'Damper Pos FL'], unit: 'mm',
      calc: (f, lap) => combine(chanWindow(f, 'Damper Pos FR', lap), chanWindow(f, 'Damper Pos FL', lap), (a, b) => (-a) - (-b)) },
    'DP Roll Rr': { need: ['Damper Pos RR', 'Damper Pos RL'], unit: 'mm',
      calc: (f, lap) => combine(chanWindow(f, 'Damper Pos RR', lap), chanWindow(f, 'Damper Pos RL', lap), (a, b) => (-a) - (-b)) },
    'Brake Bal Front%': { need: ['Brake Pres FL', 'Brake Pres FR', 'Brake Pres RL', 'Brake Pres RR'], unit: '%',
      calc: (f, lap) => {
        const fl = chanWindow(f, 'Brake Pres FL', lap), fr = chanWindow(f, 'Brake Pres FR', lap),
          rl = chanWindow(f, 'Brake Pres RL', lap), rr = chanWindow(f, 'Brake Pres RR', lap);
        const n = Math.min(fl.e - fl.s, fr.e - fr.s, rl.e - rl.s, rr.e - rr.s);
        const out = new Float64Array(n);
        for (let i = 0; i < n; i++) {
          const F = (fl.data[fl.s + i] + fr.data[fr.s + i]) / 2, R = (rl.data[rl.s + i] + rr.data[rr.s + i]) / 2;
          out[i] = (F + R > 3) ? (F / (F + R)) * 100 : NaN;
        }
        return { data: out, s: 0, e: n, f: fl.f };
      } },
    'Slip Rear%': { need: ['Wheel Speed RL', 'Wheel Speed RR', 'Wheel Speed FL', 'Wheel Speed FR'], unit: '%',
      calc: (f, lap) => {
        const rl = chanWindow(f, 'Wheel Speed RL', lap), rr = chanWindow(f, 'Wheel Speed RR', lap),
          fl = chanWindow(f, 'Wheel Speed FL', lap), fr = chanWindow(f, 'Wheel Speed FR', lap);
        const n = Math.min(rl.e - rl.s, rr.e - rr.s, fl.e - fl.s, fr.e - fr.s);
        const out = new Float64Array(n);
        for (let i = 0; i < n; i++) {
          const rear = (rl.data[rl.s + i] + rr.data[rr.s + i]) / 2, front = (fl.data[fl.s + i] + fr.data[fr.s + i]) / 2;
          out[i] = rear > 20 ? (rear - front) / rear * 100 : NaN;
        }
        return { data: out, s: 0, e: n, f: rl.f };
      } },
  };

  // ch(生 or 派生)が最終的に生chまで解決できるか(循環防止付き)
  function resolvable(file, name, seen) {
    seen = seen || new Set();
    if (has(file, name)) return true;          // 生ch
    const d = DERIVED[name];
    if (!d) return false;
    if (seen.has(name)) return false;          // 循環
    seen.add(name);
    return d.need.every((nm) => resolvable(file, nm, seen));
  }
  function derivedAvailable(file) {
    return Object.keys(DERIVED).filter((k) => resolvable(file, k));
  }
  // グラフ用: 派生chの窓を返す (無ければnull)。派生→派生の依存も辿る。
  function derivedWindow(file, name, lap) {
    const d = DERIVED[name];
    if (!d || !resolvable(file, name)) return null;
    return d.calc(file, lap);
  }

  /* ==========================================================================
   * ラップ1本のセットアップ指標を集計 (提案とサマリの元データ)
   * ========================================================================*/
  function lapMetrics(file, lap) {
    const m = { file: file.label, lap: lap.lap, dur: lap.dur, avail: {} };
    const gLat = chanWindow(file, 'G Force Lat', lap);
    const gLong = chanWindow(file, 'G Force Long', lap);
    if (gLat) m.gLat = agg(gLat);
    if (gLong) {
      // ブレーキ(負)と加速(正)を分離
      let brakeMin = 0, accMax = 0;
      for (let i = gLong.s; i < gLong.e; i++) { const v = gLong.data[i]; if (v < brakeMin) brakeMin = v; if (v > accMax) accMax = v; }
      m.brakeGmax = brakeMin; m.accGmax = accMax;
    }
    // 姿勢
    const roll = { };
    const rhRollFr = derivedWindow(file, 'RH Roll Fr', lap);
    const rhRollRr = derivedWindow(file, 'RH Roll Rr', lap);
    const rhPitch = derivedWindow(file, 'RH Pitching', lap);
    if (rhRollFr) m.rollFr = agg(rhRollFr);
    if (rhRollRr) m.rollRr = agg(rhRollRr);
    if (rhPitch) m.pitch = agg(rhPitch);
    // ダンパー速度域 (レンジ)
    for (const w of ['FL', 'FR', 'RL', 'RR']) {
      const d = chanWindow(file, 'Damper Pos ' + w, lap);
      if (d) { m['damper' + w] = agg(d); }
    }
    // ブレーキ配分
    const bbf = derivedWindow(file, 'Brake Bal Front%', lap);
    if (bbf) m.brakeBalFront = aggArr(bbf.data, (v) => isFinite(v));
    // ブレーキ圧
    for (const w of ['FL', 'FR', 'RL', 'RR']) {
      const b = chanWindow(file, 'Brake Pres ' + w, lap);
      if (b) m['brakePres' + w] = agg(b);
    }
    // リアスリップ(トラクション)
    const slip = derivedWindow(file, 'Slip Rear%', lap);
    if (slip) m.slipRear = aggArr(slip.data, (v) => isFinite(v) && v > -50 && v < 50);
    // ヨーレート
    const yaw = chanWindow(file, 'ABS Yaw Rate', lap);
    if (yaw) m.yaw = agg(yaw);
    // 最高速・最低速
    const spd = chanWindow(file, 'Drive Speed', lap);
    if (spd) m.speed = agg(spd);
    return m;
  }

  /* ==========================================================================
   * 区間(コーナー)自動検出 + 区間別集計
   *  横G(G Force Lat)の絶対値でコーナー/ストレートを切り分け、
   *  各コーナーで 速度/G/スリップ/舵角/ブレーキ を集計。距離位置でラベル。
   * ========================================================================*/
  function lapDistanceTable(file, lap) {
    const spd = chanWindow(file, 'Drive Speed', lap);
    if (!spd) return null;
    const n = spd.e - spd.s;
    // ★Lap Distance(実記録)を最優先(i2と同じ距離軸)。無い/壊れてる時のみ速度積分。
    const ldw = chanWindow(file, 'Lap Distance', lap);
    if (ldw) {
      const ln = ldw.e - ldw.s; let mn = Infinity, mx = -Infinity;
      for (let i = ldw.s; i < ldw.e; i++) { const v = ldw.data[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
      if (isFinite(mx - mn) && (mx - mn) > 200) {
        const seg = new Float64Array(ln); for (let i = 0; i < ln; i++) seg[i] = ldw.data[ldw.s + i];
        let start = 0; for (let i = 1; i < ln; i++) { if (seg[i - 1] - seg[i] > 100) start = i; } // 最後のリセット点
        const base = seg[start]; const dist = new Float64Array(n);
        for (let i = 0; i < n; i++) {
          const fpos = i / n * ln; const li = Math.floor(fpos); const frac = fpos - li;
          if (li < start) { dist[i] = 0; continue; }
          const a = seg[li] - base; const b = (li + 1 < ln ? seg[li + 1] : seg[li]) - base;
          let v = a + (b - a) * frac; if (v < 0) v = 0; dist[i] = v;
        }
        for (let i = 1; i < n; i++) if (dist[i] < dist[i - 1]) dist[i] = dist[i - 1];
        const tot = dist[n - 1];
        if (tot > 200) return { dist, total: tot || 1, f: spd.f, s: spd.s, e: spd.e, n, src: 'lapdist' };
      }
    }
    const dist = new Float64Array(n); let acc = 0;
    for (let i = 0; i < n; i++) { acc += Math.max(0, spd.data[spd.s + i]) / 3.6 / spd.f; dist[i] = acc; }
    return { dist, total: acc || 1, f: spd.f, s: spd.s, e: spd.e, n, src: 'integ' };
  }
  function sectorAnalysis(file, lap) {
    const gLat = chanWindow(file, 'G Force Lat', lap);
    const spd = chanWindow(file, 'Drive Speed', lap);
    if (!gLat || !spd) return null;
    const dt = lapDistanceTable(file, lap);
    const f = gLat.f, n = gLat.e - gLat.s;
    const ON = 0.35, OFF = 0.22; // ヒステリシス閾値[G]: コーナー判定
    const MINDUR = 0.4;          // 最短コーナー時間[s] (ノイズ除去)
    // フレーム→距離[m] 変換 (freqずれ吸収)
    const distAt = (i) => { if (!dt) return null; const di = Math.min(dt.n - 1, Math.round(i / f * dt.f)); return dt.dist[di]; };
    // コーナー区間を抽出 [{i0,i1}]
    const segs = []; let inC = false, i0 = 0;
    for (let i = 0; i < n; i++) {
      const a = Math.abs(gLat.data[gLat.s + i]);
      if (!inC && a > ON) { inC = true; i0 = i; }
      else if (inC && a < OFF) { inC = false; if ((i - i0) / f >= MINDUR) segs.push({ i0, i1: i }); }
    }
    if (inC && (n - i0) / f >= MINDUR) segs.push({ i0, i1: n });
    // 各コーナーを集計
    const win = (name) => { const w = DERIVED[name] ? derivedWindow(file, name, lap) : chanWindow(file, name, lap); return w; };
    const chLat = gLat, chLong = chanWindow(file, 'G Force Long', lap),
      chSteer = chanWindow(file, 'Steering Angle', lap),
      chSlip = derivedWindow(file, 'Slip Rear%', lap),
      chBrake = chanWindow(file, 'Brake Pres FL', lap) || chanWindow(file, 'ABS Brake Pres', lap),
      chAps = chanWindow(file, 'aps', lap);
    const segAgg = (ch, i0, i1, freqSrc) => {
      if (!ch) return null; const fr = ch.f, k0 = Math.round(i0 / f * fr), k1 = Math.round(i1 / f * fr);
      let mn = Infinity, mx = -Infinity, sum = 0, cnt = 0, absMax = 0;
      for (let k = k0; k < k1; k++) { const v = ch.data[ch.s + k]; if (!isFinite(v)) continue; if (v < mn) mn = v; if (v > mx) mx = v; if (Math.abs(v) > absMax) absMax = Math.abs(v); sum += v; cnt++; }
      return cnt ? { min: mn, max: mx, avg: sum / cnt, absMax } : null;
    };
    const corners = segs.map((s, idx) => {
      const dir = (() => { let sm = 0; for (let i = s.i0; i < s.i1; i++) sm += gLat.data[gLat.s + i]; return sm >= 0 ? 'R' : 'L'; })();
      return {
        idx: idx + 1,
        distStart: distAt(s.i0), distEnd: distAt(s.i1),
        dur: (s.i1 - s.i0) / f,
        dir,
        latMax: segAgg(chLat, s.i0, s.i1) && segAgg(chLat, s.i0, s.i1).absMax,
        speedMin: segAgg(spd, s.i0, s.i1) && segAgg(spd, s.i0, s.i1).min,
        speedEntry: (() => { const a = segAgg(spd, Math.max(0, s.i0 - Math.round(0.3 * f)), s.i0); return a ? a.avg : null; })(),
        longMin: segAgg(chLong, s.i0, s.i1) && segAgg(chLong, s.i0, s.i1).min, // 減速G
        steerMax: segAgg(chSteer, s.i0, s.i1) && segAgg(chSteer, s.i0, s.i1).absMax,
        slipMax: segAgg(chSlip, s.i0, s.i1) && segAgg(chSlip, s.i0, s.i1).absMax,
        brakeMax: segAgg(chBrake, s.i0, s.i1) && segAgg(chBrake, s.i0, s.i1).max,
        apsMin: segAgg(chAps, s.i0, s.i1) && segAgg(chAps, s.i0, s.i1).min,
      };
    });
    return { corners, total: dt ? dt.total : null };
  }
  /* 2ラップの区間別得失タイム: 累積得失(Time Variance)の区間端点差を使う。
   * これにより区間deltaの合計が必ずラップタイム差に一致する(境界ずれで過大にならない)。 */
  function sectorCompare(baseFile, baseLap, compFile, compLap) {
    const tb = lapDistanceTable(baseFile, baseLap), tc = lapDistanceTable(compFile, compLap);
    const secB = sectorAnalysis(baseFile, baseLap);
    if (!tb || !tc || !secB) return null;
    // 距離割合(0..1)で対応付ける(両ラップの総距離差による末端ずれを防ぐ)。
    // frac位置の経過時間: そのラップの総距離×fracに達するまでの時間。
    const timeAtFrac = (tbl, frac) => { const d = tbl.total * frac; let lo = 0, hi = tbl.dist.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (tbl.dist[m] < d) lo = m + 1; else hi = m; } return lo / tbl.f; };
    // 累積得失(comp-base) at frac
    const cumDelta = (frac) => timeAtFrac(tc, frac) - timeAtFrac(tb, frac);
    const out = []; let prevFrac = 0;
    for (const c of secB.corners) {
      if (c.distStart == null || c.distEnd == null) continue;
      const f1 = Math.min(1, c.distEnd / tb.total);
      const delta = cumDelta(f1) - cumDelta(prevFrac);
      out.push({ idx: c.idx, dir: c.dir, distStart: c.distStart, distEnd: c.distEnd, delta });
      prevFrac = f1;
    }
    // 末端(最後のコーナー末〜ゴール)の残差も最後の区間に含める
    if (out.length) { out[out.length - 1].delta += cumDelta(1) - cumDelta(prevFrac); }
    return out;
  }

  /* ==========================================================================
   * ルールベース提案エンジン (GT/ハコ車)
   * 2ラップ(base=基準/良い方, comp=比較対象)のmetricsを取り、
   * 差分と絶対値から具体的セット変更案を root cause 付きで返す。
   * ========================================================================*/
  function num(x, d = 1) { return x == null ? null : +x.toFixed(d); }

  function suggest(baseM, compM) {
    // base=速い/良い方を基準に、comp(=もう一方)を良くする提案を出す。
    // 単一データ解析(compのみ)も可: baseM を null にすると絶対値ルールのみ。
    const findings = [];
    const add = (area, severity, obs, cause, action, evidence) =>
      findings.push({ area, severity, obs, cause, action, evidence });

    const M = compM; // 分析対象
    const B = baseM;

    // --- 1. コーナリングバランス: ロール量の前後差 ---
    if (M.rollFr && M.rollRr) {
      const fr = Math.abs(M.rollFr.range), rr = Math.abs(M.rollRr.range);
      const ratio = rr > 0.1 ? fr / rr : null;
      if (ratio != null) {
        if (ratio < 0.8) {
          add('バランス', 'high',
            `リアのロール量(${num(rr)}mm)がフロント(${num(fr)}mm)より大きい`,
            'リアのロール剛性が相対的に低く、リアが逃げやすい(オーバーステア傾向 or リアグリップ不足)',
            'リアARBを1段強める / リアスプリングレート↑ or フロントARBを緩める。ジオメトリーではリアtoe-inを僅かに増やし安定方向',
            `Rr roll range ${num(rr)}mm vs Fr ${num(fr)}mm (比 ${num(ratio, 2)})`);
        } else if (ratio > 1.25) {
          add('バランス', 'high',
            `フロントのロール量(${num(fr)}mm)がリア(${num(rr)}mm)より大きい`,
            'フロントのロール剛性が相対的に低く、フロントが逃げる(アンダーステア傾向)',
            'フロントARBを1段強める / フロントスプリングレート↑ or リアARBを緩める。フロントcamberを増やし外輪の接地を稼ぐのも有効',
            `Fr roll range ${num(fr)}mm vs Rr ${num(rr)}mm (比 ${num(ratio, 2)})`);
        }
      }
    }

    // --- 2. ピッチング(ブレーキング時の前のめり) ---
    if (M.pitch) {
      const pitchRange = Math.abs(M.pitch.range);
      if (pitchRange > 40) {
        add('姿勢', 'medium',
          `ピッチング変化が大きい(${num(pitchRange)}mm)`,
          'ブレーキング〜加速でのノーズダイブ/リアスクワットが大きく、空力バランスと荷重移動が不安定',
          'フロント車高をやや上げる or フロントバンプラバー/3rdスプリングで底付き対策。リアはスクワット過大ならリア圧側減衰↑',
          `RH Pitching range ${num(pitchRange)}mm`);
      }
    }

    // --- 3. ブレーキ前後バランス ---
    if (M.brakeBalFront && M.brakeBalFront.avg) {
      const bf = M.brakeBalFront.avg;
      if (bf > 72) {
        add('ブレーキ', 'medium',
          `ブレーキ前配分が高い(前${num(bf)}%)`,
          'フロントに制動が寄りすぎ、進入でフロントロック/アンダー気味の可能性',
          'ブレーキバランスを後ろへ1〜2%。フロントロックが出るならフロントパッドμを僅かに下げる or リアμ↑。ABS介入が早いなら閾値見直し',
          `Brake Bal Front avg ${num(bf)}%`);
      } else if (bf < 60) {
        add('ブレーキ', 'medium',
          `ブレーキ前配分が低い(前${num(bf)}%)`,
          'リアに制動が寄り、進入でリアが不安定(オーバー傾向)になりやすい',
          'ブレーキバランスを前へ1〜2%。リアロックの兆候があればリアパッドμ↓ / リア圧側で姿勢安定',
          `Brake Bal Front avg ${num(bf)}%`);
      }
    }

    // --- 4. リアトラクション(スリップ) ---
    if (M.slipRear && M.slipRear.avg != null) {
      const sr = M.slipRear.max;
      if (sr > 8) {
        add('トラクション', 'high',
          `脱出でリアスリップが大きい(最大${num(sr)}%)`,
          'リアの縦グリップ不足でホイールスピン。トラクション不足でタイム損失',
          'リア車高↑でリアの荷重を稼ぐ / リアスプリング柔らかめ / リアウィング角度↑(高速域)。トラコン介入を1段早める。デフ設定があればロック率見直し',
          `Slip Rear max ${num(sr)}% (avg ${num(M.slipRear.avg)}%)`);
      }
    }

    // --- 5. ヨー安定性 ---
    if (M.yaw) {
      const yawRange = M.yaw.range;
      if (yawRange > 90) {
        add('安定性', 'low',
          `ヨーレート変動が大きい(${num(yawRange)}deg/s)`,
          '旋回中の姿勢変化が大きく、車が神経質。リア安定性 or ジオメトリー要因',
          'リアtoe-in増、リアウィング↑で高速安定。キャスター↑でセルフアライニング強化も検討',
          `Yaw range ${num(yawRange)}deg/s`);
      }
    }

    // --- 6. base比較(2データ): セクター/全体タイム差の主因 ---
    let deltaNote = null;
    if (B) {
      const dt = M.dur - B.dur;
      deltaNote = { deltaSec: num(dt, 3), baseLabel: `${B.file} L${B.lap}`, compLabel: `${M.file} L${M.lap}` };
      // 最高速比較
      if (M.speed && B.speed) {
        const dv = M.speed.max - B.speed.max;
        if (Math.abs(dv) > 3) {
          add('比較', 'info',
            `最高速が基準比 ${dv > 0 ? '+' : ''}${num(dv)}km/h`,
            dv < 0 ? '最高速が低い=空力抵抗過大 or トラクション不足 or ストレートでの立ち上がり差' : '最高速が高い=空力/パワー面で有利',
            dv < 0 ? 'リアウィング角度↓で抵抗減(バランス許す範囲) / 立ち上がりトラクション改善' : '現状維持',
            `Vmax ${num(M.speed.max)} vs ${num(B.speed.max)} km/h`);
        }
      }
      // ブレーキGの比較 (突っ込めているか)
      if (M.brakeGmax != null && B.brakeGmax != null) {
        const db = M.brakeGmax - B.brakeGmax; // 負同士。より負なら強く止めている
        if (db > 0.15) { // compの方が弱い減速
          add('比較', 'info',
            `最大減速Gが基準より弱い(${num(M.brakeGmax, 2)}G vs ${num(B.brakeGmax, 2)}G)`,
            'ブレーキングを詰め切れていない or 車両が不安定で踏めない',
            '車両が安定なら操作(より奥で強く)。不安定が原因ならブレーキバランス/リア安定化を先に',
            `Brake G ${num(M.brakeGmax, 2)} vs ${num(B.brakeGmax, 2)}`);
        }
      }
    }

    // 重要度順
    const rank = { high: 0, medium: 1, low: 2, info: 3 };
    findings.sort((a, b) => rank[a.severity] - rank[b.severity]);
    return { findings, deltaNote };
  }

  /* ==========================================================================
   * Claude API 用サマリ (生ldは送らない — 集計値のみ)
   * ========================================================================*/
  function buildSummary(pairs) {
    // pairs: [{file, lap, metrics}] 1個以上
    const lines = [];
    lines.push('# MoTeC セットアップ解析サマリ (GT/ハコ車, Z34ベース)');
    lines.push('各ラップの集計指標(数値のみ。生データは含まない)。');
    for (const p of pairs) {
      const m = p.metrics;
      lines.push(`\n## ${m.file} L${m.lap}  (${m.dur.toFixed(3)}s)`);
      if (m.speed) lines.push(`- 速度: max ${m.speed.max.toFixed(1)} / min ${m.speed.min.toFixed(1)} km/h`);
      if (m.brakeGmax != null) lines.push(`- 最大減速G ${m.brakeGmax.toFixed(2)} / 最大加速G ${m.accGmax.toFixed(2)}`);
      if (m.gLat) lines.push(`- 横G: ±${Math.max(Math.abs(m.gLat.min), Math.abs(m.gLat.max)).toFixed(2)}`);
      if (m.rollFr) lines.push(`- ロール量 Fr ${m.rollFr.range.toFixed(1)}mm / Rr ${m.rollRr ? m.rollRr.range.toFixed(1) : '-'}mm`);
      if (m.pitch) lines.push(`- ピッチング range ${m.pitch.range.toFixed(1)}mm`);
      if (m.brakeBalFront) lines.push(`- ブレーキ前配分 avg ${m.brakeBalFront.avg.toFixed(1)}%`);
      if (m.brakePresFL) lines.push(`- ブレーキ圧 F ${m.brakePresFL.max.toFixed(0)}/${m.brakePresFR.max.toFixed(0)} R ${m.brakePresRL ? m.brakePresRL.max.toFixed(0) : '-'}/${m.brakePresRR ? m.brakePresRR.max.toFixed(0) : '-'} bar`);
      if (m.slipRear) lines.push(`- リアスリップ max ${m.slipRear.max.toFixed(1)}% avg ${m.slipRear.avg.toFixed(1)}%`);
      if (m.yaw) lines.push(`- ヨーレート range ${m.yaw.range.toFixed(0)}deg/s`);
      for (const w of ['FL', 'FR', 'RL', 'RR']) if (m['damper' + w]) lines.push(`- Damper ${w} range ${m['damper' + w].range.toFixed(1)}mm`);
    }
    return lines.join('\n');
  }

  /* 深い解析サマリ: 全体指標 + 区間(コーナー)別 + 2ラップ差分。AIが場所を特定できる。
   * pairs: [{file, lap}] (fileオブジェクトとlapオブジェクトを直接渡す) */
  function buildDeepSummary(pairs) {
    if (!pairs || !pairs.length) return '(ラップ未選択)';
    const lines = [];
    lines.push('# MoTeC 詳細解析サマリ (GT/ハコ車, Z34ベース)');
    // ★各ラップのセットアップ変更(ファイルコメント=エンジニアの手書きメモ)。比較の最重要文脈。
    const comments = pairs.map((p) => (p.file.meta && p.file.meta.fields && p.file.meta.fields.comment) || '').filter(Boolean);
    if (comments.length) {
      lines.push('\n## 各仕様のセットアップ(ファイルコメント=変更内容)');
      pairs.forEach((p) => {
        const cm = (p.file.meta && p.file.meta.fields && p.file.meta.fields.comment) || '(コメントなし)';
        lines.push(`- ${p.file.label} L${p.lap.lap} [${p.lap.dur.toFixed(3)}s]: ${cm}`);
      });
      lines.push('※このコメントに記載のセット変更(キャンバー/車高/スプリング/ウィング等)が、下のデータ差にどう表れたかを踏まえて比較・助言すること。');
    }
    // 全体指標(既存buildSummary相当)
    lines.push(buildSummary(pairs.map((p) => ({ file: p.file.label, lap: p.lap.lap, metrics: lapMetrics(p.file, p.lap) }))));
    // 区間別(各ラップ)
    for (const p of pairs.slice(0, 3)) {
      const sec = sectorAnalysis(p.file, p.lap);
      if (!sec || !sec.corners.length) continue;
      lines.push(`\n## ${p.file.label} L${p.lap.lap} コーナー別 (横G>0.35Gで自動区切り, ${sec.corners.length}箇所)`);
      lines.push('※距離は速度積分の推定値。C=コーナー番号(距離順)');
      for (const c of sec.corners) {
        const parts = [`C${c.idx}(${c.dir}${c.distStart != null ? ' @' + c.distStart.toFixed(0) + 'm' : ''})`];
        if (c.speedMin != null) parts.push(`最低速${c.speedMin.toFixed(0)}km/h`);
        if (c.latMax != null) parts.push(`横G${c.latMax.toFixed(2)}`);
        if (c.longMin != null) parts.push(`減速G${c.longMin.toFixed(2)}`);
        if (c.brakeMax != null) parts.push(`Brk${c.brakeMax.toFixed(0)}`);
        if (c.steerMax != null) parts.push(`舵${c.steerMax.toFixed(0)}°`);
        if (c.slipMax != null) parts.push(`Rスリップ${c.slipMax.toFixed(1)}%`);
        lines.push('- ' + parts.join(' / '));
      }
    }
    // 2ラップ差分(区間別得失タイム): pairs[0]を基準
    if (pairs.length >= 2) {
      const cmp = sectorCompare(pairs[0].file, pairs[0].lap, pairs[1].file, pairs[1].lap);
      if (cmp && cmp.length) {
        lines.push(`\n## 区間別 得失タイム (基準=${pairs[0].file.label} L${pairs[0].lap.lap} vs ${pairs[1].file.label} L${pairs[1].lap.lap})`);
        lines.push('※+ = 比較ラップが遅い / - = 速い');
        let acc = 0;
        for (const s of cmp) { acc += s.delta; lines.push(`- C${s.idx}(${s.dir} @${s.distStart != null ? s.distStart.toFixed(0) : '?'}m): ${s.delta >= 0 ? '+' : ''}${s.delta.toFixed(3)}s (累積${acc >= 0 ? '+' : ''}${acc.toFixed(3)}s)`); }
        // 最も差が大きいコーナー
        const worst = cmp.slice().sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
        if (worst) lines.push(`→ 最大の差: C${worst.idx} (${worst.delta >= 0 ? '+' : ''}${worst.delta.toFixed(3)}s)`);
      }
    }
    return lines.join('\n');
  }

  /* ==========================================================================
   * i2 Pro ワークスペース取り込み
   *   parseWorkbook(xml)  → {name, channels[]}   (.i2wkb)
   *   parseMaths(xml)     → [{id, unit, script, need[]}]  (User.xml等)
   *   計算式は簡易評価器で JS 関数に変換し DERIVED に登録
   * ========================================================================*/
  function parseWorkbook(xml) {
    const name = (xml.match(/<Workbook\b[^>]*Name="([^"]*)"/) || [])[1] || 'Workbook';
    const chans = new Set();
    let m;
    const reC = /Channel="([^"]+)"/g;
    while ((m = reC.exec(xml))) chans.add(m[1]);
    const reI = /\bId="([^"]+)"/g;
    while ((m = reI.exec(xml))) {
      const v = m[1];
      if (v && !/^\d+$/.test(v) && !/^(Group|Bar|Time\/|Worksheet|Scatter|Histogram)/.test(v)) chans.add(v);
    }
    // ★Worksheet > Graph > Trace 構造を抽出 (i2画面再現用)
    //   worksheets: [{ name, graphs: [ [ch,ch,...], ... ] }]   graphs[i] = 1つのグラフに重ねるch配列
    const worksheets = [];
    const wsRe = /<Worksheet\b([^>]*)>([\s\S]*?)<\/Worksheet>/g;
    let ws;
    const usedNames = {};
    while ((ws = wsRe.exec(xml))) {
      let wsName = (ws[1].match(/Name="([^"]*)"/) || [])[1] || 'Sheet';
      // Time/Distance系のGraphからTraceを取る (Scatter/Histogram等の座標軸ノイズを除外)
      const graphs = [];
      const gRe = /<Graph\b([^>]*)>([\s\S]*?)<\/Graph>/g;
      let g;
      while ((g = gRe.exec(ws[2]))) {
        const traces = [];
        const tRe = /<Trace\b[^>]*\bId="([^"]*)"/g;
        let t;
        while ((t = tRe.exec(g[2]))) { if (t[1]) traces.push(t[1]); }
        if (traces.length) graphs.push(traces);
      }
      // ★NumericGauge / Bar の GaugeData Id を抽出 (i2右側の数値パネル/縦ゲージ再現用)
      const gauges = [];
      const gdRe = /<GaugeData\b([^>]*)\/?>/g;
      let gd;
      while ((gd = gdRe.exec(ws[2]))) {
        const attrs = gd[1];
        const id = (attrs.match(/\bId="([^"]*)"/) || [])[1];
        if (!id) continue;
        const unit = (attrs.match(/\bDisplayUnit="([^"]*)"/) || [])[1] || '';
        if (!gauges.some(x => x.id === id)) gauges.push({ id, unit });
      }
      if (graphs.length || gauges.length) {
        // 同名worksheetは連番付与
        if (usedNames[wsName]) { usedNames[wsName]++; wsName = wsName + ' (' + usedNames[wsName] + ')'; }
        else usedNames[wsName] = 1;
        worksheets.push({ name: wsName, graphs, gauges });
      }
    }
    return { name, channels: [...chans], worksheets };
  }

  // MoTeC Math式 → JS。'Channel Name' [unit] を参照に変換。基本演算とchoose/abs等に対応。
  function compileMathScript(script) {
    // 参照チャンネル抽出
    const refs = [];
    // 'Name' [unit]  または 'Name'
    let js = script.replace(/'([^']+)'\s*(?:\[[^\]]*\])?/g, (mm, nm) => {
      const idx = refs.indexOf(nm);
      const i = idx >= 0 ? idx : (refs.push(nm) - 1);
      return `__v(${i},__i)`;
    });
    // 関数/演算子の正規化
    js = js.replace(/\bchoose\s*\(/gi, 'CHOOSE(')
           .replace(/\babs\s*\(/gi, 'Math.abs(')
           .replace(/\bmin\s*\(/gi, 'Math.min(')
           .replace(/\bmax\s*\(/gi, 'Math.max(')
           .replace(/\bsqrt\s*\(/gi, 'Math.sqrt(')
           .replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&')
           .replace(/[\r\n]+/g, ' ');
    // 数値だけ/参照だけの安全チェック: 危険トークンを弾く
    if (/[a-zA-Z_$]/.test(js.replace(/__v|__i|CHOOSE|Math\.\w+/g, ''))) {
      // 未対応の識別子が残る → コンパイル失敗扱い
      return null;
    }
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function('__v', '__i', 'CHOOSE', `return (${js});`);
      return { fn, refs };
    } catch (e) { return null; }
  }
  function CHOOSE() { // MoTeC choose(cond,a,b) 相当(可変長は先頭condで2分岐に簡略)
    const cond = arguments[0];
    return cond ? arguments[1] : (arguments[arguments.length - 1]);
  }

  // Maths XML(User.xml / Brake endless.xml)を読み、計算chをDERIVEDに動的登録
  function loadMathsXml(xml, sourceLabel) {
    const added = [];
    const reExpr = /<MathExpression\b([^>]*?)(?:\/>|>([\s\S]*?)<\/MathExpression>)/g;
    let m;
    while ((m = reExpr.exec(xml))) {
      const attrs = m[1];
      const idM = attrs.match(/\bId="([^"]*)"/); if (!idM) continue;
      const id = idM[1];
      const unitM = attrs.match(/\bUnit="([^"]*)"/); const unit = unitM ? unitM[1] : '';
      const scriptM = attrs.match(/\bScript="([\s\S]*?)"/);
      let script = scriptM ? scriptM[1] : (m[2] || '');
      script = script.replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
      if (!script.trim()) continue;
      const compiled = compileMathScript(script);
      if (!compiled) continue; // 未対応式はスキップ
      const need = compiled.refs.slice();
      // DERIVED登録: 参照chが全て(生or既存派生)存在すれば計算
      DERIVED[id] = {
        need, unit, source: sourceLabel,
        calc: (file, lap) => {
          // 各参照chの窓を取得(生 or 既に登録済み派生)
          const wins = need.map((nm) => DERIVED[nm] ? derivedWindow(file, nm, lap) : chanWindow(file, nm, lap));
          if (wins.some((w) => !w)) return null;
          // 参照ch無し(MathConstant等)は時系列にできない=表示対象外として扱う(Infinity長を防ぐ)
          if (!wins.length) return null;
          const n = Math.min(...wins.map((w) => w.e - w.s));
          if (!isFinite(n) || n <= 0) return null;
          const bases = wins.map((w) => w.s);
          const out = new Float64Array(n);
          const vfn = (i, k) => wins[i].data[bases[i] + k];
          for (let k = 0; k < n; k++) { out[k] = compiled.fn(vfn, k, CHOOSE); }
          return { data: out, s: 0, e: n, f: wins[0].f };
        },
      };
      added.push({ id, unit, need });
    }
    return added;
  }

  const API = { chanWindow, has, lapMetrics, suggest, buildSummary, DERIVED, derivedAvailable, derivedWindow,
    parseWorkbook, loadMathsXml, compileMathScript, sectorAnalysis, sectorCompare, buildDeepSummary };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.ANALYSIS = API;
})(typeof window !== 'undefined' ? window : globalThis);
