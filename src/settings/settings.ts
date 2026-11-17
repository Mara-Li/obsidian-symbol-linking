import {
	type App,
	PluginSettingTab,
	type SettingDefinition,
	type SettingDefinitionItem,
	type SettingDefinitionList,
	TFile,
	TFolder,
} from "obsidian";
import type AtSymbolLinking from "../main";
import {
	type CustomSuggester,
	type CustomTriggerPerLimit,
	DEFAULT_SETTINGS,
} from "./interface";
import { LimitEntryModal, type LimitKind } from "./limit-modal";

/** Settings stored without the `.md` extension, but edited through a `file` control. */
const TEMPLATE_KEY = "addNewNoteTemplateFile";

export class SettingsTab extends PluginSettingTab {
	plugin: AtSymbolLinking;
	shouldReset: boolean;

	constructor(app: App, plugin: AtSymbolLinking) {
		super(app, plugin);
		this.plugin = plugin;
		this.shouldReset = false;
	}

	// On close, reload the plugin if the popup mode changed
	hide() {
		super.hide();
		void this.plugin.reloadPlugin(this.shouldReset);
		this.shouldReset = false;
	}

	getControlValue(key: string): unknown {
		if (key === TEMPLATE_KEY) {
			const template = this.plugin.settings.addNewNoteTemplateFile;
			return template ? `${template}.md` : "";
		}
		return super.getControlValue(key);
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (key === TEMPLATE_KEY && typeof value === "string")
			value = value.replace(/\.md$/, "");
		await super.setControlValue(key, value);
	}

	getSettingDefinitions(): SettingDefinitionItem<keyof CustomSuggester>[] {
		const isOneFileMode = () => this.plugin.settings._enableOneFile;

		return [
			{
				name: "Default symbol (trigger)",
				desc: "Type this symbol to trigger the popup.",
				control: {
					type: "text",
					key: "triggerSymbol",
					placeholder: "@",
					validate: (value) =>
						value.length !== 1 ? "Trigger symbol must be a single character." : undefined,
				},
			},
			{
				name: "Include the trigger symbol",
				desc: "Prefix the final link text with the trigger symbol, e.g. [@evan](./evan).",
				control: { type: "toggle", key: "includeSymbol" },
			},
			this.limitList("file"),
			this.limitList("folder"),
			{
				name: "Header level for contact name",
				desc: "Headings at this level are used as contact names. 0 includes all headings.",
				visible: isOneFileMode,
				control: {
					type: "slider",
					key: "headerLevelForContact",
					min: 0,
					max: 6,
					step: 1,
				},
			},
			{
				type: "group",
				heading: "Add new header",
				visible: isOneFileMode,
				items: [
					{
						name: "Append as header if it doesn't exist",
						desc: "Offer to create the missing header at the end of the file.",
						control: { type: "toggle", key: "appendAsHeader" },
					},
				],
			},
			{
				type: "group",
				heading: "Add new note",
				visible: () => !isOneFileMode(),
				items: [
					{
						name: "Add new note if it doesn't exist",
						desc: "Offer to create the note when no existing note matches.",
						control: { type: "toggle", key: "showAddNewNote" },
					},
					{
						name: "Add new note template",
						desc: createTemplateDesc(),
						visible: () => this.plugin.settings.showAddNewNote,
						control: {
							type: "file",
							key: TEMPLATE_KEY,
							placeholder: "No template (blank note)",
							filter: (file) => file.extension === "md",
							validate: (value) => {
								if (
									value &&
									!(this.app.vault.getAbstractFileByPath(value) instanceof TFile)
								)
									return `Unable to find template file at path: ${value}`;
								return undefined;
							},
						},
					},
					{
						name: "Add new note folder",
						desc: "Folder for new notes. A limited folder matching the trigger takes precedence.",
						visible: () => this.plugin.settings.showAddNewNote,
						control: {
							type: "folder",
							key: "addNewNoteDirectory",
							placeholder: "No folder (root)",
							validate: (value) => {
								if (
									value &&
									!(this.app.vault.getAbstractFileByPath(value) instanceof TFolder)
								)
									return `Unable to find folder at path: ${value}`;
								return undefined;
							},
						},
					},
				],
			},
			{
				type: "group",
				heading: "Suggestion popup behavior",
				items: [
					{
						name: "Use compatibility mode",
						desc: "Render an HTML popup instead of the native one, for plugins that interfere with it (e.g. Tasks).",
						render: (setting) => {
							setting.addToggle((toggle) =>
								toggle
									.setValue(this.plugin.settings.useCompatibilityMode)
									.onChange(async (value) => {
										this.shouldReset = true;
										this.plugin.settings.useCompatibilityMode = value;
										await this.plugin.saveSettings();
										this.plugin.registerPopup();
									}),
							);
						},
					},
					{
						name: "Leave popup open for X spaces",
						desc: "Keep the popup open while typing multi-word names. Escape or Enter still closes it.",
						control: {
							type: "number",
							key: "leavePopupOpenForXSpaces",
							min: 0,
							step: 1,
							placeholder: "0",
							defaultValue: 0,
						},
					},
				],
			},
			{
				type: "group",
				heading: "Advanced",
				items: [
					{
						name: "Invalid character regex",
						desc: "Typed characters matching this regex close the popup, or are ignored in compatibility mode.",
						control: {
							type: "text",
							key: "invalidCharacterRegex",
							placeholder: DEFAULT_SETTINGS.invalidCharacterRegex,
							validate: (value) =>
								validateRegex(value, this.plugin.settings.invalidCharacterRegexFlags),
						},
					},
					{
						name: "Invalid character regex flags",
						desc: "Flags to use with the invalid character regex.",
						control: {
							type: "text",
							key: "invalidCharacterRegexFlags",
							placeholder: DEFAULT_SETTINGS.invalidCharacterRegexFlags,
							validate: (value) =>
								validateRegex(this.plugin.settings.invalidCharacterRegex, value),
						},
					},
					{
						name: "Remove accents from search query",
						desc: "e.g. é -> e when searching or creating links via the popup.",
						control: { type: "toggle", key: "removeAccents" },
					},
				],
			},
		];
	}

