"use strict";
// MatchLab dashboard. All text from feeds is inserted with textContent, never as HTML.
const view = document.getElementById("view");
const state = { token: "", schedule: null, filter: "all", timer: null, request: 0, players: {}, keyStatus: null, refreshing: false, aiBusy: null, aiTried: {}, aiError: {} };
const SPORTS = { cricket: "Cricket", tennis: "Tennis", f1: "Formula 1" };
state.search = "";
state.pickers = {};
state.limit = {};
const PAGE = 12;
const THEMES = { butter: "Butter", neutral: "Neutral", chocolate: "Chocolate" };
state.theme = "butter";
try {
  const saved = localStorage.getItem("matchlab-astryx-theme");
  if (Object.hasOwn(THEMES, saved)) state.theme = saved;
} catch (_) { /* Storage may be disabled. */ }
document.documentElement.dataset.astryxTheme = state.theme;

function changeTheme(theme) {
  if (!Object.hasOwn(THEMES, theme)) return;
  state.theme = theme;
  document.documentElement.dataset.astryxTheme = theme;
  try { localStorage.setItem("matchlab-astryx-theme", theme); } catch (_) { /* Keep this session's palette. */ }
}

// Listeners are remembered on the node so the keyed patch below can swap in the newest closure.
function bind(node, type, fn) {
  if (node._on && node._on[type]) node.removeEventListener(type, node._on[type]);
  (node._on = node._on || {})[type] = fn;
  node.addEventListener(type, fn);
}
function h(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === false || value == null) continue;
    if (key === "class") node.className = value;
    else if (key.startsWith("on")) bind(node, key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}
function animateNumber(node, target, suffix = "") {
  if (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    node.textContent = target + suffix;
    return;
  }
  const numeric = typeof target === "number" ? target : parseInt(target, 10);
  if (isNaN(numeric)) {
    node.textContent = target + suffix;
    return;
  }
  const duration = 340;
  const start = performance.now();
  const initial = 0;
  function step(now) {
    const elapsed = now - start;
    const progress = Math.min(1, elapsed / duration);
    const ease = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(initial + (numeric - initial) * ease);
    node.textContent = current + suffix;
    if (progress < 1) requestAnimationFrame(step);
    else node.textContent = target + suffix;
  }
  requestAnimationFrame(step);
}
// One polite live region for the whole app. Only deliberate messages go through it (a new view, a score that
// changed, an error), never the content of a refresh, so a screen reader is not read the page every 12 seconds.
const statusRegion = document.getElementById("status");
let announceTimer = 0;
function announce(message) {
  if (!statusRegion || !message) return;
  clearTimeout(announceTimer);
  statusRegion.textContent = "";
  announceTimer = setTimeout(() => { statusRegion.textContent = message; }, 60);
}
const show = (...nodes) => {
  view.classList.remove("view-enter");
  void view.offsetWidth;
  view.replaceChildren(...nodes.flat().filter((n) => n != null && n !== false));
  view.dataset.route = state.routeKey || "";
  view.classList.add("view-enter");
  // First reveal only: counters count up once per view. Later updates change the number in place.
  view.querySelectorAll("[data-countup]").forEach((node) => animateNumber(node, Number(node.dataset.countup)));
  if (state.focusHeading) {
    state.focusHeading = false;
    const heading = view.querySelector("h1");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      announce(heading.textContent.replace(/\s+/g, " ").trim());
    }
  }
};
// ---- keyed patch -----------------------------------------------------------------------
// Same-route updates (a poll, a filter, a search) patch the existing DOM instead of rebuilding it, so focus,
// scroll, open <details>, typed text and selects survive, entrance animations do not replay, and a value that
// changed is updated in place with one brief highlight. A node with data-k is matched by key; a node with
// data-atomic is kept whole while its key is unchanged and replaced when it changes (use it for components whose
// listeners close over their own child nodes).
const FLASH = "[data-live], .num, .stat .v, .teams b, .probabilities strong";
function flash(el) { el.classList.remove("changed"); void el.offsetWidth; el.classList.add("changed"); }
function morphAttrs(o, n) {
  const details = o.tagName === "DETAILS";
  for (const a of [...o.attributes]) if (!n.hasAttribute(a.name) && !(details && a.name === "open")) o.removeAttribute(a.name);
  for (const a of n.attributes) if (!(details && a.name === "open") && o.getAttribute(a.name) !== a.value) o.setAttribute(a.name, a.value);
  for (const type of Object.keys(o._on || {})) if (!(n._on && n._on[type])) { o.removeEventListener(type, o._on[type]); delete o._on[type]; }
  for (const [type, fn] of Object.entries(n._on || {})) bind(o, type, fn);
}
function sameKind(o, n) {
  if (o.nodeType !== n.nodeType) return false;
  if (o.nodeType !== 1) return true;
  return o.tagName === n.tagName && o.namespaceURI === n.namespaceURI && !n.hasAttribute("data-atomic") && !o.hasAttribute("data-atomic");
}
function morphNode(o, n) {
  if (o.nodeType !== 1) {
    if (o.data !== n.data) {
      const host = o.parentElement, had = o.data.trim() !== "";
      o.data = n.data;
      const target = host && host.closest(FLASH);
      if (had && target && !host.closest("[aria-busy]")) flash(target);
    }
    return;
  }
  morphAttrs(o, n);
  if (o.tagName === "SELECT") {
    const values = (select) => [...select.options].map((option) => option.value).join("\u0000");
    if (values(o) !== values(n)) o.replaceWith(n);
    return;
  }
  if (o.tagName === "INPUT" || o.tagName === "TEXTAREA") return;
  morphChildren(o, n);
}
function morphChildren(o, n) {
  const kids = [...n.childNodes], byKey = new Map();
  // Drop keyed nodes that are gone first, so the survivors keep their order and are never moved: moving a node
  // restarts its CSS animation.
  const wanted = new Set(kids.filter((k) => k.nodeType === 1 && k.hasAttribute("data-k")).map((k) => k.getAttribute("data-k")));
  for (const child of [...o.childNodes]) if (child.nodeType === 1 && child.hasAttribute("data-k") && !wanted.has(child.getAttribute("data-k"))) child.remove();
  for (const child of o.childNodes) if (child.nodeType === 1 && child.hasAttribute("data-k")) byKey.set(child.getAttribute("data-k"), child);
  kids.forEach((next, i) => {
    const cur = o.childNodes[i] || null;
    const key = next.nodeType === 1 ? next.getAttribute("data-k") : null;
    if (key != null) {
      const found = byKey.get(key);
      if (found && found.tagName === next.tagName) {
        if (found !== cur) o.insertBefore(found, cur);
        if (!next.hasAttribute("data-atomic")) morphNode(found, next);
      } else o.insertBefore(next, cur);
    } else if (cur && !(cur.nodeType === 1 && cur.hasAttribute("data-k")) && sameKind(cur, next)) morphNode(cur, next);
    else o.insertBefore(next, cur);
  });
  while (o.childNodes.length > kids.length) o.lastChild.remove();
}
function showMorph(...nodes) {
  if (view.dataset.route !== (state.routeKey || "")) return show(...nodes);
  const next = document.createDocumentFragment();
  next.append(...nodes.flat().filter((n) => n != null && n !== false));
  morphChildren(view, next);
}
const pct = (p) => `${Math.round(p * 100)}%`;
const time = (iso) => iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
const day = (iso) => iso ? new Date(iso).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }) : "";

async function api(path, body) {
  const options = body === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json", "X-MatchLab-Token": state.token }, body: JSON.stringify(body),
  };
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({ error: "The local server sent an unreadable reply." }));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function showBudgets(budget) {
  const box = document.getElementById("budgets");
  box.replaceChildren();
  if (!budget) return;
  for (const [key, label] of [["cricketdata", "CricketData"], ["openrouter", "AI checks"]]) {
    const item = budget[key];
    if (!item) continue;
    box.append(h("span", { class: `budget num${item.remaining <= 15 ? " low" : ""}`, title: `${item.used} of ${item.limit} requests used today. Resets at midnight UTC.` },
      `${label}: ${item.remaining} of ${item.limit} left`));
  }
}

