(function () {
  "use strict";
  window.IS_STANDALONE = !window.xhs;
  var deferredInstallPrompt = null;
  var installButton = document.getElementById("install-app");
  var offlineStatus = document.getElementById("offline-status");
  var offlineReady = false;
  var updateAvailable = false;
  var hasController = "serviceWorker" in navigator && Boolean(navigator.serviceWorker.controller);
  function status (message) { if (offlineStatus) offlineStatus.textContent = message; }
  function showInstallButton (visible) { if (installButton) installButton.hidden = !visible; }
  function connectionStatus () {
    if (updateAvailable) {
      status("新版已准备好 · 保存未提交内容后，可点击刷新");
    } else if (offlineReady) {
      status(navigator.onLine ? "离线功能已就绪 · 外链仍需网络" : "当前离线 · 已缓存内容仍可查看，外链需网络");
    } else {
      status(navigator.onLine ? "正在准备离线缓存…" : "当前离线 · 离线缓存尚未就绪，外链需网络");
    }
  }
  function showUpdateButton () {
    updateAvailable = true;
    if (!document.getElementById("refresh-app")) {
      var button = document.createElement("button");
      button.id = "refresh-app";
      button.className = "btn";
      button.type = "button";
      button.textContent = "刷新到新版";
      button.addEventListener("click", function () { window.location.reload(); });
      (offlineStatus ? offlineStatus.parentNode : document.body).appendChild(button);
    }
    connectionStatus();
  }
  window.PocketTripPWA = {
    install: function () {
      if (!deferredInstallPrompt) {
        status("请在浏览器“分享”或菜单中选择“添加到主屏幕”");
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
  // Safari has no beforeinstallprompt event; keep manual installation reachable.
  var installed = navigator.standalone === true || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
  showInstallButton(!installed);
  if ("serviceWorker" in navigator) {
    connectionStatus();
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (hasController) showUpdateButton();
      hasController = true;
    });
    // A previously installed worker can be ready even when an offline update fails.
    navigator.serviceWorker.ready.then(function () {
      offlineReady = true;
      connectionStatus();
    });
    navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).then(function (registration) {
      // Recheck on each visit; staying offline must not disable an existing cache.
      registration.update().catch(function () {});
    }).catch(function () {
      if (offlineReady || navigator.serviceWorker.controller) connectionStatus();
      else status("离线缓存暂不可用 · 当前页面仍可使用");
    });
  } else {
    status("当前浏览器不支持离线安装 · 页面仍可使用");
  }
  window.addEventListener("online", connectionStatus);
  window.addEventListener("offline", connectionStatus);
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
