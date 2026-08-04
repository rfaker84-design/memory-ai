const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const test = require('node:test');

test('024 keeps crisis contacts as mutual account consent, not raw contact data or automatic delivery', () => {
  const sql = readFileSync('database/migrations/024_emergency_contact_consent.sql', 'utf8');
  const postflight = readFileSync('database/verification/024-emergency-contact-consent-postflight.sql', 'utf8');
  assert.match(sql, /CANDIDATE ONLY/);
  assert.match(sql, /owner_user_id UUID NOT NULL REFERENCES public\.users/);
  assert.match(sql, /contact_user_id UUID NOT NULL REFERENCES public\.users/);
  assert.match(sql, /status IN \('pending', 'accepted', 'revoked'\)/);
  assert.match(sql, /owner_user_id <> contact_user_id/);
  const executableSql = sql.replace(/^--.*$/gm, '');
  assert.doesNotMatch(executableSql, /phone|message|sms|webhook/i);
  assert.match(postflight, /BEGIN TRANSACTION READ ONLY/);
  assert.match(postflight, /ck_crisis_contact_lifecycle/);
  assert.match(postflight, /ix_crisis_contact_consents_contact_pending/);
});
