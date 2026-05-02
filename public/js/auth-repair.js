(function () {
  function $(id) {
    return document.getElementById(id);
  }

  function show(id) {
    const el = $(id);
    if (el) el.classList.remove("hidden");
  }

  function hide(id) {
    const el = $(id);
    if (el) el.classList.add("hidden");
  }

  function text(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
  }

  function inputValue(id) {
    return ($(id)?.value || "").trim();
  }

  function toastSafe(message) {
    if (typeof toast === "function") {
      toast(message);
      return;
    }

    const box = $("toast");

    if (!box) {
      alert(message);
      return;
    }

    const div = document.createElement("div");
    div.className = "toast";
    div.textContent = message;
    box.appendChild(div);

    setTimeout(() => div.remove(), 2600);
  }

  function ensureApp() {
    window.App = window.App || {};
    return window.App;
  }

  function ensureSocket() {
    const App = ensureApp();

    if (App.socket) return App.socket;

    if (typeof io === "function") {
      App.socket = io();
      return App.socket;
    }

    return null;
  }

  function getSavedUser() {
    try {
      return JSON.parse(localStorage.getItem("void_user") || "null");
    } catch (err) {
      return null;
    }
  }

  function saveUser(user) {
    if (!user || !user.userId) return;

    const App = ensureApp();
    App.user = user;

    localStorage.setItem("void_user", JSON.stringify(user));

    updateUserUi(user);
  }

  function clearSavedUser() {
    localStorage.removeItem("void_user");
    const App = ensureApp();
    App.user = null;
  }

  function updateUserUi(user) {
    if (!user) return;

    const stats = user.stats || {};

    text("userLine", `ID ${user.userId || "-"} · ${user.nickname || "Player"}`);
    text("drawerName", user.nickname || "Player");
    text("drawerUserId", `ID ${user.userId || "-"}`);
    text("drawerAvatar", user.avatar || "◆");

    text("profileName", user.nickname || "Player");
    text("profileId", `ID ${user.userId || "-"}`);
    text("profileAvatar", user.avatar || "◆");

    text("pLevel", stats.level ?? user.level ?? 1);
    text("pXp", stats.xp ?? user.xp ?? 0);
    text("pWins", stats.wins ?? user.wins ?? 0);
    text("pMvp", stats.mvp ?? user.mvp ?? 0);

    if ($("editNickname")) {
      $("editNickname").value = user.nickname || "";
    }
  }

  function showAuth() {
    show("auth");
    hide("app");
    hide("game");
  }

  function showApp(user) {
    saveUser(user);

    hide("auth");
    show("app");
    hide("game");

    if (typeof loadRooms === "function") {
      loadRooms();
    }

    if (typeof refreshRooms === "function") {
      refreshRooms();
    }

    const socket = ensureSocket();

    if (socket) {
      socket.emit("rooms:get", {}, function () {});
    }
  }

  async function validateSavedUser() {
    const saved = getSavedUser();

    if (!saved || !saved.userId) {
      showAuth();
      return;
    }

    try {
      const res = await fetch(`/api/users/${saved.userId}/profile`, {
        method: "GET",
        cache: "no-store"
      });

      const data = await res.json();

      if (!data.ok || !data.profile) {
        clearSavedUser();
        showAuth();
        return;
      }

      showApp(data.profile);
    } catch (err) {
      /*
        თუ სერვერი დროებით ვერ პასუხობს, მაინც არ ავურიოთ UI.
        შევიყვანოთ app-ში მხოლოდ თუ localStorage-ში userId არსებობს.
      */
      showApp(saved);
    }
  }

  function quickLogin() {
    const socket = ensureSocket();

    if (!socket) {
      toastSafe("Socket ვერ ჩაირთო");
      return;
    }

    const nickname = inputValue("quickNick") || "Player";
    const avatar =
      document.querySelector(".avatar-choice.active")?.textContent?.trim() ||
      "◆";

    socket.emit(
      "auth:guest",
      {
        nickname,
        avatar,
        provider: "guest"
      },
      function (res) {
        if (!res || !res.ok) {
          toastSafe(res?.error || "შესვლა ვერ მოხერხდა");
          return;
        }

        showApp(res.user);
        toastSafe("შეხვედი");
      }
    );
  }

  async function saveNickname() {
    const App = ensureApp();
    const user = App.user || getSavedUser();

    if (!user || !user.userId) {
      toastSafe("ჯერ შედი ანგარიშში");
      showAuth();
      return;
    }

    const nickname = inputValue("editNickname");

    if (!nickname) {
      toastSafe("ნიკნეიმი ცარიელია");
      return;
    }

    try {
      const res = await fetch(`/api/users/${user.userId}/profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        cache: "no-store",
        body: JSON.stringify({
          nickname
        })
      });

      const data = await res.json();

      if (!data.ok || !data.profile) {
        toastSafe(data.error || "შენახვა ვერ მოხერხდა");
        return;
      }

      saveUser(data.profile);
      toastSafe("ნიკნეიმი შენახულია");
    } catch (err) {
      console.error("nickname save failed:", err);
      toastSafe("სერვერთან კავშირი ვერ მოხერხდა");
    }
  }

  function switchAuthTab(tab) {
    if (tab === "quick") {
      $("tabQuick")?.classList.add("active");
      $("tabEmail")?.classList.remove("active");
      show("quickForm");
      hide("emailForm");
    } else {
      $("tabEmail")?.classList.add("active");
      $("tabQuick")?.classList.remove("active");
      show("emailForm");
      hide("quickForm");
    }
  }

  function bindAvatarPicker() {
    const box = $("avatarPicker");
    if (!box) return;

    const avatars = ["◆", "♛", "♞", "●", "✦", "☾", "🔥", "👑", "🕶", "🧠", "🦊", "🐺"];

    if (!box.children.length) {
      box.innerHTML = avatars
        .map((a, index) => {
          return `<button type="button" class="avatar-choice ${index === 0 ? "active" : ""}">${a}</button>`;
        })
        .join("");
    }

    box.querySelectorAll(".avatar-choice").forEach(btn => {
      btn.addEventListener("click", () => {
        box.querySelectorAll(".avatar-choice").forEach(x => x.classList.remove("active"));
        btn.classList.add("active");
      });
    });
  }

  function bindDrawer() {
    $("drawerBtn")?.addEventListener("click", () => {
      show("drawer");
    });

    $("drawerClose")?.addEventListener("click", () => {
      hide("drawer");
    });
  }

  function bindAuth() {
    $("tabQuick")?.addEventListener("click", () => switchAuthTab("quick"));
    $("tabEmail")?.addEventListener("click", () => switchAuthTab("email"));

    $("quickLogin")?.addEventListener("click", quickLogin);

    $("quickNick")?.addEventListener("keydown", event => {
      if (event.key === "Enter") quickLogin();
    });

    $("saveNickname")?.addEventListener("click", saveNickname);
  }

  function bindLogoutButtonIfExists() {
    const btn = $("logoutBtn");
    if (!btn) return;

    btn.addEventListener("click", () => {
      clearSavedUser();
      showAuth();
    });
  }

  function init() {
    bindAvatarPicker();
    bindAuth();
    bindDrawer();
    bindLogoutButtonIfExists();

    validateSavedUser();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
