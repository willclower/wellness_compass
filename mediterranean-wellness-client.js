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
    assistant: this.currentAssistant,
    ...data,
    isRecipe: data.isRecipe !== undefined ? data.isRecipe : this.isRecipeResponse(messageText)
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
        const recipe = { 
            title: '', 
            summary: '', 
            ingredients: [], 
            instructions: [], 
            notes: '', 
            summary2: '', 
            tags: [],
            recipeInfo: ''
        };
        
        // Title
        const titleMatch = text.match(/^#\s+(.+)$/m);
        if (titleMatch) recipe.title = titleMatch[1].trim();
        
        // Introduction (first paragraph after title, before first ##)
        const summaryMatch = text.match(/^#[^\n]+\n+(.+?)(?=\n##)/s);
        if (summaryMatch) recipe.summary = summaryMatch[1].trim();
        
        // Ingredients
        const ingredientsSection = text.match(/##\s+What You'll Need\s*\n+([\s\S]+?)(?=\n##)/);
        if (ingredientsSection) {
            recipe.ingredients = ingredientsSection[1].split('\n')
                .map(line => line.trim())
                .filter(line => line.startsWith('-'))
                .map(line => line.replace(/^-\s*/, '').trim());
        }
        
        // Instructions
        const instructionsSection = text.match(/##\s+What To Do\s*\n+([\s\S]+?)(?=\n##)/);
        if (instructionsSection) {
            recipe.instructions = instructionsSection[1].split('\n')
                .map(line => line.trim())
                .filter(line => /^\d+\./.test(line))
                .map(line => line.replace(/^\d+\.\s*/, '').trim());
        }
        
        // Play With Your Food
        const notesSection = text.match(/##\s+Play With Your Food\s*\n+([\s\S]+?)(?=\n##|$)/);
        if (notesSection) {
            recipe.notes = notesSection[1].trim();
        }
        
        // Summary (closing)
        const summarySection = text.match(/##\s+Summary\s*\n+([\s\S]+?)(?=\n##|\n\*\*Tags|---)/);
        if (summarySection) {
            recipe.summary2 = summarySection[1].trim();
        }
        
        // Tags
        const tagsSection = text.match(/\*\*Tags:\*\*\s*\n([\s\S]+?)(?=---|##\s+Recipe Info|$)/);
        if (tagsSection) {
            recipe.tags = tagsSection[1].split('\n')
                .filter(line => line.trim().startsWith('-'))
                .map(line => line.replace(/^-\s*/, '').trim());
        }
        
        // Recipe Info - Parse into structured object
        const recipeInfoSection = text.match(/##\s+Recipe Info\s*\n+([\s\S]+?)$/);
        if (recipeInfoSection) {
            const infoText = recipeInfoSection[1];
            recipe.recipeInfo = {};
            
            // Extract servings - handle bold formatting
            const servingsMatch = infoText.match(/\*{0,2}Servings:\*{0,2}\s*(\d+)/i);
            if (servingsMatch) recipe.recipeInfo.servings = parseInt(servingsMatch[1]);
            
            // Extract prep time
            const prepMatch = infoText.match(/\*{0,2}Prep Time:\*{0,2}\s*(\d+)/i);
            if (prepMatch) recipe.recipeInfo.prep_time_minutes = parseInt(prepMatch[1]);
            
            // Extract cook time
            const cookMatch = infoText.match(/\*{0,2}Cook Time:\*{0,2}\s*(\d+)/i);
            if (cookMatch) recipe.recipeInfo.cook_time_minutes = parseInt(cookMatch[1]);
            
            // Extract total time
            const totalMatch = infoText.match(/\*{0,2}Total Time:\*{0,2}\s*(\d+)/i);
            if (totalMatch) recipe.recipeInfo.total_time_minutes = parseInt(totalMatch[1]);
            
            // Extract calories
            const caloriesMatch = infoText.match(/\*{0,2}Calories:\*{0,2}\s*(\d+)/i);
            if (caloriesMatch) recipe.recipeInfo.calories_per_serving = parseInt(caloriesMatch[1]);
            
            // Extract dietary tags
            const dietaryMatch = infoText.match(/\*{0,2}Dietary Tags:\*{0,2}\s*(.+)$/m);
            if (dietaryMatch) {
                recipe.recipeInfo.dietary_tags = dietaryMatch[1]
                    .split(',')
                    .map(tag => tag.trim())
                    .filter(tag => tag.length > 0);
            }
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
