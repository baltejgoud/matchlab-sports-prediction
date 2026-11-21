"use strict";
const $ = (s) => document.querySelector(s);
const e = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt = (n, digits=1) => n == null ? "—" : Number(n).toLocaleString(undefined,{maximumFractionDigits:digits,minimumFractionDigits:digits});
const pct = n => n == null ? "—" : `${fmt(n*100,0)}%`;
const nice = s => String(s ?? "").replace(/\s*\[\d+\]$/, "");
const dateLabel = s => new Date(`${s}T12:00:00`).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});
const paths = {
 mark:'<path d="M3 17V7h3l6 7 6-7h3v10h-4v-4l-5 6-5-6v4z" fill="currentColor" stroke="none"/>',
 grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
 users:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m3 10v-2a6 6 0 0 0-3-5"/>',
 layers:'<path d="m12 3 10 5-10 5L2 8l10-5zm-9 9 9 5 9-5M3 17l9 5 9-5"/>',
 book:'<path d="M4 3h7a3 3 0 0 1 3 3v15a4 4 0 0 0-3-2H4V3zm10 3a3 3 0 0 1 3-3h4v16h-4a4 4 0 0 0-3 2"/>',
 shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3z"/><path d="m8 12 3 3 5-6"/>',
 download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
 spark:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3z"/>',
 refresh:'<path d="M20 7v5h-5M4 17v-5h5m-5-1a8 8 0 0 1 14-5l2 2M4 16l2 2a8 8 0 0 0 14-5"/>',
 target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
 trend:'<path d="m3 17 6-6 4 4 8-10m-7 0h7v7"/>',
 chart:'<path d="M4 3v18h17M8 16v-4m5 4V8m5 8V5"/>',
 ball:'<circle cx="12" cy="12" r="9"/><path d="m12 8 4 3-1.5 5h-5L8 11l4-3zm0-5v5m9 3-5 0m-1.5 5 3 4m-8-4-3 4M3 11h5"/>',
 arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>'
};
function icon(name){return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.target}</svg>`;}
function hydrateIcons(){document.querySelectorAll("[data-icon]").forEach(x=>x.innerHTML=icon(x.dataset.icon));}

class SearchableCombobox {
 constructor(selectEl, placeholder="Select option"){
  if(!selectEl) return;
  this.selectEl = selectEl;
  this.placeholder = placeholder;
  this.selectEl._combobox = this;
  this.isOpen = false;
  this.highlightedIndex = -1;
  this.filteredOptions = [];
  this.build();
  this.sync();
  this.attachEvents();
 }
 build(){
  this.selectEl.classList.add("combobox-native-hidden");
  this.container = document.createElement("div");
  this.container.className = "combobox-container";
  this.trigger = document.createElement("div");
  this.trigger.className = "combobox-trigger";
  this.trigger.setAttribute("tabindex", "0");
  this.trigger.setAttribute("role", "combobox");
  this.trigger.setAttribute("aria-haspopup", "listbox");
  this.trigger.setAttribute("aria-expanded", "false");
  this.trigger.setAttribute("aria-label", this.selectEl.getAttribute("aria-label") || this.selectEl.name || this.placeholder);
  this.label = document.createElement("span");
  this.label.className = "combobox-label";
  this.label.textContent = this.placeholder;
  this.caret = document.createElement("span");
  this.caret.className = "combobox-caret";
  this.caret.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  this.trigger.appendChild(this.label);
  this.trigger.appendChild(this.caret);
  this.dropdown = document.createElement("div");
  this.dropdown.className = "combobox-dropdown";
  this.dropdown.setAttribute("role", "listbox");
  this.dropdown.hidden = true;
  this.searchBox = document.createElement("div");
  this.searchBox.className = "combobox-search-box";
  this.searchInput = document.createElement("input");
  this.searchInput.type = "search";
  this.searchInput.className = "combobox-search-input";
  this.searchInput.placeholder = `Search ${this.placeholder.toLowerCase()}...`;
  this.searchInput.setAttribute("aria-label", `Filter ${this.placeholder.toLowerCase()}`);
  this.searchBox.appendChild(this.searchInput);
  this.countEl = document.createElement("div");
  this.countEl.className = "combobox-count";
  this.listEl = document.createElement("div");
  this.listEl.className = "combobox-list";
  this.dropdown.appendChild(this.searchBox);
  this.dropdown.appendChild(this.countEl);
  this.dropdown.appendChild(this.listEl);
  this.container.appendChild(this.trigger);
  this.container.appendChild(this.dropdown);
  this.selectEl.parentNode.insertBefore(this.container, this.selectEl.nextSibling);
 }
 sync(){
  const rawOptions = Array.from(this.selectEl.options);
  const selected = this.selectEl.selectedOptions[0];
  if(selected && selected.textContent){
   this.label.textContent = selected.textContent;
   this.label.classList.remove("placeholder");
  } else {
   this.label.textContent = this.placeholder;
   this.label.classList.add("placeholder");
  }
  if(this.selectEl.disabled || !rawOptions.length){
   this.trigger.classList.add("disabled");
   this.trigger.setAttribute("aria-disabled", "true");
   this.trigger.tabIndex = -1;
  } else {
   this.trigger.classList.remove("disabled");
   this.trigger.removeAttribute("aria-disabled");
   this.trigger.tabIndex = 0;
  }
  if(this.isOpen) this.renderList();
 }
 open(){
  if(this.selectEl.disabled) return;
  document.querySelectorAll(".combobox-dropdown:not([hidden])").forEach(d=>{
   d.hidden = true;
   d.previousElementSibling?.classList.remove("active");
   d.previousElementSibling?.setAttribute("aria-expanded", "false");
  });
  this.isOpen = true;
  this.dropdown.hidden = false;
  this.trigger.classList.add("active");
  this.trigger.setAttribute("aria-expanded", "true");
  this.searchInput.value = "";
  this.renderList();
  setTimeout(()=>this.searchInput.focus(), 30);
 }
 close(){
  this.isOpen = false;
  this.dropdown.hidden = true;
  this.trigger.classList.remove("active");
  this.trigger.setAttribute("aria-expanded", "false");
  this.highlightedIndex = -1;
 }
 toggle(){
  if(this.isOpen) this.close();
  else this.open();
 }
 renderList(){
  const q = this.searchInput.value.toLowerCase().trim();
  const rawOptions = Array.from(this.selectEl.options);
  this.filteredOptions = rawOptions.filter(opt=>opt.textContent.toLowerCase().includes(q));
  this.countEl.textContent = `${this.filteredOptions.length} of ${rawOptions.length} options`;
  if(!this.filteredOptions.length){
   this.listEl.innerHTML = `<div class="combobox-empty">No matching ${e(this.placeholder.toLowerCase())}</div>`;
   this.highlightedIndex = -1;
   return;
  }
  const curVal = this.selectEl.value;
  this.listEl.innerHTML = this.filteredOptions.map((opt, i)=>{
   const isSel = opt.value === curVal;
   return `<div class="combobox-option ${isSel ? "selected" : ""}" role="option" aria-selected="${isSel}" data-index="${i}" data-value="${e(opt.value)}">
    <span>${e(opt.textContent)}</span>
    ${isSel ? '<span class="combobox-option-check" aria-hidden="true">✓</span>' : ""}
   </div>`;
  }).join("");
  const selIndex = this.filteredOptions.findIndex(opt=>opt.value === curVal);
  this.highlightedIndex = selIndex >= 0 ? selIndex : 0;
  this.updateHighlight();
  const selectedEl = this.listEl.querySelector(".combobox-option.selected");
  if(selectedEl) selectedEl.scrollIntoView({ block: "nearest" });
 }
 updateHighlight(){
  const items = this.listEl.querySelectorAll(".combobox-option");
  items.forEach((item, i)=>{
   if(i === this.highlightedIndex){
    item.classList.add("highlighted");
    item.scrollIntoView({ block: "nearest" });
   } else {
    item.classList.remove("highlighted");
   }
  });
 }
 selectOption(opt){
  if(!opt) return;
  this.selectEl.value = opt.value;
  this.sync();
  this.close();
  this.selectEl.dispatchEvent(new Event("change", { bubbles: true }));
  this.trigger.focus();
 }
 attachEvents(){
  this.trigger.addEventListener("click", ()=>this.toggle());
  this.trigger.addEventListener("keydown", (evt)=>{
   if(evt.key === "Enter" || evt.key === " " || evt.key === "ArrowDown"){
    evt.preventDefault();
    this.open();
   }
  });
  this.searchInput.addEventListener("input", ()=>this.renderList());
  this.searchInput.addEventListener("keydown", (evt)=>{
   if(evt.key === "ArrowDown"){
    evt.preventDefault();
    if(this.highlightedIndex < this.filteredOptions.length - 1){
     this.highlightedIndex++;
     this.updateHighlight();
    }
   } else if(evt.key === "ArrowUp"){
    evt.preventDefault();
    if(this.highlightedIndex > 0){
     this.highlightedIndex--;
     this.updateHighlight();
    }
   } else if(evt.key === "Enter"){
    evt.preventDefault();
    if(this.highlightedIndex >= 0 && this.highlightedIndex < this.filteredOptions.length){
     this.selectOption(this.filteredOptions[this.highlightedIndex]);
    }
   } else if(evt.key === "Escape"){
    evt.preventDefault();
    this.close();
    this.trigger.focus();
   }
  });
  this.listEl.addEventListener("click", (evt)=>{
   const optEl = evt.target.closest(".combobox-option");
   if(!optEl) return;
   const idx = parseInt(optEl.dataset.index, 10);
   if(idx >= 0 && idx < this.filteredOptions.length){
    this.selectOption(this.filteredOptions[idx]);
   }
  });
  this.selectEl.addEventListener("focus", ()=>this.trigger.focus());
  this.selectEl.addEventListener("change", ()=>this.sync());
 }
}

document.addEventListener("click", (evt)=>{
 if(!evt.target.closest(".combobox-container")){
  document.querySelectorAll(".combobox-dropdown:not([hidden])").forEach(d=>{
   d.hidden = true;
   d.previousElementSibling?.classList.remove("active");
   d.previousElementSibling?.setAttribute("aria-expanded", "false");
  });
 }
});

let state, analysis, activeView="overview", requestId=0, toastTimer, realConfig;
function sportMeta(){return state.catalog.find(s=>s.id===$("#sport").value);}
function toast(text){$("#toast").textContent=text;$("#toast").hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$("#toast").hidden=true,4500);}
function error(text){$("#error").textContent=text||"";$("#error").hidden=!text;}
async function api(path, payload){
 const options=payload===undefined?{}:{method:"POST",headers:{"Content-Type":"application/json","X-MatchLab-Token":state.token},body:JSON.stringify(payload)};
 const response=await fetch(path,options);const result=await response.json();
 if(!response.ok)throw new Error(result.error||"Local request failed");return result;
}
function options(select, items, selected){select.innerHTML=items.map(v=>`<option value="${e(v)}">${e(nice(v))}</option>`).join("");if(items.includes(selected))select.value=selected;select.disabled=!items.length;if(select._combobox)select._combobox.sync();}
function populateSides(reset=false){
 const meta=sportMeta(), race=meta.kind==="race";
 renderSportChips();
 document.querySelectorAll("[data-match-field]").forEach(field=>field.hidden=race);
 document.querySelectorAll("[data-race-field]").forEach(field=>field.hidden=!race);
 $("#query-form").classList.toggle("race-query",race);
 $("[data-view=players]").hidden=race;
 $("#cricket-toss").hidden=meta.id!=="cricket"||meta.demo;
 if(race){
  setView(activeView==="players"?"overview":activeView);
  selectRace(meta.races.find(r=>r.race_id===meta.default_race));
  renderModels();renderMatchPicker();return;
 }
 $("#race-grid-editor").hidden=true;
 setView(activeView);
 const defaults=meta.recommended_teams||meta.teams;const team=reset?defaults[0]:$("#team").value;const opponent=reset?defaults[1]:$("#opponent").value;
 options($("#team"),meta.teams,team);options($("#opponent"),meta.teams.filter(x=>x!==$("#team").value),opponent);
 $("#team-label").textContent=meta.side;
 if($("#team")?._combobox) $("#team")._combobox.trigger.setAttribute("aria-label", meta.side);
 if($("#demo-banner")) $("#demo-banner").hidden=true;
 $("#player-unit-badge").textContent=`Player score · ${meta.player_unit}`;
 if(!meta.demo)realConfig=state.config;
 populatePlayers();renderModels();renderMatchPicker();syncCricketInputs();
}
function renderMatchPicker(){
 const meta=sportMeta(), date=$("#cutoff").value, matches=(meta?.available_matches||[]).filter(m=>m.date===date);
 const picker=$("#match-picker");if(!meta||!date||meta.kind==="race"){picker.hidden=true;return;}
 const available=matches.length?matches:(meta.available_matches||[]).filter(m=>m.date<date).slice(-3).reverse();
 picker.hidden=!available.length;
 $("#match-picker-title").textContent=matches.length?"Matches available on this date":"No match on this date · recent records";
 $("#match-picker-note").textContent=matches.length?"Select a recorded matchup to prefill the analysis.":"Choose a recent recorded matchup, or keep the current sides for a pre-match estimate.";
 $("#match-picker-badge").textContent=matches.length?`${matches.length} recorded`:"nearest available";
 $("#match-picker-list").innerHTML=available.map(m=>`<button class="match-option" type="button" data-match-id="${e(m.match_id)}"><span>${e(nice(m.team))} <b>vs</b> ${e(nice(m.opponent))}</span><small>${e(dateLabel(m.date))} · ${e(m.venue)} venue</small><span aria-hidden="true">${icon("arrow")}</span></button>`).join("");
 $("#match-picker-list").querySelectorAll(".match-option").forEach(button=>button.addEventListener("click",()=>{
  const m=meta.available_matches.find(item=>item.match_id===button.dataset.matchId);if(!m)return;
  $("#team").value=m.team;$("#opponent").value=m.opponent;$("#cutoff").value=m.date;
  $("#team")?._combobox?.sync();$("#opponent")?._combobox?.sync();
  populatePlayers();renderMatchPicker();syncCricketInputs();analyze(false);
 }));
}
function populatePlayers(result){
 const meta=sportMeta();const team=$("#team").value,opponent=$("#opponent").value;
 options($("#player"),result?.players[team]||meta.players[team]||[],result?.player||$("#player").value);
 options($("#opponent-player"),result?.players[opponent]||meta.players[opponent]||[],result?.opponent_player||$("#opponent-player").value);
 $("#player-form button").disabled=!$("#player").value||!$("#opponent-player").value;
}
function setView(view){
 if(view==="guide")view="models";
 activeView=view;document.querySelectorAll(".view").forEach(x=>x.hidden=x.id!==`${view}-view`);
 document.querySelectorAll("[data-view]").forEach(x=>{x.classList.toggle("active",x.dataset.view===view);if(x.dataset.view===view)x.setAttribute("aria-current","page");else x.removeAttribute("aria-current");});
 $("#predict-layout").hidden=view==="models";
 const titles={overview:["Who's going to win?","Pick a sport and two sides. You get the likely winner, the expected score and the players to watch."],players:["Player against player","See how one player has done against another."],models:["Settings","Your data, your models and how the predictions are made."]};
 const title=view==="overview"&&state&&sportMeta()?.kind==="race"?["Who wins the race?","Each driver's chance to win, reach the podium and score points."]:titles[view];
 $("#page-title").textContent=title[0];$("#page-subtitle").textContent=title[1];
}
const SPORT_ICONS={football:"⚽",cricket:"🏏",tennis:"🎾",badminton:"🏸",baseball:"⚾",rugby:"🏉",f1:"🏎️"};
function renderSportChips(){
 const current=$("#sport").value;
 $("#sport-chips").innerHTML=state.catalog.map(s=>`<button type="button" class="sport-chip${s.id===current?" active":""}" data-sport="${e(s.id)}" aria-pressed="${s.id===current}"><span aria-hidden="true">${SPORT_ICONS[s.id]||"🏅"}</span>${e(s.name)}</button>`).join("");
}
let cricketKey="", confirmedToss=false;
const xiNames=id=>$(id).value.split(/\r?\n/).map(name=>name.trim()).filter(Boolean);
const cricketFixtureKey=()=>JSON.stringify([$("#team").value,$("#opponent").value,$("#cutoff").value]);
async function syncCricketInputs(){
 const panel=$("#cricket-toss"), key=cricketFixtureKey();
 if(panel.hidden||!panel.open||cricketKey===key)return;
 cricketKey=key;confirmedToss=false;$("#cricket-reset-toss").hidden=true;
 const [team,opponent,cutoff]=JSON.parse(key);
 $("#toss-winner").innerHTML='<option value="">Select team</option>'+[team,opponent].map(name=>`<option value="${e(name)}">${e(name)}</option>`).join("");
 $("#toss-decision").value="";
 $("#team-xi-label").textContent=`${team} starting XI`;
 $("#opponent-xi-label").textContent=`${opponent} starting XI`;
 const inputs=[$("#team-xi"),$("#opponent-xi")];
 inputs.forEach(input=>{input.value="";input.disabled=true;});
 $("#cricket-run-toss").disabled=true;
 $("#cricket-xi-status").textContent="Loading last recorded XIs…";
 try{
  const data=await api("/api/cricket-xi",{team,opponent,cutoff});
  if(cricketKey!==key)return;
  inputs[0].value=data.team_xi.join("\n");inputs[1].value=data.opponent_xi.join("\n");
  $("#cricket-xi-status").textContent=data.team_xi.length&&data.opponent_xi.length?"Review the pre-filled names. Enter one player per line.":"One or both previous XIs are unavailable. Enter 11 names for each team, one per line.";
 }catch(err){if(cricketKey===key)$("#cricket-xi-status").textContent=err.message;}
 finally{if(cricketKey===key){inputs.forEach(input=>input.disabled=false);$("#cricket-run-toss").disabled=false;}}
}

function tossInputs(){
 const toss_winner=$("#toss-winner").value,toss_decision=$("#toss-decision").value;
 const team_xi=xiNames("#team-xi"),opponent_xi=xiNames("#opponent-xi");
 if(!toss_winner||!toss_decision||team_xi.length!==11||opponent_xi.length!==11||
    new Set([...team_xi,...opponent_xi].map(name=>name.toLowerCase())).size!==22)return null;
 return {stage:"post_toss",toss_winner,toss_decision,team_xi,opponent_xi};
}

let gridRaceId=null, gridEdited=false;
function selectedRace(){return sportMeta().races.find(r=>r.race_id===$("#race-round").value);}
function raceOptions(season, raceId){
 const races=sportMeta().races.filter(r=>String(r.season)===season);
 // Group by date, not the dataset's "completed" flag, which lags until results are imported.
 const today=new Date().toISOString().slice(0,10);
 const label=r=>`${r.round}. ${r.name} · ${new Date(`${r.date}T12:00:00Z`).toLocaleDateString([],{day:"numeric",month:"short",timeZone:"UTC"})}`;
 const option=r=>`<option value="${e(r.race_id)}">${e(label(r))}</option>`;
 const group=(name,rows)=>rows.length?`<optgroup label="${name}">${rows.map(option).join("")}</optgroup>`:"";
 const past=races.filter(r=>r.date<today), ahead=races.filter(r=>r.date>=today);
 $("#race-round").innerHTML=past.length&&ahead.length?group("Completed",past)+group("Upcoming",ahead):races.map(option).join("");
 if(races.some(r=>r.race_id===raceId))$("#race-round").value=raceId;
}
function selectRace(race){
 options($("#race-season"),sportMeta().seasons.map(String),String(race.season));
 raceOptions(String(race.season),race.race_id);
}
async function raceField(race){
 const status=$("#race-grid-status");
 const field=await api("/api/race-field",{season:race.season,round:race.round});
 if(sportMeta()?.kind!=="race"||selectedRace()?.race_id!==race.race_id)return;
 gridRaceId=race.race_id;gridEdited=false;
 $("#race-grid-list").innerHTML=field.drivers.map((row,i)=>`<div class="field"><label for="race-grid-${i}">${e(row.driver)}</label><input id="race-grid-${i}" type="number" inputmode="numeric" min="0" max="${field.drivers.length}" step="1" data-driver="${e(row.driver_id)}" value="${row.grid??""}"></div>`).join("");
 status.textContent=`${field.source}. Use 0 for a pit-lane start or no regular grid slot.`;
}
function renderRace(a){
 const p=a.provenance, stage=a.stage==="post_qualifying"?"After qualifying":"Before the weekend";
 const record=a.track_record, rival=record?.baselines[a.stage==="post_qualifying"?"grid":"championship_standings"];
 const low=rival&&!rival.beats_baseline;
 const percent=value=>`${fmt(value*100,0)}%`;
 const drivers=a.drivers.slice().sort((x,y)=>y.win-x.win);
 const top=drivers[0], maxWin=Math.max(.01,top.win);
 const hasGrid=drivers.some(d=>d.grid!=null);
 const podium=drivers.slice().sort((x,y)=>y.podium-x.podium).slice(0,3);
 $("#overview-content").classList.remove("loading-placeholder");
 $("#overview-content").innerHTML=`<article class="verdict-card">
  <div class="verdict-kicker">Formula 1 · ${e(a.name)} · ${e(dateLabel(a.date))} · ${stage}</div>
  <h2 class="verdict-title">${e(top.driver)} is the favourite</h2>
  <div class="verdict-chips"><span class="chip ${low?"low":"medium"}">${percent(top.win)} chance to win</span>${low?'<span class="chip low">Low confidence</span>':""}</div>
  <div class="podium-picks"><span class="tiny-label">Most likely podium</span>${podium.map((d,i)=>`<div class="podium-pick"><b>${i+1}</b><span>${e(d.driver)}<small>${e(d.constructor)}</small></span><strong>${percent(d.podium)}</strong></div>`).join("")}</div>
  ${low?`<p class="verdict-warning">Heads up: so far these race predictions have not beaten simply using the ${a.stage==="post_qualifying"?"starting grid":"championship standings"}.</p>`:""}
 </article>
 <article class="card table-card"><div class="card-heading"><div><h3>Every driver's chances</h3><p>${e(a.circuit)} · sorted by chance to win</p></div></div>
 <div class="table-wrap" tabindex="0" role="region" aria-label="Scrollable Grand Prix forecast"><table class="race-result-table big-table"><caption class="sr-only">Grand Prix forecast by driver</caption><thead><tr><th scope="col">#</th><th scope="col">Driver</th><th scope="col">Chance to win</th><th class="num" scope="col">Podium</th><th class="num" scope="col">Points (top 10)</th>${hasGrid?'<th class="num" scope="col">Starts</th>':""}<th class="num" scope="col">Average finish</th>${a.completed?'<th class="num" scope="col">Actual finish</th>':""}</tr></thead>
 <tbody>${drivers.map((row,i)=>`<tr><td class="rank">${i+1}</td><th scope="row">${e(row.driver)}<small>${e(row.constructor)}${row.prior_races===0?" · first race":""}</small></th><td><div class="bar-cell"><div class="bar-track"><div class="bar-fill" style="width:${row.win/maxWin*100}%"></div></div><b>${percent(row.win)}</b></div></td><td class="num">${percent(row.podium)}</td><td class="num">${percent(row.points)}</td>${hasGrid?`<td class="num">${row.grid===0?"No slot":row.grid?`P${row.grid}`:"—"}</td>`:""}<td class="num">P${fmt(row.expected_position,0)}</td>${row.actual?`<td class="num">${row.actual.finish} · ${e(row.actual.status)}</td>`:""}</tr>`).join("")}</tbody></table></div></article>
 <details class="card details-toggle"><summary>About this prediction</summary>${record?`<p class="note">In past races it picked the winner ${record.correct} times out of ${record.n} (${percent(record.accuracy)}).</p>`:""}<p class="note">${e(p.model)} · ${fmt(p.simulations,0)} simulated races · fitted through ${e(dateLabel(p.fitted_through))}</p><p class="note">${e(p.field_source)}${p.grid_source?` · ${e(p.grid_source)}`:""}</p><p class="note">${e(p.data_sources.source)} · ${e(p.data_sources.license)} · data through ${e(dateLabel(p.data_sources.latest))}</p><ul class="limits-list">${p.data_sources.limitations.map(item=>`<li>${e(item)}</li>`).join("")}</ul></details>`;
}
function source(p){return `<span class="source-label ${e(p.source)}">${p.source==="model"?icon("layers"):p.source==="reference"?icon("chart"):icon("info")} ${p.source==="model"?`Model · ${e(p.model)}`:p.source==="reference"?"Historical reference":"Unavailable"}</span>`;}
function sanitizeError(msg){
 if(!msg) return "";
 let clean=String(msg).trim();
 clean=clean.replace(/^[a-zA-Z0-9_]+Error:\s*/i,"");
 return clean.charAt(0).toUpperCase()+clean.slice(1);
}
function unavailable(p){
 if(!p||!p.error) return "";
 const raw=String(p.error);
 const clean=sanitizeError(raw);
 return `<div class="warn-badge" title="${e(raw)}"><span class="warn-badge-icon" aria-hidden="true">${icon("info")}</span><span class="warn-badge-text">${e(clean)}</span></div>`;
}
function initials(name){return name.split(/\s+/).slice(0,2).map(s=>s[0]).join("").toUpperCase();}
function formTokens(rows){return rows.map(r=>`<span class="form-token ${r.result}" title="${e(r.date)} · ${e(nice(r.opponent))} · ${fmt(r.score)}–${fmt(r.conceded)}" aria-label="${e(r.date)} ${r.result==="W"?"Win":r.result==="L"?"Loss":"Draw"}">${r.result}</span>`).join("");}
function metric(title,value,unit,sub,p,ico="chart"){return `<article class="card metric-card"><div class="metric-top"><span>${icon(ico)}</span>${e(title)}</div><div class="metric-number">${value}<small>${e(unit)}</small></div><div class="metric-sub">${e(sub)}</div>${source(p)}${unavailable(p)}</article>`;}
function lineChart(series,unit){
 const w=600,h=195,left=37,right=12,top=15,bottom=28;
 const values=series.flatMap(s=>s.rows.map(r=>Number(r.score)));if(!values.length)return '<p class="empty">No historical scores available.</p>';
 const max=Math.max(1,...values)*1.15;const n=Math.max(...series.map(s=>s.rows.length));
 const x=i=>left+(w-left-right)*(n===1?.5:i/(n-1));const y=v=>h-bottom-(h-bottom-top)*v/max;
 let svg=`<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Recent ${e(unit)} by match, chronological order; values are in the table below"><title>Recent ${e(unit)}, oldest to newest</title>`;
 for(let i=0;i<4;i++){const v=max*i/3;svg+=`<line x1="${left}" x2="${w-right}" y1="${y(v)}" y2="${y(v)}" stroke="#e7ebe3" stroke-dasharray="3 4"/><text x="${left-9}" y="${y(v)+3}" text-anchor="end">${fmt(v,max>20?0:1)}</text>`;}
 const ticks=[...new Set([0,Math.floor((n-1)/2),n-1])];for(const i of ticks)svg+=`<text x="${x(i)}" y="${h-5}" text-anchor="middle">Match ${i+1}</text>`;
 series.forEach((s,si)=>{const color=si===0?"#215f46":"#b96825";const points=s.rows.map((r,i)=>`${x(i)},${y(r.score)}`).join(" ");svg+=`<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.4" ${si?'stroke-dasharray="6 4"':""} stroke-linejoin="round"/>`;s.rows.forEach((r,i)=>svg+=`<circle cx="${x(i)}" cy="${y(r.score)}" r="3.5" fill="${color}" stroke="white" stroke-width="1.5"><title>${e(s.name)} · ${e(r.date)} · ${fmt(r.score)} ${e(unit)}</title></circle>`);});
 return svg+"</svg>";
}
let currentHistoryTab = "h2h";

