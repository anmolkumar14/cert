/**
 * ============================================================================
 * Certificate Generator Portal - Google Apps Script Backend (Code.gs)
 * ============================================================================
 * 
 * Free serverless backend providing:
 * 1. Admin Authentication: SHA-256 hash validation + signed expiring session tokens
 * 2. Automated Email Delivery: High-resolution PDF attachment via MailApp/GmailApp
 * 3. Daily Quota Reporting: Live monitoring of remaining Google email quota
 * 
 * SETUP INSTRUCTIONS:
 * 1. Open https://script.google.com and create a new project.
 * 2. Replace the editor contents with this file.
 * 3. Run the helper function `setupAdminAccount()` once to initialize credentials.
 * 4. Deploy as a Web App:
 *    - Click "Deploy" > "New deployment"
 *    - Type: "Web app"
 *    - Description: "Certificate Portal API v1"
 *    - Execute as: "Me" (your Google account)
 *    - Who has access: "Anyone"
 * 5. Copy the deployed Web App URL and paste it into `js/config.js` -> `APPS_SCRIPT_URL`.
 * ============================================================================
 */

// Global Constants & Expiration
var SESSION_DURATION_HOURS = 24;

/**
 * Handle incoming POST requests from the static frontend.
 * Frontend sends JSON stringified payload via Content-Type "text/plain"
 * to completely eliminate CORS preflight (OPTIONS) negotiation issues.
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({
        success: false,
        error: "Malformed request. Missing request payload."
      }, 400);
    }

    var payload = JSON.parse(e.postData.contents);
    var action = payload.action;

    switch (action) {
      case "login":
        return handleLogin(payload);

      case "verifySession":
        return handleVerifySession(payload);

      case "sendCertificateEmail":
        return handleSendCertificateEmail(payload);

      case "getQuota":
        return handleGetQuota(payload);

      default:
        return jsonResponse({
          success: false,
          error: "Unknown action specified: " + action
        }, 400);
    }
  } catch (err) {
    Logger.log("doPost Error: " + err.toString());
    return jsonResponse({
      success: false,
      error: "Internal Server Error: " + err.message
    }, 500);
  }
}

/**
 * Handle incoming GET requests.
 * Acts as a health check and configuration status endpoint.
 */
function doGet(e) {
  var props = PropertiesService.getScriptProperties();
  var isConfigured = !!props.getProperty("ADMIN_USERNAME") && !!props.getProperty("ADMIN_PASSWORD_HASH");
  var remainingQuota = MailApp.getRemainingDailyQuota();

  return jsonResponse({
    status: "online",
    service: "Certificate Generator Backend",
    version: "1.0.0",
    configured: isConfigured,
    remainingDailyQuota: remainingQuota,
    timestamp: new Date().toISOString()
  });
}

/**
 * Action: Login
 * Validates provided username and SHA-256 password hash against ScriptProperties.
 * Returns an HMAC-signed session token.
 */
function handleLogin(payload) {
  var username = (payload.username || "").trim();
  var password = payload.password || ""; // Plain password from user to be hashed on server

  if (!username || !password) {
    return jsonResponse({
      success: false,
      error: "Username and password are required."
    });
  }

  var props = PropertiesService.getScriptProperties();
  var storedUser = props.getProperty("ADMIN_USERNAME");
  var storedHash = props.getProperty("ADMIN_PASSWORD_HASH");

  // Fallback defaults if setupAdminAccount() hasn't been run yet
  if (!storedUser || !storedHash) {
    return jsonResponse({
      success: false,
      error: "Backend credentials not initialized. Please run setupAdminAccount() in the Apps Script editor."
    });
  }

  // Compute SHA-256 of the submitted password
  var inputHash = computeSha256(password);

  // Constant-time-like validation
  if (username.toLowerCase() !== storedUser.toLowerCase() || inputHash !== storedHash) {
    return jsonResponse({
      success: false,
      error: "Invalid username or password. Please verify your credentials."
    });
  }

  // Generate signed session token
  var secret = getOrCreateSecret();
  var expiresAt = new Date().getTime() + (SESSION_DURATION_HOURS * 60 * 60 * 1000);
  var sessionData = {
    user: storedUser,
    exp: expiresAt,
    iat: new Date().getTime()
  };

  var token = generateSignedToken(sessionData, secret);

  return jsonResponse({
    success: true,
    message: "Login successful.",
    token: token,
    expiresAt: expiresAt,
    user: {
      username: storedUser
    },
    remainingQuota: MailApp.getRemainingDailyQuota()
  });
}

/**
 * Action: Verify Session Token
 */
