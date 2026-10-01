/* YCZ Admin — lógica do painel */
(function () {
  'use strict';
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  var brl = function (v) { return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); };
  var brlC = function (cents) { return brl((cents || 0) / 100); };
  var KIT_NAMES = { 1: 'Kit Essencial (R$ 9,99)', 2: 'Super Combo VIP (R$ 17,99)', 999: 'Kit Essencial (R$ 9,99)', 1799: 'Super Combo VIP (R$ 17,99)' };
  var ST_LABEL = { paid: 'Pago', pending: 'Pendente', failed: 'Recusado', expired: 'Expirado', cancelled: 'Cancelado', refunded: 'Estornado', chargeback: 'Chargeback' };
  var EV_META = {
    venda_paga: { ico: '💰', cls: 'money', label: 'Venda confirmada' },
    pix_gerado: { ico: '⚡', cls: 'pix', label: 'Pix gerado' },
    checkout_open: { ico: '🛒', cls: 'eye', label: 'Checkout aberto' },
  };

  var token = localStorage.getItem('ycz-admin-token') || '';
  var charts = {};
  var ordersCache = [];
  var filter = { st: '', q: '' };
  var timers = [];
  var currentView = 'overview';

  // ---------- API ----------
  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'Content-Type': 'application/json', 'x-admin-token': token }, opts.headers || {});
    return fetch(path, opts).then(function (r) {
      if (r.status === 401) { showLogin(); throw new Error('auth'); }
      return r.json();
    });
  }

  // ---------- auth ----------
  function showLogin() {
    token = '';
    localStorage.removeItem('ycz-admin-token');
    $('#app').classList.add('hidden');
    $('#login').classList.remove('hidden');
    setTimeout(function () { $('#login-pwd').focus(); }, 100);
  }
  function showApp() {
    $('#login').classList.add('hidden');
    $('#app').classList.remove('hidden');
    startView(currentView);
  }
  function doLogin() {
    var pwd = $('#login-pwd').value;
    $('#login-err').textContent = '';
    fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pwd }) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) { $('#login-err').textContent = res.d.error || 'Falha no login.'; return; }
        token = res.d.token;
        localStorage.setItem('ycz-admin-token', token);
        showApp();
      })
      .catch(function () { $('#login-err').textContent = 'Falha de conexão.'; });
  }
  $('#login-btn').addEventListener('click', doLogin);
  $('#login-pwd').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
  $('#logout').addEventListener('click', showLogin);

  // ---------- navegação ----------
  function switchView(v) {
    currentView = v;
    $$('.nav-item').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-view') === v); });
    $$('.view').forEach(function (s) { s.classList.add('hidden'); });
    $('#view-' + v).classList.remove('hidden');
    startView(v);
  }
  $$('.nav-item').forEach(function (b) { b.addEventListener('click', function () { switchView(b.getAttribute('data-view')); }); });
  document.addEventListener('click', function (e) {
    var l = e.target.closest('[data-view-link]');
    if (l) switchView(l.getAttribute('data-view-link'));
  });

  function clearTimers() { timers.forEach(clearInterval); timers = []; }
  function startView(v) {
    clearTimers();
    if (v === 'overview') { loadOverview(); loadNavLive(); timers.push(setInterval(loadOverview, 30000), setInterval(loadNavLive, 10000)); }
    if (v === 'orders') { loadOrders(); timers.push(setInterval(loadOrders, 30000)); }
    if (v === 'live') { initGlobe(); loadLive(); timers.push(setInterval(loadLive, 5000)); }
    if (v === 'pixels') { loadSettings(); }
  }

  var timeAgo = function (ts) {
    var s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return 'agora';
    if (s < 3600) return 'há ' + Math.floor(s / 60) + ' min';
    if (s < 86400) return 'há ' + Math.floor(s / 3600) + ' h';
    return 'há ' + Math.floor(s / 86400) + ' d';
  };
  var fmtDT = function (iso) {
    var d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };
  function pill(o) {
    var st = o.status;
    var extra = (st === 'paid' && o.fulfilled) ? ' <span class="pill sent">Enviado</span>' : '';
    return '<span class="pill ' + st + '">' + (ST_LABEL[st] || st) + '</span>' + extra;
  }

  // ---------- charts ----------
  var gridColor = 'rgba(255,255,255,.05)';
  var tickColor = '#8b8b95';
  if (typeof Chart !== 'undefined') {
    Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";
    Chart.defaults.font.size = 11;
    Chart.defaults.color = tickColor;
  }

  function mkChart(id, cfg) {
    if (typeof Chart === 'undefined') return;
    var el = $('#' + id);
    if (!el) return;
    if (charts[id]) { charts[id].data = cfg.data; charts[id].update('none'); return; }
    try {
      charts[id] = new Chart(el, cfg);
    } catch (e) {
      console.warn('Erro ao renderizar gráfico ' + id, e);
    }
  }

  function baseTooltip() {
    return { backgroundColor: '#1a1a1f', borderColor: 'rgba(255,255,255,.1)', borderWidth: 1, titleColor: '#ececf1', bodyColor: '#c9c9d1', padding: 10, cornerRadius: 10, displayColors: false };
  }

  // ---------- visão geral ----------
  function loadOverview() {
    api('/api/admin/summary').then(function (s) {
      $('#ov-updated').textContent = 'atualizado ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      var delta = function (cur, prev, pct) {
        if (!prev && !cur) return '<span class="s-delta flat">— sem base de ontem</span>';
        if (!prev) return '<span class="s-delta up">▲ novo</span>';
        var d = ((cur - prev) / prev) * 100;
        var cls = d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
        var sym = d > 0 ? '▲' : d < 0 ? '▼' : '—';
        return '<span class="s-delta ' + cls + '">' + sym + ' ' + Math.abs(d).toFixed(0) + '% vs ontem</span>';
      };
      $('#stat-cards').innerHTML =
        '<div class="stat" style="--glow:rgba(232,182,76,.14)"><div class="s-label">Receita hoje</div><div class="s-value">' + brl(s.today.revenue) + '</div>' + delta(s.today.revenue, s.yesterday.revenue) + '</div>' +
        '<div class="stat" style="--glow:rgba(96,165,250,.12)"><div class="s-label">Pedidos pagos hoje</div><div class="s-value">' + s.today.orders + '</div>' + delta(s.today.orders, s.yesterday.orders) + '</div>' +
        '<div class="stat live-stat" style="--glow:rgba(52,211,153,.12)"><div class="s-label">Online agora</div><div class="s-value"><span class="dot-live"></span><span id="ov-online">…</span></div><span class="s-delta flat">' + s.today.sessions + ' visitas hoje</span></div>' +
        '<div class="stat" style="--glow:rgba(167,139,250,.12)"><div class="s-label">Conversão hoje</div><div class="s-value">' + s.today.conversion + '%</div>' + delta(s.today.conversion, s.yesterday.conversion) + '</div>';

      $('#rev30-total').textContent = brl(s.totals30.revenue) + ' · ticket ' + brl(s.totals30.ticket);

      // receita + vendas 30d (linha dourada = R$, barras azuis = nº de pedidos)
      var ctx = $('#ch-revenue').getContext('2d');
      var grad = ctx.createLinearGradient(0, 0, 0, 280);
      grad.addColorStop(0, 'rgba(232,182,76,.35)'); grad.addColorStop(1, 'rgba(232,182,76,0)');
      mkChart('ch-revenue', {
        data: {
          labels: s.days30.map(function (d) { return d.d.split('-').reverse().join('/'); }),
          datasets: [
            { type: 'line', label: 'Receita', data: s.days30.map(function (d) { return d.revenue; }), borderColor: '#e8b64c', backgroundColor: grad, fill: true, tension: .4, borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 5, pointBackgroundColor: '#e8b64c', yAxisID: 'y', order: 1 },
            { type: 'bar', label: 'Vendas', data: s.days30.map(function (d) { return d.orders; }), backgroundColor: 'rgba(96,165,250,.28)', hoverBackgroundColor: 'rgba(96,165,250,.6)', borderRadius: 4, barPercentage: .55, yAxisID: 'y1', order: 2 }
          ]
        },
        options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: false }, tooltip: Object.assign(baseTooltip(), { callbacks: { label: function (c) { return c.dataset.label === 'Receita' ? 'Receita: ' + brl(c.parsed.y) : 'Vendas: ' + c.parsed.y + ' pedido(s)'; } } }) }, scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } }, y: { position: 'left', grid: { color: gridColor }, ticks: { callback: function (v) { return 'R$' + v; }, maxTicksLimit: 5 }, beginAtZero: true }, y1: { position: 'right', grid: { display: false }, ticks: { precision: 0, maxTicksLimit: 4 }, beginAtZero: true } } }
      });

      // por hora
      mkChart('ch-hours', {
        type: 'bar',
        data: { labels: Array.from({ length: 24 }, function (_, i) { return i + 'h'; }), datasets: [{ data: s.hoursToday, backgroundColor: 'rgba(96,165,250,.55)', hoverBackgroundColor: '#60a5fa', borderRadius: 5, barPercentage: .7 }] },
        options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: Object.assign(baseTooltip(), { callbacks: { label: function (c) { return brl(c.parsed.y); } } }) }, scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } }, y: { grid: { color: gridColor }, ticks: { maxTicksLimit: 4 }, beginAtZero: true } } }
      });

      // métodos
      var pm = s.byMethod || {};
      mkChart('ch-methods', {
        type: 'doughnut',
        data: { labels: ['Pix', 'Cartão'], datasets: [{ data: [(pm.pix || {}).count || 0, (pm.credit_card || {}).count || 0], backgroundColor: ['#e8b64c', '#60a5fa'], borderColor: '#101013', borderWidth: 4, hoverOffset: 6 }] },
        options: { maintainAspectRatio: false, cutout: '68%', plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, pointStyleWidth: 8, boxHeight: 6 } }, tooltip: Object.assign(baseTooltip(), { callbacks: { label: function (c) { var m = c.dataIndex === 0 ? pm.pix : pm.credit_card; return c.parsed + ' venda(s) · ' + brl((m || {}).revenue || 0); } } }) } }
      });

      // kits
      var bk = s.byKit || {};
      mkChart('ch-kits', {
        type: 'bar',
        data: { labels: ['1 Unidade', '3 Unidades', '5 Unidades', 'Bump Kokeshi'], datasets: [{ data: [(bk[1] || {}).count || 0, (bk[3] || {}).count || 0, (bk[5] || {}).count || 0, s.bumps || 0], backgroundColor: ['rgba(232,182,76,.55)', 'rgba(232,182,76,.85)', 'rgba(232,182,76,.7)', 'rgba(167,139,250,.6)'], borderRadius: 6 }] },
        options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: baseTooltip() }, scales: { x: { grid: { color: gridColor }, ticks: { precision: 0 }, beginAtZero: true }, y: { grid: { display: false } } } }
      });

      // funil
      var f = s.funnel, max = Math.max(f.sessions, 1);
      var step = function (label, val, c1, c2, rate) {
        return '<div class="f-step"><div class="f-top"><span>' + label + '</span><b>' + val + '</b></div>' +
          '<div class="f-bar"><div class="f-fill" style="--c1:' + c1 + ';--c2:' + c2 + ';width:' + Math.max(2, 100 * val / max) + '%"></div></div>' +
          (rate !== null ? '<div class="f-rate">' + rate + '</div>' : '<div class="f-rate">&nbsp;</div>') + '</div>';
      };
      var r1 = f.sessions ? (100 * f.checkouts / f.sessions).toFixed(1) + '% abrem o checkout' : '';
      var r2 = f.checkouts ? (100 * f.paid / f.checkouts).toFixed(1) + '% fecham a compra' : '';
      $('#funnel').innerHTML =
        step('Visitantes', f.sessions, '#60a5fa', '#3b82f6', null) +
        step('Abriram checkout', f.checkouts, '#e8b64c', '#b8860b', r1) +
        step('Compraram', f.paid, '#34d399', '#059669', r2);

      // recentes
      $('#recent-table').innerHTML = '<thead><tr><th>Pedido</th><th>Cliente</th><th>Kit</th><th>Valor</th><th>Status</th><th>Quando</th></tr></thead><tbody>' +
        (s.recent || []).map(function (o) {
          return '<tr><td class="mut">' + o.ref + '</td><td>' + (o.name || '—') + '</td><td>' + (KIT_NAMES[o.kit] || o.kit) + '</td><td><b>' + brlC(o.amount) + '</b></td><td>' + pill(o) + '</td><td class="mut">' + timeAgo(new Date(o.createdAt).getTime()) + '</td></tr>';
        }).join('') + '</tbody>';
    }).catch(function () {});
  }

  function loadNavLive() {
    api('/api/admin/live').then(function (l) {
      var el = $('#ov-online'); if (el) el.textContent = l.online;
      var nb = $('#nav-online');
      nb.textContent = l.online; nb.classList.toggle('hidden', !l.online);
    }).catch(function () {});
  }

  // ---------- pedidos ----------
  function loadOrders() {
    api('/api/admin/orders').then(function (d) {
      ordersCache = d.orders || [];
      var pend = ordersCache.filter(function (o) { return o.status === 'paid' && !o.fulfilled; }).length;
      var nb = $('#nav-pending'); nb.textContent = pend; nb.classList.toggle('hidden', !pend);
      renderOrders();
    }).catch(function () {});
  }
  function renderOrders() {
    var q = filter.q.toLowerCase();
    var rows = ordersCache.filter(function (o) {
      if (filter.st && o.status !== filter.st) return false;
      if (q && ((o.customer && (o.customer.name + o.customer.email + o.customer.phone) || '') + o.ref).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    $('#orders-empty').classList.toggle('hidden', rows.length > 0);
    $('#orders-table').innerHTML = '<thead><tr><th>Pedido</th><th>Cliente</th><th>Kit</th><th>Método</th><th>Valor</th><th>Origem</th><th>Status</th><th>Data</th></tr></thead><tbody>' +
      rows.map(function (o, i) {
        return '<tr class="clickable" data-i="' + ordersCache.indexOf(o) + '">' +
          '<td class="mut">' + o.ref + '</td>' +
          '<td>' + ((o.customer || {}).name || '—') + '</td>' +
          '<td>' + (KIT_NAMES[o.kit] || o.kit) + (o.bump ? ' <span class="mut">+bump</span>' : '') + '</td>' +
          '<td>' + (o.method === 'pix' ? 'Pix' : 'Cartão' + (o.installments > 1 ? ' ' + o.installments + 'x' : '')) + '</td>' +
          '<td><b>' + brlC(o.amount) + '</b></td>' +
          '<td class="mut">' + ((o.attribution && o.attribution.campaign) ? (o.attribution.campaign + ' <span style="font-size:10px;opacity:.7">(' + (o.attribution.source || 'ads') + ')</span>') : ((o.attribution || {}).source || 'direto')) + '</td>' +
          '<td>' + pill(o) + '</td>' +
          '<td class="mut">' + fmtDT(o.createdAt) + '</td></tr>';
      }).join('') + '</tbody>';
    $$('#orders-table tr.clickable').forEach(function (tr) {
      tr.addEventListener('click', function () { openDrawer(ordersCache[Number(tr.getAttribute('data-i'))]); });
    });
  }
  $('#order-search').addEventListener('input', function () { filter.q = this.value; renderOrders(); });
  $$('#status-chips .chip').forEach(function (c) {
    c.addEventListener('click', function () {
      $$('#status-chips .chip').forEach(function (x) { x.classList.remove('active'); });
      c.classList.add('active');
      filter.st = c.getAttribute('data-st');
      renderOrders();
    });
  });
  $('#csv-btn').addEventListener('click', function () {
    var head = ['pedido', 'data', 'status', 'cliente', 'email', 'telefone', 'cpf', 'kit', 'bump', 'metodo', 'parcelas', 'valor', 'origem', 'campanha', 'cep', 'rua', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'enviado', 'rastreio'];
    var lines = ordersCache.map(function (o) {
      var c = o.customer || {}, a = o.address || {}, at = o.attribution || {};
      return [o.ref, o.createdAt, o.status, c.name, c.email, c.phone, (c.document || {}).number, KIT_NAMES[o.kit] || o.kit, o.bump ? 'sim' : 'não', o.method, o.installments || 1, (o.amount / 100).toFixed(2).replace('.', ','), at.source || '', at.campaign || '', a.zipCode, a.street, a.streetNumber, a.complement || '', a.neighborhood || '', a.city, a.state, o.fulfilled ? 'sim' : 'não', o.tracking || ''];
    });
    var csv = [head].concat(lines).map(function (r) { return r.map(function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }).join(';'); }).join('\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'pedidos-ycz.csv';
    a.click();
  });

  // ---------- drawer ----------
  function openDrawer(o) {
    var c = o.customer || {}, a = o.address || {}, at = o.attribution || {};
    var wa = (c.phone || '').length >= 10 ? 'https://wa.me/55' + c.phone : null;
    $('#drawer-body').innerHTML =
      '<div class="d-head"><h2>' + o.ref + '</h2><button class="d-close" id="d-close">✕</button></div>' +
      '<div class="d-sub">' + fmtDT(o.createdAt) + ' · ' + pill(o) + '</div>' +
      '<div class="d-sec"><h4>Pagamento</h4>' +
        '<div class="d-row"><span>Método</span><b>' + (o.method === 'pix' ? 'Pix' : 'Cartão de crédito' + (o.installments > 1 ? ' — ' + o.installments + 'x' : '')) + '</b></div>' +
        (o.paidAt ? '<div class="d-row"><span>Pago em</span><b>' + fmtDT(o.paidAt) + '</b></div>' : '') +
        (o.refusedReason ? '<div class="d-row"><span>Motivo recusa</span><b>' + o.refusedReason + '</b></div>' : '') +
        '<div class="d-row"><span>Kit</span><b>' + (KIT_NAMES[o.kit] || o.kit) + (o.bump ? ' + Bump Kokeshi' : '') + '</b></div>' +
        '<div class="d-row"><span>Total</span><b class="d-total">' + brlC(o.amount) + '</b></div></div>' +
      '<div class="d-sec"><h4>Cliente</h4>' +
        '<div class="d-row"><span>Nome</span><b>' + (c.name || '—') + '</b></div>' +
        '<div class="d-row"><span>E-mail</span><b>' + (c.email || '—') + '</b></div>' +
        '<div class="d-row"><span>Celular</span><b>' + (c.phone || '—') + '</b></div>' +
        '<div class="d-row"><span>CPF</span><b>' + ((c.document || {}).number || '—') + '</b></div>' +
        (wa ? '<div class="d-actions"><a class="btn-wa" target="_blank" href="' + wa + '">💬 Chamar no WhatsApp</a></div>' : '') + '</div>' +
      '<div class="d-sec"><h4>Entrega</h4>' +
        '<div class="d-row"><span>Endereço</span><b>' + [a.street, a.streetNumber].filter(Boolean).join(', ') + (a.complement ? ' — ' + a.complement : '') + '</b></div>' +
        '<div class="d-row"><span>Bairro</span><b>' + (a.neighborhood || '—') + '</b></div>' +
        '<div class="d-row"><span>Cidade/UF</span><b>' + (a.city || '—') + '/' + (a.state || '') + '</b></div>' +
        '<div class="d-row"><span>CEP</span><b>' + (a.zipCode || '—') + '</b></div>' +
        '<div class="d-actions">' +
          '<input id="d-tracking" placeholder="Código de rastreio (opcional)" value="' + (o.tracking || '') + '" />' +
          '<button class="btn-primary ' + (o.fulfilled ? 'undo' : '') + '" id="d-fulfill">' + (o.fulfilled ? '↩ Desmarcar envio' : '✓ Marcar como enviado') + '</button>' +
        '</div></div>' +
      '<div class="d-sec"><h4>Origem</h4>' +
        '<div class="d-row"><span>Fonte</span><b>' + (at.source || 'direto') + '</b></div>' +
        (at.campaign ? '<div class="d-row"><span>Campanha</span><b>' + at.campaign + '</b></div>' : '') +
        (at.medium ? '<div class="d-row"><span>Mídia</span><b>' + at.medium + '</b></div>' : '') +
        (at.content ? '<div class="d-row"><span>Anúncio / Conteúdo</span><b>' + at.content + '</b></div>' : '') + '</div>';
    $('#drawer').classList.remove('hidden');
    $('#d-close').addEventListener('click', closeDrawer);
    $('#d-fulfill').addEventListener('click', function () {
      var btn = this;
      btn.disabled = true;
      api('/api/admin/order-update', { method: 'POST', body: JSON.stringify({ ref: o.ref, fulfilled: !o.fulfilled, tracking: $('#d-tracking').value }) })
        .then(function () { closeDrawer(); loadOrders(); })
        .catch(function () { btn.disabled = false; });
    });
  }
  function closeDrawer() { $('#drawer').classList.add('hidden'); }
  $('.drawer-back').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });

  // ---------- ao vivo ----------
  var globe = null;
  function initGlobe() {
    if (globe || typeof Globe === 'undefined') return;
    var el = $('#globe');
    if (!el) return;
    try {
      var adminAsset = function(f) { return '/admin/' + f; };
      globe = Globe()(el)
        .globeImageUrl(adminAsset('earth-night.jpg'))
        .bumpImageUrl(adminAsset('earth-topology.png'))
        .backgroundColor('rgba(0,0,0,0)')
        .showAtmosphere(true)
        .atmosphereColor('#4a7dff')
        .atmosphereAltitude(0.18)
        .pointAltitude(function (d) { return 0.02 + Math.min(d.count, 20) * 0.008; })
        .pointRadius(function (d) { return d.active ? 0.9 : 0.55; })
        .pointColor(function (d) { return d.active ? '#34d399' : '#e8b64c'; })
        .pointsMerge(false)
        .ringColor(function () { return function (t) { return 'rgba(52,211,153,' + (1 - t) + ')'; }; })
        .ringMaxRadius(4.5)
        .ringPropagationSpeed(2.2)
        .ringRepeatPeriod(1100)
        .width(el.clientWidth || 640)
        .height(el.clientHeight || 430);
      globe.controls().autoRotate = true;
      globe.controls().autoRotateSpeed = 0.55;
      globe.controls().enableZoom = false;
      globe.pointOfView({ lat: -14, lng: -52, altitude: 2.1 }); // Brasil de frente
      window.addEventListener('resize', function () {
        if (globe && el) { globe.width(el.clientWidth); globe.height(el.clientHeight); }
      });
    } catch (err) {
      console.warn('Erro ao inicializar globo 3D:', err);
    }
  }

  function loadLive() {
    api('/api/admin/live').then(function (l) {
      $('#live-updated').textContent = 'atualiza a cada 5s';
      $('#live-count').textContent = l.online;
      var nb = $('#nav-online'); nb.textContent = l.online; nb.classList.toggle('hidden', !l.online);
      var mob = l.sessions.filter(function (s) { return s.device === 'mobile'; }).length;
      $('#live-split').innerHTML = '<div>📱 <b>' + mob + '</b> mobile</div><div>💻 <b>' + (l.online - mob) + '</b> desktop</div>';

      // globo: pontos por cidade (dourado = 24h, verde = ativo agora) + anéis pulsando nos ativos
      if (globe) {
        var pts = l.points || [];
        globe.pointsData(pts.map(function (p) { return { lat: p.lat, lng: p.lng, count: p.count, active: p.active > 0, city: p.city }; }));
        globe.ringsData(pts.filter(function (p) { return p.active > 0; }).map(function (p) { return { lat: p.lat, lng: p.lng }; }));
      }
      var top = (l.points || []).slice(0, 5);
      $('#globe-cities').innerHTML = top.map(function (p) {
        return '<span class="gc-chip">' + (p.active ? '<span class="gc-dot"></span>' : '') + (p.city || '?') + (p.region ? '/' + p.region : '') + ' <b>' + p.count + '</b></span>';
      }).join('');

      $('#live-empty').classList.toggle('hidden', l.sessions.length > 0);
      $('#live-table').innerHTML = l.sessions.length ? '<thead><tr><th>Dispositivo</th><th>Cidade</th><th>Página</th><th>Origem</th><th>Tempo no site</th><th>Etapa</th></tr></thead><tbody>' +
        l.sessions.map(function (s) {
          var stage = s.purchased ? '<span class="pill paid">Comprou</span>' : s.checkoutOpened ? '<span class="pill pending">No checkout</span>' : '<span class="pill expired">Navegando</span>';
          var mins = Math.floor(s.secondsActive / 60);
          return '<tr><td>' + (s.device === 'mobile' ? '📱 Mobile' : '💻 Desktop') + '</td><td>' + (s.city || '<span class="mut">—</span>') + '</td><td class="mut">' + (s.page || '/') + '</td><td>' + (s.source || 'direto') + '</td><td class="mut">' + (mins ? mins + ' min' : s.secondsActive + 's') + '</td><td>' + stage + '</td></tr>';
        }).join('') + '</tbody>' : '';

      $('#event-feed').innerHTML = (l.events || []).map(function (e) {
        var m = EV_META[e.name] || { ico: '·', cls: '', label: e.name };
        return '<div class="feed-item"><div class="feed-ico ' + m.cls + '">' + m.ico + '</div>' +
          '<div class="feed-txt"><b>' + m.label + '</b><span>' + (e.label || '') + '</span></div>' +
          '<div class="feed-time">' + timeAgo(e.t) + '</div></div>';
      }).join('') || '<div class="empty">Sem atividade recente.</div>';
    }).catch(function () {});
  }

  // ---------- pixels ----------
  function loadSettings() {
    api('/api/admin/settings').then(function (s) {
      var cidEl = $('#gw-client-id');
      if (cidEl) {
        cidEl.value = s.propixClientId || '';
        cidEl.placeholder = s.gatewayKeySet ? 'ID configurado (' + s.gatewayKeyHint + ')' : 'Cole o Client ID da ProPix';
      }
      var secEl = $('#gw-client-secret');
      if (secEl) {
        secEl.value = '';
        secEl.placeholder = s.propixClientSecretSet ? 'Secret configurado (' + s.propixClientSecretHint + ') — cole outro para substituir' : 'Cole o Client Secret da ProPix';
      }
      var gwStatus = $('#gw-status');
      if (gwStatus) {
        gwStatus.textContent = s.gatewayKeySet ? 'Ativo · ' + (s.gatewayKeySource || 'ProPix') : 'SEM CHAVES';
      }
      if ($('#px-meta')) $('#px-meta').value = s.metaPixelId || '';
      var pxCapi = $('#px-capi');
      if (pxCapi) {
        pxCapi.value = '';
        pxCapi.placeholder = s.metaCapiTokenSet ? 'Token salvo (' + s.metaCapiTokenHint + ') — cole outro para substituir' : 'Cole o token gerado no Gerenciador de Eventos';
      }
      var on = [s.metaPixelId && 'Meta', s.metaCapiTokenSet && 'CAPI'].filter(Boolean);
      var pxStatus = $('#px-status');
      if (pxStatus) pxStatus.textContent = on.length ? 'Ativos: ' + on.join(' · ') : 'Nenhum pixel configurado';
      var whEl = $('#gw-webhook-url');
      if (whEl) whEl.value = location.origin + '/api/webhook/propix';
    }).catch(function () {});
  }

  var gwSaveBtn = $('#gw-save');
  if (gwSaveBtn) {
    gwSaveBtn.addEventListener('click', function () {
      var cid = ($('#gw-client-id') && $('#gw-client-id').value.trim()) || '';
      var sec = ($('#gw-client-secret') && $('#gw-client-secret').value.trim()) || '';
      var msg = $('#gw-msg');
      if (!cid && !sec) {
        if (msg) { msg.className = 'px-msg err'; msg.textContent = 'Preencha o Client ID e Client Secret.'; }
        return;
      }
      gwSaveBtn.disabled = true;
      if (msg) { msg.className = 'px-msg'; msg.textContent = 'Salvando e testando na ProPix…'; }
      var payload = {};
      if (cid) payload.propixClientId = cid;
      if (sec) payload.propixClientSecret = sec;
      api('/api/admin/settings', { method: 'POST', body: JSON.stringify(payload) })
        .then(function () { return api('/api/admin/pixel-test', { method: 'POST', body: JSON.stringify({}) }); })
        .then(function (r) {
          var gw = (r.checks || []).find(function (c) { return c.name.indexOf('Gateway') > -1; });
          if (msg) {
            if (gw && gw.ok) { msg.className = 'px-msg ok'; msg.textContent = '✓ Chaves salvas e validadas com sucesso na ProPix!'; }
            else { msg.className = 'px-msg err'; msg.textContent = '✕ Chaves salvas, mas a ProPix retornou: ' + (gw ? gw.msg : 'erro'); }
          }
          loadSettings();
        })
        .catch(function () { if (msg) { msg.className = 'px-msg err'; msg.textContent = 'Falha ao salvar chaves.'; } })
        .finally(function () { gwSaveBtn.disabled = false; });
    });
  }

  var pxSaveBtn = $('#px-save');
  if (pxSaveBtn) {
    pxSaveBtn.addEventListener('click', function () {
      pxSaveBtn.disabled = true;
      var msg = $('#px-msg'); if (msg) { msg.className = 'px-msg'; msg.textContent = 'Salvando…'; }
      api('/api/admin/settings', { method: 'POST', body: JSON.stringify({ metaPixelId: ($('#px-meta') && $('#px-meta').value.trim()) || '', metaCapiToken: ($('#px-capi') && $('#px-capi').value.trim()) || '' }) })
        .then(function () { if (msg) { msg.className = 'px-msg ok'; msg.textContent = '✓ Configuração salva — a loja já injeta os novos pixels.'; } loadSettings(); })
        .catch(function () { if (msg) { msg.className = 'px-msg err'; msg.textContent = 'Falha ao salvar. Tente de novo.'; } })
        .finally(function () { pxSaveBtn.disabled = false; });
    });
  }

  var pxTestBtn = $('#px-test');
  if (pxTestBtn) {
    pxTestBtn.addEventListener('click', function () {
      pxTestBtn.disabled = true; pxTestBtn.textContent = 'Testando…';
      var resEl = $('#px-results');
      if (resEl) resEl.innerHTML = '';
      api('/api/admin/pixel-test', { method: 'POST', body: JSON.stringify({ testEventCode: ($('#px-testcode') && $('#px-testcode').value.trim()) || '' }) })
        .then(function (r) {
          if (resEl) {
            resEl.innerHTML = (r.checks || []).map(function (c, i) {
              return '<div class="px-check ' + (c.ok ? 'ok' : 'err') + '" style="animation-delay:' + (i * 90) + 'ms"><div class="pc-ico">' + (c.ok ? '✓' : '✕') + '</div><div><b>' + c.name + '</b><span>' + c.msg + '</span></div></div>';
            }).join('');
          }
        })
        .catch(function () { if (resEl) resEl.innerHTML = '<div class="px-check err"><div class="pc-ico">✕</div><div><b>Erro</b><span>Falha ao executar o teste.</span></div></div>'; })
        .finally(function () { pxTestBtn.disabled = false; pxTestBtn.textContent = '▶ Testar integração'; });
    });
  }

  // ---------- boot ----------
  try {
    if (token) showApp(); else showLogin();
  } catch (err) {
    console.error('Erro na inicialização do painel:', err);
    showLogin();
  }
})();