	/**
	 * Files and folders limits are mutually exclusive: only one of the two lists
	 * is shown, depending on which one holds entries.
	 */
	private limitList(kind: LimitKind): SettingDefinitionList<keyof CustomSuggester> {
		const isFolder = kind === "folder";
		const entries = () =>
			isFolder
				? this.plugin.settings.limitToDirectories
				: this.plugin.settings.limitToFile;
		// Files win over folders (as in the suggester), so if both were set by an
		// old config, the file list stays reachable to clean it up.
		const visible = () => {
			const { limitToFile, limitToDirectories } = this.plugin.settings;
			return isFolder
				? limitToFile.length === 0
				: limitToFile.length > 0 || limitToDirectories.length === 0;
		};

		const items: SettingDefinition<keyof CustomSuggester>[] = entries().map(
			(entry, index) => ({
				name: entry.path || "(no path)",
				desc: describeEntry(entry, isFolder),
				searchable: false,
				action: () => this.openLimitModal(kind, index),
			}),
		);

		return {
			type: "list",
			heading: isFolder ? "Limit links to folders" : "Limit links to files",
			visible,
			emptyState: isFolder
				? "No folder added: links are sourced from all folders."
				: "No file added: links are sourced from folders. Add a file to use its headings as contacts.",
			addItem: {
				name: isFolder ? "Add folder" : "Add file",
				action: () => this.openLimitModal(kind),
			},
			onReorder: (oldIndex, newIndex) => {
				const list = entries();
				const [moved] = list.splice(oldIndex, 1);
				if (moved) list.splice(newIndex, 0, moved);
				void this.saveLimits();
			},
			onDelete: (index) => {
				entries().splice(index, 1);
				void this.saveLimits();
			},
			items,
		};
	}

	private openLimitModal(kind: LimitKind, index?: number) {
		const list =
			kind === "folder"
				? this.plugin.settings.limitToDirectories
				: this.plugin.settings.limitToFile;
		const initial: CustomTriggerPerLimit = (index !== undefined && list[index]) || {
			path: "",
			triggerSymbol: this.plugin.settings.triggerSymbol,
			extensions: kind === "folder" ? ["md"] : undefined,
		};
		new LimitEntryModal(this.app, kind, initial, async (entry) => {
			if (index === undefined) list.push(entry);
			else list[index] = entry;
			await this.saveLimits();
		}).open();
	}

	/** Persist list changes, keep the one-file mode flag in sync and rebuild the tab. */
	private async saveLimits() {
		const settings = this.plugin.settings;
		settings._enableOneFile = settings.limitToFile.length > 0;
		await this.plugin.saveSettings();
		this.update();
	}
}

function describeEntry(entry: CustomTriggerPerLimit, isFolder: boolean): string {
	const parts = [`Trigger: ${entry.triggerSymbol ?? "default"}`];
	if (isFolder) parts.push(`Extensions: ${(entry.extensions ?? ["md"]).join(", ")}`);
	return parts.join(" · ");
}

function validateRegex(regex: string, flags: string): string | undefined {
	if (!regex.trim()) return "Regex cannot be empty.";
	try {
		new RegExp(regex, flags);
	} catch {
		return "Invalid regex or flags.";
	}
	return undefined;
}

function createTemplateDesc(): DocumentFragment {
	return createFragment((desc) => {
		desc.append("Replaces ");
		desc.createEl("code", { text: "{{title}}" });
		desc.append(", ");
		desc.createEl("code", { text: "{{date}}" });
		desc.append(" and ");
		desc.createEl("code", { text: "{{time}}" });
		desc.append(" using the ");
		desc.createEl("a", {
			text: "core templates plugin",
			href: "https://help.obsidian.md/Plugins/Templates",
		});
		desc.append(" formats.");
	});
}