function handleVerifySession(payload) {
  var token = payload.token;
  var validation = validateToken(token);

  if (!validation.valid) {
    return jsonResponse({
      success: false,
      valid: false,
      error: validation.error
    });
  }

  return jsonResponse({
    success: true,
    valid: true,
    user: validation.data.user,
    expiresAt: validation.data.exp,
    remainingQuota: MailApp.getRemainingDailyQuota()
  });
}

/**
 * Action: Send Certificate Email
 * Receives candidate details + base64 encoded PDF certificate.
 * Attaches the PDF and dispatches a branded HTML email.
 */
function handleSendCertificateEmail(payload) {
  // 1. Verify authentication token
  var token = payload.token;
  var validation = validateToken(token);
  if (!validation.valid) {
    return jsonResponse({
      success: false,
      error: "Authentication failed or session expired. Please log in again."
    }, 401);
  }

  // 2. Validate parameters
  var recipientEmail = (payload.recipientEmail || "").trim();
  var recipientName = (payload.recipientName || "").trim();
  var courseName = (payload.courseName || "Certification Program").trim();
  var certId = (payload.certId || "N/A").trim();
  var pdfBase64 = payload.pdfBase64 || "";
  var customSubject = payload.subject || ("Certificate of Achievement - " + recipientName);
  var customHtml = payload.htmlBody || "";

  if (!recipientEmail || !isValidEmail(recipientEmail)) {
    return jsonResponse({
      success: false,
      error: "Invalid recipient email address: " + recipientEmail
    });
  }

  if (!recipientName) {
    return jsonResponse({
      success: false,
      error: "Recipient name is required."
    });
  }

  if (!pdfBase64) {
    return jsonResponse({
      success: false,
      error: "Missing PDF certificate attachment data."
    });
  }

  // Check remaining quota
  var quota = MailApp.getRemainingDailyQuota();
  if (quota <= 0) {
    return jsonResponse({
      success: false,
      error: "Daily Gmail sending quota exhausted (0 remaining). Please resume tomorrow."
    });
  }

  // 3. Prepare PDF Attachment
  // Strip potential data URL prefix: "data:application/pdf;base64,"
  var cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, "").trim();
  var pdfBytes = Utilities.base64Decode(cleanBase64);
  var sanitizedFileName = "Certificate_" + recipientName.replace(/[^a-zA-Z0-9_\-]/g, "_") + ".pdf";
  var pdfBlob = Utilities.newBlob(pdfBytes, "application/pdf", sanitizedFileName);

  // 4. Construct Branded Email Body (if not provided by frontend)
  var emailHtml = customHtml;
  if (!emailHtml) {
    emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #4f46e5; margin-top: 0;">Congratulations, ${escapeHtml(recipientName)}!</h2>
        <p>We are delighted to present your official Certificate of Achievement for successfully completing <strong>${escapeHtml(courseName)}</strong>.</p>
        <p>Your unique Certificate Credential ID is: <code>${escapeHtml(certId)}</code></p>
        <p>Your certificate is attached to this email as a PDF. You may download, print, or attach it to your professional profiles.</p>
        <br/>
        <p style="color: #64748b; font-size: 13px;">Warm regards,<br>Certification Advisory Board</p>
      </div>
    `;
  }

  var plainText = "Dear " + recipientName + ",\n\n"
    + "Congratulations on completing " + courseName + "!\n"
    + "Your Certificate ID: " + certId + "\n\n"
    + "Please find your official Certificate of Achievement attached to this email as a PDF.\n\n"
    + "Best regards,\nCertification Board";

  // 5. Send via MailApp
  try {
    MailApp.sendEmail({
      to: recipientEmail,
      subject: customSubject,
      body: plainText,
      htmlBody: emailHtml,
      attachments: [pdfBlob],
      name: payload.senderName || "Certification Portal"
    });

    var updatedQuota = MailApp.getRemainingDailyQuota();

    return jsonResponse({
      success: true,
      message: "Email dispatched successfully to " + recipientEmail,
      recipient: recipientEmail,
      certId: certId,
      remainingQuota: updatedQuota
    });
  } catch (mailErr) {
    Logger.log("MailApp delivery error: " + mailErr.toString());
    return jsonResponse({
      success: false,
      error: "Gmail API error: " + mailErr.message
    });
  }
}

/**
 * Action: Get Remaining Quota
 */
function handleGetQuota(payload) {
  var token = payload.token;
  var validation = validateToken(token);
  if (!validation.valid) {
    return jsonResponse({ success: false, error: "Unauthorized" }, 401);
  }

  return jsonResponse({
    success: true,
    remainingDailyQuota: MailApp.getRemainingDailyQuota()
  });
}

/**
 * ----------------------------------------------------------------------------
 * Security & Utility Helpers
 * ----------------------------------------------------------------------------
 */

/**
 * Compute SHA-256 hex string of input
 */
function computeSha256(input) {
  var rawBytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    input,
    Utilities.Charset.UTF_8
  );
  var hexString = "";
  for (var i = 0; i < rawBytes.length; i++) {
    var byteVal = rawBytes[i];
    if (byteVal < 0) byteVal += 256;
    var byteHex = byteVal.toString(16);
    if (byteHex.length === 1) hexString += "0";
    hexString += byteHex;
  }
  return hexString;
}

/**
 * Retrieve or generate a persistent HMAC session secret
 */
function getOrCreateSecret() {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty("SESSION_SECRET");
  if (!secret) {
    secret = Utilities.getUuid() + "-" + computeSha256(new Date().getTime().toString());
    props.setProperty("SESSION_SECRET", secret);
  }
  return secret;
}

/**
 * Generate a signed session token: Base64(Data) + "." + Base64(HMAC-SHA256)
 */
function generateSignedToken(dataObj, secret) {
  var dataJson = JSON.stringify(dataObj);
  var dataB64 = Utilities.base64EncodeWebSafe(dataJson);
  var signatureBytes = Utilities.computeHmacSha256Signature(dataB64, secret);
  var sigB64 = Utilities.base64EncodeWebSafe(signatureBytes);
  return dataB64 + "." + sigB64;
}

/**
 * Validate token signature and check expiration
 */
function validateToken(token) {
  if (!token || typeof token !== "string" || token.indexOf(".") === -1) {
    return { valid: false, error: "Missing or malformed token." };
  }

  var parts = token.split(".");
  if (parts.length !== 2) {
    return { valid: false, error: "Invalid token structure." };
  }

  var dataB64 = parts[0];
  var sigB64 = parts[1];

  var secret = getOrCreateSecret();
  var expectedSigBytes = Utilities.computeHmacSha256Signature(dataB64, secret);
  var expectedSigB64 = Utilities.base64EncodeWebSafe(expectedSigBytes);

  if (sigB64 !== expectedSigB64) {
    return { valid: false, error: "Invalid token signature." };
  }

  try {
    var decodedJson = Utilities.newBlob(Utilities.base64DecodeWebSafe(dataB64)).getDataAsString();
    var data = JSON.parse(decodedJson);

    var now = new Date().getTime();
    if (data.exp && now > data.exp) {
      return { valid: false, error: "Session has expired. Please sign in again." };
    }

    return { valid: true, data: data };
  } catch (e) {
    return { valid: false, error: "Failed to decode session data." };
  }
}

/**
 * Format standard JSON HTTP response
 */
function jsonResponse(data, statusCode) {
  var output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

/**
 * Simple email validation regex
 */
function isValidEmail(email) {
  var re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

/**
 * Basic HTML escaping
 */
function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * ============================================================================
 * ONE-CLICK SETUP HELPER (Run this inside Google Apps Script Editor!)
 * ============================================================================
 * 
 * Select `setupAdminAccount` in the dropdown in Google Apps Script editor,
 * then click "Run". This will automatically set your credentials into
 * Script Properties securely without needing to type raw hashes manually.
 */
function setupAdminAccount() {
  // Customize your desired username and password here before running:
  var ADMIN_USER = "admin";
  var ADMIN_PASS = "Admin@2026!Secure";

  var passHash = computeSha256(ADMIN_PASS);
  var props = PropertiesService.getScriptProperties();

  props.setProperty("ADMIN_USERNAME", ADMIN_USER);
  props.setProperty("ADMIN_PASSWORD_HASH", passHash);
  
  // Also initialize session secret
  getOrCreateSecret();

  Logger.log("=================================================");
  Logger.log("✅ Admin account initialized successfully!");
  Logger.log("Username: " + ADMIN_USER);
  Logger.log("Password Hash: " + passHash);
  Logger.log("Session Secret initialized.");
  Logger.log("=================================================");
}

/**
 * Test function to verify script email sending capability from editor
 */
function testEmailSending() {
  var myEmail = Session.getActiveUser().getEmail();
  if (!myEmail) {
    Logger.log("No active user email detected. Enter an email manually.");
    return;
  }

  Logger.log("Sending test email to: " + myEmail);
  MailApp.sendEmail({
    to: myEmail,
    subject: "Certificate Portal - Test Email",
    body: "Hello! This is a verification email from your Certificate Generator backend. If you received this, your Google Apps Script is working properly!"
  });
  Logger.log("✅ Email sent! Remaining quota: " + MailApp.getRemainingDailyQuota());
}
