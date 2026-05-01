function now() {
  return Date.now();
}

function secondsLeft(deadlineAt) {
  if (!deadlineAt) return 0;
  return Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000));
}

function minutesSince(ts) {
  if (!ts) return 0;
  return Math.max(0, Math.floor((Date.now() - ts) / 60000));
}

function makeCode() {
  return String(Math.floor(100 + Math.random() * 900));
}

module.exports = { now, secondsLeft, minutesSince, makeCode };
