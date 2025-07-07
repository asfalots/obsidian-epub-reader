import { App, TFile } from 'obsidian';
import { HighlightData, AnnotationData } from './types';
import { HighlightLogic } from './highlight-logic';

export class FileOperations {
	
	/**
	 * Saves reading progress to the note file's front-matter
	 */
	static async saveProgress(app: App, noteFilePath: string, currentCfi: string, pluginInstance: any): Promise<void> {
		if (!noteFilePath || !pluginInstance) {
			console.log('No note file path or plugin instance, skipping progress save');
			return;
		}

		try {
			const file = app.vault.getAbstractFileByPath(noteFilePath);
			if (!file || !(file instanceof TFile)) {
				console.error('Note file not found:', noteFilePath);
				return;
			}

			const content = await app.vault.read(file);
			const lines = content.split('\n');
			let frontmatterStart = -1;
			let frontmatterEnd = -1;
			
			for (let i = 0; i < lines.length; i++) {
				if (lines[i].trim() === '---') {
					if (frontmatterStart === -1) {
						frontmatterStart = i;
					} else {
						frontmatterEnd = i;
						break;
					}
				}
			}
			
			const progressProperty = pluginInstance.settings.progressPropertyName;
			
			if (frontmatterStart !== -1 && frontmatterEnd !== -1) {
				const frontmatterLines = lines.slice(frontmatterStart + 1, frontmatterEnd);
				let progressLineIndex = -1;
				
				for (let i = 0; i < frontmatterLines.length; i++) {
					if (frontmatterLines[i].startsWith(`${progressProperty}:`)) {
						progressLineIndex = i;
						break;
					}
				}
				
				if (progressLineIndex !== -1) {
					frontmatterLines[progressLineIndex] = `${progressProperty}: "${currentCfi}"`;
				} else {
					frontmatterLines.push(`${progressProperty}: "${currentCfi}"`);
				}
				
				const newLines = [
					...lines.slice(0, frontmatterStart + 1),
					...frontmatterLines,
					...lines.slice(frontmatterEnd)
				];
				
				await app.vault.modify(file, newLines.join('\n'));
				console.log('Progress saved with CFI:', currentCfi);
			}
			
		} catch (error) {
			console.error('Error saving progress:', error);
		}
	}

	/**
	 * Gets and validates the note file exists
	 */
	static async getAndValidateNoteFile(app: App, noteFilePath: string): Promise<TFile> {
		const file = app.vault.getAbstractFileByPath(noteFilePath);
		if (!file || !(file instanceof TFile)) {
			throw new Error('Note file not found');
		}
		return file;
	}

	/**
	 * Finds the index of a section header in the note lines
	 */
	static findSectionIndex(lines: string[], sectionHeader: string): number {
		const sectionPattern = new RegExp(`^\\s*${sectionHeader.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
		return lines.findIndex(line => sectionPattern.test(line));
	}

	/**
	 * Creates a new section if it doesn't exist
	 */
	static createSectionIfMissing(lines: string[], sectionHeader: string): number {
		if (lines.length > 0 && lines[lines.length - 1].trim() !== '') {
			lines.push('');
		}
		lines.push(sectionHeader, '');
		return lines.length - 2;
	}

	/**
	 * Finds the proper insertion point within a section
	 */
	static findInsertionIndex(lines: string[], sectionIndex: number): number {
		let insertIndex = sectionIndex + 1;
		
		while (insertIndex < lines.length && 
			   lines[insertIndex].trim() !== '' && 
			   !lines[insertIndex].match(/^#+\s/)) {
			insertIndex++;
		}
		
		return insertIndex;
	}

	/**
	 * Inserts highlight entry with proper spacing
	 */
	static insertHighlightWithSpacing(lines: string[], insertIndex: number, highlightEntry: string, sectionIndex: number): void {
		if (insertIndex > sectionIndex + 1 && lines[insertIndex - 1].trim() !== '') {
			lines.splice(insertIndex, 0, '');
			insertIndex++;
		}

		lines.splice(insertIndex, 0, highlightEntry);
		
		if (insertIndex + 1 < lines.length && lines[insertIndex + 1].trim() !== '') {
			lines.splice(insertIndex + 1, 0, '');
		}
	}

	/**
	 * Inserts a highlight into the note file with proper formatting
	 */
	static async insertHighlightIntoNote(app: App, file: TFile, highlightData: HighlightData, annotationData: AnnotationData, config: any): Promise<void> {
		const content = await app.vault.read(file);
		const lines = content.split('\n');
		
		let sectionIndex = this.findSectionIndex(lines, config.section);
		if (sectionIndex === -1) {
			sectionIndex = this.createSectionIfMissing(lines, config.section);
		}

		const highlightText = HighlightLogic.applyTemplate(config.template, highlightData);
		const annotationComment = `<!-- EPUB_ANNOTATION: ${JSON.stringify(annotationData)} -->`;
		const fullHighlightEntry = `${highlightText}\n${annotationComment}`;
		
		const insertIndex = this.findInsertionIndex(lines, sectionIndex);
		this.insertHighlightWithSpacing(lines, insertIndex, fullHighlightEntry, sectionIndex);

		await app.vault.modify(file, lines.join('\n'));
		console.debug('Highlight inserted into note');
	}
}
