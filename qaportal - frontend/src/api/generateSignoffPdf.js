import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Chart, ArcElement, Tooltip, Legend, Title } from "chart.js";
import { useSelector } from "react-redux";


Chart.register(ArcElement, Tooltip, Legend, Title);

function buildPieDataset(counts = {}, colorMap = {}) {
  const entries = Object.entries(counts).filter(([, v]) => Number(v) > 0);

  const labels = entries.map(([k]) => k);
  const data = entries.map(([, v]) => Number(v));
  const backgroundColor = labels.map((k) => colorMap[k] || "#9CA3AF"); // fallback gray

  return { labels, data, backgroundColor, hasData: data.length > 0 };
}

/* -------------------------------------------------------
   Load logo from /public (SVG) and convert to PNG dataURL
   Put file here: public/nathcorp-logo-small.svg
------------------------------------------------------- */
async function loadSvgAsPngDataUrl(svgPath, targetWidth = 900) {
  const res = await fetch(svgPath);
  const svgText = await res.text();

  const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = targetWidth / img.width;
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    img.src = url;
  });
}

/* =======================================================
   PIE CHARTS (You only provide counts)
   BUG / ISSUE / SEVERITY -> 3 PNG base64 charts
======================================================= */

// Default color maps (you can change anytime)
const BUG_COLOR_MAP = {
  New: "#FB7185",
  Active: "#818CF8",
  Resolved: "#FBBF24",
  Closed: "#EC4899",
};

const ISSUE_COLOR_MAP = { 
  Active: "#818CF8",
  Closed: "#4ADE80",
  Unknown: "#9CA3AF",
};


const SEVERITY_COLOR_MAP = {
  Critical: "#EF4444",
  High: "#F97316",
  Medium: "#FBBF24",
  Low: "#4ADE80"
  // Unknown: "#9CA3AF",
};

function toNumber(v) {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}

// function cleanCounts(obj = {}) {
//   const out = {};
//   Object.entries(obj || {}).forEach(([k, v]) => {
//     const n = toNumber(v);
//     if (n > 0) out[k] = n; // only keep > 0
//   });
//   return out;
// }

// Draw a pie chart (with title + legend) to a PNG dataURL
function pieChartToDataUrl({ title, counts, colorMap, size = 720 }) {
  // const data = cleanCounts(counts);
  const data = cleanCounts(counts, colorMap);

  const entries = Object.entries(data);

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);

  const pad = 24;
  const titleH = 54;
  const legendH = 160;

  // Title
  ctx.fillStyle = "#111827";
  ctx.font = "900 30px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title || "", size / 2, pad + 18);

  const chartTop = pad + titleH;
  const chartBottom = size - pad - legendH;
  const chartH = Math.max(120, chartBottom - chartTop);

  const cx = size / 2;
  const cy = chartTop + chartH / 2;
  const r = Math.min(size * 0.26, chartH * 0.42);

  const total = entries.reduce((s, [, v]) => s + v, 0);

  // No data
  if (!total) {
    ctx.fillStyle = "#E5E7EB";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#6B7280";
    ctx.font = "600 18px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillText("No data", cx, cy);
    return canvas.toDataURL("image/png");
  }

  // Pie slices
  let angle = -Math.PI / 2;
  entries.forEach(([label, value]) => {
    const slice = (value / total) * Math.PI * 2;
    const next = angle + slice;

    ctx.fillStyle = colorMap?.[label] || "#9CA3AF";
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, angle, next);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2;
    ctx.stroke();

    angle = next;
  });

  // Total
  ctx.fillStyle = "#111827";
  ctx.font = "700 18px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  // ctx.fillText(`Total: ${total}`, cx, cy + r + 26);

  // Legend (2 columns)
  const legendY = size - pad - legendH + 10;
  const colW = (size - pad * 2) / 2;
  const box = 14;
  const rowH = 26;

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = "600 24px system-ui, -apple-system, Segoe UI, Roboto, Arial";

  entries.forEach(([label, value], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);

    const x = pad + col * colW;
    const y = legendY + row * rowH;

    ctx.fillStyle = colorMap?.[label] || "#9CA3AF";
    ctx.fillRect(x, y - box / 2, box, box);

    ctx.fillStyle = "#111827";
    const pct = Math.round((value / total) * 100);
    ctx.fillText(`${label}: ${value} (${pct}%)`, x + box + 10, y);
  });

  return canvas.toDataURL("image/png");
}