function countdown(iso) {
  const minutes = Math.round((new Date(iso) - Date.now()) / 60000);
  if (minutes < -1) return "start time passed";
  if (minutes <= 1) return "starting now";
  if (minutes < 60) return `starts in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `starts in ${hours} h ${minutes % 60} min`;
}

function modelled(match) {
  if (match.sport === "tennis") return !/^(tbd|bye)$/i.test(match.team || "tbd") && !/^(tbd|bye)$/i.test(match.opponent || "tbd");
  if (match.sport !== "cricket") return null;
  const kind = `${match.detail || ""} ${match.espn_class || ""}`.toLowerCase();
  if (/test|first-class|first class|\bfc\b/.test(kind)) return false;
  return /t20|twenty20|t10|odi|list a|one-day|one day/.test(`${kind} ${(match.tournament || "").toLowerCase()}`);
}

function card(match, index = 0) {
  const live = match.state === "in";
  const ready = modelled(match);
  const tagText = live ? "Live" : match.state === "post" ? "Finished" : time(match.start);
  const badge = match.sport === "f1" ? h("span", { class: "tag ok" }, "Explore F1")
    : ready ? h("span", { class: "tag ok" }, "Forecast ready")
      : h("span", { class: "tag off" }, match.sport === "tennis" ? "Players not decided" : "Not modelled yet");
  return h("button", {
    class: `card match-card${live ? " is-live" : ""}`,
    "data-k": match.id,
    style: `--stagger:${Math.min(index, 12)};`,
    type: "button",
    onclick: () => { location.hash = `match/${encodeURIComponent(match.id)}`; }
  },
    h("div", { class: "match-card-top" },
      h("div", { class: "meta" }, h("span", {}, `${SPORTS[match.sport]}${match.detail ? " · " + match.detail : ""}`),
        h("span", { class: `tag${live ? " live" : ""}` }, tagText))),
    h("div", { class: "teams" },
      h("span", {}, h("span", { class: "team-name" }, match.team), h("b", {}, match.team_score || "")),
      match.opponent ? h("span", {}, h("span", { class: "team-name" }, match.opponent), h("b", {}, match.opponent_score || "")) : null),
    h("div", { class: "tour" }, [match.tournament, match.venue].filter(Boolean).join(" · ")),
    h("div", { class: "foot2" }, h("span", {}, live || match.state === "post" ? (match.status || "") : `${day(match.start)} · ${countdown(match.start)}`), badge),
    h("div", { class: "card-action" }, "Explore match", h("span", { "aria-hidden": "true" }, "↗")));
}

// How old the data is, in words, with a level the page can style. Thresholds are minutes.
function freshness(iso, limits = [20, 60]) {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(minutes)) return { level: "unknown", text: "Check time unknown" };
  const age = minutes < 2 ? "just now" : minutes < 60 ? `${minutes} min ago` : `${Math.floor(minutes / 60)} h ${minutes % 60} min ago`;
  if (minutes <= limits[0]) return { level: "fresh", text: `Checked ${age}` };
  if (minutes <= limits[1]) return { level: "stale", text: `Checked ${age}. Scores may be a little behind.` };
  return { level: "old", text: `Checked ${age}. Scores may be out of date: press Refresh.` };
}
function freshnessChip(iso) {
  const info = freshness(iso);
  return h("span", { class: `freshness ${info.level}`, "data-freshness": iso }, info.text);
}
// Ages are re-worded in place every 30 seconds, so a page left open never claims old data is fresh.
function updateFreshness() {
  document.querySelectorAll("[data-freshness]").forEach((node) => {
    const info = freshness(node.dataset.freshness);
    if (node.textContent !== info.text) node.textContent = info.text;
    const next = `freshness ${info.level}`;
    if (node.className !== next) node.className = next;
  });
}

function renderMatches() {
  const data = state.schedule;
  const all = Object.entries((data && data.sports) || {}).flatMap(([sport, rows]) => SPORTS[sport] ? rows.map((row) => ({ ...row, sport })) : []);
  const shown = all.filter((m) => (state.filter === "all" || m.sport === state.filter) &&
    [m.team, m.opponent, m.tournament, m.venue].filter(Boolean).join(" ").toLowerCase().includes(state.search.toLowerCase().trim()));
  const rank = (m) => (m.sport !== "f1" && !modelled(m) ? 1 : 0);
  const by = (s) => shown.filter((m) => m.state === s).sort((a, b) => rank(a) - rank(b) || (a.start || "").localeCompare(b.start || ""));
  const live = by("in"), soon = by("pre"), done = by("post");
  const filters = h("div", { class: "row", role: "group", "aria-label": "Sport" },
    ["all", ...Object.keys(SPORTS)].map((key) => h("button", { class: "chip", type: "button", "aria-pressed": String(state.filter === key),
      onclick: () => { state.filter = key; state.limit = {}; renderMatches(); } }, key === "all" ? "All sports" : SPORTS[key])));
  const refresh = h("button", { class: "btn", type: "button", disabled: state.refreshing, onclick: refreshSchedule },
    state.refreshing ? "Checking..." : "Refresh");
  // Long lists are capped at 12 cards with a "show more" button, so the schedule stays scannable and the DOM small.
  const cards = (key, rows) => {
    const shown = state.limit[key] || PAGE, left = rows.length - shown;
    return [h("div", { class: "cards" }, rows.slice(0, shown).map((m, i) => card(m, i))),
      left > 0 ? h("button", { class: "btn world-more", type: "button", onclick: () => { state.limit[key] = shown + PAGE; renderMatches(); } }, `Show ${Math.min(PAGE, left)} more (${left} left)`) : null];
  };
  const section = (key, title, rows, empty) => h("section", { class: "section", "data-k": key },
    h("h2", {}, title, h("span", { class: "count" }, rows.length ? `${rows.length}` : "")),
    rows.length ? cards(key, rows) : h("p", { class: "note" }, empty));
  const search = h("input", { type: "search", class: "match-search", value: state.search, placeholder: "Search teams, leagues or venues", "aria-label": "Search teams, leagues or venues",
    oninput: (event) => { state.search = event.target.value; state.limit = {}; clearTimeout(state.searchTimer); state.searchTimer = setTimeout(renderMatches, 150); } });
  const heroStatsNodes = [["Live now", "in"], ["Coming up", "pre"], ["Finished", "post"]].map(([label, status]) => {
    const val = data ? all.filter((m) => m.state === status).length : null;
    const numNode = h("strong", { class: "num", "data-countup": val }, val != null ? String(val) : "—");
    return h("div", {}, h("span", {}, label), numNode);
  });
  showMorph(
    h("section", { class: "matchday-hero", "aria-label": "Matchday overview", "data-k": "hero" },
      h("div", { class: "hero-copy" }, h("p", { class: "eyebrow" }, "THE MATCHDAY EDIT"), h("h1", {}, "Every match.", h("br"), h("span", {}, "A clearer picture.")),
        h("p", {}, "Your daily view of live scores, upcoming fixtures and the numbers behind the game."),
        h("span", { class: "hero-date" }, new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" }))),
      h("div", { class: "hero-stats" }, heroStatsNodes)),
    h("div", { class: "head matches-heading" }, h("div", {}, h("p", { class: "eyebrow" }, "YOUR MATCH CENTRE"), h("h2", {}, "On the schedule"),
      h("p", { class: "sub" }, data && data.last_updated ? [freshnessChip(data.last_updated), " Open a match to explore its forecast."] : "Loading fixtures…")), refresh),
    h("div", { class: "filter-bar" }, filters, search),
    data && data.refresh_error ? h("p", { class: "note error" }, data.refresh_error) : null,
    data && (data.sources || []).filter((s) => s.error).map((s) => h("p", { class: "note warn" }, `${s.name}: ${s.error}`)),
    section("live", "Live now", live, state.search ? "No live matches match your search. Try another team or league." : "A quiet moment. No matches are in play for this sport right now."),
    section("soon", "Coming up", soon, state.search ? "No upcoming matches match your search." : "No upcoming fixtures for this selection in the next day."),
    done.length ? h("details", { class: "section more", "data-k": "done" }, h("summary", {}, `Finished today (${done.length})`), h("div", { style: "margin-top:10px" }, cards("done", done))) : null);
}

async function refreshSchedule() {
  if (state.refreshing) return;
  state.refreshing = true;
  if (!location.hash || location.hash === "#matches") renderMatches();
  try {
    state.schedule = await api("/api/refresh-today-matches", {});
    showBudgets(state.schedule.budget);
  } catch (error) {
    if (state.schedule) state.schedule.refresh_error = `${String(error.message).replace(/[.\s]*$/, ".")} Showing the last saved schedule. Try Refresh again in a moment.`;
  }
  state.refreshing = false;
  if (!location.hash || location.hash === "#matches") renderMatches();
}

// ---- match page -----------------------------------------------------------------------
function findMatch(id) {
  for (const [sport, rows] of Object.entries((state.schedule && state.schedule.sports) || {})) {
    const match = rows.find((row) => row.id === id);
    if (match) return { ...match, sport };
  }
  return null;
}

function stat(label, value, detail) {
  return h("div", { class: "stat" }, h("div", { class: "k" }, label),
    h("div", { class: "v" }, value), detail ? h("div", { class: "s" }, detail) : null);
}

function inningsStat(label, innings, detail) {
  return stat(label, `${innings.mean} runs`, detail || `80% range ${innings.low}–${innings.high} · ${innings.wickets ?? innings.wickets_lost} wickets`);
}

function playerPicker(rows, key, display) {
  if (!rows.length) return h("p", { class: "sub" }, "Named player projections are waiting for a usable lineup.");
  const names = rows.map((row) => row.name);
  const selected = names.includes(state.players[key]) ? state.players[key] : names[0];
  const metrics = h("div", { class: "player-forecast" }, display(rows[names.indexOf(selected)]));
  state.pickers[key] = { rows, names, display };      // read at event time, so the newest data is used after a patch
  const select = h("select", { onchange: (event) => {
    const picker = state.pickers[key];
    state.players[key] = event.target.value;
    event.target.closest(".players").querySelector(".player-forecast").replaceChildren(...picker.display(picker.rows[picker.names.indexOf(event.target.value)]));
  } }, names.map((name) => h("option", { value: name, selected: name === selected }, name)));
  return h("div", { class: "players", "data-key": key }, h("label", { class: "player-select" }, h("span", {}, "Player"), select), metrics);
}

function teamPanel(team, pre, index, id) {
  const order = pre.toss?.bats_first;
  const chasing = order != null && order !== index && team.chase;
  const innings = chasing ? team.chase : team.first_innings;
  const heading = chasing ? "Projected chase finish" : order == null ? "Projected total if batting first" : "Projected first innings";
  const roster = team.batters.filter((row) => !/^Player \d+$/.test(row.name)).map((bat) =>
    ({ name: bat.name, bat, bowl: team.bowlers.find((row) => row.name === bat.name) }));
  return h("article", { class: "panel team" },
    h("h3", {}, team.name),
    h("div", { class: "stats forecast-stats" },
      inningsStat(heading, innings),
      stat("Expected wickets taken", team.wickets_taken.toFixed(1)),
      order == null && team.chase ? inningsStat("Projected total if chasing", team.chase) : null),
    h("details", { class: "more", "data-key": `score-${index}` }, h("summary", {}, "Why this total"),
      h("ul", { class: "why" }, (team.reasons || []).map((reason) => h("li", {}, reason)),
        chasing || order == null && team.chase ? h("li", {}, "In each simulation, the chase ends when the target is reached, the overs run out, or the side is bowled out.") : null)),
    h("p", { class: "sub lineup" }, team.lineup_source || "Lineup details were unavailable when this forecast was saved."),
    playerPicker(roster, `${id}-pre-${index}`, ({ bat, bowl }) => [
      h("div", { class: "stats forecast-stats" }, stat("Expected runs", bat.runs.toFixed(1)),
        stat("Expected wickets", bowl ? bowl.wickets.toFixed(2) : "—")),
      (bat.reasons || bowl?.reasons) ? h("details", { class: "more", "data-key": `pre-player-${index}` },
        h("summary", {}, "Why this player projection"),
        h("ul", { class: "why" }, [...(bat.reasons || []), ...(bowl?.reasons || [])].map((reason) => h("li", {}, reason)))) : null,
    ].filter(Boolean)));
}

function matchScoreboard(board) {
  if (!board) return null;
  const title = board.state === "post" ? "Final score" : "Current score";
  const status = board.state === "in" ? "Live" : board.state === "post" ? "Finished" : "Upcoming";
  const winner = board.teams.find((team) => team.winner);
  return h("section", { class: "scoreboard", "aria-label": title },
    h("div", { class: "section-head" }, h("h2", {}, title), h("span", { class: `tag${board.state === 'in' ? ' live' : ''}` }, status)),
    h("div", { class: "score-sides" }, board.teams.map((team) => h("div", { class: "score-side" },
      h("span", {}, team.name), h("strong", { class: "num" }, team.score || (board.state === "pre" ? "Yet to start" : "—"))))),
    h("p", { class: "score-status" }, [winner && !board.status?.includes(winner.name) ? `${winner.name} won` : "", board.status, board.stale ? "Latest feed check failed" : "",
      board.checked_at ? `${board.source} checked at ${time(board.checked_at)}` : board.source].filter(Boolean).join(" · ")));
}

function winOutlook(teams, win, reasons) {
  const favourite = win[0] >= win[1] ? 0 : 1;
  const even = pct(win[0]) === pct(win[1]);
  const bar = h("div", { class: "probability-bar", "aria-hidden": "true" }, h("div", { style: `width:${(win[0] * 100).toFixed(1)}%` }));
  return h("div", { class: "outlook" },
    h("div", { class: "outlook-head" }, h("h3", {}, even ? "Too close to call" : `${teams[favourite].name} favoured to win`),
      h("span", { class: "tag" }, "Model forecast")),
    h("div", { class: "probabilities" }, teams.map((team, i) => h("div", {},
      h("strong", { class: "num" }, pct(win[i])), h("span", {}, team.name)))),
    bar,
    reasons.length ? h("ul", { class: "why" }, reasons.map((reason) => h("li", {}, reason))) : null);
}

function preMatchPanel(f, id) {
  const recorded = f.saved?.pre;
  const pre = recorded?.saved_before_start ? recorded : null;
  const start = f.fixture.start;
  const scheduleTime = Number.isFinite(Date.parse(start)) ? new Date(Date.parse(start) - 15 * 60000).toISOString() : "";
  const timeToStart = Date.parse(start) - Date.now();
  const beforeStart = f.scoreboard.state === "pre" && timeToStart > 0;
  const early = beforeStart && timeToStart > 15 * 60000;
  const displayed = pre || (beforeStart ? f : null);
  const caption = pre?.at_checkpoint ? `Saved at ${time(pre.saved_at)} and locked for this match.`
    : displayed && early ? `The pre-match forecast locks around ${time(scheduleTime)}.`
      : pre ? `Last forecast saved before play at ${time(pre.saved_at)}. The 15-minute checkpoint was missed.`
        : "The app has no saved forecast from before this match started.";
  return h("section", { class: "forecast-section", "aria-labelledby": "pre-title" },
    h("div", { class: "section-head" }, h("h2", { id: "pre-title" }, "Pre-match forecast"),
      h("span", { class: "tag" }, pre?.at_checkpoint ? "T−15 snapshot" : displayed && early ? "Early estimate" : pre ? "Saved forecast" : "Unavailable")),
    h("p", { class: "sub" }, caption),
    displayed ? h("div", { class: "panel forecast-overview" },
      winOutlook(displayed.teams, displayed.teams.map((team) => team.win),
        (displayed.teams[displayed.teams[1].win > displayed.teams[0].win ? 1 : 0].reasons || []).slice(0, 3)),
      displayed.toss ? h("p", { class: "sub" }, displayed.toss.text) :
        h("p", { class: "sub" }, displayed.toss === null ? "Toss pending at forecast time. The model weighs both batting orders equally." : ""),
      displayed.venue?.notes?.length ? h("details", { class: "more", "data-key": "pre-venue" }, h("summary", {}, "Ground history"),
        h("ul", { class: "why" }, displayed.venue.notes.map((reason) => h("li", {}, reason)))) : null) : null,
    displayed ? h("div", { class: "grid2" }, displayed.teams.map((team, i) => teamPanel(team, displayed, i, id))) : null);
}

function analysisPanel(f) {
  const a = f.analysis, bt = a.backtest;
  return h("details", { class: "panel more", "data-key": "cricket-model" },
    h("summary", {}, "Model and track record"),
    h("p", { class: "sub" }, a.data),
    h("p", { class: "sub" }, `${a.machine_learning.name}. ${a.machine_learning.detail}`),
    bt ? h("p", { class: "note", style: "margin-top:12px" },
      `Tested on ${bt.matches} matches the model had never seen (${bt.window[0]} to ${bt.window[1]}): it picked the winner ${pct((bt.blend ? bt.blend.blend : bt.winner).accuracy)} of the time${bt.blend ? ` (simulation alone: ${pct(bt.winner.accuracy)})` : ""}, ` +
      `its first-innings score was off by ${Math.round(bt.first_innings_mae.simulator)} runs on average (venue average: ${Math.round(bt.first_innings_mae.venue_average)}), ` +
      `its top-scorer pick was right ${pct(bt.top_scorer.simulator_pick)} of the time and its top wicket-taker pick ${pct(bt.top_wicket_taker.simulator_pick)}. ` +
      `Player picks are the least reliable numbers here.`) : null);
}

function livePanel(f, id) {
  const live = f.live;
  const board = f.scoreboard;
  const baseline = f.saved?.pre?.saved_before_start ? f.saved.pre : null;
  const timeline = f.saved?.timeline || [];
  const title = board.state === "post" ? "Live analysis recap" : "Live analysis";
  const heading = h("div", { class: "section-head" }, h("h2", {}, title),
    h("span", { class: `tag${board.state === 'in' ? ' live' : ''}` }, board.state === "in" ? "In play" : board.state === "post" ? "Finished" : "Awaiting play"));
  const history = timeline.length ? h("details", { class: "more", "data-key": "live-history" },
    h("summary", {}, `Over-by-over analysis (${timeline.length} ${timeline.length === 1 ? "update" : "updates"})`),
    h("p", { class: "sub" }, "Updates are captured while this match is open. The feed can skip score checkpoints."),
    h("ul", { class: "timeline" }, timeline.slice().reverse().map((entry) =>
      h("li", {}, h("time", { datetime: entry.at }, time(entry.at)), h("span", {},
        h("strong", {}, `Innings ${entry.position[0]} · ${entry.batting} ${entry.score}`),
        entry.projected == null ? null : ` · Projected ${entry.projected}`,
        entry.win_by_team ? ` · ${f.teams.map((team, i) => `${team.name} ${pct(entry.win_by_team[i])}`).join(' / ')}`
          : ` · ${pct(entry.win)} to win`,
        h("span", { class: "sub timeline-note" }, entry.note)))))) : null;
  if (!live) {
    const message = board.state === "pre" ? "The live model starts once the first innings score is available."
      : board.state === "post" ? (timeline.length ? "" : "No live forecast updates were captured for this match.")
        : f.live_unavailable || "Waiting for a current score with runs, wickets and overs.";
    return h("section", { class: "panel live-analysis" }, heading, message ? h("p", { class: "sub" }, message) : null, history);
  }

  const current = live.batting_index;
  const other = f.teams[1 - current].name;
  const difference = baseline ? Math.round(100 * (live.win[current] - baseline.teams[current].win)) : null;
  const reasons = [...live.changes];
  if (difference != null) {
    reasons.push(`${live.batting} ${difference === 0 ? 'are level with their saved pre-match win chance.' : `moved ${Math.abs(difference)} percentage points ${difference > 0 ? 'above' : 'below'} their saved pre-match win chance.`}`);
  }
  const scenarioCard = (row) => {
    const chances = f.teams.map((team, i) => h("div", {}, h("dt", {}, team.name), h("dd", { class: "num" }, pct(row.win[i]))));
    return h("div", { class: "scenario" }, h("h4", {}, row.label), h("dl", {}, chances));
  };
  const scenario = live.scenarios?.length ? h("div", { class: "live-scenarios" },
    h("h3", {}, "What could change the odds?"),
    h("p", { class: "sub" }, `Win chances if ${live.batting} reach these scores or lose these wickets by ${live.scenario_over} overs. Simulations that finish earlier use the final score.`),
    h("div", { class: "scenario-grid" }, live.scenarios.map(scenarioCard))) : null;
  const players = (live.players || []).filter((row) => !/^Player \d+$/.test(row.name));
  const picker = (team, i) => playerPicker(players.filter((row) => row.team === team.name), `${id}-live-${i}`, (row) => [
    h("div", { class: "stats forecast-stats" },
      row.final_runs == null ? stat("Final runs", row.runs ?? "—") : stat("Projected runs", row.final_runs.toFixed(1), `${row.runs} so far`),
      row.final_wickets == null ? stat("Final wickets", row.wickets ?? "—") : stat("Projected wickets", row.final_wickets.toFixed(2), `${row.wickets} so far`)),
  ]);
  return h("section", { class: "panel live-analysis" }, heading,
    h("p", { class: "sub" }, `${live.batting} · ${live.score}${live.target ? ` · Target ${live.target}` : ''}`),
    winOutlook(f.teams, live.win, reasons),
    h("div", { class: "stats forecast-stats" },
      inningsStat(`${live.batting} projected finish`, live.projected),
      live.chase ? inningsStat(`${other} projected chase`, live.chase) :
        live.first_innings ? inningsStat(`${other} first innings`, live.first_innings, `Actual score · ${live.first_innings.wickets} wickets`) : null),
    scenario,
    h("div", { class: "live-players" }, h("h3", {}, "Live player projections"),
      players.length ? h("div", { class: "grid2" }, f.teams.map((team, i) => h("div", {}, h("h4", {}, team.name), picker(team, i)))) :
        h("p", { class: "sub" }, "Waiting for a player scorecard that matches the innings score.")),
    history);
}

function resultPanel(result) {
  const lines = [];
  if (result.winner_pick) lines.push(h("li", { class: result.winner_pick.correct ? "good" : "bad" },
    `Winner: picked ${result.winner_pick.pick} at ${pct(result.winner_pick.probability)}. ${result.winner} won. ${result.winner_pick.correct ? "Correct." : "Wrong."}`));
  if (result.first_innings) lines.push(h("li", { class: result.first_innings.in_range ? "good" : "bad" },
    `First innings: ${result.first_innings.team} made ${result.first_innings.actual}; forecast ${result.first_innings.predicted} (range ${result.first_innings.low}-${result.first_innings.high}). ${result.first_innings.in_range ? "Inside the range." : "Outside the range."}`));
  if (result.ai_pick) lines.push(h("li", { class: result.ai_pick.correct ? "good" : "bad" },
    `With the AI check: ${result.ai_pick.pick} at ${pct(result.ai_pick.probability)} (${result.ai_pick.shift > 0 ? "+" : ""}${result.ai_pick.shift} points for the first-named side). ${result.ai_pick.correct ? "Correct." : "Wrong."}`));
  if (result.set_score) lines.push(h("li", { class: result.set_score.correct ? "good" : "bad" },
    `Set score: most likely was ${result.set_score.pick_winner} ${result.set_score.pick}; it finished ${result.set_score.actual}. ${result.set_score.correct ? "Correct." : "Missed."}`));
  for (const pick of result.picks || []) lines.push(h("li", { class: pick.correct ? "good" : "bad" },
    `${pick.team} ${pick.kind === "top_batter" ? "top scorer" : "top wicket-taker"}: picked ${pick.pick}; actual ${pick.actual.join(", ")} (${pick.value}). ${pick.correct ? "Correct." : pick.in_top3 ? "In our top three." : "Missed."}`));
  return h("section", { class: "panel" }, h("h2", {}, "How the forecast did"),
    result.saved_before_start ? null : h("p", { class: "note warn" }, "This forecast was first made after the match started, so it does not count toward the track record."),
    h("ul", { class: "why" }, lines.length ? lines : h("li", {}, result.status || "Result not available yet.")));
}

// The win chance in force: the model's number, moved by the AI check for this stage when there is one.
function nowWin(f) { return f.ai ? f.ai.win : (f.live ? f.live.win : f.teams.map((t) => t.win)); }
function winCaption(f, plain) { return f.ai && f.ai.check ? (f.ai.check.shift ? "model + AI check" : "model, AI check agrees") : plain; }
const aiKey = (id, f) => `${id}|${f.ai ? f.ai.checkpoint : ""}`;

async function askAi(id, sport, f) {
  const key = aiKey(id, f);
  if (state.aiBusy) return;
  state.aiBusy = id;
  state.aiTried[key] = true;
  delete state.aiError[id];
  const box = document.getElementById("ai-box");
  if (box) box.replaceChildren(h("p", { class: "note" }, h("span", { class: "spinner" }), "Asking the AI to check the latest numbers and score. This takes up to a minute."));
  let result;
  try {
    result = await api("/api/ai-check", { match_id: id, sport });
    showBudgets(result.budget);
  } catch (error) { state.aiError[id] = error.message; }
  state.aiBusy = null;
  if (location.hash === `#match/${encodeURIComponent(id)}`) {
    const panel = document.getElementById("ai-box")?.closest("section");
    if (panel?.dataset.checkpoint === f.ai.checkpoint && (!result || result.ai.checkpoint === f.ai.checkpoint)) {
      panel.replaceWith(aiPanel({ ...f, ai: result?.ai || f.ai }, id, sport));
    }
    state.autoRefreshed = true;
    openMatch(id, true);
  }
}

