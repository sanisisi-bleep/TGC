import React from 'react';
import { useSession } from '../../context/SessionContext';

const hasCardValue = (value) => (
  value !== null
  && value !== undefined
  && `${value}`.trim() !== ''
);

function CardDetailModal({
  card,
  activeTcgSlug,
  onClose,
  footer = null,
}) {
  const { profile } = useSession();

  if (!card) {
    return null;
  }

  const showAdvancedQa = Boolean(profile?.advanced_mode);

  const primaryFacts = [
    { label: 'Codigo', value: card.source_card_id || 'Sin codigo' },
    { label: 'Tipo', value: card.card_type || 'Sin tipo' },
    { label: 'Color', value: card.color || 'Sin color' },
    { label: 'Rareza', value: card.rarity || 'Sin rareza' },
    { label: 'Set', value: card.set_name || 'Sin set' },
    { label: 'Version', value: card.version || 'Sin version' },
  ];

  if (hasCardValue(card.lv)) {
    primaryFacts.push({ label: 'Nivel', value: card.lv });
  }

  if (hasCardValue(card.cost)) {
    primaryFacts.push({ label: 'Costo', value: card.cost });
  }

  if (hasCardValue(card.ap)) {
    primaryFacts.push({
      label: activeTcgSlug === 'one-piece' ? 'Poder' : activeTcgSlug === 'digimon' ? 'Play Cost' : 'AP',
      value: card.ap,
    });
  }

  if (hasCardValue(card.hp)) {
    primaryFacts.push({ label: 'HP', value: card.hp });
  }

  if (hasCardValue(card.dp)) {
    primaryFacts.push({ label: 'DP', value: card.dp });
  }

  if (hasCardValue(card.form)) {
    primaryFacts.push({ label: 'Forma', value: card.form });
  }

  if (hasCardValue(card.attribute)) {
    primaryFacts.push({ label: 'Atributo', value: card.attribute });
  }

  if (hasCardValue(card.type_line)) {
    primaryFacts.push({ label: 'Linea de tipo', value: card.type_line });
  }

  if (card.is_alternative_art) {
    primaryFacts.push({ label: 'Arte alternativo', value: 'Si' });
  }

  if (hasCardValue(card.traits)) {
    primaryFacts.push({ label: 'Traits', value: card.traits });
  }

  if (hasCardValue(card.link)) {
    primaryFacts.push({ label: 'Link', value: card.link });
  }

  if (hasCardValue(card.zones)) {
    primaryFacts.push({ label: 'Zonas', value: card.zones });
  }

  const textBlocks = [
    {
      label: activeTcgSlug === 'one-piece' ? 'Texto' : 'Habilidades',
      value: card.abilities,
    },
    {
      label: 'Digievolucion',
      value: card.digivolution_requirements,
    },
    {
      label: 'Condicion especial',
      value: card.special_digivolution,
    },
    {
      label: 'Efecto heredado',
      value: card.inherited_effect,
    },
    {
      label: 'Efecto de security',
      value: card.security_effect,
    },
    {
      label: 'Texto de regla',
      value: card.rule_text,
    },
    {
      label: 'Descripcion',
      value: card.description,
    },
    {
      label: 'Notas',
      value: card.notes,
    },
    {
      label: 'Q&A',
      value: showAdvancedQa ? card.qa : null,
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
