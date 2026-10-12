# 完成庆祝动画

模式：内置 image_gen；透明背景。基于用户最新“最强”参考生成，非官方美术素材。
输入：`3dcba1868d60be14ae608045776ac08b.jpg`。
保存：`assets/pet-complete-v5.png`，2×2 四帧循环。

## 初始提示词

Use case: stylized-concept.
Asset type: transparent animated companion sprite sheet, exactly 2 columns by 2 rows of four equal square cells.
Input image 1 is the character, pose and lettering reference. Make a faithful animation derivative of this exact sticker: blue-haired whale maid, proud face, both hands on hips, navy dress, whale tail, large blue Chinese brush lettering to her left reading verbatim “最强”, gold sparkle stars, white sticker outline. Preserve her identity, body proportions, dress details, placement and the exact Chinese characters.
Four animation frames ordered left-to-right then top-to-bottom: 1 neutral proud stance; 2 slight breath upward and hair/tail sway, sparkle bright; 3 brief blink with same proud smile, hair/tail gently returns; 4 eyes open, settle into first stance. Tiny motion only, keep body anchor, lettering anchor and scale identical across all frames for a seamless loop.
Composition: one complete sticker per square cell, full character including shoes and all lettering, centered, 5% transparent padding all around every cell. Equal square cells, strictly aligned grid. No grids, dividers, cell borders, labels, extra caption, watermark or interface.
Background must be genuinely transparent alpha throughout all empty space and between cells, not white, not checkered. Preserve white sticker outlines as part of foreground art. Crisp clean line art matching the reference.

## 边缘与留白修订

Edit this completion sprite sheet only to clean up its transparency and safe cell padding. Keep exactly the existing 2 by 2 grid of four frames, character identity, exact “最强” lettering, white sticker outlines, poses, blink and colors. Remove ALL disconnected stray white/blue speckles and tiny debris in empty background, including the gutter. Scale EACH complete sticker down uniformly to 88% of its current size within its OWN cell, centered, so no lettering or art touches any cell edge and cells do not bleed into each other. Keep equal square cells and stable character/lettering anchors. Output true transparent alpha in all cleared areas. No redesign, no extra art, no new words or watermark.
