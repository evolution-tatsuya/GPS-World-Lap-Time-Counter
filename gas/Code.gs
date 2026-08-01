/**
 * GPS World Lap Time Counter - ラップ記録用 Google Apps Script
 *
 * 役割:
 *   - スマホの単体HTML(lap_timer.html)から送られてくるラップを
 *     スプレッドシートに1行ずつ追記する（POST）。
 *   - ランキング（ドライバーごとのベストタイム）を返す（GET ?mode=ranking）。
 *
 * セットアップ手順（README参照）:
 *   1. Googleスプレッドシートを新規作成
 *   2. 拡張機能 > Apps Script でこのコードを貼り付け
 *   3. デプロイ > 新しいデプロイ > 種類=ウェブアプリ
 *      - 実行するユーザー: 自分
 *      - アクセスできるユーザー: 全員
 *   4. 発行された /exec のURLを、スマホ設定画面の「送信先URL」に貼る
 */

// 記録先シート名（無ければ自動作成）
var SHEET_NAME = 'Laps';

// ===== 集計の設定 =====
// これ以上遅いラップは集計から除外（誤検知・アウトラップ・異常値対策）。ms単位。
var MAX_VALID_MS = 240000; // 4分
// 集計から除外するドライバー名（テストデータ等）
var EXCLUDE_NAMES = ['テスト太郎', 'テスト次郎', 'GETTEST', '送信テスト'];
// 生成する集計シート名
var RANK_SHEET = '総合ランキング';
// ドライバー個別シートの名前の接頭辞（例: 個別_TT）
var DRIVER_SHEET_PREFIX = '個別_';

/**
 * POST: ラップ1件を追記
 * 受け取るパラメータ: name, car, lap, time_ms, time_str
 */
