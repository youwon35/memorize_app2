import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
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
import { makeRedirectUri } from "expo-auth-session";
import { File } from "expo-file-system";
import * as WebBrowser from "expo-web-browser";

import { isSupabaseConfigured, supabase } from "./src/lib/supabase";
import {
  buildPracticeDeck,
  compareAnswers,
  createLocalPair,
  createSignature,
  getDirectionLabel,
  mapPairRecord,
  mergePairsBySignature,
  parseImportedPairs,
  shuffleItems,
  sortPairs,
  updatePairValues,
} from "./src/utils/memory";

WebBrowser.maybeCompleteAuthSession();

const APP_NAME = "MEMORIA";
const STORAGE_KEY = "@memoria/cards";
const THEME_MODE_KEY = "@memoria/theme-mode";
const LEGACY_STORAGE_KEYS = ["@memora/study-pairs"];
const APP_SCHEME = process.env.EXPO_PUBLIC_APP_SCHEME || "memoria";
const RELEASE_REDIRECT_URI = `${APP_SCHEME}://auth/callback`;
const DEFAULT_QUIZ_COUNT = 10;
const THEME_OPTIONS = [
  { key: "dark", label: "다크", icon: "weather-night" },
  { key: "light", label: "라이트", icon: "white-balance-sunny" },
];
const QUIZ_MODE_OPTIONS = [
  {
    key: "both",
    label: "양방향 랜덤",
    chipLabel: "양방향",
    description: "앞면과 뒷면이 모두 문제로 섞여 출제됩니다.",
  },
  {
    key: "front",
    label: "앞면 -> 뒷면",
    chipLabel: "앞면만",
    description: "앞면을 보고 뒷면을 맞히는 문제만 출제됩니다.",
  },
  {
    key: "back",
    label: "뒷면 -> 앞면",
    chipLabel: "뒷면만",
    description: "뒷면을 보고 앞면을 떠올리는 문제만 출제됩니다.",
  },
];
const TABS = [
  { key: "save", label: "저장", icon: "cards-outline" },
  { key: "quiz", label: "암기", icon: "brain" },
  { key: "manage", label: "보관함", icon: "playlist-edit" },
  { key: "about", label: "앱 정보", icon: "information-outline" },
];
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

