# 1920 × 320 详情 Banner 生成提示

## 生成方式

- 模式：Codex 内置 `image_gen`
- 类型：`ads-marketing`
- 视觉参考：`../cover-16x9.png`
- 采用生成稿：`2172 × 724 px`
- 最终输出：`../banner-detail-1920x320.png`，`1920 × 320 px`

## 最终提示

```text
Use case: ads-marketing
Asset type: landscape crop-safe working source for a final 1920×320 AdventureX
detail banner
Canvas: MUST be a very wide horizontal 3:1 landscape canvas, never portrait and
never square. The final asset will be made by taking a centered crop of the
middle 50 percent of this canvas height, producing a 6:1 panorama.
Primary request: Create a restrained 3:1 landscape working image for
“无声之声 · Voice for the Voiceless” in which all meaningful artwork is
deliberately compressed into a narrow horizontal strip across the middle 40
percent of canvas height. Above and below that strip, continue the same deep
graphite-black atmospheric background and faint black-water texture naturally.
The result should look intentional even before cropping, but must be optimized
for the centered 6:1 extraction.
Source reference: Use the supplied final cover as the source of truth for
artistic Chinese lettering, glasses, ring, silver/cyan glass light, coral
selected return, deep black water, and premium museum-poster mood. Recompose; do
not stretch or simply crop the source.
Crop coordinates: The future centered crop retains source-height 25–75 percent.
Place every critical element between source-height 34 and 60 percent. Keep
source-height 62.5–75 percent—the future bottom 25 percent overlay zone—free of
title, subtitle, glasses, ring, junctions, and bright essential light. This lower
zone may show only dim water, sparse reflections, and a faint fading warm trace.
Horizontal safe area: Keep the Chinese title, English subtitle, glasses, ring,
and path junctions inside the central 70 percent of canvas width. Far left and
far right contain only expendable continuation of waves and atmosphere.
Typography placement: Place the exact artistic title “无声之声” at left-center
within source-height 39–50 percent. Place “Voice for the Voiceless” directly
below, ending before source-height 58 percent. Use the same elegant contemporary
Song/Ming calligraphic lettering, warm bone-white/silver, with a tiny coral echo
on the last “声”. Make both lines large and legible in the final 320 px-high
crop.
Product placement: Place exactly one pair of matte-black rectangular smart
glasses near the geometric center at source-height about 44 percent, as the
optical refraction point. Place exactly one smooth dark-metal ring right of
center at source-height about 55 percent, safely above the overlay boundary.
Light-path placement: A silver-white waveform enters from the left through the
glasses. Exactly four paths emerge from the glasses, all contained between
source-height 34 and 57 percent. Three remain cool silver/cyan. The fourth curves
down through the ring while still cool, turns coral-orange/warm gold only after
the ring, and returns leftward as a clean warm arc around source-height 58–61
percent. Keep the bright return above the future overlay zone; only its dim
reflection may continue below.
Background: The top 25 percent and bottom 25 percent must be continuous
near-black atmosphere, not visible bars, padding, frames, or empty flat color.
Use extremely subtle dust and black-water gradients so the later crop remains
seamless.
Text (verbatim, only these two lines):
“无声之声”
“Voice for the Voiceless”
Do not include the Chinese slogan, REVERSE, ADVENTUREX 2026, labels, or other
words.
Style: sophisticated cinematic generative-art panorama, quiet, poetic, high
contrast, simplified for a low-height web header. Broad light gestures,
restrained glass shards, minimal particles.
Constraints: horizontal 3:1 working canvas; all critical content at
source-height 34–60 percent; lower future overlay zone free of important
content; exact title; exactly one glasses; exactly one ring; exactly four paths;
one path through ring turns warm; no watermark or border.
Avoid: portrait orientation, square canvas, content filling full height,
important content near top or bottom, title below 58 percent, ring below 60
percent, extra text, wrong Chinese characters, extra paths, duplicate products,
people, hands, phones, UI panels, arrows, excessive particles, neon rainbow,
medical or generic AI imagery.
```

## 导出与验收

- 从生成稿裁取 `2172 × 362 px`，纵向偏移 `228 px`；
- 缩放为 `1920 × 320 px`；
- 标题、英文名、眼镜与戒指均位于底部 `80 px` 覆盖区上方；
- 底部覆盖区仅包含水面、暖色余光与非关键碎片。
