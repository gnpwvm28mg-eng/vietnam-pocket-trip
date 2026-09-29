(function () {
  "use strict";
  window.IS_STANDALONE = !window.xhs;
  var deferredInstallPrompt = null;
  var installButton = document.getElementById("install-app");
  var offlineStatus = document.getElementById("offline-status");
  function status (message) { if (offlineStatus) offlineStatus.textContent = message; }
  function showInstallButton (visible) { if (installButton) installButton.hidden = !visible; }
  window.PocketTripPWA = {
    install: function () {
      if (!deferredInstallPrompt) {
        status("请打开浏览器菜单，选择“添加到主屏幕”");
        return Promise.resolve({ outcome: "unavailable" });
      }
      var prompt = deferredInstallPrompt;
      deferredInstallPrompt = null;
      showInstallButton(false);
      prompt.prompt();
      return prompt.userChoice.then(function (choice) {
        if (choice && choice.outcome === "accepted") status("已添加到手机主屏幕 · 外链仍需网络");
        else status("暂未添加，可随时从浏览器菜单添加");
        return choice;
      }).catch(function () {
        status("暂未添加，可随时从浏览器菜单添加");
        return { outcome: "dismissed" };
      });
    }
  };
  if (window.xhs) return;
  if ("serviceWorker" in navigator) {
    status(navigator.onLine ? "正在准备离线缓存…" : "当前离线，正在读取已缓存内容…");
    navigator.serviceWorker.register("./sw.js").then(function () {
      status(navigator.onLine ? "离线功能已就绪 · 外链仍需网络" : "已从离线缓存打开 · 外链需网络");
    }).catch(function () {
      status("离线缓存暂不可用 · 当前页面仍可使用");
    });
  } else {
    status("当前浏览器不支持离线安装 · 页面仍可使用");
  }
  window.addEventListener("online", function () { if (!deferredInstallPrompt) status("已联网 · 行程可离线查看，外链可打开"); });
  window.addEventListener("offline", function () { status("当前离线 · 已缓存内容仍可查看，外链需网络"); });
  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    deferredInstallPrompt = event;
    showInstallButton(true);
    status("可添加到手机主屏幕 · 外链仍需网络");
  });
  window.addEventListener("appinstalled", function () {
    deferredInstallPrompt = null;
    showInstallButton(false);
    status("已添加到手机主屏幕 · 外链仍需网络");
  });
}());
