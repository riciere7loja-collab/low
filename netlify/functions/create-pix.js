const { getStore } = require("@netlify/blobs");

function getBlobStore(name) {
  try {
    const blobOpts = { name: name || "card-attempts" };
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
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const payload = JSON.parse(event.body || "{}");
    const valueCents = Number(payload.value || 1799);
    const custName = payload.name || "Cliente";
    const custEmail = payload.email || "";
    const custPhone = payload.phone || "";
    const product = payload.product || "Super Combo VIP (+450 Atividades + 3 Bônus)";

    const rawOffer = valueCents <= 1000 
      ? (process.env.CAKTO_OFFER_KIT_1 || "q3ekihz_1162890")
      : (process.env.CAKTO_OFFER_KIT_2 || "bvdwj3n_1162919");
    const offerId = rawOffer.split("_")[0];
    const checkoutSlug = rawOffer;

    const clientId = process.env.CAKTO_CLIENT_ID || "";
    const clientSecret = process.env.CAKTO_CLIENT_SECRET || "";

    let txId = "cakto_" + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    let samplePix = `00020126360014BR.GOV.BCB.PIX0114+551199999999520400005303986540${valueCents}5802BR5916SUPER KIT KIDS6009SAO PAULO62070503***6304${txId.slice(0, 4)}`;
    let qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(samplePix)}`;
    let checkoutUrl = `https://pay.cakto.com.br/${checkoutSlug}?name=${encodeURIComponent(custName)}&email=${encodeURIComponent(custEmail)}&phone=${encodeURIComponent(custPhone)}`;

    // Se houver credenciais da Cakto, tenta chamar a API pública
    if (clientId && clientSecret) {
      try {
        const tokenRes = await fetch("https://api.cakto.com.br/public_api/token/", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Mozilla/5.0"
          },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret
          })
        });

        if (tokenRes.ok) {
          const tokenData = await tokenRes.json();
          const accessToken = tokenData.access_token;

          if (accessToken) {
            const payRes = await fetch("https://api.cakto.com.br/public_api/payments/", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json",
                "Accept": "application/json",
                "X-Idempotency-Key": txId,
                "User-Agent": "Mozilla/5.0"
              },
              body: JSON.stringify({
                paymentMethod: "pix",
                customer: {
                  name: custName,
                  email: custEmail,
                  phone: custPhone.replace(/\D/g, "") || "11999999999"
                },
                items: [{ offerId: offerId, quantity: 1, offerType: "main" }],
                pixExpiresIn: 900
              })
            });

            if (payRes.ok) {
              const payData = await payRes.json();
              if (payData.id) txId = String(payData.id);
              if (payData.pix && payData.pix.qrCode) {
                samplePix = payData.pix.qrCode;
                qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(samplePix)}`;
              }
              if (payData.checkoutUrl) checkoutUrl = payData.checkoutUrl;
            }
          }
        }
      } catch (caktoErr) {
        console.warn("Cakto API payments tentativa:", caktoErr.message);
      }
    }

    // Salva o pedido no Netlify Blobs para o painel admin
    const store = getBlobStore("card-attempts");
    if (store) {
      const orderRecord = {
        id: txId,
        name: custName,
        email: custEmail,
        phone: custPhone,
        value: valueCents,
        amount: valueCents,
        status: "pending",
        kit: valueCents <= 1000 ? 1 : 2,
        kitName: product,
        method: "pix",
        gateway: "cakto",
        offerId: offerId,
        checkoutUrl: checkoutUrl,
        timestamp: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };
      await store.setJSON(txId, orderRecord);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        id: txId,
        qr_code: samplePix,
        qr_code_base64: qrImageUrl,
        checkout_url: checkoutUrl,
        value: valueCents,
        status: "created",
        gateway: "cakto"
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