function renderMatchesSection(a){
 const directMeetings = (a.h2h || []).slice().reverse();
 const teamRows = a.history[0] || [];
 const oppRows = a.history[1] || [];
 const combinedRows = a.history.flatMap((hist, i) => hist.map(r => ({ ...r, side: [a.team, a.opponent][i] })))
  .sort((x, y) => y.date.localeCompare(x.date) || x.side.localeCompare(y.side));

 let tableContent = "";
 if(currentHistoryTab === "h2h"){
  if(!directMeetings.length){
   tableContent = `<div class="card empty"><p>No direct head-to-head meetings recorded between <strong>${e(nice(a.team))}</strong> and <strong>${e(nice(a.opponent))}</strong> before ${e(dateLabel(a.cutoff))}.</p><p class="note">Click “${e(nice(a.team))} Form” or “${e(nice(a.opponent))} Form” above to inspect each team's recent matches against prior opponents.</p></div>`;
  } else {
   tableContent = `
    <div class="table-wrap">
     <table class="h2h-table-custom">
      <thead>
       <tr>
        <th>Date</th>
        <th>${e(nice(a.team))}</th>
        <th>${e(nice(a.opponent))}</th>
        <th class="num">${e(nice(a.team))} (${e(a.meta.unit)})</th>
        <th class="num">${e(nice(a.opponent))} (${e(a.meta.unit)})</th>
        <th>Direct Result</th>
       </tr>
      </thead>
      <tbody>
       ${directMeetings.map(r => {
        const isWin = r.result === "W", isLoss = r.result === "L", isDraw = r.result === "D";
        const winner = isWin ? a.team : isLoss ? a.opponent : "Draw";
        const diff = Math.abs(r.score - r.conceded);
        const marginText = isDraw ? "Draw" : `${winner} won (+${fmt(diff,0)} ${e(a.meta.unit)})`;
        const badgeCls = isWin ? "h2h-outcome-won" : isLoss ? "h2h-outcome-lost" : "h2h-outcome-draw";
        return `
         <tr>
          <td><strong>${e(dateLabel(r.date))}</strong></td>
          <td>${e(nice(a.team))}</td>
          <td>${e(nice(a.opponent))}</td>
          <td class="num"><strong>${fmt(r.score,0)}</strong></td>
          <td class="num"><strong>${fmt(r.conceded,0)}</strong></td>
          <td><span class="${badgeCls}">${e(marginText)}</span></td>
         </tr>
        `;
       }).join("")}
      </tbody>
     </table>
    </div>
   `;
  }
 } else if(currentHistoryTab === "team"){
  tableContent = `
   <p class="note" style="margin-bottom:8px">Completed recent matches for <strong>${e(nice(a.team))}</strong> before this fixture:</p>
   <div class="table-wrap">
    <table>
     <thead><tr><th>Date</th><th>Team</th><th>Opponent</th><th class="num">${e(a.meta.unit)}</th><th class="num">Against</th><th>Result</th></tr></thead>
     <tbody>
      ${teamRows.slice().reverse().map(r => `<tr><td>${e(dateLabel(r.date))}</td><td><strong>${e(nice(a.team))}</strong></td><td>${e(nice(r.opponent))}</td><td class="num">${fmt(r.score,0)}</td><td class="num">${fmt(r.conceded,0)}</td><td><span class="form-token ${r.result}">${r.result}</span></td></tr>`).join("")}
     </tbody>
    </table>
   </div>
  `;
 } else if(currentHistoryTab === "opponent"){
  tableContent = `
   <p class="note" style="margin-bottom:8px">Completed recent matches for <strong>${e(nice(a.opponent))}</strong> before this fixture:</p>
   <div class="table-wrap">
    <table>
     <thead><tr><th>Date</th><th>Team</th><th>Opponent</th><th class="num">${e(a.meta.unit)}</th><th class="num">Against</th><th>Result</th></tr></thead>
     <tbody>
      ${oppRows.slice().reverse().map(r => `<tr><td>${e(dateLabel(r.date))}</td><td><strong>${e(nice(a.opponent))}</strong></td><td>${e(nice(r.opponent))}</td><td class="num">${fmt(r.score,0)}</td><td class="num">${fmt(r.conceded,0)}</td><td><span class="form-token ${r.result}">${r.result}</span></td></tr>`).join("")}
     </tbody>
    </table>
   </div>
  `;
 } else {
  tableContent = `
   <p class="note" style="margin-bottom:8px">Recent match records for both sides combined before ${e(dateLabel(a.cutoff))}:</p>
   <div class="table-wrap">
    <table>
     <thead><tr><th>Date</th><th>${e(a.meta.side)}</th><th>Opponent</th><th class="num">${e(a.meta.unit)}</th><th class="num">Against</th><th>Result</th></tr></thead>
     <tbody>
      ${combinedRows.map(r => `<tr><td>${e(dateLabel(r.date))}</td><td>${e(nice(r.side))}</td><td>${e(nice(r.opponent))}</td><td class="num">${fmt(r.score,0)}</td><td class="num">${fmt(r.conceded,0)}</td><td><span class="form-token ${r.result}">${r.result}</span></td></tr>`).join("")}
     </tbody>
    </table>
   </div>
  `;
 }

 return `
  <article class="card table-card" id="history-card">
   <div class="card-heading">
    <div>
     <h3>Head-to-head &amp; match records</h3>
     <p>Direct meetings between ${e(nice(a.team))} and ${e(nice(a.opponent))}, plus each side's recent matches before ${e(dateLabel(a.cutoff))}</p>
    </div>
    <span class="badge" id="history-badge">${currentHistoryTab === "h2h" ? `${directMeetings.length} direct meetings` : currentHistoryTab === "team" ? `${e(nice(a.team))} form` : currentHistoryTab === "opponent" ? `${e(nice(a.opponent))} form` : "all records"}</span>
   </div>
   <div class="sub-tabs" role="tablist">
    <button class="sub-tab ${currentHistoryTab === 'h2h' ? 'active' : ''}" type="button" data-htab="h2h">Direct Clashes (${directMeetings.length})</button>
    <button class="sub-tab ${currentHistoryTab === 'team' ? 'active' : ''}" type="button" data-htab="team">${e(nice(a.team))} Form (${teamRows.length})</button>
    <button class="sub-tab ${currentHistoryTab === 'opponent' ? 'active' : ''}" type="button" data-htab="opponent">${e(nice(a.opponent))} Form (${oppRows.length})</button>
    <button class="sub-tab ${currentHistoryTab === 'all' ? 'active' : ''}" type="button" data-htab="all">Combined All (${combinedRows.length})</button>
   </div>
   <div id="history-table-body">${tableContent}</div>
  </article>
 `;
}

