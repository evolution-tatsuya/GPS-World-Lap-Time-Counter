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
