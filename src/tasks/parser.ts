import type { ParsedTask } from '../types';

/**
 * Matches a Markdown checkbox list item:
 *   optional indent, a list marker (- * +), the checkbox, then the text.
 *
 * The checkbox may contain any single non-`]` character so custom statuses
 * (`- [/]`, `- [-]`, etc.) are recognized; only `' '` counts as "open".
 */
const TASK_RE = /^(\s*)([-*+])\s+\[([^\]])\](?:\s(.*)|\s*)$/;

/** Split content into lines, tolerant of both LF and CRLF. */
export function splitLines(content: string): string[] {
	return content.split(/\r?\n/);
}

/** Detect the dominant end-of-line sequence in a document. */
export function detectEol(content: string): string {
	return content.includes('\r\n') ? '\r\n' : '\n';
}

/** Parse a single line into a ParsedTask, or return null if it is not a task. */
export function parseTaskLine(line: string, index: number): ParsedTask | null {
	const match = TASK_RE.exec(line);
	if (!match) return null;
	const [, indent, marker, status, text] = match;
	return {
		line: index,
		indent: indent ?? '',
		marker: marker ?? '-',
		status: status ?? ' ',
		text: text ?? '',
		raw: line,
	};
}

/** Parse every checkbox task in a document. */
export function parseTasks(content: string): ParsedTask[] {
	const tasks: ParsedTask[] = [];
	const lines = splitLines(content);
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line === undefined) continue;
		const task = parseTaskLine(line, i);
		if (task) tasks.push(task);
	}
	return tasks;
}

/** True when a task is open (unchecked). */
export function isOpen(task: ParsedTask): boolean {
	return task.status === ' ';
}

/** Only the open tasks from a document. */
export function parseOpenTasks(content: string): ParsedTask[] {
	return parseTasks(content).filter(isOpen);
}
