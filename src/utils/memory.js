const normalizeText = (value = "") =>
  value
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

const createId = (prefix) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const createBlankDraft = () => ({
  id: createId("draft"),
  left: "",
  right: "",
});

export const createLocalPair = (left, right) => {
  const now = new Date().toISOString();

  return {
    id: createId("local"),
    left: left.trim(),
    right: right.trim(),
    source: "local",
    createdAt: now,
    updatedAt: now,
  };
};

export const updatePairValues = (pair, left, right) => ({
  ...pair,
  left: left.trim(),
  right: right.trim(),
  updatedAt: new Date().toISOString(),
});

export const createSignature = (left, right) =>
  `${normalizeText(left)}::${normalizeText(right)}`;

export const compareAnswers = (input, expected) =>
  normalizeText(input) === normalizeText(expected);

export const sortPairs = (pairs) =>
  [...pairs].sort(
    (a, b) =>
      new Date(b.updatedAt || b.createdAt || 0) -
      new Date(a.updatedAt || a.createdAt || 0)
  );

export const mergePairsBySignature = (...collections) => {
  const merged = new Map();

  collections.flat().forEach((pair) => {
    const signature = createSignature(pair.left, pair.right);
    const current = merged.get(signature);

    if (!current || pair.source === "cloud") {
      merged.set(signature, pair);
    }
  });

  return sortPairs(Array.from(merged.values()));
};

export const createEmptyStudyStats = () => ({
  cards: {},
  sessions: [],
});

export const createPersistableStudyStats = (studyStats, pairs = []) => {
  const syncedStats = syncStudyStatsWithPairs(studyStats, pairs);

  return {
    cards: Object.fromEntries(
      Object.entries(syncedStats.cards).map(([signature, cardStats]) => [
        signature,
        createPersistableCardStats(cardStats),
      ])
    ),
    sessions: syncedStats.sessions
      .map((session) => createPersistableStudySession(session))
      .filter(Boolean),
  };
};

export const syncStudyStatsWithPairs = (studyStats, pairs) => {
  const safeStats = ensureStudyStats(studyStats);
  const nextCards = { ...safeStats.cards };

  pairs.forEach((pair) => {
    const signature = createSignature(pair.left, pair.right);
    nextCards[signature] = ensureCardStats(nextCards[signature], pair);
  });

  return {
    ...safeStats,
    cards: nextCards,
  };
};

export const migrateStudyStatsEntry = (studyStats, previousPair, nextPair) => {
  const safeStats = ensureStudyStats(studyStats);
  const previousSignature = createSignature(previousPair.left, previousPair.right);
  const nextSignature = createSignature(nextPair.left, nextPair.right);

  if (previousSignature === nextSignature) {
    return syncStudyStatsWithPairs(safeStats, [nextPair]);
  }

  const nextCards = { ...safeStats.cards };
  const previousStats = nextCards[previousSignature];
  const nextStats = ensureCardStats(nextCards[nextSignature], nextPair);

  if (previousStats) {
    nextCards[nextSignature] = mergeCardStats(previousStats, nextStats, nextPair);
    delete nextCards[previousSignature];
  } else {
    nextCards[nextSignature] = nextStats;
  }

  return {
    ...safeStats,
    cards: nextCards,
  };
};

