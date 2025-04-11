document.addEventListener('DOMContentLoaded', async () => {
    const loading = document.getElementById('loading');
    const result = document.getElementById('result');
    const error = document.getElementById('error');
    const ideasContainer = document.getElementById('ideas-container');
    const ideasList = document.getElementById('ideas-list');

    loading.style.display = 'block';
    result.style.display = 'none';
    error.style.display = 'none';
    ideasContainer.style.display = 'none';

    // Check if we have stored popup data
    try {
        const data = await chrome.storage.local.get('currentPopup');
        if (data.currentPopup && data.currentPopup.action === 'generateIdeas') {
            // We need to request idea generation for the stored text
            const popupData = data.currentPopup;
            
            // Make API request directly from popup
            try {
                const response = await fetch("https://api.openai.com/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${popupData.apiKey}`
                    },
                    body: JSON.stringify({
                        model: popupData.model || "gpt-4o-mini",
                        messages: [
                            {
                                role: "system",
                                content: popupData.systemPrompt
                            },
                            {
                                role: "user",
                                content: popupData.userPrompt
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
                    
                    // Display the ideas
                    displayIdeas(ideasText, popupData.text);
                    loading.style.display = 'none';
                    ideasContainer.style.display = 'block';
                }
            } catch (err) {
                console.error('Error making API request:', err);
                error.textContent = 'Failed to generate ideas: ' + err.message;
                error.style.display = 'block';
                loading.style.display = 'none';
            }
        } else {
            // No stored data or not idea generation
            error.textContent = 'No text selected for generating ideas';
            error.style.display = 'block';
            loading.style.display = 'none';
        }
    } catch (err) {
        console.error('Error getting stored popup data:', err);
        error.textContent = 'Failed to initialize: ' + err.message;
        error.style.display = 'block';
        loading.style.display = 'none';
    }

    chrome.runtime.onMessage.addListener((message) => {
        console.log('Popup received message:', message);
        loading.style.display = 'none';
        
        if (message.error) {
            error.textContent = message.error;
            error.style.display = 'block';
            result.style.display = 'none';
            ideasContainer.style.display = 'none';
        } else if (message.ideas) {
            // Handle ideas display
            displayIdeas(message.ideas, message.originalText);
            result.style.display = 'none';
            ideasContainer.style.display = 'block';
            error.style.display = 'none';
        } else if (message.improvedText) {
            result.textContent = message.improvedText;
            result.style.display = 'block';
            ideasContainer.style.display = 'none';
            error.style.display = 'none';
        }
    });

    // Function to display ideas as buttons
    function displayIdeas(ideas, originalText) {
        ideasList.innerHTML = ''; // Clear previous ideas
        
        // Parse ideas if they're in string format
        let parsedIdeas = ideas;
        if (typeof ideas === 'string') {
            // Try to extract ideas from the text
            parsedIdeas = extractIdeasFromText(ideas);
        }
        
        // Create a button for each idea
        parsedIdeas.forEach(idea => {
            const button = document.createElement('button');
            button.className = 'idea-button';
            
            const titleSpan = document.createElement('span');
            titleSpan.className = 'idea-title';
            titleSpan.textContent = idea.title;
            
            const descSpan = document.createElement('span');
            descSpan.className = 'idea-description';
            descSpan.textContent = idea.description;
            
            button.appendChild(titleSpan);
            button.appendChild(descSpan);
            
            // Add click event to generate response based on this idea
            button.addEventListener('click', () => {
                generateResponseFromIdea(idea, originalText);
            });
            
            ideasList.appendChild(button);
        });
    }
    
    // Function to extract ideas from text response
    function extractIdeasFromText(text) {
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
    
    // Function to generate a response based on the selected idea
    functiongenerateResponseFromIdea(idea, originalText) {
        // Show loading state
        loading.style.display = 'block';
        ideasContainer.style.display = 'none';
        
        // Get the current tab from storage
        chrome.storage.local.get('currentPopup', async (data) => {
            if (chrome.runtime.lastError || !data.currentPopup) {
                console.error('Error getting tab info:', chrome.runtime.lastError);
                error.textContent = 'Failed to get tab information';
                error.style.display = 'block';
                loading.style.display = 'none';
                return;
            }
            
            const popupData = data.currentPopup;
            
            // Make API request directly from popup
            try {
                const response = await fetch("https://api.openai.com/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${popupData.apiKey}`
                    },
                    body: JSON.stringify({
                        model: popupData.model || "gpt-4o-mini",
                        messages: [
                            {
                                role: "system",
                                content: "You are a helpful assistant that generates responses based on the selected idea."
                            },
                            {
                                role: "user",
                                content: `You're helping me write a reply to a LinkedIn post or comment. I'll give you the post text and optionally a response idea (like "Congratulate Alex on his promotion"). Based on that:

Write the actual reply as if I'm the one talking. Use active voice, natural tone, and make it sound authentic.

If the original post is in Arabic, reply in Egyptian Arabic.

If the original post is in English, reply in English.

You can use emojis, line breaks, and friendly formatting to make it feel more conversational and human.

Keep it relevant and thoughtful, but not overly formal.

Only write the reply text — no extra explanation.

Original post: "${originalText || popupData.text}"
${idea ? `Response idea: "${idea.description}"` : ''}`
                                // content: `Original text: "${originalText || popupData.text}"\n\nSelected idea: "${idea.title}${idea.description ? ' - ' + idea.description : ''}"\n\nGenerate a complete response of max 50 words based on this idea.`
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
                    const generatedText = data.choices[0].message.content.trim();
                    
                    // Display the generated response
                    result.textContent = generatedText;
                    result.style.display = 'block';
                    ideasContainer.style.display = 'none';
                    loading.style.display = 'none';
                    
                    // Send the response to the content script to display tooltip
                    chrome.tabs.sendMessage(popupData.tabId, {
                        action: 'showTooltip',
                        text: generatedText
                    });
                }
            } catch (err) {
                console.error('Error making API request:', err);
                error.textContent = 'Failed to generate response: ' + err.message;
                error.style.display = 'block';
                loading.style.display = 'none';
            }
        });
    }
});