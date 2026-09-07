import type { ParsedTask, TaskGroup } from '../types';

/**
 * Matches a Markdown checkbox list item:
 *   optional indent, a list marker (- * +), the checkbox, then the text.
 *
 * The checkbox may contain any single non-`]` character so custom statuses
 * (`- [/]`, `- [-]`, etc.) are recognized; only `' '` counts as "open".
 */
const TASK_RE = /^(\s*)([-*+])\s+\[([^\]])\](?:\s(.*)|\s*)$/;

/** Matches an ATX Markdown heading: 1–6 `#` followed by the heading text. */
const HEADING_RE = /^(#{1,6})\s+(.*)$/;

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

/**
 * Group a document's open tasks by the immediate Markdown heading they sit
 * under, preserving document order. Each heading that has open tasks becomes one
 * group (headings without open tasks are skipped); tasks before the first
 * heading form a leading group with a `null` heading. Nesting is not flattened —
 * a task belongs to its nearest preceding heading regardless of that heading's
 * level, so `#`, `##`, `###` sections each appear as their own group in order.
 */
export function parseTaskGroups(content: string): TaskGroup[] {
	const lines = splitLines(content);
	const groups: TaskGroup[] = [];
	let current: TaskGroup | null = null;
	let heading: string | null = null;
	let level = 0;
	let headingLine = -1;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line === undefined) continue;

		const headingMatch = HEADING_RE.exec(line);
		if (headingMatch) {
			heading = (headingMatch[2] ?? '').trim();
			level = (headingMatch[1] ?? '').length;
			headingLine = i;
			// Start a fresh group lazily: it only materializes once a task
			// appears under this heading, so empty headings are never shown.
			current = null;
			continue;
		}

		const task = parseTaskLine(line, i);
		if (!task || !isOpen(task)) continue;
		if (!current) {
			current = { heading, level, headingLine, tasks: [] };
			groups.push(current);
		}
		current.tasks.push(task);
	}

	return groups;
}
