const { getStore } = require("@netlify/blobs");

function getBlobStore() {
  try {
    const blobOpts = { name: "site-settings" };
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
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=60, s-maxage=60"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  const store = getBlobStore();
  let metaPixelId = "";

  if (store) {
    try {
      const saved = await store.get("meta", { type: "json" });
      if (saved && saved.metaPixelId) {
        metaPixelId = saved.metaPixelId;
      }
    } catch (e) {}
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ metaPixelId })
  };
};

