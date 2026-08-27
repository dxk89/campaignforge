'use client';

export type TabDef = { id: string; label: string; flag?: number };

export function Tabs({ tabs, active, onSelect, lang, onLang, hasPt }: {
  tabs: TabDef[]; active: string; onSelect: (id: string) => void;
  lang: 'en' | 'pt'; onLang: (l: 'en' | 'pt') => void; hasPt: boolean;
}) {
  return (
    <div className="results-bar">
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={t.id === active} onClick={() => onSelect(t.id)}>
            {t.label}
            {t.flag ? <span className="tab-flag">{t.flag}</span> : null}
          </button>
        ))}
      </div>
      {hasPt && (
        <div className="lang-toggle" role="group" aria-label="Language">
          {(['en', 'pt'] as const).map((l) => (
            <button key={l} type="button" aria-pressed={lang === l} onClick={() => onLang(l)}>{l.toUpperCase()}</button>
          ))}
        </div>
      )}
    </div>
  );
}
