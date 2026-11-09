import { Commit } from '../components/Commit'
import { PixelOffice } from '../office/PixelOffice'

export function Office() {
  return (
    <section className="sec office" aria-labelledby="office-title">
      <div className="wrap">
        <Commit hash="2b7c9d5" msg="wip: escritório virtual" />
        <div className="office-head">
          <h2 id="office-title" className="h2">
            Veja seu time trabalhando, <span className="muted">sem precisar perguntar.</span>
          </h2>
          <span className="soon">em breve</span>
        </div>
        <p className="lead office-lead">
          Um escritório 2D onde cada pato é alguém do time, e o balão em cima mostra o que a pessoa está entregando agora.
          PR mergeado vira confete, a daily acende a tela da sala, e o quadro se atualiza sozinho.
        </p>
        <figure className="office-scene">
          <PixelOffice />
          <figcaption className="office-cap">
            <span>clique num pato</span>
            <span>os balões vêm dos mesmos eventos do feed</span>
          </figcaption>
        </figure>
      </div>
    </section>
  )
}
