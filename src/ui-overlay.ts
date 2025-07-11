import { SUCCESS_FEEDBACK_DURATION, ERROR_FEEDBACK_DURATION } from './types';

export class UIOverlay {
	
	/**
	 * Detects if the current device is mobile
	 */
	static isMobile(): boolean {
		return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
	}
	
	/**
	 * Handles text selection events and shows highlight overlay if text is selected
	 */
	static handleTextSelection(event: Event, containerEl: HTMLElement, showOverlayCallback: (selection: Selection | null) => void): void {
		// Different delay for mobile vs desktop
		const delay = this.isMobile() ? 100 : 10;
		
		// Small delay to ensure selection is complete
		setTimeout(() => {
			const selection = window.getSelection();
			if (selection && selection.toString().trim()) {
				// Only show overlay if selection is within the EPUB content
				const contentDiv = containerEl.querySelector('#epub-content');
				if (contentDiv && contentDiv.contains(selection.anchorNode)) {
					showOverlayCallback(selection);
				}
			}
		}, delay);
	}

	/**
	 * Shows the highlight color selection overlay
	 */
	static showHighlightOverlay(selection: Selection | null, pluginInstance: any, containerEl: HTMLElement, highlightClickCallback: (e: Event, selection: Selection, config: any, button: HTMLButtonElement) => Promise<void>): HTMLElement | null {
		if (!selection || !pluginInstance?.settings?.highlightConfigs) {
			return null;
		}

		// Store selection data for mobile (since we might clear the selection)
		let storedSelectionData: {
			text: string;
			range: Range;
		} | null = null;
		
		if (this.isMobile() && selection.rangeCount > 0) {
			storedSelectionData = {
				text: selection.toString(),
				range: selection.getRangeAt(0).cloneRange()
			};
		}

		// Remove existing overlay
		this.hideHighlightOverlay(containerEl);

		const overlay = document.createElement('div');
		overlay.className = 'epub-highlight-overlay';
		overlay.style.cssText = `
			position: absolute;
			background: var(--background-primary);
			border: 1px solid var(--background-modifier-border);
			border-radius: 6px;
			padding: 8px;
			z-index: 1000;
			display: flex;
			gap: 4px;
			box-shadow: 0 2px 8px rgba(0,0,0,0.1);
		`;

		// Get selection position for overlay placement
		const range = selection.getRangeAt(0);
		const rect = range.getBoundingClientRect();
		const containerRect = containerEl.getBoundingClientRect();
		
		// Position overlay below selection to avoid conflict with native Android overlay on top
		const overlayTop = rect.bottom - containerRect.top + 10; // Position below selection
		const overlayLeft = Math.max(10, rect.left - containerRect.left); // Ensure it stays in bounds
		
		overlay.style.left = `${overlayLeft}px`;
		overlay.style.top = `${overlayTop}px`;

		// Create color buttons
		pluginInstance.settings.highlightConfigs.forEach((config: any) => {
			const button = document.createElement('button');
			button.className = 'epub-highlight-btn';
			button.style.cssText = `
				width: 24px;
				height: 24px;
				border: 2px solid var(--background-modifier-border);
				border-radius: 4px;
				cursor: pointer;
				background-color: ${config.color};
				position: relative;
			`;
			button.title = config.name;
			
			button.addEventListener('click', async (e) => {
				// For mobile, restore selection from stored data if needed
				let currentSelection = selection;
				if (this.isMobile() && storedSelectionData && !window.getSelection()?.toString()) {
					// Recreate selection for mobile
					const newSelection = window.getSelection();
					if (newSelection) {
						newSelection.removeAllRanges();
						newSelection.addRange(storedSelectionData.range);
						currentSelection = newSelection;
					}
				}
				
				// Call the highlight callback
				await highlightClickCallback(e, currentSelection, config, button);
				
				// Clear selection only after highlight is created (mobile only)
				if (this.isMobile()) {
					setTimeout(() => {
						window.getSelection()?.removeAllRanges();
					}, 100);
				}
			});
			overlay.appendChild(button);
		});

		containerEl.appendChild(overlay);
		return overlay;
	}

	/**
	 * Hides the highlight overlay
	 */
	static hideHighlightOverlay(containerEl: HTMLElement): void {
		const existingOverlay = containerEl.querySelector('.epub-highlight-overlay');
		if (existingOverlay) {
			existingOverlay.remove();
		}
	}

	/**
	 * Shows loading state on highlight button
	 */
	static showLoadingState(button: HTMLButtonElement): void {
		button.style.opacity = '0.6';
		button.style.cursor = 'wait';
	}

	/**
	 * Shows success state on highlight button
	 */
	static showSuccessState(button: HTMLButtonElement): void {
		button.style.opacity = '1';
		button.style.cursor = 'pointer';
		button.innerHTML = '✓';
		button.style.color = 'white';
		button.style.fontSize = '14px';
		button.style.fontWeight = 'bold';
		
		setTimeout(() => {
			button.innerHTML = '';
		}, SUCCESS_FEEDBACK_DURATION);
	}

	/**
	 * Shows error state on highlight button
	 */
	static showErrorState(button: HTMLButtonElement, config: any): void {
		button.style.opacity = '1';
		button.style.cursor = 'pointer';
		button.innerHTML = '✗';
		button.style.color = 'white';
		button.style.fontSize = '14px';
		button.style.fontWeight = 'bold';
		
		setTimeout(() => {
			button.innerHTML = '';
			button.style.backgroundColor = config.color;
		}, ERROR_FEEDBACK_DURATION);
	}

	/**
	 * Shows annotation details (could be expanded for future features)
	 */
	static showAnnotationDetails(annotation: any): void {
		console.log('Annotation details:', annotation);
		// TODO: Could implement a tooltip or popup with annotation metadata
		// For now, just log to console for debugging
	}
}
