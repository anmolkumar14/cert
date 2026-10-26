/**
 * ============================================================================
 * Certificate Generator Portal - UI Controller (ui.js)
 * ============================================================================
 * Handles:
 * - Dark / Light theme switching with localStorage persistence
 * - Toast notification dispatch system
 * - Multi-step stepper navigation & progress tracking
 * - Canvas confetti celebration bursts
 * - Interactive ripple effects
 */

const UI = (function() {
  // Theme Management
  function initTheme() {
    const savedTheme = localStorage.getItem(CONFIG.STORAGE_KEYS.theme);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initialTheme = savedTheme || (prefersDark ? "dark" : "light");
    
    applyTheme(initialTheme);

    const toggleBtn = document.getElementById("themeToggleBtn");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", () => {
        const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
        const nextTheme = currentTheme === "dark" ? "light" : "dark";
        applyTheme(nextTheme);
        localStorage.setItem(CONFIG.STORAGE_KEYS.theme, nextTheme);
      });
    }

    // Listen to system changes if no explicit preference saved
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
      if (!localStorage.getItem(CONFIG.STORAGE_KEYS.theme)) {
        applyTheme(e.matches ? "dark" : "light");
      }
    });
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    const toggleBtn = document.getElementById("themeToggleBtn");
    if (toggleBtn) {
      toggleBtn.innerHTML = theme === "dark" 
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
      toggleBtn.setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} theme`);
    }
  }

  // Toast System
  function showToast(title, message, type = "info", duration = 4000) {
    let container = document.getElementById("toastContainer");
    if (!container) {
      container = document.createElement("div");
      container.id = "toastContainer";
      container.className = "toast-container";
      document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    
    // Icon definition
    let iconSvg = "";
    if (type === "success") {
      iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
    } else if (type === "error") {
      iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
    } else if (type === "warning") {
      iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
    } else {
      iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    }

    toast.innerHTML = `
      ${iconSvg}
      <div class="toast-body">
        <div class="toast-title">${title}</div>
        ${message ? `<div class="toast-message">${message}</div>` : ""}
      </div>
      <button class="toast-close-btn" aria-label="Close notification">&times;</button>
    `;

    const closeBtn = toast.querySelector(".toast-close-btn");
    const removeToast = () => {
      toast.classList.add("toast-hiding");
      setTimeout(() => {
        if (toast.parentElement) toast.remove();
      }, 250);
    };

    closeBtn.addEventListener("click", removeToast);
    container.appendChild(toast);

    if (duration > 0) {
      setTimeout(removeToast, duration);
    }
  }

  // Stepper Controller
  let currentStep = 1;

  function initStepper() {
    const stepItems = document.querySelectorAll(".step-item");
    stepItems.forEach(item => {
      item.addEventListener("click", () => {
        const targetStep = parseInt(item.getAttribute("data-step"), 10);
        // Only allow clicking to steps that have already been enabled or visited
        if (targetStep <= currentStep || (window.CERT_APP && window.CERT_APP.canNavigateToStep && window.CERT_APP.canNavigateToStep(targetStep))) {
          goToStep(targetStep);
        }
      });
    });
  }

  function goToStep(step) {
    if (step < 1 || step > 3) return;
    currentStep = step;

    // Update Step items
    const stepItems = document.querySelectorAll(".step-item");
    stepItems.forEach(item => {
      const stepNum = parseInt(item.getAttribute("data-step"), 10);
      item.classList.remove("active", "completed");
      if (stepNum === step) {
        item.classList.add("active");
      } else if (stepNum < step) {
        item.classList.add("completed");
      }
    });

    // Update Progress bar fill
    const progressFill = document.getElementById("stepperProgressFill");
    if (progressFill) {
      const percent = ((step - 1) / 2) * 100;
      progressFill.style.width = `${percent}%`;
    }

    // Switch visible content
    const contents = document.querySelectorAll(".step-content");
    contents.forEach(content => {
      content.classList.remove("active");
    });

    const activeContent = document.getElementById(`stepContent${step}`);
    if (activeContent) {
      activeContent.classList.add("active");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    // Trigger hooks for specific steps
    if (step === 2 && window.CertificateManager) {
      window.CertificateManager.onEnterStep();
    }
    if (step === 3 && window.MailerManager) {
      window.MailerManager.onEnterStep();
    }
  }

  function getCurrentStep() {
    return currentStep;
  }

  // Confetti Celebration
  function celebrateConfetti() {
    if (typeof confetti === "function") {
      // First burst
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });

      // Follow-up bursts from edges
      setTimeout(() => {
        confetti({
          particleCount: 50,
          angle: 60,
          spread: 55,
          origin: { x: 0 }
        });
        confetti({
          particleCount: 50,
          angle: 120,
          spread: 55,
          origin: { x: 1 }
        });
      }, 250);
    }
  }

  // Button Ripple Effect
  function initRipples() {
    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn");
      if (!btn) return;

      const circle = document.createElement("span");
      const diameter = Math.max(btn.clientWidth, btn.clientHeight);
      const radius = diameter / 2;

      const rect = btn.getBoundingClientRect();
      circle.style.width = circle.style.height = `${diameter}px`;
      circle.style.left = `${e.clientX - rect.left - radius}px`;
      circle.style.top = `${e.clientY - rect.top - radius}px`;
      circle.classList.add("btn-ripple");

      const existing = btn.querySelector(".btn-ripple");
      if (existing) existing.remove();

      btn.appendChild(circle);
      setTimeout(() => circle.remove(), 600);
    });
  }

  return {
    initTheme,
    showToast,
    initStepper,
    goToStep,
    getCurrentStep,
    celebrateConfetti,
    initRipples
  };
})();

// Initialize DOM-level UI bindings once loaded
document.addEventListener("DOMContentLoaded", () => {
  UI.initTheme();
  UI.initRipples();
});
