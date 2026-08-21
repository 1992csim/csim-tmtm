/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion, AnimatePresence } from "motion/react";
import { 
  ClipboardList, 
  FileText, 
  Box, 
  ShoppingCart, 
  Wrench, 
  Zap, 
  TestTube, 
  Truck,
  CheckCircle2,
  Clock,
  ChevronRight,
  LayoutGrid,
  Map,
  Activity,
  Plus,
  Trash2,
  Edit2,
  X,
  Printer,
  ExternalLink,
  Save,
  FolderOpen,
  Download,
  Upload,
  QrCode
} from "lucide-react";
import { useState, useMemo, ReactNode, useRef, ChangeEvent, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { 
  collection, 
  onSnapshot, 
  setDoc, 
  deleteDoc, 
  doc, 
  query, 
  orderBy,
  serverTimestamp,
  addDoc,
  getDocs,
  where
} from "firebase/firestore";
import { initAuth, googleSignIn, logout, getAccessToken, db, auth } from "./lib/firebase";
import { SheetService, Machine, StageKey, StageDetail } from "./services/sheetService";

// --- Error Handling & Types ---

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Types & Constants ---

interface Stage {
  key: StageKey;
  label: string;
  icon: any;
  description: string;
}

const STAGES: Stage[] = [
  { key: "ORDER", label: "接單日期", icon: ClipboardList, description: "確認訂單需求與合約簽署" },
  { key: "DRAWING", label: "製圖發包", icon: FileText, description: "工程圖紙繪製與委外加工發包" },
  { key: "FRAME", label: "機架入庫", icon: Box, description: "主體框架加工完成並進入倉庫" },
  { key: "PARTS_ORDER", label: "零件發包", icon: ShoppingCart, description: "標準件採購與非標件加工發包" },
  { key: "ASSEMBLY", label: "零件組裝", icon: Wrench, description: "機械部分組裝與精度調整" },
  { key: "WIRING", label: "開始配電", icon: Zap, description: "電控盤配線與現場感應器安裝" },
  { key: "TESTING", label: "機台測試", icon: TestTube, description: "空運轉測試與正式生產流程校驗" },
  { key: "SHIPPING", label: "出貨日期", icon: Truck, description: "最終品檢完成並安排物流裝運" },
];

const isTimelineStage = (key: StageKey) => key !== "ORDER" && key !== "SHIPPING";

const SAMPLE_DATA: Machine[] = [
  {
    id: "M-2024-001",
    name: "高精度 CNC 加工機",
    currentStage: 4,
    customer: "台積電 (TSMC)",
    stageData: {
      ORDER: { date: "2024-05-01", progress: 100 },
      DRAWING: { startDate: "2024-05-08", endDate: "2024-05-15", progress: 100 },
      FRAME: { startDate: "2024-05-16", endDate: "2024-05-20", progress: 100 },
      PARTS_ORDER: { startDate: "2024-05-22", endDate: "2024-05-30", progress: 100 },
      ASSEMBLY: { startDate: "2024-06-01", endDate: "2024-06-15", progress: 45 },
      WIRING: { startDate: "", endDate: "", progress: 0 },
      TESTING: { startDate: "", endDate: "", progress: 0 },
      SHIPPING: { date: "", progress: 0 },
    }
  },
  {
    id: "M-2024-002",
    name: "自動點膠機系統",
    currentStage: 7,
    customer: "日月光 (ASE)",
    stageData: {
      ORDER: { date: "2024-04-15", progress: 100 },
      DRAWING: { startDate: "2024-04-20", endDate: "2024-04-25", progress: 100 },
      FRAME: { startDate: "2024-04-26", endDate: "2024-04-30", progress: 100 },
      PARTS_ORDER: { startDate: "2024-05-01", endDate: "2024-05-05", progress: 100 },
      ASSEMBLY: { startDate: "2024-05-06", endDate: "2024-05-12", progress: 100 },
      WIRING: { startDate: "2024-05-13", endDate: "2024-05-16", progress: 100 },
      TESTING: { startDate: "2024-05-17", endDate: "2024-05-20", progress: 100 },
      SHIPPING: { date: "2024-05-22", progress: 100 },
    }
  }
];

// --- Components ---

const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean, onClose: () => void, title: string, children: ReactNode }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex justify-between items-center p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </motion.div>
    </div>
  );
};

