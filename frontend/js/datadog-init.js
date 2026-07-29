// datadog-init.js
// Enterprise-level Datadog initialization: RUM + Logs + Session Replay + User Tracking

(function(h,o,u,n,d) {
  h=h[d]=h[d]||{q:[],onReady:function(c){h.q.push(c)}}
  d=o.createElement(u);d.async=1;d.src=n
  n=o.getElementsByTagName(u)[0];n.parentNode.insertBefore(d,n)
})(window,document,'script','https://www.datadoghq-browser-agent.com/us1/v5/datadog-rum.js','DD_RUM');

(function(h,o,u,n,d) {
  h=h[d]=h[d]||{q:[],onReady:function(c){h.q.push(c)}}
  d=o.createElement(u);d.async=1;d.src=n
  n=o.getElementsByTagName(u)[0];n.parentNode.insertBefore(d,n)
})(window,document,'script','https://www.datadoghq-browser-agent.com/us1/v5/datadog-logs.js','DD_LOGS');

const datadogConfig = {
  applicationId: 'e3ea571f-ece6-46d3-bdf9-874e28c03fcb', 
  clientToken: 'pub97cd5b8f1cf4bca9ff76ffd64db502c7',
  site: 'us5.datadoghq.com',
  service: 'mypatholabs-client',
  env: 'production',
  version: '1.0.0', 
};

function initDatadog(consentStatus) {
  const isDeclined = consentStatus === 'declined';
  const sessionReplaySampleRate = isDeclined ? 0 : 100;
  const defaultPrivacyLevel = isDeclined ? 'mask' : 'mask-user-input';

  // Initialize RUM
  window.DD_RUM.onReady(function() {
    window.DD_RUM.init({
      ...datadogConfig,
      sessionSampleRate: 100,
      sessionReplaySampleRate: sessionReplaySampleRate,
      trackUserInteractions: true,
      trackResources: true,
      trackLongTasks: true,
      defaultPrivacyLevel: defaultPrivacyLevel,
      allowedTracingUrls: [
        { match: "https://api.mypatholabs.tech", propagatorTypes: ["datadog", "tracecontext"] },
        { match: "https://mylaboratory.onrender.com", propagatorTypes: ["datadog", "tracecontext"] },
        { match: "https://mypatholabs2.onrender.com", propagatorTypes: ["datadog", "tracecontext"] },
        { match: /localhost/, propagatorTypes: ["datadog", "tracecontext"] }
      ]
    });
    
    if (!isDeclined) {
      window.DD_RUM.startSessionReplayRecording();
    }
  });

  // Initialize Logs
  window.DD_LOGS.onReady(function() {
    window.DD_LOGS.init({
      ...datadogConfig,
      forwardErrorsToLogs: true,
      sessionSampleRate: 100,
    });
  });
}

// Check initial consent status
const currentConsent = localStorage.getItem('lis_cookie_consent');
let ddInitialized = false;
if (currentConsent) {
  initDatadog(currentConsent);
  ddInitialized = true;
}

// Expose a function to initialize after user clicks accept/decline in banner
window.applyCookieConsent = function(consentStatus) {
  localStorage.setItem('lis_cookie_consent', consentStatus);
  if (!ddInitialized) { // Prevent double-init
    initDatadog(consentStatus);
    ddInitialized = true;
  }
};

// Function to attach user identity. Call this upon login or session restore.
window.setDatadogUser = function(user) {
  const consentStatus = localStorage.getItem('lis_cookie_consent');
  if (consentStatus === 'declined') {
    return; // Anonymized Mode: Do not attach PII
  }

  if (user && user.id) {
    window.DD_RUM.onReady(function() {
      window.DD_RUM.setUser({
        id: user.id,
        name: user.name || user.username || undefined,
        email: user.email || undefined,
        role: user.role || undefined
      });
    });
    window.DD_LOGS.onReady(function() {
      window.DD_LOGS.setUser({
        id: user.id,
        name: user.name || user.username || undefined,
        email: user.email || undefined,
      });
    });
  }
};
