// Isolated-database fixture only. Provider calls remain mocked; no production tokens.
import { randomBytes } from "node:crypto";
import { seal } from "../backend/messaging-config.mjs";
export async function messagingFixture(db, env, { senderId, handle }) {
  if (process.env.NEON_BRANCH !== "finfolk-regulars-dev")
    throw Error("Isolated test branch required.");
  const original = (
    await db.query(
      "SELECT * FROM finfolk.messaging_accounts WHERE id='instagram'",
    )
  )[0];
  env.MESSAGING_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  env.INSTAGRAM_MESSAGING_APP_ID = "797979";
  env.INSTAGRAM_MESSAGING_ACCOUNT_ID = "898989";
  const scope = "instagram-login:797979:898989";
  await db.query(
    `UPDATE finfolk.messaging_accounts SET account_id=$1,provider_scope=$2,credential_ciphertext=$3,mode='pilot',pilot_sender_ids=$4::jsonb,checks=$5::jsonb,token_expires_at=now()+interval '1 day' WHERE id='instagram'`,
    [
      env.INSTAGRAM_MESSAGING_ACCOUNT_ID,
      scope,
      seal({ accessToken: "mocked-instagram-login-token" }, env, scope),
      JSON.stringify([senderId]),
      JSON.stringify({
        authorization: true,
        subscription: true,
        followLookup: true,
        liveDelivery: true,
      }),
    ],
  );
  const fixture = {
    scope,
    follows: true,
    profileResponse(url) {
      return Response.json({
        id: new URL(url).pathname.split("/").pop(),
        username: handle,
        is_user_follow_business: fixture.follows,
      });
    },
    async restore() {
      await db.query(
        `UPDATE finfolk.messaging_accounts SET account_id=$1,provider_scope=$2,credential_ciphertext=$3,mode=$4,pilot_sender_ids=$5::jsonb,checks=$6::jsonb,token_expires_at=$7 WHERE id='instagram'`,
        [
          original.account_id,
          original.provider_scope,
          original.credential_ciphertext,
          original.mode,
          JSON.stringify(original.pilot_sender_ids),
          JSON.stringify(original.checks),
          original.token_expires_at,
        ],
      );
    },
  };
  return fixture;
}
