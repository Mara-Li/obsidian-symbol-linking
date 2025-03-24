import { AbstractInputSuggest, type App, type TFile } from "obsidian";

export class FileSuggestWithPath extends AbstractInputSuggest<TFile> {
	removeExt: boolean = false;
	constructor(
		private inputEl: HTMLInputElement,
		app: App,
		removeExt: boolean = false,
		private onSubmit: (value: TFile) => void,
	) {
		super(app, inputEl);
		this.removeExt = removeExt;
	}
	renderSuggestion(value: TFile, el: HTMLElement) {
		el.setText(this.removeExt ? value.path.replace(/\.md$/, "") : value.path);
	}

	getItems(): TFile[] {
		return this.app.vault.getMarkdownFiles();
	}

	protected getSuggestions(query: string): TFile[] {
		return this.getItems().filter((file) =>
			file.path.toLowerCase().contains(query.toLowerCase()),
		);
	}

	selectSuggestion(value: TFile, _evt: MouseEvent | KeyboardEvent) {
		this.onSubmit(value);
		this.inputEl.value = this.removeExt ? value.path.replace(/\.md$/, "") : value.path;
		this.inputEl.focus();
		this.inputEl.trigger("input");
		this.close();
	}
}
