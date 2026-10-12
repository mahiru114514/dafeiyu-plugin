# 五状态动画素材

使用内置 imagegen，根据用户提供的五张参考图生成一张四列五行透明 atlas。行顺序：睡觉、启动欢迎、等待确认、吃 tokens 工作、抱空碗空闲；每行四个动画帧。原参考文件位于用户本机微信临时目录，下面提示词中的顺序与用户图 1–5 相同。

## 原始提示词

Edit the five supplied reference drawings into ONE production transparent sprite atlas for the same chibi blue-haired whale maid character. Reference1 sleep hugging whale pillow; reference2 joyful welcome arms open with one leg lifted; reference3 shy expectant waiting hands under chin; reference4 happily nibbling a round biscuit with exact readable word "tokens"; reference5 hungry crying with EMPTY metal bowl. Preserve the reference character design, clothing, bows, whale motif and pose identity closely, especially the cookie and bowl, not generic sitting poses. Clean remove the white or black external backgrounds and any watermark/extra background text. Retain pale sticker outline around the character. Real alpha transparency throughout the empty background, not a checkerboard drawing.
Deliver one sprite animation atlas with EXACTLY FOUR equal columns and FIVE equal rows, all cells square, overall aspect ratio 4:5. No margins outside the grid, no labels, no dividing lines. Each cell contains the complete character on a transparent background, safely inside its cell with 8% padding, no clipping; same head scale and stable anchor in all four frames of each row. The atlas is meant for CSS steps animation at 104px per character.
Row1 sleep (ref1): four very subtle loop frames of sleepy breathing and pillow cuddle, closed eyes.
Row2 welcome (ref2): four distinct gentle waving frames, upbeat open arms, preserve standing pose, slight arm wave.
Row3 waiting (ref3): hands together, gentle blinking sequence eyes open / half-closed / closed / open, tiny shy sway.
Row4 working (ref4): four subtle nibbling frames holding the cookie "tokens", eyes happy, mouth chew and cookie bob; consistent cookie identity.
Row5 ordinary idle hungry (ref5): four frames gently presenting/shaking empty metal bowl, tearful hungry expression, mouth and little sway, no big embedded Chinese caption (UI will add it).
Strict uniform 4x5 square-cell layout: do not add extra drawings or change frame counts. Frames must actually differ subtly for a natural short repeating animation. Keep all visual effects within each frame's bounds and retain the reference blue/navy/white/gold palette and hand-drawn anime sticker finish.
