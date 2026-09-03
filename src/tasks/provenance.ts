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
	const text = task.text.trimEnd();
	const suffix = `${options.separator}${options.movedWording} ${wikiLink(destination)}`;
	return `${task.indent}${task.marker} [x] ${text}${suffix}`;
}

/**
 * The destination note's new line after a pull: a fresh open task carrying a
 * pointer back to its source. Prior provenance is stripped so the text stays
 * clean; the chain remains reconstructable by following the links.
 */
export function buildPulledLine(
	task: ParsedTask,
	source: string,
	options: ProvenanceOptions = DEFAULT_PROVENANCE,
): string {
	const core = stripProvenance(task.text);
	const suffix = `${options.separator}${options.pulledWording} ${wikiLink(source)}`;
	return `- [ ] ${core}${suffix}`;
}

/**
 * A raw move keeps the task verbatim (still open) with no provenance text,
 * normalized to a top-level list item at the destination.
 */
export function buildRawMovedLine(task: ParsedTask): string {
	return `- [ ] ${task.text.trimEnd()}`;
}
