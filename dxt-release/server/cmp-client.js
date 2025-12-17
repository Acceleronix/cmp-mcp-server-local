import crypto from 'crypto';

// Enums and helper functions
export const SIMState = {
  PRE_ACTIVATION: 2,
  TEST: 3,
  SILENT: 4,
  STANDBY: 5,
  ACTIVE: 6,
  SHUTDOWN: 7,
  PAUSE: 8,
  PRE_LOGOUT: 10,
  LOGOUT: 11,
};

export function getStateName(stateCode) {
  const stateMap = {
    2: "Pre-activation",
    3: "Test",
    4: "Silent",
    5: "Standby",
    6: "Active",
    7: "Shutdown",
    8: "Pause",
    10: "Pre-logout",
    11: "Logout",
  };
  return stateMap[stateCode] || `Unknown status (${stateCode})`;
}

export const ProfileStatus = {
  NOT_DOWNLOADED: 1,
  DOWNLOADING: 2,
  DOWNLOADED: 3,
  ENABLING: 4,
  ENABLED: 5,
  DISABLING: 6,
  DISABLED: 7,
  DELETING: 8,
  DELETED: 9,
};

export function getProfileStatusName(status) {
  const statusMap = {
    1: "Not Downloaded",
    2: "Downloading",
    3: "Downloaded",
    4: "Enabling",
    5: "Enabled",
    6: "Disabling",
    7: "Disabled",
    8: "Deleting",
    9: "Deleted",
  };
  return statusMap[status] || `Unknown Status (${status})`;
}

export function getProfileTypeName(type) {
  const typeMap = {
    "0": "Test Profile",
    "1": "Provisioning Profile", 
    "2": "Operational Profile",
  };
  return typeMap[type] || `Unknown Type (${type})`;
}

export class CMPClient {
  constructor(appKey, appSecret, endpoint) {
    this.appKey = appKey;
    this.appSecret = appSecret;
    this.endpoint = endpoint.replace(/\/$/, "");
    this.logger = null;
  }

  setLogger(logger) {
    this.logger = logger;
  }

  log(level, message, ...args) {
    if (this.logger) {
      this.logger[level](message, ...args);
    }
  }

  async generateSignature(timestamp, requestBody = "") {
    const signContent = this.appKey + timestamp.toString() + requestBody;
    const signature = crypto
      .createHmac('sha256', this.appSecret)
      .update(signContent)
      .digest('hex');
    return signature;
  }

  async getHeaders(requestBody = "") {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await this.generateSignature(timestamp, requestBody);
    
    return {
      "Content-Type": "application/json",
      "APP-Key": this.appKey,
      "Signature": signature,
      "Timestamp": timestamp.toString(),
    };
  }

  async makeRequest(method, resourcePath, data, params) {
    try {
      // Fix URL construction
      const baseUrl = this.endpoint.endsWith('/') ? this.endpoint.slice(0, -1) : this.endpoint;
      const path = resourcePath.startsWith('/') ? resourcePath.slice(1) : resourcePath;
      const url = new URL(`${baseUrl}/${path}`);
      
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          if (value !== undefined && value !== null) {
            url.searchParams.append(key, String(value));
          }
        }
      }

      const requestBody = data ? JSON.stringify(data) : "";
      const headers = await this.getHeaders(requestBody);

      this.log('debug', `Making ${method} request to: ${url.toString()}`);
      this.log('debug', `Request body: ${requestBody}`);

      const response = await fetch(url.toString(), {
        method,
        headers,
        body: requestBody || undefined,
      });

