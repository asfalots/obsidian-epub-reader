import { App, PluginSettingTab, Setting } from 'obsidian';
import type EpubReaderPlugin from '../main';

export interface EpubReaderSettings {
	epubPropertyName: string;
}

export const DEFAULT_SETTINGS: EpubReaderSettings = {
	epubPropertyName: 'epub'
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
	}
}
