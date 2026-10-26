/**
 * ============================================================================
 * Certificate Generator Portal - Dispatch & Mailer Queue (mailer.js)
 * ============================================================================
 * Handles:
 * - Rate-limited sequential email sending via Google Apps Script Web App
 * - Live per-row status tracking (Pending, Sending, Sent, Failed)
 * - Dynamic progress bar and real-time status updates
 * - Intelligent retry queue for failed deliveries
 * - Post-dispatch summary metrics & Excel (.xlsx) audit report export
 * - Gmail daily quota alerts & demo simulation fallback
 */

const MailerManager = (function() {
  // State
  let isSending = false;
  let abortRequested = false;
  let dispatchStats = {
    total: 0,
    sent: 0,
    failed: 0,
    skipped: 0
  };

  /**
   * Initialize dispatch controls & listeners
   */
  function init() {
    const sendAllBtn = document.getElementById("sendAllBtn");
    const retryFailedBtn = document.getElementById("retryFailedBtn");
    const stopSendingBtn = document.getElementById("stopSendingBtn");
    const exportReportBtn = document.getElementById("exportReportBtn");
    const backToStep2Btn = document.getElementById("backToStep2Btn");

    if (sendAllBtn) {
      sendAllBtn.addEventListener("click", () => startDispatch(false));
    }

    if (retryFailedBtn) {
      retryFailedBtn.addEventListener("click", () => startDispatch(true));
    }

    if (stopSendingBtn) {
      stopSendingBtn.addEventListener("click", () => {
        abortRequested = true;
        UI.showToast("Dispatch Paused", "Sending halted. You can resume at any time.", "warning");
      });
    }

    if (exportReportBtn) {
      exportReportBtn.addEventListener("click", exportResultsReport);
    }

    if (backToStep2Btn) {
      backToStep2Btn.addEventListener("click", () => {
        if (isSending) {
          UI.showToast("Sending in Progress", "Please wait or stop dispatch before navigating back.", "warning");
          return;
        }
        UI.goToStep(2);
      });
    }
  }

  /**
   * Called whenever user navigates to Step 3
   */
  function onEnterStep() {
    const validRows = ExcelManager.getValidRows();
    if (validRows.length === 0) {
      UI.showToast("No Valid Candidates", "Please ensure candidate records are uploaded first.", "warning");
      UI.goToStep(1);
      return;
    }

    renderDispatchTable();
    updateProgressUI();
    checkBackendQuota();
  }

  /**
   * Check remaining quota from backend if authenticated
   */
  async function checkBackendQuota() {
    const quotaDisplay = document.getElementById("gmailQuotaDisplay");
    const user = Auth.getUser();

    if (user && user.isDemo) {
      if (quotaDisplay) {
        quotaDisplay.innerHTML = `<span class="quota-badge">Demo Mode Active</span> Simulated Unlimited`;
      }
      return;
    }

    if (!CONFIG.APPS_SCRIPT_URL) return;

    try {
      const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "getQuota",
          token: Auth.getToken()
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.remainingDailyQuota !== undefined && quotaDisplay) {
          quotaDisplay.innerHTML = `<span class="quota-badge">${data.remainingDailyQuota} Emails Left</span> Today`;
        }
      }
    } catch (e) {
      // Graceful ignore
    }
  }

  /**
   * Render dispatch status table
   */
  function renderDispatchTable() {
    const tbody = document.getElementById("dispatchTableBody");
    if (!tbody) return;

    const rows = ExcelManager.getValidRows();
    tbody.innerHTML = "";

    rows.forEach(row => {
      const tr = document.createElement("tr");
      tr.id = `dispatch_row_${row.id}`;

      tr.innerHTML = `
        <td><strong>${escapeHtml(row.name)}</strong></td>
        <td><span style="font-family: monospace; font-size: 0.85rem;">${escapeHtml(row.email)}</span></td>
        <td><span class="font-mono text-cyan" style="font-size: 0.82rem;">${escapeHtml(row.certId)}</span></td>
        <td class="status-cell">${getStatusBadgeHtml(row.dispatchStatus)}</td>
        <td class="message-cell" style="font-size: 0.8rem; color: var(--text-muted); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${escapeHtml(row.dispatchMessage || "Ready")}
        </td>
      `;

      tbody.appendChild(tr);
    });
  }

  /**
   * Helper for status badges
   */
  function getStatusBadgeHtml(status) {
    switch (status) {
      case "sent":
        return `<span class="badge badge-sent"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Sent</span>`;
      case "sending":
        return `<span class="badge badge-sending"><span class="spinner" style="width: 10px; height: 10px; border-width: 1.5px;"></span> Sending</span>`;
      case "failed":
        return `<span class="badge badge-failed"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Failed</span>`;
      default:
        return `<span class="badge badge-pending">Pending</span>`;
    }
  }

  /**
   * Update row visual status
   */
  function updateRowStatusInDOM(row) {
    const tr = document.getElementById(`dispatch_row_${row.id}`);
    if (!tr) return;

    const statusCell = tr.querySelector(".status-cell");
    const messageCell = tr.querySelector(".message-cell");

    if (statusCell) statusCell.innerHTML = getStatusBadgeHtml(row.dispatchStatus);
    if (messageCell) {
      messageCell.textContent = row.dispatchMessage || "";
      if (row.dispatchStatus === "failed") {
        messageCell.style.color = "var(--status-danger)";
        messageCell.title = row.dispatchMessage;
      } else if (row.dispatchStatus === "sent") {
        messageCell.style.color = "var(--status-success)";
      }
    }
  }

  /**
   * Update top progress bar & counters
   */
  function updateProgressUI() {
    const validRows = ExcelManager.getValidRows();
    const total = validRows.length;
    const sent = validRows.filter(r => r.dispatchStatus === "sent").length;
    const failed = validRows.filter(r => r.dispatchStatus === "failed").length;
    const pending = validRows.filter(r => r.dispatchStatus === "pending" || r.dispatchStatus === "sending").length;

    dispatchStats = { total, sent, failed, skipped: 0 };

    const percent = total > 0 ? Math.round(((sent + failed) / total) * 100) : 0;

    const fillEl = document.getElementById("dispatchProgressFill");
    const textEl = document.getElementById("dispatchProgressPercent");
    const countEl = document.getElementById("dispatchProgressCount");

    if (fillEl) fillEl.style.width = `${percent}%`;
    if (textEl) textEl.textContent = `${percent}%`;
    if (countEl) countEl.textContent = `${sent + failed} of ${total} processed`;

    // Summary counters
    const sumSent = document.getElementById("summaryCountSent");
    const sumFailed = document.getElementById("summaryCountFailed");
    const sumTotal = document.getElementById("summaryCountTotal");

    if (sumSent) sumSent.textContent = sent;
    if (sumFailed) sumFailed.textContent = failed;
    if (sumTotal) sumTotal.textContent = total;

    // Retry button state
    const retryBtn = document.getElementById("retryFailedBtn");
    if (retryBtn) {
      retryBtn.style.display = failed > 0 ? "inline-flex" : "none";
      retryBtn.disabled = isSending;
    }

    // Summary Card visibility
    const summaryCard = document.getElementById("dispatchSummaryCard");
    if (summaryCard) {
      if (sent + failed > 0 && !isSending) {
        summaryCard.classList.remove("hidden");
      }
    }
  }

  /**
   * Core dispatch runner: sends emails one by one with rate-limiting delay
   */
  async function startDispatch(onlyFailed = false) {
    if (isSending) return;

    const validRows = ExcelManager.getValidRows();
    const queue = onlyFailed
      ? validRows.filter(r => r.dispatchStatus === "failed")
      : validRows.filter(r => r.dispatchStatus !== "sent");

    if (queue.length === 0) {
      UI.showToast("Nothing to Send", onlyFailed ? "There are no failed emails to retry." : "All valid emails have already been sent.", "info");
      return;
    }

    isSending = true;
    abortRequested = false;

    // Toggle UI buttons
    const sendAllBtn = document.getElementById("sendAllBtn");
    const retryBtn = document.getElementById("retryFailedBtn");
    const stopBtn = document.getElementById("stopSendingBtn");

    if (sendAllBtn) sendAllBtn.disabled = true;
    if (retryBtn) retryBtn.disabled = true;
    if (stopBtn) stopBtn.classList.remove("hidden");

    UI.showToast("Dispatch Started", `Queued ${queue.length} certificate emails...`, "info");

    const user = Auth.getUser();
    const isDemo = user && user.isDemo;

    for (let i = 0; i < queue.length; i++) {
      if (abortRequested) {
        break;
      }

      const row = queue[i];
      row.dispatchStatus = "sending";
      row.dispatchMessage = "Rendering certificate & dispatching...";
      updateRowStatusInDOM(row);

      try {
        // Step 1: Render certificate to Base64 PDF
        const pdfBase64 = await CertificateManager.generatePdfBase64(row);

        // Step 2: Send Email via Google Apps Script or Simulate in Demo Mode
        if (isDemo) {
          // Simulate realistic network delay
          await new Promise(resolve => setTimeout(resolve, 850));
          row.dispatchStatus = "sent";
          row.dispatchMessage = "Sent successfully (Demo Mode simulated delivery)";
          row.sentAt = new Date().toISOString();
        } else {
          // Real backend dispatch
          const result = await sendEmailViaBackend(row, pdfBase64);
          if (result.success) {
            row.dispatchStatus = "sent";
            row.dispatchMessage = "Dispatched via Gmail API";
            row.sentAt = new Date().toISOString();
          } else {
            row.dispatchStatus = "failed";
            row.dispatchMessage = result.error || "Delivery failed";
          }
        }
      } catch (err) {
        console.error("Email send error:", err);
        row.dispatchStatus = "failed";
        row.dispatchMessage = err.message || "Failed to generate or send PDF";
      }

      updateRowStatusInDOM(row);
      updateProgressUI();

      // Rate limit delay between emails (except after last)
      if (i < queue.length - 1 && !abortRequested) {
        await new Promise(resolve => setTimeout(resolve, CONFIG.DISPATCH.delayBetweenEmailsMs));
      }
    }

    isSending = false;

    if (sendAllBtn) sendAllBtn.disabled = false;
    if (retryBtn) retryBtn.disabled = false;
    if (stopBtn) stopBtn.classList.add("hidden");

    updateProgressUI();

    const finalFailed = queue.filter(r => r.dispatchStatus === "failed").length;
    if (!abortRequested) {
      if (finalFailed === 0) {
        UI.showToast("All Emails Sent!", `Successfully dispatched all ${queue.length} certificates.`, "success");
        UI.celebrateConfetti();
      } else {
        UI.showToast("Dispatch Finished", `Completed with ${finalFailed} failed delivery attempt(s). Click "Retry Failed" to re-send.`, "warning");
      }
    }
  }

  /**
   * Dispatch single email request to Google Apps Script Web App
   */
  async function sendEmailViaBackend(row, pdfBase64) {
    if (!CONFIG.APPS_SCRIPT_URL) {
      throw new Error("No backend URL configured in js/config.js. Cannot send real emails.");
    }

    // Build personalized HTML email body
    const personalizedHtml = CONFIG.EMAIL.bodyTemplate
      .replace(/{{name}}/g, escapeHtml(row.name))
      .replace(/{{course}}/g, escapeHtml(row.course))
      .replace(/{{certId}}/g, escapeHtml(row.certId))
      .replace(/{{orgName}}/g, escapeHtml(CONFIG.ORGANIZATION.name))
      .replace(/{{website}}/g, escapeHtml(CONFIG.ORGANIZATION.website))
      .replace(/{{supportEmail}}/g, escapeHtml(CONFIG.ORGANIZATION.supportEmail));

    const personalizedSubject = CONFIG.EMAIL.subject
      .replace(/{{name}}/g, row.name)
      .replace(/{{course}}/g, row.course)
      .replace(/{{certId}}/g, row.certId);

    const payload = {
      action: "sendCertificateEmail",
      token: Auth.getToken(),
      recipientEmail: row.email,
      recipientName: row.name,
      courseName: row.course,
      certId: row.certId,
      subject: personalizedSubject,
      htmlBody: personalizedHtml,
      pdfBase64: pdfBase64,
      senderName: CONFIG.EMAIL.senderName
    };

    const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  }

  /**
   * Export final results report as an Excel spreadsheet (.xlsx)
   */
  function exportResultsReport() {
    try {
      const validRows = ExcelManager.getValidRows();
      if (validRows.length === 0) {
        UI.showToast("No Data", "No records available for export.", "warning");
        return;
      }

      const reportData = validRows.map(r => ({
        "Candidate Name": r.name,
        "Email Address": r.email,
        "Course / Program": r.course,
        "Issue Date": r.date,
        "Certificate ID": r.certId,
        "Delivery Status": r.dispatchStatus ? r.dispatchStatus.toUpperCase() : "PENDING",
        "System Log": r.dispatchMessage || "N/A",
        "Dispatched At": r.sentAt || "N/A"
      }));

      const worksheet = XLSX.utils.json_to_sheet(reportData);

      worksheet["!cols"] = [
        { wch: 22 }, // Name
        { wch: 28 }, // Email
        { wch: 40 }, // Course
        { wch: 18 }, // Date
        { wch: 18 }, // Cert ID
        { wch: 16 }, // Status
        { wch: 38 }, // Log
        { wch: 25 }  // Sent At
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Dispatch_Report");

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      XLSX.writeFile(workbook, `Certificate_Dispatch_Report_${timestamp}.xlsx`);

      UI.showToast("Report Exported", "Excel report downloaded successfully.", "success");
    } catch (err) {
      console.error("Export report error:", err);
      UI.showToast("Export Failed", "Could not export report: " + err.message, "error");
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
    startDispatch,
    exportResultsReport
  };
})();
