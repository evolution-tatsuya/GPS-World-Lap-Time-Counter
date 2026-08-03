// GPS計測カスタムフック
//
// 単体HTML版(gps/index.html)で実証済みのロジックを移植:
//  - アウトラップ=LAP1（1周目の通過をタイムなしで記録）
//  - 計測スタート毎のセッションID発行
//  - 片道モード（スタートライン→ゴールラインの区間計測、繰り返し可）
// 実測(watchPosition)とシミュレーションの両方が、共通の processPoint(pt) に
// GPS点を流し込む構造にして、検出ロジックの二重化を避けている。

import { useState, useEffect, useCallback, useRef } from 'react';
import { crossCheck, formatLapTime, requestWakeLock, isGPSAccuracyGood } from '../utils/gpsUtils';
import type { GPSPosition, LapData } from '../types';

interface UseGPSOptions {
  controlLineA: [number, number]; // 周回=コントロールライン / 片道=スタートライン
  controlLineB: [number, number];
  minLapTime: number; // 最小ラップ/区間タイム（秒）
  mode?: 'lap' | 'oneway'; // 計測モード（デフォルト: lap=周回）
  goalLineA?: [number, number]; // 片道モードのゴールライン（A）
  goalLineB?: [number, number];
  oneWay?: boolean; // 周回モードで逆方向通過を無視する（従来フラグ・後方互換）
  sessionName?: string; // 任意のセッション名
  onLap?: (lap: LapData) => void; // ラップ/区間確定時のコールバック
  onPosition?: (pos: GPSPosition) => void; // 位置更新時（位置共有用）
  simulationMode?: boolean; // シミュレーション（開発用）
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
  sessionId: string | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

// 計測スタート毎に一意なセッションIDを作る（時刻ベース）
function makeSessionId(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
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
  const [sessionId, setSessionId] = useState<string | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const prevPtRef = useRef<GPSPosition | null>(null);
  const lastCrossTRef = useRef<number | null>(null);
  const firstSignRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const simulationIntervalRef = useRef<number | null>(null);
  const simulationStepRef = useRef<number>(0);

  // 片道モードの状態機械
  const owStateRef = useRef<'idle' | 'timing'>('idle');
  const owStartTRef = useRef<number | null>(null);

  // watchPosition/interval のコールバックは start 時の値をクロージャで握るため、
  // 計測中に更新される値は ref 経由で最新を参照する。
  const lapCountRef = useRef(0);
  const bestLapMsRef = useRef<number | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const optionsRef = useRef(options);
  useEffect(() => { optionsRef.current = options; }, [options]);
  useEffect(() => { lapCountRef.current = lapCount; }, [lapCount]);
  useEffect(() => { bestLapMsRef.current = bestLapMs; }, [bestLapMs]);

  // ラップ/区間を1件確定して通知する共通処理
  const emitLap = useCallback((lapMs: number, crossT: number, isOutlap: boolean) => {
    const opt = optionsRef.current;
    const lapData: LapData = {
      lapNumber: lapCountRef.current,
      lapTimeMs: isOutlap ? 0 : lapMs,
      lapTimeStr: isOutlap ? 'アウトラップ' : formatLapTime(lapMs),
      timestamp: new Date(crossT),
      sessionId: sessionIdRef.current || undefined,
      sessionName: opt.sessionName || undefined,
      isOutlap,
    };
    setLaps((prev) => [...prev, lapData]);
    if (!isOutlap) {
      setLastLapMs(lapMs);
      if (bestLapMsRef.current === null || lapMs < bestLapMsRef.current) {
        bestLapMsRef.current = lapMs;
        setBestLapMs(lapMs);
      }
    }
    if (opt.onLap) opt.onLap(lapData);
  }, []);

  // 周回モード検出: 1本のラインを通るたびに1周。1回目=アウトラップ(LAP1)。
  const lapDetect = useCallback((prev: GPSPosition, pt: GPSPosition) => {
    const opt = optionsRef.current;
    const hit = crossCheck(prev, pt, opt.controlLineA, opt.controlLineB);
    if (!hit?.crossed) return;
    // 逆方向フィルタ（従来 oneWay フラグ）
    if (opt.oneWay) {
      if (firstSignRef.current === null) firstSignRef.current = hit.sign;
      else if (hit.sign !== firstSignRef.current) return;
    }
    const crossT = prev.timestamp + hit.u * (pt.timestamp - prev.timestamp);
    if (lastCrossTRef.current === null) {
      // 1回目の通過＝アウトラップ。LAP1として記録（タイムなし）。
      lastCrossTRef.current = crossT;
      lapCountRef.current = 1;
      setLapCount(1);
      emitLap(0, crossT, true);
    } else {
      const lapMs = crossT - lastCrossTRef.current;
      if (lapMs >= opt.minLapTime * 1000) {
        lastCrossTRef.current = crossT;
        lapCountRef.current += 1;
        setLapCount((p) => p + 1);
        emitLap(lapMs, crossT, false);
      }
    }
  }, [emitLap]);

  // 片道モード検出: スタートライン通過→計測開始→ゴールライン通過→区間確定→再スタート待ち。
  const onewayDetect = useCallback((prev: GPSPosition, pt: GPSPosition) => {
    const opt = optionsRef.current;
    if (!opt.goalLineA || !opt.goalLineB) return;
    if (owStateRef.current === 'idle') {
      const hs = crossCheck(prev, pt, opt.controlLineA, opt.controlLineB);
      if (hs?.crossed) {
        owStartTRef.current = prev.timestamp + hs.u * (pt.timestamp - prev.timestamp);
        owStateRef.current = 'timing';
        lastCrossTRef.current = owStartTRef.current; // 経過タイマー基準
        setGpsStatus('計測中… ゴールラインへ');
      }
    } else {
      const hg = crossCheck(prev, pt, opt.goalLineA, opt.goalLineB);
      if (hg?.crossed) {
        const goalT = prev.timestamp + hg.u * (pt.timestamp - prev.timestamp);
        const segMs = goalT - (owStartTRef.current as number);
        if (segMs >= opt.minLapTime * 1000) {
          lapCountRef.current += 1;
          setLapCount((p) => p + 1);
          emitLap(segMs, goalT, false);
          owStateRef.current = 'idle';
          owStartTRef.current = null;
          lastCrossTRef.current = null; // 次の走行はスタート待ち
        }
      }
    }
  }, [emitLap]);

  // 1つのGPS点を処理する共通入口（実測・シミュレーション両方から呼ぶ）
  const processPoint = useCallback((pt: GPSPosition) => {
    const opt = optionsRef.current;
    if (opt.onPosition) opt.onPosition(pt);
    if (prevPtRef.current) {
      if (opt.mode === 'oneway') onewayDetect(prevPtRef.current, pt);
      else lapDetect(prevPtRef.current, pt);
    }
    prevPtRef.current = pt;
  }, [lapDetect, onewayDetect]);

  // 計測状態を初期化してセッションIDを発行
  const beginSession = useCallback(() => {
    const sid = makeSessionId();
    sessionIdRef.current = sid;
    setSessionId(sid);
    prevPtRef.current = null;
    lastCrossTRef.current = null;
    firstSignRef.current = null;
    lapCountRef.current = 0;
    bestLapMsRef.current = null;
    owStateRef.current = 'idle';
    owStartTRef.current = null;
    setLapCount(0);
    setLastLapMs(null);
    setBestLapMs(null);
    setCurrentLapMs(0);
    setLaps([]);
  }, []);

  // 経過タイマー（現在ラップ/区間の経過を100ms毎に更新）
  const startTimer = useCallback(() => {
    timerIntervalRef.current = window.setInterval(() => {
      if (lastCrossTRef.current !== null) {
        setCurrentLapMs(Date.now() - lastCrossTRef.current);
      }
    }, 100);
  }, []);

  // GPS計測開始
  const start = useCallback(async () => {
    const opt = optionsRef.current;
    beginSession();

    // シミュレーションモード
    if (opt.simulationMode) {
      setRunning(true);
      setGpsStatus('シミュレーションモード（開発用） 精度±5m');
      setGpsAccuracy(5);

      const centerLat = (opt.controlLineA[0] + opt.controlLineB[0]) / 2;
      const centerLng = (opt.controlLineA[1] + opt.controlLineB[1]) / 2;
      const lineDx = opt.controlLineB[1] - opt.controlLineA[1];
      const lineDy = opt.controlLineB[0] - opt.controlLineA[0];
      const lineLen = Math.sqrt(lineDx * lineDx + lineDy * lineDy);
      const perpDx = -lineDy / lineLen;
      const perpDy = lineDx / lineLen;
      const moveDistance = 0.01;
      const startLat = centerLat - perpDy * moveDistance;
      const startLng = centerLng - perpDx * moveDistance;
      const endLat = centerLat + perpDy * moveDistance;
      const endLng = centerLng + perpDx * moveDistance;

      simulationStepRef.current = 0;
      simulationIntervalRef.current = window.setInterval(() => {
        simulationStepRef.current += 1;
        const PERIOD = 20;
        const phase = (simulationStepRef.current % PERIOD) / PERIOD;
        const t = phase < 0.5 ? phase * 2 : 2 - phase * 2; // 三角波 0→1→0
        const lat = startLat + (endLat - startLat) * t;
        const lng = startLng + (endLng - startLng) * t;
        processPoint({ lat, lng, timestamp: Date.now(), accuracy: 5 });
      }, 1000);

      startTimer();
      return;
    }

    if (!('geolocation' in navigator)) {
      setGpsStatus('GPS非対応のデバイスです');
      return;
    }

    setRunning(true);
    setGpsStatus('GPS起動中...');
    wakeLockRef.current = await requestWakeLock();

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setGpsAccuracy(position.coords.accuracy);
        if (isGPSAccuracyGood(position.coords.accuracy)) {
          setGpsStatus(`GPS OK  精度±${Math.round(position.coords.accuracy)}m`);
        } else {
          setGpsStatus(`GPS精度低下  ±${Math.round(position.coords.accuracy)}m`);
        }
        processPoint({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          timestamp: position.timestamp,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        console.error('GPS error:', error);
        setGpsStatus(`GPSエラー: ${error.message}`);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );

    startTimer();
  }, [beginSession, processPoint, startTimer]);

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
    beginSession();
    setSessionId(null);
    sessionIdRef.current = null;
  }, [stop, beginSession]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (simulationIntervalRef.current !== null) clearInterval(simulationIntervalRef.current);
      if (timerIntervalRef.current !== null) clearInterval(timerIntervalRef.current);
      if (wakeLockRef.current !== null) wakeLockRef.current.release();
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
    sessionId,
    start,
    stop,
    reset,
  };
}