export const recordStudyAttempt = (studyStats, card, isCorrect) => {
  const safeStats = ensureStudyStats(studyStats);
  const signature = card.signature ?? createSignature(card.left ?? card.prompt, card.right ?? card.answer);
  const timestamp = new Date().toISOString();
  const currentCardStats = ensureCardStats(safeStats.cards[signature], card);
  const currentDirectionStats = ensureDirectionStats(currentCardStats.directions[card.direction]);
  const nextDirectionStats = {
    ...currentDirectionStats,
    attempts: currentDirectionStats.attempts + 1,
    correct: currentDirectionStats.correct + (isCorrect ? 1 : 0),
    incorrect: currentDirectionStats.incorrect + (isCorrect ? 0 : 1),
    lastStudiedAt: timestamp,
    lastCorrectAt: isCorrect ? timestamp : currentDirectionStats.lastCorrectAt,
    lastIncorrectAt: isCorrect ? currentDirectionStats.lastIncorrectAt : timestamp,
    lastResult: isCorrect ? "correct" : "incorrect",
  };
  const nextCardStats = {
    ...currentCardStats,
    left: card.left ?? currentCardStats.left,
    right: card.right ?? currentCardStats.right,
    attempts: currentCardStats.attempts + 1,
    correct: currentCardStats.correct + (isCorrect ? 1 : 0),
    incorrect: currentCardStats.incorrect + (isCorrect ? 0 : 1),
    lastStudiedAt: timestamp,
    lastCorrectAt: isCorrect ? timestamp : currentCardStats.lastCorrectAt,
    lastIncorrectAt: isCorrect ? currentCardStats.lastIncorrectAt : timestamp,
    lastResult: isCorrect ? "correct" : "incorrect",
    directions: {
      ...currentCardStats.directions,
      [card.direction]: nextDirectionStats,
    },
  };

  return {
    ...safeStats,
    cards: {
      ...safeStats.cards,
      [signature]: nextCardStats,
    },
  };
};

export const appendStudySession = (studyStats, session, maxSessions = 60) => {
  const safeStats = ensureStudyStats(studyStats);

  return {
    ...safeStats,
    sessions: [session, ...safeStats.sessions].slice(0, maxSessions),
  };
};

export const buildPracticeDeck = (pairs, limit, mode = "both", studyStats = null) => {
  const candidates = sortPairs(pairs).flatMap((pair) => {
    const base = {
      pairId: pair.id,
      left: pair.left,
      right: pair.right,
      signature: createSignature(pair.left, pair.right),
      createdAt: pair.createdAt ?? new Date().toISOString(),
    };

    if (mode === "front") {
      return [
        {
          ...base,
          id: `${pair.id}-front`,
          prompt: pair.left,
          answer: pair.right,
          direction: "A_TO_B",
        },
      ];
    }

    if (mode === "back") {
      return [
        {
          ...base,
          id: `${pair.id}-back`,
          prompt: pair.right,
          answer: pair.left,
          direction: "B_TO_A",
        },
      ];
    }

    return [
      {
        ...base,
        id: `${pair.id}-front`,
        prompt: pair.left,
        answer: pair.right,
        direction: "A_TO_B",
      },
      {
        ...base,
        id: `${pair.id}-back`,
        prompt: pair.right,
        answer: pair.left,
        direction: "B_TO_A",
      },
    ];
  });
  const prioritizedDeck = studyStats
    ? weightedSample(
        candidates.map((card) => ({
          ...card,
          weight: getCardPriority(card, studyStats),
        }))
      ).map(({ weight, ...card }) => card)
    : shuffle(candidates);

  if (!Number.isFinite(limit)) {
    return prioritizedDeck;
  }

  return prioritizedDeck.slice(0, Math.max(1, Math.min(limit, prioritizedDeck.length)));
};

export const shuffleItems = (items) => shuffle(items);

export const parseImportedPairs = (text) => {
  const entries = [];
  const invalidEntryIndexes = [];

  text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n+/)
    .forEach((rawBlock, index) => {
      const lines = rawBlock
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"));

      if (!lines.length) {
        return;
      }

      if (lines.length !== 2) {
        invalidEntryIndexes.push(index + 1);
        return;
      }

      const [left, right] = lines;

      if (!left || !right) {
        invalidEntryIndexes.push(index + 1);
        return;
      }

      entries.push({ left, right });
    });

  return { entries, invalidEntryIndexes };
};

export const extractPairsFromRecognizedText = (recognizedText, imageLayout = null) => {
  const candidates = ["elements", "lines"]
    .map((granularity) => {
      const segments = collectRecognizedSegments(recognizedText, granularity);

      if (!segments.length) {
        return null;
      }

      return {
        granularity,
        result: extractPairsFromRecognizedSegments(segments, imageLayout),
      };
    })
    .filter(Boolean);

  if (!candidates.length) {
    return { entries: [], invalidRowIndexes: [], rows: [] };
  }

  const bestCandidate = candidates.reduce((currentBest, candidate) =>
    compareRecognitionCandidates(currentBest, candidate) >= 0 ? currentBest : candidate
  );

  return bestCandidate.result;
};

