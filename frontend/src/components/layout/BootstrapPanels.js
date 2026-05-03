import React from 'react';

function BootstrapPanel({
  paletteClass = '',
  eyebrow,
  title,
  description,
  action = null,
}) {
  return (
    <div className={`page-shell ${paletteClass}`.trim()}>
      <section className="page-hero">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {action}
      </section>
    </div>
  );
}

function SessionBootstrapPanel() {
  return (
    <BootstrapPanel
      eyebrow="Sesion"
      title="Preparando la aplicacion"
      description="Comprobando tu sesion y cargando el estado inicial antes de mostrar el contenido."
    />
  );
}

function TgcBootstrapPanel({ activeGame, error, onRetry }) {
  const action = error ? (
    <button type="button" className="logout-button" onClick={onRetry}>
      Reintentar carga
    </button>
  ) : null;

  return (
    <BootstrapPanel
      paletteClass={activeGame.palette}
      eyebrow={activeGame.eyebrow}
      title={error ? 'No se pudo preparar el catalogo' : `Preparando ${activeGame.shortName}`}
      description={
        error
          ? `No pudimos cargar la configuracion de ${activeGame.shortName}. Reintenta sin tener que refrescar toda la pagina.`
          : `Preparando ${activeGame.shortName} para que el buscador entre ya con el juego activo correcto.`
      }
      action={action}
    />
  );
}

export {
  BootstrapPanel,
  SessionBootstrapPanel,
  TgcBootstrapPanel,
};
