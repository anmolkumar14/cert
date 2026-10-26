/**
 * ============================================================================
 * Certificate Generator Portal - Excel/CSV Parser & Validator (excel.js)
 * ============================================================================
 * Handles:
 * - Drag-and-drop file upload & file picker (.xlsx, .xls, .csv)
 * - SheetJS parsing with robust column header normalization
 * - Strict row-by-row validation (missing names, email syntax, duplicate emails)
 * - Row filtering, removal, and real-time statistics
 * - Built-in Sample Excel Template generator (.xlsx)
 */

const ExcelManager = (function() {
  // State
  let parsedRows = []; // Array of validated row objects
  let activeFilter = "all"; // "all" | "valid" | "invalid"
  let searchQuery = "";

  /**
   * Header mapping synonyms (lowercase, stripped of punctuation)
   */
  const COLUMN_SYNONYMS = {
    name: ["name", "candidatename", "studentname", "fullname", "recipient", "participant", "student"],
    email: ["email", "emailaddress", "e-mail", "mail", "contactemail", "studentemail"],
    course: ["course", "coursename", "program", "track", "event", "certification", "workshop", "title"],
    date: ["date", "issuedate", "completiondate", "awarddate", "graduationdate"],
    certId: ["certificateid", "certid", "id", "credentialid", "certno", "referenceno"]
  };

  /**
   * Initialize file upload listeners
   */
  function init() {
    const dropzone = document.getElementById("dropzone");
    const fileInput = document.getElementById("fileInput");
    const downloadTemplateBtn = document.getElementById("downloadTemplateBtn");
    const filterAllBtn = document.getElementById("filterAllBtn");
    const filterValidBtn = document.getElementById("filterValidBtn");
    const filterInvalidBtn = document.getElementById("filterInvalidBtn");
    const searchInput = document.getElementById("tableSearchInput");
    const clearDataBtn = document.getElementById("clearDataBtn");
    const proceedToStep2Btn = document.getElementById("proceedToStep2Btn");

    if (dropzone && fileInput) {
      // Click on dropzone triggers file picker
      dropzone.addEventListener("click", () => fileInput.click());

      // File input change
      fileInput.addEventListener("change", (e) => {
        if (e.target.files && e.target.files[0]) {
          processFile(e.target.files[0]);
          e.target.value = ""; // Reset file input
        }
      });

      // Drag and drop events
      ["dragenter", "dragover"].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.add("drag-over");
        });
      });

      ["dragleave", "drop"].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.remove("drag-over");
        });
      });

      dropzone.addEventListener("drop", (e) => {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
          processFile(e.dataTransfer.files[0]);
        }
      });
    }

    if (downloadTemplateBtn) {
      downloadTemplateBtn.addEventListener("click", downloadSampleTemplate);
    }

    // Filter buttons
    if (filterAllBtn) filterAllBtn.addEventListener("click", () => setFilter("all"));
    if (filterValidBtn) filterValidBtn.addEventListener("click", () => setFilter("valid"));
    if (filterInvalidBtn) filterInvalidBtn.addEventListener("click", () => setFilter("invalid"));

    // Search bar
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        searchQuery = (e.target.value || "").toLowerCase().trim();
        renderTable();
      });
    }

    // Clear data
    if (clearDataBtn) {
      clearDataBtn.addEventListener("click", () => {
        if (parsedRows.length === 0) return;
        if (confirm("Are you sure you want to clear all uploaded candidate records?")) {
          parsedRows = [];
          updateUIState();
          UI.showToast("Data Cleared", "All candidate records removed.", "info");
        }
      });
    }

    // Proceed to Step 2
    if (proceedToStep2Btn) {
      proceedToStep2Btn.addEventListener("click", () => {
        const validCount = getValidRows().length;
        if (validCount === 0) {
          UI.showToast("No Valid Rows", "Please upload at least one valid candidate record before proceeding.", "warning");
          return;
        }
        UI.goToStep(2);
      });
    }
  }

  /**
   * Process and parse uploaded file via SheetJS
   */
  function processFile(file) {
    const validExtensions = [".xlsx", ".xls", ".csv"];
    const fileName = file.name.toLowerCase();
    const isSupported = validExtensions.some(ext => fileName.endsWith(ext));

    if (!isSupported) {
      UI.showToast("Unsupported File Format", "Please upload an Excel (.xlsx, .xls) or CSV (.csv) file.", "error");
      return;
    }

    const reader = new FileReader();

    reader.onload = function(e) {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array", cellDates: true });
        
        // Use first sheet
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to array of objects with raw headers
        const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

        if (!rawJson || rawJson.length === 0) {
          UI.showToast("Empty File", "The uploaded spreadsheet does not contain any data rows.", "warning");
          return;
        }

        // Validate and normalize rows
        parseAndValidateRecords(rawJson);
        UI.showToast("Upload Successful", `Parsed ${rawJson.length} records from ${file.name}.`, "success");
      } catch (err) {
        console.error("SheetJS parse error:", err);
        UI.showToast("Parsing Failed", "Unable to read spreadsheet. Check that the file is not corrupted or password-protected.", "error");
      }
    };

    reader.onerror = function() {
      UI.showToast("Read Error", "Failed to read the file from your computer.", "error");
    };

    reader.readAsArrayBuffer(file);
  }

  /**
   * Clean and normalize string headers
   */
  function normalizeKey(str) {
    return String(str || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  /**
   * Map raw row keys to normalized fields
   */
  function mapRowFields(rawRow, index) {
    const rowObj = {
      id: "row_" + (index + 1) + "_" + Math.random().toString(36).substring(2, 7),
      rawIndex: index + 1,
      name: "",
      email: "",
      course: "",
      date: "",
      certId: "",
      status: "valid",
      errorDetails: []
    };

    // Iterate through all columns in the raw row
    Object.keys(rawRow).forEach(rawCol => {
      const cleanKey = normalizeKey(rawCol);
      const val = String(rawRow[rawCol] || "").trim();

      if (COLUMN_SYNONYMS.name.includes(cleanKey)) {
        rowObj.name = val;
      } else if (COLUMN_SYNONYMS.email.includes(cleanKey)) {
        rowObj.email = val;
      } else if (COLUMN_SYNONYMS.course.includes(cleanKey)) {
        rowObj.course = val;
      } else if (COLUMN_SYNONYMS.date.includes(cleanKey)) {
        // Format if date object
        if (rawRow[rawCol] instanceof Date) {
          rowObj.date = rawRow[rawCol].toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
        } else {
          rowObj.date = val;
        }
      } else if (COLUMN_SYNONYMS.certId.includes(cleanKey)) {
        rowObj.certId = val;
      }
    });

    // Apply defaults for optional columns if missing
    if (!rowObj.course) {
      rowObj.course = CONFIG.CERTIFICATE.defaultCourse;
    }
    if (!rowObj.date) {
      rowObj.date = CONFIG.CERTIFICATE.defaultDate;
    }
    if (!rowObj.certId) {
      // Auto-generate consistent cert ID
      rowObj.certId = `${CONFIG.CERTIFICATE.idPrefix}${String(index + 1).padStart(4, "0")}`;
    }

    return rowObj;
  }

  /**
   * Validate all rows for missing name, email regex, and duplicates
   */
  function parseAndValidateRecords(rawRows) {
    const emailTracker = new Map();
    const rows = rawRows.map((raw, idx) => mapRowFields(raw, idx));

    // First pass: identify duplicates
    rows.forEach(r => {
      const emailLower = r.email.toLowerCase().trim();
      if (emailLower) {
        emailTracker.set(emailLower, (emailTracker.get(emailLower) || 0) + 1);
      }
    });

    // Second pass: full validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    rows.forEach(r => {
      r.errorDetails = [];

      // Validate Name
      if (!r.name || r.name.length < 2) {
        r.errorDetails.push("Missing or invalid recipient name");
      }

      // Validate Email
      if (!r.email) {
        r.errorDetails.push("Missing email address");
      } else if (!emailRegex.test(r.email)) {
        r.errorDetails.push("Invalid email syntax (e.g. user@domain.com)");
      } else if (emailTracker.get(r.email.toLowerCase().trim()) > 1) {
        r.errorDetails.push("Duplicate email in spreadsheet");
      }

      if (r.errorDetails.length > 0) {
        r.status = "invalid";
      } else {
        r.status = "valid";
      }

      // Dispatch status initialized to pending
      r.dispatchStatus = "pending"; // "pending" | "sending" | "sent" | "failed"
      r.dispatchMessage = "";
    });

    parsedRows = rows;
    updateUIState();
  }

  /**
   * Update stats, table visibility, and button states
   */
  function updateUIState() {
    const totalCount = parsedRows.length;
    const validCount = getValidRows().length;
    const invalidCount = totalCount - validCount;

    // Stat counters
    const totalEl = document.getElementById("statTotalRows");
    const validEl = document.getElementById("statValidRows");
    const invalidEl = document.getElementById("statInvalidRows");

    if (totalEl) totalEl.textContent = totalCount;
    if (validEl) validEl.textContent = validCount;
    if (invalidEl) invalidEl.textContent = invalidCount;

    // Table container visibility
    const tableSection = document.getElementById("parsedTableSection");
    const dropzoneSection = document.getElementById("dropzone");
    const proceedBtn = document.getElementById("proceedToStep2Btn");

    if (tableSection) {
      if (totalCount > 0) {
        tableSection.classList.remove("hidden");
      } else {
        tableSection.classList.add("hidden");
      }
    }

    if (proceedBtn) {
      proceedBtn.disabled = validCount === 0;
    }

    renderTable();
  }

  /**
   * Render table rows based on active filter and search query
   */
  function renderTable() {
    const tbody = document.getElementById("candidatesTableBody");
    if (!tbody) return;

    tbody.innerHTML = "";

    const filtered = parsedRows.filter(row => {
      // Filter logic
      if (activeFilter === "valid" && row.status !== "valid") return false;
      if (activeFilter === "invalid" && row.status === "valid") return false;

      // Search query logic
      if (searchQuery) {
        const matchName = row.name.toLowerCase().includes(searchQuery);
        const matchEmail = row.email.toLowerCase().includes(searchQuery);
        const matchCourse = row.course.toLowerCase().includes(searchQuery);
        const matchId = row.certId.toLowerCase().includes(searchQuery);
        return matchName || matchEmail || matchCourse || matchId;
      }

      return true;
    });

    if (filtered.length === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td colspan="7" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
          No candidate records match the active filter or search query.
        </td>
      `;
      tbody.appendChild(tr);
      return;
    }

    filtered.forEach((row, idx) => {
      const tr = document.createElement("tr");
      if (row.status === "invalid") {
        tr.classList.add("row-invalid");
      }

      let badgeHtml = "";
      if (row.status === "valid") {
        badgeHtml = `<span class="badge badge-valid"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Valid</span>`;
      } else {
        const errorMsg = row.errorDetails.join(", ");
        badgeHtml = `<span class="badge badge-invalid" title="${errorMsg}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> ${row.errorDetails[0] || "Invalid"}</span>`;
      }

      tr.innerHTML = `
        <td style="color: var(--text-muted); font-size: 0.8rem;">${row.rawIndex}</td>
        <td><strong>${escapeHtml(row.name || "—")}</strong></td>
        <td><span style="font-family: monospace; font-size: 0.85rem;">${escapeHtml(row.email || "—")}</span></td>
        <td style="max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(row.course)}">${escapeHtml(row.course)}</td>
        <td style="font-size: 0.8rem;">${escapeHtml(row.date)}</td>
        <td><span class="font-mono text-cyan" style="font-size: 0.82rem;">${escapeHtml(row.certId)}</span></td>
        <td>${badgeHtml}</td>
        <td style="text-align: right;">
          <button class="btn btn-sm btn-outline-danger btn-remove-row" data-id="${row.id}" title="Remove this record">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </td>
      `;

      tbody.appendChild(tr);
    });

    // Attach row delete handlers
    const deleteButtons = tbody.querySelectorAll(".btn-remove-row");
    deleteButtons.forEach(btn => {
      btn.addEventListener("click", (e) => {
        const rowId = btn.getAttribute("data-id");
        removeRow(rowId);
      });
    });
  }

  /**
   * Remove a single row by ID
   */
  function removeRow(rowId) {
    const index = parsedRows.findIndex(r => r.id === rowId);
    if (index !== -1) {
      const removed = parsedRows.splice(index, 1)[0];
      // Re-validate duplicates among remaining rows
      parseAndValidateRecords(parsedRows.map(r => ({
        Name: r.name,
        Email: r.email,
        Course: r.course,
        Date: r.date,
        "Certificate ID": r.certId
      })));
      UI.showToast("Record Removed", `Removed record for ${removed.name || "candidate"}.`, "info");
    }
  }

  /**
   * Set active table filter
   */
  function setFilter(filter) {
    activeFilter = filter;
    ["filterAllBtn", "filterValidBtn", "filterInvalidBtn"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove("btn-primary", "btn-secondary");
    });

    const activeBtnMap = {
      all: "filterAllBtn",
      valid: "filterValidBtn",
      invalid: "filterInvalidBtn"
    };

    const activeEl = document.getElementById(activeBtnMap[filter]);
    if (activeEl) {
      activeEl.classList.add("btn-primary");
    }

    renderTable();
  }

  /**
   * Generate and download sample Excel template (.xlsx)
   */
  function downloadSampleTemplate() {
    try {
      const sampleData = [
        {
          "Name": "Alex Morgan",
          "Email": "alex.morgan@example.com",
          "Course": "Advanced Cloud Architecture & Microservices",
          "Date": "October 26, 2026",
          "Certificate ID": "NX-2026-0001"
        },
        {
          "Name": "Sophia Chen",
          "Email": "sophia.chen@example.com",
          "Course": "Full-Stack Web Engineering & DevOps",
          "Date": "October 26, 2026",
          "Certificate ID": "NX-2026-0002"
        },
        {
          "Name": "Marcus Johnson",
          "Email": "marcus.j@example.com",
          "Course": "Enterprise Cybersecurity Fundamentals",
          "Date": "October 26, 2026",
          "Certificate ID": "NX-2026-0003"
        },
        {
          "Name": "Elena Rostova",
          "Email": "elena.r@example.com",
          "Course": "AI Engineering & Machine Learning Systems",
          "Date": "October 26, 2026",
          "Certificate ID": "NX-2026-0004"
        }
      ];

      const worksheet = XLSX.utils.json_to_sheet(sampleData);

      // Auto-fit column widths
      worksheet["!cols"] = [
        { wch: 22 }, // Name
        { wch: 30 }, // Email
        { wch: 45 }, // Course
        { wch: 20 }, // Date
        { wch: 18 }  // Certificate ID
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Candidates");

      XLSX.writeFile(workbook, "Certificate_Candidates_Sample_Template.xlsx");
      UI.showToast("Template Downloaded", "Sample .xlsx file saved to your device.", "success");
    } catch (err) {
      console.error("Failed to generate sample spreadsheet:", err);
      UI.showToast("Download Failed", "Unable to create sample Excel file.", "error");
    }
  }

  /**
   * Get all rows
   */
  function getAllRows() {
    return parsedRows;
  }

  /**
   * Get only valid rows
   */
  function getValidRows() {
    return parsedRows.filter(r => r.status === "valid");
  }

  function escapeHtml(text) {
    if (!text) return "";
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  return {
    init,
    getAllRows,
    getValidRows,
    downloadSampleTemplate,
    removeRow
  };
})();
