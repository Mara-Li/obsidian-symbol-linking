import { type App, Modal, Setting, TFile, TFolder } from "obsidian";
import { FileSuggestWithPath } from "./file-suggest-path";
import { FolderSuggester } from "./folder-suggest";
import type { CustomTriggerPerLimit } from "./interface";

export type LimitKind = "file" | "folder";

/**
 * Form used to add or edit an entry of the "limit links to files/folders" lists.
 * Each entry holds several values (path, trigger, extensions), so it is edited
 * in a modal with explicit Save/Cancel instead of inline in the setting tab.
 */
export class LimitEntryModal extends Modal {
	private readonly entry: CustomTriggerPerLimit;
	private extensionsInput: string;

	constructor(
		app: App,
		private readonly kind: LimitKind,
		initial: CustomTriggerPerLimit,
		private readonly onSave: (entry: CustomTriggerPerLimit) => void | Promise<void>,
	) {
		super(app);
		this.entry = { ...initial, extensions: initial.extensions ?? ["md"] };
		this.extensionsInput = (this.entry.extensions ?? ["md"]).join(", ");
	}

	onOpen(): void {
		const { contentEl } = this;
		const isFolder = this.kind === "folder";
		this.setTitle(isFolder ? "Limit links to folder" : "Limit links to file");

		new Setting(contentEl).setName(isFolder ? "Folder" : "File").addSearch((cb) => {
			cb.setPlaceholder(isFolder ? "Folder" : "File").setValue(this.entry.path);
			cb.onChange((value) => {
				this.entry.path = value.trim();
			});
			if (isFolder)
				new FolderSuggester(cb.inputEl, this.app, (value) => {
					this.entry.path = value.trim();
				});
			else
				new FileSuggestWithPath(cb.inputEl, this.app, false, (file) => {
					this.entry.path = file.path;
				});
		});

		new Setting(contentEl)
			.setName("Trigger symbol")
			.setDesc("Typing this symbol searches only this entry.")
			.addText((text) =>
				text
					.setPlaceholder("@")
					.setValue(this.entry.triggerSymbol ?? "")
					.onChange((value) => {
						this.entry.triggerSymbol = value;
					}),
			);

		if (isFolder)
			new Setting(contentEl)
				.setName("Extensions")
				.setDesc("Comma-separated file extensions to link to.")
				.addText((text) =>
					text
						.setPlaceholder("md")
						.setValue(this.extensionsInput)
						.onChange((value) => {
							this.extensionsInput = value;
						}),
				);

		const errorEl = contentEl.createDiv({ cls: "mod-warning" });

		new Setting(contentEl)
			.addButton((button) =>
				button.setButtonText("Cancel").onClick(() => {
					this.close();
				}),
			)
			.addButton((button) =>
				button
					.setButtonText("Save")
					.setCta()
					.onClick(async () => {
						const error = this.validate();
						errorEl.setText(error ?? "");
						if (error) return;
						if (isFolder) this.entry.extensions = parseExtensions(this.extensionsInput);
						else delete this.entry.extensions;
						await this.onSave(this.entry);
						this.close();
					}),
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private validate(): string | undefined {
		if (!this.entry.path) return "Choose a path.";
		const target = this.app.vault.getAbstractFileByPath(this.entry.path);
		if (this.kind === "folder" && !(target instanceof TFolder))
			return `Unable to find folder at path: ${this.entry.path}`;
		if (this.kind === "file" && !(target instanceof TFile))
			return `Unable to find file at path: ${this.entry.path}`;
		if (this.entry.triggerSymbol?.length !== 1)
			return "Trigger symbol must be a single character.";
		return undefined;
	}
}

export function parseExtensions(value: string): string[] {
	const extensions = value
		.split(/[\n ,]+/)
		.map((ext) => ext.trim().replace(/^\./, ""))
		.filter((ext) => ext.length > 0);
	return extensions.length > 0 ? extensions : ["md"];
}
