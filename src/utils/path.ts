import type { TFile } from "obsidian";

export function fileNameNoExtension(path: string): string {
	if (!path) return path;
	return path.split("/")?.pop()?.slice(0, -3) as string;
}

export function isAllowedExtension(file: TFile, extension: string[]) {
	return extension.includes(file.extension);
}
