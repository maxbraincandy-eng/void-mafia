window.App = {
  socket: io(),
  user: null,
  selectedAvatar: localStorage.getItem("voidAvatar") || "◆",
  rooms: [],
  clans: [],
  leaderboard: [],
  currentRoom: null,
  currentRoomId: null,
  localStream: null,
  soundEnabled: localStorage.getItem("voidSound") === "on",
  ui: { page: "Rooms", roomFilter: "all" }
};

window.AvatarOptions = ["◆","◇","⬢","✦","☾","♞","♛","☣","◈","●","◐","★","🕶️","👑","💀","🐺","🧠","🔥"];
window.RoleOptions = [
  ["don","დონი"],["sheriff","შერიფი"],["doctor","ექიმი"],["detective","დეტექტივი"],["serial","მარტოხელა"],
  ["yakuza","იაკუძა"],["chogun","ჩოგუნი"],["vigilante","ვიჯილანტი"],["maniac","მანიაკი"],["bodyguard","მცველი"],
  ["journalist","მემატიანე"],["lawyer","დამცველი"],["mayor","ქალაქის ხმა"]
];
