// イベント専用QRコード表示ページ（別タブで開く・印刷/保存対応）
// 運営のイベント詳細から「QRコードを表示」で /events/:id/qr を別タブで開く。
// 配布用デザイン版QR（観戦用・ドライバー用）をブラウザ上で再現する。

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { getEvent } from '../api/events';
import type { EventWithCourse } from '../types';

// 配布用PNGと同じ配色（現場で好評の用途別カラー）
const COLORS = {
  driver: '#2E7D32', // 緑  ドライバー
  live: '#1565C0',   // 青  観戦(直リンク)
};

type CardDef = {
  key: string;
  color: string;
  badge: string;
  roleEn: string;
  title: string;
  subtitle: string;
  url: string;
  usage: string;
  footer: string;
};

function QRCard({ def }: { def: CardDef }) {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    QRCode.toDataURL(def.url, { errorCorrectionLevel: 'M', margin: 0, width: 720 })
      .then(setDataUrl)
      .catch(() => setDataUrl(''));
  }, [def.url]);

  return (
    <div className="qr-card">
      <div className="qr-bar" style={{ background: def.color }} />
      <div className="qr-badge" style={{ background: def.color }}>{def.badge}</div>
      <div className="qr-service" style={{ color: def.color }}>GPS WORLD LAP TIME COUNTER</div>
      <div className="qr-role">{def.roleEn}</div>
      <div className="qr-title">{def.title}</div>
      <div className="qr-subtitle">{def.subtitle}</div>
      <div className="qr-frame" style={{ borderColor: def.color }}>
        {dataUrl ? <img src={dataUrl} alt={def.title} /> : <div className="qr-loading">QR生成中…</div>}
      </div>
      <div className="qr-usage">{def.usage}</div>
      <div className="qr-url">{def.url}</div>
      <div className="qr-footer">{def.footer}</div>
      <div className="qr-bar qr-bar-bottom" style={{ background: def.color }} />
    </div>
  );
}

export default function EventQRCodes() {
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<EventWithCourse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getEvent(id)
      .then((data) => setEvent(data as EventWithCourse))
      .catch((e) => setError(e instanceof Error ? e.message : 'イベントの取得に失敗しました'));
  }, [id]);

  useEffect(() => {
    if (event) document.title = `QRコード - ${event.name}`;
  }, [event]);

  if (error) {
    return <div style={{ padding: 32, textAlign: 'center', color: '#c00' }}>{error}</div>;
  }
  if (!event) {
    return <div style={{ padding: 32, textAlign: 'center' }}>読み込み中…</div>;
  }

  const base = window.location.origin;
  const code = event.eventCode;

  const cards: CardDef[] = [
    {
      key: 'driver',
      color: COLORS.driver,
      badge: 'DRIVER / ドライバー',
      roleEn: 'E N T R Y',
      title: 'ドライバー受付',
      subtitle: `イベントコード: ${code}`,
      url: `${base}/event-login?code=${code}`,
      usage: '計測に参加する方はこちら',
      footer: '※ 読み取り後、イベントコードは自動入力されます',
    },
    {
      key: 'live',
      color: COLORS.live,
      badge: 'SPECTATOR / 観戦',
      roleEn: 'L I V E',
      title: 'ライブ観戦',
      subtitle: `イベントコード: ${code}`,
      url: `${base}/live/${code}`,
      usage: 'そのままライブ観戦できます',
      footer: '※ コード入力不要・直接観戦できます',
    },
  ];

  return (
    <>
      <style>{CARD_CSS}</style>
      <div className="qr-page">
        <div className="qr-page-head no-print">
          <h1>{event.name}</h1>
          <p>イベントコード: <strong>{code}</strong></p>
          <button onClick={() => window.print()}>この2枚を印刷 / PDF保存</button>
          <p className="qr-hint">各QRを長押し（またはスクリーンショット）で画像保存もできます。</p>
        </div>
        <div className="qr-cards">
          {cards.map((c) => <QRCard key={c.key} def={c} />)}
        </div>
      </div>
    </>
  );
}

const CARD_CSS = `
.qr-page { background:#f5f5f5; min-height:100vh; padding:24px; font-family:'Hiragino Sans','Hiragino Kaku Gothic ProN',sans-serif; }
.qr-page-head { text-align:center; margin-bottom:24px; }
.qr-page-head h1 { font-size:22px; margin:0 0 4px; color:#222; }
.qr-page-head p { margin:4px 0; color:#555; }
.qr-page-head button { margin-top:8px; padding:12px 28px; font-size:16px; border:none; border-radius:8px; background:#1565C0; color:#fff; cursor:pointer; }
.qr-page-head button:hover { background:#0d47a1; }
.qr-hint { font-size:13px; color:#888 !important; }
.qr-cards { display:flex; flex-wrap:wrap; gap:24px; justify-content:center; }
.qr-card { position:relative; width:420px; background:#fff; border-radius:12px; box-shadow:0 2px 12px rgba(0,0,0,.12); padding:34px 28px 56px; text-align:center; overflow:hidden; }
.qr-bar { position:absolute; top:0; left:0; right:0; height:9px; }
.qr-bar-bottom { top:auto; bottom:0; }
.qr-badge { display:inline-block; color:#fff; font-weight:700; font-size:15px; padding:8px 20px; border-radius:999px; margin:8px 0 18px; }
.qr-service { font-weight:700; font-size:17px; letter-spacing:.06em; margin-bottom:4px; }
.qr-role { color:#aaa; font-size:11px; letter-spacing:.4em; margin-bottom:14px; }
.qr-title { font-weight:700; font-size:40px; color:#1e1e1e; margin-bottom:10px; }
.qr-subtitle { font-size:17px; color:#444; margin-bottom:18px; }
.qr-frame { border:3px solid; border-radius:16px; padding:16px; display:inline-block; margin-bottom:16px; }
.qr-frame img { display:block; width:280px; height:280px; }
.qr-loading { width:280px; height:280px; display:flex; align-items:center; justify-content:center; color:#999; }
.qr-usage { font-size:18px; color:#222; margin-bottom:8px; }
.qr-url { font-family:'Menlo',monospace; font-size:11px; color:#888; word-break:break-all; margin-bottom:12px; }
.qr-footer { font-size:12px; color:#aaa; }
@media print {
  .no-print { display:none !important; }
  .qr-page { background:#fff; padding:0; }
  .qr-cards { gap:0; }
  .qr-card { box-shadow:none; width:48%; page-break-inside:avoid; }
}
`;
