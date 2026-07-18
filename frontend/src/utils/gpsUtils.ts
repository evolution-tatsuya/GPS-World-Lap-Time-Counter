// GPS計測ユーティリティ関数

/**
 * 線分交差判定
 * 2つの線分が交差するかどうかを判定し、交差点のパラメータを返す
 */
interface Point {
  lat: number;
  lng: number;
  t?: number;
}

interface CrossCheckResult {
  crossed: boolean;
  u: number; // 0〜1の範囲で、線分AB上の交差点の位置
  sign: number; // 進行方向（1 or -1）
}

export function crossCheck(
  prevPt: Point,
  currPt: Point,
  lineA: [number, number],
  lineB: [number, number]
): CrossCheckResult | null {
  const [latA, lngA] = lineA;
  const [latB, lngB] = lineB;

  // ベクトル計算
  const dx1 = currPt.lng - prevPt.lng;
  const dy1 = currPt.lat - prevPt.lat;
  const dx2 = lngB - lngA;
  const dy2 = latB - latA;

  // 行列式（外積）
  const det = dx1 * dy2 - dy1 * dx2;

  // 平行な場合は交差なし
  if (Math.abs(det) < 1e-10) {
    return null;
  }

  // 交差パラメータを計算
  // dx3/dy3 は「コントロールライン始点 - 移動線分始点」のベクトル。
  // u・t の分子はこの向きに対して符号を反転させる必要がある
  // （反転しないと交差しているのに u,t が負になり検出できない）。
  const dx3 = lngA - prevPt.lng;
  const dy3 = latA - prevPt.lat;

  const u = (dy1 * dx3 - dx1 * dy3) / det; // コントロールライン上の位置(0〜1)
  const t = (dy2 * dx3 - dx2 * dy3) / det; // 移動線分上の位置(0〜1)

  // 両方の線分の範囲内で交差している場合
  if (u >= 0 && u <= 1 && t >= 0 && t <= 1) {
    // 進行方向を判定（外積の符号）
    const cross = dx1 * (latA - prevPt.lat) - dy1 * (lngA - prevPt.lng);
    const sign = cross > 0 ? 1 : -1;

    return {
      crossed: true,
      u: t, // 時刻補間用のパラメータ
      sign,
    };
  }

  return null;
}

/**
 * タイムフォーマット（ミリ秒 → "M:SS.mmm"）
 */
export function formatLapTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = ms % 1000;

  if (minutes > 0) {
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
  } else {
    return `${seconds}.${milliseconds.toString().padStart(3, '0')}`;
  }
}

/**
 * Wake Lock API を使用して画面のスリープを防止
 */
export async function requestWakeLock(): Promise<WakeLockSentinel | null> {
  if ('wakeLock' in navigator) {
    try {
      const wakeLock = await navigator.wakeLock.request('screen');
      console.log('Wake Lock activated');
      return wakeLock;
    } catch (err) {
      console.error('Wake Lock failed:', err);
      return null;
    }
  } else {
    console.warn('Wake Lock API not supported');
    return null;
  }
}

/**
 * GPS精度チェック
 */
export function isGPSAccuracyGood(accuracy: number): boolean {
  return accuracy <= 50; // 50m以内なら良好
}

/**
 * GPS座標間の距離計算（Haversine formula）
 * @returns 距離（メートル）
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371e3; // 地球の半径（メートル）
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * 現在地を1回だけ取得する（Promise版）
 * コース作成時に「現在地でA点/B点を取得」するために使用。
 */
export function getCurrentPositionOnce(): Promise<{
  lat: number;
  lng: number;
  accuracy: number;
}> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('この端末はGPS(位置情報)に対応していません'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      (err) => {
        const msg =
          err.code === err.PERMISSION_DENIED
            ? '位置情報の利用が許可されていません。ブラウザの設定を確認してください'
            : `位置情報の取得に失敗しました（${err.message}）`;
        reject(new Error(msg));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
  });
}

/**
 * 1点の現在地から、コントロールライン（A-Bの2点）を自動生成する。
 * 指定地点を中心に、東西方向へ ±halfWidthMeters だけ離れた2点を返す。
 * 公道テストで「道路を横切るライン」を1タップで作るのに使う。
 */
export function makeControlLineFromPoint(
  lat: number,
  lng: number,
  halfWidthMeters = 8
): { a: { lat: number; lng: number }; b: { lat: number; lng: number } } {
  // 緯度1度 ≈ 111,320m。経度は緯度によって縮む。
  const metersPerDegLng = 111320 * Math.cos((lat * Math.PI) / 180);
  const dLng = halfWidthMeters / metersPerDegLng;
  return {
    a: { lat, lng: lng - dLng },
    b: { lat, lng: lng + dLng },
  };
}
