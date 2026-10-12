# 提醒动画素材

最终透明素材 1774×887 RGBA，空白区包含真实透明像素，四条外边缘无不透明像素。

使用内置 imagegen。参考 1 是用户新 P1，用于等待确认；参考 2 是 P2，用于喝水/休息提醒。输出 assets/pet-reminders-v4.png，四列两行，每行四帧。

## 提示词

Use case: identity-preserve, animated sprite atlas for an existing Harness in-window chibi companion named 大肥鱼. Input 1 is the exact pose/identity reference for WAITING FOR USER CONFIRMATION: blue-haired whale maid, half-open patient eyes, both hands hanging naturally at her sides, neutral small mouth, small ellipsis speech bubble on her upper left. Input 2 is the exact pose/identity reference for WATER/REST REMINDER: the same blue-haired whale maid, hands held under her chin, shy affectionate expectant blue eyes and pink cheeks, small pink hearts around her head.

Produce ONE genuinely transparent sprite sheet, exactly FOUR equal columns and TWO equal rows, overall aspect ratio 2:1 and square cells. Top row: four gentle loop animation frames of input 1, subtle breathing, half-open eyes / blink / half-open eyes, slight speech-bubble dot changes. Bottom row: four gentle loop frames of input 2, subtle breathing and shy blink, tiny pink heart floating. The four frames must vary subtly but keep the whole character pose, scale and bottom-center anchor consistent within each row.

Keep the reference hair shape, gradient navy-to-blue, blue bows with gold hearts, white frilled maid headpiece, navy whale-themed dress and white apron, whale tail, shoes, full body and soft pale sticker outline. Neutral hands-down posture for top row; hands-under-chin posture for bottom row. No cookie, bowl, pillow or beverage props. Remove white background and watermark; true alpha transparency, no checkerboard artwork. No text labels, no watermark, no border/grid lines. All character/effects safely inside their square cell, 8% internal padding, no clipping or crossing cell borders. Character should occupy roughly 80% of cell height and remain recognizable at 104px CSS display size. Match the user's provided artwork closely, not a generic replacement character.

## 边缘整理的追加提示词

Edit this sprite atlas only. Keep exactly the same FOUR columns by TWO rows, overall 2:1, square equal cells, the same eight character poses/frame distinctions and the same blue-haired whale maid identity, clothing, ellipsis bubbles in top row and hearts in bottom row. Clean up transparency: remove ALL isolated blue/white/black speckles and stray tiny dots outside the intentionally drawn character, hearts and ellipsis speech bubbles. Make empty background truly empty alpha=0, with smooth clean anti-aliased edges; retain pale sticker outline. Slightly shrink each complete character together with its intentional effects to fit safely within its own cell with at least 6% clear padding on all four sides. Align all four frames in each row to a stable bottom-center anchor and consistent scale. Do not clip the hair, shoes, bubbles, or hearts. Do not change cell ordering or create extra frames. No labels, watermark, grid or opaque background. Top row waiting patient hands at sides; bottom row affectionate hands under chin. This is a production 104px four-frame CSS companion sprite sheet.
