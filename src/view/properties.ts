import { App, parsePropertyId, TFile } from 'obsidian';
import type { BasesEntry, BasesPropertyId, BasesViewConfig } from 'obsidian';

const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

function isDateLike(value: unknown): value is string {
	return typeof value === 'string' && DATE_RE.test(value);
}

/**
 * Render the note's Base-visible properties into the section header. Boolean and
 * date properties sourced from note frontmatter become inline editable controls;
 * everything else is shown as a read-only chip. The set of properties comes
 * entirely from the Base view configuration, so the plugin has no opinion about
 * property names or methodology.
 */
export function renderProperties(
	app: App,
	containerEl: HTMLElement,
	entry: BasesEntry,
	config: BasesViewConfig,
	order: BasesPropertyId[],
): void {
	const file = entry.file;
	const frontmatter = (app.metadataCache.getFileCache(file)?.frontmatter ??
		{}) as Record<string, unknown>;

	for (const propId of order) {
		const parsed = parsePropertyId(propId);
		// The file name is already shown as the section title.
		if (parsed.type === 'file' && parsed.name === 'name') continue;

		const label = config.getDisplayName(propId);
		const fmValue = frontmatter[parsed.name];
		const editable = parsed.type === 'note';

		if (editable && typeof fmValue === 'boolean') {
			renderBoolean(app, containerEl, file, parsed.name, label, fmValue);
			continue;
		}
		if (editable && isDateLike(fmValue)) {
			renderDate(app, containerEl, file, parsed.name, label, fmValue);
			continue;
		}

		const value = entry.getValue(propId);
		if (!value || !value.isTruthy()) continue;
		const chip = containerEl.createDiv('task-relay-prop');
		chip.createSpan({ cls: 'task-relay-prop-label', text: `${label}:` });
		chip.createSpan({ cls: 'task-relay-prop-value', text: value.toString() });
	}
}

function renderBoolean(
	app: App,
	containerEl: HTMLElement,
	file: TFile,
	name: string,
	label: string,
	value: boolean,
): void {
	const chip = containerEl.createDiv('task-relay-prop task-relay-prop-bool');
	const input = chip.createEl('input', { type: 'checkbox' });
	input.checked = value;
	chip.createSpan({ cls: 'task-relay-prop-label', text: label });
	input.addEventListener('change', () => {
		void app.fileManager.processFrontMatter(
			file,
			(fm: Record<string, unknown>) => {
				fm[name] = input.checked;
			},
		);
	});
}

function renderDate(
	app: App,
	containerEl: HTMLElement,
	file: TFile,
	name: string,
	label: string,
	value: string,
): void {
	const chip = containerEl.createDiv('task-relay-prop task-relay-prop-date');
	chip.createSpan({ cls: 'task-relay-prop-label', text: `${label}:` });
	const input = chip.createEl('input', { type: 'date' });
	input.value = value.slice(0, 10);
	input.addEventListener('change', () => {
		void app.fileManager.processFrontMatter(
			file,
			(fm: Record<string, unknown>) => {
				if (input.value) {
					fm[name] = input.value;
				} else {
					delete fm[name];
				}
			},
		);
	});
}