function extractPairsFromRecognizedSegments(segments, imageLayout = null) {
  const medianHeight = getMedian(segments.map((segment) => segment.height));
  const rowThreshold = Math.max(18, medianHeight * 0.72);
  const columnSplitX = inferColumnSplitX(segments, rowThreshold, imageLayout);
  const rows = [];

  segments
    .sort((left, right) => left.centerY - right.centerY || left.left - right.left)
    .forEach((segment) => {
      const latestRow = rows[rows.length - 1];

      if (!latestRow || !shouldAppendSegmentToRow(latestRow, segment, rowThreshold)) {
        rows.push(createRecognizedRow(segment));
        return;
      }

      appendSegmentToRow(latestRow, segment);
    });

  const entries = [];
  const invalidRowIndexes = [];
  const parsedRows = rows.map((row, index) => {
    const parsed = parseRecognizedRow(row.segments, rowThreshold, columnSplitX);

    if (!parsed) {
      invalidRowIndexes.push(index + 1);
      return {
        index: index + 1,
        left: "",
        right: "",
        rawText: row.segments.map((segment) => segment.text).join(" ").trim(),
      };
    }

    const entry = {
      left: parsed.left,
      right: parsed.right,
    };

    entries.push(entry);

    return {
      index: index + 1,
      ...entry,
      rawText: row.segments.map((segment) => segment.text).join(" ").trim(),
    };
  });

  return { entries, invalidRowIndexes, rows: parsedRows };
}

export const mapPairRecord = (record) => ({
  id: record.id,
  left: record.prompt_a ?? "",
  right: record.prompt_b ?? "",
  source: "cloud",
  userId: record.user_id ?? null,
  createdAt: record.created_at,
  updatedAt: record.updated_at,
});

export const getDirectionLabel = (direction) =>
  direction === "A_TO_B" ? "앞면 -> 뒷면" : "뒷면 -> 앞면";

function shuffle(items) {
  const cloned = [...items];

  for (let index = cloned.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    const current = cloned[index];

    cloned[index] = cloned[randomIndex];
    cloned[randomIndex] = current;
  }

  return cloned;
}

function collectRecognizedSegments(recognizedText, granularity = "elements") {
  return (recognizedText?.blocks ?? []).flatMap((block) =>
    (block?.lines ?? []).flatMap((line) => {
      const useElements =
        granularity === "elements" &&
        Array.isArray(line?.elements) &&
        line.elements.length;
      const units =
        useElements
          ? line.elements
          : line?.text
            ? [line]
            : [];

      return units
        .map((unit) => {
          const text = normalizeOcrText(unit?.text);
          const frame = normalizeOcrFrame(unit?.frame);

          if (!text || !frame) {
            return null;
          }

          return {
            text,
            ...frame,
            centerX: (frame.left + frame.right) / 2,
            centerY: (frame.top + frame.bottom) / 2,
            width: Math.max(1, frame.right - frame.left),
            height: Math.max(1, frame.bottom - frame.top),
          };
        })
        .filter(Boolean);
    })
  );
}

function compareRecognitionCandidates(leftCandidate, rightCandidate) {
  const leftScore = getRecognitionScore(leftCandidate?.result);
  const rightScore = getRecognitionScore(rightCandidate?.result);

  if (leftScore !== rightScore) {
    return leftScore - rightScore;
  }

  if (leftCandidate?.granularity === rightCandidate?.granularity) {
    return 0;
  }

  return leftCandidate?.granularity === "elements" ? 1 : -1;
}

function getRecognitionScore(result) {
  if (!result) {
    return Number.NEGATIVE_INFINITY;
  }

  const textVolume = result.rows.reduce(
    (sum, row) => sum + `${row.left ?? ""}${row.right ?? ""}${row.rawText ?? ""}`.length,
    0
  );

  return (
    result.entries.length * 1000 -
    result.invalidRowIndexes.length * 180 +
    textVolume
  );
}

