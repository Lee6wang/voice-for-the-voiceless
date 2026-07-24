// 无声之声 · 经纬度 → 场景标签（免密钥）
// 用 OpenStreetMap Nominatim 反查最近 POI 类型，映射成中文场景标签。
// 尽力而为：超时/失败/无网一律返回 null，候选链路照常走（场景只是加分项）。
// 用量礼仪：结果按 ~100m 网格缓存，避免对公共服务重复请求。

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
const TIMEOUT_MS = 2000;

/** OSM 类目 → 中文场景标签（只挑对候选生成有意义的场景） */
const OSM_SCENE: Record<string, string> = {
  restaurant: '餐厅',
  fast_food: '快餐店',
  cafe: '咖啡馆',
  bar: '酒吧',
  food_court: '美食广场',
  hospital: '医院',
  clinic: '诊所',
  pharmacy: '药店',
  school: '学校',
  university: '大学',
  college: '学校',
  library: '图书馆',
  bank: '银行',
  supermarket: '超市',
  mall: '商场',
  department_store: '商场',
  convenience: '便利店',
  bus_station: '公交站',
  station: '车站',
  aerodrome: '机场',
  hotel: '酒店',
  cinema: '电影院',
  gym: '健身房',
  fitness_centre: '健身房',
  park: '公园',
};

const cache = new Map<string, string | null>();

/** 经纬度粗化到 ~100m，同一地点的多轮对话命中缓存 */
function gridKey(lat: number, lon: number): string {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

/**
 * 反查场景标签；识别不出有意义的场景返回 null（调用方直接忽略）。
 */
export async function resolveScene(lat: number, lon: number): Promise<string | null> {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return null;
  }
  const key = gridKey(lat, lon);
  if (cache.has(key)) return cache.get(key)!;

  let scene: string | null = null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const url = new URL(NOMINATIM_URL);
    url.search = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      format: 'jsonv2',
      zoom: '18',
      'accept-language': 'zh',
    }).toString();
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent':
          'voice-for-the-voiceless/0.1 (+https://github.com/Lee6wang/voice-for-the-voiceless)',
      },
    });
    if (res.ok) {
      const data = (await res.json()) as { type?: string; category?: string; name?: string };
      scene = OSM_SCENE[data.type ?? ''] ?? null;
      // POI 有名字时拼上，如「餐厅（老王面馆）」，LLM 可借题发挥
      if (scene && data.name) scene = `${scene}（${data.name}）`;
    }
  } catch {
    scene = null; // 断网/超时：场景只是加分项，静默放弃
  } finally {
    clearTimeout(timer);
  }
  cache.set(key, scene);
  return scene;
}
