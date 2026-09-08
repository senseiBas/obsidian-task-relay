import { describe, expect, it } from 'vitest';
import {
	buildMovedSourceLine,
	buildPulledLine,
	buildRawMovedLine,
	splitBlockId,
	stripProvenance,
} from '../src/tasks/provenance';
import { parseTaskLine } from '../src/tasks/parser';
import type { ParsedTask } from '../src/types';

function task(line: string): ParsedTask {
	const parsed = parseTaskLine(line, 0);
	if (!parsed) throw new Error(`not a task: ${line}`);
	return parsed;
}

describe('stripProvenance', () => {
	it('removes a trailing moved-to segment', () => {
		expect(stripProvenance('Call supplier — moved to [[Daily]]')).toBe(
			'Call supplier',
		);
	});

	it('removes a trailing pulled-from segment', () => {
		expect(stripProvenance('Call supplier — pulled from [[Project X]]')).toBe(
			'Call supplier',
		);
	});

	it('collapses a stacked chain', () => {
		const text = 'Call supplier — pulled from [[Project X]] — pulled from [[Weekly]]';
		expect(stripProvenance(text)).toBe('Call supplier');
	});

	it('tolerates ascii hyphen separators', () => {
		expect(stripProvenance('Task -- moved to [[Note]]')).toBe('Task');
	});

	it('leaves clean text untouched', () => {
		expect(stripProvenance('Just a task')).toBe('Just a task');
	});
});

describe('buildMovedSourceLine', () => {
	it('completes the source task and records the destination', () => {
		expect(buildMovedSourceLine(task('- [ ] Call supplier'), '2026-09-03')).toBe(
			'- [x] Call supplier — moved to [[2026-09-03]]',
		);
	});

	it('preserves indentation and marker', () => {
		expect(buildMovedSourceLine(task('\t* [ ] Nested'), 'Daily')).toBe(
			'\t* [x] Nested — moved to [[Daily]]',
		);
	});
});

describe('buildPulledLine', () => {
	it('creates an open task pointing back to the source', () => {
		expect(buildPulledLine(task('- [ ] Call supplier'), 'Project X')).toBe(
			'- [ ] Call supplier — pulled from [[Project X]]',
		);
	});

	it('strips prior provenance so it does not stack', () => {
		const carried = task('- [ ] Call supplier — pulled from [[Project X]]');
		expect(buildPulledLine(carried, 'Weekly')).toBe(
			'- [ ] Call supplier — pulled from [[Weekly]]',
		);
	});

	it('keeps wiki links that are part of the task itself', () => {
		expect(buildPulledLine(task('- [ ] Work on [[Project X]]'), 'Inbox')).toBe(
			'- [ ] Work on [[Project X]] — pulled from [[Inbox]]',
		);
	});

	it('honors custom wording and separator', () => {
		expect(
			buildPulledLine(task('- [ ] Do it'), 'Src', {
				separator: ' :: ',
				movedWording: 'sent to',
				pulledWording: 'from',
			}),
		).toBe('- [ ] Do it :: from [[Src]]');
	});
});

describe('buildRawMovedLine', () => {
	it('keeps the task verbatim with no provenance', () => {
		expect(buildRawMovedLine(task('- [ ] Call supplier'))).toBe(
			'- [ ] Call supplier',
		);
	});

	it('keeps a trailing block-id at the end of the line', () => {
		expect(buildRawMovedLine(task('- [ ] Call supplier ^6hRHcQXM3C2xfXfH'))).toBe(
			'- [ ] Call supplier ^6hRHcQXM3C2xfXfH',
		);
	});
});

describe('splitBlockId', () => {
	it('splits a trailing block-id off the text', () => {
		expect(splitBlockId('Call supplier ^6hRHcQXM3C2xfXfH')).toEqual({
			text: 'Call supplier',
			blockId: '^6hRHcQXM3C2xfXfH',
		});
	});

	it('returns null when there is no block-id', () => {
		expect(splitBlockId('Call supplier')).toEqual({
			text: 'Call supplier',
			blockId: null,
		});
	});

	it('does not treat a mid-text caret as a block-id', () => {
		expect(splitBlockId('a ^b c')).toEqual({ text: 'a ^b c', blockId: null });
	});
});

describe('block-id preservation across provenance', () => {
	it('keeps the block-id at the end of a moved source line', () => {
		expect(
			buildMovedSourceLine(task('- [ ] Call supplier ^6hRHcQXM3C2xfXfH'), 'Daily'),
		).toBe('- [x] Call supplier — moved to [[Daily]] ^6hRHcQXM3C2xfXfH');
	});

	it('keeps the block-id at the end of a pulled line', () => {
		expect(
			buildPulledLine(task('- [ ] Call supplier ^6hRHcQXM3C2xfXfH'), 'Project X'),
		).toBe('- [ ] Call supplier — pulled from [[Project X]] ^6hRHcQXM3C2xfXfH');
	});

	it('strips old provenance but keeps the block-id when re-pulled', () => {
		const carried = task(
			'- [ ] Call supplier — pulled from [[Project X]] ^6hRHcQXM3C2xfXfH',
		);
		expect(buildPulledLine(carried, 'Weekly')).toBe(
			'- [ ] Call supplier — pulled from [[Weekly]] ^6hRHcQXM3C2xfXfH',
		);
	});
});
