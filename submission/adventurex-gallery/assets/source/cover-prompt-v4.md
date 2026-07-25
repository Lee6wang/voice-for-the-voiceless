# 16:9 融合版项目封面编辑提示

## 编辑方式

- 模式：Codex 内置 `image_gen`
- 类型：`compositing` + `precise-object-edit`
- 编辑起点：`../cover-16x9-v3.png`
- 产品参考：`content/picture/开箱.jpg`
- 方向：让声音、眼镜、四种可能、戒指选择与暖色回返形成连续因果

## 第一步：融合眼镜、路径与戒指

```text
Use case: compositing
Asset type: AdventureX Gallery project cover, wide 16:9
Primary request: Refine Image 1 so the glasses, ring, four light paths, and
returning voice become one continuous poetic mechanism rather than separate
floating objects. Preserve the abstract museum-poster character. Make the visual
causality unmistakable: incoming sound passes through the glasses, becomes
exactly four possibilities, one passes through the ring, and only then becomes a
warm returning voice.
Input images:
- Image 1 is the edit target and source of truth for the complete composition,
  typography, black-water atmosphere, light palette, prism, four-path idea, and
  warm returning arc.
- Image 2 is reference only for the approximate industrial form of the Even
  G2-style matte-black rectangular glasses and the Even R1-style dark smooth
  ring. Do not copy its collage, room, laptop, hands, fingers, text, or
  background.
Glasses integration: Reduce the glasses in Image 1 by about 15 percent and
position them precisely at the central refraction point. Keep the recognizable
matte-black rectangular frame and thick temples, but let roughly 25–30 percent
of the outer frame edges softly dissolve into the same translucent glass shards
and silver-cyan particles already present in the poster. Keep the lenses
transparent. The silver-white incoming waveform from the left must visibly enter
the left lens, refract subtly across the bridge, and leave through the right
lens. Only after leaving the right lens should it separate cleanly into exactly
four distinct paths. Layer some shards behind and a few fine particles in front
of the frame so the glasses belong to the light field, while preserving a
readable product silhouette.
Four-path integration: Show exactly four paths emerging from the right lens.
Three remain cool silver/cyan and unresolved. The fourth, lowest path curves
downward toward the ring while still cool. Keep the paths visually distinct and
elegant, not UI cards or arrows.
Ring integration: Replace the mechanically detailed ring from Image 1 with one
clean, smooth dark-metal band based on Image 2, with a simple believable opening
and no gears, teeth, stones, LEDs, or internal machinery. Position it below-right
of the glasses at the existing circular ripple. The lowest cool path must pass
physically through the center opening of the ring. Let the circular ripple
originate from the ring opening. On the far side of the ring—and only there—the
path changes from cool silver/cyan to coral-orange and warm gold. Light the entry
side of the ring with cool cyan and the exit side with warm coral, so the ring
itself embodies the choice transition.
Returning voice: Preserve the large warm arc along the bottom, but make it
clearly continuous with the warm path exiting the ring. Let the arc sweep back
toward the left beneath the typography and fade gently near the already
orange-highlighted words “被听见”, without touching, covering, underlining, or
distorting any characters. No literal arrowhead.
Typography invariants: Preserve every existing character exactly, with identical
spelling, location, hierarchy, and legibility:
“无声之声”
“Voice for the Voiceless”
“让每一个想表达的人，都能自己选择如何被听见。”
“REVERSE · ADVENTUREX 2026”
Do not move, rewrite, translate, regenerate, distort, cover, or add any text.
Scene and style invariants: Preserve the near-black graphite background, subtle
black-water reflection, restrained rainbow prism edge, glass fragments, silver
dust, cool-to-warm palette, left-lower negative space, central 70 percent safe
area, and cinematic generative-art mood. The result should be about 60 percent
abstract light and glass, 40 percent recognizable product.
Constraints: exactly one pair of glasses; exactly one ring; exactly four outgoing
possibility paths; one and only one path passes through the ring and turns warm;
no other objects; no watermark or border.
Avoid: people, faces, silhouettes, hands, fingers, phones, screens, UI panels,
labels, logos, medical imagery, literal arrows, oversized products, ecommerce
product-shot lighting, pasted-on appearance, duplicate devices, mechanical ring
interior, extra paths, altered text, clutter.
```

## 第二步：将路径修正为恰好四条

第一步生成了四条冷色路径与一条通向戒指的路径，因此使用以下提示删除多余
支路：

```text
Use case: precise-object-edit
Asset type: AdventureX Gallery project cover, wide 16:9
Primary request: Make one targeted correction to the supplied image: reduce the
outgoing possibilities from five total paths to exactly four total paths.
Exact edit: To the right of the glasses there are currently four cool cyan/silver
mostly-horizontal paths plus one separate downward cool path that travels
through the ring. Remove only the lowest of the four mostly-horizontal cool
paths—the extra cool branch immediately above the downward ring path. Reconstruct
the removed area with the original near-black background, subtle water
reflection, sparse dust, and natural negative space.
Required final path count: exactly four paths must emerge after the glasses:
three cool unresolved paths extending toward the upper/right side, plus one
lowest cool path curving downward through the ring. The downward path must remain
cool before the ring, pass visibly through the ring opening, turn coral-orange
only after exiting the ring, and continue into the existing warm returning arc.
Preserve all other visual content exactly: the incoming silver waveform; size,
placement, shape, and lighting of the glasses; the smooth ring and its
cyan-to-coral rim lighting; the vertical prism; glass-shard style of the
remaining paths; warm return arc; black-water atmosphere; color palette;
composition; 16:9 framing; and every particle outside the removed branch area.
Typography invariants: Preserve every character exactly, with no movement or
regeneration:
“无声之声”
“Voice for the Voiceless”
“让每一个想表达的人，都能自己选择如何被听见。”
“REVERSE · ADVENTUREX 2026”
Do not alter, cover, translate, add, or distort any text.
Constraints: exactly one pair of glasses; exactly one ring; exactly four outgoing
paths in total; no other changes; no watermark or border.
Avoid: adding new branches, changing product geometry, moving the devices,
altering the warm arc, changing typography, new objects, people, hands, UI,
arrows, clutter.
```

## 输出

- 生成原图：`1672 × 941 px`
- Gallery 输出：`../cover-16x9-v4.png`，`1920 × 1080 px`
