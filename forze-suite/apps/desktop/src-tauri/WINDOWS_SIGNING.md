# Windows code signing (Azure Trusted Signing)

This removes the **Microsoft Defender SmartScreen** "unrecognized app" warning on the
Forze IDE installer by Authenticode-signing every release build.

> **Note on the existing "signing" in CI.** `TAURI_SIGNING_PRIVATE_KEY` signs the
> *auto-updater manifest* (minisign). That is unrelated to SmartScreen. Authenticode
> signing — the thing SmartScreen checks — is what's set up here.

## How it's wired

- **`tauri.signing.conf.json`** (next to `tauri.conf.json`) — a partial config merged
  in only via `--config`. It sets `bundle.windows.signCommand` to call
  [`trusted-signing-cli`](https://crates.io/crates/trusted-signing-cli), which signs
  both the app `.exe` and the installer during bundling.
- **`.github/workflows/release.yml`** — signs **only** when the `AZURE_CLIENT_ID`
  secret exists. No secret → builds exactly as before (unsigned). Local `tauri build`
  is never affected because it doesn't pass `--config`.

## One-time setup (free-trial path)

> **Free-trial economics.** A new Azure account includes **$200 of credit for 30 days**.
> Trusted Signing Basic is ~$10/mo, so the credit covers signing comfortably during the
> trial. A card is required for verification but isn't charged unless you upgrade to
> pay-as-you-go. **Start with Step 1 immediately** — identity validation is a manual
> Microsoft review (often same-day for individuals, up to a few business days for orgs),
> and that clock eats into your 30 days.

### 1. Create the account and start identity validation (do this FIRST)

1. Sign up at <https://azure.microsoft.com/free> (claims the $200 / 30-day credit).
2. Register the provider (Portal: Subscription → Resource providers → register
   `Microsoft.CodeSigning`, or `az provider register --namespace Microsoft.CodeSigning`).
3. Create a **Trusted Signing Account** (Portal search: "Trusted Signing"), SKU **Basic**.
   Pick a region from the endpoint table below and note the **account name** + **region**.
4. Under the account, start an **Identity Validation**:
   - **Individual** — fastest for a solo founder; validates you via government ID. The
     signed publisher name will be your legal name.
   - **Organization** — needs a legally registered business (3+ yrs, or extra docs if
     younger). Publisher name = the org name.
5. Once validation is **Approved**, create a **Certificate Profile** of type
   **Public Trust**. Note the **profile name**.

### 2. Create a service principal for CI

After the cert profile exists, create a CI identity scoped to the signing account:

```bash
az ad sp create-for-rbac --name "forze-trusted-signing" \
  --role "Trusted Signing Certificate Profile Signer" \
  --scopes /subscriptions/<SUB_ID>/resourceGroups/<RG>/providers/Microsoft.CodeSigning/codeSigningAccounts/<ACCOUNT>
```

This prints `appId` (→ `AZURE_CLIENT_ID`), `password` (→ `AZURE_CLIENT_SECRET`),
`tenant` (→ `AZURE_TENANT_ID`). The role `Trusted Signing Certificate Profile Signer`
must be granted on the signing account (the scope above).

### 3. Fill in the non-secret values

Edit `tauri.signing.conf.json` and replace:

| Placeholder | Value |
| --- | --- |
| endpoint `-e` | Your account's regional endpoint (see table below — or copy the **Account URI** from the Portal overview) |
| `REPLACE_WITH_TRUSTED_SIGNING_ACCOUNT` | Trusted Signing account name |
| `REPLACE_WITH_CERTIFICATE_PROFILE` | Certificate profile name |

Endpoint by region (the Portal overview also shows the exact **Account URI**):

| Region | Endpoint |
| --- | --- |
| East US | `https://eus.codesigning.azure.net` |
| West US 3 | `https://wus3.codesigning.azure.net` |
| West Central US | `https://wcus.codesigning.azure.net` |
| North Europe | `https://neu.codesigning.azure.net` |
| West Europe | `https://weu.codesigning.azure.net` |

These aren't secrets, so committing them is fine.

### 4. Add the GitHub repo secrets

`Settings → Secrets and variables → Actions`:

- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`

### 5. Release

```bash
git tag v0.2.3 && git push origin v0.2.3
```

The Windows job now signs the installer. Verify on the artifact:
right-click → **Properties → Digital Signatures**, or `signtool verify /pa /v <file>`.

## After the 30-day trial

When the credit expires, upgrade the subscription to **pay-as-you-go** to keep the
signing account alive (~$10/mo). If you don't upgrade, the Trusted Signing resources are
deprovisioned and tagged Windows builds will start failing at the signing step — at which
point either upgrade, or remove the `AZURE_*` secrets to fall back to unsigned releases.

## Reputation ramp — expectations

Signing immediately replaces the red **"unknown publisher"** wording with your verified
name. SmartScreen *reputation* (full silent install) still accrues over the first wave
of downloads — typically clears within days. For day-one zero-warning you'd need an
**EV** certificate instead; Trusted Signing does not grant instant EV-level reputation.
