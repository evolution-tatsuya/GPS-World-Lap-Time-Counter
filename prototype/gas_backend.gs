/* ============================================================
   T-EVOLUTION GPS LAP TIMER - バックエンド (Google Apps Script)

   使い方:
   1. スプレッドシートを新規作成 → 拡張機能 → Apps Script
   2. このコードを貼り付け
   3. まず setup() を1回実行（シート自動作成）
   4. デプロイ → 新しいデプロイ → 種類「ウェブアプリ」
      - 実行ユーザー: 自分
      - アクセス: 全員
   5. 発行されたURL(…/exec)をアプリの「送信先URL」に設定
============================================================ */

const SHEET_RAW  = 'RawLaps';    // 全ラップ生データ
const SHEET_RANK = 'ランキング';  // ベストラップ集計
const SHEET_PRINT= '印刷用';      // A4印刷レイアウト

/* ---------- 初期セットアップ（最初に1回実行） ---------- */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // RawLaps
  let raw = ss.getSheetByName(SHEET_RAW) || ss.insertSheet(SHEET_RAW);
  raw.clear();
  raw.getRange(1, 1, 1, 6)
     .setValues([['記録日時', 'ドライバー', '車両', 'LAP', 'タイム(ms)', 'タイム']])
     .setFontWeight('bold').setBackground('#131313').setFontColor('#ffffff');
  raw.setFrozenRows(1);

  // ランキング（QUERYで自動集計）
  let rank = ss.getSheetByName(SHEET_RANK) || ss.insertSheet(SHEET_RANK);
  rank.clear();
  rank.getRange('A1').setValue('順位');
  rank.getRange('B1').setValue('ドライバー');
  rank.getRange('C1').setValue('車両');
  rank.getRange('D1').setValue('ベストタイム(ms)');
  rank.getRange('E1').setValue('ベストタイム');
  rank.getRange('A1:E1').setFontWeight('bold')
      .setBackground('#131313').setFontColor('#ffffff');
  rank.getRange('B2').setFormula(
    '=IFERROR(QUERY(RawLaps!B:E,"select B, C, min(E) where B is not null group by B, C order by min(E) label min(E) \'\'",1),"")'
  );
  rank.getRange('A2').setFormula('=ARRAYFORMULA(IF(B2:B="",,ROW(B2:B)-1))');
  rank.getRange('E2').setFormula(
    '=ARRAYFORMULA(IF(D2:D="",,TEXT(INT(D2:D/60000),"0")&":"&TEXT(INT(MOD(D2:D,60000)/1000),"00")&"."&TEXT(MOD(D2:D,1000),"000")))'
  );
  rank.setFrozenRows(1);

  // 印刷用（A4想定のシンプルレイアウト）
  let pr = ss.getSheetByName(SHEET_PRINT) || ss.insertSheet(SHEET_PRINT);
  pr.clear();
  pr.getRange('A1').setValue('TYPE R Convention  GPS TIME ATTACK RESULT')
    .setFontSize(16).setFontWeight('bold');
  pr.getRange('A2').setFormula('=TEXT(TODAY(),"yyyy年M月d日")&"  T.E.A.M. T-EVOLUTION"');
  pr.getRange('A4:D4').setValues([['POS', 'DRIVER', 'CAR', 'BEST TIME']])
    .setFontWeight('bold').setBackground('#E10600').setFontColor('#ffffff');
  pr.getRange('A5').setFormula('=IFERROR(QUERY(ランキング!A2:E,"select A, B, C, E where B is not null",0),"")');
  pr.setColumnWidth(1, 50).setColumnWidth(2, 180)
    .setColumnWidth(3, 220).setColumnWidth(4, 120);
  pr.setFrozenRows(4);

  Logger.log('セットアップ完了');
}

/* ---------- ラップ受信（アプリからのPOST） ---------- */
function doPost(e) {
  try {
    const p = e.parameter;
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_RAW);
    sheet.appendRow([
      new Date(),
      p.name    || '不明',
      p.car     || '',
      Number(p.lap) || 0,
      Number(p.time_ms) || 0,
      p.time_str || ''
    ]);
    return ContentService.createTextOutput('OK');
  } catch (err) {
    return ContentService.createTextOutput('ERROR: ' + err);
  }
}

/* ---------- ランキング取得（アプリからのGET） ---------- */
function doGet(e) {
  if (e.parameter.mode !== 'ranking') {
    return ContentService.createTextOutput('T-EVOLUTION LAP TIMER API');
  }
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_RAW);
  const data = sheet.getDataRange().getValues().slice(1); // ヘッダー除外

  // ドライバーごとのベストを集計
  const best = {};
  data.forEach(r => {
    const name = r[1], car = r[2], ms = r[4];
    if (!name || !ms) return;
    if (!best[name] || ms < best[name].ms) best[name] = { car: car, ms: ms };
  });

  const list = Object.keys(best)
    .map(name => ({ name: name, car: best[name].car, ms: best[name].ms }))
    .sort((a, b) => a.ms - b.ms)
    .map(x => ({ name: x.name, car: x.car, best: fmtTime(x.ms) }));

  return ContentService
    .createTextOutput(JSON.stringify(list))
    .setMimeType(ContentService.MimeType.JSON);
}

function fmtTime(ms) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const x = Math.round(ms % 1000);
  return m + ':' + ('0' + s).slice(-2) + '.' + ('00' + x).slice(-3);
}
