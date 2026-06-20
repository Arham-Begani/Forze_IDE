//! "Log in with LinkedIn" OAuth 2.0 (Authorization Code) for the Ad Studio's
//! Build-in-Public publisher.
//!
//! The whole flow runs in Rust so the client *secret* never reaches the webview
//! bundle: we open the system browser to LinkedIn's consent page, capture the
//! redirect on a localhost loopback server, then exchange the code for an access
//! token with `reqwest`. Only the resulting access token is handed back to the
//! frontend (which uses it to post via the LinkedIn REST API).
//!
//! The fixed loopback port means the redirect URL is stable; the user must
//! register `http://localhost:8911/callback` as an authorized redirect URL in
//! their LinkedIn app.

use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::time::{Duration, Instant};
use tauri::{command, AppHandle};
use tauri_plugin_opener::OpenerExt;

/// Loopback redirect — must match the redirect URL registered in the LinkedIn app.
const REDIRECT_PORT: u16 = 8911;
/// openid+profile let us resolve the member URN; w_member_social authorizes posting.
const SCOPES: &str = "openid profile w_member_social";

#[derive(Serialize)]
pub struct LinkedinSession {
    pub access_token: String,
    /// Seconds until the access token expires.
    pub expires_in: u64,
    pub refresh_token: Option<String>,
    pub refresh_token_expires_in: Option<u64>,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: u64,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    refresh_token_expires_in: Option<u64>,
}

/// Credentials baked into the binary at compile time by `build.rs` (from CI env
/// or the local `.env`). This is the only source that survives in a packaged
/// build, where there is no process env and the gitignored `.env` isn't shipped.
fn baked_var(key: &str) -> Option<&'static str> {
    match key {
        "LINKEDIN_CLIENT_ID" => option_env!("LINKEDIN_CLIENT_ID"),
        "LINKEDIN_CLIENT_SECRET" => option_env!("LINKEDIN_CLIENT_SECRET"),
        _ => None,
    }
    .map(str::trim)
    .filter(|v| !v.is_empty())
}

/// Read a build-time config var. Order: the real process env, then the desktop
/// app's gitignored `.env` (the same file Vite reads; a few candidate paths
/// because the Tauri cwd differs between `tauri dev` and a packaged build), then
/// the value `build.rs` baked into the binary — the last is what makes a packaged
/// release work, since it carries no `.env` on disk.
fn config_var(key: &str) -> Option<String> {
    if let Ok(v) = std::env::var(key) {
        let v = v.trim().to_string();
        if !v.is_empty() {
            return Some(v);
        }
    }
    let candidates = [
        PathBuf::from(".env"),
        PathBuf::from("../.env"),
        PathBuf::from("../../.env"),
    ];
    for path in candidates {
        let Ok(contents) = std::fs::read_to_string(&path) else {
            continue;
        };
        for line in contents.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            let Some((k, v)) = line.split_once('=') else {
                continue;
            };
            if k.trim() == key {
                let val = v.trim().trim_matches('"').trim_matches('\'').trim();
                if !val.is_empty() {
                    return Some(val.to_string());
                }
            }
        }
    }
    baked_var(key).map(str::to_string)
}

/// True when the LinkedIn client id + secret are configured.
#[command]
pub fn linkedin_configured() -> bool {
    config_var("LINKEDIN_CLIENT_ID").is_some() && config_var("LINKEDIN_CLIENT_SECRET").is_some()
}

/// Percent-encode a value for use in a query string (RFC 3986 unreserved set).
fn url_encode(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for byte in input.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char);
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

