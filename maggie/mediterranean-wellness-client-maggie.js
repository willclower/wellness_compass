/**
 * Mediterranean Wellness API Client — Maggie
 * Nutrition guide. Transport + text only.
 * Cloned from the Nona client; all recipe/parse/YUM machinery removed.
 * currentAssistant is hardcoded to 'maggie' (this client is Maggie's page only).
 */

class MaggieWellnessClient {
    constructor(baseUrl) {
        this.baseUrl = baseUrl || 'https://n8n-admin.willclower.com/webhook';
        this.userToken = localStorage.getItem('mw_token');
        this.currentAssistant = 'maggie';
        this.userId = localStorage.getItem('mw_user_id') || this.generateTempUserId();
        this.sessionId = this.generateSessionId();
    }

    generateTempUserId() {
        const tempId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('mw_user_id', tempId);
        return tempId;
    }

    generateSessionId() {
        // Daily session: resets each calendar day so chat memory stays fresh
        const today = new Date().toISOString().split('T')[0];
        return this.userId + '_' + today;
    }

    async sendMessage(message, proactiveLogId = null, signal = null) {
        try {
            const webhookPath = `${this.currentAssistant}_chat`; // -> maggie_chat

            const response = await fetch(`${this.baseUrl}/${webhookPath}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chatInput: message,
                    userId: this.userId,
                    sessionId: this.sessionId,
                    userName: 'User',
                    ...(proactiveLogId && { loadProactive: true, proactive_log_id: proactiveLogId })
                }),
                ...(signal && { signal })
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
                    ...data,
                    message: messageText,
                    assistant: this.currentAssistant
                };
            } catch (e) {
                return {
                    success: true,
                    message: text,
                    assistant: this.currentAssistant
                };
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                return { success: false, aborted: true, message: '' };
            }
            console.error('Send message error:', error);
            return {
                success: false,
                error: error.message,
                message: 'Something went wrong on my end. Try that again in a moment.'
            };
        }
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
        this.userToken = null;
        this.userId = null;
    }

    getDefaultGreeting() {
        return 'Hi, I\u2019m Maggie. What would you like to work on with your nutrition today?';
    }

    getCurrentAssistant() { return this.currentAssistant; }
    getUserId() { return this.userId; }
}

window.MWClient = new MaggieWellnessClient();
console.log('Maggie Client initialized - User:', window.MWClient.getUserId(), 'Session:', window.MWClient.sessionId, 'Assistant:', window.MWClient.getCurrentAssistant());
