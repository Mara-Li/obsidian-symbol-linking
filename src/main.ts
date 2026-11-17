import { Notice, Plugin } from "obsidian";
import { atSymbolTriggerExtension } from "./compatibility-mode-extension/extension-handler";
import { applyHotKeyHack } from "./native-suggestion/hotkeys";
import SuggestionPopup from "./native-suggestion/suggest-popup";
import {
	type AtSymbolLinkingSettings,
	type CustomSuggester,
	DEFAULT_SETTINGS,
} from "./settings/interface";
import { SettingsTab } from "./settings/settings";
export default class AtSymbolLinking extends Plugin {
	declare settings: CustomSuggester;
	reloadingPlugins = false;
	activeExtensions: ReturnType<typeof atSymbolTriggerExtension>[] = [];
	suggestionPopup: SuggestionPopup | null = null;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new SettingsTab(this.app, this));

		this.registerPopup();
	}

	// If compatibility mode is enabled, use the HTML extension-based popup
	// Otherwise, use the native EditorSuggest popup
	registerPopup(): void {
		if (this.settings.useCompatibilityMode) {
			this.activeExtensions = [atSymbolTriggerExtension(this.app, this.settings)];
			this.registerEditorExtension(this.activeExtensions);
			this.registerEvent(
				this.app.workspace.on(
					"active-leaf-change",
					this.updateEditorProcessors.bind(this),
				),
			);
		} else {
			this.suggestionPopup = new SuggestionPopup(this.app, this.settings);
			this.registerEditorSuggest(this.suggestionPopup);
			applyHotKeyHack(this, this.app);
		}
	}

	// Since we can disable/enable modes that register and unregister an editor extension in settings
	// We need to reload the plugin to unregister the existing extension when settings are changed
	async reloadPlugin(shouldReset: boolean) {
		if (!shouldReset) {
			return;
		}
		if (this.reloadingPlugins) return;

		const plugins = this.app.plugins;
		if (!plugins.enabledPlugins.has(this.manifest.id)) {
			return;
		}

		this.reloadingPlugins = true;
		try {
			await plugins.disablePlugin(this.manifest.id);
			await new Promise((resolve) => window.setTimeout(resolve, 100));
			await plugins.enablePlugin(this.manifest.id);
		} catch (error) {
			console.error(`[${this.manifest.id}] Unable to reload the plugin`, error);
		} finally {
			this.reloadingPlugins = false;
		}
	}

	async convertOldSettings() {
		const oldManifest = this.app.plugins.manifests["at-symbol-linking"];
		if (oldManifest && !this.settings._converted) {
			const folder = oldManifest.dir;
			//get data.json file
			const dataFile = `${folder}/data.json`;
			const settings = await this.app.vault.adapter.read(dataFile);
			const oldSettings = JSON.parse(settings) as Partial<AtSymbolLinkingSettings>;
			if (oldSettings) {
				new Notice("Convertir the settings of @ symbol linking to custom suggester");
				const directories = oldSettings?.limitLinkDirectories;
				const files = oldSettings?.limitToOneFile;
				const directoriesTrigger = oldSettings?.limitLinkDirectoriesWithTrigger;
				delete oldSettings.limitToOneFile;
				const filesTrigger = oldSettings?.limitToOneFileWithTrigger;
				delete oldSettings.limitToOneFileWithTrigger;
				delete oldSettings.limitLinkDirectories;
				delete oldSettings.limitToOneFile;
				if (directories && directories.length > 0)
					this.settings.limitToDirectories = directories.map((path) => ({
						path,
						triggerSymbol: oldSettings.triggerSymbol ?? "@",
					}));
				else if (directoriesTrigger && directoriesTrigger.length > 0) {
					this.settings.limitToDirectories = directoriesTrigger;
					delete oldSettings.limitLinkDirectoriesWithTrigger;
				}
				if (files && files.length > 0)
					this.settings.limitToFile = files.map((path) => ({
						path,
						triggerSymbol: oldSettings.triggerSymbol ?? "@",
					}));
				else if (filesTrigger && filesTrigger.length > 0) {
					this.settings.limitToFile = filesTrigger;
					delete oldSettings.limitToOneFileWithTrigger;
				}
				//merge
				this.settings = Object.assign(this.settings, oldSettings);
			}
		}
		this.settings._converted = true;
		await this.saveSettings();
	}

	updateEditorProcessors() {
		if (this.activeExtensions.length) {
			this.activeExtensions.length = 0;
			this.activeExtensions.push(atSymbolTriggerExtension(this.app, this.settings));
			this.app.workspace.updateOptions();
		}
	}

	async loadSettings() {
		//convert old plugin if exists
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		await this.convertOldSettings();
		this.sanitizeSettings();
	}

	/**
	 * The setting tab only validates new input: fix values stored by older
	 * versions (or edited by hand) so the suggester never runs with invalid data.
	 */
	sanitizeSettings() {
		const settings = this.settings;
		if (settings.triggerSymbol?.length !== 1)
			settings.triggerSymbol =
				settings.triggerSymbol?.[0] ?? DEFAULT_SETTINGS.triggerSymbol;
		const spaces = Number(settings.leavePopupOpenForXSpaces);
		settings.leavePopupOpenForXSpaces =
			Number.isInteger(spaces) && spaces >= 0 ? spaces : 0;
		try {
			if (!settings.invalidCharacterRegex?.trim()) throw new Error("empty regex");
			new RegExp(settings.invalidCharacterRegex, settings.invalidCharacterRegexFlags);
		} catch {
			settings.invalidCharacterRegex = DEFAULT_SETTINGS.invalidCharacterRegex;
			settings.invalidCharacterRegexFlags = DEFAULT_SETTINGS.invalidCharacterRegexFlags;
		}
		settings._enableOneFile = settings.limitToFile.length > 0;
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
