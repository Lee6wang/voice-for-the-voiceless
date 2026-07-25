# Gallery 产品整体图生成提示

## 用途

AdventureX Gallery 相册第一张产品整体图，宽屏 `16:9`。使用内置图像生成工具，
以已定稿的 `../cover-16x9.png` 作为视觉风格参考。

## Prompt

```text
Use case: product-mockup
Asset type: AdventureX Gallery product overview image, wide 16:9
Input image: visual-style reference only; preserve its black-water atmosphere,
silver-teal incoming sound, coral-gold outgoing expression, refractive glass
shards, elegant cinematic lighting. Do not copy any text from the reference.

Primary request: create a new, distinct product still life for “Voice for the
Voiceless”: a pair of matte-black smart glasses, a slim dark smart ring, and a
black smartphone form a quiet triangular constellation above a reflective
black-water surface. The glasses are the listening threshold at upper center;
exactly four silver-teal sound ribbons emerge from the glasses; one selected
ribbon passes through the ring and reverses into a single warm coral-gold voice
arc flowing toward the smartphone speaker. The phone screen shows only a subtle
abstract warm waveform, no UI labels.

Composition/framing: wide 16:9, product trio centered within safe margins,
generous dark negative space, clear silhouette and premium gallery readability.
Ring in foreground lower center, phone on lower right at a slight angle, glasses
upper center. Avoid repeating the cover composition exactly.

Style/medium: poetic cinematic product photography blended with restrained
abstract data sculpture; premium, realistic materials, not sci-fi gadget
advertising.

Lighting/mood: intimate, nocturnal, dignified; thin edge light and soft
reflections.

Color palette: near-black, graphite, silver-white, muted teal, one coral-gold
accent.

Constraints: exactly one pair of glasses, exactly one ring, exactly one phone;
exactly four candidate ribbons before selection and one warm ribbon after
selection; no people; no hands; no brand logos; no words; no letters; no
numbers; no watermark; no extra devices; no excessive neon; no bright cyan
interface.
```

最终成片在 HTML 排版稿 `gallery-render.html` 中加入文字与系统说明，导出为
`../gallery-01-product.png`。
