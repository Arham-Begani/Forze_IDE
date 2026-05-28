// Prevents an additional console window from spawning on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    forze_ide_lib::run();
}
