-- Existing accounts keep their data and cannot be claimed through public signup.
ALTER TABLE users ADD COLUMN password_hash text;
CREATE UNIQUE INDEX users_email_normalized ON users (lower(trim(email)));
-- Invalidate outstanding codes and sessions from the previous authentication flow.
DELETE FROM sessions;
DROP TABLE login_codes;
