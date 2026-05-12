/** @deprecated Use user-account-menu.js */
(function () {
  if (window.__SO_USER_ACCOUNT_MENU__) return;
  var s = document.createElement('script');
  s.src = '/user-account-menu.js';
  s.defer = true;
  document.head.appendChild(s);
})();
