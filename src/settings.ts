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
	navigationMode: 'page' | 'chapter';
	hideNavigationHeader: boolean;
	navigationHeaderPosition: 'top' | 'bottom';
}

export const DEFAULT_SETTINGS: EpubReaderSettings = {
	epubPropertyName: 'epub',
	progressPropertyName: 'epub-cfi',
	navigationMode: 'page',
	hideNavigationHeader: false,
	navigationHeaderPosition: 'top',
	highlightConfigs: [
		{
			name: 'Quotes',
			color: '#ffeb3b',
			section: '## Quotes',
			template: '> [!quote] {{text}} ^{{cfi}}'
		},
		{
			name: 'Plot',
			color: '#ff9800',
			section: '## Plots',
			template: '> [!hint] {{text}} ^{{cfi}}'
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

		new Setting(containerEl)
			.setName('Navigation Mode')
			.setDesc('Choose how to navigate through the EPUB')
			.addDropdown(dropdown => dropdown
				.addOption('page', 'Page-based (with pagination)')
				.addOption('chapter', 'Chapter-based (scroll through chapter)')
				.setValue(this.plugin.settings.navigationMode)
				.onChange(async (value: 'page' | 'chapter') => {
					this.plugin.settings.navigationMode = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Hide Navigation Header')
			.setDesc('Hide the navigation buttons and reading location indicator')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.hideNavigationHeader)
				.onChange(async (value) => {
					this.plugin.settings.hideNavigationHeader = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Navigation Header Position')
			.setDesc('Position of the navigation header (when not hidden)')
			.addDropdown(dropdown => dropdown
				.addOption('top', 'Top')
				.addOption('bottom', 'Bottom')
				.setValue(this.plugin.settings.navigationHeaderPosition)
				.onChange(async (value: 'top' | 'bottom') => {
					this.plugin.settings.navigationHeaderPosition = value;
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
