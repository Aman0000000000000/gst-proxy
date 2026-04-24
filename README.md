# GST Proxy Server

A lightweight Node.js/Express proxy that wraps India's GST portal API and exposes a clean JSON endpoint — designed to be called from Google Apps Script.

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check — returns `{"status":"ok"}` |
| GET | `/gstin/:gstin` | Look up a 15-character GSTIN |

### Success response (Active GSTIN)
```json
{
  "legalName": "ACME PRIVATE LIMITED",
  "tradeName": "ACME",
  "address": "123, MG Road, Bengaluru, Karnataka, 560001",
  "status": "Active"
}
```

### Error responses
```json
{ "error": "Invalid GSTIN" }          // not 15 characters
{ "error": "This GST No. is Inactive" } // cancelled / not found
{ "error": "Failed to reach GST portal" } // upstream timeout / 5xx
```

---

## Deploy to Render.com (Free Tier)

### Prerequisites
- GitHub account
- Render.com account (free — no credit card needed)

### Step-by-step

1. **Push this folder to a GitHub repository**
   ```bash
   cd gst-proxy
   git init
   git add .
   git commit -m "initial commit"
   gh repo create gst-proxy --public --push --source=.
   ```

2. **Create a new Web Service on Render**
   - Go to [https://dashboard.render.com](https://dashboard.render.com)
   - Click **New → Web Service**
   - Connect your GitHub account and select the `gst-proxy` repo
   - Render auto-detects `render.yaml` — accept the defaults

3. **Set environment variables** (optional — PORT defaults to 3000)
   - Render already injects `PORT` automatically; no manual step needed

4. **Click "Create Web Service"**
   - First deploy takes ~2 minutes
   - Your URL will be: `https://gst-proxy.onrender.com` (or similar)

5. **Verify the deployment**
   ```
   curl https://YOUR-APP.onrender.com/health
   # → {"status":"ok"}

   curl https://YOUR-APP.onrender.com/gstin/27AABCU9603R1ZX
   ```

> **Free tier note:** Render spins down idle services after 15 minutes.  
> The first request after a cold start takes ~30–50 seconds.  
> Google Apps Script's 30-second URL fetch timeout may need bumping — see the Apps Script section below.

---

## Local Development

```bash
cp .env.example .env
npm install
npm run dev
```

Server starts on `http://localhost:3000`.

---

## Google Apps Script

Paste this into **Extensions → Apps Script** inside your Google Sheet.  
Replace `YOUR-APP` with your actual Render subdomain.

```javascript
const PROXY_BASE = "https://YOUR-APP.onrender.com/gstin/";
const SHEET_NAME = "Ledger";
const START_ROW   = 2;
const COL_GSTIN   = 2;  // Column B — source GSTIN
const COL_LEGAL   = 7;  // Column G — Legal Name
const COL_TRADE   = 9;  // Column I — Trade Name
const COL_ADDR    = 10; // Column J — Billing Address

function fetchGSTDetails() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) {
    SpreadsheetApp.getUi().alert('Sheet "Ledger" not found.');
    return;
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < START_ROW) return;

  for (let row = START_ROW; row <= lastRow; row++) {
    const gstin = String(sheet.getRange(row, COL_GSTIN).getValue()).trim();
    if (!gstin || gstin.length !== 15) continue;

    try {
      const url = PROXY_BASE + encodeURIComponent(gstin);
      const response = UrlFetchApp.fetch(url, {
        method: "GET",
        muteHttpExceptions: true,
        followRedirects: true,
      });

      const json = JSON.parse(response.getContentText());

      if (json.error) {
        sheet.getRange(row, COL_LEGAL).setValue(json.error);
        sheet.getRange(row, COL_TRADE).setValue("");
        sheet.getRange(row, COL_ADDR).setValue("");
      } else {
        sheet.getRange(row, COL_LEGAL).setValue(json.legalName  || "");
        sheet.getRange(row, COL_TRADE).setValue(json.tradeName  || "");
        sheet.getRange(row, COL_ADDR).setValue(json.address     || "");
      }
    } catch (e) {
      sheet.getRange(row, COL_LEGAL).setValue("Error: " + e.message);
    }

    Utilities.sleep(300); // be polite to the upstream API
  }

  SpreadsheetApp.getUi().alert("GST fetch complete!");
}

// Optional: add a custom menu so users can trigger it without opening Apps Script
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("GST Tools")
    .addItem("Fetch GST Details", "fetchGSTDetails")
    .addToUi();
}
```

### What it writes

| Column | Content |
|--------|---------|
| G | Legal Name (or error message) |
| I | Trade Name |
| J | Billing Address |

**Assumptions:**
- Sheet is named exactly `Ledger`
- GSTIN values are in **column B** starting from row 2
- Columns G, I, J are free to overwrite

Change `COL_GSTIN` at the top of the script if your GSTINs are in a different column.