export default function App() {
  const [tab, setTab] = useState("save");
  const [themeMode, setThemeMode] = useState("dark");
  const [pairs, setPairs] = useState([]);
  const [draft, setDraft] = useState({ left: "", right: "" });
  const [storageReady, setStorageReady] = useState(false);
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [authBusy, setAuthBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [note, setNote] = useState(
    isSupabaseConfigured
      ? "Google 로그인으로 여러 기기를 동기화할 수 있습니다."
      : "현재는 로컬 저장 모드입니다. Supabase를 연결하면 Google 로그인이 열립니다."
  );
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
  const [roundComplete, setRoundComplete] = useState(false);
  const [roundIncorrectIds, setRoundIncorrectIds] = useState([]);
  const [launchVisible, setLaunchVisible] = useState(true);

  const timerRef = useRef(null);
  const pairsRef = useRef(pairs);
  const bootStartedAt = useRef(Date.now());
  const launchOpacity = useRef(new Animated.Value(1)).current;
  const launchScale = useRef(new Animated.Value(0.94)).current;
  const moonGlow = useRef(new Animated.Value(0.56)).current;

  const theme = themeMode === "light" ? LIGHT_THEME : DARK_THEME;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const current = deck[quizIndex] ?? null;
  const redirectUri = makeRedirectUri({ scheme: APP_SCHEME, path: "auth/callback" });
  const recentPairs = useMemo(() => pairs.slice(0, 4), [pairs]);
  const authTitle = session?.user?.email
    ? session.user.email
    : isSupabaseConfigured
      ? "Google 계정으로 카드 보관하기"
      : "로컬 저장 모드";
  const authCaption = syncing ? "동기화 중..." : note;
  const hasSavedCards = pairs.length > 0;
  const quizModeConfig = getQuizModeConfig(quizMode);
  const maxQuizCount = pairs.length ? pairs.length * (quizMode === "both" ? 2 : 1) : 0;
  const parsedQuizCount = Number.parseInt(quizCountInput, 10);
  const resolvedQuizCount = !maxQuizCount
    ? 0
    : Number.isFinite(parsedQuizCount) && parsedQuizCount > 0
      ? Math.min(parsedQuizCount, maxQuizCount)
      : Math.min(DEFAULT_QUIZ_COUNT, maxQuizCount);
  const quizPresetOptions = useMemo(() => {
    if (!maxQuizCount) {
      return [];
    }

    return Array.from(
      new Set([Math.min(5, maxQuizCount), Math.min(10, maxQuizCount), maxQuizCount])
    );
  }, [maxQuizCount]);
  const roundIncorrectCards = useMemo(() => {
    if (!deck.length || !roundIncorrectIds.length) {
      return [];
    }

    const incorrectIdSet = new Set(roundIncorrectIds);

    return deck.filter((card) => incorrectIdSet.has(card.id));
  }, [deck, roundIncorrectIds]);
  const roundCorrectCount = deck.length - roundIncorrectCards.length;

  useEffect(() => {
    pairsRef.current = pairs;
  }, [pairs]);

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
        const storedThemeMode = await AsyncStorage.getItem(THEME_MODE_KEY);

        if (storedThemeMode === "dark" || storedThemeMode === "light") {
          setThemeMode(storedThemeMode);
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
    void AsyncStorage.setItem(THEME_MODE_KEY, themeMode);
  }, [themeMode]);

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
      setNote(
        nextSession?.user
          ? "Google 계정과 연결되었습니다."
          : "Google 로그인으로 여러 기기를 동기화할 수 있습니다."
      );
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
          setNote("Google 계정과 동기화되었습니다.");
        }
      } catch (error) {
        if (active) {
          setNote(error?.message || "동기화에 실패했습니다.");
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
  }, [pairs.length]);

  const savePairs = async (nextPairs) => {
    const sorted = sortPairs(nextPairs);

    setPairs(sorted);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));
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
        setNote("클라우드 저장 실패로 로컬에만 저장했습니다.");
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
      Alert.alert("입력 필요", "앞면과 뒷면을 모두 입력해 주세요.");
      return;
    }

    const saveResult = await saveEntryBatch([{ left, right }]);

    if (!saveResult.savedCount) {
      Alert.alert("이미 저장된 카드", "같은 조합의 카드는 이미 보관함에 있습니다.");
      return;
    }

    setDraft({ left: "", right: "" });

    if (saveResult.cloudSaved) {
      setNote("새 카드가 Google 계정에도 저장되었습니다.");
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
        throw new Error("선택한 파일을 읽을 수 없습니다.");
      }

      const file = new File(asset.uri);
      const text = await file.text();
      const { entries, invalidLineNumbers } = parseImportedPairs(text);

      if (!entries.length) {
        Alert.alert(
          "카드를 찾지 못했습니다",
          invalidLineNumbers.length
            ? "형식이 맞는 줄이 없습니다. 가장 안전한 형식은 한 줄에 앞면과 뒷면을 탭으로 구분하는 방식입니다."
            : "비어 있는 파일입니다."
        );
        return;
      }

      const saveResult = await saveEntryBatch(entries);
      const messages = [];

      if (saveResult.savedCount) {
        messages.push(`${saveResult.savedCount}개의 카드를 만들었습니다.`);
      }

      if (saveResult.skippedDuplicates) {
        messages.push(
          `${saveResult.skippedDuplicates}개는 이미 있거나 파일 안에서 중복되어 건너뛰었습니다.`
        );
      }

      if (invalidLineNumbers.length) {
        messages.push(
          `${invalidLineNumbers.length}개 줄은 형식이 맞지 않아 제외했습니다.`
        );
      }

      if (!saveResult.savedCount) {
        Alert.alert("텍스트 불러오기 완료", messages.join(" "));
        return;
      }

      setNote(
        saveResult.cloudSaved
          ? `${saveResult.savedCount}개의 카드가 Google 계정에도 저장되었습니다.`
          : `${saveResult.savedCount}개의 카드를 파일에서 불러왔습니다.`
      );
      Alert.alert("텍스트 불러오기 완료", messages.join(" "));
    } catch (error) {
      Alert.alert(
        "텍스트 파일 불러오기 실패",
        error?.message || "파일 내용을 읽는 중 문제가 생겼습니다."
      );
    } finally {
      setImporting(false);
    }
  };

  const selectQuizCount = (count) => {
    if (!maxQuizCount) {
      return;
    }

    setQuizCountInput(`${Math.max(1, Math.min(count, maxQuizCount))}`);
  };

  const normalizeQuizCountInput = () => {
    if (!maxQuizCount) {
      return;
    }

    setQuizCountInput(`${resolvedQuizCount}`);
  };

  const beginQuizRound = (nextDeck) => {
    clearTimeout(timerRef.current);
    setDeck(nextDeck);
    setQuizIndex(0);
    setAnswer("");
    setFeedback("");
    setResult(null);
    setShowAnswer(false);
    setRoundComplete(false);
    setRoundIncorrectIds([]);
    setTab("quiz");
  };

  const startQuiz = (requestedCount = resolvedQuizCount) => {
    if (!pairs.length) {
      Alert.alert("문제가 없습니다", "먼저 카드 한 장 이상을 저장해 주세요.");
      return;
    }

    beginQuizRound(buildPracticeDeck(pairs, requestedCount || maxQuizCount, quizMode));
  };

  const retryIncorrectCards = () => {
    if (!roundIncorrectCards.length) {
      Alert.alert("오답 없음", "이번 라운드에는 다시 풀 문제가 없습니다.");
      return;
    }

    beginQuizRound(shuffleItems(roundIncorrectCards));
  };

  const goNext = () => {
    if (!deck.length) {
      return;
    }

    clearTimeout(timerRef.current);
    setAnswer("");
    setFeedback("");
    setResult(null);
    setShowAnswer(false);

    if (quizIndex + 1 >= deck.length) {
      setRoundComplete(true);
      return;
    }

    setQuizIndex((currentIndex) => currentIndex + 1);
  };

  const submitAnswer = () => {
    if (!current) {
      return;
    }

    if (!answer.trim()) {
      Alert.alert("답 입력", "정답을 입력해 주세요.");
      return;
    }

    if (compareAnswers(answer, current.answer)) {
      setResult("correct");
      setFeedback("정답입니다");
      timerRef.current = setTimeout(goNext, 900);
      return;
    }

    setResult("incorrect");
    setFeedback("다시 한 번 생각해 보세요");
    setRoundIncorrectIds((currentIds) =>
      currentIds.includes(current.id) ? currentIds : [...currentIds, current.id]
    );
  };

  const saveEdit = async () => {
    const target = pairs.find((pair) => pair.id === editingId);

    if (!target || !editingLeft.trim() || !editingRight.trim()) {
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
        Alert.alert("수정 실패", response.error.message);
        return;
      }

      updated = mapPairRecord(response.data);
    }

    await savePairs(pairs.map((pair) => (pair.id === target.id ? updated : pair)));
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
        Alert.alert("삭제 실패", response.error.message);
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
      Alert.alert("로그아웃 실패", error?.message || "잠시 후 다시 시도해 주세요.");
    } finally {
      setAuthBusy(false);
    }
  };

  const login = async () => {
    if (!supabase) {
      Alert.alert(
        "Google 로그인 준비 필요",
        "Supabase URL과 Anon Key를 .env에 넣으면 Google 로그인을 바로 테스트할 수 있습니다."
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
        throw error || new Error("로그인 URL 생성 실패");
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
        setNote("로그인이 완료되지 않았습니다. 설정을 다시 확인해 주세요.");
      }
    } catch (error) {
      Alert.alert("Google 로그인 실패", error?.message || "설정을 확인해 주세요.");
    } finally {
      setAuthBusy(false);
    }
  };

  const renderSaveTab = () => (
    <View style={[styles.scene, styles.saveScene]}>
      <View style={styles.composerPanel}>
        <Text style={styles.composerTitle}>카드를 하나씩 차분하게 쌓아 두세요.</Text>
        <Text style={styles.composerBody}>
          저장하면 앞면과 뒷면이 모두 문제로 출제됩니다. 추가 버튼 없이 바로 한 장씩 기록하도록 단순화했습니다.
        </Text>

        <Text style={styles.inputLabel}>앞면</Text>
        <TextInput
          value={draft.left}
          onChangeText={(value) => setDraft((currentDraft) => ({ ...currentDraft, left: value }))}
          placeholder="문제로 보여줄 단어 또는 문장"
          placeholderTextColor={theme.textPlaceholder}
          style={[styles.input, styles.multilineInput]}
          multiline
          textAlignVertical="top"
        />

        <Text style={styles.inputLabel}>뒷면</Text>
        <TextInput
          value={draft.right}
          onChangeText={(value) => setDraft((currentDraft) => ({ ...currentDraft, right: value }))}
          placeholder="뜻, 번역, 해설 또는 정답"
          placeholderTextColor={theme.textPlaceholder}
          style={[styles.input, styles.multilineInput]}
          multiline
          textAlignVertical="top"
        />

        <View style={styles.actionRow}>
          <Pressable onPress={() => void saveCard()} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            <Text style={styles.primaryButtonText}>저장하기</Text>
          </Pressable>
          <Pressable onPress={startQuiz} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
            <Text style={styles.secondaryButtonText}>바로 암기</Text>
          </Pressable>
        </View>

        <View style={styles.importPanel}>
          <View style={styles.importHeader}>
            <View style={styles.importIconWrap}>
              <MaterialCommunityIcons name="file-document-plus-outline" size={18} color={theme.accent} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.importTitle}>텍스트 파일로 여러 장 한꺼번에 추가</Text>
              <Text style={styles.importBody}>
                한 줄에 한 쌍씩 적으면 됩니다. 가장 안전한 형식은 `앞면[TAB]뒷면`이고,
                현재 예시처럼 `sun 해`처럼 공백 한 칸 형식도 읽습니다.
              </Text>
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
            <Text style={styles.importButtonText}>{importing ? "불러오는 중..." : "텍스트 파일 불러오기"}</Text>
          </Pressable>
        </View>
      </View>

      {recentPairs.length ? (
        <View style={styles.libraryPanel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>최근 저장 카드</Text>
            <Pressable onPress={() => setTab("manage")} style={({ pressed }) => [styles.inlineLink, pressed && styles.pressed]}>
              <Text style={styles.inlineLinkText}>보관함 열기</Text>
            </Pressable>
          </View>
          <View style={styles.libraryList}>
            {recentPairs.map((pair) => (
              <PreviewRow key={pair.id} pair={pair} styles={styles} />
            ))}
          </View>
        </View>
      ) : (
        <EmptyPanel
          styles={styles}
          theme={theme}
          icon="meteor"
          title="첫 카드를 저장하면 이곳에 최근 기록이 보입니다."
          body="짧은 단어부터 길게 외울 문장까지 바로 넣어보세요."
        />
      )}
    </View>
  );

  const renderQuizTab = () => (
    <View style={styles.scene}>
      <View style={styles.heroStrip}>
        <Text style={styles.heroEyebrow}>오늘의 암기</Text>
        <Text style={styles.heroMeta}>{pairs.length ? `${pairs.length}장의 카드가 준비되어 있습니다.` : "저장된 카드가 아직 없습니다."}</Text>
      </View>

      <View style={styles.quizPanel}>
        <View style={styles.quizHeader}>
          <View style={styles.quizHeaderContent}>
            <Text style={styles.panelTitle}>랜덤 퀴즈</Text>
            <Text style={styles.panelBody}>
              {quizMode === "both"
                ? "앞면과 뒷면이 함께 섞이고, 시작할 때마다 랜덤 순서로 출제됩니다."
                : quizModeConfig.description}
            </Text>
          </View>
          <Pressable onPress={startQuiz} style={({ pressed }) => [styles.quizStartButton, pressed && styles.pressed]}>
            <Text style={styles.quizStartButtonText}>{deck.length ? "다시 시작" : "시작"}</Text>
          </Pressable>
        </View>

        <View style={styles.quizSetupRow}>
          <View style={styles.quizSetupCard}>
            <Text style={styles.quizSetupLabel}>이번 라운드 문제 수</Text>
            <Text style={styles.quizSetupHint}>
              {pairs.length
                ? `1부터 ${maxQuizCount}문제까지 정할 수 있고, 시작할 때마다 랜덤으로 섞입니다.`
                : "카드를 저장하면 여기서 출제 문제 수를 정할 수 있습니다."}
            </Text>
          </View>

          <View style={styles.quizCountBox}>
            <Text style={styles.quizCountLabel}>문제 수</Text>
            <TextInput
              value={pairs.length ? quizCountInput : ""}
              onBlur={normalizeQuizCountInput}
              onChangeText={(value) => setQuizCountInput(value.replace(/[^0-9]/g, ""))}
              editable={pairs.length > 0}
              keyboardType="number-pad"
              maxLength={3}
              placeholder="-"
              placeholderTextColor={theme.textPlaceholder}
              style={[styles.quizCountInput, !pairs.length && styles.quizCountInputDisabled]}
            />
            <Text style={styles.quizCountCaption}>{pairs.length ? `최대 ${maxQuizCount}` : "대기"}</Text>
          </View>
        </View>

        <View style={styles.quizModeCard}>
          <Text style={styles.quizSetupLabel}>출제 방향</Text>
          <Text style={styles.quizSetupHint}>
            {pairs.length
              ? quizModeConfig.description
              : "카드를 저장하면 여기서 양방향 또는 한 방향 출제를 고를 수 있습니다."}
          </Text>
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
                  <Text style={[styles.quizModeChipText, active && styles.quizModeChipTextActive]}>
                    {option.chipLabel}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {quizPresetOptions.length ? (
          <View style={styles.quizPresetRow}>
            {quizPresetOptions.map((count) => (
              <Pressable
                key={`quiz-count-${count}`}
                onPress={() => selectQuizCount(count)}
                style={({ pressed }) => [
                  styles.quizPresetChip,
                  resolvedQuizCount === count && styles.quizPresetChipActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.quizPresetText,
                    resolvedQuizCount === count && styles.quizPresetTextActive,
                  ]}
                >
                  {count === maxQuizCount ? "전체" : `${count}문제`}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {roundComplete && deck.length ? (
          <View style={styles.quizSummaryCard}>
            <View style={styles.quizSummaryHeader}>
              <Text style={styles.panelTitle}>라운드 완료</Text>
              <Text style={styles.panelBody}>
                {roundIncorrectCards.length
                  ? "틀린 문제만 다시 모아서 바로 한 번 더 풀 수 있습니다."
                  : "이번 라운드는 모두 맞혔습니다. 같은 개수로 다시 랜덤 시작도 가능합니다."}
              </Text>
            </View>

            <View style={styles.quizSummaryStats}>
              <View style={styles.quizSummaryStat}>
                <Text style={styles.quizSummaryValue}>{deck.length}</Text>
                <Text style={styles.quizSummaryLabel}>전체 문제</Text>
              </View>
              <View style={styles.quizSummaryStat}>
                <Text style={[styles.quizSummaryValue, styles.quizSummaryValueGood]}>
                  {roundCorrectCount}
                </Text>
                <Text style={styles.quizSummaryLabel}>맞힌 문제</Text>
              </View>
              <View style={styles.quizSummaryStat}>
                <Text style={[styles.quizSummaryValue, styles.quizSummaryValueBad]}>
                  {roundIncorrectCards.length}
                </Text>
                <Text style={styles.quizSummaryLabel}>다시 풀 문제</Text>
              </View>
            </View>

            <View style={styles.actionRow}>
              <Pressable onPress={startQuiz} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
                <Text style={styles.secondaryButtonText}>다시 랜덤 시작</Text>
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
                  오답만 다시풀기
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
              <Text style={styles.quizBadge}>{getDirectionLabel(current.direction)}</Text>
            </View>

            <Text style={styles.quizPrompt}>{current.prompt}</Text>

            <TextInput
              value={answer}
              onChangeText={setAnswer}
              placeholder="정답 입력"
              placeholderTextColor={theme.textPlaceholder}
              autoCapitalize="none"
              style={styles.input}
            />

            {feedback ? (
              <Text style={[styles.feedback, result === "correct" ? styles.feedbackGood : styles.feedbackBad]}>
                {feedback}
              </Text>
            ) : null}

            {showAnswer ? <Text style={styles.answerText}>정답: {current.answer}</Text> : null}

            <View style={styles.actionRow}>
              <Pressable onPress={submitAnswer} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
                <Text style={styles.primaryButtonText}>제출</Text>
              </Pressable>
              <Pressable onPress={() => setShowAnswer(true)} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
                <Text style={styles.secondaryButtonText}>정답 보기</Text>
              </Pressable>
            </View>

            <Pressable onPress={goNext} style={({ pressed }) => [styles.ghostButton, pressed && styles.pressed]}>
              <Text style={styles.ghostButtonText}>다음 카드로 넘어가기</Text>
            </Pressable>
          </View>
        ) : hasSavedCards ? (
          <View style={styles.quizReadyCard}>
            <View style={styles.quizReadyIconWrap}>
              <MaterialCommunityIcons name="brain" size={22} color={theme.accent} />
            </View>
            <Text style={styles.quizReadyTitle}>카드가 준비됐어요. 바로 암기를 시작할 수 있습니다.</Text>
            <Text style={styles.quizReadyBody}>
              {quizModeConfig.label} 모드로 맞춰져 있고, 이번 라운드에서는
              최대 {maxQuizCount}문제까지 출제할 수 있습니다.
            </Text>

            <View style={styles.quizReadyStats}>
              <View style={styles.quizReadyStat}>
                <Text style={styles.quizReadyStatValue}>{pairs.length}</Text>
                <Text style={styles.quizReadyStatLabel}>저장 카드</Text>
              </View>
              <View style={styles.quizReadyStat}>
                <Text style={styles.quizReadyStatValue}>{resolvedQuizCount}</Text>
                <Text style={styles.quizReadyStatLabel}>이번 문제 수</Text>
              </View>
              <View style={styles.quizReadyStat}>
                <Text style={styles.quizReadyStatValue}>{maxQuizCount}</Text>
                <Text style={styles.quizReadyStatLabel}>출제 가능</Text>
              </View>
            </View>

            <View style={styles.actionRow}>
              <Pressable onPress={startQuiz} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
                <Text style={styles.primaryButtonText}>랜덤 암기 시작</Text>
              </Pressable>
              <Pressable onPress={() => setTab("manage")} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
                <Text style={styles.secondaryButtonText}>보관함 보기</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <EmptyPanel
            styles={styles}
            theme={theme}
            icon="cards-heart-outline"
            title="지금은 퀴즈를 시작할 카드가 없습니다."
            body="저장 탭에서 카드를 만들면 바로 이 화면에서 랜덤 암기를 시작할 수 있습니다."
            actionLabel="저장 탭으로 이동"
            onPress={() => setTab("save")}
          />
        )}
      </View>
    </View>
  );

  const renderManageTab = () => (
    <View style={styles.scene}>
      <View style={styles.heroStrip}>
        <Text style={styles.heroEyebrow}>보관함</Text>
        <Text style={styles.heroMeta}>
          {pairs.length ? `${pairs.length}장의 카드를 수정하거나 삭제할 수 있습니다.` : "아직 저장된 카드가 없습니다."}
        </Text>
      </View>

      {pairs.length ? (
        <View style={styles.libraryPanel}>
          {pairs.map((pair) => (
            <View key={pair.id} style={styles.manageCard}>
              {editingId === pair.id ? (
                <>
                  <Text style={styles.inputLabel}>앞면</Text>
                  <TextInput
                    value={editingLeft}
                    onChangeText={setEditingLeft}
                    placeholder="앞면 입력"
                    placeholderTextColor={theme.textPlaceholder}
                    style={[styles.input, styles.multilineInput]}
                    multiline
                    textAlignVertical="top"
                  />

                  <Text style={styles.inputLabel}>뒷면</Text>
                  <TextInput
                    value={editingRight}
                    onChangeText={setEditingRight}
                    placeholder="뒷면 입력"
                    placeholderTextColor={theme.textPlaceholder}
                    style={[styles.input, styles.multilineInput]}
                    multiline
                    textAlignVertical="top"
                  />

                  <View style={styles.manageActionRow}>
                    <Pressable onPress={() => void saveEdit()} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
                      <Text style={styles.primaryButtonText}>수정 저장</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setEditingId(null);
                        setEditingLeft("");
                        setEditingRight("");
                      }}
                      style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
                    >
                      <Text style={styles.secondaryButtonText}>취소</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <PreviewRow pair={pair} large styles={styles} />
                  <View style={styles.manageActionRow}>
                    <Pressable
                      onPress={() => {
                        setEditingId(pair.id);
                        setEditingLeft(pair.left);
                        setEditingRight(pair.right);
                      }}
                      style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
                    >
                      <Text style={styles.secondaryButtonText}>수정</Text>
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        Alert.alert("카드 삭제", "이 카드를 보관함에서 삭제할까요?", [
                          { text: "취소", style: "cancel" },
                          {
                            text: "삭제",
                            style: "destructive",
                            onPress: () => {
                              void removePair(pair);
                            },
                          },
                        ])
                      }
                      style={({ pressed }) => [styles.dangerButton, pressed && styles.pressed]}
                    >
                      <Text style={styles.dangerButtonText}>삭제</Text>
                    </Pressable>
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
          icon="playlist-remove"
          title="보관함은 저장된 카드가 생기면 바로 채워집니다."
          body="중앙 입력 패널에서 카드 하나를 저장한 뒤 다시 확인해 보세요."
          actionLabel="카드 저장하러 가기"
          onPress={() => setTab("save")}
        />
      )}
    </View>
  );

  const renderAboutTab = () => (
    <View style={styles.scene}>
      <View style={styles.heroStrip}>
        <Text style={styles.heroEyebrow}>앱 정보</Text>
        <Text style={styles.heroMeta}>
          계정 상태와 화면 모드를 간단하게 확인할 수 있습니다.
        </Text>
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
                ? "설정 필요"
                : session?.user
                  ? authBusy
                    ? "처리 중"
                    : "로그아웃"
                  : authBusy
                    ? "연결 중"
                    : "Google 로그인"}
            </Text>
          </Pressable>
        </View>

        <View style={styles.settingsCard}>
          <View style={styles.settingsHeader}>
            <Text style={styles.settingsTitle}>화면 모드</Text>
            <Text style={styles.settingsBody}>원하는 분위기에 맞춰 다크/라이트 모드를 바로 전환할 수 있습니다.</Text>
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
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.appSummaryCard}>
          <Text style={styles.settingsTitle}>MEMORIA</Text>
          <Text style={styles.settingsBody}>
            앞면과 뒷면 한 쌍으로 카드를 저장하고, 원하는 방향으로 문제를 반복해서 암기하는 앱입니다.
          </Text>
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
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {tab === "save" ? renderSaveTab() : null}
          {tab === "quiz" ? renderQuizTab() : null}
          {tab === "manage" ? renderManageTab() : null}
          {tab === "about" ? renderAboutTab() : null}
        </ScrollView>

        <View style={styles.tabs}>
          {TABS.map((item) => {
            const active = tab === item.key;

            return (
              <Pressable
                key={item.key}
                onPress={() => setTab(item.key)}
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
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </KeyboardAvoidingView>

      {launchVisible ? (
        <LaunchScreen opacity={launchOpacity} scale={launchScale} glow={moonGlow} styles={styles} />
      ) : null}
    </SafeAreaView>
  );
}

function PreviewRow({ pair, large = false, styles }) {
  return (
    <View style={[styles.previewRow, large && styles.previewRowLarge]}>
      <View style={styles.previewColumn}>
        <Text style={styles.previewLabel}>앞면</Text>
        <Text style={styles.previewText}>{pair.left}</Text>
      </View>
      <Text style={styles.previewDivider}>↔</Text>
      <View style={styles.previewColumn}>
        <Text style={styles.previewLabel}>뒷면</Text>
        <Text style={styles.previewText}>{pair.right}</Text>
      </View>
    </View>
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
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  composerBody: {
    fontSize: 14,
    lineHeight: 22,
    color: theme.textMuted,
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
  importPanel: {
    gap: 14,
    padding: 16,
    borderRadius: 24,
    backgroundColor: theme.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
  },
  importHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
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
  ghostButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: theme.surfaceBorder,
    backgroundColor: theme.surfaceGhost,
  },
  ghostButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.textSoft,
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
  quizSetupRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "stretch",
  },
  quizModeCard: {
    gap: 12,
    padding: 16,
    borderRadius: 20,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
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
  quizSetupCard: {
    flex: 1,
    gap: 6,
    padding: 16,
    borderRadius: 20,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
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
  quizCountBox: {
    width: 108,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 20,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.surfaceBorderSoft,
  },
  quizCountLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: theme.textSecondary,
  },
  quizCountInput: {
    minWidth: 54,
    paddingVertical: 0,
    fontSize: 30,
    fontWeight: "800",
    textAlign: "center",
    color: theme.textPrimary,
  },
  quizCountInputDisabled: {
    color: theme.textMuted,
  },
  quizCountCaption: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  quizPresetRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  quizPresetChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: theme.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.surfaceBorder,
  },
  quizPresetChipActive: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  quizPresetText: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.textStrong,
  },
  quizPresetTextActive: {
    color: theme.accentText,
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
});