function buildStatusPieChartImages({ BUG, ISSUE, SEVERITY }) {
  return [
    pieChartToDataUrl({ title: "Bugs by Severity", counts: SEVERITY, colorMap: SEVERITY_COLOR_MAP }),
    pieChartToDataUrl({ title: "Bugs by State", counts: BUG, colorMap: BUG_COLOR_MAP }),
    pieChartToDataUrl({ title: "Issues by State", counts: ISSUE, colorMap: ISSUE_COLOR_MAP }),
  ];
}

/* =======================================================
   MAIN PDF
======================================================= */
function normalizeKey(k) {
  return String(k ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, ""); // removes space/_/-
}

// ✅ Now supports missing states + different spellings + consistent ordering by colorMap keys
function cleanCounts(obj = {}, colorMap = {}) {
  const normToCanonical = {};
  Object.keys(colorMap || {}).forEach((k) => {
    normToCanonical[normalizeKey(k)] = k; // canonical key from color map
  });

  const merged = {};
  Object.entries(obj || {}).forEach(([rawKey, v]) => {
    const n = toNumber(v);
    if (n <= 0) return;

    const keyTrim = String(rawKey ?? "").trim();
    const canonical = normToCanonical[normalizeKey(keyTrim)] || keyTrim; // match to map if possible
    merged[canonical] = (merged[canonical] || 0) + n;
  });

  // ✅ Keep order consistent: colorMap keys first, then any unknown keys
  const ordered = {};
  Object.keys(colorMap || {}).forEach((k) => {
    if (merged[k] != null) ordered[k] = merged[k];
  });
  Object.keys(merged).forEach((k) => {
    if (ordered[k] == null) ordered[k] = merged[k];
  });

  return ordered;
}



