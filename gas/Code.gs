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
var DETAIL_SHEET = '個別ラップ一覧';

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
  writeDetailSheet_(laps);                  // 個別ラップ一覧
  SpreadsheetApp.getActiveSpreadsheet().toast('集計シートを更新しました', '完了', 3);
}

/**
 * Lapsから有効なラップだけを配列で返す。
 * 除外: 空行 / テスト名 / MAX_VALID_MS以上の遅すぎるラップ
 * 戻り値: [{name, car, lap, ms, str}, ...]
 */
function collectValidLaps_() {
  var values = getSheet_().getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var name = String(values[i][1] || '');
    var car = String(values[i][2] || '');
    var lap = Number(values[i][3] || 0);
    var ms = Number(values[i][4] || 0);
    var str = String(values[i][5] || '');
    if (!name || !ms) continue;
    if (ms >= MAX_VALID_MS) continue;
    if (EXCLUDE_NAMES.indexOf(name) !== -1) continue;
    out.push({ name: name, car: car, lap: lap, ms: ms, str: str });
  }
  return out;
}

/**
 * 総合ランキング（ドライバー×車両ごとのベスト、速い順）を書き出す
 */
function writeRankSheet_(laps) {
  var best = {}; // key = name||car
  laps.forEach(function (l) {
    var key = l.name + '||' + l.car;
    if (!best[key] || l.ms < best[key].ms) {
      best[key] = { name: l.name, car: l.car, ms: l.ms, str: l.str };
    }
  });
  var list = Object.keys(best).map(function (k) { return best[k]; });
  list.sort(function (a, b) { return a.ms - b.ms; });

  var rows = [['順位', 'ドライバー', '車両', 'ベストタイム']];
  list.forEach(function (d, i) {
    rows.push([i + 1, d.name, d.car, d.str]);
  });

  var sheet = getOrCreateSheet_(RANK_SHEET);
  sheet.clearContents();
  sheet.getRange(1, 1, rows.length, 4).setValues(rows);
  sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
}

/**
 * 個別ラップ一覧（ドライバーごとに全ラップを速い順で）を書き出す
 */
function writeDetailSheet_(laps) {
  // ドライバーのベスト順に並べ、その中で各人のラップを速い順に
  var byKey = {};
  laps.forEach(function (l) {
    var key = l.name + '||' + l.car;
    if (!byKey[key]) byKey[key] = [];
    byKey[key].push(l);
  });
  var keys = Object.keys(byKey);
  // 各ドライバーのベストで並べ替え
  keys.sort(function (a, b) {
    var ba = Math.min.apply(null, byKey[a].map(function (x) { return x.ms; }));
    var bb = Math.min.apply(null, byKey[b].map(function (x) { return x.ms; }));
    return ba - bb;
  });

  var rows = [['ドライバー', '車両', 'ラップ', 'タイム']];
  keys.forEach(function (k) {
    var arr = byKey[k].slice().sort(function (a, b) { return a.ms - b.ms; });
    var bestMs = arr[0].ms;
    arr.forEach(function (l) {
      var mark = (l.ms === bestMs) ? ' ★BEST' : '';
      rows.push([l.name, l.car, l.lap, l.str + mark]);
    });
  });

  var sheet = getOrCreateSheet_(DETAIL_SHEET);
  sheet.clearContents();
  sheet.getRange(1, 1, rows.length, 4).setValues(rows);
  sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
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
    sheet.appendRow(['記録日時', 'ドライバー', '車両', 'ラップ', 'タイム(ms)', 'タイム']);
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
