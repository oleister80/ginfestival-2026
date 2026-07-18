const MAX_BODY_BYTES = 4_096;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GIN_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ALLOWED_ORIGINS = new Set([
  "https://oleister80.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
]);

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return {};
  }

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function jsonResponse(request, body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(request),
      ...extraHeaders,
    },
  });
}

async function readJsonBody(request) {
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
    throw new ApiError(415, "Content-Type must be application/json");
  }

  const declaredLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new ApiError(413, "Request body is too large");
  }

  if (!request.body) {
    throw new ApiError(400, "Request body is required");
  }

  const reader = request.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalBytes += value.byteLength;
    if (totalBytes > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new ApiError(413, "Request body is too large");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiError(400, "Request body must contain valid JSON");
  }
}

function validateIdentifiers({ deviceId, ginId, eventYear }) {
  validateDeviceId(deviceId);
  validateEventYear(eventYear);
  if (typeof ginId !== "string" || ginId.length > 160 || !GIN_ID_PATTERN.test(ginId)) {
    throw new ApiError(400, "ginId must be a valid product identifier");
  }
}

function validateDeviceId(deviceId) {
  if (typeof deviceId !== "string" || !UUID_PATTERN.test(deviceId)) {
    throw new ApiError(400, "deviceId must be a valid UUID");
  }
}

function validateEventYear(eventYear) {
  if (!Number.isInteger(eventYear) || eventYear < 2020 || eventYear > 2100) {
    throw new ApiError(400, "eventYear must be an integer between 2020 and 2100");
  }
}

function ratingFromRow(row) {
  return row
    ? {
        deviceId: row.device_id,
        ginId: row.gin_id,
        eventYear: row.event_year,
        rating: row.rating,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    : null;
}

async function saveRating(request, env) {
  const body = await readJsonBody(request);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "Request body must be a JSON object");
  }

  const { deviceId, ginId, eventYear, rating } = body;
  validateIdentifiers({ deviceId, ginId, eventYear });
  if (!Number.isInteger(rating) || rating < 1 || rating > 6) {
    throw new ApiError(400, "rating must be an integer between 1 and 6");
  }

  await env.DB.prepare(`
    INSERT INTO ratings (device_id, gin_id, event_year, rating, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(device_id, gin_id, event_year)
    DO UPDATE SET rating = excluded.rating, updated_at = CURRENT_TIMESTAMP
  `).bind(deviceId, ginId, eventYear, rating).run();

  const row = await env.DB.prepare(`
    SELECT device_id, gin_id, event_year, rating, created_at, updated_at
    FROM ratings
    WHERE device_id = ? AND gin_id = ? AND event_year = ?
  `).bind(deviceId, ginId, eventYear).first();

  return jsonResponse(request, { success: true, rating: ratingFromRow(row) });
}

async function getRating(request, env, url) {
  const deviceId = url.searchParams.get("deviceId");
  const ginId = url.searchParams.get("ginId");
  const eventYearText = url.searchParams.get("eventYear");
  const eventYear = eventYearText === null || eventYearText === "" ? NaN : Number(eventYearText);
  validateIdentifiers({ deviceId, ginId, eventYear });

  const row = await env.DB.prepare(`
    SELECT device_id, gin_id, event_year, rating, created_at, updated_at
    FROM ratings
    WHERE device_id = ? AND gin_id = ? AND event_year = ?
  `).bind(deviceId, ginId, eventYear).first();

  return jsonResponse(request, { success: true, rating: ratingFromRow(row) });
}

async function getDeviceRatings(request, env, url, deviceId) {
  const eventYearText = url.searchParams.get("eventYear");
  const eventYear = eventYearText === null || eventYearText === "" ? NaN : Number(eventYearText);
  validateDeviceId(deviceId);
  validateEventYear(eventYear);

  const { results } = await env.DB.prepare(`
    SELECT device_id, gin_id, event_year, rating, created_at, updated_at
    FROM ratings
    WHERE device_id = ? AND event_year = ?
    ORDER BY gin_id
  `).bind(deviceId, eventYear).all();

  return jsonResponse(request, {
    success: true,
    ratings: results.map(ratingFromRow),
  });
}

