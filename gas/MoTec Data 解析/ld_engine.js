/* ============================================================================
 * MoTeC .ld パーサ (ブラウザ / Node 共通, 依存なし)
 * 確定レイアウト(実データ 鈴鹿Rd.5 #26 で検証済):
 *   header: 0x00 u32 magic=0x40 / 0x08 u32 meta_ptr / 0x0C u32 data_ptr
 *   channel block = 124 bytes linked-list (0x04 u32 next で辿る, next=0 終端):
 *     0x00 u32 prev / 0x04 u32 next / 0x08 u32 data_ptr / 0x0C u32 n_samples
 *     0x12 u16 dtype / 0x14 u16 datasize / 0x16 u16 freq
 *     0x18 i16 shift / 0x1A i16 mul / 0x1C i16 scale / 0x1E i16 dec
 *     0x20 char[32] name / 0x40 char[8] short / 0x48 char[12] unit
 *   dtype: 0/3=int(datasizeで2/4), 5/7=float32
 *   物理値: phys = (raw / scale) * 10^(-dec) * mul + shift   (scale,mul=0→1)
 * ==========================================================================*/
(function (global) {
  'use strict';

  function cstr(dv, off, len) {
    let s = '';
    for (let i = 0; i < len; i++) {
      const c = dv.getUint8(off + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s.trim();
  }

  /** ArrayBuffer からチャンネルのメタ情報だけを高速抽出 (データ本体は遅延読込) */
  function parseHeader(buf) {
    const dv = new DataView(buf);
    const magic = dv.getUint32(0x00, true);
    const metaPtr = dv.getUint32(0x08, true);
    const dataPtr = dv.getUint32(0x0c, true);
    if (magic !== 0x40) {
      console.warn('LD magic が想定外:', magic.toString(16));
    }
    const channels = [];
    let off = metaPtr;
    const seen = new Set();
    let guard = 0;
    while (off && !seen.has(off) && guard < 5000) {
      seen.add(off);
      guard++;
      if (off + 124 > buf.byteLength) break;
      const prev = dv.getUint32(off + 0x00, true);
      const next = dv.getUint32(off + 0x04, true);
      const dptr = dv.getUint32(off + 0x08, true);
      const n = dv.getUint32(off + 0x0c, true);
      const dtype = dv.getUint16(off + 0x12, true);
      const dsize = dv.getUint16(off + 0x14, true);
      const freq = dv.getUint16(off + 0x16, true);
      const shift = dv.getInt16(off + 0x18, true);
      const mul = dv.getInt16(off + 0x1a, true);
      const scale = dv.getInt16(off + 0x1c, true);
      const dec = dv.getInt16(off + 0x1e, true);
      const name = cstr(dv, off + 0x20, 32);
      const short = cstr(dv, off + 0x40, 8);
      const unit = cstr(dv, off + 0x48, 12);
      channels.push({
        idx: channels.length, name, short, unit,
        freq, n, dtype, dsize, dptr, shift, mul, scale, dec,
      });
      if (next === 0) break;
      off = next;
    }
    const meta = parseMeta(dv, metaPtr);
    return { magic, metaPtr, dataPtr, channels, meta };
  }

  /** ヘッダーからメタ情報(日時・車両・コメント等)を抽出。
   *  実データ(NISSAN GT-R NISMO GT3, C185ロガー)で確定した固定オフセット。 */
  function parseMeta(dv, metaPtr) {
    // メタ文字列は \0 だけでなく改行(0x0d/0x0a)でも終端する
    const mstr = (off, len) => {
      let s = '';
      for (let i = 0; i < len; i++) { const c = dv.getUint8(off + i); if (c === 0 || c === 0x0d || c === 0x0a) break; s += String.fromCharCode(c); }
      return s.trim();
    };
    const M = {
      date:     mstr(0x005e, 16),   // "23/08/2026"
      time:     mstr(0x007e, 12),   // "12:27:09"
      comment:  mstr(0x0624, 128),  // ユーザー入力コメント "jung-yasuda ..."
      configName: mstr(0x077d, 64), // "264H3_User_Basic_for #26"
      vehicle:  mstr(0x0db4, 64),   // "NISSAN GT-R NISMO GT3"
    };
    // 互換: 旧UIが参照するキー
    M.shortComment = M.comment;
    M.vehicleId = M.vehicle;
    // 汎用スキャン(ℹ詳細用): ヘッダー領域の全文字列
    const strings = [];
    const end = Math.min(metaPtr || dv.byteLength, dv.byteLength, 0x8000);
    let i = 0x40;
    while (i < end) {
      const c = dv.getUint8(i);
      if (c >= 32 && c <= 126) {
        let j = i, s = '';
        while (j < end) { const x = dv.getUint8(j); if (x >= 32 && x <= 126) { s += String.fromCharCode(x); j++; } else break; }
        if (s.length >= 4 && /[A-Za-z0-9]/.test(s)) strings.push({ off: i, text: s });
        i = j;
      } else i++;
    }
    return { fields: M, strings };
  }

  /** 1チャンネルの生サンプルを物理値 Float64Array に展開
   *  dtype: このMoTeC機種では 0/3/5 いずれも整数(datasizeで2/4byte)を
   *  scale/dec/mul でスケーリング。float32型はこのデータには存在しない。
   *  (dtype=5 を float32 と誤読すると GPS 等が壊れる — 実データで確認済) */
  function loadChannel(buf, ch) {
    const dv = new DataView(buf);
    const sz = ch.dsize === 4 ? 4 : 2;
    const n = Math.min(ch.n, Math.floor((buf.byteLength - ch.dptr) / sz));
    const out = new Float64Array(n);
    const sc = ch.scale || 1;
    const ml = ch.mul || 1;
    const fac = (1 / sc) * Math.pow(10, -ch.dec) * ml;
    let p = ch.dptr;
    if (sz === 4) {
      for (let i = 0; i < n; i++, p += 4) out[i] = dv.getInt32(p, true) * fac + ch.shift;
    } else {
      for (let i = 0; i < n; i++, p += 2) out[i] = dv.getInt16(p, true) * fac + ch.shift;
    }
    return out;
  }

  /** Lap Number チャンネルの変化点からラップ配列を作る
   *  返り値: [{lap, tStart, tEnd, dur}]  (時間は秒) */
  function detectLaps(buf, header) {
    const lnCh = header.channels.find((c) => c.name === 'Lap Number');
    if (!lnCh) return [];
    const ln = loadChannel(buf, lnCh);
    const f = lnCh.freq || 1;
    const bounds = []; // {lap, idx}
    let prev = null;
    for (let i = 0; i < ln.length; i++) {
      const v = Math.round(ln[i]);
      if (v !== prev) {
        bounds.push({ lap: v, idx: i });
        prev = v;
      }
    }
    // 連続する同一 lap の最初の出現をラップ開始とみなす。負値(-1)は無効ラップ
    const laps = [];
    for (let k = 0; k < bounds.length; k++) {
      const b = bounds[k];
      if (b.lap < 0) continue;
      const startIdx = b.idx;
      // 次に「異なるlap」に変わる所を終端に
      let endIdx = ln.length;
      for (let j = k + 1; j < bounds.length; j++) {
        if (bounds[j].lap !== b.lap) { endIdx = bounds[j].idx; break; }
      }
      const tStart = startIdx / f;
      const tEnd = endIdx / f;
      laps.push({ lap: b.lap, startIdx, endIdx, tStart, tEnd, dur: tEnd - tStart });
    }
    // 同一lap番号が飛び飛びに出る場合を統合(最初と最後で1本に)
    const merged = {};
    for (const l of laps) {
      if (!merged[l.lap]) merged[l.lap] = { ...l };
      else {
        merged[l.lap].endIdx = Math.max(merged[l.lap].endIdx, l.endIdx);
        merged[l.lap].tEnd = merged[l.lap].endIdx / f;
        merged[l.lap].dur = merged[l.lap].tEnd - merged[l.lap].tStart;
      }
    }
    return Object.values(merged).sort((a, b) => a.lap - b.lap);
  }

  const API = { parseHeader, loadChannel, detectLaps, cstr };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.LD = API;
})(typeof window !== 'undefined' ? window : globalThis);