function aiPanel(f, id, sport) {
  const ai = f.ai;
  if (!ai) return null;
  const names = f.teams.map((t) => t.name), check = ai.check, old = ai.earlier;
  const body = [];
  const describe = (c) => [
    c.headline ? h("p", { class: "headline" }, c.headline) : null,
    h("ul", { class: "why" }, (c.reasons || []).map((r) => h("li", {}, r)), c.watch ? h("li", {}, `Watch: ${c.watch}`) : null)];
  if (check) {
    const moved = check.shift ? `The AI check moves ${names[0]} from ${pct(ai.model_win[0])} to ${pct(ai.win[0])} (${check.shift > 0 ? "+" : ""}${check.shift} points).`
      : `The AI check agrees with the model: ${names[0]} ${pct(ai.model_win[0])}, no change.`;
    body.push(...describe(check), h("p", { class: "note", style: "margin-top:10px" }, moved),
      h("p", { class: "sub" }, `Checked by ${check.model} at ${time(check.at)}${check.score ? `, with the score at ${check.score}` : ""}.`));
  } else {
    if (state.aiBusy === id) body.push(h("p", { class: "note" }, h("span", { class: "spinner" }), "Asking the AI to check the latest numbers and score. This takes up to a minute."));
    else if (state.aiError[id]) body.push(h("p", { class: "note error" }, state.aiError[id]));
    else if (ai.note) body.push(h("p", { class: "note" }, ai.note));
    else if (sport === "cricket") body.push(h("p", { class: "note" }, "Request a second opinion on the current match forecast."));
    else if (!ai.due) body.push(h("p", { class: "note" }, `AI checks start by themselves ${ai.checkpoint && ai.checkpoint.startsWith("live") ? "at the next stage of the match" : "45 minutes before the start"}. You can also ask now.`));
    if (ai.can_ask && state.aiBusy !== id) body.push(h("button", { class: "btn", type: "button", style: "margin-top:10px", onclick: () => askAi(id, sport, f) },
      `Ask the AI now (${ai.requests_left} requests left today)`));
    if (old) body.push(h("h3", { style: "margin-top:14px" }, `Earlier check${old.score ? ` at ${old.score}` : ""} (${time(old.at)})`), ...describe(old));
  }
  return h("section", { class: "panel ai", "data-checkpoint": ai.checkpoint || "" }, h("h2", {}, "AI check"),
    h("div", { id: "ai-box" }, body),
    h("p", { class: "sub", style: "margin-top:10px" }, `The model's numbers come first. At each stage (before the toss or start, then as the score moves) a free AI model reads those numbers and the live score and may move the win chance by at most ${ai.max_shift} points, with reasons. ${ai.used} of ${ai.limit} checks used for this match. Its picks are graded in Track record.`));
}

function winPanel(f, title) {
  const [a, b] = f.teams, win = f.live ? [a.win, b.win] : nowWin(f);
  const barA = h("div", { class: "a", style: `width:${(win[0] * 100).toFixed(1)}%` });
  const barB = h("div", { class: "b", style: `width:${(win[1] * 100).toFixed(1)}%` });
  return h("section", { class: "panel" },
    h("h2", {}, title),
    h("div", { class: "winbar", role: "img", "aria-label": `${a.name} ${pct(win[0])}, ${b.name} ${100 - Math.round(win[0] * 100)}%` },
      barA, barB),
    h("div", { class: "winlabels" }, h("span", { class: "num" }, `${a.name} ${pct(win[0])}`), h("span", { class: "num" }, `${b.name} ${100 - Math.round(win[0] * 100)}%`)),
    !f.live && f.ai && f.ai.check && f.ai.check.shift ? h("p", { class: "sub" }, `Model alone: ${a.name} ${pct(f.ai.model_win[0])}. The AI check moved it ${f.ai.check.shift > 0 ? "+" : ""}${f.ai.check.shift} points.`) : null,
    a.win_model != null ? h("p", { class: "sub" }, `Corrected from past results: the model alone said ${a.name} ${pct(a.win_model)}. Across ${f.calibration.graded} graded forecasts its favourites were given ${pct(f.calibration.favourite_expected)} on average and won ${pct(f.calibration.favourite_won)}, so its chances are ${f.calibration.factor < 1 ? "pulled toward" : "pushed away from"} 50%.`) : null,
    a.win_parts ? h("p", { class: "sub" }, `What goes into the model's number: player-by-player simulation ${pct(a.win_parts.simulation)} for ${a.name}, team results rating ${pct(a.win_parts.rating)}.`) : null);
}

