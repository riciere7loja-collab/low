/* Rastreio leve para o painel admin: sessões ao vivo + eventos de funil. Sem PII. */
(function () {
  'use strict';
  function uuid() { return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }); }
  var sess;
  try { sess = sessionStorage.getItem('ycz-sess') || (sessionStorage.setItem('ycz-sess', uuid()), sessionStorage.getItem('ycz-sess')); }
  catch (e) { sess = uuid(); }

  // captura UTMs/origem uma vez e guarda pra atribuir aos pedidos
  var attrib = null;
  try {
    attrib = JSON.parse(localStorage.getItem('ycz-attrib') || 'null');
    var q = new URLSearchParams(location.search);
    if (q.get('utm_source') || !attrib) {
      attrib = {
        source: q.get('utm_source') || (document.referrer ? new URL(document.referrer).hostname : '') || 'direto',
        medium: q.get('utm_medium') || '',
        campaign: q.get('utm_campaign') || '',
        content: q.get('utm_content') || '',
        referrer: document.referrer || '',
      };
      localStorage.setItem('ycz-attrib', JSON.stringify(attrib));
    }
  } catch (e) { attrib = attrib || {}; }

  var isMobile = /Mobi|Android/i.test(navigator.userAgent);
  function send(payload) {
    payload.s = sess;
    try {
      var body = JSON.stringify(payload);
      if (navigator.sendBeacon) navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }));
      else fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {});
    } catch (e) {}
  }

  function beat(first) {
    send({ type: 'beat', first: !!first, page: location.pathname, dev: isMobile ? 'mobile' : 'desktop', src: (attrib && attrib.source) || 'direto' });
  }
  beat(true);
  setInterval(function () { if (!document.hidden) beat(false); }, 25000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) beat(false); });

  window.YCZTrack = {
    sessionId: sess,
    attribution: function () { return Object.assign({}, attrib || {}, { sessionId: sess }); },
    event: function (name, label) { send({ type: 'event', name: name, label: label || '' }); },
  };
})();
