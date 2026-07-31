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
    var sheet = getSheet_();

    var row = [
      new Date(),                 // 記録日時（サーバー時刻）
      String(p.name || ''),       // ドライバー名
      String(p.car || ''),        // 車両
      Number(p.lap || 0),         // ラップ番号
      Number(p.time_ms || 0),     // タイム(ms)
      String(p.time_str || ''),   // タイム(表示用文字列)
    ];
    sheet.appendRow(row);

    return json_({ ok: true });
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

  return json_({ ok: true, message: 'GPS Lap Timer GAS is running.' });
}

/**
 * ドライバー×車両ごとのベストタイムを集計して返す。
 * 戻り値: [{ name, car, best, best_ms }, ...] （best_ms昇順）
 */
function buildRanking_() {
  var sheet = getSheet_();
  var values = sheet.getDataRange().getValues();
  // 1行目はヘッダー
  var best = {}; // key = name||car

  for (var i = 1; i < values.length; i++) {
    var name = String(values[i][1] || '');
    var car = String(values[i][2] || '');
    var ms = Number(values[i][4] || 0);
    var str = String(values[i][5] || '');
    if (!name || !ms) continue;

    var key = name + '||' + car;
    if (!best[key] || ms < best[key].best_ms) {
      best[key] = { name: name, car: car, best: str, best_ms: ms };
    }
  }

  var list = Object.keys(best).map(function (k) { return best[k]; });
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