const MachineForm = ({ 
  initialData, 
  onSubmit, 
  onCancel 
}: { 
  initialData?: Machine, 
  onSubmit: (data: Machine) => void, 
  onCancel: () => void 
}) => {
  const getDefaultStageData = (): Record<StageKey, StageDetail> => {
    const data = {} as Record<StageKey, StageDetail>;
    STAGES.forEach(s => {
      data[s.key] = {
        date: s.key === "ORDER" ? new Date().toISOString().split('T')[0] : "",
        startDate: "",
        endDate: "",
        progress: 0
      };
    });
    return data;
  };

  const [formData, setFormData] = useState<Machine>(() => {
    if (initialData) {
      return {
        ...initialData,
        createdAt: initialData.createdAt || new Date().toISOString()
      };
    }
    return {
      id: `M-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      name: "",
      customer: "",
      currentStage: 0,
      stageData: getDefaultStageData(),
      createdAt: new Date().toISOString()
    };
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(formData); }} className="space-y-6 text-[17px]">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-[17px] font-bold text-gray-700 mb-1">訂單編號</label>
          <input 
            type="text" 
            value={formData.id}
            onChange={(e) => setFormData({ ...formData, id: e.target.value })}
            className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none text-[17px]"
            placeholder="M-2024-XXX"
            required
          />
        </div>
        <div>
          <label className="block text-[17px] font-bold text-gray-700 mb-1">客戶名稱</label>
          <input 
            type="text" 
            value={formData.customer}
            onChange={(e) => setFormData({ ...formData, customer: e.target.value })}
            className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none text-[17px]"
            placeholder="客戶名稱"
            required
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-[17px] font-bold text-gray-700 mb-1">機台名稱</label>
          <input 
            type="text" 
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none text-[17px]"
            placeholder="機台名稱"
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-[17px] font-bold text-gray-700 mb-3">進度階段詳細設定</label>
        <div className="space-y-6">
          {STAGES.map((stage, idx) => (
            <div key={stage.key} className="p-4 rounded-2xl bg-gray-50 border border-gray-100 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <input 
                    type="radio" 
                    name="currentStage"
                    checked={formData.currentStage === idx}
                    onChange={() => setFormData({ ...formData, currentStage: idx })}
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-[17px] font-bold text-gray-800">{stage.label}</span>
                </div>
                {isTimelineStage(stage.key) && (
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-bold text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full">
                      當前進度: {formData.stageData[stage.key].progress}%
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {!isTimelineStage(stage.key) ? (
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase font-bold text-gray-400">日期</span>
                    <input 
                      type="date"
                      value={formData.stageData[stage.key].date}
                      onChange={(e) => setFormData({
                        ...formData,
                        stageData: { 
                          ...formData.stageData, 
                          [stage.key]: { ...formData.stageData[stage.key], date: e.target.value }
                        }
                      })}
                      className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase font-bold text-gray-400">開始日期</span>
                      <input 
                        type="date"
                        value={formData.stageData[stage.key].startDate}
                        onChange={(e) => setFormData({
                          ...formData,
                          stageData: { 
                            ...formData.stageData, 
                            [stage.key]: { ...formData.stageData[stage.key], startDate: e.target.value }
                          }
                        })}
                        className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase font-bold text-gray-400">結束日期</span>
                      <input 
                        type="date"
                        value={formData.stageData[stage.key].endDate}
                        onChange={(e) => setFormData({
                          ...formData,
                          stageData: { 
                            ...formData.stageData, 
                            [stage.key]: { ...formData.stageData[stage.key], endDate: e.target.value }
                          }
                        })}
                        className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div className="sm:col-span-2 flex flex-col gap-2">
                       <span className="text-[10px] uppercase font-bold text-gray-400">內部進度 (水平拉霸)</span>
                       <input 
                         type="range" 
                         min="0" 
                         max="100" 
                         value={formData.stageData[stage.key].progress}
                         onChange={(e) => setFormData({
                           ...formData,
                           stageData: { 
                             ...formData.stageData, 
                             [stage.key]: { ...formData.stageData[stage.key], progress: parseInt(e.target.value) }
                           }
                         })}
                         className="w-full h-2 bg-blue-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                       />
                    </div>
                  </>
                )}

                {/* Notes Input block */}
                <div className="sm:col-span-2 flex flex-col gap-1 border-t border-gray-100/80 pt-3">
                  <span className="text-[10px] uppercase font-bold text-gray-400">📝 階段備註事項 (Notes)</span>
                  <input 
                    type="text"
                    placeholder="請在此輸入當前階段的特別交代、承載備忘或進度補充"
                    value={formData.stageData[stage.key].note || ""}
                    onChange={(e) => setFormData({
                      ...formData,
                      stageData: {
                        ...formData.stageData,
                        [stage.key]: { ...formData.stageData[stage.key], note: e.target.value }
                      }
                    })}
                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 w-full"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
        <button 
          type="button" 
          onClick={onCancel}
          className="px-6 py-2 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100 transition-colors"
        >
          取消
        </button>
        <button 
          type="submit"
          className="px-6 py-2 rounded-xl text-sm font-bold bg-blue-600 text-white shadow-lg shadow-blue-200 hover:bg-blue-700 transition-colors"
        >
          儲存機台資料
        </button>
      </div>
    </form>
  );
}

const ProgressBar = ({ currentStage }: { currentStage: number }) => {
  const percent = ((currentStage + 1) / STAGES.length) * 100;
  return (
    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
      <motion.div 
        className="h-full bg-blue-600"
        initial={{ width: 0 }}
        animate={{ width: `${percent}%` }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      />
    </div>
  );
};

// Style 1: Horizontal Stepper (Sleek & Modern)
const HorizontalStepper = ({ machine, onToggleStage }: { machine: Machine, onToggleStage: (key: StageKey) => void }) => {
  return (
    <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm overflow-x-auto print:overflow-visible print:px-0 print:py-2 print:border-none print:shadow-none print:mt-1 print:mb-2 print-stepper-card">
      <div className="flex items-start justify-between min-w-[1000px] print:min-w-full print:gap-0 print-stepper-row">
        {STAGES.map((stage, index) => {
          const isCompleted = index < machine.currentStage;
          const isActive = index === machine.currentStage;
          const Icon = stage.icon;
          const sd = machine.stageData[stage.key] || { progress: 0 };
          const displayProgress = isCompleted ? 100 : (isActive ? (sd.progress ?? 0) : 0);

          return (
            <div key={stage.key} className="relative flex flex-col items-center flex-1 print-stepper-col">
              {/* Connector (precisely centered matching print:top-[35px]) */}
              {index < STAGES.length - 1 && (
                <div className="absolute top-[20px] print:top-[35px] left-[50%] right-[-50%] h-[2px] bg-gray-100 z-0 print-stepper-line">
                  <motion.div 
                    className="h-full bg-blue-500"
                    initial={{ width: 0 }}
                    animate={{ width: isCompleted ? "100%" : "0%" }}
                  />
                </div>
              )}
              
              {/* Node */}
              <motion.div 
                className={`w-10 h-10 rounded-full flex items-center justify-center z-10 transition-colors duration-300 print:w-[70px] print:h-[70px] cursor-pointer print-node-circle ${
                  isCompleted ? "bg-blue-500 text-white animate-fade-in" : 
                  isActive ? "bg-blue-600 text-white ring-4 ring-blue-50" : 
                  "bg-gray-100 text-gray-400"
                }`}
                whileHover={{ scale: 1.1 }}
                onClick={() => onToggleStage(stage.key)}
                title={isCompleted ? "點擊將此階段設為未完成" : "點擊快速標示此階段為 100% 完工"}
              >
                {isCompleted ? <CheckCircle2 size={20} className="print:w-7 print:h-7 stepper-icon-svg" /> : <Icon size={20} className="print:w-7 print:h-7 stepper-icon-svg" />}
              </motion.div>

              {/* Text Info (Symmetric Height-Aligned Container to maintain straight rows) */}
              <div className="mt-3 text-center flex flex-col items-center print:mt-[1cm] print-stepper-text">
                {/* 1. Stage Label (Enlarged and boldened) */}
                <p className={`text-sm font-bold whitespace-nowrap ${isActive ? "text-blue-600 font-extrabold" : "text-gray-600"} print:text-[20px] print:font-extrabold print:whitespace-nowrap print:leading-tight print-stepper-label`}>
                  {stage.label}
                </p>

                {/* 2. Unified Dual-Line Date layout */}
                <div className="mt-2 flex flex-col items-center gap-0.5 print:mt-1 print-stepper-dates">
                  {!isTimelineStage(stage.key) ? (
                    <>
                      <span className="text-[13px] sm:text-[14px] text-gray-500 font-mono font-bold leading-none print:text-[20px] whitespace-nowrap print-stepper-detail">D: {sd.date || "--"}</span>
                      {/* invisible filler to keep alignment identical across all 8 columns */}
                      <span className="text-[13px] sm:text-[14px] text-transparent select-none font-mono font-bold leading-none print:text-[20px] block">Empty</span>
                    </>
                  ) : (
                    <>
                      <span className="text-[13px] sm:text-[14px] text-gray-500 font-mono font-bold leading-none print:text-[20px] whitespace-nowrap print-stepper-detail">S: {sd.startDate || "--"}</span>
                      <span className="text-[13px] sm:text-[14px] text-gray-500 font-mono font-bold leading-none print:text-[20px] whitespace-nowrap print-stepper-detail">E: {sd.endDate || "--"}</span>
                    </>
                  )}
                </div>

                {/* 3. Unified Height progress bar constraint */}
                <div className="mt-2 h-2 print:mt-1 flex items-center justify-center">
                  {isTimelineStage(stage.key) && displayProgress > 0 ? (
                    <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden print:w-14 print:h-1.5" title={`進度: ${displayProgress}%`}>
                      <div 
                        className="h-full bg-blue-400" 
                        style={{ width: `${displayProgress}%` }}
                      />
                    </div>
                  ) : (
                    <div className="w-16 h-1.5 opacity-0 print:w-14 print:h-1.5" />
                  )}
                </div>

                {/* Note block (compact, doesn't interfere with core stats rows alignment) */}
                {sd.note && (
                  <div className="mt-1 bg-amber-50 text-amber-800 rounded-lg px-2 py-0.5 border border-amber-100/50 max-w-[110px] text-[10px] truncate leading-tight shadow-sm print:max-w-[100px] print:text-[9px] print:mt-0.5" title={sd.note}>
                    📝 {sd.note}
                  </div>
                )}

                {/* Complete Checkbox */}
                <div className="mt-2.5 pt-0.5 print:hidden no-print">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer bg-gray-50 hover:bg-gray-100 px-2.5 py-1 rounded-full border border-gray-200 transition-colors" title="點擊快速標示完工">
                    <input 
                      type="checkbox"
                      checked={isCompleted || (isActive && displayProgress === 100)}
                      onChange={() => onToggleStage(stage.key)}
                      className="w-3.5 h-3.5 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                    />
                    <span className="text-[13px] font-bold text-gray-600 select-none">完工</span>
                  </label>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Component for editing stage notes inline with auto-save on blur
const TimelineNoteInput = ({ 
  stageKey, 
  initialValue, 
  onUpdateNote 
}: { 
  stageKey: StageKey, 
  initialValue: string, 
  onUpdateNote: (key: StageKey, note: string) => void 
}) => {
  const [val, setVal] = useState(initialValue);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    setVal(initialValue);
  }, [initialValue]);

  const handleBlur = () => {
    setIsFocused(false);
    if (val !== initialValue) {
      onUpdateNote(stageKey, val);
    }
  };

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-1.5 px-0.5">
        <span className="flex items-center gap-1.5 text-amber-700/80">📝 階段備註事項 (Notes)</span>
        {isFocused ? (
          <span className="text-[10px] text-amber-600/70 font-normal animate-pulse">編輯中 (在框外點擊會自動儲存)</span>
        ) : (
          <span className="text-[10px] text-emerald-605/70 font-normal">自動存檔</span>
        )}
      </div>
      <textarea
        rows={2}
        className={`w-full px-4 py-2.5 rounded-2xl text-[14px] text-gray-800 placeholder-gray-400 focus:outline-none transition-all font-medium leading-relaxed resize-none shadow-xs border ${
          isFocused 
            ? "border-amber-400 bg-amber-50/20 ring-1 ring-amber-300" 
            : "border-gray-200 bg-gray-50 focus:bg-white"
        }`}
        placeholder="請在此輸入對此工序時間階段的特別交代、承載備忘或備註..."
        value={val}
        onFocus={() => setIsFocused(true)}
        onChange={(e) => setVal(e.target.value)}
        onBlur={handleBlur}
      />
    </div>
  );
};

// Style 2: Vertical Timeline (Industrial & Detailed)
const VerticalTimeline = ({ 
  machine, 
  onToggleStage,
  onUpdateNote
}: { 
  machine: Machine, 
  onToggleStage: (key: StageKey) => void,
  onUpdateNote: (key: StageKey, note: string) => void
}) => {
  return (
    <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
      <div className="space-y-6">
        {STAGES.map((stage, index) => {
          const isCompleted = index < machine.currentStage;
          const isActive = index === machine.currentStage;
          const Icon = stage.icon;
          const sd = machine.stageData?.[stage.key] || { progress: 0 };

          return (
            <motion.div 
              key={stage.key}
              className="flex gap-4 relative"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              {/* Vertical Line */}
              {index < STAGES.length - 1 && (
                <div className="absolute left-5 top-10 bottom-[-24px] w-[2px] bg-gray-100">
                  {isCompleted && (
                    <motion.div 
                      className="w-full bg-emerald-500"
                      initial={{ height: 0 }}
                      animate={{ height: "100%" }}
                    />
                  )}
                </div>
              )}

              <div 
                className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-all ${
                  isCompleted ? "bg-emerald-50 text-emerald-600" : 
                  isActive ? "bg-emerald-600 text-white shadow-lg shadow-emerald-200" : 
                  "bg-gray-50 text-gray-400"
                }`}
              >
                <Icon size={20} />
              </div>

              <div className="flex-1 pb-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1 pr-4">
                    <div className="flex items-center gap-3">
                      <h4 className={`text-xl font-black ${isActive ? "text-emerald-700 font-extrabold" : "text-gray-800"}`}>
                        {stage.label}
                      </h4>
                      {isCompleted ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-100 text-xs font-bold text-emerald-700 shadow-xs">
                          ✓ 已完工
                        </span>
                      ) : isActive ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-100 text-xs font-bold text-blue-700 animate-pulse">
                          ● 進行中
                        </span>
                      ) : null}
                    </div>
                    <p className="text-lg text-gray-500 mt-1 font-medium">{stage.description}</p>
                    
                    {/* Interactive Input for Notes directly here */}
                    <TimelineNoteInput 
                      stageKey={stage.key}
                      initialValue={sd.note || ""}
                      onUpdateNote={onUpdateNote}
                    />
                  </div>
                  <div className="text-right shrink-0">
                    {!isTimelineStage(stage.key) ? (
                      <>
                        <p className="text-[18px] font-mono font-black text-gray-400 uppercase tracking-wider">Date</p>
                        <p className="text-2xl font-mono font-black text-gray-800">{sd.date || "--/--"}</p>
                      </>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <p className="text-[17px] font-mono font-black text-gray-400 uppercase leading-none">Start Date</p>
                          <p className="text-xl font-mono font-black text-gray-800">{sd.startDate || "--/--"}</p>
                        </div>
                        <div>
                          <p className="text-[17px] font-mono font-black text-gray-400 uppercase leading-none">End Date</p>
                          <p className="text-xl font-mono font-black text-gray-800">{sd.endDate || "--/--"}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

// Style 3: Bento Grid Status (Data-Rich Dashboard)
const StatusGrid = ({ machine, onToggleStage }: { machine: Machine, onToggleStage: (key: StageKey) => void }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {STAGES.map((stage, index) => {
        const isCompleted = index < machine.currentStage;
        const isActive = index === machine.currentStage;
        const Icon = stage.icon;
        const sd = machine.stageData?.[stage.key] || { progress: 0 };
        const displayProgress = isCompleted ? 100 : (isActive ? (sd.progress ?? 0) : 0);

        return (
          <motion.div 
            key={stage.key}
            whileHover={{ y: -4 }}
            className={`p-5 rounded-3xl border transition-all duration-300 flex flex-col justify-between min-h-[200px] ${
              isActive ? "bg-indigo-600 border-indigo-600 text-white shadow-xl shadow-indigo-100" :
              isCompleted ? "bg-indigo-50 border-indigo-100 text-indigo-900" :
              "bg-white border-gray-100 text-gray-800 shadow-sm"
            }`}
          >
            <div>
              <div className="flex justify-between items-start mb-4">
                <div 
                  className={`p-2.5 rounded-2xl ${
                    isActive ? "bg-indigo-500" : 
                    isCompleted ? "bg-indigo-200/50" : 
                    "bg-gray-100"
                  }`}
                >
                  <Icon size={20} />
                </div>
                
                {/* Synchronized read-only status badge */}
                <div className="flex items-center gap-1.5 print:block">
                  {isCompleted ? (
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[15px] font-bold border ${
                      isActive ? "bg-white/20 border-white/30 text-white" : "bg-emerald-50 border-emerald-150 text-emerald-700"
                    }`}>
                      <CheckCircle2 size={13} className="shrink-0" />
                      <span>已完工</span>
                    </span>
                  ) : isActive ? (
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[15px] font-bold border ${
                      isActive ? "bg-white/20 border-white/30 text-white animate-pulse" : "bg-blue-50 border-blue-150 text-blue-700 animate-pulse"
                    }`}>
                      <span>進行中</span>
                    </span>
                  ) : (
                    <span className="text-[15px] font-bold text-gray-400 bg-gray-50 border border-gray-100 px-2.5 py-1 rounded-full">
                      未開始
                    </span>
                  )}
                </div>
              </div>
              
              <h5 className="font-bold text-[17px] mb-1">{stage.label}</h5>
              
              <div className={`text-[17px] font-mono font-bold leading-tight ${isActive ? "text-indigo-50" : "text-gray-500"}`}>
                {!isTimelineStage(stage.key) ? (
                  <p>{sd.date || "Pending..."}</p>
                ) : (
                  <div className="mt-1.5 space-y-1">
                    <p>S: {sd.startDate || "--"}</p>
                    <p>E: {sd.endDate || "--"}</p>
                  </div>
                )}
              </div>
              
              {/* Note Displaying */}
              {sd.note && (
                <div className={`mt-2.5 text-[15px] p-2.5 rounded-xl text-left border ${
                  isActive ? "bg-black/10 border-white/15 text-indigo-50" : "bg-amber-50/50 border-amber-100 text-amber-900"
                }`}>
                  <p className="font-bold text-[15px]">📝 備註:</p>
                  <p className="line-clamp-2 leading-snug whitespace-pre-wrap text-[15px]">{sd.note}</p>
                </div>
              )}
            </div>

            {isTimelineStage(stage.key) && (
              <div className="mt-4">
                <div className={`flex justify-between text-[12px] font-bold mb-1 ${isActive ? "text-indigo-100" : "text-gray-400"}`}>
                  <span>PROGRESS</span>
                  <span>{displayProgress}%</span>
                </div>
                <div className={`w-full h-1 rounded-full overflow-hidden ${isActive ? "bg-white/20" : "bg-gray-200"}`}>
                   <div 
                    className={`h-full ${isActive ? "bg-white" : "bg-indigo-500"}`}
                    style={{ width: `${displayProgress}%` }}
                   />
                </div>
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
};

export default function App() {
  const [machines, setMachines] = useState<Machine[]>(() => {
    const local = typeof window !== "undefined" ? localStorage.getItem("local_machines") : null;
    if (local) {
      try {
        return JSON.parse(local);
      } catch (e) {
        return SAMPLE_DATA;
      }
    }
    return SAMPLE_DATA;
  });
  const [user, setUser] = useState<any>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(localStorage.getItem("spreadsheet_id"));

  // Fetch from Firestore (Real-time & Public View)
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    
    // Get shared machine ID from URL if any
    let urlId: string | null = null;
    try {
      const params = new URLSearchParams(window.location.search);
      urlId = params.get("machineId") || params.get("id");
    } catch (e) {
      console.warn("Failed to parse URL search params:", e);
    }

    try {
      setLoading(true);
      const q = collection(db, "machines");

      unsubscribe = onSnapshot(q, async (snapshot) => {
        let machineList = snapshot.docs.map(d => {
          const data = d.data() as Machine;
          return {
            ...data,
            docId: d.id,
            id: data.id || d.id
          };
        });

        // Sort in memory by stable createdAt first to guarantee fixed positions
        machineList.sort((a: any, b: any) => {
          const tA = a.createdAt ? new Date(a.createdAt).getTime() : (a.updatedAt?.seconds ? a.updatedAt.seconds * 1000 : (a.updatedAt?.toMillis?.() || 0));
          const tB = b.createdAt ? new Date(b.createdAt).getTime() : (b.updatedAt?.seconds ? b.updatedAt.seconds * 1000 : (b.updatedAt?.toMillis?.() || 0));
          
          if (tB !== tA) {
            return tB - tA; // descending (newest created at the top)
          }
          return a.id.localeCompare(b.id);
        });

        if (machineList.length > 0) {
          setMachines(machineList);
          localStorage.setItem("local_machines", JSON.stringify(machineList));
        } else {
          // If Firestore is empty and we have local/sample machines, keep local and we can sync
          const local = localStorage.getItem("local_machines");
          if (!local) {
            localStorage.setItem("local_machines", JSON.stringify(SAMPLE_DATA));
          }
        }
        setLoading(false);
      }, (error) => {
        console.warn("Firestore 監聽異常，使用本地儲存快照:", error);
        setLoading(false);
      });
    } catch (error) {
      console.warn("Firestore 初始化失敗:", error);
      setLoading(false);
    }
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  useEffect(() => {
    initAuth(
      (u, token) => {
        setUser(u);
        setAccessToken(token);
        if (u) {
          localStorage.setItem("last_owner_id", u.uid);
          if (u.email) {
            localStorage.setItem("last_owner_email", u.email);
          }
        }
        setLoading(false);
      },
      () => {
        setUser(null);
        setAccessToken(null);
        setLoading(false);
      }
    );
  }, []);

  const saveToFirestore = async (machine: Machine, isAdd: boolean = false) => {
    try {
      const { docId, ...payload } = machine;
      const targetDocId = docId || machine.id;
      
      const currentUser = auth.currentUser;
      const extra: any = {};
      
      if (currentUser?.uid) {
        extra.ownerId = currentUser.uid;
      }
      extra.ownerEmail = currentUser?.email || localStorage.getItem("last_owner_email") || "1992csim@gmail.com";

      let fallbackCreatedAt = new Date().toISOString();
      if (machine.updatedAt) {
        try {
          if (typeof (machine.updatedAt as any).toMillis === "function") {
            fallbackCreatedAt = new Date((machine.updatedAt as any).toMillis()).toISOString();
          } else if ((machine.updatedAt as any).seconds) {
            fallbackCreatedAt = new Date((machine.updatedAt as any).seconds * 1000).toISOString();
          } else if (typeof (machine.updatedAt as any).toDate === "function") {
            fallbackCreatedAt = (machine.updatedAt as any).toDate().toISOString();
          } else {
            fallbackCreatedAt = new Date(machine.updatedAt as any).toISOString();
          }
        } catch (e) {
          console.warn("Failed to parse updatedAt fallback:", e);
        }
      }
      const stableCreatedAt = payload.createdAt || fallbackCreatedAt;

      await setDoc(doc(db, "machines", targetDocId), {
        ...payload,
        ...extra,
        id: machine.id,
        createdAt: stableCreatedAt,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      console.warn("Firestore save error:", error);
    }
  };

  const syncAllToFirestore = async () => {
    try {
      setSyncing(true);
      for (const m of machines) {
        await saveToFirestore(m);
      }
      alert("✅ 已成功將所有 " + machines.length + " 部機台資料同步寫入 Firebase Firestore！請重新整理 Firebase Console 即可看到資料。");
    } catch (err: any) {
      alert("同步至 Firebase 失敗：" + (err.message || String(err)));
    } finally {
      setSyncing(false);
    }
  };

  const deleteFromFirestore = async (id: string, docId?: string) => {
    try {
      const targetDocId = docId || id;
      await deleteDoc(doc(db, "machines", targetDocId));
    } catch (error) {
      console.warn("Firestore delete error:", error);
    }
  };

  const loadDataFromSheet = async (token: string) => {
    try {
      setSyncing(true);
      const service = new SheetService(token);
      const id = await service.findOrCreateSpreadsheet();
      setSpreadsheetId(id);
      localStorage.setItem("spreadsheet_id", id);
      const data = await service.getAllMachines();
      if (data.length > 0) {
        setMachines(data);
        // Sync the imported sheets data to Firestore so guests can see updates immediately without logging in
        await Promise.all(data.map(m => saveToFirestore(m)));
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      const isAuthError = 
        errMsg.includes("401") || 
        errMsg.includes("credentials") || 
        errMsg.includes("token") || 
        errMsg.includes("authentication") || 
        errMsg.includes("Unauthorized") ||
        errMsg.includes("invalid_grant");

      if (isAuthError) {
        console.warn("Detected invalid or expired Google OAuth token on initial load, resetting session gracefully:", errMsg);
        handleLogout();
      } else {
        console.error("Failed to load from sheet:", err);
      }
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (accessToken) {
      loadDataFromSheet(accessToken);
    }
  }, [accessToken]);

  const saveToSheet = async (data: Machine[]) => {
    if (!accessToken) {
      alert("請登入以同步至雲端系統。");
      return;
    }
    try {
      setSyncing(true);
      const service = new SheetService(accessToken);
      const id = spreadsheetId || await service.findOrCreateSpreadsheet();
      if (!spreadsheetId) {
        setSpreadsheetId(id);
        localStorage.setItem("spreadsheet_id", id);
      }
      service.setSpreadsheetId(id);
      await service.saveMachines(data);
      console.log("Successfully saved to cloud.");
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      const isAuthError = 
        errMsg.includes("401") || 
        errMsg.includes("credentials") || 
        errMsg.includes("token") || 
        errMsg.includes("authentication") || 
        errMsg.includes("Unauthorized") ||
        errMsg.includes("invalid_grant");

      if (isAuthError) {
        console.warn("Failed to save to sheet due to unauthorized/expired credentials:", errMsg);
        alert("登入逾時，請重新登入以維持雲端同步。");
        handleLogout();
      } else {
        console.error("Failed to save to sheet:", err);
        alert("雲端儲存失敗：" + (err.message || "未知錯誤"));
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleLogin = async () => {
    try {
      const res = await googleSignIn();
      if (res) {
        setUser(res.user);
        setAccessToken(res.accessToken);
        if (res.user) {
          localStorage.setItem("last_owner_id", res.user.uid);
          if (res.user.email) {
            localStorage.setItem("last_owner_email", res.user.email);
          }
        }
        // Data loading is triggered by useEffect on accessToken
      }
    } catch (err) {
      console.error("Login failed:", err);
      alert("登錄失敗，請確認是否已授權 Google 權限");
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setAccessToken(null);
  };

  const [selectedMachineId, setSelectedMachineId] = useState<string>("");
  const [viewStyle, setViewStyle] = useState<"horizontal" | "vertical" | "grid" | "print-preview">("horizontal");
  const [showPrintHint, setShowPrintHint] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [customShareUrl, setCustomShareUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const shareUrl = useMemo(() => {
    if (customShareUrl) return customShareUrl;
    let base = window.location.href;
    if (window.location.hostname.includes("ais-dev-")) {
      base = base.replace("ais-dev-", "ais-pre-");
    }
    try {
      const urlObj = new URL(base);
      if (selectedMachineId) {
        urlObj.searchParams.set("machineId", selectedMachineId);
      }
      const currentEmail = user?.email || localStorage.getItem("last_owner_email") || "1992csim@gmail.com";
      if (currentEmail) {
        urlObj.searchParams.set("ownerEmail", currentEmail);
      }
      const currentUid = user?.uid || localStorage.getItem("last_owner_id");
      if (currentUid) {
        urlObj.searchParams.set("ownerId", currentUid);
      }
      return urlObj.toString();
    } catch {
      return base;
    }
  }, [customShareUrl, selectedMachineId, user?.email, user?.uid]);

  const isDevUrl = useMemo(() => {
    return window.location.hostname.includes("ais-dev-");
  }, []);

  const tryFixUrl = () => {
    if (window.location.hostname.includes("ais-dev-")) {
      try {
        const urlObj = new URL(window.location.href);
        if (selectedMachineId) {
          urlObj.searchParams.set("machineId", selectedMachineId);
        }
        const fixed = urlObj.toString().replace("ais-dev-", "ais-pre-");
        setCustomShareUrl(fixed);
      } catch {
        const fixed = window.location.href.replace("ais-dev-", "ais-pre-");
        setCustomShareUrl(fixed);
      }
    }
  };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");

  const selectedMachine = useMemo(() => {
    if (machines.length === 0) return null;
    return machines.find(m => m.id === selectedMachineId) || machines[0];
  }, [machines, selectedMachineId]);

  // Sync selected machine to browser URL query parameter with history replaceState
  useEffect(() => {
    if (selectedMachineId) {
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.get("machineId") !== selectedMachineId) {
          params.set("machineId", selectedMachineId);
          const newUrl = `${window.location.pathname}?${params.toString()}`;
          window.history.replaceState({ path: newUrl }, "", newUrl);
        }
      } catch (err) {
        console.warn("Failed to sync state to browser URL:", err);
      }
    }
  }, [selectedMachineId]);

  // Update selected ID if current selection is invalid, checking URL search param first
  useEffect(() => {
    if (machines.length > 0) {
      try {
        const params = new URLSearchParams(window.location.search);
        const urlId = params.get("machineId") || params.get("id");
        if (urlId && machines.some(m => m.id === urlId)) {
          if (selectedMachineId !== urlId) {
            setSelectedMachineId(urlId);
          }
        } else if (!selectedMachineId || !machines.some(m => m.id === selectedMachineId)) {
          setSelectedMachineId(machines[0].id);
        }
      } catch (e) {
        if (!selectedMachineId || !machines.some(m => m.id === selectedMachineId)) {
          setSelectedMachineId(machines[0].id);
        }
      }
    }
  }, [machines, selectedMachineId]);

  const handleSaveMachine = (machineData: Machine) => {
    let nextMachines: Machine[];
    if (modalMode === "add") {
      nextMachines = [...machines, machineData];
      setSelectedMachineId(machineData.id);
    } else {
      nextMachines = machines.map(m => m.id === machineData.id ? machineData : m);
    }
    
    // 立即儲存至反應式狀態 & 本地 localStorage
    setMachines(nextMachines);
    localStorage.setItem("local_machines", JSON.stringify(nextMachines));
    setIsModalOpen(false);
    
    // 嘗試背景存入 Firestore (若失敗會被 catch，不影響使用者)
    saveToFirestore(machineData, modalMode === "add").catch(err => {
      console.warn("背景上傳 Firebase 失敗 (本地已儲存完成):", err);
    });
    
    // 嘗試背景儲存至 Google 試算表
    if (accessToken) {
      saveToSheet(nextMachines).catch(err => {
        console.warn("背景同步 Google Sheets 失敗 (本地已儲存完成):", err);
      });
    }
  };

  const handleUpdateNote = (machineId: string, stageKey: StageKey, note: string) => {
    const machine = machines.find(m => m.id === machineId);
    if (!machine) return;

    const updatedStageData = {
      ...machine.stageData,
      [stageKey]: {
        ...(machine.stageData[stageKey] || { progress: 0 }),
        note: note
      }
    };

    const updatedMachine: Machine = {
      ...machine,
      stageData: updatedStageData
    };

    const nextMachines = machines.map(m => m.id === machine.id ? updatedMachine : m);
    setMachines(nextMachines);
    localStorage.setItem("local_machines", JSON.stringify(nextMachines));

    saveToFirestore(updatedMachine, false).catch(err => {
      console.warn("背景上傳 Firebase 失敗 (本地已變更):", err);
    });

    if (accessToken) {
      saveToSheet(nextMachines).catch(err => {
        console.warn("背景同步 Google Sheets 失敗 (本地已變更):", err);
      });
    }
  };

  const toggleStageComplete = (machineId: string, stageKey: StageKey) => {
    const machine = machines.find(m => m.id === machineId);
    if (!machine) return;

    const stageIndex = STAGES.findIndex(s => s.key === stageKey);
    const currentSd = machine.stageData[stageKey] || { progress: 0 };
    const isCurrently100 = (stageIndex < machine.currentStage) || (stageIndex === machine.currentStage && currentSd.progress === 100);

    const updatedStageData = { ...machine.stageData };
    let nextCurrentStage = machine.currentStage;

    if (isCurrently100) {
      // Toggle to 0% progress
      updatedStageData[stageKey] = {
        ...updatedStageData[stageKey],
        progress: 0
      };
      // Adjust currentStage if index is <= currentStage
      if (stageIndex <= machine.currentStage) {
        nextCurrentStage = stageIndex;
      }
    } else {
      // Toggle to 100% progress
      updatedStageData[stageKey] = {
        ...updatedStageData[stageKey],
        progress: 100
      };
      // If we directly marked the active stage as complete, run to next index, else set index
      if (stageIndex === machine.currentStage) {
        nextCurrentStage = Math.min(STAGES.length - 1, stageIndex + 1);
      } else {
        nextCurrentStage = Math.max(machine.currentStage, stageIndex);
      }
    }

    const updatedMachine: Machine = {
      ...machine,
      currentStage: nextCurrentStage,
      stageData: updatedStageData
    };

    const nextMachines = machines.map(m => m.id === machine.id ? updatedMachine : m);
    setMachines(nextMachines);
    localStorage.setItem("local_machines", JSON.stringify(nextMachines));

    saveToFirestore(updatedMachine, false).catch(err => {
      console.warn("背景上傳 Firebase 失敗 (本地已變更):", err);
    });

    if (accessToken) {
      saveToSheet(nextMachines).catch(err => {
        console.warn("背景同步 Google Sheets 失敗 (本地已變更):", err);
      });
    }
  };

  const handleDeleteMachine = (id: string) => {
    if (window.confirm("確定要刪除此機台資料嗎？")) {
      const nextMachines = machines.filter(m => m.id !== id);
      setMachines(nextMachines);
      localStorage.setItem("local_machines", JSON.stringify(nextMachines));
      if (nextMachines.length > 0) {
        setSelectedMachineId(nextMachines[0].id);
      } else {
        setSelectedMachineId("");
      }
      
      // 嘗試背景從 Firestore 刪除
      const machine = machines.find(m => m.id === id);
      deleteFromFirestore(id, machine?.docId).catch(err => {
        console.warn("背景刪除 Firebase 失敗 (本地已刪除完成):", err);
      });
      
      // 嘗試背景同步至 Google 試算表
      if (accessToken) {
        saveToSheet(nextMachines).catch(err => {
          console.warn("背景同步 Google Sheets 失敗 (本地已刪除完成):", err);
        });
      }
    }
  };

  const handleExportData = () => {
    const dataStr = JSON.stringify(machines, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `machine_tracking_data_${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const handleImportData = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const importedData = JSON.parse(content) as Machine[];
        if (Array.isArray(importedData)) {
          setMachines(importedData);
          localStorage.setItem("local_machines", JSON.stringify(importedData));
          if (importedData.length > 0) {
            setSelectedMachineId(importedData[0].id);
          }
          
          // 背景批次備份至 Firestore
          importedData.forEach(m => {
            saveToFirestore(m).catch(noopErr => {});
          });
          
          if (accessToken) {
            saveToSheet(importedData).catch(noopErr => {});
          }
          alert("資料匯入成功，已儲存至瀏覽器並同步雲端中！");
        }
      } catch (err) {
        alert("匯入失敗：檔案格式不正確。");
      }
    };
    reader.readAsText(file);
    // Reset input
    if (event.target) event.target.value = "";
  };

  const openAddModal = () => {
    setModalMode("add");
    setIsModalOpen(true);
  };

  const openEditModal = () => {
    setModalMode("edit");
    setIsModalOpen(true);
  };

  const handlePrint = () => {
    setShowPrintHint(true);
    // Brief delay to allow feedback to render
    setTimeout(() => {
      window.print();
    }, 150);
    // Hide hint after 8 seconds
    setTimeout(() => setShowPrintHint(false), 8000);
  };

  const handlePrintBlankForm = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const stagesHtml = STAGES.map(s => `
      <div style="border: 1px solid #e2e8f0; padding: 10px; border-radius: 8px; break-inside: avoid; background: #fff;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px;">
          <strong style="font-size: 13px; color: #0f172a;">${s.label}</strong>
          <span style="font-size: 9px; color: #94a3b8;">${s.key}</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <div style="border-bottom: 1px solid #e2e8f0; padding-bottom: 2px; font-size: 11px; color: #64748b;">
            開始: ________________
          </div>
          <div style="border-bottom: 1px solid #e2e8f0; padding-bottom: 2px; font-size: 11px; color: #64748b;">
            結束: ________________
          </div>
        </div>
      </div>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>空白進度填寫表單</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap');
            body { font-family: 'Inter', sans-serif; padding: 15mm; color: #1e293b; line-height: 1.4; background: white; margin: 0; }
            * { box-sizing: border-box; }
            @page { size: A4; margin: 0; }
            .header { border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: flex-end; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
            .info-item { border-bottom: 1px solid #000; padding: 4px 0; }
            .info-label { font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase; }
            .stages-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1 style="margin: 0; font-size: 20px;">機台製造進度紀錄表 (人工填寫)</h1>
              <p style="margin: 2px 0 0; font-size: 10px; color: #64748b;">Manufacturing Progress Manual Record Form</p>
            </div>
            <div style="text-align: right; font-size: 9px; color: #94a3b8;">
              REV: 2024.1 / NO: ${Math.random().toString(36).substr(2, 6).toUpperCase()}
            </div>
          </div>
          <div class="info-grid">
            <div class="info-item"><div class="info-label">訂單編號 (ID)</div><div style="height: 20px;"></div></div>
            <div class="info-item"><div class="info-label">客戶名稱 (Customer)</div><div style="height: 20px;"></div></div>
            <div class="info-item" style="grid-column: span 2;"><div class="info-label">機台名稱 (Machine Name)</div><div style="height: 20px;"></div></div>
          </div>
          <div style="margin-bottom: 10px; font-weight: bold; font-size: 13px; border-left: 3px solid #2563eb; padding-left: 8px;">進度階段填寫</div>
          <div class="stages-grid">
            ${stagesHtml}
          </div>
          <div style="margin-top: 25px; border-top: 1px solid #e2e8f0; padding-top: 15px;">
            <div style="display: grid; grid-template-columns: 1.5fr 1fr; gap: 30px;">
              <div>
                <div class="info-label">備註事項</div>
                <div style="height: 50px; border-bottom: 1px solid #e2e8f0;"></div>
              </div>
              <div style="display: flex; flex-direction: column; gap: 15px;">
                <div>
                  <div class="info-label">技術人員簽名</div>
                  <div style="height: 35px; border-bottom: 1px solid #000;"></div>
                </div>
                <div>
                  <div class="info-label">日期 (Date)</div>
                  <div style="height: 25px; border-bottom: 1px solid #000;"></div>
                </div>
              </div>
            </div>
          </div>
          <script>window.onload = function() { window.print(); window.close(); }</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-gray-900 p-4 md:p-8 font-sans">
      <AnimatePresence>
        {loading && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm"
          >
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm font-bold text-gray-500 animate-pulse">讀取雲端資料中...</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Print-only Report Header/Title */}
      <div className="hidden print:block mb-3 border-b-2 border-gray-900 pb-2">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="font-black text-gray-900 mb-0.5" style={{ fontSize: "24px" }}>機台製造進度報告 - 「{selectedMachine?.name}」</h1>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Progress Tracking Report</p>
          </div>
          <div className="text-right flex flex-row items-center gap-4">
            <p className="text-[11px] font-bold text-gray-400">列印日期:<br />{new Date().toLocaleString()}</p>
            <div className="bg-white p-1 border border-gray-300 rounded-lg shadow-sm flex flex-col items-center shrink-0">
              <QRCodeSVG value={shareUrl} className="qr-code-svg" style={{ width: "2cm", height: "2cm" }} />
              <p className="text-[8px] text-center mt-0.5 font-extrabold text-blue-600 uppercase tracking-wider">Scan to Open</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto">
        {/* Header Section */}
        <header className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-12 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm transition-all hover:shadow-md no-print">
          <div className="flex-1">
            <div className="flex items-center gap-2 text-blue-600 font-bold tracking-widest text-[10px] uppercase mb-2 bg-blue-50 w-fit px-2 py-0.5 rounded-full">
              <Activity size={14} />
              <span>Smart Manufacturing Suite</span>
            </div>
            <h2 className="text-3xl font-black tracking-tight text-gray-900 mb-2">
              機台製造進度追蹤
            </h2>
            <p className="text-gray-500 text-sm max-w-sm">
              即時監控自動化機台製造流程，由 Firebase + Google Sheets 提供雙重雲端同步。
            </p>
          </div>

          <div className="flex flex-col items-stretch md:items-end gap-4 no-print w-full md:w-auto">
            {/* User & Sync Bar */}
            <div className="flex flex-wrap items-center justify-end gap-3">
              {syncing ? (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-full text-xs font-bold animate-pulse">
                  <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                  雲端同步中...
                </div>
              ) : (
                accessToken && (
                  <button 
                    onClick={() => saveToSheet(machines)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-full text-xs font-bold hover:bg-emerald-100 transition-colors shadow-sm cursor-pointer"
                    title="立即同步至雲端"
                  >
                    <Save size={12} />
                    雲端已就緒
                  </button>
                )
              )}
              
              {(user && accessToken) ? (
                <div className="flex items-center gap-3 pl-1 pr-4 py-0.5 bg-white border border-gray-100 rounded-2xl shadow-sm">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt={user.displayName} className="w-8 h-8 rounded-full border border-gray-100" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs">
                      {user.displayName?.[0] || 'U'}
                    </div>
                  )}
                  <div className="flex flex-col text-right">
                    <span className="text-xs font-bold text-gray-900 leading-tight truncate max-w-[120px]">
                      {user.displayName}
                    </span>
                    <button onClick={handleLogout} className="text-[10px] font-bold text-gray-400 hover:text-red-500 text-left cursor-pointer">
                      登出系統
                    </button>
                  </div>
                  {spreadsheetId && (
                    <a 
                      href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}`} 
                      target="_blank" 
                      rel="noreferrer"
                      className="ml-2 p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors"
                      title="開啟 Google 試算表資料庫"
                    >
                      <ExternalLink size={16} />
                    </a>
                  )}
                </div>
              ) : (
                <button 
                  onClick={handleLogin}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-2xl text-sm font-bold bg-blue-600 text-white shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all cursor-pointer transform active:scale-95"
                >
                  <img src="https://www.google.com/favicon.ico" alt="Google" className="w-4 h-4 brightness-0 invert" />
                  登入 Google 雲端同步
                </button>
              )}
            </div>

            {/* Utility Buttons Bar */}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button 
                onClick={syncAllToFirestore}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-orange-50 border border-orange-200 text-orange-600 hover:text-orange-700 shadow-sm hover:bg-orange-100 transition-all text-xs font-bold cursor-pointer"
                title="一鍵將目前機台全部寫入 Firebase Firestore 資料庫"
              >
                <Save size={15} />
                <span>同步至 Firebase 資料庫</span>
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleImportData} 
                className="hidden" 
                accept=".json"
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="p-2.5 rounded-xl bg-white border border-gray-100 text-gray-400 hover:text-gray-600 shadow-sm hover:bg-gray-50 transition-all text-[18px] cursor-pointer"
                title="啟動傳統 JSON 匯入"
              >
                <FolderOpen size={18} />
              </button>
              <button 
                onClick={handlePrintBlankForm}
                className="p-2.5 rounded-xl bg-amber-50 border border-amber-100 text-amber-500 hover:text-amber-700 shadow-sm hover:bg-amber-100 transition-all text-[18px] cursor-pointer"
                title="列印空白表單"
              >
                <Printer size={18} />
              </button>
              <button 
                onClick={() => setShowQrModal(true)}
                className="p-2.5 rounded-xl bg-white border border-gray-100 text-gray-400 hover:text-gray-600 shadow-sm hover:bg-gray-50 transition-all text-[18px] cursor-pointer"
                title="顯示 QR Code 分享"
              >
                <QrCode size={18} />
              </button>
              <button 
                onClick={openAddModal}
                className="flex items-center gap-2 px-6 py-2.5 rounded-2xl text-[17px] font-bold bg-gray-900 text-white shadow-xl shadow-gray-200 hover:bg-black transition-all cursor-pointer transform active:scale-95"
              >
                <Plus size={18} />
                <span>新增進度機台</span>
              </button>
            </div>

            {/* View Style Selectors */}
            <div className="flex bg-gray-100/50 p-1.5 rounded-2xl w-fit self-end">
              <button 
                onClick={() => setViewStyle("horizontal")}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-[18px] font-bold transition-all cursor-pointer ${
                  viewStyle === "horizontal" ? "bg-white shadow-sm text-blue-600" : "text-gray-400 hover:bg-gray-200"
                }`}
              >
                線性視圖
              </button>
              <button 
                onClick={() => setViewStyle("vertical")}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-[18px] font-bold transition-all cursor-pointer ${
                  viewStyle === "vertical" ? "bg-white shadow-sm text-blue-600" : "text-gray-400 hover:bg-gray-200"
                }`}
              >
                時間軸視圖
              </button>
              <button 
                onClick={() => setViewStyle("grid")}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-[18px] font-bold transition-all cursor-pointer ${
                  viewStyle === "grid" ? "bg-white shadow-sm text-blue-600" : "text-gray-400 hover:bg-gray-200"
                }`}
              >
                方格視圖
              </button>
              <button 
                onClick={() => setViewStyle("print-preview")}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-[18px] font-bold transition-all cursor-pointer ${
                  viewStyle === "print-preview" ? "bg-white shadow-sm text-blue-600" : "text-gray-400 hover:bg-gray-200"
                }`}
              >
                <Printer size={18} className="shrink-0" />
                報表預覽
              </button>
            </div>
          </div>
        </header>


        {/* Machine Selector */}
        <div className="flex gap-4 mb-8 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-200 no-print">
          {machines.length === 0 ? (
            <div className="flex-1 p-8 rounded-2xl border-2 border-dashed border-gray-100 flex flex-col items-center justify-center bg-gray-50/30">
               <Activity className="text-gray-200 mb-2" size={32} />
               <p className="text-xs font-bold text-gray-400">目前沒有機台資料，請點擊右方新增</p>
            </div>
          ) : machines.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelectedMachineId(m.id)}
              className={`px-6 py-4 rounded-2xl border transition-all shrink-0 text-left min-w-[240px] group relative ${
                selectedMachineId === m.id 
                ? "bg-white border-blue-200 shadow-md ring-1 ring-blue-50" 
                : "bg-white/50 border-transparent hover:bg-white hover:border-gray-200"
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <span className="text-[13px] font-mono font-bold text-blue-500 uppercase px-2 py-0.5 bg-blue-50 rounded">
                  {m.id}
                </span>
                <span className="text-[13px] text-gray-400 font-bold">
                  {Math.round(((m.currentStage + 1) / STAGES.length) * 100)}%
                </span>
              </div>
              <h3 className="text-[19px] font-bold text-gray-800">{m.name}</h3>
              <p className="text-[15px] text-gray-400 mt-1 font-medium">{m.customer}</p>
              <div className="mt-4">
                <ProgressBar currentStage={m.currentStage} />
              </div>
            </button>
          ))}
          
          <button 
            onClick={openAddModal}
            className="px-6 py-4 rounded-2xl border-2 border-dashed border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all shrink-0 min-w-[240px] flex flex-col items-center justify-center gap-2 text-gray-400 hover:text-blue-500 group"
          >
            <div className="p-2 rounded-full bg-gray-50 group-hover:bg-blue-100">
              <Plus size={24} />
            </div>
            <span className="text-[17px] font-bold">新增追蹤機台</span>
          </button>
        </div>

        {/* Content Section */}
        {selectedMachine ? (
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedMachine.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <div className="mb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:mb-2 text-slate-950">
                <div className="flex flex-col gap-0.5 w-full">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h2 className="text-3xl font-black text-gray-900 print:text-[20px]">{selectedMachine.name}</h2>
                    <span className="text-gray-300 font-normal hidden sm:inline print:hidden">|</span>
                    <span className="text-2xl font-black text-blue-600 print:text-[16px]">目前狀態: {STAGES[selectedMachine.currentStage].label}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-base font-bold text-gray-500 font-mono print:text-[11.5px] print:mt-0.5">
                    <span>ID: {selectedMachine.id}</span>
                    <span className="text-gray-300 font-normal">|</span>
                    <span>客戶: {selectedMachine.customer}</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 no-print">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-500 mr-4 whitespace-nowrap">
                    <Clock size={14} className="shrink-0" />
                    <span className="whitespace-nowrap">系統最後更新: {new Date().toLocaleDateString()}</span>
                  </div>
                  <button 
                    onClick={handlePrint}
                    className="p-2 rounded-lg bg-white border border-gray-100 text-gray-500 hover:text-blue-600 shadow-sm transition-all cursor-pointer"
                    title="列印報表"
                  >
                    <Printer size={18} />
                  </button>
                  <button 
                    onClick={openEditModal}
                    className="p-2 rounded-lg bg-white border border-gray-100 text-gray-500 hover:text-blue-600 shadow-sm transition-all cursor-pointer"
                    title="編輯此機台"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button 
                    onClick={() => handleDeleteMachine(selectedMachine.id)}
                    className="p-2 rounded-lg bg-white border border-gray-100 text-gray-500 hover:text-red-600 shadow-sm transition-all cursor-pointer"
                    title="刪除此機台"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm mb-6 no-print">
                 <p className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-4">切換顯示風格</p>
                 <div className="flex bg-gray-50 p-1 rounded-2xl w-fit flex-wrap gap-1">
                    <button 
                        onClick={() => setViewStyle("horizontal")}
                        className={`px-6 py-2 rounded-xl text-[15px] font-bold transition-all cursor-pointer ${viewStyle === "horizontal" ? "bg-white shadow-sm text-blue-600" : "text-gray-400 hover:bg-gray-100"}`}
                    >
                        線性流程
                    </button>
                    <button 
                        onClick={() => setViewStyle("vertical")}
                        className={`px-6 py-2 rounded-xl text-[15px] font-bold transition-all cursor-pointer ${viewStyle === "vertical" ? "bg-white shadow-sm text-blue-600" : "text-gray-400 hover:bg-gray-100"}`}
                    >
                        詳細時間軸
                    </button>
                    <button 
                        onClick={() => setViewStyle("grid")}
                        className={`px-6 py-2 rounded-xl text-[15px] font-bold transition-all cursor-pointer ${viewStyle === "grid" ? "bg-white shadow-sm text-blue-600" : "text-gray-400 hover:bg-gray-100"}`}
                    >
                        狀態看板
                    </button>
                    <button 
                        onClick={() => setViewStyle("print-preview")}
                        className={`px-6 py-2 rounded-xl text-[15px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${viewStyle === "print-preview" ? "bg-white shadow-sm text-blue-600" : "text-gray-400 hover:bg-gray-100"}`}
                    >
                        <Printer size={16} className="shrink-0" />
                        列印報表預覽
                    </button>
                 </div>
              </div>

              {/* Screen Only: Displays user's chosen viewStyle */}
              <div className="no-print">
                <AnimatePresence mode="wait">
                   <motion.div
                      key={viewStyle}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.2 }}
                   >
                      {viewStyle === "horizontal" && <HorizontalStepper machine={selectedMachine} onToggleStage={(key) => toggleStageComplete(selectedMachine.id, key)} />}
                      {viewStyle === "vertical" && <VerticalTimeline machine={selectedMachine} onToggleStage={(key) => toggleStageComplete(selectedMachine.id, key)} onUpdateNote={(key, note) => handleUpdateNote(selectedMachine.id, key, note)} />}
                      {viewStyle === "grid" && <StatusGrid machine={selectedMachine} onToggleStage={(key) => toggleStageComplete(selectedMachine.id, key)} />}
                      {viewStyle === "print-preview" && (
                        <div className="bg-gray-100 p-4 sm:p-6 rounded-3xl border border-gray-200 shadow-inner flex flex-col items-center gap-6 overflow-x-auto">
                          <div className="text-center">
                            <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">
                              A4 橫向列印比例預覽
                            </p>
                            <p className="text-xs text-blue-600 font-bold mt-1">
                              （已套用：橫向 A4 頁面與表格不折行、清晰加粗字體 16.5px、百分比 15px 預防溢出單頁 A4）
                            </p>
                          </div>
                          
                          <div className="simulated-print w-full min-w-[1050px] max-w-[1050px] bg-white border border-gray-300 rounded-xl shadow-xl p-10 select-none">
                            {/* Simulator Report Header */}
                            <div className="border-b-2 border-gray-900 pb-3 mb-5">
                              <div className="flex justify-between items-center">
                                <div>
                                  <h1 className="font-extrabold text-gray-900 mb-1" style={{ fontSize: "28px" }}>機台製造進度報告 - 「{selectedMachine.name}」</h1>
                                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Progress Tracking Report</p>
                                </div>
                                <div className="text-right flex flex-row items-center gap-4">
                                  <p className="text-[11px] font-bold text-gray-400">模擬列印日期:<br />{new Date().toLocaleString()}</p>
                                  <div className="bg-white p-1 border border-gray-300 rounded-lg shadow-sm flex flex-col items-center shrink-0">
                                    <QRCodeSVG value={shareUrl} style={{ width: "2cm", height: "2cm" }} />
                                    <p className="text-[8px] text-center mt-0.5 font-extrabold text-blue-600 uppercase tracking-wider">Scan to Open</p>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Stepper block (Simulated Print Stepper) */}
                            <div className="w-full mb-6">
                              <HorizontalStepper machine={selectedMachine} onToggleStage={(key) => toggleStageComplete(selectedMachine.id, key)} />
                            </div>

                            {/* Table block (Simulated Print Table) */}
                            <div className="mt-6">
                              <h3 className="text-sm font-bold mb-2 border-l-4 border-blue-600 pl-3">各階段詳細數據</h3>
                              <table className="w-full border-collapse" style={{ width: "100%", borderCollapse: "collapse" }}>
                                <thead>
                                  <tr className="bg-gray-50">
                                    <th style={{ fontSize: "16.5px", fontWeight: "800", textAlign: "center", backgroundColor: "#f8fafc", color: "#0f172a", border: "1.5px solid #cbd5e1", padding: "3px 8px", whiteSpace: "nowrap" }}>進度階段</th>
                                    <th style={{ fontSize: "16.5px", fontWeight: "800", textAlign: "center", backgroundColor: "#f8fafc", color: "#0f172a", border: "1.5px solid #cbd5e1", padding: "3px 8px", whiteSpace: "nowrap" }}>開始/基準日期</th>
                                    <th style={{ fontSize: "16.5px", fontWeight: "800", textAlign: "center", backgroundColor: "#f8fafc", color: "#0f172a", border: "1.5px solid #cbd5e1", padding: "3px 8px", whiteSpace: "nowrap" }}>結束日期</th>
                                    <th style={{ fontSize: "16.5px", fontWeight: "800", textAlign: "center", backgroundColor: "#f8fafc", color: "#0f172a", border: "1.5px solid #cbd5e1", padding: "3px 8px", whiteSpace: "nowrap" }}>當前進度</th>
                                    <th style={{ fontSize: "16.5px", fontWeight: "800", textAlign: "center", backgroundColor: "#f8fafc", color: "#0f172a", border: "1.5px solid #cbd5e1", padding: "3px 8px", whiteSpace: "nowrap" }}>狀態</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {STAGES.map((stage, idx) => {
                                    const sd = selectedMachine.stageData?.[stage.key] || { progress: 0 };
                                    const isCompleted = idx < selectedMachine.currentStage;
                                    const isActive = idx === selectedMachine.currentStage;
                                    const displayProgress = isCompleted ? 100 : (isActive ? (sd.progress ?? 0) : 0);
                                    
                                    return (
                                      <tr key={stage.key} className="hover:bg-gray-50/20">
                                        <td style={{ fontSize: "16.5px", fontWeight: "800", textAlign: "center", color: "#0f172a", border: "1.5px solid #cbd5e1", padding: "3px 8px", whiteSpace: "nowrap" }}>{stage.label}</td>
                                        <td style={{ fontSize: "16.5px", fontWeight: "800", fontFamily: "var(--font-mono), monospace", textAlign: "center", color: "#0f172a", border: "1.5px solid #cbd5e1", padding: "3px 8px", whiteSpace: "nowrap" }}>{sd.startDate || sd.date || "--"}</td>
                                        <td style={{ fontSize: "16.5px", fontWeight: "800", fontFamily: "var(--font-mono), monospace", textAlign: "center", color: "#0f172a", border: "1.5px solid #cbd5e1", padding: "3px 8px", whiteSpace: "nowrap" }}>{sd.endDate || "--"}</td>
                                        <td style={{ fontSize: "16.5px", fontWeight: "800", textAlign: "center", color: "#0f172a", border: "1.5px solid #cbd5e1", padding: "3px 8px", whiteSpace: "nowrap" }}>
                                          <div className="flex items-center justify-center gap-3">
                                            <div className="bg-gray-100 rounded-full overflow-hidden shrink-0" style={{ width: "80px", height: "6px" }}>
                                              <div className="h-full bg-blue-500" style={{ width: `${displayProgress}%` }} />
                                            </div>
                                            <span style={{ fontSize: "15px", fontWeight: "900", color: "#1e3a8a", whiteSpace: "nowrap" }}>{displayProgress}%</span>
                                          </div>
                                        </td>
                                        <td style={{ fontSize: "16.5px", fontWeight: "800", textAlign: "center", color: "#0f172a", border: "1.5px solid #cbd5e1", padding: "3px 8px", whiteSpace: "nowrap" }}>
                                          {isCompleted ? (
                                            <span className="text-emerald-600 font-bold" style={{ fontSize: "16.5px", fontWeight: "800" }}>100% 完工</span>
                                          ) : isActive ? (
                                            <span className="text-blue-600 font-bold animate-pulse" style={{ fontSize: "16.5px", fontWeight: "800" }}>製造中</span>
                                          ) : (
                                            <span className="text-gray-400 font-bold" style={{ fontSize: "16.5px", fontWeight: "800" }}>未加入</span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                              <div className="mt-4 flex justify-between items-center text-[12.5px] text-gray-700 font-bold" style={{ paddingBottom: "0.5cm" }}>
                                <p className="text-gray-500">* 本報告由「自動化機台管理系統」自動產生，僅供內部參考。</p>
                                <p className="text-gray-800 pr-4">機台負責人簽署：_______________________</p>
                              </div>
                            </div>
                          </div>
                          
                          <button
                            onClick={handlePrint}
                            className="bg-blue-600 text-white font-black py-4 px-10 rounded-2xl flex items-center gap-3 shadow-lg hover:bg-blue-700 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer text-lg"
                          >
                            <Printer size={22} />
                            確定列印（開啟系統列印視窗）
                          </button>
                        </div>
                      )}
                   </motion.div>
                </AnimatePresence>
              </div>

              {/* Print Only: Aligned to landscape constraints, always force HorizontalStepper for uniform single page look */}
              <div className="hidden print:block print:w-full print:mb-2">
                <HorizontalStepper machine={selectedMachine} onToggleStage={(key) => toggleStageComplete(selectedMachine.id, key)} />
              </div>

              {/* Print-only Stats Table */}
              <div className="hidden print:block mt-3">
                <h3 className="text-sm font-bold mb-2 border-l-4 border-blue-600 pl-3">各階段詳細數據</h3>
                <table className="w-full border-collapse" style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr className="bg-gray-50">
                      <th style={{ fontSize: "16.5px", fontWeight: "800", textAlign: "center", backgroundColor: "#f8fafc", color: "#0f172a", border: "1.5px solid #cbd5e1", padding: "3px 8px", whiteSpace: "nowrap" }}>進度階段</th>
                      <th style={{ fontSize: "16.5px", fontWeight: "800", textAlign: "center", backgroundColor: "#f8fafc", color: "#0f172a", border: "1.5px solid #cbd5e1", padding: "3px 8px", whiteSpace: "nowrap" }}>開始/基準日期</th>
                      <th style={{ fontSize: "16.5px", fontWeight: "800", textAlign: "center", backgroundColor: "#f8fafc", color: "#0f172a", border: "1.5px solid #cbd5e1", padding: "3px 8px", whiteSpace: "nowrap" }}>結束日期</th>
                      <th style={{ fontSize: "16.5px", fontWeight: "800", textAlign: "center", backgroundColor: "#f8fafc", color: "#0f172a", border: "1.5px solid #cbd5e1", padding: "3px 8px", whiteSpace: "nowrap" }}>當前進度</th>
                      <th style={{ fontSize: "16.5px", fontWeight: "800", textAlign: "center", backgroundColor: "#f8fafc", color: "#0f172a", border: "1.5px solid #cbd5e1", padding: "3px 8px", whiteSpace: "nowrap" }}>狀態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {STAGES.map((stage, idx) => {
                      const sd = selectedMachine.stageData?.[stage.key] || { progress: 0 };
                      const isCompleted = idx < selectedMachine.currentStage;
                      const isActive = idx === selectedMachine.currentStage;
                      const displayProgress = isCompleted ? 100 : (isActive ? (sd.progress ?? 0) : 0);
                      
                      return (
                        <tr key={stage.key}>
                          <td style={{ fontSize: "16.5px", fontWeight: "800", textAlign: "center", color: "#0f172a", border: "1.5px solid #cbd5e1", padding: "3px 8px", whiteSpace: "nowrap" }}>{stage.label}</td>
                          <td style={{ fontSize: "16.5px", fontWeight: "800", fontFamily: "var(--font-mono), monospace", textAlign: "center", color: "#0f172a", border: "1.5px solid #cbd5e1", padding: "3px 8px", whiteSpace: "nowrap" }}>{sd.startDate || sd.date || "--"}</td>
                          <td style={{ fontSize: "16.5px", fontWeight: "800", fontFamily: "var(--font-mono), monospace", textAlign: "center", color: "#0f172a", border: "1.5px solid #cbd5e1", padding: "3px 8px", whiteSpace: "nowrap" }}>{sd.endDate || "--"}</td>
                          <td style={{ fontSize: "16.5px", fontWeight: "800", textAlign: "center", color: "#0f172a", border: "1.5px solid #cbd5e1", padding: "3px 8px", whiteSpace: "nowrap" }}>
                            <div className="flex items-center justify-center gap-2">
                              <div className="bg-gray-100 rounded-full overflow-hidden shrink-0" style={{ width: "80px", height: "6px" }}>
                                <div className="h-full bg-blue-500" style={{ width: `${displayProgress}%` }} />
                              </div>
                              <span style={{ fontSize: "15px", fontWeight: "900", color: "#1e3a8a", whiteSpace: "nowrap" }}>{displayProgress}%</span>
                            </div>
                          </td>
                          <td style={{ fontSize: "16.5px", fontWeight: "800", textAlign: "center", color: "#0f172a", border: "1.5px solid #cbd5e1", padding: "3px 8px", whiteSpace: "nowrap" }}>
                            {isCompleted ? <span className="text-emerald-600 font-bold" style={{ fontSize: "16.5px", fontWeight: "800" }}>已完成</span> : isActive ? <span className="text-blue-600 font-bold" style={{ fontSize: "16.5px", fontWeight: "800" }}>進行中</span> : <span className="text-gray-400 font-bold" style={{ fontSize: "16.5px", fontWeight: "800" }}>待啟動</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="mt-4 flex justify-between items-center text-[12.5px] text-gray-700 font-bold" style={{ paddingBottom: "0.5cm" }}>
                  <p className="text-gray-500">* 本報告由「自動化機台管理系統」自動產生，僅供內部參考。</p>
                  <p className="text-gray-800 pr-4">機台負責人簽署：_______________________</p>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        ) : (
          <div className="bg-white p-12 rounded-3xl border border-gray-100 text-center">
            <div className="mx-auto w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 mb-4">
              <Activity size={32} />
            </div>
            <h3 className="text-lg font-bold text-gray-400">目前沒有追蹤中的機台</h3>
            <button 
              onClick={openAddModal}
              className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-xl font-bold text-[17px] shadow-lg shadow-blue-100"
            >
              即刻新增第一台
            </button>
          </div>
        )}

        {/* Modal for Add / Edit */}
        <Modal 
          isOpen={isModalOpen} 
          onClose={() => setIsModalOpen(false)} 
          title={modalMode === "add" ? "新增追蹤機台" : "編輯機台資料"}
        >
          <MachineForm 
            initialData={modalMode === "edit" ? selectedMachine : undefined}
            onSubmit={handleSaveMachine}
            onCancel={() => setIsModalOpen(false)}
          />
        </Modal>

        <Modal 
          isOpen={showQrModal} 
          onClose={() => setShowQrModal(false)} 
          title="分享此系統"
        >
          <div className="flex flex-col items-center gap-6 py-4">
            <div className="p-6 bg-white rounded-3xl shadow-xl ring-1 ring-gray-100">
              <QRCodeSVG value={shareUrl} size={256} includeMargin={true} />
            </div>
            
            <div className="w-full space-y-4">
              <div className="text-center space-y-1">
                <p className="text-lg font-bold text-gray-900">掃描 QR Code 即可開啟</p>
                <p className="text-xs text-gray-400">
                  手機掃描上方圖碼，即可隨時追蹤機台進度。
                </p>
              </div>

              {isDevUrl && (
                <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl space-y-2">
                  <p className="text-[11px] text-emerald-800 font-bold leading-normal">
                    ✨ 系統已為您自動轉換為「免費公開分享網址」！
                  </p>
                  <p className="text-[10px] text-emerald-700 leading-normal">
                    系統已自動將您的私有開發網址轉換為永不到期的公開預覽與分享連結（包含 QR Code）。您可以直接點選下方的「複製網址」按紐，傳送給您的主管、客戶或同事，他們即可直接線上看見最新機台數據！
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex justify-between items-center px-1">
                  <label className="text-[10px] uppercase font-bold text-gray-400">專屬分享連結</label>
                  {customShareUrl && (
                    <button 
                      onClick={() => setCustomShareUrl("")}
                      className="text-[9px] text-blue-500 font-bold hover:underline"
                    >
                      恢復預設
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <input 
                    type="text"
                    value={shareUrl}
                    onChange={(e) => setCustomShareUrl(e.target.value)}
                    placeholder="貼上您的分享連結..."
                    className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(shareUrl);
                      alert("連結已複製完成！");
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-100 shrink-0"
                  >
                    複製網址
                  </button>
                </div>
                {!customShareUrl && (
                  <p className="text-[9px] text-gray-400 ml-1 italic">
                    * QR Code 與上方的分享連結皆為永久免費的免驗證公開網址。
                  </p>
                )}
              </div>
            </div>
          </div>
        </Modal>

        {/* Print Feedback Hint */}
        {showPrintHint && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] no-print">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gray-900/90 backdrop-blur text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 min-w-[320px]"
            >
              <div className="p-2 bg-blue-500 rounded-full animate-pulse">
                <Printer size={20} />
              </div>
              <div>
                <p className="font-bold text-sm">正在嘗試開啟列印對話框...</p>
                <p className="text-[10px] text-gray-300">提示：如果沒有反應，請先點擊上方「在新分頁開啟」按鈕後再嘗試列印。</p>
              </div>
              <button onClick={() => setShowPrintHint(false)} className="ml-auto p-1 hover:bg-white/20 rounded">
                <X size={16} />
              </button>
            </motion.div>
          </div>
        )}

        {/* Footer Info */}
        <footer className="mt-16 pt-8 border-t border-gray-200 text-center no-print">
          <p className="text-xs text-gray-400 uppercase tracking-widest font-bold">
            Automated Manufacturing Progress Tracking System v1.1
          </p>
        </footer>
      </div>
    </div>
  );
}
