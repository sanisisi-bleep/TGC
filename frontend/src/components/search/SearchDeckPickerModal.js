import React from 'react';
import { getOnePieceColorLabels, getOnePieceDeckRole } from '../../utils/deckTools';
import SearchQuantityControl from './SearchQuantityControl';

function SearchDeckPickerModal({
  deckPickerCard,
  activeGame,
  loadingDecks,
  decks,
  newDeckName,
  actionQuantity,
  submittingDeckAction,
  onClose,
  onActionQuantityChange,
  onActionQuantityBlur,
  onDecreaseActionQuantity,
  onIncreaseActionQuantity,
  onNewDeckNameChange,
  onAddCardToExistingDeck,
  onCreateDeckAndAddCard,
}) {
  if (!deckPickerCard) {
    return null;
  }

  const cardRole = getOnePieceDeckRole(deckPickerCard.card_type);
  const cardColors = getOnePieceColorLabels(deckPickerCard.color);
  const isOnePiece = activeGame?.slug === 'one-piece';
  const isLeaderCard = cardRole === 'leader';
  const isDonCard = cardRole === 'don';
  const quantityLabel = actionQuantity === 1 ? '1 copia' : `${actionQuantity} copias`;
  const canCreateDeckAndAdd = !isOnePiece || (
    (isLeaderCard && actionQuantity <= 1) || (isDonCard && actionQuantity <= 10)
  );
  const getDeckOptionState = (deck) => {
    if (!isOnePiece) {
      return {
        disabled: false,
        summary: `Anadir ${quantityLabel} a este mazo`,
        helper: '',
      };
    }

    const leaderCards = Number(deck.leader_cards) || 0;
    const requiredLeaderCards = Number(deck.required_leader_cards) || 1;
    const mainDeckCards = Number(deck.main_deck_cards) || 0;
    const requiredMainDeckCards = Number(deck.required_main_deck_cards) || 50;
    const donCards = Number(deck.don_cards) || 0;
    const recommendedDonCards = Number(deck.recommended_don_cards) || 10;
    const leaderColors = deck.leader_color_labels || [];
    const sharesLeaderColor = leaderColors.length > 0 && cardColors.some((color) => leaderColors.includes(color));
    const summary = `Leader ${leaderCards}/${requiredLeaderCards} | Main ${mainDeckCards}/${requiredMainDeckCards} | DON ${donCards}/${recommendedDonCards}`;

    if (cardRole === 'leader' && leaderCards + actionQuantity > requiredLeaderCards) {
      return {
        disabled: true,
        summary,
        helper: 'Ese mazo ya no admite mas Leaders.',
      };
    }

    if (cardRole === 'main' && leaderCards === 0) {
      return {
        disabled: true,
        summary,
        helper: 'Anade primero el Leader para poder meter cartas del mazo principal.',
      };
    }

    if (cardRole === 'main' && leaderColors.length > 0 && cardColors.length > 0 && !sharesLeaderColor) {
      return {
        disabled: true,
        summary,
        helper: `No coincide con el color del Leader (${leaderColors.join(' / ')}).`,
      };
    }

    if (cardRole === 'main' && mainDeckCards + actionQuantity > requiredMainDeckCards) {
      return {
        disabled: true,
        summary,
        helper: `Con ${quantityLabel} superarias las 50 cartas del mazo principal.`,
      };
    }

    if (cardRole === 'don' && donCards + actionQuantity > recommendedDonCards) {
      return {
        disabled: true,
        summary,
        helper: `Con ${quantityLabel} superarias el limite de 10 DON!!.`,
      };
    }

    return {
      disabled: false,
      summary,
      helper: cardRole === 'main'
        ? `Encaja con el Leader ${leaderColors.join(' / ') || 'del mazo'}.`
        : `Anadir ${quantityLabel} a este mazo`,
    };
  };

  return (
    <div className="card-modal" onClick={() => !submittingDeckAction && onClose()}>
      <div className="deck-picker-modal panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-panel-header">
          <h2>Anadir a mazo</h2>
          <p>Elige un mazo existente o crea uno nuevo para {deckPickerCard.name}.</p>
          {isOnePiece && (
            <p>
              Regla rapida de One Piece: 1 Leader, 50 cartas del mismo color y un mazo DON!! opcional de 10.
            </p>
          )}
        </div>

        <SearchQuantityControl
          value={String(actionQuantity)}
          onChange={onActionQuantityChange}
          onBlur={onActionQuantityBlur}
          onDecrease={onDecreaseActionQuantity}
          onIncrease={onIncreaseActionQuantity}
          disabled={submittingDeckAction}
          label="Copias a mover"
        />

        <div className="deck-picker-section">
          <span className="collection-panel-label">Mazos existentes</span>
          <div className="deck-picker-list">
            {loadingDecks ? (
              <p className="collection-empty-text">Cargando mazos...</p>
            ) : decks.length > 0 ? (
              decks.map((deck) => {
                const option = getDeckOptionState(deck);
                return (
                  <button
                    key={deck.id}
                    type="button"
                    className="deck-picker-option"
                    onClick={() => onAddCardToExistingDeck(deck.id)}
                    disabled={submittingDeckAction || option.disabled}
                  >
                    <strong>{deck.name}</strong>
                    <span>{option.summary}</span>
                    {option.helper && (
                      <span className="deck-picker-option-helper">{option.helper}</span>
                    )}
                  </button>
                );
              })
            ) : (
              <p className="collection-empty-text">Todavia no tienes mazos de {activeGame.shortName}.</p>
            )}
          </div>
        </div>

        <div className="deck-picker-section">
          <span className="collection-panel-label">Crear mazo nuevo</span>
          <div className="deck-picker-create">
            <input
              type="text"
              value={newDeckName}
              onChange={(e) => onNewDeckNameChange(e.target.value)}
              placeholder={`Nuevo mazo de ${activeGame.shortName}`}
              maxLength={100}
              disabled={submittingDeckAction}
            />
            <button
              type="button"
              onClick={onCreateDeckAndAddCard}
              disabled={submittingDeckAction || !canCreateDeckAndAdd}
            >
              {submittingDeckAction ? 'Procesando...' : 'Crear y anadir'}
            </button>
          </div>
          {isOnePiece && !canCreateDeckAndAdd && (
            <p className="collection-empty-text">
              {isLeaderCard
                ? 'En un mazo nuevo de One Piece solo puedes empezar con 1 Leader.'
                : isDonCard
                  ? 'En un mazo nuevo de One Piece el mazo DON!! admite hasta 10 cartas.'
                  : 'En un mazo nuevo de One Piece conviene empezar por el Leader o por los DON!!.'}
            </p>
          )}
        </div>

        <div className="settings-actions">
          <button
            type="button"
            className="ghost-button"
            onClick={onClose}
            disabled={submittingDeckAction}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

export default SearchDeckPickerModal;
