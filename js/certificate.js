/**
 * ============================================================================
 * Certificate Generator Portal - Certificate Renderer & PDF Generator (certificate.js)
 * ============================================================================
 * Handles:
 * - Live landscape A4 Certificate rendering in HTML/CSS
 * - Dynamic recipient, course, date, ID and signature binding
 * - High-resolution PDF rendering via html2canvas & jsPDF (< 1 MB per PDF)
 * - Single PDF download
 * - Batch ZIP export using JSZip
 * - Base64 PDF generation for Apps Script email delivery
 */

const CertificateManager = (function() {
  // State
  let activeCandidate = null;
  let isGeneratingZip = false;

  /**
   * Initialize Step 2 bindings
   */
  function init() {
    const downloadSinglePdfBtn = document.getElementById("downloadSinglePdfBtn");
    const downloadAllZipBtn = document.getElementById("downloadAllZipBtn");
    const backToStep1Btn = document.getElementById("backToStep1Btn");
    const proceedToStep3Btn = document.getElementById("proceedToStep3Btn");

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
      proceedToStep3Btn.addEventListener("click", () => UI.goToStep(3));
    }
  }

  /**
   * Called whenever user navigates to Step 2
   */
  function onEnterStep() {
    const validRows = ExcelManager.getValidRows();
    if (validRows.length === 0) {
      UI.showToast("No Data", "Please upload valid candidate records first.", "warning");
      UI.goToStep(1);
      return;
    }

    // Set first candidate as default active candidate if none selected
    if (!activeCandidate || !validRows.some(r => r.id === activeCandidate.id)) {
      activeCandidate = validRows[0];
    }

    renderCandidateList(validRows);
    updateCertificatePreview(activeCandidate);
  }

  /**
   * Populate sidebar list of candidates
   */
  function renderCandidateList(candidates) {
    const listContainer = document.getElementById("previewCandidateList");
    const countBadge = document.getElementById("previewCandidateCount");
    if (!listContainer) return;

    if (countBadge) {
      countBadge.textContent = `${candidates.length} Candidate${candidates.length === 1 ? "" : "s"}`;
    }

    listContainer.innerHTML = "";

    candidates.forEach((cand, idx) => {
      const item = document.createElement("div");
      item.className = "candidate-select-item" + (activeCandidate && activeCandidate.id === cand.id ? " selected" : "");
      item.innerHTML = `
        <div style="overflow: hidden;">
          <div style="font-weight: 600; font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(cand.name)}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted); font-family: monospace;">${escapeHtml(cand.certId)}</div>
        </div>
        <span style="font-size: 0.75rem; color: var(--accent-cyan); font-weight: 500;">Preview &rarr;</span>
      `;

      item.addEventListener("click", () => {
        activeCandidate = cand;
        // Update selection styles
        listContainer.querySelectorAll(".candidate-select-item").forEach(el => el.classList.remove("selected"));
        item.classList.add("selected");
        updateCertificatePreview(cand);
      });

      listContainer.appendChild(item);
    });
  }

  /**
   * Update the live DOM certificate template with selected candidate data
   */
  function updateCertificatePreview(candidate) {
    if (!candidate) return;

    const nameEl = document.getElementById("certRecipientName");
    const courseEl = document.getElementById("certCourseName");
    const dateEl = document.getElementById("certIssueDate");
    const idEl = document.getElementById("certCredentialId");
    const orgNameEl = document.getElementById("certOrgName");
    const taglineEl = document.getElementById("certOrgTagline");
    const descEl = document.getElementById("certBodyDescription");
    const sig1NameEl = document.getElementById("certSig1Name");
    const sig1TitleEl = document.getElementById("certSig1Title");
    const sig1SignEl = document.getElementById("certSig1Sign");
    const sig2NameEl = document.getElementById("certSig2Name");
    const sig2TitleEl = document.getElementById("certSig2Title");
    const sig2SignEl = document.getElementById("certSig2Sign");

    // Dynamic text injection
    if (nameEl) nameEl.textContent = candidate.name || "Recipient Name";
    if (courseEl) courseEl.textContent = candidate.course || CONFIG.CERTIFICATE.defaultCourse;
    if (dateEl) dateEl.textContent = candidate.date || CONFIG.CERTIFICATE.defaultDate;
    if (idEl) idEl.textContent = candidate.certId || "NX-2026-0000";

    if (orgNameEl) orgNameEl.textContent = CONFIG.ORGANIZATION.name;
    if (taglineEl) taglineEl.textContent = CONFIG.ORGANIZATION.tagline;
    if (descEl) descEl.textContent = CONFIG.CERTIFICATE.descriptionTemplate;

    // Signatures
    if (CONFIG.CERTIFICATE.signers && CONFIG.CERTIFICATE.signers.length > 0) {
      const s1 = CONFIG.CERTIFICATE.signers[0];
      if (sig1NameEl) sig1NameEl.textContent = s1.name;
      if (sig1TitleEl) sig1TitleEl.textContent = s1.title;
      if (sig1SignEl) sig1SignEl.textContent = s1.signatureText;
    }
    if (CONFIG.CERTIFICATE.signers && CONFIG.CERTIFICATE.signers.length > 1) {
      const s2 = CONFIG.CERTIFICATE.signers[1];
      if (sig2NameEl) sig2NameEl.textContent = s2.name;
      if (sig2TitleEl) sig2TitleEl.textContent = s2.title;
      if (sig2SignEl) sig2SignEl.textContent = s2.signatureText;
    }

    // Dynamic Font Scaling for very long names
    if (nameEl) {
      const nameLength = (candidate.name || "").length;
      if (nameLength > 30) {
        nameEl.style.fontSize = "2.1rem";
      } else if (nameLength > 22) {
        nameEl.style.fontSize = "2.6rem";
      } else {
        nameEl.style.fontSize = "3.5rem";
      }
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

    // Wait for fonts to be ready
    if (document.fonts) {
      await document.fonts.ready;
    }

    // Optimized capture: scale 2.0 provides ~300 DPI print quality without bloating memory
    const canvas = await html2canvas(certElement, {
      scale: 2.0,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      logging: false,
      imageTimeout: 15000
    });

    return canvas;
  }

  /**
   * Convert canvas to a jsPDF instance
   */
  function canvasToPdf(canvas) {
    const { jsPDF } = window.jspdf;
    // Standard Landscape A4: 297mm x 210mm
    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
      compress: true
    });

    // High quality JPEG compression (0.91 quality) keeps file size around 300KB - 600KB, well under 1MB
    const imgData = canvas.toDataURL("image/jpeg", 0.91);
    pdf.addImage(imgData, "JPEG", 0, 0, 297, 210, undefined, "FAST");

    return pdf;
  }

  /**
   * Generate PDF Base64 string for an arbitrary candidate row (used by mailer)
   */
  async function generatePdfBase64(candidate) {
    updateCertificatePreview(candidate);
    // Allow DOM to settle
    await new Promise(resolve => setTimeout(resolve, 80));

    const canvas = await renderCertCanvas();
    const pdf = canvasToPdf(canvas);

    // Get base64 string
    const dataUri = pdf.output("datauristring");
    return dataUri;
  }

  /**
   * Download a single candidate certificate as PDF
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

      const safeName = (candidate.name || "Candidate").replace(/[^a-zA-Z0-9_-]/g, "_");
      const filename = `Certificate_${safeName}.pdf`;

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
   * Download all valid certificates as a single compressed ZIP file
   */
  async function downloadAllCertificatesZip() {
    if (isGeneratingZip) return;

    const validRows = ExcelManager.getValidRows();
    if (validRows.length === 0) {
      UI.showToast("No Valid Candidates", "Upload valid candidates first.", "warning");
      return;
    }

    const btn = document.getElementById("downloadAllZipBtn");
    const originalText = btn ? btn.innerHTML : "";
    isGeneratingZip = true;

    try {
      if (btn) btn.disabled = true;

      const zip = new JSZip();
      const certFolder = zip.folder("Certificates");

      UI.showToast("Generating ZIP Archive", `Processing ${validRows.length} certificates. Please wait...`, "info", 6000);

      // Sequentially render each candidate to avoid memory explosion
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

        const safeName = (cand.name || `Candidate_${i + 1}`).replace(/[^a-zA-Z0-9_-]/g, "_");
        const filename = `Certificate_${safeName}_${cand.certId || (i + 1)}.pdf`;

        certFolder.file(filename, pdfArrayBuffer);
      }

      if (btn) {
        btn.innerHTML = `<span class="spinner"></span> Compressing ZIP...`;
      }

      // Generate the complete ZIP archive
      const zipBlob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 }
      });

      // Trigger download
      const downloadUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `Certificates_Batch_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      UI.showToast("Batch Export Complete", `Downloaded ZIP containing ${validRows.length} certificates.`, "success");
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
      // Restore preview to the active candidate
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
    downloadSinglePdf,
    downloadAllCertificatesZip,
    generatePdfBase64
  };
})();
