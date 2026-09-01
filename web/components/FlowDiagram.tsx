'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The lifecycle, drawn.
 *
 * Mermaid is imported dynamically so its several hundred kilobytes load only
 * when someone opens a tab with a diagram on it, rather than on every page.
 *
 * The source is always shown under the picture, and remains useful if the
 * picture fails: it pastes into GitHub, Notion, a Claude conversation or
 * mermaid.live, all of which render it. That is most of the reason for
 * choosing Mermaid over drawing the SVG here directly.
 */
export default function FlowDiagram({ source, caption }: { source: string; caption?: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [copied, setCopied] = useState(false);
  const idRef = useRef(`flow-${Math.random().toString(36).slice(2, 9)}`);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          // Follows the product's palette rather than Mermaid's default, so a
          // diagram in the workbench does not look pasted in from elsewhere.
          theme: 'base',
          themeVariables: {
            primaryColor: '#e3eff1',
            primaryTextColor: '#14181f',
            primaryBorderColor: '#0e5c6b',
            lineColor: '#5b6470',
            fontFamily: 'inherit',
            fontSize: '13px',
          },
          flowchart: { curve: 'basis', useMaxWidth: true },
        });
        const { svg: out } = await mermaid.render(idRef.current, source);
        if (!cancelled) setSvg(out);
      } catch {
        // A diagram that will not parse is not worth an error message: the
        // source below is the thing someone can act on.
        if (!cancelled) { setFailed(true); setShowSource(true); }
      }
    })();
    return () => { cancelled = true; };
  }, [source]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* the textarea below is still selectable */ }
  }

  return (
    <figure className="flow-diagram">
      {svg && !failed ? (
        <div className="flow-diagram__svg" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : failed ? (
        <p className="muted">This flow could not be drawn. The source is below and renders anywhere Mermaid does.</p>
      ) : (
        <p className="muted">Drawing…</p>
      )}

      {caption && <figcaption className="muted">{caption}</figcaption>}

      <div className="flow-actions">
        <button type="button" className="mini-copy" onClick={() => setShowSource((v) => !v)}>
          {showSource ? 'Hide source' : 'Show source'}
        </button>
        <button type="button" className="mini-copy" onClick={copy}>
          {copied ? 'Copied' : 'Copy for GitHub or Notion'}
        </button>
      </div>

      {showSource && <pre className="flow-source">{source}</pre>}
    </figure>
  );
}
