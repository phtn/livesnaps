# Update Firebase custom claims

[`set-custom-claims.ts`](set-custom-claims.ts) updates the custom claims of an existing Firebase Authentication user, selected by UID or email. It writes directly to the Firebase project configured by the Admin credentials; there is no confirmation prompt or dry-run mode.

## Prerequisites

Run from the repository root after installing dependencies with `bun install`. Supply Firebase Admin service-account credentials for the intended project using either:

- `FIREBASE_SERVICE_ACCOUNT_KEY`: the service-account JSON contents, not a filename. Both snake_case and camelCase field names are supported.
- All three of `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY`.

The private key must contain the PEM key, including `BEGIN PRIVATE KEY`; escaped `\n` sequences are normalized to newlines. `FIREBASE_SERVICE_ACCOUNT_KEY` can alternatively contain the PEM key when the project ID and client email are supplied separately. Valid JSON credentials take precedence over the separate-variable configuration.

Keep credentials out of source control. The service account must be allowed to read users and update their custom claims.

## Usage

```sh
bun run firebase:claims --uid USER_UID --claims '{"admin":true}' --merge
```

The equivalent direct invocation is:

```sh
bun run scripts/firebase/set-custom-claims.ts --uid USER_UID --claims '{"admin":true}' --merge
```

Pass flags directly after the command, without an extra `--` separator: the script rejects a literal `--` argument.

| Argument | Meaning |
| --- | --- |
| `--uid <uid>` | Select an existing user by Firebase UID. Supply exactly one of `--uid` or `--email`. |
| `--email <email>` | Select an existing user by email. |
| `--claims '<json>'` | Required. A JSON object containing claims, or `null` to clear all claims. Quote JSON so the shell preserves it. |
| `--merge` | Shallow-merge the supplied object into existing claims. Matching top-level keys are overwritten; nested objects are replaced, not recursively merged. |
| `--help`, `-h` | Print help and exit without contacting Firebase. |

Without `--merge`, the supplied object replaces the entire custom claims object. `--claims null` cannot be combined with `--merge`. A null value inside an object is a claim value, not a request to remove that key.

## Examples

Add or update a role while retaining other claims:

```sh
bun run firebase:claims --email 'person@example.com' --claims '{"role":"staff"}' --merge
```

Replace all existing claims with a new object:

```sh
bun run firebase:claims --uid USER_UID --claims '{"role":"viewer"}'
```

Clear all custom claims:

```sh
bun run firebase:claims --uid USER_UID --claims null
```

Display help:

```sh
bun run firebase:claims --help
```

## Output and errors

Success prints JSON containing `uid`, `email` (or `null`), and the resulting `customClaims` object (or `null` when cleared). This command does not refresh client tokens or revoke sessions.

Failures print an error and exit with status 1. Common causes include missing credentials (`Firebase Admin credentials are not configured.`), an unknown user, malformed JSON, supplying both user selectors, or omitting `--claims`. The script checks the JSON value's shape; Firebase can still reject the submitted claims.