// ---- tennis match page ----------------------------------------------------------------
function setRows(rows) {
  return rows.map((row) => {
    const fill = h("div", { class: "fill", style: `width:${Math.round(row.chance * 100)}%` });
    return h("div", { class: "setrow" },
      h("span", {}, `${row.winner} ${row.score.split("-").sort().reverse().join("-")}`),
      h("div", { class: "track" }, fill),
      h("span", { class: "num" }, pct(row.chance)));
  });
}

function tennisPlayer(t) {
  const r = t.rating;
  return h("section", { class: "panel team" },
    h("h2", {}, t.name),
    h("p", { class: "sub" }, t.found ? `${r.matches} matches on record${t.last_played ? ` · last recorded week ${day(t.last_played)}` : ""}` : "Not in the results archive"),
    h("div", { class: "stats" },
      h("div", { class: "stat" }, h("div", { class: "k" }, "Rating"), h("div", { class: "v" }, r.blended), h("div", { class: "s" }, r.overall == null ? "from ranking" : `overall ${r.overall} · surface ${r.surface}`)),
      h("div", { class: "stat" }, h("div", { class: "k" }, "Holds serve"), h("div", { class: "v" }, pct(t.hold)), h("div", { class: "s" }, `wins ${pct(t.serve_points_won)} of serve points`)),
      h("div", { class: "stat" }, h("div", { class: "k" }, "Wins first set"), h("div", { class: "v" }, pct(t.first_set)), h("div", { class: "s" }, "before the match"))),
    h("h3", {}, "Why"),
    h("ul", { class: "why" }, t.reasons.map((x) => h("li", {}, x))),
    t.recent.length ? h("details", { class: "more" }, h("summary", {}, "Recent recorded matches"),
      h("ul", { class: "why" }, t.recent.map((m) => h("li", {}, `${day(m.date)} · ${m.won ? "beat" : "lost to"} ${m.opponent} ${m.score} · ${m.event} (${m.surface})`)))) : null);
}

function tennisLive(f) {
  const live = f.live, timeline = (f.saved && f.saved.timeline) || [], names = f.teams.map((t) => t.name), win = nowWin(f);
  return h("section", { class: "panel live" },
    h("h2", {}, h("span", { class: "tag live" }, "Live"), ` ${live.score}`),
    h("div", { class: "stats" },
      h("div", { class: "stat" }, h("div", { class: "k" }, `${names[0]} win chance`), h("div", { class: "v" }, pct(win[0])), h("div", { class: "s" }, winCaption(f, "right now"))),
      h("div", { class: "stat" }, h("div", { class: "k" }, `${names[1]} win chance`), h("div", { class: "v" }, `${100 - Math.round(win[0] * 100)}%`), h("div", { class: "s" }, `sets ${live.sets[0]}-${live.sets[1]}`)),
      h("div", { class: "stat" }, h("div", { class: "k" }, `Set ${live.set_number}`), h("div", { class: "v" }, `${live.games[0]}-${live.games[1]}`), h("div", { class: "s" }, `${names[0]} wins it ${pct(live.current_set)}`))),
    h("h3", {}, "What has changed"),
    h("ul", { class: "why" }, live.changes.map((c) => h("li", {}, c))),
    h("h3", {}, "Likely finish from here"), setRows(live.set_scores),
    timeline.length > 1 ? h("ul", { class: "timeline" }, timeline.slice().reverse().slice(0, 12).map((t) =>
      h("li", {}, h("time", {}, time(t.at)), h("span", {}, `${t.score}. ${t.note}`)))) : null);
}

function renderTennis(f, id) {
  const [a, b] = f.teams, fx = f.fixture, bt = f.analysis.backtest;
  showMorph(
    h("a", { class: "back", href: "#matches" }, "← All matches"),
    h("div", { class: "head" },
      h("div", {}, h("h1", {}, `${a.name} v ${b.name}`),
        h("p", { class: "sub" }, [fx.tournament, fx.detail, f.format, `${f.surface.name} court`, `${day(fx.start)} ${time(fx.start)}`, f.intel.state === "pre" ? countdown(fx.start) : f.intel.status].filter(Boolean).join(" · "))),
      h("button", { id: "refresh-match", class: "btn primary", type: "button", onclick: () => openMatch(id, true, true) }, "Refresh now")),
    h("p", { id: "match-refresh-error", class: "note", hidden: true }),
    f.intel.available ? null : h("p", { class: "note warn" }, "The live score feed could not be read just now, so this is the pre-match forecast."),
    f.result ? resultPanel(f.result) : null,
    f.live ? tennisLive(f) : null,
    winPanel(f, f.live ? "Pre-match win chance" : "Win chance"),
    aiPanel(f, id, "tennis"),
    h("section", { class: "panel" }, h("h2", {}, "Why this forecast"),
      h("ul", { class: "why" }, f.notes.map((n) => h("li", {}, n)), h("li", {}, f.surface.note)),
      f.h2h.last.length ? h("details", { class: "more", style: "margin-top:8px" }, h("summary", {}, "Their recorded meetings"),
        h("ul", { class: "why" }, f.h2h.last.map((m) => h("li", {}, `${day(m.date)} · ${m.winner} won ${m.score} · ${m.event} (${m.surface})`)))) : null),
    h("section", { class: "panel" }, h("h2", {}, "Set score chances (before the match)"), setRows(f.set_scores),
      h("div", { class: "stats", style: "margin-top:12px" },
        h("div", { class: "stat" }, h("div", { class: "k" }, "Goes to a deciding set"), h("div", { class: "v" }, pct(f.deciding_set)), h("div", { class: "s" }, f.format.toLowerCase())),
        h("div", { class: "stat" }, h("div", { class: "k" }, "Expected games"), h("div", { class: "v" }, f.expected_games.toFixed(1)), h("div", { class: "s" }, "a tiebreak counts as one")))),
    h("div", { class: "grid2" }, tennisPlayer(a), tennisPlayer(b)),
    h("section", { class: "panel" }, h("h2", {}, "How this match was analysed"),
      h("ul", { class: "why" }, h("li", {}, `Data: ${f.analysis.data}`), h("li", {}, `${f.analysis.machine_learning.name}. ${f.analysis.machine_learning.detail}`),
        h("li", {}, `Deep learning: ${f.analysis.deep_learning.detail}`)),
      bt ? h("p", { class: "note", style: "margin-top:12px" },
        `Tested on ${bt.matches} tour-level ${f.tour} matches the ratings had never seen (${bt.window[0]} to ${bt.window[1]}): they picked the winner ${pct(bt.accuracy)} of the time. Simply picking the better-ranked player was right ${pct(bt.better_ranked_wins)} of the time.`) : null));
}

function renderForecast(f, id) {
  const fx = f.fixture;
  const supported = f.supported;
  const start = fx.start ? `${day(fx.start)} · ${time(fx.start)}` : "";
  const preMatchPart = supported ? preMatchPanel(f, id) : h("section", { class: "panel" }, h("h2", {}, "Forecast unavailable"), h("p", { class: "sub" }, f.reason));
  const livePart = supported ? livePanel(f, id) : h("section", { class: "panel" }, h("h2", {}, "Live analysis"), h("p", { class: "sub" }, f.reason));
  showMorph(
    h("a", { class: "back", href: "#matches" }, "← All matches"),
    h("div", { class: "head" },
      h("div", {}, h("h1", {}, `${fx.team} vs ${fx.opponent}`),
        h("p", { class: "sub" }, [fx.tournament, supported ? `${f.category}’s ${f.format}` : fx.detail,
          fx.venue, start].filter(Boolean).join(" · "))),
      h("button", { id: "refresh-match", class: "btn primary", type: "button", onclick: () => openMatch(id, true, true) }, "Refresh now")),
    h("p", { id: "match-refresh-error", class: "note warn", hidden: true }),
    matchScoreboard(f.scoreboard),
    // While a match is in play the live win chance is what the reader came for, so it comes first.
    ...(f.scoreboard.state === "in" ? [livePart, preMatchPart] : [preMatchPart, livePart]),
    f.result && f.result.saved_before_start ? resultPanel(f.result) : null,
    supported && f.ai ? aiPanel(f, id, "cricket") : null,
    supported ? analysisPanel(f) : null);
}

async function openMatch(id, manual, forceRefresh = false) {
  if (state.matchLoading === id) return;
  state.matchLoading = id;
  clearTimeout(state.timer);
  const request = ++state.request;
  const isCurrent = () => request === state.request && location.hash === `#match/${encodeURIComponent(id)}`;
  const match = findMatch(id);
  if (!manual) {
    show(h("a", { class: "back", href: "#matches" }, "← All matches"),
      h("h1", {}, match ? `${match.team}${match.opponent ? " v " + match.opponent : ""}` : "Match"),
      match?.sport === "cricket" ? matchScoreboard({ state: match.state, status: match.status, source: "Fixture scoreboard",
        checked_at: state.schedule?.last_updated, teams: [{ name: match.team, score: match.team_score },
          { name: match.opponent, score: match.opponent_score }] }) : null,
      h("p", { class: "note", style: "margin-top:14px" }, h("span", { class: "spinner" }), match && match.sport === "tennis"
        ? "Reading the live score and rating both players from every recorded match. The first tennis forecast after a restart takes a few seconds."
        : "Gathering the toss, playing XIs and venue, then simulating the match 3,000 times. The first forecast of the day takes up to a minute while the model is fitted."));
  }
  const sport = id.startsWith("tennis-") ? "tennis" : "cricket";
  if (match && match.sport === "f1") {
    state.matchLoading = null;
    return renderF1();
  }
  const refreshButton = document.getElementById("refresh-match");
  if (refreshButton) { refreshButton.disabled = true; refreshButton.textContent = "Refreshing…"; }
  const refreshStatus = document.getElementById("match-refresh-error");
  if (refreshStatus) { refreshStatus.hidden = false; refreshStatus.className = "note"; refreshStatus.textContent = "Checking the latest score and forecast…"; }
  try {
    const forecast = await api(`/api/${sport}-forecast`, { match_id: id, refresh: forceRefresh, live: state.liveMatch === id });
    if (!isCurrent()) return;
    showBudgets(forecast.budget);
    if (!forecast.supported && sport === "tennis") {
      show(h("a", { class: "back", href: "#matches" }, "← All matches"),
        h("h1", {}, match ? `${match.team} v ${match.opponent}` : "Match"), h("p", { class: "note warn", style: "margin-top:14px" }, forecast.reason));
      return;
    }
    forecast.has_feed = sport === "tennis" ? true : forecast.has_feed;
    const open = [...view.querySelectorAll("details")].map((d, i) => d.open ? d.dataset.key || i : null);
    const focused = view.contains(document.activeElement) ? document.activeElement : null;
    const focusKey = focused?.closest("[data-key]")?.dataset.key;
    const scroll = window.scrollY;
    (sport === "tennis" ? renderTennis : renderForecast)(forecast, id);
    const statusMessage = document.getElementById("match-refresh-error");
    if (statusMessage) {
      statusMessage.hidden = false;
      const feedAt = forecast.scoreboard?.checked_at;
      const live = (forecast.intel?.state || forecast.scoreboard?.state) === "in";
      const feedAge = feedAt ? Math.round((Date.now() - Date.parse(feedAt)) / 60000) : null;
      const behind = live && feedAge != null && feedAge > 5;
      statusMessage.className = forecast.refresh_error || behind ? "note warn" : "note";
      statusMessage.textContent = forecast.refresh_error ? `${forecast.refresh_error} It retries by itself every minute, or press Refresh now.`
        : `Updated at ${new Date().toLocaleTimeString()}.${feedAge != null ? ` Live feed last checked ${feedAge < 2 ? "just now" : feedAge + " min ago"}${behind ? ", so the score may be behind" : ""}.` : ""} Scores and predictions stay the same until the feed reports a change.`;
    }
    if (forecast.ai && forecast.ai.due && sport === "tennis" && !state.aiBusy && !state.aiTried[aiKey(id, forecast)]) askAi(id, sport, forecast);
    if (manual || state.autoRefreshed) {
      view.querySelectorAll("details").forEach((d, i) => { d.open = open.includes(d.dataset.key || i); });
      if (focused?.id) document.getElementById(focused.id)?.focus({ preventScroll: true });
      else if (focusKey) {
        const match = [...view.querySelectorAll("[data-key]")].find((node) => node.dataset.key === focusKey);
        match?.querySelector(focused.tagName.toLowerCase())?.focus({ preventScroll: true });
      }
      window.scrollTo(0, scroll);
    }
    const board = forecast.scoreboard;
    const scoreLine = sport === "tennis" ? (forecast.live ? `Score ${forecast.live.score}` : "")
      : board ? board.teams.map((team) => `${team.name} ${team.score || ""}`.trim()).join(", ") : "";
    state.lastScore = state.lastScore || {};
    if (scoreLine && state.lastScore[id] && state.lastScore[id] !== scoreLine) announce(`Score update. ${scoreLine}`);
    state.lastScore[id] = scoreLine;
    const startsIn = Date.parse(forecast.fixture.start) - Date.now();
    const status = forecast.intel?.state || forecast.scoreboard?.state;
    state.liveMatch = status === "in" ? id : null;
    if (status === "in" || status === "pre" && (sport === "cricket" || startsIn < 75 * 60000)) {
      const delay = sport === "cricket" && status === "in" ? 12000 : 60000;
      if (forecast.has_feed || sport === "cricket") {
        state.timer = setTimeout(async () => {
          if (sport === "cricket" && !forecast.has_feed) await refreshSchedule();
          if (!isCurrent()) return;
          state.autoRefreshed = true;
          openMatch(id, true);
        }, sport === "cricket" && !forecast.has_feed ? 5 * 60000 : delay);
      }
    }
  } catch (error) {
    if (!isCurrent()) return;
    const refreshError = document.getElementById("match-refresh-error");
    if (refreshError) {
      refreshError.hidden = false;
      refreshError.className = "note warn";
      refreshError.textContent = `Could not refresh the match. Showing the last available update. ${error.message}`;
      announce(refreshError.textContent);
      state.timer = setTimeout(() => { if (isCurrent()) openMatch(id, true); }, 60000);
      return;
    }
    show(h("a", { class: "back", href: "#matches" }, "← All matches"), h("p", { class: "note error", style: "margin-top:14px" }, error.message),
      h("button", { class: "btn", type: "button", style: "margin-top:12px", onclick: () => openMatch(id) }, "Try again"));
  } finally {
    if (state.matchLoading === id) state.matchLoading = null;
    if (isCurrent()) {
      const button = document.getElementById("refresh-match");
      if (button) { button.disabled = false; button.textContent = "Refresh now"; }
    }
  }
}

