import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import queryKeys from '../../queryKeys';
import { resolveCardCandidates } from '../../services/api';
import { trackProductEvent } from '../../utils/productAnalytics';
import { getScannerProfile, SCANNER_TEXT_WHITELIST } from './scannerProfiles';

const MIN_QUERY_LENGTH = 2;
const DEFAULT_QUANTITY = '1';
const MAX_PROCESSED_REGION_SIZE = 1400;
const MAX_SCAN_EVENTS = 10;

const createEmptyScanActivity = () => ({
  cycle: 0,
  attempts: 0,
  inspectedRegions: 0,
  totalRegions: 0,
  currentRegion: '',
  currentVariant: '',
  lastSnippet: '',
  lastQuery: '',
  lastType: '',
});

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const normalizeCodeCandidate = (value) => {
  let compactCode = String(value || '')
    .toUpperCase()
    .replace(/[._]+/g, '-')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s*-\s*/g, '-')
    .replace(/[^A-Z0-9/-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  compactCode = compactCode
    .replace(/^0P/, 'OP')
    .replace(/^D0N/, 'DON')
    .replace(/^6D/, 'GD')
    .replace(/^G0/, 'GD')
    .replace(/^GO/, 'GD')
    .replace(/^QD/, 'GD');

  const match = compactCode.match(/^([A-Z]+)(.*)$/);
  if (!match) {
    return compactCode;
  }

  const [, prefix, rest] = match;
  const fixedRest = rest
    .replace(/[OQD]/g, '0')
    .replace(/[IL|]/g, '1')
    .replace(/S/g, '5')
    .replace(/B/g, '8');

  return `${prefix}${fixedRest}`;
};

const formatGundamCode = (normalizedCode) => {
  const compact = normalizedCode.replace(/-/g, '');
  const starterMatch = compact.match(/^(GD|ST)(\d{2})(\d{3})(?:P(\d{1,2}))?$/);
  if (starterMatch) {
    const [, prefix, setNumber, cardNumber, printNumber] = starterMatch;
    return `${prefix}${setNumber}-${cardNumber}${printNumber ? `-P${printNumber}` : ''}`;
  }

  const promoMatch = compact.match(/^(EXB|EXR|R)(\d{3})(?:P(\d{1,2}))?$/);
  if (promoMatch) {
    const [, prefix, cardNumber, printNumber] = promoMatch;
    return `${prefix}-${cardNumber}${printNumber ? `-P${printNumber}` : ''}`;
  }

  return normalizedCode;
};

const formatOnePieceCode = (normalizedCode) => {
  const compact = normalizedCode.replace(/-/g, '');
  const setMatch = compact.match(/^(OP|ST|EB|PRB)(\d{2})(\d{3})(?:P(\d{1,2}))?$/);
  if (setMatch) {
    const [, prefix, setNumber, cardNumber, printNumber] = setMatch;
    return `${prefix}${setNumber}-${cardNumber}${printNumber ? `-P${printNumber}` : ''}`;
  }

  const promoMatch = compact.match(/^P(\d{3})$/);
  if (promoMatch) {
    return `P-${promoMatch[1]}`;
  }

  const donMatch = compact.match(/^DON(\d{1,3})$/);
  if (donMatch) {
    return `DON-${donMatch[1]}`;
  }

  return normalizedCode;
};

const formatDigimonCode = (normalizedCode) => {
  const compact = normalizedCode.replace(/-/g, '');
  const setMatch = compact.match(/^(BT|EX|ST|LM|RB|AD)(\d{1,2})(\d{2,3})(?:P(\d{1,2}))?$/);
  if (setMatch) {
    const [, prefix, setNumber, cardNumber, printNumber] = setMatch;
    return `${prefix}${setNumber}-${cardNumber}${printNumber ? `-P${printNumber}` : ''}`;
  }

  const promoMatch = compact.match(/^P(\d{3})$/);
  if (promoMatch) {
    return `P-${promoMatch[1]}`;
  }

  return normalizedCode;
};

const formatRiftboundCode = (normalizedCode) => (
  normalizedCode.replace(/^([A-Z]{3})([0-9]{1,3}[A-Z]?\/[0-9]{1,3})$/, '$1-$2')
);

const formatCodeForProfile = (value, scannerProfile) => {
  const normalizedCode = normalizeCodeCandidate(value);

  if (scannerProfile.slug === 'gundam') {
    return formatGundamCode(normalizedCode);
  }

  if (scannerProfile.slug === 'one-piece') {
    return formatOnePieceCode(normalizedCode);
  }

  if (scannerProfile.slug === 'digimon') {
    return formatDigimonCode(normalizedCode);
  }

  if (scannerProfile.slug === 'riftbound') {
    return formatRiftboundCode(normalizedCode);
  }

  return normalizedCode;
};

const normalizeDetectionText = (value) => String(value || '').replace(/[|]/g, 'I');

const buildCardBounds = (canvas, template, scannerProfile) => {
  const frameRatio = scannerProfile.cardFrameRatio;
  let cardWidth = canvas.width * template.widthRatio;
  let cardHeight = cardWidth / frameRatio;

  if (cardHeight > canvas.height * 0.96) {
    cardHeight = canvas.height * 0.96;
    cardWidth = cardHeight * frameRatio;
  }

  const x = clamp((canvas.width * template.centerX) - (cardWidth / 2), 0, canvas.width - cardWidth);
  const y = clamp((canvas.height * template.centerY) - (cardHeight / 2), 0, canvas.height - cardHeight);

  return {
    x,
    y,
    width: cardWidth,
    height: cardHeight,
    label: `${Math.round(template.widthRatio * 100)}%`,
  };
};

const getCardBoundCandidates = (canvas, scannerProfile) => {
  const seenBounds = new Set();

  return scannerProfile.cardBoundTemplates
    .map((template) => buildCardBounds(canvas, template, scannerProfile))
    .filter((bounds) => {
      const key = [
        Math.round(bounds.x / 8),
        Math.round(bounds.y / 8),
        Math.round(bounds.width / 8),
        Math.round(bounds.height / 8),
      ].join(':');

      if (seenBounds.has(key)) {
        return false;
      }

      seenBounds.add(key);
      return true;
    });
};

const cropRegionFromCard = (cardBounds, region) => ({
  label: region.label,
  x: cardBounds.x + (cardBounds.width * region.x),
  y: cardBounds.y + (cardBounds.height * region.y),
  width: cardBounds.width * region.width,
  height: cardBounds.height * region.height,
  scale: region.scale || 3,
  mode: region.mode || 'code',
});

const getScannerRegions = (sourceCanvas, scannerProfile) => {
  const cardBoundsCandidates = getCardBoundCandidates(sourceCanvas, scannerProfile);
  const cardBoundsForRegions = cardBoundsCandidates.slice(0, scannerProfile.maxCardBoundsForRegions || cardBoundsCandidates.length);
  const fullFrameRegions = (scannerProfile.fullFrameRegions || []).map((region) => ({
    ...region,
    x: sourceCanvas.width * region.x,
    y: sourceCanvas.height * region.y,
    width: sourceCanvas.width * region.width,
    height: sourceCanvas.height * region.height,
    scale: region.scale || 3,
    mode: region.mode || 'code',
    label: `${region.label} (imagen)`,
  }));

  const cardRegions = scannerProfile.regions.flatMap((region) => (
    cardBoundsForRegions.map((cardBounds) => cropRegionFromCard(cardBounds, {
      ...region,
      label: `${region.label} (${cardBounds.label})`,
    }))
  ));

  return [...fullFrameRegions, ...cardRegions];
};

const createProcessedRegionImages = (sourceCanvas, region) => {
  const sourceX = clamp(Math.round(region.x), 0, sourceCanvas.width - 1);
  const sourceY = clamp(Math.round(region.y), 0, sourceCanvas.height - 1);
  const sourceWidth = clamp(Math.round(region.width), 1, sourceCanvas.width - sourceX);
  const sourceHeight = clamp(Math.round(region.height), 1, sourceCanvas.height - sourceY);
  const outputCanvas = document.createElement('canvas');
  const requestedScale = region.scale || 3;
  const maxScaleByWidth = MAX_PROCESSED_REGION_SIZE / sourceWidth;
  const maxScaleByHeight = MAX_PROCESSED_REGION_SIZE / sourceHeight;
  const outputScale = Math.max(1, Math.min(requestedScale, maxScaleByWidth, maxScaleByHeight));

  outputCanvas.width = Math.max(Math.round(sourceWidth * outputScale), 1);
  outputCanvas.height = Math.max(Math.round(sourceHeight * outputScale), 1);

  const context = outputCanvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return [];
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    sourceCanvas,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    outputCanvas.width,
    outputCanvas.height
  );

  const imageData = context.getImageData(0, 0, outputCanvas.width, outputCanvas.height);
  const { data } = imageData;
  const contrast = region.mode === 'code' ? 2.05 : 1.42;

  for (let index = 0; index < data.length; index += 4) {
    const gray = (data[index] * 0.299) + (data[index + 1] * 0.587) + (data[index + 2] * 0.114);
    const boosted = clamp(((gray - 128) * contrast) + 128, 0, 255);
    data[index] = boosted;
    data[index + 1] = boosted;
    data[index + 2] = boosted;
  }

  context.putImageData(imageData, 0, 0);

  if (region.mode !== 'code') {
    return [{ label: 'contraste', image: outputCanvas.toDataURL('image/png') }];
  }

  const thresholdCanvas = document.createElement('canvas');
  thresholdCanvas.width = outputCanvas.width;
  thresholdCanvas.height = outputCanvas.height;
  const thresholdContext = thresholdCanvas.getContext('2d', { willReadFrequently: true });

  const invertedCanvas = document.createElement('canvas');
  invertedCanvas.width = outputCanvas.width;
  invertedCanvas.height = outputCanvas.height;
  const invertedContext = invertedCanvas.getContext('2d', { willReadFrequently: true });

  if (!thresholdContext || !invertedContext) {
    return [{ label: 'contraste', image: outputCanvas.toDataURL('image/png') }];
  }

  const thresholdImage = context.getImageData(0, 0, outputCanvas.width, outputCanvas.height);
  const invertedImage = context.getImageData(0, 0, outputCanvas.width, outputCanvas.height);

  for (let index = 0; index < thresholdImage.data.length; index += 4) {
    const value = thresholdImage.data[index] > 142 ? 255 : 0;
    thresholdImage.data[index] = value;
    thresholdImage.data[index + 1] = value;
    thresholdImage.data[index + 2] = value;

    const invertedValue = value === 255 ? 0 : 255;
    invertedImage.data[index] = invertedValue;
    invertedImage.data[index + 1] = invertedValue;
    invertedImage.data[index + 2] = invertedValue;
  }

  thresholdContext.putImageData(thresholdImage, 0, 0);
  invertedContext.putImageData(invertedImage, 0, 0);

  return [
    { label: 'invertido', image: invertedCanvas.toDataURL('image/png') },
    { label: 'binario', image: thresholdCanvas.toDataURL('image/png') },
  ];
};

