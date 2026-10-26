/**
 * ============================================================================
 * Certificate Generator Portal - IIM Indore Bilingual Certificate Renderer (certificate.js)
 * ============================================================================
 * Handles:
 * - Bilingual Hindi & English official IIM Indore certificate rendering
 * - Dynamic QR Code generation client-side (via QRCode.js)
 * - Candidate photo rendering (with avatar fallback)
 * - Admin Preview & Validation Workflow (Approving individual or all certificates)
 * - High-resolution PDF rendering via html2canvas & jsPDF (< 1 MB per PDF)
 * - Single PDF download & Batch ZIP export
 * - Base64 PDF generation for Apps Script email delivery
 */

const CertificateManager = (function() {
  // State
  let activeCandidate = null;
  let isGeneratingZip = false;
  let qrCodeInstance = null;
  let showWatermark = true;

  /**
   * Initialize Step 2 bindings
   */
  function init() {
    const downloadSinglePdfBtn = document.getElementById("downloadSinglePdfBtn");
    const downloadAllZipBtn = document.getElementById("downloadAllZipBtn");
    const backToStep1Btn = document.getElementById("backToStep1Btn");
    const proceedToStep3Btn = document.getElementById("proceedToStep3Btn");
    const approveCurrentBtn = document.getElementById("approveCurrentCandidateBtn");
    const revokeApprovalBtn = document.getElementById("revokeApprovalBtn");
    const approveAllBtn = document.getElementById("approveAllCandidatesBtn");
    const toggleWatermarkBtn = document.getElementById("toggleWatermarkBtn");

    if (downloadSinglePdfBtn) {
      downloadSinglePdfBtn.addEventListener("click", () => {
        if (!activeCandidate) {
          UI.showToast("No Recipient Selected", "Please select a candidate to generate their certificate.", "warning");
          return;
        }
        downloadSinglePdf(activeCandidate);
      });
    }

    if (downloadAllZipBtn) {
      downloadAllZipBtn.addEventListener("click", downloadAllCertificatesZip);
    }

    if (backToStep1Btn) {
      backToStep1Btn.addEventListener("click", () => UI.goToStep(1));
    }

    if (proceedToStep3Btn) {
      proceedToStep3Btn.addEventListener("click", () => {
        const approvedCount = ExcelManager.getApprovedRows().length;
        if (approvedCount === 0) {
          UI.showToast("Admin Validation Required", "Please validate & approve at least one candidate preview before proceeding to email dispatch.", "warning");
          return;
        }
        UI.goToStep(3);
      });
    }

    // Admin Approval Handlers
    if (approveCurrentBtn) {
      approveCurrentBtn.addEventListener("click", () => {
        if (!activeCandidate) return;
        ExcelManager.setAdminApproval(activeCandidate.id, true);
        updateApprovalStateUI(activeCandidate);
        renderCandidateList(ExcelManager.getValidRows());
        UI.showToast("Candidate Approved", `Certificate for ${activeCandidate.name} has been validated for email delivery.`, "success");
      });
    }

    if (revokeApprovalBtn) {
      revokeApprovalBtn.addEventListener("click", () => {
        if (!activeCandidate) return;
        ExcelManager.setAdminApproval(activeCandidate.id, false);
        updateApprovalStateUI(activeCandidate);
        renderCandidateList(ExcelManager.getValidRows());
        UI.showToast("Approval Revoked", `Approval removed for ${activeCandidate.name}.`, "info");
      });
    }

    if (approveAllBtn) {
      approveAllBtn.addEventListener("click", () => {
        const validRows = ExcelManager.getValidRows();
        if (validRows.length === 0) return;
        ExcelManager.setAllAdminApproval(true);
        if (activeCandidate) updateApprovalStateUI(activeCandidate);
        renderCandidateList(validRows);
        UI.showToast("All Approved", `Validated all ${validRows.length} candidates for dispatch.`, "success");
        UI.celebrateConfetti();
      });
    }

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
  }

  /**
   * Called whenever user navigates to Step 2
   */
  function onEnterStep() {
    const validRows = ExcelManager.getValidRows();
    if (validRows.length === 0) {
      UI.showToast("No Valid Records", "Please upload valid candidate records first.", "warning");
      UI.goToStep(1);
      return;
    }

    if (!activeCandidate || !validRows.some(r => r.id === activeCandidate.id)) {
      activeCandidate = validRows[0];
    }

    renderCandidateList(validRows);
    updateCertificatePreview(activeCandidate);
    updateApprovalStateUI(activeCandidate);
    updateApprovalCount();
  }

  /**
   * Populate sidebar candidate roster with validation status
   */
  function renderCandidateList(candidates) {
    const listContainer = document.getElementById("previewCandidateList");
    if (!listContainer) return;

    listContainer.innerHTML = "";

    candidates.forEach((cand) => {
      const item = document.createElement("div");
      item.className = "candidate-select-item" + (activeCandidate && activeCandidate.id === cand.id ? " selected" : "");

      const isApproved = cand.adminApproved === true;
      const approvalIcon = isApproved
        ? `<span style="color: #10b981; font-size: 0.75rem; font-weight: 700; display: inline-flex; align-items: center; gap: 3px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Approved</span>`
        : `<span style="color: #f59e0b; font-size: 0.72rem; font-weight: 600;">Pending</span>`;

      item.innerHTML = `
        <div style="overflow: hidden; max-width: 190px;">
          <div style="font-weight: 600; font-size: 0.88rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(cand.name)}</div>
          <div style="font-size: 0.72rem; color: var(--text-muted); font-family: monospace;">${escapeHtml(cand.certId)}</div>
        </div>
        <div>
          ${approvalIcon}
        </div>
      `;

      item.addEventListener("click", () => {
        activeCandidate = cand;
        listContainer.querySelectorAll(".candidate-select-item").forEach(el => el.classList.remove("selected"));
        item.classList.add("selected");
        updateCertificatePreview(cand);
        updateApprovalStateUI(cand);
      });

      listContainer.appendChild(item);
    });

    updateApprovalCount();
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

    if (candidateNameLabel) {
      candidateNameLabel.textContent = candidate.name;
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

    // Step 3 Proceed button status
    const proceedToStep3Btn = document.getElementById("proceedToStep3Btn");
    const approvedCount = ExcelManager.getApprovedRows().length;
    if (proceedToStep3Btn) {
      proceedToStep3Btn.textContent = `Dispatch Emails (${approvedCount} Approved) \u2192`;
    }
  }

  /**
   * Update top summary counts in sidebar
   */
  function updateApprovalCount() {
    const validCount = ExcelManager.getValidRows().length;
    const approvedCount = ExcelManager.getApprovedRows().length;
    const countBadge = document.getElementById("previewCandidateCount");

    if (countBadge) {
      countBadge.innerHTML = `<strong>${approvedCount}</strong> of <strong>${validCount}</strong> Approved`;
    }
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
        pNameEngEl.style.fontSize = "1.15rem";
      } else if (len > 22) {
        pNameEngEl.style.fontSize = "1.3rem";
      } else {
        pNameEngEl.style.fontSize = "1.48rem";
      }
    }

    // Candidate Photo
    if (photoImgEl) {
      photoImgEl.src = candidate.photoUrl || "assets/avatar.svg";
      photoImgEl.onerror = () => {
        photoImgEl.src = "assets/avatar.svg";
      };
    }

    // Generate Dynamic QR Code
    generateCertificateQr(candidate.certId);
  }

  /**
   * Generate QR Code into #certQrCode element
   */
  function generateCertificateQr(certId) {
    const qrContainer = document.getElementById("certQrCode");
    if (!qrContainer) return;

    qrContainer.innerHTML = "";
    const verifyUrl = `${CONFIG.ORGANIZATION.verifyUrlBase}${encodeURIComponent(certId)}`;

    if (typeof QRCode !== "undefined") {
      try {
        qrCodeInstance = new QRCode(qrContainer, {
          text: verifyUrl,
          width: 64,
          height: 64,
          colorDark: "#0f172a",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.M
        });
      } catch (err) {
        console.warn("QRCode generation error:", err);
      }
    } else {
      // Fallback clean QR graphic if CDN offline
      const img = document.createElement("img");
      img.src = `https://api.qrserver.com/v1/create-qr-code/?size=64x64&data=${encodeURIComponent(verifyUrl)}`;
      img.alt = "Verification QR Code";
      img.style.width = "100%";
      img.style.height = "100%";
      qrContainer.appendChild(img);
    }
  }

  /**
   * Render certificate DOM node into high-resolution canvas via html2canvas
   */
  async function renderCertCanvas() {
    const certElement = document.getElementById("certificateCanvas");
    if (!certElement) {
      throw new Error("Certificate element #certificateCanvas not found in DOM.");
    }

    if (document.fonts) {
      await document.fonts.ready;
    }

    // Wait a brief tick for QR image/canvas to settle
    await new Promise(resolve => setTimeout(resolve, 80));

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

    // Clean JPEG compression under 600KB
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

      if (btn) {
        btn.innerHTML = `<span class="spinner"></span> Compressing ZIP...`;
      }

      const zipBlob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 }
      });

      const downloadUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `IIM_Indore_Certificates_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

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
    updateCertificatePreview,
    updateApprovalStateUI,
    updateApprovalCount,
    downloadSinglePdf,
    downloadAllCertificatesZip,
    generatePdfBase64
  };
})();
