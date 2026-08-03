// 多言語対応（i18n）の初期化
//
// 方針（docs/PRODUCT_VISION.md）:
//  - まず日本語/英語/中国語/韓国語の4言語。言語ファイル追加で拡張できる。
//  - 言語選択はログイン前に行い、ブラウザに保存して次回も維持する。
//  - タイム/LAP/BEST 等の共通用語・数値は英語固定（各言語ファイルで英語のまま）。
//
// 言語を追加するとき: locales に <lang>.json を足し、resources と SUPPORTED_LANGUAGES に
// 1行加えるだけ（コード変更不要）。

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import ja from './locales/ja.json';
import en from './locales/en.json';
import zh from './locales/zh.json';
import ko from './locales/ko.json';

// 対応言語（言語選択UIはこれを列挙する）。label は各言語の自称表記。
export const SUPPORTED_LANGUAGES = [
  { code: 'ja', label: '日本語' },
  { code: 'en', label: 'English' },
  { code: 'zh', label: '中文' },
  { code: 'ko', label: '한국어' },
] as const;

export const LANGUAGE_STORAGE_KEY = 'appLanguage';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ja: { translation: ja },
      en: { translation: en },
      zh: { translation: zh },
      ko: { translation: ko },
    },
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
    interpolation: { escapeValue: false }, // Reactが自前でXSS対策するため不要
    detection: {
      // localStorage優先→ブラウザ言語。選択はlocalStorageに保存。
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ['localStorage'],
    },
  });

export default i18n;
