
export interface StageDetail {
  date?: string;
  startDate?: string;
  endDate?: string;
  progress: number;
  note?: string;
}

export type StageKey = 
  | "ORDER" 
  | "DRAWING" 
  | "FRAME" 
  | "PARTS_ORDER" 
  | "ASSEMBLY" 
  | "WIRING" 
  | "TESTING" 
  | "SHIPPING";

export interface Machine {
  id: string;
  docId?: string;
  name: string;
  currentStage: number;
  customer: string;
  stageData: Record<StageKey, StageDetail>;
  createdAt?: string;
  updatedAt?: any;
}

const SHEET_NAME = 'MachineTracking';

export class SheetService {
  private accessToken: string;
  private spreadsheetId: string | null = null;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  setSpreadsheetId(id: string) {
    this.spreadsheetId = id;
  }

  private async fetchGoogle(url: string, options: RequestInit = {}) {
    const res = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: 'Unknown error' } }));
      throw new Error(err.error?.message || `HTTP error! status: ${res.status}`);
    }
    return res.json();
  }

  async findOrCreateSpreadsheet(): Promise<string> {
    // 1. Search for a file named "Machine Tracking Database"
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=name='Machine Tracking Database' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
    const searchResult = await this.fetchGoogle(searchUrl);
    
    if (searchResult.files && searchResult.files.length > 0) {
      this.spreadsheetId = searchResult.files[0].id;
      return this.spreadsheetId!;
    }

    // 2. Create if not found
    const createUrl = 'https://sheets.googleapis.com/v4/spreadsheets';
    const spreadsheet = await this.fetchGoogle(createUrl, {
      method: 'POST',
      body: JSON.stringify({
        properties: { title: 'Machine Tracking Database' },
        sheets: [{ properties: { title: SHEET_NAME } }]
      }),
    });

    this.spreadsheetId = spreadsheet.spreadsheetId;
    
    // Initialize headers
    await this.initHeaders();
    
    return this.spreadsheetId!;
  }

  async initHeaders() {
    if (!this.spreadsheetId) throw new Error('No spreadsheet ID');
    
    const headers = [
      'ID', 'Name', 'Customer', 'CurrentStage',
      'ORDER_date', 'ORDER_progress',
      'DRAWING_start', 'DRAWING_end', 'DRAWING_progress',
      'FRAME_start', 'FRAME_end', 'FRAME_progress',
      'PARTS_ORDER_start', 'PARTS_ORDER_end', 'PARTS_ORDER_progress',
      'ASSEMBLY_start', 'ASSEMBLY_end', 'ASSEMBLY_progress',
      'WIRING_start', 'WIRING_end', 'WIRING_progress',
      'TESTING_start', 'TESTING_end', 'TESTING_progress',
      'SHIPPING_date', 'SHIPPING_progress'
    ];

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${SHEET_NAME}!A1:Z1?valueInputOption=USER_ENTERED`;
    await this.fetchGoogle(url, {
      method: 'PUT',
      body: JSON.stringify({ 
        range: `${SHEET_NAME}!A1:Z1`,
        majorDimension: 'ROWS',
        values: [headers] 
      }),
    });
  }

  async getAllMachines(): Promise<Machine[]> {
    if (!this.spreadsheetId) throw new Error('No spreadsheet ID');

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${SHEET_NAME}!A2:Z1000`;
    const res = await this.fetchGoogle(url);
    
    if (!res.values) return [];

    return res.values.map((row: string[]) => {
      const stageData: any = {};
      const keys: StageKey[] = ["ORDER", "DRAWING", "FRAME", "PARTS_ORDER", "ASSEMBLY", "WIRING", "TESTING", "SHIPPING"];
      
      let col = 4;
      keys.forEach(k => {
        if (k === "ORDER" || k === "SHIPPING") {
          const rawDate = row[col++] || '';
          const rawProgress = row[col++] || '0';
          stageData[k] = { 
            date: rawDate, 
            progress: isNaN(parseInt(rawProgress)) ? 0 : parseInt(rawProgress) 
          };
        } else {
          const rawStart = row[col++] || '';
          const rawEnd = row[col++] || '';
          const rawProgress = row[col++] || '0';
          stageData[k] = { 
            startDate: rawStart, 
            endDate: rawEnd, 
            progress: isNaN(parseInt(rawProgress)) ? 0 : parseInt(rawProgress) 
          };
        }
      });

      return {
        id: row[0] || '',
        name: row[1] || '未命名機台',
        customer: row[2] || '未知客戶',
        currentStage: isNaN(parseInt(row[3])) ? 0 : parseInt(row[3]),
        stageData
      };
    });
  }

  async saveMachines(machines: Machine[]) {
    if (!this.spreadsheetId) throw new Error('No spreadsheet ID');

    const values = machines.map(m => {
      const row: (string | number)[] = [m.id, m.name, m.customer, m.currentStage];
      const keys: StageKey[] = ["ORDER", "DRAWING", "FRAME", "PARTS_ORDER", "ASSEMBLY", "WIRING", "TESTING", "SHIPPING"];
      
      keys.forEach(k => {
        const d = m.stageData[k];
        if (k === "ORDER" || k === "SHIPPING") {
          row.push(d.date || '', d.progress || 0);
        } else {
          row.push(d.startDate || '', d.endDate || '', d.progress || 0);
        }
      });
      return row;
    });

    // Clear and overwrite (simple sync)
    const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${SHEET_NAME}!A2:Z1000:clear`;
    await this.fetchGoogle(clearUrl, { method: 'POST' });

    const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${SHEET_NAME}!A2?valueInputOption=USER_ENTERED`;
    await this.fetchGoogle(updateUrl, {
      method: 'PUT',
      body: JSON.stringify({ 
        range: `${SHEET_NAME}!A2`,
        majorDimension: 'ROWS',
        values: values 
      }),
    });
  }
}
