import { useRef, useState } from 'react';
import type { Message } from '../api';
import { detectLang } from '../lang';
import { Markdown } from './Markdown';

interface Props { channelName: string; replyTo: Message | null; onCancelReply: () => void; onSend: (text: string) => void; onTyping: () => void }

export function Composer({ channelName, replyTo, onCancelReply, onSend, onTyping }: Props) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState(false);
  const [hasSel, setHasSel] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const lastTyping = useRef(0);

  const wrap = (before: string, after = before, placeholder = 'texto') => {
    const el = ref.current; if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const sel = text.slice(s, e) || placeholder;
    setText(text.slice(0, s) + before + sel + after + text.slice(e));
    setHasSel(false);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + before.length, s + before.length + sel.length); });
  };
  const linePrefix = (prefix: string) => {
    const el = ref.current; if (!el) return;
    const s = text.lastIndexOf('\n', el.selectionStart - 1) + 1;
    setText(text.slice(0, s) + prefix + text.slice(s));
    setHasSel(false);
    requestAnimationFrame(() => el.focus());
  };
  // A linguagem do bloco é identificada sozinha a partir do trecho selecionado.
  const codeBlock = () => {
    const el = ref.current; if (!el) return;
    const sel = text.slice(el.selectionStart, el.selectionEnd);
    const lang = detectLang(sel);
    wrap('```' + (lang === 'text' ? '' : lang) + '\n', '\n```', 'código');
  };

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (!pasted.includes('\n') || pasted.includes('```')) return;
    const lang = detectLang(pasted);
    if (lang === 'text') return; // sem confiança: cola como texto normal
    e.preventDefault();
    const el = e.currentTarget;
    const block = '```' + lang + '\n' + pasted.replace(/\n$/, '') + '\n```';
    setText(text.slice(0, el.selectionStart) + block + text.slice(el.selectionEnd));
  };

  const submit = () => {
    if (!text.trim()) return;
    onSend(text.trimEnd());
    setText(''); setPreview(false); setHasSel(false);
  };

  return (
    <div className="composer">
      {replyTo && <div className="replying">Respondendo a <b>{replyTo.author.username}</b><button onClick={onCancelReply} aria-label="Cancelar resposta">✕</button></div>}
      {/* Barra flutuante: só aparece com texto selecionado. mouseDown não tira o foco, preservando a seleção. */}
      {hasSel && !preview && (
        <div className="toolbar float" onMouseDown={(e) => e.preventDefault()}>
          <button title="Negrito (Ctrl+B)" onClick={() => wrap('**')}><b>B</b></button>
          <button title="Itálico (Ctrl+I)" onClick={() => wrap('*')}><i>I</i></button>
          <button title="Tachado" onClick={() => wrap('~~')}><s>S</s></button>
          <button title="Código inline" onClick={() => wrap('`')}>{'</>'}</button>
          <button title="Bloco de código (linguagem automática)" onClick={codeBlock}>{'{ }'}</button>
          <span className="sep" />
          <button title="Citação" onClick={() => linePrefix('> ')}>❝</button>
          <button title="Lista" onClick={() => linePrefix('- ')}>•</button>
          <button title="Lista numerada" onClick={() => linePrefix('1. ')}>1.</button>
          <button title="Link (Ctrl+K)" onClick={() => wrap('[', '](https://)', 'texto')}>🔗</button>
        </div>
      )}
      {preview
        ? <div className="preview">{text.trim() ? <Markdown text={text} /> : <span className="muted">Nada para pré-visualizar</span>}</div>
        : <textarea ref={ref} value={text} rows={Math.min(10, Math.max(1, text.split('\n').length))} placeholder={`Mensagem em #${channelName}`}
            onChange={(e) => {
              setText(e.target.value);
              if (Date.now() - lastTyping.current > 3000) { lastTyping.current = Date.now(); onTyping(); }
            }}
            onSelect={(e) => setHasSel(e.currentTarget.selectionStart !== e.currentTarget.selectionEnd)}
            onBlur={() => setHasSel(false)}
            onPaste={onPaste}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
              else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); wrap('**'); }
              else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') { e.preventDefault(); wrap('*'); }
              else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); wrap('[', '](https://)'); }
            }} />}
      {text.trim() && <button className="preview-toggle" onClick={() => setPreview(!preview)}>{preview ? 'Editar' : 'Prévia'}</button>}
    </div>
  );
}
