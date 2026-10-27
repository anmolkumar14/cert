/**
 * ============================================================================
 * Certificate Generator Portal - Dispatch & Mailer Queue (mailer.js)
 * ============================================================================
 * Handles:
 * - Admin Approval Gated Sending: Only emails approved by the admin are sent!
 * - Rate-limited sequential email sending via Google Apps Script Web App
 * - Live per-row status tracking (Pending, Sending, Sent, Failed, Blocked)
 * - Dynamic progress bar and real-time status updates
 * - Intelligent retry queue for failed deliveries
 * - Post-dispatch summary metrics & Excel (.xlsx) audit report export
 * - Gmail daily quota alerts & demo simulation fallback
 */

const MailerManager = (function() {
  // State
  let isSending = false;
  let abortRequested = false;
  let dispatchSearchQuery = "";
  let dispatchStats = {
    total: 0,
    approved: 0,
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

    const step3Search = document.getElementById("step3SearchInput");
    if (step3Search) {
      step3Search.addEventListener("input", (e) => {
        dispatchSearchQuery = (e.target.value || "").trim().toLowerCase();
        renderDispatchTable();
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
   * Render dispatch status table with Admin Approval column
   */
  function renderDispatchTable() {
    const tbody = document.getElementById("dispatchTableBody");
    if (!tbody) return;

    const rows = ExcelManager.getValidRows().filter(row => {
      if (!dispatchSearchQuery) return true;
      const matchName = (row.name || "").toLowerCase().includes(dispatchSearchQuery);
      const matchHindi = (row.nameHindi || "").toLowerCase().includes(dispatchSearchQuery);
      const matchEmail = (row.email || "").toLowerCase().includes(dispatchSearchQuery);
      const matchId = (row.certId || "").toLowerCase().includes(dispatchSearchQuery);
      return matchName || matchHindi || matchEmail || matchId;
    });
    tbody.innerHTML = "";

    if (rows.length === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">No candidates match "${escapeHtml(dispatchSearchQuery)}".</td>`;
      tbody.appendChild(tr);
      return;
    }

    rows.forEach(row => {
      const tr = document.createElement("tr");
      tr.id = `dispatch_row_${row.id}`;

      // Approval badge
      let approvalBadgeHtml = "";
      if (row.adminApproved) {
        approvalBadgeHtml = `<span class="badge badge-sent"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Approved</span>`;
      } else {
        approvalBadgeHtml = `<span class="badge badge-duplicate" title="Preview and approve in Step 2 to allow emailing"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Awaiting Admin Validation</span>`;
      }

      tr.innerHTML = `
        <td><strong>${escapeHtml(row.name)}</strong></td>
        <td><span style="font-family: monospace; font-size: 0.85rem;">${escapeHtml(row.email)}</span></td>
        <td><span class="font-mono text-cyan" style="font-size: 0.82rem;">${escapeHtml(row.certId)}</span></td>
        <td class="approval-cell">${approvalBadgeHtml}</td>
        <td class="status-cell">${getStatusBadgeHtml(row)}</td>
        <td class="message-cell" style="font-size: 0.8rem; color: var(--text-muted); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${escapeHtml(row.dispatchMessage || (row.adminApproved ? "Validated & Ready to send" : "Blocked: Requires Admin Approval in Step 2"))}
        </td>
      `;

      tbody.appendChild(tr);
    });
  }

  /**
   * Helper for delivery status badges
   */
  function getStatusBadgeHtml(row) {
    if (!row.adminApproved && row.dispatchStatus === "pending") {
      return `<span class="badge badge-duplicate" style="opacity: 0.85;">Blocked</span>`;
    }

    switch (row.dispatchStatus) {
      case "sent":
        return `<span class="badge badge-sent"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Sent</span>`;
      case "sending":
        return `<span class="badge badge-sending"><span class="spinner" style="width: 10px; height: 10px; border-width: 1.5px;"></span> Sending</span>`;
      case "failed":
        return `<span class="badge badge-failed"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Failed</span>`;
      default:
        return `<span class="badge badge-pending">Ready</span>`;
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

    if (statusCell) statusCell.innerHTML = getStatusBadgeHtml(row);
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
    const approvedRows = ExcelManager.getApprovedRows();
    const totalApproved = approvedRows.length;

    const sent = approvedRows.filter(r => r.dispatchStatus === "sent").length;
    const failed = approvedRows.filter(r => r.dispatchStatus === "failed").length;

    dispatchStats = {
      total: validRows.length,
      approved: totalApproved,
      sent: sent,
      failed: failed,
      skipped: validRows.length - totalApproved
    };

    const percent = totalApproved > 0 ? Math.round(((sent + failed) / totalApproved) * 100) : 0;

    const fillEl = document.getElementById("dispatchProgressFill");
    const textEl = document.getElementById("dispatchProgressPercent");
    const countEl = document.getElementById("dispatchProgressCount");

    if (fillEl) fillEl.style.width = `${percent}%`;
    if (textEl) textEl.textContent = `${percent}%`;
    if (countEl) countEl.textContent = `${sent + failed} of ${totalApproved} approved emails dispatched`;

    // Summary counters
    const sumSent = document.getElementById("summaryCountSent");
    const sumFailed = document.getElementById("summaryCountFailed");
    const sumTotal = document.getElementById("summaryCountTotal");

    if (sumSent) sumSent.textContent = sent;
    if (sumFailed) sumFailed.textContent = failed;
    if (sumTotal) sumTotal.textContent = totalApproved;

    // Send button state & label
    const sendAllBtn = document.getElementById("sendAllBtn");
    if (sendAllBtn) {
      sendAllBtn.disabled = totalApproved === 0 || isSending;
      sendAllBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        <span>Send ${totalApproved > 0 ? totalApproved : 0} Approved Certificates</span>
      `;
    }

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
   * Core dispatch runner: sends ONLY admin-approved candidates
   */
  async function startDispatch(onlyFailed = false) {
    if (isSending) return;

    const approvedRows = ExcelManager.getApprovedRows();

    if (approvedRows.length === 0) {
      UI.showToast("Admin Validation Required", "None of the candidates have been approved by the admin. Please return to Step 2 (Preview) and click 'Validate & Approve' first.", "warning", 6000);
      return;
    }

    const queue = onlyFailed
      ? approvedRows.filter(r => r.dispatchStatus === "failed")
      : approvedRows.filter(r => r.dispatchStatus !== "sent");

    if (queue.length === 0) {
      UI.showToast("Nothing to Send", onlyFailed ? "There are no failed emails to retry." : "All approved certificates have already been sent.", "info");
      return;
    }

    isSending = true;
    abortRequested = false;

    const sendAllBtn = document.getElementById("sendAllBtn");
    const retryBtn = document.getElementById("retryFailedBtn");
    const stopBtn = document.getElementById("stopSendingBtn");

    if (sendAllBtn) sendAllBtn.disabled = true;
    if (retryBtn) retryBtn.disabled = true;
    if (stopBtn) stopBtn.classList.remove("hidden");

    UI.showToast("Dispatch Started", `Sending ${queue.length} validated certificate emails...`, "info");

    const user = Auth.getUser();
    const isDemo = user && user.isDemo;

    for (let i = 0; i < queue.length; i++) {
      if (abortRequested) {
        break;
      }

      const row = queue[i];
      row.dispatchStatus = "sending";
      row.dispatchMessage = "Rendering IIM Indore certificate & delivering...";
      updateRowStatusInDOM(row);

      try {
        // Step 1: Render certificate to Base64 PDF
        const pdfBase64 = await CertificateManager.generatePdfBase64(row);

        // Step 2: Send Email via Google Apps Script or Demo Simulation
        if (isDemo) {
          await new Promise(resolve => setTimeout(resolve, 850));
          row.dispatchStatus = "sent";
          row.dispatchMessage = "Dispatched (Demo mode simulated delivery)";
          row.sentAt = new Date().toISOString();
        } else {
          const result = await sendEmailViaBackend(row, pdfBase64);
          if (result.success) {
            row.dispatchStatus = "sent";
            row.dispatchMessage = "Dispatched successfully via Gmail API";
            row.sentAt = new Date().toISOString();
          } else {
            row.dispatchStatus = "failed";
            row.dispatchMessage = result.error || "Delivery failed";
          }
        }
      } catch (err) {
        console.error("Email send error:", err);
        row.dispatchStatus = "failed";
        row.dispatchMessage = err.message || "Failed to generate or deliver PDF";
      }

      updateRowStatusInDOM(row);
      updateProgressUI();

      // Rate limit delay between emails
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
        UI.showToast("Batch Delivered!", `Successfully dispatched all ${queue.length} validated certificates.`, "success");
        UI.celebrateConfetti();
      } else {
        UI.showToast("Dispatch Completed", `Completed with ${finalFailed} failed delivery attempt(s).`, "warning");
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

    const personalizedHtml = CONFIG.EMAIL.bodyTemplate
      .replace(/{{name}}/g, escapeHtml(row.name))
      .replace(/{{programme}}/g, escapeHtml(row.programme))
      .replace(/{{duration}}/g, escapeHtml(row.duration))
      .replace(/{{period}}/g, escapeHtml(row.period))
      .replace(/{{certId}}/g, escapeHtml(row.certId))
      .replace(/{{website}}/g, escapeHtml(CONFIG.ORGANIZATION.website))
      .replace(/{{supportEmail}}/g, escapeHtml(CONFIG.ORGANIZATION.supportEmail));

    const personalizedSubject = CONFIG.EMAIL.subject
      .replace(/{{name}}/g, row.name)
      .replace(/{{programme}}/g, row.programme)
      .replace(/{{certId}}/g, row.certId);

    const payload = {
      action: "sendCertificateEmail",
      token: Auth.getToken(),
      recipientEmail: row.email,
      recipientName: row.name,
      courseName: row.programme,
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

    return await response.json();
  }

  /**
   * Export final results report as an Excel spreadsheet (.xlsx)
   */
  function exportResultsReport() {
    try {
      const allRows = ExcelManager.getAllRows();
      if (allRows.length === 0) {
        UI.showToast("No Data", "No records available for export.", "warning");
        return;
      }

      const reportData = allRows.map(r => ({
        "Participant Name": r.name,
        "Participant Name (Hindi)": r.nameHindi || "N/A",
        "Email Address": r.email,
        "Email Structure Check": r.emailValidation ? r.emailValidation.reason : "N/A",
        "Admin Approved": r.adminApproved ? "YES" : "NO",
        "Approved At": r.approvedAt || "N/A",
        "Approved By": r.approvedBy || "N/A",
        "Programme Name": r.programme,
        "Duration": r.duration,
        "Period": r.period,
        "Certificate ID": r.certId,
        "Delivery Status": r.dispatchStatus ? r.dispatchStatus.toUpperCase() : "PENDING",
        "Dispatched At": r.sentAt || "N/A",
        "Server Log": r.dispatchMessage || "N/A"
      }));

      const worksheet = XLSX.utils.json_to_sheet(reportData);

      worksheet["!cols"] = [
        { wch: 22 }, // Name
        { wch: 22 }, // Name Hindi
        { wch: 28 }, // Email
        { wch: 30 }, // Structure Check
        { wch: 15 }, // Approved
        { wch: 22 }, // Approved At
        { wch: 14 }, // Approved By
        { wch: 40 }, // Programme
        { wch: 14 }, // Duration
        { wch: 24 }, // Period
        { wch: 18 }, // Cert ID
        { wch: 16 }, // Status
        { wch: 22 }, // Sent At
        { wch: 35 }  // Log
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "IIM_Indore_Dispatch_Report");

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      XLSX.writeFile(workbook, `Certificate_Dispatch_Report_${timestamp}.xlsx`);

      UI.showToast("Report Exported", "Excel audit report downloaded successfully.", "success");
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
