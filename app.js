(function () {
  "use strict";
  var STORAGE_KEY = "catchtheoffer.v1";
  var LEGACY_KEY = "internship-tracker.v1";
  var SYNC_KEY = "catchtheoffer.sync";
  var STUDY_KEY = "catchtheoffer.study";

  var STATUSES = [
    { name: "Applied",           key: "sky",    pending: true  },
    { name: "Online Assessment", key: "violet", pending: true  },
    { name: "Interview",         key: "amber",  pending: true  },
    { name: "Offer Received",    key: "green",  pending: false },
    { name: "Rejected",          key: "rose",   pending: false },
    { name: "Withdrawn",         key: "slate",  pending: false }
  ];
  var LEGACY_MAP = {
    "Not Started / To Apply": "Applied", "Applied / Pending": "Applied",
    "OA / Technical Assessment": "Online Assessment",
    "HR / Screening Interview": "Interview", "Technical / Round 1 Interview": "Interview",
    "Final Round Interview": "Interview", "Offer Received": "Offer Received",
    "Rejected": "Rejected", "Withdrawn": "Withdrawn"
  };

  var FIELDS = ["company","role","term","location","status","jobdesc","url","appliedDate","deadline","followup",
    "oaDate","interviewDates","stageNotes","comp","hours","offerDeadline","priority","prosCons",
    "referral","docs","nextAction"];

  // avatar gradient palette (deterministic per company)
  var AV_GRADS = [
    ["#0ea5e9","#2563eb"], ["#9333ea","#c026d3"], ["#f59e0b","#ef4444"],
    ["#10b981","#059669"], ["#ec4899","#8b5cf6"], ["#14b8a6","#0ea5e9"],
    ["#f43f5e","#f97316"], ["#6366f1","#3b82f6"]
  ];

  var data = load();
  var editingId = null;
  var view = "feed";
  var tab = "dashboard";
  var statusTargetId = null;

  // ---------- persistence ----------
  function load() {
    var raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (!raw) { try { raw = localStorage.getItem(LEGACY_KEY); } catch (e) {} }
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
  function daysUntil(d) { if (!d) return null; var t=new Date(); t.setHours(0,0,0,0); return Math.round((new Date(d+"T00:00:00")-t)/86400000); }
  function daysSince(d) { if (!d) return null; var t=new Date(); t.setHours(0,0,0,0); return Math.round((t-new Date(d+"T00:00:00"))/86400000); }

  function countdownBadge(x) {
    var du = daysUntil(x.deadline); if (du===null) return "";
    if (du < 0) return '<span class="countdown past">⏳ deadline passed</span>';
    if (du === 0) return '<span class="countdown urgent">⏳ due today</span>';
    if (du <= 3) return '<span class="countdown urgent">⏳ '+du+'d left</span>';
    if (du <= 14) return '<span class="countdown">⏳ '+du+'d left</span>';
    return '<span class="chiptag">⏳ '+fmtDate(x.deadline)+'</span>';
  }
  function followUpDue(x) {
    if (x.status !== "Applied") return false;
    var since = daysSince(x.followup || x.appliedDate);
    return since !== null && since >= 14;
  }
  function avatar(company, small) {
    var name = (company||"?").trim();
    var initials = name.split(/\s+/).map(function (w){ return w[0]||""; }).join("").slice(0,2).toUpperCase() || "?";
    var sum = 0; for (var i=0;i<name.length;i++) sum += name.charCodeAt(i);
    var g = AV_GRADS[sum % AV_GRADS.length];
    return '<div class="avatar" style="background:linear-gradient(135deg,'+g[0]+','+g[1]+')">'+esc(initials)+'</div>';
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
  }

  // ---------- metrics ----------
  function metrics() {
    var total = data.length;
    var inprog = data.filter(function (x){ return x.status==="Online Assessment"||x.status==="Interview"; }).length;
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
      card("Total Applications", m.total, "#0891b2", "rgba(8,145,178,.12)", "💼") +
      card("In Progress", m.inprog, "#d97706", "rgba(217,119,6,.14)", "⏳") +
      card("Offers Received", m.offers, "#059669", "rgba(16,185,129,.15)", "🎉") +
      card("Action Required", m.action, "#e11d48", "rgba(225,29,72,.12)", "⚡") +
      ring;
  }

  function renderAnalytics() {
    renderSummary("summary2");
    var total = data.length || 1;
    var html = STATUSES.map(function (s) {
      var n = data.filter(function (x){ return x.status===s.name; }).length;
      var pct = Math.round(n/total*100);
      return '<div class="abar-row"><div class="nm">'+esc(s.name)+'</div>' +
        '<div class="abar"><span class="pill '+s.key+'" style="display:block;width:'+pct+'%;height:100%;border-radius:8px;box-shadow:none;"></span></div>' +
        '<div class="vn">'+n+'</div></div>';
    }).join("");
    $("analytics").innerHTML = data.length ? html : '<div class="empty-note">No data yet — add applications to see your breakdown.</div>';
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

  // ---------- main render ----------
  function render() {
    renderSummary("summary");
    renderSyncBadge();
    if (tab === "analytics") renderAnalytics();
    if (tab === "compare") renderCompareInline();

    var targets = (tab === "applications") ? ["viewApps"] : ["view"];
    if (!data.length) { targets.forEach(function (t){ renderEmpty(t); }); return; }
    var rows = filtered();
    targets.forEach(function (t) {
      if (!rows.length) { $(t).innerHTML = '<div class="empty-note">No applications match your filters.</div>'; return; }
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
      var tags = [];
      if (x.location) tags.push('<span class="chiptag loc">📍 '+esc(x.location)+'</span>');
      if (x.comp) tags.push('<span class="chiptag pay">💰 '+esc(x.comp)+'</span>');
      if (x.term) tags.push('<span class="chiptag">🗓 '+esc(x.term)+'</span>');
      var cd = countdownBadge(x); if (cd) tags.push(cd);
      if (followUpDue(x)) tags.push('<span class="fu-flag">⚠️ Follow-up due</span>');
      return '<div class="fcard" data-open="'+x.id+'">' +
        '<div class="head">' + avatar(x.company) +
          '<div class="ht"><div class="title">'+esc(x.role||"—")+'</div><div class="company">'+esc(x.company||"")+'</div>' +
            '<div style="margin-top:8px">'+pillHTML(x.status)+'</div></div>' +
          '<button class="bookmark'+(x.bookmarked?' on':'')+'" data-bm="'+x.id+'" title="Bookmark">'+(x.bookmarked?"★":"☆")+'</button>' +
        '</div>' +
        (tags.length?'<div class="tags">'+tags.join("")+'</div>':'') +
        '<div class="foot">' +
          '<button class="qbtn" data-status="'+x.id+'">🔄 Status</button>' +
          '<button class="qbtn" data-mail="'+x.id+'">✉️ Follow-up</button>' +
          '<span class="spacer"></span>' +
          '<button class="qbtn" data-edit="'+x.id+'">✎</button>' +
          '<button class="qbtn" data-del="'+x.id+'">🗑</button>' +
        '</div></div>';
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
          '<div class="bh">'+avatar(x.company)+'<div><div class="bco">'+esc(x.company||"—")+'</div><div class="brl">'+esc(x.role||"")+'</div></div></div>' +
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

  function wireCards() {
    document.querySelectorAll("[data-open]").forEach(function (el) {
      el.addEventListener("click", function (e) {
        if (e.target.closest("[data-edit],[data-del],[data-mail],[data-status],[data-bm]")) return;
        openModal(el.getAttribute("data-open"));
      });
    });
    document.querySelectorAll("[data-edit]").forEach(function (b){ b.addEventListener("click", function (e){ e.stopPropagation(); openModal(b.getAttribute("data-edit")); }); });
    document.querySelectorAll("[data-mail]").forEach(function (b){ b.addEventListener("click", function (e){ e.stopPropagation(); copyFollowUp(b.getAttribute("data-mail")); }); });
    document.querySelectorAll("[data-status]").forEach(function (b){ b.addEventListener("click", function (e){ e.stopPropagation(); openStatusSheet(b.getAttribute("data-status")); }); });
    document.querySelectorAll("[data-bm]").forEach(function (b){ b.addEventListener("click", function (e){ e.stopPropagation(); toggleBookmark(b.getAttribute("data-bm")); }); });
    document.querySelectorAll("[data-del]").forEach(function (b){
      b.addEventListener("click", function (e){ e.stopPropagation(); var id=b.getAttribute("data-del"); var item=data.find(function (x){ return x.id===id; });
        if (confirm('Delete "'+(item?item.company+" — "+item.role:"this")+'"?')) { data=data.filter(function (x){ return x.id!==id; }); save(); render(); } });
    });
  }

  function toggleBookmark(id) { var x=data.find(function (v){ return v.id===id; }); if (!x) return; x.bookmarked=!x.bookmarked; x._updated=Date.now(); save(); render(); }

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
    if (!id) $("f_status").value = "Applied";
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
    obj._updated = Date.now();
    save(); closeModal(); render(); showToast(editingId?"Saved":"Application added");
  }

  // ---------- sample / sync / export ----------
  function loadSample() {
    if (data.length && !confirm("Load sample data? This adds example applications.")) return;
    var t=new Date(); function d(o){ var x=new Date(t); x.setDate(x.getDate()+o); return x.toISOString().slice(0,10); }
    var sample = [
      { company:"Stripe", role:"Software Engineering Intern", term:"Summer 2027", location:"Singapore / Hybrid", comp:"$2,400/mo", status:"Interview", appliedDate:d(-21), deadline:d(-10), interviewDates:d(3), stageNotes:"Passed OA; tech round scheduled.", nextAction:"Prep system design", url:"https://stripe.com/jobs", jobdesc:"Build backend APIs in Python and Go, work with cloud, databases and distributed systems." },
      { company:"Razer", role:"Data Analytics Intern", term:"Off-Peak", location:"Singapore / On-site", comp:"$1,500/mo", status:"Applied", appliedDate:d(-16), deadline:d(4), followup:d(-16), nextAction:"Follow up with recruiter", docs:"Data_Analytics_v3.pdf", jobdesc:"SQL, dashboards, Tableau, reporting and business intelligence." },
      { company:"Endowus", role:"Fintech SWE Intern", term:"Winter 2026", location:"Remote", comp:"$2,000/mo", status:"Online Assessment", appliedDate:d(-7), deadline:d(1), oaDate:d(2), nextAction:"Complete HackerRank test", referral:"Alex Lim (LinkedIn)" },
      { company:"Apple", role:"iOS Engineering Intern", term:"Summer 2027", location:"Hybrid", comp:"$3,000/mo", status:"Offer Received", appliedDate:d(-40), hours:"Full-time, 12 weeks", offerDeadline:d(9), priority:"High", prosCons:"Pros: brand, pay. Cons: relocation.", bookmarked:true, nextAction:"Decide by offer deadline" },
      { company:"Grab", role:"Backend Intern", term:"Summer 2027", location:"Singapore / On-site", status:"Rejected", appliedDate:d(-30), stageNotes:"Rejected after final round." }
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
    a.href=URL.createObjectURL(blob); a.download="catchtheoffer-"+new Date().toISOString().slice(0,10)+".json"; a.click(); URL.revokeObjectURL(a.href); markSync("export"); showToast("Exported"); }
  function importData(file) { var r=new FileReader(); r.onload=function () {
      try { var parsed=JSON.parse(r.result); if (!Array.isArray(parsed)) throw new Error("Invalid file");
        if (!confirm("Import "+parsed.length+" application(s)? This replaces current data.")) return;
        data=parsed.map(function (x){ if (!x.id) x.id=uid(); if (!x._updated) x._updated=Date.now();
          if (x.status&&LEGACY_MAP[x.status]) x.status=LEGACY_MAP[x.status]; if (!statusValid(x.status)) x.status="Applied"; return x; });
        save(); markSync("import"); closeMore(); render(); showToast("Imported");
      } catch (e) { alert("Could not import: "+e.message); } }; r.readAsText(file); }

  // ---------- compare engine ----------
  // Singapore Higher Education Institutions
  var IHLS = [
    "National University of Singapore (NUS)",
    "Nanyang Technological University (NTU)",
    "Singapore Management University (SMU)",
    "Singapore Institute of Technology (SIT)",
    "Singapore University of Technology and Design (SUTD)",
    "Singapore University of Social Sciences (SUSS)",
    "Temasek Polytechnic (TP)",
    "Singapore Polytechnic (SP)",
    "Ngee Ann Polytechnic (NP)",
    "Nanyang Polytechnic (NYP)",
    "Republic Polytechnic (RP)"
  ];

  // Role categories a course aligns to (used for the relevance bonus + explanation tag)
  // Course catalog: category -> [ { name, kws:[...], roles:[role-category tokens] } ]
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
  var COURSE_CATALOG = {
    "Computing & IT": [
      { name:"Applied Computing in Fintech", kws:["software","fintech","python","api","blockchain","payments","data","sql"], roles:["swe","fintech","data","cloud"] },
      { name:"Computer Science", kws:["software","engineer","developer","algorithm","python","java","c++","backend","frontend","api","cloud","data structure","system design","sql"], roles:["swe","data","cyber","cloud"] },
      { name:"Information Systems", kws:["information systems","sql","database","erp","business process","requirements","integration","data"], roles:["swe","data","product"] },
      { name:"Software Engineering", kws:["software","engineer","developer","agile","api","microservices","backend","frontend","testing","ci/cd","docker"], roles:["swe","cloud"] },
      { name:"Cybersecurity", kws:["security","cyber","network","penetration","encryption","soc","vulnerability","firewall","infosec"], roles:["cyber","cloud","swe"] },
      { name:"Data Analytics", kws:["data","analytics","sql","tableau","power bi","dashboard","statistics","python","etl","insights","kpi"], roles:["data","fintech"] }
    ],
    "Business & Finance": [
      { name:"Business Administration", kws:["business","strategy","operations","management","stakeholder","project","consulting"], roles:["product","finance","marketing"] },
      { name:"Banking & Finance", kws:["finance","banking","investment","equity","trading","risk","valuation","markets","fintech"], roles:["finance","fintech"] },
      { name:"Accounting", kws:["accounting","audit","tax","financial reporting","compliance","ledger"], roles:["finance"] },
      { name:"Marketing", kws:["marketing","brand","campaign","social media","content","seo","digital","growth","crm"], roles:["marketing","product"] }
    ],
    "Engineering": [
      { name:"Electrical Engineering", kws:["electrical","electronics","circuit","embedded","firmware","hardware","signal","pcb","iot"], roles:["ee","systems"] },
      { name:"Mechanical Engineering", kws:["mechanical","cad","solidworks","manufacturing","thermodynamics","robotics","automation"], roles:["mech","systems"] },
      { name:"Systems Engineering", kws:["systems","integration","automation","controls","requirements","industrial","optimization"], roles:["systems","ee","swe"] }
    ],
    "Design & Digital Media": [
      { name:"UX/UI Design", kws:["design","ui","ux","figma","prototype","user research","wireframe","usability","interaction"], roles:["design","product"] },
      { name:"Interactive Media", kws:["media","interactive","animation","motion","content","multimedia","creative","design"], roles:["media","design"] }
    ]
  };
  function courseDef(name) {
    var found=null; Object.keys(COURSE_CATALOG).forEach(function (cat){ COURSE_CATALOG[cat].forEach(function (c){ if (c.name===name) found=c; }); });
    return found;
  }
  function getStudy() { try { return JSON.parse(localStorage.getItem(STUDY_KEY)) || {ihl:"",course:""}; } catch(e){ return {ihl:"",course:""}; } }
  function setStudy(obj) { try { localStorage.setItem(STUDY_KEY, JSON.stringify(obj)); } catch(e){} }

  // Compute fit: keyword overlap + relevance bonus when role matches the course's affinity categories.
  function computeFit(x, course) {
    if (!course) return { score:null, matched:[], relevant:false, reasons:[] };
    var text=((x.role||"")+" "+(x.jobdesc||"")+" "+(x.term||"")+" "+(x.location||"")).toLowerCase();
    var kws = course.kws || [];
    var matched=[]; kws.forEach(function (k){ if (text.indexOf(k)>=0 && matched.indexOf(k)<0) matched.push(k); });
    var base = kws.length ? Math.round(matched.length/kws.length*100) : 0;

    // relevance bonus: does the role hit any of the course's target role categories?
    var reasons=[]; var hitRoles=[];
    (course.roles||[]).forEach(function (rc) {
      var toks = ROLE_TOKENS[rc] || [];
      var hit = toks.some(function (t){ return text.indexOf(t)>=0; });
      if (hit) hitRoles.push(rc);
    });
    var relevant = hitRoles.length > 0;
    var bonus = relevant ? Math.min(30, 12 + hitRoles.length*6) : 0;
    if (relevant) reasons.push("Relevant to " + course.name);
    if ((x.jobdesc||"").length>120 && base>0) base += 5;

    var score = Math.min(100, base + bonus);
    return { score: score, matched: matched, relevant: relevant, reasons: reasons, bonus: bonus };
  }
  function autoProsCons(x) {
    var pros=[],cons=[]; var loc=(x.location||"").toLowerCase();
    if (loc.indexOf("remote")>=0) pros.push("Remote-friendly");
    if (loc.indexOf("on-site")>=0||loc.indexOf("onsite")>=0) cons.push("On-site required");
    if (x.comp) pros.push("Pays "+x.comp); else cons.push("Compensation not noted");
    if (x.priority==="High") pros.push("Marked High priority"); if (x.priority==="Low") cons.push("Marked Low priority");
    if (x.hours) pros.push(x.hours);
    if (x.status==="Offer Received") pros.push("Offer in hand"); if (x.status==="Rejected") cons.push("Already rejected"); if (x.status==="Withdrawn") cons.push("Withdrawn");
    var du=daysUntil(x.deadline); if (du!==null&&du>=0&&du<=7) cons.push("Deadline in "+du+"d");
    return { pros:pros, cons:cons };
  }
  var cmpSelected = [];
  function studyPicker() {
    var st = getStudy();
    var ihlOpts = '<option value="">Select institution…</option>' +
      IHLS.map(function (i){ return '<option'+(st.ihl===i?' selected':'')+'>'+esc(i)+'</option>'; }).join("");
    var courseOpts = '<option value="">Select course / major…</option>' +
      Object.keys(COURSE_CATALOG).map(function (cat){
        return '<optgroup label="'+esc(cat)+'">' +
          COURSE_CATALOG[cat].map(function (c){ return '<option'+(st.course===c.name?' selected':'')+'>'+esc(c.name)+'</option>'; }).join("") +
          '</optgroup>';
      }).join("");
    return '<div class="cmp-study cmp-study-2">' +
      '<div class="cmp-field"><label>🏫 Institution / University (IHL)</label><select id="cmpIhl" class="ctl-wide">'+ihlOpts+'</select></div>' +
      '<div class="cmp-field"><label>🎓 Course / Major</label><select id="cmpCourse" class="ctl-wide">'+courseOpts+'</select></div>' +
      '</div>';
  }
  function renderCompareInline() {
    var st = getStudy();
    var course = courseDef(st.course);
    var picker = studyPicker();
    if (!data.length) { $("compareInline").innerHTML = picker + '<div class="cmp-empty">Add applications first, then compare them here.</div>'; bindStudy(); return; }
    var chips = data.map(function (x){ var on=cmpSelected.indexOf(x.id)>=0; return '<span class="cmp-chip'+(on?' on':'')+'" data-pick="'+x.id+'">'+esc(x.company||"—")+' <span class="c">'+esc(x.role||"")+'</span></span>'; }).join("");
    var pick = '<div class="cmp-pickwrap"><div class="lbl">Select roles to compare (2+)</div><div class="cmp-picks">'+chips+'</div></div>';
    var body;
    if (cmpSelected.length < 2) { body = '<div class="cmp-empty">Pick at least two roles above to see them side by side.</div>'; }
    else {
      var cols=cmpSelected.map(function (id){ return data.find(function (x){ return x.id===id; }); }).filter(Boolean);
      var fits=cols.map(function (x){ return computeFit(x, course); });
      var maxScore=-1; fits.forEach(function (f){ if (f.score!==null&&f.score>maxScore) maxScore=f.score; });
      var colsHTML=cols.map(function (x,i){
        var f=fits[i]; var isBest=f.score!==null&&f.score===maxScore&&maxScore>0; var pc=autoProsCons(x);
        var relTag = f.relevant ? '<div class="rel-tag">✦ '+esc(f.reasons[0])+(f.bonus?' · +'+f.bonus+'% relevance':'')+'</div>' : '';
        var scoreBlock=(f.score===null)?'<div class="fit"><div class="k">Pick your course above to see a fit score.</div></div>'
          :'<div class="fit"><div class="score">'+f.score+'<span style="font-size:14px;color:var(--muted)">% fit</span></div><div class="bar"><span style="width:'+f.score+'%"></span></div>'+
            relTag +
            (f.matched.length?'<div class="matched">'+f.matched.slice(0,8).map(function (m){ return '<span class="kw">'+esc(m)+'</span>'; }).join("")+'</div>':'<div class="k" style="margin-top:8px">No course keywords found in this role</div>')+'</div>';
        function rf(list,cls){ return list.map(function (tt){ return '<div class="cmp-row '+cls+'"><div class="v">'+(cls==="pro"?"✔ ":"✘ ")+esc(tt)+'</div></div>'; }).join(""); }
        return '<div class="cmp-col'+(isBest?' best':'')+'"><div class="cmp-col-head"><div class="cco">'+esc(x.company||"—")+'</div><div class="crl">'+esc(x.role||"")+'</div>'+(isBest?'<span class="cmp-badge-best">★ Best fit for you</span>':'')+'</div>'+
          scoreBlock+'<div class="cmp-rows">'+cmpRow("Status",pillHTML(x.status))+cmpRow("Term",esc(x.term||"—"))+cmpRow("Location",esc(x.location||"—"))+cmpRow("Compensation",esc(x.comp||"—"))+cmpRow("Hours",esc(x.hours||"—"))+cmpRow("Priority",esc(x.priority||"—"))+
          '<div class="cmp-row"><div class="k">Advantages</div>'+(pc.pros.length?rf(pc.pros,"pro"):'<div class="v">—</div>')+'</div>'+
          '<div class="cmp-row"><div class="k">Disadvantages</div>'+(pc.cons.length?rf(pc.cons,"con"):'<div class="v">—</div>')+'</div>'+
          (x.prosCons?cmpRow("Your Notes",esc(x.prosCons)):"")+'</div></div>';
      }).join("");
      body='<div class="cmp-grid">'+colsHTML+'</div>';
    }
    $("compareInline").innerHTML = picker + pick + body;
    bindStudy();
    $("compareInline").querySelectorAll("[data-pick]").forEach(function (chip){ chip.onclick=function (){ var id=chip.getAttribute("data-pick"); var idx=cmpSelected.indexOf(id); if (idx>=0) cmpSelected.splice(idx,1); else cmpSelected.push(id); renderCompareInline(); }; });
  }
  function cmpRow(k,v){ return '<div class="cmp-row"><div class="k">'+k+'</div><div class="v">'+v+'</div></div>'; }
  function bindStudy() {
    var ihl=$("cmpIhl"), course=$("cmpCourse");
    if (ihl) ihl.onchange=function (){ var st=getStudy(); st.ihl=ihl.value; setStudy(st); renderCompareInline(); };
    if (course) course.onchange=function (){ var st=getStudy(); st.course=course.value; setStudy(st); renderCompareInline(); };
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
    // ⌘K only meaningful with a physical keyboard
    var hint = $("kbdHint");
    if (hint) hint.textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K";
  }

  // ---------- more menu ----------
  function openMore() { renderSyncBadge(); $("moreBg").classList.add("show"); }
  function closeMore() { $("moreBg").classList.remove("show"); }

  // ---------- wire up ----------
  fillStatusSelects();
  $("kbdHint").textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K";
  $("fab").onclick = function (){ openModal(null); };
  $("closeModal").onclick = closeModal; $("cancelBtn").onclick = closeModal; $("saveBtn").onclick = saveForm;
  $("modalBg").addEventListener("click", function (e){ if (e.target===$("modalBg")) closeModal(); });
  $("closeStatus").onclick = closeStatus;
  $("statusBg").addEventListener("click", function (e){ if (e.target===$("statusBg")) closeStatus(); });
  $("moreBtn").onclick = openMore; $("closeMore").onclick = closeMore;
  $("moreBg").addEventListener("click", function (e){ if (e.target===$("moreBg")) closeMore(); });
  $("compareBtn").onclick = function (){ switchTab("compare"); };
  $("exportBtn").onclick = exportData;
  $("importBtn").onclick = function (){ $("importFile").click(); };
  $("importFile").onchange = function (e){ if (e.target.files[0]) importData(e.target.files[0]); e.target.value=""; };
  $("sampleBtn").onclick = loadSample;

  document.addEventListener("keydown", function (e) {
    if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="k") { e.preventDefault(); $("search").focus(); return; }
    if (e.key==="Escape") { closeModal(); closeStatus(); closeMore(); }
    if (e.key==="Enter" && (e.metaKey||e.ctrlKey) && $("modalBg").classList.contains("show")) saveForm();
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
      render();
    };
  });

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
