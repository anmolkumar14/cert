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

  // Organization Information
  ORGANIZATION: {
    name: "Nexus Institute of Technology",
    tagline: "Empowering Next-Generation Tech Innovators",
    logoPath: "assets/logo.svg",
    website: "https://nexus-institute.edu",
    supportEmail: "certifications@nexus-institute.edu"
  },

  // Certificate Styling & Default Copy
  CERTIFICATE: {
    title: "CERTIFICATE OF ACHIEVEMENT",
    subtitle: "THIS IS PROUDLY PRESENTED TO",
    defaultCourse: "Advanced Full-Stack Engineering & Cloud Architecture",
    descriptionTemplate: "For successfully fulfilling all curriculum requirements, demonstrating outstanding mastery of modern technologies, and completing capstone projects with academic distinction in",
    defaultDate: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    idPrefix: "NX-2026-",
    
    // Signatures
    signers: [
      {
        name: "Dr. Elena Rostova",
        title: "Dean of Engineering & Applied Sciences",
        signatureText: "Elena Rostova" // Rendered in cursive script font
      },
      {
        name: "Marcus Sterling",
        title: "Chairperson, Certification Advisory Board",
        signatureText: "Marcus Sterling"
      }
    ]
  },

  // Email Notification Defaults
  EMAIL: {
    subject: "Congratulations! Your Certificate of Achievement - {{course}}",
    senderName: "Nexus Certification Board",
    replyTo: "certifications@nexus-institute.edu",
    // Base email message template (Placeholders: {{name}}, {{course}}, {{certId}}, {{orgName}})
    bodyTemplate: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
        <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 32px 24px; text-align: center; color: #ffffff;">
          <h1 style="margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 0.5px;">{{orgName}}</h1>
          <p style="margin: 8px 0 0 0; opacity: 0.9; font-size: 14px;">Official Certificate of Credentialing</p>
        </div>
        
        <div style="padding: 32px 24px; color: #334155; line-height: 1.6;">
          <p style="font-size: 16px; margin-top: 0;">Dear <strong>{{name}}</strong>,</p>
          <p>Congratulations! We are delighted to award you the official <strong>Certificate of Achievement</strong> for successfully completing <strong>{{course}}</strong>.</p>
          
          <div style="background: #f8fafc; border-left: 4px solid #6366f1; padding: 16px; margin: 24px 0; border-radius: 0 8px 8px 0;">
            <p style="margin: 0 0 6px 0; font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Credential Verification</p>
            <p style="margin: 0; font-size: 15px; font-weight: 600; color: #1e293b;">Certificate ID: <span style="font-family: monospace; color: #4f46e5;">{{certId}}</span></p>
          </div>
          
          <p>Your personalized, high-resolution certificate is attached to this email as a PDF document. You can download, print, and add this achievement to your LinkedIn profile and resume.</p>
          
          <p style="margin-top: 28px;">Best regards,<br>
          <strong>{{orgName}} Examination & Credentialing Board</strong><br>
          <a href="{{website}}" style="color: #6366f1; text-decoration: none; font-size: 13px;">{{website}}</a></p>
        </div>
        
        <div style="background: #f1f5f9; padding: 16px 24px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
          <p style="margin: 0;">This email was automatically generated. If you have any inquiries, contact <a href="mailto:{{supportEmail}}" style="color: #6366f1;">{{supportEmail}}</a>.</p>
        </div>
      </div>
    `
  },

  // Batch Processing & Rate Limits
  DISPATCH: {
    delayBetweenEmailsMs: 1200, // 1.2s delay between individual emails to prevent rate limiting
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
    theme: "cert_portal_theme_preference"
  }
};

// Freeze configuration object to prevent runtime tampering
if (typeof Object.freeze === "function") {
  Object.freeze(CONFIG);
}
