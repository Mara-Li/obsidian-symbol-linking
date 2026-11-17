import type { App } from "obsidian";
import { moment as obsidianMoment } from "obsidian";

// Obsidian types `moment` as a namespace import, which is not callable with `esModuleInterop`
// (enabled in tsconfig.json). It is the moment function at runtime.
const moment = obsidianMoment as unknown as () => { format(format: string): string };

interface CoreTemplatesConfig {
	dateFormat?: string;
	timeFormat?: string;
}

/**
 * Uses core "templates" plugin option to replace the following variables in the template:
 * {{title}} - The title of the new file
 * {{date}} - The current date
 * {{time}} - The current time
 *
 * @param app - The Obsidian App instance
 * @param templateContent - The content of the template file
 * @param title - The title of the new file
 * @returns The template content with the variables replaced
 */
export async function replaceNewFileVars(
	app: App,
	templateContent: string,
	title: string,
): Promise<string> {
	if (!templateContent) return templateContent;

	const coreTemplatesConfigPath = `${app.vault.configDir}/templates.json`;
	let coreTemplatesConfig: CoreTemplatesConfig | null;
	try {
		const rawConfig = await app.vault.adapter.read(coreTemplatesConfigPath);
		coreTemplatesConfig = JSON.parse(rawConfig) as CoreTemplatesConfig | null;
	} catch (error) {
		console.error(
			`@ Symbol Linking: Unable to read core plugin templates config at path: ${coreTemplatesConfigPath}`,
			error,
		);
		return templateContent;
	}

	const dateFormat = coreTemplatesConfig?.dateFormat || "YYYY-MM-DD";
	const timeFormat = coreTemplatesConfig?.timeFormat || "HH:mm";

	templateContent = templateContent.replace(/{{date}}/g, moment().format(dateFormat));
	templateContent = templateContent.replace(/{{time}}/g, moment().format(timeFormat));
	templateContent = templateContent.replace(/{{title}}/g, title);

	return templateContent;
}
