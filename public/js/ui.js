const $ = id => document.getElementById(id);

function toast(text) {
  const div = document.createElement("div");
  div.className = "toast";
  div.textContent = text;
  $("toast").appendChild(div);
  setTimeout(() => div.remove(), 3200);
}

function screen(id) {
  ["auth","app","game"].forEach(x => $(x).classList.add("hidden"));
  $(id).classList.remove("hidden");
}

function escapeHtml(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" })[c]);
}

function fmt(sec) {
  sec = Math.max(0, Number(sec || 0));
  return `${String(Math.floor(sec / 60)).padStart(2,"0")}:${String(sec % 60).padStart(2,"0")}`;
}

function setPage(page) {
  App.ui.page = page;
  document.querySelectorAll(".page").forEach(x => x.classList.remove("active"));
  $(`page${page}`).classList.add("active");
  document.querySelectorAll(".bottom-nav button").forEach(b => b.classList.toggle("active", b.dataset.page === page));
  $("pageTitle").textContent = ({Rooms:"მაგიდები",Clans:"კლანები",Stats:"სტატისტიკა",Profile:"პროფილი"})[page] || page;
}

function showOverlay(title, text) {
  $("overlayTitle").textContent = title;
  $("overlayText").textContent = text || "";
  $("phaseOverlay").classList.remove("hidden");
  setTimeout(() => $("phaseOverlay").classList.add("hidden"), 4200);
}

function roleLabel(role) {
  return ({
    citizen:"მოქალაქე",mafia:"მაფია",don:"დონი",sheriff:"შერიფი",doctor:"ექიმი",detective:"დეტექტივი",
    serial_killer:"მარტოხელა",yakuza:"იაკუძა",chogun:"ჩოგუნი",vigilante:"ვიჯილანტი",maniac:"მანიაკი",
    bodyguard:"მცველი",journalist:"მემატიანე",lawyer:"დამცველი",mayor:"ქალაქის ხმა"
  })[role] || role;
}