// ---- track record and settings --------------------------------------------------------
async function renderRecord() {
  const request = ++state.request;
  show(h("h1", {}, "Track record"), h("p", { class: "note", role: "status" }, "Grading finished events…"));
  try {
    const { summary, sports } = await api("/api/track-record");
    if (request !== state.request) return;
    const rate = (record) => record.n ? `${record.correct} of ${record.n}` : "—";
    // Wilson 95% interval: with a handful of graded forecasts the honest answer is a wide range, not one number.
    const spread = (record) => {
      if (!record.n) return "none graded yet";
      const z = 1.96, p = record.correct / record.n, d = 1 + z * z / record.n, c = p + z * z / (2 * record.n);
      const m = z * Math.sqrt(p * (1 - p) / record.n + z * z / (4 * record.n * record.n));
      return `${pct(record.correct / record.n)} · 95% range ${pct(Math.max(0, (c - m) / d))} to ${pct(Math.min(1, (c + m) / d))} · n = ${record.n}`;
    };
    const counted = (summary) => summary.graded + summary.waiting;
    const detail = h("section", { id: "sport-record", "aria-labelledby": "sport-record-title" });
    const filters = h("div", { class: "row record-filters", role: "group", "aria-label": "Sport" });
    function select(sport) {
      const { summary: stats, matches } = sports[sport];
      for (const button of filters.children) button.setAttribute("aria-pressed", String(button.value === sport));
      const calibration = summary.calibration[sport];
      const metrics = [stat("Winner picked", rate(stats.winner), `${spread(stats.winner)} · ${stats.waiting} waiting`)];
      if (sport !== "f1") metrics.push(stat("Winner with AI check", rate(stats.ai_winner), spread(stats.ai_winner)));
      if (sport === "tennis") metrics.push(stat("Exact set score", rate(stats.set_score), spread(stats.set_score)));
      if (sport === "cricket") metrics.push(
        stat("First-innings error", stats.first_innings.mean_error == null ? "—" : `${stats.first_innings.mean_error} runs`,
          `n = ${stats.first_innings.n} · ${stats.first_innings.in_range} inside the range`),
        stat("Top batter", rate(stats.top_batter), spread(stats.top_batter)), stat("Top wicket-taker", rate(stats.top_bowler), spread(stats.top_bowler)));
      const table = h("div", { class: "scroll" }, h("table", {},
        h("thead", {}, h("tr", {}, ["Event", "Forecast", "Saved", "Result"].map((label) => h("th", { scope: "col" }, label)))),
        h("tbody", {}, matches.map((match) => {
          const result = match.result;
          const favourite = match.teams.reduce((first, next) => next.win > first.win ? next : first);
          const title = [match.fixture.team, match.fixture.opponent].filter(Boolean).join(" v ");
          const stage = ({ post_toss: "After toss", pre_toss: "Before toss", post_qualifying: "After qualifying", pre_weekend: "Before race weekend" })[match.stage];
          return h("tr", {},
            h("td", {}, h("a", { href: sport === "f1" ? `/lab?sport=f1&season=${match.fixture.season}&round=${match.fixture.round}`
              : `#match/${encodeURIComponent(match.id)}` }, title), h("div", { class: "sub" }, day(match.fixture.start))),
            h("td", {}, `${favourite.name} ${pct(favourite.win)}`),
            h("td", {}, time(match.saved_at), stage ? h("div", { class: "sub" }, stage) : null,
              match.saved_before_start ? null : h("div", { class: "sub" }, "Opened after start · not counted")),
            h("td", {}, !result ? "Waiting for result" : !result.winner_pick ? (result.status || "No winner") :
              h("span", { class: result.winner_pick.correct ? "good" : "bad" }, `${result.winner} won · ${result.winner_pick.correct ? "Correct" : "Missed"}`),
              result?.first_innings ? h("div", { class: "sub" }, `First innings ${result.first_innings.actual} vs forecast ${result.first_innings.predicted}`) : null,
              result?.set_score ? h("div", { class: "sub" }, `Sets ${result.set_score.actual} vs forecast ${result.set_score.pick}`) : null));
        }))));
      detail.replaceChildren(
        h("h2", { id: "sport-record-title" }, SPORTS[sport]),
        h("div", { class: "stats record-stats" }, metrics),
        h("p", { class: "sub" }, `${counted(stats)} forecasts counted (saved before the start), ${stats.graded} graded. ${stats.saved - counted(stats)} more were opened after the start and are not counted.`),
        calibration ? h("p", { class: "sub" }, calibration.graded < calibration.needed
          ? `Not calibrated yet: that needs ${calibration.needed} graded forecasts and ${calibration.graded} are available, so the win chances shown are the model's own.`
          : `Favourites won ${pct(calibration.favourite_won)} of ${calibration.graded} graded forecasts (n = ${calibration.graded}). Their average predicted chance was ${pct(calibration.favourite_expected)}.`) : null,
        h("section", { class: "panel" }, h("h3", {}, "Saved forecasts"),
          matches.length ? table : h("p", { class: "note" }, sport === "f1"
            ? "Run a Formula 1 forecast before the race to start tracking it."
            : `Open a ${SPORTS[sport].toLowerCase()} match before the start to save its forecast.`),
          sport === "f1" ? h("p", { class: "sub" }, h("a", { href: "/lab?sport=f1" }, "Open the race forecast")) : null));
    }
    for (const [sport, label] of Object.entries(SPORTS)) {
      filters.append(h("button", { class: "chip", type: "button", value: sport, "aria-controls": "sport-record",
        onclick: () => { state.recordSport = sport; select(sport); } }, `${label} · ${counted(sports[sport].summary)} counted`));
    }
    const totals = Object.values(sports).reduce((acc, s) => ({ counted: acc.counted + counted(s.summary), graded: acc.graded + s.summary.graded, after: acc.after + (s.summary.saved - counted(s.summary)) }), { counted: 0, graded: 0, after: 0 });
    const recordHero = h("section", { class: "record-hero", "aria-label": "Track record overview" },
      h("div", { class: "record-hero-copy" },
        h("p", { class: "eyebrow" }, "TRACK RECORD"),
        h("h1", {}, "What the model said,", h("br"), h("span", {}, "and how it did.")),
        h("p", {}, "A forecast counts only if it was saved before the event began. Results are graded from final scores, and every rate shows how many forecasts it rests on."),
        h("span", { class: "hero-date" }, "Forecasts opened after the start are listed, never counted.")),
      h("div", { class: "record-hero-stat" },
        h("span", {}, "Forecasts counted"),
        h("strong", { class: "num" }, `${totals.counted}`),
        h("p", { class: "sub" }, `${totals.graded} graded so far · ${totals.after} opened after the start and excluded`)));
    show(recordHero, filters, detail);
    select(state.recordSport || "cricket");
  } catch (error) {
    if (request === state.request) show(h("h1", {}, "Track record"), h("p", { class: "note error", role: "alert" }, error.message));
  }
}

function renderSettings() {
  const hasKey = Boolean(state.keyStatus) && state.keyStatus !== "missing";
  const input = h("input", { type: "password", autocomplete: "off", "aria-label": "OpenRouter API key", placeholder: "Paste your OpenRouter key" });
  const message = h("p", { class: "sub", style: "margin-top:8px" }, hasKey ? "A key is saved on this computer." : "No key saved yet.");
  const send = async (action) => {
    try {
      const out = await api("/api/openrouter-key", action === "save" ? { action, key: input.value } : { action });
      state.keyStatus = out.openrouter_key_status;
      input.value = "";
      message.textContent = action === "save" ? "Key saved on this computer." : "Key removed.";
    } catch (error) { message.textContent = error.message; }
  };
  const b = state.schedule && state.schedule.budget;
  show(h("h1", {}, "Settings"),
    h("section", { class: "panel appearance-settings", "aria-labelledby": "appearance-title" },
      h("h2", { id: "appearance-title" }, "Appearance"),
      h("p", { class: "sub", id: "theme-help" }, "Choose a theme for MatchLab. Your choice is saved in this browser."),
      h("label", { class: "palette-control", for: "palette" }, "Theme",
        h("select", { id: "palette", "aria-label": "Color palette", "aria-describedby": "theme-help", onchange: (event) => changeTheme(event.target.value) },
          Object.entries(THEMES).map(([value, label]) => h("option", { value, selected: state.theme === value }, label))))),
    h("section", { class: "panel" }, h("h2", {}, "Request budgets"),
      h("ul", { class: "why" },
        h("li", {}, `CricketData.org: ${b ? `${b.cricketdata.used} of ${b.cricketdata.limit} used today` : "unknown"}. Only the fixture list uses it, cached for 15 minutes (longer as the budget runs down), and 5 requests are always held back.`),
        h("li", {}, `OpenRouter: ${b ? `${b.openrouter.used} of ${b.openrouter.limit} used today` : "unknown"}. Used for AI checks: one request per match and stage (before the toss or start, after the toss, then a few times as the score moves), at most 12 per match, saved so nothing is asked twice. Checks start by themselves 45 minutes before a match you have open.`),
        h("li", {}, "The toss, playing XIs and live scores come from ESPN's free feed and cost nothing, so the half hour before a match is never rationed."),
        h("li", {}, "Daily limits can be edited in data/local/api_budget.json if your plan differs."))),
    h("section", { class: "panel" }, h("h2", {}, "OpenRouter key (optional)"),
      h("div", { class: "row" }, input, h("button", { class: "btn primary", type: "button", onclick: () => send("save") }, "Save key"),
        h("button", { class: "btn", type: "button", onclick: () => send("clear") }, "Remove key")), message));
}

