import { describe, expect, it } from 'vitest';
import {
	isOpen,
	parseOpenTasks,
	parseTaskLine,
	parseTasks,
} from '../src/tasks/parser';

describe('parseTaskLine', () => {
	it('parses a simple open task', () => {
		const task = parseTaskLine('- [ ] Buy wood', 0);
		expect(task).not.toBeNull();
		expect(task?.status).toBe(' ');
		expect(task?.text).toBe('Buy wood');
		expect(task?.marker).toBe('-');
		expect(task?.indent).toBe('');
		expect(isOpen(task!)).toBe(true);
	});

	it('parses a completed task', () => {
		const task = parseTaskLine('- [x] Done', 3);
		expect(task?.status).toBe('x');
		expect(isOpen(task!)).toBe(false);
		expect(task?.line).toBe(3);
	});

	it('preserves indentation and marker on nested tasks', () => {
		const task = parseTaskLine('\t\t* [ ] Nested', 1);
		expect(task?.indent).toBe('\t\t');
		expect(task?.marker).toBe('*');
		expect(task?.text).toBe('Nested');
	});

	it('keeps wiki links in the task text', () => {
		const task = parseTaskLine('- [ ] Work on [[Project X]]', 0);
		expect(task?.text).toBe('Work on [[Project X]]');
	});

	it('recognizes custom status characters', () => {
		expect(parseTaskLine('- [/] In progress', 0)?.status).toBe('/');
		expect(parseTaskLine('- [-] Cancelled', 0)?.status).toBe('-');
	});

	it('handles an empty task', () => {
		const task = parseTaskLine('- [ ]', 0);
		expect(task?.text).toBe('');
	});

	it('returns null for non-task lines', () => {
		expect(parseTaskLine('# Heading', 0)).toBeNull();
		expect(parseTaskLine('- just a bullet', 0)).toBeNull();
		expect(parseTaskLine('plain text', 0)).toBeNull();
	});
});

describe('parseTasks / parseOpenTasks', () => {
	const doc = [
		'# Project X',
		'',
		'- [ ] Call supplier',
		'- [x] Already done',
		'    - [ ] Sub task',
		'not a task',
	].join('\n');

	it('finds every checkbox task with correct line numbers', () => {
		const tasks = parseTasks(doc);
		expect(tasks).toHaveLength(3);
		expect(tasks.map((t) => t.line)).toEqual([2, 3, 4]);
	});

	it('returns only open tasks for the workbench', () => {
		const open = parseOpenTasks(doc);
		expect(open.map((t) => t.text)).toEqual(['Call supplier', 'Sub task']);
	});

	it('tolerates CRLF line endings', () => {
		const crlf = '- [ ] One\r\n- [ ] Two';
		expect(parseOpenTasks(crlf)).toHaveLength(2);
	});
});
