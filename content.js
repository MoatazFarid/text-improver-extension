console.log('Content script loaded');

// Debug utilities
const DEBUG = true;
const log = (...args) => {
    if (DEBUG) console.log('[Text Improver]', ...args);
};
const error = (...args) => {
    if (DEBUG) console.error('[Text Improver]', ...args);
};

// Consolidate message listeners into a single listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    log('Content script received message', message.action || 'no action specified');
    
    if (message.action === 'generateResponseFromIdea' && message.idea && message.originalText) {
        generateResponseFromIdea(message, sendResponse);
        return true; // Keep the message channel open
    } else if (message.action === 'showTooltip' && message.text) {
        // Get the current selection position
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();

            // Show tooltip above the selected text
            createTooltip(message.text, {
                x: rect.left,
                y: rect.top - 10 // Position above the text
            });
        }
        sendResponse({ status: 'success' });
        return true;
    } else if (message.text) {
        if (message.action === 'generateIdeas' || message.action === 'linkedInIdeas') {
            generateIdeas(message, sendResponse);
        } else {
            improveText(message, sendResponse);
        }
        return true; // Keep the message channel open
    }
});

// Add tooltip functionality
function createTooltip(text, position, action = '') {
    // Remove any existing tooltip
    removeTooltip();

    const tooltip = document.createElement('div');
    tooltip.className = 'text-improver-tooltip';
    tooltip.setAttribute('data-action', action || 'default');
    
    let tooltipContent = `<span class="close">&times;</span>`;
    
    if (action === 'loading') {
        tooltipContent += `<div class="content">Generating response...</div>`;
    } else if (action === 'error') {
        tooltipContent += `<div class="content error-message">${text}</div>`;
    } else {
        tooltipContent += `
            <div class="content">${text}</div>
            <div class="actions">
                <button class="copy">Copy to Clipboard</button>
                <button class="replace">Replace Original</button>
            </div>
        `;
    }
    
    tooltip.innerHTML = tooltipContent;

    // Position the tooltip
    tooltip.style.left = `${position.x}px`;
    tooltip.style.top = `${position.y}px`;

    // Add event listeners
    tooltip.querySelector('.close').addEventListener('click', removeTooltip);
    
    if (action !== 'loading' && action !== 'error') {
        tooltip.querySelector('.copy').addEventListener('click', () => {
            navigator.clipboard.writeText(text)
                .then(() => {
                    const button = tooltip.querySelector('.copy');
                    button.textContent = 'Copied!';
                    setTimeout(() => {
                        button.textContent = 'Copy to Clipboard';
                    }, 2000);
                });
        });

        tooltip.querySelector('.replace').addEventListener('click', () => {
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                range.deleteContents();
                range.insertNode(document.createTextNode(text));
                removeTooltip();
            }
        });
    }

    // Make tooltip draggable
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;

    tooltip.addEventListener('mousedown', (e) => {
        if (e.target.tagName.toLowerCase() === 'button') return;
        isDragging = true;
        initialX = e.clientX - tooltip.offsetLeft;
        initialY = e.clientY - tooltip.offsetTop;
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;
        tooltip.style.left = `${currentX}px`;
        tooltip.style.top = `${currentY}px`;
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
    });

    document.body.appendChild(tooltip);
    
    // Add styles for error state if not already added
    if (!document.getElementById('tooltip-extra-styles')) {
        const style = document.createElement('style');
        style.id = 'tooltip-extra-styles';
        style.textContent = `
            .text-improver-tooltip .error-message {
                color: #d32f2f;
                font-weight: bold;
            }
        `;
        document.head.appendChild(style);
    }
}

function removeTooltip() {
    const existingTooltip = document.querySelector('.text-improver-tooltip');
    if (existingTooltip) {
        existingTooltip.remove();
    }
}

