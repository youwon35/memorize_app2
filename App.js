import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { makeRedirectUri } from "expo-auth-session";
import { File } from "expo-file-system";
import * as WebBrowser from "expo-web-browser";

import { isSupabaseConfigured, supabase } from "./src/lib/supabase";
import {
  appendStudySession,
  buildPracticeDeck,
  compareAnswers,
  createEmptyStudyStats,
  createLocalPair,
  createPersistableStudyStats,
  createSignature,
  extractPairsFromRecognizedText,
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
  LANGUAGE_OPTIONS,
  normalizeSupportCategory,
  normalizeSupportStatus,
} from "./src/i18n";

WebBrowser.maybeCompleteAuthSession();

const APP_NAME = "MEMORIA";
const STORAGE_KEY = "@memoria/cards";
const THEME_MODE_KEY = "@memoria/theme-mode";
const LANGUAGE_KEY = "@memoria/language";
const STUDY_STATS_KEY = "@memoria/study-stats";
const TUTORIAL_SEEN_KEY = "@memoria/tutorial-seen";
const SUPPORT_REQUESTS_KEY = "@memoria/support-requests";
const LEGACY_STORAGE_KEYS = ["@memora/study-pairs"];
const APP_SCHEME = process.env.EXPO_PUBLIC_APP_SCHEME || "memoria";
const RELEASE_REDIRECT_URI = `${APP_SCHEME}://auth/callback`;
const DEFAULT_QUIZ_COUNT = 10;
const MAX_SESSION_HISTORY = 60;
const SUPPORT_EMAIL = ["youwon35", "naver.com"].join("@");
const SUPPORT_CATEGORY_OPTIONS = ["bug", "feature", "other"];
const MANAGE_SORT_OPTIONS = [
  { key: "recent", labelKey: "manage.sortRecent" },
  { key: "alphabetical", labelKey: "manage.sortAlphabetical" },
  { key: "missed", labelKey: "manage.sortMissed" },
];
const THEME_OPTIONS = [
  { key: "light", labelKey: "theme.light", icon: "white-balance-sunny" },
  { key: "dark", labelKey: "theme.dark", icon: "weather-night" },
];
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
const SAVE_INPUT_OPTIONS = [
  { key: "single", labelKey: "saveModes.single", icon: "cards-outline" },
  { key: "text", labelKey: "saveModes.text", icon: "file-document-plus-outline" },
  { key: "photo", labelKey: "saveModes.photo", icon: "camera-outline" },
];
const STAR_FIELD = [
  { top: 34, left: 28, size: 4, opacity: 0.45 },
  { top: 112, right: 44, size: 6, opacity: 0.32 },
  { top: 240, left: 54, size: 3, opacity: 0.26 },
  { top: 328, right: 84, size: 5, opacity: 0.18 },
  { top: 520, left: 24, size: 3, opacity: 0.24 },
  { top: 640, right: 26, size: 4, opacity: 0.2 },
];
const IMPORT_PREVIEW_LINES = [
  { no: "1", text: "sun", tone: "front" },
  { no: "2", text: "해", tone: "back" },
  { no: "3", text: "", tone: "blank" },
  { no: "4", text: "moon", tone: "front" },
  { no: "5", text: "달", tone: "back" },
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
const appendUniqueId = (items, nextId) => (items.includes(nextId) ? items : [...items, nextId]);
const isValidEmail = (value) => /\S+@\S+\.\S+/.test(value.trim());
const createLocalSupportRequest = ({ replyEmail, message, category, session }) => ({
  id: `support-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  category: normalizeSupportCategory(category),
  replyEmail: replyEmail.trim(),
  message: message.trim(),
  userEmail: session?.user?.email ?? null,
  createdAt: new Date().toISOString(),
  status: "received",
  source: "local",
});
const mapSupportInquiryRecord = (record) => ({
  id: record.id,
  category: normalizeSupportCategory(record.category),
  replyEmail: record.reply_email ?? "",
  message: record.message ?? "",
  userEmail: record.sender_email ?? null,
  createdAt: record.created_at ?? new Date().toISOString(),
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
  const [tab, setTab] = useState("save");
  const [language, setLanguage] = useState(getPreferredLanguage());
  const [themeMode, setThemeMode] = useState("light");
  const [saveInputMode, setSaveInputMode] = useState("single");
  const [manageSort, setManageSort] = useState("recent");
  const [manageSearch, setManageSearch] = useState("");
  const [pairs, setPairs] = useState([]);
  const [studyStats, setStudyStats] = useState(createEmptyStudyStats());
  const [draft, setDraft] = useState({ left: "", right: "" });
  const [storageReady, setStorageReady] = useState(false);
  const [tutorialSeen, setTutorialSeen] = useState(true);
  const [tutorialReady, setTutorialReady] = useState(false);
  const [tutorialVisible, setTutorialVisible] = useState(false);
  const [session, setSession] = useState(null);
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
  const [deck, setDeck] = useState([]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizCountInput, setQuizCountInput] = useState(`${DEFAULT_QUIZ_COUNT}`);
  const [quizMode, setQuizMode] = useState("both");
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState("");
  const [result, setResult] = useState(null);
  const [showAnswer, setShowAnswer] = useState(false);
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
  const [launchVisible, setLaunchVisible] = useState(true);

  const timerRef = useRef(null);
  const scrollRef = useRef(null);
  const pairsRef = useRef(pairs);
  const studyStatsRef = useRef(studyStats);
  const supportRequestsRef = useRef([]);
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
  const hasSavedCards = pairs.length > 0;
  const quizModeConfig = getQuizModeConfig(quizMode);
  const maxQuizCount = pairs.length ? pairs.length * (quizMode === "both" ? 2 : 1) : 0;
  const contentTopPadding = 18 + (Platform.OS === "android" ? (StatusBar.currentHeight ?? 0) : 0);
  const parsedQuizCount = Number.parseInt(quizCountInput, 10);
  const resolvedQuizCount = !maxQuizCount
    ? 0
    : Number.isFinite(parsedQuizCount) && parsedQuizCount > 0
      ? Math.min(parsedQuizCount, maxQuizCount)
      : Math.min(DEFAULT_QUIZ_COUNT, maxQuizCount);

  const handleTabChange = (nextTab) => {
    setTab(nextTab);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo?.({ y: 0, animated: false });
    });
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
  const photoPreviewPairs = useMemo(() => photoImportedPairs.slice(0, 6), [photoImportedPairs]);
  const todayKey = getLocalDayKey(new Date());
  const todaySessions = useMemo(
    () => studyStats.sessions.filter((item) => getLocalDayKey(item.completedAt) === todayKey),
    [studyStats.sessions, todayKey]
  );
  const todaySessionCount = todaySessions.length;
  const todaySolvedCount = todaySessions.reduce((sum, item) => sum + (item.totalCards ?? 0), 0);
  const todayIncorrectCount = todaySessions.reduce((sum, item) => sum + (item.incorrectCount ?? 0), 0);
  const recentSessions = useMemo(() => studyStats.sessions.slice(0, 6), [studyStats.sessions]);
  const normalizedManageSearch = manageSearch.trim().toLocaleLowerCase(language);
  const sortedManagePairs = useMemo(() => {
    if (manageSort === "alphabetical") {
      return [...pairs].sort((leftPair, rightPair) => {
        const leftText = `${leftPair.left} ${leftPair.right}`.trim();
        const rightText = `${rightPair.left} ${rightPair.right}`.trim();

        return leftText.localeCompare(rightText, language, { sensitivity: "base" });
      });
    }

    if (manageSort === "missed") {
      return [...pairs].sort((leftPair, rightPair) => {
        const leftStats = studyStats.cards[createSignature(leftPair.left, leftPair.right)] ?? {};
        const rightStats = studyStats.cards[createSignature(rightPair.left, rightPair.right)] ?? {};
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

    return sortPairs(pairs);
  }, [language, manageSort, pairs, studyStats.cards]);
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
      (item.incorrectCards ?? []).forEach((card) => {
        const currentCount = counter.get(card.signature) ?? {
          ...card,
          count: 0,
        };

        currentCount.count += 1;
        counter.set(card.signature, currentCount);
      });
    });

    return Array.from(counter.values()).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [todaySessions]);
  const topMissedCards = useMemo(
    () =>
      Object.values(studyStats.cards)
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

  useEffect(() => {
    pairsRef.current = pairs;
  }, [pairs]);

  useEffect(() => {
    studyStatsRef.current = studyStats;
  }, [studyStats]);

  useEffect(() => {
    supportRequestsRef.current = supportRequests;
  }, [supportRequests]);

  useEffect(() => {
    if (session?.user?.email) {
      setSupportReplyEmail((currentValue) => currentValue || session.user.email);
    }
  }, [session?.user?.email]);

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

        if (storedLanguage === "ko" || storedLanguage === "en" || storedLanguage === "ja") {
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
          setPairs(sortPairs(parsed));
        }
      } finally {
        if (active) {
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
    void AsyncStorage.setItem(LANGUAGE_KEY, language);
  }, [language]);

  useEffect(() => {
    void AsyncStorage.setItem(THEME_MODE_KEY, themeMode);
  }, [themeMode]);

  useEffect(() => {
    void AsyncStorage.setItem(SUPPORT_REQUESTS_KEY, JSON.stringify(supportRequests));
  }, [supportRequests]);

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
    if (!storageReady || !session?.user?.id || !supabase) {
      return;
    }

    let active = true;

    const sync = async () => {
      setSyncing(true);

      try {
        const remoteResponse = await supabase
          .from("memory_pairs")
          .select("*")
          .order("updated_at", { ascending: false });

        if (remoteResponse.error) {
          throw remoteResponse.error;
        }

        const remote = (remoteResponse.data ?? []).map(mapPairRecord);
        const signatures = new Set(remote.map((pair) => createSignature(pair.left, pair.right)));
        const localOnly = pairsRef.current.filter(
          (pair) => !signatures.has(createSignature(pair.left, pair.right))
        );
        let inserted = [];

        if (localOnly.length > 0) {
          const uploaded = await supabase
            .from("memory_pairs")
            .insert(
              localOnly.map((pair) => ({
                user_id: session.user.id,
                prompt_a: pair.left,
                prompt_b: pair.right,
              }))
            )
            .select();

          if (uploaded.error) {
            throw uploaded.error;
          }

          inserted = (uploaded.data ?? []).map(mapPairRecord);
        }

        const merged = mergePairsBySignature(remote, inserted);

        if (active) {
          setPairs(merged);
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
    setShowAnswer(false);
    setRoundComplete(false);
    setRoundIncorrectIds([]);
    roundMetaRef.current = null;
    roundSnapshotRef.current = null;
  }, [pairs.length]);

  const savePairs = async (nextPairs) => {
    const sorted = sortPairs(nextPairs);

    setPairs(sorted);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));
  };

  const updateStudyStats = (nextStudyStats) => {
    const syncedStudyStats = createPersistableStudyStats(nextStudyStats, pairsRef.current);
    studyStatsRef.current = syncedStudyStats;
    setStudyStats(syncedStudyStats);
    void AsyncStorage.setItem(STUDY_STATS_KEY, JSON.stringify(syncedStudyStats));
  };

  const addSupportRequest = (nextRequest) => {
    setSupportRequests((currentRequests) => mergeSupportRequests([nextRequest], currentRequests));
  };

  const closeTutorial = (nextTab = null) => {
    setTutorialVisible(false);
    setTutorialSeen(true);
    void AsyncStorage.setItem(TUTORIAL_SEEN_KEY, "1");

    if (nextTab) {
      handleTabChange(nextTab);
    }
  };

  const saveEntryBatch = async (entries) => {
    const existingPairs = pairsRef.current;
    const knownSignatures = new Set(
      existingPairs.map((pair) => createSignature(pair.left, pair.right))
    );
    const uniqueEntries = [];
    let skippedDuplicates = 0;

    entries.forEach((entry) => {
      const left = entry.left.trim();
      const right = entry.right.trim();

      if (!left || !right) {
        return;
      }

      const signature = createSignature(left, right);

      if (knownSignatures.has(signature)) {
        skippedDuplicates += 1;
        return;
      }

      knownSignatures.add(signature);
      uniqueEntries.push({ left, right });
    });

    if (!uniqueEntries.length) {
      return { savedCount: 0, skippedDuplicates, cloudSaved: false };
    }

    let savedPairs = uniqueEntries.map((entry) => createLocalPair(entry.left, entry.right));
    let cloudSaved = false;

    if (session?.user?.id && supabase) {
      try {
        const inserted = await supabase
          .from("memory_pairs")
          .insert(
            uniqueEntries.map((entry) => ({
              user_id: session.user.id,
              prompt_a: entry.left,
              prompt_b: entry.right,
            }))
          )
          .select();

      if (inserted.error) {
        throw inserted.error;
      }

      savedPairs = (inserted.data ?? []).map(mapPairRecord);
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

    setDraft({ left: "", right: "" });

    if (saveResult.cloudSaved) {
      setTranslatedNote("notes.cardSavedCloud");
    }
  };

  const importCardsFromTextFile = async () => {
    setImporting(true);

    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ["text/plain", "text/*"],
        copyToCacheDirectory: true,
      });

      if (picked.canceled) {
        return;
      }

      const asset = picked.assets?.[0];

      if (!asset?.uri) {
        throw new Error(t("alerts.fileUnreadable"));
      }

      const file = new File(asset.uri);
      const text = await file.text();
      const { entries, invalidEntryIndexes } = parseImportedPairs(text);

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

  const readPairsFromPhotoAsset = async (asset) => {
    if (!asset?.uri) {
      throw new Error(t("alerts.photoUnreadable"));
    }

    let recognizeText;

    try {
      ({ recognizeText } = require("@infinitered/react-native-mlkit-text-recognition"));
    } catch (error) {
      throw new Error(t("alerts.devBuildOnly"));
    }

    const recognitionResult = await recognizeText(asset.uri);

    return extractPairsFromRecognizedText(recognitionResult);
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
      const { entries, invalidRowIndexes } = await readPairsFromPhotoAsset(asset);

      setPhotoImportedPairs(entries);
      setPhotoInvalidRowIndexes(invalidRowIndexes);

      if (!entries.length) {
        setPhotoImportNotice(
          invalidRowIndexes.length
            ? t("save.photoPairNotGrouped")
            : t("save.photoNoText")
        );
        return;
      }

      const messages = [t("save.photoPairFound", { count: entries.length })];

      if (invalidRowIndexes.length) {
        messages.push(t("save.photoPairInvalid", { count: invalidRowIndexes.length }));
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
      aspect: [4, 3],
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
    setShowAnswer(false);
    setRoundComplete(false);
    setRoundIncorrectIds([]);
    roundMetaRef.current = {
      startedAt: new Date().toISOString(),
      requestedCount: options.requestedCount ?? nextDeck.length,
      totalCards: nextDeck.length,
      mode: options.mode ?? quizMode,
      source: options.source ?? "adaptive",
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
  };

  const resetQuizSession = () => {
    clearTimeout(timerRef.current);

    if (roundSnapshotRef.current) {
      updateStudyStats(roundSnapshotRef.current);
    }

    roundSnapshotRef.current = null;
    roundMetaRef.current = null;
    setDeck([]);
    setQuizIndex(0);
    setAnswer("");
    setFeedback("");
    setResult(null);
    setShowAnswer(false);
    setRoundComplete(false);
    setRoundIncorrectIds([]);
  };

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
    if (!pairs.length) {
      Alert.alert(t("quiz.noQuestionsTitle"), t("quiz.noQuestionsBody"));
      return;
    }

    const finalRequestedCount = resolveRequestedQuizCount(requestedCount);

    beginQuizRound(
      buildPracticeDeck(pairs, finalRequestedCount, quizMode, studyStatsRef.current),
      {
        requestedCount: finalRequestedCount,
        mode: quizMode,
        source: "adaptive",
      }
    );
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

  const goNext = (incorrectIds = roundIncorrectIds) => {
    if (!deck.length) {
      return;
    }

    clearTimeout(timerRef.current);
    setAnswer("");
    setFeedback("");
    setResult(null);
    setShowAnswer(false);

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

    clearTimeout(timerRef.current);

    if (result === "correct") {
      goNext();
      return;
    }

    const nextIncorrectIds = appendUniqueId(roundIncorrectIds, current.id);

    if (result !== "incorrect") {
      updateStudyStats(recordStudyAttempt(studyStatsRef.current, current, false));
      setRoundIncorrectIds(nextIncorrectIds);
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
      setShowAnswer(false);
      return;
    }

    if (compareAnswers(answer, current.answer)) {
      updateStudyStats(recordStudyAttempt(studyStatsRef.current, current, true));
      setResult("correct");
      setFeedback(t("quiz.feedbackCorrect"));
      timerRef.current = setTimeout(() => goNext(), 900);
      return;
    }

    const nextIncorrectIds = appendUniqueId(roundIncorrectIds, current.id);
    updateStudyStats(recordStudyAttempt(studyStatsRef.current, current, false));
    setResult("incorrect");
    setFeedback(t("quiz.feedbackIncorrect"));
    setShowAnswer(false);
    setRoundIncorrectIds(nextIncorrectIds);
    timerRef.current = setTimeout(() => goNext(nextIncorrectIds), 900);
  };

  const saveEdit = async () => {
    const target = pairs.find((pair) => pair.id === editingId);

    if (!target || !editingLeft.trim() || !editingRight.trim()) {
      return;
    }

    const nextSignature = createSignature(editingLeft.trim(), editingRight.trim());
    const duplicateExists = pairs.some(
      (pair) =>
        pair.id !== target.id && createSignature(pair.left, pair.right) === nextSignature
    );

    if (duplicateExists) {
      Alert.alert(t("manage.duplicateTitle"), t("manage.duplicateBody"));
      return;
    }

    let updated = updatePairValues(target, editingLeft, editingRight);

    if (session?.user?.id && supabase && target.source === "cloud") {
      const response = await supabase
        .from("memory_pairs")
        .update({ prompt_a: editingLeft.trim(), prompt_b: editingRight.trim() })
        .eq("id", target.id)
        .eq("user_id", session.user.id)
        .select()
        .single();

      if (response.error) {
        Alert.alert(t("manage.editFail"), response.error.message);
        return;
      }

      updated = mapPairRecord(response.data);
    }

    await savePairs(pairs.map((pair) => (pair.id === target.id ? updated : pair)));
    updateStudyStats(migrateStudyStatsEntry(studyStatsRef.current, target, updated));
    setEditingId(null);
    setEditingLeft("");
    setEditingRight("");
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

  const openSupportEmail = async () => {
    try {
      const subject = `${APP_NAME} ${t("about.supportTitle")}`;
      const body = [
        t("about.supportMessagePlaceholder"),
        "",
        session?.user?.email ? `${t("common.sender")}: ${session.user.email}` : null,
        `${t("common.app")}: ${APP_NAME}`,
        `${t("common.platform")}: ${Platform.OS}`,
      ]
        .filter(Boolean)
        .join("\n");
      const encodedSubject = encodeURIComponent(subject);
      const encodedBody = encodeURIComponent(body);
      const emailUrl = `mailto:${SUPPORT_EMAIL}?subject=${encodedSubject}&body=${encodedBody}`;
      const browserComposeUrl =
        `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(SUPPORT_EMAIL)}` +
        `&su=${encodedSubject}&body=${encodedBody}`;
      const canOpen = await Linking.canOpenURL(emailUrl);

      if (canOpen) {
        await Linking.openURL(emailUrl);
        return;
      }

      await WebBrowser.openBrowserAsync(browserComposeUrl);
    } catch (error) {
      Alert.alert(t("about.openSupportFail"), error?.message || t("common.retryLater"));
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

  const renderSaveTab = () => (
    <View style={[styles.scene, styles.saveScene]}>
      <View style={styles.saveModeRow}>
        {SAVE_INPUT_OPTIONS.map((option) => {
          const active = saveInputMode === option.key;

          return (
            <Pressable
              key={option.key}
              onPress={() => setSaveInputMode(option.key)}
              style={({ pressed }) => [
                styles.saveModeChip,
                active && styles.saveModeChipActive,
                pressed && styles.pressed,
              ]}
            >
              <MaterialCommunityIcons
                name={option.icon}
                size={18}
                color={active ? theme.accentText : theme.textSecondary}
              />
              <Text style={[styles.saveModeChipText, active && styles.saveModeChipTextActive]}>
                {t(option.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {saveInputMode === "single" ? (
        <View style={styles.composerPanel}>
          <Text style={styles.composerTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.84}>
            {t("save.title")}
          </Text>

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

          <View style={styles.actionRow}>
            <Pressable onPress={() => void saveCard()} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
              <Text style={styles.primaryButtonText}>{t("save.saveButton")}</Text>
            </Pressable>
            <Pressable onPress={() => startQuiz()} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
              <Text style={styles.secondaryButtonText}>{t("save.memorizeNow")}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {saveInputMode === "text" ? (
        <View style={styles.importPanel}>
          <View style={styles.importHeader}>
            <View style={styles.importTitleRow}>
              <View style={styles.importIconWrap}>
                <MaterialCommunityIcons name="file-document-plus-outline" size={18} color={theme.accent} />
              </View>
              <Text style={styles.importTitle}>{t("save.textImportTitle")}</Text>
            </View>
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
                {IMPORT_PREVIEW_LINES.map((line) => (
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
            disabled={importing}
            onPress={() => void importCardsFromTextFile()}
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

      {saveInputMode === "photo" ? (
        <View style={styles.importPanel}>
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
              <Image source={{ uri: photoAsset.uri }} style={styles.photoPreviewImage} resizeMode="cover" />
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
    </View>
  );

  const renderQuizTab = () => (
    <View style={styles.scene}>
      <View style={styles.heroStrip}>
        <Text style={styles.heroEyebrow}>{t("quiz.heroTitle")}</Text>
        <Text style={styles.heroMeta}>
          {pairs.length ? t("quiz.heroReady", { count: pairs.length }) : t("quiz.heroEmpty")}
        </Text>
      </View>

      <View style={styles.quizPanel}>
        <View style={styles.quizHeader}>
          <View style={styles.quizHeaderContent}>
            <Text style={styles.panelTitle}>{t("quiz.panelTitle")}</Text>
            <Text style={styles.panelBody}>
              {quizMode === "both"
                ? t("quiz.panelBodyBoth")
                : t("quiz.panelBodyMode", { description: t(quizModeConfig.descriptionKey) })}
            </Text>
          </View>
          <Pressable
            onPress={() => (deck.length ? resetQuizSession() : startQuiz())}
            style={({ pressed }) => [styles.quizStartButton, pressed && styles.pressed]}
          >
            <Text style={styles.quizStartButtonText}>{deck.length ? t("quiz.reset") : t("quiz.start")}</Text>
          </Pressable>
        </View>

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
              <Pressable onPress={() => startQuiz()} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
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
          <View style={styles.quizCard}>
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

            {showAnswer ? <Text style={styles.answerText}>{t("quiz.answerPrefix", { answer: current.answer })}</Text> : null}

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
          <View style={styles.quizReadyCard}>
            <View style={styles.quizReadyIconWrap}>
              <MaterialCommunityIcons name="brain" size={22} color={theme.accent} />
            </View>
            <Text style={styles.quizReadyTitle}>{t("quiz.readyTitle")}</Text>
            <Text style={styles.quizReadyBody}>{t("quiz.readyBody", { count: maxQuizCount })}</Text>

            <View style={styles.quizReadyStats}>
              <View style={styles.quizReadyStat}>
                <Text style={styles.quizReadyStatValue}>{pairs.length}</Text>
                <Text style={styles.quizReadyStatLabel}>{t("quiz.storedCards")}</Text>
              </View>
              <View style={styles.quizReadyStat}>
                <Text style={styles.quizReadyStatValue}>{resolvedQuizCount}</Text>
                <Text style={styles.quizReadyStatLabel}>{t("quiz.requestedCount")}</Text>
              </View>
              <View style={styles.quizReadyStat}>
                <Text style={styles.quizReadyStatValue}>{maxQuizCount}</Text>
                <Text style={styles.quizReadyStatLabel}>{t("quiz.availableCount")}</Text>
              </View>
            </View>

            <View style={styles.quizCountCard}>
              <View style={styles.quizCountCardHeader}>
                <Text style={styles.quizSetupLabel}>{t("quiz.countLabel")}</Text>
                <Text style={styles.quizCountCompactCaption}>{pairs.length ? t("quiz.countMax", { count: maxQuizCount }) : t("quiz.countWaiting")}</Text>
              </View>

              <View style={styles.quizCountCompactRow}>
                <TextInput
                  value={pairs.length ? quizCountInput : ""}
                  onBlur={normalizeQuizCountInput}
                  onChangeText={(value) => setQuizCountInput(value.replace(/[^0-9]/g, ""))}
                  editable={pairs.length > 0}
                  keyboardType="number-pad"
                  maxLength={3}
                  placeholder="-"
                  placeholderTextColor={theme.textPlaceholder}
                  style={[styles.quizCountCompactInput, !pairs.length && styles.quizCountInputDisabled]}
                />
                <Text style={styles.quizCountCompactHint}>
                  {pairs.length
                    ? t("quiz.countHint")
                    : t("quiz.countHintEmpty")}
                </Text>
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
              <Pressable onPress={() => startQuiz()} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
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
            icon="cards-heart-outline"
            title={t("quiz.emptyTitle")}
            body={t("quiz.emptyBody")}
            actionLabel={t("quiz.emptyAction")}
            onPress={() => handleTabChange("save")}
          />
        )}
      </View>
    </View>
  );

  const renderHistoryTab = () => {
    const missedCards = todayMissedCards.length ? todayMissedCards : topMissedCards;

    return (
      <View style={styles.scene}>
        <View style={styles.heroStrip}>
          <Text style={styles.heroEyebrow}>{t("history.heroTitle")}</Text>
          <Text style={styles.heroMeta}>
            {hasStudyHistory
              ? t("history.heroWithHistory", {
                  sessions: todaySessionCount,
                  incorrect: todayIncorrectCount,
                })
              : t("history.heroEmpty")}
          </Text>
        </View>

        {hasStudyHistory ? (
          <>
            <View style={styles.historySummaryCard}>
              <View style={styles.historySummaryHeader}>
                <Text style={styles.panelTitle}>{t("history.todayTitle")}</Text>
                <Text style={styles.panelBody}>{t("history.todayBody")}</Text>
              </View>
              <View style={styles.historySummaryGrid}>
                <View style={styles.historyMetricCard}>
                  <Text style={styles.historyMetricValue}>{todaySessionCount}</Text>
                  <Text style={styles.historyMetricLabel}>{t("history.sessions")}</Text>
                </View>
                <View style={styles.historyMetricCard}>
                  <Text style={styles.historyMetricValue}>{todaySolvedCount}</Text>
                  <Text style={styles.historyMetricLabel}>{t("history.solved")}</Text>
                </View>
                <View style={styles.historyMetricCard}>
                  <Text style={[styles.historyMetricValue, todayIncorrectCount > 0 && styles.historyMetricValueBad]}>
                    {todayIncorrectCount}
                  </Text>
                  <Text style={styles.historyMetricLabel}>{t("history.incorrect")}</Text>
                </View>
              </View>
            </View>

            <View style={styles.libraryPanel}>
              <View style={styles.panelHeader}>
                <Text style={styles.panelTitle}>{todayMissedCards.length ? t("history.todayMissed") : t("history.topMissed")}</Text>
                <Text style={styles.historyChipText}>{todayMissedCards.length ? t("history.todayBasis") : t("history.totalBasis")}</Text>
              </View>
              <View style={styles.historyList}>
                {missedCards.length ? (
                  missedCards.map((card) => (
                    <View key={`missed-${card.signature}`} style={styles.historyItem}>
                      <View style={styles.historyItemBody}>
                        <Text style={styles.historyItemTitle}>
                          {card.left} ↔ {card.right}
                        </Text>
                        <Text style={styles.historyItemCaption}>
                          {todayMissedCards.length
                            ? t("history.todayMissedCaption", { count: card.count })
                            : t("history.totalMissedCaption", {
                                incorrect: card.incorrect,
                                attempts: card.attempts,
                              })}
                        </Text>
                      </View>
                      <View style={styles.historyBadge}>
                        <Text style={styles.historyBadgeText}>
                          {todayMissedCards.length ? `${card.count}` : `${card.incorrect}`}
                        </Text>
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={styles.historyEmptyText}>{t("history.noMissed")}</Text>
                )}
              </View>
            </View>

            <View style={styles.libraryPanel}>
              <View style={styles.panelHeader}>
                <Text style={styles.panelTitle}>{t("history.recentSessions")}</Text>
              </View>
              <View style={styles.historyList}>
                {recentSessions.map((item) => (
                  <View key={item.id} style={styles.historyItem}>
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
                    <View style={[styles.historyBadge, item.incorrectCount > 0 && styles.historyBadgeBad]}>
                      <Text style={[styles.historyBadgeText, item.incorrectCount > 0 && styles.historyBadgeTextBad]}>
                        {t("history.incorrectBadge", { count: item.incorrectCount })}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </>
        ) : (
          <EmptyPanel
            styles={styles}
            theme={theme}
            icon="chart-line"
            title={t("history.emptyTitle")}
            body={t("history.emptyBody")}
            actionLabel={t("history.emptyAction")}
            onPress={() => handleTabChange("quiz")}
          />
        )}
      </View>
    );
  };

  const renderManageTab = () => (
    <View style={styles.scene}>
      <View style={styles.heroStrip}>
        <Text style={styles.heroEyebrow}>{t("manage.heroTitle")}</Text>
        <Text style={styles.heroMeta}>
          {pairs.length ? t("manage.heroWithCards", { count: pairs.length }) : t("manage.heroEmpty")}
        </Text>
      </View>

      {pairs.length ? (
        <>
          <View style={styles.settingsCard}>
            <View style={styles.settingsHeader}>
              <Text style={styles.settingsTitle}>{t("manage.searchTitle")}</Text>
              <Text style={styles.settingsBody}>{t("manage.searchBody")}</Text>
            </View>
            <TextInput
              value={manageSearch}
              onChangeText={setManageSearch}
              placeholder={t("manage.searchPlaceholder")}
              placeholderTextColor={theme.textPlaceholder}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />

            <View style={styles.settingsHeader}>
              <Text style={styles.settingsTitle}>{t("manage.sortTitle")}</Text>
              <Text style={styles.settingsBody}>{t("manage.sortBody")}</Text>
            </View>
            <View style={styles.supportCategoryRow}>
              {MANAGE_SORT_OPTIONS.map((option) => {
                const active = manageSort === option.key;

                return (
                  <Pressable
                    key={option.key}
                    onPress={() => setManageSort(option.key)}
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
                      {t(option.labelKey)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {visibleManagePairs.length ? (
            <View style={styles.libraryPanel}>
              {visibleManagePairs.map((pair) => (
                <View key={pair.id} style={styles.manageCard}>
                  {editingId === pair.id ? (
                    <>
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

                      <View style={styles.manageActionRow}>
                        <Pressable onPress={() => void saveEdit()} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
                          <Text style={styles.primaryButtonText}>{t("manage.saveEdit")}</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            setEditingId(null);
                            setEditingLeft("");
                            setEditingRight("");
                          }}
                          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
                        >
                          <Text style={styles.secondaryButtonText}>{t("common.cancel")}</Text>
                        </Pressable>
                      </View>
                    </>
                  ) : (
                    <>
                      <View style={styles.manageDisplayStack}>
                        <View style={styles.manageDisplayRow}>
                          <View style={styles.manageTextBlock}>
                            <Text style={styles.previewLabel}>{t("common.front")}</Text>
                            <Text style={styles.managePairText}>{pair.left}</Text>
                          </View>
                          <Pressable
                            onPress={() => {
                              setEditingId(pair.id);
                              setEditingLeft(pair.left);
                              setEditingRight(pair.right);
                            }}
                            style={({ pressed }) => [
                              styles.secondaryButton,
                              styles.manageSideButton,
                              pressed && styles.pressed,
                            ]}
                          >
                            <Text style={styles.secondaryButtonText}>{t("manage.edit")}</Text>
                          </Pressable>
                        </View>
                        <View style={styles.manageDisplayRow}>
                          <View style={styles.manageTextBlock}>
                            <Text style={styles.previewLabel}>{t("common.back")}</Text>
                            <Text style={styles.managePairText}>{pair.right}</Text>
                          </View>
                          <Pressable
                            onPress={() =>
                              Alert.alert(t("manage.deleteTitle"), t("manage.deleteBody"), [
                                { text: t("common.cancel"), style: "cancel" },
                                {
                                  text: t("common.delete"),
                                  style: "destructive",
                                  onPress: () => {
                                    void removePair(pair);
                                  },
                                },
                              ])
                            }
                            style={({ pressed }) => [
                              styles.dangerButton,
                              styles.manageSideButton,
                              pressed && styles.pressed,
                            ]}
                          >
                            <Text style={styles.dangerButtonText}>{t("common.delete")}</Text>
                          </Pressable>
                        </View>
                      </View>
                    </>
                  )}
                </View>
              ))}
            </View>
          ) : (
            <EmptyPanel
              styles={styles}
              theme={theme}
              icon="magnify"
              title={t("manage.searchEmptyTitle")}
              body={t("manage.searchEmptyBody", { query: manageSearch.trim() })}
              actionLabel={t("manage.clearSearch")}
              onPress={() => setManageSearch("")}
            />
          )}
        </>
      ) : (
        <EmptyPanel
          styles={styles}
          theme={theme}
          icon="playlist-remove"
          title={t("manage.emptyTitle")}
          body={t("manage.emptyBody")}
          actionLabel={t("manage.emptyAction")}
          onPress={() => handleTabChange("save")}
        />
      )}
    </View>
  );

  const renderAboutTab = () => (
    <View style={styles.scene}>
      <View style={styles.heroStrip}>
        <Text style={styles.heroEyebrow}>{t("about.heroTitle")}</Text>
        <Text style={styles.heroMeta}>{t("about.heroBody")}</Text>
      </View>

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
            <Text style={styles.settingsBody}>{t("about.themeBody")}</Text>
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
            <Text style={styles.settingsBody}>{t("about.languageBody")}</Text>
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

        <View style={styles.appSummaryCard}>
          <Text style={styles.settingsTitle}>MEMORIA</Text>
          <Text style={styles.settingsBody}>{t("about.summaryBody")}</Text>
          <Pressable onPress={() => setTutorialVisible(true)} style={({ pressed }) => [styles.inlineActionButton, pressed && styles.pressed]}>
            <Text style={styles.inlineActionButtonText}>{t("about.tutorialAgain")}</Text>
          </Pressable>
        </View>

        <View style={styles.settingsCard}>
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
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
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
          keyboardShouldPersistTaps="handled"
        >
          {tab === "save" ? renderSaveTab() : null}
          {tab === "quiz" ? renderQuizTab() : null}
          {tab === "history" ? renderHistoryTab() : null}
          {tab === "manage" ? renderManageTab() : null}
          {tab === "about" ? renderAboutTab() : null}
        </ScrollView>

        <View style={styles.tabs}>
          {TABS.map((item) => {
            const active = tab === item.key;

            return (
              <Pressable
                key={item.key}
                onPress={() => handleTabChange(item.key)}
                style={({ pressed }) => [
                  styles.tab,
                  active && styles.tabActive,
                  pressed && styles.pressed,
                ]}
              >
                <MaterialCommunityIcons
                  name={item.icon}
                  size={22}
                  color={active ? theme.iconContrast : theme.textSecondary}
                />
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{t(item.labelKey)}</Text>
              </Pressable>
            );
          })}
        </View>
      </KeyboardAvoidingView>

      {launchVisible ? (
        <LaunchScreen opacity={launchOpacity} scale={launchScale} glow={moonGlow} styles={styles} />
      ) : null}
      {tutorialVisible ? (
        <TutorialOverlay
          styles={styles}
          theme={theme}
          t={t}
          onClose={() => closeTutorial()}
          onStart={() => closeTutorial("save")}
          onOpenHistory={() => closeTutorial("history")}
        />
      ) : null}
    </SafeAreaView>
  );
}

function EmptyPanel({ icon, title, body, actionLabel, onPress, styles, theme }) {
  return (
    <View style={styles.emptyPanel}>
      <View style={styles.emptyIconWrap}>
        <MaterialCommunityIcons name={icon} size={22} color={theme.accent} />
      </View>
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

function TutorialOverlay({ styles, theme, t, onClose, onStart, onOpenHistory }) {
  return (
    <View style={styles.tutorialOverlay}>
      <Pressable style={styles.tutorialBackdrop} onPress={onClose} />
      <View style={styles.tutorialCard}>
        <View style={styles.tutorialBadge}>
          <MaterialCommunityIcons name="compass-rose" size={20} color={theme.accentText} />
        </View>
        <Text style={styles.tutorialTitle}>{t("tutorial.title")}</Text>
        <Text style={styles.tutorialBody}>{t("tutorial.body")}</Text>

        <View style={styles.tutorialStepList}>
          <View style={styles.tutorialStep}>
            <View style={styles.tutorialStepIcon}>
              <MaterialCommunityIcons name="cards-outline" size={18} color={theme.accent} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.tutorialStepTitle}>{t("tutorial.step1Title")}</Text>
              <Text style={styles.tutorialStepBody}>{t("tutorial.step1Body")}</Text>
            </View>
          </View>

          <View style={styles.tutorialStep}>
            <View style={styles.tutorialStepIcon}>
              <MaterialCommunityIcons name="brain" size={18} color={theme.accent} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.tutorialStepTitle}>{t("tutorial.step2Title")}</Text>
              <Text style={styles.tutorialStepBody}>{t("tutorial.step2Body")}</Text>
            </View>
          </View>

          <View style={styles.tutorialStep}>
            <View style={styles.tutorialStepIcon}>
              <MaterialCommunityIcons name="chart-timeline-variant" size={18} color={theme.accent} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.tutorialStepTitle}>{t("tutorial.step3Title")}</Text>
              <Text style={styles.tutorialStepBody}>{t("tutorial.step3Body")}</Text>
            </View>
          </View>
        </View>

        <View style={styles.tutorialActionRow}>
          <Pressable onPress={onOpenHistory} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
            <Text style={styles.secondaryButtonText}>{t("tutorial.viewHistory")}</Text>
          </Pressable>
          <Pressable onPress={onStart} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            <Text style={styles.primaryButtonText}>{t("tutorial.startNow")}</Text>
          </Pressable>
        </View>
      </View>
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
    paddingBottom: Platform.OS === "android" ? 188 : 144,
  },
  scene: {
    gap: 16,
  },
  saveScene: {
    justifyContent: "flex-start",
  },
  saveModeRow: {
    flexDirection: "row",
    gap: 10,
  },
  saveModeChip: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 62,
    borderRadius: 20,
    backgroundColor: theme.accentSoft,
    borderWidth: 1,
    borderColor: theme.surfaceBorder,
    paddingHorizontal: 10,
  },
  saveModeChipActive: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  saveModeChipText: {
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
    color: theme.textStrong,
  },
  saveModeChipTextActive: {
    color: theme.accentText,
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
  composerTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    color: theme.textPrimary,
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
  },
  primaryButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    paddingVertical: 15,
    backgroundColor: theme.accent,
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
    fontSize: 15,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  importBody: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 21,
    color: theme.textSecondary,
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
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  panelTitle: {
    fontSize: 21,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  panelBody: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 21,
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
    gap: 10,
  },
  quizReadyStat: {
    flex: 1,
    gap: 6,
    padding: 14,
    borderRadius: 18,
    backgroundColor: theme.surfaceCard,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
  },
  quizReadyStatValue: {
    fontSize: 24,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  quizReadyStatLabel: {
    fontSize: 12,
    color: theme.textSecondary,
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
    gap: 10,
    padding: 16,
    borderRadius: 22,
    backgroundColor: theme.surface,
  },
  manageDisplayStack: {
    gap: 14,
  },
  manageDisplayRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  manageTextBlock: {
    flex: 1,
    minWidth: 0,
    gap: 4,
    paddingVertical: 4,
  },
  managePairText: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "700",
    color: theme.textPrimary,
  },
  manageSideButton: {
    flex: 0,
    width: 108,
    minHeight: 58,
    paddingVertical: 0,
  },
  aboutStack: {
    gap: 12,
  },
  settingsCard: {
    gap: 14,
    padding: 18,
    borderRadius: 24,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.surfaceBorder,
  },
  settingsHeader: {
    gap: 6,
  },
  settingsTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  settingsBody: {
    fontSize: 14,
    lineHeight: 22,
    color: theme.textSecondary,
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
  supportForm: {
    gap: 12,
  },
  supportCategoryRow: {
    flexDirection: "row",
    gap: 8,
  },
  supportCategoryChip: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    borderRadius: 16,
    backgroundColor: theme.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.surfaceBorder,
    paddingHorizontal: 10,
  },
  supportCategoryChipActive: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  supportCategoryChipText: {
    fontSize: 13,
    fontWeight: "800",
    color: theme.textStrong,
  },
  supportCategoryChipTextActive: {
    color: theme.accentText,
  },
  supportField: {
    gap: 6,
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
    gap: 16,
    padding: 18,
    borderRadius: 26,
    backgroundColor: theme.surfaceStrong,
    borderWidth: 1,
    borderColor: theme.surfaceBorder,
  },
  historySummaryHeader: {
    gap: 6,
  },
  historySummaryGrid: {
    flexDirection: "row",
    gap: 10,
  },
  historyMetricCard: {
    flex: 1,
    gap: 6,
    padding: 14,
    borderRadius: 18,
    backgroundColor: theme.surfaceCard,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
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
  historyList: {
    gap: 10,
  },
  historyItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
  },
  historyItemBody: {
    flex: 1,
    gap: 4,
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
    bottom: Platform.OS === "android" ? 28 : 14,
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
  tabText: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 16,
    color: theme.tabText,
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
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  tutorialBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.mode === "dark" ? "rgba(4, 7, 15, 0.72)" : "rgba(19, 27, 48, 0.22)",
  },
  tutorialCard: {
    gap: 16,
    padding: 22,
    borderRadius: 28,
    backgroundColor: theme.surfaceStrong,
    borderWidth: 1,
    borderColor: theme.surfaceBorder,
  },
  tutorialBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.accent,
  },
  tutorialTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  tutorialBody: {
    fontSize: 14,
    lineHeight: 22,
    color: theme.textSecondary,
  },
  tutorialStepList: {
    gap: 12,
  },
  tutorialStep: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
  },
  tutorialStepIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.accentSoft,
  },
  tutorialStepTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  tutorialStepBody: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 20,
    color: theme.textSecondary,
  },
  tutorialActionRow: {
    flexDirection: "row",
    gap: 12,
  },
});