function normalizeOcrText(value = "") {
  return `${value}`.replace(/\s+/g, " ").trim();
}

function normalizeOcrFrame(frame) {
  if (!frame || typeof frame !== "object") {
    return null;
  }

  const left = Number(frame.left ?? frame.x ?? NaN);
  const top = Number(frame.top ?? frame.y ?? NaN);
  const right = Number(
    frame.right ??
      (Number.isFinite(frame.width) && Number.isFinite(left) ? left + frame.width : NaN)
  );
  const bottom = Number(
    frame.bottom ??
      (Number.isFinite(frame.height) && Number.isFinite(top) ? top + frame.height : NaN)
  );

  if (![left, top, right, bottom].every(Number.isFinite)) {
    return null;
  }

  return { left, top, right, bottom };
}

function getMedian(values) {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);

  if (!sorted.length) {
    return 0;
  }

  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

function createRecognizedRow(segment) {
  return {
    segments: [segment],
    top: segment.top,
    bottom: segment.bottom,
    centerY: segment.centerY,
    height: segment.height,
  };
}

function shouldAppendSegmentToRow(row, segment, rowThreshold) {
  const verticalDistance = Math.abs(segment.centerY - row.centerY);

  return verticalDistance <= Math.max(rowThreshold, row.height * 0.82, segment.height * 0.82);
}

function appendSegmentToRow(row, segment) {
  row.segments.push(segment);
  row.top = Math.min(row.top, segment.top);
  row.bottom = Math.max(row.bottom, segment.bottom);
  row.height = Math.max(1, row.bottom - row.top);
  row.centerY = (row.top + row.bottom) / 2;
}

function inferColumnSplitX(segments, rowThreshold, imageLayout = null) {
  const clusteredSplit = inferColumnSplitByClusters(segments, rowThreshold, imageLayout);

  if (Number.isFinite(clusteredSplit)) {
    return clusteredSplit;
  }

  return inferColumnSplitByLargestGap(segments, rowThreshold, imageLayout);
}

function inferColumnSplitByClusters(segments, rowThreshold, imageLayout = null) {
  if (segments.length < 2) {
    return null;
  }

  const imageWidth = Number.isFinite(imageLayout?.width) ? imageLayout.width : null;
  const imageMidX = imageWidth ? imageWidth / 2 : null;
  const pageLeft = Math.min(...segments.map((segment) => segment.left));
  const pageRight = Math.max(...segments.map((segment) => segment.right));
  const pageWidth = Math.max(1, pageRight - pageLeft);
  let leftCenter = Math.min(...segments.map((segment) => segment.centerX));
  let rightCenter = Math.max(...segments.map((segment) => segment.centerX));

  if (!Number.isFinite(leftCenter) || !Number.isFinite(rightCenter) || leftCenter === rightCenter) {
    return null;
  }

  let leftCluster = [];
  let rightCluster = [];

  for (let index = 0; index < 8; index += 1) {
    leftCluster = [];
    rightCluster = [];

    segments.forEach((segment) => {
      const leftDistance = Math.abs(segment.centerX - leftCenter);
      const rightDistance = Math.abs(segment.centerX - rightCenter);

      if (leftDistance <= rightDistance) {
        leftCluster.push(segment);
      } else {
        rightCluster.push(segment);
      }
    });

    if (!leftCluster.length || !rightCluster.length) {
      return null;
    }

    const nextLeftCenter =
      leftCluster.reduce((sum, segment) => sum + segment.centerX, 0) / leftCluster.length;
    const nextRightCenter =
      rightCluster.reduce((sum, segment) => sum + segment.centerX, 0) / rightCluster.length;

    if (
      Math.abs(nextLeftCenter - leftCenter) < 0.5 &&
      Math.abs(nextRightCenter - rightCenter) < 0.5
    ) {
      leftCenter = nextLeftCenter;
      rightCenter = nextRightCenter;
      break;
    }

    leftCenter = nextLeftCenter;
    rightCenter = nextRightCenter;
  }

  if (!leftCluster.length || !rightCluster.length) {
    return null;
  }

  if (leftCenter > rightCenter) {
    [leftCenter, rightCenter] = [rightCenter, leftCenter];
    [leftCluster, rightCluster] = [rightCluster, leftCluster];
  }

  const clusterDistance = rightCenter - leftCenter;
  const minimumClusterDistance = Math.max(40, pageWidth * 0.16, rowThreshold * 1.8);

  if (clusterDistance < minimumClusterDistance) {
    return null;
  }

  if (Number.isFinite(imageMidX)) {
    const leftTouchesLeftSide = leftCluster.some((segment) => segment.centerX < imageMidX);
    const rightTouchesRightSide = rightCluster.some((segment) => segment.centerX > imageMidX);

    if (!leftTouchesLeftSide || !rightTouchesRightSide) {
      return null;
    }
  }

  const leftMaxRight = Math.max(...leftCluster.map((segment) => segment.right));
  const rightMinLeft = Math.min(...rightCluster.map((segment) => segment.left));

  if (
    Number.isFinite(imageMidX) &&
    imageMidX > leftMaxRight &&
    imageMidX < rightMinLeft
  ) {
    return imageMidX;
  }

  if (Number.isFinite(leftMaxRight) && Number.isFinite(rightMinLeft) && rightMinLeft > leftMaxRight) {
    return (leftMaxRight + rightMinLeft) / 2;
  }

  return (leftCenter + rightCenter) / 2;
}

