// Busca da paleta de comandos: sem acento, sem diferenciar maiúsculas, com prioridade para quem começa pelo termo.
export interface Command { id: string; label: string; group: string; icon: string; hint?: string; keywords?: string; run: () => void }

export const normalize = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

/** Pontuação: 3 = começa com o termo, 2 = uma palavra começa com o termo, 1 = contém, 0 = não casa. */
export function score(c: Pick<Command, 'label' | 'keywords'>, q: string): number {
  if (!q) return 1;
  const label = normalize(c.label);
  if (label.startsWith(q)) return 3;
  if (label.split(/[\s#/·-]+/).some((w) => w.startsWith(q))) return 2;
  if (label.includes(q) || normalize(c.keywords ?? '').includes(q)) return 1;
  return 0;
}

export function rankCommands<T extends Pick<Command, 'label' | 'keywords'>>(items: T[], query: string): T[] {
  const q = normalize(query);
  return items
    .map((c, i) => ({ c, s: score(c, q), i }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.c);
}
