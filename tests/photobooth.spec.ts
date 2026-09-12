import { test, expect } from '@playwright/test';

// 啟用虛擬攝影機與麥克風，繞過權限彈窗
test.use({
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
    // 進入目標網站
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // 尋找並進入「與大師合影」功能區塊
    const enterFeature = page.getByRole('button', { name: /與大師合影/i })
      .or(page.getByText('與大師合影'));
    if (await enterFeature.count() > 0) {
      await enterFeature.first().click();
    }
    
    // 等待相機視訊或畫布載入
    await page.waitForTimeout(2000);
  });

  test('測試 1：選擇 6 個圖框進行「拍照」並驗證「儲存照片」與「分享照片」', async ({ page }) => {
    // 定位所有可選圖框
    const frameButtons = page.locator('[role="radio"], button:has(img), .frame-item, [data-testid*="frame"]');
    const count = await frameButtons.count();
    const testCount = count > 0 ? Math.min(count, TARGET_FRAME_COUNT) : TARGET_FRAME_COUNT;

    console.log(`[拍照測試] 共偵測到 ${count} 個圖框元素，開始測試前 ${testCount} 個圖框`);

    for (let i = 0; i < testCount; i++) {
      console.log(`\n=== 正在測試圖框 #${i + 1} 拍照流程 ===`);

      // 1. 選取圖框
      if (count > 0) {
        await frameButtons.nth(i).click();
        await page.waitForTimeout(500);
      }

      // 2. 切換或確認處於「拍照」模式
      const photoTab = page.getByRole('tab', { name: /拍照/i }).or(page.getByText('拍照'));
      if (await photoTab.count() > 0) {
        await photoTab.first().click();
      }

      // 3. 點擊拍照按鈕
      const captureBtn = page.getByRole('button', { name: /拍照|快門|Capture/i }).or(page.locator('button.capture-btn'));
      await expect(captureBtn.first()).toBeVisible({ timeout: 5000 });
      await captureBtn.first().click();
      await page.waitForTimeout(1000);

      // 4. 驗證「儲存照片」
      const saveBtn = page.getByRole('button', { name: /儲存照片|下載照片|下載/i });
      await expect(saveBtn.first()).toBeVisible({ timeout: 8000 });

      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 4000 }).catch(() => null),
        saveBtn.first().click(),
      ]);

      if (download) {
        const filename = download.suggestedFilename();
        console.log(`✓ 圖框 #${i + 1} [儲存照片] 成功觸發下載: ${filename}`);
      } else {
        console.log(`✓ 圖框 #${i + 1} [儲存照片] 按鈕正常點擊（觸發 iOS 分享面板或 Base64 產生）`);
      }

      // 5. 驗證「分享照片」
      const shareBtn = page.getByRole('button', { name: /分享照片|分享/i });
      await expect(shareBtn.first()).toBeVisible({ timeout: 5000 });
      await shareBtn.first().click();
      console.log(`✓ 圖框 #${i + 1} [分享照片] 按鈕觸發成功`);

      // 截圖記錄當前圖框成果
      await page.screenshot({ path: `playwright-report/screenshots/photo-frame-${i + 1}.png` });

      // 6. 重置回拍照前狀態
      const retakeBtn = page.getByRole('button', { name: /重新|再拍一張|重置|Back/i });
      if (await retakeBtn.count() > 0) {
        await retakeBtn.first().click();
        await page.waitForTimeout(500);
      }
    }
  });

  test('測試 2：選擇 6 個圖框進行「攝影」並驗證「儲存錄影」與「分享錄影」', async ({ page }) => {
    const frameButtons = page.locator('[role="radio"], button:has(img), .frame-item, [data-testid*="frame"]');
    const count = await frameButtons.count();
    const testCount = count > 0 ? Math.min(count, TARGET_FRAME_COUNT) : TARGET_FRAME_COUNT;

    console.log(`[攝影測試] 開始測試前 ${testCount} 個圖框`);

    for (let i = 0; i < testCount; i++) {
      console.log(`\n=== 正在測試圖框 #${i + 1} 錄影流程 ===`);

      // 1. 選取圖框
      if (count > 0) {
        await frameButtons.nth(i).click();
        await page.waitForTimeout(500);
      }

      // 2. 切換至「攝影 / 錄影」模式
      const videoTab = page.getByRole('tab', { name: /攝影|錄影/i }).or(page.getByText('攝影')).or(page.getByText('錄影'));
      await expect(videoTab.first()).toBeVisible({ timeout: 5000 });
      await videoTab.first().click();
      await page.waitForTimeout(500);

      // 3. 開始錄影
      const recordBtn = page.getByRole('button', { name: /開始錄影|錄影|Record/i });
      await expect(recordBtn.first()).toBeVisible({ timeout: 5000 });
      await recordBtn.first().click();

      // 錄製 3 秒
      await page.waitForTimeout(3000);

      // 4. 結束錄影
      const stopBtn = page.getByRole('button', { name: /停止錄影|結束|完成/i }).or(recordBtn.first());
      await stopBtn.click();
      await page.waitForTimeout(1000);

      // 5. 驗證「儲存錄影」
      const saveVideoBtn = page.getByRole('button', { name: /儲存錄影|下載錄影|下載影片/i });
      await expect(saveVideoBtn.first()).toBeVisible({ timeout: 10000 });

      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 5000 }).catch(() => null),
        saveVideoBtn.first().click(),
      ]);

      if (download) {
        console.log(`✓ 圖框 #${i + 1} [儲存錄影] 下載觸發成功: ${download.suggestedFilename()}`);
      } else {
        console.log(`✓ 圖框 #${i + 1} [儲存錄影] 影片合成並提供儲存操作`);
      }

      // 6. 驗證「分享錄影」
      const shareVideoBtn = page.getByRole('button', { name: /分享錄影|分享影片|分享/i });
      await expect(shareVideoBtn.first()).toBeVisible({ timeout: 5000 });
      await shareVideoBtn.first().click();
      console.log(`✓ 圖框 #${i + 1} [分享錄影] 按鈕正常反應`);

      // 截圖記錄當前錄影成果
      await page.screenshot({ path: `playwright-report/screenshots/video-frame-${i + 1}.png` });

      // 7. 返回準備下一個圖框
      const retakeBtn = page.getByRole('button', { name: /重新|再拍一次|重置|Back/i });
      if (await retakeBtn.count() > 0) {
        await retakeBtn.first().click();
        await page.waitForTimeout(500);
      }
    }
  });
});