function inferColumnSplitByLargestGap(segments, rowThreshold, imageLayout = null) {
  const sortedSegments = [...segments].sort((left, right) => left.left - right.left);

  if (sortedSegments.length < 2) {
    return null;
  }

  const pageWidth = Math.max(
    1,
    sortedSegments[sortedSegments.length - 1].right - sortedSegments[0].left
  );
  const gaps = sortedSegments.slice(0, -1).map((segment, index) => ({
    index,
    gap: sortedSegments[index + 1].left - segment.right,
    splitX: (segment.right + sortedSegments[index + 1].left) / 2,
  }));
  const largestGap = gaps.reduce(
    (currentLargest, gap) => (gap.gap > currentLargest.gap ? gap : currentLargest),
    { index: -1, gap: -Infinity, splitX: null }
  );
  const gapThreshold = Math.max(12, pageWidth * 0.045, rowThreshold * 0.65);

  if (largestGap.index < 0 || largestGap.gap < gapThreshold) {
    return null;
  }

  const leftSegments = sortedSegments.filter((segment) => segment.centerX <= largestGap.splitX);
  const rightSegments = sortedSegments.filter((segment) => segment.centerX > largestGap.splitX);

  if (!leftSegments.length || !rightSegments.length) {
    return null;
  }

  if (Number.isFinite(imageLayout?.width)) {
    const imageMidX = imageLayout.width / 2;
    const tolerance = Math.max(48, imageLayout.width * 0.22);

    if (Math.abs(largestGap.splitX - imageMidX) > tolerance) {
      return null;
    }
  }

  return largestGap.splitX;
}

function parseRecognizedRow(segments, rowThreshold, columnSplitX = null) {
  const sortedSegments = [...segments].sort((left, right) => left.left - right.left);

  if (!sortedSegments.length) {
    return null;
  }

  if (sortedSegments.length === 1) {
    return splitMergedRecognizedText(sortedSegments[0].text);
  }

  if (Number.isFinite(columnSplitX)) {
    const leftSegments = sortedSegments.filter((segment) => segment.centerX <= columnSplitX);
    const rightSegments = sortedSegments.filter((segment) => segment.centerX > columnSplitX);

    if (leftSegments.length && rightSegments.length) {
      const pairedByGlobalSplit = buildPairFromRecognizedClusters(leftSegments, rightSegments);

      if (pairedByGlobalSplit) {
        return pairedByGlobalSplit;
      }
    }
  }

  const rowWidth = Math.max(
    1,
    sortedSegments[sortedSegments.length - 1].right - sortedSegments[0].left
  );
  const gaps = sortedSegments.slice(0, -1).map((segment, index) => ({
    index,
    gap: sortedSegments[index + 1].left - segment.right,
  }));
  const largestGap = gaps.reduce(
    (currentLargest, gap) => (gap.gap > currentLargest.gap ? gap : currentLargest),
    { index: -1, gap: -Infinity }
  );
  const gapThreshold = Math.max(12, rowWidth * 0.045, rowThreshold * 0.65);

  if (
    largestGap.index >= 0 &&
    largestGap.gap >= gapThreshold
  ) {
    return buildPairFromRecognizedClusters(
      sortedSegments.slice(0, largestGap.index + 1),
      sortedSegments.slice(largestGap.index + 1)
    );
  }

  return splitMergedRecognizedText(
    sortedSegments.map((segment) => segment.text).join("   ")
  );
}

