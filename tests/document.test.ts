import { describe, expect, it } from 'vitest';
import {
	appendLine,
	findTaskLineIndex,
	removeLine,
	replaceLine,
	setTaskStatus,
} from '../src/tasks/document';
import { parseTaskLine } from '../src/tasks/parser';
import {
	buildMovedSourceLine,
	buildPulledLine,
} from '../src/tasks/provenance';
import type { ParsedTask } from '../src/types';

function task(line: string, index = 0): ParsedTask {
	const parsed = parseTaskLine(line, index);
	if (!parsed) throw new Error(`not a task: ${line}`);
	return parsed;
}

describe('findTaskLineIndex', () => {
	it('uses the remembered index when it still matches', () => {
		const lines = ['# Title', '- [ ] A', '- [ ] B'];
		expect(findTaskLineIndex(lines, task('- [ ] B', 2))).toBe(2);
	});

	it('falls back to searching when the note shifted before the drop', () => {
		// The note gained a line at the top after the task was rendered.
		const lines = ['new intro', '# Title', '- [ ] A', '- [ ] B'];
		expect(findTaskLineIndex(lines, task('- [ ] B', 2))).toBe(3);
	});

	it('returns -1 when the task no longer exists', () => {
		const lines = ['# Title', '- [x] A already done'];
		expect(findTaskLineIndex(lines, task('- [ ] B', 2))).toBe(-1);
	});
});

describe('setTaskStatus', () => {
	it('completes a task', () => {
		const doc = '- [ ] Call supplier';
		const edit = setTaskStatus(doc, task(doc), 'x');
		expect(edit.ok).toBe(true);
		expect(edit.content).toBe('- [x] Call supplier');
	});

	it('reopens a task without touching the text', () => {
		const doc = '- [x] Call supplier — pulled from [[X]]';
		const edit = setTaskStatus(doc, task('- [x] Call supplier — pulled from [[X]]'), ' ');
		expect(edit.content).toBe('- [ ] Call supplier — pulled from [[X]]');
	});

	it('reports failure when the task is gone', () => {
		const edit = setTaskStatus('nothing here', task('- [ ] Missing', 5), 'x');
		expect(edit.ok).toBe(false);
		expect(edit.content).toBe('nothing here');
	});
});

describe('appendLine', () => {
	it('appends to a note that has no tasks yet', () => {
		const doc = '---\ntype: daily\n---\n\n# Monday\n';
		const result = appendLine(doc, '- [ ] Buy wood — pulled from [[X]]');
		expect(result).toBe(
			'---\ntype: daily\n---\n\n# Monday\n- [ ] Buy wood — pulled from [[X]]\n',
		);
	});

	it('appends when there is no trailing newline', () => {
		expect(appendLine('# Title', '- [ ] New')).toBe('# Title\n- [ ] New');
	});

	it('writes into an empty note', () => {
		expect(appendLine('', '- [ ] First')).toBe('- [ ] First');
	});

	it('preserves CRLF endings', () => {
		expect(appendLine('# Title\r\n', '- [ ] New')).toBe(
			'# Title\r\n- [ ] New\r\n',
		);
	});
});

describe('replaceLine / removeLine', () => {
	it('replaces the exact task line, leaving frontmatter intact', () => {
		const doc = ['---', 'status: active', '---', '', '# Project X', '- [ ] Call supplier'].join('\n');
		const edit = replaceLine(
			doc,
			task('- [ ] Call supplier', 5),
			buildMovedSourceLine(task('- [ ] Call supplier', 5), 'Daily'),
		);
		expect(edit.ok).toBe(true);
		expect(edit.content).toContain('- [x] Call supplier — moved to [[Daily]]');
		expect(edit.content).toContain('status: active');
	});

	it('removes a task line for a raw move', () => {
		const doc = '- [ ] A\n- [ ] B\n- [ ] C';
		const edit = removeLine(doc, task('- [ ] B', 1));
		expect(edit.content).toBe('- [ ] A\n- [ ] C');
	});
});

describe('end-to-end pull transformation (pure)', () => {
	it('produces the documented source and destination lines', () => {
		const sourceDoc = '# Project X\n\n- [ ] Call supplier\n';
		const destDoc = '---\ntype: daily\n---\n\n# 2026-09-03\n';
		const t = task('- [ ] Call supplier', 2);

		// destination first (safety: task can never be lost)
		const newDest = appendLine(destDoc, buildPulledLine(t, 'Project X'));
		// then complete the source
		const newSource = replaceLine(
			sourceDoc,
			t,
			buildMovedSourceLine(t, '2026-09-03'),
		);

		expect(newSource.content).toBe(
			'# Project X\n\n- [x] Call supplier — moved to [[2026-09-03]]\n',
		);
		expect(newDest).toBe(
			'---\ntype: daily\n---\n\n# 2026-09-03\n- [ ] Call supplier — pulled from [[Project X]]\n',
		);
	});
});
