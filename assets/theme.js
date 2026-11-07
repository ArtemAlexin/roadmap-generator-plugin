(function () {
  var theme;
  try { theme = localStorage.getItem('roadmap-theme'); } catch (_) {}
  if (theme !== 'dark' && theme !== 'light') theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
})();
