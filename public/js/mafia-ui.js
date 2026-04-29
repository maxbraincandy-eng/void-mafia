function roleName(role) {
  const map = {
    mafia: "მაფია",
    don: "დონი",
    doctor: "ექიმი",
    sheriff: "შერიფი",
    citizen: "მოქალაქე"
  };

  return map[role] || role;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