async function getStatistics(request, env, url) {
  const eventYearText = url.searchParams.get("eventYear") || "2026";
  const eventYear = Number(eventYearText);
  validateEventYear(eventYear);

  const { results } = await env.DB.prepare(`
    SELECT
      gin_id,
      COUNT(*) AS rating_count,
      ROUND(AVG(rating), 2) AS average_rating,
      SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) AS rating_1,
      SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) AS rating_2,
      SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) AS rating_3,
      SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) AS rating_4,
      SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) AS rating_5,
      SUM(CASE WHEN rating = 6 THEN 1 ELSE 0 END) AS rating_6
    FROM ratings
    WHERE event_year = ?
    GROUP BY gin_id
    ORDER BY average_rating DESC, rating_count DESC, gin_id ASC
  `).bind(eventYear).all();

  const gins = results.map((row) => ({
    ginId: row.gin_id,
    ratingCount: row.rating_count,
    averageRating: row.average_rating,
    distribution: {
      1: row.rating_1,
      2: row.rating_2,
      3: row.rating_3,
      4: row.rating_4,
      5: row.rating_5,
      6: row.rating_6,
    },
  }));

  return jsonResponse(request, { success: true, eventYear, gins });
}

function validateProductGroup(value, name) {
  if (!Array.isArray(value) || value.length > 250) {
    throw new ApiError(400, `${name} must be an array with at most 250 product identifiers`);
  }

  const uniqueIds = [...new Set(value)];
  uniqueIds.forEach((ginId) => {
    if (typeof ginId !== "string" || ginId.length > 160 || !GIN_ID_PATTERN.test(ginId)) {
      throw new ApiError(400, `${name} contains an invalid product identifier`);
    }
  });
  return uniqueIds;
}

async function getUniqueDeviceStatistics(request, env) {
  const body = await readJsonBody(request);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "Request body must be a JSON object");
  }

  const { eventYear } = body;
  validateEventYear(eventYear);
  const ginIds = validateProductGroup(body.ginIds, "ginIds");
  const otherIds = validateProductGroup(body.otherIds, "otherIds");
  const ginPlaceholders = ginIds.length ? ginIds.map(() => "?").join(", ") : "NULL";
  const otherPlaceholders = otherIds.length ? otherIds.map(() => "?").join(", ") : "NULL";

  const row = await env.DB.prepare(`
    SELECT
      COUNT(DISTINCT device_id) AS total,
      COUNT(DISTINCT CASE WHEN gin_id IN (${ginPlaceholders}) THEN device_id END) AS gin,
      COUNT(DISTINCT CASE WHEN gin_id IN (${otherPlaceholders}) THEN device_id END) AS other
    FROM ratings
    WHERE event_year = ?
  `).bind(...ginIds, ...otherIds, eventYear).first();

  return jsonResponse(request, {
    success: true,
    eventYear,
    uniqueDevices: {
      total: row?.total || 0,
      gin: row?.gin || 0,
      other: row?.other || 0,
    },
  });
}

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      const origin = request.headers.get("Origin");
      if (!origin || !ALLOWED_ORIGINS.has(origin)) {
        return jsonResponse(request, { success: false, message: "Origin not allowed" }, 403);
      }
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    try {
      if (url.pathname === "/api/health") {
        if (request.method !== "GET") {
          return jsonResponse(request, { success: false, message: "Method not allowed" }, 405, { Allow: "GET" });
        }
        return jsonResponse(request, {
          success: true,
          message: "Fredrikstad Gin Festival API is running",
        });
      }

      if (url.pathname === "/api/ratings") {
        if (request.method === "POST") return await saveRating(request, env);
        if (request.method === "GET") return await getRating(request, env, url);
        return jsonResponse(request, { success: false, message: "Method not allowed" }, 405, { Allow: "GET, POST" });
      }

      const deviceRatingsMatch = url.pathname.match(/^\/api\/ratings\/device\/([^/]+)$/);
      if (deviceRatingsMatch) {
        if (request.method !== "GET") {
          return jsonResponse(request, { success: false, message: "Method not allowed" }, 405, { Allow: "GET" });
        }
        return await getDeviceRatings(request, env, url, decodeURIComponent(deviceRatingsMatch[1]));
      }

      if (url.pathname === "/api/statistics") {
        if (request.method !== "GET") {
          return jsonResponse(request, { success: false, message: "Method not allowed" }, 405, { Allow: "GET" });
        }
        return await getStatistics(request, env, url);
      }

      if (url.pathname === "/api/statistics/unique-devices") {
        if (request.method !== "POST") {
          return jsonResponse(request, { success: false, message: "Method not allowed" }, 405, { Allow: "POST" });
        }
        return await getUniqueDeviceStatistics(request, env);
      }

      return jsonResponse(request, { success: false, message: "Not found" }, 404);
    } catch (error) {
      if (error instanceof ApiError) {
        return jsonResponse(request, { success: false, message: error.message }, error.status);
      }
      console.error(JSON.stringify({ message: "Unhandled API error", path: url.pathname }));
      return jsonResponse(request, { success: false, message: "Internal server error" }, 500);
    }
  },
};
