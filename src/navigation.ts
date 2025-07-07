export class EpubNavigation {
	
	/**
	 * Navigates to a specific CFI location in the EPUB
	 */
	static async navigateToCfi(cfi: string, spineItems: any, renderPageCallback: (index: number) => Promise<void>): Promise<void> {
		try {
			// Find which spine item contains this CFI by finding the best match
			let bestMatch = -1;
			let bestMatchLength = 0;
			
			for (let i = 0; i < spineItems.length; i++) {
				const item = spineItems[i];
				const itemCfi = item.cfiBase;
				
				// Check if the saved CFI starts with this spine item's CFI
				// and if this is a better (longer) match than what we found before
				if (cfi.startsWith(itemCfi) && itemCfi.length > bestMatchLength) {
					bestMatch = i;
					bestMatchLength = itemCfi.length;
				}
			}
			
			if (bestMatch !== -1) {
				console.log('Found CFI in spine item:', bestMatch, spineItems[bestMatch].cfiBase);
				await renderPageCallback(bestMatch);
			} else {
				// If CFI not found, start from beginning
				console.warn('CFI not found, starting from beginning');
				await renderPageCallback(0);
			}
		} catch (error) {
			console.error('Error navigating to CFI:', error);
			await renderPageCallback(0);
		}
	}

	/**
	 * Handles navigation to the next page
	 */
	static handleNext(currentIndex: number, spineItems: any, renderPageCallback: (index: number) => Promise<void>): void {
		if (currentIndex < spineItems.length - 1) {
			renderPageCallback(currentIndex + 1);
		}
	}

	/**
	 * Handles navigation to the previous page
	 */
	static handlePrevious(currentIndex: number, spineItems: any, renderPageCallback: (index: number) => Promise<void>): void {
		if (currentIndex > 0) {
			renderPageCallback(currentIndex - 1);
		}
	}

	/**
	 * Updates navigation button states based on current position
	 */
	static updateNavigationState(currentIndex: number, spineItems: any, containerEl: HTMLElement): void {
		const prevBtn = containerEl.querySelector('#prev-btn') as HTMLButtonElement;
		const nextBtn = containerEl.querySelector('#next-btn') as HTMLButtonElement;
		const chapterInfo = containerEl.querySelector('#chapter-info');

		if (prevBtn) prevBtn.disabled = currentIndex === 0;
		if (nextBtn) nextBtn.disabled = currentIndex === spineItems.length - 1;
		if (chapterInfo) chapterInfo.textContent = `${currentIndex + 1} / ${spineItems.length}`;
	}

	/**
	 * Navigates to a specific highlight by CFI
	 */
	static async navigateToHighlight(cfi: string, spineItems: any, renderPageCallback: (index: number) => Promise<void>): Promise<void> {
		try {
			await this.navigateToCfi(cfi, spineItems, renderPageCallback);
			// TODO: In future, we could also scroll to the exact position within the page
			// using the CFI to identify the specific range and scroll to it
		} catch (error) {
			console.error('Error navigating to highlight:', error);
		}
	}
}
