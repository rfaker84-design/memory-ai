const { access, cp, mkdir, readFile, rm, writeFile } = require("node:fs/promises");
const { join } = require("node:path");

const projectRoot = process.cwd();
const nextRoot = join(projectRoot, ".next");
const distRoot = join(projectRoot, "dist");
const clientRoot = join(distRoot, "client");
const serverRoot = join(distRoot, "server");
const routeHtml = join(nextRoot, "server", "app", "sprint21-core-experience.html");

const workerSource = `
const securityHeaders = {
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

function withHeaders(response) {
  const headers = new Headers(response.headers);
  Object.entries(securityHeaders).forEach(([name, value]) => headers.set(name, value));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/sprint21-core-experience" || url.pathname === "/sprint21-core-experience/") {
      const pageUrl = new URL("/index.html", request.url);
      return withHeaders(await env.ASSETS.fetch(new Request(pageUrl, request)));
    }

    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) return withHeaders(asset);

    return withHeaders(new Response("Not found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    }));
  },
};
`.trimStart();

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(routeHtml))) {
    throw new Error("Missing the prerendered acceptance route. Run `npm run build` before staging Sites.");
  }

  await rm(distRoot, { recursive: true, force: true });
  await mkdir(clientRoot, { recursive: true });
  await mkdir(serverRoot, { recursive: true });

  await cp(join(nextRoot, "static"), join(clientRoot, "_next", "static"), { recursive: true });
  if (await exists(join(projectRoot, "public"))) {
    await cp(join(projectRoot, "public"), clientRoot, { recursive: true });
  }

  const html = await readFile(routeHtml, "utf8");
  await writeFile(join(clientRoot, "index.html"), html);
  await mkdir(join(clientRoot, "sprint21-core-experience"), { recursive: true });
  await writeFile(join(clientRoot, "sprint21-core-experience", "index.html"), html);
  await writeFile(join(serverRoot, "index.js"), workerSource);
  await writeFile(join(serverRoot, "package.json"), JSON.stringify({ type: "module" }, null, 2));

  const worker = await import(`${new URL(`file:///${join(serverRoot, "index.js").replaceAll("\\", "/")}`).href}?build=${Date.now()}`);
  const response = await worker.default.fetch(
    new Request("https://acceptance.local/sprint21-core-experience"),
    {
      ASSETS: {
        async fetch(request) {
          const pathname = new URL(request.url).pathname;
          if (pathname !== "/index.html") return new Response("Not found", { status: 404 });
          return new Response(await readFile(join(clientRoot, "index.html")), {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        },
      },
    },
  );

  if (!response.ok || !(await response.text()).includes("从一张你最熟悉的照片开始")) {
    throw new Error("The staged acceptance route did not render the expected experience.");
  }

  process.stdout.write("Core experience Sites package staged in dist.\\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
