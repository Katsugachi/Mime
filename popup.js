const STORAGE_KEY = 'mime_events_v1';
const ONLINE_SEEN_KEY = 'mime_online_seen_v1';
let view = 'home';
let cursor = new Date();
let events = [];
let selectedIso = null;
let prefillDate = '';
let meridiem = null;

function todayIso() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function isoToDdMmYyyy(iso) {
  const parts = iso.split('-');
  return parts.length === 3 ? parts[2] + '/' + parts[1] + '/' + parts[0] : iso;
}

function parseDateDdMmYyyy(raw) {
  const m = raw.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return { valid: false };
  const day = Number(m[1]), month = Number(m[2]), year = Number(m[3]);
  const check = new Date(year, month - 1, day);
  if (check.getFullYear() !== year || check.getMonth() !== month - 1 || check.getDate() !== day) {
    return { valid: false };
  }
  return { valid: true, dateIso: m[3] + '-' + m[2] + '-' + m[1] };
}

function parseTime(raw, mer) {
  const s = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return { status: 'empty' };
  const m12 = s.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/);
  if (m12) {
    const h = Number(m12[1]), min = m12[2] ? Number(m12[2]) : 0;
    if (h < 1 || h > 12 || min > 59) return { status: 'invalid' };
    let h24 = h % 12; if (m12[3] === 'pm') h24 += 12;
    return {
      status: 'valid',
      mode: '12hr',
      time24: String(h24).padStart(2, '0') + ':' + String(min).padStart(2, '0'),
      display: h + ':' + String(min).padStart(2, '0') + ' ' + m12[3].toUpperCase()
    };
  }
  const col = s.match(/^(\d{1,2}):(\d{2})$/);
  if (col) {
    const h = Number(col[1]), min = Number(col[2]);
    if (h > 23 || min > 59) return { status: 'invalid' };
    if (h === 0 || h >= 13) {
      const t = String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0');
      return { status: 'valid', mode: '24hr', time24: t, display: t };
    }
    if (!mer) return { status: 'needs_meridiem', mode: '12hr' };
    let h24 = h % 12; if (mer === 'PM') h24 += 12;
    return {
      status: 'valid',
      mode: '12hr',
      time24: String(h24).padStart(2, '0') + ':' + String(min).padStart(2, '0'),
      display: h + ':' + String(min).padStart(2, '0') + ' ' + mer
    };
  }
  const four = s.match(/^(\d{2})(\d{2})$/);
  if (four) {
    const h = Number(four[1]), min = Number(four[2]);
    if (h > 23 || min > 59) return { status: 'invalid' };
    const t = four[1] + ':' + four[2];
    return { status: 'valid', mode: '24hr', time24: t, display: t };
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

function setBodyClass(mode) {
  document.body.className = 'view-' + mode;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function render(showReport) {
  const root = document.getElementById('app');

  if (showReport) {
    const todays = events
      .filter((e) => e.dateIso === todayIso())
      .sort((a, b) => a.time24.localeCompare(b.time24));
    if (todays.length > 0) {
      setBodyClass('report');
      root.innerHTML =
        '<section class="report view-enter">' +
        '<h2 class="report-title">Today\'s Events</h2>' +
        todays.map((e) => '<div class="report-item"><h3>' + escapeHtml(e.title) + '</h3><p>' + escapeHtml(e.displayTime) + '</p></div>').join('') +
        '<button class="btn-primary" id="dismiss-report">Continue</button></section>';
      document.getElementById('dismiss-report').onclick = () => render(false);
      return;
    }
  }

  if (view === 'home') {
    setBodyClass('home');
    root.innerHTML =
      '<div class="home-wrap view-enter">' +
      '<div class="mime-mark" aria-hidden="true">' +
      '<div class="mime-mark-top"></div>' +
      '<div class="mime-mark-grid">' + '<span class="mime-mark-cell"></span>'.repeat(9) + '</div>' +
      '</div>' +
      '<div class="home-stack">' +
      '<button class="btn-primary" id="go-cal">Calendar</button>' +
      '<button class="btn-secondary" id="go-rem">Reminders</button>' +
      '</div></div>';
    document.getElementById('go-cal').onclick = () => {
      selectedIso = todayIso();
      view = 'calendar';
      render(false);
    };
    document.getElementById('go-rem').onclick = () => {
      prefillDate = '';
      meridiem = null;
      view = 'reminders';
      render(false);
    };
    return;
  }

  if (view === 'calendar') {
    setBodyClass('calendar');
    const y = cursor.getFullYear(), m = cursor.getMonth();
    const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
    const label = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const monthPrefix = y + '-' + String(m + 1).padStart(2, '0') + '-';
    const today = todayIso();

    let grid = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => '<div class="weekday">' + d + '</div>').join('');
    for (let i = 0; i < first; i++) grid += '<div></div>';
    for (let d = 1; d <= days; d++) {
      const iso = monthPrefix + String(d).padStart(2, '0');
      const count = events.filter((e) => e.dateIso === iso).length;
      const cls = ['day-cell', iso === today ? 'today' : '', iso === selectedIso ? 'selected' : ''].filter(Boolean).join(' ');
      grid += '<button type="button" class="' + cls + '" data-iso="' + iso + '"><span>' + d + '</span>' + (count ? '<span class="count-dot">' + count + '</span>' : '') + '</button>';
    }

    let agendaHtml = '';
    if (selectedIso && selectedIso.startsWith(monthPrefix)) {
      const dayEvents = events.filter((e) => e.dateIso === selectedIso).sort((a, b) => a.time24.localeCompare(b.time24));
      agendaHtml =
        '<div class="agenda">' +
        '<div class="agenda-head"><span>' + isoToDdMmYyyy(selectedIso) + '</span><button type="button" class="agenda-add" id="add-for-day">+ Add</button></div>' +
        (dayEvents.length === 0
          ? '<p class="agenda-empty">No events</p>'
          : dayEvents.map((ev) =>
              '<div class="agenda-item"><div><h3>' + escapeHtml(ev.title) + '</h3><div class="time">' + escapeHtml(ev.displayTime) + '</div>' +
              (ev.description ? '<div class="desc">' + escapeHtml(ev.description) + '</div>' : '') +
              '</div><button type="button" class="agenda-del" data-del="' + escapeHtml(ev.id) + '" aria-label="Delete">×</button></div>'
            ).join('')) +
        '</div>';
    }

    root.innerHTML =
      '<div class="shell view-enter">' +
      '<div class="cal-head">' +
      '<button type="button" class="icon-btn" id="back" aria-label="Back">‹</button>' +
      '<div class="month-title">' + label + '</div>' +
      '<div class="nav-arrows"><button type="button" class="icon-btn" id="prev" aria-label="Previous month">‹</button><button type="button" class="icon-btn" id="next" aria-label="Next month">›</button></div>' +
      '</div>' +
      '<div class="cal-grid">' + grid + '</div>' +
      agendaHtml +
      '</div>';

    document.getElementById('back').onclick = () => { view = 'home'; render(false); };
    document.getElementById('prev').onclick = () => { cursor = new Date(y, m - 1, 1); selectedIso = null; render(false); };
    document.getElementById('next').onclick = () => { cursor = new Date(y, m + 1, 1); selectedIso = null; render(false); };
    root.querySelectorAll('[data-iso]').forEach((btn) => {
      btn.onclick = () => { selectedIso = btn.dataset.iso; render(false); };
    });
    const addDayBtn = document.getElementById('add-for-day');
    if (addDayBtn) {
      addDayBtn.onclick = () => {
        prefillDate = isoToDdMmYyyy(selectedIso);
        meridiem = null;
        view = 'reminders';
        render(false);
      };
    }
    root.querySelectorAll('[data-del]').forEach((btn) => {
      btn.onclick = () => {
        events = events.filter((e) => e.id !== btn.dataset.del);
        saveStore();
        render(false);
      };
    });
    return;
  }

  setBodyClass('reminders');
  root.innerHTML =
    '<div class="shell view-enter">' +
    '<div class="cal-head"><button type="button" class="icon-btn" id="back" aria-label="Back">‹</button><div class="month-title">Create Event</div><div></div></div>' +
    '<form class="form" id="f">' +
    '<div class="field"><label class="field-label" for="name">Event Name</label><input class="input" id="name" placeholder="Studio critique" autocomplete="off" /></div>' +
    '<div class="field"><label class="field-label" for="date">Date</label><input class="input" id="date" placeholder="dd/mm/yyyy" maxlength="10" value="' + escapeHtml(prefillDate) + '" autocomplete="off" /></div>' +
    '<div class="field"><div class="field-head"><label class="field-label" for="time">Time</label><span class="field-hint" id="time-hint"></span></div><input class="input" id="time" placeholder="12pm, 12:40, 1640" autocomplete="off" /></div>' +
    '<div class="meridiem-box" id="mer-box" style="display:none"><span class="meridiem-label" id="mer-label">AM or PM?</span><div class="meridiem-row"><button type="button" class="meridiem-btn" data-m="AM">AM</button><button type="button" class="meridiem-btn" data-m="PM">PM</button></div></div>' +
    '<div class="field"><label class="field-label" for="desc">Description</label><textarea class="textarea" id="desc" rows="3" placeholder="Short description or specifics"></textarea></div>' +
    '<button type="submit" class="submit-btn" id="sub" disabled>Create Event</button>' +
    '</form></div>';

  document.getElementById('back').onclick = () => { view = 'home'; render(false); };
  const nameEl = document.getElementById('name');
  const dateEl = document.getElementById('date');
  const timeEl = document.getElementById('time');
  const timeHint = document.getElementById('time-hint');
  const merBox = document.getElementById('mer-box');
  const merLabel = document.getElementById('mer-label');
  const subBtn = document.getElementById('sub');

  const sync = () => {
    const d = parseDateDdMmYyyy(dateEl.value);
    const t = parseTime(timeEl.value, meridiem);
    const showMer = t.status === 'needs_meridiem' || (t.status === 'valid' && meridiem && !/am|pm/i.test(timeEl.value));
    merBox.style.display = showMer ? 'flex' : 'none';
    merLabel.textContent = meridiem ? '12-hour · ' + meridiem : 'AM or PM?';
    timeHint.textContent = t.status === 'valid' ? t.mode + ' · ' + t.display : '';
    subBtn.disabled = !(nameEl.value.trim() && d.valid && t.status === 'valid');
  };

  dateEl.addEventListener('input', (e) => {
    const val = dateEl.value;
    if (e.inputType && e.inputType.startsWith('delete')) {
      dateEl.value = val.replace(/[^\d/]/g, '').slice(0, 10);
    } else {
      const digits = val.replace(/\D/g, '').slice(0, 8);
      if (digits.length <= 2) dateEl.value = digits;
      else if (digits.length <= 4) dateEl.value = digits.slice(0, 2) + '/' + digits.slice(2);
      else dateEl.value = digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4);
    }
    sync();
  });

  timeEl.addEventListener('input', () => {
    if (/am|pm/i.test(timeEl.value) || !timeEl.value.trim()) {
      meridiem = null;
      merBox.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
    }
    sync();
  });

  nameEl.addEventListener('input', sync);

  merBox.querySelectorAll('button').forEach((b) => {
    b.onclick = () => {
      meridiem = b.dataset.m;
      merBox.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
      sync();
    };
  });

  document.getElementById('f').onsubmit = (ev) => {
    ev.preventDefault();
    const d = parseDateDdMmYyyy(dateEl.value);
    const t = parseTime(timeEl.value, meridiem);
    if (!nameEl.value.trim() || !d.valid || t.status !== 'valid') return;
    events.push({
      id: String(Date.now()),
      title: nameEl.value.trim(),
      dateIso: d.dateIso,
      time24: t.time24,
      displayTime: t.display,
      description: document.getElementById('desc').value.trim()
    });
    saveStore();
    const parts = d.dateIso.split('-').map(Number);
    cursor = new Date(parts[0], parts[1] - 1, 1);
    selectedIso = d.dateIso;
    view = 'calendar';
    render(false);
  };
  sync();
}

loadStore((seenDay) => {
  const today = todayIso();
  const shouldShow = navigator.onLine && seenDay !== today;
  if (shouldShow && typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.set({ [ONLINE_SEEN_KEY]: today });
  }
  render(shouldShow);
});