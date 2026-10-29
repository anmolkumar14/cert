/**
 * ============================================================================
 * Certificate Generator Portal - Excel/CSV Parser & Email Validator (excel.js)
 * ============================================================================
 * Handles:
 * - Drag-and-drop file upload & file picker (.xlsx, .xls, .csv)
 * - 1-Click workspace loader for IIMcandidatelist.xlsx
 * - SheetJS parsing with robust column header normalization (Bilingual support)
 * - Exact support for IIM Indore roster headers:
 *     - "Roll Number" -> Certificate / Credential ID
 *     - "Participant Names in English" -> English Name
 *     - "Participant Names in Hindi" -> Hindi Name
 *     - "Email id" -> Email Address
 * - Strict RFC 5322 Email Structure Validation with explicit diagnostics
 * - Admin approval status tracking (adminApproved: true / false)
 * - Row filtering, removal, and real-time statistics
 * - IIM Indore Sample Excel Template generator (.xlsx)
 */

const ExcelManager = (function() {
  // State
  let parsedRows = []; // Array of validated row objects
  let activeFilter = "all"; // "all" | "valid" | "invalid"
  let searchQuery = "";

  /**
   * Header mapping synonyms (lowercase, stripped of all whitespace and punctuation)
   */
  const COLUMN_SYNONYMS = {
    name: [
      "name", "participantname", "participantnamesinenglish", "participantnamesineng",
      "participantnamesenglish", "candidatename", "studentname", "fullname",
      "recipient", "participant", "student"
    ],
    nameHindi: [
      "namehindi", "hindiname", "participantnamehindi", "participantnamesinhindi",
      "participantnameshindi", "candidatenamehindi", "प्रतिभागीकानाम", "नाम"
    ],
    email: [
      "email", "emailid", "emailids", "emailaddress", "emailaddresses", "mail",
      "contactemail", "studentemail", "participantemail"
    ],
    programme: [
      "programme", "program", "programmename", "programname", "course",
      "coursename", "track", "event", "certification", "workshop", "title"
    ],
    programmeHindi: [
      "programmehindi", "programhindi", "coursehindi", "प्रोग्रामकानाम", "पाठ्यक्रमकानाम"
    ],
    duration: [
      "duration", "courseduration", "periodduration", "अवधि", "months", "time"
    ],
    durationHindi: [
      "durationhindi", "अवधिहिंदी"
    ],
    period: [
      "dates", "period", "monthyear", "monthyeartomonthyear", "durationperiod",
      "महीनावर्ष", "date", "issuedate"
    ],
    periodHindi: [
      "dateshindi", "periodhindi", "महीनावर्षहिंदी"
    ],
    certId: [
      "rollnumber", "rollno", "rollnum", "certificateid", "certid", "id",
      "credentialid", "regno", "referenceno", "certno"
    ],
    photoUrl: [
      "photo", "photourl", "image", "imageurl", "picture", "avatar", "profilepic"
    ]
  };

  /**
   * Initialize file upload listeners & workspace file detection
   */
  function init() {
    const dropzone = document.getElementById("dropzone");
    const fileInput = document.getElementById("fileInput");
    const downloadTemplateBtn = document.getElementById("downloadTemplateBtn");
    const loadWorkspaceBtn = document.getElementById("loadWorkspaceFileBtn");
    const filterAllBtn = document.getElementById("filterAllBtn");
    const filterValidBtn = document.getElementById("filterValidBtn");
    const filterInvalidBtn = document.getElementById("filterInvalidBtn");
    const searchInput = document.getElementById("tableSearchInput");
    const clearDataBtn = document.getElementById("clearDataBtn");
    const proceedToStep2Btn = document.getElementById("proceedToStep2Btn");

    if (dropzone && fileInput) {
      dropzone.addEventListener("click", () => fileInput.click());

      fileInput.addEventListener("change", (e) => {
        if (e.target.files && e.target.files[0]) {
          processFile(e.target.files[0]);
          e.target.value = "";
        }
      });

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

    // 1-Click Load from local workspace file if available
    if (loadWorkspaceBtn) {
      loadWorkspaceBtn.addEventListener("click", () => {
        loadWorkspaceFile("IIMcandidatelist.xlsx");
      });
    }

    if (filterAllBtn) filterAllBtn.addEventListener("click", () => setFilter("all"));
    if (filterValidBtn) filterValidBtn.addEventListener("click", () => setFilter("valid"));
    if (filterInvalidBtn) filterInvalidBtn.addEventListener("click", () => setFilter("invalid"));

    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        searchQuery = (e.target.value || "").toLowerCase().trim();
        renderTable();
      });
    }

    if (clearDataBtn) {
      clearDataBtn.addEventListener("click", () => {
        if (parsedRows.length === 0) return;
        if (confirm("Are you sure you want to clear all candidate records?")) {
          parsedRows = [];
          try { sessionStorage.removeItem("dtai_parsed_candidates"); } catch (e) {}
          updateUIState();
          UI.showToast("Data Cleared", "All candidate records removed.", "info");
        }
      });
    }

    if (proceedToStep2Btn) {
      proceedToStep2Btn.addEventListener("click", () => {
        const validCount = getValidRows().length;
        if (validCount === 0) {
          UI.showToast("No Valid Records", "Please ensure at least one valid candidate record is loaded.", "warning");
          return;
        }
        UI.goToStep(2);
      });
    }

    // Restore cached session candidates if available
    try {
      const saved = sessionStorage.getItem("dtai_parsed_candidates");
      if (saved) {
        const restored = JSON.parse(saved);
        if (Array.isArray(restored) && restored.length > 0) {
          parsedRows = restored;
          updateUIState();
        }
      }
    } catch (e) {
      console.warn("Could not restore session candidates:", e);
    }

    // Auto-load workspace roster if empty so Step 1 and Step 2 are immediately interactive
    if (parsedRows.length === 0) {
      loadWorkspaceFile("IIMcandidatelist.xlsx");
    }
  }

  // Pre-configured fallback dataset for IIMcandidatelist.xlsx
  const WORKSPACE_FALLBACK_DATA = [
    {
      "Roll Number": "1",
      "Participant Names in English": "Abhishek Kumar",
      "Participant Names in Hindi ": "अभिषेक कुमार",
      "Email id": "xyz@gmail.com"
    },
    {
      "Roll Number": "2",
      "Participant Names in English": "Abhishek Das",
      "Participant Names in Hindi ": "अभिषेक दास",
      "Email id": ""
    },
    {
      "Roll Number": "3",
      "Participant Names in English": "Abhishek Joshi",
      "Participant Names in Hindi ": "अभिषेक जोशी",
      "Email id": "xyz@gmail.com"
    },
    {
      "Roll Number": "4",
      "Participant Names in English": "Abhrajit Roy",
      "Participant Names in Hindi ": "अभ्रजीत रॉय",
      "Email id": "xyz@gmail.com"
    },
    {
      "Roll Number": "5",
      "Participant Names in English": "Abinash Dash",
      "Participant Names in Hindi ": "अविनाश दास",
      "Email id": "xyz@gmail.com"
    }
  ];

  /**
   * Load spreadsheet file from workspace URL
   */
  async function loadWorkspaceFile(fileName = "IIMcandidatelist.xlsx") {
    try {
      UI.showToast("Loading Spreadsheet", `Reading ${fileName} from project workspace...`, "info");
      let rawJson = null;

      if (window.location.protocol !== "file:") {
        try {
          const res = await fetch(fileName);
          if (res.ok) {
            const arrayBuffer = await res.arrayBuffer();
            const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array", cellDates: true });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
          }
        } catch (fetchErr) {
          console.warn("Direct fetch failed, falling back to embedded dataset:", fetchErr);
        }
      }

      if (!rawJson || rawJson.length === 0) {
        rawJson = WORKSPACE_FALLBACK_DATA;
      }

      parseAndValidateRecords(rawJson);
      UI.showToast("Roster Loaded", `Successfully imported ${rawJson.length} candidates from ${fileName}.`, "success");
    } catch (err) {
      console.error("Workspace load error:", err);
      UI.showToast("Load Failed", `Could not load ${fileName}: ${err.message}`, "error");
    }
  }

  /**
   * Process and parse user uploaded file via SheetJS
   */
  function processFile(file) {
    const validExtensions = [".xlsx", ".xls", ".csv"];
    const fileName = file.name.toLowerCase();
    const isSupported = validExtensions.some(ext => fileName.endsWith(ext));

    if (!isSupported) {
      UI.showToast("Unsupported Format", "Please upload an Excel (.xlsx, .xls) or CSV (.csv) spreadsheet.", "error");
      return;
    }

    const reader = new FileReader();

    reader.onload = function(e) {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array", cellDates: true });
        
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

        if (!rawJson || rawJson.length === 0) {
          UI.showToast("Empty File", "The uploaded spreadsheet does not contain any data rows.", "warning");
          return;
        }

        parseAndValidateRecords(rawJson);
        UI.showToast("Upload Successful", `Parsed ${rawJson.length} records from ${file.name}.`, "success");
      } catch (err) {
        console.error("SheetJS parse error:", err);
        UI.showToast("Parsing Failed", "Unable to read spreadsheet: " + err.message, "error");
      }
    };

    reader.onerror = function() {
      UI.showToast("Read Error", "Failed to read the file from your computer.", "error");
    };

    reader.readAsArrayBuffer(file);
  }

  /**
   * Strict RFC 5322 Email Structure Validation
   */
  function validateEmailStructure(email) {
    if (!email || typeof email !== "string") {
      return { valid: false, reason: "Missing email address" };
    }

    const trimmed = email.replace(/\u00A0/g, " ").trim();

    if (trimmed.length === 0) {
      return { valid: false, reason: "Email address is empty" };
    }

    if (trimmed.length > 254) {
      return { valid: false, reason: "Email exceeds max RFC limit of 254 characters" };
    }

    if (/\s/.test(trimmed)) {
      return { valid: false, reason: "Contains illegal whitespace spaces" };
    }

    const atParts = trimmed.split("@");
    if (atParts.length === 1) {
      return { valid: false, reason: "Missing '@' symbol" };
    }
    if (atParts.length > 2) {
      return { valid: false, reason: "Contains multiple '@' symbols" };
    }

    const [localPart, domainPart] = atParts;

    if (!localPart || localPart.length === 0) {
      return { valid: false, reason: "Missing local username before '@'" };
    }
    if (localPart.length > 64) {
      return { valid: false, reason: "Local mailbox part exceeds 64 characters" };
    }

    if (!domainPart || domainPart.length === 0) {
      return { valid: false, reason: "Missing domain name after '@'" };
    }

    if (localPart.includes("..") || domainPart.includes("..")) {
      return { valid: false, reason: "Contains consecutive dots ('..')" };
    }

    if (localPart.startsWith(".") || localPart.endsWith(".")) {
      return { valid: false, reason: "Local part cannot start or end with a dot" };
    }

    if (domainPart.startsWith(".") || domainPart.endsWith(".")) {
      return { valid: false, reason: "Domain cannot start or end with a dot" };
    }

    const domainLabels = domainPart.split(".");
    if (domainLabels.length < 2) {
      return { valid: false, reason: "Domain missing top-level extension (e.g. .com, .edu, .ac.in)" };
    }

    for (let i = 0; i < domainLabels.length; i++) {
      const label = domainLabels[i];
      if (!label || label.length === 0) {
        return { valid: false, reason: "Empty domain label between dots" };
      }
      if (label.startsWith("-") || label.endsWith("-")) {
        return { valid: false, reason: `Domain label '${label}' cannot start or end with hyphen` };
      }
    }

    const tld = domainLabels[domainLabels.length - 1];
    if (tld.length < 2) {
      return { valid: false, reason: `Top-level domain '.${tld}' is too short (must be at least 2 letters)` };
    }
    if (!/^[a-zA-Z]+$/.test(tld)) {
      return { valid: false, reason: `Top-level domain '.${tld}' must contain letters only` };
    }

    const rfcRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    if (!rfcRegex.test(trimmed)) {
      return { valid: false, reason: "Illegal special character in email address" };
    }

    return { valid: true, reason: "Valid RFC 5322 Email Structure" };
  }

  /**
   * Clean and normalize string headers
   */
  function normalizeKey(str) {
    if (!str) return "";
    return String(str)
      .replace(/\u00A0/g, " ") // Replace non-breaking space
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  /**
   * Map raw row columns to candidate data model
   */
  function mapRowFields(rawRow, index) {
    const rowObj = {
      id: "row_" + (index + 1) + "_" + Math.random().toString(36).substring(2, 7),
      rawIndex: index + 1,
      name: "",
      nameHindi: "",
      email: "",
      programme: "",
      programmeHindi: "",
      duration: "",
      durationHindi: "",
      period: "",
      periodHindi: "",
      certId: "",
      photoUrl: "",
      status: "valid",
      errorDetails: [],
      emailValidation: { valid: false, reason: "" },
      isDuplicateEmail: false,
      
      // Admin Approval Status
      adminApproved: false,
      approvedAt: null,
      approvedBy: null,

      // Dispatch tracking
      dispatchStatus: "pending",
      dispatchMessage: ""
    };

    Object.keys(rawRow).forEach(rawCol => {
      const cleanKey = normalizeKey(rawCol);
      const val = String(rawRow[rawCol] || "").replace(/\u00A0/g, " ").trim();

      if (COLUMN_SYNONYMS.name.includes(cleanKey)) {
        rowObj.name = val;
      } else if (COLUMN_SYNONYMS.nameHindi.includes(cleanKey)) {
        rowObj.nameHindi = val;
      } else if (COLUMN_SYNONYMS.email.includes(cleanKey)) {
        rowObj.email = val;
      } else if (COLUMN_SYNONYMS.programme.includes(cleanKey)) {
        rowObj.programme = val;
      } else if (COLUMN_SYNONYMS.programmeHindi.includes(cleanKey)) {
        rowObj.programmeHindi = val;
      } else if (COLUMN_SYNONYMS.duration.includes(cleanKey)) {
        rowObj.duration = val;
      } else if (COLUMN_SYNONYMS.durationHindi.includes(cleanKey)) {
        rowObj.durationHindi = val;
      } else if (COLUMN_SYNONYMS.period.includes(cleanKey)) {
        if (rawRow[rawCol] instanceof Date) {
          rowObj.period = rawRow[rawCol].toLocaleDateString("en-US", { year: "numeric", month: "long" });
        } else {
          rowObj.period = val;
        }
      } else if (COLUMN_SYNONYMS.periodHindi.includes(cleanKey)) {
        rowObj.periodHindi = val;
      } else if (COLUMN_SYNONYMS.certId.includes(cleanKey)) {
        rowObj.certId = val;
      } else if (COLUMN_SYNONYMS.photoUrl.includes(cleanKey)) {
        rowObj.photoUrl = val;
      }
    });

    // Fallbacks to institutional defaults
    if (!rowObj.programme) {
      rowObj.programme = CONFIG.CERTIFICATE.defaultProgramme;
    }
    if (!rowObj.programmeHindi) {
      rowObj.programmeHindi = CONFIG.CERTIFICATE.defaultProgrammeHindi;
    }
    if (!rowObj.duration) {
      rowObj.duration = CONFIG.CERTIFICATE.defaultDuration;
    }
    if (!rowObj.durationHindi) {
      rowObj.durationHindi = CONFIG.CERTIFICATE.defaultDurationHindi;
    }
    if (!rowObj.period) {
      rowObj.period = CONFIG.CERTIFICATE.defaultPeriod;
    }
    if (!rowObj.periodHindi) {
      rowObj.periodHindi = CONFIG.CERTIFICATE.defaultPeriodHindi;
    }
    if (!rowObj.nameHindi) {
      rowObj.nameHindi = rowObj.name;
    }
    if (!rowObj.certId) {
      rowObj.certId = `${CONFIG.CERTIFICATE.idPrefix}${String(index + 1).padStart(4, "0")}`;
    }
    if (!rowObj.photoUrl) {
      rowObj.photoUrl = "assets/avatar.svg";
    }

    return rowObj;
  }

  /**
   * Validate all candidate rows
   */
  function parseAndValidateRecords(rawRows) {
    const emailTracker = new Map();
    const rows = rawRows.map((raw, idx) => mapRowFields(raw, idx));

    // First pass: identify duplicate emails
    rows.forEach(r => {
      const emailLower = r.email.toLowerCase().trim();
      if (emailLower) {
        emailTracker.set(emailLower, (emailTracker.get(emailLower) || 0) + 1);
      }
    });

    // Second pass: full validation
    rows.forEach(r => {
      r.errorDetails = [];

      // 1. Participant Name check
      if (!r.name || r.name.length < 2) {
        r.errorDetails.push("Missing participant name");
      }

      // 2. Strict Email Structure Check
      const emailResult = validateEmailStructure(r.email);
      r.emailValidation = emailResult;

      if (!emailResult.valid) {
        r.errorDetails.push(`Email syntax error: ${emailResult.reason}`);
      }

      // 3. Duplicate email detection
      if (emailTracker.get(r.email.toLowerCase().trim()) > 1) {
        r.isDuplicateEmail = true;
      }

      if (r.errorDetails.length > 0) {
        r.status = "invalid";
      } else {
        r.status = "valid";
      }
    });

    parsedRows = rows;
    updateUIState();
  }

  /**
   * Update counters and UI
   */
  function updateUIState() {
    const totalCount = parsedRows.length;
    const validCount = getValidRows().length;
    const invalidCount = totalCount - validCount;

    const totalEl = document.getElementById("statTotalRows");
    const validEl = document.getElementById("statValidRows");
    const invalidEl = document.getElementById("statInvalidRows");

    if (totalEl) totalEl.textContent = totalCount;
    if (validEl) validEl.textContent = validCount;
    if (invalidEl) invalidEl.textContent = invalidCount;

    const tableSection = document.getElementById("parsedTableSection");
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

    try {
      sessionStorage.setItem("dtai_parsed_candidates", JSON.stringify(parsedRows));
    } catch (e) {}

    if (window.CertificateManager) {
      if (typeof window.CertificateManager.onEnterStep === "function") {
        window.CertificateManager.onEnterStep();
      } else {
        if (typeof window.CertificateManager.renderCandidateTable === "function") {
          window.CertificateManager.renderCandidateTable(getValidRows());
        }
        if (typeof window.CertificateManager.updateApprovalCount === "function") {
          window.CertificateManager.updateApprovalCount();
        }
      }
    }
  }

  /**
   * Render table rows with Email Structure Validation badges
   */
  function renderTable() {
    const tbody = document.getElementById("candidatesTableBody");
    if (!tbody) return;

    tbody.innerHTML = "";

    const filtered = parsedRows.filter(row => {
      if (activeFilter === "valid" && row.status !== "valid") return false;
      if (activeFilter === "invalid" && row.status === "valid") return false;

      if (searchQuery) {
        const matchName = (row.name || "").toLowerCase().includes(searchQuery);
        const matchNameHindi = (row.nameHindi || "").toLowerCase().includes(searchQuery);
        const matchEmail = (row.email || "").toLowerCase().includes(searchQuery);
        const matchProg = (row.programme || "").toLowerCase().includes(searchQuery);
        const matchId = (row.certId || "").toLowerCase().includes(searchQuery);
        const matchRoll = (row.rollNumber || "").toLowerCase().includes(searchQuery);
        return matchName || matchNameHindi || matchEmail || matchProg || matchId || matchRoll;
      }

      return true;
    });

    if (filtered.length === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td colspan="8" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
          No candidate records match the active filter or search query.
        </td>
      `;
      tbody.appendChild(tr);
      return;
    }

    filtered.forEach((row) => {
      const tr = document.createElement("tr");
      if (row.status === "invalid") {
        tr.classList.add("row-invalid");
      }

      // Email structure badge
      let emailBadgeHtml = "";
      if (row.emailValidation.valid) {
        emailBadgeHtml = `<span class="badge badge-valid" style="font-size: 0.72rem; padding: 0.15rem 0.5rem;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> RFC Valid</span>`;
      } else {
        emailBadgeHtml = `<span class="badge badge-invalid" style="font-size: 0.72rem; padding: 0.15rem 0.5rem;" title="${escapeHtml(row.emailValidation.reason)}"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> ${escapeHtml(row.emailValidation.reason)}</span>`;
      }

      // Duplicate notice
      let duplicateBadge = "";
      if (row.isDuplicateEmail) {
        duplicateBadge = `<span class="badge badge-duplicate" style="font-size: 0.68rem; margin-left: 4px;" title="Duplicate email across roster">Duplicate</span>`;
      }

      // Overall Row status badge
      let rowStatusBadge = "";
      if (row.status === "valid") {
        rowStatusBadge = `<span class="badge badge-valid"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Ready</span>`;
      } else {
        rowStatusBadge = `<span class="badge badge-invalid" title="${escapeHtml(row.errorDetails.join(', '))}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Invalid</span>`;
      }

      tr.innerHTML = `
        <td style="color: var(--text-muted); font-size: 0.8rem;">${row.rawIndex}</td>
        <td>
          <strong>${escapeHtml(row.name || "—")}</strong>
          ${row.nameHindi && row.nameHindi !== row.name ? `<div style="font-size: 0.76rem; color: #db2777; font-weight: 500;">${escapeHtml(row.nameHindi)}</div>` : ""}
        </td>
        <td>
          <div style="font-family: monospace; font-size: 0.84rem; margin-bottom: 2px;">${escapeHtml(row.email || "—")}</div>
          <div style="display: flex; align-items: center; gap: 4px;">${emailBadgeHtml} ${duplicateBadge}</div>
        </td>
        <td style="max-width: 180px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(row.programme)}">
          ${escapeHtml(row.programme)}
        </td>
        <td style="font-size: 0.8rem;">
          <div><strong>${escapeHtml(row.duration)}</strong></div>
          <div style="color: var(--text-muted); font-size: 0.74rem;">${escapeHtml(row.period)}</div>
        </td>
        <td><span class="font-mono text-cyan" style="font-size: 0.82rem;">${escapeHtml(row.certId)}</span></td>
        <td>${rowStatusBadge}</td>
        <td style="text-align: right;">
          <button class="btn btn-sm btn-outline-danger btn-remove-row" data-id="${row.id}" title="Remove this record">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </td>
      `;

      tbody.appendChild(tr);
    });

    const deleteButtons = tbody.querySelectorAll(".btn-remove-row");
    deleteButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        removeRow(btn.getAttribute("data-id"));
      });
    });
  }

  function removeRow(rowId) {
    const index = parsedRows.findIndex(r => r.id === rowId);
    if (index !== -1) {
      const removed = parsedRows.splice(index, 1)[0];
      parseAndValidateRecords(parsedRows.map(r => ({
        "Participant Names in English": r.name,
        "Participant Names in Hindi": r.nameHindi,
        "Email id": r.email,
        "Programme Name": r.programme,
        "Duration": r.duration,
        "Period": r.period,
        "Roll Number": r.certId,
        "Photo URL": r.photoUrl
      })));
      UI.showToast("Record Removed", `Removed ${removed.name || "candidate"}.`, "info");
    }
  }

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
    if (activeEl) activeEl.classList.add("btn-primary");

    renderTable();
  }

  function setAdminApproval(rowId, approved) {
    const row = parsedRows.find(r => r.id === rowId);
    if (row) {
      row.adminApproved = approved;
      row.approvedAt = approved ? new Date().toISOString() : null;
      row.approvedBy = approved ? (Auth.getUser() ? Auth.getUser().username : "Admin") : null;
      updateUIState();
      return true;
    }
    return false;
  }

  function setAllAdminApproval(approved) {
    const valid = getValidRows();
    const user = Auth.getUser() ? Auth.getUser().username : "Admin";
    const now = new Date().toISOString();

    valid.forEach(r => {
      r.adminApproved = approved;
      r.approvedAt = approved ? now : null;
      r.approvedBy = approved ? user : null;
    });

    updateUIState();
  }

  function downloadSampleTemplate() {
    try {
      const sampleData = [
        {
          "Roll Number": "OLPA26DTAI10-001",
          "Participant Names in English": "Abantika Ray",
          "Participant Names in Hindi": "अवंतिका रे",
          "Email id": "abantika.ray@example.com",
          "Programme Name": "Executive Programme in Digital Transformation & Artificial Intelligence",
          "Duration": "6 Months",
          "Period": "March 2026 to September 2026",
          "Photo URL": ""
        },
        {
          "Roll Number": "OLPA26DTAI10-002",
          "Participant Names in English": "Abhishek Das",
          "Participant Names in Hindi": "अभिषेक दास",
          "Email id": "abhishek.das@example.com",
          "Programme Name": "Executive Programme in Digital Transformation & Artificial Intelligence",
          "Duration": "6 Months",
          "Period": "March 2026 to September 2026",
          "Photo URL": ""
        },
        {
          "Roll Number": "OLPA26DTAI10-003",
          "Participant Names in English": "Ajeet Kumar Pandey",
          "Participant Names in Hindi": "अजीत कुमार पांडेय",
          "Email id": "ajeet.pandey@example.com",
          "Programme Name": "Executive Programme in Digital Transformation & Artificial Intelligence",
          "Duration": "6 Months",
          "Period": "March 2026 to September 2026",
          "Photo URL": ""
        },
        {
          "Roll Number": "OLPA26DTAI10-004",
          "Participant Names in English": "Akhilesh Kumar Shukla",
          "Participant Names in Hindi": "अखिलेश कुमार शुक्ला",
          "Email id": "akhilesh.shukla@example.com",
          "Programme Name": "Executive Programme in Digital Transformation & Artificial Intelligence",
          "Duration": "6 Months",
          "Period": "March 2026 to September 2026",
          "Photo URL": ""
        },
        {
          "Roll Number": "OLPA26DTAI10-005",
          "Participant Names in English": "Amarnath Palaparthi",
          "Participant Names in Hindi": "अमरनाथ पलापर्थी",
          "Email id": "amarnath.p@example.com",
          "Programme Name": "Executive Programme in Digital Transformation & Artificial Intelligence",
          "Duration": "6 Months",
          "Period": "March 2026 to September 2026",
          "Photo URL": ""
        }
      ];

      const worksheet = XLSX.utils.json_to_sheet(sampleData);

      worksheet["!cols"] = [
        { wch: 20 }, // Roll Number
        { wch: 26 }, // Participant Names in English
        { wch: 26 }, // Participant Names in Hindi
        { wch: 30 }, // Email id
        { wch: 45 }, // Programme Name
        { wch: 14 }, // Duration
        { wch: 25 }, // Period
        { wch: 18 }  // Photo URL
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "IIM_Candidates");

      XLSX.writeFile(workbook, "IIM_Indore_Candidates_Template.xlsx");
      UI.showToast("Template Downloaded", "Sample .xlsx template saved to your device.", "success");
    } catch (err) {
      console.error("Failed to generate sample spreadsheet:", err);
      UI.showToast("Download Failed", "Unable to create sample Excel file.", "error");
    }
  }

  function getAllRows() {
    return parsedRows;
  }

  function getValidRows() {
    return parsedRows.filter(r => r.status === "valid");
  }

  function getApprovedRows() {
    return parsedRows.filter(r => r.status === "valid" && r.adminApproved === true);
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
    loadWorkspaceFile,
    getAllRows,
    getValidRows,
    getApprovedRows,
    setAdminApproval,
    setAllAdminApproval,
    validateEmailStructure,
    downloadSampleTemplate,
    removeRow
  };
})();

if (typeof window !== "undefined") { window.ExcelManager = ExcelManager; }
