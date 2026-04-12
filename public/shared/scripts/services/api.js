/**
 * HTTP client for the media-manager server.
 */
export default class Api {

    // --- public: config ---

    static async getConfig() {
        const response = await fetch(`${this._BASE_URL}/config`);
        return this._parseResponse(response);
    }

    // --- public: job actions ---

    static async startJob(jobType, args = {}) {
        const response = await fetch(`${this._BASE_URL}/jobs/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ job_type: jobType, ...args }),
        });
        return this._parseResponse(response);
    }

    static async pauseJob(jobId) {
        return this._postJob(`${jobId}/pause`);
    }

    static async resumeJob(jobId) {
        return this._postJob(`${jobId}/resume`);
    }

    static async abortJob(jobId) {
        return this._postJob(`${jobId}/abort`);
    }

    static async dismissJob(jobId) {
        return this._postJob(`${jobId}/dismiss`);
    }

    /** Opens an SSE stream for real-time job updates. Returns a close function. */
    static openJobsStream(onMessage, onError) {
        console.log('[api] opening jobs stream');
        const source = new EventSource(`${this._BASE_URL}/jobs/stream`);
        source.onmessage = (event) => {
            // Silently ignore malformed payloads to keep the stream alive.
            try {
                onMessage(JSON.parse(event.data));
            } catch {
            }
        };
        if (onError) {
            source.onerror = onError;
        }
        return () => {
            console.log('[api] closing jobs stream');
            source.close();
        };
    }

    // --- public: data ---

    static async getMediaCsv() {
        const response = await fetch('/data/media.csv');
        if (!response.ok) {
            throw new Error(String(response.status));
        }
        return response.text();
    }

    static async getLastScan() {
        const response = await fetch('/data/last-scan');
        return response.text();
    }

    // --- public: debug ---

    static async deleteMediaCsv() {
        const response = await fetch(`${this._BASE_URL}/debug/csv`, {method: 'DELETE'});
        return this._parseResponse(response);
    }

    // --- private ---

    static _BASE_URL = '/api';

    static async _postJob(path) {
        const response = await fetch(`${this._BASE_URL}/jobs/${path}`, {method: 'POST'});
        return this._parseResponse(response);
    }

    /** Parses a JSON response body. Throws on non-2xx with the server's error message. */
    static async _parseResponse(response) {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            console.error(`[api] request failed (${response.status}):`, data.error || 'no message');
            throw new Error(data.error || `HTTP ${response.status}`);
        }
        return data;
    }
}
