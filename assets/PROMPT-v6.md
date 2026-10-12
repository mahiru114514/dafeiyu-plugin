# 失败与停止四帧动画

模式：内置 image_gen，透明背景。根据用户参考生成，非官方美术素材。
参考 1：`a18ab5bc16529f58b4e429f8a3423cc2.jpg`，失败。
参考 2：`fd59862e09c9241a2e50709187acf1fb.jpg`，手动停止。
素材：`assets/pet-endings-v6.png`；四列两行，第 0 行失败，第 1 行停止。

## 初始提示词

Use case: stylized-concept.
Asset type: transparent animated companion sprite atlas, exactly FOUR columns and TWO rows of equal square cells, eight stickers total, overall 2:1 aspect ratio.
Input image 1 is the FAILURE character pose reference for the TOP row. Input image 2 is the USER STOPPED character pose reference for the BOTTOM row. Faithfully preserve the blue-haired whale maid identity, reference dress details, colors, body proportions and the different poses. Every row is its own four-frame subtle looping animation.
TOP ROW: reference 1, maid lying limp diagonally with cross-shaped eyes, open mouth, whale tail, floating tiny soul ghost, blue bubbles and the large vertical Chinese text verbatim “死掉了” on her left. All four frames keep crossed eyes and exact text. Motion: ghost gently drifts and settles, tiny hair/tail sway, bubbles softly change shine. Do not turn this into happiness or a standing character.
BOTTOM ROW: reference 2, maid standing holding the same white sign bearing the same black C-like enclosing stroke with an X inside, surprised/questioning expression, question marks. Preserve her speech balloon at top left with exact Chinese text: 大师，这个“凶”是什么意思啊？. No watermark. Motion: tiny head tilt and breathing, slight sign sway and a brief blink, then return to original open-eyed stance. Preserve sign and balloon lettering across all frames.
Four frames per row: base pose, subtle motion outward, midpoint (blink only in bottom row), settle. Fixed character, sign and text anchors and same scale in every cell. Full original sticker composition in each cell including shoes, tail, text and balloon. Each complete sticker occupies only 84% of its cell; 8% transparent padding on ALL sides; no art crosses any cell edge.
Style: crisp anime chibi sticker line art matching references. White sticker border is foreground, all outside empty space genuinely transparent alpha. Absolutely no background fill, checkerboard, grid, labels, captions, UI, watermark or disconnected speckles/debris.

## 留白修订

Edit target: existing eight-frame sprite atlas. Fix only safe transparent padding and stray background pixels. Keep exact four-column two-row layout, equal square cells and ALL eight original stickers, character poses, cross eyes, ghost, sign glyph, speech balloon text and “死掉了” text unchanged. Do not redraw or redesign the stickers.
Within EACH cell, uniformly reduce the complete sticker to 82% of current size and center it. Every cell must have generous transparent padding and no clipped ghost/lettering. Preserve relative anchor alignment across each row. Remove every disconnected white/blue speckle in empty space and gutter, especially outside the sticker outlines. Preserve intentional bubbles and question marks. Retain actual transparent alpha background, keep only clean contiguous sticker artwork and intentional decorations. No fill, checkerboard, labels, watermark or new art.