function buildPairFromRecognizedClusters(leftSegments, rightSegments) {
  const left = leftSegments.map((segment) => segment.text).join(" ").replace(/\s+/g, " ").trim();
  const right = rightSegments
    .map((segment) => segment.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!left || !right) {
    return null;
  }

  return { left, right };
}

function splitMergedRecognizedText(text) {
  const normalized = normalizeOcrText(text);

  if (!normalized) {
    return null;
  }

  const separatorPatterns = [
    /\t+/,
    /\s{3,}/,
    /\s+(?:\||\/|::|=>|->|→)\s+/,
    /\s{2,}/,
  ];

  for (const separatorPattern of separatorPatterns) {
    if (!separatorPattern.test(normalized)) {
      continue;
    }

    const parts = normalized
      .split(separatorPattern)
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length < 2) {
      continue;
    }

    const splitIndex = Math.ceil(parts.length / 2);
    const left = parts.slice(0, splitIndex).join(" ").trim();
    const right = parts.slice(splitIndex).join(" ").trim();

    if (left && right) {
      return { left, right };
    }
  }

  const mixedScriptPair = splitMixedScriptTokens(normalized);

  if (mixedScriptPair) {
    return mixedScriptPair;
  }

  return null;
}

function splitMixedScriptTokens(text) {
  const tokens = text.split(/\s+/).filter(Boolean);

  if (tokens.length < 2) {
    return null;
  }

  const firstScriptIndex = tokens.findIndex((token) => getTokenScript(token) !== "other");

  if (firstScriptIndex < 0) {
    return null;
  }

  const baseScript = getTokenScript(tokens[firstScriptIndex]);

  for (let index = firstScriptIndex + 1; index < tokens.length; index += 1) {
    const script = getTokenScript(tokens[index]);

    if (script === "other") {
      continue;
    }

    if (script !== baseScript) {
      const left = tokens.slice(0, index).join(" ").trim();
      const right = tokens.slice(index).join(" ").trim();

      if (left && right) {
        return { left, right };
      }

      return null;
    }
  }

  return null;
}

function getTokenScript(token) {
  if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/.test(token)) {
    return "cjk";
  }

  if (/[A-Za-z]/.test(token)) {
    return "latin";
  }

  return "other";
}

function ensureStudyStats(studyStats) {
  if (!studyStats || typeof studyStats !== "object") {
    return createEmptyStudyStats();
  }

  return {
    cards: studyStats.cards && typeof studyStats.cards === "object" ? studyStats.cards : {},
    sessions: Array.isArray(studyStats.sessions) ? studyStats.sessions : [],
  };
}

function ensureCardStats(currentStats, pair = {}) {
  return {
    left: currentStats?.left ?? pair.left ?? "",
    right: currentStats?.right ?? pair.right ?? "",
    createdAt: currentStats?.createdAt ?? pair.createdAt ?? new Date().toISOString(),
    attempts: currentStats?.attempts ?? 0,
    correct: currentStats?.correct ?? 0,
    incorrect: currentStats?.incorrect ?? 0,
    lastStudiedAt: currentStats?.lastStudiedAt ?? null,
    lastCorrectAt: currentStats?.lastCorrectAt ?? null,
    lastIncorrectAt: currentStats?.lastIncorrectAt ?? null,
    lastResult: currentStats?.lastResult ?? null,
    directions: {
      A_TO_B: ensureDirectionStats(currentStats?.directions?.A_TO_B),
      B_TO_A: ensureDirectionStats(currentStats?.directions?.B_TO_A),
    },
  };
}

