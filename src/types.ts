/**
 * A single Markdown checkbox task parsed from a note.
 *
 * All fields are plain data so tasks can be serialized through the drag-and-drop
 * `DataTransfer` and reasoned about in tests without any Obsidian dependency.
 */
export interface ParsedTask {
	/** Zero-based line index of the task within the note. */
	line: number;
	/** Leading whitespace before the list marker. */
	indent: string;
	/** The list marker character: `-`, `*` or `+`. */
	marker: string;
	/** The single character inside the checkbox brackets. `' '` means open. */
	status: string;
	/** The task text after the checkbox (may contain wiki links, provenance, etc.). */
	text: string;
	/** The exact original line, used to verify the task before mutation. */
	raw: string;
}

/**
 * A run of open tasks that share the same immediate Markdown heading, in
 * document order. Tasks that appear before any heading form a group with a
 * `null` heading. Only groups that actually contain open tasks are produced.
 */
export interface TaskGroup {
	/** The immediate heading text, or `null` when the tasks precede any heading. */
	heading: string | null;
	/** Heading level 1–6, or 0 when there is no heading. */
	level: number;
	/** Zero-based line index of the heading, or -1 when there is no heading. */
	headingLine: number;
	/** The open tasks under this heading, in document order. */
	tasks: ParsedTask[];
}

/** Options controlling how provenance text is rendered when moving tasks. */
export interface ProvenanceOptions {
	separator: string;
	movedWording: string;
	pulledWording: string;
}

/** Payload serialized into the drag DataTransfer when a task card is dragged. */
export interface TaskDragPayload {
	kind: 'task';
	dragId: string;
	sourcePath: string;
	task: ParsedTask;
}

/** Payload serialized when a whole note section is dragged. */
export interface NoteDragPayload {
	kind: 'note';
	dragId: string;
	sourcePath: string;
	noteName: string;
}

export type DragPayload = TaskDragPayload | NoteDragPayload;
