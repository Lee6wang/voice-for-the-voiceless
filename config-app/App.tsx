// 无声之声 · 配置 App（起步文件）
// 独立 App：录入个性化配置，保存到薄后端（backend /profile），glasses-app 会读取。
// 用法见 README：先 create-expo-app 生成工程，再用本文件替换 App.tsx。
// 字段结构对应 @vftv/shared 的 UserProfile（跨语言/独立工程，这里内联同构定义）。

import { useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

const BACKEND = 'http://localhost:8787'; // 真机联调改成后端可达地址
const USER_ID = 'demo';

type Tone = 'gentle' | 'plain' | 'humor';

export default function App() {
  const [name, setName] = useState('');
  const [commonPhrases, setCommonPhrases] = useState(''); // 逗号/换行分隔
  const [tone, setTone] = useState<Tone>('plain');
  const [emergencyText, setEmergencyText] = useState('请帮帮我');
  const [status, setStatus] = useState('');

  async function save() {
    const profile = {
      userId: USER_ID,
      name: name.trim() || undefined,
      commonPhrases: commonPhrases.split(/[,，\n]/).map((s) => s.trim()).filter(Boolean),
      tone,
      emergencyText: emergencyText.trim() || undefined,
    };
    try {
      const r = await fetch(`${BACKEND}/profile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(profile),
      });
      setStatus(r.ok ? '已保存 ✅' : `保存失败：${r.status}`);
    } catch (e) {
      setStatus(`保存失败：${String(e)}`);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>无声之声 · 个性化配置</Text>

      <Text style={styles.label}>你的名字（用于自我介绍）</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="例：小明" />

      <Text style={styles.label}>常用语（逗号或换行分隔，喂给 AI 参考）</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={commonPhrases}
        onChangeText={setCommonPhrases}
        multiline
        placeholder="例：谢谢你，我先失陪一下，容我想想"
      />

      <Text style={styles.label}>语气</Text>
      <View style={styles.row}>
        {(['gentle', 'plain', 'humor'] as Tone[]).map((t) => (
          <View key={t} style={styles.chip}>
            <Button title={t} onPress={() => setTone(t)} color={tone === t ? '#2e7d32' : '#999'} />
          </View>
        ))}
      </View>

      <Text style={styles.label}>紧急呼救要喊的话</Text>
      <TextInput style={styles.input} value={emergencyText} onChangeText={setEmergencyText} />

      <View style={styles.save}>
        <Button title="保存配置" onPress={save} />
      </View>
      <Text style={styles.status}>{status}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, gap: 8 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 12 },
  label: { fontSize: 14, color: '#333', marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, fontSize: 16 },
  multiline: { height: 90, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 8 },
  chip: { flex: 1 },
  save: { marginTop: 24 },
  status: { marginTop: 12, color: '#2e7d32' },
});
