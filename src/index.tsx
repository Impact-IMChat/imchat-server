import { html, Html } from "@elysiajs/html";
import { Elysia } from "elysia";
import cors from "@elysiajs/cors";
import bearer from "@elysiajs/bearer";
import z from "zod";

const clients = new Set<ReadableStreamDefaultController<string>>();
const DEFAULT_PLATFORM_ID = "imchat:default" as const satisfies PlatformID;
const platformIDLiteral = z.templateLiteral([z.string(), ":", z.string()]).default(DEFAULT_PLATFORM_ID);
// (sorry, MCP is garbage. use a mod loader instead)
/** Think of a `PlatformID` as an `Identifier` (yarn) or `ResourceLocation` (Minecraft C\*\*\*r Pack and M\*jmap). It's just 2 strings separated by a `:`. */
type PlatformID = `${string}:${string}`;

async function fetchAPIKeysFromFile(): Promise<Record<PlatformID, string> | undefined> {
  try {
    await Bun.file(new URL(import.meta.resolve("../protectedPlatformAPIKeys.json"))).json() as Record<PlatformID, string>
  } catch (e) {
    return undefined;
  }
}

async function fetchAPIKeys(): Promise<Record<PlatformID, string>> {
  try {
    const file = await fetchAPIKeysFromFile();
    if (file !== undefined) return file;
    const env = Bun.env.PROTECTED_PLATFORM_API_KEYS_JSON;
    if (env !== undefined) return JSON.parse(env);
    else return {};
  } catch (e) {
    return {};
  }
}

const apiKeys = await fetchAPIKeys();
const protectedPlatformIDs = Object.keys(apiKeys) as PlatformID[];

function broadcast(author: string, message: string, platformID: PlatformID = DEFAULT_PLATFORM_ID) {
  // if (DISCORD_WEBHOOK_URL !== undefined)
  //   sendToDiscord(author, message);
  const payload = JSON.stringify({ author, message, platformID });
  for (const c of Array.from(clients)) {
    try {
      c.enqueue(`data: ${payload}\n\n`);
    } catch (err) {
      clients.delete(c);
    }
  }
}

// Cloudflare Workers / Vercel Edge have limits of ≈30 s
// our keep alive message: `:\n\n`
// UTF-8 takes 2 bytes, so multiply that by 2.
// so we send 3 characters, multiplied by 2, so then it's 6 bytes per message.
// and we do this every 25 seconds (60 (seconds in a minute) / 25 (our interval) = 2.4), so 2.4 * 6 = 2.4, so 14.4 bytes/minute.
// of course, round it down to 14 or up to 15.
// so HOPEFULLY there should be little to no "I'm on mobile data why are you eating up all my left up data!!" complaints.
const HEARTBEAT_INTERVAL_MS = 25e3;

// TODO: remove /test when I'm done testing (never)

const app = new Elysia()
  .use(html())
  .use(cors())
  .use(bearer())
  .get("/test", () => {
    return <html>
      <head>
        <title>Test Page</title>
      </head>
      <body>
        <h1>Testing 123</h1>
        <input type="text" placeholder="Author name" required></input>
        <textarea id="message" placeholder="Enter your message"></textarea>
        <button id="submit">Submit</button>
        <script async defer>
          {/* TODO: it's probably better to just have this as a static file */}
          {/* JSX moment, I have to add a bunch of {'(character)'}s because they're special characters in JSX */}
          const evtSource = new EventSource("/listen");
          document.getElementById("submit").onclick = () ={'>'} {'{'}
          const author = document.querySelector("input").value;
          const message = document.getElementById("message").value;

          fetch(`/send?author=${'{'}encodeURIComponent(author){'}'}`, {'{'}
          method: "POST",
          headers: {'{'}
          "Content-Type": "text/plain"
          {'}'},
          body: message
          {'}'});
          {'}'};
        </script>
      </body>
    </html>;
  })
  .get("/listen", () => {
    let controllerRef: ReadableStreamDefaultController<string> | null = null;
    let heartbeatInterval: NodeJS.Timeout | undefined = undefined;
    const stream = new ReadableStream<string>({
      start(controller) {
        controllerRef = controller;
        clients.add(controller);
        controller.enqueue(`data: ${JSON.stringify({ author: null, message: "Connected" })}\n\n`);
        heartbeatInterval = setInterval(() => {
          try {
            controller.enqueue(":\n\n");
          } catch (e) {
            console.error(`Error sending keepalive to a controller: ${e}`)
          }
        }, HEARTBEAT_INTERVAL_MS);
      },
      cancel() {
        if (controllerRef) {
          clients.delete(controllerRef);
          controllerRef = null;
        }
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
        }
      }
    });

    return new Response(stream as unknown as ReadableStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
      }
    });
  }, {
    response: z.object({
      author: z.nullable(z.string()),
      message: z.string(),
      platformID: platformIDLiteral.optional()
    })
  })
  .post("/send-protected", a => {
    const message = a.body;
    const { author, platformID } = a.query;

    console.log(`[IRC] (AUTHORIZED via ${platformID}) <${author}> ${message}`);

    broadcast(author, message, platformID);
  }, {
    beforeHandle({ bearer, set, status, query }) {
      if (!bearer || bearer !== apiKeys[query.platformID]) {
        set.headers[
          "WWW-Authenticate"
        ] = `Bearer realm='/send-protected', error="invalid_request"`

        return status(400, "Unauthorized")
      }
      console.info("passed auth");
    },
    body: z.string(),
    query: z.object({
      author: z.string(),
      platformID: platformIDLiteral
    }),
  })
  .post("/send", r => {
    const message = r.body;
    const { author, platformID = DEFAULT_PLATFORM_ID } = r.query;

    if (protectedPlatformIDs.includes(platformID)) {
      return r.status("Unauthorized", `${platformID} is a protected platform ID, please authenticate in order to use it.`);
    }

    console.log(`[IRC] (NORMAL via ${platformID}) <${author}> ${message}`);

    broadcast(author, message, platformID);
  }, {
    body: z.string(),
    query: z.object({
      author: z.string(),
      platformID: platformIDLiteral
    }),
  })
  .listen(3000);

export default app;

console.log(
  `Running on ${app.server?.hostname}:${app.server?.port}`
);
