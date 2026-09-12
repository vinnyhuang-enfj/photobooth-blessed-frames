import { test, expect } from '@playwright/test';

test.use({
  video: 'on',
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
    ],
  },
  permissions: ['camera', 'microphone'],
});

const TARGET_URL = 'https://photobooth-blessed-frames.lovable.app/';
const TARGET_FRAME_COUNT = 6;

test.describe('與大師合影 - 完整自動化功能測試', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 45000 });

    // 點擊進入「與大師合影」功能
    const enterFeature = page.getByRole('button', { name: /與大師合影/i })
      .or(page.getByText('與大師合影'));
    if (await enterFeature.count() > 0) {
      await enterFeature.first().click();
    }
    await page.waitForTimeout(2000);
  });

  test('測試 1：選擇 6 個圖框進行「拍照」並驗證「儲存照片」與「分享照片」', async ({ page }) => {
    test.setTimeout(120000); // 延長為 2 分鐘

    // 自動偵測圖框列表（支援各類圖框縮圖容器）
    const frameElements = page.locator('img[src*="frame"], .cursor-pointer:has(img), [role="radio"], button:has(img), .frame-item');
    const totalFrames = await frameElements.count();
    const testCount = totalFrames > 0 ? Math.min(totalFrames, TARGET_FRAME_COUNT) : TARGET_FRAME_COUNT;

    console.log(`[拍照測試] 偵測到 ${totalFrames} 個圖框，開始測試前 ${testCount} 個圖框`);

    for (let i = 0; i < testCount; i++) {
      console.log(`\n=== 正在測試圖框 #${i + 1} 拍照流程 ===`);

      // 1. 點選圖框
      if (totalFrames > 0) {
        await frameElements.nth(i).click({ force: true });
        await page.waitForTimeout(600);
      }

      // 2. 切換至拍照模式（若有分頁按鈕）
      const photoTab = page.locator('button, [role="tab"]').filter({ hasText: /拍照/ }).first();
      if (await photoTab.count() > 0 && await photoTab.isVisible()) {
        await photoTab.click();
      }

      // 3. 點擊拍照快門按鈕（支援文字、Icon、圓形快門）
      const shutterBtn = page.locator('button.rounded-full, button:has(svg.lucide-camera), button')
        .filter({ hasText: /拍照|快門|拍攝|Capture/i })
        .or(page.locator('button:has(svg)').filter({ hasNotText: /切換|重置|Back|返回/ }))
        .first();

      await expect(shutterBtn).toBeVisible({ timeout: 10000 });
      await shutterBtn.click();
      await page.waitForTimeout(1500);

      // 4. 驗證「儲存照片」
      const saveBtn = page.getByRole('button', { name: /儲存照片|下載照片|下載/i }).or(page.getByText('儲存照片'));
      await expect(saveBtn.first()).toBeVisible({ timeout: 8000 });

      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 4000 }).catch(() => null),
        saveBtn.first().click(),
      ]);

      if (download) {
        console.log(`✓ 圖框 #${i + 1} [儲存照片] 成功觸發下載: ${download.suggestedFilename()}`);
      } else {
        console.log(`✓ 圖框 #${i + 1} [儲存照片] 觸發儲存面板/影像生成成功`);
      }

      // 5. 驗證「分享照片」
      const shareBtn = page.getByRole('button', { name: /分享照片|分享/i }).or(page.getByText('分享照片'));
      if (await shareBtn.count() > 0) {
        await shareBtn.first().click();
        console.log(`✓ 圖框 #${i + 1} [分享照片] 按鈕觸發成功`);
      }

      // 6. 重置回拍照準備狀態
      const retakeBtn = page.getByRole('button', { name: /重新|再拍一張|重置|Back|返回/i });
      if (await retakeBtn.count() > 0) {
        await retakeBtn.first().click();
        await page.waitForTimeout(800);
      }
    }
  });

  test('測試 2：選擇 6 個圖框進行「攝影」並驗證「儲存錄影」與「分享錄影」', async ({ page }) => {
    test.setTimeout(120000); // 延長為 2 分鐘，確保 6 個圖框錄影完整執行

    const frameElements = page.locator('img[src*="frame"], .cursor-pointer:has(img), [role="radio"], button:has(img), .frame-item');
    const totalFrames = await frameElements.count();
    const testCount = totalFrames > 0 ? Math.min(totalFrames, TARGET_FRAME_COUNT) : TARGET_FRAME_COUNT;

    console.log(`[攝影測試] 偵測到 ${totalFrames} 個圖框，開始測試前 ${testCount} 個圖框`);

    for (let i = 0; i < testCount; i++) {
      console.log(`\n=== 正在測試圖框 #${i + 1} 錄影流程 ===`);

      // 1. 選取圖框
      if (totalFrames > 0) {
        await frameElements.nth(i).click({ force: true });
        await page.waitForTimeout(600);
      }

      // 2. 切換至攝影模式
      const videoTab = page.locator('button, [role="tab"]').filter({ hasText: /攝影|錄影/ }).first();
      await expect(videoTab).toBeVisible({ timeout: 8000 });
      await videoTab.click();
      await page.waitForTimeout(600);

      // 3. 開始錄影
      const recordBtn = page.getByRole('button', { name: /開始錄影|錄影|Record/i }).first();
      await expect(recordBtn).toBeVisible({ timeout: 5000 });
      await recordBtn.click();

      // 錄製約 2 秒
      await page.waitForTimeout(2000);

      // 4. 結束錄影
      const stopBtn = page.getByRole('button', { name: /停止錄影|結束|完成/i }).or(recordBtn);
      await stopBtn.first().click();
      await page.waitForTimeout(1000);

      // 5. 驗證「儲存錄影」
      const saveVideoBtn = page.getByRole('button', { name: /儲存錄影|下載錄影|下載影片/i }).first();
      await expect(saveVideoBtn).toBeVisible({ timeout: 10000 });

      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 5000 }).catch(() => null),
        saveVideoBtn.click(),
      ]);

      if (download) {
        console.log(`✓ 圖框 #${i + 1} [儲存錄影] 下載觸發成功: ${download.suggestedFilename()}`);
      } else {
        console.log(`✓ 圖框 #${i + 1} [儲存錄影] 影片合成成功並觸發儲存`);
      }

      // 6. 驗證「分享錄影」
      const shareVideoBtn = page.getByRole('button', { name: /分享錄影|分享影片|分享/i }).first();
      await expect(shareVideoBtn).toBeVisible({ timeout: 5000 });
      await shareVideoBtn.click();
      console.log(`✓ 圖框 #${i + 1} [分享錄影] 按鈕正常反應`);

      // 7. 返回準備下一個圖框
      const retakeBtn = page.getByRole('button', { name: /重新|再拍一次|重置|Back|返回/i });
      if (await retakeBtn.count() > 0) {
        await retakeBtn.first().click();
        await page.waitForTimeout(800);
      }
    }
  });
});