const extractLikelyQuery = (text, scannerProfile) => {
  const normalizedText = normalizeDetectionText(text);
  const upperText = normalizedText.toUpperCase()
    .replace(/\b6D/g, 'GD')
    .replace(/\bG0/g, 'GD')
    .replace(/\bGO/g, 'GD')
    .replace(/\bQD/g, 'GD');
  const textVariants = [
    upperText,
    upperText.replace(/\s+/g, ''),
    upperText.replace(/[^A-Z0-9/-]+/g, ''),
  ];
  const codeMatches = [];

  for (const textVariant of textVariants) {
    for (const pattern of scannerProfile.codePatterns) {
      const matcher = new RegExp(pattern.source, 'gi');
      let match = matcher.exec(textVariant);
      while (match) {
        const detectedCode = formatCodeForProfile(match[0], scannerProfile);
        if (detectedCode) {
          codeMatches.push({
            query: detectedCode,
            index: match.index,
          });
        }
        match = matcher.exec(textVariant);
      }
    }
  }

  if (codeMatches.length > 0) {
    codeMatches.sort((left, right) => left.index - right.index || right.query.length - left.query.length);
    return {
      query: codeMatches[0].query,
      type: 'code',
    };
  }

  const usefulLine = normalizedText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= MIN_QUERY_LENGTH)
    .sort((left, right) => left.length - right.length)[0];

  return {
    query: usefulLine || normalizedText.replace(/\s+/g, ' ').trim().slice(0, 80),
    type: 'manual',
  };
};

