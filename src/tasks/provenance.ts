import type { ParsedTask, ProvenanceOptions } from '../types';
import {
	DEFAULT_MOVED_WORDING,
	DEFAULT_PULLED_WORDING,
	DEFAULT_SEPARATOR,
} from '../constants';

export const DEFAULT_PROVENANCE: ProvenanceOptions = {
	separator: DEFAULT_SEPARATOR,
	movedWording: DEFAULT_MOVED_WORDING,
	pulledWording: DEFAULT_PULLED_WORDING,
};

/**
 * Matches a trailing provenance segment such as ` — moved to [[Note]]` or
 * ` -- pulled from [[Note]]`, tolerating an em dash or one/two hyphens and any
 * "moved to" / "pulled from" wording. Used to strip prior provenance so it does
 * not stack up when a task is pulled through several notes.
 */
const PROVENANCE_SEGMENT =
	/\s+(?:—|--?)\s+(?:moved to|pulled from)\s+\[\[[^\]]+\]\]\s*$/i;

/** Remove any trailing provenance segments from task text. */
export function stripProvenance(text: string): string {
	let result = text;
	let previous: string;
	do {
		previous = result;
		result = result.replace(PROVENANCE_SEGMENT, '');
	} while (result !== previous);
	return result.trimEnd();
}

/**
 * Matches a trailing Obsidian block-id (`^abc-123`) at the end of task text,
 * whether it sits at the very start or after a space. Block-ids may contain
 * letters, digits and hyphens.
 */
const BLOCK_ID_SEGMENT = /(?:^|\s)(\^[A-Za-z0-9-]+)\s*$/;

/**
 * Split a trailing block-id off task text. A block-id must be the last token on
 * a line to stay valid, so provenance builders extract it first and re-append it
 * at the very end — otherwise appending "— moved to [[…]]" would push the id
 * into the middle of the line and silently break the reference (e.g. a Todoist
 * link). Returns the id including its caret, or null when there is none.
 */
export function splitBlockId(text: string): { text: string; blockId: string | null } {
	const match = BLOCK_ID_SEGMENT.exec(text);
	if (!match) return { text: text.trimEnd(), blockId: null };
	return { text: text.slice(0, match.index).trimEnd(), blockId: match[1] ?? null };
}

/** Append a block-id (with a leading space) when present, else nothing. */
function blockIdSuffix(blockId: string | null): string {
	return blockId ? ` ${blockId}` : '';
}

function wikiLink(target: string): string {
	return `[[${target}]]`;
}

/**
 * The source note's line after a pull: the original task is completed and
 * annotated with where it went. Indentation and marker are preserved so the
 * task stays in place within its original list.
 */
export function buildMovedSourceLine(
	task: ParsedTask,
	destination: string,
	options: ProvenanceOptions = DEFAULT_PROVENANCE,
): string {
	const { text, blockId } = splitBlockId(task.text);
	const suffix = `${options.separator}${options.movedWording} ${wikiLink(destination)}`;
	return `${task.indent}${task.marker} [x] ${text}${suffix}${blockIdSuffix(blockId)}`;
}

/**
 * The destination note's new line after a pull: a fresh open task carrying a
 * pointer back to its source. Prior provenance is stripped so the text stays
 * clean; the chain remains reconstructable by following the links. A trailing
 * block-id is preserved at the end of the line so references survive the move.
 */
export function buildPulledLine(
	task: ParsedTask,
	source: string,
	options: ProvenanceOptions = DEFAULT_PROVENANCE,
): string {
	const { text, blockId } = splitBlockId(task.text);
	const core = stripProvenance(text);
	const suffix = `${options.separator}${options.pulledWording} ${wikiLink(source)}`;
	return `- [ ] ${core}${suffix}${blockIdSuffix(blockId)}`;
}

/**
 * A raw move keeps the task verbatim (still open) with no provenance text,
 * normalized to a top-level list item at the destination. Any trailing block-id
 * is kept at the end of the line.
 */
export function buildRawMovedLine(task: ParsedTask): string {
	const { text, blockId } = splitBlockId(task.text);
	return `- [ ] ${text}${blockIdSuffix(blockId)}`;
}
