import { App, parsePropertyId, TFile } from 'obsidian';
import type { BasesEntry, BasesPropertyId, BasesViewConfig } from 'obsidian';

const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

function isDateLike(value: unknown): value is string {
	return typeof value === 'string' && DATE_RE.test(value);
}

/**
 * Look up Obsidian's declared type for a property (e.g. `checkbox`, `date`).
 * This lets us render an editable control even when a note does not yet have
 * the property in its frontmatter. The metadata type manager is not part of the
 * public typings, so we access it defensively and degrade gracefully.
 */
function getDeclaredType(app: App, name: string): string | undefined {
	const manager = (
		app as unknown as {
			metadataTypeManager?: {
				getPropertyInfo?: (key: string) => { type?: string } | undefined;
				properties?: Record<string, { type?: string } | undefined>;
			};
		}
	).metadataTypeManager;
	if (!manager) return undefined;
	const key = name.toLowerCase();
	const info = manager.getPropertyInfo?.(key) ?? manager.properties?.[key];
	return info?.type;
}

/**
 * Render the note's Base-visible properties into the section header. Checkbox
 * and date properties become inline editable controls — shown even when the
 * note does not yet have a value, so they can be set directly. Everything else
 * is a read-only chip. The set of properties comes entirely from the Base view
 * configuration, so the plugin has no opinion about property names.
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

		if (parsed.type === 'note') {
			const fmValue = frontmatter[parsed.name];
			const declared = getDeclaredType(app, parsed.name);

			if (declared === 'checkbox' || typeof fmValue === 'boolean') {
				renderBoolean(
					app,
					containerEl,
					file,
					parsed.name,
					label,
					fmValue === true,
				);
				continue;
			}
			if (
				declared === 'date' ||
				declared === 'datetime' ||
				isDateLike(fmValue)
			) {
				renderDate(
					app,
					containerEl,
					file,
					parsed.name,
					label,
					typeof fmValue === 'string' ? fmValue : '',
				);
				continue;
			}
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
