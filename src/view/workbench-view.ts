import {
	BasesView,
	debounce,
	Notice,
	setIcon,
	TAbstractFile,
	TFile,
} from 'obsidian';
import type {
	BasesEntry,
	BasesPropertyId,
	Debouncer,
	QueryController,
} from 'obsidian';
import {
	CONFIG_KEYS,
	DEFAULT_MOVED_WORDING,
	DEFAULT_PULLED_WORDING,
	DEFAULT_SEPARATOR,
	VIEW_TYPE,
} from '../constants';
import type { DragPayload, ParsedTask, ProvenanceOptions } from '../types';
import { parseOpenTasks } from '../tasks/parser';
import { pullTask, rawMoveTask, toggleTask } from '../tasks/mutation';
import { renderProperties } from './properties';

const DRAG_MIME = 'application/json';

/**
 * A custom Bases view that turns the notes selected by a Base into a task
 * triage workbench. The Base owns the dataset, filtering, sorting and visible
 * properties; this view only extracts the open Markdown tasks and lets you pull
 * them between notes while keeping the context.
 */
export class TaskRelayView extends BasesView {
	readonly type = VIEW_TYPE;

	private readonly rootEl: HTMLElement;
	private readonly toolbarEl: HTMLElement;
	private readonly listEl: HTMLElement;

	/** Paths whose sections are collapsed (session state). */
	private readonly collapsed = new Set<string>();
	/** Paths currently rendered, used to react to relevant vault changes. */
	private displayedPaths = new Set<string>();

	private eventsReady = false;
	private renderToken = 0;
	private readonly scheduleRender: Debouncer<[], void>;

	constructor(controller: QueryController, containerEl: HTMLElement) {
		super(controller);
		this.rootEl = containerEl.createDiv('task-relay-root');
		this.toolbarEl = this.rootEl.createDiv('task-relay-toolbar');
		this.listEl = this.rootEl.createDiv('task-relay-list');
		this.buildToolbar();
		this.scheduleRender = debounce(() => void this.renderNow(), 60, true);
		this.register(() => this.scheduleRender.cancel());
	}

	onDataUpdated(): void {
		this.scheduleRender();
	}

	private buildToolbar(): void {
		const expand = this.toolbarEl.createEl('button', {
			cls: 'task-relay-toolbar-btn',
			text: 'Expand all',
		});
		expand.addEventListener('click', () => {
			this.collapsed.clear();
			this.scheduleRender();
		});
		const collapse = this.toolbarEl.createEl('button', {
			cls: 'task-relay-toolbar-btn',
			text: 'Collapse all',
		});
		collapse.addEventListener('click', () => {
			for (const path of this.displayedPaths) this.collapsed.add(path);
			this.scheduleRender();
		});
	}

	/** Register vault listeners once, so body edits (not just Base data) refresh. */
	private ensureEvents(): void {
		if (this.eventsReady) return;
		this.eventsReady = true;
		const onChange = (file: TAbstractFile) => {
			if (file instanceof TFile && this.displayedPaths.has(file.path)) {
				this.scheduleRender();
			}
		};
		this.registerEvent(this.app.vault.on('modify', onChange));
		this.registerEvent(this.app.metadataCache.on('changed', onChange));
	}

	private provenanceOptions(): ProvenanceOptions {
		const get = (key: string, fallback: string): string => {
			const value = this.config?.get(key);
			return typeof value === 'string' && value.length > 0
				? value
				: fallback;
		};
		return {
			separator: get(CONFIG_KEYS.separator, DEFAULT_SEPARATOR),
			movedWording: get(CONFIG_KEYS.movedWording, DEFAULT_MOVED_WORDING),
			pulledWording: get(CONFIG_KEYS.pulledWording, DEFAULT_PULLED_WORDING),
		};
	}

	private rawMoveDefault(): boolean {
		return this.config?.get(CONFIG_KEYS.rawMove) === true;
	}

	private async renderNow(): Promise<void> {
		this.ensureEvents();
		const token = ++this.renderToken;

		const entries = this.data ? [...this.data.data] : [];
		const order: BasesPropertyId[] = this.config?.getOrder?.() ?? [];
		const files = entries.map((entry) => entry.file);
		this.displayedPaths = new Set(files.map((file) => file.path));

		const contents = await Promise.all(
			files.map((file) =>
				this.app.vault.cachedRead(file).catch(() => ''),
			),
		);
		// A newer render superseded this one while awaiting file reads.
		if (token !== this.renderToken) return;

		this.listEl.empty();
		if (entries.length === 0) {
			this.listEl.createDiv({
				cls: 'task-relay-placeholder',
				text: 'No notes match this Base.',
			});
			return;
		}

		entries.forEach((entry, index) => {
			this.renderNoteSection(
				entry.file,
				contents[index] ?? '',
				order,
				entry,
			);
		});
	}

