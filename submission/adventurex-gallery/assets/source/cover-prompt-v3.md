# 16:9 意象产品版项目封面编辑提示

## 编辑方式

- 模式：Codex 内置 `image_gen`
- 类型：`compositing`
- 编辑目标：`../cover-16x9-v2.png`
- 产品参考：`content/picture/开箱.jpg`
- 方向：保留抽象光路，在中央加入 Even G2 眼镜与 Even R1 戒指

## 最终提示

```text
Use case: compositing
Asset type: AdventureX Gallery project cover, wide 16:9
Primary request: Edit Image 1 by adding only two restrained product objects into
its central abstract light composition: one pair of black Even G2-style smart
glasses and one dark metallic Even R1-style smart ring. Preserve the poetic
abstract poster; do not turn it into a literal product advertisement.
Input images:
- Image 1 is the edit target and visual source of truth. Preserve its entire
  composition, typography, four refracted paths, color palette, black-water
  atmosphere, glass fragments, circular ripple, light flow, and 16:9 framing.
- Image 2 is reference only for the approximate physical form, proportions,
  matte-black rectangular frame, thick temples of the glasses, and dark metallic
  smooth ring. Do not copy Image 2’s collage, people, fingers, hands, laptop,
  room, red/orange text, reflections, or background.
Object placement: Float one front-facing pair of matte-black rectangular smart
glasses in the central optical refraction zone, centered just to the right of the
vertical prism fold. The incoming silver-white light should appear to pass
naturally through the lenses before splitting into exactly four glass-like
paths. Keep the glasses medium-small, elegant, and partially integrated with the
translucent light so they do not dominate the art.
Float one and only one dark metallic smart ring below and slightly right of the
glasses, aligned with the existing circular ripple where the warm selected path
begins. Show the ring at a subtle three-quarter angle, small and sculptural, with
a coral-gold rim light. The existing circular ripple should pass through its
opening, visually linking the ring to the moment of choice.
Integration: Match the original poster’s museum-like generative-art style. Give
the glasses cool cyan/silver edge light and the ring warm coral/gold edge light.
Preserve strong negative space and the abstract quality. No hands, no wearer, no
display UI, no logos, no labels on the products.
Typography invariants: Preserve every existing character exactly, in the same
placement, spelling, size hierarchy, and style:
“无声之声”
“Voice for the Voiceless”
“让每一个想表达的人，都能自己选择如何被听见。”
“REVERSE · ADVENTUREX 2026”
Do not rewrite, regenerate, translate, distort, move, or cover any text.
Visual invariants: Keep exactly four refracted paths, with only the lowest path
becoming coral-orange after the circular choice ripple. Keep the incoming white
waveform, returning warm arc, subtle spectral prism, black water reflection, and
existing left-lower typography area unchanged.
Constraints: exactly one pair of glasses; exactly one ring; no additional
objects; natural believable product geometry; both products must remain inside
the central safe area; no watermark or border.
Avoid: people, faces, silhouettes, hands, fingers, phones, screens, UI cards,
speech bubbles, medical imagery, generic AI icons, literal arrows, duplicate
glasses, duplicate rings, oversized product hero shot, glossy ecommerce
rendering, added text, lost paths, altered title, clutter.
```

## 输出

- 生成原图：`1672 × 941 px`
- Gallery 输出：`../cover-16x9-v3.png`，`1920 × 1080 px`