      this.log('debug', `Response status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const responseText = await response.text();
        this.log('error', `HTTP Error: ${response.status} ${response.statusText}`, responseText);
        throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      this.log('debug', `Response data: ${JSON.stringify(result)}`);

      // Handle different response formats
      if (result.code === undefined) {
        if (typeof result === 'object' && result !== null) {
          this.log('warn', 'API returned data without standard wrapper, treating as success');
          return {
            code: 200,
            msg: "OK",
            data: result
          };
        } else {
          throw new Error(`API Error: Invalid response format - ${JSON.stringify(result)}`);
        }
      }

      if (result.code !== 200) {
        throw new Error(`API Error [${result.code}]: ${result.msg || "Unknown error"}`);
      }

      return result;
    } catch (error) {
      this.log('error', 'Request failed:', error.message);
      if (error instanceof Error) {
        throw new Error(`Request failed: ${error.message}`);
      }
      throw new Error("Request failed: Unknown error");
    }
  }

  async get(resourcePath, params) {
    return this.makeRequest("GET", resourcePath, undefined, params);
  }

  async post(resourcePath, data) {
    return this.makeRequest("POST", resourcePath, data);
  }

  async querySimList(options = {}) {
    const {
      pageNum = 1,
      pageSize = 10,
      enterpriseDataPlan,
      expirationTimeStart,
      expirationTimeEnd,
      iccidStart,
      iccidEnd,
      label,
      simState,
      simType,
    } = options;

    const data = {
      pageNum,
      pageSize: Math.min(pageSize, 1000),
    };

    if (enterpriseDataPlan) data.enterpriseDataPlan = enterpriseDataPlan;
    if (expirationTimeStart) data.expirationTimeStart = expirationTimeStart;
    if (expirationTimeEnd) data.expirationTimeEnd = expirationTimeEnd;
    if (iccidStart) data.iccidStart = iccidStart;
    if (iccidEnd) data.iccidEnd = iccidEnd;
    if (label) data.label = label;
    if (simState !== undefined) data.simState = simState;
    if (simType) data.simType = simType;

    return this.post("/sim/page", data);
  }

  async querySimDetail(iccid) {
    if (!iccid || !iccid.trim()) {
      throw new Error("ICCID cannot be empty");
    }
    return this.post("/sim/detail", { iccid: iccid.trim() });
  }

  async querySimMonthData(options) {
    const { iccid, month } = options;
    
    if (!iccid || !iccid.trim()) {
      throw new Error("ICCID cannot be empty");
    }
    
    if (!month || !month.trim()) {
      throw new Error("Month cannot be empty");
    }
    
    // Validate month format (yyyyMM)
    if (!/^\d{6}$/.test(month.trim())) {
      throw new Error("Month format must be yyyyMM (e.g., 202301)");
    }

    return this.post("/sim/queryMonthData", { 
      iccid: iccid.trim(), 
      month: month.trim() 
    });
  }

  async queryEuiccPage(options = {}) {
    const {
      childEnterpriseId,
      iccid,
      pageNum = 1,
      pageSize = 10,
      profileStatus,
    } = options;

    const data = {
      pageNum,
      pageSize: Math.min(pageSize, 1000),
    };

    // Add optional filters
    if (childEnterpriseId !== undefined) data.childEnterpriseId = childEnterpriseId;
    if (iccid && iccid.trim()) data.iccid = iccid.trim();
    if (profileStatus !== undefined) data.profileStatus = profileStatus;

    // Validate profileStatus if provided
    if (profileStatus !== undefined && (profileStatus < 1 || profileStatus > 9)) {
      throw new Error("Profile status must be between 1-9 (see ProfileStatus enum)");
    }

    return this.post("/esim/euicc/page", data);
  }

  formatDataUsage(bytesValue) {
    if (bytesValue === 0) return "0 B";

    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = bytesValue;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    if (unitIndex === 0) {
      return `${Math.round(size)} ${units[unitIndex]}`;
    }
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  // Helper functions for cursor-based pagination
  static createCursor(data) {
    return Buffer.from(JSON.stringify(data)).toString('base64');
  }

  static parseCursor(cursor) {
    try {
      return JSON.parse(Buffer.from(cursor, 'base64').toString());
    } catch {
      throw new Error("Invalid cursor format");
    }
  }
}