function f1LapPanel(season, last, next, request) {
  const byRound = new Map();
  for (const race of [...season, last, next]) if (race?.season && race?.round) byRound.set(`${race.season}/${race.round}`, race);
  const choices = [...byRound.values()].sort((a, b) => a.date.localeCompare(b.date));
  const panel = h("section", { class: "panel", "aria-labelledby": "f1-lap-title" },
    h("h2", { id: "f1-lap-title" }, "Lap-by-lap analysis"));
  if (!choices.length) {
    panel.append(h("p", { class: "note" }, "Waiting for a published race schedule."));
    return panel;
  }
  const key = (race) => `${race.season}/${race.round}`;
  const start = (race) => Date.parse(`${race.date}T${race.time || "00:00:00Z"}`);
  const preferred = next && start(next) <= Date.now() ? next : last || next;
  // Every race of the season, split into what has been run (newest first) and what is still to come.
  const started = choices.filter((race) => start(race) <= Date.now()).reverse();
  const upcoming = choices.filter((race) => start(race) > Date.now());
  const label = (race) => `Round ${race.round} · ${race.raceName} · ${new Date(`${race.date}T12:00:00Z`).toLocaleDateString([], { day: "numeric", month: "short", timeZone: "UTC" })}`;
  const group = (title, races) => races.length ? h("optgroup", { label: title }, races.map((race) => h("option", { value: key(race) }, label(race)))) : null;
  const select = h("select", { id: "f1-lap-race" }, group(`Completed or under way (${started.length})`, started), group(`Upcoming (${upcoming.length})`, upcoming));
  select.value = key(preferred);
  const status = h("p", { class: "note" });
  const rows = h("div", { class: "scroll lap-table", tabindex: "0", role: "region", "aria-label": "Lap timing" });
  const refresh = h("button", { class: "btn", type: "button", onclick: load }, "Refresh laps");
  let captured = new Map(), generation = 0;

  async function load() {
    clearTimeout(state.timer);
    const selected = choices.find((race) => key(race) === select.value);
    const current = ++generation;
    const active = () => request === state.request && current === generation;
    refresh.disabled = true;
    if (!captured.size) status.textContent = "Loading lap timing…";
    try {
      const result = await api(`/api/f1-timing?season=${selected.season}&round=${selected.round}`);
      if (!active()) return;
      if (result.state === "post") captured.clear();
      for (const lap of result.laps) captured.set(lap.lap, lap);
      const laps = [...captured.values()].sort((a, b) => b.lap - a.lap);
      const recorded = result.state === "post";
      status.textContent = laps.length
        ? recorded ? "Recorded timings from Jolpica F1." : "Live race order from ESPN. Updates are captured while this page is open."
        : result.state === "pre" ? "Lap updates start when race timing is available."
          : "Lap timing hasn’t been published for this race yet.";
      const lapRows = laps.map((lap) => {
        const prior = captured.get(lap.lap - 1);
        const moves = prior ? lap.order.filter((driver) => Object.hasOwn(prior.positions, driver))
          .map((driver) => ({ driver, gain: prior.positions[driver] - lap.positions[driver] }))
          .sort((a, b) => b.gain - a.gain) : [];
        const gain = moves[0];
        const changes = [
          prior?.order[0] && prior.order[0] !== lap.order[0] ? `${lap.order[0]} took the lead` : "",
          gain?.gain > 0 ? `${gain.driver} gained ${gain.gain} place${gain.gain === 1 ? "" : "s"}` : "",
        ].filter(Boolean);
        return h("tr", {}, h("td", {}, lap.lap), h("td", {}, lap.order[0]),
          h("td", {}, lap.fastest ? `${lap.fastest.driver} · ${lap.fastest.time}` : "—"),
          h("td", {}, changes.join(" · ") || (prior ? "—" : "No previous lap captured")));
      });
      const header = ["Lap", "Leader", "Fastest on lap", "Race movement"].map((label) => h("th", { scope: "col" }, label));
      rows.replaceChildren(...(laps.length ? [h("table", {}, h("thead", {}, h("tr", {}, header)), h("tbody", {}, lapRows))] : []));
      if (result.state === "in" || result.state === "pre" && start(selected) - Date.now() <= 60 * 60000) {
        state.timer = setTimeout(load, 25000);
      }
    } catch (error) {
      if (!active()) return;
      status.textContent = captured.size ? "Could not refresh timing. Showing the last captured laps." : error.message;
      if (Date.now() >= start(selected) && Date.now() < start(selected) + 4 * 3600000) state.timer = setTimeout(load, 30000);
    } finally {
      if (active()) refresh.disabled = false;
    }
  }
  select.addEventListener("change", () => {
    captured = new Map();
    rows.replaceChildren();
    load();
  });
  panel.append(h("div", { class: "row lap-controls" }, h("label", { for: "f1-lap-race" }, "Grand Prix"), h("span", { class: "select-wrap" }, select), refresh), status, rows);
  load();
  return panel;
}

async function renderF1() {
  const request = ++state.request;
  clearTimeout(state.timer);
  show(h("div", { class: "f1-hero" }, h("p", { class: "f1-kicker" }, "MATCHLAB / FORMULA 1"), h("h1", {}, "The championship, in focus."), h("p", {}, "Loading standings and race results…")));
  try {
    const data = await api("/api/f1-dashboard");
    if (request !== state.request) return;
    const driversList = data.drivers?.StandingsTable?.StandingsLists?.[0];
    const teamsList = data.teams?.StandingsTable?.StandingsLists?.[0];
    const drivers = driversList?.DriverStandings || [];
    const teams = teamsList?.ConstructorStandings || [];
    const last = data.last?.RaceTable?.Races?.[0];
    const next = data.next?.RaceTable?.Races?.[0];
    const table = (headers, rows) => h("div", { class: "scroll" }, h("table", {}, h("thead", {}, h("tr", {}, headers.map(x => h("th", {}, x)))), h("tbody", {}, rows)));
    const unavailable = () => h("p", { class: "note warn" }, "Data unavailable from Jolpica. Try refreshing.");
    show(h("div", { class: "f1-hero" }, h("p", { class: "f1-kicker" }, "MATCHLAB / FORMULA 1"), h("h1", {}, "The championship, in focus."),
      h("p", {}, "Standings, results and the road ahead."),
      h("div", { class: "f1-hero-bottom" }, h("span", {}, `Jolpica checked ${new Date(data.checked_at).toLocaleString()} · Data may be delayed`), h("button", { class: "btn", type: "button", onclick: renderF1 }, "Refresh data"))),
      h("div", { class: "f1-overview" },
        h("section", { class: "panel f1-feature-card" },
          h("div", { class: "f1-card-body" },
            h("p", { class: "f1-label" }, "NEXT RACE"),
            next ? [h("h2", {}, next.raceName), h("p", { class: "sub" }, `${next.Circuit?.circuitName || ""} · ${day(next.date + "T" + (next.time || "00:00:00Z"))}`), h("p", {}, next.time ? time(next.date + "T" + next.time) : "Start time to be confirmed")] : data.next ? h("p", {}, "No upcoming race published.") : unavailable())),
        h("section", { class: "panel f1-feature-card" },
          h("div", { class: "f1-card-body" },
            h("p", { class: "f1-label" }, "CHAMPIONSHIP LEADER"),
            drivers.length ? [h("h2", {}, `${drivers[0].Driver.givenName} ${drivers[0].Driver.familyName}`), h("p", { class: "sub" }, (drivers[0].Constructors || []).map(x => x.name).join(" / ")), h("p", { class: "f1-points" }, `${drivers[0].points} pts`)] : unavailable()))),
      f1LapPanel(data.schedule?.RaceTable?.Races || [], last, next, request),
      h("div", { class: "f1-grid" },
        h("section", { class: "panel" }, h("p", { class: "f1-label" }, `${driversList?.season || "CURRENT"} SEASON · ROUND ${driversList?.round || "—"}`), h("h2", {}, "Driver standings"), drivers.length ? table(["Pos", "Driver", "Team", "Wins", "Points"], drivers.map(d => h("tr", {}, h("td", {}, d.position), h("td", {}, `${d.Driver.givenName} ${d.Driver.familyName}`), h("td", {}, (d.Constructors || []).map(c => c.name).join(" / ")), h("td", {}, d.wins), h("td", {}, h("strong", {}, d.points))))) : unavailable()),
        h("section", { class: "panel" }, h("p", { class: "f1-label" }, "THE TEAMS"), h("h2", {}, "Constructor standings"), teams.length ? table(["Pos", "Team", "Wins", "Points"], teams.map(t => h("tr", {}, h("td", {}, t.position), h("td", {}, t.Constructor.name), h("td", {}, t.wins), h("td", {}, h("strong", {}, t.points))))) : unavailable())),
      h("section", { class: "panel" }, h("p", { class: "f1-label" }, "LATEST GRAND PRIX"), h("h2", {}, last?.raceName || "Race results"), last ? [h("p", { class: "sub" }, `${last.date} · ${last.Circuit?.circuitName || ""}`), table(["Pos", "Driver", "Team", "Points", "Status"], (last.Results || []).map(r => h("tr", {}, h("td", {}, r.position), h("td", {}, `${r.Driver.givenName} ${r.Driver.familyName}`), h("td", {}, r.Constructor.name), h("td", {}, r.points), h("td", {}, r.status))))] : unavailable()),
      h("p", { class: "note f1-source" }, "Standings and results from Jolpica F1 may be delayed. ", h("a", { href: "/lab?sport=f1" }, "Open the race forecast")));
  } catch (error) {
    if (request !== state.request) return;
    show(h("h1", {}, "Formula 1"), h("p", { class: "note error" }, "Could not refresh Formula One data. Check your connection and try again."), h("button", { class: "btn", type: "button", onclick: renderF1 }, "Try again"));
  }
}

// ---- World: markets, AI news, model releases and sports headlines -------------------------------
const MAJOR_LABS = new Set(["anthropic", "openai", "google", "meta", "mistral", "mistralai", "xai", "x-ai", "deepseek", "qwen", "alibaba", "microsoft", "nvidia", "amazon", "cohere", "perplexity", "moonshotai", "z-ai", "meta-llama"]);
const SPORT_LABELS = { cricket: "Cricket", football: "Football", tennis: "Tennis", f1: "Formula 1" };
const WORLD_SECTIONS = ["markets", "news", "models", "sports"];
const WORLD_STEP = { news: 10, models: 8, sports: 12 };
state.world = { data: {}, filters: { news: "all", models: "all", sports: "all" }, shown: { ...WORLD_STEP }, brief: null, briefBusy: false, briefError: "", briefTried: false, selectedStock: "ANT" };

const ago = (iso) => {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(mins)) return "";
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} d ago`;
};
const money = (n, currency = "USD") => new Intl.NumberFormat([], { style: "currency", currency }).format(n);
const compact = (n) => new Intl.NumberFormat([], { notation: "compact", maximumFractionDigits: 1 }).format(n);
const signed = (n, digits = 2) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(digits)}`;
const external = (href, text, cls) => h("a", { class: cls, href, target: "_blank", rel: "noopener noreferrer" }, text, h("span", { class: "vh" }, " (opens in a new tab)"));

// Markets use only what the quote feed supplies: price, change against the start of the 5-day window,
// the day and 52-week ranges, volume and the 30-minute closes. Nothing is estimated or simulated.
const SVG_NS = "http://www.w3.org/2000/svg";
let sparkId = 0;
function svgEl(tag, attrs, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs || {})) if (value != null && value !== false) node.setAttribute(key, String(value));
  for (const child of children.flat()) if (child) node.append(child);
  return node;
}

