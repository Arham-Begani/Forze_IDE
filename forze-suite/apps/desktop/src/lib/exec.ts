/**
 * One-shot shell execution, the renderer side of the Rust `run_command`. Used
 * by the Agent Manager's `run_command` tool so worker agents can install deps,
 * run tests, and type-check the operator's real project — not just describe it.
 */
import { invokeCommand } from './tauri';

export interface CommandResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  timed_out: boolean;
}

/**
 * Run `command` through the platform shell in `cwd`, resolving with captured
 * output. Rejects only when the process could not be spawned at all; a non-zero
 * exit is reported via `exit_code`, not thrown, so callers can read stderr.
 */
export function runCommand(
  command: string,
  cwd?: string,
  timeoutMs?: number,
): Promise<CommandResult> {
  return invokeCommand<CommandResult>('run_command', { command, cwd, timeoutMs });
}
