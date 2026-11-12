const STORAGE_KEY = 'mime_events_v1';
const ONLINE_SEEN_KEY = 'mime_online_seen_v1';

function todayIso() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function checkTodaysEventsOnOnline() {
  if (!navigator.onLine) return;
  const today = todayIso();
  chrome.storage.local.get([STORAGE_KEY, ONLINE_SEEN_KEY], (res) => {
    if (res[ONLINE_SEEN_KEY] === today) return;
    const events = Array.isArray(res[STORAGE_KEY]) ? res[STORAGE_KEY] : [];
    const todays = events.filter((e) => e.dateIso === today).sort((a, b) => a.time24.localeCompare(b.time24));
    if (todays.length > 0) {
      chrome.storage.local.set({ [ONLINE_SEEN_KEY]: today });
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon128.png',
        title: "Today's Events",
        message: todays.map((e) => e.title + ' — ' + e.displayTime).join('\n')
      });
    }
  });
}

chrome.runtime.onStartup.addListener(checkTodaysEventsOnOnline);
self.addEventListener('online', checkTodaysEventsOnOnline);