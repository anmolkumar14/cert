/**
 * Certificate Generator Portal - Global Configuration
 * 
 * Keep all backend endpoints, organization branding, email templates,
 * and certificate parameters in this single file.
 */

const CONFIG = {
  // Backend API URL - Replace with your deployed Google Apps Script Web App URL
  // Example: "https://script.google.com/macros/s/AKfycbx.../exec"
  APPS_SCRIPT_URL: "",

  // Portal Branding & Attribution
  PORTAL: {
    name: "DTAI Launchpad",
    subtitle: "Executive Certificate & Dispatch Suite",
    icon: "assets/rocket.svg",
    developedBy: "Bodhidharma Lab",
    developerLogo: "assets/bodhidharma-logo.svg"
  },

  // Organization Information (Matching IIM Indore Reference Certificate)
  ORGANIZATION: {
    portalName: "DTAI Launchpad",
    developedBy: "Bodhidharma Lab",
    hindiName: "भारतीय प्रबंध संस्थान इंदौर",
    englishName: "INDIAN INSTITUTE OF MANAGEMENT INDORE",
    shortName: "IIM Indore",
    tagline: "Siddhim Him Prathama Mata",
    logoPath: "assets/logo.svg",
    website: "https://www.iimidr.ac.in",
    supportEmail: "ex-ed@iimidr.ac.in",
    verifyUrlBase: "https://www.iimidr.ac.in/verify?id="
  },

  // Certificate Styling & Default Copy (Bilingual Hindi + English)
  CERTIFICATE: {
    titleHindi: "भारतीय प्रबंध संस्थान इंदौर",
    titleEnglish: "INDIAN INSTITUTE OF MANAGEMENT INDORE",
    
    defaultProgramme: "Executive Programme in Strategic Leadership & Artificial Intelligence",
    defaultProgrammeHindi: "रणनीतिक नेतृत्व और कृत्रिम बुद्धिमत्ता में कार्यकारी कार्यक्रम",
    
    defaultDuration: "6 Months",
    defaultDurationHindi: "६ माह",
    
    defaultPeriod: "January 2026 to June 2026",
    defaultPeriodHindi: "जनवरी २०२६ से जून २०२६",
    
    defaultDate: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    idPrefix: "IIMI-EP-2026-",
    
    // Signatures as shown on certificate
    signers: [
      {
        id: "coordinator",
        titleHindi: "कार्यक्रम समन्वयक",
        titleEnglish: "Programme Coordinator",
        name: "Prof. S. R. Sharma",
        signatureText: "S. R. Sharma"
      },
      {
        id: "chairperson",
        titleHindi: "अध्यक्ष, कार्यपालक शिक्षा",
        titleEnglish: "Chairperson, Executive Education",
        name: "Prof. Ananya Gupta",
        signatureText: "Ananya Gupta"
      },
      {
        id: "director",
        titleHindi: "निदेशक, भा. प्र. सं. इंदौर",
        titleEnglish: "Director, IIM Indore",
        name: "Prof. Himanshu Rai",
        signatureText: "Himanshu Rai"
      }
    ]
  },

  // Email Notification Defaults
  EMAIL: {
    subject: "Official Certificate of Completion: {{programme}} — {{name}}",
    senderName: "IIM Indore Executive Education",
    replyTo: "ex-ed@iimidr.ac.in",
    bodyTemplate: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 14px rgba(0,0,0,0.06);">
        <div style="background: linear-gradient(135deg, #be185d 0%, #831843 100%); padding: 32px 24px; text-align: center; color: #ffffff;">
          <h2 style="margin: 0; font-size: 18px; font-weight: 500; letter-spacing: 0.5px; opacity: 0.95;">भारतीय प्रबंध संस्थान इंदौर</h2>
          <h1 style="margin: 6px 0 0 0; font-size: 20px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">INDIAN INSTITUTE OF MANAGEMENT INDORE</h1>
          <p style="margin: 8px 0 0 0; opacity: 0.85; font-size: 13px; letter-spacing: 0.5px;">Executive Education & Credentialing Board</p>
        </div>
        
        <div style="padding: 32px 26px; color: #334155; line-height: 1.6;">
          <p style="font-size: 16px; margin-top: 0;">Dear <strong>{{name}}</strong>,</p>
          <p>We are delighted to congratulate you on successfully completing the <strong>{{programme}}</strong> online (asynchronous) conducted by the <strong>Indian Institute of Management Indore</strong> during <strong>{{period}}</strong>.</p>
          
          <div style="background: #fdf2f8; border-left: 4px solid #db2777; padding: 16px 20px; margin: 24px 0; border-radius: 0 8px 8px 0;">
            <p style="margin: 0 0 6px 0; font-size: 12px; color: #9d174d; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 700;">Certificate Credential Details</p>
            <p style="margin: 0; font-size: 15px; font-weight: 600; color: #831843;">Credential ID: <span style="font-family: monospace; color: #be185d; font-size: 16px;">{{certId}}</span></p>
            <p style="margin: 4px 0 0 0; font-size: 13px; color: #475569;">Duration: {{duration}} | Admin Verified: <span style="color: #10b981; font-weight: 600;">&#10003; Approved</span></p>
          </div>
          
          <p>Your official, high-resolution certificate has been validated by the administration and is attached to this email as a PDF document (<code>Certificate_{{name}}.pdf</code>). You can verify, download, and add this distinguished achievement to your LinkedIn profile and CV.</p>
          
          <p style="margin-top: 28px;">With warm regards and best wishes,<br>
          <strong>Executive Education Office</strong><br>
          Indian Institute of Management Indore<br>
          <a href="{{website}}" style="color: #be185d; text-decoration: none; font-size: 13px;">{{website}}</a></p>
        </div>
        
        <div style="background: #f8fafc; padding: 16px 24px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
          <p style="margin: 0;">This official certificate notification was issued by IIM Indore. For credential verification inquiries, contact <a href="mailto:{{supportEmail}}" style="color: #be185d;">{{supportEmail}}</a>.</p>
        </div>
      </div>
    `
  },

  // Batch Processing & Rate Limits
  DISPATCH: {
    delayBetweenEmailsMs: 1200, // 1.2s delay between individual emails
    defaultTimeoutMs: 30000,
    dailyQuotaInfo: {
      freeAccount: "~100 emails/day",
      workspaceAccount: "~1,500 emails/day"
    }
  },

  // Auth & Storage Keys
  STORAGE_KEYS: {
    token: "cert_portal_session_token",
    user: "cert_portal_session_user",
    rememberMe: "cert_portal_remember_flag",
    theme: "cert_portal_theme_preference",
    validatedCandidates: "cert_portal_validated_ids"
  }
};

// Freeze configuration object
if (typeof Object.freeze === "function") {
  Object.freeze(CONFIG);
}
