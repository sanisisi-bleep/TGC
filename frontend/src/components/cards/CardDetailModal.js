import React from 'react';

function CardDetailModal({
  card,
  activeTcgSlug,
  onClose,
  footer = null,
}) {
  if (!card) {
    return null;
  }

  const primaryFacts = [
    { label: 'Codigo', value: card.source_card_id || 'Sin codigo' },
    { label: 'Tipo', value: card.card_type || 'Sin tipo' },
    { label: 'Color', value: card.color || 'Sin color' },
    { label: 'Rareza', value: card.rarity || 'Sin rareza' },
    { label: 'Set', value: card.set_name || 'Sin set' },
    { label: 'Version', value: card.version || 'Sin version' },
  ];

  if (card.lv) {
    primaryFacts.push({ label: 'Nivel', value: card.lv });
  }

  if (card.cost) {
    primaryFacts.push({ label: 'Costo', value: card.cost });
  }

  if (card.ap) {
    primaryFacts.push({
      label: activeTcgSlug === 'one-piece' ? 'Poder' : 'AP',
      value: card.ap,
    });
  }

  if (card.hp) {
    primaryFacts.push({ label: 'HP', value: card.hp });
  }

  if (card.traits) {
    primaryFacts.push({ label: 'Traits', value: card.traits });
  }

  if (card.link) {
    primaryFacts.push({ label: 'Link', value: card.link });
  }

  if (card.zones) {
    primaryFacts.push({ label: 'Zonas', value: card.zones });
  }

  const textBlocks = [
    {
      label: activeTcgSlug === 'one-piece' ? 'Texto' : 'Habilidades',
      value: card.abilities,
    },
    {
      label: 'Descripcion',
      value: card.description,
    },
  ].filter((block) => Boolean(block.value));

  return (
    <div className="card-modal" onClick={onClose}>
      <div className="card-detail card-detail-modal" onClick={(event) => event.stopPropagation()}>
        <div className="card-detail-top">
          <img
            src={card.image_url}
            alt={card.name}
            className="large-image card-detail-modal-image"
          />

          <div className="card-detail-copy">
            <div className="card-detail-header">
              <span className="eyebrow">Detalle de carta</span>
              <h2>{card.name}</h2>
            </div>

            <div className="card-detail-facts">
              {primaryFacts.map((fact) => (
                <div key={`${fact.label}-${fact.value}`} className="card-detail-fact">
                  <span>{fact.label}</span>
                  <strong>{fact.value}</strong>
                </div>
              ))}
            </div>

            {textBlocks.map((block) => (
              <div key={block.label} className="card-detail-text-block">
                <strong>{block.label}</strong>
                <p className="card-detail-text-content">{block.value}</p>
              </div>
            ))}
          </div>
        </div>

        {footer ? (
          <div className="card-detail-footer">
            {footer}
          </div>
        ) : null}

        {!footer ? (
          <div className="card-detail-footer">
            <button type="button" className="ghost-button" onClick={onClose}>
              Cerrar
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default CardDetailModal;
