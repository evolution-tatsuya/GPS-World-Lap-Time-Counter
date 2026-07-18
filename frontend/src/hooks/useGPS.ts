// GPS計測カスタムフック

import { useState, useEffect, useCallback, useRef } from 'react';
import { crossCheck, formatLapTime, requestWakeLock, isGPSAccuracyGood } from '../utils/gpsUtils';
import type { GPSPosition, LapData } from '../types';

interface UseGPSOptions {
  controlLineA: [number, number];
  controlLineB: [number, number];
  minLapTime: number; // 最小ラップタイム（秒）
  oneWay?: boolean; // 片道計測モード（デフォルト: false）
  onLap?: (lap: LapData) => void; // ラップ完了時のコールバック
  simulationMode?: boolean; // シミュレーションモード（開発用）
}

interface UseGPSReturn {
  running: boolean;
  currentLapMs: number;
  lastLapMs: number | null;
  bestLapMs: number | null;
  gpsStatus: string;
  gpsAccuracy: number | null;
  lapCount: number;
  laps: LapData[];
  start: () => void;
  stop: () => void;
  reset: () => void;
}

export function useGPS(options: UseGPSOptions): UseGPSReturn {
  const [running, setRunning] = useState(false);
  const [currentLapMs, setCurrentLapMs] = useState(0);
  const [lastLapMs, setLastLapMs] = useState<number | null>(null);
  const [bestLapMs, setBestLapMs] = useState<number | null>(null);
  const [gpsStatus, setGpsStatus] = useState('GPS未接続');
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [lapCount, setLapCount] = useState(0);
  const [laps, setLaps] = useState<LapData[]>([]);

  const watchIdRef = useRef<number | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const prevPtRef = useRef<GPSPosition | null>(null);
  const lastCrossTRef = useRef<number | null>(null);
  const firstSignRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const simulationIntervalRef = useRef<number | null>(null);
  const simulationStepRef = useRef<number>(0);

  // GPS計測開始
  const start = useCallback(async () => {
    console.log('[useGPS] start called, simulationMode:', options.simulationMode);

    // シミュレーションモードの場合
    if (options.simulationMode) {
      console.log('[useGPS] Starting simulation mode');
      setRunning(true);
      setGpsStatus('シミュレーションモード（開発用） 精度±5m');
      setGpsAccuracy(5);

      // コントロールラインの中心座標を計算
      const centerLat = (options.controlLineA[0] + options.controlLineB[0]) / 2;
      const centerLng = (options.controlLineA[1] + options.controlLineB[1]) / 2;

      console.log('[useGPS] Control line center:', centerLat, centerLng);
      console.log('[useGPS] Control line A:', options.controlLineA);
      console.log('[useGPS] Control line B:', options.controlLineB);

      // シンプルな往復運動シミュレーション
      // コントロールラインに対して垂直に横切る移動

      // コントロールラインのベクトル
      const lineDx = options.controlLineB[1] - options.controlLineA[1];
      const lineDy = options.controlLineB[0] - options.controlLineA[0];
      const lineLen = Math.sqrt(lineDx * lineDx + lineDy * lineDy);

      // 垂直方向の単位ベクトル（90度回転）
      const perpDx = -lineDy / lineLen;
      const perpDy = lineDx / lineLen;

      // 中心から垂直方向に離れた2点を設定
      const moveDistance = 0.01; // 1km
      const startLat = centerLat - perpDy * moveDistance;
      const startLng = centerLng - perpDx * moveDistance;
      const endLat = centerLat + perpDy * moveDistance;
      const endLng = centerLng + perpDx * moveDistance;

      console.log('[useGPS] Start position:', startLat, startLng);
      console.log('[useGPS] End position:', endLat, endLng);
      console.log('[useGPS] Perpendicular vector:', perpDy, perpDx);

      simulationStepRef.current = 0;

      // GPS位置を1秒ごとに更新
      simulationIntervalRef.current = window.setInterval(() => {
        simulationStepRef.current += 1;

        // 1周を60秒（60ステップ）で完了
        // 0〜30: A点手前からB点先へ移動（コントロールラインを通過）
        // 31〜60: B点先からA点手前へ移動（再度コントロールラインを通過）
        const progress = (simulationStepRef.current % 60) / 60; // 0〜1
        const oscillation = Math.sin(progress * 2 * Math.PI); // -1〜1の往復
        const t = (oscillation + 1) / 2; // 0〜1に正規化

        console.log('[useGPS] Simulation step:', simulationStepRef.current, 'progress:', progress, 't:', t);

        // 線形補間でA点手前とB点先の間を往復
        const lat = startLat + (endLat - startLat) * t;
        const lng = startLng + (endLng - startLng) * t;

        const pt: GPSPosition = {
          lat,
          lng,
          timestamp: Date.now(),
          accuracy: 5,
        };

        // 前回の位置がある場合、線分交差判定
        if (prevPtRef.current) {
          const result = crossCheck(
            prevPtRef.current,
            pt,
            options.controlLineA,
            options.controlLineB
          );

          console.log('[useGPS] Step:', simulationStepRef.current, 'CrossCheck result:', result);

          if (result?.crossed) {
            console.log('[useGPS] Control line crossed! lastCrossT:', lastCrossTRef.current);
            // 片道モードの場合、進行方向をチェック
            if (options.oneWay) {
              if (firstSignRef.current === null) {
                firstSignRef.current = result.sign;
              } else if (result.sign !== firstSignRef.current) {
                // 逆方向の場合は無視
                prevPtRef.current = pt;
                return;
              }
            }

            // 時刻補間で正確な通過時刻を計算
            const crossT =
              prevPtRef.current.timestamp +
              result.u * (pt.timestamp - prevPtRef.current.timestamp);

            if (lastCrossTRef.current === null) {
              // 1周目（スタート）
              lastCrossTRef.current = crossT;
              setLapCount(1);
            } else {
              // 2周目以降（ラップタイム計測）
              const lapMs = crossT - lastCrossTRef.current;

              // 最小ラップタイムチェック（誤検知防止）
              if (lapMs >= options.minLapTime * 1000) {
                lastCrossTRef.current = crossT;

                const lapData: LapData = {
                  lapNumber: lapCount,
                  lapTimeMs: lapMs,
                  lapTimeStr: formatLapTime(lapMs),
                  timestamp: new Date(crossT),
                };

                setLastLapMs(lapMs);
                setLapCount((prev) => prev + 1);
                setLaps((prev) => [...prev, lapData]);

                // ベストラップ更新
                if (bestLapMs === null || lapMs < bestLapMs) {
                  setBestLapMs(lapMs);
                }

                // コールバック実行
                if (options.onLap) {
                  options.onLap(lapData);
                }
              }
            }
          }
        }

        prevPtRef.current = pt;
      }, 1000);

      // 現在のラップタイム更新タイマー
      timerIntervalRef.current = window.setInterval(() => {
        if (lastCrossTRef.current !== null) {
          setCurrentLapMs(Date.now() - lastCrossTRef.current);
        }
      }, 100);

      return;
    }
    if (!('geolocation' in navigator)) {
      setGpsStatus('GPS非対応のデバイスです');
      return;
    }

    setRunning(true);
    setGpsStatus('GPS起動中...');

    // Wake Lock を有効化
    wakeLockRef.current = await requestWakeLock();

    // GPS監視開始
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const pt: GPSPosition = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          timestamp: position.timestamp,
          accuracy: position.coords.accuracy,
        };

        setGpsAccuracy(position.coords.accuracy);

        if (isGPSAccuracyGood(position.coords.accuracy)) {
          setGpsStatus(`GPS OK  精度±${Math.round(position.coords.accuracy)}m`);
        } else {
          setGpsStatus(`GPS精度低下  ±${Math.round(position.coords.accuracy)}m`);
        }

        // 前回の位置がある場合、線分交差判定
        if (prevPtRef.current) {
          const result = crossCheck(
            prevPtRef.current,
            pt,
            options.controlLineA,
            options.controlLineB
          );

          if (result?.crossed) {
            console.log('[useGPS] Control line crossed! lastCrossT:', lastCrossTRef.current);
            // 片道モードの場合、進行方向をチェック
            if (options.oneWay) {
              if (firstSignRef.current === null) {
                firstSignRef.current = result.sign;
              } else if (result.sign !== firstSignRef.current) {
                // 逆方向の場合は無視
                prevPtRef.current = pt;
                return;
              }
            }

            // 時刻補間で正確な通過時刻を計算
            const crossT =
              prevPtRef.current.timestamp +
              result.u * (pt.timestamp - prevPtRef.current.timestamp);

            if (lastCrossTRef.current === null) {
              // 1周目（スタート）
              lastCrossTRef.current = crossT;
              setLapCount(1);
            } else {
              // 2周目以降（ラップタイム計測）
              const lapMs = crossT - lastCrossTRef.current;

              // 最小ラップタイムチェック（誤検知防止）
              if (lapMs >= options.minLapTime * 1000) {
                lastCrossTRef.current = crossT;

                const lapData: LapData = {
                  lapNumber: lapCount,
                  lapTimeMs: lapMs,
                  lapTimeStr: formatLapTime(lapMs),
                  timestamp: new Date(crossT),
                };

                setLastLapMs(lapMs);
                setLapCount((prev) => prev + 1);
                setLaps((prev) => [...prev, lapData]);

                // ベストラップ更新
                if (bestLapMs === null || lapMs < bestLapMs) {
                  setBestLapMs(lapMs);
                }

                // コールバック実行
                if (options.onLap) {
                  options.onLap(lapData);
                }
              }
            }
          }
        }

        prevPtRef.current = pt;
      },
      (error) => {
        console.error('GPS error:', error);
        setGpsStatus(`GPSエラー: ${error.message}`);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15000,
      }
    );

    // 現在のラップタイム更新タイマー
    timerIntervalRef.current = window.setInterval(() => {
      if (lastCrossTRef.current !== null) {
        setCurrentLapMs(Date.now() - lastCrossTRef.current);
      }
    }, 100);
  }, [options, lapCount, bestLapMs]);

  // GPS計測停止
  const stop = useCallback(() => {
    setRunning(false);

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    if (simulationIntervalRef.current !== null) {
      clearInterval(simulationIntervalRef.current);
      simulationIntervalRef.current = null;
    }

    if (timerIntervalRef.current !== null) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (wakeLockRef.current !== null) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }

    setGpsStatus('GPS停止');
  }, []);

  // リセット
  const reset = useCallback(() => {
    stop();
    setCurrentLapMs(0);
    setLastLapMs(null);
    setBestLapMs(null);
    setLapCount(0);
    setLaps([]);
    prevPtRef.current = null;
    lastCrossTRef.current = null;
    firstSignRef.current = null;
  }, [stop]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (simulationIntervalRef.current !== null) {
        clearInterval(simulationIntervalRef.current);
      }
      if (timerIntervalRef.current !== null) {
        clearInterval(timerIntervalRef.current);
      }
      if (wakeLockRef.current !== null) {
        wakeLockRef.current.release();
      }
    };
  }, []);

  return {
    running,
    currentLapMs,
    lastLapMs,
    bestLapMs,
    gpsStatus,
    gpsAccuracy,
    lapCount,
    laps,
    start,
    stop,
    reset,
  };
}
