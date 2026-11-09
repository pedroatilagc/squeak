import { isValidElement, memo, useEffect, useState, type ReactElement, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { codeToHtml } from 'shiki';
import { detectLang, LANGS, normalizeLang, type Lang } from '../lang';
import { openUrl } from '../native';

function CodeBlock({ code, explicit }: { code: string; explicit: Lang | null }) {
  const detected = explicit ?? detectLang(code);
  const [lang, setLang] = useState<Lang>(detected);
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const lines = code.split('\n').length;

  useEffect(() => setLang(detected), [detected]);
  useEffect(() => {
    let alive = true;
    if (lang === 'text') { setHtml(null); return; }
    // As gramáticas do Shiki são carregadas sob demanda (um chunk por linguagem).
    codeToHtml(code, { lang, theme: 'github-dark' }).then((h) => alive && setHtml(h)).catch(() => alive && setHtml(null));
    return () => { alive = false; };
  }, [code, lang]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* sem permissão */ }
  };

  return (
    <div className="code">
      <div className="code-head">
        <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label="Linguagem do bloco">
          {LANGS.map((l) => <option key={l} value={l}>{l === 'text' ? 'texto' : l}</option>)}
        </select>
        {!explicit && lang === detected && lang !== 'text' && <span className="muted">detectado</span>}
        <button onClick={copy}>{copied ? 'Copiado' : 'Copiar'}</button>
      </div>
      {html
        ? <div className={'code-body' + (lines >= 5 ? ' numbered' : '')} dangerouslySetInnerHTML={{ __html: html }} />
        : <pre className={'code-body' + (lines >= 5 ? ' numbered' : '')}>{code.split('\n').map((l, i) => <span className="line" key={i}>{l}{'\n'}</span>)}</pre>}
    </div>
  );
}

function Pre({ children }: { children?: ReactNode }) {
  const el = children as ReactElement<{ className?: string; children?: ReactNode }>;
  if (!isValidElement(el)) return <pre>{children}</pre>;
  const m = /language-(\S+)/.exec(el.props.className ?? '');
  const code = String(el.props.children ?? '').replace(/\n$/, '');
  return <CodeBlock code={code} explicit={normalizeLang(m?.[1])} />;
}

function Link({ href, children }: { href?: string; children?: ReactNode }) {
  const ok = !!href && /^(https?:|mailto:)/i.test(href);
  return (
    <a href={ok ? href : undefined} onClick={(e) => { e.preventDefault(); if (ok && href!.startsWith('http')) void openUrl(href!); }} title={href}>
      {children}
    </a>
  );
}

// HTML bruto do usuário não é interpretado (react-markdown ignora por padrão): sem XSS.
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ pre: Pre, a: Link }}>{text}</ReactMarkdown>
    </div>
  );
});
