use std::path::PathBuf;

/// Build-time secrets that must live in the *binary* (not the webview bundle).
/// The LinkedIn publisher exchanges the auth code with the client secret in Rust
/// (see `src/linkedin.rs`), so the released app needs these baked in — the source
/// `.env` is gitignored and never shipped, and a packaged app's cwd doesn't point
/// at it. CI passes them as real env vars; local builds fall back to `../.env`
/// (the same file Vite reads). When absent, `option_env!` stays `None` and the
/// app simply reports LinkedIn as unconfigured.
const BAKED_KEYS: [&str; 2] = ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"];

fn main() {
    bake_build_time_secrets();
    tauri_build::build()
}

fn bake_build_time_secrets() {
    // `../.env` relative to this crate (apps/desktop/src-tauri) == apps/desktop/.env.
    let env_file = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.env");
    println!("cargo:rerun-if-changed={}", env_file.display());

    let dotenv = std::fs::read_to_string(&env_file).unwrap_or_default();

    for key in BAKED_KEYS {
        // A real env var (CI) wins; otherwise read it out of the local `.env`.
        println!("cargo:rerun-if-env-changed={key}");
        let value = std::env::var(key)
            .ok()
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
            .or_else(|| dotenv_value(&dotenv, key));

        if let Some(value) = value {
            // Baked so `option_env!(key)` in the crate resolves to this value.
            println!("cargo:rustc-env={key}={value}");
        }
    }
}

/// Pull `key`'s value out of a `.env`'s contents (mirrors the runtime parser in
/// `linkedin.rs::config_var`: skip blanks/comments, split on the first `=`).
fn dotenv_value(contents: &str, key: &str) -> Option<String> {
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
    None
}
