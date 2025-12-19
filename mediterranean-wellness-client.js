/**
 * Mediterranean Wellness API Client
 * Connects frontend to n8n Cloud backend
 */

class MediterraneanWellnessClient {
    constructor(baseUrl) {
        this.baseUrl = baseUrl || 'https://willclower.app.n8n.cloud';
        this.userToken = localStorage.getItem('mw_token');
        this.currentAssistant = localStorage.getItem('mw_assistant') || 'nona';
        this.userId = localStorage.getItem('mw_user_id') || this.generateTempUserId();
    }

    /**
     * Generate temporary user ID for testing (before auth is implemented)
     */
    generateTempUserId() {
        const tempId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('mw_user_id', tempId);
        return tempId;
    }

    /**
     * Send a chat message to the current assistant
     */
    async sendMessage(message) {
        try {
            const response = await fetch(`${this.baseUrl}/webhook/chat-message`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.userToken && { 'Authorization': `Bearer ${this.userToken}` })
                },
                body: JSON.stringify({
                    user_id: this.userId,
                    assistant_id: this.currentAssistant,
                    message: message,
                    timestamp: new Date().toISOString()
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return {
                success: true,
                message: data.message || data.response || data.assistant_message,
                assistant: this.currentAssistant,
                ...data
            };

        } catch (error) {
            console.error('Send message error:', error);
            return {
                success: false,
                error: error.message,
                message: 'Unable to connect to assistant. Please try again.'
            };
        }
    }

    /**
     * Switch to a different assistant
     */
    async switchAssistant(assistantId) {
        try {
            const response = await fetch(`${this.baseUrl}/webhook/select-assistant`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.userToken && { 'Authorization': `Bearer ${this.userToken}` })
                },
                body: JSON.stringify({
                    user_id: this.userId,
                    assistant_id: assistantId
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            
            if (data.success !== false) {
                this.currentAssistant = assistantId;
                localStorage.setItem('mw_assistant', assistantId);
            }

            return {
                success: true,
                assistant: {
                    id: assistantId,
                    name: this.getAssistantName(assistantId),
                    greeting: data.greeting || this.getDefaultGreeting(assistantId)
                },
                ...data
            };

        } catch (error) {
            console.error('Switch assistant error:', error);
            
            // Fallback: still switch locally even if webhook fails
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
    }

    /**
     * Register a new user (for when auth is implemented)
     */
    async register(email, name, preferences) {
        try {
            const response = await fetch(`${this.baseUrl}/webhook/register-user`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, name, preferences })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            
            if (data.success && data.token) {
                this.userToken = data.token;
                this.userId = data.user_id;
                localStorage.setItem('mw_token', data.token);
                localStorage.setItem('mw_user_id', data.user_id);
            }

            return data;

        } catch (error) {
            console.error('Registration error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Update user preferences
     */
    async updatePreferences(preferences) {
        try {
            const response = await fetch(`${this.baseUrl}/webhook/update-preferences`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.userToken && { 'Authorization': `Bearer ${this.userToken}` })
                },
                body: JSON.stringify({
                    user_id: this.userId,
                    preferences: preferences
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();

        } catch (error) {
            console.error('Update preferences error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get message history
     */
    async getMessageHistory(limit = 50) {
        try {
            const response = await fetch(
                `${this.baseUrl}/webhook/message-history?user_id=${this.userId}&limit=${limit}`,
                {
                    headers: {
                        ...(this.userToken && { 'Authorization': `Bearer ${this.userToken}` })
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();

        } catch (error) {
            console.error('Get message history error:', error);
            return {
                success: false,
                messages: [],
                error: error.message
            };
        }
    }

    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        return !!this.userToken && !this.isTokenExpired();
    }

    /**
     * Check if JWT token is expired
     */
    isTokenExpired() {
        if (!this.userToken) return true;
        
        try {
            const payload = JSON.parse(atob(this.userToken.split('.')[1]));
            return payload.exp * 1000 < Date.now();
        } catch (e) {
            return true;
        }
    }

    /**
     * Logout user
     */
    logout() {
        localStorage.removeItem('mw_token');
        localStorage.removeItem('mw_user_id');
        localStorage.removeItem('mw_assistant');
        this.userToken = null;
        this.userId = null;
    }

    /**
     * Helper: Get assistant display name
     */
    getAssistantName(assistantId) {
        const names = {
            'nona': 'Nona',
            'dundee': 'Dundee',
            'chiara': 'Chiara',
            'lina': 'Lina'
        };
        return names[assistantId] || assistantId;
    }

    /**
     * Helper: Get default greeting for assistant
     */
    getDefaultGreeting(assistantId) {
        const greetings = {
            'nona': 'Ciao bella! Ready to cook something delicious today?',
            'dundee': 'Hey there! Ready to crush your workout today?',
            'chiara': 'Welcome. Let\'s find some peace together.',
            'lina': 'Hi! Let\'s create a nutrition plan that works for you.'
        };
        return greetings[assistantId] || 'Hello! How can I help you today?';
    }

    /**
     * Get current assistant ID
     */
    getCurrentAssistant() {
        return this.currentAssistant;
    }

    /**
     * Get current user ID
     */
    getUserId() {
        return this.userId;
    }
}

// Initialize global client instance
window.MWClient = new MediterraneanWellnessClient();

console.log('Mediterranean Wellness Client initialized');
console.log('User ID:', window.MWClient.getUserId());
console.log('Current Assistant:', window.MWClient.getCurrentAssistant());
