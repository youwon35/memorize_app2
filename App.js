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
import { makeRedirectUri } from "expo-auth-session";
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
  sortPairs,
  updatePairValues,
} from "./src/utils/memory";

WebBrowser.maybeCompleteAuthSession();

const APP_NAME = "MEMORIA";
const STORAGE_KEY = "@memoria/cards";
const LEGACY_STORAGE_KEYS = ["@memora/study-pairs"];
const APP_SCHEME = process.env.EXPO_PUBLIC_APP_SCHEME || "memoria";
const RELEASE_REDIRECT_URI = `${APP_SCHEME}://auth/callback`;
const DEFAULT_QUIZ_COUNT = 10;
const TABS = [
  { key: "save", label: "저장", icon: "cards-outline" },
  { key: "quiz", label: "암기", icon: "moon-waning-crescent" },
  { key: "manage", label: "보관함", icon: "playlist-edit" },
  { key: "about", label: "정보", icon: "information-outline" },
];
const STAR_FIELD = [
  { top: 34, left: 28, size: 4, opacity: 0.45 },
  { top: 112, right: 44, size: 6, opacity: 0.32 },
  { top: 240, left: 54, size: 3, opacity: 0.26 },
  { top: 328, right: 84, size: 5, opacity: 0.18 },
  { top: 520, left: 24, size: 3, opacity: 0.24 },
  { top: 640, right: 26, size: 4, opacity: 0.2 },
];

