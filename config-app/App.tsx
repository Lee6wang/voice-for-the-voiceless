import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

// Android Emulator 用 10.0.2.2 访问宿主 Mac；真机联调时通过环境变量覆盖。
const BACKEND = (
  process.env.EXPO_PUBLIC_BACKEND_URL ?? 'http://10.0.2.2:8787'
).replace(/\/$/, '');
const USER_ID = 'demo';

type Tone = 'gentle' | 'plain' | 'humor';
type RequestState = 'idle' | 'loading' | 'saving' | 'success' | 'error';

interface UserProfile {
  userId: string;
  name?: string;
  commonPhrases: string[];
  tone?: Tone;
  emergencyText?: string;
}

const TONES: Array<{ value: Tone; label: string; description: string }> = [
  { value: 'gentle', label: '温和', description: '更有同理心' },
  { value: 'plain', label: '自然', description: '简洁直接' },
  { value: 'humor', label: '幽默', description: '轻松一点' },
];

export default function App() {
  const [name, setName] = useState('');
  const [commonPhrases, setCommonPhrases] = useState('');
  const [tone, setTone] = useState<Tone>('plain');
  const [emergencyText, setEmergencyText] = useState('请帮帮我');
  const [requestState, setRequestState] = useState<RequestState>('idle');
  const [status, setStatus] = useState('尚未同步');

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      setRequestState('loading');
      setStatus('正在读取已有配置…');

      try {
        const response = await fetch(
          `${BACKEND}/profile?userId=${encodeURIComponent(USER_ID)}`,
        );
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const profile = (await response.json()) as UserProfile;
        if (!active) return;

        setName(profile.name ?? '');
        setCommonPhrases(profile.commonPhrases.join('\n'));
        setTone(profile.tone ?? 'plain');
        setEmergencyText(profile.emergencyText ?? '请帮帮我');
        setRequestState('idle');
        setStatus('配置已载入');
      } catch {
        if (!active) return;
        setRequestState('error');
        setStatus('暂时连接不到后端，可以先填写，稍后再保存');
      }
    }

    void loadProfile();
    return () => {
      active = false;
    };
  }, []);

  async function save() {
    const profile: UserProfile = {
      userId: USER_ID,
      name: name.trim() || undefined,
      commonPhrases: commonPhrases
        .split(/[,，\n]/)
        .map((phrase) => phrase.trim())
        .filter(Boolean),
      tone,
      emergencyText: emergencyText.trim() || undefined,
    };

    setRequestState('saving');
    setStatus('正在保存…');

    try {
      const response = await fetch(`${BACKEND}/profile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(profile),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      setRequestState('success');
      setStatus('已同步，眼镜端下次会话将使用这套表达偏好');
    } catch {
      setRequestState('error');
      setStatus('保存失败，请确认后端已启动且网络可达');
    }
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>VOICE FOR THE VOICELESS</Text>
            <Text style={styles.title}>让 AI 用你的方式开口</Text>
            <Text style={styles.subtitle}>
              这些偏好会帮助眼镜生成更贴近你的候选回复。
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>你的名字</Text>
            <Text style={styles.hint}>用于自我介绍，可以留空</Text>
            <TextInput
              accessibilityLabel="你的名字"
              autoCapitalize="none"
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="例：小明"
              placeholderTextColor="#829087"
            />

            <Text style={styles.label}>常用表达</Text>
            <Text style={styles.hint}>每行一句，也支持逗号分隔</Text>
            <TextInput
              accessibilityLabel="常用表达"
              style={[styles.input, styles.multiline]}
              value={commonPhrases}
              onChangeText={setCommonPhrases}
              multiline
              placeholder={'谢谢你\n容我想想\n我先失陪一下'}
              placeholderTextColor="#829087"
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>默认语气</Text>
            <View style={styles.toneList}>
              {TONES.map((item) => {
                const selected = tone === item.value;
                return (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    key={item.value}
                    onPress={() => setTone(item.value)}
                    style={[
                      styles.toneOption,
                      selected && styles.toneOptionSelected,
                    ]}
                  >
                    <View
                      style={[styles.radio, selected && styles.radioSelected]}
                    >
                      {selected ? <View style={styles.radioDot} /> : null}
                    </View>
                    <View>
                      <Text style={styles.toneLabel}>{item.label}</Text>
                      <Text style={styles.hint}>{item.description}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.label}>紧急表达</Text>
            <Text style={styles.hint}>
              触发紧急手势时，手机会直接说出这句话
            </Text>
            <TextInput
              accessibilityLabel="紧急表达"
              style={styles.input}
              value={emergencyText}
              onChangeText={setEmergencyText}
              placeholder="请帮帮我"
              placeholderTextColor="#829087"
            />
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={requestState === 'saving'}
            onPress={() => void save()}
            style={({ pressed }) => [
              styles.saveButton,
              pressed && styles.saveButtonPressed,
              requestState === 'saving' && styles.saveButtonDisabled,
            ]}
          >
            {requestState === 'saving' ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.saveButtonText}>保存并同步</Text>
            )}
          </Pressable>

          <View
            style={[
              styles.statusBox,
              requestState === 'error' && styles.statusBoxError,
              requestState === 'success' && styles.statusBoxSuccess,
            ]}
          >
            {requestState === 'loading' ? (
              <ActivityIndicator color="#386447" size="small" />
            ) : null}
            <Text style={styles.status}>{status}</Text>
          </View>

          <Text style={styles.debugText}>后端：{BACKEND}</Text>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#F3F7F4',
    flex: 1,
  },
  container: {
    gap: 16,
    padding: 20,
    paddingBottom: 40,
  },
  hero: {
    paddingBottom: 4,
    paddingTop: 16,
  },
  eyebrow: {
    color: '#4E7B5C',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginBottom: 8,
  },
  title: {
    color: '#17241B',
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  subtitle: {
    color: '#5E6C62',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E0E9E3',
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
    padding: 18,
  },
  label: {
    color: '#203426',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 8,
  },
  hint: {
    color: '#738078',
    fontSize: 12,
    lineHeight: 17,
  },
  input: {
    backgroundColor: '#F7FAF8',
    borderColor: '#CEDBD2',
    borderRadius: 12,
    borderWidth: 1,
    color: '#17241B',
    fontSize: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  multiline: {
    height: 108,
    textAlignVertical: 'top',
  },
  toneList: {
    gap: 8,
    marginBottom: 8,
  },
  toneOption: {
    alignItems: 'center',
    borderColor: '#D9E3DC',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  toneOptionSelected: {
    backgroundColor: '#ECF6EF',
    borderColor: '#4E7B5C',
  },
  radio: {
    alignItems: 'center',
    borderColor: '#9DADA2',
    borderRadius: 10,
    borderWidth: 1.5,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  radioSelected: {
    borderColor: '#386447',
  },
  radioDot: {
    backgroundColor: '#386447',
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  toneLabel: {
    color: '#26392B',
    fontSize: 14,
    fontWeight: '700',
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: '#315E40',
    borderRadius: 14,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: 20,
  },
  saveButtonPressed: {
    backgroundColor: '#274C34',
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  statusBox: {
    alignItems: 'center',
    backgroundColor: '#EAF1EC',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    padding: 12,
  },
  statusBoxError: {
    backgroundColor: '#FFF0ED',
  },
  statusBoxSuccess: {
    backgroundColor: '#E6F5EB',
  },
  status: {
    color: '#3E5144',
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  debugText: {
    color: '#91A096',
    fontSize: 11,
    textAlign: 'center',
  },
});
