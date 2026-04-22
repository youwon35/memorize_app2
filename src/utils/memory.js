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