function ensureDirectionStats(currentStats) {
  return {
    attempts: currentStats?.attempts ?? 0,
    correct: currentStats?.correct ?? 0,
    incorrect: currentStats?.incorrect ?? 0,
    lastStudiedAt: currentStats?.lastStudiedAt ?? null,
    lastCorrectAt: currentStats?.lastCorrectAt ?? null,
    lastIncorrectAt: currentStats?.lastIncorrectAt ?? null,
    lastResult: currentStats?.lastResult ?? null,
  };
}

function createPersistableCardStats(cardStats) {
  const safeCardStats = ensureCardStats(cardStats);

  return {
    left: safeCardStats.left,
    right: safeCardStats.right,
    createdAt: safeCardStats.createdAt,
    attempts: safeCardStats.attempts,
    correct: safeCardStats.correct,
    incorrect: safeCardStats.incorrect,
    lastStudiedAt: safeCardStats.lastStudiedAt,
    lastCorrectAt: safeCardStats.lastCorrectAt,
    lastIncorrectAt: safeCardStats.lastIncorrectAt,
    lastResult: safeCardStats.lastResult,
    directions: {
      A_TO_B: createPersistableDirectionStats(safeCardStats.directions.A_TO_B),
      B_TO_A: createPersistableDirectionStats(safeCardStats.directions.B_TO_A),
    },
  };
}

function createPersistableDirectionStats(directionStats) {
  const safeDirectionStats = ensureDirectionStats(directionStats);

  return {
    attempts: safeDirectionStats.attempts,
    correct: safeDirectionStats.correct,
    incorrect: safeDirectionStats.incorrect,
    lastStudiedAt: safeDirectionStats.lastStudiedAt,
    lastCorrectAt: safeDirectionStats.lastCorrectAt,
    lastIncorrectAt: safeDirectionStats.lastIncorrectAt,
    lastResult: safeDirectionStats.lastResult,
  };
}

function createPersistableStudySession(session) {
  if (!session || typeof session !== "object") {
    return null;
  }

  const timestamp = new Date().toISOString();
  const incorrectCards = Array.isArray(session.incorrectCards)
    ? session.incorrectCards.map((card) => ({
        signature:
          typeof card?.signature === "string" && card.signature
            ? card.signature
            : createSignature(card?.left ?? "", card?.right ?? ""),
        left: card?.left ?? "",
        right: card?.right ?? "",
        direction: card?.direction === "B_TO_A" ? "B_TO_A" : "A_TO_B",
      }))
    : [];

  return {
    id: typeof session.id === "string" && session.id ? session.id : createId("session"),
    startedAt: typeof session.startedAt === "string" ? session.startedAt : timestamp,
    completedAt: typeof session.completedAt === "string" ? session.completedAt : timestamp,
    requestedCount: sanitizeCount(session.requestedCount),
    totalCards: sanitizeCount(session.totalCards),
    mode: sanitizeQuizMode(session.mode),
    source: sanitizeSessionSource(session.source),
    correctCount: sanitizeCount(session.correctCount),
    incorrectCount: sanitizeCount(session.incorrectCount ?? incorrectCards.length),
    incorrectCards,
  };
}

function mergeCardStats(previousStats, nextStats, pair) {
  return {
    left: pair.left,
    right: pair.right,
    createdAt: previousStats.createdAt ?? nextStats.createdAt ?? pair.createdAt ?? new Date().toISOString(),
    attempts: (previousStats.attempts ?? 0) + (nextStats.attempts ?? 0),
    correct: (previousStats.correct ?? 0) + (nextStats.correct ?? 0),
    incorrect: (previousStats.incorrect ?? 0) + (nextStats.incorrect ?? 0),
    lastStudiedAt: laterTimestamp(previousStats.lastStudiedAt, nextStats.lastStudiedAt),
    lastCorrectAt: laterTimestamp(previousStats.lastCorrectAt, nextStats.lastCorrectAt),
    lastIncorrectAt: laterTimestamp(previousStats.lastIncorrectAt, nextStats.lastIncorrectAt),
    lastResult: nextStats.lastResult ?? previousStats.lastResult ?? null,
    directions: {
      A_TO_B: mergeDirectionStats(previousStats.directions?.A_TO_B, nextStats.directions?.A_TO_B),
      B_TO_A: mergeDirectionStats(previousStats.directions?.B_TO_A, nextStats.directions?.B_TO_A),
    },
  };
}

