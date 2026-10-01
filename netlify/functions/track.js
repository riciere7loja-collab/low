const { getStore } = require("@netlify/blobs");

function getBlobStore() {
  try {
    const blobOpts = { name: "card-attempts" };
    if (process.env.BLOB_SITE_ID && process.env.BLOB_TOKEN) {
      blobOpts.siteID = process.env.BLOB_SITE_ID;
      blobOpts.token = process.env.BLOB_TOKEN;
    }
    return getStore(blobOpts);
  } catch (e) {
    return null;
  }
}

function parseGeo(headers) {
  try {
    const raw = headers["x-nf-geo"];
    if (!raw) return { city: "Brasil", region: "BR", lat: -15.78, lng: -47.92 };
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return {
      city: parsed.city || "Brasil",
      region: (parsed.subdivision && parsed.subdivision.code) || "",
      lat: parsed.latitude || -15.78,
      lng: parsed.longitude || -47.92
    };
  } catch (e) {
    return { city: "Brasil", region: "BR", lat: -15.78, lng: -47.92 };
  }
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  const store = getBlobStore();
  if (!store) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }

  try {
    const payload = JSON.parse(event.body || "{}");
    const sessId = payload.s || ("s_" + Math.random().toString(36).slice(2, 10));
    const now = Date.now();
    const geo = parseGeo(event.headers);

    let traffic = await store.get("live_traffic", { type: "json" }) || { sessions: {}, events: [], todaySessions: 0, todayCheckouts: 0, date: "" };
    const todayStr = new Date().toISOString().split("T")[0];
    if (traffic.date !== todayStr) {
      traffic.date = todayStr;
      traffic.todaySessions = 0;
      traffic.todayCheckouts = 0;
      traffic.sessions = {};
      traffic.events = [];
    }

    let session = traffic.sessions[sessId];
    const isNewSession = !session;

    if (!session) {
      session = {
        id: sessId,
        device: payload.dev || "mobile",
        city: geo.city,
        region: geo.region,
        lat: geo.lat,
        lng: geo.lng,
        page: payload.page || "/",
        source: payload.src || "direto",
        firstSeen: now,
        lastSeen: now,
        checkoutOpened: false,
        purchased: false
      };
      traffic.todaySessions = (traffic.todaySessions || 0) + 1;
    } else {
      session.lastSeen = now;
      if (payload.page) session.page = payload.page;
      if (payload.src) session.source = payload.src;
    }

    if (payload.type === "event") {
      const evtName = payload.name;
      if (evtName === "checkout_open" && !session.checkoutOpened) {
        session.checkoutOpened = true;
        traffic.todayCheckouts = (traffic.todayCheckouts || 0) + 1;
      }
      if (evtName === "venda_paga") {
        session.purchased = true;
      }

      traffic.events.unshift({
        name: evtName,
        label: payload.label || "",
        city: geo.city,
        t: now
      });
      if (traffic.events.length > 40) {
        traffic.events = traffic.events.slice(0, 40);
      }
    }

    traffic.sessions[sessId] = session;

    // Limpa sessoes inativas ha mais de 5 minutos
    const fiveMinAgo = now - 5 * 60 * 1000;
    for (const id of Object.keys(traffic.sessions)) {
      if (traffic.sessions[id].lastSeen < fiveMinAgo) {
        delete traffic.sessions[id];
      }
    }

    await store.setJSON("live_traffic", traffic);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true })
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
};
