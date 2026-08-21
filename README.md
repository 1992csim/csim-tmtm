# 機台製造進度追蹤系統 (Manufacturing Progress Tracking System)

這是一個使用 React + Vite + Tailwind CSS 開發的專業機台進度管理平台。

## 🚀 如何在本地端執行 (Local Development)

本專案無法直接透過瀏覽器開啟 `index.html` 運行，請依照以下步驟操作：

1. **安裝 Node.js**：
   請至 [Node.js 官網](https://nodejs.org/) 下載並安裝。

2. **進入專案目錄**：
   在終端機 (Terminal) 或 CMD 中切換至本專案資料夾。

3. **安裝依賴套件**：
   ```bash
   npm install
   ```

4. **啟動預覽**：
   ```bash
   npm run dev
   ```
   啟動後，請在瀏覽器開啟 `http://localhost:3000`。

## 📦 如何打包發佈 (Production Build)

如果您要將此系統部署到伺服器：

1. **執行打包指令**：
   ```bash
   npm run build
   ```
2. **部署內容**：
   將產生的 `dist/` 資料夾內的所有內容上傳至您的網頁主機即可。

## ✨ 主要功能
- **機台進度視覺化**：提供水平、垂直、方格三種進度檢視樣式。
- **資料管理**：支援新增、編輯、刪除機台。
- **檔案存取**：可將所有機台資料匯出為 JSON 檔備份，或匯入舊檔。
- **報表列印**：支援 A4 比例列印，包含自動產生報告與空白人工填寫表單。
- **行動裝置友善**：支援 PWA (可加到手機主畫面) 並提供 QR Code 快速分享。

## 🛠 使用技術
- React 19
- Vite 6
- Tailwind CSS 4
- Lucide React (圖標庫)
- Motion (動畫庫)
- QRCode.react (QR Code 產生)
