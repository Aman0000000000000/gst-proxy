require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

const GST_API = "https://commonapi.gst.gov.in/commonapi/v1.1/search";

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/gstin/:gstin", async (req, res) => {
  const { gstin } = req.params;

  if (!gstin || gstin.length !== 15) {
    return res.status(400).json({ error: "Invalid GSTIN" });
  }

  try {
    const { data } = await axios.get(GST_API, {
      params: { action: "TP", gstin },
      timeout: 10000,
    });

    const status = (data?.sts || "").toLowerCase();

    if (status !== "active") {
      return res.status(200).json({ error: "This GST No. is Inactive" });
    }

    const addr = data.pradr?.addr || {};
    const parts = [
      addr.bno, addr.flno, addr.bnm, addr.st, addr.loc,
      addr.dst, addr.stcd, addr.pncd,
    ].filter(Boolean);
    const address = parts.join(", ");

    return res.json({
      legalName: data.lgnm || "",
      tradeName: data.tradeNam || "",
      address,
      status: data.sts || "",
    });
  } catch (err) {
    if (err.response) {
      const upstreamStatus = err.response.status;
      if (upstreamStatus === 404 || upstreamStatus === 400) {
        return res.status(200).json({ error: "This GST No. is Inactive" });
      }
    }
    console.error("GST API error:", err.message);
    return res.status(502).json({ error: "Failed to reach GST portal" });
  }
});

// Catch-all for unknown routes
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(PORT, () => {
  console.log(`GST proxy listening on port ${PORT}`);
});
