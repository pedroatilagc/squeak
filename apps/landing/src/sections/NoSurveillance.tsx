import { Commit } from '../components/Commit'

const ADD = ['eventos de entrega: PRs, reviews, issues, deploys', 'você controla o que aparece no seu card', 'rankings podem ser desligados pelo time', 'seus dados de reputação são exportáveis']
const DEL = ['tempo online', 'tempo ocioso', '“está digitando há 2h”', 'print de tela ou monitoramento']

export function NoSurveillance() {
  return (
    <section className="sec trust" aria-labelledby="trust-title">
      <div className="wrap trust-grid">
        <div>
          <Commit hash="6a5e1c3" msg="docs: reputação, não vigilância" />
          <h2 id="trust-title" className="h2">
            Reputação, <span className="nowrap">não vigilância.</span>
          </h2>
          <p className="lead">
            O Squeak conta o que você entregou, não quanto tempo você ficou olhando pra tela.
          </p>
        </div>
        <div className="diff" role="group" aria-label="O que o Squeak registra e o que ele não registra">
          <div className="diff-head">
            <span>diff --git a/vigilancia b/reputacao</span>
            <span className="diff-stat">
              <span className="diff-plus">+{ADD.length}</span> <span className="diff-minus">−{DEL.length}</span>
            </span>
          </div>
          <div className="diff-cols">
            <ul className="diff-col diff-col--del" aria-label="Não registra">
              {DEL.map((l, i) => (
                <li key={l}>
                  <span className="diff-ln" aria-hidden="true">{i + 12}</span>
                  <span className="diff-sign" aria-hidden="true">−</span>
                  <span>{l}</span>
                </li>
              ))}
            </ul>
            <ul className="diff-col diff-col--add" aria-label="Registra">
              {ADD.map((l, i) => (
                <li key={l}>
                  <span className="diff-ln" aria-hidden="true">{i + 12}</span>
                  <span className="diff-sign" aria-hidden="true">+</span>
                  <span>{l}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
