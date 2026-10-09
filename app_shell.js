// The page around the Flutter app. Plain script, no third-party code, runs
// before Flutter loads.
//
// 1. On an iPhone, not opened from the home screen: the install guide
//    (index.html, #install) instead of the app. Flutter and the service
//    worker load only once the user installs, or taps «كمّل بدون تثبيت».
// 2. Otherwise: loads Flutter (flutter_bootstrap.js) and the offline
//    service worker (sw.js), and handles updates.
//
// window.matmurti is what the Dart side reads (lib/platform/web_shell_web.dart):
//   updateReady        a new version is downloaded and waiting
//   onUpdate           set by Dart; called when updateReady becomes true
//   applyUpdate()      switch to the waiting version (the page reloads)
//   offlineReady       everything this browser needs is cached
//   safeArea()         the notch / home indicator insets, in CSS pixels
//   inBrowserTab       iPhone, in a Safari tab, the user chose to continue
//   openInstallGuide() back to the install guide
//   persisted          the browser promised not to evict this app's data
//                      (navigator.storage.persist); null when unknown
(function () {
  'use strict';

  var CONTINUE_KEY = 'matmurti.continueInBrowser';

  var shell = (window.matmurti = {
    updateReady: false,
    onUpdate: null,
    offlineReady: false,
    applyUpdate: function () {},
    safeArea: safeArea,
    inBrowserTab: false,
    persisted: null,
    openInstallGuide: function () {
      remove(CONTINUE_KEY);
      window.location.reload();
    },
  });

  // --- Where are we? -------------------------------------------------------

  var ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch tells them apart.
  var ios = /iPhone|iPad|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  var standalone = navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;

  function guideVariant() {
    if (/FBAN|FBAV|FB_IAB|Instagram|Snapchat|TikTok|musical_ly|Line\/|Twitter|GSA\//.test(ua)) {
      return 'in-app';
    }
    var os = ua.match(/OS (\d+)_(\d+)/);
    if (os) {
      var major = +os[1], minor = +os[2];
      if (major < 16 || (major === 16 && minor < 4)) return 'old-ios';
    }
    if (/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)) return 'other-browser';
    // Safari 26 (iOS 26) moved Share into the ••• menu. Its user agent
    // keeps reporting an iOS 18 system, so the Safari version decides.
    var safari = ua.match(/Version\/(\d+)/);
    return safari && +safari[1] >= 26 ? 'safari26' : 'safari';
  }

  // --- Storage that may be unavailable (private mode, blocked) ------------

  function read(key) {
    try { return window.sessionStorage.getItem(key); } catch (e) { return null; }
  }
  function write(key, value) {
    try { window.sessionStorage.setItem(key, value); } catch (e) {}
  }
  function remove(key) {
    try { window.sessionStorage.removeItem(key); } catch (e) {}
  }

  // --- Safe areas ----------------------------------------------------------

  var probe = null;
  function safeArea() {
    if (!probe) {
      probe = document.createElement('div');
      probe.id = 'safe-area-probe';
      document.body.appendChild(probe);
    }
    var s = window.getComputedStyle(probe);
    return {
      top: parseFloat(s.paddingTop) || 0,
      right: parseFloat(s.paddingRight) || 0,
      bottom: parseFloat(s.paddingBottom) || 0,
      left: parseFloat(s.paddingLeft) || 0,
    };
  }

  // --- The install guide ---------------------------------------------------

  function showGuide() {
    var variant = guideVariant();
    document.getElementById('splash').hidden = true;
    var guide = document.getElementById('install');
    guide.hidden = false;
    var parts = guide.querySelectorAll('[data-variant]');
    for (var i = 0; i < parts.length; i++) {
      parts[i].hidden = parts[i].getAttribute('data-variant') !== variant;
    }
    var copy = document.getElementById('copy-link');
    copy.addEventListener('click', function () {
      var link = document.baseURI; // https://khaderhash.github.io/matmurti/
      if (navigator.clipboard) {
        navigator.clipboard.writeText(link).then(function () {
          copy.textContent = 'انتسخ ✓';
        }, function () {});
      }
    });
    document.getElementById('continue-anyway').addEventListener('click', function () {
      write(CONTINUE_KEY, '1');
      guide.hidden = true;
      document.getElementById('splash').hidden = false;
      startApp(true);
    });
  }

  // --- The app -------------------------------------------------------------

  function startApp(inBrowserTab) {
    shell.inBrowserTab = inBrowserTab;
    var script = document.createElement('script');
    script.src = 'flutter_bootstrap.js';
    script.async = true;
    script.addEventListener('error', startupFailed);
    document.body.appendChild(script);
    startServiceWorker();
  }

  // Flutter could not even load (a very old browser, a blocked file): say
  // so instead of a blank page.
  var started = false;
  function startupFailed() {
    if (started) return;
    var message = document.getElementById('startup-error');
    if (message) message.hidden = false;
  }
  window.addEventListener('error', function (event) {
    // Only failures before the app is up; the app handles its own.
    if (!started && event.target && event.target.tagName === 'SCRIPT') {
      startupFailed();
    }
  }, true);

  // Fade the HTML splash out once Flutter has drawn its own (identical) one,
  // then tell the service worker what this browser loaded.
  window.addEventListener('flutter-first-frame', function () {
    started = true;
    var splash = document.getElementById('splash');
    if (splash) {
      splash.classList.add('gone');
      setTimeout(function () { splash.remove(); }, 250);
    }
    reportUsed();
    protectStorage();
  });

  // Ask the browser to keep this app's data under storage pressure. Only
  // the installed app asks (Firefox would show a prompt in a tab); WebKit
  // and Chrome decide without asking. Nothing relies on the answer: the
  // backup reminder is the real protection.
  function protectStorage() {
    var storage = navigator.storage;
    if (!storage || !storage.persisted) return;
    storage.persisted().then(function (already) {
      if (already || !standalone || !storage.persist) return already;
      return storage.persist();
    }).then(function (granted) {
      shell.persisted = !!granted;
    }, function () {});
  }

  // --- Offline and updates -------------------------------------------------

  var sw = 'serviceWorker' in navigator ? navigator.serviceWorker : null;

  function startServiceWorker() {
    if (!sw) return;
    var hadController = !!sw.controller;
    var reloading = false;

    sw.addEventListener('controllerchange', function () {
      // The very first worker takes over without a reload; a new version
      // takes over only after «حدّث», and then every open page reloads.
      if (!hadController) {
        hadController = true;
        return;
      }
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });

    sw.addEventListener('message', function (event) {
      var data = event.data || {};
      if (data.type === 'cached') shell.offlineReady = !!data.ok;
    });

    function register() {
      sw.register('sw.js', { updateViaCache: 'none' })
        .then(track)
        .catch(function () {});
    }
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register);
  }

  function waiting(worker) {
    if (!worker) return;
    shell.applyUpdate = function () {
      worker.postMessage({ type: 'skipWaiting' });
    };
    shell.updateReady = true;
    if (typeof shell.onUpdate === 'function') shell.onUpdate();
  }

  function track(registration) {
    // An update is a worker installed while another version is already
    // active. (The first worker's "installed" can arrive after it has
    // taken over the page, so the page's controller cannot tell.)
    if (registration.waiting && registration.active) {
      waiting(registration.waiting);
    }
    registration.addEventListener('updatefound', function () {
      var worker = registration.installing;
      if (!worker || !registration.active) return;
      worker.addEventListener('statechange', function () {
        if (worker.state === 'installed') waiting(worker);
      });
    });

    // Look for a new version when the app comes back to the screen, at
    // most every 30 minutes (the app can stay open for days on a phone).
    var lastCheck = Date.now();
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastCheck < 30 * 60 * 1000) return;
      lastCheck = Date.now();
      registration.update().catch(function () {});
    });
  }

  function reportUsed() {
    if (!sw) return;
    sw.ready.then(function (registration) {
      var urls = performance.getEntriesByType('resource')
        .map(function (e) { return e.name; })
        .concat([window.location.href]);
      registration.active.postMessage({ type: 'used', urls: urls });
    });
  }

  // --- Go ------------------------------------------------------------------

  // Never inside another site's frame (GitHub Pages cannot send
  // X-Frame-Options or frame-ancestors): someone could dress the app up
  // and trick taps on it.
  if (window.top !== window.self) {
    document.getElementById('splash').hidden = true;
    try { window.top.location.replace(window.location.href); } catch (e) {}
    return;
  }

  if (ios && !standalone && read(CONTINUE_KEY) !== '1') {
    showGuide();
  } else {
    startApp(ios && !standalone);
  }
})();