/// Minimal percent-decode for the captured query values.
fn url_decode(input: &str) -> String {
    let bytes = input.replace('+', " ");
    let bytes = bytes.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(b) = u8::from_str_radix(&format!("{}{}", bytes[i + 1] as char, bytes[i + 2] as char), 16) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Block on the loopback server until LinkedIn redirects back with the code.
fn capture_code(listener: TcpListener, expected_state: &str, timeout: Duration) -> Result<String, String> {
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("login server error: {e}"))?;
    let deadline = Instant::now() + timeout;

    loop {
        match listener.accept() {
            Ok((mut stream, _)) => {
                let mut buf = [0u8; 8192];
                let n = stream.read(&mut buf).unwrap_or(0);
                let request = String::from_utf8_lossy(&buf[..n]);
                let first_line = request.lines().next().unwrap_or("");
                // e.g. "GET /callback?code=...&state=... HTTP/1.1"
                let target = first_line.split_whitespace().nth(1).unwrap_or("");
                let query = target.split_once('?').map(|(_, q)| q).unwrap_or("");

                let mut code: Option<String> = None;
                let mut state: Option<String> = None;
                let mut error: Option<String> = None;
                for pair in query.split('&') {
                    if let Some((k, v)) = pair.split_once('=') {
                        match k {
                            "code" => code = Some(url_decode(v)),
                            "state" => state = Some(url_decode(v)),
                            "error" => error = Some(url_decode(v)),
                            _ => {}
                        }
                    }
                }

                let html = "<!doctype html><html><body style=\"font-family:system-ui,sans-serif;background:#0b0b0d;color:#e7e7ea;display:flex;align-items:center;justify-content:center;height:100vh;margin:0\"><div style=\"text-align:center\"><h2 style=\"font-weight:600\">LinkedIn connected ✓</h2><p style=\"color:#9a9aa3\">You can close this tab and return to Forze.</p></div></body></html>";
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    html.len(),
                    html
                );
                let _ = stream.write_all(response.as_bytes());
                let _ = stream.flush();

                if let Some(err) = error {
                    return Err(format!("LinkedIn login was denied: {err}"));
                }
                if state.as_deref() != Some(expected_state) {
                    return Err("Login state mismatch — please try connecting again.".to_string());
                }
                return match code {
                    Some(c) if !c.is_empty() => Ok(c),
                    _ => Err("LinkedIn did not return an authorization code.".to_string()),
                };
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                if Instant::now() > deadline {
                    return Err("LinkedIn login timed out. Please try again.".to_string());
                }
                std::thread::sleep(Duration::from_millis(120));
            }
            Err(e) => return Err(format!("login server error: {e}")),
        }
    }
}

async fn exchange_token(form: &[(&str, &str)]) -> Result<LinkedinSession, String> {
    let client = reqwest::Client::new();
    let resp = client
        .post("https://www.linkedin.com/oauth/v2/accessToken")
        .form(form)
        .send()
        .await
        .map_err(|e| format!("Token request failed: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("LinkedIn token exchange failed ({status}): {body}"));
    }
    let token: TokenResponse = resp
        .json()
        .await
        .map_err(|e| format!("Unexpected token response: {e}"))?;
    Ok(LinkedinSession {
        access_token: token.access_token,
        expires_in: token.expires_in,
        refresh_token: token.refresh_token,
        refresh_token_expires_in: token.refresh_token_expires_in,
    })
}

/// Run the full "Log in with LinkedIn" flow and return the session tokens.
#[command]
pub async fn linkedin_login(app: AppHandle) -> Result<LinkedinSession, String> {
    let client_id = config_var("LINKEDIN_CLIENT_ID")
        .ok_or("LINKEDIN_CLIENT_ID is not set in .env")?;
    let client_secret = config_var("LINKEDIN_CLIENT_SECRET")
        .ok_or("LINKEDIN_CLIENT_SECRET is not set in .env")?;

    let redirect_uri = format!("http://localhost:{REDIRECT_PORT}/callback");
    let state = uuid::Uuid::new_v4().to_string();

    // Bind the loopback server *before* opening the browser so the redirect can
    // never arrive before we're listening.
    let listener = TcpListener::bind(("127.0.0.1", REDIRECT_PORT)).map_err(|e| {
        format!("Couldn't start the local login server on port {REDIRECT_PORT}: {e}. Close any other login in progress and retry.")
    })?;

    let auth_url = format!(
        "https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id={}&redirect_uri={}&state={}&scope={}",
        url_encode(&client_id),
        url_encode(&redirect_uri),
        url_encode(&state),
        url_encode(SCOPES),
    );

    app.opener()
        .open_url(auth_url, None::<&str>)
        .map_err(|e| format!("Couldn't open the browser for LinkedIn login: {e}"))?;

    let expected_state = state.clone();
    let code = tauri::async_runtime::spawn_blocking(move || {
        capture_code(listener, &expected_state, Duration::from_secs(300))
    })
    .await
    .map_err(|e| format!("login task failed: {e}"))??;

    exchange_token(&[
        ("grant_type", "authorization_code"),
        ("code", code.as_str()),
        ("redirect_uri", redirect_uri.as_str()),
        ("client_id", client_id.as_str()),
        ("client_secret", client_secret.as_str()),
    ])
    .await
}

/// Exchange a stored refresh token for a fresh access token (only works for
/// LinkedIn apps approved for refresh tokens; otherwise the caller re-logs in).
#[command]
pub async fn linkedin_refresh(token: String) -> Result<LinkedinSession, String> {
    let client_id = config_var("LINKEDIN_CLIENT_ID")
        .ok_or("LINKEDIN_CLIENT_ID is not set in .env")?;
    let client_secret = config_var("LINKEDIN_CLIENT_SECRET")
        .ok_or("LINKEDIN_CLIENT_SECRET is not set in .env")?;
    exchange_token(&[
        ("grant_type", "refresh_token"),
        ("refresh_token", token.as_str()),
        ("client_id", client_id.as_str()),
        ("client_secret", client_secret.as_str()),
    ])
    .await
}
