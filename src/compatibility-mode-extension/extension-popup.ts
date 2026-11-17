/**
 * Compatibility Mode Extension Handler
 * Necessary to handle the suggester with somes other plugins, as Various Complement, nl-date, Task or older plugin that doesn't use last Obsidian API.
 * This extension made Linking works with them without any issue.
 * It is optional and can be enabled in the settings. By default, it is disabled and use the last API for editor inputs.
 */

// Code derived from https://github.com/farux/obsidian-auto-note-mover
import { type App, type ISuggestOwner as IOwner, Platform, Scope } from "obsidian";
import type { CustomSuggester } from "../settings/interface";
import {
	sharedGetMonoFileSuggestion,
	sharedGetSuggestions,
} from "../shared-suggestion/sharedGetSuggestions";
import sharedRenderSuggestion from "../shared-suggestion/sharedRenderSuggestion";
import { sharedSelectSuggestion } from "../shared-suggestion/sharedSelectSuggestion";
import type { FileSuggestion } from "../types";
import { removeAccents } from "../utils/valid-file-name";

/** Height of an editor line: the anchor is placed this far below the line's top. */
export const LINE_HEIGHT = 24;

export class Suggest<T> {
	private owner: IOwner<T>;
	private values: T[] = [];
	private suggestions: HTMLElement[] = [];
	private selectedItem = 0;
	private containerEl: HTMLElement;

	constructor(owner: IOwner<T>, containerEl: HTMLElement, scope: Scope) {
		this.owner = owner;
		this.containerEl = containerEl;

		containerEl.on("click", ".suggestion-item", (event, el) =>
			this.onSuggestionClick(event, el),
		);
		containerEl.on("mousemove", ".suggestion-item", (_event, el) =>
			this.onSuggestionMouseover(el),
		);

		scope.register([], "ArrowUp", (event) => {
			if (event.isComposing) return true;
			this.setSelectedItem(this.selectedItem - 1, true);
			return false;
		});

		scope.register([], "ArrowDown", (event) => {
			if (event.isComposing) return true;
			this.setSelectedItem(this.selectedItem + 1, true);
			return false;
		});

		scope.register([], "Enter", (event) => {
			if (event.isComposing) return true;
			this.useSelectedItem(event);
			return false;
		});
	}

	onSuggestionClick(event: MouseEvent, el: HTMLElement): void {
		event.preventDefault();

		const item = this.suggestions.indexOf(el);
		this.setSelectedItem(item, false);
		this.useSelectedItem(event);
	}

	onSuggestionMouseover(el: HTMLElement): void {
		const item = this.suggestions.indexOf(el);
		this.setSelectedItem(item, false);
	}

	setSuggestions(values: T[]) {
		this.containerEl.empty();
		const suggestionEls: HTMLElement[] = [];

		values.forEach((value) => {
			const suggestionEl = this.containerEl.createDiv("suggestion-item");
			this.owner.renderSuggestion(value, suggestionEl);
			suggestionEls.push(suggestionEl);
		});

		this.values = values;
		this.suggestions = suggestionEls;
		this.setSelectedItem(0, false);
	}

	useSelectedItem(event: MouseEvent | KeyboardEvent) {
		const currentValue = this.values[this.selectedItem];
		if (currentValue) {
			this.owner.selectSuggestion(currentValue, event);
		}
	}

	setSelectedItem(selectedIndex: number, scrollIntoView: boolean) {
		const normalizedIndex = wrapAround(selectedIndex, this.suggestions.length);
		const prevSelectedSuggestion = this.suggestions[this.selectedItem];
		const selectedSuggestion = this.suggestions[normalizedIndex];

		prevSelectedSuggestion?.removeClass("is-selected");
		selectedSuggestion?.addClass("is-selected");

		this.selectedItem = normalizedIndex;

		if (scrollIntoView) {
			selectedSuggestion?.scrollIntoView(false);
		}
	}
}