function smoothBezierPath(pts) {
  if (!pts || pts.length < 2) return "";
  let d = `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, pts.length - 1)];
    const cp1x = (p1[0] + (p2[0] - p0[0]) / 6).toFixed(1);
    const cp1y = (p1[1] + (p2[1] - p0[1]) / 6).toFixed(1);
    const cp2x = (p2[0] - (p3[0] - p1[0]) / 6).toFixed(1);
    const cp2y = (p2[1] - (p3[1] - p1[1]) / 6).toFixed(1);
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

function brokerSparkline(series, direction, width = 140, height = 36) {
  if (!Array.isArray(series) || series.length < 2) return null;
  const low = Math.min(...series), high = Math.max(...series), span = high - low || 1;
  const padY = 3;
  const pts = series.map((v, i) => [(i / (series.length - 1)) * width, height - padY - ((v - low) / span) * (height - 2 * padY)]);
  const curveD = smoothBezierPath(pts);
  const gradId = `spark-grad-${++sparkId}`;
  return svgEl("svg", { viewBox: `0 0 ${width} ${height}`, class: `mini-broker-spark ${direction}`, preserveAspectRatio: "none", "aria-hidden": "true", focusable: "false" },
    svgEl("defs", {}, svgEl("linearGradient", { id: gradId, x1: 0, y1: 0, x2: 0, y2: 1 },
      svgEl("stop", { offset: "0%", "stop-color": "currentColor", "stop-opacity": 0.32 }),
      svgEl("stop", { offset: "100%", "stop-color": "currentColor", "stop-opacity": 0 }))),
    svgEl("path", { d: `${curveD} L ${width},${height} L 0,${height} Z`, fill: `url(#${gradId})` }),
    svgEl("path", { d: curveD, fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" }));
}

// A range card is drawn only when the feed supplied both ends of the range.
function rangeMetricCard(label, current, low, high, currency) {
  if (low == null || high == null || high <= low) return null;
  const share = Math.max(0, Math.min(100, ((current - low) / (high - low)) * 100));
  return h("div", { class: "range-metric-card" },
    h("div", { class: "range-title-row" }, h("span", { class: "range-label" }, label), h("span", { class: "range-current tnum" }, `${share.toFixed(0)}% of the way up`)),
    h("div", { class: "range-track", "aria-hidden": "true" }, h("div", { class: "range-fill" }), h("div", { class: "range-pin", style: `--pin:${share.toFixed(1)}` })),
    h("div", { class: "range-extremes" }, h("span", { class: "tnum" }, `Low ${money(low, currency)}`), h("span", { class: "tnum" }, `High ${money(high, currency)}`)));
}

function tickerStrip(quotes, activeSymbol, onSelect) {
  return h("div", { class: "ticker-marquee-wrap", role: "group", "aria-label": "Tickers" },
    h("div", { class: "ticker-marquee-track" }, quotes.map((q) => {
      const known = typeof q.change_pct === "number";
      return h("button", { class: `ticker-marquee-item${q.symbol === activeSymbol ? " active" : ""}`, type: "button", "aria-pressed": String(q.symbol === activeSymbol), onclick: () => onSelect(q.symbol) },
        h("span", { class: "item-sym" }, q.symbol), h("span", { class: "item-price tnum" }, money(q.price, q.currency)),
        known ? h("span", { class: `item-pill tnum ${q.change_pct >= 0 ? "good" : "bad"}` }, `${q.change_pct >= 0 ? "▲" : "▼"} ${signed(q.change_pct)}%`) : null);
    })));
}

function priceChart(q, series, direction, onScrub, onLeave) {
  const svgW = 860, svgH = 220, padL = 16, padR = 84, padT = 18, padB = 18;
  const chartW = svgW - padL - padR, chartH = svgH - padT - padB;
  const low = Math.min(...series), high = Math.max(...series), span = high - low || 1;
  const pts = series.map((v, i) => [padL + (i / (series.length - 1)) * chartW, padT + (1 - (v - low) / span) * chartH]);
  const curveD = smoothBezierPath(pts);
  const gradId = `terminal-grad-${++sparkId}`;
  const tone = direction === "good" ? "var(--color-text-success)" : direction === "bad" ? "var(--color-text-error)" : "var(--color-accent)";
  const grid = [[high, padT], [low + span / 2, padT + chartH / 2], [low, padT + chartH]].flatMap(([value, y]) => [
    svgEl("line", { x1: padL, y1: y, x2: padL + chartW, y2: y, class: "chart-gridline" }),
    svgEl("text", { x: padL + chartW + 8, y: y + 3, class: "chart-gridlabel tnum" }, money(value, q.currency))]);
  const cursor = svgEl("g", { class: "chart-cursor", hidden: "" },
    svgEl("line", { class: "scrubber-line-v", y1: padT, y2: padT + chartH }), svgEl("circle", { class: "scrubber-dot", r: 5 }));
  const svg = svgEl("svg", { viewBox: `0 0 ${svgW} ${svgH}`, class: "broker-chart-svg", preserveAspectRatio: "none", role: "img",
    "aria-label": `${q.symbol} closing prices over the last 5 sessions: from ${money(series[0], q.currency)} to ${money(series[series.length - 1], q.currency)}, low ${money(low, q.currency)}, high ${money(high, q.currency)}` },
    svgEl("defs", {}, svgEl("linearGradient", { id: gradId, x1: 0, y1: 0, x2: 0, y2: 1 },
      svgEl("stop", { offset: "0%", "stop-color": tone, "stop-opacity": 0.3 }), svgEl("stop", { offset: "100%", "stop-color": tone, "stop-opacity": 0 }))),
    grid,
    svgEl("path", { d: `${curveD} L ${pts[pts.length - 1][0].toFixed(1)},${padT + chartH} L ${pts[0][0].toFixed(1)},${padT + chartH} Z`, fill: `url(#${gradId})`, class: "broker-chart-area" }),
    svgEl("path", { d: curveD, fill: "none", class: `broker-chart-path ${direction}` }),
    cursor);
  const wrap = h("div", { class: "broker-chart-wrap" }, svg);
  wrap.addEventListener("pointermove", (event) => {
    const box = svg.getBoundingClientRect();
    if (!box.width) return;
    const ratio = Math.max(0, Math.min(1, ((event.clientX - box.left) * (svgW / box.width) - padL) / chartW));
    const index = Math.round(ratio * (series.length - 1));
    const [x, y] = pts[index];
    cursor.removeAttribute("hidden");
    cursor.firstChild.setAttribute("x1", x.toFixed(1)); cursor.firstChild.setAttribute("x2", x.toFixed(1));
    cursor.lastChild.setAttribute("cx", x.toFixed(1)); cursor.lastChild.setAttribute("cy", y.toFixed(1));
    onScrub(series[index]);
  });
  wrap.addEventListener("pointerleave", () => { cursor.setAttribute("hidden", ""); onLeave(); });
  return wrap;
}

function brokerTerminal(q) {
  const known = typeof q.change_pct === "number";
  const direction = !known ? "flat" : q.change_pct >= 0 ? "good" : "bad";
  const series = Array.isArray(q.series) && q.series.length >= 2 ? q.series : null;
  const quoteTime = q.as_of ? `Quote as of ${new Date(q.as_of).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}` : "Quote time not supplied";
  const price = h("div", { class: "terminal-price tnum" }, money(q.price, q.currency));
  const changeLine = (delta, pctChange, context) => [h("span", { "aria-hidden": "true" }, delta >= 0 ? "▲ " : "▼ "), `${signed(delta)} (${signed(pctChange)}%)`, h("span", { class: "change-context" }, context)];
  const change = known ? h("div", { class: `terminal-change-pill tnum ${direction}` }, changeLine(q.change, q.change_pct, "since 5 sessions ago")) : null;
  const note = h("div", { class: "terminal-subtext" }, quoteTime);
  const chart = series ? priceChart(q, series, direction, (value) => {
    price.textContent = money(value, q.currency);
    const delta = value - series[0];
    if (change) { change.className = `terminal-change-pill tnum ${delta >= 0 ? "good" : "bad"}`; change.replaceChildren(...changeLine(delta, series[0] > 0 ? (delta / series[0]) * 100 : 0, "vs first close shown")); }
    note.textContent = "Reading the chart: 30-minute closes";
  }, () => {
    price.textContent = money(q.price, q.currency);
    if (change) { change.className = `terminal-change-pill tnum ${direction}`; change.replaceChildren(...changeLine(q.change, q.change_pct, "since 5 sessions ago")); }
    note.textContent = quoteTime;
  }) : h("p", { class: "note" }, "No price history was supplied for this ticker.");
  const tile = (label, value) => h("div", { class: "stat-tile" }, h("span", { class: "stat-tile-k" }, label), h("span", { class: "stat-tile-v tnum" }, value));
  return h("article", { class: "broker-terminal primary", "aria-label": `${q.name}, ${q.symbol}`, "data-atomic": "",
    "data-k": [q.symbol, q.price, q.as_of, series ? series.length : 0].join("|") },
    h("div", { class: "terminal-topbar" }, h("div", { class: "terminal-ticker-info" },
      h("span", { class: "terminal-symbol" }, q.symbol), h("span", { class: "terminal-name" }, q.name), q.exchange ? h("span", { class: "terminal-exchange" }, q.exchange) : null)),
    h("div", { class: "terminal-hero-row" }, h("div", { class: "terminal-price-stack" }, price, change), note),
    chart,
    h("div", { class: "terminal-metrics-deck" },
      rangeMetricCard("Day range", q.price, q.day_low, q.day_high, q.currency),
      rangeMetricCard("52-week range", q.price, q.year_low, q.year_high, q.currency)),
    h("div", { class: "terminal-stats-grid" },
      tile("Volume", q.volume != null ? compact(q.volume) : "—"),
      tile("Day high / low", q.day_high != null && q.day_low != null ? `${money(q.day_high, q.currency)} / ${money(q.day_low, q.currency)}` : "—"),
      tile("Close 5 sessions ago", known && q.change != null ? money(q.price - q.change, q.currency) : "—"),
      tile("Currency", q.currency || "—")));
}

function watchlistCard(q, isActive, onSelect) {
  const known = typeof q.change_pct === "number";
  const direction = !known ? "flat" : q.change_pct >= 0 ? "good" : "bad";
  const low = q.day_low ?? Math.min(...(q.series || [q.price]));
  const high = q.day_high ?? Math.max(...(q.series || [q.price]));
  const pinPct = Math.max(0, Math.min(100, ((q.price - low) / ((high - low) || 1)) * 100));
  return h("button", {
    class: `watchlist-item${isActive ? " active" : ""}`, type: "button", "aria-pressed": String(isActive),
    "aria-label": `${q.symbol}, ${q.name}, ${money(q.price, q.currency)}${known ? `, ${q.change_pct >= 0 ? "up" : "down"} ${Math.abs(q.change_pct).toFixed(2)} percent over 5 sessions` : ""}`,
    onclick: () => onSelect(q.symbol) },
    h("div", { class: "watchlist-topline" }, h("div", {}, h("span", { class: "watchlist-symbol" }, q.symbol), h("span", { class: "watchlist-name" }, q.label || q.name)),
      isActive ? h("span", { class: "watchlist-active-badge" }, "Shown") : null),
    h("div", { class: "watchlist-price-row" }, h("span", { class: "watchlist-price tnum" }, money(q.price, q.currency)),
      known ? h("span", { class: `watchlist-pill tnum ${direction}` }, `${q.change_pct >= 0 ? "▲ " : "▼ "}${signed(q.change_pct)}%`) : null),
    h("div", { class: "watchlist-chart-row" }, brokerSparkline(q.series, direction, 140, 36)),
    h("div", { class: "range-track", "aria-hidden": "true", style: "margin: 2px 0 0;" }, h("div", { class: "range-fill" }), h("div", { class: "range-pin", style: `--pin:${pinPct.toFixed(1)}` })));
}

function chipRow(label, options, current, pick) {
  return h("div", { class: "row world-chips", role: "group", "aria-label": label },
    options.map(([value, text, count]) => h("button", { class: "chip", type: "button", "data-chip": value, "aria-pressed": String(value === current), onclick: () => pick(value) },
      text, count != null ? h("span", { class: "tab-count" }, count) : null)));
}

// replaceChildren would print the word "null" for an empty slot, so empty slots are dropped first.
const put = (element, ...nodes) => {
  const next = document.createDocumentFragment();
  next.append(...nodes.flat().filter((n) => n != null && n !== false));
  morphChildren(element, next);
};
function renderWorld() {
  const request = ++state.request;
  clearTimeout(state.timer);
  const world = state.world, alive = () => request === state.request;
  const parts = {};
  const panel = (id, kicker, title) => {
    const meta = h("p", { class: "world-meta" }), body = h("div", { class: "world-body", "aria-busy": "true" }, h("p", { class: "note", role: "status" }, "Loading…"));
    const node = h("section", { class: "panel world-panel", "aria-labelledby": `world-${id}` },
      h("div", { class: "world-head" }, h("div", {}, h("p", { class: "world-kicker" }, kicker), h("h2", { id: `world-${id}` }, title)), meta), body);
    parts[id] = { node, meta, body };
  };
  const done = (id, data) => {
    const part = parts[id], sources = data?.sources || [];
    part.body.removeAttribute("aria-busy");
    part.meta.textContent = data?.ok ? [`Checked ${time(data.checked_at)}`, data.stale ? "showing earlier data" : "",
      sources.length ? `${sources.filter((s) => s.ok).length} of ${sources.length} sources` : ""].filter(Boolean).join(" · ") : "";
    return part;
  };
  const failure = (id, label, data) => {
    put(done(id, null).body, h("p", { class: "note error", role: "alert" }, `${label} could not be loaded. ${data?.error || "Check your connection and try again."}`),
      h("button", { class: "btn", type: "button", onclick: () => load(id, true) }, "Try again"));
  };
  const keepFocus = (part, chip) => part.body.querySelector(`[data-chip="${CSS.escape(chip)}"]`)?.focus();
  const more = (id, total, repaint) => world.shown[id] < total ? h("button", { class: "btn world-more", type: "button", onclick: () => {
    const before = world.shown[id]; world.shown[id] += WORLD_STEP[id]; repaint();
    parts[id].body.querySelectorAll(".feed > li")[before]?.querySelector("a")?.focus();
  } }, `Show more (${total - world.shown[id]} left)`) : null;

  const hero = h("div", { class: "world-hero" },
    h("div", {}, h("p", { class: "eyebrow" }, "MATCHLAB / WORLD"), h("h1", {}, "What’s happening, ", h("span", {}, "your way.")),
      h("p", {}, "Anthropic’s stock, AI news and new models, plus cricket, football, tennis and Formula 1. Everything links to its source."),
      h("p", { class: "hero-date" }, new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" }))),
    h("button", { class: "btn primary", type: "button", onclick: () => { WORLD_SECTIONS.forEach((id) => load(id, true)); } }, "Refresh everything"));

  panel("markets", "MARKETS", "Anthropic and the AI trade");
  panel("brief", "AI BRIEFING", "What matters today");
  panel("models", "MODEL RELEASES", "New models");
  panel("news", "AI NEWS", "Latest AI news");
  panel("sports", "SPORTS", "Headlines from your sports");

  function drawMarkets() {
    const data = world.data.markets;
    if (!data?.ok) return failure("markets", "Stock prices", data);
    const quotes = data.quotes || [];
    if (!world.selectedStock || !quotes.some((q) => q.symbol === world.selectedStock)) {
      world.selectedStock = quotes.find((q) => q.symbol === "ANT")?.symbol || quotes[0]?.symbol || "ANT";
    }
    const activeQuote = quotes.find((q) => q.symbol === world.selectedStock) || quotes[0];
    const select = (symbol) => { world.selectedStock = symbol; drawMarkets(); };
    put(done("markets", data).body,
      quotes.length ? tickerStrip(quotes, activeQuote?.symbol, select) : null,
      h("div", { class: "market-row" },
        activeQuote ? brokerTerminal(activeQuote) : h("p", { class: "note warn" }, "Stock quotes are unavailable right now."),
        h("div", { class: "market-watchlist" },
          h("div", { class: "watchlist-header" },
            h("div", {}, h("h3", { class: "watchlist-title" }, "Watchlist"), h("p", { class: "watchlist-sub" }, "Choose a ticker to show its chart")),
            h("span", { class: "tag ok" }, `${quotes.length} tickers`)),
          h("div", { class: "watchlist-cards" }, quotes.map((item) => watchlistCard(item, item.symbol === activeQuote?.symbol, select))))),
      h("p", { class: "world-note" }, `${data.source}. Prices may be delayed. Changes are measured against the close 5 sessions ago. For information only, not investment advice.`));
  }

  function drawModels() {
    const data = world.data.models;
    if (!data?.ok) return failure("models", "Model releases", data);
    const filter = world.filters.models, all = data.items;
    const filters = { all: () => true, new: (m) => m.is_new, major: (m) => MAJOR_LABS.has(m.lab.toLowerCase().replace(/\s+/g, "")) || MAJOR_LABS.has(m.id.split("/")[0]) };
    const rows = all.filter(filters[filter] || filters.all);
    const price = (m) => m.free ? " · free" : m.price_in != null && m.price_out != null ? ` · $${Number(m.price_in.toFixed(3))} in / $${Number(m.price_out.toFixed(3))} out per 1M tokens` : " · price varies";
    put(done("models", data).body, 
      chipRow("Filter model releases", [["all", "All", all.length], ["new", "Listed this week", all.filter(filters.new).length], ["major", "Major labs", all.filter(filters.major).length]], filter,
        (value) => { world.filters.models = value; world.shown.models = WORLD_STEP.models; drawModels(); keepFocus(parts.models, value); }),
      rows.length ? h("ul", { class: "feed" }, rows.slice(0, world.shown.models).map((m) => h("li", { "data-k": m.url },
        h("p", { class: "feed-meta" }, h("span", { class: "tag" }, m.lab), m.is_new ? h("span", { class: "tag ok" }, "Newly listed") : null, m.free ? h("span", { class: "tag off" }, "Free") : null),
        external(m.url, m.name, "feed-title"),
        h("p", { class: "feed-meta" }, `Listed ${ago(m.released)}${m.context ? ` · ${compact(m.context)} context` : ""}${price(m)}`),
        m.blurb ? h("p", { class: "feed-summary" }, m.blurb) : null))) : h("p", { class: "note" }, "No models match this filter."),
      more("models", rows.length, drawModels),
      h("p", { class: "world-note" }, "Dates are when a model appeared in OpenRouter’s catalogue. That can be later than the lab’s own announcement."));
  }

  function drawFeed(id, label, items, filterLabel, options, matches) {
    const data = world.data[id];
    if (!data?.ok) return failure(id, label, data);
    const filter = options.some(([v]) => v === world.filters[id]) ? world.filters[id] : "all";
    const repaint = id === "news" ? drawNews : drawSports;
    const rows = items.filter((item) => matches(item, filter));
    put(done(id, data).body, 
      chipRow(filterLabel, options, filter, (value) => { world.filters[id] = value; world.shown[id] = WORLD_STEP[id]; repaint(); keepFocus(parts[id], value); }),
      rows.length ? h("ul", { class: `feed${id === "sports" ? " feed-sports" : ""}` }, rows.slice(0, world.shown[id]).map((item) => h("li", { "data-k": item.url },
        h("p", { class: "feed-meta" }, id === "sports" ? h("span", { class: "tag" }, SPORT_LABELS[item.sport] || item.sport) : null, ...(item.labs || []).map((lab) => h("span", { class: "tag" }, lab)),
          `${item.source} · ${ago(item.published)}`),
        external(item.url, item.title, "feed-title"),
        item.summary ? h("p", { class: "feed-summary" }, item.summary) : null))) : h("p", { class: "note" }, "Nothing matches this filter right now."),
      more(id, rows.length, repaint));
  }

  function drawNews() {
    const data = world.data.news, items = data?.items || [], counts = {};
    for (const item of items) for (const lab of item.labs || []) counts[lab] = (counts[lab] || 0) + 1;
    const order = ["Anthropic", "OpenAI", "Google"], rank = (lab) => order.includes(lab) ? order.indexOf(lab) : 9;
    const labs = Object.keys(counts).sort((a, b) => rank(a) - rank(b) || counts[b] - counts[a]).slice(0, 6);
    drawFeed("news", "AI headlines", items, "Filter AI news by lab", [["all", "All", items.length], ...labs.map((lab) => [lab, lab, counts[lab]])], (item, f) => f === "all" || (item.labs || []).includes(f));
  }

  function drawSports() {
    const items = world.data.sports?.items || [];
    drawFeed("sports", "Sports headlines", items, "Filter sports headlines",
      [["all", "All", items.length], ...Object.entries(SPORT_LABELS).map(([k, label]) => [k, label, items.filter((i) => i.sport === k).length])], (item, f) => f === "all" || item.sport === f);
  }

  function drawBrief() {
    const info = world.brief, body = parts.brief.body;
    body.removeAttribute("aria-busy");
    if (!info) return;
    const saved = info.saved, meter = info.budget;
    parts.brief.meta.textContent = saved ? `Written ${ago(saved.at)}` : "";
    const waiting = info.age != null && info.age < info.min_gap;
    const button = h("button", { class: "btn", type: "button", disabled: world.briefBusy || waiting || !info.has_key, onclick: () => writeBrief(true) },
      world.briefBusy ? "Writing…" : saved ? "Refresh briefing" : "Write today’s briefing");
    const links = (refs) => {
      const urls = refs.map((r) => saved.links?.[r]).filter(Boolean);
      return urls.length ? h("span", { class: "refs" }, " ", urls.flatMap((url, i) => [i ? " " : "", external(url, `Source ${i + 1}`, "ref")])) : null;
    };
    const brief = saved?.brief;
    put(body,
      !info.has_key ? h("p", { class: "note" }, "Add an OpenRouter key in ", h("a", { href: "#settings" }, "Settings"), " to get a written briefing of the items below.") : null,
      brief ? h("div", { class: "brief" },
        brief.headline ? h("p", { class: "brief-headline" }, brief.headline) : null,
        brief.bullets?.length ? h("ul", { class: "brief-list" }, brief.bullets.map((b) => h("li", {}, h("span", { class: "tag" }, b.topic || "Note"), " ", b.text, links(b.refs || [])))) : null,
        brief.dropped || brief.headline_removed ? h("p", { class: "world-note" },
          [brief.dropped ? `${brief.dropped} ${brief.dropped === 1 ? "statement was" : "statements were"} removed because ${brief.dropped === 1 ? "it" : "they"} cited no source or stated a figure that source does not contain.` : "",
            brief.headline_removed ? "The headline was removed for the same reason." : ""].filter(Boolean).join(" ")) : null) : info.has_key && !world.briefBusy ? h("p", { class: "note" }, "No briefing yet. It is written from the headlines below by a free OpenRouter model.") : null,
      world.briefBusy ? h("p", { class: "note", role: "status" }, "Writing the briefing from today’s headlines…") : null,
      world.briefError ? h("p", { class: "note error", role: "alert" }, world.briefError) : null,
      h("div", { class: "row brief-actions" }, info.has_key ? button : null,
        h("span", { class: "world-note" }, `${saved ? `Written by ${saved.model}. ` : ""}AI can be wrong, so check the sources. ${meter.used} of ${meter.limit} AI requests used today${waiting ? "; the next refresh unlocks in a few minutes." : "."}`)));
  }

  async function writeBrief(force) {
    world.briefBusy = true; world.briefError = ""; drawBrief();
    try { world.brief = await api("/api/world-brief", { force }); }
    catch (error) { world.briefError = error.message; }
    finally { world.briefBusy = false; if (alive()) drawBrief(); }
  }

  function autoBrief() {
    const b = world.brief;
    if (world.briefTried || !b?.has_key || !world.data.news?.ok || !world.data.models?.ok) return;
    if (b.saved && b.age != null && b.age < b.ttl) return;
    if (b.budget.remaining <= b.budget.reserve) return;
    world.briefTried = true;
    writeBrief(false);
  }

  const draw = { markets: drawMarkets, news: drawNews, models: drawModels, sports: drawSports };
  async function load(id, refresh) {
    try {
      const data = await api(`/api/world?section=${id}${refresh ? "&refresh=1" : ""}`);
      if (!alive()) return;
      world.data[id] = data;
    } catch (error) {
      if (!alive()) return;
      if (!world.data[id]) world.data[id] = { ok: false, error: error.message };
    }
    draw[id]();
    autoBrief();
  }

  show(hero, parts.markets.node, parts.brief.node, h("div", { class: "world-two" }, parts.models.node, parts.news.node), parts.sports.node,
    h("p", { class: "note world-sources" }, "Sources: Yahoo Finance, OpenRouter, OpenAI, Google DeepMind, Hugging Face, TechCrunch, The Verge, Google News, Hacker News, ESPN, ESPNcricinfo and BBC Sport. Headlines belong to their publishers; each links to the original."));
  WORLD_SECTIONS.forEach((id) => world.data[id] ? draw[id]() : load(id, false));
  api("/api/world-brief").then((b) => { if (!alive()) return; world.brief = b; drawBrief(); autoBrief(); })
    .catch(() => { if (alive()) parts.brief.body.replaceChildren(h("p", { class: "note" }, "The briefing is unavailable right now.")); });
  const tick = () => { if (!alive()) return; WORLD_SECTIONS.forEach((id) => load(id, false)); state.timer = setTimeout(tick, 5 * 60 * 1000); };
  state.timer = setTimeout(tick, 5 * 60 * 1000);
}

function route() {
  clearTimeout(state.timer);
  state.request++;
  state.autoRefreshed = false;
  const hash = location.hash.slice(1) || "matches";
  const tab = hash.startsWith("match/") ? "matches" : hash;
  document.querySelectorAll("nav a").forEach((a) => a.dataset.tab === tab ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  state.routeKey = hash;
  state.focusHeading = state.routed === true;   // keep the natural first tab stop on the initial load
  state.routed = true;
  if (hash.startsWith("match/")) openMatch(decodeURIComponent(hash.slice(6)));
  else if (hash === "world") renderWorld();
  else if (hash === "f1") renderF1();
  else if (hash === "record") renderRecord();
  else if (hash === "settings") renderSettings();
  else renderMatches();
  window.scrollTo(0, 0);
}

(async function start() {
  try {
    const [app, schedule] = await Promise.all([api("/api/session"), api("/api/today-matches")]);
    state.token = app.token;
    state.keyStatus = app.openrouter_key_status;
    state.schedule = schedule;
    showBudgets(schedule.budget);
  } catch (error) {
    show(h("h1", {}, "MatchLab could not start"),
      h("p", { class: "note error", role: "alert", style: "margin-top:14px" }, `The local server did not answer (${error.message}). Check that MatchLab is still running in its terminal window, then try again.`),
      h("button", { class: "btn primary", type: "button", style: "margin-top:12px", onclick: () => location.reload() }, "Try again"));
    return;
  }
  window.addEventListener("hashchange", route);
  route();
  refreshSchedule();
  setInterval(() => { if (!location.hash || location.hash === "#matches") refreshSchedule(); }, 5 * 60 * 1000);
  setInterval(updateFreshness, 30 * 1000);
})();
