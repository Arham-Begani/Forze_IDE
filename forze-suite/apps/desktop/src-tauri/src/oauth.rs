//! Loopback capture for Supabase Google OAuth (desktop PKCE).
//!
//! Mirrors the "Log in with LinkedIn" flow in `linkedin.rs`: bind a localhost
//! loopback, open the provider consent page in the system browser, capture the
//! redirect that Supabase sends back with the PKCE `?code=`, and hand the full
//! redirect URL to the webview so supabase-js can `exchangeCodeForSession(url)`.
//!
//! Reusing the loopback idiom (instead of a custom `forze://` scheme +
//! deep-link plugin) keeps the desktop OAuth round-trip on the same, already
//! shipping mechanism the LinkedIn publisher uses — no extra Tauri plugin.
//!
//! The fixed port means the redirect URL is stable; the user must register
//! `http://localhost:8912` as a Redirect URL in Supabase → Auth → URL
//! Configuration (and enable the Google provider).

use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::{Duration, Instant};
use tauri::{command, AppHandle};
use tauri_plugin_opener::OpenerExt;

/// Fixed loopback port for the OAuth redirect. Keep in sync with the
/// `redirectTo` the frontend passes to `signInWithOAuth` (see lib/supabase.ts).
pub const OAUTH_PORT: u16 = 8912;

/// Block on the loopback until Supabase redirects back, then return the full
/// redirect URL (including the `?code=…` query) for supabase-js to exchange.
fn capture_redirect(listener: TcpListener, timeout: Duration) -> Result<String, String> {
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
                // e.g. "GET /?code=...&state=... HTTP/1.1"
                let target = first_line.split_whitespace().nth(1).unwrap_or("");

                let html = "<!doctype html><html><body style=\"font-family:system-ui,sans-serif;background:#000;color:#f5f5f5;display:flex;align-items:center;justify-content:center;height:100vh;margin:0\"><div style=\"text-align:center\"><h2 style=\"font-weight:600\">Signed in to Forze \u{2713}</h2><p style=\"color:#8f9499\">You can close this tab and return to Forze IDE.</p></div></body></html>";
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    html.len(),
                    html
                );
                let _ = stream.write_all(response.as_bytes());
                let _ = stream.flush();

                // The browser may hit the loopback for `/favicon.ico` etc.; only
                // the redirect carries the code (or an OAuth error). Ignore the
                // rest and keep waiting until the deadline.
                if target.contains("code=") || target.contains("error=") {
                    return Ok(format!("http://localhost:{OAUTH_PORT}{target}"));
                }
                if Instant::now() > deadline {
                    return Err("Google sign-in timed out. Please try again.".to_string());
                }
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                if Instant::now() > deadline {
                    return Err("Google sign-in timed out. Please try again.".to_string());
                }
                std::thread::sleep(Duration::from_millis(120));
            }
            Err(e) => return Err(format!("login server error: {e}")),
        }
    }
}

/// Open `auth_url` (a Supabase `…/authorize?provider=google&redirect_to=…` URL
/// the frontend obtained from `signInWithOAuth`) in the system browser and
/// return the captured redirect URL once the user completes consent.
#[command]
pub async fn google_oauth_login(app: AppHandle, auth_url: String) -> Result<String, String> {
    // Bind the loopback *before* opening the browser so the redirect can never
    // arrive before we're listening.
    let listener = TcpListener::bind(("127.0.0.1", OAUTH_PORT)).map_err(|e| {
        format!(
            "Couldn't start the local sign-in server on port {OAUTH_PORT}: {e}. \
             Close any other sign-in in progress and retry."
        )
    })?;

    app.opener()
        .open_url(auth_url, None::<&str>)
        .map_err(|e| format!("Couldn't open the browser for Google sign-in: {e}"))?;

    tauri::async_runtime::spawn_blocking(move || {
        capture_redirect(listener, Duration::from_secs(300))
    })
    .await
    .map_err(|e| format!("sign-in task failed: {e}"))?
}
