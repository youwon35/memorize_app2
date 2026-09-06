const KOREAN_PARTICLE_PATTERN =
  /(으로부터|로부터|에게서|한테서|께서|에서|에게|한테|까지|처럼|보다|으로|하고|이랑|랑|이나|나|라도|은|는|이|가|을|를|와|과|도|만|의|야|아|여|로|에)$/;

const normalizeText = (value = "") =>
  String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

const normalizeAnswerText = (value = "") =>
  normalizeText(value)
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[.,!?;:'"“”‘’()[\]{}<>/\\|~`@#$%^&*_+=-]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const compactAnswerText = (value = "") =>
  normalizeAnswerText(value).replace(/\s+/g, "");

const stripTrailingKoreanParticles = (value = "") =>
  normalizeAnswerText(value)
    .split(" ")
    .map((token) => token.replace(KOREAN_PARTICLE_PATTERN, ""))
    .join(" ")
    .trim();

const createId = (prefix) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const createBlankDraft = () => ({
  id: createId("draft"),
  left: "",
  right: "",
});

export const createLocalPair = (left, right, options = {}) => {
  const now = new Date().toISOString();

  return {
    id: createId("local"),
    left: left.trim(),
    right: right.trim(),
    folderId: options.folderId ?? "root",
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

// Preserve numbers and meaningful symbols before applying natural-language leniency.
const requiresExactAnswer = (value) =>
  /[\p{N}\p{S}\/#%&*@\\_^|~`+\-=<>]|\S[.:]\S/u.test(normalizeText(value));

function isStudySignature(signature) {
  if (typeof signature !== "string" || !signature.startsWith("v2:")) return false;
  try {
    const parts = JSON.parse(signature.slice(3));
    return Array.isArray(parts) && parts.length === 3 && parts.every((part) => typeof part === "string");
  } catch {
    return false;
  }
}

export const createStudySignature = (pair = {}) =>
  "v2:" + JSON.stringify([
    pair.folderId ?? "root",
    normalizeText(pair.left ?? (pair.direction === "B_TO_A" ? pair.answer : pair.prompt) ?? ""),
    normalizeText(pair.right ?? (pair.direction === "B_TO_A" ? pair.prompt : pair.answer) ?? ""),
  ]);

// Legacy history without a folder can only be linked if its content is unique.
export const resolveStudyPair = (card, pairs = []) => {
  if (!card) return null;
  const byId = card.pairId && pairs.find((pair) => pair.id === card.pairId);
  if (byId) return byId;
  if (isStudySignature(card.signature)) {
    return pairs.find((pair) => createStudySignature(pair) === card.signature) ?? null;
  }
  const contentSignature = card.signature ?? createSignature(card.left ?? "", card.right ?? "");
  const matches = pairs.filter((pair) =>
    createSignature(pair.left, pair.right) === contentSignature &&
    (card.folderId == null || (pair.folderId ?? "root") === card.folderId)
  );
  return matches.length === 1 ? matches[0] : null;
};

export const compareAnswers = (input, expected) => {
  if (requiresExactAnswer(input) || requiresExactAnswer(expected)) {
    const exactInput = normalizeText(input).replace(/[\u200B-\u200D\uFEFF\s]/g, "");
    const exactExpected = normalizeText(expected).replace(/[\u200B-\u200D\uFEFF\s]/g, "");
    return Boolean(exactInput && exactExpected && exactInput === exactExpected);
  }
  const normalizedInput = compactAnswerText(input);
  const normalizedExpected = compactAnswerText(expected);

  if (!normalizedInput || !normalizedExpected) {
    return false;
  }

  if (normalizedInput === normalizedExpected) {
    return true;
  }

  const strippedInput = compactAnswerText(stripTrailingKoreanParticles(input));

  if (strippedInput === normalizedExpected) {
    return true;
  }

  return canAcceptMinorTypo(normalizedInput, normalizedExpected);
};

export const sortPairs = (pairs) =>
  [...pairs].sort(
    (a, b) =>
      new Date(b.updatedAt || b.createdAt || 0) -
      new Date(a.updatedAt || a.createdAt || 0)
  );

export const mergePairsBySignature = (...collections) => {
  const merged = new Map();

  collections.flat().forEach((pair) => {
    const folderId = pair.folderId ?? "root";
    const signature = `${folderId}::${createSignature(pair.left, pair.right)}`;
    const current = merged.get(signature);

    if (!current || pair.source === "cloud") {
      merged.set(signature, { ...pair, folderId });
    }
  });

  return sortPairs(Array.from(merged.values()));
};

export const createEmptyStudyStats = () => ({
  cards: {},
  sessions: [],
  hiddenCards: {},
  folderStyles: {},
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
    hiddenCards: createPersistableHiddenCards(syncedStats.hiddenCards, pairs),
    folderStyles: createPersistableFolderStyles(syncedStats.folderStyles),
  };
};

export const mergeStudyStats = (localStats, remoteStats, pairs = [], maxSessions = 60) => {
  const safeLocalStats = syncStudyStatsWithPairs(localStats, pairs);
  const safeRemoteStats = syncStudyStatsWithPairs(remoteStats, pairs);
  const mergedSessions = new Map();

  [...safeRemoteStats.sessions, ...safeLocalStats.sessions].forEach((session) => {
    const persistableSession = createPersistableStudySession(session);

    if (!persistableSession) {
      return;
    }

    const currentSession = mergedSessions.get(persistableSession.id);

    if (
      !currentSession ||
      new Date(persistableSession.completedAt) >= new Date(currentSession.completedAt)
    ) {
      mergedSessions.set(persistableSession.id, persistableSession);
    }
  });

  const mergedCards = {};
  const signatures = new Set([
    ...Object.keys(safeRemoteStats.cards),
    ...Object.keys(safeLocalStats.cards),
  ]);

  signatures.forEach((signature) => {
    mergedCards[signature] = mergeCloudCardStats(
      safeLocalStats.cards[signature],
      safeRemoteStats.cards[signature]
    );
  });

  return createPersistableStudyStats(
    {
      cards: mergedCards,
      sessions: [...mergedSessions.values()]
        .sort((left, right) => new Date(right.completedAt) - new Date(left.completedAt))
        .slice(0, maxSessions),
      hiddenCards: mergeHiddenCards(safeLocalStats.hiddenCards, safeRemoteStats.hiddenCards),
      folderStyles: mergeFolderStyles(safeLocalStats.folderStyles, safeRemoteStats.folderStyles),
    },
    pairs
  );
};

export const syncStudyStatsWithPairs = (studyStats, pairs = []) => {
  const safeStats = ensureStudyStats(studyStats);
  const nextCards = { ...safeStats.cards };
  const nextHiddenCards = { ...safeStats.hiddenCards };
  const legacySignatures = new Set();
  pairs.forEach((pair) => {
    const signature = createStudySignature(pair);
    const legacySignature = createSignature(pair.left, pair.right);
    // Preserve the formerly shared baseline for existing copies, then keep them separate.
    nextCards[signature] = ensureCardStats(nextCards[signature] ?? safeStats.cards[legacySignature], pair);
    if (!nextHiddenCards[signature] && safeStats.hiddenCards[legacySignature]) {
      nextHiddenCards[signature] = normalizeHiddenCardState(safeStats.hiddenCards[legacySignature]);
    }
    legacySignatures.add(legacySignature);
  });
  legacySignatures.forEach((signature) => {
    delete nextCards[signature];
    delete nextHiddenCards[signature];
  });
  return {
    ...safeStats,
    cards: nextCards,
    hiddenCards: createPersistableHiddenCards(nextHiddenCards, pairs),
  };
};

export const migrateStudyStatsEntry = (studyStats, previousPair, nextPair) => {
  const safeStats = ensureStudyStats(studyStats);
  const previousSignature = createStudySignature(previousPair);
  const nextSignature = createStudySignature(nextPair);
  const legacySignature = createSignature(previousPair.left, previousPair.right);
  const previousStats = safeStats.cards[previousSignature] ?? safeStats.cards[legacySignature];
  const nextCards = { ...safeStats.cards };
  const nextHiddenCards = { ...safeStats.hiddenCards };
  const previousHiddenState = nextHiddenCards[previousSignature] ?? nextHiddenCards[legacySignature];
  if (previousSignature === nextSignature) {
    nextCards[nextSignature] = { ...ensureCardStats(previousStats, nextPair), left: nextPair.left, right: nextPair.right };
  } else {
    const nextStats = ensureCardStats(nextCards[nextSignature], nextPair);
    nextCards[nextSignature] = previousStats ? mergeCardStats(previousStats, nextStats, nextPair) : nextStats;
    delete nextCards[previousSignature];
  }
  if (previousHiddenState) {
    nextHiddenCards[nextSignature] = mergeHiddenCardState(previousHiddenState, nextHiddenCards[nextSignature]);
    if (previousSignature !== nextSignature) delete nextHiddenCards[previousSignature];
  }
  return {
    ...safeStats,
    cards: nextCards,
    hiddenCards: nextHiddenCards,
    sessions: safeStats.sessions.map((session) => ({
      ...session,
      incorrectCards: (session.incorrectCards ?? []).map((card) => {
        const matchesPrevious = (card.pairId && card.pairId === previousPair.id) ||
          card.signature === previousSignature ||
          (card.signature === legacySignature && card.folderId === (previousPair.folderId ?? "root"));
        return matchesPrevious ? {
          ...card, pairId: nextPair.id, folderId: nextPair.folderId ?? "root",
          signature: nextSignature, left: nextPair.left, right: nextPair.right,
        } : card;
      }),
    })),
  };
};

export const isPairHidden = (studyStats, pair) =>
  Boolean(getPairHiddenState(ensureStudyStats(studyStats), pair)?.hidden);

export const setPairHidden = (studyStats, pair, hidden) => {
  const safeStats = ensureStudyStats(studyStats);
  if (!pair || !(pair.left ?? pair.prompt)?.trim() || !(pair.right ?? pair.answer)?.trim()) return safeStats;
  const signature = getStudySignature(pair);
  return {
    ...safeStats,
    hiddenCards: {
      ...safeStats.hiddenCards,
      [signature]: { hidden: Boolean(hidden), updatedAt: new Date().toISOString() },
    },
  };
};

export const getFolderStyle = (studyStats, folderId) => {
  const normalizedFolderId = typeof folderId === "string" && folderId ? folderId : "root";

  return ensureStudyStats(studyStats).folderStyles[normalizedFolderId] ?? null;
};

export const setFolderStyle = (studyStats, folderId, style = {}) => {
  const safeStats = ensureStudyStats(studyStats);
  const normalizedFolderId = typeof folderId === "string" && folderId ? folderId : "root";

  if (normalizedFolderId === "root") {
    return safeStats;
  }

  const previousStyle = safeStats.folderStyles[normalizedFolderId] ?? {};

  return {
    ...safeStats,
    folderStyles: {
      ...safeStats.folderStyles,
      [normalizedFolderId]: {
        icon: typeof style.icon === "string" && style.icon ? style.icon : previousStyle.icon ?? "folder",
        color: typeof style.color === "string" && style.color ? style.color : previousStyle.color ?? "purple",
        updatedAt: new Date().toISOString(),
      },
    },
  };
};

export const removeFolderStyles = (studyStats, folderIds = []) => {
  const safeStats = ensureStudyStats(studyStats);
  const idSet = new Set(folderIds.filter((id) => typeof id === "string" && id));

  if (!idSet.size) {
    return safeStats;
  }

  const nextFolderStyles = { ...safeStats.folderStyles };

  idSet.forEach((id) => {
    delete nextFolderStyles[id];
  });

  return {
    ...safeStats,
    folderStyles: nextFolderStyles,
  };
};

export const getPairStudySummary = (studyStats, pair) => {
  const safeStats = ensureStudyStats(studyStats);
  const cardStats = getPairCardStats(safeStats, pair);
  const attempts = cardStats.attempts ?? 0;
  const correct = cardStats.correct ?? 0;
  const incorrect = cardStats.incorrect ?? 0;
  const accuracy = attempts ? Math.round((correct / attempts) * 100) : null;

  return {
    attempts,
    correct,
    incorrect,
    accuracy,
    hidden: Boolean(getPairHiddenState(safeStats, pair)?.hidden),
  };
};

export const recordStudyAttempt = (studyStats, card, isCorrect) => {
  const safeStats = ensureStudyStats(studyStats);
  const signature = getStudySignature(card);
  const timestamp = new Date().toISOString();
  const currentCardStats = getPairCardStats(safeStats, card);
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
  const safeStats = ensureStudyStats(studyStats);
  const candidates = sortPairs(pairs).filter((pair) => !isPairHidden(safeStats, pair)).flatMap((pair) => {
    const base = {
      pairId: pair.id,
      left: pair.left,
      right: pair.right,
      signature: createStudySignature(pair),
      folderId: pair.folderId ?? "root",
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
  if (!Number.isFinite(limit)) {
    return spreadSameSignatureCards(shuffle(candidates));
  }

  const finalLimit = Math.max(1, Math.min(limit, candidates.length));

  if (!studyStats) {
    return spreadSameSignatureCards(shuffle(candidates).slice(0, finalLimit));
  }

  const selectedByWeakness = candidates
    .map((card) => ({
      ...card,
      weakness: getCardWeaknessScore(card, safeStats),
      tieBreaker: Math.random(),
    }))
    .sort((left, right) => {
      const weaknessGap = right.weakness - left.weakness;

      if (Math.abs(weaknessGap) > 0.0001) {
        return weaknessGap;
      }

      return left.tieBreaker - right.tieBreaker;
    })
    .slice(0, finalLimit)
    .map(({ weakness, tieBreaker, ...card }) => card);

  return spreadSameSignatureCards(shuffle(selectedByWeakness));
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
  folderId: record.folder_id ?? "root",
  source: "cloud",
  userId: record.user_id ?? null,
  createdAt: record.created_at,
  updatedAt: record.updated_at,
});

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

function canAcceptMinorTypo(input, expected) {
  const shortestLength = Math.min(input.length, expected.length);
  const longestLength = Math.max(input.length, expected.length);

  if (shortestLength < 4 || longestLength > shortestLength + 1) {
    return false;
  }

  return editDistanceAtMostOne(input, expected);
}

function editDistanceAtMostOne(left, right) {
  if (left === right) {
    return true;
  }

  if (Math.abs(left.length - right.length) > 1) {
    return false;
  }

  let leftIndex = 0;
  let rightIndex = 0;
  let edits = 0;

  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }

    edits += 1;

    if (edits > 1) {
      return false;
    }

    if (left.length > right.length) {
      leftIndex += 1;
    } else if (right.length > left.length) {
      rightIndex += 1;
    } else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }

  return edits + (left.length - leftIndex) + (right.length - rightIndex) <= 1;
}

function spreadSameSignatureCards(cards) {
  const arranged = [...cards];

  for (let index = 1; index < arranged.length; index += 1) {
    if (arranged[index].signature !== arranged[index - 1].signature) {
      continue;
    }

    const swapIndex = arranged.findIndex(
      (card, candidateIndex) =>
        candidateIndex > index &&
        card.signature !== arranged[index - 1].signature &&
        card.signature !== arranged[index + 1]?.signature
    );

    if (swapIndex > index) {
      const current = arranged[index];

      arranged[index] = arranged[swapIndex];
      arranged[swapIndex] = current;
    }
  }

  return arranged;
}

function ensureStudyStats(studyStats) {
  if (!studyStats || typeof studyStats !== "object") {
    return createEmptyStudyStats();
  }

  return {
    cards: studyStats.cards && typeof studyStats.cards === "object" ? studyStats.cards : {},
    sessions: Array.isArray(studyStats.sessions) ? studyStats.sessions : [],
    hiddenCards:
      studyStats.hiddenCards && typeof studyStats.hiddenCards === "object"
        ? studyStats.hiddenCards
        : {},
    folderStyles:
      studyStats.folderStyles && typeof studyStats.folderStyles === "object"
        ? studyStats.folderStyles
        : {},
  };
}

function getStudySignature(pair = {}) {
  return isStudySignature(pair.signature)
    ? pair.signature : createStudySignature(pair);
}
function getLegacySignature(pair = {}) {
  return createSignature(pair.left ?? "", pair.right ?? "");
}
function getPairCardStats(studyStats, pair = {}) {
  return ensureCardStats(studyStats.cards[getStudySignature(pair)] ?? studyStats.cards[getLegacySignature(pair)], pair);
}
function getPairHiddenState(studyStats, pair = {}) {
  return studyStats.hiddenCards[getStudySignature(pair)] ?? studyStats.hiddenCards[getLegacySignature(pair)];
}

function ensureCardStats(currentStats, pair = {}) {
  return {
    left: currentStats?.left ?? pair.left ?? "",
    right: currentStats?.right ?? pair.right ?? "",
    createdAt: currentStats?.createdAt ?? pair.createdAt ?? new Date().toISOString(),
    attempts: sanitizeCount(currentStats?.attempts),
    correct: sanitizeCount(currentStats?.correct),
    incorrect: sanitizeCount(currentStats?.incorrect),
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
    attempts: sanitizeCount(currentStats?.attempts),
    correct: sanitizeCount(currentStats?.correct),
    incorrect: sanitizeCount(currentStats?.incorrect),
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
        ...(typeof card?.pairId === "string" ? { pairId: card.pairId } : {}),
        ...(typeof card?.folderId === "string" ? { folderId: card.folderId } : {}),
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
    ...(typeof session.folderId === "string" ? { folderId: session.folderId } : {}),
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
    lastResult: pickMostActiveCardStats(previousStats, nextStats).lastResult,
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
    lastResult: pickMostActiveDirectionStats(safePrevious, safeNext).lastResult,
  };
}

function createPersistableFolderStyles(folderStyles) {
  if (!folderStyles || typeof folderStyles !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(folderStyles)
      .map(([folderId, style]) => {
        if (!folderId || folderId === "root" || !style || typeof style !== "object") {
          return null;
        }

        return [
          folderId,
          {
            icon: typeof style.icon === "string" && style.icon ? style.icon : "folder",
            color: typeof style.color === "string" && style.color ? style.color : "purple",
            updatedAt:
              typeof style.updatedAt === "string" && style.updatedAt
                ? style.updatedAt
                : new Date().toISOString(),
          },
        ];
      })
      .filter(Boolean)
  );
}

function createPersistableHiddenCards(hiddenCards = {}, pairs = []) {
  const pairSignatures = new Set(pairs.map(createStudySignature));
  const entries = Object.entries(hiddenCards)
    .map(([signature, state]) => {
      if (!state || typeof state !== "object") {
        return null;
      }

      if (pairSignatures.size && !pairSignatures.has(signature)) {
        return null;
      }

      return [
        signature,
        {
          hidden: Boolean(state.hidden),
          updatedAt: typeof state.updatedAt === "string" ? state.updatedAt : new Date().toISOString(),
        },
      ];
    })
    .filter(Boolean);

  return Object.fromEntries(entries);
}

function mergeCloudCardStats(localStats, remoteStats) {
  const safeLocal = ensureCardStats(localStats);
  const safeRemote = ensureCardStats(remoteStats);
  const selectedCard = pickMostActiveCardStats(safeLocal, safeRemote);
  const directions = {
    A_TO_B: pickMostActiveDirectionStats(
      safeLocal.directions.A_TO_B,
      safeRemote.directions.A_TO_B
    ),
    B_TO_A: pickMostActiveDirectionStats(
      safeLocal.directions.B_TO_A,
      safeRemote.directions.B_TO_A
    ),
  };
  const directionTotals = Object.values(directions).reduce(
    (totals, direction) => ({
      attempts: totals.attempts + (direction.attempts ?? 0),
      correct: totals.correct + (direction.correct ?? 0),
      incorrect: totals.incorrect + (direction.incorrect ?? 0),
    }),
    { attempts: 0, correct: 0, incorrect: 0 }
  );

  return {
    left: selectedCard.left || safeLocal.left || safeRemote.left,
    right: selectedCard.right || safeLocal.right || safeRemote.right,
    createdAt: earlierTimestamp(safeLocal.createdAt, safeRemote.createdAt) ?? selectedCard.createdAt,
    attempts: Math.max(directionTotals.attempts, selectedCard.attempts),
    correct: directionTotals.attempts >= selectedCard.attempts ? directionTotals.correct : selectedCard.correct,
    incorrect: directionTotals.attempts >= selectedCard.attempts ? directionTotals.incorrect : selectedCard.incorrect,
    lastStudiedAt: laterTimestamp(safeLocal.lastStudiedAt, safeRemote.lastStudiedAt),
    lastCorrectAt: laterTimestamp(safeLocal.lastCorrectAt, safeRemote.lastCorrectAt),
    lastIncorrectAt: laterTimestamp(safeLocal.lastIncorrectAt, safeRemote.lastIncorrectAt),
    lastResult: selectedCard.lastResult,
    directions,
  };
}

function mergeHiddenCards(localHiddenCards = {}, remoteHiddenCards = {}) {
  const merged = {};
  const signatures = new Set([
    ...Object.keys(localHiddenCards ?? {}),
    ...Object.keys(remoteHiddenCards ?? {}),
  ]);

  signatures.forEach((signature) => {
    merged[signature] = mergeHiddenCardState(localHiddenCards?.[signature], remoteHiddenCards?.[signature]);
  });

  return merged;
}

function mergeFolderStyles(localFolderStyles = {}, remoteFolderStyles = {}) {
  const merged = {};
  const folderIds = new Set([
    ...Object.keys(localFolderStyles ?? {}),
    ...Object.keys(remoteFolderStyles ?? {}),
  ]);

  folderIds.forEach((folderId) => {
    const localStyle = localFolderStyles?.[folderId];
    const remoteStyle = remoteFolderStyles?.[folderId];

    if (!localStyle) {
      merged[folderId] = createPersistableFolderStyles({ [folderId]: remoteStyle })[folderId];
      return;
    }

    if (!remoteStyle) {
      merged[folderId] = createPersistableFolderStyles({ [folderId]: localStyle })[folderId];
      return;
    }

    const localUpdatedAt = new Date(localStyle.updatedAt ?? 0).getTime();
    const remoteUpdatedAt = new Date(remoteStyle.updatedAt ?? 0).getTime();
    const selectedStyle = localUpdatedAt >= remoteUpdatedAt ? localStyle : remoteStyle;

    merged[folderId] = createPersistableFolderStyles({ [folderId]: selectedStyle })[folderId];
  });

  return Object.fromEntries(Object.entries(merged).filter(([, value]) => value));
}

function mergeHiddenCardState(localState, remoteState) {
  if (!localState) {
    return normalizeHiddenCardState(remoteState);
  }

  if (!remoteState) {
    return normalizeHiddenCardState(localState);
  }

  const localUpdatedAt = new Date(localState.updatedAt ?? 0).getTime();
  const remoteUpdatedAt = new Date(remoteState.updatedAt ?? 0).getTime();

  return normalizeHiddenCardState(localUpdatedAt >= remoteUpdatedAt ? localState : remoteState);
}

function normalizeHiddenCardState(state) {
  return {
    hidden: Boolean(state?.hidden),
    updatedAt: typeof state?.updatedAt === "string" ? state.updatedAt : new Date().toISOString(),
  };
}

function pickMostActiveCardStats(firstStats, secondStats) {
  const safeFirst = ensureCardStats(firstStats);
  const safeSecond = ensureCardStats(secondStats);

  return compareStatsActivity(safeFirst, safeSecond) >= 0 ? safeFirst : safeSecond;
}

function pickMostActiveDirectionStats(firstStats, secondStats) {
  const safeFirst = ensureDirectionStats(firstStats);
  const safeSecond = ensureDirectionStats(secondStats);

  return compareStatsActivity(safeFirst, safeSecond) >= 0 ? safeFirst : safeSecond;
}

function compareStatsActivity(firstStats, secondStats) {
  const firstStudiedAt = firstStats.lastStudiedAt ? new Date(firstStats.lastStudiedAt).getTime() : 0;
  const secondStudiedAt = secondStats.lastStudiedAt ? new Date(secondStats.lastStudiedAt).getTime() : 0;

  if (firstStudiedAt !== secondStudiedAt) {
    return firstStudiedAt - secondStudiedAt;
  }

  const firstAttempts = firstStats.attempts ?? 0;
  const secondAttempts = secondStats.attempts ?? 0;

  if (firstAttempts !== secondAttempts) {
    return firstAttempts - secondAttempts;
  }

  return (firstStats.incorrect ?? 0) + (firstStats.correct ?? 0) -
    ((secondStats.incorrect ?? 0) + (secondStats.correct ?? 0));
}

function earlierTimestamp(first, second) {
  if (!first) {
    return second ?? null;
  }

  if (!second) {
    return first;
  }

  return new Date(first) <= new Date(second) ? first : second;
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

function getCardWeaknessScore(card, studyStats) {
  const safeStats = ensureStudyStats(studyStats);
  const cardStats = getPairCardStats(safeStats, card);
  const directionStats = ensureDirectionStats(cardStats.directions[card.direction]);
  const attempts = directionStats.attempts;
  const errorRate = attempts ? directionStats.incorrect / attempts : 0;
  const studiedDaysAgo = directionStats.lastStudiedAt ? hoursBetween(directionStats.lastStudiedAt) / 24 : 14;
  const newCardScore = attempts === 0 ? 20 : 0;
  const recentMissScore = directionStats.lastResult === "incorrect" ? 18 : 0;
  const staleScore = Math.min(studiedDaysAgo, 14) * 0.5;

  return (
    errorRate * 100 +
    (directionStats.incorrect ?? 0) * 12 +
    recentMissScore +
    staleScore +
    newCardScore
  );
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
