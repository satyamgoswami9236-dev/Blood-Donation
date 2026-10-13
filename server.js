
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "donors.json");

fs.mkdirSync(DATA_DIR, { recursive: true });

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, "[]", "utf8");
}

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

const validGroups = new Set([
  "A+", "A-", "B+", "B-",
  "AB+", "AB-", "O+", "O-"
]);

function readDonors() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveDonors(donors) {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(donors, null, 2),
    "utf8"
  );
}

function send(res, status, data, type = "application/json; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Cache-Control": "no-store"
  });

  if (type.startsWith("application/json")) {
    res.end(JSON.stringify(data));
  } else {
    res.end(data);
  }
}

function clean(value, max = 120) {
  return typeof value === "string"
    ? value.trim().slice(0, max)
    : "";
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let tooLarge = false;

    req.on("data", chunk => {
      body += chunk;

      if (body.length > 12000 && !tooLarge) {
        tooLarge = true;
        reject(new Error("Request is too large."));
      }
    });

    req.on("end", () => {
      if (tooLarge) return;

      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });

    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(
    req.url,
    `http://${req.headers.host || "localhost"}`
  );

  // API: Dashboard statistics.
  if (req.method === "GET" && url.pathname === "/api/stats") {
    return send(res, 200, {
      donors: readDonors().length
    });
  }

  // API: Search donors.
  if (req.method === "GET" && url.pathname === "/api/donors") {
    const group = clean(
      url.searchParams.get("bloodGroup"), 3
    ).toUpperCase();

    const city = clean(
      url.searchParams.get("city"), 80
    ).toLowerCase();

    let donors = readDonors();

    if (group && validGroups.has(group)) {
      donors = donors.filter(d => d.bloodGroup === group);
    }

    if (city) {
      donors = donors.filter(d =>
        d.city.toLowerCase().includes(city)
      );
    }

    // Never expose phone/email in public search responses.
    const publicDonors = donors.map(
      ({ id, name, bloodGroup, city, createdAt }) => ({
        id, name, bloodGroup, city, createdAt
      })
    );

    return send(res, 200, { donors: publicDonors });
  }

  // API: Register a donor.
  if (req.method === "POST" && url.pathname === "/api/donors") {
    try {
      const body = await readBody(req);

      const name = clean(body.name, 80);
      const phone = clean(body.phone, 18);
      const bloodGroup = clean(body.bloodGroup, 3).toUpperCase();
      const city = clean(body.city, 80);
      const email = clean(body.email, 120);

      if (name.length < 2) {
        return send(res, 400, {
          error: "Please enter a valid full name."
        });
      }

      if (!/^[0-9+() -]{10,18}$/.test(phone)) {
        return send(res, 400, {
          error: "Please enter a valid phone number."
        });
      }

      if (!validGroups.has(bloodGroup)) {
        return send(res, 400, {
          error: "Please select a valid blood group."
        });
      }

      if (city.length < 2) {
        return send(res, 400, {
          error: "Please enter a valid city."
        });
      }

      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return send(res, 400, {
          error: "Please enter a valid email address."
        });
      }

      if (body.consent !== true) {
        return send(res, 400, {
          error: "Please confirm the contact consent checkbox."
        });
      }

      const donors = readDonors();
      const phoneDigits = phone.replace(/\D/g, "");

      const duplicate = donors.some(
        d => d.phone.replace(/\D/g, "") === phoneDigits
      );

      if (duplicate) {
        return send(res, 409, {
          error: "This phone number is already registered."
        });
      }

      donors.push({
        id: crypto.randomUUID(),
        name,
        phone,
        bloodGroup,
        city,
        email,
        createdAt: new Date().toISOString()
      });

      saveDonors(donors);

      return send(res, 201, {
        message: "Thank you! Your donor registration has been saved."
      });

    } catch (error) {
      return send(res, 400, {
        error: error.message || "Could not process registration."
      });
    }
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return send(res, 405, { error: "Method not allowed." });
  }

  // Serve website files.
  let pathname = decodeURIComponent(url.pathname);

  if (pathname === "/") pathname = "/index.html";

  const filePath = path.resolve(ROOT, "." + pathname);

  if (!filePath.startsWith(ROOT + path.sep)) {
    return send(res, 403, { error: "Forbidden." });
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      return send(res, 404, { error: "Page not found." });
    }

    const type =
      mime[path.extname(filePath).toLowerCase()] ||
      "application/octet-stream";

    send(res, 200, req.method === "HEAD" ? "" : content, type);
  });
});

server.listen(PORT, () => {
  console.log(`LifeSaver is running at http://localhost:${PORT}`);
});