	private renderNoteSection(
		file: TFile,
		content: string,
		order: BasesPropertyId[],
		entry: BasesEntry,
	): void {
		const tasks = parseOpenTasks(content);
		const isCollapsed = this.collapsed.has(file.path);

		const sectionEl = this.listEl.createDiv({
			cls: 'task-relay-note',
		});
		if (isCollapsed) sectionEl.addClass('is-collapsed');

		const headerEl = sectionEl.createDiv('task-relay-note-header');
		const chevron = headerEl.createSpan('task-relay-chevron');
		setIcon(chevron, isCollapsed ? 'chevron-right' : 'chevron-down');
		chevron.addEventListener('click', () => this.toggleCollapse(file.path));

		const title = headerEl.createSpan({
			cls: 'task-relay-note-title',
			text: file.basename,
		});
		title.addEventListener('click', () => this.toggleCollapse(file.path));

		headerEl.createSpan({
			cls: 'task-relay-note-count',
			text: String(tasks.length),
		});

		const openBtn = headerEl.createSpan('task-relay-open');
		setIcon(openBtn, 'square-arrow-out-up-right');
		openBtn.setAttribute('aria-label', 'Open note beside');
		openBtn.addEventListener('click', () => this.openNote(file));

		if (order.length > 0) {
			const metaEl = sectionEl.createDiv('task-relay-note-meta');
			renderProperties(this.app, metaEl, entry, this.config, order);
			if (metaEl.childElementCount === 0) metaEl.remove();
		}

		const bodyEl = sectionEl.createDiv('task-relay-note-body');
		if (isCollapsed) bodyEl.addClass('is-hidden');

		if (tasks.length === 0) {
			bodyEl.createDiv({
				cls: 'task-relay-empty',
				text: 'No open tasks — drop here',
			});
		} else {
			for (const task of tasks) {
				this.renderCard(bodyEl, file.path, task);
			}
		}

		this.makeDropTarget(sectionEl, file.path);
	}

	private renderCard(
		containerEl: HTMLElement,
		sourcePath: string,
		task: ParsedTask,
	): void {
		const cardEl = containerEl.createDiv('task-relay-card');
		cardEl.setAttribute('draggable', 'true');

		const checkbox = cardEl.createEl('input', {
			type: 'checkbox',
			cls: 'task-relay-checkbox',
		});
		checkbox.addEventListener('change', () => {
			void toggleTask(this.app, sourcePath, task, checkbox.checked);
		});

		cardEl.createSpan({ cls: 'task-relay-card-text', text: task.text });

		cardEl.addEventListener('dragstart', (event) => {
			if (!event.dataTransfer) return;
			const payload: DragPayload = { sourcePath, task };
			event.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
			event.dataTransfer.effectAllowed = 'move';
			cardEl.addClass('is-dragging');
		});
		cardEl.addEventListener('dragend', () => cardEl.removeClass('is-dragging'));
	}

	private makeDropTarget(sectionEl: HTMLElement, destPath: string): void {
		sectionEl.addEventListener('dragover', (event) => {
			event.preventDefault();
			if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
			sectionEl.addClass('is-drop-target');
		});
		sectionEl.addEventListener('dragleave', () => {
			sectionEl.removeClass('is-drop-target');
		});
		sectionEl.addEventListener('drop', (event) => {
			event.preventDefault();
			sectionEl.removeClass('is-drop-target');
			void this.handleDrop(destPath, event);
		});
	}

	private async handleDrop(destPath: string, event: DragEvent): Promise<void> {
		const raw = event.dataTransfer?.getData(DRAG_MIME);
		if (!raw) return;
		let payload: DragPayload;
		try {
			payload = JSON.parse(raw) as DragPayload;
		} catch {
			return;
		}
		if (!payload?.sourcePath || !payload.task) return;
		if (payload.sourcePath === destPath) return;

		const useRaw = this.rawMoveDefault()
			? !event.shiftKey
			: event.shiftKey;

		try {
			if (useRaw) {
				await rawMoveTask(this.app, payload.sourcePath, payload.task, destPath);
			} else {
				await pullTask(
					this.app,
					payload.sourcePath,
					payload.task,
					destPath,
					this.provenanceOptions(),
				);
			}
		} catch (error) {
			new Notice(
				error instanceof Error
					? error.message
					: 'Could not move the task.',
			);
		}
		this.scheduleRender();
	}

	private toggleCollapse(path: string): void {
		if (this.collapsed.has(path)) this.collapsed.delete(path);
		else this.collapsed.add(path);
		this.scheduleRender();
	}

	private openNote(file: TFile): void {
		const leaf = this.app.workspace.getLeaf('split', 'vertical');
		void leaf.openFile(file);
	}
}
