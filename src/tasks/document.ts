import type { ParsedTask } from '../types';
import { detectEol, splitLines } from './parser';

export interface DocEdit {
	/** The new document content. */
	content: string;
	/** Whether the targeted task line was found and edited. */
	ok: boolean;
}

/**
 * Locate a task within the current document lines.
 *
 * Prefers the remembered line index when its content still matches exactly
 * (fast path). Otherwise falls back to searching for the exact raw line, which
 * keeps edits correct even when the note shifted between render and mutation.
 * Returns -1 when the task can no longer be found.
 */
export function findTaskLineIndex(lines: string[], task: ParsedTask): number {
	if (lines[task.line] === task.raw) return task.line;
	const found = lines.indexOf(task.raw);
	return found;
}

/** Replace the task's line with `newLine`. */
export function replaceLine(
	content: string,
	task: ParsedTask,
	newLine: string,
): DocEdit {
	const eol = detectEol(content);
	const lines = splitLines(content);
	const index = findTaskLineIndex(lines, task);
	if (index < 0) return { content, ok: false };
	lines[index] = newLine;
	return { content: lines.join(eol), ok: true };
}

/** Remove the task's line entirely. */
export function removeLine(content: string, task: ParsedTask): DocEdit {
	const eol = detectEol(content);
	const lines = splitLines(content);
	const index = findTaskLineIndex(lines, task);
	if (index < 0) return { content, ok: false };
	lines.splice(index, 1);
	return { content: lines.join(eol), ok: true };
}

/**
 * Move a task's line to just before or after a target task's line, within the
 * same document. Used for drag-reordering: the new order is simply the new line
 * order, so nothing needs to be persisted anywhere else. Dropping onto a task
 * that lives under a different heading naturally re-homes the line into that
 * heading's block, since the line is inserted relative to the target.
 */
export function moveTaskLine(
	content: string,
	task: ParsedTask,
	target: ParsedTask,
	before: boolean,
): DocEdit {
	const eol = detectEol(content);
	const lines = splitLines(content);
	const from = findTaskLineIndex(lines, task);
	if (from < 0) return { content, ok: false };
	const targetIndex = findTaskLineIndex(lines, target);
	if (targetIndex < 0) return { content, ok: false };
	if (from === targetIndex) return { content, ok: true };

	const [moved] = lines.splice(from, 1);
	if (moved === undefined) return { content, ok: false };
	// Removing `from` shifts every later index down by one.
	const anchor = targetIndex > from ? targetIndex - 1 : targetIndex;
	const insertAt = before ? anchor : anchor + 1;
	lines.splice(insertAt, 0, moved);
	return { content: lines.join(eol), ok: true };
}

/**
 * Append a line as the last content line, preserving a single trailing newline
 * if the document already had one.
 */
export function appendLine(content: string, newLine: string): string {
	if (content === '') return newLine;
	const eol = detectEol(content);
	const lines = splitLines(content);
	if (lines.length > 0 && lines[lines.length - 1] === '') {
		lines.splice(lines.length - 1, 0, newLine);
	} else {
		lines.push(newLine);
	}
	return lines.join(eol);
}

/** Build a normalized open task line from free-form user input. */
export function buildOpenTaskLine(text: string): string {
	const trimmed = text.trim();
	const checkboxMatch = /^[-*+]\s+\[[^\]]\]\s*(.*)$/.exec(trimmed);
	if (checkboxMatch) return `- [ ] ${checkboxMatch[1] ?? ''}`.trimEnd();
	const bulletMatch = /^[-*+]\s+(.*)$/.exec(trimmed);
	if (bulletMatch) return `- [ ] ${bulletMatch[1] ?? ''}`.trimEnd();
	return `- [ ] ${trimmed}`;
}

/** Build a follow-up task that links to another note. */
export function buildContinueNoteTaskLine(noteName: string): string {
	return buildOpenTaskLine(`werk verder aan [[${noteName.trim()}]]`);
}

/** Set the checkbox status character (e.g. `' '` or `'x'`) of a task. */
export function setTaskStatus(
	content: string,
	task: ParsedTask,
	status: string,
): DocEdit {
	const eol = detectEol(content);
	const lines = splitLines(content);
	const index = findTaskLineIndex(lines, task);
	if (index < 0) return { content, ok: false };
	const current = lines[index];
	if (current === undefined) return { content, ok: false };
	lines[index] = current.replace(/\[[^\]]\]/, `[${status}]`);
	return { content: lines.join(eol), ok: true };
}
