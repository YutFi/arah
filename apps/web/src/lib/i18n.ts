import { useSyncExternalStore } from "react";
import { formatDuration, malayInstruction, type CategoryId, type Maneuver } from "@arah/core";

/**
 * Two languages: English and Bahasa Melayu. The choice is kept on this phone only.
 * First visit: Bahasa Melayu if the phone is set to Malay, otherwise English.
 */
export type Lang = "en" | "ms";

const KEY = "arah.lang";

function detect(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "en" || saved === "ms") return saved;
  } catch {
    /* storage can be blocked */
  }
  const langs = typeof navigator !== "undefined" ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : [];
  return langs.some((l) => /^ms\b/i.test(l ?? "")) ? "ms" : "en";
}

let lang: Lang = detect();
const listeners = new Set<() => void>();

export function getLang(): Lang {
  return lang;
}

export function setLang(next: Lang) {
  if (next === lang) return;
  lang = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* ignore */
  }
  if (typeof document !== "undefined") document.documentElement.lang = next === "ms" ? "ms" : "en";
  for (const l of listeners) l();
}

if (typeof document !== "undefined") document.documentElement.lang = lang === "ms" ? "ms" : "en";

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// ---- the words ----------------------------------------------------------------

const en = {
  // splash
  "splash.tag": "Navigate Malaysia, privately.",
  "splash.made": "Made by Yutfi",
  "splash.foot": "Open source · No account · No tracking",

  // search
  "search.placeholder": "Where to? Place or address",
  "search.aria": "Search for a place, address or coordinates",
  "search.about": "About, data and privacy",
  "search.unavailable": "Search is unavailable right now.",
  "search.notFound":
    "Could not find that. Try the road or area name (for example “Kota Kemuning, Shah Alam”), paste coordinates like 3.0366, 101.5416, or long-press the map to drop a pin.",
  "search.noExact": "No exact match yet. Press go to search more widely.",
  "search.searching": "Searching…",
  "search.coords": "Go to coordinates",
  "search.closest": "closest match",
  "search.pinned": "Pinned location",
  "search.showNearby": "Show places nearby",
  "search.noTraffic": "Live traffic: not available",
  "search.saved": "Saved places",

  // categories
  "cat.fuel": "Petrol",
  "cat.worship": "Worship",
  "cat.fun": "Entertainment",
  "cat.see": "Attractions",
  "cat.food": "Restaurants",
  "cat.hot": "Hotspots",
  "cat.ev": "EV charging",
  "cat.health": "Health",
  "cat.money": "ATM & bank",
  "cat.shop": "Shops",
  "cat.parking": "Parking",

  // nearby sheet
  "nearby.you": "Near you",
  "nearby.centre": "Around the map centre",
  "nearby.sub": "Nearest first, within {km} km. From OpenStreetMap: no ratings or busy times.",
  "nearby.hide": "Hide places",
  "nearby.region": "Places nearby",
  "nearby.loading": "Looking for places nearby…",
  "nearby.slow": " Still waiting: the free map data server is slow right now.",
  "nearby.retry": "Try again",
  "nearby.none": "Nothing mapped within {km} km. Move the map and tap “Search this area”.",
  "nearby.searchHere": "Search this area",

  // place card
  "place.selected": "Selected place",
  "place.unnamed": "Unnamed place",
  "place.away": "{d} away",
  "place.lookingUp": "Looking up the address…",
  "place.hours": "Hours (as mapped on OpenStreetMap, may be out of date): {h}",
  "place.copy": "Copy",
  "place.copied": "Copied",
  "place.directions": "Directions",
  "place.call": "Call",
  "place.close": "Close",
  "place.save": "Save",
  "place.saved": "Saved",
  "place.share": "Share",
  "place.shared": "Link copied",
  "place.openIn": "Open in…",
  "place.saveAs": "Save as",
  "place.home": "Home",
  "place.work": "Work",
  "place.fav": "Favourite",
  "place.parked": "Parked here",
  "place.remove": "Remove from saved",
  "place.note.approx": "Exact address not found. This is the closest match for “{q}”. Long-press the map to move the pin to the exact spot.",

  // saved
  "saved.title": "Saved on this phone",
  "saved.note": "Kept only on this phone. Never uploaded.",
  "saved.home": "Home",
  "saved.work": "Work",
  "saved.parked": "Where I parked",
  "saved.parkHere": "Mark my car here",
  "saved.parkNoGps": "Turn on location to mark where you parked.",
  "saved.empty": "Nothing saved yet. Open a place and tap Save.",
  "saved.delete": "Remove",

  // route preview
  "route.finding": "Finding routes…",
  "route.startMid": "Starting from the middle of the map because your location is not available.",
  "route.useLoc": "Use my location",
  "route.recommended": "Recommended",
  "route.arrive": "Arrive {t}",
  "route.plus": "+{n} min",
  "route.avoidTolls": "Avoid toll roads where possible",
  "route.start": "Start",
  "route.simulate": "Simulate drive",
  "route.cancel": "Cancel",
  "route.note":
    "Times use typical road speeds, not live traffic. Lights, cameras and toll plazas are counted from OpenStreetMap volunteers, so real numbers can be higher. The camera count is not the official AWAS list.",
  "route.light.one": "{n} traffic light",
  "route.light.other": "{n} traffic lights",
  "route.cam.one": "{n} mapped speed camera",
  "route.cam.other": "{n} mapped speed cameras",
  "route.plaza.one": "{n} plaza",
  "route.plaza.other": "{n} plazas",
  "route.countingLights": "Counting lights…",
  "route.countingCams": "Counting cameras…",
  "route.noLights": "Lights: not counted",
  "route.noCams": "Cameras: not counted",
  "route.awas": " · {n} verified AWAS",
  "route.toll": "Toll",
  "route.tollNoCount": " road · plazas not counted",
  "route.tollAbout": ": about RM {rm}",
  "route.tollUnpriced": " + {p} unpriced",
  "route.tollNoPrice": ": {p} · price not available",
  "route.legend": "Map symbols",
  "route.legend.light": "Traffic light",
  "route.legend.cam": "Speed camera (OpenStreetMap)",
  "route.legend.toll": "Toll plaza",
  "route.tollBox": "Toll estimate, car (Class 1)",
  "route.tollSoFar": " · about RM {rm} so far",
  "route.tollTotal": " · about RM {rm}",
  "route.tollNone": " · no price available",
  "route.priceNA": "price not available",
  "route.tollWhy":
    "Prices come from public rate lists that agree with each other, checked on {d}, and may be out of date. Highways that charge by distance (such as PLUS) are not priced here; check the exact fare with the operator or the LLM toll calculator.",
  "route.err.reach": "Could not reach the routing server. Check your connection.",
  "route.err.noRoute": "No route: {e}",
  "route.err.server": "Routing server error ({s})",

  // navigation
  "nav.arrived": "You have arrived",
  "nav.getting": "Getting your position…",
  "nav.cam.fixed": "Speed camera",
  "nav.cam.red-light": "Red-light camera",
  "nav.cam.average-speed": "Average-speed camera",
  "nav.camAhead": "{c} ahead",
  "nav.limit": " · limit {n} km/h",
  "nav.rerouting": "Rerouting…",
  "nav.gpsWeak": "GPS signal is weak",
  "nav.sim": "Simulated drive · {n} km/h · tap to change",
  "nav.mute": "Mute voice",
  "nav.unmute": "Unmute voice",
  "nav.recenter": "Re-centre on my position",
  "nav.speed": "Current speed",
  "nav.kmh": "km/h",
  "nav.arrive": "arrive",
  "nav.left": "left",
  "nav.distance": "distance",
  "nav.done": "Done",
  "nav.end": "End",
  "voice.updated": "Route updated.",
  "voice.arrived": "You have arrived at your destination.",
  "voice.cam": "Speed camera ahead{limit}.",
  "voice.camLimit": ", limit {n}",
  "voice.in": "In {n} metres, {text}",

  // location
  "loc.off": "Location is off.",
  "loc.turnOn": "Tap to turn it on.",
  "loc.showMine": "Show my location",
  "loc.primerTitle": "See where you are",
  "loc.primerBody": "Arah uses your location to start routes from where you are and to guide you turn by turn. It stays on your phone: no account, no saved trips.",
  "loc.primerConfirm": "Your phone will ask you to confirm. Tap {allow} (or {allowWhile}).",
  "loc.primerAllow": "Allow",
  "loc.primerAllowWhile": "Allow While Using App",
  "loc.turnOnBtn": "Turn on location",
  "loc.notNow": "Not now",
  "loc.helpAria": "How to turn on location",
  "loc.helpTitle": "Turn on location",
  "loc.helpBody": "Your browser is blocking location for Arah, so it cannot show where you are.",
  "loc.retry": "Try again",
  "loc.reload": "Reload the page",
  "loc.helpFoot": "Menu names can differ a little between phones. You can still use Arah without location: search for a place and the route starts from the middle of the map.",
  "loc.ios.sa.title": "On iPhone (Arah on your Home Screen)",
  "loc.ios.sa.1": "Open the iPhone **Settings** app.",
  "loc.ios.sa.2": "Tap **Privacy & Security**, then **Location Services**. Make sure it is **On**.",
  "loc.ios.sa.3": "Scroll down to **Safari Websites** and choose **While Using the App**.",
  "loc.ios.sa.4": "Come back to Arah, close it fully, open it again, and tap **Try again**.",
  "loc.ios.saf.title": "On iPhone, in Safari",
  "loc.ios.saf.1": "Tap the **aA** icon at the left of the address bar.",
  "loc.ios.saf.2": "Tap **Website Settings**, then set **Location** to **Allow**.",
  "loc.ios.saf.3": "If Location is missing or greyed out: open the **Settings** app, tap **Privacy & Security**, **Location Services**, make sure it is **On**, then **Safari Websites**, then **While Using the App**.",
  "loc.ios.saf.4": "Come back here and tap **Try again**.",
  "loc.ios.other.title": "On iPhone, in {name}",
  "loc.ios.other.browser": "your browser",
  "loc.ios.other.1": "Open the iPhone **Settings** app.",
  "loc.ios.other.2": "Tap **Privacy & Security**, then **Location Services**. Make sure it is **On**.",
  "loc.ios.other.3": "Scroll to **{name}** and choose **While Using the App**.",
  "loc.ios.other.4": "Come back here and tap **Try again**. If it is still blocked, close this tab, open the link again, and tap **Allow** when asked.",
  "loc.ios.other.5": "Safari is the most reliable browser for this on iPhone.",
  "loc.and.chrome.title": "On Android, in Chrome",
  "loc.and.title": "On Android",
  "loc.and.1": "Swipe down from the top of the screen and make sure **Location** is switched on.",
  "loc.and.2": "In the browser, tap the **icon at the left of the address bar** (a lock or small sliders).",
  "loc.and.3": "Tap **Permissions**, then **Location**, and choose **Allow**. If you see **Reset permission**, tap it and then allow location again.",
  "loc.and.4": "Come back here and tap **Try again**.",
  "loc.other.title": "In your browser",
  "loc.other.1": "Click the **lock or sliders icon** at the left of the address bar.",
  "loc.other.2": "Find **Location** and set it to **Allow**.",
  "loc.other.3": "Tap **Try again**, or reload the page.",

  // prayer
  "prayer.title": "Prayer times",
  "prayer.button": "Prayer times",
  "prayer.next": "{name} {time}",
  "prayer.imsak": "Imsak",
  "prayer.fajr": "Subuh",
  "prayer.sunrise": "Syuruk",
  "prayer.dhuhr": "Zohor",
  "prayer.asr": "Asar",
  "prayer.maghrib": "Maghrib",
  "prayer.isha": "Isyak",
  "prayer.for": "For {place}, today",
  "prayer.here": "your position",
  "prayer.centre": "the map centre",
  "prayer.qibla": "Qibla direction: {deg}° from north ({dir})",
  "prayer.qiblaHelp": "Hold the phone flat and turn until it points that way. A phone compass can be off by several degrees.",
  "prayer.note": "Calculated on your phone, with no internet needed. It can differ from the official JAKIM e-Solat times by a few minutes. Please follow JAKIM or your local mosque.",
  "prayer.tomorrow": "tomorrow",
  "prayer.close": "Close",
  "dir.N": "north",
  "dir.NE": "north-east",
  "dir.E": "east",
  "dir.SE": "south-east",
  "dir.S": "south",
  "dir.SW": "south-west",
  "dir.W": "west",
  "dir.NW": "north-west",

  // language
  "lang.label": "Language",
  "lang.en": "English",
  "lang.ms": "Bahasa Melayu",

  // about
  "about.aria": "About Arah",
  "about.title": "Arah · early preview",
  "about.close": "Close",
  "about.works": "What works now",
  "about.worksBody":
    "Search by place name, street address or coordinates, a pin you can drop with a long press, nearby petrol, places of worship, food, entertainment, hotspots, attractions, EV charging, hospitals and pharmacies, ATMs, shops and parking, saved places kept on your phone, prayer times and Qibla direction, sharing a place, routes with alternatives, turn-by-turn directions with voice in English or Bahasa Melayu, current speed, rerouting, and a simulated drive for testing.",
  "about.worksRoute": "Route cards count traffic lights, mapped speed cameras and toll plazas from OpenStreetMap, and the chosen route shows them on the map. Volunteers map these, so the real numbers can be higher.",
  "about.mapData": "Map data",
  "about.checking": "Checking…",
  "about.snap": "Places, traffic lights, cameras and toll plazas come from an OpenStreetMap snapshot built on {d} ({places} places, {lights} traffic lights, {cams} cameras, {tolls} toll booths). It refreshes weekly.",
  "about.noSnap": "The pre-built OpenStreetMap snapshot is not available, so places and counts use a slower live server.",
  "about.notYet": "What does not exist yet",
  "about.traffic": "Live traffic:",
  "about.trafficBody": "not available. Travel times assume typical road speeds.",
  "about.tolls": "Toll prices:",
  "about.tollsBody": "a partial estimate. Only a small hand-checked list of flat-rate plazas (ordinary car) is priced, each from two public rate lists that agree, with the check date shown. Highways that charge by distance (such as PLUS) are not priced, and any plaza not on the list says “price not available”.",
  "about.awas": "Speed cameras (AWAS):",
  "about.awasTail": "The camera count on a route card comes from OpenStreetMap, not from the official AWAS list, and there are no spoken camera alerts from it.",
  "about.limits": "Speed limits:",
  "about.limitsBody": "not shown yet.",
  "about.awas.loaded": "{n} verified camera record(s) loaded{skipped}.",
  "about.awas.skipped": ", {n} skipped (failed checks)",
  "about.awas.empty": "Not loaded: no verified camera records exist yet, so no alerts will appear.",
  "about.awas.loading": "Loading…",
  "about.awas.error": "Could not load the camera data file.",
  "about.privacy": "Privacy",
  "about.priv1": "No account, no login, no saved trips. Your position lives in memory only and is gone when you close the app. Saved places and your language choice are stored on this phone only and never uploaded.",
  "about.priv2": "Starting a route sends the start and end points to the routing server ({routing}). Typing in search sends your text, and a nearby point, to the search server ({geo}). Searching a full address can also ask {addr}. Showing places nearby, and counting lights and cameras on a route, send the area or route outline to {poi}. Map tiles come from {tiles}. Prayer times are worked out on your phone and send nothing.",
  "about.priv3": "Those are public demo servers run by others. They see your network address like any website does.",
  "about.web": "Limits of a web app",
  "about.webBody": "Keep the screen on and the app in front. Phones stop web apps from reading GPS in the background, and the screen may dim on some iPhones. Do not interact with the phone while driving.",
  "about.credits": "Credits",
  "about.creditsBody": "Map data © OpenStreetMap contributors. Basemap by OpenFreeMap. Routing by Valhalla (FOSSGIS e.V. demo server). Search by Photon (komoot) and Nominatim. Places, lights, cameras and toll plazas via the Overpass API. Prayer times by the adhan library (MIT).",
  "about.made": "Made by Yutfi.",

  // errors
  "err.server": "The map data server said {s}",
  "err.slow": "The free map data server is too slow right now.",
  "err.unreachable": "The map data server is not reachable.",
  "err.busy": "The map data server is busy. Try again in a moment.",
  "err.places": "Could not load places.",
  "err.dataFile": "Map data file {p} failed ({s})",
  "err.stats": "The map data server is busy.",

  // toasts
  "toast.parked": "Saved where you parked.",
  "toast.sharedBad": "That share link could not be read.",

  // generic
  "common.close": "Close",
  "common.min": "min",
} as const;

