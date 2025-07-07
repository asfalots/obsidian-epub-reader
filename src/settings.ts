import { App, PluginSettingTab, Setting } from 'obsidian';
import type EpubReaderPlugin from '../main';

export interface HighlightConfig {
	name: string;
	color: string;
	section: string;
	template: string;
}

export interface EpubReaderSettings {
	epubPropertyName: string;
	progressPropertyName: string;
	highlightConfigs: HighlightConfig[];
}

export const DEFAULT_SETTINGS: EpubReaderSettings = {
	epubPropertyName: 'epub',
	progressPropertyName: 'epub-cfi',
	highlightConfigs: [
		{
			name: 'Important',
			color: '#ffeb3b',
			section: '## Highlights',
			template: '> {{text}} ^{{cfi}}'
		},
		{
			name: 'Question',
			color: '#ff9800',
			section: '## Questions',
			template: '**Q**: {{text}}\n**A**: \n\n^{{cfi}}'
		},
		{
			name: 'Note',
			color: '#2196f3',
			section: '## Notes',
			template: '- {{text}} ^{{cfi}}'
		}
	]
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

		// Highlight Configurations
		containerEl.createEl('h3', { text: 'Highlight Configurations' });
		
		this.plugin.settings.highlightConfigs.forEach((config, index) => {
			this.addHighlightConfigSetting(containerEl, config, index);
		});

		// Add new highlight config button
		new Setting(containerEl)
			.addButton(button => button
				.setButtonText('Add Highlight Config')
				.setCta()
				.onClick(async () => {
					this.plugin.settings.highlightConfigs.push({
						name: 'New Highlight',
						color: '#ffeb3b',
						section: '## Highlights',
						template: '> {{text}}'
					});
					await this.plugin.saveSettings();
					this.display(); // Refresh the settings view
				}));
	}

	private addHighlightConfigSetting(containerEl: HTMLElement, config: HighlightConfig, index: number): void {
		const configContainer = containerEl.createDiv('highlight-config');

		// Header with name and delete button
		const headerEl = configContainer.createDiv();
		headerEl.style.display = 'flex';
		headerEl.style.justifyContent = 'space-between';
		headerEl.style.alignItems = 'center';
		headerEl.style.marginBottom = '10px';
		
		headerEl.createEl('h4', { text: config.name || `Highlight Config ${index + 1}` });

		const deleteButton = headerEl.createEl('button', { text: 'Delete' });
		deleteButton.className = 'mod-warning';
		deleteButton.onclick = async () => {
			this.plugin.settings.highlightConfigs.splice(index, 1);
			await this.plugin.saveSettings();
			this.display(); // Refresh the settings view
		};

		// Name setting
		new Setting(configContainer)
			.setName('Name')
			.setDesc('Display name for this highlight type')
			.addText(text => text
				.setValue(config.name)
				.onChange(async (value) => {
					config.name = value;
					await this.plugin.saveSettings();
				}));

		// Color setting
		new Setting(configContainer)
			.setName('Color')
			.setDesc('Highlight color (hex code)')
			.addColorPicker(color => color
				.setValue(config.color)
				.onChange(async (value) => {
					config.color = value;
					await this.plugin.saveSettings();
				}));

		// Section setting
		new Setting(configContainer)
			.setName('Section')
			.setDesc('Markdown heading where highlights will be added')
			.addText(text => text
				.setPlaceholder('## Highlights')
				.setValue(config.section)
				.onChange(async (value) => {
					config.section = value;
					await this.plugin.saveSettings();
				}));

		// Template setting
		new Setting(configContainer)
			.setName('Template')
			.setDesc('Template for highlights. Use {{text}} for the highlighted text')
			.addTextArea(text => {
				text.setValue(config.template)
					.onChange(async (value) => {
						config.template = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.rows = 3;
				return text;
			});
	}
}
