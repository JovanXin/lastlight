// Zero-dependency static file server for local development, with live reload.
// Serves the app and reloads every connected browser tab whenever a file in
// the project changes.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT) || 5173;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".gpx": "application/gpx+xml; charset=utf-8",
};

const LIVE_SCRIPT =
  '<script>(function(){try{var s=new EventSource("/__reload");' +
  's.onmessage=function(){location.reload();};}catch(e){}})();</script>';

const WATCH_EXT = new Set([".js", ".mjs", ".css", ".html", ".json", ".webmanifest", ".svg"]);
const clients = new Set();
let reloadTimer = null;

function broadcast() {
  const payload = "data: reload\n\n";
  for (const res of clients) {
    try { res.write(payload); } catch (err) { clients.delete(res); }
  }
}

function onChange(filename) {
  if (!filename) return;
  if (filename.startsWith(".git") || filename.includes("node_modules")) return;
  if (filename.startsWith("docs")) return;
  if (!WATCH_EXT.has(path.extname(filename).toLowerCase())) return;
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(broadcast, 90);
}

// Watch source directories rather than the whole tree: recursively watching the
// project root also watches .git, and deleting a branch then crashes the watcher
// with ENOENT. Errors re-arm the watcher instead of taking the server down.
function watchDir(dir, recursive) {
  let watcher;
  try {
    watcher = fs.watch(dir, { recursive: recursive }, function (event, filename) { onChange(filename); });
  } catch (err) {
    console.warn("Live reload: cannot watch " + dir + " (" + err.message + ")");
    return;
  }
  watcher.on("error", function (err) {
    console.warn("Live reload: watcher error on " + dir + " (" + err.message + "), re-arming");
    try { watcher.close(); } catch (closeErr) { /* already closed */ }
    setTimeout(function () { watchDir(dir, recursive); }, 500);
  });
}

function startWatcher() {
  watchDir(path.join(root, "src"), true);
  watchDir(path.join(root, "icons"), true);
  watchDir(root, false); // root files only: index.html, styles.css, sw.js, manifest
  console.log("Live reload watching src, icons and the project root");
}

const server = http.createServer(function (req, res) {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);

  if (urlPath === "/__reload") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write("retry: 1000\n\n");
    clients.add(res);
    req.on("close", function () { clients.delete(res); });
    return;
  }

  let filePath = path.join(root, urlPath);
  if (urlPath.endsWith("/")) filePath = path.join(filePath, "index.html");
  if (!filePath.startsWith(root)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  fs.stat(filePath, function (err, stat) {
    if (err || !stat.isFile()) {
      filePath = path.join(root, "index.html");
    }
    fs.readFile(filePath, function (readErr, data) {
      if (readErr) {
        res.writeHead(404).end("Not found");
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const type = TYPES[ext] || "application/octet-stream";
      if (ext === ".html") {
        const html = data.toString("utf8").replace("</body>", LIVE_SCRIPT + "</body>");
        res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache" });
        res.end(html);
        return;
      }
      res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache" });
      res.end(data);
    });
  });
});

// Bind IPv4 explicitly (0.0.0.0). WSL2's Windows relay (wslrelay.exe) mirrors
// listening sockets by address family: a default IPv6 (::) bind is exposed to
// Windows only on [::1], so the common http://127.0.0.1:<port>/ URL is refused.
// An IPv4 bind is mirrored to Windows 127.0.0.1 as well as localhost.
server.listen(port, "0.0.0.0", function () {
  console.log("Lastlight dev server: http://localhost:" + port + "/");
  console.log("Open http://127.0.0.1:" + port + "/ — live reload is on.");
});

startWatcher();