export type Key = keyof typeof en;

const ms: Record<Key, string> = {
  "splash.tag": "Navigasi Malaysia, dengan privasi.",
  "splash.made": "Dibuat oleh Yutfi",
  "splash.foot": "Sumber terbuka · Tiada akaun · Tiada penjejakan",

  "search.placeholder": "Cari tempat atau alamat",
  "search.aria": "Cari tempat, alamat atau koordinat",
  "search.about": "Tentang, data dan privasi",
  "search.unavailable": "Carian tidak tersedia buat masa ini.",
  "search.notFound":
    "Tidak jumpa. Cuba nama jalan atau kawasan (contohnya “Kota Kemuning, Shah Alam”), tampal koordinat seperti 3.0366, 101.5416, atau tekan lama pada peta untuk meletakkan pin.",
  "search.noExact": "Belum ada padanan tepat. Tekan “go” untuk cari dengan lebih luas.",
  "search.searching": "Sedang mencari…",
  "search.coords": "Pergi ke koordinat",
  "search.closest": "padanan terdekat",
  "search.pinned": "Lokasi dipin",
  "search.showNearby": "Tunjuk tempat berdekatan",
  "search.noTraffic": "Trafik langsung: tiada",
  "search.saved": "Tempat disimpan",

  "cat.fuel": "Petrol",
  "cat.worship": "Rumah ibadah",
  "cat.fun": "Hiburan",
  "cat.see": "Tarikan",
  "cat.food": "Restoran",
  "cat.hot": "Port lepak",
  "cat.ev": "Cas EV",
  "cat.health": "Kesihatan",
  "cat.money": "ATM & bank",
  "cat.shop": "Kedai",
  "cat.parking": "Parkir",

  "nearby.you": "Berdekatan anda",
  "nearby.centre": "Sekitar tengah peta",
  "nearby.sub": "Paling dekat dahulu, dalam lingkungan {km} km. Daripada OpenStreetMap: tiada penilaian atau tahap sesak.",
  "nearby.hide": "Sembunyi tempat",
  "nearby.region": "Tempat berdekatan",
  "nearby.loading": "Mencari tempat berdekatan…",
  "nearby.slow": " Masih menunggu: pelayan data peta percuma agak perlahan sekarang.",
  "nearby.retry": "Cuba lagi",
  "nearby.none": "Tiada tempat dipetakan dalam lingkungan {km} km. Gerakkan peta dan tekan “Cari kawasan ini”.",
  "nearby.searchHere": "Cari kawasan ini",

  "place.selected": "Tempat dipilih",
  "place.unnamed": "Tempat tanpa nama",
  "place.away": "{d} dari sini",
  "place.lookingUp": "Mencari alamat…",
  "place.hours": "Waktu operasi (seperti dipetakan di OpenStreetMap, mungkin sudah lapuk): {h}",
  "place.copy": "Salin",
  "place.copied": "Disalin",
  "place.directions": "Arah",
  "place.call": "Telefon",
  "place.close": "Tutup",
  "place.save": "Simpan",
  "place.saved": "Disimpan",
  "place.share": "Kongsi",
  "place.shared": "Pautan disalin",
  "place.openIn": "Buka dalam…",
  "place.saveAs": "Simpan sebagai",
  "place.home": "Rumah",
  "place.work": "Tempat kerja",
  "place.fav": "Kegemaran",
  "place.parked": "Kereta di sini",
  "place.remove": "Buang daripada simpanan",
  "place.note.approx": "Alamat tepat tidak dijumpai. Ini padanan terdekat untuk “{q}”. Tekan lama pada peta untuk alihkan pin ke tempat sebenar.",

  "saved.title": "Disimpan di telefon ini",
  "saved.note": "Disimpan di telefon ini sahaja. Tidak pernah dimuat naik.",
  "saved.home": "Rumah",
  "saved.work": "Tempat kerja",
  "saved.parked": "Tempat saya parkir",
  "saved.parkHere": "Tanda kereta saya di sini",
  "saved.parkNoGps": "Hidupkan lokasi untuk menanda tempat anda parkir.",
  "saved.empty": "Belum ada yang disimpan. Buka sesuatu tempat dan tekan Simpan.",
  "saved.delete": "Buang",

  "route.finding": "Mencari laluan…",
  "route.startMid": "Bermula dari tengah peta kerana lokasi anda tidak tersedia.",
  "route.useLoc": "Guna lokasi saya",
  "route.recommended": "Disyorkan",
  "route.arrive": "Tiba {t}",
  "route.plus": "+{n} min",
  "route.avoidTolls": "Elak jalan tol jika boleh",
  "route.start": "Mula",
  "route.simulate": "Simulasi pemanduan",
  "route.cancel": "Batal",
  "route.note":
    "Masa dikira berdasarkan kelajuan jalan biasa, bukan trafik langsung. Lampu isyarat, kamera dan plaza tol dikira daripada sukarelawan OpenStreetMap, jadi bilangan sebenar mungkin lebih tinggi. Bilangan kamera bukan senarai AWAS rasmi.",
  "route.light.one": "{n} lampu isyarat",
  "route.light.other": "{n} lampu isyarat",
  "route.cam.one": "{n} kamera laju dipetakan",
  "route.cam.other": "{n} kamera laju dipetakan",
  "route.plaza.one": "{n} plaza",
  "route.plaza.other": "{n} plaza",
  "route.countingLights": "Mengira lampu isyarat…",
  "route.countingCams": "Mengira kamera…",
  "route.noLights": "Lampu isyarat: tidak dikira",
  "route.noCams": "Kamera: tidak dikira",
  "route.awas": " · {n} AWAS disahkan",
  "route.toll": "Tol",
  "route.tollNoCount": " · plaza tidak dikira",
  "route.tollAbout": ": kira-kira RM {rm}",
  "route.tollUnpriced": " + {p} tiada harga",
  "route.tollNoPrice": ": {p} · harga tidak tersedia",
  "route.legend": "Simbol peta",
  "route.legend.light": "Lampu isyarat",
  "route.legend.cam": "Kamera laju (OpenStreetMap)",
  "route.legend.toll": "Plaza tol",
  "route.tollBox": "Anggaran tol, kereta (Kelas 1)",
  "route.tollSoFar": " · kira-kira RM {rm} setakat ini",
  "route.tollTotal": " · kira-kira RM {rm}",
  "route.tollNone": " · harga tidak tersedia",
  "route.priceNA": "harga tidak tersedia",
  "route.tollWhy":
    "Harga diambil daripada senarai kadar awam yang sepadan antara satu sama lain, disemak pada {d}, dan mungkin sudah berubah. Lebuh raya yang mengenakan bayaran mengikut jarak (seperti PLUS) tidak dinyatakan harganya di sini; semak tambang tepat dengan pengendali atau kalkulator tol LLM.",
  "route.err.reach": "Tidak dapat menghubungi pelayan laluan. Semak sambungan anda.",
  "route.err.noRoute": "Tiada laluan: {e}",
  "route.err.server": "Ralat pelayan laluan ({s})",

  "nav.arrived": "Anda telah sampai",
  "nav.getting": "Mendapatkan kedudukan anda…",
  "nav.cam.fixed": "Kamera laju",
  "nav.cam.red-light": "Kamera lampu merah",
  "nav.cam.average-speed": "Kamera purata laju",
  "nav.camAhead": "{c} di hadapan",
  "nav.limit": " · had {n} km/j",
  "nav.rerouting": "Mencari laluan baharu…",
  "nav.gpsWeak": "Isyarat GPS lemah",
  "nav.sim": "Pemanduan simulasi · {n} km/j · tekan untuk tukar",
  "nav.mute": "Senyapkan suara",
  "nav.unmute": "Hidupkan suara",
  "nav.recenter": "Pusatkan semula pada kedudukan saya",
  "nav.speed": "Kelajuan semasa",
  "nav.kmh": "km/j",
  "nav.arrive": "tiba",
  "nav.left": "berbaki",
  "nav.distance": "jarak",
  "nav.done": "Selesai",
  "nav.end": "Tamat",
  "voice.updated": "Laluan dikemas kini.",
  "voice.arrived": "Anda telah sampai di destinasi.",
  "voice.cam": "Kamera laju di hadapan{limit}.",
  "voice.camLimit": ", had {n}",
  "voice.in": "Dalam {n} meter, {text}",

  "loc.off": "Lokasi dimatikan.",
  "loc.turnOn": "Tekan untuk menghidupkannya.",
  "loc.showMine": "Tunjuk lokasi saya",
  "loc.primerTitle": "Lihat di mana anda berada",
  "loc.primerBody": "Arah menggunakan lokasi anda untuk memulakan laluan dari tempat anda dan membimbing anda belokan demi belokan. Ia kekal di telefon anda: tiada akaun, tiada perjalanan disimpan.",
  "loc.primerConfirm": "Telefon anda akan meminta pengesahan. Tekan {allow} (atau {allowWhile}).",
  "loc.primerAllow": "Benarkan",
  "loc.primerAllowWhile": "Benarkan Semasa Menggunakan Apl",
  "loc.turnOnBtn": "Hidupkan lokasi",
  "loc.notNow": "Bukan sekarang",
  "loc.helpAria": "Cara menghidupkan lokasi",
  "loc.helpTitle": "Hidupkan lokasi",
  "loc.helpBody": "Pelayar anda menyekat lokasi untuk Arah, jadi ia tidak dapat menunjukkan di mana anda berada.",
  "loc.retry": "Cuba lagi",
  "loc.reload": "Muat semula halaman",
  "loc.helpFoot": "Nama menu mungkin sedikit berbeza antara telefon. Anda masih boleh guna Arah tanpa lokasi: cari sesuatu tempat dan laluan bermula dari tengah peta.",
  "loc.ios.sa.title": "Pada iPhone (Arah di Skrin Utama)",
  "loc.ios.sa.1": "Buka apl **Settings** iPhone.",
  "loc.ios.sa.2": "Tekan **Privacy & Security**, kemudian **Location Services**. Pastikan ia **On**.",
  "loc.ios.sa.3": "Tatal ke bawah ke **Safari Websites** dan pilih **While Using the App**.",
  "loc.ios.sa.4": "Kembali ke Arah, tutup sepenuhnya, buka semula, dan tekan **Cuba lagi**.",
  "loc.ios.saf.title": "Pada iPhone, dalam Safari",
  "loc.ios.saf.1": "Tekan ikon **aA** di kiri bar alamat.",
  "loc.ios.saf.2": "Tekan **Website Settings**, kemudian tetapkan **Location** kepada **Allow**.",
  "loc.ios.saf.3": "Jika Location tiada atau kelabu: buka apl **Settings**, tekan **Privacy & Security**, **Location Services**, pastikan ia **On**, kemudian **Safari Websites**, kemudian **While Using the App**.",
  "loc.ios.saf.4": "Kembali ke sini dan tekan **Cuba lagi**.",
  "loc.ios.other.title": "Pada iPhone, dalam {name}",
  "loc.ios.other.browser": "pelayar anda",
  "loc.ios.other.1": "Buka apl **Settings** iPhone.",
  "loc.ios.other.2": "Tekan **Privacy & Security**, kemudian **Location Services**. Pastikan ia **On**.",
  "loc.ios.other.3": "Tatal ke **{name}** dan pilih **While Using the App**.",
  "loc.ios.other.4": "Kembali ke sini dan tekan **Cuba lagi**. Jika masih disekat, tutup tab ini, buka pautan semula, dan tekan **Allow** apabila diminta.",
  "loc.ios.other.5": "Safari ialah pelayar paling boleh dipercayai untuk ini pada iPhone.",
  "loc.and.chrome.title": "Pada Android, dalam Chrome",
  "loc.and.title": "Pada Android",
  "loc.and.1": "Leret ke bawah dari atas skrin dan pastikan **Lokasi** dihidupkan.",
  "loc.and.2": "Dalam pelayar, tekan **ikon di kiri bar alamat** (mangga atau gelangsar kecil).",
  "loc.and.3": "Tekan **Kebenaran**, kemudian **Lokasi**, dan pilih **Benarkan**. Jika ada **Tetapkan semula kebenaran**, tekan dan benarkan lokasi semula.",
  "loc.and.4": "Kembali ke sini dan tekan **Cuba lagi**.",
  "loc.other.title": "Dalam pelayar anda",
  "loc.other.1": "Klik **ikon mangga atau gelangsar** di kiri bar alamat.",
  "loc.other.2": "Cari **Lokasi** dan tetapkan kepada **Benarkan**.",
  "loc.other.3": "Tekan **Cuba lagi**, atau muat semula halaman.",

  "prayer.title": "Waktu solat",
  "prayer.button": "Waktu solat",
  "prayer.next": "{name} {time}",
  "prayer.imsak": "Imsak",
  "prayer.fajr": "Subuh",
  "prayer.sunrise": "Syuruk",
  "prayer.dhuhr": "Zohor",
  "prayer.asr": "Asar",
  "prayer.maghrib": "Maghrib",
  "prayer.isha": "Isyak",
  "prayer.for": "Untuk {place}, hari ini",
  "prayer.here": "kedudukan anda",
  "prayer.centre": "tengah peta",
  "prayer.qibla": "Arah kiblat: {deg}° dari utara ({dir})",
  "prayer.qiblaHelp": "Pegang telefon secara mendatar dan pusing sehingga menghala ke arah itu. Kompas telefon boleh tersasar beberapa darjah.",
  "prayer.note": "Dikira di telefon anda, tanpa memerlukan internet. Ia boleh berbeza beberapa minit daripada waktu rasmi JAKIM e-Solat. Sila rujuk JAKIM atau masjid setempat.",
  "prayer.tomorrow": "esok",
  "prayer.close": "Tutup",
  "dir.N": "utara",
  "dir.NE": "timur laut",
  "dir.E": "timur",
  "dir.SE": "tenggara",
  "dir.S": "selatan",
  "dir.SW": "barat daya",
  "dir.W": "barat",
  "dir.NW": "barat laut",

  "lang.label": "Bahasa",
  "lang.en": "English",
  "lang.ms": "Bahasa Melayu",

  "about.aria": "Tentang Arah",
  "about.title": "Arah · pratonton awal",
  "about.close": "Tutup",
  "about.works": "Apa yang berfungsi sekarang",
  "about.worksBody":
    "Cari mengikut nama tempat, alamat jalan atau koordinat, pin yang boleh diletakkan dengan tekan lama, petrol berdekatan, rumah ibadah, makanan, hiburan, port lepak, tarikan, cas EV, hospital dan farmasi, ATM, kedai dan parkir, tempat disimpan di telefon anda, waktu solat dan arah kiblat, kongsi tempat, laluan alternatif, arahan belokan demi belokan dengan suara dalam Bahasa Melayu atau English, kelajuan semasa, laluan baharu apabila tersasar, dan pemanduan simulasi untuk ujian.",
  "about.worksRoute": "Kad laluan mengira lampu isyarat, kamera laju yang dipetakan dan plaza tol daripada OpenStreetMap, dan laluan yang dipilih menunjukkannya di peta. Sukarelawan yang memetakannya, jadi bilangan sebenar mungkin lebih tinggi.",
  "about.mapData": "Data peta",
  "about.checking": "Menyemak…",
  "about.snap": "Tempat, lampu isyarat, kamera dan plaza tol datang daripada syot OpenStreetMap yang dibina pada {d} ({places} tempat, {lights} lampu isyarat, {cams} kamera, {tolls} pondok tol). Ia dikemas kini setiap minggu.",
  "about.noSnap": "Syot OpenStreetMap yang telah dibina tidak tersedia, jadi tempat dan bilangan menggunakan pelayan langsung yang lebih perlahan.",
  "about.notYet": "Apa yang belum ada",
  "about.traffic": "Trafik langsung:",
  "about.trafficBody": "tiada. Masa perjalanan mengandaikan kelajuan jalan biasa.",
  "about.tolls": "Harga tol:",
  "about.tollsBody": "anggaran separa. Hanya senarai kecil plaza kadar tetap (kereta biasa) yang diberi harga, setiap satu daripada dua senarai kadar awam yang sepadan, dengan tarikh semakan dipaparkan. Lebuh raya yang mengenakan bayaran mengikut jarak (seperti PLUS) tidak diberi harga, dan mana-mana plaza yang tiada dalam senarai akan tertera “harga tidak tersedia”.",
  "about.awas": "Kamera laju (AWAS):",
  "about.awasTail": "Bilangan kamera pada kad laluan datang daripada OpenStreetMap, bukan senarai AWAS rasmi, dan tiada amaran kamera bersuara daripadanya.",
  "about.limits": "Had laju:",
  "about.limitsBody": "belum dipaparkan.",
  "about.awas.loaded": "{n} rekod kamera disahkan dimuatkan{skipped}.",
  "about.awas.skipped": ", {n} dilangkau (gagal semakan)",
  "about.awas.empty": "Tidak dimuatkan: belum ada rekod kamera yang disahkan, jadi tiada amaran akan muncul.",
  "about.awas.loading": "Memuatkan…",
  "about.awas.error": "Tidak dapat memuatkan fail data kamera.",
  "about.privacy": "Privasi",
  "about.priv1": "Tiada akaun, tiada log masuk, tiada perjalanan disimpan. Kedudukan anda hanya ada dalam memori dan hilang apabila anda menutup apl. Tempat yang disimpan dan pilihan bahasa anda disimpan di telefon ini sahaja dan tidak pernah dimuat naik.",
  "about.priv2": "Memulakan laluan menghantar titik mula dan tamat ke pelayan laluan ({routing}). Menaip dalam carian menghantar teks anda, dan satu titik berdekatan, ke pelayan carian ({geo}). Mencari alamat penuh juga boleh bertanya kepada {addr}. Menunjukkan tempat berdekatan, serta mengira lampu dan kamera pada laluan, menghantar kawasan atau garis laluan ke {poi}. Jubin peta datang daripada {tiles}. Waktu solat dikira di telefon anda dan tidak menghantar apa-apa.",
  "about.priv3": "Itu pelayan demo awam yang dikendalikan orang lain. Mereka nampak alamat rangkaian anda seperti mana-mana laman web.",
  "about.web": "Had apl web",
  "about.webBody": "Biarkan skrin hidup dan apl di hadapan. Telefon menghalang apl web daripada membaca GPS di latar belakang, dan skrin mungkin malap pada sesetengah iPhone. Jangan menggunakan telefon semasa memandu.",
  "about.credits": "Penghargaan",
  "about.creditsBody": "Data peta © penyumbang OpenStreetMap. Peta asas oleh OpenFreeMap. Laluan oleh Valhalla (pelayan demo FOSSGIS e.V.). Carian oleh Photon (komoot) dan Nominatim. Tempat, lampu, kamera dan plaza tol melalui API Overpass. Waktu solat menggunakan pustaka adhan (MIT).",
  "about.made": "Dibuat oleh Yutfi.",

  "err.server": "Pelayan data peta memberi respons {s}",
  "err.slow": "Pelayan data peta percuma terlalu perlahan sekarang.",
  "err.unreachable": "Pelayan data peta tidak dapat dihubungi.",
  "err.busy": "Pelayan data peta sibuk. Cuba lagi sebentar nanti.",
  "err.places": "Tidak dapat memuatkan tempat.",
  "err.dataFile": "Fail data peta {p} gagal ({s})",
  "err.stats": "Pelayan data peta sibuk.",

  "toast.parked": "Tempat anda parkir telah disimpan.",
  "toast.sharedBad": "Pautan kongsi itu tidak dapat dibaca.",

  "common.close": "Tutup",
  "common.min": "min",
};

