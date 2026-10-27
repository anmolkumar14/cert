# 🚀 DTAI Launchpad
### Executive Certificate Generator & Dispatch Suite
> **Created and Developed by Bodhidharma Lab** &bull; Visionary AI & Intelligence Research Lab

A lightweight, high-performance, serverless **Certificate Generator & Email Dispatch Portal** engineered with plain HTML5, CSS3, and vanilla JavaScript (no build tools, zero dependencies, framework-free). 

Designed to be hosted as a 100% static site on **GitHub Pages**, **Netlify**, or **Vercel**, backed by a free, serverless **Google Apps Script Web App** for secure admin authentication and automated Gmail PDF delivery.

---

## ✨ Features & Architecture

```
┌────────────────────────────────────────────────────────┐
│             Static Frontend (GitHub Pages)             │
│  • Modern Glassmorphic UI (Dark / Light Themes)        │
│  • DTAI Launchpad 🚀 Branding & Bodhidharma Lab Brand   │
│  • RFC 5322 Strict Email Validation & Roster Parsing   │
│  • IIM Indore Official Bilingual A4 Landscape Format   │
│  • Admin Approval Gating: Preview & Validate First     │
│  • High-Res Client-Side PDF (< 1 MB, html2canvas/jsPDF)│
│  • Batch ZIP Download (JSZip) & Excel Audit Reports    │
└──────────────────────────┬─────────────────────────────┘
                           │ fetch() Content-Type: "text/plain"
                           │ (Bypasses CORS preflight)
┌──────────────────────────▼─────────────────────────────┐
│          Google Apps Script Web App (Code.gs)          │
│  • SHA-256 Admin Authentication & HMAC Signed Tokens   │
│  • Base64 PDF Attachment & Branded HTML Email Dispatch │
│  • Real-time Gmail Daily Quota Monitoring              │
└────────────────────────────────────────────────────────┘
```

- **DTAI Launchpad Branding**: Modern rocket sign (🚀) brandmark with multi-toned aerospace gradient.
- **Created & Developed by Bodhidharma Lab**: Prominently attributed across all pages with a visionary emblem (Awakened Third Eye & Cyber-Enso orbital rings in radiant cosmic indigo, violet, and cyan gradients).
- **Zero-Build Architecture**: Deploy directly from Git without Node, Vite, or Webpack.
- **Official IIM Indore Bilingual Template**: Dual Hindi and English typography, double-stepped magenta executive borders, candidate photo placeholder, dynamic verification QR code, and triple signatory stamps.
- **Strict RFC 5322 Email Validation**: Automatically parses candidate spreadsheets, highlights invalid email patterns, and flags duplicates.
- **Mandatory Admin Approval Gating**: Candidates must be individually inspected and approved by the administrator before any certificates can be queued or dispatched via email.
- **Client-Side PDF Generation**: Produces crisp, print-ready landscape A4 PDF certificates (< 1 MB) using `html2canvas` and `jsPDF`.
- **Batch Export**: Download individual certificates or all certificates in a compressed `.zip` archive via `JSZip`.
- **Polite Delivery Queue**: Sends emails sequentially with configurable delays (preventing Gmail spam triggers), real-time per-row progress, retry queues for failed rows, and post-dispatch Excel audit logs.

---

## 📁 Repository Structure

```
├── index.html            # DTAI Launchpad login portal with demo credentials
├── dashboard.html        # Main portal with 3-step stepper (Upload → Preview & Validate → Dispatch)
├── css/
│   └── styles.css        # Complete CSS design system, dark/light themes, and A4 cert styling
├── js/
│   ├── config.js         # Centralized configuration (Portal branding, IIM Indore copy, templates)
│   ├── ui.js             # Theme toggle, toast alerts, stepper, confetti, micro-interactions
│   ├── auth.js           # Session token management, route guards, and demo authorization
│   ├── excel.js          # SheetJS parser, RFC 5322 validator, column synonyms, workspace loader
│   ├── certificate.js    # Certificate DOM binder, QR code generator, html2canvas/jsPDF renderer
│   └── mailer.js         # Gated dispatch queue (approved rows only), retries, audit report
├── assets/
│   ├── rocket.svg        # DTAI Launchpad aerodynamic rocket brandmark
│   ├── bodhidharma-logo.svg # Bodhidharma Lab visionary emblem & wordmark
│   ├── bodhidharma-icon.svg # Bodhidharma standalone visionary icon
│   ├── avatar.svg        # Candidate executive silhouette portrait
│   └── logo.svg          # IIM Indore official circular emblem & EQUIS crest
├── IIMcandidatelist.xlsx # Sample candidate roster with Hindi & English names
├── backend/
│   └── Code.gs           # Serverless Google Apps Script API
└── README.md             # Documentation and deployment guide
```

