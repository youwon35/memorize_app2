import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  BackHandler,
  Easing,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  NativeModules,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { makeRedirectUri } from "expo-auth-session";
import { File } from "expo-file-system";
import { EncodingType, readAsStringAsync } from "expo-file-system/legacy";
import * as WebBrowser from "expo-web-browser";

import { APP_FEATURES } from "./src/config/features";
import { recognizePhotoCardPairs } from "./src/lib/photo-ocr";
import { isSupabaseConfigured, supabase } from "./src/lib/supabase";
import {
  extractDocxTextFromBase64,
  getImportAssetExtension,
  isSupportedImportExtension,
  parseSpreadsheetPairsFromText,
  parseSpreadsheetPairsFromBase64,
} from "./src/utils/import-files";
import {
  appendStudySession,
  buildPracticeDeck,
  compareAnswers,
  createEmptyStudyStats,
  createLocalPair,
  createPersistableStudyStats,
  createSignature,
  migrateStudyStatsEntry,
  mapPairRecord,
  mergePairsBySignature,
  parseImportedPairs,
  recordStudyAttempt,
  shuffleItems,
  sortPairs,
  updatePairValues,
} from "./src/utils/memory";
import {
  createTranslator,
  formatDateTimeForLanguage,
  formatSessionLabelForLanguage,
  getPreferredLanguage,
  isSupportedLanguage,
  LANGUAGE_OPTIONS,
  normalizeSupportCategory,
  normalizeSupportStatus,
} from "./src/i18n";

WebBrowser.maybeCompleteAuthSession();

const APP_NAME = "MEMORIA";
const STORAGE_KEY = "@memoria/cards";
const FOLDERS_STORAGE_KEY = "@memoria/folders";
const ROOT_FOLDER_ID = "root";
const DAILY_STUDY_GOAL = 5;
const THEME_MODE_KEY = "@memoria/theme-mode";
const LANGUAGE_KEY = "@memoria/language";
const STUDY_STATS_KEY = "@memoria/study-stats";
const TUTORIAL_SEEN_KEY = "@memoria/tutorial-seen";
const SUPPORT_REQUESTS_KEY = "@memoria/support-requests";
const LEGACY_STORAGE_KEYS = ["@memora/study-pairs"];
const APP_SCHEME = process.env.EXPO_PUBLIC_APP_SCHEME || "memoria";
const RELEASE_REDIRECT_URI = `${APP_SCHEME}://auth/callback`;
const DEFAULT_QUIZ_COUNT = 10;
const DATE_FILTER_LOCALES = {
  ko: "ko-KR",
  en: "en-US",
  ja: "ja-JP",
};
const CALENDAR_WEEKDAY_LABELS = {
  ko: ["일", "월", "화", "수", "목", "금", "토"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  ja: ["日", "月", "火", "水", "木", "金", "土"],
};
const MAX_SESSION_HISTORY = 60;
const SUPPORT_CATEGORY_OPTIONS = ["bug", "feature", "other"];
const SUPPORT_STATUS_OPTIONS = ["received", "reviewing", "resolved"];
const ADMIN_SUPPORT_PREVIEW_LIMIT = 12;
const MANAGE_SORT_OPTIONS = [
  { key: "recent", labelKey: "manage.sortRecent" },
  { key: "alphabetical", labelKey: "manage.sortAlphabetical" },
  { key: "missed", labelKey: "manage.sortMissed" },
];
const THEME_OPTIONS = [
  { key: "light", labelKey: "theme.light", icon: "white-balance-sunny" },
  { key: "dark", labelKey: "theme.dark", icon: "weather-night" },
];

const createFolderId = () =>
  `folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeFolderId = (folderId) =>
  typeof folderId === "string" && folderId.trim() ? folderId : ROOT_FOLDER_ID;

const normalizePairFolder = (pair) => ({
  ...pair,
  folderId: normalizeFolderId(pair.folderId),
});

const createLocalFolder = (name, parentId = ROOT_FOLDER_ID) => {
  const now = new Date().toISOString();

  return {
    id: createFolderId(),
    name: name.trim(),
    parentId: normalizeFolderId(parentId),
    source: "local",
    createdAt: now,
    updatedAt: now,
  };
};

const mapFolderRecord = (record) => ({
  id: normalizeFolderId(record.id),
  name: String(record.name ?? "").trim(),
  parentId: normalizeFolderId(record.parent_id),
  source: "cloud",
  userId: record.user_id ?? null,
  createdAt: record.created_at,
  updatedAt: record.updated_at,
});

const mergeFoldersById = (...collections) => {
  const merged = new Map();

  collections.flat().forEach((folder) => {
    if (!folder?.id || folder.id === ROOT_FOLDER_ID) {
      return;
    }

    const normalizedFolder = {
      ...folder,
      id: normalizeFolderId(folder.id),
      parentId: normalizeFolderId(folder.parentId),
    };
    const current = merged.get(normalizedFolder.id);

    if (!current || normalizedFolder.source === "cloud") {
      merged.set(normalizedFolder.id, normalizedFolder);
    }
  });

  return normalizeFolders(Array.from(merged.values()));
};

const normalizeFolders = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenIds = new Set([ROOT_FOLDER_ID]);

  return value
    .filter((folder) => folder && typeof folder === "object")
    .map((folder) => ({
      id: normalizeFolderId(folder.id),
      name: String(folder.name ?? "").trim(),
      parentId: normalizeFolderId(folder.parentId),
      source: folder.source ?? "local",
      userId: folder.userId ?? null,
      createdAt: folder.createdAt ?? new Date().toISOString(),
      updatedAt: folder.updatedAt ?? folder.createdAt ?? new Date().toISOString(),
    }))
    .filter((folder) => {
      if (
        folder.id === ROOT_FOLDER_ID ||
        !folder.name ||
        seenIds.has(folder.id) ||
        folder.parentId === folder.id
      ) {
        return false;
      }

      seenIds.add(folder.id);
      return true;
    });
};

const getFolderChildren = (folders, parentId) =>
  folders
    .filter((folder) => normalizeFolderId(folder.parentId) === normalizeFolderId(parentId))
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));

const getFolderPath = (folders, folderId) => {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const path = [];
  let cursorId = normalizeFolderId(folderId);
  const visited = new Set();

  while (cursorId !== ROOT_FOLDER_ID && !visited.has(cursorId)) {
    visited.add(cursorId);
    const folder = byId.get(cursorId);

    if (!folder) {
      break;
    }

    path.unshift(folder);
    cursorId = normalizeFolderId(folder.parentId);
  }

  return path;
};

const getFolderSubtreeIds = (folders, folderId) => {
  const result = new Set([normalizeFolderId(folderId)]);
  const walk = (parentId) => {
    getFolderChildren(folders, parentId).forEach((folder) => {
      if (result.has(folder.id)) {
        return;
      }

      result.add(folder.id);
      walk(folder.id);
    });
  };

  walk(folderId);
  return result;
};

const createFolderScopedSignature = (left, right, folderId) =>
  `${normalizeFolderId(folderId)}::${createSignature(left, right)}`;

const createFolderViewKey = (scope, folderId) =>
  `${scope}:${normalizeFolderId(folderId)}`;

const isCloudFolderSchemaError = (error) => {
  const code = String(error?.code ?? "");
  const message = String(error?.message ?? "").toLowerCase();

  return (
    code === "42P01" ||
    code === "42703" ||
    message.includes("memory_folders") ||
    message.includes("folder_id")
  );
};

const getDeviceLocaleCandidates = () => {
  const candidates = [];
  const addCandidate = (value) => {
    if (Array.isArray(value)) {
      value.forEach(addCandidate);
      return;
    }

    if (typeof value === "string" && value.trim()) {
      candidates.push(value);
    }
  };

  try {
    addCandidate(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    // Native locale sources below will still provide a fallback.
  }

  const settings = NativeModules.SettingsManager?.settings;
  addCandidate(settings?.AppleLocale);
  addCandidate(settings?.AppleLanguages);

  const i18nConstants = NativeModules.I18nManager?.getConstants?.() ?? NativeModules.I18nManager;
  addCandidate(i18nConstants?.localeIdentifier);
  addCandidate(i18nConstants?.locale);

  const platformConstants = NativeModules.PlatformConstants?.getConstants?.() ?? NativeModules.PlatformConstants;
  addCandidate(platformConstants?.localeIdentifier);
  addCandidate(platformConstants?.locale);

  return candidates;
};

const getInitialLanguage = () => getPreferredLanguage(getDeviceLocaleCandidates());
const QUIZ_MODE_OPTIONS = [
  {
    key: "both",
    labelKey: "quiz.modes.both.label",
    chipLabelKey: "quiz.modes.both.chip",
    descriptionKey: "quiz.modes.both.description",
  },
  {
    key: "front",
    labelKey: "quiz.modes.front.label",
    chipLabelKey: "quiz.modes.front.chip",
    descriptionKey: "quiz.modes.front.description",
  },
  {
    key: "back",
    labelKey: "quiz.modes.back.label",
    chipLabelKey: "quiz.modes.back.chip",
    descriptionKey: "quiz.modes.back.description",
  },
];
const TABS = [
  { key: "save", labelKey: "tabs.save", icon: "cards-outline" },
  { key: "quiz", labelKey: "tabs.quiz", icon: "brain" },
  { key: "history", labelKey: "tabs.history", icon: "chart-timeline-variant" },
  { key: "manage", labelKey: "tabs.manage", icon: "playlist-edit" },
  { key: "about", labelKey: "tabs.about", icon: "information-outline" },
];
const TUTORIAL_STEPS = [
  {
    key: "save-tab",
    type: "tab",
    tab: "save",
    icon: "cards-outline",
    titleKey: "tutorial.saveTabTitle",
    bodyKey: "tutorial.saveTabBody",
  },
  {
    key: "save-single-chip",
    type: "target-press",
    tab: "save",
    targetKey: "save-mode-single",
    spotlightRadius: "pill",
    icon: "cards-outline",
    titleKey: "tutorial.saveSingleChipTitle",
    bodyKey: "tutorial.saveSingleChipBody",
    waitingKey: "tutorial.waitingSaveModeSingle",
    hideTargetHint: true,
  },
  {
    key: "save-single-practice",
    type: "practice",
    tab: "save",
    targetKey: "save-composer",
    spotlightRadius: 30,
    bubbleGap: 42,
    bubbleHeight: 170,
    hideWaitingPill: true,
    icon: "cards-outline",
    titleKey: "tutorial.savePracticeTitle",
    bodyKey: "tutorial.savePracticeBody",
  },
  {
    key: "save-single-success",
    type: "spotlight",
    tab: "save",
    waitForTab: "quiz",
    bubbleHeight: 330,
    hideBubbleTail: true,
    icon: "check-circle-outline",
    titleKey: "tutorial.saveSuccessTitle",
    bodyKey: "tutorial.saveSuccessBody",
  },
  {
    key: "quiz-tab",
    type: "tab",
    tab: "quiz",
    icon: "brain",
    titleKey: "tutorial.quizTabTitle",
    bodyKey: "tutorial.quizTabBody",
  },
  {
    key: "quiz-start-button",
    type: "target-press",
    tab: "quiz",
    targetKey: "quiz-start-button",
    spotlightRadius: 18,
    icon: "brain",
    titleKey: "tutorial.quizStartTitle",
    bodyKey: "tutorial.quizStartBody",
    waitingKey: "tutorial.waitingQuizStart",
    hideTargetHint: true,
  },
  {
    key: "quiz-answer-practice",
    type: "practice",
    tab: "quiz",
    targetKey: "quiz-card",
    spotlightRadius: 24,
    bubbleHeight: 330,
    icon: "brain",
    titleKey: "tutorial.quizAnswerTitle",
    bodyKey: "tutorial.quizAnswerBody",
    waitingKey: "tutorial.waitingAnswer",
  },
  {
    key: "history-tab",
    type: "tab",
    tab: "history",
    icon: "chart-timeline-variant",
    titleKey: "tutorial.historyTabTitle",
    bodyKey: "tutorial.historyTabBody",
  },
  {
    key: "history-recent",
    type: "spotlight",
    tab: "history",
    targetKey: "history-recent-panel",
    spotlightRadius: 26,
    bubbleHeight: 340,
    icon: "chart-timeline-variant",
    titleKey: "tutorial.historyRecentTitle",
    bodyKey: "tutorial.historyRecentBody",
    waitForTab: "manage",
  },
  {
    key: "manage-tab",
    type: "tab",
    tab: "manage",
    icon: "playlist-edit",
    titleKey: "tutorial.manageTabTitle",
    bodyKey: "tutorial.manageTabBody",
  },
  {
    key: "manage-use",
    type: "spotlight",
    tab: "manage",
    targetKey: "manage-first-card",
    spotlightRadius: 18,
    bubbleHeight: 360,
    icon: "playlist-edit",
    titleKey: "tutorial.manageUseTitle",
    bodyKey: "tutorial.manageUseBody",
    waitForTab: "about",
  },
  {
    key: "about-tab",
    type: "tab",
    tab: "about",
    icon: "information-outline",
    titleKey: "tutorial.aboutTabTitle",
    bodyKey: "tutorial.aboutTabBody",
  },
  {
    key: "about-support",
    type: "spotlight",
    tab: "about",
    targetKey: "about-support-panel",
    spotlightRadius: 24,
    spotlightPadding: 4,
    bubbleGap: 84,
    bubbleHeight: 300,
    icon: "message-question-outline",
    titleKey: "tutorial.aboutSupportTitle",
    bodyKey: "tutorial.aboutSupportBody",
    actionKey: "tutorial.finish",
  },
];
const TUTORIAL_STEP_MAP = Object.fromEntries(TUTORIAL_STEPS.map((step) => [step.key, step]));
const SAVE_INPUT_OPTIONS = [
  { key: "single", labelKey: "saveModes.single", icon: "cards-outline" },
  { key: "text", labelKey: "saveModes.text", icon: "file-document-plus-outline" },
  { key: "photo", labelKey: "saveModes.photo", icon: "camera-outline" },
].filter((option) => APP_FEATURES.photoImport || option.key !== "photo");
const STAR_FIELD = [
  { top: 34, left: 28, size: 4, opacity: 0.45 },
  { top: 112, right: 44, size: 6, opacity: 0.32 },
  { top: 240, left: 54, size: 3, opacity: 0.26 },
  { top: 328, right: 84, size: 5, opacity: 0.18 },
  { top: 520, left: 24, size: 3, opacity: 0.24 },
  { top: 640, right: 26, size: 4, opacity: 0.2 },
];
const DARK_THEME = {
  mode: "dark",
  appBg: "#070B16",
  statusBarStyle: "light-content",
  statusBarBg: "#070B16",
  backgroundOrbPrimary: "rgba(184, 174, 255, 0.12)",
  backgroundOrbSecondary: "rgba(245, 193, 217, 0.08)",
  star: "#F6F2FF",
  surface: "#11182B",
  surfaceStrong: "rgba(14, 20, 36, 0.94)",
  surfaceSoft: "#0D1426",
  surfaceCard: "#0B1020",
  surfaceMuted: "#1A2440",
  surfaceGhost: "#141D35",
  surfaceBorder: "rgba(184, 174, 255, 0.12)",
  surfaceBorderSoft: "rgba(184, 174, 255, 0.08)",
  textPrimary: "#F5F7FF",
  textSecondary: "#8E9ABC",
  textMuted: "#93A0C3",
  textStrong: "#D6DBEA",
  textSoft: "#BFC8E2",
  textPlaceholder: "#667392",
  accent: "#B8AEFF",
  accentSoft: "rgba(184, 174, 255, 0.12)",
  accentSoftStrong: "rgba(184, 174, 255, 0.16)",
  accentText: "#0B1020",
  success: "#86E2A2",
  danger: "#FFBFCC",
  dangerBg: "#3C1B28",
  dangerBgSoft: "rgba(255, 168, 198, 0.15)",
  mutedBg: "#303B5D",
  tabBarBg: "rgba(11, 16, 32, 0.98)",
  tabText: "#C0C8DE",
  iconContrast: "#0B1020",
  launchBg: "#050814",
};
const LIGHT_THEME = {
  mode: "light",
  appBg: "#F5F7FB",
  statusBarStyle: "dark-content",
  statusBarBg: "#F5F7FB",
  backgroundOrbPrimary: "rgba(184, 174, 255, 0.18)",
  backgroundOrbSecondary: "rgba(255, 215, 228, 0.16)",
  star: "#A7B2CE",
  surface: "#FFFFFF",
  surfaceStrong: "rgba(255, 255, 255, 0.95)",
  surfaceSoft: "#F6F7FD",
  surfaceCard: "#EEF2FA",
  surfaceMuted: "#E8EDFB",
  surfaceGhost: "#EEF2FA",
  surfaceBorder: "rgba(104, 118, 164, 0.18)",
  surfaceBorderSoft: "rgba(104, 118, 164, 0.12)",
  textPrimary: "#182033",
  textSecondary: "#5F6C8E",
  textMuted: "#6B789A",
  textStrong: "#32405F",
  textSoft: "#4E5D82",
  textPlaceholder: "#8A97B3",
  accent: "#8E7BFF",
  accentSoft: "rgba(142, 123, 255, 0.14)",
  accentSoftStrong: "rgba(142, 123, 255, 0.18)",
  accentText: "#FFFFFF",
  success: "#1D8F54",
  danger: "#C94D6B",
  dangerBg: "#FBE9EE",
  dangerBgSoft: "rgba(201, 77, 107, 0.16)",
  mutedBg: "#D7DDF0",
  tabBarBg: "rgba(255, 255, 255, 0.98)",
  tabText: "#7280A1",
  iconContrast: "#FFFFFF",
  launchBg: "#F5F7FB",
};

const getQuizModeConfig = (mode) =>
  QUIZ_MODE_OPTIONS.find((option) => option.key === mode) ?? QUIZ_MODE_OPTIONS[0];
const getNextTutorialStep = (currentKey) => {
  const currentIndex = TUTORIAL_STEPS.findIndex((step) => step.key === currentKey);

  if (currentIndex < 0) {
    return TUTORIAL_STEPS[0];
  }

  return TUTORIAL_STEPS[currentIndex + 1] ?? null;
};

const getNextTutorialStepAfterInteraction = (currentKey, { completedTab } = {}) => {
  let nextStep = getNextTutorialStep(currentKey);

  if (completedTab && nextStep?.type === "tab" && nextStep.tab === completedTab) {
    nextStep = getNextTutorialStep(nextStep.key);
  }

  return nextStep;
};
const appendUniqueId = (items, nextId) => (items.includes(nextId) ? items : [...items, nextId]);
const isValidEmail = (value) => /\S+@\S+\.\S+/.test(value.trim());
const calculateMissRate = (cardStats = {}) => {
  const attempts = Math.max(1, cardStats?.attempts ?? 0);

  return (cardStats?.incorrect ?? 0) / attempts;
};
const normalizeUserRole = (value) => (value === "admin" ? "admin" : "user");
const mapAdminDashboardMetrics = (record = {}) => ({
  totalUsers: Number(record.total_users ?? 0),
  activeUsers30d: Number(record.active_users_30d ?? 0),
  monthlyAppOpens30d: Number(record.monthly_app_opens_30d ?? 0),
  avgCardsPerUser: Number(record.avg_cards_per_user ?? 0),
  avgOpensPerActiveUser: Number(record.avg_opens_per_active_user ?? 0),
  returnRate7d: Number(record.return_rate_7d ?? 0),
  inquiriesLast24h: Number(record.inquiries_last_24h ?? 0),
  receivedInquiries: Number(record.received_inquiries ?? 0),
  reviewingInquiries: Number(record.reviewing_inquiries ?? 0),
  resolvedInquiries: Number(record.resolved_inquiries ?? 0),
  unresolvedInquiries: Number(record.unresolved_inquiries ?? 0),
});
const formatMetricValue = (value) => {
  const numericValue = Number(value ?? 0);

  if (!Number.isFinite(numericValue)) {
    return "0";
  }

  return Math.abs(numericValue - Math.round(numericValue)) < 0.05
    ? `${Math.round(numericValue)}`
    : numericValue.toFixed(1);
};
const formatMetricPercent = (value) => `${formatMetricValue(value)}%`;
const createLocalSupportRequest = ({ replyEmail, message, category, session }) => ({
  id: `support-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  category: normalizeSupportCategory(category),
  replyEmail: replyEmail.trim(),
  message: message.trim(),
  userEmail: session?.user?.email ?? null,
  userId: session?.user?.id ?? null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  status: "received",
  source: "local",
});
const mapSupportInquiryRecord = (record) => ({
  id: record.id,
  category: normalizeSupportCategory(record.category),
  replyEmail: record.reply_email ?? "",
  message: record.message ?? "",
  userEmail: record.sender_email ?? null,
  userId: record.user_id ?? null,
  createdAt: record.created_at ?? new Date().toISOString(),
  updatedAt: record.updated_at ?? record.created_at ?? new Date().toISOString(),
  status: normalizeSupportStatus(record.status),
  source: "cloud",
});
const normalizeSupportRequest = (request) => ({
  ...request,
  category: normalizeSupportCategory(request?.category),
  status: normalizeSupportStatus(request?.status),
});
const mergeSupportRequests = (...collections) => {
  const mergedMap = new Map();

  collections.flat().forEach((item) => {
    if (!item?.id) {
      return;
    }

    mergedMap.set(item.id, normalizeSupportRequest(item));
  });

  return [...mergedMap.values()].sort(
    (left, right) => new Date(right.createdAt ?? 0) - new Date(left.createdAt ?? 0)
  );
};

