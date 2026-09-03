import { App, normalizePath } from 'obsidian';

/**
 * Lightweight file logger for debugging. Writes newline-delimited entries to
 * `task-relay.log` inside the plugin folder and mirrors everything to the
 * developer console. Logging must never throw or interrupt a user action.
 */
class TaskRelayLogger {
	private app: App | null = null;
	private path = '';

	init(app: App, pluginDir: string): void {
		this.app = app;
		this.path = normalizePath(`${pluginDir}/task-relay.log`);
	}

	info(message: string, data?: unknown): void {
		void this.write('INFO', message, data);
	}

	error(message: string, data?: unknown): void {
		void this.write('ERROR', message, data);
	}

	private async write(
		level: string,
		message: string,
		data?: unknown,
	): Promise<void> {
		let line = `${new Date().toISOString()} [${level}] ${message}`;
		if (data !== undefined) {
			try {
				line += ` ${JSON.stringify(data)}`;
			} catch {
				line += ' [unserializable data]';
			}
		}

		if (!this.app || !this.path) return;
		try {
			await this.app.vault.adapter.append(this.path, `${line}\n`);
		} catch {
			// Never let logging break the plugin.
		}
	}
}

export const logger = new TaskRelayLogger();
