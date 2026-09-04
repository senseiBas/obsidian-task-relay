import { App, Notice, TFile } from 'obsidian';
import type { ParsedTask, ProvenanceOptions } from '../types';
import {
	buildMovedSourceLine,
	buildPulledLine,
	buildRawMovedLine,
	DEFAULT_PROVENANCE,
} from './provenance';
import {
	appendLine,
	buildContinueNoteTaskLine,
	buildOpenTaskLine,
	removeLine,
	replaceLine,
	setTaskStatus,
} from './document';

export class TaskMutationError extends Error {}

function requireFile(app: App, path: string): TFile {
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) {
		throw new TaskMutationError(`File not found: ${path}`);
	}
	if (file.extension !== 'md') {
		throw new TaskMutationError(`Not a Markdown note: ${path}`);
	}
	return file;
}

/** Toggle a task between open and completed, writing back to Markdown. */
export async function toggleTask(
	app: App,
	path: string,
	task: ParsedTask,
	completed: boolean,
): Promise<void> {
	const file = requireFile(app, path);
	let found = true;
	await app.vault.process(file, (data) => {
		const edit = setTaskStatus(data, task, completed ? 'x' : ' ');
		found = edit.ok;
		return edit.ok ? edit.content : data;
	});
	if (!found) {
		new Notice('Could not find the task to update.');
	}
}

/** Append a new open task to the end of a note. */
export async function addTask(
	app: App,
	path: string,
	text: string,
): Promise<void> {
	const file = requireFile(app, path);
	const value = text.trim();
	if (!value) {
		new Notice('Task cannot be empty.');
		return;
	}
	const newLine = buildOpenTaskLine(value);
	await app.vault.process(file, (data) => appendLine(data, newLine));
}

/** Append a follow-up task that links to another note. */
export async function addContinueNoteTask(
	app: App,
	path: string,
	noteName: string,
): Promise<void> {
	const file = requireFile(app, path);
	const value = noteName.trim();
	if (!value) {
		new Notice('Note name cannot be empty.');
		return;
	}
	const newLine = buildContinueNoteTaskLine(value);
	await app.vault.process(file, (data) => appendLine(data, newLine));
}

/**
 * Pull a task from one note into another, preserving provenance.
 *
 * The destination is written FIRST so that a failure can never make the task
 * vanish from both notes: the worst case is a harmless duplicate, never data
 * loss. Only after the destination is safely updated do we complete the source
 * task and annotate it with where it went.
 */
export async function pullTask(
	app: App,
	sourcePath: string,
	task: ParsedTask,
	destPath: string,
	options: ProvenanceOptions = DEFAULT_PROVENANCE,
): Promise<void> {
	if (sourcePath === destPath) return;
	const sourceFile = requireFile(app, sourcePath);
	const destFile = requireFile(app, destPath);

	// 1. Append the pulled task to the destination (never lose the task).
	const pulledLine = buildPulledLine(task, sourceFile.basename, options);
	await app.vault.process(destFile, (data) => appendLine(data, pulledLine));

	// 2. Complete + annotate the source task.
	const movedLine = buildMovedSourceLine(task, destFile.basename, options);
	let found = true;
	await app.vault.process(sourceFile, (data) => {
		const edit = replaceLine(data, task, movedLine);
		found = edit.ok;
		return edit.ok ? edit.content : data;
	});
	if (!found) {
		new Notice(
			'Task was added to the destination, but the original could not be updated (it may have changed).',
		);
	}
}

/**
 * Raw move: relocate a task verbatim with no provenance text. The destination
 * is written first for the same safety reason as {@link pullTask}.
 */
export async function rawMoveTask(
	app: App,
	sourcePath: string,
	task: ParsedTask,
	destPath: string,
): Promise<void> {
	if (sourcePath === destPath) return;
	const sourceFile = requireFile(app, sourcePath);
	const destFile = requireFile(app, destPath);

	const movedLine = buildRawMovedLine(task);
	await app.vault.process(destFile, (data) => appendLine(data, movedLine));

	let found = true;
	await app.vault.process(sourceFile, (data) => {
		const edit = removeLine(data, task);
		found = edit.ok;
		return edit.ok ? edit.content : data;
	});
	if (!found) {
		new Notice(
			'Task was added to the destination, but could not be removed from the source (it may have changed).',
		);
	}
}
