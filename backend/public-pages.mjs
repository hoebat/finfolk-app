const account = 'https://finfolk.com.au/?view=account';
const contact = 'https://www.instagram.com/finfolk.com.au/';

const pages = {
  '/v1/integrations/tiktok/oauth/callback': {
    title: 'TikTok integration setup',
    status: 503,
    body: `<p>FinFolk's TikTok integration is being prepared for TikTok's developer and Business Messaging access reviews.</p>
      <p>Account authorization is not enabled yet. No TikTok authorization code has been accepted or exchanged.</p>
      <p>Once setup is approved and available, start authorization from your signed-in FinFolk settings. Do not send passwords, access tokens or authorization codes by message.</p>
      <p><a href="${account}&amp;tab=settings">Return to FinFolk settings</a> · <a href="https://www.tiktok.com/@finfolk.com.au">FinFolk on TikTok</a></p>`,
  },
  '/privacy': {
    title: 'Privacy policy',
    body: `
      <p>FinFolk is a coastal atlas and community logbook at <a href="https://finfolk.com.au/">finfolk.com.au</a>. This policy explains how information is handled when you browse, create an account, or interact with @finfolk.com.au on Instagram.</p>
      <h2>Information we use</h2>
      <ul>
        <li><strong>Account information:</strong> your account identifier, name, email address, verification status and sign-in information handled by our authentication provider, Neon Auth.</li>
        <li><strong>Information you choose to save:</strong> profile details, social profile links, beaches of interest, check-ins, dive sessions, trips, posts, sharing preferences, buddy connections and reports.</li>
        <li><strong>Instagram interactions:</strong> Instagram-scoped sender and message identifiers, timestamps, commands and command arguments sent to FinFolk, replies, and account-link verification information. When needed for an enabled command, Meta may provide your Instagram username and whether you follow @finfolk.com.au. Public Instagram content associated with a beach may also be reviewed for display.</li>
        <li><strong>Technical information:</strong> hosting and authentication services process network and security information needed to deliver and protect the service. Your browser stores sign-in state, preferences and saved offline map data.</li>
      </ul>
      <h2>How information is used</h2>
      <p>We use this information to operate accounts and logbooks, apply your sharing choices, verify linked Instagram accounts, respond to commands you send, support community features, moderate content, prevent abuse and diagnose service failures. FinFolk does not need your Instagram password; account authorization is handled by Meta.</p>
      <h2>Sharing and service providers</h2>
      <p>Information shown to other members depends on your profile, field-level sharing and buddy settings. Content you submit for public display may be visible publicly after publication. Instagram messages and activity remain subject to Meta's own privacy policy.</p>
      <p>FinFolk uses GitHub Pages for website hosting, Cloudflare for API and queue processing, Neon for authentication and database storage, and Meta for Instagram integration. Map, imagery and social-content providers receive requests when their services are used. These providers may process information outside Australia under their own service and privacy terms.</p>
      <h2>Storage and retention</h2>
      <p>Account and activity information is retained to provide the features you use until you remove it or request deletion. Instagram command-event and messaging audit records are scheduled for removal after 30 days. Operational records and provider backups may have separate retention periods. Removing data from FinFolk does not remove a message or post held by Instagram or another external service.</p>
      <h2>Your choices and deletion</h2>
      <p>Manage profile sharing and Instagram links in <a href="${account}">Your FinFolk</a>. You can remove the Instagram link, delete saved sessions, or use <strong>Profile &amp; buddies → Delete account → Delete my account and data</strong>. See the <a href="/data-deletion">data deletion instructions</a> for details and help with unlinked Instagram interactions.</p>
      <h2>Privacy questions</h2>
      <p>Contact <a href="${contact}">@finfolk.com.au on Instagram</a> by private message for access, correction, deletion or other privacy questions. If Instagram requires it, follow the account before messaging. Include “Privacy request” and enough information to identify the relevant FinFolk account or interaction. We may need to verify ownership before changing or disclosing account information. Do not send passwords or sign-in codes.</p>`,
  },
  '/data-deletion': {
    title: 'Data deletion instructions',
    body: `
      <h2>Delete a FinFolk account</h2>
      <ol>
        <li>Sign in at <a href="${account}">Your FinFolk</a>.</li>
        <li>Open <strong>Profile &amp; buddies</strong> and expand <strong>Delete account</strong>.</li>
        <li>Complete the requested sign-in confirmation, select <strong>Delete my account and data</strong>, and confirm the deletion.</li>
      </ol>
      <p>This removes your FinFolk profile information, check-ins, saved sessions, trips, posts, buddy connections and linked-account records. Associated Instagram command records are removed with the account. A minimal deleted-member marker may remain so a deleted account cannot continue to use the service. Authentication deletion is completed through Neon Auth; if that final step is interrupted, sign in again and follow the account-deletion prompt.</p>
      <h2>Remove an Instagram link</h2>
      <p>To stop using your Instagram account with FinFolk, open <strong>Your FinFolk → Instagram → Remove link</strong>. This removes the connection; it does not delete your FinFolk account or messages stored by Instagram. You can also review and revoke FinFolk's access using Meta's connected-app or business-integration settings.</p>
      <h2>Request help or delete unlinked Instagram interaction data</h2>
      <p>If you cannot access your account, or you messaged @finfolk.com.au without linking a FinFolk account, send <strong>“Privacy request: delete my FinFolk data”</strong> in a private message to <a href="${contact}">@finfolk.com.au</a>. Follow the account first if Instagram requires it. Identify the account or interaction to remove; we may need to verify ownership. Do not send passwords or sign-in codes.</p>
      <p>Deletion from FinFolk does not delete content held by Meta or other external providers. Their own deletion tools and retention rules apply to their copies. See our <a href="/privacy">privacy policy</a> for storage and retention information.</p>`,
  },
};

// Public publication requirements must remain available without sign-in or a database.
export function publicPage(pathname) {
  const page = pages[pathname];
  if (!page) return null;
  return new Response(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${page.title} · FinFolk</title>
<style>body{margin:0;background:#f4f8f8;color:#143942;font:17px/1.65 system-ui,sans-serif}main{max-width:760px;margin:auto;padding:40px 24px 64px}nav,footer{font-size:.9rem}a{color:#006c78;text-underline-offset:3px}h1{font-size:2.3rem;line-height:1.15;margin-bottom:12px}h2{font-size:1.3rem;line-height:1.3;margin-top:32px}li{margin:10px 0}.date{color:#52666b}footer{border-top:1px solid #cbdcdd;margin-top:40px;padding-top:20px}</style>
</head><body><main><nav><a href="https://finfolk.com.au/">FinFolk</a></nav>
<h1>${page.title}</h1><p class="date">Last updated 1 November 2026</p>${page.body}
<footer><a href="/privacy">Privacy policy</a> · <a href="/data-deletion">Data deletion</a> · <a href="${account}">Your FinFolk</a></footer>
</main></body></html>`, {
    status: page.status || 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': page.status ? 'private, no-store' : 'public, max-age=3600',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