function wireHistoryTabs(a){
 const card = $("#history-card");
 if(!card) return;
 card.querySelectorAll(".sub-tab").forEach(tab => {
  tab.addEventListener("click", () => {
   currentHistoryTab = tab.dataset.htab;
   card.outerHTML = renderMatchesSection(a);
   wireHistoryTabs(a);
  });
 });
}

const toDecimalOdds = p => (p == null || p <= 0) ? "—" : (1 / p).toFixed(2);
const toAmericanOdds = p => {
 if (p == null || p <= 0 || p >= 1) return "—";
 return p >= 0.5 ? `-${Math.round((p / (1 - p)) * 100)}` : `+${Math.round(((1 - p) / p) * 100)}`;
};

function winnerInfo(a){
 const probs=a.winner.value;
 if(!probs)return null;
 const names={team:nice(a.team),opponent:nice(a.opponent),draw:"Draw"};
 const sorted=Object.entries(probs).sort((x,y)=>y[1]-x[1]);
 const [key,p]=sorted[0];
 const tie=sorted.length>1&&sorted[1][1]>p-.02;
 const weak=a.winner.source==="model"&&a.winner.track_record&&!a.winner.track_record.beats_baseline;
 let title,level,label;
 if(tie){title="Too close to call";level="low";label="No clear favourite";}
 else if(key==="draw"){title="A draw is the most likely result";level="low";label="Open match";}
 else if(p>=.65){title=`${names[key]} should win`;level="high";label="Strong favourite";}
 else if(p>=.5){title=`${names[key]} is likely to win`;level="medium";label="Slight favourite";}
 else{title=`${names[key]} has the edge`;level="low";label="Narrow edge";}
 if(weak){level="low";label="Low confidence";}
 return {probs,names,key,p,tie,title,level,label,weak};
}
function verdictCard(a){
 const w=winnerInfo(a);
 const venue=a.venue==="home"?`${nice(a.team)} at home`:a.venue==="away"?`${nice(a.opponent)} at home`:"";
 const stage=a.sport==="cricket"&&!a.demo?(a.stage==="post_toss"?"After the toss":"Before the toss"):"";
 const kicker=[a.meta.name,dateLabel(a.cutoff),venue,stage].filter(Boolean).map(e).join(" · ");
 if(!w)return `<article class="verdict-card"><div class="verdict-kicker">${kicker}</div><h2 class="verdict-title">No winner prediction for this match</h2><p class="verdict-warning">${e(sanitizeError(a.winner.error)||"There is not enough past data for these two sides.")}</p></article>`;
 const order=["team","draw","opponent"].filter(k=>k in w.probs);
 const lead=w.tie?null:w.key;
 const side=k=>k==="draw"
  ?`<div class="side draw${lead==="draw"?" lead":""}"><strong>${pct(w.probs.draw)}</strong><small>draw</small></div>`
  :`<div class="side ${k}${lead===k?" lead":""}"><span class="crest${k==="opponent"?" orange":""}">${e(initials(w.names[k]))}</span><span class="side-name">${e(w.names[k])}</span><strong>${pct(w.probs[k])}</strong><small>chance to win</small></div>`;
 const t=a.winner.track_record;
 const record=t?`<p class="verdict-record">Track record: right in ${fmt(100*t.accuracy,0)} of every 100 past ${e(a.meta.name.toLowerCase())} matches tested.</p>`:"";
 return `<article class="verdict-card level-${w.level}">
  <div class="verdict-kicker">${kicker}</div>
  <h2 class="verdict-title">${e(w.title)}</h2>
  <div class="verdict-chips"><span class="chip ${w.level}">${e(w.label)}</span>${a.demo?'<span class="chip low">Sample data, not real matches</span>':""}${dataAge(a)}</div>
  <div class="versus">${order.map(side).join("")}</div>
  <div class="probability-track" aria-hidden="true">${order.map(k=>`<span class="segment-${k}" style="width:${w.probs[k]*100}%"></span>`).join("")}</div>
  ${w.weak?'<p class="verdict-warning">Heads up: for this sport the predictions have not been more accurate than guessing so far. Treat this as a coin flip.</p>':record}
  ${a.winner.source==="reference"?'<p class="verdict-record">Based on past results only, not a trained model.</p>':""}
 </article>`;
}
function scoreCard(a){
 const [x,y]=a.scores, unit=a.meta.unit;
 if(x.value==null||y.value==null){
  return `<article class="card score-card"><h3>Expected score</h3><p class="empty">No score estimate for this match.</p><p class="note">${e(sanitizeError(x.error||y.error)||"")}</p></article>`;
 }
 const w=winnerInfo(a);
 let digits=0;
 // Whole numbers read best, but never show a level score when one side is the pick.
 if(Math.round(x.value)===Math.round(y.value)&&w&&!w.tie&&w.key!=="draw")digits=1;
 const big=Math.max(x.value,y.value)>=100;
 return `<article class="card score-card"><h3>Expected score</h3>
  <div class="scoreline${big?" big-numbers":""}">
   <div class="score-side"><strong>${fmt(x.value,digits)}</strong><span>${e(nice(a.team))}</span></div>
   <i aria-hidden="true">–</i>
   <div class="score-side"><strong>${fmt(y.value,digits)}</strong><span>${e(nice(a.opponent))}</span></div>
  </div>
  <p class="score-unit">${e(unit)}${digits===0&&!big?` · exact estimate ${fmt(x.value)} – ${fmt(y.value)}`:""}</p>
  <p class="note">An average expectation, not a guaranteed final score.</p></article>`;
}
function playersCard(a){
 const head=(sub)=>`<div class="card-heading"><div><h3>Who scores how much</h3><p>${sub}</p></div></div>`;
 if(a.sport==="cricket"&&!a.demo){
  return `<article class="card players-card">${head("Expected runs and wickets for each player")}<div id="players-slot"><p class="loading-line">Working out each player's runs and wickets…</p></div><div id="cricket-slot"></div></article>`;
 }
 const rows=[];
 if(a.player&&a.player_score.value!=null)rows.push(`<div class="player-stat"><span class="tiny-label">${e(nice(a.player))}</span><strong>${fmt(a.player_score.value)}<small>${e(a.meta.player_unit)} expected</small></strong></div>`);
 if(a.player&&a.opponent_player&&a.threat.value!=null)rows.push(`<div class="player-stat"><span class="tiny-label">${e(nice(a.player))} against ${e(nice(a.opponent_player))}</span><strong>${pct(a.threat.value)}<small>${e(a.meta.threat.toLowerCase())}</small></strong></div>`);
 if(!rows.length){
  return `<article class="card players-card muted-card">${head("Per-player predictions")}<p class="empty">No player numbers for ${e(a.meta.name.toLowerCase())} yet. This data has match results only, so the prediction covers the two sides, not individual players.</p></article>`;
 }
 const many=(a.players?.[a.team]?.length||0)>1||(a.players?.[a.opponent]?.length||0)>1;
 return `<article class="card players-card">${head(many?"One player shown. Pick any other two in the Players tab.":"Individual numbers for this match")}<div class="player-stats">${rows.join("")}</div><button class="inline-link" type="button" data-go-players>${many?"Compare other players":"See the player details"} ${icon("arrow")}</button></article>`;
}
function cricketPlayersTable(context){
 const p=context.projections;
 if(!p)return `<p class="empty">${e(context.projection_note||"No player estimates for this match.")}</p>`;
 const names=[context.fixture.team,context.fixture.opponent];
 const all=p.sides.flatMap(side=>side.players);
 if(!all.some(x=>x.runs!=null||x.wickets!=null))return '<p class="empty">Not enough past matches to estimate individual players here.</p>';
 const maxRuns=Math.max(1,...all.map(x=>x.runs||0));
 const best=(key)=>all.filter(x=>x[key]!=null).sort((x,y)=>y[key]-x[key])[0];
 const topBat=best("runs"),topBowl=best("wickets");
 const provisional=p.sides.some(side=>side.source==="Last archived playing squad");
 const picks=`<div class="player-stats">${topBat?`<div class="player-stat"><span class="tiny-label">Top scorer pick</span><strong>${e(topBat.name)}<small>about ${fmt(topBat.runs,0)} runs</small></strong></div>`:""}${topBowl&&topBowl.wickets>0?`<div class="player-stat"><span class="tiny-label">Top wicket-taker pick</span><strong>${e(topBowl.name)}<small>about ${fmt(topBowl.wickets,1)} wickets</small></strong></div>`:""}</div>`;
 const table=(side,i)=>{
  const rows=side.players.slice().sort((x,y)=>(y.runs??-1)-(x.runs??-1));
  return `<div class="squad"><h4><span class="swatch ${i?"opponent":"team"}"></span>${e(names[i])}</h4>
   <table class="big-table"><caption class="sr-only">Expected runs and wickets for ${e(names[i])}</caption><thead><tr><th scope="col">Player</th><th scope="col">Runs</th><th class="num" scope="col">Wickets</th></tr></thead>
   <tbody>${rows.map(r=>`<tr><th scope="row">${e(r.name)}</th><td><div class="bar-cell"><div class="bar-track"><div class="bar-fill ${i?"orange":""}" style="width:${(r.runs||0)/maxRuns*100}%"></div></div><b>${r.runs==null?"—":fmt(r.runs,0)}</b></div></td><td class="num">${r.wickets==null?"—":fmt(r.wickets,1)}</td></tr>`).join("")||'<tr><td colspan="3">No line-up recorded.</td></tr>'}</tbody></table></div>`;
 };
 return `${picks}<div class="squad-grid">${p.sides.map(table).join("")}</div><p class="note">Averages per match from each player's last ${p.window} games in this format.${provisional?" Line-ups are each team's last recorded XI, so check the actual team sheet.":""}</p>`;
}
function whyCard(a){
 const A=nice(a.team),B=nice(a.opponent);
 const rows=[],side=(x,y,eps)=>Math.abs(x-y)<=eps?"Even":x>y?A:B;
 const [x,y]=a.summaries;
 const rec=q=>`${q.wins} won${a.meta.draw?`, ${q.draws} drawn`:""}, ${q.losses} lost`;
 if(x.matches&&y.matches){
  rows.push([`Last ${a.window} matches`,`${A}: ${rec(x)}`,`${B}: ${rec(y)}`,side(x.win_rate,y.win_rate,.01)]);
  rows.push([`Average ${a.meta.unit} per match`,`${A}: ${fmt(x.avg)}`,`${B}: ${fmt(y.avg)}`,side(x.avg,y.avg,.05)]);
 }
 const h=a.h2h_summary;
 rows.push(["Against each other",h.matches?`${A} won ${h.wins}${a.meta.draw?`, drew ${h.draws}`:""}`:"They have not met before this date",h.matches?`${B} won ${h.losses} (last ${h.matches} meetings)`:"",h.matches?side(h.wins,h.losses,0):"—"]);
 const s=a.strength;
 if(s&&(s.team.matches||s.opponent.matches))rows.push(["Overall strength rating",`${A}: ${fmt(s.team.rating,0)}`,`${B}: ${fmt(s.opponent.rating,0)}`,side(s.team.rating,s.opponent.rating,15)]);
 if(a.venue!=="neutral")rows.push(["Home advantage",a.venue==="home"?`${A} play at home`:`${B} play at home`,"",a.venue==="home"?A:B]);
 const tag=w=>w==="Even"||w==="—"?`<span class="reason-tag even">${e(w==="—"?"No data":w)}</span>`:`<span class="reason-tag ${w===A?"team":"opponent"}">Favours ${e(w)}</span>`;
 const form=[a.team,a.opponent].map((t,i)=>a.history[i].length?`<div class="form-row"><span class="form-team">${e(nice(t))}</span><div class="form-tokens">${formTokens(a.history[i])}</div></div>`:"").join("");
 return `<article class="card reasons-card"><div class="card-heading"><div><h3>Why</h3><p>What has actually happened in past matches before ${e(dateLabel(a.cutoff))}</p></div></div>
  ${form?`<div class="form-block"><span class="tiny-label">Recent results, oldest to newest</span>${form}</div>`:""}
  <div class="reasons-grid">${rows.map(([label,one,two,who])=>`<div class="reason"><span class="tiny-label">${e(label)}</span><p>${e(one)}</p>${two?`<p>${e(two)}</p>`:""}${tag(who)}</div>`).join("")}</div></article>`;
}
function renderOverview(a){
 $("#overview-content").classList.remove("loading-placeholder");
 const allHistory=[a.team,a.opponent].map((name,i)=>({name,rows:a.history[i]}));
 const h=a.h2h_summary;const max=Math.max(1,...a.h2h.flatMap(r=>[r.score,r.conceded]));
 const deep=`<div class="two-column"><article class="card"><div class="card-heading"><div><h3>Scoring in recent matches</h3><p>Each side's own last ${a.window} matches</p></div><span class="badge">${e(a.meta.unit)}</span></div><div class="chart-key"><span class="legend-key"><i class="swatch"></i>${e(nice(a.team))} · solid</span><span class="legend-key"><i class="swatch orange"></i>${e(nice(a.opponent))} · dashed</span></div>${lineChart(allHistory,a.meta.unit)}</article>
 <article class="card"><div class="card-heading"><div><h3>When they met</h3><p>Last ${a.window} direct meetings</p></div><span class="badge">${h.matches} meetings</span></div>${h.matches?`<div class="h2h-stats"><div><strong>${h.wins}</strong><span>${e(nice(a.team))} wins</span></div><div><strong>${h.draws}</strong><span>Draws</span></div><div><strong>${h.losses}</strong><span>${e(nice(a.opponent))} wins</span></div></div><div class="h2h-bars">${[a.team,a.opponent].map((t,i)=>{const value=i===0?h.avg:h.conceded;return `<div><div class="bar-label"><span>${e(nice(t))}</span><strong>${fmt(value)} ${e(a.meta.unit)}</strong></div><div class="bar-track"><div class="bar-fill ${i?"orange":""}" style="width:${value/max*100}%"></div></div></div>`;}).join("")}</div><p class="chart-caption">Average scores in their direct meetings.</p>`:'<p class="empty">These two have not met before this date.</p>'}</article></div>
 ${renderMatchesSection(a)}${sideBreakdowns(a)}<div id="cricket-evidence-slot"></div>${formForecasts(a)}`;
 const technical=`<details class="card details-toggle"><summary>Technical details · exact input values and file checksums</summary><p class="note">Data: ${e(a.provenance.data_dir)}<br>${e(a.provenance.cutoff_rule)}. Latest eligible match: ${e(a.provenance.latest_eligible)}.</p>${trackRecord(a)}${strengthLine(a)}<div class="table-wrap feature-values"><table><thead><tr><th>Feature</th><th class="num">${e(nice(a.team))}</th><th class="num">${e(nice(a.opponent))}</th></tr></thead><tbody>${Object.keys(state.features).map(k=>`<tr><td>${e(k)}</td><td class="num">${fmt(a.features[0][k],3)}</td><td class="num">${fmt(a.features[1][k],3)}</td></tr>`).join("")}</tbody></table></div>${[a.winner,...a.scores,a.player_score,a.threat].filter(p=>p.sha256).map(p=>`<p class="note">${e(p.model)} · SHA-256 ${e(p.sha256)}</p>`).join("")}</details>`;
 $("#overview-content").innerHTML=`<div class="result-grid">${verdictCard(a)}${scoreCard(a)}</div>${playersCard(a)}${whyCard(a)}
  <details class="details-toggle deep-details"><summary><span>See the details</span><small>Charts, every past result, limits and technical notes</small></summary><div class="deep-body">${deep}${notes(a)}${technical}${modelEvidence(a)}</div></details>`;
 wireHistoryTabs(a);
 $("#overview-content").querySelector("[data-go-players]")?.addEventListener("click",()=>setView("players"));
}
function notes(a){
 const items=[...a.warnings,`${a.provenance.cutoff_rule}. Threat metric: ${a.meta.threat.toLowerCase()}.`];
 const demo=a.demo?`<aside class="notes-card">${icon("info")}<div><strong>Sample data</strong><p>These are fictional fixtures for demonstration, not real matches or validated forecasts.</p></div></aside>`:"";
 return `${demo}<details class="card details-toggle limits-toggle"><summary>Limits of this analysis (${items.length})</summary><ul class="limits-list">${items.map(w=>`<li>${e(w)}</li>`).join("")}</ul></details>`;
}
function renderPlayers(a){
 const v=a.threat.value;const circumference=2*Math.PI*66;
 const gauge=`<svg class="threat-gauge" viewBox="0 0 180 180" role="img" aria-label="${e(a.meta.threat)}: ${pct(v)}"><circle cx="90" cy="90" r="66" fill="none" stroke="#edf1e7" stroke-width="11"/>${v!=null?`<circle cx="90" cy="90" r="66" fill="none" stroke="#4a7953" stroke-width="11" stroke-dasharray="${v*circumference} ${circumference}" transform="rotate(-90 90 90)" stroke-linecap="round"/>`:""}<text x="90" y="94" font-size="31" font-weight="600" text-anchor="middle">${pct(v)}</text><text x="90" y="115" font-size="9" text-anchor="middle">${v==null?"NO ESTIMATE":"THREAT ESTIMATE"}</text></svg>`;
 $("#player-content").innerHTML=`<div class="threat-layout"><article class="card"><div class="card-heading"><div><h3>Player vs. player threat</h3><p>${e(a.meta.threat)}</p></div>${icon("target")}</div>${gauge}<div class="threat-names">${e(nice(a.player)||"No player")} <span aria-hidden="true">↔</span> ${e(nice(a.opponent_player)||"No opposing player")}<small>Historical observed rate: ${pct(a.interaction.rate)}</small></div><div class="threat-facts"><span><strong>${fmt(a.interaction.successes,0)}</strong>successes</span><span><strong>${fmt(a.interaction.opportunities,0)}</strong>opportunities</span><span><strong>${a.interaction.meetings}</strong>meetings</span></div><div class="comparison-footer">${source(a.threat)}</div>${unavailable(a.threat)}<p class="chart-caption">Direction matters: successes are recorded for the selected player. Small samples can be unstable.</p></article>
 <article class="card"><div class="card-heading"><div><h3>${e(nice(a.player)||"Player")} · scoring form</h3><p>Most recent appearances for ${e(nice(a.team))}</p></div><span class="badge">${e(a.meta.player_unit)}</span></div><div class="metric-number">${fmt(a.player_score.value)}<small>expected ${e(a.meta.player_unit)}</small></div>${source(a.player_score)}${unavailable(a.player_score)}${lineChart([{name:a.player,rows:a.player_history}],a.meta.player_unit)}<div class="table-wrap"><table><caption class="sr-only">Selected player recent scores</caption><thead><tr><th>Date</th><th>Opponent</th><th class="num">${e(a.meta.player_unit)}</th></tr></thead><tbody>${a.player_history.slice().reverse().map(p=>`<tr><td>${e(dateLabel(p.date))}</td><td>${e(p.opponent)}</td><td class="num">${fmt(p.score,0)}</td></tr>`).join("")}</tbody></table></div></article></div>
 <article class="card table-card"><div class="card-heading"><div><h3>Direct interaction history</h3><p>${e(a.meta.threat)} · last ${a.window} distinct meetings</p></div><span class="badge">${a.interaction.meetings} meetings</span></div>${a.interaction.rows.length?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Player</th><th>Opponent</th><th class="num">Opportunities</th><th class="num">Successes</th><th class="num">Rate</th></tr></thead><tbody>${a.interaction.rows.slice().reverse().map(r=>`<tr><td>${e(dateLabel(r.date))}</td><td>${e(nice(r.player))}</td><td>${e(nice(r.opponent_player))}</td><td class="num">${fmt(r.opportunities,0)}</td><td class="num">${fmt(r.successes,0)}</td><td class="num">${pct(r.successes/r.opportunities)}</td></tr>`).join("")}</tbody></table></div>`:'<p class="empty">No recorded interactions for this pair before the prediction date. Choose another pair or connect interaction data.</p>'}</article>${breakdowns(a)}${notes(a)}`;
}
const PAIR_LABELS = {
 cricket: {opportunities:"Balls", successes:"Boundaries", score:"Runs", rate:"Boundary %", extra:["Strike rate", r => r.opportunities ? fmt(100*r.score/r.opportunities, 0) : "—"]},
 tennis: {opportunities:"Points", successes:"Points won", rate:"Won %"},
 badminton: {opportunities:"Rallies", successes:"Rallies won", rate:"Won %"},
};
const SPLIT_LIMIT = 8;
function splitTable(caption, head, rows, cells){
 if(!rows || !rows.length) return `<p class="empty">No records before the prediction date.</p>`;
 const line = r => `<tr>${cells(r).map((c, i) => `<td${i ? ' class="num"' : ""}>${c}</td>`).join("")}</tr>`;
 const top = rows.slice(0, SPLIT_LIMIT), rest = rows.slice(SPLIT_LIMIT);
 const table = body => `<div class="table-wrap"><table><caption class="sr-only">${e(caption)}</caption><thead><tr>${head.map((h, i) => `<th${i ? ' class="num"' : ""}>${e(h)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div>`;
 return table(top.map(line).join("")) + (rest.length ? `<details class="split-more"><summary>Show ${rest.length} more</summary>${table(rest.map(line).join(""))}</details>` : "");
}
function sampleCell(n){ return `${fmt(n,0)}${n < 5 ? ' <span class="small-sample" title="Fewer than 5: treat with caution">small</span>' : ""}`; }
function playerSplitCard(a, s){
 if(!s) return "";
 const unit = a.meta.player_unit;
 const cells = r => [e(r.key), sampleCell(r.appearances), fmt(r.average), fmt(r.best,0), fmt(r.total,0)];
 const head = first => [first, "Matches", `Avg ${unit}`, "Best", "Total"];
 const blocks = [[`vs each ${a.meta.side.toLowerCase()}`, s.by_opponent, "Opponent"], ...s.by_context.map(d => [`by ${d.label.toLowerCase()}`, d.rows, d.label])];
 return `<article class="card table-card split-card"><div class="card-heading"><div><h3>${e(nice(s.player))} · ${e(unit)} record</h3><p>${fmt(s.appearances,0)} recorded matches · average ${fmt(s.average)} ${e(unit)}</p></div><span class="badge">OBSERVED</span></div>${blocks.map(([title, rows, first]) => `<h4 class="split-title">${e(title)}</h4>${splitTable(`${s.player} ${title}`, head(first), rows, cells)}`).join("")}</article>`;
}
function pairSplitCard(a, s){
 if(!s) return "";
 const L = {opportunities:"Opportunities", successes:"Successes", rate:"Rate", ...(PAIR_LABELS[a.sport] || {})};
 const head = first => [first, "Meetings", L.opportunities, L.successes, L.rate, ...(L.score ? [L.score] : []), ...(L.extra ? [L.extra[0]] : [])];
 const cells = r => [e(r.key), sampleCell(r.meetings), fmt(r.opportunities,0), fmt(r.successes,0), pct(r.rate), ...(L.score ? [fmt(r.score,0)] : []), ...(L.extra ? [L.extra[1](r)] : [])];
 const total = {...s.total, key:"All meetings"};
 return `<article class="card table-card split-card wide"><div class="card-heading"><div><h3>${e(nice(s.player))} against ${e(nice(s.opponent_player))}</h3><p>Every recorded meeting before the prediction date</p></div><span class="badge">${fmt(s.total.meetings,0)} meetings</span></div>${splitTable("All meetings", head("Scope"), [total], cells)}${s.by_context.map(d => `<h4 class="split-title">by ${e(d.label.toLowerCase())}</h4>${splitTable(`${s.player} against ${s.opponent_player} by ${d.label}`, head(d.label), d.rows, cells)}`).join("")}</article>`;
}
function breakdowns(a){
 const b = a.breakdowns;
 if(!b) return "";
 const cards = [pairSplitCard(a, b.pair), pairSplitCard(a, b.pair_reverse), playerSplitCard(a, b.player), playerSplitCard(a, b.opponent_player)].filter(Boolean);
 if(!cards.length) return "";
 return `<section class="split-section"><div class="split-intro"><h3>Player breakdowns</h3><p>${e(b.note)} Rows marked “small” have fewer than five matches.</p></div><div class="split-grid">${cards.join("")}</div></section>`;
}
function sideBreakdowns(a){
 const sides = (a.breakdowns?.sides || []).filter(s => s.by_context.some(d => d.rows.length));
 if(!sides.length) return "";
 const draws = a.meta.draw && sides.some(s => s.by_context.some(d => d.rows.some(r => r.draws)));
 const head = first => [first, "Matches", draws ? "W-D-L" : "W-L", "Win %", `Avg ${a.meta.unit}`, "Avg against"];
 const cells = r => [e(r.key), sampleCell(r.matches), draws ? `${r.wins}-${r.draws}-${r.losses}` : `${r.wins}-${r.losses}`, pct(r.win_rate), fmt(r.average_scored), fmt(r.average_conceded)];
 return `<section class="split-section"><div class="split-intro"><h3>Record by ${e(sides[0].by_context.map(d => d.label.toLowerCase()).join(" and "))}</h3><p>${e(a.breakdowns.note)} Rows marked “small” have fewer than five matches.</p></div><div class="split-grid">${sides.map(s => `<article class="card table-card split-card"><div class="card-heading"><div><h3>${e(nice(s.side))}</h3><p>${fmt(s.matches,0)} recorded matches</p></div><span class="badge">OBSERVED</span></div>${s.by_context.map(d => `<h4 class="split-title">by ${e(d.label.toLowerCase())}</h4>${splitTable(`${s.side} by ${d.label}`, head(d.label), d.rows, cells)}`).join("")}</article>`).join("")}</div></section>`;
}
function dataAge(a){
 const last=a.provenance?.latest_eligible;
 if(!last)return "";
 const days=historyAgeDays(last),old=days>180;
 return `<span class="data-age${old?" old":""}" title="Most recent result used for either side">${old?"Old data: results":"Results"} through ${e(monthYear(last))}</span>`;
}
function trackRecord(a){
 const t=a.winner?.track_record;
 if(!t)return "";
 const verdict=t.beats_baseline?"Better than always predicting the usual outcome mix.":"Not measurably better than always predicting the usual outcome mix — treat as a coin flip.";
 return `<p class="track-record${t.beats_baseline?"":" weak"}"><strong>Measured record:</strong> picked the right outcome in ${fmt(100*t.accuracy,1)}% of ${fmt(t.n,0)} held-out matches (±${fmt(100*t.accuracy_95_margin,1)} points). ${verdict}</p>`;
}
function strengthLine(a){
 const s=a.strength;
 if(!s||(!s.team.matches&&!s.opponent.matches))return "";
 return `<p class="strength-line" title="${e(s.note)}"><strong>Strength rating:</strong> ${e(nice(a.team))} ${fmt(s.team.rating,0)} · ${e(nice(a.opponent))} ${fmt(s.opponent.rating,0)}${s.home_advantage_applied?" · venue adjustment applied":""}</p>`;
}
function formForecasts(a,playerOnly=false){
 if(!a.scoring_form)return "";
 if(![...(playerOnly?[]:a.scoring_form.teams),a.scoring_form.player].some(p=>p&&p.value!=null))return "";
 const forms=playerOnly?[[a.player,a.scoring_form.player,a.meta.player_unit]]:[[a.team,a.scoring_form.teams[0],a.meta.unit],[a.opponent,a.scoring_form.teams[1],a.meta.unit],[a.player||"Player",a.scoring_form.player,a.meta.player_unit]];
 return `<section class="form-forecasts card"><div class="card-heading"><div><h3>Chronos · next-appearance scoring form</h3><p>Appearance-order forecast. Opponent and venue are not inputs. Separate from TabICL opponent-adjusted scores.</p></div><span class="badge">FROZEN LOCAL MODEL</span></div><div class="forecast-grid">${forms.filter(([,p])=>p.value!=null).map(([name,p,unit])=>`<article><h4>${e(name)}</h4><div class="metric-number">${fmt(p.value)}<small>${e(unit)} · median</small></div>${p.value!=null?`<p class="note">Model quantiles: 10th ${fmt(p.q10)} · 90th ${fmt(p.q90)}<br>${p.provenance.history_count} prior appearances through ${e(p.provenance.history_end)}</p>`:""}${source(p)}${unavailable(p)}</article>`).join("")}</div><p class="note">Quantiles have no measured sports coverage guarantee. Match spacing is irregular and ignored. See source coverage before interpreting stale histories as current form.</p></section>`;
}
function modelEvidence(a){
 const tasks=[["Outcome",a.winner],["Focal side score",a.scores[0]],["Opponent score",a.scores[1]],["Player score",a.player_score],["Player threat",a.threat]];
 const models=tasks.filter(([,p])=>p.provenance);
 if(!models.length&&!a.scoring_form)return "";
 return `<details class="card details-toggle model-evidence"><summary>Technical details · model targets, training history and checksums</summary><p class="note">${e(a.provenance.data_sources?.source||"Local data")} · ${e(a.provenance.data_sources?.license||"Check local data license")}</p>${models.map(([name,p])=>`<h4>${e(name)}</h4><p class="note">${e(p.target)}<br>${e(p.model)} · ${p.provenance.context_rows} labeled rows from ${p.provenance.context_matches} matches · ${e(p.provenance.context_start)} to ${e(p.provenance.context_end)} · strictly before ${e(a.cutoff)}<br>${e(p.adjustment||"")}</p><details><summary>Exact input values and provenance</summary><pre>${e(JSON.stringify({features:p.features,raw_value:p.raw_value,sha256:p.sha256,provenance:p.provenance},null,2))}</pre></details>`).join("")}<details><summary>Chronos and dataset provenance</summary><pre>${e(JSON.stringify({scoring_form:a.scoring_form,data:a.provenance},null,2))}</pre></details></details>`;
}
function cricketReport(a){
 if(a.sport!=="cricket"||!a.insights)return "";
 const insight=a.insights;
 const horizons=insight.innings_forecasts.map(row=>`<div class="horizon-row"><strong>First ${row.overs} overs</strong><span class="unavailable-inline">${e(sanitizeError(row.error))}</span></div>`).join("");
 return `<section class="card cricket-report"><div class="card-heading"><div><h3>Cricket match report</h3><p>${e(insight.format)} · every figure is tied to the selected cutoff</p></div><span class="badge">DATA-GROUNDED</span></div><div class="report-grid"><article><span class="tiny-label">Pitch report</span><strong>Unavailable</strong><p class="report-warn">${e(sanitizeError(insight.pitch_report.error))}</p></article><article><span class="tiny-label">Player report</span><strong>${e(a.player||"No player selected")}</strong><p>${e(insight.player_report.basis)}</p><div class="report-values">${metricValue("Expected",a.player_score,a.meta.player_unit)}${metricValue("Threat",a.threat,"rate")}</div></article><article class="innings-report"><span class="tiny-label">Innings horizons</span><strong>Over-by-over output</strong>${horizons}</article></div><p class="note">The current dataset contains completed match totals and player/interactions only. It does not contain pitch/weather observations or over-by-over innings labels, so those requested outputs stay unavailable rather than being inferred from the final score.</p></section>`;
}
function metricValue(label,p,unit){return `<span><small>${e(label)}</small><b>${p?.value==null?"—":p.source==="reference"?fmt(p.value):fmt(p.value)} ${e(unit)}</b></span>`;}
let todayMatchesData = null, todayFilter = "all", todaySearchQuery = "", autoRefreshTimer = null, todayShowAll = false;
const TODAY_LIMIT = 8;
const SPORT_LABELS = {cricket:"Cricket", football:"Football", tennis:"Tennis", baseball:"Baseball", rugby:"Rugby", badminton:"Badminton", f1:"Formula 1"};
const HOME_VENUE_SPORTS = ["football", "baseball", "rugby"];

function localDay(d = new Date()){
 return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function todayIsStale(){ return !todayMatchesData || todayMatchesData.date !== localDay(); }
function clockTime(iso){
 const d = new Date(iso);
 return iso && !isNaN(d) ? d.toLocaleTimeString([], {hour:"numeric", minute:"2-digit"}) : "";
}
function monthYear(iso){
 const d = new Date(`${iso}T00:00:00`);
 return isNaN(d) ? iso : d.toLocaleDateString([], {month:"short", year:"numeric"});
}
function historyAgeDays(iso){
 const d = new Date(`${iso}T00:00:00`);
 return isNaN(d) ? 0 : Math.floor((Date.now() - d.getTime()) / 86400000);
}

async function loadTodayMatches(refresh = false, silent = false){
 const grid = $("#today-matches-grid"), badge = $("#today-matches-badge"), btn = $("#refresh-today-btn");
 if(refresh && !silent){ if(btn) btn.disabled = true; if(badge) badge.textContent = "Checking online…"; }
 try {
  const data = refresh ? await api("/api/refresh-today-matches", {}) : await fetch("/api/today-matches").then(r=>r.json());
  todayMatchesData = data;
  renderTodayStatus();
  renderTodayTabs();
  renderTodayMatches();
  if(refresh && !silent) toast(data.refresh_error || `Schedule updated: ${data.total_matches || 0} matches today`);
 } catch(err) {
  if(badge && !silent) badge.textContent = "Update failed";
  if(grid && !silent) grid.innerHTML = `<div class="card empty"><p>Unable to load today's matches: ${e(err.message)}</p></div>`;
 } finally {
  if(btn && !silent) btn.disabled = false;
 }
}

function renderTodayStatus(){
 const data = todayMatchesData, badge = $("#today-matches-badge"), note = $("#today-status-note");
 if(!data) return;
 const counts = data.counts || {};
 if(badge){
  badge.textContent = todayIsStale() ? "Schedule out of date" : `${counts.in || 0} live · ${counts.pre || 0} upcoming · ${counts.post || 0} finished`;
 }
 if(!note) return;
 const parts = [];
 if(data.refresh_error) parts.push(data.refresh_error);
 if(todayIsStale()) parts.push(data.date ? `Showing the schedule saved on ${data.date}. Press "Check updates" for today.` : `No schedule saved yet. Press "Check updates".`);
 else if(data.connected_to_internet === false) parts.push(`No schedule source could be reached. Check the internet connection, then press "Check updates".`);
 if((data.failed_sources || []).length) parts.push(`Not updated: ${data.failed_sources.join(", ")}.`);
 const updated = clockTime(data.last_updated);
 const fresh = !parts.length;
 if(fresh && updated) parts.push(`Updated ${updated}, your local time.`);
 note.textContent = parts.join(" ");
 note.classList.toggle("warn", !fresh);
 note.hidden = !parts.length;
}

function renderTodayTabs(){
 const holder = $("#today-sport-tabs");
 if(!holder || !todayMatchesData?.sports) return;
 const sports = {f1:[], ...todayMatchesData.sports};
 const keys = Object.keys(sports);
 if(todayFilter !== "all" && !keys.includes(todayFilter)) todayFilter = "all";
 const total = keys.reduce((n, k) => n + sports[k].length, 0);
 const tab = (id, label, count) => `<button class="sport-tab${todayFilter === id ? " active" : ""}" data-filter="${e(id)}" type="button" role="tab" aria-selected="${todayFilter === id}">${e(label)} <span class="tab-count">${count}</span></button>`;
 holder.innerHTML = tab("all", "All", total) + keys.filter(k => sports[k].length || k === todayFilter).map(k => tab(k, SPORT_LABELS[k] || k, sports[k].length)).join("");
}

function todayCard(m){
 const live = m.state === "in", done = m.state === "post";
 const chip = live ? `<span class="match-chip live"><span class="status-dot live-dot"></span>LIVE</span>`
  : done ? `<span class="match-chip done">Finished</span>`
  : `<span class="match-chip">${e(clockTime(m.start) || "Today")}</span>`;
 const side = (name, score) => `<div class="match-item-team"><span>${e(nice(name))}</span>${score ? `<span class="match-item-score">${e(score)}</span>` : ""}</div>`;
 const statusLine = (live || done) && m.status && !["Live", "Scheduled"].includes(m.status) ? `<div class="match-item-status">${e(m.status)}</div>` : "";
 let action = "";
 if(m.analyzable){
  action = `<button class="button primary match-item-btn" type="button" data-match-id="${e(m.id)}" title="Local results through ${e(monthYear(m.history_through))}">Predict</button>`;
 }else if(m.sportKey==="cricket" && m.opponent){
  action = `<button class="button secondary match-item-preview" type="button" data-preview-id="${e(m.id)}">Preview</button>`;
 }
 return `<article class="today-match-item${live ? " is-live" : ""}${action ? "" : " no-action"}">
   <div class="match-item-body">
    <div class="match-item-top">${chip}<span class="match-item-league">${e(SPORT_LABELS[m.sportKey] || m.sportKey)}${m.tournament ? ` · ${e(m.tournament)}` : ""}</span></div>
    <div class="match-item-teams">${side(m.team, m.team_score)}${m.opponent?side(m.opponent, m.opponent_score):""}</div>
    ${statusLine}
   </div>
   ${action || `<span class="match-item-note muted" title="${e(m.unavailable_reason || "No local history for these sides")}">No past data</span>`}
  </article>`;
}

function renderTodayMatches(){
 const grid = $("#today-matches-grid");
 if(!grid || !todayMatchesData || !todayMatchesData.sports) return;
 const sports = todayMatchesData.sports;
 let matches = [];
 for(const [key, list] of Object.entries(sports)){
  if(todayFilter === "all" || todayFilter === key) matches = matches.concat(list.map(m => ({...m, sportKey: key})));
 }
 if(todaySearchQuery){
  matches = matches.filter(m => [m.team, m.opponent, m.tournament, m.venue, m.detail].some(v => v && v.toLowerCase().includes(todaySearchQuery)));
 }
 // Fixtures you can analyze first, then live, upcoming, finished.
 const order = {in: 0, pre: 1, post: 2};
 matches.sort((a, b) => (Number(!!b.analyzable) - Number(!!a.analyzable)) || (order[a.state] - order[b.state]) || String(a.start).localeCompare(String(b.start)));
 if(!matches.length){
  const source = (todayMatchesData.sources || []).find(s => s.sport === todayFilter && !s.ok);
  const label = todayFilter === "all" ? "today" : `for ${SPORT_LABELS[todayFilter] || todayFilter} today`;
  const text = todaySearchQuery ? `No matches today matching "${e(todaySearchQuery)}".`
   : source ? `${e(source.error || "This source could not be reached")}.`
   : `No matches found ${e(label)}.`;
  grid.innerHTML = `<p class="empty">${text} You can still pick any two sides yourself.</p>`;
  return;
 }
 const shown = todayShowAll || todaySearchQuery ? matches : matches.slice(0, TODAY_LIMIT);
 grid.innerHTML = shown.map(todayCard).join("") + (shown.length < matches.length
  ? `<button class="button secondary today-more" type="button" id="today-show-all">Show all ${matches.length} matches</button>` : "");
 $("#today-show-all")?.addEventListener("click", () => { todayShowAll = true; renderTodayMatches(); });
 grid.querySelectorAll(".match-item-btn").forEach(button => {
  button.addEventListener("click", () => selectAndAnalyzeMatchup(matches.find(m => m.id === button.dataset.matchId)));
 });
 grid.querySelectorAll("[data-preview-id]").forEach(button => {
  button.addEventListener("click", () => openCricketPreview(matches.find(m => m.id === button.dataset.previewId)));
 });
}

let currentCricketPreview;

function syncOpenRouterKey(){
 const status=state.openrouter_key_status;
 const labels={saved:"Key saved on this PC",session:"Key saved for this session",environment:"Key configured from environment"};
 $("#openrouter-badge").textContent=labels[status]||"No key saved";
 $("#openrouter-remove").hidden=!["saved","session"].includes(status);
}

async function changeOpenRouterKey(action){
 const field=$("#openrouter-key"), save=$("#openrouter-save"), remove=$("#openrouter-remove");
 const feedback=$("#openrouter-feedback");
 save.disabled=remove.disabled=field.disabled=true;
 feedback.textContent=action==="save"?"Saving key…":"Removing key…";
 try{
  const result=await api("/api/openrouter-key", action==="save"?{action,key:field.value}:{action});
  state.openrouter_key_status=result.openrouter_key_status;
  syncOpenRouterKey();
  feedback.textContent=action==="save"?"Key saved. Select Analyze cricket on a fixture to use it.":"Saved key removed.";
 }catch(err){feedback.textContent=err.message;}
 finally{field.value="";save.disabled=remove.disabled=field.disabled=false;}
}

function showOpenRouterSettings(){
 setView("models");
 $("#openrouter-settings").scrollIntoView({block:"start"});
 $("#openrouter-key").focus({preventScroll:true});
}

function previewSourceLinks(sources){
 const unique=new Map();
 for(const source of sources){
  try{
   const url=new URL(source.url);
   if(url.protocol==="https:" && !url.username && !url.password){
    unique.set(url.href, source.title||url.hostname);
   }
  }catch{ /* Omit malformed URLs. */ }
 }
 if(!unique.size)return "";
 return `<ul class="preview-sources">${[...unique].map(([url,title])=>
  `<li><a href="${e(url)}" target="_blank" rel="noopener noreferrer">${e(title)}</a></li>`).join("")}</ul>`;
}

function previewMatches(matches, format){
 if(!matches.length)return '<p class="note">No comparable completed matches in the archive.</p>';
 return `<ul class="preview-history">${matches.map(row=>{
  const result=row.winner?`${row.winner} won${row.margin?` by ${row.margin}`:""}`:row.result.replaceAll("_"," ");
  const scores=row.innings.map(inn=>{
   const balls=inn.legal_balls;
   const duration=balls==null?"":format==="100-ball"?` (${balls} balls)`:` (${Math.floor(balls/6)}.${balls%6} ov)`;
   return `${inn.team} ${inn.runs}${inn.wickets?`/${inn.wickets}`:""}${inn.declared?" declared":""}${duration}`;
  });
  return `<li><strong>${e(row.teams.join(" vs "))}</strong> <span class="note">${e(dateLabel(row.date))}</span><br>${e([result,row.venue,...scores].filter(Boolean).join(" · "))}</li>`;
 }).join("")}</ul>`;
}

function cricketTable(caption, columns, body){
 return `<div class="table-wrap"><table><caption class="sr-only">${e(caption)}</caption>
  <thead><tr>${columns.map(label=>`<th scope="col">${e(label)}</th>`).join("")}</tr></thead>
  <tbody>${body}</tbody></table></div>`;
}

function cricketProjections(context){
 const p=context.projections;
 if(!p)return context.projection_note?`<p class="note">${e(context.projection_note)}</p>`:"";
 const names=[context.fixture.team,context.fixture.opponent];
 const teamRows=p.checkpoints.map((n,i)=>`<tr><th scope="row">${n}</th>
  ${p.sides.map(side=>`<td>${fmt(side.runs?.[i],0)}</td>`).join("")}</tr>`).join("");
 const samples=p.sides.map((side,i)=>`<li>${e(names[i])} · ${side.matches} of ${p.window} recent matches with usable first-innings deliveries
  ${side.as_of?` through ${e(dateLabel(side.as_of))}`:""}${side.runs?"":" · Forecast unavailable"}</li>`).join("");
 const squads=p.sides.map((side,i)=>{
  const playerRows=side.players.map(player=>`<tr><th scope="row">${e(player.name)}</th><td>${fmt(player.runs)}</td>
   <td>${fmt(player.wickets,2)}</td><td>${player.matches.length}/${p.window}</td></tr>`).join("");
  const histories=side.players.filter(player=>player.matches.length).map(player=>{
   const matches=player.matches.map(row=>`<tr><th scope="row">${e(dateLabel(row.date))}</th>
    <td>${e(row.team)} vs ${e(row.opponent)}</td><td>${row.batted?row.runs:"Did not bat"}</td><td>${row.bowled?row.wickets:"Did not bowl"}</td></tr>`).join("");
   return `<details><summary>${e(player.name)} (${player.matches.length})</summary>
    ${cricketTable(`Match history for ${player.name}`,["Date","Match","Runs","Wickets"],matches)}</details>`;
  }).join("");
  return `<div class="cricket-squad"><h4>${e(names[i])}</h4><p class="note">${e(side.source)}
   ${side.squad_date?` · ${e(dateLabel(side.squad_date))}`:""}
   ${side.source==="Last archived playing squad"?" · Provisional lineup":""}</p>
   ${playerRows?cricketTable(`Player projections for ${names[i]}`,["Player","Runs","Wickets","Matches"],playerRows):""}
   ${histories?`<details><summary>Player match histories</summary>${histories}</details>`:""}
  </div>`;
 }).join("");
 return `<section class="preview-section cricket-projections"><h3>Team runs by checkpoint</h3>
  <p class="note">${e(context.format)} · Cumulative first-innings runs. After an innings ends, its score stays at the final total.</p>
  ${p.sides.some(side=>side.runs)?cricketTable("Projected cumulative first-innings runs",[p.checkpoint_unit,...names],teamRows):""}
  <ul class="cricket-samples">${samples}</ul>
  </section><section class="preview-section cricket-projections"><h3>Player runs and wickets</h3>
  <p class="note">Expected totals per appearance across all innings. Each player uses up to ${p.window} prior appearances in the same format.</p>
  ${squads}
  <p class="note">Experimental ${e(p.model.toLowerCase())} using completed matches before ${e(dateLabel(context.cutoff))}. A forecast needs at least ${p.minimum_matches} usable matches and enough training examples. Dashes indicate unavailable estimates.</p>
  </section>`;
}

function renderPreviewEvidence(context){
 const forecast=context.forecast, check=forecast.validation||{};
 const ahead=check.log_loss<check.baseline_log_loss && check.run_mae<check.baseline_run_mae;
 const scoreHtml=(forecast.scores||[]).map(row=>`<li><span>${e(row.team)}</span><strong>${e(row.runs)} runs</strong></li>`).join("");
 const probabilityHtml=(forecast.probabilities||[]).map(row=>`<li><span>${e(row.outcome)}</span><strong>${e(fmt(100*row.probability,1))}%</strong></li>`).join("");
 const metrics=check.matches?`<p class="note">Backtest from ${e(dateLabel(check.start))} · ${e(check.matches)} matches. Outcome log loss ${e(check.log_loss)} vs ${e(check.baseline_log_loss)} for the historical baseline. ${check.score_count?`Average run error ${e(check.run_mae)} vs ${e(check.baseline_run_mae)} over ${e(check.score_count)} team innings.`:""}</p>`:"";
 const estimate=forecast.reason?`<p class="note">${e(forecast.reason)}</p>`:
  `<p class="note">Historical cutoff ${e(dateLabel(forecast.as_of))} · Recent match counts ${e(forecast.sample.join(" vs "))}. ${ahead?"":"Experimental estimates. One or more backtest measures trailed or tied the historical baseline."}</p>
   <div class="preview-forecast-grid">
    <div><h4>${e(forecast.score_label)}</h4>${scoreHtml?`<ul>${scoreHtml}</ul>`:'<p class="note">Innings data is too sparse.</p>'}</div>
    <div><h4>${e(forecast.outcome_label)}</h4><ul>${probabilityHtml}</ul></div>
   </div>`;
 const archiveMatches=[...context.recent_form.flatMap(side=>side.matches),...context.head_to_head];
 const players=context.player_history;
 const pairs=(players.direct_batter_bowler||[]).map(row=>`<li><strong>${e(row.batter)} vs ${e(row.bowler)}</strong> · ${e(row.batter_runs)} runs from ${e(row.non_wide_deliveries)} non-wide deliveries</li>`).join("");
 const sources=previewSourceLinks([{url:context.fixture.source_url,title:"Fixture scoreboard"},
  ...archiveMatches.map(row=>({url:row.source_url})),{url:context.projections?.source_url||players.source_url,title:"Cricsheet ball-by-ball archive"}]);
 return `${cricketProjections(context)}
  ${!forecast.reason||forecast.validation?`<section class="preview-section"><h3>Win and innings forecast</h3>${estimate}${metrics}</section>`:""}
  <section class="preview-section"><h3>Archive evidence</h3>
   ${context.archive_note?`<p class="note">${e(context.archive_note)}</p>`:""}
   ${context.recent_form.map(side=>`<details><summary>${e(side.team)} recent form (${side.matches.length})</summary>${previewMatches(side.matches,context.format)}</details>`).join("")}
   <details><summary>Head-to-head (${context.head_to_head.length})</summary>${previewMatches(context.head_to_head,context.format)}</details>
   ${pairs?`<details><summary>Player matchups</summary><p class="note">Recent head-to-head delivery records.</p><ul class="preview-history">${pairs}</ul></details>`:""}
   ${sources?`<details><summary>Archive and scoreboard sources</summary>${sources}</details>`:""}
  </section>`;
}

async function openCricketPreview(match){
 if(!match)return;
 const dialog=$("#cricket-preview-dialog"), status=$("#cricket-preview-status");
 const selected={payload:{match_id:match.id}, loading:true};
 currentCricketPreview=selected;
 const ready=state.openrouter_key_status!=="missing";
 $("#cricket-preview-title").textContent=`${match.team} vs ${match.opponent}`;
 $("#cricket-preview-meta").textContent=[match.tournament,match.venue,[match.team_score,match.opponent_score].filter(Boolean).join(" · "),match.status].filter(Boolean).join(" · ");
 $("#cricket-preview-report").hidden=true;
 $("#cricket-preview-evidence").replaceChildren();
 $("#cricket-preview-generate").hidden=!ready;
 $("#cricket-preview-generate").disabled=true;
 $("#cricket-preview-key").hidden=ready;
 status.textContent="Loading local cricket history…";
 dialog.showModal();
 let auto=false;
 try{
  const context=await api("/api/cricket-preview-context",selected.payload);
  if(currentCricketPreview!==selected)return;
  $("#cricket-preview-evidence").innerHTML=renderPreviewEvidence(context);
  auto=ready && context.recent_form.some(side=>side.matches.length);
  status.textContent=ready?"Local analysis ready.":"Local analysis ready. Save an OpenRouter key for an AI summary.";
 }catch(err){if(currentCricketPreview===selected)status.textContent=err.message;}
 finally{if(currentCricketPreview===selected){selected.loading=false;$("#cricket-preview-generate").disabled=false;}}
 if(auto)generateCricketPreview();
}

function cricketSummary(report){
 return `<h3>AI summary</h3><p class="note">OpenRouter · ${e(report.model)}</p>
  <p class="preview-text">${e(report.text)}</p>`;
}

async function generateCricketPreview(){
 const selected=currentCricketPreview;
 if(!selected || selected.loading)return;
 selected.loading=true;
 const button=$("#cricket-preview-generate"), status=$("#cricket-preview-status");
 button.disabled=true;
 status.textContent="Summarizing the local analysis with a free OpenRouter model…";
 try{
  const {context,report}=await api("/api/cricket-preview",selected.payload);
  if(currentCricketPreview!==selected)return;
  $("#cricket-preview-evidence").innerHTML=renderPreviewEvidence(context);
  $("#cricket-preview-report").innerHTML=cricketSummary(report);
  $("#cricket-preview-report").hidden=false;
  status.textContent="AI summary ready.";
 }catch(err){if(currentCricketPreview===selected)status.textContent=err.message;}
 finally{if(currentCricketPreview===selected){selected.loading=false;button.disabled=false;}}
}

function setupAutoRefresh(){
 const select = $("#auto-refresh-select");
 if(!select) return;
 const saved = localStorage.getItem("matchlab-auto-refresh") || "0";
 select.value = saved;
 const applyTimer = val => {
  if(autoRefreshTimer){ clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
  const mins = parseInt(val, 10);
  if(mins > 0){
   autoRefreshTimer = setInterval(() => loadTodayMatches(true, true), mins * 60 * 1000);
   toast(`Auto-update on: checking every ${mins} minutes`);
  }
 };
 select.addEventListener("change", () => {
  localStorage.setItem("matchlab-auto-refresh", select.value);
  applyTimer(select.value);
 });
 if(saved !== "0") applyTimer(saved);
}

function setupTodaySearch(){
 const searchInput = $("#today-match-search");
 if(!searchInput) return;
 searchInput.addEventListener("input", () => {
  todaySearchQuery = searchInput.value.toLowerCase().trim();
  renderTodayMatches();
 });
}

function selectAndAnalyzeMatchup(m){
 if(!state || !m || !m.analyzable) return;
 if(!state.catalog.some(s => s.id === m.sportKey)){
  toast(`${SPORT_LABELS[m.sportKey] || m.sportKey} is not in the current data workspace.`);
  return;
 }
 $("#sport").value = m.sportKey;
 populateSides(true);
 if(m.sportKey==="f1"){
  const race=sportMeta().races.find(r=>r.race_id===m.race_id);
  if(!race)return;
  selectRace(race);$("#race-stage").value="pre_weekend";setView("overview");analyze(false);
  return;
 }
 const meta = sportMeta(), teamSelect = $("#team"), oppSelect = $("#opponent");
 if(!meta.teams.includes(m.local_team) || !meta.teams.includes(m.local_opponent)){
  toast(`${m.team} vs ${m.opponent} is not in the current ${meta.name} data workspace.`);
  return;
 }
 teamSelect.value = m.local_team;
 options(oppSelect, meta.teams.filter(x => x !== m.local_team), m.local_opponent);
 teamSelect._combobox?.sync();
 oppSelect._combobox?.sync();
 // The first-listed side is the home side on the schedule.
 $("#venue").value = HOME_VENUE_SPORTS.includes(m.sportKey) ? "home" : "neutral";
 $("#cutoff").value = localDay();
 populatePlayers();
 renderMatchPicker();
 syncCricketInputs();
 analyze(false);
 $("#main").scrollIntoView({ behavior: "smooth", block: "start" });
}
function renderModels(){
 if(!state)return;const m=sportMeta();if(!m)return;
 if(m.kind==="race"){
  const p=m.data_provenance;
  $("#model-content").innerHTML=`<article class="card data-attribution"><h3>Formula 1 data and model</h3><p>${e(p.source)} · ${e(p.license)}</p><p>${fmt(m.rows,0)} Grands Prix · ${e(m.earliest)} to ${e(m.latest)}</p><p>Logistic retirement and Plackett–Luce finishing order are fitted locally before the race cutoff.</p><p class="note">Archive SHA-256 ${e(p.archive_sha256)}</p><ul class="limits-list">${p.limitations.map(item=>`<li>${e(item)}</li>`).join("")}</ul></article>`;
  return;
 }
 $("#model-content").innerHTML=`<div class="card source-card"><div class="card-heading"><div><h3>${e(m.name)} data source</h3><p>${e(state.config.sports[m.id].data_dir)}</p></div><span class="badge">${m.demo?"SYNTHETIC DEMO":"LOCAL DATA"}</span></div><p class="note">Coverage: ${e(m.earliest)} to ${e(m.latest)}. ${m.teams.length} sides. ${m.reference_mode?"Historical reference estimates enabled.":"Only configured models produce forecasts."}</p></div><div class="data-grid"><div class="card"><div class="data-number">${fmt(m.rows,0)}</div><div class="data-label">Completed matches</div></div><div class="card"><div class="data-number">${fmt(m.player_rows,0)}</div><div class="data-label">Player appearances</div></div><div class="card"><div class="data-number">${fmt(m.interaction_rows,0)}</div><div class="data-label">Interaction records</div></div></div><p class="connection-intro">Model status for <strong>${e(m.name)}</strong>. To inspect another sport, choose it in Match overview. “File found” confirms a local file and runtime; prediction validates its feature and output contract. Optional runtimes must already be installed offline.</p><div class="connection-grid">${m.models.map(s=>`<article class="card connection-card"><span class="connection-state ${e(s.state)}">${s.state==="available"?"FILE FOUND":s.state==="unavailable"?"UNAVAILABLE":"NOT CONNECTED"}</span><div class="connection-name">${e(s.task.replaceAll("_"," "))}</div><p>${e(s.message)}</p>${s.path?`<p class="note">${e(s.path)}</p>`:""}</article>`).join("")}</div>`;
 $("#model-content").insertAdjacentHTML("afterbegin",`<article class="card data-attribution"><h3>Data provenance &amp; measured validation</h3><p>${e(m.data_provenance?.source||"Local CSV files")}</p><p>${e(m.data_provenance?.license||"License not supplied")}</p>${m.data_provenance?.attribution?`<p>${e(m.data_provenance.attribution)}</p>`:""}<p class="note">Dataset SHA-256: ${e(m.data_sha256?.["matches.csv"]||"unrecorded")}<br>Held-out results and limitations are recorded locally in EVALUATION.md. No publisher benchmark is presented as sports accuracy.</p></article>`);
 $("#feature-list").innerHTML=`<div class="table-wrap"><table class="feature-table"><thead><tr><th>Feature</th><th>Meaning</th></tr></thead><tbody>${Object.entries(state.features).map(([k,v])=>`<tr><td><code>${e(k)}</code></td><td>${e(v)}</td></tr>`).join("")}</tbody></table></div><p>Dedicated TabICLv2 adapters build causal task-specific historical contexts with official missing-value handling. Player threat is a regressed pair-match success fraction, bounded to [0,1]; it is not a calibrated per-event probability. Generic adapters retain their existing ordered numeric feature contracts.</p>`;
}
function query(includePlayers=true){
 const result=Object.fromEntries(new FormData($("#query-form")));
 if(includePlayers&&$("#player").value){result.player=$("#player").value;result.opponent_player=$("#opponent-player").value;}
 if(result.sport==="cricket"&&confirmedToss&&cricketKey===cricketFixtureKey())Object.assign(result,tossInputs());
 return result;
}
async function analyzeRace(){
 const id=++requestId, race=selectedRace(), stage=$("#race-stage").value;
 const post=stage==="post_qualifying", panel=$("#race-grid-editor"), button=$("#analyze-button"), content=$("#overview-content");
 error("");analysis=null;$("#export-button").disabled=true;
 panel.hidden=!post;button.disabled=true;button.textContent="Working…";
 content.setAttribute("aria-busy","true");
 $("#inference-status").textContent="Working out the race…";
 try{
  const request={season:race.season,round:race.round,stage};
  if(post){
   if(gridRaceId!==race.race_id){
    panel.open=!race.completed;
    $("#race-grid-list").replaceChildren();
    await raceField(race);
   }
   if(id!==requestId)return;
   if(!race.completed||gridEdited){
    const fields=[...$("#race-grid-list").querySelectorAll("input")];
    if(!fields.length||fields.some(field=>field.value===""||!field.validity.valid)){
     content.classList.remove("loading-placeholder");
     content.innerHTML='<div class="card empty">Enter the complete starting grid, then press Predict.</div>';
     return;
    }
    request.grid=Object.fromEntries(fields.map(field=>[field.dataset.driver,field.valueAsNumber]));
   }
  }
  const result=await api("/api/race",request);
  if(id!==requestId)return;
  analysis=result;renderRace(result);$("#export-button").disabled=false;
  $("#data-footer").textContent=`Formula 1 / Data through ${result.provenance.data_sources.latest}`;
 }catch(err){
  if(id!==requestId)return;
  error(err.message);content.classList.remove("loading-placeholder");
  content.innerHTML='<div class="card empty">Choose a race with sufficient history and check the forecast inputs.</div>';
 }finally{
  if(id===requestId){
   button.disabled=false;button.innerHTML=`${icon("spark")} Predict`;
   content.setAttribute("aria-busy","false");
   $("#inference-status").textContent=analysis?"":post?"Check the starting grid or choose another race":"Race forecast unavailable";
  }
 }
}
async function runCricketMatchup(request, id, summarize){
 const slot=$("#cricket-slot"), players=$("#players-slot");
 if(!slot||!players)return;
 slot.innerHTML=`<p class="note" role="status"></p><button class="button secondary" type="button" hidden>Write an AI summary</button><section class="preview-section cricket-summary" hidden></section>`;
 const status=slot.querySelector('[role="status"]');
 const button=slot.querySelector("button"), summary=slot.querySelector(".cricket-summary");
 const payload={matchup:request};
 try{
  const context=await api("/api/cricket-preview-context",payload);
  if(id!==requestId)return;
  analysis.cricket_analysis=context;
  players.innerHTML=cricketPlayersTable(context);
  const evidence=$("#cricket-evidence-slot");
  if(evidence)evidence.innerHTML=`<article class="card cricket-matchup"><h3>Cricket projections and archive</h3>${renderPreviewEvidence(context)}</article>`;
  if(!context.recent_form.some(side=>side.matches.length))return;
  if(state.openrouter_key_status==="missing"){
   if(summarize){button.hidden=false;button.textContent="Set up AI summaries";button.addEventListener("click",showOpenRouterSettings);}
   return;
  }
  const generate=async()=>{
   button.hidden=true;
   status.textContent="Writing a short AI summary…";
   try{
    const {report}=await api("/api/cricket-preview",payload);
    if(id!==requestId)return;
    analysis.cricket_summary=report;
    summary.innerHTML=cricketSummary(report);
    summary.hidden=false;
    status.textContent="";
   }catch(err){
    if(id!==requestId)return;
    status.textContent=err.message;
    button.hidden=false;
    button.textContent="Retry AI summary";
   }
  };
  button.addEventListener("click",generate);
  if(summarize)await generate();else button.hidden=false;
 }catch(err){if(id===requestId)players.innerHTML=`<p class="empty">${e(err.message)}</p>`;}
}

async function analyze(includePlayers=true, cricketMode="none"){
 if(sportMeta()?.kind==="race")return analyzeRace();
 const id=++requestId;error("");$("#analyze-button").disabled=true;$("#analyze-button").innerHTML=`${icon("refresh")} Working…`;$("#export-button").disabled=true;$("#overview-content").setAttribute("aria-busy","true");$("#inference-status").textContent="Working it out. The first one can take up to a minute…";
 const request=query(includePlayers);
 try{
  const a=await api("/api/analyze",request);if(id!==requestId)return;
  analysis=a;populatePlayers(a);renderOverview(a);renderPlayers(a);
  $("#player-content").insertAdjacentHTML("beforeend",formForecasts(a,true)+modelEvidence(a));
  $("#export-button").disabled=false;$("#data-footer").textContent=`${a.meta.name} / Data through ${a.provenance.latest_eligible}`;
  if(a.sport==="cricket"&&!a.demo)runCricketMatchup(request,id,cricketMode==="summary");
 }
 catch(err){if(id!==requestId)return;analysis=null;error(err.message);$("#overview-content").classList.remove("loading-placeholder");$("#overview-content").innerHTML='<div class="card empty">Adjust the matchup, prediction date, or local configuration to continue.</div>';$("#player-content").innerHTML='<div class="card empty">Run a valid matchup analysis to see player results.</div>';}
 finally{if(id===requestId){$("#analyze-button").disabled=false;$("#analyze-button").innerHTML=`${icon("spark")} Predict`;$("#overview-content").setAttribute("aria-busy","false");$("#inference-status").textContent=analysis?"":"Could not predict this one. See the message above.";}}
}
function download(name,value){const blob=new Blob([JSON.stringify(value,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function applyConfig(reload=false){
 const button=reload?$("#reload-button"):$("#apply-config");button.disabled=true;error("");
 try{const config=reload?{}:JSON.parse($("#config-editor").value);const result=await api(reload?"/api/reload":"/api/config",config);state={...state,...result};$("#config-editor").value=JSON.stringify(state.config,null,2);const sport=$("#sport").value;$("#sport").innerHTML=state.catalog.map(s=>`<option value="${e(s.id)}">${e(s.name)}</option>`).join("");if(state.catalog.some(s=>s.id===sport))$("#sport").value=sport;populateSides(true);await analyze(false);$("#config-feedback").textContent="Configuration applied to this session. Export config.local.json to keep it for the next launch.";toast(reload?"Local files reloaded":"Local configuration validated and applied");}
 catch(err){error(err.message);$("#config-feedback").textContent=`Could not apply: ${err.message}`;}
 finally{button.disabled=false;}
}
async function init(){
 hydrateIcons();
 new SearchableCombobox($("#team"), "Team");
 new SearchableCombobox($("#opponent"), "Opponent");
 new SearchableCombobox($("#player"), "Player");
 new SearchableCombobox($("#opponent-player"), "Opposing player");
 document.querySelectorAll("[data-view]").forEach(x=>{x.title=x.textContent.trim();x.setAttribute("aria-label",x.textContent.trim());x.addEventListener("click",()=>setView(x.dataset.view));});
 $("#connect-button")?.addEventListener("click",()=>setView("models"));
 $("#query-form").addEventListener("submit",event=>{event.preventDefault();analyze(true,"summary");});
 $("#player-form").addEventListener("submit",event=>{event.preventDefault();analyze();});
 $("#query-form").addEventListener("change",event=>{
  if(event.target.id==="sport")populateSides(true);
  else if(event.target.id==="team")populateSides();
  else if(event.target.id==="opponent")populatePlayers();
  else if(event.target.id==="cutoff")renderMatchPicker();
  else if(event.target.id==="race-season")raceOptions(event.target.value);
  syncCricketInputs();analyze(false);
 });
 $("#cricket-toss").addEventListener("toggle",syncCricketInputs);
 $("#cricket-run-toss").addEventListener("click",()=>{
  if(!tossInputs()){$("#cricket-xi-status").textContent="Select the toss winner and decision and enter 11 different players for each team.";return;}
  confirmedToss=true;$("#cricket-reset-toss").hidden=false;analyze(false,"local");
 });
 $("#cricket-reset-toss").addEventListener("click",()=>{confirmedToss=false;$("#cricket-reset-toss").hidden=true;analyze(false);});
 $("#race-grid-list").addEventListener("input",()=>{gridEdited=true;});
 $("#race-grid-refresh").addEventListener("click",async event=>{
  const button=event.currentTarget,race=selectedRace(),status=$("#race-grid-status");
  button.disabled=true;status.textContent="Checking Jolpica for a starting grid…";
  try{
   const data=await api("/api/race-grid",{season:race.season,round:race.round});
   if(sportMeta()?.kind!=="race"||selectedRace()?.race_id!==race.race_id)return;
   if(!data.grid){status.textContent=data.error;return;}
   await raceField(race);
   if(sportMeta()?.kind!=="race"||selectedRace()?.race_id!==race.race_id)return;
   analyze(false);
  }catch(err){status.textContent=err.message;}finally{button.disabled=false;}
 });
 $("#export-button").addEventListener("click",()=>{if(analysis){download(`matchlab-${analysis.sport}-${analysis.date||analysis.cutoff}.json`,analysis);toast("Analysis exported to your downloads folder");}});
 $("#apply-config").addEventListener("click",()=>applyConfig());$("#reload-button").addEventListener("click",()=>applyConfig(true));
 $("#download-config").addEventListener("click",()=>{try{download("config.local.json",JSON.parse($("#config-editor").value));toast("Configuration exported. Place it in the project folder to use on startup.");}catch(err){error(`Invalid configuration JSON: ${err.message}`);}});
 $("#sport-chips").addEventListener("click",event=>{
  const chip=event.target.closest(".sport-chip");
  if(!chip||chip.dataset.sport===$("#sport").value)return;
  $("#sport").value=chip.dataset.sport;
  $("#sport").dispatchEvent(new Event("change",{bubbles:true}));
 });
 $("#today-sport-tabs")?.addEventListener("click",event=>{
  const tab=event.target.closest(".sport-tab");
  if(!tab)return;
  todayFilter=tab.dataset.filter;todayShowAll=false;
  renderTodayTabs();renderTodayMatches();
 });
 $("#refresh-today-btn")?.addEventListener("click",()=>loadTodayMatches(true));
 $("#openrouter-form").addEventListener("submit",event=>{event.preventDefault();changeOpenRouterKey("save");});
 $("#openrouter-remove").addEventListener("click",()=>changeOpenRouterKey("clear"));
 $("#cricket-preview-generate").addEventListener("click",generateCricketPreview);
 $("#cricket-preview-dialog").addEventListener("close",()=>{currentCricketPreview=null;});
 $("#cricket-preview-key").addEventListener("click",()=>{
  $("#cricket-preview-dialog").close();
  showOpenRouterSettings();
 });
 window.addEventListener("hashchange",()=>{if(state&&location.hash==="#openrouter-settings")showOpenRouterSettings();});
 setupAutoRefresh();
 setupTodaySearch();
 try{state=await api("/api/state");
  syncOpenRouterKey();
  // Saved schedule from another day (or none yet): fetch today's once, quietly.
  loadTodayMatches().then(()=>{if(location.hash==="#openrouter-settings")showOpenRouterSettings();if(todayIsStale())loadTodayMatches(true,true);});
  $("#sport").innerHTML=state.catalog.map(s=>`<option value="${e(s.id)}">${e(s.name)}</option>`).join("");
  const query = new URLSearchParams(location.search);
  const requestedSport = state.catalog.find(s => s.id === query.get("sport"));
  if (requestedSport) $("#sport").value = requestedSport.id;
  const today=new Date();$("#cutoff").value=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
  $("#config-editor").value=JSON.stringify(state.config,null,2);
  populateSides(true);
  const requestedRace = requestedSport?.races?.find(r => String(r.season) === query.get("season") && String(r.round) === query.get("round"));
  if (requestedRace) selectRace(requestedRace);
  await analyze(false);}
 catch(err){error(`Cannot load local workspace: ${err.message}`);$("#overview-content").textContent="Check the local server and refresh this page.";}
}
init();