export async function generateQASignoffPdf({
  userData,
  userInput,
  ado,
  assets = {},
  fileName,
  dashWorkItems,
  // chartsData: { BUG, ISSUE, SEVERITY }
  chartsData,
}) {

 const doc = new jsPDF({ unit: "pt", format: "a4" });
   const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
   const M = 48;
  const contentW = pageW - M * 2;

  let y = M;

  const todayIso = () => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mm}-${dd}`;
  };

  const safe = (v) => (v == null ? "" : String(v));
  const fmtDate = (s, fallback) => safe(s || fallback);

  // Load NathCorp logo from /public if not provided
  if (!assets.logoDataUrl) {
    assets.logoDataUrl = await loadSvgAsPngDataUrl("/ncsignofflogo.svg", 1200);
  }

  // --------- helpers ---------
  const ensureSpace = (need = 80) => {
    if (y + need > pageH - M) {
      doc.addPage();
      y = M;
    }
  };

  const setBr = (space = 10) => {
    y += space;
  };

  const setTitle = (t) => {
    ensureSpace(48);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(0);
    doc.text(safe(t), M, y);
    y += 22;
  };

  const setH2 = (t) => {
    ensureSpace(34);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(0);
    doc.text(safe(t), M, y);
    y += 18;
  };

  const paragraph = (text, fontSize = 11) => {
    const s = safe(text).trim();
    if (!s) return;

    // dynamic line gap so smaller font actually takes less height
    const gap = Math.max(12, Math.round(fontSize * 1.25)); // 11 -> ~14
    ensureSpace(Math.max(70, gap * 5));

    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);
    doc.setTextColor(0);

    const lines = doc.splitTextToSize(s, contentW);
    doc.text(lines, M, y);
    y += lines.length * gap + 8;
  };

  const kvBlock = (rows) => {
    ensureSpace(120);

    const labelX = M;
    const valueX = M + 240;
    const maxW = pageW - M - valueX;

    doc.setFontSize(11);

    rows.forEach(([k, v]) => {
      ensureSpace(26);

      doc.setFont("helvetica", "bold");
      doc.setTextColor(30);
      doc.text(`${safe(k)}:`, labelX, y);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(0);

      const vv = safe(v) || "-";
      const lines = doc.splitTextToSize(vv, maxW);
      doc.text(lines, valueX, y);

      const gap = 14;
      y += Math.max(1, lines.length) * gap;
    });

    y += 10;
  };

  const table = ({ head, body, colStyles }) => {
    ensureSpace(170);

    autoTable(doc, {
      startY: y,
      head: [head],
      body,
      margin: { left: M, right: M },
      styles: {
        font: "helvetica",
        fontSize: 10,
        cellPadding: 6,
        overflow: "linebreak",
        textColor: 20,
      },
      headStyles: {
        fillColor: [35, 35, 35],
        textColor: 255,
        fontStyle: "bold",
      },
      columnStyles: colStyles || {},
    });

    y = (doc.lastAutoTable?.finalY || y) + 18;
  };

  const detectImgFormat = (dataUrl) =>
    typeof dataUrl === "string" && dataUrl.includes("image/jpeg") ? "JPEG" : "PNG";

  const imageGrid2x2 = (dataUrls = [], cellH = 190, gap = 14) => {
    const list = Array.isArray(dataUrls) ? dataUrls.filter(Boolean) : [];
    if (list.length === 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(120);
      doc.text("No charts available.", M, y);
      y += 18;
      return;
    }

    const cellW = (contentW - gap) / 2;

    for (let start = 0; start < list.length; start += 4) {
      const chunk = list.slice(start, start + 4);
      const need = cellH * 2 + gap + 40;
      ensureSpace(need);

      chunk.forEach((dataUrl, idx) => {
        const row = Math.floor(idx / 2);
        const col = idx % 2;

        const cellX = M + col * (cellW + gap);
        const cellY = y + row * (cellH + gap);

        let w = cellW;
        let h = cellH;

        try {
          const p = doc.getImageProperties(dataUrl);

          let wFit = cellW;
          let hFit = (wFit * p.height) / p.width;

          if (hFit > cellH) {
            hFit = cellH;
            wFit = (hFit * p.width) / p.height;
          }

          const xImg = cellX + (cellW - wFit) / 2;
          const yImg = cellY + (cellH - hFit) / 2;

          doc.addImage(dataUrl, detectImgFormat(dataUrl), xImg, yImg, wFit, hFit, undefined, "FAST");
        } catch {
          doc.addImage(dataUrl, detectImgFormat(dataUrl), cellX, cellY, w, h, undefined, "FAST");
        }
      });

      y += cellH * 2 + gap + 18;
    }
  };

  // ==========================================================
  // COVER FIT: logo + title + divider + abstract ALWAYS page-1
  // ==========================================================
  const autoDesc =
    `This document contains the QA sign off details for ${safe(userInput.projectName)} ` +
    `${safe(userInput.buildName)} ` +
    `${safe(userInput.buildVersion)}`;

  const calcAbstractHeight = (fontSize) => {
    const gap = Math.max(12, Math.round(fontSize * 1.25));
    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(autoDesc, contentW);
    return { lines, h: lines.length * gap + 8, gap };
  };

  // Try to keep logo big + abstract font readable
  const minLogoH = 60;
  const maxLogoHDefault = 110;
  const minAbsFont = 9;
  const maxAbsFont = 11;

  // heights after logo (fixed-ish)
  const logoGap = 10;
  const titleGap = 18;   // after title text
  const dividerGap = 16; // after divider line
  const absTitleH = 22;  // setTitle("Abstract") increments by 22

  const fitCover = () => {
    let best = { logoH: maxLogoHDefault, absFont: maxAbsFont };

    for (let logoH = maxLogoHDefault; logoH >= minLogoH; logoH -= 5) {
      for (let absFont = maxAbsFont; absFont >= minAbsFont; absFont -= 1) {
        const { h: absH } = calcAbstractHeight(absFont);

        // remaining space for abstract paragraph after Abstract title
        const usedBeforeAbsText =
          M + logoH + logoGap + titleGap + dividerGap + absTitleH;

        const remaining = (pageH - M) - usedBeforeAbsText;

        if (absH <= remaining) {
          return { logoH, absFont };
        }
      }
    }

    // worst-case fallback
    return best;
  };

  const coverFit = fitCover();

  // --------- COVER: Logo + Title + Abstract (same page) ---------
  // (we are on page 1 at top)
  y = M;

  if (assets?.logoDataUrl) {
    const maxLogoW = contentW;
    const maxLogoH = coverFit.logoH;

    let w = maxLogoW;
    let h = maxLogoH;

    try {
      const p = doc.getImageProperties(assets.logoDataUrl);
      h = (w * p.height) / p.width;
      if (h > maxLogoH) {
        h = maxLogoH;
        w = (h * p.width) / p.height;
      }
    } catch {
      w = maxLogoW;
      h = maxLogoH;
    }

    const x = (pageW - w) / 2;
    doc.addImage(assets.logoDataUrl, "PNG", x, y, w, h);
    y += h + logoGap;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(0);
  setBr(30);
  doc.text("QA Sign-Off Report", pageW / 2, y, { align: "center" });
  y += titleGap;

  doc.setDrawColor(210);
  doc.line(M, y, pageW - M, y);
  y += dividerGap;

  setH2("Abstract");
  paragraph(autoDesc, coverFit.absFont);
  setBr(16);

  // --------- Sign Off Document ---------
  // -------- Sign Off Document (Table like Test Coverage Summary) --------
const dashTable = ({ head, body, colStyles, didParseCell }) => {
  ensureSpace(170);

  autoTable(doc, {
    startY: y,
    head: [head],
    body,
    margin: { left: M, right: M },
    styles: {
      font: "helvetica",
      fontSize: 10,
      cellPadding: 6,
      overflow: "linebreak",
      textColor: 20,
    },
    headStyles: {
      fillColor: [35, 35, 35],
      textColor: 255,
      fontStyle: "bold",
    },
    columnStyles: colStyles || {},
    didParseCell, // ✅ NEW (optional)
  });

  y = (doc.lastAutoTable?.finalY || y) + 18;
};

setH2("Sign Off Document");



dashTable({
  head: ["Version", "Date", "Description of Changes", "Approved By"],
  body: [[
    safe(userInput.signoffDocVersion),
    safe(fmtDate(userInput.dateChanged)),
    safe(userInput.signoffChangeDescription),
    safe(userInput.approvedBy),
  ]],
  colStyles: {
    0: { cellWidth: 80 },   // Version
    1: { cellWidth: 90 },   // Date
    2: { cellWidth: 250 },  // Description
    3: { cellWidth: 80 },   // Approved By
  },

  // ✅ Example: style ONLY "Approved By" column (index 3)
  didParseCell: (data) => {
    if (data.section !== "body") return;

    // Approved By column
    if (data.column.index === 3) {
      data.cell.styles.fontStyle = "bold";
      // optional subtle background
      // data.cell.styles.fillColor = [243, 244, 246]; // light gray
    }

    // ✅ Example: if you want to highlight missing values in red
    const raw = String(data.cell.raw ?? "").trim();
    if (raw === "-" || raw === "") {
      data.cell.styles.textColor = [239, 68, 68]; // red
      data.cell.styles.fontStyle = "bold";
    }
  },
});

setBr(10);



// -------- Build Details (Table like Test Coverage Summary) --------
setH2("Build Details");

const developerName = (() => {
  const preparedBy = userInput.preparedBy;
  if (typeof preparedBy === "object" && preparedBy !== null) {
    return preparedBy.name || preparedBy.fullName || preparedBy.email || "";
  }
  return preparedBy || userInput.username || userInput.email || "";
})();


dashTable({
  head: [
    "Version",
    "Release Date",
    "Description of Change",
    "Affected Section",
    "Developer",
    "Tester",
  ],
  body: [[
    safe(userInput.buildVersion),
    safe(fmtDate(userInput.effectiveDate)),
    safe(userInput.briefDescriptionOfChange),
    safe(userInput.affectedSection),
    safe(userInput.releasedBy || userInput.preparedBy || "-"),
    safe(userInput.completedBy || userInput.username || userData?.username || "-"),
  ]],
  colStyles: {
    0: { cellWidth: 65 },   // Version
    1: { cellWidth: 75 },   // Release Date
    2: { cellWidth: 150 },  // Brief Description
    3: { cellWidth: 95 },   // Affected Section
    4: { cellWidth: 60 },   // Developed By
    5: { cellWidth: 55 },   // Tested By
  },

  // Optional: highlight missing values in red (same pattern hook)
  didParseCell: (data) => {
    if (data.section !== "body") return;

    const raw = String(data.cell.raw ?? "").trim();
    if (raw === "-" || raw === "") {
      data.cell.styles.textColor = [239, 68, 68]; // red
      data.cell.styles.fontStyle = "bold";
    }
  },
});

setBr(12);

setBr(12);


  // --------- Overview ---------
  setH2("Overview");
  paragraph(userInput.overview);
  setBr(14);

  // --------- Test Coverage Summary ---------
  setH2("Test Coverage Summary");
  table({
  head: ["Workitems", "State", "Count"],
  body: [
    [{ content: "Test cases", rowSpan: 3 }, "Total Design Test Case", safe(userInput.totalDesignTestCases)],
    ["Total Pass", safe(userInput.totalPass)],
    ["Total Fail", safe(userInput.totalFail)],

    [{ content: "Bugs", rowSpan: 3 }, "Total Reported Bugs", safe(ado?.workItems?.bugs?.totalReported ?? 0)],
    ["Active", safe(ado?.workItems?.bugs?.active ?? 0)],
    ["Closed", safe(ado?.workItems?.bugs?.closed ?? 0)],

    [{ content: "Improvements", rowSpan: 3 }, "Total Reported Improvements", safe(ado?.workItems?.improvements?.totalReported ?? 0)],
    ["Active", safe(ado?.workItems?.improvements?.active ?? 0)],
    ["Closed", safe(ado?.workItems?.improvements?.closed ?? 0)],
  ],

  // Header alignment
  headStyles: {
    halign: "left",
  },

  colStyles: {
    0: { cellWidth: 120, halign: "left" },   // Workitems
    1: { cellWidth: 300, halign: "left" },   // State
    2: { cellWidth: 80,  halign: "right" },  // Count
  },

  // Body defaults
  bodyStyles: {
    valign: "middle",
  },
});


  setBr(10);

  // --------- Test Execution Summary ---------
  setH2("Test Execution Summary");

  const manual = Number(ado?.testExecution?.manualTestCases ?? 0);
  const totalExecuted = Number(ado?.testExecution?.totalExecuted ?? 0);
  const manualCoveragePct = totalExecuted > 0 ? Math.round((manual / totalExecuted) * 100) : 0;

  table({
    head: ["Coverage Type", "Details"],
    body: [
      ["Manual Test Cases ", safe(manual)],
      ["Automation Test Cases ", safe(userInput.automationTestCases)],
      ["Manual Coverage (%)", `${manualCoveragePct}%`],
      ["Automation Coverage (%) ", `${safe(userInput.automationCoveragePercent)}%`],
      ["Total Test Cases Executed ", safe(totalExecuted)],
    ],
    colStyles: {
      0: { cellWidth: 280 },
      1: { cellWidth: contentW - 280 },
    },
  });

  paragraph(userInput.testExecutionSummary);

  // --------- Charts (Generated INSIDE PDF from data you provide) ---------
  // setH2("Status Charts");
  // paragraph("Bugs / Issues / Tasks / Severity pie charts (generated inside PDF).");

    // --------- Charts (Generated INSIDE PDF from data you provide) ---------
    setBr(20);

  setH2("Status Charts");
  paragraph("Bugs by severity, bugs by state, and issues by state pie charts");

  // Support both formats:
  // 1) { BUG, ISSUE, SEVERITY }
  // 2) { Bugs, Issue, "Bug severity" }  (or similar)
  const d = chartsData || assets.chartsData || {};

  const BUG =
    d.BUG ||
    d.Bugs ||
    d.bugs ||
    d.bugState ||
    {};

  const ISSUE =
    d.ISSUE ||
    d.Issue ||
    d.issues ||
    {};

  const SEVERITY =
    d.SEVERITY ||
    d.severity ||
    d.bugSeverity ||
    d["Bug severity"] ||
    d.bug_severity ||
    {};

  const pieImgs = buildStatusPieChartImages({
    BUG,
    ISSUE,
    SEVERITY,
  });

  imageGrid2x2(pieImgs, 190, 14);
  setBr(8);



  // const data = chartsData || assets.chartsData || {};

  // --------- Bugs & Issues Summary ---------
  setBr(80);
  setH2("Bugs & Issues Summary");

dashTable({
  head: ["Total", "Open", "Closed", "Hold/Workaround"],
  body: [[
    safe(ado?.defectsAndImprovementsSummary?.total ?? 0),
    safe(ado?.defectsAndImprovementsSummary?.open ?? 0),
    safe(ado?.defectsAndImprovementsSummary?.closed ?? 0),
    safe(userInput.holdOrWorkaround),
  ]],

  colStyles: {
    0: { cellWidth: 120 },
    1: { cellWidth: 120 },
    2: { cellWidth: 120 },
    3: { cellWidth: 120 },
  },

  // ✅ right alignment for values
  bodyStyles: {
    halign: "right",
  },
});


setBr(10);
setBr(8);

  // Active Defects List
   setH2("Bugs and Issues List");
const defects = Array.isArray(dashWorkItems) ? dashWorkItems : [];

dashTable({
  head: ["ID", "Work Item", "Title", "State"],
  body: defects.length
    ? defects.map((d) => [
        safe(d.WorkItemId),
        safe(d.WorkItemType),
        safe(d.Title),
        safe(d.State),
      ])
    : [["-", "-", "-", "-"]],
  colStyles: {
    0: { cellWidth: 70 },
    1: { cellWidth: 80 },
    2: { cellWidth: 250 },
    3: { cellWidth: 80 },
  },

  // ✅ Color only the "State" column (index 3)
  didParseCell: (data) => {
    if (data.section !== "body") return;
    if (data.column.index !== 3) return;

    const state = String(data.cell.raw || "").trim().toLowerCase();

    if (state === "active") {
      data.cell.styles.fillColor = [239, 68, 68]; // red
      data.cell.styles.textColor = 255;           // white text
      data.cell.styles.fontStyle = "bold";
    } else if (state === "closed") {
      data.cell.styles.fillColor = [34, 197, 94]; // green
      data.cell.styles.textColor = 255;           // white text
      data.cell.styles.fontStyle = "bold";
    }
  },
});


setBr(20);
  // --------- User input sections ---------
  setH2("Test Environment Details");
  paragraph(userInput.testEnvironmentDetails);
setBr(20);
  setH2("Risks & Assumptions");
  paragraph(userInput.risksAndAssumptions);
setBr(20);
  setH2("Conclusion");
  paragraph(userInput.conclusion);

  // --------- Page decorations: watermark + footer (all pages) ---------
  const decorateAllPages = () => {
    const total = doc.getNumberOfPages();

    for (let p = 1; p <= total; p++) {
      doc.setPage(p);

      // Watermark
      if (assets?.logoDataUrl && doc.GState && doc.setGState) {
        try {
          const props = doc.getImageProperties(assets.logoDataUrl);
          const maxW = pageW - M * 2;
          const maxH = pageH - M * 2;

          let w = maxW;
          let h = (w * props.height) / props.width;
          if (h > maxH) {
            h = maxH;
            w = (h * props.width) / props.height;
          }

          const x = (pageW - w) / 2;
          const yy = (pageH - h) / 2;

          doc.setGState(new doc.GState({ opacity: 0.06 }));
          doc.addImage(assets.logoDataUrl, "PNG", x, yy, w, h);
          doc.setGState(new doc.GState({ opacity: 1 }));
        } catch {
          // ignore watermark errors
        }
      }

      // Footer
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(120);
      // Footer
      doc.text("© 2026 NathCorp Inc", M, pageH - 24);
      // Center text
      doc.text("QA Team", pageW / 2, pageH - 24, {align: "center"});
      // Page number
      doc.text(`Page ${p} of ${total}`, pageW - M, pageH - 24, { align: "right" });
    }
  };

  decorateAllPages();

  doc.save(fileName || `QA_SignOff_${safe(userInput.projectName)}_${safe(userInput.buildVersion)}.pdf`);
}
