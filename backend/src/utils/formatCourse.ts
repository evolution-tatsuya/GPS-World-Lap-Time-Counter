// コースのジオメトリ（コントロールライン・ゴールライン・計測タイプ）を
// フロント向けのネスト形式に整形する共通ヘルパー。
// レスポンス整形が複数箇所に散らばるため、片道対応の追加漏れを防ぐ目的で共通化する。

// Prisma の Decimal 等を number に変換（null 安全）
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  return Number(v as number);
}

// Course/circuit レコード（Decimal列を含む）から、計測に必要な幾何情報を返す。
// controlLineA/B は必須、goalLineA/B は片道(ONE_WAY)のときのみ値が入る。
export function formatCourseLines(c: {
  controlLineALat: unknown;
  controlLineALng: unknown;
  controlLineBLat: unknown;
  controlLineBLng: unknown;
  measureType?: string | null;
  goalLineALat?: unknown;
  goalLineALng?: unknown;
  goalLineBLat?: unknown;
  goalLineBLng?: unknown;
}) {
  const gAlat = num(c.goalLineALat);
  const gAlng = num(c.goalLineALng);
  const gBlat = num(c.goalLineBLat);
  const gBlng = num(c.goalLineBLng);
  const hasGoal = gAlat !== null && gAlng !== null && gBlat !== null && gBlng !== null;

  return {
    measureType: c.measureType || 'LAP',
    controlLineA: { lat: num(c.controlLineALat), lng: num(c.controlLineALng) },
    controlLineB: { lat: num(c.controlLineBLat), lng: num(c.controlLineBLng) },
    goalLineA: hasGoal ? { lat: gAlat, lng: gAlng } : null,
    goalLineB: hasGoal ? { lat: gBlat, lng: gBlng } : null,
  };
}