export class LinkSuggest implements IOwner<FileSuggestion> {
	protected app: App;
	protected inputEl: HTMLDivElement;
	protected settings: CustomSuggester;
	private readonly triggerSymbol: string;
	private readonly scope: Scope;
	private readonly suggestEl: HTMLElement;
	private suggest: Suggest<FileSuggestion>;
	private readonly onSelect: (linkText: string) => void;
	private originalQuery = "";

	constructor(
		app: App,
		inputEl: HTMLDivElement,
		settings: CustomSuggester,
		triggerSymbol: string,
		onSelect: (linkText: string) => void,
	) {
		this.app = app;
		this.inputEl = inputEl;
		this.settings = settings;
		this.scope = new Scope();
		this.onSelect = onSelect;
		this.triggerSymbol = triggerSymbol;

		this.suggestEl = createDiv("suggestion-container at-symbol-linking-compat-popup");
		if (Platform.isMobile) {
			this.suggestEl.addClass("is-mobile");
		} else {
			this.suggestEl.addClass("extension-container-at-symbol-linking");
		}
		const suggestion = this.suggestEl.createDiv("suggestion");
		suggestion.id = "at-symbol-suggestion-container";
		this.suggest = new Suggest(this, suggestion, this.scope);

		this.scope.register([], "Escape", () => this.close());

		this.suggestEl.on("mousedown", ".suggestion-container", (event) => {
			event.preventDefault();
		});
	}

	onInputChanged(inputStr: string): void {
		const suggestions = this.getSuggestions(inputStr);

		if (suggestions.length > 0) {
			this.suggest.setSuggestions(suggestions);
			this.open(this.app.dom.appContainerEl);
		}
	}

	open(container: HTMLElement): void {
		this.app.keymap.pushScope(this.scope);

		container.appendChild(this.suggestEl);
		this.reposition();
	}

	/**
	 * Desktop: under the anchor, aligned on its left edge, or above the line if it
	 * doesn't fit. Mobile: full width, right above the anchor (the mobile toolbar).
	 */
	private reposition(): void {
		const anchor = this.inputEl.getBoundingClientRect();
		const viewportHeight = this.inputEl.win.innerHeight;
		if (Platform.isMobile) {
			this.suggestEl.setCssStyles({ bottom: `${viewportHeight - anchor.top}px` });
			return;
		}
		const height = this.suggestEl.offsetHeight;
		const fitsBelow = anchor.bottom + height <= viewportHeight;
		const top = fitsBelow
			? anchor.bottom
			: Math.max(0, anchor.top - LINE_HEIGHT - height);
		this.suggestEl.setCssStyles({ left: `${anchor.left}px`, top: `${top}px` });
	}

	close(): void {
		this.app.keymap.popScope(this.scope);

		this.suggest.setSuggestions([]);
		this.suggestEl.detach();
	}

	getSuggestions(query: string): FileSuggestion[] {
		this.originalQuery = query;
		query = removeAccents(query);
		if (this.settings.limitToFile.length > 0) {
			return sharedGetMonoFileSuggestion(
				query,
				this.settings,
				this.app,
				this.triggerSymbol,
				this.originalQuery,
			);
		}
		const files = this.app.vault.getFiles();
		return sharedGetSuggestions(
			files,
			query,
			this.settings,
			this.app,
			this.triggerSymbol,
			this.originalQuery,
		);
	}

	renderSuggestion(value: FileSuggestion, el: HTMLElement): void {
		sharedRenderSuggestion(
			value,
			el,
			this.settings.limitToFile.length,
			this.settings.removeAccents,
		);
	}

	selectSuggestion(value: FileSuggestion): void {
		sharedSelectSuggestion(
			this.app,
			this.settings,
			this.triggerSymbol,
			this.originalQuery,
			value,
		).then(
			(linkText) => this.onSelect(linkText),
			(error: unknown) =>
				console.error("Symbol Linking: unable to insert the link", error),
		);
	}
}

export const wrapAround = (value: number, size: number): number => {
	return ((value % size) + size) % size;
};
