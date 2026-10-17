# Public judge demo

Entry: https://ahnaf-code55.github.io/oqvian-recall-remedy-review-release/

Live LinuxONE app: https://webmaster-correct-tin-dev.trycloudflare.com

The entry and labeled rules-only preview run on GitHub Pages. The live CPU app runs separately on LinuxONE through a Cloudflare Quick Tunnel. The static preview does not run the model or replace real server evidence.

The live app has an isolated encrypted demo vault behind a loopback session gateway. Visitors receive an unguessable Secure/HttpOnly/SameSite=Strict cookie; receipt reads/exports require the session that created the receipt. The gateway keeps backend Basic credentials server-side and enforces exact Host/Origin checks, body/rate/session limits and one inference at a time. Use fictional histories only. Operator access to the backend vault remains possible; session separation is not a tenant-security certification.

An actual public HTTPS constructed DR request returned HTTP 201 with CPU scoring and its export returned HTTP 200 with matching digest. Another independently created HTTP session was refused HTTP 404 and a cross-origin POST was refused HTTP 403. One warm request took 4.910 seconds including network; this is not a performance benchmark or accuracy measurement. Current screenshots also show an actual public Vitamix receipt and scored model output.

Sessions expire after two hours and a gateway restart loses their receipt maps. Encrypted files remain on the server until owner cleanup; expiry is not deletion. Earlier measurements from private staging retain their original scope. The small unblinded five-pair comparison did not establish an AI gain (lexical 4/5, NLI 3/5).

Quick Tunnels are temporary: no uptime guarantee, and restarting changes the hostname. A stable production hostname requires separately configured hosting/DNS. If the demo address changes, update the Pages entry link. Official limitations: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/ .

Gateway source/configuration: [application/public_gateway/README.md](application/public_gateway/README.md). It requires a separately provisioned loopback backend, credentials file, allowed public-host file and HTTPS proxy. Never expose the backend Basic endpoint directly or put credentials in frontend variables. The backend and model remain locally configured as described in the main README. No deployment secrets, model weights, server records or tunnel binary are shipped here.