function mergeDirectionStats(previousStats, nextStats) {
  const safePrevious = ensureDirectionStats(previousStats);
  const safeNext = ensureDirectionStats(nextStats);

  return {
    attempts: safePrevious.attempts + safeNext.attempts,
    correct: safePrevious.correct + safeNext.correct,
    incorrect: safePrevious.incorrect + safeNext.incorrect,
    lastStudiedAt: laterTimestamp(safePrevious.lastStudiedAt, safeNext.lastStudiedAt),
    lastCorrectAt: laterTimestamp(safePrevious.lastCorrectAt, safeNext.lastCorrectAt),
    lastIncorrectAt: laterTimestamp(safePrevious.lastIncorrectAt, safeNext.lastIncorrectAt),
    lastResult: safeNext.lastResult ?? safePrevious.lastResult ?? null,
  };
}

function laterTimestamp(first, second) {
  if (!first) {
    return second ?? null;
  }

  if (!second) {
    return first;
  }

  return new Date(first) >= new Date(second) ? first : second;
}

function weightedSample(items) {
  const pool = [...items];
  const ordered = [];

  while (pool.length) {
    const totalWeight = pool.reduce((sum, item) => sum + Math.max(item.weight ?? 1, 0.35), 0);
    let cursor = Math.random() * totalWeight;
    let targetIndex = pool.length - 1;

    for (let index = 0; index < pool.length; index += 1) {
      cursor -= Math.max(pool[index].weight ?? 1, 0.35);

      if (cursor <= 0) {
        targetIndex = index;
        break;
      }
    }

    ordered.push(pool.splice(targetIndex, 1)[0]);
  }

  return ordered;
}

function getCardPriority(card, studyStats) {
  const safeStats = ensureStudyStats(studyStats);
  const cardStats = ensureCardStats(safeStats.cards[card.signature], card);
  const directionStats = ensureDirectionStats(cardStats.directions[card.direction]);
  const attempts = directionStats.attempts;
  const accuracy = attempts ? directionStats.correct / attempts : 0;
  const errorRate = attempts ? directionStats.incorrect / attempts : 0;
  const createdHoursAgo = hoursBetween(cardStats.createdAt);
  const studiedDaysAgo = directionStats.lastStudiedAt ? hoursBetween(directionStats.lastStudiedAt) / 24 : 7;
  const newnessBoost = attempts === 0 ? (createdHoursAgo <= 24 ? 7.2 : 5.4) : 0;
  const mistakeBoost =
    directionStats.incorrect * 1.35 +
    errorRate * 4.6 +
    (directionStats.lastResult === "incorrect" ? 2.1 : 0);
  const staleBoost = Math.min(studiedDaysAgo, 7) * 0.35;
  const masteryPenalty = attempts >= 3 ? accuracy * 2.6 : accuracy * 0.8;

  return Math.max(0.35, 1 + newnessBoost + mistakeBoost + staleBoost - masteryPenalty);
}

function hoursBetween(timestamp) {
  if (!timestamp) {
    return 999;
  }

  return Math.max(0, (Date.now() - new Date(timestamp).getTime()) / (1000 * 60 * 60));
}

function sanitizeCount(value) {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    return 0;
  }

  return Math.max(0, Math.round(parsedValue));
}

function sanitizeQuizMode(mode) {
  if (mode === "front" || mode === "back") {
    return mode;
  }

  return "both";
}

function sanitizeSessionSource(source) {
  if (source === "retry") {
    return "retry";
  }

  return "adaptive";
}


