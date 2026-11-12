import type { ContributionCalendar, ContributionDay, ContributionLevel } from './github';

export const LEVELS: ContributionLevel[] = ['NONE', 'FIRST_QUARTILE', 'SECOND_QUARTILE', 'THIRD_QUARTILE', 'FOURTH_QUARTILE'];
export const levelIndex = (l: ContributionLevel) => LEVELS.indexOf(l);

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Datas do calendário são dias civis: sempre interpretadas e exibidas em UTC para não deslocar o dia. */
const utc = (d: string) => new Date(d + 'T00:00:00Z');

export function formatDay(date: string): string {
  return utc(date).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function dayTitle(d: Pick<ContributionDay, 'date' | 'count'>): string {
  const n = d.count === 0 ? 'Nenhuma contribuição' : d.count === 1 ? '1 contribuição' : `${d.count} contribuições`;
  return `${n} em ${formatDay(d.date)}`;
}

/** Rótulos de mês: aparecem na primeira semana (coluna) em que o mês muda; evita rótulos colados (mínimo 3 colunas). */
export function monthLabels(weeks: { first_day: string }[]): { col: number; label: string }[] {
  const out: { col: number; label: string }[] = [];
  let prev = -1; let lastCol = -10;
  weeks.forEach((w, col) => {
    const m = utc(w.first_day).getUTCMonth();
    if (m !== prev) {
      if (col - lastCol >= 3 || out.length === 0) { out.push({ col, label: MONTHS[m] }); lastCol = col; }
      prev = m;
    }
  });
  return out;
}

export interface Period { id: string; label: string; from: string; to: string }

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

/** "Últimos 12 meses" + um item por ano civil desde a criação da conta. O GitHub aceita no máximo 1 ano por consulta. */
export function periodOptions(createdAt: string | undefined, now: Date): Period[] {
  const out: Period[] = [{ id: 'last12', label: 'Últimos 12 meses', from: iso(new Date(now.getTime() - 365 * 864e5)), to: iso(now) }];
  const first = createdAt ? new Date(createdAt).getUTCFullYear() : now.getUTCFullYear();
  for (let y = now.getUTCFullYear(); y >= Math.min(first, now.getUTCFullYear()); y--) {
    const end = y === now.getUTCFullYear() ? now : new Date(Date.UTC(y, 11, 31, 23, 59, 59));
    out.push({ id: String(y), label: String(y), from: iso(new Date(Date.UTC(y, 0, 1))), to: iso(end) });
  }
  return out;
}

/** dir = -1 vai para um período mais antigo, +1 para um mais recente. Devolve o mesmo id nos limites. */
export function stepPeriod(periods: Period[], id: string, dir: -1 | 1): string {
  const i = periods.findIndex((p) => p.id === id);
  if (i < 0) return id;
  // A lista é [últimos 12 meses, ano atual, ano anterior, …]: "mais antigo" é índice maior.
  const j = Math.min(periods.length - 1, Math.max(0, i - dir));
  return periods[j].id;
}

export function flatten(c: ContributionCalendar): ContributionDay[] {
  return c.weeks.flatMap((w) => w.days);
}

/** Sequências medidas só sobre os dias devolvidos pelo GitHub (nada é extrapolado). */
export function streaks(days: ContributionDay[]): { longest: number; current: number } {
  let longest = 0; let run = 0;
  const sorted = [...days].sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const d of sorted) { run = d.count > 0 ? run + 1 : 0; longest = Math.max(longest, run); }
  // Sequência atual: termina no último dia com dados; se o último dia (hoje) ainda está zerado, parte do dia anterior.
  let current = 0; let i = sorted.length - 1;
  if (i >= 0 && sorted[i].count === 0) i--;
  for (; i >= 0 && sorted[i].count > 0; i--) current++;
  return { longest, current };
}

export function busiestDay(days: ContributionDay[]): ContributionDay | null {
  let best: ContributionDay | null = null;
  for (const d of days) if (d.count > 0 && (!best || d.count > best.count)) best = d;
  return best;
}
