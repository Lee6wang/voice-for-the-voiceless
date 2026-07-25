# 440 × 140 卡片 Banner 生成提示

## 生成方式

- 模式：Codex 内置 `image_gen`
- 类型：`compositing`
- 视觉参考：`../cover-16x9.png`
- 原始生成：`2192 × 717 px`
- 最终输出：`../banner-card-440x140.png`，`440 × 140 px`

## 最终提示

```text
Use case: compositing
Asset type: AdventureX Gallery project card banner, exact ultra-wide 22:7 aspect
ratio designed for final export at 440×140 px
Primary request: Create a new ultra-wide card-banner composition derived from
the supplied final project cover. Preserve its visual identity—deep black water,
silver sound, cyan glass refraction, coral returning voice, artistic Chinese
title, matte-black smart glasses, dark metallic smart ring—but redesign the
layout specifically for a very small 440×140 project card. Do not merely crop,
squash, or letterbox the original cover.
Input image: The supplied image is the style, color, typography, product-form,
and narrative reference. Recompose its elements for the new ultra-wide banner
while keeping the same premium museum-poster sensibility.
Composition: Exact 22:7 ultra-wide banner. Place the artistic Chinese title in
the left-center, large enough to read clearly at 440 px width. Place the English
subtitle directly below it. Position the small matte-black smart glasses at the
central refraction point, slightly right of center. Position the smooth
dark-metal ring in the right-center/lower-right, aligned with the warm
transition. Keep all critical title and product elements inside the central 82
percent safe zone so a responsive crop from 440 px down to 360 px does not
remove them. Leave at least 40 px-equivalent expendable atmosphere at both far
edges.
Visual narrative: A thin silver-white waveform enters from the far left, passes
visibly through the glasses, and emerges as exactly four compact paths contained
within the banner’s middle horizontal band. Three paths remain cool silver/cyan
and fan gently toward the right. The fourth curves through the ring opening. It
stays cool before the ring and turns coral-orange/warm gold only after passing
through it, then sweeps back as a restrained warm curve along the lower edge.
Make this readable at thumbnail size; use broad clean light gestures rather than
dense micro-particles.
Typography: Preserve the custom artistic lettering style from the source cover:
contemporary high-contrast Song/Ming skeleton with restrained calligraphic
movement, warm bone-white and soft silver, elegant thick-to-thin strokes, fully
legible.
Text (verbatim, render only these two lines):
“无声之声”
“Voice for the Voiceless”
Do not include the Chinese slogan, “REVERSE”, “ADVENTUREX 2026”, candidate text,
labels, or any other words.
Style and simplification: Premium cinematic generative-art banner, deep
graphite-black background, subtle black-water sheen, clean glass shards, limited
fine dust, strong contrast. Simplify aggressively for 440×140 readability. The
title is the primary focal point, glasses second, ring and warm return third.
Color palette: near-black and graphite, bone-white title and incoming sound,
muted cyan/silver paths, one coral-orange to warm-gold selected return.
Constraints: exact 22:7 layout; exact Chinese title; exactly one pair of glasses;
exactly one ring; exactly four outgoing paths in total; one path passes through
the ring and turns warm; central safe-zone compliance; no watermark or border.
Avoid: 16:9 composition, vertical poster layout, squeezed original image, tiny
slogan text, theme labels, people, hands, phones, UI panels, literal arrows,
oversized products, dense particle noise, unreadable title, incorrect Chinese
characters, extra text, duplicate devices, extra paths, bright rainbow
gradients, medical or generic AI imagery.
```

## 导出与验收

- 将生成图居中裁切到 `22:7` 后缩放为 `440 × 140 px`；
- 已模拟 `360 × 140 px` 居中裁切；
- 两种宽度下项目名、眼镜与戒指均保持完整。