---

## 🚀 1. Google Apps Script Backend Setup

The backend runs completely free on your Google account using Google Apps Script.

### Step 1: Create the Apps Script Project
1. Open [Google Apps Script](https://script.google.com/) and click **+ New project**.
2. Rename the project to `Certificate-Portal-Backend`.
3. Clear the default editor and copy-paste the entire contents of [`backend/Code.gs`](file:///backend/Code.gs).

### Step 2: Initialize Your Admin Credentials
You can initialize your credentials with **one click**:
1. In the Apps Script toolbar, locate the function dropdown (default says `myFunction` or `doGet`).
2. Select **`setupAdminAccount`**.
3. (Optional) Inside `setupAdminAccount()` in `Code.gs`, you can change the default username (`admin`) and password (`Admin@2026!Secure`).
4. Click **Run**.
5. When prompted, click **Review permissions**, choose your Google account, click **Advanced**, and select **Go to Certificate-Portal-Backend (unsafe)**. Grant the permissions (this allows the script to send emails and store properties on your behalf).
6. Check the **Execution log** at the bottom: you will see a confirmation that your admin username, SHA-256 password hash, and session secret are saved in `ScriptProperties`.

### Step 3: Deploy as a Web App
1. At the top right of the editor, click **Deploy** > **New deployment**.
2. Click the gear icon (**Select type**) and select **Web app**.
3. Configure the deployment settings:
   - **Description**: `Production v1`
   - **Execute as**: **Me (your-email@gmail.com)** *(Important: allows the script to use your Gmail quota)*
   - **Who has access**: **Anyone** *(Important: allows your static frontend on GitHub Pages to reach the API)*
4. Click **Deploy**.
5. Copy the generated **Web App URL** (it ends with `/exec`).

### Step 4: Connect Backend to Frontend
Open [`js/config.js`](file:///js/config.js) in your local repository and paste your Web App URL into `CONFIG.APPS_SCRIPT_URL`:

```javascript
const CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbxYOUR_DEPLOYED_ID_HERE/exec",
  // ...
};
```

> **Note on Updates:** If you modify `Code.gs` in the future, remember to click **Deploy** > **Manage deployments** > **Edit** > select **New version** > **Deploy**.

---

## 🔐 2. How to Generate SHA-256 Password Hashes

Passwords are **never** stored in plain text. Google Apps Script stores and compares SHA-256 hex hashes.

### Option A: Using Your Browser Console (Recommended)
Open DevTools (`F12` or `Ctrl+Shift+I` / `Cmd+Option+I`) on any browser tab, go to the **Console**, and run:

```javascript
async function hashPassword(plainText) {
  const msgUint8 = new TextEncoder().encode(plainText);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  console.log("SHA-256 Hash:\n", hashHex);
  return hashHex;
}

// Example:
hashPassword("MyCustomAdminPassword2026!");
```

### Option B: Using Terminal (macOS / Linux / WSL)
```bash
echo -n "MyCustomAdminPassword2026!" | shasum -a 256
```

### Option C: In Apps Script Editor
In the Apps Script editor, you can run the helper function `setupAdminAccount()` after updating `ADMIN_PASS` to automatically hash and store it into `PropertiesService.getScriptProperties()`.

---

## 🌐 3. Frontend Deployment

Because the frontend is 100% static (HTML, CSS, JS), it can be hosted for free on any static host.

### Deploying to GitHub Pages
1. Push your repository to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of Certificate Generator Portal"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```
2. Navigate to your repository on GitHub.
3. Click **Settings** > **Pages** (under Code and automation in the left sidebar).
4. Under **Build and deployment**:
   - **Source**: `Deploy from a branch`
   - **Branch**: `main`, folder: `/ (root)`
5. Click **Save**. Your site will be live at `https://<your-username>.github.io/<repo-name>/` in ~60 seconds.

### Deploying to Netlify
1. Log in to [Netlify](https://www.netlify.com/).
2. Drag and drop the repository folder directly into the **Netlify Drop** dashboard, or connect your GitHub repository.
3. Build command: *(leave empty)*. Publish directory: `.` (root).

### Deploying to Vercel
1. Install Vercel CLI (`npm i -g vercel`) and run `vercel`, or import the GitHub repository via the Vercel dashboard.
2. Framework Preset: **Other**. Root directory: `./`.

---

## 🎨 4. Customizing the Portal & Certificate

Everything is centralized in [`js/config.js`](file:///js/config.js) and [`css/styles.css`](file:///css/styles.css):

### Change Organization Branding & Logos
In [`js/config.js`](file:///js/config.js):
```javascript
ORGANIZATION: {
  name: "Apex Academy of Software Sciences",
  tagline: "Empowering Next-Generation Tech Innovators",
  logoPath: "assets/logo.svg",
  website: "https://apexacademy.edu",
  supportEmail: "certifications@apexacademy.edu"
}
```
Replace [`assets/logo.svg`](file:///assets/logo.svg) with your organization's SVG or PNG logo.

### Change Certificate Signatures & Titles
In [`js/config.js`](file:///js/config.js):
```javascript
CERTIFICATE: {
  title: "CERTIFICATE OF ACHIEVEMENT",
  defaultCourse: "Machine Learning & AI Engineering",
  signers: [
    {
      name: "Prof. Sarah Jenkins",
      title: "Dean of Computer Science",
      signatureText: "Sarah Jenkins"
    },
    {
      name: "David Kim",
      title: "Director of Credentialing",
      signatureText: "David Kim"
    }
  ]
}
```

### Change Email Subject & Notification Body
In [`js/config.js`](file:///js/config.js), modify `CONFIG.EMAIL.subject` and `CONFIG.EMAIL.bodyTemplate`. You can use placeholders:
- `{{name}}` - Candidate name
- `{{course}}` - Program or course name
- `{{certId}}` - Unique certificate ID
- `{{orgName}}` - Organization name
- `{{website}}` - Organization website
- `{{supportEmail}}` - Support email

---

## 📊 5. Excel / CSV File Format Specifications

Clicking **"Download Sample Template"** in the portal downloads a pre-formatted `.xlsx` file.

The parser handles case-insensitive and whitespace-tolerant headers:

| Field | Required? | Accepted Column Headers | Example |
| :--- | :---: | :--- | :--- |
| **Name** | **Yes** | `Name`, `Candidate Name`, `Student Name`, `Full Name`, `Recipient` | *Alex Morgan* |
| **Email** | **Yes** | `Email`, `Email Address`, `E-Mail`, `Mail` | *alex.morgan@example.com* |
| **Course** | *Optional* | `Course`, `Course Name`, `Program`, `Track`, `Event` | *Cloud Architecture* |
| **Date** | *Optional* | `Date`, `Issue Date`, `Completion Date` | *October 26, 2026* |
| **Certificate ID**| *Optional* | `Certificate ID`, `Cert ID`, `ID`, `Credential ID` | *NX-2026-0001* |

*Note: If Course, Date, or Certificate ID are omitted, the portal automatically populates the defaults defined in `CONFIG.CERTIFICATE`.*

---

## ⚠️ 6. Gmail Quotas & Rate Limits

- **Consumer Gmail accounts (`@gmail.com`)**: ~100 recipients / 24-hour sliding window.
- **Google Workspace accounts (`@yourdomain.com`)**: ~1,500 recipients / 24-hour window.
- The portal includes an automatic rate-limiting delay between individual email deliveries (`CONFIG.DISPATCH.delayBetweenEmailsMs = 1200`) to guarantee stability.
- If sending large batches (> 100), consider batching them over multiple days or upgrading to a dedicated transactional email service (see Roadmap).

---

## 🗺️ 7. Known Limitations & Enhancement Roadmap

| Feature | Current Implementation | Future Roadmap |
| :--- | :--- | :--- |
| **Email Service** | Google Apps Script (`MailApp` / `GmailApp`) | Add SendGrid, Resend, or Amazon SES adapter via Webhook |
| **Authentication** | Single Admin with SHA-256 & signed tokens | Multi-user roles (Admin, Reviewer, Issuer) via Supabase/Firebase Auth |
| **Certificate Design** | Hand-crafted HTML5/CSS3 landscape template | Drag-and-drop Visual Certificate Designer with custom background uploads |
| **Verification** | Unique Certificate ID printed on document | Public QR Code on certificate linking to `/verify.html?id=NX-2026-0001` |
| **Database** | Session-based memory with Excel Audit Export | Persistent cloud database (PostgreSQL / Firestore) storing all issued credentials |

---

## 📄 License
This project is open-source and free for commercial and non-commercial educational use under the MIT License.
