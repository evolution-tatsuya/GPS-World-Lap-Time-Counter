// 言語切替（ログイン前画面などに置く）。選択は localStorage に保存され次回も維持される。

import { useTranslation } from 'react-i18next';
import { TextField, MenuItem } from '@mui/material';
import LanguageIcon from '@mui/icons-material/Language';
import { SUPPORTED_LANGUAGES } from '../i18n';

interface Props {
  size?: 'small' | 'medium';
  fullWidth?: boolean;
}

export default function LanguageSwitcher({ size = 'small', fullWidth = false }: Props) {
  const { i18n, t } = useTranslation();
  // i18n.language は 'ja-JP' 等になり得るので先頭2文字で対応言語に丸める
  const current = SUPPORTED_LANGUAGES.find((l) => i18n.language?.startsWith(l.code))?.code || 'en';

  return (
    <TextField
      select
      size={size}
      fullWidth={fullWidth}
      label={t('language.label')}
      value={current}
      onChange={(e) => i18n.changeLanguage(e.target.value)}
      slotProps={{ input: { startAdornment: <LanguageIcon sx={{ mr: 1, opacity: 0.6 }} /> } }}
    >
      {SUPPORTED_LANGUAGES.map((l) => (
        <MenuItem key={l.code} value={l.code}>
          {l.label}
        </MenuItem>
      ))}
    </TextField>
  );
}
