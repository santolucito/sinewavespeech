/**
 * Main.js - Application bootstrap
 *
 * Initializes the sinewave speech demo application.
 */
import { FormantPlayer } from './formant-player.js';
import { UIController } from './ui-controller.js';

async function init() {
    try {
        // Create player and UI controller
        const player = new FormantPlayer();
        const ui = new UIController(player);

        // Initialize the application
        await ui.initialize();

        console.log('Sinewave Speech Demo initialized');
    } catch (error) {
        console.error('Failed to initialize:', error);

        // Show error to user
        const container = document.querySelector('.introduction');
        if (container) {
            container.innerHTML = `
                <p style="color: #e63946;">
                    Failed to initialize the demo: ${error.message}
                </p>
                <p style="color: #a0a0b0; font-size: 0.9rem; margin-top: 1rem;">
                    Please ensure you're using a modern browser with Web Audio API support.
                </p>
            `;
        }
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
