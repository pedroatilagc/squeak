import { describe, expect, it } from 'vitest';
import { normalize, rankCommands } from './commands';

const c = (label: string, keywords?: string) => ({ label, keywords });

describe('paleta de comandos', () => {
  it('ignora acentos e maiúsculas', () => {
    expect(normalize('  Início ')).toBe('inicio');
    expect(rankCommands([c('Ir para Início')], 'INICIO')).toHaveLength(1);
  });
  it('prioriza prefixo, depois início de palavra, depois trecho', () => {
    const items = [c('Abrir integrações'), c('Pull requests'), c('Ir para pull requests'), c('Excluir requests antigos')];
    expect(rankCommands(items, 'pull').map((x) => x.label)).toEqual(['Pull requests', 'Ir para pull requests']);
    expect(rankCommands(items, 'req').map((x) => x.label)).toEqual(['Pull requests', 'Ir para pull requests', 'Excluir requests antigos']);
  });
  it('mantém a ordem original em empate e aceita palavras-chave', () => {
    const items = [c('Perfil', 'github'), c('Atividade', 'github')];
    expect(rankCommands(items, 'github').map((x) => x.label)).toEqual(['Perfil', 'Atividade']);
  });
  it('termo vazio devolve tudo; sem correspondência devolve nada', () => {
    expect(rankCommands([c('a'), c('b')], '')).toHaveLength(2);
    expect(rankCommands([c('a')], 'zzz')).toHaveLength(0);
  });
});
