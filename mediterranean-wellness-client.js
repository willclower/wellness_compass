/**
 * Mediterranean Wellness API Client
 * Connects frontend to n8n Cloud backend
 */

class MediterraneanWellnessClient {
    constructor(baseUrl) {
        this.baseUrl = baseUrl || 'https://willclower.app.n8n.cloud/webhook';
        this.userToken = localStorage.getItem('mw_token');
        this.currentAssistant = localStorage.getItem('mw_assistant') || 'nona';
        this.userId = localStorage.getItem('mw_user_id') || this.generateTempUserId();
    }

    generateTempUserId() {
        const tempId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('mw_user_id', tempId);
        return tempId;
    }

    async sendMessage(message) {
        try {
            const webhookPath = `${this.currentAssistant}_chat`;
            
            const response = await fetch(`${this.baseUrl}/${webhookPath}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chatInput: message,
                    userId: this.userId,
                    sessionId: this.userId,
                    userName: 'User'
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const text = await response.text();
            
            let data;
            try {
                data = JSON.parse(text);
                const messageText = data.message || data.response || data.text || text;
                
                return {
                    success: true,
                    message: messageText,
                    isRecipe: this.isRecipeResponse(messageText),
                    assistant: this.currentAssistant,
                    ...data
                };
            } catch (e) {
                return {
                    success: true,
                    message: text,
                    isRecipe: this.isRecipeResponse(text),
                    assistant: this.currentAssistant
                };
            }

        } catch (error) {
            console.error('Send message error:', error);
            return {
                success: false,
                error: error.message,
                message: 'Unable to connect to assistant. Please try again.'
            };
        }
    }

    isRecipeResponse(text) {
        const markers = ['## What You\'ll Need', '## What To Do', '# What You\'ll Need', '# What To Do'];
        return markers.some(m => text.includes(m));
    }

    parseRecipe(text) {
        const recipe = { title: '', summary: '', ingredients: [], instructions: [], notes: [], tags: [] };
        
        const titleMatch = text.match(/^#\s+(.+)$/m);
        if (titleMatch) recipe.title = titleMatch[1].trim();
        
        const summaryMatch = text.match(/^#.+\n\n(.+?)\n\n##/s);
        if (summaryMatch) recipe.summary = summaryMatch[1].trim();
        
        const ingredientsSection = text.match(/##\s+What You'll Need\s*\n([\s\S]+?)(?=\n##|$)/);
        if (ingredientsSection) {
            recipe.ingredients = ingredientsSection[1].split('\n')
                .filter(line => line.trim().startsWith('-'))
                .map(line => line.replace(/^#\s*/, '').trim());
        }
        
        const instructionsSection = text.match(/##\s+What To Do\s*\n([\s\S]+?)(?=\n##|$)/);
        if (instructionsSection) {
            recipe.instructions = instructionsSection[1].split('\n')
                .filter(line => /^\d+\./.test(line.trim()))
                .map(line => line.replace(/^\d+\.\s*/, '').trim());
        }
        
        const notesSection = text.match(/##\s+Notes\s*\n([\s\S]+?)(?=\n##|\n\*\*Tags|$)/);
        if (notesSection) {
            recipe.notes = notesSection[2].split('\n')
                .filter(line => line.trim().startsWith('-'))
                .map(line => line.replace(/^-\s*/, '').trim());
        }

        const summarySection = text.match(/##\s+Summary\s*\n([\s\S]+?)(?=\n##|\n\*\*Tags|$)/);
if (summarySection) {
    recipe.summary2 = summarySection[1].trim(); // Store closing summary separately
}  
        const tagsSection = text.match(/\*\*Tags:\*\*\s*\n([\s\S]+?)$/);
        if (tagsSection) {
            recipe.tags = tagsSection[1].split('\n')
                .filter(line => line.trim().startsWith('-'))
                .map(line => line.replace(/^-\s*/, '').trim());
        }
        
        return recipe;
    }

    async switchAssistant(assistantId) {
        this.currentAssistant = assistantId;
        localStorage.setItem('mw_assistant', assistantId);
        
        return {
            success: true,
            assistant: {
                id: assistantId,
                name: this.getAssistantName(assistantId),
                greeting: this.getDefaultGreeting(assistantId)
            }
        };
    }

    async register(email, name, preferences) {
        try {
            const response = await fetch(`${this.baseUrl}/register-user`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, name, preferences })
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            
            if (data.success && data.token) {
                this.userToken = data.token;
                this.userId = data.user_id;
                localStorage.setItem('mw_token', data.token);
                localStorage.setItem('mw_user_id', data.user_id);
            }

            return data;
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async updatePreferences(preferences) {
        try {
            const response = await fetch(`${this.baseUrl}/update-preferences`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.userToken && { 'Authorization': `Bearer ${this.userToken}` })
                },
                body: JSON.stringify({ user_id: this.userId, preferences })
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async getMessageHistory(limit = 50) {
        try {
            const response = await fetch(
                `${this.baseUrl}/message-history?user_id=${this.userId}&limit=${limit}`,
                { headers: { ...(this.userToken && { 'Authorization': `Bearer ${this.userToken}` }) } }
            );

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            return { success: false, messages: [], error: error.message };
        }
    }

    isAuthenticated() {
        return !!this.userToken && !this.isTokenExpired();
    }

    isTokenExpired() {
        if (!this.userToken) return true;
        try {
            const payload = JSON.parse(atob(this.userToken.split('.')[1]));
            return payload.exp * 1000 < Date.now();
        } catch (e) {
            return true;
        }
    }

    logout() {
        localStorage.removeItem('mw_token');
        localStorage.removeItem('mw_user_id');
        localStorage.removeItem('mw_assistant');
        this.userToken = null;
        this.userId = null;
    }

    getAssistantName(assistantId) {
        const names = { 'nona': 'Nona', 'dundee': 'Dundee', 'chiara': 'Chiara', 'lina': 'Lina' };
        return names[assistantId] || assistantId;
    }

    getDefaultGreeting(assistantId) {
        const greetings = {
            'nona': 'Ciao bella! Ready to cook something delicious today?',
            'dundee': 'Hey there! Ready to crush your workout today?',
            'chiara': 'Welcome. Let us find some peace together.',
            'lina': 'Hi! Let us create a nutrition plan that works for you.'
        };
        return greetings[assistantId] || 'Hello! How can I help you today?';
    }

    getCurrentAssistant() { return this.currentAssistant; }
    getUserId() { return this.userId; }
}

window.MWClient = new MediterraneanWellnessClient();
console.log('MW Client initialized - User:', window.MWClient.getUserId(), 'Assistant:', window.MWClient.getCurrentAssistant());
