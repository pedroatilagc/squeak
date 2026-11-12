// Identificação heurística de linguagem para blocos sem indicação. Sem confiança suficiente → 'text'.
export const LANGS = ['text', 'python', 'csharp', 'rust', 'javascript', 'typescript', 'java', 'c', 'cpp', 'sql', 'json', 'html', 'css', 'bash', 'powershell', 'yaml', 'toml', 'go'] as const;
export type Lang = (typeof LANGS)[number];

const ALIASES: Record<string, Lang> = {
  py: 'python', python3: 'python', cs: 'csharp', 'c#': 'csharp', rs: 'rust', js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
  'c++': 'cpp', cc: 'cpp', sh: 'bash', shell: 'bash', zsh: 'bash', ps1: 'powershell', pwsh: 'powershell', yml: 'yaml', golang: 'go', htm: 'html', plaintext: 'text', txt: 'text',
};

export function normalizeLang(raw: string | undefined | null): Lang | null {
  if (!raw) return null;
  const k = raw.trim().toLowerCase();
  if ((LANGS as readonly string[]).includes(k)) return k as Lang;
  return ALIASES[k] ?? null;
}

const RULES: [Lang, RegExp[]][] = [
  ['python', [/^\s*def \w+\(.*\):\s*$/m, /^\s*(import \w+|from [\w.]+ import )/m, /\bself\b/, /^\s*(elif|except\b.*):/m, /print\(.*\)$/m]],
  ['csharp', [/\bnamespace \w+/, /\bpublic (class|static|string|void|int|async)\b/, /\{ get; set; \}/, /\busing System/, /\bConsole\.Write/]],
  ['rust', [/\bfn \w+\(.*\)( -> [\w<>&:]+)? *\{/, /\blet mut\b/, /\bimpl\b.*\{/, /println!\(/, /\buse std::/, /->\s*Result</]],
  ['typescript', [/:\s*(string|number|boolean)\b/, /\binterface \w+ *\{/, /\btype \w+ *=/, /\bas (string|number|const)\b/]],
  ['javascript', [/\bconst \w+ *=/, /=>\s*[{(]?/, /\bfunction\b/, /console\.log\(/, /\brequire\(|\bimport .* from ['"]/]],
  ['java', [/\bpublic static void main\b/, /\bSystem\.out\.print/, /\bpublic class \w+/, /\bprivate (final )?\w+ \w+;/]],
  ['cpp', [/#include <\w+>/, /\bstd::/, /\bcout\s*<</, /\btemplate\s*</]],
  ['c', [/#include\s*<std\w+\.h>/, /\bint main\(/, /\bprintf\(/, /\bmalloc\(/]],
  ['sql', [/^\s*(SELECT|INSERT INTO|UPDATE|DELETE FROM|CREATE TABLE|ALTER TABLE)\b/im, /\bFROM \w+/i, /\bWHERE\b/i]],
  ['go', [/^package \w+/m, /\bfunc (\(\w+ \*?\w+\) )?\w+\(/, /:= /, /\bfmt\.Print/]],
  ['bash', [/^#!\/bin\/(ba)?sh/m, /^\s*(echo|export|sudo|apt|chmod|cd) /m, /\$\(.*\)/, /\bfi$/m]],
  ['powershell', [/\bGet-\w+/, /\$\w+\s*=\s*/, /\bWrite-Host\b/, /\|\s*Where-Object|ForEach-Object/]],
  ['yaml', [/^\w[\w-]*:\s*\S*$/m, /^\s*- \w[\w-]*:/m]],
  ['toml', [/^\[[\w.-]+\]\s*$/m, /^\w+\s*=\s*["\d\[]/m]],
  ['css', [/[.#]?[\w-]+\s*\{[^}]*:[^}]*;/s, /@media\b/]],
  ['html', [/<!doctype html>/i, /<\/?(div|span|html|body|head|p|a|ul|li)\b[^>]*>/i]],
];

export function detectLang(code: string): Lang {
  const t = code.trim();
  if (!t) return 'text';
  if (/^[\[{][\s\S]*[\]}]$/.test(t)) {
    try { JSON.parse(t); return 'json'; } catch { /* segue */ }
  }
  let best: Lang = 'text';
  let bestScore = 0;
  for (const [lang, res] of RULES) {
    const score = res.reduce((n, r) => n + (r.test(t) ? 1 : 0), 0);
    if (score > bestScore) { best = lang; bestScore = score; }
  }
  // Exige pelo menos 2 sinais (ou 1 para linguagens com marcadores fortes) para não destacar errado.
  const strong: Lang[] = ['python', 'rust', 'csharp', 'go', 'sql', 'java'];
  return bestScore >= 2 || (bestScore === 1 && strong.includes(best)) ? best : 'text';
}
