(function () {
  "use strict";
  var STORAGE_KEY = "jobtrackr.v1";
  // Legacy storage keys (older brand names) — read as fallback so existing data migrates.
  var LEGACY_KEYS = ["catchtheoffer.v1", "internship-tracker.v1"];
  var SYNC_KEY = "jobtrackr.sync";
  var STUDY_KEY = "jobtrackr.study";
  var USER_KEY  = "jobtrackr.user";   // display name shown in the greeting banner

  var STATUSES = [
    { name: "Applied",                   key: "sky",    pending: true  },
    { name: "Online Assessment / Test",  key: "violet", pending: true  },
    { name: "Interview",                 key: "amber",  pending: true  },
    { name: "Offer Received",            key: "green",  pending: false },
    { name: "Rejected",                  key: "rose",   pending: false },
    { name: "Withdrawn",                 key: "slate",  pending: false }
  ];
  var LEGACY_MAP = {
    "Not Started / To Apply": "Applied", "Applied / Pending": "Applied",
    "OA / Technical Assessment": "Online Assessment / Test",
    "Online Assessment": "Online Assessment / Test",  // migrate prior naming
    "OA": "Online Assessment / Test",
    "HR / Screening Interview": "Interview", "Technical / Round 1 Interview": "Interview",
    "Final Round Interview": "Interview", "Offer Received": "Offer Received",
    "Rejected": "Rejected", "Withdrawn": "Withdrawn"
  };

  var FIELDS = ["company","role","location","status","industry","industryOther","jobdesc","url","appliedDate","deadline","followup",
    "oaDate","interviewDates","stageNotes","comp","hours","offerDeadline","priority","prosCons","equity","perks",
    "referral","docs","nextAction"];
  // Availability dates are handled explicitly (custom input IDs, not the f_ convention).

  // ---------- Industries ----------
  var INDUSTRIES = [
    "Technology & Software",
    "Fintech & Financial Services",
    "Banking & Capital Markets",
    "Cybersecurity",
    "Artificial Intelligence & Data Science",
    "E-Commerce & Retail Tech",
    "Management Consulting",
    "Telecommunications",
    "Government & Public Sector",
    "Healthcare & HealthTech",
    "Logistics & Supply Chain",
    "Gaming & Entertainment",
    "Education & EdTech",
    "Semiconductors & Hardware",
    "Media, Advertising & Marketing",
    "Real Estate & PropTech",
    "Energy & CleanTech",
    "Others"
  ];
  // Resolve the display value: custom text when "Others" is chosen, else the selected industry.
  function industryOf(x) {
    if (x.industry === "Others") return x.industryOther || "Others";
    return x.industry || "";
  }

  // ---------- Categories (legacy auto-classifier, retained for data migration only) ----------
  // id, label, and keyword signals used to auto-classify by role title / JD.
  var CATEGORIES = [
    { id:"all",     label:"All Jobs",                     icon:"🗂️" },
    { id:"tech",    label:"Tech & Software Engineering",  icon:"💻", kws:["software","engineer","developer","backend","frontend","full stack","full-stack","sde","swe","programmer","web","mobile","devops","cloud","platform","infrastructure","systems engineer"] },
    { id:"data",    label:"Data Analytics & AI",          icon:"📈", kws:["data","analytics","analyst","machine learning","ml ","ai ","artificial intelligence","data science","data scientist","bi ","business intelligence","big data","data engineer","deep learning"] },
    { id:"fintech", label:"Fintech & Payments",           icon:"💳", kws:["fintech","payment","payments","banking","trading","quant","blockchain","crypto","digital finance","wealth","insurtech"] },
    { id:"product", label:"Product & Operations",         icon:"🧩", kws:["product","operations","program manager","project manager","business","strategy","consulting","ops","product manager","growth","go-to-market"] }
  ];
  // ---------- Status filter tabs ----------
  // The feed tab bar groups applications by APPLICATION STATUS.
  // Each tab maps to one or more canonical statuses. "all" matches everything.
  var STATUS_TABS = [
    { id:"all",        label:"All Applications",         statuses:null },
    { id:"applied",    label:"Applied",                  statuses:["Applied"] },
    { id:"test",       label:"Test / Online Assessment", statuses:["Online Assessment / Test"] },
    { id:"interview",  label:"Interviewing",             statuses:["Interview"] },
    { id:"offer",      label:"Offer Received",           statuses:["Offer Received"] },
    { id:"closed",     label:"Rejected / Withdrawn",     statuses:["Rejected","Withdrawn"] }
  ];
  var STATUS_TAB_CURRENT = "all";
  var favOnly = false;   // "★ Favorites" quick filter (bookmarked only)
  var hideArchived = false;   // "🗄 Hide Archived" — hide Rejected & Withdrawn from the feed
  function statusTabDef(id) { for (var i=0;i<STATUS_TABS.length;i++) if (STATUS_TABS[i].id===id) return STATUS_TABS[i]; return STATUS_TABS[0]; }
  function matchesStatusTab(x, id) {
    var t = statusTabDef(id);
    if (!t.statuses) return true;            // "all"
    return t.statuses.indexOf(x.status) >= 0;
  }

  function categorize(x) {
    // manual override wins (if user picked a specific category)
    if (x.category && x.category !== "auto" && x.category !== "all") {
      if (CATEGORIES.some(function (c){ return c.id === x.category; })) return x.category;
    }
    var text = ((x.role||"") + " " + (x.jobdesc||"")).toLowerCase() + " ";
    // Fintech is most specific -> check first so "Fintech SWE" lands in Fintech
    var order = ["fintech","data","tech","product"];
    for (var i=0;i<order.length;i++) {
      var cat = CATEGORIES.filter(function (c){ return c.id===order[i]; })[0];
      if (cat && cat.kws.some(function (k){ return text.indexOf(k)>=0; })) return cat.id;
    }
    return "tech"; // sensible default for internships
  }
  function catLabel(id) { var c=CATEGORIES.filter(function (k){ return k.id===id; })[0]; return c?c.label:id; }
  function catIcon(id) { var c=CATEGORIES.filter(function (k){ return k.id===id; })[0]; return c?c.icon:""; }

  // avatar gradient palette (deterministic per company)
  var AV_GRADS = [
    ["#0ea5e9","#2563eb"], ["#9333ea","#c026d3"], ["#f59e0b","#ef4444"],
    ["#10b981","#059669"], ["#ec4899","#8b5cf6"], ["#14b8a6","#0ea5e9"],
    ["#f43f5e","#f97316"], ["#6366f1","#3b82f6"]
  ];

  // one-time migration of sync/study keys from older brand names
  (function migrateKeys() {
    try {
      if (!localStorage.getItem(SYNC_KEY) && localStorage.getItem("catchtheoffer.sync"))
        localStorage.setItem(SYNC_KEY, localStorage.getItem("catchtheoffer.sync"));
      if (!localStorage.getItem(STUDY_KEY) && localStorage.getItem("catchtheoffer.study"))
        localStorage.setItem(STUDY_KEY, localStorage.getItem("catchtheoffer.study"));
    } catch (e) {}
  })();

  var data = load();
  var editingId = null;
  var view = "feed";
  var tab = "dashboard";
  var statusTargetId = null;

  // ---------- persistence ----------
  function load() {
    var raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    // migrate from older brand keys if the current key is empty
    if (!raw) {
      for (var i = 0; i < LEGACY_KEYS.length && !raw; i++) {
        try { raw = localStorage.getItem(LEGACY_KEYS[i]); } catch (e) {}
      }
    }
    var arr = []; try { arr = raw ? JSON.parse(raw) : []; } catch (e) { arr = []; }
    arr.forEach(function (x) {
      if (x.status && LEGACY_MAP[x.status]) x.status = LEGACY_MAP[x.status];
      if (!statusValid(x.status)) x.status = "Applied";
    });
    return arr;
  }
  function statusValid(n) { for (var i=0;i<STATUSES.length;i++) if (STATUSES[i].name===n) return true; return false; }
  function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
  function statusDef(n) { for (var i=0;i<STATUSES.length;i++) if (STATUSES[i].name===n) return STATUSES[i]; return STATUSES[0]; }
  function pillHTML(n) { return '<span class="pill '+statusDef(n).key+'"><span class="dot"></span>'+esc(n)+'</span>'; }
  function swDot(n) { return '<span class="sw pill '+statusDef(n).key+'" style="padding:0;width:9px;height:9px;box-shadow:none;"></span>'; }

  function fmtDate(d) { if (!d) return ""; var p=d.split("-"); if (p.length!==3) return d;
    var m=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]; return m[parseInt(p[1],10)-1]+" "+parseInt(p[2],10); }
  // "May 2027 – Aug 2027" style from start/end ISO dates (falls back to legacy term text).
  function monthYear(d) { if (!d) return ""; var p=d.split("-"); if (p.length<2) return d;
    var m=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]; return m[parseInt(p[1],10)-1]+" "+p[0]; }
  function availabilityLabel(x) {
    var s = x.startDate, e = x.endDate;
    if (s && e) return monthYear(s) + " – " + monthYear(e);
    if (s) return "From " + monthYear(s);
    if (e) return "Until " + monthYear(e);
    return x.term || ""; // backward-compat: show legacy free-text term if present
  }
  function daysUntil(d) { if (!d) return null; var t=new Date(); t.setHours(0,0,0,0); return Math.round((new Date(d+"T00:00:00")-t)/86400000); }
  function daysSince(d) { if (!d) return null; var t=new Date(); t.setHours(0,0,0,0); return Math.round((t-new Date(d+"T00:00:00"))/86400000); }
  // Parse a stipend/comp string into a comparable monthly number (e.g. "$2,500/month" -> 2500)
  function stipendValue(comp) {
    if (!comp) return -1;
    var s = String(comp).toLowerCase().replace(/,/g, "");
    var m = s.match(/(\d+(?:\.\d+)?)\s*k\b/); // handle "2.5k"
    var n;
    if (m) { n = parseFloat(m[1]) * 1000; }
    else { var d = s.match(/\d+(?:\.\d+)?/); n = d ? parseFloat(d[0]) : -1; }
    if (n < 0) return -1;
    if (/year|annum|\/yr|p\.a|pa\b/.test(s)) n = n / 12; // normalize annual -> monthly
    if (/week|\/wk/.test(s)) n = n * 4.33;               // weekly -> monthly
    if (/hour|\/hr|hourly/.test(s)) n = n * 160;         // hourly -> monthly (approx)
    return n;
  }

  // Strict archived test: only true when explicitly archived (flag or status),
  // so active apps (Offer Received, Interview, etc.) never get dimmed.
  function isArchived(x) {
    return x.isArchived === true || x.archived === true || x.status === "Archived";
  }
  // Four canonical work-arrangement labels. Any legacy/custom location string
  // (e.g. "Singapore / Hybrid", "singapore", "WFH") maps cleanly to one of these.
  function normalizeLocation(loc) {
    if (!loc) return "";
    var s = String(loc).toLowerCase();
    if (/hybrid/.test(s)) return "Hybrid";
    if (/remote|wfh|work from home|work-from-home/.test(s)) return "Remote";
    if (/overseas|relocat|abroad|international/.test(s)) return "Overseas / Relocation";
    if (/on[\s\-]?site|onsite|in[\s\-]?office|in[\s\-]?person/.test(s)) return "On-site";
    // Bare location names (e.g. "Singapore") with no work-model keyword default to On-site.
    return "On-site";
  }
  // Always render salary with currency + period, e.g. "$2,000/month".
  function formatSalary(comp) {
    if (comp == null || comp === "") return "";
    var raw = String(comp).trim();
    // Already formatted (has $ and a period or 'k') -> leave as-is.
    if (/[$€£]/.test(raw) && /(month|mo|year|yr|week|wk|hour|hr|annum|\/)/i.test(raw)) return raw;
    var v = stipendValue(comp);                 // parse to a monthly number
    if (v == null || v < 0) return raw;          // unparseable -> show as given
    return "$" + Math.round(v).toLocaleString() + "/month";
  }
  function countdownBadge(x) {
    var du = daysUntil(x.deadline); if (du===null) return "";
    if (du < 0) return '<span class="countdown past">⏳ Deadline Passed</span>';
    if (du === 0) return '<span class="countdown urgent">⏳ Due Today</span>';
    if (du <= 3) return '<span class="countdown urgent">⏳ '+du+'d Left</span>';
    if (du <= 14) return '<span class="countdown">⏳ '+du+'d Left</span>';
    return '<span class="chiptag">⏳ '+fmtDate(x.deadline)+'</span>';
  }
  // 4-stage progress stepper: Applied -> Test -> Interview -> Offer.
  // Returns HTML highlighting stages completed/reached for the current status.
  var STEP_STAGES = ["Applied", "Test", "Interview", "Offer"];
  function statusStepIndex(status) {
    switch (status) {
      case "Applied": return 0;
      case "Online Assessment / Test": return 1;
      case "Interview": return 2;
      case "Offer Received": return 3;
      case "Rejected":
      case "Withdrawn": return -1;   // terminal / inactive
      default: return 0;
    }
  }
  function progressStepper(x) {
    var idx = statusStepIndex(x.status);
    var inactive = idx < 0;              // Rejected / Withdrawn
    var cls = "stepper" + (inactive ? " inactive" : "");
    var dots = STEP_STAGES.map(function (label, i) {
      var state = "";
      if (!inactive) {
        if (i < idx) state = " done";
        else if (i === idx) state = " current";
      }
      var line = i < STEP_STAGES.length - 1
        ? '<span class="step-line' + (!inactive && i < idx ? " done" : "") + '"></span>'
        : "";
      return '<span class="step' + state + '"><span class="step-dot"></span>' +
        '<span class="step-label">' + label + '</span></span>' + line;
    }).join("");
    return '<div class="' + cls + '">' + dots + '</div>';
  }

  // Stale if still "Applied" or "Online Assessment / Test" with no update in 14+ days.
  function followUpDue(x) {
    if (x.status !== "Applied" && x.status !== "Online Assessment / Test") return false;
    var since = daysSince(x.followup || x.appliedDate);
    return since !== null && since >= 14;
  }
  function avatar(company, small) {
    var name = (company||"?").trim();
    var initials = name.split(/\s+/).map(function (w){ return w[0]||""; }).join("").slice(0,2).toUpperCase() || "?";
    var sum = 0; for (var i=0;i<name.length;i++) sum += name.charCodeAt(i);
    var g = AV_GRADS[sum % AV_GRADS.length];
    var grad = 'linear-gradient(135deg,'+g[0]+','+g[1]+')';
    // The gradient initials sit underneath; a company logo <img> is layered on top.
    // If the logo fails to load, onerror hides the img, revealing the initials fallback.
    var domain = (arguments.length > 1 && arguments[1]) ? arguments[1] : companyDomain(name);
    var img = "";
    if (domain) {
      var src = "https://logo.clearbit.com/" + encodeURIComponent(domain);
      var fav = "https://www.google.com/s2/favicons?domain=" + encodeURIComponent(domain) + "&sz=128";
      // First error -> try Google favicon; second error -> hide img (show initials).
      img = '<img class="logo-img" src="'+src+'" alt="'+esc(name)+' logo" loading="lazy" ' +
            'onerror="if(!this.dataset.fb){this.dataset.fb=1;this.src=\''+fav+'\';}else{this.style.display=\'none\';}" />';
    }
    return '<div class="avatar" style="background:'+grad+'"><span class="av-initials">'+esc(initials)+'</span>'+img+'</div>';
  }

  // Map common company names to official domains; fall back to a sensible guess.
  var DOMAIN_MAP = {
    "grab":"grab.com", "razer":"razer.com", "endowus":"endowus.com", "stripe":"stripe.com",
    "apple":"apple.com", "visa":"visa.com", "shopee":"shopee.com", "google":"google.com",
    "meta":"meta.com", "facebook":"meta.com", "amazon":"amazon.com", "microsoft":"microsoft.com",
    "netflix":"netflix.com", "tiktok":"tiktok.com", "bytedance":"bytedance.com", "sea":"sea.com",
    "sea limited":"sea.com", "garena":"garena.com", "dbs":"dbs.com", "ocbc":"ocbc.com",
    "uob":"uob.com.sg", "gic":"gic.com.sg", "temasek":"temasek.com.sg", "grabpay":"grab.com",
    "paypal":"paypal.com", "wise":"wise.com", "revolut":"revolut.com", "nvidia":"nvidia.com",
    "intel":"intel.com", "ibm":"ibm.com", "oracle":"oracle.com", "salesforce":"salesforce.com",
    "goldman sachs":"goldmansachs.com", "jpmorgan":"jpmorgan.com", "morgan stanley":"morganstanley.com",
    "shopify":"shopify.com", "airbnb":"airbnb.com", "uber":"uber.com", "lazada":"lazada.com",
    "singtel":"singtel.com", "starhub":"starhub.com", "accenture":"accenture.com", "deloitte":"deloitte.com"
  };
  function companyDomain(name, portalUrl) {
    // 1) explicit portal URL wins
    if (portalUrl) {
      try {
        var u = portalUrl.indexOf("http")===0 ? portalUrl : "https://"+portalUrl;
        var host = new URL(u).hostname.replace(/^www\./, "");
        if (host && host.indexOf(".")>0) return host;
      } catch (e) {}
    }
    var key = (name||"").trim().toLowerCase();
    if (!key) return "";
    if (DOMAIN_MAP[key]) return DOMAIN_MAP[key];
    // 2) guess: strip punctuation/spaces -> name.com (works for most single-word brands)
    var slug = key.replace(/&/g,"and").replace(/[^a-z0-9]/g,"");
    return slug ? slug + ".com" : "";
  }

  // ---------- follow-up email ----------
  function followUpEmail(x) {
    var name = (x.referral && x.referral.split(/[,(]/)[0].trim()) || "there";
    var role = x.role || "the internship role";
    var company = x.company ? " at " + x.company : "";
    var applied = x.appliedDate ? " on " + fmtDate(x.appliedDate) : " recently";
    return "Hi " + name + ",\n\nI hope you're doing well. I'm writing to follow up on my application for the " + role + " position" + company +
      ", which I submitted" + applied + ".\n\nI remain very enthusiastic about the opportunity and would welcome the chance to contribute. " +
      "I'd be grateful for any update you can share on the status of my application.\n\nThank you for your time and consideration.\n\nBest regards,\n[Your Name]";
  }
  function copyFollowUp(id) {
    var x = data.find(function (v){ return v.id===id; }); if (!x) return;
    var text = followUpEmail(x);
    function done(){ showToast("✉️ Follow-up email copied"); }
    function fallback() { var ta=document.createElement("textarea"); ta.value=text; ta.style.position="fixed"; ta.style.opacity="0";
      document.body.appendChild(ta); ta.focus(); ta.select(); try { document.execCommand("copy"); done(); } catch(e){ showToast("Copy failed"); } document.body.removeChild(ta); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
  }
  var toastTimer;
  function showToast(msg) { var t=$("toast"); t.textContent=msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer=setTimeout(function (){ t.classList.remove("show"); }, 2000); }

  function fillStatusSelects() {
    $("f_status").innerHTML = STATUSES.map(function (s){ return '<option value="'+esc(s.name)+'">'+esc(s.name)+'</option>'; }).join("");
    $("statusFilter").insertAdjacentHTML("beforeend", STATUSES.map(function (s){ return '<option value="'+esc(s.name)+'">'+esc(s.name)+'</option>'; }).join(""));
    // industry select
    $("f_industry").innerHTML = '<option value="">Select industry...</option>' +
      INDUSTRIES.map(function (i){ return '<option value="'+esc(i)+'">'+esc(i)+'</option>'; }).join("");
  }
  // Toggle the custom-industry text field when "Others" is selected.
  function toggleIndustryOther() {
    var wrap = $("industryOtherWrap");
    if (wrap) wrap.style.display = ($("f_industry").value === "Others") ? "" : "none";
  }
  // Mark empty date fields so the uppercase DD/MM/YYYY placeholder hint shows.
  function refreshDatePlaceholders() {
    var inputs = document.querySelectorAll("input.date-dmy");
    Array.prototype.forEach.call(inputs, function (el) {
      el.setAttribute("data-empty", el.value ? "false" : "true");
    });
  }
  // Gray out form selects that are still on their empty "Select…" option,
  // so they read like placeholders rather than real selected values.
  // Set color inline so it always wins over native select styling.
  function refreshSelectPlaceholders() {
    ["f_location","f_industry","f_priority"].forEach(function (id) {
      var el = $(id); if (!el) return;
      var empty = !el.value;
      el.setAttribute("data-placeholder", empty ? "true" : "false");
      el.style.color = empty ? "#94a3b8" : "#0f172a";
    });
  }

  // ---------- metrics ----------
  function metrics() {
    var total = data.length;
    var inprog = data.filter(function (x){ return x.status==="Online Assessment / Test"||x.status==="Interview"; }).length;
    var pending = data.filter(function (x){ return statusDef(x.status).pending; }).length;
    var offers = data.filter(function (x){ return x.status==="Offer Received"; }).length;
    var rejected = data.filter(function (x){ return x.status==="Rejected"; }).length;
    var action = data.filter(function (x){ return followUpDue(x) || (daysUntil(x.deadline)!==null && daysUntil(x.deadline)>=0 && daysUntil(x.deadline)<=3 && statusDef(x.status).pending); }).length;
    var responded = data.filter(function (x){ return x.status!=="Applied"; }).length;
    var respRate = total ? Math.round(responded/total*100) : 0;
    return { total:total, inprog:inprog, pending:pending, offers:offers, rejected:rejected, action:action, respRate:respRate };
  }

  function renderSummary(into) {
    var m = metrics();
    function card(label, num, acc, fill, icon) {
      return '<div class="scard" style="--acc:'+acc+'; --fill:'+fill+'">' +
        '<div class="ico">'+icon+'</div><div class="num">'+num+'</div><div class="lbl">'+esc(label)+'</div></div>';
    }
    var ring = '<div class="ratecard">' +
        '<div class="ring" style="--p:'+m.respRate+'"><div class="hole">'+m.respRate+'%</div></div>' +
        '<div class="rtxt" style="flex:1"><div class="rt">Response rate</div>' +
        '<div class="rs">'+ (m.total - m.pending) +' of '+m.total+' applications have progressed</div>' +
        '<div class="ratebar"><span style="width:'+m.respRate+'%"></span></div></div></div>';
    $(into).innerHTML =
      // Uniform white cards; status is conveyed by the metric number + icon tint.
      card("Total Applications", m.total, "#0077ed", "rgba(0,119,237,.12)", "💼") +   // primary brand blue
      card("In Progress", m.inprog, "#d97706", "rgba(217,119,6,.14)", "⏳") +          // amber
      card("Offers Received", m.offers, "#059669", "rgba(16,185,129,.15)", "🎉") +     // emerald green
      card("Action Required", m.action, "#e11d48", "rgba(225,29,72,.12)", "⚡") +       // rose red
      ring;
  }

  function renderAnalytics() {
    renderSummary("summary2");
    renderSalaryInsights();
    renderCalendar("calendar", true);   // interactive: allow clicking dates to add/edit notes here too
  }

  // Average monthly stipend per industry -> horizontal bar comparison.
  function renderSalaryInsights() {
    var el = $("salaryInsights"); if (!el) return;
    var sums = {}, counts = {};
    data.forEach(function (x) {
      var v = stipendValue(x.comp);
      if (v == null || v < 0) return;
      var ind = industryOf(x) || "General / Uncategorized";
      sums[ind] = (sums[ind]||0) + v; counts[ind] = (counts[ind]||0) + 1;
    });
    var rows = Object.keys(sums).map(function (ind) {
      return { industry: ind, avg: Math.round(sums[ind]/counts[ind]), n: counts[ind] };
    }).sort(function (a,b){ return b.avg - a.avg; });

    if (!rows.length) { el.innerHTML = '<div class="empty-note" style="padding:24px 10px">Add a monthly pay / salary to some applications to see the comparison by industry.</div>'; return; }
    var max = rows[0].avg || 1;
    el.innerHTML = '<div class="salary-chart">' + rows.map(function (r) {
      var pct = Math.max(6, Math.round(r.avg / max * 100));
      var payText = "$" + r.avg.toLocaleString() + " / month";
      var roleText = r.n + " role" + (r.n===1 ? "" : "s");
      return '<div class="sal-row">' +
        '<div class="sal-left">' +
          '<div class="sal-name" title="'+esc(r.industry)+'">'+esc(r.industry)+'</div>' +
          '<div class="sal-bar"><span style="width:'+pct+'%"></span></div>' +
        '</div>' +
        '<div class="sal-val">'+esc(payText)+'<span class="sal-n">· '+roleText+'</span></div>' +
      '</div>';
    }).join("") + '</div>';
  }

  // ---------- Deadline Calendar ----------
  var calMonth = (function(){ var d=new Date(); return { y:d.getFullYear(), m:d.getMonth() }; })();
  function deadlineSeverity(dateStr) {
    var du = daysUntil(dateStr);
    if (du === null) return null;
    if (du <= 0) return "red";       // today or passed
    if (du <= 3) return "amber";     // within 3 days
    return "norm";
  }
  // Event types shown on the calendar, each mapped from a stored field.
  var CAL_EVENTS = [
    { field:"deadline",       type:"deadline",  cls:"ev-deadline",  label:"Deadline",         emoji:"⏳" },
    { field:"oaDate",         type:"oa",         cls:"ev-oa",        label:"Online Assessment", emoji:"📝" },
    { field:"interviewDates", type:"interview",  cls:"ev-interview", label:"Interview",        emoji:"🎤" }
  ];
  // ---------- Calendar events/notes (localStorage, keyed by YYYY-MM-DD) ----------
  // Stored value is an object { kind:"event"|"reminder", title, location, notes, startsAt, endsAt }.
  // Legacy plain-string values are auto-upgraded on read.
  var CAL_NOTES_KEY = "jobtrackr.calnotes";
  function getCalNotes() { try { return JSON.parse(localStorage.getItem(CAL_NOTES_KEY)) || {}; } catch (e) { return {}; } }
  // Normalize a stored value into the structured event object.
  function eventFor(dateStr) {
    var raw = getCalNotes()[dateStr];
    if (!raw) return null;
    if (typeof raw === "string") return { kind:"event", title:"", location:"", notes:raw, startsAt:"", endsAt:"" };
    return { kind:raw.kind||"event", title:raw.title||"", location:raw.location||"", notes:raw.notes||"", startsAt:raw.startsAt||"", endsAt:raw.endsAt||"" };
  }
  // A short label for the cell pill (title first, else notes).
  function eventLabel(dateStr) {
    var e = eventFor(dateStr); if (!e) return "";
    return (e.title && e.title.trim()) || (e.notes && e.notes.trim()) || "";
  }
  function setEvent(dateStr, obj) {
    var all = getCalNotes();
    var hasContent = obj && ((obj.title&&obj.title.trim()) || (obj.notes&&obj.notes.trim()) || (obj.location&&obj.location.trim()));
    if (hasContent) all[dateStr] = {
      kind: obj.kind==="reminder"?"reminder":"event",
      title:(obj.title||"").trim(), location:(obj.location||"").trim(), notes:(obj.notes||"").trim(),
      startsAt:obj.startsAt||"", endsAt:obj.endsAt||""
    };
    else delete all[dateStr];
    try { localStorage.setItem(CAL_NOTES_KEY, JSON.stringify(all)); } catch (e) {}
  }
  function dayKey(y, m, day) {
    return y + "-" + String(m+1).padStart(2,"0") + "-" + String(day).padStart(2,"0");
  }
  function prettyDate(dateStr) {
    var p = dateStr.split("-"); if (p.length!==3) return dateStr;
    var d = new Date(parseInt(p[0],10), parseInt(p[1],10)-1, parseInt(p[2],10));
    return d.toLocaleDateString(undefined, { month:"long", day:"numeric", year:"numeric" });
  }

  // Collect all calendar events for a given year/month -> { day: [ {x, meta} ] }
  function eventsForMonth(y, m) {
    var byDay = {};
    data.forEach(function (x) {
      CAL_EVENTS.forEach(function (ev) {
        var val = x[ev.field];
        if (!val) return;
        var p = String(val).split("-"); if (p.length !== 3) return; // only ISO date values
        if (parseInt(p[0],10)===y && parseInt(p[1],10)-1===m) {
          var day = parseInt(p[2],10);
          (byDay[day] = byDay[day] || []).push({ x: x, ev: ev });
        }
      });
    });
    return byDay;
  }

  // Renders the monthly calendar into `targetId`. When `full` is true (the
  // dedicated Calendar view) it maps deadlines + OA + interview dates with a
  // full legend; otherwise (Analytics widget) it stays deadline-focused.
  function renderCalendar(targetId, full) {
    var el = $(targetId || "calendar"); if (!el) return;
    var y = calMonth.y, m = calMonth.m;
    var first = new Date(y, m, 1);
    var startDow = first.getDay();
    var daysInMonth = new Date(y, m+1, 0).getDate();
    var monthName = first.toLocaleString(undefined, { month:"long", year:"numeric" });
    var today = new Date(); today.setHours(0,0,0,0);
    var byDay = eventsForMonth(y, m);

    var dows = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(function (d){ return '<div class="cal-dow">'+d+'</div>'; }).join("");
    var cells = "";
    for (var i=0;i<startDow;i++) cells += '<div class="cal-cell empty"></div>';
    var notes = getCalNotes();
    for (var day=1; day<=daysInMonth; day++) {
      var items = byDay[day] || [];
      var dkey = dayKey(y, m, day);
      var hasNote = !!notes[dkey];
      var cls = "cal-cell";
      if (full) cls += " clickable";                 // only the full Calendar view is interactive
      var isToday = (y===today.getFullYear() && m===today.getMonth() && day===today.getDate());
      if (isToday) cls += " today";
      // deadline urgency tints the cell (kept from before)
      var dls = items.filter(function (it){ return it.ev.type==="deadline"; });
      var sevs = dls.map(function (it){ return deadlineSeverity(it.x.deadline); });
      if (sevs.indexOf("red")>=0) cls += " has-red"; else if (sevs.indexOf("amber")>=0) cls += " has-amber";
      // Application-event dots (deadline / OA / interview) stay as small dots.
      var dots = "";
      if (items.length) {
        var dotHTML = items.slice(0,4).map(function (it){
          return '<i class="'+it.ev.cls+'" title="'+esc(it.ev.label+": "+(it.x.company||"")+" — "+(it.x.role||""))+'"></i>';
        }).join("");
        dots = '<div class="ddot">' + dotHTML + '</div>';
      }
      // A saved event/note renders as a visible, truncated text pill inside the cell.
      var notePill = "";
      if (hasNote) {
        var label = eventLabel(dkey);
        var short = label.length > 16 ? label.slice(0, 15).trim() + "…" : label;
        notePill = '<div class="calendar-event-pill" data-note-pill="'+dkey+'" title="'+esc(label)+'">'+esc(short)+'</div>';
      }
      cells += '<div class="'+cls+'" data-date="'+dkey+'"><span class="cal-daynum">'+day+'</span>'+dots+notePill+'</div>';
    }

    // Single, unambiguous legend: each event type has a distinct colour,
    // plus the note indicator. (No more duplicate rose dots.)
    var legend = '<div class="cal-legend">' +
          '<span><i class="ev-deadline"></i>Deadline</span>' +
          '<span><i class="ev-oa"></i>Online Assessment</span>' +
          '<span><i class="ev-interview"></i>Interview</span>' +
          '<span><i class="ev-note"></i>Note</span></div>';

    // upcoming list of all event types (next 6 future-or-today), soonest first
    var upcoming = [];
    data.forEach(function (x) {
      CAL_EVENTS.forEach(function (ev) {
        var val = x[ev.field]; if (!val || String(val).split("-").length!==3) return;
        var du = daysUntil(val);
        if (du !== null && du >= 0) upcoming.push({ x:x, ev:ev, date:val, du:du });
      });
    });
    upcoming.sort(function (a,b){ return a.date.localeCompare(b.date); });
    upcoming = upcoming.slice(0, 6);
    var upHTML = (full && upcoming.length) ? '<div class="cal-upcoming">' + upcoming.map(function (u){
      var when = u.du===0 ? "Today" : (u.du+"d");
      return '<div class="u-row"><span class="u-when '+(u.du<=3?"red":"norm")+'">'+when+'</span>' +
        '<span class="u-co"><i class="'+u.ev.cls+'" style="display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px"></i>'+esc(u.x.company||"—")+'</span>' +
        '<span class="u-rl">'+u.ev.emoji+' '+u.ev.label+' · '+esc(fmtDate(u.date))+'</span></div>';
    }).join("") + '</div>' : '';

    el.innerHTML =
      '<div class="cal-head"><div class="mo">'+esc(monthName)+'</div>' +
        '<div class="cal-nav"><button data-cal="prev">‹</button><button data-cal="today">•</button><button data-cal="next">›</button></div></div>' +
      '<div class="cal-grid">'+dows+cells+'</div>' +
      legend + upHTML;

    el.querySelectorAll("[data-cal]").forEach(function (b){
      b.onclick = function () {
        var dir = b.getAttribute("data-cal");
        if (dir==="today") { var d=new Date(); calMonth={y:d.getFullYear(),m:d.getMonth()}; }
        else { calMonth.m += (dir==="next"?1:-1); if (calMonth.m>11){calMonth.m=0;calMonth.y++;} if (calMonth.m<0){calMonth.m=11;calMonth.y--;} }
        renderCalendar(targetId, full);
      };
    });

    // Apple-style: clicking a date cell opens a note popover beside it.
    if (full) {
      el.querySelectorAll(".cal-cell.clickable[data-date]").forEach(function (cell) {
        cell.onclick = function (e) {
          e.stopPropagation();
          openDayPopover(cell.getAttribute("data-date"), cell, targetId, full);
        };
      });
      // Clicking a note pill re-opens the popover with that note pre-filled for editing.
      el.querySelectorAll("[data-note-pill]").forEach(function (pill) {
        pill.onclick = function (e) {
          e.stopPropagation();
          var cell = pill.closest(".cal-cell");
          openDayPopover(pill.getAttribute("data-note-pill"), cell || pill, targetId, full);
        };
      });
    }
  }

  // ---------- Apple-style date popover ----------
  function closeDayPopover() {
    var p = $("calPopover"); if (p) p.parentNode.removeChild(p);
    document.removeEventListener("click", popoverOutside, true);
    document.removeEventListener("keydown", popoverEsc, true);
  }
  function popoverOutside(e) {
    var p = $("calPopover"); if (p && !p.contains(e.target) && !(e.target.closest && e.target.closest(".cal-cell"))) closeDayPopover();
  }
  function popoverEsc(e) { if (e.key === "Escape") closeDayPopover(); }

  // Generate & download an .ics calendar file for native calendar apps.
  function icsDate(dtLocal) {
    // "2026-10-20T14:00" -> "20261020T140000" (floating local time)
    if (!dtLocal) return "";
    var clean = dtLocal.replace(/[-:]/g, "");
    if (clean.indexOf("T") < 0) clean += "T090000";
    else if (clean.length === 13) clean += "00";      // add seconds
    return clean;
  }
  function icsEscape(s) { return String(s||"").replace(/\\/g,"\\\\").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/\n/g,"\\n"); }
  function downloadICS(ev) {
    var uid = (Date.now().toString(36)+Math.random().toString(36).slice(2,8)) + "@jobtrackr";
    var stamp = new Date().toISOString().replace(/[-:]/g,"").split(".")[0] + "Z";
    var lines = [
      "BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//JobTrackr//EN","CALSCALE:GREGORIAN","METHOD:PUBLISH",
      "BEGIN:VEVENT",
      "UID:" + uid,
      "DTSTAMP:" + stamp,
      "DTSTART:" + icsDate(ev.startsAt),
      "DTEND:" + icsDate(ev.endsAt || ev.startsAt),
      "SUMMARY:" + icsEscape(ev.title)
    ];
    if (ev.location) lines.push("LOCATION:" + icsEscape(ev.location));
    if (ev.notes) lines.push("DESCRIPTION:" + icsEscape(ev.notes));
    lines.push("END:VEVENT","END:VCALENDAR");
    var blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (ev.title ? ev.title.replace(/[^a-z0-9]+/gi,"_").slice(0,40) : "jobtrackr-event") + ".ics";
    a.click(); URL.revokeObjectURL(a.href);
  }

  function openDayPopover(dateStr, cell, targetId, full) {
    closeDayPopover();
    var ev = eventFor(dateStr) || { kind:"event", title:"", location:"", notes:"", startsAt:"", endsAt:"" };
    var when = prettyDate(dateStr);

    var pop = document.createElement("div");
    pop.className = "cal-event-card"; pop.id = "calPopover";
    pop.innerHTML =
      // Header: ✕ (left) · Event/Reminder toggle (center) · ✓ (right)
      '<div class="ev-head">' +
        '<button class="ev-circle" id="evClose" title="Close">✕</button>' +
        '<div class="ev-seg" id="evSeg">' +
          '<button type="button" class="ev-seg-btn'+(ev.kind!=="reminder"?" active":"")+'" data-kind="event">Event</button>' +
          '<button type="button" class="ev-seg-btn'+(ev.kind==="reminder"?" active":"")+'" data-kind="reminder">Reminder</button>' +
        '</div>' +
        '<button class="ev-circle ev-save" id="evSave" title="Save">✓</button>' +
      '</div>' +
      // Title
      '<input class="ev-input ev-title" id="evTitle" placeholder="Title or Describe Event" value="'+esc(ev.title)+'" />' +
      // Date & time group with accent line
      '<div class="ev-group ev-datetime">' +
        '<div class="ev-dt-row"><span class="ev-dt-label">Starts</span>' +
          '<input type="datetime-local" class="ev-dt-input" id="evStart" value="'+esc(ev.startsAt || (dateStr+"T09:00"))+'" /></div>' +
        '<div class="ev-dt-row"><span class="ev-dt-label">Ends</span>' +
          '<input type="datetime-local" class="ev-dt-input" id="evEnd" value="'+esc(ev.endsAt || (dateStr+"T10:00"))+'" /></div>' +
      '</div>' +
      // Location
      '<div class="ev-section-title">Location</div>' +
      '<div class="ev-group ev-loc-group">' +
        '<span class="ev-loc-ico">📍</span>' +
        '<input class="ev-input ev-loc" id="evLoc" placeholder="Location or Video Call" value="'+esc(ev.location)+'" />' +
      '</div>' +
      // Details
      '<div class="ev-section-title">Details</div>' +
      '<div class="ev-group">' +
        '<textarea class="ev-notes" id="evNotes" placeholder="Notes">'+esc(ev.notes)+'</textarea>' +
      '</div>' +
      '<button class="ev-ics" id="evIcs">📅 Add to Apple / Google Calendar</button>' +
      (eventLabel(dateStr) ? '<button class="ev-delete" id="evDelete">Delete</button>' : '');
    document.body.appendChild(pop);

    // position beside the clicked cell, kept within the viewport
    var r = cell.getBoundingClientRect();
    var pw = 380, ph = pop.offsetHeight || 420, gap = 10;
    var left = r.right + gap; if (left + pw > window.innerWidth - 8) left = r.left - pw - gap;
    if (left < 8) left = Math.max(8, (window.innerWidth - pw) / 2);
    var top = r.top; if (top + ph > window.innerHeight - 8) top = Math.max(8, window.innerHeight - ph - 8);
    if (top < 8) top = 8;
    pop.style.left = left + "px"; pop.style.top = top + "px";

    var kind = ev.kind || "event";
    pop.querySelectorAll("[data-kind]").forEach(function (b) {
      b.onclick = function () {
        kind = b.getAttribute("data-kind");
        pop.querySelectorAll("[data-kind]").forEach(function (x){ x.classList.toggle("active", x===b); });
      };
    });

    $("evTitle").focus();
    $("evClose").onclick = closeDayPopover;
    $("evSave").onclick = function () {
      setEvent(dateStr, {
        kind: kind,
        title: $("evTitle").value,
        location: $("evLoc").value,
        notes: $("evNotes").value,
        startsAt: $("evStart").value,
        endsAt: $("evEnd").value
      });
      closeDayPopover();
      renderCalendar(targetId, full);
      showToast(eventLabel(dateStr) ? "Saved" : "Cleared");
    };
    $("evIcs").onclick = function () {
      downloadICS({
        title: $("evTitle").value || "JobTrackr event",
        location: $("evLoc").value,
        notes: $("evNotes").value,
        startsAt: $("evStart").value || (dateStr + "T09:00"),
        endsAt: $("evEnd").value || (dateStr + "T10:00")
      });
      showToast("📅 Calendar file downloaded");
    };
    var del = $("evDelete");
    if (del) del.onclick = function () { setEvent(dateStr, {}); closeDayPopover(); renderCalendar(targetId, full); showToast("Deleted"); };

    setTimeout(function () {
      document.addEventListener("click", popoverOutside, true);
      document.addEventListener("keydown", popoverEsc, true);
    }, 0);
  }

  // ---------- filtering ----------
  function matchesFilter(x, f) {
    if (f==="__all") return true;
    if (f==="__pending") return statusDef(x.status).pending;
    if (f==="__bookmarked") return !!x.bookmarked;
    return x.status===f;
  }
  function filtered() {
    var q = $("search").value.trim().toLowerCase();
    var f = $("statusFilter").value;
    var sort = $("sortBy").value;
    var rows = data.filter(function (x) {
      if (!matchesFilter(x, f)) return false;
      if (!matchesStatusTab(x, STATUS_TAB_CURRENT)) return false; // status filter tab
      if (favOnly && !x.bookmarked) return false;                 // ★ Favorites quick filter
      if (hideArchived && (x.archived || x.status==="Rejected" || x.status==="Withdrawn")) return false; // 🗄 hide archived
      if (q) { var hay=[x.company,x.role,x.location,x.term,availabilityLabel(x),x.stageNotes,x.referral,x.nextAction,x.status].join(" ").toLowerCase();
        if (hay.indexOf(q)===-1) return false; }
      return true;
    });
    rows.sort(function (a,b) {
      if (sort==="company") return (a.company||"").localeCompare(b.company||"");
      if (sort==="applied") return (b.appliedDate||"").localeCompare(a.appliedDate||"");
      if (sort==="deadline") return (a.deadline||"9999").localeCompare(b.deadline||"9999");
      if (sort==="stipend") return stipendValue(b.comp) - stipendValue(a.comp); // high to low
      return (b._updated||0)-(a._updated||0);
    });
    return rows;
  }

  // ---------- status filter tab bar ----------
  function renderCatTabs() {
    var html = STATUS_TABS.map(function (t) {
      var n = (t.id==="all") ? data.length : data.filter(function (x){ return matchesStatusTab(x, t.id); }).length;
      return '<button class="cat-tab'+(STATUS_TAB_CURRENT===t.id?' active':'')+'" data-cat="'+t.id+'">' +
        esc(t.label)+'<span class="cnt">'+n+'</span></button>';
    }).join("");
    ["catTabs","catTabsApps"].forEach(function (id){ var el=$(id); if (el) el.innerHTML = html; });
    document.querySelectorAll(".cat-tab").forEach(function (b){
      b.onclick = function () { STATUS_TAB_CURRENT = b.getAttribute("data-cat"); render(); };
    });
  }
  function statusTabLabel(id) { return statusTabDef(id).label; }

  // ---------- main render ----------
  // ---------- greeting banner ----------
  function getUserName() { try { return (localStorage.getItem(USER_KEY) || "").trim(); } catch (e) { return ""; } }
  function setUserName(n) { try { localStorage.setItem(USER_KEY, (n||"").trim()); } catch (e) {} }
  function greetingWord() {
    var h = new Date().getHours();
    if (h < 12) return "Good Morning,";
    if (h < 18) return "Good Afternoon,";
    return "Good Evening,";
  }
  function renderGreeting() {
    var hello = $("greetHello"); if (hello) hello.textContent = greetingWord();
    var name = getUserName();
    var nm = $("greetName");
    if (nm) {
      nm.textContent = name || "Set your name";
      nm.classList.toggle("unset", !name);
    }
    var av = $("greetAvatar");
    if (av) {
      var initials = name ? name.split(/\s+/).map(function (w){ return w[0]||""; }).join("").slice(0,2).toUpperCase() : "";
      av.textContent = initials || "🙂";
    }
    // Bell dot: lit when any pending application has a deadline within 7 days.
    var soon = data.some(function (x) {
      if (!statusDef(x.status).pending) return false;
      var du = daysUntil(x.deadline); return du !== null && du >= 0 && du <= 7;
    });
    var dot = $("bellDot"); if (dot) dot.style.display = soon ? "block" : "none";
  }
  function promptUserName() {
    var current = getUserName();
    var n = window.prompt("What should we call you?", current);
    if (n === null) return;                 // cancelled
    setUserName(n.trim());
    renderGreeting();
    if (n.trim()) showToast("Hi " + n.trim().split(/\s+/)[0] + " 👋");
  }

  // ---------- read-only detail view ----------
  var detailId = null;
  // Split a job description / notes block into bullet points.
  function toBullets(text) {
    if (!text) return [];
    var raw = String(text).split(/\r?\n|•|·|;|(?:\.\s+(?=[A-Z]))/);
    return raw.map(function (s){ return s.trim().replace(/^[-*–]\s*/, ""); })
              .filter(function (s){ return s.length > 1; });
  }
  function bulletList(items) {
    if (!items.length) return '<div class="d-none">Not added yet.</div>';
    return '<ul class="d-bullets">' + items.map(function (b){ return '<li>'+esc(b)+'</li>'; }).join("") + '</ul>';
  }
  function detailAboutHTML(x) {
    var rows = [];
    function row(label, val) { if (val) rows.push('<div class="d-row"><span class="d-k">'+esc(label)+'</span><span class="d-v">'+val+'</span></div>'); }
    row("Status", pillHTML(x.status));
    row("Industry", esc(industryOf(x)));
    row("Work Type", esc(normalizeLocation(x.location)));
    var avail = availabilityLabel(x); row("Availability", esc(avail));
    row("Applied", esc(fmtDate(x.appliedDate)));
    row("Deadline", esc(fmtDate(x.deadline)));
    if (x.url) row("Portal", '<a class="d-link" href="'+esc(x.url)+'" target="_blank" rel="noopener">Open ↗</a>');
    if (!rows.length) return '<div class="d-none">No company details added yet.</div>';
    return '<div class="d-rows">' + rows.join("") + '</div>';
  }
  // "🎉 Offer Details & Perks" — only shown for Offer Received apps, filled
  // with the actual stored compensation/perk data (no empty placeholders).
  function offerDetailsHTML(x) {
    var rows = [];
    function row(label, val) { if (val) rows.push('<div class="d-row"><span class="d-k">'+esc(label)+'</span><span class="d-v">'+val+'</span></div>'); }
    var pay = formatSalary(x.comp);
    row("Salary", pay);
    row("Monthly Compensation", pay);
    if (x.equity) row("Equity / Bonus", esc(x.equity));         // optional dedicated field
    row("Commitment / Hours", esc(x.hours));
    if (x.startDate || x.endDate) row("Start Date", esc(monthYear(x.startDate) || availabilityLabel(x)));
    if (x.offerDeadline) row("Decide By", esc(fmtDate(x.offerDeadline)));
    if (x.priority) row("Priority", esc(x.priority));
    // Perks / highlights: only the dedicated perks field (no pros/cons notes).
    var perks = toBullets(x.perks);
    var perksHTML = perks.length
      ? '<div class="d-offer-perks">'+perks.map(function (p){ return '<span class="d-perk">✨ '+esc(p)+'</span>'; }).join("")+'</div>'
      : '';
    if (!rows.length && !perksHTML) {
      return '<div class="d-none">Open Edit to add your salary, perks and start date.</div>';
    }
    return (rows.length ? '<div class="d-rows">'+rows.join("")+'</div>' : '') + perksHTML;
  }
  function renderDetail(id) {
    var x = data.find(function (v){ return v.id===id; }); if (!x) return;
    detailId = id;
    // header: favourite heart reflects bookmark state
    var fav = $("detailFav");
    if (fav) { fav.textContent = x.bookmarked ? "♥" : "♡"; fav.classList.toggle("on", !!x.bookmarked); }

    var dur = availabilityLabel(x);
    var meta = [];
    if (dur) meta.push('🗓 '+esc(dur));
    var locN = normalizeLocation(x.location);
    if (locN) meta.push('📍 '+esc(locN));

    // Benefits: salary + work type + hours as green-dot bullets
    var benefits = [];
    if (x.comp) benefits.push(esc(x.comp) + " monthly allowance");
    if (x.hours) benefits.push(esc(x.hours));
    if (x.location) benefits.push(esc(x.location) + " work arrangement");
    if (x.priority) benefits.push(esc(x.priority) + " priority role");

    var reqItems = toBullets(x.jobdesc);
    var notesItems = toBullets(x.stageNotes);

    var body =
      '<div class="d-hero">' +
        '<div class="d-logo">' + avatar(x.company, companyDomain(x.company, x.url)) + '</div>' +
        '<h2 class="d-role">' + esc(x.role||"—") + '</h2>' +
        '<div class="d-company">' + esc(x.company||"") + '</div>' +
        (meta.length ? '<div class="d-meta">'+meta.join('<span class="d-dot">·</span>')+'</div>' : '') +
      '</div>' +
      '<div class="d-tabs" id="dTabs">' +
        '<button class="d-tab active" data-dtab="desc">Description</button>' +
        '<button class="d-tab" data-dtab="about">About Company</button>' +
      '</div>' +
      '<div class="d-pane" id="dPaneDesc">' +
        (x.status === "Offer Received"
          ? '<div class="d-card d-offer-card"><div class="d-title">🎉 Offer Details</div>'+offerDetailsHTML(x)+'</div>'
          : '') +
        '<div class="d-card">' +
          '<div class="d-title">Requirements</div>' +
          bulletList(reqItems) +
        '</div>' +
        '<div class="d-card">' +
          '<div class="d-title">Benefits</div>' +
          bulletList(benefits) +
        '</div>' +
        (notesItems.length ? '<div class="d-card"><div class="d-title">Notes</div>'+bulletList(notesItems)+'</div>' : '') +
      '</div>' +
      '<div class="d-pane hidden" id="dPaneAbout">' +
        '<div class="d-card">' +
          '<div class="d-title">About ' + esc(x.company||"this company") + '</div>' +
          detailAboutHTML(x) +
        '</div>' +
      '</div>' +
      '<div class="d-foot">' +
        (x.url ? '<a class="d-apply" href="'+esc(x.url)+'" target="_blank" rel="noopener">Open Application Portal</a>'
               : '<button class="d-apply" id="dApplyEdit">Open / Add Portal Link</button>') +
        '<button class="d-edit" id="dEditBtn">✎ Edit Application</button>' +
      '</div>';

    $("detailBody").innerHTML = body;
    $("detailBody").scrollTop = 0;

    // tab switching
    $("dTabs").querySelectorAll("[data-dtab]").forEach(function (b) {
      b.onclick = function () {
        $("dTabs").querySelectorAll("[data-dtab]").forEach(function (t){ t.classList.toggle("active", t===b); });
        var which = b.getAttribute("data-dtab");
        $("dPaneDesc").classList.toggle("hidden", which!=="desc");
        $("dPaneAbout").classList.toggle("hidden", which!=="about");
      };
    });
    var eb = $("dEditBtn"); if (eb) eb.onclick = function () { closeDetail(); openModal(id); };
    var ae = $("dApplyEdit"); if (ae) ae.onclick = function () { closeDetail(); openModal(id); };
  }
  function openDetail(id) {
    renderDetail(id);
    $("detailView").classList.add("show");
    $("detailView").setAttribute("aria-hidden", "false");
    document.body.classList.add("detail-open");
  }
  function closeDetail() {
    $("detailView").classList.remove("show");
    $("detailView").setAttribute("aria-hidden", "true");
    document.body.classList.remove("detail-open");
    detailId = null;
  }

  function render() {
    renderGreeting();
    renderSummary("summary");
    renderSyncBadge();
    renderCatTabs();
    if (tab === "analytics") renderAnalytics();
    if (tab === "compare") renderCompareInline();

    var targets = (tab === "applications") ? ["viewApps"] : ["view"];
    if (!data.length) { targets.forEach(function (t){ renderEmpty(t); }); return; }

    // Calendar view: show the monthly deadline/OA/interview calendar in the feed area.
    // Status tabs + favorites filter don't apply to the calendar (it maps all dated events).
    if (view === "calendar") {
      targets.forEach(function (t) {
        $(t).innerHTML = '<div class="cal-card" id="' + t + '__cal"></div>';
        renderCalendar(t + "__cal", true);
      });
      return;
    }

    var rows = filtered();
    targets.forEach(function (t) {
      if (!rows.length) { $(t).innerHTML = '<div class="empty-note">No applications in <b>'+esc(statusTabLabel(STATUS_TAB_CURRENT))+'</b> matching your filters.</div>'; return; }
      if (view === "board") renderBoard(rows, t); else renderFeed(rows, t);
    });
    wireCards();
  }

  function renderEmpty(into) {
    $(into).innerHTML =
      '<div class="empty-fill"><div class="empty-card">' +
        '<div class="radar"><div class="ring1"></div><div class="ring2"></div><div class="ring3"></div>' +
          '<div class="sweep"></div><div class="blip"></div><div class="center">🎯</div></div>' +
        '<h3>Start catching offers</h3>' +
        '<p>Track the roles you\u2019ve applied for, what you\u2019re waiting on, and every interview stage \u2014 all in one place.</p>' +
        '<button class="big-primary" id="emptyAdd">＋ Track First Application</button>' +
        '<button class="sample" id="emptySample">Or load sample data</button>' +
      '</div></div>';
    $("emptyAdd").onclick = function (){ openModal(null); };
    $("emptySample").onclick = loadSample;
  }

  function renderFeed(rows, into) {
    var html = rows.map(function (x) {
      // At-a-glance: show at most 3 badges — Pay, Work Type, and ONE urgency alert.
      // Industry lives in the detail view; archived state is shown via card dimming,
      // not a badge. Deadline countdown takes priority over the follow-up alert.
      var isOffer = (x.status === "Offer Received");
      var tags = [];
      // Pay: show salary if known; for offers with no salary, a friendly fallback.
      var payStr = formatSalary(x.comp);
      if (payStr) tags.push('<span class="chiptag pay">💰 '+esc(payStr)+'</span>');
      else if (isOffer) tags.push('<span class="chiptag pay">💰 Offer Details Inside</span>');
      var locStr = normalizeLocation(x.location);
      if (locStr) tags.push('<span class="chiptag loc">📍 '+esc(locStr)+'</span>');
      if (isOffer) {
        // Dedicated high-priority offer badge: decision deadline if set, else celebratory.
        var od = daysUntil(x.offerDeadline);
        if (od !== null && od >= 0) tags.push('<span class="chiptag offer-due">⏰ Decision Due'+(od<=7?' · '+od+'d':'')+'</span>');
        else tags.push('<span class="chiptag offer-win">🎉 Offer Accepted / Reviewing</span>');
      } else {
        var cd = countdownBadge(x);
        if (cd) tags.push(cd);                                       // deadline trigger wins
        else if (followUpDue(x)) tags.push('<span class="fu-flag">⚠️ Follow-up Due</span>');
      }
      return '<div class="fcard'+(isArchived(x)?' archived':'')+(isOffer?' offer-card':'')+'" data-open="'+x.id+'">' +
        '<div class="head">' + avatar(x.company, companyDomain(x.company, x.url)) +
          '<div class="ht"><div class="title">'+esc(x.role||"—")+'</div><div class="company">'+esc(x.company||"")+'</div></div>' +
          '<button class="bookmark'+(x.bookmarked?' on':'')+'" data-bm="'+x.id+'" title="Bookmark">'+(x.bookmarked?"★":"☆")+'</button>' +
        '</div>' +
        '<div class="status-pill-wrap">'+pillHTML(x.status)+'</div>' +
        '<div class="tags card-badges-container">'+tags.join("")+'</div>' +
        '<div class="fcard-bottom">' +
        progressStepper(x) +
        '<div class="foot">' +
          '<button class="card-primary" data-view-detail="'+x.id+'">View Details</button>' +
          '<div class="meatball-wrap">' +
            '<button class="meatball-btn" data-meatball="'+x.id+'" aria-haspopup="true" aria-expanded="false" title="More actions">⋮</button>' +
            '<div class="meatball-menu" data-menu="'+x.id+'" hidden>' +
              '<button class="mb-item" data-status="'+x.id+'"><span class="mb-ic">🔄</span>Update Status</button>' +
              '<button class="mb-item" data-edit="'+x.id+'"><span class="mb-ic">✏️</span>Edit Application</button>' +
              '<button class="mb-item" data-mail="'+x.id+'"><span class="mb-ic">✉️</span>Email Recruiter / Contact</button>' +
              '<button class="mb-item" data-export-card="'+x.id+'"><span class="mb-ic">📥</span>Export Application Card</button>' +
              '<button class="mb-item" data-archive="'+x.id+'"><span class="mb-ic">📦</span>'+(x.archived?'Unarchive':'Archive')+'</button>' +
              '<button class="mb-item danger" data-del="'+x.id+'"><span class="mb-ic">🗑️</span>Delete</button>' +
            '</div>' +
          '</div>' +
        '</div></div></div>';
    }).join("");
    $(into).innerHTML = '<div class="feed">'+html+'</div>';
  }

  function renderBoard(rows, into) {
    var cols = STATUSES.map(function (s) {
      var items = rows.filter(function (x){ return x.status===s.name; });
      var cards = items.map(function (x) {
        var bits = [];
        if (x.comp) bits.push('<span class="chiptag pay">💰 '+esc(x.comp)+'</span>');
        if (x.deadline) bits.push(countdownBadge(x));
        if (followUpDue(x)) bits.push('<span class="fu-flag">⚠️</span>');
        return '<div class="bcard" draggable="true" data-id="'+x.id+'" data-open="'+x.id+'">' +
          '<div class="bh">'+avatar(x.company, companyDomain(x.company, x.url))+'<div><div class="bco">'+esc(x.company||"—")+'</div><div class="brl">'+esc(x.role||"")+'</div></div></div>' +
          (bits.length?'<div class="bmeta">'+bits.join("")+'</div>':'') +
          '<div class="bmeta"><button class="qbtn" data-mail="'+x.id+'">✉️</button></div>' +
          '</div>';
      }).join("");
      return '<div class="col" data-status="'+esc(s.name)+'">' +
        '<div class="col-head">'+swDot(s.name)+esc(s.name)+'<span class="count">'+items.length+'</span></div>' +
        (items.length?cards:'<div class="col-empty">Drop here</div>') + '</div>';
    }).join("");
    $(into).innerHTML = '<div class="board">'+cols+'</div>';
    wireDnd(into);
  }

  function wireDnd(into) {
    var root = $(into); var dragId = null;
    Array.prototype.forEach.call(root.querySelectorAll(".bcard"), function (card) {
      card.addEventListener("dragstart", function (e){ dragId = card.getAttribute("data-id"); card.classList.add("dragging"); e.dataTransfer.effectAllowed="move"; });
      card.addEventListener("dragend", function (){ card.classList.remove("dragging"); dragId=null; });
    });
    Array.prototype.forEach.call(root.querySelectorAll(".col"), function (col) {
      col.addEventListener("dragover", function (e){ e.preventDefault(); col.classList.add("drag-over"); });
      col.addEventListener("dragleave", function (){ col.classList.remove("drag-over"); });
      col.addEventListener("drop", function (e) {
        e.preventDefault(); col.classList.remove("drag-over"); if (!dragId) return;
        var item = data.find(function (x){ return x.id===dragId; });
        var ns = col.getAttribute("data-status");
        if (item && item.status !== ns) { item.status = ns; item._updated = Date.now(); save(); render(); showToast("Moved to "+ns); }
      });
    });
  }

  // Close any open meatball dropdown menu.
  function closeAllMeatballs() {
    document.querySelectorAll(".meatball-menu").forEach(function (m){ m.hidden = true; });
    document.querySelectorAll(".meatball-btn").forEach(function (b){ b.setAttribute("aria-expanded","false"); b.classList.remove("open"); });
  }

  function wireCards() {
    document.querySelectorAll("[data-open]").forEach(function (el) {
      el.addEventListener("click", function (e) {
        if (e.target.closest("[data-edit],[data-del],[data-mail],[data-status],[data-bm],[data-archive],[data-view-detail],[data-meatball],[data-export-card],.meatball-menu")) return;
        openDetail(el.getAttribute("data-open"));
      });
    });
    // explicit "View Details" button (feed card primary action)
    document.querySelectorAll("[data-view-detail]").forEach(function (b){
      b.addEventListener("click", function (e){ e.stopPropagation(); closeAllMeatballs(); openDetail(b.getAttribute("data-view-detail")); });
    });
    // meatball (⋮) toggle — open this card's menu, close any others
    document.querySelectorAll("[data-meatball]").forEach(function (b){
      b.addEventListener("click", function (e){
        e.stopPropagation();
        var id = b.getAttribute("data-meatball");
        var menu = document.querySelector('.meatball-menu[data-menu="'+id+'"]');
        var willOpen = menu && menu.hidden;
        closeAllMeatballs();
        if (willOpen) { menu.hidden = false; b.setAttribute("aria-expanded","true"); b.classList.add("open"); }
      });
    });
    // Secondary actions (inside the dropdown). Each closes the menu after acting.
    document.querySelectorAll("[data-edit]").forEach(function (b){ b.addEventListener("click", function (e){ e.stopPropagation(); closeAllMeatballs(); openModal(b.getAttribute("data-edit")); }); });
    document.querySelectorAll("[data-mail]").forEach(function (b){ b.addEventListener("click", function (e){ e.stopPropagation(); closeAllMeatballs(); copyFollowUp(b.getAttribute("data-mail")); }); });
    document.querySelectorAll("[data-status]").forEach(function (b){ b.addEventListener("click", function (e){ e.stopPropagation(); closeAllMeatballs(); openStatusSheet(b.getAttribute("data-status")); }); });
    document.querySelectorAll("[data-bm]").forEach(function (b){ b.addEventListener("click", function (e){ e.stopPropagation(); toggleBookmark(b.getAttribute("data-bm")); }); });
    document.querySelectorAll("[data-archive]").forEach(function (b){ b.addEventListener("click", function (e){ e.stopPropagation(); closeAllMeatballs(); toggleArchive(b.getAttribute("data-archive")); }); });
    document.querySelectorAll("[data-export-card]").forEach(function (b){ b.addEventListener("click", function (e){ e.stopPropagation(); closeAllMeatballs(); exportCard(b.getAttribute("data-export-card")); }); });
    document.querySelectorAll("[data-del]").forEach(function (b){
      b.addEventListener("click", function (e){ e.stopPropagation(); closeAllMeatballs(); var id=b.getAttribute("data-del"); var item=data.find(function (x){ return x.id===id; });
        if (confirm('Delete "'+(item?item.company+" — "+item.role:"this")+'"?')) { data=data.filter(function (x){ return x.id!==id; }); save(); render(); } });
    });
  }

  function toggleBookmark(id) { var x=data.find(function (v){ return v.id===id; }); if (!x) return; x.bookmarked=!x.bookmarked; x._updated=Date.now(); save(); render(); }
  function toggleArchive(id) { var x=data.find(function (v){ return v.id===id; }); if (!x) return; x.archived=!x.archived; x._updated=Date.now(); save(); render(); showToast(x.archived?"Archived":"Unarchived"); }
  // Export a single application card as a JSON file.
  function exportCard(id) {
    var x = data.find(function (v){ return v.id===id; }); if (!x) { showToast("Nothing to export"); return; }
    var safe = (((x.company||"card")+"-"+(x.role||"")).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")) || "application-card";
    var blob = new Blob([JSON.stringify(x, null, 2)], { type:"application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "jobtrackr-" + safe + ".json";
    a.click(); URL.revokeObjectURL(a.href);
    showToast("📥 Application card exported");
  }

  // ---------- quick status sheet ----------
  function openStatusSheet(id) {
    statusTargetId = id; var x = data.find(function (v){ return v.id===id; }); if (!x) return;
    $("statusBody").innerHTML = '<div style="color:var(--muted);font-size:13px;margin-bottom:14px">'+esc(x.company||"")+' — '+esc(x.role||"")+'</div>' +
      STATUSES.map(function (s){ return '<button class="btn" data-set="'+esc(s.name)+'" style="width:100%;margin-bottom:8px;display:flex;align-items:center;gap:10px;justify-content:flex-start">'+
        swDot(s.name)+' '+esc(s.name)+(x.status===s.name?' <span style="margin-left:auto;color:var(--accent-strong)">✓</span>':'')+'</button>'; }).join("");
    $("statusBody").querySelectorAll("[data-set]").forEach(function (b){
      b.onclick = function () { var ns=b.getAttribute("data-set"); x.status=ns; x._updated=Date.now(); save(); closeStatus(); render(); showToast("Status → "+ns); };
    });
    $("statusBg").classList.add("show");
  }
  function closeStatus() { $("statusBg").classList.remove("show"); }

  // ---------- add/edit ----------
  function openModal(id) {
    editingId = id || null;
    $("modalTitle").textContent = id ? "Edit Application" : "New Application";
    var item = (id ? data.find(function (x){ return x.id===id; }) : {}) || {};
    FIELDS.forEach(function (f){ var el=$("f_"+f); if (el) el.value = item[f]!=null?item[f]:""; });
    // availability date fields (custom IDs, not f_ convention)
    $("appStartDate").value = item.startDate || "";
    $("appEndDate").value = item.endDate || "";
    if (!id) { $("f_status").value = "Applied"; $("f_industry").value = ""; $("f_location").value = ""; }
    toggleIndustryOther();   // show/hide custom industry input to match loaded value
    refreshSelectPlaceholders(); // gray out selects still on their "Select…" option
    refreshDatePlaceholders();  // show/hide the uppercase DD/MM/YYYY hint per field
    $("f_id").value = id || "";
    $("modalBg").classList.add("show");
    setTimeout(function (){ $("f_company").focus(); }, 80);
  }
  function closeModal() { $("modalBg").classList.remove("show"); editingId = null; }
  function saveForm() {
    var company=$("f_company").value.trim(), role=$("f_role").value.trim();
    if (!company || !role) { alert("Company Name and Role / Job Title are required."); return; }
    var obj = editingId ? data.find(function (x){ return x.id===editingId; }) : null;
    if (!obj) { obj = { id: uid() }; data.push(obj); }
    FIELDS.forEach(function (f){ var el=$("f_"+f); if (el) obj[f]=el.value.trim(); });
    obj.startDate = $("appStartDate").value;
    obj.endDate = $("appEndDate").value;
    obj._updated = Date.now();
    save(); closeModal(); render(); showToast(editingId?"Saved":"Application added");
  }

  // ---------- sample / sync / export ----------
  function loadSample() {
    if (data.length && !confirm("Load sample data? This adds example applications.")) return;
    var t=new Date(); function d(o){ var x=new Date(t); x.setDate(x.getDate()+o); return x.toISOString().slice(0,10); }
    var sample = [
      { company:"Stripe", role:"Software Engineering Intern", industry:"Fintech & Financial Services", location:"Hybrid", comp:"$2,400/month", status:"Interview", appliedDate:d(-21), deadline:d(-10), interviewDates:d(3), stageNotes:"Passed OA; tech round scheduled.", nextAction:"Prep system design", url:"https://stripe.com/jobs", jobdesc:"Build backend APIs in Python and Go, work with cloud, databases and distributed systems.", startDate:"2027-05-10", endDate:"2027-08-06" },
      { company:"Razer", role:"Data Analytics Intern", industry:"Gaming & Entertainment", location:"On-site", comp:"$1,500/month", status:"Applied", appliedDate:d(-16), deadline:d(4), followup:d(-16), nextAction:"Follow up with recruiter", docs:"Data_Analytics_v3.pdf", jobdesc:"SQL, dashboards, Tableau, reporting and business intelligence." },
      { company:"Endowus", role:"Fintech SWE Intern", industry:"Fintech & Financial Services", location:"Remote", comp:"$2,000/month", status:"Online Assessment / Test", appliedDate:d(-7), deadline:d(1), oaDate:d(2), nextAction:"Complete HackerRank test", referral:"Alex Lim (LinkedIn)" },
      { company:"Apple", role:"iOS Engineering Intern", industry:"Technology & Software", location:"Hybrid", comp:"$3,000/month", status:"Offer Received", appliedDate:d(-40), hours:"Full-time, 12 weeks", offerDeadline:d(9), priority:"High", equity:"Completion bonus", perks:"Relocation support; Device stipend; Mentorship", bookmarked:true, nextAction:"Decide by offer deadline" },
      { company:"Grab", role:"Backend Intern", industry:"Logistics & Supply Chain", location:"On-site", comp:"$2,200/month", status:"Rejected", appliedDate:d(-30), stageNotes:"Rejected after final round." }
    ];
    sample.forEach(function (s){ s.id=uid(); s._updated=Date.now()-Math.floor(Math.random()*1e6); });
    data = data.concat(sample); save(); closeMore(); render(); showToast("Sample data loaded");
  }
  function markSync(a) { localStorage.setItem(SYNC_KEY, JSON.stringify({ action:a, at:Date.now() })); renderSyncBadge(); }
  function renderSyncBadge() { var raw; try { raw=JSON.parse(localStorage.getItem(SYNC_KEY)); } catch(e){ raw=null; }
    if (!raw) { $("syncBadge").textContent=""; return; }
    var s=new Date(raw.at).toLocaleString(undefined,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});
    $("syncBadge").textContent = "Last "+raw.action+": "+s; }
  function exportData() { var blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}); var a=document.createElement("a");
    a.href=URL.createObjectURL(blob); a.download="jobtrackr_applications-"+new Date().toISOString().slice(0,10)+".json"; a.click(); URL.revokeObjectURL(a.href); markSync("export"); showToast("Exported"); }

  // ---------- CSV export ----------
  function csvCell(v) {
    var s = (v==null) ? "" : String(v);
    if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"'; // RFC-4180 quoting
    return s;
  }
  function exportCsv() {
    if (!data.length) { showToast("Nothing to export yet"); return; }
    var cols = [
      { h:"Company Name", f:function (x){ return x.company; } },
      { h:"Job Title", f:function (x){ return x.role; } },
      { h:"Industry", f:function (x){ return industryOf(x); } },
      { h:"Status", f:function (x){ return x.status; } },
      { h:"Date Applied", f:function (x){ return x.appliedDate; } },
      { h:"Deadline", f:function (x){ return x.deadline; } },
      { h:"Location", f:function (x){ return x.location; } },
      { h:"Monthly Stipend", f:function (x){ return x.comp; } },
      { h:"Notes", f:function (x){ return [x.stageNotes, x.prosCons].filter(Boolean).join(" | "); } }
    ];
    var lines = [ cols.map(function (c){ return csvCell(c.h); }).join(",") ];
    data.forEach(function (x){ lines.push(cols.map(function (c){ return csvCell(c.f(x)); }).join(",")); });
    var csv = "\uFEFF" + lines.join("\r\n"); // BOM so Excel reads UTF-8 correctly
    var blob = new Blob([csv], { type:"text/csv;charset=utf-8;" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "jobtrackr_applications-"+new Date().toISOString().slice(0,10)+".csv";
    a.click(); URL.revokeObjectURL(a.href);
    markSync("CSV export"); showToast("📊 CSV exported");
  }
  function importData(file) { var r=new FileReader(); r.onload=function () {
      try { var parsed=JSON.parse(r.result); if (!Array.isArray(parsed)) throw new Error("Invalid file");
        if (!confirm("Import "+parsed.length+" application(s)? This replaces current data.")) return;
        data=parsed.map(function (x){ if (!x.id) x.id=uid(); if (!x._updated) x._updated=Date.now();
          if (x.status&&LEGACY_MAP[x.status]) x.status=LEGACY_MAP[x.status]; if (!statusValid(x.status)) x.status="Applied"; return x; });
        save(); markSync("import"); closeMore(); render(); showToast("Imported");
      } catch (e) { alert("Could not import: "+e.message); } }; r.readAsText(file); }

  // ---------- compare engine ----------
  // Role categories a course aligns to (used for the relevance bonus + explanation tag)
  var ROLE_TOKENS = {
    swe:       ["software","engineer","developer","backend","frontend","full stack","programming","sde"],
    data:      ["data","analytics","analyst","machine learning","ml","ai","bi","insights"],
    cyber:     ["security","cyber","soc","penetration","infosec","vulnerability"],
    fintech:   ["fintech","finance","trading","payments","banking","quant"],
    cloud:     ["cloud","devops","infrastructure","aws","sre","platform"],
    product:   ["product","business","operations","strategy","consulting","project"],
    finance:   ["finance","banking","investment","equity","accounting","audit","risk","treasury"],
    marketing: ["marketing","brand","growth","social media","content","seo","advertising"],
    ee:        ["electrical","electronics","embedded","firmware","hardware","iot","circuit"],
    mech:      ["mechanical","cad","manufacturing","robotics","automation","thermodynamics"],
    systems:   ["systems","integration","automation","controls","industrial"],
    design:    ["design","ux","ui","product design","interaction","visual","figma"],
    media:     ["media","interactive","animation","content","multimedia","motion"]
  };
  // Sentinel entry that reveals a custom text input when chosen.
  var OTHER_COURSE = "Other Course / Major...";

  // ---------- Course -> suggested job roles ----------
  var courseToRolesMap = {
    // Computing, Fintech & IT
    "Fintech": ["Fintech SWE Intern", "Blockchain Developer", "Quant Analyst", "Financial Tech Analyst", "Risk & Compliance Specialist"],
    "Computer Science": ["Software Engineer Intern", "Backend Engineer", "Full Stack Developer", "Algorithms Engineer", "Systems Analyst"],
    "Computing Science": ["Software Engineer Intern", "Backend Engineer", "Full Stack Developer", "Algorithms Engineer", "Systems Analyst"],
    "Computing": ["Software Engineer Intern", "Backend Engineer", "Full Stack Developer", "Data Analyst"],
    "Information Security": ["Cybersecurity Analyst", "Security Engineer", "SOC Analyst", "Penetration Tester", "Information Security Intern"],
    "Software Engineering": ["Software Engineering Intern", "Frontend Engineer", "DevOps Engineer", "QA Automation Engineer"],
    "Business Analytics": ["Business Analytics Intern", "Data Analyst", "BI Developer", "Product Analyst", "Operations Analyst"],
    "Data Science": ["Data Science Intern", "AI/ML Engineer", "Data Engineer", "Predictive Modeller"],
    "Artificial Intelligence": ["AI/ML Engineer", "Data Science Intern", "Machine Learning Engineer", "Computer Vision Engineer"],
    "Information Systems": ["Systems Analyst", "IT Business Analyst", "ERP Consultant", "Technical Consultant"],
    "Information and Communications Technology": ["IT Support Engineer", "Network Engineer", "Systems Administrator", "Cloud Associate"],
    "Interactive Media": ["Game Developer", "Unity/Unreal Engine Programmer", "AR/VR Developer", "Graphics Engineer"],
    "Computer Science in Interactive Media": ["Game Developer", "Unity/Unreal Engine Programmer", "AR/VR Developer", "Graphics Engineer"],

    // Business, Management & Finance
    "Business": ["Management Associate Intern", "Business Development Representative", "Operations Analyst", "Product Manager Intern"],
    "Accountancy": ["Audit Associate Intern", "Tax Consultant", "Financial Accountant", "Risk Advisory Intern"],
    "Finance": ["Investment Banking Intern", "Financial Analyst", "Asset Management Analyst", "Wealth Management Intern"],
    "Quantitative Finance": ["Quant Analyst", "Financial Analyst", "Risk Analyst", "Algorithmic Trading Intern"],
    "Economics": ["Economic Analyst", "Market Research Analyst", "Policy Analyst", "Financial Risk Analyst"],
    "Supply Chain": ["Supply Chain Analyst", "Logistics Coordinator", "Procurement Associate", "Operations Trainee"],
    "Hospitality": ["Hospitality Management Trainee", "Event Operations Coordinator", "Guest Experience Analyst"],
    "Human Resource": ["HR Associate Intern", "Talent Acquisition Intern", "People Operations Analyst"],
    "Real Estate": ["Real Estate Analyst", "Property Management Intern", "Valuation Analyst"],
    "Marketing": ["Digital Marketing Specialist", "Brand Executive", "Growth Marketing Intern", "Social Media Strategist"],

    // Design, Arts & Communications
    "Art": ["UI/UX Designer", "Concept Artist", "3D Animator", "Visual Designer", "Graphic Designer"],
    "Animation": ["3D Animator", "Motion Graphics Artist", "Concept Artist", "Visual Designer"],
    "Digital Media": ["Digital Content Strategist", "Media Planner", "UI/UX Designer", "Motion Graphics Artist"],
    "Communication": ["Corporate Communications Intern", "PR Executive", "Digital Marketing Specialist", "Content Strategist"],
    "Architecture": ["Architectural Assistant", "Spatial Designer", "BIM Specialist", "Urban Planner Intern"],
    "Design": ["UI/UX Designer", "Product Designer", "Visual Designer", "Design Researcher"],

    // Engineering
    "Electrical": ["Electrical Engineer", "Embedded Systems Engineer", "Hardware Engineer", "Power Systems Analyst"],
    "Electronics": ["Electronics Engineer", "Embedded Systems Engineer", "Hardware Engineer"],
    "Mechatronics": ["Robotics Engineer", "Embedded Systems Engineer", "Automation Engineer", "Mechatronics Intern"],
    "Robotics": ["Robotics Engineer", "Automation Engineer", "Controls Engineer"],
    "Mechanical": ["Mechanical Design Engineer", "Robotics Engineer", "Manufacturing Analyst", "CAD Specialist"],
    "Aerospace": ["Aerospace Engineer", "Aircraft Systems Engineer", "Propulsion Analyst"],
    "Aircraft": ["Aircraft Systems Engineer", "Aerospace Engineer", "Maintenance Engineer"],
    "Civil": ["Civil Engineer", "Structural Engineer", "Project Management Intern", "Site Engineer"],
    "Chemical": ["Process Engineer", "R&D Chemist", "Quality Control Engineer", "Bioprocess Engineer"],
    "Biomedical": ["Biomedical Engineer", "Clinical Engineer", "Medical Device R&D Intern"],
    "Materials": ["Materials Engineer", "R&D Engineer", "Quality Control Engineer"],
    "Environmental": ["Environmental Engineer", "Sustainability Analyst", "EHS Associate"],
    "Systems Engineering": ["Systems Engineer", "Integration Engineer", "Automation Engineer"],
    "Engineering": ["Engineering Intern", "Project Engineer", "R&D Engineer", "Design Engineer"],

    // Healthcare & Science
    "Nursing": ["Staff Nurse Intern", "Clinical Operations Executive", "Healthcare Administrator"],
    "Pharmacy": ["Pharmaceutical Analyst", "Clinical Research Associate", "Pharmacy Associate"],
    "Pharmaceutical": ["Pharmaceutical Analyst", "Clinical Research Associate", "Process Engineer"],
    "Physiotherapy": ["Physiotherapist Intern", "Rehabilitation Associate", "Clinical Operations Executive"],
    "Occupational Therapy": ["Occupational Therapist Intern", "Rehabilitation Associate", "Clinical Operations Executive"],
    "Speech and Language Therapy": ["Speech Therapist Intern", "Clinical Associate", "Rehabilitation Associate"],
    "Diagnostic Radiography": ["Radiographer Intern", "Medical Imaging Associate", "Clinical Operations Executive"],
    "Radiation Therapy": ["Radiation Therapist Intern", "Clinical Associate", "Oncology Operations Executive"],
    "Dietetics": ["Dietitian Intern", "Clinical Nutrition Associate", "Food & Health Analyst"],
    "Aviation": ["Aviation Management Trainee", "Airport Operations Associate", "Airline Analyst"],
    "Therapy": ["Allied Health Intern", "Rehabilitation Associate", "Clinical Operations Executive"],
    "Radiography": ["Radiographer Intern", "Medical Imaging Associate", "Clinical Operations Executive"],
    "Life Sciences": ["Research Assistant", "Lab Analyst", "Biotech Associate"],
    "Chemistry": ["R&D Chemist", "Lab Analyst", "Quality Control Associate"],
    "Physics": ["Research Assistant", "R&D Engineer", "Data Analyst"],
    "Food": ["Food Technologist", "Quality Assurance Associate", "R&D Food Scientist"],

    // Law & Social Science
    "Law": ["Legal Intern", "Paralegal", "Compliance Officer", "Regulatory Affairs Analyst"],
    "Social Work": ["Social Work Associate", "Community Programme Coordinator", "Case Worker Intern"],
    "Psychology": ["People Operations Analyst", "UX Researcher", "HR Associate Intern"],
    "Early Childhood": ["Early Childhood Educator", "Curriculum Associate", "Programme Coordinator"],
    "Public Safety": ["Security Operations Analyst", "Risk & Compliance Specialist", "Emergency Planning Associate"],
    "Building": ["Project Management Intern", "Site Engineer", "Facilities Associate"]
  };
  // Ordered most-specific -> general so a full official title resolves to the best key.
  var COURSE_KEY_ORDER = [
    "Fintech","Quantitative Finance","Information Security","Software Engineering","Computer Science in Interactive Media",
    "Computer Science","Computing Science","Computing","Business Analytics","Data Science","Artificial Intelligence",
    "Information and Communications Technology","Information Systems","Interactive Media","Accountancy","Economics",
    "Supply Chain","Hospitality","Human Resource","Real Estate","Marketing","Animation","Digital Media","Communication",
    "Architecture","Mechatronics","Robotics","Electronics","Electrical","Aerospace","Aircraft","Mechanical","Civil",
    "Chemical","Biomedical","Materials","Environmental","Systems Engineering","Pharmaceutical","Pharmacy",
    "Occupational Therapy","Speech and Language Therapy","Diagnostic Radiography","Radiation Therapy","Radiography",
    "Therapy","Dietetics","Physiotherapy","Nursing","Aviation","Life Sciences","Chemistry","Physics","Food","Law",
    "Social Work","Psychology","Early Childhood","Public Safety","Building","Design","Art","Business","Finance","Engineering"
  ];
  // Generic roles when a course doesn't map to a specific domain (never blank).
  var GENERIC_ROLES = ["Intern", "Management Associate Intern", "Operations Analyst", "Project Coordinator"];
  // Map a (possibly full official) course title to its suggested roles.
  function suggestedRolesFor(courseTitle) {
    if (!courseTitle || courseTitle === OTHER_COURSE) return { key:null, roles:[] };
    var t = courseTitle.toLowerCase();
    for (var i=0;i<COURSE_KEY_ORDER.length;i++) {
      var key = COURSE_KEY_ORDER[i];
      if (t.indexOf(key.toLowerCase()) >= 0) return { key:key, roles: courseToRolesMap[key] || [] };
    }
    // fallback: still show general internship roles so there's always a suggestion
    return { key:"Your Course", roles: GENERIC_ROLES };
  }

  // Complete, official undergraduate programme lists for the six Singapore
  // autonomous universities, using each university's exact full degree names.
  // Drives the Course dropdown directly.
  var ihlCoursesMap = {
    "Singapore Institute of Technology (SIT)": [
      "Bachelor of Science with Honours in Applied Computing (Fintech)",
      "Bachelor of Science with Honours in Computing Science",
      "Bachelor of Science with Honours in Information and Communications Technology (Information Security)",
      "Bachelor of Science with Honours in Information and Communications Technology (Software Engineering)",
      "Bachelor of Science with Honours in Applied Artificial Intelligence",
      "Bachelor of Science with Honours in Digital Communications and Integrated Media",
      "Bachelor of Science in Computer Science in Interactive Media and Game Development",
      "Bachelor of Science in Computer Science in Real-Time Interactive Simulation",
      "Bachelor of Fine Arts in Digital Art and Animation",
      "Bachelor of Engineering with Honours in Software Engineering",
      "Bachelor of Engineering with Honours in Computer Engineering",
      "Bachelor of Engineering with Honours in Electronics and Data Engineering",
      "Bachelor of Engineering with Honours in Systems Engineering",
      "Bachelor of Engineering with Honours in Mechatronics Systems",
      "Bachelor of Engineering with Honours in Robotics Systems",
      "Bachelor of Engineering with Honours in Electrical Power Engineering",
      "Bachelor of Engineering with Honours in Chemical Engineering",
      "Bachelor of Engineering with Honours in Civil Engineering",
      "Bachelor of Engineering with Honours in Mechanical Engineering",
      "Bachelor of Engineering with Honours in Mechanical Design and Manufacturing Engineering",
      "Bachelor of Engineering with Honours in Naval Architecture and Marine Engineering",
      "Bachelor of Engineering with Honours in Aircraft Systems Engineering",
      "Bachelor of Science with Honours in Pharmaceutical Engineering",
      "Bachelor of Science with Honours in Accountancy",
      "Bachelor of Business Administration with Honours in Hospitality Business",
      "Bachelor of Business Administration in Food Business Management",
      "Bachelor of Science with Honours in Business and Infocomm Technology",
      "Bachelor of Science with Honours in Aviation Management",
      "Bachelor of Science with Honours in Digital Supply Chain",
      "Bachelor of Science with Honours in Food Technology",
      "Bachelor of Science with Honours in Nursing",
      "Bachelor of Science with Honours in Physiotherapy",
      "Bachelor of Science with Honours in Occupational Therapy",
      "Bachelor of Science with Honours in Diagnostic Radiography",
      "Bachelor of Science with Honours in Radiation Therapy",
      "Bachelor of Science with Honours in Speech and Language Therapy",
      "Bachelor of Science with Honours in Dietetics and Nutrition",
      OTHER_COURSE
    ],
    "National University of Singapore (NUS)": [
      "Bachelor of Computing (Computer Science)",
      "Bachelor of Computing (Information Systems)",
      "Bachelor of Computing (Information Security)",
      "Bachelor of Computing (Business Analytics)",
      "Bachelor of Science (Data Science and Analytics)",
      "Bachelor of Science (Data Science and Economics)",
      "Bachelor of Science (Business Artificial Intelligence Systems)",
      "Bachelor of Engineering (Computer Engineering)",
      "Bachelor of Engineering (Electrical Engineering)",
      "Bachelor of Engineering (Biomedical Engineering)",
      "Bachelor of Engineering (Chemical Engineering)",
      "Bachelor of Engineering (Civil Engineering)",
      "Bachelor of Engineering (Environmental Engineering)",
      "Bachelor of Engineering (Industrial & Systems Engineering)",
      "Bachelor of Engineering (Infrastructure & Project Management)",
      "Bachelor of Engineering (Materials Science & Engineering)",
      "Bachelor of Engineering (Mechanical Engineering)",
      "Bachelor of Engineering (Engineering Science)",
      "Bachelor of Business Administration",
      "Bachelor of Business Administration (Accountancy)",
      "Bachelor of Science (Quantitative Finance)",
      "Bachelor of Science (Real Estate)",
      "Bachelor of Arts (Humanities and Sciences)",
      "Bachelor of Arts (Economics)",
      "Bachelor of Arts (Philosophy, Politics and Economics)",
      "Bachelor of Arts (Communication and New Media)",
      "Bachelor of Arts (Psychology)",
      "Bachelor of Arts (Global Studies)",
      "Bachelor of Science (Chemistry)",
      "Bachelor of Science (Life Sciences)",
      "Bachelor of Science (Mathematical Sciences)",
      "Bachelor of Science (Physics)",
      "Bachelor of Science (Statistics)",
      "Bachelor of Science (Food Science and Technology)",
      "Bachelor of Science (Pharmaceutical Science)",
      "Bachelor of Pharmacy",
      "Bachelor of Arts (Architecture)",
      "Bachelor of Arts (Industrial Design)",
      "Bachelor of Landscape Architecture",
      "Bachelor of Laws (LL.B.)",
      "Bachelor of Dental Surgery (B.D.S.)",
      "Bachelor of Medicine and Bachelor of Surgery (M.B.B.S.)",
      "Bachelor of Science (Nursing)",
      "Bachelor of Music",
      OTHER_COURSE
    ],
    "Nanyang Technological University (NTU)": [
      "Bachelor of Engineering (Computer Science)",
      "Bachelor of Engineering (Computer Engineering)",
      "Bachelor of Science (Data Science and Artificial Intelligence)",
      "Bachelor of Science (Artificial Intelligence and Computing Sciences)",
      "Bachelor of Engineering (Information Engineering and Media)",
      "Double Degree in Business and Computer Science (BCG)",
      "Double Degree in Computer Science and Economics",
      "Bachelor of Business",
      "Bachelor of Accountancy",
      "Double Degree in Accountancy and Business",
      "Bachelor of Engineering (Electrical and Electronic Engineering)",
      "Bachelor of Engineering (Mechanical Engineering)",
      "Bachelor of Engineering (Civil Engineering)",
      "Bachelor of Engineering (Bioengineering)",
      "Bachelor of Engineering (Chemical and Biomolecular Engineering)",
      "Bachelor of Engineering (Environmental Engineering)",
      "Bachelor of Engineering (Materials Engineering)",
      "Bachelor of Engineering (Aerospace Engineering)",
      "Bachelor of Science (Maritime Studies)",
      "Bachelor of Science (Mathematical Sciences)",
      "Bachelor of Science (Mathematics and Computer Science)",
      "Bachelor of Science (Physics and Applied Physics)",
      "Bachelor of Science (Biological Sciences)",
      "Bachelor of Science (Chemistry and Biological Chemistry)",
      "Bachelor of Science (Environmental Earth System Science)",
      "Bachelor of Arts (Economics)",
      "Bachelor of Arts (Economics and Data Science)",
      "Bachelor of Arts (Psychology)",
      "Bachelor of Arts (Sociology)",
      "Bachelor of Arts (Linguistics and Multilingual Studies)",
      "Bachelor of Arts (English)",
      "Bachelor of Arts (History)",
      "Bachelor of Arts (Philosophy)",
      "Bachelor of Arts (Art, Design and Media)",
      "Bachelor of Communication Studies",
      "Bachelor of Science (Sport Science and Management)",
      "Bachelor of Medicine and Bachelor of Surgery (M.B.B.S.)",
      OTHER_COURSE
    ],
    "Singapore Management University (SMU)": [
      "Bachelor of Science (Computer Science)",
      "Bachelor of Science (Information Systems)",
      "Bachelor of Science (Software Engineering) WSDeg",
      "Bachelor of Science (Computing & Law)",
      "Bachelor of Science (Data Science & Analytics)",
      "Bachelor of Business Management",
      "Bachelor of Accountancy",
      "Bachelor of Science (Economics)",
      "Bachelor of Laws (LL.B.)",
      "Bachelor of Social Science",
      "Bachelor of Science (Politics, Law and Economics)",
      "Bachelor of Science in Integrative Studies",
      OTHER_COURSE
    ],
    "Singapore University of Technology and Design (SUTD)": [
      "Bachelor of Engineering (Computer Science and Design)",
      "Bachelor of Engineering (Design and Artificial Intelligence)",
      "Bachelor of Engineering (Engineering Product Development)",
      "Bachelor of Engineering (Engineering Systems and Design)",
      "Bachelor of Science (Architecture and Sustainable Design)",
      "SUTD-Duke-NUS Special Track",
      OTHER_COURSE
    ],
    "Singapore University of Social Sciences (SUSS)": [
      "Bachelor of Science in Information and Communication Technology",
      "Bachelor of Science in Business Analytics",
      "Bachelor of Science in Finance with Digital Technology",
      "Bachelor of Science in Business & Digital Marketing",
      "Bachelor of Science in Supply Chain Management",
      "Bachelor of Accountancy",
      "Bachelor of Human Resource Management",
      "Bachelor of Science in Building and Project Management",
      "Bachelor of Public Safety and Security",
      "Bachelor of Social Work",
      "Bachelor of Early Childhood Education",
      "Bachelor of Digital Media",
      "Bachelor of Laws (LL.B.)",
      OTHER_COURSE
    ]
  };
  var IHLS = Object.keys(ihlCoursesMap);

  // ---- Best-fit scoring: infer keyword/role signals from a course title ----
  // (Dropped the per-course template table; signals are derived from the title
  //  so the comprehensive programme list stays easy to maintain.)
  var COURSE_SIGNALS = [
    { re:/fintech|financial tech/i,                       roles:["fintech","swe","data","finance"], core:["fintech","payments","blockchain"] },
    { re:/software|computing|computer sci|comp\. \(hons\)/i, roles:["swe","cloud","data"],           core:["api","backend","algorithm","software"] },
    { re:/information security|cyber|forensic/i,          roles:["cyber","cloud","swe"],             core:["security","penetration","soc","vulnerability"] },
    { re:/artificial intelligence|data science|\bai\b|analytics|data engineering/i, roles:["data","swe","fintech"], core:["machine learning","model","data","analytics"] },
    { re:/information system|infocomm|ict/i,              roles:["swe","data","product"],            core:["database","requirements","systems","erp"] },
    { re:/computer engineering|electronic|electrical/i,   roles:["ee","swe","systems"],              core:["embedded","firmware","hardware","circuit"] },
    { re:/mechatronic|robotic/i,                          roles:["ee","mech","systems"],             core:["robotics","embedded","automation"] },
    { re:/mechanical|manufactur|aerospace|aircraft|marine|naval|chemical|civil|materials|environmental|bioeng|biomedical|product development|systems and design|engineering science|maritime|infrastructure/i, roles:["mech","systems","ee"], core:["cad","design","engineering"] },
    { re:/accountan|accountancy|\bacc\.\b/i,              roles:["finance"],                         core:["audit","tax","reporting"] },
    { re:/finance|quantitative finance|economics|econ/i,  roles:["finance","fintech","data"],        core:["valuation","risk","markets"] },
    { re:/business|management|b\.b\.a|b\.b\.m|b\.bus|hrm|human resource|hospitality|supply chain|real estate|aviation/i, roles:["product","finance","marketing"], core:["operations","management","strategy"] },
    { re:/marketing/i,                                    roles:["marketing","product"],             core:["brand","campaign","content"] },
    { re:/media|animation|art|design|communication|game|interactive|music/i, roles:["media","design","product"], core:["content","design","media"] },
    { re:/law|\bll\.b|juris/i,                            roles:["product"],                         core:["legal","compliance"] },
    { re:/nursing|physiotherapy|therapy|radiograph|dietetic|medicine|surgery|dental|pharmac|health|life sciences|biolog|chemistry|physics|food/i, roles:["product"], core:["clinical","research","lab"] }
  ];
  function inferSignals(name) {
    var roles = {}, core = {};
    COURSE_SIGNALS.forEach(function (sig) {
      if (sig.re.test(name)) { sig.roles.forEach(function (r){ roles[r]=1; }); sig.core.forEach(function (c){ core[c]=1; }); }
    });
    // keyword set = lowercased significant words from the title + the core skills
    var words = name.toLowerCase().replace(/\(.*?\)|b\.[a-z.]+|hons|double degree|&/g, " ").split(/[^a-z+]+/).filter(function (w){ return w.length>3; });
    var kws = words.concat(Object.keys(core));
    return { kws: kws, roles: Object.keys(roles), core: Object.keys(core) };
  }

  function coursesForIhl(ihl) { return ihlCoursesMap[ihl] || []; }
  function courseDef(ihl, name) {
    if (!name || name === OTHER_COURSE) return null;
    var list = coursesForIhl(ihl);
    if (list.indexOf(name) < 0) {
      // allow a custom-entered major too (scored via inference)
      if (!name) return null;
    }
    var sig = inferSignals(name);
    return { name: name, kws: sig.kws, roles: sig.roles, core: sig.core };
  }
  function getStudy() { try { return JSON.parse(localStorage.getItem(STUDY_KEY)) || {ihl:"",course:""}; } catch(e){ return {ihl:"",course:""}; } }
  function setStudy(obj) { try { localStorage.setItem(STUDY_KEY, JSON.stringify(obj)); } catch(e){} }

  // Compute fit: keyword overlap + relevance bonus + alignment tags.
  function computeFit(x, course) {
    if (!course) return { score:null, matched:[], relevant:false, tags:[], bonus:0 };
    var text=((x.role||"")+" "+(x.jobdesc||"")+" "+(x.term||"")+" "+(x.location||"")).toLowerCase();
    var kws = course.kws || [];
    var matched=[]; kws.forEach(function (k){ if (text.indexOf(k)>=0 && matched.indexOf(k)<0) matched.push(k); });
    var base = kws.length ? Math.round(matched.length/kws.length*100) : 0;

    // affinity: does the role hit the course's target role categories?
    var hitRoles=[];
    (course.roles||[]).forEach(function (rc) {
      var toks = ROLE_TOKENS[rc] || [];
      if (toks.some(function (t){ return text.indexOf(t)>=0; })) hitRoles.push(rc);
    });
    // core tech: does the JD mention the course's signature skills?
    var coreHits = (course.core||[]).filter(function (k){ return text.indexOf(k)>=0; });

    var tags = [];
    var bonus = 0;
    if (hitRoles.length) { tags.push({ t:"Direct Discipline Match", kind:"disc" }); bonus += Math.min(20, 10 + hitRoles.length*4); }
    if (coreHits.length) { tags.push({ t:"Core Tech Requirement", kind:"core" }); bonus += Math.min(15, coreHits.length*5); }
    if ((x.jobdesc||"").length>120 && base>0) base += 5;

    var relevant = tags.length > 0;
    var score = Math.min(100, base + bonus);
    return { score: score, matched: matched, relevant: relevant, tags: tags, bonus: bonus, coreHits: coreHits };
  }
  function autoProsCons(x) {
    var pros=[],cons=[]; var loc=(x.location||"").toLowerCase();
    if (loc.indexOf("remote")>=0) pros.push("Remote-friendly");
    if (loc.indexOf("hybrid")>=0) pros.push("Hybrid work");
    if (loc.indexOf("on-site")>=0||loc.indexOf("onsite")>=0) cons.push("On-site required");
    if (loc.indexOf("overseas")>=0||loc.indexOf("relocation")>=0) cons.push("Requires relocation");
    if (x.comp) pros.push("Pays "+x.comp); else cons.push("Compensation not noted");
    if (x.priority==="High") pros.push("Marked High priority"); if (x.priority==="Low") cons.push("Marked Low priority");
    if (x.hours) pros.push(x.hours);
    if (x.status==="Offer Received") pros.push("Offer in hand"); if (x.status==="Rejected") cons.push("Already rejected"); if (x.status==="Withdrawn") cons.push("Withdrawn");
    var du=daysUntil(x.deadline); if (du!==null&&du>=0&&du<=7) cons.push("Deadline in "+du+"d");
    return { pros:pros, cons:cons };
  }
  var cmpSelected = [];
  var cmpShowThird = false;
  // One labelled row inside a comparison card: a key on the left, value(s) on the right.
  function cmpRow(label, valueHTML) {
    return '<div class="cmp-row"><div class="k">'+esc(label)+'</div><div class="v">'+valueHTML+'</div></div>';
  }
  // Build the <option> list for the Course dropdown from ihlCoursesMap.
  function courseOptionsHTML(ihl, selected) {
    if (!ihl) return '<option value="" disabled selected>Select an institution first…</option>';
    var courses = ihlCoursesMap[ihl] || [];
    var html = '<option value="" disabled' + (selected ? "" : " selected") + '>Select course / major…</option>';
    html += courses.map(function (name) {
      return '<option value="' + esc(name) + '"' + (selected === name ? " selected" : "") + ">" + esc(name) + "</option>";
    }).join("");
    return html;
  }
  // Clear the live Course <select> and repopulate it for the chosen institution.
  function populateCourseDropdown(ihl, selected) {
    var sel = $("cmpCourse");
    if (!sel) return;
    sel.innerHTML = "";              // reset / clear existing options
    sel.disabled = !ihl;
    sel.innerHTML = courseOptionsHTML(ihl, selected);
  }
  function studyPicker() {
    var st = getStudy();
    var ihlOpts = '<option value="">Select institution…</option>' +
      IHLS.map(function (i){ return '<option'+(st.ihl===i?' selected':'')+'>'+esc(i)+'</option>'; }).join("");
    var showOther = st.course === OTHER_COURSE;
    return '<div class="cmp-study cmp-study-2">' +
      '<div class="cmp-field"><label>🏫 University</label><select id="cmpIhl" class="ctl-wide">'+ihlOpts+'</select></div>' +
      '<div class="cmp-field"><label>🎓 Course / Major</label><select id="cmpCourse" class="ctl-wide"'+(st.ihl?"":" disabled")+'>'+courseOptionsHTML(st.ihl, st.course)+'</select></div>' +
      '<div class="cmp-field" id="cmpCourseOtherWrap" style="'+(showOther?"":"display:none")+'"><label>Enter your course / major</label><input id="cmpCourseOther" class="ctl-wide" placeholder="Type your major" value="'+esc(st.courseOther||"")+'" /></div>' +
      '</div>';
  }
  function renderCompareInline() {
    var st = getStudy();
    // When "Other Course / Major..." is chosen, score against the custom text.
    var effectiveCourse = (st.course === OTHER_COURSE) ? (st.courseOther || "") : st.course;
    var course = effectiveCourse ? courseDef(st.ihl, effectiveCourse) : null;
    var picker = studyPicker();
    if (!data.length) { $("compareInline").innerHTML = picker + '<div class="cmp-empty">Add applications first, then compare them here.</div>'; bindStudy(); return; }
    // --- Dropdown selectors (Role #1 / #2 / optional #3) ---
    // cmpSelected holds up to 3 application ids chosen from the dropdowns.
    if (cmpSelected.length < 2) { while (cmpSelected.length < 2) cmpSelected.push(""); }
    var slots = cmpSelected.slice(0, cmpShowThird ? 3 : 2);
    function optionList(selectedId) {
      return '<option value="">Select a role…</option>' +
        data.map(function (x) {
          var pay = stipendValue(x.comp); var payStr = (pay!=null&&pay>=0) ? " ($"+Math.round(pay).toLocaleString()+"/mo)" : "";
          return '<option value="'+x.id+'"'+(selectedId===x.id?" selected":"")+'>'+esc((x.company||"—")+" — "+(x.role||"Role")+payStr)+'</option>';
        }).join("");
    }
    var selHTML = slots.map(function (id, i) {
      return '<div class="cmp-field"><label>Select Applied Role #'+(i+1)+'</label>' +
        '<select id="compareRoleSelect'+(i+1)+'" class="compare-select" data-slot="'+i+'" data-empty="'+(id?"false":"true")+'">'+optionList(id)+'</select></div>';
    }).join("");
    var addBtn = (!cmpShowThird) ? '<button type="button" class="cmp-add-role" id="cmpAddRole">+ Add Role to Compare</button>' : '';
    var pick = '<div class="cmp-pickwrap"><div class="lbl">Compare your applied roles</div>' +
      '<div class="compare-selects">'+selHTML+'</div>'+addBtn+'</div>';

    // --- Resolve chosen applications ---
    var cols = slots.map(function (id){ return id ? data.find(function (x){ return x.id===id; }) : null; }).filter(Boolean);
    var body;
    if (cols.length < 2) { body = '<div class="cmp-empty">Select at least two applied roles above to compare them side by side.</div>'; }
    else {
      var fits = cols.map(function (x){ return computeFit(x, course); });
      var maxScore=-1; fits.forEach(function (f){ if (f.score!==null&&f.score>maxScore) maxScore=f.score; });
      // highest salary among selected (for green highlight)
      var payVals = cols.map(function (x){ var v=stipendValue(x.comp); return (v!=null&&v>=0)?v:-1; });
      var maxPay = Math.max.apply(null, payVals);
      var colsHTML = cols.map(function (x,i) {
        var f=fits[i]; var isBest=f.score!==null&&f.score===maxScore&&maxScore>0; var pc=autoProsCons(x);
        var tagHTML = (f.tags && f.tags.length)
          ? '<div class="align-tags">'+f.tags.map(function (tg){ return '<span class="align-tag '+tg.kind+'">✦ '+esc(tg.t)+'</span>'; }).join("")+(f.bonus?'<span class="align-bonus">+'+f.bonus+'%</span>':'')+'</div>'
          : '';
        var scoreBlock=(f.score===null)?'<div class="fit"><div class="k">Pick your university &amp; course above to see a fit score.</div></div>'
          :'<div class="fit"><div class="score">'+f.score+'<span style="font-size:14px;color:var(--muted)">% fit</span></div><div class="bar"><span style="width:'+f.score+'%"></span></div>'+
            tagHTML + '</div>';
        // salary row — green-highlight the higher pay
        var payHigh = payVals[i]>=0 && payVals[i]===maxPay && cols.length>1 && payVals.filter(function(p){return p===maxPay;}).length===1;
        var payCell = x.comp ? ('<span class="'+(payHigh?"cmp-win":"")+'">'+esc(x.comp)+(payHigh?' 🏆':'')+'</span>') : '—';
        // work arrangement flag
        var loc=(x.location||"").toLowerCase(); var workFlag="";
        if (loc.indexOf("remote")>=0) workFlag=' <span class="cmp-flag good">remote</span>';
        else if (loc.indexOf("hybrid")>=0) workFlag=' <span class="cmp-flag ok">hybrid</span>';
        else if (loc.indexOf("on-site")>=0||loc.indexOf("onsite")>=0) workFlag=' <span class="cmp-flag warn">on-site</span>';
        return '<div class="cmp-col'+(isBest?' best':'')+'">' +
          '<div class="cmp-col-head"><div class="cco">'+esc(x.company||"—")+'</div><div class="crl">'+esc(x.role||"")+'</div>'+(isBest?'<span class="cmp-badge-best">★ Best fit for you</span>':'')+'</div>'+
          scoreBlock +
          '<div class="cmp-rows">' +
            cmpRow("Salary", payCell) +
            cmpRow("Work Arrangement", esc(x.location||"—")+workFlag) +
            cmpRow("Industry", esc(industryOf(x)||"—")) +
            cmpRow("Application Stage", pillHTML(x.status)) +
            cmpRow("Availability", esc(availabilityLabel(x)||"—")) +
            cmpRow("Hours", esc(x.hours||"—")) +
            '<div class="cmp-row"><div class="k">Advantages</div>'+(pc.pros.length?pc.pros.map(function(tt){return '<div class="cmp-mini pro">✔ '+esc(tt)+'</div>';}).join(""):'<div class="v">—</div>')+'</div>'+
            '<div class="cmp-row"><div class="k">Disadvantages</div>'+(pc.cons.length?pc.cons.map(function(tt){return '<div class="cmp-mini con">✘ '+esc(tt)+'</div>';}).join(""):'<div class="v">—</div>')+'</div>'+
            (x.prosCons?cmpRow("Your Notes",esc(x.prosCons)):"") +
          '</div></div>';
      }).join("");
      body='<div class="cmp-grid">'+colsHTML+'</div>';
    }

    $("compareInline").innerHTML = picker + suggestionsHTML(effectiveCourse) + pick + body;
    bindStudy();
    wireSuggestions();
    // dropdown change handlers
    $("compareInline").querySelectorAll(".compare-select").forEach(function (sel) {
      sel.onchange = function () { var i=parseInt(sel.getAttribute("data-slot"),10); cmpSelected[i]=sel.value; renderCompareInline(); };
    });
    var addRole = $("cmpAddRole");
    if (addRole) addRole.onclick = function () { cmpShowThird = true; if (cmpSelected.length<3) cmpSelected.push(""); renderCompareInline(); };
  }
  // Suggested-roles block shown below the Course dropdown.
  function suggestionsHTML(courseTitle) {
    var sug = suggestedRolesFor(courseTitle);
    if (!sug.roles.length) return "";
    var badges = sug.roles.map(function (r){ return '<button type="button" class="role-chip" data-role="'+esc(r)+'">'+esc(r)+'</button>'; }).join("");
    return '<div class="role-suggest">' +
      '<div class="role-suggest-title">💡 Suggested Roles for ' + esc(sug.key) + '</div>' +
      '<div class="role-chips">' + badges + '</div></div>';
  }
  function wireSuggestions() {
    $("compareInline").querySelectorAll("[data-role]").forEach(function (b) {
      b.onclick = function () {
        var role = b.getAttribute("data-role");
        var rl = role.toLowerCase();
        // Auto-select any tracked applications whose role matches the suggestion.
        var matched = data.filter(function (x) {
          var r = (x.role||"").toLowerCase();
          return r.indexOf(rl) >= 0 || rl.indexOf(r) >= 0 ||
                 r.split(/\s+/).some(function (w){ return w.length>3 && rl.indexOf(w)>=0; });
        });
        if (matched.length) {
          matched.forEach(function (m){ if (cmpSelected.indexOf(m.id) < 0) cmpSelected.push(m.id); });
          b.classList.add("picked");
          showToast("Added " + matched.length + " matching role" + (matched.length===1?"":"s") + " to compare");
          renderCompareInline();
        } else {
          // Pre-fill a new application with this role so the user can track it.
          showToast("No tracked role matches — opening a new application");
          openModal(null);
          setTimeout(function (){ var el=$("f_role"); if (el) el.value = role; }, 120);
        }
      };
    });
  }
  function cmpRow(k,v){ return '<div class="cmp-row"><div class="k">'+k+'</div><div class="v">'+v+'</div></div>'; }
  function bindStudy() {
    var ihl=$("cmpIhl"), course=$("cmpCourse"), other=$("cmpCourseOther");
    if (ihl) ihl.addEventListener("change", function () {
      // On institution change: clear + dynamically repopulate the course dropdown,
      // reset the selected course, persist, then re-render the comparison.
      var st = getStudy();
      st.ihl = ihl.value;
      st.course = ""; st.courseOther = "";
      setStudy(st);
      populateCourseDropdown(ihl.value, "");   // clear & regenerate options from ihlCoursesMap
      renderCompareInline();
    });
    if (course) course.addEventListener("change", function () {
      var st = getStudy();
      st.course = course.value;
      if (st.course !== OTHER_COURSE) st.courseOther = "";
      setStudy(st);
      // toggle the custom-course input without a full re-render when possible
      var wrap = $("cmpCourseOtherWrap");
      if (wrap) wrap.style.display = (st.course === OTHER_COURSE) ? "" : "none";
      renderCompareInline();
    });
    if (other) other.addEventListener("input", function () {
      var st = getStudy(); st.courseOther = other.value; setStudy(st);
    });
    if (other) other.addEventListener("change", function () {
      var st = getStudy(); st.courseOther = other.value; setStudy(st);
      renderCompareInline(); setTimeout(function(){ var e=$("cmpCourseOther"); if(e) e.focus(); },0);
    });
  }

  // ---------- tabs ----------
  function switchTab(t) {
    tab = t;
    ["dashboard","applications","analytics","compare"].forEach(function (name){ $("tab-"+name).classList.toggle("hidden", name!==t); });
    // keep BOTH mobile bottom nav and desktop header nav in sync
    document.querySelectorAll(".navtab, .htab").forEach(function (b){ b.classList.toggle("active", b.getAttribute("data-tab")===t); });
    // view switcher + filters only relevant to list tabs
    var listTab = (t==="dashboard"||t==="applications");
    $("viewSeg").style.display = listTab ? "" : "none";
    $("filterRow").style.display = listTab ? "" : "none";
    $("searchWrap").style.display = (t==="analytics") ? "none" : "";
    $("scroll").scrollTop = 0;
    render();
  }

  // ---------- platform detection (adaptive layout) ----------
  function isTouchDevice() {
    return ("ontouchstart" in window) || (navigator.maxTouchPoints > 0) ||
           /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || "");
  }
  function applyPlatform() {
    var touch = isTouchDevice();
    var narrow = window.innerWidth < 768;
    // Desktop experience when the viewport is wide AND it's not a primary touch device
    var desktop = window.innerWidth >= 768 && !touch;
    var b = document.body;
    b.classList.toggle("is-desktop", desktop);
    b.classList.toggle("is-mobile-ios", !desktop);
  }

  // ---------- more menu ----------
  function openMore() { renderSyncBadge(); $("moreBg").classList.add("show"); }
  function closeMore() { $("moreBg").classList.remove("show"); }

  // ---------- wire up ----------
  fillStatusSelects();
  $("fab").onclick = function (){ openModal(null); };
  $("f_industry").onchange = function (){ toggleIndustryOther(); refreshSelectPlaceholders(); };   // reveal custom input when "Others" chosen
  $("f_location").onchange = refreshSelectPlaceholders;
  $("f_priority").onchange = refreshSelectPlaceholders;
  // keep the uppercase date placeholder hint in sync as users pick/clear dates
  Array.prototype.forEach.call(document.querySelectorAll("input.date-dmy"), function (el) {
    el.addEventListener("input", function (){ el.setAttribute("data-empty", el.value ? "false" : "true"); });
    el.addEventListener("change", function (){ el.setAttribute("data-empty", el.value ? "false" : "true"); });
  });
  refreshDatePlaceholders();
  $("closeModal").onclick = closeModal; $("cancelBtn").onclick = closeModal; $("saveBtn").onclick = saveForm;
  $("modalBg").addEventListener("click", function (e){ if (e.target===$("modalBg")) closeModal(); });
  $("closeStatus").onclick = closeStatus;
  $("statusBg").addEventListener("click", function (e){ if (e.target===$("statusBg")) closeStatus(); });
  $("moreBtn").onclick = openMore; $("closeMore").onclick = closeMore;
  $("moreBg").addEventListener("click", function (e){ if (e.target===$("moreBg")) closeMore(); });
  $("exportBtn").onclick = exportData;
  $("exportCsvBtn").onclick = exportCsv;
  $("exportCsvQuick").onclick = exportCsv;
  $("favToggle").onclick = function () {
    favOnly = !favOnly;
    $("favToggle").classList.toggle("active", favOnly);
    render();
  };
  $("archiveToggle").onclick = function () {
    hideArchived = !hideArchived;
    $("archiveToggle").classList.toggle("active", hideArchived);
    render();
  };
  $("importBtn").onclick = function (){ $("importFile").click(); };
  $("importFile").onchange = function (e){ if (e.target.files[0]) importData(e.target.files[0]); e.target.value=""; };
  $("sampleBtn").onclick = loadSample;

  // Minimal, standard editor behaviours only: Esc closes dialogs,
  // ⌘/Ctrl+Enter saves the open form.
  document.addEventListener("keydown", function (e) {
    if (e.key==="Escape") { closeModal(); closeStatus(); closeMore(); return; }
    if (e.key==="Enter" && (e.metaKey||e.ctrlKey) && $("modalBg").classList.contains("show")) { saveForm(); return; }
  });
  $("search").oninput = render;
  $("statusFilter").onchange = render;
  $("sortBy").onchange = render;
  $("addDesktop").onclick = function (){ openModal(null); };
  // both mobile bottom tabs and desktop header tabs drive switchTab
  document.querySelectorAll(".navtab, .htab").forEach(function (b){ b.onclick = function (){ switchTab(b.getAttribute("data-tab")); }; });
  $("viewSeg").querySelectorAll("button").forEach(function (b){
    b.onclick = function () {
      view = b.getAttribute("data-view");
      $("viewSeg").querySelectorAll("button").forEach(function (x){ x.classList.toggle("active", x===b); });
      $("app").classList.toggle("wide", view==="board" && !document.body.classList.contains("is-desktop"));
      // status tabs + favorites are irrelevant in Calendar view — hide them there
      var showFilters = (view !== "calendar");
      ["catTabs","catTabsApps"].forEach(function (id){ var el=$(id); if (el) el.style.display = showFilters ? "" : "none"; });
      var fav=$("favToggle"); if (fav) fav.style.display = showFilters ? "" : "none";
      render();
    };
  });

  // Close any open meatball menu when clicking anywhere outside it, or on Esc.
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".meatball-wrap")) closeAllMeatballs();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeAllMeatballs();
  });

  // Greeting banner: tap name or avatar to set your display name
  (function wireGreeting() {
    var nm = $("greetName"); if (nm) nm.onclick = promptUserName;
    var av = $("greetAvatar"); if (av) av.onclick = promptUserName;
    var bell = $("greetBell"); if (bell) bell.onclick = function () {
      switchTab("analytics");
      document.querySelectorAll(".navtab, .htab").forEach(function (b){ b.classList.toggle("active", b.getAttribute("data-tab")==="analytics"); });
    };
  })();

  // Search-row filter button: scroll to + flash the filter controls
  (function wireFilterBtn() {
    var fb = $("filterBtn"); if (!fb) return;
    fb.onclick = function () {
      var row = $("filterRow"); if (!row) return;
      row.classList.add("flash");
      try { row.scrollIntoView({ behavior:"smooth", block:"nearest" }); } catch (e) {}
      var first = row.querySelector("select"); if (first) { try { first.focus(); } catch (e) {} }
      setTimeout(function (){ row.classList.remove("flash"); }, 900);
    };
  })();

  // Detail view: back + favourite(heart) controls
  (function wireDetail() {
    var back = $("detailBack"); if (back) back.onclick = closeDetail;
    var fav = $("detailFav");
    if (fav) fav.onclick = function () {
      if (!detailId) return;
      toggleBookmark(detailId);                 // persists + re-renders feed
      var x = data.find(function (v){ return v.id===detailId; });
      fav.textContent = (x && x.bookmarked) ? "♥" : "♡";
      fav.classList.toggle("on", !!(x && x.bookmarked));
    };
    // Esc closes the detail panel
    document.addEventListener("keydown", function (e){ if (e.key==="Escape" && detailId) closeDetail(); });
    // Desktop modal: click on the dimmed backdrop (outside the card) closes it
    var dv = $("detailView");
    if (dv) dv.addEventListener("click", function (e){
      if (!document.body.classList.contains("is-desktop")) return;
      if (e.target === dv) closeDetail();       // clicked the backdrop, not the card
    });
  })();

  // Adaptive layout: detect platform on load + react to viewport changes
  applyPlatform();
  var rzTimer;
  window.addEventListener("resize", function () {
    clearTimeout(rzTimer);
    rzTimer = setTimeout(function () {
      var wasDesktop = document.body.classList.contains("is-desktop");
      applyPlatform();
      var nowDesktop = document.body.classList.contains("is-desktop");
      if (wasDesktop !== nowDesktop) { $("app").classList.remove("wide"); render(); }
    }, 150);
  });

  render();
})();
