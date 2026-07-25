# 16:9 艺术字版项目封面编辑提示

## 编辑方式

- 模式：Codex 内置 `image_gen`
- 类型：`precise-object-edit`
- 编辑起点：`../cover-16x9-v4.png`
- 编辑范围：仅中文主标题“无声之声”

## 最终提示

```text
Use case: precise-object-edit
Asset type: AdventureX Gallery project cover, wide 16:9
Primary request: Replace only the Chinese main title “无声之声” in the supplied
poster with more elegant custom artistic Chinese display lettering. Change no
other element.
Exact text: “无声之声” — render these four simplified-Chinese characters exactly
once, in this exact order. Every character must remain fully legible and
unmistakable at thumbnail size.
Lettering style: bespoke contemporary Chinese title lettering built on an
elegant high-contrast Song/Ming serif skeleton, blended with very restrained
calligraphic movement. Use graceful thick-to-thin stroke contrast, long
confident horizontal strokes, fine tapered terminals, generous internal
counters, and a quiet rhythm between the four characters. The result should
feel like a refined film title or museum exhibition identity: poetic, cultured,
modern, and emotionally resonant. It must not look like a standard system font,
but also must not become loose cursive, ancient seal script, or decorative
illegibility.
Material and color: warm bone-white and soft silver as the main lettering color,
matching the existing typography. Add extremely subtle translucent-glass
refraction and a faint silver glow along selected stroke edges, consistent with
the poster’s light-and-glass language. On the final character “声” only, allow
the last terminal to dissolve into a very small restrained trace of coral-gold
dust, suggesting an echo returning to voice. Keep the effect refined and
minimal; the characters remain primarily flat and readable, not 3D chrome.
Placement and scale: Keep the title in the same left-lower title area, on the
same baseline and with approximately the same overall bounding box as the
existing “无声之声”. Preserve its hierarchy above the English subtitle. Slight
optical refinements to spacing are allowed, but do not move the text block or
collide with nearby elements.
Strict typography invariants: Preserve all other existing text exactly as-is,
character for character, with identical placement, font, size, and color:
“Voice for the Voiceless”
“让每一个想表达的人，都能自己选择如何被听见。”
“REVERSE · ADVENTUREX 2026”
Do not rewrite, regenerate, translate, move, cover, distort, or restyle these
three text lines.
Strict visual invariants: Preserve the entire abstract image unchanged—the
incoming white waveform, one pair of glasses, vertical prism, exactly four
outgoing paths, one smooth ring, cool path passing through the ring, warm path
after the ring, returning coral arc, glass shards, black-water reflection,
particles, lighting, colors, composition, and 16:9 framing. The edit must affect
only the pixels occupied by the Chinese main title and its immediate glow.
Constraints: exact Chinese title “无声之声”; exactly four characters; no added
subtitle; no logos; no watermark; no border.
Avoid: wrong or invented Chinese characters, traditional-character
substitutions, extra strokes that change character identity, duplicated
characters, missing characters, cursive illegibility, seal script, cartoon
calligraphy, neon signage, embossed gold, metallic 3D text, excessive glow,
brush splatter, moving the title, changing any image element or any other text.
```

## 输出

- 生成原图：`1672 × 941 px`
- Gallery 输出：`../cover-16x9-v5.png`，`1920 × 1080 px`
