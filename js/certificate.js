/**
 * ============================================================================
 * DTAI Launchpad - Certificate Preview, Validation & PDF Engine (certificate.js)
 * ============================================================================
 * Created and Developed by Bodhidharma Lab
 * 
 * Features:
 * - Bilingual Hindi & English official IIM Indore certificate rendering
 * - Candidate review table with direct PDF download icon and instant preview
 * - Live Certificate Inspector Stage with smooth candidate navigation
 * - All Certificates Multi-Gallery mode (see all certificates on one screen)
 * - Dynamic QR Code generation client-side (via QRCode.js)
 * - Candidate photo rendering (with avatar fallback)
 * - Admin Approval Gating: Only approved candidates may proceed to email dispatch
 * - High-resolution PDF rendering via html2canvas & jsPDF (< 1 MB per PDF)
 * - Single PDF download & Batch ZIP export
 */

const CertificateManager = (function() {
  // Internal State
  let activeCandidate = null;
  let isGeneratingZip = false;
  let qrCodeInstance = null;
  let showWatermark = true;
  let currentViewMode = "table"; // 'table' | 'gallery'
  let currentFilterQuery = "";
  let activeTemplate = "iim-bilingual";

  try {
    const savedT = localStorage.getItem("dtai_selected_template");
    if (savedT) activeTemplate = savedT;
  } catch (e) {}

  /**
   * Initialize Step 2 event bindings
   */
  function init() {
    const downloadSinglePdfBtn = document.getElementById("downloadSinglePdfBtn");
    const downloadAllZipBtn = document.getElementById("downloadAllZipBtn");
    const backToStep1Btn = document.getElementById("backToStep1Btn");
    const proceedToStep3Btn = document.getElementById("proceedToStep3Btn");
    const proceedToStep3BottomBtn = document.getElementById("proceedToStep3BottomBtn");
    const approveCurrentBtn = document.getElementById("approveCurrentCandidateBtn");
    const revokeApprovalBtn = document.getElementById("revokeApprovalBtn");
    const approveAllBtn = document.getElementById("approveAllCandidatesBtn");
    const toggleWatermarkBtn = document.getElementById("toggleWatermarkBtn");
    const prevCandidateBtn = document.getElementById("prevCandidateBtn");
    const nextCandidateBtn = document.getElementById("nextCandidateBtn");
    const viewModeTableBtn = document.getElementById("viewModeTableBtn");
    const viewModeGalleryBtn = document.getElementById("viewModeGalleryBtn");
    const candidateFilterInput = document.getElementById("step2CandidateFilter");

    // Single PDF Download
    if (downloadSinglePdfBtn) {
      downloadSinglePdfBtn.addEventListener("click", () => {
        if (!activeCandidate) {
          UI.showToast("No Recipient Selected", "Please select a candidate to generate their certificate.", "warning");
          return;
        }
        downloadSinglePdf(activeCandidate);
      });
    }

    // Batch ZIP Export
    if (downloadAllZipBtn) {
      downloadAllZipBtn.addEventListener("click", downloadAllCertificatesZip);
    }

    // Navigation back to Step 1
    if (backToStep1Btn) {
      backToStep1Btn.addEventListener("click", () => UI.goToStep(1));
    }

    // Proceed to Step 3 Handlers
    const handleProceedToStep3 = () => {
      const approvedCount = ExcelManager.getApprovedRows().length;
      if (approvedCount === 0) {
        UI.showToast(
          "Admin Validation Required",
          "Please validate & approve at least one candidate preview before proceeding to email dispatch.",
          "warning"
        );
        return;
      }
      UI.goToStep(3);
    };

    if (proceedToStep3Btn) proceedToStep3Btn.addEventListener("click", handleProceedToStep3);
    if (proceedToStep3BottomBtn) proceedToStep3BottomBtn.addEventListener("click", handleProceedToStep3);

    // Admin Approval Handlers
    if (approveCurrentBtn) {
      approveCurrentBtn.addEventListener("click", () => {
        if (!activeCandidate) return;
        ExcelManager.setAdminApproval(activeCandidate.id, true);
        activeCandidate.adminApproved = true;
        updateApprovalStateUI(activeCandidate);
        renderCandidateTable(getFilteredCandidates());
        updateApprovalCount();
        UI.showToast("Candidate Approved", `Certificate for ${activeCandidate.name} validated for email dispatch.`, "success");
      });
    }

    if (revokeApprovalBtn) {
      revokeApprovalBtn.addEventListener("click", () => {
        if (!activeCandidate) return;
        ExcelManager.setAdminApproval(activeCandidate.id, false);
        activeCandidate.adminApproved = false;
        updateApprovalStateUI(activeCandidate);
        renderCandidateTable(getFilteredCandidates());
        updateApprovalCount();
        UI.showToast("Approval Revoked", `Approval removed for ${activeCandidate.name}.`, "info");
      });
    }

    if (approveAllBtn) {
      approveAllBtn.addEventListener("click", () => {
        const validRows = ExcelManager.getValidRows();
        if (validRows.length === 0) return;
        ExcelManager.setAllAdminApproval(true);
        if (activeCandidate) {
          activeCandidate.adminApproved = true;
          updateApprovalStateUI(activeCandidate);
        }
        renderCandidateTable(getFilteredCandidates());
        if (currentViewMode === "gallery") {
          renderCertificatesGallery(getFilteredCandidates());
        }
        updateApprovalCount();
        UI.showToast("All Approved", `Validated all ${validRows.length} candidates for email dispatch.`, "success");
        UI.celebrateConfetti();
      });
    }

    // Watermark Toggle
    if (toggleWatermarkBtn) {
      toggleWatermarkBtn.addEventListener("click", () => {
        showWatermark = !showWatermark;
        const watermarkEl = document.getElementById("certSampleWatermark");
        if (watermarkEl) {
          watermarkEl.style.display = showWatermark ? "block" : "none";
        }
        toggleWatermarkBtn.textContent = showWatermark ? "Hide Watermark" : "Show Watermark";
      });
    }

    // Candidate Stepper Prev / Next
    if (prevCandidateBtn) {
      prevCandidateBtn.addEventListener("click", () => navigateCandidate(-1));
    }
    if (nextCandidateBtn) {
      nextCandidateBtn.addEventListener("click", () => navigateCandidate(1));
    }

    // View Mode Switcher (Table vs Multi-Gallery)
    if (viewModeTableBtn) {
      viewModeTableBtn.addEventListener("click", () => setViewMode("table"));
    }
    if (viewModeGalleryBtn) {
      viewModeGalleryBtn.addEventListener("click", () => setViewMode("gallery"));
    }

    // Candidate Search Filter
    if (candidateFilterInput) {
      candidateFilterInput.addEventListener("input", (e) => {
        currentFilterQuery = (e.target.value || "").trim().toLowerCase();
        renderCandidateTable(getFilteredCandidates());
        if (currentViewMode === "gallery") {
          renderCertificatesGallery(getFilteredCandidates());
        }
      });
    }

    // Inspector Direct Student Search
    const inspectorSearch = document.getElementById("inspectorStudentSearch");
    if (inspectorSearch) {
      inspectorSearch.addEventListener("input", (e) => {
        currentFilterQuery = (e.target.value || "").trim().toLowerCase();
        if (candidateFilterInput) candidateFilterInput.value = e.target.value;
        const filtered = getFilteredCandidates();
        renderCandidateTable(filtered);
        if (filtered.length > 0) {
          selectCandidate(filtered[0].id);
        }
        if (currentViewMode === "gallery") {
          renderCertificatesGallery(filtered);
        }
      });
    }

    // Mobile Viewport Scale Toggle
    const mobileScaleBtn = document.getElementById("mobileScaleToggleBtn");
    const mobileScaleText = document.getElementById("mobileScaleBtnText");
    let isMobileFit = false;

    if (mobileScaleBtn) {
      mobileScaleBtn.addEventListener("click", () => {
        isMobileFit = !isMobileFit;
        const certFrames = document.querySelectorAll(".certificate-frame-wrap");
        certFrames.forEach(f => f.classList.toggle("mobile-cert-fit", isMobileFit));
        if (mobileScaleText) {
          mobileScaleText.textContent = isMobileFit ? "🔍 Full Size" : "📱 Fit Screen";
        }
        UI.showToast("Mobile View", isMobileFit ? "Scaled certificate to fit screen cleanly." : "Restored full-size landscape canvas.", "info");
      });
    }

    // Certificate Template Triggers & Modal
    const selectTemplateBtn = document.getElementById("selectTemplateBtn");
    const step2TemplateBtn = document.getElementById("step2TemplateBtn");
    const closeTemplateModalBtn = document.getElementById("closeTemplateModalBtn");
    const cancelTemplateBtn = document.getElementById("cancelTemplateBtn");
    const templateModal = document.getElementById("templateModal");

    const openTemplateModal = () => {
      if (templateModal) templateModal.classList.remove("hidden");
    };

    const closeTemplateModal = () => {
      if (templateModal) templateModal.classList.add("hidden");
    };

    if (selectTemplateBtn) selectTemplateBtn.addEventListener("click", openTemplateModal);
    if (step2TemplateBtn) step2TemplateBtn.addEventListener("click", openTemplateModal);
    if (closeTemplateModalBtn) closeTemplateModalBtn.addEventListener("click", closeTemplateModal);
    if (cancelTemplateBtn) cancelTemplateBtn.addEventListener("click", closeTemplateModal);

    if (templateModal) {
      templateModal.addEventListener("click", (e) => {
        if (e.target === templateModal) closeTemplateModal();
      });
    }

    // Template Cards Selection
    document.querySelectorAll(".template-card").forEach(card => {
      card.addEventListener("click", () => {
        const tId = card.dataset.templateId;
        if (tId) {
          setTemplate(tId);
          closeTemplateModal();
        }
      });
    });

    // Apply default/saved template
    setTemplate(activeTemplate, false);
  }

  /**
   * Change Active Certificate Template
   */
  function setTemplate(templateId, showToast = true) {
    activeTemplate = templateId;
    try {
      localStorage.setItem("dtai_selected_template", templateId);
    } catch (e) {}

    const certElement = document.getElementById("certificateCanvas");
    if (certElement) {
      certElement.dataset.template = templateId;
    }

    // Update button text
    const labelEl = document.getElementById("currentTemplateLabel");
    const tConfig = (CONFIG.CERTIFICATE.templates || []).find(t => t.id === templateId);
    if (labelEl) {
      labelEl.textContent = tConfig ? tConfig.name : templateId;
    }

    // Update active state in modal
    document.querySelectorAll(".template-card").forEach(card => {
      if (card.dataset.templateId === templateId) {
        card.classList.add("active");
        const b = card.querySelector(".template-card-badge");
        if (b) b.textContent = "Active";
      } else {
        card.classList.remove("active");
        const b = card.querySelector(".template-card-badge");
        if (b) b.textContent = "Select";
      }
    });

    // Update gallery if visible
    if (currentViewMode === "gallery") {
      renderCertificatesGallery(getFilteredCandidates());
    }

    if (showToast) {
      UI.showToast("Template Selected", `Applied: ${tConfig ? tConfig.name : templateId}`, "success");
    }
  }

  /**
   * Filter candidates based on search input
   */
  function getFilteredCandidates() {
    const validRows = ExcelManager.getValidRows();
    if (!currentFilterQuery) return validRows;

    return validRows.filter(cand => {
      const name = (cand.name || "").toLowerCase();
      const nameHindi = (cand.nameHindi || "").toLowerCase();
      const email = (cand.email || "").toLowerCase();
      const certId = (cand.certId || "").toLowerCase();
      const rollNo = (cand.rollNo || "").toLowerCase();
      return name.includes(currentFilterQuery) ||
             nameHindi.includes(currentFilterQuery) ||
             email.includes(currentFilterQuery) ||
             certId.includes(currentFilterQuery) ||
             rollNo.includes(currentFilterQuery);
    });
  }

  /**
   * Called whenever user navigates to Step 2
   */
  function onEnterStep() {
    let validRows = ExcelManager.getValidRows();
    if (validRows.length === 0) {
      ExcelManager.loadWorkspaceFile("IIMcandidatelist.xlsx");
      validRows = ExcelManager.getValidRows();
    }

    if (validRows.length > 0) {
      if (!activeCandidate || !validRows.some(r => r.id === activeCandidate.id)) {
        activeCandidate = validRows[0];
      }
      renderCandidateTable(getFilteredCandidates());
      updateCertificatePreview(activeCandidate);
      updateApprovalStateUI(activeCandidate);
      updateApprovalCount();

      if (currentViewMode === "gallery") {
        renderCertificatesGallery(getFilteredCandidates());
      }
    }
  }

  /**
   * Populate Candidate Review Table with PDF download and preview actions
   */
  function renderCandidateTable(candidates) {
    const tbody = document.getElementById("step2TableBody");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (candidates.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 2rem; color: var(--text-muted);">
            No matching candidates found for "<strong>${escapeHtml(currentFilterQuery)}</strong>".
          </td>
        </tr>
      `;
      return;
    }

    candidates.forEach((cand, index) => {
      const tr = document.createElement("tr");
      tr.dataset.candidateId = cand.id;
      if (activeCandidate && activeCandidate.id === cand.id) {
        tr.classList.add("active-preview-row");
      }

      const isApproved = cand.adminApproved === true;
      const approvalBadge = isApproved
        ? `<span class="approval-badge-approved"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Approved</span>`
        : `<span class="approval-badge-pending"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Pending</span>`;

      tr.innerHTML = `
        <td style="font-weight: 600; color: var(--text-muted);">${cand.rollNo || (index + 1)}</td>
        <td>
          <div style="font-weight: 700; color: var(--text-primary); font-size: 0.92rem;">${escapeHtml(cand.name)}</div>
          ${cand.nameHindi ? `<div style="font-size: 0.78rem; color: var(--accent-magenta); font-family: 'Tiro Devanagari Hindi', serif; margin-top: 2px;">${escapeHtml(cand.nameHindi)}</div>` : ""}
        </td>
        <td>
          <div style="font-size: 0.85rem; color: var(--text-secondary);">${escapeHtml(cand.email || "—")}</div>
          <span style="font-size: 0.68rem; color: #10b981; font-weight: 600;">&#10003; Verified RFC Format</span>
        </td>
        <td>
          <code style="font-size: 0.76rem; color: var(--accent-primary); font-family: monospace;">${escapeHtml(cand.certId)}</code>
        </td>
        <td>
          ${approvalBadge}
        </td>
        <td style="text-align: center;">
          <button class="btn-pdf-row" data-action="download-pdf" data-id="${cand.id}" title="Download PDF certificate for ${escapeHtml(cand.name)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            <span>PDF</span>
          </button>
        </td>
        <td style="text-align: center;">
          <button class="btn-preview-row" data-action="preview" data-id="${cand.id}" title="Preview certificate below">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            <span>Preview</span>
          </button>
        </td>
        <td style="text-align: right;">
          <button class="btn-approve-row ${isApproved ? 'is-approved' : ''}" data-action="toggle-approval" data-id="${cand.id}" title="${isApproved ? 'Click to revoke approval' : 'Click to approve for emailing'}">
            ${isApproved 
              ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Approved` 
              : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Approve`}
          </button>
        </td>
      `;

      // Click on row to preview
      tr.addEventListener("click", (e) => {
        const actionBtn = e.target.closest("button");
        if (actionBtn) {
          const action = actionBtn.getAttribute("data-action");
          if (action === "download-pdf") {
            downloadCandidatePdf(cand.id);
            return;
          }
          if (action === "preview") {
            selectCandidate(cand.id, true);
            return;
          }
          if (action === "toggle-approval") {
            toggleCandidateApproval(cand.id);
            return;
          }
        }
        // If clicking anywhere else on the row, select candidate without forced scroll
        selectCandidate(cand.id, false);
      });

      tbody.appendChild(tr);
    });

    updateApprovalCount();
  }

  /**
   * Select a candidate, update preview, and optionally scroll to the inspector stage
   */
  function selectCandidate(candidateId, shouldScroll = false) {
    const validRows = ExcelManager.getValidRows();
    const cand = validRows.find(c => c.id === candidateId);
    if (!cand) return;

    activeCandidate = cand;
    updateCertificatePreview(cand);
    updateApprovalStateUI(cand);

    // Update active highlight on table rows
    const tbody = document.getElementById("step2TableBody");
    if (tbody) {
      tbody.querySelectorAll("tr").forEach(tr => {
        tr.classList.toggle("active-preview-row", tr.dataset.candidateId === candidateId);
      });
    }

    // Scroll to inspector stage if requested
    if (shouldScroll) {
      const stage = document.getElementById("certificateInspectorStage");
      if (stage) {
        stage.scrollIntoView({ behavior: "smooth", block: "center" });
        stage.classList.remove("flash-pulse");
        void stage.offsetWidth;
        stage.classList.add("flash-pulse");
      }
    }
  }

  /**
   * Navigate to next or previous candidate
   */
  function navigateCandidate(direction) {
    const validRows = ExcelManager.getValidRows();
    if (validRows.length === 0) return;

    const currentIndex = validRows.findIndex(c => c.id === (activeCandidate ? activeCandidate.id : ""));
    let nextIndex = currentIndex + direction;

    if (nextIndex < 0) nextIndex = validRows.length - 1;
    if (nextIndex >= validRows.length) nextIndex = 0;

    const nextCand = validRows[nextIndex];
    selectCandidate(nextCand.id, true);
  }

  /**
   * Download PDF for a specific candidate ID directly from table row
   */
  async function downloadCandidatePdf(candidateId) {
    const validRows = ExcelManager.getValidRows();
    const cand = validRows.find(c => c.id === candidateId);
    if (!cand) return;

    await downloadSinglePdf(cand);
  }

  /**
   * Toggle admin approval state for an individual candidate
   */
  function toggleCandidateApproval(candidateId) {
    const validRows = ExcelManager.getValidRows();
    const cand = validRows.find(c => c.id === candidateId);
    if (!cand) return;

    const newState = !cand.adminApproved;
    ExcelManager.setAdminApproval(candidateId, newState);
    cand.adminApproved = newState;

    if (activeCandidate && activeCandidate.id === candidateId) {
      activeCandidate.adminApproved = newState;
      updateApprovalStateUI(cand);
    }

    renderCandidateTable(getFilteredCandidates());
    if (currentViewMode === "gallery") {
      renderCertificatesGallery(getFilteredCandidates());
    }
    updateApprovalCount();

    if (newState) {
      UI.showToast("Candidate Approved", `Certificate for ${cand.name} validated for email dispatch.`, "success");
    } else {
      UI.showToast("Approval Revoked", `Approval removed for ${cand.name}.`, "info");
    }
  }

  /**
   * Switch View Mode: Table & Inspector vs All Certificates Gallery
   */
  function setViewMode(mode) {
    currentViewMode = mode;
    const tableSection = document.getElementById("step2TableInspectorSection");
    const gallerySection = document.getElementById("step2GallerySection");
    const tableBtn = document.getElementById("viewModeTableBtn");
    const galleryBtn = document.getElementById("viewModeGalleryBtn");

    if (mode === "gallery") {
      if (tableSection) tableSection.classList.add("hidden");
      if (gallerySection) {
        gallerySection.classList.remove("hidden");
        renderCertificatesGallery(getFilteredCandidates());
      }
      if (tableBtn) tableBtn.classList.remove("active");
      if (galleryBtn) galleryBtn.classList.add("active");
    } else {
      if (tableSection) tableSection.classList.remove("hidden");
      if (gallerySection) gallerySection.classList.add("hidden");
      if (tableBtn) tableBtn.classList.add("active");
      if (galleryBtn) galleryBtn.classList.remove("active");
    }
  }

  /**
   * Render All Certificates Gallery so the admin can see certificates for ALL candidates loaded in that screen itself
   */
  function renderCertificatesGallery(candidates) {
    const galleryContainer = document.getElementById("step2GallerySection");
    if (!galleryContainer) return;

    galleryContainer.innerHTML = "";

    if (candidates.length === 0) {
      galleryContainer.innerHTML = `
        <div class="glass-card" style="padding: 3rem; text-align: center; color: var(--text-muted); width: 100%;">
          No candidates available to display in gallery.
        </div>
      `;
      return;
    }

    candidates.forEach((cand, idx) => {
      const isApproved = cand.adminApproved === true;
      const card = document.createElement("div");
      card.className = "gallery-cert-card glass-card";

      card.innerHTML = `
        <div class="gallery-card-header">
          <div>
            <div style="display: flex; align-items: center; gap: 0.6rem;">
              <span style="font-size: 1.15rem; font-weight: 700;">#${cand.rollNo || (idx + 1)}. ${escapeHtml(cand.name)}</span>
              ${cand.nameHindi ? `<span style="font-size: 0.95rem; color: var(--accent-magenta); font-family: 'Tiro Devanagari Hindi', serif;">(${escapeHtml(cand.nameHindi)})</span>` : ""}
            </div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">
              Email: <strong>${escapeHtml(cand.email || "—")}</strong> &bull; Credential ID: <code style="color: var(--accent-primary);">${escapeHtml(cand.certId)}</code>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <button class="btn-pdf-row" onclick="CertificateManager.downloadCandidatePdf('${cand.id}')" title="Download PDF">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              <span>Download PDF</span>
            </button>

            <button class="btn-approve-row ${isApproved ? 'is-approved' : ''}" onclick="CertificateManager.toggleCandidateApproval('${cand.id}')">
              ${isApproved 
                ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Validated & Approved` 
                : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Validate & Approve`}
            </button>
          </div>
        </div>

        <!-- Rendered Certificate Card Frame -->
        <div class="certificate-frame-wrap" style="transform: scale(0.96); transform-origin: top center;">
          <div class="certificate-canvas" data-template="${activeTemplate}">
            <div class="cert-iim-border-outer"></div>
            <div class="cert-iim-border-inner"></div>

            <div class="cert-corner-step cert-corner-step-tl"></div>
            <div class="cert-corner-step cert-corner-step-tr"></div>
            <div class="cert-corner-step cert-corner-step-bl"></div>
            <div class="cert-corner-step cert-corner-step-br"></div>

            <div class="cert-top-header">
              <div class="cert-header-left">
                <img src="assets/logo.svg" alt="IIM Indore Logo" class="cert-inst-logo">
              </div>

              <div class="cert-header-center">
                <div class="cert-title-hindi">भारतीय प्रबंध संस्थान इंदौर</div>
                <div class="cert-title-english">INDIAN INSTITUTE OF MANAGEMENT INDORE</div>
                <div class="cert-header-rule"></div>
              </div>

              <div class="cert-header-right">
                <div class="cert-photo-frame" title="Participant Photo">
                  <img src="assets/avatar.svg" alt="Photo" class="cert-photo-img">
                </div>
                <div class="cert-qr-frame" id="gallery_qr_${cand.id}"></div>
              </div>
            </div>

            <div class="cert-bilingual-body">
              <div class="cert-section-hindi">
                <div>प्रमाणित किया जाता है कि</div>
                <div class="cert-pname-hindi">${escapeHtml(cand.nameHindi || cand.name)}</div>
                <div>ने <strong>${escapeHtml(cand.periodHindi || CONFIG.CERTIFICATE.defaultPeriodHindi)}</strong> के दौरान</div>
                <div>भारतीय प्रबंध संस्थान इंदौर द्वारा आयोजित <strong>${escapeHtml(cand.durationHindi || CONFIG.CERTIFICATE.defaultDurationHindi)}</strong> का ऑनलाइन (एसिंक्रोनस)</div>
                <div class="cert-prog-hindi">${escapeHtml(cand.programmeHindi || CONFIG.CERTIFICATE.defaultProgrammeHindi)}</div>
                <div>सफलतापूर्वक पूर्ण किया।</div>
              </div>

              <div class="cert-section-english">
                <div>This is to certify that</div>
                <div class="cert-pname-english">${escapeHtml(cand.name)}</div>
                <div>has successfully completed the <strong class="cert-highlight">${escapeHtml(cand.duration || CONFIG.CERTIFICATE.defaultDuration)}</strong> online (asynchronous)</div>
                <div class="cert-prog-english">${escapeHtml(cand.programme || CONFIG.CERTIFICATE.defaultProgramme)}</div>
                <div>conducted by</div>
                <div>the Indian Institute of Management Indore</div>
                <div>during <strong class="cert-highlight">${escapeHtml(cand.period || CONFIG.CERTIFICATE.defaultPeriod)}</strong>.</div>
              </div>
            </div>

            <div class="cert-signatures-grid">
              <div class="cert-sig-item">
                <div class="cert-sig-script">S. R. Sharma</div>
                <div class="cert-sig-divider"></div>
                <div class="cert-sig-hindi">कार्यक्रम समन्वयक</div>
                <div class="cert-sig-english">Programme Coordinator</div>
              </div>
              <div class="cert-sig-item">
                <div class="cert-sig-script">Ananya Gupta</div>
                <div class="cert-sig-divider"></div>
                <div class="cert-sig-hindi">अध्यक्ष, कार्यपालक शिक्षा</div>
                <div class="cert-sig-english">Chairperson, Executive Education</div>
              </div>
              <div class="cert-sig-item">
                <div class="cert-sig-script">Himanshu Rai</div>
                <div class="cert-sig-divider"></div>
                <div class="cert-sig-hindi">निदेशक, भा. प्र. सं. इंदौर</div>
                <div class="cert-sig-english">Director, IIM Indore</div>
              </div>
            </div>

            <div class="cert-bottom-bar">
              <span>Executive Education Office, IIM Indore</span>
              <span>Credential ID: <strong style="font-family: monospace;">${escapeHtml(cand.certId)}</strong></span>
            </div>
          </div>
        </div>
      `;

      galleryContainer.appendChild(card);

      // Render individual QR code
      setTimeout(() => {
        const qrEl = document.getElementById(`gallery_qr_${cand.id}`);
        if (qrEl && typeof QRCode === "function") {
          const verifyUrl = `${CONFIG.ORGANIZATION.verifyUrlBase}${encodeURIComponent(cand.certId)}`;
          new QRCode(qrEl, {
            text: verifyUrl,
            width: 60,
            height: 60,
            colorDark: "#1e293b",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.M
          });
        }
      }, 20);
    });
  }

  /**
   * Update admin approval status badge and action buttons for the current candidate
   */
  function updateApprovalStateUI(candidate) {
    if (!candidate) return;

    const badgeContainer = document.getElementById("currentCandidateApprovalBadge");
    const approveBtn = document.getElementById("approveCurrentCandidateBtn");
    const revokeBtn = document.getElementById("revokeApprovalBtn");
    const candidateNameLabel = document.getElementById("approvalCandidateName");
    const indexIndicator = document.getElementById("candidateIndexIndicator");

    if (candidateNameLabel) {
      candidateNameLabel.textContent = `${candidate.name}${candidate.nameHindi ? ` (${candidate.nameHindi})` : ''}`;
    }

    const isApproved = candidate.adminApproved === true;

    if (badgeContainer) {
      badgeContainer.innerHTML = isApproved
        ? `<span class="approval-badge-approved"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Validated & Approved by Admin</span>`
        : `<span class="approval-badge-pending"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Awaiting Admin Validation</span>`;
    }

    if (approveBtn) {
      approveBtn.style.display = isApproved ? "none" : "inline-flex";
    }
    if (revokeBtn) {
      revokeBtn.style.display = isApproved ? "inline-flex" : "none";
    }

    // Update index indicator (e.g. 1 / 5)
    const validRows = ExcelManager.getValidRows();
    const currIdx = validRows.findIndex(c => c.id === candidate.id);
    if (indexIndicator && currIdx !== -1) {
      indexIndicator.textContent = `${currIdx + 1} / ${validRows.length}`;
    }

    // Step 3 Proceed button status
    const proceedToStep3Btn = document.getElementById("proceedToStep3Btn");
    const proceedToStep3BottomBtn = document.getElementById("proceedToStep3BottomBtn");
    const approvedCount = ExcelManager.getApprovedRows().length;
    const buttonText = `Dispatch Emails (${approvedCount} Approved) \u2192`;
    if (proceedToStep3Btn) proceedToStep3Btn.textContent = buttonText;
    if (proceedToStep3BottomBtn) proceedToStep3BottomBtn.textContent = buttonText;
  }

  /**
   * Update top summary counts in bar
   */
  function updateApprovalCount() {
    const validCount = ExcelManager.getValidRows().length;
    const approvedCount = ExcelManager.getApprovedRows().length;
    const pendingCount = validCount - approvedCount;

    const totalEl = document.getElementById("step2TotalCount");
    const approvedEl = document.getElementById("step2ApprovedCount");
    const pendingEl = document.getElementById("step2PendingCount");

    if (totalEl) totalEl.textContent = validCount;
    if (approvedEl) approvedEl.textContent = approvedCount;
    if (pendingEl) pendingEl.textContent = pendingCount;
  }

  /**
   * Update DOM certificate template with candidate data
   */
  function updateCertificatePreview(candidate) {
    if (!candidate) return;

    // Hindi fields
    const pNameHindiEl = document.getElementById("certParticipantHindi");
    const progHindiEl = document.getElementById("certProgrammeHindi");
    const durHindiEl = document.getElementById("certDurationHindi");
    const perHindiEl = document.getElementById("certPeriodHindi");

    // English fields
    const pNameEngEl = document.getElementById("certRecipientName");
    const progEngEl = document.getElementById("certProgrammeEnglish");
    const durEngEl = document.getElementById("certDurationEnglish");
    const perEngEl = document.getElementById("certPeriodEnglish");

    // Meta & ID fields
    const certIdEl = document.getElementById("certCredentialId");
    const photoImgEl = document.getElementById("certParticipantPhoto");

    if (pNameHindiEl) pNameHindiEl.textContent = candidate.nameHindi || candidate.name;
    if (progHindiEl) progHindiEl.textContent = candidate.programmeHindi || CONFIG.CERTIFICATE.defaultProgrammeHindi;
    if (durHindiEl) durHindiEl.textContent = candidate.durationHindi || candidate.duration || CONFIG.CERTIFICATE.defaultDurationHindi;
    if (perHindiEl) perHindiEl.textContent = candidate.periodHindi || candidate.period || CONFIG.CERTIFICATE.defaultPeriodHindi;

    if (pNameEngEl) pNameEngEl.textContent = candidate.name || "Name of Participant";
    if (progEngEl) progEngEl.textContent = candidate.programme || CONFIG.CERTIFICATE.defaultProgramme;
    if (durEngEl) durEngEl.textContent = candidate.duration || CONFIG.CERTIFICATE.defaultDuration;
    if (perEngEl) perEngEl.textContent = candidate.period || CONFIG.CERTIFICATE.defaultPeriod;

    if (certIdEl) certIdEl.textContent = candidate.certId || "IIMI-EP-2026-0001";

    // Dynamic Font Scaling for very long names
    if (pNameEngEl) {
      const len = (candidate.name || "").length;
      if (len > 30) {
        pNameEngEl.style.fontSize = "1.3rem";
      } else if (len > 24) {
        pNameEngEl.style.fontSize = "1.5rem";
      } else {
        pNameEngEl.style.fontSize = "1.85rem";
      }
    }

    if (pNameHindiEl) {
      const lenH = (candidate.nameHindi || "").length;
      if (lenH > 30) {
        pNameHindiEl.style.fontSize = "1.15rem";
      } else {
        pNameHindiEl.style.fontSize = "1.45rem";
      }
    }

    // Photo placeholder
    if (photoImgEl) {
      photoImgEl.src = candidate.photoUrl || "assets/avatar.svg";
    }

    // Generate Verification QR Code via QRCode.js
    generateQrCode(candidate.certId);
  }

  /**
   * Dynamic QR Code Generation
   */
  function generateQrCode(certId) {
    const qrContainer = document.getElementById("certQrCode");
    if (!qrContainer) return;

    qrContainer.innerHTML = "";

    const verifyUrl = `${CONFIG.ORGANIZATION.verifyUrlBase}${encodeURIComponent(certId || "IIMI-EP-2026-0001")}`;

    try {
      if (typeof QRCode !== "undefined") {
        qrCodeInstance = new QRCode(qrContainer, {
          text: verifyUrl,
          width: 72,
          height: 72,
          colorDark: "#1e293b",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.M
        });
      } else {
        qrContainer.innerHTML = `
          <div style="font-size: 8px; font-family: monospace; text-align: center; color: #64748b; padding-top: 10px;">
            [QR VERIFY]<br>${escapeHtml(certId)}
          </div>
        `;
      }
    } catch (err) {
      console.warn("QR code generation fallback:", err);
      qrContainer.innerHTML = `<span style="font-size: 8px;">QR</span>`;
    }
  }

  /**
   * Render certificate DOM node into an HTML5 Canvas using html2canvas
   */
  async function renderCertCanvas() {
    const certElement = document.getElementById("certificateCanvas");
    if (!certElement) throw new Error("Certificate DOM element not found");

    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }

    const canvas = await html2canvas(certElement, {
      scale: 2.2, // ~300 DPI print quality
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      logging: false,
      imageTimeout: 15000
    });

    return canvas;
  }

  /**
   * Convert canvas to a landscape A4 jsPDF instance
   */
  function canvasToPdf(canvas) {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
      compress: true
    });

    const imgData = canvas.toDataURL("image/jpeg", 0.92);
    pdf.addImage(imgData, "JPEG", 0, 0, 297, 210, undefined, "FAST");
    return pdf;
  }

  /**
   * Generate PDF Base64 string for an individual candidate (used by mailer)
   */
  async function generatePdfBase64(candidate) {
    updateCertificatePreview(candidate);
    await new Promise(resolve => setTimeout(resolve, 90));

    const canvas = await renderCertCanvas();
    const pdf = canvasToPdf(canvas);
    return pdf.output("datauristring");
  }

  /**
   * Download single PDF
   */
  async function downloadSinglePdf(candidate) {
    const btn = document.getElementById("downloadSinglePdfBtn");
    const originalText = btn ? btn.innerHTML : "";

    try {
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner"></span> Generating PDF...`;
      }

      updateCertificatePreview(candidate);
      await new Promise(resolve => setTimeout(resolve, 100));

      const canvas = await renderCertCanvas();
      const pdf = canvasToPdf(canvas);

      const safeName = (candidate.name || "Participant").replace(/[^a-zA-Z0-9_-]/g, "_");
      const filename = `Certificate_${safeName}_${candidate.certId}.pdf`;

      pdf.save(filename);
      UI.showToast("PDF Downloaded", `Saved ${filename}`, "success");
    } catch (err) {
      console.error("PDF generation failed:", err);
      UI.showToast("Export Failed", "Could not generate PDF: " + err.message, "error");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    }
  }

  /**
   * Download all valid certificates as a ZIP archive
   */
  async function downloadAllCertificatesZip() {
    if (isGeneratingZip) return;

    const validRows = ExcelManager.getValidRows();
    if (validRows.length === 0) {
      UI.showToast("No Valid Candidates", "Upload valid candidate records first.", "warning");
      return;
    }

    const btn = document.getElementById("downloadAllZipBtn");
    const originalText = btn ? btn.innerHTML : "";
    isGeneratingZip = true;

    try {
      if (btn) btn.disabled = true;

      const zip = new JSZip();
      const certFolder = zip.folder("IIM_Indore_Certificates");

      UI.showToast("Generating ZIP Archive", `Rendering ${validRows.length} certificates. Please wait...`, "info", 5000);

      for (let i = 0; i < validRows.length; i++) {
        const cand = validRows[i];
        if (btn) {
          btn.innerHTML = `<span class="spinner"></span> ${i + 1}/${validRows.length} (${Math.round(((i + 1) / validRows.length) * 100)}%)`;
        }

        updateCertificatePreview(cand);
        await new Promise(resolve => setTimeout(resolve, 80));

        const canvas = await renderCertCanvas();
        const pdf = canvasToPdf(canvas);
        const pdfArrayBuffer = pdf.output("arraybuffer");

        const safeName = (cand.name || `Participant_${i + 1}`).replace(/[^a-zA-Z0-9_-]/g, "_");
        const filename = `Certificate_${safeName}_${cand.certId}.pdf`;

        certFolder.file(filename, pdfArrayBuffer);
      }

      if (btn) btn.innerHTML = `<span class="spinner"></span> Compressing ZIP...`;

      const zipContent = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 }
      });

      const zipFilename = `IIM_Indore_Certificates_${new Date().toISOString().slice(0, 10)}.zip`;
      const downloadLink = document.createElement("a");
      downloadLink.href = URL.createObjectURL(zipContent);
      downloadLink.download = zipFilename;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(downloadLink.href);

      UI.showToast("Batch Export Complete", `Downloaded ${validRows.length} certificates in ZIP.`, "success");
      UI.celebrateConfetti();
    } catch (err) {
      console.error("ZIP Generation error:", err);
      UI.showToast("ZIP Generation Failed", err.message, "error");
    } finally {
      isGeneratingZip = false;
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
      if (activeCandidate) {
        updateCertificatePreview(activeCandidate);
      }
    }
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
    onEnterStep,
    setTemplate,
    updateCertificatePreview,
    updateApprovalStateUI,
    updateApprovalCount,
    downloadSinglePdf,
    downloadCandidatePdf,
    toggleCandidateApproval,
    selectCandidate,
    renderCandidateTable,
    setViewMode,
    downloadAllCertificatesZip,
    generatePdfBase64
  };
})();