const dict: Record<Lang, Record<Key, string>> = { en, ms };

export function t(key: Key, vars?: Record<string, string | number>): string {
  let s = dict[lang][key] ?? en[key];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Count + noun: uses `<key>.one` or `<key>.other`. */
export function tn(key: "route.light" | "route.cam" | "route.plaza", n: number): string {
  return t(`${key}.${n === 1 ? "one" : "other"}` as Key, { n });
}

/** Use inside components: re-renders when the language changes. */
export function useT() {
  const l = useSyncExternalStore(subscribe, getLang, getLang);
  return { t, tn, lang: l };
}

// ---- helpers that depend on the language ---------------------------------------

export const catLabel = (id: CategoryId) => t(`cat.${id}` as Key);

const SUB_MS: Record<string, string> = {
  "Petrol station": "Stesen minyak",
  Mosque: "Masjid",
  "Mosque / surau": "Masjid / surau",
  Surau: "Surau",
  Church: "Gereja",
  "Buddhist temple": "Tokong Buddha",
  "Chinese temple": "Tokong Cina",
  "Hindu temple": "Kuil Hindu",
  Gurdwara: "Gurdwara",
  "Place of worship": "Rumah ibadah",
  Cinema: "Pawagam",
  Theatre: "Teater",
  Nightclub: "Kelab malam",
  Karaoke: "Karaoke",
  Bowling: "Boling",
  Arcade: "Arked permainan",
  "Water park": "Taman air",
  "Escape game": "Permainan escape",
  "Ice rink": "Gelanggang ais",
  "Trampoline park": "Taman trampolin",
  "Mini golf": "Golf mini",
  "Theme park": "Taman tema",
  Attraction: "Tarikan",
  Museum: "Muzium",
  Gallery: "Galeri",
  Viewpoint: "Tempat tinjauan",
  Zoo: "Zoo",
  Aquarium: "Akuarium",
  Monument: "Tugu",
  Fort: "Kota",
  Castle: "Istana",
  Waterfall: "Air terjun",
  Beach: "Pantai",
  Restaurant: "Restoran",
  "Fast food": "Makanan segera",
  "Food court": "Medan selera",
  Cafe: "Kafe",
  "Shopping mall": "Pusat membeli-belah",
  Market: "Pasar",
  Park: "Taman",
  "EV charging": "Cas EV",
  Hospital: "Hospital",
  Clinic: "Klinik",
  Pharmacy: "Farmasi",
  ATM: "ATM",
  Bank: "Bank",
  "Convenience store": "Kedai serbaneka",
  Supermarket: "Pasar raya",
  Parking: "Parkir",
};

/** Short kind of a place, in the chosen language. Falls back to the English text. */
export function subLabel(sub: string | undefined): string {
  if (!sub) return "";
  return lang === "ms" ? (SUB_MS[sub] ?? sub) : sub;
}

export const fmtDuration = (s: number) => formatDuration(s, lang === "ms" ? "j" : "h");

/** Written turn instruction in the chosen language (the server's English, or our Malay). */
export function maneuverText(m: Pick<Maneuver, "instruction" | "type" | "streetNames" | "roundaboutExitCount">): string {
  return lang === "ms" ? malayInstruction(m) : m.instruction;
}

/** Splits "**bold**" markers into pieces: [text, bold?]. Used for step lists. */
export function boldParts(text: string): { text: string; bold: boolean }[] {
  return text.split("**").map((part, i) => ({ text: part, bold: i % 2 === 1 }));
}
