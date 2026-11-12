const STORAGE_KEY = 'mime_events_v1';
const ONLINE_SEEN_KEY = 'mime_online_seen_v1';
let view = 'home';
let cursor = new Date();
let events = [];
let meridiem = null;

function todayIso() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function parseTime(raw, mer) {
  const s = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return { status: 'empty' };
  const m12 = s.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/);
  if (m12) {
    const h = Number(m12[1]), min = m12[2] ? Number(m12[2]) : 0;
    if (h < 1 || h > 12 || min > 59) return { status: 'invalid' };
    let h24 = h % 12; if (m12[3] === 'pm') h24 += 12;
    return { status: 'valid', time24: String(h24).padStart(2,'0') + ':' + String(min).padStart(2,'0'), display: h + ':' + String(min).padStart(2,'0') + ' ' + m12[3].toUpperCase() };
  }
  const col = s.match(/^(\d{1,2}):(\d{2})$/);
  if (col) {
    const h = Number(col[1]), min = Number(col[2]);
    if (h > 23 || min > 59) return { status: 'invalid' };
    if (h === 0 || h >= 13) return { status: 'valid', time24: String(h).padStart(2,'0') + ':' + String(min).padStart(2,'0'), display: String(h).padStart(2,'0') + ':' + String(min).padStart(2,'0') };
    if (!mer) return { status: 'needs_meridiem' };
    let h24 = h % 12; if (mer === 'PM') h24 += 12;
    return { status: 'valid', time24: String(h24).padStart(2,'0') + ':' + String(min).padStart(2,'0'), display: h + ':' + String(min).padStart(2,'0') + ' ' + mer };
  }
  const four = s.match(/^(\d{2})(\d{2})$/);
  if (four) {
    const h = Number(four[1]), min = Number(four[2]);
    if (h > 23 || min > 59) return { status: 'invalid' };
    return { status: 'valid', time24: four[1] + ':' + four[2], display: four[1] + ':' + four[2] };
  }
  return { status: 'invalid' };
}

function loadStore(cb) {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get([STORAGE_KEY, ONLINE_SEEN_KEY], (res) => {
      events = Array.isArray(res[STORAGE_KEY]) ? res[STORAGE_KEY] : [];
      cb(res[ONLINE_SEEN_KEY]);
    });
  } else {
    events = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    cb(sessionStorage.getItem(ONLINE_SEEN_KEY));
  }
}

function saveStore() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ [STORAGE_KEY]: events });
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  }
}

function render(showReport) {
  const root = document.getElementById('app');
  if (showReport) {
    const todays = events.filter((e) => e.dateIso === todayIso()).sort((a, b) => a.time24.localeCompare(b.time24));
    if (todays.length > 0) {
      root.innerHTML = '<section class="report"><h2>Today\'s Events</h2>' +
        todays.map((e) => '<div class="report-item"><h3>' + e.title + '</h3><p>' + e.displayTime + '</p></div>').join('') +
        '<button class="btn-primary" id="dismiss-report">Continue</button></section>';
      document.getElementById('dismiss-report').onclick = () => render(false);
      return;
    }
  }
  if (view === 'home') {
    root.innerHTML = '<div class="home-stack"><button class="btn-primary" id="go-cal">Calendar</button><button class="btn-secondary" id="go-rem">Reminders</button></div>';
    document.getElementById('go-cal').onclick = () => { view = 'calendar'; render(false); };
    document.getElementById('go-rem').onclick = () => { view = 'reminders'; render(false); };
    return;
  }
  if (view === 'calendar') {
    const y = cursor.getFullYear(), m = cursor.getMonth();
    const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
    const label = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    let grid = ['S','M','T','W','T','F','S'].map((d) => '<div class="weekday">' + d + '</div>').join('');
    for (let i = 0; i < first; i++) grid += '<div></div>';
    for (let d = 1; d <= days; d++) {
      const iso = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      const count = events.filter((e) => e.dateIso === iso).length;
      grid += '<div class="day-cell"><span>' + d + '</span>' + (count ? '<span class="count-dot">' + count + '</span>' : '') + '</div>';
    }
    root.innerHTML = '<div class="cal-head"><button class="icon-btn" id="back">‹</button><div class="month-title">' + label + '</div><div><button class="icon-btn" id="prev">‹</button><button class="icon-btn" id="next">›</button></div></div><div class="cal-grid">' + grid + '</div>';
    document.getElementById('back').onclick = () => { view = 'home'; render(false); };
    document.getElementById('prev').onclick = () => { cursor = new Date(y, m - 1, 1); render(false); };
    document.getElementById('next').onclick = () => { cursor = new Date(y, m + 1, 1); render(false); };
    return;
  }
  root.innerHTML = '<div class="cal-head"><button class="icon-btn" id="back">‹</button><div class="month-title">Create Event</div><div></div></div>' +
    '<form class="form" id="f"><input class="input" id="name" placeholder="Event name" />' +
    '<input class="input" id="date" placeholder="dd/mm/yyyy" />' +
    '<input class="input" id="time" placeholder="Time (e.g. 12pm, 12:40, 1640)" />' +
    '<div class="meridiem-row" id="mer" style="display:none"><button type="button" class="meridiem-btn" data-m="AM">AM</button><button type="button" class="meridiem-btn" data-m="PM">PM</button></div>' +
    '<textarea class="textarea" id="desc" rows="3" placeholder="Short description"></textarea>' +
    '<button class="submit-btn" id="sub" disabled>Create Event</button></form>';
  document.getElementById('back').onclick = () => { view = 'home'; render(false); };
  const nameEl = document.getElementById('name'), dateEl = document.getElementById('date'), timeEl = document.getElementById('time'), merRow = document.getElementById('mer'), subBtn = document.getElementById('sub');
  const sync = () => {
    const t = parseTime(timeEl.value, meridiem);
    merRow.style.display = t.status === 'needs_meridiem' || (t.status === 'valid' && meridiem) ? 'flex' : 'none';
    const dm = dateEl.value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    subBtn.disabled = !(nameEl.value.trim() && dm && t.status === 'valid');
  };
  [nameEl, dateEl, timeEl].forEach((el) => el.addEventListener('input', sync));
  merRow.querySelectorAll('button').forEach((b) => b.onclick = () => {
    meridiem = b.dataset.m;
    merRow.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
    sync();
  });
  document.getElementById('f').onsubmit = (ev) => {
    ev.preventDefault();
    const dm = dateEl.value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const t = parseTime(timeEl.value, meridiem);
    if (!dm || t.status !== 'valid') return;
    events.push({ id: String(Date.now()), title: nameEl.value.trim(), dateIso: dm[3] + '-' + dm[2] + '-' + dm[1], time24: t.time24, displayTime: t.display, description: document.getElementById('desc').value.trim() });
    saveStore();
    view = 'calendar';
    render(false);
  };
}

loadStore((seenDay) => {
  const today = todayIso();
  const shouldShow = navigator.onLine && seenDay !== today;
  if (shouldShow && typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.set({ [ONLINE_SEEN_KEY]: today });
  }
  render(shouldShow);
});