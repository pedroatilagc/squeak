import { describe, expect, it } from 'vitest';
import { detectLang, normalizeLang } from './lang';

describe('detectLang', () => {
  it('Python', () => expect(detectLang('def calcular_total(valores):\n    return sum(valores)')).toBe('python'));
  it('C#', () => expect(detectLang('public class Usuario\n{\n    public string Nome { get; set; }\n}')).toBe('csharp'));
  it('Rust', () => expect(detectLang('fn main() {\n    let mut x = 1;\n    println!("{}", x);\n}')).toBe('rust'));
  it('TypeScript', () => expect(detectLang('interface A { n: number }\nconst x: string = "a";')).toBe('typescript'));
  it('JSON', () => expect(detectLang('{"a": [1, 2]}')).toBe('json'));
  it('SQL', () => expect(detectLang('SELECT id FROM users WHERE id = 1;')).toBe('sql'));
  it('sem confiança → texto', () => expect(detectLang('apenas uma frase qualquer aqui')).toBe('text'));
  it('vazio → texto', () => expect(detectLang('   ')).toBe('text'));
});

describe('normalizeLang', () => {
  it('apelidos', () => {
    expect(normalizeLang('py')).toBe('python');
    expect(normalizeLang('C#')).toBe('csharp');
    expect(normalizeLang('ts')).toBe('typescript');
  });
  it('desconhecida', () => expect(normalizeLang('brainfuck')).toBeNull());
});