// Function to generate ideas for responses
async function generateIdeas(message, sendResponse) {
    try {
        log('Preparing API request for idea generation');
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${message.apiKey}`
            },
            body: JSON.stringify({
                model: message.model || "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: message.systemPrompt
                    },
                    {
                        role: "user",
                        content: message.userPrompt
                    }
                ],
                temperature: 0.8,
                max_tokens: 1000
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || 'API request failed');
        }

        const data = await response.json();
        if (data.choices && data.choices[0]?.message?.content) {
            const ideasText = data.choices[0].message.content.trim();
            
            // Store the original text for later use
            await chrome.storage.local.set({
                lastIdeasGeneration: {
                    original: message.text,
                    ideas: ideasText,
                    timestamp: Date.now()
                }
            });

            // Parse ideas into a structured format
            const parsedIdeas = parseIdeasFromText(ideasText);
            
            // Send the ideas to the popup
            chrome.runtime.sendMessage({ 
                ideas: parsedIdeas,
                originalText: message.text,
                status: 'success'
            });

            // Get the current selection position
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();

                // Show ideas tooltip above the selected text
                createIdeasTooltip(parsedIdeas, message.text, {
                    x: rect.left,
                    y: rect.top - 10 // Position above the text
                });
            }

            sendResponse({ 
                ideas: parsedIdeas,
                originalText: message.text,
                status: 'success'
            });
        }
    } catch (err) {
        error('Content script error:', err);
        sendResponse({ 
            error: err.message,
            status: 'error'
        });
    }
}

// Function to parse ideas from text
function parseIdeasFromText(text) {
    const ideas = [];
    
    // Split by numbered items or bullet points
    const lines = text.split('\n');
    let currentIdea = null;
    
    for (const line of lines) {
        // Check for numbered items or bullet points that might indicate a new idea
        const ideaMatch = line.match(/^(\d+[\.\):]|[\-\*•])?\s*(.+)$/);
        
        if (ideaMatch && (line.trim().startsWith('•') || line.trim().startsWith('-') || 
                         line.trim().startsWith('*') || /^\d+[\.\):]\s/.test(line.trim()))) {
            
            // If there's a previous idea being built, save it
            if (currentIdea && currentIdea.title) {
                ideas.push(currentIdea);
            }
            
            // Start a new idea
            currentIdea = {
                title: ideaMatch[2].trim(),
                description: '',
                fullText: line
            };
        } else if (currentIdea && line.trim()) {
            // Add to description of current idea
            if (currentIdea.description) {
                currentIdea.description += ' ' + line.trim();
            } else {
                currentIdea.description = line.trim();
            }
            currentIdea.fullText += '\n' + line;
        }
    }
    
    // Add the last idea if there is one
    if (currentIdea && currentIdea.title) {
        ideas.push(currentIdea);
    }
    
    // If we couldn't parse ideas properly, create a fallback
    if (ideas.length === 0) {
        ideas.push({
            title: 'Use this response',
            description: text.length > 50 ? text.substring(0, 50) + '...' : text,
            fullText: text
        });
    }
    
    return ideas;
}

// Function to create a tooltip with idea buttons
function createIdeasTooltip(ideas, originalText, position) {
    // Remove any existing tooltip
    removeTooltip();

    const tooltip = document.createElement('div');
    tooltip.className = 'text-improver-tooltip';
    tooltip.setAttribute('data-action', 'ideas');
    
    let tooltipContent = `
        <span class="close">&times;</span>
        <div class="content">
            <h3>Response Ideas</h3>
            <div class="ideas-list">
    `;
    
    // Add each idea as a button
    ideas.forEach((idea, index) => {
        tooltipContent += `
            <button class="idea-button" data-index="${index}">
                <span class="idea-title">${idea.title}</span>
                <span class="idea-description">${idea.description}</span>
            </button>
        `;
    });
    
    tooltipContent += `
            </div>
        </div>
    `;
    
    tooltip.innerHTML = tooltipContent;

    // Position the tooltip
    tooltip.style.left = `${position.x}px`;
    tooltip.style.top = `${position.y}px`;
    tooltip.style.width = '300px'; // Make it wider for ideas

    // Add event listeners
    tooltip.querySelector('.close').addEventListener('click', removeTooltip);
    
    // Add click handlers for idea buttons
    tooltip.querySelectorAll('.idea-button').forEach((button, index) => {
        button.addEventListener('click', () => {
            generateResponseFromIdea({
                idea: ideas[index],
                originalText: originalText
            });
        });
    });

    // Make tooltip draggable
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;

    tooltip.addEventListener('mousedown', (e) => {
        if (e.target.tagName.toLowerCase() === 'button' || e.target.closest('button')) return;
        isDragging = true;
        initialX = e.clientX - tooltip.offsetLeft;
        initialY = e.clientY - tooltip.offsetTop;
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;
        tooltip.style.left = `${currentX}px`;
        tooltip.style.top = `${currentY}px`;
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
    });

    document.body.appendChild(tooltip);
    
    // Add styles for idea buttons if not already added
    if (!document.getElementById('idea-button-styles')) {
        const style = document.createElement('style');
        style.id = 'idea-button-styles';
        style.textContent = `
            .text-improver-tooltip .ideas-list {
                max-height: 300px;
                overflow-y: auto;
                scrollbar-width: thin;
                scrollbar-color: #4CAF50 #f0f0f0;
            }
            
            .text-improver-tooltip .ideas-list::-webkit-scrollbar {
                width: 6px;
            }
            
            .text-improver-tooltip .ideas-list::-webkit-scrollbar-track {
                background: #f0f0f0;
                border-radius: 3px;
            }
            
            .text-improver-tooltip .ideas-list::-webkit-scrollbar-thumb {
                background: #4CAF50;
                border-radius: 3px;
            }
            
            .text-improver-tooltip .idea-button {
                display: block;
                width: 100%;
                padding: 10px 14px;
                margin-bottom: 10px;
                background-color: #f8f9fa;
                border: 1px solid #e9ecef;
                border-left: 3px solid #4CAF50;
                border-radius: 6px;
                text-align: left;
                cursor: pointer;
                transition: all 0.2s ease;
                color: #2c3e50;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
            }
            
            .text-improver-tooltip .idea-button:hover {
                background-color: #f1f9f1;
                border-color: #c8e6c9;
                transform: translateY(-1px);
                box-shadow: 0 3px 6px rgba(76, 175, 80, 0.1);
            }
            
            .text-improver-tooltip .idea-button:active {
                transform: translateY(0);
            }
            
            .text-improver-tooltip .idea-title {
                font-weight: 600;
                display: block;
                margin-bottom: 4px;
                color: #2e7d32;
            }
            
            .text-improver-tooltip .idea-description {
                font-size: 12px;
                color: #546e7a;
                display: block;
                line-height: 1.4;
            }
            
            /* Dark mode support */
            @media (prefers-color-scheme: dark) {
                .text-improver-tooltip .idea-button {
                    background-color: #2d3748;
                    border-color: #4a5568;
                    color: #e2e8f0;
                }
                
                .text-improver-tooltip .idea-button:hover {
                    background-color: #283141;
                    border-color: #68d391;
                }
                
                .text-improver-tooltip .idea-title {
                    color: #9ae6b4;
                }
                
                .text-improver-tooltip .idea-description {
                    color: #cbd5e0;
                }
            }
        `;
        document.head.appendChild(style);
    }
}

// Function to generate a response based on a selected idea
async function generateResponseFromIdea(message, sendResponse) {
    try {
        log('Generating response from selected idea');
        
        // Get API key from storage if not provided in the message
        let apiKey = message.apiKey;
        let model = message.model;
        
        if (!apiKey) {
            const storage = await chrome.storage.local.get(['apiKey', 'model', 'currentOperation']);
            apiKey = storage.apiKey;
            model = storage.model || "gpt-4o-mini";
            
            // If we have currentOperation data, use it
            if (storage.currentOperation) {
                apiKey = storage.currentOperation.apiKey || apiKey;
                model = storage.currentOperation.model || model;
            }
        }
        
        if (!apiKey) {
            throw new Error('API key is missing');
        }
        
        // Show loading indicator in tooltip
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            
            // Create or update tooltip with loading message
            createTooltip("Generating response...", {
                x: rect.left,
                y: rect.top - 10
            }, "loading");
        }
        
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    {
                        role: "system",
                        content: "You are a helpful assistant that generates responses based on the selected idea."
                    },
                    {
                        role: "user",
                        content: `Original text: "${message.originalText}"\n\nSelected idea: "${message.idea.title}${message.idea.description ? ' - ' + message.idea.description : ''}"\n\nGenerate a complete response not more than 50 words based on this idea.`
                    }
                ],
                temperature: 0.7,
                max_tokens: 1000
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || 'API request failed');
        }

        const data = await response.json();
        if (data.choices && data.choices[0]?.message?.content) {
            const improvedText = data.choices[0].message.content.trim();
            
            // Store the generated response
            await chrome.storage.local.set({
                lastImprovement: {
                    original: message.originalText,
                    improved: improvedText,
                    timestamp: Date.now()
                }
            });

            // Send the response to the popup if it's open
            chrome.runtime.sendMessage({ 
                improvedText: improvedText,
                status: 'success'
            });

            // Get the current selection position
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();

                // Show tooltip above the selected text
                createTooltip(improvedText, {
                    x: rect.left,
                    y: rect.top - 10 // Position above the text
                });
            }

            if (sendResponse) {
                sendResponse({ 
                    improvedText: improvedText,
                    status: 'success'
                });
            }
        }
    } catch (err) {
        error('Content script error:', err);
        
        // Show error in tooltip
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            
            createTooltip(`Error: ${err.message}`, {
                x: rect.left,
                y: rect.top - 10
            }, "error");
        }
        
        chrome.runtime.sendMessage({ 
            error: err.message,
            status: 'error'
        });
        
        if (sendResponse) {
            sendResponse({ 
                error: err.message,
                status: 'error'
            });
        }
    }
}

// Update the improveText function to show the tooltip
async function improveText(message, sendResponse) {
    try {
        log('Preparing API request');
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${message.apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: message.systemPrompt
                    },
                    {
                        role: "user",
                        content: message.userPrompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 1000
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || 'API request failed');
        }

        const data = await response.json();
        if (data.choices && data.choices[0]?.message?.content) {
            const improvedText = data.choices[0].message.content.trim();
            await chrome.storage.local.set({
                lastImprovement: {
                    original: message.text,
                    improved: improvedText,
                    timestamp: Date.now()
                }
            });

            // Get the current selection position
            const selection = window.getSelection();
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();

            // Show tooltip above the selected text
            createTooltip(improvedText, {
                x: rect.left,
                y: rect.top - 10 // Position above the text
            });

            sendResponse({ 
                improvedText: improvedText,
                status: 'success'
            });
        }
    } catch (err) {
        error('Content script error:', err);
        sendResponse({ 
            error: err.message,
            status: 'error'
        });
    }
} 