const extractLikelyNameQuery = (text, scannerProfile) => {
  const ignoredFragments = scannerProfile.ignoredNameFragments || [];
  const candidates = normalizeDetectionText(text)
    .split(/\r?\n/)
    .map((line) => line.replace(/[^A-Za-z0-9:'!.,\- ]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((line) => {
      const normalizedLine = line.toLowerCase();
      const hasLetters = /[A-Za-z]{3}/.test(line);
      const isLongEnough = line.length >= 4 && line.length <= 64;
      const isIgnored = ignoredFragments.some((fragment) => normalizedLine.includes(fragment));
      const isMostlyNumbers = /^[0-9\s.,/-]+$/.test(line);

      return hasLetters && isLongEnough && !isIgnored && !isMostlyNumbers;
    })
    .sort((left, right) => {
      const leftWords = left.split(/\s+/).length;
      const rightWords = right.split(/\s+/).length;
      return Math.abs(leftWords - 2) - Math.abs(rightWords - 2)
        || right.length - left.length;
    });

  return {
    query: candidates[0] || '',
    type: candidates[0] ? 'name' : 'manual',
  };
};

const shouldAutoResolveDetection = (detection) => (
  detection.type === 'code'
  || (detection.type === 'name' && detection.query.trim().length >= 4)
);

const getCandidateMatchLabel = (candidate) => {
  const matchType = String(candidate?.match_type || '');

  if (matchType.startsWith('exact_source_card_id')) {
    return 'Codigo exacto';
  }

  if (matchType.startsWith('exact_deck_key')) {
    return 'Codigo base exacto';
  }

  if (matchType.startsWith('alias_source_card_id') || matchType.startsWith('alias_deck_key')) {
    return 'Variante relacionada';
  }

  if (matchType.startsWith('normalized') || matchType.startsWith('prefix')) {
    return 'Codigo normalizado';
  }

  if (matchType.includes('name')) {
    return 'Coincidencia por nombre';
  }

  return 'Coincidencia posible';
};

function CollectionScannerModal({
  isOpen,
  activeTgc,
  activeTcgSlug,
  activeGame,
  isGuestDemo = false,
  isAdding = false,
  onAddCard,
  onClose,
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanInProgressRef = useRef(false);
  const [cameraStatus, setCameraStatus] = useState('idle');
  const [cameraError, setCameraError] = useState('');
  const [scanStatus, setScanStatus] = useState('idle');
  const [scanError, setScanError] = useState('');
  const [detectionNotice, setDetectionNotice] = useState('');
  const [rawDetectionText, setRawDetectionText] = useState('');
  const [scanActivity, setScanActivity] = useState(createEmptyScanActivity);
  const [scanEvents, setScanEvents] = useState([]);
  const [manualQuery, setManualQuery] = useState('');
  const [resolvedQuery, setResolvedQuery] = useState('');
  const [selectedCardId, setSelectedCardId] = useState('');
  const [quantity, setQuantity] = useState(DEFAULT_QUANTITY);
  const [formError, setFormError] = useState('');
  const scannerProfile = useMemo(() => getScannerProfile(activeTcgSlug), [activeTcgSlug]);
  const activeGameName = activeGame?.shortName || 'este TCG';

  const appendScanEvent = useCallback((event) => {
    setScanEvents((current) => [
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        time: new Date().toLocaleTimeString('es-ES', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        ...event,
      },
      ...current,
    ].slice(0, MAX_SCAN_EVENTS));
  }, []);

  const stopCamera = useCallback(() => {
    scanInProgressRef.current = false;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraStatus('idle');
    setScanStatus('idle');
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    scanInProgressRef.current = false;
    setCameraError('');
    setScanStatus('idle');
    setScanError('');
    setDetectionNotice('');
    setRawDetectionText('');
    setScanActivity(createEmptyScanActivity());
    setScanEvents([]);
    setManualQuery('');
    setResolvedQuery('');
    setSelectedCardId('');
    setQuantity(DEFAULT_QUANTITY);
    setFormError('');

    trackProductEvent('scanner_opened', {
      tgc: activeTcgSlug,
    });
  }, [activeTcgSlug, isOpen, stopCamera]);

  const candidatesQuery = useQuery({
    queryKey: queryKeys.cardResolve(activeTgc?.id, resolvedQuery),
    queryFn: ({ signal }) => resolveCardCandidates({
      tgcId: activeTgc.id,
      query: resolvedQuery,
      limit: 5,
    }, signal),
    enabled: Boolean(
      isOpen
      && !isGuestDemo
      && activeTgc?.id
      && resolvedQuery.trim().length >= MIN_QUERY_LENGTH
    ),
    staleTime: 60 * 1000,
  });

  const candidates = useMemo(
    () => candidatesQuery.data?.items || [],
    [candidatesQuery.data]
  );

  useEffect(() => {
    if (!resolvedQuery || candidatesQuery.status !== 'success') {
      return;
    }

    if (candidates.length === 0) {
      trackProductEvent('scanner_no_match', {
        tgc: activeTcgSlug,
        query: resolvedQuery,
      });
      return;
    }

    setSelectedCardId((current) => {
      if (candidates.some((candidate) => String(candidate.id) === String(current))) {
        return current;
      }

      return String(candidates[0].id);
    });
  }, [activeTcgSlug, candidates, candidatesQuery.status, resolvedQuery]);

  const selectedCandidate = useMemo(
    () => candidates.find((candidate) => String(candidate.id) === String(selectedCardId)) || null,
    [candidates, selectedCardId]
  );

  const startCamera = async () => {
    setCameraError('');
    setScanError('');

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Este navegador no permite abrir la camara desde aqui. Puedes usar la busqueda manual.');
      return;
    }

    try {
      setCameraStatus('requesting');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1600 },
          height: { ideal: 1200 },
        },
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      setCameraStatus('ready');
      setDetectionNotice('Deteccion activa. Acerca la zona del codigo y evita reflejos.');
    } catch (_error) {
      setCameraStatus('idle');
      setCameraError('No pudimos abrir la camara. Revisa permisos o usa la busqueda manual.');
    }
  };

  const analyzeFrame = useCallback(async (sourceCanvas) => {
    setScanStatus('detecting');
    setScanError('');
    setFormError('');
    setDetectionNotice('Detectando carta...');

    try {
      const tesseractModule = await import('tesseract.js');
      const recognize = tesseractModule.recognize || tesseractModule.default?.recognize;

      if (!recognize) {
        throw new Error('Text detector unavailable');
      }

      const scannerRegions = getScannerRegions(sourceCanvas, scannerProfile);
      const codeRegions = scannerRegions
        .filter((region) => region.mode !== 'name')
        .slice(0, scannerProfile.maxCodeRegions);
      const nameRegions = scannerRegions
        .filter((region) => region.mode === 'name')
        .slice(0, scannerProfile.maxNameRegions);
      const regionTexts = [];
      let detection = { query: '', type: 'manual' };
      const totalRegions = codeRegions.length + nameRegions.length;

      setScanActivity((current) => ({
        ...createEmptyScanActivity(),
        cycle: current.cycle + 1,
        totalRegions,
      }));
      appendScanEvent({
        tone: 'info',
        title: 'Nueva pasada',
        detail: `${codeRegions.length} zonas de codigo y ${nameRegions.length} zonas de nombre.`,
      });

      for (let regionIndex = 0; regionIndex < codeRegions.length; regionIndex += 1) {
        const region = codeRegions[regionIndex];
        const regionImages = createProcessedRegionImages(sourceCanvas, region);

        if (regionImages.length === 0) {
          continue;
        }

        for (const regionImage of regionImages) {
          setScanActivity((current) => ({
            ...current,
            attempts: current.attempts + 1,
            inspectedRegions: regionIndex + 1,
            currentRegion: region.label,
            currentVariant: regionImage.label,
          }));

          const result = await recognize(regionImage.image, 'eng', {
            tessedit_char_whitelist: SCANNER_TEXT_WHITELIST,
            tessedit_pageseg_mode: '7',
            preserve_interword_spaces: '1',
          });
          const detectedText = result?.data?.text || '';
          regionTexts.push(`${region.label} / ${regionImage.label}: ${detectedText.trim()}`);

          const regionDetection = extractLikelyQuery(detectedText, scannerProfile);
          const snippet = detectedText.replace(/\s+/g, ' ').trim().slice(0, 96);

          setScanActivity((current) => ({
            ...current,
            lastSnippet: snippet,
            lastQuery: regionDetection.query || current.lastQuery,
            lastType: regionDetection.type,
          }));

          if (snippet || regionDetection.type === 'code') {
            appendScanEvent({
              tone: regionDetection.type === 'code' ? 'success' : 'muted',
              title: regionDetection.type === 'code' ? `Codigo candidato: ${regionDetection.query}` : region.label,
              detail: snippet || 'Sin texto util en esta zona.',
            });
          }

          if (regionDetection.type === 'code') {
            detection = regionDetection;
            break;
          }
        }

        if (detection.type === 'code') {
          break;
        }
      }

      if (detection.type !== 'code') {
        for (let regionIndex = 0; regionIndex < nameRegions.length; regionIndex += 1) {
          const region = nameRegions[regionIndex];
          const regionImages = createProcessedRegionImages(sourceCanvas, region);

          if (regionImages.length === 0) {
            continue;
          }

          setScanActivity((current) => ({
            ...current,
            attempts: current.attempts + 1,
            inspectedRegions: codeRegions.length + regionIndex + 1,
            currentRegion: region.label,
            currentVariant: regionImages[0].label,
          }));

          const result = await recognize(regionImages[0].image, 'eng');
          const detectedText = result?.data?.text || '';
          regionTexts.push(`${region.label} / ${regionImages[0].label}: ${detectedText.trim()}`);

          const nameDetection = extractLikelyNameQuery(detectedText, scannerProfile);
          const snippet = detectedText.replace(/\s+/g, ' ').trim().slice(0, 96);

          setScanActivity((current) => ({
            ...current,
            lastSnippet: snippet,
            lastQuery: nameDetection.query || current.lastQuery,
            lastType: nameDetection.type,
          }));

          if (nameDetection.query) {
            detection = nameDetection;
            appendScanEvent({
              tone: 'success',
              title: `Nombre candidato: ${nameDetection.query}`,
              detail: snippet || 'Coincidencia por nombre.',
            });
            break;
          }
        }
      }

      const detectedText = regionTexts.filter(Boolean).join('\n\n');
      const nextQuery = detection.query || '';
      const canResolve = shouldAutoResolveDetection(detection);

      setRawDetectionText(detectedText);
      setManualQuery(nextQuery);
      setResolvedQuery(canResolve ? nextQuery : '');
      setDetectionNotice(
        detection.type === 'code'
          ? `Carta detectada por codigo: ${nextQuery}`
          : detection.type === 'name'
            ? `Posible carta detectada por nombre: ${nextQuery}`
            : 'No he fijado una carta clara todavia. Acerca mejor el codigo o busca por codigo/nombre.'
      );
      setScanStatus('ready');
      appendScanEvent({
        tone: canResolve ? 'success' : 'warning',
        title: canResolve ? `Busqueda enviada: ${nextQuery}` : 'Sin candidato claro',
        detail: canResolve
          ? 'Se ha enviado al resolvedor de cartas.'
          : 'Se seguira intentando mientras no haya candidatos.',
      });

      trackProductEvent('scanner_analysis_completed', {
        tgc: activeTcgSlug,
        has_query: canResolve,
        chars: detectedText.length,
      });
    } catch (_error) {
      setScanStatus('error');
      setScanError('No se pudo analizar la carta. Puedes buscar por codigo o nombre.');
      appendScanEvent({
        tone: 'error',
        title: 'Error de analisis',
        detail: 'No se pudo completar esta pasada.',
      });
      trackProductEvent('scanner_analysis_completed', {
        tgc: activeTcgSlug,
        has_query: false,
      });
    }
  }, [activeTcgSlug, appendScanEvent, scannerProfile]);

  const analyzeCurrentFrame = useCallback(async ({ force = false } = {}) => {
    if (scanInProgressRef.current) {
      return;
    }

    if (!force && candidates.length > 0) {
      return;
    }

    if (!videoRef.current || !canvasRef.current || cameraStatus !== 'ready') {
      if (force) {
        setCameraError('Activa la camara antes de detectar cartas.');
      }
      return;
    }

    const video = videoRef.current;
    if (video.readyState < 2) {
      return;
    }

    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) {
      setScanError('No se pudo preparar la imagen. Prueba con la busqueda manual.');
      return;
    }

    scanInProgressRef.current = true;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      await analyzeFrame(canvas);
    } finally {
      scanInProgressRef.current = false;
    }
  }, [analyzeFrame, cameraStatus, candidates.length]);

  useEffect(() => {
    if (!isOpen || isGuestDemo || cameraStatus !== 'ready') {
      return undefined;
    }

    let cancelled = false;
    const detect = () => {
      if (!cancelled) {
        analyzeCurrentFrame();
      }
    };

    const firstDetection = window.setTimeout(detect, 650);
    const detectionInterval = window.setInterval(detect, 4200);

    return () => {
      cancelled = true;
      window.clearTimeout(firstDetection);
      window.clearInterval(detectionInterval);
    };
  }, [analyzeCurrentFrame, cameraStatus, isGuestDemo, isOpen]);

  const retryDetection = () => {
    setManualQuery('');
    setResolvedQuery('');
    setSelectedCardId('');
    setFormError('');
    setScanError('');
    setDetectionNotice('Reintentando deteccion...');
    analyzeCurrentFrame({ force: true });
  };

  const submitManualSearch = (event) => {
    event.preventDefault();
    const nextQuery = manualQuery.trim();

    if (nextQuery.length < MIN_QUERY_LENGTH) {
      setFormError('Escribe al menos 2 caracteres para buscar una carta.');
      return;
    }

    setFormError('');
    setResolvedQuery(nextQuery);
    setDetectionNotice(`Busqueda preparada: ${nextQuery}`);
  };

  const handleAddCard = () => {
    const parsedQuantity = Number(quantity);

    if (!selectedCandidate) {
      setFormError('Selecciona una carta antes de anadirla.');
      return;
    }

    if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
      setFormError('La cantidad debe ser un numero entero mayor que 0.');
      return;
    }

    setFormError('');
    onAddCard(selectedCandidate, parsedQuantity);
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="card-modal scanner-modal-overlay" role="presentation">
      <div className="scanner-modal" role="dialog" aria-modal="true" aria-labelledby="scanner-title">
        <div className="scanner-modal-header">
          <div>
            <span className="eyebrow">Scanner</span>
            <h2 id="scanner-title">Detectar carta</h2>
            <p>
              Acerca la zona del codigo de {activeGameName} a la camara. La deteccion se hace en tu navegador,
              no guardamos imagenes y siempre confirmas antes de sumar copias. Ejemplos: {scannerProfile.examples}.
            </p>
          </div>
          <button type="button" className="modal-close-button" onClick={onClose} aria-label="Cerrar scanner">
            x
          </button>
        </div>

        {isGuestDemo ? (
          <div className="scanner-guest-panel">
            <h3>Scanner disponible con cuenta</h3>
            <p>Registrate para poder detectar cartas y sumar copias reales a tu coleccion.</p>
            <div className="scanner-guest-actions">
              <Link className="primary-link-button" to="/?auth=register&returnTo=/collection">Registrarse</Link>
              <Link className="ghost-button" to="/?auth=login&returnTo=/collection">Iniciar sesion</Link>
            </div>
          </div>
        ) : (
          <>
            <div className="scanner-grid">
              <section className="scanner-camera-card">
                <div className="scanner-camera-frame">
                  <video
                    ref={videoRef}
                    className={cameraStatus === 'ready' ? '' : 'is-hidden'}
                    muted
                    playsInline
                    aria-label="Vista previa de camara"
                  />
                  {cameraStatus !== 'ready' && (
                    <div className="scanner-camera-placeholder">
                      <strong>Activa la camara y acerca el codigo</strong>
                      <span>Evita reflejos fuertes y manten la carta quieta. Ejemplos: {scannerProfile.examples}.</span>
                    </div>
                  )}
                  <div className="scanner-guide">
                    <span>{scannerProfile.guide}</span>
                  </div>
                </div>

                {cameraStatus === 'ready' && (
                  <>
                    <div className={`scanner-live-status ${scanStatus === 'detecting' ? 'is-detecting' : ''}`} aria-live="polite">
                      <strong>{scanStatus === 'detecting' ? 'Escaneando en tiempo real...' : 'Escaneo activo'}</strong>
                      <span>
                        {scanStatus === 'detecting'
                          ? 'Manten la carta quieta un momento.'
                          : 'Si no aparece candidato, acerca el codigo o pulsa reintentar.'}
                      </span>
                    </div>

                    <div className="scanner-admin-trace" aria-live="polite">
                      <div className="scanner-admin-trace-header">
                        <strong>Panel admin de deteccion</strong>
                        <span>
                          Pasada {scanActivity.cycle || 0} | Intentos {scanActivity.attempts || 0}
                        </span>
                      </div>
                      <div className="scanner-admin-trace-grid">
                        <span>
                          <b>Zona actual</b>
                          {scanActivity.currentRegion || 'Esperando imagen estable'}
                        </span>
                        <span>
                          <b>Variante</b>
                          {scanActivity.currentVariant || 'Sin intento todavia'}
                        </span>
                        <span>
                          <b>Progreso</b>
                          {scanActivity.totalRegions
                            ? `${scanActivity.inspectedRegions}/${scanActivity.totalRegions} zonas`
                            : 'Preparando zonas'}
                        </span>
                        <span>
                          <b>Query candidata</b>
                          {scanActivity.lastQuery || 'Sin candidato'}
                        </span>
                      </div>
                      <div className="scanner-admin-last-text">
                        <b>Ultima pista</b>
                        <code>{scanActivity.lastSnippet || 'Todavia no hay texto util en la imagen.'}</code>
                      </div>
                      <div className="scanner-admin-events">
                        {scanEvents.length === 0 ? (
                          <span className="scanner-admin-event is-muted">Activa la camara para ver eventos en vivo.</span>
                        ) : scanEvents.map((event) => (
                          <span key={event.id} className={`scanner-admin-event is-${event.tone || 'muted'}`}>
                            <i>{event.time}</i>
                            <b>{event.title}</b>
                            <em>{event.detail}</em>
                          </span>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {cameraError && <p className="scanner-error">{cameraError}</p>}
                {scanError && <p className="scanner-error">{scanError}</p>}
                {detectionNotice && <p className="scanner-muted">{detectionNotice}</p>}

                <div className="scanner-camera-actions">
                  {cameraStatus !== 'ready' ? (
                    <button
                      type="button"
                      className="primary-link-button"
                      onClick={startCamera}
                      disabled={cameraStatus === 'requesting'}
                    >
                      {cameraStatus === 'requesting' ? 'Abriendo camara...' : 'Activar camara'}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="primary-link-button"
                        onClick={retryDetection}
                        disabled={scanStatus === 'detecting'}
                      >
                        {scanStatus === 'detecting' ? 'Detectando...' : 'Reintentar ahora'}
                      </button>
                      <button type="button" className="ghost-button" onClick={stopCamera}>
                        Detener camara
                      </button>
                    </>
                  )}
                </div>
              </section>

              <section className="scanner-results-card">
                <form className="scanner-manual-form" onSubmit={submitManualSearch}>
                  <label htmlFor="scanner-query">Codigo o nombre</label>
                  <div className="scanner-query-row">
                    <input
                      id="scanner-query"
                      type="text"
                      value={manualQuery}
                      placeholder={`Ej: ${scannerProfile.examples}`}
                      onChange={(event) => setManualQuery(event.target.value)}
                    />
                    <button type="submit" className="ghost-button">
                      Buscar
                    </button>
                  </div>
                </form>

                {rawDetectionText && (
                  <details className="scanner-debug-text">
                    <summary>Ver pistas detectadas</summary>
                    <pre>{rawDetectionText}</pre>
                  </details>
                )}

                {formError && <p className="scanner-error">{formError}</p>}
                {candidatesQuery.isFetching && <p className="scanner-muted">Buscando candidatos...</p>}
                {candidatesQuery.isError && (
                  <p className="scanner-error">No se pudieron buscar candidatos. Prueba de nuevo.</p>
                )}

                {resolvedQuery && candidatesQuery.status === 'success' && candidates.length === 0 && (
                  <div className="scanner-empty-result">
                    <strong>No hemos encontrado coincidencias claras</strong>
                    <span>Corrige el codigo o prueba con el nombre visible de la carta.</span>
                  </div>
                )}

                {candidates.length > 0 && (
                  <div className="scanner-result-summary">
                    <strong>Elige la carta exacta</strong>
                    <span>Si hay artes alternativos o variantes, confirma el codigo antes de sumar copias.</span>
                  </div>
                )}

                {candidates.length > 0 && (
                  <div className="scanner-candidates" role="radiogroup" aria-label="Candidatos encontrados">
                    {candidates.map((candidate) => (
                      <button
                        key={candidate.id}
                        type="button"
                        className={`scanner-candidate ${String(candidate.id) === String(selectedCardId) ? 'is-selected' : ''}`}
                        aria-checked={String(candidate.id) === String(selectedCardId)}
                        role="radio"
                        onClick={() => setSelectedCardId(String(candidate.id))}
                      >
                        {candidate.thumbnail_url || candidate.image_url ? (
                          <img src={candidate.thumbnail_url || candidate.image_url} alt="" loading="lazy" />
                        ) : (
                          <span className="scanner-candidate-image-fallback">{candidate.name?.slice(0, 2) || 'TC'}</span>
                        )}
                        <span>
                          <span className="scanner-candidate-topline">
                            <b>{candidate.source_card_id}</b>
                            {candidate.score >= 100 && <i>Mejor match</i>}
                          </span>
                          <strong>{candidate.name}</strong>
                          <small>{[candidate.set_name, candidate.card_type, candidate.rarity].filter(Boolean).join(' | ')}</small>
                          {candidate.deck_key && candidate.deck_key !== candidate.source_card_id && (
                            <small>Codigo base: {candidate.deck_key}</small>
                          )}
                          <em>{getCandidateMatchLabel(candidate)}</em>
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="scanner-confirm-panel">
                  <label htmlFor="scanner-quantity">Cantidad a sumar</label>
                  <input
                    id="scanner-quantity"
                    type="number"
                    min="1"
                    step="1"
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                  />
                  <button
                    type="button"
                    className="primary-link-button"
                    onClick={handleAddCard}
                    disabled={!selectedCandidate || isAdding}
                  >
                    {isAdding ? 'Anadiendo...' : 'Anadir a coleccion'}
                  </button>
                </div>
              </section>
            </div>

            <canvas ref={canvasRef} className="scanner-hidden-canvas" aria-hidden="true" />
          </>
        )}
      </div>
    </div>
  );
}

export default CollectionScannerModal;