export default function App() {
  const [tab, setTab] = useState("save");
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
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState("");
  const [result, setResult] = useState(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [launchVisible, setLaunchVisible] = useState(true);

  const timerRef = useRef(null);
  const pairsRef = useRef(pairs);
  const bootStartedAt = useRef(Date.now());
  const launchOpacity = useRef(new Animated.Value(1)).current;
  const launchScale = useRef(new Animated.Value(0.94)).current;
  const moonGlow = useRef(new Animated.Value(0.56)).current;

  const current = deck[quizIndex] ?? null;
  const redirectUri = makeRedirectUri({ scheme: APP_SCHEME, path: "auth/callback" });
  const recentPairs = useMemo(() => pairs.slice(0, 4), [pairs]);
  const authTitle = session?.user?.email
    ? session.user.email
    : isSupabaseConfigured
      ? "Google 계정으로 카드 보관하기"
      : "로컬 저장 모드";
  const authCaption = syncing ? "동기화 중..." : note;
  const maxQuizCount = pairs.length ? pairs.length * 2 : 0;
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
  }, [pairs.length]);

  const savePairs = async (nextPairs) => {
    const sorted = sortPairs(nextPairs);

    setPairs(sorted);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));
  };

  const saveCard = async () => {
    const left = draft.left.trim();
    const right = draft.right.trim();

    if (!left || !right) {
      Alert.alert("입력 필요", "앞면과 뒷면을 모두 입력해 주세요.");
      return;
    }

    const signature = createSignature(left, right);
    const alreadyExists = pairs.some(
      (pair) => createSignature(pair.left, pair.right) === signature
    );

    if (alreadyExists) {
      Alert.alert("이미 저장된 카드", "같은 조합의 카드는 이미 보관함에 있습니다.");
      return;
    }

    let nextPair = createLocalPair(left, right);

    if (session?.user?.id && supabase) {
      try {
        const inserted = await supabase
          .from("memory_pairs")
          .insert({
            user_id: session.user.id,
            prompt_a: left,
            prompt_b: right,
          })
          .select()
          .single();

        if (inserted.error) {
          throw inserted.error;
        }

        nextPair = mapPairRecord(inserted.data);
        setNote("새 카드가 Google 계정에도 저장되었습니다.");
      } catch {
        setNote("클라우드 저장 실패로 로컬에만 저장했습니다.");
      }
    }

    await savePairs([nextPair, ...pairs]);
    setDraft({ left: "", right: "" });
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

  const startQuiz = (requestedCount = resolvedQuizCount) => {
    if (!pairs.length) {
      Alert.alert("문제가 없습니다", "먼저 카드 한 장 이상을 저장해 주세요.");
      return;
    }

    clearTimeout(timerRef.current);
    setDeck(buildPracticeDeck(pairs, requestedCount || maxQuizCount));
    setQuizIndex(0);
    setAnswer("");
    setFeedback("");
    setResult(null);
    setShowAnswer(false);
    setTab("quiz");
  };

  const goNext = () => {
    clearTimeout(timerRef.current);
    setAnswer("");
    setFeedback("");
    setResult(null);
    setShowAnswer(false);
    setQuizIndex((currentIndex) => {
      if (!deck.length || currentIndex + 1 >= deck.length) {
        setDeck(buildPracticeDeck(pairs, resolvedQuizCount || maxQuizCount));
        return 0;
      }

      return currentIndex + 1;
    });
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
      <View style={styles.syncStrip}>
        <View style={styles.syncLead}>
          <View style={styles.syncIconWrap}>
            <MaterialCommunityIcons
              name={session?.user ? "google" : "cloud-outline"}
              size={18}
              color="#0B1020"
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

      <View style={styles.composerPanel}>
        <View style={styles.composerTopline}>
          <View style={styles.moonPill}>
            <MaterialCommunityIcons name="moon-waning-crescent" size={15} color="#B8AEFF" />
            <Text style={styles.moonPillText}>Night mode study</Text>
          </View>
        </View>

        <Text style={styles.composerTitle}>카드를 하나씩 차분하게 쌓아 두세요.</Text>
        <Text style={styles.composerBody}>
          저장하면 앞면과 뒷면이 모두 문제로 출제됩니다. 추가 버튼 없이 바로 한 장씩 기록하도록 단순화했습니다.
        </Text>

        <Text style={styles.inputLabel}>앞면</Text>
        <TextInput
          value={draft.left}
          onChangeText={(value) => setDraft((currentDraft) => ({ ...currentDraft, left: value }))}
          placeholder="문제로 보여줄 단어 또는 문장"
          placeholderTextColor="#667392"
          style={[styles.input, styles.multilineInput]}
          multiline
          textAlignVertical="top"
        />

        <Text style={styles.inputLabel}>뒷면</Text>
        <TextInput
          value={draft.right}
          onChangeText={(value) => setDraft((currentDraft) => ({ ...currentDraft, right: value }))}
          placeholder="뜻, 번역, 해설 또는 정답"
          placeholderTextColor="#667392"
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
              <PreviewRow key={pair.id} pair={pair} />
            ))}
          </View>
        </View>
      ) : (
        <EmptyPanel
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
          <View>
            <Text style={styles.panelTitle}>랜덤 퀴즈</Text>
            <Text style={styles.panelBody}>앞면과 뒷면이 섞이고, 시작할 때마다 랜덤 순서로 출제됩니다.</Text>
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
              placeholderTextColor="#667392"
              style={[styles.quizCountInput, !pairs.length && styles.quizCountInputDisabled]}
            />
            <Text style={styles.quizCountCaption}>{pairs.length ? `최대 ${maxQuizCount}` : "대기"}</Text>
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

        {current ? (
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
              placeholderTextColor="#667392"
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
        ) : (
          <EmptyPanel
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
                    placeholderTextColor="#667392"
                    style={[styles.input, styles.multilineInput]}
                    multiline
                    textAlignVertical="top"
                  />

                  <Text style={styles.inputLabel}>뒷면</Text>
                  <TextInput
                    value={editingRight}
                    onChangeText={setEditingRight}
                    placeholder="뒷면 입력"
                    placeholderTextColor="#667392"
                    style={[styles.input, styles.multilineInput]}
                    multiline
                    textAlignVertical="top"
                  />

                  <View style={styles.actionRow}>
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
                  <PreviewRow pair={pair} large />
                  <View style={styles.actionRow}>
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
        <Text style={styles.heroMeta}>실제 APK 테스트를 염두에 둔 Google 로그인 경로까지 같이 정리했습니다.</Text>
      </View>

      <View style={styles.infoPanel}>
        <InfoRow
          icon="swap-horizontal"
          title="양방향 암기"
          body="저장한 카드는 앞면과 뒷면이 모두 문제로 출제되고, 정답 비교는 대소문자를 구분하지 않습니다."
        />
        <InfoRow
          icon="google"
          title="Google 로그인"
          body={
            isSupabaseConfigured
              ? "현재 앱 코드에는 Google OAuth 흐름이 연결되어 있습니다. Supabase와 Google Cloud 설정만 맞추면 Expo Go와 APK에서 같은 계정으로 로그인 테스트가 가능합니다."
              : "현재는 Supabase 환경변수가 없어 로컬 저장 모드입니다. .env에 Supabase URL과 Anon Key를 넣으면 Google 로그인 버튼이 바로 활성화됩니다."
          }
        />
        <InfoRow
          icon="link-variant"
          title="APK용 리디렉션"
          body={`Supabase Redirect URLs와 Google 설정에는 ${RELEASE_REDIRECT_URI} 를 추가해 두는 것이 안전합니다.`}
        />
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#070B16" />

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
                  color={active ? "#0B1020" : "#8E9ABC"}
                />
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </KeyboardAvoidingView>

      {launchVisible ? (
        <LaunchScreen opacity={launchOpacity} scale={launchScale} glow={moonGlow} />
      ) : null}
    </SafeAreaView>
  );
}

function PreviewRow({ pair, large = false }) {
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

function EmptyPanel({ icon, title, body, actionLabel, onPress }) {
  return (
    <View style={styles.emptyPanel}>
      <View style={styles.emptyIconWrap}>
        <MaterialCommunityIcons name={icon} size={22} color="#B8AEFF" />
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

function InfoRow({ icon, title, body }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIconWrap}>
        <MaterialCommunityIcons name={icon} size={19} color="#0B1020" />
      </View>
      <View style={styles.flex}>
        <Text style={styles.infoTitle}>{title}</Text>
        <Text style={styles.infoBody}>{body}</Text>
      </View>
    </View>
  );
}

function LaunchScreen({ opacity, scale, glow }) {
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#070B16",
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
    backgroundColor: "rgba(184, 174, 255, 0.12)",
  },
  backgroundOrbSecondary: {
    position: "absolute",
    bottom: 130,
    left: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(245, 193, 217, 0.08)",
  },
  star: {
    position: "absolute",
    backgroundColor: "#F6F2FF",
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
    justifyContent: "center",
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
    color: "#B8AEFF",
  },
  heroMeta: {
    fontSize: 15,
    lineHeight: 22,
    color: "#94A1C2",
  },
  syncStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 22,
    backgroundColor: "rgba(17, 24, 43, 0.94)",
    borderWidth: 1,
    borderColor: "rgba(184, 174, 255, 0.14)",
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
    backgroundColor: "#B8AEFF",
  },
  flex: {
    flex: 1,
  },
  syncTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#F5F7FF",
  },
  syncCaption: {
    fontSize: 13,
    lineHeight: 18,
    color: "#8E9ABC",
  },
  syncButton: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#B8AEFF",
  },
  syncButtonMuted: {
    backgroundColor: "#1D2640",
  },
  syncButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0B1020",
  },
  syncButtonTextMuted: {
    color: "#EAEFFF",
  },
  composerPanel: {
    padding: 22,
    gap: 14,
    borderRadius: 30,
    backgroundColor: "#11182B",
    borderWidth: 1,
    borderColor: "rgba(184, 174, 255, 0.16)",
  },
  composerTopline: {
    flexDirection: "row",
    justifyContent: "flex-start",
  },
  moonPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(184, 174, 255, 0.1)",
  },
  moonPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#B8AEFF",
  },
  composerTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    color: "#F5F7FF",
  },
  composerBody: {
    fontSize: 14,
    lineHeight: 22,
    color: "#92A0C1",
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#C2CBDF",
  },
  input: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#23304D",
    backgroundColor: "#0B1020",
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: "#F5F7FF",
  },
  multilineInput: {
    minHeight: 96,
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
  },
  primaryButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    paddingVertical: 15,
    backgroundColor: "#B8AEFF",
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0B1020",
  },
  secondaryButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    paddingVertical: 15,
    backgroundColor: "#1A2440",
    borderWidth: 1,
    borderColor: "rgba(184, 174, 255, 0.15)",
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#EAEFFF",
  },
  dangerButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    paddingVertical: 15,
    backgroundColor: "#3C1B28",
    borderWidth: 1,
    borderColor: "rgba(255, 168, 198, 0.15)",
  },
  dangerButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFB4C7",
  },
  ghostButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "rgba(184, 174, 255, 0.16)",
    backgroundColor: "#141D35",
  },
  ghostButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#BFC8E2",
  },
  pressed: {
    opacity: 0.88,
  },
  libraryPanel: {
    gap: 12,
    padding: 18,
    borderRadius: 26,
    backgroundColor: "rgba(14, 20, 36, 0.94)",
    borderWidth: 1,
    borderColor: "rgba(184, 174, 255, 0.12)",
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
    color: "#F5F7FF",
  },
  panelBody: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 21,
    color: "#8E9ABC",
  },
  inlineLink: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#1A2440",
  },
  inlineLinkText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#C4CCDF",
  },
  libraryList: {
    gap: 10,
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "#11182B",
  },
  previewRowLarge: {
    paddingVertical: 16,
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
    color: "#7F8AA8",
  },
  previewText: {
    fontSize: 15,
    lineHeight: 22,
    color: "#EEF2FF",
  },
  previewDivider: {
    fontSize: 16,
    fontWeight: "800",
    color: "#B8AEFF",
  },
  emptyPanel: {
    alignItems: "flex-start",
    gap: 12,
    padding: 20,
    borderRadius: 26,
    backgroundColor: "rgba(14, 20, 36, 0.94)",
    borderWidth: 1,
    borderColor: "rgba(184, 174, 255, 0.12)",
  },
  emptyIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(184, 174, 255, 0.12)",
  },
  emptyTitle: {
    fontSize: 19,
    lineHeight: 26,
    fontWeight: "800",
    color: "#F5F7FF",
  },
  emptyBody: {
    fontSize: 14,
    lineHeight: 22,
    color: "#8E9ABC",
  },
  emptyAction: {
    alignSelf: "stretch",
    marginTop: 4,
  },
  quizPanel: {
    gap: 14,
    padding: 18,
    borderRadius: 28,
    backgroundColor: "rgba(14, 20, 36, 0.94)",
    borderWidth: 1,
    borderColor: "rgba(184, 174, 255, 0.12)",
  },
  quizHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  quizSetupRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "stretch",
  },
  quizSetupCard: {
    flex: 1,
    gap: 6,
    padding: 16,
    borderRadius: 20,
    backgroundColor: "#11182B",
    borderWidth: 1,
    borderColor: "rgba(184, 174, 255, 0.1)",
  },
  quizSetupLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: "#D6DBEA",
  },
  quizSetupHint: {
    fontSize: 13,
    lineHeight: 20,
    color: "#8E9ABC",
  },
  quizCountBox: {
    width: 108,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 20,
    backgroundColor: "#11182B",
    borderWidth: 1,
    borderColor: "rgba(184, 174, 255, 0.1)",
  },
  quizCountLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "#8E9ABC",
  },
  quizCountInput: {
    minWidth: 54,
    paddingVertical: 0,
    fontSize: 30,
    fontWeight: "800",
    textAlign: "center",
    color: "#F5F7FF",
  },
  quizCountInputDisabled: {
    color: "#5B688A",
  },
  quizCountCaption: {
    fontSize: 12,
    color: "#8E9ABC",
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
    backgroundColor: "#1A2440",
    borderWidth: 1,
    borderColor: "rgba(184, 174, 255, 0.12)",
  },
  quizPresetChipActive: {
    backgroundColor: "#B8AEFF",
    borderColor: "#B8AEFF",
  },
  quizPresetText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#D6DBEA",
  },
  quizPresetTextActive: {
    color: "#0B1020",
  },
  quizStartButton: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#B8AEFF",
  },
  quizStartButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0B1020",
  },
  quizCard: {
    gap: 14,
    padding: 18,
    borderRadius: 24,
    backgroundColor: "#11182B",
  },
  quizMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  quizProgress: {
    fontSize: 13,
    fontWeight: "700",
    color: "#93A0C3",
  },
  quizBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(184, 174, 255, 0.12)",
    fontSize: 12,
    fontWeight: "800",
    color: "#B8AEFF",
  },
  quizPrompt: {
    fontSize: 31,
    lineHeight: 38,
    fontWeight: "800",
    color: "#F5F7FF",
  },
  feedback: {
    fontSize: 15,
    fontWeight: "800",
  },
  feedbackGood: {
    color: "#86E2A2",
  },
  feedbackBad: {
    color: "#FFBFCC",
  },
  answerText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#EAEFFF",
  },
  manageCard: {
    gap: 14,
    padding: 16,
    borderRadius: 22,
    backgroundColor: "#11182B",
  },
  infoPanel: {
    gap: 12,
    padding: 18,
    borderRadius: 28,
    backgroundColor: "rgba(14, 20, 36, 0.94)",
    borderWidth: 1,
    borderColor: "rgba(184, 174, 255, 0.12)",
  },
  infoRow: {
    flexDirection: "row",
    gap: 14,
    padding: 14,
    borderRadius: 20,
    backgroundColor: "#11182B",
  },
  infoIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#B8AEFF",
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#F5F7FF",
  },
  infoBody: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 21,
    color: "#8E9ABC",
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
    backgroundColor: "rgba(11, 16, 32, 0.98)",
    borderWidth: 1,
    borderColor: "rgba(184, 174, 255, 0.18)",
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
    backgroundColor: "#B8AEFF",
  },
  tabText: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 16,
    color: "#C0C8DE",
  },
  tabTextActive: {
    color: "#0B1020",
  },
  launchScreen: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#050814",
  },
  launchHalo: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(184, 174, 255, 0.16)",
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
    backgroundColor: "#B8AEFF",
  },
  launchMoonCutout: {
    position: "absolute",
    width: 64,
    height: 64,
    borderRadius: 32,
    right: 18,
    top: 21,
    backgroundColor: "#050814",
  },
  launchStar: {
    position: "absolute",
    backgroundColor: "#F6F2FF",
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
    color: "#F6F2FF",
  },
});
