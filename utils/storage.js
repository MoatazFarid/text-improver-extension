import { log, error } from './debug.js';

export const saveToStorage = async (data) => {
    try {
        log('Saving to storage:', Object.keys(data));
        await new Promise((resolve, reject) => {
            chrome.storage.local.set(data, () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve();
                }
            });
        });
        log('Save successful');
        return true;
    } catch (err) {
        error('Storage save failed:', err);
        throw err;
    }
};

export const loadFromStorage = async (keys) => {
    try {
        log('Loading from storage:', keys);
        const data = await new Promise((resolve, reject) => {
            chrome.storage.local.get(keys, (result) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(result);
                }
            });
        });
        log('Load successful:', Object.keys(data));
        return data;
    } catch (err) {
        error('Storage load failed:', err);
        throw err;
    }
}; 