import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
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
import { LinearGradient } from "expo-linear-gradient";
import * as WebBrowser from "expo-web-browser";

import { isSupabaseConfigured, supabase } from "./src/lib/supabase";
import {
  buildPracticeDeck,
  compareAnswers,
  createBlankDraft,
  createLocalPair,
  createSignature,
  getDirectionLabel,
  mapPairRecord,
  mergePairsBySignature,
  sortPairs,
  updatePairValues,
} from "./src/utils/memory";

WebBrowser.maybeCompleteAuthSession();

const STORAGE_KEY = "@memora/study-pairs";
const APP_SCHEME = process.env.EXPO_PUBLIC_APP_SCHEME || "memora";
const TABS = [
  { key: "save", label: "암기장에\n저장하기", icon: "notebook-plus-outline" },
  { key: "quiz", label: "암기", icon: "brain" },
  { key: "manage", label: "암기장\n수정 삭제", icon: "playlist-edit" },
  { key: "about", label: "앱 정보", icon: "information-outline" },
];

export default function App() {
  const [tab, setTab] = useState("save");
  const [pairs, setPairs] = useState([]);
  const [drafts, setDrafts] = useState([createBlankDraft()]);
  const [storageReady, setStorageReady] = useState(false);
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [authBusy, setAuthBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [note, setNote] = useState(
    isSupabaseConfigured
      ? "Google 로그인 시 다른 휴대폰과 동기화됩니다."
      : "현재 로컬 저장 모드입니다."
  );
  const [editingId, setEditingId] = useState(null);
  const [editingLeft, setEditingLeft] = useState("");
  const [editingRight, setEditingRight] = useState("");
  const [deck, setDeck] = useState([]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState("");
  const [result, setResult] = useState(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const timerRef = useRef(null);

  const current = deck[quizIndex] ?? null;
  const redirectUri = makeRedirectUri({ scheme: APP_SCHEME, path: "auth/callback" });

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored && active) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            setPairs(sortPairs(parsed));
          }
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
      if (active) {
        setSession(data.session ?? null);
        setAuthReady(true);
      }
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      setAuthReady(true);
      setNote(
        nextSession?.user ? "Google 계정과 연결되었습니다." : "Google 로그인 시 동기화됩니다."
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
        const localOnly = pairs.filter(
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

  const savePairs = async (nextPairs) => {
    const sorted = sortPairs(nextPairs);
    setPairs(sorted);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));
  };

  const saveDraft = async (draftId) => {
    const draft = drafts.find((item) => item.id === draftId);
    if (!draft?.left.trim() || !draft?.right.trim()) {
      Alert.alert("입력 필요", "A와 B를 모두 입력해 주세요.");
      return;
    }
    let nextPair = createLocalPair(draft.left, draft.right);
    if (session?.user?.id && supabase) {
      try {
        const inserted = await supabase
          .from("memory_pairs")
          .insert({
            user_id: session.user.id,
            prompt_a: draft.left.trim(),
            prompt_b: draft.right.trim(),
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
    setDrafts((currentDrafts) => {
      const filtered = currentDrafts.filter((item) => item.id !== draftId);
      return filtered.length ? filtered : [createBlankDraft()];
    });
  };

  const startQuiz = () => {
    if (!pairs.length) {
      Alert.alert("문제가 없습니다", "먼저 카드 쌍을 저장해 주세요.");
      return;
    }
    clearTimeout(timerRef.current);
    setDeck(buildPracticeDeck(pairs));
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
        setDeck(buildPracticeDeck(pairs));
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
    setFeedback("틀렸습니다");
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

  const login = async () => {
    if (!supabase) {
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
      }
    } catch (error) {
      Alert.alert("Google 로그인 실패", error?.message || "설정을 확인해 주세요.");
    } finally {
      setAuthBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5ECDD" />
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <LinearGradient colors={["#F8E7C9", "#F1C98C"]} style={styles.hero}>
            <Text style={styles.brand}>Memora</Text>
            <Text style={styles.heroTitle}>문장과 단어를 쌍으로 저장하고 양방향으로 암기하세요.</Text>
            <View style={styles.stats}>
              <View style={styles.stat}><Text style={styles.statValue}>{pairs.length}</Text><Text style={styles.statLabel}>저장된 쌍</Text></View>
              <View style={styles.stat}><Text style={styles.statValue}>{pairs.length * 2}</Text><Text style={styles.statLabel}>출제 방향</Text></View>
            </View>
            <View style={styles.authBox}>
              <View style={styles.flex}>
                <Text style={styles.authTitle}>{session?.user?.email || (isSupabaseConfigured ? "Google 로그인 전" : "로컬 저장 모드")}</Text>
                <Text style={styles.authNote}>{syncing ? "동기화 중..." : note}</Text>
              </View>
              <Pressable
                disabled={!isSupabaseConfigured || !authReady || authBusy}
                onPress={session?.user ? () => supabase.auth.signOut() : login}
                style={({ pressed }) => [styles.authButton, pressed && styles.pressed]}
              >
                <Text style={styles.authButtonText}>
                  {!isSupabaseConfigured ? "로컬 모드" : session?.user ? "로그아웃" : authBusy ? "처리 중" : "Google 로그인"}
                </Text>
              </Pressable>
            </View>
          </LinearGradient>

          {tab === "save" ? (
            <View style={styles.section}>
              <LinearGradient colors={["#FFFDF8", "#F8F1E6"]} style={styles.card}>
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <Text style={styles.sectionTitle}>A와 B를 한 쌍으로 저장</Text>
                    <Text style={styles.body}>+ 버튼으로 입력칸을 더 만들 수 있습니다.</Text>
                  </View>
                  <Pressable onPress={() => setDrafts((currentDrafts) => [...currentDrafts, createBlankDraft()])} style={styles.circle}>
                    <MaterialCommunityIcons name="plus" size={22} color="#2F2621" />
                  </Pressable>
                </View>
              </LinearGradient>
              {drafts.map((draft, index) => (
                <View key={draft.id} style={styles.card}>
                  <Text style={styles.cardTitle}>새 카드 {index + 1}</Text>
                  <TextInput value={draft.left} onChangeText={(value) => setDrafts((currentDrafts) => currentDrafts.map((item) => item.id === draft.id ? { ...item, left: value } : item))} placeholder="A 입력" placeholderTextColor="#8E8074" style={styles.input} />
                  <TextInput value={draft.right} onChangeText={(value) => setDrafts((currentDrafts) => currentDrafts.map((item) => item.id === draft.id ? { ...item, right: value } : item))} placeholder="B 입력" placeholderTextColor="#8E8074" style={styles.input} />
                  <View style={styles.actions}>
                    <Pressable onPress={() => void saveDraft(draft.id)} style={styles.primary}><Text style={styles.primaryText}>저장</Text></Pressable>
                    <Pressable onPress={() => setDrafts((currentDrafts) => currentDrafts.length === 1 ? currentDrafts.map((item) => item.id === draft.id ? { ...item, left: "", right: "" } : item) : currentDrafts.filter((item) => item.id !== draft.id))} style={styles.secondary}><Text style={styles.secondaryText}>비우기</Text></Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {tab === "quiz" ? (
            <View style={styles.section}>
              <LinearGradient colors={["#FFFDF8", "#F8F1E6"]} style={styles.card}>
                <Text style={styles.sectionTitle}>랜덤 암기</Text>
                <Text style={styles.body}>A -> B와 B -> A가 모두 문제로 나옵니다.</Text>
                <Pressable onPress={startQuiz} style={styles.primary}><Text style={styles.primaryText}>{deck.length ? "다시 시작하기" : "시작하기"}</Text></Pressable>
              </LinearGradient>
              {current ? (
                <View style={styles.card}>
                  <View style={styles.row}>
                    <Text style={styles.small}>문제 {(quizIndex % deck.length) + 1} / {deck.length}</Text>
                    <Text style={styles.badge}>{getDirectionLabel(current.direction)}</Text>
                  </View>
                  <Text style={styles.prompt}>{current.prompt}</Text>
                  <TextInput value={answer} onChangeText={setAnswer} placeholder="정답 입력" placeholderTextColor="#8E8074" autoCapitalize="none" style={styles.input} />
                  {feedback ? <Text style={[styles.feedback, result === "correct" ? styles.good : styles.bad]}>{feedback}</Text> : null}
                  {showAnswer ? <Text style={styles.answer}>정답: {current.answer}</Text> : null}
                  <View style={styles.actions}>
                    <Pressable onPress={submitAnswer} style={styles.primary}><Text style={styles.primaryText}>제출하기</Text></Pressable>
                    <Pressable onPress={() => setShowAnswer(true)} style={styles.secondary}><Text style={styles.secondaryText}>정답보기</Text></Pressable>
                  </View>
                  <Pressable onPress={goNext} style={styles.ghost}><Text style={styles.ghostText}>다음 문제로 넘어가기</Text></Pressable>
                </View>
              ) : null}
            </View>
          ) : null}

          {tab === "manage" ? (
            <View style={styles.section}>
              <LinearGradient colors={["#FFFDF8", "#F8F1E6"]} style={styles.card}>
                <Text style={styles.sectionTitle}>암기장 수정 삭제</Text>
                <Text style={styles.body}>저장한 카드 쌍을 바로 수정하거나 삭제할 수 있습니다.</Text>
              </LinearGradient>
              {pairs.map((pair) => (
                <View key={pair.id} style={styles.card}>
                  {editingId === pair.id ? (
                    <>
                      <TextInput value={editingLeft} onChangeText={setEditingLeft} placeholder="A 입력" placeholderTextColor="#8E8074" style={styles.input} />
                      <TextInput value={editingRight} onChangeText={setEditingRight} placeholder="B 입력" placeholderTextColor="#8E8074" style={styles.input} />
                      <View style={styles.actions}>
                        <Pressable onPress={() => void saveEdit()} style={styles.primary}><Text style={styles.primaryText}>수정 저장</Text></Pressable>
                        <Pressable onPress={() => setEditingId(null)} style={styles.secondary}><Text style={styles.secondaryText}>취소</Text></Pressable>
                      </View>
                    </>
                  ) : (
                    <>
                      <View style={styles.preview}><Text style={styles.previewText}>{pair.left}</Text><Text style={styles.previewArrow}>↔</Text><Text style={styles.previewText}>{pair.right}</Text></View>
                      <View style={styles.actions}>
                        <Pressable onPress={() => { setEditingId(pair.id); setEditingLeft(pair.left); setEditingRight(pair.right); }} style={styles.secondary}><Text style={styles.secondaryText}>수정</Text></Pressable>
                        <Pressable onPress={() => Alert.alert("카드 삭제", "이 카드 쌍을 삭제할까요?", [{ text: "취소", style: "cancel" }, { text: "삭제", style: "destructive", onPress: () => { void removePair(pair); } }])} style={styles.danger}><Text style={styles.dangerText}>삭제</Text></Pressable>
                      </View>
                    </>
                  )}
                </View>
              ))}
            </View>
          ) : null}

          {tab === "about" ? (
            <View style={styles.section}>
              <LinearGradient colors={["#FFFDF8", "#F8F1E6"]} style={styles.card}>
                <Text style={styles.sectionTitle}>앱 정보</Text>
                <Text style={styles.body}>Memora는 두 개의 텍스트를 한 쌍으로 저장하고 반복 퀴즈로 암기하는 앱입니다.</Text>
              </LinearGradient>
              <View style={styles.card}><Text style={styles.body}>정답 비교는 대소문자를 구분하지 않습니다.</Text></View>
              <View style={styles.card}><Text style={styles.body}>Supabase 설정을 완료하면 Google 계정으로 다른 기기와 연동할 수 있습니다.</Text></View>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.tabs}>
          {TABS.map((item) => (
            <Pressable key={item.key} onPress={() => setTab(item.key)} style={[styles.tab, tab === item.key && styles.tabActive]}>
              <MaterialCommunityIcons name={item.icon} size={22} color={tab === item.key ? "#8E5C18" : "#63554B"} />
              <Text style={[styles.tabText, tab === item.key && styles.tabTextActive]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F5ECDD" },
  screen: { flex: 1 },
  content: { padding: 18, paddingBottom: 136, gap: 16 },
  hero: { borderRadius: 28, padding: 22, gap: 16 },
  brand: { fontSize: 14, fontWeight: "800", color: "#6F522B", textTransform: "uppercase" },
  heroTitle: { fontSize: 28, lineHeight: 34, fontWeight: "800", color: "#2F2621" },
  stats: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, backgroundColor: "rgba(255,255,255,0.55)", borderRadius: 18, padding: 14 },
  statValue: { fontSize: 22, fontWeight: "800", color: "#2F2621" },
  statLabel: { fontSize: 13, color: "#5C5148" },
  authBox: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "rgba(255,250,241,0.74)", borderRadius: 20, padding: 14 },
  flex: { flex: 1 },
  authTitle: { fontSize: 15, fontWeight: "700", color: "#2F2621" },
  authNote: { fontSize: 13, color: "#5C5148" },
  authButton: { borderRadius: 14, backgroundColor: "#FFF5E2", paddingHorizontal: 14, paddingVertical: 12 },
  authButtonText: { fontSize: 13, fontWeight: "800", color: "#2F2621" },
  section: { gap: 14 },
  card: { borderRadius: 24, padding: 18, backgroundColor: "#FFF9F0", borderWidth: 1, borderColor: "#F0E1CB", gap: 12 },
  sectionTitle: { fontSize: 21, fontWeight: "800", color: "#2F2621" },
  cardTitle: { fontSize: 18, fontWeight: "800", color: "#2F2621" },
  body: { fontSize: 14, lineHeight: 21, color: "#5C5148" },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  circle: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "#F8E3B8" },
  input: { borderWidth: 1, borderColor: "#E8D8C0", borderRadius: 16, backgroundColor: "#FFFFFF", paddingHorizontal: 14, paddingVertical: 14, fontSize: 15, color: "#2F2621" },
  actions: { flexDirection: "row", gap: 10 },
  primary: { flex: 1, borderRadius: 16, backgroundColor: "#9E6619", paddingVertical: 14, alignItems: "center" },
  primaryText: { fontSize: 15, fontWeight: "800", color: "#FFF8EE" },
  secondary: { flex: 1, borderRadius: 16, backgroundColor: "#F4E9D7", paddingVertical: 14, alignItems: "center" },
  secondaryText: { fontSize: 15, fontWeight: "700", color: "#4B3E32" },
  danger: { flex: 1, borderRadius: 16, backgroundColor: "#F6DBD6", paddingVertical: 14, alignItems: "center" },
  dangerText: { fontSize: 15, fontWeight: "700", color: "#8B362A" },
  ghost: { borderRadius: 16, borderWidth: 1, borderColor: "#E1CFB1", paddingVertical: 14, alignItems: "center" },
  ghostText: { fontSize: 14, fontWeight: "700", color: "#5B4A3D" },
  small: { fontSize: 13, fontWeight: "700", color: "#8A6C43" },
  badge: { fontSize: 12, fontWeight: "800", color: "#8E5C18", backgroundColor: "#F8E9CC", paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999 },
  prompt: { fontSize: 28, lineHeight: 34, fontWeight: "800", color: "#2F2621" },
  feedback: { fontSize: 15, fontWeight: "800" },
  good: { color: "#2E6A34" },
  bad: { color: "#A23E31" },
  answer: { fontSize: 18, fontWeight: "800", color: "#2F2621" },
  preview: { flexDirection: "row", alignItems: "center", gap: 10 },
  previewText: { flex: 1, fontSize: 15, color: "#3B3129" },
  previewArrow: { fontSize: 16, color: "#8E6A2E" },
  tabs: { position: "absolute", left: 14, right: 14, bottom: 14, flexDirection: "row", gap: 8, backgroundColor: "rgba(255,248,237,0.98)", borderRadius: 24, padding: 10, borderWidth: 1, borderColor: "#E9D8BB" },
  tab: { flex: 1, minHeight: 76, alignItems: "center", justifyContent: "center", borderRadius: 18, gap: 6, paddingHorizontal: 6 },
  tabActive: { backgroundColor: "#F9E7C6" },
  tabText: { fontSize: 12, lineHeight: 16, fontWeight: "700", color: "#63554B", textAlign: "center" },
  tabTextActive: { color: "#8E5C18" },
  pressed: { opacity: 0.88 },
});
