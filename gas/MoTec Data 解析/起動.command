#!/bin/bash
# MoTeC Analyzer ワンクリック起動
# このファイルをダブルクリックすると、ローカルサーバーを立ち上げてブラウザで開きます。

# このスクリプトがある場所へ移動
cd "$(dirname "$0")"

PORT=8899
URL="http://localhost:${PORT}/motec_analyzer.html"

echo "======================================"
echo " MoTeC Analyzer を起動しています..."
echo "======================================"

# すでに同ポートでサーバーが動いていれば再利用、なければ起動
if curl -s -o /dev/null "http://localhost:${PORT}/motec_analyzer.html" 2>/dev/null; then
  echo "サーバーは既に起動中です。"
else
  echo "ローカルサーバーを起動中 (ポート ${PORT})..."
  # バックグラウンドでサーバー起動(python3標準機能)
  python3 -m http.server ${PORT} >/dev/null 2>&1 &
  SERVER_PID=$!
  # 起動待ち(最大5秒)
  for i in $(seq 1 25); do
    if curl -s -o /dev/null "http://localhost:${PORT}/motec_analyzer.html" 2>/dev/null; then
      break
    fi
    sleep 0.2
  done
fi

# ブラウザで開く
echo "ブラウザで開いています: ${URL}"
open "${URL}"

echo ""
echo "▼ アプリはブラウザで開きました。"
echo "▼ このウィンドウを閉じるとサーバーも停止します。"
echo "▼ 使い終わったら、このウィンドウで Control+C を押すか、ウィンドウを閉じてください。"
echo ""

# サーバーをこのスクリプトで起動した場合は、ウィンドウが開いている間サーバーを維持
if [ -n "${SERVER_PID}" ]; then
  # ウィンドウが閉じられたらサーバーも止める
  trap "kill ${SERVER_PID} 2>/dev/null" EXIT
  wait ${SERVER_PID}
fi
