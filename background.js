console.log('Background script loading...');

// Load prompts from storage or use defaults
async function getPrompts() {
    const defaults = {
        improve: {
            system: "You are a helpful assistant that improves text while maintaining its original meaning.",
            user: (text) => `Please improve this text while maintaining its core message: ${text}`
        },
        professional: {
            system: "You are an expert in professional email writing.",
            user: (text) => `Please convert this text into a professional email format (only the body, no headers, no placeholders, no signature): ${text}`
        },
        proofread: {
            system: "You are a professional proofreader focusing on grammar, spelling, and punctuation.",
            user: (text) => `Please proofread this text and correct any errors: ${text}`
        },
        toArabic: {
            system: "You are a professional translator specializing in English to Arabic translation.",
            user: (text) => `Please translate this text to Arabic, maintaining the tone and meaning: ${text}`
        },
        toEnglish: {
            system: "You are a professional translator specializing in Arabic to English translation.",
            user: (text) => `Please translate this text to English, maintaining the tone and meaning: ${text}`
        },
        generateIdeas: {
            system: "You are a creative assistant that generates response ideas based on provided text.",
            user: (text) => `Based on this text, generate 3-5 different ways to respond. For each idea, provide a short title and a brief description of the response approach: ${text}`
        },
        linkedInIdeas: {
            system: "You are a professional networking assistant helping craft LinkedIn responses.",
            user: (text) => `You're helping me respond to a LinkedIn post or comment. I'll give you the post text, and you'll generate ideas for how I might respond in my own voice. Each idea should be written as an action I should take, starting with a verb in active voice, such as:

"Congratulate Alex on..."

"Show empathy about..."

"Express concern for..."

"Acknowledge the effort in..."

"Ask a follow-up about..."

"Share a personal insight related to..."

Do not write the actual reply yet—just list response ideas based on the post I provide. Assume I am speaking, not narrating about someone else. Keep the tone thoughtful, professional, and human.

Here's the post: ${text}`
        }
    };

    const stored = await chrome.storage.local.get('prompts');
    return stored.prompts || defaults;
}

// Create context menu items
function createContextMenu() {
    // Remove existing menu items first
    chrome.contextMenus.removeAll(() => {
        try {
            // Create parent menu
            chrome.contextMenus.create({
                id: "textImprover",
                title: "Text Improver",
                contexts: ["selection"]
            });

            // Create child menu items
            chrome.contextMenus.create({
                id: "improve",
                parentId: "textImprover",
                title: "✨ Improve Text",
                contexts: ["selection"]
            });

            chrome.contextMenus.create({
                id: "professional",
                parentId: "textImprover",
                title: "📨 Convert to E-mail",
                contexts: ["selection"]
            });

            chrome.contextMenus.create({
                id: "proofread",
                parentId: "textImprover",
                title: "📝 Proofread Only",
                contexts: ["selection"]
            });

            chrome.contextMenus.create({
                id: "generateIdeas",
                parentId: "textImprover",
                title: "💡 Generate Response Ideas",
                contexts: ["selection"]
            });

            chrome.contextMenus.create({
                id: "linkedInIdeas",
                parentId: "textImprover",
                title: "💼 LinkedIn Response Ideas",
                contexts: ["selection"]
            });

            chrome.contextMenus.create({
                id: "separator1",
                parentId: "textImprover",
                type: "separator",
                contexts: ["selection"]
            });

            chrome.contextMenus.create({
                id: "toArabic",
                parentId: "textImprover",
                title: "🔄 Translate to Arabic",
                contexts: ["selection"]
            });

            chrome.contextMenus.create({
                id: "toEnglish",
                parentId: "textImprover",
                title: "🔄 Translate to English",
                contexts: ["selection"]
            });

            console.log('Context menu created successfully');
        } catch (err) {
            console.error('Failed to create context menu:', err);
        }
    });
}

// Create menu immediately
createContextMenu();

// Also create menu when extension is installed/updated
chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed/updated');
    createContextMenu();
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    console.log('Context menu clicked', info);
    if (info.menuItemId && info.selectionText) {
        try {
            // First, inject the content script
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            });

            // Then get the API key and send the message
            const response = await chrome.storage.local.get(["apiKey", "model"]);
            if (!response.apiKey) {
                chrome.runtime.sendMessage({ error: "API_KEY_MISSING" });
                return;
            }

            // Get the appropriate prompt
            const prompts = await getPrompts();
            const prompt = prompts[info.menuItemId];
            if (!prompt) {
                throw new Error('Invalid action selected');
            }

            // Store the current operation data
            await chrome.storage.local.set({
                currentOperation: {
                    tabId: tab.id,
                    action: info.menuItemId,
                    text: info.selectionText,
                    apiKey: response.apiKey,
                    model: response.model,
                    systemPrompt: prompt.system,
                    userPrompt: prompt.user(info.selectionText)
                }
            });

            // Send message to content script
            chrome.tabs.sendMessage(tab.id, {
                text: info.selectionText,
                apiKey: response.apiKey,
                model: response.model,
                action: info.menuItemId,
                systemPrompt: prompt.system,
                userPrompt: prompt.user(info.selectionText)
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Message sending failed:', chrome.runtime.lastError);
                } else {
                    console.log('Message sent successfully');
                }
            });
        } catch (err) {
            console.error('Error:', err);
        }
    }
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Message received:', message);
    sendResponse({ received: true });
    return true;
});