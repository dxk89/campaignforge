import { LIMITS } from './format';

export function Counter({ text, rule }: { text: string; rule: { max: number; hard: boolean } }) {
  const len = String(text || '').length;
  const cls = len > rule.max ? (rule.hard ? 'over' : 'warn') : '';
  return <span className={`count ${cls}`}>{len}/{rule.max}</span>;
}

export function Line({ label, text, rule, body }: { label: string; text: string; rule?: { max: number; hard: boolean }; body?: boolean }) {
  const over = rule && String(text || '').length > rule.max && rule.hard;
  return (
    <div className={`line ${over ? 'over' : ''}`}>
      <div>
        <span className="line-label">{label}</span>
        <div className={`line-text ${body ? 'body' : ''}`}>{text}</div>
      </div>
      {rule ? <Counter text={text} rule={rule} /> : null}
    </div>
  );
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  return (
    <button
      type="button"
      className="copy-btn"
      onClick={(e) => {
        navigator.clipboard?.writeText(text);
        const el = e.currentTarget;
        const original = el.textContent;
        el.textContent = 'Copied';
        el.classList.add('copied');
        setTimeout(() => { el.textContent = original; el.classList.remove('copied'); }, 1200);
      }}
    >
      {label}
    </button>
  );
}

export function Card({ title, copy, children }: { title: string; copy?: string; children: React.ReactNode }) {
  return (
    <article className="card">
      <div className="card-head">
        <span className="card-title">{title}</span>
        {copy ? <CopyButton text={copy} /> : null}
      </div>
      <div className="card-body">{children}</div>
    </article>
  );
}

export { LIMITS };
