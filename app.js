(function () {
  "use strict";
  var STORAGE_KEY = "catchtheoffer.v1";
  var LEGACY_KEY = "internship-tracker.v1";
  var SYNC_KEY = "catchtheoffer.sync";

  // Simplified status set
  var STATUSES = [
    { name: "Applied",          key: "sky",    pending: true  },
    { name: "Online Assessment",key: "violet", pending: true  },
    { name: "Interview",        key: "amber",  pending: true  },
    { name: "Offer Received",   key: "green",  pending: false },
    { name: "Rejected",         key: "red",    pending: false },
    { name: "Withdrawn",        key: "slate",  pending: false }
  ];
  // Map old (detailed) statuses -> new simplified ones, for migrating existing data
  var LEGACY_MAP = {
    "Not Started / To Apply": "Applied",
    "Applied / Pending": "Applied",
    "OA / Technical Assessment": "Online Assessment",
    "HR / Screening Interview": "Interview",
    "Technical / Round 1 Interview": "Interview",
    "Final Round Interview": "Interview",
    "Offer Received": "Offer Received",
    "Rejected": "Rejected",
    "Withdrawn": "Withdrawn"
  };

  // soft-fill pill colors for light surfaces
  var PILL = {
    // Applied — Sky Blue #0284C7
    sky:    { bg:"rgba(2,132,199,.12)",   fg:"#0284c7" },
    // Online Assessment / Awaiting Reply — Lavender / Purple #9333EA
    violet: { bg:"rgba(147,51,234,.12)",  fg:"#9333ea" },
    // Interview / Interviewed — Amber Yellow #D97706
    amber:  { bg:"rgba(217,119,6,.14)",   fg:"#d97706" },
    // Offer Received — Neon Green #10B981
    green:  { bg:"rgba(16,185,129,.16)",  fg:"#059669" },
    // Rejected — Dark Slate Gray #64748B
    red:    { bg:"rgba(100,116,139,.15)", fg:"#64748b" },
    // Withdrawn — Dark Slate Gray #64748B
    slate:  { bg:"rgba(100,116,139,.15)", fg:"#64748b" }
  };

  var FIELDS = ["company","role","term","location","status","jobdesc","url","appliedDate","deadline","followup",
    "oaDate","interviewDates","stageNotes","comp","hours","offerDeadline","priority","prosCons",
    "referral","docs","nextAction"];

  var STUDY_KEY = "catchtheoffer.study";

  var data = load();
  var editingId = null;
  var view = "table";

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (!raw) { try { raw = localStorage.getItem(LEGACY_KEY); } catch (e) {} } // migrate old data
    var arr = [];
    try { arr = raw ? JSON.parse(raw) : []; } catch (e) { arr = []; }
    // normalize statuses to the simplified set
    arr.forEach(function (x) {
      if (x.status && LEGACY_MAP[x.status]) x.status = LEGACY_MAP[x.status];
      if (!statusValid(x.status)) x.status = "Applied";
    });
    return arr;
  }
  function statusValid(name) { for (var i=0;i<STATUSES.length;i++) if (STATUSES[i].name===name) return true; return false; }
  function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
  function statusDef(name) { for (var i=0;i<STATUSES.length;i++) if (STATUSES[i].name===name) return STATUSES[i]; return STATUSES[0]; }
  function pillHTML(name) { var p = PILL[statusDef(name).key]; return '<span class="pill" style="background:'+p.bg+';color:'+p.fg+'"><span class="dot"></span>'+esc(name)+'</span>'; }
  function swatch(name) { var p = PILL[statusDef(name).key]; return '<span class="sw" style="background:'+p.fg+'"></span>'; }

  function fmtDate(d) { if (!d) return ""; var p=d.split("-"); if (p.length!==3) return d;
    var m=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]; return m[parseInt(p[1],10)-1]+" "+parseInt(p[2],10)+", "+p[0]; }
  function daysUntil(d) { if (!d) return null; var t=new Date(); t.setHours(0,0,0,0); return Math.round((new Date(d+"T00:00:00")-t)/86400000); }
  function deadlineFlag(d, status) { var du=daysUntil(d); if (du===null) return "";
    if (du<0) return '<span class="flag past">passed</span>';
    var live=(status==="Applied");
    if (du===0) return '<span class="flag">today!</span>';
    if (du<=7 && live) return '<span class="flag">'+du+'d left</span>'; return ""; }

  // 14-day follow-up rule: Applied for >14 days with no status progression
  function daysSince(d) { if (!d) return null; var t=new Date(); t.setHours(0,0,0,0); return Math.round((t - new Date(d+"T00:00:00"))/86400000); }
  function followUpDue(x) {
    if (x.status !== "Applied") return false;
    // reference date: last follow-up date if set, else application date
    var ref = x.followup || x.appliedDate;
    var since = daysSince(ref);
    return since !== null && since >= 14;
  }
  function followUpBadge(x) { return followUpDue(x) ? '<span class="followup-badge" title="Applied 14+ days ago — time to follow up">⚠️ Follow-up Due</span>' : ""; }

  // ---------- Copy follow-up email ----------
  function followUpEmail(x) {
    var name = (x.referral && x.referral.split(/[,(]/)[0].trim()) || "there";
    var role = x.role || "the internship role";
    var company = x.company ? " at " + x.company : "";
    var applied = x.appliedDate ? " on " + fmtDate(x.appliedDate) : " recently";
    return "Hi " + name + ",\n\n" +
      "I hope you're doing well. I'm writing to follow up on my application for the " + role + " position" + company +
      ", which I submitted" + applied + ".\n\n" +
      "I remain very enthusiastic about the opportunity and would welcome the chance to contribute. " +
      "I'd be grateful for any update you can share on the status of my application, and I'm happy to provide any additional information you may need.\n\n" +
      "Thank you for your time and consideration.\n\n" +
      "Best regards,\n[Your Name]";
  }
  function copyFollowUp(id) {
    var x = data.find(function (v){ return v.id===id; }); if (!x) return;
    var text = followUpEmail(x);
    function done(){ showToast("✉️ Follow-up email copied to clipboard"); }
    function fallback() {
      var ta=document.createElement("textarea"); ta.value=text; ta.style.position="fixed"; ta.style.opacity="0";
      document.body.appendChild(ta); ta.focus(); ta.select();
      try { document.execCommand("copy"); done(); } catch(e){ showToast("Copy failed — please copy manually"); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else { fallback(); }
  }
  var toastTimer;
  function showToast(msg) {
    var t = $("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(function (){ t.classList.remove("show"); }, 2200);
  }

  function fillStatusSelects() {
    $("f_status").innerHTML = STATUSES.map(function (s){ return '<option value="'+esc(s.name)+'">'+esc(s.name)+'</option>'; }).join("");
    var extra = STATUSES.map(function (s){ return '<option value="'+esc(s.name)+'">'+esc(s.name)+'</option>'; }).join("");
    $("statusFilter").insertAdjacentHTML("beforeend", extra);
  }

  // ---------- KPI cards ----------
  function renderKPIs() {
    var total = data.length;
    var pending = data.filter(function (x){ return statusDef(x.status).pending; }).length;
    var interviewing = data.filter(function (x){ return x.status==="Interview"; }).length;
    var offers = data.filter(function (x){ return x.status==="Offer Received"; }).length;
    var rejected = data.filter(function (x){ return x.status==="Rejected"; }).length;
    var responded = data.filter(function (x){ return x.status==="Interview" || x.status==="Offer Received" || x.status==="Rejected" || x.status==="Online Assessment"; }).length;
    var respRate = total ? Math.round(responded/total*1000)/10 : 0;
    var offerRate = total ? Math.round(offers/total*1000)/10 : 0;

    $("kpis").innerHTML =
      kpi("Total Applied", total, "#0891b2", "rgba(8,145,178,.12)", "💼", (interviewing? interviewing+" active interview"+(interviewing===1?"":"s") : "across all stages")) +
      kpi("Awaiting Reply", pending, "#d97706", "rgba(217,119,6,.14)", "⏳", (respRate+"% response rate")) +
      kpi("Interviewing / Offers", interviewing + offers, "#059669", "rgba(16,185,129,.16)", "🎉", (offers+" offer"+(offers===1?"":"s")+", "+interviewing+" interviewing")) +
      kpi("Rejected / Inactive", rejected, "#e11d48", "rgba(225,29,72,.12)", "❌", (total? Math.round(rejected/total*100)+"% of applications" : "—"));
  }
  function kpi(label, num, color, glow, icon, sub) {
    return '<div class="kpi" style="--accent-col:'+color+'; --glow:'+glow+'">' +
      '<div class="icon">'+icon+'</div>' +
      '<div class="label">'+esc(label)+'</div><div class="num">'+num+'</div><div class="sub">'+esc(sub)+'</div></div>';
  }

  function matchesFilter(x, f) {
    if (f==="__all") return true;
    if (f==="__pending") return statusDef(x.status).pending;
    return x.status===f;
  }

  function filtered() {
    var q = $("search").value.trim().toLowerCase();
    var f = $("statusFilter").value;
    var sort = $("sortBy").value;
    var rows = data.filter(function (x) {
      if (!matchesFilter(x, f)) return false;
      if (q) { var hay=[x.company,x.role,x.location,x.term,x.stageNotes,x.referral,x.nextAction,x.status].join(" ").toLowerCase();
        if (hay.indexOf(q)===-1) return false; }
      return true;
    });
    rows.sort(function (a,b) {
      if (sort==="company") return (a.company||"").localeCompare(b.company||"");
      if (sort==="applied") return (b.appliedDate||"").localeCompare(a.appliedDate||"");
      if (sort==="deadline") return (a.deadline||"9999").localeCompare(b.deadline||"9999");
      return (b._updated||0)-(a._updated||0);
    });
    return rows;
  }

  function render() {
    renderKPIs();
    renderSyncBadge();
    if (!data.length) { renderEmpty(); return; }
    var rows = filtered();
    if (!rows.length) { $("view").innerHTML = '<div class="empty-note">No applications match your filters.</div>'; return; }
    if (view === "board") renderBoard(rows); else renderTable(rows);
    wireRows();
  }

  function renderEmpty() {
    $("view").innerHTML =
      '<div class="empty-fill"><div class="empty-card">' +
        '<svg width="76" height="76" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' +
          '<rect x="2" y="7" width="20" height="13" rx="2"></rect>' +
          '<path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>' +
          '<path d="M2 12h20"></path><circle cx="12" cy="12" r="1.3" fill="#0ea5e9"></circle>' +
        '</svg>' +
        '<h3>Start Catching Offers</h3>' +
        '<p>Add the roles you\u2019ve applied for, what you\u2019re waiting to hear back on, and every interview stage \u2014 all in one place.</p>' +
        '<button class="btn btn-primary" id="emptyAdd">\uFF0B Create First Application</button>' +
        '<button class="sample" id="emptySample">Or click here to load sample data</button>' +
      '</div></div>';
    $("emptyAdd").onclick = function (){ openModal(null); };
    $("emptySample").onclick = loadSample;
  }

  function renderTable(rows) {
    var head = "<tr><th>Company / Role</th><th>Status</th><th>Term</th><th>Location</th><th>Applied</th><th>Deadline</th><th>Next Action</th><th></th></tr>";
    var body = rows.map(function (x) {
      var fu = followUpBadge(x);
      return '<tr data-open="'+x.id+'">' +
        '<td><div class="co">'+esc(x.company||"—")+'</div><div class="rl">'+esc(x.role||"")+'</div></td>' +
        '<td>'+pillHTML(x.status)+(fu?'<div style="margin-top:6px">'+fu+'</div>':'')+'</td>' +
        '<td class="sub2 nowrap">'+esc(x.term||"")+'</td>' +
        '<td class="sub2">'+esc(x.location||"")+'</td>' +
        '<td class="sub2 nowrap">'+esc(fmtDate(x.appliedDate))+'</td>' +
        '<td class="sub2 nowrap">'+(x.deadline?esc(fmtDate(x.deadline))+" "+deadlineFlag(x.deadline,x.status):"")+'</td>' +
        '<td class="sub2">'+esc(x.nextAction||"")+'</td>' +
        '<td class="row-actions"><button class="icon-btn" data-mail="'+x.id+'" title="Copy follow-up email">\u2709</button>' +
          '<button class="icon-btn" data-edit="'+x.id+'" title="Edit">\u270E</button>' +
          '<button class="icon-btn del" data-del="'+x.id+'" title="Delete">\uD83D\uDDD1</button></td></tr>';
    }).join("");
    $("view").innerHTML = '<div class="card-surface"><div class="table-wrap"><table><thead>'+head+'</thead><tbody>'+body+'</tbody></table></div></div>';
  }

  function renderBoard(rows) {
    var cols = STATUSES.map(function (s) {
      var items = rows.filter(function (x){ return x.status===s.name; });
      var cards = items.map(function (x) {
        var bits = [];
        if (x.term) bits.push('<span class="tag">'+esc(x.term)+'</span>');
        if (x.deadline) bits.push('<span class="sub2 nowrap">\u23F3 '+esc(fmtDate(x.deadline))+' '+deadlineFlag(x.deadline,x.status)+'</span>');
        else if (x.location) bits.push('<span class="sub2">'+esc(x.location)+'</span>');
        var fu = followUpBadge(x);
        return '<div class="bcard" draggable="true" data-id="'+x.id+'" data-open="'+x.id+'">' +
          '<div class="bco">'+esc(x.company||"—")+'</div><div class="brl">'+esc(x.role||"")+'</div>' +
          (bits.length?'<div class="bmeta">'+bits.join("")+'</div>':'') +
          (fu?'<div class="bmeta">'+fu+'</div>':'') +
          '<div class="bmeta"><button class="bcard-mail" data-mail="'+x.id+'">\u2709 Copy follow-up</button></div>' +
          '</div>';
      }).join("");
      return '<div class="col" data-status="'+esc(s.name)+'">' +
        '<div class="col-head">'+swatch(s.name)+esc(s.name)+'<span class="count">'+items.length+'</span></div>' +
        (items.length?cards:'<div class="col-empty">Drop here</div>') + '</div>';
    }).join("");
    $("view").innerHTML = '<div class="board">'+cols+'</div>';
    wireDnd();
  }

  function wireDnd() {
    var dragId = null;
    Array.prototype.forEach.call($("view").querySelectorAll(".bcard"), function (card) {
      card.addEventListener("dragstart", function (e){ dragId = card.getAttribute("data-id"); card.classList.add("dragging"); e.dataTransfer.effectAllowed="move"; });
      card.addEventListener("dragend", function (){ card.classList.remove("dragging"); dragId=null; });
    });
    Array.prototype.forEach.call($("view").querySelectorAll(".col"), function (col) {
      col.addEventListener("dragover", function (e){ e.preventDefault(); col.classList.add("drag-over"); });
      col.addEventListener("dragleave", function (){ col.classList.remove("drag-over"); });
      col.addEventListener("drop", function (e) {
        e.preventDefault(); col.classList.remove("drag-over");
        if (!dragId) return;
        var item = data.find(function (x){ return x.id===dragId; });
        var newStatus = col.getAttribute("data-status");
        if (item && item.status !== newStatus) { item.status = newStatus; item._updated = Date.now(); save(); render(); }
      });
    });
  }

  function wireRows() {
    var v = $("view");
    Array.prototype.forEach.call(v.querySelectorAll("[data-open]"), function (el) {
      el.addEventListener("click", function (e) {
        if (e.target.closest("[data-edit],[data-del],[data-mail]")) return;
        openModal(el.getAttribute("data-open"));
      });
    });
    Array.prototype.forEach.call(v.querySelectorAll("[data-edit]"), function (b) {
      b.addEventListener("click", function (e){ e.stopPropagation(); openModal(b.getAttribute("data-edit")); });
    });
    Array.prototype.forEach.call(v.querySelectorAll("[data-mail]"), function (b) {
      b.addEventListener("click", function (e){ e.stopPropagation(); copyFollowUp(b.getAttribute("data-mail")); });
    });
    Array.prototype.forEach.call(v.querySelectorAll("[data-del]"), function (b) {
      b.addEventListener("click", function (e) {
        e.stopPropagation(); var id=b.getAttribute("data-del");
        var item=data.find(function (x){ return x.id===id; });
        if (confirm('Delete "'+(item?item.company+" — "+item.role:"this")+'"?')) { data=data.filter(function (x){ return x.id!==id; }); save(); render(); }
      });
    });
  }

  function openModal(id) {
    editingId = id || null;
    $("modalTitle").textContent = id ? "Edit Application" : "New Application";
    var item = (id ? data.find(function (x){ return x.id===id; }) : {}) || {};
    FIELDS.forEach(function (f){ var el=$("f_"+f); if (el) el.value = item[f]!=null?item[f]:""; });
    if (!id) $("f_status").value = "Applied";
    $("f_id").value = id || "";
    $("modalBg").classList.add("show");
    setTimeout(function (){ $("f_company").focus(); }, 60);
  }
  function closeModal() { $("modalBg").classList.remove("show"); editingId = null; }

  function saveForm() {
    var company=$("f_company").value.trim(), role=$("f_role").value.trim();
    if (!company || !role) { alert("Company Name and Role / Job Title are required."); return; }
    var obj = editingId ? data.find(function (x){ return x.id===editingId; }) : null;
    if (!obj) { obj = { id: uid() }; data.push(obj); }
    FIELDS.forEach(function (f){ var el=$("f_"+f); if (el) obj[f]=el.value.trim(); });
    obj._updated = Date.now();
    save(); closeModal(); render();
  }

  // ---------- sample data ----------
  function loadSample() {
    if (data.length && !confirm("Load sample data? This adds example applications.")) return;
    var today = new Date();
    function d(off){ var x=new Date(today); x.setDate(x.getDate()+off); return x.toISOString().slice(0,10); }
    var sample = [
      { company:"Stripe", role:"Software Engineering Intern", term:"Summer 2027 (May–Aug)", location:"Singapore / Hybrid", status:"Interview", appliedDate:d(-21), deadline:d(-10), interviewDates:"Oct 22", interviewer:"Jane Tan, Eng Manager", stageNotes:"Passed OA; tech round scheduled.", nextAction:"Prep system design questions", url:"https://stripe.com/jobs" },
      { company:"Razer", role:"Data Analytics Intern", term:"Off-Peak", location:"Singapore / On-site", status:"Applied", appliedDate:d(-14), deadline:d(4), followup:d(7), nextAction:"Follow up with recruiter", docs:"Data_Analytics_v3.pdf" },
      { company:"Endowus", role:"Fintech SWE Intern", term:"Winter 2026", location:"Remote", status:"Online Assessment", appliedDate:d(-7), deadline:d(1), oaDate:d(2), nextAction:"Complete HackerRank test", referral:"Alex Lim (LinkedIn)" },
      { company:"Apple", role:"iOS Engineering Intern", term:"Summer 2027", location:"Hybrid", status:"Offer Received", appliedDate:d(-40), comp:"$2,500/month", hours:"Full-time, 12 weeks", offerDeadline:d(9), priority:"High", prosCons:"Pros: brand, pay. Cons: relocation.", nextAction:"Decide by offer deadline" },
      { company:"Grab", role:"Backend Intern", term:"Summer 2027", location:"Singapore / On-site", status:"Rejected", appliedDate:d(-30), stageNotes:"Rejected after final round." },
      { company:"Shopee", role:"ML Engineering Intern", term:"Off-Peak", location:"Singapore / Hybrid", status:"Applied", deadline:d(5), appliedDate:d(-3), nextAction:"Tailor resume and apply", priority:"Medium" }
    ];
    sample.forEach(function (s){ s.id=uid(); s._updated=Date.now()-Math.floor(Math.random()*1e6); });
    data = data.concat(sample);
    save(); render();
  }

  // ---------- sync badge ----------
  function markSync(action) { localStorage.setItem(SYNC_KEY, JSON.stringify({ action:action, at:Date.now() })); renderSyncBadge(); }
  function renderSyncBadge() {
    var raw; try { raw = JSON.parse(localStorage.getItem(SYNC_KEY)); } catch(e){ raw=null; }
    if (!raw) { $("syncBadge").innerHTML = ""; return; }
    var dt = new Date(raw.at);
    var s = dt.toLocaleString(undefined, { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" });
    $("syncBadge").innerHTML = 'Last '+esc(raw.action)+': <b>'+esc(s)+'</b>';
  }

  function exportData() {
    var blob = new Blob([JSON.stringify(data,null,2)], { type:"application/json" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "catchtheoffer-"+new Date().toISOString().slice(0,10)+".json"; a.click(); URL.revokeObjectURL(a.href);
    markSync("export");
  }
  function importData(file) {
    var r = new FileReader();
    r.onload = function () {
      try { var parsed=JSON.parse(r.result); if (!Array.isArray(parsed)) throw new Error("Invalid file");
        if (!confirm("Import "+parsed.length+" application(s)? This replaces current data.")) return;
        data = parsed.map(function (x){ if (!x.id) x.id=uid(); if (!x._updated) x._updated=Date.now();
          if (x.status && LEGACY_MAP[x.status]) x.status=LEGACY_MAP[x.status]; if (!statusValid(x.status)) x.status="Applied"; return x; });
        save(); markSync("import"); render();
      } catch (e) { alert("Could not import: "+e.message); }
    };
    r.readAsText(file);
  }

  // ================= COMPARE / BEST-FIT ENGINE =================
  // Weighted keyword dictionaries per field of study. Matching a role's
  // job description + title against the student's major yields a fit score.
  var MAJOR_KEYWORDS = {
    "computer science": ["software","engineer","developer","programming","python","java","c++","javascript","typescript","algorithm","data structure","backend","frontend","full stack","api","cloud","aws","git","web","mobile","system design","distributed","database","sql","linux","devops","react","node"],
    "software engineering": ["software","engineer","developer","sdlc","agile","testing","ci/cd","api","microservices","backend","frontend","full stack","git","code review","architecture","cloud","docker","kubernetes"],
    "data science": ["data","machine learning","ml","ai","python","pandas","numpy","statistics","model","analytics","sql","visualization","tableau","power bi","regression","classification","deep learning","tensorflow","pytorch","big data","spark"],
    "data analytics": ["data","analytics","sql","excel","tableau","power bi","dashboard","reporting","statistics","visualization","etl","business intelligence","insights","python","metrics","kpi"],
    "information systems": ["information systems","it","erp","sap","business process","database","sql","systems analysis","requirements","project management","integration","crm"],
    "business": ["business","strategy","operations","marketing","finance","consulting","analysis","stakeholder","project management","market research","sales","product","growth"],
    "finance": ["finance","financial","investment","banking","equity","trading","valuation","accounting","modelling","risk","portfolio","fintech","markets","excel","analyst"],
    "economics": ["economics","econometrics","research","policy","data","statistics","market","analysis","forecasting","modelling","quantitative"],
    "marketing": ["marketing","brand","campaign","social media","content","seo","digital","growth","analytics","advertising","crm","market research","copywriting"],
    "electrical engineering": ["electrical","electronics","circuit","embedded","firmware","hardware","signal","pcb","fpga","vlsi","microcontroller","iot","power"],
    "mechanical engineering": ["mechanical","cad","solidworks","manufacturing","design","thermodynamics","robotics","automation","fea","prototyping"],
    "design": ["design","ui","ux","figma","prototype","user research","wireframe","visual","interaction","product design","usability"],
    "accounting": ["accounting","audit","tax","financial reporting","ledger","compliance","gaap","ifrs","bookkeeping","reconciliation"]
  };
  function studyField() { try { return localStorage.getItem(STUDY_KEY) || ""; } catch (e) { return ""; } }
  function setStudyField(v) { try { localStorage.setItem(STUDY_KEY, v); } catch (e) {} }

  function keywordsForStudy(study) {
    var s = (study||"").toLowerCase().trim();
    if (!s) return [];
    if (MAJOR_KEYWORDS[s]) return MAJOR_KEYWORDS[s];
    // partial match: find the dictionary whose name overlaps the input
    var best = null, bestLen = 0;
    Object.keys(MAJOR_KEYWORDS).forEach(function (k) {
      if (s.indexOf(k) >= 0 || k.indexOf(s) >= 0) { if (k.length > bestLen) { best = k; bestLen = k.length; } }
    });
    if (best) return MAJOR_KEYWORDS[best];
    // fallback: use the raw words the student typed as keywords
    return s.split(/[^a-z+]+/).filter(function (w){ return w.length > 2; });
  }

  // compute fit: % of distinct study keywords found in role text + matched list
  function computeFit(x, kws) {
    var text = ((x.role||"") + " " + (x.jobdesc||"") + " " + (x.term||"") + " " + (x.location||"")).toLowerCase();
    if (!kws.length) return { score: null, matched: [] };
    var matched = [];
    kws.forEach(function (k){ if (text.indexOf(k) >= 0 && matched.indexOf(k) < 0) matched.push(k); });
    var score = Math.round(matched.length / kws.length * 100);
    // small boost if the job description is substantial (more signal to trust)
    if ((x.jobdesc||"").length > 120 && score > 0) score = Math.min(100, score + 5);
    return { score: score, matched: matched };
  }

  // auto pros/cons from structured fields + the Notes text
  function autoProsCons(x) {
    var pros = [], cons = [];
    var loc = (x.location||"").toLowerCase();
    if (loc.indexOf("remote") >= 0) pros.push("Remote-friendly");
    if (loc.indexOf("on-site") >= 0 || loc.indexOf("onsite") >= 0) cons.push("On-site required");
    if (x.comp) pros.push("Pays " + x.comp);
    else cons.push("Compensation not noted");
    if (x.priority === "High") pros.push("Marked High priority");
    if (x.priority === "Low") cons.push("Marked Low priority");
    if (x.hours) pros.push(x.hours);
    if (x.status === "Offer Received") pros.push("Offer already in hand");
    if (x.status === "Rejected") cons.push("Already rejected");
    if (x.status === "Withdrawn") cons.push("Already withdrawn");
    if (x.deadline) { var du = daysUntil(x.deadline); if (du !== null && du >= 0 && du <= 7) cons.push("Deadline in " + du + "d — act fast"); }
    return { pros: pros, cons: cons };
  }

  var cmpSelected = [];
  function openCompare() {
    cmpSelected = [];
    $("compareBg").classList.add("show");
    renderCompare();
  }
  function closeCompare() { $("compareBg").classList.remove("show"); }

  function renderCompare() {
    var study = studyField();
    var picker =
      '<div class="cmp-study">' +
        '<label>🎓 I am studying</label>' +
        '<input id="cmpStudy" placeholder="e.g. Computer Science, Data Analytics, Finance…" value="'+esc(study)+'" />' +
      '</div>';

    if (!data.length) {
      $("compareBody").innerHTML = picker + '<div class="cmp-empty">Add some applications first, then come back to compare them.</div>';
      bindStudy();
      return;
    }

    var chips = data.map(function (x) {
      var on = cmpSelected.indexOf(x.id) >= 0;
      return '<span class="cmp-chip'+(on?' on':'')+'" data-pick="'+x.id+'">'+esc(x.company||"—")+' <span class="c">'+esc(x.role||"")+'</span></span>';
    }).join("");
    var pick = '<div class="cmp-pickwrap"><div class="lbl">Select roles to compare (2 or more)</div><div class="cmp-picks">'+chips+'</div></div>';

    var body;
    if (cmpSelected.length < 2) {
      body = '<div class="cmp-empty">Pick at least two roles above to see them side by side.</div>';
      $("cmpHint").textContent = "";
    } else {
      var kws = keywordsForStudy(study);
      var cols = cmpSelected.map(function (id){ return data.find(function (x){ return x.id===id; }); }).filter(Boolean);
      var fits = cols.map(function (x){ return computeFit(x, kws); });
      var maxScore = -1; fits.forEach(function (f){ if (f.score !== null && f.score > maxScore) maxScore = f.score; });

      var colsHTML = cols.map(function (x, i) {
        var f = fits[i];
        var isBest = f.score !== null && f.score === maxScore && maxScore > 0;
        var pc = autoProsCons(x);
        var scoreBlock = (f.score === null)
          ? '<div class="fit"><div class="k" style="font-size:11px;color:var(--faint)">Enter your field of study above to see a fit score.</div></div>'
          : '<div class="fit"><div class="score">'+f.score+'<span style="font-size:14px;color:var(--muted)">% fit</span></div>' +
            '<div class="bar"><span style="width:'+f.score+'%"></span></div>' +
            (f.matched.length ? '<div class="matched">'+f.matched.slice(0,8).map(function (m){ return '<span class="kw">'+esc(m)+'</span>'; }).join("")+'</div>'
                              : '<div class="k" style="margin-top:8px;color:var(--faint)">No study keywords found in this JD</div>') +
            '</div>';
        function rowsFrom(list, cls){ return list.map(function (t){ return '<div class="cmp-row '+cls+'"><div class="v">'+(cls==="pro"?"✔ ":"✘ ")+esc(t)+'</div></div>'; }).join(""); }
        return '<div class="cmp-col'+(isBest?' best':'')+'">' +
          '<div class="cmp-col-head"><div class="cco">'+esc(x.company||"—")+'</div><div class="crl">'+esc(x.role||"")+'</div>' +
            (isBest?'<span class="cmp-badge-best">★ Best fit for you</span>':'') + '</div>' +
          scoreBlock +
          '<div class="cmp-rows">' +
            cmpRow("Status", pillHTML(x.status)) +
            cmpRow("Term", esc(x.term||"—")) +
            cmpRow("Location", esc(x.location||"—")) +
            cmpRow("Compensation", esc(x.comp||"—")) +
            cmpRow("Hours & Duration", esc(x.hours||"—")) +
            cmpRow("Priority", esc(x.priority||"—")) +
            '<div class="cmp-row"><div class="k">Advantages</div>'+(pc.pros.length?rowsFrom(pc.pros,"pro"):'<div class="v">—</div>')+'</div>' +
            '<div class="cmp-row"><div class="k">Disadvantages</div>'+(pc.cons.length?rowsFrom(pc.cons,"con"):'<div class="v">—</div>')+'</div>' +
            (x.prosCons?cmpRow("Your Notes", esc(x.prosCons)):"") +
          '</div></div>';
      }).join("");
      body = '<div class="cmp-grid">'+colsHTML+'</div>';
      var bestCol = cols[fits.map(function (f){ return f.score; }).indexOf(maxScore)];
      $("cmpHint").textContent = (maxScore > 0 && bestCol) ? ("Best match: " + bestCol.company + " (" + maxScore + "% fit for " + (study||"your field") + ")") : "";
    }

    $("compareBody").innerHTML = picker + pick + body;
    bindStudy();
    Array.prototype.forEach.call($("compareBody").querySelectorAll("[data-pick]"), function (chip) {
      chip.onclick = function () {
        var id = chip.getAttribute("data-pick");
        var idx = cmpSelected.indexOf(id);
        if (idx >= 0) cmpSelected.splice(idx, 1); else cmpSelected.push(id);
        renderCompare();
      };
    });
  }
  function cmpRow(k, v) { return '<div class="cmp-row"><div class="k">'+k+'</div><div class="v">'+v+'</div></div>'; }
  function bindStudy() {
    var el = $("cmpStudy"); if (!el) return;
    el.oninput = function () { setStudyField(el.value); };
    el.onchange = function () { setStudyField(el.value); renderCompare(); setTimeout(function(){ var e=$("cmpStudy"); if(e) e.focus(); },0); };
  }

  // ---------- wire up ----------
  fillStatusSelects();
  $("kbdHint").textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K";
  $("addBtn").onclick = function (){ openModal(null); };
  $("closeModal").onclick = closeModal;
  $("cancelBtn").onclick = closeModal;
  $("saveBtn").onclick = saveForm;
  $("modalBg").addEventListener("click", function (e){ if (e.target===$("modalBg")) closeModal(); });
  $("compareBtn").onclick = openCompare;
  $("closeCompare").onclick = closeCompare;
  $("cmpCloseBtn").onclick = closeCompare;
  $("compareBg").addEventListener("click", function (e){ if (e.target===$("compareBg")) closeCompare(); });
  document.addEventListener("keydown", function (e) {
    if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="k") { e.preventDefault(); $("search").focus(); return; }
    if (e.key==="Escape") { closeModal(); closeCompare(); }
    if (e.key==="Enter" && (e.metaKey||e.ctrlKey) && $("modalBg").classList.contains("show")) saveForm();
  });
  $("search").oninput = render;
  $("statusFilter").onchange = render;
  $("sortBy").onchange = render;
  $("exportBtn").onclick = exportData;
  $("importBtn").onclick = function (){ $("importFile").click(); };
  $("importFile").onchange = function (e){ if (e.target.files[0]) importData(e.target.files[0]); e.target.value=""; };
  Array.prototype.forEach.call($("viewSeg").querySelectorAll("button"), function (b) {
    b.onclick = function () {
      view = b.getAttribute("data-view");
      Array.prototype.forEach.call($("viewSeg").querySelectorAll("button"), function (x){ x.classList.toggle("active", x===b); });
      render();
    };
  });

  render();
})();
