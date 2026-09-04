import { App, Modal, Setting } from 'obsidian';

class AddTaskModal extends Modal {
	private resolved = false;
	private inputEl: HTMLInputElement | null = null;
	private errorEl: HTMLElement | null = null;

	constructor(
		app: App,
		private readonly noteName: string,
		private readonly onResolve: (value: string | null) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle(`Add task to ${this.noteName}`);

		new Setting(this.contentEl)
			.setName('Task')
			.addText((text) => {
				text.setPlaceholder('Write the new task');
				text.inputEl.addEventListener('keydown', (event) => {
					if (event.key === 'Enter') {
						event.preventDefault();
						this.submit();
					}
				});
				this.inputEl = text.inputEl;
			});

		this.errorEl = this.contentEl.createDiv('task-relay-modal-error');

		new Setting(this.contentEl)
			.addButton((button) => {
				button.setButtonText('Add');
				button.setCta();
				button.onClick(() => this.submit());
			})
			.addButton((button) => {
				button.setButtonText('Cancel');
				button.onClick(() => this.close());
			});

		window.setTimeout(() => this.inputEl?.focus(), 0);
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.resolved) this.onResolve(null);
	}

	private submit(): void {
		const value = this.inputEl?.value.trim() ?? '';
		if (!value) {
			if (this.errorEl) this.errorEl.setText('Task cannot be empty.');
			this.inputEl?.focus();
			return;
		}
		this.resolved = true;
		this.onResolve(value);
		this.close();
	}
}

export function requestTaskText(
	app: App,
	noteName: string,
): Promise<string | null> {
	return new Promise((resolve) => {
		new AddTaskModal(app, noteName, resolve).open();
	});
}
