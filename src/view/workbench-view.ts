import {
	BasesView,
	debounce,
	MarkdownRenderer,
	MarkdownView,
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
	WorkspaceLeaf,
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
import { logger } from '../logger';

const DRAG_MIME = 'application/json';
const SECTION_MIME = 'application/x-task-relay-section';

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
	/** Paths in current render order, used as the basis for manual reordering. */
	private renderedOrder: string[] = [];

	private eventsReady = false;
	private renderToken = 0;
	private readonly scheduleRender: Debouncer<[], void>;

	/** The task currently being dragged, so drops onto open editors also work. */
	private pendingDrag: DragPayload | null = null;
	/** The leaf used to show opened notes, reused across clicks. */
	private previewLeaf: WorkspaceLeaf | null = null;

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

		// Allow dropping a task card straight onto an open Markdown editor.
		// Capture phase runs before the editor's own drop handling.
		this.registerDomEvent(
			document,
			'dragover',
			(event) => this.onEditorDragOver(event),
			{ capture: true },
		);
		this.registerDomEvent(
			document,
			'drop',
			(event) => this.onEditorDrop(event),
			{ capture: true },
		);
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

	private manualOrder(): boolean {
		return this.config?.get(CONFIG_KEYS.manualOrder) === true;
	}

	private storedOrder(): string[] {
		const value = this.config?.get(CONFIG_KEYS.order);
		return Array.isArray(value)
			? value.filter((item): item is string => typeof item === 'string')
			: [];
	}

	private writeStoredOrder(paths: string[]): void {
		this.config?.set(CONFIG_KEYS.order, paths);
		this.scheduleRender();
	}

	private async renderNow(): Promise<void> {
		this.ensureEvents();
		const token = ++this.renderToken;

		let entries = (this.data ? [...this.data.data] : []).filter(
			(entry) => entry.file.extension === 'md',
		);
		// When manual order is enabled, override Base sort with the order stored
		// in the Base view config. Unlisted notes keep their Base order at the end.
		if (this.manualOrder()) {
			const rank = new Map(
				this.storedOrder().map((path, index) => [path, index]),
			);
			entries = [...entries].sort(
				(a, b) =>
					(rank.get(a.file.path) ?? Number.MAX_SAFE_INTEGER) -
					(rank.get(b.file.path) ?? Number.MAX_SAFE_INTEGER),
			);
		}
		const order: BasesPropertyId[] = this.config?.getOrder?.() ?? [];
		const files = entries.map((entry) => entry.file);
		this.displayedPaths = new Set(files.map((file) => file.path));
		this.renderedOrder = files.map((file) => file.path);

		const contents = await Promise.all(
			files.map((file) =>
				this.app.vault.cachedRead(file).catch(() => ''),
			),
		);
		// A newer render superseded this one while awaiting file reads.
		if (token !== this.renderToken) return;

		logger.info('Rendered workbench', { notes: entries.length });

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

		if (this.manualOrder()) {
			const grip = headerEl.createSpan('task-relay-grip');
			setIcon(grip, 'grip-vertical');
			grip.setAttribute('aria-label', 'Drag to reorder');
			headerEl.setAttribute('draggable', 'true');
			headerEl.addEventListener('dragstart', (event) => {
				if (!event.dataTransfer) return;
				event.dataTransfer.setData(SECTION_MIME, file.path);
				event.dataTransfer.effectAllowed = 'move';
				sectionEl.addClass('is-reordering');
			});
			headerEl.addEventListener('dragend', () =>
				sectionEl.removeClass('is-reordering'),
			);
		}

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

		const textEl = cardEl.createDiv('task-relay-card-text');
		void MarkdownRenderer.render(
			this.app,
			task.text,
			textEl,
			sourcePath,
			this,
		);

		cardEl.addEventListener('dragstart', (event) => {
			if (!event.dataTransfer) return;
			const payload: DragPayload = { sourcePath, task };
			this.pendingDrag = payload;
			event.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
			event.dataTransfer.effectAllowed = 'move';
			cardEl.addClass('is-dragging');
			logger.info('Drag start', { sourcePath, text: task.text });
		});
		cardEl.addEventListener('dragend', () => {
			cardEl.removeClass('is-dragging');
			this.pendingDrag = null;
		});
	}

	private makeDropTarget(sectionEl: HTMLElement, destPath: string): void {
		const clearIndicators = () => {
			sectionEl.removeClass('is-drop-target');
			sectionEl.removeClass('is-reorder-before');
			sectionEl.removeClass('is-reorder-after');
		};
		sectionEl.addEventListener('dragover', (event) => {
			event.preventDefault();
			if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
			if (this.isSectionDrag(event)) {
				const before = this.isAbove(event, sectionEl);
				sectionEl.toggleClass('is-reorder-before', before);
				sectionEl.toggleClass('is-reorder-after', !before);
			} else {
				sectionEl.addClass('is-drop-target');
			}
		});
		sectionEl.addEventListener('dragleave', clearIndicators);
		sectionEl.addEventListener('drop', (event) => {
			event.preventDefault();
			const before = this.isAbove(event, sectionEl);
			clearIndicators();
			const sectionSrc = event.dataTransfer?.getData(SECTION_MIME);
			if (sectionSrc) {
				this.handleReorder(sectionSrc, destPath, before);
				return;
			}
			void this.handleDrop(destPath, event);
		});
	}

	private isSectionDrag(event: DragEvent): boolean {
		const types = event.dataTransfer?.types;
		return types ? Array.from(types).includes(SECTION_MIME) : false;
	}

	private isAbove(event: DragEvent, el: HTMLElement): boolean {
		const rect = el.getBoundingClientRect();
		return event.clientY < rect.top + rect.height / 2;
	}

	/** Reorder note sections and persist the new order in the Base view config. */
	private handleReorder(
		srcPath: string,
		destPath: string,
		before: boolean,
	): void {
		if (srcPath === destPath) return;
		const order = [...this.renderedOrder];
		const from = order.indexOf(srcPath);
		if (from < 0) return;
		order.splice(from, 1);
		const to = order.indexOf(destPath);
		if (to < 0) {
			order.push(srcPath);
		} else {
			order.splice(before ? to : to + 1, 0, srcPath);
		}
		logger.info('Reorder', { srcPath, destPath, before });
		this.writeStoredOrder(order);
	}

	private async handleDrop(destPath: string, event: DragEvent): Promise<void> {
		const raw = event.dataTransfer?.getData(DRAG_MIME);
		if (!raw) {
			logger.info('Drop ignored: no drag payload', { destPath });
			return;
		}
		let payload: DragPayload;
		try {
			payload = JSON.parse(raw) as DragPayload;
		} catch (error) {
			logger.error('Drop failed: invalid payload', {
				destPath,
				error: String(error),
			});
			return;
		}
		if (!payload?.sourcePath || !payload.task) return;
		await this.performMove(payload, destPath, event.shiftKey);
	}

	/** Handle a task card dropped directly onto an open Markdown editor. */
	private onEditorDragOver(event: DragEvent): void {
		if (!this.pendingDrag) return;
		if (!this.markdownFileAt(event.target)) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
	}

	private onEditorDrop(event: DragEvent): void {
		if (!this.pendingDrag) return;
		const file = this.markdownFileAt(event.target);
		if (!file) return;
		// Beat the editor's own drop handling so the task is not also inserted.
		event.preventDefault();
		event.stopPropagation();
		const payload = this.pendingDrag;
		this.pendingDrag = null;
		void this.performMove(payload, file.path, event.shiftKey);
	}

	/** Find the file of the Markdown editor under the given drop target, if any. */
	private markdownFileAt(target: EventTarget | null): TFile | null {
		if (!(target instanceof Node)) return null;
		let result: TFile | null = null;
		this.app.workspace.iterateAllLeaves((leaf) => {
			const view = leaf.view;
			if (
				view instanceof MarkdownView &&
				view.file &&
				view.containerEl.contains(target)
			) {
				result = view.file;
			}
		});
		return result;
	}

	private async performMove(
		payload: DragPayload,
		destPath: string,
		shiftKey: boolean,
	): Promise<void> {
		if (payload.sourcePath === destPath) {
			logger.info('Move ignored: same note', { destPath });
			return;
		}

		const useRaw = this.rawMoveDefault() ? !shiftKey : shiftKey;

		logger.info('Move', {
			sourcePath: payload.sourcePath,
			destPath,
			useRaw,
			text: payload.task.text,
		});

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
			logger.info('Move complete', {
				sourcePath: payload.sourcePath,
				destPath,
			});
		} catch (error) {
			logger.error('Move failed', {
				sourcePath: payload.sourcePath,
				destPath,
				error: error instanceof Error ? error.message : String(error),
			});
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

	/** Open a note beside the workbench, on the left, reusing one preview leaf. */
	private openNote(file: TFile): void {
		const leaf = this.getPreviewLeaf();
		void leaf.openFile(file);
		this.app.workspace.setActiveLeaf(leaf, { focus: true });
	}

	private getPreviewLeaf(): WorkspaceLeaf {
		// Reuse the leaf we opened last time, if it still exists.
		if (this.previewLeaf && this.leafExists(this.previewLeaf)) {
			return this.previewLeaf;
		}
		const own = this.findOwnLeaf();
		// Otherwise reuse an already-open Markdown pane (replace it, like a link),
		// rather than spawning a new tab.
		const existing = this.findReusableMarkdownLeaf(own);
		if (existing) {
			this.previewLeaf = existing;
			return existing;
		}
		// Nothing open yet: create a pane on the left of the workbench.
		const leaf = own
			? this.app.workspace.createLeafBySplit(own, 'vertical', true)
			: this.app.workspace.getLeaf('split', 'vertical');
		this.previewLeaf = leaf;
		return leaf;
	}

	private findReusableMarkdownLeaf(
		own: WorkspaceLeaf | null,
	): WorkspaceLeaf | null {
		let found: WorkspaceLeaf | null = null;
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (found || leaf === own) return;
			if (leaf.view instanceof MarkdownView) found = leaf;
		});
		return found;
	}

	private leafExists(target: WorkspaceLeaf): boolean {
		let exists = false;
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf === target) exists = true;
		});
		return exists;
	}

	private findOwnLeaf(): WorkspaceLeaf | null {
		let found: WorkspaceLeaf | null = null;
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view?.containerEl?.contains(this.rootEl)) found = leaf;
		});
		return found;
	}
}
