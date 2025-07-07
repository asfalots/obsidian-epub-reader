import { App, PluginSettingTab, Setting } from 'obsidian';
import type EpubReaderPlugin from '../main';

export interface EpubReaderSettings {
	epubPropertyName: string;
	progressPropertyName: string;
}

export const DEFAULT_SETTINGS: EpubReaderSettings = {
	epubPropertyName: 'epub',
	progressPropertyName: 'epub-cfi'
}

export class EpubReaderSettingTab extends PluginSettingTab {
	plugin: EpubReaderPlugin;

	constructor(app: App, plugin: EpubReaderPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('EPUB Property Name')
			.setDesc('The front-matter property name used to link notes to EPUB files')
			.addText(text => text
				.setPlaceholder('epub')
				.setValue(this.plugin.settings.epubPropertyName)
				.onChange(async (value) => {
					this.plugin.settings.epubPropertyName = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Progress Property Name')
			.setDesc('The front-matter property name used to store reading progress (CFI)')
			.addText(text => text
				.setPlaceholder('epub-cfi')
				.setValue(this.plugin.settings.progressPropertyName)
				.onChange(async (value) => {
					this.plugin.settings.progressPropertyName = value;
					await this.plugin.saveSettings();
				}));
	}
}