function doPost(e) {
  try {
    var p = (e && e.parameter) ? e.parameter : {};
    return json_(appendLap_(p));
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/**
 * GET:
 *   ?mode=ranking → ドライバーごとのベストタイム一覧（速い順）
 *   それ以外       → 動作確認用メッセージ
 */
function doGet(e) {
  var mode = (e && e.parameter && e.parameter.mode) ? e.parameter.mode : '';

  if (mode === 'ranking') {
    return json_(buildRanking_());
  }

  // GET経由でのラップ記録。電波が弱い環境でCORS/POSTのプリフライトを避け、
  // 確実に到達させるための経路（スマホ側は fetch GET で送る）。
  if (mode === 'add') {
    return json_(appendLap_(e && e.parameter ? e.parameter : {}));
  }

  return json_({ ok: true, message: 'GPS Lap Timer GAS is running.' });
}

/**
 * ラップ1件をシートに追記する共通処理（POST/GET両方から利用）
 * 列: 記録日時, ドライバー, 車両, ラップ, タイム(ms), タイム, セッションID, セッション名
 */
function appendLap_(p) {
  var sheet = getSheet_();
  sheet.appendRow([
    new Date(),
    String(p.name || ''),
    String(p.car || ''),
    Number(p.lap || 0),
    Number(p.time_ms || 0),
    String(p.time_str || ''),
    String(p.session || ''),       // G列: セッションID
    String(p.session_name || ''),  // H列: セッション名（任意）
  ]);
  return { ok: true };
}

/**
 * ドライバー×車両ごとのベストタイムを集計して返す。
 * 戻り値: [{ name, car, best, best_ms, laps: [{lap, time, ms}, ...] }, ...]
 *   - best_ms 昇順（速い人が上）
 *   - laps は記録順（ラップ番号順）。各ラップの time は表示文字列、ms は数値。
 * 既存フィールド(best, best_ms)はそのまま残すので後方互換あり。
 */
function buildRanking_() {
  var sheet = getSheet_();
  var values = sheet.getDataRange().getValues();
  // 1行目はヘッダー
  var map = {}; // key = name||car

  for (var i = 1; i < values.length; i++) {
    var name = String(values[i][1] || '');
    var car = String(values[i][2] || '');
    var lap = Number(values[i][3] || 0);
    var ms = Number(values[i][4] || 0);
    var str = String(values[i][5] || '');
    if (!name || !ms) continue;
    // アプリのランキングでもテスト・異常値(遅すぎるラップ)は除外
    if (ms >= MAX_VALID_MS) continue;
    if (EXCLUDE_NAMES.indexOf(name) !== -1) continue;

    var key = name + '||' + car;
    if (!map[key]) {
      map[key] = { name: name, car: car, best: str, best_ms: ms, laps: [] };
    }
    // ベスト更新
    if (ms < map[key].best_ms) {
      map[key].best = str;
      map[key].best_ms = ms;
    }
    // 全ラップを蓄積
    map[key].laps.push({ lap: lap, time: str, ms: ms });
  }

  var list = Object.keys(map).map(function (k) {
    var d = map[k];
    // ラップはラップ番号順（0や欠番があっても安定するようmsではなくlap→記録順で）
    d.laps.sort(function (a, b) { return a.lap - b.lap; });
    return d;
  });
  list.sort(function (a, b) { return a.best_ms - b.best_ms; });
  return list;
}

/**
 * 集計シート（総合ランキング／個別ラップ一覧）を生成・更新する。
 * スプレッドシート上部メニュー「ラップ集計 > 集計シートを更新」から実行する。
 * Lapsの生データは一切変更せず、集計結果を別シートに出力する。
 */
function buildSheets() {
  var laps = collectValidLaps_();          // 有効ラップのみ（テスト・異常値を除外）
  writeRankSheet_(laps);                    // 総合ランキング
  writePerDriverSheets_(laps);              // ドライバーごとの個別シート
  SpreadsheetApp.getActiveSpreadsheet().toast('集計シートを更新しました', '完了', 4);
}

/**
 * Lapsから有効なラップを配列で返す。
 * 除外: 空行 / テスト名。
 * アウトラップ(ms=0)は残す（個別シートの周回表示に使う。ランキングでは別途除外）。
 * タイム有りでMAX_VALID_MS以上の遅すぎる行のみ異常値として除外。
 * 戻り値: [{when, name, car, lap, ms, str, session, sessionName, isOut}, ...]
 */
function collectValidLaps_() {
  var values = getSheet_().getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var when = values[i][0];
    var name = String(values[i][1] || '');
    var car = String(values[i][2] || '');
    var lap = Number(values[i][3] || 0);
    var ms = Number(values[i][4] || 0);
    var str = String(values[i][5] || '');
    var session = String(values[i][6] || '');
    var sessionName = String(values[i][7] || '');
    if (!name) continue;
    if (EXCLUDE_NAMES.indexOf(name) !== -1) continue;
    var isOut = (ms === 0);                 // アウトラップ（タイムなし）
    if (!isOut && ms >= MAX_VALID_MS) continue; // タイム有りの異常値のみ除外
    out.push({
      when: when, name: name, car: car, lap: lap, ms: ms, str: str,
      session: session, sessionName: sessionName, isOut: isOut
    });
  }
  return out;
}

// 日時を "MM/dd HH:mm:ss" 形式の文字列に整形（空なら空文字）
function fmtWhen_(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return '';
  var tz = Session.getScriptTimeZone() || 'Asia/Tokyo';
  return Utilities.formatDate(d, tz, 'MM/dd HH:mm:ss');
}

// セッションの表示名。セッション名があればそれ、無ければID、両方無ければ'(セッション無)'。
function sessionLabel_(session, sessionName) {
  if (sessionName) return sessionName;
  if (session) return session;
  return '(セッション無)';
}

/**
 * 総合ランキング。セッション×ドライバー×車両ごとのベストを、
 * セッションごとにまとめて速い順で書き出す。アウトラップは対象外。
 */
function writeRankSheet_(laps) {
  // セッション -> key(name||car) -> ベスト
  var bySession = {};
  laps.forEach(function (l) {
    if (l.isOut) return;                     // タイム無しは除外
    var sKey = l.session + '||' + l.sessionName;
    if (!bySession[sKey]) bySession[sKey] = { label: sessionLabel_(l.session, l.sessionName), best: {} };
    var key = l.name + '||' + l.car;
    var b = bySession[sKey].best;
    if (!b[key] || l.ms < b[key].ms) {
      b[key] = { name: l.name, car: l.car, ms: l.ms, str: l.str, when: l.when };
    }
  });

  var rows = [['セッション', '順位', 'ドライバー', '車両', 'ベストタイム', '記録日時']];
  Object.keys(bySession).forEach(function (sKey) {
    var sess = bySession[sKey];
    var list = Object.keys(sess.best).map(function (k) { return sess.best[k]; });
    list.sort(function (a, b) { return a.ms - b.ms; });
    list.forEach(function (d, i) {
      rows.push([sess.label, i + 1, d.name, d.car, d.str, fmtWhen_(d.when)]);
    });
    rows.push(['', '', '', '', '', '']); // セッション間に空行
  });

  var sheet = getOrCreateSheet_(RANK_SHEET);
  sheet.clearContents();
  sheet.getRange(1, 1, rows.length, 6).setValues(rows);
  sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
}

/**
 * ドライバー×セッションごとに個別シートを作る。
 * 並びはラップ計測順、順位はそのセッション内のタイム有りラップで速い順。
 * シート名は「個別_<ドライバー名>_<セッション名orID>」。
 */
function writePerDriverSheets_(laps) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 既存の「個別_」シートを掃除（先に集めてから削除）
  var toDelete = ss.getSheets().filter(function (sh) {
    return sh.getName().indexOf(DRIVER_SHEET_PREFIX) === 0;
  });
  toDelete.forEach(function (sh) { ss.deleteSheet(sh); });

  // ドライバー×車両×セッションごとにまとめる
  var groups = {};
  laps.forEach(function (l) {
    var key = l.name + '||' + l.car + '||' + l.session + '||' + l.sessionName;
    if (!groups[key]) groups[key] = [];
    groups[key].push(l);
  });

  Object.keys(groups).forEach(function (k) {
    var arr = groups[k];
    var name = arr[0].name, car = arr[0].car;
    var label = sessionLabel_(arr[0].session, arr[0].sessionName);

    // 順位付け: タイム有りラップだけを速い順にして「ms -> 順位」を作る
    var timed = arr.filter(function (x) { return !x.isOut; })
                   .sort(function (a, b) { return a.ms - b.ms; });
    var rankOf = {};
    timed.forEach(function (x, i) { rankOf[x.ms] = (rankOf[x.ms] || i + 1); });
    var bestMs = timed.length ? timed[0].ms : null;

    // 表示はラップ計測順（ラップ番号順）
    var ordered = arr.slice().sort(function (a, b) { return a.lap - b.lap; });

    var rows = [['ラップ', 'タイム', 'セッション内順位', '記録日時']];
    ordered.forEach(function (l) {
      if (l.isOut) {
        rows.push([l.lap, 'アウトラップ', '-', fmtWhen_(l.when)]);
      } else {
        var mark = (l.ms === bestMs) ? ' ★BEST' : '';
        rows.push([l.lap, l.str + mark, rankOf[l.ms], fmtWhen_(l.when)]);
      }
    });

    var sheetName = makeDriverSheetName_(name + '_' + label, car, ss);
    var sheet = ss.insertSheet(sheetName);
    sheet.getRange(1, 1).setValue(name + '（' + car + '）  セッション: ' + label).setFontWeight('bold');
    sheet.getRange(3, 1, rows.length, 4).setValues(rows);
    sheet.getRange(3, 1, 1, 4).setFontWeight('bold');
  });
}

// シート名として使える「個別_<名前>」を作る（禁止文字を除去・重複回避・長さ制限）
function makeDriverSheetName_(name, car, ss) {
  var base = DRIVER_SHEET_PREFIX + String(name).replace(/[:\\\/\?\*\[\]]/g, '_');
  base = base.substring(0, 90);
  var candidate = base, n = 2;
  while (ss.getSheetByName(candidate)) { candidate = base + '_' + n; n++; }
  return candidate;
}

/**
 * 指定名のシートを取得（無ければ作成）
 */
function getOrCreateSheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

/**
 * スプレッドシートを開いたときにメニューを追加する
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('ラップ集計')
    .addItem('集計シートを更新', 'buildSheets')
    .addToUi();
}

/**
 * 記録シートを取得（無ければ作成してヘッダーを付ける）
 */
function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['記録日時', 'ドライバー', '車両', 'ラップ', 'タイム(ms)', 'タイム', 'セッションID', 'セッション名']);
  }
  return sheet;
}

/**
 * JSONレスポンスを返す共通関数
 */
function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
