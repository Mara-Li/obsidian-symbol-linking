import { AbstractInputSuggest, type App, type TFolder } from "obsidian";

export class FolderSuggester extends AbstractInputSuggest<string> {
	constructor(
		private inputEl: HTMLInputElement,
		app: App,
		private onSubmit: (value: string) => void,
	) {
		super(app, inputEl);
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.setText(value);
	}

	getSuggestions(query: string): string[] {
		return this.app.vault
			.getAllFolders()
			.filter((folder: TFolder) => {
				return folder.path.toLowerCase().contains(query.toLowerCase());
			})
			.map((folder: TFolder) => folder.path);
	}

	selectSuggestion(value: string, _evt: MouseEvent | KeyboardEvent): void {
		this.inputEl.value = value;
		this.onSubmit(value);
		this.inputEl.focus();
		this.inputEl.trigger("input");
		this.close();
	}
}
