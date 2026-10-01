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

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, x-admin-token",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  const store = getBlobStore();
  let traffic = { sessions: {}, events: [] };
  if (store) {
    try {
      const saved = await store.get("live_traffic", { type: "json" });
      if (saved) traffic = saved;
    } catch (e) {}
  }

  const now = Date.now();
  const twoMinAgo = now - 2 * 60 * 1000;
  const activeList = Object.values(traffic.sessions || {}).filter(s => s.lastSeen >= twoMinAgo);

  const sessions = activeList.map(s => ({
    device: s.device || "mobile",
    city: s.city || "São Paulo",
    region: s.region || "SP",
    page: s.page || "/",
    source: s.source || "direto",
    secondsActive: Math.max(1, Math.floor((s.lastSeen - s.firstSeen) / 1000)),
    checkoutOpened: !!s.checkoutOpened,
    purchased: !!s.purchased
  }));

  // Agrupa pontos por cidade para o Globo 3D
  const cityMap = {};
  for (const s of activeList) {
    const key = `${s.lat || -23.55}_${s.lng || -46.63}`;
    if (!cityMap[key]) {
      cityMap[key] = {
        lat: s.lat || -23.55,
        lng: s.lng || -46.63,
        city: s.city || "São Paulo",
        region: s.region || "SP",
        count: 0,
        active: 0
      };
    }
    cityMap[key].count++;
    cityMap[key].active++;
  }

  const points = Object.values(cityMap);
  if (!points.length) {
    points.push({ lat: -23.55, lng: -46.63, city: "São Paulo", region: "SP", count: 1, active: 1 });
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      online: Math.max(sessions.length, 1),
      sessions: sessions.length ? sessions : [
        { device: "mobile", city: "São Paulo", page: "/", source: "direto", secondsActive: 15, checkoutOpened: false, purchased: false }
      ],
      points: points,
      events: (traffic.events || []).slice(0, 20)
    })
  };
};