export default function App() {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [tab, setTab] = useState("save");
  const [language, setLanguage] = useState(getInitialLanguage());
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [themeMode, setThemeMode] = useState("light");
  const [saveInputMode, setSaveInputMode] = useState("single");
  const [saveActionMenuOpen, setSaveActionMenuOpen] = useState(false);
  const [saveComposerVisible, setSaveComposerVisible] = useState(false);
  const [manageSort, setManageSort] = useState("recent");
  const [manageSortMenuOpen, setManageSortMenuOpen] = useState(false);
  const [manageSearch, setManageSearch] = useState("");
  const [historyDateKey, setHistoryDateKey] = useState(() => getLocalDayKey(new Date()));
  const [historyCalendarOpen, setHistoryCalendarOpen] = useState(false);
  const [historyCalendarMonth, setHistoryCalendarMonth] = useState(() => getStartOfLocalMonth(new Date()));
  const [pairs, setPairs] = useState([]);
  const [folders, setFolders] = useState([]);
  const [saveFolderId, setSaveFolderId] = useState(ROOT_FOLDER_ID);
  const [quizFolderId, setQuizFolderId] = useState(ROOT_FOLDER_ID);
  const [manageFolderId, setManageFolderId] = useState(ROOT_FOLDER_ID);
  const [folderNameDraft, setFolderNameDraft] = useState("");
  const [renamingFolderId, setRenamingFolderId] = useState(null);
  const [folderRenameDraft, setFolderRenameDraft] = useState("");
  const [selectedManagePairIds, setSelectedManagePairIds] = useState([]);
  const [folderActionMenuKey, setFolderActionMenuKey] = useState(null);
  const [creatingFolderKey, setCreatingFolderKey] = useState(null);
  const [studyStats, setStudyStats] = useState(createEmptyStudyStats());
  const [draft, setDraft] = useState({ left: "", right: "" });
  const [storageReady, setStorageReady] = useState(false);
  const [tutorialSeen, setTutorialSeen] = useState(true);
  const [tutorialReady, setTutorialReady] = useState(false);
  const [tutorialVisible, setTutorialVisible] = useState(false);
  const [tutorialStep, setTutorialStep] = useState("intro");
  const [tutorialTargetRect, setTutorialTargetRect] = useState(null);
  const [tutorialQuizResult, setTutorialQuizResult] = useState(null);
  const [session, setSession] = useState(null);
  const [userRole, setUserRole] = useState("user");
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [authBusy, setAuthBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [noteState, setNoteState] = useState({
    key: isSupabaseConfigured ? "notes.googleSyncAvailable" : "notes.localMode",
    params: {},
  });
  const [editingId, setEditingId] = useState(null);
  const [editingLeft, setEditingLeft] = useState("");
  const [editingRight, setEditingRight] = useState("");
  const [editingFolderId, setEditingFolderId] = useState(ROOT_FOLDER_ID);
  const [deck, setDeck] = useState([]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizCountInput, setQuizCountInput] = useState(`${DEFAULT_QUIZ_COUNT}`);
  const [quizMode, setQuizMode] = useState("both");
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState("");
  const [result, setResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const [photoImporting, setPhotoImporting] = useState(false);
  const [photoAsset, setPhotoAsset] = useState(null);
  const [photoImportedPairs, setPhotoImportedPairs] = useState([]);
  const [photoInvalidRowIndexes, setPhotoInvalidRowIndexes] = useState([]);
  const [photoImportNotice, setPhotoImportNotice] = useState("");
  const [roundComplete, setRoundComplete] = useState(false);
  const [roundIncorrectIds, setRoundIncorrectIds] = useState([]);
  const [supportCategory, setSupportCategory] = useState(SUPPORT_CATEGORY_OPTIONS[0]);
  const [supportReplyEmail, setSupportReplyEmail] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  const [supportRequests, setSupportRequests] = useState([]);
  const [supportSending, setSupportSending] = useState(false);
  const [supportNotice, setSupportNotice] = useState("");
  const [adminSupportRequests, setAdminSupportRequests] = useState([]);
  const [adminMetrics, setAdminMetrics] = useState(null);
  const [adminOnlyUnresolved, setAdminOnlyUnresolved] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminUpdatingId, setAdminUpdatingId] = useState(null);
  const [adminNotice, setAdminNotice] = useState("");
  const [launchVisible, setLaunchVisible] = useState(true);
  const [openManageSwipeId, setOpenManageSwipeId] = useState(null);

  const timerRef = useRef(null);
  const appRootRef = useRef(null);
  const scrollRef = useRef(null);
  const tutorialStepRef = useRef(tutorialStep);
  const tutorialTargetRefs = useRef({});
  const tutorialSavedPairIdRef = useRef(null);
  const pairsRef = useRef(pairs);
  const foldersRef = useRef(folders);
  const cloudFoldersReadyRef = useRef(false);
  const studyStatsRef = useRef(studyStats);
  const manageSwipeRefs = useRef({});
  const appOpenTrackedUserRef = useRef(null);
  const roundMetaRef = useRef(null);
  const roundSnapshotRef = useRef(null);
  const bootStartedAt = useRef(Date.now());
  const launchOpacity = useRef(new Animated.Value(1)).current;
  const launchScale = useRef(new Animated.Value(0.94)).current;
  const moonGlow = useRef(new Animated.Value(0.56)).current;

  const t = useMemo(() => createTranslator(language), [language]);
  const theme = themeMode === "light" ? LIGHT_THEME : DARK_THEME;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const current = deck[quizIndex] ?? null;
  const redirectUri = makeRedirectUri({ scheme: APP_SCHEME, path: "auth/callback" });
  const note = noteState.raw ? noteState.raw : t(noteState.key, noteState.params);
  const authTitle = session?.user?.email
    ? session.user.email
    : isSupabaseConfigured
      ? t("about.authRemoteTitle")
      : t("about.authLocalTitle");
  const authCaption = syncing ? t("notes.syncing") : note;
  const isAdmin = userRole === "admin";
  const hasActiveQuizRound = tab === "quiz" && deck.length > 0 && !roundComplete;
  const quizFolderSubtreeIds = useMemo(() => getFolderSubtreeIds(folders, quizFolderId), [folders, quizFolderId]);
  const manageFolderSubtreeIds = useMemo(() => getFolderSubtreeIds(folders, manageFolderId), [folders, manageFolderId]);
  const selectableFolders = useMemo(
    () => [{ id: ROOT_FOLDER_ID, name: t("folders.root"), parentId: ROOT_FOLDER_ID }, ...folders],
    [folders, t]
  );
  const quizFolderPairs = useMemo(
    () => pairs.filter((pair) => quizFolderSubtreeIds.has(normalizeFolderId(pair.folderId))),
    [pairs, quizFolderSubtreeIds]
  );
  const manageFolderPairs = useMemo(
    () => pairs.filter((pair) => manageFolderSubtreeIds.has(normalizeFolderId(pair.folderId))),
    [pairs, manageFolderSubtreeIds]
  );
  const selectedManagePairSet = useMemo(
    () => new Set(selectedManagePairIds),
    [selectedManagePairIds]
  );
  const hasSavedCards = quizFolderPairs.length > 0;
  const quizModeConfig = getQuizModeConfig(quizMode);
  const maxQuizCount = quizFolderPairs.length ? quizFolderPairs.length * (quizMode === "both" ? 2 : 1) : 0;
  const contentTopPadding = 18 + (Platform.OS === "android" ? (StatusBar.currentHeight ?? 0) : 0);
  const isTabletLayout = screenWidth >= 768;
  const contentMaxWidth = isTabletLayout ? 820 : null;
  const contentResolvedWidth = contentMaxWidth ?? Math.max(280, screenWidth - 36);
  const manageSwipeCardWidth = contentResolvedWidth - 36;
  const tutorialMaxWidth = isTabletLayout ? 560 : null;
  const tabBarWidth = isTabletLayout ? Math.min(screenWidth - 28, 820) : null;
  const tabBarLeft = tabBarWidth ? Math.max(14, (screenWidth - tabBarWidth) / 2) : null;
  const parsedQuizCount = Number.parseInt(quizCountInput, 10);
  const resolvedQuizCount = !maxQuizCount
    ? 0
    : Number.isFinite(parsedQuizCount) && parsedQuizCount > 0
      ? Math.min(parsedQuizCount, maxQuizCount)
      : Math.min(DEFAULT_QUIZ_COUNT, maxQuizCount);
  const guidedTutorialActive = tutorialVisible && tutorialStep !== "intro";
  const currentTutorialStep = guidedTutorialActive ? TUTORIAL_STEP_MAP[tutorialStep] : null;
  const displayedTutorialStep = useMemo(() => {
    if (!currentTutorialStep || currentTutorialStep.key !== "history-tab") {
      return currentTutorialStep;
    }

    return {
      ...currentTutorialStep,
      titleKey:
        tutorialQuizResult === "incorrect"
          ? "tutorial.historyTabTitleIncorrect"
          : "tutorial.historyTabTitleCorrect",
      bodyKey: "tutorial.historyTabBodyAfterQuiz",
    };
  }, [currentTutorialStep, tutorialQuizResult]);
  tutorialStepRef.current = tutorialStep;

  const registerTutorialTarget = (key) => (node) => {
    if (node) {
      tutorialTargetRefs.current[key] = node;
      return;
    }

    delete tutorialTargetRefs.current[key];
  };

  const measureTutorialTarget = (key) => {
    const activeTargetKey = TUTORIAL_STEP_MAP[tutorialStepRef.current]?.targetKey;

    if (activeTargetKey !== key) {
      return;
    }

    const target = tutorialTargetRefs.current[key];

    if (!target) {
      setTutorialTargetRect(null);
      return;
    }

    const applyMeasuredRect = (x, y, width, height) => {
      if (TUTORIAL_STEP_MAP[tutorialStepRef.current]?.targetKey !== key) {
        return;
      }

      if (!width || !height) {
        setTutorialTargetRect(null);
        return;
      }

      setTutorialTargetRect({
        x: Math.max(0, x),
        y: Math.max(0, y),
        width,
        height,
      });
    };

    const measureTargetInWindow = () => {
      if (!target.measureInWindow) {
        setTutorialTargetRect(null);
        return;
      }

      target.measureInWindow((x, y, width, height) => {
        if (!appRootRef.current?.measureInWindow) {
          applyMeasuredRect(x, y, width, height);
          return;
        }

        appRootRef.current.measureInWindow((rootX, rootY) => {
          applyMeasuredRect(x - rootX, y - rootY, width, height);
        });
      });
    };

    try {
      measureTargetInWindow();
    } catch {
      requestAnimationFrame(() => {
        if (TUTORIAL_STEP_MAP[tutorialStepRef.current]?.targetKey === key) {
          measureTargetInWindow();
        }
      });
    }
  };

  const queueTutorialTargetMeasure = (key) => {
    if (!key) {
      return;
    }

    requestAnimationFrame(() => measureTutorialTarget(key));
    setTimeout(() => measureTutorialTarget(key), 140);
    setTimeout(() => measureTutorialTarget(key), 360);
    setTimeout(() => measureTutorialTarget(key), 720);
  };

  const tutorialTargetProps = (key) => ({
    ref: registerTutorialTarget(key),
    collapsable: false,
    onLayout: () => {
      if (currentTutorialStep?.targetKey === key) {
        queueTutorialTargetMeasure(key);
      }
    },
  });

  const selectTab = (nextTab) => {
    setTab(nextTab);
    setSaveActionMenuOpen(false);
    setManageSortMenuOpen(false);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo?.({ y: 0, animated: false });
    });
  };

  const applyTutorialStepSideEffects = (step) => {
    if (step?.key === "save-single-chip") {
      setSaveInputMode("single");
      setSaveComposerVisible(false);
      setSaveActionMenuOpen(true);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo?.({ y: 0, animated: true });
      });
    }

    if (step?.key === "save-single-practice") {
      setSaveInputMode("single");
      setSaveActionMenuOpen(false);
      setSaveComposerVisible(true);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo?.({ y: 0, animated: true });
      });
    }

    if (step?.key === "save-single-success") {
      setSaveActionMenuOpen(false);
      setSaveComposerVisible(false);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo?.({ y: 0, animated: true });
      });
    }

    if (step?.key === "quiz-start-button") {
      setQuizMode("front");
      setQuizCountInput("1");
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo?.({ y: 0, animated: true });
      });
    }

    if (step?.key === "quiz-answer-practice") {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo?.({ y: 0, animated: true });
      });
    }

    if (step?.key === "history-recent") {
      setHistoryCalendarOpen(false);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo?.({ y: 0, animated: true });
      });
    }

    if (step?.key === "about-support") {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo?.({ y: 420, animated: true });
      });
    }

    if (step?.key === "manage-use") {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo?.({ y: 0, animated: true });
      });
    }

    queueTutorialTargetMeasure(step?.targetKey);
  };

  useEffect(() => {
    if (!guidedTutorialActive || !currentTutorialStep?.targetKey) {
      setTutorialTargetRect(null);
      return undefined;
    }

    let cancelled = false;
    const measure = () => {
      if (!cancelled) {
        measureTutorialTarget(currentTutorialStep.targetKey);
      }
    };
    const frameId = requestAnimationFrame(measure);
    const timeoutIds = [120, 320, 640].map((delay) => setTimeout(measure, delay));

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      timeoutIds.forEach(clearTimeout);
    };
  }, [
    currentTutorialStep?.targetKey,
    folders.length,
    guidedTutorialActive,
    language,
    manageSortMenuOpen,
    pairs.length,
    saveActionMenuOpen,
    saveComposerVisible,
    saveInputMode,
    screenHeight,
    screenWidth,
    tab,
    tutorialStep,
  ]);

  const handleTabChange = (nextTab) => {
    const completeTabChange = () => {
      selectTab(nextTab);

      const tutorialTabTarget =
        currentTutorialStep?.type === "tab" && currentTutorialStep.tab === nextTab;
      const tutorialWaitsForTab = currentTutorialStep?.waitForTab === nextTab;

      if (guidedTutorialActive && (tutorialTabTarget || tutorialWaitsForTab)) {
        const nextStep = tutorialWaitsForTab
          ? getNextTutorialStepAfterInteraction(tutorialStep, { completedTab: nextTab })
          : getNextTutorialStep(tutorialStep);

        if (nextStep) {
          setTutorialStep(nextStep.key);
          applyTutorialStepSideEffects(nextStep);
        }
      }
    };

    if (nextTab !== tab && hasActiveQuizRound) {
      confirmStopActiveQuiz(completeTabChange);
      return;
    }

    completeTabChange();
  };
  const setTranslatedNote = (key, params = {}) => {
    setNoteState({ key, params });
  };
  const roundIncorrectCards = useMemo(() => {
    if (!deck.length || !roundIncorrectIds.length) {
      return [];
    }

    const incorrectIdSet = new Set(roundIncorrectIds);

    return deck.filter((card) => incorrectIdSet.has(card.id));
  }, [deck, roundIncorrectIds]);
  const roundCorrectCount = deck.length - roundIncorrectCards.length;
  const latestSupportRequests = useMemo(() => supportRequests.slice(0, 3), [supportRequests]);
  const latestAdminSupportRequests = useMemo(
    () => adminSupportRequests.slice(0, ADMIN_SUPPORT_PREVIEW_LIMIT),
    [adminSupportRequests]
  );
  const adminSupportCounts = useMemo(
    () => ({
      received: adminMetrics?.receivedInquiries ?? 0,
      reviewing: adminMetrics?.reviewingInquiries ?? 0,
      resolved: adminMetrics?.resolvedInquiries ?? 0,
      unresolved: adminMetrics?.unresolvedInquiries ?? 0,
    }),
    [adminMetrics]
  );
  const adminMetricCards = useMemo(
    () => [
      {
        key: "users",
        label: t("about.adminUsers"),
        value: formatMetricValue(adminMetrics?.totalUsers ?? 0),
      },
      {
        key: "active",
        label: t("about.adminActiveUsers"),
        value: formatMetricValue(adminMetrics?.activeUsers30d ?? 0),
      },
      {
        key: "opens",
        label: t("about.adminMonthlyOpens"),
        value: formatMetricValue(adminMetrics?.monthlyAppOpens30d ?? 0),
      },
      {
        key: "cards",
        label: t("about.adminAvgCards"),
        value: formatMetricValue(adminMetrics?.avgCardsPerUser ?? 0),
      },
      {
        key: "opensPerUser",
        label: t("about.adminAvgOpens"),
        value: formatMetricValue(adminMetrics?.avgOpensPerActiveUser ?? 0),
      },
      {
        key: "returnRate7d",
        label: t("about.adminReturnRate7d"),
        value: formatMetricPercent(adminMetrics?.returnRate7d ?? 0),
      },
      {
        key: "inquiries24h",
        label: t("about.adminInquiries24h"),
        value: formatMetricValue(adminMetrics?.inquiriesLast24h ?? 0),
      },
    ],
    [adminMetrics, t]
  );
  const importPreviewLines = useMemo(
    () => [
      { no: "1", text: t("save.textImportExampleFrontOne"), tone: "front" },
      { no: "2", text: t("save.textImportExampleBackOne"), tone: "back" },
      { no: "3", text: "", tone: "blank" },
      { no: "4", text: t("save.textImportExampleFrontTwo"), tone: "front" },
      { no: "5", text: t("save.textImportExampleBackTwo"), tone: "back" },
    ],
    [t]
  );
  const photoPreviewPairs = useMemo(() => photoImportedPairs.slice(0, 6), [photoImportedPairs]);
  const todayKey = getLocalDayKey(new Date());
  const todaySessions = useMemo(
    () => studyStats.sessions.filter((item) => getLocalDayKey(item.completedAt) === todayKey),
    [studyStats.sessions, todayKey]
  );
  const todaySessionCount = todaySessions.length;
  const todaySolvedCount = todaySessions.reduce((sum, item) => sum + (item.totalCards ?? 0), 0);
  const todayIncorrectCount = todaySessions.reduce((sum, item) => sum + (item.incorrectCount ?? 0), 0);
  const historySessionCountsByDate = useMemo(() => {
    const counts = new Map([[todayKey, 0]]);

    studyStats.sessions.forEach((item) => {
      const dayKey = getLocalDayKey(item.completedAt);

      counts.set(dayKey, (counts.get(dayKey) ?? 0) + 1);
    });

    return counts;
  }, [studyStats.sessions, todayKey]);
  const selectedHistorySessions = useMemo(
    () =>
      studyStats.sessions
        .filter((item) => getLocalDayKey(item.completedAt) === historyDateKey)
        .slice(0, 6),
    [historyDateKey, studyStats.sessions]
  );
  const selectedHistorySessionCount = historySessionCountsByDate.get(historyDateKey) ?? 0;
  const historyCalendarCells = useMemo(
    () => createCalendarCells(historyCalendarMonth, historySessionCountsByDate),
    [historyCalendarMonth, historySessionCountsByDate]
  );
  const normalizedManageSearch = manageSearch.trim().toLocaleLowerCase(language);
  const activeManageSortOption =
    MANAGE_SORT_OPTIONS.find((option) => option.key === manageSort) ?? MANAGE_SORT_OPTIONS[0];
  const sortedManagePairs = useMemo(() => {
    if (manageSort === "alphabetical") {
      return [...manageFolderPairs].sort((leftPair, rightPair) => {
        const leftText = `${leftPair.left} ${leftPair.right}`.trim();
        const rightText = `${rightPair.left} ${rightPair.right}`.trim();

        return leftText.localeCompare(rightText, language, { sensitivity: "base" });
      });
    }

    if (manageSort === "missed") {
      return [...manageFolderPairs].sort((leftPair, rightPair) => {
        const leftStats = studyStats.cards[createSignature(leftPair.left, leftPair.right)] ?? {};
        const rightStats = studyStats.cards[createSignature(rightPair.left, rightPair.right)] ?? {};
        const missRateGap = calculateMissRate(rightStats) - calculateMissRate(leftStats);

        if (Math.abs(missRateGap) > 0.0001) {
          return missRateGap;
        }

        const incorrectGap = (rightStats.incorrect ?? 0) - (leftStats.incorrect ?? 0);

        if (incorrectGap !== 0) {
          return incorrectGap;
        }

        const attemptsGap = (rightStats.attempts ?? 0) - (leftStats.attempts ?? 0);

        if (attemptsGap !== 0) {
          return attemptsGap;
        }

        return new Date(rightPair.updatedAt || rightPair.createdAt || 0) - new Date(leftPair.updatedAt || leftPair.createdAt || 0);
      });
    }

    return sortPairs(manageFolderPairs);
  }, [language, manageFolderPairs, manageSort, studyStats.cards]);
  const visibleManagePairs = useMemo(() => {
    if (!normalizedManageSearch) {
      return sortedManagePairs;
    }

    return sortedManagePairs.filter((pair) =>
      [pair.left, pair.right].some((value) =>
        value.toLocaleLowerCase(language).includes(normalizedManageSearch)
      )
    );
  }, [language, normalizedManageSearch, sortedManagePairs]);
  const todayMissedCards = useMemo(() => {
    const counter = new Map();

    todaySessions.forEach((item) => {
      (item.incorrectCards ?? []).forEach((card, index) => {
        const signature =
          (typeof card?.signature === "string" && card.signature) ||
          createSignature(card?.left ?? "", card?.right ?? "") ||
          `missed-${item.id}-${index}`;
        const currentCount = counter.get(signature) ?? {
          ...card,
          signature,
          count: 0,
        };

        currentCount.count += 1;
        counter.set(signature, currentCount);
      });
    });

    return Array.from(counter.values()).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [todaySessions]);
  const topMissedCards = useMemo(
    () =>
      Object.entries(studyStats.cards)
        .map(([signature, item]) => ({
          ...item,
          signature,
        }))
        .filter((item) => (item.incorrect ?? 0) > 0)
        .sort((a, b) => {
          if ((b.incorrect ?? 0) !== (a.incorrect ?? 0)) {
            return (b.incorrect ?? 0) - (a.incorrect ?? 0);
          }

          return (b.attempts ?? 0) - (a.attempts ?? 0);
        })
        .slice(0, 5),
    [studyStats.cards]
  );
  const hasStudyHistory =
    studyStats.sessions.length > 0 ||
    Object.values(studyStats.cards).some((item) => (item.attempts ?? 0) > 0);

  async function refreshAdminDashboard({
    openOnly = adminOnlyUnresolved,
    preserveNotice = false,
  } = {}) {
    if (!supabase || !session?.user?.id || !isAdmin) {
      return;
    }

    setAdminLoading(true);

    if (!preserveNotice) {
      setAdminNotice("");
    }

    try {
      let inquiryQuery = supabase
        .from("support_inquiries")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(ADMIN_SUPPORT_PREVIEW_LIMIT);

      if (openOnly) {
        inquiryQuery = inquiryQuery.neq("status", "resolved");
      }

      const [metricsResponse, inquiriesResponse] = await Promise.all([
        supabase.rpc("get_admin_dashboard_metrics"),
        inquiryQuery,
      ]);

      if (metricsResponse.error) {
        throw metricsResponse.error;
      }

      if (inquiriesResponse.error) {
        throw inquiriesResponse.error;
      }

      const metricRecord = Array.isArray(metricsResponse.data)
        ? metricsResponse.data[0]
        : metricsResponse.data;

      setAdminMetrics(mapAdminDashboardMetrics(metricRecord));
      setAdminSupportRequests((inquiriesResponse.data ?? []).map(mapSupportInquiryRecord));
    } catch (error) {
      setAdminNotice(error?.message || t("about.adminLoadFail"));
    } finally {
      setAdminLoading(false);
    }
  }

  useEffect(() => {
    pairsRef.current = pairs;
  }, [pairs]);

  useEffect(() => {
    foldersRef.current = folders;
  }, [folders]);

  useEffect(() => {
    studyStatsRef.current = studyStats;
  }, [studyStats]);

  useEffect(() => {
    setSelectedManagePairIds((currentIds) => {
      if (!currentIds.length) {
        return currentIds;
      }

      const visibleIds = new Set(manageFolderPairs.map((pair) => pair.id));
      const nextIds = currentIds.filter((id) => visibleIds.has(id));

      return nextIds.length === currentIds.length ? currentIds : nextIds;
    });
  }, [manageFolderPairs]);

  useEffect(() => {
    if (!maxQuizCount) {
      return;
    }

    setQuizCountInput((currentValue) => {
      const parsedValue = Number.parseInt(currentValue, 10);

      if (!Number.isFinite(parsedValue) || parsedValue < 1) {
        return `${Math.min(DEFAULT_QUIZ_COUNT, maxQuizCount)}`;
      }

      return `${Math.min(parsedValue, maxQuizCount)}`;
    });
  }, [maxQuizCount]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const storedLanguage = await AsyncStorage.getItem(LANGUAGE_KEY);
        const storedThemeMode = await AsyncStorage.getItem(THEME_MODE_KEY);
        const storedStudyStats = await AsyncStorage.getItem(STUDY_STATS_KEY);
        const storedTutorialSeen = await AsyncStorage.getItem(TUTORIAL_SEEN_KEY);
        const storedSupportRequests = await AsyncStorage.getItem(SUPPORT_REQUESTS_KEY);
        const storedFolders = await AsyncStorage.getItem(FOLDERS_STORAGE_KEY);

        if (isSupportedLanguage(storedLanguage)) {
          setLanguage(storedLanguage);
        }

        if (storedThemeMode === "dark" || storedThemeMode === "light") {
          setThemeMode(storedThemeMode);
        }

        if (storedStudyStats && active) {
          try {
            setStudyStats(createPersistableStudyStats(JSON.parse(storedStudyStats), pairsRef.current));
          } catch {
            setStudyStats(createEmptyStudyStats());
          }
        }

        if (storedSupportRequests && active) {
          try {
            setSupportRequests(JSON.parse(storedSupportRequests).map(normalizeSupportRequest));
          } catch {
            setSupportRequests([]);
          }
        }

        if (storedFolders && active) {
          try {
            setFolders(normalizeFolders(JSON.parse(storedFolders)));
          } catch {
            setFolders([]);
          }
        }

        if (active) {
          setTutorialSeen(storedTutorialSeen === "1");
          setTutorialReady(true);
        }

        let storedValue = null;

        for (const key of [STORAGE_KEY, ...LEGACY_STORAGE_KEYS]) {
          const candidate = await AsyncStorage.getItem(key);

          if (!candidate) {
            continue;
          }

          storedValue = candidate;

          if (key !== STORAGE_KEY) {
            await AsyncStorage.setItem(STORAGE_KEY, candidate);
          }

          break;
        }

        if (!storedValue || !active) {
          return;
        }

        const parsed = JSON.parse(storedValue);

        if (Array.isArray(parsed)) {
          setPairs(sortPairs(parsed.map(normalizePairFolder)));
        }
      } finally {
        if (active) {
          setPreferencesReady(true);
          setStorageReady(true);
        }
      }
    };

    void load();

    return () => {
      active = false;
      clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!preferencesReady) {
      return;
    }

    void AsyncStorage.setItem(LANGUAGE_KEY, language);
  }, [language, preferencesReady]);

  useEffect(() => {
    if (!preferencesReady) {
      return;
    }

    void AsyncStorage.setItem(THEME_MODE_KEY, themeMode);
  }, [themeMode, preferencesReady]);

  useEffect(() => {
    void AsyncStorage.setItem(SUPPORT_REQUESTS_KEY, JSON.stringify(supportRequests));
  }, [supportRequests]);

  useEffect(() => {
    if (!storageReady) {
      return;
    }

    void AsyncStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(folders));
  }, [folders, storageReady]);

  useEffect(() => {
    if (!storageReady) {
      return;
    }

    const syncedStudyStats = createPersistableStudyStats(studyStatsRef.current, pairs);
    studyStatsRef.current = syncedStudyStats;
    setStudyStats(syncedStudyStats);
    void AsyncStorage.setItem(STUDY_STATS_KEY, JSON.stringify(syncedStudyStats));
  }, [pairs, storageReady]);

  useEffect(() => {
    if (launchVisible || !storageReady || !tutorialReady || tutorialSeen) {
      return;
    }

    setTutorialStep("intro");
    setTutorialVisible(true);
  }, [launchVisible, storageReady, tutorialReady, tutorialSeen]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) {
        return;
      }

      setSession(data.session ?? null);
      setAuthReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      setAuthReady(true);
      setTranslatedNote(nextSession?.user ? "notes.authLinked" : "notes.googleSyncAvailable");
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    if (!session?.user?.id) {
      setUserRole("user");
      setAdminSupportRequests([]);
      setAdminNotice("");
      return;
    }

    let active = true;

    const syncProfile = async () => {
      try {
        const response = await supabase
          .from("user_profiles")
          .upsert(
            {
              id: session.user.id,
              email: session.user.email ?? null,
            },
            { onConflict: "id" }
          )
          .select("role")
          .single();

        if (!active) {
          return;
        }

        if (response.error) {
          throw response.error;
        }

        setUserRole(normalizeUserRole(response.data?.role));
      } catch {
        if (active) {
          setUserRole("user");
        }
      }
    };

    void syncProfile();

    return () => {
      active = false;
    };
  }, [session?.user?.email, session?.user?.id]);

  useEffect(() => {
    if (!storageReady || !session?.user?.id || !supabase) {
      return;
    }

    if (__DEV__) {
      return;
    }

    if (appOpenTrackedUserRef.current === session.user.id) {
      return;
    }

    let active = true;

    const trackAppOpen = async () => {
      try {
        const response = await supabase.from("app_usage_events").insert({
          user_id: session.user.id,
          event_type: "app_open",
        });

        if (response.error) {
          throw response.error;
        }
      } catch {
        // Metrics should never block the main app flow.
      } finally {
        if (active) {
          appOpenTrackedUserRef.current = session.user.id;
        }
      }
    };

    void trackAppOpen();

    return () => {
      active = false;
    };
  }, [storageReady, session?.user?.id]);

  useEffect(() => {
    if (!storageReady || !session?.user?.id || !supabase) {
      return;
    }

    let active = true;

    const sync = async () => {
      setSyncing(true);

      try {
        let cloudFoldersReady = false;
        let syncedFolders = foldersRef.current;

        try {
          const folderResponse = await supabase
            .from("memory_folders")
            .select("*")
            .order("updated_at", { ascending: false });

          if (folderResponse.error) {
            throw folderResponse.error;
          }

          cloudFoldersReady = true;
          cloudFoldersReadyRef.current = true;

          const remoteFolders = (folderResponse.data ?? []).map(mapFolderRecord);
          const remoteFolderIds = new Set(remoteFolders.map((folder) => folder.id));
          const localOnlyFolders = foldersRef.current.filter(
            (folder) => !remoteFolderIds.has(folder.id)
          );
          let insertedFolders = [];

          if (localOnlyFolders.length > 0) {
            const uploadedFolders = await supabase
              .from("memory_folders")
              .insert(
                localOnlyFolders.map((folder) => ({
                  id: folder.id,
                  user_id: session.user.id,
                  parent_id: normalizeFolderId(folder.parentId),
                  name: folder.name,
                }))
              )
              .select();

            if (uploadedFolders.error) {
              throw uploadedFolders.error;
            }

            insertedFolders = (uploadedFolders.data ?? []).map(mapFolderRecord);
          }

          syncedFolders = mergeFoldersById(remoteFolders, insertedFolders, foldersRef.current);

          if (active) {
            setFolders(syncedFolders);
            await AsyncStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(syncedFolders));
          }
        } catch (error) {
          cloudFoldersReadyRef.current = false;

          if (!isCloudFolderSchemaError(error)) {
            throw error;
          }
        }

        const remoteResponse = await supabase
          .from("memory_pairs")
          .select("*")
          .order("updated_at", { ascending: false });

        if (remoteResponse.error) {
          throw remoteResponse.error;
        }

        const localFolderBySignature = new Map(
          pairsRef.current.map((pair) => [
            createSignature(pair.left, pair.right),
            normalizeFolderId(pair.folderId),
          ])
        );
        const localFolderById = new Map(
          pairsRef.current.map((pair) => [pair.id, normalizeFolderId(pair.folderId)])
        );
        const remote = (remoteResponse.data ?? []).map((record) => {
          const mapped = mapPairRecord(record);
          return {
            ...mapped,
            folderId:
              localFolderById.get(mapped.id) ??
              (cloudFoldersReady
                ? normalizeFolderId(mapped.folderId)
                : localFolderBySignature.get(createSignature(mapped.left, mapped.right))) ??
              normalizeFolderId(mapped.folderId),
          };
        });
        const createSyncSignature = (pair) =>
          cloudFoldersReady
            ? createFolderScopedSignature(pair.left, pair.right, pair.folderId)
            : createSignature(pair.left, pair.right);
        const signatures = new Set(remote.map(createSyncSignature));
        const localOnly = pairsRef.current.filter(
          (pair) => !signatures.has(createSyncSignature(pair))
        );
        let inserted = [];

        if (localOnly.length > 0) {
          const uploaded = await supabase
            .from("memory_pairs")
            .insert(
              localOnly.map((pair) => {
                const row = {
                  user_id: session.user.id,
                  prompt_a: pair.left,
                  prompt_b: pair.right,
                };

                if (cloudFoldersReady) {
                  row.folder_id = normalizeFolderId(pair.folderId);
                }

                return row;
              })
            )
            .select();

          if (uploaded.error) {
            throw uploaded.error;
          }

          inserted = (uploaded.data ?? []).map((record, index) => ({
            ...mapPairRecord(record),
            folderId: normalizeFolderId(localOnly[index]?.folderId),
          }));
        }

        const merged = mergePairsBySignature(remote, inserted, pairsRef.current);

        if (active) {
          setFolders(syncedFolders);
          setPairs(merged);
          await AsyncStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(syncedFolders));
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
          setTranslatedNote("notes.synced");
        }
      } catch (error) {
        if (active) {
          setNoteState({ raw: error?.message || t("common.retryLater") });
        }
      } finally {
        if (active) {
          setSyncing(false);
        }
      }
    };

    void sync();

    return () => {
      active = false;
    };
  }, [storageReady, session?.user?.id]);

  useEffect(() => {
    if (!storageReady || !session?.user?.id || !supabase) {
      return;
    }

    let active = true;

    const syncSupportRequests = async () => {
      try {
        const response = await supabase
          .from("support_inquiries")
          .select("*")
          .eq("user_id", session.user.id)
          .order("created_at", { ascending: false });

        if (response.error) {
          throw response.error;
        }

        if (!active) {
          return;
        }

        setSupportRequests((currentRequests) =>
          mergeSupportRequests(currentRequests, (response.data ?? []).map(mapSupportInquiryRecord))
        );
      } catch {
        // Keep local inquiries visible even when the cloud table is not ready yet.
      }
    };

    void syncSupportRequests();

    return () => {
      active = false;
    };
  }, [storageReady, session?.user?.id]);

  useEffect(() => {
    if (!storageReady || !session?.user?.id || !supabase || !isAdmin) {
      setAdminMetrics(null);
      setAdminSupportRequests([]);
      setAdminLoading(false);
      setAdminNotice("");
      return;
    }

    void refreshAdminDashboard({ openOnly: adminOnlyUnresolved });
  }, [adminOnlyUnresolved, isAdmin, storageReady, session?.user?.id, t]);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(moonGlow, {
          toValue: 0.92,
          duration: 1700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(moonGlow, {
          toValue: 0.56,
          duration: 1700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    pulse.start();

    Animated.spring(launchScale, {
      toValue: 1,
      mass: 0.8,
      damping: 14,
      stiffness: 130,
      useNativeDriver: true,
    }).start();

    return () => {
      pulse.stop();
    };
  }, [launchScale, moonGlow]);

  useEffect(() => {
    if (!launchVisible || !storageReady || !authReady) {
      return;
    }

    const elapsed = Date.now() - bootStartedAt.current;
    const waitTime = Math.max(0, 1300 - elapsed);
    const timeout = setTimeout(() => {
      Animated.parallel([
        Animated.timing(launchOpacity, {
          toValue: 0,
          duration: 420,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(launchScale, {
          toValue: 1.04,
          duration: 420,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start(() => setLaunchVisible(false));
    }, waitTime);

    return () => clearTimeout(timeout);
  }, [authReady, launchOpacity, launchScale, launchVisible, storageReady]);

  useEffect(() => {
    if (pairs.length > 0) {
      return;
    }

    setDeck([]);
    setQuizIndex(0);
    setAnswer("");
    setFeedback("");
    setResult(null);
    setRoundComplete(false);
    setRoundIncorrectIds([]);
    roundMetaRef.current = null;
    roundSnapshotRef.current = null;
  }, [pairs.length]);

  const savePairs = async (nextPairs) => {
    const sorted = sortPairs(nextPairs.map(normalizePairFolder));

    setPairs(sorted);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));
  };

  const saveFolders = async (nextFolders) => {
    const normalized = normalizeFolders(nextFolders);

    foldersRef.current = normalized;
    setFolders(normalized);
    await AsyncStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(normalized));
  };

  const updateStudyStats = (nextStudyStats) => {
    const syncedStudyStats = createPersistableStudyStats(nextStudyStats, pairsRef.current);
    studyStatsRef.current = syncedStudyStats;
    setStudyStats(syncedStudyStats);
    return AsyncStorage.setItem(STUDY_STATS_KEY, JSON.stringify(syncedStudyStats));
  };

  const addSupportRequest = (nextRequest) => {
    setSupportRequests((currentRequests) => mergeSupportRequests([nextRequest], currentRequests));
  };

  const getFolderLabel = (folderId) => {
    const path = getFolderPath(folders, folderId);

    if (!path.length) {
      return t("folders.root");
    }

    return [t("folders.root"), ...path.map((folder) => folder.name)].join(" / ");
  };

  const createFolderInCurrentLocation = async (parentId) => {
    const name = folderNameDraft.trim();
    const normalizedParentId = normalizeFolderId(parentId);

    if (!name) {
      Alert.alert(t("folders.nameNeededTitle"), t("folders.nameNeededBody"));
      return;
    }

    const duplicateExists = folders.some(
      (folder) =>
        normalizeFolderId(folder.parentId) === normalizedParentId &&
        folder.name.localeCompare(name, language, { sensitivity: "base" }) === 0
    );

    if (duplicateExists) {
      Alert.alert(t("folders.duplicateTitle"), t("folders.duplicateBody"));
      return;
    }

    let nextFolder = createLocalFolder(name, normalizedParentId);

    if (session?.user?.id && supabase && cloudFoldersReadyRef.current) {
      try {
        const response = await supabase
          .from("memory_folders")
          .insert({
            id: nextFolder.id,
            user_id: session.user.id,
            parent_id: normalizedParentId,
            name,
          })
          .select()
          .single();

        if (response.error) {
          throw response.error;
        }

        nextFolder = mapFolderRecord(response.data);
      } catch (error) {
        if (!isCloudFolderSchemaError(error)) {
          Alert.alert(t("folders.createFailTitle"), error?.message || t("common.retryLater"));
          return;
        }

        cloudFoldersReadyRef.current = false;
        setTranslatedNote("notes.cloudLocalOnly");
      }
    }

    await saveFolders([...foldersRef.current, nextFolder]);
    setFolderNameDraft("");
    setCreatingFolderKey(null);
    setFolderActionMenuKey(null);
  };

  const selectSaveFolder = (folderId) => {
    const nextFolderId = normalizeFolderId(folderId);

    setSaveFolderId(nextFolderId);
    setFolderNameDraft("");
    setCreatingFolderKey(null);
    setFolderActionMenuKey(null);
  };

  const selectQuizFolder = (folderId) => {
    const nextFolderId = normalizeFolderId(folderId);

    setQuizFolderId(nextFolderId);
    setFolderNameDraft("");
    setCreatingFolderKey(null);
    setFolderActionMenuKey(null);
    setDeck([]);
    setQuizIndex(0);
    setAnswer("");
    setFeedback("");
    setResult(null);
    setRoundComplete(false);
    setRoundIncorrectIds([]);
  };

  const selectManageFolder = (folderId) => {
    const nextFolderId = normalizeFolderId(folderId);

    setManageFolderId(nextFolderId);
    setFolderNameDraft("");
    setCreatingFolderKey(null);
    setFolderActionMenuKey(null);
    setRenamingFolderId(null);
    setFolderRenameDraft("");
    setSelectedManagePairIds([]);
    setEditingId(null);
    setEditingLeft("");
    setEditingRight("");
    setEditingFolderId(ROOT_FOLDER_ID);
  };

  const openFolderCards = (folderId) => {
    const nextFolderId = normalizeFolderId(folderId);

    setManageFolderId(nextFolderId);
    setManageSearch("");
    setManageSort("recent");
    setManageSortMenuOpen(false);
    setSelectedManagePairIds([]);
    setEditingId(null);
    setEditingLeft("");
    setEditingRight("");
    setEditingFolderId(ROOT_FOLDER_ID);
    handleTabChange("manage");
  };

  const beginFolderRename = (folder) => {
    setCreatingFolderKey(null);
    setFolderActionMenuKey(null);
    setRenamingFolderId(folder.id);
    setFolderRenameDraft(folder.name);
  };

  const cancelFolderRename = () => {
    setRenamingFolderId(null);
    setFolderRenameDraft("");
  };

  const saveFolderRename = async (folderId) => {
    const targetFolder = foldersRef.current.find((folder) => folder.id === folderId);
    const name = folderRenameDraft.trim();

    if (!targetFolder || targetFolder.id === ROOT_FOLDER_ID) {
      return;
    }

    if (!name) {
      Alert.alert(t("folders.nameNeededTitle"), t("folders.nameNeededBody"));
      return;
    }

    const duplicateExists = foldersRef.current.some(
      (folder) =>
        folder.id !== targetFolder.id &&
        normalizeFolderId(folder.parentId) === normalizeFolderId(targetFolder.parentId) &&
        folder.name.localeCompare(name, language, { sensitivity: "base" }) === 0
    );

    if (duplicateExists) {
      Alert.alert(t("folders.duplicateTitle"), t("folders.duplicateBody"));
      return;
    }

    let renamedFolder = {
      ...targetFolder,
      name,
      updatedAt: new Date().toISOString(),
    };

    if (session?.user?.id && supabase && cloudFoldersReadyRef.current) {
      try {
        const response = await supabase
          .from("memory_folders")
          .update({ name })
          .eq("id", targetFolder.id)
          .eq("user_id", session.user.id)
          .select()
          .single();

        if (response.error) {
          throw response.error;
        }

        renamedFolder = mapFolderRecord(response.data);
      } catch (error) {
        if (!isCloudFolderSchemaError(error)) {
          Alert.alert(t("folders.renameFailTitle"), error?.message || t("common.retryLater"));
          return;
        }

        cloudFoldersReadyRef.current = false;
        setTranslatedNote("notes.cloudLocalOnly");
      }
    }

    await saveFolders(
      foldersRef.current.map((folder) => (folder.id === targetFolder.id ? renamedFolder : folder))
    );
    setFolderActionMenuKey(null);
    cancelFolderRename();
  };

  const deleteFolder = async (folderId) => {
    const targetFolder = foldersRef.current.find((folder) => folder.id === folderId);

    if (!targetFolder || targetFolder.id === ROOT_FOLDER_ID) {
      return;
    }

    const subtreeIds = getFolderSubtreeIds(foldersRef.current, targetFolder.id);
    const idsToDelete = [...subtreeIds].filter((id) => id !== ROOT_FOLDER_ID);
    const parentFolderId = normalizeFolderId(targetFolder.parentId);
    const movedCardCount = pairsRef.current.filter((pair) =>
      subtreeIds.has(normalizeFolderId(pair.folderId))
    ).length;

    const commitDelete = async () => {
      const now = new Date().toISOString();
      const nextPairs = pairsRef.current.map((pair) =>
        subtreeIds.has(normalizeFolderId(pair.folderId))
          ? { ...pair, folderId: parentFolderId, updatedAt: now }
          : pair
      );
      const nextFolders = foldersRef.current.filter((folder) => !subtreeIds.has(folder.id));

      if (session?.user?.id && supabase && cloudFoldersReadyRef.current) {
        try {
          const movedCloudPairIds = pairsRef.current
            .filter((pair) => pair.source === "cloud" && subtreeIds.has(normalizeFolderId(pair.folderId)))
            .map((pair) => pair.id);

          if (movedCloudPairIds.length) {
            const movedResponse = await supabase
              .from("memory_pairs")
              .update({ folder_id: parentFolderId })
              .in("id", movedCloudPairIds)
              .eq("user_id", session.user.id);

            if (movedResponse.error) {
              throw movedResponse.error;
            }
          }

          const deleteResponse = await supabase
            .from("memory_folders")
            .delete()
            .in("id", idsToDelete)
            .eq("user_id", session.user.id);

          if (deleteResponse.error) {
            throw deleteResponse.error;
          }
        } catch (error) {
          if (!isCloudFolderSchemaError(error)) {
            Alert.alert(t("folders.deleteFailTitle"), error?.message || t("common.retryLater"));
            return;
          }

          cloudFoldersReadyRef.current = false;
          setTranslatedNote("notes.cloudLocalOnly");
        }
      }

      await savePairs(nextPairs);
      await saveFolders(nextFolders);
      setSaveFolderId((currentFolderId) =>
        subtreeIds.has(normalizeFolderId(currentFolderId)) ? parentFolderId : currentFolderId
      );
      setQuizFolderId((currentFolderId) =>
        subtreeIds.has(normalizeFolderId(currentFolderId)) ? parentFolderId : currentFolderId
      );
      setManageFolderId((currentFolderId) =>
        subtreeIds.has(normalizeFolderId(currentFolderId)) ? parentFolderId : currentFolderId
      );
      setSelectedManagePairIds([]);
      cancelFolderRename();
    };

    Alert.alert(
      t("folders.deleteTitle"),
      t("folders.deleteBody", { count: movedCardCount }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("folders.deleteConfirm"),
          style: "destructive",
          onPress: () => {
            void commitDelete();
          },
        },
      ]
    );
  };

  const toggleManagePairSelection = (pairId) => {
    setSelectedManagePairIds((currentIds) =>
      currentIds.includes(pairId)
        ? currentIds.filter((id) => id !== pairId)
        : [...currentIds, pairId]
    );
  };

  const selectAllVisibleManagePairs = () => {
    setSelectedManagePairIds((currentIds) => {
      const nextIds = new Set(currentIds);
      visibleManagePairs.forEach((pair) => nextIds.add(pair.id));
      return [...nextIds];
    });
  };

  const moveSelectedPairsToFolder = async (targetFolderId) => {
    const normalizedTargetFolderId = normalizeFolderId(targetFolderId);

    if (!selectedManagePairIds.length) {
      Alert.alert(t("folders.bulkMoveNoneTitle"), t("folders.bulkMoveNoneBody"));
      return;
    }

    const selectedIds = new Set(selectedManagePairIds);
    const targetSignatures = new Set(
      pairsRef.current
        .filter(
          (pair) =>
            !selectedIds.has(pair.id) &&
            normalizeFolderId(pair.folderId) === normalizedTargetFolderId
        )
        .map((pair) => createSignature(pair.left, pair.right))
    );
    const now = new Date().toISOString();
    const movedIds = [];
    let skippedCount = 0;

    const nextPairs = pairsRef.current.map((pair) => {
      if (!selectedIds.has(pair.id)) {
        return pair;
      }

      if (normalizeFolderId(pair.folderId) === normalizedTargetFolderId) {
        skippedCount += 1;
        return pair;
      }

      const signature = createSignature(pair.left, pair.right);

      if (targetSignatures.has(signature)) {
        skippedCount += 1;
        return pair;
      }

      targetSignatures.add(signature);
      movedIds.push(pair.id);
      return {
        ...pair,
        folderId: normalizedTargetFolderId,
        updatedAt: now,
      };
    });

    if (!movedIds.length) {
      Alert.alert(t("folders.bulkMoveNoneTitle"), t("folders.bulkMoveSkippedBody"));
      return;
    }

    if (session?.user?.id && supabase && cloudFoldersReadyRef.current) {
      try {
        const movedCloudPairIds = pairsRef.current
          .filter((pair) => pair.source === "cloud" && movedIds.includes(pair.id))
          .map((pair) => pair.id);

        if (movedCloudPairIds.length) {
          const response = await supabase
            .from("memory_pairs")
            .update({ folder_id: normalizedTargetFolderId })
            .in("id", movedCloudPairIds)
            .eq("user_id", session.user.id);

          if (response.error) {
            throw response.error;
          }
        }
      } catch (error) {
        if (!isCloudFolderSchemaError(error)) {
          Alert.alert(t("folders.bulkMoveFailTitle"), error?.message || t("common.retryLater"));
          return;
        }

        cloudFoldersReadyRef.current = false;
        setTranslatedNote("notes.cloudLocalOnly");
      }
    }

    await savePairs(nextPairs);
    setSelectedManagePairIds([]);
    setManageFolderId(normalizedTargetFolderId);
    Alert.alert(
      t("folders.bulkMoveDoneTitle"),
      t("folders.bulkMoveDoneBody", { count: movedIds.length, skipped: skippedCount })
    );
  };

  const closeTutorial = (nextTab = null, { showCompletionAlert = false } = {}) => {
    setTutorialVisible(false);
    setTutorialStep("intro");
    setTutorialSeen(true);
    setTutorialQuizResult(null);
    void AsyncStorage.setItem(TUTORIAL_SEEN_KEY, "1");

    if (nextTab) {
      selectTab(nextTab);
    }

    if (showCompletionAlert) {
      setTimeout(() => {
        Alert.alert(t("tutorial.completionTitle"), t("tutorial.completionBody"));
      }, 250);
    }
  };

  const openTutorial = () => {
    setTutorialStep("intro");
    setTutorialQuizResult(null);
    setTutorialVisible(true);
  };

  const startGuidedTutorial = () => {
    setTutorialQuizResult(null);
    setTutorialStep(TUTORIAL_STEPS[0].key);
  };

  const advanceTutorial = () => {
    const nextStep = getNextTutorialStep(tutorialStep);

    if (!nextStep) {
      closeTutorial(null, { showCompletionAlert: tutorialStep === "about-support" });
      return;
    }

    setTutorialStep(nextStep.key);
    applyTutorialStepSideEffects(nextStep);

    if (
      nextStep.type !== "tab" &&
      nextStep.tab &&
      tab !== nextStep.tab
    ) {
      selectTab(nextStep.tab);
    }
  };

  const saveTutorialCard = async ({ left, right }) => {
    const front = left.trim();
    const back = right.trim();

    if (!front || !back) {
      Alert.alert(t("alerts.inputNeededTitle"), t("alerts.inputNeededBody"));
      return false;
    }

    const saveResult = await saveEntryBatch([{ left: front, right: back }]);

    if (!saveResult.savedCount) {
      Alert.alert(t("alerts.duplicateSavedTitle"), t("alerts.duplicateSavedBody"));
      return false;
    }

    setTranslatedNote(
      saveResult.cloudSaved ? "notes.cardSavedCloud" : "notes.cardSavedLocal"
    );
    return true;
  };

  const saveEntryBatch = async (entries, options = {}) => {
    const targetFolderId = normalizeFolderId(options.folderId ?? saveFolderId);
    const existingPairs = pairsRef.current;
    const knownSignatures = new Set(
      existingPairs.map((pair) => createFolderScopedSignature(pair.left, pair.right, pair.folderId))
    );
    const uniqueEntries = [];
    let skippedDuplicates = 0;

    entries.forEach((entry) => {
      const left = entry.left.trim();
      const right = entry.right.trim();

      if (!left || !right) {
        return;
      }

      const folderId = normalizeFolderId(entry.folderId ?? targetFolderId);
      const signature = createFolderScopedSignature(left, right, folderId);

      if (knownSignatures.has(signature)) {
        skippedDuplicates += 1;
        return;
      }

      knownSignatures.add(signature);
      uniqueEntries.push({ left, right, folderId });
    });

    if (!uniqueEntries.length) {
      return { savedCount: 0, skippedDuplicates, cloudSaved: false, savedPairs: [] };
    }

    let savedPairs = uniqueEntries.map((entry) => createLocalPair(entry.left, entry.right, { folderId: entry.folderId }));
    let cloudSaved = false;

    if (session?.user?.id && supabase) {
      try {
        const rows = uniqueEntries.map((entry) => {
          const row = {
            user_id: session.user.id,
            prompt_a: entry.left,
            prompt_b: entry.right,
          };

          if (cloudFoldersReadyRef.current) {
            row.folder_id = normalizeFolderId(entry.folderId);
          }

          return row;
        });
        const inserted = await supabase
          .from("memory_pairs")
          .insert(rows)
          .select();

      if (inserted.error) {
        throw inserted.error;
      }

      savedPairs = (inserted.data ?? []).map((record, index) => ({
        ...mapPairRecord(record),
        folderId: normalizeFolderId(uniqueEntries[index]?.folderId),
      }));
      cloudSaved = true;
    } catch {
      setTranslatedNote("notes.cloudLocalOnly");
    }
    }

    await savePairs([...savedPairs, ...existingPairs]);

    return {
      savedCount: savedPairs.length,
      skippedDuplicates,
      cloudSaved,
      savedPairs,
    };
  };

  const saveCard = async () => {
    const left = draft.left.trim();
    const right = draft.right.trim();

    if (!left || !right) {
      Alert.alert(t("alerts.inputNeededTitle"), t("alerts.inputNeededBody"));
      return;
    }

    const saveResult = await saveEntryBatch([{ left, right }]);

    if (!saveResult.savedCount) {
      Alert.alert(t("alerts.duplicateSavedTitle"), t("alerts.duplicateSavedBody"));
      return;
    }

    Keyboard.dismiss();
    setDraft({ left: "", right: "" });
    setSaveComposerVisible(false);
    setSaveActionMenuOpen(false);
    setQuizFolderId(saveFolderId);
    setManageFolderId(saveFolderId);

    if (saveResult.cloudSaved) {
      setTranslatedNote("notes.cardSavedCloud");
    } else {
      setTranslatedNote("notes.cardSavedLocal");
    }

    if (guidedTutorialActive && tutorialStep === "save-single-practice") {
      tutorialSavedPairIdRef.current = saveResult.savedPairs?.[0]?.id ?? null;
      setTutorialStep("save-single-success");
      applyTutorialStepSideEffects(TUTORIAL_STEP_MAP["save-single-success"]);
      return;
    }
  };

  const importCardsFromFile = async () => {
    setImporting(true);

    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });

      if (picked.canceled) {
        return;
      }

      const asset = picked.assets?.[0];

      if (!asset?.uri) {
        throw new Error(t("alerts.fileUnreadable"));
      }

      const extension = getImportAssetExtension(asset);

      if (!isSupportedImportExtension(extension)) {
        Alert.alert(
          t("alerts.importUnsupportedTypeTitle"),
          t("alerts.importUnsupportedTypeBody")
        );
        return;
      }

      let entries = [];
      let invalidEntryIndexes = [];

      if (extension === "txt") {
        const file = new File(asset.uri);
        const text = await file.text();
        ({ entries, invalidEntryIndexes } = parseImportedPairs(text));
      } else if (extension === "csv") {
        const file = new File(asset.uri);
        const text = await file.text();
        ({ entries, invalidEntryIndexes } = parseSpreadsheetPairsFromText(text));
      } else if (extension === "xls" || extension === "xlsx") {
        const base64 = await readAsStringAsync(asset.uri, {
          encoding: EncodingType.Base64,
        });
        ({ entries, invalidEntryIndexes } = parseSpreadsheetPairsFromBase64(base64));
      } else if (extension === "docx") {
        const base64 = await readAsStringAsync(asset.uri, {
          encoding: EncodingType.Base64,
        });
        const extractedText = await extractDocxTextFromBase64(base64);
        ({ entries, invalidEntryIndexes } = parseImportedPairs(extractedText));
      }

      if (!entries.length) {
        Alert.alert(
          t("alerts.importNoCardsTitle"),
          invalidEntryIndexes.length
            ? t("alerts.importNoCardsBody")
            : t("alerts.importEmptyFile")
        );
        return;
      }

      const saveResult = await saveEntryBatch(entries);
      const messages = [];

      if (saveResult.savedCount) {
        messages.push(t("alerts.importCreated", { count: saveResult.savedCount }));
      }

      if (saveResult.skippedDuplicates) {
        messages.push(t("alerts.importSkippedDuplicates", { count: saveResult.skippedDuplicates }));
      }

      if (invalidEntryIndexes.length) {
        messages.push(t("alerts.importInvalidGroups", { count: invalidEntryIndexes.length }));
      }

      if (!saveResult.savedCount) {
        Alert.alert(t("alerts.importDoneTitle"), messages.join(" "));
        return;
      }

      setQuizFolderId(saveFolderId);
      setManageFolderId(saveFolderId);
      setSaveComposerVisible(false);
      setSaveActionMenuOpen(false);
      setTranslatedNote(
        saveResult.cloudSaved ? "notes.importSavedCloud" : "notes.importSavedLocal",
        { count: saveResult.savedCount }
      );
      Alert.alert(t("alerts.importDoneTitle"), messages.join(" "));
    } catch (error) {
      Alert.alert(
        t("alerts.importFailTitle"),
        error?.message || t("alerts.importFailBody")
      );
    } finally {
      setImporting(false);
    }
  };

  const resetPhotoImportState = () => {
    setPhotoAsset(null);
    setPhotoImportedPairs([]);
    setPhotoInvalidRowIndexes([]);
    setPhotoImportNotice("");
  };

  useEffect(() => {
    if (!APP_FEATURES.photoImport && saveInputMode === "photo") {
      setSaveInputMode("single");
      resetPhotoImportState();
    }
  }, [saveInputMode]);

  const readPairsFromPhotoAsset = async (asset) => {
    if (!asset?.uri) {
      throw new Error(t("alerts.photoUnreadable"));
    }

    try {
      return await recognizePhotoCardPairs(asset);
    } catch (error) {
      if (error?.message === "LOCAL_OCR_UNAVAILABLE") {
        throw new Error(t("alerts.devBuildOnly"));
      }

      throw error;
    }
  };

  const handlePickedPhotoForImport = async (asset) => {
    if (!asset?.uri) {
      return;
    }

    setPhotoAsset(asset);
    setPhotoImporting(true);
    setPhotoImportedPairs([]);
    setPhotoInvalidRowIndexes([]);
    setPhotoImportNotice(t("save.photoScanning"));

    try {
      const { entries, invalidRowIndexes, providerNoticeKey } = await readPairsFromPhotoAsset(asset);

      setPhotoImportedPairs(entries);
      setPhotoInvalidRowIndexes(invalidRowIndexes);

      if (!entries.length) {
        const baseNotice = invalidRowIndexes.length
          ? t("save.photoPairNotGrouped")
          : t("save.photoNoText");

        setPhotoImportNotice(
          providerNoticeKey ? `${t(providerNoticeKey)} ${baseNotice}` : baseNotice
        );
        return;
      }

      const messages = [t("save.photoPairFound", { count: entries.length })];

      if (invalidRowIndexes.length) {
        messages.push(t("save.photoPairInvalid", { count: invalidRowIndexes.length }));
      }

      if (providerNoticeKey) {
        messages.unshift(t(providerNoticeKey));
      }

      setPhotoImportNotice(messages.join(" "));
    } catch (error) {
      setPhotoImportNotice(error?.message || t("save.photoReadFailed"));
    } finally {
      setPhotoImporting(false);
    }
  };

  const pickPhotoFromLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(t("alerts.photoLibraryPermissionTitle"), t("alerts.photoLibraryPermissionBody"));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 1,
    });

    if (result.canceled) {
      return;
    }

    await handlePickedPhotoForImport(result.assets?.[0]);
  };

  const takePhotoForImport = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(t("alerts.photoCameraPermissionTitle"), t("alerts.photoCameraPermissionBody"));
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 1,
      cameraType: ImagePicker.CameraType.back,
    });

    if (result.canceled) {
      return;
    }

    await handlePickedPhotoForImport(result.assets?.[0]);
  };

  const saveRecognizedPhotoPairs = async () => {
    if (!photoImportedPairs.length) {
      Alert.alert(t("alerts.noPhotoPairsTitle"), t("alerts.noPhotoPairsBody"));
      return;
    }

    const saveResult = await saveEntryBatch(photoImportedPairs);
    const messages = [];

    if (saveResult.savedCount) {
      messages.push(t("alerts.photoSaved", { count: saveResult.savedCount }));
    }

    if (saveResult.skippedDuplicates) {
      messages.push(t("alerts.photoSkipped", { count: saveResult.skippedDuplicates }));
    }

    setPhotoImportNotice(
      messages.length
        ? messages.join(" ")
        : t("alerts.photoAllSkipped")
    );

    if (saveResult.cloudSaved) {
      setTranslatedNote("notes.photoSavedCloud");
    }

    if (saveResult.savedCount) {
      setQuizFolderId(saveFolderId);
      setManageFolderId(saveFolderId);
      setSaveComposerVisible(false);
      setSaveActionMenuOpen(false);
      Alert.alert(t("alerts.photoSavedTitle"), messages.join(" "));
    }
  };

  const normalizeQuizCountInput = () => {
    if (!maxQuizCount) {
      return;
    }

    setQuizCountInput(`${resolvedQuizCount}`);
  };

  const beginQuizRound = (nextDeck, options = {}) => {
    clearTimeout(timerRef.current);
    roundSnapshotRef.current = createPersistableStudyStats(studyStatsRef.current, pairsRef.current);
    setDeck(nextDeck);
    setQuizIndex(0);
    setAnswer("");
    setFeedback("");
    setResult(null);
    setRoundComplete(false);
    setRoundIncorrectIds([]);
    roundMetaRef.current = {
      startedAt: new Date().toISOString(),
      requestedCount: options.requestedCount ?? nextDeck.length,
      totalCards: nextDeck.length,
      mode: options.mode ?? quizMode,
      source: options.source ?? "adaptive",
      folderId: normalizeFolderId(options.folderId ?? quizFolderId),
    };
    handleTabChange("quiz");
  };

  const finalizeRound = (incorrectIds = roundIncorrectIds) => {
    const completedAt = new Date().toISOString();
    const incorrectIdSet = new Set(incorrectIds);
    const incorrectCards = deck.filter((card) => incorrectIdSet.has(card.id));
    const nextStudyStats = appendStudySession(
      studyStatsRef.current,
      {
        id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        startedAt: roundMetaRef.current?.startedAt ?? completedAt,
        completedAt,
        requestedCount: roundMetaRef.current?.requestedCount ?? deck.length,
        totalCards: deck.length,
        mode: roundMetaRef.current?.mode ?? quizMode,
        source: roundMetaRef.current?.source ?? "adaptive",
        folderId: roundMetaRef.current?.folderId ?? quizFolderId,
        correctCount: deck.length - incorrectCards.length,
        incorrectCount: incorrectCards.length,
        incorrectCards: incorrectCards.map((card) => ({
          signature: card.signature,
          left: card.left,
          right: card.right,
          direction: card.direction,
        })),
      },
      MAX_SESSION_HISTORY
    );

    updateStudyStats(nextStudyStats);
    roundMetaRef.current = null;
    setRoundComplete(true);

    if (guidedTutorialActive && tutorialStepRef.current === "quiz-answer-practice") {
      setTimeout(() => {
        if (tutorialStepRef.current !== "quiz-answer-practice") {
          return;
        }

        const nextStep = getNextTutorialStep("quiz-answer-practice");

        if (nextStep) {
          setTutorialStep(nextStep.key);
          applyTutorialStepSideEffects(nextStep);
        }
      }, 420);
    }
  };

  const resetQuizSession = () => {
    clearTimeout(timerRef.current);
    let persistPromise = Promise.resolve();

    if (roundSnapshotRef.current) {
      persistPromise = updateStudyStats(roundSnapshotRef.current);
    }

    roundSnapshotRef.current = null;
    roundMetaRef.current = null;
    setDeck([]);
    setQuizIndex(0);
    setAnswer("");
    setFeedback("");
    setResult(null);
    setRoundComplete(false);
    setRoundIncorrectIds([]);

    return persistPromise;
  };

  const confirmStopActiveQuiz = (onConfirm) => {
    Alert.alert(t("quiz.stopTitle"), t("quiz.stopBody"), [
      { text: t("quiz.stopNo"), style: "cancel" },
      {
        text: t("quiz.stopYes"),
        style: "destructive",
        onPress: () => {
          const resetPromise = resetQuizSession();

          if (onConfirm) {
            void resetPromise.finally(onConfirm).catch(() => {});
          }
        },
      },
    ]);
  };

  useEffect(() => {
    if (Platform.OS !== "android") {
      return undefined;
    }

    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!hasActiveQuizRound) {
        return false;
      }

      confirmStopActiveQuiz(() => BackHandler.exitApp());
      return true;
    });

    return () => subscription.remove();
  }, [confirmStopActiveQuiz, hasActiveQuizRound]);

  const submitSupportRequest = async () => {
    const replyEmail = supportReplyEmail.trim();
    const message = supportMessage.trim();

    if (!isValidEmail(replyEmail)) {
      Alert.alert(t("about.emailCheckTitle"), t("about.emailCheckBody"));
      return;
    }

    if (!message) {
      Alert.alert(t("about.messageNeededTitle"), t("about.messageNeededBody"));
      return;
    }

    setSupportSending(true);
    setSupportNotice("");

    try {
      let nextRequest = createLocalSupportRequest({
        replyEmail,
        message,
        category: supportCategory,
        session,
      });
      let cloudSaved = false;

      if (supabase && session?.user?.id) {
        const response = await supabase
          .from("support_inquiries")
          .insert({
            category: supportCategory,
            user_id: session.user.id,
            reply_email: replyEmail,
            sender_email: session.user.email ?? null,
            message,
          })
          .select()
          .single();

        if (!response.error && response.data) {
          nextRequest = mapSupportInquiryRecord(response.data);
          cloudSaved = true;
        }
      }

      addSupportRequest(nextRequest);
      if (cloudSaved && isAdmin) {
        void refreshAdminDashboard({
          openOnly: adminOnlyUnresolved,
          preserveNotice: true,
        });
      }
      setSupportMessage("");
      setSupportNotice(
        cloudSaved
          ? t("about.supportSavedCloud")
          : t("about.supportSavedLocal")
      );
    } catch (error) {
      setSupportNotice(error?.message || t("about.supportFail"));
    } finally {
      setSupportSending(false);
    }
  };

  const updateAdminSupportStatus = async (requestId, nextStatus) => {
    if (!supabase || !session?.user?.id || !isAdmin) {
      return;
    }

    setAdminUpdatingId(requestId);
    setAdminNotice("");

    try {
      const response = await supabase
        .from("support_inquiries")
        .update({ status: nextStatus })
        .eq("id", requestId)
        .select()
        .single();

      if (response.error) {
        throw response.error;
      }

      const updatedRequest = mapSupportInquiryRecord(response.data);

      setAdminSupportRequests((currentRequests) =>
        mergeSupportRequests([updatedRequest], currentRequests)
      );

      if (updatedRequest.userId === session.user.id) {
        setSupportRequests((currentRequests) =>
          mergeSupportRequests([updatedRequest], currentRequests)
        );
      }

      setAdminNotice(t("about.adminStateChanged"));
      await refreshAdminDashboard({
        openOnly: adminOnlyUnresolved,
        preserveNotice: true,
      });
    } catch (error) {
      setAdminNotice(error?.message || t("about.adminStateChangeFail"));
    } finally {
      setAdminUpdatingId(null);
    }
  };

  const resolveRequestedQuizCount = (requestedCount) => {
    if (!maxQuizCount) {
      return 0;
    }

    const normalizedValue =
      typeof requestedCount === "number"
        ? requestedCount
        : typeof requestedCount === "string"
          ? Number.parseInt(requestedCount, 10)
          : Number.parseInt(quizCountInput, 10);

    if (!Number.isFinite(normalizedValue) || normalizedValue < 1) {
      return Math.min(DEFAULT_QUIZ_COUNT, maxQuizCount);
    }

    return Math.min(normalizedValue, maxQuizCount);
  };

  const startQuiz = (requestedCount) => {
    if (!quizFolderPairs.length) {
      Alert.alert(t("quiz.noQuestionsTitle"), t("quiz.noQuestionsBody"));
      return;
    }

    const quizTutorialStarting =
      guidedTutorialActive && tutorialStepRef.current === "quiz-start-button";
    const tutorialPair =
      quizTutorialStarting
        ? pairsRef.current.find((pair) => pair.id === tutorialSavedPairIdRef.current) ?? pairsRef.current[0]
        : null;
    const finalRequestedCount = quizTutorialStarting ? 1 : resolveRequestedQuizCount(requestedCount);
    const nextDeck = buildPracticeDeck(
      tutorialPair ? [tutorialPair] : quizFolderPairs,
      finalRequestedCount,
      quizTutorialStarting ? "front" : quizMode,
      studyStatsRef.current
    );

    beginQuizRound(nextDeck, {
      requestedCount: finalRequestedCount,
      mode: quizTutorialStarting ? "front" : quizMode,
      source: "adaptive",
      folderId: quizTutorialStarting ? normalizeFolderId(tutorialPair?.folderId) : quizFolderId,
    });

    if (quizTutorialStarting) {
      const nextStep = getNextTutorialStep("quiz-start-button");

      if (nextStep) {
        setTutorialStep(nextStep.key);
        applyTutorialStepSideEffects(nextStep);
      }
    }
  };

  const retryIncorrectCards = () => {
    if (!roundIncorrectCards.length) {
      Alert.alert(t("quiz.noRetryTitle"), t("quiz.noRetryBody"));
      return;
    }

    beginQuizRound(shuffleItems(roundIncorrectCards), {
      requestedCount: roundIncorrectCards.length,
      mode: quizMode,
      source: "retry",
    });
  };

  const returnToQuizReady = () => {
    setDeck([]);
    setQuizIndex(0);
    setAnswer("");
    setFeedback("");
    setResult(null);
    setRoundComplete(false);
    setRoundIncorrectIds([]);
  };

  const retryIncorrectCardsFromSession = (sessionItem) => {
    const retryDeck = shuffleItems(
      (sessionItem?.incorrectCards ?? [])
        .map((card, index) => {
          const currentPair = pairsRef.current.find((pair) => createSignature(pair.left, pair.right) === card.signature);
          const left = currentPair?.left ?? card.left;
          const right = currentPair?.right ?? card.right;
          const direction = card.direction === "B_TO_A" ? "B_TO_A" : "A_TO_B";

          if (!left || !right) {
            return null;
          }

          return {
            id: `history-retry-${sessionItem.id}-${index}-${direction}`,
            pairId: currentPair?.id ?? `history-${sessionItem.id}-${index}`,
            left,
            right,
            signature: createSignature(left, right),
            createdAt: currentPair?.createdAt ?? sessionItem.completedAt ?? new Date().toISOString(),
            prompt: direction === "B_TO_A" ? right : left,
            answer: direction === "B_TO_A" ? left : right,
            direction,
          };
        })
        .filter(Boolean)
    );

    if (!retryDeck.length) {
      Alert.alert(t("quiz.noRetryTitle"), t("quiz.noRetryBody"));
      return;
    }

    beginQuizRound(retryDeck, {
      requestedCount: retryDeck.length,
      mode: sessionItem?.mode ?? quizMode,
      source: "retry",
    });
  };

  const goNext = (incorrectIds = roundIncorrectIds) => {
    if (!deck.length) {
      return;
    }

    clearTimeout(timerRef.current);
    setAnswer("");
    setFeedback("");
    setResult(null);

    if (quizIndex + 1 >= deck.length) {
      finalizeRound(incorrectIds);
      return;
    }

    setQuizIndex((currentIndex) => currentIndex + 1);
  };

  const skipCurrentCard = () => {
    if (!current) {
      return;
    }

    Keyboard.dismiss();
    clearTimeout(timerRef.current);

    if (result === "correct") {
      goNext();
      return;
    }

    const nextIncorrectIds = appendUniqueId(roundIncorrectIds, current.id);

    if (result !== "incorrect") {
      updateStudyStats(recordStudyAttempt(studyStatsRef.current, current, false));
      setRoundIncorrectIds(nextIncorrectIds);
      if (guidedTutorialActive && tutorialStepRef.current === "quiz-answer-practice") {
        setTutorialQuizResult("incorrect");
      }
    }

    goNext(nextIncorrectIds);
  };

  const submitAnswer = () => {
    if (!current) {
      return;
    }

    if (!answer.trim()) {
      clearTimeout(timerRef.current);
      setResult("warning");
      setFeedback(t("quiz.feedbackEmpty"));
      return;
    }

    Keyboard.dismiss();

    if (compareAnswers(answer, current.answer)) {
      updateStudyStats(recordStudyAttempt(studyStatsRef.current, current, true));
      if (guidedTutorialActive && tutorialStepRef.current === "quiz-answer-practice") {
        setTutorialQuizResult("correct");
      }
      setResult("correct");
      setFeedback(t("quiz.feedbackCorrect"));
      timerRef.current = setTimeout(() => goNext(), 900);
      return;
    }

    const nextIncorrectIds = appendUniqueId(roundIncorrectIds, current.id);
    updateStudyStats(recordStudyAttempt(studyStatsRef.current, current, false));
    if (guidedTutorialActive && tutorialStepRef.current === "quiz-answer-practice") {
      setTutorialQuizResult("incorrect");
    }
    setResult("incorrect");
    setFeedback(t("quiz.feedbackIncorrect"));
    setRoundIncorrectIds(nextIncorrectIds);
    timerRef.current = setTimeout(() => goNext(nextIncorrectIds), 900);
  };

  const saveEdit = async () => {
    const target = pairs.find((pair) => pair.id === editingId);

    if (!target || !editingLeft.trim() || !editingRight.trim()) {
      return;
    }

    const nextFolderId = normalizeFolderId(editingFolderId);
    const nextSignature = createFolderScopedSignature(editingLeft.trim(), editingRight.trim(), nextFolderId);
    const duplicateExists = pairs.some(
      (pair) =>
        pair.id !== target.id &&
        createFolderScopedSignature(pair.left, pair.right, pair.folderId) === nextSignature
    );

    if (duplicateExists) {
      Alert.alert(t("manage.duplicateTitle"), t("manage.duplicateBody"));
      return;
    }

    let updated = {
      ...updatePairValues(target, editingLeft, editingRight),
      folderId: nextFolderId,
    };

    if (session?.user?.id && supabase && target.source === "cloud") {
      const changes = {
        prompt_a: editingLeft.trim(),
        prompt_b: editingRight.trim(),
      };

      if (cloudFoldersReadyRef.current) {
        changes.folder_id = nextFolderId;
      }

      const response = await supabase
        .from("memory_pairs")
        .update(changes)
        .eq("id", target.id)
        .eq("user_id", session.user.id)
        .select()
        .single();

      if (response.error) {
        if (!isCloudFolderSchemaError(response.error)) {
          Alert.alert(t("manage.editFail"), response.error.message);
          return;
        }

        cloudFoldersReadyRef.current = false;
        setTranslatedNote("notes.cloudLocalOnly");
      } else {
        updated = {
          ...mapPairRecord(response.data),
          folderId: nextFolderId,
        };
      }
    }

    await savePairs(pairs.map((pair) => (pair.id === target.id ? updated : pair)));
    updateStudyStats(migrateStudyStatsEntry(studyStatsRef.current, target, updated));
    setEditingId(null);
    setEditingLeft("");
    setEditingRight("");
    setEditingFolderId(ROOT_FOLDER_ID);
  };

  const removePair = async (pair) => {
    if (session?.user?.id && supabase && pair.source === "cloud") {
      const response = await supabase
        .from("memory_pairs")
        .delete()
        .eq("id", pair.id)
        .eq("user_id", session.user.id);

      if (response.error) {
        Alert.alert(t("manage.deleteFail"), response.error.message);
        return;
      }
    }

    await savePairs(pairs.filter((item) => item.id !== pair.id));
  };

  const signOut = async () => {
    if (!supabase) {
      return;
    }

    setAuthBusy(true);

    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }
    } catch (error) {
      Alert.alert(t("about.signOutFailTitle"), error?.message || t("common.retryLater"));
    } finally {
      setAuthBusy(false);
    }
  };

  const login = async () => {
    if (!supabase) {
      Alert.alert(
        t("about.authPrepTitle"),
        t("about.authPrepBody")
      );
      return;
    }

    setAuthBusy(true);

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectUri,
          skipBrowserRedirect: true,
          queryParams: { access_type: "offline", prompt: "consent" },
        },
      });

      if (error || !data?.url) {
        throw error || new Error(t("about.authFailBody"));
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);

      if (result.type === "success" && result.url) {
        const code = new URL(result.url).searchParams.get("code");

        if (code) {
          const exchange = await supabase.auth.exchangeCodeForSession(code);

          if (exchange.error) {
            throw exchange.error;
          }
        }

        return;
      }

      if (result.type !== "cancel") {
        setTranslatedNote("notes.loginIncomplete");
      }
    } catch (error) {
      Alert.alert(t("about.authFailTitle"), error?.message || t("about.authFailBody"));
    } finally {
      setAuthBusy(false);
    }
  };

  const renderFolderExplorer = ({
    currentFolderId,
    onSelectFolder,
    allowCreate = false,
    scope = "folders",
  }) => {
    const normalizedCurrentFolderId = normalizeFolderId(currentFolderId);
    const currentFolder = folders.find((folder) => folder.id === normalizedCurrentFolderId);
    const parentFolderId = currentFolder?.parentId ?? ROOT_FOLDER_ID;
    const path = getFolderPath(folders, normalizedCurrentFolderId);
    const children = getFolderChildren(folders, normalizedCurrentFolderId);
    const directPairCount = pairs.filter(
      (pair) => normalizeFolderId(pair.folderId) === normalizedCurrentFolderId
    ).length;
    const canManageCurrentFolder = allowCreate && currentFolder;
    const renamingCurrentFolder = renamingFolderId === normalizedCurrentFolderId;
    const folderViewKey = createFolderViewKey(scope, normalizedCurrentFolderId);
    const creatingCurrentFolder = creatingFolderKey === folderViewKey;
    const actionMenuOpen = folderActionMenuKey === folderViewKey;
    const folderActions = [
      allowCreate
        ? {
            key: "create",
            icon: "folder-plus-outline",
            label: t("folders.newFolder"),
            onPress: () => {
              cancelFolderRename();
              setFolderNameDraft("");
              setCreatingFolderKey(folderViewKey);
              setFolderActionMenuKey(null);
            },
          }
        : null,
      normalizedCurrentFolderId !== ROOT_FOLDER_ID
        ? {
            key: "up",
            icon: "arrow-up-left",
            label: t("folders.up"),
            onPress: () => onSelectFolder(parentFolderId),
          }
        : null,
      canManageCurrentFolder
        ? {
            key: "rename",
            icon: "pencil-outline",
            label: t("folders.rename"),
            onPress: () => beginFolderRename(currentFolder),
          }
        : null,
      canManageCurrentFolder
        ? {
            key: "delete",
            icon: "trash-can-outline",
            label: t("folders.delete"),
            danger: true,
            onPress: () => {
              setFolderActionMenuKey(null);
              void deleteFolder(normalizedCurrentFolderId);
            },
          }
        : null,
    ].filter(Boolean);
    const renderFolderAction = (action) => (
      <Pressable
        key={action.key}
        onPress={action.onPress}
        style={({ pressed }) => [styles.folderActionMenuItem, pressed && styles.pressed]}
      >
        <MaterialCommunityIcons
          name={action.icon}
          size={17}
          color={action.danger ? theme.danger : theme.textPrimary}
        />
        <Text style={[styles.folderActionMenuText, action.danger && styles.folderActionMenuTextDanger]}>
          {action.label}
        </Text>
      </Pressable>
    );

    return (
      <View style={styles.folderPanel}>
        <View style={styles.folderHeaderRow}>
          <View style={styles.folderHeaderCopy}>
            <View style={styles.folderTitleRow}>
              <MaterialCommunityIcons name="folder-open-outline" size={19} color={theme.accent} />
              <Text style={styles.folderPanelTitle}>{t("folders.title")}</Text>
            </View>
          </View>
          {folderActions.length ? (
            <View style={styles.folderActionWrap}>
              <Pressable
                accessibilityLabel={t("folders.actions")}
                onPress={() =>
                  setFolderActionMenuKey((currentKey) =>
                    currentKey === folderViewKey ? null : folderViewKey
                  )
                }
                style={({ pressed }) => [
                  styles.folderActionButton,
                  actionMenuOpen && styles.folderActionButtonActive,
                  pressed && styles.pressed,
                ]}
              >
                <MaterialCommunityIcons name="dots-horizontal" size={22} color={theme.textPrimary} />
              </Pressable>
              {actionMenuOpen ? (
                <View style={styles.folderActionMenu}>
                  {folderActions.map(renderFolderAction)}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.folderBreadcrumbRow}>
          <Pressable
            onPress={() => onSelectFolder(ROOT_FOLDER_ID)}
            style={({ pressed }) => [
              styles.folderBreadcrumb,
              normalizedCurrentFolderId === ROOT_FOLDER_ID && styles.folderBreadcrumbActive,
              pressed && styles.pressed,
            ]}
          >
            <MaterialCommunityIcons name="home-outline" size={14} color={normalizedCurrentFolderId === ROOT_FOLDER_ID ? theme.accent : theme.textSecondary} />
            <Text style={[styles.folderBreadcrumbText, normalizedCurrentFolderId === ROOT_FOLDER_ID && styles.folderBreadcrumbTextActive]}>
              {t("folders.root")}
            </Text>
          </Pressable>
          {path.map((folder, index) => {
            const active = folder.id === normalizedCurrentFolderId;

            return (
              <React.Fragment key={folder.id}>
                <MaterialCommunityIcons name="chevron-right" size={15} color={theme.textPlaceholder} />
                <Pressable
                  onPress={() => onSelectFolder(folder.id)}
                  style={({ pressed }) => [
                    styles.folderBreadcrumb,
                    active && styles.folderBreadcrumbActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.folderBreadcrumbText, active && styles.folderBreadcrumbTextActive]}>
                    {folder.name}
                  </Text>
                </Pressable>
              </React.Fragment>
            );
          })}
        </ScrollView>

        {renamingCurrentFolder ? (
          <View style={styles.folderManageBox}>
            <TextInput
              value={folderRenameDraft}
              onChangeText={setFolderRenameDraft}
              placeholder={t("folders.renamePlaceholder")}
              placeholderTextColor={theme.textPlaceholder}
              style={[styles.input, styles.folderRenameInput]}
              returnKeyType="done"
              onSubmitEditing={() => void saveFolderRename(normalizedCurrentFolderId)}
            />
            <View style={styles.folderManageActionRow}>
              <Pressable
                onPress={() => void saveFolderRename(normalizedCurrentFolderId)}
                style={({ pressed }) => [styles.folderSmallPrimaryButton, pressed && styles.pressed]}
              >
                <Text style={styles.folderSmallPrimaryText}>{t("folders.renameSave")}</Text>
              </Pressable>
              <Pressable
                onPress={cancelFolderRename}
                style={({ pressed }) => [styles.folderSmallSecondaryButton, pressed && styles.pressed]}
              >
                <Text style={styles.folderSmallSecondaryText}>{t("common.cancel")}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={styles.folderChildrenSection}>
          {children.length ? (
            <View style={styles.folderChildList}>
              {children.map((folder) => (
                <Pressable
                  key={folder.id}
                  onPress={() => onSelectFolder(folder.id)}
                  style={({ pressed }) => [styles.folderChildItem, pressed && styles.pressed]}
                >
                  <View style={styles.folderChildIcon}>
                    <MaterialCommunityIcons name="folder" size={35} color={theme.accent} />
                  </View>
                  <Text style={styles.folderChildName} numberOfLines={2} ellipsizeMode="tail">
                    {folder.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.folderEmptyText}>{t("folders.emptyChildren")}</Text>
          )}
          <Pressable
            onPress={() => openFolderCards(normalizedCurrentFolderId)}
            style={({ pressed }) => [styles.folderSavedCardsItem, pressed && styles.pressed]}
          >
            <View style={styles.folderSavedCardsIcon}>
              <MaterialCommunityIcons name="file-document-outline" size={32} color={theme.textSecondary} />
            </View>
            <Text style={styles.folderSavedCardsName} numberOfLines={2}>
              {t("folders.savedCards")}
            </Text>
            <Text style={styles.folderSavedCardsMeta}>
              {t("folders.savedCardsMeta", { count: directPairCount })}
            </Text>
          </Pressable>
        </View>

        {allowCreate && creatingCurrentFolder ? (
          <View style={styles.folderManageBox}>
            <TextInput
              value={folderNameDraft}
              onChangeText={setFolderNameDraft}
              placeholder={t("folders.newPlaceholder")}
              placeholderTextColor={theme.textPlaceholder}
              style={[styles.input, styles.folderRenameInput]}
              returnKeyType="done"
              onSubmitEditing={() => void createFolderInCurrentLocation(normalizedCurrentFolderId)}
            />
            <View style={styles.folderManageActionRow}>
              <Pressable
                onPress={() => void createFolderInCurrentLocation(normalizedCurrentFolderId)}
                style={({ pressed }) => [styles.folderSmallPrimaryButton, pressed && styles.pressed]}
              >
                <Text style={styles.folderSmallPrimaryText}>{t("folders.create")}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setFolderNameDraft("");
                  setCreatingFolderKey(null);
                }}
                style={({ pressed }) => [styles.folderSmallSecondaryButton, pressed && styles.pressed]}
              >
                <Text style={styles.folderSmallSecondaryText}>{t("common.cancel")}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  const closeSaveComposer = () => {
    Keyboard.dismiss();
    setSaveComposerVisible(false);
    setSaveActionMenuOpen(false);
  };

  const handleSaveModeSelect = (optionKey) => {
    setSaveInputMode(optionKey);
    setSaveComposerVisible(true);
    setSaveActionMenuOpen(false);

    if (guidedTutorialActive && tutorialStep === "save-single-chip" && optionKey === "single") {
      advanceTutorial();
    }

    if (guidedTutorialActive && tutorialStep === "save-single-success" && optionKey === "text") {
      advanceTutorial();
    }
  };

  const renderSaveModeOption = (option, variant = "modal") => {
    const active = saveInputMode === option.key;
    const targetProps = variant === "fab" ? tutorialTargetProps(`save-mode-${option.key}`) : {};

    return (
      <Pressable
        key={`${variant}-${option.key}`}
        {...targetProps}
        onPress={() => handleSaveModeSelect(option.key)}
        style={({ pressed }) => [
          variant === "fab" ? styles.saveFabMenuItem : styles.saveModeChip,
          active && (variant === "fab" ? styles.saveFabMenuItemActive : styles.saveModeChipActive),
          pressed && styles.pressed,
        ]}
      >
        <MaterialCommunityIcons
          name={option.icon}
          size={variant === "fab" ? 19 : 18}
          color={active ? theme.accent : theme.textSecondary}
        />
        <Text
          style={[
            variant === "fab" ? styles.saveFabMenuText : styles.saveModeChipText,
            active && (variant === "fab" ? styles.saveFabMenuTextActive : styles.saveModeChipTextActive),
          ]}
        >
          {t(option.labelKey)}
        </Text>
      </Pressable>
    );
  };

  const renderSaveModeSelector = () => (
    <View style={styles.saveModeRow}>
      {SAVE_INPUT_OPTIONS.map((option) => renderSaveModeOption(option))}
    </View>
  );

  const renderSaveInputContent = () => (
    <>
      {saveInputMode === "single" ? (
        <View style={[styles.composerPanel, styles.saveModalInnerPanel]} {...tutorialTargetProps("save-composer")}>
          <View style={styles.importHeader}>
            <View style={styles.importTitleRow}>
              <Text style={styles.importTitle}>{t("save.title")}</Text>
            </View>
            <Text style={styles.importBodyCompact}>{t("save.singleBody")}</Text>
          </View>

          <View style={styles.subtleDivider} />

          <Text style={styles.inputLabel}>{t("common.front")}</Text>
          <TextInput
            value={draft.left}
            onChangeText={(value) => setDraft((currentDraft) => ({ ...currentDraft, left: value }))}
            style={[styles.input, styles.multilineInput]}
            multiline
            textAlignVertical="top"
          />

          <Text style={styles.inputLabel}>{t("common.back")}</Text>
          <TextInput
            value={draft.right}
            onChangeText={(value) => setDraft((currentDraft) => ({ ...currentDraft, right: value }))}
            style={[styles.input, styles.multilineInput]}
            multiline
            textAlignVertical="top"
          />

          <Pressable
            onPress={() => void saveCard()}
            style={({ pressed }) => [styles.primaryButton, styles.savePrimaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.primaryButtonText}>{t("save.saveButton")}</Text>
          </Pressable>
        </View>
      ) : null}

      {saveInputMode === "text" ? (
        <View style={[styles.importPanel, styles.saveModalInnerPanel]} {...tutorialTargetProps("save-import-panel")}>
          <View style={styles.importHeader}>
            <View style={styles.importTitleRow}>
              <View style={styles.importIconWrap}>
                <MaterialCommunityIcons name="file-document-plus-outline" size={18} color={theme.accent} />
              </View>
              <Text style={styles.importTitle}>{t("save.textImportTitle")}</Text>
            </View>
            <Text style={styles.importBody}>{t("save.textImportBody")}</Text>
            <View style={styles.subtleDivider} />
            <View style={styles.importPreviewCard}>
              <View style={styles.importPreviewTopBar}>
                <View style={styles.importPreviewDots}>
                  <View style={styles.importPreviewDot} />
                  <View style={styles.importPreviewDot} />
                  <View style={styles.importPreviewDot} />
                </View>
                <Text style={styles.importPreviewFileName}>cards-example.txt</Text>
              </View>
              <View style={styles.importPreviewSheet}>
                {importPreviewLines.map((line) => (
                  <View key={`${line.no}-${line.text || "blank"}`} style={styles.importPreviewLine}>
                    <Text style={styles.importPreviewLineNo}>{line.no}</Text>
                    <Text
                      style={[
                        styles.importPreviewLineText,
                        line.tone === "front" && styles.importPreviewLineFront,
                        line.tone === "back" && styles.importPreviewLineBack,
                        line.tone === "blank" && styles.importPreviewLineBlank,
                      ]}
                    >
                      {line.text || " "}
                    </Text>
                  </View>
                ))}
              </View>
              <View style={styles.importPreviewFooter}>
                <MaterialCommunityIcons name="cards-outline" size={15} color={theme.accent} />
                <Text style={styles.importPreviewHint}>{t("save.textImportHint")}</Text>
              </View>
            </View>
          </View>

          <Pressable
            {...tutorialTargetProps("save-import-button")}
            disabled={importing}
            onPress={() => void importCardsFromFile()}
            style={({ pressed }) => [
              styles.importButton,
              importing && styles.importButtonDisabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.importButtonText}>{importing ? t("save.textImportLoading") : t("save.textImportButton")}</Text>
          </Pressable>
        </View>
      ) : null}

      {APP_FEATURES.photoImport && saveInputMode === "photo" ? (
        <View style={[styles.importPanel, styles.saveModalInnerPanel]}>
          <View style={styles.importHeader}>
            <View style={styles.importTitleRow}>
              <View style={styles.importIconWrap}>
                <MaterialCommunityIcons name="camera-outline" size={18} color={theme.accent} />
              </View>
              <Text style={styles.importTitle}>{t("save.photoImportTitle")}</Text>
            </View>
            <Text style={styles.importBody}>{t("save.photoImportBody")}</Text>
          </View>

          {photoAsset?.uri ? (
            <View style={styles.photoPreviewFrame}>
              <Image source={{ uri: photoAsset.uri }} style={styles.photoPreviewImage} resizeMode="contain" />
            </View>
          ) : (
            <View style={styles.photoPlaceholderCard}>
              <View style={styles.photoPlaceholderIcon}>
                <MaterialCommunityIcons name="image-search-outline" size={22} color={theme.accent} />
              </View>
              <Text style={styles.photoPlaceholderTitle}>{t("save.photoPlaceholderTitle")}</Text>
              <Text style={styles.photoPlaceholderBody}>{t("save.photoPlaceholderBody")}</Text>
            </View>
          )}

          {photoImportNotice ? <Text style={styles.photoImportNotice}>{photoImportNotice}</Text> : null}

          {photoPreviewPairs.length ? (
            <View style={styles.photoResultsCard}>
              <Text style={styles.photoResultsTitle}>{t("save.photoPreviewTitle")}</Text>
              <View style={styles.libraryList}>
                {photoPreviewPairs.map((entry, index) => (
                  <View key={`${entry.left}-${entry.right}-${index}`} style={[styles.previewRow, styles.previewRowLarge]}>
                    <View style={styles.previewColumn}>
                      <Text style={styles.previewLabel}>{t("common.front")}</Text>
                      <Text style={styles.previewText}>{entry.left}</Text>
                    </View>
                    <Text style={styles.previewDivider}>↔</Text>
                    <View style={styles.previewColumn}>
                      <Text style={styles.previewLabel}>{t("common.back")}</Text>
                      <Text style={styles.previewText}>{entry.right}</Text>
                    </View>
                  </View>
                ))}
              </View>
              {photoImportedPairs.length > photoPreviewPairs.length ? (
                <Text style={styles.photoImportMeta}>
                  {t("save.photoPreviewMore", {
                    count: photoImportedPairs.length - photoPreviewPairs.length,
                  })}
                </Text>
              ) : null}
              {photoInvalidRowIndexes.length ? (
                <Text style={styles.photoImportMeta}>
                  {t("save.photoPreviewInvalidRows", {
                    rows: photoInvalidRowIndexes.join(", "),
                  })}
                </Text>
              ) : null}
            </View>
          ) : null}

          <View style={styles.actionRow}>
            <Pressable
              disabled={photoImporting}
              onPress={() => void takePhotoForImport()}
              style={({ pressed }) => [
                styles.primaryButton,
                photoImporting && styles.primaryButtonDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[
                  styles.primaryButtonText,
                  photoImporting && styles.primaryButtonTextDisabled,
                ]}
              >
                {photoImporting ? t("save.photoReading") : t("save.photoTake")}
              </Text>
            </Pressable>
            <Pressable
              disabled={photoImporting}
              onPress={() => void pickPhotoFromLibrary()}
              style={({ pressed }) => [
                styles.secondaryButton,
                photoImporting && styles.secondaryButtonDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[
                  styles.secondaryButtonText,
                  photoImporting && styles.secondaryButtonTextDisabled,
                ]}
              >
                {t("save.photoPick")}
              </Text>
            </Pressable>
          </View>

          <View style={styles.actionRow}>
            <Pressable
              disabled={!photoImportedPairs.length || photoImporting}
              onPress={() => void saveRecognizedPhotoPairs()}
              style={({ pressed }) => [
                styles.primaryButton,
                (!photoImportedPairs.length || photoImporting) && styles.primaryButtonDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[
                  styles.primaryButtonText,
                  (!photoImportedPairs.length || photoImporting) &&
                    styles.primaryButtonTextDisabled,
                ]}
              >
                {t("save.photoSave")}
              </Text>
            </Pressable>
            <Pressable
              disabled={!photoAsset?.uri && !photoImportedPairs.length && !photoImportNotice}
              onPress={resetPhotoImportState}
              style={({ pressed }) => [
                styles.secondaryButton,
                !photoAsset?.uri &&
                  !photoImportedPairs.length &&
                  !photoImportNotice &&
                  styles.secondaryButtonDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[
                  styles.secondaryButtonText,
                  !photoAsset?.uri &&
                    !photoImportedPairs.length &&
                    !photoImportNotice &&
                    styles.secondaryButtonTextDisabled,
                ]}
              >
                {t("save.reset")}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </>
  );

  const renderSaveComposerModal = () => (
    <Modal
      visible={saveComposerVisible}
      transparent
      animationType="fade"
      onRequestClose={closeSaveComposer}
    >
      <View style={styles.saveModalOverlay}>
        <Pressable style={styles.saveModalBackdrop} onPress={closeSaveComposer} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.saveModalKeyboard}
        >
          <View style={[styles.saveModalSheet, contentMaxWidth ? { maxWidth: contentMaxWidth } : null]}>
            <View style={styles.saveModalHandle} />
            <View style={styles.saveModalHeader}>
              <View style={styles.saveModalTitleRow}>
                <MaterialCommunityIcons
                  name={saveInputMode === "single" ? "cards-outline" : "file-document-plus-outline"}
                  size={19}
                  color={theme.accent}
                />
                <Text style={styles.saveModalTitle}>
                  {t(saveInputMode === "single" ? "saveModes.single" : "saveModes.text")}
                </Text>
              </View>
              <Pressable
                onPress={closeSaveComposer}
                style={({ pressed }) => [styles.saveModalCloseButton, pressed && styles.pressed]}
              >
                <MaterialCommunityIcons name="close" size={20} color={theme.textPrimary} />
              </Pressable>
            </View>
            {renderSaveModeSelector()}
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.saveModalScrollContent}
            >
              {renderSaveInputContent()}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );

  const renderSaveFloatingAdd = () => {
    const shouldShow =
      tab === "save" &&
      !launchVisible &&
      !saveComposerVisible &&
      (!guidedTutorialActive || tutorialStep === "save-single-chip");

    if (!shouldShow) {
      return null;
    }

    return (
      <View
        pointerEvents="box-none"
        style={[
          styles.saveFabLayer,
          tabBarLeft !== null ? { right: Math.max(24, tabBarLeft + 24) } : null,
        ]}
      >
        {saveActionMenuOpen ? (
          <View style={styles.saveFabMenu}>
            {SAVE_INPUT_OPTIONS.map((option) => renderSaveModeOption(option, "fab"))}
          </View>
        ) : null}
        <Pressable
          accessibilityLabel={t("folders.actions")}
          onPress={() => setSaveActionMenuOpen((currentValue) => !currentValue)}
          style={({ pressed }) => [
            styles.saveFabButton,
            saveActionMenuOpen && styles.saveFabButtonActive,
            pressed && styles.pressed,
          ]}
        >
          <MaterialCommunityIcons
            name={saveActionMenuOpen ? "close" : "plus"}
            size={30}
            color={theme.accentText}
          />
        </Pressable>
      </View>
    );
  };

  const renderSaveTab = () => (
    <View style={[styles.scene, styles.saveScene]}>
      {renderFolderExplorer({
        currentFolderId: saveFolderId,
        onSelectFolder: selectSaveFolder,
        allowCreate: true,
        scope: "save",
      })}
      {renderSaveComposerModal()}
    </View>
  );

  const renderQuizTab = () => (
    <View style={styles.scene}>
      {!roundComplete && !current ? (
        renderFolderExplorer({
          currentFolderId: quizFolderId,
          onSelectFolder: selectQuizFolder,
          scope: "quiz",
        })
      ) : null}

      {roundComplete && deck.length ? (
        <View style={styles.quizSummaryCard}>
          <View style={styles.quizSummaryHeader}>
            <Text style={styles.panelTitle}>{t("quiz.roundComplete")}</Text>
            <Text style={styles.panelBody}>
              {roundIncorrectCards.length
                ? t("quiz.roundBodyRetry")
                : t("quiz.roundBodyPerfect")}
            </Text>
          </View>

          <View style={styles.quizSummaryStats}>
            <View style={styles.quizSummaryStat}>
              <Text style={styles.quizSummaryValue}>{deck.length}</Text>
              <Text style={styles.quizSummaryLabel}>{t("quiz.total")}</Text>
            </View>
            <View style={styles.quizSummaryStat}>
              <Text style={[styles.quizSummaryValue, styles.quizSummaryValueGood]}>
                {roundCorrectCount}
              </Text>
              <Text style={styles.quizSummaryLabel}>{t("quiz.correct")}</Text>
            </View>
            <View style={styles.quizSummaryStat}>
              <Text style={[styles.quizSummaryValue, styles.quizSummaryValueBad]}>
                {roundIncorrectCards.length}
              </Text>
              <Text style={styles.quizSummaryLabel}>{t("quiz.retry")}</Text>
            </View>
          </View>

          <View style={styles.actionRow}>
            <Pressable onPress={returnToQuizReady} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
              <Text style={styles.secondaryButtonText}>{t("quiz.restartAdaptive")}</Text>
            </Pressable>
            <Pressable
              disabled={!roundIncorrectCards.length}
              onPress={retryIncorrectCards}
              style={({ pressed }) => [
                styles.primaryButton,
                !roundIncorrectCards.length && styles.primaryButtonDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[
                  styles.primaryButtonText,
                  !roundIncorrectCards.length && styles.primaryButtonTextDisabled,
                ]}
              >
                {t("quiz.retryIncorrect")}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : current ? (
          <View style={styles.quizCard} {...tutorialTargetProps("quiz-card")}>
            <View style={styles.quizMetaRow}>
              <Text style={styles.quizProgress}>
                {Math.min(quizIndex + 1, deck.length)} / {deck.length}
              </Text>
              <Text style={styles.quizBadge}>{t(`directions.${current.direction}`)}</Text>
            </View>

            <Text style={styles.quizPrompt}>{current.prompt}</Text>

            <TextInput
              value={answer}
              onChangeText={(value) => {
                setAnswer(value);

                if (result === "warning") {
                  setFeedback("");
                  setResult(null);
                }
              }}
              placeholder={t("quiz.answerPlaceholder")}
              placeholderTextColor={theme.textPlaceholder}
              autoCapitalize="none"
              style={styles.input}
            />

            {feedback ? (
              <Text
                style={[
                  styles.feedback,
                  result === "correct"
                    ? styles.feedbackGood
                    : result === "warning"
                      ? styles.feedbackNeutral
                      : styles.feedbackBad,
                ]}
              >
                {feedback}
              </Text>
            ) : null}

            {result === "incorrect" ? (
              <Text style={styles.answerText}>{t("quiz.answerPrefix", { answer: current.answer })}</Text>
            ) : null}

            <View style={styles.actionRow}>
              <Pressable onPress={submitAnswer} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
                <Text style={styles.primaryButtonText}>{t("quiz.submitAnswer")}</Text>
              </Pressable>
              <Pressable onPress={skipCurrentCard} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
                <Text style={styles.secondaryButtonText}>{t("quiz.skipNext")}</Text>
              </Pressable>
            </View>
          </View>
        ) : hasSavedCards ? (
          <View style={[styles.quizReadyCard, styles.quizReadyCardOffset]} {...tutorialTargetProps("quiz-ready-card")}>
            <View style={styles.historySummaryHeader}>
              <Text style={styles.panelTitle}>{t("quiz.readyTitle")}</Text>
              <Text style={styles.panelBody}>{t("quiz.readyBody")}</Text>
            </View>

            <View style={styles.quizReadyStats}>
              <View style={styles.quizReadyStat}>
                <Text style={styles.quizReadyStatValue}>{quizFolderPairs.length}</Text>
                <Text style={styles.quizReadyStatLabel}>{t("quiz.storedCards")}</Text>
              </View>
              <View
                style={[
                  styles.quizReadyStat,
                  quizFolderPairs.length > 0 && styles.quizReadyStatEditable,
                ]}
              >
                <TextInput
                  value={quizFolderPairs.length ? quizCountInput : ""}
                  onBlur={normalizeQuizCountInput}
                  onChangeText={(value) => setQuizCountInput(value.replace(/[^0-9]/g, ""))}
                  editable={quizFolderPairs.length > 0}
                  keyboardType="number-pad"
                  maxLength={3}
                  placeholder="-"
                  placeholderTextColor={theme.textPlaceholder}
                  style={[
                    styles.quizReadyStatInput,
                    quizFolderPairs.length > 0 && styles.quizReadyStatInputEditable,
                    !quizFolderPairs.length && styles.quizCountInputDisabled,
                  ]}
                />
                <Text
                  style={[
                    styles.quizReadyStatLabel,
                    quizFolderPairs.length > 0 && styles.quizReadyStatLabelEditable,
                  ]}
                >
                  {t("quiz.requestedCount")}
                </Text>
              </View>
              <View style={styles.quizReadyStat}>
                <Text style={styles.quizReadyStatValue}>{maxQuizCount}</Text>
                <Text style={styles.quizReadyStatLabel}>{t("quiz.availableCount")}</Text>
              </View>
            </View>

            <View style={[styles.quizModeCard, styles.quizModeCardEmbedded]}>
              <Text style={styles.quizSetupLabel}>{t("quiz.modeLabel")}</Text>
              <Text style={styles.quizSetupHint}>{t(quizModeConfig.descriptionKey)}</Text>
              <View style={styles.quizModeRow}>
                {QUIZ_MODE_OPTIONS.map((option) => {
                  const active = quizMode === option.key;

                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => setQuizMode(option.key)}
                      style={({ pressed }) => [
                        styles.quizModeChip,
                        active && styles.quizModeChipActive,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={[styles.quizModeChipText, active && styles.quizModeChipTextActive]}>{t(option.chipLabelKey)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.actionRow}>
              <Pressable
                {...tutorialTargetProps("quiz-start-button")}
                onPress={() => startQuiz()}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
              >
                <Text style={styles.primaryButtonText}>{t("quiz.startButton")}</Text>
              </Pressable>
              <Pressable onPress={() => handleTabChange("manage")} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
                <Text style={styles.secondaryButtonText}>{t("quiz.openLibrary")}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <EmptyPanel
            styles={styles}
            theme={theme}
            title={pairs.length ? t("folders.quizEmptyTitle") : t("quiz.emptyTitle")}
            body={pairs.length ? t("folders.quizEmptyBody") : t("quiz.emptyBody")}
            actionLabel={t("quiz.emptyAction")}
            onPress={() => handleTabChange("save")}
          />
        )}
    </View>
  );

  const renderHistoryTab = () => {
    const missedCards = todayMissedCards.length ? todayMissedCards : topMissedCards;
    const historySessionPreview = selectedHistorySessions.slice(0, 3);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = getLocalDayKey(yesterday);
    const yesterdaySessions = studyStats.sessions.filter((item) => getLocalDayKey(item.completedAt) === yesterdayKey);
    const yesterdaySolvedCount = yesterdaySessions.reduce((sum, item) => sum + (item.totalCards ?? 0), 0);
    const yesterdayIncorrectCount = yesterdaySessions.reduce((sum, item) => sum + (item.incorrectCount ?? 0), 0);
    const progressRatio = Math.min(1, todaySessionCount / DAILY_STUDY_GOAL);
    const progressPercent = Math.round(progressRatio * 100);
    const historyMetrics = [
      {
        key: "sessions",
        icon: "book-open-variant",
        value: todaySessionCount,
        label: t("history.sessions"),
        delta: todaySessionCount - yesterdaySessions.length,
        deltaKey: "history.sessionDelta",
        iconColor: theme.accent,
        trendTone: "good",
      },
      {
        key: "solved",
        icon: "check-circle",
        value: todaySolvedCount,
        label: t("history.solved"),
        delta: todaySolvedCount - yesterdaySolvedCount,
        deltaKey: "history.cardDelta",
        iconColor: theme.success,
        trendTone: "good",
      },
      {
        key: "incorrect",
        icon: "clock-outline",
        value: todayIncorrectCount,
        label: t("history.incorrect"),
        delta: todayIncorrectCount - yesterdayIncorrectCount,
        deltaKey: "history.cardDelta",
        iconColor: theme.danger,
        trendTone: "bad",
      },
    ];
    const renderMetricCard = (metric) => {
      const deltaSymbol = metric.delta === 0 ? "•" : metric.delta > 0 ? "▲" : "▼";
      const deltaValue = Math.abs(metric.delta);

      return (
        <View key={metric.key} style={styles.historyMetricCard}>
          <View style={[styles.historyMetricIcon, { backgroundColor: `${metric.iconColor}1F` }]}>
            <MaterialCommunityIcons name={metric.icon} size={18} color={metric.iconColor} />
          </View>
          <Text style={[styles.historyMetricValue, metric.key === "incorrect" && todayIncorrectCount > 0 && styles.historyMetricValueBad]}>
            {metric.value}
          </Text>
          <Text style={styles.historyMetricLabel}>{metric.label}</Text>
          <Text
            style={[
              styles.historyMetricTrend,
              metric.trendTone === "bad" ? styles.historyMetricTrendBad : styles.historyMetricTrendGood,
            ]}
          >
            {deltaSymbol} {t(metric.deltaKey, { count: deltaValue })}
          </Text>
        </View>
      );
    };
    const openHistoryCalendar = () => {
      setHistoryCalendarMonth(getStartOfLocalMonth(parseLocalDayKey(historyDateKey)));
      setHistoryCalendarOpen((currentValue) => !currentValue);
    };
    const openMissedCardsInLibrary = () => {
      setManageFolderId(ROOT_FOLDER_ID);
      setManageSort("missed");
      handleTabChange("manage");
    };
    const renderHistoryActionRow = (label, onPress) => (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.historyActionRow, pressed && styles.pressed]}>
        <Text style={styles.historyActionText}>{label}</Text>
        <MaterialCommunityIcons name="chevron-right" size={18} color={theme.textSecondary} />
      </Pressable>
    );
    const renderHistorySessionItem = (item, index, collection) => (
      <View key={item.id} style={styles.historyTimelineItem}>
        <View style={styles.historyTimelineRail}>
          <View style={[styles.historyTimelineDot, item.incorrectCount > 0 && styles.historyTimelineDotActive]} />
          {index < collection.length - 1 ? <View style={styles.historyTimelineLine} /> : null}
        </View>
        <View style={styles.historyItem}>
          <View style={styles.historyItemBody}>
            <Text style={styles.historyItemTitle}>{formatSessionLabelForLanguage(item.completedAt, language)}</Text>
            <Text style={styles.historyItemCaption}>
              {t("history.recentSessionCaption", {
                source: t(item.source === "retry" ? "quiz.sourceRetry" : "quiz.sourceAdaptive"),
                total: item.totalCards,
                correct: item.correctCount,
              })}
            </Text>
          </View>
          <View style={styles.historyItemSide}>
            <View style={[styles.historyBadge, item.incorrectCount > 0 && styles.historyBadgeBad]}>
              <Text style={[styles.historyBadgeText, item.incorrectCount > 0 && styles.historyBadgeTextBad]}>
                {t("history.incorrectBadge", { count: item.incorrectCount })}
              </Text>
            </View>
            {item.incorrectCount > 0 ? (
              <Pressable
                onPress={() => retryIncorrectCardsFromSession(item)}
                style={({ pressed }) => [
                  styles.historyRetryButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.historyRetryButtonText}>{t("history.retrySession")}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    );
    const renderMissedCardItem = (card) => {
      const matchingPair = pairs.find((pair) => createSignature(pair.left, pair.right) === card.signature);
      const folderLabel = getFolderLabel(normalizeFolderId(matchingPair?.folderId));
      const missCount = todayMissedCards.length ? card.count : card.incorrect ?? 0;
      const title = card.direction === "B_TO_A" ? card.right : card.left;

      return (
        <View key={`missed-${card.signature}`} style={styles.historyMissedCard}>
          <View style={styles.historyMissedIcon}>
            <MaterialCommunityIcons name="folder-outline" size={18} color={theme.accent} />
          </View>
          <View style={styles.historyItemBody}>
            <Text style={styles.historyMissedPath} numberOfLines={1} ellipsizeMode="tail">
              {folderLabel}
            </Text>
            <Text style={styles.historyItemTitle} numberOfLines={1} ellipsizeMode="tail">
              {title || card.left || card.right || card.signature}
            </Text>
            <Text style={styles.historyItemCaption}>
              {todayMissedCards.length
                ? t("history.todayMissedCaption", { count: missCount })
                : t("history.totalMissedCaption", {
                    incorrect: card.incorrect,
                    attempts: card.attempts,
                  })}
            </Text>
          </View>
          <View style={[styles.historyBadge, styles.historyBadgeBad]}>
            <Text style={[styles.historyBadgeText, styles.historyBadgeTextBad]}>
              {t("history.countTimes", { count: missCount })}
            </Text>
          </View>
        </View>
      );
    };

    return (
      <View style={styles.scene}>
        {hasStudyHistory ? (
          <>
            <View style={styles.historySummaryCard} {...tutorialTargetProps("history-summary-panel")}>
              <View style={styles.historySummaryHeader}>
                <View style={styles.historySummaryTitleRow}>
                  <Text style={styles.panelTitle}>{t("history.todayTitle")}</Text>
                  <Pressable
                    accessibilityLabel={t("history.helpTitle")}
                    onPress={() => Alert.alert(t("history.helpTitle"), t("history.helpBody"))}
                    style={({ pressed }) => [styles.historyHelpButton, pressed && styles.pressed]}
                  >
                    <MaterialCommunityIcons name="help-circle-outline" size={18} color={theme.textSecondary} />
                  </Pressable>
                </View>
                <Text style={styles.panelBody}>{t("history.todayBody")}</Text>
              </View>
              <View style={styles.historySummaryGrid}>
                {historyMetrics.map(renderMetricCard)}
              </View>
              <View style={styles.historyProgressCard}>
                <View style={styles.historyProgressHeader}>
                  <Text style={styles.historyProgressTitle}>{t("history.progressTitle")}</Text>
                  <Text style={styles.historyProgressPercent}>{progressPercent}%</Text>
                </View>
                <View style={styles.historyProgressTrack}>
                  <View style={[styles.historyProgressFill, { width: `${progressPercent}%` }]} />
                </View>
                <View style={styles.historyProgressFooter}>
                  <Text style={styles.historyDateSummary}>
                    {t("history.goalStatus", {
                      goal: DAILY_STUDY_GOAL,
                      count: Math.min(todaySessionCount, DAILY_STUDY_GOAL),
                    })}
                  </Text>
                  <Text style={styles.historyGoalChip}>{t("history.goalSetting")}</Text>
                </View>
              </View>
            </View>

            <View style={styles.libraryPanel}>
              <View style={styles.historyRecentTutorialTarget} {...tutorialTargetProps("history-recent-panel")}>
                <View style={styles.panelHeader}>
                  <View style={styles.panelHeaderText}>
                    <Text style={styles.panelTitle}>{t("history.recentSessions")}</Text>
                    <Text style={styles.historyDateSummary}>
                      {t("history.selectedDateSummary", {
                        date: formatHistoryDateFilterLabel(historyDateKey, language, t),
                        count: selectedHistorySessionCount,
                      })}
                    </Text>
                  </View>
                  <Pressable
                    onPress={openHistoryCalendar}
                    style={({ pressed }) => [
                      styles.historyCalendarButton,
                      historyCalendarOpen && styles.historyCalendarButtonActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="calendar-month-outline"
                      size={22}
                      color={historyCalendarOpen ? theme.accentText : theme.accent}
                    />
                  </Pressable>
                </View>
                {historyCalendarOpen ? (
                  <View style={styles.historyCalendarPanel}>
                    <View style={styles.historyCalendarHeader}>
                      <Pressable
                        onPress={() => setHistoryCalendarMonth((currentMonth) => addLocalMonths(currentMonth, -1))}
                        style={({ pressed }) => [styles.historyCalendarNavButton, pressed && styles.pressed]}
                      >
                        <MaterialCommunityIcons name="chevron-left" size={22} color={theme.textSecondary} />
                      </Pressable>
                      <Text style={styles.historyCalendarMonthText}>
                        {formatCalendarMonthLabel(historyCalendarMonth, language)}
                      </Text>
                      <Pressable
                        onPress={() => setHistoryCalendarMonth((currentMonth) => addLocalMonths(currentMonth, 1))}
                        style={({ pressed }) => [styles.historyCalendarNavButton, pressed && styles.pressed]}
                      >
                        <MaterialCommunityIcons name="chevron-right" size={22} color={theme.textSecondary} />
                      </Pressable>
                    </View>

                    <View style={styles.historyCalendarWeekRow}>
                      {(CALENDAR_WEEKDAY_LABELS[language] ?? CALENDAR_WEEKDAY_LABELS.en).map((weekday) => (
                        <Text key={weekday} style={styles.historyCalendarWeekText}>
                          {weekday}
                        </Text>
                      ))}
                    </View>

                    <View style={styles.historyCalendarGrid}>
                      {historyCalendarCells.map((cell) => {
                        const selected = cell.dayKey === historyDateKey;
                        const today = cell.dayKey === todayKey;

                        return (
                          <Pressable
                            key={cell.dayKey}
                            onPress={() => {
                              setHistoryDateKey(cell.dayKey);
                              setHistoryCalendarOpen(false);
                            }}
                            style={({ pressed }) => [
                              styles.historyCalendarDay,
                              !cell.inMonth && styles.historyCalendarDayMuted,
                              today && styles.historyCalendarDayToday,
                              selected && styles.historyCalendarDaySelected,
                              pressed && styles.pressed,
                            ]}
                          >
                            <Text
                              style={[
                                styles.historyCalendarDayText,
                                !cell.inMonth && styles.historyCalendarDayTextMuted,
                                selected && styles.historyCalendarDayTextSelected,
                              ]}
                            >
                              {cell.date.getDate()}
                            </Text>
                            {cell.count > 0 ? (
                              <Text
                                style={[
                                  styles.historyCalendarCountText,
                                  selected && styles.historyCalendarCountTextSelected,
                                ]}
                              >
                                {t("history.calendarSessionCount", { count: cell.count })}
                              </Text>
                            ) : null}
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ) : null}
                <View style={styles.historyTimeline}>
                  {historySessionPreview.length ? (
                    historySessionPreview.map(renderHistorySessionItem)
                  ) : (
                    <Text style={styles.historyEmptyText}>{t("history.noSessionsForDate")}</Text>
                  )}
                </View>
                {renderHistoryActionRow(t("history.viewAllHistory"), openHistoryCalendar)}
              </View>
            </View>

            <View style={styles.libraryPanel} {...tutorialTargetProps("history-missed-panel")}>
              <View style={styles.panelHeader}>
                <Text style={styles.panelTitle}>{todayMissedCards.length ? t("history.todayMissed") : t("history.topMissed")}</Text>
                <Text style={styles.historyChipText}>{todayMissedCards.length ? t("history.todayBasis") : t("history.totalBasis")}</Text>
              </View>
              <View style={styles.historyList}>
                {missedCards.length ? (
                  missedCards.slice(0, 3).map(renderMissedCardItem)
                ) : (
                  <Text style={styles.historyEmptyText}>{t("history.noMissed")}</Text>
                )}
              </View>
              {renderHistoryActionRow(t("history.viewAllMissed"), openMissedCardsInLibrary)}
            </View>
          </>
        ) : (
          <View {...tutorialTargetProps("history-summary-panel")}>
            <EmptyPanel
              styles={styles}
              theme={theme}
              icon="chart-line"
              title={t("history.emptyTitle")}
              body={t("history.emptyBody")}
              actionLabel={t("history.emptyAction")}
              onPress={() => handleTabChange("quiz")}
            />
          </View>
        )}
      </View>
    );
  };

  const closeManageSwipe = (pairId) => {
    manageSwipeRefs.current[pairId]?.scrollTo({ x: 0, animated: true });
    setOpenManageSwipeId((currentId) => (currentId === pairId ? null : currentId));
  };

  const toggleManageSwipe = (pairId) => {
    const shouldOpen = openManageSwipeId !== pairId;

    if (openManageSwipeId && openManageSwipeId !== pairId) {
      manageSwipeRefs.current[openManageSwipeId]?.scrollTo({ x: 0, animated: true });
    }

    manageSwipeRefs.current[pairId]?.scrollTo({ x: shouldOpen ? 152 : 0, animated: true });
    setOpenManageSwipeId(shouldOpen ? pairId : null);
  };

  const syncManageSwipeState = (pairId, event) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    setOpenManageSwipeId((currentId) => {
      if (offsetX > 64) {
        return pairId;
      }

      return currentId === pairId ? null : currentId;
    });
  };

  const renderManagePairCard = (pair, index) => {
    const targetProps = index === 0 ? tutorialTargetProps("manage-first-card") : {};
    const beginEdit = () => {
      closeManageSwipe(pair.id);
      setEditingId(pair.id);
      setEditingLeft(pair.left);
      setEditingRight(pair.right);
      setEditingFolderId(normalizeFolderId(pair.folderId));
    };
    const confirmDelete = () =>
      Alert.alert(t("manage.deleteTitle"), t("manage.deleteBody"), [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => {
            closeManageSwipe(pair.id);
            void removePair(pair);
          },
        },
      ]);

    if (editingId === pair.id) {
      return (
        <View key={pair.id} style={styles.manageCard} {...targetProps}>
          <Text style={styles.inputLabel}>{t("common.front")}</Text>
          <TextInput
            value={editingLeft}
            onChangeText={setEditingLeft}
            placeholder={t("common.front")}
            placeholderTextColor={theme.textPlaceholder}
            style={[styles.input, styles.multilineInput]}
            multiline
            textAlignVertical="top"
          />

          <Text style={styles.inputLabel}>{t("common.back")}</Text>
          <TextInput
            value={editingRight}
            onChangeText={setEditingRight}
            placeholder={t("common.back")}
            placeholderTextColor={theme.textPlaceholder}
            style={[styles.input, styles.multilineInput]}
            multiline
            textAlignVertical="top"
          />

          <Text style={styles.inputLabel}>{t("folders.cardLocation")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.folderPickerRow}>
            {selectableFolders.map((folder) => {
              const active = normalizeFolderId(editingFolderId) === folder.id;

              return (
                <Pressable
                  key={folder.id}
                  onPress={() => setEditingFolderId(folder.id)}
                  style={({ pressed }) => [
                    styles.folderPickerChip,
                    active && styles.folderPickerChipActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.folderPickerText, active && styles.folderPickerTextActive]}>
                    {folder.id === ROOT_FOLDER_ID ? folder.name : getFolderLabel(folder.id)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.manageActionRow}>
            <Pressable onPress={() => void saveEdit()} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
              <Text style={styles.primaryButtonText}>{t("manage.saveEdit")}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setEditingId(null);
                setEditingLeft("");
                setEditingRight("");
                setEditingFolderId(ROOT_FOLDER_ID);
              }}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.secondaryButtonText}>{t("common.cancel")}</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return (
      <View key={pair.id} style={styles.manageSwipeShell} {...targetProps}>
        <ScrollView
          ref={(node) => {
            if (node) {
              manageSwipeRefs.current[pair.id] = node;
              return;
            }

            delete manageSwipeRefs.current[pair.id];
          }}
          horizontal
          bounces={false}
          showsHorizontalScrollIndicator={false}
          snapToOffsets={[0, 152]}
          decelerationRate="fast"
          overScrollMode="never"
          onMomentumScrollEnd={(event) => syncManageSwipeState(pair.id, event)}
          onScrollEndDrag={(event) => syncManageSwipeState(pair.id, event)}
          contentContainerStyle={styles.manageSwipeTrack}
        >
          <View style={[styles.manageCard, styles.manageSwipeCard, styles.manageListCard, { width: manageSwipeCardWidth }]}>
            <View style={styles.managePairInlineRow}>
              <View style={styles.managePairColumn}>
                <View style={styles.manageTextBlock}>
                  <Text style={styles.managePairText} numberOfLines={1} ellipsizeMode="tail">
                    {pair.left}
                  </Text>
                </View>
              </View>
              <View style={styles.managePairSeparator}>
                <MaterialCommunityIcons name="swap-horizontal" size={15} color={theme.textSecondary} />
              </View>
              <View style={styles.managePairColumn}>
                <View style={styles.manageTextBlock}>
                  <Text style={styles.managePairText} numberOfLines={1} ellipsizeMode="tail">
                    {pair.right}
                  </Text>
                </View>
              </View>
              <Pressable
                accessibilityLabel={t("manage.openActions")}
                onPress={() => toggleManageSwipe(pair.id)}
                style={({ pressed }) => [styles.manageSwipeHint, pressed && styles.pressed]}
              >
                <MaterialCommunityIcons name="format-list-bulleted" size={20} color={theme.textSecondary} />
              </Pressable>
            </View>
          </View>
          <View style={styles.manageSwipeActions}>
            <Pressable
              onPress={beginEdit}
              style={({ pressed }) => [styles.manageSwipeAction, styles.manageSwipeEditAction, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons name="pencil-outline" size={20} color={theme.accentText} />
              <Text style={styles.manageSwipeActionText}>{t("manage.edit")}</Text>
            </Pressable>
            <Pressable
              onPress={confirmDelete}
              style={({ pressed }) => [styles.manageSwipeAction, styles.manageSwipeDeleteAction, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons name="trash-can-outline" size={20} color={theme.accentText} />
              <Text style={styles.manageSwipeActionText}>{t("common.delete")}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  };

  const renderManageTab = () => (
    <View style={styles.scene}>
      {renderFolderExplorer({
        currentFolderId: manageFolderId,
        onSelectFolder: selectManageFolder,
        allowCreate: true,
        scope: "manage",
      })}

      {manageFolderPairs.length ? (
        <View style={[styles.libraryPanel, styles.manageListPanel]} {...tutorialTargetProps("manage-list-panel")}>
          <View style={styles.manageListHeader}>
            <Text style={styles.panelTitle}>{t("manage.listTitle")}</Text>
            <Text style={styles.panelBody}>{t("manage.listBody")}</Text>
          </View>
          <View style={styles.manageListDivider} />
          {sortedManagePairs.map(renderManagePairCard)}
        </View>
      ) : (
        <EmptyPanel
          styles={styles}
          theme={theme}
          icon="playlist-remove"
          title={pairs.length ? t("folders.manageEmptyTitle") : t("manage.emptyTitle")}
          body={pairs.length ? t("folders.manageEmptyBody") : t("manage.emptyBody")}
          actionLabel={t("manage.emptyAction")}
          onPress={() => handleTabChange("save")}
        />
      )}
    </View>
  );

  const renderAboutTab = () => (
    <View style={styles.scene}>
      <View style={styles.aboutStack}>
        <View style={styles.syncStrip}>
          <View style={styles.syncLead}>
            <View style={styles.syncIconWrap}>
              <MaterialCommunityIcons
                name={session?.user ? "google" : "cloud-outline"}
                size={18}
                color={theme.iconContrast}
              />
            </View>
            <View style={styles.flex}>
              <Text style={styles.syncTitle}>{authTitle}</Text>
              <Text style={styles.syncCaption}>{authCaption}</Text>
              {isAdmin ? (
                <View style={styles.adminRoleBadge}>
                  <Text style={styles.adminRoleBadgeText}>{t("about.roleAdmin")}</Text>
                </View>
              ) : null}
            </View>
          </View>
          <Pressable
            disabled={authBusy || !authReady}
            onPress={session?.user ? signOut : login}
            style={({ pressed }) => [
              styles.syncButton,
              (!isSupabaseConfigured || authBusy || !authReady) && styles.syncButtonMuted,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.syncButtonText,
                (!isSupabaseConfigured || authBusy || !authReady) && styles.syncButtonTextMuted,
              ]}
            >
              {!isSupabaseConfigured
                ? t("about.authSetupNeeded")
                : session?.user
                  ? authBusy
                    ? t("about.authWorking")
                    : t("about.authLogout")
                  : authBusy
                    ? t("about.authConnecting")
                    : t("about.authGoogle")}
            </Text>
          </Pressable>
        </View>

        <View style={styles.settingsCard}>
          <View style={styles.settingsHeader}>
            <Text style={styles.settingsTitle}>{t("about.themeTitle")}</Text>
          </View>

          <View style={styles.modeSwitchRow}>
            {THEME_OPTIONS.map((option) => {
              const active = themeMode === option.key;

              return (
                <Pressable
                  key={option.key}
                  onPress={() => setThemeMode(option.key)}
                  style={({ pressed }) => [
                    styles.modeChip,
                    active && styles.modeChipActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <MaterialCommunityIcons
                    name={option.icon}
                    size={16}
                    color={active ? theme.accentText : theme.textSecondary}
                  />
                  <Text style={[styles.modeChipText, active && styles.modeChipTextActive]}>
                    {t(option.labelKey)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.settingsCard}>
          <View style={styles.settingsHeader}>
            <Text style={styles.settingsTitle}>{t("about.languageTitle")}</Text>
          </View>

          <View style={styles.supportCategoryRow}>
            {LANGUAGE_OPTIONS.map((option) => {
              const active = language === option.key;

              return (
                <Pressable
                  key={option.key}
                  onPress={() => setLanguage(option.key)}
                  style={({ pressed }) => [
                    styles.supportCategoryChip,
                    active && styles.supportCategoryChipActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.supportCategoryChipText,
                      active && styles.supportCategoryChipTextActive,
                    ]}
                  >
                    {option.nativeLabel}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.settingsCard} {...tutorialTargetProps("about-support-panel")}>
          <View style={styles.aboutSupportTutorialTarget}>
            <View style={styles.settingsHeader}>
              <Text style={styles.settingsTitle}>{t("about.supportTitle")}</Text>
              <Text style={styles.settingsBody}>{t("about.supportBody")}</Text>
            </View>

            <View style={styles.supportForm}>
              <View style={styles.supportField}>
                <Text style={styles.supportLabel}>{t("about.supportCategoryLabel")}</Text>
                <View style={styles.supportCategoryRow}>
                  {SUPPORT_CATEGORY_OPTIONS.map((option) => {
                    const active = supportCategory === option;

                    return (
                      <Pressable
                        key={option}
                        onPress={() => setSupportCategory(option)}
                        style={({ pressed }) => [
                          styles.supportCategoryChip,
                          active && styles.supportCategoryChipActive,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.supportCategoryChipText,
                            active && styles.supportCategoryChipTextActive,
                          ]}
                        >
                          {t(`supportCategories.${option}`)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.supportField}>
                <Text style={styles.supportLabel}>{t("about.supportEmailLabel")}</Text>
                <TextInput
                  value={supportReplyEmail}
                  onChangeText={setSupportReplyEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder={t("about.supportEmailPlaceholder")}
                  placeholderTextColor={theme.textPlaceholder}
                  style={styles.input}
                />
              </View>

              <View style={styles.supportField}>
                <Text style={styles.supportLabel}>{t("about.supportMessageLabel")}</Text>
                <TextInput
                  value={supportMessage}
                  onChangeText={setSupportMessage}
                  multiline
                  textAlignVertical="top"
                  placeholder={t("about.supportMessagePlaceholder")}
                  placeholderTextColor={theme.textPlaceholder}
                  style={[styles.input, styles.supportMessageInput]}
                />
              </View>
            </View>

            {supportNotice ? <Text style={styles.supportNotice}>{supportNotice}</Text> : null}

            <Pressable
              disabled={supportSending}
              onPress={() => void submitSupportRequest()}
              style={({ pressed }) => [
                styles.primaryButton,
                supportSending && styles.primaryButtonDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[
                  styles.primaryButtonText,
                  supportSending && styles.primaryButtonTextDisabled,
                ]}
              >
                {supportSending ? t("about.supportSending") : t("about.supportSend")}
              </Text>
            </Pressable>
          </View>

          {latestSupportRequests.length ? (
            <View style={styles.supportHistory}>
              <Text style={styles.supportHistoryTitle}>{t("about.supportRecent")}</Text>
              {latestSupportRequests.map((item) => (
                <View key={item.id} style={styles.supportHistoryItem}>
                  <View style={styles.supportHistoryMeta}>
                    <View style={styles.supportHistoryLead}>
                      <Text style={styles.supportHistoryCategory}>{t(`supportCategories.${normalizeSupportCategory(item.category)}`)}</Text>
                      <Text style={styles.supportHistoryStatus}>{t(`supportStatuses.${normalizeSupportStatus(item.status)}`)}</Text>
                    </View>
                    <Text style={styles.supportHistoryDate}>{formatDateTimeForLanguage(item.createdAt, language)}</Text>
                  </View>
                  <Text style={styles.supportHistoryEmail}>{item.replyEmail}</Text>
                  <Text style={styles.supportHistoryMessage} numberOfLines={3}>
                    {item.message}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.settingsCard}>
          <View style={styles.settingsHeader}>
            <Text style={styles.settingsTitle}>{t("about.tutorialTitle")}</Text>
          </View>
          <View style={styles.supportCategoryRow}>
            <Pressable
              onPress={openTutorial}
              style={({ pressed }) => [styles.supportCategoryChip, pressed && styles.pressed]}
            >
              <Text style={styles.supportCategoryChipText}>{t("about.tutorialAgain")}</Text>
            </Pressable>
          </View>
        </View>

        {isAdmin ? (
          <>
            <View style={styles.settingsCard}>
              <View style={styles.settingsHeader}>
                <Text style={styles.settingsTitle}>{t("about.adminMetricsTitle")}</Text>
                <Text style={styles.settingsBody}>{t("about.adminMetricsBody")}</Text>
              </View>

              <View style={styles.adminMetricsGrid}>
                {adminMetricCards.map((item) => (
                  <View key={item.key} style={styles.adminMetricCard}>
                    <Text style={styles.adminMetricValue}>{item.value}</Text>
                    <Text style={styles.adminMetricLabel}>{item.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.settingsCard}>
              <View style={styles.settingsHeaderRow}>
                <View style={styles.flex}>
                  <Text style={styles.settingsTitle}>{t("about.adminTitle")}</Text>
                  <Text style={styles.settingsBody}>{t("about.adminBody")}</Text>
                </View>

                <Pressable
                  disabled={adminLoading}
                  onPress={() =>
                    void refreshAdminDashboard({
                      openOnly: adminOnlyUnresolved,
                    })
                  }
                  style={({ pressed }) => [
                    styles.inlineActionButton,
                    adminLoading && styles.primaryButtonDisabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.inlineActionButtonText}>
                    {adminLoading ? t("about.adminLoadingShort") : t("about.adminRefresh")}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.supportCategoryRow}>
                {[
                  { key: "received", label: t("supportStatuses.received") },
                  { key: "reviewing", label: t("supportStatuses.reviewing") },
                  { key: "unresolved", label: t("about.adminFilterUnresolved") },
                ].map((status) => (
                  <View key={status.key} style={styles.adminSummaryChip}>
                    <Text style={styles.adminSummaryLabel}>{status.label}</Text>
                    <Text style={styles.adminSummaryValue}>{adminSupportCounts[status.key] ?? 0}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.supportField}>
                <Text style={styles.supportLabel}>{t("about.adminFilterTitle")}</Text>
                <View style={styles.supportCategoryRow}>
                  <Pressable
                    onPress={() => setAdminOnlyUnresolved(false)}
                    style={({ pressed }) => [
                      styles.supportCategoryChip,
                      !adminOnlyUnresolved && styles.supportCategoryChipActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.supportCategoryChipText,
                        !adminOnlyUnresolved && styles.supportCategoryChipTextActive,
                      ]}
                    >
                      {t("about.adminFilterAll")}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setAdminOnlyUnresolved(true)}
                    style={({ pressed }) => [
                      styles.supportCategoryChip,
                      adminOnlyUnresolved && styles.supportCategoryChipActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.supportCategoryChipText,
                        adminOnlyUnresolved && styles.supportCategoryChipTextActive,
                      ]}
                    >
                      {t("about.adminFilterUnresolved")}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {adminNotice ? <Text style={styles.supportNotice}>{adminNotice}</Text> : null}

              {latestAdminSupportRequests.length ? (
                <View style={styles.supportHistory}>
                  {latestAdminSupportRequests.map((item) => {
                    const currentStatus = normalizeSupportStatus(item.status);

                    return (
                      <View key={item.id} style={styles.supportHistoryItem}>
                        <View style={styles.supportHistoryMeta}>
                          <View style={styles.supportHistoryLead}>
                            <Text style={styles.supportHistoryCategory}>
                              {t(`supportCategories.${normalizeSupportCategory(item.category)}`)}
                            </Text>
                            <Text style={styles.supportHistoryStatus}>
                              {t(`supportStatuses.${currentStatus}`)}
                            </Text>
                          </View>
                          <Text style={styles.supportHistoryDate}>
                            {formatDateTimeForLanguage(item.createdAt, language)}
                          </Text>
                        </View>

                        <Text style={styles.supportHistoryEmail}>
                          {t("about.adminReplyEmail")}: {item.replyEmail}
                        </Text>
                        {item.userEmail ? (
                          <Text style={styles.supportHistorySubtle}>
                            {t("about.adminAccount")}: {item.userEmail}
                          </Text>
                        ) : null}
                        <Text style={styles.supportHistoryMessage} numberOfLines={4}>
                          {item.message}
                        </Text>

                        <View style={styles.supportCategoryRow}>
                          {SUPPORT_STATUS_OPTIONS.map((status) => {
                            const active = currentStatus === status;

                            return (
                              <Pressable
                                key={`${item.id}-${status}`}
                                disabled={adminUpdatingId === item.id}
                                onPress={() => void updateAdminSupportStatus(item.id, status)}
                                style={({ pressed }) => [
                                  styles.supportCategoryChip,
                                  active && styles.supportCategoryChipActive,
                                  adminUpdatingId === item.id && styles.primaryButtonDisabled,
                                  pressed && styles.pressed,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.supportCategoryChipText,
                                    active && styles.supportCategoryChipTextActive,
                                  ]}
                                >
                                  {t(`supportStatuses.${status}`)}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.settingsBody}>
                  {adminLoading ? t("about.adminLoading") : t("about.adminEmpty")}
                </Text>
              )}
            </View>
          </>
        ) : null}
      </View>
    </View>
  );

  return (
    <SafeAreaView ref={appRootRef} collapsable={false} style={styles.safeArea}>
      <StatusBar barStyle={theme.statusBarStyle} backgroundColor={theme.statusBarBg} />

      <View pointerEvents="none" style={styles.backgroundLayer}>
        <View style={styles.backgroundOrbPrimary} />
        <View style={styles.backgroundOrbSecondary} />
        {STAR_FIELD.map((star, index) => (
          <View
            key={`star-${index}`}
            style={[
              styles.star,
              {
                top: star.top,
                left: star.left,
                right: star.right,
                width: star.size,
                height: star.size,
                borderRadius: star.size / 2,
                opacity: star.opacity,
              },
            ]}
          />
        ))}
      </View>

      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.content, { paddingTop: contentTopPadding }]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!guidedTutorialActive}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => queueTutorialTargetMeasure(currentTutorialStep?.targetKey)}
          onMomentumScrollEnd={() => queueTutorialTargetMeasure(currentTutorialStep?.targetKey)}
          onScrollEndDrag={() => queueTutorialTargetMeasure(currentTutorialStep?.targetKey)}
        >
          <View style={[styles.contentShell, contentMaxWidth ? { maxWidth: contentMaxWidth } : null]}>
            {tab === "save" ? renderSaveTab() : null}
            {tab === "quiz" ? renderQuizTab() : null}
            {tab === "history" ? renderHistoryTab() : null}
            {tab === "manage" ? renderManageTab() : null}
            {tab === "about" ? renderAboutTab() : null}
          </View>
        </ScrollView>

        {renderSaveFloatingAdd()}

        <View
          style={[
            styles.tabs,
            tabBarWidth
              ? {
                  width: tabBarWidth,
                  left: tabBarLeft,
                  right: undefined,
                }
              : null,
          ]}
        >
          {TABS.map((item) => {
            const active = tab === item.key;
            const tutorialTarget =
              guidedTutorialActive &&
              ((currentTutorialStep?.type === "tab" &&
                currentTutorialStep.tab === item.key) ||
                currentTutorialStep?.waitForTab === item.key);

            return (
              <Pressable
                key={item.key}
                disabled={guidedTutorialActive && !tutorialTarget}
                onPress={() => handleTabChange(item.key)}
                style={({ pressed }) => [
                  styles.tab,
                  tutorialTarget && styles.tabTutorialTarget,
                  active && styles.tabActive,
                  pressed && styles.pressed,
                ]}
              >
                <MaterialCommunityIcons
                  name={item.icon}
                  size={22}
                  color={active ? theme.iconContrast : tutorialTarget ? theme.accent : theme.textSecondary}
                />
                <Text
                  style={[
                    styles.tabText,
                    tutorialTarget && styles.tabTextTutorialTarget,
                    active && styles.tabTextActive,
                  ]}
                >
                  {t(item.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </KeyboardAvoidingView>

      {launchVisible ? (
        <LaunchScreen opacity={launchOpacity} scale={launchScale} glow={moonGlow} styles={styles} />
      ) : null}
      {tutorialVisible && tutorialStep === "intro" ? (
        <TutorialOverlay
          styles={styles}
          theme={theme}
          t={t}
          maxWidth={tutorialMaxWidth}
          onClose={() => closeTutorial()}
          onStart={startGuidedTutorial}
        />
      ) : null}
      {guidedTutorialActive && displayedTutorialStep ? (
        <TutorialCoach
          step={displayedTutorialStep}
          styles={styles}
          theme={theme}
          t={t}
          maxWidth={tutorialMaxWidth}
          screenWidth={screenWidth}
          screenHeight={screenHeight}
          targetRect={tutorialTargetRect}
          tabBarWidth={tabBarWidth}
          tabBarLeft={tabBarLeft}
          onClose={() => closeTutorial()}
          onNext={advanceTutorial}
          onSaveDemo={saveTutorialCard}
          onTargetTabPress={handleTabChange}
        />
      ) : null}
    </SafeAreaView>
  );
}

function EmptyPanel({ icon, title, body, actionLabel, onPress, styles, theme }) {
  return (
    <View style={styles.emptyPanel}>
      {icon ? (
        <View style={styles.emptyIconWrap}>
          <MaterialCommunityIcons name={icon} size={22} color={theme.accent} />
        </View>
      ) : null}
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {actionLabel && onPress ? (
        <Pressable onPress={onPress} style={({ pressed }) => [styles.secondaryButton, styles.emptyAction, pressed && styles.pressed]}>
          <Text style={styles.secondaryButtonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function TutorialOverlay({ styles, theme, t, onClose, onStart, maxWidth }) {
  const messages = [
    { text: t("tutorial.messageHello") },
    { text: t("tutorial.messageEfficiency") },
    { text: t("tutorial.messageIntro") },
  ];
  const [visibleMessageCount, setVisibleMessageCount] = useState(1);

  const choicesReady = visibleMessageCount >= messages.length;
  const showNextMessage = () => {
    setVisibleMessageCount((currentCount) => Math.min(messages.length, currentCount + 1));
  };

  return (
    <View style={styles.tutorialOverlay}>
      <View pointerEvents="none" style={styles.tutorialIntroDecor}>
        <View style={styles.backgroundOrbPrimary} />
        <View style={styles.backgroundOrbSecondary} />
        {STAR_FIELD.map((star, index) => (
          <View
            key={`tutorial-star-${index}`}
            style={[
              styles.star,
              {
                top: star.top,
                left: star.left,
                right: star.right,
                width: star.size,
                height: star.size,
                borderRadius: star.size / 2,
                opacity: star.opacity,
              },
            ]}
          />
        ))}
      </View>
      <Pressable
        style={styles.tutorialTapArea}
        onPress={showNextMessage}
        disabled={choicesReady}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.tutorialScrollContent,
            maxWidth ? { maxWidth, alignSelf: "center", width: "100%" } : null,
          ]}
        >
          <View style={styles.tutorialHeader}>
            <Text style={styles.tutorialTitle}>{t("tutorial.title")}</Text>
            <Text style={styles.tutorialCaption}>{t("tutorial.caption")}</Text>
          </View>

          <View style={styles.tutorialChat}>
            {messages.slice(0, visibleMessageCount).map((message, index) => (
              <View key={`intro-message-${index}`} style={styles.tutorialMessageRow}>
                <View style={styles.tutorialBubble}>
                  <View style={styles.tutorialBubbleTail} />
                  <Text style={styles.tutorialBubbleText}>{message.text}</Text>
                </View>
              </View>
            ))}
            {!choicesReady ? (
              <Text style={styles.tutorialTapHint}>{t("tutorial.tapToContinue")}</Text>
            ) : null}
          </View>
        </ScrollView>
      </Pressable>

      <View style={styles.tutorialBottomSheet}>
        <View style={styles.tutorialActionRow}>
          <Pressable
            onPress={onClose}
            disabled={!choicesReady}
            style={({ pressed }) => [
              styles.secondaryButton,
              styles.tutorialActionButton,
              !choicesReady && styles.secondaryButtonDisabled,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.secondaryButtonText,
                styles.tutorialChoiceText,
                !choicesReady && styles.secondaryButtonTextDisabled,
              ]}
            >
              {t("tutorial.alreadyKnow")}
            </Text>
          </Pressable>
          <Pressable
            onPress={onStart}
            disabled={!choicesReady}
            style={({ pressed }) => [
              styles.primaryButton,
              styles.tutorialActionButton,
              !choicesReady && styles.primaryButtonDisabled,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.primaryButtonText,
                styles.tutorialChoiceText,
                !choicesReady && styles.primaryButtonTextDisabled,
              ]}
            >
              {t("tutorial.like")}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function TutorialCoach({
  step,
  styles,
  theme,
  t,
  onClose,
  onNext,
  onSaveDemo,
  onTargetTabPress,
  maxWidth,
  screenWidth,
  screenHeight,
  targetRect,
  tabBarWidth,
  tabBarLeft,
}) {
  const isTabStep = step.type === "tab";
  const isSaveDemo = step.type === "save-demo";
  const isSpotlightStep =
    step.type === "spotlight" ||
    step.type === "practice" ||
    step.type === "target-press";
  const targetTabLabel = t(`tabs.${step.waitForTab ?? step.tab}`);
  const tabIndex = Math.max(
    TABS.findIndex((item) => item.key === step.tab),
    0
  );
  const tabTailLeft = `${12 + tabIndex * 19}%`;
  const safeScreenWidth = screenWidth || 390;
  const safeScreenHeight = screenHeight || 844;
  const spotlightPadding = step.spotlightPadding ?? 0;
  const spotlightRect = targetRect
    ? (() => {
        const left = Math.max(12, targetRect.x - spotlightPadding);
        const top = Math.max(0, targetRect.y - spotlightPadding);
        const right = Math.max(12, safeScreenWidth - targetRect.x - targetRect.width - spotlightPadding);
        const bottom = Math.max(0, safeScreenHeight - targetRect.y - targetRect.height - spotlightPadding);

        return {
          left,
          top,
          width: Math.max(0, safeScreenWidth - left - right),
          height: Math.max(0, safeScreenHeight - top - bottom),
          right,
          bottom,
        };
      })()
    : null;
  const bubbleWidth = Math.min(maxWidth ?? safeScreenWidth - 40, safeScreenWidth - 40);
  const bubbleLeft = Math.max(20, (safeScreenWidth - bubbleWidth) / 2);
  const targetBottom = spotlightRect ? spotlightRect.top + spotlightRect.height : safeScreenHeight * 0.48;
  const bubbleGap = step.bubbleGap ?? 18;
  const bubbleEstimatedHeight = step.bubbleHeight ?? 250;
  const bubbleBottomInset = Platform.OS === "android" ? 126 : 104;
  const bubbleTopMax = Math.max(18, safeScreenHeight - bubbleEstimatedHeight - bubbleBottomInset);
  const placeBubbleAbove =
    spotlightRect &&
    safeScreenHeight - targetBottom < bubbleEstimatedHeight + bubbleBottomInset &&
    spotlightRect.top > bubbleEstimatedHeight + 18;
  const bubbleTop = placeBubbleAbove
    ? Math.max(18, spotlightRect.top - bubbleEstimatedHeight - 12)
    : Math.min(bubbleTopMax, targetBottom + bubbleGap);
  const targetCenterX = spotlightRect ? spotlightRect.left + spotlightRect.width / 2 : 64;
  const tailLeft = Math.max(28, Math.min(bubbleWidth - 44, targetCenterX - bubbleLeft - 12));
  const spotlightRadius = spotlightRect
    ? Math.min(
        step.spotlightRadius === "pill"
          ? Math.min(spotlightRect.width, spotlightRect.height) / 2
          : typeof step.spotlightRadius === "number"
            ? step.spotlightRadius
            : Math.max(16, Math.min(spotlightRect.width, spotlightRect.height) / 4),
        spotlightRect.width / 2,
        spotlightRect.height / 2
      )
    : 0;
  const [demoFront, setDemoFront] = useState("");
  const [demoBack, setDemoBack] = useState("");
  const [savingDemo, setSavingDemo] = useState(false);
  const waitsForManualInteraction =
    step.type === "practice" ||
    step.type === "target-press" ||
    Boolean(step.waitForTab) ||
    Boolean(step.waitForNextTap);
  const waitingLabelKey = step.waitingKey ?? (
    step.type === "practice" ? "tutorial.waitingSave" : "tutorial.waitingTap"
  );
  const waitingLabel = step.waitForTab || isTabStep
    ? t("tutorial.tapTabHint", { tab: targetTabLabel })
    : t(waitingLabelKey);
  const showSpotlightActions = !(waitsForManualInteraction && step.hideWaitingPill);
  const renderWaitingPill = (pressable = false) => {
    if (pressable) {
      return (
        <Pressable
          onPress={onNext}
          style={({ pressed }) => [
            styles.tutorialCoachWaitingPill,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.tutorialCoachWaitingText}>{waitingLabel}</Text>
        </Pressable>
      );
    }

    return (
      <View style={styles.tutorialCoachWaitingPill}>
        <Text style={styles.tutorialCoachWaitingText}>{waitingLabel}</Text>
      </View>
    );
  };

  const saveDemoCard = async () => {
    if (!onSaveDemo || savingDemo) {
      return;
    }

    setSavingDemo(true);

    try {
      const saved = await onSaveDemo({ left: demoFront, right: demoBack });

      if (saved) {
        setDemoFront("");
        setDemoBack("");
        onNext();
      }
    } finally {
      setSavingDemo(false);
    }
  };

  if (isSpotlightStep) {
    return (
      <View pointerEvents="box-none" style={styles.tutorialSpotlightLayer}>
        {spotlightRect ? (
          <>
            <Pressable style={[styles.tutorialScrimBlock, { top: 0, left: 0, right: 0, height: spotlightRect.top }]} onPress={() => {}} />
            <Pressable
              style={[
                styles.tutorialScrimBlock,
                {
                  top: spotlightRect.top,
                  left: 0,
                  width: spotlightRect.left,
                  height: spotlightRect.height,
                },
              ]}
              onPress={() => {}}
            />
            <Pressable
              style={[
                styles.tutorialScrimBlock,
                {
                  top: spotlightRect.top,
                  right: 0,
                  width: spotlightRect.right,
                  height: spotlightRect.height,
                },
              ]}
              onPress={() => {}}
            />
            <Pressable
              style={[
                styles.tutorialScrimBlock,
                {
                  left: 0,
                  right: 0,
                  top: spotlightRect.top + spotlightRect.height,
                  bottom: 0,
                },
              ]}
              onPress={() => {}}
            />
            <View
              pointerEvents="none"
              style={[
                styles.tutorialSpotlightRing,
                {
                  left: spotlightRect.left,
                  top: spotlightRect.top,
                  width: spotlightRect.width,
                  height: spotlightRect.height,
                  borderRadius: spotlightRadius,
                },
              ]}
            />
          </>
        ) : (
          <Pressable style={styles.tutorialScrim} onPress={() => {}} />
        )}

        <View
          pointerEvents="auto"
          style={[
            styles.tutorialSpotlightBubble,
            {
              left: bubbleLeft,
              top: bubbleTop,
              width: bubbleWidth,
            },
          ]}
        >
          {step.hideBubbleTail ? null : (
            <View
              style={[
                placeBubbleAbove ? styles.tutorialSpotlightTailDown : styles.tutorialSpotlightTailUp,
                { left: tailLeft },
              ]}
            />
          )}
          <View style={[styles.tutorialCoachHeader, styles.tutorialCoachHeaderTextOnly]}>
            <View style={styles.tutorialCoachCopy}>
              <Text style={styles.tutorialCoachTitle}>{t(step.titleKey)}</Text>
              <Text style={styles.tutorialCoachText}>{t(step.bodyKey)}</Text>
              {step.type === "target-press" && !step.hideTargetHint ? (
                <Text style={styles.tutorialCoachHint}>
                  {t("tutorial.tapTargetHint")}
                </Text>
              ) : null}
            </View>
          </View>

          {showSpotlightActions ? (
            <View style={styles.tutorialCoachActions}>
              {waitsForManualInteraction ? (
                renderWaitingPill(Boolean(step.waitForNextTap))
              ) : (
                <Pressable
                  onPress={onNext}
                  style={({ pressed }) => [
                    styles.tutorialCoachNextButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.tutorialCoachNextText}>{t(step.actionKey)}</Text>
                </Pressable>
              )}
            </View>
          ) : null}
        </View>
        {step.waitForTab ? (
          <View
            pointerEvents="auto"
            style={[
              styles.tutorialSpotlightTabs,
              tabBarWidth
                ? {
                    width: tabBarWidth,
                    left: tabBarLeft,
                    right: undefined,
                  }
                : null,
            ]}
          >
            {TABS.map((item) => {
              const target = item.key === step.waitForTab;

              if (!target) {
                return (
                  <View key={item.key} style={[styles.tutorialSpotlightTab, styles.tutorialSpotlightTabMuted]}>
                    <MaterialCommunityIcons name={item.icon} size={22} color={theme.textSecondary} />
                    <Text style={styles.tutorialSpotlightTabText}>{t(item.labelKey)}</Text>
                  </View>
                );
              }

              return (
                <Pressable
                  key={item.key}
                  onPress={() => onTargetTabPress?.(item.key)}
                  style={({ pressed }) => [
                    styles.tutorialSpotlightTab,
                    styles.tutorialSpotlightTabTarget,
                    pressed && styles.pressed,
                  ]}
                >
                  <MaterialCommunityIcons name={item.icon} size={22} color={theme.accentText} />
                  <Text style={styles.tutorialSpotlightTabTextTarget}>{t(item.labelKey)}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View
      pointerEvents="auto"
      style={[styles.tutorialCoachLayer, isSaveDemo && styles.tutorialCoachLayerCentered]}
    >
      <Pressable style={styles.tutorialScrim} onPress={() => {}} />
      <View
        pointerEvents="auto"
        style={[
          styles.tutorialCoachBubble,
          isSaveDemo && styles.tutorialCoachBubbleWide,
          maxWidth ? { maxWidth, alignSelf: "center", width: "100%" } : null,
        ]}
      >
        {isTabStep ? (
          <View style={[styles.tutorialCoachTail, { left: tabTailLeft }]} />
        ) : null}
        <View style={[styles.tutorialCoachHeader, styles.tutorialCoachHeaderTextOnly]}>
          <View style={styles.tutorialCoachCopy}>
            <Text style={styles.tutorialCoachTitle}>{t(step.titleKey)}</Text>
            <Text style={styles.tutorialCoachText}>{t(step.bodyKey)}</Text>
          </View>
        </View>

        {isSaveDemo ? (
          <View style={styles.tutorialDemoForm}>
            <Text style={styles.tutorialDemoLabel}>{t("common.front")}</Text>
            <TextInput
              value={demoFront}
              onChangeText={setDemoFront}
              placeholder={t("tutorial.demoFrontPlaceholder")}
              placeholderTextColor={theme.textPlaceholder}
              style={styles.tutorialDemoInput}
            />
            <Text style={styles.tutorialDemoLabel}>{t("common.back")}</Text>
            <TextInput
              value={demoBack}
              onChangeText={setDemoBack}
              placeholder={t("tutorial.demoBackPlaceholder")}
              placeholderTextColor={theme.textPlaceholder}
              style={styles.tutorialDemoInput}
            />
          </View>
        ) : null}

        <View style={styles.tutorialCoachActions}>
          {isTabStep ? (
            <View style={styles.tutorialCoachWaitingPill}>
              <Text style={styles.tutorialCoachWaitingText}>{waitingLabel}</Text>
            </View>
          ) : isSaveDemo ? (
            <Pressable
              disabled={savingDemo}
              onPress={() => void saveDemoCard()}
              style={({ pressed }) => [
                styles.tutorialCoachNextButton,
                savingDemo && styles.primaryButtonDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[
                  styles.tutorialCoachNextText,
                  savingDemo && styles.primaryButtonTextDisabled,
                ]}
              >
                {savingDemo ? t("tutorial.demoSaving") : t("tutorial.demoSave")}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={onNext}
              style={({ pressed }) => [
                styles.tutorialCoachNextButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.tutorialCoachNextText}>{t(step.actionKey)}</Text>
            </Pressable>
          )}
        </View>
      </View>
      {isTabStep ? (
        <View
          pointerEvents="auto"
          style={[
            styles.tutorialSpotlightTabs,
            tabBarWidth
              ? {
                  width: tabBarWidth,
                  left: tabBarLeft,
                  right: undefined,
                }
              : null,
          ]}
        >
          {TABS.map((item) => {
            const target = item.key === step.tab;

            if (!target) {
              return (
                <View key={item.key} style={[styles.tutorialSpotlightTab, styles.tutorialSpotlightTabMuted]}>
                  <MaterialCommunityIcons name={item.icon} size={22} color={theme.textSecondary} />
                  <Text style={styles.tutorialSpotlightTabText}>{t(item.labelKey)}</Text>
                </View>
              );
            }

            return (
              <Pressable
                key={item.key}
                onPress={() => onTargetTabPress?.(item.key)}
                style={({ pressed }) => [
                  styles.tutorialSpotlightTab,
                  styles.tutorialSpotlightTabTarget,
                  pressed && styles.pressed,
                ]}
              >
                <MaterialCommunityIcons name={item.icon} size={22} color={theme.accentText} />
                <Text style={styles.tutorialSpotlightTabTextTarget}>{t(item.labelKey)}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function LaunchScreen({ opacity, scale, glow, styles }) {
  return (
    <Animated.View style={[styles.launchScreen, { opacity }]}>
      <Animated.View style={[styles.launchHalo, { opacity: glow, transform: [{ scale }] }]} />
      <View style={styles.launchMoonWrap}>
        <View style={styles.launchMoon} />
        <View style={styles.launchMoonCutout} />
        <View style={[styles.launchStar, styles.launchStarPrimary]} />
        <View style={[styles.launchStar, styles.launchStarSecondary]} />
      </View>
      <Animated.Text style={[styles.launchTitle, { transform: [{ scale }] }]}>
        {APP_NAME}
      </Animated.Text>
    </Animated.View>
  );
}

function getLocalDayKey(timestamp) {
  const date = timestamp ? new Date(timestamp) : new Date();

  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].join("-");
}

function getStartOfLocalMonth(timestamp) {
  const date = timestamp ? new Date(timestamp) : new Date();

  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addLocalMonths(date, offset) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

function parseLocalDayKey(dayKey) {
  const [year, month, day] = `${dayKey}`.split("-").map((value) => Number.parseInt(value, 10));

  if (!year || !month || !day) {
    return new Date(0);
  }

  return new Date(year, month - 1, day);
}

function createCalendarCells(monthDate, sessionCountsByDate) {
  const monthStart = getStartOfLocalMonth(monthDate);
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const dayKey = getLocalDayKey(date);

    return {
      date,
      dayKey,
      count: sessionCountsByDate.get(dayKey) ?? 0,
      inMonth: date.getMonth() === monthStart.getMonth(),
    };
  });
}

function formatHistoryDateFilterLabel(dayKey, language, translate) {
  const todayKey = getLocalDayKey(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (dayKey === todayKey) {
    return translate("history.dateToday");
  }

  if (dayKey === getLocalDayKey(yesterday)) {
    return translate("history.dateYesterday");
  }

  return parseLocalDayKey(dayKey).toLocaleDateString(
    DATE_FILTER_LOCALES[language] ?? DATE_FILTER_LOCALES.en,
    { month: "numeric", day: "numeric" }
  );
}

function formatCalendarMonthLabel(monthDate, language) {
  return getStartOfLocalMonth(monthDate).toLocaleDateString(
    DATE_FILTER_LOCALES[language] ?? DATE_FILTER_LOCALES.en,
    { year: "numeric", month: "long" }
  );
}

const createStyles = (theme) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.appBg,
  },
  screen: {
    flex: 1,
  },
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  backgroundOrbPrimary: {
    position: "absolute",
    top: -120,
    right: -30,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: theme.backgroundOrbPrimary,
  },
  backgroundOrbSecondary: {
    position: "absolute",
    bottom: 130,
    left: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: theme.backgroundOrbSecondary,
  },
  star: {
    position: "absolute",
    backgroundColor: theme.star,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: Platform.OS === "android" ? 230 : 170,
  },
  contentShell: {
    width: "100%",
    alignSelf: "center",
  },
  scene: {
    gap: 16,
  },
  saveScene: {
    justifyContent: "flex-start",
  },
  saveModeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  saveModeChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 38,
    borderRadius: 999,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  saveModeChipActive: {
    backgroundColor: theme.accentSoft,
    borderColor: theme.accent,
  },
  saveModeChipText: {
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    color: theme.textSecondary,
  },
  saveModeChipTextActive: {
    color: theme.accent,
  },
  saveFabLayer: {
    position: "absolute",
    right: 24,
    bottom: Platform.OS === "android" ? 190 : 150,
    zIndex: 80,
    alignItems: "flex-end",
  },
  saveFabMenu: {
    gap: 8,
    width: 154,
    marginBottom: 10,
    padding: 8,
    borderRadius: 22,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.surfaceBorder,
    shadowColor: theme.textPrimary,
    shadowOpacity: theme.mode === "dark" ? 0.24 : 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  saveFabMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: theme.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
  },
  saveFabMenuItemActive: {
    backgroundColor: theme.accentSoft,
    borderColor: theme.accent,
  },
  saveFabMenuText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  saveFabMenuTextActive: {
    color: theme.accent,
  },
  saveFabButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.accent,
    borderWidth: 1,
    borderColor: theme.accent,
    shadowColor: theme.accent,
    shadowOpacity: theme.mode === "dark" ? 0.28 : 0.32,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  saveFabButtonActive: {
    backgroundColor: theme.textPrimary,
    borderColor: theme.textPrimary,
  },
  saveModalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  saveModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.mode === "dark" ? "rgba(2, 5, 14, 0.68)" : "rgba(24, 32, 51, 0.32)",
  },
  saveModalKeyboard: {
    flex: 1,
    justifyContent: "flex-end",
  },
  saveModalSheet: {
    width: "100%",
    maxHeight: "88%",
    alignSelf: "center",
    gap: 12,
    paddingTop: 10,
    paddingHorizontal: 18,
    paddingBottom: Platform.OS === "android" ? 28 : 18,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.surfaceBorder,
  },
  saveModalHandle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    backgroundColor: theme.surfaceBorder,
  },
  saveModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  saveModalTitleRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  saveModalTitle: {
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "900",
    color: theme.textPrimary,
  },
  saveModalCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
  },
  saveModalScrollContent: {
    gap: 12,
    paddingBottom: 8,
  },
  saveModalInnerPanel: {
    borderRadius: 22,
  },
  folderPanel: {
    position: "relative",
    zIndex: 20,
    gap: 12,
    padding: 14,
    borderRadius: 24,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.surfaceBorder,
  },
  folderHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  folderHeaderCopy: {
    flex: 1,
    gap: 5,
  },
  folderActionWrap: {
    position: "relative",
    zIndex: 40,
    alignItems: "flex-end",
  },
  folderActionButton: {
    width: 38,
    minHeight: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
  },
  folderActionButtonActive: {
    backgroundColor: theme.accentSoft,
    borderColor: theme.accent,
  },
  folderActionMenu: {
    position: "absolute",
    top: 42,
    right: 0,
    width: 184,
    zIndex: 60,
    elevation: 10,
    overflow: "hidden",
    borderRadius: 16,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.surfaceBorder,
    shadowColor: theme.textPrimary,
    shadowOpacity: theme.mode === "dark" ? 0.2 : 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  folderActionMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 13,
    backgroundColor: theme.surface,
  },
  folderActionMenuText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  folderActionMenuTextDanger: {
    color: theme.danger,
  },
  folderTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  folderPanelTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  folderUpButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: theme.accentSoft,
    borderWidth: 1,
    borderColor: theme.accent,
  },
  folderUpButtonText: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.accent,
  },
  folderBreadcrumbRow: {
    alignItems: "center",
    gap: 6,
    paddingRight: 10,
  },
  folderBreadcrumb: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: theme.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
  },
  folderBreadcrumbActive: {
    backgroundColor: theme.accentSoft,
    borderColor: theme.accent,
  },
  folderBreadcrumbText: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.textSecondary,
  },
  folderBreadcrumbTextActive: {
    color: theme.accent,
  },
  folderChildrenSection: {
    gap: 10,
  },
  folderChildList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  folderChildItem: {
    width: "30.2%",
    minWidth: 88,
    minHeight: 96,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 4,
    paddingHorizontal: 8,
    paddingTop: 18,
    paddingBottom: 10,
    borderRadius: 16,
    backgroundColor: theme.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
  },
  folderChildIcon: {
    width: 48,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  folderChildCopy: {
    flex: 1,
    gap: 2,
  },
  folderChildName: {
    width: "100%",
    minHeight: 28,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "800",
    textAlign: "center",
    color: theme.textPrimary,
  },
  folderEmptyText: {
    paddingVertical: 3,
    fontSize: 12,
    lineHeight: 18,
    color: theme.textSecondary,
  },
  folderSavedCardsItem: {
    width: "30.9%",
    minWidth: 92,
    minHeight: 108,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 4,
    paddingHorizontal: 8,
    paddingTop: 16,
    paddingBottom: 10,
    borderRadius: 16,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
  },
  folderSavedCardsIcon: {
    width: 48,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  folderSavedCardsName: {
    width: "100%",
    minHeight: 22,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "800",
    textAlign: "center",
    color: theme.textPrimary,
  },
  folderSavedCardsMeta: {
    width: "100%",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    textAlign: "center",
    color: theme.textSecondary,
  },
  folderCreateRow: {
    flexDirection: "row",
    gap: 8,
  },
  folderCreateInput: {
    flex: 1,
    minHeight: 46,
    paddingVertical: 11,
  },
  folderCreateButton: {
    width: 48,
    minHeight: 46,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.accent,
  },
  folderManageBox: {
    gap: 8,
    padding: 10,
    borderRadius: 18,
    backgroundColor: theme.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
  },
  folderRenameInput: {
    minHeight: 44,
    paddingVertical: 10,
  },
  folderManageActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  folderSmallPrimaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: theme.accent,
  },
  folderSmallPrimaryText: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.accentText,
  },
  folderSmallSecondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
  },
  folderSmallSecondaryText: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  folderSmallDangerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: theme.dangerBgSoft,
    borderWidth: 1,
    borderColor: theme.dangerBgSoft,
  },
  folderSmallDangerText: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.danger,
  },
  folderPickerRow: {
    gap: 8,
    paddingRight: 8,
  },
  folderPickerChip: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: theme.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
  },
  folderPickerChipActive: {
    backgroundColor: theme.accentSoft,
    borderColor: theme.accent,
  },
  folderPickerText: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.textSecondary,
  },
  folderPickerTextActive: {
    color: theme.accent,
  },
  heroStrip: {
    paddingTop: 8,
    gap: 4,
  },
  heroEyebrow: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: theme.accent,
  },
  heroMeta: {
    fontSize: 15,
    lineHeight: 22,
    color: theme.textMuted,
  },
  syncStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 22,
    backgroundColor: theme.surfaceStrong,
    borderWidth: 1,
    borderColor: theme.surfaceBorder,
  },
  syncLead: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  syncIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.accent,
  },
  flex: {
    flex: 1,
  },
  syncTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.textPrimary,
  },
  syncCaption: {
    fontSize: 13,
    lineHeight: 18,
    color: theme.textSecondary,
  },
  syncButton: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: theme.accent,
  },
  syncButtonMuted: {
    backgroundColor: theme.surfaceMuted,
  },
  syncButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: theme.accentText,
  },
  syncButtonTextMuted: {
    color: theme.textPrimary,
  },
  composerPanel: {
    padding: 22,
    gap: 14,
    borderRadius: 30,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.surfaceBorder,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.textStrong,
  },
  input: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.surfaceBorder,
    backgroundColor: theme.surfaceCard,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: theme.textPrimary,
  },
  multilineInput: {
    minHeight: 96,
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
  },
  manageActionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
    paddingTop: 4,
  },
  primaryButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    paddingVertical: 15,
    backgroundColor: theme.accent,
  },
  savePrimaryButton: {
    flex: 0,
    marginTop: 8,
  },
  primaryButtonDisabled: {
    backgroundColor: theme.mutedBg,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: "800",
    color: theme.accentText,
  },
  primaryButtonTextDisabled: {
    color: theme.textMuted,
  },
  secondaryButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    paddingVertical: 15,
    backgroundColor: theme.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.surfaceBorder,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.textPrimary,
  },
  secondaryButtonDisabled: {
    backgroundColor: theme.surfaceSoft,
    borderColor: theme.surfaceBorderSoft,
  },
  secondaryButtonTextDisabled: {
    color: theme.textMuted,
  },
  importPanel: {
    gap: 14,
    padding: 16,
    borderRadius: 24,
    backgroundColor: theme.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
  },
  importHeader: {
    gap: 12,
  },
  importTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  importIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.accentSoft,
  },
  importTitle: {
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  importBody: {
    fontSize: 13,
    lineHeight: 21,
    color: theme.textSecondary,
  },
  importBodyCompact: {
    fontSize: 13,
    lineHeight: 20,
    color: theme.textSecondary,
  },
  subtleDivider: {
    height: 1,
    backgroundColor: theme.surfaceBorderSoft,
  },
  importPreviewCard: {
    gap: 10,
    padding: 12,
    borderRadius: 18,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
  },
  importPreviewTopBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  importPreviewDots: {
    flexDirection: "row",
    gap: 4,
  },
  importPreviewDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.textPlaceholder,
    opacity: 0.7,
  },
  importPreviewFileName: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.textMuted,
  },
  importPreviewSheet: {
    gap: 6,
    padding: 12,
    borderRadius: 16,
    backgroundColor: theme.surfaceCard,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
  },
  importPreviewLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  importPreviewLineNo: {
    width: 16,
    fontSize: 12,
    fontWeight: "700",
    color: theme.textPlaceholder,
  },
  importPreviewLineText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: theme.textSecondary,
  },
  importPreviewLineFront: {
    color: theme.textPrimary,
    fontWeight: "700",
  },
  importPreviewLineBack: {
    color: theme.accent,
    fontWeight: "700",
  },
  importPreviewLineBlank: {
    color: "transparent",
  },
  importPreviewFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  importPreviewHint: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: theme.textSecondary,
  },
  importButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    paddingVertical: 14,
    backgroundColor: theme.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.surfaceBorder,
  },
  importButtonDisabled: {
    backgroundColor: theme.surfaceSoft,
  },
  importButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  photoPreviewFrame: {
    height: 228,
    overflow: "hidden",
    borderRadius: 22,
    backgroundColor: theme.surfaceCard,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
  },
  photoPreviewImage: {
    width: "100%",
    height: "100%",
  },
  photoPlaceholderCard: {
    alignItems: "flex-start",
    gap: 12,
    padding: 18,
    borderRadius: 22,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
  },
  photoPlaceholderIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.accentSoft,
  },
  photoPlaceholderTitle: {
    fontSize: 18,
    lineHeight: 25,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  photoPlaceholderBody: {
    fontSize: 14,
    lineHeight: 22,
    color: theme.textSecondary,
  },
  photoImportNotice: {
    fontSize: 13,
    lineHeight: 20,
    color: theme.textSecondary,
  },
  photoResultsCard: {
    gap: 12,
    padding: 14,
    borderRadius: 20,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
  },
  photoResultsTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  photoImportMeta: {
    fontSize: 12,
    lineHeight: 18,
    color: theme.textSecondary,
  },
  dangerButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    paddingVertical: 15,
    backgroundColor: theme.dangerBg,
    borderWidth: 1,
    borderColor: theme.dangerBgSoft,
  },
  dangerButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.danger,
  },
  pressed: {
    opacity: 0.88,
  },
  libraryPanel: {
    gap: 12,
    padding: 18,
    borderRadius: 26,
    backgroundColor: theme.surfaceStrong,
    borderWidth: 1,
    borderColor: theme.surfaceBorder,
  },
  manageListPanel: {
    gap: 0,
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 14,
  },
  manageListHeader: {
    gap: 4,
    paddingHorizontal: 4,
    paddingBottom: 12,
  },
  manageListDivider: {
    height: 1,
    backgroundColor: theme.surfaceBorderSoft,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  panelHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  panelTitle: {
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  panelBody: {
    fontSize: 13,
    lineHeight: 20,
    color: theme.textSecondary,
  },
  inlineLink: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: theme.surfaceMuted,
  },
  inlineLinkText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.textSoft,
  },
  libraryList: {
    gap: 10,
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: theme.surface,
  },
  previewRowLarge: {
    paddingVertical: 10,
  },
  previewColumn: {
    flex: 1,
    gap: 4,
  },
  previewLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.7,
    textTransform: "uppercase",
    color: theme.textSecondary,
  },
  previewText: {
    fontSize: 15,
    lineHeight: 22,
    color: theme.textPrimary,
  },
  previewDivider: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.accent,
  },
  emptyPanel: {
    alignItems: "flex-start",
    gap: 12,
    padding: 20,
    borderRadius: 26,
    backgroundColor: theme.surfaceStrong,
    borderWidth: 1,
    borderColor: theme.surfaceBorder,
  },
  emptyIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.accentSoft,
  },
  emptyTitle: {
    fontSize: 19,
    lineHeight: 26,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  emptyBody: {
    fontSize: 14,
    lineHeight: 22,
    color: theme.textSecondary,
  },
  emptyAction: {
    alignSelf: "stretch",
    marginTop: 4,
  },
  quizPanel: {
    gap: 14,
    padding: 18,
    borderRadius: 28,
    backgroundColor: theme.surfaceStrong,
    borderWidth: 1,
    borderColor: theme.surfaceBorder,
  },
  quizHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  quizHeaderContent: {
    flex: 1,
    minWidth: 0,
  },
  quizModeCard: {
    gap: 12,
    padding: 16,
    borderRadius: 20,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
  },
  quizModeCardEmbedded: {
    backgroundColor: theme.surfaceCard,
  },
  quizModeRow: {
    flexDirection: "row",
    gap: 8,
  },
  quizModeChip: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 42,
    borderRadius: 16,
    backgroundColor: theme.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.surfaceBorder,
  },
  quizModeChipActive: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  quizModeChipText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.textStrong,
  },
  quizModeChipTextActive: {
    color: theme.accentText,
  },
  quizSetupLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: theme.textStrong,
  },
  quizSetupHint: {
    fontSize: 13,
    lineHeight: 20,
    color: theme.textSecondary,
  },
  quizCountCard: {
    gap: 12,
    padding: 16,
    borderRadius: 20,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
  },
  quizCountCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  quizCountCompactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  quizCountCompactInput: {
    width: 78,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.surfaceBorder,
    backgroundColor: theme.surfaceMuted,
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    color: theme.textPrimary,
  },
  quizCountInputDisabled: {
    color: theme.textMuted,
  },
  quizCountCompactCaption: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  quizCountCompactHint: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    color: theme.textSecondary,
  },
  quizResetRow: {
    alignItems: "flex-end",
  },
  quizStartButton: {
    alignSelf: "flex-start",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: theme.accent,
  },
  quizStartButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: theme.accentText,
  },
  quizCard: {
    gap: 14,
    padding: 18,
    borderRadius: 24,
    backgroundColor: theme.surface,
  },
  quizSummaryCard: {
    gap: 16,
    padding: 18,
    borderRadius: 24,
    backgroundColor: theme.surface,
  },
  quizReadyCard: {
    gap: 16,
    padding: 20,
    borderRadius: 24,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.surfaceBorder,
  },
  quizReadyCardOffset: {
    marginTop: 54,
  },
  quizReadyIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.accentSoft,
  },
  quizReadyTitle: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  quizReadyBody: {
    fontSize: 14,
    lineHeight: 22,
    color: theme.textSecondary,
  },
  quizReadyStats: {
    flexDirection: "row",
    gap: 8,
  },
  quizReadyStat: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: theme.surfaceCard,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
  },
  quizReadyStatEditable: {
    backgroundColor: theme.accentSoft,
    borderColor: theme.accent,
  },
  quizReadyStatValue: {
    fontSize: 24,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  quizReadyStatInput: {
    width: "100%",
    paddingVertical: 0,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    textAlign: "center",
    color: theme.textPrimary,
  },
  quizReadyStatInputEditable: {
    color: theme.accent,
  },
  quizReadyStatLabel: {
    fontSize: 12,
    textAlign: "center",
    color: theme.textSecondary,
  },
  quizReadyStatLabelEditable: {
    color: theme.accent,
    fontWeight: "800",
  },
  quizSummaryHeader: {
    gap: 6,
  },
  quizSummaryStats: {
    flexDirection: "row",
    gap: 10,
  },
  quizSummaryStat: {
    flex: 1,
    gap: 6,
    padding: 14,
    borderRadius: 18,
    backgroundColor: theme.surfaceCard,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
  },
  quizSummaryValue: {
    fontSize: 28,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  quizSummaryValueGood: {
    color: theme.success,
  },
  quizSummaryValueBad: {
    color: theme.danger,
  },
  quizSummaryLabel: {
    fontSize: 13,
    color: theme.textSecondary,
  },
  quizMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  quizProgress: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.textMuted,
  },
  quizBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: theme.accentSoft,
    fontSize: 12,
    fontWeight: "800",
    color: theme.accent,
  },
  quizPrompt: {
    fontSize: 31,
    lineHeight: 38,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  feedback: {
    fontSize: 15,
    fontWeight: "800",
  },
  feedbackGood: {
    color: theme.success,
  },
  feedbackNeutral: {
    color: theme.accent,
  },
  feedbackBad: {
    color: theme.danger,
  },
  answerText: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.textPrimary,
  },
  manageCard: {
    gap: 8,
    padding: 10,
    borderRadius: 18,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
  },
  manageSwipeShell: {
    overflow: "hidden",
    borderRadius: 0,
    borderBottomWidth: 1,
    borderBottomColor: theme.surfaceBorderSoft,
  },
  manageSwipeTrack: {
    alignItems: "stretch",
  },
  manageSwipeCard: {
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },
  manageListCard: {
    paddingHorizontal: 4,
    paddingVertical: 8,
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: theme.surfaceStrong,
  },
  manageSwipeActions: {
    width: 152,
    flexDirection: "row",
  },
  manageSwipeAction: {
    width: 76,
    minHeight: 66,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  manageSwipeEditAction: {
    backgroundColor: theme.textSecondary,
  },
  manageSwipeDeleteAction: {
    backgroundColor: theme.danger,
  },
  manageSwipeActionText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    textAlign: "center",
    color: theme.accentText,
  },
  bulkMovePanel: {
    gap: 12,
    padding: 14,
    borderRadius: 22,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.surfaceBorder,
  },
  bulkMoveHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  bulkMoveHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  bulkMoveHeaderActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 8,
  },
  bulkMoveTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  bulkMoveBody: {
    fontSize: 12,
    lineHeight: 18,
    color: theme.textSecondary,
  },
  manageCardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  manageSelectButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 30,
    paddingHorizontal: 9,
    borderRadius: 999,
    backgroundColor: theme.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
  },
  manageSelectButtonActive: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  manageSelectText: {
    fontSize: 11,
    fontWeight: "800",
    color: theme.textSecondary,
  },
  manageSelectTextActive: {
    color: theme.accentText,
  },
  manageFolderBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: theme.accentSoft,
  },
  manageFolderBadgeText: {
    maxWidth: 220,
    fontSize: 11,
    fontWeight: "800",
    color: theme.accent,
  },
  managePairInlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 46,
  },
  managePairColumn: {
    flex: 1,
    minWidth: 0,
  },
  managePairSeparator: {
    width: 20,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  manageTextBlock: {
    width: "100%",
    minWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 0,
    height: 44,
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: theme.surfaceCard,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
  },
  manageSwipeHint: {
    width: 34,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  managePairText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    color: theme.textPrimary,
  },
  manageSideButton: {
    flex: 0,
    width: 80,
    height: 44,
    minHeight: 44,
    paddingVertical: 0,
    borderRadius: 13,
    alignSelf: "stretch",
  },
  aboutStack: {
    gap: 12,
  },
  aboutSupportTutorialTarget: {
    gap: 14,
    borderRadius: 22,
  },
  settingsCard: {
    gap: 14,
    padding: 18,
    borderRadius: 24,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.surfaceBorder,
  },
  manageSearchCard: {
    zIndex: 20,
    elevation: 4,
  },
  settingsHeader: {
    gap: 6,
  },
  settingsHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  settingsTitle: {
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  settingsBody: {
    fontSize: 14,
    lineHeight: 22,
    color: theme.textSecondary,
  },
  compactSelectRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    zIndex: 20,
  },
  compactSelectLabel: {
    flex: 1,
    paddingTop: 12,
    fontSize: 15,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  compactSelectWrap: {
    width: 184,
    position: "relative",
    zIndex: 30,
  },
  compactSelectTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: theme.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.surfaceBorder,
  },
  compactSelectValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: theme.textPrimary,
  },
  compactSelectMenu: {
    position: "absolute",
    top: 56,
    left: 0,
    right: 0,
    zIndex: 40,
    elevation: 10,
    overflow: "hidden",
    borderRadius: 18,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.surfaceBorder,
  },
  compactSelectOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  compactSelectOptionActive: {
    backgroundColor: theme.surfaceCard,
  },
  compactSelectOptionText: {
    flex: 1,
    fontSize: 14,
    color: theme.textPrimary,
  },
  compactSelectOptionTextActive: {
    fontWeight: "800",
  },
  modeSwitchRow: {
    flexDirection: "row",
    gap: 10,
  },
  modeChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: theme.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.surfaceBorder,
  },
  modeChipActive: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  modeChipText: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.textSecondary,
  },
  modeChipTextActive: {
    color: theme.accentText,
  },
  appSummaryCard: {
    gap: 8,
    padding: 18,
    borderRadius: 24,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.surfaceBorder,
  },
  inlineActionButton: {
    alignSelf: "flex-start",
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: theme.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.surfaceBorder,
  },
  contactActionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  adminRoleBadge: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: theme.accentSoft,
    borderWidth: 1,
    borderColor: theme.accent,
  },
  adminRoleBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: theme.accent,
  },
  adminMetricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  adminMetricCard: {
    flexGrow: 1,
    flexBasis: "47%",
    minWidth: 132,
    gap: 6,
    padding: 14,
    borderRadius: 18,
    backgroundColor: theme.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
  },
  adminMetricValue: {
    fontSize: 22,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  adminMetricLabel: {
    fontSize: 12,
    lineHeight: 18,
    color: theme.textSecondary,
  },
  adminSummaryChip: {
    minWidth: 82,
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: theme.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
  },
  adminSummaryLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.textSecondary,
  },
  adminSummaryValue: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  supportForm: {
    gap: 18,
  },
  supportCategoryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  supportCategoryChip: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 34,
    borderRadius: 999,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  supportCategoryChipActive: {
    backgroundColor: theme.accentSoft,
    borderColor: theme.accent,
  },
  supportCategoryChipText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.textSecondary,
  },
  supportCategoryChipTextActive: {
    color: theme.accent,
  },
  supportField: {
    gap: 10,
  },
  supportLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.textStrong,
  },
  supportMessageInput: {
    minHeight: 140,
  },
  supportNotice: {
    fontSize: 13,
    lineHeight: 20,
    color: theme.accent,
  },
  supportHistory: {
    gap: 10,
    paddingTop: 4,
  },
  supportHistoryTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  supportHistoryItem: {
    gap: 6,
    padding: 14,
    borderRadius: 18,
    backgroundColor: theme.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
  },
  supportHistoryMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  supportHistoryLead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  supportHistoryCategory: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: theme.accentSoft,
    fontSize: 11,
    fontWeight: "800",
    color: theme.accent,
  },
  supportHistoryStatus: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.accent,
  },
  supportHistoryDate: {
    fontSize: 12,
    color: theme.textMuted,
  },
  supportHistoryEmail: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.textPrimary,
  },
  supportHistorySubtle: {
    fontSize: 12,
    color: theme.textMuted,
  },
  supportHistoryMessage: {
    fontSize: 13,
    lineHeight: 20,
    color: theme.textSecondary,
  },
  inlineActionButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.textPrimary,
  },
  historySummaryCard: {
    gap: 14,
    padding: 18,
    borderRadius: 26,
    backgroundColor: theme.surfaceStrong,
    borderWidth: 1,
    borderColor: theme.surfaceBorder,
  },
  historySummaryHeader: {
    gap: 6,
  },
  historySummaryTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  historyHelpButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
  },
  historySummaryGrid: {
    flexDirection: "row",
    gap: 8,
  },
  historyMetricCard: {
    flex: 1,
    gap: 5,
    padding: 12,
    borderRadius: 18,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
  },
  historyMetricIcon: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  historyMetricValue: {
    fontSize: 24,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  historyMetricValueBad: {
    color: theme.danger,
  },
  historyMetricLabel: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  historyMetricTrend: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "800",
  },
  historyMetricTrendGood: {
    color: theme.success,
  },
  historyMetricTrendBad: {
    color: theme.danger,
  },
  historyProgressCard: {
    gap: 8,
    padding: 12,
    borderRadius: 18,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
  },
  historyProgressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  historyProgressTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  historyProgressPercent: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.accent,
  },
  historyProgressTrack: {
    height: 8,
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: theme.accentSoft,
  },
  historyProgressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: theme.accent,
  },
  historyProgressFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  historyGoalChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: theme.accentSoft,
    fontSize: 11,
    fontWeight: "800",
    color: theme.accent,
  },
  historyList: {
    gap: 12,
  },
  historyRecentTutorialTarget: {
    gap: 12,
    borderRadius: 26,
  },
  historyDateSummary: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.textSecondary,
  },
  historyCalendarButton: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.accentSoft,
    borderWidth: 1,
    borderColor: theme.surfaceBorder,
  },
  historyCalendarButtonActive: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  historyTimeline: {
    gap: 0,
  },
  historyTimelineItem: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  historyTimelineRail: {
    width: 20,
    alignItems: "center",
  },
  historyTimelineDot: {
    width: 7,
    height: 7,
    marginTop: 22,
    borderRadius: 999,
    backgroundColor: theme.surfaceBorder,
  },
  historyTimelineDotActive: {
    backgroundColor: theme.accent,
  },
  historyTimelineLine: {
    flex: 1,
    width: 2,
    marginTop: 4,
    backgroundColor: theme.surfaceBorderSoft,
  },
  historyCalendarPanel: {
    gap: 10,
    padding: 12,
    borderRadius: 20,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
  },
  historyCalendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  historyCalendarNavButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.surfaceCard,
  },
  historyCalendarMonthText: {
    flex: 1,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  historyCalendarWeekRow: {
    flexDirection: "row",
  },
  historyCalendarWeekText: {
    flex: 1,
    textAlign: "center",
    fontSize: 10,
    fontWeight: "800",
    color: theme.textMuted,
  },
  historyCalendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  historyCalendarDay: {
    width: "14.2857%",
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderRadius: 13,
  },
  historyCalendarDayMuted: {
    opacity: 0.35,
  },
  historyCalendarDayToday: {
    backgroundColor: theme.surfaceCard,
  },
  historyCalendarDaySelected: {
    backgroundColor: theme.accent,
  },
  historyCalendarDayText: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  historyCalendarDayTextMuted: {
    color: theme.textMuted,
  },
  historyCalendarDayTextSelected: {
    color: theme.accentText,
  },
  historyCalendarCountText: {
    fontSize: 9,
    fontWeight: "800",
    color: theme.accent,
  },
  historyCalendarCountTextSelected: {
    color: theme.accentText,
  },
  historyItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
  },
  historyItemBody: {
    flex: 1,
    gap: 6,
  },
  historyItemSide: {
    alignItems: "flex-end",
    gap: 8,
  },
  historyItemTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.textPrimary,
  },
  historyItemCaption: {
    fontSize: 12,
    lineHeight: 18,
    color: theme.textSecondary,
  },
  historyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: theme.accentSoft,
  },
  historyBadgeBad: {
    backgroundColor: theme.dangerBgSoft,
  },
  historyBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.accent,
  },
  historyBadgeTextBad: {
    color: theme.danger,
  },
  historyRetryButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: theme.accentSoft,
    borderWidth: 1,
    borderColor: theme.surfaceBorder,
  },
  historyRetryButtonText: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.accent,
  },
  historyActionRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
  },
  historyActionText: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.textSecondary,
  },
  historyMissedCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 18,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
  },
  historyMissedIcon: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: theme.accentSoft,
  },
  historyMissedPath: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "700",
    color: theme.textSecondary,
  },
  historyChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.textSecondary,
  },
  historyEmptyText: {
    fontSize: 13,
    lineHeight: 20,
    color: theme.textSecondary,
  },
  tabs: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: Platform.OS === "android" ? 56 : 24,
    flexDirection: "row",
    gap: 8,
    paddingTop: 10,
    paddingHorizontal: 10,
    paddingBottom: Platform.OS === "android" ? 18 : 10,
    borderRadius: 28,
    backgroundColor: theme.tabBarBg,
    borderWidth: 1,
    borderColor: theme.surfaceBorder,
  },
  tab: {
    flex: 1,
    minHeight: Platform.OS === "android" ? 74 : 66,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  tabActive: {
    backgroundColor: theme.accent,
  },
  tabTutorialTarget: {
    borderWidth: 2,
    borderColor: theme.accent,
    backgroundColor: theme.mode === "dark" ? "rgba(184, 174, 255, 0.14)" : "rgba(142, 123, 255, 0.12)",
  },
  tabText: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 16,
    color: theme.tabText,
  },
  tabTextTutorialTarget: {
    color: theme.accent,
  },
  tabTextActive: {
    color: theme.accentText,
  },
  launchScreen: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.launchBg,
  },
  launchHalo: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: theme.accentSoftStrong,
  },
  launchMoonWrap: {
    width: 116,
    height: 116,
    marginBottom: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  launchMoon: {
    position: "absolute",
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: theme.accent,
  },
  launchMoonCutout: {
    position: "absolute",
    width: 64,
    height: 64,
    borderRadius: 32,
    right: 18,
    top: 21,
    backgroundColor: theme.launchBg,
  },
  launchStar: {
    position: "absolute",
    backgroundColor: theme.star,
    borderRadius: 999,
  },
  launchStarPrimary: {
    top: 26,
    right: 14,
    width: 10,
    height: 10,
  },
  launchStarSecondary: {
    bottom: 18,
    left: 16,
    width: 6,
    height: 6,
  },
  launchTitle: {
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: 11,
    color: theme.textPrimary,
  },
  tutorialOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.appBg,
  },
  tutorialIntroDecor: {
    ...StyleSheet.absoluteFillObject,
  },
  tutorialTapArea: {
    flex: 1,
  },
  tutorialScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight ?? 0) + 34 : 54,
    paddingBottom: 148,
  },
  tutorialHeader: {
    gap: 10,
    marginBottom: 30,
  },
  tutorialTitle: {
    fontSize: 30,
    fontWeight: "900",
    color: theme.textPrimary,
  },
  tutorialCaption: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "800",
    color: theme.accent,
  },
  tutorialChat: {
    gap: 16,
  },
  tutorialMessageRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    maxWidth: "92%",
    paddingLeft: 18,
  },
  tutorialMessageRowUser: {
    alignSelf: "flex-end",
    justifyContent: "flex-end",
  },
  tutorialAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.accent,
    borderWidth: 6,
    borderColor: theme.surfaceStrong,
  },
  tutorialBubble: {
    position: "relative",
    maxWidth: "100%",
    gap: 4,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 22,
    borderBottomRightRadius: 22,
    borderBottomLeftRadius: 22,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.accentSoftStrong,
    shadowColor: theme.textPrimary,
    shadowOpacity: theme.mode === "dark" ? 0.22 : 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  tutorialBubbleTail: {
    position: "absolute",
    left: -7,
    top: 22,
    width: 18,
    height: 18,
    borderBottomLeftRadius: 4,
    backgroundColor: theme.surface,
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.surfaceBorder,
    transform: [{ rotate: "45deg" }],
  },
  tutorialBubbleUser: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 8,
    backgroundColor: theme.accent,
  },
  tutorialBubbleTitle: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  tutorialBubbleText: {
    fontSize: 16,
    lineHeight: 25,
    fontWeight: "600",
    color: theme.textStrong,
  },
  tutorialBubbleTextUser: {
    color: theme.accentText,
  },
  tutorialTapHint: {
    alignSelf: "flex-start",
    marginLeft: 28,
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
    color: theme.textMuted,
  },
  tutorialBottomSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: Platform.OS === "android" ? 42 : 0,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: Platform.OS === "android" ? 20 : 28,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: Platform.OS === "android" ? 28 : 0,
    borderBottomRightRadius: Platform.OS === "android" ? 28 : 0,
    backgroundColor: theme.surface,
    borderTopWidth: 1,
    borderColor: theme.surfaceBorder,
  },
  tutorialActionRow: {
    flexDirection: "row",
    gap: 12,
  },
  tutorialActionButton: {
    minHeight: 64,
    borderRadius: 18,
    paddingHorizontal: 10,
  },
  tutorialChoiceText: {
    textAlign: "center",
    lineHeight: 20,
  },
  tutorialCoachLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "android" ? 190 : 168,
  },
  tutorialCoachLayerCentered: {
    justifyContent: "center",
    paddingBottom: 0,
  },
  tutorialScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.mode === "dark" ? "rgba(0, 0, 0, 0.68)" : "rgba(8, 13, 28, 0.58)",
  },
  tutorialSpotlightLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  tutorialScrimBlock: {
    position: "absolute",
    backgroundColor: theme.mode === "dark" ? "rgba(0, 0, 0, 0.68)" : "rgba(8, 13, 28, 0.58)",
  },
  tutorialSpotlightRing: {
    position: "absolute",
    borderRadius: 28,
    borderWidth: 2,
    borderColor: theme.accent,
    backgroundColor: "transparent",
  },
  tutorialSpotlightBubble: {
    position: "absolute",
    gap: 14,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    borderRadius: 26,
    backgroundColor: theme.mode === "dark" ? "#111827" : "#FFFFFF",
    borderWidth: 1,
    borderColor: theme.surfaceBorder,
  },
  tutorialSpotlightTailUp: {
    position: "absolute",
    top: -14,
    width: 0,
    height: 0,
    borderLeftWidth: 13,
    borderRightWidth: 13,
    borderBottomWidth: 15,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: theme.mode === "dark" ? "#111827" : "#FFFFFF",
  },
  tutorialSpotlightTailDown: {
    position: "absolute",
    bottom: -14,
    width: 0,
    height: 0,
    borderLeftWidth: 13,
    borderRightWidth: 13,
    borderTopWidth: 15,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: theme.mode === "dark" ? "#111827" : "#FFFFFF",
  },
  tutorialCoachBubble: {
    position: "relative",
    gap: 14,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    borderRadius: 26,
    borderBottomLeftRadius: 18,
    backgroundColor: theme.mode === "dark" ? "#111827" : "#FFFFFF",
    borderWidth: 1,
    borderColor: theme.surfaceBorder,
  },
  tutorialCoachBubbleWide: {
    gap: 12,
  },
  tutorialCoachTail: {
    position: "absolute",
    bottom: -17,
    width: 0,
    height: 0,
    borderLeftWidth: 15,
    borderRightWidth: 15,
    borderTopWidth: 18,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: theme.mode === "dark" ? "#111827" : "#FFFFFF",
  },
  tutorialCoachHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  tutorialCoachHeaderTextOnly: {
    paddingHorizontal: 6,
  },
  tutorialCoachCopy: {
    flex: 1,
    minWidth: 0,
    gap: 12,
  },
  tutorialCoachTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  tutorialCoachText: {
    fontSize: 13,
    lineHeight: 20,
    color: theme.textSecondary,
  },
  tutorialCoachHint: {
    marginTop: 4,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "800",
    color: theme.accent,
  },
  tutorialCoachActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  tutorialCoachNextButton: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.accent,
  },
  tutorialCoachNextText: {
    fontSize: 14,
    fontWeight: "900",
    color: theme.accentText,
  },
  tutorialDemoForm: {
    gap: 8,
  },
  tutorialDemoLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.textSecondary,
  },
  tutorialDemoInput: {
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 15,
    backgroundColor: theme.surfaceCard,
    borderWidth: 1,
    borderColor: theme.surfaceBorder,
    color: theme.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  tutorialCoachWaitingPill: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.accentSoft,
    borderWidth: 1,
    borderColor: theme.surfaceBorder,
  },
  tutorialCoachWaitingText: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "800",
    textAlign: "center",
    color: theme.accent,
  },
  tutorialSpotlightTabs: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: Platform.OS === "android" ? 28 : 14,
    flexDirection: "row",
    gap: 8,
    paddingTop: 10,
    paddingHorizontal: 10,
    paddingBottom: Platform.OS === "android" ? 18 : 10,
    borderRadius: 28,
    backgroundColor: theme.surfaceStrong,
    borderWidth: 1,
    borderColor: theme.surfaceBorder,
  },
  tutorialSpotlightTab: {
    flex: 1,
    minHeight: Platform.OS === "android" ? 74 : 66,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  tutorialSpotlightTabMuted: {
    opacity: 0.38,
  },
  tutorialSpotlightTabTarget: {
    backgroundColor: theme.accent,
    borderWidth: 2,
    borderColor: theme.surfaceStrong,
  },
  tutorialSpotlightTabText: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 16,
    color: theme.tabText,
  },
  tutorialSpotlightTabTextTarget: {
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 16,
    color: theme.accentText,
  },
});
